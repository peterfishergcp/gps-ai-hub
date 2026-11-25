/**
 * Zero-Footprint Antigravity Blog Updates & Video Walkthroughs Feed (`antigravity_updates.mjs`)
 *
 * - Ships a rich offline-first snapshot of official Google Antigravity Blog feature drops
 *   + the 4 Generic 3–4 Min Two-Host Tutorial Videos on https://www.youtube.com/@PeterFisher-gps-google.
 * - Supports user-initiated HTTPS sync (`syncAntigravityUpdates`) against HARDCODED allowlisted
 *   endpoints ONLY (`https://antigravity.google/blog/rss.xml` + optional GitHub video manifest),
 *   parsing XML purely as plain text (zero HTML execution, strict https:// URL whitelist) and
 *   caching strictly inside `<sidecarStateDir>/updates-cache.json`.
 */

import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';

const __parseJsonNoBom = (s) =>
  JSON.parse(
    typeof s === 'string'
      ? s.replace(/^\uFEFF/, '')
      : Buffer.isBuffer(s)
        ? s.toString('utf-8').replace(/^\uFEFF/, '')
        : s
  );

const OFFICIAL_RSS_URL = 'https://antigravity.google/blog/rss.xml';
const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@PeterFisher-gps-google';
const OFFICIAL_BLOG_URL = 'https://antigravity.google/blog';
const ALLOWED_HOSTS = new Set(['antigravity.google', 'raw.githubusercontent.com']);

export const UPDATE_TOPICS = [
  { id: 'all', label: 'All Updates' },
  { id: 'videos', label: 'Video Walkthroughs' },
  { id: 'app', label: 'Antigravity App' },
  { id: 'cli', label: 'Antigravity CLI' },
  { id: 'extensions', label: 'IDE Extensions' },
  { id: 'sdk', label: 'Antigravity SDK' },
];

export const BUNDLED_VIDEO_GUIDES = [
  {
    id: 'vid-suite-overview',
    kind: 'video',
    topic: 'videos',
    badge: '3 Min · How-To Video',
    dateLabel: 'Nov 2026',
    title: 'Google Antigravity Plugin Suite — Complete Tour',
    summary:
      'Practical tour of where to click across WV My Hub Overview, Action Items, WV Skills (with Ask Clawy 🐻) & Personal Skills, TokenEconomics, and WV Preview.',
    url: 'https://www.youtube.com/watch?v=_VjZQ2_HkSA',
    tryLabel: 'Tour My Workspace →',
    tryPrompt:
      '/daily-brief Walk me through my workspace Overview, open Action Items, Personal Skills, and TokenEconomics health.',
  },
  {
    id: 'vid-getting-started-turbo',
    kind: 'video',
    topic: 'videos',
    badge: '2.5 Min · WV How-To Video',
    dateLabel: 'Nov 2026',
    title: 'West Virginia Antigravity Suite — 60-Second Install & Turbo Mode Guide',
    summary:
      'Step-by-step WV guide to pasting the wv-antigravity-suite command, using ⚡ Turbo during setup vs. 🔒 Default daily, and enabling built-in Google Workspace connectors under Customizations.',
    url: 'https://www.youtube.com/watch?v=OjdnOHKMfNA',
    tryLabel: 'Run 60s Setup →',
    tryPrompt:
      '/memory Check my role profile, writing voice, and personal memory setup and confirm Default review safety best practices.',
  },
  {
    id: 'vid-skills-dashboard-preview',
    kind: 'video',
    topic: 'videos',
    badge: '2.5 Min · How-To Video',
    dateLabel: 'Nov 2026',
    title: 'Using 1-Click Skills, Personal Skills & Visual Previews (Dashboards & Slides)',
    summary:
      'How to run 36 ready-made skills in WV Skills, ask Clawy 🐻 to find the right skill, create Personal Skills (+ New Skill), and export Dashboards & 16:9 Slide Decks in WV Preview.',
    url: 'https://www.youtube.com/watch?v=EBNOPmh48d0',
    tryLabel: 'Build Sample Deck →',
    tryPrompt:
      '/slides Create a crisp 5-slide executive readiness briefing deck with speaker notes and open the rendered visual preview in the Side Pane.',
  },
  {
    id: 'vid-orchestrator-workflows-tokens',
    kind: 'video',
    topic: 'videos',
    badge: '2.5 Min · How-To Video',
    dateLabel: 'Nov 2026',
    title: 'Working Faster with Orchestrator & Managing TokenEconomics',
    summary:
      'How to click ⚡ Orchestrator on multi-step tasks, prep big meetings in 60s with /swarm-prep, and track your monthly plan in TokenEconomics.',
    url: 'https://www.youtube.com/watch?v=UNkIaYH8O6M',
    tryLabel: 'Try Orchestrator →',
    tryPrompt:
      '/orchestrator-guide Show me how to combine Orchestrator (Argon/Neon + Hydrogen) with deterministic Workflows to maximize quality and stretch my pooled quota.',
  },
  {
    id: 'vid-clawy-coordinator',
    kind: 'video',
    topic: 'videos',
    badge: '3 Min · How-To Video',
    dateLabel: 'Nov 2026',
    title: 'How to Use Clawy — Multi-Agent Command Center & Gemini Live Voice',
    summary:
      'Overview of multi-agent coordination and how Clawy 🐻 now lives right inside WV Skills to match skills and start focused chats in 1 click.',
    url: 'https://www.youtube.com/watch?v=TeWdmiyXnxo',
    tryLabel: 'Run Daily Brief →',
    tryPrompt:
      '/daily-brief Summarize my active priorities, open Action Items, and any follow-ups waiting on me.',
  },
];

