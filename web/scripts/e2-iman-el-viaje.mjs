// ═══ EL IMÁN COMO VIAJE, NO COMO DESTINO ═══════════════════════════════════════════════════
//
// QUÉ MIDE ESTO, EN CASTELLANO LLANO
//
// El proyecto ya probó dos veces que el precio NO CIERRA en el strike donde hay más contratos
// abiertos: el "muro" atrae al cierre menos que una raya pintada al azar. Eso está cerrado.
//
// Pero nadie preguntó otra cosa: ¿el precio VIAJA hacia ese strike DURANTE la sesión y luego
// se vuelve? Quien aguanta hasta el cierre no cobraría nada de ese viaje; quien entra por la
// mañana y sale a mediodía sí lo cobraría. Esa pregunta estaba virgen.
//
// Aquí se mide en dos planos, y el primero es tan importante como el segundo:
//
//   1) EL HECHO FÍSICO — ¿se acerca el precio al imán más que a una raya puesta a la MISMA
//      distancia pero al otro lado (espejo), y más que al imán de OTRO día (barajado)?
//      Si el viaje no existe, no hay estrategia que valga y sobra todo lo demás.
//
//   2) EL DINERO — comprar la opción (call si el imán está arriba, put si está abajo) por la
//      mañana y venderla en el viaje. Con bid/ask REALES: se compra al ask y se vende al bid,
//      siempre, sin excepción, porque el peaje de la horquilla es lo que ha matado casi todo
//      lo que este proyecto ha probado.
//
// EL IMÁN: de los contratos abiertos del ARRANQUE del día (compensación de la noche anterior,
// así que mirarlo a las 09:35 no es mirar al futuro), el strike con más contratos totales
// (calls + puts) que esté a menos de 60 puntos del precio de apertura.
//
// LOS CONTROLES (sin ellos el número no vale nada):
//   · TONTO      — la misma compra y la misma salida, pero comprando siempre lo mismo (call
//                  al dinero todos los días, y put al dinero todos los días).
//   · BARAJADO   — la misma regla con el imán de OTRO día (desplazamiento fijo de 37 días,
//                  aplicado como distancia con signo sobre el precio de HOY).
//   · CONTRARIO  — la misma regla comprando el lado opuesto. Si las dos "funcionan", lo que
//                  hay es volatilidad, no dirección.
//   · MITADES Y TERCIOS — partido por el tiempo. Si una mitad es negativa, se dice.
//
// NOTA de honestidad: la primera barra con precio del SPX es la de 09:35 (la de 09:30 trae el
// subyacente a 0 y el banco la descarta), así que "apertura" aquí es 09:35.

import {
  diasDisponibles, cargarDia, operar, idxHora, rejilla,
  compraEn, ventaEn, resumen, DIR_CADENA, DIR_OI,
} from "./lib0dte.mjs";
import { readFileSync, existsSync, openSync, readSync, closeSync } from "node:fs";
import { join } from "node:path";

const VENTANA_IMAN = 60;     // puntos alrededor de la apertura donde se busca el imán
const DESPLAZ = 37;          // días de desplazamiento para el control barajado

// ───────────────────────────────────────────────────────────────────────────────────────────
// FASE A — la señal de cada día, leyendo sólo el OI y el precio de apertura (rápido)
// ───────────────────────────────────────────────────────────────────────────────────────────

