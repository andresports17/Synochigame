// Turns the single-file build (dist-single/index.html) into a page fragment for
// hosts that supply their own <html>/<head>/<body> skeleton (e.g. a Claude artifact).
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist-single/index.html', 'utf8');
const pick = (re) => [...html.matchAll(re)].map((m) => m[0]).join('\n');
const head = [
  pick(/<title>[\s\S]*?<\/title>/g),
  pick(/<meta name="(claude:viewport-fit-sides|description)"[^>]*>/g),
  pick(/<link rel="(preconnect|stylesheet)"[^>]*>/g),
  pick(/<style[\s\S]*?<\/style>/g),
].join('\n');
const scripts = pick(/<script type="module"[\s\S]*?<\/script>/g);
const out = `${head}\n<div id="root"></div>\n${scripts}\n`;
writeFileSync('dist-single/synochi-web-demo.html', out);
console.log(`wrote dist-single/synochi-web-demo.html (${(out.length / 1024).toFixed(0)} KB)`);
