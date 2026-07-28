/**
 * Style Shopper UI — Melani DNA + closet-aware picks.
 */
import { useMemo, useState } from "react";
import { STYLE_BRANDS } from "./styleProfile";
import {
  analyzeCloset,
  askShopper,
  formatMoney,
  rankFinds,
} from "./styleShopperEngine";
import "./style-shopper.css";

const LANES = [
  { id: "all", label: "For you" },
  { id: "hoodies", label: "Hoodies" },
  { id: "sweats", label: "Sweats" },
  { id: "jeans", label: "Jeans" },
  { id: "tees", label: "Tees" },
];

const PROMPTS = [
  "What should I buy next?",
  "Minimalist 100% cotton tees for my jeans",
  "Build me an easy everyday uniform",
  "Uniqlo cotton sweatpants",
  "Edikted baggy jeans",
  "Stussy or Scuffers hoodie",
  "Comfort only — soft fabric",
  "Show my closet gaps",
];

/**
 * @param {{ items: Array<Record<string, unknown>>, onSaveWant?: (find: import("./styleShopperEngine").ShopFind) => void }} props
 */
export function StyleShopper({ items = [], onSaveWant }) {
  const [lane, setLane] = useState("all");
  const [query, setQuery] = useState("");
  const [asked, setAsked] = useState("");
  const [notice, setNotice] = useState("");

  const insight = useMemo(() => analyzeCloset(items), [items]);

  const reply = useMemo(() => {
    const text = asked || "What should I buy next?";
    return askShopper(text, items);
  }, [asked, items]);

  const finds = useMemo(() => {
    // When user typed a specific ask, prefer reply finds; else lane browse
    if (asked.trim()) return reply.finds;
    return rankFinds(items, {
      query: query.trim(),
      lane: lane === "all" ? "all" : lane,
      limit: 10,
    });
  }, [asked, reply.finds, items, query, lane]);

  const runAsk = (text) => {
    const t = (text || query).trim();
    setAsked(t || "What should I buy next?");
    setNotice("");
  };

  const saveWant = (find) => {
    if (onSaveWant) {
      onSaveWant(find);
      setNotice(`Saved “${find.name}” to Wishlist with its product link.`);
      return;
    }
    // Fallback: stash in localStorage for wardrobe want queue
    try {
      const key = "wonder-style-shopper-wants-v1";
      const prev = JSON.parse(localStorage.getItem(key) || "[]");
      const next = [
        {
          id: find.id,
          name: find.name,
          brand: find.brand,
          url: find.url,
          price: find.price,
          currency: find.currency,
          tags: find.tags,
          savedAt: new Date().toISOString(),
        },
        ...prev.filter((x) => x.id !== find.id),
      ].slice(0, 40);
      localStorage.setItem(key, JSON.stringify(next));
      setNotice(`Saved “${find.name}” to Wishlist with its product link.`);
    } catch {
      setNotice("Could not save locally — open the product page instead.");
    }
  };

  return (
    <div className="ss-root">
      <header className="ss-hero">
        <p className="ss-eyebrow">Personal stylist · shopping assistant</p>
        <h2>Buy less. Buy the right thing.</h2>
        <p>Every result must clear three gates: comfortable enough to live in, compatible with your closet, and worth the price.</p>
        <ul className="ss-dna">
          <li>Comfort is the veto</li>
          <li>Baggy denim + relaxed tops</li>
          <li>Cotton and soft fleece first</li>
          <li>Exact product links</li>
          <li>Closet gaps before trends</li>
        </ul>
      </header>

      <div className="ss-ask">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runAsk();
          }}
          placeholder="Ask: 100% cotton tee, minimalist black crew, baggy jeans…"
          aria-label="Ask the style shopper"
        />
        <button type="button" onClick={() => runAsk()}>
          Shop
        </button>
        <button
          type="button"
          className="ss-cotton-btn"
          onClick={() => {
            const t = "Minimalist 100% cotton tees for my jeans";
            setQuery(t);
            runAsk(t);
            setLane("tees");
          }}
        >
          100% cotton tees
        </button>
      </div>

      <div className="ss-lanes" role="tablist" aria-label="Shop lanes">
        {LANES.map((l) => (
          <button
            key={l.id}
            type="button"
            role="tab"
            className={lane === l.id && !asked ? "active" : lane === l.id ? "active" : ""}
            aria-selected={lane === l.id}
            onClick={() => {
              setLane(l.id);
              if (l.id === "tees") {
                const t = "Minimalist 100% cotton tees for my jeans";
                setQuery(t);
                setAsked(t);
              } else {
                setAsked("");
                if (l.id !== "all") setQuery(l.label.toLowerCase());
              }
            }}
          >
            {l.label}
          </button>
        ))}
      </div>

      <div className="ss-lanes" aria-label="Quick prompts">
        {PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              setQuery(p);
              runAsk(p);
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {notice ? (
        <p className="ss-meta" style={{ marginBottom: 16, color: "#6e302e", fontWeight: 600 }}>
          {notice}
        </p>
      ) : null}

      <p className="ss-section-title">Shopper notes</p>
      <div className="ss-reply" role="status">
        {reply.text}
      </div>

      <p className="ss-section-title">
        Ranked for you
        <span style={{ fontWeight: 500, marginLeft: 8, letterSpacing: 0 }}>
          {insight.owned} owned · {insight.want} want
        </span>
      </p>
      <div className="ss-grid">
        {finds.map((find) => {
          const price = formatMoney(find);
          return (
            <article key={find.id} className="ss-card">
              <div className="ss-card-top">
                <span className="ss-brand">{find.brand}</span>
                <span className="ss-score">{find.score}% fit</span>
              </div>
              <div className="ss-badges">
                {find.cotton100 ? <span className="ss-badge ss-badge-cotton">100% cotton</span> : null}
                {find.minimalist ? <span className="ss-badge">Minimal</span> : null}
                {find.source === "live-web" ? <span className="ss-badge ss-badge-live">Live web</span> : null}
              </div>
              <h3>{find.name}</h3>
              {price ? <p className="ss-price">{price}</p> : <p className="ss-meta">See site for price</p>}
              <ul className="ss-why">
                {find.why.slice(0, 2).map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              {find.fabricNote ? (
                <p className="ss-meta">Fabric · {find.fabricNote}</p>
              ) : null}
              {find.fitNote ? <p className="ss-meta">Fit · {find.fitNote}</p> : null}
              {find.pairsWith ? <p className="ss-meta">Pairs with · {find.pairsWith}</p> : null}
              {find.fillsGap ? <p className="ss-meta">Fills · {find.fillsGap}</p> : null}
              <div className="ss-actions">
                <a className="primary" href={find.url} target="_blank" rel="noreferrer">
                  {find.source === "live-web" ? "Open live result ↗" : "Shop exact item ↗"}
                </a>
                <button type="button" onClick={() => saveWant(find)}>
                  Save to Wishlist
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {insight.gaps.length ? (
        <>
          <p className="ss-section-title">Closet gaps</p>
          <ul className="ss-gaps">
            {insight.gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="ss-section-title">Brand lanes</p>
      <div className="ss-brands">
        {STYLE_BRANDS.map((b) => (
          <div key={b.brand} className="ss-brand-card">
            <strong>{b.brand}</strong>
            <span>{b.why}</span>
            <a href={b.homeUrl} target="_blank" rel="noreferrer">
              Shop {b.brand} ↗
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
