/**
 * Encrypted finance vault (at-rest).
 * AES-GCM + PBKDF2 — passphrase never stored; only an encrypted blob lives on disk.
 * Unlocked key stays in RAM for this tab only. Lock clears it.
 *
 * Protects: localStorage dumps, stolen laptop browse of plain JSON, casual snoop.
 * Does NOT stop: malware watching you type the passphrase, or someone who has both
 * the blob and your passphrase. Still lock the Mac when you leave.
 */

import type { FinanceState } from "./financeStore";

const VAULT_KEY = "wonder-finance-vault-v1";
const PLAIN_KEY = "wonder-finance-v2";
const PLAIN_KEY_V1 = "wonder-finance-v1";

const PBKDF2_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export type VaultEnvelope = {
  v: 1;
  enc: true;
  kdf: "PBKDF2";
  algo: "AES-GCM";
  iter: number;
  salt: string; // base64
  iv: string; // base64
  ct: string; // base64 ciphertext
};

/** In-memory only — never written to disk */
let sessionKey: CryptoKey | null = null;
let sessionUnlocked = false;

function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64decode(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return buf;
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptState(
  state: FinanceState,
  key: CryptoKey
): Promise<VaultEnvelope> {
  const iv = randomBytes(IV_BYTES);
  const plain = new TextEncoder().encode(JSON.stringify({ ...state, version: 2 }));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  // salt is stored on the envelope at setup — here we only produce iv+ct if salt known
  // caller merges salt
  return {
    v: 1,
    enc: true,
    kdf: "PBKDF2",
    algo: "AES-GCM",
    iter: PBKDF2_ITERATIONS,
    salt: "", // filled by caller
    iv: b64encode(iv),
    ct: b64encode(ct),
  };
}

async function decryptState(
  envelope: VaultEnvelope,
  key: CryptoKey
): Promise<FinanceState> {
  const iv = b64decode(envelope.iv);
  const ct = b64decode(envelope.ct);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ct
  );
  const parsed = JSON.parse(new TextDecoder().decode(plain)) as FinanceState;
  return { ...parsed, version: 2 };
}

function readEnvelope(): VaultEnvelope | null {
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VaultEnvelope;
    if (!parsed?.enc || parsed.v !== 1 || !parsed.ct || !parsed.salt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeEnvelope(env: VaultEnvelope) {
  localStorage.setItem(VAULT_KEY, JSON.stringify(env));
}

/** Wipe any unencrypted finance keys from this browser */
export function wipePlainFinanceKeys() {
  try {
    localStorage.removeItem(PLAIN_KEY);
    localStorage.removeItem(PLAIN_KEY_V1);
  } catch {
    /* ignore */
  }
}

export function hasEncryptedVault(): boolean {
  return Boolean(readEnvelope());
}

export function hasPlainFinance(): boolean {
  try {
    return Boolean(
      localStorage.getItem(PLAIN_KEY) || localStorage.getItem(PLAIN_KEY_V1)
    );
  } catch {
    return false;
  }
}

export function isVaultUnlocked(): boolean {
  return sessionUnlocked && sessionKey != null;
}

/** Clear the key from RAM — data stays encrypted on disk */
export function lockVault() {
  sessionKey = null;
  sessionUnlocked = false;
}

/**
 * Create vault from current plain state + passphrase.
 * Removes all plain finance JSON after success.
 */
export async function setupVault(
  passphrase: string,
  state: FinanceState
): Promise<void> {
  if (!passphrase || passphrase.length < 8) {
    throw new Error("Passphrase must be at least 8 characters.");
  }
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  const partial = await encryptState(state, key);
  const env: VaultEnvelope = {
    ...partial,
    salt: b64encode(salt),
    iter: PBKDF2_ITERATIONS,
  };
  writeEnvelope(env);
  wipePlainFinanceKeys();
  sessionKey = key;
  sessionUnlocked = true;
}

/** Unlock existing vault. Wrong passphrase throws. */
export async function unlockVault(passphrase: string): Promise<FinanceState> {
  const env = readEnvelope();
  if (!env) throw new Error("No encrypted vault found.");
  const salt = b64decode(env.salt);
  const key = await deriveKey(
    passphrase,
    salt,
    env.iter || PBKDF2_ITERATIONS
  );
  try {
    const state = await decryptState(env, key);
    sessionKey = key;
    sessionUnlocked = true;
    return state;
  } catch {
    sessionKey = null;
    sessionUnlocked = false;
    throw new Error("Wrong passphrase — vault stays locked.");
  }
}

/** Save while unlocked. No-op if locked (never writes plain). */
export async function saveVault(state: FinanceState): Promise<void> {
  if (!sessionKey || !sessionUnlocked) {
    throw new Error("Vault is locked — unlock to save.");
  }
  const env = readEnvelope();
  if (!env?.salt) throw new Error("Vault envelope missing — set up encryption again.");
  const partial = await encryptState(state, sessionKey);
  writeEnvelope({
    ...partial,
    salt: env.salt,
    iter: env.iter || PBKDF2_ITERATIONS,
  });
  // Keep wiping plain if anything reappeared
  wipePlainFinanceKeys();
}

/** Change passphrase while unlocked */
export async function changeVaultPassphrase(
  currentPass: string,
  nextPass: string,
  state: FinanceState
): Promise<void> {
  // Verify current by re-deriving and decrypting
  await unlockVault(currentPass);
  await setupVault(nextPass, state);
}

export type VaultProbe =
  | { mode: "encrypted" }
  | { mode: "plain" }
  | { mode: "empty" };

export function probeVault(): VaultProbe {
  if (hasEncryptedVault()) return { mode: "encrypted" };
  if (hasPlainFinance()) return { mode: "plain" };
  return { mode: "empty" };
}
