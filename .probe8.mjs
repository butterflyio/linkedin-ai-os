import { execSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
// extract the html the renderer builds by requiring the module with a temp file? simpler: read source and exec the html-building part via node -e
// Instead reuse: render-story builds html only when run; we can't import it (it auto-runs). Use node to print generated html via a tiny copy:
