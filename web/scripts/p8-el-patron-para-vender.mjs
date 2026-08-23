// ══════════════════════════════════════════════════════════════════════════════════════════
// «EL MISMO PATRÓN, PERO PARA VENDER» — ¿la FORMA de la cadena dice cuándo NO vender?
// ══════════════════════════════════════════════════════════════════════════════════════════
//
// QUÉ MIDE, en palabras llanas
// ----------------------------
// Lester ya vende un cóndor de hierro ±45 alas 50 a las 11:00 sobre SPXW que vence ese día.
// La pregunta no es sólo si el GEX dice cuándo COMPRAR (eso ya se midió y no dice nada), sino
// si dice cuándo NO VENDER. Un filtro que diga «hoy la máquina se queda apagada» vale tanto
// dinero como uno que diga «hoy sí», y es más fácil de adoptar porque sólo apaga algunos días.
//
// CÓMO
// ----
// Para cada uno de los 1.123 días se calcula la huella del GEX del arranque (perfilGex) y se
// coge un puñado de estadísticos de esa huella: dónde está el imán, dónde el punto de giro,
// cómo de ancho es el pasillo entre muros, cuánto se carga de calls o de puts pegado al dinero,
// y cuánto se concentra el interés abierto. Con cada estadístico se parten los días en CINCO
// montones del mismo tamaño y en cada montón se mide el cóndor: dólares por operación, dólares
// al año, mediana, peor día, días tocados, pérdidas totales y año a año.
//
// LOS TRES CONTROLES QUE DECIDEN
// ------------------------------
// Con 1.119 días y 14 estadísticos × 5 montones, SIEMPRE saldrá un montón que parece peor. Por
// eso cada escalera se compara contra tres particiones de control del MISMO tamaño:
//   (a) AZAR — 400 particiones deterministas (un índice desplazado por un multiplicador primo;
//       los scripts de este proyecto no pueden usar Math.random). De ahí sale el listón: cuánta
//       separación entre montones produce el puro azar. Si la del estadístico no lo supera,
//       no hay patrón.
//   (b) TAMAÑO — montones por totalContratos (el tamaño de la cadena, no su forma).
//   (c) VOLATILIDAD — montones por la cuña al dinero de las 09:35 (call ATM al ask + put ATM
//       al ask, dividido por el nivel del índice). Es lo que el mercado PAGA por el movimiento
//       del día, dicho por precios reales y sin ningún modelo.
// Y el control TEMPORAL: los cortes de los montones se calculan SÓLO con días anteriores a
// 2025-01-01 y se aplican tal cual a 2025-2026.
//
// REGLAS DE LA CASA QUE SE CUMPLEN AQUÍ
// -------------------------------------
//   · Precios REALES: peaje de las cuatro patas y dos veces (lo hace estructura()).
//   · Sólo el pasado: el OI es el del arranque del día y el spot es el de las 11:00.
//   · Un hueco no es un cero: estructura() devuelve null, se descarta y se cuenta aparte.
//   · Nada de modelos de precios. Ni Black-Scholes ni griegas.
//   · Calendario REAL: 244 días de mercado al año. Los años salen de contar los días.
//   · La media no basta: mediana, peor día, año a año y qué pasa al quitar los 5 mejores.
// ══════════════════════════════════════════════════════════════════════════════════════════

import {
  diasDisponibles, cargarDia, cargarDia21, estructura, condor, perfilGex,
  idxHora, hayHora, rejilla,
} from "./lib0dte.mjs";

const ANCHO = 45;        // vende a ±45
const ALA   = 50;        // compra 50 puntos más lejos
const HORA  = "11:00";
const DIAS_ANO = 244;    // calendario real de mercado

// ─── estadística básica, sin librerías ─────────────────────────────────────────────────────
const suma    = (v) => v.reduce((a, b) => a + b, 0);
const media   = (v) => (v.length ? suma(v) / v.length : NaN);
const mediana = (v) => {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const desv = (v) => {
  if (v.length < 2) return NaN;
  const m = media(v);
  return Math.sqrt(suma(v.map((x) => (x - m) ** 2)) / (v.length - 1));
};
const tDe = (v) => { const s = desv(v); return s ? (media(v) * Math.sqrt(v.length)) / s : NaN; };
/** t de dos muestras independientes (Welch), para comparar un montón contra el resto */
function tDos(a, b) {
  if (a.length < 2 || b.length < 2) return NaN;
  const va = desv(a) ** 2 / a.length, vb = desv(b) ** 2 / b.length;
  const den = Math.sqrt(va + vb);
  return den ? (media(a) - media(b)) / den : NaN;
}
const correl = (x, y) => {
  const n = x.length; if (n < 3) return NaN;
  const mx = media(x), my = media(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
};
const f0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString("es-ES") : "—");
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : "—");
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : "—");
const pct = (x) => (Number.isFinite(x) ? (x * 100).toFixed(1) + "%" : "—");

// ══════════════════════════════════════════════════════════════════════════════════════════
// PASADA ÚNICA — cada día se carga, se exprime y se tira; sólo queda una fila compacta.
// ══════════════════════════════════════════════════════════════════════════════════════════
const dias = diasDisponibles();
console.log(`Días con cadena 0DTE: ${dias.length}  (${dias[0]} → ${dias[dias.length - 1]})`);

const filas = [];
let malBarras = 0, sinOI = 0, sinPerfil = 0, huecoCondor = 0, sinHora = 0, sinCuna = 0;
const t0 = Date.now();