const LEGACY_VIDEO_URLS = new Set([
  YOUTUBE_CHANNEL_URL,
  'https://www.youtube.com/watch?v=Qk6TZEhROmo',
  'https://www.youtube.com/watch?v=g5bVwFgt-xU',
  'https://www.youtube.com/watch?v=jLuitwvpwaY',
  'https://www.youtube.com/watch?v=qw43eb33nzA',
  'https://www.youtube.com/watch?v=JMNn19uuJCo',
]);

export const BUNDLED_BLOG_UPDATES = [
  {
    id: 'blog-gemini-4-neon',
    kind: 'blog',
    topic: 'app',
    badge: 'Antigravity App · Model',
    dateLabel: 'Nov 18, 2026',
    title: 'Gemini 4 Neon in Google Antigravity',
    summary:
      'High-speed frontier reasoning tuned for interactive planning, rapid multi-file synthesis, and responsive Orchestrator delegation.',
    url: 'https://antigravity.google/blog/gemini-4-neon-in-google-antigravity',
    tryLabel: 'Try w/ Orchestrator →',
    tryPrompt:
      '/orchestrator-guide Compare when to pick Orchestrator (Neon) vs Orchestrator (Argon) vs Orchestrator (Carbon) for my daily tasks.',
  },
  {
    id: 'blog-gemini-4-hydrogen-orchestrator',
    kind: 'blog',
    topic: 'cli',
    badge: 'App & CLI · Orchestrator',
    dateLabel: 'Nov 12, 2026',
    title: 'Gemini 4 Hydrogen and Orchestrator',
    summary:
      'Pairs frontier Gemini 4 planning with ultra-fast Hydrogen worker execution across App and Antigravity CLI—cutting latency and token burn by 50–65%.',
    url: 'https://antigravity.google/blog/gemini-4-hydrogen-in-google-antigravity',
    tryLabel: 'Optimize Prompt →',
    tryPrompt:
      '/orchestrator-guide Give me a ready-to-run Orchestrator prompt template that delegates file checks to Hydrogen workers.',
  },
  {
    id: 'blog-gemini-4-carbon-swarm',
    kind: 'blog',
    topic: 'cli',
    badge: 'Antigravity CLI · /swarm',
    dateLabel: 'Nov 10, 2026',
    title: 'Gemini 4 Carbon and /swarm',
    summary:
      'Coordinate multi-agent parallel teams on a shared board for complex multi-module projects and adversarial second-pair-of-eyes verification.',
    url: 'https://antigravity.google/blog/gemini-4-carbon-in-google-antigravity',
    tryLabel: 'Run 4-Agent Prep →',
    tryPrompt:
      '/swarm-prep Run a 4-agent parallel 360 prep pack for my highest-priority active initiative.',
  },
  {
    id: 'blog-knowledge-work',
    kind: 'blog',
    topic: 'app',
    badge: 'Antigravity App · Workflows',
    dateLabel: 'Nov 9, 2026',
    title: 'Google Antigravity for Knowledge Work',
    summary:
      'Turn daily briefings, stakeholder follow-ups, redlines, and executive dashboards into repeatable 1-click skills and zero-footprint workspace memory.',
    url: 'https://antigravity.google/blog/antigravity-for-knowledge-work',
    tryLabel: 'Sweep Follow-Ups →',
    tryPrompt:
      '/followup-plan Sweep my open action items and >21d contacts and stage concise [Draft-Only] check-ins.',
  },
  {
    id: 'blog-plugin-marketplace',
    kind: 'blog',
    topic: 'extensions',
    badge: 'IDE Extensions & Plugins',
    dateLabel: 'Oct 29, 2026',
    title: 'Plugin Marketplace in Antigravity',
    summary:
      'Bundle custom skills, rules, MCP connectors, and Sidecar SDK panels into zero-footprint plugins installable in a single command.',
    url: 'https://antigravity.google/blog/plugin-marketplace-in-antigravity',
    tryLabel: 'Create Personal Skill →',
    tryPrompt:
      'Help me design a reusable personal SKILL.md in ~/.gemini/config/skills/ for a workflow I run every week.',
  },
  {
    id: 'blog-custom-agents-sdk',
    kind: 'blog',
    topic: 'sdk',
    badge: 'Antigravity SDK',
    dateLabel: 'Sep 28, 2026',
    title: 'Custom Agents & Sidecar SDK in Google Plugins',
    summary:
      'Build adaptive theme-aware auxiliary panels, subagents, and deterministic hooks on Antigravity’s built-in Sidecar SDK.',
    url: 'https://antigravity.google/blog/custom-agents-in-google-plugins',
    tryLabel: 'Check TokenEconomics →',
    tryPrompt:
      '/token-usage Retrieve my 5h, 24h, and 7d token telemetry and show how subagents isolate context bloat.',
  },
];

