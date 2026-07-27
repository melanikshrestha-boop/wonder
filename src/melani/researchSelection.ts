/**
 * Build a Mel research prompt from a text selection.
 * Prefer her own lab / body knowledge over random web previews.
 */
import {
  LAB_ITEMS,
  LAB_SECTIONS,
  labDisplayName,
  type LabItem,
} from "./labData";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w+/.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function packLab(lab: LabItem): { kind: "item"; title: string; body: string } {
  const bits = [
    lab.fullName || labDisplayName(lab),
    lab.oneLiner,
    lab.simple,
    lab.testsFor ? `What it tests: ${lab.testsFor}` : null,
    lab.highMeans ? `High: ${lab.highMeans}` : null,
    lab.lowMeans ? `Low: ${lab.lowMeans}` : null,
    lab.normalRange ? `Typical range note: ${lab.normalRange}` : null,
    lab.value != null && lab.value !== ""
      ? `Your latest logged value: ${lab.value}${lab.unit ? ` ${lab.unit}` : ""} (${lab.status}).`
      : null,
  ].filter(Boolean);
  return {
    kind: "item",
    title: labDisplayName(lab),
    body: bits.join("\n"),
  };
}

/** Match selection to a lab item or panel section when possible. */
export function matchLabKnowledge(selection: string): {
  kind: "item" | "section";
  title: string;
  body: string;
} | null {
  const q = normalize(selection);
  if (q.length < 2) return null;

  // Common aliases first (T4/T3 highlight → thyroid axis, not Safari)
  if (
    /\bt4\b|\bt3\b|t4\/t3|thyroxine|triiodothyronine|free t4|free t3|thyroid/i.test(
      selection
    )
  ) {
    const sec = LAB_SECTIONS.find((s) => s.id === "thyroid");
    const tsh = LAB_ITEMS.find((l) => /tsh/i.test(l.id) || /tsh/i.test(l.short));
    if (sec || tsh) {
      const body = [
        sec?.blurb,
        tsh ? packLab(tsh).body : null,
        "T4/T3 are the thyroid hormones. TSH is the pituitary volume knob that tells the thyroid how much T4/T3 to make. Screening usually starts with TSH; free T4/T3 fill in the picture when TSH is off or symptoms are strong.",
      ]
        .filter(Boolean)
        .join("\n\n");
      return { kind: "section", title: "Thyroid axis (TSH → T4/T3)", body };
    }
  }

  // Exact / contains lab names (TSH, LDL, HDL, non-HDL…)
  for (const lab of LAB_ITEMS) {
    const name = normalize(labDisplayName(lab));
    const full = normalize(lab.fullName || "");
    const id = normalize(lab.id);
    const short = normalize(lab.short || "");
    if (
      q === name ||
      q === full ||
      q === id ||
      q === short ||
      (short.length >= 2 && (q.includes(short) || short.includes(q))) ||
      name.includes(q) ||
      q.includes(name) ||
      (full && (full.includes(q) || q.includes(full))) ||
      id.includes(q) ||
      q.includes(id)
    ) {
      return packLab(lab);
    }
  }

  // Section blurbs (Thyroid, Cholesterol, Electrolytes…)
  for (const sec of LAB_SECTIONS) {
    const label = normalize(sec.label);
    const blurb = normalize(sec.blurb);
    if (
      q === label ||
      label.includes(q) ||
      q.includes(label) ||
      (q.length >= 12 && blurb.includes(q.slice(0, Math.min(40, q.length))))
    ) {
      return {
        kind: "section",
        title: sec.label,
        body: sec.blurb,
      };
    }
  }

  return null;
}

/** Instant Mel reply when local knowledge hits (no cloud, no Safari). */
export function formatLocalResearchReply(selection: string): string | null {
  const hit = matchLabKnowledge(selection);
  if (!hit) return null;
  const quote = selection.replace(/\s+/g, " ").trim().slice(0, 120);
  return [
    `Research on Mel · ${hit.title}`,
    `You highlighted: “${quote}”`,
    ``,
    hit.body,
    ``,
    `How to read it: this is your Wonder lab knowledge — not a diagnosis and not a random website preview.`,
    `Want more: open the lab row for the full popup, or ask Mel a follow-up.`,
  ].join("\n");
}

/**
 * Prompt Mel opens with. Local knowledge is inlined so she doesn't need the web.
 */
export function buildResearchPrompt(selection: string): string {
  const hit = matchLabKnowledge(selection);
  const quote = selection.replace(/\s+/g, " ").trim().slice(0, 200);

  // Prefer a short trigger Mel can answer offline instantly
  if (hit) {
    return `research selection: ${quote}`;
  }

  return [
    `Research on Mel — explain how this works in plain English.`,
    `I highlighted: “${quote}”`,
    ``,
    `Teach the system: what it is, how it works step by step, why it matters for my body/ops,`,
    `and what numbers or signals to watch. Use my Wonder context if relevant.`,
    `Not medical advice. No “see a website” — teach it here.`,
  ].join("\n");
}

/** Extract highlighted quote from Mel research messages. */
export function parseResearchSelectionCommand(raw: string): string | null {
  const t = raw.trim();
  const m = t.match(/^research\s+selection:\s*(.+)$/i);
  if (m?.[1]) return m[1].trim();
  // Full prompt path with “I highlighted”
  const h = t.match(/I highlighted:\s*[“"](.+?)[”"]/i);
  if (/^research on mel/i.test(t) && h?.[1]) return h[1].trim();
  return null;
}
