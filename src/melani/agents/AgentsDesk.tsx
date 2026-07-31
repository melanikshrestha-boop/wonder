/**
 * Body OS — Data Guardian · Data Vault · Twin
 * Editorial desk: black canvas, warm ink, one clear hierarchy.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { todayKey } from "../data";
import { writeTwin, type TwinState } from "../twin";
import {
  guardianDomainStatuses,
  hydrateFromDisk,
  mirrorAllToDisk,
  onGuardianChange,
  type DomainStatus,
} from "./dataGuardian";
import {
  listVault,
  maybeAutoSnapshot,
  restoreVaultMerge,
  takeVaultSnapshot,
  type VaultItem,
} from "./dataVault";
import "./agents-desk.css";

function scoreTone(n: number): "high" | "mid" | "low" {
  if (n >= 70) return "high";
  if (n >= 48) return "mid";
  return "low";
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function AgentsDesk() {
  const [domains, setDomains] = useState<DomainStatus[]>(() =>
    guardianDomainStatuses()
  );
  const [vault, setVault] = useState<VaultItem[]>([]);
  const [vaultRoot, setVaultRoot] = useState("");
  const [twin, setTwin] = useState<TwinState>(() => writeTwin(todayKey()));
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState("");
  const [selectedScore, setSelectedScore] = useState<
    "overall" | "energy" | "recovery" | "fuel" | "stress"
  >("overall");

  const refreshAll = useCallback(() => {
    setDomains(guardianDomainStatuses());
    setTwin(writeTwin(todayKey()));
  }, []);

  const refreshVault = useCallback(async () => {
    const list = await listVault();
    setVault(list.items);
    if (list.root) setVaultRoot(list.root);
  }, []);

  useEffect(() => {
    void (async () => {
      setBusy("Sealing history…");
      await hydrateFromDisk();
      mirrorAllToDisk();
      await maybeAutoSnapshot(45);
      refreshAll();
      await refreshVault();
      setBusy(null);
    })();
    return onGuardianChange(refreshAll);
  }, [refreshAll, refreshVault]);

  function flashMsg(msg: string) {
    setFlash(msg);
    window.setTimeout(() => setFlash(""), 3200);
  }

  async function onSealVault() {
    setBusy("Writing vault…");
    mirrorAllToDisk();
    const r = await takeVaultSnapshot("manual");
    await refreshVault();
    setBusy(null);
    flashMsg(
      r.ok
        ? `Vault sealed · ${r.keyCount} keys · ${r.id?.slice(0, 19) || "ok"}`
        : r.error || "Vault failed"
    );
  }

  async function onRestore(id: string) {
    setBusy("Merging vault…");
    const r = await restoreVaultMerge(id);
    refreshAll();
    setBusy(null);
    flashMsg(
      r.ok
        ? `Restored merge · ${r.updated} keys updated (nothing wiped)`
        : r.error || "Restore failed"
    );
  }

  const scoreExplain = useMemo(() => {
    const s = twin;
    if (selectedScore === "recovery") {
      return `Recovery drops on short sleep, sleep debt, and fog. Today: ${
        s.sleepHours == null ? "sleep not logged" : `${s.sleepHours}h sleep`
      }.`;
    }
    if (selectedScore === "fuel") {
      return `Fuel from protein + water + meals. ${Math.round(s.protein_g)}/${s.proteinGoal}g protein · ${s.water_ml}/${s.waterGoal} ml.`;
    }
    if (selectedScore === "stress") {
      return `Stress rises with fog, hard notes, and stacked short nights. Directional — not a diagnosis.`;
    }
    if (selectedScore === "energy") {
      return `Energy blends recovery with cycle phase, then stress and low fuel pull it down.`;
    }
    return `Overall blends energy, recovery, fuel, and stress capacity. One number for readiness — not medical.`;
  }, [selectedScore, twin]);

  const scores = [
    ["overall", "Overall", twin.scores.overall],
    ["energy", "Energy", twin.scores.energy],
    ["recovery", "Recovery", twin.scores.recovery],
    ["fuel", "Fuel", twin.scores.fuel],
    ["stress", "Stress", twin.scores.stress],
  ] as const;

  return (
    <div className="bos">
      <header className="bos-hero">
        <div className="bos-hero-copy">
          <p className="bos-kicker">Body OS</p>
          <h1 className="bos-title">
            Your health stays.
            <br />
            <em>Nothing silent gets erased.</em>
          </h1>
          <p className="bos-lede">
            Three systems. Guardian never wipes. Vault freezes time. Twin reads
            today and tells you the one lever that matters.
          </p>
        </div>
        <div className={`bos-hero-score is-${scoreTone(twin.scores.overall)}`}>
          <span className="bos-hero-score-label">Twin · today</span>
          <strong className="bos-hero-score-num">{twin.scores.overall}</strong>
          <span className="bos-hero-score-sub">
            {twin.phaseLabel} · day {twin.cycleDay}
          </span>
        </div>
      </header>

      {flash ? (
        <p className="bos-flash" role="status">
          {flash}
        </p>
      ) : null}
      {busy ? (
        <p className="bos-busy" aria-live="polite">
          {busy}
        </p>
      ) : null}

      {/* ── 01 Guardian ── */}
      <section className="bos-chapter" aria-labelledby="bos-g">
        <div className="bos-chapter-head">
          <span className="bos-num">01</span>
          <div>
            <h2 id="bos-g" className="bos-chapter-title">
              Data Guardian
            </h2>
            <p className="bos-chapter-sub">
              Merge-only. Bowel · fog · meals · weight · sleep · water. Local
              owner logs always win.
            </p>
          </div>
          <span className="bos-seal" title="Protected">
            sealed
          </span>
        </div>
        <ul className="bos-domains">
          {domains.map((d) => (
            <li key={d.id} className={`bos-domain${d.ok ? " is-live" : ""}`}>
              <div className="bos-domain-top">
                <strong>{d.label}</strong>
                <span className="bos-domain-dot" aria-hidden />
              </div>
              <p className="bos-domain-blurb">{d.blurb}</p>
              <p className="bos-domain-sample">{d.sample}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ── 02 Vault ── */}
      <section className="bos-chapter" aria-labelledby="bos-v">
        <div className="bos-chapter-head">
          <span className="bos-num">02</span>
          <div>
            <h2 id="bos-v" className="bos-chapter-title">
              Data Vault
            </h2>
            <p className="bos-chapter-sub">
              Timestamped freezes on disk. Restore only merges — never replaces
              with empty.
            </p>
          </div>
          <button
            type="button"
            className="bos-btn bos-btn-gold"
            onClick={() => void onSealVault()}
            disabled={!!busy}
          >
            Seal now
          </button>
        </div>

        {vaultRoot ? (
          <p className="bos-path">
            <span>Disk</span> {vaultRoot}
          </p>
        ) : null}

        {vault.length === 0 ? (
          <div className="bos-empty-vault">
            <p>No freezes yet.</p>
            <p>Hit <strong>Seal now</strong> after you log — or leave it open; auto-seals about every 45 minutes when something changed.</p>
          </div>
        ) : (
          <ol className="bos-vault-strip">
            {vault.slice(0, 12).map((item, i) => (
              <li key={item.id} className={i === 0 ? "is-latest" : ""}>
                <div className="bos-vault-meta">
                  <strong>{formatWhen(item.at)}</strong>
                  <span>
                    {item.keyCount} keys
                    {item.domains?.length
                      ? ` · ${item.domains.slice(0, 4).join(" · ")}`
                      : ""}
                  </span>
                  <span className="bos-vault-label">{item.label}</span>
                </div>
                <button
                  type="button"
                  className="bos-btn bos-btn-ghost"
                  onClick={() => void onRestore(item.id)}
                  disabled={!!busy}
                >
                  Merge restore
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ── 03 Twin ── */}
      <section className="bos-chapter bos-chapter-twin" aria-labelledby="bos-t">
        <div className="bos-chapter-head">
          <span className="bos-num">03</span>
          <div>
            <h2 id="bos-t" className="bos-chapter-title">
              Twin
            </h2>
            <p className="bos-chapter-sub">
              Readiness from today&apos;s signals. Never writes over history.
            </p>
          </div>
          <button
            type="button"
            className="bos-btn"
            onClick={() => {
              setTwin(writeTwin(todayKey()));
              flashMsg("Twin refreshed from logs");
            }}
          >
            Refresh
          </button>
        </div>

        <div className="bos-score-row" role="tablist" aria-label="Twin scores">
          {scores.map(([id, label, value]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selectedScore === id}
              className={`bos-score-chip is-${scoreTone(value)}${
                selectedScore === id ? " is-on" : ""
              }`}
              onClick={() => setSelectedScore(id)}
            >
              <span>{label}</span>
              <strong>{value}</strong>
              <i
                className="bos-score-bar"
                style={{ width: `${Math.min(100, value)}%` }}
                aria-hidden
              />
            </button>
          ))}
        </div>

        <p className="bos-score-why">{scoreExplain}</p>

        <article className="bos-lever">
          <p className="bos-lever-kicker">One lever</p>
          <h3>{twin.lever.title}</h3>
          <p>{twin.lever.detail}</p>
        </article>

        {twin.radar.length > 0 ? (
          <div className="bos-radar">
            <p className="bos-lever-kicker">Needs attention</p>
            <ul>
              {twin.radar.map((r) => (
                <li key={r.id}>
                  <strong>{r.title}</strong>
                  <span>{r.why}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="bos-radar-clear">Radar clear — no loud red flags named today.</p>
        )}

        <div className="bos-forecast" aria-label="Seven day directional forecast">
          {twin.forecast.map((day) => {
            const readiness = Math.round((day.energy + day.recovery) / 2);
            const [y, m, d] = day.day.split("-").map(Number);
            const label = new Date(y, m - 1, d).toLocaleDateString(undefined, {
              weekday: "narrow",
            });
            return (
              <div
                key={day.day}
                className={`bos-forecast-day is-${scoreTone(readiness)}`}
                title={day.why}
              >
                <span>{label}</span>
                <strong>{readiness}</strong>
              </div>
            );
          })}
        </div>
        <p className="bos-footnote">
          Forecast is directional. Logs change it. Twin never deletes bowel, fog,
          meals, or weight.
        </p>
      </section>
    </div>
  );
}
