// EL DESBALANCE DE INTERÉS ABIERTO COMO DIRECCIÓN — ¿apunta a algún sitio?
//
// ═══ QUÉ MIDE Y POR QUÉ ═════════════════════════════════════════════════════════════════════
//
// Cuando el mercado abre, ya hay contratos vivos de la noche anterior (el interés abierto).
// Cerca del precio actual hay un montón de calls y un montón de puts. La pregunta es de las
// más viejas del oficio: ¿ese reparto dice algo de hacia dónde va a moverse el índice HOY?
//
// Hay dos cuentos, y son contrarios. Los dos suenan bien y por eso hay que medirlos:
//   · «mucha call = sube»  — quien vendió esas calls está corto de ellas y, si el precio sube,
//     tiene que ir comprando índice para taparse. Se retroalimenta hacia arriba.
//   · «mucha call = techo» — ahí está el papel; el precio llega, se lo comen, y no pasa.
//
// Aquí se prueban LAS DOS. Y de tres maneras distintas, porque no son lo mismo:
//   1. por NÚMERO de contratos                     (un contrato es un contrato)
//   2. PONDERADO por lo cerca que está del dinero  (lo pegado al precio pesa más)
//   3. por NOCIONAL (contratos × 100 × strike)     (el dinero que representa)
// Y con tres anchos de ventana alrededor del precio de apertura: ±30, ±50 y ±100 puntos.
//
// ═══ CÓMO SE DECIDE SI ES SEÑAL O ES RUIDO ══════════════════════════════════════════════════
//
// Los días se parten en CINCO CUBOS por nivel de desbalance y se enseña la escalera entera.
// Una señal de verdad va subiendo (o bajando) cubo a cubo. Si el cubo 1 y el 5 son altos y los
// del medio bajos, eso no es una señal: son dos casillas que salieron bien por azar.
//
// Contra qué se compara, siempre:
//   a) EL CONTROL TONTO — la misma compra todos los días, sin mirar el desbalance.
//   b) LAS DOS MITADES y LOS TRES TERCIOS del período. Si una es negativa, se dice.
//   c) EL BARAJADO — la misma regla usando el desbalance de OTRO día (índice desplazado 37
//      puestos; no se usa azar de verdad porque estos scripts no pueden).
//   d) EL LADO CONTRARIO — si comprar calls «funciona», comprar puts tiene que fallar. Si las
//      dos funcionan, lo que se ha encontrado es volatilidad, no dirección.
//
// Precios reales: se compra al ASK y se vende al BID, siempre (lo hace operar(), no se puede
// desactivar). Los huecos de precio se cuentan aparte, nunca se convierten en cero.
//
// Ejecutar:  node --import tsx scripts/e8-desbalance-de-oi.mjs

import { diasDisponibles, cargarDia, operar, idxHora, rejilla, resumen } from "./lib0dte.mjs";

// ─── la rejilla de parámetros ───────────────────────────────────────────────────────────────
const VENTANAS = [30, 50, 100];                     // ± puntos alrededor del spot de apertura
const MEDIDAS = ["contratos", "ponderado", "nocional"];
const ENTRADAS = ["10:00", "10:30", "11:00"];       // hora fija de compra
const SALIDAS = ["11:00", "12:00", "13:00", "14:00", "15:00", "cierre"];
const OFFS = [0, 5, 10];                            // puntos FUERA del dinero (call arriba, put abajo)
const LADOS = ["C", "P"];
const DESPLAZA = 37;                                // el barajado: señal del día i+37

const claveT = (e, s, off, lado) => `${e}>${s}|${off}|${lado}`;

// ─── PASO 1: una sola pasada por los datos ──────────────────────────────────────────────────
// De cada día se sacan (a) los nueve desbalances del arranque y (b) el retorno de todas las
// operaciones de la rejilla. Después ya no se vuelven a tocar los ficheros.

const dias = diasDisponibles();
console.log(`días con cadena 0DTE: ${dias.length}  (${dias[0]} … ${dias.at(-1)})`);

