#!/usr/bin/env python3
"""
update_data.py: the nightly data update for the S7+ Central Asia Tracker.

Downloads the "Incidents - Global" tab of the S7 + CAT Monitor Google Sheet
as CSV, checks every row, and writes data/incidents.json for the website.
It runs every night from .github/workflows/nightly-data.yml, and can be run
by hand:

    python3 tools/update_data.py                     # download from the sheet
    python3 tools/update_data.py --csv export.csv    # use a downloaded CSV

Standard library only; nothing to install.

HOW IT PROTECTS THE SITE
------------------------
1. Row checks. Each row is checked on its own. A row with a problem (bad
   date, unknown sector, severity not 1-4, no actor ticked, no title, bad
   link, no Central Asian country...) is HELD BACK and the rest are
   published. Held rows are listed in data/update-report.json. This is
   expected and does not raise an alert.

2. Batch checks ("circuit breakers"). If anything suggests the whole
   download is wrong, NOTHING is written and the script exits with code 1:
     - the download fails or returns a web page instead of CSV
     - a required column header is missing or renamed
     - fewer than MIN_VALID_SHARE of the non-blank rows pass the row checks
     - the number of valid incidents drops by more than MAX_DROP compared
       with what the site currently shows
   The site keeps showing the last good data, and because the job fails,
   GitHub emails the repository owner.

3. Files are only replaced after every check has passed (written to a
   temporary file, then moved into place), so the site never sees a
   half-written file.
"""
import argparse
import csv
import datetime as dt
import io
import json
import os
import re
import sys
import urllib.request
from zoneinfo import ZoneInfo

# ----------------------------------------------------------------- settings

SHEET_ID = "1Kus7HDQq7yrkSglT-xStQC39lASdYbXSOFYwliWHT_Y"
SHEET_GID = "6486164"  # the "Incidents - Global" tab
CSV_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={SHEET_GID}"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_INCIDENTS = os.path.join(ROOT, "data", "incidents.json")
OUT_REPORT = os.path.join(ROOT, "data", "update-report.json")

TZ = ZoneInfo("America/New_York")

# Batch circuit breakers.
MIN_VALID_SHARE = 0.60   # at least 60% of non-blank rows must pass
MAX_DROP = 0.10          # valid incidents may not fall more than 10% vs the current site
MIN_PREVIOUS_FOR_DROP_CHECK = 50

# Values the site understands. Matching ignores case and extra spaces.
COUNTRIES = ["Kazakhstan", "Kyrgyzstan", "Tajikistan", "Turkmenistan", "Uzbekistan"]
SECTORS = ["Energy", "Water", "Education/Culture", "AI", "Transportation",
           "Agro and Industrial", "Finance/Business", "Defense"]
ACTORS = ["Russia", "China", "USA", "S7"]

# Column headers the script needs (matched ignoring case and spaces).
REQUIRED = {
    "date": "Date & Time", "type": "Type", "severity": "Severity", "location": "Location",
    "Russia": "Russia", "China": "China", "USA": "USA", "S7": "S7",
    "title": "Title", "description": "Description", "link": "Link",
}
OPTIONAL = {"hide": "Hide"}


class Abort(Exception):
    """A batch-level problem: publish nothing, keep yesterday's data."""


# ------------------------------------------------------------------ helpers

def squash(s):
    """Trim and collapse internal whitespace."""
    return re.sub(r"\s+", " ", (s or "").strip())


def key(s):
    """Comparison key: lower case, no spaces."""
    return re.sub(r"\s+", "", (s or "").lower())


COUNTRY_BY_KEY = {key(c): c for c in COUNTRIES}
SECTOR_BY_KEY = {key(s): s for s in SECTORS}


def split_list(cell):
    """Split a multi-select cell ("Kazakhstan, Uzbekistan") into items."""
    return [squash(x) for x in (cell or "").split(",") if squash(x)]


