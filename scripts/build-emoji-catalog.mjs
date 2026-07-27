/**
 * Rebuild src/emojiCatalog.ts from Unicode emoji-test.txt
 * Usage: curl -fsSL https://unicode.org/Public/emoji/15.1/emoji-test.txt -o /tmp/emoji-test.txt
 *        node scripts/build-emoji-catalog.mjs
 */
import fs from "fs";

const text = fs.readFileSync("/tmp/emoji-test.txt", "utf8");
const GROUP_META = {
  "Smileys & Emotion": { id: "smileys", label: "Smileys & Emotion", tab: "😀" },
  "People & Body": { id: "people", label: "People & Body", tab: "👋" },
  "Animals & Nature": { id: "nature", label: "Animals & Nature", tab: "🐻" },
  "Food & Drink": { id: "food", label: "Food & Drink", tab: "🍔" },
  "Activities": { id: "activity", label: "Activity", tab: "⚽️" },
  "Travel & Places": { id: "travel", label: "Travel & Places", tab: "🚗" },
  "Objects": { id: "objects", label: "Objects", tab: "💡" },
  "Symbols": { id: "symbols", label: "Symbols", tab: "❤️" },
  "Flags": { id: "flags", label: "Flags", tab: "🏁" },
};

const groups = [];
let bucket = null;
let currentSub = null;

for (const line of text.split("\n")) {
  const g = line.match(/^# group: (.+)$/);
  if (g) {
    const name = g[1].trim();
    const meta = GROUP_META[name];
    if (!meta) { bucket = null; continue; }
    bucket = { ...meta, subgroups: [] };
    groups.push(bucket);
    currentSub = null;
    continue;
  }
  if (!bucket) continue;
  const sg = line.match(/^# subgroup: (.+)$/);
  if (sg) {
    currentSub = {
      id: sg[1].trim(),
      label: sg[1].trim().replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      emojis: [],
    };
    bucket.subgroups.push(currentSub);
    continue;
  }
  const m = line.match(/^([0-9A-F ]+)\s*;\s*fully-qualified\s*#\s*(\S+)/);
  if (m && currentSub) currentSub.emojis.push(m[2]);
}

const flat = groups.map((g) => ({
  id: g.id,
  label: g.label,
  tab: g.tab,
  emojis: g.subgroups.flatMap((s) => s.emojis),
  subgroups: g.subgroups.filter((s) => s.emojis.length > 0),
}));

const out = `/**
 * Full RGI emoji set from Unicode 15.1 emoji-test.txt
 * Grouped like the Apple emoji keyboard (Unicode CLDR order).
 * Auto-generated — re-run: node scripts/build-emoji-catalog.mjs
 */

export type EmojiSubgroup = {
  id: string;
  label: string;
  emojis: string[];
};

export type EmojiGroup = {
  id: string;
  label: string;
  tab: string;
  emojis: string[];
  subgroups: EmojiSubgroup[];
};

export const EMOJI_GROUPS: EmojiGroup[] = ${JSON.stringify(flat, null, 2)};

export function filterEmojis(query: string): { label: string; emojis: string[] }[] {
  const q = query.trim().toLowerCase();
  if (!q) return EMOJI_GROUPS.map((g) => ({ label: g.label, emojis: g.emojis }));
  const keywords: Record<string, string[]> = {
    heart: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "🫀"],
    health: ["💊", "🩺", "💉", "🩸", "🧬", "🏥", "🧠", "❤️", "🏃", "🥗"],
    food: ["🍎", "🥗", "🥑", "🐟", "🥛", "🍳", "🥦", "🍔"],
    gym: ["🏋️", "💪", "🏃", "🏊", "🧘", "⚽"],
    sleep: ["😴", "🛏️", "🌙", "💤"],
    water: ["💧", "💦", "🌊", "🚰"],
    fire: ["🔥", "💥"],
    book: ["📚", "📖", "📕", "📗", "📘", "📙", "📓"],
    money: ["💰", "💵", "💸", "💳", "🤑"],
  };
  return EMOJI_GROUPS.map((g) => {
    if (g.label.toLowerCase().includes(q) || g.id.includes(q)) {
      return { label: g.label, emojis: g.emojis };
    }
    for (const [key, list] of Object.entries(keywords)) {
      if (q.includes(key)) {
        const hit = g.emojis.filter((e) => list.includes(e));
        if (hit.length) return { label: g.label, emojis: hit };
      }
    }
    return { label: g.label, emojis: [] };
  }).filter((g) => g.emojis.length > 0);
}
`;

fs.writeFileSync("src/emojiCatalog.ts", out);
console.log("OK", flat.reduce((n, g) => n + g.emojis.length, 0), "emojis");
