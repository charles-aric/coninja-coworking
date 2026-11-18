// npm run test:pages
// 1. Builds the fixture pages in scripts/fixtures/pages into a temp dir and runs check.mjs on it,
//    then checks the hub pages, footer hub links and "Related pages" blocks in that build.
// 2. Confirms every file in scripts/fixtures/invalid is rejected with the expected message
//    (by the build's validation or by the facts check).
// 3. Unit checks: related links are deterministic, and the src/content slot contract
//    (missing slot, unknown key, markup rules, FAQ JSON-LD, wrong price).
// Nothing is written to dist/, src/pages/ or src/content/.

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validatePage, allowedFacts, factProblems, relatedLinks, fillSlots, slotValueProblems } from './pages.mjs';

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

    // Hubs: built only for sections that have pages
    const read = (f) => fs.readFile(path.join(out, f), 'utf8').catch(() => null);
    const blog = await read('blog/index.html');
    const compare = await read('compare/index.html');
    ok(blog && blog.includes('href="/guide-choosing-a-desk"') && blog.includes('href="/guide-night-shifts"') && !blog.includes('href="/coninja-vs-home-office"'), 'hub /blog/ lists the blog pages only');
    ok(compare && compare.includes('href="/coninja-vs-home-office"'), 'hub /compare/ lists the compare page');
    ok(!(await read('areas/index.html')), 'no /areas/ hub while no page has section "area"');
    ok(blog && /<link rel="canonical" href="https?:\/\/[^"]+\/blog\/">/.test(blog) && blog.includes('"@type": "BreadcrumbList"') && blog.includes('aria-current="page">Guides<'), 'hub has its own canonical and breadcrumb');
    ok(sitemap.includes('/blog/</loc>') && sitemap.includes('/compare/</loc>') && !sitemap.includes('/areas/</loc>'), 'hubs with pages are in the sitemap');
    ok(html.includes('<a href="/blog/">Guides</a>') && html.includes('<a href="/compare/">Compare</a>') && !html.includes('href="/areas/"'), 'footer links to the hubs that exist');

    // Related pages: before the final cta, never itself, at least one money page on blog/compare pages
    const guide = await read('guide-choosing-a-desk.html');
    const block = guide.match(/<h2 class="heading-3">Related pages<\/h2>([\s\S]*?)<\/section>/)?.[1] || '';
    const hrefs = [...block.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    ok(hrefs.length > 0 && hrefs.length <= 4, `related block has 1 to 4 links (${hrefs.join(' ')})`);
    ok(hrefs[0] === '/guide-night-shifts' && !hrefs.includes('/guide-choosing-a-desk'), 'related links: same section first, never the page itself');
    ok(hrefs.some((h) => ['/', '/private-office-islamabad', '/team-office-space-islamabad', '/coworking-space-e-11'].includes(h)), 'blog page links to at least one money page');
    ok(guide.indexOf('Related pages') < guide.indexOf('class="cta-band'), 'related block sits before the final cta');
    const index = await read('index.html');
    ok(!/data-slot|%SLOT%|%FAQ_JSONLD%/.test(index), 'hand-written pages have every slot filled');
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

/* 3. Related links: deterministic and always with a money page */
const money = [
  { path: '/', title: 'Home', description: 'd' },
  { path: '/private-office-islamabad', title: 'Private', description: 'd' },
  { path: '/team-office-space-islamabad', title: 'Team', description: 'd' },
];
const fake = (slug, section) => ({ slug, section, title: slug, description: slug });
const many = [...['a', 'b', 'c', 'd', 'e'].map((x) => fake(`blog-${x}`, 'blog')), fake('area-x', 'area'), fake('svc-y', 'service'), fake('cmp-z', 'compare')];
const r1 = relatedLinks(many, money);
const r2 = relatedLinks([...many].reverse(), money);
ok(JSON.stringify(r1) === JSON.stringify(r2), 'related links do not depend on file order');
ok(Object.entries(r1).every(([slug, links]) => links.length <= 4 && !links.some((l) => l.path === `/${slug}`)), 'related links: at most 4, never the page itself');
ok(many.filter((p) => p.section !== 'service').every((p) => r1[p.slug].some((l) => money.some((m) => m.path === l.path) || l.path === '/svc-y')), 'blog, compare and area pages always get a money page link');
ok(r1['blog-a'].slice(0, 3).map((l) => l.path).join() === '/blog-b,/blog-c,/blog-d' && r1['blog-e'][0].path === '/blog-a', 'same-section links are the next pages in slug order, wrapping round');
ok(r1['svc-y'].map((l) => l.path).join() === '/,/private-office-islamabad,/team-office-space-islamabad', 'service page links to the money pages');

/* 4. Slots: src/content/<page>.json fills data-slot elements in src/<page>.html */
const srcHtml = await fs.readFile(path.join(ROOT, 'src', 'index.html'), 'utf8');
const values = JSON.parse(await fs.readFile(path.join(ROOT, 'src', 'content', 'index.json'), 'utf8'));
const filled = fillSlots(srcHtml, values, 'index');
ok(filled.errors.length === 0, `src/content/index.json fills src/index.html${filled.errors.length ? `: ${filled.errors[0]}` : ''}`);
{
  const visible = [...filled.html.matchAll(/<dt class="title-2">([^<]+)<\/dt>/g)].map((m) => m[1]);
  const ld = JSON.parse(filled.html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1].replaceAll('%SITE_URL%', 'https://x'));
  const faqPage = ld['@graph'].find((g) => g['@type'] === 'FAQPage');
  ok(JSON.stringify(faqPage.mainEntity.map((q) => q.name)) === JSON.stringify(visible), 'FAQ JSON-LD questions are generated from the visible FAQ slots');
  ok(faqPage.mainEntity[0].acceptedAnswer.text.includes('executive private offices start') && !faqPage.mainEntity[0].acceptedAnswer.text.includes('<a'), 'FAQ JSON-LD answers are the slot text without markup');
}
const without = { ...values }; delete without.faq_2_a;
ok(fillSlots(srcHtml, without, 'index').errors.some((e) => e.includes('slot "faq_2_a" has no value')), 'missing slot value fails');
ok(fillSlots(srcHtml, { ...values, made_up_key: 'Text' }, 'index').errors.some((e) => e.includes('key "made_up_key" has no data-slot')), 'unknown slot key fails');
ok(fillSlots(srcHtml, { ...values, faq_2_a: '  ' }, 'index').errors.some((e) => e.includes('slot "faq_2_a" has no value')), 'empty slot value fails');
ok(slotValueProblems('lead', 'Plain <b>bold</b>').some((e) => e.includes('plain text but contains HTML')), 'plain slot with markup fails');
ok(slotValueProblems('x__html', 'See <a href="https://example.com">this</a>').some((e) => e.includes('must be an internal path')), '__html slot with an outside link fails');
ok(slotValueProblems('x__html', '<script>x</script>').some((e) => e.includes('tag not allowed')), '__html slot with a disallowed tag fails');
ok(slotValueProblems('x__html', 'A <a class="violet" href="/terms">link</a>,<br><b>bold</b>').length === 0, '__html slot with allowed markup passes');
ok(factProblems(values, allowed, 'src/content/index.json').length === 0, 'src/content/index.json passes the facts check');
ok(factProblems({ ...values, faq_2_a: 'Yes. A day pass is PKR 1,500 per day.' }, allowed, 'src/content/index.json').some((e) => e.includes('price "PKR 1,500" is not in site.facts.json')), 'wrong price in a content JSON fails the facts check');

console.log(failures.length ? `\n${failures.length} page test(s) failed.` : '\nAll page tests passed.');
process.exit(failures.length ? 1 : 0);
