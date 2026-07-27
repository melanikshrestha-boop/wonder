import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isBriefHour, loadBodyBrief } from "./bodyBrief";
import { todayKey } from "./data";
import { checkMelCloud, checkMelLocalModel, runMelAgent } from "./melAgent";
import {
  MEL_OPEN_SCIENCE_EVENT,
  MEL_PROMPT_EVENT,
  type MelPromptRequest,
} from "./melActions";
import { ensureDefaultWeatherLocation } from "./weather/weatherCore";
import { rewardEpisode } from "./rlAgent";
import { markAwaitingRetrain } from "./melLearn";
import "./melani-ai.css";

type Role = "user" | "assistant";

type Msg = {
  id: string;
  role: Role;
  content: string;
  /** RL episode for trial-and-error scoring */
  rlEpisodeId?: string;
  /** User already scored this reply */
  feedback?: "up" | "down";
};

type Props = {
  pageId?: string;
  pageTitle?: string;
};

const CHAT_KEY = "dr-melani-ai-chat-v1";
const OPEN_KEY = "dr-melani-ai-open";
// How big Mel chat text is — you pick with − / +, we remember it
const TEXT_SIZE_KEY = "dr-melani-ai-text-size-v1";
// How wide Mel’s panel is — drag the left edge to extend
const WIDTH_KEY = "dr-melani-ai-width-v1";
const WIDTH_MIN = 320;
const WIDTH_MAX = 920;
type TextSize = "s" | "m" | "l" | "xl";
const TEXT_SIZES: TextSize[] = ["s", "m", "l", "xl"];

function loadPanelWidth(): number {
  try {
    const n = Number(localStorage.getItem(WIDTH_KEY));
    if (Number.isFinite(n) && n >= WIDTH_MIN && n <= WIDTH_MAX) return n;
  } catch {
    /* ignore */
  }
  return 400;
}

function savePanelWidth(w: number) {
  try {
    localStorage.setItem(WIDTH_KEY, String(Math.round(w)));
  } catch {
    /* ignore */
  }
}

function loadTextSize(): TextSize {
  try {
    const v = localStorage.getItem(TEXT_SIZE_KEY) as TextSize | null;
    if (v && TEXT_SIZES.includes(v)) return v;
  } catch {
    /* ignore */
  }
  return "m"; // default matches Habits body size
}

function saveTextSize(size: TextSize) {
  try {
    localStorage.setItem(TEXT_SIZE_KEY, size);
  } catch {
    /* ignore */
  }
}

function loadMsgs(): Msg[] {
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    if (raw) return JSON.parse(raw) as Msg[];
  } catch {
    /* ignore */
  }
  return [];
}

