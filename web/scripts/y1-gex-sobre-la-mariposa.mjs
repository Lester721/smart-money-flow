// ¿MEJORA EL GEX A LA MARIPOSA DE LAS 15:00?
//
// ═══ DE DÓNDE SALE LA PREGUNTA ══════════════════════════════════════════════════════════════
//
// Lester trajo un documento de interpretación del GEX que dice, en resumen: GEX alto y positivo
// = mercado más estable y propenso a revertir; GEX bajo o negativo = movimientos direccionales
// que se autoalimentan.
//
// Esa afirmación es sobre CUÁNTO se mueve el día, no sobre hacia dónde — y eso es justo lo
// único del GEX que en este proyecto ha salido verdad. Medido esta misma noche: el índice se
// mueve un 11,6% MENOS por la tarde donde hay interés abierto concentrado (t=−5,25), y el
// efecto crece durante la sesión y crece cada año desde 2023.
//
// Si eso es cierto, entonces la mariposa de las 15:00 —que gana justo cuando el día se queda
// quieto— debería ir mejor los días de GEX alto. Y a diferencia de la versión direccional, esto
// se cobra VENDIENDO: no hay que tapar el agujero de −$7.876/año que tiene comprar 0DTE.
//
// ═══ LO QUE SE MIDE ═════════════════════════════════════════════════════════════════════════
//
// La mariposa de hierro al dinero con alas de 50, vendida a las 15:00, aguantada a vencimiento,
// sólo los días en que el SPX está por encima de su media de 5 cierres Y de la de 50. Es la
// regla exacta que dio $11.405/año y que está anotada en /estado como candidata número 1.
// Los 652 días desde 2024, que es donde el efecto del freno está medido y es estable.
//
// Se parten en cinco montones por el GEX de las 15:00 y se enseña la escalera COMPLETA. Si no
// es monótona no es señal, y se dice.
//
// ═══ CÓMO SE CALCULA EL GEX, Y POR QUÉ ASÍ ══════════════════════════════════════════════════
//
// Igual que la API, con la corrección de esta noche: la call y la put del MISMO strike tienen
// la MISMA volatilidad implícita y la MISMA gamma (paridad put-call), así que se toma la del
// lado que está FUERA del dinero —el único que se despeja bien— y se usa para las dos patas.
// Sin eso desaparecían las opciones dentro del dinero y el GEX salía de media cadena.
//
// La gamma se calcula con la fórmula de Black-Scholes. NO es una violación de la regla de la
// casa: lo prohibido es poner un PRECIO de modelo en el camino del dinero. Aquí todos los
// precios de las operaciones son bid/ask reales; la gamma es sólo el peso con el que se suma
// el interés abierto, y la volatilidad que entra en ella viene del fichero, no de un ajuste.
//
// ═══ LOS TRES CONTROLES ═════════════════════════════════════════════════════════════════════
//
// (a) BARAJADO: ordenar los días por el GEX de OTRO día. Si separa igual, no es el GEX.
// (b) VOLATILIDAD: ordenar por el precio de la cuna al dinero de las 09:35. Éste es el que ha
//     matado a todo lo demás del GEX en este proyecto — resulta ser un termómetro de
//     volatilidad disfrazado una y otra vez.
// (c) EL GEX DENTRO DE TERCIOS DE VOLATILIDAD: si el efecto desaparece al comparar días
//     igual de movidos, era volatilidad y no GEX.
//
// Y el aviso: el GEX en dólares crece con el nivel del índice y con el tamaño de la cadena.
// Para que 2024 y 2026 sean comparables se usa el GEX NORMALIZADO, (calls−puts)/(calls+puts),
// que es forma pura y no tamaño. Sumar dólares mediría el tamaño de la cadena, que es el error
// que ya nos puso a SPY en el tercio «más volátil».

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { diasDisponibles, cargarDia, idxHora, hayHora, rejilla, estructura, compraEn, CACHE } from "./lib0dte.mjs";

