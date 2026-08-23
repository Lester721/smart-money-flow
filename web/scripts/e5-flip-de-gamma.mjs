// EL PUNTO DE GIRO DE GAMMA (gamma flip) EN 0DTE DE SPXW — ¿sirve para elegir el LADO?
//
// ═══ QUÉ PREGUNTA CONTESTA ══════════════════════════════════════════════════════════════════
//
// La teoría de calle dice: hay un precio (el "punto de giro" o gamma flip) donde la exposición
// de gamma de los creadores de mercado cambia de signo. Por encima, dicen, el mercado se calma
// y sigue su tendencia; por debajo se vuelve nervioso y acelera. De ahí salen dos lecturas
// CONTRARIAS, y las dos se predican con la misma seguridad:
//
//   (a) MOMENTO:    el precio está por encima del giro -> compra CALLS; por debajo -> PUTS.
//   (b) REVERSIÓN:  el precio está por encima del giro -> compra PUTS;  por debajo -> CALLS.
//   (c) EL CRUCE:   el día que el precio CRUZA el giro durante la sesión, entra en la dirección
//                   del cruce a partir de ese momento.
//
// Aquí se miden las tres, con la cinta real de 1.123 sesiones (bid/ask cada 5 minutos), pagando
// el peaje de comprar al ask y vender al bid. Y contra sus propios controles, que es lo único
// que separa un hallazgo de una casualidad.
//
// ═══ CÓMO SE CALCULA EL PUNTO DE GIRO (fórmula exacta, sin modelo de precios) ════════════════
//
// Black-Scholes está prohibido en este repo, así que la gamma NO se modela: se aproxima por
// PROXIMIDAD al strike, que es lo único que hace la gamma de verdad (pesa donde está el precio).
//
//   peso(K, S) = 1 / (1 + |K - S| / 10)          (10 puntos de SPX de "anchura" de la campana)
//
//   CONVENIO 1 (el habitual): los creadores están LARGOS de calls y CORTOS de puts, así que
//        GEX(S) = Σ_K peso(K,S) · ( OI_call(K) − OI_put(K) )
//   CONVENIO 2 (el signo contrario): GEX(S) = Σ_K peso(K,S) · ( OI_put(K) − OI_call(K) )
//
//   El punto de giro es el precio S donde GEX(S) cambia de signo. Cambiar de convenio NO mueve
//   ese punto (sólo le da la vuelta al signo a los dos lados), así que probar los DOS convenios
//   es exactamente lo mismo que probar la regla (a) y la regla (b). Se documenta y se prueban
//   las dos direcciones, que es lo que importa para el dinero.
//
//   Se prueban además DOS definiciones del giro, porque las dos se usan por ahí:
//     F1 (local):     GEX(S) tal cual, con el peso de arriba. Se busca el cruce por cero más
//                     cercano a la apertura, barriendo S de ±200 puntos en pasos de 5.
//     F2 (acumulada): C(S) = Σ_{K ≤ S} ( OI_call(K) − OI_put(K) ), el cruce por cero. Es la
//                     versión "acumulada" clásica, sin peso de proximidad.
//
// El OI es el del ARRANQUE del día (compensación de la noche anterior): usarlo a las 09:30 no
// es mirar al futuro. Y una regla sólo ve barras 0..i, nunca la siguiente.
//
// ═══ LOS CONTROLES (sin ellos no hay hallazgo) ══════════════════════════════════════════════
//
//   · CONTROL TONTO: la misma compra, a la misma hora, con la misma salida, TODOS los días y
//     sin filtro — una vez comprando siempre CALLS y otra comprando siempre PUTS.
//   · BARAJADO: la misma regla pero con el punto de giro de OTRO día (desplazamiento fijo de
//     +37 sesiones; nada de azar, los scripts de este repo no usan Math.random).
//   · MITADES Y TERCIOS en el tiempo, y el LADO CONTRARIO de la mejor regla.
//
// Todo en dólares al año con UN contrato: operaciones/año × $/operación.

import { diasDisponibles, cargarDia, operar, idxHora, rejilla, resumen } from "./lib0dte.mjs";