for (const d of dias) {
  const dia = cargarDia(d);
  if (!dia) { malBarras++; continue; }
  const B = dia.barras;
  if (B.length !== 78 || B[0].t !== "09:35" || B[77].t !== "16:00") { malBarras++; continue; }
  if (!dia.oi) { sinOI++; continue; }

  const spot0 = B[0].spot;
  const p = perfilGex(dia.oi, spot0);
  if (!p) { sinPerfil++; continue; }

  // la cuña al dinero de las 09:35 — el termómetro de volatilidad SIN modelos
  const Katm = rejilla(spot0);
  const cA = B[0].o.get(Katm + "C")?.[1] ?? null;
  const pA = B[0].o.get(Katm + "P")?.[1] ?? null;
  const cunaPct = (cA > 0 && pA > 0) ? ((cA + pA) / spot0) * 100 : null;
  if (cunaPct == null) sinCuna++;

  if (hayHora(dia, HORA) < 0) { sinHora++; continue; }
  const i = idxHora(dia, HORA);
  const S = B[i].spot;
  const centro = rejilla(S);
  const r = estructura(dia, i, "vencimiento", condor(centro, ANCHO, ALA));
  if (!r) { huecoCondor++; continue; }

  const cierreHoy = B[77].spot;
  let tocadoIntra = false;
  for (let j = i; j < 78; j++) if (Math.abs(B[j].spot - centro) > ANCHO) { tocadoIntra = true; break; }
  const tocadoCierre = Math.abs(cierreHoy - centro) > ANCHO;
  const perdidaTotal = r.dolares <= -r.riesgoMax + 0.5;

  filas.push({
    dia: d, ano: +d.slice(0, 4), spot0, spot11: S, centro, cierre: cierreHoy,
    dolares: r.dolares, creditoUSD: r.credito * 100, riesgoMax: r.riesgoMax,
    tocadoIntra, tocadoCierre, perdidaTotal,
    cunaPct,
    // los estadísticos de la HUELLA
    imanPct: p.imanPct, absIman: p.imanPct == null ? null : Math.abs(p.imanPct),
    giroPct: p.giroPct, absGiro: p.giroPct == null ? null : Math.abs(p.giroPct),
    muroCallCercaPct: p.muroCallCercaPct, muroPutCercaPct: p.muroPutCercaPct,
    pasilloCercaPct: p.pasilloCercaPct,
    muroCallPct: p.muroCallPct, muroPutPct: p.muroPutPct, pasilloPct: p.pasilloPct,
    desbalance05: p.desbalance05, desbalance1: p.desbalance1, desbalance2: p.desbalance2,
    concentracion: p.concentracion, ratioCallPut: p.ratioCallPut,
    totalContratos: p.totalContratos,
    silueta: p.silueta,
  });
}

