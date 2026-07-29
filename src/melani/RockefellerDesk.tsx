import { useEffect, useMemo, useState } from "react";
import { moneyCents, type FinanceState } from "./financeStore";
import {
  AUGUST_2026,
  AUGUST_REVENUE_TARGET,
  buildAugustPlan,
  buildOwnerReport,
  buildProfitBridge,
  buildReimbursementDesk,
  buildUnitEconomics,
  buildWasteReport,
} from "./rockefellerFinance";

const SETTINGS_KEY = "wonder-rockefeller-desk-v1";

type DeskSettings = {
  targetIncome: number;
  personalCapRate: 0.01 | 0.05;
};

function loadSettings(): DeskSettings {
  if (typeof localStorage === "undefined")
    return { targetIncome: AUGUST_REVENUE_TARGET, personalCapRate: 0.05 };
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return {
      targetIncome:
        Number.isFinite(Number(parsed.targetIncome)) &&
        Number(parsed.targetIncome) >= 0
          ? Number(parsed.targetIncome)
          : AUGUST_REVENUE_TARGET,
      personalCapRate: parsed.personalCapRate === 0.01 ? 0.01 : 0.05,
    };
  } catch {
    return { targetIncome: AUGUST_REVENUE_TARGET, personalCapRate: 0.05 };
  }
}

