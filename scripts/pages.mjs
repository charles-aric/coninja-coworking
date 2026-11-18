// Content pages: src/pages/<slug>.json → a landing page in the site's existing markup.
// Used by build.mjs (validate + render) and check.mjs (facts check).
// The JSON shape is a contract with the system that writes these files; see content.schema.json.

import fs from 'node:fs/promises';
import path from 'node:path';

export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;
export const SECTION_TYPES = ['features', 'text', 'comparison', 'faq', 'cta'];
// Page sections (the optional top-level "section" key). "service" is the default.
export const PAGE_SECTIONS = ['service', 'compare', 'blog', 'area'];
export const sectionOf = (page) => page.section || 'service';

const WHATSAPP = 'https://wa.me/923275393390';
const WHATSAPP_TEXT = "Hi%20CoNinja%2C%20I'd%20like%20to%20know%20more%20about%20your%20coworking%20space.";
const HERO_SIZES = '(max-width: 960px) calc(100vw - 48px), 590px';

// Alt text for the photos in src/assets/img/originals, as already used on the site.
// A page can override it with the optional "hero_alt" key.
const DEFAULT_ALT = {
  'coworking-desks': 'Coworking desks with white mesh back chairs at CoNinja, E-11 Islamabad',
  'team-office': 'Team office space in E-11 Islamabad with rows of desks and chairs',
  'executive-cabin': 'Executive private office for rent in E-11 Islamabad, with dark walls, gold trim, a desk and a whiteboard',
  'private-cabin': 'Private cabin with a single desk and blue blinds',
  corridor: 'Corridor lined with frosted glass private offices',
  lounge: 'Lounge at CoNinja coworking space in E-11 Islamabad, with green sofas and glass walled offices',
  reception: 'Reception desk with a marble front and a wood slat wall at CoNinja',
  'meeting-corner': 'Meeting corner with a round table and red and green chairs',
  'table-tennis': 'Table tennis table beside a hanging swing chair at the E-11 coworking space',
};

