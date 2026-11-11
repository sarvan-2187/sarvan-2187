// Pulls everything the profile shows from the GitHub GraphQL API into data/profile.json.
// Any failure exits non-zero before the file is touched.
import { writeFileSync, renameSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';

const LOGIN = 'sarvan-2187';
const OUT = new URL('../data/profile.json', import.meta.url);
try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch {} // local runs only; CI uses secrets
const token = process.env.GH_PAT;

function fail(msg) {
  console.error(`fetch: ${msg}`);
  process.exit(1);
}
if (!token) fail('GH_PAT is not set');

async function gql(query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'profile-readme' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) fail(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  if (json.errors?.length) fail(json.errors.map((e) => e.message).join('; '));
  return json.data;
}

const to = new Date();
const from = new Date(to.getTime() - 365 * 864e5);

const main = await gql(
  `query($login: String!, $from: DateTime!, $to: DateTime!, $q: String!) {
    user(login: $login) {
      followers { totalCount }
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks { contributionDays { date contributionCount } }
        }
      }
    }
    search(query: $q, type: ISSUE, first: 1) { issueCount }
  }`,
  { login: LOGIN, from: from.toISOString(), to: to.toISOString(), q: `author:${LOGIN} is:pr is:merged` },
);

const repos = [];
for (let cursor = null, page = 0; page < 20; page++) {
  const d = await gql(
    `query($login: String!, $cursor: String) {
      user(login: $login) {
        repositories(first: 100, after: $cursor, ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false,
                     orderBy: { field: PUSHED_AT, direction: DESC }) {
          pageInfo { hasNextPage endCursor }
          nodes {
            name url description isArchived isFork stargazerCount pushedAt
            primaryLanguage { name color }
            repositoryTopics(first: 20) { nodes { topic { name } } }
          }
        }
      }
    }`,
    { login: LOGIN, cursor },
  );
  const conn = d?.user?.repositories;
  if (!conn || !Array.isArray(conn.nodes)) fail('malformed repositories response');
  repos.push(...conn.nodes);
  if (!conn.pageInfo.hasNextPage) break;
  cursor = conn.pageInfo.endCursor;
}

// ---- validate shape ----
const u = main?.user;
const cal = u?.contributionsCollection?.contributionCalendar;
const isInt = (n) => Number.isInteger(n) && n >= 0;
if (!u) fail('user not found');
if (!isInt(u.followers?.totalCount)) fail('bad followers count');
if (!isInt(main.search?.issueCount)) fail('bad merged PR count');
if (!isInt(cal?.totalContributions) || !Array.isArray(cal.weeks) || cal.weeks.length < 50) fail('bad contribution calendar');
const days = cal.weeks.flatMap((w) => w.contributionDays ?? []);
if (!days.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date) && isInt(d.contributionCount))) fail('bad contribution day');
for (const r of repos) {
  if (typeof r?.name !== 'string' || typeof r.url !== 'string' || !isInt(r.stargazerCount) || isNaN(Date.parse(r.pushedAt)))
    fail(`bad repo entry: ${JSON.stringify(r).slice(0, 200)}`);
}

const profile = {
  login: LOGIN,
  followers: u.followers.totalCount,
  mergedPRs: main.search.issueCount,
  contributions: {
    total: cal.totalContributions,
    days: days.map((d) => [d.date, d.contributionCount]),
  },
  repos: repos
    .filter((r) => !r.isArchived && !r.isFork)
    .map((r) => ({
      name: r.name,
      url: r.url,
      description: r.description?.trim() || null,
      language: r.primaryLanguage ? { name: r.primaryLanguage.name, color: r.primaryLanguage.color || '#8b8b8b' } : null,
      stars: r.stargazerCount,
      pushedAt: r.pushedAt,
      topics: (r.repositoryTopics?.nodes ?? []).map((n) => n.topic.name),
    })),
};