function monthName(ym: string): string {
  const [year, month] = ym.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function pct(value: number | null): string {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

export function RockefellerDesk({
  state,
  actualYm,
}: {
  state: FinanceState;
  actualYm: string;
}) {
  const [settings, setSettings] = useState(loadSettings);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  const plan = useMemo(
    () =>
      buildAugustPlan(
        settings.targetIncome,
        settings.personalCapRate,
        0.01
      ),
    [settings]
  );
  const waste = useMemo(
    () => buildWasteReport(state.txs, actualYm),
    [state.txs, actualYm]
  );
  const unitEconomics = useMemo(
    () => buildUnitEconomics(state.txs, actualYm),
    [state.txs, actualYm]
  );
  const bridge = useMemo(
    () => buildProfitBridge(state.txs, actualYm),
    [state.txs, actualYm]
  );
  const reimbursements = useMemo(
    () => buildReimbursementDesk(state.txs, actualYm),
    [state.txs, actualYm]
  );
  const owner = useMemo(
    () => buildOwnerReport(state, actualYm, plan),
    [state, actualYm, plan]
  );
  const personalLine = plan.allocations.find(
    (allocation) => allocation.id === "personal"
  );

  return (
    <section className="wd-panel wd-rockefeller" aria-label="Owner capital desk">
      <header className="wd-rockefeller-head">
        <div>
          <p className="wd-kicker">OWNER CAPITAL DESK · FORECAST, NOT REVENUE</p>
          <h2>August 2026 allocation</h2>
          <p className="wd-muted">
            The plan activates only as money actually arrives. Until then,
            $10,000 is a target—not cash.
          </p>
        </div>
        <label className="wd-owner-target">
          <span>Target receipts</span>
          <span className="wd-owner-money-input">
            $
            <input
              type="number"
              min="0"
              step="100"
              value={settings.targetIncome}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  targetIncome: Math.max(0, Number(event.target.value) || 0),
                }))
              }
            />
          </span>
        </label>
      </header>

      <div className="wd-cap-choice" aria-label="Personal purchasing power">
        <span>Personal purchasing-power ceiling</span>
        <button
          type="button"
          className={settings.personalCapRate === 0.05 ? "is-active" : ""}
          onClick={() =>
            setSettings((current) => ({
              ...current,
              personalCapRate: 0.05,
            }))
          }
        >
          5% · {moneyCents(settings.targetIncome * 0.05)}
        </button>
        <button
          type="button"
          className={settings.personalCapRate === 0.01 ? "is-active" : ""}
          onClick={() =>
            setSettings((current) => ({
              ...current,
              personalCapRate: 0.01,
            }))
          }
        >
          1% discipline · {moneyCents(settings.targetIncome * 0.01)}
        </button>
      </div>

      <div className="wd-owner-allocation" aria-label="Capital allocation">
        {plan.allocations.map((allocation) => (
          <article key={allocation.id}>
            <div>
              <strong>{allocation.label}</strong>
              <span>{Math.round(allocation.percent * 100)}%</span>
            </div>
            <b>{moneyCents(allocation.amount)}</b>
            <p>{allocation.rule}</p>
          </article>
        ))}
      </div>

      <div className="wd-owner-columns">
        <section>
          <h3>Personal envelope · maximum {moneyCents(personalLine?.amount || 0)}</h3>
          <table className="wd-owner-table">
            <tbody>
              {plan.personal.map((line) => (
                <tr
                  key={line.label}
                  className={line.label === "Restaurants" ? "is-ban" : ""}
                >
                  <th>{line.label}</th>
                  <td>{moneyCents(line.amount)}</td>
                  <td>{line.rule}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h3>Reinvestment money + weekly time</h3>
          <table className="wd-owner-table">
            <tbody>
              {plan.reinvestment.map((line) => (
                <tr key={line.label}>
                  <th>{line.label}</th>
                  <td>{moneyCents(line.amount)}</td>
                  <td>{line.hoursPerWeek}h/week</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <div className="wd-owner-rule">
        <strong>Purchasing-power rule</strong>
        <span>
          The cap rises only when posted earned revenue rises. Family funding,
          reimbursements, gifts, transfers, and forecast income do not increase
          it.
        </span>
      </div>

      <section className="wd-owner-section" aria-label="Waste detector">
        <header>
          <div>
            <p className="wd-kicker">WASTE DETECTOR · {monthName(actualYm).toUpperCase()}</p>
            <h3>
              {waste.restaurantViolations
                ? `${waste.restaurantViolations} restaurant violation${waste.restaurantViolations === 1 ? "" : "s"}`
                : "Restaurant rule intact"}
            </h3>
          </div>
          <strong
            className={waste.restaurantViolations ? "is-neg" : "is-pos"}
          >
            {moneyCents(waste.avoidableTotal)}
          </strong>
        </header>
        {waste.findings.length ? (
          <ol className="wd-owner-findings">
            {waste.findings.map((finding) => (
              <li key={finding.id} className={`is-${finding.severity}`}>
                <strong>{finding.title}</strong>
                <span>{finding.detail}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="wd-muted">
            No restaurant, fee, duplicate, or oversized subscription signal in
            this month’s posted data.
          </p>
        )}
      </section>

      <section className="wd-owner-section" aria-label="Unit economics">
        <header>
          <div>
            <p className="wd-kicker">UNIT ECONOMICS · EXPLICIT TAGS ONLY</p>
            <h3>Online and technology contribution</h3>
          </div>
        </header>
        <div className="wd-unit-grid">
          {unitEconomics.map((lane) => (
            <article key={lane.id}>
              <h4>{lane.label}</h4>
              <dl>
                <div>
                  <dt>Revenue</dt>
                  <dd>{moneyCents(lane.revenue)}</dd>
                </div>
                <div>
                  <dt>Direct costs</dt>
                  <dd>{moneyCents(lane.directCosts)}</dd>
                </div>
                <div>
                  <dt>Contribution profit</dt>
                  <dd
                    className={
                      lane.contributionProfit >= 0 ? "is-pos" : "is-neg"
                    }
                  >
                    {moneyCents(lane.contributionProfit)}
                  </dd>
                </div>
                <div>
                  <dt>Margin</dt>
                  <dd>{pct(lane.margin)}</dd>
                </div>
              </dl>
              {!lane.revenue && !lane.directCosts ? (
                <p>
                  Start tagging ledger rows as {lane.label} income and direct
                  costs.
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="wd-owner-section" aria-label="True profit bridge">
        <header>
          <div>
            <p className="wd-kicker">TRUE PROFIT VS. MONEY MOVEMENT</p>
            <h3>{monthName(actualYm)} bridge</h3>
          </div>
          <strong className={bridge.trueProfit >= 0 ? "is-pos" : "is-neg"}>
            {moneyCents(bridge.trueProfit)} true profit
          </strong>
        </header>
        <div className="wd-profit-bridge">
          <dl>
            <div>
              <dt>Raw money in</dt>
              <dd>{moneyCents(bridge.rawMoneyIn)}</dd>
            </div>
            <div>
              <dt>Earned revenue</dt>
              <dd>{moneyCents(bridge.earnedRevenue)}</dd>
            </div>
            <div>
              <dt>Family funding</dt>
              <dd>{moneyCents(bridge.familyFunding)}</dd>
            </div>
            <div>
              <dt>Reimbursements</dt>
              <dd>{moneyCents(bridge.reimbursements)}</dd>
            </div>
            <div>
              <dt>Transfers in</dt>
              <dd>{moneyCents(bridge.transfersIn)}</dd>
            </div>
          </dl>
          <dl>
            <div>
              <dt>Raw money out</dt>
              <dd>{moneyCents(bridge.rawMoneyOut)}</dd>
            </div>
            <div>
              <dt>Operating expenses</dt>
              <dd>{moneyCents(bridge.operatingExpenses)}</dd>
            </div>
            <div>
              <dt>Transfers/card settlements</dt>
              <dd>{moneyCents(bridge.transfersOut)}</dd>
            </div>
            <div>
              <dt>Debt/family repayments</dt>
              <dd>{moneyCents(bridge.debtRepayments)}</dd>
            </div>
            <div>
              <dt>Earned revenue − operating expenses</dt>
              <dd className={bridge.trueProfit >= 0 ? "is-pos" : "is-neg"}>
                {moneyCents(bridge.trueProfit)}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="wd-owner-section" aria-label="Reimbursement matching">
        <header>
          <div>
            <p className="wd-kicker">REIMBURSEMENT MATCHING</p>
            <h3>
              {moneyCents(reimbursements.matched)} matched to original expenses
            </h3>
          </div>
          <strong className={reimbursements.unmatched ? "is-neg" : "is-pos"}>
            {moneyCents(reimbursements.unmatched)} unmatched
          </strong>
        </header>
        {reimbursements.matches.length ? (
          <table className="wd-owner-table">
            <thead>
              <tr>
                <th>Original expense</th>
                <th>Recovered</th>
                <th>Timing</th>
                <th>Match</th>
              </tr>
            </thead>
            <tbody>
              {reimbursements.matches.slice(0, 8).map((match) => (
                <tr key={match.reimbursementId}>
                  <th>{match.payee}</th>
                  <td>{moneyCents(match.amount)}</td>
                  <td>{match.daysApart} days</td>
                  <td>{match.confidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="wd-muted">
            No reimbursement credit can yet be matched to a prior expense.
          </p>
        )}
      </section>

      <section className="wd-owner-section" aria-label="Monthly owner report">
        <header>
          <div>
            <p className="wd-kicker">MONTHLY OWNER REPORT · {monthName(owner.ym).toUpperCase()}</p>
            <h3>{moneyCents(owner.trueFlow)} true cash flow</h3>
          </div>
          <strong>
            {moneyCents(owner.earnedRevenue)} earned ·{" "}
            {moneyCents(owner.trueSpend)} spent
          </strong>
        </header>
        <ol className="wd-owner-actions">
          {owner.actions.map((action, index) => (
            <li key={`${index}-${action}`}>{action}</li>
          ))}
        </ol>
        {actualYm !== AUGUST_2026 ? (
          <p className="wd-muted">
            August forecast gap: {moneyCents(owner.allocationVariance)} remains
            unearned. It will decrease only when Online income, Technology
            income, Photography, or Reselling revenue posts.
          </p>
        ) : null}
      </section>
    </section>
  );
}
