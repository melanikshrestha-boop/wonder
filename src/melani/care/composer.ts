/**
 * Composer — turns a due item + profile into a booking *prep pack*.
 *
 * Reality check: almost nobody books via cold email to a clinic.
 * Front desks answer the phone, patient portals take form requests, and
 * some offices have a "book online" link. Email is a rare last resort.
 *
 * Channel priority (unless overridden):
 *   1. phone  — call script + tel: link (default for nearly every office)
 *   2. portal — patient-portal / website book flow (MyChart-style, Zocdoc, etc.)
 *   3. email  — only if the office has no phone and no web booking path
 *
 * The measure of a good pack: you can call (or open the portal) with every
 * answer the front desk will ask, without scrambling for your insurance card.
 */
import type { CareProfile, CareProvider, CareRequest } from "./types";

export type BookingChannel = "phone" | "portal" | "email";

export type ComposedMessage = {
  channel: BookingChannel;
  /** Short label for the action the human takes. */
  subject: string;
  /** Call script, portal paste, or (rare) email body. */
  body: string;
  /** Phone number, portal URL, or email address — empty if unknown. */
  to: string;
  /** Fields an office will ask for that are not on file. */
  missing: string[];
  /** False while a required identity field is missing. */
  readyToSend: boolean;
  /** Human instruction shown above the pack. */
  howToBook: string;
};

/** Fields no office will book without. */
const REQUIRED: { key: keyof CareProfile; label: string }[] = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "dateOfBirth", label: "Date of birth" },
  { key: "phone", label: "Phone number" },
];

/** Asked at nearly every booking; request can still proceed without them. */
const EXPECTED: { key: keyof CareProfile; label: string }[] = [
  { key: "insuranceCarrier", label: "Insurance carrier" },
  { key: "insuranceMemberId", label: "Insurance member ID" },
];

function value(profile: CareProfile, key: keyof CareProfile): string {
  const v = profile[key];
  return typeof v === "string" ? v.trim() : "";
}

