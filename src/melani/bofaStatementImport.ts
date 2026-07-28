/**
 * Apply Bank of America Adv SafeBalance (···8804) statement history
 * into local finance books. Versioned so updates re-merge without
 * wiping Chase or manual/csv/plaid lines.
 */

import {
  BOFA_STATEMENT_ACCOUNTS,
  BOFA_STATEMENT_META,
  BOFA_STATEMENT_TXS,
} from "./bofaStatementData";
import {
  normalizeImportedTransactionCategory,
  zellePurposeCategory,
} from "./financeCategorize";
import type { FinanceAccount, FinanceState, FinanceTx } from "./financeStore";

/** Bump when BofA re-extract should force re-merge */
export const BOFA_IMPORT_VERSION = "bofa-v4-family-repayments";

const FLAG_KEY = "wonder-finance-bofa-import-version";

export function bofaImportNeeded(): boolean {
  try {
    return localStorage.getItem(FLAG_KEY) !== BOFA_IMPORT_VERSION;
  } catch {
    return true;
  }
}

export function markBofaImportDone() {
  try {
    localStorage.setItem(FLAG_KEY, BOFA_IMPORT_VERSION);
  } catch {
    /* ignore */
  }
}

function isBofaImportTx(t: FinanceTx): boolean {
  return (
    t.id.startsWith("bofa-") ||
    (typeof t.externalId === "string" && t.externalId.startsWith("bofa-"))
  );
}

function mergeAccounts(
  existing: FinanceAccount[],
  statement: typeof BOFA_STATEMENT_ACCOUNTS
): FinanceAccount[] {
  const next = [...existing];
  for (const acc of statement) {
    const i = next.findIndex(
      (a) =>
        a.id === acc.id ||
        (a.institution === "Bank of America" && a.mask === acc.mask)
    );
    if (i >= 0) {
      next[i] = {
        ...next[i],
        ...acc,
        creditLimit: next[i].creditLimit ?? acc.creditLimit ?? null,
      };
    } else {
      next.push({ ...acc });
    }
  }
  return next;
}

/**
 * Replace prior BofA-imported rows; keep Chase/plaid/csv/manual.
 */
export function applyBofaStatements(state: FinanceState): {
  state: FinanceState;
  added: number;
  keptOther: number;
} {
  const priorStatementRows = new Map(
    state.txs
      .filter(isBofaImportTx)
      .map((transaction) => [
        transaction.externalId || transaction.id,
        transaction,
      ])
  );
  const keep = state.txs.filter((t) => !isBofaImportTx(t));
  const statementTxs: FinanceTx[] = BOFA_STATEMENT_TXS.map((t) => {
    const previous = priorStatementRows.get(t.externalId || t.id);
    if (previous?.categoryReviewed) {
      return {
        ...t,
        category: previous.category,
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
      accounts: mergeAccounts(state.accounts, BOFA_STATEMENT_ACCOUNTS),
      txs,
    },
    added: statementTxs.length,
    keptOther: keep.length,
  };
}

export function bofaStatementSummary(): string {
  return `${BOFA_STATEMENT_META.count} BofA lines · ${BOFA_STATEMENT_META.from} → ${BOFA_STATEMENT_META.to} · end $${BOFA_STATEMENT_META.endingBalance}`;
}
