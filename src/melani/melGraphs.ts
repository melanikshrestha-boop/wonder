/**
 * Concrete Mel graphs — life OS loops she can actually run.
 * You set direction and final yes; the graph carries the middle.
 */
import {
  type AgentGraph,
  type GraphNodeResult,
  runParallel,
  startGraph,
  decideGraphGate,
  advanceGraph,
  latestGraphRun,
  getGraphRun,
  listGraphRuns,
  formatRun,
} from "./core/agentGraph";
import { buildOperatingBrain } from "./operatingBrain";
import { buildIntelligenceDigest } from "./intelligenceL3";
import { loadWhoopStore } from "./whoopStore";
import { loadSleepDay } from "./sleepStore";
import { todayKey } from "./data";
import { loadFinance } from "./financeStore";
import { isTransferLike } from "./financeTransfers";
import { writeTonightBrief } from "./bodyBrief";
import { fetchMacScreenTime } from "./screenTimeStore";
import { buildWhoopAnalytics } from "./whoopAnalytics";

function ok(summary: string, data?: unknown): GraphNodeResult {
  return { ok: true, status: "ok", summary, data };
}
function fail(summary: string, data?: unknown): GraphNodeResult {
  return { ok: false, status: "fail", summary, data };
}
function empty(summary: string, data?: unknown): GraphNodeResult {
  return { ok: true, status: "empty", summary, data };
}

// ── Graph: night body loop ───────────────────────────────────────

export const GRAPH_BODY_NIGHT: AgentGraph = {
  id: "body_night",
  name: "Night body loop",
  description:
    "Parallel read of body signals → draft brief → you approve before it sticks.",
  entry: "gather",
  nodes: {
    gather: {
      id: "gather",
      label: "Gather body signals (parallel)",
      retries: 1,
      run: async (ctx) => {
        const day = (ctx.bag.day as string) || todayKey();
        const parallel = await runParallel([
          {
            id: "whoop",
            run: () => {
              const s = loadWhoopStore();
              const n = Object.keys(s.days).length;
              const d = s.days[day];
              return n
                ? ok(`WHOOP days=${n}`, {
                    whoopN: n,
                    recovery: d?.recoveryPct ?? null,
                    deep: d?.sleep?.deepMin ?? null,
                    hrv: d?.hrvMs ?? null,
                  })
                : empty("No WHOOP import yet");
            },
          },
          {
            id: "sleep",
            run: () => {
              const s = loadSleepDay(day);
              const h = s.hours;
              return h != null && Number.isFinite(h)
                ? ok(`Sleep log ${h}h`, { sleepH: h })
                : empty("No sleep hours logged today");
            },
          },
          {
            id: "water",
            run: () => {
              try {
                const ml = Number(
                  localStorage.getItem(`dr-melani-water-ml:${day}`)
                );
                return Number.isFinite(ml) && ml > 0
                  ? ok(`Water ${Math.round(ml)} ml`, { waterMl: ml })
                  : empty("No water logged today");
              } catch {
                return empty("Water read failed");
              }
            },
          },
          {
            id: "brain",
            run: () => {
              const b = buildOperatingBrain();
              return ok(b.topMove.slice(0, 120), {
                topMove: b.topMove,
                readiness: b.buildReadiness,
              });
            },
          },
        ]);
        const fails = Object.values(parallel).filter((r) => !r.ok).length;
        return ok(`Gathered ${Object.keys(parallel).length} lanes (${fails} hard fails)`, {
          parallel,
          day,
        });
      },
      next: () => "models",
    },
    models: {
      id: "models",
      label: "Deep sleep snapshot",
      run: () => {
        // No regression / Q-learning — raw history only
        const s = buildWhoopAnalytics();
        const deep = s.byKey.deep;
        if (!deep || !deep.points.length) {
          return empty("Import Whoop sleeps CSV for deep sleep history");
        }
        return ok(
          `Deep sleep latest ${deep.latest ?? "—"} min · n=${deep.points.length}`,
          { deepLatest: deep.latest ?? null, n: deep.points.length },
        );
      },
      next: () => "draft_brief",
    },
    draft_brief: {
      id: "draft_brief",
      label: "Draft body brief (preview only)",
      run: (ctx) => {
        const p = ctx.bag.parallel as
          | Record<string, GraphNodeResult>
          | undefined;
        const lines = [
          "— Night loop draft —",
          `Day: ${ctx.bag.day || todayKey()}`,
          ctx.bag.topMove ? `Top move: ${ctx.bag.topMove}` : null,
          ctx.bag.deepLatest != null ? `Deep latest: ${ctx.bag.deepLatest} min` : null,
          p?.water?.summary ? `Water: ${p.water.summary}` : null,
          p?.sleep?.summary ? `Sleep: ${p.sleep.summary}` : null,
          p?.whoop?.summary ? `WHOOP: ${p.whoop.summary}` : null,
          "",
          "Approve to write the real body brief to storage.",
        ].filter(Boolean);
        return ok("Draft ready for your yes", { draft: lines.join("\n") });
      },
      next: () => "gate_write",
    },
    gate_write: {
      id: "gate_write",
      label: "Write body brief to disk",
      humanGate: true,
      run: () => {
        try {
          const brief = writeTonightBrief();
          return ok(`Wrote body brief for ${brief.day}`, { briefDay: brief.day });
        } catch (e) {
          return fail(e instanceof Error ? e.message : "brief write failed");
        }
      },
      next: (ctx, r) => (r.ok ? "done_note" : "__fail__"),
    },
    done_note: {
      id: "done_note",
      label: "Close loop",
      run: (ctx) =>
        ok("Night loop complete", {
          final: true,
          draft: ctx.bag.draft,
        }),
      next: () => null,
    },
  },
};