def parse_date(text, today):
    """M/D/YYYY (sheet format) or YYYY-MM-DD -> date. Raises ValueError with a reason."""
    t = squash(text)
    if not t:
        raise ValueError("date is empty")
    m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", t) or None
    try:
        if m:
            d = dt.date(int(m[3]), int(m[1]), int(m[2]))
        elif re.fullmatch(r"\d{4}-\d{2}-\d{2}", t):
            d = dt.date.fromisoformat(t)
        else:
            raise ValueError
    except ValueError:
        raise ValueError(f'date "{t}" is not a valid M/D/YYYY date')
    if d > today + dt.timedelta(days=1):
        raise ValueError(f'date "{t}" is in the future')
    if d.year < 2020:
        raise ValueError(f'date "{t}" is implausibly early')
    return d


def is_true(cell):
    return squash(cell).upper() == "TRUE"


# ------------------------------------------------------------- the checks

def read_csv(text):
    """Parse the CSV and map required headers to column positions."""
    if text.lstrip().startswith("<"):
        raise Abort("The sheet returned a web page instead of CSV. Is the sheet still shared so anyone with the link can view it?")
    rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        raise Abort("The download was empty.")
    header = [key(h) for h in rows[0]]
    cols = {}
    for name, label in {**REQUIRED, **OPTIONAL}.items():
        if key(label) in header:
            cols[name] = header.index(key(label))
        elif name in REQUIRED:
            raise Abort(f'Required column "{label}" is missing from the sheet\'s header row (was it renamed?).')
    return rows[1:], cols


def check_row(cells, cols, today):
    """Return (incident, problems, notes). incident is None if the row is held back."""
    get = lambda name: cells[cols[name]] if cols.get(name, 99999) < len(cells) else ""
    problems, notes = [], []

    try:
        date = parse_date(get("date"), today)
    except ValueError as e:
        problems.append(str(e)); date = None

    # Sectors: every listed sector must be one of the eight.
    types = []
    raw_types = split_list(get("type"))
    if not raw_types:
        problems.append("no sector (Type) chosen")
    for t in raw_types:
        if key(t) in SECTOR_BY_KEY:
            types.append(SECTOR_BY_KEY[key(t)])
        else:
            problems.append(f'unknown sector "{t}"')

    # Severity: a whole number 1-4.
    sev_text = squash(get("severity"))
    severity = None
    if re.fullmatch(r"[1-4](\.0+)?", sev_text):
        severity = int(float(sev_text))
    else:
        problems.append("severity is empty" if not sev_text else f'severity "{sev_text}" is not 1-4')

    # Locations: keep the Central Asian countries; other places are noted, not fatal.
    locations = []
    raw_locs = split_list(get("location"))
    for loc in raw_locs:
        if key(loc) in COUNTRY_BY_KEY:
            c = COUNTRY_BY_KEY[key(loc)]
            if c not in locations:
                locations.append(c)
        else:
            notes.append(f'location "{loc}" is not one of the five countries and was left out')
    if not locations:
        problems.append("no Central Asian country in Location" if raw_locs else "Location is empty")

    actors = [a for a in ACTORS if is_true(get(a))]
    if not actors:
        problems.append("no actor ticked (Russia, China, USA or S7)")

    title = squash(get("title"))
    if not title:
        problems.append("title is empty")
    description = squash(get("description"))
    if not description:
        notes.append("description is empty")

    link = squash(get("link"))
    if not re.fullmatch(r"https?://[^\s]+\.[^\s]+", link):
        problems.append("link is empty" if not link else "link is not a single web address")

    if problems:
        return None, problems, notes
    return {
        "date": date.isoformat(), "types": list(dict.fromkeys(types)), "severity": severity,
        "locations": locations, "actors": actors, "title": title,
        "description": description, "link": link,
    }, problems, notes


