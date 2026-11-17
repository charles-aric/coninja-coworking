// CoNinja production build.
//   SITE_URL=https://your-domain.pk npm run build
// Produces dist/: responsive images, hashed + minified CSS/JS, minified HTML,
// sitemap.xml, robots.txt, site.webmanifest and security/caching headers for
// Cloudflare Pages / Netlify (_headers), Vercel (vercel.json) and Apache (.htaccess).

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import * as esbuild from 'esbuild';
import { minify as minifyHtml } from 'html-minifier-terser';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dist');
const config = JSON.parse(await fs.readFile(path.join(ROOT, 'site.config.json'), 'utf8'));

const SITE_URL = (process.env.SITE_URL || config.url || '').replace(/\/+$/, '');
if (!/^https?:\/\/[^/]+$/.test(SITE_URL)) {
  console.error('\n  Set the live domain first, e.g.\n    SITE_URL=https://coninja.pk npm run build\n  or put it in site.config.json → "url".\n');
  process.exit(1);
}
const isLocal = /localhost|127\.0\.0\.1/.test(SITE_URL);
// Which host configs to write: cloudflare (also Netlify) | vercel | apache | all
const TARGET = (process.env.TARGET || 'all').toLowerCase();
const want = (t) => TARGET === 'all' || TARGET === t;
const today = new Date().toISOString().slice(0, 10);
const t0 = Date.now();

const hash = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);
const exists = (p) => fs.access(p).then(() => true, () => false);
async function copyDir(from, to, filter = () => true) {
  await fs.mkdir(to, { recursive: true });
  for (const entry of await fs.readdir(from, { withFileTypes: true })) {
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (!filter(a, entry)) continue;
    if (entry.isDirectory()) await copyDir(a, b, filter);
    else await fs.copyFile(a, b);
  }
}

/* ------------------------------------------------------------------ */
/* 1. Clean + static assets                                           */
/* ------------------------------------------------------------------ */
await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });
await copyDir(path.join(SRC, 'assets', 'brand'), path.join(OUT, 'assets', 'brand'), (p) => !p.endsWith('original.png'));
await copyDir(path.join(SRC, 'assets', 'fonts'), path.join(OUT, 'assets', 'fonts'));
await fs.mkdir(path.join(OUT, 'assets', 'img'), { recursive: true });
for (const f of ['og.jpg', 'favicon.png', 'apple-touch-icon.png']) {
  await fs.copyFile(path.join(SRC, 'assets', 'img', f), path.join(OUT, 'assets', 'img', f));
}

/* ------------------------------------------------------------------ */
/* 2. Responsive images: AVIF + WebP + JPEG at several widths         */
/* ------------------------------------------------------------------ */
const images = {}; // "/assets/img/name.jpg" -> { widths, base, width, height }
async function processImage(file, outDir, urlDir, widths) {
  const name = path.basename(file, path.extname(file));
  const meta = await sharp(file).metadata();
  const ws = [...new Set(widths.filter((w) => w < meta.width).concat(Math.min(meta.width, Math.max(...widths))))].sort((a, b) => a - b);
  await fs.mkdir(outDir, { recursive: true });
  await Promise.all(ws.flatMap((w) => {
    const base = sharp(file).rotate().resize({ width: w, withoutEnlargement: true });
    return [
      base.clone().avif({ quality: 50, effort: 4 }).toFile(path.join(outDir, `${name}-${w}.avif`)),
      base.clone().webp({ quality: 72 }).toFile(path.join(outDir, `${name}-${w}.webp`)),
      base.clone().jpeg({ quality: 72, mozjpeg: true, progressive: true }).toFile(path.join(outDir, `${name}-${w}.jpg`)),
    ];
  }));
  images[`${urlDir}/${name}.jpg`] = { widths: ws, base: `${urlDir}/${name}`, width: meta.width, height: meta.height };
}
const originals = path.join(SRC, 'assets', 'img', 'originals');
for (const f of await fs.readdir(originals)) {
  if (/\.(jpe?g|png)$/i.test(f)) await processImage(path.join(originals, f), path.join(OUT, 'assets', 'img'), '/assets/img', config.imageWidths);
}
const insta = path.join(SRC, 'assets', 'img', 'instagram');
for (const f of await fs.readdir(insta)) {
  if (/\.(jpe?g|png)$/i.test(f)) await processImage(path.join(insta, f), path.join(OUT, 'assets', 'img', 'instagram'), '/assets/img/instagram', [360]);
}

