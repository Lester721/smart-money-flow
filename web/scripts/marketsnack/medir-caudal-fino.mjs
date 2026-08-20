// CAUDAL FINO: el suelo exacto del archivo, el tamaño de página real, y un día contado ENTERO.
//
// Tres preguntas que deciden si merece la pena bajar el archivo:
//   1. ¿qué día exacto es el suelo? (y ¿la ventana RUEDA — se pierde lo viejo?)
//   2. ¿se puede subir el tamaño de página? el bundle usa `limit`, así que existe
//   3. ¿cuántas operaciones tiene un día ENTERO, contadas una a una?
//
// Uso: node scripts/marketsnack/medir-caudal-fino.mjs

import fs from "node:fs";

const BASE = "https://app.marketsnack.com/api";
const C = fs.readFileSync(".env.local", "utf8").split("\n")
  .find((l) => l.startsWith("MARKETSNACK_COOKIE="))?.slice("MARKETSNACK_COOKIE=".length).trim();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function feed(qs) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/flow_feed?filter[scope]=all&${qs}`, {
    headers: { Accept: "application/json", Cookie: C }, redirect: "manual",
    signal: AbortSignal.timeout(90000),
  });
  const txt = await r.text().catch(() => "");
  let j = null; try { j = JSON.parse(txt); } catch {}
  return { http: r.status, list: j?.list ?? [], token: j?.meta?.next_page_token ?? null, ms: Date.now() - t0, bytes: txt.length };
}

// ── 1 · el suelo, día a día ─────────────────────────────────────────────────
console.log(`═══ 1 · EL SUELO EXACTO ═══\n`);
for (const d of ["2026-04-14", "2026-04-15", "2026-04-16", "2026-04-17", "2026-04-20",
                 "2026-04-21", "2026-04-22", "2026-04-23"]) {
  const r = await feed(`filter[date][gte]=${d}&filter[date][lte]=${d}&filter[premium][gte]=1000000`);
  console.log(`   ${d}  HTTP ${r.http} · ${String(r.list.length).padStart(2)} filas` +
    (r.list.length ? `  ✓  (la más antigua de la página: ${r.list[r.list.length - 1]?.timestamp?.slice(0, 19)})` : "  vacío"));
  await dormir(180);
}
console.log(`\n   ⚠ El fichero ya cacheado (data/marketsnack/flujo-prima1000k.jsonl, bajado el 12-ago)`);
console.log(`     llega hasta 2026-04-15. Si hoy 04-15 y 04-16 vuelven VACÍOS, la ventana RUEDA:`);
console.log(`     lo que no esté en disco se pierde y no hay forma de recuperarlo.\n`);

// ── 2 · tamaño de página ────────────────────────────────────────────────────
console.log(`═══ 2 · ¿SE PUEDE SUBIR EL TAMAÑO DE PÁGINA? ═══\n`);
for (const lim of [50, 60, 100, 200, 500, 1000]) {
  const r = await feed(`period=1d&filter[premium][gte]=100000&limit=${lim}`);
  console.log(`   limit=${String(lim).padEnd(5)} HTTP ${r.http} · ${String(r.list.length).padStart(4)} filas devueltas · ${(r.bytes / 1024).toFixed(0)}kB · ${r.ms}ms` +
    (r.list.length === lim ? "  ✓ lo respeta" : r.list.length === 50 ? "  ← tope de 50" : ""));
  await dormir(200);
}

// ── 3 · un día entero, contado ──────────────────────────────────────────────
const DIA = "2026-08-18";
const LIM = Number(process.argv[2] || 50);
console.log(`\n═══ 3 · UN DÍA ENTERO CONTADO (${DIA}) ═══\n`);
for (const piso of [1_000_000, 100_000]) {
  let token = null, n = 0, pag = 0, ms = 0, bytes = 0;
  const t0 = Date.now();
  const TOPE = piso >= 1e6 ? 400 : 900;
  while (pag < TOPE) {
    pag++;
    const r = await feed(`filter[date][gte]=${DIA}&filter[date][lte]=${DIA}&filter[premium][gte]=${piso}&limit=${LIM}` +
      (token ? `&next_page_token=${token}` : ""));
    if (r.http !== 200) { console.log(`   HTTP ${r.http} en la página ${pag} — paro`); break; }
    n += r.list.length; ms += r.ms; bytes += r.bytes;
    token = r.token;
    if (!r.list.length || !token) break;
    if (pag % 50 === 0) console.log(`      … ${pag} páginas · ${n} operaciones · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    await dormir(110);
  }
  const completo = Boolean(!token);
  const seg = (Date.now() - t0) / 1000;
  console.log(`   piso $${piso.toLocaleString("es-ES").padStart(9)} → ${String(n).padStart(6)} operaciones · ${pag} páginas · ${seg.toFixed(0)}s · ${(bytes / 1e6).toFixed(1)} MB` +
    (completo ? "  ✓ día COMPLETO" : `  ⚠ INCOMPLETO (corté en ${TOPE} páginas)`));
  if (completo) {
    const dias = 85;   // días de mercado en la ventana de 4 meses
    console.log(`      → el archivo entero (${dias} días de mercado): ~${(n * dias).toLocaleString("es-ES")} operaciones · ` +
      `${(seg * dias / 60).toFixed(0)} min · ${(bytes * dias / 1e6).toFixed(0)} MB`);
  }
  await dormir(500);
}
