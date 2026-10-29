// Render AntV Infographic DSL to PNG via puppeteer-core + system chromium.
// Waits for the rendered SVG element, screenshots exactly it (no viewport bleed).
// Usage: node render-png.mjs <dsl-file> <title> <out.png> [chromium-path]
// chromium-path defaults to /snap/bin/chromium (snap builds cannot read /root
// paths directly - serve over HTTP if that fails, or point at a non-snap build).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');

const [dslFile, title, outPng, chromePath] = process.argv.slice(2);
if (!dslFile || !title || !outPng) {
  console.error('Usage: node render-png.mjs <dsl-file> <title> <out.png> [chromium-path]');
  process.exit(1);
}
const chrome = chromePath || '/snap/bin/chromium';
const syntax = readFileSync(dslFile, 'utf8').trim();

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title} - Infographic</title>
</head>
<body style="margin:0">
  <div id="container"></div>
  <script src="https://unpkg.com/@antv/infographic@latest/dist/infographic.min.js"></script>
  <script>
    const infographic = new AntVInfographic.Infographic({
      container: '#container', width: '100%', height: '100%'
    });
    const syntax = ${JSON.stringify(syntax)};
    infographic.render(syntax);
    document.fonts?.ready.then(() => infographic.render(syntax))
      .catch((e) => console.error('font load error', e));
    window.__rendered = true;
  </script>
</body>
</html>`;

const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForSelector('#container svg', { timeout: 60000 });
await new Promise(r => setTimeout(r, 1500)); // let fonts/2nd render finish
const el = await page.$('#container svg');
const box = await el.boundingBox();
if (!box) { console.error('no svg bounding box'); process.exit(1); }
await page.setViewport({ width: Math.ceil(box.width), height: Math.ceil(box.height), deviceScaleFactor: 2 });
await new Promise(r => setTimeout(r, 500));
const el2 = await page.$('#container svg');
await el2.screenshot({ path: outPng });
await browser.close();
console.log('PNG saved:', outPng);
