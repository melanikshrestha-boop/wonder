/**
 * Buy-next gear list (Blueprint stack). Quiet Gym footer — not daily chrome.
 */
import { useEffect, useState } from "react";
import {
  loadGearWishlist,
  markGearOwned,
  type GearWishItem,
} from "./gearWishlist";
import "./gear-wishlist.css";

export function GearWishList() {
  const [buy, setBuy] = useState<GearWishItem[]>([]);
  const [owned, setOwned] = useState<GearWishItem[]>([]);

  useEffect(() => {
    const all = loadGearWishlist();
    setBuy(all.filter((x) => !x.owned));
    setOwned(all.filter((x) => x.owned));
  }, []);

  function refresh() {
    const all = loadGearWishlist();
    setBuy(all.filter((x) => !x.owned));
    setOwned(all.filter((x) => x.owned));
  }

  return (
    <section className="gx-section gx-gear-wish" aria-label="Gear wishlist">
      <h2 className="gx-h2">Buy next</h2>
      <p className="gx-sub gx-gear-sub">Blueprint stack · not dumbbells / Whoop / laser cap</p>

      {buy.length === 0 ? (
        <p className="gx-sub">Nothing on the buy list.</p>
      ) : (
        <ol className="gx-gear-list">
          {buy.map((item, i) => (
            <li key={item.id} className="gx-gear-row">
              <span className="gx-gear-n">{i + 1}</span>
              <div className="gx-gear-body">
                <a
                  className="gx-gear-link"
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {item.name}
                </a>
                {item.brand ? (
                  <span className="gx-gear-brand">{item.brand}</span>
                ) : null}
              </div>
              <button
                type="button"
                className="gx-gear-own"
                onClick={() => {
                  markGearOwned(item.id);
                  refresh();
                }}
              >
                own
              </button>
            </li>
          ))}
        </ol>
      )}

      {owned.length > 0 ? (
        <p className="gx-gear-owned">
          Own: {owned.map((x) => x.name).join(" · ")}
        </p>
      ) : null}
    </section>
  );
}
