# CoNinja Coworking website: notes for Claude

A static site for CoNinja Coworking, E-11/3 Islamabad. Plain HTML in `src/` with shared partials, built by `scripts/build.mjs` into `dist/`. Every merge to `main` deploys to Cloudflare Workers on its own. The SEO automation (n8n and the SEO dashboard, repo `charles-aric/seo-automation`) adds pages here through pull requests.

Read `README.md` for the full picture. The rules below are the ones that matter when you fix something.

## Before you finish any change

```bash
npm run build
npm run check
npm run test:pages
```

All three must pass. `check` fails on broken links or anchors, missing alt text, titles, descriptions or canonicals, invalid JSON-LD, `tel:` links, sitemap entries without a page, and any price or hour in `src/pages/*.json` or `src/content/*.json` that `site.facts.json` does not state. To look at the result, run `npm run preview` and open http://localhost:4322.

## How changes land

- Never push to `main` and never merge. Work on a branch (`fix/<what>` for fixes, `seo/<slug>` for SEO pages), push it and open a pull request into `main`.
- `main` is protected: the `check` workflow in `.github/workflows/check.yml` must pass. The Cloudflare "Workers Builds" checks fail on branches other than `main`; that is expected and does not block merging.
- In the pull request, say what was wrong, what changed and how you checked it.

## Business facts

- `site.facts.json` holds every business fact: prices, hours, plans, team sizes, deposit, contact, facilities, reviews. Never invent or change one. If a fix needs a fact that is not there, stop and ask.
- A fact appears in several places. When one changes, change it everywhere: the visible text (`src/content/*.json`), the `makesOffer` / `offers` JSON-LD for prices, and `site.facts.json`. FAQ JSON-LD on the hand-written pages is generated from the FAQ slots.
- Nothing under `conflicts` in `site.facts.json` is a fact. Follow the `rule_for_new_pages` written there (for example: bills are included only for team space; Sunday closes at "12 PM to midnight").
- Facts about other businesses are only under `competitors`, each with the date it was checked. State them as theirs, with that date.
- Bookings are on WhatsApp only. There is no phone line, so never add `tel:` links or call wording.

## Where things are

| What | Where |
|---|---|
| Wording of the home, private office and team pages | `src/content/index.json`, `private-office-islamabad.json`, `team-office-space-islamabad.json` |
| Layout of those pages | `src/index.html`, `src/private-office-islamabad.html`, `src/team-office-space-islamabad.html` |
| Privacy, terms, 404 | `src/privacy.html`, `src/terms.html`, `src/404.html` |
| Head, nav, footer | `src/partials/` (the footer's `%HUB_LINKS%` is filled by the build) |
| Hub pages `/blog/`, `/compare/`, `/areas/` | built from JSON pages; wording in `HUBS` in `scripts/pages.mjs` |
| Pages written by the SEO automation | `src/pages/<slug>.json`, rendered by `scripts/pages.mjs`; the contract is `content.schema.json` |
| Page list for the sitemap | `site.config.json` → `pages` |
| Styles and tokens | `src/css/styles.css` |
| Photos | full size JPEGs in `src/assets/img/originals/`; reference them as `/assets/img/NAME.jpg` |

## Pages written by the automation

- `src/pages/*.json` pages are written by n8n and approved in the SEO dashboard before they reach a pull request. Do not rewrite their wording when fixing something else; fix the renderer in `scripts/pages.mjs` instead when the problem is in how they look.
- Unknown keys fail the build. Section types are `features`, `text`, `comparison`, `faq` and `cta`.
- Optional `"section"`: `service` (default), `compare`, `blog` or `area`. The build makes a hub (`/compare/`, `/blog/`, `/areas/`) and a footer link for each section with at least one page, and adds a "Related pages" block (up to 4 links, same section first, then money pages) before each page's final `cta`. Nothing to link by hand.
- `npm run test:pages` checks the renderer against the fixtures in `scripts/fixtures/`. Add a fixture when you change the contract.

## Hand-written pages: copy in `src/content/`

- Each piece of copy in the three hand-written pages is an element with `data-slot="<key>"`; its text is in `src/content/<page>.json` as `{ "<key>": "<plain text>" }`. Edit wording there, not in the HTML, and keep the design in the HTML.
- The build fails on a slot without a value or a key without a slot. Only keys ending in `__html` may hold markup: `<b>`, `<br>`, `<a href="/internal">` (optional `class="violet"`) and the WhatsApp link with `target="_blank" rel="noopener"`.
- FAQ slots are `faq_<n>_q` / `faq_<n>_a`; the FAQPage JSON-LD is generated from them at `%FAQ_JSONLD%`.
- Elements holding an icon plus text mark the text position with `%SLOT%`.

## Structured data and SEO basics

- Service pages carry `LocalBusiness` JSON-LD with address, hours and price range. Legal pages carry `WebPage` and `Organization`. Test with Google's Rich Results Test after deploying.
- One H1 per page, a unique title of 60 characters or fewer, a description of 155 or fewer, and a canonical URL. `check` enforces most of this.
