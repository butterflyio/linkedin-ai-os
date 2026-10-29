// Server-side render AntV Infographic DSL to SVG (no browser needed).
// Fast content verification - grep the SVG for expected labels before rasterizing.
// Usage: node ssr-render.mjs <dsl-file> <out.svg>
import { readFileSync, writeFileSync } from 'node:fs';
import { renderToString } from '@antv/infographic/ssr';

const [dslFile, outSvg] = process.argv.slice(2);
if (!dslFile || !outSvg) {
  console.error('Usage: node ssr-render.mjs <dsl-file> <out.svg>');
  process.exit(1);
}
const syntax = readFileSync(dslFile, 'utf8').trim();
const svg = await renderToString(syntax);
writeFileSync(outSvg, svg);
console.log('SVG saved:', outSvg, '(', Buffer.byteLength(svg), 'bytes )');
