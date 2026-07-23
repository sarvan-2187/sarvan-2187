import base64
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

USERNAME = "sarvan-2187"

with open(os.path.join(os.path.dirname(__file__), "ascii_final.txt"), encoding="utf-8") as f:
    ASCII_LINES = f.read().split("\n")

COLS = len(ASCII_LINES[0])
ROWS = len(ASCII_LINES)


def gh_get(path):
    req = urllib.request.Request(f"https://api.github.com{path}")
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "sarvan-2187-profile-readme")
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def fetch_github_stats():
    user = gh_get(f"/users/{USERNAME}")
    repos = []
    page = 1
    while True:
        batch = gh_get(f"/users/{USERNAME}/repos?per_page=100&page={page}&type=owner")
        if not batch:
            break
        repos.extend(batch)
        if len(batch) < 100:
            break
        page += 1

    stars = sum(r.get("stargazers_count", 0) for r in repos)
    created = datetime.strptime(user["created_at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    years = (datetime.now(timezone.utc) - created).days / 365
    return {
        "repos": user.get("public_repos", len(repos)),
        "stars": stars,
        "followers": user.get("followers", 0),
        "years": f"{years:.1f}",
    }


def fetch_wakatime_stats():
    api_key = os.environ.get("WAKATIME_API_KEY")
    if not api_key:
        return None
    try:
        req = urllib.request.Request(
            "https://wakatime.com/api/v1/users/current/stats/last_7_days"
        )
        token = base64.b64encode(f"{api_key}:".encode()).decode()
        req.add_header("Authorization", f"Basic {token}")
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
        total = data["data"]["human_readable_total"]
        langs = data["data"].get("languages", [])
        top_lang = langs[0]["name"] if langs else "n/a"
        return {"total_7d": total, "top_lang": top_lang}
    except Exception as e:
        print("wakatime fetch failed:", e, file=sys.stderr)
        return None


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


MONO = "'JetBrains Mono',ui-monospace,SFMono-Regular,Consolas,Menlo,monospace"


def build_svg(stats, waka, theme):
    dark = theme == "dark"
    bg = "#0d1117" if dark else "#ffffff"
    border = "#30363d" if dark else "#d0d7de"
    ascii_color = "#7aa2f7" if dark else "#3b5bdb"
    text_primary = "#f0f6fc" if dark else "#0d1117"
    text_muted = "#8b949e" if dark else "#57606a"
    accent = "#ffb454" if dark else "#9a6700"
    green = "#3fb950" if dark else "#1a7f37"

    font_size = 7.5
    line_h = 8.6
    char_w = font_size * 0.6001

    pad = 30
    ascii_w = COLS * char_w
    ascii_h = ROWS * line_h
    gap = 46
    text_x = pad + ascii_w + gap
    col_w = 300
    width = int(text_x + col_w + pad)
    height = int(max(ascii_h + pad * 2, 250))

    ascii_y = (height - ascii_h) / 2 + font_size
    ascii_tspans = "".join(
        f'<tspan x="{pad}" dy="{0 if i == 0 else line_h}">{esc(line)}</tspan>'
        for i, line in enumerate(ASCII_LINES)
    )

    div_x = pad + ascii_w + gap / 2

    stat_rows = [
        ("repos", str(stats["repos"]), False),
        ("stars", str(stats["stars"]), False),
        ("followers", str(stats["followers"]), False),
        ("on_github", f'{stats["years"]}y', False),
    ]
    if waka:
        stat_rows.append(("coding_7d", waka["total_7d"], False))
        stat_rows.append(("top_lang", waka["top_lang"], False))
    stat_rows.append(("status", "open to work", True))

    ty = pad + 4 + 21
    name_y = ty
    ty += 30
    tag_y = ty
    ty += 22
    mono_y = ty
    ty += 26
    rule_y = ty
    ty += 24

    stat_lines = ""
    row_h = 25
    for k, v, is_status in stat_rows:
        color = green if is_status else text_primary
        stat_lines += (
            f'<text x="{text_x}" y="{ty}" font-family="{MONO}" font-size="12.5" fill="{green if is_status else accent}">&gt;</text>'
            f'<text x="{text_x + 16}" y="{ty}" font-family="{MONO}" font-size="9" fill="{text_muted}">{esc(k)}</text>'
            f'<text x="{text_x + col_w - 10}" y="{ty}" text-anchor="end" font-family="{MONO}" font-size="12.5" font-weight="500" fill="{color}">{esc(v)}</text>'
        )
        ty += row_h

    svg = f'''<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="{width - 2}" height="{height - 2}" rx="16" fill="{bg}" stroke="{border}"/>
  <line x1="{div_x}" y1="{pad}" x2="{div_x}" y2="{height - pad}" stroke="{border}"/>
  <text x="{pad}" y="{ascii_y}" fill="{ascii_color}" font-family="{MONO}" font-size="{font_size}" xml:space="preserve">{ascii_tspans}</text>
  <text x="{text_x}" y="{name_y}" fill="{text_primary}" font-family="{MONO}" font-size="21" font-weight="700">Sarvan Kumar</text>
  <text x="{text_x}" y="{tag_y}" fill="{accent}" font-family="{MONO}" font-size="13">Full-Stack &amp; AI Engineer</text>
  <text x="{text_x}" y="{mono_y}" fill="{text_muted}" font-family="{MONO}" font-size="12">MERN . Next.js . Python . C++</text>
  <line x1="{text_x}" y1="{rule_y}" x2="{text_x + col_w - 10}" y2="{rule_y}" stroke="{border}"/>
  {stat_lines}
</svg>'''
    return svg


def main():
    stats = fetch_github_stats()
    waka = fetch_wakatime_stats()
    script_dir = os.path.dirname(os.path.abspath(__file__))
    default_dir = os.path.join(os.path.dirname(script_dir), "assets")
    assets_dir = os.environ.get("OUT_DIR", default_dir)
    os.makedirs(assets_dir, exist_ok=True)
    for theme in ("dark", "light"):
        svg = build_svg(stats, waka, theme)
        with open(os.path.join(assets_dir, f"hero_{theme}.svg"), "w", encoding="utf-8") as f:
            f.write(svg)
    print("stats:", stats, "waka:", waka)


if __name__ == "__main__":
    main()
