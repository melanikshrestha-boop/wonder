import { useCallback, useEffect, useState } from "react";
import {
  changeQuote,
  currentQuoteRotation,
  QUOTE_ROTATION_EVENT,
  type QuoteChannel,
} from "./quoteRotation";

export function useQuoteRotation(channel: QuoteChannel = "hero") {
  const [rotation, setRotation] = useState(() =>
    currentQuoteRotation(undefined, channel)
  );

  useEffect(() => {
    let timer: number | undefined;
    const refresh = () => {
      const next = currentQuoteRotation(undefined, channel);
      setRotation(next);
      timer = window.setTimeout(
        refresh,
        Math.max(30_000, next.msUntilReset + 1_500)
      );
    };
    const sync = () => setRotation(currentQuoteRotation(undefined, channel));
    refresh();
    window.addEventListener(QUOTE_ROTATION_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener(QUOTE_ROTATION_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [channel]);

  const nextQuote = useCallback(() => {
    setRotation(changeQuote(undefined, channel));
  }, [channel]);

  return { ...rotation, nextQuote };
}
