import { ArrowsClockwise } from "@phosphor-icons/react";

function resetLabel(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function QuoteRefreshControl({
  remaining,
  limit,
  msUntilReset,
  onChange,
  className = "",
}: {
  remaining: number;
  limit: number;
  msUntilReset: number;
  onChange: () => void;
  className?: string;
}) {
  const exhausted = remaining <= 0;
  const reset = resetLabel(msUntilReset);
  const label = exhausted
    ? `Quote change limit reached. Available again in ${reset}.`
    : `Change quote. ${remaining} of ${limit} changes left in this six-hour window.`;

  return (
    <div
      className={`wonder-quote-refresh${className ? ` ${className}` : ""}`}
    >
      <button
        type="button"
        onClick={onChange}
        disabled={exhausted}
        aria-label={label}
        title={label}
      >
        <ArrowsClockwise size={14} weight="regular" aria-hidden />
      </button>
      <span aria-hidden>
        {remaining}/{limit}
        {exhausted ? ` · ${reset}` : ""}
      </span>
    </div>
  );
}
