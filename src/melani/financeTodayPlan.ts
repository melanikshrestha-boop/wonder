/**
 * DO TODAY plan — not a fake 7-day project.
 * These are minutes-long moves. The desk checks what's already true
 * from your books so you only check what still needs a human click.
 */

import { cashOnHand, type FinanceState } from "./financeStore";
import type { BooksExtraState } from "./financeBooksStore";

export type TodayAction = {
  id: string;
  title: string;
  why: string;
  doExactly: string;
  minutes: number;
  /** Done: books prove it OR you checked the box */
  done: boolean;
  /** True if books alone completed it (no checkbox needed) */
  autoFromBooks: boolean;
  tab?: "accounts" | "transactions" | "insights" | "plan";
};

export function buildTodayPlan(
  state: FinanceState,
  books: BooksExtraState
): {
  actions: TodayAction[];
  doneCount: number;
  total: number;
  minutesLeft: number;
  order: string;
} {
  const cards = state.accounts.filter((a) => a.kind === "credit");
  const bofaCard = cards.find((a) => a.mask === "5499");

  const hasLimit = cards.some((a) => (a.creditLimit || 0) > 0);
  const hasDue = cards.some((a) => (a.dueDay || 0) >= 1 && (a.dueDay || 0) <= 31);
  const hasClose = cards.some(
    (a) => (a.statementCloseDay || 0) >= 1 && (a.statementCloseDay || 0) <= 31
  );
  const hasAutopay = cards.some((a) => a.autopayMin === true);
  const floor = state.creditProfile?.cashFloor ?? 300;
  const cash = cashOnHand(state.accounts);
  const floorOk = cash >= floor;
  const scoreMeta = !!(
    state.creditProfile?.scoreProvider || state.creditProfile?.scoreModel
  );
  const hasBofa = state.accounts.some(
    (a) => a.id === "acc-bofa-checking" || a.mask === "8804"
  );
  const hasChase = state.txs.some(
    (t) => t.id.startsWith("chase-") || t.accountId?.includes("chase")
  );
  const cardPurchaseLines = state.txs.filter(
    (t) =>
      t.kind === "expense" &&
      /chipotle|target|waymo|lyft|amazon|doordash/i.test(
        `${t.merchant || ""} ${t.note || ""}`
      ) &&
      !/payment to chase card|credit card payment/i.test(
        `${t.merchant || ""} ${t.note || ""}`
      )
  ).length;
  const cardCsvLikelyMissing = cardPurchaseLines < 30 && hasChase;
  const manual = books.todayDone || {};

  const defs: Omit<TodayAction, "done" | "autoFromBooks">[] = [
    {
      id: "card-limit",
      title: "Type Chase card limit (··5584)",
      why: "Utilization is blind without a limit.",
      doExactly:
        "Chase app → card limit → Accounts → Limit field on Chase Card · 5584.",
      minutes: 2,
      tab: "accounts",
    },
    {
      id: "card-due-close",
      title: "Type due day + statement close day",
      why: "Due = no late. Close day = when balance often reports.",
      doExactly: "Accounts → Due day + Close day on the card row.",
      minutes: 2,
      tab: "accounts",
    },
    {
      id: "autopay",
      title: "Autopay ≥ minimum ON (then check box)",
      why: "One late payment wrecks a 677 climb.",
      doExactly: "Chase → Autopay minimum or full → tick Autopay on Accounts.",
      minutes: 3,
      tab: "accounts",
    },
    {
      id: "cash-floor",
      title: `Cash floor $${floor} (stop $0.03)`,
      why: "You already ate a $34 overdraft fee.",
      doExactly: `Leave ≥ $${floor} in checking after next Zelle. Floor is on Review.`,
      minutes: 1,
      tab: "insights",
    },
    {
      id: "score-meta",
      title: "Where did 677 come from?",
      why: "Vantage ≠ FICO. Write provider + model.",
      doExactly: "Review → provider / model / bureau fields.",
      minutes: 1,
      tab: "insights",
    },
    {
      id: "import-card-csv",
      title: "Import Chase card ··5584 CSV",
      why: "Checking only shows lump 'card payments'.",
      doExactly: "Chase download activity CSV → Import button.",
      minutes: 5,
      tab: "transactions",
    },
    {
      id: "bofa-on-books",
      title: "BofA ···8804 loaded",
      why: "Joint SafeBalance is part of your real picture.",
      doExactly: "Already on ledger when import ran.",
      minutes: 0,
      tab: "transactions",
    },
    {
      id: "bofa-card-5499",
      title: "BofA card ··5499 limit — or mark done if N/A",
      why: "Saw $241.96 to CRD 5499 on BofA statement.",
      doExactly: "Add limit on BofA Card · 5499, or check done if no card.",
      minutes: 2,
      tab: "accounts",
    },
  ];

  const auto: Record<string, boolean> = {
    "card-limit": hasLimit,
    "card-due-close": hasDue && hasClose,
    autopay: hasAutopay,
    "cash-floor": floorOk,
    "score-meta": scoreMeta,
    "import-card-csv": !cardCsvLikelyMissing,
    "bofa-on-books": hasBofa,
    "bofa-card-5499": !!(bofaCard && (bofaCard.creditLimit || 0) > 0),
  };

  const actions: TodayAction[] = defs.map((d) => {
    const autoFromBooks = !!auto[d.id];
    const done = autoFromBooks || !!manual[d.id];
    return { ...d, autoFromBooks, done };
  });

  const doneCount = actions.filter((a) => a.done).length;
  const open = actions.filter((a) => !a.done);
  const minutesLeft = open.reduce((s, a) => s + a.minutes, 0);

  return {
    actions,
    doneCount,
    total: actions.length,
    minutesLeft,
    order:
      open[0]?.title ||
      "Today's list clear — protect the floor, no new credit apps.",
  };
}
