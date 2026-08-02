/**
 * 7-day breakfast trial — Melani's plan, not Blueprint clone.
 * Starts the calendar day after first create (tomorrow when we set it).
 */
import { todayKey } from "./data";

const KEY = "dr-melani-breakfast-trial-v1";

export type BreakfastTrial = {
  /** First day you eat the locked breakfast (YYYY-MM-DD) */
  startIso: string;
  days: number;
  createdAt: string;
};

function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Local tomorrow from a given day (defaults to real today). */
export function tomorrowIso(fromIso = todayKey()): string {
  return addDaysIso(fromIso, 1);
}

export function loadBreakfastTrial(): BreakfastTrial {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<BreakfastTrial>;
      if (
        parsed &&
        typeof parsed.startIso === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(parsed.startIso)
      ) {
        return {
          startIso: parsed.startIso,
          days: typeof parsed.days === "number" ? parsed.days : 7,
          createdAt:
            typeof parsed.createdAt === "string"
              ? parsed.createdAt
              : new Date().toISOString(),
        };
      }
    }
  } catch {
    /* ignore */
  }
  // First open: trial starts tomorrow so today is prep / measure day
  const trial: BreakfastTrial = {
    startIso: tomorrowIso(),
    days: 7,
    createdAt: new Date().toISOString(),
  };
  saveBreakfastTrial(trial);
  return trial;
}

export function saveBreakfastTrial(trial: BreakfastTrial) {
  try {
    localStorage.setItem(KEY, JSON.stringify(trial));
  } catch {
    /* ignore */
  }
}

export type TrialPhase = "before" | "active" | "done";

export type BreakfastTrialStatus = {
  phase: TrialPhase;
  /** 1..days when active; 0 before; days+ when done */
  dayNum: number;
  days: number;
  startIso: string;
  endIso: string;
  /** Short line for UI */
  label: string;
};

export function breakfastTrialStatus(
  todayIso: string,
  trial: BreakfastTrial = loadBreakfastTrial()
): BreakfastTrialStatus {
  const endIso = addDaysIso(trial.startIso, trial.days - 1);
  if (todayIso < trial.startIso) {
    return {
      phase: "before",
      dayNum: 0,
      days: trial.days,
      startIso: trial.startIso,
      endIso,
      label: `7-day breakfast trial · starts ${trial.startIso} (tomorrow if you set it today)`,
    };
  }
  if (todayIso > endIso) {
    return {
      phase: "done",
      dayNum: trial.days + 1,
      days: trial.days,
      startIso: trial.startIso,
      endIso,
      label: `Breakfast trial done · ${trial.startIso} → ${endIso}`,
    };
  }
  // day index: start = 1
  const [ys, ms, ds] = trial.startIso.split("-").map(Number);
  const [yt, mt, dt] = todayIso.split("-").map(Number);
  const start = new Date(ys, ms - 1, ds).getTime();
  const today = new Date(yt, mt - 1, dt).getTime();
  const dayNum = Math.floor((today - start) / 86_400_000) + 1;
  return {
    phase: "active",
    dayNum,
    days: trial.days,
    startIso: trial.startIso,
    endIso,
    label: `Day ${dayNum} of ${trial.days} · breakfast trial`,
  };
}
