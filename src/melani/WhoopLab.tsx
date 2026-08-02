/**
 * Fitness → Whoop lab.
 * Recovery / body only. Sleep → Sleep tab. Training → Gym tab.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  WHOOP_EVENT,
  importWhoopCsvTexts,
  importWhoopFromPublicLatest,
  loadWhoopStore,
  type WhoopStore,
} from "./whoopStore";
import { buildWhoopAnalytics } from "./whoopAnalytics";
import {
  GROUP_META,
  metricDef,
  type MetricGroup,
} from "./whoopMetrics";
import { MetricExplainModal, MetricGraphPanel } from "./whoopMetricUi";
import "./whoop-lab.css";

export function WhoopLab() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [store, setStore] = useState<WhoopStore>(() => loadWhoopStore());
  const [busy, setBusy] = useState(false);
  const [explainKey, setExplainKey] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setStore(loadWhoopStore());
  }, []);

  useEffect(() => {
    const on = () => refresh();
    window.addEventListener(WHOOP_EVENT, on);
    return () => window.removeEventListener(WHOOP_EVENT, on);
  }, [refresh]);

  useEffect(() => {
    const s = loadWhoopStore();
    if (Object.keys(s.days).length > 0 || s.workouts.length > 0) return;
    void importWhoopFromPublicLatest().then((r) => {
      if (r.ok) refresh();
    });
  }, [refresh]);

  const analytics = useMemo(() => buildWhoopAnalytics(store), [store]);

  // Sleep + body signals → Sleep tab; training → Gym. Whoop keeps import only leftovers.
  const groups = useMemo(() => {
    const g: Record<MetricGroup, typeof analytics.series> = {
      sleep: [],
      ready: [],
      body: [],
      train: [],
    };
    for (const m of analytics.series) {
      const group = metricDef(m.key)?.group ?? "ready";
      // Those surfaces own the graphs — don't duplicate on Whoop
      if (group === "sleep" || group === "train" || group === "body") continue;
      g[group].push(m);
    }
    return (Object.keys(GROUP_META) as MetricGroup[])
      .filter((k) => k !== "sleep" && k !== "train" && k !== "body")
      .sort((a, b) => GROUP_META[a].order - GROUP_META[b].order)
      .filter((k) => g[k].length > 0)
      .map((k) => ({ key: k, label: GROUP_META[k].label, metrics: g[k] }));
  }, [analytics.series]);

  const explainSeries = explainKey
    ? analytics.series.find((m) => m.key === explainKey) ?? null
    : null;

  async function onFiles(fileList: FileList | null) {
    if (!fileList?.length || busy) return;
    setBusy(true);
    try {
      const files: Array<{ name: string; text: string }> = [];
      for (const file of Array.from(fileList)) {
        if (/\.zip$/i.test(file.name)) {
          setBusy(false);
          return;
        }
        if (!/\.csv$/i.test(file.name) && !/\.txt$/i.test(file.name)) continue;
        files.push({ name: file.name, text: await file.text() });
      }
      if (!files.length) {
        setBusy(false);
        return;
      }
      importWhoopCsvTexts(files);
      refresh();
    } catch {
      /* import failed */
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="wx">
      <header className="wx-head">
        <h2 className="wx-h">Whoop</h2>
        <div className="wx-actions">
          <button
            type="button"
            className="wx-link wx-link-primary"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "Importing…" : "Import weekly CSVs"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv,.txt"
            multiple
            hidden
            onChange={(e) => void onFiles(e.target.files)}
          />
        </div>
      </header>
      {!analytics.dayCount && !store.workouts.length ? (
        <p className="wx-empty">
          No data yet. In the Whoop app, export your data, then multi-select the
          CSVs (sleeps, physiological_cycles, workouts, journal_entries) with
          <strong> Import weekly CSVs</strong>.
        </p>
      ) : (
        <>
          {groups.map((g) => (
            <section key={g.key} className="wx-section wx-graph-section">
              <h3 className="wx-h">{g.label}</h3>
              <div className="wx-panel-stack">
                {g.metrics.map((m) => (
                  <MetricGraphPanel
                    key={m.key}
                    series={m}
                    onOpenExplain={() => setExplainKey(m.key)}
                  />
                ))}
              </div>
            </section>
          ))}

          {explainSeries ? (
            <MetricExplainModal
              series={explainSeries}
              onClose={() => setExplainKey(null)}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
