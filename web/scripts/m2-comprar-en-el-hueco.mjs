// ═══════════════════════════════════════════════════════════════════════════════════════════
// M2 — «COMPRAR LO QUE ESTÁ EN MEDIO»
//
// LA PREGUNTA, en llano: cuando en la foto del interés abierto hay una MONTAÑA justo encima
// del precio (un strike que sobresale de sus vecinos, no el que tiene más contratos en bruto),
// ¿sube el precio hacia ella más veces de lo normal, y da dinero comprar lo que queda en medio?
//
// Es la operación de Eduardo escrita como él la hace: el 21 de agosto el 7700 sobresalía 4,06
// veces sobre sus vecinos, el precio estaba en 7674, y él compró 7675, 7685 y 7690 — lo que
// había en el hueco.
//
// LAS DOS MEDICIONES ANTERIORES definían el imán como «el strike con más contratos dentro de
// ±2%». Ese número da la vuelta con siete puntos de índice. Aquí se usa la PROMINENCIA, que no
// se mueve. Nunca se había medido.
//
// LO QUE HACE ESTE FICHERO, por partes:
//   PARTE 1  El hecho del PRECIO, sin opciones: ¿toca la montaña de arriba más veces de las que
//            el precio baja la misma distancia? (control espejo puro, mismo día, mismo instante)
//   PARTE 2  El barrido de la operación: prominencia mínima × distancia máxima × qué strike del
//            hueco × hora de entrada × regla de salida, por el lado CALL y por el lado PUT.
//   PARTE 3  Los cuatro controles sobre lo que mejor salga: espejo, barajado, volatilidad y
//            prominencia-contra-tamaño. Más el corte temporal (construir <2025, comprobar 2025+).
//
// REGLAS DE LA CASA QUE SE CUMPLEN AQUÍ:
//   · se compra al ASK y se vende al BID, siempre (lo hace lib0dte, no se toca)
//   · en la barra i sólo se mira 0..i y el OI del arranque del día
//   · si falta un precio la operación se DESCARTA y se cuenta aparte (nunca vale cero)
//   · los 9 días de media sesión se excluyen ENTEROS (el SPX se congela a las 13:00 y el
//     fichero sigue trayendo barras hasta las 16:00 con cotizaciones viejas)
//   · nunca se sale en la barra de las 16:00 (cotizaciones muertas); el tope es las 15:00
// ═══════════════════════════════════════════════════════════════════════════════════════════

import {
  diasDisponibles, cargarDia, cargarDia21, picos,
  operar, idxHora, hayHora, rejilla, compraEn, ventaEn, resumen,
} from "./lib0dte.mjs";

const MEDIA_SESION = new Set([
  "2022-11-25", "2023-07-03", "2023-11-24", "2024-07-03", "2024-11-29",
  "2024-12-24", "2025-07-03", "2025-11-28", "2025-12-24",
]);

const ANOS = 4.60;                 // 1.123 días de 2022-01-03 a 2026-08-10, 244 días/año
const MAX_BARRAS = 36;             // 3 horas de tope para las salidas por objetivo/toque

// ── el barrido ─────────────────────────────────────────────────────────────────────────────
const PROMS = [2, 2.5, 3];
const DISTS = [0.75, 1.0, 1.5];               // % máximo del precio a la montaña
const ELECCIONES = ["cerca", "medio", "pegado", "sesgo"];
const ENTRADAS = ["09:35", "09:50", "10:05", "10:20", "10:35", "11:00", "12:00"];
const SALIDAS = ["+1h", "+2h", "fija11:30", "fija12:00", "fija13:00", "toca", "obj30", "obj50"];

// ═══ utilidades ════════════════════════════════════════════════════════════════════════════

/** Las montañas más cercanas arriba y abajo, recalculando la distancia contra ESTE precio.
 *  (la prominencia no depende del precio, así que picos() se llama UNA vez por día) */
