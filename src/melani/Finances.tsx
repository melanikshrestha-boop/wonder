/**
 * Wonder Finances — Rockefeller bookkeeping desk.
 * Ledger first · every dollar named · every cent recorded · period closed.
 * Not financial advice. Credit estimate is educational, not FICO.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
} from "react";
import "./finance.css";
import "./whoop-lab.css"; // Recovery-panel graph chrome (wx-panel)
import {
  buildCreditReport,
  DEFAULT_CREDIT_PROFILE,
  REAL_CREDIT_SCORE,
  type CreditProfile,
} from "./financeCredit";
import {
  categoriesForKind,
  cleanMerchant,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  normalizeImportedTransactionCategory,
  normalizeTransactionCategory,
  zellePurposeCategory,
} from "./financeCategorize";
import { exportLedgerCsv, parseBankCsv } from "./financeCsv";
import { importOfx, looksLikeOfx } from "./financeOfx";
import {
  applyTransferPair,
  detectTransferPairs,
  isTransferLike,
  monthTrueIncome,
  monthTrueSpend,
  type TransferPair,
} from "./financeTransfers";
import {
  buildWorthSeries,
  explainWorthChange,
  loadWorth,
  newValuationItem,
  saveWorth,
  valuationAt,
  worthComposition,
  type ValuationItem,
  type WorthState,
} from "./financeNetWorth";
import {
  loadCreditTracking,
  saveCreditTracking,
  recordCreditScore,
  latestScore,
  paymentReminders,
  inferCardPaydays,
  creditUtilization,
  scoreTrend,
  type CreditTrackingState,
} from "./creditTracking";
import {
  analyzeSpending,
  forecastSpending,
  generateBudgetAlerts,
  suggestCuts,
} from "./smartBudget";
import { annualBookCsv, buildAnnualBook } from "./annualBooks";
import {
  detectSubscriptions,
  CADENCE_LABEL,
  applySubPrefs,
  dismissSubscription,
  mergeConfirmedSubscriptions,
  setSubscriptionCadence,
  setSubscriptionAmount,
  TOGGLE_CADENCES,
  type SubCadence,
} from "./subscriptions";
import {
  AllLedgerCharts,
  MonthBookCharts,
  LabeledLineChart,
  InteractivePieChart,
} from "./FinCharts";
import { FinanceCopilot } from "./FinanceCopilot";
import type { CopilotContext } from "./financeCopilotEngine";
import { FinanceSqlEditor } from "./FinanceSqlEditor";
import { Spend3D } from "./Spend3D";
import { BusinessReport } from "./BusinessReport";
import {
  availableBusinessQuarters,
  buildBusinessQuarterReport,
  businessQuarterReportCsv,
  currentBusinessQuarter,
  type BusinessQuarterKey,
} from "./financeBusinessReport";
import {
  answerFromBrief,
  buildSmartBrief,
} from "./financeIntelligence";
import {
  cashOnHand,
  creditOwed,
  fingerprintsFromTxs,
  loadFinance,
  mergeTxs,
  money,
  moneyExact,
  moneyCents,
  formatDateMDY,
  monthExpense,
  monthIncome,
  monthKey,
  monthlySeries,
  netWorth,
  newAccount,
  newGoal,
  newTx,
  txTypeOf,
  saveFinance,
  seedFinanceUndoBaseline,
  FINANCE_EXTERNAL_RESTORE_EVENT,
  initFinanceCrossTabSync,
  savingsRate,
  scaleBudget,
  spentByCategory,
  autoBudgetFromHistory,
  budgetFromLastMonth,
  type AccountKind,
  type FinanceAccount,
  type FinanceState,
  type FinanceTx,
  type TxKind,
} from "./financeStore";
import {
  hasEncryptedVault,
  isVaultUnlocked,
  lockVault,
  probeVault,
  saveVault,
  unlockVault,
} from "./financeVault";
import {
  applyChaseStatements,
  chaseImportNeeded,
  chaseStatementSummary,
  markChaseImportDone,
} from "./chaseStatementImport";
import {
  applyBofaStatements,
  bofaImportNeeded,
  bofaStatementSummary,
  markBofaImportDone,
} from "./bofaStatementImport";
import {
  closeMonth,
  loadBooksExtra,
  newPayable,
  newReceipt,
  newReceivable,
  reopenMonth,
  saveBooksExtra,
  toggleTodayDone,
  type BooksExtraState,
} from "./financeBooksStore";
import { buildTodayPlan } from "./financeTodayPlan";
import { buildAccountingPack } from "./financeAccounting";

export const FINANCES_PAGE_ID = "pg-finance";

export function isFinancesPage(pageId: string): boolean {
  return pageId === FINANCES_PAGE_ID || pageId === "pg-finances";
}

type Quote = {
  symbol: string;
  price: number | null;
  changePct: number | null;
};

type PlaidStatus = {
  ready: boolean;
  env?: string;
  message?: string;
  setupUrl?: string;
  linkedItems?: number;
};

type TabId =
  | "overview"
  | "business"
  | "worth"
  | "transactions"
  | "credit"
  | "plan"
  | "subscriptions"
  | "goals"
  | "insights"
  | "accounts"
  | "sql";

type SortKey = "date" | "merchant" | "category" | "amount" | "kind";

/** Bookkeeper desk — ledger is home, not a marketing dashboard */

const NAV: { id: TabId; label: string; icon: string }[] = [
  { id: "transactions", label: "Ledger", icon: "☰" },
  { id: "overview", label: "All", icon: "◉" },
  { id: "business", label: "Quarterly", icon: "▤" },
  { id: "plan", label: "Plan", icon: "▦" },
  { id: "subscriptions", label: "Subscriptions", icon: "↻" },
  { id: "sql", label: "SQL", icon: "⌗" },
];

const ALL_TAB_IDS: TabId[] = [
  "overview",
  "business",
  "worth",
  "transactions",
  "credit",
  "plan",
  "subscriptions",
  "goals",
  "insights",
  "accounts",
  "sql",
];

const KINDS: { id: AccountKind; label: string }[] = [
  { id: "checking", label: "Checking" },
  { id: "savings", label: "Savings" },
  { id: "cash", label: "Cash" },
  { id: "credit", label: "Credit (owe)" },
  { id: "invest", label: "Invest" },
  { id: "other", label: "Other" },
];

const PLAN_GROUPS: { id: string; label: string; cats: string[] }[] = [
  {
    id: "essentials",
    label: "Essentials",
    cats: ["Groceries", "Transport", "Housing", "Utilities", "Laundry", "Health"],
  },
  {
    id: "lifestyle",
    label: "Lifestyle",
    cats: [
      "Restaurants",
      "Experiences",
      "Clothing",
      "Subscriptions",
      "Travel",
      "Cash",
    ],
  },
  {
    id: "moves",
    label: "Money moves",
    cats: ["Transfers", "Credit card payment"],
  },
  {
    id: "buffer",
    label: "Buffer",
    cats: ["Education", "Business", "Fees", "Other", "Uncategorized"],
  },
];

function normalizedLedgerCategory(tx: FinanceTx): string {
  return normalizeTransactionCategory(
    tx.category,
    `${tx.merchant || ""} ${tx.note || ""}`,
    tx.kind
  );
}

function isLedgerMovement(tx: FinanceTx): boolean {
  return isTransferLike({ ...tx, category: normalizedLedgerCategory(tx) });
}

