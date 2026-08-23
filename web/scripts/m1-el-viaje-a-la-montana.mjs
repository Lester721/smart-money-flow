// ══════════════════════════════════════════════════════════════════════════════════════════
// M1 — EL VIAJE A LA MONTAÑA
//
// LA PREGUNTA: cuando hay una montaña de interés abierto justo encima del precio, ¿sube el
// precio hacia ella más veces de lo normal?
//
// «Montaña» NO es «el strike con más contratos de una ventana» (ese número se da la vuelta con
// siete puntos de índice). Montaña es lo que SOBRESALE de sus vecinos: prominencia = contratos
// del strike / mediana de los contratos de sus vecinos a ±30 puntos. Eso es lo que se ve en
// pantalla y es estable.
//
// AQUÍ NO SE OPERA NADA. Se mide el hecho físico: ¿llega el precio a tocar la montaña?
// Tocar = el precio del SPX de alguna barra de 5 minutos cae a ±5 puntos del strike.
//
// LOS CUATRO CONTROLES, todos emparejados día a día:
//   (a) EL ESPEJO   — una raya a la MISMA distancia al otro lado del precio, el mismo día.
//   (b) EL BARAJADO — la montaña de otro día (desplazamiento fijo de 137), traída por
//                     DISTANCIA EN % a la apertura de este día, nunca por nivel en bruto.
//   (c) LA VOLATILIDAD — todo repetido dentro de tercios de precio de la cuna al dinero.
//   (d) TAMAÑO vs PROMINENCIA — el strike con MÁS contratos de la ventana pero PLANO
//                     (prominencia < 1,5): grande en una zona grande. Si toca igual, lo que
//                     manda es el tamaño y no el pico.
//
// Y la prueba que separa a Eduardo de la casualidad: entre días con montaña ARRIBA y días con
// montaña ABAJO, ¿se inclina el precio hacia el lado de la montaña?
// ══════════════════════════════════════════════════════════════════════════════════════════

import { diasDisponibles, cargarDia, cargarDia21, picos, montanaCerca,
         rejilla, compraEn, resumen } from "./lib0dte.mjs";

// La bolsa cierra a las 13:00 y el fichero sigue trayendo barras con el SPX CONGELADO.
const MEDIA_SESION = new Set(["2022-11-25","2023-07-03","2023-11-24","2024-07-03","2024-11-29",
                              "2024-12-24","2025-07-03","2025-11-28","2025-12-24"]);
const TOL = 5;              // «tocar» = a 5 puntos o menos
const DESPL = 137;          // desplazamiento del barajado

const fmt = (x, d = 2) => (x == null || Number.isNaN(x) ? "n/d" : x.toFixed(d));
const pct = (x) => (x == null || Number.isNaN(x) ? "n/d" : (x * 100).toFixed(1) + "%");
const sg = (x, d = 1) => (x >= 0 ? "+" : "") + fmt(x, d);

// ── CARGA ─────────────────────────────────────────────────────────────────────────────────
console.log("Cargando días…");
const t0 = Date.now();
const todos = diasDisponibles();
let sinOI = 0, sinPicos = 0, sinCuna = 0, truncados = 0;
const dias = [];

for (const d of todos) {
  const day = cargarDia(d);
  if (!day || !day.oi) { sinOI++; continue; }
  const spot0 = day.barras[0].spot;
  const pk = picos(day.oi, spot0);
  if (!pk) { sinPicos++; continue; }

  let barras = day.barras;
  if (MEDIA_SESION.has(d)) { barras = barras.filter((b) => b.t <= "13:00"); truncados++; }

  // precio de la cuna al dinero en la primera barra (09:35) — el control de volatilidad
  const K0 = rejilla(spot0);
  const ca = compraEn(day.barras[0], K0, "C"), pa = compraEn(day.barras[0], K0, "P");
  const cuna = ca != null && pa != null ? ((ca + pa) / spot0) * 100 : null;
  if (cuna == null) sinCuna++;

  dias.push({
    dia: d, spot0, cuna,
    ts: barras.map((b) => b.t),
    spots: barras.map((b) => b.spot),
    picos: pk.picos.filter((p) => Math.abs(p.distPct) <= 2.5),
  });
}
console.log(`  ${dias.length} días usables de ${todos.length} · sin OI ${sinOI} · sin picos ${sinPicos} · sin cuna ${sinCuna} · media sesión recortada ${truncados}`);
console.log(`  carga: ${((Date.now() - t0) / 1000).toFixed(1)} s`);

