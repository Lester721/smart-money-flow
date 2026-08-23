// ═══════════════════════════════════════════════════════════════════════════════════════════
// «LA CONDICIÓN DEL 21, ESCRITA COMO REGLA QUE SE PUEDE OPERAR»
//
// El 21 de agosto de 2026, el día que Eduardo ganó cuatro calls, se describe en una frase:
//
//     el precio abrió POR DEBAJO del imán (7700, +0,336%) y POR DEBAJO del punto de giro
//     (+0,275%), con el desbalance pegado al dinero (±0,5%) cargado de PUTS (−0,157).
//
// Aquí eso se escribe como una regla mecánica y se prueba en los 1.119 días de historia que
// tienen interés abierto:
//
//     SI a la primera barra (09:35) el imán está entre +A% y +B% por encima del precio,
//     Y el punto de giro también está por encima del precio,
//     Y el desbalance a ±0,5% es menor que D (o sea, cargado de puts),
//     ENTONCES compra una call a la hora E y véndela a la hora S.
//
// Se barren A, B, D, la hora de entrada, la hora de salida y qué strike se compra.
//
// ═══ LOS CONTROLES, QUE SON LO QUE DECIDE ══════════════════════════════════════════════════
//
//  1. LA REGLA ESPEJO (imán por DEBAJO → compra PUT). Si las dos «funcionan», lo que se ha
//     encontrado es volatilidad, no dirección.
//  2. EL PERFIL BARAJADO: la misma regla, pero leyendo el imán/giro/desbalance de OTRO día
//     y aplicándolo al precio de hoy. Se baraja la DISTANCIA en % (no el nivel en bruto:
//     el SPX pasó de 4.700 a 7.700 y un nivel en bruto cae fuera del rango del día, lo que
//     da OTRA regla y no un control — ese fallo ya se cometió en este proyecto).
//  3. Para el grupo de días que dispara la mejor casilla: días al AZAR, días emparejados por
//     TAMAÑO de la cadena y días emparejados por VOLATILIDAD del día (precio de la cuna al
//     dinero a las 09:35), todos del mismo tamaño de grupo.
//  4. FUERA DE MUESTRA: la casilla se elige mirando SÓLO días anteriores a 2025-01-01 y se
//     comprueba en 2025-2026.
//
// Precios REALES: se compra al ask y se vende al bid, siempre. Un hueco no es un cero.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import {
  diasDisponibles, cargarDia, cargarDia21, perfilGex,
  operar, idxHora, hayHora, rejilla, compraEn, resumen,
} from "./lib0dte.mjs";

const AÑOS = 1123 / 244;                    // calendario REAL: 244 días de mercado al año
const t0 = Date.now();
const log = (...a) => console.log(...a);
const f2 = (x) => (x == null || Number.isNaN(x) ? "  n/d " : x.toFixed(2).padStart(7));
const f3 = (x) => (x == null || Number.isNaN(x) ? "  n/d " : x.toFixed(3).padStart(7));
const usd = (x) => (x >= 0 ? "+" : "−") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");

// ── las rejillas que se barren ─────────────────────────────────────────────────────────────
const HORAS_E = ["09:35", "09:45", "09:55", "10:05", "10:15"];
const HORAS_S = ["10:30", "11:00", "11:30", "12:00", "13:00"];
const VAR_K = ["atm", "iman", "iman1"];     // qué call se compra: la del dinero, la del imán de
                                            // ±2% o la del imán de ±1% (la definición estable)
const REJ_A = [0.0, 0.10, 0.20, 0.30];      // borde inferior de la distancia al imán, en %
const REJ_B = [0.30, 0.50, 0.75, 1.00];     // borde superior
const REJ_D = [-0.30, -0.20, -0.10, 0.00];  // techo del desbalance a ±0,5% (cargado de puts)

/** El strike con más interés abierto TOTAL dentro de ±radio del precio, y su distancia en %. */
function imanEn(oi, spot, radio) {
  const tot = new Map();
  for (const [clave, n] of Object.entries(oi)) {
    if (!(n > 0)) continue;
    const K = Number(clave.split("|")[0]);
    if (!(K > 0)) continue;
    if (Math.abs((K - spot) / spot) >= radio) continue;
    tot.set(K, (tot.get(K) ?? 0) + n);
  }
  let mejorK = null, mejorN = -1;
  for (const [K, n] of tot) if (n > mejorN) { mejorN = n; mejorK = K; }
  return { K: mejorK, pct: mejorK == null ? null : ((mejorK - spot) / spot) * 100 };
}

// ═══ 1. CARGAR LA HISTORIA ═════════════════════════════════════════════════════════════════
const dias = diasDisponibles();
log(`\n═══ CARGANDO ═══  ${dias.length} días de cadena 0DTE de SPXW`);

const H = [];                 // la historia, un objeto por día
let sinOI = 0, sinPerfil = 0, huecos = 0, opsTotal = 0;
const costes = [];

