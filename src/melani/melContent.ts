/**
 * Content / YouTube performance backbone.
 * Log videos, views, and second-level research notes.
 * Models run behind Mel — you talk outcomes, not textbook math UI.
 */
import { todayKey } from "./data";

const KEY = "wonder-mel-content-v1";

export type RetentionPoint = {
  /** second into the video (0-based) */
  sec: number;
  /** 0–100 estimated % still watching, or absolute viewers if known */
  value: number;
  note?: string;
};

export type ViewSnapshot = { t: string; views: number };

export type ContentVideo = {
  id: string;
  title: string;
  platform: "youtube" | "short" | "other";
  url?: string;
  publishedAt?: string;
  /** lifetime or snapshot views */
  views: number;
  /** views over time for charts */
  viewHistory: ViewSnapshot[];
  likes?: number;
  comments?: number;
  avgViewDurationSec?: number;
  durationSec?: number;
  /** sparse second-by-second research (you fill as you study the graph) */
  retention: RetentionPoint[];
  /** free research notes boiled to basics */
  findings: string[];
  /** what to try next */
  nextTests: string[];
  createdAt: string;
  updatedAt: string;
};

type Store = {
  videos: ContentVideo[];
  channelGoal: string;
  updatedAt: string;
};

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return {
        videos: [],
        channelGoal: "Best operator-style YouTube in the world — research every second.",
        updatedAt: new Date().toISOString(),
      };
    }
    const p = JSON.parse(raw) as Store;
    const videos = (Array.isArray(p.videos) ? p.videos : []).map((v) => ({
      ...v,
      viewHistory: Array.isArray(v.viewHistory) ? v.viewHistory : [],
      retention: Array.isArray(v.retention) ? v.retention : [],
      findings: Array.isArray(v.findings) ? v.findings : [],
      nextTests: Array.isArray(v.nextTests) ? v.nextTests : [],
    }));
    return {
      videos,
      channelGoal: p.channelGoal || "Best YouTube research system",
      updatedAt: p.updatedAt || new Date().toISOString(),
    };
  } catch {
    return {
      videos: [],
      channelGoal: "Best YouTube research system",
      updatedAt: new Date().toISOString(),
    };
  }
}

function save(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || `vid-${Date.now().toString(36)}`
  );
}