const filas = [];
let sinOI = 0, sinBarras = 0, huecos = 0, intentos = 0;
const costes = [];                                   // para el control de cordura del precio

for (const d of dias) {
  const D = cargarDia(d);
  if (!D) { sinBarras++; continue; }
  if (!D.oi) { sinOI++; continue; }

  const sp0 = D.barras[0].spot;                      // primera barra del día (09:35)

  // --- los nueve desbalances, todos del OI del ARRANQUE ---
  const sig = {};
  let sigOk = true;
  for (const W of VENTANAS) {
    let cC = 0, cP = 0, wC = 0, wP = 0, nC = 0, nP = 0;
    for (const k in D.oi) {
      const barra = k.indexOf("|");
      const K = +k.slice(0, barra);
      const lado = k.slice(barra + 1);
      const dist = Math.abs(K - sp0);
      if (!(dist <= W)) continue;
      const oi = D.oi[k];
      if (!(oi > 0)) continue;                       // un OI de 0 no aporta nada a ningún lado
      const peso = 1 - dist / W;                     // pegado al dinero pesa 1, en el borde 0
      const noc = oi * 100 * K;
      if (lado === "C") { cC += oi; wC += oi * peso; nC += noc; }
      else { cP += oi; wP += oi * peso; nP += noc; }
    }
    const raz = (a, b) => (a + b > 0 ? (a - b) / (a + b) : null);
    const v = { contratos: raz(cC, cP), ponderado: raz(wC, wP), nocional: raz(nC, nP) };
    for (const m of MEDIDAS) {
      if (v[m] == null) sigOk = false;
      sig[`${m}${W}`] = v[m];
    }
  }
  if (!sigOk) { sinOI++; continue; }

  // --- todas las operaciones de la rejilla, con precios reales ---
  const r = {};
  const dol = {};
  const sp = {};                                     // el SPX en cada hora, para medir el MOVIMIENTO
  for (const h of [...ENTRADAS, ...SALIDAS]) {
    const i = h === "cierre" ? D.barras.length - 1 : idxHora(D, h);
    if (i >= 0) sp[h] = D.barras[i].spot;
  }
  for (const he of ENTRADAS) {
    const ie = idxHora(D, he);
    if (ie < 0) continue;
    const spotE = D.barras[ie].spot;
    for (const hs of SALIDAS) {
      const is = hs === "cierre" ? D.barras.length - 1 : idxHora(D, hs);
      if (is < 0 || is <= ie) continue;
      for (const off of OFFS) {
        for (const lado of LADOS) {
          const K = rejilla(spotE) + (lado === "C" ? off : -off);
          intentos++;
          const op = operar(D, ie, is, K, lado);
          if (!op) { huecos++; continue; }            // un hueco NO es un cero
          const c = claveT(he, hs, off, lado);
          r[c] = op.ret;
          dol[c] = op.dolares;
          if (he === "10:00" && hs === "cierre" && off === 0) costes.push(op.coste);
        }
      }
    }
  }
  filas.push({ dia: d, sp0, sig, r, dol, sp });
}

const N = filas.length;
const anos = N / 252;
console.log(`días usados: ${N}   sin OI: ${sinOI}   sin barras: ${sinBarras}`);
console.log(`operaciones intentadas: ${intentos}   huecos (sin precio): ${huecos}  (${(100 * huecos / intentos).toFixed(2)}%)`);
costes.sort((a, b) => a - b);
console.log(`coste de entrada (call al dinero, 10:00): min $${costes[0]?.toFixed(2)}  mediana $${costes[Math.floor(costes.length / 2)]?.toFixed(2)}  max $${costes.at(-1)?.toFixed(2)}   n=${costes.length}`);
{
  const s = filas.map((f) => f.sig.contratos50).sort((a, b) => a - b);
  console.log(`desbalance contratos±50: min ${s[0].toFixed(3)}  mediana ${s[Math.floor(s.length / 2)].toFixed(3)}  max ${s.at(-1).toFixed(3)}`);
}
if (N < 500 || huecos / intentos > 0.5 || !(costes[Math.floor(costes.length / 2)] > 0.5)) {
  throw new Error("los controles de cordura no pasan — parar antes de medir nada");
}

