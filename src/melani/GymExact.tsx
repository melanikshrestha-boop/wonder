/**
 * Full Gym inside the Notion-style workspace (not an iframe, no PIN).
 * Order on home: Today → week day chooser → workouts → warm-up LAST.
 * You can still add normal Notion pages in the sidebar — this is only the Gym page.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildWhoopAnalytics,
  loadWhoopStore,
  WHOOP_EVENT,
} from "./whoopStore";
import { groupMetricsBySection, metricDef } from "./whoopMetrics";
import { MetricExplainModal, MetricGraphPanel } from "./whoopMetricUi";
import "./gym-exact.css";
import "./whoop-lab.css";

// ── Types (same shape as Melani gym plan JSON files) ──
type SetRow = { done?: boolean; failure?: boolean; label?: string };
type PlanItem = {
  id: string;
  text?: string;
  name?: string;
  display_name?: string;
  subtitle?: string;
  checked?: boolean;
  sets_target?: number;
  reps_label?: string;
  rest_sec?: number;
  rest_label?: string;
  notes?: string[];
  notes_label?: string;
  instructions?: string[];
  set_specs?: Record<string, { label?: string; failure?: boolean }>;
  sets?: SetRow[];
  superset_group?: string;
};
type PlanSection = { id?: string; title?: string; items?: PlanItem[] };
type Plan = {
  day_key?: string;
  title?: string;
  subtitle?: string;
  sections?: PlanSection[];
  placeholder?: string;
};

// Workout type for week planner (Sat–Fri)
type WorkoutType = "cardio" | "lower" | "upper" | "rest";

const WEEK_DAYS: { key: string; short: string }[] = [
  { key: "sat", short: "Sat" },
  { key: "sun", short: "Sun" },
  { key: "mon", short: "Mon" },
  { key: "tue", short: "Tue" },
  { key: "wed", short: "Wed" },
  { key: "thu", short: "Thu" },
  { key: "fri", short: "Fri" },
];

const TYPE_META: Record<
  WorkoutType,
  { label: string; icon: string; color: string; hint?: string }
> = {
  // Same line icons — each type gets its own soft color
  cardio: {
    label: "Cardio",
    icon: "/icons/gym-cardio.svg",
    color: "#f9a8d4", // soft pink
  },
  lower: {
    label: "Lower body",
    icon: "/icons/gym-lower.svg",
    color: "#93c5fd", // sky blue
  },
  upper: {
    label: "Upper body + Abs",
    icon: "/icons/gym-upper.svg",
    color: "#c4b5fd", // lavender
  },
  rest: {
    label: "Rest",
    icon: "/icons/gym-rest.svg",
    color: "#fdba74", // warm gold
  },
};

/** Same SVG icon, colored with CSS mask so each type looks different */
function GymTypeIcon({
  type,
  size = 16,
  className = "",
}: {
  type: WorkoutType;
  size?: number;
  className?: string;
}) {
  const meta = TYPE_META[type];
  return (
    <span
      className={`gx-type-icon ${className}`.trim()}
      style={{
        width: size,
        height: size,
        color: meta.color,
        WebkitMaskImage: `url(${meta.icon})`,
        maskImage: `url(${meta.icon})`,
      }}
      aria-hidden
    />
  );
}

// Track hubs (like Melani Lower body / Upper / Cardio pages)
// exercises / sets_total match the JSON plans under public/gym-plans/
const TRACKS: {
  id: string;
  label: string;
  sub: string;
  icon: string;
  plans: {
    key: string;
    file: string;
    label: string;
    num: number;
    exercises: number;
    setsTotal: number;
  }[];
}[] = [
  {
    id: "lower",
    label: "Lower body",
    sub: "Workouts 1, 2, and 3",
    icon: "/icons/gym-lower.svg",
    plans: [
      {
        key: "lower_one",
        file: "lower_one.json",
        label: "Lower body 1",
        num: 1,
        exercises: 4,
        setsTotal: 13,
      },
      {
        key: "lower_two",
        file: "lower_two.json",
        label: "Lower body 2",
        num: 2,
        exercises: 4,
        setsTotal: 13,
      },
      {
        key: "lower_three",
        file: "lower_three.json",
        label: "Lower body 3",
        num: 3,
        exercises: 4,
        setsTotal: 14,
      },
    ],
  },
  {
    id: "upper",
    label: "Upper body + Abs",
    sub: "Workouts 1 and 2",
    icon: "/icons/gym-upper.svg",
    plans: [
      {
        key: "upper_abs_one",
        file: "upper_abs_one.json",
        label: "Upper + Abs 1",
        num: 1,
        exercises: 5,
        setsTotal: 15,
      },
      {
        key: "upper_abs_two",
        file: "upper_abs_two.json",
        label: "Upper + Abs 2",
        num: 2,
        exercises: 5,
        setsTotal: 15,
      },
    ],
  },
  {
    id: "cardio",
    label: "Cardio",
    sub: "Running tracker · swimming soon",
    icon: "/icons/gym-cardio.svg",
    plans: [
      {
        key: "cardio_running",
        file: "cardio_running.json",
        label: "Running",
        num: 1,
        exercises: 0,
        setsTotal: 0,
      },
    ],
  },
];
// Day-of-week full plans (for "today" quick link)
const DAY_PLANS: Record<string, { file: string; label: string }> = {
  mon: { file: "monday.json", label: "Monday (Glutes + Abs)" },
  tue: { file: "tuesday.json", label: "Tuesday (Upper + Abs)" },
  wed: { file: "wednesday.json", label: "Wednesday (Glutes + Abs)" },
  thu: { file: "thursday.json", label: "Thursday (Chest + Abs)" },
  fri: { file: "friday.json", label: "Friday (Glutes + Abs)" },
  sat: { file: "saturday.json", label: "Saturday (Glutes + Abs)" },
  sun: { file: "sunday.json", label: "Sunday (Leg day)" },
};

