// ESTRUCTURA 4 · LA HORA DE ENTRADA, MEDIDA CONTRA LA COLA (no contra la media).
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/estructura4-hora-cola.mjs
//
// ═══ QUÉ SE MIDE Y EN QUÉ SE DIFERENCIA ══════════════════════════════════════════════════════
//
// La hora de entrada ya se barrió una vez CONTRA LA MEDIA y las 11:00 salieron bien. Nadie la
// barrió contra la COLA. Lester no quiere subir la media: quiere partir el peor día y la peor
// racha conservando el máximo posible de los $18.696/año.
//
// Se barren 23 horas de entrada (09:35 y luego cada 15 min hasta las 15:00) con el MISMO cóndor
// de siempre: vender call a +25 puntos del spot y put a −25, comprar las alas 50 puntos más allá.
// Se cobra el BID de lo vendido y se paga el ASK de lo comprado, las cuatro patas, y se liquida
// contra el precio real de las 16:00. Comisión $0,03 por pata.
//
// Y se prueba SALIR antes del cierre (15:00 / 15:30 / 15:45) a precios reales: recomprar lo
// vendido al ASK y vender lo comprado al BID — la horquilla entera otra vez. No es un stop: es
// una hora fija, sin decisión, así que no mira al futuro.
//
// ═══ NADA MIRA AL FUTURO ═════════════════════════════════════════════════════════════════════
// La hora de entrada y la de salida se fijan de antemano. El único dato del día que entra en la
// decisión es el spot en el momento de entrar, que es observable. No se usa ningún cierre de hoy.
//
// ═══ PRUEBAS ═════════════════════════════════════════════════════════════════════════════════
// 23 horas de entrada + 66 combinaciones (entrada × 3 salidas, las válidas) = 89 pruebas nuevas.
// Acumulado del proyecto sobre estos mismos 653 días: 187 + 89 = 276.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { listonT, tWelch } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";
import { resumen, media, pct, eur } from "./anatomia3-lib.mjs";

const DIR = "scripts/cache-theta/gex-2026";
const SEP = 25, ALA = 50, COMM = 0.03;
const PRUEBAS = 276, LISTON = listonT(PRUEBAS);

const ENTRADAS = ["09:35", "09:45", "10:00", "10:15", "10:30", "10:45", "11:00", "11:15", "11:30",
                  "11:45", "12:00", "12:15", "12:30", "12:45", "13:00", "13:15", "13:30", "13:45",
                  "14:00", "14:15", "14:30", "14:45", "15:00"];
const SALIDAS = ["15:00", "15:30", "15:45"];
const HORAS = [...new Set([...ENTRADAS, ...SALIDAS])];

/** Lee un día y devuelve, por hora pedida, las patas + el spot de esa hora. Y el cierre real. */
function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").split("\n");
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid");
  const iA = cab.indexOf("ask"), iV = cab.indexOf("implied_vol"), iU = cab.indexOf("underlying_price");
  // un campo que no existe se lee como 0 y 45 minutos después sigues midiendo cero: se para aquí.
  if ([iK, iT, iB, iA, iV, iU].some((x) => x < 0)) throw new Error(`faltan columnas en ${f}`);

  const set = new Set(HORAS);
  const filas = new Map(), spots = new Map();
  let cierre = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const L = lin[j]; if (L.length < 20) continue;
    const c = L.split(",");
    const h = c[iT].slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && h >= hFin) { hFin = h; cierre = sp; }
    if (!set.has(h)) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (!(K > 0) || !(ask > 0) || !(bid >= 0)) continue;
    if (!filas.has(h)) filas.set(h, []);
    filas.get(h).push({ K, bid, ask, iv: Number(c[iV]) });
    if (sp > 0) spots.set(h, sp);
  }
  return { filas, spots, cierre, hFin };
}

const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));
const buscar = (f, K) => f.find((x) => x.K === K) || null;

const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();

// ═══ CONSTRUCCIÓN ════════════════════════════════════════════════════════════════════════════
const porHora = new Map(ENTRADAS.map((h) => [h, []]));
const combos = new Map();                        // "entrada→salida" → filas
for (const e of ENTRADAS) for (const s of SALIDAS) if (s > e) combos.set(`${e}→${s}`, []);
const saltados = { sinFichero: 0, sinCierre: 0, sinSpot: new Map(), sinCredito: new Map(), sinAlas: new Map() };

