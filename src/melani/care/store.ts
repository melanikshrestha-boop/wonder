import { careServiceLabel, parseCareRequest } from "./parser";
import type {
  CareAppointment,
  CareParseResult,
  CareProfile,
  CareProvider,
  CareReceipt,
  CareRequest,
  CareRequestStatus,
  CareSettings,
  CareState,
} from "./types";

export const CARE_PAGE_ID = "pg-agent-care";
export const CARE_STATE_KEY = "wonder-care-concierge-v1";
export const CARE_EVENT = "wonder-care-concierge-update";

const EMPTY_PROFILE: CareProfile = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  city: "",
  state: "",
  insuranceCarrier: "",
};

const DEFAULT_SETTINGS: CareSettings = {
  speakReplies: true,
  voiceName: "",
  shareContactByDefault: true,
  shareInsuranceCarrierByDefault: false,
};

function isoNow(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function emptyCareState(): CareState {
  return {
    version: 1,
    profile: { ...EMPTY_PROFILE },
    providers: [],
    requests: [],
    appointments: [],
    receipts: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

function normalizeProvider(value: Partial<CareProvider>): CareProvider | null {
  const name = String(value.name || "").trim();
  if (!name) return null;
  const now = isoNow();
  return {
    id: String(value.id || id("provider")),
    name,
    specialty: String(value.specialty || "").trim(),
    phone: String(value.phone || "").trim(),
    address: String(value.address || "").trim(),
    website: String(value.website || "").trim(),
    notes: String(value.notes || "").trim(),
    preferred: Boolean(value.preferred),
    createdAt: String(value.createdAt || now),
    updatedAt: String(value.updatedAt || now),
  };
}

function normalizeState(value: Partial<CareState> | null): CareState {
  if (!value || typeof value !== "object") return emptyCareState();
  const empty = emptyCareState();
  const historyRaw = value.history;
  const history =
    historyRaw && typeof historyRaw === "object"
      ? {
          lastDone:
            historyRaw.lastDone && typeof historyRaw.lastDone === "object"
              ? { ...historyRaw.lastDone }
              : {},
          disabled: Array.isArray(historyRaw.disabled)
            ? historyRaw.disabled.filter((id): id is string => typeof id === "string")
            : [],
          intervalOverride:
            historyRaw.intervalOverride &&
            typeof historyRaw.intervalOverride === "object"
              ? { ...historyRaw.intervalOverride }
              : {},
        }
      : undefined;
  const grantRaw = value.grant;
  const grantChannels = Array.isArray(grantRaw?.channels)
    ? grantRaw!.channels.filter(
        (c): c is "phone" | "portal" | "email" =>
          c === "phone" || c === "portal" || c === "email"
      )
    : (["phone", "portal"] as ("phone" | "portal" | "email")[]);
  const grant =
    grantRaw && typeof grantRaw === "object"
      ? {
          enabled: Boolean(grantRaw.enabled),
          grantedAt:
            typeof grantRaw.grantedAt === "string" ? grantRaw.grantedAt : null,
          channels: grantChannels.length
            ? grantChannels
            : (["phone", "portal"] as ("phone" | "portal" | "email")[]),
          allowCancellations: Boolean(grantRaw.allowCancellations),
          dailyLimit:
            typeof grantRaw.dailyLimit === "number" ? grantRaw.dailyLimit : 5,
          log: Array.isArray(grantRaw.log) ? grantRaw.log.slice(0, 100) : [],
        }
      : undefined;
  return {
    version: 1,
    profile: { ...empty.profile, ...(value.profile || {}) },
    providers: Array.isArray(value.providers)
      ? value.providers.map((provider) => normalizeProvider(provider)).filter((provider): provider is CareProvider => Boolean(provider))
      : [],
    requests: Array.isArray(value.requests) ? value.requests.slice(0, 100) : [],
    appointments: Array.isArray(value.appointments) ? value.appointments.slice(0, 100) : [],
    receipts: Array.isArray(value.receipts) ? value.receipts.slice(0, 250) : [],
    settings: { ...empty.settings, ...(value.settings || {}) },
    ...(history ? { history } : {}),
    ...(grant ? { grant } : {}),
  };
}

export function loadCareState(): CareState {
  try {
    return normalizeState(JSON.parse(localStorage.getItem(CARE_STATE_KEY) || "null") as Partial<CareState> | null);
  } catch {
    return emptyCareState();
  }
}

export function saveCareState(state: CareState): CareState {
  const normalized = normalizeState(state);
  localStorage.setItem(CARE_STATE_KEY, JSON.stringify(normalized));
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CARE_EVENT));
  return normalized;
}

function withReceipt(state: CareState, receipt: Omit<CareReceipt, "id" | "at">): CareState {
  return {
    ...state,
    receipts: [
      {
        id: id("care-log"),
        at: isoNow(),
        ...receipt,
      },
      ...state.receipts,
    ].slice(0, 250),
  };
}

export function updateCareProfile(patch: Partial<CareProfile>): CareState {
  const state = loadCareState();
  return saveCareState({ ...state, profile: { ...state.profile, ...patch } });
}

export function updateCareSettings(patch: Partial<CareSettings>): CareState {
  const state = loadCareState();
  return saveCareState({ ...state, settings: { ...state.settings, ...patch } });
}

export function saveCareProvider(input: Partial<CareProvider> & Pick<CareProvider, "name">): CareProvider {
  const state = loadCareState();
  const existing = input.id ? state.providers.find((provider) => provider.id === input.id) : null;
  const provider = normalizeProvider({ ...existing, ...input, updatedAt: isoNow() });
  if (!provider) throw new Error("Provider name is required.");
  const providers = existing
    ? state.providers.map((item) => item.id === provider.id ? provider : item)
    : [...state.providers, provider];
  saveCareState({ ...state, providers });
  return provider;
}

export function removeCareProvider(providerId: string): CareState {
  const state = loadCareState();
  return saveCareState({
    ...state,
    providers: state.providers.filter((provider) => provider.id !== providerId),
    requests: state.requests.map((request) => request.providerId === providerId ? { ...request, providerId: null } : request),
  });
}

function matchProvider(state: CareState, providerName: string): CareProvider | null {
  const query = providerName.trim().toLowerCase();
  if (!query) return null;
  return state.providers.find((provider) => provider.name.toLowerCase().includes(query) || query.includes(provider.name.toLowerCase())) || null;
}

function matchAppointment(state: CareState, parse: CareParseResult): CareAppointment | null {
  if (parse.action === "book") return null;
  const scheduled = state.appointments.filter((appointment) => appointment.status === "scheduled");
  const providerQuery = parse.providerName.trim().toLowerCase();
  const matches = scheduled.filter((appointment) => {
    const providerMatches = !providerQuery
      || appointment.providerName.toLowerCase().includes(providerQuery)
      || providerQuery.includes(appointment.providerName.toLowerCase());
    const serviceMatches = parse.service === "other" || appointment.service === parse.service;
    return providerMatches && serviceMatches;
  });
  if (matches.length === 1) return matches[0];
  return scheduled.length === 1 && !providerQuery && parse.service === "other"
    ? scheduled[0]
    : null;
}

export function stageCareRequest(sourceText: string, parse = parseCareRequest(sourceText)): CareRequest {
  if (parse.emergency) throw new Error(parse.emergencyMessage);
  const state = loadCareState();
  const provider = matchProvider(state, parse.providerName);
  const appointment = matchAppointment(state, parse);
  const now = isoNow();
  const requestBase: CareRequest = {
    id: id("care"),
    action: parse.action,
    service: appointment?.service || parse.service,
    title: appointment?.title || parse.title || careServiceLabel(parse.service),
    providerId: appointment?.providerId || provider?.id || null,
    providerName: appointment?.providerName || provider?.name || parse.providerName,
    dateWindow: parse.dateWindow,
    appointmentId: appointment?.id || null,
    locationPreference: parse.locationPreference,
    visitMode: parse.visitMode,
    reason: parse.reason,
    notes: parse.notes,
    status: "needs-details",
    missing: [],
    sourceText: sourceText.trim(),
    createdAt: now,
    updatedAt: now,
    approvedAt: null,
    sentAt: null,
    externalId: null,
    failureReason: null,
  };
  const missing = calculateMissing(requestBase);
  const request: CareRequest = {
    ...requestBase,
    missing,
    status: missing.length ? "needs-details" : "ready-for-review",
  };
  const next = withReceipt(
    { ...state, requests: [request, ...state.requests].slice(0, 100) },
    {
      requestId: request.id,
      kind: "drafted",
      summary: `Drafted ${request.action} request: ${request.title}. Nothing was sent.`,
    }
  );
  saveCareState(next);
  return request;
}

function calculateMissing(request: CareRequest): string[] {
  const missing: string[] = [];
  if (request.action === "book" && !request.dateWindow) missing.push("date window");
  if (request.action === "book" && request.service === "other") missing.push("appointment type");
  if (request.action !== "book" && !request.appointmentId) missing.push("which appointment");
  if (request.action === "reschedule" && !request.dateWindow) missing.push("new date window");
  return missing;
}

export function patchCareRequest(requestId: string, patch: Partial<CareRequest>): CareRequest | null {
  const state = loadCareState();
  const previous = state.requests.find((request) => request.id === requestId);
  if (!previous) return null;
  const merged = { ...previous, ...patch, id: previous.id, updatedAt: isoNow() };
  const missing = calculateMissing(merged);
  const approvalInvalidated = ["approved", "failed"].includes(previous.status);
  const request: CareRequest = {
    ...merged,
    missing,
    status: merged.status === "needs-details" || merged.status === "ready-for-review" || approvalInvalidated
      ? (missing.length ? "needs-details" : "ready-for-review")
      : merged.status,
    approvedAt: approvalInvalidated ? null : merged.approvedAt,
    externalId: approvalInvalidated ? null : merged.externalId,
    failureReason: approvalInvalidated ? null : merged.failureReason,
  };
  // Draft fields save continuously. Keep the audit trail for meaningful
  // transitions (approval, send, confirmation) instead of every keystroke.
  saveCareState({
    ...state,
    requests: state.requests.map((item) => item.id === requestId ? request : item),
  });
  return request;
}

export function setCareRequestStatus(
  requestId: string,
  status: CareRequestStatus,
  options: { summary: string; externalId?: string; failureReason?: string } 
): CareRequest | null {
  const state = loadCareState();
  const previous = state.requests.find((request) => request.id === requestId);
  if (!previous) return null;
  const now = isoNow();
  const request: CareRequest = {
    ...previous,
    status,
    updatedAt: now,
    approvedAt: status === "approved" || status === "sent" || status === "waiting" || status === "confirmed"
      ? previous.approvedAt || now
      : previous.approvedAt,
    sentAt: status === "sent" || status === "waiting" || status === "confirmed"
      ? previous.sentAt || now
      : previous.sentAt,
    externalId: options.externalId ?? previous.externalId,
    failureReason: options.failureReason ?? (status === "failed" ? previous.failureReason : null),
  };
  const kind: CareReceipt["kind"] = status === "approved"
    ? "approved"
    : status === "sent" || status === "waiting"
      ? "sent"
      : status === "confirmed"
        ? "confirmed"
        : status === "cancelled"
          ? "cancelled"
          : status === "failed"
            ? "failed"
            : "edited";
  const next = withReceipt(
    { ...state, requests: state.requests.map((item) => item.id === requestId ? request : item) },
    { requestId, kind, summary: options.summary, details: options.externalId ? { externalId: options.externalId } : undefined }
  );
  saveCareState(next);
  return request;
}

export function deleteCareRequest(requestId: string): CareState {
  const state = loadCareState();
  return saveCareState({
    ...state,
    requests: state.requests.filter((request) => request.id !== requestId),
    receipts: state.receipts.filter((receipt) => receipt.requestId !== requestId),
  });
}

export function saveCareAppointment(input: Partial<CareAppointment> & Pick<CareAppointment, "title" | "startsAt">): CareAppointment {
  const state = loadCareState();
  const existing = input.id ? state.appointments.find((appointment) => appointment.id === input.id) : null;
  const now = isoNow();
  const appointment: CareAppointment = {
    id: input.id || id("appt"),
    requestId: input.requestId || null,
    providerId: input.providerId || null,
    providerName: String(input.providerName || "").trim(),
    title: input.title.trim(),
    service: input.service || "other",
    startsAt: input.startsAt,
    endsAt: input.endsAt || null,
    address: String(input.address || "").trim(),
    visitMode: input.visitMode || "in-person",
    status: input.status || "scheduled",
    confirmationCode: String(input.confirmationCode || "").trim(),
    notes: String(input.notes || "").trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  const appointments = existing
    ? state.appointments.map((item) => item.id === appointment.id ? appointment : item)
    : [appointment, ...state.appointments];
  saveCareState({ ...state, appointments });
  return appointment;
}

export function patchCareAppointment(
  appointmentId: string,
  patch: Partial<CareAppointment>
): CareAppointment | null {
  const state = loadCareState();
  const previous = state.appointments.find((appointment) => appointment.id === appointmentId);
  if (!previous) return null;
  const appointment: CareAppointment = {
    ...previous,
    ...patch,
    id: previous.id,
    createdAt: previous.createdAt,
    updatedAt: isoNow(),
  };
  saveCareState({
    ...state,
    appointments: state.appointments.map((item) => item.id === appointmentId ? appointment : item),
  });
  return appointment;
}

export function upcomingCareAppointments(state = loadCareState()): CareAppointment[] {
  const now = Date.now();
  return state.appointments
    .filter((appointment) => appointment.status === "scheduled" && new Date(appointment.startsAt).getTime() >= now)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

export function activeCareRequests(state = loadCareState()): CareRequest[] {
  return state.requests.filter((request) => !["confirmed", "cancelled"].includes(request.status));
}

export function careSnapshot(state = loadCareState()) {
  const upcoming = upcomingCareAppointments(state);
  const active = activeCareRequests(state);
  return {
    activeRequests: active.length,
    nextAppointment: upcoming[0] || null,
    providers: state.providers.length,
    pendingReview: active.filter((request) => request.status === "ready-for-review").length,
  };
}