function saveMsgs(msgs: Msg[]) {
  try {
    localStorage.setItem(CHAT_KEY, JSON.stringify(msgs.slice(-50)));
  } catch {
    /* ignore */
  }
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function noEmDash(text: string): string {
  return text
    .replace(/\u2014/g, ",")
    .replace(/\u2013/g, "-")
    .replace(/—/g, ",")
    .replace(/–/g, "-");
}

/** Render chat text in scannable chunks (paragraphs + links). Humans skim; walls fail. */
function renderMessage(text: string) {
  const clean = noEmDash(text);
  // Split on blank lines first (sections), then keep single newlines inside a chunk
  const blocks = clean.split(/\n{2,}/).filter((b) => b.trim().length > 0);
  if (blocks.length <= 1 && !clean.includes("\n")) {
    return linkifyInline(clean);
  }
  return blocks.map((block, bi) => {
    const lines = block.split("\n");
    return (
      <div key={bi} className="mai-chunk">
        {lines.map((line, li) => {
          const isHeader =
            /^—\s+.+?\s+—$/.test(line.trim())
            || /^(Nightly body brief|Today,|Today:|SLEEP|MEALS|WATER|CYCLE|GYM)/i.test(line.trim());
          return (
            <p
              key={li}
              className={
                isHeader
                  ? "mai-line mai-line-head"
                  : line.trim() === ""
                    ? "mai-line mai-line-gap"
                    : "mai-line"
              }
            >
              {linkifyInline(line || "\u00a0")}
            </p>
          );
        })}
      </div>
    );
  });
}

function linkifyInline(text: string) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return parts.map((part, i) =>
    part.startsWith("http") ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer">
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export function MelaniAI({ pageId, pageTitle }: Props) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [msgs, setMsgs] = useState<Msg[]>(() => loadMsgs());
  const [input, setInput] = useState("");
  // Chat text size: S M L XL — saved so it stays to your liking
  const [textSize, setTextSize] = useState<TextSize>(() => loadTextSize());
  // Panel width — drag left edge; saved so it stays
  const [panelWidth, setPanelWidth] = useState(() => loadPanelWidth());
  const [busy, setBusy] = useState(false);
  const [cloudConnected, setCloudConnected] = useState(false);
  const [localModelConnected, setLocalModelConnected] = useState(false);
  const msgsRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dragWidthRef = useRef<{ startX: number; startW: number } | null>(null);
  const panelWidthLive = useRef(panelWidth);

  // Shrink / grow Mel text one step
  function changeTextSize(dir: -1 | 1) {
    const i = TEXT_SIZES.indexOf(textSize);
    const next = TEXT_SIZES[Math.min(TEXT_SIZES.length - 1, Math.max(0, i + dir))];
    if (!next || next === textSize) return;
    setTextSize(next);
    saveTextSize(next);
  }

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (open) window.setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);


  // Legacy “science page” just opens Mel chat — engines stay backend-only
  useEffect(() => {
    const openMel = () => setOpen(true);
    window.addEventListener(MEL_OPEN_SCIENCE_EVENT, openMel);
    return () => window.removeEventListener(MEL_OPEN_SCIENCE_EVENT, openMel);
  }, []);

  useEffect(() => {
    if (!open) return;
    // Weather is Mel-only — default city NYC, no Weather page
    try {
      ensureDefaultWeatherLocation();
    } catch {
      /* ignore */
    }
    let active = true;
    const refresh = () => {
      // Health checks are short; failures must not block chat
      void Promise.all([checkMelCloud(), checkMelLocalModel()]).then(
        ([cloud, local]) => {
          if (!active) return;
          setCloudConnected(cloud);
          setLocalModelConnected(local);
        }
      );
    };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [open]);

  useEffect(() => {
    saveMsgs(msgs);
    const last = msgs.at(-1);
    window.requestAnimationFrame(() => {
      const container = msgsRef.current;
      if (!container) return;
      if (last?.role === "assistant" && last.content.length > 600) {
        const replies = container.querySelectorAll<HTMLElement>(".mai-msg.is-ai");
        const target = replies.item(replies.length - 1);
        if (target) {
          const top =
            target.getBoundingClientRect().top -
            container.getBoundingClientRect().top +
            container.scrollTop;
          container.scrollTo({ top: Math.max(0, top - 4), behavior: "smooth" });
          return;
        }
      }
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, [msgs]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      const userMsg: Msg = { id: uid(), role: "user", content: trimmed };
      setMsgs((prev) => [...prev, userMsg]);
      setInput("");
      setBusy(true);

      try {
        const result = await runMelAgent({
          text: trimmed,
          pageId,
          pageTitle,
          history: msgs.slice(-18).map(({ role, content }) => ({ role, content })),
          cloudAvailable: cloudConnected,
          localModelAvailable: localModelConnected,
        });
        setMsgs((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            content: noEmDash(result.reply),
            rlEpisodeId: result.rlEpisodeId,
          },
        ]);
      } catch {
        setMsgs((prev) => [...prev, {
          id: uid(),
          role: "assistant",
          content: "I hit a local save error. Nothing else was changed.",
        }]);
      } finally {
        setBusy(false);
      }
    },
    [busy, cloudConnected, localModelConnected, msgs, pageId, pageTitle]
  );

  /**
   * Thumbs → real RL write (localStorage key wonder-rl-agent-v1).
   * UI only says "logged" if rewardEpisode returns ok — no fake success.
   */
  function scoreMessage(msgId: string, episodeId: string | undefined, dir: "up" | "down") {
    const reward = dir === "up" ? 1 : -1;
    let r = episodeId
      ? rewardEpisode(episodeId, reward, `thumb_${dir}`)
      : rewardEpisode("pending", reward, `thumb_${dir}`);
    // Stale message id after reload — score the open pending episode if any
    if (!r.ok && episodeId) {
      r = rewardEpisode("pending", reward, `thumb_${dir}`);
    }
    if (!r.ok) {
      // Honest: don't paint "penalty logged" if nothing hit the brain
      setMsgs((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                content:
                  m.content +
                  (m.content.includes("[RL]")
                    ? ""
                    : `\n\n[RL] ${r.tip}`),
              }
            : m
        )
      );
      return;
    }
    // 👎 → next user message can retrain exact preferred reply
    if (dir === "down") {
      try {
        markAwaitingRetrain({ episodeId: r.episode?.id || episodeId, pageId });
      } catch {
        /* ignore */
      }
    }
    setMsgs((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, feedback: dir } : m))
    );
  }

  useEffect(() => {
    const onPrompt = (event: Event) => {
      const request = (event as CustomEvent<MelPromptRequest>).detail;
      if (!request?.text) return;
      setOpen(true);
      window.setTimeout(() => void send(request.text), 0);
    };
    window.addEventListener(MEL_PROMPT_EVENT, onPrompt);
    return () => window.removeEventListener(MEL_PROMPT_EVENT, onPrompt);
  }, [send]);

  function clearChat() {
    setMsgs([]);
    try {
      localStorage.removeItem(CHAT_KEY);
    } catch {
      /* ignore */
    }
  }

  // Evening nudge: first open after 8pm with no brief yet
  useEffect(() => {
    if (!open) return;
    if (!isBriefHour()) return;
    if (loadBodyBrief(todayKey())) return;
    // Soft welcome line only when chat is empty
    setMsgs((prev) => {
      if (prev.length > 0) return prev;
      return [
        {
          id: uid(),
          role: "assistant",
          content:
            "Evening. Ask for status or what matters if you want a body check.",
        },
      ];
    });
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  // Drag the left edge of Mel to make the chat wider or narrower
  function onResizePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragWidthRef.current = { startX: e.clientX, startW: panelWidthLive.current };
  }

  function onResizePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragWidthRef.current;
    if (!drag) return;
    // Drag left = wider (panel is right-docked)
    const next = Math.min(
      WIDTH_MAX,
      Math.max(WIDTH_MIN, drag.startW + (drag.startX - e.clientX))
    );
    panelWidthLive.current = next;
    setPanelWidth(next);
  }

  function onResizePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragWidthRef.current) return;
    dragWidthRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    savePanelWidth(panelWidthLive.current);
  }

  const panel = open ? (
        <div
          className={`mai-panel mai-size-${textSize}`}
          role="dialog"
          aria-label="Mel"
          style={{ width: `min(${panelWidth}px, calc(100vw - 24px))` }}
        >
          <div
            className="mai-resize"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize Mel chat"
            title="Drag to make Mel wider or narrower"
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            onPointerCancel={onResizePointerUp}
          />
          <header className="mai-head">
            <p className="mai-title">Mel</p>
            <button
              type="button"
              className="mai-head-btn mai-size-btn"
              onClick={() => changeTextSize(-1)}
              disabled={textSize === "s"}
              aria-label="Make Mel text smaller"
              title="Smaller text"
            >
              −
            </button>
            <button
              type="button"
              className="mai-head-btn mai-size-btn"
              onClick={() => changeTextSize(1)}
              disabled={textSize === "xl"}
              aria-label="Make Mel text bigger"
              title="Bigger text"
            >
              +
            </button>
            <button type="button" className="mai-head-btn" onClick={clearChat}>
              Clear
            </button>
            <button
              type="button"
              className="mai-head-btn"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
          </header>

          <div ref={msgsRef} className="mai-msgs">
            {msgs.length === 0 && (
              <p className="mai-welcome">
                Hey. Body, money, YouTube, focus — ask in plain English.
              </p>
            )}
            {msgs.map((m) => (
              <div
                key={m.id}
                className={`mai-msg ${m.role === "user" ? "is-user" : "is-ai"}${
                  m.content.includes("\n") || m.content.length > 120 ? " is-long" : ""
                }`}
              >
                {renderMessage(m.content)}
                {m.role === "assistant" ? (
                  <div className="mai-rl" role="group" aria-label="Score this reply for RL">
                    <button
                      type="button"
                      className={`mai-rl-btn${m.feedback === "up" ? " is-on" : ""}`}
                      disabled={!!m.feedback}
                      title="Reward — this action was good"
                      aria-label="Reward this reply"
                      onClick={() => scoreMessage(m.id, m.rlEpisodeId, "up")}
                    >
                      👍
                    </button>
                    <button
                      type="button"
                      className={`mai-rl-btn${m.feedback === "down" ? " is-on is-down" : ""}`}
                      disabled={!!m.feedback}
                      title="Penalty — this action was bad"
                      aria-label="Penalize this reply"
                      onClick={() => scoreMessage(m.id, m.rlEpisodeId, "down")}
                    >
                      👎
                    </button>
                    {m.feedback ? (
                      <span className="mai-rl-note">
                        {m.feedback === "up" ? "reward logged" : "penalty logged"}
                      </span>
                    ) : (
                      <span className="mai-rl-note">train Mel</span>
                    )}
                  </div>
                ) : null}
              </div>
            ))}
            {busy && <p className="mai-typing">…</p>}
            <div ref={bottomRef} />
          </div>

          <form
            className="mai-form"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <textarea
              ref={inputRef}
              className="mai-input"
              rows={1}
              placeholder="Message"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={busy}
            />
            <button
              type="submit"
              className="mai-send"
              disabled={busy || !input.trim()}
              aria-label="Send"
            >
              Send
            </button>
          </form>
        </div>
      ) : null;

  return (
    <>
      {panel && typeof document !== "undefined"
        ? createPortal(panel, document.body)
        : panel}
      <div className="mai-root">
      <button
        type="button"
        className={`mai-bubble${open ? " is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close Mel" : "Open Mel"}
      >
        {open ? "×" : "M"}
      </button>
      </div>
    </>
  );
}
