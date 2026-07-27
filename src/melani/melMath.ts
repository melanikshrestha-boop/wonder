/**
 * Mel + Math Empire progress — multi-track crude curriculum.
 */
import { formatCrudeRun, listCrudeModels } from "./crudeMath";
import {
  EMPIRE_LESSONS,
  MATH_TRACKS,
  empireCatalog,
  findEmpireLesson,
  lessonsForTrack,
  runEmpireLesson,
  type MathTrackId,
} from "./crudeMathEmpire";

const PROGRESS_KEY = "wonder-math-empire-v1";

type Progress = {
  track: MathTrackId;
  /** lesson ids completed */
  completed: string[];
  /** per-track index */
  cursor: Partial<Record<MathTrackId, number>>;
  updatedAt: string;
};

function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) {
      return {
        track: "foundations",
        completed: [],
        cursor: {},
        updatedAt: new Date().toISOString(),
      };
    }
    const p = JSON.parse(raw) as Progress;
    return {
      track: p.track || "foundations",
      completed: Array.isArray(p.completed) ? p.completed : [],
      cursor: p.cursor || {},
      updatedAt: p.updatedAt || new Date().toISOString(),
    };
  } catch {
    return {
      track: "foundations",
      completed: [],
      cursor: {},
      updatedAt: new Date().toISOString(),
    };
  }
}

