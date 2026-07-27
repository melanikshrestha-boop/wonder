/**
 * Apple-style emoji keyboard.
 * Full RGI set (Unicode 15.1), category tabs, subgroup headers, recents, paste any emoji.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { EMOJI_GROUPS, filterEmojis, type EmojiGroup } from "../emojiCatalog";

const RECENTS_KEY = "wonder-emoji-recents-v1";
const MAX_RECENTS = 32;

type Props = {
  current: string;
  onPick: (emoji: string) => void;
  onClose: () => void;
  resetEmoji?: string;
  resetLabel?: string;
  className?: string;
  style?: CSSProperties;
};

function looksLikeEmojiPaste(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 16) return false;
  if (/[a-zA-Z]{2,}/.test(t)) return false;
  return true;
}

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function pushRecent(emoji: string) {
  try {
    const prev = loadRecents().filter((e) => e !== emoji);
    const next = [emoji, ...prev].slice(0, MAX_RECENTS);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function EmojiPicker({
  current,
  onPick,
  onClose,
  resetEmoji = "📄",
  resetLabel = "Reset",
  className,
  style,
}: Props) {
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState(EMOJI_GROUPS[0]?.id || "smileys");
  const [recents, setRecents] = useState<string[]>(() => loadRecents());
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const pastedEmoji = looksLikeEmojiPaste(query) ? query.trim() : null;
  const searching = query.trim().length > 0 && !pastedEmoji;

  const searchGroups = useMemo(
    () => (searching ? filterEmojis(query) : []),
    [query, searching]
  );

  const active: EmojiGroup | undefined = EMOJI_GROUPS.find((g) => g.id === activeGroup);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Reset scroll when switching category
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [activeGroup, query]);

  function pick(emoji: string) {
    pushRecent(emoji);
    setRecents(loadRecents());
    onPick(emoji);
  }

  const rootClass = ["emoji-picker", "emoji-picker--ios", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={rootClass}
      ref={rootRef}
      role="dialog"
      aria-label="Emoji keyboard"
      style={style}
    >
      <div className="emoji-picker-head">
        <input
          ref={searchRef}
          className="emoji-picker-search"
          type="search"
          placeholder="Search emoji"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && pastedEmoji) {
              e.preventDefault();
              pick(pastedEmoji);
            }
          }}
        />
        <button
          type="button"
          className="emoji-picker-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="emoji-picker-scroll" ref={scrollRef}>
        {pastedEmoji ? (
          <div className="emoji-picker-paste">
            <button
              type="button"
              className="emoji-picker-paste-btn"
              onClick={() => pick(pastedEmoji)}
            >
              <span className="emoji-picker-paste-glyph">{pastedEmoji}</span>
              Use emoji
            </button>
            <p className="emoji-picker-paste-hint">
              Mac: Control–Command–Space for the system emoji keyboard — paste here for anything.
            </p>
          </div>
        ) : searching ? (
          searchGroups.length === 0 ? (
            <div className="emoji-picker-empty">No matches</div>
          ) : (
            searchGroups.map((g) => (
              <div key={g.label} className="emoji-picker-section">
                <div className="emoji-picker-section-label">{g.label}</div>
                <div className="emoji-picker-grid">
                  {g.emojis.map((em) => (
                    <button
                      key={`${g.label}-${em}`}
                      type="button"
                      className={`emoji-picker-cell${em === current ? " is-current" : ""}`}
                      onClick={() => pick(em)}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )
        ) : (
          <>
            {recents.length > 0 && activeGroup === EMOJI_GROUPS[0]?.id ? (
              <div className="emoji-picker-section">
                <div className="emoji-picker-section-label">Recents</div>
                <div className="emoji-picker-grid">
                  {recents.map((em) => (
                    <button
                      key={`recent-${em}`}
                      type="button"
                      className={`emoji-picker-cell${em === current ? " is-current" : ""}`}
                      onClick={() => pick(em)}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {active?.subgroups?.map((sub) => (
              <div key={sub.id} className="emoji-picker-section">
                <div className="emoji-picker-section-label">{sub.label}</div>
                <div className="emoji-picker-grid">
                  {sub.emojis.map((em) => (
                    <button
                      key={`${sub.id}-${em}`}
                      type="button"
                      className={`emoji-picker-cell${em === current ? " is-current" : ""}`}
                      onClick={() => pick(em)}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Bottom category bar — Apple keyboard style */}
      {!searching && !pastedEmoji ? (
        <div className="emoji-picker-dock" role="tablist" aria-label="Emoji categories">
          {EMOJI_GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={activeGroup === g.id}
              className={`emoji-picker-dock-tab${activeGroup === g.id ? " is-active" : ""}`}
              onClick={() => setActiveGroup(g.id)}
              title={g.label}
            >
              <span aria-hidden>{g.tab}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="emoji-picker-foot">
        <button
          type="button"
          className="emoji-picker-remove"
          onClick={() => pick(resetEmoji)}
        >
          {resetLabel}
        </button>
        <span className="emoji-picker-count">
          {EMOJI_GROUPS.reduce((n, g) => n + g.emojis.length, 0).toLocaleString()} emojis
        </span>
      </div>
    </div>
  );
}
