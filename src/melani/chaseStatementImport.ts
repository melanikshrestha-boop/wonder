/**
 * Apply real Chase College Checking statement history (PDF-extracted)
 * into the local finance books. Re-runable; versioned so updates replace
 * prior Chase import rows without deleting your manual entries.
 */

import {
  CHASE_STATEMENT_ACCOUNTS,
  CHASE_STATEMENT_META,
  CHASE_STATEMENT_TXS,
} from "./chaseStatementData";
import {
  normalizeImportedTransactionCategory,
  zellePurposeCategory,
} from "./financeCategorize";
import type { FinanceAccount, FinanceState, FinanceTx } from "./financeStore";

/** Bump when re-extracted statements should force re-merge */
/** Bump when Chase CSV/PDF re-import should force re-merge into local books */
export const CHASE_IMPORT_VERSION =
  "chase-v6-income-expense-categories";

const FLAG_KEY = "wonder-finance-chase-import-version";

export function chaseImportNeeded(): boolean {
  try {
    return localStorage.getItem(FLAG_KEY) !== CHASE_IMPORT_VERSION;
  } catch {
    return true;
  }
}

export function markChaseImportDone() {
  try {
    localStorage.setItem(FLAG_KEY, CHASE_IMPORT_VERSION);
  } catch {
    /* ignore */
  }
}

function isChaseImportTx(t: FinanceTx): boolean {
  return (
    t.id.startsWith("chase-") ||
    (typeof t.externalId === "string" && t.externalId.startsWith("chase-"))
  );
}

function mergeAccounts(
  existing: FinanceAccount[],
  statement: typeof CHASE_STATEMENT_ACCOUNTS
): FinanceAccount[] {
  const next = [...existing];
  for (const acc of statement) {
    const i = next.findIndex(
      (a) =>
        a.id === acc.id ||
        (a.institution === "Chase" && a.mask === acc.mask) ||
        (a.name.toLowerCase().includes("chase") && a.kind === acc.kind)
    );
    if (i >= 0) {
      next[i] = {
        ...next[i],
        ...acc,
        // Keep user credit limit if they set one
        creditLimit: next[i].creditLimit ?? acc.creditLimit ?? null,
      };
    } else {
      next.push({ ...acc });
    }
  }
  // Drop empty demo defaults that are clearly placeholders when Chase is present
  return next.filter((a) => {
    if (a.id.startsWith("acc-chase-")) return true;
    if (
      ["acc-checking", "acc-savings", "acc-cash", "acc-credit"].includes(a.id) &&
      a.balance === 0 &&
      !a.institution
    ) {
      return false;
    }
    return true;
  });
}

/**
 * Replace prior Chase-imported rows with the full statement set,
 * keep manual/csv/plaid lines that aren't from this import.
 */
export function applyChaseStatements(state: FinanceState): {
  state: FinanceState;
  added: number;
  keptManual: number;
} {
  // Keep Plaid/other bank imports; drop prior Chase PDF rows and demo/manual filler
  // so the daybook is the real statement history.
  const priorStatementRows = new Map(
    state.txs
      .filter(isChaseImportTx)
      .map((transaction) => [
        transaction.externalId || transaction.id,
        transaction,
      ])
  );
  const keep = state.txs.filter(
    (t) =>
      !isChaseImportTx(t) &&
      (t.source === "plaid" || t.source === "csv")
  );
  const statementTxs: FinanceTx[] = CHASE_STATEMENT_TXS.map((t) => {
    const previous = priorStatementRows.get(t.externalId || t.id);
    const previousCategory = (previous?.category || "").trim();
    const previousHasPurpose =
      !!previous?.categoryReviewed &&
      !/^(zelle|income|other|uncategorized)$/i.test(previousCategory);
    if (previousHasPurpose) {
      return {
        ...t,
        category: previousCategory,
        categoryReviewed: true,
      };
    }
    const categoryText = `${t.merchant || ""} ${t.note || ""}`;
    return {
      ...t,
      category: normalizeImportedTransactionCategory(
        t.category,
        categoryText,
        t.kind
      ),
      categoryReviewed: zellePurposeCategory(categoryText, t.kind) != null,
    };
  });
  const txs = [...keep, ...statementTxs].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0
  );
  return {
    state: {
      ...state,
      accounts: mergeAccounts(state.accounts, CHASE_STATEMENT_ACCOUNTS),
      txs,
    },
    added: statementTxs.length,
    keptManual: keep.length,
  };
}

export function chaseStatementSummary(): string {
  return `${CHASE_STATEMENT_META.count} Chase lines · ${CHASE_STATEMENT_META.from} → ${CHASE_STATEMENT_META.to}`;
}