// ── SANIDAD ───────────────────────────────────────────────────────────────────────────────
{
  const d = dias[Math.floor(dias.length / 2)];
  console.log(`\nSANIDAD · ${d.dia}: ${d.spots.length} barras ${d.ts[0]}→${d.ts.at(-1)} · spot ${fmt(d.spot0)} · cuna ${fmt(d.cuna)}% · picos ±2,5% ${d.picos.length}`);
  for (const p of [...d.picos].sort((a, b) => b.prominencia - a.prominencia).slice(0, 3))
    console.log(`   K=${p.K} total=${p.total} prom=${fmt(p.prominencia)} dist=${fmt(p.distPct)}%`);
  console.log(`   rango del SPX en la muestra: ${fmt(Math.min(...dias.map((x) => x.spot0)))} → ${fmt(Math.max(...dias.map((x) => x.spot0)))}`);
  const cunas = dias.map((x) => x.cuna).filter((x) => x != null).sort((a, b) => a - b);
  console.log(`   cuna ATM 09:35 (% del índice): mín ${fmt(cunas[0])} · mediana ${fmt(cunas[Math.floor(cunas.length / 2)])} · máx ${fmt(cunas.at(-1))}`);
  console.log(`   longitudes de sesión distintas: ${[...new Set(dias.map((x) => x.spots.length))].sort((a, b) => a - b).join(", ")}`);
  const proms = dias.flatMap((x) => x.picos.map((p) => p.prominencia)).sort((a, b) => a - b);
  console.log(`   prominencia de todos los picos ±2,5%: mediana ${fmt(proms[Math.floor(proms.length / 2)])} · p90 ${fmt(proms[Math.floor(proms.length * 0.9)])} · máx ${fmt(proms.at(-1))}`);
}

// ── HERRAMIENTAS ──────────────────────────────────────────────────────────────────────────
/** Primer índice de barra (desde la 1) en que el precio pisa K a ±TOL. -1 si nunca. */
function tocaEn(spots, K) {
  for (let i = 1; i < spots.length; i++) if (Math.abs(spots[i] - K) <= TOL) return i;
  return -1;
}
function distMin(spots, K) {
  let m = Infinity;
  for (let i = 1; i < spots.length; i++) m = Math.min(m, Math.abs(spots[i] - K));
  return m;
}
const elegible = (spot0, K) => Math.abs(K - spot0) > TOL;

// ── EL BARRIDO: 5 prominencias × 5 distancias ─────────────────────────────────────────────
const PROMS = [1.5, 2, 2.5, 3, 4];
const DISTS = [0.3, 0.5, 0.8, 1.2, 2.0];

function corrida(minProm, maxDist, subconj = dias) {
  const filas = [];
  for (const d of subconj) {
    const m = montanaCerca({ picos: d.picos }, d.spot0, minProm, maxDist);
    if (!m.arriba) continue;
    const K = m.arriba.K;
    if (!elegible(d.spot0, K)) continue;
    const dist = K - d.spot0;                       // puntos, positivo
    const Kesp = d.spot0 - dist;                    // el espejo, misma distancia abajo
    filas.push({
      d, K, dist, prom: m.arriba.prominencia, distPct: m.arriba.distPct, abajo: m.abajo,
      tReal: tocaEn(d.spots, K), tEsp: tocaEn(d.spots, Kesp),
      dReal: distMin(d.spots, K), dEsp: distMin(d.spots, Kesp),
      spotFin: d.spots.at(-1),
    });
  }
  return filas;
}

console.log("\n══ BARRIDO · ¿toca el precio la montaña de arriba? (real vs espejo) ══");
console.log("prom  dist%     n    toca  espejo    dif      t   distMin real/espejo (pts)");
const grid = [];
for (const p of PROMS) for (const q of DISTS) {
  const f = corrida(p, q);
  if (f.length < 30) { console.log(`${fmt(p,1)}   ${fmt(q,1)}   ${String(f.length).padStart(4)}   — muestra corta —`); continue; }
  const real = f.map((x) => (x.tReal >= 0 ? 1 : 0));
  const esp = f.map((x) => (x.tEsp >= 0 ? 1 : 0));
  const r = resumen(f.map((x, k) => real[k] - esp[k]));
  const mR = real.reduce((a, b) => a + b, 0) / f.length;
  const mE = esp.reduce((a, b) => a + b, 0) / f.length;
  const dmR = f.reduce((a, x) => a + x.dReal, 0) / f.length;
  const dmE = f.reduce((a, x) => a + x.dEsp, 0) / f.length;
  grid.push({ p, q, n: f.length, mR, mE, dif: r.media, t: r.t, dmR, dmE, filas: f });
  console.log(`${fmt(p,1)}   ${fmt(q,1)}   ${String(f.length).padStart(4)}  ${pct(mR).padStart(6)}  ${pct(mE).padStart(6)}  ${sg(r.media*100).padStart(6)}  ${sg(r.t,2).padStart(6)}   ${fmt(dmR,1)} / ${fmt(dmE,1)}`);
}

