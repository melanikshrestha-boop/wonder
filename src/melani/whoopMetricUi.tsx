/**
 * Shared Whoop metric graph panel + explain modal.
 * Used by Fitness → Sleep (sleep group) and Fitness → Whoop (everything else).
 */
import { useEffect, useMemo } from "react";
import type { MetricSeries } from "./whoopStore";
import { metricDef } from "./whoopMetrics";
import { TimeGraph, formatValue, shortDay } from "./whoopCharts";
import { renderFormula } from "./mathml";
import "./whoop-lab.css";

/** One or more pure math lines (`;`-separated) → native MathML markup. */
function typesetFormula(source: string): string {
  return source
    .split(";")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => renderFormula(line))
    .join("");
}

function deltaVsAvg(series: MetricSeries): number | null {
  if (series.latest == null || series.avg == null) return null;
  return Math.round((series.latest - series.avg) * 100) / 100;
}

function personalLine(series: MetricSeries): string {
  const d = deltaVsAvg(series);
  const guide = metricDef(series.key);
  if (d == null || series.avg == null) return "Not enough history yet.";
  const scale = Math.abs(series.avg) > 0.05 ? Math.abs(series.avg) : 1;
  if (Math.abs(d) / scale < 0.03) return "Latest is on your average.";
  const above = d > 0;
  const sign = above ? "above" : "below";
  const mag =
    series.unit === "h"
      ? `${Math.abs(d).toFixed(1)}h`
      : series.unit === "%"
        ? `${Math.abs(Math.round(d))}%`
        : `${formatValue(Math.abs(d), series.unit)}${series.unit}`;
  if (guide?.higherIsBetter == null) {
    return `Latest is ${mag} ${sign} your average.`;
  }
  const good = guide.higherIsBetter ? above : !above;
  return good
    ? `Latest is ${mag} ${sign} your average — solid.`
    : `Latest is ${mag} ${sign} your average — watch.`;
}

export function MetricGraphPanel({
  series,
  onOpenExplain,
  goal,
  goalLabel,
  /** When set, title is plain text (not a clickable explain button) */
  staticTitle,
}: {
  series: MetricSeries;
  onOpenExplain?: () => void;
  goal?: number | null;
  goalLabel?: string;
  staticTitle?: boolean;
}) {
  if (!series.points.length && series.avg == null) return null;

  // Prefer explicit prop; else registry ideal (sleep 100%, 8h, etc.)
  const def = metricDef(series.key);
  const goalValue =
    goal != null && Number.isFinite(goal) ? goal : def?.idealGoal ?? null;
  const goalText =
    goalLabel ??
    def?.idealGoalLabel ??
    (goalValue != null
      ? `${formatValue(goalValue, series.unit)}${series.unit}`
      : undefined);

  // Blue dotted = your average (history you already have)
  const avgValue =
    series.avg != null && Number.isFinite(series.avg) && series.points.length >= 3
      ? series.avg
      : null;
  const avgText =
    avgValue != null
      ? `avg ${formatValue(avgValue, series.unit)}${series.unit}`
      : undefined;

  const d = deltaVsAvg(series);
  // Weight goal is down; Whoop metrics use registry; else raw sign
  const hib =
    series.key === "weight"
      ? false
      : def?.higherIsBetter ?? null;
  let deltaClass = "";
  if (d != null && Math.abs(d) >= 0.05 && hib !== null) {
    const good = hib ? d > 0 : d < 0;
    deltaClass = good ? "is-up" : "is-down";
  } else if (d != null && Math.abs(d) >= 0.05) {
    deltaClass = d > 0 ? "is-up" : "is-down";
  }

  return (
    <article className="wx-panel" id={`wx-metric-${series.key}`}>
      <header className="wx-panel-head">
        <div className="wx-panel-title-row">
          {onOpenExplain && !staticTitle ? (
            <button
              type="button"
              className="wx-panel-title is-clickable"
              onClick={onOpenExplain}
              title="What it is · how measured · why · big picture · normal range"
            >
              {series.label}
            </button>
          ) : (
            <h3 className="wx-panel-title">{series.label}</h3>
          )}
        </div>
        <div className="wx-panel-nums">
          <span className="wx-panel-v">
            {formatValue(series.avg, series.unit)}
            {series.unit ? <small>{series.unit}</small> : null}
          </span>
          <span className="wx-panel-meta">
            <span className="wx-panel-latest">
              latest: {formatValue(series.latest, series.unit)}
              {series.unit}
            </span>
            {d != null && Math.abs(d) >= 0.05 ? (
              <span className={`wx-metric-delta ${deltaClass}`}>
                {d > 0 ? "+" : ""}
                {formatValue(d, series.unit)}
                {series.unit} vs avg
              </span>
            ) : null}
            {series.min != null && series.max != null ? (
              <span className="wx-panel-range">
                {formatValue(series.min, series.unit)}–{formatValue(series.max, series.unit)}
              </span>
            ) : null}
          </span>
        </div>
      </header>
      <TimeGraph
        series={series}
        goal={goalValue}
        goalLabel={goalText}
        avgLine={avgValue}
        avgLabel={avgText}
      />
      <footer className="wx-panel-foot">
        <span>
          n = {series.points.length}
          {series.latest != null
            ? ` · latest ${formatValue(series.latest, series.unit)}${series.unit}`
            : ""}
          {avgValue != null
            ? ` · avg ${formatValue(avgValue, series.unit)}${series.unit}`
            : ""}
          {goalValue != null && Number.isFinite(goalValue)
            ? ` · ideal ${formatValue(goalValue, series.unit)}${series.unit}`
            : ""}
        </span>
        <span className="wx-scale-legend" aria-hidden>
          {avgValue != null ? (
            <span className="wx-leg-avg">··· avg</span>
          ) : null}
          {goalValue != null ? (
            <span className="wx-leg-ideal">— · ideal</span>
          ) : null}
        </span>
      </footer>
    </article>
  );
}

