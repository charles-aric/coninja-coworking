# CoNinja Coworking Website

Static site for CoNinja Coworking, 1st Floor, Professional Arcade, MPCHS E-11/3, Islamabad.
Plain HTML, CSS and JavaScript with a small Node build. No framework, no ad trackers, no backend (Google Analytics 4 is the only thing that sets cookies):
the tour form opens WhatsApp with the visitor's details filled in.

## Commands

```bash
npm install                                  # once
npm run preview                              # build for localhost and serve at http://localhost:4322
npm run build                                # production build into dist/ (domain from site.config.json)
npm run check                                # pre-deploy checks on dist/
npm run test:pages                           # build the fixture content page in a temp dir and check it
```

The domain lives in `site.config.json` (`"url": "https://coninjacoworking.com"`); `SITE_URL` in the
environment overrides it. Canonical URLs, the sitemap and social previews all use it.

## What the build does

- Includes the shared partials in `src/partials/` (head, nav, footer, icon sprite, lightbox).
- Turns every `<img src="/assets/img/NAME.jpg" data-sizes="…">` into a `<picture>` with AVIF,
  WebP and JPEG at 320–1200px, from the full size photos in `src/assets/img/originals/`.
- Minifies and fingerprints CSS and JS (`/assets/build/*.HASH.css|js`), minifies HTML.
- Writes `sitemap.xml`, `robots.txt` and `site.webmanifest`.
- Writes security and caching headers for Cloudflare Pages / Netlify (`_headers`, `_redirects`),
  Vercel (`vercel.json`) and Apache or cPanel (`.htaccess`).

`npm run check` fails on broken links or anchors, missing alt text, titles, descriptions or
canonicals, invalid JSON-LD, `tel:` links (CoNinja takes bookings on WhatsApp only) and
sitemap entries without a page.

## Automated pages

An automation adds SEO landing pages as data, not HTML. Each page is one file,
`src/pages/<slug>.json`, in the shape defined by `content.schema.json`:

```json
{ "slug": "coworking-space-e-11", "title": "60 chars or fewer", "description": "155 chars or fewer",
  "h1": "", "lead": "", "breadcrumb": "short label", "hero_image": "coworking-desks",
  "service_name": "", "service_type": "",
  "sections": [
    {"type":"features","heading":"","items":[{"title":"","text":""}]},
    {"type":"text","heading":"","paragraphs":[""]},
    {"type":"comparison","heading":"","columns":["",""],"rows":[["label","a","b"]]},
    {"type":"faq","heading":"","items":[{"q":"","a":""}]},
    {"type":"cta","heading":"","text":""}
  ] }
```

- **How it works.** `npm run build` renders every file to `dist/<slug>.html` with the same markup
  as the two hand-written landing pages (hero, feature grid, comparison table, FAQ, call to action,
  shared partials, breadcrumb + Service + FAQPage JSON-LD, canonical and social tags, responsive
  hero photo) and adds `/<slug>` to the sitemap. No `site.config.json` edit is needed. The renderer
  is `scripts/pages.mjs`.
- **Rules.** The file name must be the slug. All text is plain text and is escaped. `hero_image`
  is the name, without extension, of a photo in `src/assets/img/originals/`. Optional keys:
  `hero_alt` (page), `label` (features, text, comparison and faq sections) and `icon` (feature
  items; an icon id from `src/partials/sprite.html` without the `i-`). The build stops with a
  message naming the file and key on an unknown section type, a missing or unknown key, an unknown
  image, or a title or description that is too long.
- **Facts file.** `site.facts.json` holds every business fact stated on the site. A content page
  may only state a price (PKR, Rs or rupee amounts) or opening hours (clock times, time ranges,
  "24 hours", "1 to 3 hours", "24/7") that appear in that file. `npm run check` fails otherwise and
  names the offending text. When a fact changes, change the site and `site.facts.json` together.
  Its `conflicts` block lists statements that disagree between pages and is never treated as a fact.
- **Checks.** `npm run check` covers content pages like any other page (links, alt text, SEO tags,
  JSON-LD, sitemap) plus the facts check. `npm run test:pages` builds the fixture in
  `scripts/fixtures/pages/` into a temp folder, runs the checks on it, and confirms each file in
  `scripts/fixtures/invalid/` is rejected. `.github/workflows/check.yml` runs `npm ci`,
  `npm run build` and `npm run check` on every pull request and on pushes to `main`.

