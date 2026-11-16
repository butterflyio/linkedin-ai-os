// 'Backend blueprint' infographic (Charlie-style step-through replica).
// Static PNG by default; with --anim out.gif it records a screencast that
// cycles numbers 01->05 (like the reference timer) revealing each panel's
// card + right-rail example, then loops.
// Usage: node render-blueprint.mjs spec.json out.png [--anim out.gif] [--chrome PATH]
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { execSync, execFileSync } from "node:child_process";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const argv = process.argv.slice(2);
const specFile = argv[0], outPng = argv[1] || "backend-infographic.png";
const ai = argv.indexOf("--anim");
const outGif = ai !== -1 ? argv[ai + 1] : null;
const ci = argv.indexOf("--chrome");
const chrome = ci !== -1 ? argv[ci + 1] : "/snap/bin/chromium";
const S = JSON.parse(readFileSync(specFile, "utf8"));
const W = 1080, H = 1350;

const bar = (color, w, h) => `<i style="width:${w}px;height:${h}px;background:${color}"></i>`;
const mocks = [
  `<div class="mock"><div class="mh">DATA SPINE</div>${bar("#2F7BF6", 52, 8)}${bar("#7a8296", 44, 8)}${bar("#c9cdd6", 34, 8)}<div class="mbk">2 cloud</div><div class="mbk">+1 offline</div></div>`,
  `<div class="mock"><div class="mh">CONTENT SYSTEM</div>${bar("#2EA44F", 30, 8)}${bar("#2EA44F", 46, 8)}${bar("#c9cdd6", 40, 8)}<div class="mbk">schedule on</div></div>`,
  `<div class="mock"><div class="mh">LEAD BUILDER</div><div class="mcard">offer</div><div class="mcard">slug →</div><div class="mbk">/your-offer</div></div>`,
  `<div class="mock"><div class="mh">TECH STACK</div><div class="mgrid">${"<i></i>".repeat(9)}</div><div class="mbk">8+ yrs</div></div>`,
  `<div class="mock"><div class="mh">ANALYTICS</div><div style="display:flex;align-items:flex-end;gap:4px;height:44px">${[12, 20, 16, 30, 24, 40].map((b, k) => `<i style="width:8px;height:${b}px;background:${k === 4 ? "#7EC8F5" : "#dfe4ea"};border-radius:2px"></i>`).join("")}</div><div class="mbk">heatmaps · seo</div></div>`,
];

