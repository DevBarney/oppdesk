#!/usr/bin/env python3
"""OppDesk snapshot builder.

RULES (do not change without user request):
- Primary link is official application_url only.
- NEVER include opportunitydesk.org article URLs in export columns.
- CSV columns: id, title, application_url, date, excerpt, img, categories, tags, section, slug
"""

import requests, csv, re, html, time
from pathlib import Path

HEADERS = {"User-Agent": "Mozilla/5.0"}
BASE = "https://opportunitydesk.org/wp-json/wp/v2/posts"
SECTIONS = [
    (6, "Scholarships"), (24, "Fellowships"), (30, "Grants"), (10, "Conferences"),
    (161, "Internships"), (105, "Volunteering"), (50434, "Short Courses"), (11218, "Online Courses"),
]
OUT = Path(__file__).resolve().parent / "oppdesk_snapshot.csv"
FIELDS = ["id", "title", "application_url", "date", "excerpt", "img", "categories", "tags", "section", "slug"]

def strip_html(s):
    s = re.sub(r"<[^>]+>", " ", s or "")
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()

def thumb(p):
    fm = (p.get("_embedded") or {}).get("wp:featuredmedia") or []
    if not fm:
        return ""
    m = fm[0]
    sizes = (m.get("media_details") or {}).get("sizes") or {}
    for s in ("medium", "thumbnail"):
        if s in sizes and sizes[s].get("source_url"):
            return sizes[s]["source_url"]
    return m.get("source_url") or ""

def terms(p):
    cats, tags = [], []
    for group in (p.get("_embedded") or {}).get("wp:term") or []:
        for t in group or []:
            if t.get("taxonomy") == "category" and t.get("name"):
                cats.append(t["name"])
            if t.get("taxonomy") == "post_tag" and t.get("name"):
                tags.append(t["name"])
    return cats[:6], tags[:6]

def extract_apply_url(content_html):
    """Official application page only. Prefer external apply links."""
    content = content_html or ""
    anchors = re.findall(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', content, flags=re.I | re.S)
    click_apply_ext, click_apply_od = [], []
    apply_text_ext, apply_href_ext = [], []
    other_ext = []
    for href, inner in anchors:
        href = href.strip()
        if not href.startswith("http"):
            continue
        text = strip_html(inner).lower()
        is_od = "opportunitydesk.org" in href.lower()
        click_apply = bool(re.search(r"click here to apply|apply now|apply here", text))
        apply_text = bool(re.search(r"\b(apply|application|register)\b", text))
        apply_href = bool(re.search(r"apply|application|register|admission", href, re.I))
        if click_apply:
            (click_apply_od if is_od else click_apply_ext).append(href)
        elif apply_text and not is_od:
            apply_text_ext.append(href)
        elif apply_href and not is_od:
            apply_href_ext.append(href)
        elif not is_od:
            other_ext.append(href)
    for bucket in (click_apply_ext, apply_text_ext, apply_href_ext, other_ext):
        if bucket:
            return bucket[0]
    # Intentionally do NOT fall back to opportunitydesk.org article URLs
    return ""

def main():
    rows = []
    for cid, name in SECTIONS:
        r = requests.get(
            BASE,
            params={"categories": cid, "per_page": 30, "page": 1, "_embed": "1"},
            headers=HEADERS,
            timeout=60,
        )
        r.raise_for_status()
        for p in r.json():
            content = (p.get("content") or {}).get("rendered", "")
            apply_url = extract_apply_url(content)
            cats, tags = terms(p)
            rows.append({
                "id": p.get("id"),
                "title": strip_html((p.get("title") or {}).get("rendered", "")),
                "application_url": apply_url,
                "date": (p.get("date") or "")[:10],
                "excerpt": strip_html((p.get("excerpt") or {}).get("rendered", ""))[:200],
                "img": thumb(p),
                "categories": "; ".join(cats),
                "tags": "; ".join(tags),
                "section": name,
                "slug": p.get("slug") or "",
            })
        print(name, "ok")
        time.sleep(0.12)

    rows.sort(key=lambda x: x.get("date") or "", reverse=True)
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    ext = sum(1 for r in rows if r["application_url"])
    print(f"saved {OUT} rows={len(rows)} with_application_url={ext}")

if __name__ == "__main__":
    main()
