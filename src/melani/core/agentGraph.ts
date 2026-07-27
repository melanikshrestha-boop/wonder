/**
 * Agent loop + graph runtime for Mel.
 *
 * Philosophy (not autonomy cosplay):
 * - Graph = steps where each output decides the next edge
 * - Loop = keep going without Melani hand-carrying every hop
 * - She keeps direction + final yes; system carries between steps
 * - Agentic ≠ autonomous: destructive / external steps gate on her
 *
 * Local-only, persisted runs, retries, parallel fan-out, human gates.
 */
import { offlineGetJson, offlineSetJson } from "./offlineStore";
import { wonderEmit } from "./eventBus";

export type GraphNodeId = string;

export type GraphNodeResult = {
  ok: boolean;
  /** Machine status for routing */
  status: "ok" | "fail" | "skip" | "needs_human" | "empty";
  summary: string;
  data?: unknown;
};

export type GraphCtx = {
  runId: string;
  graphId: string;
  /** Accumulated bag every node can read/write */
  bag: Record<string, unknown>;
  /** Last node result */
  last?: GraphNodeResult;
  history: { nodeId: GraphNodeId; result: GraphNodeResult; at: string }[];
  /** Human decisions keyed by gate id */
  human: Record<string, "yes" | "no" | "pending">;
};

export type GraphNode = {
  id: GraphNodeId;
  label: string;
  /** Run the step. Throw only for bugs; use ok:false for soft fail. */
  run: (ctx: GraphCtx) => GraphNodeResult | Promise<GraphNodeResult>;
  /** Max retries on fail (default 0) */
  retries?: number;
  /** If true, loop pauses here until human says yes/no */
  humanGate?: boolean;
  /**
   * Next edge: pick next node id from result + bag.
   * Return null to end the run successfully.
   * Return "__fail__" to end as failed.
   */
  next?: (ctx: GraphCtx, result: GraphNodeResult) => GraphNodeId | null | "__fail__";
};

export type AgentGraph = {
  id: string;
  name: string;
  description: string;
  entry: GraphNodeId;
  nodes: Record<GraphNodeId, GraphNode>;
};

export type GraphRunState = {
  runId: string;
  graphId: string;
  status: "running" | "waiting_human" | "done" | "failed";
  cursor: GraphNodeId | null;
  bag: Record<string, unknown>;
  history: GraphCtx["history"];
  human: GraphCtx["human"];
  waitingGate?: GraphNodeId;
  createdAt: string;
  updatedAt: string;
  /** Plain log for Mel chat */
  log: string[];
};

const RUNS_KEY = "wonder-agent-graph-runs-v1";
const MAX_RUNS = 20;
const MAX_STEPS = 40;

function loadRuns(): GraphRunState[] {
  return offlineGetJson<GraphRunState[]>(RUNS_KEY, []);
}

function saveRuns(runs: GraphRunState[]) {
  offlineSetJson(RUNS_KEY, runs.slice(0, MAX_RUNS), "agentGraph");
}

