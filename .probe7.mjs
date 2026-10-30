import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const html = readFileSync("scratch/render-story.mjs", "utf8");
// extract scenes html by re-running with a tiny driver: import is heavy; instead replicate: use --probe path in render-story
const chrome = "/home/zain/.cache/pptr/chrome-headless-shell/linux-156.0.8078.80/chrome-headless-shell-linux64/chrome-headless-shell";
const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "load" });