for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P) { saltados.sinFichero++; continue; }
  if (!(C.cierre > 0)) { saltados.sinCierre++; continue; }
  const S = C.cierre;

  for (const h of ENTRADAS) {
    const fc = C.filas.get(h), fp = P.filas.get(h), spot = C.spots.get(h);
    if (!fc || !fp || !(spot > 0)) { saltados.sinSpot.set(h, (saltados.sinSpot.get(h) || 0) + 1); continue; }

    const cC = cerca(fc, spot + SEP), pC = cerca(fp, spot - SEP);
    const cL = cerca(fc, cC.K + ALA), pL = cerca(fp, pC.K - ALA);
    if (cL.K <= cC.K || pL.K >= pC.K) { saltados.sinAlas.set(h, (saltados.sinAlas.get(h) || 0) + 1); continue; }

    // SE COBRA EL BID de lo vendido, SE PAGA EL ASK de lo comprado. Las cuatro patas.
    const credito = cC.bid + pC.bid - cL.ask - pL.ask;
    if (!(credito > 0)) { saltados.sinCredito.set(h, (saltados.sinCredito.get(h) || 0) + 1); continue; }

    const perdC = Math.min(Math.max(S - cC.K, 0), cL.K - cC.K);
    const perdP = Math.min(Math.max(pC.K - S, 0), pC.K - pL.K);
    const pl = (credito - perdC - perdP) * 100 - 8 * COMM;

    // σ de lo que QUEDA de sesión con la IV del dinero AL ENTRAR. Observable al operar.
    const atm = cerca(fc, spot);
    const horas = Math.max(0.05, 16 - Number(h.slice(0, 2)) - Number(h.slice(3)) / 60);
    const sigma = atm.iv > 0 ? spot * atm.iv * Math.sqrt(horas / (252 * 6.5)) : null;

    porHora.get(h).push({
      fecha, ticker: "SPXW", pl, credito: credito * 100, sigma,
      sepSigmas: sigma ? SEP / sigma : null, spot, kC: cC.K, kP: pC.K,
      horasVivas: horas, riesgo: (ALA - credito) * 100,
    });

    // ── SALIR ANTES: recomprar lo vendido al ASK y vender lo comprado al BID. Horquilla entera. ──
    for (const sh of SALIDAS) {
      if (sh <= h) continue;
      const gc = C.filas.get(sh), gp = P.filas.get(sh);
      if (!gc || !gp) continue;
      const xcC = buscar(gc, cC.K), xpC = buscar(gp, pC.K), xcL = buscar(gc, cL.K), xpL = buscar(gp, pL.K);
      if (!xcC || !xpC || !xcL || !xpL) continue;
      const debito = xcC.ask + xpC.ask - xcL.bid - xpL.bid;
      combos.get(`${h}→${sh}`).push({ fecha, ticker: "SPXW", pl: (credito - debito) * 100 - 8 * COMM, credito: credito * 100 });
    }
  }
}

// ═══ RADIOGRAFÍA ANTES DE MEDIR ══════════════════════════════════════════════════════════════
console.log(`\n${"=".repeat(96)}`);
console.log(`ESTRUCTURA 4 · LA HORA DE ENTRADA CONTRA LA COLA · ${fechas.length} dias de SPXW 0DTE (2024-01-02 -> 2026-08-10)`);
console.log(`condor +-${SEP} puntos, alas ${ALA} · bid al vender / ask al comprar · comision $${COMM}/pata`);
console.log(`${"=".repeat(96)}\n`);
radiografia(porHora.get("11:00"), ["pl", "credito", "sigma", "sepSigmas", "spot", "riesgo"], "11:00 (la de hoy)");
radiografia(porHora.get("15:00"), ["pl", "credito", "sigma", "sepSigmas"], "15:00 (la mas tardia)");

const BASE = porHora.get("11:00");
const ANOS = BASE.length / 251;
const rBase = resumen(BASE, ANOS);
console.log(`\nBASE (11:00, aguantar al cierre): n=${rBase.n} · ${eur(rBase.alAno)}/ano · peor dia ${eur(rBase.peor)} · ` +
            `peor racha ${eur(rBase.dd)} · p5 ${eur(rBase.p5)} · acierto ${(rBase.acierto * 100).toFixed(1)}%`);

// ═══ 1. EL BARRIDO DE LA HORA ════════════════════════════════════════════════════════════════
const eficiencia = (r) => (r.dd < 0 ? r.alAno / Math.abs(r.dd) : NaN);   // $/año por cada $ de caída
const filaTabla = (nombre, v) => {
  const r = resumen(v, v.length / 251);
  const cred = pct(v.map((x) => x.credito), 0.5);
  const sig = v.map((x) => x.sepSigmas).filter((x) => x != null);
  const dIng = r.alAno - rBase.alAno, dCai = Math.abs(rBase.dd) - Math.abs(r.dd);
  return { nombre, r, cred, sigMed: sig.length ? media(sig) : null, ef: eficiencia(r),
           dIng, dCai, coste: dCai > 0 ? -dIng / dCai : null,
           t: tWelch(v.map((x) => x.pl), BASE.map((x) => x.pl)) };
};

