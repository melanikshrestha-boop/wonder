import type {
  CareAppointmentAction,
  CareDateWindow,
  CareParseResult,
  CareService,
  CareTimeOfDay,
} from "./types";

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const EMERGENCY_PATTERN = new RegExp(
  [
    "chest pain",
    "can(?:not|'t) breathe",
    "trouble breathing",
    "severe bleeding",
    "unconscious",
    "stroke",
    "face droop",
    "suicid",
    "overdose",
    "anaphyla",
    "seizure",
  ].join("|"),
  "i"
);

function isoDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function nextWeekday(date: Date, weekday: number): Date {
  const distance = (weekday - date.getDay() + 7) % 7 || 7;
  return addDays(date, distance);
}

function monthIndex(value: string): number {
  return [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].findIndex((month) => month.startsWith(value.toLowerCase()));
}

function dateWindow(
  from: Date,
  to: Date,
  label: string,
  daysOfWeek: number[],
  timeOfDay: CareTimeOfDay[]
): CareDateWindow {
  return {
    from: isoDay(from),
    to: isoDay(to),
    label,
    daysOfWeek,
    timeOfDay,
  };
}

function parseTimeOfDay(text: string): CareTimeOfDay[] {
  const values: CareTimeOfDay[] = [];
  if (/\bmornings?\b|\bbefore\s+(?:noon|12)/i.test(text)) values.push("morning");
  if (/\bafternoons?\b|\bbetween\s+12\s+and\s+5/i.test(text)) values.push("afternoon");
  if (/\bevenings?\b|\bafter\s+(?:5|five)/i.test(text)) values.push("evening");
  return values.length ? values : ["any"];
}