New pages are not linked from the nav or footer automatically; they are reachable through the
sitemap until a link is added by hand.

### Preview builds

`PREVIEW=1 npm run build` (any `TARGET`) adds `X-Robots-Tag: noindex` to the generated headers and
writes a disallow-all `robots.txt`, so a preview copy can never be indexed. Preview URLs are
currently **off** (`"preview_urls": false` in `wrangler.jsonc`). To switch them on later:

1. Set `"preview_urls": true` in `wrangler.jsonc`.
2. In Cloudflare Workers Builds, set the build command for non-production branches to
   `PREVIEW=1 npm run build:cloudflare && npm run check`. Leave the production (`main`) build
   command without `PREVIEW`.
3. Open a pull request and confirm the preview URL answers with `X-Robots-Tag: noindex` and
   `/robots.txt` shows `Disallow: /` before sharing it.

## Deploying

Live at **https://coninjacoworking.com**, hosted on Cloudflare Workers (static assets) in the
team's Cloudflare account. Cloudflare Pages is now part of Workers, so the
site deploys with `wrangler deploy`, configured in `wrangler.jsonc`.

Every push to `main` deploys automatically through Cloudflare Workers Builds: the site on any
change, the www redirect only when `workers/www-redirect/` changes. To deploy by hand instead:

```bash
npx wrangler login     # once per machine, approve in the browser
npm run deploy         # build for Cloudflare, run checks, upload, then redeploy the www redirect
```

- `wrangler.jsonc` serves `dist/` on `coninjacoworking.com` with clean URLs (`/privacy`) and the
  branded `404.html`. `workers_dev` and preview URLs are off, so there is no duplicate copy for Google.
- `workers/www-redirect/` is a tiny Worker that 301-redirects `www.coninjacoworking.com/*` to the
  root domain, keeping the path and query.
- Security and caching headers come from `dist/_headers`, generated by the build.
- Cloudflare Web Analytics (cookieless) is allowed in the CSP and mentioned on the privacy page.
  If you switch it off in Cloudflare, you can remove `static.cloudflareinsights.com` and
  `cloudflareinsights.com` from the CSP in `scripts/build.mjs`.
- Google Analytics 4 (`G-EWMT0L7CC6`) is loaded by `src/js/main.js` on the live domain only, never on
  localhost. Its hosts are allowed in the CSP in `scripts/build.mjs` and it is described on the privacy
  page. The tour form sends a `generate_lead` event; mark it as a key event in GA4.

Other hosts: `TARGET=vercel npm run build` writes `vercel.json`; `TARGET=apache npm run build`
writes `.htaccess` for cPanel; `TARGET=netlify` writes `_headers` and `_redirects`.

## After going live

- Google Search Console and Bing Webmaster Tools: verify the domain and submit `/sitemap.xml`.
- Google Business Profile: set the website to the new domain and replace the old `{Co}` profile
  picture with `src/assets/brand/coninja-icon-512.png`. Keep the name, address and WhatsApp number
  exactly as they appear on the site.
- Test structured data with Google's Rich Results Test and social previews with the
  Facebook Sharing Debugger.

## Editing content

| What | Where |
|---|---|
| Prices, facilities, FAQ, hours | `src/index.html` (FAQ answers are also in the JSON-LD at the top of the page) |
| Private office page | `src/private-office-islamabad.html` |
| Team space page | `src/team-office-space-islamabad.html` |
| Nav and footer links | `src/partials/nav.html`, `src/partials/footer.html` |
| Opening hours logic (open now badge) | `src/js/main.js` → `statusFor` |
| Colours, type, spacing | tokens at the top of `src/css/styles.css` |
| Photos | add a full size JPEG to `src/assets/img/originals/` and reference `/assets/img/NAME.jpg` |
| New page | add the HTML file in `src/` and an entry in `site.config.json` → `pages` |
| New landing page from the automation | `src/pages/<slug>.json` (see Automated pages) |
| Business facts allowed on automated pages | `site.facts.json` |

When you change a fact, change it everywhere it appears: the visible text, the FAQ JSON-LD,
`site.facts.json` and, if it is a price, the `makesOffer` block.
