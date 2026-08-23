// EL REBOTE DE LA MAÑANA — ¿pagan las entradas "en el hoyo" de media mañana?
//
// ═══ QUÉ MIDE Y POR QUÉ ═════════════════════════════════════════════════════════════════════
//
// Eduardo enseñó cuatro calls ganadoras de SPXW 0DTE del 21 de agosto de 2026 y dijo que las
// eligió por el GEX. La autopsia de ese día dice otra cosa mucho más simple: sus entradas caen
// todas entre las 09:55 y las 10:05, que fue justo el hoyo de la mañana (el SPX bajaba 12
// puntos desde la apertura), y sus salidas caen en el rebote de mediodía.
//
// Así que la pregunta no es el GEX. La pregunta es: si el precio ha CAÍDO N puntos desde la
// apertura a la hora T, ¿pagar una call cerca del dinero y venderla más tarde deja dinero?
//
// Esto se prueba en tres versiones y con tres controles, porque cada uno mata una explicación
// alternativa distinta:
//
//   CONTRA (el rebote):   ha caído → compro CALL  ·  ha subido → compro PUT
//   MOMENTO (lo opuesto): ha caído → compro PUT   ·  ha subido → compro CALL
//        Si las DOS versiones dan positivo, lo que hay no es dirección: es volatilidad (o
//        deriva), y hay que decirlo en voz alta.
//
//   EL LISTÓN (control tonto): la MISMA compra, la MISMA salida, TODOS los días, sin mirar si
//        el precio había caído. Si el filtro no bate a esto, el filtro no aporta nada y lo que
//        estamos midiendo es simplemente que a esa hora la opción está barata.
//   EL BARAJADO: la misma regla, pero decidiendo con la caída de OTRO día (índice desplazado
//        37 posiciones; nada de aleatorio real). Si el barajado va igual de bien, no hay señal.
//   LAS MITADES Y LOS TERCIOS: partir la muestra en el tiempo. Un efecto que sólo vive en una
//        mitad es un régimen, no una regla.
//
// ═══ REJILLA ════════════════════════════════════════════════════════════════════════════════
//
//   N (puntos de caída/subida desde la apertura):  5, 10, 15, 20, 25, 30, 40
//   T (hora de la decisión):                       09:45 10:00 10:15 10:30 10:45 11:00
//   Strike (respecto al dinero, siempre FUERA):    ATM, +5, +10, +15, +20
//   Salida:  +1h, +2h, 12:00, 13:00, 14:00, 15:55, objetivo +30 %, objetivo +50 %
//
// ═══ REGLAS DE LA CASA QUE SE CUMPLEN AQUÍ ══════════════════════════════════════════════════
//
//   · Se compra al ASK y se vende al BID (lo hace lib0dte, no se puede desactivar).
//   · En la barra T sólo se mira la apertura y la propia barra T. Nunca la siguiente.
//   · Las salidas por objetivo miran el bid de cada barra POSTERIOR a la entrada una a una y
//     venden en la primera que llega al objetivo — eso es lo que haría un humano en vivo, no
//     es mirar el máximo del día.
//   · Un hueco (falta bid o ask) NO es un cero: la operación se descarta y se cuenta aparte.
//   · Nada de modelos de precios. Si el precio no está en el fichero, la operación no existe.

import {
  diasDisponibles, cargarDia, idxHora, rejilla,
  compraEn, ventaEn, resumen,
} from "./lib0dte.mjs";

// ─── rejilla de parámetros ──────────────────────────────────────────────────────────────────
const NS = [5, 10, 15, 20, 25, 30, 40];
const HORAS = ["09:45", "10:00", "10:15", "10:30", "10:45", "11:00"];
const OFFS = [0, 5, 10, 15, 20];                 // 0 = ATM; el resto, FUERA del dinero
const SALIDAS = ["+1h", "+2h", "12:00", "13:00", "14:00", "15:55", "obj+30", "obj+50"];
const LADOS = ["C", "P"];

const DESPLAZA = 37;                             // el barajado: la señal de otro día

// ─── utilidades de hora ─────────────────────────────────────────────────────────────────────
const aMin = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const aHhmm = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");

/**
 * Una operación con salida por RELOJ: entra en iE (ask) y sale en la barra de la hora `hhmm`
 * (bid). Devuelve null si falta cualquiera de los dos precios o si la barra no existe.
 */
