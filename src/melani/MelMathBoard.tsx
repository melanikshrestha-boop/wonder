/**
 * Mel Science board — SUCCESS MATH first (apply to your metrics).
 * Textbook tracks still available under "Library" if you want pure models.
 */
import { useEffect, useMemo, useState } from "react";
import { formatCrudeRun } from "./crudeMath";
import {
  EMPIRE_LESSONS,
  MATH_TRACKS,
  findEmpireLesson,
  lessonsForTrack,
  type MathTrackId,
} from "./crudeMathEmpire";
import {
  getMathProgress,
  runMathLesson,
  setMathTrack,
} from "./melMath";
import {
  SUCCESS_ENGINES,
  formatSuccessRun,
  runSuccessEngine,
  type SuccessEngine,
} from "./melSuccessMath";
import "./math-lab.css";

export const MEL_MATH_REFRESH_EVENT = "wonder-mel-math-refresh";

export function notifyMelMathRefresh() {
  try {
    window.dispatchEvent(new CustomEvent(MEL_MATH_REFRESH_EVENT));
  } catch {
    /* ignore */
  }
}

type BoardMode = "success" | "library";

type Props = {
  compact?: boolean;
  onRanLesson?: (id: string, text: string) => void;
};

export function MelMathBoard({ compact = false, onRanLesson }: Props) {
  const [tick, setTick] = useState(0);
  const [boardMode, setBoardMode] = useState<BoardMode>("success");
  const progress = useMemo(() => getMathProgress(), [tick]);
  const [activeEngine, setActiveEngine] = useState<string>("optimize-week");
  const [activeId, setActiveId] = useState<string>(
    () => progress.nextId || "linear"
  );
  const [output, setOutput] = useState<string>(() =>
    runSuccessEngine("optimize-week")
  );

  const trackLessons = lessonsForTrack(progress.track);

  useEffect(() => {
    const onRefresh = () => {
      setTick((t) => t + 1);
    };
    window.addEventListener(MEL_MATH_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(MEL_MATH_REFRESH_EVENT, onRefresh);
  }, []);

  function refresh() {
    setTick((t) => t + 1);
  }

  function runEngine(id: string) {
    setBoardMode("success");
    setActiveEngine(id);
    const text = runSuccessEngine(id);
    setOutput(text);
    onRanLesson?.(id, text);
    refresh();
    notifyMelMathRefresh();
  }

  function play(id: string) {
    setBoardMode("library");
    setActiveId(id);
    const text = runMathLesson(id);
    setOutput(text);
    onRanLesson?.(id, text);
    refresh();
    notifyMelMathRefresh();
  }

  function nextLibrary() {
    const text = runMathLesson("next");
    setOutput(text);
    const p = getMathProgress();
    if (p.nextId) setActiveId(p.nextId);
    onRanLesson?.(p.nextId || "next", text);
    refresh();
    notifyMelMathRefresh();
  }

  function switchTrack(t: MathTrackId) {
    setMathTrack(t);
    const list = lessonsForTrack(t);
    play(list[0]?.id || "linear");
  }

  function accelerate() {
    const text = runSuccessEngine("next");
    setBoardMode("success");
    setOutput(text);
    onRanLesson?.("accelerate", text);
    refresh();
    notifyMelMathRefresh();
  }

  return (
    <div className={`mlab mel-math-board${compact ? " is-compact" : ""}`}>
      <header className="mlab-head">
        <p className="mlab-kicker">Mel · Science · Success math</p>
        <h1 className="mlab-title">Apply the math</h1>
        {!compact && (
          <p className="mlab-sub">
            Discrete models on <strong>your</strong> sleep, focus, and capital —
            protocols that move outcomes. Not useless textbook tourism.
          </p>
        )}
      </header>

      <div className="mlab-strip">
        <div className="mlab-strip-item">
          <span className="mlab-strip-lab">Mode</span>
          <b className="mlab-strip-val mlab-strip-val-sm">
            {boardMode === "success" ? "Apply" : "Library"}
          </b>
        </div>
        <div className="mlab-strip-item">
          <span className="mlab-strip-lab">Metrics</span>
          <b className="mlab-strip-val mlab-strip-val-sm">live</b>
        </div>
        <button type="button" className="mlab-btn" onClick={accelerate}>
          Accelerate now
        </button>
        <button
          type="button"
          className="mlab-btn mlab-btn-ghost"
          onClick={() => runEngine("list")}
        >
          All engines
        </button>
        <button
          type="button"
          className={`mlab-btn mlab-btn-ghost${boardMode === "library" ? " on" : ""}`}
          onClick={() => {
            setBoardMode("library");
            const L = findEmpireLesson(progress.nextId || "linear");
            setOutput(L ? formatCrudeRun(L.run()) : runMathLesson("list"));
          }}
        >
          Library
        </button>
      </div>

      {boardMode === "success" ? (
        <>
          <div className="mlab-tracks" role="tablist" aria-label="Success engines">
            {SUCCESS_ENGINES.map((e: SuccessEngine) => (
              <button
                key={e.id}
                type="button"
                role="tab"
                className={`mlab-track${activeEngine === e.id ? " on" : ""}`}
                onClick={() => runEngine(e.id)}
                title={e.accelerates}
              >
                {e.name}
              </button>
            ))}
          </div>

          <div className="mlab-body">
            <aside className="mlab-lessons">
              <p className="mlab-section-title">Engines</p>
              <ul>
                {SUCCESS_ENGINES.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      className={`mlab-lesson${activeEngine === e.id ? " on" : ""}`}
                      onClick={() => runEngine(e.id)}
                    >
                      <span className="mlab-lesson-id">{e.domain}</span>
                      <span className="mlab-lesson-title">{e.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>

            <article className="mlab-panel">
              <p className="mlab-section-title">Applied trajectory + protocol</p>
              <pre className="mlab-out">{output}</pre>
            </article>
          </div>
        </>
      ) : (
        <>
          <div className="mlab-tracks" role="tablist" aria-label="Math library tracks">
            {MATH_TRACKS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                className={`mlab-track${progress.track === t.id ? " on" : ""}`}
                onClick={() => switchTrack(t.id)}
              >
                {t.name}
              </button>
            ))}
          </div>

          <div className="mlab-body">
            <aside className="mlab-lessons">
              <p className="mlab-section-title">
                Library {progress.completed.length}/{EMPIRE_LESSONS.length}
              </p>
              <ul>
                {trackLessons.map((L) => {
                  const done = progress.completed.includes(L.id);
                  return (
                    <li key={L.id}>
                      <button
                        type="button"
                        className={`mlab-lesson${activeId === L.id ? " on" : ""}${
                          done ? " done" : ""
                        }`}
                        onClick={() => play(L.id)}
                      >
                        <span className="mlab-lesson-id">{L.id}</span>
                        <span className="mlab-lesson-title">{L.title}</span>
                        {done ? <span className="mlab-check">✓</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button type="button" className="mlab-btn" onClick={nextLibrary}>
                Run next library
              </button>
            </aside>

            <article className="mlab-panel">
              <p className="mlab-section-title">Trajectory (library)</p>
              <pre className="mlab-out">{output}</pre>
            </article>
          </div>
        </>
      )}

      <p className="mlab-foot">
        Chat: <code>accelerate</code> · <code>apply sleep-recovery</code> ·{" "}
        <code>apply optimize-week</code> · <code>list metrics</code>
      </p>
    </div>
  );
}
