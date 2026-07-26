/**
 * Composer — turns a request plus a profile into something an office can act
 * on in one pass.
 *
 * The measure of a good booking message is that nobody has to call you back
 * to ask a question. Offices need: who you are, date of birth, insurance
 * carrier and member ID, what you want, why, when you can come, and how to
 * reach you. Omit the member ID and you have not saved yourself a phone call,
 * you have scheduled one.
 *
 * So the composer refuses to pretend. `missing` lists every field an office
 * will ask for that is not on file, and `readyToSend` is false while any
 * required one is absent. Auto-send checks that flag: standing authorisation
 * means "send without asking me", not "send something incomplete".
 *
 * Three output shapes because offices differ: email for those that publish an
 * address, a phone script for the majority that only take calls, and a portal
 * message for MyChart-style systems.
 */
import type { CareProfile, CareProvider, CareRequest } from "./types";

export type ComposedMessage = {
  channel: "email" | "phone" | "portal";
  subject: string;
  body: string;
  /** Empty for phone and portal. */
  to: string;
  /** Fields an office will ask for that are not on file. */
  missing: string[];
  /** False while a required field is missing. Auto-send honours this. */
  readyToSend: boolean;
};

/** Fields no office will book without. */
const REQUIRED: { key: keyof CareProfile; label: string }[] = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "dateOfBirth", label: "Date of birth" },
  { key: "phone", label: "Phone number" },
];

