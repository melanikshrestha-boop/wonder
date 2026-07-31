/**
 * Data Vault client — timestamped recoveries for health keys.
 * Snapshots never overwrite older ones. Restore is always merge-only
 * (handled with Data Guardian merge helpers).
 */
import {
  collectProtectedSnapshot,
  mergeByDayKey,
  mergeMapsPreferLocal,
  pushGuardianKey,
} from "./dataGuardian";

export type VaultItem = {
  id: string;
  at: string;
  label: string;
  keyCount: number;
  domains: string[];
};

export type VaultList = {
  ok: boolean;
  root?: string;
  items: VaultItem[];
};

export async function listVault(): Promise<VaultList> {
  try {
    const res = await fetch("/api/wonder-vault/list");
    if (!res.ok) return { ok: false, items: [] };
    return (await res.json()) as VaultList;
  } catch {
    return { ok: false, items: [] };
  }
}

export async function takeVaultSnapshot(
  label = "manual"
): Promise<{ ok: boolean; id?: string; keyCount?: number; error?: string }> {
  const payload = collectProtectedSnapshot();
  const keyCount = Object.keys(payload).length;
  if (!keyCount) return { ok: false, error: "nothing to seal" };
  try {
    const res = await fetch("/api/wonder-vault/snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload, label }),
    });
    const body = (await res.json()) as {
      ok?: boolean;
      id?: string;
      error?: string;
    };
    if (!res.ok) return { ok: false, error: body.error || "snapshot failed" };
    return { ok: true, id: body.id, keyCount };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) };
  }
}

/**
 * Merge-only restore: vault fills gaps; local owner values win.
 * Returns how many keys were written/updated.
 */
export async function restoreVaultMerge(id: string): Promise<{
  ok: boolean;
  updated: number;
  error?: string;
}> {
  try {
    const res = await fetch("/api/wonder-vault/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const body = (await res.json()) as {
      ok?: boolean;
      payload?: Record<string, unknown>;
      error?: string;
    };
    if (!res.ok || !body.payload) {
      return { ok: false, updated: 0, error: body.error || "restore failed" };
    }
    let updated = 0;
    for (const [key, vaultVal] of Object.entries(body.payload)) {
      if (vaultVal == null) continue;
      let local: unknown = null;
      try {
        const raw = localStorage.getItem(key);
        if (raw) local = JSON.parse(raw);
      } catch {
        /* ignore */
      }
      let next: unknown = vaultVal;
      if (
        local &&
        typeof local === "object" &&
        !Array.isArray(local) &&
        typeof vaultVal === "object" &&
        !Array.isArray(vaultVal)
      ) {
        next = mergeMapsPreferLocal(
          local as Record<string, unknown>,
          vaultVal as Record<string, unknown>
        );
      } else if (
        Array.isArray(local) &&
        Array.isArray(vaultVal) &&
        local[0] &&
        typeof local[0] === "object" &&
        local[0] !== null &&
        "day" in (local[0] as object)
      ) {
        next = mergeByDayKey(
          local as { day: string }[],
          vaultVal as { day: string }[]
        );
      } else if (local != null && Array.isArray(local) && Array.isArray(vaultVal)) {
        next =
          local.length >= vaultVal.length ? local : vaultVal;
      } else if (local != null && vaultVal == null) {
        next = local;
      }
      const ser = JSON.stringify(next);
      const prev = localStorage.getItem(key);
      if (ser !== prev) {
        localStorage.setItem(key, ser);
        updated += 1;
      }
      pushGuardianKey(key, next);
    }
    return { ok: true, updated };
  } catch (e) {
    return { ok: false, updated: 0, error: String((e as Error)?.message || e) };
  }
}

/** Auto-snap if last snap is older than minMinutes (default 30). */
export async function maybeAutoSnapshot(minMinutes = 30): Promise<void> {
  try {
    const list = await listVault();
    const latest = list.items[0];
    if (latest?.at) {
      const age = Date.now() - new Date(latest.at).getTime();
      if (age < minMinutes * 60_000) return;
    }
    await takeVaultSnapshot("auto");
  } catch {
    /* ignore */
  }
}
