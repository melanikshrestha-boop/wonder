/**
 * WHOOP-style cycle engine , real math, not a static mock.
 * Stores period starts + daily flow in localStorage and computes:
 * typical period length, cycle length, variation, phase map, month calendar.
 */

export type FlowLevel = "spotting" | "light" | "medium" | "heavy";

export type CyclePhaseId =
 | "menstrual"
 | "follicular"
 | "ovulatory"
 | "luteal";

export type PeriodStart = {
 /** ISO date YYYY-MM-DD , first day of bleeding */
 start: string;
 /** How many days of bleeding (default 5 if not set) */
 periodDays?: number;
};

export type CycleStore = {
 /** Oldest → newest period start dates */
 starts: PeriodStart[];
 /** day ISO → flow level */
 flow: Record<string, FlowLevel>;
 /** day ISO → free-text symptoms */
 symptoms: Record<string, string[]>;
};

const KEY = "dr-melani-cycle-v4";

/**
 * Seed with this cycle only:
 * Period Thu Jul 16 → Mon Jul 20, 2026 (stopped Jul 20).
 * After this, user logs future periods themselves via the UI.
 */
function defaultSeed(): CycleStore {
 // This period: Jul 16 (Thu) … Jul 20 (Mon) = 5 bleed days
 const start = "2026-07-16";
 const flow: Record<string, FlowLevel> = {
 // prior cycle (for history bars)
 "2026-06-07": "medium",
 "2026-06-08": "medium",
 "2026-06-09": "light",
 "2026-06-10": "light",
 "2026-06-11": "spotting",
 // this period Thu → Mon
 "2026-07-16": "medium", // Thursday
 "2026-07-17": "medium", // Friday
 "2026-07-18": "light", // Saturday
 "2026-07-19": "light", // Sunday
 "2026-07-20": "spotting", // Monday , stopped today
 };

 return {
 starts: [
 { start: "2026-04-02", periodDays: 5 },
 { start: "2026-06-07", periodDays: 5 },
 { start: start, periodDays: 5 }, // ends after day 5 (Jul 20)
 ],
 flow,
 symptoms: {},
 };
}

export function parseISO(s: string): Date {
 const [y, m, d] = s.split("-").map(Number);
 return new Date(y, m - 1, d);
}

export function fmtISO(d: Date): string {
 const y = d.getFullYear();
 const m = String(d.getMonth() + 1).padStart(2, "0");
 const day = String(d.getDate()).padStart(2, "0");
 return `${y}-${m}-${day}`;
}

export function addDays(iso: string, n: number): string {
 const d = parseISO(iso);
 d.setDate(d.getDate() + n);
 return fmtISO(d);
}

export function daysBetween(a: string, b: string): number {
 const ms = parseISO(b).getTime() - parseISO(a).getTime();
 return Math.round(ms / 86400000);
}

export function loadCycle(): CycleStore {
 try {
 const raw = localStorage.getItem(KEY);
 if (raw) {
 const data = JSON.parse(raw) as CycleStore;
 if (data.starts?.length) {
 return {
 starts: [...data.starts].sort((x, y) =>
 x.start.localeCompare(y.start)
 ),
 flow: data.flow || {},
 symptoms: data.symptoms || {},
 };
 }
 }
 } catch {
 /* ignore */
 }
 return defaultSeed();
}

export function saveCycle(store: CycleStore) {
 try {
 localStorage.setItem(KEY, JSON.stringify(store));
 } catch {
 /* ignore */
 }
}

export type CycleSegment = {
 start: string;
 end: string; // exclusive end = next start, or today+1 for current
 lengthDays: number;
 periodDays: number;
 isCurrent: boolean;
 /** day offset 0..length-1 → phase */
};

export type CycleStats = {
 avgPeriodDays: number;
 avgCycleDays: number;
 cycleVariation: number; // std-ish spread of cycle lengths
 periodRegular: boolean;
 cycleRegular: boolean;
 variationRegular: boolean;
};

