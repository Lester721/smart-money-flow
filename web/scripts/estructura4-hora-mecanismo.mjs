// ESTRUCTURA 4 (2/2) · EL MECANISMO — ¿es la HORA o es la DISTANCIA disfrazada de hora?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/estructura4-hora-mecanismo.mjs
//
// ═══ EL CONFUNDIDO QUE HAY QUE ROMPER ════════════════════════════════════════════════════════
//
// El barrido de la hora dio que entrar por la tarde encoge la cola: el percentil 5 pasa de −$2.579
// a las 11:00 a −$1.130 a las 13:45 y a −$679 a las 14:30. Pero los ±25 puntos son FIJOS EN
// DÓLARES, y a las 11:00 son 0,41 σ mientras a las 13:45 son 0,62 σ. Entrar más tarde es, sin
// querer, vender MÁS LEJOS. Puede que no haya ningún efecto de la hora: sólo moneyness.
//
// Aquí se rompe: se cruza HORA × DISTANCIA EN SIGMAS. Si a igual sigma la hora tardía sigue
// teniendo menos cola, el efecto es de la hora. Si desaparece, era la distancia.
//
// La sigma sale de la IV del dinero EN EL MOMENTO DE ENTRAR escalada a lo que queda de sesión:
// observable al operar. Ningún dato posterior a la entrada decide nada.
//
// ═══ Y LA SEGUNDA PREGUNTA ═══════════════════════════════════════════════════════════════════
// Por qué el PEOR DÍA no se mueve (−$4.790 a −$4.950 en las 23 horas) mientras el percentil 5 se
// parte por la mitad. Se cuentan los días de PÉRDIDA MÁXIMA y se mide la CVaR (media de la cola,
// no un punto suelto, que es una observación y se sobreajusta sola).
//
// ═══ PRUEBAS ═════════════════════════════════════════════════════════════════════════════════
// 5 horas × 5 distancias = 25 nuevas. Acumulado: 276 + 25 = 301.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { listonT, tWelch } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";
import { resumen, media, pct, eur } from "./anatomia3-lib.mjs";

const DIR = "scripts/cache-theta/gex-2026";
const ALA = 50, COMM = 0.03, SEP = 25;
const PRUEBAS = 301, LISTON = listonT(PRUEBAS);

const HORAS_G = ["11:00", "12:00", "13:00", "13:45", "14:30"];
const SIGMAS = [0.40, 0.50, 0.62, 0.75, 0.90];
const TODAS = ["09:35", "09:45", "10:00", "10:15", "10:30", "10:45", "11:00", "11:15", "11:30",
               "11:45", "12:00", "12:15", "12:30", "12:45", "13:00", "13:15", "13:30", "13:45",
               "14:00", "14:15", "14:30", "14:45", "15:00"];

function leerDia(fecha, right, horas) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").split("\n");
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid");
  const iA = cab.indexOf("ask"), iV = cab.indexOf("implied_vol"), iU = cab.indexOf("underlying_price");
  if ([iK, iT, iB, iA, iV, iU].some((x) => x < 0)) throw new Error(`faltan columnas en ${f}`);
  const set = new Set(horas), filas = new Map(), spots = new Map();
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
  return { filas, spots, cierre };
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));
const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();

/** Construye el cóndor a una hora con una distancia dada. Devuelve null si no se puede abrir. */
function condor(fc, fp, spot, dist, S) {
  const cC = cerca(fc, spot + dist), pC = cerca(fp, spot - dist);
  const cL = cerca(fc, cC.K + ALA), pL = cerca(fp, pC.K - ALA);
  if (cL.K <= cC.K || pL.K >= pC.K) return null;
  const credito = cC.bid + pC.bid - cL.ask - pL.ask;
  if (!(credito > 0)) return null;
  const perdC = Math.min(Math.max(S - cC.K, 0), cL.K - cC.K);
  const perdP = Math.min(Math.max(pC.K - S, 0), pC.K - pL.K);
  return {
    pl: (credito - perdC - perdP) * 100 - 8 * COMM, credito: credito * 100,
    maxPerdida: (ALA - credito) * 100, roto: (perdC + perdP) > 0 ? 1 : 0,
    total: (perdC >= ALA - 0.01 || perdP >= ALA - 0.01) ? 1 : 0, dist,
  };
}

