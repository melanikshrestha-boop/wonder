/**
 * Care agent panel — due engine, profile vault, standing call-prep.
 *
 * Booking reality (US clinics):
 *   1. Phone call to the front desk  ← default path
 *   2. Patient portal / book-online  ← second
 *   3. Email                         ← rare last resort (most offices ignore it)
 *
 * This panel never pretends to "email the dentist." It builds a call script,
 * one-tap dial, or portal paste — then you log the appointment after it lands.
 */
import { useMemo, useState } from "react";
import {
  actionable,
  computeDue,
  DUE_RULES,
  emptyCareHistory,
  markDone,
  type CareHistory,
  type DueItem,
} from "./dueEngine";
import {
  buildHandoff,
  emptyGrant,
  missingFields,
  portalHref,
  recordSend,
  telHref,
  type AutoSendGrant,
  type BookingChannel,
} from "./composer";
import { loadCareState, saveCareState } from "./store";
import type { CareProfile, CareState } from "./types";
import "./care-agent.css";

const PROFILE_FIELDS: {
  key: keyof CareProfile;
  label: string;
  type?: string;
  placeholder?: string;
  group: string;
  required?: boolean;
}[] = [
  { key: "firstName", label: "First name", group: "Identity", required: true },
  { key: "lastName", label: "Last name", group: "Identity", required: true },
  { key: "dateOfBirth", label: "Date of birth", type: "date", group: "Identity", required: true },
  { key: "phone", label: "Your phone", type: "tel", placeholder: "callback number", group: "Identity", required: true },
  { key: "email", label: "Your email", type: "email", placeholder: "for portals / confirmations only", group: "Identity" },

  { key: "insuranceCarrier", label: "Carrier", placeholder: "Aetna", group: "Insurance" },
  { key: "insurancePlanName", label: "Plan name", placeholder: "Open Choice PPO", group: "Insurance" },
  { key: "insuranceMemberId", label: "Member ID", group: "Insurance" },
  { key: "insuranceGroupNumber", label: "Group number", group: "Insurance" },
  { key: "policyHolderName", label: "Policy holder", placeholder: "if not you", group: "Insurance" },

  { key: "primaryCareName", label: "Primary doctor", group: "Care team" },
  { key: "primaryCarePhone", label: "Their phone", type: "tel", group: "Care team" },
  { key: "pharmacyName", label: "Pharmacy", group: "Care team" },
  { key: "pharmacyPhone", label: "Pharmacy phone", type: "tel", group: "Care team" },

  { key: "allergies", label: "Allergies", placeholder: "None known", group: "Clinical" },
  { key: "conditions", label: "Conditions", group: "Clinical" },
  { key: "medications", label: "Medications", group: "Clinical" },

  { key: "earliestTime", label: "Earliest", type: "time", group: "When you can go" },
  { key: "latestTime", label: "Latest", type: "time", group: "When you can go" },
  { key: "transportNotes", label: "Getting there", placeholder: "no car on weekdays", group: "When you can go" },
];

const GROUPS = ["Identity", "Insurance", "Care team", "Clinical", "When you can go"];
const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

const CHANNEL_LABEL: Record<BookingChannel, string> = {
  phone: "Phone call",
  portal: "Portal / web",
  email: "Email (last resort)",
};

function historyOf(state: CareState): CareHistory {
  return state.history
    ? {
        lastDone: state.history.lastDone || {},
        disabled: state.history.disabled || [],
        intervalOverride: state.history.intervalOverride || {},
      }
    : emptyCareHistory();
}

function grantOf(state: CareState): AutoSendGrant {
  const base = emptyGrant();
  if (!state.grant) return base;
  // Migrate old email-only grants → phone + portal (how people actually book)
  const channels = state.grant.channels?.length
    ? (state.grant.channels as BookingChannel[])
    : base.channels;
  const migrated =
    channels.length === 1 && channels[0] === "email" ? (["phone", "portal"] as BookingChannel[]) : channels;
  return { ...base, ...state.grant, channels: migrated };
}

function channelClass(channel: BookingChannel): string {
  return channel === "phone" ? "phone" : channel === "portal" ? "portal" : "email";
}