def build(text, previous_count, today):
    """Run every check. Returns (incidents, report) or raises Abort."""
    rows, cols = read_csv(text)
    incidents, held, noted, hidden = [], [], [], 0
    seen = {}
    nonblank = 0

    for i, cells in enumerate(rows, start=2):  # sheet row numbers (header is row 1)
        if not any(squash(c) for c in cells):
            continue
        nonblank += 1
        if "hide" in cols and cols["hide"] < len(cells) and is_true(cells[cols["hide"]]):
            hidden += 1
            continue
        inc, problems, notes = check_row(cells, cols, today)
        title = squash(cells[cols["title"]]) if cols["title"] < len(cells) else ""
        if inc:
            dup = (inc["date"], key(inc["title"]))
            if dup in seen:
                held.append({"row": i, "title": title, "problems": [f"duplicate of row {seen[dup]} (same date and title)"]})
                continue
            seen[dup] = i
            inc["row"] = i
            incidents.append(inc)
        else:
            held.append({"row": i, "title": title, "problems": problems})
        if notes:
            noted.append({"row": i, "title": title, "notes": notes})

    # ---- batch circuit breakers
    considered = nonblank - hidden
    if considered == 0:
        raise Abort("The sheet has no incident rows.")
    share = len(incidents) / considered
    if share < MIN_VALID_SHARE:
        raise Abort(f"Only {len(incidents)} of {considered} rows ({share:.0%}) passed the checks; at least {MIN_VALID_SHARE:.0%} must. Something may be wrong with the sheet's structure.")
    if previous_count >= MIN_PREVIOUS_FOR_DROP_CHECK and len(incidents) < previous_count * (1 - MAX_DROP):
        raise Abort(f"Valid incidents fell from {previous_count} to {len(incidents)} (more than {MAX_DROP:.0%}). Were rows deleted or filtered by mistake?")

    report = {
        "rowsInSheet": nonblank, "hidden": hidden, "published": len(incidents),
        "heldBack": held, "notes": noted,
    }
    return incidents, report


# ------------------------------------------------------------------- output

def write_json(path, obj):
    """Write atomically: temp file, then rename."""
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":") if path == OUT_INCIDENTS else None, indent=None if path == OUT_INCIDENTS else 2)
        f.write("\n")
    os.replace(tmp, path)


def previous_count():
    try:
        with open(OUT_INCIDENTS, encoding="utf-8") as f:
            return len(json.load(f).get("incidents", []))
    except (OSError, ValueError):
        return 0


def download(url):
    req = urllib.request.Request(url, headers={"User-Agent": "s7-central-asia-tracker-nightly-update"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read().decode("utf-8-sig")
    except Exception as e:  # network errors, HTTP errors
        raise Abort(f"Could not download the sheet: {e}")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--csv", help="read this CSV file instead of downloading")
    ap.add_argument("--url", default=CSV_URL, help="CSV export URL")
    ap.add_argument("--dry-run", action="store_true", help="check only; write nothing")
    args = ap.parse_args()

    now = dt.datetime.now(TZ)
    try:
        text = open(args.csv, encoding="utf-8-sig").read() if args.csv else download(args.url)
        incidents, report = build(text, previous_count(), now.date())
    except Abort as e:
        print(f"UPDATE STOPPED, site data left unchanged.\nReason: {e}", file=sys.stderr)
        return 1

    incidents.sort(key=lambda x: (x["date"], x["row"]))
    report = {"updatedAt": now.isoformat(timespec="minutes"), **report}
    print(f"OK: {report['published']} incidents published, {len(report['heldBack'])} held back, {report['hidden']} hidden.")
    for h in report["heldBack"]:
        print(f"  held  row {h['row']}: {'; '.join(h['problems'])}")
    if args.dry_run:
        return 0
    write_json(OUT_INCIDENTS, {"generated": now.date().isoformat(), "updatedAt": report["updatedAt"], "incidents": incidents})
    write_json(OUT_REPORT, report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
