/**
 * Shelf brief — the smart half of the Bookshelf.
 *
 * Reads what's already on the shelf and says something useful about it: what to
 * read next and why, when the book in progress will be done, what's stalled,
 * and what the shelf is actually made of.
 */
import { useMemo, useState } from "react";
import { BookOpen, CaretRight, Sparkle } from "@phosphor-icons/react";
import { shelfInsights, type ShelfBrief as Brief } from "./bookIntelligence";
import type { Book } from "./booksStore";
import "./shelf-brief.css";

type Props = {
  books: Book[];
  onOpen: (book: Book) => void;
  onStart: (book: Book) => void;
  /** Jump the shelf's search box to a term, e.g. a subject chip */
  onSearch?: (query: string) => void;
};

function progressLabel(estimate: Brief["inProgress"][number]): string {
  const percent = Math.round(estimate.progress * 100);
  if (estimate.daysLeft === null) return `${percent}% in`;
  if (estimate.daysLeft <= 1) return `${percent}% · finishing today`;
  if (estimate.daysLeft <= 45) return `${percent}% · ~${estimate.daysLeft} days left`;
  const months = Math.round(estimate.daysLeft / 30);
  return `${percent}% · ~${months} month${months === 1 ? "" : "s"} left`;
}

export function ShelfBrief({ books, onOpen, onStart, onSearch }: Props) {
  const [open, setOpen] = useState(true);
  const brief = useMemo(() => shelfInsights(books), [books]);
  const byId = useMemo(() => new Map(books.map((book) => [book.id, book])), [books]);

  if (!books.length) return null;

  const pace = brief.pace;
  const paceLine = pace.confident
    ? `${pace.booksPerMonth} book${pace.booksPerMonth === 1 ? "" : "s"} a month · median ${pace.medianDaysToFinish} days each`
    : pace.finishedTotal
      ? `${pace.finishedTotal} finished so far`
      : "Finish a book to start measuring your pace";

  return (
    <section className={`sb${open ? " is-open" : ""}`} aria-label="Shelf brief">
      <button
        type="button"
        className="sb-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <Sparkle size={15} weight="fill" aria-hidden />
        <span className="sb-toggle-title">Smart shelf</span>
        <span className="sb-toggle-note">{paceLine}</span>
        <CaretRight
          size={14}
          className="sb-caret"
          weight="bold"
          aria-hidden
        />
      </button>

      {open ? (
        <div className="sb-body">
          {brief.inProgress.length ? (
            <div className="sb-block">
              <h3 className="sb-h">Reading now</h3>
              <ul className="sb-list">
                {brief.inProgress.slice(0, 3).map((estimate) => {
                  const book = byId.get(estimate.bookId);
                  if (!book) return null;
                  return (
                    <li
                      key={estimate.bookId}
                      className={`sb-row${estimate.stalled ? " is-stalled" : ""}`}
                    >
                      <button
                        type="button"
                        className="sb-row-main"
                        onClick={() => onOpen(book)}
                        title={estimate.basis}
                      >
                        <span className="sb-row-title">{estimate.title}</span>
                        <span className="sb-row-note">
                          {progressLabel(estimate)}
                          {estimate.stalled && estimate.idleDays
                            ? ` · idle ${estimate.idleDays}d`
                            : ""}
                        </span>
                      </button>
                      <span
                        className="sb-bar"
                        aria-hidden
                        style={{ ["--sb-fill" as string]: `${Math.round(estimate.progress * 100)}%` }}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {brief.nextUp.length ? (
            <div className="sb-block">
              <h3 className="sb-h">Read next</h3>
              <ul className="sb-list">
                {brief.nextUp.map((suggestion) => (
                  <li key={suggestion.book.id} className="sb-row sb-next">
                    <button
                      type="button"
                      className="sb-row-main"
                      onClick={() => onOpen(suggestion.book)}
                    >
                      <span className="sb-row-title">{suggestion.book.title}</span>
                      <span className="sb-row-note">
                        {suggestion.reasons[0]}
                        {suggestion.book.author ? ` · ${suggestion.book.author}` : ""}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="sb-start"
                      onClick={() => onStart(suggestion.book)}
                      title={suggestion.reasons.join(" · ")}
                    >
                      <BookOpen size={13} aria-hidden />
                      Start
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {brief.insights.length ? (
            <div className="sb-block">
              <h3 className="sb-h">Worth knowing</h3>
              <ul className="sb-insights">
                {brief.insights.slice(0, 4).map((insight) => (
                  <li key={insight.id} className={`sb-insight is-${insight.kind}`}>
                    <b>{insight.headline}</b>
                    <span>{insight.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {brief.topSubjects.length ? (
            <div className="sb-block sb-block-wide">
              <h3 className="sb-h">What this shelf is made of</h3>
              <ul className="sb-subjects">
                {brief.topSubjects.map((entry) => (
                  <li key={entry.subject}>
                    <button
                      type="button"
                      onClick={() => onSearch?.(entry.subject)}
                      title={`Show books tagged ${entry.subject}`}
                    >
                      {entry.subject}
                      <b>{entry.count}</b>
                    </button>
                  </li>
                ))}
              </ul>
              {brief.series.length ? (
                <p className="sb-series">
                  Series on the shelf:{" "}
                  {brief.series
                    .slice(0, 3)
                    .map(
                      (group) =>
                        `${group.name} (${group.books.length} of ${
                          group.have[group.have.length - 1]
                        })`
                    )
                    .join(" · ")}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
