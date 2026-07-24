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
import {
  buildCreditReport,
  DEFAULT_CREDIT_PROFILE,
  REAL_CREDIT_SCORE,
  type CreditProfile,
} from "./financeCredit";
import { FINANCE_CATEGORIES } from "./financeCategorize";
import { exportLedgerCsv, parseBankCsv } from "./financeCsv";
import { importOfx, looksLikeOfx } from "./financeOfx";
import {
  applyTransferPair,
  detectTransferPairs,
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
} from "./subscriptions";
import { MonthBookCharts, LabeledLineChart } from "./FinCharts";
import { FinanceCopilot } from "./FinanceCopilot";
import type { CopilotContext } from "./financeCopilot";
import {
  answerFromBrief,
  buildSmartBrief,
} from "./financeIntelligence";
import {
  cashOnHand,
  creditOwed,
  demoSeedTxs,
  fingerprintsFromTxs,
  invested,
  loadFinance,
  mergeTxs,
  money,
  moneyExact,
  moneyCents,
  monthExpense,
  monthIncome,
  monthKey,
  monthlySeries,
  netWorth,
  newAccount,
  newGoal,
  newTx,
  runningBalanceMap,
  txTypeOf,
  saveFinance,
  seedFinanceUndoBaseline,
  FINANCE_EXTERNAL_RESTORE_EVENT,
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
  | "worth"
  | "transactions"
  | "credit"
  | "plan"
  | "subscriptions"
  | "goals"
  | "insights"
  | "accounts";

type SortKey = "date" | "merchant" | "category" | "amount" | "kind";

/** Bookkeeper desk — ledger is home, not a marketing dashboard */
const NAV: { id: TabId; label: string; icon: string }[] = [
  { id: "transactions", label: "Ledger", icon: "☰" },
  { id: "overview", label: "Books", icon: "◉" },
  { id: "worth", label: "Worth", icon: "◆" },
  { id: "credit", label: "Credit", icon: "◈" },
  { id: "plan", label: "Plan", icon: "▦" },
  { id: "subscriptions", label: "Subscriptions", icon: "↻" },
  { id: "goals", label: "Goals", icon: "◎" },
  { id: "insights", label: "Review", icon: "◈" },
  { id: "accounts", label: "Accounts", icon: "▭" },
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
    cats: [
      "Rent / housing",
      "Utilities",
      "Food / groceries",
      "Transport",
      "Health",
    ],
  },
  {
    id: "lifestyle",
    label: "Lifestyle",
    cats: [
      "Restaurants / coffee",
      "Shopping",
      "Fun",
      "Travel",
      "Subscriptions",
      "Build / tools",
    ],
  },
  {
    id: "goals",
    label: "Goals",
    cats: ["Transfers"],
  },
  {
    id: "buffer",
    label: "Buffer",
    cats: ["Fees", "Other", "Uncategorized"],
  },
];

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
    return () =>
      window.removeEventListener(FINANCE_EXTERNAL_RESTORE_EVENT, onRestore);
  }, []);

  /** Apply an update only when books are loaded (vault unlocked). */
  const patchState = useCallback(
    (fn: (s: FinanceState) => FinanceState) => {
      setState((s) => (s ? fn(s) : s));
    },
    []
  );
  // Ledger first — a meticulous bookkeeper opens the daybook, not a dashboard
  const [tab, setTab] = useState<TabId>("transactions");
  const [filterQ, setFilterQ] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  // Accountant period: year first, then Jan → current month (grows automatically)
  const [filterYear, setFilterYear] = useState(() => new Date().getFullYear());
  /** "all" = whole selected year · or "YYYY-MM" for one month */
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterKind, setFilterKind] = useState<"all" | TxKind>("all");
  const [filterTxType, setFilterTxType] = useState("all");
  const [importNote, setImportNote] = useState("");
  const [plaid, setPlaid] = useState<PlaidStatus | null>(null);
  const [plaidBusy, setPlaidBusy] = useState(false);
  const [plaidNote, setPlaidNote] = useState("");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [goalDraft, setGoalDraft] = useState(() =>
    newGoal({ name: "Emergency fund", target: 5000 })
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
  const [copilotOpen, setCopilotOpen] = useState(false);
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
    setImportNote(`Books loaded · ${notes.join(" · ")}`);
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
  const txs = state?.txs || [];
  const accounts = state?.accounts || [];
  const spentMap = useMemo(() => spentByCategory(txs, ym), [txs, ym]);
  const income = useMemo(() => monthIncome(txs, ym), [txs, ym]);
  const expense = useMemo(() => monthExpense(txs, ym), [txs, ym]);
  const worth = netWorth(accounts);
  const cash = cashOnHand(accounts);
  const debt = creditOwed(accounts);
  const inv = invested(accounts);
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

  /** Short label: "Jul" keeps the strip small */
  const monthLabel = (ymKey: string) => {
    const [y, m] = ymKey.split("-").map(Number);
    if (!y || !m) return ymKey;
    try {
      return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short" });
    } catch {
      return ymKey;
    }
  };

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
  const categories = useMemo(() => {
    const set = new Set<string>([
      ...FINANCE_CATEGORIES,
      ...budget.map((b) => b.category),
      ...txs.map((t) => t.category),
    ]);
    return Array.from(set);
  }, [budget, txs]);

  const txTypes = useMemo(() => {
    const types = new Set<string>();
    for (const t of txs) types.add(txTypeOf(t));
    return Array.from(types).sort();
  }, [txs]);

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

  const subscriptionScan = useMemo(() => detectSubscriptions(txs), [txs]);

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
  const runwayMonths = brief.runwayMonths;
  const accounting = brief.accounting;

  const copilotCtx: CopilotContext | null = useMemo(
    () =>
      state
        ? {
            state,
            brief,
            subs: subscriptionScan,
            worth,
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
    [state, brief, subscriptionScan, worth, cash, debt, income, expense, cashFlow, rate, creditReport, ym]
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
    setBooksExtra(closeMonth(ym, booksExtra));
  };

  const doReopenMonth = () => {
    setBooksExtra(reopenMonth(ym, booksExtra));
  };

  const ledger = useMemo(() => {
    let list = [...txs];
    if (filterMonth !== "all") {
      // One month only (e.g. 2026-07)
      list = list.filter((t) => t.date.startsWith(filterMonth));
    } else {
      // "All" inside the selected year — not every year dumped together
      list = list.filter((t) => t.date.startsWith(String(filterYear)));
    }
    if (filterKind !== "all") list = list.filter((t) => t.kind === filterKind);
    if (filterTxType !== "all")
      list = list.filter((t) => txTypeOf(t) === filterTxType);
    if (filterCat !== "all") list = list.filter((t) => t.category === filterCat);
    if (filterQ.trim()) {
      const q = filterQ.trim().toLowerCase();
      list = list.filter(
        (t) =>
          (t.merchant || "").toLowerCase().includes(q) ||
          (t.note || "").toLowerCase().includes(q) ||
          (t.category || "").toLowerCase().includes(q)
      );
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
    sortKey,
    sortDir,
  ]);

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
          return (a.merchant || a.note || "").localeCompare(
            b.merchant || b.note || ""
          );
        });
        let moneyIn = 0;
        let moneyOut = 0;
        const recv = new Map<string, number>();
        const spent = new Map<string, number>();
        for (const t of sorted) {
          const name = (t.merchant || t.note || "Unknown").trim() || "Unknown";
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
        return {
          month,
          rows: sorted,
          moneyIn,
          moneyOut,
          net: moneyIn - moneyOut,
          count: sorted.length,
          topReceived,
          topSpent,
        };
      });
  }, [ledger]);

  /** Running balance after each tx (full books, not just filter) */
  const balanceById = useMemo(() => runningBalanceMap(txs), [txs]);

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
      added.push(
        newTx({
          date,
          merchant: merchant || "Pasted",
          note: merchant || "Pasted",
          amount,
          category: (cols[3] || "Uncategorized").trim() || "Uncategorized",
          kind: isNeg ? "expense" : "expense",
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

  function loadDemo() {
    const seed = demoSeedTxs();
    patchState((s) => {
      const merged = mergeTxs(s.txs, seed);
      const accounts = s.accounts.map((a) => {
        if (a.kind === "checking")
          return { ...a, balance: Math.max(a.balance, 4200) };
        if (a.kind === "savings")
          return { ...a, balance: Math.max(a.balance, 8500) };
        if (a.kind === "credit")
          return {
            ...a,
            balance: Math.max(a.balance, 1840),
            creditLimit: a.creditLimit || 5000,
          };
        return a;
      });
      const goals =
        s.goals && s.goals.length
          ? s.goals
          : [
              newGoal({ name: "Emergency fund", target: 10000, saved: 6800 }),
              newGoal({ name: "Japan trip", target: 3500, saved: 1480 }),
              newGoal({ name: "Pay off card", target: 2400, saved: 1100 }),
            ];
      const budget = s.budget.map((b) => {
        if (b.category === "Rent / housing") return { ...b, planned: 1850 };
        if (b.category === "Food / groceries") return { ...b, planned: 450 };
        if (b.category === "Restaurants / coffee")
          return { ...b, planned: 280 };
        if (b.category === "Transport") return { ...b, planned: 120 };
        if (b.category === "Subscriptions") return { ...b, planned: 60 };
        if (b.category === "Fun") return { ...b, planned: 200 };
        return b;
      });
      return { ...s, txs: merged.txs, accounts, goals, budget };
    });
    setImportNote("Demo month loaded.");
    setTab("overview");
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
    if (actionId === "auto-plan" || actionId === "import" || actionId.startsWith("over-")) {
      if (actionId === "auto-plan") autoBuildPlan();
      else if (tab) setTab(tab);
      return;
    }
    if (tab) setTab(tab);
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
          return newTx({
            date: t.date,
            kind: t.kind,
            amount: t.amount,
            category: t.category || "Uncategorized",
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

  const tabTitle =
    NAV.find((n) => n.id === tab)?.label || "Ledger";

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
        <header className="wd-top">
          <div className="wd-top-titles">
            <h1>{tabTitle}</h1>
          </div>
          <div className="wd-top-actions">
            <button
              type="button"
              className="wd-copilot-btn"
              onClick={() => setCopilotOpen(true)}
              title="Ask the AI copilot about your ledger"
            >
              <span aria-hidden>✦</span> Copilot
            </button>
            {hasEncryptedVault() && isVaultUnlocked() ? (
              <button
                type="button"
                className="wd-btn"
                onClick={onLockNow}
                title="Lock vault"
              >
                Lock
              </button>
            ) : null}
            <button
              type="button"
              className="wd-btn"
              onClick={() => fileRef.current?.click()}
            >
              Import
            </button>
            <button type="button" className="wd-btn" onClick={downloadCsv}>
              Export books
            </button>
            {state.txs.length === 0 ? (
              <button type="button" className="wd-btn" onClick={loadDemo}>
                Demo
              </button>
            ) : null}
          </div>
          {importNote ? <p className="wd-note wd-top-note">{importNote}</p> : null}
          {saveErr ? (
            <p className="wd-note wd-top-note wd-vault-err">{saveErr}</p>
          ) : null}
        </header>

        {/* Section tabs */}
        <nav className="wd-subnav wd-subnav-plain" aria-label="Finance sections">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`wd-subnav-link${tab === n.id ? " is-active" : ""}`}
              onClick={() => setTab(n.id)}
            >
              {n.label}
            </button>
          ))}
        </nav>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,.ofx,.qfx,text/csv"
          hidden
          onChange={(e) => onCsvFile(e.target.files?.[0] || null)}
        />

        {/* ════════ BOOKS (period summary) ════════ */}
        {tab === "overview" ? (
          <div className="wd-overview">
            {/* Bookkeeper period close — not a vanity dashboard */}
            <section className="wd-panel wd-brain">
              <div className="wd-brain-top">
                <div>
                  <p className="wd-brain-k">Period · {ym}</p>
                  <h2 className="wd-brain-h">{brief.headline}</h2>
                </div>
                <div
                  className="wd-brain-q"
                  title="Ruthless reinvest score this period"
                >
                  <span>Ruthless</span>
                  <strong>{brief.reinvest.ruthlessness}</strong>
                </div>
              </div>
              <div className="wd-reinvest-strip">
                <span>
                  Keep target{" "}
                  <strong>
                    {Math.round(brief.reinvest.targetRate * 100)}%
                  </strong>
                </span>
                <span>
                  Actual{" "}
                  <strong>
                    {brief.reinvest.actualRate == null
                      ? "—"
                      : `${Math.round(brief.reinvest.actualRate * 100)}%`}
                  </strong>
                </span>
                <span>
                  Deploy now{" "}
                  <strong className={brief.reinvest.deployNow > 0 ? "is-neg" : "is-pos"}>
                    {moneyCents(brief.reinvest.deployNow)}
                  </strong>
                </span>
                <span>
                  Invest book{" "}
                  <strong>{moneyCents(brief.reinvest.investedBalance)}</strong>
                </span>
              </div>
              {brief.dataQuality.score < 50 ? (
                <div className="wd-brain-cta">
                  <button
                    type="button"
                    className="wd-btn wd-btn-primary"
                    onClick={() =>
                      state.txs.length === 0 ? loadDemo() : autoBuildPlan()
                    }
                  >
                    {state.txs.length === 0
                      ? "Load demo to see the brain work"
                      : "Auto-build plan from spend"}
                  </button>
                  <button
                    type="button"
                    className="wd-btn"
                    onClick={() => fileRef.current?.click()}
                  >
                    Import bank CSV
                  </button>
                </div>
              ) : null}
              {brief.dataQuality.hasTxs ? (
                <div className="wd-reinvest-strip">
                  <span>
                    Burn/day{" "}
                    <strong>{money(brief.projection.burnPerDay)}</strong>
                  </span>
                  <span>
                    Month-end flow{" "}
                    <strong
                      className={
                        brief.projection.projectedFlow < 0 ? "is-neg" : "is-pos"
                      }
                    >
                      {money(brief.projection.projectedFlow)}
                    </strong>
                  </span>
                  <span>
                    Day{" "}
                    <strong>
                      {brief.projection.dayOfMonth}/{brief.projection.daysInMonth}
                    </strong>
                  </span>
                </div>
              ) : null}
            </section>

            {/* ═══ 14 accounting modules — work first, no chrome ═══ */}
            <section className="wd-panel wd-acct-modules">
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
                        {c.merchant} · {moneyCents(c.avgAmount)} · {c.times}×
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Variance */}
              <h3 style={{ marginTop: 16 }}>Variance · {ym}</h3>
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
              <h3 style={{ marginTop: 16 }}>Monthly close · {ym}</h3>
              <ul className="wd-acct-list">
                {accounting.monthlyClose.checks.map((c) => (
                  <li key={c.id}>
                    {c.ok ? "✓" : "✗"} {c.label} — {c.detail}
                  </li>
                ))}
              </ul>
              <div className="wd-acct-actions">
                {accounting.monthlyClose.locked ? (
                  <button type="button" className="wd-btn" onClick={doReopenMonth}>
                    Reopen {ym}
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
                        : `Score ${accounting.monthlyClose.score}/100 — fix checks first`
                    }
                  >
                    Close {ym} ({accounting.monthlyClose.score}/100)
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
                        {p.what} · {moneyCents(p.amount)} · due {p.dueDate}{" "}
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
                        {r.who} · {moneyCents(r.amount)} · due {r.dueDate}{" "}
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

            {/* Snapshot row */}
            <section className="wd-panel">
              <div className="wd-panel-head">
                <h2>Financial snapshot</h2>
                <span className="wd-chip">
                  {brief.dataQuality.score >= 70 ? "Live" : "Partial"}
                </span>
              </div>
              <div className="wd-snap">
                <div className="wd-metric">
                  <span>Net worth</span>
                  <strong className={worth < 0 ? "is-neg" : ""}>
                    {money(worth)}
                  </strong>
                  <em>
                    Cash {money(cash)} · Invested {money(inv)}
                  </em>
                </div>
                <div className="wd-metric">
                  <span>Fun after reinvest</span>
                  <strong title="After essentials, debt floor, and reinvest target">
                    {money(safeToSpend)}
                  </strong>
                  <em>cash − essentials left − debt floor − burn buffer</em>
                </div>
                <div className="wd-metric">
                  <span>Monthly cash flow</span>
                  <strong className={cashFlow < 0 ? "is-neg" : "is-pos"}>
                    {cashFlow >= 0 ? "+" : ""}
                    {money(cashFlow)}
                  </strong>
                  <em>
                    In {money(income)} · Out {money(expense)}
                  </em>
                </div>
                <div className="wd-metric">
                  <span>Runway</span>
                  <strong>
                    {runwayMonths > 24
                      ? "24+"
                      : runwayMonths.toFixed(1)}{" "}
                    <small>months</small>
                  </strong>
                  <em>
                    burn {money(brief.projection.burnPerDay)}/day
                  </em>
                </div>
              </div>
            </section>

            <div className="wd-grid-2">
              {/* Money in and out */}
              <section className="wd-panel">
                <div className="wd-panel-head">
                  <h2>Money in and out</h2>
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

              {/* Ranked next actions from the engine */}
              <section className="wd-panel">
                <div className="wd-panel-head">
                  <h2>Next moves</h2>
                  <span className="wd-muted">ranked by impact</span>
                </div>
                <ul className="wd-alerts">
                  {brief.actions.map((a) => (
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
                        <td>{t.date}</td>
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
                          No transactions — load demo or import CSV.
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
                  "Can I afford a trip?",
                  "How is my credit?",
                  "What's my runway?",
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
            {transferPairs.length ? (
              <section className="wd-panel" aria-label="Likely transfers">
                <div className="wd-panel-head">
                  <h2>Likely transfers · {transferPairs.length}</h2>
                </div>
                <ul className="wd-acct-list">
                  {transferPairs.slice(0, 6).map((pr) => (
                    <li key={`${pr.outTx.id}-${pr.inTx.id}`}>
                      {pr.outTx.date} · {pr.outTx.merchant || pr.outTx.note}{" "}
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
              <div className="wd-panel-head">
                <div>
                  <h2>Ledger</h2>
                </div>
              </div>

              {/* CSV-only books: entries come from monthly imports, never typed */}

              {/* Filters stacked: search · type · category · year · months */}
              <div className="wd-filters wd-filters-ledger">
                <input
                  type="search"
                  placeholder="Search"
                  value={filterQ}
                  onChange={(e) => setFilterQ(e.target.value)}
                />
                <select
                  value={filterKind}
                  onChange={(e) =>
                    setFilterKind(e.target.value as "all" | TxKind)
                  }
                >
                  <option value="all">All in/out</option>
                  <option value="expense">Money out</option>
                  <option value="income">Money in</option>
                </select>
                {txTypes.length > 0 ? (
                  <select
                    value={filterTxType}
                    onChange={(e) => setFilterTxType(e.target.value)}
                  >
                    <option value="all">All tx types</option>
                    {txTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                ) : null}
                <select
                  value={filterCat}
                  onChange={(e) => setFilterCat(e.target.value)}
                >
                  <option value="all">All categories</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {/* Year right next to categories */}
                <nav className="wd-year-nav wd-year-nav-inline" aria-label="Year">
                  {years.map((y) => (
                    <button
                      key={y}
                      type="button"
                      className={
                        filterYear === y
                          ? "wd-year-nav-link is-active"
                          : "wd-year-nav-link"
                      }
                      onClick={() => {
                        setFilterYear(y);
                        setFilterMonth("all");
                      }}
                    >
                      {y}
                    </button>
                  ))}
                </nav>
              </div>

              {/* Months on the same control strip as categories — Jan → current */}
              <nav className="wd-month-nav wd-month-nav-inline" aria-label="Month">
                <button
                  type="button"
                  className={
                    filterMonth === "all"
                      ? "wd-month-nav-link is-active"
                      : "wd-month-nav-link"
                  }
                  onClick={() => setFilterMonth("all")}
                >
                  All
                </button>
                {months.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={
                      filterMonth === m
                        ? "wd-month-nav-link is-active"
                        : "wd-month-nav-link"
                    }
                    onClick={() => setFilterMonth(m)}
                  >
                    {monthLabel(m)}
                  </button>
                ))}
              </nav>

              <p className="wd-muted" style={{ margin: "0 0 12px", fontSize: 12 }}>
                {ledger.length} line{ledger.length === 1 ? "" : "s"}
                {filterMonth === "all"
                  ? ` · ${filterYear} full year`
                  : ` · ${monthLabelLong(filterMonth)} ${filterYear}`}
              </p>

              {monthBooks.length === 0 ? (
                <p className="wd-muted wd-pad">Import a bank CSV to start.</p>
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
                          <p className="wd-muted">
                            {book.count} line{book.count === 1 ? "" : "s"} · in{" "}
                            <strong className="is-pos">
                              {moneyCents(book.moneyIn)}
                            </strong>{" "}
                            · out{" "}
                            <strong className="is-neg">
                              {moneyCents(book.moneyOut)}
                            </strong>{" "}
                            · net{" "}
                            <strong
                              className={book.net >= 0 ? "is-pos" : "is-neg"}
                            >
                              {moneyCents(book.net)}
                            </strong>
                          </p>
                        </div>
                      </header>

                      <div className="wd-table-wrap wd-month-full">
                        <table className="wd-table wd-edit wd-ledger-table wd-ledger-full">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Payee / full description</th>
                              <th>Category</th>
                              <th className="num">Amount</th>
                              <th className="num">Balance</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {book.rows.map((t) => (
                              <tr
                                key={t.id}
                                className={
                                  !t.category ||
                                  t.category === "Uncategorized" ||
                                  t.category === "Other" ||
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
                                    className="wd-payee-input"
                                    value={t.merchant || t.note || ""}
                                    title={t.merchant || t.note || ""}
                                    placeholder="Full payee name"
                                    onChange={(e) =>
                                      patchTx(t.id, {
                                        merchant: e.target.value,
                                        note: e.target.value,
                                      })
                                    }
                                  />
                                  <div
                                    className="wd-muted"
                                    style={{
                                      fontSize: "0.8em",
                                      marginTop: "2px",
                                    }}
                                  >
                                    {txTypeOf(t)}
                                  </div>
                                </td>
                                <td>
                                  <select
                                    value={t.category}
                                    onChange={(e) =>
                                      patchTx(t.id, {
                                        category: e.target.value,
                                      })
                                    }
                                  >
                                    {categories.map((c) => (
                                      <option key={c} value={c}>
                                        {c}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="num">
                                  <input
                                    type="number"
                                    step="0.01"
                                    title={
                                      t.kind === "income"
                                        ? "Money in — green"
                                        : "Money out — red"
                                    }
                                    className={
                                      t.kind === "income" ? "is-pos" : "is-neg"
                                    }
                                    value={t.amount || ""}
                                    onChange={(e) =>
                                      patchTx(t.id, {
                                        amount: Math.max(
                                          0,
                                          Math.round(
                                            (Number(e.target.value) || 0) * 100
                                          ) / 100
                                        ),
                                      })
                                    }
                                  />
                                </td>
                                <td
                                  className={`num wd-balance ${
                                    (balanceById.get(t.id) || 0) >= 0
                                      ? "is-pos"
                                      : "is-neg"
                                  }`}
                                >
                                  {moneyCents(balanceById.get(t.id) || 0)}
                                </td>
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
                            ))}
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
                <svg width={160} height={160} viewBox="-1.2 -1.2 2.4 2.4">
                  {(() => {
                    const parts = [
                      { v: annualBook.split.income, color: "#1f6f8b" },
                      { v: annualBook.split.expenses, color: "#e8743b" },
                      { v: annualBook.split.saved, color: "#2e7d32" },
                    ].filter((p) => p.v > 0);
                    const total = parts.reduce((s, p) => s + p.v, 0) || 1;
                    let angle = -Math.PI / 2;
                    return parts.map((p, i) => {
                      const frac = p.v / total;
                      const a2 = angle + frac * Math.PI * 2;
                      const large = frac > 0.5 ? 1 : 0;
                      const x1 = Math.cos(angle);
                      const y1 = Math.sin(angle);
                      const x2 = Math.cos(a2);
                      const y2 = Math.sin(a2);
                      angle = a2;
                      if (frac >= 0.999) {
                        return <circle key={i} r={1} fill={p.color} />;
                      }
                      return (
                        <path
                          key={i}
                          d={`M0,0 L${x1},${y1} A1,1 0 ${large} 1 ${x2},${y2} Z`}
                          fill={p.color}
                        />
                      );
                    });
                  })()}
                  <circle r={0.45} fill="var(--wd-bg, #000)" />
                </svg>
                <div className="wd-annual-legend">
                  <div>
                    <span style={{ color: "#1f6f8b" }}>■</span> Income{" "}
                    {money(annualBook.income.annualTotal)}
                  </div>
                  <div>
                    <span style={{ color: "#e8743b" }}>■</span> Expenses{" "}
                    {money(annualBook.expenses.annualTotal)}
                  </div>
                  <div>
                    <span style={{ color: "#2e7d32" }}>■</span> Potential to save{" "}
                    <strong
                      className={
                        annualBook.potentialToSave >= 0 ? "is-pos" : "is-neg"
                      }
                    >
                      {money(annualBook.potentialToSave)}
                    </strong>
                  </div>
                </div>
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
                  {money(planSpent)} of {money(planPlanned)} planned
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
                {state.txs.length === 0 ? (
                  <button
                    type="button"
                    className="wd-btn"
                    onClick={loadDemo}
                  >
                    Load demo first
                  </button>
                ) : null}
              </div>
              <p className="wd-muted wd-pad">
                No typing. Import bank CSV or connect Plaid → tap Auto-build.
                Nudge with + / − if you want.
              </p>

              {state.budget.map((b) => {
                const spent = spentMap[b.category] || 0;
                const pct =
                  b.planned > 0
                    ? Math.min(100, Math.round((spent / b.planned) * 100))
                    : spent > 0
                      ? 100
                      : 0;
                const over = b.planned > 0 && spent > b.planned;
                return (
                  <div key={b.category} className="wd-budget-row">
                    <div className="wd-budget-main">
                      <strong>{b.category}</strong>
                      <div className="wd-progress">
                        <i
                          className={over ? "is-over" : ""}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <em>
                        Spent {money(spent)}
                        {b.planned > 0 ? ` · Plan ${money(b.planned)}` : " · no plan yet"}
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

                  {/* Donut — share of monthly subscription spend */}
                  <div className="wd-sub-chart">
                    {(() => {
                      const R = 70;
                      const C = 2 * Math.PI * R;
                      const total = subscriptionScan.monthlyTotal || 1;
                      const palette = [
                        "#1f6f8b", "#e8743b", "#4b8f6b", "#b5651d", "#7d5ba6",
                        "#c94f7c", "#3a7d99", "#d1a13a", "#5c8d5c", "#a0522d",
                      ];
                      let offset = 0;
                      const segs = subscriptionScan.subs.map((s, i) => {
                        const frac = s.monthlyCost / total;
                        const len = frac * C;
                        const seg = (
                          <circle
                            key={s.key}
                            cx={90}
                            cy={90}
                            r={R}
                            fill="none"
                            stroke={palette[i % palette.length]}
                            strokeWidth={26}
                            strokeDasharray={`${len} ${C - len}`}
                            strokeDashoffset={-offset}
                            transform="rotate(-90 90 90)"
                          />
                        );
                        offset += len;
                        return seg;
                      });
                      return (
                        <svg width={180} height={180} viewBox="0 0 180 180" className="wd-donut">
                          <circle cx={90} cy={90} r={R} fill="none" stroke="var(--wd-line, #2a2a2a)" strokeWidth={26} opacity={0.25} />
                          {segs}
                          <text x={90} y={84} textAnchor="middle" className="wd-donut-big">
                            {money(subscriptionScan.monthlyTotal)}
                          </text>
                          <text x={90} y={104} textAnchor="middle" className="wd-donut-sub">
                            /mo
                          </text>
                        </svg>
                      );
                    })()}
                    <ul className="wd-sub-legend">
                      {subscriptionScan.subs.slice(0, 8).map((s, i) => {
                        const palette = [
                          "#1f6f8b", "#e8743b", "#4b8f6b", "#b5651d", "#7d5ba6",
                          "#c94f7c", "#3a7d99", "#d1a13a", "#5c8d5c", "#a0522d",
                        ];
                        return (
                          <li key={s.key}>
                            <span
                              className="wd-sub-dot"
                              style={{ background: palette[i % palette.length] }}
                            />
                            <span className="wd-sub-legend-name">{s.merchant}</span>
                            <span className="wd-sub-legend-val">{money(s.monthlyCost)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </section>

                <section className="wd-panel" aria-label="Subscription list">
                  <table className="wd-sub-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Cadence</th>
                        <th className="wd-num">Charge</th>
                        <th className="wd-num">Monthly</th>
                        <th className="wd-num">Yearly</th>
                        <th>Next</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subscriptionScan.subs.map((s) => (
                        <tr key={s.key}>
                          <td>
                            {s.merchant}
                            {s.count > 1 ? (
                              <span className="wd-muted"> ·{s.count}×</span>
                            ) : null}
                          </td>
                          <td>
                            <span className={`wd-cad wd-cad-${s.cadence}`}>
                              {CADENCE_LABEL[s.cadence]}
                            </span>
                          </td>
                          <td className="wd-num">{money(s.amount)}</td>
                          <td className="wd-num">{money(s.monthlyCost)}</td>
                          <td className="wd-num">{money(s.yearlyCost)}</td>
                          <td className="wd-muted">{s.nextDate}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                        {latest.date}
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
                            Due {r.dueDate} ({r.daysUntilDue} day
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
                    label: `${sn.date}: ${moneyCents(sn.total)} (bank ${moneyCents(sn.bankNet)}${sn.valuationNet ? ` + assets ${moneyCents(sn.valuationNet)}` : ""})`,
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
                        <td>{sn.date}</td>
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
                    <strong>{moneyCents(composition.total)}</strong>
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
                            as of {latest.point.date} (
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
                            value={a.balance}
                            onChange={(e) =>
                              patchAccount(a.id, {
                                balance: Number(e.target.value) || 0,
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