// Manifest icons from the vector app icon
const iconSvg = path.join(SRC, 'assets', 'brand', 'coninja-icon.svg');
for (const s of [192, 512]) {
  await sharp(iconSvg, { density: 300 }).resize(s, s).png().toFile(path.join(OUT, 'assets', 'brand', `icon-${s}.png`));
}

/* ------------------------------------------------------------------ */
/* 3. CSS + JS: minify and fingerprint                                */
/* ------------------------------------------------------------------ */
const buildDir = path.join(OUT, 'assets', 'build');
await fs.mkdir(buildDir, { recursive: true });
async function bundle(srcFile, loader) {
  const code = await fs.readFile(srcFile, 'utf8');
  const out = await esbuild.transform(code, { loader, minify: true, target: loader === 'css' ? ['chrome100', 'safari15', 'firefox100'] : 'es2019', legalComments: 'none' });
  const ext = loader;
  const name = `${path.basename(srcFile, `.${ext}`)}.${hash(out.code)}.${ext}`;
  await fs.writeFile(path.join(buildDir, name), out.code);
  return { url: `/assets/build/${name}`, bytes: Buffer.byteLength(out.code) };
}
const css = await bundle(path.join(SRC, 'css', 'styles.css'), 'css');
const js = await bundle(path.join(SRC, 'js', 'main.js'), 'js');

/* ------------------------------------------------------------------ */
/* 4. HTML: includes, tokens, responsive images, minify               */
/* ------------------------------------------------------------------ */
const partials = {};
for (const f of await fs.readdir(path.join(SRC, 'partials'))) {
  partials[path.basename(f, '.html')] = await fs.readFile(path.join(SRC, 'partials', f), 'utf8');
}

const srcset = (img, ext) => img.widths.map((w) => `${img.base}-${w}.${ext} ${w}w`).join(', ');
const largest = (img, ext) => `${img.base}-${img.widths[img.widths.length - 1]}.${ext}`;
const middle = (img) => img.widths.find((w) => w >= 800) || img.widths[img.widths.length - 1];

function pictureFor(tag) {
  const src = tag.match(/\ssrc="([^"]+)"/)?.[1];
  const img = images[src];
  if (!img) return tag;
  const sizes = tag.match(/\sdata-sizes="([^"]+)"/)?.[1] || '100vw';
  const rest = tag
    .replace(/\ssrc="[^"]+"/, '')
    .replace(/\sdata-sizes="[^"]+"/, '')
    .replace(/^<img/, '')
    .replace(/\/?>$/, '');
  return `<picture>`
    + `<source type="image/avif" srcset="${srcset(img, 'avif')}" sizes="${sizes}">`
    + `<source type="image/webp" srcset="${srcset(img, 'webp')}" sizes="${sizes}">`
    + `<img src="${img.base}-${middle(img)}.jpg" srcset="${srcset(img, 'jpg')}" sizes="${sizes}"${rest}>`
    + `</picture>`;
}

function preloadFor(tag) {
  const src = tag.match(/\shref="([^"]+)"/)?.[1];
  const img = images[src];
  if (!img) return tag;
  const sizes = tag.match(/\sdata-sizes="([^"]+)"/)?.[1] || '100vw';
  return `<link rel="preload" as="image" type="image/avif" imagesrcset="${srcset(img, 'avif')}" imagesizes="${sizes}" fetchpriority="high">`;
}