// ─── PASO 2: la escalera de cinco cubos ─────────────────────────────────────────────────────

/** Reparte los índices en 5 cubos por el valor de `val`, de menor a mayor. */
function cubos(items) {
  const orden = [...items].sort((a, b) => a.s - b.s);
  const out = [[], [], [], [], []];
  for (let i = 0; i < orden.length; i++) out[Math.min(4, Math.floor((5 * i) / orden.length))].push(orden[i].v);
  return out;
}

/** ¿Los cinco números suben siempre, o bajan siempre? */
function monotona(m) {
  let sube = true, baja = true;
  for (let i = 1; i < m.length; i++) { if (!(m[i] > m[i - 1])) sube = false; if (!(m[i] < m[i - 1])) baja = false; }
  return sube ? +1 : baja ? -1 : 0;
}

const clavesSig = [];
for (const m of MEDIDAS) for (const W of VENTANAS) clavesSig.push(`${m}${W}`);

const configs = [];
for (const he of ENTRADAS) for (const hs of SALIDAS) for (const off of OFFS) for (const lado of LADOS) {
  const c = claveT(he, hs, off, lado);
  if (filas.some((f) => f.r[c] != null)) configs.push({ he, hs, off, lado, c });
}
console.log(`\nconfiguraciones de compra/venta válidas: ${configs.length}   señales: ${clavesSig.length}   celdas: ${configs.length * clavesSig.length}`);

const tabla = [];
for (const ks of clavesSig) {
  for (const cf of configs) {
    const items = [];
    for (const f of filas) if (f.r[cf.c] != null) items.push({ s: f.sig[ks], v: f.r[cf.c] });
    if (items.length < 400) continue;
    const cb = cubos(items).map((v) => resumen(v));
    const mono = monotona(cb.map((x) => x.media));
    const todo = resumen(items.map((x) => x.v));
    // el cubo extremo que la teoría señalaría: el de arriba si la escalera sube, el de abajo si baja
    const ext = mono === +1 ? cb[4] : mono === -1 ? cb[0] : (cb[4].media > cb[0].media ? cb[4] : cb[0]);
    tabla.push({ ks, cf, cb, mono, todo, ext, extEs: mono === -1 ? 0 : 4 });
  }
}

const monos = tabla.filter((x) => x.mono !== 0);
console.log(`celdas medidas: ${tabla.length}`);
console.log(`escaleras monótonas de 5 cubos: ${monos.length}  (${(100 * monos.length / tabla.length).toFixed(1)}%)   por puro azar se esperaría ~1,7%`);

// ─── PASO 3: enseñar las escaleras completas de las nueve señales, con una salida fija ──────
const REF = { he: "10:00", hs: "cierre", off: 0 };
console.log(`\n═══ LA ESCALERA COMPLETA — comprar al dinero a las ${REF.he}, salir al ${REF.hs} ═══`);
for (const lado of LADOS) {
  console.log(`\n  ── comprando ${lado === "C" ? "CALLS" : "PUTS "} ── (media de retorno por operación, %)`);
  console.log(`  ${"señal".padEnd(16)} ${"cubo1".padStart(8)}${"cubo2".padStart(8)}${"cubo3".padStart(8)}${"cubo4".padStart(8)}${"cubo5".padStart(8)}   monótona   control tonto`);
  for (const ks of clavesSig) {
    const fila = tabla.find((x) => x.ks === ks && x.cf.he === REF.he && x.cf.hs === REF.hs && x.cf.off === REF.off && x.cf.lado === lado);
    if (!fila) continue;
    const m = fila.cb.map((x) => (100 * x.media).toFixed(1).padStart(8)).join("");
    console.log(`  ${ks.padEnd(16)}${m}   ${fila.mono === 0 ? "   no   " : fila.mono > 0 ? "  SUBE  " : "  BAJA  "}   ${(100 * fila.todo.media).toFixed(1).padStart(7)}%`);
  }
}

// ─── PASO 4: la mejor candidata, y todos sus controles ──────────────────────────────────────

