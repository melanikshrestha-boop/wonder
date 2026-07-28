import { useEffect, useState } from "react";
import { msUntilNextQuoteSlot, todayQuote } from "./dailyQuotes";

export function UniversalQuote() {
  const [quote, setQuote] = useState(() => todayQuote());

  useEffect(() => {
    let timer: number | undefined;
    const refresh = () => {
      setQuote(todayQuote());
      timer = window.setTimeout(
        refresh,
        Math.max(30_000, msUntilNextQuoteSlot() + 1_500)
      );
    };
    refresh();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  return (
    <figure className="wonder-page-quote">
      <blockquote>“{quote.text}”</blockquote>
      <figcaption>{quote.source}</figcaption>
    </figure>
  );
}