// ═══ RECOGIDA ════════════════════════════════════════════════════════════════════════════════
const rej = new Map();                                    // "hora|sigma" → filas
for (const h of HORAS_G) for (const s of SIGMAS) rej.set(`${h}|${s}`, []);
const fijo = new Map(TODAS.map((h) => [h, []]));          // ±25 fijos, todas las horas

for (const fecha of fechas) {
  const C = leerDia(fecha, "C", TODAS), P = leerDia(fecha, "P", TODAS);
  if (!C || !P || !(C.cierre > 0)) continue;
  const S = C.cierre;

  for (const h of TODAS) {
    const fc = C.filas.get(h), fp = P.filas.get(h), spot = C.spots.get(h);
    if (!fc || !fp || !(spot > 0)) continue;
    const atm = cerca(fc, spot);
    const horasVivas = Math.max(0.05, 16 - Number(h.slice(0, 2)) - Number(h.slice(3)) / 60);
    const sigma = atm.iv > 0 ? spot * atm.iv * Math.sqrt(horasVivas / (252 * 6.5)) : null;

    const c25 = condor(fc, fp, spot, SEP, S);
    if (c25) fijo.get(h).push({ fecha, ticker: "SPXW", ...c25, sigma, sepSigmas: sigma ? SEP / sigma : null });

    if (!HORAS_G.includes(h) || !(sigma > 0)) continue;
    for (const k of SIGMAS) {
      const c = condor(fc, fp, spot, k * sigma, S);
      if (c) rej.get(`${h}|${k}`).push({ fecha, ticker: "SPXW", ...c, sigma });
    }
  }
}

console.log(`\n${"=".repeat(100)}`);
console.log(`ESTRUCTURA 4 (2/2) · EL MECANISMO · ${fechas.length} dias de SPXW 0DTE · alas ${ALA} pts · precios reales`);
console.log(`${"=".repeat(100)}`);
radiografia(rej.get("13:45|0.62"), ["pl", "credito", "dist", "sigma", "maxPerdida"], "13:45 a 0,62 sigma",
            { cerosLegitimos: ["roto", "total"] });

const cvar = (pls, q) => { const s = [...pls].sort((a, b) => a - b); const k = Math.max(1, Math.floor(s.length * q)); return media(s.slice(0, k)); };
const ANOS_BASE = 653 / 251;
const stats = (v) => {
  const r = resumen(v, v.length / 251), pls = v.map((x) => x.pl);
  return { ...r, cvar5: cvar(pls, 0.05), cvar1: cvar(pls, 0.01),
           rotos: v.filter((x) => x.roto).length / v.length, totales: v.filter((x) => x.total).length,
           credMed: pct(v.map((x) => x.credito), 0.5), distMed: media(v.map((x) => x.dist)),
           maxPerdMed: media(v.map((x) => x.maxPerdida)) };
};

// ═══ A · POR QUÉ EL PEOR DÍA NO SE MUEVE ═════════════════════════════════════════════════════
console.log(`\n-- A · POR QUE EL PEOR DIA NO SE MUEVE Y EL PERCENTIL 5 SI (condor +-25 fijos) ----------------`);
console.log(`\n| entrada | n | $/ano | % dias rotos | dias de perdida MAXIMA | perdida max. posible | p5 | CVaR5 | CVaR1 | peor dia |`);
console.log(`|---|---|---|---|---|---|---|---|---|---|`);
const fijoStats = {};
for (const h of TODAS) {
  const v = fijo.get(h); if (v.length < 100) continue;
  const s = stats(v); fijoStats[h] = s;
  console.log(`| ${h}${h === "11:00" ? " <-- hoy" : ""} | ${s.n} | ${eur(s.alAno)} | ${(s.rotos * 100).toFixed(1)}% | ${s.totales} | ${eur(-s.maxPerdMed)} | ` +
              `${eur(s.p5)} | ${eur(s.cvar5)} | ${eur(s.cvar1)} | ${eur(s.peor)} |`);
}
console.log(`\n  ("dias rotos" = el cierre acabo fuera de una pata corta. "perdida maxima" = ancho del ala menos el credito:`);
console.log(`   cuanto mas tarde se entra, MENOS credito, luego el techo de perdida SUBE aunque se rompa menos veces.)`);