// la mejor casilla por |t| del emparejado real−espejo
const mejor = [...grid].sort((a, b) => Math.abs(b.t) - Math.abs(a.t))[0];
console.log(`\nMEJOR casilla por |t|: prominencia ≥ ${mejor.p} · distancia ≤ ${mejor.q}% · n=${mejor.n} · toca ${pct(mejor.mR)} vs espejo ${pct(mejor.mE)} · t=${fmt(mejor.t,2)}`);
console.log(`OJO: son 25 casillas probadas y no independientes. El mayor |t| de 25 tiradas al azar ronda 2,3.`);

// ══ CONTROL (b) EL BARAJADO ═══════════════════════════════════════════════════════════════
function barajado(minProm, maxDist) {
  const out = [];
  for (let i = 0; i < dias.length; i++) {
    const d = dias[i];
    const propio = montanaCerca({ picos: d.picos }, d.spot0, minProm, maxDist);
    if (!propio.arriba || !elegible(d.spot0, propio.arriba.K)) continue;
    // el día donante: se avanza desde i+DESPL hasta encontrar uno que TENGA montaña arriba.
    // (emparejar sólo con i+DESPL exacto dejaba n=42 de 197 y el control no decidía nada)
    let otra = null;
    for (let k = 0; k < dias.length; k++) {
      const o = dias[(i + DESPL + k) % dias.length];
      if (o === d) continue;
      const m = montanaCerca({ picos: o.picos }, o.spot0, minProm, maxDist);
      if (m.arriba) { otra = m; break; }
    }
    if (!otra) continue;
    const Kb = d.spot0 * (1 + otra.arriba.distPct / 100);   // por DISTANCIA %, no por nivel
    if (!elegible(d.spot0, Kb)) continue;
    out.push({ real: tocaEn(d.spots, propio.arriba.K) >= 0 ? 1 : 0,
               baraj: tocaEn(d.spots, Kb) >= 0 ? 1 : 0,
               dReal: distMin(d.spots, propio.arriba.K), dBaraj: distMin(d.spots, Kb),
               distReal: propio.arriba.K - d.spot0, distBaraj: Kb - d.spot0 });
  }
  return out;
}
const CB = (() => {
  const b = barajado(mejor.p, mejor.q);
  const r = resumen(b.map((x) => x.real - x.baraj));
  const mR = b.reduce((a, x) => a + x.real, 0) / b.length;
  const mB = b.reduce((a, x) => a + x.baraj, 0) / b.length;
  console.log(`\n══ CONTROL (b) BARAJADO (desplazamiento ${DESPL}, traído por distancia %) ══`);
  console.log(`  n=${b.length} · toca la SUYA ${pct(mR)} · toca la BARAJADA ${pct(mB)} · dif ${sg(r.media*100)} pts · t=${fmt(r.t,2)}`);
  console.log(`  distancia mínima media: suya ${fmt(b.reduce((a,x)=>a+x.dReal,0)/b.length,1)} pts · barajada ${fmt(b.reduce((a,x)=>a+x.dBaraj,0)/b.length,1)} pts`);
  console.log(`  SANIDAD del emparejamiento — distancia media a la raya: real ${fmt(b.reduce((a,x)=>a+x.distReal,0)/b.length,1)} pts · barajada ${fmt(b.reduce((a,x)=>a+x.distBaraj,0)/b.length,1)} pts`);
  return { n: b.length, mR, mB, t: r.t, dif: r.media };
})();

