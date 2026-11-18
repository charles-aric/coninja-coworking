// Pre-deploy checks on dist/: run `npm run build` first, then `npm run check`.
// Fails (exit 1) on broken internal links or anchors, missing alt text, missing
// SEO tags, invalid JSON-LD, stray tel: links, unresolved build tokens or
// sitemap URLs that don't map to a file. For content pages (src/pages/*.json) and
// hub pages (/blog/, /compare/, /areas/) it also fails when a page is missing from
// dist/ or the sitemap. The facts check fails on any price or opening hours in
// src/pages/*.json or src/content/*.json that site.facts.json does not contain,
// and on any price or hour at all in the hub wording.
// OUT_DIR, PAGES_DIR and CONTENT_DIR override dist/, src/pages/ and src/content/
// (used by `npm run test:pages`).

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPages, allowedFacts, factProblems, extractFacts, hubsFor, HUBS } from './pages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = process.env.OUT_DIR ? path.resolve(process.env.OUT_DIR) : path.join(ROOT, 'dist');
const PAGES_DIR = process.env.PAGES_DIR ? path.resolve(process.env.PAGES_DIR) : path.join(ROOT, 'src', 'pages');
const CONTENT_DIR = process.env.CONTENT_DIR ? path.resolve(process.env.CONTENT_DIR) : path.join(ROOT, 'src', 'content');
const config = JSON.parse(await fs.readFile(path.join(ROOT, 'site.config.json'), 'utf8'));
const errors = [];
const warn = [];
const exists = (p) => fs.access(p).then(() => true, () => false);

const pages = {};
for (const p of config.pages) pages[p.file] = await fs.readFile(path.join(DIST, p.file), 'utf8');

// Content pages written by the automation
const contentPages = await loadPages(PAGES_DIR);
for (const { file, data } of contentPages) {
  const out = `${data.slug}.html`;
  if (await exists(path.join(DIST, out))) pages[out] = await fs.readFile(path.join(DIST, out), 'utf8');
  else errors.push(`${file}: ${out} is missing from the build (run npm run build)`);
}

// Hub pages: one per section that has at least one JSON page
const hubs = hubsFor(contentPages.map(({ data }) => data));
for (const hub of hubs) {
  if (await exists(path.join(DIST, hub.file))) pages[hub.file] = await fs.readFile(path.join(DIST, hub.file), 'utf8');
  else errors.push(`${hub.path}: ${hub.file} is missing from the build (run npm run build)`);
}
for (const hub of Object.values(HUBS)) {
  if (!hubs.some((h) => h.slug === hub.slug) && await exists(path.join(DIST, hub.slug, 'index.html'))) errors.push(`/${hub.slug}/ is built but has no pages`);
}