for (const d of dias) {
  const dd = cargarDia(d);
  if (!dd) continue;
  if (!dd.oi) { sinOI++; continue; }
  const spot0 = dd.barras[0].spot;
  const p = perfilGex(dd.oi, spot0);
  if (!p) { sinPerfil++; continue; }

  // EL IMÁN DE ±1%, segunda definición. La de ±2% resultó ser de filo de cuchillo (ver más
  // abajo: el 21 cambia de imán +0,34% a imán −1,92% con que el índice se mueva 7 puntos).
  p.imanPct1 = imanEn(dd.oi, spot0, 0.01).pct;
  p.imanK1 = imanEn(dd.oi, spot0, 0.01).K;
  // fragilidad: ¿el imán de ±2% sigue siendo el mismo si el precio se mueve un 0,1%?
  p.imanEstable2 =
    imanEn(dd.oi, spot0 * 1.001, 0.02).K === p.imanK && imanEn(dd.oi, spot0 * 0.999, 0.02).K === p.imanK;
  p.imanEstable1 =
    imanEn(dd.oi, spot0 * 1.001, 0.01).K === p.imanK1 && imanEn(dd.oi, spot0 * 0.999, 0.01).K === p.imanK1;

  // la cuna al dinero a las 09:35: mide la volatilidad que el mercado le pone AL PROPIO DÍA
  const Katm0 = rejilla(spot0);
  const cC = compraEn(dd.barras[0], Katm0, "C"), cP = compraEn(dd.barras[0], Katm0, "P");
  const vol = cC != null && cP != null ? ((cC + cP) / spot0) * 100 : null;

  // ── todas las operaciones posibles, calculadas UNA vez ────────────────────────────────
  //    ops[lado][variante de strike][hora entrada][hora salida] = $ de un contrato
  const ops = {}, cst = {};
  for (const lado of ["C", "P"]) {
    ops[lado] = {}; cst[lado] = {};
    for (const vk of VAR_K) {
      ops[lado][vk] = HORAS_E.map(() => HORAS_S.map(() => null));
      cst[lado][vk] = HORAS_E.map(() => HORAS_S.map(() => null));
      for (let ie = 0; ie < HORAS_E.length; ie++) {
        const iE = hayHora(dd, HORAS_E[ie]);
        if (iE < 0) continue;
        const spotE = dd.barras[iE].spot;
        // el strike: el del dinero en la barra de entrada, o el strike imán del día
        let K;
        if (vk === "atm") K = rejilla(spotE);
        else if (vk === "iman") K = p.imanK;         // el strike imán de ±2%
        else K = p.imanK1;                           // el strike imán de ±1%
        if (!(K > 0)) continue;
        for (let is = 0; is < HORAS_S.length; is++) {
          const iS = hayHora(dd, HORAS_S[is]);
          if (iS < 0 || iS <= iE) continue;
          const r = operar(dd, iE, iS, K, lado);
          opsTotal++;
          if (!r) { huecos++; continue; }
          ops[lado][vk][ie][is] = r.dolares;
          cst[lado][vk][ie][is] = r.coste;
          if (lado === "C" && vk === "atm" && ie === 2 && is === 1) costes.push(r.coste);
        }
      }
    }
  }

  H.push({
    dia: d, año: +d.slice(0, 4), spot0, p, vol, ops, cst,
    cierre: dd.barras[dd.barras.length - 1].spot,
  });
}

log(`  días con cadena ....... ${dias.length}`);
log(`  sin interés abierto ... ${sinOI}`);
log(`  sin perfil ............ ${sinPerfil}`);
log(`  días usables .......... ${H.length}   (${H[0].dia} → ${H[H.length - 1].dia})`);
log(`  operaciones evaluadas . ${opsTotal.toLocaleString("es-ES")}`);
log(`  huecos (descartadas) .. ${huecos.toLocaleString("es-ES")}  (${((huecos / opsTotal) * 100).toFixed(2)} %)`);
costes.sort((a, b) => a - b);
log(`  SANIDAD de coste — call ATM comprada 09:55, vendida 11:00:`);
log(`     mín $${costes[0].toFixed(2)}  ·  p25 $${costes[Math.floor(costes.length * 0.25)].toFixed(2)}` +
    `  ·  mediana $${costes[Math.floor(costes.length / 2)].toFixed(2)}` +
    `  ·  p75 $${costes[Math.floor(costes.length * 0.75)].toFixed(2)}` +
    `  ·  máx $${costes[costes.length - 1].toFixed(2)}   (n=${costes.length})`);
log(`  (el encargo dice: una call 0DTE cerca del dinero a media mañana cuesta entre $2 y $25)`);

// ═══ 2. DÓNDE CAE EL 21 DENTRO DE LA HISTORIA ══════════════════════════════════════════════
const d21 = cargarDia21();
const p21 = d21 ? perfilGex(d21.oi, d21.barras.find((b) => b.t === "09:35").spot) : null;

