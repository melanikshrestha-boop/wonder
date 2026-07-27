/**
 * Mel’s statistical model catalog — every model she can run locally.
 * Not downloads from the internet: pure implementations in statsCore.ts
 * (browser-safe, offline, reproducible). Same formulas as SciPy/R classics.
 */

export type StatModelId =
  | "describe"
  | "pearson"
  | "spearman"
  | "autocorr"
  | "ols"
  | "ols-multi"
  | "logistic"
  | "linear-time"
  | "ses"
  | "holt"
  | "forecast-auto"
  | "welch-t"
  | "bootstrap-ci"
  | "iqr-outliers"
  | "moving-avg"
  | "zscore"
  | "rl-q" // links to existing RL stack
  | "deep-sleep-pack"; // existing domain pack

export type StatModelEntry = {
  id: StatModelId;
  name: string;
  family: "descriptive" | "association" | "regression" | "classification" | "timeseries" | "inference" | "rl";
  what: string;
  needs: string;
  melCue: string;
};

export const STAT_MODEL_CATALOG: StatModelEntry[] = [
  {
    id: "describe",
    name: "Descriptive stats",
    family: "descriptive",
    what: "n, mean, median, std, min/max, IQR, coefficient of variation",
    needs: "≥1 series",
    melCue: "describe recovery · stats summary sleep",
  },
  {
    id: "pearson",
    name: "Pearson correlation",
    family: "association",
    what: "Linear association r ∈ [−1, 1] between two aligned series",
    needs: "2 series, ≥3 points",
    melCue: "correlate sleep and recovery",
  },
  {
    id: "spearman",
    name: "Spearman rank correlation",
    family: "association",
    what: "Monotonic association via ranks (robust to outliers)",
    needs: "2 series, ≥3 points",
    melCue: "spearman strain deep",
  },
  {
    id: "autocorr",
    name: "Autocorrelation",
    family: "timeseries",
    what: "How much today looks like lag-k days ago (persistence)",
    needs: "1 series, lag+3 points",
    melCue: "autocorr hrv",
  },
  {
    id: "ols",
    name: "Ordinary least squares (simple)",
    family: "regression",
    what: "y ≈ a + b·x with R², RMSE, formula",
    needs: "y + one x, n≥3",
    melCue: "regress deep on sleep hours",
  },
  {
    id: "ols-multi",
    name: "Multiple linear regression",
    family: "regression",
    what: "y ≈ β₀ + β₁x₁ + … with adj R² (WHOOP multi-factor)",
    needs: "y + 2+ predictors, n > p+1",
    melCue: "multi regress deep",
  },
  {
    id: "logistic",
    name: "Logistic regression (IRLS)",
    family: "classification",
    what: "P(event) via sigmoid; accuracy on 0/1 labels",
    needs: "binary y + predictors, n≥6",
    melCue: "logistic deep adequate",
  },
  {
    id: "linear-time",
    name: "Linear time trend forecast",
    family: "timeseries",
    what: "y ≈ a + b·t projected horizon days ahead",
    needs: "≥3 points",
    melCue: "forecast recovery 7",
  },
  {
    id: "ses",
    name: "Simple exponential smoothing",
    family: "timeseries",
    what: "Weighted recent history; flat short-term forecast",
    needs: "≥3 points",
    melCue: "ses forecast sleep",
  },
  {
    id: "holt",
    name: "Holt linear exponential smoothing",
    family: "timeseries",
    what: "Level + slope — good when metric is trending",
    needs: "≥4 points",
    melCue: "holt forecast strain",
  },
  {
    id: "forecast-auto",
    name: "Auto forecast (model selection)",
    family: "timeseries",
    what: "Picks linear / SES / Holt by in-sample one-step RMSE",
    needs: "≥5 points",
    melCue: "predict deep sleep · forecast whoop",
  },
  {
    id: "welch-t",
    name: "Welch two-sample t-test",
    family: "inference",
    what: "Compare means of two groups (e.g. fog yes vs no sleep)",
    needs: "2 groups, each n≥2",
    melCue: "compare sleep fog vs clear",
  },
  {
    id: "bootstrap-ci",
    name: "Bootstrap mean CI",
    family: "inference",
    what: "95% confidence interval for the mean via resampling",
    needs: "≥3 points",
    melCue: "ci recovery",
  },
  {
    id: "iqr-outliers",
    name: "IQR outlier screen",
    family: "descriptive",
    what: "Flags points outside Q1−1.5·IQR … Q3+1.5·IQR",
    needs: "≥5 points",
    melCue: "outliers strain",
  },
  {
    id: "moving-avg",
    name: "Moving average",
    family: "timeseries",
    what: "Rolling mean smoother (window w)",
    needs: "≥ window points",
    melCue: "ma 7 recovery",
  },
  {
    id: "zscore",
    name: "Z-scores",
    family: "descriptive",
    what: "Standardize series to mean 0, sd 1",
    needs: "≥2 points",
    melCue: "zscore hrv",
  },
  {
    id: "rl-q",
    name: "Q-learning policy (RL)",
    family: "rl",
    what: "Trial-and-error value table from rewards (deep sleep + Mel actions)",
    needs: "history / feedback",
    melCue: "rl status · rl demo",
  },
  {
    id: "deep-sleep-pack",
    name: "Deep-sleep forecast pack",
    family: "timeseries",
    what: "Domain pack: time-linear + multi-factor drivers + logistic + RL tip",
    needs: "WHOOP nights with deep",
    melCue: "deep sleep forecast",
  },
];

export function formatCatalog(): string {
  const lines = [
    "Mel stats lab — local model catalog (pure math, no cloud)",
    `${STAT_MODEL_CATALOG.length} models loaded offline.`,
    "",
  ];
  let fam = "";
  for (const m of STAT_MODEL_CATALOG) {
    if (m.family !== fam) {
      fam = m.family;
      lines.push(`— ${fam.toUpperCase()} —`);
    }
    lines.push(`• ${m.name}`);
    lines.push(`  ${m.what}`);
    lines.push(`  Try: ${m.melCue}`);
  }
  lines.push("");
  lines.push(
    "Data sources: WHOOP import, sleep log, water, fog, finance spend (when present)."
  );
  lines.push("Say: forecast recovery · correlate sleep recovery · describe hrv · stats models");
  return lines.join("\n");
}