// ══ CONTROL (c) LA VOLATILIDAD ════════════════════════════════════════════════════════════
const CV = (() => {
  const ord = mejor.filas.filter((x) => x.d.cuna != null).sort((a, b) => a.d.cuna - b.d.cuna);
  const c = Math.floor(ord.length / 3);
  const tercios = [ord.slice(0, c), ord.slice(c, 2 * c), ord.slice(2 * c)];
  console.log(`\n══ CONTROL (c) DENTRO DE TERCIOS DE VOLATILIDAD (cuna ATM 09:35) ══`);
  const lineas = [];
  for (let k = 0; k < 3; k++) {
    const g = tercios[k];
    const real = g.map((x) => (x.tReal >= 0 ? 1 : 0));
    const esp = g.map((x) => (x.tEsp >= 0 ? 1 : 0));
    const r = resumen(g.map((x, i) => real[i] - esp[i]));
    const mR = real.reduce((a, b) => a + b, 0) / g.length, mE = esp.reduce((a, b) => a + b, 0) / g.length;
    const cu = g.map((x) => x.d.cuna);
    console.log(`  tercio ${k + 1} (cuna ${fmt(Math.min(...cu))}–${fmt(Math.max(...cu))}%): n=${g.length} · toca ${pct(mR)} vs espejo ${pct(mE)} · dif ${sg(r.media*100)} · t=${fmt(r.t,2)}`);
    lineas.push({ n: g.length, mR, mE, dif: r.media, t: r.t });
  }
  return lineas;
})();

// ══ CONTROL (d) PROMINENCIA vs TAMAÑO BRUTO ═══════════════════════════════════════════════
const CT = (() => {
  const out = [];
  for (const x of mejor.filas) {
    const d = x.d;
    // el strike más GORDO por encima, dentro de la misma ventana, pero PLANO
    const cand = d.picos.filter((p) => p.K > d.spot0 && p.distPct <= mejor.q && p.prominencia < 1.5);
    if (!cand.length) continue;
    const gordo = [...cand].sort((a, b) => b.total - a.total)[0];
    if (!elegible(d.spot0, gordo.K)) continue;
    out.push({ prom: x.tReal >= 0 ? 1 : 0, gordo: tocaEn(d.spots, gordo.K) >= 0 ? 1 : 0,
               oiProm: d.picos.find((p) => p.K === x.K)?.total ?? 0, oiGordo: gordo.total,
               dProm: x.dReal, dGordo: distMin(d.spots, gordo.K),
               distProm: x.K - d.spot0, distGordo: gordo.K - d.spot0 });
  }
  const r = resumen(out.map((x) => x.prom - x.gordo));
  const mP = out.reduce((a, x) => a + x.prom, 0) / out.length;
  const mG = out.reduce((a, x) => a + x.gordo, 0) / out.length;
  console.log(`\n══ CONTROL (d) MONTAÑA (prominente) vs GORDO-PERO-PLANO (prominencia<1,5) ══`);
  console.log(`  n=${out.length} días con los dos · toca la montaña ${pct(mP)} · toca el gordo plano ${pct(mG)} · dif ${sg(r.media*100)} · t=${fmt(r.t,2)}`);
  console.log(`  contratos medios: montaña ${fmt(out.reduce((a,x)=>a+x.oiProm,0)/out.length,0)} · gordo plano ${fmt(out.reduce((a,x)=>a+x.oiGordo,0)/out.length,0)}`);
  console.log(`  distancia media a la raya: montaña ${fmt(out.reduce((a,x)=>a+x.distProm,0)/out.length,1)} pts · gordo plano ${fmt(out.reduce((a,x)=>a+x.distGordo,0)/out.length,1)} pts`);
  console.log(`  distancia mínima alcanzada: montaña ${fmt(out.reduce((a,x)=>a+x.dProm,0)/out.length,1)} pts · gordo plano ${fmt(out.reduce((a,x)=>a+x.dGordo,0)/out.length,1)} pts`);
  // AUDITORÍA del empate exacto: la tabla 2×2, para descartar que las dos rayas sean la misma
  const t11 = out.filter((x) => x.prom && x.gordo).length, t10 = out.filter((x) => x.prom && !x.gordo).length;
  const t01 = out.filter((x) => !x.prom && x.gordo).length, t00 = out.filter((x) => !x.prom && !x.gordo).length;
  const mismos = out.filter((x) => x.distProm === x.distGordo).length;
  console.log(`  tabla 2×2 — las dos ${t11} · sólo montaña ${t10} · sólo gordo ${t01} · ninguna ${t00} (suman ${t11+t10+t01+t00})`);
  console.log(`  días en que la montaña y el gordo plano son el MISMO strike: ${mismos} (tienen que ser 0)`);
  return { n: out.length, mP, mG, t: r.t, dif: r.media, t11, t10, t01, t00, mismos };
})();

