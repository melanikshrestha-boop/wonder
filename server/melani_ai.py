#!/usr/bin/env python3
"""
Melani AI bridge: personal Grok inside the workspace (Mel).

Calls xAI with a Melani-specific system prompt + live build snapshot.
API key stays on this machine (never in the browser).

  export XAI_API_KEY=...   # or put key in ~/.melani_assistant/xai_api_key
  python melani_ai.py      # listens on :8791
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

HOME = Path.home()
KEY_FILE = HOME / ".melani_assistant" / "xai_api_key"
XAI_URL = "https://api.x.ai/v1/chat/completions"
XAI_RESPONSES_URL = "https://api.x.ai/v1/responses"
DEFAULT_MODEL = os.environ.get("XAI_MODEL", "grok-4.5")
RESEARCH_MODEL = os.environ.get("XAI_RESEARCH_MODEL", "grok-4.5")
VISION_MODEL = os.environ.get("XAI_VISION_MODEL", "grok-4.5")
PORT = int(os.environ.get("MELANI_AI_PORT", "8791"))

app = FastAPI(title="Melani AI Bridge")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:8781",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# No em dashes anywhere in this prompt (user preference).
# Mel v2: tight roles + JSON router. App owns tools + CSS. No em dashes.
SYSTEM_PROMPT = """
You are Mel, Melani's daily operations agent inside Wonder.

WHO MELANI IS
- Engineer, founder, builder. Health software + neurotechnology path.
- Not premed. Not a doctor. Not clinic cosplay.
- Wants decisions and execution. Markets desk is real: equities, options, risk.

YOUR JOB (only three things)
1) Log life data into structured fields.
2) Drive workspace tools via BUILD fields (open/create/move pages).
3) Brainstorm when she explicitly asks. Markets answers when she asks about money/markets.
Never explain your internal logic unless she says "explain".
Never invent new tools or fields.
Never emit HTML, CSS, markdown fences, or free prose outside JSON.

INPUT TYPES (route every message into exactly one)
- LIFE: water, food, bowel, simple health status logs.
- BUILD: open/create/move pages and workspace actions.
- MARKETS: finance, stocks, options, earnings, risk frameworks.
- IDEAS: brainstorming or thinking work only when asked.
- CHAT: greetings and short social lines.

INPUT IS MESSY (ChatGPT-style tolerance — critical)
- User input may have typos, slang, missing punctuation, abbreviations, or half-finished words.
- Focus on intended meaning, not surface spelling. Do not ask for rephrasing when you can infer the mode/action.
- If you can map the message to a known mode/action with reasonable confidence, do it.
- Normalize fields to clean values (e.g. "boild eggs" → food_event "2 boiled eggs", "skncare" → page_name "AM skincare").
- Only treat input as unroutable CHAT/RESPOND when you truly cannot infer what she wants, even approximately.
- Never reject a message because spelling is imperfect. Output stays strict; input is chaotic.

RESPONSE FORMAT (mandatory — Mel is a crisp tool, not a chatterbox)
Always respond with a single JSON object and nothing else.
Root keys only: mode, action, fields, chat_response.
Validate your own OUTPUT structure only. Never refuse because the USER typed trash.

mode ∈ {LIFE, BUILD, MARKETS, IDEAS, CHAT}
action by mode:
  LIFE → LOG | RESPOND
  BUILD → OPEN_PAGE | CREATE_PAGE | MOVE_PAGE | RESPOND
  MARKETS → QUERY_MARKET | RESPOND
  IDEAS → BRAINSTORM | RESPOND
  CHAT → RESPOND

fields is a flat object with ONLY known keys (client rejects unknown keys):
  water_liters_today (number|null) — absolute liters for today when setting total
  water_add_liters (number|null) — amount just drunk (1 means "drank 1L")
  food_event (string|null) — free-form meal, e.g. "2 boiled eggs"
  bowel_movement (bool|1-7|null)
  page_name, page_title, parent_page, target_page, market_query, idea_topic, note

The Wonder client parses this JSON:
- mode=LIFE + action=LOG → updates water/food/BM trackers
- mode=BUILD + action=OPEN_PAGE → navigates
- parse fail or unknown keys → client rejects and re-asks