/** El retorno del cubo `ib` de una celda, con la señal que se le pase (real o barajada). */
function celda(ks, cf, desplaza = 0, sub = null) {
  const items = [];
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    if (sub && !sub(i)) continue;
    if (f.r[cf.c] == null) continue;
    const s = filas[(i + desplaza) % filas.length].sig[ks];
    items.push({ s, v: f.r[cf.c], d: f.dol[cf.c] });
  }
  return items;
}
function cubosCon(items, ib) {
  const orden = [...items].sort((a, b) => a.s - b.s);
  const out = [];
  for (let i = 0; i < orden.length; i++) if (Math.min(4, Math.floor((5 * i) / orden.length)) === ib) out.push(orden[i]);
  return out;
}

// candidatas: escalera monótona Y el cubo extremo bate al control tonto
const cand = monos
  .filter((x) => x.ext.media > x.todo.media)
  .sort((a, b) => b.ext.t - a.ext.t);

console.log(`\n═══ CANDIDATAS (escalera monótona + cubo extremo por encima del control tonto): ${cand.length} ═══`);
for (const x of cand.slice(0, 12)) {
  console.log(`  ${x.ks.padEnd(16)} ${x.cf.he}→${x.cf.hs} off${x.cf.off} ${x.cf.lado}  cubo${x.extEs + 1}: ${(100 * x.ext.media).toFixed(2)}% (n=${x.ext.n}, t=${x.ext.t.toFixed(2)}, aciertos ${(100 * x.ext.aciertos).toFixed(0)}%)  tonto ${(100 * x.todo.media).toFixed(2)}%`);
}

const mejor = cand[0];
if (!mejor) {
  console.log("\nNINGUNA candidata: ninguna escalera monótona bate a su propio control tonto.");
} else {
  const { ks, cf, extEs } = mejor;
  console.log(`\n═══ LA MEJOR: ${ks}  ·  comprar ${cf.lado === "C" ? "CALL" : "PUT"} ${cf.off ? cf.off + " pts fuera del dinero" : "al dinero"} a las ${cf.he}, salir a ${cf.hs}  ·  cubo ${extEs + 1} de 5 ═══`);

  const base = cubosCon(celda(ks, cf), extEs);
  const R = resumen(base.map((x) => x.v));
  const D$ = base.reduce((a, b) => a + b.d, 0) / base.length;
  const opsAno = base.length / anos;
  console.log(`  n=${R.n}  media ${(100 * R.media).toFixed(2)}%  t=${R.t.toFixed(2)}  aciertos ${(100 * R.aciertos).toFixed(1)}%`);
  console.log(`  $/operación ${D$.toFixed(2)}  ·  operaciones/año ${opsAno.toFixed(1)}  ·  $${(D$ * opsAno).toFixed(0)}/año con UN contrato`);

  const tonto = resumen(celda(ks, cf).map((x) => x.v));
  console.log(`  a) CONTROL TONTO (todos los días, misma compra): n=${tonto.n} media ${(100 * tonto.media).toFixed(2)}%  t=${tonto.t.toFixed(2)}`);

  const mitad = Math.floor(filas.length / 2);
  const m1 = resumen(cubosCon(celda(ks, cf, 0, (i) => i < mitad), extEs).map((x) => x.v));
  const m2 = resumen(cubosCon(celda(ks, cf, 0, (i) => i >= mitad), extEs).map((x) => x.v));
  console.log(`  b) MITADES: 1ª ${(100 * m1.media).toFixed(2)}% (n=${m1.n})   2ª ${(100 * m2.media).toFixed(2)}% (n=${m2.n})`);
  const t3 = Math.floor(filas.length / 3);
  const corte = [0, t3, 2 * t3, filas.length];
  const ter = [0, 1, 2].map((k) =>
    resumen(cubosCon(celda(ks, cf, 0, (i) => i >= corte[k] && i < corte[k + 1]), extEs).map((x) => x.v)));
  console.log(`     TERCIOS: ${ter.map((x) => `${(100 * x.media).toFixed(2)}% (n=${x.n})`).join("  ·  ")}`);

  const baraj = resumen(cubosCon(celda(ks, cf, DESPLAZA), extEs).map((x) => x.v));
  console.log(`  c) BARAJADO (señal del día i+${DESPLAZA}): media ${(100 * baraj.media).toFixed(2)}%  t=${baraj.t.toFixed(2)}  n=${baraj.n}`);

  const cfOtro = { ...cf, lado: cf.lado === "C" ? "P" : "C", c: claveT(cf.he, cf.hs, cf.off, cf.lado === "C" ? "P" : "C") };
  const contra = resumen(cubosCon(celda(ks, cfOtro), extEs).map((x) => x.v));
  console.log(`  d) LADO CONTRARIO (mismo cubo, comprando ${cf.lado === "C" ? "PUTS" : "CALLS"}): media ${(100 * contra.media).toFixed(2)}%  t=${contra.t.toFixed(2)}  n=${contra.n}`);

  console.log(`\n  RESUMEN-JSON ${JSON.stringify({
    ks, cf: `${cf.he}>${cf.hs} off${cf.off} ${cf.lado} cubo${extEs + 1}`,
    n: R.n, mediaPct: +(100 * R.media).toFixed(2), t: +R.t.toFixed(2), aciertos: +R.aciertos.toFixed(3),
    dolaresPorAno: Math.round(D$ * opsAno), listonPct: +(100 * tonto.media).toFixed(2),
    mitad1Pct: +(100 * m1.media).toFixed(2), mitad2Pct: +(100 * m2.media).toFixed(2),
    tercios: ter.map((x) => (100 * x.media).toFixed(1)).join(" / "),
    barajadoPct: +(100 * baraj.media).toFixed(2), ladoContrarioPct: +(100 * contra.media).toFixed(2),
    huecos, escalerasMonotonas: monos.length, celdas: tabla.length,
  })}`);
}

