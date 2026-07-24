#!/usr/bin/env python3
"""
Real personal Gmail bridge for the Wonder workspace.
Uses Gmail IMAP + optional SMTP with an App Password (Google Account security).
Stores credentials encrypted under ~/.melani_assistant/gmail/
"""

from __future__ import annotations

import base64
import email
import email.header
import email.utils
import imaplib
import json
import re
import ssl
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    from cryptography.fernet import Fernet
except ImportError:
    Fernet = None  # type: ignore

# ── paths ──
HOME = Path.home()
DATA_DIR = HOME / ".melani_assistant" / "gmail"
KEY_FILE = DATA_DIR / "token.key"
CREDS_FILE = DATA_DIR / "creds.enc"
IMAP_HOST = "imap.gmail.com"
SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587

app = FastAPI(title="Melani Gmail Bridge")
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


def _ensure_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def _fernet() -> Any:
    if Fernet is None:
        raise RuntimeError("cryptography package required")
    _ensure_dir()
    if KEY_FILE.exists():
        key = KEY_FILE.read_bytes()
    else:
        key = Fernet.generate_key()
        KEY_FILE.write_bytes(key)
        KEY_FILE.chmod(0o600)
    return Fernet(key)


def _save_creds(email_addr: str, app_password: str) -> None:
    f = _fernet()
    payload = json.dumps(
        {
            "email": email_addr.strip().lower(),
            "app_password": app_password.strip().replace(" ", ""),
            "saved_at": datetime.now().isoformat(timespec="seconds"),
        }
    )
    CREDS_FILE.write_bytes(f.encrypt(payload.encode()))
    CREDS_FILE.chmod(0o600)


def _load_creds() -> dict[str, str] | None:
    if not CREDS_FILE.exists():
        return None
    try:
        f = _fernet()
        raw = f.decrypt(CREDS_FILE.read_bytes()).decode()
        return json.loads(raw)
    except Exception:
        return None


def _clear_creds() -> None:
    if CREDS_FILE.exists():
        CREDS_FILE.unlink()


def _decode_header(val: str | None) -> str:
    if not val:
        return ""
    parts = email.header.decode_header(val)
    out: list[str] = []
    for text, enc in parts:
        if isinstance(text, bytes):
            out.append(text.decode(enc or "utf-8", errors="replace"))
        else:
            out.append(text)
    return "".join(out)


def _body_from_msg(msg: email.message.Message) -> str:
    """Prefer plain text; fall back to stripped HTML."""
    if msg.is_multipart():
        plain = ""
        html = ""
        for part in msg.walk():
            ctype = part.get_content_type()
            disp = str(part.get("Content-Disposition") or "")
            if "attachment" in disp:
                continue
            try:
                payload = part.get_payload(decode=True) or b""
                charset = part.get_content_charset() or "utf-8"
                text = payload.decode(charset, errors="replace")
            except Exception:
                continue
            if ctype == "text/plain" and not plain:
                plain = text
            elif ctype == "text/html" and not html:
                html = text
        if plain:
            return plain.strip()
        if html:
            # crude strip tags
            t = re.sub(r"(?is)<(script|style).*?>.*?</\1>", "", html)
            t = re.sub(r"(?s)<[^>]+>", " ", t)
            t = re.sub(r"\s+", " ", t)
            return t.strip()
        return ""
    try:
        payload = msg.get_payload(decode=True) or b""
        charset = msg.get_content_charset() or "utf-8"
        return payload.decode(charset, errors="replace").strip()
    except Exception:
        return str(msg.get_payload() or "")


def _imap_connect(creds: dict[str, str]) -> imaplib.IMAP4_SSL:
    ctx = ssl.create_default_context()
    mail = imaplib.IMAP4_SSL(IMAP_HOST, 993, ssl_context=ctx)
    mail.login(creds["email"], creds["app_password"])
    return mail


class ConnectBody(BaseModel):
    email: str
    app_password: str = Field(..., min_length=8)


class SendBody(BaseModel):
    to: str
    subject: str
    body: str


@app.get("/api/gmail/status")
def status() -> dict[str, Any]:
    creds = _load_creds()
    if not creds:
        return {"connected": False, "email": None}
    # quick live check
    try:
        mail = _imap_connect(creds)
        mail.select("INBOX", readonly=True)
        typ, data = mail.search(None, "ALL")
        count = len((data[0] or b"").split()) if typ == "OK" and data else 0
        mail.logout()
        return {
            "connected": True,
            "email": creds["email"],
            "inbox_count": count,
            "ok": True,
        }
    except imaplib.IMAP4.error as e:
        return {
            "connected": True,
            "email": creds["email"],
            "ok": False,
            "error": str(e),
        }
    except Exception as e:
        return {
            "connected": True,
            "email": creds["email"],
            "ok": False,
            "error": str(e),
        }


@app.post("/api/gmail/connect")
def connect(body: ConnectBody) -> dict[str, Any]:
    email_addr = body.email.strip().lower()
    password = body.app_password.strip().replace(" ", "")
    if "@" not in email_addr:
        raise HTTPException(400, "Enter a valid Gmail address")
    # Prove it works before saving
    try:
        mail = _imap_connect({"email": email_addr, "app_password": password})
        mail.select("INBOX", readonly=True)
        mail.logout()
    except imaplib.IMAP4.error as e:
        raise HTTPException(
            401,
            f"Gmail login failed: {e}. Use a 16-character App Password from Google Account → Security → App passwords (2-Step Verification must be on).",
        ) from e
    except Exception as e:
        raise HTTPException(500, f"Could not reach Gmail: {e}") from e
    _save_creds(email_addr, password)
    return {"connected": True, "email": email_addr, "ok": True}