let chips = "";
S.pills.forEach((p, i) => {
  const y = 300 + i * 150;
  const bullets = p.points.map((t) => `<div class="pt">${t}</div>`).join("");
  chips += `
  <div class="step" id="st${i}" style="top:${y}px">
    <div class="rail"><div class="dot"></div><div class="chip">0${p.n}</div></div>
    <div class="card"><div class="ct">${p.title}</div>${bullets}<div class="note">${p.note || ""}</div></div>
    <div class="ex" id="ex${i}">${mocks[i]}</div>
  </div>`;
});

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:${W}px;height:${H}px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#fafaf7;position:relative}
.gv{position:absolute;top:0;bottom:0;width:1px;background:#e9edf2}
.gh{position:absolute;left:0;right:0;height:1px;background:#e9edf2}
.star{position:absolute;right:60px;top:14px;font-size:150px;color:#f3ede0;transform:rotate(12deg)}
.k{position:absolute;left:64px;top:60px;font-size:22px;font-weight:600;letter-spacing:.3em;color:#2F7BF6;text-transform:uppercase}
.t{position:absolute;left:64px;top:108px;font-size:70px;font-weight:900;letter-spacing:-.02em;color:#0b0b0c}
.t b{color:#2F7BF6}
.sub{position:absolute;left:64px;top:196px;font-size:24px;color:#4a4f57;max-width:880px}
.timer{position:absolute;right:66px;top:150px;font-size:120px;font-weight:900;color:#e5e7ea;line-height:1}
.timer b{color:#2F7BF6;font-weight:900}
.step{position:absolute;left:64px;width:640px;height:140px;opacity:.16;transition:opacity .35s ease}
.step.active{opacity:1}
.step .rail{position:absolute;left:0;top:0;width:64px}
.step .chip{width:56px;height:56px;border-radius:16px;background:#fff;border:2px solid #cfd5dd;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:22px;color:#0b0b0c}
.step .rail .dot{position:absolute;left:24px;top:64px;width:8px;height:8px;border-radius:50%;background:#cfd5dd}
.step.active .chip{border-color:#2F7BF6;color:#2F7BF6;box-shadow:0 0 0 5px rgba(47,123,246,.10)}
.step .card{position:absolute;left:84px;top:0;width:540px;border:1.5px solid #eae9e4;border-radius:16px;background:#fff;padding:16px 20px;box-shadow:0 10px 24px rgba(20,25,45,.05)}
.step .ct{font-size:28px;font-weight:800;color:#1c1e26}
.step.active .ct{color:#0b0b0c}
.step .pt{font-size:19px;color:#3c414b;margin-top:6px}
.step .pt:before{content:"·";display:inline-block;width:12px;color:#c9cdd6}
.step .note{font-size:16px;color:#7a8296;margin-top:6px}
.ex{position:absolute;left:670px;top:0;width:180px;opacity:0;transform:translateY(10px);transition:opacity .4s ease,transform .4s ease}
.ex.show{opacity:1;transform:translateY(0)}
.mock{border:1.5px solid #e7e9e4;border-radius:14px;background:#fff;padding:14px;box-shadow:0 12px 28px rgba(20,25,45,.10)}
.mock .mh{font-size:13px;font-weight:800;letter-spacing:.12em;color:#7a8296;margin-bottom:10px}
.mock > i{display:block;border-radius:4px;margin-top:7px}
.mock .mbk{font-size:14px;font-weight:700;color:#2F7BF6;margin-top:10px}
.mock .mcard{height:26px;border:1.5px solid #2F7BF6;border-radius:8px;margin-top:8px;display:flex;align-items:center;justify-content:center;font-size:12px;color:#2F7BF6;font-weight:700}
.mock .mgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.mock .mgrid i{height:22px;border-radius:5px;background:#e7e9e4}
.foot{position:absolute;left:64px;bottom:28px;right:66px;border-top:1px solid #e6e6e2;padding-top:14px;display:flex;justify-content:space-between;font-size:18px;color:#7a8296}
.foot b{color:#2F7BF6}
</style></head><body>
${Array.from({ length: W / 40 + 1 }, (_, x) => `<div class="gv" style="left:${x * 40}px"></div>`).join("")}
${Array.from({ length: H / 40 + 1 }, (_, y) => `<div class="gh" style="top:${y * 40}px"></div>`).join("")}
<div class="star">✦</div>
<div class="k">the backend, explained</div>
<div class="t">AGENTIC AI <b>for the website</b></div>
<div class="sub">${S.sub}</div>
<div class="timer"><b id="num">01</b>/05</div>
${chips}
<div class="foot"><span>${S.footer}</span><span>front end design system <b>coming next →</b></span></div>
<script>
window.__steps = ${S.pills.length};
</script>
</body></html>`;

const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => new Promise(requestAnimationFrame));
await new Promise((r) => setTimeout(r, 120));
await page.screenshot({ path: outPng });

if (outGif) {
  // reveal driver (JS-driven; captured via screencast like the trailer)
  const driver = `(() => {
    const N = ${S.pills.length};
    const t0 = performance.now();
    const D = ${S.duration || 9.5};
    const stepMs = 0; // computed below
    function tick(){
      const t = ((performance.now() - t0) / 1000) % D;
      const idx = Math.floor(t / (D / N)) % N;
      document.querySelectorAll(".step").forEach((el, i) => el.classList.toggle("active", i === idx));
      document.querySelectorAll(".ex").forEach((el, i) => el.classList.toggle("show", i === idx));
      const num = document.getElementById("num");
      if (num) num.textContent = "0" + (idx + 1);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  })();`;
  await page.evaluate(driver);
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const cp = await page.createCDPSession();
  const sf = [];
  cp.on("Page.screencastFrame", async (ev) => {
    sf.push(Buffer.from(ev.data, "base64"));
    try { await cp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }); } catch (e) {}
  });
  const sc0 = Date.now();
  await cp.send("Page.startScreencast", { format: "jpeg", quality: 82, everyNthFrame: 1 });
  await new Promise((r) => setTimeout(r, ((S.duration || 9.5) + 1.0) * 1000));
  await cp.send("Page.stopScreencast");
  const elapsed = (Date.now() - sc0) / 1000;
  mkdirSync("frames-screencast", { recursive: true });
  sf.forEach((b2, i) => require("node:fs").writeFileSync(`frames-screencast/f_${String(i).padStart(4, "0")}.jpg`, b2));
  const fps = Math.max(6, Math.round(sf.length / elapsed));
  const cmd = `ffmpeg -y -framerate ${fps} -i frames-screencast/f_%04d.jpg -vf "fps=12,scale=720:900:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=192[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4" -loop 0 ${outGif}`;
  execSync(cmd, { stdio: ["ignore", "pipe", "inherit"] });
  rmSync("frames-screencast", { recursive: true, force: true });
  console.log("blueprint GIF saved:", outGif);
}
await browser.close();
console.log("blueprint saved:", outPng);