const HORAS_ENTRADA = ["09:45", "10:00", "10:15", "10:30", "11:00", "11:30"];
const HOLDS = [6, 12, 18, 24, 36];          // barras de 5 min -> 30, 60, 90, 120, 180 minutos
const OFFSETS = [0, 5, 10, 20];             // puntos FUERA del dinero en la dirección comprada
const DESPLAZAMIENTO_BARAJADO = 37;         // sesiones; fijo, no aleatorio
const SESIONES_POR_ANO = 252;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// EL PUNTO DE GIRO
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** OI crudo {"7750|C": 1500} -> lista ordenada [{K, c, p}] */
function porStrike(oi) {
  const mapa = new Map();
  for (const k of Object.keys(oi)) {
    const i = k.indexOf("|");
    if (i < 0) continue;
    const K = +k.slice(0, i);
    const lado = k.slice(i + 1);
    const v = +oi[k];
    if (!(K > 0) || !(v > 0)) continue;
    let e = mapa.get(K);
    if (!e) { e = { K, c: 0, p: 0 }; mapa.set(K, e); }
    if (lado === "C") e.c += v; else if (lado === "P") e.p += v;
  }
  return [...mapa.values()].sort((a, b) => a.K - b.K);
}

/** Cruce por cero de una curva muestreada, el más cercano a `ancla`. Interpola linealmente. */
function cruceMasCercano(xs, ys, ancla) {
  let mejor = null, dist = Infinity;
  for (let i = 1; i < xs.length; i++) {
    const a = ys[i - 1], b = ys[i];
    if (a === 0) { if (Math.abs(xs[i - 1] - ancla) < dist) { dist = Math.abs(xs[i - 1] - ancla); mejor = xs[i - 1]; } continue; }
    if ((a < 0 && b > 0) || (a > 0 && b < 0)) {
      const x = xs[i - 1] + ((0 - a) / (b - a)) * (xs[i] - xs[i - 1]);
      if (Math.abs(x - ancla) < dist) { dist = Math.abs(x - ancla); mejor = x; }
    }
  }
  return mejor;
}

/** F1: giro local con peso de proximidad. Devuelve el precio del giro, o null si no cruza. */
function flipLocal(strikes, spot0) {
  const xs = [], ys = [];
  for (let S = spot0 - 200; S <= spot0 + 200; S += 5) {
    let g = 0;
    for (const e of strikes) {
      const d = Math.abs(e.K - S);
      if (d > 120) continue;                       // el peso ya es < 0,08: aporta ruido
      g += (e.c - e.p) / (1 + d / 10);
    }
    xs.push(S); ys.push(g);
  }
  return cruceMasCercano(xs, ys, spot0);
}

/**
 * F2: giro acumulado clásico, sin peso, SOBRE LA BANDA DE ±200 PUNTOS.
 * (La primera versión acumulaba la cadena entera y el cruce salía ~2.800 puntos por debajo del
 *  precio: con toda la cola de puts baratísimos dentro, el "giro" quedaba en un sitio donde el
 *  índice no ha estado nunca y la regla degeneraba en "compra siempre calls". Se acota a la
 *  banda donde el precio puede estar de verdad en una sesión.)
 */