// ─── PASO 5: ¿y si el efecto está sólo en el trozo del día, no en el cierre? ────────────────
// El encargo pregunta por el VIAJE intradía. Se enseña, para la señal más limpia de cada
// medida, cómo cambia el extremo con la hora de salida.
console.log(`\n═══ CÓMO CAMBIA CON LA HORA DE SALIDA (comprar al dinero a las 10:00, cubo 5 vs cubo 1) ═══`);
for (const ks of ["contratos30", "ponderado50", "nocional100"]) {
  for (const lado of LADOS) {
    const linea = [];
    for (const hs of SALIDAS) {
      const cf = configs.find((x) => x.he === "10:00" && x.hs === hs && x.off === 0 && x.lado === lado);
      if (!cf) { linea.push("   —  "); continue; }
      const it = celda(ks, cf);
      const c5 = resumen(cubosCon(it, 4).map((x) => x.v)).media;
      const c1 = resumen(cubosCon(it, 0).map((x) => x.v)).media;
      linea.push((100 * (c5 - c1)).toFixed(1).padStart(7));
    }
    console.log(`  ${ks.padEnd(14)} ${lado}  ${SALIDAS.map((s) => s.padStart(7)).join("")}`);
    console.log(`  ${"".padEnd(14)}    ${linea.join("")}   (cubo5 − cubo1, puntos de %)`);
  }
}