/** Asked for at nearly every booking, but a request can go without them. */
const EXPECTED: { key: keyof CareProfile; label: string }[] = [
  { key: "email", label: "Email" },
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

/** Human availability line from the window and the profile's standing hours. */
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
  if (profile.phone) lines.push(`Phone: ${profile.phone}`);
  if (profile.email) lines.push(`Email: ${profile.email}`);

  if (profile.insuranceCarrier) {
    const insurance = [
      profile.insuranceCarrier,
      profile.insurancePlanName && `(${profile.insurancePlanName})`,
      profile.insuranceMemberId && `· Member ID ${profile.insuranceMemberId}`,
      profile.insuranceGroupNumber && `· Group ${profile.insuranceGroupNumber}`,
    ].filter(Boolean).join(" ");
    lines.push(`Insurance: ${insurance}`);
  }
  if (profile.policyHolderName && profile.policyHolderRelation && profile.policyHolderRelation !== "self") {
    lines.push(`Policy holder: ${profile.policyHolderName} (${profile.policyHolderRelation})`);
  }
  if (profile.primaryCareName) {
    lines.push(`Primary care: ${profile.primaryCareName}${profile.primaryCarePhone ? ` · ${profile.primaryCarePhone}` : ""}`);
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

/**
 * Compose a booking message.
 *
 * `channel` is chosen from what the provider actually publishes rather than
 * assumed: an email address means email, otherwise a phone script, because a
 * beautifully written email to an office that does not read email books
 * nothing.
 */
export function compose(
  request: CareRequest,
  provider: CareProvider | null,
  profile: CareProfile,
  channelOverride?: ComposedMessage["channel"]
): ComposedMessage {
  const { required, expected } = missingFields(profile);
  const providerEmail = (provider as { email?: string } | null)?.email?.trim() || "";
  const channel: ComposedMessage["channel"] =
    channelOverride || (providerEmail ? "email" : provider?.phone ? "phone" : "portal");

  const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "the patient";
  const what = request.title || request.reason || "an appointment";
  const availability = availabilityLine(request, profile);
  const office = provider?.name || request.providerName || "the office";

  const subject =
    request.action === "reschedule"
      ? `Reschedule request — ${name}`
      : request.action === "cancel"
        ? `Cancellation — ${name}`
        : `Appointment request — ${what} — ${name}`;

  if (channel === "phone") {
    // Written to be read aloud: the answers come in the order they are asked.
    const script = [
      `Call ${office}${provider?.phone ? ` at ${provider.phone}` : ""}.`,
      "",
      `"Hi, I'd like to book ${what.toLowerCase()}."`,
      "",
      "They will ask, in roughly this order:",
      ...patientBlock(profile).map((l) => `  · ${l}`),
      "",
      `Reason for visit: ${request.reason || what}`,
      `Availability: ${availability}`,
      request.visitMode !== "either" ? `Visit type: ${request.visitMode}` : "",
      ...clinicalBlock(profile).map((l) => `  · ${l}`),
      "",
      "Before hanging up, get:",
      "  · Date and time",
      "  · Provider name",
      "  · Arrival time and what to bring",
      "  · Whether anything needs doing beforehand (fasting, forms, records)",
    ].filter(Boolean).join("\n");

    return {
      channel,
      subject,
      body: script,
      to: provider?.phone || "",
      missing: [...required, ...expected],
      readyToSend: required.length === 0,
    };
  }

  const greeting = channel === "portal" ? "Hello," : `Hello ${office},`;
  const ask =
    request.action === "cancel"
      ? `I need to cancel ${what.toLowerCase()}.`
      : request.action === "reschedule"
        ? `I need to reschedule ${what.toLowerCase()}.`
        : `I'd like to request ${what.toLowerCase()}.`;

  const body = [
    greeting,
    "",
    ask,
    request.reason ? `Reason: ${request.reason}` : "",
    "",
    ...patientBlock(profile),
    "",
    `Availability: ${availability}`,
    request.visitMode !== "either" ? `Preferred visit type: ${request.visitMode}` : "",
    profile.needsInterpreter ? `Interpreter needed: ${profile.needsInterpreter}` : "",
    ...clinicalBlock(profile),
    request.notes ? `\nNotes: ${request.notes}` : "",
    "",
    "Please reply with a date and time, anything I should bring, and whether I need to arrive early. If nothing on my list works, send your next available and I'll take it.",
    "",
    "Thank you,",
    name,
    profile.phone || "",
  ].filter((line) => line !== "").join("\n");

  return {
    channel,
    subject,
    body,
    to: channel === "email" ? providerEmail : "",
    missing: [...required, ...expected],
    readyToSend: required.length === 0 && (channel !== "email" || Boolean(providerEmail)),
  };
}

// ─── Standing authorisation ──────────────────────────────────────────────────

export type AutoSendGrant = {
  enabled: boolean;
  /** ISO timestamp the grant was given. */
  grantedAt: string | null;
  /** Only these channels may go without a per-message prompt. */
  channels: ComposedMessage["channel"][];
  /** Never auto-send a cancellation — that one is hard to undo. */
  allowCancellations: boolean;
  /** Upper bound on messages per day, so a loop cannot mail an office 40 times. */
  dailyLimit: number;
  /** Audit: what went out, when, to whom. */
  log: { at: string; to: string; subject: string; channel: string }[];
};

export function emptyGrant(): AutoSendGrant {
  return {
    enabled: false,
    grantedAt: null,
    channels: ["email"],
    allowCancellations: false,
    dailyLimit: 6,
    log: [],
  };
}

function sameDay(iso: string, today: string): boolean {
  return iso.slice(0, 10) === today.slice(0, 10);
}

/**
 * Whether this specific message may go without asking.
 *
 * Returns a reason on refusal rather than a bare false, because "it silently
 * did nothing" is the worst behaviour an agent with send authority can have.
 */
export function canAutoSend(
  grant: AutoSendGrant,
  message: ComposedMessage,
  request: CareRequest,
  now = new Date().toISOString()
): { allowed: boolean; reason: string } {
  if (!grant.enabled) return { allowed: false, reason: "Auto-send is off" };
  if (!message.readyToSend) {
    return { allowed: false, reason: `Missing required detail: ${message.missing.join(", ")}` };
  }
  if (!grant.channels.includes(message.channel)) {
    return { allowed: false, reason: `Auto-send is not enabled for ${message.channel}` };
  }
  if (message.channel === "email" && !message.to) {
    return { allowed: false, reason: "No email address on file for this office" };
  }
  if (request.action === "cancel" && !grant.allowCancellations) {
    return { allowed: false, reason: "Cancellations always need a confirmation" };
  }
  const todayCount = grant.log.filter((entry) => sameDay(entry.at, now)).length;
  if (todayCount >= grant.dailyLimit) {
    return { allowed: false, reason: `Daily limit of ${grant.dailyLimit} messages reached` };
  }
  return { allowed: true, reason: "Covered by standing authorisation" };
}

export function recordSend(grant: AutoSendGrant, message: ComposedMessage, at = new Date().toISOString()): AutoSendGrant {
  return {
    ...grant,
    log: [
      ...grant.log.slice(-199),
      { at, to: message.to || "phone", subject: message.subject, channel: message.channel },
    ],
  };
}

/**
 * Everything needed to actually execute a send, in one object.
 *
 * The app cannot send email itself — it is a static page with no credential.
 * This is the payload handed to whatever does have one.
 */
export type HandoffPacket = {
  requestId: string;
  message: ComposedMessage;
  provider: { name: string; phone: string; address: string } | null;
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
      ? { name: provider.name, phone: provider.phone, address: provider.address }
      : null,
    authorised: check.allowed,
    authorisationReason: check.reason,
    createdAt: now,
  };
}
