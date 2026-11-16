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
} else if (S.mode === "flow") {
  // ── flow mode: engineered spec-diagram, highlight sweep + payoff ────────
  // (reference style: grid-paper base, numbered step cards with tint+border,
  // icon tiles, micro-labels, chip rows, connector rail; ONE deliberate sweep
  // of a highlight down the flow and a single state-flip payoff at the end)
  const ST = S.steps ?? [];
  const stepStart = S.stepStart ?? 0.7;
  const stepStep = S.stepStep ?? 0.3;
  const CARD_TOP = 296, CARD_H = 150, CARD_GAP = 18, CARD_LEFT = 96, CARD_W = 884;
  const RLINE_X = 46, RLINE_TOP = CARD_TOP + CARD_H / 2, RLINE_BOTTOM = CARD_TOP + (ST.length - 1) * (CARD_H + CARD_GAP) + CARD_H / 2;
  const sweepStart = S.sweepStart ?? 2.2, payoffAt = S.payoffAt ?? 7.0;

  css = `
.flow { background-color: #f2f3f5; background-image:
  linear-gradient(rgba(213,217,226,.6) 1px, transparent 1px),
  linear-gradient(90deg, rgba(213,217,226,.6) 1px, transparent 1px);
  background-size: 34px 34px; }
@keyframes fkick { 0% { opacity: 0; transform: translateY(-16px); } 100% { opacity: 1; transform: none; } }
.kicker { animation: fkick .45s ease-out both; animation-delay: .35s; }
@keyframes ft { 0% { opacity: 0; transform: translateY(-20px); } 100% { opacity: 1; transform: none; } }
.title { animation: ft .5s cubic-bezier(.2,.7,.3,1.15) both; animation-delay: .55s; }
@keyframes sweepUp { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(-26px); } }
.body { animation: sweepUp .8s ease-in both; animation-delay: ${S.duration - 1.1}s; }
@keyframes fup { 0% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: none; } }
.fl { animation: fup .5s ease-out both; animation-delay: ${S.footerTimes?.[0] ?? 7.8}s; }
.fr { animation: fup .5s ease-out both; animation-delay: ${S.footerTimes?.[1] ?? 8.1}s; }
@keyframes railin { from { opacity: 0; } to { opacity: 1; } }
.rail { animation: railin .6s ease-out both; animation-delay: ${stepStart + 0.3}s; }`;

  ST.forEach((st, i) => {
    const t = stepStart + i * stepStep;
    const y = CARD_TOP + i * (CARD_H + CARD_GAP);
    const cy = y + CARD_H / 2;
    const sweepA = (sweepStart + i * 0.36).toFixed(2);
    const sweepB = (sweepStart + 3.0 + i * 0.36).toFixed(2); // second pass covers late loop
    css += `
@keyframes stin${i} { 0% { opacity: 0; transform: translateY(16px); } 100% { opacity: 1; transform: none; } }
@keyframes hl${i} { 0% { box-shadow: 0 0 0 2px transparent; } 35% { box-shadow: 0 0 0 4px ${st.accent}; } 100% { box-shadow: 0 0 0 2px transparent; } }
@keyframes chipin${i} { 0% { opacity: 0; transform: translateY(8px); } 100% { opacity: 1; transform: none; } }
.step${i} { left: ${CARD_LEFT}px; top: ${y}px; background: ${st.tint}; border: 1.5px solid ${st.accent}59;
  animation: stin${i} .42s cubic-bezier(.2,.7,.3,1.2) both, hl${i} .55s ease-in-out ${sweepA}s 1 both, hl${i} .55s ease-in-out ${sweepB}s 1 none; }
.step${i} .chips { animation: chipin${i} .35s ease-out both; animation-delay: ${(t + 0.22).toFixed(2)}s; }
.step${i} .dot { top: ${cy - 18}px; }`;
    st.chips?.forEach((ch, ci) => {
      if (ch.toggle !== undefined) {
        const on = ch.toggle; // on = currently ON (knob right)
        css += `
@keyframes tg${i}_${ci} { from { background: ${on ? st.accent : "#c9cedb"}; } to { background: ${on ? "#c9cedb" : st.accent}; } }
@keyframes kn${i}_${ci} { from { transform: ${on ? "translateX(20px)" : "none"}; } to { transform: ${on ? "none" : "translateX(20px)"}; } }
.step${i} .tg${ci} { animation: tg${i}_${ci} .35s ease-out ${payoffAt}s both; }
.step${i} .kn${ci} { animation: kn${i}_${ci} .35s ease-out ${payoffAt}s both; }`;
      }
    });
  });

  const stepsHtml = ST.map((st, i) => {
    const chips = (st.chips ?? [])
      .map((ch, ci) => {
        if (ch.toggle !== undefined) {
          const on = ch.toggle;
          const knobStyle = on ? "transform:translateX(20px)" : "";
          return `<span class="ctog"><span class="track tg${ci}"><span class="ckn kn${ci}" style="${knobStyle}"></span></span><span class="ctxt">${ch.text}</span></span>`;
        }
        return `<span class="chip${ch.dashed ? " cdas" : ""}${ch.pill ? " cpill" : ""}">${ch.tick ? `<span class="cok">✓</span>` : ch.dot ? `<span class="cdot" style="background:${ch.dot}"></span>` : ""}${ch.text}</span>`;
      })
      .join("");
    return `<div class="stepcard step${i}">
  <div class="tile" style="color:${st.accent};border:1.5px solid ${st.accent}22">${st.icon}</div>
  <div class="scol">
    <div class="badge" style="color:${st.accent}">${st.badge}</div>
    <div class="stitle">${st.title}</div>
    <div class="ssub">${st.sub}</div>
    <div class="chips">${chips}</div>
  </div>
</div>`;
  }).join("\n");

  const railDots = ST.map((st, i) => {
    const cy = CARD_TOP + i * (CARD_H + CARD_GAP) + CARD_H / 2;
    return `<div class="dot rdot" style="top:${cy - 18}px">${String(i + 1).padStart(2, "0")}</div>`;
  }).join("\n");

  sceneHtml = `
<div class="flow">
<div class="body">
  <div class="fh">
    <div class="kicker">${S.kicker}</div>
    <div class="title"><span>${S.title[0]}</span><span>${S.title[1] ?? ""}</span></div>
    <div class="fbyline"><span class="fav">Z</span>${S.byline ?? ""}</div>
  </div>
  ${stepsHtml}
  <div class="rail"><div class="rline" style="top:${RLINE_TOP}px;height:${RLINE_BOTTOM - RLINE_TOP}px;left:${RLINE_X}px"></div>${railDots}</div>
</div>
<div class="footbar"><div class="fl">${S.footerLeft ?? ""}</div><div class="fr">${S.footerRight ?? ""}</div></div>
<div class="doodle d2" style="left:-110px;bottom:-90px"></div>
</div>`;
} else if (S.mode === "trailer") {
  // Trailer v3 - brand palette, realistic light iPhones, designed mini-site.
  const D = S.duration || 6.0;
  const L = S.left || {}, Rc = S.right || {}, M = S.mid || {};
  const BLUE = "#0667d2", PURPLE = "#6a3fd1", TEAL = "#0f8fa8", INK = "#1c1e26";
  const SOFT = "#f2f5f9", LINE = "#dfe5ee";
  css = `
.trailer{position:absolute;inset:0;overflow:hidden;background:#fbfcfe;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
.blob{position:absolute;border-radius:50%;filter:blur(14px)}
.b1{width:330px;height:330px;left:-140px;top:-120px;background:#e3edfb}
.b2{width:360px;height:360px;right:-150px;top:-110px;background:#efe8fb}
.b3{width:280px;height:280px;left:-70px;bottom:-130px;background:#e4f4f7}
.b4{width:300px;height:300px;right:-80px;bottom:-140px;background:#fdeee7}
.kicker{position:absolute;top:32px;left:0;right:0;text-align:center;font-size:18px;font-weight:800;letter-spacing:.26em;text-transform:uppercase;color:#3b4252}
.phone{position:absolute;border-radius:44px;background:#1c1d24;padding:9px;box-shadow:0 20px 46px rgba(30,45,90,.22);z-index:2}
.screen{position:relative;border-radius:34px;overflow:hidden;background:#fff;width:100%;height:100%}
.island{position:absolute;top:9px;left:50%;transform:translateX(-50%);width:38%;height:13px;border-radius:7px;background:#05060a;z-index:3}
.home{position:absolute;bottom:7px;left:50%;transform:translateX(-50%);width:34px;height:4px;border-radius:2px;background:#d6dae2;z-index:3}
.pleft{width:132px;height:272px;left:70px;top:140px}
.plb{position:absolute;left:16px;right:16px;bottom:18px;display:flex;gap:5px;justify-content:center;align-items:center}
.plb i{width:7px;height:7px;border-radius:50%;background:${BLUE};opacity:.25;animation:bd 1.5s ease-in-out infinite}
.plb i:nth-child(2){animation-delay:.22s}.plb i:nth-child(3){animation-delay:.44s}
@keyframes bd{0%,100%{opacity:.25;transform:translateY(0)}45%{opacity:1;transform:translateY(-3px)}}
.phead{display:flex;flex-direction:column;align-items:center;padding:40px 10px 0}
.phead .tt{font-size:15px;font-weight:900;letter-spacing:.2em;color:${BLUE}}
.phead .role{font-size:9px;color:#7a8296;letter-spacing:.08em;margin-top:2px}
.plist{display:flex;flex-direction:column;gap:8px;padding:14px 12px 0}
.plist div{height:34px;border:1.5px solid ${LINE};background:#fff;border-radius:12px}
.plist div span{display:block;height:8px;width:60%;border-radius:4px;background:${SOFT};margin:12px 10px}
.plist div:nth-child(1) span{background:${BLUE};opacity:.55}
.plist div:nth-child(2) span{background:${BLUE};opacity:.3}
.plist div:nth-child(3) span{background:${BLUE};opacity:.18}
.pright{width:132px;height:272px;left:598px;top:140px}
.prb{position:absolute;left:0;right:0;bottom:18px;text-align:center}
.prb i{display:inline-block;width:6px;height:13px;background:${PURPLE};animation:cu 1s steps(1) infinite}
@keyframes cu{0%,49%{opacity:1}50%,100%{opacity:0}}
.pmid{width:168px;height:352px;left:316px;top:72px;z-index:3}
.bar{display:flex;align-items:center;gap:5px;height:30px;padding:0 10px;background:#fafbfd;border-bottom:1px solid ${LINE}}
.bar i{width:7px;height:7px;border-radius:50%}
.bar .url{flex:1;height:15px;border-radius:8px;background:#f0f3f7;font-size:7px;line-height:15px;color:#6b7280;padding:0 8px}
.page{position:absolute;left:0;right:0;top:30px;bottom:26px;background:#fff;will-change:transform}
.hero{height:104px;background:linear-gradient(135deg,${BLUE},${TEAL});position:relative}
.hero div{position:absolute;left:12px;bottom:12px;color:#fff}
.hero div i{display:block;font-style:normal;font-size:13px;font-weight:900}
.hero div em{font-style:normal;font-size:8px;opacity:.85}
.shot{height:64px;margin:8px;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(30,50,100,.12)}
.shot img{width:100%;height:100%;object-fit:cover;object-position:50% 10%;transform:scale(1.25);transform-origin:50% 4%}
.cardz{display:flex;gap:8px;padding:0 8px 8px}
.cardz div{flex:1;border:1px solid ${LINE};border-radius:10px;padding:8px}
.cardz div i{display:block;font-style:normal;font-size:7px;color:#5b6474;height:8px;width:80%;background:${SOFT};border-radius:4px}
.cardz div i + i{margin-top:5px;width:55%}
.cardz div:nth-child(1){border-top:3px solid ${BLUE}}
.cardz div:nth-child(2){border-top:3px solid ${PURPLE}}
.rib{position:absolute;left:8px;right:8px;bottom:6px;height:20px;border-radius:10px;background:rgba(255,255,255,.92);box-shadow:0 2px 8px rgba(40,55,95,.12);display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:800;color:#11131a;z-index:2}
.rib b{color:${TEAL}}
`;
  const LB = L.title || "AGENT", LR = L.role || "the back end";
  let siteSrc = S.siteImg || "";
  try { const _b = readFileSync(S.siteImg); siteSrc = "data:image/png;base64," + _b.toString("base64"); } catch (e) {}

  const RB = Rc.title || "HUMAN", RR = Rc.role || "the front end";
  counterJs = `<script>
const t0 = performance.now();
const D = ${D};
const B = ${JSON.stringify(S.beats || [1.5, 3.0, 4.5, 5.5])};
const R = ${JSON.stringify((M.ribbons || ["you, together", "agent + human", "front + back"]).slice(0, 3))};
const rib = document.getElementById("rib"), pg = document.getElementById("pg");
const inr = (a, b, t) => t >= a && t < b;
function tick(){
  const t = ((performance.now() - t0) / 1000) % D;
  let idx = 0; for (let i = 0; i < B.length; i++) if (t >= B[i]) idx = (i + 1) % R.length;
  if (rib) rib.innerHTML = R[idx].split("+").map((x, i) => i ? "<b>+</b>" + x : x).join("");
  if (pg) { const s = t > 2.2 && t < 5.2 ? -14 : 0; pg.style.transform = "translateY(" + s + "px)"; }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
</script>`;
  sceneHtml = `
<div class="trailer">
  <div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div><div class="blob b4"></div>
  <div class="kicker">${S.kicker || "AGENT × HUMAN → ONE SITE"}</div>
  <div class="phone pleft"><div class="screen"><div class="island"></div>
    <div class="phead"><div class="tt">${LB}</div><div class="role">${LR}</div></div>
    <div class="plist"><div><span></span></div><div><span></span></div><div><span></span></div></div>
    <div class="plb"><i></i><i></i><i></i></div>
    <div class="home"></div>
  </div></div>
  <div class="phone pmid"><div class="screen"><div class="island"></div><div class="bar">
    <i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i>
    <div class="url">${S.siteUrl || "zainkhan.me"}</div></div>
    <div class="page" id="pg">
      <div class="hero"><div><i>zain khan</i><em>AI · agents · the open person company</em></div></div>
      <div class="shot"><img src="${siteSrc}" alt=""></div>
      <div class="cardz"><div><i></i><i></i></div><div><i></i><i></i></div></div>
    </div>
    <div class="rib" id="rib">you, together</div>
    <div class="home"></div>
  </div></div>
  <div class="phone pright"><div class="screen"><div class="island"></div>
    <div class="phead"><div class="tt">${RB}</div><div class="role">${RR}</div></div>
    <div class="plist"><div><span></span></div><div><span></span></div><div><span></span></div></div>
    <div class="prb"><i></i></div>
    <div class="home"></div>
  </div></div>
</div>`;
} else if (S.mode === "canvas") {} else if (S.mode === "canvas") {} else if (S.mode === "canvas") {
  // ── canvas mode: rich single frame, many elements animating at once ─────
  // (reference style: soft pastel gradient stays static; chips, pills, hero
  // counter, equalizer bars and ambient dots all move in place continuously)
  const C = S.chips ?? [];
  const step = S.chipsStep ?? 0.16;
  const start = S.chipsStart ?? 0.85;
  const tau = Math.PI * 2;

  css = `
.canvas { background: ${S.bg}; }
@keyframes popIn { 0% { opacity: 0; transform: translateY(-46px) scale(.92); } 70% { opacity: 1; transform: translateY(0) scale(1.03); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
@keyframes kick { 0% { opacity: 0; transform: translateY(-20px); } 100% { opacity: 1; transform: none; } }
.kicker { animation: kick .5s ease-out both; animation-delay: .45s; }
@keyframes tt { 0% { opacity: 0; transform: translateY(-26px); } 100% { opacity: 1; transform: none; } }
.title { animation: tt .55s cubic-bezier(.2,.7,.3,1.15) both; animation-delay: .7s; }
@keyframes up { 0% { opacity: 0; transform: translateY(24px); } 100% { opacity: 1; transform: none; } }
.f1 { animation: up .5s ease-out both; animation-delay: ${S.footerTimes?.[0] ?? 4.8}s; }
.f2 { animation: up .5s ease-out both; animation-delay: ${S.footerTimes?.[1] ?? 5.3}s; }
@keyframes sweepUp { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(-26px); } }
.body { animation: sweepUp .8s ease-in both; animation-delay: ${S.duration - 1.1}s; }`;

  // per-chip: pop-in at stagger, then perpetual phase-shifted bob
  C.forEach((c, i) => {
    const t = start + i * step;
    const bobDelay = -(i * 0.53).toFixed(2);
    css += `
.chip${i} { animation: popIn .55s cubic-bezier(.2,.7,.3,1.15) both; animation-delay: ${t}s; }
.chip${i} .bob { animation: bob ${(2.9 + (i % 3) * 0.5).toFixed(1)}s ease-in-out ${bobDelay}s infinite; }
@keyframes nv${i} { 0% { opacity: 0; transform: translateY(12px); } 100% { opacity: 1; transform: none; } }
.chip${i} .num { animation: nv${i} .4s ease-out both; animation-delay: ${t + 0.15}s; }
@keyframes lb${i} { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: none; } }
.chip${i} .lbl { animation: lb${i} .4s ease-out both; animation-delay: ${t + 0.28}s; }
@keyframes ds${i} { 0% { opacity: 0; } 100% { opacity: 1; } }
.chip${i} .dsc { animation: ds${i} .4s ease-out both; animation-delay: ${t + 0.4}s; }`;
    if (c.hero) {
      const circ = 2 * tau * 52; // r=52
      css += `
@keyframes arc${i} { from { stroke-dashoffset: ${circ.toFixed(1)}; } to { stroke-dashoffset: 0; } }
.chip${i} .arc { animation: arc${i} .8s ease-out both; animation-delay: ${t + 0.35}s; }
@keyframes pulse { 0% { transform: scale(.6); opacity: .55; } 75% { transform: scale(1.3); opacity: 0; } 100% { transform: scale(1.3); opacity: 0; } }
.chip${i} .pulse { animation: pulse 2.8s ease-out -1.4s infinite; }`;
    }
  });

  // pills: drop in staggered, drift forever
  (S.pills ?? []).forEach((p, i) => {
    const t = (S.pillStart ?? 3.4) + i * 0.24;
    css += `
@keyframes pkin${i} { 0% { opacity: 0; transform: translateY(22px) scale(.9); } 100% { opacity: 1; transform: none; } }
.pill${i} { animation: pkin${i} .45s cubic-bezier(.2,.7,.3,1.15) both; animation-delay: ${t}s; }
.pill${i} .blob { animation: bob ${(2.4 + (i % 3) * 0.45).toFixed(2)}s ease-in-out ${(-i * 0.7).toFixed(2)}s infinite; }`;
  });

  // equalizer bars: perpetual staggered heartbeat
  ["#3d7eff", "#2fa36b", "#ff6b35", "#7b5bd6", "#0ea5a5", "#f59e0b", "#3d7eff", "#2fa36b"].forEach((col, i) => {
    css += `
@keyframes eq${i} { 0%,100% { transform: scaleY(.3); } 50% { transform: scaleY(1); } }
.eq${i} { background: ${col}; animation: eq${i} ${(1.3 + (i % 4) * 0.22).toFixed(2)}s ease-in-out ${(-i * 0.19).toFixed(2)}s infinite; }`;
  });

  // ambient dots: tiny pastel circles drifting, phase-spread
  for (let i = 0; i < (S.dots ?? 10); i++) {
    const col = ["#a8c8ff", "#9fe3b5", "#ffc79e", "#c9b4f5", "#9fe8e6"][i % 5];
    const x = (7 + ((i * 37) % 86)).toFixed(1);
    const y = (24 + ((i * 53) % 60)).toFixed(1);
    const s = 10 + (i % 3) * 6;
    const d = (2.2 + (i % 5) * 0.34).toFixed(2);
    css += `
@keyframes db${i} { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-18px); } }
.dot${i} { left: ${x}%; top: ${y}%; width: ${s}px; height: ${s}px; background: ${col}; animation: db${i} ${d}s ease-in-out ${(-i * 0.61).toFixed(2)}s infinite; }`;
  }

  const chipHtml = C.map((c, i) => {
    const hero = c.hero ? " hero" : "";
    const descLines = (c.desc ?? "").split("\n").map((l) => `<div>${l}</div>`).join("");
    const arc = c.hero
      ? `<svg class="arc" viewBox="0 0 120 120" style="position:absolute;inset:-16px;width:120%;height:120%">
           <circle cx="60" cy="60" r="52" fill="none" stroke="${c.accent}" stroke-width="7" stroke-linecap="round" stroke-dasharray="326.7"/>
         </svg>`
      : "";
    const pulse = c.hero ? `<div class="pulse" style="position:absolute;top:50%;left:50%;width:300px;height:300px;margin:-150px 0 0 -150px;border-radius:50%;border:3px solid ${c.accent}"></div>` : "";
    return `<div class="pos" style="left:${c.x}%;top:${c.y}%"><div class="chip chip${i}${hero}">
  <div class="bob">
    <div class="card">
      ${c.num !== undefined ? `<div class="num" id="n${i}" style="color:${c.accent}">0</div>` : `<div class="num tag" style="color:${c.accent}">${c.label}</div>`}
      ${c.num !== undefined ? `<div class="lbl">${c.label}</div>` : ""}
      <div class="dsc">${descLines}</div>
    </div>
  </div>
  ${arc}${pulse}
</div></div>`;
  }).join("\n");

  const pillHtml = (S.pills ?? [])
    .map((p, i) => `<div class="pos" style="left:${(30 + i * 20).toFixed(1)}%;top:78%"><div class="pill pill${i}"><div class="blob">${p}</div></div></div>`)
    .join("\n");
  const eqHtml = Array.from({ length: 8 }, (_, i) => `<div class="eq eq${i}"></div>`).join("");
  const dotHtml = Array.from({ length: S.dots ?? 10 }, (_, i) => `<div class="dot dot${i}"></div>`).join("");

  sceneHtml = `
<div class="canvas">
<div class="body">
  <div class="kicker" style="margin-top:84px">${S.kicker}</div>
  <div class="title" style="margin-top:20px"><span>${S.title[0]}</span><span>${S.title[1] ?? ""}</span></div>
  ${chipHtml}
  ${pillHtml}
  <div class="eqwrap">${eqHtml}</div>
  <div class="foot">
    <div class="f1">${S.footer?.[0] ?? ""}</div>
    <div class="f2">${S.footer?.[1] ?? ""}</div>
  </div>
</div>
${dotHtml}
</div>`;

  counterJs = `<script>
const t0 = performance.now();
const jobs = ${JSON.stringify(
    C.map((c, i) => ({ id: "n" + i, start: start + i * step + 0.18, value: c.num })).filter((j) => j.value !== undefined),
  )};
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
.board .cards { display: flex; flex-wrap: wrap; justify-content: space-between; align-content: flex-start; width: 900px; gap: 36px 40px; margin-top: 52px; }
.board .card { width: 430px; height: 292px; border-radius: 30px; padding: 34px 38px; box-sizing: border-box; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; box-shadow: 0 18px 40px rgba(20, 20, 40, .07); }
.board .card .num { font-size: 118px; font-weight: 900; line-height: 1; letter-spacing: -0.02em; }
.board .card .bar { width: 72px; height: 8px; border-radius: 4px; margin: 18px 0 14px; }
.board .card .label { font-size: 42px; font-weight: 800; color: ${S.ink}; letter-spacing: -0.01em; }
.board .card .desc { font-size: 31px; font-weight: 600; color: ${S.inkSoft}; margin-top: 6px; line-height: 1.22; }
.board .kicker { font-size: 30px; font-weight: 700; letter-spacing: .22em; text-transform: uppercase; color: ${S.kickerAccent ?? "#ff6b35"}; }
.board .title { display: flex; flex-direction: column; font-size: 76px; font-weight: 900; color: ${S.ink}; line-height: 1.08; letter-spacing: -0.02em; margin-top: 22px; }
.board .foot { display: flex; flex-direction: column; margin-top: 52px; font-size: 44px; font-weight: 800; color: ${S.ink}; }
.board .f2 { font-size: 37px; font-weight: 600; color: ${S.inkSoft}; margin-top: 10px; }
.flow { position: absolute; inset: 0; }
.flow .body { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: flex-start; }
.fh { margin: 44px 0 0 96px; text-align: left; }
.flow .kicker { font-size: 27px; font-weight: 700; letter-spacing: .26em; text-transform: uppercase; color: ${S.kickerAccent ?? "#f05a22"}; }
.flow .title { display: flex; flex-direction: column; font-size: 68px; font-weight: 900; color: ${S.ink}; line-height: 1.05; letter-spacing: -0.03em; margin-top: 10px; }
.fbyline { display: flex; align-items: center; gap: 12px; margin-top: 14px; font-size: 22px; font-weight: 600; color: ${S.inkSoft}; }
.fav { width: 34px; height: 34px; border-radius: 50%; background: ${S.kickerAccent ?? "#f05a22"}; color: #fff; font-weight: 800; font-size: 17px; display: flex; align-items: center; justify-content: center; }
.stepcard { position: absolute; width: 884px; height: 150px; border-radius: 18px; box-sizing: border-box; display: flex; align-items: center; gap: 20px; padding: 14px 20px; }
.tile { width: 76px; height: 76px; border-radius: 16px; background: #fff; display: flex; align-items: center; justify-content: center; font-size: 34px; flex: none; box-shadow: 0 4px 14px rgba(24, 30, 60, .07); }
.scol { min-width: 0; flex: 1; }
.badge { font-size: 13.5px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
.stitle { font-size: 30px; font-weight: 800; color: ${S.ink}; margin-top: 2px; letter-spacing: -0.01em; }
.ssub { font-size: 19px; font-weight: 500; color: ${S.inkSoft}; margin-top: 1px; }
.scol { position: relative; }
.badge { display: inline-block; position: absolute; right: 2px; top: 0; background: #fff; border: 1px solid; border-radius: 999px; padding: 3px 12px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 7px; align-items: center; }
.chip { display: inline-flex; align-items: center; gap: 7px; background: #fff; border: 1px solid #e3e6ec; border-radius: 999px; padding: 4px 12px; font-size: 17px; font-weight: 600; color: ${S.ink}; white-space: nowrap; }
.chip.cdas { border: 1.5px dashed #b9bdc7; background: transparent; color: ${S.inkSoft}; }
.chip.cpill { background: #e7f5ec; border-color: #bfe6cf; color: #0e7a45; font-weight: 700; }
.cok { color: #0e7a45; font-weight: 900; font-size: 15px; }
.cdot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.ctog { display: inline-flex; align-items: center; gap: 10px; white-space: nowrap; }
.track { display: block; width: 46px; height: 26px; border-radius: 999px; background: #c9cedb; border: 1px solid #b3b9c8; position: relative; flex: none; box-sizing: border-box; }
.ckn { position: absolute; left: 3px; top: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 5px rgba(20, 26, 40, .32); }
.ctxt { font-size: 17px; font-weight: 700; color: ${S.ink}; }
.rail { position: absolute; inset: 0; pointer-events: none; }
.rline { position: absolute; width: 2px; background: #d6d9e1; }
.rdot { position: absolute; left: 28px; width: 36px; height: 36px; border-radius: 50%; background: #fff; border: 1.5px solid #d6d9e1; color: #5f636e; font-size: 14px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
.footbar { position: absolute; left: 0; right: 0; bottom: 24px; display: flex; justify-content: space-between; padding: 0 96px; font-size: 19px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: ${S.inkSoft}; }
.doodle { position: absolute; width: 460px; height: 460px; border-radius: 50%; background: radial-gradient(circle, rgba(192, 198, 216, .38) 0%, transparent 62%); pointer-events: none; }
.doodle.d2 { background: radial-gradient(circle, rgba(212, 198, 236, .38) 0%, transparent 62%); }
.canvas { position: absolute; inset: 0; }
.canvas .body { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; }
.kicker { font-size: 30px; font-weight: 700; letter-spacing: .22em; text-transform: uppercase; color: ${S.kickerAccent ?? "#ff6b35"}; }
.title { display: flex; flex-direction: column; font-size: 74px; font-weight: 900; color: ${S.ink}; line-height: 1.08; letter-spacing: -0.02em; }
.canvas .pos { position: absolute; transform: translate(-50%, -50%); }
.canvas .chip { position: absolute; width: 292px; }
.chip.hero { width: 348px; z-index: 2; }
.chip .card { position: relative; background: #ffffff; border-radius: 28px; box-shadow: 0 18px 44px rgba(24, 28, 60, .10); padding: 20px 26px 22px; text-align: center; box-sizing: border-box; }
.chip .num { font-size: 82px; font-weight: 900; line-height: 1; letter-spacing: -0.02em; }
.chip.hero .num { font-size: 104px; }
.chip .num.tag { font-size: 64px; line-height: 1.12; }
.chip .lbl { font-size: 20px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: ${S.ink}; margin-top: 12px; }
.chip .dsc { font-size: 23px; font-weight: 600; color: ${S.inkSoft}; margin-top: 8px; line-height: 1.22; }
.canvas .pill { position: absolute; background: #ffffff; border-radius: 999px; white-space: nowrap; width: max-content; box-shadow: 0 12px 30px rgba(24, 28, 60, .08); padding: 15px 30px; font-size: 29px; font-weight: 700; color: ${S.ink}; }
.eqwrap { position: absolute; left: 50%; bottom: 150px; transform: translateX(-50%); display: flex; align-items: center; gap: 9px; height: 36px; }
.eq { width: 10px; height: 36px; border-radius: 5px; transform-origin: bottom; }
.canvas .dot { position: absolute; border-radius: 50%; }
.canvas .foot { margin: 0; position: absolute; left: 50%; bottom: 62px; transform: translateX(-50%); text-align: center; width: 100%; }
.canvas .f1 { font-size: 34px; font-weight: 700; letter-spacing: .08em; color: ${S.inkSoft}; }
.canvas .f2 { font-size: 42px; font-weight: 800; color: ${S.ink}; margin-top: 8px; }
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
${S.mode === "story" ? `<div class="return"></div>` : ""}
</div>${S.mode === "board" || S.mode === "canvas" || S.mode === "trailer" ? counterJs : ""}</body></html>`;

// ── render ─────────────────────────────────────────────────────────────────
const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector(S.mode === "board" ? "#stage .board" : S.mode === "canvas" ? "#stage .canvas" : S.mode === "flow" ? "#stage .flow" : S.mode === "trailer" ? "#stage .trailer" : "#stage .scene", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 400));