log(`\n═══ EL 21 DE AGOSTO CONTRA LOS ${H.length} DÍAS ═══`);
log(`  (todo medido en la primera barra que la historia tiene, 09:35, para comparar igual con igual)`);
if (p21) {
  p21.imanPct1 = imanEn(d21.oi, d21.barras.find((b) => b.t === "09:35").spot, 0.01).pct;
  const pct = (campo, v) => {
    const xs = H.map((h) => h.p[campo]).filter((x) => x != null).sort((a, b) => a - b);
    const k = xs.filter((x) => x < v).length;
    return { pctil: (k / xs.length) * 100, mediana: xs[Math.floor(xs.length / 2)] };
  };
  for (const [campo, etiqueta] of [
    ["imanPct", "imán ±2%"], ["imanPct1", "imán ±1%"], ["giroPct", "distancia al giro"],
    ["desbalance05", "desbalance ±0,5%"], ["desbalance1", "desbalance ±1%"],
    ["muroCallCercaPct", "muro calls cerca"], ["muroPutCercaPct", "muro puts cerca"],
    ["concentracion", "concentración"],
  ]) {
    const v = p21[campo];
    const r = pct(campo, v);
    log(`  ${etiqueta.padEnd(20)} el 21: ${f3(v)}   mediana histórica: ${f3(r.mediana)}` +
        `   → percentil ${r.pctil.toFixed(0)}`);
  }
}

// ═══ 3. LA CONDICIÓN, Y CUÁNTAS VECES SE HA VISTO ══════════════════════════════════════════
// dispara(h, A, B, D, lado) — lado "C" = la condición del 21; lado "P" = la espejo.
let CAMPO_IMAN = "imanPct";              // "imanPct" (±2%) o "imanPct1" (±1%)
function dispara(perf, A, B, D, lado) {
  const im = perf[CAMPO_IMAN], gi = perf.giroPct, db = perf.desbalance05;
  if (im == null || gi == null) return false;
  if (lado === "C") return im >= A && im <= B && gi > 0 && db < D;
  return -im >= A && -im <= B && gi < 0 && -db < D;   // espejo exacto
}

// ═══ 3-bis. EL IMÁN DE ±2% ES DE FILO DE CUCHILLO ══════════════════════════════════════════
// Encontrado persiguiendo un descuadre: el encargo dice que el 21 tenía el imán en 7700, a
// +0,336%. Con la primera barra que existe en la historia (09:35, spot 7.666,99 — el índice
// ya había caído 7 puntos desde la apertura) el imán del 21 sale en 7520, a −1,917%. No es un
// fallo del lector: el strike 7520 tiene 14.979 contratos y el 7700 tiene 13.993, y 7520 está
// justo en el borde del ±2%. Siete puntos de índice lo meten dentro y el imán salta 197 puntos.
log(`\n═══ ¿AGUANTA EL IMÁN? (se mueve el precio un 0,1% y se mira si cambia de strike) ═══`);
{
  const e2 = H.filter((h) => h.p.imanEstable2).length;
  const e1 = H.filter((h) => h.p.imanEstable1).length;
  log(`  imán de ±2%: aguanta en ${e2} de ${H.length} días (${((e2 / H.length) * 100).toFixed(1)} %)`);
  log(`  imán de ±1%: aguanta en ${e1} de ${H.length} días (${((e1 / H.length) * 100).toFixed(1)} %)`);
  if (p21) {
    const i21_930 = imanEn(d21.oi, d21.barras[0].spot, 0.02);
    const i21_935 = imanEn(d21.oi, d21.barras.find((b) => b.t === "09:35").spot, 0.02);
    const j21_930 = imanEn(d21.oi, d21.barras[0].spot, 0.01);
    const j21_935 = imanEn(d21.oi, d21.barras.find((b) => b.t === "09:35").spot, 0.01);
    log(`  EL 21 con ±2%:  a las 09:30 (7674,18) imán ${i21_930.K} = ${i21_930.pct.toFixed(3)}%` +
        `   ·   a las 09:35 (7666,99) imán ${i21_935.K} = ${i21_935.pct.toFixed(3)}%`);
    log(`  EL 21 con ±1%:  a las 09:30 imán ${j21_930.K} = ${j21_930.pct.toFixed(3)}%` +
        `   ·   a las 09:35 imán ${j21_935.K} = ${j21_935.pct.toFixed(3)}%   ← esta SÍ aguanta`);
  }
}

log(`\n═══ ¿SE PARECE ALGÚN DÍA AL 21? ═══`);
{
  const A = 0.2, B = 0.5, D = -0.10;
  const n = H.filter((h) => dispara(h.p, A, B, D, "C")).length;
  const nEsp = H.filter((h) => dispara(h.p, A, B, D, "P")).length;
  log(`  con A=${A} B=${B} D=${D}:  ${n} días cumplen la condición del 21 (${((n / H.length) * 100).toFixed(1)} %)` +
      `  ·  ${nEsp} cumplen la espejo`);
  const soloIman = H.filter((h) => h.p.imanPct > 0).length;
  const imanYgiro = H.filter((h) => h.p.imanPct > 0 && h.p.giroPct > 0).length;
  log(`  imán por encima del precio: ${soloIman} días (${((soloIman / H.length) * 100).toFixed(1)} %)` +
      `  ·  imán Y giro por encima: ${imanYgiro} (${((imanYgiro / H.length) * 100).toFixed(1)} %)`);
}