const WARMUP = [
  { id: "head_stretch", text: "1.\u00a0\u00a0Head stretch" },
  { id: "upper_neck", text: "2.\u00a0\u00a0Upper neck" },
  { id: "upper_body", text: "3.\u00a0\u00a0Upper body" },
  { id: "lower_body", text: "4.\u00a0\u00a0Lower body" },
  { id: "jump_squats", text: "5.\u00a0\u00a010 jump squats + high knees" },
  { id: "swing_legs", text: "6.\u00a0\u00a0Swing legs" },
  { id: "open_close_gate", text: "7.\u00a0\u00a0Open and close a gate" },
];

const WEEK_PLAN_KEY = "dr-melani-gym-week-plan";
/** Daily weigh-ins in pounds (morning check — top of Gym) */
const WEIGHT_LBS_KEY = "dr-melani-weight-log-lbs";
const WEIGHT_GOAL_LBS = 110;

type WeightLbsEntry = { day: string; lbs: number };

function todayKey(): string {
  // YYYY-MM-DD local (not UTC) so “today” matches the week strip
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function loadWeightLbsLog(): WeightLbsEntry[] {
  try {
    const raw = JSON.parse(
      localStorage.getItem(WEIGHT_LBS_KEY) || "[]"
    ) as WeightLbsEntry[];
    if (Array.isArray(raw) && raw.length) {
      return raw
        .filter((e) => e && typeof e.day === "string" && Number.isFinite(e.lbs))
        .sort((a, b) => a.day.localeCompare(b.day));
    }
  } catch {
    /* ignore */
  }
  // Migrate single weight into *history* only — never stamp as today
  // (today's field must start empty until morning weigh-in)
  try {
    const single = localStorage.getItem("dr-melani-body-weight");
    const n = single ? Number(single) : NaN;
    if (Number.isFinite(n) && n > 50 && n < 400) {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
      const migrated: WeightLbsEntry[] = [
        { day: yday, lbs: Math.round(n * 10) / 10 },
      ];
      try {
        localStorage.setItem(WEIGHT_LBS_KEY, JSON.stringify(migrated));
      } catch {
        /* ignore */
      }
      return migrated;
    }
  } catch {
    /* ignore */
  }
  return [];
}

/** Today's lbs if already logged this morning — else null (field stays empty). */
function todaysWeightLbs(log: WeightLbsEntry[] = loadWeightLbsLog()): number | null {
  const today = log.find((e) => e.day === todayKey());
  return today && Number.isFinite(today.lbs) ? today.lbs : null;
}

function saveWeightLbs(day: string, lbs: number): WeightLbsEntry[] {
  const entry: WeightLbsEntry = {
    day,
    lbs: Math.round(lbs * 10) / 10,
  };
  const next = loadWeightLbsLog()
    .filter((e) => e.day !== day)
    .concat(entry)
    .sort((a, b) => a.day.localeCompare(b.day));
  try {
    localStorage.setItem(WEIGHT_LBS_KEY, JSON.stringify(next.slice(-400)));
    // Last known for other surfaces — NOT used to prefill the Gym input
    localStorage.setItem("dr-melani-body-weight", String(entry.lbs));
  } catch {
    /* ignore */
  }
  return next;
}

/** Clear today's weigh-in if the field was wiped. */
function clearWeightLbsDay(day: string): WeightLbsEntry[] {
  const next = loadWeightLbsLog().filter((e) => e.day !== day);
  try {
    localStorage.setItem(WEIGHT_LBS_KEY, JSON.stringify(next.slice(-400)));
  } catch {
    /* ignore */
  }
  return next;
}

/**
 * Weight trend — same format as Whoop Recovery:
 * TITLE · big avg · latest / Δ vs avg / range · soft area graph · n = footer
 */
function WeightTrendChart({
  log,
  goalLbs,
}: {
  log: WeightLbsEntry[];
  goalLbs: number;
}) {
  const series = useMemo(() => {
    const points = log.map((e) => ({ day: e.day, value: e.lbs }));
    if (!points.length) {
      return null;
    }
    const vals = points.map((p) => p.value);
    const avg =
      Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const latest = vals[vals.length - 1];
    const latestDay = points[points.length - 1].day;
    // Trend: lower is better toward goal
    let trend: "up" | "down" | "flat" | "na" = "na";
    if (vals.length >= 2) {
      const delta = latest - vals[0];
      if (Math.abs(delta) < 0.3) trend = "flat";
      else trend = delta < 0 ? "down" : "up";
    }
    return {
      key: "weight",
      label: "WEIGHT",
      unit: "lb",
      points,
      avg,
      min,
      max,
      latest,
      latestDay,
      trend,
    };
  }, [log]);

  if (!series) {
    return (
      <p className="gx-weight-empty">
        Log a few mornings to see your trend. Goal {goalLbs} lb.
      </p>
    );
  }

  return (
    <div className="gx-weight-metric wx">
      <MetricGraphPanel
        series={series}
        staticTitle
        goal={goalLbs}
        goalLabel={`${goalLbs} lb goal`}
      />
    </div>
  );
}

function weekdayKey(d: Date = new Date()): string {
  // JS: 0=Sun … 6=Sat → our keys sat/sun/mon…
  const map = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[d.getDay()];
}

/** Sat→Fri week starting from the Saturday on or before today */
function weekStrip(): {
  day_key: string;
  short: string;
  dateLabel: string;
  iso: string;
  isToday: boolean;
}[] {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  // Find Saturday of this week (Sat start)
  const day = today.getDay(); // 0 Sun … 6 Sat
  const daysSinceSat = (day + 1) % 7; // Sat=0, Sun=1, … Fri=6
  const sat = new Date(today);
  sat.setDate(today.getDate() - daysSinceSat);
  return WEEK_DAYS.map((wd, i) => {
    const d = new Date(sat);
    d.setDate(sat.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return {
      day_key: wd.key,
      short: wd.short,
      dateLabel: d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      iso,
      isToday: iso === todayKey(),
    };
  });
}

function weekRangeLabel(strip: ReturnType<typeof weekStrip>): string {
  if (!strip.length) return "";
  const a = strip[0];
  const b = strip[strip.length - 1];
  // e.g. Jul 18 – 24
  const start = a.dateLabel;
  const endDay = b.iso.slice(8).replace(/^0/, "");
  return `${start} – ${endDay}`;
}

function loadWeekPlan(): Record<string, WorkoutType> {
  try {
    const raw = localStorage.getItem(WEEK_PLAN_KEY);
    if (raw) return JSON.parse(raw) as Record<string, WorkoutType>;
  } catch {
    /* ignore */
  }
  return {};
}

function saveWeekPlan(plan: Record<string, WorkoutType>) {
  try {
    localStorage.setItem(WEEK_PLAN_KEY, JSON.stringify(plan));
  } catch {
    /* ignore */
  }
}

function ensureSets(item: PlanItem): SetRow[] {
  if (item.sets && item.sets.length) return item.sets.map((s) => ({ ...s }));
  const n = item.sets_target || 0;
  if (n > 0) {
    const rows: SetRow[] = [];
    for (let i = 1; i <= n; i++) {
      const spec = item.set_specs?.[String(i)];
      rows.push({
        done: false,
        failure: !!spec?.failure,
        label: spec?.label || item.reps_label || `Set ${i}`,
      });
    }
    return rows;
  }
  // simple checklist item → one "set"
  return [{ done: !!item.checked, label: "Done" }];
}

function formatTime(sec: number): string {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function countDoneSets(key: string): { done: number; total: number } {
  // Read saved session progress for progress chips (0/13)
  try {
    const saved = localStorage.getItem(`gym-session:${key}:${todayKey()}`);
    if (!saved) return { done: 0, total: 0 };
    const map = JSON.parse(saved) as Record<string, boolean[]>;
    let done = 0;
    let total = 0;
    Object.values(map).forEach((flags) => {
      flags.forEach((f) => {
        total += 1;
        if (f) done += 1;
      });
    });
    return { done, total };
  } catch {
    return { done: 0, total: 0 };
  }
}

type View =
  | { kind: "home" }
  | { kind: "track"; trackId: string }
  | { kind: "session"; planKey: string; file: string; back: "home" | string };

export function GymExact() {
  const [view, setView] = useState<View>({ kind: "home" });
  const [plan, setPlan] = useState<Plan | null>(null);
  const [items, setItems] = useState<
    { sectionTitle: string; item: PlanItem; sets: SetRow[] }[]
  >([]);
  const [warmup, setWarmup] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(
        localStorage.getItem(`gym-warmup:${todayKey()}`) || "{}"
      );
    } catch {
      return {};
    }
  });
  // Morning weigh-in (lbs) — empty every new day until she logs today
  const [weightLog, setWeightLog] = useState<WeightLbsEntry[]>(() =>
    loadWeightLbsLog()
  );
  const [bodyWeight, setBodyWeight] = useState(() => {
    const today = todaysWeightLbs();
    return today != null ? String(today) : "";
  });
  /** Track calendar day so midnight / overnight sessions clear the field */
  const [weightDay, setWeightDay] = useState(() => todayKey());
  const [weightChartOpen, setWeightChartOpen] = useState(false);
  const [weekPlan, setWeekPlan] = useState<Record<string, WorkoutType>>(
    loadWeekPlan
  );
  // Draft of week plan while tapping days (saved on "Save week")
  const [draftPlan, setDraftPlan] = useState<Record<string, WorkoutType>>(
    loadWeekPlan
  );
  const [saveFlash, setSaveFlash] = useState("");
  const [err, setErr] = useState("");
  /** Collapsed by default — type×day picker lives under “Choose your workout” */
  const [chooseOpen, setChooseOpen] = useState(false);
  /** Whoop training graphs (energy / minutes / strain) — live on Gym home */
  const [whoopTick, setWhoopTick] = useState(0);
  const [trainExplainKey, setTrainExplainKey] = useState<string | null>(null);

  const trainSections = useMemo(() => {
    const analytics = buildWhoopAnalytics(loadWhoopStore());
    const train = analytics.series.filter(
      (m) => metricDef(m.key)?.group === "train"
    );
    return groupMetricsBySection(train);
  }, [whoopTick]);
  const trainExplainSeries =
    trainExplainKey != null
      ? trainSections
          .flatMap((s) => s.metrics)
          .find((m) => m.key === trainExplainKey) ?? null
      : null;

  useEffect(() => {
    const on = () => setWhoopTick((t) => t + 1);
    window.addEventListener(WHOOP_EVENT, on);
    return () => window.removeEventListener(WHOOP_EVENT, on);
  }, []);

  // Rest timer overlay
  const [timerOpen, setTimerOpen] = useState(false);
  const [timerSec, setTimerSec] = useState(0);
  const [timerMsg, setTimerMsg] = useState("");
  const [timerHint, setTimerHint] = useState("");
  const [showMsg, setShowMsg] = useState(true);
  const tick = useRef<number | null>(null);
  const phase = useRef<number | null>(null);

  const strip = useMemo(() => weekStrip(), []);
  const rangeLabel = useMemo(() => weekRangeLabel(strip), [strip]);

  const clearTimers = useCallback(() => {
    if (tick.current) window.clearInterval(tick.current);
    if (phase.current) window.clearTimeout(phase.current);
    tick.current = null;
    phase.current = null;
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  function startRest(restSec: number, restLabel: string, msg: string) {
    clearTimers();
    setTimerMsg(msg);
    setTimerHint(restLabel || "");
    setShowMsg(true);
    setTimerOpen(true);
    setTimerSec(restSec || 120);
    phase.current = window.setTimeout(() => {
      setShowMsg(false);
      tick.current = window.setInterval(() => {
        setTimerSec((s) => {
          if (s <= 1) {
            clearTimers();
            setTimerOpen(false);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }, 1600);
  }

  function openPlan(file: string, key: string, back: "home" | string = "home") {
    setErr("");
    fetch(`/gym-plans/${file}`)
      .then((r) => {
        if (!r.ok) throw new Error("Could not load plan");
        return r.json();
      })
      .then((data: Plan) => {
        setPlan(data);
        const flat: { sectionTitle: string; item: PlanItem; sets: SetRow[] }[] =
          [];
        for (const sec of data.sections || []) {
          for (const it of sec.items || []) {
            flat.push({
              sectionTitle: sec.title || "",
              item: it,
              sets: ensureSets(it),
            });
          }
        }
        // restore progress for today
        try {
          const saved = localStorage.getItem(
            `gym-session:${key}:${todayKey()}`
          );
          if (saved) {
            const map = JSON.parse(saved) as Record<string, boolean[]>;
            flat.forEach((row) => {
              const flags = map[row.item.id];
              if (flags) {
                row.sets = row.sets.map((s, i) => ({
                  ...s,
                  done: !!flags[i],
                }));
              }
            });
          }
        } catch {
          /* ignore */
        }
        setItems(flat);
        setView({ kind: "session", planKey: key, file, back });
      })
      .catch((e) => setErr(String(e.message || e)));
  }

  function persist(
    key: string,
    next: { sectionTitle: string; item: PlanItem; sets: SetRow[] }[]
  ) {
    const map: Record<string, boolean[]> = {};
    next.forEach((row) => {
      map[row.item.id] = row.sets.map((s) => !!s.done);
    });
    localStorage.setItem(
      `gym-session:${key}:${todayKey()}`,
      JSON.stringify(map)
    );
  }

  function toggleSet(itemId: string, setIndex: number) {
    if (view.kind !== "session") return;
    const planKey = view.planKey;
    setItems((prev) => {
      const next = prev.map((row) => {
        if (row.item.id !== itemId) return row;
        const sets = row.sets.map((s, i) =>
          i === setIndex ? { ...s, done: !s.done } : s
        );
        return { ...row, sets };
      });
      persist(planKey, next);
      const row = next.find((r) => r.item.id === itemId);
      const justDone = row?.sets[setIndex]?.done;
      if (justDone && row) {
        const rest = row.item.rest_sec || 120;
        const label = row.item.rest_label || "Rest";
        const fail = row.sets[setIndex]?.failure;
        startRest(
          rest,
          label,
          fail ? "True failure. Rest up." : "Set done — rest."
        );
      }
      return next;
    });
  }

  function toggleSimple(itemId: string) {
    toggleSet(itemId, 0);
  }

  function toggleWarmup(id: string) {
    setWarmup((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem(`gym-warmup:${todayKey()}`, JSON.stringify(next));
      return next;
    });
  }

  function resetSession() {
    if (view.kind !== "session") return;
    if (!confirm("Reset all sets for this workout today?")) return;
    const planKey = view.planKey;
    setItems((prev) => {
      const next = prev.map((row) => ({
        ...row,
        sets: row.sets.map((s) => ({ ...s, done: false })),
      }));
      persist(planKey, next);
      return next;
    });
  }

  // Tap a day under a workout type — assign or clear that day
  /** Day order for consecutive rules (Sat → Fri) */
  const dayOrder = useMemo(() => strip.map((c) => c.day_key), [strip]);

  function countType(plan: Record<string, WorkoutType>, type: WorkoutType) {
    return Object.values(plan).filter((t) => t === type).length;
  }

  /**
   * Lower body cannot be on back-to-back days.
   */
  function isLowerAdjacent(
    dayKey: string,
    plan: Record<string, WorkoutType>
  ) {
    const i = dayOrder.indexOf(dayKey);
    if (i < 0) return false;
    const prev = i > 0 ? plan[dayOrder[i - 1]] : null;
    const next = i < dayOrder.length - 1 ? plan[dayOrder[i + 1]] : null;
    return prev === "lower" || next === "lower";
  }

  /**
   * Rules for week picks:
   * - one type per day → other types grayed that day
   * - lower: not consecutive
   * - cardio: max 2 days/week
   * - rest: max 1 day/week
   */
  function pickBlockReason(
    type: WorkoutType,
    dayKey: string,
    plan: Record<string, WorkoutType>
  ): string | null {
    const current = plan[dayKey];
    // Already this type → allowed (toggle off)
    if (current === type) return null;
    // Day already assigned to something else
    if (current && current !== type) {
      return `Already ${TYPE_META[current].label}`;
    }
    if (type === "lower" && isLowerAdjacent(dayKey, plan)) {
      return "Can’t do lower body two days in a row";
    }
    if (type === "cardio" && countType(plan, "cardio") >= 2) {
      return "Cardio max 2 days this week";
    }
    if (type === "rest" && countType(plan, "rest") >= 1) {
      return "Rest max 1 day this week";
    }
    return null;
  }

  function pickDay(type: WorkoutType, dayKey: string) {
    setDraftPlan((prev) => {
      const next = { ...prev };
      if (next[dayKey] === type) {
        delete next[dayKey];
        return next;
      }
      if (pickBlockReason(type, dayKey, prev)) return prev;
      next[dayKey] = type;
      return next;
    });
  }

  function commitWeek() {
    setWeekPlan(draftPlan);
    saveWeekPlan(draftPlan);
    setSaveFlash("Week saved");
    window.setTimeout(() => setSaveFlash(""), 1800);
  }

  const todayWd = weekdayKey();
  const todayType = weekPlan[todayWd] || draftPlan[todayWd];
  const todayDayPlan = DAY_PLANS[todayWd];

  // Friendly "today" label from week plan or default day name
  const todayLabel = (() => {
    if (todayType === "rest") return "Rest day";
    if (todayType === "cardio") return "Cardio";
    if (todayType === "lower") return "Lower body";
    if (todayType === "upper") return "Upper body + Abs";
    if (todayDayPlan) return todayDayPlan.label;
    return null;
  })();

  const grouped = useMemo(() => {
    const map = new Map<string, typeof items>();
    for (const row of items) {
      const k = row.sectionTitle || "Workout";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(row);
    }
    return [...map.entries()];
  }, [items]);

  // ── Rest timer (shared) ──
  const timerEl = timerOpen ? (
    <div className="gx-timer-overlay">
      <div className="gx-timer-card">
        {showMsg ? (
          <p className="gx-timer-msg">{timerMsg}</p>
        ) : (
          <>
            <p className="gx-timer-label">Rest</p>
            <p className="gx-timer-count">{formatTime(timerSec)}</p>
            {timerHint ? <p className="gx-timer-hint">{timerHint}</p> : null}
            <div className="gx-timer-actions">
              <button
                type="button"
                className="gx-btn"
                onClick={() => setTimerSec((s) => s + 30)}
              >
                +30s
              </button>
              <button
                type="button"
                className="gx-btn"
                onClick={() => {
                  clearTimers();
                  setTimerOpen(false);
                }}
              >
                Skip rest
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  ) : null;

  // ── Session view (set checklists) ──
  if (view.kind === "session" && plan) {
    return (
      <div className="gx">
        {timerEl}
        <button
          type="button"
          className="gx-back"
          onClick={() => {
            if (view.back === "home") setView({ kind: "home" });
            else setView({ kind: "track", trackId: view.back });
          }}
        >
          ←{" "}
          {view.back === "home"
            ? "Gym"
            : TRACKS.find((t) => t.id === view.back)?.label || "Back"}
        </button>
        <h2 className="gx-title">{plan.title || view.planKey}</h2>
        {plan.subtitle ? <p className="gx-sub">{plan.subtitle}</p> : null}
        <button type="button" className="gx-btn gx-btn-sm" onClick={resetSession}>
          Reset sets
        </button>

        {grouped.map(([secTitle, rows]) => (
          <section key={secTitle} className="gx-section">
            {secTitle ? <h3 className="gx-sec-title">{secTitle}</h3> : null}
            {rows.map(({ item, sets }) => {
              const name =
                item.display_name || item.name || item.text || "Exercise";
              const multi = sets.length > 1 || (item.sets_target || 0) > 1;
              const allDone = sets.every((s) => s.done);
              return (
                <div
                  key={item.id}
                  className={`gx-ex${allDone ? " is-done" : ""}`}
                >
                  <h4 className="gx-ex-name">{name}</h4>
                  {item.subtitle ? (
                    <p className="gx-ex-sub">{item.subtitle}</p>
                  ) : null}
                  {(item.reps_label || item.rest_label) && (
                    <p className="gx-ex-meta">
                      {sets.length} sets
                      {item.reps_label ? ` · ${item.reps_label}` : ""}
                      {item.rest_label ? ` · rest ${item.rest_label}` : ""}
                    </p>
                  )}
                  {item.notes?.length ? (
                    <details className="gx-notes">
                      <summary>{item.notes_label || "Notes"}</summary>
                      <ul>
                        {item.notes.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}

                  {multi ? (
                    <ul className="gx-sets">
                      {sets.map((s, i) => (
                        <li key={i}>
                          <button
                            type="button"
                            className={`gx-set${s.done ? " is-done" : ""}${
                              s.failure ? " is-fail" : ""
                            }`}
                            onClick={() => toggleSet(item.id, i)}
                          >
                            <span className="gx-set-box" aria-hidden>
                              {s.done ? "✓" : null}
                            </span>
                            <span>
                              Set {i + 1}
                              {s.label ? ` · ${s.label}` : ""}
                              {s.failure &&
                              !s.label?.toLowerCase().includes("failure")
                                ? " · failure"
                                : ""}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <button
                      type="button"
                      className={`gx-set${sets[0]?.done ? " is-done" : ""}`}
                      onClick={() => toggleSimple(item.id)}
                    >
                      <span className="gx-set-box" aria-hidden>
                        {sets[0]?.done ? "✓" : null}
                      </span>
                      <span>{item.text || "Done"}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </section>
        ))}

        {!items.length && (
          <p className="gx-sub">
            {plan.placeholder || "No exercises in this plan yet."}
          </p>
        )}
      </div>
    );
  }

  // ── Track hub (Lower body 1/2/3 list) ──
  if (view.kind === "track") {
    const track = TRACKS.find((t) => t.id === view.trackId);
    if (!track) {
      // Unknown track id — go home without setState during render
      return (
        <div className="gx">
          <button
            type="button"
            className="gx-back"
            onClick={() => setView({ kind: "home" })}
          >
            ← Gym
          </button>
          <p className="gx-sub">That workout track was not found.</p>
        </div>
      );
    }
    return (
      <div className="gx">
        <button
          type="button"
          className="gx-back"
          onClick={() => setView({ kind: "home" })}
        >
          ← Gym
        </button>
        <h2 className="gx-h2">{track.label}</h2>
        <div className="gx-track-list">
          {track.plans.map((p) => {
            const prog = countDoneSets(p.key);
            // Show 0/13 style progress (from Melani) once we know set total
            const total = prog.total > 0 ? prog.total : p.setsTotal;
            const done = prog.total > 0 ? prog.done : 0;
            const totalLabel =
              total > 0 ? `${done}/${total}` : "";
            return (
              <button
                key={p.key}
                type="button"
                className="gx-track-card"
                onClick={() => openPlan(p.file, p.key, track.id)}
              >
                <span className="gx-track-num">{p.num}</span>
                <span className="gx-track-body">
                  <strong>{p.label.toUpperCase()}</strong>
                  <small>
                    {p.exercises > 0
                      ? `${p.exercises} exercises`
                      : p.label}
                  </small>
                </span>
                {totalLabel ? (
                  <span className="gx-track-prog">{totalLabel}</span>
                ) : (
                  <span className="gx-track-prog gx-track-prog-empty">→</span>
                )}
              </button>
            );
          })}
        </div>
        {err ? <p className="gx-err">{err}</p> : null}
      </div>
    );
  }

  // New calendar day → empty field (history stays in the trend log)
  useEffect(() => {
    const tick = () => {
      const day = todayKey();
      if (day === weightDay) return;
      setWeightDay(day);
      const log = loadWeightLbsLog();
      setWeightLog(log);
      const today = todaysWeightLbs(log);
      setBodyWeight(today != null ? String(today) : "");
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [weightDay]);

  function commitTodayWeight() {
    const raw = String(bodyWeight).replace(/,/g, "").trim();
    const day = todayKey();
    // Empty field = no weigh-in today (don't re-fill from yesterday)
    if (!raw) {
      setWeightLog(clearWeightLbsDay(day));
      setBodyWeight("");
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 50 || n > 400) {
      // Bad input → revert to today's saved value or empty
      const today = todaysWeightLbs();
      setBodyWeight(today != null ? String(today) : "");
      return;
    }
    setWeightLog(saveWeightLbs(day, n));
    setBodyWeight(String(Math.round(n * 10) / 10));
  }

  // ── Home: Weight (morning) → Today → week → workouts → warm-up ──
  return (
    <div className="gx">
      {/* 0. Weight — simple line: Weight: 129 lb · trend (no chrome box on the number) */}
      <section className="gx-section gx-weight-top" aria-label="Body weight">
        <div className="gx-body-line">
          <label className="gx-body-key" htmlFor="gx-body-weight">
            Weight:
          </label>
          <input
            id="gx-body-weight"
            className="gx-body-input"
            type="text"
            inputMode="decimal"
            placeholder="—"
            value={bodyWeight}
            size={Math.max(3, String(bodyWeight || "000").length)}
            onChange={(e) => setBodyWeight(e.target.value)}
            onBlur={commitTodayWeight}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            aria-label="Body weight in pounds — empty until morning weigh-in"
          />
          <span className="gx-body-unit">lb</span>
          <button
            type="button"
            className="gx-weight-chart-toggle"
            aria-expanded={weightChartOpen}
            onClick={() => setWeightChartOpen((o) => !o)}
          >
            {weightChartOpen ? "Hide trend" : "Show trend"}
          </button>
        </div>
        {weightChartOpen ? (
          <WeightTrendChart log={weightLog} goalLbs={WEIGHT_GOAL_LBS} />
        ) : null}
      </section>

      {/* 1. Today's workout — one line: label: link */}
      <section className="gx-section gx-today-line">
        <h2 className="gx-h2 gx-today-kicker">Today&apos;s workout:</h2>
        {todayLabel ? (
          <button
            type="button"
            className="gx-today-link"
            onClick={() => {
              if (todayType === "rest") return;
              if (todayType === "cardio") {
                setView({ kind: "track", trackId: "cardio" });
                return;
              }
              if (todayType === "lower") {
                setView({ kind: "track", trackId: "lower" });
                return;
              }
              if (todayType === "upper") {
                setView({ kind: "track", trackId: "upper" });
                return;
              }
              if (todayDayPlan) {
                openPlan(todayDayPlan.file, todayWd, "home");
              }
            }}
          >
            {todayLabel} →
          </button>
        ) : (
          <p className="gx-sub gx-today-empty">
            No workout set — pick days below
          </p>
        )}
      </section>

      {/* 2. This week — date strip always on; type×day picks behind toggle */}
      <section className="gx-section gx-week">
        <h2 className="gx-h2">This week</h2>
        <p className="gx-sub gx-week-range">{rangeLabel} · Sat – Fri</p>

        {/* Always-visible strip: day · date · icon when planned */}
        <div className="gx-week-strip" aria-label="Week dates">
          {strip.map((c) => {
            const assigned = draftPlan[c.day_key];
            return (
              <div
                key={c.day_key}
                className={`gx-week-cell${c.isToday ? " is-today" : ""}`}
              >
                <span className="gx-week-day">{c.short}</span>
                <span className="gx-week-date">{c.dateLabel}</span>
                {assigned ? (
                  <span className="gx-week-icon-slot" aria-hidden>
                    <GymTypeIcon type={assigned} size={12} />
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="gx-choose-toggle"
          aria-expanded={chooseOpen}
          onClick={() => setChooseOpen((v) => !v)}
        >
          Choose your workout
        </button>

        {chooseOpen ? (
          <div className="gx-choose">
            <div className="gx-week-matrix" role="grid" aria-label="Pick workout days">
              {(Object.keys(TYPE_META) as WorkoutType[]).map((type) => {
                const meta = TYPE_META[type];
                return (
                  <div
                    key={type}
                    className="gx-week-matrix-row gx-plan-type"
                    role="row"
                  >
                    <p className="gx-plan-type-label">
                      <GymTypeIcon type={type} size={14} />
                      {meta.label}
                    </p>
                    {strip.map((c) => {
                      const on = draftPlan[c.day_key] === type;
                      const blockReason = on
                        ? null
                        : pickBlockReason(type, c.day_key, draftPlan);
                      const blocked = Boolean(blockReason);
                      return (
                        <button
                          key={c.day_key}
                          type="button"
                          role="gridcell"
                          disabled={blocked}
                          title={blockReason || undefined}
                          className={`gx-day-pick${on ? " is-on" : ""}${
                            c.isToday ? " is-today" : ""
                          }${blocked ? " is-blocked" : ""}`}
                          onClick={() => pickDay(type, c.day_key)}
                        >
                          {c.short}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            <button type="button" className="gx-save-week" onClick={commitWeek}>
              Save week
            </button>
            {saveFlash ? (
              <span className="gx-save-flash">{saveFlash}</span>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* 3. Workouts — track hubs */}
      <section className="gx-section">
        <h2 className="gx-h2">Workouts</h2>
        {err ? <p className="gx-err">{err}</p> : null}
        <div className="gx-nav">
          {TRACKS.map((t) => {
            // Match track id to workout type colors (cardio / lower / upper)
            const typeKey = t.id as WorkoutType;
            return (
              <button
                key={t.id}
                type="button"
                className="gx-nav-row"
                onClick={() => setView({ kind: "track", trackId: t.id })}
              >
                {TYPE_META[typeKey] ? (
                  <GymTypeIcon type={typeKey} size={18} className="gx-nav-icon" />
                ) : (
                  <img
                    src={t.icon}
                    alt=""
                    width={18}
                    height={18}
                    className="gx-nav-icon"
                  />
                )}
                <span className="gx-nav-text">
                  <strong>{t.label}</strong>
                  <small>{t.sub}</small>
                </span>
                <span className="gx-chev">→</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 4. Warm-up */}
      <section className="gx-section gx-warmup-card" id="gym_warmup_card">
        <h2 className="gx-h2">Warm-up</h2>
        <ol className="gx-warmup">
          {WARMUP.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                className={`gx-warmup-item${warmup[w.id] ? " is-done" : ""}`}
                onClick={() => toggleWarmup(w.id)}
              >
                {w.text}
              </button>
            </li>
          ))}
        </ol>
      </section>

      {/* Whoop on Gym — Ready · load, then Training (titled sections) */}
      {trainSections.length > 0 ? (
        <section className="gx-section gx-whoop-train" aria-label="Training load">
          <div className="wx wx-on-gym">
            {trainSections.map((sec, i) => (
              <div
                key={sec.title}
                className={`wx-metric-section${i === 0 ? " is-first" : ""}`}
              >
                <h3 className="wx-h">{sec.title}</h3>
                <div className="wx-panel-stack">
                  {sec.metrics.map((m) => (
                    <MetricGraphPanel
                      key={m.key}
                      series={m}
                      onOpenExplain={() => setTrainExplainKey(m.key)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          {trainExplainSeries ? (
            <MetricExplainModal
              series={trainExplainSeries}
              onClose={() => setTrainExplainKey(null)}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