export function parseCareDateWindow(text: string, now = new Date()): CareDateWindow | null {
  const today = startOfDay(now);
  const times = parseTimeOfDay(text);
  const namedDays = Object.entries(WEEKDAYS)
    .filter(([name]) => new RegExp(`\\b${name}s?\\b`, "i").test(text))
    .map(([, value]) => value);
  if (/\bweekdays?\b/i.test(text)) namedDays.push(1, 2, 3, 4, 5);
  if (/\bweekends?\b/i.test(text)) namedDays.push(0, 6);
  const preferredDays = [...new Set(namedDays)].sort((a, b) => a - b);

  if (/\btoday\b/i.test(text)) return dateWindow(today, today, "today", preferredDays, times);
  if (/\btomorrow\b/i.test(text)) {
    const tomorrow = addDays(today, 1);
    return dateWindow(tomorrow, tomorrow, "tomorrow", preferredDays, times);
  }
  if (/\bnext week\b/i.test(text)) {
    const daysToMonday = (8 - today.getDay()) % 7 || 7;
    const monday = addDays(today, daysToMonday);
    return dateWindow(monday, addDays(monday, 6), "next week", preferredDays, times);
  }
  if (/\bthis week\b/i.test(text)) {
    return dateWindow(today, addDays(today, 6 - today.getDay()), "this week", preferredDays, times);
  }
  if (/\bthis month\b/i.test(text)) {
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return dateWindow(today, last, "this month", preferredDays, times);
  }
  if (/\bnext month\b/i.test(text)) {
    const first = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const last = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    return dateWindow(first, last, "next month", preferredDays, times);
  }
  if (/\bwithin (?:the )?next (\d{1,2}) days?\b/i.test(text)) {
    const count = Number(text.match(/\bwithin (?:the )?next (\d{1,2}) days?\b/i)?.[1] || 7);
    return dateWindow(today, addDays(today, count), `within ${count} days`, preferredDays, times);
  }
  if (/\bwithin (?:the )?next (\d{1,2}) weeks?\b/i.test(text)) {
    const count = Number(text.match(/\bwithin (?:the )?next (\d{1,2}) weeks?\b/i)?.[1] || 1);
    return dateWindow(today, addDays(today, count * 7), `within ${count} week${count === 1 ? "" : "s"}`, preferredDays, times);
  }

  const nextNamed = text.match(/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  if (nextNamed?.[1]) {
    const day = nextWeekday(today, WEEKDAYS[nextNamed[1].toLowerCase()]);
    return dateWindow(day, day, `next ${nextNamed[1].toLowerCase()}`, [day.getDay()], times);
  }

  const numeric = text.match(/\b(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?\b/);
  if (numeric) {
    const yearRaw = Number(numeric[3] || today.getFullYear());
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    const date = new Date(year, Number(numeric[1]) - 1, Number(numeric[2]));
    if (!Number.isNaN(date.getTime())) {
      const valid = date.getFullYear() === year
        && date.getMonth() === Number(numeric[1]) - 1
        && date.getDate() === Number(numeric[2]);
      if (valid) return dateWindow(date, date, date.toLocaleDateString(undefined, { month: "long", day: "numeric" }), preferredDays, times);
    }
  }

  const written = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/i
  );
  if (written?.[1] && written[2]) {
    const month = monthIndex(written[1]);
    const year = Number(written[3] || today.getFullYear());
    let date = new Date(year, month, Number(written[2]));
    if (!written[3] && date < today) date = new Date(year + 1, month, Number(written[2]));
    const valid = date.getMonth() === month && date.getDate() === Number(written[2]);
    if (valid) return dateWindow(date, date, date.toLocaleDateString(undefined, { month: "long", day: "numeric" }), preferredDays, times);
  }

  if (preferredDays.length) {
    const dates = preferredDays.map((weekday) => nextWeekday(today, weekday)).sort((a, b) => a.getTime() - b.getTime());
    return dateWindow(dates[0], dates.at(-1) || dates[0], "next available selected day", preferredDays, times);
  }
  return null;
}

function parseAction(text: string): CareAppointmentAction {
  if (/\b(reschedule|move|change)\b/i.test(text)) return "reschedule";
  if (/\b(cancel|drop)\b/i.test(text)) return "cancel";
  if (/\b(check|confirm|verify|when is|what time)\b/i.test(text)) return "check";
  return "book";
}

function parseService(text: string): CareService {
  if (/\b(dental cleaning|teeth cleaning|cleaning|checkup)\b/i.test(text) && /\b(dent|teeth|tooth|cleaning)\b/i.test(text)) return "dental-cleaning";
  if (/\b(tooth|teeth|dent|gum|cavity|jaw)\b/i.test(text)) return "dental-problem";
  if (/\b(annual physical|yearly physical|physical exam|physical|annual checkup|yearly checkup)\b/i.test(text)) return "annual-physical";
  if (/\b(primary care|pcp|general practitioner|family doctor)\b/i.test(text)) return "primary-care";
  if (/\b(eye exam|optomet|vision)\b/i.test(text)) return "eye-exam";
  if (/\b(lab work|blood work|blood test|labs?)\b/i.test(text)) return "lab-work";
  if (/\b(specialist|dermatolog|cardiolog|neurolog|gynecolog|orthoped|allergist|ent\b)\b/i.test(text)) return "specialist";
  return "other";
}

export function careServiceLabel(service: CareService): string {
  const labels: Record<CareService, string> = {
    "dental-cleaning": "Dental cleaning",
    "dental-problem": "Dental visit",
    "annual-physical": "Annual physical",
    "primary-care": "Primary care visit",
    "eye-exam": "Eye exam",
    "lab-work": "Blood draw / labs",
    specialist: "Specialist visit",
    other: "Medical appointment",
  };
  return labels[service];
}

function parseProvider(text: string): string {
  const match = text.match(/\b(?:with|at)\s+(?:dr\.?\s+)?(.+?)(?=\s+(?:next|this|on|in|for|within|tomorrow|today|morning|afternoon|evening|weekday|weekend)|[,.!?]|$)/i);
  const candidate = match?.[1]?.trim() || "";
  return candidate && !/^\d|^(?:home|work|noon|night)$/i.test(candidate)
    ? candidate.replace(/\s+/g, " ")
    : "";
}

function parseReason(text: string, service: CareService): string {
  const explicit = text.match(/\b(?:because|for|about|reason(?: is)?[:\s]+)\s+(.+?)(?=\s+(?:next|this|on)\s+(?:week|month|monday|tuesday|wednesday|thursday|friday)|[.!?]|$)/i);
  if (explicit?.[1] && !/^(?:a|an|my)?\s*(?:appointment|cleaning|physical|checkup)$/i.test(explicit[1].trim())) {
    return explicit[1].trim();
  }
  if (service === "dental-cleaning") return "Routine preventive cleaning";
  if (service === "annual-physical") return "Routine annual physical";
  return "";
}

export function parseCareRequest(text: string, now = new Date()): CareParseResult {
  const clean = text.trim();
  const emergency = EMERGENCY_PATTERN.test(clean);
  const action = parseAction(clean);
  const service = parseService(clean);
  const providerName = parseProvider(clean);
  const window = parseCareDateWindow(clean, now);
  const visitMode = /\b(telehealth|video|virtual)\b/i.test(clean)
    ? "telehealth"
    : /\bin[ -]?person\b/i.test(clean)
      ? "in-person"
      : "either";
  const location = clean.match(/\b(?:near|in)\s+([A-Z][A-Za-z .'-]+?)(?=\s+(?:next|this|on|for|in the)|[,.!?]|$)/)?.[1]?.trim() || "";
  const missing: string[] = [];
  if (action === "book" && !window) missing.push("date window");
  if ((action === "reschedule" || action === "cancel" || action === "check") && !providerName) missing.push("which appointment");
  if (service === "other" && action === "book") missing.push("appointment type");

  return {
    action,
    service,
    title: careServiceLabel(service),
    providerName,
    dateWindow: window,
    locationPreference: location,
    visitMode,
    reason: parseReason(clean, service),
    notes: "",
    missing,
    emergency,
    emergencyMessage: emergency
      ? "This sounds potentially urgent. Care Concierge is only for appointment administration. Call 911 now for immediate danger, or contact an urgent-care service for prompt clinical guidance."
      : "",
    confidence: emergency ? 1 : Math.max(0.35, Math.min(0.98, 0.5 + (service !== "other" ? 0.2 : 0) + (window ? 0.18 : 0) + (providerName ? 0.1 : 0))),
  };
}

export function looksLikeCareCommand(text: string): boolean {
  return /\b(appointment|schedule|book|reschedule|cancel|dentist|dental|doctor|physical|checkup|primary care|pcp|clinic|medical office|eye exam|optomet|lab work|blood work|specialist)\b/i.test(text)
    && !/\b(explain|research|what is|why does|how does)\b/i.test(text.trim());
}