// ═══ 4. EL BARRIDO ═════════════════════════════════════════════════════════════════════════
// Una casilla = (A, B, D, hora entrada, hora salida, variante de strike, lado).
function evaluar(sub, A, B, D, lado, ie, is, vk) {
  const v = [];
  for (const h of sub) {
    if (!dispara(h.p, A, B, D, lado)) continue;
    const x = h.ops[lado][vk][ie][is];
    if (x == null) continue;
    v.push({ dia: h.dia, año: h.año, d: x });
  }
  const xs = v.map((o) => o.d);
  const r = resumen(xs);
  return { ...r, ops: v, dolAño: xs.reduce((a, b) => a + b, 0) / AÑOS };
}

function barrer(sub, lado, minN) {
  const out = [];
  for (const A of REJ_A) for (const B of REJ_B) {
    if (B <= A) continue;
    for (const D of REJ_D) for (let ie = 0; ie < HORAS_E.length; ie++)
      for (let is = 0; is < HORAS_S.length; is++) for (const vk of VAR_K) {
        const r = evaluar(sub, A, B, D, lado, ie, is, vk);
        if (r.n < minN) continue;
        out.push({ A, B, D, ie, is, vk, ...r });
      }
  }
  return out;
}

const MIN_N = 30;
const celdasC = barrer(H, "C", MIN_N);
const celdasP = barrer(H, "P", MIN_N);
const CELDAS_PROBADAS = (REJ_A.length * REJ_B.length - 6) * REJ_D.length *
  HORAS_E.length * HORAS_S.length * VAR_K.length * 2;

log(`\n═══ EL BARRIDO ═══`);
log(`  casillas de la rejilla (A×B×D×entrada×salida×strike×lado) ... ${CELDAS_PROBADAS}`);
log(`  con al menos ${MIN_N} operaciones: ${celdasC.length} de call + ${celdasP.length} de put`);

const etiq = (c) => `A=${c.A.toFixed(2)} B=${c.B.toFixed(2)} D=${c.D.toFixed(2)} ` +
  `${HORAS_E[c.ie]}→${HORAS_S[c.is]} K=${c.vk}`;

function tabla(titulo, celdas, k = 8) {
  log(`\n  ${titulo}`);
  log(`     ${"regla".padEnd(44)} ${"n".padStart(4)} ${"media $".padStart(9)} ${"t".padStart(7)} ${"aciertos".padStart(9)} ${"$/año".padStart(10)}`);
  for (const c of celdas.slice(0, k))
    log(`     ${etiq(c).padEnd(44)} ${String(c.n).padStart(4)} ${f2(c.media).padStart(9)} ${f2(c.t)} ` +
        `${(c.aciertos * 100).toFixed(0).padStart(8)}% ${usd(c.dolAño).padStart(10)}`);
}

const porT = (a) => [...a].sort((x, y) => y.t - x.t);
const porD = (a) => [...a].sort((x, y) => y.dolAño - x.dolAño);
tabla("LA CONDICIÓN DEL 21 (compra CALL) — mejores por t", porT(celdasC));
tabla("LA REGLA ESPEJO (compra PUT) — mejores por t", porT(celdasP));
tabla("LA CONDICIÓN DEL 21 (compra CALL) — mejores por $/año", porD(celdasC), 5);
tabla("LA REGLA ESPEJO (compra PUT) — mejores por $/año", porD(celdasP), 5);

const posC = celdasC.filter((c) => c.media > 0).length;
const posP = celdasP.filter((c) => c.media > 0).length;
log(`\n  casillas con media POSITIVA: calls ${posC}/${celdasC.length} (${((posC / celdasC.length) * 100).toFixed(0)} %)` +
    `  ·  puts ${posP}/${celdasP.length} (${((posP / celdasP.length) * 100).toFixed(0)} %)`);
log(`  casillas con t > 2: calls ${celdasC.filter((c) => c.t > 2).length}  ·  puts ${celdasP.filter((c) => c.t > 2).length}`);
log(`  casillas con t < −2: calls ${celdasC.filter((c) => c.t < -2).length}  ·  puts ${celdasP.filter((c) => c.t < -2).length}`);

