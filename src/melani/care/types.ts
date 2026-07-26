export type CareAppointmentAction = "book" | "reschedule" | "cancel" | "check";

export type CareService =
  | "dental-cleaning"
  | "dental-problem"
  | "annual-physical"
  | "primary-care"
  | "eye-exam"
  | "lab-work"
  | "specialist"
  | "other";

export type CareRequestStatus =
  | "needs-details"
  | "ready-for-review"
  | "approved"
  | "sent"
  | "waiting"
  | "confirmed"
  | "failed"
  | "cancelled";

export type CareTimeOfDay = "morning" | "afternoon" | "evening" | "any";

export type CareDateWindow = {
  from: string;
  to: string;
  label: string;
  daysOfWeek: number[];
  timeOfDay: CareTimeOfDay[];
};

export type CareProvider = {
  id: string;
  name: string;
  specialty: string;
  phone: string;
  address: string;
  website: string;
  notes: string;
  preferred: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CareRequest = {
  id: string;
  action: CareAppointmentAction;
  service: CareService;
  title: string;
  providerId: string | null;
  providerName: string;
  dateWindow: CareDateWindow | null;
  appointmentId: string | null;
  locationPreference: string;
  visitMode: "in-person" | "telehealth" | "either";
  reason: string;
  notes: string;
  status: CareRequestStatus;
  missing: string[];
  sourceText: string;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  sentAt: string | null;
  externalId: string | null;
  failureReason: string | null;
};

export type CareAppointment = {
  id: string;
  requestId: string | null;
  providerId: string | null;
  providerName: string;
  title: string;
  service: CareService;
  startsAt: string;
  endsAt: string | null;
  address: string;
  visitMode: "in-person" | "telehealth";
  status: "scheduled" | "completed" | "cancelled";
  confirmationCode: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type CareReceipt = {
  id: string;
  requestId: string | null;
  kind:
    | "drafted"
    | "edited"
    | "approved"
    | "sent"
    | "reply"
    | "confirmed"
    | "failed"
    | "cancelled";
  summary: string;
  at: string;
  details?: Record<string, unknown>;
};

/**
 * Everything a receptionist asks for before they will give you a slot.
 *
 * All fields are optional beyond the original six so existing saved profiles
 * keep loading. The composer reports which of these are missing rather than
 * sending an incomplete request, because an email that omits the member ID
 * just produces a phone call asking for it.
 *
 * This is stored in the browser's localStorage and never transmitted except
 * inside a message the owner has authorised.
 */
export type CareProfile = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  insuranceCarrier: string;

  /** Identity — every office verifies these two before booking. */
  dateOfBirth?: string;
  legalSex?: "female" | "male" | "intersex" | "";

  /** Insurance. Member and group are what the front desk actually keys in. */
  insuranceMemberId?: string;
  insuranceGroupNumber?: string;
  insurancePlanName?: string;
  /** Whose policy it is, when not the patient's own. */
  policyHolderName?: string;
  policyHolderRelation?: "self" | "parent" | "spouse" | "other" | "";

  /** Primary care — the referral source most specialists require. */
  primaryCareName?: string;
  primaryCarePhone?: string;

  pharmacyName?: string;
  pharmacyPhone?: string;
  pharmacyAddress?: string;

  /** Clinical context worth putting in a booking request. */
  allergies?: string;
  conditions?: string;
  medications?: string;

  /** Logistics that decide which slots are even possible. */
  preferredDays?: number[];
  earliestTime?: string;
  latestTime?: string;
  needsInterpreter?: string;
  transportNotes?: string;
};

export type CareSettings = {
  speakReplies: boolean;
  voiceName: string;
  shareContactByDefault: boolean;
  shareInsuranceCarrierByDefault: boolean;
};

export type CareState = {
  version: 1;
  profile: CareProfile;
  providers: CareProvider[];
  requests: CareRequest[];
  appointments: CareAppointment[];
  receipts: CareReceipt[];
  settings: CareSettings;
  /** Last-visit dates and interval overrides feeding the due engine. */
  history?: {
    lastDone: Record<string, string>;
    disabled: string[];
    intervalOverride: Record<string, number>;
  };
  /** Standing send authorisation and its audit log. */
  grant?: {
    enabled: boolean;
    grantedAt: string | null;
    channels: ("email" | "phone" | "portal")[];
    allowCancellations: boolean;
    dailyLimit: number;
    log: { at: string; to: string; subject: string; channel: string }[];
  };
};

export type CareParseResult = {
  action: CareAppointmentAction;
  service: CareService;
  title: string;
  providerName: string;
  dateWindow: CareDateWindow | null;
  locationPreference: string;
  visitMode: "in-person" | "telehealth" | "either";
  reason: string;
  notes: string;
  missing: string[];
  emergency: boolean;
  emergencyMessage: string;
  confidence: number;
};

export type CareHandoffCapabilities = {
  configured: boolean;
  channel: "voice-webhook" | "not-connected";
  canPlaceCalls: boolean;
  canReceiveUpdates: boolean;
  detail: string;
};
