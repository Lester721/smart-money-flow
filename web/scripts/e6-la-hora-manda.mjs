// EL LISTÓN PURO: SÓLO LA HORA, SIN NINGUNA SEÑAL
//
// ═══ QUÉ MIDE ═══════════════════════════════════════════════════════════════════════════════
//
// La pregunta más tonta que se puede hacer, y por eso la más importante: si compro una opción
// de SPXW que vence HOY a las E y la vendo a las S, TODOS los días, sin mirar nada — ni el GEX,
// ni el interés abierto, ni una noticia — ¿gano o pierdo?
//
// Se recorre la rejilla ENTERA de horas: entrada en cada barra de 5 minutos de 09:35 a 15:30,
// salida en cada barra posterior hasta las 15:30. Son 2.556 parejas de horas. Y se hace con
// cinco contratos distintos:
//
//     C_ATM     call en el strike más cercano al precio
//     C_+10     call 10 puntos por ENCIMA del precio (fuera del dinero)
//     P_ATM     put en el strike más cercano
//     P_-10     put 10 puntos por DEBAJO (fuera del dinero — el espejo de C_+10)
//     P_+10     put 10 puntos por ENCIMA (dentro del dinero — la lectura literal del encargo)
//
// ═══ POR QUÉ IMPORTA ════════════════════════════════════════════════════════════════════════
//
// Esto es el LISTÓN de todas las demás reglas de este proyecto. Cualquier señal que diga
// «compra una call 0DTE» tiene que valer MÁS que el agujero que deja comprarla a ciegas. Si
// el agujero es de −$X al año, una señal que no lo tape no sirve para nada, por muy bonito que
// sea el gráfico. Y si por el contrario existe alguna pareja de horas que sale POSITIVA de
// forma estable sobre 1.123 días, eso ya es un hallazgo por sí mismo y no hace falta señal.
//
// ═══ LAS REGLAS DE LA CASA QUE APLICAN AQUÍ ═════════════════════════════════════════════════
//
//  · Se compra al ASK y se vende al BID. Lo hace el banco (compraEn/ventaEn) y no se toca.
//  · Sólo se mira el pasado: la entrada elige el strike con el precio de ESA barra, nada más.
//  · Un hueco no es un cero: si falta el ask de entrada o el bid de salida, la operación NO
//    existe y se cuenta aparte.
//  · Nada de modelos. Ningún precio se estima.
//  · Todo en dólares al año, con UN contrato.
//
// El control barajado no aplica en esta familia: no hay señal que barajar, esto ES el control.
// Lo que sí aplica es el control de SIMETRÍA (calls contra puts) y el corte del tiempo en dos
// mitades y en tres tercios, que van los dos dentro.
//
// Ejecutar:  node --import tsx scripts/e6-la-hora-manda.mjs

import {
  diasDisponibles, cargarDia, operar, rejilla, compraEn, ventaEn,
} from "./lib0dte.mjs";

