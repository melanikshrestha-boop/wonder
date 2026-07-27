/**
 * Screen Time desk — Mac apps ≥1h, Safari site breakdown, hours graph (not $).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { LabeledLineChart } from "./FinCharts";
import {
  fetchMacScreenTime,
  fmtHours,
  loadCachedMacExport,
  loadPhoneLog,
  macHistorySpanDays,
  mergeSeries,
  parseHoursInput,
  SYNC_DAYS,
  upsertPhoneDay,
  type DayApp,
  type MacExport,
  type PhoneLog,
  type SeriesPoint,
  type WebsiteRow,
} from "./screenTimeStore";
import "./screen-time.css";

/** Display windows — chart still starts on first real data day, not fake zeros */
const RANGES = [7, 14, 30, 60, 90] as const;
/** Only surface apps / sites with at least this much time */
const MIN_SEC = 3600;
/** Sleep-page graph height — air + soft fill, not a tiny card */
const CHART_H = 200;

function formatHoursTick(n: number): string {
  if (!Number.isFinite(n)) return "";
  const v = Math.max(0, n);
  if (v < 0.05) return "0";
  // Prefer whole hours on axis (0 · 4 · 8 · 12)
  if (Math.abs(v - Math.round(v)) < 0.05) return `${Math.round(v)}h`;
  if (v >= 10) return `${Math.round(v)}h`;
  return `${v.toFixed(1)}h`;
}

function toLinePoints(src: SeriesPoint[]) {
  return src.map((p) => ({
    x: p.date.slice(5),
    y: Math.max(0, p.hours),
    label: `${p.date}: ${p.hours}h`,
  }));
}

/** Sleep-style hero stats for a daily hours series */
function seriesHero(src: SeriesPoint[]) {
  const ys = src.map((p) => p.hours).filter((h) => Number.isFinite(h) && h > 0);
  if (!ys.length) {
    return { avg: null as number | null, latest: null as number | null, min: null as number | null, max: null as number | null, delta: null as number | null, n: 0 };
  }
  const all = src.map((p) => Math.max(0, p.hours));
  const avg = all.reduce((a, b) => a + b, 0) / all.length;
  const latest = all[all.length - 1] ?? null;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const delta = latest != null ? latest - avg : null;
  return { avg, latest, min, max, delta, n: all.length };
}

function fmtH(h: number | null, digits = 1): string {
  if (h == null || !Number.isFinite(h)) return "—";
  if (h < 0.05) return "0h";
  if (h >= 10) return `${Math.round(h)}h`;
  return `${h.toFixed(digits)}h`;
}

export function isScreenTimePage(pageId: string): boolean {
  return (
    pageId === "pg-focus" ||
    pageId === "pg-screentime" ||
    pageId === "pg-screen-time"
  );
}