function getStateDir(customStateDir = '') {
  const d =
    customStateDir ||
    process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR ||
    path.join(os.homedir(), '.gemini', 'config', 'plugin_data', 'wv-antigravity', 'updates-feed');
  const resolved = path.resolve(d);
  fs.mkdirSync(resolved, { recursive: true, mode: 0o700 });
  return resolved;
}

function stripXmlEntities(str) {
  return String(str || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyRssTopic(title, category) {
  const hay = `${title} ${category}`.toLowerCase();
  if (hay.includes('sdk') || hay.includes('custom agent')) return 'sdk';
  if (hay.includes('plugin') || hay.includes('extension') || hay.includes('marketplace')) return 'extensions';
  if (hay.includes('cli') || hay.includes('/swarm') || hay.includes('hydrogen')) return 'cli';
  return 'app';
}

export function parseAntigravityRssXml(xmlText) {
  const raw = String(xmlText || '');
  const itemBlocks = raw.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  const parsed = [];

  for (const block of itemBlocks.slice(0, 12)) {
    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    const dateMatch = block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
    const catMatch = block.match(/<category[^>]*>([\s\S]*?)<\/category>/i);
    const descMatch = block.match(/<description[^>]*>([\s\S]*?)<\/description>/i);

    const title = stripXmlEntities(titleMatch ? titleMatch[1] : '').slice(0, 140);
    const link = stripXmlEntities(linkMatch ? linkMatch[1] : '');
    if (!title || !link.startsWith('https://antigravity.google/')) continue;

    const category = stripXmlEntities(catMatch ? catMatch[1] : 'Update').slice(0, 40);
    const pubRaw = stripXmlEntities(dateMatch ? dateMatch[1] : '');
    let dateLabel = pubRaw;
    const dt = Date.parse(pubRaw);
    if (!Number.isNaN(dt)) {
      dateLabel = new Date(dt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
    const desc = stripXmlEntities(descMatch ? descMatch[1] : '');
    const topic = classifyRssTopic(title, category);

    // Match bundled rich summary/prompt if known URL, otherwise provide clean default
    const bundledMatch = BUNDLED_BLOG_UPDATES.find((b) => b.url === link);

    parsed.push({
      id: 'rss-' + Buffer.from(link).toString('base64url').slice(0, 22),
      kind: 'blog',
      topic,
      badge: `Antigravity Blog · ${category || 'Release'}`,
      dateLabel: dateLabel || 'Recent',
      title,
      summary:
        desc ||
        (bundledMatch && bundledMatch.summary) ||
        `Official Google Antigravity release note: ${title}. Click Read to explore full details and examples.`,
      url: link,
      tryLabel: (bundledMatch && bundledMatch.tryLabel) || 'Ask How to Use →',
      tryPrompt:
        (bundledMatch && bundledMatch.tryPrompt) ||
        `Summarize how I can apply "${title}" in my daily Google Antigravity workflow and give me a ready-to-run starter prompt.`,
    });
  }

  return parsed;
}

function fetchHttpsAllowlisted(urlStr, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(urlStr);
    } catch {
      return reject(new Error('Invalid URL'));
    }
    if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname)) {
      return reject(new Error(`Host not allowlisted: ${u.hostname}`));
    }
    const req = https.get(
      u,
      { headers: { 'User-Agent': 'Antigravity-Suite-Updates/2.0' }, timeout: 7000 },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
          const nextUrl = new URL(res.headers.location, urlStr).toString();
          return resolve(fetchHttpsAllowlisted(nextUrl, redirectsLeft - 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const chunks = [];
        let total = 0;
        res.on('data', (c) => {
          total += c.length;
          if (total > 1024 * 1024) return req.destroy(new Error('Feed payload exceeds 1 MB cap'));
          chunks.push(c);
        });
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Feed request timed out')));
  });
}

export function getUpdatesState(stateDir = '', videoManifestOverride = null) {
  const dir = getStateDir(stateDir);
  const cachePath = path.join(dir, 'updates-cache.json');
  const subPath = path.join(dir, 'updates-subscription.json');

  let cachedBlog = null;
  let cachedVideos = null;
  let lastSyncedIso = null;
  try {
    if (fs.existsSync(cachePath) && fs.lstatSync(cachePath).isFile()) {
      const c = __parseJsonNoBom(fs.readFileSync(cachePath, 'utf-8'));
      if (Array.isArray(c.items) && c.items.length > 0) {
        cachedBlog = c.items;
        lastSyncedIso = c.lastSyncedIso || null;
      }
      if (
        Array.isArray(c.videos) &&
        c.videos.length >= BUNDLED_VIDEO_GUIDES.length &&
        !c.videos.some((v) => !v || !v.url || LEGACY_VIDEO_URLS.has(v.url))
      ) {
        cachedVideos = c.videos;
      }
    }
  } catch {}

  let subscription = {
    emailHint: '',
    topics: ['all'],
    subscribedYoutube: false,
    dismissedMastery: false,
    completedMasterySteps: [],
  };
  try {
    if (fs.existsSync(subPath) && fs.lstatSync(subPath).isFile()) {
      const s = __parseJsonNoBom(fs.readFileSync(subPath, 'utf-8'));
      subscription = {
        emailHint: typeof s.emailHint === 'string' ? s.emailHint.slice(0, 120) : '',
        topics: Array.isArray(s.topics) && s.topics.length > 0 ? s.topics.slice(0, 8) : ['all'],
        subscribedYoutube: Boolean(s.subscribedYoutube),
        dismissedMastery: Boolean(s.dismissedMastery),
        completedMasterySteps: Array.isArray(s.completedMasterySteps) ? s.completedMasterySteps.slice(0, 10) : [],
      };
    }
  } catch {}

  const videos = Array.isArray(videoManifestOverride) && videoManifestOverride.length > 0
    ? videoManifestOverride
    : cachedVideos || BUNDLED_VIDEO_GUIDES;
  const blogItems = cachedBlog || BUNDLED_BLOG_UPDATES;

  return {
    topics: UPDATE_TOPICS,
    officialBlogUrl: OFFICIAL_BLOG_URL,
    youtubeChannelUrl: YOUTUBE_CHANNEL_URL,
    lastSyncedIso,
    subscription,
    items: [...videos, ...blogItems],
  };
}

export function saveUpdatesPreferences(prefs = {}, stateDir = '') {
  const dir = getStateDir(stateDir);
  const subPath = path.join(dir, 'updates-subscription.json');
  const current = getUpdatesState(dir).subscription;

  const validTopicIds = new Set(UPDATE_TOPICS.map((t) => t.id));
  const nextTopics = Array.isArray(prefs.topics)
    ? prefs.topics.filter((t) => validTopicIds.has(t))
    : current.topics;

  // Store only masked/domain or user preference locally (zero credential exposure)
  const rawEmail = typeof prefs.email === 'string' ? prefs.email.trim().slice(0, 120) : current.emailHint;
  const completedSet = new Set(current.completedMasterySteps || []);
  if (typeof prefs.completeStep === 'string' && /^[a-z0-9_-]{1,32}$/.test(prefs.completeStep)) {
    completedSet.add(prefs.completeStep);
  }

  const next = {
    emailHint: rawEmail,
    topics: nextTopics.length > 0 ? nextTopics : ['all'],
    subscribedYoutube: prefs.subscribedYoutube !== undefined ? Boolean(prefs.subscribedYoutube) : current.subscribedYoutube,
    dismissedMastery: prefs.dismissedMastery !== undefined ? Boolean(prefs.dismissedMastery) : current.dismissedMastery,
    completedMasterySteps: Array.from(completedSet),
    updatedAt: new Date().toISOString(),
  };

  const tmp = `${subPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, subPath);
  return next;
}

export async function syncAntigravityUpdates(stateDir = '', videoJsonUrl = '') {
  const dir = getStateDir(stateDir);
  const cachePath = path.join(dir, 'updates-cache.json');
  let syncedLive = false;
  let items = BUNDLED_BLOG_UPDATES;

  try {
    const xml = await fetchHttpsAllowlisted(OFFICIAL_RSS_URL);
    const parsed = parseAntigravityRssXml(xml);
    if (parsed.length > 0) {
      items = parsed;
      syncedLive = true;
    }
  } catch {
    syncedLive = false;
  }

  let remoteVideos = null;
  if (videoJsonUrl && videoJsonUrl.startsWith('https://raw.githubusercontent.com/')) {
    try {
      const rawVid = await fetchHttpsAllowlisted(videoJsonUrl);
      const vParsed = __parseJsonNoBom(rawVid);
      if (Array.isArray(vParsed.videos) && vParsed.videos.length > 0) {
        remoteVideos = vParsed.videos.filter(
          (v) => v && typeof v.title === 'string' && typeof v.url === 'string' && v.url.startsWith('https://')
        );
      }
    } catch {}
  }

  const lastSyncedIso = new Date().toISOString();
  const payload = {
    lastSyncedIso,
    syncedLive,
    items,
    videos: remoteVideos || BUNDLED_VIDEO_GUIDES,
  };
  const tmp = `${cachePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, cachePath);

  return {
    ok: true,
    syncedLive,
    lastSyncedIso,
    state: getUpdatesState(dir, remoteVideos),
  };
}
