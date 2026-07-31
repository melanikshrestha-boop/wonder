/**
 * Base Widget — everyday tracking surface.
 * Open with ?widget=1 or the PWA shortcut "Base today".
 * Same localStorage as full Wonder (habits keys) so checks stay in sync.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  currentStreak,
  dayCompletion,
  isChecked,
  loadChecks,
  loadHabits,
  onHabitsChange,
  saveChecks,
  toggleCheck,
  type Habit,
  type CheckMap,
} from "./habitStore";
import { todayKey } from "./data";
import "./base-widget.css";

function openFullWonder() {
  const url = new URL(window.location.href);
  url.searchParams.delete("widget");
  url.searchParams.set("page", "pg-habits");
  window.location.href = url.toString();
}

export function BaseWidget() {
  const day = todayKey();
  const [habits, setHabits] = useState<Habit[]>(() =>
    loadHabits().filter((h) => !h.archivedAt)
  );
  const [checks, setChecks] = useState<CheckMap>(() => loadChecks());
  const [pulseId, setPulseId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setHabits(loadHabits().filter((h) => !h.archivedAt));
    setChecks(loadChecks());
  }, []);

  useEffect(() => onHabitsChange(refresh), [refresh]);

  // Cross-tab / full-app sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === "wonder-habits-v1" ||
        e.key === "wonder-habit-checks-v1" ||
        e.key == null
      ) {
        refresh();
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  const completion = useMemo(
    () => dayCompletion(habits, checks, day),
    [habits, checks, day]
  );

  const pct = Math.round(completion.ratio * 100);
  const ring = 2 * Math.PI * 36; // r=36
  const dash = ring * completion.ratio;

  function onToggle(id: string) {
    const next = toggleCheck(checks, day, id);
    setChecks(next);
    saveChecks(next);
    setPulseId(id);
    window.setTimeout(() => setPulseId((cur) => (cur === id ? null : cur)), 320);
  }

  const label = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="bw-root">
      <header className="bw-head">
        <div className="bw-brand">
          <span className="bw-mark" aria-hidden>
            W
          </span>
          <div>
            <p className="bw-kicker">Base · today</p>
            <h1 className="bw-title">{label}</h1>
          </div>
        </div>
        <div className="bw-ring-wrap" aria-label={`${completion.done} of ${completion.total} done`}>
          <svg className="bw-ring" viewBox="0 0 84 84" width="72" height="72">
            <circle className="bw-ring-track" cx="42" cy="42" r="36" />
            <circle
              className="bw-ring-fill"
              cx="42"
              cy="42"
              r="36"
              strokeDasharray={`${dash} ${ring}`}
              transform="rotate(-90 42 42)"
            />
          </svg>
          <div className="bw-ring-label">
            <strong>{pct}%</strong>
            <span>
              {completion.done}/{completion.total}
            </span>
          </div>
        </div>
      </header>

      <p className="bw-sub">
        Tap to check. Same data as full Wonder Habits — nothing double-tracked.
      </p>

      <ul className="bw-list">
        {habits.map((h) => {
          const on = isChecked(checks, day, h.id);
          const streak = currentStreak(checks, h.id, day);
          return (
            <li key={h.id}>
              <button
                type="button"
                className={`bw-row${on ? " is-on" : ""}${pulseId === h.id ? " is-pulse" : ""}`}
                onClick={() => onToggle(h.id)}
                style={{ ["--h" as string]: h.color }}
                aria-pressed={on}
              >
                <span className="bw-check" aria-hidden>
                  {on ? "✓" : ""}
                </span>
                <span className="bw-emoji" aria-hidden>
                  {h.emoji}
                </span>
                <span className="bw-name">{h.name}</span>
                {streak > 0 ? (
                  <span className="bw-streak" title="Current streak">
                    {streak}d
                  </span>
                ) : (
                  <span className="bw-streak is-empty" />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {habits.length === 0 && (
        <p className="bw-empty">No habits yet — open full Wonder to seed them.</p>
      )}

      <footer className="bw-foot">
        <button type="button" className="bw-link" onClick={openFullWonder}>
          Open full Wonder
        </button>
        <span className="bw-hint">Add to Dock / Home Screen for a real widget</span>
      </footer>
    </div>
  );
}