function saveProgress(p: Progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

function markDone(id: string, track: MathTrackId) {
  const p = loadProgress();
  if (!p.completed.includes(id)) p.completed.push(id);
  const list = lessonsForTrack(track);
  const idx = list.findIndex((l) => l.id === id);
  if (idx >= 0) {
    p.cursor[track] = Math.min(list.length - 1, idx + 1);
  }
  p.track = track;
  p.updatedAt = new Date().toISOString();
  saveProgress(p);
}

export function getMathProgress(): Progress & {
  pct: number;
  trackName: string;
  nextId: string | null;
} {
  const p = loadProgress();
  const list = lessonsForTrack(p.track);
  const cur = p.cursor[p.track] ?? 0;
  const next = list[cur] || list[0] || null;
  const trackMeta = MATH_TRACKS.find((t) => t.id === p.track);
  return {
    ...p,
    pct: Math.round((p.completed.length / Math.max(1, EMPIRE_LESSONS.length)) * 100),
    trackName: trackMeta?.name || p.track,
    nextId: next?.id ?? null,
  };
}

export function setMathTrack(track: MathTrackId): string {
  const p = loadProgress();
  p.track = track;
  p.updatedAt = new Date().toISOString();
  saveProgress(p);
  const list = lessonsForTrack(track);
  return [
    `Track → ${MATH_TRACKS.find((t) => t.id === track)?.name || track}`,
    `${list.length} lessons: ${list.map((l) => l.id).join(", ")}`,
    "Say: math next",
  ].join("\n");
}

export function runMathLesson(idOrNext: string): string {
  const key = idOrNext.trim().toLowerCase();

  if (!key || key === "list" || key === "help" || key === "curriculum" || key === "empire") {
    const p = getMathProgress();
    return [
      empireCatalog(),
      "",
      `Progress: ${p.completed.length}/${EMPIRE_LESSONS.length} (${p.pct}%)`,
      `Active track: ${p.trackName} · next: ${p.nextId || "—"}`,
      "math next · math track calculus · math grad · think big",
    ].join("\n");
  }

  if (key === "status" || key === "progress") {
    const p = getMathProgress();
    return [
      `Math empire progress`,
      `${p.completed.length}/${EMPIRE_LESSONS.length} lessons (${p.pct}%)`,
      `Track: ${p.trackName}`,
      `Next: ${p.nextId}`,
      p.completed.length
        ? `Done: ${p.completed.slice(-8).join(", ")}`
        : "Done: none yet",
    ].join("\n");
  }

  if (key.startsWith("track ")) {
    const t = key.slice(6).trim() as MathTrackId;
    if (!MATH_TRACKS.some((x) => x.id === t)) {
      return `Tracks: ${MATH_TRACKS.map((x) => x.id).join(", ")}`;
    }
    return setMathTrack(t);
  }

  if (key === "next" || key === "lesson") {
    const p = loadProgress();
    const list = lessonsForTrack(p.track);
    const cur = p.cursor[p.track] ?? 0;
    const L = list[cur] || list[0];
    if (!L) return "Track empty.";
    const run = L.run();
    markDone(L.id, p.track);
    return (
      formatCrudeRun(run) +
      `\n\nTrack ${p.track} · completed ${L.id} · next → ${getMathProgress().nextId}`
    );
  }

  if (key === "reset") {
    saveProgress({
      track: "foundations",
      completed: [],
      cursor: {},
      updatedAt: new Date().toISOString(),
    });
    return "Math empire reset. Say: math next  or  think big";
  }

  // think big = full manifesto + start foundations
  if (key === "thinkbig" || key === "think-big" || key === "all") {
    setMathTrack("foundations");
    const run = runEmpireLesson("linear");
    if (run) markDone("linear", "foundations");
    return [
      "THINK BIG — you learn math by running crude models that scale to empire systems.",
      "Tracks: foundations → calculus → linalg → probability → algorithms → systems → mlcore",
      "Same muscle: discrete update loops. Later: agents, markets, body forecasts.",
      "",
      run ? formatCrudeRun(run) : empireCatalog(),
      "",
      "Continue: math next",
    ].join("\n");
  }

  const lesson = findEmpireLesson(key);
  if (lesson) {
    const run = lesson.run();
    markDone(lesson.id, lesson.track);
    return formatCrudeRun(run);
  }

  // legacy aliases
  const aliases: Record<string, string> = {
    gradient: "grad",
    moving: "ma",
    gcd: "euclid",
    vector: "vec2",
    matrix: "matvec",
  };
  const mapped = aliases[key];
  if (mapped) return runMathLesson(mapped);

  const run = runEmpireLesson(key);
  if (run) {
    markDone(run.modelId, "foundations");
    return formatCrudeRun(run);
  }

  return `Unknown “${key}”.\n\n${empireCatalog()}`;
}

export function tryMathCommand(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;

  if (/^(?:think\s*big|build\s+all|math\s+empire)$/i.test(t)) {
    return runMathLesson("thinkbig");
  }
  if (/^(?:math|crude\s+math|learn\s+math|math\s+lab)(?:\s+lab)?$/i.test(t)) {
    return runMathLesson("list");
  }
  if (/^math\s+next$/i.test(t) || /^next\s+math/i.test(t)) {
    return runMathLesson("next");
  }
  if (/^math\s+reset$/i.test(t)) return runMathLesson("reset");
  if (/^math\s+status$/i.test(t)) return runMathLesson("status");
  if (/^math\s+track\s+\w+/i.test(t)) {
    return runMathLesson(t.replace(/^math\s+/i, ""));
  }

  const m = t.match(
    /^math\s+([a-z][a-z0-9_-]*)\b/i
  );
  if (m) return runMathLesson(m[1]!);

  if (/crude\s+math|mathematical\s+model|learn\s+(?:the\s+)?math|math\s+empire/i.test(t)) {
    const hit = EMPIRE_LESSONS.find((c) => new RegExp(`\\b${c.id}\\b`, "i").test(t));
    if (hit) return runMathLesson(hit.id);
    if (/gradient|descent/i.test(t)) return runMathLesson("grad");
    if (/think\s*big/i.test(t)) return runMathLesson("thinkbig");
    return runMathLesson("list");
  }
  return null;
}

// re-export for UI
export { EMPIRE_LESSONS, MATH_TRACKS, empireCatalog, lessonsForTrack };
export type { MathTrackId };