function opReloj(d, iE, hhmm, K, lado) {
  const iS = idxHora(d, hhmm);
  if (iS < 0 || iS <= iE) return null;
  const coste = compraEn(d.barras[iE], K, lado);
  if (!(coste > 0)) return null;
  const ingreso = ventaEn(d.barras[iS], K, lado);
  if (ingreso == null) return null;
  return { coste, ingreso, ret: (ingreso - coste) / coste, dolares: (ingreso - coste) * 100 };
}

/**
 * Una operación con salida por OBJETIVO: entra en iE (ask) y va mirando el bid de cada barra
 * posterior; vende en la PRIMERA que alcanza coste × (1+obj). Si no llega nunca, vende al bid
 * de las 15:55. Sólo mira barras ya ocurridas en el momento de decidir.
 */
function opObjetivo(d, iE, obj, K, lado) {
  const coste = compraEn(d.barras[iE], K, lado);
  if (!(coste > 0)) return null;
  const objetivo = coste * (1 + obj);
  const iFin = idxHora(d, "15:55");
  if (iFin <= iE) return null;
  for (let i = iE + 1; i <= iFin; i++) {
    const bid = ventaEn(d.barras[i], K, lado);
    if (bid == null) continue;                   // hueco puntual: no se puede vender ahí
    if (bid >= objetivo) return { coste, ingreso: bid, ret: (bid - coste) / coste, dolares: (bid - coste) * 100 };
  }
  const bid = ventaEn(d.barras[iFin], K, lado);
  if (bid == null) return null;
  return { coste, ingreso: bid, ret: (bid - coste) / coste, dolares: (bid - coste) * 100 };
}

function ejecutar(d, iE, hE, salida, K, lado) {
  if (salida === "+1h") return opReloj(d, iE, aHhmm(aMin(hE) + 60), K, lado);
  if (salida === "+2h") return opReloj(d, iE, aHhmm(aMin(hE) + 120), K, lado);
  if (salida === "obj+30") return opObjetivo(d, iE, 0.30, K, lado);
  if (salida === "obj+50") return opObjetivo(d, iE, 0.50, K, lado);
  return opReloj(d, iE, salida, K, lado);
}

// ─── PASADA ÚNICA sobre todos los días ──────────────────────────────────────────────────────
// Para cada combinación (hora, strike, salida, lado) guardamos una fila por día con el retorno
// y el coste. El filtro por N se aplica DESPUÉS, con el desplazamiento del spot desde la
// apertura que también guardamos por día y hora. Así el filtro no cambia los precios.

const dias = diasDisponibles();
console.log(`días con cadena: ${dias.length}   (${dias[0]} → ${dias[dias.length - 1]})`);

const clave = (h, off, sal, lado) => `${h}|${off}|${sal}|${lado}`;
const tabla = new Map();                          // clave -> array de {i, ret, dol, coste}
for (const h of HORAS) for (const off of OFFS) for (const sal of SALIDAS) for (const l of LADOS) tabla.set(clave(h, off, sal, l), []);

const delta = [];                                 // delta[iDia][hora] = spot(T) - spot(09:30)
const diasUsados = [];
let huecos = 0, intentos = 0, diasDescartados = 0, sinApertura = 0;
const costesATM10 = [];                           // control de cordura: coste de la call ATM a las 10:00