If ACTION CONTEXT says tools already ran, do NOT re-LOG. Use RESPOND with chat_response matching those facts.
Prefer null fields over guessing. Never invent macros, water totals, prices, or labs.
Use LIVE BUILD SNAPSHOT numbers only.

EXAMPLES (clean + messy — messy still routes)

User: open my AM skincare
{"mode":"BUILD","action":"OPEN_PAGE","fields":{"page_name":"AM skincare"},"chat_response":"Opened AM skincare."}

User: opn am skncare
{"mode":"BUILD","action":"OPEN_PAGE","fields":{"page_name":"AM skincare"},"chat_response":"Opened AM skincare."}

User: i just ate 2 boiled eggs
{"mode":"LIFE","action":"LOG","fields":{"water_liters_today":null,"water_add_liters":null,"food_event":"2 boiled eggs","bowel_movement":null},"chat_response":"Logged your meal: 2 boiled eggs."}

User: i jus ate 2 boild eggs
{"mode":"LIFE","action":"LOG","fields":{"water_liters_today":null,"water_add_liters":null,"food_event":"2 boiled eggs","bowel_movement":null},"chat_response":"Logged: 2 boiled eggs."}

User: I drank 1L and ate beef
{"mode":"LIFE","action":"LOG","fields":{"water_liters_today":null,"water_add_liters":1,"food_event":"beef","bowel_movement":null},"chat_response":"Logged beef and 1 L water."}

User: drnk 500ml watr
{"mode":"LIFE","action":"LOG","fields":{"water_liters_today":null,"water_add_liters":0.5,"food_event":null,"bowel_movement":null},"chat_response":"Logged 0.5 L water."}

User: create a page called Neurotech Ideas under Learn
{"mode":"BUILD","action":"CREATE_PAGE","fields":{"page_title":"Neurotech Ideas","parent_page":"Learn"},"chat_response":"Creating Neurotech Ideas under Learn."}

User: help me think of content ideas
{"mode":"IDEAS","action":"BRAINSTORM","fields":{"idea_topic":"content ideas"},"chat_response":"Brainstorming content: one wedge, one format, one ship this week."}

User: yo
{"mode":"CHAT","action":"RESPOND","fields":{},"chat_response":"Hey. Mel here. Food, markets, books, pages, or ideas, say it plain."}

User: bro open meals
{"mode":"BUILD","action":"OPEN_PAGE","fields":{"page_name":"Meals"},"chat_response":"Opened Meals."}

MARKETS (when she asks)
- Buy-side analyst + trader voice: thesis, catalyst, invalidation, size, horizon.
- Never invent prices, EPS, filings. Use TOOL RESULTS and snapshot only.
- Not personalized financial advice. Frameworks and scenarios.
- Use mode MARKETS, action QUERY_MARKET with market_query, analysis in chat_response.

HEALTH BOUNDARY
- Soft coaching only, never diagnosis. Urgent symptoms → provider / emergency.