function uid(): string {
  return `grun-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function listGraphRuns(): GraphRunState[] {
  return loadRuns();
}

export function getGraphRun(runId: string): GraphRunState | null {
  return loadRuns().find((r) => r.runId === runId) || null;
}

export function latestGraphRun(): GraphRunState | null {
  return loadRuns()[0] || null;
}

function upsertRun(run: GraphRunState) {
  const rest = loadRuns().filter((r) => r.runId !== run.runId);
  saveRuns([run, ...rest]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Start a graph and advance until done, failed, or human gate.
 */
export async function startGraph(
  graph: AgentGraph,
  bag: Record<string, unknown> = {}
): Promise<GraphRunState> {
  const now = new Date().toISOString();
  const run: GraphRunState = {
    runId: uid(),
    graphId: graph.id,
    status: "running",
    cursor: graph.entry,
    bag: { ...bag },
    history: [],
    human: {},
    createdAt: now,
    updatedAt: now,
    log: [`Started graph “${graph.name}” (${graph.id}).`],
  };
  upsertRun(run);
  wonderEmit("data.changed", "agentGraph", { op: "start", runId: run.runId });
  return advanceGraph(graph, run.runId);
}

/**
 * Continue after human yes/no on a gate.
 */
export async function decideGraphGate(
  graph: AgentGraph,
  runId: string,
  decision: "yes" | "no"
): Promise<GraphRunState> {
  const run = getGraphRun(runId);
  if (!run) throw new Error("Run not found");
  if (run.status !== "waiting_human" || !run.waitingGate) {
    run.log.push("No human gate is open on this run.");
    upsertRun(run);
    return run;
  }
  const gate = run.waitingGate;
  run.human[gate] = decision;
  run.log.push(
    decision === "yes"
      ? `You approved gate “${gate}”. Continuing.`
      : `You rejected gate “${gate}”. Stopping.`
  );
  if (decision === "no") {
    run.status = "failed";
    run.cursor = null;
    run.waitingGate = undefined;
    run.updatedAt = new Date().toISOString();
    upsertRun(run);
    return run;
  }
  run.status = "running";
  run.waitingGate = undefined;
  // Advance past the gate using its next() with synthetic ok result
  const node = graph.nodes[gate];
  const result: GraphNodeResult = {
    ok: true,
    status: "ok",
    summary: "Human approved",
    data: { approved: true },
  };
  run.history.push({ nodeId: gate, result, at: new Date().toISOString() });
  const nextId = node?.next
    ? node.next(
        {
          runId: run.runId,
          graphId: run.graphId,
          bag: run.bag,
          last: result,
          history: run.history,
          human: run.human,
        },
        result
      )
    : null;
  if (nextId === "__fail__" || nextId == null) {
    run.status = nextId === "__fail__" ? "failed" : "done";
    run.cursor = null;
    run.updatedAt = new Date().toISOString();
    run.log.push(run.status === "done" ? "Graph finished." : "Graph failed after gate.");
    upsertRun(run);
    return run;
  }
  run.cursor = nextId;
  upsertRun(run);
  return advanceGraph(graph, runId);
}

/**
 * Drive the while-loop: run node → route next → until terminal or gate.
 */
export async function advanceGraph(
  graph: AgentGraph,
  runId: string
): Promise<GraphRunState> {
  let run = getGraphRun(runId);
  if (!run) throw new Error("Run not found");
  if (run.status === "done" || run.status === "failed") return run;
  if (run.status === "waiting_human") return run;

  let steps = 0;
  while (run.cursor && steps < MAX_STEPS) {
    steps += 1;
    const nodeId = run.cursor;
    const node = graph.nodes[nodeId];
    if (!node) {
      run.status = "failed";
      run.log.push(`Unknown node “${nodeId}”.`);
      run.cursor = null;
      break;
    }

    // Human gate: pause before side effects if not yet decided
    if (node.humanGate && run.human[nodeId] !== "yes") {
      if (run.human[nodeId] === "no") {
        run.status = "failed";
        run.log.push(`Gate “${node.label}” was rejected.`);
        run.cursor = null;
        break;
      }
      run.status = "waiting_human";
      run.waitingGate = nodeId;
      run.log.push(
        `⏸ Waiting on you: “${node.label}”. Say: approve loop · or reject loop.`
      );
      run.updatedAt = new Date().toISOString();
      upsertRun(run);
      return run;
    }

    run.log.push(`→ ${node.label}`);
    const ctx: GraphCtx = {
      runId: run.runId,
      graphId: run.graphId,
      bag: run.bag,
      last: run.history[run.history.length - 1]?.result,
      history: run.history,
      human: run.human,
    };

    let result: GraphNodeResult = {
      ok: false,
      status: "fail",
      summary: "not run",
    };
    const maxAttempts = 1 + (node.retries ?? 0);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        result = await node.run(ctx);
      } catch (e) {
        result = {
          ok: false,
          status: "fail",
          summary: e instanceof Error ? e.message : "node threw",
        };
      }
      if (result.ok || result.status !== "fail") break;
      if (attempt < maxAttempts) {
        run.log.push(`  retry ${attempt}/${maxAttempts - 1}: ${result.summary}`);
        await sleep(40 * attempt);
      }
    }

    // Merge data bag
    if (result.data && typeof result.data === "object") {
      run.bag = { ...run.bag, ...(result.data as Record<string, unknown>) };
    }
    run.history.push({
      nodeId,
      result,
      at: new Date().toISOString(),
    });
    run.log.push(
      `  ${result.ok ? "✓" : "✗"} ${result.summary}${result.status !== "ok" && result.status !== "fail" ? ` (${result.status})` : ""}`
    );

    const nextId = node.next
      ? node.next(
          {
            runId: run.runId,
            graphId: run.graphId,
            bag: run.bag,
            last: result,
            history: run.history,
            human: run.human,
          },
          result
        )
      : null;

    if (nextId === "__fail__") {
      run.status = "failed";
      run.cursor = null;
      run.log.push("Graph failed (edge → fail).");
      break;
    }
    if (nextId == null) {
      run.status = "done";
      run.cursor = null;
      run.log.push("Graph finished.");
      break;
    }
    run.cursor = nextId;
    run.updatedAt = new Date().toISOString();
    upsertRun(run);
  }

  if (steps >= MAX_STEPS && run.status === "running") {
    run.status = "failed";
    run.log.push("Stopped: max steps (runaway loop guard).");
    run.cursor = null;
  }
  run.updatedAt = new Date().toISOString();
  upsertRun(run);
  wonderEmit("data.changed", "agentGraph", {
    op: "advance",
    runId: run.runId,
    status: run.status,
  });
  return run;
}

/** Run several independent node fns; bag gets `parallel` map. */
export async function runParallel(
  jobs: { id: string; run: () => GraphNodeResult | Promise<GraphNodeResult> }[]
): Promise<Record<string, GraphNodeResult>> {
  const settled = await Promise.all(
    jobs.map(async (j) => {
      try {
        return [j.id, await j.run()] as const;
      } catch (e) {
        return [
          j.id,
          {
            ok: false,
            status: "fail" as const,
            summary: e instanceof Error ? e.message : "parallel throw",
          },
        ] as const;
      }
    })
  );
  return Object.fromEntries(settled);
}

export function formatRun(run: GraphRunState, graphName?: string): string {
  const lines = [
    `Loop · ${graphName || run.graphId} · ${run.status}`,
    `run ${run.runId}`,
    "",
    ...run.log,
  ];
  if (run.status === "waiting_human") {
    lines.push("");
    lines.push("Your move: approve loop  ·  reject loop  ·  loop status");
  }
  if (run.status === "done") {
    lines.push("");
    lines.push("You kept direction + last yes. System carried the hops.");
  }
  return lines.join("\n");
}
