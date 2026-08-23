// ═══════════════════════════════════════════════════════════════════════════════════════════
// E4 · LOS MUROS DE INTERÉS ABIERTO COMO SUELO Y TECHO — ¿rebota el precio, o es una raya más?
//
// ═══ DE DÓNDE VIENE LA PREGUNTA ═════════════════════════════════════════════════════════════
//
// Un compañero de Lester enseñó cuatro calls 0DTE ganadoras del 21 de agosto y dijo que las
// eligió «por el GEX». Ese día el precio se hundió por la mañana, tocó suelo a las 10:40 y
// subió hacia el strike con más interés abierto cerca del dinero. Sus entradas caen en el hoyo
// y sus salidas en el rebote.
//
// La pregunta que eso deja abierta es distinta a todo lo que este proyecto ya midió. Lo que ya
// está CERRADO es el GEX como predictor del CIERRE del día: el muro atrae al precio menos que
// una raya al azar (38,8% contra 43,2%), y el GEX vivo barra a barra tampoco predice. Pero
// nadie ha medido si el precio VIAJA hacia el muro durante la sesión y luego vuelve. Un
// scalper que entra en el hoyo y sale en el rebote cobraría ese viaje aunque el que aguanta
// hasta el cierre no cobre nada.
//
// ═══ QUÉ MIDE ESTE FICHERO, EN DOS PARTES ═══════════════════════════════════════════════════
//
// PARTE A — EL HECHO FÍSICO, sin opciones de por medio. Se define:
//     muro de puts  = el strike con MÁS interés abierto de PUTS por DEBAJO del precio de apertura
//     muro de calls = el strike con MÁS interés abierto de CALLS por ENCIMA del precio de apertura
//   (el interés abierto es el del arranque del día, de la compensación de la noche anterior:
//    usarlo a las 09:30 no es mirar al futuro).
//   Se busca la PRIMERA barra en que el precio entra en la zona del muro (a menos de X puntos)
//   y se mira qué hace en la HORA SIGUIENTE (12 barras de 5 minutos). El signo se pone a favor
//   de la hipótesis: en el muro de puts, subir es rebotar; en el de calls, bajar es frenarse.
//
//   Y contra qué se compara — esto es lo único que decide:
//     · RAYA BARAJADA: el mismo día, pero el nivel se pone a la distancia que tenía el muro de
//       OTRO día (índice desplazado 37 puestos, sin azar real: los scripts no usan Math.random).
//       Misma distancia típica, misma mecánica, cero relación con el interés abierto de HOY.
//       Si la raya barajada se porta igual, el muro no es un muro: lo que se mide es la distancia.
//     · RAYA ESPEJO: un nivel a la MISMA distancia pero al otro lado de la apertura. Si tocar
//       algo 140 puntos abajo y rebotar pasa igual que tocar algo 140 puntos arriba y caerse,
//       lo que hay es reversión a la media, no un muro.
//     · VECINDAD: el muro corrido ±15 y ±30 puntos. Mismo día, casi la misma distancia.
//
// PARTE B — LA REGLA CON DINERO. Cuando el precio se acerca a menos de X puntos del muro de
//   puts, se compra una CALL; cuando se acerca al de calls, se compra una PUT. Rejilla de X en
//   {5,10,15,20,30,50}, de strike en {en el dinero, +5, +10, +15, +20, +25 puntos fuera} y de
//   salida en {30 min, 1 h, 1 h 30, 2 h, cierre}. Una sola entrada por día y por muro (el primer
//   toque) para que un día movido no cuente diez veces.
//
//   Los tres controles obligatorios de la casa:
//     a) EL CONTROL TONTO: la misma compra y la misma salida TODOS los días, sin filtro, entrando
//        cada 15 minutos. Si el filtro no bate esto, el filtro no aporta nada.
//     b) LAS MITADES Y LOS TERCIOS en el tiempo.
//     c) EL BARAJADO: la misma regla con la distancia del muro de otro día.
//   Y el control de simetría: la misma señal comprando el lado CONTRARIO. Si las dos «funcionan»,
//   lo que se ha encontrado es volatilidad, no dirección.
//
// Se compra al ASK y se vende al BID, siempre. Un hueco de precio no es un cero: se descarta la
// operación y se cuenta aparte.
//
// Uso: node --import tsx scripts/e4-muros-suelo-y-techo.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { writeFileSync } from "node:fs";
import { diasDisponibles, cargarDia, operar, rejilla, resumen } from "./lib0dte.mjs";

