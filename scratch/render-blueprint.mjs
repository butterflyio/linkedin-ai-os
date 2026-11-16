// Render the 'blueprint' infographic (Charlie-style): 1080x1350 PNG.
// Blueprint grid bg, numbered accent spine chips, white cards + accent branch
// lines, big H1 with key noun highlighted, avatar chip, footer.
// Usage: node render-blueprint.mjs spec.json out.png [--chrome PATH]
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const argv = process.argv.slice(2);
const specFile = argv[0], outPng = argv[1] || "backend-infographic.png";
const ci = argv.indexOf("--chrome");
const chrome = ci !== -1 ? argv[ci + 1] : "/snap/bin/chromium";
const S = JSON.parse(readFileSync(specFile, "utf8"));
const W = 1080, H = 1350;

let chips = "";
let lineIdx = 0;
S.pills.forEach((p, i) => {
  const y = 300 + i * 170;
  const bullets = p.points.map((t) => `<div class="pt">${t}</div>`).join("");
  chips += `
  <div class="step" style="top:${y}px">
    <div class="dot" style="background:${p.accent}"></div>
    <div class="chip" style="border:2px solid ${p.accent};color:${p.accent}">${p.n}</div>
    <div class="card">
      <div class="ct" style="color:${p.accent}">${p.title}</div>
      ${bullets}
    </div>
  </div>`;
});
const close = S.closing.map((c, i) => `<div class="kc">${c}</div>`).join("");
const gridLines = [];
for (let x = 0; x <= W; x += 40) gridLines.push(`<div class="gv" style="left:${x}px"></div>`);
for (let y = 0; y <= H; y += 40) gridLines.push(`<div class="gh" style="top:${y}px"></div>`);

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:${W}px;height:${H}px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#fafaf7;position:relative}
.gv{position:absolute;top:0;bottom:0;width:1px;background:#e9edf2}
.gh{position:absolute;left:0;right:0;height:1px;background:#e9edf2}
.star{position:absolute;right:-120px;top:-90px;font-size:180px;color:#f3ede0;user-select:none;transform:rotate(12deg)}
.head{position:absolute;left:64px;top:64px;right:64px}
.k{font-size:22px;font-weight:600;letter-spacing:.3em;color:#2F7BF6;text-transform:uppercase}
.t{font-size:72px;font-weight:900;letter-spacing:-.02em;color:#0b0b0c;margin-top:10px}
.t b{color:#2F7BF6}
.sub{font-size:26px;color:#4a4f57;margin-top:12px;max-width:860px}
.avatar{position:absolute;right:64px;top:74px;display:flex;align-items:center;gap:12px}
.av{width:52px;height:52px;border-radius:50%;background:#0b0b0c;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:22px}
.an{font-size:18px;font-weight:700;color:#1c1e26}
.an span{display:block;font-weight:500;color:#7a8296;font-size:15px}
.step{position:absolute;left:60px;width:760px;height:150px}
.dot{position:absolute;left:4px;top:18px;width:18px;height:18px;border-radius:50%;box-shadow:0 0 0 5px rgba(0,0,0,.05)}
.line{position:absolute;left:12px;top:22px;width:64px;height:126px;border-left:3px solid #cfd5dd;border-bottom:3px solid #cfd5dd}
.chip{position:absolute;left:8px;top:10px;width:52px;height:52px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:22px;background:#fff}
.card{position:absolute;left:84px;top:0;width:660px;border:1.5px solid #eae9e4;border-radius:18px;background:#fff;padding:18px 22px;box-shadow:0 10px 24px rgba(20,25,45,.05)}
.ct{font-size:30px;font-weight:800;letter-spacing:-.01em}
.pt{font-size:20px;color:#3c414b;margin-top:8px;line-height:1.25}
.pt:before{content:"·";display:inline-block;width:14px;color:#c9cdd6}
.closing{position:absolute;left:60px;bottom:96px;width:960px;display:flex;gap:14px}
.kc{flex:1;border:1.5px solid #eae9e4;border-radius:14px;background:#fff;padding:14px 16px;font-size:19px;font-weight:700;color:#1c1e26;text-align:center}
.foot{position:absolute;left:64px;bottom:26px;right:64px;border-top:1px solid #e6e6e2;padding-top:14px;display:flex;justify-content:space-between;font-size:18px;color:#7a8296}
.foot b{color:#2F7BF6}
</style></head><body>
${gridLines.join("\n")}
<div class="star">✦</div>
<div class="avatar"><div class="av">Z</div><div class="an">Zain Khan<span>building agentic websites</span></div></div>
<div class="head">
  <div class="k">the backend, explained</div>
  <div class="t">AGENTIC AI <b>for your website</b></div>
  <div class="sub">${S.sub}</div>
</div>
${chips}
${S.pills.map((p, i) => `<div class="line" style="top:${300 + i * 170 + 20}px;border-color:${p.accent}55"></div>`).join("\n")}
<div class="closing">${close}</div>
<div class="foot"><span>${S.footer}</span><span>front end design system <b>coming next →</b></span></div>
</body></html>`;

const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => new Promise(requestAnimationFrame));
await new Promise((r) => setTimeout(r, 120));
await page.screenshot({ path: outPng });
await browser.close();
console.log("blueprint saved:", outPng);