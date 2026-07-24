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
import type { FinanceAccount, FinanceState, FinanceTx } from "./financeStore";

/** Bump when BofA re-extract should force re-merge */
export const BOFA_IMPORT_VERSION = "bofa-v1-8804-mar2026-jun2026";

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
  const keep = state.txs.filter((t) => !isBofaImportTx(t));
  const statementTxs: FinanceTx[] = BOFA_STATEMENT_TXS.map((t) => ({ ...t }));
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