const idsIn = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const fileForPath = (p) => {
  if (p === '/' || p === '') return 'index.html';
  if (p.endsWith('/')) return `${p.replace(/^\//, '')}index.html`;
  const clean = p.replace(/^\//, '');
  return clean.endsWith('.html') ? clean : `${clean}.html`;
};

for (const [file, html] of Object.entries(pages)) {
  const where = (msg) => `${file}: ${msg}`;
  const isIndexable = !/name="robots" content="noindex/.test(html);

  // Build tokens
  if (/%SITE_URL%|<!-- include:/.test(html)) errors.push(where('unresolved build token'));

  // Head essentials
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] || '';
  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1] || '';
  if (!title) errors.push(where('missing <title>'));
  if (title.length > 65) warn.push(where(`title is ${title.length} chars (aim for 60 or fewer)`));
  if (!desc) errors.push(where('missing meta description'));
  if (desc.length > 160) warn.push(where(`meta description is ${desc.length} chars (aim for 155 or fewer)`));
  if (isIndexable && !/<link rel="canonical" href="https?:\/\/[^"]+"/.test(html)) errors.push(where('missing absolute canonical'));
  if (!/<html lang="en"/.test(html)) errors.push(where('missing lang'));
  const h1s = (html.match(/<h1[\s>]/g) || []).length;
  if (h1s !== 1) errors.push(where(`expected exactly one <h1>, found ${h1s}`));

  // Images
  for (const m of html.matchAll(/<img\s[^>]*>/g)) {
    const tag = m[0];
    if (!/\salt="/.test(tag)) errors.push(where(`img without alt: ${tag.slice(0, 80)}`));
    if (!/\swidth="\d+"/.test(tag) || !/\sheight="\d+"/.test(tag)) {
      if (!/src="data:,"/.test(tag)) warn.push(where(`img without width/height: ${tag.slice(0, 80)}`));
    }
  }

  // Phone links: WhatsApp only
  if (/href="tel:/.test(html)) errors.push(where('tel: link found (CoNinja is WhatsApp only)'));

  // External links opened in a new tab must not leak window.opener
  for (const m of html.matchAll(/<a\s[^>]*target="_blank"[^>]*>/g)) {
    if (!/rel="[^"]*noopener/.test(m[0])) errors.push(where(`target=_blank without rel=noopener: ${m[0].slice(0, 80)}`));
  }

  // JSON-LD
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch (e) { errors.push(where(`invalid JSON-LD: ${e.message}`)); }
  }

  // Internal links and anchors
  for (const m of html.matchAll(/\shref="([^"]+)"/g)) {
    const href = m[1];
    if (/^(https?:|mailto:|data:)/.test(href)) continue;
    if (href.startsWith('#')) {
      if (href.length > 1 && !idsIn(html).has(href.slice(1))) errors.push(where(`missing anchor ${href}`));
      continue;
    }
    const [p, hashPart] = href.split('#');
    const pathOnly = p.split('?')[0];
    if (pathOnly.startsWith('/assets/') || /\.(webmanifest|png|svg|css|js|woff2|jpg|avif|webp)$/.test(pathOnly)) {
      if (!(await exists(path.join(DIST, pathOnly)))) errors.push(where(`missing file ${pathOnly}`));
      continue;
    }
    const target = fileForPath(pathOnly);
    if (!pages[target]) { errors.push(where(`link to unknown page ${href}`)); continue; }
    if (hashPart && !idsIn(pages[target]).has(hashPart)) errors.push(where(`link to missing anchor ${href}`));
  }

  // Image sources referenced in srcset/src exist
  for (const m of html.matchAll(/\s(?:src|srcset|imagesrcset)="([^"]+)"/g)) {
    for (const part of m[1].split(',')) {
      const url = part.trim().split(/\s+/)[0];
      if (url.startsWith('/') && !(await exists(path.join(DIST, url)))) errors.push(where(`missing asset ${url}`));
    }
  }
}

// Sitemap + robots
const sitemap = await fs.readFile(path.join(DIST, 'sitemap.xml'), 'utf8');
for (const m of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const u = new URL(m[1]);
  if (!pages[fileForPath(u.pathname)]) errors.push(`sitemap.xml: ${m[1]} has no page`);
}
for (const { file, data } of contentPages) {
  if (!sitemap.includes(`/${data.slug}</loc>`)) errors.push(`${file}: /${data.slug} is not in sitemap.xml`);
}
for (const hub of hubs) {
  if (!sitemap.includes(`${hub.path}</loc>`)) errors.push(`${hub.path} is not in sitemap.xml`);
}

// Facts: prices and hours on JSON pages and in the hand-written pages' copy must come from site.facts.json
const allowed = allowedFacts(JSON.parse(await fs.readFile(path.join(ROOT, 'site.facts.json'), 'utf8')));
for (const { file, data } of contentPages) errors.push(...factProblems(data, allowed, file));
const contentFiles = await loadPages(CONTENT_DIR);
for (const { file, data } of contentFiles) errors.push(...factProblems(data, allowed, `src/content/${file}`));
// Hub wording states no price or hour at all
for (const hub of Object.values(HUBS)) {
  const found = extractFacts(Object.values(hub).join('\n'));
  for (const map of Object.values(found)) for (const raw of map.values()) errors.push(`hub /${hub.slug}/: "${raw}" is a price or hour; hub wording must not state one`);
}

const robots = await fs.readFile(path.join(DIST, 'robots.txt'), 'utf8');
if (/Disallow: \/\s*$/m.test(robots)) warn.push('robots.txt blocks all crawlers (expected only for localhost and PREVIEW=1 builds)');
for (const f of ['site.webmanifest', '404.html', 'sitemap.xml', 'robots.txt']) {
  if (!(await exists(path.join(DIST, f)))) errors.push(`missing ${f}`);
}
const hostConfigs = [];
for (const f of ['_headers', 'vercel.json', '.htaccess']) if (await exists(path.join(DIST, f))) hostConfigs.push(f);
if (!hostConfigs.length) errors.push('no host config (_headers, vercel.json or .htaccess): security headers would be missing');

for (const w of warn) console.log(`  warn  ${w}`);
for (const e of errors) console.log(`  FAIL  ${e}`);
console.log(errors.length ? `\n${errors.length} problem(s) found.` : `\nAll checks passed across ${Object.keys(pages).length} pages${warn.length ? ` (${warn.length} warning(s))` : ''}.`);
process.exit(errors.length ? 1 : 0);