// ══ ESCALERA · ¿toca más cuanto más sobresale la montaña? ═════════════════════════════════
{
  console.log(`\n══ ESCALERA de PROMINENCIA (dist ≤ ${mejor.q}%, todas las montañas con prom ≥ 1) ══`);
  const todasF = corrida(1.0, mejor.q);
  const ord = [...todasF].sort((a, b) => a.prom - b.prom);
  const c = Math.floor(ord.length / 5);
  for (let k = 0; k < 5; k++) {
    const g = ord.slice(k * c, k === 4 ? ord.length : (k + 1) * c);
    const mR = g.filter((x) => x.tReal >= 0).length / g.length;
    const mE = g.filter((x) => x.tEsp >= 0).length / g.length;
    const r = resumen(g.map((x) => (x.tReal >= 0 ? 1 : 0) - (x.tEsp >= 0 ? 1 : 0)));
    console.log(`  quintil ${k + 1} (prom ${fmt(g[0].prom)}–${fmt(g.at(-1).prom)}): n=${g.length} · toca ${pct(mR)} vs espejo ${pct(mE)} · dif ${sg(r.media*100)} · t=${fmt(r.t,2)}`);
  }
}

// ══ ¿SE PARA EN LA MONTAÑA? (el 21 se quedó a 5 puntos) ═══════════════════════════════════
{
  const f = mejor.filas;
  const pasaR = f.filter((x) => Math.max(...x.d.spots.slice(1)) > x.K + 10).length;
  const llegaR = f.filter((x) => Math.max(...x.d.spots.slice(1)) > x.K - 10).length;
  const pasaE = f.filter((x) => Math.min(...x.d.spots.slice(1)) < x.d.spot0 - x.dist - 10).length;
  const llegaE = f.filter((x) => Math.min(...x.d.spots.slice(1)) < x.d.spot0 - x.dist + 10).length;
  console.log(`\n══ ¿SE PARA EN LA RAYA? (llegar = a 10 pts o menos; pasar = 10 pts más allá) ══`);
  console.log(`  montaña: llega ${llegaR}/${f.length} (${pct(llegaR/f.length)}) · de los que llegan, la PASAN ${pct(pasaR/llegaR)}`);
  console.log(`  espejo : llega ${llegaE}/${f.length} (${pct(llegaE/f.length)}) · de los que llegan, la PASAN ${pct(pasaE/llegaE)}`);
}

// ══ ¿A QUÉ HORA LA TOCA, Y DESPUÉS SE QUEDA O SE VA? ══════════════════════════════════════
const CH = (() => {
  const tocados = mejor.filas.filter((x) => x.tReal >= 0);
  const cuenta = new Map();
  for (const x of tocados) { const h = x.d.ts[x.tReal].slice(0, 2); cuenta.set(h, (cuenta.get(h) ?? 0) + 1); }
  const arriba = tocados.filter((x) => x.spotFin > x.K + TOL).length;
  const dentro = tocados.filter((x) => Math.abs(x.spotFin - x.K) <= TOL).length;
  const abajo = tocados.filter((x) => x.spotFin < x.K - TOL).length;
  console.log(`\n══ CUÁNDO LA TOCA (${tocados.length} días de ${mejor.n}) ══`);
  console.log("  " + [...cuenta.entries()].sort().map(([h, n]) => `${h}h:${n}`).join("  "));
  const horas = tocados.map((x) => x.d.ts[x.tReal]).sort();
  console.log(`  hora mediana del primer toque: ${horas[Math.floor(horas.length / 2)]}`);
  console.log(`  al cierre: la ATRAVIESA ${pct(arriba/tocados.length)} · se QUEDA pegada ${pct(dentro/tocados.length)} · VUELVE abajo ${pct(abajo/tocados.length)}`);
  return { hora: horas[Math.floor(horas.length / 2)], arriba: arriba/tocados.length, dentro: dentro/tocados.length, abajo: abajo/tocados.length };
})();

