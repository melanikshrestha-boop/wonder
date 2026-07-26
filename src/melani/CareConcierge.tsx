import { CareAgentPanel } from "./care/CareAgentPanel";
import {
  ArrowRight,
  CalendarBlank,
  Check,
  CheckCircle,
  ClipboardText,
  Clock,
  GearSix,
  Microphone,
  MicrophoneSlash,
  Phone,
  Plus,
  SpeakerHigh,
  SpeakerSlash,
  Trash,
  User,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  attachProviderToRequest,
  buildCareCallBrief,
  careConfirmationSummary,
  loadCareCapabilities,
  runCareCommandLocal,
  submitCareRequest,
} from "./care/agent";
import { careServiceLabel, parseCareRequest } from "./care/parser";
import { downloadAppointmentCalendar } from "./care/calendar";
import {
  CARE_EVENT,
  CARE_PAGE_ID,
  activeCareRequests,
  deleteCareRequest,
  loadCareState,
  patchCareAppointment,
  patchCareRequest,
  removeCareProvider,
  saveCareAppointment,
  saveCareProvider,
  setCareRequestStatus,
  updateCareProfile,
  updateCareSettings,
  upcomingCareAppointments,
} from "./care/store";
import type {
  CareAppointmentAction,
  CareHandoffCapabilities,
  CareProvider,
  CareRequest,
  CareService,
  CareState,
  CareTimeOfDay,
} from "./care/types";
import {
  bestCareVoice,
  canRecognizeSpeech,
  canSpeak,
  installedCareVoices,
  speakCareReply,
  startCareListening,
  type CareVoiceState,
} from "./care/voice";
import "./care-concierge.css";

const QUICK_REQUESTS = [
  "Book a dental cleaning next week in the morning",
  "Book my annual physical this month",
  "Show my upcoming appointments",
];

const SERVICES: CareService[] = [
  "dental-cleaning",
  "dental-problem",
  "annual-physical",
  "primary-care",
  "eye-exam",
  "lab-work",
  "specialist",
  "other",
];

const ACTIONS: CareAppointmentAction[] = ["book", "reschedule", "cancel", "check"];
const TIMES: CareTimeOfDay[] = ["morning", "afternoon", "evening", "any"];

function stateLabel(status: CareRequest["status"]): string {
  return {
    "needs-details": "Needs details",
    "ready-for-review": "Review",
    approved: "Approved",
    sent: "Sent",
    waiting: "Waiting",
    confirmed: "Confirmed",
    failed: "Needs attention",
    cancelled: "Cancelled",
  }[status];
}

