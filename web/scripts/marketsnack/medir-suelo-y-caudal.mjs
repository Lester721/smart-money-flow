// EL SUELO HISTÓRICO Y EL CAUDAL: hasta qué día llega el archivo, cuántas operaciones hay por
// día, y cuánto costaría bajarlo entero.
//
// Ahora que se sabe que filter[date][gte|lte] SÍ filtra de verdad (probado en probar-filtros.mjs),
// el suelo se encuentra por BÚSQUEDA BINARIA en vez de paginando a ciegas: 10 peticiones en vez
// de 3.500.
//
// Uso: node scripts/marketsnack/medir-suelo-y-caudal.mjs

import fs from "node:fs";

const BASE = "https://app.marketsnack.com/api";
const C = fs.readFileSync(".env.local", "utf8").split("\n")
  .find((l) => l.startsWith("MARKETSNACK_COOKIE="))?.slice("MARKETSNACK_COOKIE=".length).trim();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function feed(qs) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/flow_feed?filter[scope]=all&${qs}`, {
    headers: { Accept: "application/json", Cookie: C }, redirect: "manual",
    signal: AbortSignal.timeout(60000),
  });
  const txt = await r.text().catch(() => "");
  let j = null; try { j = JSON.parse(txt); } catch {}
  return { http: r.status, list: j?.list ?? [], token: j?.meta?.next_page_token ?? null, ms: Date.now() - t0, bytes: txt.length };
}
const iso = (d) => d.toISOString().slice(0, 10);
const dia = (s) => new Date(s + "T12:00:00Z");

// ── 1 · el suelo, por búsqueda binaria ──────────────────────────────────────
console.log(`═══ 1 · ¿HASTA QUÉ DÍA LLEGA EL ARCHIVO? (búsqueda binaria) ═══\n`);
// Un día sin filas puede ser festivo, no el suelo. Se prueba una VENTANA de 7 días.
async function hayDatos(f) {
  const desde = iso(new Date(dia(f).getTime() - 6 * 86400000));
  const r = await feed(`filter[date][gte]=${desde}&filter[date][lte]=${f}&filter[premium][gte]=1000000`);
  await dormir(150);
  return { hay: r.list.length > 0, n: r.list.length, http: r.http };
}
let lo = dia("2024-01-01"), hi = new Date();          // lo = sin datos (supuesto), hi = con datos
const arriba = await hayDatos(iso(hi));
console.log(`   hoy (${iso(hi)}): ${arriba.n} filas · HTTP ${arriba.http}`);
let pasos = 0;
while ((hi - lo) > 2 * 86400000 && pasos < 14) {
  pasos++;
  const mid = new Date((+lo + +hi) / 2);
  const r = await hayDatos(iso(mid));
  console.log(`   ${iso(mid)} → ${r.hay ? `${r.n} filas ✓` : "vacío"}`);
  if (r.hay) hi = mid; else lo = mid;
}
const suelo = iso(hi);
console.log(`\n   ── SUELO DEL ARCHIVO: la ventana más antigua con datos acaba en ${suelo}`);
console.log(`      profundidad: ${((Date.now() - +dia(suelo)) / 86400000).toFixed(0)} días\n`);

// ── 2 · caudal: ¿cuántas operaciones hay en un día, por piso de prima? ──────
console.log(`═══ 2 · CAUDAL — operaciones por día según el piso de prima ═══\n`);
const DIA_MUESTRA = "2026-08-18";   // lunes de mercado, sesión completa
const PISOS = [0, 25_000, 100_000, 250_000, 1_000_000, 5_000_000];
const caudal = [];
for (const piso of PISOS) {
  // se pagina el día entero para CONTAR de verdad, no se estima
  let token = null, n = 0, pag = 0, ms = 0;
  while (pag < 400) {
    pag++;
    const q = `filter[date][gte]=${DIA_MUESTRA}&filter[date][lte]=${DIA_MUESTRA}` +
      (piso ? `&filter[premium][gte]=${piso}` : "") + (token ? `&next_page_token=${token}` : "");
    const r = await feed(q);
    ms += r.ms;
    if (r.http !== 200) { console.log(`   piso $${piso}: HTTP ${r.http} en la página ${pag}`); break; }
    n += r.list.length;
    token = r.token;
    if (!r.list.length || !token) break;
    await dormir(120);
    if (pag >= 60) { console.log(`   piso $${piso.toLocaleString("es-ES")}: >${n} operaciones (corto en 60 páginas para no cargar su servidor)`); break; }
  }
  const completo = pag < 60;
  caudal.push({ piso, n, pag, ms, completo });
  console.log(`   piso $${String(piso).padStart(9)} → ${String(n).padStart(6)} operaciones en ${String(pag).padStart(3)} páginas · ${(ms / 1000).toFixed(1)}s${completo ? "" : "  (recuento PARCIAL)"}`);
  await dormir(300);
}

// ── 3 · cuánto costaría bajar todo el archivo ───────────────────────────────
console.log(`\n═══ 3 · COSTE DE BAJAR EL ARCHIVO ENTERO ═══\n`);
const diasMercado = Math.round(((Date.now() - +dia(suelo)) / 86400000) * (5 / 7));
for (const c of caudal) {
  if (!c.completo) { console.log(`   piso $${c.piso.toLocaleString("es-ES")}: no se midió entero, no doy número inventado`); continue; }
  const segPorDia = c.ms / 1000 + c.pag * 0.12;
  console.log(`   piso $${String(c.piso).padStart(9)} → ~${(c.n * diasMercado).toLocaleString("es-ES")} operaciones` +
    ` · ${(segPorDia * diasMercado / 60).toFixed(0)} min · ~${((c.n * diasMercado * 560) / 1e6).toFixed(0)} MB`);
}
console.log(`\n   (${diasMercado} días de mercado estimados entre ${suelo} y hoy)`);

// ── 4 · el filtro `side`: ¿existe con otro nombre? ──────────────────────────
console.log(`\n═══ 4 · EL FILTRO DE LADO (side) — probando nombres ═══\n`);
for (const q of ["filter[side][]=ASKSIDE", "filter[side]=ASKSIDE", "filter[trade_side][]=ASKSIDE",
                 "filter[side][]=AT_ASK", "filter[sentiment]=bullish", "filter[sentiment][]=bullish"]) {
  const r = await feed(q + `&period=1d`);
  if (r.http !== 200) { console.log(`   ✗ ${q.padEnd(32)} HTTP ${r.http}`); await dormir(150); continue; }
  const lados = [...new Set(r.list.map((t) => t.side))];
  const sent = [...new Set(r.list.map((t) => t.sentiment))];
  console.log(`   ${q.padEnd(32)} ${r.list.length} filas · lados: ${lados.join("/")} · sentimiento: ${sent.join("/")}`);
  await dormir(150);
}

// ── 5 · condiciones válidas ─────────────────────────────────────────────────
const rc = await fetch(`${BASE}/trade_conditions`, { headers: { Accept: "application/json", Cookie: C } });
const cond = await rc.json();
console.log(`\n═══ 5 · CONDICIONES (${cond.length}) — id, abreviatura ═══`);
console.log(`   ${cond.map((c) => `${c.id}:${c.abbreviation}`).join("  ")}`);
const pruebaCond = cond.find((c) => c.abbreviation === "ISOI") ?? cond[0];
const rr = await feed(`filter[condition][]=${pruebaCond.id}&period=1d`);
const condsDev = [...new Set(rr.list.map((t) => t.trade_condition_id))];
console.log(`\n   filter[condition][]=${pruebaCond.id} (${pruebaCond.abbreviation}) → HTTP ${rr.http} · ${rr.list.length} filas · condiciones devueltas: ${condsDev.join(",")}` +
  ` ${rr.list.length && condsDev.every((c) => c === pruebaCond.id) ? "✓ FILTRA" : rr.list.length ? "✗ IGNORADO" : ""}`);
