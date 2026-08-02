/**
 * Fitness-tab Whoop import: + under quote refresh, Dropbox-style drop zone.
 * Merge-only — never duplicates days already on graphs.
 * Silent weekly cadence: + stays black for 7 days after a drop, then red + jump.
 * No reminder copy — visual only.
 */
import { Plus, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  importWhoopCsvTexts,
  importWhoopFromPublicLatest,
} from "./whoopStore";
import "./whoop-csv-drop.css";

/** Last time Melani dropped weekly Whoop CSVs via this + (not auto seed). */
const PLUS_WEEK_ANCHOR_KEY = "wonder-whoop-plus-week-anchor-v1";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type Props = {
  className?: string;
  /** Called after a successful merge so Sleep/Gym panels re-read store */
  onImported?: () => void;
};

function readPlusAnchorMs(): number {
  try {
    const raw = localStorage.getItem(PLUS_WEEK_ANCHOR_KEY);
    if (raw) {
      const n = Date.parse(raw);
      if (!Number.isNaN(n)) return n;
    }
  } catch {
    /* ignore */
  }
  // First open of this feature: start the 7-day clock now (+ stays black)
  const now = new Date().toISOString();
  try {
    localStorage.setItem(PLUS_WEEK_ANCHOR_KEY, now);
  } catch {
    /* ignore */
  }
  return Date.parse(now);
}

function markPlusWeekDrop(): void {
  try {
    localStorage.setItem(PLUS_WEEK_ANCHOR_KEY, new Date().toISOString());
  } catch {
    /* ignore */
  }
}

function computeDue(): boolean {
  return Date.now() - readPlusAnchorMs() >= WEEK_MS;
}

export function WhoopCsvDrop({ className = "", onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [due, setDue] = useState(() => computeDue());

  // Re-check cadence (midnight / next day without full reload)
  useEffect(() => {
    const tick = () => setDue(computeDue());
    tick();
    const id = window.setInterval(tick, 60_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  // Seed any new nights from public/whoop/latest (append-only) — silent
  // Does NOT reset the weekly + clock (only a real drop does).
  useEffect(() => {
    void importWhoopFromPublicLatest()
      .then((r) => {
        if (r.ok) onImported?.();
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ingest = useCallback(
    async (fileList: FileList | File[] | null) => {
      if (!fileList || busy) return;
      const list = Array.from(fileList as FileList);
      if (!list.length) return;
      setBusy(true);
      try {
        const files: Array<{ name: string; text: string }> = [];
        for (const file of list) {
          if (/\.zip$/i.test(file.name)) {
            setBusy(false);
            return;
          }
          const base = file.name.split(/[/\\]/).pop() || file.name;
          if (!/\.csv$/i.test(base) && !/\.txt$/i.test(base)) continue;
          files.push({ name: base, text: await file.text() });
        }
        if (!files.length) {
          setBusy(false);
          return;
        }
        importWhoopCsvTexts(files);
        // Weekly beat: drop resets clock → black for next 7 days
        markPlusWeekDrop();
        setDue(false);
        onImported?.();
        setOpen(false);
      } catch {
        /* silent */
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [busy, onImported]
  );

  return (
    <div className={`whoop-drop${className ? ` ${className}` : ""}`}>
      <button
        type="button"
        className={[
          "whoop-drop-plus",
          open ? "is-open" : "",
          due && !open ? "is-due" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-expanded={open}
        aria-label={
          open
            ? "Close Whoop CSV drop zone"
            : due
              ? "Weekly Whoop export due — drop CSVs to beat last week"
              : "Add weekly Whoop CSV export"
        }
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? (
          <X size={14} weight="regular" aria-hidden />
        ) : (
          <Plus size={14} weight="bold" aria-hidden />
        )}
      </button>

      {open ? (
        <div
          className={`whoop-drop-zone${drag ? " is-drag" : ""}${
            busy ? " is-busy" : ""
          }${due ? " is-due" : ""}`}
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDrag(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDrag(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDrag(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDrag(false);
            void ingest(e.dataTransfer.files);
          }}
          onClick={() => {
            if (!busy) inputRef.current?.click();
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          aria-label="Drop Whoop CSV files here"
        />
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,.txt"
        multiple
        className="whoop-drop-file"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => void ingest(e.target.files)}
      />
    </div>
  );
}
