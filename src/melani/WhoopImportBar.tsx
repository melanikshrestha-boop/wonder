/**
 * Tiny control above Fitness: import weekly Whoop export CSVs (all four).
 * Full analysis lives on Fitness → Whoop lab.
 */
import { useEffect, useRef, useState } from "react";
import {
  WHOOP_EVENT,
  importWhoopCsvTexts,
  importWhoopFromPublicLatest,
  loadWhoopStore,
} from "./whoopStore";
import "./whoop-import.css";

export function WhoopImportBar() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState(() => loadWhoopStore().lastImportSummary || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const on = () => setStatus(loadWhoopStore().lastImportSummary || "");
    window.addEventListener(WHOOP_EVENT, on);
    // Seed from public/whoop/latest if empty
    const s = loadWhoopStore();
    if (!Object.keys(s.days).length && !s.workouts.length) {
      void importWhoopFromPublicLatest().then((r) => {
        if (r.ok) setStatus(r.summary);
      });
    }
    return () => window.removeEventListener(WHOOP_EVENT, on);
  }, []);

  async function onFiles(fileList: FileList | null) {
    if (!fileList?.length || busy) return;
    setBusy(true);
    try {
      const files: Array<{ name: string; text: string }> = [];
      for (const file of Array.from(fileList)) {
        if (/\.zip$/i.test(file.name)) {
          setStatus(
            "Unzip first, then select all CSVs: sleeps, physiological_cycles, workouts, journal_entries."
          );
          setBusy(false);
          return;
        }
        if (!/\.csv$/i.test(file.name) && !/\.txt$/i.test(file.name)) continue;
        files.push({ name: file.name, text: await file.text() });
      }
      if (!files.length) {
        setStatus("Pick Whoop .csv files from your export folder.");
        setBusy(false);
        return;
      }
      const result = importWhoopCsvTexts(files);
      setStatus(result.summary);
    } catch {
      setStatus("Import failed. Use the four RAW CSVs from your Whoop export.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="whoop-bar">
      <button
        type="button"
        className="whoop-bar-link"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        title="Import weekly Whoop RAW CSVs — every metric to Whoop lab"
      >
        {busy ? "Importing…" : "Import Whoop RAW"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,.txt"
        multiple
        className="whoop-bar-file"
        aria-label="Whoop CSV files"
        onChange={(e) => void onFiles(e.target.files)}
      />
      {status ? <span className="whoop-bar-status">{status}</span> : null}
    </div>
  );
}
