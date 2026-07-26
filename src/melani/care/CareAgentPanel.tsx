/**
 * Care agent panel — the surface for the due engine, the profile vault, and
 * the standing send authorisation.
 *
 * Three sections, in the order the agent uses them:
 *   1. Due now      — what it found without being asked, and the one action
 *   2. Your details — the vault; every field here removes a callback
 *   3. Auto-send    — the standing grant, its limits, and the audit log
 *
 * The vault is deliberately blunt about what is missing. A booking request
 * without a date of birth does not fail loudly, it just produces a phone call
 * three days later, so the panel names the gaps up front.
 *
 * Everything here stays in this browser's localStorage. Nothing is
 * transmitted by this page — it cannot be; a static page holds no mail
 * credential. Sends happen through an authorised handoff.
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
  type AutoSendGrant,
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
  { key: "phone", label: "Phone", type: "tel", placeholder: "555-0142", group: "Identity", required: true },
  { key: "email", label: "Email", type: "email", group: "Identity" },

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
  return state.grant ? { ...emptyGrant(), ...state.grant } : emptyGrant();
}

export function CareAgentPanel() {
  const [state, setState] = useState<CareState>(() => loadCareState());
  const [tab, setTab] = useState<"due" | "details" | "auto">("due");
  const [openItem, setOpenItem] = useState<string | null>(null);

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

  /** Preview exactly what would go out for a due item. */
  function previewFor(item: DueItem) {
    const provider =
      state.providers.find((p) => p.specialty.toLowerCase().includes(item.rule.service.split("-")[0])) ||
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
      missing: [],
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

  return (
    <section className="ca">
      <div className="ca-tabs">
        <button className={tab === "due" ? "on" : ""} onClick={() => setTab("due")}>
          Due now {now.length ? <i>{now.length}</i> : null}
        </button>
        <button className={tab === "details" ? "on" : ""} onClick={() => setTab("details")}>
          Your details {gaps.required.length ? <i className="bad">{gaps.required.length}</i> : null}
        </button>
        <button className={tab === "auto" ? "on" : ""} onClick={() => setTab("auto")}>
          Auto-send {grant.enabled ? <i className="live">on</i> : null}
        </button>
      </div>

      {/* ── Due now ─────────────────────────────────────────────── */}
      {tab === "due" && (
        <div className="ca-body">
          {gaps.required.length > 0 && (
            <p className="ca-warn">
              Missing {gaps.required.join(", ")} — nothing can be sent until those are filled in.
              <button onClick={() => setTab("details")}>Fill them in</button>
            </p>
          )}

          {now.length === 0 ? (
            <p className="ca-empty">
              Nothing is due. Add your last-visit dates under Your details and the agent will work out
              what's overdue on its own.
            </p>
          ) : (
            <ul className="ca-due">
              {now.map((item) => {
                const packet = previewFor(item);
                const open = openItem === item.rule.id;
                return (
                  <li key={item.rule.id} className={`is-${item.status}`}>
                    <div className="ca-due-head">
                      <div className="ca-due-what">
                        <b>{item.rule.label}</b>
                        <span>{item.because}</span>
                      </div>
                      <div className="ca-due-actions">
                        <span className={`ca-pill is-${item.status}`}>
                          {item.status === "overdue"
                            ? item.overdueDays > 0 ? `${item.overdueDays}d overdue` : "never done"
                            : `in ${item.daysUntilDue}d`}
                        </span>
                        <button onClick={() => setOpenItem(open ? null : item.rule.id)}>
                          {open ? "Hide" : "See what it'd send"}
                        </button>
                      </div>
                    </div>

                    {open && (
                      <div className="ca-preview">
                        <div className="ca-preview-meta">
                          <span className={`ca-chan is-${packet.message.channel}`}>{packet.message.channel}</span>
                          {packet.message.to && <span className="ca-to">{packet.message.to}</span>}
                          <span className={packet.authorised ? "ca-ok" : "ca-blocked"}>
                            {packet.authorised ? "would send automatically" : packet.authorisationReason}
                          </span>
                        </div>
                        <div className="ca-preview-subject">{packet.message.subject}</div>
                        <pre className="ca-preview-body">{packet.message.body}</pre>
                        {packet.message.missing.length > 0 && (
                          <p className="ca-preview-missing">
                            Offices will also ask for: {packet.message.missing.join(", ")}
                          </p>
                        )}
                        <div className="ca-preview-foot">
                          <button
                            onClick={() => {
                              void navigator.clipboard?.writeText(
                                `${packet.message.subject}\n\n${packet.message.body}`
                              );
                            }}
                          >
                            Copy
                          </button>
                          <button
                            onClick={() => {
                              const today = new Date().toISOString().slice(0, 10);
                              patchHistory(markDone(history, item.rule.id, today));
                              setOpenItem(null);
                            }}
                          >
                            Already done — reset the clock
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
            <summary>All tracked care ({DUE_RULES.length})</summary>
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
                      <span>every {history.intervalOverride[rule.id] ?? rule.intervalMonths} months</span>
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
            Stored in this browser only. This page has no mail credential, so nothing leaves it on its own —
            sends go through an authorised handoff.
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

      {/* ── Auto-send ───────────────────────────────────────────── */}
      {tab === "auto" && (
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
              <b>Send without asking me each time</b>
              <span>
                Standing authorisation. Granted once here rather than per message.
                {grant.grantedAt ? ` Given ${grant.grantedAt.slice(0, 10)}.` : ""}
              </span>
            </div>
          </label>

          <div className="ca-limits">
            <div className="ca-limit-title">Limits that always apply</div>
            <ul>
              <li><b>Incomplete messages never send.</b> Missing a required detail stops it and says which.</li>
              <li>
                <label className="ca-inline">
                  <input
                    type="checkbox"
                    checked={grant.allowCancellations}
                    onChange={(e) => patchGrant({ allowCancellations: e.target.checked })}
                  />
                  Allow cancellations to auto-send
                </label>
                <em>Off by default — a cancellation is hard to undo.</em>
              </li>
              <li>
                <label className="ca-inline">
                  Daily cap
                  <input
                    className="ca-num"
                    type="number"
                    min="1"
                    max="50"
                    value={grant.dailyLimit}
                    onChange={(e) => patchGrant({ dailyLimit: Math.max(1, Number(e.target.value) || 1) })}
                  />
                  messages
                </label>
                <em>Stops a bug from mailing one office repeatedly.</em>
              </li>
              <li>
                Channels:{" "}
                {(["email", "phone", "portal"] as const).map((c) => (
                  <button
                    key={c}
                    className={`ca-chan-toggle${grant.channels.includes(c) ? " on" : ""}`}
                    onClick={() =>
                      patchGrant({
                        channels: grant.channels.includes(c)
                          ? grant.channels.filter((x) => x !== c)
                          : [...grant.channels, c],
                      })
                    }
                  >
                    {c}
                  </button>
                ))}
                <em>Phone can't be automated — it produces a script for you to read.</em>
              </li>
            </ul>
          </div>

          <div className="ca-log">
            <div className="ca-limit-title">Sent log ({grant.log.length})</div>
            {grant.log.length === 0 ? (
              <p className="ca-empty">Nothing has been sent yet.</p>
            ) : (
              <table>
                <thead><tr><th>When</th><th>To</th><th>Subject</th></tr></thead>
                <tbody>
                  {[...grant.log].reverse().slice(0, 20).map((entry, i) => (
                    <tr key={i}>
                      <td>{entry.at.slice(0, 16).replace("T", " ")}</td>
                      <td>{entry.to}</td>
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
