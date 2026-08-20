// CIERRE DEL INVENTARIO: lo que queda por cuantificar antes de decidir qué se puede medir.
//
//   1. profundidad real de gex_stats_chart (la ÚNICA serie temporal de GEX que hay)
//   2. cobertura de tickers en el flujo (¿sobre cuántos símbolos se puede construir señal?)
//   3. riqueza de option_chain_extended vs options_chain (las dos vistas de la cadena)
//   4. coste real de bajar el archivo entero con limit=100
//
// Uso: node --env-file=.env.local scripts/marketsnack/cierre-inventario.mjs

const BASE = "https://app.marketsnack.com/api";
const C = process.env.MARKETSNACK_COOKIE;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(ruta) {
  const t0 = Date.now();
  const r = await fetch(BASE + ruta, {
    headers: { Accept: "application/json", Cookie: C }, redirect: "manual",
    signal: AbortSignal.timeout(90000),
  });
  const txt = await r.text().catch(() => "");
  let j = null; try { j = JSON.parse(txt); } catch {}
  return { http: r.status, j, bytes: txt.length, ms: Date.now() - t0 };
}

// ── 1 · profundidad de la serie de GEX, en varios subyacentes ───────────────
console.log(`═══ 1 · LA SERIE DE GEX (net_gex, muros, gamma_flip, max_pain) ═══\n`);
for (const T of ["SPY", "QQQ", "SPX", "NVDA", "HOOD"]) {
  for (const p of ["1m", "1w", "1d"]) {
    const r = await get(`/assets/${T}/gex_stats_chart?period=${p}`);
    const d = r.j?.data ?? [];
    const f = d.map((x) => x.t).filter(Boolean).sort();
    if (p === "1m") {
      const dias = f.length ? ((Date.now() - Date.parse(f[0])) / 86400000).toFixed(0) : "—";
      console.log(`   ${T.padEnd(5)} ${p}  HTTP ${r.http} · ${String(d.length).padStart(3)} puntos · ` +
        `${(f[0] ?? "—").slice(0, 10)} → ${(f[f.length - 1] ?? "—").slice(0, 10)} · ${dias} días atrás`);
      if (d[0]) console.log(`         campos: ${Object.keys(d[0]).join(", ")}`);
    } else {
      console.log(`         ${p}  ${String(d.length).padStart(3)} puntos · granularidad ${p === "1d" ? "intradía" : "intradía/diaria"}`);
    }
    await dormir(140);
  }
}

// ── 2 · ¿cuántos tickers distintos hay en un día de flujo? ──────────────────
console.log(`\n═══ 2 · COBERTURA DE TICKERS EN EL FLUJO (2026-08-18) ═══\n`);
for (const piso of [1_000_000, 100_000]) {
  let token = null, sim = new Map(), n = 0, pag = 0;
  const t0 = Date.now();
  while (pag < 120) {
    pag++;
    const qs = `filter[scope]=all&filter[date][gte]=2026-08-18&filter[date][lte]=2026-08-18` +
      `&filter[premium][gte]=${piso}&limit=100` + (token ? `&next_page_token=${token}` : "");
    const r = await get(`/flow_feed?${qs}`);
    if (r.http !== 200) break;
    const l = r.j?.list ?? [];
    for (const t of l) {
      const raiz = /^([A-Z]+)\d{6}[CP]\d{8}$/.exec(t.symbol)?.[1] ?? t.symbol;
      sim.set(raiz, (sim.get(raiz) ?? 0) + 1);
    }
    n += l.length;
    token = r.j?.meta?.next_page_token ?? null;
    if (!l.length || !token) break;
    await dormir(80);
  }
  const orden = [...sim.entries()].sort((a, b) => b[1] - a[1]);
  const completo = !token;
  console.log(`   piso $${piso.toLocaleString("es-ES").padStart(9)} · ${n} ops · ${sim.size} tickers distintos` +
    ` · ${((Date.now() - t0) / 1000).toFixed(0)}s${completo ? " ✓ día completo" : ` ⚠ cortado (${pag} pág)`}`);
  const con20 = orden.filter(([, v]) => v >= 20).length;
  console.log(`      con ≥20 operaciones ese día: ${con20} tickers`);
  console.log(`      top: ${orden.slice(0, 12).map(([k, v]) => `${k}=${v}`).join("  ")}`);
  const total = n || 1;
  console.log(`      concentración: el mayor se lleva ${(100 * (orden[0]?.[1] ?? 0) / total).toFixed(1)}%` +
    ` · los 5 mayores ${(100 * orden.slice(0, 5).reduce((a, b) => a + b[1], 0) / total).toFixed(1)}%`);
  await dormir(300);
}