const t0 = Date.now();
for (const dia of dias) {
  const d = cargarDia(dia);
  if (!d) { diasDescartados++; continue; }
  const iOpen = idxHora(d, "09:30") >= 0 ? idxHora(d, "09:30") : 0;
  const apertura = d.barras[iOpen].spot;
  if (!(apertura > 0)) { sinApertura++; continue; }

  const iDia = diasUsados.length;
  diasUsados.push(dia);
  const porHora = {};

  for (const h of HORAS) {
    const iE = idxHora(d, h);
    if (iE < 0) { porHora[h] = null; continue; }
    const spot = d.barras[iE].spot;
    porHora[h] = spot - apertura;
    const base = rejilla(spot);
    for (const off of OFFS) {
      for (const lado of LADOS) {
        const K = lado === "C" ? base + off : base - off;   // el offset siempre aleja del dinero
        if (lado === "C" && off === 0 && h === "10:00") {
          const c = compraEn(d.barras[iE], K, "C");
          if (c > 0) costesATM10.push(c);
        }
        for (const sal of SALIDAS) {
          intentos++;
          const r = ejecutar(d, iE, h, sal, K, lado);
          if (!r) { huecos++; continue; }
          tabla.get(clave(h, off, sal, lado)).push({ i: iDia, ret: r.ret, dol: r.dolares, coste: r.coste });
        }
      }
    }
  }
  delta.push(porHora);
}
const nDias = diasUsados.length;
const anios = nDias / 252;
console.log(`días usados: ${nDias}  ·  descartados por cadena incompleta: ${diasDescartados}  ·  sin apertura: ${sinApertura}`);
console.log(`intentos de operación: ${intentos}  ·  huecos (falta bid o ask): ${huecos}  (${(100 * huecos / intentos).toFixed(2)} %)`);
costesATM10.sort((a, b) => a - b);
console.log(`coste de la CALL ATM a las 10:00 — n=${costesATM10.length}  min $${costesATM10[0]?.toFixed(2)}  mediana $${costesATM10[Math.floor(costesATM10.length / 2)]?.toFixed(2)}  max $${costesATM10[costesATM10.length - 1]?.toFixed(2)}`);
console.log(`carga: ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);

// ─── el filtro ──────────────────────────────────────────────────────────────────────────────
// familia "contra": si cayó N o más → CALL ; si subió N o más → PUT
// familia "momento": al revés
// El desplazamiento se puede leer del propio día (real) o de otro (barajado).
function seleccion(h, N, familia, lado, barajado) {
  const sel = new Set();
  for (let i = 0; i < nDias; i++) {
    const j = barajado ? (i + DESPLAZA) % nDias : i;
    const dv = delta[j][h];
    if (dv == null) continue;
    const cayo = dv <= -N, subio = dv >= N;
    let quiere;
    if (familia === "contra") quiere = lado === "C" ? cayo : subio;
    else quiere = lado === "C" ? subio : cayo;
    if (quiere) sel.add(i);
  }
  return sel;
}

function medir(filas, sel) {
  const rets = [], dols = [];
  for (const f of filas) if (!sel || sel.has(f.i)) { rets.push(f.ret); dols.push(f.dol); }
  if (rets.length < 2) return null;
  const r = resumen(rets);
  const mediaDol = dols.reduce((a, b) => a + b, 0) / dols.length;
  return { n: r.n, media: r.media * 100, t: r.t, aciertos: r.aciertos, mediaDol, anual: (r.n / anios) * mediaDol };
}

function trozo(filas, sel, lo, hi) {
  const s = filas.filter((f) => f.i >= lo && f.i < hi && (!sel || sel.has(f.i)));
  return medir(s, null);
}

// ─── barrido de toda la rejilla ─────────────────────────────────────────────────────────────
const N_MIN = 100;                                  // muestra mínima para tomarse en serio una celda
const resultados = [];
for (const familia of ["contra", "momento"]) {
  for (const h of HORAS) for (const N of NS) for (const off of OFFS) for (const sal of SALIDAS) {
    // la regla junta los dos lados: el mismo día sólo dispara uno
    const filas = [];
    for (const lado of LADOS) {
      const sel = seleccion(h, N, familia, lado, false);
      for (const f of tabla.get(clave(h, off, sal, lado))) if (sel.has(f.i)) filas.push(f);
    }
    const m = medir(filas, null);
    if (!m || m.n < N_MIN) continue;
    resultados.push({ familia, h, N, off, sal, filas, ...m });
  }
}
console.log(`celdas de la rejilla con n≥${N_MIN}: ${resultados.length}`);

const porMedia = [...resultados].sort((a, b) => b.media - a.media);
const contra = resultados.filter((r) => r.familia === "contra");
const momento = resultados.filter((r) => r.familia === "momento");
const positivas = (arr) => arr.filter((r) => r.media > 0).length;
console.log(`  contra : ${contra.length} celdas, ${positivas(contra)} con media positiva (${(100 * positivas(contra) / contra.length).toFixed(0)} %)`);
console.log(`  momento: ${momento.length} celdas, ${positivas(momento)} con media positiva (${(100 * positivas(momento) / momento.length).toFixed(0)} %)\n`);

console.log("TOP 12 de toda la rejilla por retorno medio por operación:");
console.log("fam      T      N  off  salida   n     media%    t     aciertos   $/op     $/año");
for (const r of porMedia.slice(0, 12)) {
  console.log(`${r.familia.padEnd(8)}${r.h}  ${String(r.N).padStart(2)}  ${String(r.off).padStart(3)}  ${r.sal.padEnd(7)} ${String(r.n).padStart(4)}  ${r.media.toFixed(2).padStart(7)}  ${r.t.toFixed(2).padStart(5)}   ${(100 * r.aciertos).toFixed(0).padStart(3)}%   ${r.mediaDol.toFixed(0).padStart(6)}  ${r.anual.toFixed(0).padStart(7)}`);
}
console.log();

// ─── el listón: la misma compra TODOS los días ──────────────────────────────────────────────
// Para una celda, el control tonto es comprar el mismo lado, mismo strike, misma salida, todos
// los días. Como la regla junta calls y puts, el control junta también los dos lados.
function liston(h, off, sal) {
  const filas = [...tabla.get(clave(h, off, sal, "C")), ...tabla.get(clave(h, off, sal, "P"))];
  return medir(filas, null);
}
function listonLado(h, off, sal, lado) {
  return medir(tabla.get(clave(h, off, sal, lado)), null);
}

// ─── informe completo de una celda ──────────────────────────────────────────────────────────
function informe(r, titulo) {
  console.log(`━━━ ${titulo}`);
  console.log(`    ${r.familia}  ·  T=${r.h}  ·  N=${r.N} puntos  ·  strike ${r.off === 0 ? "ATM" : "+" + r.off + " fuera"}  ·  salida ${r.sal}`);
  console.log(`    REGLA          n=${String(r.n).padStart(4)}  media ${r.media.toFixed(2)} %  t=${r.t.toFixed(2)}  aciertos ${(100 * r.aciertos).toFixed(0)} %  $/op ${r.mediaDol.toFixed(0)}  $/año ${r.anual.toFixed(0)}`);

  const L = liston(r.h, r.off, r.sal);
  console.log(`    LISTÓN tonto   n=${String(L.n).padStart(4)}  media ${L.media.toFixed(2)} %  t=${L.t.toFixed(2)}  aciertos ${(100 * L.aciertos).toFixed(0)} %  $/op ${L.mediaDol.toFixed(0)}  $/año ${L.anual.toFixed(0)}`);

  // barajado: misma regla con la señal de otro día
  const fb = [];
  for (const lado of LADOS) {
    const sel = seleccion(r.h, r.N, r.familia, lado, true);
    for (const f of tabla.get(clave(r.h, r.off, r.sal, lado))) if (sel.has(f.i)) fb.push(f);
  }
  const B = medir(fb, null);
  console.log(`    BARAJADO       n=${String(B.n).padStart(4)}  media ${B.media.toFixed(2)} %  t=${B.t.toFixed(2)}  $/op ${B.mediaDol.toFixed(0)}  $/año ${B.anual.toFixed(0)}`);

  // el lado contrario: mismo filtro, opción opuesta (control de simetría)
  const otra = r.familia === "contra" ? "momento" : "contra";
  const fo = [];
  for (const lado of LADOS) {
    const sel = seleccion(r.h, r.N, otra, lado, false);
    for (const f of tabla.get(clave(r.h, r.off, r.sal, lado))) if (sel.has(f.i)) fo.push(f);
  }
  const O = medir(fo, null);
  console.log(`    LADO CONTRARIO n=${String(O.n).padStart(4)}  media ${O.media.toFixed(2)} %  t=${O.t.toFixed(2)}  $/op ${O.mediaDol.toFixed(0)}  $/año ${O.anual.toFixed(0)}`);

  const m1 = trozo(r.filas, null, 0, Math.floor(nDias / 2));
  const m2 = trozo(r.filas, null, Math.floor(nDias / 2), nDias);
  console.log(`    MITAD 1 (${diasUsados[0]}→${diasUsados[Math.floor(nDias / 2) - 1]})  n=${m1?.n}  media ${m1 ? m1.media.toFixed(2) : "—"} %`);
  console.log(`    MITAD 2 (${diasUsados[Math.floor(nDias / 2)]}→${diasUsados[nDias - 1]})  n=${m2?.n}  media ${m2 ? m2.media.toFixed(2) : "—"} %`);
  const cortes = [0, Math.floor(nDias / 3), Math.floor(2 * nDias / 3), nDias];
  const ter = [];
  for (let k = 0; k < 3; k++) {
    const s = trozo(r.filas, null, cortes[k], cortes[k + 1]);
    ter.push(s ? `${s.media >= 0 ? "+" : ""}${s.media.toFixed(1)} (n=${s.n})` : "—");
  }
  console.log(`    TERCIOS        ${ter.join("  /  ")}`);
  const costes = r.filas.map((f) => f.coste).sort((a, b) => a - b);
  console.log(`    coste entrada  min $${costes[0].toFixed(2)}  mediana $${costes[Math.floor(costes.length / 2)].toFixed(2)}  max $${costes[costes.length - 1].toFixed(2)}`);
  return { L, B, O, m1, m2, ter };
}

// ─── la mejor de la familia "contra" (la hipótesis del encargo) ─────────────────────────────
const mejorContra = [...contra].sort((a, b) => b.t - a.t)[0];
const mejorContraMedia = [...contra].sort((a, b) => b.media - a.media)[0];
const mejorContraAnual = [...contra].sort((a, b) => b.anual - a.anual)[0];
const mejorGlobal = [...resultados].sort((a, b) => b.t - a.t)[0];

const infoT = informe(mejorContra, "MEJOR «contra» POR t");
console.log();
const infoM = informe(mejorContraMedia, "MEJOR «contra» POR RETORNO MEDIO");
console.log();
const infoA = informe(mejorContraAnual, "MEJOR «contra» POR DÓLARES AL AÑO");
console.log();
if (mejorGlobal.familia !== "contra") { informe(mejorGlobal, "MEJOR DE TODA LA REJILLA (es de la otra familia)"); console.log(); }

// ─── ¿bate el filtro al listón, en general? ─────────────────────────────────────────────────
let bate = 0, total = 0;
for (const r of contra) {
  const L = liston(r.h, r.off, r.sal);
  if (!L) continue;
  total++;
  if (r.media > L.media) bate++;
}
console.log(`«contra» bate a su propio listón tonto en ${bate} de ${total} celdas (${(100 * bate / total).toFixed(0)} %) — el azar daría 50 %`);

let bateM = 0, totalM = 0;
for (const r of momento) {
  const L = liston(r.h, r.off, r.sal);
  if (!L) continue;
  totalM++;
  if (r.media > L.media) bateM++;
}
console.log(`«momento» bate a su listón en ${bateM} de ${totalM} celdas (${(100 * bateM / totalM).toFixed(0)} %)`);

// ─── el día de Eduardo: la celda más parecida a lo que él hizo ──────────────────────────────
// entra ~10:00 con el spot 10-12 puntos por debajo de la apertura, strike +10/+20 fuera,
// sale hacia mediodía. Ésa es la celda: T=10:00, N=10, off=10, salida 12:00.
const eduardo = resultados.find((r) => r.familia === "contra" && r.h === "10:00" && r.N === 10 && r.off === 10 && r.sal === "12:00");
console.log();
if (eduardo) informe(eduardo, "LA CELDA DE EDUARDO (T=10:00, cayó ≥10, strike +10, salir a las 12:00)");
else console.log("la celda de Eduardo no llegó a n≥100");

// ─── el listón puro por hora: ¿es que la opción está barata a esa hora? ─────────────────────
console.log("\n¿ES EL REBOTE O ES QUE A ESA HORA ESTÁ BARATA? — comprar TODOS los días, sin filtro:");
console.log("T      strike  salida    CALL n/media%    PUT n/media%");
for (const h of HORAS) {
  for (const off of [0, 10]) {
    for (const sal of ["+1h", "12:00", "15:55"]) {
      const c = listonLado(h, off, sal, "C"), p = listonLado(h, off, sal, "P");
      console.log(`${h}  ${off === 0 ? "ATM " : "+10 "}   ${sal.padEnd(7)}  ${String(c.n).padStart(4)} ${c.media.toFixed(2).padStart(7)}      ${String(p.n).padStart(4)} ${p.media.toFixed(2).padStart(7)}`);
    }
  }
}

// ─── ¿ES DERIVA? el ganador, partido por lado ───────────────────────────────────────────────
// Si una regla que compra calls tras subidas y puts tras bajadas sólo gana por el lado CALL,
// lo que hemos encontrado es que el mercado subió de 2022 a 2026, no una regla.
function porLado(r) {
  console.log(`\n━━━ ${r.familia} T=${r.h} N=${r.N} off=${r.off} ${r.sal} — PARTIDO POR LADO (¿es deriva?)`);
  for (const lado of LADOS) {
    const sel = seleccion(r.h, r.N, r.familia, lado, false);
    const m = medir(tabla.get(clave(r.h, r.off, r.sal, lado)), sel);
    const L = listonLado(r.h, r.off, r.sal, lado);
    if (!m) { console.log(`    ${lado}: sin muestra`); continue; }
    console.log(`    ${lado === "C" ? "CALLS (tras subida)" : "PUTS  (tras bajada)"}  n=${String(m.n).padStart(3)}  media ${m.media.toFixed(2).padStart(7)} %  t=${m.t.toFixed(2)}  $/año ${m.anual.toFixed(0).padStart(6)}   ·  listón del mismo lado: ${L.media.toFixed(2)} %`);
  }
}
porLado(mejorGlobal);
porLado(mejorContra);

// ─── LA PRUEBA DE LAS MUCHAS PUERTAS ────────────────────────────────────────────────────────
// Hemos mirado 2.336 celdas. Con tantas puertas, la mejor de todas sale alta aunque no haya
// nada detrás. El listón honesto es: ¿cuánta t saca la MEJOR celda cuando la señal está
// barajada? Si el barajado también saca t≈1,8, la nuestra no vale nada.
console.log("\n═══ LA PRUEBA DE LAS MUCHAS PUERTAS ═══");
for (const fam of ["contra", "momento"]) {
  let mejorReal = -99, mejorBaraj = -99, cuantasReal = 0, cuantasBaraj = 0, tot = 0;
  for (const h of HORAS) for (const N of NS) for (const off of OFFS) for (const sal of SALIDAS) {
    const fr = [], fb = [];
    for (const lado of LADOS) {
      const sr = seleccion(h, N, fam, lado, false), sb = seleccion(h, N, fam, lado, true);
      for (const f of tabla.get(clave(h, off, sal, lado))) { if (sr.has(f.i)) fr.push(f); if (sb.has(f.i)) fb.push(f); }
    }
    const mr = medir(fr, null), mb = medir(fb, null);
    if (!mr || mr.n < N_MIN || !mb || mb.n < N_MIN) continue;
    tot++;
    if (mr.t > mejorReal) mejorReal = mr.t;
    if (mb.t > mejorBaraj) mejorBaraj = mb.t;
    if (mr.t > 1.5) cuantasReal++;
    if (mb.t > 1.5) cuantasBaraj++;
  }
  console.log(`  ${fam.padEnd(8)} ${tot} celdas · mejor t REAL ${mejorReal.toFixed(2)} vs mejor t BARAJADA ${mejorBaraj.toFixed(2)}  ·  celdas con t>1,5: real ${cuantasReal}, barajado ${cuantasBaraj}`);
}

// ─── EL VECINDARIO del ganador ──────────────────────────────────────────────────────────────
// Un hallazgo de verdad no es un punto solo en la rejilla: sus vecinos también van bien.
console.log(`\n═══ VECINDARIO de ${mejorGlobal.familia} T=${mejorGlobal.h} N=${mejorGlobal.N} off=${mejorGlobal.off} ${mejorGlobal.sal} ═══`);
console.log("T      N   off  salida   n    media%     t     $/año    (listón media%)");
for (const h of ["10:30", "10:45", "11:00"]) for (const N of [20, 25, 30]) for (const off of [5, 10, 15]) for (const sal of ["+1h", "+2h", "15:55"]) {
  const r = resultados.find((x) => x.familia === mejorGlobal.familia && x.h === h && x.N === N && x.off === off && x.sal === sal);
  if (!r) continue;
  const L = liston(h, off, sal);
  console.log(`${h}  ${String(N).padStart(2)}  ${String(off).padStart(3)}  ${sal.padEnd(6)} ${String(r.n).padStart(4)} ${r.media.toFixed(2).padStart(7)} ${r.t.toFixed(2).padStart(6)} ${r.anual.toFixed(0).padStart(8)}    ${L.media.toFixed(2).padStart(7)}`);
}

// ─── veredicto legible por el orquestador ───────────────────────────────────────────────────
const R = mejorContra, I = infoT;
console.log("\n═══ RESUMEN MÁQUINA ═══");
console.log(JSON.stringify({
  dias: nDias, huecos, intentos,
  mejorContraPorT: { ...R, filas: undefined },
  liston: I.L, barajado: I.B, ladoContrario: I.O,
  mitad1: I.m1?.media, mitad2: I.m2?.media, tercios: I.ter,
  mejorPorMedia: { ...mejorContraMedia, filas: undefined },
  mejorPorAnual: { ...mejorContraAnual, filas: undefined },
  mejorGlobal: { ...mejorGlobal, filas: undefined },
}, null, 1));
