#!/usr/bin/env python3
"""Build Wonder's complete, page-addressable IRS Publication 17 corpus."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT / "public" / "knowledge" / "irs" / "p17-2025.pdf"
OUT_PATH = ROOT / "public" / "knowledge" / "irs" / "p17-2025-corpus.json"
SOURCE_URL = "https://www.irs.gov/pub/irs-prior/p17--2025.pdf"
EXPECTED_PAGES = 142
EXPECTED_SHA256 = "2d2381d62c7c77ed4b64b83ac23c28ed85b7c8304eb580c09bd9fd660be0840b"
CHUNK_TARGET = 1800
CHUNK_OVERLAP = 240


def normalize_text(raw: str) -> str:
    text = raw.replace("\x00", "").replace("\u00ad", "")
    text = re.sub(r"(?<=[a-z])-\n(?=[a-z])", "", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def page_chunks(text: str) -> list[str]:
    if len(text) <= CHUNK_TARGET:
        return [text] if text else []
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(len(text), start + CHUNK_TARGET)
        if end < len(text):
            split = max(
                text.rfind("\n\n", start + CHUNK_TARGET // 2, end),
                text.rfind(". ", start + CHUNK_TARGET // 2, end),
            )
            if split > start:
                end = split + 1
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = max(start + 1, end - CHUNK_OVERLAP)
    return chunks


def main() -> None:
    pdf_bytes = PDF_PATH.read_bytes()
    digest = hashlib.sha256(pdf_bytes).hexdigest()
    if digest != EXPECTED_SHA256:
        raise SystemExit(f"Unexpected Publication 17 SHA-256: {digest}")

    reader = PdfReader(PDF_PATH)
    if len(reader.pages) != EXPECTED_PAGES:
        raise SystemExit(f"Expected {EXPECTED_PAGES} pages, found {len(reader.pages)}")

    pages = []
    chunks = []
    empty_pages = []
    for index, page in enumerate(reader.pages):
        pdf_page = index + 1
        printed_page = pdf_page - 2 if pdf_page >= 3 else None
        text = normalize_text(page.extract_text() or "")
        if not text:
            empty_pages.append(pdf_page)
        pages.append(
            {
                "pdfPage": pdf_page,
                "printedPage": printed_page,
                "text": text,
            }
        )
        for chunk_index, chunk_text in enumerate(page_chunks(text), start=1):
            chunks.append(
                {
                    "id": f"p17-2025-p{pdf_page}-c{chunk_index}",
                    "pdfPage": pdf_page,
                    "printedPage": printed_page,
                    "text": chunk_text,
                }
            )

    if empty_pages:
        raise SystemExit(f"Text extraction failed for PDF pages: {empty_pages}")

    corpus = {
        "schemaVersion": 1,
        "publication": "IRS Publication 17 (2025), Your Federal Income Tax",
        "taxYear": 2025,
        "published": "2026-01-13",
        "sourceUrl": SOURCE_URL,
        "localPdf": "/knowledge/irs/p17-2025.pdf",
        "sha256": digest,
        "pageCount": len(pages),
        "printedPageCount": 140,
        "chunkCount": len(chunks),
        "pages": pages,
        "chunks": chunks,
    }
    OUT_PATH.write_text(
        json.dumps(corpus, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(
        f"Wrote {OUT_PATH.relative_to(ROOT)}: "
        f"{len(pages)} pages, {len(chunks)} chunks, {OUT_PATH.stat().st_size} bytes"
    )


if __name__ == "__main__":
    main()
