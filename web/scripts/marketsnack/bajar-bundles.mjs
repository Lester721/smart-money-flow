// Guarda a disco los bundles de la app de MarketSnack para poder greparlos con calma.
// La app es un SPA: TODAS las rutas devuelven el mismo HTML de 3,3 kB, así que la única
// fuente de verdad sobre qué endpoints existen es su JavaScript.
//
// Uso: node scripts/marketsnack/bajar-bundles.mjs

import fs from "node:fs";
import path from "node:path";

const BASE = "https://app.marketsnack.com";
const C = fs.readFileSync(".env.local", "utf8").split("\n")
  .find((l) => l.startsWith("MARKETSNACK_COOKIE="))?.slice("MARKETSNACK_COOKIE=".length).trim();

const DIR = "data/marketsnack/inventario/bundles";
fs.mkdirSync(DIR, { recursive: true });

const r0 = await fetch(`${BASE}/app`, { headers: { Cookie: C, Accept: "text/html" }, redirect: "manual" });
const html = await r0.text();
fs.writeFileSync(`${DIR}/../app.html`, html);
console.log(`HTML de /app guardado (${html.length} bytes)\n`);
console.log(html.slice(0, 3400));

const activos = new Set();
for (const m of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)) activos.add(m[1]);
console.log(`\n\nactivos: ${activos.size}`);

for (const a of activos) {
  const url = a.startsWith("http") ? a : BASE + (a.startsWith("/") ? a : "/" + a);
  const r = await fetch(url, { headers: { Cookie: C } });
  const txt = await r.text();
  const nombre = path.basename(new URL(url).pathname);
  fs.writeFileSync(path.join(DIR, nombre), txt);
  console.log(`  ${r.status}  ${(txt.length / 1024).toFixed(0).padStart(6)} kB  ${nombre}`);
}
console.log(`\nguardados en ${DIR}`);