// ═══ B · HORA × DISTANCIA ════════════════════════════════════════════════════════════════════
console.log(`\n-- B · HORA x DISTANCIA EN SIGMAS -- si a igual sigma la tarde sigue ganando, es la HORA ------`);
for (const met of [["$/ano", "alAno", eur], ["p5", "p5", eur], ["CVaR5", "cvar5", eur], ["peor racha", "dd", eur], ["% dias rotos", "rotos", (x) => (x * 100).toFixed(1) + "%"], ["credito med.", "credMed", eur]]) {
  console.log(`\n  ${met[0]}:`);
  console.log(`  | entrada | ${SIGMAS.map((s) => s.toFixed(2) + " sigma").join(" | ")} |`);
  console.log(`  |---|${SIGMAS.map(() => "---").join("|")}|`);
  for (const h of HORAS_G) {
    const fila = SIGMAS.map((k) => { const v = rej.get(`${h}|${k}`); return v.length >= 100 ? met[2](stats(v)[met[1]]) : "n<100"; });
    console.log(`  | ${h} | ${fila.join(" | ")} |`);
  }
}

// ═══ C · LA COMPARACIÓN LIMPIA: MISMA SIGMA, DISTINTA HORA ═══════════════════════════════════
console.log(`\n-- C · A IGUAL 0,62 SIGMA (la moneyness de las 13:45 con +-25 fijos) --------------------------`);
console.log(`\n| entrada | n | dist. media (pts) | $/ano | p5 | CVaR5 | peor racha | % rotos | acierto | $/ano por $CVaR5 |`);
console.log(`|---|---|---|---|---|---|---|---|---|---|`);
const compC = {};
for (const h of HORAS_G) {
  const v = rej.get(`${h}|0.62`); if (v.length < 100) continue;
  const s = stats(v); compC[h] = s;
  console.log(`| ${h} | ${s.n} | ${s.distMed.toFixed(0)} | ${eur(s.alAno)} | ${eur(s.p5)} | ${eur(s.cvar5)} | ${eur(s.dd)} | ${(s.rotos * 100).toFixed(1)}% | ${(s.acierto * 100).toFixed(0)}% | ${(s.alAno / Math.abs(s.cvar5)).toFixed(1)} |`);
}

// ═══ D · LA FAMILIA, NO LA HORA GANADORA ═════════════════════════════════════════════════════
// Elegir 13:45 entre 23 horas es sobreajuste. Lo que vale es si la VENTANA entera mejora.
console.log(`\n-- D · LA VENTANA, NO LA HORA GANADORA (elegir 1 de 23 es sobreajuste) ------------------------`);
const bloques = {
  "manana 09:35-10:45": ["09:35", "09:45", "10:00", "10:15", "10:30", "10:45"],
  "mediodia 11:00-12:45": ["11:00", "11:15", "11:30", "11:45", "12:00", "12:15", "12:30", "12:45"],
  "tarde 13:00-14:30": ["13:00", "13:15", "13:30", "13:45", "14:00", "14:15", "14:30"],
  "final 14:45-15:00": ["14:45", "15:00"],
};
console.log(`\n| ventana | horas | $/ano medio | p5 medio | CVaR5 medio | peor racha media | peor dia (el peor de la ventana) | $/ano por $CVaR5 |`);
console.log(`|---|---|---|---|---|---|---|---|`);
const bloqueStats = {};
for (const [nom, hs] of Object.entries(bloques)) {
  const ss = hs.map((h) => fijoStats[h]).filter(Boolean);
  const m = (k) => media(ss.map((s) => s[k]));
  bloqueStats[nom] = { alAno: m("alAno"), p5: m("p5"), cvar5: m("cvar5"), dd: m("dd"), peor: Math.min(...ss.map((s) => s.peor)) };
  console.log(`| ${nom} | ${ss.length} | ${eur(m("alAno"))} | ${eur(m("p5"))} | ${eur(m("cvar5"))} | ${eur(m("dd"))} | ${eur(Math.min(...ss.map((s) => s.peor)))} | ${(m("alAno") / Math.abs(m("cvar5"))).toFixed(1)} |`);
}
const base = fijoStats["11:00"];
console.log(`\n  base 11:00: ${eur(base.alAno)}/ano · p5 ${eur(base.p5)} · CVaR5 ${eur(base.cvar5)} · ${(base.alAno / Math.abs(base.cvar5)).toFixed(1)} $/ano por $ de CVaR5`);
const tardeHoras = bloques["tarde 13:00-14:30"];
const mejores = tardeHoras.filter((h) => fijoStats[h] && Math.abs(fijoStats[h].cvar5) < Math.abs(base.cvar5)).length;
const mejoresDD = tardeHoras.filter((h) => fijoStats[h] && Math.abs(fijoStats[h].dd) < Math.abs(base.dd)).length;
const mejoresEf = tardeHoras.filter((h) => fijoStats[h] && fijoStats[h].alAno / Math.abs(fijoStats[h].cvar5) > base.alAno / Math.abs(base.cvar5)).length;
console.log(`  de las ${tardeHoras.length} horas de la tarde: ${mejores} tienen menos CVaR5, ${mejoresDD} menos peor racha, ${mejoresEf} mejor eficiencia que las 11:00.`);