export function missingFields(profile: CareProfile): { required: string[]; expected: string[] } {
  return {
    required: REQUIRED.filter((f) => !value(profile, f.key)).map((f) => f.label),
    expected: EXPECTED.filter((f) => !value(profile, f.key)).map((f) => f.label),
  };
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function availabilityLine(request: CareRequest, profile: CareProfile): string {
  const parts: string[] = [];
  const w = request.dateWindow;

  if (w?.label) parts.push(w.label);
  else if (w?.from && w?.to) parts.push(`between ${w.from} and ${w.to}`);

  const days = w?.daysOfWeek?.length ? w.daysOfWeek : profile.preferredDays || [];
  if (days.length && days.length < 7) {
    parts.push(`on ${days.map((d) => DAY_NAMES[d]).filter(Boolean).join(", ")}`);
  }

  const times = w?.timeOfDay?.filter((t) => t !== "any") || [];
  if (times.length) parts.push(`in the ${times.join(" or ")}`);
  else if (profile.earliestTime && profile.latestTime) {
    parts.push(`between ${profile.earliestTime} and ${profile.latestTime}`);
  }

  return parts.length ? parts.join(", ") : "any time you have available";
}

function patientBlock(profile: CareProfile): string[] {
  const lines: string[] = [];
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  if (name) lines.push(`Patient: ${name}`);
  if (profile.dateOfBirth) lines.push(`Date of birth: ${profile.dateOfBirth}`);
  if (profile.phone) lines.push(`Callback phone: ${profile.phone}`);
  if (profile.email) lines.push(`Email on file: ${profile.email}`);

  if (profile.insuranceCarrier) {
    const insurance = [
      profile.insuranceCarrier,
      profile.insurancePlanName && `(${profile.insurancePlanName})`,
      profile.insuranceMemberId && `· Member ID ${profile.insuranceMemberId}`,
      profile.insuranceGroupNumber && `· Group ${profile.insuranceGroupNumber}`,
    ]
      .filter(Boolean)
      .join(" ");
    lines.push(`Insurance: ${insurance}`);
  }
  if (
    profile.policyHolderName &&
    profile.policyHolderRelation &&
    profile.policyHolderRelation !== "self"
  ) {
    lines.push(`Policy holder: ${profile.policyHolderName} (${profile.policyHolderRelation})`);
  }
  if (profile.primaryCareName) {
    lines.push(
      `Primary care: ${profile.primaryCareName}${profile.primaryCarePhone ? ` · ${profile.primaryCarePhone}` : ""}`
    );
  }
  return lines;
}

function clinicalBlock(profile: CareProfile): string[] {
  const lines: string[] = [];
  if (profile.allergies) lines.push(`Allergies: ${profile.allergies}`);
  if (profile.conditions) lines.push(`Conditions: ${profile.conditions}`);
  if (profile.medications) lines.push(`Medications: ${profile.medications}`);
  return lines;
}

function providerEmail(provider: CareProvider | null): string {
  return ((provider as { email?: string } | null)?.email || "").trim();
}

/**
 * Pick how this office is actually bookable.
 * Phone wins. Portal/website second. Email only if nothing else exists.
 */
export function pickChannel(
  provider: CareProvider | null,
  channelOverride?: BookingChannel
): BookingChannel {
  if (channelOverride) return channelOverride;
  if (provider?.phone?.trim()) return "phone";
  if (provider?.website?.trim()) return "portal";
  if (providerEmail(provider)) return "email";
  // No office contact yet — still give a phone script shape so the user
  // knows what to say once they have a number.
  return "phone";
}

function phoneScript(
  request: CareRequest,
  provider: CareProvider | null,
  profile: CareProfile,
  what: string,
  availability: string,
  office: string
): string {
  return [
    `CALL SCRIPT — ${what}`,
    provider?.phone ? `Number: ${provider.phone}` : "Number: (add office phone under Care team / providers)",
    office !== "the office" ? `Office: ${office}` : "",
    "",
    "── Open with ──",
    `"Hi, I'd like to book ${what.toLowerCase()}."`,
    request.action === "reschedule" ? `"I need to reschedule an existing appointment."` : "",
    request.action === "cancel" ? `"I need to cancel an appointment."` : "",
    "",
    "── They will ask (have these ready) ──",
    ...patientBlock(profile).map((l) => `  · ${l}`),
    "",
    `Reason for visit: ${request.reason || what}`,
    `Availability: ${availability}`,
    request.visitMode !== "either" ? `Visit type: ${request.visitMode}` : "",
    ...clinicalBlock(profile).map((l) => `  · ${l}`),
    request.notes ? `Notes: ${request.notes}` : "",
    "",
    "── Before you hang up, get ──",
    "  · Date and time of the appointment",
    "  · Provider / hygienist name",
    "  · Arrival time and what to bring (ID, insurance card)",
    "  · Prep (fasting, forms, records, referral)",
    "  · Cancellation policy if you might need to move it",
    "",
    "── After the call ──",
    "  · Tap “Booked — log it” in Care and enter the date",
    "  · Optional: save the .ics calendar file from the appointment card",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function portalCopy(
  request: CareRequest,
  provider: CareProvider | null,
  profile: CareProfile,
  what: string,
  availability: string
): string {
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "Patient";
  return [
    "PORTAL / BOOK-ONLINE PASTE",
    provider?.website ? `Open: ${provider.website}` : "Open the office patient portal or “Book” page.",
    "",
    "Copy into the reason / notes field:",
    "─".repeat(28),
    `Request: ${what}`,
    request.reason ? `Reason: ${request.reason}` : "",
    `Patient: ${name}`,
    profile.dateOfBirth ? `DOB: ${profile.dateOfBirth}` : "",
    profile.phone ? `Phone: ${profile.phone}` : "",
    profile.insuranceCarrier
      ? `Insurance: ${profile.insuranceCarrier}${profile.insuranceMemberId ? ` · ID ${profile.insuranceMemberId}` : ""}`
      : "",
    `Availability: ${availability}`,
    request.visitMode !== "either" ? `Visit: ${request.visitMode}` : "",
    ...clinicalBlock(profile),
    request.notes ? `Notes: ${request.notes}` : "",
    "─".repeat(28),
    "",
    "If the portal only offers a callback request, paste the block above and",
    "keep your phone free — they usually call back the same day or next.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function emailBody(
  request: CareRequest,
  provider: CareProvider | null,
  profile: CareProfile,
  what: string,
  availability: string,
  office: string
): string {
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "the patient";
  const ask =
    request.action === "cancel"
      ? `I need to cancel ${what.toLowerCase()}.`
      : request.action === "reschedule"
        ? `I need to reschedule ${what.toLowerCase()}.`
        : `I'd like to request ${what.toLowerCase()}.`;

  return [
    `Hello ${office},`,
    "",
    ask,
    request.reason ? `Reason: ${request.reason}` : "",
    "",
    ...patientBlock(profile),
    "",
    `Availability: ${availability}`,
    request.visitMode !== "either" ? `Preferred visit type: ${request.visitMode}` : "",
    ...clinicalBlock(profile),
    request.notes ? `\nNotes: ${request.notes}` : "",
    "",
    "Please reply with a date and time, anything I should bring, and whether I need to arrive early.",
    "",
    "Thank you,",
    name,
    profile.phone || "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/**
 * Build a booking prep pack for this request + office.
 */
export function compose(
  request: CareRequest,
  provider: CareProvider | null,
  profile: CareProfile,
  channelOverride?: BookingChannel
): ComposedMessage {
  const { required, expected } = missingFields(profile);
  const channel = pickChannel(provider, channelOverride);
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "the patient";
  const what = request.title || request.reason || "an appointment";
  const availability = availabilityLine(request, profile);
  const office = provider?.name || request.providerName || "the office";
  const missing = [...required, ...expected];
  const readyToSend = required.length === 0;

  if (channel === "phone") {
    return {
      channel,
      subject: `Call to book — ${what}`,
      body: phoneScript(request, provider, profile, what, availability, office),
      to: provider?.phone?.trim() || "",
      missing,
      readyToSend,
      howToBook: provider?.phone
        ? "Most offices book by phone. Tap Call, read the script, log the slot when you’re done."
        : "Add the office phone number, then call with this script. Email is almost never how slots are booked.",
    };
  }

  if (channel === "portal") {
    return {
      channel,
      subject: `Book online — ${what}`,
      body: portalCopy(request, provider, profile, what, availability),
      to: provider?.website?.trim() || "",
      missing,
      readyToSend,
      howToBook: "Use the office website or patient portal. Paste the block into notes / reason for visit.",
    };
  }

  // Email — last resort only
  return {
    channel: "email",
    subject: `Appointment request — ${what} — ${name}`,
    body: emailBody(request, provider, profile, what, availability, office),
    to: providerEmail(provider),
    missing,
    readyToSend: readyToSend && Boolean(providerEmail(provider)),
    howToBook:
      "No phone or portal on file — email is a weak path for clinics. Prefer adding a phone number and calling.",
  };
}

// ─── Standing prep grant (not “auto-email the world”) ──────────────────────

export type AutoSendGrant = {
  enabled: boolean;
  /** ISO timestamp the grant was given. */
  grantedAt: string | null;
  /** Channels Care may auto-prep without an extra prompt. */
  channels: BookingChannel[];
  /** Never auto-prep a cancellation without confirmation. */
  allowCancellations: boolean;
  /** Cap on prep packs “actioned” per day (call logs / portal opens). */
  dailyLimit: number;
  /** Audit: what was prepped/logged, when, where. */
  log: { at: string; to: string; subject: string; channel: string }[];
};

export function emptyGrant(): AutoSendGrant {
  return {
    enabled: false,
    grantedAt: null,
    // Phone is the real booking path. Portal second. Email off by default.
    channels: ["phone", "portal"],
    allowCancellations: false,
    dailyLimit: 6,
    log: [],
  };
}

function sameDay(iso: string, today: string): boolean {
  return iso.slice(0, 10) === today.slice(0, 10);
}

/**
 * Whether this pack may be treated as “standing prep” without asking again.
 * Name kept as canAutoSend for store compatibility — it means auto-prep, not mail blast.
 */
export function canAutoSend(
  grant: AutoSendGrant,
  message: ComposedMessage,
  request: CareRequest,
  now = new Date().toISOString()
): { allowed: boolean; reason: string } {
  if (!grant.enabled) return { allowed: false, reason: "Standing prep is off — open the pack yourself" };
  if (!message.readyToSend) {
    return { allowed: false, reason: `Missing required detail: ${message.missing.join(", ")}` };
  }
  if (!grant.channels.includes(message.channel)) {
    return { allowed: false, reason: `Standing prep is not enabled for ${message.channel}` };
  }
  if (message.channel === "phone" && !message.to) {
    return { allowed: false, reason: "No office phone on file — add it under providers" };
  }
  if (message.channel === "portal" && !message.to) {
    return { allowed: false, reason: "No portal / website on file for this office" };
  }
  if (message.channel === "email" && !message.to) {
    return { allowed: false, reason: "No email on file (and email is a last resort anyway)" };
  }
  if (request.action === "cancel" && !grant.allowCancellations) {
    return { allowed: false, reason: "Cancellations always need a confirmation" };
  }
  const todayCount = grant.log.filter((entry) => sameDay(entry.at, now)).length;
  if (todayCount >= grant.dailyLimit) {
    return { allowed: false, reason: `Daily prep cap of ${grant.dailyLimit} reached` };
  }
  return { allowed: true, reason: "Covered by standing prep" };
}

export function recordSend(
  grant: AutoSendGrant,
  message: ComposedMessage,
  at = new Date().toISOString()
): AutoSendGrant {
  return {
    ...grant,
    log: [
      ...grant.log.slice(-199),
      {
        at,
        to: message.to || message.channel,
        subject: message.subject,
        channel: message.channel,
      },
    ],
  };
}

/**
 * Everything needed to book: script/copy + office contact + whether standing prep covers it.
 */
export type HandoffPacket = {
  requestId: string;
  message: ComposedMessage;
  provider: { name: string; phone: string; address: string; website: string } | null;
  authorised: boolean;
  authorisationReason: string;
  createdAt: string;
};

export function buildHandoff(
  request: CareRequest,
  provider: CareProvider | null,
  profile: CareProfile,
  grant: AutoSendGrant,
  now = new Date().toISOString()
): HandoffPacket {
  const message = compose(request, provider, profile);
  const check = canAutoSend(grant, message, request, now);
  return {
    requestId: request.id,
    message,
    provider: provider
      ? {
          name: provider.name,
          phone: provider.phone,
          address: provider.address,
          website: provider.website,
        }
      : null,
    authorised: check.allowed,
    authorisationReason: check.reason,
    createdAt: now,
  };
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, "")}`;
}

export function portalHref(url: string): string {
  const t = url.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}