// ── LA REJILLA DE HORAS ─────────────────────────────────────────────────────────────────────
// De 09:35 (primera barra que existe en los ficheros) a 15:30. 72 horas, 2.556 parejas.
const HORAS = [];
for (let m = 9 * 60 + 35; m <= 15 * 60 + 30; m += 5) {
  HORAS.push(String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"));
}
const NH = HORAS.length;

// ── LOS CINCO CONTRATOS ─────────────────────────────────────────────────────────────────────
const VAR = [
  { id: "C_ATM", lado: "C", off: 0,   nombre: "call en el dinero" },
  { id: "C_+10", lado: "C", off: +10, nombre: "call 10 pts por encima (fuera del dinero)" },
  { id: "P_ATM", lado: "P", off: 0,   nombre: "put en el dinero" },
  { id: "P_-10", lado: "P", off: -10, nombre: "put 10 pts por debajo (fuera del dinero)" },
  { id: "P_+10", lado: "P", off: +10, nombre: "put 10 pts por encima (dentro del dinero)" },
];
const NV = VAR.length;

const ANOS = ["2022", "2023", "2024", "2025", "2026"];
const iAno = (d) => ANOS.indexOf(d.slice(0, 4));

// ── ACUMULADORES ────────────────────────────────────────────────────────────────────────────
// Índice de celda: v * NH*NH + E * NH + S
const CELDAS = NV * NH * NH;
const ce = (v, e, s) => (v * NH + e) * NH + s;

const N     = new Float64Array(CELDAS);   // operaciones válidas
const SUMR  = new Float64Array(CELDAS);   // suma de retornos
const SUMR2 = new Float64Array(CELDAS);   // suma de retornos al cuadrado
const SUMD  = new Float64Array(CELDAS);   // suma de dólares (1 contrato)
const WIN   = new Float64Array(CELDAS);   // operaciones ganadoras
const HUE   = new Float64Array(CELDAS);   // huecos (falta un precio)
const SUMC  = new Float64Array(CELDAS);   // suma de costes de entrada
const SUMH  = new Float64Array(CELDAS);   // suma de la horquilla de entrada, en % de la prima

// cortes del tiempo: 5 años, 2 mitades, 3 tercios — sólo n y suma de retornos
const NA = new Float64Array(CELDAS * ANOS.length), RA = new Float64Array(CELDAS * ANOS.length);
const NM = new Float64Array(CELDAS * 2), RM = new Float64Array(CELDAS * 2);
const NT = new Float64Array(CELDAS * 3), RT = new Float64Array(CELDAS * 3);

// ── DIAGNÓSTICO (validar antes de creerse nada) ─────────────────────────────────────────────
const diag = {
  diasListados: 0, diasCargados: 0, diasNulos: 0, diasSinRejilla: 0,
  costes1000: [],          // muestra de costes de entrada de C_ATM a las 10:00
  spotMin: Infinity, spotMax: -Infinity,
};

// ═══ LA PASADA ══════════════════════════════════════════════════════════════════════════════
const dias = diasDisponibles();
diag.diasListados = dias.length;
const t0 = Date.now();

// comprobación cruzada: las primeras 300 operaciones se recalculan con operar() del banco
let cruzadas = 0, discrepancias = 0;

for (let d = 0; d < dias.length; d++) {
  const D = cargarDia(dias[d]);
  if (!D) { diag.diasNulos++; continue; }
  diag.diasCargados++;

  // posición de cada hora de la rejilla dentro de las barras de ESTE día
  const pos = new Int32Array(NH).fill(-1);
  const porHora = new Map();
  for (let i = 0; i < D.barras.length; i++) porHora.set(D.barras[i].t, i);
  let faltan = 0;
  for (let h = 0; h < NH; h++) { const p = porHora.get(HORAS[h]); if (p === undefined) faltan++; else pos[h] = p; }
  if (faltan > 0) diag.diasSinRejilla++;

  const a = iAno(dias[d]);
  const mit = d < Math.floor(dias.length / 2) ? 0 : 1;
  const ter = d < Math.floor(dias.length / 3) ? 0 : d < Math.floor((2 * dias.length) / 3) ? 1 : 2;

  for (let v = 0; v < NV; v++) {
    const { lado, off } = VAR[v];
    for (let e = 0; e < NH - 1; e++) {
      if (pos[e] < 0) continue;
      const be = D.barras[pos[e]];
      if (be.spot > diag.spotMax) diag.spotMax = be.spot;
      if (be.spot < diag.spotMin) diag.spotMin = be.spot;
      const K = rejilla(be.spot) + off;
      const coste = compraEn(be, K, lado);
      const bidE = ventaEn(be, K, lado);
      if (coste == null || !(coste > 0)) {
        // sin precio de entrada no hay ninguna operación desde esta hora: todo son huecos
        for (let s = e + 1; s < NH; s++) HUE[ce(v, e, s)]++;
        continue;
      }
      if (v === 0 && HORAS[e] === "10:00" && diag.costes1000.length < 100000) diag.costes1000.push(coste);
      const horq = bidE == null ? NaN : (coste - bidE) / coste;

      for (let s = e + 1; s < NH; s++) {
        const k = ce(v, e, s);
        if (pos[s] < 0) { HUE[k]++; continue; }
        const ingreso = ventaEn(D.barras[pos[s]], K, lado);
        if (ingreso == null) { HUE[k]++; continue; }
        const ret = (ingreso - coste) / coste;
        const dol = (ingreso - coste) * 100;

        // control cruzado con operar() del banco, para probar que la contabilidad es la misma
        if (cruzadas < 300 && d % 137 === 0 && e % 23 === 0 && s === e + 7) {
          const op = operar(D, pos[e], pos[s], K, lado);
          cruzadas++;
          if (!op || Math.abs(op.ret - ret) > 1e-12 || Math.abs(op.dolares - dol) > 1e-9) discrepancias++;
        }

        N[k]++; SUMR[k] += ret; SUMR2[k] += ret * ret; SUMD[k] += dol; SUMC[k] += coste;
        if (!Number.isNaN(horq)) SUMH[k] += horq;
        if (ret > 0) WIN[k]++;
        NA[k * ANOS.length + a]++; RA[k * ANOS.length + a] += ret;
        NM[k * 2 + mit]++;        RM[k * 2 + mit] += ret;
        NT[k * 3 + ter]++;        RT[k * 3 + ter] += ret;
      }
    }
  }
  if ((d + 1) % 200 === 0) console.log(`  … ${d + 1}/${dias.length} días (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
console.log(`Pasada completa en ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

// ═══ VALIDACIÓN — antes de dar por bueno ni un número ════════════════════════════════════════
const cs = diag.costes1000.slice().sort((x, y) => x - y);
const pct = (v, p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
console.log("═══ VALIDACIÓN ═══════════════════════════════════════════════════════");
console.log(`días listados ........ ${diag.diasListados}`);
console.log(`días cargados ........ ${diag.diasCargados}   (nulos: ${diag.diasNulos})`);
console.log(`días con alguna hora de la rejilla ausente: ${diag.diasSinRejilla}`);
console.log(`rango del SPX en la muestra: ${diag.spotMin.toFixed(2)} … ${diag.spotMax.toFixed(2)}`);
console.log(`horas de la rejilla: ${NH} (${HORAS[0]} … ${HORAS[NH - 1]}) → ${(NH * (NH - 1)) / 2} parejas`);
console.log(`coste de entrada de una CALL EN EL DINERO a las 10:00 (n=${cs.length}):`);
console.log(`   mín $${cs[0].toFixed(2)} · p10 $${pct(cs, 0.1).toFixed(2)} · mediana $${pct(cs, 0.5).toFixed(2)} · p90 $${pct(cs, 0.9).toFixed(2)} · máx $${cs[cs.length - 1].toFixed(2)}`);
console.log(`control cruzado con operar() del banco: ${cruzadas} operaciones recalculadas, ${discrepancias} discrepancias`);
let nTot = 0, hTot = 0;
for (let k = 0; k < CELDAS; k++) { nTot += N[k]; hTot += HUE[k]; }
console.log(`operaciones válidas totales: ${nTot.toLocaleString("es-ES")}`);
console.log(`huecos (faltaba un precio): ${hTot.toLocaleString("es-ES")}  (${((100 * hTot) / (nTot + hTot)).toFixed(2)} %)`);
if (discrepancias > 0) throw new Error("la contabilidad no coincide con operar() — parar aquí");
if (!(pct(cs, 0.5) > 2 && pct(cs, 0.5) < 25)) throw new Error(`coste mediano fuera de rango razonable: ${pct(cs, 0.5)}`);
console.log("");

// ── los años que abarca la muestra, para pasar a $/año ──────────────────────────────────────
const ANOS_MUESTRA = diag.diasCargados / 252;

// ═══ LECTURA DE UNA CELDA ═══════════════════════════════════════════════════════════════════
function celda(v, e, s) {
  const k = ce(v, e, s);
  const n = N[k];
  if (n < 2) return null;
  const m = SUMR[k] / n;
  const sd = Math.sqrt(Math.max(0, (SUMR2[k] - n * m * m) / (n - 1)));
  return {
    v, e, s, n, huecos: HUE[k],
    media: m, sd, t: (m * Math.sqrt(n)) / (sd || Infinity),
    aciertos: WIN[k] / n,
    dolTot: SUMD[k], dolOp: SUMD[k] / n, dolAno: SUMD[k] / ANOS_MUESTRA,
    coste: SUMC[k] / n, horq: SUMH[k] / n,
    anos: ANOS.map((_, i) => (NA[k * ANOS.length + i] > 1 ? RA[k * ANOS.length + i] / NA[k * ANOS.length + i] : NaN)),
    nAnos: ANOS.map((_, i) => NA[k * ANOS.length + i]),
    m1: NM[k * 2] > 1 ? RM[k * 2] / NM[k * 2] : NaN,
    m2: NM[k * 2 + 1] > 1 ? RM[k * 2 + 1] / NM[k * 2 + 1] : NaN,
    t1: NT[k * 3] > 1 ? RT[k * 3] / NT[k * 3] : NaN,
    t2: NT[k * 3 + 1] > 1 ? RT[k * 3 + 1] / NT[k * 3 + 1] : NaN,
    t3: NT[k * 3 + 2] > 1 ? RT[k * 3 + 2] / NT[k * 3 + 2] : NaN,
  };
}

const todas = [];
for (let v = 0; v < NV; v++) for (let e = 0; e < NH - 1; e++) for (let s = e + 1; s < NH; s++) {
  const c = celda(v, e, s);
  if (c) todas.push(c);
}
const p2 = (x) => (x * 100).toFixed(2).replace(".", ",");
const fila = (c) => `${VAR[c.v].id}  ${HORAS[c.e]}→${HORAS[c.s]}  n=${String(c.n).padStart(4)}  media ${p2(c.media).padStart(7)}%  t=${c.t.toFixed(2).padStart(6)}  acierta ${p2(c.aciertos)}%  $/op ${c.dolOp.toFixed(0).padStart(5)}  $/año ${Math.round(c.dolAno).toLocaleString("es-ES").padStart(9)}  coste $${c.coste.toFixed(1)}  horq ${p2(c.horq)}%`;

// ═══ EL MAPA: cuántas parejas son positivas ═════════════════════════════════════════════════
console.log("═══ ¿CUÁNTAS PAREJAS DE HORAS SALEN POSITIVAS? ═══════════════════════");
console.log("contrato   parejas   positivas   con t>2   media global   $/año medio   peor pareja $/año");
for (let v = 0; v < NV; v++) {
  const g = todas.filter((c) => c.v === v);
  const pos = g.filter((c) => c.media > 0).length;
  const fuertes = g.filter((c) => c.t > 2).length;
  const mg = g.reduce((a, c) => a + c.media, 0) / g.length;
  const dg = g.reduce((a, c) => a + c.dolAno, 0) / g.length;
  const peor = Math.min(...g.map((c) => c.dolAno));
  console.log(
    `${VAR[v].id.padEnd(9)} ${String(g.length).padStart(7)} ${(pos + " (" + ((100 * pos) / g.length).toFixed(1) + "%)").padStart(15)} ${String(fuertes).padStart(8)} ${(p2(mg) + "%").padStart(14)} ${Math.round(dg).toLocaleString("es-ES").padStart(13)} ${Math.round(peor).toLocaleString("es-ES").padStart(18)}`
  );
}
console.log("");

// ═══ LAS 15 MEJORES Y LAS 15 PEORES ═════════════════════════════════════════════════════════
const orden = todas.slice().sort((a, b) => b.media - a.media);
console.log("═══ LAS 15 PAREJAS DE HORAS MEJORES (de las 12.780) ═══════════════════");
orden.slice(0, 15).forEach((c, i) => console.log(`${String(i + 1).padStart(2)}. ${fila(c)}`));
console.log("");
console.log("═══ LAS 15 PAREJAS DE HORAS PEORES ════════════════════════════════════");
orden.slice(-15).reverse().forEach((c, i) => console.log(`${String(i + 1).padStart(2)}. ${fila(c)}`));
console.log("");

// ═══ AÑO A AÑO Y CORTES DEL TIEMPO DE LAS MEJORES ═══════════════════════════════════════════
console.log("═══ LAS 10 MEJORES, AÑO A AÑO Y POR CORTES ════════════════════════════");
console.log("(un año negativo entre positivos ya avisa de que la pareja no es estable)");
for (const c of orden.slice(0, 10)) {
  console.log(fila(c));
  console.log(`      años:  ${ANOS.map((a, i) => `${a} ${Number.isNaN(c.anos[i]) ? "  s/d" : (p2(c.anos[i]) + "%").padStart(8)} (n=${c.nAnos[i]})`).join("  ")}`);
  console.log(`      mitades: ${p2(c.m1)}% / ${p2(c.m2)}%      tercios: ${p2(c.t1)}% / ${p2(c.t2)}% / ${p2(c.t3)}%`);
}
console.log("");

// ═══ LA MEJOR QUE ADEMÁS SOBREVIVE A LOS CORTES ═════════════════════════════════════════════
console.log("═══ ¿ALGUNA PAREJA SOBREVIVE A LOS CORTES DEL TIEMPO? ═════════════════");
console.log("filtro: media>0, n>=800, las DOS mitades positivas y los TRES tercios positivos");
const supervivientes = todas.filter(
  (c) => c.media > 0 && c.n >= 800 && c.m1 > 0 && c.m2 > 0 && c.t1 > 0 && c.t2 > 0 && c.t3 > 0
).sort((a, b) => b.media - a.media);
console.log(`sobreviven ${supervivientes.length} de ${todas.filter((c) => c.n >= 800).length} parejas con n>=800`);
for (const c of supervivientes.slice(0, 15)) {
  console.log(fila(c));
  console.log(`      años:  ${ANOS.map((a, i) => `${a} ${Number.isNaN(c.anos[i]) ? "  s/d" : (p2(c.anos[i]) + "%").padStart(8)}`).join("  ")}`);
  console.log(`      mitades: ${p2(c.m1)}% / ${p2(c.m2)}%      tercios: ${p2(c.t1)}% / ${p2(c.t2)}% / ${p2(c.t3)}%`);
}
console.log("");

// ═══ EL AGUJERO: cuánto cuesta comprar 0DTE a ciegas ════════════════════════════════════════
console.log("═══ EL AGUJERO — cuánto cuesta comprar a ciegas, por hora de ENTRADA ══");
console.log("(salida fija a las 15:30; un contrato; todos los días de la muestra)");
console.log("hora    C_ATM %/op    C_ATM $/año      C_+10 %/op    C_+10 $/año     P_ATM %/op    P_ATM $/año");
for (let e = 0; e < NH - 1; e += 6) {
  const s = NH - 1;
  const a = celda(0, e, s), b = celda(1, e, s), c = celda(2, e, s);
  console.log(
    `${HORAS[e]}  ${(p2(a.media) + "%").padStart(11)} ${Math.round(a.dolAno).toLocaleString("es-ES").padStart(14)}   ${(p2(b.media) + "%").padStart(12)} ${Math.round(b.dolAno).toLocaleString("es-ES").padStart(14)}  ${(p2(c.media) + "%").padStart(13)} ${Math.round(c.dolAno).toLocaleString("es-ES").padStart(14)}`
  );
}
console.log("");

// ═══ EL AGUJERO POR DURACIÓN DE LA OPERACIÓN ════════════════════════════════════════════════
console.log("═══ EL AGUJERO POR DURACIÓN — media de TODAS las entradas ═════════════");
console.log("dura.   C_ATM        C_+10        P_ATM        P_-10        P_+10      (media %/op)");
for (const dur of [1, 2, 3, 6, 12, 24, 36, 48, 60, 71]) {
  const linea = [];
  for (let v = 0; v < NV; v++) {
    const g = todas.filter((c) => c.v === v && c.s - c.e === dur);
    const m = g.length ? g.reduce((a, c) => a + c.media, 0) / g.length : NaN;
    linea.push((p2(m) + "%").padStart(11));
  }
  console.log(`${String(dur * 5).padStart(3)}min ${linea.join("  ")}`);
}
console.log("");

// ═══ CONTROL DE SIMETRÍA ════════════════════════════════════════════════════════════════════
console.log("═══ CONTROL DE SIMETRÍA — call contra put, misma hora ═════════════════");
const mediaVar = (v) => { const g = todas.filter((c) => c.v === v); return g.reduce((a, c) => a + c.media, 0) / g.length; };
console.log(`media de las 2.556 parejas:  C_ATM ${p2(mediaVar(0))}%   P_ATM ${p2(mediaVar(2))}%   C_+10 ${p2(mediaVar(1))}%   P_-10 ${p2(mediaVar(3))}%   P_+10 ${p2(mediaVar(4))}%`);
console.log("si las dos direcciones pierden lo mismo, lo que se está pagando es el paso del tiempo, no la dirección.");
console.log("");

// ═══ LA HORA DE EDUARDO ═════════════════════════════════════════════════════════════════════
console.log("═══ LA VENTANA DE EDUARDO (entra 09:55-10:05, sale 11:20-12:00) ═══════");
console.log("sin ninguna señal, esas mismas horas sobre los 1.123 días:");
for (const [he, hs] of [["09:55", "11:35"], ["10:00", "11:55"], ["10:05", "11:55"], ["10:00", "12:00"], ["09:55", "11:20"]]) {
  const e = HORAS.indexOf(he), s = HORAS.indexOf(hs);
  for (const v of [0, 1]) {
    const c = celda(v, e, s);
    if (c) console.log("  " + fila(c) + `   mitades ${p2(c.m1)}%/${p2(c.m2)}%`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// SEGUNDA PASADA — LA AUTOPSIA DE LAS «MEJORES»
//
// Las medias de arriba salen de 1.123 números muy torcidos: una call fuera del dinero acierta
// una de cada tres veces y cuando acierta multiplica. Una media positiva puede ser el resultado
// de DIEZ días buenos entre mil. Así que aquí se guardan los 1.123 retornos de las parejas
// candidatas y se miran de cerca: mediana, qué pasa al quitar los mejores días, y el dinero
// año a año. Sin esto, el número de arriba no se puede publicar.
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n\n═══ AUTOPSIA DE LAS CANDIDATAS ════════════════════════════════════════");

const CAND = [
  ["C_+10", "09:45", "15:20"],
  ["C_+10", "09:45", "15:25"],
  ["C_ATM", "09:45", "15:20"],
  ["C_ATM", "09:35", "15:30"],
  ["C_+10", "10:05", "11:55"],   // la ventana de Eduardo
];
const serie = new Map(CAND.map((c) => [c.join(" "), []]));

for (let d = 0; d < dias.length; d++) {
  const D = cargarDia(dias[d]);
  if (!D) continue;
  const porHora = new Map();
  for (let i = 0; i < D.barras.length; i++) porHora.set(D.barras[i].t, i);
  for (const c of CAND) {
    const [id, he, hs] = c;
    const vv = VAR.findIndex((x) => x.id === id);
    const pe = porHora.get(he), ps = porHora.get(hs);
    if (pe === undefined || ps === undefined) continue;
    const be = D.barras[pe];
    const K = rejilla(be.spot) + VAR[vv].off;
    const op = operar(D, pe, ps, K, VAR[vv].lado);
    if (op) serie.get(c.join(" ")).push({ dia: dias[d], ret: op.ret, dol: op.dolares });
  }
}

for (const c of CAND) {
  const clave = c.join(" ");
  const v = serie.get(clave);
  const rets = v.map((x) => x.ret).sort((a, b) => a - b);
  const dols = v.map((x) => x.dol);
  const suma = dols.reduce((a, b) => a + b, 0);
  const orden2 = v.slice().sort((a, b) => b.dol - a.dol);
  const sinTop = (k) => (suma - orden2.slice(0, k).reduce((a, x) => a + x.dol, 0)) / ANOS_MUESTRA;
  const porAno = {};
  for (const x of v) { const a = x.dia.slice(0, 4); porAno[a] = (porAno[a] || 0) + x.dol; }
  console.log(`\n── ${clave}   n=${v.length}`);
  console.log(`   mediana del retorno: ${p2(rets[Math.floor(rets.length / 2)])}%   ·   media: ${p2(rets.reduce((a, b) => a + b, 0) / rets.length)}%`);
  console.log(`   días que pierden TODO (retorno −100%): ${rets.filter((x) => x <= -0.999).length}  (${((100 * rets.filter((x) => x <= -0.999).length) / rets.length).toFixed(1)}%)`);
  console.log(`   $/año con todos los días ........ ${Math.round(suma / ANOS_MUESTRA).toLocaleString("es-ES")}`);
  console.log(`   $/año quitando el MEJOR día ..... ${Math.round(sinTop(1)).toLocaleString("es-ES")}`);
  console.log(`   $/año quitando los 5 mejores .... ${Math.round(sinTop(5)).toLocaleString("es-ES")}`);
  console.log(`   $/año quitando los 10 mejores ... ${Math.round(sinTop(10)).toLocaleString("es-ES")}`);
  console.log(`   $/año quitando los 25 mejores ... ${Math.round(sinTop(25)).toLocaleString("es-ES")}`);
  console.log(`   los 5 mejores días: ${orden2.slice(0, 5).map((x) => `${x.dia} $${Math.round(x.dol)}`).join(" · ")}`);
  console.log(`   dinero por año: ${Object.entries(porAno).map(([a, s]) => `${a} ${Math.round(s).toLocaleString("es-ES")}`).join("  ·  ")}`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// TERCERA PASADA — LOS CONTROLES QUE FALTAN
//
//  · EL BARAJADO. En esta familia no hay señal que barajar, pero sí hay UNA cosa que la regla
//    lee del día: el precio del SPX a las 09:45, que es lo que fija el strike. Se baraja ESO:
//    se compra el strike que habría sido «ATM+10» hace 37 días de mercado, pero con la cadena
//    y los precios de HOY. Si el resultado aguanta, el anclaje al precio de hoy no aporta nada.
//  · EL LADO CONTRARIO: la misma pareja de horas comprando la put espejo.
//  · EL TAMAÑO DEL AGUJERO: la mediana de las 12.780 parejas, en dólares al año.
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n\n═══ CONTROLES FINALES ═════════════════════════════════════════════════");

const eB = HORAS.indexOf("09:45"), sB = HORAS.indexOf("15:20");
const cBest = celda(1, eB, sB);                       // C_+10 09:45→15:20
const cEspejo = celda(3, eB, sB);                     // P_-10 09:45→15:20 (el espejo)
const cATM = celda(0, eB, sB);
console.log(`REGLA      C_+10 09:45→15:20 : media ${p2(cBest.media)}%  t=${cBest.t.toFixed(2)}  n=${cBest.n}  $/año ${Math.round(cBest.dolAno).toLocaleString("es-ES")}`);
console.log(`SIMETRÍA   P_-10 09:45→15:20 : media ${p2(cEspejo.media)}%  t=${cEspejo.t.toFixed(2)}  n=${cEspejo.n}  $/año ${Math.round(cEspejo.dolAno).toLocaleString("es-ES")}`);
console.log(`(la misma hora, el lado contrario — si las dos ganan, es volatilidad, no dirección)`);

// ── el barajado del strike ──────────────────────────────────────────────────────────────────
const DESPL = 37;
let nB = 0, sumB = 0, sum2B = 0, dolB = 0, hueB = 0;
// PRIMERA VUELTA: sólo el precio de las 09:45 de cada día. Los días NO se guardan en memoria
// (los 1.123 juntos son 4 GB y el proceso muere; se vuelven a leer del disco en la segunda).
const spot945 = [];
for (let d = 0; d < dias.length; d++) {
  const D = cargarDia(dias[d]);
  if (!D) { spot945.push(null); continue; }
  const b = D.barras.find((x) => x.t === "09:45");
  spot945.push(b ? b.spot : null);
}
// SEGUNDA VUELTA: operar con el strike del día desplazado
let distTot = 0, distN = 0;
for (let d = 0; d < dias.length; d++) {
  const otro = spot945[(d + DESPL) % dias.length];
  if (otro == null || spot945[d] == null) continue;
  distTot += Math.abs(otro - spot945[d]); distN++;
  const D = cargarDia(dias[d]);
  if (!D) continue;
  const pe = D.barras.findIndex((x) => x.t === "09:45");
  const ps = D.barras.findIndex((x) => x.t === "15:20");
  if (pe < 0 || ps < 0) continue;
  const K = rejilla(otro) + 10;                       // strike de OTRO día, precios de HOY
  const op = operar(D, pe, ps, K, "C");
  if (!op) { hueB++; continue; }
  nB++; sumB += op.ret; sum2B += op.ret * op.ret; dolB += op.dolares;
}
const mB = sumB / nB, sdB = Math.sqrt((sum2B - nB * mB * mB) / (nB - 1));
console.log(`BARAJADO   strike de otro día : media ${p2(mB)}%  t=${((mB * Math.sqrt(nB)) / sdB).toFixed(2)}  n=${nB}  huecos=${hueB}  $/año ${Math.round(dolB / ANOS_MUESTRA).toLocaleString("es-ES")}`);
console.log(`(el strike barajado queda a ${Math.round(distTot / distN)} puntos de media del precio de hoy — deja de ser una opción cercana)`);

// ── el tamaño del agujero ───────────────────────────────────────────────────────────────────
const dAno = todas.map((c) => c.dolAno).sort((a, b) => a - b);
const rMed = todas.map((c) => c.media).sort((a, b) => a - b);
const med = (v) => v[Math.floor(v.length / 2)];
console.log(`\nEL AGUJERO sobre las 12.780 parejas de horas (un contrato):`);
console.log(`   mediana del retorno por operación: ${p2(med(rMed))}%   ·   media: ${p2(rMed.reduce((a, b) => a + b, 0) / rMed.length)}%`);
console.log(`   mediana del dinero al año: ${Math.round(med(dAno)).toLocaleString("es-ES")}   ·   media: ${Math.round(dAno.reduce((a, b) => a + b, 0) / dAno.length).toLocaleString("es-ES")}`);
console.log(`   sólo CALLS (5.112 parejas): mediana ${Math.round(med(todas.filter((c) => c.v < 2).map((c) => c.dolAno).sort((a, b) => a - b))).toLocaleString("es-ES")} $/año`);
console.log(`   parejas con t>2 en TODA la rejilla: ${todas.filter((c) => c.t > 2).length} de ${todas.length}`);
console.log(`   parejas con t<-2 en TODA la rejilla: ${todas.filter((c) => c.t < -2).length} de ${todas.length}`);
