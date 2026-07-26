/**
 * Due engine — works out what care is overdue so the agent can start a
 * request without being asked.
 *
 * This is the difference between a form and an agent. A form waits for you to
 * remember that your dental cleaning was fourteen months ago. This computes it
 * and opens the request itself.
 *
 * ── On the intervals ─────────────────────────────────────────────────────
 * These are the routine intervals commonly used in US primary care, and they
 * are general guidance, not a care plan. Real intervals depend on personal
 * and family history, and a clinician sets them. Every rule carries its
 * `basis` so the UI can show where the number came from rather than asserting
 * it, and any rule can be overridden or switched off.
 *
 * Nothing here is diagnostic. It compares two dates and applies an interval.
 */
import type { CareProfile, CareService } from "./types";

export type DueRuleId =
  | "annual-physical"
  | "dental-cleaning"
  | "eye-exam"
  | "skin-check"
  | "well-woman"
  | "flu-shot"
  | "lab-panel"
  | "dental-xray";

export type DueRule = {
  id: DueRuleId;
  label: string;
  service: CareService;
  /** Months between visits. */
  intervalMonths: number;
  /** Minimum age this applies from. */
  fromAge: number;
  /** Restrict to a legal sex, when the rule is anatomy-specific. */
  sex?: CareProfile["legalSex"];
  /** Where the interval comes from — shown, never hidden behind a number. */
  basis: string;
  /** What to say when booking it. */
  reason: string;
  /** Only fires in these months (1-12), for seasonal care. */
  months?: number[];
};

export const DUE_RULES: DueRule[] = [
  {
    id: "annual-physical",
    label: "Annual physical",
    service: "primary-care",
    intervalMonths: 12,
    fromAge: 0,
    basis: "Routine well visit, commonly annual and generally covered as preventive care",
    reason: "Routine annual preventive visit",
  },
  {
    id: "dental-cleaning",
    label: "Dental cleaning",
    service: "dental-cleaning",
    intervalMonths: 6,
    fromAge: 0,
    basis: "Twice-yearly cleaning is the interval most dental plans cover in full",
    reason: "Routine cleaning and exam",
  },
  {
    id: "dental-xray",
    label: "Dental X-rays",
    service: "dental-cleaning",
    intervalMonths: 24,
    fromAge: 0,
    basis: "Bitewing X-rays commonly every 1–2 years for low-risk adults",
    reason: "Routine bitewing X-rays with cleaning",
  },
  {
    id: "eye-exam",
    label: "Eye exam",
    service: "eye-exam",
    intervalMonths: 24,
    fromAge: 0,
    basis: "Every 1–2 years for healthy adults; annually if you wear corrective lenses",
    reason: "Routine vision and eye health exam",
  },
  {
    id: "skin-check",
    label: "Skin check",
    service: "specialist",
    intervalMonths: 12,
    fromAge: 18,
    basis: "Annual full-body check is typical where there is a mole history or high sun exposure",
    reason: "Full-body skin examination",
  },
  {
    id: "well-woman",
    label: "Well-woman visit",
    service: "specialist",
    intervalMonths: 12,
    fromAge: 18,
    sex: "female",
    basis: "Annual well-woman visit; screening intervals within it are set by your clinician",
    reason: "Routine well-woman visit",
  },
  {
    id: "flu-shot",
    label: "Flu shot",
    service: "primary-care",
    intervalMonths: 12,
    fromAge: 0,
    months: [9, 10, 11],
    basis: "Annual, ideally before the end of October",
    reason: "Seasonal influenza vaccination",
  },
  {
    id: "lab-panel",
    label: "Routine bloodwork",
    service: "lab-work",
    intervalMonths: 12,
    fromAge: 18,
    basis: "Commonly drawn alongside the annual physical",
    reason: "Routine blood panel ordered with the annual visit",
  },
];

/** When each rule was last satisfied, plus per-rule overrides. */
export type CareHistory = {
  /** rule id → ISO date of the last completed visit. */
  lastDone: Record<string, string>;
  /** Rules the owner has switched off. */
  disabled: string[];
  /** Interval overrides in months, e.g. a clinician said every 3 months. */
  intervalOverride: Record<string, number>;
};