// ═══ 5+6. UNA CASILLA A FONDO, CON SUS CUATRO CONTROLES ═══════════════════════════════════
function aFondo(titulo, mejor, lado) {
log(`\n═══ ${titulo} ═══`);
log(`  ${etiq(mejor)}`);
log(`  n=${mejor.n}  media ${usd(mejor.media)}  t=${mejor.t.toFixed(2)}  aciertos ${(mejor.aciertos * 100).toFixed(0)}%  ${usd(mejor.dolAño)}/año`);
{
  const xs = mejor.ops.map((o) => o.d).sort((a, b) => a - b);
  const med = xs[Math.floor(xs.length / 2)];
  const top5 = [...xs].sort((a, b) => b - a).slice(0, 5);
  const sin5 = (xs.reduce((a, b) => a + b, 0) - top5.reduce((a, b) => a + b, 0)) / AÑOS;
  log(`  mediana ${usd(med)}  ·  peor día ${usd(xs[0])}  ·  mejor día ${usd(xs[xs.length - 1])}`);
  log(`  sin los 5 mejores días: ${usd(sin5)}/año  (los 5 mejores suman ${usd(top5.reduce((a, b) => a + b, 0))})`);
  const porAño = {};
  for (const o of mejor.ops) (porAño[o.año] ??= []).push(o.d);
  log(`  año a año:`);
  for (const a of Object.keys(porAño).sort())
    log(`     ${a}: n=${String(porAño[a].length).padStart(3)}  ${usd(porAño[a].reduce((x, y) => x + y, 0)).padStart(9)}` +
        `   media ${usd(porAño[a].reduce((x, y) => x + y, 0) / porAño[a].length)}`);
  const mitad = Math.floor(mejor.ops.length / 2);
  const m1 = resumen(mejor.ops.slice(0, mitad).map((o) => o.d));
  const m2 = resumen(mejor.ops.slice(mitad).map((o) => o.d));
  const t3 = [0, 1, 2].map((i) => {
    const a = Math.floor((mejor.ops.length * i) / 3), b = Math.floor((mejor.ops.length * (i + 1)) / 3);
    return resumen(mejor.ops.slice(a, b).map((o) => o.d));
  });
  log(`  mitades: 1ª media ${usd(m1.media)} (n=${m1.n})  ·  2ª media ${usd(m2.media)} (n=${m2.n})`);
  log(`  tercios: ${t3.map((x) => usd(x.media) + ` (n=${x.n})`).join("  ·  ")}`);
}

// ¿tiene vecinas buenas o es un diente solitario?
{
  const iA = REJ_A.indexOf(mejor.A), iB = REJ_B.indexOf(mejor.B), iD = REJ_D.indexOf(mejor.D);
  const vecinas = [];
  for (const [dA, dB, dD, dE, dS] of [
    [-1, 0, 0, 0, 0], [1, 0, 0, 0, 0], [0, -1, 0, 0, 0], [0, 1, 0, 0, 0],
    [0, 0, -1, 0, 0], [0, 0, 1, 0, 0], [0, 0, 0, -1, 0], [0, 0, 0, 1, 0],
    [0, 0, 0, 0, -1], [0, 0, 0, 0, 1],
  ]) {
    const A = REJ_A[iA + dA], B = REJ_B[iB + dB], D = REJ_D[iD + dD];
    const ie = mejor.ie + dE, is = mejor.is + dS;
    if (A == null || B == null || D == null || B <= A) continue;
    if (ie < 0 || ie >= HORAS_E.length || is < 0 || is >= HORAS_S.length) continue;
    const r = evaluar(H, A, B, D, lado, ie, is, mejor.vk);
    if (r.n >= MIN_N) vecinas.push({ A, B, D, ie, is, vk: mejor.vk, ...r });
  }
  log(`  VECINAS (mover un solo mando):`);
  for (const v of vecinas)
    log(`     ${etiq(v).padEnd(44)} n=${String(v.n).padStart(4)} media ${usd(v.media).padStart(8)} t=${f2(v.t)}`);
  const buenas = vecinas.filter((v) => v.t > 1).length;
  log(`  → ${buenas} de ${vecinas.length} vecinas con t>1. ` +
      (buenas >= vecinas.length * 0.5 ? "Meseta." : "DIENTE SOLITARIO: sobreajuste."));
}

// ═══ 6. LOS CONTROLES ══════════════════════════════════════════════════════════════════════
log(`\n═══ LOS CONTROLES ═══`);

// (0) EL PERFIL BARAJADO: mismo rule, perfil de otro día pegado al precio de hoy.
//     Se baraja la DISTANCIA en % (imán, giro, desbalance), nunca el nivel en bruto.
{
  log(`  (0) PERFIL BARAJADO — la misma regla leyendo el imán/giro/desbalance de otro día`);
  const resultados = [];
  for (const salto of [137, 263, 401, 557, 701]) {
    const v = [];
    for (let i = 0; i < H.length; i++) {
      const perfOtro = H[(i + salto) % H.length].p;
      if (!dispara(perfOtro, mejor.A, mejor.B, mejor.D, lado)) continue;
      const x = H[i].ops[lado][mejor.vk][mejor.ie][mejor.is];
      if (x != null) v.push(x);
    }
    const r = resumen(v);
    resultados.push(r);
    log(`      salto ${String(salto).padStart(3)}: n=${String(r.n).padStart(4)}  media ${usd(r.media).padStart(8)}` +
        `  t=${f2(r.t)}  aciertos ${(r.aciertos * 100).toFixed(0)}%  ${usd((r.media * r.n) / AÑOS)}/año`);
  }
  const mm = resultados.reduce((a, b) => a + b.media, 0) / resultados.length;
  log(`      media de los 5 barajados: ${usd(mm)} por operación   ·   la regla de verdad: ${usd(mejor.media)}`);
}

// (a,b,c) los tres controles de grupo, del MISMO tamaño
{
  const disparan = new Set(mejor.ops.map((o) => o.dia));
  const idxDisp = H.map((h, i) => (disparan.has(h.dia) ? i : -1)).filter((i) => i >= 0);
  const noDisp = H.map((h, i) => (disparan.has(h.dia) ? -1 : i)).filter((i) => i >= 0);
  const dolar = (i) => H[i].ops[lado][mejor.vk][mejor.ie][mejor.is];

  // (a) al AZAR: índices desplazados (nada de Math.random)
  const azar = [];
  for (const salto of [211, 397, 613]) {
    const v = [];
    for (let k = 0; k < idxDisp.length; k++) {
      const x = dolar((idxDisp[k] + salto) % H.length);
      if (x != null) v.push(x);
    }
    azar.push(resumen(v));
  }
  const mAzar = azar.reduce((a, b) => a + b.media, 0) / azar.length;
  log(`  (a) DÍAS AL AZAR (3 desplazamientos, mismo tamaño de grupo):`);
  azar.forEach((r, i) => log(`      n=${String(r.n).padStart(4)}  media ${usd(r.media).padStart(8)}  t=${f2(r.t)}  aciertos ${(r.aciertos * 100).toFixed(0)}%`));
  log(`      media de los 3: ${usd(mAzar)}`);

  // emparejador genérico por un campo, excluyendo los días que disparan
  const emparejar = (campo) => {
    const usados = new Set();
    const v = [];
    for (const i of idxDisp) {
      const obj = campo(H[i]);
      if (obj == null) continue;
      let mejorJ = -1, mejorDist = Infinity;
      for (const j of noDisp) {
        if (usados.has(j)) continue;
        const o = campo(H[j]);
        if (o == null) continue;
        const dd = Math.abs(Math.log(o / obj));
        if (dd < mejorDist) { mejorDist = dd; mejorJ = j; }
      }
      if (mejorJ < 0) continue;
      usados.add(mejorJ);
      const x = dolar(mejorJ);
      if (x != null) v.push(x);
    }
    return resumen(v);
  };
  const rTam = emparejar((h) => h.p.totalContratos);
  const rVol = emparejar((h) => h.vol);
  log(`  (b) EMPAREJADOS POR TAMAÑO de cadena: n=${rTam.n}  media ${usd(rTam.media)}  t=${f2(rTam.t)}  aciertos ${(rTam.aciertos * 100).toFixed(0)}%`);
  log(`  (c) EMPAREJADOS POR VOLATILIDAD del día: n=${rVol.n}  media ${usd(rVol.media)}  t=${f2(rVol.t)}  aciertos ${(rVol.aciertos * 100).toFixed(0)}%`);
  log(`  LA REGLA: n=${mejor.n}  media ${usd(mejor.media)}  t=${mejor.t.toFixed(2)}  aciertos ${(mejor.aciertos * 100).toFixed(0)}%`);
}

}