function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatAppointment(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function phoneHref(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, "")}`;
}

function requestProvider(request: CareRequest, state: CareState): CareProvider | null {
  return request.providerId
    ? state.providers.find((provider) => provider.id === request.providerId) || null
    : null;
}

function RequestEditor({
  request,
  state,
  capabilities,
  onChanged,
  onNotice,
}: {
  request: CareRequest;
  state: CareState;
  capabilities: CareHandoffCapabilities;
  onChanged: () => void;
  onNotice: (message: string, tone?: "normal" | "danger") => void;
}) {
  const [confirmAt, setConfirmAt] = useState("");
  const [sending, setSending] = useState(false);
  const provider = requestProvider(request, state);
  const editable = ["needs-details", "ready-for-review", "approved", "failed"].includes(request.status);

  function patch(next: Partial<CareRequest>) {
    patchCareRequest(request.id, next);
    onChanged();
  }

  function patchWindow(next: Partial<NonNullable<CareRequest["dateWindow"]>>) {
    const fallback = request.dateWindow || {
      from: "",
      to: "",
      label: "chosen dates",
      daysOfWeek: [],
      timeOfDay: ["any" as const],
    };
    const merged = { ...fallback, ...next };
    patch({
      dateWindow: merged.from && merged.to
        ? { ...merged, label: merged.from === merged.to ? formatDate(merged.from) : `${formatDate(merged.from)} to ${formatDate(merged.to)}` }
        : null,
    });
  }

  function approve() {
    if (request.missing.length) {
      onNotice(`Add ${request.missing.join(" and ")} first.`, "danger");
      return;
    }
    setCareRequestStatus(request.id, "approved", {
      summary: `Approved ${request.title}. No office was contacted yet.`,
    });
    onChanged();
    onNotice("Approved. Review the phone handoff, then send when ready.");
  }

  async function send() {
    setSending(true);
    const result = await submitCareRequest(request.id);
    setSending(false);
    onChanged();
    onNotice(result.summary, result.ok ? "normal" : "danger");
  }

  function confirmManually() {
    if (request.action === "cancel") {
      if (!request.appointmentId) {
        onNotice("Choose the appointment being cancelled.", "danger");
        return;
      }
      const cancelled = patchCareAppointment(request.appointmentId, { status: "cancelled" });
      if (!cancelled) {
        onNotice("The original appointment could not be found.", "danger");
        return;
      }
      setCareRequestStatus(request.id, "cancelled", {
        summary: `Cancellation confirmed for ${cancelled.title}.`,
      });
      onChanged();
      onNotice("Cancellation confirmed and removed from your upcoming timeline.");
      return;
    }
    if (!confirmAt) {
      onNotice("Choose the confirmed appointment date and time.", "danger");
      return;
    }
    const existing = request.appointmentId
      ? patchCareAppointment(request.appointmentId, {
          requestId: request.id,
          providerId: request.providerId,
          providerName: provider?.name || request.providerName,
          title: request.title,
          service: request.service,
          startsAt: new Date(confirmAt).toISOString(),
          address: provider?.address || "",
          visitMode: request.visitMode === "telehealth" ? "telehealth" : "in-person",
          status: "scheduled",
        })
      : null;
    const appointment = existing || saveCareAppointment({
        requestId: request.id,
        providerId: request.providerId,
        providerName: provider?.name || request.providerName,
        title: request.title,
        service: request.service,
        startsAt: new Date(confirmAt).toISOString(),
        address: provider?.address || "",
        visitMode: request.visitMode === "telehealth" ? "telehealth" : "in-person",
      });
    setCareRequestStatus(request.id, "confirmed", {
      summary: `Confirmed ${request.title} for ${formatAppointment(appointment.startsAt)}.`,
    });
    onChanged();
    onNotice("Appointment confirmed and added to your timeline.");
  }

  async function copyBrief() {
    await navigator.clipboard.writeText(buildCareCallBrief(request));
    onNotice("Call brief copied.");
  }

  return (
    <section className="care-request-editor" aria-label={`Appointment request: ${request.title}`}>
      <div className="care-editor-head">
        <div>
          <span className={`care-status is-${request.status}`}>{stateLabel(request.status)}</span>
          <h2>{request.title}</h2>
          <p>{request.sourceText}</p>
        </div>
        <button
          type="button"
          className="care-icon-button is-muted"
          title="Delete request"
          aria-label="Delete request"
          onClick={() => {
            deleteCareRequest(request.id);
            onChanged();
            onNotice("Appointment request deleted.");
          }}
        >
          <Trash size={15} />
        </button>
      </div>

      <div className="care-editor-grid">
        <label>
          <span>Action</span>
          <select value={request.action} disabled={!editable} onChange={(event) => patch({ action: event.target.value as CareAppointmentAction })}>
            {ACTIONS.map((action) => <option key={action} value={action}>{action}</option>)}
          </select>
        </label>
        <label>
          <span>Appointment</span>
          <select
            value={request.service}
            disabled={!editable}
            onChange={(event) => {
              const service = event.target.value as CareService;
              patch({ service, title: careServiceLabel(service) });
            }}
          >
            {SERVICES.map((service) => <option key={service} value={service}>{careServiceLabel(service)}</option>)}
          </select>
        </label>
        {request.action !== "book" ? (
          <label>
            <span>Existing appointment</span>
            <select
              value={request.appointmentId || ""}
              disabled={!editable}
              onChange={(event) => {
                const appointment = state.appointments.find((item) => item.id === event.target.value);
                patch(appointment ? {
                  appointmentId: appointment.id,
                  providerId: appointment.providerId,
                  providerName: appointment.providerName,
                  service: appointment.service,
                  title: appointment.title,
                } : { appointmentId: null });
              }}
            >
              <option value="">Choose an appointment</option>
              {state.appointments
                .filter((appointment) => appointment.status === "scheduled")
                .map((appointment) => (
                  <option key={appointment.id} value={appointment.id}>
                    {appointment.title} · {formatAppointment(appointment.startsAt)}
                  </option>
                ))}
            </select>
          </label>
        ) : null}
        <label>
          <span>Office</span>
          <select
            value={request.providerId || ""}
            disabled={!editable}
            onChange={(event) => {
              if (event.target.value) attachProviderToRequest(request.id, event.target.value);
              else patch({ providerId: null, providerName: "" });
              onChanged();
            }}
          >
            <option value="">Choose an office</option>
            {state.providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>
          <span>Visit</span>
          <select value={request.visitMode} disabled={!editable} onChange={(event) => patch({ visitMode: event.target.value as CareRequest["visitMode"] })}>
            <option value="either">Either</option>
            <option value="in-person">In person</option>
            <option value="telehealth">Telehealth</option>
          </select>
        </label>
        <label>
          <span>From</span>
          <input type="date" disabled={!editable} value={request.dateWindow?.from || ""} onChange={(event) => patchWindow({ from: event.target.value, to: request.dateWindow?.to || event.target.value })} />
        </label>
        <label>
          <span>To</span>
          <input type="date" disabled={!editable} value={request.dateWindow?.to || ""} onChange={(event) => patchWindow({ to: event.target.value, from: request.dateWindow?.from || event.target.value })} />
        </label>
      </div>

      <fieldset className="care-time-segments" disabled={!editable}>
        <legend>Time</legend>
        {TIMES.map((time) => {
          const selected = request.dateWindow?.timeOfDay.includes(time) || false;
          return (
            <button
              type="button"
              key={time}
              className={selected ? "is-selected" : ""}
              onClick={() => patchWindow({ timeOfDay: [time] })}
            >
              {time}
            </button>
          );
        })}
      </fieldset>

      <label className="care-wide-field">
        <span>Reason shared with office</span>
        <input value={request.reason} disabled={!editable} onChange={(event) => patch({ reason: event.target.value })} placeholder="Routine visit, follow-up, or your own words" />
      </label>
      <label className="care-wide-field">
        <span>Instructions</span>
        <textarea value={request.notes} disabled={!editable} onChange={(event) => patch({ notes: event.target.value })} placeholder="Anything the office should know about scheduling" rows={2} />
      </label>

      {request.missing.length ? (
        <p className="care-missing"><WarningCircle size={15} /> Add {request.missing.join(" and ")}.</p>
      ) : null}

      <details className="care-call-brief">
        <summary>Voice brief</summary>
        <pre>{buildCareCallBrief(request)}</pre>
        <button type="button" className="care-text-action" onClick={() => void copyBrief()}>
          <ClipboardText size={14} /> Copy brief
        </button>
      </details>

      <div className="care-request-actions">
        {request.status !== "approved" && ["needs-details", "ready-for-review", "failed"].includes(request.status) ? (
          <button type="button" className="care-primary-action" onClick={approve} disabled={Boolean(request.missing.length)}>
            <Check size={16} /> Approve exact request
          </button>
        ) : null}
        {request.status === "approved" ? (
          <button type="button" className="care-primary-action" onClick={() => void send()} disabled={sending || !provider?.phone || !capabilities.canPlaceCalls}>
            <Phone size={16} /> {sending ? "Connecting" : "Send to voice agent"}
          </button>
        ) : null}
        {provider?.phone ? (
          <a className="care-secondary-action" href={phoneHref(provider.phone)}>
            <Phone size={15} /> Call office
          </a>
        ) : null}
      </div>

      {request.status === "approved" && !capabilities.canPlaceCalls ? (
        <p className="care-capability-note">Voice handoff is not connected. Your approval is saved; no call was placed.</p>
      ) : null}

      {["approved", "sent", "waiting", "failed"].includes(request.status) ? (
        <div className="care-manual-confirm">
          {request.action !== "cancel" ? (
            <label>
              <span>Confirmed slot</span>
              <input type="datetime-local" value={confirmAt} onChange={(event) => setConfirmAt(event.target.value)} />
            </label>
          ) : <span className="care-capability-note">Use this only after the office confirms the cancellation.</span>}
          <button type="button" className="care-text-action" onClick={confirmManually}>
            <CheckCircle size={15} /> {request.action === "cancel" ? "Confirm cancellation" : "Save confirmation"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ProviderEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial?: CareProvider;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [specialty, setSpecialty] = useState(initial?.specialty || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [address, setAddress] = useState(initial?.address || "");
  const [website, setWebsite] = useState(initial?.website || "");

  return (
    <div className="care-provider-form">
      <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Office or clinician" />
      <input value={specialty} onChange={(event) => setSpecialty(event.target.value)} placeholder="Specialty" />
      <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone" />
      <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Address" />
      <input type="url" value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="Website" />
      <div>
        <button
          type="button"
          className="care-primary-action"
          disabled={!name.trim()}
          onClick={() => {
            saveCareProvider({ ...initial, name, specialty, phone, address, website });
            onSave();
          }}
        >
          <Check size={15} /> Save office
        </button>
        <button type="button" className="care-text-action" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export function CareConcierge() {
  const [state, setState] = useState<CareState>(loadCareState);
  const [selectedId, setSelectedId] = useState<string | null>(() => activeCareRequests(loadCareState())[0]?.id || null);
  const [input, setInput] = useState("");
  const [interim, setInterim] = useState("");
  const [voiceState, setVoiceState] = useState<CareVoiceState>(canRecognizeSpeech() ? "idle" : "unsupported");
  const [notice, setNotice] = useState<{ text: string; tone: "normal" | "danger" } | null>(null);
  const [capabilities, setCapabilities] = useState<CareHandoffCapabilities>({
    configured: false,
    channel: "not-connected",
    canPlaceCalls: false,
    canReceiveUpdates: false,
    detail: "Checking voice handoff.",
  });
  const [providerEditor, setProviderEditor] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const stopListening = useRef<(() => void) | null>(null);
  const stopSpeaking = useRef<(() => void) | null>(null);

  const active = useMemo(() => activeCareRequests(state), [state]);
  const appointments = useMemo(() => upcomingCareAppointments(state), [state]);
  const selected = state.requests.find((request) => request.id === selectedId) || active[0] || null;

  function sync() {
    const next = loadCareState();
    setState(next);
    setSelectedId((current) => current && next.requests.some((request) => request.id === current)
      ? current
      : activeCareRequests(next)[0]?.id || null);
  }

  useEffect(() => {
    window.addEventListener(CARE_EVENT, sync);
    void loadCareCapabilities().then(setCapabilities);
    const refreshVoices = () => setVoices(installedCareVoices());
    refreshVoices();
    if (canSpeak()) window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
    return () => {
      window.removeEventListener(CARE_EVENT, sync);
      if (canSpeak()) window.speechSynthesis.removeEventListener("voiceschanged", refreshVoices);
      stopListening.current?.();
      stopSpeaking.current?.();
    };
  }, []);

  function announce(text: string, tone: "normal" | "danger" = "normal") {
    setNotice({ text, tone });
    if (state.settings.speakReplies && tone !== "danger") {
      setVoiceState("speaking");
      stopSpeaking.current = speakCareReply(text, state.settings.voiceName, () => setVoiceState("idle"));
    }
  }

  function runCommand(command: string) {
    const clean = command.trim();
    if (!clean) return;
    const parsed = parseCareRequest(clean);
    if (parsed.emergency) {
      announce(parsed.emergencyMessage, "danger");
      return;
    }
    const result = runCareCommandLocal(clean);
    if (!result) {
      announce("I need an appointment action, office, or date window.", "danger");
      return;
    }
    const request = result.data as CareRequest | undefined;
    if (request?.id) setSelectedId(request.id);
    setInput("");
    setInterim("");
    sync();
    announce(result.summary, result.ok ? "normal" : "danger");
  }

  function toggleListening() {
    if (voiceState === "listening") {
      stopListening.current?.();
      stopListening.current = null;
      setVoiceState("idle");
      return;
    }
    stopSpeaking.current?.();
    setNotice(null);
    const stop = startCareListening({
      onInterim: setInterim,
      onFinal: (text) => {
        setInput(text);
        setInterim("");
        setVoiceState("processing");
        window.setTimeout(() => {
          runCommand(text);
          setVoiceState("idle");
        }, 120);
      },
      onError: (message) => {
        announce(message, "danger");
        setVoiceState("idle");
      },
      onEnd: () => {
        stopListening.current = null;
        setVoiceState((current) => current === "listening" ? "idle" : current);
      },
    });
    if (!stop) {
      setVoiceState("unsupported");
      announce("Voice input is unavailable in this browser. Type the same request below.", "danger");
      return;
    }
    stopListening.current = stop;
    setVoiceState("listening");
  }

  const voice = bestCareVoice(state.settings.voiceName);

  return (
    <div className="care-concierge">
      <header className="care-page-head">
        <div>
          <p>Care operations</p>
          <h1>Care Concierge</h1>
        </div>
        <div className="care-head-actions">
          <span className={`care-connection${capabilities.configured ? " is-connected" : ""}`}>
            <span /> {capabilities.configured ? "Voice connected" : "Local mode"}
          </span>
          <button type="button" className="care-icon-button" title="Care profile" aria-label="Care profile" onClick={() => setProfileOpen((value) => !value)}>
            <User size={16} />
          </button>
          <button type="button" className="care-icon-button" title="Voice settings" aria-label="Voice settings" onClick={() => {
            const next = !state.settings.speakReplies;
            updateCareSettings({ speakReplies: next });
            sync();
          }}>
            {state.settings.speakReplies ? <SpeakerHigh size={16} /> : <SpeakerSlash size={16} />}
          </button>
        </div>
      </header>

      {/* The agent half: what it found on its own, the vault it draws on,
          and the standing authorisation that lets it send. */}
      <CareAgentPanel />

      {profileOpen ? (
        <section className="care-profile-panel">
          <div className="care-section-title">
            <div><p>Private profile</p><h2>Caller details</h2></div>
            <button type="button" className="care-icon-button is-muted" onClick={() => setProfileOpen(false)} aria-label="Close profile"><X size={15} /></button>
          </div>
          <div className="care-profile-grid">
            <label><span>First name</span><input value={state.profile.firstName} onChange={(event) => { updateCareProfile({ firstName: event.target.value }); sync(); }} /></label>
            <label><span>Last name</span><input value={state.profile.lastName} onChange={(event) => { updateCareProfile({ lastName: event.target.value }); sync(); }} /></label>
            <label><span>Phone</span><input type="tel" value={state.profile.phone} onChange={(event) => { updateCareProfile({ phone: event.target.value }); sync(); }} /></label>
            <label><span>Email</span><input type="email" value={state.profile.email} onChange={(event) => { updateCareProfile({ email: event.target.value }); sync(); }} /></label>
            <label><span>City</span><input value={state.profile.city} onChange={(event) => { updateCareProfile({ city: event.target.value }); sync(); }} /></label>
            <label><span>State</span><input value={state.profile.state} onChange={(event) => { updateCareProfile({ state: event.target.value }); sync(); }} /></label>
            <label><span>Insurance carrier</span><input value={state.profile.insuranceCarrier} onChange={(event) => { updateCareProfile({ insuranceCarrier: event.target.value }); sync(); }} /></label>
            <label>
              <span>Voice</span>
              <select value={state.settings.voiceName} onChange={(event) => { updateCareSettings({ voiceName: event.target.value }); sync(); }}>
                <option value="">Best available{voice ? ` (${voice.name})` : ""}</option>
                {voices.map((item) => <option key={item.voiceURI} value={item.name}>{item.name}</option>)}
              </select>
            </label>
          </div>
          <div className="care-sharing-toggles">
            <label><input type="checkbox" checked={state.settings.shareContactByDefault} onChange={(event) => { updateCareSettings({ shareContactByDefault: event.target.checked }); sync(); }} /> Share phone and email after approval</label>
            <label><input type="checkbox" checked={state.settings.shareInsuranceCarrierByDefault} onChange={(event) => { updateCareSettings({ shareInsuranceCarrierByDefault: event.target.checked }); sync(); }} /> Share insurance carrier after approval</label>
          </div>
          <p className="care-private-note">Wonder does not ask for SSN, payment details, or insurance member IDs here.</p>
        </section>
      ) : null}

      <section className={`care-command-bar is-${voiceState}`}>
        <button
          type="button"
          className="care-mic-button"
          onClick={toggleListening}
          disabled={voiceState === "processing" || voiceState === "speaking"}
          title={voiceState === "listening" ? "Stop listening" : "Speak appointment request"}
          aria-label={voiceState === "listening" ? "Stop listening" : "Speak appointment request"}
        >
          {voiceState === "listening" ? <MicrophoneSlash size={21} /> : <Microphone size={21} />}
          <span className="care-mic-pulse" />
        </button>
        <div className="care-command-input">
          <textarea
            rows={1}
            value={interim || input}
            onChange={(event) => { setInterim(""); setInput(event.target.value); }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                runCommand(input);
              }
            }}
            placeholder={voiceState === "listening" ? "Listening..." : "Book, reschedule, cancel, or check an appointment"}
          />
          <span>{voiceState === "speaking" ? "Mel is speaking" : voiceState === "processing" ? "Building request" : voiceState === "listening" ? "Say the office, visit, and timing" : ""}</span>
        </div>
        <button type="button" className="care-send-button" onClick={() => runCommand(input)} disabled={!input.trim() && !interim.trim()} title="Create appointment request" aria-label="Create appointment request">
          <ArrowRight size={18} />
        </button>
      </section>

      <div className="care-quick-row" role="list" aria-label="Quick appointment requests">
        {QUICK_REQUESTS.map((request) => (
          <button type="button" key={request} onClick={() => runCommand(request)}>{request}</button>
        ))}
      </div>

      {notice ? (
        <div className={`care-notice is-${notice.tone}`} role={notice.tone === "danger" ? "alert" : "status"}>
          {notice.tone === "danger" ? <WarningCircle size={17} /> : <CheckCircle size={17} />}
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss"><X size={13} /></button>
        </div>
      ) : null}

      <div className="care-workspace">
        <aside className="care-queue">
          <div className="care-section-title">
            <div><p>Queue</p><h2>Requests</h2></div>
            <span>{active.length}</span>
          </div>
          {active.length ? active.map((request) => (
            <button type="button" key={request.id} className={selected?.id === request.id ? "is-active" : ""} onClick={() => setSelectedId(request.id)}>
              <span className={`care-queue-mark is-${request.status}`} />
              <span><strong>{request.title}</strong><small>{request.dateWindow?.label || request.missing[0] || "No date"}</small></span>
              <em>{stateLabel(request.status)}</em>
            </button>
          )) : (
            <p className="care-empty-row"><CalendarBlank size={18} /> No requests in progress.</p>
          )}
        </aside>

        <div className="care-editor-column">
          {selected ? (
            <RequestEditor request={selected} state={state} capabilities={capabilities} onChanged={sync} onNotice={announce} />
          ) : (
            <section className="care-zero-state">
              <Microphone size={24} />
              <h2>Start with the visit and timing</h2>
              <p>“Dental cleaning next week, mornings.”</p>
            </section>
          )}
        </div>
      </div>

      <section className="care-appointments">
        <div className="care-section-title">
          <div><p>Calendar</p><h2>Upcoming</h2></div>
          <span>{appointments.length}</span>
        </div>
        {appointments.length ? (
          <div className="care-appointment-list">
            {appointments.map((appointment) => (
              <article key={appointment.id}>
                <div className="care-date-tile">
                  <strong>{new Date(appointment.startsAt).toLocaleDateString(undefined, { day: "2-digit" })}</strong>
                  <span>{new Date(appointment.startsAt).toLocaleDateString(undefined, { month: "short" })}</span>
                </div>
                <div><h3>{appointment.title}</h3><p>{formatAppointment(appointment.startsAt)}{appointment.providerName ? ` · ${appointment.providerName}` : ""}</p></div>
                <div className="care-appointment-actions">
                  <span className="care-confirmed"><Check size={13} /> Confirmed</span>
                  <button
                    type="button"
                    className="care-icon-button is-muted"
                    title="Add to calendar"
                    aria-label={`Add ${appointment.title} to calendar`}
                    onClick={() => downloadAppointmentCalendar(appointment)}
                  >
                    <CalendarBlank size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="care-empty-row"><Clock size={17} /> No confirmed appointments.</p>}
      </section>

      <section className="care-providers">
        <div className="care-section-title">
          <div><p>Directory</p><h2>Offices</h2></div>
          <button type="button" className="care-text-action" onClick={() => setProviderEditor(true)}><Plus size={14} /> Add office</button>
        </div>
        {providerEditor ? <ProviderEditor onSave={() => { setProviderEditor(false); sync(); }} onCancel={() => setProviderEditor(false)} /> : null}
        {state.providers.length ? (
          <div className="care-provider-list">
            {state.providers.map((provider) => (
              <article key={provider.id}>
                <div className="care-provider-avatar">{provider.name.slice(0, 1).toUpperCase()}</div>
                <div><h3>{provider.name}</h3><p>{[provider.specialty, provider.phone, provider.address].filter(Boolean).join(" · ")}</p></div>
                <div>
                  {provider.phone ? <a href={phoneHref(provider.phone)} title={`Call ${provider.name}`}><Phone size={15} /></a> : null}
                  <button type="button" title={`Delete ${provider.name}`} onClick={() => { removeCareProvider(provider.id); sync(); }}><Trash size={14} /></button>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="care-empty-row"><Plus size={17} /> Add your dentist or medical office once.</p>}
      </section>

      <details className="care-activity">
        <summary><GearSix size={15} /> Activity and consent receipts <span>{state.receipts.length}</span></summary>
        <div>
          {state.receipts.slice(0, 30).map((receipt) => (
            <p key={receipt.id}><time>{new Date(receipt.at).toLocaleString()}</time><span>{receipt.summary}</span></p>
          ))}
        </div>
      </details>
    </div>
  );
}

export function isCareConciergePage(pageId: string): boolean {
  return pageId === CARE_PAGE_ID;
}

export { careConfirmationSummary };