console.log(`\n-- 1 · BARRIDO DE LA HORA DE ENTRADA (aguantar al cierre) --------------------------------------`);
console.log(`\n| entrada | n | $/ano | media/dia | peor dia | p1 | p5 | peor racha | acierto | cred.med | +-25 en sigmas | $/ano por $caida |`);
console.log(`|---|---|---|---|---|---|---|---|---|---|---|---|`);
const tabla = [];
for (const h of ENTRADAS) {
  const v = porHora.get(h);
  if (v.length < 100) { console.log(`| ${h} | ${v.length} -- muestra insuficiente, NO se mide |`); continue; }
  const f = filaTabla(h, v); tabla.push(f);
  const marca = h === "11:00" ? " <-- hoy" : "";
  console.log(`| **${h}**${marca} | ${f.r.n} | ${eur(f.r.alAno)} | ${eur(f.r.media)} | ${eur(f.r.peor)} | ${eur(f.r.p1)} | ${eur(f.r.p5)} | ` +
              `${eur(f.r.dd)} | ${(f.r.acierto * 100).toFixed(0)}% | ${eur(f.cred)} | ${f.sigMed ? f.sigMed.toFixed(2) : "—"} | ${f.ef.toFixed(2)} |`);
}

// días descartados por hora — si una hora pierde días, la comparación no es limpia
console.log(`\n  dias descartados por hora (credito <= 0 al entrar, o sin spot/alas):`);
const perdidos = ENTRADAS.map((h) => `${h}:${(saltados.sinCredito.get(h) || 0) + (saltados.sinSpot.get(h) || 0) + (saltados.sinAlas.get(h) || 0)}`);
console.log(`    ${perdidos.join("  ")}`);
if (saltados.sinFichero || saltados.sinCierre) console.log(`    dias sin fichero: ${saltados.sinFichero} · sin cierre: ${saltados.sinCierre}`);

// ═══ 2. PANEL COMÚN — sólo los días en que TODAS las horas dan un cóndor ═════════════════════
const cuenta = new Map();
for (const h of ENTRADAS) for (const x of porHora.get(h)) cuenta.set(x.fecha, (cuenta.get(x.fecha) || 0) + 1);
const comunes = new Set([...cuenta].filter(([, n]) => n === ENTRADAS.length).map(([f]) => f));
console.log(`\n-- 2 · MISMOS DIAS PARA TODAS LAS HORAS (${comunes.size} de ${fechas.length}) ------------------------------`);
console.log(`\n| entrada | $/ano | peor dia | p5 | peor racha | $/ano por $caida |`);
console.log(`|---|---|---|---|---|---|`);
const AC = comunes.size / 251;
const tablaC = [];
for (const h of ENTRADAS) {
  const v = porHora.get(h).filter((x) => comunes.has(x.fecha));
  if (v.length < 100) continue;
  const r = resumen(v, AC); tablaC.push({ h, r });
  console.log(`| ${h}${h === "11:00" ? " <--" : ""} | ${eur(r.alAno)} | ${eur(r.peor)} | ${eur(r.p5)} | ${eur(r.dd)} | ${eficiencia(r).toFixed(2)} |`);
}

// ═══ 3. SALIR ANTES DEL CIERRE ═══════════════════════════════════════════════════════════════
console.log(`\n-- 3 · SALIR ANTES DEL CIERRE (hora fija, precios reales, horquilla entera otra vez) -----------`);
console.log(`\n| entrada->salida | n | $/ano | peor dia | p5 | peor racha | acierto | $/ano por $caida |`);
console.log(`|---|---|---|---|---|---|---|---|`);
const tablaS = [];
for (const k of [...combos.keys()]) {
  const v = combos.get(k);
  if (v.length < 100) continue;
  const r = resumen(v, v.length / 251);
  tablaS.push({ k, r, ef: eficiencia(r) });
}
tablaS.sort((a, b) => b.r.alAno - a.r.alAno);
for (const x of tablaS.slice(0, 14))
  console.log(`| ${x.k} | ${x.r.n} | ${eur(x.r.alAno)} | ${eur(x.r.peor)} | ${eur(x.r.p5)} | ${eur(x.r.dd)} | ${(x.r.acierto * 100).toFixed(0)}% | ${isFinite(x.ef) ? x.ef.toFixed(2) : "—"} |`);