const htmlReport = [];
for (const page of config.pages) {
  let html = await fs.readFile(path.join(SRC, page.file), 'utf8');

  html = html.replace(/<!-- include:(\w+) -->/g, (_, name) => {
    if (!(name in partials)) throw new Error(`${page.file}: missing partial "${name}"`);
    return partials[name];
  });
  html = html.replaceAll('%SITE_URL%', SITE_URL);
  html = html.replace('href="/css/styles.css"', `href="${css.url}"`);
  html = html.replace('src="/js/main.js"', `src="${js.url}"`);
  html = html.replace(/<link rel="preload" as="image"[^>]*data-sizes[^>]*>/g, preloadFor);
  html = html.replace(/<img\s[^>]*>/g, pictureFor);
  html = html.replace(/data-full="([^"]+)"/g, (m, src) => (images[src] ? `data-full="${largest(images[src], 'webp')}"` : m));

  if (/%SITE_URL%|<!-- include:/.test(html)) throw new Error(`${page.file}: unresolved token`);

  // Keep sector names like "E-11/3" on one line in visible body text (not in attributes or JSON-LD)
  html = html.replace(/(<body[\s\S]*<\/body>)/, (body) => body.replace(/>([^<]+)</g, (m, text) =>
    `>${text.replace(/\bE-11(?:\/3)?\b/g, '<span class="nowrap">$&</span>')}<`));

  const min = await minifyHtml(html, {
    collapseWhitespace: true,
    conservativeCollapse: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: false,
    useShortDoctype: true,
    minifyJS: false,
    minifyCSS: false,
    keepClosingSlash: false,
    sortAttributes: false,
  });
  await fs.writeFile(path.join(OUT, page.file), min);
  htmlReport.push(`${page.file} ${(Buffer.byteLength(min) / 1024).toFixed(1)} KB`);
}