export function CareAgentPanel() {
  const [state, setState] = useState<CareState>(() => loadCareState());
  const [tab, setTab] = useState<"due" | "details" | "prep">("due");
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const profile = state.profile;
  const history = useMemo(() => historyOf(state), [state]);
  const grant = useMemo(() => grantOf(state), [state]);

  const due = useMemo(() => computeDue(profile, history), [profile, history]);
  const now = useMemo(() => actionable(due), [due]);
  const gaps = useMemo(() => missingFields(profile), [profile]);

  function commit(next: CareState) {
    setState(next);
    saveCareState(next);
  }

  function patchProfile(key: keyof CareProfile, value: string | number[]) {
    commit({ ...state, profile: { ...profile, [key]: value } as CareProfile });
  }

  function patchHistory(next: CareHistory) {
    commit({ ...state, history: next });
  }

  function patchGrant(patch: Partial<AutoSendGrant>) {
    commit({ ...state, grant: { ...grant, ...patch } });
  }

  function showFlash(msg: string) {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 2200);
  }

  function previewFor(item: DueItem) {
    const provider =
      state.providers.find((p) =>
        p.specialty.toLowerCase().includes(item.rule.service.split("-")[0])
      ) ||
      state.providers[0] ||
      null;
    const request = {
      id: `due-${item.rule.id}`,
      action: "book" as const,
      service: item.rule.service,
      title: item.rule.label,
      providerId: provider?.id || null,
      providerName: provider?.name || "",
      dateWindow: null,
      appointmentId: null,
      locationPreference: "",
      visitMode: "in-person" as const,
      reason: item.rule.reason,
      notes: "",
      status: "ready-for-review" as const,
      missing: [] as string[],
      sourceText: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      approvedAt: null,
      sentAt: null,
      externalId: null,
      failureReason: null,
    };
    return buildHandoff(request, provider, profile, grant);
  }

  async function copyPack(body: string, subject: string) {
    try {
      await navigator.clipboard?.writeText(`${subject}\n\n${body}`);
      showFlash("Copied prep pack");
    } catch {
      showFlash("Could not copy — select the text manually");
    }
  }

  function logPrep(packet: ReturnType<typeof previewFor>) {
    patchGrant(recordSend(grant, packet.message));
  }

  return (
    <section className="ca">
      <div className="ca-tabs">
        <button type="button" className={tab === "due" ? "on" : ""} onClick={() => setTab("due")}>
          Due now {now.length ? <i>{now.length}</i> : null}
        </button>
        <button type="button" className={tab === "details" ? "on" : ""} onClick={() => setTab("details")}>
          Your details {gaps.required.length ? <i className="bad">{gaps.required.length}</i> : null}
        </button>
        <button type="button" className={tab === "prep" ? "on" : ""} onClick={() => setTab("prep")}>
          Call prep {grant.enabled ? <i className="live">on</i> : null}
        </button>
      </div>

      {flash && <p className="ca-flash">{flash}</p>}

      {/* ── Due now ─────────────────────────────────────────────── */}
      {tab === "due" && (
        <div className="ca-body">
          <p className="ca-note">
            Care does not cold-email clinics. When something is due, it builds a{" "}
            <b>phone script</b> (default), a <b>portal paste</b>, or — only if nothing else
            exists — a weak email draft. You call, book online, then log the slot.
          </p>

          {gaps.required.length > 0 && (
            <p className="ca-warn">
              Missing {gaps.required.join(", ")} — the front desk will hang up without these.
              <button type="button" onClick={() => setTab("details")}>
                Fill them in
              </button>
            </p>
          )}

          {now.length === 0 ? (
            <p className="ca-empty">
              Nothing is due. Add last-visit dates under the tracker below — Care will surface
              what’s overdue on its own.
            </p>
          ) : (
            <ul className="ca-due">
              {now.map((item) => {
                const packet = previewFor(item);
                const open = openItem === item.rule.id;
                const ch = packet.message.channel;
                const phone = packet.message.channel === "phone" ? packet.message.to : packet.provider?.phone || "";
                const web =
                  packet.message.channel === "portal"
                    ? packet.message.to
                    : packet.provider?.website || "";

                return (
                  <li key={item.rule.id} className={`is-${item.status}`}>
                    <div className="ca-due-head">
                      <div className="ca-due-what">
                        <b>{item.rule.label}</b>
                        <span>{item.because}</span>
                        {packet.provider?.name ? (
                          <span className="ca-office">
                            {packet.provider.name}
                            {phone ? ` · ${phone}` : ""}
                          </span>
                        ) : (
                          <span className="ca-office ca-office-warn">
                            No office on file — add a provider with a phone number
                          </span>
                        )}
                      </div>
                      <div className="ca-due-actions">
                        <span className={`ca-pill is-${item.status}`}>
                          {item.status === "overdue"
                            ? item.overdueDays > 0
                              ? `${item.overdueDays}d overdue`
                              : "never done"
                            : `in ${item.daysUntilDue}d`}
                        </span>
                        <button type="button" onClick={() => setOpenItem(open ? null : item.rule.id)}>
                          {open ? "Hide prep" : "Prep to book"}
                        </button>
                      </div>
                    </div>

                    {open && (
                      <div className="ca-preview">
                        <p className="ca-howto">{packet.message.howToBook}</p>
                        <div className="ca-preview-meta">
                          <span className={`ca-chan is-${channelClass(ch)}`}>{CHANNEL_LABEL[ch]}</span>
                          {packet.message.to && <span className="ca-to">{packet.message.to}</span>}
                          <span className={packet.authorised ? "ca-ok" : "ca-blocked"}>
                            {packet.authorised ? "standing prep covers this" : packet.authorisationReason}
                          </span>
                        </div>
                        <div className="ca-preview-subject">{packet.message.subject}</div>
                        <pre className="ca-preview-body">{packet.message.body}</pre>
                        {packet.message.missing.length > 0 && (
                          <p className="ca-preview-missing">
                            Front desk will also ask for: {packet.message.missing.join(", ")}
                          </p>
                        )}

                        <div className="ca-preview-foot ca-preview-foot-primary">
                          {phone ? (
                            <a
                              className="ca-cta ca-cta-call"
                              href={telHref(phone)}
                              onClick={() => logPrep(packet)}
                            >
                              Call office
                            </a>
                          ) : (
                            <button
                              type="button"
                              className="ca-cta ca-cta-muted"
                              onClick={() => setTab("details")}
                            >
                              Add office phone
                            </button>
                          )}
                          {web ? (
                            <a
                              className="ca-cta ca-cta-portal"
                              href={portalHref(web)}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => logPrep(packet)}
                            >
                              Open portal / site
                            </a>
                          ) : null}
                          <button
                            type="button"
                            className="ca-cta"
                            onClick={() => void copyPack(packet.message.body, packet.message.subject)}
                          >
                            Copy script
                          </button>
                        </div>

                        <div className="ca-preview-foot">
                          <button
                            type="button"
                            onClick={() => {
                              const today = new Date().toISOString().slice(0, 10);
                              patchHistory(markDone(history, item.rule.id, today));
                              logPrep(packet);
                              setOpenItem(null);
                              showFlash("Logged as booked — clock reset");
                            }}
                          >
                            Booked — log it
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const today = new Date().toISOString().slice(0, 10);
                              patchHistory(markDone(history, item.rule.id, today));
                              setOpenItem(null);
                            }}
                          >
                            Already done — reset clock
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <details className="ca-all">
            <summary>Visit tracker ({DUE_RULES.length})</summary>
            <ul className="ca-rules">
              {DUE_RULES.map((rule) => {
                const off = history.disabled.includes(rule.id);
                return (
                  <li key={rule.id} className={off ? "is-off" : ""}>
                    <label>
                      <input
                        type="checkbox"
                        checked={!off}
                        onChange={() =>
                          patchHistory({
                            ...history,
                            disabled: off
                              ? history.disabled.filter((d) => d !== rule.id)
                              : [...history.disabled, rule.id],
                          })
                        }
                      />
                      <b>{rule.label}</b>
                      <span>
                        every {history.intervalOverride[rule.id] ?? rule.intervalMonths} months
                      </span>
                    </label>
                    <input
                      className="ca-lastdone"
                      type="date"
                      value={history.lastDone[rule.id] || ""}
                      onChange={(e) =>
                        patchHistory({
                          ...history,
                          lastDone: { ...history.lastDone, [rule.id]: e.target.value },
                        })
                      }
                      title="Last completed"
                    />
                    <em>{rule.basis}</em>
                  </li>
                );
              })}
            </ul>
          </details>
        </div>
      )}

      {/* ── Your details ────────────────────────────────────────── */}
      {tab === "details" && (
        <div className="ca-body">
          <p className="ca-note">
            Stored in this browser only. These are the answers the front desk asks on the phone —
            name, DOB, insurance ID — so you never scramble mid-call. Your email is for portal
            logins and appointment confirmations, not for “booking by email.”
          </p>
          {GROUPS.map((group) => (
            <div key={group} className="ca-group">
              <div className="ca-group-title">{group}</div>
              <div className="ca-fields">
                {PROFILE_FIELDS.filter((f) => f.group === group).map((field) => {
                  const raw = profile[field.key];
                  const val = typeof raw === "string" ? raw : "";
                  const empty = field.required && !val.trim();
                  return (
                    <label key={String(field.key)} className={`ca-field${empty ? " is-empty" : ""}`}>
                      <span>
                        {field.label}
                        {field.required ? <i>required</i> : null}
                      </span>
                      <input
                        type={field.type || "text"}
                        value={val}
                        placeholder={field.placeholder || ""}
                        onChange={(e) => patchProfile(field.key, e.target.value)}
                      />
                    </label>
                  );
                })}
                {group === "When you can go" && (
                  <div className="ca-days">
                    <span>Days you can go</span>
                    <div>
                      {DAYS.map((d, i) => {
                        const on = (profile.preferredDays || []).includes(i);
                        return (
                          <button
                            key={i}
                            type="button"
                            className={on ? "on" : ""}
                            onClick={() => {
                              const cur = profile.preferredDays || [];
                              patchProfile(
                                "preferredDays",
                                on ? cur.filter((x) => x !== i) : [...cur, i].sort()
                              );
                            }}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Call prep (was “Auto-send”) ─────────────────────────── */}
      {tab === "prep" && (
        <div className="ca-body">
          <label className="ca-toggle">
            <input
              type="checkbox"
              checked={grant.enabled}
              onChange={(e) =>
                patchGrant({
                  enabled: e.target.checked,
                  grantedAt: e.target.checked ? new Date().toISOString() : null,
                })
              }
            />
            <div>
              <b>Standing call prep</b>
              <span>
                When something is due, Care treats the pack as ready to act on (call / portal) without
                an extra “are you sure?” — it still never emails a clinic for you.
                {grant.grantedAt ? ` On since ${grant.grantedAt.slice(0, 10)}.` : ""}
              </span>
            </div>
          </label>

          <div className="ca-limits">
            <div className="ca-limit-title">How booking actually works</div>
            <ul>
              <li>
                <b>Phone first.</b> Most dental, specialty, and small practices only book by phone.
                Care writes the script and dials.
              </li>
              <li>
                <b>Portal second.</b> If the office has a website / MyChart-style portal, open it and
                paste the prep block into notes.
              </li>
              <li>
                <b>Email last.</b> Cold email is ignored by most front desks. Only enable it if an
                office has no phone and no portal.
              </li>
              <li>
                <b>Incomplete packs stay blocked.</b> Missing name, DOB, or your phone stops the pack
                and names what’s missing.
              </li>
              <li>
                <label className="ca-inline">
                  <input
                    type="checkbox"
                    checked={grant.allowCancellations}
                    onChange={(e) => patchGrant({ allowCancellations: e.target.checked })}
                  />
                  Allow cancellation packs without extra confirm
                </label>
                <em>Off by default — cancellations are hard to undo.</em>
              </li>
              <li>
                <label className="ca-inline">
                  Daily prep cap
                  <input
                    className="ca-num"
                    type="number"
                    min={1}
                    max={50}
                    value={grant.dailyLimit}
                    onChange={(e) =>
                      patchGrant({ dailyLimit: Math.max(1, Number(e.target.value) || 1) })
                    }
                  />
                </label>
                <em>Limits how many packs can be actioned in a day.</em>
              </li>
              <li>
                Enabled paths:{" "}
                {(["phone", "portal", "email"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`ca-chan-toggle${grant.channels.includes(c) ? " on" : ""}`}
                    onClick={() =>
                      patchGrant({
                        channels: grant.channels.includes(c)
                          ? grant.channels.filter((x) => x !== c)
                          : [...grant.channels, c],
                      })
                    }
                  >
                    {CHANNEL_LABEL[c]}
                  </button>
                ))}
              </li>
            </ul>
          </div>

          <div className="ca-log">
            <div className="ca-limit-title">Prep / call log ({grant.log.length})</div>
            {grant.log.length === 0 ? (
              <p className="ca-empty">Nothing logged yet. Call an office or open a portal pack.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Path</th>
                    <th>What</th>
                  </tr>
                </thead>
                <tbody>
                  {[...grant.log]
                    .reverse()
                    .slice(0, 20)
                    .map((entry, i) => (
                      <tr key={i}>
                        <td>{entry.at.slice(0, 16).replace("T", " ")}</td>
                        <td>
                          {entry.channel} · {entry.to}
                        </td>
                        <td>{entry.subject}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