// ═══ E · TERCIOS, sobre la ventana entera ════════════════════════════════════════════════════
console.log(`\n-- E · LOS TRES TERCIOS DE TIEMPO ---------------------------------------------------------------`);
const tercio = (v, i) => { const s = [...v].sort((a, b) => a.fecha.localeCompare(b.fecha)); const k = Math.floor(s.length / 3); return i === 2 ? s.slice(2 * k) : s.slice(i * k, (i + 1) * k); };
console.log(`\n| que | T1 $/ano | T1 p5 | T2 $/ano | T2 p5 | T3 $/ano | T3 p5 | signo $/ano | p5 mejor que 11:00 en |`);
console.log(`|---|---|---|---|---|---|---|---|---|`);
const t11 = [0, 1, 2].map((i) => stats(tercio(fijo.get("11:00"), i)));
console.log(`| 11:00 (hoy) | ${eur(t11[0].alAno)} | ${eur(t11[0].p5)} | ${eur(t11[1].alAno)} | ${eur(t11[1].p5)} | ${eur(t11[2].alAno)} | ${eur(t11[2].p5)} | ${t11.map((r) => (r.alAno > 0 ? "+" : "-")).join("")} | — |`);
const tercios = { "11:00": t11.map((r) => ({ alAno: r.alAno, p5: r.p5, cvar5: r.cvar5, dd: r.dd })) };
for (const h of tardeHoras) {
  const ts = [0, 1, 2].map((i) => stats(tercio(fijo.get(h), i)));
  tercios[h] = ts.map((r) => ({ alAno: r.alAno, p5: r.p5, cvar5: r.cvar5, dd: r.dd }));
  const gana = ts.filter((r, i) => Math.abs(r.p5) < Math.abs(t11[i].p5)).length;
  console.log(`| ${h} | ${eur(ts[0].alAno)} | ${eur(ts[0].p5)} | ${eur(ts[1].alAno)} | ${eur(ts[1].p5)} | ${eur(ts[2].alAno)} | ${eur(ts[2].p5)} | ${ts.map((r) => (r.alAno > 0 ? "+" : "-")).join("")} | ${gana}/3 |`);
}

// ═══ F · t de la MEDIA, con el listón ════════════════════════════════════════════════════════
console.log(`\n-- F · CONTRASTE SOBRE LA MEDIA (liston de Bonferroni con ${PRUEBAS} pruebas: |t| >= ${LISTON}) ---`);
for (const h of tardeHoras) {
  const t = tWelch(fijo.get(h).map((x) => x.pl), fijo.get("11:00").map((x) => x.pl));
  console.log(`  ${h} vs 11:00 -> t=${t.toFixed(2)}  ${Math.abs(t) >= LISTON ? "PASA" : "no pasa (la media NO cambia -- que es justo lo que se buscaba)"}`);
}

writeFileSync("scripts/estructura4-hora-mecanismo.json", JSON.stringify({
  pruebas: PRUEBAS, liston: LISTON, fijo: fijoStats, bloques: bloqueStats, tercios,
  rejilla: Object.fromEntries([...rej].filter(([, v]) => v.length >= 100).map(([k, v]) => [k, stats(v)])),
  igualSigma062: compC,
}, null, 2));
console.log(`\n-> scripts/estructura4-hora-mecanismo.json`);