// ── 3 · las dos vistas de la cadena ─────────────────────────────────────────
console.log(`\n═══ 3 · LAS DOS VISTAS DE LA CADENA DE OPCIONES ═══\n`);
const ex = await get(`/assets/SPY/expirations`);
const venc = (Array.isArray(ex.j) ? ex.j : [])[3]?.date;
if (venc) {
  const a = await get(`/assets/SPY/option_chain_extended?expiration_date=${venc}`);
  const arrA = Array.isArray(a.j) ? a.j : [];
  console.log(`   option_chain_extended (venc ${venc}) · ${arrA.length} contratos · ${(a.bytes / 1024).toFixed(0)}kB · ${a.ms}ms`);
  console.log(`      campos: ${Object.keys(arrA[0] ?? {}).join(", ")}`);
  const conOI = arrA.filter((c) => c.open_interest > 0).length;
  const conQ = arrA.filter((c) => c.last_quote?.bid > 0 && c.last_quote?.ask > 0).length;
  const conG = arrA.filter((c) => c.greeks && Object.keys(c.greeks).length).length;
  console.log(`      con OI>0: ${conOI}/${arrA.length} · con bid&ask reales: ${conQ}/${arrA.length} · con griegas: ${conG}/${arrA.length}`);
  console.log(`      premium_breakdown (bid/mid/ask) presente en ${arrA.filter((c) => c.premium_breakdown).length}/${arrA.length}`);
  console.log(`      legs_premium (single/multi/other) presente en ${arrA.filter((c) => c.legs_premium).length}/${arrA.length}`);
}
const b = await get(`/options_chain?query=SPY`);
const cont = b.j?.contracts ?? [];
console.log(`\n   options_chain (TODA la cadena de una vez) · ${cont.length} contratos · ${(b.bytes / 1024 / 1024).toFixed(2)}MB · ${b.ms}ms`);
console.log(`      campos: ${Object.keys(cont[0] ?? {}).join(", ")}`);
console.log(`      vencimientos: ${(b.j?.expiration_dates ?? []).length} · strikes: ${(b.j?.strike_prices ?? []).length} · asset_price: ${b.j?.asset_price}`);

// ── 4 · coste de bajar el archivo con limit=100 ─────────────────────────────
console.log(`\n═══ 4 · COSTE DE BAJAR EL ARCHIVO ENTERO (limit=100) ═══\n`);
{
  let token = null, n = 0, pag = 0, bytes = 0;
  const t0 = Date.now();
  while (pag < 200) {
    pag++;
    const qs = `filter[scope]=all&filter[date][gte]=2026-08-18&filter[date][lte]=2026-08-18` +
      `&filter[premium][gte]=1000000&limit=100` + (token ? `&next_page_token=${token}` : "");
    const r = await get(`/flow_feed?${qs}`);
    if (r.http !== 200) break;
    const l = r.j?.list ?? [];
    n += l.length; bytes += r.bytes;
    token = r.j?.meta?.next_page_token ?? null;
    if (!l.length || !token) break;
    await dormir(80);
  }
  const seg = (Date.now() - t0) / 1000;
  const DM = 84;   // días de mercado en la ventana viva (2026-04-22 → hoy)
  console.log(`   un día a piso $1M: ${n} ops · ${pag} páginas · ${seg.toFixed(0)}s · ${(bytes / 1e6).toFixed(1)}MB  ${token ? "⚠ cortado" : "✓ completo"}`);
  if (!token) console.log(`   → ventana viva entera (${DM} días de mercado): ${(n * DM).toLocaleString("es-ES")} ops · ` +
    `${(seg * DM / 60).toFixed(0)} min · ${(bytes * DM / 1e6).toFixed(0)} MB`);
}
console.log(`\n═══ FIN ═══`);
