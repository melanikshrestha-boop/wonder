import { useCallback, useEffect, useState } from "react";
import {
  changeQuote,
  currentQuoteRotation,
  QUOTE_ROTATION_EVENT,
} from "./quoteRotation";

export function useQuoteRotation() {
  const [rotation, setRotation] = useState(() => currentQuoteRotation());

  useEffect(() => {
    let timer: number | undefined;
    const refresh = () => {
      const next = currentQuoteRotation();
      setRotation(next);
      timer = window.setTimeout(
        refresh,
        Math.max(30_000, next.msUntilReset + 1_500)
      );
    };
    const sync = () => setRotation(currentQuoteRotation());
    refresh();
    window.addEventListener(QUOTE_ROTATION_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener(QUOTE_ROTATION_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const nextQuote = useCallback(() => {
    setRotation(changeQuote());
  }, []);

  return { ...rotation, nextQuote };
}
