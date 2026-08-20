// SONDEAR LAS 40 RUTAS DE LA API DE MARKETSNACK — una por una, con parámetros reales.
//
// Las rutas NO están adivinadas: salen de los bundles de la propia app (ver descubrir-rutas.mjs
// y bajar-bundles.mjs). El axios de la app es  create({baseURL:"/api"})  así que todas cuelgan
// de /api/…
//
// ⚠️ REGLA DE ESTE PROYECTO: se valida por FILAS DEVUELTAS, nunca por código HTTP. Un 200 con
// cuerpo vacío se leyó como "funciona" durante semanas. Aquí un 200 sin filas se marca VACÍO,
// que es un resultado distinto de OK.
//
// Uso: node scripts/marketsnack/sondear-rutas.mjs [TICKER]

import fs from "node:fs";

const BASE = "https://app.marketsnack.com/api";
const T = (process.argv[2] || "SPY").toUpperCase();
const C = fs.readFileSync(".env.local", "utf8").split("\n")
  .find((l) => l.startsWith("MARKETSNACK_COOKIE="))?.slice("MARKETSNACK_COOKIE=".length).trim();
if (!C) { console.log("✗ sin MARKETSNACK_COOKIE"); process.exit(1); }

const DIR = "data/marketsnack/inventario/muestras";
fs.mkdirSync(DIR, { recursive: true });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Cuenta filas de verdad: el mayor array que haya en la respuesta, a cualquier profundidad. */
function filas(x, prof = 0) {
  if (prof > 4 || x == null) return 0;
  if (Array.isArray(x)) return Math.max(x.length, ...x.slice(0, 3).map((v) => filas(v, prof + 1)), 0);
  if (typeof x === "object") return Math.max(0, ...Object.values(x).map((v) => filas(v, prof + 1)));
  return 0;
}
/** Un objeto suelto con campos también es dato útil aunque no sea un array. */
function campos(x) { return x && typeof x === "object" && !Array.isArray(x) ? Object.keys(x).length : 0; }

const resultados = [];
async function sondear(nombre, ruta) {
  const url = BASE + ruta;
  const t0 = Date.now();
  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json", Cookie: C },
      redirect: "manual", signal: AbortSignal.timeout(60000),
    });
    const ms = Date.now() - t0;
    const ct = (r.headers.get("content-type") || "").split(";")[0];
    const txt = await r.text().catch(() => "");
    let j = null; try { j = JSON.parse(txt); } catch { /* no era json */ }

    const n = filas(j), k = campos(j);
    let estado;
    if (r.status !== 200) estado = `HTTP ${r.status}`;
    else if (!j) estado = "NO-JSON";
    else if (n === 0 && k === 0) estado = "VACÍO";
    else if (n === 0) estado = `objeto (${k} campos)`;
    else estado = `${n} filas`;

    const marca = estado.endsWith("filas") || estado.startsWith("objeto") ? "✓" : "✗";
    console.log(`   ${marca} ${nombre.padEnd(42)} ${String(r.status).padEnd(4)} ${estado.padEnd(20)} ${String(ms).padStart(5)}ms  ${(txt.length / 1024).toFixed(1)}kB`);

    if (marca === "✓") fs.writeFileSync(`${DIR}/${nombre.replace(/[^a-z0-9_]/gi, "_")}.json`, txt.slice(0, 400000));
    resultados.push({ nombre, ruta, http: r.status, estado, filas: n, campos: k, ms, bytes: txt.length, tipo: ct,
      muestra: j ? JSON.stringify(j).slice(0, 900) : txt.slice(0, 300) });
    return j;
  } catch (e) {
    console.log(`   ✗ ${nombre.padEnd(42)} —    ${String(e.message).slice(0, 40)}`);
    resultados.push({ nombre, ruta, http: null, estado: "error", error: String(e.message).slice(0, 120) });
    return null;
  }
}

console.log(`═══ SONDEO DE LA API DE MARKETSNACK · ticker de prueba ${T} ═══`);
console.log(`   base: ${BASE}   ·   validación: FILAS devueltas, no código HTTP\n`);

// ── A · lo que ya se conocía ────────────────────────────────────────────────
console.log(`── A · FLUJO (lo ya conocido)`);
await sondear("flow_feed", `/flow_feed?filter[scope]=all&filter[symbol][]=${T}&period=1d`);
const ff = await sondear("flow_feed_mercado", `/flow_feed?filter[scope]=all&period=1d&filter[premium][gte]=500000`);
const idEjemplo = ff?.list?.[0]?.id;
const simEjemplo = ff?.list?.[0]?.symbol;
if (idEjemplo) await sondear("flow_feed_trades", `/flow_feed/trades?ids[]=${idEjemplo}`);
await sondear("flow_feed_smart_counts", `/flow_feed/smart_filters_trades_counts?filter[scope]=all&period=1d`);
await sondear("trade_conditions", `/trade_conditions`);
await sondear("exchanges", `/exchanges`);

// ── B · por activo: LA MINA (gamma, OI, cadena) ─────────────────────────────
console.log(`\n── B · POR ACTIVO (${T})`);
await sondear("assets_ficha", `/assets/${T}`);
await sondear("assets_chart_1m", `/assets/${T}/chart?period=1m`);
const exp = await sondear("assets_expirations", `/assets/${T}/expirations`);
await sondear("assets_expiration_premiums", `/assets/${T}/expiration_premiums`);
await sondear("assets_gex_stats_chart_1m", `/assets/${T}/gex_stats_chart?period=1m`);
await sondear("assets_sentiment_1m", `/assets/${T}/sentiment?period=1m`);