@app.post("/api/gmail/disconnect")
def disconnect() -> dict[str, Any]:
    _clear_creds()
    return {"connected": False}


@app.get("/api/gmail/messages")
def messages(
    folder: str = "INBOX",
    max_results: int = 30,
    q: str = "",
) -> dict[str, Any]:
    """List recent messages. q is optional IMAP SEARCH free text."""
    creds = _load_creds()
    if not creds:
        raise HTTPException(401, "Gmail not connected")
    max_results = max(1, min(int(max_results), 50))
    try:
        mail = _imap_connect(creds)
        # folder names
        box = folder if folder.upper() != "SENT" else '"[Gmail]/Sent Mail"'
        if folder.upper() == "DRAFTS":
            box = '"[Gmail]/Drafts"'
        if folder.upper() == "TRASH":
            box = '"[Gmail]/Trash"'
        if folder.upper() == "STARRED":
            box = '"[Gmail]/Starred"'
        typ, _ = mail.select(box, readonly=True)
        if typ != "OK":
            mail.select("INBOX", readonly=True)
        if q.strip():
            # SEARCH TEXT
            typ, data = mail.search(None, "TEXT", q.strip())
        else:
            typ, data = mail.search(None, "ALL")
        if typ != "OK" or not data or not data[0]:
            mail.logout()
            return {"messages": [], "email": creds["email"]}
        ids = data[0].split()
        # newest first
        ids = list(reversed(ids))[:max_results]
        out: list[dict[str, Any]] = []
        for mid in ids:
            typ, msg_data = mail.fetch(mid, "(RFC822.HEADER FLAGS)")
            if typ != "OK" or not msg_data or not msg_data[0]:
                continue
            raw = msg_data[0]
            header_bytes = raw[1] if isinstance(raw, tuple) else raw
            if not isinstance(header_bytes, (bytes, bytearray)):
                continue
            msg = email.message_from_bytes(header_bytes)
            flags_blob = ""
            if isinstance(raw, tuple) and isinstance(raw[0], bytes):
                flags_blob = raw[0].decode(errors="replace")
            unread = "\\Seen" not in flags_blob
            out.append(
                {
                    "id": mid.decode() if isinstance(mid, bytes) else str(mid),
                    "subject": _decode_header(msg.get("Subject")) or "(no subject)",
                    "from": _decode_header(msg.get("From")),
                    "to": _decode_header(msg.get("To")),
                    "date": msg.get("Date") or "",
                    "unread": unread,
                }
            )
        mail.logout()
        return {"messages": out, "email": creds["email"], "folder": folder}
    except imaplib.IMAP4.error as e:
        raise HTTPException(401, f"Gmail error: {e}") from e
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.get("/api/gmail/message/{msg_id}")
def get_message(msg_id: str, folder: str = "INBOX") -> dict[str, Any]:
    creds = _load_creds()
    if not creds:
        raise HTTPException(401, "Gmail not connected")
    try:
        mail = _imap_connect(creds)
        box = "INBOX"
        if folder.upper() == "SENT":
            box = '"[Gmail]/Sent Mail"'
        mail.select(box, readonly=True)
        typ, msg_data = mail.fetch(msg_id.encode() if msg_id.isdigit() else msg_id, "(RFC822)")
        if typ != "OK" or not msg_data or not msg_data[0]:
            mail.logout()
            raise HTTPException(404, "Message not found")
        raw = msg_data[0]
        body_bytes = raw[1] if isinstance(raw, tuple) else raw
        if not isinstance(body_bytes, (bytes, bytearray)):
            mail.logout()
            raise HTTPException(500, "Bad message payload")
        msg = email.message_from_bytes(body_bytes)
        # mark seen
        try:
            mail.store(msg_id, "+FLAGS", "\\Seen")
        except Exception:
            pass
        mail.logout()
        return {
            "id": msg_id,
            "subject": _decode_header(msg.get("Subject")) or "(no subject)",
            "from": _decode_header(msg.get("From")),
            "to": _decode_header(msg.get("To")),
            "cc": _decode_header(msg.get("Cc")),
            "date": msg.get("Date") or "",
            "body": _body_from_msg(msg),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.post("/api/gmail/send")
def send_mail(body: SendBody) -> dict[str, Any]:
    """Send via SMTP using the same App Password."""
    import smtplib

    creds = _load_creds()
    if not creds:
        raise HTTPException(401, "Gmail not connected")
    try:
        mime = MIMEMultipart()
        mime["From"] = creds["email"]
        mime["To"] = body.to
        mime["Subject"] = body.subject
        mime.attach(MIMEText(body.body, "plain", "utf-8"))
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as smtp:
            smtp.starttls(context=ssl.create_default_context())
            smtp.login(creds["email"], creds["app_password"])
            smtp.sendmail(creds["email"], [body.to], mime.as_string())
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, f"Send failed: {e}") from e


@app.get("/api/gmail/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    _ensure_dir()
    print("Gmail bridge → http://127.0.0.1:8790")
    uvicorn.run(app, host="127.0.0.1", port=8790, log_level="info")
