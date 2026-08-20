// ¿ES REAL LA RUPTURA DEL 2026-07-16? — comprobado EN VIVO contra la API, no contra el caché.
//
// En el caché de disco, `asset_price` viene nulo en el 40–74% de las operaciones ANTES del
// 2026-07-16 y en el 0,0% DESPUÉS. Y `score`=0 pasa del ~65% al ~17% el mismo día.
//
// Un salto así puede ser (a) MarketSnack cambiando su tubería, o (b) un fallo del descargador
// que escribió el caché. Son cosas MUY distintas: la primera invalida cualquier medición que
// cruce esa fecha; la segunda sólo obliga a rebajar el fichero. Se distingue pidiéndole los
// mismos días a la API otra vez, hoy.
//
// Uso: node --env-file=.env.local scripts/marketsnack/verificar-ruptura.mjs

const BASE = "https://app.marketsnack.com/api";
const C = process.env.MARKETSNACK_COOKIE;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Baja hasta `tope` operaciones de un día concreto, paginando de verdad. */
async function dia(d, tope = 400) {
  let token = null, out = [];
  while (out.length < tope) {
    const qs = `filter[scope]=all&filter[date][gte]=${d}&filter[date][lte]=${d}` +
      `&filter[premium][gte]=1000000&limit=100` + (token ? `&next_page_token=${token}` : "");
    const r = await fetch(`${BASE}/flow_feed?${qs}`, {
      headers: { Accept: "application/json", Cookie: C }, redirect: "manual",
      signal: AbortSignal.timeout(60000),
    });
    if (r.status !== 200) return { http: r.status, filas: out };
    const j = await r.json();
    const l = j.list ?? [];
    out.push(...l);
    token = j.meta?.next_page_token ?? null;
    if (!l.length || !token) break;
    await dormir(90);
  }
  return { http: 200, filas: out };
}

const DIAS = ["2026-04-23", "2026-05-14", "2026-06-10", "2026-07-08", "2026-07-15",
              "2026-07-16", "2026-07-17", "2026-08-05", "2026-08-18"];

console.log(`═══ ¿LA RUPTURA DEL 2026-07-16 ESTÁ EN LA API O EN MI CACHÉ? ═══`);
console.log(`   pedido hoy, en vivo. prima ≥ $1M, hasta 400 ops por día\n`);
console.log(`día          ops   asset_price nulo   score=0   greeks nulos   OI nulo/0`);
for (const d of DIAS) {
  const { http, filas } = await dia(d);
  if (http !== 200) { console.log(`${d}   HTTP ${http}`); continue; }
  if (!filas.length) { console.log(`${d}   0 filas (fuera de la ventana)`); continue; }
  const n = filas.length;
  const pc = (f) => (100 * filas.filter(f).length / n).toFixed(1).padStart(5) + "%";
  console.log(`${d} ${String(n).padStart(5)}   ${pc((t) => t.asset_price == null).padStart(14)}` +
    `   ${pc((t) => !t.score).padStart(7)}   ${pc((t) => t.delta == null).padStart(12)}` +
    `   ${pc((t) => t.open_interest == null || t.open_interest === 0).padStart(9)}`);
  await dormir(250);
}

// ── el reparto multi-pata / una-pata, que decide qué población se mide ──────
console.log(`\n═══ ¿QUÉ PARTE DEL "FLUJO" SON PATAS DE SPREAD Y NO APUESTAS DIRECCIONALES? ═══\n`);
const ML = new Set([232, 233, 234, 235, 236, 238, 239, 246, 247]);  // Multi Leg …
const SL = new Set([227, 228, 229, 230, 231]);                       // Single Leg …
const AUTO = new Set([209, 210, 219]);                               // auto / sweep / reopening
for (const d of ["2026-06-10", "2026-08-18"]) {
  const { filas } = await dia(d, 400);
  if (!filas.length) continue;
  const n = filas.length;
  const c = (s) => (100 * filas.filter((t) => s.has(t.trade_condition_id)).length / n).toFixed(1);
  console.log(`   ${d}  n=${n}  ·  multi-pata ${c(ML)}%  ·  una-pata ${c(SL)}%  ·  auto/sweep ${c(AUTO)}%  ·  resto ${(100 - +c(ML) - +c(SL) - +c(AUTO)).toFixed(1)}%`);
  await dormir(250);
}
console.log(`\n   (una pata de spread NO es una apuesta direccional: el que la compra puede estar`);
console.log(`    vendiendo la otra pata a la vez. Medir "compras de call" sin separar esto mezcla`);
console.log(`    dos poblaciones distintas.)`);
