/**
 * Content Empire — YouTube research OS.
 * UI language matches Fitness → Sleep (fx-page editorial).
 * Math/models stay in Mel backend; this page is the operator surface.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addFinding,
  addNextTest,
  addRetentionPoint,
  analyzeVideo,
  channelViewsSeries,
  computeChannelStats,
  deleteVideo,
  getChannelGoal,
  listVideos,
  logViews,
  setChannelGoal,
  upsertVideo,
} from "./melContent";
import {
  formatFinanceBrief,
  loadFinanceModel,
  setFinanceModel,
  runwayMonths,
} from "./melFinanceModel";
import { runSuccessEngine } from "./melSuccessMath";
import { MEL_PROMPT_EVENT } from "./melActions";
import "./fitness-exact.css";
import "./content-empire.css";

export function isContentEmpirePage(pageId: string): boolean {
  return (
    pageId === "pg-math" ||
    pageId === "pg-content" ||
    pageId === "pg-youtube" ||
    pageId === "pg-channel" ||
    pageId === "pg-math-lab" ||
    pageId === "pg-learn-math"
  );
}

type Tab = "channel" | "videos" | "research" | "capital" | "ops";

const CONTENT_EVENT = "wonder-content-changed";

function notifyContent() {
  try {
    window.dispatchEvent(new CustomEvent(CONTENT_EVENT));
  } catch {
    /* ignore */
  }
}

function askMel(text: string) {
  try {
    window.dispatchEvent(
      new CustomEvent(MEL_PROMPT_EVENT, { detail: { text } })
    );
  } catch {
    /* ignore */
  }
}

/** Sleep-style line chart using fx chart tokens */
function EmpireLineChart({
  points,
  unit = "",
  yIsPercent = false,
  empty = "Log data to draw the graph.",
}: {
  points: { x: number | string; y: number; label?: string }[];
  unit?: string;
  yIsPercent?: boolean;
  empty?: string;
}) {
  const w = 640;
  const h = 168;
  const padL = 36;
  const padR = 12;
  const padT = 14;
  const padB = 28;
  const cleaned = points.filter((p) => Number.isFinite(p.y));
  if (cleaned.length < 2) {
    return <p className="ce-empty-chart">{empty}</p>;
  }
  const ys = cleaned.map((p) => p.y);
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  if (yIsPercent) {
    yMin = Math.min(0, yMin);
    yMax = Math.max(100, yMax);
  } else if (yMax === yMin) {
    yMax = yMin + 1;
  }
  const span = yMax - yMin || 1;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const coords = cleaned.map((p, i) => {
    const cx =
      padL +
      (cleaned.length === 1 ? innerW / 2 : (i / (cleaned.length - 1)) * innerW);
    const cy = padT + innerH - ((p.y - yMin) / span) * innerH;
    return { x: cx, y: cy, label: p.label, rawX: p.x, rawY: p.y };
  });
  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");
  const area =
    line +
    ` L${coords[coords.length - 1]!.x},${padT + innerH} L${coords[0]!.x},${padT + innerH} Z`;
  const yTicks = [0, 0.5, 1].map((t) => {
    const v = yMin + span * (1 - t);
    const y = padT + innerH * t;
    const label = yIsPercent
      ? `${Math.round(v)}%`
      : v >= 1000
        ? `${(v / 1000).toFixed(1)}k`
        : String(Math.round(v));
    return { y, label };
  });

  return (
    <svg
      className="ce-chart"
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label="Chart"
    >
      {yTicks.map((t) => (
        <g key={t.label + t.y}>
          <line
            x1={padL}
            x2={w - padR}
            y1={t.y}
            y2={t.y}
            className="ce-chart-grid"
          />
          <text x={padL - 6} y={t.y + 3} className="ce-chart-ylab" textAnchor="end">
            {t.label}
          </text>
        </g>
      ))}
      <path d={area} className="ce-chart-area" />
      <path d={line} className="ce-chart-line" fill="none" />
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={3} className="ce-chart-dot">
          <title>
            {c.label ?? String(c.rawX)}: {c.rawY}
            {unit}
          </title>
        </circle>
      ))}
      {coords.map((c, i) =>
        i === 0 || i === coords.length - 1 || i % Math.ceil(coords.length / 5) === 0 ? (
          <text
            key={`x${i}`}
            x={c.x}
            y={h - 8}
            className="ce-chart-xlab"
            textAnchor="middle"
          >
            {String(c.label ?? c.rawX).slice(0, 8)}
          </text>
        ) : null
      )}
    </svg>
  );
}

