#!/usr/bin/env python3
"""
Wonder · Mac screen time + disk — local only, your machine, your data.

Reads Apple's knowledgeC.db (CoreDuet / usage knowledge) on this Mac.
This is THIS MACBOOK's app focus time — not a perfect clone of iPhone
Settings → Screen Time (unless Apple mirrored some sessions here).

Usage:
  python3 scripts/screentime.py              # today
  python3 scripts/screentime.py --watch      # live terminal dashboard
  python3 scripts/screentime.py --days 7     # last 7 days
  python3 scripts/screentime.py --json       # machine-readable
  python3 scripts/screentime.py --disk       # Mac storage only
  python3 scripts/screentime.py --save       # snapshot → ~/.wonder/screentime/

No iPhone Settings. No OpenClaw. Optional: plug iPhone into Finder for phone storage.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import time
from collections import defaultdict
from pathlib import Path

APPLE_EPOCH = dt.datetime(2001, 1, 1)
KNOWLEDGE_DB = Path.home() / "Library/Application Support/Knowledge/knowledgeC.db"
SNAPSHOT_DIR = Path.home() / ".wonder" / "screentime"

# Friendly labels for common bundle ids
APP_NAMES = {
    "com.apple.Safari": "Safari",
    "com.apple.Terminal": "Terminal",
    "com.apple.MobileSMS": "Messages",
    "com.apple.mail": "Mail",
    "com.apple.finder": "Finder",
    "com.apple.FaceTime": "FaceTime",
    "com.apple.iBooksX": "Books",
    "com.apple.iWork.Numbers": "Numbers",
    "com.apple.iWork.Pages": "Pages",
    "com.apple.iWork.Keynote": "Keynote",
    "com.anthropic.claudefordesktop": "Claude",
    "com.spotify.client": "Spotify",
    "com.spotify.studio": "Spotify Studio",
    "com.todoist.mac.Todoist": "Todoist",
    "com.microsoft.edgemac": "Edge",
    "com.electron.wispr-flow": "Wispr",
    "com.todesktop.230313mzl4w4u92": "Cursor",
    "com.openai.chat": "ChatGPT",
    "com.hnc.Discord": "Discord",
    "com.tinyspeck.slackmacgap": "Slack",
    "com.figma.Desktop": "Figma",
    "com.google.Chrome": "Chrome",
    "company.thebrowser.Browser": "Arc",
    "com.apple.dt.Xcode": "Xcode",
    "com.apple.Notes": "Notes",
    "com.apple.Music": "Music",
    "com.apple.TV": "TV",
    "com.apple.systempreferences": "System Settings",
    "com.apple.ActivityMonitor": "Activity Monitor",
}


def apple_ts(when: dt.datetime) -> float:
    return (when - APPLE_EPOCH).total_seconds()


def fmt_dur(seconds: float) -> str:
    sec = max(0, int(seconds))
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}h {m:02d}m"
    if m:
        return f"{m}m {s:02d}s"
    return f"{s}s"


def app_label(bundle: str) -> str:
    if bundle in APP_NAMES:
        return APP_NAMES[bundle]
    # com.foo.Bar → Bar
    tail = bundle.rsplit(".", 1)[-1]
    return tail if tail else bundle


def day_bounds(day: dt.date) -> tuple[float, float]:
    start = dt.datetime.combine(day, dt.time.min)
    end = start + dt.timedelta(days=1)
    return apple_ts(start), apple_ts(end)


def open_db() -> sqlite3.Connection:
    if not KNOWLEDGE_DB.is_file():
        raise SystemExit(
            f"knowledgeC.db not found at:\n  {KNOWLEDGE_DB}\n"
            "Screen Time / usage knowledge may be off, or Full Disk Access is required."
        )
    # immutable=1 avoids lock fights with the system writer
    uri = f"file:{KNOWLEDGE_DB}?mode=ro&immutable=1"
    try:
        conn = sqlite3.connect(uri, uri=True)
    except sqlite3.OperationalError:
        conn = sqlite3.connect(str(KNOWLEDGE_DB))
    conn.row_factory = sqlite3.Row
    return conn


def usage_for_day(conn: sqlite3.Connection, day: dt.date) -> dict:
    day_start, day_end = day_bounds(day)
    rows = conn.execute(
        """
        SELECT ZVALUESTRING AS app, ZSTARTDATE AS start, ZENDDATE AS end
        FROM ZOBJECT
        WHERE ZSTREAMNAME = '/app/usage'
          AND ZVALUESTRING IS NOT NULL
          AND ZENDDATE >= ?
          AND ZSTARTDATE < ?
        """,
        (day_start, day_end),
    ).fetchall()

    by_app: dict[str, float] = defaultdict(float)
    total = 0.0
    intervals = 0
    for r in rows:
        start, end = r["start"], r["end"]
        if start is None or end is None:
            continue
        s = max(float(start), day_start)
        e = min(float(end), day_end)
        if e <= s:
            continue
        dur = e - s
        by_app[r["app"]] += dur
        total += dur
        intervals += 1

    ranked = sorted(by_app.items(), key=lambda x: -x[1])
    return {
        "date": day.isoformat(),
        "total_seconds": round(total, 1),
        "total_human": fmt_dur(total),
        "intervals": intervals,
        "apps": [
            {
                "bundle": b,
                "name": app_label(b),
                "seconds": round(sec, 1),
                "human": fmt_dur(sec),
                "share": round(100 * sec / total, 1) if total else 0,
            }
            for b, sec in ranked
        ],
        "source": "macOS knowledgeC.db /app/usage",
        "machine": os.uname().nodename,
    }


def mac_disk() -> dict:
    """This MacBook's volume free/used — not iPhone storage."""
    usage = shutil.disk_usage("/")
    # df for mount name
    try:
        df = subprocess.check_output(["df", "-h", "/"], text=True).strip().splitlines()
        df_line = df[1] if len(df) > 1 else ""
    except Exception:
        df_line = ""
    return {
        "path": "/",
        "total_bytes": usage.total,
        "used_bytes": usage.used,
        "free_bytes": usage.free,
        "used_human": _bytes(usage.used),
        "free_human": _bytes(usage.free),
        "total_human": _bytes(usage.total),
        "used_pct": round(100 * usage.used / usage.total, 1) if usage.total else 0,
        "df": df_line,
        "note": "This is THIS Mac's disk. iPhone storage only via cable + Finder (or libimobiledevice).",
    }


