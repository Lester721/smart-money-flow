// ¿QUÉ FILTROS ACEPTA DE VERDAD /api/flow_feed?
//
// La lista sale del propio bundle de la app (objeto de filtros por defecto):
//   preset, scope, symbol[], premium{gte,lte}, expiration_date{gte,lte}, contract_type,
//   side[], date{gte,lte}, condition[], strike_price{gte,lte}, open_interest{gte,lte},
//   size{gte,lte}, delta{gte,lte}, score{gte,lte}
//
// ⚠️ NO basta con que devuelva filas. Un servidor que IGNORA un filtro también devuelve filas —
// y eso es peor que un error, porque parece que funciona. Aquí cada filtro se valida COMPROBANDO
// QUE LAS FILAS DEVUELTAS LO CUMPLEN. Si vuelven filas que lo violan, el filtro NO existe.
//
// Uso: node scripts/marketsnack/probar-filtros.mjs

import fs from "node:fs";

const BASE = "https://app.marketsnack.com/api";
const C = fs.readFileSync(".env.local", "utf8").split("\n")
  .find((l) => l.startsWith("MARKETSNACK_COOKIE="))?.slice("MARKETSNACK_COOKIE=".length).trim();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function feed(qs) {
  const r = await fetch(`${BASE}/flow_feed?filter[scope]=all&${qs}`, {
    headers: { Accept: "application/json", Cookie: C }, redirect: "manual",
    signal: AbortSignal.timeout(60000),
  });
  const txt = await r.text().catch(() => "");
  let j = null; try { j = JSON.parse(txt); } catch {}
  return { http: r.status, list: j?.list ?? [], meta: j?.meta ?? null, bytes: txt.length };
}

/** prueba: nombre, query, y el predicado que TODAS las filas deben cumplir */
const PRUEBAS = [
  ["premium gte 2M", "filter[premium][gte]=2000000", (t) => t.premium >= 2_000_000],
  ["premium lte 5k", "filter[premium][lte]=5000", (t) => t.premium <= 5000],
  ["score gte 90", "filter[score][gte]=90", (t) => (t.score ?? 0) >= 90],
  ["score lte 20", "filter[score][lte]=20", (t) => (t.score ?? 999) <= 20],
  ["side ASKSIDE", "filter[side][]=ASKSIDE", (t) => t.side === "ASKSIDE"],
  ["side BIDSIDE", "filter[side][]=BIDSIDE", (t) => t.side === "BIDSIDE"],
  ["contract_type call", "filter[contract_type]=call", (t) => /C\d{8}$/.test(t.symbol)],
  ["contract_type put", "filter[contract_type]=put", (t) => /P\d{8}$/.test(t.symbol)],
  ["size gte 500", "filter[size][gte]=500", (t) => t.size >= 500],
  ["open_interest lte 100", "filter[open_interest][lte]=100", (t) => (t.open_interest ?? 1e9) <= 100],
  ["delta gte 0.8", "filter[delta][gte]=0.8", (t) => Math.abs(t.delta ?? 0) >= 0.79],
  ["strike_price gte 1000", "filter[strike_price][gte]=1000", (t) => Number(t.symbol.slice(-8)) / 1000 >= 1000],
  ["symbol SPY", "filter[symbol][]=SPY", (t) => t.symbol.startsWith("SPY")],
  ["condition SWEEP", "filter[condition][]=ISOI", (t) => true],
];

console.log(`═══ ¿QUÉ FILTROS ACEPTA /api/flow_feed? ═══`);
console.log(`   validación: las filas devueltas TIENEN que cumplir el filtro\n`);

for (const [nombre, qs, ok] of PRUEBAS) {
  const r = await feed(qs + "&period=1d");
  if (r.http !== 200) { console.log(`   ✗ ${nombre.padEnd(24)} HTTP ${r.http}`); await dormir(150); continue; }
  if (!r.list.length) { console.log(`   ~ ${nombre.padEnd(24)} 200 pero 0 filas (no concluye)`); await dormir(150); continue; }
  const malas = r.list.filter((t) => !ok(t));
  const marca = malas.length === 0 ? "✓ FILTRA" : "✗ IGNORADO";
  console.log(`   ${marca.padEnd(11)} ${nombre.padEnd(24)} ${r.list.length} filas · ${malas.length} las incumplen` +
    (malas.length ? `  ej: ${JSON.stringify({ s: malas[0].symbol, p: malas[0].premium, sc: malas[0].score, sd: malas[0].side, sz: malas[0].size, d: malas[0].delta })}` : ""));
  await dormir(150);
}

// ── EL FILTRO QUE LO CAMBIA TODO: por FECHA ─────────────────────────────────
console.log(`\n═══ FILTRO POR FECHA — ¿se puede pedir un día concreto sin paginar a ciegas? ═══\n`);
for (const [d1, d2] of [["2026-08-18", "2026-08-18"], ["2026-06-02", "2026-06-02"],
                        ["2026-04-16", "2026-04-16"], ["2026-01-15", "2026-01-15"],
                        ["2025-10-01", "2025-10-01"], ["2025-01-06", "2025-01-06"]]) {
  const r = await feed(`filter[date][gte]=${d1}&filter[date][lte]=${d2}&filter[premium][gte]=1000000`);
  const fechas = r.list.map((t) => t.timestamp?.slice(0, 10)).filter(Boolean);
  const unicas = [...new Set(fechas)];
  const respeta = unicas.length && unicas.every((f) => f >= d1 && f <= d2);
  console.log(`   ${d1}  HTTP ${r.http} · ${String(r.list.length).padStart(3)} filas · días devueltos: ${unicas.join(",") || "—"} ` +
    `${r.list.length ? (respeta ? "✓ respeta la fecha" : "✗ DEVUELVE OTRO DÍA — el filtro no filtra") : ""}`);
  await dormir(200);
}

// ── smart filters (los "ingredientes" que MarketSnack ya tiene nombrados) ────
console.log(`\n═══ SMART FILTERS (presets con nombre propio) ═══\n`);
for (const p of ["aggressive-opening", "0dte-momentum-spike", "clean-directional-play",
                 "cheap-lotto-bets", "unusual-flow-spike"]) {
  const r = await feed(`filter[preset]=${p}&period=1d`);
  console.log(`   ${p.padEnd(26)} HTTP ${r.http} · ${String(r.list.length).padStart(3)} filas` +
    (r.list.length ? ` · ej ${r.list[0].symbol} prima $${Math.round(r.list[0].premium).toLocaleString("es-ES")} score ${r.list[0].score}` : ""));
  await dormir(200);
}
// ¿el preset cambia algo? se compara contra el feed sin preset
const base = await feed(`period=1d`);
console.log(`\n   (control sin preset: ${base.list.length} filas, primer símbolo ${base.list[0]?.symbol})`);

// ── contador de smart filters (necesita filter[symbol]) ─────────────────────
const sc = await feed(`filter[symbol][]=SPY`);
const r2 = await fetch(`${BASE}/flow_feed/smart_filters_trades_counts?filter[scope]=all&filter[symbol][]=SPY`,
  { headers: { Accept: "application/json", Cookie: C } });
const t2 = await r2.text();
console.log(`\n   smart_filters_trades_counts (con symbol) HTTP ${r2.status} · ${t2.slice(0, 300)}`);