export type DerivedCycle = {
 store: CycleStore;
 segments: CycleSegment[];
 stats: CycleStats;
 current: CycleSegment | null;
 /** day in current cycle 1-based */
 currentDay: number;
 phase: CyclePhaseId;
 phaseLabel: string;
 nextPeriodEst: string | null;
 ovulationEst: string | null;
};

function median(nums: number[]): number {
 if (!nums.length) return 28;
 const s = [...nums].sort((a, b) => a - b);
 const mid = Math.floor(s.length / 2);
 return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(nums: number[]): number {
 if (!nums.length) return 0;
 return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Infer period length from consecutive flow days after a start */
function inferPeriodDays(
 start: string,
 flow: Record<string, FlowLevel>,
 fallback = 5
): number {
 let n = 0;
 for (let i = 0; i < 10; i++) {
 const iso = addDays(start, i);
 if (flow[iso]) n = i + 1;
 else if (i > 0 && n > 0) break;
 }
 return n || fallback;
}

export function deriveCycle(store: CycleStore, today = new Date()): DerivedCycle {
 const todayIso = fmtISO(today);
 const starts = [...store.starts].sort((a, b) =>
 a.start.localeCompare(b.start)
 );

 const segments: CycleSegment[] = [];
 for (let i = 0; i < starts.length; i++) {
 const s = starts[i];
 const next = starts[i + 1];
 const end = next ? next.start : addDays(todayIso, 1);
 const lengthDays = Math.max(1, daysBetween(s.start, end));
 const periodDays =
 s.periodDays || inferPeriodDays(s.start, store.flow, 5);
 segments.push({
 start: s.start,
 end,
 lengthDays,
 periodDays,
 isCurrent: !next,
 });
 }

 const completed = segments.filter((s) => !s.isCurrent);
 const cycleLens = completed.map((s) => s.lengthDays);
 const periodLens = segments.map((s) => s.periodDays);

 const avgCycleDays = Math.round(median(cycleLens.length ? cycleLens : [28]));
 const avgPeriodDays = Math.round(
 mean(periodLens.length ? periodLens : [5])
 );
 // variation = average absolute deviation from mean cycle length
 const m = mean(cycleLens.length ? cycleLens : [28]);
 const cycleVariation = Math.round(
 mean(cycleLens.map((l) => Math.abs(l - m))) || 0
 );

 const periodRegular = avgPeriodDays >= 3 && avgPeriodDays <= 7;
 const cycleRegular = avgCycleDays >= 24 && avgCycleDays <= 35;
 const variationRegular = cycleVariation <= 7;

 const current = segments.filter((s) => s.isCurrent).pop() || null;
 let currentDay = 1;
 let phase: CyclePhaseId = "follicular";
 if (current) {
 currentDay = Math.max(1, daysBetween(current.start, todayIso) + 1);
 phase = phaseForDay(currentDay, current.periodDays, avgCycleDays);
 }

 const nextPeriodEst = current
 ? addDays(current.start, avgCycleDays)
 : null;
 // ovulation ~ 14 days before next period
 const ovulationEst = nextPeriodEst
 ? addDays(nextPeriodEst, -14)
 : current
 ? addDays(current.start, Math.max(current.periodDays + 1, avgCycleDays - 14))
 : null;

 return {
 store,
 segments: [...segments].reverse(), // newest first for UI
 stats: {
 avgPeriodDays,
 avgCycleDays,
 cycleVariation,
 periodRegular,
 cycleRegular,
 variationRegular,
 },
 current,
 currentDay,
 phase,
 phaseLabel: PHASE_META[phase].label,
 nextPeriodEst,
 ovulationEst,
 };
}

/**
 * Classic clinical model (used by most trackers):
 * - Menstrual = bleed days (day 1…period length)
 * - Luteal is the most stable phase (~14 days before next period)
 * - Ovulation ≈ cycleLength − 14
 * - Ovulatory window = day before, day of, day after ovulation
 *   (LH surge is short; apps show a 2–3 day peak, not a whole week)
 * - Follicular = after bleed until the day before that window
 *
 * Short cycles (e.g. 20d) still use the same math — follicular just gets shorter.
 */
export function phaseForDay(
  dayInCycle: number,
  periodDays: number,
  cycleLen: number
): CyclePhaseId {
  const bleed = Math.max(1, Math.min(10, periodDays || 5));
  const len = Math.max(cycleLen || 28, bleed + 4);

  // Fixed luteal length is better supported than a fixed follicular length
  const LUTEAL = 14;
  // Ovulation day (1-based). Keep at least 1 day after bleed when possible.
  const ovDay = Math.max(bleed + 1, len - LUTEAL);

  if (dayInCycle <= bleed) return "menstrual";

  // 3-day ovulatory peak centered on estimated ovulation
  const ovStart = Math.max(bleed + 1, ovDay - 1);
  const ovEnd = Math.min(len, ovDay + 1);
  if (dayInCycle >= ovStart && dayInCycle <= ovEnd) return "ovulatory";

  if (dayInCycle < ovStart) return "follicular";
  return "luteal";
}

export const PHASE_META: Record<
 CyclePhaseId,
 {
 label: string;
 short: string;
 color: string;
 /** Short line under title in popup */
 oneLiner: string;
 biology: string;
 hormones: string;
 guidance: string;
 protocol: string[];
 }
> = {
 // Copy is written for Melani: gym, protein, migraines, med school, inventing, clinics path.
 // Not a textbook wall of follicle vocabulary.
 menstrual: {
 label: "Menstrual",
 short: "M",
 color: "#c97b84", // rose — bleed phase
 oneLiner: "Bleed week. Recovery mode for training, focus, and pain.",
 biology:
 "Your body is shedding the uterine lining and often running on lower hormone drive, so oxygen delivery and energy can feel flatter, especially if flow is medium or heavy. That is why lower body PRs, long study marathons, and hard inventing sprints often feel harder on day 1 to 3. Blood loss also dips iron a bit, which matters for someone lifting and chasing 150g protein who already watches fatigue and migraines.",
 hormones:
 "Estrogen and progesterone are at the bottom of the cycle. That drop is what starts the bleed. As the week goes on, the brain starts the next cycle so you are not stuck here forever.",
 guidance:
 "Expect lower gas in the tank, possible cramps, and a shorter fuse for stress. Migraines and head pain can cluster here for some people. This is a protect-the-system week, not a prove-yourself week. Clinic-path Melani still shows up, just with softer volume.",
 protocol: [
 "Gym: keep lower or upper if you feel okay, but cut sets or load if cramps or migraine hit. Cardio easy only.",
 "Food: hit protein (breakfast usual helps). Add iron-rich food with vitamin C. Keep water near 4L, bleeding dehydrates you.",
 "Pain: log migraine or cramp scores in Mel (log migraine 5). Heat, sleep, and fewer late screens beat white-knuckling a full hard day.",
 "Work: short deep-work blocks for device notes or classes. Save all-day sprints for follicular when energy usually returns.",
 "Track flow in this app so next period prediction stays honest for planning travel, clinics, and training.",
 ],
 },
 follicular: {
 label: "Follicular",
 short: "F",
 color: "#4faf8c", // green — rebuild / rising estrogen
 oneLiner: "Rebuild week. Often best for hard gym, long focus, and builds.",
 biology:
 "After the bleed, hormones start climbing again and many people feel clearer, stronger, and more resilient. Recovery from lifting often improves. This is usually the best window in your cycle for progressive overload, med-school grind, and deep work on the neurotech device without fighting your body as much.",
 hormones:
 "Estrogen is the main rising signal here. It supports mood, verbal speed, and training recovery for a lot of women. You do not need the full hormone textbook to use that pattern.",
 guidance:
 "If you feel like yourself again after period, trust it. Stack harder gym days, harder classes, and inventor deep work here. Still warm up and hit protein. Energy is not a free pass to skip sleep.",
 protocol: [
 "Gym: best phase for lower + upper progress if sleep is solid. Follow your week plan rules (no back-to-back lowers).",
 "Food: lock protein at goal. Carbs around lifts. Keep breakfast usual consistent so macros are predictable.",
 "Brain work: schedule hard studying, pitch writing, or hardware debugging in this phase when possible.",
 "Migraine: if head pain was high on period, note whether it calms here. Patterns help your doctor later.",
 "Log energy 1 to 10 a few days so Mel can compare phases for you.",
 ],
 },
 ovulatory: {
 label: "Ovulatory",
 short: "O",
 color: "#9b7fd4", // purple — peak / LH window
 oneLiner: "Peak window. High energy is common. Do not under-sleep it.",
 biology:
 "A short peak around mid-cycle when many people feel most social, verbal, and physically capable. Useful for presentations, networking in Silicon Valley, filming content, or a strong gym session. The fertile window is real if that matters to you, but for day-to-day life the point is: this is often a performance peak, not a biology lecture.",
 hormones:
 "A brief LH surge triggers ovulation. Estrogen peaks just before. After that, progesterone starts rising into luteal. You mainly feel the swing as energy and mood shifts.",
 guidance:
 "Great for hard work and hard training if sleep is good. If you stack zero sleep + max caffeine + max social, you can still crash into a migraine. Peak week is for sharp output, not chaos.",
 protocol: [
 "Gym: high-intensity is often fine. Keep form clean; do not skip warm-up just because you feel strong.",
 "Food: do not under-eat on busy days. Protein + water still rule. Blood sugar swings can show up if you skip meals.",
 "Calendar: put interviews, content shoots, demos, or hard exams here when you can plan ahead.",
 "Fertility: only care if you are avoiding or seeking pregnancy. Otherwise treat it as a performance phase.",
 "If mid-cycle pain is sharp or unusual every month, log it and ask Dr. Ververis.",
 ],
 },
 luteal: {
 label: "Luteal",
 short: "L",
 color: "#c4a06a", // warm gold — progesterone / second half
 oneLiner: "Second half. Cravings, heat, and lower stress buffer. Steady wins.",
 biology:
 "After ovulation your body runs a bit warmer and more progesterone-dominant. Hunger and carb cravings can rise. Sleep can get pickier. Legs can feel heavier on lower day. Migraines and irritability often show up late luteal when hormones drop toward period. For someone building a company and a body at once, this phase is about steady systems, not heroics.",
 hormones:
 "Progesterone leads mid-luteal, then both progesterone and estrogen fall if there is no pregnancy. That fall is what starts the next period and can stir PMS or head pain.",
 guidance:
 "You may feel less patient, more hungry, and less in love with max effort. That is data, not failure. Keep protein and water. Shorten sessions before you skip them. Protect sleep harder than in follicular.",
 protocol: [
 "Gym: keep the week plan, but cut a set or two if sleep or migraine flags. Prefer quality over ego load on lower.",
 "Food: steady meals beat huge deficits. If cravings hit, add protein first, then carbs. Stay on creatine and vitamin D.",
 "Migraine: log triggers (sleep, water, stress, late luteal). Bring a 2 to 3 month pattern to clinic visits.",
 "Work: finish deep device work earlier in luteal. Late luteal is better for lighter admin, content edits, or planning.",
 "If mood or pain is severe every single luteal phase, that is a doctor conversation, not something to tough out forever.",
 ],
 },
};

export type MonthCell = {
 iso: string;
 dayNum: number;
 inMonth: boolean;
 phase: CyclePhaseId | null;
 flow: FlowLevel | null;
 isToday: boolean;
 isPeriodStart: boolean;
};

/** Full month grid (Sun-Sat) with phase colors from period history */
export function buildMonthGrid(
 year: number,
 monthIndex: number, // 0-11
 derived: DerivedCycle
): MonthCell[] {
 const first = new Date(year, monthIndex, 1);
 const startPad = first.getDay(); // 0 Sun
 const gridStart = new Date(first);
 gridStart.setDate(1 - startPad);
 const todayIso = fmtISO(new Date());
 const cells: MonthCell[] = [];

 // index starts by date for fast lookup
 const starts = derived.store.starts.map((s) => s.start);
 const startSet = new Set(starts);

 for (let i = 0; i < 42; i++) {
 const d = new Date(gridStart);
 d.setDate(gridStart.getDate() + i);
 const iso = fmtISO(d);
 const inMonth = d.getMonth() === monthIndex;
 const phase = phaseOnDate(iso, derived);
 cells.push({
 iso,
 dayNum: d.getDate(),
 inMonth,
 phase,
 flow: derived.store.flow[iso] || null,
 isToday: iso === todayIso,
 isPeriodStart: startSet.has(iso),
 });
 }
 return cells;
}

export function phaseOnDate(iso: string, derived: DerivedCycle): CyclePhaseId | null {
 // find segment containing this day
 const segs = [...derived.segments].reverse(); // chronological
 for (const seg of segs) {
 if (iso >= seg.start && iso < seg.end) {
 const day = daysBetween(seg.start, iso) + 1;
 return phaseForDay(day, seg.periodDays, seg.lengthDays);
 }
 }
 // before first start or after , estimate from last cycle length
 if (!derived.current) return null;
 if (iso < derived.current.start) return null;
 const day = daysBetween(derived.current.start, iso) + 1;
 return phaseForDay(
 day,
 derived.current.periodDays,
 derived.stats.avgCycleDays
 );
}

/** Bar chips for a cycle row (WHOOP-style): one chip per day, colored by phase */
export function cycleBarPhases(seg: CycleSegment): CyclePhaseId[] {
 const out: CyclePhaseId[] = [];
 const n = Math.min(seg.lengthDays, 90);
 for (let i = 0; i < n; i++) {
 out.push(phaseForDay(i + 1, seg.periodDays, seg.lengthDays));
 }
 return out;
}

export function logPeriodStart(store: CycleStore, iso: string): CycleStore {
 const exists = store.starts.some((s) => s.start === iso);
 if (exists) return store;
 const starts = [...store.starts, { start: iso, periodDays: 5 }].sort((a, b) =>
 a.start.localeCompare(b.start)
 );
 // mark first day medium flow if empty
 const flow = { ...store.flow };
 if (!flow[iso]) flow[iso] = "medium";
 return { ...store, starts, flow };
}

export function logFlow(
 store: CycleStore,
 iso: string,
 level: FlowLevel | null
): CycleStore {
 const flow = { ...store.flow };
 if (!level) delete flow[iso];
 else flow[iso] = level;
 // if logging flow and no start covers this day, add start
 let starts = store.starts;
 const covered = phaseOnDate(
 iso,
 deriveCycle({ ...store, flow })
 );
 // if bleeding and not near a start, create start
 if (level && !store.starts.some((s) => {
 const dist = daysBetween(s.start, iso);
 return dist >= 0 && dist < 8;
 })) {
 starts = [...store.starts, { start: iso, periodDays: 5 }].sort((a, b) =>
 a.start.localeCompare(b.start)
 );
 }
 void covered;
 // update periodDays on matching start
 starts = starts.map((s) => {
 const dist = daysBetween(s.start, iso);
 if (dist >= 0 && dist < 10 && level) {
 const pd = inferPeriodDays(s.start, flow, s.periodDays || 5);
 return { ...s, periodDays: pd };
 }
 return s;
 });
 return { ...store, starts, flow };
}

export function formatShort(iso: string): string {
 const d = parseISO(iso);
 return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatRange(start: string, endExclusive: string): string {
 const end = addDays(endExclusive, -1);
 return `${formatShort(start)} - ${formatShort(end)}`;
}