// ══ LA PRUEBA DE LA DIRECCIÓN ═════════════════════════════════════════════════════════════
console.log(`\n══ ¿INCLINA LA MONTAÑA LA DIRECCIÓN DEL DÍA? (prom ≥ ${mejor.p}, dist ≤ ${mejor.q}%) ══`);
const CD = (() => {
  const soloArriba = [], soloAbajo = [], ambas = [], ninguna = [];
  for (const d of dias) {
    const m = montanaCerca({ picos: d.picos }, d.spot0, mejor.p, mejor.q);
    const a = m.arriba && elegible(d.spot0, m.arriba.K);
    const b = m.abajo && elegible(d.spot0, m.abajo.K);
    const ret = ((d.spots.at(-1) - d.spot0) / d.spot0) * 100;
    if (a && !b) soloArriba.push(ret); else if (b && !a) soloAbajo.push(ret);
    else if (a && b) ambas.push(ret); else ninguna.push(ret);
  }
  const rA = resumen(soloArriba), rB = resumen(soloAbajo), rAm = resumen(ambas), rN = resumen(ninguna);
  const li = (nom, r) => console.log(`  ${nom.padEnd(19)} n=${String(r.n).padStart(4)} · retorno medio del día ${sg(r.media,3)}% · sube ${pct(r.aciertos)} de las veces · t=${fmt(r.t,2)}`);
  li("sólo montaña ARRIBA", rA); li("sólo montaña ABAJO", rB); li("las dos", rAm); li("ninguna", rN);
  const tDif = (rA.media - rB.media) / Math.sqrt(rA.sd ** 2 / rA.n + rB.sd ** 2 / rB.n);
  console.log(`  ARRIBA − ABAJO: ${sg(rA.media - rB.media, 3)} puntos porcentuales · t=${fmt(tDif, 2)}`);
  return { nA: rA.n, mA: rA.media, upA: rA.aciertos, nB: rB.n, mB: rB.media, upB: rB.aciertos, tDif };
})();

// ══ EL TIEMPO: construir con <2025, comprobar en 2025-2026 ════════════════════════════════
console.log(`\n══ FUERA DE MUESTRA ══`);
const FM = (() => {
  const dentro = dias.filter((d) => d.dia < "2025-01-01");
  const fuera = dias.filter((d) => d.dia >= "2025-01-01");
  let best = null;
  for (const p of PROMS) for (const q of DISTS) {
    const f = corrida(p, q, dentro);
    if (f.length < 30) continue;
    const r = resumen(f.map((x) => (x.tReal >= 0 ? 1 : 0) - (x.tEsp >= 0 ? 1 : 0)));
    if (!best || r.t > best.t) best = { p, q, n: f.length, t: r.t, dif: r.media,
      mR: f.filter((x) => x.tReal >= 0).length / f.length, mE: f.filter((x) => x.tEsp >= 0).length / f.length };
  }
  console.log(`  ELEGIDA con 2022-2024: prom ≥ ${best.p} · dist ≤ ${best.q}% · n=${best.n} · toca ${pct(best.mR)} vs espejo ${pct(best.mE)} · dif ${sg(best.dif*100)} · t=${fmt(best.t,2)}`);
  const f2 = corrida(best.p, best.q, fuera);
  const r2 = resumen(f2.map((x) => (x.tReal >= 0 ? 1 : 0) - (x.tEsp >= 0 ? 1 : 0)));
  const mR2 = f2.filter((x) => x.tReal >= 0).length / f2.length, mE2 = f2.filter((x) => x.tEsp >= 0).length / f2.length;
  console.log(`  APLICADA a 2025-2026:  n=${f2.length} · toca ${pct(mR2)} vs espejo ${pct(mE2)} · dif ${sg(r2.media*100)} · t=${fmt(r2.t,2)}`);
  return { p: best.p, q: best.q, nIn: best.n, difIn: best.dif, tIn: best.t, nOut: f2.length, mR2, mE2, difOut: r2.media, tOut: r2.t };
})();

