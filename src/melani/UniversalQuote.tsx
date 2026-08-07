import { QuoteRefreshControl } from "./QuoteRefreshControl";
import { useQuoteRotation } from "./useQuoteRotation";

export function UniversalQuote() {
  const { quote, remaining, limit, msUntilReset, nextQuote } =
    useQuoteRotation();

  // Never let a missing quote blank the whole shell (Bookshelf / Finances sit under this band).
  if (!quote?.text) return null;

  return (
    <figure className="wonder-page-quote">
      <div className="wonder-page-quote-copy">
        <blockquote>“{quote.text}”</blockquote>
        <figcaption>{quote.source || ""}</figcaption>
      </div>
      <QuoteRefreshControl
        remaining={remaining}
        limit={limit}
        msUntilReset={msUntilReset}
        onChange={nextQuote}
      />
    </figure>
  );
}