/* ------------------------------------------------------------------ */
/* 5. SEO files                                                       */
/* ------------------------------------------------------------------ */
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${config.pages.filter((p) => p.path).map((p) => `  <url>
    <loc>${SITE_URL}${p.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
await fs.writeFile(path.join(OUT, 'sitemap.xml'), sitemap);

await fs.writeFile(path.join(OUT, 'robots.txt'), isLocal
  ? 'User-agent: *\nDisallow: /\n'
  : `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

await fs.writeFile(path.join(OUT, 'site.webmanifest'), JSON.stringify({
  name: 'CoNinja Coworking',
  short_name: 'CoNinja',
  description: 'Coworking space and private offices in E-11/3, Islamabad.',
  start_url: '/',
  scope: '/',
  display: 'browser',
  background_color: '#fbf9fc',
  theme_color: '#fbf9fc',
  icons: [
    { src: '/assets/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/assets/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/assets/brand/coninja-icon.svg', sizes: 'any', type: 'image/svg+xml' },
  ],
}, null, 2));

/* ------------------------------------------------------------------ */
/* 6. Security + caching headers for each host                        */
/* ------------------------------------------------------------------ */
const CSP = [
  "default-src 'self'",
  // Cloudflare Web Analytics (cookieless) is injected by Cloudflare on the live zone
  // Google Analytics 4 is loaded by src/js/main.js (hosts per Google's CSP guide for GA4)
  "script-src 'self' https://static.cloudflareinsights.com https://*.googletagmanager.com",
  "style-src 'self'",
  "img-src 'self' data: https://*.google-analytics.com https://*.googletagmanager.com",
  "font-src 'self'",
  "connect-src 'self' https://cloudflareinsights.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
  'frame-src https://www.google.com',
  "form-action 'self' https://wa.me",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  ...(isLocal ? [] : ['upgrade-insecure-requests']),
].join('; ');

const securityHeaders = {
  'Content-Security-Policy': CSP,
  ...(isLocal ? {} : { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' }),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), browsing-topics=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};
const cacheRules = [
  { path: '/assets/build/*', value: 'public, max-age=31536000, immutable' },
  { path: '/assets/fonts/*', value: 'public, max-age=31536000, immutable' },
  { path: '/assets/img/*', value: 'public, max-age=2592000' },
  { path: '/assets/brand/*', value: 'public, max-age=2592000' },
];

// Cloudflare Pages + Netlify
if (want('cloudflare') || want('netlify')) await fs.writeFile(path.join(OUT, '_headers'), [
  '/*',
  ...Object.entries(securityHeaders).map(([k, v]) => `  ${k}: ${v}`),
  '',
  ...cacheRules.flatMap((r) => [r.path, `  Cache-Control: ${r.value}`, '']),
].join('\n'));
if (want('cloudflare') || want('netlify')) await fs.writeFile(path.join(OUT, '_redirects'), '/home / 301\n');

// Vercel
if (want('vercel')) await fs.writeFile(path.join(OUT, 'vercel.json'), JSON.stringify({
  cleanUrls: true,
  trailingSlash: false,
  headers: [
    { source: '/(.*)', headers: Object.entries(securityHeaders).map(([key, value]) => ({ key, value })) },
    ...cacheRules.map((r) => ({ source: r.path.replace('*', '(.*)'), headers: [{ key: 'Cache-Control', value: r.value }] })),
  ],
  redirects: [{ source: '/home', destination: '/', permanent: true }],
}, null, 2));

// Apache / cPanel shared hosting
if (want('apache')) await fs.writeFile(path.join(OUT, '.htaccess'), `# CoNinja: generated by scripts/build.mjs
Options -Indexes
ErrorDocument 404 /404.html

<IfModule mod_rewrite.c>
  RewriteEngine On
  # Force HTTPS
  RewriteCond %{HTTPS} !=on
  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
  # /page.html -> /page
  RewriteCond %{THE_REQUEST} \\s/+(.+?)\\.html[\\s?] [NC]
  RewriteRule ^ /%1 [R=301,L]
  RewriteRule ^index$ / [R=301,L]
  # /page -> page.html
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteCond %{REQUEST_FILENAME}.html -f
  RewriteRule ^(.+?)/?$ $1.html [L]
</IfModule>

<IfModule mod_headers.c>
${Object.entries(securityHeaders).map(([k, v]) => `  Header always set ${k} "${v}"`).join('\n')}
  <FilesMatch "\\.(css|js|woff2)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  <FilesMatch "\\.(avif|webp|jpg|png|svg|webmanifest)$">
    Header set Cache-Control "public, max-age=2592000"
  </FilesMatch>
  <FilesMatch "\\.html$">
    Header set Cache-Control "public, max-age=0, must-revalidate"
  </FilesMatch>
</IfModule>

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json image/svg+xml application/xml text/plain application/manifest+json
</IfModule>

AddType image/avif .avif
AddType application/manifest+json .webmanifest
`);

// Local preview with the same headers (npm run preview); kept out of dist
await fs.writeFile(path.join(ROOT, 'serve.json'), JSON.stringify({
  cleanUrls: true,
  directoryListing: false,
  headers: [
    { source: '**/*', headers: Object.entries(securityHeaders).map(([key, value]) => ({ key, value })) },
    { source: 'assets/build/**', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    { source: '**/*.avif', headers: [{ key: 'Content-Type', value: 'image/avif' }] },
  ],
}, null, 2));

/* ------------------------------------------------------------------ */
const imgCount = (await fs.readdir(path.join(OUT, 'assets', 'img'))).length;
console.log(`Built ${SITE_URL} (host config: ${TARGET}) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`  css ${css.url} ${(css.bytes / 1024).toFixed(1)} KB | js ${js.url} ${(js.bytes / 1024).toFixed(1)} KB`);
console.log(`  images: ${Object.keys(images).length} sources → ${imgCount} files in assets/img`);
console.log(`  pages: ${htmlReport.join(' | ')}`);
