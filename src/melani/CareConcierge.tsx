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
import { emptyCareHistory, markDone } from "./care/dueEngine";
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
  saveCareState,
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
  "Book blood draw / quarterly labs this month morning",
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

/** Parse clinic SMS / text like the Dr. Lili Invisalign confirmation. */
function parseAppointmentSms(text: string): {
  title: string;
  providerName: string;
  startsAt: string;
  address: string;
  notes: string;
} | null {
  const raw = text.trim();
  if (!raw) return null;
  // e.g. 8/17/26 at 9:00 AM
  const when =
    raw.match(
      /(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i
    ) ||
    raw.match(
      /(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i
    );
  if (!when) return null;
  let year = Number(when[3]);
  if (year < 100) year += 2000;
  let hour = Number(when[4]);
  const minute = Number(when[5]);
  const ap = when[6].toUpperCase();
  if (ap === "PM" && hour < 12) hour += 12;
  if (ap === "AM" && hour === 12) hour = 0;
  const month = Number(when[1]);
  const day = Number(when[2]);
  const starts = new Date(year, month - 1, day, hour, minute, 0);
  if (Number.isNaN(starts.getTime())) return null;

  const fromMatch = raw.match(/Msg from\s+([^:]+):/i);
  const providerName = (fromMatch?.[1] || "").replace(/&/g, "and").trim() || "Office";
  const addrMatch = raw.match(
    /(\d{2,5}\s+[\w.\s]+(?:Blvd|St|Ave|Rd|Dr|Way|Lane|Pkwy)\.?[\s,]*[\w\s,]*\d{5})/i
  );
  const address = (addrMatch?.[1] || "").replace(/\s+/g, " ").trim();
  const isInvisalign = /invisalign|console|consult/i.test(raw);
  const title = isInvisalign
    ? "Invisalign consult"
    : /appointment/i.test(raw)
      ? "Appointment"
      : "Clinic visit";

  return {
    title,
    providerName,
    startsAt: starts.toISOString(),
    address,
    notes: raw.slice(0, 400),
  };
}

const INVISALIGN_SEED_ID = "appt-invisalign-lili-2026-08-17";

function ensureInvisalignFromSmsSeed() {
  const state = loadCareState();
  if (state.appointments.some((a) => a.id === INVISALIGN_SEED_ID)) return;
  // Seed once from the confirmation Melani received (Aug 17 2026 9:00 AM LA)
  saveCareAppointment({
    id: INVISALIGN_SEED_ID,
    title: "Invisalign consult",
    providerName: "Dr. Lili and Associates",
    service: "specialist",
    startsAt: new Date(2026, 7, 17, 9, 0, 0).toISOString(), // month 7 = August
    address: "2368 W. Pico Blvd., Los Angeles, CA 90006",
    visitMode: "in-person",
    status: "scheduled",
    notes: "From clinic SMS confirmation",
  });
  // Office card
  if (!state.providers.some((p) => /lili/i.test(p.name))) {
    saveCareProvider({
      name: "Dr. Lili and Associates",
      specialty: "Invisalign / Orthodontics",
      phone: "",
      address: "2368 W. Pico Blvd., Los Angeles, CA 90006",
      website: "",
      preferred: true,
    });
  }
}

function isSameLocalDay(iso: string, vs = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === vs.getFullYear() &&
    d.getMonth() === vs.getMonth() &&
    d.getDate() === vs.getDate()
  );
}

export function CareConcierge() {
  const [state, setState] = useState<CareState>(() => {
    ensureInvisalignFromSmsSeed();
    return loadCareState();
  });
  const [selectedId, setSelectedId] = useState<string | null>(() => activeCareRequests(loadCareState())[0]?.id || null);
  const [input, setInput] = useState("");
  const [smsDraft, setSmsDraft] = useState("");
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

  // Schedule blood draw (owner law: quarterly labs)
  const [labWhen, setLabWhen] = useState("");
  const [labName, setLabName] = useState("");
  const [labAddress, setLabAddress] = useState("");
  const [labNotes, setLabNotes] = useState("");

  const active = useMemo(() => activeCareRequests(state), [state]);
  const appointments = useMemo(() => upcomingCareAppointments(state), [state]);
  const labAppointments = useMemo(
    () =>
      state.appointments
        .filter(
          (a) =>
            a.service === "lab-work" ||
            /blood|lab/i.test(a.title)
        )
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [state.appointments]
  );
  const selected = state.requests.find((request) => request.id === selectedId) || active[0] || null;
  const todayAppts = useMemo(
    () => appointments.filter((a) => isSameLocalDay(a.startsAt)),
    [appointments]
  );

  function sync() {
    const next = loadCareState();
    setState(next);
    setSelectedId((current) => current && next.requests.some((request) => request.id === current)
      ? current
      : activeCareRequests(next)[0]?.id || null);
  }

  useEffect(() => {
    ensureInvisalignFromSmsSeed();
    sync();
    window.addEventListener(CARE_EVENT, sync);
    void loadCareCapabilities().then(setCapabilities);
    const refreshVoices = () => setVoices(installedCareVoices());
    refreshVoices();
    if (canSpeak()) window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);

    // Day-of browser notification (not SMS — no home-screen access; this is in-app + Notification API)
    try {
      const key = `care-day-notify-${new Date().toISOString().slice(0, 10)}`;
      if (!sessionStorage.getItem(key)) {
        const todays = upcomingCareAppointments().filter((a) => isSameLocalDay(a.startsAt));
        if (todays.length && typeof Notification !== "undefined") {
          const fire = () => {
            for (const a of todays) {
              new Notification("Care · today", {
                body: `${a.title} with ${a.providerName || "your office"} · ${formatAppointment(a.startsAt)}`,
              });
            }
            sessionStorage.setItem(key, "1");
          };
          if (Notification.permission === "granted") fire();
          else if (Notification.permission !== "denied") {
            void Notification.requestPermission().then((p) => {
              if (p === "granted") fire();
            });
          }
        }
      }
    } catch {
      /* notifications optional */
    }

    return () => {
      window.removeEventListener(CARE_EVENT, sync);
      if (canSpeak()) window.speechSynthesis.removeEventListener("voiceschanged", refreshVoices);
      stopListening.current?.();
      stopSpeaking.current?.();
    };
  }, []);

  function importSms() {
    const parsed = parseAppointmentSms(smsDraft);
    if (!parsed) {
      announce("Could not read a date/time in that text. Paste the full clinic SMS.", "danger");
      return;
    }
    const isLab =
      /blood|lab\b|labs\b|phlebotom|quest|labcorp|bloodwork|blood work/i.test(
        parsed.title + " " + parsed.notes
      );
    saveCareAppointment({
      title: isLab
        ? "Blood draw · quarterly labs"
        : parsed.title,
      providerName: parsed.providerName,
      service: isLab
        ? "lab-work"
        : /invisalign/i.test(parsed.title)
          ? "specialist"
          : "other",
      startsAt: parsed.startsAt,
      address: parsed.address,
      visitMode: "in-person",
      status: "scheduled",
      notes: parsed.notes,
    });
    if (parsed.providerName) {
      const exists = loadCareState().providers.some((p) =>
        p.name.toLowerCase().includes(parsed.providerName.toLowerCase().slice(0, 12))
      );
      if (!exists) {
        saveCareProvider({
          name: parsed.providerName,
          specialty: /invisalign/i.test(parsed.title) ? "Invisalign / Orthodontics" : "",
          address: parsed.address,
          phone: "",
          website: "",
        });
      }
    }
    setSmsDraft("");
    sync();
    announce(`Saved ${parsed.title} · ${formatAppointment(parsed.startsAt)}.`);
  }

  function announce(text: string, tone: "normal" | "danger" = "normal") {
    setNotice({ text, tone });
    if (state.settings.speakReplies && tone !== "danger") {
      setVoiceState("speaking");
      stopSpeaking.current = speakCareReply(text, state.settings.voiceName, () => setVoiceState("idle"));
    }
  }

  function scheduleBloodDraw() {
    if (!labWhen.trim()) {
      announce("Pick a date and time for the blood draw.", "danger");
      return;
    }
    const starts = new Date(labWhen);
    if (Number.isNaN(starts.getTime())) {
      announce("That date/time is invalid.", "danger");
      return;
    }
    const office = labName.trim() || "Lab";
    const appt = saveCareAppointment({
      title: "Blood draw · quarterly labs",
      providerName: office,
      service: "lab-work",
      startsAt: starts.toISOString(),
      endsAt: new Date(starts.getTime() + 30 * 60 * 1000).toISOString(),
      address: labAddress.trim(),
      visitMode: "in-person",
      status: "scheduled",
      notes:
        labNotes.trim() ||
        "Owner law: quarterly blood tests · fasting if ordered",
    });
    const st = loadCareState();
    if (
      !st.providers.some((p) =>
        p.name.toLowerCase().includes(office.toLowerCase().slice(0, 10))
      )
    ) {
      saveCareProvider({
        name: office,
        specialty: "Lab / phlebotomy",
        address: labAddress.trim(),
        phone: "",
        website: "",
        preferred: true,
      });
    }
    setLabWhen("");
    setLabNotes("");
    sync();
    announce(
      `Scheduled blood draw · ${formatAppointment(appt.startsAt)}${
        office ? ` · ${office}` : ""
      }.`
    );
  }

  function completeBloodDraw(appointmentId: string) {
    const appt = loadCareState().appointments.find((a) => a.id === appointmentId);
    if (!appt) return;
    patchCareAppointment(appointmentId, { status: "completed" });
    const day = appt.startsAt.slice(0, 10);
    const st = loadCareState();
    const history = st.history
      ? {
          lastDone: st.history.lastDone || {},
          disabled: st.history.disabled || [],
          intervalOverride: st.history.intervalOverride || {},
        }
      : emptyCareHistory();
    saveCareState({
      ...st,
      history: markDone(history, "lab-panel", day),
    });
    sync();
    announce(`Marked blood draw done · next quarterly clock resets from ${day}.`);
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
          <p>Appointments · offices · day-of nudges</p>
          <h1>Care</h1>
        </div>
        <div className="care-head-actions">
          <span className={`care-connection${capabilities.configured ? " is-ready" : ""}`}>
            <span /> {capabilities.configured ? "Voice connected" : "On this device"}
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

      {/* Care agent: due list, profile vault, phone-first call prep */}
      <CareAgentPanel />

      {/* Blood draw — owner quarterly labs */}
      <section className="care-blood" aria-label="Schedule blood draw">
        <div className="care-section-title">
          <div>
            <p>Quarterly labs</p>
            <h2>Blood draw</h2>
          </div>
        </div>
        <div className="care-blood-form">
          <label>
            <span>When</span>
            <input
              type="datetime-local"
              value={labWhen}
              onChange={(e) => setLabWhen(e.target.value)}
            />
          </label>
          <label>
            <span>Lab / office</span>
            <input
              value={labName}
              onChange={(e) => setLabName(e.target.value)}
              placeholder="Quest · Labcorp · clinic lab"
            />
          </label>
          <label>
            <span>Address</span>
            <input
              value={labAddress}
              onChange={(e) => setLabAddress(e.target.value)}
              placeholder="optional"
            />
          </label>
          <label className="care-blood-notes">
            <span>Notes</span>
            <input
              value={labNotes}
              onChange={(e) => setLabNotes(e.target.value)}
              placeholder="fasting · panel ordered · order #"
            />
          </label>
          <button
            type="button"
            className="care-primary"
            onClick={scheduleBloodDraw}
            disabled={!labWhen}
          >
            Schedule blood draw
          </button>
        </div>
        {labAppointments.length ? (
          <ul className="care-blood-list">
            {labAppointments.map((a) => (
              <li key={a.id} className={a.status !== "scheduled" ? "is-done" : ""}>
                <div>
                  <strong>{a.title}</strong>
                  <span>
                    {formatAppointment(a.startsAt)}
                    {a.providerName ? ` · ${a.providerName}` : ""}
                    {a.status !== "scheduled" ? ` · ${a.status}` : ""}
                  </span>
                  {a.address ? <span>{a.address}</span> : null}
                </div>
                <div className="care-blood-actions">
                  {a.status === "scheduled" ? (
                    <>
                      <button
                        type="button"
                        className="care-secondary"
                        onClick={() => downloadAppointmentCalendar(a)}
                      >
                        <CalendarBlank size={14} /> Calendar
                      </button>
                      <button
                        type="button"
                        className="care-primary"
                        onClick={() => completeBloodDraw(a.id)}
                      >
                        <Check size={14} /> Done
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="care-blood-empty">No blood draws scheduled yet.</p>
        )}
      </section>

      {todayAppts.length ? (
        <div className="care-day-of" role="status">
          <p>Today</p>
          {todayAppts.map((a) => (
            <div key={a.id}>
              <h2>{a.title}</h2>
              <p className="care-day-meta">
                {formatAppointment(a.startsAt)}
                {a.providerName ? ` · ${a.providerName}` : ""}
                {a.address ? ` · ${a.address}` : ""}
              </p>
            </div>
          ))}
          <p className="care-day-meta" style={{ marginTop: 8 }}>
            Browser can notify you the day of. SMS from Wonder needs your phone later — for now this banner + Notification is the nudge.
          </p>
        </div>
      ) : null}

      {appointments.length ? (
        <section className="care-upcoming" aria-label="Upcoming appointments">
          {appointments.map((a) => (
            <article key={a.id} className="care-appt-card">
              <h3>{a.title}</h3>
              <p>{formatAppointment(a.startsAt)}</p>
              {a.providerName ? <p>{a.providerName}</p> : null}
              {a.address ? <p>{a.address}</p> : null}
              <div className="care-appt-actions">
                <button
                  type="button"
                  className="care-secondary"
                  onClick={() => downloadAppointmentCalendar(a)}
                >
                  <CalendarBlank size={14} /> Calendar
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      <section className="care-sms-panel" aria-label="Paste clinic text">
        <h2>Paste a clinic text</h2>
        <p>
          Drop the SMS here (like the Invisalign confirmation). Care extracts date, time, office, address — no retyping.
        </p>
        <textarea
          value={smsDraft}
          onChange={(e) => setSmsDraft(e.target.value)}
          placeholder="Msg from Dr. Lili… appointment on 8/17/26 at 9:00 AM…"
        />
        <div className="care-sms-actions">
          <button type="button" className="care-primary" disabled={!smsDraft.trim()} onClick={importSms}>
            Save appointment
          </button>
        </div>
      </section>

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
