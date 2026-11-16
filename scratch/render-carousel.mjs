// Render a LinkedIn carousel from carousel-story.json -> one PNG per slide.
// Style: full-bleed dark image/gradient, white sentence-case type,
// kicker -> bold headline -> quiet aside, scrim text-safe band, optional
// single underline as the CTA nudge. Placeholder dark backdrops until real
// photos are dropped in (set slide."img" to any image path).
// Usage: node render-carousel.mjs carousel-story.json out-dir [--chrome PATH]
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const argv = process.argv.slice(2);
const specFile = argv[0];
const outDir = argv[1] || "carousel-out";
const chromeIdx = argv.indexOf("--chrome");
const chrome = chromeIdx !== -1 ? argv[chromeIdx + 1] : "/snap/bin/chromium";

const S = JSON.parse(readFileSync(specFile, "utf8"));
const W = 1080, H = 1350;

function slideHtml(sl) {
  const align = sl.align || "center";
  const [c1, c2] = sl.mood || ["#12141c", "#26222f"];
  let img = "";
  if (sl.img) {
    const p = sl.img.startsWith("/") ? sl.img : join("scratch", sl.img);
    try {
      img = `<div class="bgimg" style="background-image:url(data:image/png;base64,${readFileSync(p).toString("base64")});background-size:cover;background-position:center"></div>`;
    } catch (e) {}
  }
  const hStyle = sl.underline ? ";border-bottom:3px solid #fff;padding-bottom:8px;display:inline-block" : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:${W}px;height:${H}px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#0b0c10}
.stage{position:absolute;inset:0;background:radial-gradient(120% 120% at ${align === "right" ? "72% 18%" : "50% 18%"},${c1} 0%,${c2} 70%,#050507 100%)}
.bgimg{position:absolute;inset:0}
.grain{position:absolute;inset:0;background:radial-gradient(90% 70% at 50% 34%,rgba(255,255,255,.07),transparent 62%)}
.scrim{position:absolute;inset:0;background:radial-gradient(120% 130% at 50% 50%,transparent 26%,rgba(0,0,0,.35) 70%,rgba(0,0,0,.66) 100%)}
.text{position:absolute;${align === "right" ? "right:66px;text-align:right" : "left:66px;right:66px;text-align:center"};top:48%;transform:translateY(-50%);color:#fff;max-width:880px}
.k{font-size:34px;font-weight:600;opacity:.92}
.h{font-size:96px;font-weight:800;letter-spacing:-.02em;line-height:1.06;margin-top:18px}
.sub{font-size:34px;font-weight:400;opacity:.86;margin-top:26px;line-height:1.3;font-style:italic}
</style></head><body><div class="stage">${img}<div class="bgimg"></div><div class="grain"></div><div class="scrim"></div>
<div class="text"><div class="k">${sl.kicker || ""}</div><div class="h"><span style="${hStyle}">${sl.headline || ""}</span></div>${sl.sub ? `<div class="sub">${sl.sub}</div>` : ""}</div>
</div></body></html>`;
}

const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox", "--disable-gpu"] });
mkdirSync(outDir, { recursive: true });
const out = [];
for (let i = 0; i < S.slides.length; i++) {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.setContent(slideHtml(S.slides[i]), { waitUntil: "load" });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await new Promise((r) => setTimeout(r, 120));
  const path = join(outDir, `slide-${String(i + 1).padStart(2, "0")}.png`);
  await page.screenshot({ path });
  out.push(path);
  await page.close();
}
await browser.close();
console.log("carousel saved:", out.join(", "));