// ── Graph: focus / screen loop ───────────────────────────────────

export const GRAPH_FOCUS_SYNC: AgentGraph = {
  id: "focus_sync",
  name: "Focus sync loop",
  description: "Sync Mac screen time → heavy apps → you decide what to cut.",
  entry: "sync",
  nodes: {
    sync: {
      id: "sync",
      label: "Sync Mac screen time",
      retries: 1,
      run: async () => {
        try {
          const data = await fetchMacScreenTime(7);
          const apps = (data.apps_all || [])
            .filter((a) => a.seconds >= 3600)
            .sort((a, b) => b.seconds - a.seconds)
            .slice(0, 8);
          return ok(`Synced · ${apps.length} apps ≥1h`, {
            apps: apps.map((a) => ({
              name: a.name,
              hours: Math.round((a.seconds / 3600) * 10) / 10,
            })),
            free: data.disk?.free_human ?? null,
          });
        } catch (e) {
          return fail(e instanceof Error ? e.message : "sync failed");
        }
      },
      next: (_c, r) => (r.ok ? "rank" : "__fail__"),
    },
    rank: {
      id: "rank",
      label: "Rank heavy apps",
      run: (ctx) => {
        const apps = (ctx.bag.apps as { name: string; hours: number }[]) || [];
        if (!apps.length) return empty("No apps over 1h in range");
        const top = apps[0];
        return ok(
          `Heaviest: ${top?.name} (${top?.hours}h)`,
          { heaviest: top, apps }
        );
      },
      next: () => "gate_focus",
    },
    gate_focus: {
      id: "gate_focus",
      label: "Commit focus note (you pick)",
      humanGate: true,
      run: (ctx) => {
        const h = ctx.bag.heaviest as { name: string; hours: number } | undefined;
        const note = h
          ? `Focus rule: watch ${h.name} (${h.hours}h). Free disk ${ctx.bag.free ?? "—"}.`
          : "Focus rule: keep phone log + Mac sync weekly.";
        try {
          localStorage.setItem(
            "wonder-focus-last-rule-v1",
            JSON.stringify({ at: new Date().toISOString(), note })
          );
        } catch {
          /* ignore */
        }
        return ok(note, { focusNote: note });
      },
      next: () => null,
    },
  },
};

// ── Graph: weekly compound ───────────────────────────────────────

export const GRAPH_WEEKLY: AgentGraph = {
  id: "weekly_os",
  name: "Weekly OS loop",
  description: "L3 digest + operating brain + money skim → your priority yes.",
  entry: "parallel_intel",
  nodes: {
    parallel_intel: {
      id: "parallel_intel",
      label: "Intelligence + money (parallel)",
      run: async () => {
        const parallel = await runParallel([
          {
            id: "l3",
            run: () => {
              const d = buildIntelligenceDigest();
              return ok(d.priority.slice(0, 140), {
                priority: d.priority,
                week: `${d.weekStart}→${d.weekEnd}`,
              });
            },
          },
          {
            id: "brain",
            run: () => {
              const b = buildOperatingBrain();
              return ok(b.topMove.slice(0, 140), {
                topMove: b.topMove,
                readiness: b.buildReadiness,
              });
            },
          },
          {
            id: "money",
            run: () => {
              try {
                const fin = loadFinance();
                let out = 0;
                let n = 0;
                for (const tx of fin.transactions || []) {
                  if (!tx?.amount || isTransferLike(tx)) continue;
                  const a = Number(tx.amount);
                  if (a < 0) {
                    out += Math.abs(a);
                    n += 1;
                  }
                }
                return ok(
                  n ? `Outflows tallied n=${n}` : "No ledger outflows",
                  { spendAbs: out, txN: n }
                );
              } catch {
                return empty("Finance unavailable");
              }
            },
          },
        ]);
        return ok("Intel pack ready", { parallel });
      },
      next: () => "gate_priority",
    },
    gate_priority: {
      id: "gate_priority",
      label: "Lock this week’s priority",
      humanGate: true,
      run: (ctx) => {
        const p = ctx.bag.parallel as Record<string, GraphNodeResult> | undefined;
        const priority =
          (p?.l3?.data as { priority?: string } | undefined)?.priority ||
          (ctx.bag.priority as string) ||
          "Ship one real system this week.";
        try {
          localStorage.setItem(
            "wonder-week-priority-v1",
            JSON.stringify({ at: new Date().toISOString(), priority })
          );
        } catch {
          /* ignore */
        }
        return ok(`Locked: ${priority.slice(0, 160)}`, { lockedPriority: priority });
      },
      next: () => null,
    },
  },
};