// ─── PASO 6: el único dibujo que se ve a ojo, medido en serio ───────────────────────────────
// En la tabla de arriba, el cubo 5 (mucho OI de CALLS) comprando PUTS sale por encima del
// cubo 1 casi a todas las horas de salida. Sería el cuento del «techo». Se mide con t, con el
// control tonto, con las mitades y con la señal barajada — que es donde se cae todo aquí.
console.log(`\n═══ EL CUENTO DEL TECHO, MEDIDO: cubo 5 (mucha call) comprando PUTS al dinero 10:00→12:00 ═══`);
console.log(`  ${"señal".padEnd(14)} ${"media".padStart(8)} ${"t".padStart(6)} ${"n".padStart(5)}  ${"tonto".padStart(8)} ${"mitad1".padStart(8)} ${"mitad2".padStart(8)} ${"barajado".padStart(9)} ${"calls c5".padStart(9)}`);
{
  const cfP = configs.find((x) => x.he === "10:00" && x.hs === "12:00" && x.off === 0 && x.lado === "P");
  const cfC = configs.find((x) => x.he === "10:00" && x.hs === "12:00" && x.off === 0 && x.lado === "C");
  const mitad = Math.floor(filas.length / 2);
  for (const ks of clavesSig) {
    const R = resumen(cubosCon(celda(ks, cfP), 4).map((x) => x.v));
    const T = resumen(celda(ks, cfP).map((x) => x.v));
    const A = resumen(cubosCon(celda(ks, cfP, 0, (i) => i < mitad), 4).map((x) => x.v));
    const B = resumen(cubosCon(celda(ks, cfP, 0, (i) => i >= mitad), 4).map((x) => x.v));
    const S = resumen(cubosCon(celda(ks, cfP, DESPLAZA), 4).map((x) => x.v));
    const C = resumen(cubosCon(celda(ks, cfC), 4).map((x) => x.v));
    const p = (x) => (100 * x.media).toFixed(2).padStart(8);
    console.log(`  ${ks.padEnd(14)} ${p(R)} ${R.t.toFixed(2).padStart(6)} ${String(R.n).padStart(5)}  ${p(T)} ${p(A)} ${p(B)} ${p(S).padStart(9)} ${p(C).padStart(9)}`);
  }
}

// ─── PASO 7: ¿es el barajado un barajado de verdad? ─────────────────────────────────────────
// El desbalance de OI cambia poco de un día para otro, así que desplazar 37 puestos puede no
// romper nada: la señal «barajada» seguiría diciendo casi lo mismo que la de verdad. Se mide
// la correlación a varios desplazamientos y se repite el control con desplazamientos grandes.
// Si a desplazamiento grande el cubo 5 sigue dando lo mismo, no hay señal, hay régimen.
console.log(`\n═══ ¿EL BARAJADO BARAJA? correlación de la señal consigo misma a distancia d ═══`);
{
  const corr = (a, b) => {
    const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const u = a[i] - ma, v = b[i] - mb; sxy += u * v; sxx += u * u; syy += v * v; }
    return sxy / Math.sqrt(sxx * syy);
  };
  for (const ks of ["contratos30", "ponderado50", "nocional100"]) {
    const s = filas.map((f) => f.sig[ks]);
    const l = [1, 5, 37, 131, 401, 559].map((d) => `d=${d}: ${corr(s, s.map((_, i) => s[(i + d) % s.length])).toFixed(2)}`);
    console.log(`  ${ks.padEnd(14)} ${l.join("   ")}`);
  }
  const cfP = configs.find((x) => x.he === "10:00" && x.hs === "12:00" && x.off === 0 && x.lado === "P");
  console.log(`\n  cubo 5 comprando PUTS 10:00→12:00, con la señal desplazada:`);
  console.log(`  ${"señal".padEnd(14)} ${"real".padStart(8)} ${"d=37".padStart(8)} ${"d=131".padStart(8)} ${"d=401".padStart(8)} ${"d=559".padStart(8)}   control tonto`);
  for (const ks of clavesSig) {
    const v = [0, 37, 131, 401, 559].map((d) => (100 * resumen(cubosCon(celda(ks, cfP, d), 4).map((x) => x.v)).media).toFixed(2).padStart(8));
    const T = (100 * resumen(celda(ks, cfP).map((x) => x.v)).media).toFixed(2);
    console.log(`  ${ks.padEnd(14)} ${v.join(" ")}   ${T.padStart(8)}%`);
  }
}