const mejor = porT(celdasC)[0];
aFondo("LA MEJOR CASILLA DE CALL (imán ±2%), A FONDO", mejor, "C");

// ═══ 7. FUERA DE MUESTRA ═══════════════════════════════════════════════════════════════════
log(`\n═══ FUERA DE MUESTRA (se elige con <2025, se comprueba en 2025-2026) ═══`);
{
  const antes = H.filter((h) => h.dia < "2025-01-01");
  const desp = H.filter((h) => h.dia >= "2025-01-01");
  const añosDesp = desp.length / 244;
  log(`  días: ${antes.length} antes de 2025  ·  ${desp.length} en 2025-2026 (${añosDesp.toFixed(2)} años)`);
  for (const lado of ["C", "P"]) {
    const cel = barrer(antes, lado, 20);
    if (!cel.length) { log(`  ${lado}: ninguna casilla con n≥20 dentro de muestra`); continue; }
    const top = porT(cel).slice(0, 3);
    log(`  ${lado === "C" ? "CALL (condición del 21)" : "PUT (espejo)"} — las 3 mejores de <2025 y qué hacen después:`);
    for (const c of top) {
      const fuera = evaluar(desp, c.A, c.B, c.D, lado, c.ie, c.is, c.vk);
      log(`     ${etiq(c).padEnd(44)} dentro: n=${String(c.n).padStart(3)} media ${usd(c.media).padStart(8)} t=${f2(c.t)}` +
          `  ‖  fuera: n=${String(fuera.n).padStart(3)} media ${usd(fuera.media).padStart(8)} t=${f2(fuera.t)}` +
          `  ${usd(fuera.n ? (fuera.media * fuera.n) / añosDesp : 0)}/año`);
    }
  }
}

// ═══ 7-bis. ¿CUÁNTO RUIDO TIENE UN GRUPO DE ESTE TAMAÑO? ══════════════════════════════════
// Es la pregunta que decide: si 400 grupos de 79 días cogidos a ciegas dan medias que se
// mueven tanto como la de la regla, la regla no ha encontrado nada.
function listonDelAzar(cel, lado) {
  log(`\n  EL LISTÓN DEL AZAR — 400 grupos de ${cel.n} días cogidos a ciegas, misma compra`);
  const todos = H.map((h) => h.ops[lado][cel.vk][cel.ie][cel.is]);
  const medias = [];
  for (let s = 1; s <= 400; s++) {
    const v = [];
    for (let k = 0; k < cel.n; k++) {
      const x = todos[(k * 13 + s * 7) % H.length];
      if (x != null) v.push(x);
    }
    if (v.length) medias.push(v.reduce((a, b) => a + b, 0) / v.length);
  }
  medias.sort((a, b) => a - b);
  const q = (p) => medias[Math.floor(medias.length * p)];
  const porEncima = medias.filter((m) => m >= cel.media).length;
  log(`     medias de los 400 grupos:  p5 ${usd(q(0.05))}  ·  mediana ${usd(q(0.5))}  ·  p95 ${usd(q(0.95))}` +
      `  ·  máx ${usd(medias[medias.length - 1])}`);
  log(`     la regla da ${usd(cel.media)}  →  ${porEncima} de ${medias.length} grupos a ciegas la igualan o la superan` +
      `  (percentil ${(100 - (porEncima / medias.length) * 100).toFixed(0)})`);
}
listonDelAzar(mejor, "C");