export function MetricExplainModal({
  series,
  onClose,
}: {
  series: MetricSeries;
  onClose: () => void;
}) {
  const e = metricDef(series.key);
  // Typeset once per open metric — real fraction bars + subscripts (MathML).
  const formulaHtml = useMemo(
    () => (e?.formula ? typesetFormula(e.formula) : ""),
    [e?.formula]
  );

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="wx-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="wx-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`wx-modal-title-${series.key}`}
        onClick={(ev) => ev.stopPropagation()}
      >
        <header className="wx-modal-head">
          <h3 id={`wx-modal-title-${series.key}`} className="wx-modal-title">
            {e?.label ?? series.label}
          </h3>
          <button
            type="button"
            className="wx-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="wx-modal-nums" aria-label="Your numbers">
          <span>
            <em>avg</em> {formatValue(series.avg, series.unit)}
            {series.unit}
          </span>
          <span>
            <em>latest</em> {formatValue(series.latest, series.unit)}
            {series.unit}
            {series.latestDay ? ` · ${shortDay(series.latestDay)}` : ""}
          </span>
          <span>
            <em>n</em> {series.points.length}
          </span>
        </div>

        <p className="wx-modal-read">{personalLine(series)}</p>

        {e ? (
          <dl className="wx-modal-dl">
            <div>
              <dt>What it is</dt>
              <dd>{e.what}</dd>
            </div>
            <div>
              <dt>How it’s measured</dt>
              <dd>{e.how}</dd>
              {formulaHtml ? (
                <figure className="wx-modal-formula">
                  <div
                    className="wx-modal-formula-math"
                    aria-label="Equation"
                    dangerouslySetInnerHTML={{ __html: formulaHtml }}
                  />
                  {e.formulaNote ? (
                    <figcaption className="wx-modal-formula-note">
                      {e.formulaNote}
                    </figcaption>
                  ) : null}
                </figure>
              ) : null}
            </div>
            <div>
              <dt>Why measure it</dt>
              <dd>{e.why}</dd>
            </div>
            <div>
              <dt>Big picture</dt>
              <dd>{e.bigPicture}</dd>
            </div>
            <div>
              <dt>Normal range (18–20 years old)</dt>
              <dd>{e.normalRange}</dd>
            </div>
          </dl>
        ) : (
          <p className="wx-empty">No write-up for this metric yet.</p>
        )}
      </div>
    </div>
  );
}