// ══ AÑO A AÑO y MITADES/TERCIOS de la mejor casilla ═══════════════════════════════════════
console.log(`\n══ AÑO A AÑO (prom ≥ ${mejor.p}, dist ≤ ${mejor.q}%) ══`);
for (const a of ["2022", "2023", "2024", "2025", "2026"]) {
  const f = mejor.filas.filter((x) => x.d.dia.startsWith(a));
  if (f.length < 10) { console.log(`  ${a}: n=${f.length} — muestra corta`); continue; }
  const r = resumen(f.map((x) => (x.tReal >= 0 ? 1 : 0) - (x.tEsp >= 0 ? 1 : 0)));
  console.log(`  ${a}: n=${String(f.length).padStart(3)} · toca ${pct(f.filter((x)=>x.tReal>=0).length/f.length)} vs espejo ${pct(f.filter((x)=>x.tEsp>=0).length/f.length)} · dif ${sg(r.media*100)} · t=${fmt(r.t,2)}`);
}
const TER = (() => {
  const f = mejor.filas, c = Math.floor(f.length / 3);
  const partes = [f.slice(0, c), f.slice(c, 2 * c), f.slice(2 * c)];
  const out = partes.map((g) => resumen(g.map((x) => (x.tReal >= 0 ? 1 : 0) - (x.tEsp >= 0 ? 1 : 0))));
  console.log(`  TERCIOS del tiempo: ` + out.map((r, i) => `T${i+1} dif ${sg(r.media*100)} (t ${fmt(r.t,2)}, n ${r.n})`).join(" · "));
  const h = Math.floor(f.length / 2);
  const m1 = resumen(f.slice(0, h).map((x) => (x.tReal >= 0 ? 1 : 0)));
  const m2 = resumen(f.slice(h).map((x) => (x.tReal >= 0 ? 1 : 0)));
  console.log(`  MITADES (tasa de toque): 1ª ${pct(m1.media)} (n ${m1.n}) · 2ª ${pct(m2.media)} (n ${m2.n})`);
  return { t1: out[0].media, t2: out[1].media, t3: out[2].media, m1: m1.media, m2: m2.media };
})();

// ══ CUÁNTO SE ACERCA — la distribución completa ═══════════════════════════════════════════
{
  const dR = mejor.filas.map((x) => x.dReal).sort((a, b) => a - b);
  const dE = mejor.filas.map((x) => x.dEsp).sort((a, b) => a - b);
  const q = (v, p) => v[Math.floor(v.length * p)];
  console.log(`\n══ CUÁNTO SE ACERCA (puntos de índice) ══`);
  console.log(`  montaña: p25 ${fmt(q(dR,.25),1)} · mediana ${fmt(q(dR,.5),1)} · p75 ${fmt(q(dR,.75),1)}`);
  console.log(`  espejo : p25 ${fmt(q(dE,.25),1)} · mediana ${fmt(q(dE,.5),1)} · p75 ${fmt(q(dE,.75),1)}`);
  const rD = resumen(mejor.filas.map((x) => x.dEsp - x.dReal));
  console.log(`  espejo − montaña (positivo = se acerca MÁS a la montaña): ${sg(rD.media,2)} pts · t=${fmt(rD.t,2)}`);
}

// ══ EL 21 DE AGOSTO, CON LA MISMA REGLA ═══════════════════════════════════════════════════
{
  const d21 = cargarDia21();
  if (d21) {
    const s0 = d21.barras[0].spot;
    const pk = picos(d21.oi, s0);
    const spots = d21.barras.map((b) => b.spot);
    console.log(`\n══ EL 21 DE AGOSTO CON ESTA MISMA REGLA ══`);
    console.log(`  apertura ${fmt(s0)} · máximo del día ${fmt(Math.max(...spots))} · cierre ${fmt(spots.at(-1))}`);
    for (const [p, q] of [[mejor.p, mejor.q], [2, 1.5]]) {
      const m = montanaCerca(pk, s0, p, q);
      const linea = m.arriba ? `K=${m.arriba.K} (${sg(m.arriba.distPct,2)}%, prom ${fmt(m.arriba.prominencia)})` : "—";
      let extra = "";
      if (m.arriba) {
        const i = tocaEn(spots, m.arriba.K);
        extra = ` · ¿toca? ${i >= 0 ? "sí a las " + d21.barras[i].t : "NO"} · se acercó a ${fmt(distMin(spots, m.arriba.K),1)} pts`;
      }
      console.log(`  prom≥${p} dist≤${q}%: arriba ${linea}${extra}`);
    }
  } else console.log("\n  (el día 21 no está en caché)");
}

console.log(`\nTotal: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(`\n#JSON ${JSON.stringify({ mejor: { p: mejor.p, q: mejor.q, n: mejor.n, mR: mejor.mR, mE: mejor.mE, dif: mejor.dif, t: mejor.t }, CB, CV, CT, CH, CD, FM, TER })}`);