function montanas(lista, spot, minProm, maxDistPct) {
  let arr = null, aba = null;
  for (const p of lista) {
    if (p.prominencia < minProm) continue;
    const d = ((p.K - spot) / spot) * 100;
    if (Math.abs(d) > maxDistPct) continue;
    if (p.K > spot) { if (!arr || p.K < arr.K) arr = { ...p, distPct: d }; }
    else if (p.K < spot) { if (!aba || p.K > aba.K) aba = { ...p, distPct: d }; }
  }
  return { arriba: arr, abajo: aba };
}

/** Los strikes que quedan ENTRE el precio y la montaña, del más cercano al precio al más
 *  pegado a la montaña, cada uno con su sesgo calls/puts. */
function huecoDe(mapa, spot, montana) {
  const arriba = montana.K > spot;
  const dentro = [...mapa.values()].filter((e) =>
    arriba ? (e.K > spot && e.K < montana.K) : (e.K < spot && e.K > montana.K));
  dentro.sort((a, b) => (arriba ? a.K - b.K : b.K - a.K));
  return dentro.map((e) => ({
    K: e.K, total: e.total ?? (e.calls + e.puts),
    sesgo: (e.calls + e.puts) > 0 ? (e.calls - e.puts) / (e.calls + e.puts) : 0,
  }));
}

/** Qué strike del hueco se compra. `arriba` decide si «sesgo» busca calls o puts. */
function elegir(h, modo, arriba) {
  if (!h.length) return null;
  if (modo === "cerca") return h[0].K;
  if (modo === "pegado") return h[h.length - 1].K;
  if (modo === "medio") return h[Math.floor((h.length - 1) / 2)].K;
  // «sesgo»: el más cargado de calls (arriba) o de puts (abajo); empates → el más cercano
  let mejor = h[0];
  for (const e of h) {
    const v = arriba ? e.sesgo : -e.sesgo;
    const m = arriba ? mejor.sesgo : -mejor.sesgo;
    if (v > m) mejor = e;
  }
  return mejor.K;
}

// ═══ EJECUCIÓN DE UNA OPERACIÓN CON MEMORIA ════════════════════════════════════════════════
//
// El barrido pide muchas veces la misma (strike, lado, barra de entrada) con distinta salida.
// Se calcula una vez por día y se guarda: el coste de entrada y el resultado de cada salida.

