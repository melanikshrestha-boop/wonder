/**
 * Mel's Whoop / body-band pack.
 * Full literacy + series rollups + raw weekly CSVs so Mel never guesses her numbers.
 */
import { WHOOP_METRICS } from "./whoopMetrics";
import {
  loadRawWhoopCsv,
  loadWhoopStore,
  loadWeightLog,
  type WhoopStore,
} from "./whoopStore";
import { buildWhoopAnalytics } from "./whoopAnalytics";

function fmt(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 100) return String(Math.round(n));
  return (Math.round(n * 10 ** digits) / 10 ** digits).toFixed(digits);
}

function dayTable(store: WhoopStore, limit = 21): string {
  const days = Object.values(store.days)
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, limit);
  if (!days.length) return "(no parsed days yet)";
  const header =
    "day | rec% | hrv | rhr | strain | sleep% | sleep_h | deep_m | rem_m | spo2 | skinC | resp";
  const rows = days.map((d) => {
    const s = d.sleep;
    return [
      d.day,
      fmt(d.recoveryPct, 0),
      fmt(d.hrvMs, 0),
      fmt(d.rhrBpm, 0),
      fmt(d.strain, 1),
      fmt(d.sleepScore ?? s?.performancePct, 0),
      fmt(d.sleepHours, 1),
      fmt(s?.deepMin, 0),
      fmt(s?.remMin, 0),
      fmt(d.cycle?.spo2Pct, 1),
      fmt(d.cycle?.skinTempC, 1),
      fmt(d.respiratoryRate ?? s?.respiratoryRate, 1),
    ].join(" | ");
  });
  return [header, ...rows].join("\n");
}

function workoutLines(store: WhoopStore, limit = 40): string {
  const list = [...store.workouts]
    .sort((a, b) => (b.start || b.day).localeCompare(a.start || a.day))
    .slice(0, limit);
  if (!list.length) return "(no workouts)";
  return list
    .map(
      (w) =>
        `${w.day} · ${w.activity || "workout"} · ${fmt(w.durationMin, 0)} min · strain ${fmt(w.strain, 1)} · ${fmt(w.energyCal, 0)} cal`
    )
    .join("\n");
}

function literacyBlock(): string {
  return WHOOP_METRICS.map((m) => {
    const dir =
      m.higherIsBetter === true
        ? "higher better"
        : m.higherIsBetter === false
          ? "lower better"
          : "context dependent";
    return [
      `### ${m.label} (${m.key}) · ${m.unit || "score"} · ${dir} · group ${m.group} · ${m.sectionTitle}`,
      `What: ${m.what}`,
      `How: ${m.how}`,
      `Formula: ${m.formula}${m.formulaNote ? ` · ${m.formulaNote}` : ""}`,
      `Why: ${m.why}`,
      `Big picture: ${m.bigPicture}`,
      `Normal (18-20): ${m.normalRange}`,
    ].join("\n");
  }).join("\n\n");
}

function seriesRollup(): string {
  const a = buildWhoopAnalytics(loadWhoopStore());
  if (!a.series.length) return "(no series yet — import weekly CSVs)";
  return a.series
    .map((s) => {
      const pts = s.points
        .slice(-14)
        .map((p) => `${p.day.slice(5)}=${fmt(p.value)}`)
        .join(", ");
      return `${s.label} [${s.key}] unit=${s.unit || "—"} n=${s.points.length} avg=${fmt(s.avg)} latest=${fmt(s.latest)} (${s.latestDay || "—"}) min=${fmt(s.min)} max=${fmt(s.max)} trend=${s.trend}\n  last14: ${pts || "—"}`;
    })
    .join("\n");
}

/**
 * Full Mel pack: how to read the metrics + her numbers + entire raw CSVs.
 * Cap keeps API payloads sane while still feeding complete weekly exports.
 */
export function buildWhoopMelPack(maxChars = 32_000): string {
  const store = loadWhoopStore();
  const raw = loadRawWhoopCsv();
  const dayCount = Object.keys(store.days).length;
  const weights = loadWeightLog()
    .slice(0, 30)
    .map((w) => `${w.day}=${w.kg}kg`)
    .join(", ");

  // Gym lbs log (morning weigh-ins)
  let weightLbs = "";
  try {
    const rawLbs = JSON.parse(
      localStorage.getItem("dr-melani-weight-log-lbs") || "[]"
    ) as Array<{ day: string; lbs: number }>;
    if (Array.isArray(rawLbs) && rawLbs.length) {
      weightLbs = rawLbs
        .slice(-30)
        .map((e) => `${e.day}=${e.lbs}lb`)
        .join(", ");
    }
  } catch {
    /* ignore */
  }

  const parts: string[] = [];
  parts.push(`WHOOP / BODY BAND PACK (trust these over guesses)
Source: weekly export CSVs (sleeps, physiological_cycles, workouts, journal_entries).
Where data lives in Wonder: Sleep tab (sleep + overnight + body signals), Gym tab (recovery, day strain, training, weight). There is no separate Whoop page.
Parsed days: ${dayCount} · workouts: ${store.workouts.length} · journal rows: ${store.journal.length}
Last import: ${store.lastImportAt || "never"} · ${store.lastImportSummary || "—"}
Files: ${(store.lastFiles || []).join(", ") || Object.keys(raw).join(", ") || "none"}
Weight (kg log): ${weights || "—"}
Weight (lb morning log, goal 110 lb): ${weightLbs || "—"}`);

  parts.push(`METRIC LITERACY (how Mel reads each signal)
${literacyBlock()}`);

  parts.push(`SERIES ROLLUP (computed from parsed store)
${seriesRollup()}`);

  parts.push(`DAY TABLE (newest first, up to 21)
${dayTable(store, 21)}`);

  parts.push(`WORKOUTS (newest first, up to 40)
${workoutLines(store, 40)}`);

  const csvNames = Object.keys(raw).sort();
  if (csvNames.length) {
    const csvBlocks: string[] = [];
    let budget = Math.max(4000, maxChars - parts.join("\n\n").length - 500);
    for (const name of csvNames) {
      if (budget < 400) break;
      let text = raw[name] || "";
      if (text.length > budget) {
        text =
          text.slice(0, budget) +
          `\n... [truncated ${text.length - budget} chars of ${name}]`;
      }
      csvBlocks.push(`----- RAW CSV: ${name} -----\n${text}`);
      budget -= text.length + 40;
    }
    parts.push(
      `RAW WEEKLY CSVs (full file text Mel must treat as ground truth)
${csvBlocks.join("\n\n")}`
    );
  } else {
    parts.push(
      `RAW WEEKLY CSVs
(none cached yet. Import weekly data on Sleep, or seed from /whoop/latest. After import Mel receives full CSV text here.)`
    );
  }

  parts.push(`HOW MEL USES THIS
- Sleep / recovery / HRV / RHR / stages / body signals: answer from DAY TABLE + SERIES + CSVs.
- Training load / day strain / workouts: from WORKOUTS + day strain column + workouts.csv.
- Never invent a recovery % or sleep hour when the pack has a number.
- Higher/lower guidance only where metric literacy says so.
- Soft education only, not medical diagnosis.`);

  let out = parts.join("\n\n");
  if (out.length > maxChars) {
    out = out.slice(0, maxChars) + "\n... [Whoop pack truncated for transport]";
  }
  return out;
}