export const esc = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/** Read every *.json in dir (missing dir = no pages). Returns [{ file, data }]. */
export async function loadPages(dir) {
  let names;
  try { names = await fs.readdir(dir); } catch { return []; }
  const out = [];
  for (const name of names.filter((n) => n.endsWith('.json')).sort()) {
    const file = path.join(dir, name);
    let data;
    try { data = JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) {
      throw new Error(`${name}: not valid JSON (${e.message})`);
    }
    out.push({ file: name, data });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Validation                                                         */
/* ------------------------------------------------------------------ */
const isText = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * Returns a list of problems (empty when the page is valid).
 * ctx: { file, images: string[] (names in originals, no extension), icons: string[], reserved: string[] }
 */
export function validatePage(page, ctx) {
  const errs = [];
  const bad = (msg) => errs.push(`${ctx.file}: ${msg}`);
  if (!page || typeof page !== 'object' || Array.isArray(page)) return [`${ctx.file}: must be a JSON object`];

  for (const key of ['slug', 'title', 'description', 'h1', 'lead', 'breadcrumb', 'hero_image', 'service_name', 'service_type']) {
    if (!(key in page)) bad(`missing required key "${key}"`);
    else if (!isText(page[key])) bad(`"${key}" must be a non-empty string`);
  }
  const known = ['slug', 'section', 'title', 'description', 'h1', 'lead', 'breadcrumb', 'hero_image', 'hero_alt', 'service_name', 'service_type', 'sections'];
  for (const key of Object.keys(page)) if (!known.includes(key)) bad(`unknown key "${key}"`);
  if ('hero_alt' in page && !isText(page.hero_alt)) bad('"hero_alt" must be a non-empty string when present');
  if ('section' in page && !PAGE_SECTIONS.includes(page.section)) bad(`unknown section "${page.section}" (allowed: ${PAGE_SECTIONS.join(', ')})`);

  if (isText(page.slug)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.slug)) bad(`slug "${page.slug}" must be lowercase letters, digits and single hyphens`);
    else if (ctx.file !== `${page.slug}.json`) bad(`file name must match the slug (expected ${page.slug}.json)`);
    if ((ctx.reserved || []).includes(page.slug)) bad(`slug "${page.slug}" is already used by an existing page`);
    if (Object.values(HUBS).some((h) => h.slug === page.slug)) bad(`slug "${page.slug}" is reserved for the /${page.slug}/ hub page`);
  }
  if (isText(page.title) && page.title.length > TITLE_MAX) bad(`title is ${page.title.length} chars (max ${TITLE_MAX})`);
  if (isText(page.description) && page.description.length > DESCRIPTION_MAX) bad(`description is ${page.description.length} chars (max ${DESCRIPTION_MAX})`);
  if (isText(page.hero_image) && !ctx.images.includes(page.hero_image)) {
    bad(`unknown image "${page.hero_image}" (hero_image must be one of: ${ctx.images.join(', ')})`);
  }

  if (!('sections' in page)) bad('missing required key "sections"');
  else if (!Array.isArray(page.sections) || !page.sections.length) bad('"sections" must be a non-empty array');
  else page.sections.forEach((s, i) => {
    const at = `sections[${i}]`;
    if (!s || typeof s !== 'object' || Array.isArray(s)) return bad(`${at} must be an object`);
    if (!('type' in s)) return bad(`${at}: missing required key "type"`);
    if (!SECTION_TYPES.includes(s.type)) return bad(`${at}: unknown section type "${s.type}" (allowed: ${SECTION_TYPES.join(', ')})`);
    const need = (key) => {
      if (!(key in s)) { bad(`${at} (${s.type}): missing required key "${key}"`); return false; }
      return true;
    };
    const text = (obj, key, where) => {
      if (!(key in obj)) bad(`${where}: missing required key "${key}"`);
      else if (!isText(obj[key])) bad(`${where}: "${key}" must be a non-empty string`);
    };
    const list = (key) => {
      if (!need(key)) return [];
      if (!Array.isArray(s[key]) || !s[key].length) { bad(`${at} (${s.type}): "${key}" must be a non-empty array`); return []; }
      return s[key];
    };
    const allowed = { features: ['items'], text: ['paragraphs'], comparison: ['columns', 'rows'], faq: ['items'], cta: ['text'] }[s.type];
    for (const key of Object.keys(s)) {
      if (!['type', 'heading', ...(s.type === 'cta' ? [] : ['label']), ...allowed].includes(key)) bad(`${at} (${s.type}): unknown key "${key}"`);
    }
    text(s, 'heading', `${at} (${s.type})`);
    if ('label' in s && !isText(s.label)) bad(`${at} (${s.type}): "label" must be a non-empty string when present`);

    if (s.type === 'features') list('items').forEach((it, j) => {
      const w = `${at}.items[${j}]`;
      if (!it || typeof it !== 'object') return bad(`${w} must be an object`);
      text(it, 'title', w);
      text(it, 'text', w);
      for (const key of Object.keys(it)) if (!['title', 'text', 'icon'].includes(key)) bad(`${w}: unknown key "${key}"`);
      if ('icon' in it && !(ctx.icons || []).includes(it.icon)) bad(`${w}: unknown icon "${it.icon}" (allowed: ${(ctx.icons || []).join(', ')})`);
    });
    if (s.type === 'text') list('paragraphs').forEach((p, j) => {
      if (!isText(p)) bad(`${at}.paragraphs[${j}] must be a non-empty string`);
    });
    if (s.type === 'comparison') {
      const cols = list('columns');
      if (cols.length && (cols.length !== 2 || !cols.every(isText))) bad(`${at} (comparison): "columns" must be exactly two non-empty strings`);
      list('rows').forEach((r, j) => {
        if (!Array.isArray(r) || r.length !== 3 || !r.every(isText)) bad(`${at}.rows[${j}] must be ["label", "first column", "second column"]`);
      });
    }
    if (s.type === 'faq') list('items').forEach((it, j) => {
      const w = `${at}.items[${j}]`;
      if (!it || typeof it !== 'object') return bad(`${w} must be an object`);
      text(it, 'q', w);
      text(it, 'a', w);
      for (const key of Object.keys(it)) if (!['q', 'a'].includes(key)) bad(`${w}: unknown key "${key}"`);
    });
    if (s.type === 'cta') text(s, 'text', `${at} (cta)`);
  });
  return errs;
}

/* ------------------------------------------------------------------ */
/* Rendering (source HTML; build.mjs resolves includes, %SITE_URL%,   */
/* responsive images and minifies it like any other page)             */
/* ------------------------------------------------------------------ */
const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const head = (s, cls, fallbackLabel) => {
  const label = s.label || fallbackLabel;
  return `${label ? `<p class="label caption-1">${esc(label)}</p>\n          ` : ''}<h2 class="${cls}">${esc(s.heading)}</h2>`;
};