const DESPL = 37;              // desplazamiento del barajado (determinista, sin Math.random)
const HORIZONTE_MAX = 24;      // 2 horas: ninguna entrada más tarde de 2 h antes del cierre
const HORA_FISICA = 12;        // la «hora siguiente» de la parte A = 12 barras de 5 min
const XS = [5, 10, 15, 20, 30, 50];
const OFFS = [0, 5, 10, 15, 20, 25];
const HS = [6, 12, 18, 24, "cierre"];
const DIAS_ANO = 252;
const BANDA = 0.01;            // ±1% de la apertura para la definición «muro cercano»
const DEFS = ["lejos", "cerca"];

const num = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "—");
const pct = (x, d = 2) => (Number.isFinite(x) ? (x * 100).toFixed(d) + "%" : "—");

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PASADA 1 — el camino del precio y los muros. Sin precios de opciones, así que cabe en memoria.
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log("PASADA 1 — leyendo caminos del SPX y muros de interés abierto…");
const t0 = Date.now();
const todos = diasDisponibles();
const meta = [];
let sinOI = 0, sinMuroP = 0, sinMuroC = 0, incompletos = 0;

for (const d of todos) {
  const D = cargarDia(d);
  if (!D) { incompletos++; continue; }
  const spots = D.barras.map((b) => b.spot);
  const horas = D.barras.map((b) => b.t);
  // dos definiciones del muro:
  //   «lejos» = todos los strikes del lado que toca (la definición literal del encargo)
  //   «cerca» = sólo los strikes dentro del BANDA % de la apertura. Hace falta porque el OI de
  //             puts se acumula muy abajo (seguros contra caídas) y el muro literal casi nunca
  //             se toca: sin esta segunda definición el lado de las puts se queda sin muestra.
  const banda = spots[0] * BANDA;
  let mp = null, mpOI = 0, mc = null, mcOI = 0, mpc = null, mpcOI = 0, mcc = null, mccOI = 0;
  if (!D.oi) sinOI++;
  else {
    for (const k in D.oi) {
      const v = D.oi[k];
      if (!(v > 0)) continue;
      const bar = k.indexOf("|");
      if (bar < 0) continue;                       // clave con otra forma: no se adivina
      const K = +k.slice(0, bar), lado = k.slice(bar + 1);
      if (!(K > 0)) continue;
      if (lado === "P" && K < spots[0]) {
        if (v > mpOI) { mpOI = v; mp = K; }
        if (spots[0] - K <= banda && v > mpcOI) { mpcOI = v; mpc = K; }
      }
      if (lado === "C" && K > spots[0]) {
        if (v > mcOI) { mcOI = v; mc = K; }
        if (K - spots[0] <= banda && v > mccOI) { mccOI = v; mcc = K; }
      }
    }
  }
  if (mp == null) sinMuroP++;
  if (mc == null) sinMuroC++;
  meta.push({ dia: d, spots, horas, n: spots.length, mp, mpOI, mc, mcOI, mpc, mpcOI, mcc, mccOI });
}
const N = meta.length;
const ANOS = N / DIAS_ANO;
console.log(`  días con cadena: ${N} de ${todos.length} (${incompletos} truncados)`);
console.log(`  sin fichero de OI: ${sinOI} · sin muro de puts válido: ${sinMuroP} · sin muro de calls: ${sinMuroC}`);
console.log(`  rango: ${meta[0].dia} → ${meta[N - 1].dia}  (${ANOS.toFixed(2)} años de sesiones)`);
console.log(`  barras por día: min ${Math.min(...meta.map((m) => m.n))} · max ${Math.max(...meta.map((m) => m.n))}`);
// El muro del día j, por lado y por definición. Es la única puerta a los muros: si mañana se
// añade otra definición, se añade aquí y todo lo demás la hereda.
const muroDe = (m, muro, def) =>
  muro === "P" ? (def === "lejos" ? m.mp : m.mpc) : (def === "lejos" ? m.mc : m.mcc);
