import { QuoteRefreshControl } from "./QuoteRefreshControl";
import { useQuoteRotation } from "./useQuoteRotation";

export function UniversalQuote() {
  const { quote, remaining, limit, msUntilReset, nextQuote } =
    useQuoteRotation();

  return (
    <figure className="wonder-page-quote">
      <div className="wonder-page-quote-copy">
        <blockquote>“{quote.text}”</blockquote>
        <figcaption>{quote.source}</figcaption>
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