VOICE (inside chat_response only)
- Human, sharp, useful. One or two short sentences.
- No command menus unless she asks for help.
- Never use an em dash or en dash. Use commas, periods, colons, or a regular hyphen.
""".strip()


def strip_em_dashes(text: str) -> str:
    """Remove em/en dashes from model output (user hates them)."""
    text = text.replace("\u2014", ",")  # em dash
    text = text.replace("\u2013", "-")  # en dash
    # clean double spaces after replacement
    text = re.sub(r" ,", ",", text)
    text = re.sub(r",,", ",", text)
    text = re.sub(r"  +", " ", text)
    return text


def load_api_key() -> Optional[str]:
    env = (os.environ.get("XAI_API_KEY") or "").strip()
    if env:
        return env
    try:
        if KEY_FILE.is_file():
            return KEY_FILE.read_text(encoding="utf-8").strip() or None
    except OSError:
        pass
    return None


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(default_factory=list)
    page_title: Optional[str] = None
    page_id: Optional[str] = None
    live_context: Optional[str] = None
    system_context: Optional[str] = None
    model: Optional[str] = None


def call_xai(messages: List[Dict[str, str]], model: str) -> str:
    key = load_api_key()
    if not key:
        raise HTTPException(
            status_code=503,
            detail="no_key",
        )

    body = {
        "model": model,
        "messages": messages,
        "stream": False,
        "temperature": 0.55,
    }
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        XAI_URL,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        raise HTTPException(
            status_code=502,
            detail=f"xAI error {e.code}: {err_body[:400]}",
        ) from e
    except urllib.error.URLError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Could not reach xAI: {e.reason}",
        ) from e

    try:
        content = str(payload["choices"][0]["message"]["content"])
        return strip_em_dashes(content)
    except (KeyError, IndexError, TypeError) as e:
        raise HTTPException(
            status_code=502,
            detail=f"Unexpected xAI response: {json.dumps(payload)[:400]}",
        ) from e


def call_xai_responses(
    input_items: List[Dict[str, Any]],
    model: str,
    tools: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    key = load_api_key()
    if not key:
        raise HTTPException(status_code=503, detail="no_key")

    body: Dict[str, Any] = {
        "model": model,
        "input": input_items,
        "store": False,
    }
    if tools:
        body["tools"] = tools
    req = urllib.request.Request(
        XAI_RESPONSES_URL,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        raise HTTPException(
            status_code=502,
            detail=f"xAI error {e.code}: {err_body[:400]}",
        ) from e
    except urllib.error.URLError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Could not reach xAI: {e.reason}",
        ) from e


def response_output_text(payload: Dict[str, Any]) -> str:
    direct = payload.get("output_text")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()
    chunks: List[str] = []
    for item in payload.get("output", []):
        if not isinstance(item, dict):
            continue
        for content in item.get("content", []):
            if isinstance(content, dict) and content.get("type") == "output_text":
                text = content.get("text")
                if isinstance(text, str) and text.strip():
                    chunks.append(text.strip())
    if not chunks:
        raise HTTPException(status_code=502, detail="Unexpected xAI response")
    return "\n".join(chunks)


def response_urls(value: Any) -> List[str]:
    urls: List[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            if key == "url" and isinstance(child, str) and child.startswith("http"):
                urls.append(child)
            else:
                urls.extend(response_urls(child))
    elif isinstance(value, list):
        for child in value:
            urls.extend(response_urls(child))
    return list(dict.fromkeys(urls))


def parse_json_object(text: str) -> Dict[str, Any]:
    clean = text.strip()
    clean = re.sub(r"^```(?:json)?\s*", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\s*```$", "", clean)
    try:
        value = json.loads(clean)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="xAI returned invalid meal JSON") from exc
    if not isinstance(value, dict):
        raise HTTPException(status_code=502, detail="xAI returned invalid meal data")
    return value


def nonnegative_number(value: Any) -> float:
    try:
        return max(0, float(value or 0))
    except (TypeError, ValueError):
        return 0


class SetKeyRequest(BaseModel):
    key: str


class ResearchRequest(BaseModel):
    question: str
    live_context: Optional[str] = None


class MealRequest(BaseModel):
    image: str


@app.get("/api/melani-ai/health")
def health() -> Dict[str, Any]:
    key = load_api_key()
    return {
        "ok": True,
        "has_key": bool(key),
        "model": DEFAULT_MODEL,
        "service": "melani-ai",
        "tier": "life-os",
        "research": bool(key),
        "vision": bool(key),
    }


@app.post("/api/melani-ai/set-key")
def set_key(req: SetKeyRequest) -> Dict[str, Any]:
    """Save xAI key on this machine (only localhost Mel UI uses this)."""
    raw = (req.key or "").strip().replace("\n", "").replace("\r", "")
    if not raw or len(raw) < 12:
        raise HTTPException(status_code=400, detail="key_too_short")
    try:
        KEY_FILE.parent.mkdir(parents=True, exist_ok=True)
        KEY_FILE.write_text(raw + "\n", encoding="utf-8")
        KEY_FILE.chmod(0o600)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"save_failed: {e}") from e
    return {"ok": True, "has_key": True, "path": str(KEY_FILE)}


@app.post("/api/melani-ai/chat")
def chat(req: ChatRequest) -> Dict[str, Any]:
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages required")

    system = SYSTEM_PROMPT
    if req.page_title or req.page_id:
        system += (
            f"\n\nRIGHT NOW she is looking at page "
            f"title={req.page_title or 'unknown'!r} id={req.page_id or 'unknown'!r}."
        )
    if req.live_context and req.live_context.strip():
        snap = req.live_context.strip()
        if len(snap) > 14000:
            snap = snap[:14000] + "\n...(truncated)"
        system += "\n\n" + snap
    if req.system_context and req.system_context.strip():
        extra = req.system_context.strip()
        if len(extra) > 8000:
            extra = extra[:8000] + "\n...(truncated)"
        system += "\n\nACTION CONTEXT\n" + extra

    history = [
        {"role": m.role, "content": m.content}
        for m in req.messages
        if m.role in ("user", "assistant") and m.content.strip()
    ][-24:]

    messages = [{"role": "system", "content": system}, *history]
    model = (req.model or DEFAULT_MODEL).strip()
    reply = call_xai(messages, model)
    return {"ok": True, "reply": reply, "model": model}


@app.post("/api/melani-ai/research")
def research(req: ResearchRequest) -> Dict[str, Any]:
    question = (req.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="question required")
    context = (req.live_context or "").strip()[:7000]
    prompt = (
        "Research this for Melani. Answer directly, distinguish verified facts from "
        "inference, include useful action criteria, and cite primary sources when possible. "
        "Do not diagnose. Do not claim you changed her app.\n\n"
        f"Question: {question}\n\nWonder context, use only when relevant:\n{context}"
    )
    payload = call_xai_responses(
        [{"role": "user", "content": prompt}],
        RESEARCH_MODEL,
        tools=[{"type": "web_search"}],
    )
    answer = strip_em_dashes(response_output_text(payload))
    urls = response_urls(payload)
    missing = [url for url in urls if url not in answer][:5]
    if missing:
        answer += "\n\nSources\n" + "\n".join(missing)
    return {"ok": True, "answer": answer, "model": RESEARCH_MODEL, "sources": urls[:12]}


@app.post("/api/melani-ai/meal")
def meal(req: MealRequest) -> Dict[str, Any]:
    image = (req.image or "").strip()
    if not re.match(r"^data:image/(?:png|jpeg|jpg);base64,", image, flags=re.IGNORECASE):
        raise HTTPException(status_code=400, detail="meal image required")
    if len(image) > 28_000_000:
        raise HTTPException(status_code=413, detail="image too large")
    prompt = (
        "Analyze this meal for a private food log. Identify only foods reasonably visible. "
        "Estimate portions and macros conservatively. Never claim image precision. "
        "Return only one JSON object with title, confidence (low, medium, or high), caveat, "
        "items, and totals. Each item must have name, portion, calories, protein_g, carbs_g, "
        "fat_g, and fiber_g. Totals must contain the same five numeric macro fields."
    )
    payload = call_xai_responses(
        [{
            "role": "user",
            "content": [
                {"type": "input_image", "image_url": image, "detail": "high"},
                {"type": "input_text", "text": prompt},
            ],
        }],
        VISION_MODEL,
    )
    data = parse_json_object(response_output_text(payload))
    raw_items = data.get("items") if isinstance(data.get("items"), list) else []
    items = []
    for raw in raw_items[:12]:
        if not isinstance(raw, dict):
            continue
        items.append({
            "name": str(raw.get("name") or "Food"),
            "portion": str(raw.get("portion") or "verify portion"),
            "calories": nonnegative_number(raw.get("calories")),
            "protein_g": nonnegative_number(raw.get("protein_g")),
            "carbs_g": nonnegative_number(raw.get("carbs_g")),
            "fat_g": nonnegative_number(raw.get("fat_g")),
            "fiber_g": nonnegative_number(raw.get("fiber_g")),
        })
    totals = data.get("totals") if isinstance(data.get("totals"), dict) else {}
    return {
        "title": str(data.get("title") or "Meal"),
        "confidence": data.get("confidence") if data.get("confidence") in ("low", "medium", "high") else "low",
        "caveat": str(data.get("caveat") or "Verify portions before logging."),
        "items": items,
        "totals": {
            "calories": nonnegative_number(totals.get("calories")),
            "protein_g": nonnegative_number(totals.get("protein_g")),
            "carbs_g": nonnegative_number(totals.get("carbs_g")),
            "fat_g": nonnegative_number(totals.get("fat_g")),
            "fiber_g": nonnegative_number(totals.get("fiber_g")),
        },
    }


if __name__ == "__main__":
    print(f"Melani AI bridge on http://127.0.0.1:{PORT}")
    print(f"Key loaded: {bool(load_api_key())} | model: {DEFAULT_MODEL} | life OS")
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")