/** Distancia (siempre positiva) de la apertura al muro. null si ese día no tiene muro. */
const distDe = (m, muro, def) => {
  const K = muroDe(m, muro, def);
  return K == null ? null : Math.abs(m.spots[0] - K);
};
/** Un nivel puesto a la distancia `d` del lado que le toca al muro. */
const nivelA = (m, muro, d) => (d == null ? null : muro === "P" ? m.spots[0] - d : m.spots[0] + d);

for (const def of DEFS) {
  for (const muro of ["P", "C"]) {
    const ds = meta.map((m) => distDe(m, muro, def)).filter((x) => x != null).sort((a, b) => a - b);
    const q = (p) => ds[Math.floor(ds.length * p)];
    console.log(`  muro de ${muro === "P" ? "PUTS " : "CALLS"} (${def}): ${ds.length} días con muro · distancia ` +
      `p10 ${num(q(0.1), 0)} · mediana ${num(q(0.5), 0)} · p90 ${num(q(0.9), 0)} pts`);
  }
}
{
  const m = meta.find((x) => x.dia === "2026-08-21");
  console.log(`  comprobación 21-ago-2026: ${m ? `apertura ${num(m.spots[0], 2)} · muro P ${m.mp} (${m.mpOI}) · muro C ${m.mc} (${m.mcOI})`
    : "ese día NO está en el banco (llega hasta 2026-08-10)"}`);
}
console.log(`  pasada 1: ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);

/** Primer instante en que el precio entra en la zona (a ≤X puntos del nivel).
 *  Exige que el día NACIERA fuera de la zona: si no, no hay acercamiento que medir.
 *  Exige también dejar `holgura` barras hasta el cierre. Devuelve -1 si no pasa. */
function primerToque(spots, level, X, holgura) {
  if (level == null || !Number.isFinite(level)) return -1;
  if (Math.abs(spots[0] - level) <= X) return -1;
  const tope = spots.length - 1 - holgura;
  for (let i = 1; i <= tope; i++) if (Math.abs(spots[i] - level) <= X) return i;
  return -1;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PARTE A — EL HECHO FÍSICO
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log("═".repeat(95));
console.log("PARTE A — al tocar la zona, ¿qué hace el precio en la HORA siguiente? (puntos de SPX)");
console.log("  signo a favor de la hipótesis: en el muro de PUTS subir es +, en el de CALLS bajar es +");
console.log("═".repeat(95));

/** nivelDe(j) -> nivel para el día j, o null. signo: +1 si rebotar es subir. */
function medirFisica(nivelDe, signo, X) {
  const mov = [];
  for (let j = 0; j < N; j++) {
    const m = meta[j];
    const lv = nivelDe(j, m);
    const i = primerToque(m.spots, lv, X, HORA_FISICA);
    if (i < 0) continue;
    mov.push(signo * (m.spots[i + HORA_FISICA] - m.spots[i]));
  }
  return resumen(mov);
}

const filasA = [];
const L = (et, r) => `    ${et.padEnd(28)} n=${String(r.n).padStart(4)}  media ${num(r.media, 3).padStart(7)} pts  a favor ${pct(r.aciertos, 1).padStart(6)}  t=${num(r.t, 2).padStart(6)}`;

for (const def of DEFS) {
  for (const muro of ["P", "C"]) {
    const signo = muro === "P" ? +1 : -1;          // en el muro de puts rebotar es SUBIR
    console.log(`\n  ── muro de ${muro === "P" ? "PUTS" : "CALLS"} · definición «${def}» ${"─".repeat(50)}`);
    for (const X of XS) {
      const real = medirFisica((j, m) => muroDe(m, muro, def), signo, X);
      const bara = medirFisica((j, m) => nivelA(m, muro, distDe(meta[(j + DESPL) % N], muro, def)), signo, X);
      const espe = medirFisica((j, m) => {
        const d = distDe(m, muro, def);
        return d == null ? null : muro === "P" ? m.spots[0] + d : m.spots[0] - d;
      }, -signo, X);
      const vecF = medirFisica((j, m) => { const K = muroDe(m, muro, def); return K == null ? null : K + signo * -30; }, signo, X);
      const vecC = medirFisica((j, m) => { const K = muroDe(m, muro, def); return K == null ? null : K + signo * 15; }, signo, X);
      filasA.push({ def, muro, X, real, bara, espe, vecF, vecC });
      console.log(`\n   X = ${X} pts`);
      console.log(L("MURO (real)", real));
      console.log(L("  raya barajada", bara));
      console.log(L("  raya espejo (otro lado)", espe));
      console.log(L("  vecino 30 pts más lejos", vecF));
      console.log(L("  vecino 15 pts más cerca", vecC));
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PASADA 2 — LA REGLA CON DINERO
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(95));
console.log("PASADA 2 — comprando opciones de verdad (ask a la entrada, bid a la salida)…");
console.log("═".repeat(95));

// Entradas precalculadas: para cada día, cada muro y cada X → índice de barra del primer toque.
// fuentes: "real" (muro de hoy) y "bar" (distancia del muro de otro día).
const entradas = meta.map((m, j) => {
  const e = {};
  for (const def of DEFS) for (const muro of ["P", "C"]) for (const X of XS) {
    e[`${def}|${muro}|real|${X}`] = primerToque(m.spots, muroDe(m, muro, def), X, HORIZONTE_MAX);
    e[`${def}|${muro}|bar|${X}`] = primerToque(m.spots, nivelA(m, muro, distDe(meta[(j + DESPL) % N], muro, def)), X, HORIZONTE_MAX);
  }
  return e;
});

const V = new Map();   // clave de variante -> acumulador
function acc(clave) {
  let a = V.get(clave);
  if (!a) { a = { ret: [], dol: [], cos: [], dia: [], hor: [], huecos: 0 }; V.set(clave, a); }
  return a;
}

const t1 = Date.now();
let leidos = 0;
for (let j = 0; j < N; j++) {
  const m = meta[j];
  const D = cargarDia(m.dia);
  if (!D) continue;
  leidos++;
  const ult = D.barras.length - 1;

  // ── la regla y sus controles de señal ────────────────────────────────────────────────────
  for (const def of DEFS) {
    for (const muro of ["P", "C"]) {
      for (const fuente of ["real", "bar"]) {
        for (const X of XS) {
          const i = entradas[j][`${def}|${muro}|${fuente}|${X}`];
          if (i < 0) continue;
          const spot = m.spots[i];
          // hipótesis: en el muro de puts se compran CALLS; en el de calls, PUTS.
          // contrario: el mismo disparo comprando el otro lado (control de simetría).
          const lados = fuente === "real" ? [["hip", muro === "P" ? "C" : "P"], ["con", muro === "P" ? "P" : "C"]]
                                          : [["hip", muro === "P" ? "C" : "P"]];
          for (const [tag, lado] of lados) {
            for (const off of OFFS) {
              const K = lado === "C" ? rejilla(spot) + off : rejilla(spot) - off;
              for (const H of HS) {
                const iSal = H === "cierre" ? ult : Math.min(i + H, ult);
                const r = operar(D, i, iSal, K, lado);
                const a = acc(`${def}|${muro}|${fuente}|${tag}|${X}|${off}|${H}`);
                if (!r) { a.huecos++; continue; }
                a.ret.push(r.ret); a.dol.push(r.dolares); a.cos.push(r.coste);
                a.dia.push(j); a.hor.push(D.barras[i].t);
              }
            }
          }
        }
      }
    }
  }

  // ── el control tonto: la misma compra todos los días, cada 15 min, sin mirar nada ─────────
  for (let i = 1; i <= ult - HORIZONTE_MAX; i += 3) {
    const spot = m.spots[i];
    for (const lado of ["C", "P"]) {
      for (const off of OFFS) {
        const K = lado === "C" ? rejilla(spot) + off : rejilla(spot) - off;
        for (const H of HS) {
          const iSal = H === "cierre" ? ult : Math.min(i + H, ult);
          const r = operar(D, i, iSal, K, lado);
          const a = acc(`TONTO|${lado}|${off}|${H}`);
          if (!r) { a.huecos++; continue; }
          a.ret.push(r.ret); a.dol.push(r.dolares); a.cos.push(r.coste);
          a.dia.push(j); a.hor.push(D.barras[i].t);
        }
      }
    }
  }
  if (j % 200 === 0) process.stdout.write(`  ${j}/${N}\r`);
}
console.log(`  días releídos: ${leidos}/${N} · pasada 2: ${((Date.now() - t1) / 1000).toFixed(0)} s`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// CUADRE DE SANIDAD — antes de creerse un solo número
// ═══════════════════════════════════════════════════════════════════════════════════════════
function stats(a) {
  if (!a || a.ret.length < 2) return null;
  const r = resumen(a.ret), d = resumen(a.dol);
  const cos = [...a.cos].sort((x, y) => x - y);
  return {
    n: r.n, mediaPct: r.media, t: r.t, aciertos: r.aciertos,
    dolMedio: d.media, dolAno: (d.media * r.n) / ANOS, opsAno: r.n / ANOS,
    huecos: a.huecos,
    cosMin: cos[0], cosMed: cos[cos.length >> 1], cosMax: cos[cos.length - 1],
  };
}
function porTrozos(a, k) {
  const corte = [];
  for (let q = 1; q < k; q++) corte.push(Math.floor((N * q) / k));
  const cubos = Array.from({ length: k }, () => []);
  for (let z = 0; z < a.ret.length; z++) {
    let g = 0; while (g < k - 1 && a.dia[z] >= corte[g]) g++;
    cubos[g].push(a.ret[z]);
  }
  return cubos.map((c) => resumen(c));
}

console.log("\n" + "═".repeat(95));
console.log("CUADRE DE SANIDAD");
console.log("═".repeat(95));
{
  const s = stats(V.get("TONTO|C|0|12"));
  console.log(`  control tonto, call en el dinero, salida a 1 h:`);
  console.log(`     n=${s.n} operaciones · huecos ${s.huecos} · coste de entrada  min $${num(s.cosMin)}  mediana $${num(s.cosMed)}  max $${num(s.cosMax)}`);
  console.log(`     (una call 0DTE en el dinero a media mañana debe costar entre $2 y $25 — si no, hay un fallo)`);
  const s25 = stats(V.get("TONTO|C|25|12"));
  console.log(`  control tonto, call 25 puntos fuera: n=${s25.n} · coste mediana $${num(s25.cosMed)} · rango $${num(s25.cosMin)}–$${num(s25.cosMax)}`);
  // los costes de menos de $1 salieron todos de 9 días de MEDIA SESIÓN (3 de julio, viernes de
  // Acción de Gracias, 24 de diciembre): cierran a las 13:00 y las barras siguientes repiten la
  // última cotización congelada. Son el 0,8% de la muestra y sólo restan (pagan horquilla sin
  // movimiento), nunca fabrican ganancia. Se dejan dentro y se dice.
  {
    let cong = 0;
    for (const m of meta) {
      const s = m.spots, u = s.length - 1;
      let q = true; for (let i = u - 20; i < u; i++) if (s[i] !== s[u]) { q = false; break; }
      if (q) cong++;
    }
    console.log(`  días de media sesión (cinta congelada al final): ${cong} de ${N} — el ${pct(cong / N, 1)} de la muestra`);
  }
  for (const def of DEFS) for (const X of [10, 20, 50]) {
    const a = V.get(`${def}|P|real|hip|${X}|10|12`), b = V.get(`${def}|C|real|hip|${X}|10|12`);
    console.log(`  toques (${def}) con X=${X}: muro de puts ${a ? a.ret.length + a.huecos : 0} días · muro de calls ${b ? b.ret.length + b.huecos : 0} días`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// LA REJILLA
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(95));
console.log("LA REJILLA — hipótesis (real) contra el control tonto, el barajado y el lado contrario");
console.log("  def   muro  X  off  sal   n   media%   t     $/año     |  tonto%   barajado%  contrario%");
console.log("═".repeat(95));

const filas = [];
for (const def of DEFS) for (const muro of ["P", "C"]) {
  const lado = muro === "P" ? "C" : "P";
  for (const X of XS) for (const off of OFFS) for (const H of HS) {
    const clave = `${def}|${muro}|real|hip|${X}|${off}|${H}`;
    const s = stats(V.get(clave));
    if (!s) continue;
    const st = stats(V.get(`TONTO|${lado}|${off}|${H}`));
    const sb = stats(V.get(`${def}|${muro}|bar|hip|${X}|${off}|${H}`));
    const sc = stats(V.get(`${def}|${muro}|real|con|${X}|${off}|${H}`));
    filas.push({
      def, muro, lado, X, off, H, ...s,
      tonto: st ? st.mediaPct : NaN, tontoDolAno: st ? st.dolAno : NaN, tontoDolOp: st ? st.dolMedio : NaN,
      barajado: sb ? sb.mediaPct : NaN, barajadoN: sb ? sb.n : 0,
      contrarioPct: sc ? sc.mediaPct : NaN, clave,
    });
  }
}
const MIN_N = 60;
const linea = (f) =>
  `  ${f.def.padEnd(5)} ${f.muro}   ${String(f.X).padStart(2)} ${String(f.off).padStart(4)} ${String(f.H).padStart(6)} ${String(f.n).padStart(4)} ` +
  `${pct(f.mediaPct, 2).padStart(8)} ${num(f.t, 2).padStart(6)} ${("$" + num(f.dolAno, 0)).padStart(9)}  | ` +
  `${pct(f.tonto, 2).padStart(8)} ${pct(f.barajado, 2).padStart(10)} ${pct(f.contrarioPct, 2).padStart(11)}`;

// se ordena por dinero al año, exigiendo muestra decente
const cand = filas.filter((f) => f.n >= MIN_N).sort((a, b) => b.dolAno - a.dolAno);
for (const f of cand.slice(0, 20)) console.log(linea(f));
console.log("\n  … y las 8 peores (para ver si el efecto tiene forma o es ruido):");
for (const f of cand.slice(-8)) console.log(linea(f));

// cuántas variantes baten a su control tonto — el reparto importa más que la mejor
{
  const con = filas.filter((f) => f.n >= MIN_N);
  const baten = con.filter((f) => f.mediaPct > f.tonto).length;
  const bBar = con.filter((f) => f.mediaPct > f.barajado).length;
  const pos = con.filter((f) => f.mediaPct > 0).length;
  console.log(`\n  variantes con n≥${MIN_N}: ${con.length} · media positiva: ${pos} · baten al control tonto: ${baten} · baten al barajado: ${bBar}`);
  console.log(`  (si el muro fuera señal, «baten al barajado» debería estar muy por encima de la mitad, ${Math.round(con.length / 2)})`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// LOS SUPERVIVIENTES — variantes que pasan los TRES controles a la vez
//   1) media positiva  2) bate al control tonto  3) bate al barajado  4) las dos mitades
//   positivas  5) los tres tercios del mismo signo. Es el listón entero, sin descuentos.
// ═══════════════════════════════════════════════════════════════════════════════════════════
for (const f of cand) {
  const a = V.get(f.clave);
  const m2 = porTrozos(a, 2), m3 = porTrozos(a, 3);
  f.mitades = m2.map((x) => x.media);
  f.tercios = m3.map((x) => x.media);
  f.sobrevive = f.mediaPct > 0 && f.mediaPct > f.tonto && f.mediaPct > f.barajado &&
    m2.every((x) => x.media > 0) && m3.every((x) => x.media > 0);
}
const vivas = cand.filter((f) => f.sobrevive);
console.log("\n" + "═".repeat(95));
console.log(`SUPERVIVIENTES — variantes que pasan los CINCO filtros: ${vivas.length} de ${cand.length}`);
console.log("═".repeat(95));
if (vivas.length === 0) console.log("  ninguna.");
for (const f of vivas.slice(0, 12)) {
  console.log(linea(f) + `   mitades ${f.mitades.map((x) => pct(x, 1)).join(" / ")}`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// LA MEJOR, DESTRIPADA
// ═══════════════════════════════════════════════════════════════════════════════════════════
const mejor = vivas[0] ?? cand[0];
const aMejor = V.get(mejor.clave);
const mitades = porTrozos(aMejor, 2);
const tercios = porTrozos(aMejor, 3);
const horas = {};
for (const h of aMejor.hor) horas[h] = (horas[h] || 0) + 1;
const topHoras = Object.entries(horas).sort((a, b) => b[1] - a[1]).slice(0, 5);

console.log("\n" + "═".repeat(95));
console.log("LA MEJOR VARIANTE, DESTRIPADA");
console.log("═".repeat(95));
const nombre = `acercarse a ≤${mejor.X} pts del muro de ${mejor.muro === "P" ? "PUTS" : "CALLS"} (${mejor.def}) → comprar ` +
  `${mejor.lado === "C" ? "CALL" : "PUT"} ${mejor.off === 0 ? "en el dinero" : mejor.off + " pts fuera"}, ` +
  `salir ${mejor.H === "cierre" ? "al cierre" : "a los " + mejor.H * 5 + " min"}`;
console.log(`  ${nombre}`);
console.log(`  n=${mejor.n} operaciones · huecos ${mejor.huecos} · ${num(mejor.opsAno, 1)} op/año · $${num(mejor.dolMedio, 2)}/op → $${num(mejor.dolAno, 0)}/año con UN contrato`);
console.log(`  media ${pct(mejor.mediaPct)} · t=${num(mejor.t)} · aciertos ${pct(mejor.aciertos, 1)}`);
console.log(`  coste de entrada: min $${num(mejor.cosMin)} · mediana $${num(mejor.cosMed)} · max $${num(mejor.cosMax)}`);
console.log(`  CONTROL TONTO  ${pct(mejor.tonto)}  ($${num(mejor.tontoDolAno, 0)}/año si se compra cada 15 min todos los días)`);
console.log(`  BARAJADO       ${pct(mejor.barajado)}  (n=${mejor.barajadoN})`);
console.log(`  LADO CONTRARIO ${pct(mejor.contrarioPct)}`);
console.log(`  MITADES        ${pct(mitades[0].media)} (n=${mitades[0].n})  ·  ${pct(mitades[1].media)} (n=${mitades[1].n})`);
console.log(`  TERCIOS        ${tercios.map((x) => pct(x.media)).join("  ·  ")}`);
console.log(`  horas de entrada más frecuentes: ${topHoras.map(([h, c]) => `${h}(${c})`).join(" ")}`);

const bateTonto = mejor.mediaPct > mejor.tonto;
const bateBarajado = mejor.mediaPct > mejor.barajado;
const mismoSigno = Math.sign(mitades[0].media) === Math.sign(mitades[1].media);
console.log(`\n  ¿bate al control tonto? ${bateTonto ? "sí" : "NO"} · ¿bate al barajado? ${bateBarajado ? "sí" : "NO"} · ¿mitades del mismo signo? ${mismoSigno ? "sí" : "NO"}`);
console.log(`  SOBREVIVE: ${bateTonto && bateBarajado && mismoSigno ? "SÍ" : "NO"}`);

writeFileSync(
  new URL("./e4-muros-suelo-y-techo.json", import.meta.url),
  JSON.stringify({
    dias: N, rango: [meta[0].dia, meta[N - 1].dia], anos: ANOS,
    fisica: filasA.map((f) => ({
      def: f.def, muro: f.muro, X: f.X,
      real: { n: f.real.n, media: f.real.media, t: f.real.t, aFavor: f.real.aciertos },
      barajada: { n: f.bara.n, media: f.bara.media, t: f.bara.t, aFavor: f.bara.aciertos },
      espejo: { n: f.espe.n, media: f.espe.media, t: f.espe.t, aFavor: f.espe.aciertos },
    })),
    rejilla: cand,
    mejor: { nombre, ...mejor, mitades: mitades.map((x) => x.media), tercios: tercios.map((x) => x.media) },
  }, null, 1)
);
console.log("\n  guardado en scripts/e4-muros-suelo-y-techo.json");