const HORA = "15:00";
const ALA = 50;
const ANOS = 2.67;                        // 652 días de 2024-01-01 a 2026-08-10, a 244 días/año
// Medias sesiones: la bolsa cierra a las 13:00 pero el fichero trae barras hasta las 16:00 con
// el SPX congelado. Entrar a las 15:00 esos días es operar en un mercado cerrado sabiendo dónde
// liquida. Ya regaló nueve operaciones a otra medición.
const MEDIAS = new Set(["2022-11-25","2023-07-03","2023-11-24","2024-07-03","2024-11-29",
                        "2024-12-24","2025-07-03","2025-11-28","2025-12-24"]);

const mariposa = (K, a) => [
  { K, lado: "C", dir: -1 }, { K: K + a, lado: "C", dir: 1 },
  { K, lado: "P", dir: -1 }, { K: K - a, lado: "P", dir: 1 },
];

// ── Black-Scholes SÓLO para la gamma (el peso), nunca para un precio ────────
const phi = (x) => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
const d1f = (S, K, T, v) => (Math.log(S / K) + (v * v / 2) * T) / (v * Math.sqrt(T));
const gammaBS = (S, K, T, v) => phi(d1f(S, K, T, v)) / (S * v * Math.sqrt(T));

/** Las volatilidades implícitas de una barra concreta, leídas del fichero. */
function ivsDe(dia, hora) {
  const out = { C: new Map(), P: new Map() };
  for (const lado of ["C", "P"]) {
    const ruta = join(CACHE, "gex-2026", `iv_${dia}_${lado}.csv`);
    if (!existsSync(ruta)) return null;
    const txt = readFileSync(ruta, "utf8");
    const nl = txt.indexOf("\n");
    const cab = txt.slice(0, nl).split(",").map((x) => x.replace(/"/g, "").trim());
    const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"), iV = cab.indexOf("implied_vol"),
          iB = cab.indexOf("bid"), iA = cab.indexOf("ask"), iM = cab.indexOf("midpoint");
    let p = nl + 1;
    while (p < txt.length) {
      let f = txt.indexOf("\n", p); if (f < 0) f = txt.length;
      const linea = txt.slice(p, f); p = f + 1;
      if (!linea) continue;
      const c = linea.split(",");
      if (c[iT].slice(11, 16) !== hora) continue;
      const bid = +c[iB], ask = +c[iA], mid = +c[iM], iv = +c[iV];
      // EXACTAMENTE el filtro de cadena() en la API
      if (!(ask > 0) || ask < bid || !(mid > 0) || !(iv > 0.01) || iv > 4) continue;
      out[lado].set(+String(c[iK]).replace(/"/g, ""), iv);
    }
  }
  return out;
}

/** GEX de una barra: normalizado (forma) y en dólares (tamaño), con la IV compartida. */
function gexEn(oi, ivs, U, minutosAlCierre) {
  const T = Math.max(minutosAlCierre / 60 / 24 / 365, 1 / 24 / 365);
  const oiC = new Map(), oiP = new Map();
  for (const [clave, n] of Object.entries(oi)) {
    if (!(n > 0)) continue;
    const [ks, lado] = clave.split("|");
    (lado === "C" ? oiC : oiP).set(Number(ks), n);
  }
  let gC = 0, gP = 0, total = 0;
  for (const K of new Set([...oiC.keys(), ...oiP.keys()])) {
    const oC = oiC.get(K) ?? 0, oP = oiP.get(K) ?? 0;
    if (!oC && !oP) continue;
    total += oC + oP;
    // la IV del lado de FUERA del dinero; el de dentro la hereda
    const v = K >= U ? (ivs.C.get(K) ?? ivs.P.get(K)) : (ivs.P.get(K) ?? ivs.C.get(K));
    if (!(v > 0.01) || v > 4) continue;
    const g = gammaBS(U, K, T, v);
    if (!isFinite(g) || g <= 0) continue;
    const unidad = g * 100 * U * U * 0.01;
    gC += unidad * oC; gP += unidad * oP;
  }
  const bruto = gC + gP;
  return bruto > 0 ? { norm: (gC - gP) / bruto, dolares: (gC - gP) / 1e9, total } : null;
}

// ── recorrer ────────────────────────────────────────────────────────────────
const cierres = [];
const filas = [];
let sinIv = 0, sinOp = 0, sinGex = 0, medias = 0;

for (const dd of diasDisponibles()) {
  const d = cargarDia(dd);
  if (!d) continue;
  const cierre = d.barras[d.barras.length - 1].spot;

  const medir = dd >= "2024-01-01" && d.oi && !MEDIAS.has(dd) && hayHora(d, HORA) >= 0;
  if (medir && cierres.length >= 50) {
    const ma5 = cierres.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const ma50 = cierres.slice(-50).reduce((a, b) => a + b, 0) / 50;
    const i = idxHora(d, HORA);
    const U = d.barras[i].spot;
    const pasa = U > ma5 && U > ma50;                 // el filtro de «los tres síes»

    const op = estructura(d, i, "vencimiento", mariposa(rejilla(U), ALA));
    if (!op) sinOp++;
    else {
      const ivs = ivsDe(dd, HORA);
      if (!ivs) sinIv++;
      else {
        const g = gexEn(d.oi, ivs, U, 60);
        if (!g) sinGex++;
        else {
          // el termómetro de volatilidad del propio día, sin modelos: la cuna de las 09:35
          const b0 = d.barras[0], K0 = rejilla(b0.spot);
          const cc = compraEn(b0, K0, "C"), pp = compraEn(b0, K0, "P");
          const cuna = cc != null && pp != null ? (cc + pp) / b0.spot : null;
          filas.push({ dia: dd, anio: dd.slice(0, 4), pasa, dolares: op.dolares,
                       credito: op.credito * 100, gex: g.norm, gexUsd: g.dolares, cuna });
        }
      }
    }
  } else if (medir && MEDIAS.has(dd)) medias++;
  cierres.push(cierre);
}

const con = filas.filter((f) => f.pasa && f.cuna != null);
console.log(`## ${filas.length} días desde 2024 con GEX calculado · ${con.length} pasan el filtro de medias`);
console.log(`   descartes: sin operación ${sinOp} · sin IV ${sinIv} · sin GEX ${sinGex} · medias sesiones ${medias}\n`);

const sum = (v) => v.reduce((a, b) => a + b, 0);
const med = (v) => sum(v) / v.length;
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };
const sd = (v) => Math.sqrt(sum(v.map((x) => (x - med(v)) ** 2)) / (v.length - 1));

// sanidad: los números tienen que reconciliar con los $11.405/año del informe
const todo = con.map((f) => f.dolares);
console.log(`### SANIDAD — la regla entera, sin partir`);
console.log(`   n=${con.length} · $${(sum(todo) / ANOS).toFixed(0)}/año · mediana $${mediana(todo).toFixed(0)} · peor $${Math.min(...todo).toFixed(0)} · acierta ${(100 * todo.filter((x) => x > 0).length / todo.length).toFixed(0)}%`);
console.log(`   crédito medio $${med(con.map((f) => f.credito)).toFixed(0)} · GEX normalizado de ${Math.min(...con.map((f) => f.gex)).toFixed(2)} a ${Math.max(...con.map((f) => f.gex)).toFixed(2)}\n`);

function escalera(campo, etiqueta, datos = con) {
  const ord = [...datos].sort((a, b) => a[campo] - b[campo]);
  const paso = Math.floor(ord.length / 5);
  if (paso < 15) { console.log(`  ${etiqueta}: muestra insuficiente (${ord.length})\n`); return null; }
  console.log(`  ${etiqueta}`);
  console.log(`    montón |  señal  |  $/año  | $ por op | mediana | peor día | acierta | n`);
  const sal = [];
  for (let q = 0; q < 5; q++) {
    const t = ord.slice(q * paso, q === 4 ? ord.length : (q + 1) * paso);
    const v = t.map((x) => x.dolares);
    const porAno = sum(v) / (t.length / 244);
    sal.push(porAno);
    console.log(`      ${q + 1}    | ${med(t.map((x) => x[campo])).toFixed(3).padStart(7)} | ${porAno.toFixed(0).padStart(7)} | ${med(v).toFixed(0).padStart(8)} | ${mediana(v).toFixed(0).padStart(7)} | ${Math.min(...v).toFixed(0).padStart(8)} |   ${(100 * v.filter((x) => x > 0).length / v.length).toFixed(0).padStart(3)}%  | ${t.length}`);
  }
  const sube = sal.every((v, j) => j === 0 || v >= sal[j - 1]);
  const baja = sal.every((v, j) => j === 0 || v <= sal[j - 1]);
  console.log(`    del 1 al 5: ${(sal[4] - sal[0]).toFixed(0)} $/año · monótona: ${sube ? "SÍ, sube" : baja ? "SÍ, baja" : "NO"}\n`);
  return sal;
}

console.log("### LA PREGUNTA: ¿va mejor la mariposa los días de GEX alto?\n");
escalera("gex", "REAL — ordenado por el GEX normalizado de las 15:00");

// (a) barajado
const baraj = con.map((f, j) => ({ ...f, gexBaraj: con[(j + 37) % con.length].gex }));
escalera("gexBaraj", "BARAJADO — ordenado por el GEX de otro día", baraj);

// (b) volatilidad
escalera("cuna", "VOLATILIDAD — ordenado por la cuna de las 09:35 (barata primero)");

// (c) el GEX DENTRO de tercios de volatilidad
console.log("### EL CONTROL QUE MATA A TODO LO DEMÁS: el GEX dentro de tercios de volatilidad\n");
const porCuna = [...con].sort((a, b) => a.cuna - b.cuna);
const t3 = Math.floor(porCuna.length / 3);
for (const [et, trozo] of [["tercio TRANQUILO", porCuna.slice(0, t3)],
                            ["tercio MEDIO", porCuna.slice(t3, 2 * t3)],
                            ["tercio MOVIDO", porCuna.slice(2 * t3)]]) {
  const ord = [...trozo].sort((a, b) => a.gex - b.gex);
  const mitad = Math.floor(ord.length / 2);
  const bajo = ord.slice(0, mitad).map((x) => x.dolares), alto = ord.slice(-mitad).map((x) => x.dolares);
  const t = (med(alto) - med(bajo)) / Math.sqrt(sd(alto) ** 2 / alto.length + sd(bajo) ** 2 / bajo.length);
  console.log(`  ${et.padEnd(18)} GEX bajo $${med(bajo).toFixed(0).padStart(5)}/op   GEX alto $${med(alto).toFixed(0).padStart(5)}/op   diferencia $${(med(alto) - med(bajo)).toFixed(0).padStart(5)}  t=${t.toFixed(2)}  n=${trozo.length}`);
}

// año a año del montón bueno, si lo hay
console.log("\n### AÑO A AÑO del tercio de GEX más alto contra el más bajo\n");
const ordG = [...con].sort((a, b) => a.gex - b.gex);
const tt = Math.floor(ordG.length / 3);
const gBajo = new Set(ordG.slice(0, tt).map((x) => x.dia)), gAlto = new Set(ordG.slice(-tt).map((x) => x.dia));
console.log("  año    GEX bajo        GEX alto");
for (const a of ["2024", "2025", "2026"]) {
  const b = con.filter((f) => f.anio === a && gBajo.has(f.dia)).map((f) => f.dolares);
  const al = con.filter((f) => f.anio === a && gAlto.has(f.dia)).map((f) => f.dolares);
  if (!b.length || !al.length) continue;
  console.log(`  ${a}   $${sum(b).toFixed(0).padStart(7)} (${b.length})   $${sum(al).toFixed(0).padStart(7)} (${al.length})`);
}
