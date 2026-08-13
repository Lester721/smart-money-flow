// ¿CUÁNTA HISTORIA GUARDA MARKETSNACK?
//
// Es LA pregunta del mes de prueba. Lester paga $99 y no renueva salvo razón poderosa. Con
// histórico se puede backtestear su `score` esta semana; sin histórico habría que acumular en
// vivo y un mes no da muestra suficiente para concluir nada — la respuesta sería "no sabemos",
// que es distinto de "no sirve", y no justifica renovar.
//
// Prueba los valores de `period` y camina hacia atrás por el paginador para ver hasta dónde llega.
//
// Uso: node scripts/marketsnack/alcance-historico.mjs [TICKER] [maxPaginas]

import fs from "node:fs";

const BASE = "https://app.marketsnack.com";
const TICKER = (process.argv[2] || "SPX").toUpperCase();
const MAX = Number(process.argv[3] || 30);

const txt = fs.readFileSync(".env.local", "utf8");
const C = txt.split("\n").find((l) => l.startsWith("MARKETSNACK_COOKIE="))?.slice(19).trim();
if (!C) { console.log("✗ sin cookie"); process.exit(1); }

async function pedir(params) {
  const r = await fetch(`${BASE}/api/flow_feed?${params}`, {
    headers: { Accept: "application/json", Cookie: C }, redirect: "manual",
    signal: AbortSignal.timeout(45000),
  });
  if (r.status !== 200) return { error: r.status };
  return await r.json();
}

// 1. ¿Qué valores de `period` acepta?
console.log(`═══ ¿QUÉ PERIODOS ACEPTA? · ${TICKER} ═══\n`);
for (const p of ["1d", "5d", "1w", "1m", "3m", "6m", "1y", "all", "ytd"]) {
  const j = await pedir(`filter[scope]=all&filter[symbol][]=${TICKER}&period=${p}`);
  if (j.error) { console.log(`   ${p.padEnd(4)} -> HTTP ${j.error}`); continue; }
  const l = j.list ?? [];
  const fechas = l.map((t) => t.timestamp).filter(Boolean).sort();
  console.log(`   ${p.padEnd(4)} -> ${String(l.length).padStart(3)} registros` +
    (fechas.length ? `  ·  ${fechas[0].slice(0, 16)} → ${fechas[fechas.length - 1].slice(0, 16)}` : "  ·  vacío"));
}

// 2. Caminar hacia atrás: el paginador va del más reciente al más antiguo.
console.log(`\n═══ HASTA DÓNDE LLEGA PAGINANDO (máximo ${MAX} páginas) ═══\n`);
let token = null, pagina = 0, total = 0, masAntigua = null, periodo = "1m";
while (pagina < MAX) {
  pagina++;
  const j = await pedir(`filter[scope]=all&filter[symbol][]=${TICKER}&period=${periodo}` + (token ? `&next_page_token=${token}` : ""));
  if (j.error) { console.log(`   página ${pagina}: HTTP ${j.error} — parada`); break; }
  const l = j.list ?? [];
  if (!l.length) { console.log(`   página ${pagina}: vacía — se acabó el histórico`); break; }
  total += l.length;
  const fechas = l.map((t) => t.timestamp).filter(Boolean).sort();
  masAntigua = fechas[0];
  if (pagina % 5 === 0 || pagina === 1) console.log(`   página ${String(pagina).padStart(2)}  ·  ${total} registros  ·  la más antigua: ${masAntigua?.slice(0, 19)}`);
  token = j.meta?.next_page_token;
  if (!token) { console.log(`   página ${pagina}: sin página siguiente — FIN del histórico`); break; }
}

const dias = masAntigua ? (Date.now() - Date.parse(masAntigua)) / 86400000 : 0;
console.log(`\n   ── VEREDICTO ──`);
console.log(`   registros recorridos : ${total}`);
console.log(`   operación más antigua: ${masAntigua ?? "—"}`);
console.log(`   profundidad          : ${dias.toFixed(1)} días`);
console.log("");
if (dias >= 60) console.log(`   ✓ Hay histórico de sobra. Se puede BACKTESTEAR su score ya.`);
else if (dias >= 10) console.log(`   ~ Histórico corto. Sirve para una primera medición, no para concluir.`);
else console.log(`   ✗ Casi no hay histórico: habría que acumular en vivo, y un mes no da muestra.`);
