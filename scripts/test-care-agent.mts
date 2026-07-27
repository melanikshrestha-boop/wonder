/**
 * Care agent tests — due engine, phone-first composer, standing prep rails.
 * Run: npm run test:care-agent
 */

const values = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, String(v)),
    removeItem: (k: string) => values.delete(k),
  },
});

const DUE = await import("../src/melani/care/dueEngine.ts");
const C = await import("../src/melani/care/composer.ts");
import type { CareProfile, CareProvider, CareRequest } from "../src/melani/care/types.ts";

let passed = 0;
let failed = 0;
function assert(name: string, cond: unknown) {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.log(`  ✗ ${name}`); }
}

const TODAY = "2026-07-26";

const FULL: CareProfile = {
  firstName: "Melani", lastName: "Shrestha",
  phone: "555-0142", email: "melani@example.com",
  city: "New York", state: "NY",
  insuranceCarrier: "Aetna",
  dateOfBirth: "2008-03-14",
  legalSex: "female",
  insuranceMemberId: "W1234567", insuranceGroupNumber: "0099",
  insurancePlanName: "Open Choice PPO",
  primaryCareName: "Dr. Megan Ververis", primaryCarePhone: "555-0188",
  allergies: "None known",
  preferredDays: [1, 3, 5],
  earliestTime: "15:00", latestTime: "18:00",
};

const SPARSE: CareProfile = {
  firstName: "Melani", lastName: "", phone: "", email: "",
  city: "", state: "", insuranceCarrier: "",
};

console.log("\nDue engine");
assert("age is computed from a date of birth", DUE.ageFrom("2008-03-14", TODAY) === 18);
assert("a birthday later this year has not happened yet", DUE.ageFrom("2008-12-31", TODAY) === 17);
assert("a malformed date returns null", DUE.ageFrom("not-a-date") === null);
assert("a future date of birth returns null", DUE.ageFrom("2030-01-01", TODAY) === null);

const empty = DUE.emptyCareHistory();
const dueNothingKnown = DUE.computeDue(FULL, empty, TODAY);
assert("with no history, care shows as due rather than silently skipped",
  dueNothingKnown.length > 0 && dueNothingKnown.every((d) => d.status === "overdue"));
assert("a missing record explains itself",
  dueNothingKnown[0].because.includes("No ") && dueNothingKnown[0].because.includes("on record"));

const history = {
  lastDone: {
    "annual-physical": "2026-06-01",   // recent
    "dental-cleaning": "2025-01-10",   // long overdue
    "eye-exam": "2026-07-01",          // recent
    "skin-check": "2026-08-10",        // future-dated, not yet due
  },
  disabled: ["lab-panel"],
  intervalOverride: {},
};
const due = DUE.computeDue(FULL, history, TODAY);
const byId = Object.fromEntries(due.map((d) => [d.rule.id, d]));

assert("a recent visit is not due", byId["annual-physical"].status === "not-yet");
assert("a long-overdue visit is flagged", byId["dental-cleaning"].status === "overdue");
// Last cleaning 2025-01-10 on a 6-month interval means it fell due
// 2025-07-10, which is 381 days before 2026-07-26. Overdue counts from the
// due date, not from the visit.
assert("overdue days count from the due date, not the last visit",
  byId["dental-cleaning"].overdueDays === 381);
assert("the due date is the visit plus the interval",
  byId["dental-cleaning"].dueOn === "2025-07-10");
assert("disabled rules are excluded", !byId["lab-panel"]);
assert("most overdue sorts first", due[0].status === "overdue");
assert("overdue explanation cites the last visit and the interval",
  /Last .*2025-01-10.*interval/.test(byId["dental-cleaning"].because));

assert("actionable filters to overdue and due-soon",
  DUE.actionable(due).every((d) => d.status === "overdue" || d.status === "due-soon"));

// Sex-specific rules must not fire for someone they don't apply to.
const male = DUE.computeDue({ ...FULL, legalSex: "male" }, empty, TODAY);
assert("a sex-specific rule does not fire for another sex",
  !male.some((d) => d.rule.id === "well-woman"));
assert("the same rule does fire when it applies",
  DUE.computeDue(FULL, empty, TODAY).some((d) => d.rule.id === "well-woman"));

// Age gating.
const child = DUE.computeDue({ ...FULL, dateOfBirth: "2019-01-01" }, empty, TODAY);
assert("adult-only rules are gated by age", !child.some((d) => d.rule.id === "skin-check"));
assert("age-zero rules still apply to a child", child.some((d) => d.rule.id === "dental-cleaning"));
assert("with no date of birth, rules still show rather than hiding care",
  DUE.computeDue(SPARSE, empty, TODAY).some((d) => d.rule.id === "skin-check"));

// Seasonal.
assert("a seasonal rule is silent out of season",
  !DUE.computeDue(FULL, empty, "2026-04-15").some((d) => d.rule.id === "flu-shot"));
assert("a seasonal rule fires in season",
  DUE.computeDue(FULL, empty, "2026-10-15").some((d) => d.rule.id === "flu-shot"));

// Clinician override.
const tighter = DUE.computeDue(FULL, { ...history, intervalOverride: { "annual-physical": 1 } }, TODAY);
assert("an interval override shortens the cycle",
  tighter.find((d) => d.rule.id === "annual-physical")!.status !== "not-yet");

assert("marking done resets the clock",
  DUE.markDone(empty, "dental-cleaning", TODAY).lastDone["dental-cleaning"] === TODAY);
assert("every rule states where its interval came from",
  DUE.DUE_RULES.every((r) => r.basis.length > 20));

console.log("\nComposer (phone-first booking)");
const provider: CareProvider & { email?: string } = {
  id: "p1", name: "Riverside Dental", specialty: "Dentistry",
  phone: "555-0170", address: "12 Main St", website: "",
  email: "front@riversidedental.example",
} as CareProvider & { email?: string };