// primera expiración real que devuelva la API — nada de fechas inventadas
const lista = Array.isArray(exp) ? exp : exp?.list ?? exp?.expirations ?? exp?.data ?? [];
const primera = (lista[0]?.expiration_date ?? lista[0]?.date ?? lista[0]?.expiration ?? lista[0]) || null;
console.log(`   (primera expiración devuelta por la API: ${JSON.stringify(primera)})`);
if (primera && typeof primera === "string") {
  await sondear("assets_oi_by_expiration", `/assets/${T}/open_interest_by_expiration?expiration_date=${primera}`);
  await sondear("assets_option_chain_extended", `/assets/${T}/option_chain_extended?expiration_date=${primera}`);
  await sondear("assets_premium_comparison", `/assets/${T}/premium_comparison?expiration_date=${primera}`);
} else {
  console.log(`   ⚠ sin expiraciones: NO se prueban OI/cadena/premium_comparison (no invento una fecha)`);
}
await sondear("options_chain_query", `/options_chain?query=${T}`);

// ── C · contrato concreto ───────────────────────────────────────────────────
console.log(`\n── C · CONTRATO CONCRETO`);
if (simEjemplo) {
  await sondear("option_contracts", `/option_contracts/${encodeURIComponent(simEjemplo)}`);
  await sondear("option_contracts_premium_traded", `/option_contracts/${encodeURIComponent(simEjemplo)}/premium_traded?period=1m`);
  await sondear("option_contracts_sentiment", `/option_contracts/${encodeURIComponent(simEjemplo)}/sentiment?period=1m`);
  await sondear("option_contracts_trade_summaries", `/option_contracts/${encodeURIComponent(simEjemplo)}/trade_summaries?period=1d&interval=5m`);
  await sondear("option_contracts_wap", `/option_contracts/${encodeURIComponent(simEjemplo)}/weighted_avg_price?period=1m`);
} else console.log(`   ⚠ no había símbolo de contrato en el flujo; se salta`);

// ── D · widgets de mercado ──────────────────────────────────────────────────
console.log(`\n── D · WIDGETS DE MERCADO`);
await sondear("w_market_sentiment", `/widgets/market_sentiment?period=1m`);
await sondear("w_change_premium", `/widgets/change?attribute=premium`);
await sondear("w_change_oi", `/widgets/change?attribute=open_interest`);
await sondear("w_price_change_chart", `/widgets/price_change_chart?period=1m&symbols[]=${T}`);
await sondear("w_price_change_chart_v2", `/widgets/price_change_chart_v2?period=1m&symbols[]=${T}&interval=1d`);
await sondear("w_oi_change_chart", `/widgets/open_interest_change_chart?period=1w&symbols[]=${T}`);
await sondear("w_delta_change_chart", `/widgets/delta_change_chart?period=1w&symbols[]=${T}`);
await sondear("w_volume_change_chart", `/widgets/volume_change_chart?symbol=${T}&period=1m&interval=1d`);
await sondear("w_top_options_by_oi", `/widgets/market_top_options_by_open_interest?period=1d`);
await sondear("w_top_assets_by_oi", `/widgets/market_top_assets_by_open_interest?period=1d`);
await sondear("w_big_delta_trades", `/widgets/market_big_delta_trades?period=1d`);
await sondear("w_big_delta_trades_stats", `/widgets/market_big_delta_trades_stats?period=1d`);
await sondear("w_big_spread", `/widgets/market_big_spread?period=1d`);
await sondear("w_irregular_hours", `/widgets/market_irregular_hours_trades?period=1d`);
await sondear("w_irregular_hours_stats", `/widgets/market_irregular_hours_trades_stats?period=1d`);
await sondear("w_zero_dte", `/widgets/market_zero_dte?period=1d`);
await sondear("w_zero_dte_stats", `/widgets/market_zero_dte_stats?period=1d`);
await sondear("w_low_cost_movers", `/widgets/market_top_mover_low_cost_contracts?period=1d`);

// ── E · cuenta y varios ─────────────────────────────────────────────────────
console.log(`\n── E · CUENTA Y VARIOS`);
await sondear("interest_rates_last", `/interest_rates/last`);
await sondear("universal_search", `/universal_search?query=${T}`);
await sondear("feature_flags", `/feature_flags`);
await sondear("watchlists", `/watchlists`);
await sondear("watchlists_overview", `/watchlists/overview`);
await sondear("watchlists_community", `/watchlists/community`);
await sondear("watchlists_iv", `/watchlists/implied_volatilities?symbols[]=${T}`);
await sondear("watchlists_price_changes", `/watchlists/asset_price_changes?symbols[]=${T}`);
await sondear("alerts", `/alerts`);
await sondear("alert_logs", `/alert_logs`);
await sondear("trade_filter_presets", `/trade_filter_presets`);
await sondear("billing_subscription", `/billing/subscription`);

fs.writeFileSync("data/marketsnack/inventario/sondeo.json", JSON.stringify(resultados, null, 1));
const ok = resultados.filter((r) => r.estado?.endsWith("filas") || r.estado?.startsWith("objeto"));
console.log(`\n═══ RESUMEN ═══`);
console.log(`   rutas sondeadas : ${resultados.length}`);
console.log(`   CON DATOS       : ${ok.length}`);
console.log(`   sin datos/error : ${resultados.length - ok.length}`);
console.log(`   detalle en data/marketsnack/inventario/sondeo.json`);
console.log(`   muestras en ${DIR}/\n`);