// ─── PASO 8: ¿se mueve el ÍNDICE, aunque la opción no lo cobre? ─────────────────────────────
// Una opción puede perder aunque el índice acierte: se paga prima y horquilla. Así que se mira
// el índice DESNUDO, en puntos, cubo a cubo. Si aquí tampoco hay escalera, no es que el peaje
// se coma la señal: es que no hay señal que comerse.
console.log(`
═══ EL MOVIMIENTO DEL SPX DESNUDO, EN PUNTOS, POR CUBO (sin opciones de por medio) ═══`);
console.log(`  ${"señal".padEnd(14)} ${"tramo".padEnd(16)} ${"cubo1".padStart(8)}${"cubo2".padStart(8)}${"cubo3".padStart(8)}${"cubo4".padStart(8)}${"cubo5".padStart(8)}   monótona`);
for (const ks of clavesSig) {
  for (const [ini, fin] of [["10:00", "12:00"], ["10:00", "cierre"]]) {
    const items = filas.filter((f) => f.sp[ini] != null && f.sp[fin] != null)
                       .map((f) => ({ s: f.sig[ks], v: f.sp[fin] - f.sp[ini] }));
    const cb = cubos(items).map((v) => resumen(v));
    const mm = cb.map((x) => x.media);
    console.log(`  ${ks.padEnd(14)} ${(ini + "→" + fin).padEnd(16)} ${mm.map((x) => x.toFixed(1).padStart(8)).join("")}   ${monotona(mm) === 0 ? "no" : monotona(mm) > 0 ? "SUBE" : "BAJA"}`);
  }
}

// ─── PASO 9: el único tirón que aparece, medido con lupa ────────────────────────────────────
// En la tabla de arriba el cubo 1 (mucha PUT) sube ~2 puntos de 10:00 a 12:00 y el cubo 5
// (mucha CALL) baja ~2. Va en la dirección del «techo» y sale igual en las nueve señales. Se
// mide la diferencia cubo5−cubo1 con su t y sus dos mitades, en puntos de SPX y en dólares.
console.log(`\n═══ CUBO5 − CUBO1 DEL SPX DESNUDO, 10:00→12:00 (puntos de índice) ═══`);
console.log(`  ${"señal".padEnd(14)} ${"c1".padStart(7)} ${"c5".padStart(7)} ${"c5-c1".padStart(7)} ${"t dif".padStart(7)} ${"mitad1".padStart(8)} ${"mitad2".padStart(8)} ${"baraj401".padStart(9)}`);
{
  const mitad = Math.floor(filas.length / 2);
  const mov = (f) => f.sp["12:00"] - f.sp["10:00"];
  const cub = (ks, d, sub) => {
    const it = filas.map((f, i) => ({ f, i })).filter(({ f, i }) => f.sp["10:00"] != null && f.sp["12:00"] != null && (!sub || sub(i)))
      .map(({ f, i }) => ({ s: filas[(i + d) % filas.length].sig[ks], v: mov(f) }));
    return [resumen(cubosCon(it, 0).map((x) => x.v)), resumen(cubosCon(it, 4).map((x) => x.v))];
  };
  for (const ks of clavesSig) {
    const [c1, c5] = cub(ks, 0);
    const dif = c5.media - c1.media;
    const se = Math.sqrt(c1.sd ** 2 / c1.n + c5.sd ** 2 / c5.n);
    const [a1, a5] = cub(ks, 0, (i) => i < mitad), [b1, b5] = cub(ks, 0, (i) => i >= mitad);
    const [z1, z5] = cub(ks, 401);
    console.log(`  ${ks.padEnd(14)} ${c1.media.toFixed(1).padStart(7)} ${c5.media.toFixed(1).padStart(7)} ${dif.toFixed(1).padStart(7)} ${(dif / se).toFixed(2).padStart(7)} ${(a5.media - a1.media).toFixed(1).padStart(8)} ${(b5.media - b1.media).toFixed(1).padStart(8)} ${(z5.media - z1.media).toFixed(1).padStart(9)}`);
  }
}