// ---- coding platforms (handles taken from profile.config.json "profiles" URLs) ----
// Third-party APIs are flaky/blocky: on failure keep the last good value instead of failing the whole refresh.
const cfg = JSON.parse(readFileSync(new URL('../profile.config.json', import.meta.url)));
let prevAll = {};
try { prevAll = JSON.parse(readFileSync(OUT)); } catch {}
const prev = prevAll.platforms ?? {};
const handle = (label) => (cfg.profiles?.[label] || '').replace(/\/+$/, '').split('/').pop();
const getJson = async (url, init) => {
  const r = await fetch(url, { ...init, headers: { 'User-Agent': 'Mozilla/5.0 profile-readme', ...init?.headers } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};
const PLATFORMS = {
  LeetCode: async (u) => {
    const d = (await getJson('https://leetcode.com/graphql', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Referer: 'https://leetcode.com' },
      body: JSON.stringify({ query: `query($u:String!){matchedUser(username:$u){submitStatsGlobal{acSubmissionNum{difficulty count}}}
        userContestRanking(username:$u){rating attendedContestsCount}}`, variables: { u } }),
    })).data;
    const n = Object.fromEntries(d.matchedUser.submitStatsGlobal.acSubmissionNum.map((x) => [x.difficulty, x.count]));
    if (!isInt(n.All)) throw new Error('bad solved count');
    return { solved: n.All, easy: n.Easy, medium: n.Medium, hard: n.Hard,
      rating: d.userContestRanking ? Math.round(d.userContestRanking.rating) : null, contests: d.userContestRanking?.attendedContestsCount ?? 0 };
  },
  Codeforces: async (u) => {
    // Signed per codeforces.com/apiHelp when CODEFORCES_KEY + CODEFORCES_SECRET are set, anonymous otherwise.
    const { CODEFORCES_KEY: key, CODEFORCES_SECRET: secret } = process.env;
    const cf = (method, params) => {
      if (key && secret) {
        Object.assign(params, { apiKey: key, time: Math.floor(Date.now() / 1000) });
        const qs = Object.entries(params).map(([k, v]) => [k, String(v)]).sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : 1))
          .map(([k, v]) => `${k}=${v}`).join('&');
        const rand = randomBytes(3).toString('hex');
        params.apiSig = rand + createHash('sha512').update(`${rand}/${method}?${qs}#${secret}`).digest('hex');
      }
      return getJson(`https://codeforces.com/api/${method}?${new URLSearchParams(params)}`);
    };
    const [info, status] = await Promise.all([cf('user.info', { handles: u }), cf('user.status', { handle: u })]);
    const i = info.result?.[0];
    if (info.status !== 'OK' || status.status !== 'OK' || !i) throw new Error('bad response');
    const solved = new Set(status.result.filter((s) => s.verdict === 'OK').map((s) => `${s.problem.contestId}${s.problem.index}`)).size;
    return { rating: i.rating ?? null, maxRating: i.maxRating ?? null, rank: i.rank ?? 'unrated', solved };
  },
  'Hugging Face': async (u) => {
    const headers = process.env.HF_TOKEN ? { Authorization: `Bearer ${process.env.HF_TOKEN}` } : {};
    const lists = await Promise.all(['models', 'spaces', 'datasets']
      .map((k) => getJson(`https://huggingface.co/api/${k}?author=${encodeURIComponent(u)}&limit=1000&full=false`, { headers })));
    if (!lists.every(Array.isArray)) throw new Error('bad response');
    // A token also lists the owner's private repos; never publish those.
    const [models, spaces, datasets] = lists.map((l) => l.filter((x) => x.private !== true));
    const likes = [...models, ...spaces, ...datasets].reduce((s, x) => s + (x.likes ?? 0), 0);
    return { models: models.length, spaces: spaces.length, datasets: datasets.length, likes };
  },
  Kaggle: async (u) => {
    // New-style token (KAGGLE_API_TOKEN) or legacy kaggle.json pair (KAGGLE_USERNAME + KAGGLE_KEY).
    const { KAGGLE_API_TOKEN: tok, KAGGLE_USERNAME: ku, KAGGLE_KEY: kk } = process.env;
    const Authorization = tok ? `Bearer ${tok}` : ku && kk ? `Basic ${Buffer.from(`${ku}:${kk}`).toString('base64')}` : null;
    if (!Authorization) return null;
    const api = (p) => getJson(`https://www.kaggle.com/api/v1/${p}`, { headers: { Authorization } });
    const q = encodeURIComponent(u);
    const [kernels, datasets, comps] = await Promise.all([
      api(`kernels/list?user=${q}&pageSize=100`), api(`datasets/list?user=${q}`), api('competitions/list?group=entered'),
    ]);
    if (![kernels, datasets, comps].every(Array.isArray)) throw new Error('bad response');
    const votes = kernels.reduce((s, k) => s + (k.totalVotes ?? 0), 0) + datasets.reduce((s, d) => s + (d.voteCount ?? 0), 0);
    return { notebooks: kernels.length, datasets: datasets.length, competitions: comps.length, votes };
  },
};
const platforms = {};
for (const [label, get] of Object.entries(PLATFORMS)) {
  const u = handle(label);
  if (!u) continue;
  try {
    const stats = await get(u);
    if (!stats) { console.warn(`fetch: ${label} skipped (no credentials in env)`); continue; }
    platforms[label] = { handle: u, url: cfg.profiles[label], ...stats };
  }
  catch (e) {
    // Optional source: never let it block the GitHub-backed refresh. Stale data if we have it, else no card.
    if (prev[label]?.handle !== u) { console.warn(`fetch: WARNING ${label} failed (${e.message}), no earlier data, card skipped`); continue; }
    console.warn(`fetch: WARNING ${label} failed (${e.message}), keeping last good data`);
    platforms[label] = prev[label];
  }
}
profile.platforms = platforms;

mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
const tmp = new URL('../data/profile.json.tmp', import.meta.url);
writeFileSync(tmp, JSON.stringify(profile, null, 2) + '\n');
renameSync(tmp, OUT);
console.log(`fetch: ${profile.repos.length} repos, ${profile.contributions.total} contributions, ${profile.followers} followers, ${profile.mergedPRs} merged PRs`);