console.log(`Pasada completa en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
console.log(`Días usados: ${filas.length}`);
console.log(`Descartados → barras raras: ${malBarras} · sin OI: ${sinOI} · perfil nulo: ${sinPerfil} · ` +
            `sin barra 11:00: ${sinHora} · hueco en las 4 patas: ${huecoCondor} · sin cuña ATM: ${sinCuna}`);

const ANOS = filas.length / DIAS_ANO;
console.log(`Años reales de muestra: ${f2(ANOS)}  (${filas.length} días / ${DIAS_ANO})`);

// ══════════════════════════════════════════════════════════════════════════════════════════
// SANIDAD — antes de dar nada por bueno
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n═══ SANIDAD ═══");
{
  const c = filas.map((f) => f.creditoUSD).sort((a, b) => a - b);
  const q = (p) => c[Math.min(c.length - 1, Math.floor(p * c.length))];
  console.log(`Crédito del cóndor ±45/50 a las 11:00 (USD): min $${f0(c[0])} · p10 $${f0(q(0.10))} · ` +
              `mediana $${f0(q(0.50))} · p90 $${f0(q(0.90))} · max $${f0(c[c.length - 1])}`);
  const rk = filas.map((f) => f.riesgoMax).sort((a, b) => a - b);
  console.log(`Riesgo máximo (USD):  min $${f0(rk[0])} · mediana $${f0(rk[rk.length >> 1])} · max $${f0(rk[rk.length - 1])}`);
  const cu = filas.map((f) => f.cunaPct).filter((x) => x != null).sort((a, b) => a - b);
  console.log(`Cuña ATM 09:35 (% del nivel): n=${cu.length} · min ${f3(cu[0])} · mediana ${f3(cu[cu.length >> 1])} · max ${f3(cu[cu.length - 1])}`);
  const tc = filas.map((f) => f.totalContratos).sort((a, b) => a - b);
  console.log(`Contratos de OI del día: min ${f0(tc[0])} · mediana ${f0(tc[tc.length >> 1])} · max ${f0(tc[tc.length - 1])}`);
  const nulos = {};
  for (const k of ["imanPct", "giroPct", "muroCallCercaPct", "muroPutCercaPct", "pasilloCercaPct", "ratioCallPut"])
    nulos[k] = filas.filter((f) => f[k] == null).length;
  console.log(`Estadísticos nulos por día: ${JSON.stringify(nulos)}`);
  const tot = suma(filas.map((f) => f.dolares));
  console.log(`CÓNDOR SIN FILTRO: n=${filas.length} · $${f2(tot / filas.length)}/op · $${f0(tot / ANOS)}/año · ` +
              `mediana $${f0(mediana(filas.map((f) => f.dolares)))} · peor día $${f0(Math.min(...filas.map((f) => f.dolares)))}`);
  console.log(`   tocados intradía ${pct(filas.filter((f) => f.tocadoIntra).length / filas.length)} · ` +
              `tocados al cierre ${pct(filas.filter((f) => f.tocadoCierre).length / filas.length)} · ` +
              `pérdida total ${pct(filas.filter((f) => f.perdidaTotal).length / filas.length)}`);
  const orden = [...filas].sort((a, b) => b.dolares - a.dolares);
  const sin5 = suma(orden.slice(5).map((f) => f.dolares));
  console.log(`   quitando los 5 MEJORES días: $${f0(sin5 / ANOS)}/año  (los 5 mejores suman $${f0(tot - sin5)})`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// ESCALERA DE CINCO MONTONES
// ══════════════════════════════════════════════════════════════════════════════════════════
/** parte una lista de filas en 5 montones del mismo tamaño según la clave `k` */
function quintiles(fs, k) {
  const v = fs.filter((f) => f[k] != null && Number.isFinite(f[k]));
  const s = [...v].sort((a, b) => a[k] - b[k]);
  const n = s.length, out = [];
  for (let q = 0; q < 5; q++) out.push(s.slice(Math.floor((q * n) / 5), Math.floor(((q + 1) * n) / 5)));
  return { montones: out, usados: n, perdidos: fs.length - n };
}

function resumenMonton(ops, anosMuestra) {
  const v = ops.map((o) => o.dolares);
  const porAno = {};
  for (const o of ops) (porAno[o.ano] ??= []).push(o.dolares);
  return {
    n: ops.length,
    porOp: media(v),
    porAno: suma(v) / anosMuestra,
    total: suma(v),
    mediana: mediana(v),
    peor: Math.min(...v),
    t: tDe(v),
    tocIntra: ops.filter((o) => o.tocadoIntra).length / ops.length,
    tocCierre: ops.filter((o) => o.tocadoCierre).length / ops.length,
    perdTotal: ops.filter((o) => o.perdidaTotal).length / ops.length,
    credito: media(ops.map((o) => o.creditoUSD)),
    anos: Object.fromEntries(Object.keys(porAno).sort().map((a) => [a, Math.round(suma(porAno[a]))])),
  };
}

const ESTADISTICOS = [
  ["imanPct",          "distancia con signo al IMÁN (strike de más OI a ±2%)"],
  ["absIman",          "distancia ABSOLUTA al imán"],
  ["giroPct",          "distancia con signo al PUNTO DE GIRO de gamma"],
  ["absGiro",          "distancia ABSOLUTA al punto de giro"],
  ["muroCallCercaPct", "distancia al MURO DE CALLS cercano (+2%)"],
  ["muroPutCercaPct",  "distancia al MURO DE PUTS cercano (−2%)"],
  ["pasilloCercaPct",  "ANCHO DEL PASILLO entre muros cercanos"],
  ["muroCallPct",      "muro de calls GLOBAL"],
  ["muroPutPct",       "muro de puts GLOBAL"],
  ["pasilloPct",       "pasillo GLOBAL"],
  ["desbalance05",     "DESBALANCE calls−puts a ±0,5%"],
  ["desbalance1",      "DESBALANCE calls−puts a ±1%"],
  ["desbalance2",      "DESBALANCE calls−puts a ±2%"],
  ["concentracion",    "CONCENTRACIÓN (parte del OI en los 5 strikes más gordos)"],
  ["ratioCallPut",     "ratio calls/puts de toda la cadena"],
];
const CONTROLES = [
  ["totalContratos",   "CONTROL (b) TAMAÑO de la cadena"],
  ["cunaPct",          "CONTROL (c) VOLATILIDAD: cuña ATM de las 09:35"],
];

function pintarEscalera(k, etiqueta) {
  const { montones, usados, perdidos } = quintiles(filas, k);
  console.log(`\n─── ${etiqueta}  [${k}]  n=${usados}${perdidos ? ` (${perdidos} sin dato)` : ""} ───`);
  console.log("  Q  rango del estadístico        n   $/op    $/año   mediana   peor    créd  tocInt  tocCie  pTot   t");
  const rs = [];
  for (let q = 0; q < 5; q++) {
    const m = montones[q];
    const r = resumenMonton(m, m.length / DIAS_ANO * (filas.length / filas.length) || 1);
    // $/año del montón: su dinero total repartido sobre los AÑOS DE LA MUESTRA COMPLETA,
    // porque el montón sólo opera 1 de cada 5 días del calendario.
    r.porAno = r.total / ANOS;
    r.lo = m[0][k]; r.hi = m[m.length - 1][k];
    rs.push(r);
    console.log(`  Q${q + 1} ${f3(r.lo).padStart(9)} … ${f3(r.hi).padStart(9)}  ${String(r.n).padStart(4)}  ` +
      `${f0(r.porOp).padStart(5)}  ${f0(r.porAno).padStart(7)}  ${f0(r.mediana).padStart(6)}  ${f0(r.peor).padStart(7)}  ` +
      `${f0(r.credito).padStart(5)}  ${pct(r.tocIntra).padStart(6)}  ${pct(r.tocCierre).padStart(6)}  ${pct(r.perdTotal).padStart(5)}  ${f1(r.t).padStart(5)}`);
  }
  const porOps = rs.map((r) => r.porOp);
  const spread = Math.max(...porOps) - Math.min(...porOps);
  const peorQ = porOps.indexOf(Math.min(...porOps));
  const dentro = montones[peorQ].map((o) => o.dolares);
  const fuera = montones.filter((_, i) => i !== peorQ).flat().map((o) => o.dolares);
  const tPeor = tDos(dentro, fuera);
  console.log(`  separación (mejor−peor montón): $${f0(spread)}/op · peor montón = Q${peorQ + 1} ` +
              `($${f0(media(dentro))}/op vs $${f0(media(fuera))}/op en el resto, t=${f2(tPeor)})`);
  // monotonía: ¿la escalera sube o baja de verdad o va dando tumbos?
  const subeSiempre = porOps.every((x, i) => i === 0 || x >= porOps[i - 1]);
  const bajaSiempre = porOps.every((x, i) => i === 0 || x <= porOps[i - 1]);
  console.log(`  monótona: ${subeSiempre ? "SÍ, creciente" : bajaSiempre ? "SÍ, decreciente" : "NO"}`);
  return { k, etiqueta, rs, spread, peorQ, tPeor, montones, subeSiempre, bajaSiempre };
}

console.log("\n\n══════════ ESCALERAS POR LA FORMA DE LA CADENA ══════════");
console.log("($/año de cada montón = su dinero total repartido sobre los años de TODA la muestra,");
console.log(" porque un montón sólo opera 1 de cada 5 días del calendario)");
const RES = [];
for (const [k, e] of ESTADISTICOS) RES.push(pintarEscalera(k, e));

console.log("\n\n══════════ LOS MISMOS MONTONES, PERO DE CONTROL ══════════");
const CTRL = [];
for (const [k, e] of CONTROLES) CTRL.push(pintarEscalera(k, e));

// ══════════════════════════════════════════════════════════════════════════════════════════
// CONTROL (a) — EL AZAR: ¿cuánta separación produce partir los días sin mirar nada?
// 400 particiones deterministas. Cada una ordena los días por (i·multiplicador mod n), que es
// un barajado reproducible y sin ninguna relación con el mercado. Los scripts de este proyecto
// no pueden usar Math.random.
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n\n══════════ CONTROL (a) — EL LISTÓN DEL AZAR ══════════");
const N = filas.length;
const spreadsAzar = [];
const tPeorAzar = [];
for (let s = 0; s < 400; s++) {
  const mult = 2 * s + 7;                                   // impar; el barajado cambia con s
  const orden = filas.map((f, i) => ({ f, key: ((i + 1) * mult * 2654435761) % 4294967291 }))
                     .sort((a, b) => a.key - b.key).map((x) => x.f);
  const ms = [];
  for (let q = 0; q < 5; q++) ms.push(orden.slice(Math.floor((q * N) / 5), Math.floor(((q + 1) * N) / 5)));
  const mm = ms.map((m) => media(m.map((o) => o.dolares)));
  spreadsAzar.push(Math.max(...mm) - Math.min(...mm));
  const pq = mm.indexOf(Math.min(...mm));
  tPeorAzar.push(Math.abs(tDos(ms[pq].map((o) => o.dolares), ms.filter((_, i) => i !== pq).flat().map((o) => o.dolares))));
}
spreadsAzar.sort((a, b) => a - b); tPeorAzar.sort((a, b) => a - b);
const qz = (v, p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
console.log(`400 particiones al azar en 5 montones de ${Math.floor(N / 5)} días:`);
console.log(`  separación mejor−peor:  mediana $${f0(qz(spreadsAzar, 0.5))}/op · p90 $${f0(qz(spreadsAzar, 0.90))} · ` +
            `p95 $${f0(qz(spreadsAzar, 0.95))} · p99 $${f0(qz(spreadsAzar, 0.99))} · max $${f0(spreadsAzar[399])}`);
console.log(`  |t| del peor montón:    mediana ${f2(qz(tPeorAzar, 0.5))} · p90 ${f2(qz(tPeorAzar, 0.90))} · ` +
            `p95 ${f2(qz(tPeorAzar, 0.95))} · p99 ${f2(qz(tPeorAzar, 0.99))} · max ${f2(tPeorAzar[399])}`);

console.log("\n─── CADA ESTADÍSTICO CONTRA EL LISTÓN DEL AZAR ───");
console.log("  estadístico                 separación   pct-azar   |t| peor   pct-azar   monótona");
const conP = [];
for (const r of [...RES, ...CTRL]) {
  const pS = spreadsAzar.filter((x) => x < r.spread).length / spreadsAzar.length;
  const pT = tPeorAzar.filter((x) => x < Math.abs(r.tPeor)).length / tPeorAzar.length;
  conP.push({ ...r, pS, pT });
  console.log(`  ${r.k.padEnd(20)} ${("$" + f0(r.spread)).padStart(10)}   ${pct(pS).padStart(7)}   ` +
              `${f2(Math.abs(r.tPeor)).padStart(7)}   ${pct(pT).padStart(7)}   ${r.subeSiempre || r.bajaSiempre ? "sí" : "no"}`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// ¿SON PROXIES? — correlación de cada estadístico con el tamaño y con la volatilidad
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n─── ¿ES SÓLO TAMAÑO O VOLATILIDAD DISFRAZADOS? (correlaciones) ───");
console.log("  estadístico            corr con TAMAÑO   corr con CUÑA(vol)");
for (const [k] of ESTADISTICOS) {
  const v = filas.filter((f) => f[k] != null && f.cunaPct != null);
  console.log(`  ${k.padEnd(20)} ${f3(correl(v.map((f) => f[k]), v.map((f) => f.totalContratos))).padStart(14)}   ` +
              `${f3(correl(v.map((f) => f[k]), v.map((f) => f.cunaPct))).padStart(14)}`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// EL CANDIDATO — el estadístico que más separa, mirado de cerca
// ══════════════════════════════════════════════════════════════════════════════════════════
const soloForma = conP.filter((r) => ESTADISTICOS.some(([k]) => k === r.k));
const cand = [...soloForma].sort((a, b) => Math.abs(b.tPeor) - Math.abs(a.tPeor))[0];
console.log(`\n\n══════════ EL CANDIDATO: ${cand.k} — ${cand.etiqueta} ══════════`);
console.log(`Peor montón = Q${cand.peorQ + 1}, |t| = ${f2(cand.tPeor)} (percentil ${pct(cand.pT)} del azar)`);

function informeFiltro(apagados, encendidos, nombre) {
  const vTodo = filas.map((f) => f.dolares);
  const vOn = encendidos.map((f) => f.dolares);
  const vOff = apagados.map((f) => f.dolares);
  const totTodo = suma(vTodo), totOn = suma(vOn), totOff = suma(vOff);
  console.log(`\n  ${nombre}`);
  console.log(`    máquina APAGADA ${apagados.length} días = ${f1(apagados.length / ANOS)} días al año`);
  console.log(`    sin filtro : $${f0(totTodo / ANOS)}/año  ($${f2(totTodo / filas.length)}/op, n=${filas.length})`);
  console.log(`    con filtro : $${f0(totOn / ANOS)}/año  ($${f2(totOn / vOn.length)}/op, n=${vOn.length})`);
  console.log(`    los días apagados habrían dado $${f0(totOff / ANOS)}/año ($${f2(totOff / (vOff.length || 1))}/op)`);
  console.log(`    DIFERENCIA : ${totOn - totTodo >= 0 ? "+" : ""}$${f0((totOn - totTodo) / ANOS)}/año`);
  const oOn = [...encendidos].sort((a, b) => b.dolares - a.dolares);
  console.log(`    con filtro y sin los 5 mejores días: $${f0(suma(oOn.slice(5).map((f) => f.dolares)) / ANOS)}/año`);
  console.log(`    peor día con filtro $${f0(Math.min(...vOn))} · mediana $${f0(mediana(vOn))} · ` +
              `tocados intradía ${pct(encendidos.filter((f) => f.tocadoIntra).length / vOn.length)}`);
  const porAnoOn = {}, porAnoTodo = {};
  for (const f of encendidos) porAnoOn[f.ano] = (porAnoOn[f.ano] ?? 0) + f.dolares;
  for (const f of filas) porAnoTodo[f.ano] = (porAnoTodo[f.ano] ?? 0) + f.dolares;
  console.log("    año a año (sin filtro → con filtro):");
  for (const a of Object.keys(porAnoTodo).sort())
    console.log(`      ${a}: $${f0(porAnoTodo[a])} → $${f0(porAnoOn[a] ?? 0)}`);
}

{
  const apagados = cand.montones[cand.peorQ];
  const set = new Set(apagados.map((f) => f.dia));
  const encendidos = filas.filter((f) => !set.has(f.dia));
  informeFiltro(apagados, encendidos, `APAGAR el montón Q${cand.peorQ + 1} de ${cand.k}`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// CONTROL TEMPORAL — cortes construidos SÓLO con < 2025-01-01, comprobados en 2025-2026
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n\n══════════ FUERA DE MUESTRA — cortes de <2025, comprobación en 2025-2026 ══════════");
const ANTES = filas.filter((f) => f.dia < "2025-01-01");
const DESPUES = filas.filter((f) => f.dia >= "2025-01-01");
const anosAntes = ANTES.length / DIAS_ANO, anosDespues = DESPUES.length / DIAS_ANO;
console.log(`Dentro de muestra: ${ANTES.length} días (${f2(anosAntes)} años) · Fuera: ${DESPUES.length} días (${f2(anosDespues)} años)`);

console.log("\n  estadístico          peorQ(<2025)  $/op dentro  $/op resto | $/op fuera  $/op resto  |  $/año que cambia fuera");
const fueraFilas = [];
for (const [k, e] of ESTADISTICOS) {
  const v = ANTES.filter((f) => f[k] != null).sort((a, b) => a[k] - b[k]);
  if (v.length < 100) continue;
  const cortes = [1, 2, 3, 4].map((q) => v[Math.floor((q * v.length) / 5)][k]);
  const cubo = (x) => (x <= cortes[0] ? 0 : x <= cortes[1] ? 1 : x <= cortes[2] ? 2 : x <= cortes[3] ? 3 : 4);
  const gAntes = [[], [], [], [], []];
  for (const f of ANTES) if (f[k] != null) gAntes[cubo(f[k])].push(f.dolares);
  const mAntes = gAntes.map((g) => media(g));
  const pq = mAntes.indexOf(Math.min(...mAntes));
  const gDesp = [[], [], [], [], []];
  const offDesp = [];
  for (const f of DESPUES) if (f[k] != null) { const c = cubo(f[k]); gDesp[c].push(f.dolares); if (c === pq) offDesp.push(f); }
  const dentroD = gDesp[pq], restoD = gDesp.filter((_, i) => i !== pq).flat();
  const dentroA = gAntes[pq], restoA = gAntes.filter((_, i) => i !== pq).flat();
  const cambio = -suma(dentroD) / anosDespues;              // lo que se ahorra (o se pierde) al apagar
  const mDesp = gDesp.map((g) => media(g));
  fueraFilas.push({ k, pq, cambio, mismoSigno: media(dentroD) < media(restoD),
                    sigueSiendoElPeor: mDesp.indexOf(Math.min(...mDesp)) === pq });
  console.log(`  ${k.padEnd(20)} Q${pq + 1}          ${f0(media(dentroA)).padStart(10)}  ${f0(media(restoA)).padStart(10)} | ` +
              `${f0(media(dentroD)).padStart(9)}  ${f0(media(restoD)).padStart(10)}  |  ` +
              `${(cambio >= 0 ? "+" : "") + "$" + f0(cambio)}  (n fuera=${dentroD.length})`);
}
const sobreviven = fueraFilas.filter((r) => r.mismoSigno);
const sobrevivenDuro = fueraFilas.filter((r) => r.sigueSiendoElPeor);
console.log(`\n  Peor montón de <2025 que sigue POR DEBAJO DE LA MEDIA en 2025-2026: ` +
            `${sobreviven.length} de ${fueraFilas.length}  →  ${sobreviven.map((r) => r.k).join(", ") || "ninguno"}`);
console.log(`     (por puro azar saldrían ~la mitad: ${f1(fueraFilas.length * 0.5)} de ${fueraFilas.length} — ` +
            `así que este listón NO distingue nada)`);
console.log(`  Peor montón de <2025 que sigue siendo EL MÁS BAJO DE LOS CINCO en 2025-2026: ` +
            `${sobrevivenDuro.length} de ${fueraFilas.length}  →  ${sobrevivenDuro.map((r) => r.k).join(", ") || "ninguno"}`);
console.log(`     (por puro azar saldrían ~${f1(fueraFilas.length * 0.2)} de ${fueraFilas.length})`);

// ══════════════════════════════════════════════════════════════════════════════════════════
// EL 21 DE AGOSTO — ¿en qué percentil de todo cae la huella del día de Eduardo?
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n\n══════════ DÓNDE CAE EL 21 DE AGOSTO DENTRO DE LA HISTORIA ══════════");
const d21 = cargarDia21();
if (!d21) console.log("  (no está el día 21 en cache-theta/dia-21)");
else {
  const p21 = perfilGex(d21.oi, d21.barras[0].spot);
  console.log(`  spot de referencia del 21: ${f2(d21.barras[0].spot)} (${d21.barras.length} barras, la primera ${d21.barras[0].t})`);
  console.log("  estadístico            valor del 21   percentil   montón");
  for (const [k] of ESTADISTICOS) {
    const val = k === "absIman" ? Math.abs(p21.imanPct) : k === "absGiro" ? Math.abs(p21.giroPct) : p21[k];
    if (val == null || !Number.isFinite(val)) { console.log(`  ${k.padEnd(20)}  sin dato`); continue; }
    const v = filas.map((f) => f[k]).filter((x) => x != null).sort((a, b) => a - b);
    const p = v.filter((x) => x < val).length / v.length;
    console.log(`  ${k.padEnd(20)} ${f3(val).padStart(13)}   ${pct(p).padStart(8)}   Q${Math.min(5, Math.floor(p * 5) + 1)}`);
  }
  // ¿qué hicieron los 50 días con la silueta más parecida?
  const conD = filas.map((f) => ({ f, d: Math.sqrt(f.silueta.reduce((a, x, i) => a + (x - p21.silueta[i]) ** 2, 0)) }))
                    .sort((a, b) => a.d - b.d);
  for (const nG of [30, 60, 120]) {
    const g = conD.slice(0, nG).map((x) => x.f);
    const r = resumenMonton(g, ANOS);
    console.log(`  Los ${nG} días de silueta más parecida al 21: $${f0(r.porOp)}/op · mediana $${f0(r.mediana)} · ` +
                `peor $${f0(r.peor)} · tocados intra ${pct(r.tocIntra)} · (todos: $${f0(media(filas.map((f) => f.dolares)))}/op, ` +
                `tocados ${pct(filas.filter((f) => f.tocadoIntra).length / filas.length)})`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// EL CANDIDATO A FONDO — un montón del MEDIO que es el peor huele a sobreajuste.
// Si el efecto es real, no puede depender de dónde caiga exactamente el corte, ni salir todo
// de un año, ni de cuatro días desastrosos.
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n\n══════════ EL CANDIDATO A FONDO — desbalance2 ══════════");
{
  const K = "desbalance2";
  const v = filas.filter((f) => f[K] != null).sort((a, b) => a[K] - b[K]);

  // 1 · ¿qué forma tiene la escalera si se parte en 3 y en 10?
  for (const G of [3, 10]) {
    console.log(`\n  Partido en ${G} montones:`);
    for (let q = 0; q < G; q++) {
      const m = v.slice(Math.floor((q * v.length) / G), Math.floor(((q + 1) * v.length) / G));
      const d = m.map((o) => o.dolares);
      console.log(`    ${String(q + 1).padStart(2)}  ${f3(m[0][K]).padStart(7)} … ${f3(m[m.length - 1][K]).padStart(7)}  ` +
                  `n=${String(m.length).padStart(4)}  $${f0(media(d)).padStart(5)}/op  t=${f1(tDe(d)).padStart(5)}  ` +
                  `mediana $${f0(mediana(d)).padStart(4)}  peor $${f0(Math.min(...d))}`);
    }
  }

  // 2 · ¿aguanta si movemos el corte? zona mala = desbalance2 dentro de [a, b]
  console.log(`\n  ¿Aguanta si movemos el corte? (zona apagada = desbalance2 en [a, b])`);
  console.log("     a       b      días  $/op dentro  $/op fuera   t    $/año con el filtro");
  for (const a of [-0.30, -0.25, -0.20, -0.15, -0.10]) {
    for (const b of [-0.05, 0.00, 0.02, 0.05, 0.10]) {
      const dentro = v.filter((f) => f[K] >= a && f[K] <= b);
      const fuera = v.filter((f) => !(f[K] >= a && f[K] <= b));
      if (dentro.length < 40) continue;
      console.log(`   ${f2(a).padStart(6)}  ${f2(b).padStart(6)}  ${String(dentro.length).padStart(5)}  ` +
                  `${f0(media(dentro.map((o) => o.dolares))).padStart(10)}  ${f0(media(fuera.map((o) => o.dolares))).padStart(10)}  ` +
                  `${f1(tDos(dentro.map((o) => o.dolares), fuera.map((o) => o.dolares))).padStart(5)}  ` +
                  `$${f0(suma(fuera.map((o) => o.dolares)) / ANOS).padStart(8)}`);
    }
  }

  // 3 · ¿de dónde sale el dinero del montón malo? año a año y sin sus 5 peores días
  const q2 = v.slice(Math.floor(v.length / 5), Math.floor((2 * v.length) / 5));
  const d2 = q2.map((o) => o.dolares).sort((a, b) => a - b);
  console.log(`\n  El montón malo (Q2, n=${q2.length}): total $${f0(suma(d2))}`);
  console.log(`    sus 5 PEORES días suman $${f0(suma(d2.slice(0, 5)))} — sin ellos el montón daría $${f2(media(d2.slice(5)))}/op`);
  const pa = {};
  for (const o of q2) (pa[o.ano] ??= []).push(o.dolares);
  for (const a of Object.keys(pa).sort())
    console.log(`    ${a}: n=${String(pa[a].length).padStart(3)}  $${f0(media(pa[a])).padStart(5)}/op  total $${f0(suma(pa[a]))}`);

  // 4 · CONTROL cruzado: ¿sobrevive DENTRO de cada montón de volatilidad?
  // (la correlación de desbalance2 con la cuña es −0,41, así que hay que descartarlo)
  console.log(`\n  Control cruzado: el mismo corte DENTRO de cada quintil de volatilidad (cuña ATM)`);
  const conCuna = filas.filter((f) => f.cunaPct != null && f[K] != null).sort((a, b) => a.cunaPct - b.cunaPct);
  const zona = (f) => f[K] >= -0.201 && f[K] <= 0.018;
  console.log("     quintil de cuña   n dentro  $/op dentro   n fuera  $/op fuera     t");
  for (let q = 0; q < 5; q++) {
    const m = conCuna.slice(Math.floor((q * conCuna.length) / 5), Math.floor(((q + 1) * conCuna.length) / 5));
    const dd = m.filter(zona).map((o) => o.dolares), ff = m.filter((f) => !zona(f)).map((o) => o.dolares);
    if (dd.length < 5 || ff.length < 5) { console.log(`     Q${q + 1}  muestra insuficiente`); continue; }
    console.log(`     Q${q + 1}              ${String(dd.length).padStart(6)}  ${f0(media(dd)).padStart(10)}  ` +
                `${String(ff.length).padStart(8)}  ${f0(media(ff)).padStart(10)}  ${f1(tDos(dd, ff)).padStart(6)}`);
  }
  const cuantos = [0, 0];
  for (let q = 0; q < 5; q++) {
    const m = conCuna.slice(Math.floor((q * conCuna.length) / 5), Math.floor(((q + 1) * conCuna.length) / 5));
    const dd = m.filter(zona).map((o) => o.dolares), ff = m.filter((f) => !zona(f)).map((o) => o.dolares);
    if (dd.length >= 5 && ff.length >= 5) cuantos[media(dd) < media(ff) ? 0 : 1]++;
  }
  console.log(`     el corte va en la dirección esperada en ${cuantos[0]} de ${cuantos[0] + cuantos[1]} quintiles de volatilidad`);

  // 5 · el segundo candidato, para no esconderlo
  console.log(`\n  Segundo candidato (concentracion, peor montón Q1 = OI menos concentrado):`);
  const vc = filas.filter((f) => f.concentracion != null).sort((a, b) => a.concentracion - b.concentracion);
  const c1 = vc.slice(0, Math.floor(vc.length / 5));
  const pac = {};
  for (const o of c1) (pac[o.ano] ??= []).push(o.dolares);
  for (const a of Object.keys(pac).sort())
    console.log(`    ${a}: n=${String(pac[a].length).padStart(3)}  $${f0(media(pac[a])).padStart(5)}/op  total $${f0(suma(pac[a]))}`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// ¿DE QUÉ DÍAS SALE TODO? — la prueba que mató dos hallazgos del encargo anterior
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n\n══════════ ¿DE QUÉ DÍAS SALE TODO? ══════════");
{
  const K = "desbalance2";
  const zona = (f) => f[K] >= -0.201 && f[K] <= 0.018;
  const peores = [...filas].sort((a, b) => a.dolares - b.dolares).slice(0, 10);
  console.log("  Los 10 peores días del cóndor sin filtro (¿los apagaría el filtro?):");
  for (const f of peores)
    console.log(`    ${f.dia}  $${f0(f.dolares).padStart(6)}  desbalance2=${f3(f[K])}  ` +
                `→ ${zona(f) ? "APAGADO por el filtro" : "seguiría operando"}`);
  const apag = filas.filter(zona), enc = filas.filter((f) => !zona(f));
  console.log(`  De los 10 peores días, el filtro apaga ${peores.filter(zona).length}.`);

  // sin 2022: ¿el filtro sigue valiendo cuando no hay mercado bajista?
  const sin22 = filas.filter((f) => f.ano >= 2023);
  const a22 = sin22.filter(zona), e22 = sin22.filter((f) => !zona(f));
  const anos22 = sin22.length / DIAS_ANO;
  console.log(`\n  SIN 2022 (${sin22.length} días = ${f2(anos22)} años):`);
  console.log(`    sin filtro $${f0(suma(sin22.map((f) => f.dolares)) / anos22)}/año  ·  ` +
              `con filtro $${f0(suma(e22.map((f) => f.dolares)) / anos22)}/año  ·  ` +
              `diferencia ${suma(e22.map((f) => f.dolares)) - suma(sin22.map((f) => f.dolares)) >= 0 ? "+" : ""}` +
              `$${f0((suma(e22.map((f) => f.dolares)) - suma(sin22.map((f) => f.dolares))) / anos22)}/año`);
  console.log(`    los días apagados dan $${f2(media(a22.map((f) => f.dolares)))}/op (n=${a22.length}) ` +
              `contra $${f2(media(e22.map((f) => f.dolares)))}/op de los encendidos (t=${f2(tDos(a22.map((f) => f.dolares), e22.map((f) => f.dolares)))})`);

  // y la versión sin los cinco peores días de cada lado, para ver si queda algo
  const ordA = [...apag].sort((a, b) => a.dolares - b.dolares);
  console.log(`\n  El grupo apagado (n=${apag.length}) sin sus 5 peores días: ` +
              `$${f2(media(ordA.slice(5).map((f) => f.dolares)))}/op ` +
              `(con ellos $${f2(media(apag.map((f) => f.dolares)))}/op)`);
  console.log(`  El grupo encendido (n=${enc.length}): $${f2(media(enc.map((f) => f.dolares)))}/op · ` +
              `t=${f2(tDe(enc.map((f) => f.dolares)))}`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// LA FICHA FINAL — los números que se reportan, con mitades y tercios
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n\n══════════ FICHA FINAL ══════════");
{
  const zona = (f) => f.desbalance2 >= -0.201 && f.desbalance2 <= 0.018;
  const ficha = (ops, nombre) => {
    const v = ops.map((o) => o.dolares);
    const rr = ops.map((o) => (o.riesgoMax > 0 ? o.dolares / o.riesgoMax : NaN)).filter(Number.isFinite);
    const anos = filas.length / DIAS_ANO;               // el calendario es el mismo, se opere o no
    const mit = [ops.slice(0, ops.length >> 1), ops.slice(ops.length >> 1)];
    const ter = [0, 1, 2].map((i) => ops.slice(Math.floor((i * ops.length) / 3), Math.floor(((i + 1) * ops.length) / 3)));
    const ord = [...v].sort((a, b) => b - a);
    console.log(`\n  ${nombre}`);
    console.log(`    n=${ops.length} · $${f2(media(v))}/op · $${f0(suma(v) / anos)}/año · ` +
                `aciertos ${pct(v.filter((x) => x > 0).length / v.length)} · media sobre riesgo ${f2(media(rr) * 100)}% · t=${f2(tDe(v))}`);
    console.log(`    mediana $${f0(mediana(v))} · peor día $${f0(Math.min(...v))} · ` +
                `sin los 5 mejores $${f0(suma(ord.slice(5)) / anos)}/año`);
    console.log(`    mitades: $${f2(media(mit[0].map((o) => o.dolares)))}/op  →  $${f2(media(mit[1].map((o) => o.dolares)))}/op`);
    console.log(`    tercios: ${ter.map((t) => "$" + f2(media(t.map((o) => o.dolares))) + "/op").join("  ·  ")}`);
    return { n: ops.length, porOp: media(v), porAno: suma(v) / anos, aciertos: v.filter((x) => x > 0).length / v.length,
             sobreRiesgo: media(rr) * 100, t: tDe(v), mediana: mediana(v), peor: Math.min(...v),
             sin5: suma(ord.slice(5)) / anos,
             mit: mit.map((m) => media(m.map((o) => o.dolares))),
             ter: ter.map((m) => media(m.map((o) => o.dolares))) };
  };
  ficha(filas, "CÓNDOR SIN FILTRO (el listón)");
  ficha(filas.filter((f) => !zona(f)), "CÓNDOR apagando desbalance2 ∈ [−0,201 , +0,018]");
  ficha(filas.filter(zona), "los días APAGADOS (lo que nos ahorraríamos)");
}

console.log("\n\n══════════ FIN ══════════");
