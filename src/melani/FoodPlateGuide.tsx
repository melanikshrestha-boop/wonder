/**
 * Cut-out trash only — static lid, toss + rattle on hits.
 * No open/close lid control.
 */
import { useEffect, useMemo, useState } from "react";
import { PLATE_TRASH, type CutoutLabel, type MacroSlice } from "./foodGuide";
import "./food-plate-guide.css";

type Props = {
  today: MacroSlice;
  /** Cut-out labels hit by today's logged meals — highlight in the bin */
  hitLabels?: CutoutLabel[] | string[];
};

export function FoodPlateGuide({ hitLabels = [] }: Props) {
  const hitSet = useMemo(() => new Set(hitLabels), [hitLabels]);
  const hitCount = hitSet.size;
  const [tossed, setTossed] = useState<string | null>(null);
  const [rattle, setRattle] = useState(false);

  useEffect(() => {
    if (hitCount <= 0) return;
    setRattle(true);
    const t = window.setTimeout(() => setRattle(false), 700);
    return () => window.clearTimeout(t);
  }, [hitCount]);

  useEffect(() => {
    if (!tossed) return;
    const t = window.setTimeout(() => setTossed(null), 480);
    return () => window.clearTimeout(t);
  }, [tossed]);

  return (
    <section className="fx-section fx-plate" aria-label="Cut out trash">
      <div
        className={`fx-bin fx-bin-solo${hitCount > 0 ? " is-dirty" : " is-clean"}${
          rattle ? " is-rattle" : ""
        }`}
      >
        <div className="fx-bin-silhouette">
          <div className="fx-bin-lid" aria-hidden>
            <span className="fx-bin-handle" />
            <span className="fx-bin-lidcap" />
          </div>

          <div className="fx-bin-vessel">
            <div className="fx-bin-flies" aria-hidden>
              <i />
              <i />
              <i />
            </div>
            <ol className="fx-bin-list">
              {PLATE_TRASH.map((item, i) => {
                const hot = hitSet.has(item);
                const yeet = tossed === item;
                return (
                  <li
                    key={item}
                    className={`${hot ? "is-hit" : ""}${
                      yeet ? " is-toss" : ""
                    }`}
                    title={
                      hot
                        ? "In a meal you logged today — tap to toss"
                        : "Tap to toss in the bin"
                    }
                  >
                    <button
                      type="button"
                      className="fx-bin-row-btn"
                      onClick={() => setTossed(item)}
                    >
                      <span className="fx-bin-n">{i + 1}</span>
                      <span className="fx-bin-item">{item}</span>
                      {hot ? (
                        <span className="fx-bin-zap" aria-hidden>
                          ×
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