console.log(`  (las 14 mejores por $/ano de ${tablaS.length} combinaciones medidas; las demas son peores)`);
const mejorS = tablaS[0];
console.log(`\n  la mejor salida anticipada: ${mejorS.k} -> ${eur(mejorS.r.alAno)}/ano contra ${eur(rBase.alAno)} de aguantar al cierre.`);

// ═══ 4. ¿AGUANTA POR TERCIOS? ════════════════════════════════════════════════════════════════
// El peor día es UNA observación. Elegir la hora con el mejor peor-día es sobreajuste puro.
// Lo que tiene que repetirse en los TRES tercios es la mejora, no el récord.
const tercio = (v, i) => { const s = [...v].sort((a, b) => a.fecha.localeCompare(b.fecha)); const k = Math.floor(s.length / 3); return i === 2 ? s.slice(2 * k) : s.slice(i * k, (i + 1) * k); };
const candidatas = [...tabla].sort((a, b) => b.ef - a.ef).slice(0, 5).map((x) => x.nombre);
if (!candidatas.includes("11:00")) candidatas.push("11:00");
console.log(`\n-- 4 · LOS TRES TERCIOS DE TIEMPO (las 5 horas mas eficientes + la de hoy) ---------------------`);
console.log(`\n| entrada | T1 $/ano | T1 peor dia | T2 $/ano | T2 peor dia | T3 $/ano | T3 peor dia | signo |`);
console.log(`|---|---|---|---|---|---|---|---|`);
const porTercios = {};
for (const h of candidatas.sort()) {
  const v = porHora.get(h);
  const ts = [0, 1, 2].map((i) => { const g = tercio(v, i); return resumen(g, g.length / 251); });
  const signo = ts.map((r) => (r.alAno > 0 ? "+" : "-")).join("");
  porTercios[h] = ts.map((r) => ({ alAno: r.alAno, peor: r.peor, dd: r.dd, n: r.n }));
  console.log(`| ${h}${h === "11:00" ? " <--" : ""} | ${eur(ts[0].alAno)} | ${eur(ts[0].peor)} | ${eur(ts[1].alAno)} | ${eur(ts[1].peor)} | ${eur(ts[2].alAno)} | ${eur(ts[2].peor)} | ${signo} |`);
}

// ═══ 5. LO QUE DECIDE ════════════════════════════════════════════════════════════════════════
console.log(`\n-- 5 · LA METRICA QUE DECIDE: cuanto ingreso cuesta cada dolar de caida eliminado --------------`);
console.log(`\n(base 11:00 = ${eur(rBase.alAno)}/ano con ${eur(rBase.dd)} de peor racha -> ${eficiencia(rBase).toFixed(2)} $/ano por $ de caida)`);
console.log(`\n| entrada | D$/ano | caida eliminada | coste: $/ano perdidos por $ de caida quitado | mejora la eficiencia? | t vs 11:00 |`);
console.log(`|---|---|---|---|---|---|`);
for (const f of tabla) {
  if (f.nombre === "11:00") continue;
  const mejor = f.ef > eficiencia(rBase);
  console.log(`| ${f.nombre} | ${eur(f.dIng)} | ${f.dCai > 0 ? eur(f.dCai) : "no la reduce"} | ${f.coste != null ? f.coste.toFixed(2) : "—"} | ` +
              `${mejor ? `SI (${f.ef.toFixed(2)} vs ${eficiencia(rBase).toFixed(2)})` : "no"} | ${f.t.toFixed(2)} |`);
}
console.log(`\nliston de Bonferroni con ${PRUEBAS} pruebas acumuladas: |t| >= ${LISTON}`);
console.log(`(el t es sobre la MEDIA; para la cola no hay liston de t -- decide la eficiencia y que aguante los tres tercios)`);

writeFileSync("scripts/estructura4-hora-cola.json", JSON.stringify({
  base: rBase, anos: ANOS, pruebas: PRUEBAS, liston: LISTON,
  barrido: tabla.map((f) => ({ hora: f.nombre, ...f.r, credMed: f.cred, sepSigmas: f.sigMed, ef: f.ef, dIng: f.dIng, dCai: f.dCai, coste: f.coste, t: f.t })),
  comun: { dias: comunes.size, filas: tablaC.map((x) => ({ hora: x.h, ...x.r, ef: eficiencia(x.r) })) },
  salidas: tablaS.map((x) => ({ combo: x.k, ...x.r, ef: x.ef })),
  tercios: porTercios,
}, null, 2));
console.log(`\n-> scripts/estructura4-hora-cola.json`);
