// INVENTARIO FINAL DE MARKETSNACK — lo que faltaba por medir en vivo.
//
// Lo ya resuelto por los scripts anteriores no se repite. Aquí se cierran los huecos:
//   1. ¿el filtro por FECHA filtra de verdad? (validado contra las filas, no contra el HTTP)
//   2. ¿dónde está el SUELO del archivo hoy? ¿la ventana RUEDA? — la pregunta que decide
//      si hay que bajarlo ya o se puede esperar
//   3. ¿se puede subir el tamaño de página (`limit`)?
//   4. ¿cuánta historia tiene open_interest_by_expiration? (es la única serie de OI)
//   5. las rutas del bundle que nadie sondeó todavía
//
// ⚠️ Se valida por FILAS DEVUELTAS y por que las filas CUMPLAN el filtro. Un 200 con cuerpo
// vacío, o un filtro que el servidor ignora, cuentan como NO funciona.
//
// Uso: node --env-file=.env.local scripts/marketsnack/inventario-final.mjs

const BASE = "https://app.marketsnack.com/api";
const C = process.env.MARKETSNACK_COOKIE;
if (!C) { console.log("✗ falta MARKETSNACK_COOKIE"); process.exit(1); }
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(ruta) {
  const t0 = Date.now();
  try {
    const r = await fetch(BASE + ruta, {
      headers: { Accept: "application/json", Cookie: C }, redirect: "manual",
      signal: AbortSignal.timeout(60000),
    });
    const txt = await r.text().catch(() => "");
    let j = null; try { j = JSON.parse(txt); } catch {}
    return { http: r.status, j, bytes: txt.length, ms: Date.now() - t0 };
  } catch (e) { return { http: null, j: null, bytes: 0, ms: Date.now() - t0, err: String(e.message).slice(0, 60) }; }
}
const feed = (qs) => get(`/flow_feed?filter[scope]=all&${qs}`);
const iso = (d) => d.toISOString().slice(0, 10);

// ── 1 · ¿el filtro por fecha filtra de verdad? ───────────────────────────────
console.log(`═══ 1 · EL FILTRO POR FECHA ═══`);
console.log(`   (se comprueba que TODAS las filas caen dentro del día pedido)\n`);
for (const d of ["2026-08-18", "2026-07-01", "2026-05-05", "2026-04-16"]) {
  const r = await feed(`filter[date][gte]=${d}&filter[date][lte]=${d}&filter[premium][gte]=1000000`);
  const list = r.j?.list ?? [];
  const dias = [...new Set(list.map((t) => t.timestamp?.slice(0, 10)))];
  const respeta = dias.length > 0 && dias.every((x) => x === d);
  console.log(`   ${d}  HTTP ${r.http} · ${String(list.length).padStart(3)} filas · devuelve ${dias.join(",") || "—"}` +
    (list.length ? (respeta ? "  ✓ FILTRA" : "  ✗ IGNORA EL FILTRO") : "  (vacío)"));
  await dormir(180);
}

// ── 2 · el suelo del archivo, por búsqueda binaria sobre ventanas de 7 días ──
console.log(`\n═══ 2 · EL SUELO DEL ARCHIVO HOY ═══`);
console.log(`   ventana de 7 días para no confundir un festivo con el suelo\n`);
async function hay(fin) {
  const ini = iso(new Date(Date.parse(fin + "T12:00:00Z") - 6 * 86400000));
  const r = await feed(`filter[date][gte]=${ini}&filter[date][lte]=${fin}&filter[premium][gte]=1000000`);
  await dormir(160);
  return { n: (r.j?.list ?? []).length, http: r.http, ini };
}
let lo = new Date("2023-01-01T12:00:00Z");   // supuesto: sin datos
let hi = new Date();                          // supuesto: con datos
const top = await hay(iso(hi));
console.log(`   hoy ${iso(hi)} → ${top.n} filas (HTTP ${top.http})`);
let pasos = 0;
while (hi - lo > 3 * 86400000 && pasos < 16) {
  pasos++;
  const mid = new Date((+lo + +hi) / 2);
  const r = await hay(iso(mid));
  console.log(`   ${r.ini} → ${iso(mid)}  ${r.n ? `${r.n} filas ✓` : "vacío"}`);
  if (r.n) hi = mid; else lo = mid;
}
const suelo = iso(hi);
console.log(`\n   ── SUELO ≈ ${suelo}  ·  profundidad ${((Date.now() - +hi) / 86400000).toFixed(0)} días`);
console.log(`   El caché de disco (bajado el 12-ago) llega a 2026-04-15.`);
console.log(`   Si el suelo de hoy es POSTERIOR a 2026-04-15 → la ventana RUEDA y lo viejo se pierde.\n`);

// día a día alrededor del suelo, para fijarlo
console.log(`   afinando el suelo día a día:`);
const base = Date.parse(suelo + "T12:00:00Z");
for (let k = -3; k <= 4; k++) {
  const d = iso(new Date(base + k * 86400000));
  const r = await feed(`filter[date][gte]=${d}&filter[date][lte]=${d}&filter[premium][gte]=1000000`);
  const n = (r.j?.list ?? []).length;
  console.log(`     ${d}  ${String(n).padStart(3)} filas ${n ? "✓" : ""}`);
  await dormir(170);
}

