// Generates every SVG in /assets plus README.md from data/profile.json + profile.config.json.
import { readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import subsetFont from 'subset-font';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root));
const cfg = JSON.parse(read('profile.config.json'));
const data = JSON.parse(read('data/profile.json'));
const NOW = Date.now();

// ---------- design tokens ----------
const BLUE = '#2747F5', RED = '#E5322D', YELLOW = '#F5C518';
const THEMES = {
  light: { bg: '#FAF8F3', card: '#FFFFFF', border: '#E7E2D6', ink: '#111111', muted: '#6B6658', disc: 'none',
    empty: '#ECE7DC', blues: ['#D3DAFD', '#A3B2FB', '#6E85F8', '#4462F6', BLUE] },
  dark: { bg: '#000000', card: '#000000', border: '#222222', ink: '#F2F2F2', muted: '#8C8C8C', disc: 'none',
    empty: '#161616', blues: ['#131E52', '#1B2D8C', '#2541CF', '#4D69FF', '#8C9FFF'] },
};
const font = (f) => require.resolve(`@fontsource/${f}`);
const FONTS = {
  serif: { family: 'IS', fallback: 'Georgia,serif', file: font('instrument-serif/files/instrument-serif-latin-400-normal.woff2') },
  italic: { family: 'ISI', fallback: 'Georgia,serif', file: font('instrument-serif/files/instrument-serif-latin-400-italic.woff2') },
  mono: { family: 'JBM', fallback: 'ui-monospace,monospace', file: font('jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2') },
  sans: { family: 'Inter', fallback: 'system-ui,sans-serif', file: font('inter/files/inter-latin-400-normal.woff2') },
};
// ponytail: average advance width per em for wrapping, not real glyph metrics. Swap in fontkit if text overflows.
const EM = { serif: 0.44, italic: 0.42, sans: 0.54, mono: 0.6 };

// ---------- helpers ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (n) => n.toLocaleString('en-US');
const plural = (n, one, many = one + 's') => `${fmt(n)} ${n === 1 ? one : many}`;
const truncate = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…');

function wrap(str, f, size, maxW, maxLines) {
  const per = Math.max(4, Math.floor(maxW / (size * EM[f])));
  const lines = [];
  let cur = '';
  for (let w of str.split(/\s+/).filter(Boolean)) {
    while (w.length > per) { if (cur) { lines.push(cur); cur = ''; } lines.push(w.slice(0, per)); w = w.slice(per); }
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= per) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const last = lines[maxLines - 1];
    lines.length = maxLines;
    lines[maxLines - 1] = (last.length < per ? last : last.slice(0, per - 1)).replace(/[\s,.;:]+$/, '') + '…';
  }
  return lines;
}

function ago(iso) {
  const h = (NOW - Date.parse(iso)) / 36e5;
  if (h < 1) return 'PUSHED JUST NOW';
  if (h < 24) return `PUSHED ${Math.floor(h)}H AGO`;
  const d = h / 24;
  if (d < 7) return `PUSHED ${Math.floor(d)}D AGO`;
  if (d < 30) return `PUSHED ${Math.floor(d / 7)}W AGO`;
  if (d < 365) return `PUSHED ${Math.floor(d / 30)}MO AGO`;
  return `PUSHED ${Math.floor(d / 365)}Y AGO`;
}

class Svg {
  constructor(w, h) { Object.assign(this, { w, h, parts: [], used: {} }); }
  add(s) { this.parts.push(s); return this; }
  // segs: [[fontKey, text, fill?], ...]
  text(x, y, size, segs, { fill, anchor, ls } = {}) {
    const spans = segs.map(([f, s, c]) => {
      for (const ch of s) (this.used[f] ??= new Set()).add(ch);
      return `<tspan font-family="${FONTS[f].family},${FONTS[f].fallback}"${c ? ` fill="${c}"` : ''}>${esc(s)}</tspan>`;
    }).join('');
    return this.add(`<text x="${x}" y="${y}" font-size="${size}" fill="${fill}"${anchor ? ` text-anchor="${anchor}"` : ''}${ls ? ` letter-spacing="${ls}"` : ''} xml:space="preserve">${spans}</text>`);
  }
  label(x, y, s, fill, anchor) { return this.text(x, y, 11, [['mono', s.toUpperCase()]], { fill, anchor, ls: '0.88' }); }
  lines(x, y, lh, f, size, lines, fill) { lines.forEach((l, i) => this.text(x, y + i * lh, size, [[f, l]], { fill })); return this; }
  async render() {
    const faces = await Promise.all(Object.entries(this.used).map(async ([k, set]) => {
      const sub = await subsetFont(readFileSync(FONTS[k].file), [...set, ' '].join(''), { targetFormat: 'woff2', noHinting: true, noLayoutClosure: true });
      return `@font-face{font-family:${FONTS[k].family};src:url(data:font/woff2;base64,${sub.toString('base64')}) format('woff2')}`;
    }));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.w}" height="${this.h}" viewBox="0 0 ${this.w} ${this.h}">` +
      `<style>${faces.join('')}</style>${this.parts.join('')}</svg>\n`;
  }
}