const renderers = {
  features: (s) => `
    <section class="section">
      <div class="container">
        <div class="section-head reveal">
          ${head(s, 'heading-2')}
        </div>
        <ul class="facility-list">
${s.items.map((it) => `          <li class="facility reveal"><span class="facility__icon">${icon(it.icon || 'check')}</span><div><h3 class="title-2">${esc(it.title)}</h3><p class="body-6 muted">${esc(it.text)}</p></div></li>`).join('\n')}
        </ul>
      </div>
    </section>`,

  text: (s) => `
    <section class="section">
      <div class="container">
        <div class="section-head reveal">
          ${head(s, 'heading-2')}
        </div>
        <div class="reveal">
${s.paragraphs.map((p, i) => `          <p class="body-3 muted measure${i ? ' mt-200' : ''}">${esc(p)}</p>`).join('\n')}
        </div>
      </div>
    </section>`,

  comparison: (s) => `
    <section class="section">
      <div class="container">
        <div class="section-head reveal">
          ${head(s, 'heading-2', 'Compare')}
        </div>
        <div class="compare-wrap reveal">
          <table class="compare body-6">
            <thead><tr><th scope="col" class="title-4">Item</th>${s.columns.map((c) => `<th scope="col" class="title-4">${esc(c)}</th>`).join('')}</tr></thead>
            <tbody>
${s.rows.map((r) => `              <tr><th scope="row" class="title-4">${esc(r[0])}</th><td>${icon('check')}${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('\n')}
            </tbody>
          </table>
        </div>
      </div>
    </section>`,

  faq: (s) => `
    <section class="section">
      <div class="container faq">
        <div class="faq__head reveal">
          ${head(s, 'heading-3', 'FAQ')}
        </div>
        <dl class="faq__list">
${s.items.map((it) => `          <div class="faq__item reveal"><dt class="title-2">${esc(it.q)}</dt><dd class="body-3 muted">${esc(it.a)}</dd></div>`).join('\n')}
        </dl>
      </div>
    </section>`,

  cta: (s) => `
    <section class="section">
      <div class="container">
        <div class="cta-band reveal">
          <div>
            <h2 class="heading-4">${esc(s.heading)}</h2>
            <p class="body-3 muted mt-200">${esc(s.text)}</p>
          </div>
          <div class="cta-band__actions">
            <a class="btn btn--light btn--lg button-md" href="/#tour">Book a free tour</a>
            <a class="link body-5" href="/#spaces">Compare all prices${icon('arrow-right')}</a>
          </div>
        </div>
      </div>
    </section>`,
};

/**
 * page: a validated page object.
 * image: { width, height, largest } for the hero photo (largest = widest generated JPEG width).
 */
export function renderPage(page, image, related = []) {
  const url = `%SITE_URL%/${page.slug}`;
  const src = `/assets/img/${page.hero_image}.jpg`;
  const alt = page.hero_alt || DEFAULT_ALT[page.hero_image] || `${page.service_name} at CoNinja Coworking, E-11/3 Islamabad`;
  const faqs = page.sections.filter((s) => s.type === 'faq').flatMap((s) => s.items);

  const graph = [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: '%SITE_URL%/' },
        { '@type': 'ListItem', position: 2, name: page.breadcrumb, item: url },
      ],
    },
    {
      '@type': 'Service',
      name: page.service_name,
      serviceType: page.service_type,
      url,
      image: `%SITE_URL%/assets/img/${page.hero_image}-${image.largest}.jpg`,
      areaServed: { '@type': 'City', name: 'Islamabad' },
      provider: {
        '@type': 'LocalBusiness',
        '@id': '%SITE_URL%/#business',
        name: 'CoNinja Coworking',
        telephone: '+923275393390',
        address: { '@type': 'PostalAddress', streetAddress: '1st Floor, Professional Arcade, MPCHS E-11/3', addressLocality: 'Islamabad', postalCode: '44000', addressCountry: 'PK' },
      },
    },
    ...(faqs.length ? [{
      '@type': 'FAQPage',
      mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    }] : []),
  ];
  // "<" is escaped so page text can never close the script element
  const jsonLd = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(page.title)}</title>
  <meta name="description" content="${esc(page.description)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${esc(page.title)}">
  <meta property="og:description" content="${esc(page.description)}">
  <meta name="twitter:title" content="${esc(page.title)}">
  <meta name="twitter:description" content="${esc(page.description)}">
<!-- include:head -->
  <link rel="preload" as="image" href="${src}" data-sizes="${HERO_SIZES}" fetchpriority="high">

  <script type="application/ld+json">
${jsonLd}
  </script>
</head>
<body>
<!-- include:sprite -->
<!-- include:nav -->

  <main id="main">
    <section class="lp-hero">
      <div class="container lp-hero__grid">
        <div>
          <nav aria-label="Breadcrumb"><ol class="crumbs caption-2"><li><a href="/">Home</a></li><li aria-current="page">${esc(page.breadcrumb)}</li></ol></nav>
          <h1 class="heading-1">${esc(page.h1)}</h1>
          <p class="lp-hero__sub body-3 muted">${esc(page.lead)}</p>
          <div class="hero__cta">
            <a class="btn btn--lg button-md" href="/#tour">Book a free tour</a>
            <a class="link body-5" href="${WHATSAPP}?text=${WHATSAPP_TEXT}" target="_blank" rel="noopener">Or WhatsApp <span class="num nowrap">0327 5393390</span>${icon('arrow-right')}</a>
          </div>
        </div>
        <figure class="lp-hero__photo">
          <img src="${src}" data-sizes="${HERO_SIZES}" alt="${esc(alt)}" width="${image.width}" height="${image.height}" fetchpriority="high" decoding="async">
        </figure>
      </div>
    </section>
${withRelated(page.sections.map((s) => renderers[s.type](s)), page.sections, related).join('\n')}
  </main>

<!-- include:footer -->
</body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* Facts check: prices and hours in a page must exist in site.facts.json */
/* ------------------------------------------------------------------ */
const strings = (v, out = []) => {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
};

const CLOCK = String.raw`(?:\d{1,2}(?::\d{2})?\s?[ap]\.?m\.?(?![a-z])|\b(?:[01]?\d|2[0-3]):[0-5]\d\b|\bmidnight\b|\bnoon\b)`;
const normTime = (raw) => {
  const t = raw.toLowerCase().replace(/[\s.]/g, '');
  if (t === 'midnight' || t === 'noon') return t;
  let m = t.match(/^(\d{1,2})(?::(\d{2}))?([ap])m$/);
  let h; let min; let ap;
  if (m) { h = Number(m[1]); min = m[2] || '00'; ap = m[3]; } else {
    m = t.match(/^(\d{1,2}):(\d{2})$/);
    const h24 = Number(m[1]);
    min = m[2];
    ap = h24 < 12 ? 'a' : 'p';
    h = h24 % 12 || 12;
  }
  if (h === 12 && min === '00') return ap === 'a' ? 'midnight' : 'noon';
  return `${h}${min === '00' ? '' : `:${min}`}${ap}m`;
};

/**
 * Pulls the checkable tokens out of a piece of text:
 *   amounts  PKR / Rs / rupee amounts and any number written with thousands commas  → "14000"
 *   ranges   "12 PM to 12:30 AM", "12:00-00:30"                                     → "noon-12:30am"
 *   times    every clock time, including the two ends of a range                    → "9pm"
 *   hours    "24 hours", "1 to 3 hours", "24/7"                                     → "24h", "1-3h", "24/7"
 */
export function extractFacts(text) {
  const out = { amounts: new Map(), ranges: new Map(), times: new Map(), hours: new Map() };
  const add = (map, key, raw) => { if (!map.has(key)) map.set(key, raw.trim()); };

  const num = String.raw`(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s?(k\b)?`;
  for (const re of [
    new RegExp(String.raw`(?:PKR|Rs\.?|₨)\s?${num}`, 'gi'),
    new RegExp(String.raw`${num}\s?(?:PKR|rupees?)\b`, 'gi'),
    /(\d{1,3}(?:,\d{3})+)()/g,
  ]) {
    for (const m of text.matchAll(re)) add(out.amounts, String(Number(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1)), m[0]);
  }

  const rangeRe = new RegExp(String.raw`(${CLOCK})\s?(?:to|until|till|-|–|—)\s?(${CLOCK})`, 'gi');
  for (const m of text.matchAll(rangeRe)) add(out.ranges, `${normTime(m[1])}-${normTime(m[2])}`, m[0]);
  for (const m of text.matchAll(new RegExp(CLOCK, 'gi'))) add(out.times, normTime(m[0]), m[0]);

  for (const m of text.matchAll(/\b(\d+)(?:\s?(?:to|-|–)\s?(\d+))?[\s-]?(?:hours?|hrs?)\b/gi)) {
    add(out.hours, `${m[1]}${m[2] ? `-${m[2]}` : ''}h`, m[0]);
  }
  for (const m of text.matchAll(/\b24\s?\/\s?7\b/g)) add(out.hours, '24/7', m[0]);
  return out;
}

/** Everything site.facts.json allows. The "conflicts" block is not a source of truth, so it is skipped. */
export function allowedFacts(facts) {
  const { conflicts, ...rest } = facts;
  return extractFacts(strings(rest).join('\n'));
}

/** Problems for one JSON page: any price or hours in its text that site.facts.json does not state. */
export function factProblems(page, allowed, file) {
  const found = extractFacts(strings(page).join('\n'));
  const errs = [];
  const say = (kind, map, okMap) => {
    for (const [key, raw] of map) {
      if (!okMap.has(key)) errs.push(`${file}: ${kind} "${raw}" is not in site.facts.json`);
    }
  };
  say('price', found.amounts, allowed.amounts);
  say('time range', found.ranges, allowed.ranges);
  say('time', found.times, allowed.times);
  say('hours', found.hours, allowed.hours);
  return errs;
}

/* ------------------------------------------------------------------ */
/* Related pages: an automatic link block on every JSON page          */
/* ------------------------------------------------------------------ */
export const RELATED_MAX = 4;
// "Team Office Space in Islamabad | PKR 14,000 per Seat" -> "Team Office Space in Islamabad"
export const shortTitle = (t) => t.replace(/\s+\|.*$/, '');

/** A link card for a JSON page: { path, title, description }. */
export const linkFor = (page) => ({ path: `/${page.slug}`, title: shortTitle(page.title), description: page.description });

/**
 * Related links for every JSON page, keyed by slug. Deterministic: depends only on the slugs, never on file order.
 * pages: validated JSON pages. money: the hand-written money pages as [{ path, title, description }], in order.
 * Order: the next pages of the same section in slug order (wrapping round, so links spread across the section),
 * then the money pages (money, then JSON pages with section "service"). Never the page itself.
 * Blog, compare and area pages always keep at least one money page link.
 */
export function relatedLinks(pages, money) {
  const sorted = [...pages].sort((a, b) => a.slug.localeCompare(b.slug));
  const moneyLinks = [...money, ...sorted.filter((p) => sectionOf(p) === 'service').map(linkFor)];
  const out = {};
  for (const page of sorted) {
    const section = sectionOf(page);
    const peers = sorted.filter((p) => sectionOf(p) === section);
    const i = peers.indexOf(page);
    const next = [...peers.slice(i + 1), ...peers.slice(0, i)].map(linkFor);
    const sameMax = section === 'service' ? RELATED_MAX : RELATED_MAX - 1;
    const picked = [];
    const add = (l) => { if (picked.length < RELATED_MAX && l.path !== `/${page.slug}` && !picked.some((x) => x.path === l.path)) picked.push(l); };
    next.slice(0, sameMax).forEach(add);
    moneyLinks.forEach(add);
    out[page.slug] = picked;
  }
  return out;
}

const linkCards = (links) => `
        <div class="extras">
${links.map((l) => `          <article class="extra reveal">
            <h3 class="heading-6"><a class="link--ink" href="${esc(l.path)}">${esc(l.title)}</a></h3>
            <p class="body-6 muted">${esc(l.description)}</p>
          </article>`).join('\n')}
        </div>`;

const renderRelated = (links) => `
    <section class="section">
      <div class="container">
        <div class="section-head reveal">
          <h2 class="heading-3">Related pages</h2>
        </div>${linkCards(links)}
      </div>
    </section>`;

/** Inserts the related block before the final cta section (or at the end when the page has none). */
function withRelated(rendered, sections, related) {
  if (!related.length) return rendered;
  const at = sections.at(-1)?.type === 'cta' ? rendered.length - 1 : rendered.length;
  return [...rendered.slice(0, at), renderRelated(related), ...rendered.slice(at)];
}

/* ------------------------------------------------------------------ */
/* Hub pages: /blog/, /compare/ and /areas/, built from JSON pages    */
/* ------------------------------------------------------------------ */
// Hub wording may not state a price or an hour (npm run check runs the facts check on it).
export const HUBS = {
  blog: {
    slug: 'blog',
    label: 'Guides',
    title: 'Coworking Guides for Islamabad | CoNinja Coworking',
    description: 'Guides from CoNinja Coworking in E-11/3 for freelancers, remote workers and teams choosing a coworking space or office in Islamabad.',
    h1: 'Guides to coworking and office space in Islamabad',
    lead: 'Practical guides for freelancers, remote workers and teams choosing where to work in Islamabad, from the team at CoNinja Coworking in E-11/3.',
    heading: 'All guides',
    hero_image: 'lounge',
  },
  compare: {
    slug: 'compare',
    label: 'Compare',
    title: 'CoNinja Compared With Other Workspaces in Islamabad',
    description: 'How CoNinja Coworking in E-11/3 compares with other coworking spaces and office options in Islamabad, with dates on every outside detail.',
    h1: 'CoNinja compared with other workspaces in Islamabad',
    lead: 'Each page sets CoNinja’s published details beside another coworking space or office option. Details about other businesses come from their own pages, with the date we checked them.',
    heading: 'All comparisons',
    hero_image: 'coworking-desks',
  },
  area: {
    slug: 'areas',
    label: 'Areas',
    title: 'Coworking Near Your Sector in Islamabad | CoNinja',
    description: 'Pages for people who live or work near E-11/3 in Islamabad and want a desk or office at CoNinja Coworking, Professional Arcade.',
    h1: 'Coworking near your sector in Islamabad',
    lead: 'CoNinja Coworking is at Professional Arcade, E-11/3. These pages are for people who live or work in nearby sectors and want a desk or office close by.',
    heading: 'All areas',
    hero_image: 'corridor',
  },
};
// Footer order
export const HUB_ORDER = ['blog', 'compare', 'area'];

/** Hubs that have at least one page: [{ section, ...HUBS[section], path, file, pages }] in footer order. */
export function hubsFor(pages) {
  return HUB_ORDER.map((section) => ({
    section,
    ...HUBS[section],
    path: `/${HUBS[section].slug}/`,
    file: `${HUBS[section].slug}/index.html`,
    pages: pages.filter((p) => sectionOf(p) === section).sort((a, b) => a.slug.localeCompare(b.slug)),
  })).filter((h) => h.pages.length);
}

/** The footer links for the hubs that exist (empty string when there are none). */
export const hubFooterLinks = (hubs) => hubs.map((h) => `<a href="${h.path}">${esc(h.label)}</a>`).join('\n          ');

/** Source HTML for one hub page. image: { width, height, largest } for its hero photo. */
export function renderHub(hub, image) {
  const url = `%SITE_URL%${hub.path}`;
  const src = `/assets/img/${hub.hero_image}.jpg`;
  const links = hub.pages.map(linkFor);
  const graph = [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: '%SITE_URL%/' },
        { '@type': 'ListItem', position: 2, name: hub.label, item: url },
      ],
    },
    {
      '@type': 'CollectionPage',
      name: hub.h1,
      description: hub.description,
      url,
      isPartOf: { '@id': '%SITE_URL%/#website' },
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: links.map((l, i) => ({ '@type': 'ListItem', position: i + 1, name: l.title, url: `%SITE_URL%${l.path}` })),
      },
    },
  ];
  const jsonLd = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2).replace(/</g, '\\u003c');
  const alt = DEFAULT_ALT[hub.hero_image];
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(hub.title)}</title>
  <meta name="description" content="${esc(hub.description)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${esc(hub.title)}">
  <meta property="og:description" content="${esc(hub.description)}">
  <meta name="twitter:title" content="${esc(hub.title)}">
  <meta name="twitter:description" content="${esc(hub.description)}">
<!-- include:head -->
  <link rel="preload" as="image" href="${src}" data-sizes="${HERO_SIZES}" fetchpriority="high">

  <script type="application/ld+json">
${jsonLd}
  </script>
</head>
<body>
<!-- include:sprite -->
<!-- include:nav -->

  <main id="main">
    <section class="lp-hero">
      <div class="container lp-hero__grid">
        <div>
          <nav aria-label="Breadcrumb"><ol class="crumbs caption-2"><li><a href="/">Home</a></li><li aria-current="page">${esc(hub.label)}</li></ol></nav>
          <h1 class="heading-1">${esc(hub.h1)}</h1>
          <p class="lp-hero__sub body-3 muted">${esc(hub.lead)}</p>
          <div class="hero__cta">
            <a class="btn btn--lg button-md" href="/#tour">Book a free tour</a>
            <a class="link body-5" href="${WHATSAPP}?text=${WHATSAPP_TEXT}" target="_blank" rel="noopener">Or WhatsApp <span class="num nowrap">0327 5393390</span>${icon('arrow-right')}</a>
          </div>
        </div>
        <figure class="lp-hero__photo">
          <img src="${src}" data-sizes="${HERO_SIZES}" alt="${esc(alt)}" width="${image.width}" height="${image.height}" fetchpriority="high" decoding="async">
        </figure>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-head reveal">
          <h2 class="heading-2">${esc(hub.heading)}</h2>
        </div>${linkCards(links)}
      </div>
    </section>
${renderers.cta({ heading: 'See CoNinja in person', text: 'Tours are free and there’s nothing to sign.' })}
  </main>

<!-- include:footer -->
</body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* Slots: editable copy on the hand-written pages                     */
/* ------------------------------------------------------------------ */
// src/<page>.html marks each piece of copy with data-slot="<key>"; src/content/<page>.json holds
// { "<key>": "<plain text>" }. The build fills every slot and fails on a slot without a value or a
// value without a slot. Keys ending in "__html" may hold a little inline markup (see HTML_RULE).
export const SLOT_KEY_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*(?:__html)?$/;
export const SLOT_LIMITS = { title: 65, description: 160 };
export const HTML_RULE = 'only <b>…</b>, <br>, <a href="/internal-path"> (optional class="violet") and <a href="https://wa.me/923275393390…" target="_blank" rel="noopener">';
const WA_HREF = /^https:\/\/wa\.me\/923275393390(?:\?text=[A-Za-z0-9%'._~-]*)?$/;

const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => escText(s).replace(/"/g, '&quot;');
const decodeEntities = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
/** Visible text of a slot value (markup removed), as used in JSON-LD. */
export const slotText = (key, value) => (key.endsWith('__html') ? decodeEntities(value.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '')) : value);

/** Problems with one value (empty list when it is fine). */
export function slotValueProblems(key, value) {
  const errs = [];
  if (!SLOT_KEY_RE.test(key)) errs.push(`key "${key}" must be lowercase letters, digits and single underscores, optionally ending in "__html"`);
  if (typeof value !== 'string' || !value.trim()) return [...errs, `slot "${key}" has no value (needs a non-empty string)`];
  if (/%[A-Z_]+%/.test(value)) errs.push(`slot "${key}" contains a build token (${value.match(/%[A-Z_]+%/)[0]})`);
  const base = key.replace(/__html$/, '');
  if (SLOT_LIMITS[base] && value.length > SLOT_LIMITS[base]) errs.push(`slot "${key}" is ${value.length} chars (max ${SLOT_LIMITS[base]})`);
  if (!key.endsWith('__html')) {
    if (/<\/?[a-z][^>]*>/i.test(value)) errs.push(`slot "${key}" is plain text but contains HTML; use the key "${key}__html" in both files if it needs markup`);
    return errs;
  }
  let openA = false; let openB = false;
  for (const m of value.matchAll(/<[^>]*>|[<>]/g)) {
    const tag = m[0];
    const fail = (why) => errs.push(`slot "${key}": ${why} in ${tag} (allowed: ${HTML_RULE})`);
    if (tag === '<' || tag === '>') { fail('stray angle bracket'); continue; }
    if (tag === '<br>') continue;
    if (tag === '<b>') { if (openB) fail('nested <b>'); openB = true; continue; }
    if (tag === '</b>') { if (!openB) fail('unopened </b>'); openB = false; continue; }
    if (tag === '</a>') { if (!openA) fail('unopened </a>'); openA = false; continue; }
    const a = tag.match(/^<a((?:\s+[a-z]+="[^"]*")+)>$/);
    if (!a) { fail('tag not allowed'); continue; }
    if (openA) fail('nested <a>');
    openA = true;
    const attrs = Object.fromEntries([...a[1].matchAll(/([a-z]+)="([^"]*)"/g)].map((x) => [x[1], x[2]]));
    for (const name of Object.keys(attrs)) if (!['href', 'class', 'target', 'rel'].includes(name)) fail(`attribute "${name}" not allowed`);
    const href = attrs.href || '';
    const internal = /^\/(?!\/)[^"\s]*$/.test(href);
    if (!internal && !WA_HREF.test(href)) fail(`href "${href}" must be an internal path starting with / or the CoNinja WhatsApp link`);
    if ('class' in attrs && attrs.class !== 'violet') fail('class may only be "violet"');
    if (internal && ('target' in attrs || 'rel' in attrs)) fail('internal links take no target or rel');
    if (!internal && (attrs.target !== '_blank' || attrs.rel !== 'noopener')) fail('the WhatsApp link needs target="_blank" rel="noopener"');
  }
  if (openA || openB) errs.push(`slot "${key}": unclosed <a> or <b>`);
  return errs;
}

/** FAQ slots faq_<n>_q / faq_<n>_a (or faq_<n>_a__html) as [{ q, a }] in number order, plus problems. */
export function faqFromSlots(values) {
  const items = new Map(); const errs = [];
  for (const [key, value] of Object.entries(values)) {
    const m = key.match(/^faq_(\d+)_(q|a)(__html)?$/);
    if (!m) continue;
    if (m[2] === 'q' && m[3]) errs.push(`"${key}": FAQ questions are plain text`);
    const item = items.get(Number(m[1])) || {};
    item[m[2]] = slotText(key, value);
    items.set(Number(m[1]), item);
  }
  const list = [...items.entries()].sort((a, b) => a[0] - b[0]);
  for (const [n, it] of list) if (!it.q || !it.a) errs.push(`faq_${n} needs both faq_${n}_q and faq_${n}_a`);
  return { items: list.map(([, it]) => it), errs };
}

/**
 * Fills the data-slot elements of one hand-written page.
 * html: the page source. values: the parsed src/content/<page>.json. name: the page file name (for messages).
 * Returns { html, errors }; html is only meaningful when errors is empty.
 */
export function fillSlots(html, values, name) {
  const errors = [];
  const say = (m) => errors.push(`${name}: ${m}`);
  if (!values || typeof values !== 'object' || Array.isArray(values)) return { html, errors: [`${name}: content must be a JSON object of "key": "text"`] };

  const openRe = /<([a-zA-Z][\w-]*)\b([^>]*?)\sdata-slot="([^"]*)"([^>]*)>/g;
  const slots = [...html.matchAll(openRe)].map((m) => ({ tag: m[1].toLowerCase(), key: m[3], start: m.index, end: m.index + m[0].length, text: m[0] }));
  const seen = new Set();
  for (const s of slots) { if (seen.has(s.key)) say(`slot "${s.key}" is used twice`); seen.add(s.key); }
  for (const s of slots) {
    if (!(s.key in values)) say(`slot "${s.key}" has no value in the content file`);
    if (['title', 'meta'].includes(s.tag) && s.key.endsWith('__html')) say(`slot "${s.key}" is in <${s.tag}>, which takes plain text only`);
  }
  for (const key of Object.keys(values)) {
    if (!seen.has(key)) say(`key "${key}" has no data-slot="${key}" in the page`);
    else errors.push(...slotValueProblems(key, values[key]).map((p) => `${name}: ${p}`));
  }
  const faq = faqFromSlots(values);
  errors.push(...faq.errs.map((p) => `${name}: ${p}`));
  const tokens = html.split('%FAQ_JSONLD%').length - 1;
  if (faq.items.length && tokens !== 1) say(`has FAQ slots, so it needs exactly one %FAQ_JSONLD% in its FAQPage JSON-LD (found ${tokens})`);
  if (!faq.items.length && tokens) say('has %FAQ_JSONLD% but no faq_<n>_q / faq_<n>_a slots');
  if (errors.length) return { html, errors };

  let out = html;
  for (const s of [...slots].reverse()) {
    const value = values[s.key];
    const open = s.text.replace(` data-slot="${s.key}"`, '');
    if (s.tag === 'meta') {
      if (!/\scontent=""/.test(open)) { say(`slot "${s.key}": a <meta> slot needs content=""`); continue; }
      out = out.slice(0, s.start) + open.replace(/\scontent=""/, ` content="${escAttr(value)}"`) + out.slice(s.end);
      continue;
    }
    // Find the matching close tag (same-name elements may nest)
    const tagRe = new RegExp(`<(/?)${s.tag}\\b[^>]*>`, 'gi');
    tagRe.lastIndex = s.end;
    let depth = 1; let close = null; let m;
    while ((m = tagRe.exec(out))) {
      depth += m[1] ? -1 : 1;
      if (!depth) { close = m; break; }
    }
    if (!close) { say(`slot "${s.key}": no closing </${s.tag}>`); continue; }
    const inner = out.slice(s.end, close.index);
    const filled = s.key.endsWith('__html') ? value : escText(value);
    let next;
    if (!inner.trim()) next = filled;
    else if (inner.split('%SLOT%').length === 2) next = inner.replace('%SLOT%', () => filled);
    else { say(`slot "${s.key}": the element must be empty, or hold fixed markup plus exactly one %SLOT%`); continue; }
    out = out.slice(0, s.start) + open + next + out.slice(close.index);
  }
  if (faq.items.length) {
    out = out.replace(/^([ \t]*)%FAQ_JSONLD%/m, (_, indent) => faq.items.map((f) => `${indent}{ "@type": "Question", "name": ${JSON.stringify(f.q)}, "acceptedAnswer": { "@type": "Answer", "text": ${JSON.stringify(f.a)} } }`.replace(/</g, '\\u003c')).join(',\n'));
  }
  if (/%SLOT%|data-slot=/.test(out)) say('a %SLOT% marker or data-slot attribute was left over');
  return { html: out, errors };
}