function haceUnDia(dia, iFijas) {
  const memo = new Map();
  const nB = dia.barras.length;

  return function trade(K, lado, iE, salida, objetivoK) {
    const clave = K + lado + "|" + iE;
    let m = memo.get(clave);
    if (!m) {
      const coste = compraEn(dia.barras[iE], K, lado);
      m = { coste: (coste != null && coste > 0) ? coste : null, sal: new Map() };
      memo.set(clave, m);
    }
    if (m.coste == null) return { estado: "hueco" };

    const claveSal = salida + (objetivoK ?? "");
    if (m.sal.has(claveSal)) return m.sal.get(claveSal);

    const tope = Math.min(iE + MAX_BARRAS, nB - 2);   // NUNCA la barra de las 16:00
    let iS = null;
    if (salida === "+1h") iS = iE + 12;
    else if (salida === "+2h") iS = iE + 24;
    else if (salida.startsWith("fija")) iS = iFijas[salida];
    else if (salida === "toca") {
      const arriba = objetivoK > dia.barras[iE].spot;
      for (let j = iE + 1; j <= tope; j++) {
        const s = dia.barras[j].spot;
        if (arriba ? s >= objetivoK : s <= objetivoK) { iS = j; break; }
      }
      if (iS == null) iS = tope;
    } else if (salida === "obj30" || salida === "obj50") {
      const factor = salida === "obj30" ? 1.30 : 1.50;
      for (let j = iE + 1; j <= tope; j++) {
        const b = ventaEn(dia.barras[j], K, lado);
        if (b != null && b >= m.coste * factor) { iS = j; break; }
      }
      if (iS == null) iS = tope;
    }

    let r;
    if (iS == null || iS <= iE || iS > nB - 2) r = { estado: "nula" };
    else {
      const o = operar(dia, iE, iS, K, lado);
      r = o ? { estado: "ok", ...o, iS } : { estado: "hueco" };
    }
    m.sal.set(claveSal, r);
    return r;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PASADA ÚNICA SOBRE LOS 1.114 DÍAS
// ═══════════════════════════════════════════════════════════════════════════════════════════

const todos = diasDisponibles();
const dias = todos.filter((d) => !MEDIA_SESION.has(d));
console.log(`días con cadena: ${todos.length} · de media sesión excluidos: ${todos.length - dias.length} · se miden: ${dias.length}`);

// celdas del barrido
const celdas = new Map();          // clave -> { d:[], c:[], i:[], e:[], dias:Set }
const clave = (lado, prom, dist, el, en, sa) => `${lado}|p${prom}|d${dist}|${el}|${en}|${sa}`;
function celda(k) {
  let c = celdas.get(k);
  if (!c) { c = { d: [], c: [], i: [], e: [], dias: new Set() }; celdas.set(k, c); }
  return c;
}

// PARTE 1 — el hecho del precio. Se mide con TRES exigencias de montaña, y el contraste es
// PAREADO: el mismo día cuenta para arriba y para abajo, así que sólo mandan los días en que
// una cosa pasó y la otra no (los «discordantes»).
const HECHOS = [
  { nombre: "prom≥2, ≤1,5%", prom: 2, dist: 1.5 },
  { nombre: "prom≥2, ≤0,75%", prom: 2, dist: 0.75 },
  { nombre: "prom≥3, ≤0,75%", prom: 3, dist: 0.75 },
];
const hechos = HECHOS.map(() => ({ conMontana: 0, toca: 0, tocaEspejo: 0, distMedia: 0, soloArriba: 0, soloAbajo: 0 }));

// para los controles: perfil compacto de cada día (±3 % de su apertura) + cuña ATM
const perfiles = [];
let huecosPrecio = 0, opsTotales = 0, sinOI = 0, sinPicos = 0;
const costes = [];

const t0 = Date.now();
for (let n = 0; n < dias.length; n++) {
  const dia = cargarDia(dias[n]);
  if (!dia) continue;
  if (!dia.oi) { sinOI++; continue; }

  const S0 = dia.barras[0].spot;
  const pk = picos(dia.oi, S0, 30);
  if (!pk) { sinPicos++; continue; }

  // perfil compacto para el barajado y el control de tamaño
  const compacto = [];
  for (const e of pk.picos) {
    const d = ((e.K - S0) / S0) * 100;
    if (Math.abs(d) <= 3) compacto.push({ d, prom: e.prominencia, calls: e.calls, puts: e.puts, total: e.total });
  }
  // cuña al dinero a las 09:35, en % del índice → el termómetro de volatilidad
  const Katm = rejilla(S0);
  const ca = compraEn(dia.barras[0], Katm, "C"), pa = compraEn(dia.barras[0], Katm, "P");
  const cuna = (ca != null && pa != null) ? ((ca + pa) / S0) * 100 : null;
  perfiles.push({ dia: dia.dia, S0, compacto, cuna, ano: +dia.dia.slice(0, 4) });
  // OJO: `perfiles` se salta los días sin OI, así que su índice NO es el del bucle. Guardar
  // el del bucle emparejaba cada operación con el año equivocado (hasta 4 días de desfase).
  const iPerf = perfiles.length - 1;

  // barras fijas
  const iFijas = {};
  for (const h of ["11:30", "12:00", "13:00"]) {
    const i = hayHora(dia, h);
    iFijas["fija" + h] = i >= 0 ? i : null;
  }
  const trade = haceUnDia(dia, iFijas);

  // ── PARTE 1: ¿toca la montaña de arriba más que el espejo? (prom≥2, ≤1,5%, desde 10:05) ──
  const i105 = hayHora(dia, "10:05");
  if (i105 >= 0) {
    const S = dia.barras[i105].spot;
    for (let hh = 0; hh < HECHOS.length; hh++) {
      const m = montanas(pk.picos, S, HECHOS[hh].prom, HECHOS[hh].dist);
      if (!m.arriba) continue;
      const H = hechos[hh];
      H.conMontana++;
      H.distMedia += m.arriba.distPct;
      const objetivo = m.arriba.K;
      const espejo = S - (objetivo - S);
      const tope = Math.min(i105 + MAX_BARRAS, dia.barras.length - 2);
      let ta = false, te = false;
      for (let j = i105 + 1; j <= tope; j++) {
        const s = dia.barras[j].spot;
        if (s >= objetivo) ta = true;
        if (s <= espejo) te = true;
      }
      if (ta) H.toca++;
      if (te) H.tocaEspejo++;
      if (ta && !te) H.soloArriba++;
      if (te && !ta) H.soloAbajo++;
    }
  }

  // ── PARTE 2: el barrido ────────────────────────────────────────────────────────────────
  for (const en of ENTRADAS) {
    const iE = hayHora(dia, en);
    if (iE < 0) continue;
    const S = dia.barras[iE].spot;

    for (const prom of PROMS) {
      for (const dist of DISTS) {
        const m = montanas(pk.picos, S, prom, dist);

        for (const [lado, mont] of [["C", m.arriba], ["P", m.abajo]]) {
          if (!mont) continue;
          const h = huecoDe(pk.mapa, S, mont);
          if (!h.length) continue;

          for (const el of ELECCIONES) {
            const K = elegir(h, el, lado === "C");
            if (K == null) continue;
            // el ESPEJO: misma distancia, mismo instante, al otro lado
            const Km = rejilla(2 * S - K);
            const ladoM = lado === "C" ? "P" : "C";

            for (const sa of SALIDAS) {
              const r = trade(K, lado, iE, sa, mont.K);
              opsTotales++;
              if (r.estado === "hueco") { huecosPrecio++; continue; }
              if (r.estado !== "ok") continue;
              const c = celda(clave(lado, prom, dist, el, en, sa));
              c.d.push(r.dolares); c.c.push(r.coste); c.i.push(iPerf); c.dias.add(dia.dia);
              // espejo pareado: MISMA barra de salida
              const objEsp = 2 * S - mont.K;
              const rm = trade(Km, ladoM, iE, sa === "toca" ? "toca" : sa, objEsp);
              c.e.push(rm.estado === "ok" ? rm.dolares : NaN);
              if (costes.length < 200000) costes.push(r.coste);
            }
          }
        }
      }
    }
  }
}
console.log(`pasada terminada en ${((Date.now() - t0) / 1000).toFixed(0)} s · días sin OI: ${sinOI} · sin picos: ${sinPicos}`);

// ═══ SANIDAD ═══════════════════════════════════════════════════════════════════════════════
costes.sort((a, b) => a - b);
const q = (p) => costes[Math.floor(costes.length * p)];
console.log("\n─── SANIDAD ───────────────────────────────────────────────");
console.log(`operaciones intentadas: ${opsTotales} · descartadas por falta de precio: ${huecosPrecio} (${(100 * huecosPrecio / opsTotales).toFixed(2)}%)`);
console.log(`coste de entrada (puntos de índice): mín ${costes[0].toFixed(2)} · p5 ${q(0.05).toFixed(2)} · mediana ${q(0.5).toFixed(2)} · p95 ${q(0.95).toFixed(2)} · máx ${costes[costes.length - 1].toFixed(2)}`);
console.log(`celdas del barrido: ${celdas.size}`);

// ═══ PARTE 1 ═══════════════════════════════════════════════════════════════════════════════
console.log("\n─── PARTE 1 · EL HECHO DEL PRECIO (entrada 10:05, 3 h de plazo) ───");
for (let hh = 0; hh < HECHOS.length; hh++) {
  const H = hechos[hh];
  const disc = H.soloArriba + H.soloAbajo;
  // McNemar: entre los días discordantes, ¿cuántos van a favor de arriba? listón = la mitad
  const z = disc > 0 ? (H.soloArriba - disc / 2) / Math.sqrt(disc / 4) : NaN;
  console.log(`${HECHOS[hh].nombre}: días con montaña arriba ${H.conMontana} (${(100 * H.conMontana / perfiles.length).toFixed(1)}%) · dist media ${(H.distMedia / H.conMontana).toFixed(2)}%`);
  console.log(`   TOCA la montaña ${H.toca} (${(100 * H.toca / H.conMontana).toFixed(1)}%) · BAJA la misma distancia ${H.tocaEspejo} (${(100 * H.tocaEspejo / H.conMontana).toFixed(1)}%)`);
  console.log(`   pareado: sólo arriba ${H.soloArriba} · sólo abajo ${H.soloAbajo} · z=${z.toFixed(2)}`);
}

// ═══ PARTE 2 ═══════════════════════════════════════════════════════════════════════════════
function stats(c) {
  const r = resumen(c.d);
  const orden = [...c.d].sort((a, b) => a - b);
  const mediana = orden[Math.floor(orden.length / 2)];
  const suma = c.d.reduce((a, b) => a + b, 0);
  const sin5 = orden.slice(0, -5).reduce((a, b) => a + b, 0);
  const costeMed = c.c.reduce((a, b) => a + b, 0) / c.c.length;
  // espejo pareado
  const pares = [];
  for (let i = 0; i < c.d.length; i++) if (!Number.isNaN(c.e[i])) pares.push(c.d[i] - c.e[i]);
  const rp = resumen(pares);
  // mitades por año
  const antes = [], despues = [];
  for (let i = 0; i < c.d.length; i++) {
    (perfiles[c.i[i]] && perfiles[c.i[i]].ano >= 2025 ? despues : antes).push(c.d[i]);
  }
  return {
    n: r.n, media: r.media, t: r.t, aciertos: r.aciertos, mediana,
    anual: suma / ANOS, anualSin5: sin5 / ANOS, costeMed,
    diasAno: c.dias.size / ANOS, peor: orden[0],
    espejoT: rp.t, espejoN: rp.n, espejoMedia: rp.media,
    antes: resumen(antes), despues: resumen(despues),
  };
}

const tabla = [];
for (const [k, c] of celdas) {
  if (c.d.length < 60) continue;                 // muestra mínima
  tabla.push({ k, ...stats(c), _c: c });
}
tabla.sort((a, b) => b.t - a.t);

console.log(`\n─── PARTE 2 · BARRIDO (${tabla.length} celdas con n≥60 de ${celdas.size} probadas) ───`);
console.log("las 12 mejores por t:");
console.log("celda".padEnd(42), "n".padStart(5), "media$".padStart(9), "t".padStart(6), "aciert".padStart(7), "$/año".padStart(9), "sin5".padStart(9), "coste".padStart(7), "d/año".padStart(6));
for (const r of tabla.slice(0, 12)) {
  console.log(r.k.padEnd(42), String(r.n).padStart(5), (r.media * 1).toFixed(0).padStart(9),
    r.t.toFixed(2).padStart(6), (100 * r.aciertos).toFixed(0).padStart(7),
    r.anual.toFixed(0).padStart(9), r.anualSin5.toFixed(0).padStart(9),
    r.costeMed.toFixed(1).padStart(7), r.diasAno.toFixed(0).padStart(6));
}
console.log("\nlas 5 PEORES por t:");
for (const r of tabla.slice(-5)) {
  console.log(r.k.padEnd(42), String(r.n).padStart(5), r.media.toFixed(0).padStart(9), r.t.toFixed(2).padStart(6));
}

// reparto general: ¿cuántas celdas son positivas?
const pos = tabla.filter((r) => r.media > 0).length;
const t2 = tabla.filter((r) => r.t > 2).length, tm2 = tabla.filter((r) => r.t < -2).length;
console.log(`\nceldas con media positiva: ${pos} de ${tabla.length} (${(100 * pos / tabla.length).toFixed(1)}%) · con t>+2: ${t2} · con t<−2: ${tm2}`);

// dónde está el dinero: por hora de entrada y por regla de salida
const med = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const agr = (fn) => {
  const m = new Map();
  for (const r of tabla) { const k = fn(r.k); if (!m.has(k)) m.set(k, []); m.get(k).push(r.media); }
  return [...m.entries()].map(([k, v]) => [k, med(v)]).sort((a, b) => b[1] - a[1]);
};
console.log("\nmedia por HORA DE ENTRADA:  " + agr((k) => k.split("|")[4]).map(([k, v]) => `${k} ${v.toFixed(0)}$`).join(" · "));
console.log("media por REGLA DE SALIDA:  " + agr((k) => k.split("|")[5]).map(([k, v]) => `${k} ${v.toFixed(0)}$`).join(" · "));
console.log("media por STRIKE ELEGIDO:   " + agr((k) => k.split("|")[3]).map(([k, v]) => `${k} ${v.toFixed(0)}$`).join(" · "));
console.log("media por PROMINENCIA MÍN:  " + agr((k) => k.split("|")[1]).map(([k, v]) => `${k} ${v.toFixed(0)}$`).join(" · "));

// el lado PUT contra el lado CALL (control de simetría obligatorio)
const soloC = tabla.filter((r) => r.k.startsWith("C|")), soloP = tabla.filter((r) => r.k.startsWith("P|"));
console.log(`lado CALL: ${soloC.length} celdas, media de medias ${med(soloC.map((r) => r.media)).toFixed(0)} $, mejor t ${Math.max(...soloC.map((r) => r.t)).toFixed(2)}`);
console.log(`lado PUT : ${soloP.length} celdas, media de medias ${med(soloP.map((r) => r.media)).toFixed(0)} $, mejor t ${Math.max(...soloP.map((r) => r.t)).toFixed(2)}`);

// ═══ PARTE 3 · LOS CONTROLES sobre la mejor celda ══════════════════════════════════════════
const mejor = tabla[0];
console.log("\n─── PARTE 3 · LA MEJOR CELDA A EXAMEN ───────────────────────");
console.log(`celda: ${mejor.k}`);
console.log(`n=${mejor.n} · media $${mejor.media.toFixed(0)} · mediana $${mejor.mediana.toFixed(0)} · t=${mejor.t.toFixed(2)} · aciertos ${(100 * mejor.aciertos).toFixed(1)}%`);
console.log(`$/año ${mejor.anual.toFixed(0)} · quitando los 5 mejores días ${mejor.anualSin5.toFixed(0)} · peor día $${mejor.peor.toFixed(0)}`);
console.log(`días con señal al año: ${mejor.diasAno.toFixed(0)} · coste medio de entrada ${mejor.costeMed.toFixed(1)} puntos ($${(mejor.costeMed * 100).toFixed(0)})`);
console.log(`(a) ESPEJO pareado: n=${mejor.espejoN} · diferencia media $${mejor.espejoMedia.toFixed(0)} · t=${mejor.espejoT.toFixed(2)}`);
console.log(`FUERA DE MUESTRA: <2025 n=${mejor.antes.n} media $${mejor.antes.media.toFixed(0)} t=${mejor.antes.t.toFixed(2)} · 2025-26 n=${mejor.despues.n} media $${mejor.despues.media.toFixed(0)} t=${mejor.despues.t.toFixed(2)}`);

// año a año
const porAno = new Map();
for (let i = 0; i < mejor._c.d.length; i++) {
  const a = perfiles[mejor._c.i[i]].ano;
  if (!porAno.has(a)) porAno.set(a, []);
  porAno.get(a).push(mejor._c.d[i]);
}
console.log("año a año:");
for (const a of [...porAno.keys()].sort()) {
  const v = porAno.get(a), r = resumen(v);
  console.log(`  ${a}: n=${String(r.n).padStart(4)} media $${r.media.toFixed(0).padStart(6)} suma $${v.reduce((x, y) => x + y, 0).toFixed(0).padStart(7)}`);
}

// sin 2026 (son 7 meses y se llevan casi todo el dinero) y retorno medio en %
{
  const sin26 = [], rets = [];
  for (let i = 0; i < mejor._c.d.length; i++) {
    rets.push(mejor._c.d[i] / (mejor._c.c[i] * 100));
    if (perfiles[mejor._c.i[i]].ano < 2026) sin26.push(mejor._c.d[i]);
  }
  const r26 = resumen(sin26), rr = resumen(rets);
  console.log(`SIN 2026: n=${r26.n} media $${r26.media.toFixed(0)} t=${r26.t.toFixed(2)} · $/año ${(sin26.reduce((a, b) => a + b, 0) / 4.02).toFixed(0)}`);
  console.log(`retorno medio por operación: ${(100 * rr.media).toFixed(2)}% (t=${rr.t.toFixed(2)})`);
}

// (c) VOLATILIDAD — tercios por la cuña ATM de las 09:35
const cunas = perfiles.filter((p) => p.cuna != null).map((p) => p.cuna).sort((a, b) => a - b);
const c33 = cunas[Math.floor(cunas.length / 3)], c66 = cunas[Math.floor(2 * cunas.length / 3)];
const terc = [[], [], []];
for (let i = 0; i < mejor._c.d.length; i++) {
  const cu = perfiles[mejor._c.i[i]].cuna;
  if (cu == null) continue;
  terc[cu <= c33 ? 0 : cu <= c66 ? 1 : 2].push(mejor._c.d[i]);
}
console.log(`(c) VOLATILIDAD (cuña ATM 09:35, cortes ${c33.toFixed(2)}% / ${c66.toFixed(2)}%):`);
["calma", "media", "agitada"].forEach((nm, i) => {
  const r = resumen(terc[i]);
  console.log(`   ${nm.padEnd(8)} n=${String(r.n).padStart(4)} media $${r.media.toFixed(0).padStart(6)} t=${r.t.toFixed(2).padStart(6)}`);
});

// ── (b) BARAJADO y (d) PROMINENCIA vs TAMAÑO: segunda pasada con la mejor celda ────────────
const [ladoM_, promM_, distM_, elM_, enM_, saM_] = mejor.k.split("|");
const PROM_M = +promM_.slice(1), DIST_M = +distM_.slice(1);
console.log(`\nsegunda pasada para (b) barajado y (d) tamaño — regla: lado ${ladoM_}, prom≥${PROM_M}, ≤${DIST_M}%, ${elM_}, ${enM_}, ${saM_}`);

const idxPerfil = new Map(perfiles.map((p, i) => [p.dia, i]));
const barajado = [], grandesSinPico = [], picoNormal = [];
let n2 = 0;
for (let n = 0; n < dias.length; n++) {
  const p = idxPerfil.get(dias[n]);
  if (p === undefined) continue;
  const dia = cargarDia(dias[n]);
  if (!dia || !dia.oi) continue;
  const iE = hayHora(dia, enM_);
  if (iE < 0) continue;
  const S = dia.barras[iE].spot, S0 = dia.barras[0].spot;
  const iFijas = {};
  for (const h of ["11:30", "12:00", "13:00"]) { const i = hayHora(dia, h); iFijas["fija" + h] = i >= 0 ? i : null; }
  const trade = haceUnDia(dia, iFijas);
  n2++;

  // (b) BARAJADO: el mapa de OTRO día, recentrado por DISTANCIA a su propia apertura
  const otro = perfiles[(p + 37) % perfiles.length];
  const listaB = [], mapaB = new Map();
  for (const e of otro.compacto) {
    const K = rejilla(S0 * (1 + e.d / 100));
    const ya = mapaB.get(K);
    if (ya) { ya.calls += e.calls; ya.puts += e.puts; ya.total += e.total; ya.prominencia = Math.max(ya.prominencia, e.prom); }
    else { const o = { K, calls: e.calls, puts: e.puts, total: e.total, prominencia: e.prom }; mapaB.set(K, o); listaB.push(o); }
  }
  const mB = montanas(listaB, S, PROM_M, DIST_M);
  const montB = ladoM_ === "C" ? mB.arriba : mB.abajo;
  if (montB) {
    const h = huecoDe(mapaB, S, montB);
    if (h.length) {
      const K = elegir(h, elM_, ladoM_ === "C");
      const r = trade(K, ladoM_, iE, saM_, montB.K);
      if (r.estado === "ok") barajado.push(r.dolares);
    }
  }

  // (d) PROMINENCIA vs TAMAÑO: strike GRANDE en bruto pero con poca prominencia
  const pk = picos(dia.oi, S0, 30);
  if (pk) {
    const cand = pk.picos.filter((e) => {
      const d = ((e.K - S) / S) * 100;
      return Math.abs(d) <= DIST_M && (ladoM_ === "C" ? e.K > S : e.K < S);
    });
    if (cand.length) {
      const maxTot = Math.max(...cand.map((e) => e.total));
      // el más GRANDE en contratos, pero exigiendo que NO sobresalga (prominencia < 1,5)
      const planos = cand.filter((e) => e.prominencia < 1.5 && e.total >= maxTot * 0.8);
      if (planos.length) {
        const mont = planos.sort((a, b) => (ladoM_ === "C" ? a.K - b.K : b.K - a.K))[0];
        const h = huecoDe(pk.mapa, S, mont);
        if (h.length) {
          const K = elegir(h, elM_, ladoM_ === "C");
          const r = trade(K, ladoM_, iE, saM_, mont.K);
          if (r.estado === "ok") grandesSinPico.push(r.dolares);
        }
      }
      const conPico = cand.filter((e) => e.prominencia >= PROM_M);
      if (conPico.length) {
        const mont = conPico.sort((a, b) => (ladoM_ === "C" ? a.K - b.K : b.K - a.K))[0];
        const h = huecoDe(pk.mapa, S, mont);
        if (h.length) {
          const K = elegir(h, elM_, ladoM_ === "C");
          const r = trade(K, ladoM_, iE, saM_, mont.K);
          if (r.estado === "ok") picoNormal.push(r.dolares);
        }
      }
    }
  }
}
const rb = resumen(barajado), rg = resumen(grandesSinPico), rp2 = resumen(picoNormal);
console.log(`(b) BARAJADO (mapa de otro día, recentrado): n=${rb.n} media $${rb.media.toFixed(0)} t=${rb.t.toFixed(2)}`);
console.log(`(d) MUCHO OI pero SIN pico (prom<1,5): n=${rg.n} media $${rg.media.toFixed(0)} t=${rg.t.toFixed(2)}`);
console.log(`(d) CON pico (prom≥${PROM_M}), mismo camino:  n=${rp2.n} media $${rp2.media.toFixed(0)} t=${rp2.t.toFixed(2)}`);
console.log(`días de la segunda pasada: ${n2}`);

// ═══ EL 21 DE AGOSTO, con la regla puesta ══════════════════════════════════════════════════
const d21 = cargarDia21();
if (d21) {
  const S0 = d21.barras[0].spot;
  const pk = picos(d21.oi, S0, 30);
  const iE = hayHora(d21, enM_);
  if (iE >= 0 && pk) {
    const S = d21.barras[iE].spot;
    const m = montanas(pk.picos, S, PROM_M, DIST_M);
    const mont = ladoM_ === "C" ? m.arriba : m.abajo;
    console.log("\n─── EL 21 DE AGOSTO con la mejor regla ──────────────────────");
    console.log(`spot a las ${enM_}: ${S.toFixed(2)} · montaña: ${mont ? `${mont.K} (prom ${mont.prominencia.toFixed(2)}, ${mont.distPct.toFixed(2)}%)` : "NO HAY"}`);
    if (mont) {
      const h = huecoDe(pk.mapa, S, mont);
      const K = elegir(h, elM_, ladoM_ === "C");
      const iFijas = {};
      for (const hh of ["11:30", "12:00", "13:00"]) { const i = hayHora(d21, hh); iFijas["fija" + hh] = i >= 0 ? i : null; }
      const r = haceUnDia(d21, iFijas)(K, ladoM_, iE, saM_, mont.K);
      console.log(`compra ${K}${ladoM_} · ${r.estado === "ok" ? `coste ${r.coste.toFixed(2)} → ingreso ${r.ingreso.toFixed(2)} = $${r.dolares.toFixed(0)} (${(100 * r.ret).toFixed(1)}%)` : r.estado}`);
    }
  }
}

console.log("\n─── CELDAS PROBADAS ───");
console.log(`${celdas.size} celdas construidas, ${tabla.length} con muestra suficiente. Con ~300 configuraciones ya probadas antes sobre estos mismos días, el listón honesto de |t| está cerca de 4, no de 2.`);
