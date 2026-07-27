/**
 * Tiny page-id matchers — no heavy desks.
 * MelaniViews uses these so lazy() actually code-splits Fitness/Whoop/Finance/etc.
 */

export function isFitnessPage(pageId: string): boolean {
  return [
    "pg-fitness",
    "pg-sleep",
    "pg-meals",
    "pg-gym",
    "pg-focus",
    "pg-screentime",
    "pg-screen-time",
    "pg-body",
    "pg-whoop",
  ].includes(pageId);
}

export function isHygienePage(pageId: string): boolean {
  return (
    pageId === "pg-hygiene" ||
    pageId === "pg-shower-daily" ||
    pageId === "pg-shower-everything" ||
    pageId === "pg-hair" ||
    pageId === "pg-am-skin" ||
    pageId === "pg-pm-skin" ||
    pageId.startsWith("pg-pm-")
  );
}

export function isBooksPage(pageId: string): boolean {
  return pageId === "pg-books" || pageId === "pg-library";
}

export function isHabitsPage(pageId: string): boolean {
  return (
    pageId === "pg-habits" ||
    pageId === "pg-habit" ||
    pageId === "pg-habit-tracker"
  );
}

export function isFinancesPage(pageId: string): boolean {
  return pageId === "pg-finance" || pageId === "pg-finances";
}

export function isCareConciergePage(pageId: string): boolean {
  return pageId === "pg-agent-care";
}

export function isShoppingAgentPage(pageId: string): boolean {
  return pageId === "pg-agent-shopping";
}

/** @deprecated Use Focus under Fitness (pg-focus). Kept for old links. */
export function isScreenTimePage(pageId: string): boolean {
  return (
    pageId === "pg-focus" ||
    pageId === "pg-screentime" ||
    pageId === "pg-screen-time"
  );
}

export function isFocusPage(pageId: string): boolean {
  return isScreenTimePage(pageId);
}

/** Content Empire (YouTube research OS) — was Math Lab id */
export function isMathLabPage(pageId: string): boolean {
  return isContentEmpirePage(pageId);
}

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

export function isFailuresPage(pageId: string): boolean {
  return (
    pageId === "pg-failures" ||
    pageId === "pg-failure" ||
    pageId === "pg-learn-failures"
  );
}
