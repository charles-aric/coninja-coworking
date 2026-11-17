// npm run test:pages
// 1. Builds the fixture page in scripts/fixtures/pages into a temp dir and runs check.mjs on it.
// 2. Confirms every file in scripts/fixtures/invalid is rejected with the expected message
//    (by the build's validation or by the facts check).
// Nothing is written to dist/ or src/pages/.

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validatePage, allowedFacts, factProblems } from './pages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(ROOT, 'scripts', 'fixtures');
const failures = [];
const ok = (cond, msg) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${msg}`); if (!cond) failures.push(msg); };

/* 1. Valid fixture: full build + checks in a temp dir */
const out = await fs.mkdtemp(path.join(os.tmpdir(), 'coninja-pages-'));
try {
  const env = { ...process.env, PAGES_DIR: path.join(FIXTURES, 'pages'), OUT_DIR: out, PREVIEW: '' };
  const run = (script) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', script)], { cwd: ROOT, env, encoding: 'utf8' });

  const build = run('build.mjs');
  ok(build.status === 0, 'fixture builds');
  if (build.status !== 0) console.log(build.stdout + build.stderr);
  else {
    const check = run('check.mjs');
    ok(check.status === 0, 'check.mjs passes on the fixture build');
    if (check.status !== 0) console.log(check.stdout + check.stderr);

    const html = await fs.readFile(path.join(out, 'coworking-space-e-11.html'), 'utf8');
    const sitemap = await fs.readFile(path.join(out, 'sitemap.xml'), 'utf8');
    ok(sitemap.includes('/coworking-space-e-11</loc>'), 'page is in the sitemap');
    ok(/<link rel="canonical" href="https?:\/\/[^"]+\/coworking-space-e-11">/.test(html), 'canonical URL');
    ok(html.includes('&lt;b&gt;Markup in text is escaped&lt;/b&gt;') && !html.includes('<b>Markup'), 'page text is escaped');
    ok(/<picture><source type="image\/avif" srcset="\/assets\/img\/coworking-desks-/.test(html), 'hero photo is a responsive <picture>');
    for (const type of ['BreadcrumbList', 'Service', 'FAQPage']) ok(html.includes(`"@type": "${type}"`), `${type} JSON-LD`);
    for (const cls of ['lp-hero', 'facility-list', 'compare', 'faq__list', 'cta-band']) ok(html.includes(`class="${cls}`), `section markup: ${cls}`);
  }
} finally {
  await fs.rm(out, { recursive: true, force: true });
}

/* 2. Invalid fixtures must be rejected */
const originals = path.join(ROOT, 'src', 'assets', 'img', 'originals');
const ctx = {
  images: (await fs.readdir(originals)).map((f) => path.basename(f, path.extname(f))),
  icons: [...(await fs.readFile(path.join(ROOT, 'src', 'partials', 'sprite.html'), 'utf8')).matchAll(/id="i-([a-z0-9-]+)"/g)].map((m) => m[1]),
  reserved: [],
};
const allowed = allowedFacts(JSON.parse(await fs.readFile(path.join(ROOT, 'site.facts.json'), 'utf8')));
for (const name of (await fs.readdir(path.join(FIXTURES, 'invalid'))).sort()) {
  const { _expect, page } = JSON.parse(await fs.readFile(path.join(FIXTURES, 'invalid', name), 'utf8'));
  const file = `${page.slug}.json`;
  const shape = validatePage(page, { ...ctx, file });
  const problems = _expect.stage === 'build' ? shape : factProblems(page, allowed, file);
  if (_expect.stage === 'check') ok(shape.length === 0, `${name}: shape is valid, so only the facts check can catch it`);
  ok(problems.some((p) => p.includes(_expect.message)), `${name}: rejected by ${_expect.stage} with "${_expect.message}"`);
}

console.log(failures.length ? `\n${failures.length} page test(s) failed.` : '\nAll page tests passed.');
process.exit(failures.length ? 1 : 0);