/** Precio del SPX en la barra de 09:35, sin parsear el CSV entero. */
function spotApertura(dia) {
  const ruta = join(DIR_CADENA, `iv_${dia}_C.csv`);
  if (!existsSync(ruta)) return null;
  const fd = openSync(ruta, "r");
  const buf = Buffer.alloc(8192);
  const n = readSync(fd, buf, 0, 8192, 0);
  closeSync(fd);
  const lineas = buf.slice(0, n).toString("utf8").split("\n");
  const cab = lineas[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iTs = cab.indexOf("timestamp"), iUp = cab.indexOf("underlying_price");
  if (iTs < 0 || iUp < 0) throw new Error("cabecera inesperada en " + dia);
  for (let k = 1; k < lineas.length - 1; k++) {
    const c = lineas[k].split(",");
    if (c.length <= iUp) continue;
    if (c[iTs].slice(11, 16) === "09:35" && +c[iUp] > 0) return +c[iUp];
  }
  return null;
}

const dias = diasDisponibles();
const senal = [];
let sinOI = 0, sinSpot = 0, sinIman = 0;

for (const d of dias) {
  const ro = join(DIR_OI, d + ".json");
  if (!existsSync(ro)) { sinOI++; continue; }
  let oi;
  try { oi = JSON.parse(readFileSync(ro, "utf8")); } catch { sinOI++; continue; }
  const spot0 = spotApertura(d);
  if (!(spot0 > 0)) { sinSpot++; continue; }
  const tot = new Map();
  for (const k of Object.keys(oi)) {
    const K = +k.split("|")[0];
    if (!(K > 0)) continue;
    tot.set(K, (tot.get(K) || 0) + oi[k]);
  }
  let iman = null, mejor = -1;
  for (const [K, v] of tot) {
    if (Math.abs(K - spot0) <= VENTANA_IMAN && v > mejor) { mejor = v; iman = K; }
  }
  if (iman == null) { sinIman++; continue; }
  senal.push({
    dia: d, spot0, iman, oiIman: mejor,
    d0: Math.abs(iman - spot0), lado: iman > spot0 ? "C" : "P",
  });
}

const N = senal.length;
console.log("== SENAL ==============================================");
console.log("dias con cadena: " + dias.length + "  ·  sin OI: " + sinOI + "  ·  sin spot: " + sinSpot + "  ·  sin iman: " + sinIman);
console.log("dias con senal: " + N + "   (" + senal[0].dia + " -> " + senal.at(-1).dia + ")");
{
  const ds = senal.map((s) => s.d0).sort((a, b) => a - b);
  const arriba = senal.filter((s) => s.lado === "C").length;
  console.log("distancia al iman: min " + ds[0].toFixed(1) + "  mediana " + ds[Math.floor(N / 2)].toFixed(1) + "  max " + ds.at(-1).toFixed(1));
  console.log("iman ARRIBA (compra calls): " + arriba + "  ·  ABAJO (compra puts): " + (N - arriba));
}

// controles de señal: barajado (distancia con signo de otro día) y espejo (misma distancia, otro lado)
for (let i = 0; i < N; i++) {
  const s = senal[i];
  const otro = senal[(i + DESPLAZ) % N];
  const off = otro.iman - otro.spot0;
  s.imanBaraj = rejilla(s.spot0 + off);
  s.ladoBaraj = s.imanBaraj > s.spot0 ? "C" : "P";
  s.imanEspejo = rejilla(s.spot0 - (s.iman - s.spot0));
  s.ladoEspejo = s.imanEspejo > s.spot0 ? "C" : "P";
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// LA REJILLA DE REGLAS
// ───────────────────────────────────────────────────────────────────────────────────────────

const HORAS = ["09:35", "09:45", "09:55", "10:05", "10:15", "10:30", "10:45", "11:00"];
const UMBRALES = [10, 15, 20, 25, 30, 40];
const ENTRADAS = [
  ...HORAS.map((h) => ({ id: "h" + h, tipo: "hora", h })),
  ...UMBRALES.map((u) => ({ id: "u" + u, tipo: "umbral", u })),
];
const STRIKES = ["iman", "atm", "medio"];
const SALIDAS = [
  { id: "+30m", tipo: "t", k: 6 },
  { id: "+60m", tipo: "t", k: 12 },
  { id: "+90m", tipo: "t", k: 18 },
  { id: "+120m", tipo: "t", k: 24 },
  { id: "cierre", tipo: "cierre" },
  { id: "toca", tipo: "toca" },
  { id: "obj25", tipo: "obj", p: 0.25, tope: null },
  { id: "obj50", tipo: "obj", p: 0.50, tope: null },
  { id: "obj25_60m", tipo: "obj", p: 0.25, tope: 12 },
];

const acc = new Map();
function apunta(clave, i, op) {
  let a = acc.get(clave);
  if (!a) { a = { idx: [], ret: [], usd: [], coste: [], hq: [], huecos: 0 }; acc.set(clave, a); }
  if (op == null) { a.huecos++; return; }
  a.idx.push(i); a.ret.push(op.ret); a.usd.push(op.dolares);
  a.coste.push(op.coste); a.hq.push(op.horquillaPct);
}

/** Primera barra >= 1 en que el precio se ha alejado del imán al menos U puntos (sin cruzarlo). */
function barraUmbral(barras, iman, lado, u, iTope) {
  for (let i = 1; i <= iTope; i++) {
    const dist = lado === "C" ? iman - barras[i].spot : barras[i].spot - iman;
    if (dist >= u) return i;
  }
  return -1;
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// FASE B — una sola pasada por los días, evaluando todo
// ───────────────────────────────────────────────────────────────────────────────────────────

const fis = [];
let diasCargados = 0, diasNulos = 0;
const t0 = Date.now();

for (let i = 0; i < N; i++) {
  const s = senal[i];
  const dd = cargarDia(s.dia);
  if (!dd) { diasNulos++; continue; }
  diasCargados++;
  const B = dd.barras, ult = B.length - 1;
  const spots = B.map((b) => b.spot);

  // ── 1) EL HECHO FÍSICO ──────────────────────────────────────────────────────────────────
  const fisUno = (iman) => {
    const d0 = Math.abs(iman - s.spot0);
    let dmin = Infinity;
    for (let j = 0; j <= ult; j++) {
      const d = Math.abs(spots[j] - iman);
      if (d < dmin) dmin = d;
    }
    return {
      d0, dmin,
      cerrado: d0 > 0 ? (d0 - dmin) / d0 : 0,
      toca5: dmin <= 5 ? 1 : 0,
      toca10: dmin <= 10 ? 1 : 0,
      dCierre: Math.abs(spots[ult] - iman),
    };
  };
  fis.push({ i, dia: s.dia, real: fisUno(s.iman), baraj: fisUno(s.imanBaraj), espejo: fisUno(s.imanEspejo) });

  // ── 2) EL DINERO ────────────────────────────────────────────────────────────────────────
  const i13 = idxHora(dd, "13:00");
  const iTope13 = i13 < 0 ? Math.min(42, ult) : i13;

  const brazos = [
    { id: "real", iman: s.iman, lado: s.lado, strikes: STRIKES, entradaDe: "propia" },
    { id: "baraj", iman: s.imanBaraj, lado: s.ladoBaraj, strikes: STRIKES, entradaDe: "propia" },
    { id: "contra", iman: s.iman, lado: s.lado === "C" ? "P" : "C", strikes: STRIKES, entradaDe: "real" },
    { id: "tontoC", iman: s.iman, lado: "C", strikes: ["atm"], entradaDe: "real" },
    { id: "tontoP", iman: s.iman, lado: "P", strikes: ["atm"], entradaDe: "real" },
  ];

  for (const br of brazos) {
    for (const ent of ENTRADAS) {
      let e;
      if (ent.tipo === "hora") e = idxHora(dd, ent.h);
      else {
        const imanE = br.entradaDe === "real" ? s.iman : br.iman;
        const ladoE = br.entradaDe === "real" ? s.lado : br.lado;
        e = barraUmbral(B, imanE, ladoE, ent.u, iTope13);
      }
      if (e < 0 || e >= ult) continue;

      let jToca = -1;
      for (let j = e + 1; j <= ult; j++) if (Math.abs(spots[j] - br.iman) <= 5) { jToca = j; break; }

      for (const stk of br.strikes) {
        let K;
        if (stk === "iman") K = br.iman;
        else if (stk === "atm") K = rejilla(B[e].spot);
        else K = rejilla((B[e].spot + br.iman) / 2);

        const coste = compraEn(B[e], K, br.lado);
        if (coste == null || !(coste > 0)) {
          for (const sal of SALIDAS) apunta(br.id + "|" + ent.id + "|" + stk + "|" + sal.id, i, null);
          continue;
        }
        for (const sal of SALIDAS) {
          let j;
          if (sal.tipo === "t") j = Math.min(e + sal.k, ult);
          else if (sal.tipo === "cierre") j = ult;
          else if (sal.tipo === "toca") j = jToca >= 0 ? jToca : ult;
          else {
            const lim = sal.tope == null ? ult : Math.min(e + sal.tope, ult);
            j = lim;
            for (let q = e + 1; q <= lim; q++) {
              const bid = ventaEn(B[q], K, br.lado);
              if (bid != null && (bid - coste) / coste >= sal.p) { j = q; break; }
            }
          }
          apunta(br.id + "|" + ent.id + "|" + stk + "|" + sal.id, i, operar(dd, e, j, K, br.lado));
        }
      }
    }
  }
}
console.log("\ndias cargados: " + diasCargados + "  ·  nulos/truncados: " + diasNulos + "  ·  " + ((Date.now() - t0) / 1000).toFixed(0) + " s");

// ───────────────────────────────────────────────────────────────────────────────────────────
// EL HECHO FÍSICO — resultados
// ───────────────────────────────────────────────────────────────────────────────────────────
const med = (v) => v.reduce((a, b) => a + b, 0) / v.length;
console.log("\n== EXISTE EL VIAJE? (n=" + fis.length + " dias) ================");
console.log("                        real     barajado   espejo");
const filaF = (nom, f) => {
  const r = f(fis.map((x) => x.real)), b = f(fis.map((x) => x.baraj)), e = f(fis.map((x) => x.espejo));
  console.log(nom.padEnd(22) + " " + String(r).padStart(8) + " " + String(b).padStart(10) + " " + String(e).padStart(8));
};
filaF("distancia apertura", (v) => med(v.map((x) => x.d0)).toFixed(1));
filaF("distancia minima", (v) => med(v.map((x) => x.dmin)).toFixed(1));
filaF("% del hueco cerrado", (v) => (100 * med(v.map((x) => x.cerrado))).toFixed(1) + "%");
filaF("toca (+-5 pts)", (v) => (100 * med(v.map((x) => x.toca5))).toFixed(1) + "%");
filaF("toca (+-10 pts)", (v) => (100 * med(v.map((x) => x.toca10))).toFixed(1) + "%");
filaF("distancia al cierre", (v) => med(v.map((x) => x.dCierre)).toFixed(1));

console.log("\ntoca +-5 por tercios (real / barajado / espejo):");
for (let k = 0; k < 3; k++) {
  const g = fis.filter((_, q) => Math.floor((3 * q) / fis.length) === k);
  console.log("  " + g[0].dia + " -> " + g.at(-1).dia + "   " +
    (100 * med(g.map((x) => x.real.toca5))).toFixed(1) + "%   " +
    (100 * med(g.map((x) => x.baraj.toca5))).toFixed(1) + "%   " +
    (100 * med(g.map((x) => x.espejo.toca5))).toFixed(1) + "%");
}
// LA PRUEBA PAREADA: el espejo está a la MISMA distancia exacta que el imán, sólo que al otro
// lado. Es la comparación limpia: mismo día, misma distancia, la única diferencia es que en uno
// hay contratos abiertos y en el otro no. Se compara día a día, no promedio contra promedio.
{
  const dToca = fis.map((x) => x.real.toca5 - x.espejo.toca5);
  const dCerr = fis.map((x) => x.real.cerrado - x.espejo.cerrado);
  const dTocaB = fis.map((x) => x.real.toca5 - x.baraj.toca5);
  const a = resumen(dToca), b = resumen(dCerr), c = resumen(dTocaB);
  console.log("\nPAREADO real - espejo (misma distancia, otro lado):");
  console.log("  toca+-5:      " + (100 * a.media).toFixed(2) + " pts porcentuales   t=" + a.t.toFixed(2) + "  (n=" + a.n + ")");
  console.log("  hueco cerrado " + (100 * b.media).toFixed(2) + " pts porcentuales   t=" + b.t.toFixed(2));
  console.log("PAREADO real - barajado: toca+-5 " + (100 * c.media).toFixed(2) + " pts  t=" + c.t.toFixed(2));
}

// ¿Y si el imán tiene que ser MUY gordo? Quintiles por cuántos contratos tiene el imán.
{
  const conOI = fis.map((x) => ({ ...x, oi: senal[x.i].oiIman })).sort((p, q) => p.oi - q.oi);
  console.log("\ntoca+-5 por tamano del iman (quintiles de contratos abiertos en el strike):");
  for (let k = 0; k < 5; k++) {
    const g = conOI.slice(Math.floor((k * conOI.length) / 5), Math.floor(((k + 1) * conOI.length) / 5));
    const dif = resumen(g.map((x) => x.real.toca5 - x.espejo.toca5));
    console.log("  OI " + String(Math.round(g[0].oi)).padStart(6) + "-" + String(Math.round(g.at(-1).oi)).padStart(6) +
      "  n=" + g.length + "  real " + (100 * med(g.map((x) => x.real.toca5))).toFixed(1) + "%  espejo " +
      (100 * med(g.map((x) => x.espejo.toca5))).toFixed(1) + "%  dif " + (100 * dif.media).toFixed(1) + " pts (t=" + dif.t.toFixed(2) + ")");
  }
}

console.log("\n% hueco cerrado por distancia de apertura:");
for (const [lo, hi] of [[0, 10], [10, 20], [20, 30], [30, 45], [45, 61]]) {
  const g = fis.filter((x) => x.real.d0 >= lo && x.real.d0 < hi);
  const gb = fis.filter((x) => x.baraj.d0 >= lo && x.baraj.d0 < hi);
  if (!g.length || !gb.length) continue;
  console.log("  " + lo + "-" + hi + " pts  real n=" + String(g.length).padStart(4) +
    "  cerrado " + (100 * med(g.map((x) => x.real.cerrado))).toFixed(1) + "%  toca5 " + (100 * med(g.map((x) => x.real.toca5))).toFixed(1) + "%" +
    "   |  barajado n=" + String(gb.length).padStart(4) +
    "  cerrado " + (100 * med(gb.map((x) => x.baraj.cerrado))).toFixed(1) + "%  toca5 " + (100 * med(gb.map((x) => x.baraj.toca5))).toFixed(1) + "%");
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// EL DINERO — tabla de variantes
// ───────────────────────────────────────────────────────────────────────────────────────────
const ANIOS = (new Date(senal.at(-1).dia) - new Date(senal[0].dia)) / (365.25 * 24 * 3600e3);
const filas = [];
for (const [clave, a] of acc) {
  if (a.ret.length < 200) continue;
  const [arm, ent, stk, sal] = clave.split("|");
  const r = resumen(a.ret), u = resumen(a.usd);
  filas.push({
    clave, arm, ent, stk, sal, n: r.n, media: r.media, t: r.t, aciertos: r.aciertos,
    usd: u.media, anual: (u.media * r.n) / ANIOS, huecos: a.huecos,
    costeMed: med(a.coste), costeMin: Math.min(...a.coste), costeMax: Math.max(...a.coste), hq: med(a.hq),
  });
}
const reales = filas.filter((f) => f.arm === "real").sort((a, b) => b.t - a.t);

console.log("\n== VALIDACION DE COSTES (brazo real) ==================");
for (const cl of ["real|h10:05|iman|cierre", "real|h10:05|atm|cierre", "real|h09:35|iman|+60m"]) {
  const f = filas.find((x) => x.clave === cl);
  if (!f) { console.log("  " + cl + ": sin fila"); continue; }
  console.log("  " + cl.padEnd(26) + " n=" + f.n + "  coste medio $" + f.costeMed.toFixed(2) +
    "  rango $" + f.costeMin.toFixed(2) + "-$" + f.costeMax.toFixed(2) + "  horquilla media " + (100 * f.hq).toFixed(1) + "%");
}

console.log("\n== LAS 15 MEJORES DEL BRAZO REAL (de " + reales.length + " variantes) ==");
console.log("entrada  strike salida         n   media%      t  acierto    $/op    $/ano  huecos");
for (const f of reales.slice(0, 15)) {
  console.log(f.ent.padEnd(8) + " " + f.stk.padEnd(6) + " " + f.sal.padEnd(10) +
    String(f.n).padStart(5) + " " + (100 * f.media).toFixed(1).padStart(8) + " " + f.t.toFixed(2).padStart(6) + " " +
    (100 * f.aciertos).toFixed(0).padStart(6) + "% " + f.usd.toFixed(0).padStart(7) + " " + f.anual.toFixed(0).padStart(8) + " " + String(f.huecos).padStart(6));
}
console.log("\n== LAS 5 PEORES ==");
for (const f of reales.slice(-5)) {
  console.log(f.ent.padEnd(8) + " " + f.stk.padEnd(6) + " " + f.sal.padEnd(10) +
    String(f.n).padStart(5) + " " + (100 * f.media).toFixed(1).padStart(8) + " " + f.t.toFixed(2).padStart(6));
}

// ── EL CRUCE COMPLETO DE LA MEJOR ─────────────────────────────────────────────────────────
const trozo = (a, lo, hi) => {
  const v = [], w = [];
  for (let q = 0; q < a.idx.length; q++) if (a.idx[q] >= lo && a.idx[q] < hi) { v.push(a.ret[q]); w.push(a.usd[q]); }
  return { r: resumen(v), u: resumen(w) };
};
const mejor = reales[0];
const A = acc.get(mejor.clave);
console.log("\n===== LA MEJOR: " + mejor.clave + " =====");
console.log("n=" + mejor.n + "  media " + (100 * mejor.media).toFixed(2) + "%  t=" + mejor.t.toFixed(2) +
  "  aciertos " + (100 * mejor.aciertos).toFixed(1) + "%  $" + mejor.usd.toFixed(0) + "/op  $" + mejor.anual.toFixed(0) + "/ano  huecos " + mejor.huecos);
const m1 = trozo(A, 0, Math.floor(N / 2)), m2 = trozo(A, Math.floor(N / 2), N);
console.log("mitades:  1a n=" + m1.r.n + " " + (100 * m1.r.media).toFixed(2) + "% (t=" + m1.r.t.toFixed(2) + ")   2a n=" + m2.r.n + " " + (100 * m2.r.media).toFixed(2) + "% (t=" + m2.r.t.toFixed(2) + ")");
const T = [0, 1, 2].map((k) => trozo(A, Math.floor((k * N) / 3), Math.floor(((k + 1) * N) / 3)));
console.log("tercios:  " + T.map((x) => (100 * x.r.media).toFixed(2) + "% (n=" + x.r.n + ")").join("  ·  "));
for (const arm of ["baraj", "contra", "tontoC", "tontoP"]) {
  const k = arm + "|" + mejor.ent + "|" + (arm.startsWith("tonto") ? "atm" : mejor.stk) + "|" + mejor.sal;
  const a = acc.get(k);
  if (!a || a.ret.length < 2) { console.log(arm.padEnd(8) + " sin datos (" + k + ")"); continue; }
  const r = resumen(a.ret), u = resumen(a.usd);
  console.log(arm.padEnd(8) + " n=" + String(r.n).padStart(4) + " " + (100 * r.media).toFixed(2).padStart(7) + "%  t=" + r.t.toFixed(2).padStart(6) +
    "  $" + u.media.toFixed(0).padStart(5) + "/op  $" + ((u.media * r.n) / ANIOS).toFixed(0).padStart(7) + "/ano  huecos " + a.huecos);
}

// ── LO MISMO PERO EN DINERO ───────────────────────────────────────────────────────────────
// El % por operación miente cuando el billete cuesta $0,10: multiplicar por tres una moneda
// da +200% y +$20, y una sola pérdida de un billete de $40 se lo come. Lo que manda es el
// dinero, así que se ordena otra vez por la t de los DÓLARES.
for (const f of filas) {
  const a = acc.get(f.clave);
  const u = resumen(a.usd);
  f.tUsd = u.t;
}
const realesUsd = filas.filter((f) => f.arm === "real").sort((a, b) => b.tUsd - a.tUsd);
console.log("\n== LAS 15 MEJORES EN DINERO (brazo real) ==");
console.log("entrada  strike salida         n     $/op   t($)    $/ano  media%  acierto  costeMedio");
for (const f of realesUsd.slice(0, 15)) {
  console.log(f.ent.padEnd(8) + " " + f.stk.padEnd(6) + " " + f.sal.padEnd(10) +
    String(f.n).padStart(5) + " " + f.usd.toFixed(0).padStart(8) + " " + f.tUsd.toFixed(2).padStart(6) + " " +
    f.anual.toFixed(0).padStart(8) + " " + (100 * f.media).toFixed(1).padStart(7) + " " +
    (100 * f.aciertos).toFixed(0).padStart(6) + "%  $" + f.costeMed.toFixed(2));
}
console.log("variantes reales con dinero POSITIVO: " + filas.filter((f) => f.arm === "real" && f.usd > 0).length + " de " + realesUsd.length);
console.log("la mejor de todas en dinero, mirando TODOS los brazos: " +
  (() => { const b = [...filas].sort((x, y) => y.usd - x.usd)[0]; return b.clave + "  $" + b.usd.toFixed(0) + "/op  t=" + b.tUsd.toFixed(2); })());

// el cruce completo de la mejor EN DINERO
const mejorU = realesUsd[0];
const AU = acc.get(mejorU.clave);
console.log("\n===== LA MEJOR EN DINERO: " + mejorU.clave + " =====");
{
  const cs = [...AU.coste].sort((a, b) => a - b);
  console.log("coste de entrada: p10 $" + cs[Math.floor(cs.length * 0.1)].toFixed(2) + "  mediana $" + cs[Math.floor(cs.length / 2)].toFixed(2) +
    "  p90 $" + cs[Math.floor(cs.length * 0.9)].toFixed(2) + "  (min $" + cs[0].toFixed(2) + " max $" + cs.at(-1).toFixed(2) + ")");
  console.log("n=" + mejorU.n + "  $" + mejorU.usd.toFixed(0) + "/op  t($)=" + mejorU.tUsd.toFixed(2) + "  media " + (100 * mejorU.media).toFixed(2) +
    "%  aciertos " + (100 * mejorU.aciertos).toFixed(1) + "%  $" + mejorU.anual.toFixed(0) + "/ano  huecos " + mejorU.huecos);
  const q1 = trozo(AU, 0, Math.floor(N / 2)), q2 = trozo(AU, Math.floor(N / 2), N);
  console.log("mitades ($): 1a " + q1.u.media.toFixed(0) + " (t=" + q1.u.t.toFixed(2) + ")   2a " + q2.u.media.toFixed(0) + " (t=" + q2.u.t.toFixed(2) + ")");
  console.log("mitades (%): 1a " + (100 * q1.r.media).toFixed(2) + "%   2a " + (100 * q2.r.media).toFixed(2) + "%");
  const TT = [0, 1, 2].map((k) => trozo(AU, Math.floor((k * N) / 3), Math.floor(((k + 1) * N) / 3)));
  console.log("tercios ($): " + TT.map((x) => x.u.media.toFixed(0)).join(" / ") + "    tercios (%): " + TT.map((x) => (100 * x.r.media).toFixed(2) + "%").join(" / "));
  for (const arm of ["baraj", "contra", "tontoC", "tontoP"]) {
    const k = arm + "|" + mejorU.ent + "|" + (arm.startsWith("tonto") ? "atm" : mejorU.stk) + "|" + mejorU.sal;
    const a = acc.get(k);
    if (!a || a.ret.length < 2) { console.log(arm.padEnd(8) + " sin datos (" + k + ")"); continue; }
    const r = resumen(a.ret), u = resumen(a.usd);
    console.log(arm.padEnd(8) + " n=" + String(r.n).padStart(4) + "  $" + u.media.toFixed(0).padStart(5) + "/op  t($)=" + u.t.toFixed(2).padStart(6) +
      "  " + (100 * r.media).toFixed(2).padStart(7) + "%  $" + ((u.media * r.n) / ANIOS).toFixed(0).padStart(7) + "/ano");
  }
}

// ── VISTA DE CONJUNTO ─────────────────────────────────────────────────────────────────────
console.log("\n== MEDIA DE TODAS LAS VARIANTES, POR BRAZO ==");
for (const arm of ["real", "baraj", "contra", "tontoC", "tontoP"]) {
  const g = filas.filter((f) => f.arm === arm);
  if (!g.length) continue;
  console.log(arm.padEnd(8) + " variantes " + String(g.length).padStart(4) +
    "  media de medias " + (100 * med(g.map((f) => f.media))).toFixed(2) + "%" +
    "  positivas " + g.filter((f) => f.media > 0).length + "/" + g.length +
    "  mejor t " + Math.max(...g.map((f) => f.t)).toFixed(2));
}
{
  const dif = [];
  for (const f of filas.filter((x) => x.arm === "real")) {
    const b = acc.get("baraj|" + f.ent + "|" + f.stk + "|" + f.sal);
    if (!b || b.ret.length < 200) continue;
    dif.push(f.media - resumen(b.ret).media);
  }
  const rd = resumen(dif);
  console.log("\nreal - barajado, variante a variante: n=" + rd.n + " media " + (100 * rd.media).toFixed(2) + " pts  a favor del real " + (100 * rd.aciertos).toFixed(0) + "%");
}
