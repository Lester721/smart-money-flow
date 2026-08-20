// DESCUBRIR LAS RUTAS DE LA API DE MARKETSNACK — leyendo su propia aplicación.
//
// Adivinar nombres de rutas es lento y da falsos negativos (una ruta que existe con otro nombre
// se apunta como "no existe"). La aplicación web ES el cliente oficial de esa API: sus bundles de
// JavaScript llevan escritas TODAS las rutas que sabe llamar. Se descargan y se leen.
//
// ⚠️ Se valida por FILAS DEVUELTAS, nunca por código HTTP. En este proyecto un 200 con cuerpo
// vacío se leyó como "funciona" durante semanas.
//
// Uso: node scripts/marketsnack/descubrir-rutas.mjs

import fs from "node:fs";

const BASE = "https://app.marketsnack.com";
const C = fs.readFileSync(".env.local", "utf8").split("\n")
  .find((l) => l.startsWith("MARKETSNACK_COOKIE="))?.slice("MARKETSNACK_COOKIE=".length).trim();
if (!C) { console.log("✗ sin MARKETSNACK_COOKIE"); process.exit(1); }

const SALIDA = "data/marketsnack/inventario";
fs.mkdirSync(SALIDA, { recursive: true });

async function traer(url, json = false) {
  const r = await fetch(url, {
    headers: { Accept: json ? "application/json" : "text/html,*/*", Cookie: C },
    redirect: "manual", signal: AbortSignal.timeout(45000),
  });
  const ct = r.headers.get("content-type") || "";
  const txt = await r.text().catch(() => "");
  return { estado: r.status, tipo: ct.split(";")[0], txt, loc: r.headers.get("location") };
}

// ── 1. páginas de la app: ¿cuáles existen y qué bundles cargan? ──────────────
const SUB = [
  "", "/flow", "/flow_feed", "/dashboard", "/gex", "/gamma", "/darkpool", "/dark_pool",
  "/scanner", "/watchlist", "/watchlists", "/alerts", "/heatmap", "/oi", "/open_interest",
  "/levels", "/market", "/screener", "/chart", "/charts", "/analytics", "/earnings",
  "/news", "/settings", "/overview", "/positions", "/seasonality", "/insider",
];
const PAGINAS = [...SUB.map((s) => "/app" + s), "/"];

console.log(`═══ 1 · PÁGINAS DE LA APLICACIÓN ═══\n`);
const activos = new Set();
const paginasVivas = [];
for (const p of PAGINAS) {
  try {
    const r = await traer(BASE + p);
    const esHtml = r.tipo.includes("html");
    const marca = r.estado === 200 && esHtml && r.txt.length > 500 ? "✓" : "·";
    if (marca === "✓") {
      paginasVivas.push(p);
      // <script src="..."> y <link href="...css">
      for (const m of r.txt.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)) activos.add(m[1]);
      // Next.js/Vite a veces meten el manifiesto inline
      for (const m of r.txt.matchAll(/["'](\/(?:assets|_next|build|static|packs)\/[^"']+\.js)["']/g)) activos.add(m[1]);
    }
    console.log(`   ${marca} ${p.padEnd(16)} ${r.estado} ${r.tipo.padEnd(24)} ${r.txt.length} bytes${r.loc ? ` -> ${r.loc}` : ""}`);
  } catch (e) { console.log(`   ✗ ${p.padEnd(16)} ${String(e.message).slice(0, 50)}`); }
}

console.log(`\n   páginas vivas: ${paginasVivas.length}  ·  activos JS/CSS encontrados: ${activos.size}`);

// ── 2. bajar los bundles y sacar las rutas /api/ que llevan escritas ─────────
console.log(`\n═══ 2 · RUTAS ESCRITAS EN EL JAVASCRIPT DE LA APP ═══\n`);
const rutas = new Set();
const bundles = [...activos].filter((a) => a.endsWith(".js"));
console.log(`   bundles JS a leer: ${bundles.length}`);

let leidos = 0, bytes = 0;
for (const b of bundles) {
  const url = b.startsWith("http") ? b : BASE + (b.startsWith("/") ? b : "/" + b);
  try {
    const r = await traer(url);
    if (r.estado !== 200 || r.txt.length < 100) continue;
    leidos++; bytes += r.txt.length;
    // rutas literales
    for (const m of r.txt.matchAll(/["'`](\/api\/[a-zA-Z0-9_\-/{}.$:]*)["'`]/g)) rutas.add(m[1]);
    // rutas con template string: `/api/foo/${id}/bar`
    for (const m of r.txt.matchAll(/["'`](\/api\/[a-zA-Z0-9_\-/]+)/g)) rutas.add(m[1]);
  } catch { /* bundle inalcanzable */ }
}
console.log(`   bundles leídos: ${leidos}  ·  ${(bytes / 1e6).toFixed(1)} MB de JavaScript`);
const lista = [...rutas].sort();
console.log(`   rutas /api/ distintas encontradas: ${lista.length}\n`);
for (const r of lista) console.log(`     ${r}`);

fs.writeFileSync(`${SALIDA}/rutas-descubiertas.json`,
  JSON.stringify({ paginasVivas, bundles: bundles.length, rutas: lista }, null, 1));
console.log(`\n   guardado en ${SALIDA}/rutas-descubiertas.json`);
