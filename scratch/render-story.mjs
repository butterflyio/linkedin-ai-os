// Render a "story GIF" for LinkedIn: portrait panel animation, pastel scene
// backgrounds, bold staggered headline, punchline, sealed loop.
// Matches the light editorial story-post style (1080x1350 @ 15fps, ~12.5s).
//
// Usage: node render-story.mjs <story.json> <out.gif> [--poster <out.png>] [--chrome <path>]
//
// Captures time-tagged frames with puppeteer, subsamples to the fps grid, and
// encodes with ffmpeg (palette-based). Run from the repo root.

import { readFileSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const args = process.argv.slice(2);
const storyFile = args[0];
const outGif = args[1];
const posterIdx = args.indexOf("--poster");
const posterPath = posterIdx !== -1 ? args[posterIdx + 1] : null;
const chromeIdx = args.indexOf("--chrome");
const chrome = chromeIdx !== -1 ? args[chromeIdx + 1] : "/snap/bin/chromium";

if (!storyFile || !outGif) {
  console.error("Usage: node render-story.mjs <story.json> <out.gif> [--poster out.png] [--chrome path]");
  process.exit(1);
}

const S = JSON.parse(readFileSync(storyFile, "utf8"));
const [W, H] = S.size;
const FPS = S.fps;
const DURATION = S.duration;
const TOTAL = Math.round(FPS * DURATION);
const FADE_IN = 0.45, FADE_OUT = 0.4;

let css = "";
let sceneHtml = "";
let counterJs = "";

if (S.mode === "board") {
  // ── board mode: ONE static frame; elements animate inside it ──────────
  // (reference style: background/layout never changes, cards drop/rise in
  // place, numbers count up, labels and bars animate within each card)
  const C = S.cards ?? [];
  const cardTimes = C.map((_, i) => (S.cardStart ?? 1.2) + i * (S.cardStep ?? 1.7));
  const countDelay = 0.15, labelDelay = 0.4, barDelay = 0.55, descDelay = 0.7;

  css = C.map((c, i) => {
    const t = cardTimes[i];
    const dir = i % 2 === 0 ? "drop" : "rise"; // alternate: down, up, down, up
    const off = dir === "drop" ? "-34px" : "34px";
    return `
@keyframes card${i} { 0% { opacity: 0; transform: translateY(${off}) scale(.95); } 65% { opacity: 1; transform: translateY(0) scale(1.02); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
.card${i} { background: ${c.bg}; animation: card${i} .55s cubic-bezier(.2,.7,.3,1.15) both; animation-delay: ${t}s; }
@keyframes num${i} { 0% { opacity: 0; transform: translateY(14px); } 100% { opacity: 1; transform: none; } }
.card${i} .num { animation: num${i} .4s ease-out both; animation-delay: ${t + countDelay}s; }
@keyframes lab${i} { 0% { opacity: 0; transform: translateY(22px); } 100% { opacity: 1; transform: none; } }
.card${i} .label { animation: lab${i} .45s cubic-bezier(.2,.7,.3,1.15) both; animation-delay: ${t + labelDelay}s; }
@keyframes bar${i} { 0% { transform: scaleX(0); } 100% { transform: scaleX(1); } }
.card${i} .bar { animation: bar${i} .5s ease-out both; animation-delay: ${t + barDelay}s; transform-origin: left; }
@keyframes dsc${i} { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: none; } }
.card${i} .desc { animation: dsc${i} .5s ease-out both; animation-delay: ${t + descDelay}s; }`;
  }).join("\n");

  css += `
@keyframes kick { 0% { opacity: 0; transform: translateY(-22px); } 100% { opacity: 1; transform: none; } }
.kicker { animation: kick .5s ease-out both; animation-delay: .5s; }
@keyframes tt { 0% { opacity: 0; transform: translateY(-26px); } 100% { opacity: 1; transform: none; } }
.title { animation: tt .55s cubic-bezier(.2,.7,.3,1.15) both; animation-delay: .8s; }
@keyframes up { 0% { opacity: 0; transform: translateY(24px); } 100% { opacity: 1; transform: none; } }
.f1 { animation: up .5s ease-out both; animation-delay: ${S.footerTimes?.[0] ?? 8.3}s; }
.f2 { animation: up .5s ease-out both; animation-delay: ${S.footerTimes?.[1] ?? 8.8}s; }
@keyframes sweepUp { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(-26px); } }
.body { animation: sweepUp .8s ease-in both; animation-delay: ${S.duration - 1.1}s; }
.board { background: ${S.bg}; }`;

  sceneHtml = `
<div class="board">
<div class="body">
  <div class="kicker">${S.kicker}</div>
  <div class="title"><span>${S.title[0]}</span><span>${S.title[1] ?? ""}</span></div>
  <div class="cards">
${C.map((c, i) => `    <div class="card card${i}">
      <div class="num" id="n${i}" style="color:${c.accent}">0</div>
      <div class="bar" style="background:${c.accent}"></div>
      <div class="label">${c.label}</div>
      <div class="desc">${c.desc}</div>
    </div>`).join("\n")}
  </div>
  <div class="foot"><div class="f1">${S.footer?.[0] ?? ""}</div><div class="f2">${S.footer?.[1] ?? ""}</div></div>
</div>
</div>`;

  counterJs = `<script>
const t0 = performance.now();
const jobs = ${JSON.stringify(C.map((c, i) => ({ id: "n" + i, start: cardTimes[i] + countDelay, value: c.num })))};
const els = Object.fromEntries(jobs.map((j) => [j.id, document.getElementById(j.id)]));
const ease = (p) => 1 - Math.pow(1 - p, 3);
function tick() {
  const now = performance.now() - t0;
  for (const j of jobs) {
    if (now < j.start) continue;
    const p = Math.min(1, (now - j.start) / 700);
    els[j.id].textContent = String(Math.round(ease(p) * j.value));
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
</script>`;
} else {
  // ── story mode: scene -> its lines with local stagger times
  const fit = (text) => (text.length > 19 ? "l" : text.length > 12 ? "m" : "");
  const fitSub = (text) => (text.length > 34 ? "m" : "");
  const sceneLines = S.scenes.map((s) => [
    ...s.big.map((t, i) => ({ text: t, t: (s.bigT?.[i] ?? 0.18 + i * 0.4), kind: "big", accent: s.bigAccent?.includes(i), w: fit(t) })),
    ...s.sub.map((t, i) => ({ text: t, t: (s.subT?.[i] ?? 0.75 + i * 0.38), kind: "sub", emphasis: s.subEmphasis?.includes(i), w: fitSub(t) })),
  ]);

  S.scenes.forEach((s, si) => {
  const dur = s.len, end = s.start + dur;
  css += `
@keyframes sc${si} {
  0%   { opacity: 0; }
  ${Math.round((FADE_IN / dur) * 100)}%   { opacity: 1; }
  ${Math.round(((dur - FADE_OUT) / dur) * 100)}% { opacity: 1; }
  100% { opacity: 0; }
}
.scene-${si} { background: ${s.bg}; animation: sc${si} ${dur}s linear both; animation-delay: ${s.start}s; z-index: ${si}; }
.scene-${si} .accent { color: ${s.accent}; }`;

  sceneLines[si].forEach((L, n) => {
    const local = dur - L.t; // appearance -> scene end
    const holdFrac = Math.max(0.12, 1 - FADE_OUT / Math.max(local, 0.01));
    const pop = s.pop ? ", scale(.88)" : "";
    // the last scene's lines hold until the white return overlay sweeps over
    // them; earlier scenes fade their lines out with the scene crossfade
    const endOp = si === S.scenes.length - 1 ? 1 : 0;
    css += `
@keyframes ln${si}_${n} {
  0%   { opacity: 0; transform: translateY(28px)${pop}; }
  ${Math.round((0.32 / Math.max(local, 0.01)) * 100)}% { opacity: 1; transform: translateY(0) scale(1); }
  ${Math.round(holdFrac * 100)}% { opacity: 1; }
  100% { opacity: ${endOp}; }
}
.ln${si}_${n} { animation: ln${si}_${n} ${local}s linear both; animation-delay: ${s.start + L.t}s; }`;
  });
});

if (S.scenes.at(-1).name !== "return") {
  // white overlay fades in over the last 1.5s so the loop seam is invisible:
  // the end state (clean white) equals the start state (hook hidden, white bg)
  const retDelay = Math.max(0, DURATION - 1.5);
  css += `
@keyframes ret {
  0%, 73% { opacity: 0; }
  100%    { opacity: 1; }
}
.return { background: #ffffff; animation: ret 1.5s linear both; animation-delay: ${retDelay}s; z-index: 99; }`;
}

  sceneHtml = S.scenes
    .map((s, si) => {
      const deco = `
  <div class="deco" style="width:340px;height:340px;background:${s.accent};top:-90px;right:-110px"></div>
  <div class="deco" style="width:200px;height:200px;background:${s.accent};bottom:70px;left:-60px"></div>`;
      const rows = sceneLines[si]
        .map((L, n) => `<div class="${L.kind}${L.accent ? " accent" : ""}${L.emphasis ? " emphasis" : ""}${L.w ? ` w${L.w}` : ""} ln${si}_${n}">${L.text}</div>`)
        .join("");
      return `<div class="scene scene-${si}">${deco}<div class="rows">${rows}</div></div>`;
    })
    .join("");
}

const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
html, body { margin: 0; padding: 0; background: #fff; overflow: hidden; }
#stage { width: ${W}px; height: ${H}px; position: relative; font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
.scene { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; box-sizing: border-box; }
.board { position: absolute; inset: 0; background: #fff; }
.board .body { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 84px 90px 0; box-sizing: border-box; }
.kicker { font-size: 30px; font-weight: 700; letter-spacing: .22em; text-transform: uppercase; color: ${S.kickerAccent ?? "#ff6b35"}; }
.title { display: flex; flex-direction: column; font-size: 76px; font-weight: 900; color: ${S.ink}; line-height: 1.08; letter-spacing: -0.02em; margin-top: 22px; }
.cards { display: flex; flex-wrap: wrap; justify-content: space-between; align-content: flex-start; width: 900px; gap: 36px 40px; margin-top: 52px; }
.card { width: 430px; height: 292px; border-radius: 30px; padding: 34px 38px; box-sizing: border-box; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; box-shadow: 0 18px 40px rgba(20, 20, 40, .07); }
.card .num { font-size: 118px; font-weight: 900; line-height: 1; letter-spacing: -0.02em; }
.card .bar { width: 72px; height: 8px; border-radius: 4px; margin: 18px 0 14px; }
.card .label { font-size: 42px; font-weight: 800; color: ${S.ink}; letter-spacing: -0.01em; }
.card .desc { font-size: 31px; font-weight: 600; color: ${S.inkSoft}; margin-top: 6px; line-height: 1.22; }
.foot { display: flex; flex-direction: column; margin-top: 52px; font-size: 44px; font-weight: 800; color: ${S.ink}; }
.f2 { font-size: 37px; font-weight: 600; color: ${S.inkSoft}; margin-top: 10px; }
.rows { display: flex; flex-direction: column; align-items: center; padding: 0 80px; }
.big { font-size: 106px; font-weight: 900; color: ${S.ink}; line-height: 1.07; letter-spacing: -0.02em; }
.big.wm { font-size: 84px; }
.big.wl { font-size: 66px; }
.sub { font-size: 47px; font-weight: 600; color: ${S.inkSoft}; line-height: 1.25; margin-top: 12px; }
.sub.wm { font-size: 41px; }
.sub.emphasis { color: ${S.ink}; font-weight: 800; font-size: 52px; }
.sub.emphasis.wm { font-size: 40px; }
.deco { position: absolute; border-radius: 50%; opacity: .13; pointer-events: none; }
.return { position: absolute; inset: 0; z-index: 99; }
${css}
</style></head>
<body><div id="stage">
${sceneHtml}
${S.mode === "board" ? "" : `<div class="return"></div>`}
</div>${S.mode === "board" ? counterJs : ""}</body></html>`;

// ── render ─────────────────────────────────────────────────────────────────
const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector(S.mode === "board" ? "#stage .board" : "#stage .scene", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 400));

const el = await page.$("#stage");
if (!(await el.boundingBox())) { console.error("no #stage box"); process.exit(1); }

// Headless screenshots can return stale compositor frames (blank/mid-fade
// content), so a requestAnimationFrame is forced before every capture to
// commit the current animation state, plus a short beat between shots.
mkdirSync("frames-tagged", { recursive: true });
await page.evaluate(() => new Promise(requestAnimationFrame));
const t0 = await page.evaluate(() => performance.now());
const tagged = [];
for (let b = 0; b < 900; b++) {
  const shot = await page.$("#stage");
  const path = `frames-tagged/s_${String(b).padStart(4, "0")}.png`;
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const t = await page.evaluate(() => performance.now());
  await shot.screenshot({ path });
  tagged.push({ t, path });
  if (t - t0 > (DURATION + 1) * 1000) break;
  await new Promise((r) => setTimeout(r, 25));
}
console.log(`burst: ${tagged.length} captures`);

mkdirSync("frames-anim", { recursive: true });
let used = 0;
for (let i = 0; i < TOTAL; i++) {
  const want = (i * 1000) / FPS;
  let best = null;
  for (const fr of tagged) if (!best || Math.abs(fr.t - want) < Math.abs(best.t - want)) best = fr;
  if (best) { copyFileSync(best.path, `frames-anim/f_${String(i).padStart(3, "0")}.png`); used++; }
}
console.log(`subsampled: ${used}/${TOTAL}`);

if (posterPath) {
  const wantPoster = (S.mode === "board" ? (S.footerTimes?.[1] ?? 8.8) + 0.75 : S.scenes.at(-1).start + 0.8) * 1000;
  let best = tagged[0];
  for (const fr of tagged) if (Math.abs(fr.t - wantPoster) < Math.abs(best.t - wantPoster)) best = fr;
  copyFileSync(best.path, posterPath);
  console.log("poster saved:", posterPath);
}

await browser.close();
rmSync("frames-tagged", { recursive: true, force: true });

const cmd = `ffmpeg -y -framerate ${FPS} -i frames-anim/f_%03d.png -vf "scale=${W}:${H}:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" -loop 0 ${outGif}`;
execSync(cmd, { stdio: ["ignore", "pipe", "inherit"] });
rmSync("frames-anim", { recursive: true, force: true });
console.log("GIF saved:", outGif);