export function listVideos(): ContentVideo[] {
  return load().videos.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getVideo(q: string): ContentVideo | null {
  const needle = q.trim().toLowerCase();
  if (!needle) return null;
  const all = listVideos();
  return (
    all.find((v) => v.id === needle) ||
    all.find((v) => v.title.toLowerCase() === needle) ||
    all.find((v) => v.title.toLowerCase().includes(needle)) ||
    null
  );
}

export function upsertVideo(input: {
  title: string;
  views?: number;
  url?: string;
  platform?: ContentVideo["platform"];
  durationSec?: number;
}): ContentVideo {
  const store = load();
  const title = input.title.trim();
  let v = store.videos.find(
    (x) => x.title.toLowerCase() === title.toLowerCase() || x.id === slug(title)
  );
  const now = new Date().toISOString();
  if (!v) {
    v = {
      id: slug(title),
      title,
      platform: input.platform || "youtube",
      url: input.url,
      views: Number(input.views) || 0,
      viewHistory:
        input.views != null && Number.isFinite(Number(input.views))
          ? [{ t: todayKey(), views: Number(input.views) }]
          : [],
      durationSec: input.durationSec,
      retention: [],
      findings: [],
      nextTests: [],
      createdAt: now,
      updatedAt: now,
      publishedAt: todayKey(),
    };
    store.videos.unshift(v);
  } else {
    if (input.views != null && Number.isFinite(Number(input.views))) {
      const nextViews = Number(input.views);
      v.views = nextViews;
      if (!Array.isArray(v.viewHistory)) v.viewHistory = [];
      const day = todayKey();
      const last = v.viewHistory[v.viewHistory.length - 1];
      if (last && last.t === day) last.views = nextViews;
      else v.viewHistory.push({ t: day, views: nextViews });
      v.viewHistory = v.viewHistory.slice(-90);
    }
    if (input.url) v.url = input.url;
    if (input.durationSec != null) v.durationSec = input.durationSec;
    if (input.platform) v.platform = input.platform;
    v.updatedAt = now;
  }
  store.videos = store.videos.slice(0, 200);
  store.updatedAt = now;
  save(store);
  return v;
}

export function logViews(titleOrId: string, views: number): ContentVideo {
  const existing = getVideo(titleOrId);
  return upsertVideo({
    title: existing?.title || titleOrId,
    views,
    url: existing?.url,
    platform: existing?.platform,
    durationSec: existing?.durationSec,
  });
}

export function addRetentionPoint(
  titleOrId: string,
  sec: number,
  value: number,
  note?: string
): ContentVideo {
  const store = load();
  let v = store.videos.find(
    (x) =>
      x.id === titleOrId ||
      x.title.toLowerCase() === titleOrId.toLowerCase() ||
      x.title.toLowerCase().includes(titleOrId.toLowerCase())
  );
  if (!v) {
    v = upsertVideo({ title: titleOrId, views: 0 });
    return addRetentionPoint(v.id, sec, value, note);
  }
  v.retention = v.retention.filter((p) => p.sec !== sec);
  v.retention.push({ sec, value, note });
  v.retention.sort((a, b) => a.sec - b.sec);
  v.updatedAt = new Date().toISOString();
  store.updatedAt = v.updatedAt;
  save(store);
  return v;
}

export function addFinding(titleOrId: string, finding: string): ContentVideo {
  const store = load();
  const v = getVideo(titleOrId);
  if (!v) throw new Error(`No video matches “${titleOrId}”. Log it first: video My Title views 1200`);
  const full = store.videos.find((x) => x.id === v.id)!;
  full.findings = [...full.findings, finding.trim()].filter(Boolean).slice(-40);
  full.updatedAt = new Date().toISOString();
  store.updatedAt = full.updatedAt;
  save(store);
  return full;
}

export function addNextTest(titleOrId: string, test: string): ContentVideo {
  const store = load();
  const v = getVideo(titleOrId);
  if (!v) throw new Error(`No video matches “${titleOrId}”.`);
  const full = store.videos.find((x) => x.id === v.id)!;
  full.nextTests = [...full.nextTests, test.trim()].filter(Boolean).slice(-20);
  full.updatedAt = new Date().toISOString();
  store.updatedAt = full.updatedAt;
  save(store);
  return full;
}

/** Boil retention to basics: biggest drop seconds + early hook strength */
export function analyzeVideo(titleOrId: string): string {
  const v = getVideo(titleOrId);
  if (!v) {
    return [
      `No video “${titleOrId}”.`,
      "Log: video <title> views <n>",
      "Then: retention <title> at 12s 62  (meaning 62% still there at 12s)",
      "finding <title>: hook too slow",
    ].join("\n");
  }

  const ret = v.retention;
  let biggestDrop: { from: number; to: number; drop: number } | null = null;
  for (let i = 1; i < ret.length; i++) {
    const drop = ret[i - 1]!.value - ret[i]!.value;
    if (!biggestDrop || drop > biggestDrop.drop) {
      biggestDrop = {
        from: ret[i - 1]!.sec,
        to: ret[i]!.sec,
        drop,
      };
    }
  }

  const early = ret.filter((p) => p.sec <= 30);
  const earlyAvg =
    early.length > 0
      ? early.reduce((s, p) => s + p.value, 0) / early.length
      : null;

  // crude geometric “views next” if we had growth — just rank advice
  const views = v.views;
  const lines = [
    `VIDEO · ${v.title}`,
    `Views ${views.toLocaleString()}${v.likes != null ? ` · likes ${v.likes}` : ""}`,
    v.durationSec ? `Duration ${v.durationSec}s` : null,
    v.url || null,
    "",
    "— Boiled down —",
    ret.length === 0
      ? "No second-level data yet. Open analytics retention graph and log key seconds:"
      : `${ret.length} retention anchors logged.`,
    ret.length === 0
      ? "  retention " + v.title + " at 0s 100"
      : null,
    ret.length === 0 ? "  retention " + v.title + " at 15s 55" : null,
    ret.length === 0 ? "  retention " + v.title + " at 30s 40" : null,
    earlyAvg != null ? `First 30s average hold ≈ ${earlyAvg.toFixed(1)}` : null,
    biggestDrop
      ? `Biggest drop: ${biggestDrop.from}s → ${biggestDrop.to}s (Δ ${biggestDrop.drop.toFixed(1)}) — rewatch that cut.`
      : null,
    "",
    "Findings:",
    ...(v.findings.length ? v.findings.map((f) => `• ${f}`) : ["• (none yet)"]),
    "",
    "Next tests:",
    ...(v.nextTests.length ? v.nextTests.map((t) => `• ${t}`) : ["• (none yet — add with: test " + v.title + ": faster hook)"]),
    "",
    "Algorithm spine (backbone):",
    "1. Hook (0–3s) — face/conflict/promise clear",
    "2. Pattern interrupt before biggest drop second",
    "3. One idea per minute — boil complexity",
    "4. End screen: one next video, not three",
    "5. Log every upload’s views + 3 retention points minimum",
  ].filter((x) => x != null) as string[];

  return lines.join("\n");
}

export function formatContentBrief(): string {
  const vids = listVideos();
  const store = load();
  if (!vids.length) {
    return [
      "Content lab (YouTube backbone) — empty.",
      "Goal: " + store.channelGoal,
      "",
      "Start:",
      "  video My First Upload views 840",
      "  retention My First Upload at 8s 71",
      "  finding My First Upload: title curiosity gap worked",
      "  analyze My First Upload",
      "  videos",
    ].join("\n");
  }
  const top = [...vids].sort((a, b) => b.views - a.views).slice(0, 5);
  return [
    `Content lab · ${vids.length} videos · goal: ${store.channelGoal}`,
    "Top by views:",
    ...top.map(
      (v, i) =>
        `${i + 1}. ${v.title} — ${v.views.toLocaleString()} views · ${v.retention.length} sec-points · ${v.findings.length} findings`
    ),
    "",
    "analyze <title> · video <title> views <n> · retention <title> at <sec> <%>",
  ].join("\n");
}


export type ChannelStats = {
  videoCount: number;
  totalViews: number;
  avgViews: number;
  retentionAnchors: number;
  findings: number;
  tests: number;
  /** 0–100 research density: anchors + findings per video */
  researchScore: number;
  topVideo: ContentVideo | null;
};

export function computeChannelStats(): ChannelStats {
  const videos = listVideos();
  const totalViews = videos.reduce((s, v) => s + (Number(v.views) || 0), 0);
  const retentionAnchors = videos.reduce((s, v) => s + (v.retention?.length || 0), 0);
  const findings = videos.reduce((s, v) => s + (v.findings?.length || 0), 0);
  const tests = videos.reduce((s, v) => s + (v.nextTests?.length || 0), 0);
  const n = videos.length || 1;
  const density = (retentionAnchors + findings * 2 + tests) / n;
  const researchScore = Math.max(0, Math.min(100, Math.round(density * 12)));
  const topVideo = [...videos].sort((a, b) => b.views - a.views)[0] || null;
  return {
    videoCount: videos.length,
    totalViews,
    avgViews: videos.length ? Math.round(totalViews / videos.length) : 0,
    retentionAnchors,
    findings,
    tests,
    researchScore,
    topVideo,
  };
}

export function setChannelGoal(goal: string): void {
  const store = load();
  store.channelGoal = goal.trim().slice(0, 240);
  store.updatedAt = new Date().toISOString();
  save(store);
}

export function getChannelGoal(): string {
  return load().channelGoal;
}

export function deleteVideo(id: string): boolean {
  const store = load();
  const before = store.videos.length;
  store.videos = store.videos.filter((v) => v.id !== id);
  if (store.videos.length === before) return false;
  store.updatedAt = new Date().toISOString();
  save(store);
  return true;
}

/** Aggregate view history across channel for a simple time series */
export function channelViewsSeries(): { day: string; views: number }[] {
  const map = new Map<string, number>();
  for (const v of listVideos()) {
    for (const h of v.viewHistory || []) {
      map.set(h.t, (map.get(h.t) || 0) + h.views);
    }
    // fallback: published day current views
    if ((!v.viewHistory || !v.viewHistory.length) && v.publishedAt && v.views) {
      map.set(v.publishedAt, (map.get(v.publishedAt) || 0) + v.views);
    }
  }
  return [...map.entries()]
    .map(([day, views]) => ({ day, views }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/** Mel natural language for content */
export function tryContentCommand(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;

  if (/^(?:videos|content|youtube|channel|content\s+lab)$/i.test(t)) {
    return formatContentBrief();
  }

  // video Title views 1234
  const vid = t.match(
    /^video\s+(.+?)\s+views?\s+(\d[\d,]*)\s*$/i
  );
  if (vid?.[1] && vid[2]) {
    const views = Number(vid[2].replace(/,/g, ""));
    const v = logViews(vid[1].trim(), views);
    return `Logged “${v.title}” · ${v.views.toLocaleString()} views. Next: retention ${v.title} at 15s 60`;
  }

  // video Title (create)
  const vidOnly = t.match(/^video\s+(.+)$/i);
  if (vidOnly?.[1] && !/\bviews?\b/i.test(vidOnly[1])) {
    const v = upsertVideo({ title: vidOnly[1].trim() });
    return `Video “${v.title}” ready. Add views: video ${v.title} views 1000`;
  }

  // retention Title at 12s 62
  const ret = t.match(
    /^retention\s+(.+?)\s+at\s+(\d+)\s*s(?:ec(?:onds?)?)?\s+(\d+(?:\.\d+)?)\s*%?\s*(?:—\s*(.+))?$/i
  ) || t.match(
    /^retention\s+(.+?)\s+(\d+)\s*s\s+(\d+(?:\.\d+)?)\s*%?\s*$/i
  );
  if (ret?.[1] && ret[2] != null && ret[3] != null) {
    const v = addRetentionPoint(
      ret[1].trim(),
      Number(ret[2]),
      Number(ret[3]),
      ret[4]?.trim()
    );
    return `Retention ${ret[2]}s → ${ret[3]} on “${v.title}” (${v.retention.length} anchors). analyze ${v.title}`;
  }

  // finding Title: text
  const find = t.match(/^finding\s+(.+?)\s*[:：]\s*(.+)$/i);
  if (find?.[1] && find[2]) {
    try {
      const v = addFinding(find[1].trim(), find[2].trim());
      return `Finding on “${v.title}”: ${find[2].trim()}`;
    } catch (e) {
      return e instanceof Error ? e.message : "Could not add finding.";
    }
  }

  // test Title: text
  const test = t.match(/^(?:test|next\s+test)\s+(.+?)\s*[:：]\s*(.+)$/i);
  if (test?.[1] && test[2]) {
    try {
      const v = addNextTest(test[1].trim(), test[2].trim());
      return `Next test on “${v.title}”: ${test[2].trim()}`;
    } catch (e) {
      return e instanceof Error ? e.message : "Could not add test.";
    }
  }

  // analyze Title
  const an = t.match(/^(?:analyze|breakdown|research)\s+(?:video\s+)?(.+)$/i);
  if (an?.[1] && !/^(?:my\s+)?(?:wardrobe|sleep|metrics)/i.test(an[1])) {
    // avoid stealing other analyze commands when too generic
    if (getVideo(an[1]) || listVideos().length > 0) {
      return analyzeVideo(an[1].trim());
    }
  }

  if (/^(?:youtube\s+plan|content\s+plan|channel\s+plan)$/i.test(t)) {
    return [
      "YouTube backbone plan (operator, not vibes):",
      "1. Every upload: video <title> views <n> within 24h and day 7.",
      "2. Every upload: ≥3 retention anchors (0s, first cliff, mid).",
      "3. One finding + one next test per video.",
      "4. Weekly: videos — kill formats with dead hooks; double what holds past 30s.",
      "5. Goal is research density per second — money follows distribution you earn.",
      "",
      formatContentBrief(),
    ].join("\n");
  }

  return null;
}