const frame = (svg, fill, stroke) =>
  svg.add(`<rect x="0.5" y="0.5" width="${svg.w - 1}" height="${svg.h - 1}" rx="14" fill="${fill}" stroke="${stroke}"/>`);
const arrow = (x, y, c) => `<path d="M${x} ${y + 9}L${x + 9} ${y}M${x + 2} ${y}H${x + 9}V${y + 7}" stroke="${c}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
const star = (cx, cy, r, c) => {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
    return `${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`;
  });
  return `<polygon points="${pts.join(' ')}" fill="${c}"/>`;
};

// ---------- data shaping ----------
const repos = data.repos.filter((r) => !cfg.exclude.includes(r.name));
const byPushed = [...repos].sort((a, b) => Date.parse(b.pushedAt) - Date.parse(a.pushedAt));
const totalStars = repos.reduce((s, r) => s + r.stars, 0);
const repoList = `https://github.com/${data.login}?tab=repositories`;
const topicUrl = (t) => `${repoList}&q=topic:${encodeURIComponent(t)}`;

function fallbackCard() {
  const top = [...repos].sort((a, b) => b.stars - a.stars)[0];
  return totalStars > 0
    ? { headline: `${plural(totalStars, 'star')} across ${plural(repos.length, 'repo')}`, sub: `Most starred: ${top.name}`, href: repoList }
    : { headline: plural(repos.length, 'public repo'), sub: `Latest: ${byPushed[0]?.name ?? data.login}`, href: repoList };
}
const byName = (n) => data.repos.find((r) => r.name.toLowerCase() === n.toLowerCase()) ??
  (console.error(`build: repo "${n}" in profile.config.json not found among public repos`), process.exit(1));

function accent(kind) {
  const c = cfg.cards[kind];
  const pick = c.repos?.length ? c.repos.map(byName) : byPushed.filter((r) => r.topics.includes(c.topic));
  const card = pickCard(kind, c.topic, pick);
  return { ...card, headline: c.headline || card.headline, sub: c.sub || card.sub, href: c.href || card.href };
}
function pickCard(kind, topic, hits) {
  if (!hits.length) return fallbackCard();
  const href = hits.length === 1 ? hits[0].url : topicUrl(topic);
  if (kind === 'build') {
    const top = [...hits].sort((a, b) => b.stars - a.stars).slice(0, 3).map((r) => r.name);
    return { headline: plural(hits.length, 'open-source tool'), sub: top.join(', '), href };
  }
  if (kind === 'win') return { headline: plural(hits.length, 'hackathon build'), sub: hits[0].description ?? hits.slice(0, 3).map((r) => r.name).join(', '), href };
  return { headline: hits[0].name, sub: hits[0].description ?? 'Latest research repo', href: hits[0].url };
}
const ACCENTS = [
  { kind: 'build', bg: BLUE, fg: '#FFFFFF' },
  { kind: 'win', bg: RED, fg: '#FFFFFF' },
  { kind: 'research', bg: YELLOW, fg: '#000000' },
].map((a) => ({ ...a, label: cfg.cards[a.kind].label || a.kind, ...accent(a.kind) }));

// coding: [] = 3 most recently pushed with a description; or list names / {name, description} to pin.
const CODING = cfg.coding?.length
  ? cfg.coding.slice(0, 3).map((e) => (typeof e === 'string' ? { name: e } : e))
      .map((e) => ({ ...byName(e.name), ...(e.description && { description: e.description }), ...(e.title && { title: e.title }) }))
      .map((r) => ({ ...r, description: r.description ?? '' }))
  : byPushed.filter((r) => r.description).slice(0, 3);

// ---------- generators ----------
const memoji = await sharp(read('assets/sarvan.png')).trim().resize(256, 256, { fit: 'contain', background: '#0000' })
  .webp({ quality: 88, smartSubsample: true, effort: 6 }).toBuffer();
const site = cfg.website.replace(/^https?:\/\//, '').replace(/\/$/, '');

function hero(t) {
  const s = new Svg(840, 260);
  frame(s, t.bg, t.border);
  s.text(36, 86, 60, [['serif', cfg.firstName]], { fill: t.ink });
  s.text(36, 142, 60, [['italic', cfg.lastName]], { fill: t.ink });
  s.label(38, 170, `${fmt(data.followers)} followers · ${fmt(data.mergedPRs)} merged PRs`, t.muted);
  s.lines(38, 200, 20, 'sans', 14, wrap(cfg.tagline, 'sans', 14, 520, 2), t.ink);
  s.label(38, 240, site, BLUE);
  s.add(arrow(38 + site.length * 7.48 + 6, 231, BLUE));
  s.add(`<defs><clipPath id="m"><circle cx="706" cy="130" r="98"/></clipPath></defs>` +
    `<circle cx="706" cy="130" r="98" fill="${t.disc}"/>` +
    `<image clip-path="url(#m)" x="614" y="44" width="184" height="184" href="data:image/webp;base64,${memoji.toString('base64')}"/>`);
  return s;
}

function heatmap(t) {
  const s = new Svg(840, 200);
  frame(s, t.bg, t.border);
  s.text(28, 50, 30, [['serif', 'Every day, '], ['italic', 'in blue', BLUE]], { fill: t.ink });
  s.label(812, 44, 'Refreshed daily', t.muted, 'end');
  const days = data.contributions.days;
  const counts = days.map(([, c]) => c).filter((c) => c > 0).sort((a, b) => a - b);
  const q = [0.2, 0.4, 0.6, 0.8].map((p) => counts[Math.floor(p * (counts.length - 1))] ?? 0);
  const level = (c) => (c === 0 ? -1 : q.filter((v) => c > v).length);
  const dow0 = new Date(days[0][0] + 'T00:00:00Z').getUTCDay();
  const cols = Math.ceil((days.length + dow0) / 7);
  const pitch = Math.min(15, 784 / cols), cell = (pitch * 0.8).toFixed(1), y0 = 64;
  const groups = {};
  days.forEach(([, c], i) => {
    const k = i + dow0, l = level(c);
    (groups[l < 0 ? t.empty : t.blues[l]] ??= []).push(`<use href="#d" x="${+(28 + Math.floor(k / 7) * pitch).toFixed(1)}" y="${+(y0 + (k % 7) * pitch).toFixed(1)}"/>`);
  });
  s.add(`<defs><rect id="d" width="${cell}" height="${cell}" rx="2.5"/></defs>` +
    Object.entries(groups).map(([fill, u]) => `<g fill="${fill}">${u.join('')}</g>`).join(''));
  s.label(28, 182, `${fmt(data.contributions.total)} contributions in the last year`, t.muted);
  const lx = 812 - 5 * 15 - 40;
  s.label(lx - 8, 182, 'Less', t.muted, 'end');
  s.add([t.empty, ...t.blues.slice(1)].map((c, i) => `<rect x="${lx + i * 15}" y="172" width="11" height="11" rx="2.5" fill="${c}"/>`).join(''));
  s.label(lx + 5 * 15 + 4, 182, 'More', t.muted);
  return s;
}

function accentCard(a, t) {
  const s = new Svg(270, 150);
  s.add(`<rect x="0.5" y="0.5" width="269" height="149" rx="14" fill="${a.bg}" stroke="${t === THEMES.dark ? t.border : a.bg}"/>`);
  s.label(20, 30, a.label, a.fg);
  s.add(arrow(242, 20, a.fg));
  const head = wrap(a.headline, 'serif', 27, 230, 2);
  const sub = wrap(a.sub, 'sans', 12, 230, 2);
  s.lines(20, 72, 26, 'serif', 27, head, a.fg);
  s.lines(20, 132 - (sub.length - 1) * 17, 17, 'sans', 12, sub, a.fg);
  return s;
}

function repoCard(r, t) {
  const s = new Svg(270, 150);
  frame(s, t.card, t.border);
  s.add(`<circle cx="25" cy="29" r="5" fill="${r.language?.color ?? t.muted}"/>`);
  s.text(38, 34, 13, [['mono', truncate(r.title ?? r.name, 27)]], { fill: t.ink });
  s.lines(20, 62, 19, 'sans', 13, wrap(truncate(r.description, 70), 'sans', 13, 230, 3), t.muted);
  let x = 20;
  if (r.language) { s.text(x, 132, 12, [['sans', r.language.name]], { fill: t.ink }); x += r.language.name.length * 12 * EM.sans + 10; }
  s.add(star(x + 5, 128, 5.5, t.muted));
  s.text(x + 14, 132, 12, [['sans', fmt(r.stars)]], { fill: t.ink });
  s.label(250, 132, ago(r.pushedAt), t.muted, 'end');
  return s;
}

const title = (reg, ital) => (t) => new Svg(840, 56).text(2, 42, 30, [['serif', reg], ['italic', ital]], { fill: t.ink });
const codingTitle = title('What I’m ', 'coding');
const profilesTitle = title(...(cfg.profilesTitle ?? ['Coding ', 'profiles']));

// One card per platform found in data.platforms; text built only from fetched numbers.
const PLATFORM_CARDS = Object.entries(data.platforms ?? {}).map(([label, p]) => {
  const parts = (pairs) => pairs.filter(([n]) => n).map(([n, w]) => `${fmt(n)} ${w}`).join(' · ');
  if (label === 'LeetCode') return { label, color: '#FFA116', url: p.url, headline: plural(p.solved, 'problem') + ' solved',
    sub: p.rating ? `Contest rating ${fmt(p.rating)} across ${plural(p.contests, 'contest')}` : `@${p.handle}`,
    foot: parts([[p.easy, 'easy'], [p.medium, 'medium'], [p.hard, 'hard']]) };
  if (label === 'Codeforces') return { label, color: '#1F8ACB', url: p.url,
    headline: p.rating ? `${fmt(p.rating)} rating` : plural(p.solved, 'problem') + ' solved',
    sub: `${p.rank[0].toUpperCase()}${p.rank.slice(1)}${p.maxRating ? ` · max ${fmt(p.maxRating)}` : ''}`,
    foot: p.rating ? plural(p.solved, 'problem') + ' solved' : `@${p.handle}` };
  if (label === 'Kaggle') {
    const k = [[p.notebooks, 'notebook'], [p.datasets, 'dataset'], [p.competitions, 'competition']].filter(([n]) => n);
    return { label, color: '#20BEFF', url: p.url, headline: k.length ? plural(...k[0]) : 'Kaggle',
      sub: [...k.slice(1).map(([n, w]) => plural(n, w)), p.votes && plural(p.votes, 'upvote')].filter(Boolean).join(' · ') || 'Notebooks, datasets and competitions',
      foot: `@${p.handle}` };
  }
  const hf = [[p.models, 'model'], [p.spaces, 'space'], [p.datasets, 'dataset']].filter(([n]) => n);
  return { label, color: '#FFD21E', url: p.url,
    headline: hf.length ? plural(...hf[0]) : 'Hugging Face',
    sub: [...hf.slice(1).map(([n, w]) => plural(n, w)), p.likes && plural(p.likes, 'like')].filter(Boolean).join(' · ') || 'Models, spaces and datasets',
    foot: `@${p.handle}` };
});
const PW = PLATFORM_CARDS.length >= 3 ? 270 : 413;

function platformCard(c, t) {
  const s = new Svg(PW, 150);
  frame(s, t.card, t.border);
  s.add(`<circle cx="25" cy="26" r="5" fill="${c.color}"/>`);
  s.label(38, 30, c.label, t.muted);
  s.add(arrow(PW - 28, 20, t.muted));
  s.lines(20, 76, 26, 'serif', 30, wrap(c.headline, 'serif', 30, PW - 40, 1), t.ink);
  s.lines(20, 102, 17, 'sans', 13, wrap(c.sub, 'sans', 13, PW - 40, 1), t.muted);
  if (c.foot) s.label(20, 132, c.foot, t.ink);
  return s;
}

// ---------- write ----------
const out = [];
for (const [mode, t] of Object.entries(THEMES)) {
  out.push([`hero-${mode}`, hero(t)], [`heatmap-${mode}`, heatmap(t)], [`coding-title-${mode}`, codingTitle(t)]);
  ACCENTS.forEach((a) => out.push([`card-${a.kind}-${mode}`, accentCard(a, t)]));
  CODING.forEach((r, i) => out.push([`repo-${i + 1}-${mode}`, repoCard(r, t)]));
  if (PLATFORM_CARDS.length) out.push([`profiles-title-${mode}`, profilesTitle(t)]);
  PLATFORM_CARDS.forEach((c) => out.push([`profile-${c.label.toLowerCase().replace(/\W+/g, '-')}-${mode}`, platformCard(c, t)]));
}
// drop SVGs from cards that no longer exist (e.g. a platform removed from config)
const keep = new Set(out.map(([n]) => `${n}.svg`));
for (const f of readdirSync(new URL('assets/', root))) if (f.endsWith('.svg') && !keep.has(f)) unlinkSync(new URL(`assets/${f}`, root));
for (const [name, svg] of out) writeFileSync(new URL(`assets/${name}.svg`, root), await svg.render());

// Cards are inverted against the page (light cards on GitHub dark, dark cards on GitHub light).
// Section titles have no background, so they follow the page theme (invert = false).
const pic = (name, alt, width, invert = true) => {
  const [onDark, onLight] = invert ? ['light', 'dark'] : ['dark', 'light'];
  return `<picture><source media="(prefers-color-scheme: dark)" srcset="assets/${name}-${onDark}.svg"><img src="assets/${name}-${onLight}.svg" alt="${esc(truncate(alt, 180))}" width="${width}"></picture>`;
};
const fullName = `${cfg.firstName} ${cfg.lastName}`;
const readme = `<!-- Generated by scripts/build.mjs from profile.config.json + data/profile.json. Edit those, not this file. -->

<a href="${cfg.website}">${pic('hero', `${fullName}. ${cfg.tagline} ${fmt(data.followers)} followers, ${fmt(data.mergedPRs)} merged PRs.`, '100%')}</a>

<a href="https://github.com/${data.login}">${pic('heatmap', `Contribution heatmap: ${fmt(data.contributions.total)} contributions in the last year.`, '100%')}</a>

<p align="center">
${ACCENTS.map((a) => `<a href="${a.href}">${pic(`card-${a.kind}`, `${a.label}: ${a.headline}. ${a.sub}`, '32.6%')}</a>`).join('\n')}
</p>

${pic('coding-title', 'What I’m coding', '100%', false)}

<p align="center">
${CODING.map((r, i) => `<a href="${r.url}">${pic(`repo-${i + 1}`, `${r.title ?? r.name}: ${r.description}`, '32.6%')}</a>`).join('\n')}
</p>
${PLATFORM_CARDS.length ? `
${pic('profiles-title', (cfg.profilesTitle ?? ['Coding ', 'profiles']).join(''), '100%', false)}

<p align="center">
${PLATFORM_CARDS.map((c) => `<a href="${esc(c.url)}">${pic(`profile-${c.label.toLowerCase().replace(/\W+/g, '-')}`, `${c.label}: ${c.headline}. ${c.sub}`, PW === 270 ? '32.6%' : '49.2%')}</a>`).join('\n')}
</p>
` : ''}
<p align="center">${[[site, cfg.website], ['LinkedIn', cfg.linkedin], ['Email', `mailto:${cfg.email}`], ...Object.entries(cfg.profiles ?? {})]
  .filter(([, url]) => url).map(([label, url]) => `<a href="${esc(url)}">${esc(label)}</a>`).join(' · ')}</p>
`;
writeFileSync(new URL('README.md', root), readme);

const total = readdirSync(new URL('assets/', root)).filter((f) => f.endsWith('.svg'))
  .reduce((s, f) => s + statSync(new URL(`assets/${f}`, root)).size, 0);
console.log(`build: ${out.length} SVGs, ${(total / 1024).toFixed(1)} KB total`);
if (total > 300 * 1024) { console.error('build: SVG weight over 300 KB budget'); process.exit(1); }
