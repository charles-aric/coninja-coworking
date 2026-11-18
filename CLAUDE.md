# CoNinja Coworking website: notes for Claude

A static site for CoNinja Coworking, E-11/3 Islamabad. Plain HTML in `src/` with shared partials, built by `scripts/build.mjs` into `dist/`. Every merge to `main` deploys to Cloudflare Workers on its own. The SEO automation (n8n and the SEO dashboard, repo `charles-aric/seo-automation`) adds pages here through pull requests.

Read `README.md` for the full picture. The rules below are the ones that matter when you fix something.

## Before you finish any change

```bash
npm run build
npm run check
npm run test:pages
```

All three must pass. `check` fails on broken links or anchors, missing alt text, titles, descriptions or canonicals, invalid JSON-LD, `tel:` links, sitemap entries without a page, and any price or hour on a JSON page that `site.facts.json` does not state. To look at the result, run `npm run preview` and open http://localhost:4322.

## How changes land

- Never push to `main` and never merge. Work on a branch (`fix/<what>` for fixes, `seo/<slug>` for SEO pages), push it and open a pull request into `main`.
- `main` is protected: the `check` workflow in `.github/workflows/check.yml` must pass. The Cloudflare "Workers Builds" checks fail on branches other than `main`; that is expected and does not block merging.
- In the pull request, say what was wrong, what changed and how you checked it.

## Business facts

- `site.facts.json` holds every business fact: prices, hours, plans, team sizes, deposit, contact, facilities, reviews. Never invent or change one. If a fix needs a fact that is not there, stop and ask.
- A fact appears in several places. When one changes, change it everywhere: the visible text, the FAQ JSON-LD, the `makesOffer` block for prices, and `site.facts.json`.
- Nothing under `conflicts` in `site.facts.json` is a fact. Follow the `rule_for_new_pages` written there (for example: bills are included only for team space; Sunday closes at "12 PM to midnight").
- Facts about other businesses are only under `competitors`, each with the date it was checked. State them as theirs, with that date.
- Bookings are on WhatsApp only. There is no phone line, so never add `tel:` links or call wording.

## Where things are

| What | Where |
|---|---|
| Home page, prices, FAQ, hours | `src/index.html` (FAQ answers are also in the JSON-LD at the top) |
| Private office page | `src/private-office-islamabad.html` |
| Team space page | `src/team-office-space-islamabad.html` |
| Privacy, terms, 404 | `src/privacy.html`, `src/terms.html`, `src/404.html` |
| Head, nav, footer | `src/partials/` |
| Pages written by the SEO automation | `src/pages/<slug>.json`, rendered by `scripts/pages.mjs`; the contract is `content.schema.json` |
| Page list for the sitemap | `site.config.json` → `pages` |
| Styles and tokens | `src/css/styles.css` |
| Photos | full size JPEGs in `src/assets/img/originals/`; reference them as `/assets/img/NAME.jpg` |

## Pages written by the automation

- `src/pages/*.json` pages are written by n8n and approved in the SEO dashboard before they reach a pull request. Do not rewrite their wording when fixing something else; fix the renderer in `scripts/pages.mjs` instead when the problem is in how they look.
- Unknown keys fail the build. Section types are `features`, `text`, `comparison`, `faq` and `cta`.
- `npm run test:pages` checks the renderer against the fixtures in `scripts/fixtures/`. Add a fixture when you change the contract.

## Structured data and SEO basics

- Service pages carry `LocalBusiness` JSON-LD with address, hours and price range. Legal pages carry `WebPage` and `Organization`. Test with Google's Rich Results Test after deploying.
- One H1 per page, a unique title of 60 characters or fewer, a description of 155 or fewer, and a canonical URL. `check` enforces most of this.