function LedgerFilterMenu({
  value,
  options,
  allLabel,
  onChange,
}: {
  value: string;
  options: string[];
  allLabel: string;
  onChange: (value: string) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const display = value === "all" ? allLabel : value;
  return (
    <details ref={detailsRef} className="wd-filter-menu">
      <summary>{display}</summary>
      <div className="wd-filter-popover" role="menu" aria-label={allLabel}>
        {[...options, "all"].map((option) => {
          const label = option === "all" ? allLabel : option;
          return (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={value === option}
              className={value === option ? "is-selected" : undefined}
              onClick={() => {
                onChange(option);
                if (detailsRef.current) detailsRef.current.open = false;
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </details>
  );
}

function LedgerCategoryFilter({
  kind,
  category,
  onChange,
}: {
  kind: "all" | TxKind;
  category: string;
  onChange: (next: { kind: "all" | TxKind; category: string }) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [stage, setStage] = useState<"direction" | TxKind>("direction");
  const display =
    category !== "all"
      ? category
      : kind === "income"
        ? "All income"
        : kind === "expense"
          ? "All expenses"
          : "Categories";
  const options =
    stage === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const choose = (next: { kind: "all" | TxKind; category: string }) => {
    onChange(next);
    setStage("direction");
    if (detailsRef.current) detailsRef.current.open = false;
  };

  return (
    <details
      ref={detailsRef}
      className="wd-filter-menu wd-category-filter"
      onToggle={(event) => {
        if (!event.currentTarget.open) setStage("direction");
      }}
    >
      <summary>{display}</summary>
      <div
        className="wd-filter-popover wd-category-filter-popover"
        role="menu"
        aria-label="Income or expense categories"
      >
        {stage === "direction" ? (
          <>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={kind === "all" && category === "all"}
              className={
                kind === "all" && category === "all" ? "is-selected" : undefined
              }
              onClick={() => choose({ kind: "all", category: "all" })}
            >
              <span>All categories</span>
              <small>Income and expenses</small>
            </button>
            <button
              type="button"
              role="menuitem"
              className="is-income-choice"
              onClick={() => setStage("income")}
            >
              <span>Income</span>
              <small>Money coming in →</small>
            </button>
            <button
              type="button"
              role="menuitem"
              className="is-expense-choice"
              onClick={() => setStage("expense")}
            >
              <span>Expenses</span>
              <small>Money going out →</small>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="wd-category-back"
              onClick={() => setStage("direction")}
            >
              ← {stage === "income" ? "Income" : "Expenses"}
            </button>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={kind === stage && category === "all"}
              className={
                kind === stage && category === "all" ? "is-selected" : undefined
              }
              onClick={() => choose({ kind: stage, category: "all" })}
            >
              All {stage === "income" ? "income" : "expenses"}
            </button>
            {options.map((option) => (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={kind === stage && category === option}
                className={
                  kind === stage && category === option
                    ? "is-selected"
                    : undefined
                }
                onClick={() => choose({ kind: stage, category: option })}
              >
                {option}
              </button>
            ))}
          </>
        )}
      </div>
    </details>
  );
}

function mapQuote(raw: Record<string, unknown>): Quote {
  return {
    symbol: String(raw.symbol || ""),
    price:
      typeof raw.regularMarketPrice === "number"
        ? raw.regularMarketPrice
        : typeof raw.price === "number"
          ? raw.price
          : null,
    changePct:
      typeof raw.regularMarketChangePercent === "number"
        ? raw.regularMarketChangePercent
        : typeof raw.changePct === "number"
          ? raw.changePct
          : null,
  };
}

/** Daily net for current month — green/red chart */
function dailyBars(txs: FinanceTx[], ym: string) {
  const daysInMonth = 28;
  const map = new Map<number, number>();
  for (const t of txs) {
    if (!t.date.startsWith(ym)) continue;
    const d = Number(t.date.slice(8, 10));
    if (!d) continue;
    const signed = t.kind === "income" ? t.amount : -t.amount;
    map.set(d, (map.get(d) || 0) + signed);
  }
  const out: { day: number; net: number }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    out.push({ day: d, net: map.get(d) || 0 });
  }
  return out;
}

export function Finances(_props: { onGo?: (pageId: string) => void }) {
  /**
   * Encryption is optional (off by default).
   * Only if a vault was already set up: show unlock. Otherwise open ledger plain.
   */
  const [vaultGate, setVaultGate] = useState<"unlock" | "ready">(() =>
    probeVault().mode === "encrypted" ? "unlock" : "ready"
  );
  const [vaultPass, setVaultPass] = useState("");
  const [vaultErr, setVaultErr] = useState("");
  const [vaultBusy, setVaultBusy] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  const [state, setState] = useState<FinanceState | null>(() => {
    if (probeVault().mode === "encrypted") return null;
    const initial = loadFinance();
    seedFinanceUndoBaseline(initial);
    return initial;
  });

  // Global **U** undo restores ledger from outside (topbar / key U)
  useEffect(() => {
    const onRestore = (event: Event) => {
      const detail = (event as CustomEvent<FinanceState>).detail;
      if (detail && detail.version === 2) {
        seedFinanceUndoBaseline(detail);
        setState(detail);
      }
    };
    window.addEventListener(FINANCE_EXTERNAL_RESTORE_EVENT, onRestore);
    const stopSync = initFinanceCrossTabSync();
    return () => {
      window.removeEventListener(FINANCE_EXTERNAL_RESTORE_EVENT, onRestore);
      stopSync();
    };
  }, []);

  /** Apply an update only when books are loaded (vault unlocked). */
  const patchState = useCallback(
    (fn: (s: FinanceState) => FinanceState) => {
      setState((s) => (s ? fn(s) : s));
    },
    []
  );
  // Ledger All is the Finance home: open the full year's books first.
  const [tab, setTab] = useState<TabId>(() => {
    if (typeof window === "undefined") return "transactions";
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && ALL_TAB_IDS.includes(t as TabId)) return t as TabId;
    return "transactions";
  });
  const [businessQuarter, setBusinessQuarter] =
    useState<BusinessQuarterKey>(() => {
      if (typeof window !== "undefined") {
        const quarter = new URLSearchParams(window.location.search).get(
          "quarter",
        );
        if (/^\d{4}-Q[1-4]$/.test(quarter || "")) {
          return quarter as BusinessQuarterKey;
        }
      }
      return currentBusinessQuarter();
    });
  // Open quant desk from URL (?desk=1 or ?copilot=1)
  const [copilotOpen, setCopilotOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const p = new URLSearchParams(window.location.search);
    return p.get("desk") === "1" || p.get("copilot") === "1";
  });
  // Deleted tabs fall back to Ledger
  useEffect(() => {
    if (!ALL_TAB_IDS.includes(tab)) setTab("transactions");
  }, [tab]);
  useEffect(() => {
    const openLedger = () => setTab("transactions");
    window.addEventListener("wonder-finance-open-ledger", openLedger);
    return () =>
      window.removeEventListener("wonder-finance-open-ledger", openLedger);
  }, []);
  // Keep ?tab= in the URL when switching sections (shareable / refresh-safe)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (tab === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    if (tab === "business") {
      url.searchParams.set("quarter", businessQuarter);
    } else {
      url.searchParams.delete("quarter");
    }
    window.history.replaceState({}, "", url.toString());
  }, [tab, businessQuarter]);
  const [filterQ, setFilterQ] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  // Accountant period: year first, then Jan → current month (grows automatically)
  const [filterYear, setFilterYear] = useState(() => new Date().getFullYear());
  /** Month dropdown: All year first; individual months stay one click away. */
  const [filterMonth, setFilterMonth] = useState<string>("all");
  const [filterKind, setFilterKind] = useState<"all" | TxKind>("all");
  const [filterTxType, setFilterTxType] = useState("all");
  const [reviewFilter, setReviewFilter] = useState<{
    label: string;
    txIds: string[];
  } | null>(null);
  const [booksExpanded, setBooksExpanded] = useState(true);
  const [importNote, setImportNote] = useState("");
  const [plaid, setPlaid] = useState<PlaidStatus | null>(null);
  const [plaidBusy, setPlaidBusy] = useState(false);
  const [plaidNote, setPlaidNote] = useState("");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [goalDraft, setGoalDraft] = useState(() =>
    newGoal({ name: "", target: 1000, saved: 0 })
  );
  const [worthStore, setWorthStore] = useState<WorthState>(() => loadWorth());
  const [creditStore, setCreditStore] = useState<CreditTrackingState>(() =>
    loadCreditTracking()
  );
  const [scoreInput, setScoreInput] = useState("");
  const [valDraft, setValDraft] = useState<{
    name: string;
    side: "asset" | "liability";
    assetClass: ValuationItem["assetClass"];
    value: string;
    source: string;
    confidence: "low" | "medium" | "high";
  }>({
    name: "",
    side: "asset",
    assetClass: "other",
    value: "",
    source: "",
    confidence: "medium",
  });
  const [pointDrafts, setPointDrafts] = useState<
    Record<string, { value: string; source: string }>
  >({});
  const [sortKey] = useState<SortKey>("date");
  const [sortDir] = useState<"asc" | "desc">("desc");
  const [askQ, setAskQ] = useState("");
  const [askA, setAskA] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const idleTimer = useRef<number | null>(null);
  // Filing cabinet next to the ledger (payables, receipts, closed months)
  const [booksExtra, setBooksExtra] = useState<BooksExtraState>(() =>
    loadBooksExtra()
  );
  const [apWhat, setApWhat] = useState("");
  const [apAmt, setApAmt] = useState("");
  const [apDue, setApDue] = useState("");
  const [arWho, setArWho] = useState("");
  const [arAmt, setArAmt] = useState("");
  const [arDue, setArDue] = useState("");

  const creditProfile: CreditProfile = useMemo(
    () => ({
      ...DEFAULT_CREDIT_PROFILE,
      ...((state?.creditProfile) || {}),
    }),
    [state?.creditProfile]
  );

  const creditReport = useMemo(
    () =>
      state
        ? buildCreditReport(creditProfile, state.accounts)
        : buildCreditReport(DEFAULT_CREDIT_PROFILE, []),
    [creditProfile, state]
  );

  // Import Chase + Bank of America once (or when import version bumps)
  useEffect(() => {
    if (vaultGate !== "ready" || !state) return;
    const needChase = chaseImportNeeded();
    const needBofa = bofaImportNeeded();
    if (!needChase && !needBofa) return;

    let next = state;
    const notes: string[] = [];

    if (needChase) {
      const result = applyChaseStatements(next);
      next = result.state;
      markChaseImportDone();
      notes.push(`Chase · ${chaseStatementSummary()}`);
    }
    if (needBofa) {
      const result = applyBofaStatements(next);
      next = result.state;
      markBofaImportDone();
      notes.push(`BofA · ${bofaStatementSummary()}`);
    }

    setState(next);
    setFilterMonth("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when vault/session is ready
  }, [vaultGate]);

  // Lock real credit score 677 on the books if missing / stale guess
  useEffect(() => {
    if (vaultGate !== "ready" || !state) return;
    const known = state.creditProfile?.knownScore;
    if (known === REAL_CREDIT_SCORE) return;
    // Only auto-set when empty — don't overwrite if user typed a newer pull
    if (known != null && known >= 300 && known <= 850 && known !== REAL_CREDIT_SCORE) {
      // User has a different official number — leave it
      return;
    }
    if (known == null || known === 0) {
      patchState((s) => {
        if (!s) return s;
        return {
          ...s,
          creditProfile: {
            ...DEFAULT_CREDIT_PROFILE,
            ...(s.creditProfile || {}),
            knownScore: REAL_CREDIT_SCORE,
          },
        };
      });
    }
  }, [vaultGate, state?.creditProfile?.knownScore]);

  // Save: encrypted vault if unlocked, otherwise plain local books
  useEffect(() => {
    if (!state || vaultGate !== "ready") return;
    if (hasEncryptedVault() && isVaultUnlocked()) {
      let cancelled = false;
      void saveVault(state)
        .then(() => {
          if (!cancelled) setSaveErr("");
        })
        .catch((e) => {
          if (!cancelled) {
            setSaveErr(
              e instanceof Error ? e.message : "Could not save encrypted vault"
            );
          }
        });
      return () => {
        cancelled = true;
      };
    }
    // Plain mode (default) — no passphrase required
    saveFinance(state);
    setSaveErr("");
  }, [state, vaultGate]);

  // Auto-lock only when an encrypted vault is in use
  useEffect(() => {
    if (
      vaultGate !== "ready" ||
      !hasEncryptedVault() ||
      !isVaultUnlocked()
    ) {
      return;
    }
    const bump = () => {
      if (idleTimer.current != null) window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => {
        lockVault();
        setState(null);
        setVaultPass("");
        setVaultGate("unlock");
        setVaultErr("Locked after idle — unlock with your passphrase.");
      }, 12 * 60 * 1000);
    };
    bump();
    const evs = ["pointerdown", "keydown", "scroll"] as const;
    for (const e of evs) window.addEventListener(e, bump, { passive: true });
    return () => {
      if (idleTimer.current != null) window.clearTimeout(idleTimer.current);
      for (const e of evs) window.removeEventListener(e, bump);
    };
  }, [vaultGate]);

  async function onUnlockVault() {
    setVaultErr("");
    setVaultBusy(true);
    try {
      const next = await unlockVault(vaultPass);
      seedFinanceUndoBaseline(next);
      setState(next);
      setVaultPass("");
      setVaultGate("ready");
    } catch (e) {
      setVaultErr(e instanceof Error ? e.message : "Unlock failed");
    } finally {
      setVaultBusy(false);
    }
  }

  function onLockNow() {
    if (!hasEncryptedVault()) return;
    lockVault();
    setState(null);
    setVaultPass("");
    setVaultGate("unlock");
    setVaultErr("");
  }

  useEffect(() => {
    void fetch("/api/finance/plaid/status")
      .then((r) => r.json())
      .then((d) => setPlaid(d as PlaidStatus))
      .catch(() =>
        setPlaid({
          ready: false,
          message: "Plaid offline — CSV import still works.",
        })
      );
  }, []);

  const today = new Date();
  const liveYear = today.getFullYear();
  const liveMonth = today.getMonth() + 1; // 1–12

  const ym = filterMonth === "all" ? monthKey() : filterMonth || monthKey();
  const accountingPeriod =
    filterMonth === "all" ? String(filterYear) : ym;
  const txs = state?.txs || [];
  const accounts = state?.accounts || [];
  const spentMap = useMemo(() => spentByCategory(txs, ym), [txs, ym]);
  const income = useMemo(() => monthIncome(txs, ym), [txs, ym]);
  const expense = useMemo(() => monthExpense(txs, ym), [txs, ym]);
  const worth = netWorth(accounts);
  const worthVerified = accounts.every(
    (account) => account.balanceVerified !== false
  );
  const cash = cashOnHand(accounts);
  const debt = creditOwed(accounts);
  const cashFlow = income - expense;
  const rate = useMemo(() => savingsRate(txs, ym), [txs, ym]);
  const goals = state?.goals || [];

  /**
   * Years on the books (+ this calendar year). Newest first.
   * Year toggle only matters once you have more than one year.
   */
  const years = useMemo(() => {
    const set = new Set<number>([liveYear]);
    for (const t of txs) {
      const y = Number((t.date || "").slice(0, 4));
      if (y >= 2000 && y <= 2100) set.add(y);
    }
    return [...set].sort((a, b) => b - a);
  }, [txs, liveYear]);

  /**
   * Smart month strip for the selected year:
   * Jan → current month (this year), or Jan → Dec (past years).
   * Grows by itself when the calendar rolls (August appears in August).
   * Also extends if books somehow have a later month in that year.
   */
  const months = useMemo(() => {
    let last = filterYear === liveYear ? liveMonth : 12;
    if (filterYear > liveYear) last = 1;
    for (const t of txs) {
      if (!(t.date || "").startsWith(String(filterYear))) continue;
      const mo = Number(t.date.slice(5, 7));
      if (mo > last && mo <= 12) last = mo;
    }
    last = Math.max(1, Math.min(12, last));
    const keys: string[] = [];
    for (let m = 1; m <= last; m++) {
      keys.push(`${filterYear}-${String(m).padStart(2, "0")}`);
    }
    return keys; // January → current, calendar order
  }, [filterYear, liveYear, liveMonth, txs]);

  const monthLabelLong = (ymKey: string) => {
    const [y, m] = ymKey.split("-").map(Number);
    if (!y || !m) return ymKey;
    try {
      return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long" });
    } catch {
      return ymKey;
    }
  };

  const series = useMemo(() => monthlySeries(txs, 6), [txs]);
  const bars = useMemo(() => dailyBars(txs, ym), [txs, ym]);

  const budget = state?.budget || [];
  const txTypes = useMemo(() => {
    const types = new Set<string>();
    for (const t of txs) types.add(txTypeOf(t));
    return Array.from(types).sort();
  }, [txs]);

  const zelleReviewCount = useMemo(
    () =>
      txs.filter(
        (transaction) =>
          transaction.date.startsWith(`${filterYear}-`) &&
          (filterMonth === "all" ||
            transaction.date.startsWith(filterMonth)) &&
          /\bzelle\b/i.test(
            `${transaction.merchant || ""} ${transaction.note || ""}`
          ) &&
          normalizedLedgerCategory(transaction) === "Uncategorized"
      ).length,
    [filterMonth, filterYear, txs]
  );

  /** Owner's hard monthly spending limit */
  const MONTHLY_LIMIT = 500;
  const budgetAnalysis = useMemo(
    () => analyzeSpending(txs, MONTHLY_LIMIT),
    [txs]
  );
  const budgetForecast = useMemo(
    () => forecastSpending(txs, MONTHLY_LIMIT),
    [txs]
  );
  const budgetAlerts = useMemo(
    () =>
      generateBudgetAlerts(
        txs,
        MONTHLY_LIMIT,
        latestScore(creditStore)?.score ?? REAL_CREDIT_SCORE
      ),
    [txs, creditStore]
  );
  const budgetCuts = useMemo(
    () =>
      budgetForecast.overBudget
        ? suggestCuts(budgetAnalysis.currentMonth, budgetForecast.overBy)
        : [],
    [budgetAnalysis, budgetForecast]
  );
  const annualBook = useMemo(
    () => buildAnnualBook(txs, filterYear),
    [txs, filterYear]
  );

  const [subTick, setSubTick] = useState(0);
  const subscriptionScan = useMemo(() => {
    void subTick;
    return applySubPrefs(
      mergeConfirmedSubscriptions(detectSubscriptions(txs))
    );
  }, [txs, subTick]);

  const aiSubscriptionStack = useMemo(() => {
    const plans = subscriptionScan.subs.filter((subscription) =>
      /^(grok|claude code|chatgpt|cursor)$/.test(
        subscription.key.toLowerCase()
      )
    );
    const monthlyTotal =
      Math.round(
        plans.reduce((sum, subscription) => sum + subscription.monthlyCost, 0) *
          100
      ) / 100;
    return {
      plans,
      monthlyTotal,
      yearlyTotal: Math.round(monthlyTotal * 12 * 100) / 100,
    };
  }, [subscriptionScan]);

  useEffect(() => {
    const on = () => setSubTick((n) => n + 1);
    window.addEventListener("wonder-subs-changed", on);
    return () => window.removeEventListener("wonder-subs-changed", on);
  }, []);

  const planRows = useMemo(() => {
    return PLAN_GROUPS.map((g) => {
      const planned = g.cats.reduce((s, c) => {
        const b = budget.find((x) => x.category === c);
        return s + (b?.planned || 0);
      }, 0);
      const spent = g.cats.reduce((s, c) => s + (spentMap[c] || 0), 0);
      return {
        ...g,
        planned,
        spent,
        remaining: planned - spent,
      };
    });
  }, [budget, spentMap]);

  const planPlanned = planRows.reduce((s, r) => s + r.planned, 0);
  const planSpent = planRows.reduce((s, r) => s + r.spent, 0);

  /** Real decision engine — ranks next moves from live data */
  const brief = useMemo(
    () =>
      state
        ? buildSmartBrief(state, ym, planRows, creditReport, booksExtra)
        : buildSmartBrief(
            {
              version: 2,
              accounts: [],
              txs: [],
              budget: [],
              watchlist: [],
              goals: [],
              creditProfile: null,
            },
            ym,
            planRows,
            creditReport,
            booksExtra
          ),
    [state, ym, planRows, creditReport, booksExtra]
  );
  const safeToSpend = brief.safeToSpend;
  const accounting = useMemo(
    () =>
      state
        ? buildAccountingPack(state, accountingPeriod, booksExtra)
        : brief.accounting,
    [state, accountingPeriod, booksExtra, brief.accounting]
  );
  const closeBlockers = accounting.monthlyClose.checks.filter(
    (check) => check.critical && !check.ok
  );
  const periodOpenItems = accounting.review.items.length + closeBlockers.length;
  const businessQuarterOptions = useMemo(
    () => (state ? availableBusinessQuarters(state) : []),
    [state],
  );
  const businessReport = useMemo(
    () =>
      state
        ? buildBusinessQuarterReport(
            state,
            businessQuarter,
            booksExtra,
          )
        : null,
    [state, businessQuarter, booksExtra],
  );

  const copilotCtx: CopilotContext | null = useMemo(
    () =>
      state
        ? {
            state,
            brief,
            subs: subscriptionScan,
            worth,
            worthVerified,
            cash,
            debt,
            income,
            expense,
            cashFlow,
            rate,
            credit: creditReport,
            ym,
          }
        : null,
    [state, brief, subscriptionScan, worth, worthVerified, cash, debt, income, expense, cashFlow, rate, creditReport, ym]
  );

  /** Do TODAY — minutes, not a fake 7-day project */
  const todayPlan = useMemo(
    () =>
      state
        ? buildTodayPlan(state, booksExtra)
        : buildTodayPlan(
            {
              version: 2,
              accounts: [],
              txs: [],
              budget: [],
              watchlist: [],
              goals: [],
              creditProfile: null,
            },
            booksExtra
          ),
    [state, booksExtra]
  );

  // Keep books extras on disk whenever they change
  useEffect(() => {
    saveBooksExtra(booksExtra);
  }, [booksExtra]);

  const flipToday = (id: string) => {
    setBooksExtra((b) => toggleTodayDone(id, b));
  };

  const addPayable = () => {
    const amount = Number(apAmt);
    if (!apWhat.trim() || !apDue || !(amount > 0)) return;
    setBooksExtra((b) => ({
      ...b,
      payables: [
        newPayable({ what: apWhat.trim(), amount, dueDate: apDue }),
        ...b.payables,
      ],
    }));
    setApWhat("");
    setApAmt("");
    setApDue("");
  };

  const addReceivable = () => {
    const amount = Number(arAmt);
    if (!arWho.trim() || !arDue || !(amount > 0)) return;
    setBooksExtra((b) => ({
      ...b,
      receivables: [
        newReceivable({ who: arWho.trim(), amount, dueDate: arDue }),
        ...b.receivables,
      ],
    }));
    setArWho("");
    setArAmt("");
    setArDue("");
  };

  const markPayablePaid = (id: string) => {
    setBooksExtra((b) => ({
      ...b,
      payables: b.payables.map((p) =>
        p.id === id
          ? {
              ...p,
              paid: true,
              paidDate: new Date().toISOString().slice(0, 10),
            }
          : p
      ),
    }));
  };

  const markReceivableReceived = (id: string) => {
    setBooksExtra((b) => ({
      ...b,
      receivables: b.receivables.map((r) =>
        r.id === id
          ? {
              ...r,
              received: true,
              receivedDate: new Date().toISOString().slice(0, 10),
            }
          : r
      ),
    }));
  };

  const onReceiptFile = (file: File | null) => {
    if (!file) return;
    const finish = (dataUrl: string | null, note: string) => {
      setBooksExtra((b) => ({
        ...b,
        receipts: [
          newReceipt({
            name: file.name,
            kind: file.type.includes("pdf")
              ? "pdf"
              : file.type.startsWith("image/")
                ? "screenshot"
                : "other",
            mime: file.type,
            dataUrl,
            note,
          }),
          ...b.receipts,
        ],
      }));
    };
    if (file.size < 400_000) {
      const reader = new FileReader();
      reader.onload = () =>
        finish(
          typeof reader.result === "string" ? reader.result : null,
          ""
        );
      reader.readAsDataURL(file);
    } else {
      finish(null, "Name only (file too large to embed on this device)");
    }
  };

  const doCloseMonth = () => {
    if (filterMonth === "all") return;
    setBooksExtra(closeMonth(ym, booksExtra));
  };

  const doReopenMonth = () => {
    if (filterMonth === "all") return;
    setBooksExtra(reopenMonth(ym, booksExtra));
  };

  const ledger = useMemo(() => {
    let list = [...txs];
    if (reviewFilter) {
      const ids = new Set(reviewFilter.txIds);
      list = list.filter((t) => ids.has(t.id));
    }
    const searching = filterQ.trim().length > 0;
    // A search looks across ALL your books, not just the visible month
    if (!searching) {
      if (filterMonth !== "all") {
        list = list.filter((t) => t.date.startsWith(filterMonth));
      } else {
        list = list.filter((t) => t.date.startsWith(String(filterYear)));
      }
    }
    if (filterKind !== "all") {
      // REV/EXP are economic activity. Transfers and card payments remain
      // visible under All and their own category/type filters, but are never
      // mislabeled as revenue or expense.
      list = list.filter(
        (t) => t.kind === filterKind && !isLedgerMovement(t)
      );
    }
    if (filterTxType !== "all")
      list = list.filter((t) => txTypeOf(t) === filterTxType);
    if (filterCat !== "all") {
      list = list.filter((t) => normalizedLedgerCategory(t) === filterCat);
    }
    if (searching) {
      // Every word must match somewhere: payee, note, category, type,
      // date, or amount ("zelle 300", "chase jul", "8.99" all work)
      const words = filterQ.trim().toLowerCase().split(/\s+/);
      list = list.filter((t) => {
        const hay = [
          t.merchant || "",
          t.note || "",
          t.category || "",
          txTypeOf(t),
          t.date,
          String(t.amount),
          t.amount.toFixed(2),
        ]
          .join(" ")
          .toLowerCase();
        return words.every((w) => hay.includes(w));
      });
    }
    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") cmp = a.date.localeCompare(b.date);
      else if (sortKey === "merchant")
        cmp = (a.merchant || a.note || "").localeCompare(
          b.merchant || b.note || ""
        );
      else if (sortKey === "category") cmp = a.category.localeCompare(b.category);
      else if (sortKey === "kind") cmp = a.kind.localeCompare(b.kind);
      else cmp = a.amount - b.amount;
      return cmp * dir;
    });
    return list;
  }, [
    txs,
    filterMonth,
    filterYear,
    filterKind,
    filterTxType,
    filterCat,
    filterQ,
    reviewFilter,
    sortKey,
    sortDir,
  ]);

  const annualLedgerRows = useMemo(
    () =>
      txs.filter(
        (transaction) =>
          transaction.date.startsWith(String(filterYear)) &&
          !transaction.pending
      ),
    [txs, filterYear]
  );

  /**
   * Accountant month books: every line kept, grouped by YYYY-MM.
   * Summary on top; "..." expands to full detail (no cutoffs, no slice).
   */
  const monthBooks = useMemo(() => {
    const map = new Map<string, FinanceTx[]>();
    for (const t of ledger) {
      const m = (t.date || "").slice(0, 7);
      if (!m || m.length < 7) continue;
      if (!map.has(m)) map.set(m, []);
      map.get(m)!.push(t);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, rows]) => {
        const sorted = [...rows].sort((a, b) => {
          const d = b.date.localeCompare(a.date);
          if (d !== 0) return d;
          if (a.statementOrder != null && b.statementOrder != null) {
            return b.statementOrder - a.statementOrder;
          }
          return (a.merchant || a.note || "").localeCompare(
            b.merchant || b.note || ""
          );
        });
        let moneyIn = 0;
        let moneyOut = 0;
        let movementIn = 0;
        let movementOut = 0;
        let cardPaid = 0;
        const recv = new Map<string, number>();
        const spent = new Map<string, number>();
        for (const t of sorted) {
          const name = (t.merchant || t.note || "Unknown").trim() || "Unknown";
          const category = normalizedLedgerCategory(t);
          if (isLedgerMovement(t)) {
            if (t.kind === "income") movementIn += t.amount;
            else {
              movementOut += t.amount;
              if (category === "Credit card payment") cardPaid += t.amount;
            }
            continue;
          }
          if (t.kind === "income") {
            moneyIn += t.amount;
            recv.set(name, (recv.get(name) || 0) + t.amount);
          } else {
            moneyOut += t.amount;
            spent.set(name, (spent.get(name) || 0) + t.amount);
          }
        }
        const topReceived = [...recv.entries()]
          .map(([name, total]) => ({ name, total }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 8);
        const topSpent = [...spent.entries()]
          .map(([name, total]) => ({ name, total }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 8);
        const fullMonthRows = (state?.txs || []).filter((row) =>
          row.date.startsWith(month)
        );
        const statementClosingBalance =
          [...fullMonthRows]
            .sort(
              (left, right) =>
                (right.statementOrder ?? -1) - (left.statementOrder ?? -1)
            )
            .find(
            (row) =>
              row.statementBalance != null &&
              Number.isFinite(row.statementBalance)
          )?.statementBalance ?? null;
        const creditAccountIds = new Set(
          (state?.accounts || [])
            .filter((account) => account.kind === "credit")
            .map((account) => account.id)
        );
        const hasImportedCardPurchases = fullMonthRows.some(
          (row) =>
            row.kind === "expense" &&
            !!row.accountId &&
            creditAccountIds.has(row.accountId) &&
            !isLedgerMovement(row)
        );
        return {
          month,
          rows: sorted,
          moneyIn,
          moneyOut,
          movementIn,
          movementOut,
          cardPaid,
          net: moneyIn - moneyOut,
          count: sorted.length,
          topReceived,
          topSpent,
          statementClosingBalance,
          cardPurchasesMissing: cardPaid > 0 && !hasImportedCardPurchases,
        };
      });
  }, [ledger, state?.accounts]);

  const monthNetWorthByMonth = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const month of months) map.set(month, null);
    const currentMonth = monthKey();
    if (months.includes(currentMonth) && worthVerified) {
      map.set(currentMonth, worth);
    }
    return map;
  }, [months, worth, worthVerified]);

  const maxBar = useMemo(() => {
    const m = Math.max(1, ...bars.map((b) => Math.abs(b.net)));
    return m;
  }, [bars]);

  useEffect(() => {
    saveWorth(worthStore);
  }, [worthStore]);

  /** Likely transfer pairs — proposals only, applied on click */
  const transferPairs = useMemo(
    () => (state ? detectTransferPairs(state.txs) : []),
    [state]
  );

  function applyPair(pair: TransferPair) {
    patchState((s) => ({ ...s, txs: applyTransferPair(s.txs, pair) }));
    setImportNote(
      `Marked ${pair.outTx.merchant || pair.outTx.note || "pair"} as a transfer — excluded from income & spending.`
    );
  }

  /** Net-worth timeline (12 month-ends; past bank balances reconstructed) */
  const worthSeries = useMemo(
    () =>
      state ? buildWorthSeries(state.accounts, state.txs, worthStore, 12) : [],
    [state, worthStore]
  );
  const worthExplain = useMemo(
    () => explainWorthChange(worthSeries, state?.txs || []),
    [worthSeries, state]
  );
  const composition = useMemo(
    () => (state ? worthComposition(state.accounts, worthStore) : null),
    [state, worthStore]
  );
  const trueIncome = useMemo(
    () => (state ? monthTrueIncome(state.txs, ym) : 0),
    [state, ym]
  );
  const trueSpend = useMemo(
    () => (state ? monthTrueSpend(state.txs, ym) : 0),
    [state, ym]
  );
  function addValuationItem() {
    const value = Number(valDraft.value);
    if (!valDraft.name.trim() || !Number.isFinite(value) || value <= 0) {
      setImportNote("A valuation needs a name and a positive value.");
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const item = newValuationItem({
      name: valDraft.name.trim(),
      side: valDraft.side,
      assetClass: valDraft.assetClass,
      points: [
        {
          date: today,
          value: Math.round(value * 100) / 100,
          source: valDraft.source.trim() || "manual entry",
          confidence: valDraft.confidence,
        },
      ],
    });
    setWorthStore((s) => ({ ...s, items: [...s.items, item] }));
    setValDraft({
      name: "",
      side: "asset",
      assetClass: "other",
      value: "",
      source: "",
      confidence: "medium",
    });
  }

  function addValuationPoint(itemId: string) {
    const draft = pointDrafts[itemId];
    const value = Number(draft?.value);
    if (!draft || !Number.isFinite(value) || value <= 0) {
      setImportNote("Enter a positive value to record a new valuation point.");
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    setWorthStore((s) => ({
      ...s,
      items: s.items.map((it) =>
        it.id === itemId
          ? {
              ...it,
              points: [
                ...it.points.filter((pt) => pt.date !== today),
                {
                  date: today,
                  value: Math.round(value * 100) / 100,
                  source: draft.source.trim() || "manual entry",
                  confidence: "medium" as const,
                },
              ].sort((a, b) => a.date.localeCompare(b.date)),
            }
          : it
      ),
    }));
    setPointDrafts((d) => ({ ...d, [itemId]: { value: "", source: "" } }));
  }

  function removeValuationItem(itemId: string) {
    setWorthStore((s) => ({
      ...s,
      items: s.items.filter((i) => i.id !== itemId),
    }));
  }

  function downloadAnnualCsv() {
    const csv = annualBookCsv(annualBook);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wonder-books-${annualBook.year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadBusinessCsv() {
    if (!businessReport) return;
    const blob = new Blob([businessQuarterReportCsv(businessReport)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `wonder-quarterly-money-review-${businessReport.quarter.key}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function reviewBusinessLedger() {
    if (!businessReport) return;
    setReviewFilter({
      label: `${businessReport.quarter.label} supporting ledger`,
      txIds: businessReport.supportingTransactionIds,
    });
    setFilterQ("");
    setFilterCat("all");
    setFilterKind("all");
    setFilterTxType("all");
    setFilterYear(Number(businessReport.quarter.key.slice(0, 4)));
    setFilterMonth("all");
    setTab("transactions");
  }

  function recordCredit() {
    const score = Number(scoreInput);
    if (!Number.isFinite(score) || score < 300 || score > 850) {
      setImportNote("Enter a valid credit score (300–850).");
      return;
    }
    const updated = recordCreditScore(creditStore, score);
    setCreditStore(updated);
    setScoreInput("");
    saveCreditTracking(updated);
    setImportNote("Credit score recorded.");
  }

  function patchCreditProfile(patch: Partial<CreditProfile>) {
    patchState((s) => ({
      ...s,
      creditProfile: {
        ...DEFAULT_CREDIT_PROFILE,
        ...(s.creditProfile || {}),
        ...patch,
      },
    }));
  }

  function onLedgerPaste(e: ClipboardEvent<HTMLDivElement>) {
    const text = e.clipboardData.getData("text/plain");
    if (!text || (!text.includes("\t") && !text.includes("\n"))) return;
    e.preventDefault();
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const added: FinanceTx[] = [];
    for (const line of lines) {
      const cols =
        line.split("\t").length > 1 ? line.split("\t") : line.split(",");
      const dateRaw = (cols[0] || "").trim();
      const merchant = (cols[1] || "").trim();
      const amountRaw = (cols[2] || "").replace(/[$,]/g, "").trim();
      const amount = Math.abs(Number(amountRaw));
      if (!amount || Number.isNaN(amount)) continue;
      let date = dateRaw;
      if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(dateRaw)) {
        const [mm, dd, yy] = dateRaw.split("/");
        const y = yy.length === 2 ? `20${yy}` : yy;
        date = `${y}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        date = new Date().toISOString().slice(0, 10);
      }
      const isNeg = amountRaw.trim().startsWith("-") || Number(amountRaw) < 0;
      const kind: TxKind = isNeg ? "expense" : "income";
      const categoryText = `${cols[1] || ""} ${cols[2] || ""}`;
      added.push(
        newTx({
          date,
          merchant: merchant || "Pasted",
          note: merchant || "Pasted",
          amount,
          category: normalizeImportedTransactionCategory(
            (cols[3] || "Other").trim() || "Other",
            categoryText,
            kind
          ),
          categoryReviewed: zellePurposeCategory(categoryText, kind) != null,
          kind,
          source: "import",
        })
      );
    }
    if (!added.length) {
      setImportNote("Paste failed — use Date · Merchant · Amount · Category");
      return;
    }
    patchState((s) => {
      const merged = mergeTxs(s.txs, added);
      return { ...s, txs: merged.txs };
    });
    setImportNote(`Pasted ${added.length} rows`);
  }

  const watchlist = state?.watchlist;
  const loadQuotes = useCallback(async () => {
    if (!watchlist || !watchlist.length) return;
    try {
      const q = watchlist.map((s) => encodeURIComponent(s)).join(",");
      const res = await fetch(`/api/market/quote?symbols=${q}`);
      if (!res.ok) return;
      const data = (await res.json()) as { quotes?: Record<string, unknown>[] };
      setQuotes((data.quotes || []).map(mapQuote));
    } catch {
      /* optional */
    }
  }, [watchlist]);

  useEffect(() => {
    void loadQuotes();
  }, [loadQuotes]);

  function patchAccount(id: string, patch: Partial<FinanceAccount>) {
    patchState((s) => ({
      ...s,
      accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  }

  function removeAccount(id: string) {
    patchState((s) => ({
      ...s,
      accounts: s.accounts.filter((a) => a.id !== id),
    }));
  }

  function addAccount() {
    patchState((s) => ({
      ...s,
      accounts: [...s.accounts, newAccount({ name: "New account" })],
    }));
  }

  /** Zero typing — plan built from your real spend history */
  function autoBuildPlan() {
    patchState((s) => ({
      ...s,
      budget: autoBudgetFromHistory(s.txs, s.budget, 3),
    }));
    setImportNote(
      "Plan auto-built from your last ~3 months of spending. No typing."
    );
    setTab("plan");
  }

  function planMatchLastMonth() {
    patchState((s) => ({
      ...s,
      budget: budgetFromLastMonth(s.txs, s.budget),
    }));
    setImportNote("Plan matched last month’s actual spend.");
    setTab("plan");
  }

  function planTighten() {
    patchState((s) => ({
      ...s,
      budget: scaleBudget(s.budget, 0.9),
    }));
    setImportNote("Plan tightened 10% across categories.");
  }

  function planLoosen() {
    patchState((s) => ({
      ...s,
      budget: scaleBudget(s.budget, 1.1),
    }));
    setImportNote("Plan loosened 10% across categories.");
  }

  function clearPlan() {
    if (
      !window.confirm(
        "Clear every monthly plan amount? Your transactions will stay untouched."
      )
    ) {
      return;
    }
    patchState((s) => ({
      ...s,
      budget: s.budget.map((b) => ({ ...b, planned: 0 })),
    }));
    setImportNote("Monthly plan cleared. Transactions were not changed.");
  }

  function nudgeBudget(category: string, delta: number) {
    patchState((s) => {
      const cur = s.budget.find((b) => b.category === category)?.planned || 0;
      const next = Math.max(0, Math.ceil((cur + delta) / 5) * 5);
      const exists = s.budget.some((b) => b.category === category);
      return {
        ...s,
        budget: exists
          ? s.budget.map((b) =>
              b.category === category ? { ...b, planned: next } : b
            )
          : [...s.budget, { category, planned: next }],
      };
    });
  }


  function addGoal() {
    if (!goalDraft.name.trim() || goalDraft.target <= 0) return;
    patchState((s) => ({
      ...s,
      goals: [...(s.goals || []), { ...goalDraft, id: newGoal().id }],
    }));
    setGoalDraft(newGoal({ name: "", target: 1000, saved: 0 }));
  }

  function patchGoal(
    id: string,
    patch: Partial<{ name: string; target: number; saved: number }>
  ) {
    patchState((s) => ({
      ...s,
      goals: (s.goals || []).map((g) => (g.id === id ? { ...g, ...patch } : g)),
    }));
  }

  function removeGoal(id: string) {
    patchState((s) => ({
      ...s,
      goals: (s.goals || []).filter((g) => g.id !== id),
    }));
  }

  function removeTx(id: string) {
    patchState((s) => ({ ...s, txs: s.txs.filter((t) => t.id !== id) }));
  }

  function patchTx(id: string, patch: Partial<FinanceTx>) {
    patchState((s) => ({
      ...s,
      txs: s.txs.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }

  function onCsvFile(file: File | null) {
    if (!file || !state) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const existing = fingerprintsFromTxs(state.txs);
      const isOfx =
        /\.(ofx|qfx)$/i.test(file.name || "") || looksLikeOfx(text);
      const result = isOfx
        ? importOfx(text, {
            existingFingerprints: existing,
            accountId: state.accounts[0]?.id || undefined,
          })
        : parseBankCsv(text, {
            existingFingerprints: existing,
            accountId: state.accounts[0]?.id || undefined,
          });
      if (result.errors.length && !result.added.length) {
        setImportNote(result.errors.join(" · "));
        return;
      }
      patchState((s) => {
        const merged = mergeTxs(s.txs, result.added);
        return { ...s, txs: merged.txs };
      });
      setImportNote(
        `Imported ${result.added.length} new · skipped ${result.skipped} duplicates`
      );
      setTab("transactions");
    };
    reader.readAsText(file);
  }

  function downloadCsv() {
    if (!state) return;
    const csv = exportLedgerCsv(state.txs);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wonder-finance-${monthKey()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function answerMoney(q: string) {
    if (!q.trim() || !state) return;
    setAskA(
      answerFromBrief(q, brief, {
        worth,
        worthVerified,
        cash,
        debt,
        income,
        expense,
        cashFlow,
        rate,
        credit: creditReport,
        txCount: state.txs.length,
      })
    );
  }

  function runSmartAction(actionId: string, tab?: TabId) {
    if (actionId === "import" || actionId === "import-tx") {
      fileRef.current?.click();
      return;
    }
    if (actionId === "auto-plan") {
      autoBuildPlan();
      return;
    }
    if (actionId === "reinvest-rate-low") {
      planTighten();
      setTab("plan");
      return;
    }
    if (actionId === "need-invest-acct") {
      const hasInvest = state?.accounts.some((a) => a.kind === "invest");
      if (!hasInvest) {
        patchState((s) => ({
          ...s,
          accounts: [
            ...s.accounts,
            newAccount({ name: "Invest", kind: "invest", balance: 0 }),
          ],
        }));
        setImportNote("Added an Invest account. Set its current balance.");
      }
      setTab("accounts");
      return;
    }
    if (
      actionId.startsWith("tax-") ||
      actionId.startsWith("adv-") ||
      actionId === "runway" ||
      actionId === "survival-floor"
    ) {
      setCopilotOpen(true);
      return;
    }
    if (tab && tab !== "overview") {
      setTab(tab);
      return;
    }
    setTab("transactions");
  }

  function runAccountantReview(itemId: string) {
    const item = accounting.review.items.find((candidate) => candidate.id === itemId);
    if (!item) return;
    if (item.id === "review-import") {
      fileRef.current?.click();
      return;
    }
    if (item.id === "review-plan") {
      autoBuildPlan();
      setTab("plan");
      return;
    }
    if (item.txIds?.length) {
      setReviewFilter({ label: item.title, txIds: item.txIds });
      setFilterQ("");
      setFilterCat("all");
      setFilterKind("all");
      setFilterTxType("all");
      setFilterYear(Number(ym.slice(0, 4)));
      setFilterMonth(ym);
      setTab("transactions");
      return;
    }
    if (item.destination === "overview") {
      setBooksExpanded(true);
      window.requestAnimationFrame(() => {
        document
          .getElementById("wd-accounting-workspace")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }
    setTab(item.destination);
  }

  function reviewMonthlyClose() {
    setBooksExpanded(true);
    window.requestAnimationFrame(() => {
      document
        .getElementById("wd-monthly-close")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function plaidSandboxConnect() {
    setPlaidBusy(true);
    setPlaidNote("Connecting sandbox bank…");
    try {
      const tokRes = await fetch("/api/finance/plaid/sandbox-public-token", {
        method: "POST",
      });
      const tok = (await tokRes.json()) as {
        public_token?: string;
        error?: string;
      };
      if (!tok.public_token) throw new Error(tok.error || "No sandbox token");
      const exRes = await fetch("/api/finance/plaid/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_token: tok.public_token }),
      });
      const ex = (await exRes.json()) as {
        item_id?: string;
        institutionName?: string;
        error?: string;
      };
      if (!ex.item_id) throw new Error(ex.error || "Exchange failed");
      await plaidSync(ex.item_id, ex.institutionName || "Sandbox Bank");
    } catch (e) {
      setPlaidNote(e instanceof Error ? e.message : "Plaid sandbox failed");
    } finally {
      setPlaidBusy(false);
    }
  }

  async function plaidSync(itemId?: string, institutionName?: string) {
    if (!state) return;
    setPlaidBusy(true);
    setPlaidNote("Syncing…");
    try {
      const res = await fetch("/api/finance/plaid/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: itemId || state.plaidMeta?.itemId,
          institutionName:
            institutionName || state.plaidMeta?.institutionName,
        }),
      });
      const data = (await res.json()) as {
        accounts?: Array<{
          plaidAccountId: string;
          name: string;
          mask?: string | null;
          kind: AccountKind;
          balance: number;
          institution?: string;
        }>;
        transactions?: Array<{
          externalId: string;
          date: string;
          kind: TxKind;
          amount: number;
          merchant: string;
          note: string;
          category: string;
          accountId: string;
          pending?: boolean;
          source: "plaid";
        }>;
        error?: string;
        item_id?: string;
      };
      if (!res.ok) throw new Error(data.error || "Sync failed");
      patchState((s) => {
        let accounts = [...s.accounts];
        for (const pa of data.accounts || []) {
          const idx = accounts.findIndex(
            (a) => a.plaidAccountId === pa.plaidAccountId
          );
          const row: FinanceAccount = {
            id:
              idx >= 0
                ? accounts[idx].id
                : `acc-plaid-${pa.plaidAccountId.slice(0, 8)}`,
            name: pa.name,
            kind: pa.kind,
            balance: pa.balance,
            balanceVerified: true,
            institution: pa.institution || institutionName || "Bank",
            plaidAccountId: pa.plaidAccountId,
            mask: pa.mask || null,
            lastSyncAt: new Date().toISOString(),
          };
          if (idx >= 0) accounts[idx] = row;
          else accounts.push(row);
        }
        const incoming: FinanceTx[] = (data.transactions || []).map((t) => {
          const acc =
            accounts.find((a) => a.plaidAccountId === t.accountId) || null;
          const categoryText = `${t.merchant || ""} ${t.note || ""}`;
          return newTx({
            date: t.date,
            kind: t.kind,
            amount: t.amount,
            category: normalizeImportedTransactionCategory(
              t.category,
              categoryText,
              t.kind
            ),
            categoryReviewed:
              zellePurposeCategory(categoryText, t.kind) != null,
            note: t.note || t.merchant,
            merchant: t.merchant,
            accountId: acc?.id || null,
            source: "plaid",
            externalId: t.externalId,
            pending: t.pending,
          });
        });
        const merged = mergeTxs(s.txs, incoming);
        return {
          ...s,
          accounts,
          txs: merged.txs,
          plaidMeta: {
            itemId: data.item_id || itemId || s.plaidMeta?.itemId,
            institutionName:
              institutionName || s.plaidMeta?.institutionName || "Bank",
            linkedAt: new Date().toISOString(),
          },
        };
      });
      setPlaidNote(
        `Synced ${(data.accounts || []).length} accounts · ${(data.transactions || []).length} txs`
      );
      setTab("transactions");
    } catch (e) {
      setPlaidNote(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setPlaidBusy(false);
    }
  }

  // Only if user already set up a vault earlier — otherwise skip straight to ledger
  if (vaultGate === "unlock" || !state) {
    return (
      <div className="wd">
        <div className="wd-main">
          <section className="wd-vault" aria-label="Encrypted finance vault">
            <p className="wd-kicker">Encrypted vault</p>
            <h1>Unlock your books</h1>
            <p className="wd-vault-copy">
              You set a passphrase before. Enter it to open the ledger. (Encryption
              is optional — new setups open without a lock.)
            </p>
            <label className="wd-vault-label">
              Passphrase
              <input
                type="password"
                autoComplete="current-password"
                value={vaultPass}
                onChange={(e) => setVaultPass(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void onUnlockVault();
                }}
                placeholder="Your vault passphrase"
              />
            </label>
            {vaultErr ? <p className="wd-vault-err">{vaultErr}</p> : null}
            <button
              type="button"
              className="wd-btn wd-btn-primary"
              disabled={vaultBusy}
              onClick={() => void onUnlockVault()}
            >
              {vaultBusy ? "Working…" : "Unlock ledger"}
            </button>
            <button
              type="button"
              className="wd-btn"
              style={{ marginLeft: 12 }}
              onClick={() => {
                // Escape hatch: open plain books if any; vault stays for later
                lockVault();
                {
                  const plain = loadFinance();
                  seedFinanceUndoBaseline(plain);
                  setState(plain);
                }
                setVaultGate("ready");
                setVaultErr("");
                setVaultPass("");
              }}
            >
              Use without vault
            </button>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="wd">
      {/* Single column — no second sidebar. Tabs live in the page like Fitness. */}
      <div className="wd-main">
        {/* One row: section tabs left · actions right (no big duplicate Ledger title) */}
        <nav className="wd-subnav wd-subnav-bar" aria-label="Finance sections">
          <div className="wd-subnav-left">
            {NAV.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`wd-subnav-link${tab === n.id ? " is-active" : ""}`}
                onClick={() => {
                  if (n.id === "transactions") setReviewFilter(null);
                  setTab(n.id);
                }}
              >
                {n.label}
              </button>
            ))}
          </div>
          <div className="wd-subnav-right">
            <button
              type="button"
              className={`wd-subnav-link wd-quant-open${copilotOpen ? " is-active" : ""}`}
              onClick={() => setCopilotOpen(true)}
              title="Open quant desk — ledger math + Mel"
            >
              Quant desk
            </button>
            <button
              type="button"
              className="wd-subnav-link"
              onClick={() => fileRef.current?.click()}
            >
              Import
            </button>
            <button
              type="button"
              className="wd-subnav-link"
              onClick={downloadCsv}
            >
              Export books
            </button>
            {hasEncryptedVault() && isVaultUnlocked() ? (
              <button
                type="button"
                className="wd-subnav-link"
                onClick={onLockNow}
                title="Lock vault"
              >
                Lock
              </button>
            ) : null}
          </div>
        </nav>
        {importNote ? <p className="wd-note wd-top-note">{importNote}</p> : null}
        {saveErr ? (
          <p className="wd-note wd-top-note wd-vault-err">{saveErr}</p>
        ) : null}

        <input
          ref={fileRef}
          type="file"
          accept=".csv,.ofx,.qfx,text/csv"
          hidden
          onChange={(e) => onCsvFile(e.target.files?.[0] || null)}
        />

        {tab === "business" && businessReport ? (
          <BusinessReport
            report={businessReport}
            availableQuarters={businessQuarterOptions}
            selectedQuarter={businessQuarter}
            onQuarterChange={setBusinessQuarter}
            onExport={downloadBusinessCsv}
            onPrint={() => window.print()}
            onReviewLedger={reviewBusinessLedger}
          />
        ) : null}

        {/* ════════ BOOKS — capital command (not budget theater) ════════ */}
        {tab === "overview" ? (
          <div className={`wd-overview${booksExpanded ? " is-expanded" : ""}`}>
            <AllLedgerCharts rows={txs} />
            <section className="wd-panel wd-action-board" aria-label="Finance actions">
              <div className="wd-action-board-head">
                <div>
                  <p className="wd-section-kicker">
                    Accountant review · {accountingPeriod}
                  </p>
                  <h2>
                    {accounting.monthlyClose.locked
                      ? "Period is closed"
                      : periodOpenItems === 0 &&
                          accounting.monthlyClose.readyToClose
                        ? "Period is close-ready"
                        : `${periodOpenItems} control${
                            periodOpenItems === 1 ? "" : "s"
                          } ${periodOpenItems === 1 ? "needs" : "need"} attention`}
                  </h2>
                  <p>
                    Posted evidence, control gaps, and decisions from the live
                    ledger—ordered by what blocks trustworthy statements.
                  </p>
                </div>
                <span
                  className={`wd-chip wd-review-status is-${
                    closeBlockers.length
                      ? "blocked"
                      : accounting.review.status
                  }`}
                >
                  Close {accounting.monthlyClose.score}/100
                </span>
              </div>

              <div className="wd-accountant-metrics" aria-label="Period facts">
                <div>
                  <span>Operating income</span>
                  <strong className="is-pos">
                    {moneyCents(accounting.statements.pnl.income)}
                  </strong>
                </div>
                <div>
                  <span>Operating spend</span>
                  <strong className="is-neg">
                    {moneyCents(accounting.statements.pnl.expenseTotal)}
                  </strong>
                </div>
                <div>
                  <span>Net operating</span>
                  <strong
                    className={
                      accounting.statements.pnl.netOperating < 0
                        ? "is-neg"
                        : "is-pos"
                    }
                  >
                    {moneyCents(accounting.statements.pnl.netOperating)}
                  </strong>
                </div>
                <div>
                  <span>Cash movement</span>
                  <strong
                    className={
                      accounting.statements.cashFlow.netChange < 0
                        ? "is-neg"
                        : "is-pos"
                    }
                  >
                    {moneyCents(accounting.statements.cashFlow.netChange)}
                  </strong>
                </div>
                <div>
                  <span>Balance-sheet equity</span>
                  <strong>
                    {accounting.statements.balanceSheet.bankBalancesAvailable
                      ? moneyCents(accounting.statements.balanceSheet.equity)
                      : "Unavailable"}
                  </strong>
                </div>
                <div>
                  <span>Close control</span>
                  <strong>{accounting.monthlyClose.score}/100</strong>
                </div>
                <div>
                  <span>Posted evidence</span>
                  <strong>
                    {accounting.review.postedLines}/{accounting.review.periodLines}
                  </strong>
                </div>
                <div>
                  <span>Last activity</span>
                  <strong>
                    {accounting.review.lastActivityDate
                      ? formatDateMDY(accounting.review.lastActivityDate)
                      : "—"}
                  </strong>
                </div>
              </div>

              <div className="wd-accountant-columns">
                <div className="wd-accountant-primary">
                  <section aria-labelledby="wd-period-review-title">
                    <div className="wd-accountant-section-head">
                      <h3 id="wd-period-review-title">Period work queue</h3>
                      <span>{periodOpenItems} open</span>
                    </div>
                    {periodOpenItems ? (
                      <ol className="wd-action-list wd-review-list">
                        {accounting.review.items.slice(0, 7).map((item, index) => (
                          <li
                            key={item.id}
                            className={`wd-action-item wd-sev-${item.severity}`}
                          >
                            <span className="wd-action-index">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <div className="wd-action-copy">
                              <strong>{item.title}</strong>
                              <p>{item.detail}</p>
                            </div>
                            <button
                              type="button"
                              className="wd-btn wd-action-button"
                              onClick={() => runAccountantReview(item.id)}
                            >
                              {item.cta}
                            </button>
                          </li>
                        ))}
                        {closeBlockers.map((check, index) => (
                          <li
                            key={`close-${check.id}`}
                            className="wd-action-item wd-sev-high"
                          >
                            <span className="wd-action-index">
                              {String(
                                accounting.review.items.length + index + 1
                              ).padStart(2, "0")}
                            </span>
                            <div className="wd-action-copy">
                              <strong>{check.label}</strong>
                              <p>{check.detail}</p>
                            </div>
                            <button
                              type="button"
                              className="wd-btn wd-action-button"
                              onClick={reviewMonthlyClose}
                            >
                              Review close
                            </button>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="wd-review-clear">
                        No pending, weak, duplicate, or unassigned period lines.
                        Every required close control has passed.
                      </p>
                    )}
                  </section>

                  <div
                    className="wd-statement-strip"
                    aria-label="Financial statements"
                  >
                    <div>
                      <span>P&amp;L</span>
                      <strong>
                        {moneyCents(accounting.statements.pnl.netOperating)}
                      </strong>
                      <small>
                        {moneyCents(accounting.statements.pnl.income)} in ·{" "}
                        {moneyCents(accounting.statements.pnl.expenseTotal)} out
                      </small>
                    </div>
                    <div>
                      <span>Cash flow</span>
                      <strong>
                        {moneyCents(accounting.statements.cashFlow.netChange)}
                      </strong>
                      <small>
                        Transfers net{" "}
                        {moneyCents(accounting.statements.cashFlow.transfersNet)}
                      </small>
                    </div>
                    <div>
                      <span>Balance sheet</span>
                      <strong>
                        {moneyCents(accounting.statements.balanceSheet.equity)}
                      </strong>
                      <small>
                        Assets{" "}
                        {moneyCents(accounting.statements.balanceSheet.totalAssets)}
                        {" · "}liabilities{" "}
                        {moneyCents(
                          accounting.statements.balanceSheet.totalLiabilities,
                        )}
                      </small>
                    </div>
                  </div>
                </div>

                <aside className="wd-decision-queue" aria-label="Capital decisions">
                  <div className="wd-accountant-section-head">
                    <h3>Decision queue</h3>
                    <span>live model</span>
                  </div>
                  <ol>
                    {brief.actions.slice(0, 4).map((action, index) => (
                      <li key={action.id}>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <div>
                          <strong>{action.title}</strong>
                          <p>{action.detail}</p>
                          <button
                            type="button"
                            className="wd-link"
                            onClick={() => runSmartAction(action.id, action.tab)}
                          >
                            {action.cta.replace(/\s*→\s*$/, "")} →
                          </button>
                        </div>
                      </li>
                    ))}
                  </ol>
                </aside>
              </div>

              <div className="wd-action-footer">
                <button
                  type="button"
                  className="wd-btn wd-btn-primary"
                  onClick={() => setTab("transactions")}
                >
                  Open ledger
                </button>
                <button
                  type="button"
                  className="wd-btn"
                  onClick={() => setTab("plan")}
                >
                  Review plan
                </button>
                <button
                  type="button"
                  className="wd-btn"
                  onClick={() => setCopilotOpen(true)}
                >
                  Ask Mel
                </button>
                <button
                  type="button"
                  className="wd-btn"
                  onClick={() => setTab("business")}
                >
                  Quarterly report
                </button>
                <button
                  type="button"
                  className="wd-btn"
                  onClick={() => setBooksExpanded((open) => !open)}
                >
                  {booksExpanded ? "Hide full books" : "Open full books"}
                </button>
              </div>
            </section>
            {/* Capital first: deploy / keep / runway / invest — reinvest doctrine */}
            <section
              className="wd-panel wd-smart-core wd-capital-cmd"
              aria-label="Capital command"
            >
              <div className="wd-panel-head">
                <h2>Capital</h2>
                <span className="wd-chip">
                  {brief.smart.capital.label} · {brief.smart.capital.score}/100
                </span>
              </div>

              {/* Hero order — what to do with money before lifestyle */}
              <p className="wd-capital-order">
                {brief.reinvest.order || brief.headline}
              </p>
              <p className="wd-muted wd-capital-sub">
                {brief.sub}
                {brief.reinvest.actualRate != null
                  ? ` · Target keep ${Math.round(brief.reinvest.targetRate * 100)}%`
                  : ""}
              </p>

              {/* Deploy now is the founder metric */}
              <div className="wd-capital-hero">
                <div className="wd-capital-hero-main">
                  <span>Deploy to invest</span>
                  <strong
                    className={
                      brief.reinvest.deployNow > 0 ? "is-neg" : "is-pos"
                    }
                  >
                    {money(brief.reinvest.deployNow)}
                  </strong>
                  <em>
                    {brief.reinvest.deployNow > 0
                      ? "Still to move before fun money"
                      : "Reinvest target met this month"}
                  </em>
                </div>
                <div className="wd-capital-hero-side">
                  <div>
                    <span>Keep rate</span>
                    <strong>
                      {brief.reinvest.actualRate == null
                        ? "—"
                        : `${Math.round(brief.reinvest.actualRate * 100)}%`}
                    </strong>
                  </div>
                  <div>
                    <span>Invest book</span>
                    <strong className="is-pos">
                      {money(brief.reinvest.investedBalance)}
                    </strong>
                  </div>
                  <div>
                    <span>Fun after capital</span>
                    <strong>{money(safeToSpend)}</strong>
                  </div>
                </div>
              </div>

              <div className="wd-smart-metrics wd-capital-metrics">
                <div className="wd-smart-metric">
                  <span>Cash</span>
                  <strong>{money(cash)}</strong>
                </div>
                <div className="wd-smart-metric">
                  <span>True runway</span>
                  <strong>
                    {brief.smart.velocity.runwayMonthsTrue > 24
                      ? "24+"
                      : brief.smart.velocity.runwayMonthsTrue.toFixed(1)}
                    <small> mo</small>
                  </strong>
                </div>
                <div className="wd-smart-metric">
                  <span>Days of cash</span>
                  <strong>
                    {brief.smart.velocity.daysOfCash > 200
                      ? "200+"
                      : brief.smart.velocity.daysOfCash}
                  </strong>
                </div>
                <div className="wd-smart-metric">
                  <span>True flow · {ym}</span>
                  <strong
                    className={
                      brief.smart.trueFlow.trueFlow < 0 ? "is-neg" : "is-pos"
                    }
                  >
                    {moneyCents(brief.smart.trueFlow.trueFlow)}
                  </strong>
                </div>
                <div className="wd-smart-metric">
                  <span>True income</span>
                  <strong className="is-pos">
                    {moneyCents(brief.smart.trueFlow.trueIncome)}
                  </strong>
                </div>
                <div className="wd-smart-metric">
                  <span>True spend</span>
                  <strong className="is-neg">
                    {moneyCents(brief.smart.trueFlow.trueSpend)}
                  </strong>
                </div>
                <div className="wd-smart-metric">
                  <span>Net worth</span>
                  <strong className={worthVerified && worth < 0 ? "is-neg" : ""}>
                    {worthVerified ? money(worth) : "Unverified"}
                  </strong>
                </div>
                <div className="wd-smart-metric">
                  <span>Interest drag</span>
                  <strong
                    className={
                      brief.smart.debt.monthlyInterestDrag > 0 ? "is-neg" : ""
                    }
                  >
                    {moneyCents(brief.smart.debt.monthlyInterestDrag)}
                    <small>/mo</small>
                  </strong>
                </div>
              </div>

              {/* Ranked capital moves — engine already built these */}
              {brief.actions.length ? (
                <div className="wd-capital-moves">
                  <h3>Next capital moves</h3>
                  <ul className="wd-alerts wd-smart-signals">
                    {brief.actions.slice(0, 5).map((a) => (
                      <li key={a.id} className={`wd-sev-${a.severity}`}>
                        <div>
                          <strong>{a.title}</strong>
                          <p>{a.detail}</p>
                          <button
                            type="button"
                            className="wd-link"
                            onClick={() =>
                              runSmartAction(a.id, a.tab as TabId | undefined)
                            }
                          >
                            {a.cta} →
                          </button>
                        </div>
                        {a.amount != null ? (
                          <em
                            className={
                              a.severity === "good" ? "is-pos" : "is-neg"
                            }
                          >
                            {money(a.amount)}
                          </em>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {brief.smart.signals.length ? (
                <div className="wd-capital-signals">
                  <h3>Signals</h3>
                  <ul className="wd-alerts wd-smart-signals">
                    {brief.smart.signals.slice(0, 4).map((s) => (
                      <li key={s.id} className={`wd-sev-${s.severity}`}>
                        <div>
                          <strong>{s.title}</strong>
                          <p>{s.detail}</p>
                        </div>
                        {s.metric ? <em>{s.metric}</em> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {brief.smart.anomalies.length ? (
                <div className="wd-smart-anomalies">
                  <h3>Anomalies this month</h3>
                  <ul className="wd-acct-list">
                    {brief.smart.anomalies.map((a) => (
                      <li key={a.id}>
                        {formatDateMDY(a.date)} · <strong>{a.merchant}</strong> ·{" "}
                        {moneyCents(a.amount)}
                        <div className="wd-muted">{a.why}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* Transfer fix loop — one tap, true books stay honest */}
              {transferPairs.length ? (
                <div className="wd-capital-transfers">
                  <h3>Fix transfers · {transferPairs.length}</h3>
                  <p className="wd-muted" style={{ margin: "0 0 8px" }}>
                    Same dollars out and in — mark so they stop inflating spend.
                    Mel: “fix top transfer” or “list transfers”.
                  </p>
                  <ul className="wd-acct-list">
                    {transferPairs.slice(0, 5).map((pr) => (
                      <li key={`${pr.outTx.id}-${pr.inTx.id}`}>
                        {formatDateMDY(pr.outTx.date)} ·{" "}
                        {pr.outTx.merchant || pr.outTx.note} →{" "}
                        {pr.inTx.merchant || pr.inTx.note} ·{" "}
                        <strong>{moneyCents(pr.outTx.amount)}</strong>
                        <span className="wd-muted">
                          {" "}
                          · {Math.round(pr.confidence * 100)}%
                        </span>{" "}
                        <button
                          type="button"
                          className="wd-btn"
                          onClick={() => applyPair(pr)}
                        >
                          Mark as transfer
                        </button>
                      </li>
                    ))}
                  </ul>
                  {transferPairs.length > 1 ? (
                    <button
                      type="button"
                      className="wd-btn wd-btn-primary"
                      style={{ marginTop: 8 }}
                      onClick={() => {
                        patchState((s) => {
                          let txs = s.txs;
                          for (const p of transferPairs.slice(0, 5)) {
                            txs = applyTransferPair(txs, p);
                          }
                          return { ...s, txs };
                        });
                        setImportNote(
                          `Marked ${Math.min(5, transferPairs.length)} transfer pair(s) — excluded from true income & spend.`
                        );
                      }}
                    >
                      Mark top {Math.min(5, transferPairs.length)} as transfers
                    </button>
                  ) : null}
                </div>
              ) : null}
            </section>

            {/* ═══ 14 accounting modules — work first, no chrome ═══ */}
            <section
              id="wd-accounting-workspace"
              className="wd-panel wd-acct-modules"
            >
              <div className="wd-panel-head">
                <h2>Accounting modules (live)</h2>
                <span className="wd-chip">
                  {accounting.modules.filter((m) => m.ok).length}/
                  {accounting.modules.length} ok · {ym}
                </span>
              </div>
              <div className="wd-acct-table-wrap">
                <table className="wd-acct-table">
                  <thead>
                    <tr>
                      <th>Module</th>
                      <th>Status</th>
                      <th className="num">Metric</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounting.modules.map((m) => (
                      <tr key={m.id} className={m.ok ? "" : "is-flag"}>
                        <td>
                          <strong>{m.module}</strong>
                          <span className="wd-acct-dot" data-ok={m.ok ? "1" : "0"}>
                            {m.ok ? "OK" : "FIX"}
                          </span>
                        </td>
                        <td>{m.status}</td>
                        <td className="num">{m.metric}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* P&L + balance sheet numbers (statements module) */}
              <div className="wd-acct-grid">
                <div>
                  <h3>P&amp;L · {accounting.statements.pnl.month}</h3>
                  <ul className="wd-acct-list">
                    <li>
                      Income{" "}
                      <strong>
                        {moneyCents(accounting.statements.pnl.income)}
                      </strong>
                    </li>
                    <li>
                      Operating expense{" "}
                      <strong>
                        {moneyCents(accounting.statements.pnl.expenseTotal)}
                      </strong>
                    </li>
                    <li>
                      Transfers / card pays out{" "}
                      <strong>
                        {moneyCents(accounting.statements.pnl.transfersOut)}
                      </strong>
                    </li>
                    <li>
                      Net operating{" "}
                      <strong
                        className={
                          accounting.statements.pnl.netOperating < 0
                            ? "is-neg"
                            : "is-pos"
                        }
                      >
                        {moneyCents(accounting.statements.pnl.netOperating)}
                      </strong>
                    </li>
                  </ul>
                  {accounting.statements.pnl.expensesByCategory
                    .slice(0, 8)
                    .map((e) => (
                      <div key={e.category} className="wd-muted">
                        {e.category}: {moneyCents(e.amount)}
                      </div>
                    ))}
                </div>
                <div>
                  <h3>Balance sheet</h3>
                  <p className="wd-muted">
                    As of {accounting.statements.balanceSheet.asOf}.{" "}
                    {accounting.statements.balanceSheet.note}
                  </p>
                  <ul className="wd-acct-list">
                    <li>
                      Assets{" "}
                      <strong>
                        {moneyCents(
                          accounting.statements.balanceSheet.totalAssets
                        )}
                      </strong>
                    </li>
                    <li>
                      Liabilities{" "}
                      <strong>
                        {moneyCents(
                          accounting.statements.balanceSheet.totalLiabilities
                        )}
                      </strong>
                    </li>
                    <li>
                      Equity{" "}
                      <strong>
                        {moneyCents(accounting.statements.balanceSheet.equity)}
                      </strong>
                    </li>
                  </ul>
                  <h3 style={{ marginTop: 12 }}>Runway</h3>
                  <p className="wd-muted">{accounting.runway.order}</p>
                  <p>
                    {accounting.runway.runwayMonths > 20
                      ? "20+"
                      : accounting.runway.runwayMonths.toFixed(1)}{" "}
                    months · burn{" "}
                    {moneyCents(accounting.runway.avgMonthlyBurn)}/mo
                  </p>
                  <h3 style={{ marginTop: 12 }}>Recurring ~fixed</h3>
                  <p>
                    ~{moneyCents(accounting.recurring.monthlyEstimate)}/mo
                  </p>
                  <ul className="wd-acct-list">
                    {accounting.recurring.charges.slice(0, 6).map((c) => (
                      <li key={c.merchant}>
                        {c.merchant} · {moneyCents(c.monthlyCost)}/mo ·{" "}
                        {c.cadence} · {c.times}×
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Variance */}
              <h3 id="wd-monthly-close" style={{ marginTop: 16 }}>
                Variance · {accounting.budgetVariance.month}
              </h3>
              <p className="wd-muted">
                {accounting.budgetVariance.basisNote}
              </p>
              {accounting.budgetVariance.lines.length === 0 ? (
                <p className="wd-muted">
                  No plan yet — open Plan tab → Auto-build plan.
                </p>
              ) : (
                <div className="wd-acct-table-wrap">
                  <table className="wd-acct-table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Planned</th>
                        <th>Actual</th>
                        <th>Variance</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounting.budgetVariance.lines.map((l) => (
                        <tr key={l.category}>
                          <td>{l.category}</td>
                          <td>{moneyCents(l.planned)}</td>
                          <td>{moneyCents(l.actual)}</td>
                          <td
                            className={
                              l.variance > 0 ? "is-neg" : "is-pos"
                            }
                          >
                            {l.variance > 0 ? "+" : ""}
                            {moneyCents(l.variance)}
                          </td>
                          <td>{l.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Monthly close checks */}
              <h3 style={{ marginTop: 16 }}>
                {accounting.monthlyClose.periodKind === "year"
                  ? `Annual reporting · ${accountingPeriod}`
                  : `Monthly close · ${accountingPeriod}`}
              </h3>
              <ul className="wd-acct-list">
                {accounting.monthlyClose.checks.map((c) => (
                  <li key={c.id}>
                    {c.ok ? "✓" : "✗"} {c.label} — {c.detail}
                    {c.critical ? " · required" : ""}
                  </li>
                ))}
              </ul>
              {accounting.monthlyClose.periodKind === "month" ? (
                <div className="wd-acct-actions">
                  {accounting.monthlyClose.locked ? (
                    <button
                      type="button"
                      className="wd-btn"
                      onClick={doReopenMonth}
                    >
                      Reopen {accountingPeriod}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="wd-btn wd-btn-primary"
                      onClick={doCloseMonth}
                      disabled={!accounting.monthlyClose.readyToClose}
                      title={
                        accounting.monthlyClose.readyToClose
                          ? "Lock this month"
                          : `Score ${accounting.monthlyClose.score}/100 — every required check must pass`
                      }
                    >
                      Close {accountingPeriod} (
                      {accounting.monthlyClose.score}/100)
                    </button>
                  )}
                  <span className="wd-muted">
                    {accounting.monthlyClose.locked
                      ? "LOCKED"
                      : accounting.monthlyClose.readyToClose
                        ? "Ready"
                        : "Not ready"}
                  </span>
                </div>
              ) : (
                <p className="wd-muted">
                  This is a year-to-date or full-year report. Choose a month
                  above to run and lock its close.
                </p>
              )}

              {/* Payables / receivables / receipts — working inputs */}
              <div className="wd-acct-grid" style={{ marginTop: 16 }}>
                <div>
                  <h3>Payables (what you owe)</h3>
                  <div className="wd-acct-form">
                    <input
                      placeholder="What"
                      value={apWhat}
                      onChange={(e) => setApWhat(e.target.value)}
                    />
                    <input
                      placeholder="Amount"
                      value={apAmt}
                      onChange={(e) => setApAmt(e.target.value)}
                      inputMode="decimal"
                    />
                    <input
                      type="date"
                      value={apDue}
                      onChange={(e) => setApDue(e.target.value)}
                    />
                    <button type="button" className="wd-btn" onClick={addPayable}>
                      Add payable
                    </button>
                  </div>
                  <ul className="wd-acct-list">
                    {accounting.payables.open.map((p) => (
                      <li key={p.id}>
                        {p.what} · {moneyCents(p.amount)} · due{" "}
                        {formatDateMDY(p.dueDate)}{" "}
                        <button
                          type="button"
                          className="wd-link"
                          onClick={() => markPayablePaid(p.id)}
                        >
                          Mark paid
                        </button>
                      </li>
                    ))}
                    {accounting.payables.open.length === 0 ? (
                      <li className="wd-muted">No open payables</li>
                    ) : null}
                  </ul>
                </div>
                <div>
                  <h3>Receivables (owed to you)</h3>
                  <div className="wd-acct-form">
                    <input
                      placeholder="Who"
                      value={arWho}
                      onChange={(e) => setArWho(e.target.value)}
                    />
                    <input
                      placeholder="Amount"
                      value={arAmt}
                      onChange={(e) => setArAmt(e.target.value)}
                      inputMode="decimal"
                    />
                    <input
                      type="date"
                      value={arDue}
                      onChange={(e) => setArDue(e.target.value)}
                    />
                    <button
                      type="button"
                      className="wd-btn"
                      onClick={addReceivable}
                    >
                      Add receivable
                    </button>
                  </div>
                  <ul className="wd-acct-list">
                    {accounting.receivables.open.map((r) => (
                      <li key={r.id}>
                        {r.who} · {moneyCents(r.amount)} · due{" "}
                        {formatDateMDY(r.dueDate)}{" "}
                        <button
                          type="button"
                          className="wd-link"
                          onClick={() => markReceivableReceived(r.id)}
                        >
                          Mark received
                        </button>
                      </li>
                    ))}
                    {accounting.receivables.open.length === 0 ? (
                      <li className="wd-muted">No open receivables</li>
                    ) : null}
                  </ul>
                  <h3 style={{ marginTop: 12 }}>Receipt vault</h3>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) =>
                      onReceiptFile(e.target.files?.[0] || null)
                    }
                  />
                  <ul className="wd-acct-list">
                    {accounting.receipts.items.slice(0, 8).map((r) => (
                      <li key={r.id}>
                        {r.name} · {r.kind}
                        {r.dataUrl ? " · stored" : ""}
                      </li>
                    ))}
                    {accounting.receipts.count === 0 ? (
                      <li className="wd-muted">No receipts yet</li>
                    ) : null}
                  </ul>
                </div>
              </div>
            </section>

            <div className="wd-grid-2">
              {/* Revenue and expense */}
              <section className="wd-panel">
                <div className="wd-panel-head">
                  <h2>Revenue and expense</h2>
                  <span className="wd-muted">{ym}</span>
                </div>
                <div className="wd-chart" aria-hidden>
                  {bars.map((b) => {
                    const h = Math.max(
                      2,
                      Math.round((Math.abs(b.net) / maxBar) * 100)
                    );
                    const up = b.net >= 0;
                    return (
                      <div key={b.day} className="wd-bar-col" title={`${ym}-${String(b.day).padStart(2,"0")}: ${money(b.net)}`}>
                        <div className="wd-bar-track">
                          {b.net !== 0 ? (
                            <i
                              className={up ? "is-in" : "is-out"}
                              style={{ height: `${h}%` }}
                            />
                          ) : (
                            <i className="is-zero" />
                          )}
                        </div>
                        {b.day % 4 === 1 || b.day === 28 ? (
                          <span>{b.day}</span>
                        ) : (
                          <span />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="wd-legend">
                  <span className="is-pos">Income days</span>
                  <span className="is-neg">Spend days</span>
                </div>
              </section>

              <section className="wd-panel" aria-label="3D spend by category">
                <div className="wd-panel-head">
                  <h2>Spend by category · 3D</h2>
                </div>
                <Spend3D txs={state.txs} />
              </section>
            </div>

            <div className="wd-grid-2">
              {/* Your plan */}
              <section className="wd-panel">
                <div className="wd-panel-head">
                  <h2>Your plan</h2>
                  <div className="wd-top-actions">
                    {planPlanned <= 0 ? (
                      <button
                        type="button"
                        className="wd-link"
                        onClick={autoBuildPlan}
                      >
                        Auto-build
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="wd-link"
                      onClick={() => setTab("plan")}
                    >
                      Open plan
                    </button>
                  </div>
                </div>
                <div className="wd-plan-table">
                  <div className="wd-plan-head">
                    <span>Category</span>
                    <span>Planned</span>
                    <span>Spent</span>
                    <span>Left</span>
                  </div>
                  {planRows.map((r) => {
                    const pct =
                      r.planned > 0
                        ? Math.min(100, Math.round((r.spent / r.planned) * 100))
                        : r.spent > 0
                          ? 100
                          : 0;
                    const over = r.planned > 0 && r.spent > r.planned;
                    return (
                      <div key={r.id} className="wd-plan-row">
                        <div className="wd-plan-cat">
                          <strong>{r.label}</strong>
                          <div className="wd-progress">
                            <i
                              className={over ? "is-over" : ""}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        <span>{money(r.planned)}</span>
                        <span>{money(r.spent)}</span>
                        <span className={r.remaining < 0 ? "is-neg" : ""}>
                          {money(r.remaining)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Fun money only after reinvest + buffers */}
              <div className="wd-stack">
                <section className="wd-panel wd-safe">
                  <div className="wd-panel-head">
                    <h2>Fun after reinvest</h2>
                  </div>
                  <p className="wd-safe-num">{money(safeToSpend)}</p>
                  <p className="wd-muted">
                    deploy {money(brief.reinvest.deployNow)} · cash {money(cash)}
                  </p>
                </section>
                <section className="wd-panel">
                  <div className="wd-panel-head">
                    <h2>What the data says</h2>
                  </div>
                  <ul className="wd-learn">
                    <li>
                      Plan health:{" "}
                      <strong>{brief.planHealth}</strong>
                      {planPlanned > 0
                        ? ` · ${money(planSpent)} of ${money(planPlanned)} used`
                        : " · not built yet"}
                    </li>
                    <li>
                      Top leak:{" "}
                      <strong>
                        {brief.topLeak?.merchant || "not enough history"}
                      </strong>
                      {brief.topLeak
                        ? ` · ${money(brief.topLeak.total)} (${brief.topLeak.count}×)`
                        : ""}
                    </li>
                    <li>
                      Savings rate:{" "}
                      <strong>{rate == null ? "—" : `${rate}%`}</strong>
                      {" · "}
                      Projected EOM flow{" "}
                      <strong
                        className={
                          brief.projection.projectedFlow < 0
                            ? "is-neg"
                            : "is-pos"
                        }
                      >
                        {money(brief.projection.projectedFlow)}
                      </strong>
                    </li>
                  </ul>
                </section>
              </div>
            </div>

            {/* Goals rings */}
            <section className="wd-panel">
              <div className="wd-panel-head">
                <h2>Goals</h2>
                <button
                  type="button"
                  className="wd-link"
                  onClick={() => setTab("goals")}
                >
                  Manage
                </button>
              </div>
              {goals.length === 0 ? (
                <p className="wd-muted wd-pad">
                  No goals yet.{" "}
                  <button type="button" className="wd-link" onClick={() => setTab("goals")}>
                    Add one
                  </button>
                </p>
              ) : (
                <div className="wd-goals">
                  {goals.slice(0, 4).map((g) => {
                    const pct =
                      g.target > 0
                        ? Math.min(100, Math.round((g.saved / g.target) * 100))
                        : 0;
                    const r = 36;
                    const c = 2 * Math.PI * r;
                    const offset = c - (pct / 100) * c;
                    return (
                      <div key={g.id} className="wd-goal">
                        <svg viewBox="0 0 88 88" className="wd-ring" aria-hidden>
                          <circle cx="44" cy="44" r={r} className="wd-ring-bg" />
                          <circle
                            cx="44"
                            cy="44"
                            r={r}
                            className="wd-ring-fg"
                            strokeDasharray={c}
                            strokeDashoffset={offset}
                          />
                          <text x="44" y="48" textAnchor="middle">
                            {pct}%
                          </text>
                        </svg>
                        <div>
                          <strong>{g.name}</strong>
                          <p>
                            {money(g.saved)} of {money(g.target)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Recent transactions */}
            <section className="wd-panel">
              <div className="wd-panel-head">
                <h2>Recent transactions</h2>
                <button
                  type="button"
                  className="wd-link"
                  onClick={() => setTab("transactions")}
                >
                  View all
                </button>
              </div>
              <div className="wd-table-wrap">
                <table className="wd-table">
                  <thead>
                    <tr>
                      <th>Merchant</th>
                      <th>Category</th>
                      <th>Date</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.txs.slice(0, 8).map((t) => (
                      <tr key={t.id}>
                        <td>{t.merchant || t.note || "—"}</td>
                        <td>{t.category}</td>
                        <td className="wd-date">{formatDateMDY(t.date)}</td>
                        <td
                          className={`num ${
                            t.kind === "income" ? "is-pos" : "is-neg"
                          }`}
                        >
                          {t.kind === "income" ? "+" : "−"}
                          {moneyExact(t.amount)}
                        </td>
                      </tr>
                    ))}
                    {state.txs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="wd-muted">
                          No transactions — import a bank CSV.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Ask Wonder */}
            <section className="wd-panel wd-ask">
              <div className="wd-panel-head">
                <h2>Ask Wonder about my money</h2>
              </div>
              <div className="wd-ask-row">
                <input
                  value={askQ}
                  onChange={(e) => setAskQ(e.target.value)}
                  placeholder="Can I afford a $1,200 trip in October?"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") answerMoney(askQ);
                  }}
                />
                <button
                  type="button"
                  className="wd-btn wd-btn-primary"
                  onClick={() => answerMoney(askQ)}
                >
                  Ask
                </button>
              </div>
              {askA ? <p className="wd-ask-a">{askA}</p> : null}
              <div className="wd-ask-chips">
                {[
                  "What's my true cash flow?",
                  "Any spend anomalies?",
                  "What's my runway?",
                  "How is my capital score?",
                  "Subscription drag?",
                  "How is my credit?",
                ].map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="wd-chip-btn"
                    onClick={() => {
                      setAskQ(q);
                      answerMoney(q);
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {/* ════════ LEDGER — full lists always, months next to filters ════════ */}
        {tab === "transactions" ? (
          <div className="wd-page">
            {reviewFilter ? (
              <div className="wd-review-filter" role="status">
                <span>
                  Accountant review · <strong>{reviewFilter.label}</strong> ·{" "}
                  {reviewFilter.txIds.length} line
                  {reviewFilter.txIds.length === 1 ? "" : "s"}
                </span>
                <button
                  type="button"
                  className="wd-link"
                  onClick={() => setReviewFilter(null)}
                >
                  Clear review
                </button>
              </div>
            ) : null}
            {transferPairs.length ? (
              <section className="wd-panel" aria-label="Likely transfers">
                <div className="wd-panel-head">
                  <h2>Likely transfers · {transferPairs.length}</h2>
                </div>
                <ul className="wd-acct-list">
                  {transferPairs.slice(0, 6).map((pr) => (
                    <li key={`${pr.outTx.id}-${pr.inTx.id}`}>
                      {formatDateMDY(pr.outTx.date)} · {pr.outTx.merchant || pr.outTx.note}{" "}
                      → {pr.inTx.merchant || pr.inTx.note} ·{" "}
                      <strong>{moneyCents(pr.outTx.amount)}</strong>
                      <span className="wd-muted">
                        {" "}· {pr.reason} · confidence{" "}
                        {Math.round(pr.confidence * 100)}%
                      </span>{" "}
                      <button
                        type="button"
                        className="wd-btn"
                        onClick={() => applyPair(pr)}
                      >
                        Mark as transfer
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <section className="wd-panel">
              {zelleReviewCount > 0 ? (
                <p className="wd-category-review" role="status">
                  <strong>{zelleReviewCount} Zelle import{zelleReviewCount === 1 ? "" : "s"} need a purpose.</strong>{" "}
                  Choose a Category below, or tell Mel “recategorize [payee] to
                  [category].”{" "}
                  <button
                    type="button"
                    className="wd-link"
                    onClick={() => {
                      setFilterKind("all");
                      setFilterCat("Uncategorized");
                    }}
                  >
                    Review now
                  </button>
                </p>
              ) : null}
              {/* One compact filter row — every control is a dropdown */}
              <div className="wd-filters wd-filters-ledger">
                <input
                  type="search"
                  placeholder="Search"
                  value={filterQ}
                  onChange={(e) => setFilterQ(e.target.value)}
                />
                {txTypes.length > 0 ? (
                  <LedgerFilterMenu
                    value={filterTxType}
                    options={txTypes}
                    allLabel="All types"
                    onChange={setFilterTxType}
                  />
                ) : null}
                <LedgerCategoryFilter
                  kind={filterKind}
                  category={filterCat}
                  onChange={(next) => {
                    setFilterKind(next.kind);
                    setFilterCat(next.category);
                  }}
                />
                <select
                  value={filterYear}
                  onChange={(e) => {
                    setFilterYear(Number(e.target.value));
                    setFilterMonth("all");
                  }}
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                {/* Current month first, walking back to January; All year last */}
                <select
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                >
                  {[...months].reverse().map((m) => (
                    <option key={m} value={m}>
                      {monthLabelLong(m)}
                    </option>
                  ))}
                  <option value="all">All {filterYear}</option>
                </select>
              </div>

              {monthBooks.length === 0 ? (
                <p className="wd-muted wd-pad">Import a bank CSV to start.</p>
              ) : null}

              {filterMonth === "all" && monthBooks.length > 0 ? (
                <AllLedgerCharts rows={annualLedgerRows} />
              ) : null}

              {/* Always full list — no ···, no hide */}
              <div
                className="wd-month-books"
                onPaste={onLedgerPaste}
                tabIndex={0}
              >
                {monthBooks.map((book) => {
                  const monthOnly = monthLabelLong(book.month);
                  const yearOnly = book.month.slice(0, 4);
                  const monthNetWorth = monthNetWorthByMonth.get(book.month);
                  return (
                    <section key={book.month} className="wd-month-book">
                      <header className="wd-month-book-head">
                        <div>
                          <h3>
                            {monthOnly}{" "}
                            <span
                              className="wd-muted"
                              style={{ fontWeight: 400 }}
                            >
                              {yearOnly}
                            </span>
                          </h3>
                          <p className="wd-month-io">
                            <span className="wd-io-label">REV</span>
                            <strong className="is-pos">
                              {moneyCents(book.moneyIn)}
                            </strong>
                            <span className="wd-io-gap" />
                            <span className="wd-io-label">EXP</span>
                            <strong className="is-neg">
                              {moneyCents(book.moneyOut)}
                            </strong>
                            <span className="wd-io-gap" />
                            <span className="wd-io-label">CARD PAID</span>
                            <strong>{moneyCents(book.cardPaid)}</strong>
                            <span className="wd-io-gap" />
                            <span className="wd-io-label">CHECKING BAL</span>
                            <strong
                              className={
                                book.statementClosingBalance == null
                                  ? "is-unavailable"
                                  : book.statementClosingBalance >= 0
                                  ? "is-pos"
                                  : "is-neg"
                              }
                              title="Latest bank-supplied Chase checking balance in this month"
                            >
                              {book.statementClosingBalance == null
                                ? "—"
                                : moneyCents(book.statementClosingBalance)}
                            </strong>
                            <span className="wd-io-gap" />
                            <span className="wd-io-label">NET WORTH</span>
                            <strong
                              className={
                                monthNetWorth == null
                                  ? "is-unavailable"
                                  : monthNetWorth >= 0
                                  ? "is-pos"
                                  : "is-neg"
                              }
                              title={
                                monthNetWorth == null
                                  ? "Historical net worth needs statement balance evidence for that month."
                                  : "Current net worth from accounts."
                              }
                            >
                              {monthNetWorth == null
                                ? "—"
                                : moneyCents(monthNetWorth)}
                            </strong>
                          </p>
                          {book.cardPurchasesMissing ? (
                            <p className="wd-muted">
                              Card payments are excluded from EXP. Import the
                              ··5584 card activity to account for the purchases
                              those payments settled.
                            </p>
                          ) : null}
                        </div>
                      </header>

                      <div className="wd-table-wrap wd-month-full">
                        <table className="wd-table wd-edit wd-ledger-table wd-ledger-full">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Payee</th>
                              <th>Category</th>
                              <th className="num">Amount</th>
                              <th className="num">Balance</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {book.rows.map((t) => {
                              const cat = normalizeTransactionCategory(
                                t.category,
                                `${t.merchant || ""} ${t.note || ""}`,
                                t.kind
                              );
                              const payeeValue =
                                cleanMerchant(t.merchant || t.note || "") ||
                                t.merchant ||
                                t.note ||
                                "";
                              return (
                              <tr
                                key={t.id}
                                className={
                                  !cat ||
                                  cat === "Other" ||
                                  cat === "Uncategorized" ||
                                  !(t.merchant || t.note || "").trim()
                                    ? "is-gap"
                                    : undefined
                                }
                              >
                                <td>
                                  <input
                                    type="date"
                                    value={t.date}
                                    onChange={(e) =>
                                      patchTx(t.id, { date: e.target.value })
                                    }
                                  />
                                </td>
                                <td className="wd-payee-cell">
                                  <input
                                    type="text"
                                    className="wd-payee-input"
                                    value={payeeValue}
                                    placeholder="Payee"
                                    title={
                                      (() => {
                                        const type = txTypeOf(t);
                                        return type ? `${type} · edit payee` : "Edit payee";
                                      })()
                                    }
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      // Merchant is the payee line; note stays for bank memo if any
                                      patchTx(t.id, {
                                        merchant: v,
                                        ...(t.merchant ? {} : { note: v }),
                                      });
                                    }}
                                  />
                                </td>
                                <td>
                                  <select
                                    className={`wd-cat-select${
                                      cat === "Uncategorized"
                                        ? " is-review"
                                        : ""
                                    }`}
                                    value={cat}
                                    autoComplete="off"
                                    data-lpignore="true"
                                    data-1p-ignore="true"
                                    data-form-type="other"
                                    onChange={(e) =>
                                      patchTx(t.id, {
                                        category: e.target.value,
                                        categoryReviewed: true,
                                      })
                                    }
                                  >
                                    {categoriesForKind(t.kind).map((c) => (
                                      <option key={c} value={c}>
                                        {c}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="num wd-amt-cell">
                                  <div
                                    className={`wd-amt-inner ${
                                      t.kind === "income" ? "is-pos" : "is-neg"
                                    }`}
                                  >
                                    <span className="wd-amt-sign" aria-hidden>
                                      {t.kind === "income" ? "+" : "-"}
                                    </span>
                                    <span className="wd-amt-prefix" aria-hidden>
                                      $
                                    </span>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      title={
                                        t.kind === "income"
                                          ? "REV - green"
                                          : "EXP - red"
                                      }
                                      className={
                                        t.kind === "income"
                                          ? "wd-amt-input is-pos"
                                          : "wd-amt-input is-neg"
                                      }
                                      value={t.amount ? String(t.amount) : ""}
                                      onChange={(e) => {
                                        // Keep typing fluid — strip $ / commas only
                                        const raw = e.target.value
                                          .replace(/[$,\s]/g, "")
                                          .replace(/[^0-9.]/g, "");
                                        if (raw === "" || raw === ".") {
                                          patchTx(t.id, { amount: 0 });
                                          return;
                                        }
                                        const n = Number(raw);
                                        if (!Number.isFinite(n)) return;
                                        patchTx(t.id, {
                                          amount: Math.max(
                                            0,
                                            Math.round(n * 100) / 100
                                          ),
                                        });
                                      }}
                                    />
                                  </div>
                                </td>
                                {t.statementBalance == null ? (
                                  <td
                                    className="num wd-balance is-unavailable"
                                    title="This source did not include a bank balance for the row."
                                  >
                                    —
                                  </td>
                                ) : (
                                  <td
                                    className={`num wd-balance ${
                                      t.statementBalance < 0 ? "is-neg" : ""
                                    }`}
                                    title="Bank-supplied balance immediately after this transaction"
                                  >
                                    {moneyCents(t.statementBalance)}
                                  </td>
                                )}
                                <td>
                                  <button
                                    type="button"
                                    className="wd-x"
                                    onClick={() => removeTx(t.id)}
                                  >
                                    ×
                                  </button>
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Month visuals — graph + pie under the logs */}
                      <MonthBookCharts
                        rows={book.rows}
                        month={book.month}
                        monthLabel={`${monthOnly} ${yearOnly}`}
                      />
                    </section>
                  );
                })}
              </div>
            </section>
          </div>
        ) : null}

        {/* ════════ PLAN ════════ */}
        {tab === "plan" ? (
          <div className="wd-page">
            {/* Smart budget engine — $500/mo hard limit */}
            <section className="wd-panel" aria-label="Smart budget">
              <div className="wd-panel-head">
                <h2>Budget · ${MONTHLY_LIMIT}/mo</h2>
              </div>

              {/* Big numbers */}
              <div className="wd-stat-grid">
                <div className="wd-stat-tile">
                  <div className="wd-stat-label">Spent this month</div>
                  <div
                    className={`wd-stat-value ${
                      budgetForecast.today > MONTHLY_LIMIT ? "is-neg" : ""
                    }`}
                  >
                    {money(budgetForecast.today)}
                  </div>
                  <div className="wd-stat-sub">
                    {budgetAnalysis.percentOfBudget.toFixed(0)}% of limit
                  </div>
                </div>
                <div className="wd-stat-tile">
                  <div className="wd-stat-label">Daily burn</div>
                  <div className="wd-stat-value">
                    {money(budgetForecast.dailyBurn)}
                  </div>
                  <div className="wd-stat-sub">
                    safe pace {money(MONTHLY_LIMIT / 30)}/day
                  </div>
                </div>
                <div className="wd-stat-tile">
                  <div className="wd-stat-label">Month-end forecast</div>
                  <div
                    className={`wd-stat-value ${
                      budgetForecast.overBudget ? "is-neg" : "is-pos"
                    }`}
                  >
                    {money(budgetForecast.forecastedTotal)}
                  </div>
                  <div className="wd-stat-sub">
                    {budgetForecast.overBudget
                      ? `over by ${money(budgetForecast.overBy)}`
                      : "under limit"}
                  </div>
                </div>
                <div className="wd-stat-tile">
                  <div className="wd-stat-label">Left to spend</div>
                  <div className="wd-stat-value">
                    {money(Math.max(0, MONTHLY_LIMIT - budgetForecast.today))}
                  </div>
                  <div className="wd-stat-sub">
                    {budgetForecast.daysLeftInMonth} days left
                  </div>
                </div>
                <div className="wd-stat-tile">
                  <div className="wd-stat-label">Safe to spend today</div>
                  <div className="wd-stat-value is-pos">
                    {money(budgetForecast.safeToSpendToday)}
                  </div>
                  <div className="wd-stat-sub">
                    stay under ${MONTHLY_LIMIT} at this rate
                  </div>
                </div>
              </div>

              {/* Pace bar */}
              <div className="wd-progress" style={{ marginTop: 12 }}>
                <i
                  className={
                    budgetAnalysis.percentOfBudget > 100 ? "is-over" : ""
                  }
                  style={{
                    width: `${Math.min(100, budgetAnalysis.percentOfBudget)}%`,
                  }}
                />
              </div>

              {/* Alerts */}
              {budgetAlerts.length > 0 ? (
                <ul className="wd-acct-list" style={{ marginTop: 12 }}>
                  {budgetAlerts.map((a, i) => (
                    <li
                      key={i}
                      className={`wd-alert ${
                        a.type === "critical"
                          ? "is-critical"
                          : a.type === "warning"
                            ? "is-warning"
                            : ""
                      }`}
                    >
                      {a.message}
                    </li>
                  ))}
                </ul>
              ) : null}

              {/* Suggested cuts when over pace */}
              {budgetCuts.length > 0 ? (
                <div style={{ marginTop: 12 }}>
                  <h3>Where to cut to stay under ${MONTHLY_LIMIT}</h3>
                  <ul className="wd-acct-list">
                    {budgetCuts.map((c) => (
                      <li key={c.category}>
                        Cut <strong>{money(c.cut)}</strong> from {c.category}
                        <span className="wd-muted"> · {c.reasoning}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>

            {/* Annual books grid — Excel-style, auto-built from ledger */}
            <section className="wd-panel" aria-label="Annual books">
              <div className="wd-panel-head">
                <h2>Annual books · {annualBook.year}</h2>
                <button
                  type="button"
                  className="wd-btn"
                  onClick={downloadAnnualCsv}
                >
                  Export CSV
                </button>
              </div>

              {/* Income vs Expenses bar + split pie */}
              <div
                style={{
                  display: "flex",
                  gap: 24,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <svg
                  width={220}
                  height={180}
                  viewBox="0 0 220 180"
                  className="wd-chart-frame"
                  style={{ maxWidth: 220 }}
                >
                  {(() => {
                    const inc = annualBook.income.annualTotal;
                    const exp = annualBook.expenses.annualTotal;
                    const max = Math.max(inc, exp, 1);
                    const hInc = (inc / max) * 120;
                    const hExp = (exp / max) * 120;
                    return (
                      <>
                        <rect x={40} y={150 - hInc} width={60} height={hInc} fill="#1f6f8b" />
                        <rect x={120} y={150 - hExp} width={60} height={hExp} fill="#e8743b" />
                        <text x={70} y={142 - hInc} fontSize={11} textAnchor="middle">
                          {money(inc)}
                        </text>
                        <text x={150} y={142 - hExp} fontSize={11} textAnchor="middle">
                          {money(exp)}
                        </text>
                        <text x={70} y={168} fontSize={12} textAnchor="middle">
                          Income
                        </text>
                        <text x={150} y={168} fontSize={12} textAnchor="middle">
                          Expenses
                        </text>
                      </>
                    );
                  })()}
                </svg>
                <InteractivePieChart
                  size={196}
                  holeRatio={0.64}
                  showLegend
                  className="wd-annual-donut"
                  centerPrimary={money(Math.abs(annualBook.potentialToSave))}
                  centerSecondary={
                    annualBook.potentialToSave >= 0
                      ? "available to save"
                      : "over income"
                  }
                  formatValue={(v, frac) =>
                    `${money(v)} · ${(frac * 100).toFixed(0)}%`
                  }
                  slices={
                    annualBook.potentialToSave >= 0
                      ? [
                          {
                            name: "Spent",
                            value: annualBook.expenses.annualTotal,
                            color: "#f59e7a",
                          },
                          {
                            name: "Available to save",
                            value: annualBook.potentialToSave,
                            color: "#158f72",
                          },
                        ].filter((s) => s.value > 0)
                      : [
                          {
                            name: "Income",
                            value: annualBook.income.annualTotal,
                            color: "#3b82a0",
                          },
                          {
                            name: "Over income",
                            value: Math.abs(annualBook.potentialToSave),
                            color: "#dc5b50",
                          },
                        ].filter((s) => s.value > 0)
                  }
                />
              </div>

              {/* The grid itself */}
              {(["income", "savings", "expenses"] as const).map((key) => {
                const section = annualBook[key];
                if (!section.rows.length) return null;
                return (
                  <div key={key} className="wd-acct-table-wrap" style={{ marginTop: 16 }}>
                    <table className="wd-acct-table" style={{ fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ minWidth: 140 }}>{section.title}</th>
                          {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m) => (
                            <th key={m} className="num">{m}</th>
                          ))}
                          <th className="num">Annual</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.rows.map((row) => (
                          <tr key={row.label}>
                            <td title={row.label}>{row.label}</td>
                            {row.monthly.map((v, m) => (
                              <td key={m} className="num">
                                {v ? money(v) : "–"}
                              </td>
                            ))}
                            <td className="num"><strong>{money(row.annual)}</strong></td>
                          </tr>
                        ))}
                        <tr>
                          <td><strong>{section.title} total</strong></td>
                          {section.monthlyTotals.map((v, m) => (
                            <td key={m} className="num">
                              <strong>{v ? money(v) : "–"}</strong>
                            </td>
                          ))}
                          <td className="num"><strong>{money(section.annualTotal)}</strong></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })}

              {/* Net row */}
              <div className="wd-acct-table-wrap" style={{ marginTop: 16 }}>
                <table className="wd-acct-table" style={{ fontSize: 12 }}>
                  <tbody>
                    <tr>
                      <td style={{ minWidth: 140 }}>
                        <strong>Net (income − expenses)</strong>
                      </td>
                      {annualBook.netByMonth.map((v, m) => (
                        <td
                          key={m}
                          className={`num ${v >= 0 ? "is-pos" : "is-neg"}`}
                        >
                          {v ? money(v) : "–"}
                        </td>
                      ))}
                      <td
                        className={`num ${
                          annualBook.potentialToSave >= 0 ? "is-pos" : "is-neg"
                        }`}
                      >
                        <strong>{money(annualBook.potentialToSave)}</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="wd-panel">
              <div className="wd-panel-head">
                <h2>Monthly plan · {ym}</h2>
                <span className="wd-muted">
                  {planPlanned > 0
                    ? `${money(planSpent)} of ${money(planPlanned)} planned`
                    : `${money(planSpent)} spent · no plan yet`}
                </span>
              </div>

              {/* Zero typing — big automation buttons */}
              <div className="wd-auto-bar">
                <button
                  type="button"
                  className="wd-btn wd-btn-primary"
                  onClick={autoBuildPlan}
                  disabled={state.txs.length === 0}
                >
                  Auto-build from my spending
                </button>
                <button
                  type="button"
                  className="wd-btn"
                  onClick={planMatchLastMonth}
                  disabled={state.txs.length === 0}
                >
                  Match last month
                </button>
                <button
                  type="button"
                  className="wd-btn"
                  onClick={planTighten}
                  disabled={planPlanned <= 0}
                >
                  Tighten −10%
                </button>
                <button
                  type="button"
                  className="wd-btn"
                  onClick={planLoosen}
                  disabled={planPlanned <= 0}
                >
                  Loosen +10%
                </button>
                <button
                  type="button"
                  className="wd-btn"
                  onClick={clearPlan}
                  disabled={planPlanned <= 0}
                >
                  Clear plan
                </button>
              </div>

              {state.budget.map((b) => {
                const spent = spentMap[b.category] || 0;
                const pct =
                  b.planned > 0
                    ? Math.min(100, Math.round((spent / b.planned) * 100))
                    : 0;
                const over = b.planned > 0 && spent > b.planned;
                const unplanned = b.planned <= 0;
                return (
                  <div
                    key={b.category}
                    className={`wd-budget-row${unplanned ? " is-unplanned" : ""}${over ? " is-over" : ""}`}
                  >
                    <div className="wd-budget-main">
                      <div className="wd-budget-heading">
                        <strong>{b.category}</strong>
                        <span>
                          {money(spent)} spent
                          {b.planned > 0 ? ` of ${money(b.planned)}` : ""}
                        </span>
                      </div>
                      <div className="wd-progress">
                        <i
                          className={over ? "is-over" : ""}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <em className={unplanned ? "is-unplanned" : undefined}>
                        {unplanned
                          ? "No plan yet"
                          : over
                            ? `${money(spent - b.planned)} over plan`
                            : `${Math.max(0, 100 - pct)}% remaining`}
                      </em>
                    </div>
                    <div className="wd-nudge">
                      <button
                        type="button"
                        className="wd-btn"
                        aria-label="Decrease"
                        onClick={() => nudgeBudget(b.category, -25)}
                      >
                        −
                      </button>
                      <span className="wd-nudge-val">{money(b.planned)}</span>
                      <button
                        type="button"
                        className="wd-btn"
                        aria-label="Increase"
                        onClick={() => nudgeBudget(b.category, 25)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </section>
          </div>
        ) : null}

        {/* ════════ SUBSCRIPTIONS ════════ */}
        {tab === "subscriptions" ? (
          <div className="wd-page">
            {subscriptionScan.count === 0 ? (
              <section className="wd-panel" aria-label="Subscriptions">
                <div className="wd-empty">
                  <div className="wd-empty-icon">↻</div>
                  <p>No recurring charges detected yet.</p>
                  <p className="wd-muted">Import or add a few months of transactions.</p>
                </div>
              </section>
            ) : (
              <>
                {aiSubscriptionStack.plans.length ? (
                  <section
                    className="wd-panel wd-ai-subscriptions"
                    aria-label="AI subscription comparison"
                  >
                    <div className="wd-ai-sub-head">
                      <div>
                        <div className="wd-kicker">AI PLAN TRIAL</div>
                        <h2>Four plans now. Keep the one that earns its place.</h2>
                      </div>
                      <div className="wd-ai-sub-total">
                        <strong>{money(aiSubscriptionStack.monthlyTotal)}</strong>
                        <span>
                          /mo · {money(aiSubscriptionStack.yearlyTotal)}/yr
                        </span>
                      </div>
                    </div>
                    <p className="wd-muted">
                      User-confirmed costs, separate from the incomplete card
                      ledger. Choosing one $20 plan would cut this stack by
                      {` ${money(
                        Math.max(0, aiSubscriptionStack.monthlyTotal - 20)
                      )}/mo`}.
                    </p>
                    <div className="wd-ai-sub-list">
                      {aiSubscriptionStack.plans.map((subscription) => (
                        <div className="wd-ai-sub-line" key={subscription.key}>
                          <div>
                            <strong>{subscription.merchant}</strong>
                            <span>Confirmed this month</span>
                          </div>
                          <div>
                            <strong>{money(subscription.monthlyCost)}/mo</strong>
                            <span>
                              Keep only this → save{" "}
                              {money(
                                aiSubscriptionStack.monthlyTotal -
                                  subscription.monthlyCost
                              )}
                              /mo
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="wd-sub-hint">
                      Compare them on the same real tasks before cancelling:
                      correctness, speed, coding workflow, research, and how
                      often you actually reach for each one.
                    </p>
                  </section>
                ) : null}

                <section className="wd-panel" aria-label="Subscriptions total">
                  <div className="wd-stat-grid">
                    <div className="wd-stat-tile">
                      <div className="wd-stat-label">Per month</div>
                      <div className="wd-stat-value is-neg">
                        {money(subscriptionScan.monthlyTotal)}
                      </div>
                    </div>
                    <div className="wd-stat-tile">
                      <div className="wd-stat-label">Per year</div>
                      <div className="wd-stat-value is-neg">
                        {money(subscriptionScan.yearlyTotal)}
                      </div>
                    </div>
                    <div className="wd-stat-tile">
                      <div className="wd-stat-label">Active</div>
                      <div className="wd-stat-value">{subscriptionScan.count}</div>
                    </div>
                    <div className="wd-stat-tile">
                      <div className="wd-stat-label">Biggest</div>
                      <div className="wd-stat-value">
                        {money(subscriptionScan.subs[0]?.monthlyCost || 0)}
                      </div>
                      <div className="wd-stat-sub">
                        {subscriptionScan.subs[0]?.merchant || "—"}
                      </div>
                    </div>
                  </div>

                  {/* Donut — hover each sub to see name + $ (black border + pop) */}
                  <div className="wd-sub-chart">
                    <InteractivePieChart
                      size={188}
                      holeRatio={0.58}
                      showLegend
                      centerPrimary={money(subscriptionScan.monthlyTotal)}
                      centerSecondary="/mo"
                      formatValue={(v, frac) =>
                        `${money(v)} · ${(frac * 100).toFixed(0)}%`
                      }
                      slices={subscriptionScan.subs.map((s, i) => {
                        const palette = [
                          "#1f6f8b",
                          "#e8743b",
                          "#4b8f6b",
                          "#b5651d",
                          "#7d5ba6",
                          "#c94f7c",
                          "#3a7d99",
                          "#d1a13a",
                          "#5c8d5c",
                          "#a0522d",
                        ];
                        return {
                          name: s.merchant,
                          value: s.monthlyCost,
                          color: palette[i % palette.length],
                        };
                      })}
                    />
                  </div>
                </section>

                <section className="wd-panel" aria-label="Subscription list">
                  <table className="wd-sub-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Cadence</th>
                        <th className="wd-num">Charge</th>
                        <th className="wd-num">/mo</th>
                        <th className="wd-num">/yr</th>
                        <th>Next</th>
                        <th className="wd-sub-x-col" aria-label="Remove" />
                      </tr>
                    </thead>
                    <tbody>
                      {subscriptionScan.subs.map((s) => (
                        <tr key={s.key} className="wd-sub-row">
                          <td>
                            {s.merchant}
                            {s.count > 1 ? (
                              <span className="wd-muted"> ·{s.count}×</span>
                            ) : null}
                          </td>
                          <td>
                            {/* Hover/focus: Monthly | Yearly — no ugly pill stack */}
                            <div className="wd-cad-toggle" tabIndex={0}>
                              <span className="wd-cad-current">
                                {CADENCE_LABEL[s.cadence] || s.cadence}
                              </span>
                              <div className="wd-cad-menu" role="group" aria-label="Billing cadence">
                                {TOGGLE_CADENCES.map((c) => (
                                  <button
                                    key={c}
                                    type="button"
                                    className={`wd-cad-opt${s.cadence === c ? " on" : ""}`}
                                    onClick={() => {
                                      setSubscriptionCadence(
                                        s.key,
                                        c as SubCadence
                                      );
                                      setSubTick((n) => n + 1);
                                    }}
                                  >
                                    {CADENCE_LABEL[c]}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </td>
                          <td className="wd-num">
                            {s.source === "confirmed" ? (
                              <label className="wd-sub-amount-edit">
                                <span>$</span>
                                <input
                                  aria-label={`${s.merchant} charge`}
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={s.amount}
                                  onChange={(event) => {
                                    setSubscriptionAmount(
                                      s.key,
                                      Number(event.target.value) || 0
                                    );
                                    setSubTick((n) => n + 1);
                                  }}
                                />
                              </label>
                            ) : (
                              money(s.amount)
                            )}
                          </td>
                          <td className="wd-num">{money(s.monthlyCost)}</td>
                          <td className="wd-num">{money(s.yearlyCost)}</td>
                          <td className="wd-date wd-muted">{formatDateMDY(s.nextDate)}</td>
                          <td className="wd-sub-x-col">
                            <button
                              type="button"
                              className="wd-sub-x"
                              title={`Remove ${s.merchant} from list & pie`}
                              aria-label={`Delete ${s.merchant}`}
                              onClick={() => {
                                dismissSubscription(s.key);
                                setSubTick((n) => n + 1);
                              }}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="wd-sub-hint">
                    Hover cadence to switch Monthly / Yearly. × removes it from
                    the list and pie — totals update automatically.
                  </p>
                </section>
              </>
            )}
          </div>
        ) : null}

        {/* ════════ GOALS ════════ */}
        {tab === "goals" ? (
          <div className="wd-page">
            <section className="wd-panel">
              <div className="wd-panel-head">
                <h2>Goals</h2>
              </div>
              <div className="wd-goals wd-goals-edit">
                {goals.map((g) => {
                  const pct =
                    g.target > 0
                      ? Math.min(100, Math.round((g.saved / g.target) * 100))
                      : 0;
                  return (
                    <div key={g.id} className="wd-goal-edit">
                      <input
                        className="wd-goal-name"
                        value={g.name}
                        onChange={(e) =>
                          patchGoal(g.id, { name: e.target.value })
                        }
                      />
                      <div className="wd-progress">
                        <i style={{ width: `${pct}%` }} />
                      </div>
                      <div className="wd-goal-fields">
                        <label>
                          Saved
                          <input
                            type="number"
                            value={g.saved || ""}
                            onChange={(e) =>
                              patchGoal(g.id, {
                                saved: Math.max(
                                  0,
                                  Number(e.target.value) || 0
                                ),
                              })
                            }
                          />
                        </label>
                        <label>
                          Target
                          <input
                            type="number"
                            value={g.target || ""}
                            onChange={(e) =>
                              patchGoal(g.id, {
                                target: Math.max(
                                  0,
                                  Number(e.target.value) || 0
                                ),
                              })
                            }
                          />
                        </label>
                        <em>{pct}%</em>
                        <button
                          type="button"
                          className="wd-x"
                          onClick={() => removeGoal(g.id)}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="wd-form">
                <label>
                  Name
                  <input
                    value={goalDraft.name}
                    onChange={(e) =>
                      setGoalDraft((d) => ({ ...d, name: e.target.value }))
                    }
                    placeholder="Emergency fund"
                  />
                </label>
                <label>
                  Target
                  <input
                    type="number"
                    value={goalDraft.target || ""}
                    onChange={(e) =>
                      setGoalDraft((d) => ({
                        ...d,
                        target: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                  />
                </label>
                <label>
                  Saved
                  <input
                    type="number"
                    value={goalDraft.saved || ""}
                    onChange={(e) =>
                      setGoalDraft((d) => ({
                        ...d,
                        saved: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                  />
                </label>
                <button
                  type="button"
                  className="wd-btn wd-btn-primary"
                  onClick={addGoal}
                >
                  Add goal
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {/* ════════ INSIGHTS / ADEPT ════════ */}
        {tab === "insights" ? (
          <div className="wd-page">
            {/* Real score + climb — function first */}
            <section className="wd-panel">
              <div className="wd-panel-head">
                <h2>Credit · real score</h2>
                <span className="wd-chip">
                  {creditReport.scoreSource === "official"
                    ? "Official on books"
                    : "Estimate — set Known score"}
                </span>
              </div>
              <p className="wd-safe-num">{creditReport.estimate}</p>
              <p className="wd-muted">{creditReport.band}</p>
              <p style={{ marginTop: 8 }}>
                <strong>{brief.adept.levelLabel}</strong>
              </p>
              <p className="wd-muted">{brief.adept.order}</p>
              <div className="wd-acct-grid" style={{ marginTop: 12 }}>
                <div>
                  <h3 style={{ fontSize: 13 }}>Targets</h3>
                  <ul className="wd-acct-list">
                    <li>
                      90 days → <strong>{brief.adept.targets.score90d}</strong>
                    </li>
                    <li>
                      1 year → <strong>{brief.adept.targets.score1y}</strong>
                    </li>
                    <li>
                      Util max{" "}
                      <strong>{brief.adept.targets.utilMax}%</strong> before
                      statement close
                    </li>
                    <li>
                      Cash floor{" "}
                      <strong>${brief.adept.targets.checkingFloor}</strong>
                    </li>
                    <li>
                      Runway target{" "}
                      <strong>{brief.adept.targets.runwayMonths} mo</strong>
                    </li>
                    <li>
                      Util now:{" "}
                      <strong>
                        {creditReport.utilization == null
                          ? "set card limit"
                          : `${Math.round(creditReport.utilization * 100)}%`}
                      </strong>
                    </li>
                  </ul>
                </div>
                <div>
                  <h3 style={{ fontSize: 13 }}>Climb path</h3>
                  <ul className="wd-acct-list">
                    {brief.adept.climb.map((c) => (
                      <li key={c.targetScore}>
                        <strong>
                          {c.targetScore} · {c.label}
                        </strong>
                        <div className="wd-muted">
                          {c.monthsTypical}. {c.moves.join(" · ")}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <ul className="wd-alerts" style={{ marginTop: 12 }}>
                {creditReport.tips.slice(0, 5).map((t, i) => (
                  <li key={i}>
                    <div>
                      <strong>
                        [{t.priority}] {t.title}
                      </strong>
                      <p>
                        {t.why} {t.how}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="wd-form wd-credit-form" style={{ marginTop: 12 }}>
                <label>
                  Official score
                  <input
                    type="number"
                    value={creditProfile.knownScore ?? REAL_CREDIT_SCORE}
                    onChange={(e) =>
                      patchCreditProfile({
                        knownScore: e.target.value
                          ? Number(e.target.value)
                          : REAL_CREDIT_SCORE,
                      })
                    }
                  />
                </label>
                <label>
                  Score provider
                  <input
                    placeholder="Credit Karma / Chase / Experian"
                    value={creditProfile.scoreProvider ?? ""}
                    onChange={(e) =>
                      patchCreditProfile({
                        scoreProvider: e.target.value || null,
                      })
                    }
                  />
                </label>
                <label>
                  Score model
                  <input
                    placeholder="VantageScore 3.0 / FICO 8"
                    value={creditProfile.scoreModel ?? ""}
                    onChange={(e) =>
                      patchCreditProfile({
                        scoreModel: e.target.value || null,
                      })
                    }
                  />
                </label>
                <label>
                  Bureau
                  <input
                    placeholder="Equifax / Experian / TransUnion"
                    value={creditProfile.scoreBureau ?? ""}
                    onChange={(e) =>
                      patchCreditProfile({
                        scoreBureau: e.target.value || null,
                      })
                    }
                  />
                </label>
                <label>
                  Cash floor $
                  <input
                    type="number"
                    value={creditProfile.cashFloor ?? 300}
                    onChange={(e) =>
                      patchCreditProfile({
                        cashFloor: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                </label>
                <label>
                  On-time %
                  <input
                    type="number"
                    value={creditProfile.onTimePct}
                    onChange={(e) =>
                      patchCreditProfile({
                        onTimePct: Math.min(
                          100,
                          Math.max(0, Number(e.target.value) || 0)
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  History years
                  <input
                    type="number"
                    value={creditProfile.historyYears}
                    onChange={(e) =>
                      patchCreditProfile({
                        historyYears: Math.max(
                          0,
                          Number(e.target.value) || 0
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Hard pulls (12 mo)
                  <input
                    type="number"
                    value={creditProfile.hardInquiries}
                    onChange={(e) =>
                      patchCreditProfile({
                        hardInquiries: Math.max(
                          0,
                          Number(e.target.value) || 0
                        ),
                      })
                    }
                  />
                </label>
              </div>
            </section>

            {/* Become financially adept */}
            <section className="wd-panel">
              <div className="wd-panel-head">
                <h2>Become financially adept</h2>
                <span className="wd-chip">{brief.adept.level}</span>
              </div>

              <h3 style={{ fontSize: 13, marginTop: 12 }}>Leaks (fix these)</h3>
              <ul className="wd-acct-list">
                {brief.adept.leaks.map((l, i) => (
                  <li key={i} className="is-neg">
                    {l}
                  </li>
                ))}
                {brief.adept.leaks.length === 0 ? (
                  <li className="wd-muted">No major leaks flagged</li>
                ) : null}
              </ul>

              <h3 style={{ fontSize: 13, marginTop: 12 }}>Strengths</h3>
              <ul className="wd-acct-list">
                {brief.adept.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>

              <h3 style={{ fontSize: 13, marginTop: 12 }}>
                Non‑negotiable rules
              </h3>
              <ul className="wd-acct-list">
                {brief.adept.rules.map((r) => (
                  <li key={r.id}>
                    <strong>{r.rule}</strong>
                    <div className="wd-muted">{r.why}</div>
                  </li>
                ))}
              </ul>

              <h3 style={{ fontSize: 13, marginTop: 12 }}>Drills (do these)</h3>
              <div className="wd-acct-table-wrap">
                <table className="wd-acct-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Drill</th>
                      <th>Do exactly</th>
                      <th>Done when</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brief.adept.drills.map((d) => (
                      <tr key={d.id}>
                        <td>{d.when}</td>
                        <td>
                          <strong>{d.title}</strong>
                          <div className="wd-muted">{d.why}</div>
                        </td>
                        <td>{d.doExactly}</td>
                        <td>{d.doneWhen}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="wd-acct-grid" style={{ marginTop: 12 }}>
                <div>
                  <h3 style={{ fontSize: 13 }}>Weekly cadence</h3>
                  <ul className="wd-acct-list">
                    {brief.adept.weeklyCadence.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 style={{ fontSize: 13 }}>Monthly cadence</h3>
                  <ul className="wd-acct-list">
                    {brief.adept.monthlyCadence.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            <div className="wd-grid-2">
              <section className="wd-panel">
                <div className="wd-panel-head">
                  <h2>Score levers</h2>
                </div>
                <ul className="wd-acct-list">
                  {creditReport.factors.map((f) => (
                    <li key={f.id}>
                      <strong>
                        {f.label} ({f.weight}%) · {f.score}/100 · {f.status}
                      </strong>
                      <div className="wd-muted">{f.detail}</div>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="wd-panel">
                <div className="wd-panel-head">
                  <h2>6-month cash flow</h2>
                </div>
                <div className="wd-month-bars">
                  {series.map((s) => {
                    const max = Math.max(
                      1,
                      ...series.map((x) => Math.max(x.income, x.expense))
                    );
                    return (
                      <div key={s.ym} className="wd-month-col">
                        <div className="wd-month-pair">
                          <i
                            className="is-in"
                            style={{
                              height: `${(s.income / max) * 80}px`,
                            }}
                          />
                          <i
                            className="is-out"
                            style={{
                              height: `${(s.expense / max) * 80}px`,
                            }}
                          />
                        </div>
                        <span>{s.ym.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* Do today — lives under Review, not on top of Ledger */}
            <section className="wd-today" aria-label="Do today">
              <div className="wd-today-head">
                <h2>Do today</h2>
                <p className="wd-muted">
                  {todayPlan.doneCount}/{todayPlan.total} done · ~
                  {todayPlan.minutesLeft} min left
                </p>
              </div>
              <p className="wd-today-order">{todayPlan.order}</p>
              <ul className="wd-today-list">
                {todayPlan.actions.map((a) => (
                  <li key={a.id} className={a.done ? "is-done" : "is-open"}>
                    <label className="wd-today-row">
                      <input
                        type="checkbox"
                        checked={a.done}
                        disabled={a.autoFromBooks}
                        onChange={() => flipToday(a.id)}
                        title={
                          a.autoFromBooks
                            ? "Completed from your books"
                            : "Mark done"
                        }
                      />
                      <span className="wd-today-body">
                        <strong>
                          {a.title}
                          {a.minutes > 0 ? (
                            <em className="wd-muted"> · {a.minutes} min</em>
                          ) : null}
                        </strong>
                        <span className="wd-muted">{a.doExactly}</span>
                      </span>
                    </label>
                    {a.tab ? (
                      <button
                        type="button"
                        className="wd-link"
                        onClick={() => setTab(a.tab!)}
                      >
                        Go
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        ) : null}

        {/* ════════ CREDIT — score tracking & payment reminders ════════ */}
        {tab === "credit" ? (
          <div className="wd-page">
            <section className="wd-panel" aria-label="Credit score tracking">
              <div className="wd-panel-head">
                <div>
                  <h2>Credit score tracking</h2>
                </div>
              </div>

              {/* Record new score */}
              <div className="wd-form" style={{ display: "flex", gap: 8 }}>
                <input
                  type="number"
                  min={300}
                  max={850}
                  placeholder="Enter score (300–850)"
                  value={scoreInput}
                  onChange={(e) => setScoreInput(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="wd-btn wd-btn-primary"
                  onClick={recordCredit}
                >
                  Record today
                </button>
              </div>

              {/* Score chart */}
              {creditStore.snapshots.length > 0 ? (
                <div style={{ margin: "20px 0" }}>
                  <svg
                    width="100%"
                    height={200}
                    viewBox="0 0 600 200"
                    className="wd-chart-frame"
                  >
                    <defs>
                      <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#4285f4" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#4285f4" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    {/* Grid lines */}
                    {[300, 450, 600, 750].map((score) => (
                      <line
                        key={`grid-${score}`}
                        x1={0}
                        y1={170 - ((score - 300) / 550) * 160}
                        x2={600}
                        y2={170 - ((score - 300) / 550) * 160}
                        stroke="rgba(255,255,255,0.08)"
                        strokeWidth={1}
                      />
                    ))}
                    {/* Y-axis labels */}
                    {[300, 450, 600, 750].map((score) => (
                      <text
                        key={`label-${score}`}
                        x={5}
                        y={175 - ((score - 300) / 550) * 160}
                        fontSize={12}
                      >
                        {score}
                      </text>
                    ))}
                    {/* Score line + fill (needs 2+ points) */}
                    {creditStore.snapshots.length > 1 ? (
                      <>
                        <polyline
                          points={creditStore.snapshots
                            .map((s, i) => {
                              const x = (i / (creditStore.snapshots.length - 1)) * 560 + 30;
                              const y = 170 - ((s.score - 300) / 550) * 160;
                              return `${x},${y}`;
                            })
                            .join(" ")}
                          fill="none"
                          stroke="#4285f4"
                          strokeWidth={2}
                        />
                        <polygon
                          points={`30,170 ${creditStore.snapshots
                            .map((s, i) => {
                              const x = (i / (creditStore.snapshots.length - 1)) * 560 + 30;
                              const y = 170 - ((s.score - 300) / 550) * 160;
                              return `${x},${y}`;
                            })
                            .join(" ")} 590,170`}
                          fill="url(#scoreGrad)"
                        />
                      </>
                    ) : null}
                    {/* Latest point dot */}
                    {creditStore.snapshots.length > 0 && (
                      <circle
                        cx={
                          creditStore.snapshots.length > 1
                            ? 590
                            : 30
                        }
                        cy={170 - ((creditStore.snapshots[creditStore.snapshots.length - 1].score - 300) / 550) * 160}
                        r={4}
                        fill="#1a73e8"
                      />
                    )}
                  </svg>
                </div>
              ) : null}

              {/* Latest score summary */}
              {latestScore(creditStore) ? (() => {
                const latest = latestScore(creditStore)!;
                const trend = scoreTrend(creditStore, 30);
                return (
                  <div className="wd-stat-grid" style={{ marginTop: 16 }}>
                    <div className="wd-stat-tile">
                      <div className="wd-stat-label">Latest</div>
                      <div className="wd-stat-value" style={{ color: "#5aa2f7" }}>
                        {latest.score}
                      </div>
                      <div className="wd-stat-sub">
                        {formatDateMDY(latest.date)}
                        {latest.trend === "up" && " ↑"}
                        {latest.trend === "down" && " ↓"}
                      </div>
                    </div>
                    <div className="wd-stat-tile">
                      <div className="wd-stat-label">30-day avg</div>
                      <div className="wd-stat-value">{trend.average}</div>
                      <div
                        className={trend.change >= 0 ? "is-pos" : "is-neg"}
                        style={{ fontSize: 12, marginTop: 4 }}
                      >
                        {trend.change >= 0 ? "+" : ""}
                        {trend.change}
                      </div>
                    </div>
                    <div className="wd-stat-tile">
                      <div className="wd-stat-label">Range</div>
                      <div className="wd-stat-value">
                        {trend.lowPoint} – {trend.highPoint}
                      </div>
                    </div>
                  </div>
                );
              })() : null}

              {/* Payment reminders — configured due days first */}
              {(() => {
                const reminders = paymentReminders(accounts);
                return reminders.length > 0 ? (
                  <div style={{ marginTop: 24 }}>
                    <h3>Payment due reminders</h3>
                    <ul className="wd-acct-list">
                      {reminders.map((r) => (
                        <li
                          key={r.accountId}
                          className={`wd-alert ${
                            r.urgency === "critical"
                              ? "is-critical"
                              : r.urgency === "warning"
                                ? "is-warning"
                                : ""
                          }`}
                        >
                          <div style={{ fontWeight: 600 }}>{r.accountName}</div>
                          <div className="wd-muted" style={{ fontSize: 12, marginTop: 4 }}>
                            Due {formatDateMDY(r.dueDate)} ({r.daysUntilDue} day
                            {r.daysUntilDue === 1 ? "" : "s"})
                            {r.minimumAmount && ` · min ${moneyCents(r.minimumAmount)}`}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null;
              })()}

              {/* Learned from your ledger — no due date needed */}
              {(() => {
                const learned = inferCardPaydays(txs);
                return learned.length > 0 ? (
                  <div style={{ marginTop: 24 }}>
                    <h3>Learned payment pattern</h3>
                    <ul className="wd-acct-list">
                      {learned.map((p) => (
                        <li
                          key={p.label}
                          className={`wd-alert ${
                            p.urgency === "critical"
                              ? "is-critical"
                              : p.urgency === "warning"
                                ? "is-warning"
                                : ""
                          }`}
                        >
                          <div style={{ fontWeight: 600 }}>{p.label}</div>
                          <div className="wd-muted" style={{ fontSize: 12, marginTop: 4 }}>
                            You usually pay around day {p.dayOfMonth} (
                            {p.occurrences} payments seen) · next expected{" "}
                            {p.nextExpected} — in {p.daysUntil} day
                            {p.daysUntil === 1 ? "" : "s"} · last paid{" "}
                            {p.lastPaymentDate}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div style={{ marginTop: 24 }} className="wd-muted">
                    No card payment pattern in the ledger yet — after a couple
                    of card payments I'll learn your dates automatically. Or
                    set the due day on a card in Accounts for exact reminders.
                  </div>
                );
              })()}

              {/* Utilization — the fastest score lever */}
              {(() => {
                const util = creditUtilization(accounts);
                return util.lines.length > 0 ? (
                  <div style={{ marginTop: 24 }}>
                    <h3>
                      Utilization
                      {util.overall != null
                        ? ` · overall ${(util.overall * 100).toFixed(0)}%`
                        : ""}
                    </h3>
                    <ul className="wd-acct-list">
                      {util.lines.map((u) => (
                        <li
                          key={u.accountName}
                          className={`wd-alert ${
                            u.utilization >= 0.5
                              ? "is-critical"
                              : u.utilization >= 0.3
                                ? "is-warning"
                                : ""
                          }`}
                        >
                          <div style={{ fontWeight: 600 }}>
                            {u.accountName} · {(u.utilization * 100).toFixed(0)}%
                          </div>
                          <div className="wd-muted" style={{ fontSize: 12, marginTop: 4 }}>
                            {moneyCents(u.balance)} of {moneyCents(u.limit)}{" "}
                            limit
                            {u.payToThirty > 0
                              ? ` — pay ${moneyCents(u.payToThirty)} to get under 30%`
                              : " — under 30%, good"}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div style={{ marginTop: 12 }} className="wd-muted">
                    Add your card's credit limit in Accounts to unlock
                    utilization tracking (the fastest score lever).
                  </div>
                );
              })()}
            </section>
          </div>
        ) : null}

        {/* ════════ WORTH (net-worth timeline) ════════ */}
        {tab === "worth" ? (
          <div className="wd-page">
            <section className="wd-panel" aria-label="Net worth timeline">
              <div className="wd-panel-head">
                <h2>Net worth</h2>
              </div>
              {worthSeries.length ? (
                <LabeledLineChart
                  title="Net worth by month"
                  xLabel="Month"
                  yLabel="Net worth ($)"
                  points={worthSeries.map((sn) => ({
                    x: sn.date.slice(0, 7),
                    y: sn.total,
                    label: `${formatDateMDY(sn.date)}: ${moneyCents(sn.total)} (bank ${moneyCents(sn.bankNet)}${sn.valuationNet ? ` + assets ${moneyCents(sn.valuationNet)}` : ""})`,
                  }))}
                />
              ) : null}
              {worthExplain && worthExplain.topDrivers.length ? (
                <ul className="wd-acct-list">
                  {worthExplain.topDrivers.map((d) => (
                    <li key={d.label}>
                      {d.label}:{" "}
                      <strong>
                        {d.amount >= 0 ? "+" : "−"}
                        {moneyCents(Math.abs(d.amount))}
                      </strong>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="wd-acct-table-wrap">
                <table className="wd-acct-table">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Bank net</th>
                      <th scope="col">Valuations</th>
                      <th scope="col">Total</th>
                      <th scope="col">Basis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {worthSeries.map((sn) => (
                      <tr key={sn.date}>
                        <td className="wd-date">{formatDateMDY(sn.date)}</td>
                        <td>{moneyCents(sn.bankNet)}</td>
                        <td>{moneyCents(sn.valuationNet)}</td>
                        <td>
                          <strong>{moneyCents(sn.total)}</strong>
                        </td>
                        <td className="wd-muted">
                          {sn.status}
                          {sn.carriedForward.length
                            ? ` · carried forward: ${sn.carriedForward.join(", ")}`
                            : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="wd-panel" aria-label="Net worth composition">
              <div className="wd-panel-head">
                <h2>Composition today</h2>
              </div>
              {composition ? (
                <ul className="wd-acct-list">
                  <li>
                    Liquid cash (cash + checking + savings):{" "}
                    <strong>{moneyCents(composition.liquid)}</strong>
                  </li>
                  <li>
                    Invested accounts:{" "}
                    <strong>{moneyCents(composition.invested)}</strong>
                  </li>
                  {composition.otherBankAssets ? (
                    <li>
                      Other accounts:{" "}
                      <strong>{moneyCents(composition.otherBankAssets)}</strong>
                    </li>
                  ) : null}
                  <li>
                    Manual asset valuations:{" "}
                    <strong>{moneyCents(composition.valuationAssets)}</strong>
                  </li>
                  <li>
                    Credit owed:{" "}
                    <strong>−{moneyCents(composition.debt)}</strong>
                  </li>
                  {composition.valuationLiabilities ? (
                    <li>
                      Manual liabilities:{" "}
                      <strong>
                        −{moneyCents(composition.valuationLiabilities)}
                      </strong>
                    </li>
                  ) : null}
                  <li>
                    Total net worth:{" "}
                    <strong>
                      {worthVerified
                        ? moneyCents(composition.total)
                        : "Unverified"}
                    </strong>
                  </li>
                </ul>
              ) : null}
              <p className="wd-muted">
                This month with transfers &amp; card payments excluded: income{" "}
                {moneyCents(trueIncome)} · spending {moneyCents(trueSpend)}.
              </p>
            </section>

            <section className="wd-panel" aria-label="Manual valuations">
              <div className="wd-panel-head">
                <h2>Manual valuations</h2>
              </div>
              <p className="wd-muted">
                Property, vehicles, business, collectibles — recorded by you
                with a date and source. Never auto-updated.
              </p>
              <div className="wd-form">
                <label>
                  Name
                  <input
                    value={valDraft.name}
                    onChange={(e) =>
                      setValDraft((d) => ({ ...d, name: e.target.value }))
                    }
                    placeholder="e.g. Honda Civic"
                  />
                </label>
                <label>
                  Type
                  <select
                    value={valDraft.side}
                    onChange={(e) =>
                      setValDraft((d) => ({
                        ...d,
                        side: e.target.value as "asset" | "liability",
                      }))
                    }
                  >
                    <option value="asset">Asset</option>
                    <option value="liability">Liability</option>
                  </select>
                </label>
                <label>
                  Class
                  <select
                    value={valDraft.assetClass}
                    onChange={(e) =>
                      setValDraft((d) => ({
                        ...d,
                        assetClass: e.target
                          .value as ValuationItem["assetClass"],
                      }))
                    }
                  >
                    <option value="real-estate">Real estate</option>
                    <option value="vehicle">Vehicle</option>
                    <option value="business">Business</option>
                    <option value="collectible">Collectible</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label>
                  Value
                  <input
                    inputMode="decimal"
                    value={valDraft.value}
                    onChange={(e) =>
                      setValDraft((d) => ({ ...d, value: e.target.value }))
                    }
                    placeholder="0.00"
                  />
                </label>
                <label>
                  Source
                  <input
                    value={valDraft.source}
                    onChange={(e) =>
                      setValDraft((d) => ({ ...d, source: e.target.value }))
                    }
                    placeholder="e.g. KBB, my estimate"
                  />
                </label>
                <label>
                  Confidence
                  <select
                    value={valDraft.confidence}
                    onChange={(e) =>
                      setValDraft((d) => ({
                        ...d,
                        confidence: e.target.value as
                          | "low"
                          | "medium"
                          | "high",
                      }))
                    }
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="wd-btn wd-btn-primary"
                  onClick={addValuationItem}
                >
                  Add valuation
                </button>
              </div>
              <ul className="wd-acct-list">
                {worthStore.items.map((item) => {
                  const latest = valuationAt(
                    item,
                    new Date().toISOString().slice(0, 10)
                  );
                  const draft = pointDrafts[item.id] || {
                    value: "",
                    source: "",
                  };
                  return (
                    <li key={item.id}>
                      <strong>{item.name}</strong> · {item.side} ·{" "}
                      {item.assetClass}
                      {latest ? (
                        <>
                          {" "}· {moneyCents(latest.value)}{" "}
                          <span className="wd-muted">
                            as of {formatDateMDY(latest.point.date)} (
                            {latest.point.source || "no source"},{" "}
                            {latest.point.confidence} confidence
                            {latest.carriedForward ? ", carried forward" : ""})
                          </span>
                        </>
                      ) : (
                        " · no valuation yet"
                      )}{" "}
                      <input
                        aria-label={`New value for ${item.name}`}
                        inputMode="decimal"
                        placeholder="New value"
                        value={draft.value}
                        onChange={(e) =>
                          setPointDrafts((d) => ({
                            ...d,
                            [item.id]: { ...draft, value: e.target.value },
                          }))
                        }
                        style={{ width: 90 }}
                      />{" "}
                      <input
                        aria-label={`Source for ${item.name}`}
                        placeholder="Source"
                        value={draft.source}
                        onChange={(e) =>
                          setPointDrafts((d) => ({
                            ...d,
                            [item.id]: { ...draft, source: e.target.value },
                          }))
                        }
                        style={{ width: 110 }}
                      />{" "}
                      <button
                        type="button"
                        className="wd-btn"
                        onClick={() => addValuationPoint(item.id)}
                      >
                        Record
                      </button>{" "}
                      <button
                        type="button"
                        className="wd-btn"
                        onClick={() => removeValuationItem(item.id)}
                      >
                        Delete
                      </button>
                    </li>
                  );
                })}
                {worthStore.items.length === 0 ? (
                  <li className="wd-muted">No manual valuations yet.</li>
                ) : null}
              </ul>
            </section>
          </div>
        ) : null}

        {/* ════════ ACCOUNTS ════════ */}
        {tab === "accounts" ? (
          <div className="wd-page">
            <section className="wd-panel">
              <div className="wd-panel-head">
                <h2>Accounts</h2>
                <button type="button" className="wd-btn" onClick={addAccount}>
                  + Account
                </button>
              </div>
              <p className="wd-muted" style={{ marginBottom: 8 }}>
                Cards: fill Limit, Due day, Close day, Autopay — that is today&apos;s
                work (minutes).
              </p>
              <div className="wd-table-wrap">
                <table className="wd-table wd-edit">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Bank</th>
                      <th className="num">Balance</th>
                      <th className="num">Limit</th>
                      <th className="num">Due day</th>
                      <th className="num">Close day</th>
                      <th>Autopay</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {state.accounts.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <input
                            value={a.name}
                            onChange={(e) =>
                              patchAccount(a.id, { name: e.target.value })
                            }
                          />
                        </td>
                        <td>
                          <select
                            value={a.kind}
                            onChange={(e) =>
                              patchAccount(a.id, {
                                kind: e.target.value as AccountKind,
                              })
                            }
                          >
                            {KINDS.map((k) => (
                              <option key={k.id} value={k.id}>
                                {k.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            value={a.institution || ""}
                            onChange={(e) =>
                              patchAccount(a.id, {
                                institution: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="num">
                          <input
                            type="number"
                            value={
                              a.balanceVerified === false ? "" : a.balance
                            }
                            placeholder={
                              a.balanceVerified === false
                                ? "Unverified"
                                : undefined
                            }
                            title={
                              a.balanceVerified === false
                                ? "No statement or bank sync proves this balance yet"
                                : "Verified account balance"
                            }
                            onChange={(e) =>
                              patchAccount(a.id, {
                                balance: Number(e.target.value) || 0,
                                balanceVerified: e.target.value !== "",
                              })
                            }
                          />
                        </td>
                        <td className="num">
                          {a.kind === "credit" ? (
                            <input
                              type="number"
                              value={a.creditLimit ?? ""}
                              placeholder="limit"
                              onChange={(e) =>
                                patchAccount(a.id, {
                                  creditLimit: e.target.value
                                    ? Number(e.target.value)
                                    : null,
                                })
                              }
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="num">
                          {a.kind === "credit" ? (
                            <input
                              type="number"
                              min={1}
                              max={31}
                              value={a.dueDay ?? ""}
                              placeholder="1–31"
                              title="Payment due day of month"
                              onChange={(e) =>
                                patchAccount(a.id, {
                                  dueDay: e.target.value
                                    ? Math.min(
                                        31,
                                        Math.max(1, Number(e.target.value) || 1)
                                      )
                                    : null,
                                })
                              }
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="num">
                          {a.kind === "credit" ? (
                            <input
                              type="number"
                              min={1}
                              max={31}
                              value={a.statementCloseDay ?? ""}
                              placeholder="1–31"
                              title="Statement closing day"
                              onChange={(e) =>
                                patchAccount(a.id, {
                                  statementCloseDay: e.target.value
                                    ? Math.min(
                                        31,
                                        Math.max(1, Number(e.target.value) || 1)
                                      )
                                    : null,
                                })
                              }
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {a.kind === "credit" ? (
                            <input
                              type="checkbox"
                              checked={!!a.autopayMin}
                              title="Autopay at least minimum is on"
                              onChange={(e) =>
                                patchAccount(a.id, {
                                  autopayMin: e.target.checked,
                                })
                              }
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="wd-x"
                            onClick={() => removeAccount(a.id)}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="wd-panel">
              <div className="wd-panel-head">
                <h2>Add Chase / bank accounts</h2>
                <span
                  className={`wd-chip${plaid?.ready ? "" : " wd-chip-muted"}`}
                >
                  {plaid?.ready ? "Plaid ready" : "CSV mode"}
                </span>
              </div>

              <div className="wd-bank-cards">
                <article className="wd-bank-card">
                  <strong>Works right now · Chase CSV</strong>
                  <p>
                    Chase app or chase.com → Account → Download / Statements →
                    CSV → tap Import. Dupes auto-skip. Then open Plan →
                    Auto-build.
                  </p>
                  <button
                    type="button"
                    className="wd-btn wd-btn-primary"
                    onClick={() => fileRef.current?.click()}
                  >
                    Import bank CSV
                  </button>
                </article>
                <article className="wd-bank-card">
                  <strong>Automatic · Plaid (Chase supported)</strong>
                  <p>
                    Free Plaid developer keys unlock one-click bank link
                    (Chase, Amex, Capital One, etc.). Without keys, sandbox
                    only works if configured.
                  </p>
                  <div className="wd-top-actions">
                    <button
                      type="button"
                      className="wd-btn"
                      disabled={plaidBusy || !plaid?.ready}
                      onClick={() => void plaidSandboxConnect()}
                    >
                      {plaidBusy ? "Working…" : "Connect (Plaid)"}
                    </button>
                    <button
                      type="button"
                      className="wd-btn"
                      disabled={plaidBusy || !state.plaidMeta?.itemId}
                      onClick={() => void plaidSync()}
                    >
                      Sync linked
                    </button>
                  </div>
                  {plaid && !plaid.ready ? (
                    <p className="wd-muted" style={{ marginTop: 10 }}>
                      Not linked yet: add PLAID_CLIENT_ID + PLAID_SECRET to
                      Wonder .env, restart. Free keys: dashboard.plaid.com
                    </p>
                  ) : null}
                </article>
              </div>

              {plaidNote ? <p className="wd-note wd-pad">{plaidNote}</p> : null}

              <div className="wd-risk">
                <h3>Data risks — straight talk</h3>
                <ul>
                  <li>
                    <strong>CSV import (safest for you):</strong> file never
                    leaves your computer. We read it in the browser and store
                    numbers in localStorage on this device only. No Wonder
                    server sees your Chase login.
                  </li>
                  <li>
                    <strong>Plaid connect:</strong> you log in through Plaid’s
                    secure flow (not our fake form). Plaid is used by tons of
                    apps; they hold the bank token. We only keep account
                    balances + transactions here. Risk: if this laptop is
                    unlocked, someone could open Wonder and see your money
                    data. Tokens in dev may live in server memory — don’t use
                    production secrets on a shared machine.
                  </li>
                  <li>
                    <strong>We do NOT store your Chase password.</strong> Ever.
                    If a site asks for your password outside Plaid/Chase, it’s
                    a scam.
                  </li>
                  <li>
                    <strong>Official credit scores</strong> still need Credit
                    Karma / your bank / AnnualCreditReport.com — we estimate
                    health tips, not a bureau hard pull.
                  </li>
                </ul>
              </div>

              {quotes.length > 0 ? (
                <div className="wd-watch">
                  {quotes.map((q) => (
                    <div key={q.symbol} className="wd-quote">
                      <b>{q.symbol}</b>
                      <strong>
                        {q.price != null ? moneyExact(q.price) : "—"}
                      </strong>
                      {q.changePct != null ? (
                        <small
                          className={q.changePct >= 0 ? "is-pos" : "is-neg"}
                        >
                          {q.changePct >= 0 ? "+" : ""}
                          {q.changePct.toFixed(2)}%
                        </small>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          </div>
        ) : null}

        {/* ════════ SQL ════════ */}
        {tab === "sql" ? (
          <div className="wd-page">
            <section className="wd-panel" aria-label="SQL editor">
              <div className="wd-panel-head">
                <h2>SQL</h2>
              </div>
              <FinanceSqlEditor txs={state.txs} />
            </section>
          </div>
        ) : null}
      </div>

      {copilotCtx ? (
        <FinanceCopilot
          open={copilotOpen}
          onClose={() => setCopilotOpen(false)}
          ctx={copilotCtx}
        />
      ) : null}
    </div>
  );
}