// ═══ 7-ter. LA MISMA REGLA CON EL IMÁN DE ±1% (el que sí aguanta) ═════════════════════════
log(`\n═══ LA REGLA CON EL IMÁN DE ±1% (definición estable) ═══`);
{
  CAMPO_IMAN = "imanPct1";
  const cC = barrer(H, "C", MIN_N), cP = barrer(H, "P", MIN_N);
  log(`  casillas con n≥${MIN_N}: ${cC.length} de call, ${cP.length} de put` +
      `  ·  con t>2: ${cC.filter((c) => c.t > 2).length} y ${cP.filter((c) => c.t > 2).length}`);
  tabla("CALL — mejores por t (imán ±1%)", porT(cC), 5);
  tabla("PUT espejo — mejores por t (imán ±1%)", porT(cP), 5);
  const m1 = porT(cC)[0];
  const xs = m1.ops.map((o) => o.d).sort((a, b) => b - a);
  const sin5 = (xs.reduce((a, b) => a + b, 0) - xs.slice(0, 5).reduce((a, b) => a + b, 0)) / AÑOS;
  log(`  la mejor de call: ${usd(m1.dolAño)}/año  ·  sin los 5 mejores días ${usd(sin5)}/año`);
  // la ÚNICA casilla con t>2 de todo el encargo: se le pasa la batería entera
  aFondo("LA ÚNICA CASILLA CON t>2 DEL ENCARGO (imán ±1%), A FONDO", m1, "C");
  listonDelAzar(m1, "C");
  // ¿dispararía el propio 21 esta casilla?
  if (p21) {
    const i930 = imanEn(d21.oi, d21.barras[0].spot, 0.01).pct;
    const i935 = imanEn(d21.oi, d21.barras.find((b) => b.t === "09:35").spot, 0.01).pct;
    const p21b = { imanPct1: i935, giroPct: p21.giroPct, desbalance05: p21.desbalance05 };
    log(`  ¿DISPARARÍA EL 21? imán ±1% = ${i930.toFixed(3)}% a las 09:30 y ${i935.toFixed(3)}% a las 09:35;` +
        ` la casilla pide entre ${m1.A} y ${m1.B}  →  ${dispara(p21b, m1.A, m1.B, m1.D, "C") ? "SÍ" : "NO"}`);
  }
  // fuera de muestra con esta definición
  const antes = H.filter((h) => h.dia < "2025-01-01"), desp = H.filter((h) => h.dia >= "2025-01-01");
  const añosDesp = desp.length / 244;
  for (const c of porT(barrer(antes, "C", 20)).slice(0, 3)) {
    const fu = evaluar(desp, c.A, c.B, c.D, "C", c.ie, c.is, c.vk);
    log(`  fuera de muestra  ${etiq(c).padEnd(44)} dentro n=${c.n} media ${usd(c.media)} t=${f2(c.t)}` +
        ` ‖ fuera n=${fu.n} media ${usd(fu.media)} t=${f2(fu.t)}  ${usd(fu.n ? (fu.media * fu.n) / añosDesp : 0)}/año`);
  }
  // ── DESMONTAR LA REGLA: ¿qué ingrediente la sostiene? ───────────────────────────────────
  // Se mide la MISMA compra (misma hora, mismo strike) sobre los días que cumplen cada
  // condición por separado. Si un solo ingrediente ya da el resultado, los otros dos sobran
  // y lo que se ha encontrado no es la foto del GEX del 21.
  log(`\n  DESMONTAR LA REGLA — la misma compra (${HORAS_E[m1.ie]}→${HORAS_S[m1.is]}, K=${m1.vk}) con cada condición sola:`);
  const compra = (h) => h.ops.C[m1.vk][m1.ie][m1.is];
  const trozo = (nombre, filtro) => {
    const v = H.filter(filtro).map(compra).filter((x) => x != null);
    const r = resumen(v);
    log(`     ${nombre.padEnd(46)} n=${String(r.n).padStart(4)}  media ${usd(r.media).padStart(8)}` +
        `  t=${f2(r.t)}  aciertos ${(r.aciertos * 100).toFixed(0)}%  ${usd((r.media * r.n) / AÑOS)}/año`);
  };
  trozo("TODOS los días (el listón)", () => true);
  trozo(`sólo imán ±1% entre ${m1.A} y ${m1.B}`, (h) => h.p.imanPct1 >= m1.A && h.p.imanPct1 <= m1.B);
  trozo("sólo giro por encima del precio", (h) => h.p.giroPct > 0);
  trozo(`sólo desbalance ±0,5% < ${m1.D}`, (h) => h.p.desbalance05 < m1.D);
  trozo("imán + giro (sin desbalance)", (h) => h.p.imanPct1 >= m1.A && h.p.imanPct1 <= m1.B && h.p.giroPct > 0);
  trozo("imán + desbalance (sin giro)", (h) => h.p.imanPct1 >= m1.A && h.p.imanPct1 <= m1.B && h.p.desbalance05 < m1.D);
  trozo("giro + desbalance (sin imán)", (h) => h.p.giroPct > 0 && h.p.desbalance05 < m1.D);
  trozo("LA REGLA ENTERA", (h) => dispara(h.p, m1.A, m1.B, m1.D, "C"));

  // ── ¿es una fila entera o una sola casilla? todas las horas con la misma condición ──────
  log(`\n  TODAS LAS HORAS con la misma condición (A=${m1.A} B=${m1.B} D=${m1.D}, K=${m1.vk}) — media $ / t:`);
  log(`     ${"entrada".padEnd(9)}${HORAS_S.map((s) => s.padStart(14)).join("")}`);
  for (let ie = 0; ie < HORAS_E.length; ie++) {
    let fila = `     ${HORAS_E[ie].padEnd(9)}`;
    for (let is = 0; is < HORAS_S.length; is++) {
      const r = evaluar(H, m1.A, m1.B, m1.D, "C", ie, is, m1.vk);
      fila += (r.n < 10 ? "     —" : `${usd(r.media)}/${r.t.toFixed(1)}`).padStart(14);
    }
    log(fila);
  }

  // ── sanidad de coste de ESA compra concreta ─────────────────────────────────────────────
  {
    const disp = H.filter((h) => dispara(h.p, m1.A, m1.B, m1.D, "C"));
    const cs = disp.map((h) => h.cst.C[m1.vk][m1.ie][m1.is]).filter((x) => x != null).sort((a, b) => a - b);
    const dist = disp.map((h) => h.p[CAMPO_IMAN]).filter((x) => x != null);
    log(`\n  SANIDAD de la casilla ganadora: coste del contrato (puntos de índice; ×100 = dólares)`);
    log(`     mín ${cs[0].toFixed(2)}  ·  mediana ${cs[Math.floor(cs.length / 2)].toFixed(2)}` +
        `  ·  máx ${cs[cs.length - 1].toFixed(2)}   →  desembolso de $${(cs[0] * 100).toFixed(0)} a ` +
        `$${(cs[cs.length - 1] * 100).toFixed(0)} por contrato (n=${cs.length})`);
    const medCoste = cs.reduce((a, b) => a + b, 0) / cs.length;
    log(`     rendimiento medio sobre lo desembolsado: ${((m1.media / 100 / medCoste) * 100).toFixed(1)} %` +
        `   ·   el strike queda entre ${Math.min(...dist).toFixed(2)}% y ${Math.max(...dist).toFixed(2)}% del precio`);
    log(`     frecuencia: ${(m1.n / AÑOS).toFixed(1)} operaciones al año`);
    // POR QUÉ el coste va de $5 a $12.250: el strike se fija a las 09:35 y se compra a las
    // 10:15. Si el índice se ha movido en esos 40 minutos, el mismo strike es una lotería
    // fuera del dinero o un contrato hondo dentro. Eso NO es un tamaño de posición operable.
    const disp2 = H.filter((h) => dispara(h.p, m1.A, m1.B, m1.D, "C"));
    const desvio = disp2.map((h) => ({
      dia: h.dia, coste: h.cst.C[m1.vk][m1.ie][m1.is],
      dolares: h.ops.C[m1.vk][m1.ie][m1.is],
    })).filter((x) => x.coste != null).sort((a, b) => b.dolares - a.dolares);
    log(`     los 5 días que ponen el dinero (de ${desvio.length}):`);
    for (const x of desvio.slice(0, 5))
      log(`        ${x.dia}  desembolso $${(x.coste * 100).toFixed(0).padStart(6)}  →  ${usd(x.dolares)}`);
    const caros = desvio.filter((x) => x.coste * 100 > 3000).length;
    const baratos = desvio.filter((x) => x.coste * 100 < 300).length;
    log(`     ${caros} de ${desvio.length} días piden más de $3.000 de desembolso` +
        `  ·  ${baratos} piden menos de $300 (lotería fuera del dinero)`);
    log(`     Lester tiene $7.977 de EFECTIVO: ${caros} de esas operaciones le comen más de un tercio de golpe.`);
  }
  CAMPO_IMAN = "imanPct";
}

// ═══ 8. EL LISTÓN: comprar la misma call SIN NINGUNA CONDICIÓN ════════════════════════════
log(`\n═══ EL LISTÓN — la misma compra TODOS los días, sin condición ═══`);
for (const vk of VAR_K) {
  const v = [];
  for (const h of H) { const x = h.ops.C[vk][mejor.ie][mejor.is]; if (x != null) v.push(x); }
  const r = resumen(v);
  log(`  call ${vk.padEnd(4)} ${HORAS_E[mejor.ie]}→${HORAS_S[mejor.is]}: n=${r.n}  media ${usd(r.media)}  t=${f2(r.t)}` +
      `  aciertos ${(r.aciertos * 100).toFixed(0)}%  ${usd((r.media * r.n) / AÑOS)}/año`);
}

log(`\n(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