function shortDay(iso: string): string {
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${Number(m[2])}/${Number(m[3])}`;
}

export function ContentEmpire() {
  const [tab, setTab] = useState<Tab>("channel");
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const on = () => refresh();
    window.addEventListener(CONTENT_EVENT, on);
    return () => window.removeEventListener(CONTENT_EVENT, on);
  }, [refresh]);

  const videos = useMemo(() => listVideos(), [tick]);
  const stats = useMemo(() => computeChannelStats(), [tick]);
  const viewsSeries = useMemo(() => channelViewsSeries(), [tick]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    videos.find((v) => v.id === selectedId) || videos[0] || null;

  // Forms
  const [newTitle, setNewTitle] = useState("");
  const [newViews, setNewViews] = useState("");
  const [retSec, setRetSec] = useState("15");
  const [retVal, setRetVal] = useState("60");
  const [finding, setFinding] = useState("");
  const [test, setTest] = useState("");
  const [goal, setGoal] = useState(() => getChannelGoal());
  const [cash, setCash] = useState(() => String(loadFinanceModel().cash ?? ""));
  const [burn, setBurn] = useState(() =>
    String(loadFinanceModel().monthlyBurn ?? "")
  );
  const [saveAmt, setSaveAmt] = useState(() =>
    String(loadFinanceModel().monthlySave ?? "")
  );
  const fin = useMemo(() => loadFinanceModel(), [tick]);
  const runway = runwayMonths(fin);
  const [opsText, setOpsText] = useState(() => runSuccessEngine("next"));

  function afterMutate() {
    notifyContent();
    refresh();
  }

  function submitVideo(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const v = logViews(
      newTitle.trim(),
      Number(String(newViews).replace(/,/g, "")) || 0
    );
    setSelectedId(v.id);
    setNewTitle("");
    setNewViews("");
    afterMutate();
  }

  function submitRetention(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    addRetentionPoint(selected.id, Number(retSec) || 0, Number(retVal) || 0);
    afterMutate();
  }

  function submitFinding(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !finding.trim()) return;
    addFinding(selected.id, finding.trim());
    setFinding("");
    afterMutate();
  }

  function submitTest(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !test.trim()) return;
    addNextTest(selected.id, test.trim());
    setTest("");
    afterMutate();
  }

  const retentionPoints =
    selected?.retention.map((p) => ({
      x: p.sec,
      y: p.value,
      label: `${p.sec}s`,
    })) || [];

  const channelChartPoints = viewsSeries.map((p) => ({
    x: p.day,
    y: p.views,
    label: shortDay(p.day),
  }));

  return (
    <div className="fx-page ce-page">
      <div className="fx-inner">
        <nav className="fx-subnav" aria-label="Content">
          {(
            [
              ["channel", "Channel"],
              ["videos", "Videos"],
              ["research", "Research"],
              ["capital", "Capital"],
              ["ops", "Ops"],
            ] as const
          ).map(([id, label]) => (
            <span key={id} className="fx-subnav-item">
              <button
                type="button"
                className={`fx-subnav-link${tab === id ? " is-active" : ""}`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            </span>
          ))}
        </nav>

        {/* ── CHANNEL ── */}
        {tab === "channel" ? (
          <div className="fx-sleep-spread">
            <section className="fx-section" aria-label="Channel pulse">
              <div className="ce-strip" aria-label="Channel metrics">
                <div className="ce-strip-item">
                  <span className="ce-strip-lab">Research score</span>
                  <b className="ce-strip-val">
                    {stats.researchScore}
                    <small>/100</small>
                  </b>
                </div>
                <div className="ce-strip-item">
                  <span className="ce-strip-lab">Total views</span>
                  <b className="ce-strip-val ce-strip-val-sm">
                    {stats.totalViews.toLocaleString()}
                  </b>
                </div>
                <div className="ce-strip-item">
                  <span className="ce-strip-lab">Videos</span>
                  <b className="ce-strip-val ce-strip-val-sm">
                    {stats.videoCount}
                  </b>
                </div>
                <div className="ce-strip-item">
                  <span className="ce-strip-lab">Avg views</span>
                  <b className="ce-strip-val ce-strip-val-sm">
                    {stats.avgViews.toLocaleString()}
                  </b>
                </div>
                <div className="ce-strip-item">
                  <span className="ce-strip-lab">Sec anchors</span>
                  <b className="ce-strip-val ce-strip-val-sm">
                    {stats.retentionAnchors}
                  </b>
                </div>
                <div className="ce-strip-item">
                  <span className="ce-strip-lab">Findings</span>
                  <b className="ce-strip-val ce-strip-val-sm is-up">
                    {stats.findings}
                  </b>
                </div>
              </div>
              <p className="ce-note">
                Score rises when every upload has retention seconds + findings +
                next tests. Views without research = vanity.
              </p>
            </section>

            <section className="fx-section" aria-label="Views over time">
              <h2 className="fx-h2">VIEWS</h2>
              <EmpireLineChart
                points={channelChartPoints}
                empty="Log a video with views to start the channel graph."
              />
            </section>

            <section className="fx-section" aria-label="Goal">
              <h2 className="fx-h2">GOAL</h2>
              <form
                className="ce-inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  setChannelGoal(goal);
                  afterMutate();
                }}
              >
                <input
                  className="ce-input ce-input-wide"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="Best operator YouTube — research every second"
                />
                <button type="submit" className="ce-text-btn">
                  Save
                </button>
              </form>
            </section>

            <section className="fx-section" aria-label="Top videos">
              <h2 className="fx-h2">LIBRARY</h2>
              {videos.length === 0 ? (
                <p className="ce-muted">
                  No videos yet. Open Videos and log your first upload.
                </p>
              ) : (
                <div className="ce-video-list" role="list">
                  {videos.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className={`ce-video-row${
                        selected?.id === v.id ? " is-active" : ""
                      }`}
                      onClick={() => {
                        setSelectedId(v.id);
                        setTab("research");
                      }}
                    >
                      <span className="ce-video-title">{v.title}</span>
                      <span className="ce-video-meta">
                        {v.views.toLocaleString()} views
                        {v.retention.length
                          ? ` · ${v.retention.length}s`
                          : ""}
                        {v.findings.length
                          ? ` · ${v.findings.length} findings`
                          : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <footer className="fx-nights-footer">
              <button
                type="button"
                className="fx-whoop-import-btn"
                onClick={() => askMel("youtube plan")}
              >
                Ask Mel for channel plan
              </button>
            </footer>
          </div>
        ) : null}

        {/* ── VIDEOS ── */}
        {tab === "videos" ? (
          <div className="fx-sleep-spread">
            <section className="fx-section" aria-label="Log video">
              <h2 className="fx-h2">LOG UPLOAD</h2>
              <form className="ce-form" onSubmit={submitVideo}>
                <label className="ce-field">
                  Title
                  <input
                    className="ce-input"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Video title"
                    required
                  />
                </label>
                <label className="ce-field">
                  Views
                  <input
                    className="ce-input"
                    inputMode="numeric"
                    value={newViews}
                    onChange={(e) => setNewViews(e.target.value)}
                    placeholder="840"
                  />
                </label>
                <button type="submit" className="ce-primary">
                  Save
                </button>
              </form>
              <p className="ce-note">
                Log day-1 and day-7 views on the same title — history builds the
                graph.
              </p>
            </section>

            <section className="fx-section" aria-label="All videos">
              <h2 className="fx-h2">ALL VIDEOS</h2>
              <div className="ce-video-list" role="list">
                {videos.map((v) => (
                  <div key={v.id} className="ce-video-row-wrap">
                    <button
                      type="button"
                      className={`ce-video-row${
                        selected?.id === v.id ? " is-active" : ""
                      }`}
                      onClick={() => {
                        setSelectedId(v.id);
                        setTab("research");
                      }}
                    >
                      <span className="ce-video-title">{v.title}</span>
                      <span className="ce-video-meta">
                        {v.views.toLocaleString()} ·{" "}
                        {v.publishedAt ? shortDay(v.publishedAt) : "—"}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="ce-text-btn ce-danger"
                      onClick={() => {
                        deleteVideo(v.id);
                        if (selectedId === v.id) setSelectedId(null);
                        afterMutate();
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {/* ── RESEARCH ── */}
        {tab === "research" ? (
          <div className="fx-sleep-spread">
            {!selected ? (
              <p className="ce-muted">Log a video first, then research every second.</p>
            ) : (
              <>
                <section className="fx-section" aria-label="Selected video">
                  <p className="ce-kicker">Selected</p>
                  <p className="ce-video-hero">{selected.title}</p>
                  <p className="fx-line">
                    <span className="fx-key">Views:</span>
                    <span className="fx-val">
                      {selected.views.toLocaleString()}
                    </span>
                  </p>
                  <p className="fx-line">
                    <span className="fx-key">Anchors:</span>
                    <span className="fx-val">{selected.retention.length}</span>
                  </p>
                </section>

                <section className="fx-section" aria-label="Retention">
                  <h2 className="fx-h2">RETENTION BY SECOND</h2>
                  <EmpireLineChart
                    points={retentionPoints}
                    yIsPercent
                    unit="%"
                    empty="Add anchors from YouTube Studio retention graph: 0s, first cliff, mid, end."
                  />
                  <form className="ce-form ce-form-row" onSubmit={submitRetention}>
                    <label className="ce-field">
                      Second
                      <input
                        className="ce-input"
                        inputMode="numeric"
                        value={retSec}
                        onChange={(e) => setRetSec(e.target.value)}
                      />
                    </label>
                    <label className="ce-field">
                      Still watching %
                      <input
                        className="ce-input"
                        inputMode="decimal"
                        value={retVal}
                        onChange={(e) => setRetVal(e.target.value)}
                      />
                    </label>
                    <button type="submit" className="ce-primary">
                      Add anchor
                    </button>
                  </form>
                  {selected.retention.length > 0 ? (
                    <div className="ce-anchor-list">
                      {selected.retention.map((p) => (
                        <span key={p.sec} className="ce-anchor-chip">
                          {p.sec}s → {p.value}%
                        </span>
                      ))}
                    </div>
                  ) : null}
                </section>

                <section className="fx-section" aria-label="Findings">
                  <h2 className="fx-h2">FINDINGS</h2>
                  <ul className="ce-bullet-list">
                    {selected.findings.length === 0 ? (
                      <li className="ce-muted">Boil what you saw to one sentence.</li>
                    ) : (
                      selected.findings.map((f, i) => <li key={i}>{f}</li>)
                    )}
                  </ul>
                  <form className="ce-inline-form" onSubmit={submitFinding}>
                    <input
                      className="ce-input ce-input-wide"
                      value={finding}
                      onChange={(e) => setFinding(e.target.value)}
                      placeholder="Hook worked / drop at joke / CTA too late"
                    />
                    <button type="submit" className="ce-text-btn">
                      Add
                    </button>
                  </form>
                </section>

                <section className="fx-section" aria-label="Next tests">
                  <h2 className="fx-h2">NEXT TESTS</h2>
                  <ul className="ce-bullet-list">
                    {selected.nextTests.length === 0 ? (
                      <li className="ce-muted">One experiment for the next upload.</li>
                    ) : (
                      selected.nextTests.map((t, i) => <li key={i}>{t}</li>)
                    )}
                  </ul>
                  <form className="ce-inline-form" onSubmit={submitTest}>
                    <input
                      className="ce-input ce-input-wide"
                      value={test}
                      onChange={(e) => setTest(e.target.value)}
                      placeholder="Faster face in first 2s"
                    />
                    <button type="submit" className="ce-text-btn">
                      Add
                    </button>
                  </form>
                </section>

                <section className="fx-section" aria-label="Boiled analysis">
                  <h2 className="fx-h2">BOILED DOWN</h2>
                  <pre className="ce-analysis">
                    {analyzeVideo(selected.id)}
                  </pre>
                  <button
                    type="button"
                    className="fx-whoop-import-btn"
                    onClick={() => askMel(`analyze ${selected.title}`)}
                  >
                    Open in Mel
                  </button>
                </section>

                <section className="fx-section" aria-label="Pick video">
                  <h2 className="fx-h2">SWITCH VIDEO</h2>
                  <div className="ce-video-list">
                    {videos.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        className={`ce-video-row${
                          selected.id === v.id ? " is-active" : ""
                        }`}
                        onClick={() => setSelectedId(v.id)}
                      >
                        <span className="ce-video-title">{v.title}</span>
                        <span className="ce-video-meta">
                          {v.views.toLocaleString()}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>
        ) : null}

        {/* ── CAPITAL ── */}
        {tab === "capital" ? (
          <div className="fx-sleep-spread">
            <section className="fx-section" aria-label="Runway">
              <div className="ce-strip">
                <div className="ce-strip-item">
                  <span className="ce-strip-lab">Runway</span>
                  <b className="ce-strip-val">
                    {runway == null
                      ? "—"
                      : runway >= 999
                        ? "∞"
                        : runway.toFixed(1)}
                    {runway != null && runway < 999 ? <small> mo</small> : null}
                  </b>
                </div>
                <div className="ce-strip-item">
                  <span className="ce-strip-lab">Cash</span>
                  <b className="ce-strip-val ce-strip-val-sm">
                    {fin.cash != null ? `$${fin.cash.toLocaleString()}` : "—"}
                  </b>
                </div>
                <div className="ce-strip-item">
                  <span className="ce-strip-lab">Burn</span>
                  <b className="ce-strip-val ce-strip-val-sm">
                    {fin.monthlyBurn != null
                      ? `$${fin.monthlyBurn.toLocaleString()}`
                      : "—"}
                  </b>
                </div>
                <div className="ce-strip-item">
                  <span className="ce-strip-lab">Save</span>
                  <b className="ce-strip-val ce-strip-val-sm is-up">
                    {fin.monthlySave != null
                      ? `$${fin.monthlySave.toLocaleString()}`
                      : "—"}
                  </b>
                </div>
              </div>
              <p className="ce-note">
                Lean 20s model: one roof, real people, optionality for ventures.
                YouTube + products fund the empire — not lifestyle inflation.
              </p>
            </section>

            <section className="fx-section" aria-label="Set capital">
              <h2 className="fx-h2">SET NUMBERS</h2>
              <form
                className="ce-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  setFinanceModel({
                    cash: cash ? Number(cash.replace(/,/g, "")) : null,
                    monthlyBurn: burn ? Number(burn.replace(/,/g, "")) : null,
                    monthlySave: saveAmt
                      ? Number(saveAmt.replace(/,/g, ""))
                      : null,
                  });
                  afterMutate();
                }}
              >
                <label className="ce-field">
                  Cash buffer
                  <input
                    className="ce-input"
                    value={cash}
                    onChange={(e) => setCash(e.target.value)}
                    placeholder="8000"
                  />
                </label>
                <label className="ce-field">
                  Monthly burn
                  <input
                    className="ce-input"
                    value={burn}
                    onChange={(e) => setBurn(e.target.value)}
                    placeholder="2400"
                  />
                </label>
                <label className="ce-field">
                  Monthly save
                  <input
                    className="ce-input"
                    value={saveAmt}
                    onChange={(e) => setSaveAmt(e.target.value)}
                    placeholder="500"
                  />
                </label>
                <button type="submit" className="ce-primary">
                  Update model
                </button>
              </form>
            </section>

            <section className="fx-section">
              <h2 className="fx-h2">BRIEF</h2>
              <pre className="ce-analysis">{formatFinanceBrief()}</pre>
              <button
                type="button"
                className="fx-whoop-import-btn"
                onClick={() => askMel("runway")}
              >
                Ask Mel about runway
              </button>
            </section>
          </div>
        ) : null}

        {/* ── OPS ── */}
        {tab === "ops" ? (
          <div className="fx-sleep-spread">
            <section className="fx-section" aria-label="Priority ops">
              <h2 className="fx-h2">PRIORITY</h2>
              <p className="ce-note">
                Backend engines on your body/focus data — protocol only, no math
                tourism.
              </p>
              <pre className="ce-analysis">{opsText}</pre>
              <div className="ce-ops-actions">
                <button
                  type="button"
                  className="ce-primary"
                  onClick={() => setOpsText(runSuccessEngine("next"))}
                >
                  Refresh priority
                </button>
                <button
                  type="button"
                  className="ce-text-btn"
                  onClick={() => setOpsText(runSuccessEngine("sleep-recovery"))}
                >
                  Sleep
                </button>
                <button
                  type="button"
                  className="ce-text-btn"
                  onClick={() => setOpsText(runSuccessEngine("focus-compound"))}
                >
                  Focus
                </button>
                <button
                  type="button"
                  className="ce-text-btn"
                  onClick={() => setOpsText(runSuccessEngine("optimize-week"))}
                >
                  Week
                </button>
                <button
                  type="button"
                  className="fx-whoop-import-btn"
                  onClick={() => askMel("accelerate")}
                >
                  Run in Mel
                </button>
              </div>
            </section>

            <section className="fx-section">
              <h2 className="fx-h2">OPERATOR LOOP</h2>
              <ol className="ce-bullet-list ce-ol">
                <li>Ship video → log views day 1 and day 7</li>
                <li>Three retention anchors minimum (0s, cliff, mid)</li>
                <li>One finding + one next test</li>
                <li>Weekly: kill dead formats, double what holds past 30s</li>
                <li>Capital: protect runway while distribution compounds</li>
              </ol>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// silence unused import if tree shakes upsert
void upsertVideo;