// ─── PASO 10: sin cubos y sin opciones — la correlación cruda, que no se puede elegir ───────
// Los cubos se pueden elegir a dedo. La correlación entre el desbalance y el movimiento del
// índice usa TODOS los días y todas las horas de una vez: es el número que no admite trampa.
console.log(`\n═══ CORRELACIÓN desbalance ↔ movimiento del SPX (todos los días, sin cubos) ═══`);
{
  const corr = (a, b) => {
    const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const u = a[i] - ma, v = b[i] - mb; sxy += u * v; sxx += u * u; syy += v * v; }
    const r = sxy / Math.sqrt(sxx * syy);
    return { r, t: (r * Math.sqrt(n - 2)) / Math.sqrt(1 - r * r), n };
  };
  const tramos = [["10:00", "11:00"], ["10:00", "12:00"], ["10:00", "13:00"], ["10:00", "14:00"], ["10:00", "15:00"], ["10:00", "cierre"]];
  console.log(`  ${"señal".padEnd(14)} ${tramos.map(([a, b]) => (a.slice(0, 2) + "→" + b.slice(0, 2)).padStart(12)).join("")}`);
  for (const ks of clavesSig) {
    const out = tramos.map(([ini, fin]) => {
      const f = filas.filter((x) => x.sp[ini] != null && x.sp[fin] != null);
      const c = corr(f.map((x) => x.sig[ks]), f.map((x) => x.sp[fin] - x.sp[ini]));
      return `${c.r.toFixed(3)}(t${c.t.toFixed(1)})`.padStart(12);
    });
    console.log(`  ${ks.padEnd(14)}${out.join("")}`);
  }
}

// ─── PASO 11: la ficha completa de la variante más fuerte de la familia ─────────────────────
// La mejor por t de toda la familia: cubo 5 del desbalance por contratos ±30 (mucha CALL),
// comprando PUT al dinero a las 10:00 y saliendo a las 12:00. Todos sus controles juntos.
console.log(`\n═══ FICHA — contratos30, cubo 5, PUT al dinero, 10:00→12:00 ═══`);
{
  const ks = "contratos30";
  const cfP = configs.find((x) => x.he === "10:00" && x.hs === "12:00" && x.off === 0 && x.lado === "P");
  const cfC = configs.find((x) => x.he === "10:00" && x.hs === "12:00" && x.off === 0 && x.lado === "C");
  const b = cubosCon(celda(ks, cfP), 4);
  const R = resumen(b.map((x) => x.v));
  const D$ = b.reduce((a, x) => a + x.d, 0) / b.length;
  const opsAno = b.length / anos;
  const mitad = Math.floor(filas.length / 2), t3 = Math.floor(filas.length / 3);
  const c = [0, t3, 2 * t3, filas.length];
  const ter = [0, 1, 2].map((k) => resumen(cubosCon(celda(ks, cfP, 0, (i) => i >= c[k] && i < c[k + 1]), 4).map((x) => x.v)));
  const m1 = resumen(cubosCon(celda(ks, cfP, 0, (i) => i < mitad), 4).map((x) => x.v));
  const m2 = resumen(cubosCon(celda(ks, cfP, 0, (i) => i >= mitad), 4).map((x) => x.v));
  const tonto = resumen(celda(ks, cfP).map((x) => x.v));
  const bar = [37, 131, 401, 559].map((d) => 100 * resumen(cubosCon(celda(ks, cfP, d), 4).map((x) => x.v)).media);
  const contra = resumen(cubosCon(celda(ks, cfC), 4).map((x) => x.v));
  console.log(JSON.stringify({
    n: R.n, mediaPct: +(100 * R.media).toFixed(2), t: +R.t.toFixed(2), aciertos: +R.aciertos.toFixed(3),
    dolaresPorOperacion: +D$.toFixed(2), operacionesPorAno: +opsAno.toFixed(1), dolaresPorAno: Math.round(D$ * opsAno),
    listonPct: +(100 * tonto.media).toFixed(2), mitad1Pct: +(100 * m1.media).toFixed(2), mitad2Pct: +(100 * m2.media).toFixed(2),
    tercios: ter.map((x) => (100 * x.media).toFixed(1)).join(" / "),
    barajados: bar.map((x) => x.toFixed(1)).join(" / "), barajadoMedio: +(bar.reduce((a, x) => a + x, 0) / bar.length).toFixed(2),
    ladoContrarioPct: +(100 * contra.media).toFixed(2), anos: +anos.toFixed(2),
  }, null, 0));
}