if (args.includes("--dump-html")) { await browser.close(); process.stdout.write(html); process.exit(0); }
if (args.includes("--probe")) {
  await new Promise((r) => setTimeout(r, 7600));
  const info = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const chips = {};
    document.querySelectorAll(".chip").forEach((el, i) => {
      const r = el.getBoundingClientRect();
      chips["chip" + i] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    });
    // dump every text-bearing element in steps with its rect
    const texts = [];
    document.querySelectorAll(".stepcard .scol > *, .stepcard .tile").forEach((el) => {
      const r = el.getBoundingClientRect();
      texts.push(`${el.className.split(" ")[0]}: ${JSON.stringify(el.textContent).slice(0, 60)} @x${Math.round(r.x)} y${Math.round(r.y)} w${Math.round(r.width)} h${Math.round(r.height)}`);
    });
    document.querySelectorAll(".stepcard .chips > *").forEach((el) => {
      const r = el.getBoundingClientRect();
      texts.push(`chip: ${JSON.stringify(el.textContent).slice(0, 50)} @x${Math.round(r.x)} y${Math.round(r.y)} w${Math.round(r.width)}`);
    });
    return {
      kicker: pick(".kicker"),
      title: pick(".title"),
      chips,
      pills: [...document.querySelectorAll(".pill")].map((el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }),
      cardRects: [...document.querySelectorAll(".card")].map((el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }),
      foot: pick(".foot"),
      eq: pick(".eqwrap"),
      texts,
    };
  });
  console.log(JSON.stringify(info, null, 1));
  await browser.close();
  process.exit(0);
}

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
  const shot = S.mode === "trailer" ? null : await page.$("#stage");
  const path = `frames-tagged/s_${String(b).padStart(4, "0")}.png`;
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await new Promise((r) => setTimeout(r, 18)); // let JS-driven paints settle before capture
  const t = await page.evaluate(() => performance.now());
  if (shot) await shot.screenshot({ path });
  else await page.screenshot({ path });
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
  const wantPoster = (
    S.mode === "trailer" ? ((S.beats?.[2] ?? 3.5) + 0.45) :
    S.mode === "board" || S.mode === "canvas" || S.mode === "flow" ? (S.footerTimes?.[1] ?? 8.8) + 0.9 : S.scenes.at(-1).start + 0.8
  ) * 1000;
  let best = tagged[0];
  for (const fr of tagged) if (Math.abs(fr.t - wantPoster) < Math.abs(best.t - wantPoster)) best = fr;
  copyFileSync(best.path, posterPath);
  console.log("poster saved:", posterPath);
}

await browser.close();
rmSync("frames-tagged", { recursive: true, force: true });

const cmd = `ffmpeg -y -framerate ${FPS} -i frames-anim/f_%03d.png -vf "scale=${W}:${H}:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=none" -loop 0 ${outGif}`;
execSync(cmd, { stdio: ["ignore", "pipe", "inherit"] });
rmSync("frames-anim", { recursive: true, force: true });
console.log("GIF saved:", outGif);
