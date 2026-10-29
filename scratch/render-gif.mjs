// Render AntV Infographic DSL to an animated loop GIF (LinkedIn post style).
// Renders the DSL in chromium, pops badges in one-by-one with a highlight
// sweep, burst-captures time-tagged frames, subsamples to a 12fps grid, and
// encodes with ffmpeg. Designed for sequence-circular-simple (10 badges).
// Usage: node render-gif.mjs <dsl-file> <out.gif> [chromium-path]
// Run from a workdir that has node_modules (@antv/infographic + puppeteer-core).
import { readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');

const [dslFile, outGif, chromePath] = process.argv.slice(2);
if (!dslFile || !outGif) {
  console.error('Usage: node render-gif.mjs <dsl-file> <out.gif> [chromium-path]');
  process.exit(1);
}
const chrome = chromePath || '/snap/bin/chromium';
const FPS = 12;          // capture grid
const DURATION_S = 11.5; // total loop length
const TOTAL = Math.ceil(FPS * DURATION_S);

const syntax = readFileSync(dslFile, 'utf8').trim();
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Infographic - Animated</title>
<style>
  html,body { margin:0; padding:0; background:#fff; overflow:hidden; }
  #container svg text, #container svg span { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
  #container svg #infographic-container > g:first-child { animation: rise .45s ease-out both; }
  @keyframes rise { from { opacity:0; transform: translateY(-8px); } to { opacity:1; transform: none; } }
  @keyframes pop { 0%,100% { transform: scale(1); } 35% { transform: scale(1.15); } }
  .active { transform-box: fill-box; transform-origin: center; animation: pop 1.1s ease-in-out both; }
  @keyframes ring { 0% { opacity:0; transform: scale(.15); } 25% { opacity:.85; } 100% { opacity:0; transform: scale(2.1); } }
  .ring { transform-box: fill-box; transform-origin: center; animation: ring 1.1s ease-out both; }
  @keyframes fadeout { from { opacity:1; } to { opacity:0; } }
  svg.fadeout { animation: fadeout 1.8s ease-in 9.7s both; }
</style>
</head>
<body><div id="container"></div>
<script src="https://unpkg.com/@antv/infographic@latest/dist/infographic.min.js"></script>
<script>
  const infographic = new AntVInfographic.Infographic({ container: '#container', width: '100%', height: '100%' });
  const syntax = ${JSON.stringify(syntax)};
  infographic.render(syntax);
  document.fonts?.ready.then(() => infographic.render(syntax)).catch(() => {});
</script>
</body></html>`;

const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForSelector('#container svg', { timeout: 60000 });
await new Promise(r => setTimeout(r, 1500));

// Attach animation: hide badges, define staggered pop-in transitions, schedule sweep.
const anim = await page.evaluate(() => {
  const svg = document.querySelector('#container svg');
  if (!svg) return { error: 'no svg' };
  const arcs = Array.from(svg.querySelectorAll('path[width="360"]')); // 20: light+solid per badge
  const ell = Array.from(svg.querySelectorAll('ellipse'));            // 20: white+color per badge
  const uses = Array.from(svg.querySelectorAll('use'));               // 10 icons
  const fos = Array.from(svg.querySelectorAll('foreignObject'));      // title(0), desc(1), 10 labels
  const labels = fos.slice(2).filter((_, i) => i % 2 === 0); // template emits label+desc per badge
  const iconsG = ell[0]?.parentElement;
  const N = uses.length; // badges = icon count; derive, never hardcode
  if (arcs.length !== N*2 || ell.length !== N*2 || uses.length !== N || labels.length !== N) {
    return { error: `counts arcs=${arcs.length} ell=${ell.length} use=${uses.length} labels=${labels.length} N=${N}` };
  }
  const itemEls = []; // per badge: [lightArc, solidArc, whiteEll, colorEll, use, label]
  for (let i = 0; i < N; i++) itemEls.push([arcs[i*2], arcs[i*2+1], ell[i*2], ell[i*2+1], uses[i], labels[i]]);
  const add = (el, cls) => el?.classList.add(cls);
  const BASE = 0.35, STEP = 0.32;                 // pop-in stagger
  const SWEEP = BASE + N*STEP + 0.15;           // highlight sweep start
  itemEls.forEach((els, i) => {
    els.forEach(el => { el.style.opacity = '0'; });
  });
  // commit hidden state BEFORE defining transitions (same-recalc writes break the start value)
  document.querySelectorAll('#container svg [style*="opacity"]').forEach(el => el.getBoundingClientRect());
  const d = i => (BASE + i*STEP).toFixed(3);
  itemEls.forEach((els, i) => {
    els.forEach(el => { el.style.transition = `opacity .3s ease-out ${d(i)}s`; });
    const colorEll = els[3], iconUse = els[4];
    const cx = colorEll?.getAttribute('cx'), cy = colorEll?.getAttribute('cy');
    if (colorEll && cx && cy) {
      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ring.setAttribute('cx', cx); ring.setAttribute('cy', cy);
      ring.setAttribute('r', '30'); ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', '#262626'); ring.setAttribute('stroke-width', '3');
      ring.style.animationDelay = (SWEEP + i*0.5).toFixed(3) + 's';
      add(ring, 'ring');
      iconsG.appendChild(ring);
    }
    iconUse?.style && (iconUse.style.animationDelay = (SWEEP + i*0.5).toFixed(3) + 's');
    add(iconUse, 'active');
    // labels stay static through the sweep - scaling text pushes it into its own
    // badge circle / clip at the edge (reported as overlapping text by users).
  });
  svg.classList.add('fadeout'); // fade whole graphic at loop end
  return { ready: true, count: itemEls.length };
});
console.log('anim:', JSON.stringify(anim));

const el = await page.$('#container svg');
const box = await el.boundingBox();
await page.setViewport({ width: Math.ceil(box.width), height: Math.ceil(box.height), deviceScaleFactor: 1 });
await new Promise(r => setTimeout(r, 600));

mkdirSync('frames-tagged', { recursive: true });
let el2 = await page.$('#container svg');
await el2.screenshot({ path: 'frames-tagged/t_0000.png' }); // frame 0: hidden state

// flip to visible -> staggered transitions start NOW
await page.evaluate(() => {
  document.querySelectorAll('#container svg [style*="opacity"]').forEach(el => {
    if (el.style.opacity === '0') el.style.opacity = '1';
  });
});

// Burst-capture tagged with page-time; screenshots are slower than 12fps so
// never pace them with sleeps — subsample by nearest page-time instead.
const t0 = await page.evaluate(() => performance.now());
const tagged = [];
for (let b = 0; b < 400; b++) {
  el2 = await page.$('#container svg');
  const path = `frames-tagged/t_${String(b).padStart(4, '0')}.png`;
  await el2.screenshot({ path });
  const t = await page.evaluate(() => performance.now());
  tagged.push({ t: t - t0, path });
  if (t - t0 > (DURATION_S + 1) * 1000) break;
}
console.log(`burst: ${tagged.length} frames`);

mkdirSync('frames-anim', { recursive: true });
copyFileSync('frames-tagged/t_0000.png', 'frames-anim/f_000.png');
let used = 1;
for (let i = 1; i < TOTAL; i++) {
  const want = i * 1000 / FPS;
  let best = null;
  for (const fr of tagged) if (!best || Math.abs(fr.t - want) < Math.abs(best.t - want)) best = fr;
  if (!best) continue;
  copyFileSync(best.path, `frames-anim/f_${String(i).padStart(3, '0')}.png`);
  used++;
}
console.log(`subsampled: ${used}/${TOTAL}`);
await browser.close();

const outW = Math.min(Math.round(box.width), 1000);
const cmd = `ffmpeg -y -framerate ${FPS} -i frames-anim/f_%03d.png -vf "scale=${outW}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" -loop 0 ${outGif}`;
execSync(cmd, { stdio: ['ignore','pipe','inherit'] });
console.log('GIF saved:', outGif);