/** Math empire lesson loop — run next crude model, you decide continue */
export const GRAPH_MATH_LESSON: AgentGraph = {
  id: "math_lesson",
  name: "Math lesson loop",
  description: "Load next crude model → show trajectory → you approve to mark done & advance.",
  entry: "load",
  nodes: {
    load: {
      id: "load",
      label: "Load next math lesson",
      run: async () => {
        const { getMathProgress, runMathLesson } = await import("./melMath");
        const p = getMathProgress();
        const text = runMathLesson(p.nextId || "linear");
        return {
          ok: true,
          status: "ok" as const,
          summary: `Lesson ${p.nextId || "linear"} (${p.pct}%)`,
          data: { lessonText: text.slice(0, 2000), nextId: p.nextId },
        };
      },
      next: () => "gate_continue",
    },
    gate_continue: {
      id: "gate_continue",
      label: "Advance curriculum (your yes)",
      humanGate: true,
      run: async (ctx) => {
        const text = String(ctx.bag.lessonText || "").slice(0, 400);
        return {
          ok: true,
          status: "ok" as const,
          summary: "Marked progress — say math next or approve again later",
          data: { preview: text },
        };
      },
      next: () => null,
    },
  },
};

export const MEL_GRAPHS: Record<string, AgentGraph> = {
  body_night: GRAPH_BODY_NIGHT,
  focus_sync: GRAPH_FOCUS_SYNC,
  weekly_os: GRAPH_WEEKLY,
  math_lesson: GRAPH_MATH_LESSON,
};

export function listMelGraphs(): string {
  return [
    "Mel loops (graph engineering — you keep direction + last yes)",
    "",
    ...Object.values(MEL_GRAPHS).map(
      (g) => `• ${g.id} — ${g.name}\n  ${g.description}`
    ),
    "",
    "Start: run loop body_night · run loop focus_sync · run loop weekly_os",
    "While running: loop status · approve loop · reject loop",
  ].join("\n");
}

export async function startMelGraph(
  graphId: string,
  bag?: Record<string, unknown>
): Promise<string> {
  const g = MEL_GRAPHS[graphId];
  if (!g) {
    return `Unknown loop “${graphId}”.\n\n${listMelGraphs()}`;
  }
  const run = await startGraph(g, bag || { day: todayKey() });
  return formatRun(run, g.name);
}

export async function approveMelGraph(runId?: string): Promise<string> {
  const run = runId ? getGraphRun(runId) : latestGraphRun();
  if (!run) return "No loop run found. Say: run loop body_night";
  const g = MEL_GRAPHS[run.graphId];
  if (!g) return `Graph ${run.graphId} missing.`;
  const next = await decideGraphGate(g, run.runId, "yes");
  return formatRun(next, g.name);
}

export async function rejectMelGraph(runId?: string): Promise<string> {
  const run = runId ? getGraphRun(runId) : latestGraphRun();
  if (!run) return "No loop run found.";
  const g = MEL_GRAPHS[run.graphId];
  if (!g) return `Graph ${run.graphId} missing.`;
  const next = await decideGraphGate(g, run.runId, "no");
  return formatRun(next, g.name);
}

export function melGraphStatus(): string {
  const run = latestGraphRun();
  if (!run) return listMelGraphs();
  const g = MEL_GRAPHS[run.graphId];
  const lines = [formatRun(run, g?.name), ""];
  const recent = listGraphRuns().slice(0, 3);
  if (recent.length > 1) {
    lines.push("Recent runs:");
    for (const r of recent) {
      lines.push(`  ${r.graphId} · ${r.status} · ${r.runId}`);
    }
  }
  return lines.join("\n");
}

export async function resumeMelGraph(): Promise<string> {
  const run = latestGraphRun();
  if (!run) return "No loop to resume.";
  const g = MEL_GRAPHS[run.graphId];
  if (!g) return "Graph missing.";
  if (run.status === "waiting_human") {
    return formatRun(run, g.name);
  }
  if (run.status === "running") {
    const next = await advanceGraph(g, run.runId);
    return formatRun(next, g.name);
  }
  return formatRun(run, g.name);
}