def _bytes(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024:
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024  # type: ignore
    return f"{n:.1f} PB"


def iphone_hint() -> str:
    """Best-effort: is an iPhone on USB? Storage still needs Finder trust."""
    try:
        out = subprocess.check_output(
            ["system_profiler", "SPUSBDataType", "-json"],
            text=True,
            stderr=subprocess.DEVNULL,
            timeout=12,
        )
        data = json.loads(out)
    except Exception:
        return "No USB probe (or no devices). Plug iPhone in + trust this Mac → open Finder sidebar for storage."

    found = []

    def walk(node):
        if isinstance(node, dict):
            name = str(node.get("_name", "") or node.get("name", ""))
            if "iphone" in name.lower() or "ipad" in name.lower():
                found.append(name)
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for x in node:
                walk(x)

    walk(data)
    if found:
        return (
            f"USB sees: {', '.join(found)}. "
            "Apple does not expose iPhone free space to a simple CLI without extra tools. "
            "Open Finder → select iPhone → General for capacity, or install libimobiledevice."
        )
    return (
        "No iPhone on USB right now. "
        "To check phone storage from the Mac: plug in cable → unlock phone → Trust → Finder → iPhone."
    )


def print_report(day_data: dict, disk: dict | None, top: int, phone_note: bool) -> None:
    print()
    print("╭──────────────────────────────────────────────╮")
    print("│  Wonder · Mac screen time (local knowledgeC) │")
    print("╰──────────────────────────────────────────────╯")
    print(f"  Day     {day_data['date']}")
    print(f"  Total   {day_data['total_human']}  ({day_data['intervals']} intervals)")
    print(f"  Host    {day_data['machine']}")
    print()
    print("  Top apps")
    print("  ────────")
    for i, app in enumerate(day_data["apps"][:top], 1):
        bar_n = int(round(app["share"] / 5))  # 20 chars max-ish at 100%
        bar = "█" * min(bar_n, 20)
        print(f"  {i:2}. {app['human']:>8}  {bar:<12} {app['share']:5.1f}%  {app['name']}")
    if not day_data["apps"]:
        print("  (no /app/usage rows yet for this day)")
    if disk:
        print()
        print("  Mac disk  /")
        print("  ────────────")
        print(f"  Free  {disk['free_human']}   Used  {disk['used_human']} / {disk['total_human']}  ({disk['used_pct']}%)")
    if phone_note:
        print()
        print("  iPhone storage")
        print("  ──────────────")
        print(f"  {iphone_hint()}")
    print()
    print("  Note: Mac app usage ≠ iPhone Settings → Screen Time.")
    print("  Snapshot dir:", SNAPSHOT_DIR)
    print()


def save_snapshot(day_data: dict, disk: dict | None) -> Path:
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    path = SNAPSHOT_DIR / f"{day_data['date']}.json"
    payload = {
        "saved_at": dt.datetime.now().isoformat(timespec="seconds"),
        "screen": day_data,
        "disk": disk,
    }
    # Merge history of same-day saves under "history" tail
    history = []
    if path.exists():
        try:
            old = json.loads(path.read_text())
            history = old.get("history") or []
            if old.get("screen"):
                history.append(
                    {
                        "saved_at": old.get("saved_at"),
                        "total_seconds": old["screen"].get("total_seconds"),
                    }
                )
            history = history[-48:]  # keep last 48 points that day
        except Exception:
            pass
    payload["history"] = history
    path.write_text(json.dumps(payload, indent=2))
    # also write "latest.json" for watchers / Wonder import later
    (SNAPSHOT_DIR / "latest.json").write_text(json.dumps(payload, indent=2))
    return path


def multi_day(conn: sqlite3.Connection, days: int) -> list[dict]:
    today = dt.date.today()
    out = []
    for i in range(days - 1, -1, -1):
        d = today - dt.timedelta(days=i)
        out.append(usage_for_day(conn, d))
    return out


def device_map(conn: sqlite3.Connection) -> dict[str, str]:
    out: dict[str, str] = {}
    try:
        for r in conn.execute(
            "SELECT ZDEVICEID, ZMODEL FROM ZSYNCPEER WHERE ZDEVICEID IS NOT NULL"
        ):
            dev, model = r[0], r[1]
            if not dev:
                continue
            if model and "iPhone" in str(model):
                out[dev] = f"iPhone ({model})"
            elif model and "iPad" in str(model):
                out[dev] = f"iPad ({model})"
            elif model:
                out[dev] = str(model)
            else:
                out[dev] = "Unknown device"
    except Exception:
        pass
    return out


def websites_for_range(conn: sqlite3.Connection, days: int, min_seconds: float = 3600) -> list[dict]:
    """Safari (and other webUsage) domains over the last N days. Default: only ≥1h."""
    today = dt.date.today()
    start_day = today - dt.timedelta(days=days - 1)
    day_start, _ = day_bounds(start_day)
    _, day_end = day_bounds(today)

    rows = conn.execute(
        """
        SELECT
          COALESCE(m.Z_DKDIGITALHEALTHMETADATAKEY__WEBDOMAIN, '') AS domain,
          o.ZSTARTDATE AS start,
          o.ZENDDATE AS end
        FROM ZOBJECT o
        LEFT JOIN ZSTRUCTUREDMETADATA m ON o.ZSTRUCTUREDMETADATA = m.Z_PK
        WHERE o.ZSTREAMNAME = '/app/webUsage'
          AND o.ZENDDATE >= ?
          AND o.ZSTARTDATE < ?
          AND m.Z_DKDIGITALHEALTHMETADATAKEY__WEBDOMAIN IS NOT NULL
          AND m.Z_DKDIGITALHEALTHMETADATAKEY__WEBDOMAIN != ''
        """,
        (day_start, day_end),
    ).fetchall()

    by_domain: dict[str, float] = defaultdict(float)
    for r in rows:
        start, end = r["start"], r["end"]
        if start is None or end is None:
            continue
        s = max(float(start), day_start)
        e = min(float(end), day_end)
        if e <= s:
            continue
        domain = str(r["domain"]).strip().lower()
        # strip www.
        if domain.startswith("www."):
            domain = domain[4:]
        by_domain[domain] += e - s

    ranked = sorted(by_domain.items(), key=lambda x: -x[1])
    total = sum(by_domain.values()) or 1
    out = []
    for domain, sec in ranked:
        if sec < min_seconds:
            continue
        out.append(
            {
                "domain": domain,
                "seconds": round(sec, 1),
                "human": fmt_dur(sec),
                "hours": round(sec / 3600, 2),
                "share": round(100 * sec / total, 1),
            }
        )
    return out


def export_range(conn: sqlite3.Connection, days: int) -> dict:
    """Multi-day export for Wonder UI. Apps only if ≥1 hour. Safari sites included."""
    today = dt.date.today()
    MIN_APP = 3600.0  # 1 hour — ignore noise
    days_out: list[dict] = []
    all_apps: dict[str, float] = defaultdict(float)
    series_mac: list[dict] = []
    series_phone: list[dict] = []

    for i in range(days - 1, -1, -1):
        day = today - dt.timedelta(days=i)
        d = usage_for_day(conn, day)
        d["device"] = "mac"
        d["device_label"] = "Mac"
        for a in d["apps"]:
            all_apps[a["bundle"]] += a["seconds"]
        # drop sub-hour apps from per-day lists
        d["apps"] = [a for a in d["apps"] if a["seconds"] >= MIN_APP]
        days_out.append(d)
        series_mac.append(
            {
                "date": d["date"],
                "seconds": d["total_seconds"],
                "hours": round(d["total_seconds"] / 3600, 2),
            }
        )
        series_phone.append({"date": d["date"], "seconds": 0, "hours": 0})

    ranked = sorted(all_apps.items(), key=lambda x: -x[1])
    total_all = sum(v for _, v in ranked if v >= MIN_APP) or 1
    apps_all = []
    for b, sec in ranked:
        if sec < MIN_APP:
            continue
        apps_all.append(
            {
                "bundle": b,
                "name": app_label(b),
                "seconds": round(sec, 1),
                "human": fmt_dur(sec),
                "hours": round(sec / 3600, 2),
                "share": round(100 * sec / total_all, 2),
                "device": "mac",
                "is_safari": b == "com.apple.Safari",
            }
        )

    websites = websites_for_range(conn, days, min_seconds=0)
    # Scale site segments to Safari wall time so totals don't exceed Safari
    # (CoreDuet web intervals often overlap / double-count).
    safari_sec = float(all_apps.get("com.apple.Safari", 0) or 0)
    web_raw = sum(w["seconds"] for w in websites) or 0
    if websites and safari_sec > 0 and web_raw > 0:
        scale = safari_sec / web_raw
        for w in websites:
            w["seconds"] = round(w["seconds"] * scale, 1)
            w["human"] = fmt_dur(w["seconds"])
            w["hours"] = round(w["seconds"] / 3600, 2)
        web_sum = sum(w["seconds"] for w in websites) or 1
        for w in websites:
            w["share"] = round(100 * w["seconds"] / web_sum, 1)
        websites = [w for w in websites if w["seconds"] >= MIN_APP]
        websites.sort(key=lambda w: -w["seconds"])
    else:
        websites = [w for w in websites if w["seconds"] >= MIN_APP]

    disk = mac_disk()
    phone_storage = iphone_storage_probe()

    return {
        "ok": True,
        "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        "days_requested": days,
        "min_seconds": MIN_APP,
        "source": "macOS knowledgeC.db",
        "series": {
            "mac_hours": series_mac,
            "phone_hours": series_phone,
            "combined_hours": [
                {"date": m["date"], "seconds": m["seconds"], "hours": m["hours"]}
                for m in series_mac
            ],
        },
        "days": days_out,
        "apps_all": apps_all,
        "websites": websites,
        "totals": {
            "mac_seconds": round(sum(a["seconds"] for a in apps_all), 1),
            "mac_human": fmt_dur(sum(a["seconds"] for a in apps_all)),
            "phone_seconds": 0,
            "phone_human": "0m",
            "combined_seconds": round(sum(a["seconds"] for a in apps_all), 1),
            "combined_human": fmt_dur(sum(a["seconds"] for a in apps_all)),
        },
        "disk": disk,
        "iphone_storage": phone_storage,
        "storage": {
            "mac": disk,
            "iphone": phone_storage,
            "mac_available": True,
            "iphone_available": bool(phone_storage.get("connected")),
        },
    }


def iphone_storage_probe() -> dict:
    """
    Best-effort iPhone storage from this Mac.
    Full free/used needs cable + trust; without libimobiledevice Apple hides capacity.
    """
    hint = iphone_hint()
    connected = "USB sees:" in hint or "iPhone" in hint and "No iPhone" not in hint
    result = {
        "connected": connected,
        "free_human": None,
        "total_human": None,
        "detail": hint,
        "source": "usb-probe",
    }
    # Try system_profiler for Serial / capacity fields (often missing free space)
    try:
        out = subprocess.check_output(
            ["system_profiler", "SPUSBDataType", "-json"],
            text=True,
            stderr=subprocess.DEVNULL,
            timeout=12,
        )
        data = json.loads(out)

        def walk(node, acc):
            if isinstance(node, dict):
                name = str(node.get("_name", "") or "")
                if "iphone" in name.lower():
                    acc.append(node)
                for v in node.values():
                    walk(v, acc)
            elif isinstance(node, list):
                for x in node:
                    walk(x, acc)

        phones = []
        walk(data, phones)
        if phones:
            result["connected"] = True
            p0 = phones[0]
            result["name"] = p0.get("_name")
            # Apple rarely exposes free bytes here; surface whatever exists
            for k, v in p0.items():
                lk = str(k).lower()
                if "capacity" in lk or "size" in lk or "storage" in lk:
                    result[k] = v
            result["detail"] = (
                f"iPhone on USB: {result.get('name', 'iPhone')}. "
                "Free space is not exposed to scripts without Finder / libimobiledevice. "
                "Plug in → unlock → Trust → Finder → select iPhone → General for capacity."
            )
    except Exception as e:
        result["detail"] = f"{hint} ({e})"
    return result


def main() -> None:
    p = argparse.ArgumentParser(description="Mac screen time from knowledgeC + disk (local)")
    p.add_argument("--watch", "-w", action="store_true", help="Live refresh in terminal")
    p.add_argument("--interval", "-i", type=int, default=15, help="Watch refresh seconds (default 15)")
    p.add_argument("--days", "-d", type=int, default=1, help="How many days to show (default 1 = today)")
    p.add_argument("--top", "-t", type=int, default=12, help="Top N apps")
    p.add_argument("--json", action="store_true", help="JSON out (no pretty UI)")
    p.add_argument("--save", action="store_true", help=f"Write snapshot under {SNAPSHOT_DIR}")
    p.add_argument("--disk", action="store_true", help="Include Mac disk free/used")
    p.add_argument("--phone", action="store_true", help="Probe USB for iPhone + storage hint")
    p.add_argument("--date", type=str, default="", help="YYYY-MM-DD (default today)")
    p.add_argument(
        "--export",
        action="store_true",
        help="Full multi-day export (every app + series) as JSON — for Wonder UI",
    )
    args = p.parse_args()

    if args.export:
        conn = open_db()
        try:
            # --export with default --days 1 means “full board” (30d);
            # explicit --days N (from API or CLI) is honored as-is.
            export_days = args.days if args.days != 1 or "--days" in sys.argv else 30
            payload = export_range(conn, max(1, min(export_days, 120)))
        finally:
            conn.close()
        SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
        out = SNAPSHOT_DIR / "export.json"
        out.write_text(json.dumps(payload, indent=2))
        (SNAPSHOT_DIR / "latest.json").write_text(json.dumps(payload, indent=2))
        if args.json or True:
            print(json.dumps(payload))
        return

    def once() -> dict:
        conn = open_db()
        try:
            if args.date:
                day = dt.date.fromisoformat(args.date)
                days_data = [usage_for_day(conn, day)]
            elif args.days > 1:
                days_data = multi_day(conn, args.days)
            else:
                days_data = [usage_for_day(conn, dt.date.today())]
        finally:
            conn.close()

        disk = mac_disk() if (args.disk or args.watch or args.save) else None
        if args.days > 1 and not args.date:
            payload = {"days": days_data, "disk": disk}
        else:
            payload = {"screen": days_data[0], "disk": disk}

        if args.save:
            # save each day or latest day
            for d in days_data:
                save_snapshot(d, disk)

        return payload

    if args.watch:
        try:
            while True:
                # clear screen
                sys.stdout.write("\033[2J\033[H")
                payload = once()
                if "days" in payload:
                    for d in payload["days"]:
                        print_report(d, None, args.top, False)
                    if payload.get("disk"):
                        print(f"  Mac free: {payload['disk']['free_human']}  used {payload['disk']['used_pct']}%")
                    print(iphone_hint() if args.phone else "")
                else:
                    print_report(
                        payload["screen"],
                        payload.get("disk"),
                        args.top,
                        phone_note=args.phone or True,
                    )
                print(f"  live · every {args.interval}s · Ctrl+C to stop · snapshots: {SNAPSHOT_DIR}")
                if args.save:
                    print("  (auto-saving each tick)")
                time.sleep(max(3, args.interval))
        except KeyboardInterrupt:
            print("\nstopped.")
            return

    payload = once()
    if args.json:
        print(json.dumps(payload, indent=2))
        return

    if "days" in payload:
        for d in payload["days"]:
            print_report(d, None, args.top, False)
            print("  " + "─" * 40)
        if payload.get("disk"):
            disk = payload["disk"]
            print(f"  Mac disk free {disk['free_human']} · used {disk['used_pct']}% of {disk['total_human']}")
        if args.phone:
            print(f"  {iphone_hint()}")
        print()
    else:
        print_report(
            payload["screen"],
            payload.get("disk") if args.disk else (mac_disk() if args.save else None),
            args.top,
            phone_note=args.phone,
        )
        if args.save:
            path = SNAPSHOT_DIR / f"{payload['screen']['date']}.json"
            print(f"  Saved → {path}")
            print(f"  Latest → {SNAPSHOT_DIR / 'latest.json'}")
            print()


if __name__ == "__main__":
    main()