const request: CareRequest = {
  id: "r1", action: "book", service: "dental-cleaning",
  title: "Dental cleaning", providerId: "p1", providerName: "Riverside Dental",
  dateWindow: { from: "2026-08-01", to: "2026-08-31", label: "in August", daysOfWeek: [1, 3], timeOfDay: ["afternoon"] },
  appointmentId: null, locationPreference: "", visitMode: "in-person",
  reason: "Routine cleaning and exam", notes: "",
  status: "ready-for-review", missing: [], sourceText: "",
  createdAt: TODAY, updatedAt: TODAY, approvedAt: null, sentAt: null,
  externalId: null, failureReason: null,
};

// Phone wins even when the office also has email — clinics don't book by cold email.
const phone = C.compose(request, provider, FULL);
assert("phone beats email when both exist", phone.channel === "phone");
assert("call pack dials the office phone", phone.to === "555-0170");
assert("date of birth is on the script", phone.body.includes("2008-03-14"));
assert("member ID is on the script", phone.body.includes("W1234567"));
assert("group number is on the script", phone.body.includes("0099"));
assert("availability is stated", /August/.test(phone.body) && /Monday|Wednesday/.test(phone.body));
assert("a complete profile is ready", phone.readyToSend === true);
assert("script tells you what to get before hanging up", /Date and time/.test(phone.body));
assert("howToBook explains phone path", /phone/i.test(phone.howToBook));

const portal = C.compose(
  request,
  { ...provider, phone: "", website: "https://riverside.example/book", email: "" } as CareProvider,
  FULL
);
assert("website without phone → portal pack", portal.channel === "portal");
assert("portal pack points at the site", portal.to.includes("riverside.example"));
assert("portal pack has pasteable patient block", /Patient:/i.test(portal.body));

const emailOnly = C.compose(
  request,
  { ...provider, phone: "", website: "", email: "front@riversidedental.example" } as CareProvider & { email?: string },
  FULL
);
assert("email only when no phone and no portal", emailOnly.channel === "email");
assert("email is addressed to the office", emailOnly.to === "front@riversidedental.example");
assert("email path is labeled last-resort in howToBook", /last|weak|prefer/i.test(emailOnly.howToBook));

const sparse = C.compose(request, provider, SPARSE);
assert("a sparse profile is not ready", sparse.readyToSend === false);
assert("missing required fields are named",
  sparse.missing.includes("Date of birth") && sparse.missing.includes("Phone number"));

const m = C.missingFields(SPARSE);
assert("required and expected are separated",
  m.required.includes("Last name") && m.expected.includes("Insurance member ID"));
assert("email is not a required booking field", !m.required.includes("Email") && !m.expected.includes("Email"));

console.log("\nStanding prep guard rails");
const grant = { ...C.emptyGrant(), enabled: true, grantedAt: "2026-07-26T00:00:00Z" };
assert("default grant includes phone", grant.channels.includes("phone"));
assert("default grant includes portal", grant.channels.includes("portal"));
assert("default grant does not auto-enable email", !grant.channels.includes("email"));

assert("a complete phone pack may prep under grant",
  C.canAutoSend(grant, phone, request).allowed === true);
assert("an off grant blocks everything",
  C.canAutoSend(C.emptyGrant(), phone, request).allowed === false);
assert("a blocked prep explains why",
  C.canAutoSend(C.emptyGrant(), phone, request).reason.length > 5);

assert("an incomplete pack never auto-preps",
  C.canAutoSend(grant, sparse, request).allowed === false);
assert("incompleteness is the stated reason",
  /Missing required detail/.test(C.canAutoSend(grant, sparse, request).reason));

assert("email channel outside grant is refused",
  C.canAutoSend(grant, emailOnly, request).allowed === false);

const cancelRequest = { ...request, action: "cancel" as const };
assert("cancellations never auto-prep by default",
  C.canAutoSend(grant, C.compose(cancelRequest, provider, FULL), cancelRequest).allowed === false);
assert("cancellations can be opted into explicitly",
  C.canAutoSend({ ...grant, allowCancellations: true }, C.compose(cancelRequest, provider, FULL), cancelRequest).allowed === true);

const spammed = {
  ...grant,
  log: Array.from({ length: 6 }, () => ({ at: "2026-07-26T09:00:00Z", to: "x", subject: "s", channel: "phone" })),
};
assert("the daily limit stops a runaway loop",
  C.canAutoSend(spammed, phone, request, "2026-07-26T12:00:00Z").allowed === false);
assert("yesterday's packs don't count against today",
  C.canAutoSend(spammed, phone, request, "2026-07-27T09:00:00Z").allowed === true);

const logged = C.recordSend(grant, phone, "2026-07-26T10:00:00Z");
assert("preps are logged for audit", logged.log.length === 1 && logged.log[0].to === phone.to);
assert("the audit log is bounded",
  C.recordSend({ ...grant, log: Array.from({ length: 250 }, () => ({ at: "x", to: "y", subject: "z", channel: "phone" })) }, phone).log.length <= 200);

console.log("\nHandoff packet");
const packet = C.buildHandoff(request, provider, FULL, grant);
assert("the packet carries a phone-first subject", packet.message.subject.includes("Dental cleaning"));
assert("the packet channel is phone", packet.message.channel === "phone");
assert("the packet carries the provider phone", packet.provider?.phone === "555-0170");
assert("the packet states its authorisation", packet.authorised === true);
assert("an unauthorised packet still builds, and says why not",
  (() => { const p = C.buildHandoff(request, provider, SPARSE, grant); return p.authorised === false && p.authorisationReason.length > 5; })());

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
