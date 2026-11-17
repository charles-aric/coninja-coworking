// Content pages: src/pages/<slug>.json → a landing page in the site's existing markup.
// Used by build.mjs (validate + render) and check.mjs (facts check).
// The JSON shape is a contract with the system that writes these files; see content.schema.json.

import fs from 'node:fs/promises';
import path from 'node:path';

export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;
export const SECTION_TYPES = ['features', 'text', 'comparison', 'faq', 'cta'];

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
  const known = ['slug', 'title', 'description', 'h1', 'lead', 'breadcrumb', 'hero_image', 'hero_alt', 'service_name', 'service_type', 'sections'];
  for (const key of Object.keys(page)) if (!known.includes(key)) bad(`unknown key "${key}"`);
  if ('hero_alt' in page && !isText(page.hero_alt)) bad('"hero_alt" must be a non-empty string when present');

  if (isText(page.slug)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.slug)) bad(`slug "${page.slug}" must be lowercase letters, digits and single hyphens`);
    else if (ctx.file !== `${page.slug}.json`) bad(`file name must match the slug (expected ${page.slug}.json)`);
    if ((ctx.reserved || []).includes(page.slug)) bad(`slug "${page.slug}" is already used by an existing page`);
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
export function renderPage(page, image) {
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
${page.sections.map((s) => renderers[s.type](s)).join('\n')}
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