function flipAcumulado(strikes, spot0) {
  const xs = [], ys = [];
  let acc = 0;
  for (const e of strikes) {
    if (Math.abs(e.K - spot0) > 200) continue;
    acc += e.c - e.p; xs.push(e.K); ys.push(acc);
  }
  if (xs.length < 10) return null;
  return cruceMasCercano(xs, ys, spot0);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PASADA 1 — el punto de giro de cada día (hace falta antes, para poder barajarlo)
// ─────────────────────────────────────────────────────────────────────────────────────────────

const dias = diasDisponibles();
console.log(`días con cadena 0DTE: ${dias.length}  (${dias[0]} … ${dias[dias.length - 1]})`);

const t0 = Date.now();
const info = [];                                  // {dia, spot0, f1, f2}
let sinOI = 0, incompletos = 0, sinCruceF1 = 0, sinCruceF2 = 0;

for (const d of dias) {
  const D = cargarDia(d);
  if (!D) { incompletos++; continue; }
  if (!D.oi) { sinOI++; continue; }
  const strikes = porStrike(D.oi);
  if (strikes.length < 20) { sinOI++; continue; }
  const spot0 = D.barras[0].spot;
  const f1 = flipLocal(strikes, spot0);
  const f2 = flipAcumulado(strikes, spot0);
  if (f1 == null) sinCruceF1++;
  if (f2 == null) sinCruceF2++;
  info.push({ dia: d, spot0, f1, f2, nStrikes: strikes.length });
}
console.log(`pasada 1 en ${((Date.now() - t0) / 1000).toFixed(0)}s — días con OI usable: ${info.length}` +
  `  (sin OI: ${sinOI}, cadena incompleta: ${incompletos}, sin cruce F1: ${sinCruceF1}, sin cruce F2: ${sinCruceF2})`);

// diagnóstico: dónde cae el giro respecto a la apertura, y cuántos días arrancan por encima
for (const cual of ["f1", "f2"]) {
  const ds = info.filter((x) => x[cual] != null).map((x) => x[cual] - x.spot0).sort((a, b) => a - b);
  const q = (p) => ds[Math.floor(p * (ds.length - 1))].toFixed(1);
  const arriba = info.filter((x) => x[cual] != null && x.spot0 > x[cual]).length;
  console.log(`  ${cual}: giro − apertura  p10=${q(0.1)}  p50=${q(0.5)}  p90=${q(0.9)}  ` +
    `|  días con apertura POR ENCIMA del giro: ${arriba}/${ds.length} (${(100 * arriba / ds.length).toFixed(0)}%)`);
}

const flipDe = new Map(info.map((x) => [x.dia, x]));
const orden = info.map((x) => x.dia);
const ANOS = orden.length / SESIONES_POR_ANO;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PASADA 2 — todas las reglas, día a día (el día se carga una vez y se usa para todo)
// ─────────────────────────────────────────────────────────────────────────────────────────────

const acc = new Map();   // clave -> {ret:[], dol:[], idx:[], huecos:0, costes:[]}
function anota(clave, i, r) {
  let a = acc.get(clave);
  if (!a) { a = { ret: [], dol: [], idx: [], huecos: 0, costes: [] }; acc.set(clave, a); }
  if (r == null) { a.huecos++; return; }
  a.ret.push(r.ret); a.dol.push(r.dolares); a.idx.push(i); a.costes.push(r.coste);
}

const t1 = Date.now();
for (let i = 0; i < orden.length; i++) {
  const dia = orden[i];
  const D = cargarDia(dia);
  if (!D) continue;
  const yo = flipDe.get(dia);
  // BARAJADO: se coge la DISTANCIA giro−apertura de otro día y se pega sobre la apertura de hoy.
  // (Pegar el giro de otro día en crudo no vale: el SPX pasó de 4.700 a 7.700 en la muestra, así
  //  que el giro ajeno cae fuera del rango del día y la regla degenera en "compra siempre lo
  //  mismo". Con la distancia se conserva la geometría y sólo se pierde la señal, que es lo que
  //  se quiere destruir.)
  const cru = flipDe.get(orden[(i + DESPLAZAMIENTO_BARAJADO) % orden.length]);
  const otro = {
    f1: cru.f1 == null ? null : D.barras[0].spot + (cru.f1 - cru.spot0),
    f2: cru.f2 == null ? null : D.barras[0].spot + (cru.f2 - cru.spot0),
  };

  const idxs = HORAS_ENTRADA.map((h) => idxHora(D, h));
  const ultima = D.barras.length - 1;

  // ── reglas (a) momento y (b) reversión, y sus controles y su barajado ──────────────────────
  for (let h = 0; h < HORAS_ENTRADA.length; h++) {
    const ie = idxs[h];
    if (ie < 0) continue;
    const S = D.barras[ie].spot;
    for (const hold of HOLDS) {
      const is = Math.min(ie + hold, ultima);
      if (is <= ie) continue;
      for (const off of OFFSETS) {
        const KC = rejilla(S) + off;         // call fuera del dinero
        const KP = rejilla(S) - off;         // put fuera del dinero
        const rc = operar(D, ie, is, KC, "C");
        const rp = operar(D, ie, is, KP, "P");
        const sufijo = `${HORAS_ENTRADA[h]}|h${hold}|o${off}`;

        // controles tontos: siempre el mismo lado, todos los días
        anota(`TONTO-C|${sufijo}`, i, rc);
        anota(`TONTO-P|${sufijo}`, i, rp);

        for (const cual of ["f1", "f2"]) {
          const f = yo[cual];
          if (f != null) {
            const encima = S > f;
            anota(`A-${cual}|${sufijo}`, i, encima ? rc : rp);   // momento
            anota(`B-${cual}|${sufijo}`, i, encima ? rp : rc);   // reversión
          }
          const fb = otro[cual];
          if (fb != null) {
            const encimaB = S > fb;
            anota(`Abar-${cual}|${sufijo}`, i, encimaB ? rc : rp);
            anota(`Bbar-${cual}|${sufijo}`, i, encimaB ? rp : rc);
          }
        }
      }
    }
  }

  // ── regla (c) el cruce: primer cruce del giro durante la sesión ────────────────────────────
  const iIni = Math.max(1, idxHora(D, "09:35"));
  const iFin = idxHora(D, "14:00") > 0 ? idxHora(D, "14:00") : ultima - 12;
  for (const cual of ["f1", "f2"]) {
    for (const [etq, fuente] of [["C", yo], ["Cbar", otro]]) {
      const f = fuente[cual];
      if (f == null) continue;
      let iC = -1, arriba = null;
      for (let k = iIni; k <= iFin; k++) {
        const antes = D.barras[k - 1].spot > f;
        const ahora = D.barras[k].spot > f;
        if (antes !== ahora) { iC = k; arriba = ahora; break; }   // sólo el PRIMER cruce
      }
      if (iC < 0) continue;
      const S = D.barras[iC].spot;
      for (const hold of HOLDS) {
        const is = Math.min(iC + hold, ultima);
        if (is <= iC) continue;
        for (const off of OFFSETS) {
          const KC = rejilla(S) + off, KP = rejilla(S) - off;
          const rc = operar(D, iC, is, KC, "C");
          const rp = operar(D, iC, is, KP, "P");
          const suf = `h${hold}|o${off}`;
          anota(`${etq}mom-${cual}|${suf}`, i, arriba ? rc : rp);   // dirección del cruce
          anota(`${etq}rev-${cual}|${suf}`, i, arriba ? rp : rc);   // contra el cruce
          // control tonto DEL CRUCE: los mismos días, la misma barra, pero el lado fijo.
          // Aísla la dirección (lo que la regla dice aportar) de la hora y del día elegidos.
          if (etq === "C") {
            anota(`TCRUCE-C-${cual}|${suf}`, i, rc);
            anota(`TCRUCE-P-${cual}|${suf}`, i, rp);
          }
        }
      }
    }
  }
}
console.log(`pasada 2 en ${((Date.now() - t1) / 1000).toFixed(0)}s — combinaciones medidas: ${acc.size}`);

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ANÁLISIS
// ─────────────────────────────────────────────────────────────────────────────────────────────

function evalua(clave) {
  const a = acc.get(clave);
  if (!a || a.ret.length < 30) return null;
  const r = resumen(a.ret);
  const n = a.ret.length;
  const c1 = Math.floor(n / 2), t1i = Math.floor(n / 3), t2i = Math.floor((2 * n) / 3);
  const dolMedia = a.dol.reduce((x, y) => x + y, 0) / n;
  const costes = [...a.costes].sort((x, y) => x - y);
  return {
    clave, n, mediaPct: r.media * 100, t: r.t, aciertos: r.aciertos, huecos: a.huecos,
    dolMedia, dolAno: (n / ANOS) * dolMedia,
    m1: resumen(a.ret.slice(0, c1)).media * 100,
    m2: resumen(a.ret.slice(c1)).media * 100,
    t1: resumen(a.ret.slice(0, t1i)).media * 100,
    t2: resumen(a.ret.slice(t1i, t2i)).media * 100,
    t3: resumen(a.ret.slice(t2i)).media * 100,
    costeP10: costes[Math.floor(0.1 * (n - 1))], costeMed: costes[Math.floor(0.5 * (n - 1))],
    costeP90: costes[Math.floor(0.9 * (n - 1))],
  };
}

const filas = [...acc.keys()].map(evalua).filter(Boolean);
const fam = (c) => c.split("|")[0];
const esControl = (c) => fam(c).startsWith("TONTO") || fam(c).startsWith("TCRUCE") || fam(c).includes("bar");

/**
 * El control tonto medido SÓLO EN LOS DÍAS QUE LA REGLA OPERÓ.
 * Sin esto la comparación está trucada: la regla F2 sólo opera 546 de los 1.119 días (los que
 * tienen cruce), y compararla contra un control de 1.117 días mezcla dos cosas distintas —
 * elegir el LADO y elegir el DÍA. Aquí el control ve exactamente los mismos días.
 */
function controlMismosDias(claveControl, idxs) {
  const a = acc.get(claveControl);
  if (!a) return null;
  const m = new Map(a.idx.map((d, j) => [d, [a.ret[j], a.dol[j]]]));
  const rv = [], dv = [];
  for (const d of idxs) { const v = m.get(d); if (v) { rv.push(v[0]); dv.push(v[1]); } }
  if (rv.length < 30) return null;
  const r = resumen(rv);
  const dm = dv.reduce((x, y) => x + y, 0) / dv.length;
  const c1 = Math.floor(rv.length / 2);
  return {
    clave: claveControl, n: rv.length, mediaPct: r.media * 100, t: r.t, aciertos: r.aciertos,
    dolAno: (rv.length / ANOS) * dm,
    m1: resumen(rv.slice(0, c1)).media * 100, m2: resumen(rv.slice(c1)).media * 100,
  };
}

/** Los dos controles tontos (siempre call / siempre put) que le tocan a una regla. */
function tontosDe(clave) {
  const suf = clave.slice(clave.indexOf("|") + 1);
  const idxs = acc.get(clave).idx;
  if (fam(clave).startsWith("C")) {                 // familia del cruce: misma barra de cruce
    const cual = fam(clave).slice(-2);
    return [controlMismosDias(`TCRUCE-C-${cual}|${suf}`, idxs), controlMismosDias(`TCRUCE-P-${cual}|${suf}`, idxs)];
  }
  return [controlMismosDias(`TONTO-C|${suf}`, idxs), controlMismosDias(`TONTO-P|${suf}`, idxs)];
}

// control de sanidad: el coste de entrada tiene que parecer una 0DTE cerca del dinero
const muestra = evalua("TONTO-C|10:00|h12|o10");
console.log(`\nSANIDAD (control tonto, calls 10 puntos fuera, entrada 10:00, 60 min):`);
console.log(`  n=${muestra.n}  huecos=${muestra.huecos}  coste de entrada p10=$${muestra.costeP10.toFixed(2)} ` +
  `mediana=$${muestra.costeMed.toFixed(2)} p90=$${muestra.costeP90.toFixed(2)}`);

const linea = (f) => `${f.clave.padEnd(28)} n=${String(f.n).padStart(5)} ` +
  `media=${f.mediaPct.toFixed(2).padStart(7)}%  t=${f.t.toFixed(2).padStart(6)}  ` +
  `aciertos=${(100 * f.aciertos).toFixed(0).padStart(3)}%  $/año=${f.dolAno.toFixed(0).padStart(8)}  ` +
  `mitades ${f.m1.toFixed(2)}/${f.m2.toFixed(2)}`;

console.log(`\n═══ CONTROLES TONTOS (mejores 6 por t) ══════════════════════════════════════`);
filas.filter((f) => fam(f.clave).startsWith("TONTO")).sort((a, b) => b.t - a.t).slice(0, 6).forEach((f) => console.log("  " + linea(f)));

const reglas = filas.filter((f) => !esControl(f.clave));
console.log(`\n═══ REGLAS DEL GIRO — mejores 12 por t (de ${reglas.length} candidatas) ══`);
reglas.sort((a, b) => b.t - a.t).slice(0, 12).forEach((f) => {
  const [tc, tp] = tontosDe(f.clave);
  const l = tc && tp ? Math.max(tc.mediaPct, tp.mediaPct) : NaN;
  console.log("  " + linea(f) + `  | su tonto=${l.toFixed(2)}%`);
});

console.log(`\n═══ LO PEOR (por si la señal va del revés) ═══`);
reglas.slice(-4).forEach((f) => console.log("  " + linea(f)));

// resumen por familia: media de la media, para ver si alguna familia se levanta del suelo
console.log(`\n═══ MEDIA DE CADA FAMILIA (todas sus combinaciones) ═══`);
const porFam = new Map();
for (const f of filas) {
  const k = fam(f.clave);
  if (!porFam.has(k)) porFam.set(k, []);
  porFam.get(k).push(f);
}
[...porFam.entries()].sort().forEach(([k, v]) => {
  const m = v.reduce((a, b) => a + b.mediaPct, 0) / v.length;
  const mt = v.reduce((a, b) => a + b.t, 0) / v.length;
  console.log(`  ${k.padEnd(12)} combos=${String(v.length).padStart(3)}  media=${m.toFixed(2)}%  t medio=${mt.toFixed(2)}  mejor t=${Math.max(...v.map((x) => x.t)).toFixed(2)}`);
});

// ── LA MEJOR REGLA, con todos sus controles al lado ───────────────────────────────────────────
const mejor = reglas.sort((a, b) => b.t - a.t)[0];
const [fMejor, sufMejor] = [fam(mejor.clave), mejor.clave.slice(mejor.clave.indexOf("|") + 1)];
const contrarioFam = fMejor.startsWith("A-") ? fMejor.replace("A-", "B-")
  : fMejor.startsWith("B-") ? fMejor.replace("B-", "A-")
    : fMejor.includes("mom-") ? fMejor.replace("mom-", "rev-")
      : fMejor.replace("rev-", "mom-");
// el barajado de A-/B- se llama Abar-/Bbar-; el del cruce, Cmom- -> Cbarmom-
const barajadoFam = fMejor.startsWith("A-") ? fMejor.replace("A-", "Abar-")
  : fMejor.startsWith("B-") ? fMejor.replace("B-", "Bbar-")
    : fMejor.replace(/^C/, "Cbar");
// el sufijo del cruce no lleva hora de entrada; para su control tonto se usa la de las 10:00
const sufTonto = sufMejor.split("|").length === 3 ? sufMejor : "10:00|" + sufMejor;

const contrario = evalua(`${contrarioFam}|${sufMejor}`);
const barajado = evalua(`${barajadoFam}|${sufMejor}`);
const [tontoC, tontoP] = tontosDe(mejor.clave);
void sufTonto;

console.log(`\n═══ LA MEJOR, CON SUS CONTROLES ═════════════════════════════════════════════`);
console.log(`  MEJOR      ${linea(mejor)}`);
console.log(`             tercios ${mejor.t1.toFixed(2)} / ${mejor.t2.toFixed(2)} / ${mejor.t3.toFixed(2)}   huecos=${mejor.huecos}`);
console.log(`             coste entrada p10=$${mejor.costeP10.toFixed(2)} med=$${mejor.costeMed.toFixed(2)} p90=$${mejor.costeP90.toFixed(2)}`);
if (contrario) console.log(`  CONTRARIA  ${linea(contrario)}`);
if (barajado) console.log(`  BARAJADA   ${linea(barajado)}`);
if (tontoC) console.log(`  TONTO call ${linea(tontoC)}`);
if (tontoP) console.log(`  TONTO put  ${linea(tontoP)}`);

// ¿cuántas reglas del giro baten a su propio control tonto? (el listón familia a familia)
let baten = 0, total = 0;
for (const f of reglas) {
  const [a, b] = tontosDe(f.clave);
  if (!a || !b) continue;
  total++;
  if (f.mediaPct > Math.max(a.mediaPct, b.mediaPct)) baten++;
}
// ── FICHA COMPLETA DE LA MEJOR DE CADA FAMILIA ────────────────────────────────────────────────
console.log(`\n═══ FICHA DE LA MEJOR COMBINACIÓN DE CADA FAMILIA ═══════════════════════════`);
for (const [k, v] of [...porFam.entries()].sort()) {
  if (esControl(k)) continue;
  const f = v.slice().sort((a, b) => b.t - a.t)[0];
  const suf = f.clave.slice(f.clave.indexOf("|") + 1);
  const [tc, tp] = tontosDe(f.clave);
  const cFam = k.startsWith("A-") ? k.replace("A-", "B-") : k.startsWith("B-") ? k.replace("B-", "A-")
    : k.includes("mom-") ? k.replace("mom-", "rev-") : k.replace("rev-", "mom-");
  const bFam = k.startsWith("A-") ? k.replace("A-", "Abar-") : k.startsWith("B-") ? k.replace("B-", "Bbar-")
    : k.replace(/^C/, "Cbar");
  const con = evalua(`${cFam}|${suf}`), bar = evalua(`${bFam}|${suf}`);
  const liston = tc && tp ? Math.max(tc.mediaPct, tp.mediaPct) : NaN;
  console.log(`\n  ${f.clave}   n=${f.n}  media=${f.mediaPct.toFixed(2)}%  t=${f.t.toFixed(2)}  ` +
    `$/año=${f.dolAno.toFixed(0)}  huecos=${f.huecos}`);
  console.log(`     mitades ${f.m1.toFixed(2)} / ${f.m2.toFixed(2)}   tercios ${f.t1.toFixed(2)} / ${f.t2.toFixed(2)} / ${f.t3.toFixed(2)}`);
  console.log(`     LISTÓN (mismos días, lado fijo): call ${tc ? tc.mediaPct.toFixed(2) : "—"}% ($/año ${tc ? tc.dolAno.toFixed(0) : "—"}) · ` +
    `put ${tp ? tp.mediaPct.toFixed(2) : "—"}% ($/año ${tp ? tp.dolAno.toFixed(0) : "—"})  ->  el listón es ${liston.toFixed(2)}%`);
  console.log(`     BARAJADA ${bar ? bar.mediaPct.toFixed(2) + "% (n=" + bar.n + ")" : "—"}   LADO CONTRARIO ${con ? con.mediaPct.toFixed(2) + "%" : "—"}`);
  const ok = liston != null && f.mediaPct > liston && (!bar || f.mediaPct > bar.mediaPct) && Math.sign(f.m1) === Math.sign(f.m2);
  console.log(`     ¿SOBREVIVE? ${ok ? "sí" : "NO"}  (bate al listón: ${f.mediaPct > liston}, bate al barajado: ${bar ? f.mediaPct > bar.mediaPct : "sin barajado"}, mitades del mismo signo: ${Math.sign(f.m1) === Math.sign(f.m2)})`);
}

// ── ¿LA MEDIA ES DE TODOS LOS DÍAS O DE CUATRO DÍAS? ──────────────────────────────────────────
// Comprar opciones tiene la cola gorda a la derecha: la media puede venir de tres martes.
// Si al quitar los 3 mejores días la regla se cae, no hay regla, hay lotería.
console.log(`\n═══ ¿DE CUÁNTOS DÍAS SALE LA MEDIA? ═════════════════════════════════════════`);
for (const clave of ["Cmom-f1|h12|o10", "A-f2|10:00|h24|o20", "B-f1|10:00|h24|o5"]) {
  const a = acc.get(clave);
  const v = a.ret.slice().sort((x, y) => x - y);
  const med = v[Math.floor(v.length / 2)] * 100;
  const sinTop3 = (v.slice(0, -3).reduce((x, y) => x + y, 0) / (v.length - 3)) * 100;
  const top3 = v.slice(-3).map((x) => (x * 100).toFixed(0) + "%").join(", ");
  console.log(`  ${clave.padEnd(22)} media=${(resumen(a.ret).media * 100).toFixed(2)}%  MEDIANA=${med.toFixed(2)}%  ` +
    `sin los 3 mejores=${sinTop3.toFixed(2)}%  (los 3 mejores: ${top3})`);
}

console.log(`\n  reglas del giro que baten a su propio control tonto: ${baten}/${total} (${(100 * baten / total).toFixed(0)}%)`);
console.log(`  años de muestra: ${ANOS.toFixed(2)}  (${orden.length} sesiones)`);