export function emptyCareHistory(): CareHistory {
  return { lastDone: {}, disabled: [], intervalOverride: {} };
}

export type DueItem = {
  rule: DueRule;
  /** ISO date it became (or becomes) due. */
  dueOn: string;
  /** Negative when overdue. */
  daysUntilDue: number;
  overdueDays: number;
  status: "overdue" | "due-soon" | "scheduled-window" | "not-yet";
  lastDone: string | null;
  /** Why this surfaced, in one line. */
  because: string;
};

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1 + months, d);
  return toIso(date);
}

function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ms = Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
  return Math.round(ms / 86400000);
}

/** Age in whole years from a date of birth. */
export function ageFrom(dateOfBirth: string, on = toIso(new Date())): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return null;
  const days = daysBetween(dateOfBirth, on);
  if (days < 0) return null;
  return Math.floor(days / 365.2425);
}

/**
 * What is due, most overdue first.
 *
 * A rule with no recorded last-visit is treated as due now rather than
 * skipped — never having had a dental cleaning is exactly the case worth
 * surfacing, and silence there would be the wrong default.
 */
export function computeDue(
  profile: CareProfile,
  history: CareHistory,
  today = toIso(new Date())
): DueItem[] {
  const age = profile.dateOfBirth ? ageFrom(profile.dateOfBirth, today) : null;
  const month = Number(today.slice(5, 7));
  const out: DueItem[] = [];

  for (const rule of DUE_RULES) {
    if (history.disabled.includes(rule.id)) continue;
    // Age gate only applies when a date of birth is known; without one the
    // rule still shows, because hiding care behind a missing field is worse.
    if (age !== null && age < rule.fromAge) continue;
    if (rule.sex && profile.legalSex && profile.legalSex !== rule.sex) continue;
    if (rule.months && !rule.months.includes(month)) continue;

    const interval = history.intervalOverride[rule.id] ?? rule.intervalMonths;
    const lastDone = history.lastDone[rule.id] || null;

    if (!lastDone) {
      out.push({
        rule,
        dueOn: today,
        daysUntilDue: 0,
        overdueDays: 0,
        status: "overdue",
        lastDone: null,
        because: `No ${rule.label.toLowerCase()} on record. ${rule.basis}.`,
      });
      continue;
    }

    const dueOn = addMonths(lastDone, interval);
    const daysUntilDue = daysBetween(today, dueOn);
    const overdueDays = daysUntilDue < 0 ? -daysUntilDue : 0;
    // 30 days of lead time, because booking is rarely same-week.
    const status: DueItem["status"] =
      daysUntilDue < 0 ? "overdue" : daysUntilDue <= 30 ? "due-soon" : "not-yet";

    out.push({
      rule,
      dueOn,
      daysUntilDue,
      overdueDays,
      status,
      lastDone,
      because:
        status === "overdue"
          ? `Last ${rule.label.toLowerCase()} ${lastDone}, ${overdueDays} days past a ${interval}-month interval.`
          : status === "due-soon"
            ? `Due ${dueOn}, in ${daysUntilDue} days. Booking usually takes longer than that.`
            : `Next due ${dueOn}.`,
    });
  }

  const rank = { overdue: 0, "due-soon": 1, "scheduled-window": 2, "not-yet": 3 };
  return out.sort(
    (a, b) => rank[a.status] - rank[b.status] || b.overdueDays - a.overdueDays || a.daysUntilDue - b.daysUntilDue
  );
}

/** Only what the agent should act on now. */
export function actionable(items: DueItem[]): DueItem[] {
  return items.filter((i) => i.status === "overdue" || i.status === "due-soon");
}

/** Record a completed visit, which resets that rule's clock. */
export function markDone(history: CareHistory, ruleId: string, on: string): CareHistory {
  return { ...history, lastDone: { ...history.lastDone, [ruleId]: on } };
}