export function ScreenTime() {
  const [days, setDays] = useState(30);
  const [mac, setMac] = useState<MacExport | null>(() => loadCachedMacExport());
  const [phone, setPhone] = useState<PhoneLog>(() => loadPhoneLog());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [phoneDate, setPhoneDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [phoneHours, setPhoneHours] = useState("");
  const [safariOpen, setSafariOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      // Always pull the long window; forever history merges; UI range only trims view
      const data = await fetchMacScreenTime(SYNC_DAYS);
      setMac(data);
      setFlash("Synced · history kept");
      window.setTimeout(() => setFlash(null), 1800);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const series = useMemo(
    () => mergeSeries(mac?.series?.mac_hours, phone, days),
    [mac, phone, days]
  );

  const historySpan = useMemo(() => macHistorySpanDays(), [mac, series]);

  const macPoints = useMemo(() => toLinePoints(series.mac), [series.mac]);
  const phonePoints = useMemo(() => toLinePoints(series.phone), [series.phone]);

  const totals = useMemo(() => {
    const macSec = series.mac.reduce((a, p) => a + p.seconds, 0);
    const phoneSec = series.phone.reduce((a, p) => a + p.seconds, 0);
    return {
      mac: macSec,
      phone: phoneSec,
      both: macSec + phoneSec,
      todayMac: series.mac[series.mac.length - 1]?.seconds ?? 0,
      todayPhone: series.phone[series.phone.length - 1]?.seconds ?? 0,
    };
  }, [series]);

  /** Apps ≥1h, sorted heaviest first (Safari still listed — expand for sites) */
  const heavyApps: DayApp[] = useMemo(() => {
    return (mac?.apps_all || [])
      .filter((a) => a.seconds >= MIN_SEC)
      .sort((a, b) => b.seconds - a.seconds);
  }, [mac]);

  const websites: WebsiteRow[] = useMemo(() => {
    return (mac?.websites || []).filter((w) => w.seconds >= MIN_SEC);
  }, [mac]);

  function savePhone() {
    const sec = parseHoursInput(phoneHours);
    if (sec <= 0) {
      setErr("Enter time like 2h 15m or 2.5");
      return;
    }
    upsertPhoneDay({ date: phoneDate, seconds: sec });
    setPhone(loadPhoneLog());
    setPhoneHours("");
    setFlash(`Phone ${fmtHours(sec)} · ${phoneDate}`);
    window.setTimeout(() => setFlash(null), 2000);
    setErr(null);
  }

  const iphone = mac?.iphone_storage;
  const disk = mac?.disk;
  const macHero = useMemo(() => seriesHero(series.mac), [series.mac]);
  const phoneHero = useMemo(() => seriesHero(series.phone), [series.phone]);

  return (
    <div className="st st-sleep">
      <header className="st-head st-head-compact">
        <div className="st-range">
          {RANGES.map((n) => (
            <button
              key={n}
              type="button"
              className={days === n ? "on" : ""}
              onClick={() => setDays(n)}
              title={
                historySpan > 0 && n > historySpan
                  ? `Only ${historySpan}d of Mac history yet — chart starts at first real day`
                  : undefined
              }
            >
              {n}d
            </button>
          ))}
        </div>
        <div className="st-actions">
          <button
            type="button"
            className="st-btn st-btn-ghost"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {loading ? "Syncing…" : "Sync Mac"}
          </button>
        </div>
      </header>
      {series.from ? (
        <p className="st-history-note">
          Chart from {series.from} · {series.mac.length} days shown ·{" "}
          {series.historyDays} Mac days stored forever
        </p>
      ) : null}

      {flash && <p className="st-flash">{flash}</p>}
      {err && <p className="st-err">{err}</p>}

      {/* Quiet strip — same role as sleep “latest / vs avg”, not card grid */}
      <div className="st-strip" aria-label="Focus summary">
        <div className="st-strip-item is-mac">
          <span className="st-strip-lab">
            Mac · {series.mac.length}d
            {series.mac.length < days ? " shown" : ""}
          </span>
          <b className="st-strip-val">{fmtHours(totals.mac)}</b>
        </div>
        <div className="st-strip-item is-mac">
          <span className="st-strip-lab">Mac today</span>
          <b className="st-strip-val">{fmtHours(totals.todayMac)}</b>
        </div>
        <div className="st-strip-item is-phone">
          <span className="st-strip-lab">Phone · {days}d</span>
          <b className="st-strip-val">{fmtHours(totals.phone)}</b>
        </div>
        <div className="st-strip-item is-phone">
          <span className="st-strip-lab">Phone today</span>
          <b className="st-strip-val">{fmtHours(totals.todayPhone)}</b>
        </div>
        <div className="st-strip-item">
          <span className="st-strip-lab">Mac free</span>
          <b className="st-strip-val st-strip-val-sm">{disk?.free_human ?? "—"}</b>
        </div>
      </div>

      {/* Sleep-style metric graphs: title · big avg · meta · soft line */}
      <article className="st-metric-panel is-mac">
        <header className="st-metric-head">
          <p className="st-metric-title">Mac hours / day</p>
          <div className="st-metric-nums">
            <span className="st-metric-v">
              {fmtH(macHero.avg)}
              <small>avg</small>
            </span>
            <span className="st-metric-meta">
              <span>latest: {fmtH(macHero.latest)}</span>
              {macHero.delta != null && Math.abs(macHero.delta) >= 0.05 ? (
                <span className={macHero.delta > 0 ? "is-up" : "is-down"}>
                  {macHero.delta > 0 ? "+" : ""}
                  {fmtH(macHero.delta)} vs avg
                </span>
              ) : null}
              {macHero.min != null && macHero.max != null ? (
                <span className="st-metric-range">
                  {fmtH(macHero.min)}–{fmtH(macHero.max)}
                </span>
              ) : null}
            </span>
          </div>
        </header>
        <div className="st-chart-wrap">
          {macPoints.some((p) => p.y > 0) ? (
            <LabeledLineChart
              title=""
              xLabel=""
              yLabel=""
              points={macPoints}
              color="#0284c7"
              height={CHART_H}
              formatY={formatHoursTick}
            />
          ) : (
            <p className="st-note">Sync Mac for this graph.</p>
          )}
        </div>
        <p className="st-metric-foot">
          n = {macHero.n}
          {macHero.latest != null ? ` · latest: ${fmtH(macHero.latest)}` : ""}
          {macHero.min != null && macHero.max != null
            ? ` · range ${fmtH(macHero.min)}–${fmtH(macHero.max)}`
            : ""}
        </p>
      </article>

      <article className="st-metric-panel is-phone">
        <header className="st-metric-head">
          <p className="st-metric-title">Phone hours / day</p>
          <div className="st-metric-nums">
            <span className="st-metric-v">
              {fmtH(phoneHero.avg)}
              <small>avg</small>
            </span>
            <span className="st-metric-meta">
              <span>latest: {fmtH(phoneHero.latest)}</span>
              {phoneHero.delta != null && Math.abs(phoneHero.delta) >= 0.05 ? (
                <span className={phoneHero.delta > 0 ? "is-up" : "is-down"}>
                  {phoneHero.delta > 0 ? "+" : ""}
                  {fmtH(phoneHero.delta)} vs avg
                </span>
              ) : null}
              {phoneHero.min != null && phoneHero.max != null ? (
                <span className="st-metric-range">
                  {fmtH(phoneHero.min)}–{fmtH(phoneHero.max)}
                </span>
              ) : null}
            </span>
          </div>
        </header>
        <div className="st-chart-wrap">
          {phonePoints.some((p) => p.y > 0) ? (
            <LabeledLineChart
              title=""
              xLabel=""
              yLabel=""
              points={phonePoints}
              color="#db2777"
              height={CHART_H}
              formatY={formatHoursTick}
            />
          ) : (
            <p className="st-note">
              Log phone hours below — separate from Mac so both show cleanly.
            </p>
          )}
        </div>
        <p className="st-metric-foot">
          n = {phoneHero.n}
          {phoneHero.latest != null ? ` · latest: ${fmtH(phoneHero.latest)}` : ""}
          {phoneHero.min != null && phoneHero.max != null
            ? ` · range ${fmtH(phoneHero.min)}–${fmtH(phoneHero.max)}`
            : ""}
        </p>
      </article>

      <section className="st-panel st-panel-flat">
        <h2 className="st-section-title">Apps ≥ 1 hour ({heavyApps.length})</h2>
        <div className="st-table-wrap">
          <table className="st-table">
            <thead>
              <tr>
                <th>#</th>
                <th>App</th>
                <th>Time</th>
                <th>Share</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {heavyApps.map((a, i) => {
                const isSafari = a.bundle === "com.apple.Safari" || a.is_safari;
                return (
                  <AppRows
                    key={a.bundle}
                    app={a}
                    rank={i + 1}
                    isSafari={Boolean(isSafari)}
                    safariOpen={safariOpen}
                    onToggleSafari={() => setSafariOpen((v) => !v)}
                    websites={isSafari ? websites : []}
                  />
                );
              })}
              {!heavyApps.length && (
                <tr>
                  <td colSpan={5}>
                    <p className="st-note">Nothing over 1 hour yet — or hit Sync Mac.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {websites.length > 0 && !heavyApps.some((a) => a.bundle === "com.apple.Safari") && (
        <section className="st-panel st-panel-flat">
          <h2 className="st-section-title">Websites ≥ 1 hour</h2>
          <SiteTable sites={websites} />
        </section>
      )}

      <section className="st-panel st-panel-flat">
        <h2 className="st-section-title">Storage</h2>
        <ul className="st-storage-list">
          <li>
            <b>This Mac</b>
            <span className="st-storage-detail">
              {" "}
              free {disk?.free_human ?? "—"} · used {disk?.used_human ?? "—"} /{" "}
              {disk?.total_human ?? "—"}
              {disk?.used_pct != null ? ` (${disk.used_pct}%)` : ""}
            </span>
          </li>
          <li>
            <b>iPhone</b>
            <span className="st-storage-detail">
              {iphone?.connected
                ? " on USB — capacity is in Finder → iPhone → General (not exposed to this app)."
                : " not connected. Plug in, unlock, Trust. Hours still need manual log below."}
            </span>
          </li>
        </ul>
      </section>

      <section className="st-panel st-panel-flat">
        <h2 className="st-section-title">Log phone day</h2>
        <div className="st-phone-form">
          <label>
            Date
            <input type="date" value={phoneDate} onChange={(e) => setPhoneDate(e.target.value)} />
          </label>
          <label>
            Time
            <input
              value={phoneHours}
              onChange={(e) => setPhoneHours(e.target.value)}
              placeholder="1h 30m"
              aria-label="Phone screen time"
            />
          </label>
          <button type="button" className="st-btn st-btn-primary" onClick={savePhone}>
            Save
          </button>
        </div>
      </section>
    </div>
  );
}

function AppRows({
  app,
  rank,
  isSafari,
  safariOpen,
  onToggleSafari,
  websites,
}: {
  app: DayApp;
  rank: number;
  isSafari: boolean;
  safariOpen: boolean;
  onToggleSafari: () => void;
  websites: WebsiteRow[];
}) {
  return (
    <>
      {/* Safari looks like every other app row — click name to expand sites */}
      <tr
        className={isSafari ? "st-row-app is-safari" : "st-row-app"}
        onClick={isSafari ? onToggleSafari : undefined}
        onKeyDown={
          isSafari
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggleSafari();
                }
              }
            : undefined
        }
        role={isSafari ? "button" : undefined}
        tabIndex={isSafari ? 0 : undefined}
        aria-expanded={isSafari ? safariOpen : undefined}
      >
        <td>{rank}</td>
        <td>
          <b className={isSafari ? "st-app-name is-safari" : "st-app-name"}>
            {isSafari ? "Safari" : app.name}
          </b>
        </td>
        <td>{app.human}</td>
        <td>{app.share}%</td>
        <td>
          <span
            className="st-bar"
            style={{ width: `${Math.min(120, app.share * 1.8)}px` }}
          />
        </td>
      </tr>
      {/* Sites: same table, indented rows — no nested box */}
      {isSafari &&
        safariOpen &&
        (websites.length ? (
          websites.map((w, i) => (
            <tr key={w.domain} className="st-site-line">
              <td className="st-site-rank">{i + 1}</td>
              <td className="st-site-domain">{w.domain}</td>
              <td>{w.human}</td>
              <td>{w.share}%</td>
              <td />
            </tr>
          ))
        ) : (
          <tr className="st-site-line">
            <td />
            <td colSpan={4} className="st-site-empty">
              No single site over 1 hour in this range.
            </td>
          </tr>
        ))}
    </>
  );
}

function SiteTable({ sites }: { sites: WebsiteRow[] }) {
  return (
    <table className="st-table st-sites">
      <thead>
        <tr>
          <th>#</th>
          <th>Website</th>
          <th>Time</th>
          <th>Share of web</th>
        </tr>
      </thead>
      <tbody>
        {sites.map((w, i) => (
          <tr key={w.domain}>
            <td>{i + 1}</td>
            <td>
              <b>{w.domain}</b>
            </td>
            <td>{w.human}</td>
            <td>{w.share}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