// ── 3 · tamaño de página ────────────────────────────────────────────────────
console.log(`\n═══ 3 · ¿SE PUEDE SUBIR EL TAMAÑO DE PÁGINA? ═══\n`);
for (const lim of [50, 100, 250, 500]) {
  const r = await feed(`period=1d&filter[premium][gte]=100000&limit=${lim}`);
  const n = (r.j?.list ?? []).length;
  console.log(`   limit=${String(lim).padEnd(4)} HTTP ${r.http} · ${String(n).padStart(4)} filas · ${(r.bytes / 1024).toFixed(0)}kB · ${r.ms}ms` +
    (n === lim ? "  ✓ lo respeta" : n === 50 ? "  ← tope duro de 50" : ""));
  await dormir(200);
}

// ── 4 · historia de open_interest_by_expiration ─────────────────────────────
console.log(`\n═══ 4 · SERIE DE OPEN INTEREST (la única serie de OI) ═══\n`);
const exps = await get(`/assets/SPY/expirations`);
const lista = Array.isArray(exps.j) ? exps.j : [];
for (const e of [lista[0], lista[5], lista[15], lista[25]].filter(Boolean)) {
  const r = await get(`/assets/SPY/open_interest_by_expiration?expiration_date=${e.date}&symbol=SPY`);
  const d = r.j?.data ?? [];
  const fechas = d.map((x) => x.t).filter(Boolean).sort();
  console.log(`   venc ${e.date}  HTTP ${r.http} · ${String(d.length).padStart(3)} puntos · ` +
    `${(fechas[0] ?? "—").slice(0, 10)} → ${(fechas[fechas.length - 1] ?? "—").slice(0, 10)}` +
    ` · ref=${r.j?.reference_value ?? "—"}`);
  await dormir(180);
}

// ── 5 · las rutas del bundle que nadie sondeó ───────────────────────────────
console.log(`\n═══ 5 · RUTAS DEL BUNDLE AÚN SIN SONDEAR ═══\n`);
const PENDIENTES = [
  ["watchlists_performance_series", `/watchlists/performance_series`],
  ["watchlists_asset_perf_series", `/watchlists/asset_performance_series?symbols[]=SPY&period=1m`],
  ["market_alert_assets", `/market_alert_assets`],
  ["market_alert_assets_sugeridos", `/market_alert_assets/suggested`],
  ["user", `/user`],
  ["user_ui_settings", `/user/ui_settings`],
  ["user_notifications_usage", `/user/notifications_usage`],
  ["alerts_unseen_count", `/alerts/unseen_count`],
  ["alert_logs_has_unseen", `/alert_logs/has_unseen`],
  ["options_chain_sin_query", `/options_chain?query=SPY&expiration_date=`],
];
function filas(x, p = 0) {
  if (p > 4 || x == null) return 0;
  if (Array.isArray(x)) return Math.max(x.length, ...x.slice(0, 3).map((v) => filas(v, p + 1)), 0);
  if (typeof x === "object") return Math.max(0, ...Object.values(x).map((v) => filas(v, p + 1)));
  return 0;
}
for (const [n, ruta] of PENDIENTES) {
  const r = await get(ruta);
  const nf = filas(r.j);
  const nc = r.j && typeof r.j === "object" && !Array.isArray(r.j) ? Object.keys(r.j).length : 0;
  const estado = r.http !== 200 ? `HTTP ${r.http}` : !r.j ? "NO-JSON" : nf ? `${nf} filas` : nc ? `objeto (${nc} campos)` : "VACÍO";
  const marca = estado.endsWith("filas") || estado.startsWith("objeto") ? "✓" : "✗";
  console.log(`   ${marca} ${n.padEnd(32)} ${estado.padEnd(20)} ${(r.bytes / 1024).toFixed(1)}kB  ${JSON.stringify(r.j ?? "").slice(0, 110)}`);
  await dormir(160);
}

// ── 6 · caudal de un día, contado de verdad ─────────────────────────────────
console.log(`\n═══ 6 · CAUDAL DE UN DÍA (2026-08-18), contado página a página ═══\n`);
for (const piso of [1_000_000, 250_000]) {
  let token = null, n = 0, pag = 0, bytes = 0;
  const t0 = Date.now();
  const TOPE = 250;
  while (pag < TOPE) {
    pag++;
    const r = await feed(`filter[date][gte]=2026-08-18&filter[date][lte]=2026-08-18&filter[premium][gte]=${piso}` +
      (token ? `&next_page_token=${token}` : ""));
    if (r.http !== 200) { console.log(`      HTTP ${r.http} en página ${pag}`); break; }
    const l = r.j?.list ?? [];
    n += l.length; bytes += r.bytes;
    token = r.j?.meta?.next_page_token ?? null;
    if (!l.length || !token) break;
    await dormir(90);
  }
  const seg = (Date.now() - t0) / 1000;
  const completo = !token;
  console.log(`   piso $${piso.toLocaleString("es-ES").padStart(9)} → ${String(n).padStart(5)} ops · ${String(pag).padStart(3)} pág · ${seg.toFixed(0)}s · ${(bytes / 1e6).toFixed(1)}MB` +
    (completo ? "  ✓ COMPLETO" : `  ⚠ cortado en ${TOPE} páginas`));
  if (completo) {
    const dm = 85;
    console.log(`      → archivo entero (~${dm} días de mercado): ${(n * dm).toLocaleString("es-ES")} ops · ${(seg * dm / 60).toFixed(0)} min · ${(bytes * dm / 1e6).toFixed(0)} MB`);
  }
  await dormir(400);
}
console.log(`\n═══ FIN ═══`);
