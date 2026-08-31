// CUÁNTOS INTENTOS A LA VEZ, Y CUÁNTO EN CADA UNO — el dimensionamiento de la esquina barata.
//
// ═══ QUÉ MIDE Y POR QUÉ ═════════════════════════════════════════════════════════════════════
//
// El listón (scripts/esquina-barata-10anos.mjs) mide UNA entrada al mes por ticker, en los 40
// tickers, con $1.000 en cada una. Eso son 40 posiciones abiertas a la vez y $40.000 parados.
// Lester tiene ~$8.000 de efectivo libre. O sea que el listón, tal cual, NO SE PUEDE OPERAR.
//
// Aquí no se busca ninguna señal. Se pregunta lo que va justo antes de operar:
//   · si en vez de 40 intentos al mes hago 1, 2, 3, 5, 10 ó 20 — ¿cambia el RATIO?
//   · ¿cuánto dinero hay que tener parado para sostener cada nivel? (máximo de posiciones
//     abiertas a la vez × $1.000, contando el solape: se aguanta 23 días de bolsa, o sea que
//     la tanda de un mes todavía está abierta cuando entra la del siguiente)
//   · ¿cuál es el bajón máximo de la caja?
//   · y la pregunta que de verdad importa en una estrategia que vive de la cola:
//     CON POCOS INTENTOS, EL BILLETE GRANDE PUEDE NO TOCARTE. ¿Cuántos intentos hacen falta
//     para que la cola aparezca con fiabilidad?
//
// ═══ CÓMO SE MIDE LA DISPERSIÓN ═════════════════════════════════════════════════════════════
//
// Con 3 intentos al mes, el resultado depende de CUÁLES 3. Como aquí no hay señal, la elección
// honesta es al azar: cada mes se sortean K tickers de los que tienen cadena ese mes, y eso se
// repite 200 veces con semillas distintas. Lo que sale no es un número: es un abanico. El
// abanico ES la respuesta — dice cuánto se parece el año bueno al malo y con qué frecuencia
// un año entero se queda sin cola.
//
// El sorteo sólo mira el pasado (no elige por lo que va a pasar), así que no hay futuro colado.
//
// ═══ LAS UNIDADES ═══════════════════════════════════════════════════════════════════════════
//
// · Un INTENTO del cono = $1.000: $500 en la call y $500 en la put del mismo ticker y mes.
// · Un INTENTO de sólo-calls (o sólo-puts) = $1.000 en esa pata.
// · El RATIO se da a nivel de PATA (cada pata con el mismo tamaño), que es exactamente como lo
//   calcula el listón — así el nivel "todos" tiene que reproducir el 1,03. Se da además el
//   ratio a nivel de INTENTO (el cono neto), que es lo que ve la cuenta.
//
// SE COMPRA AL ASK Y SE VENDE AL BID. Nada de modelos. Un hueco no es un cero.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/z5-cuantos-huevos.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const OTM = 5;          // % fuera del dinero
const DTE_OBJ = 90;     // plazo objetivo
const DTE_TOL = 25;     // margen
const SALIR = 23;       // días de bolsa hasta la salida
const ASK_MIN = 0.10;
const APUESTA = 1000;   // dólares arriesgados en cada intento
const REPS = 200;       // sorteos por nivel de concentración

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (x) => (x * 100).toFixed(1) + "%";
const $ = (x) => Math.round(x).toLocaleString("es-ES");
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const pctl = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
function rng(semilla) { let s = semilla >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// ── índice de días por ticker ───────────────────────────────────────────────
const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
const TICKERS = [...diasPorSim.keys()].sort();
console.log(`\n## ${TICKERS.length} tickers · ${[...diasPorSim.values()].reduce((a, v) => a + v.length, 0).toLocaleString("es-ES")} días de cadena\n`);

const cache = new Map();
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  if (cache.has(k)) { const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  const v = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  cache.set(k, v);
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return v;
}
/** El spot por paridad: el strike donde call y put valen casi lo mismo. Identidad, no modelo. */
function spotDe(c) {
  let k = null, dm = Infinity;
  for (const g of Object.values(c)) for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const K = Number(cl.slice(0, -2)); const p = g[`${K}|P`];
    if (!p) continue;
    const d = Math.abs((ba[0] + ba[1]) / 2 - (p[0] + p[1]) / 2);
    if (d < dm) { dm = d; k = K; }
  }
  return k;
}

// ── una operación de la esquina (idéntica al listón) ────────────────────────
let fueraDeDatos = 0, huecos = 0, sinContrato = 0;
function operar(sym, dia, tipo) {
  const c = cadena(sym, dia);
  if (!c) return null;
  const sp = spotDe(c);
  if (!sp) return null;
  const dias = diasPorSim.get(sym);
  const iEntrada = dias.indexOf(dia);
  const iSalida = iEntrada + SALIR;
  if (iSalida >= dias.length) { fueraDeDatos++; return null; }   // la salida cae fuera de los datos
  const diaSalida = dias[iSalida];

  const objetivo = tipo === "C" ? sp * (1 + OTM / 100) : sp * (1 - OTM / 100);
  let mejor = null, mejorD = Infinity;
  for (const [exp, g] of Object.entries(c)) {
    const dte = Math.round((ms(exp) - ms(dia)) / 86_400_000);
    if (Math.abs(dte - DTE_OBJ) > DTE_TOL) continue;
    for (const [clave, ba] of Object.entries(g)) {
      if (clave.slice(-1) !== tipo) continue;
      const K = Number(clave.slice(0, -2));
      const [bid, ask] = ba;
      if (!(ask >= ASK_MIN)) continue;
      const d = Math.abs(K - objetivo) / sp + Math.abs(dte - DTE_OBJ) / 1000;
      if (d < mejorD) { mejorD = d; mejor = { exp, clave, K, bid, ask, dte }; }
    }
  }
  if (!mejor) { sinContrato++; return null; }

  // SE COMPRA AL ASK. Se vende al BID del día de salida.
  // Un HUECO (no hay cadena ese día) no es un cero: se descarta y se cuenta aparte.
  // Que el contrato no aparezca en una cadena que SÍ existe sí es un cero real: el descargador
  // filtra bid<=0, así que "no está" quiere decir "nadie puja" — vence sin valor.
  const cSal = cadena(sym, diaSalida);
  if (!cSal) { huecos++; return null; }
  const salida = cSal[mejor.exp]?.[mejor.clave]?.[0] ?? 0;
  return {
    sym, dia, diaSalida, tipo, ano: dia.slice(0, 4),
    prima: mejor.ask, salida, spot: sp,
    ret: (salida - mejor.ask) / mejor.ask,
    costePct: mejor.ask / sp,
    horquilla: (mejor.ask - mejor.bid) / mejor.ask,
  };
}

// ── el universo: una entrada al mes por ticker, el primer día con cadena ────
const ops = [];
for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym);
  const vistos = new Set();
  for (const d of dias) {
    const mes = d.slice(0, 6);
    if (vistos.has(mes)) continue;
    vistos.add(mes);
    for (const tipo of ["C", "P"]) { const o = operar(sym, d, tipo); if (o) ops.push(o); }
  }
  process.stdout.write(`\r   ${sym} · ${ops.length} patas   `);
}
console.log("");

// ── SANIDAD ─────────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(100)}\n  SANIDAD — antes de creerse nada\n${"═".repeat(100)}`);
console.log(`  patas construidas ............ ${ops.length.toLocaleString("es-ES")}`);
console.log(`  huecos (sin cadena de salida)  ${huecos}   ← descartadas, NO contadas como cero`);
console.log(`  salida fuera de los datos ..... ${fueraDeDatos}  (los últimos 23 días de cada ticker)`);
console.log(`  sin contrato que encaje ....... ${sinContrato}`);
console.log(`  coste medio de entrada ........ $${media(ops.map((o) => o.prima)).toFixed(2)} = ${pct(media(ops.map((o) => o.costePct)))} del subyacente`);
console.log(`  ....... (una 5% fuera a 90 días cuesta típicamente 1%–6% del subyacente)`);
console.log(`  vencen sin valor .............. ${pct(ops.filter((o) => o.salida === 0).length / ops.length)}`);
console.log(`  horquilla media ............... ${pct(media(ops.map((o) => o.horquilla)))} de la prima`);
if (ops.length < 200) { console.error("Muestra insuficiente."); process.exit(1); }

// ── el universo agrupado por mes de calendario ──────────────────────────────
// Cada candidato es un ticker-mes con lo que haya: call, put o las dos.
const porMes = new Map();
for (const o of ops) {
  const mes = o.dia.slice(0, 6);
  if (!porMes.has(mes)) porMes.set(mes, new Map());
  const m = porMes.get(mes);
  if (!m.has(o.sym)) m.set(o.sym, { sym: o.sym, dia: o.dia, diaSalida: o.diaSalida, ano: o.ano });
  m.get(o.sym)[o.tipo] = o;
}
const MESES = [...porMes.keys()].sort();
const candMes = new Map();          // mes -> array de candidatos
for (const m of MESES) candMes.set(m, [...porMes.get(m).values()]);
const conCono = MESES.reduce((a, m) => a + candMes.get(m).filter((x) => x.C && x.P).length, 0);
console.log(`  meses de calendario ........... ${MESES.length} (${MESES[0]} → ${MESES[MESES.length - 1]})`);
console.log(`  ticker-mes con cono completo .. ${conCono.toLocaleString("es-ES")} de ${MESES.reduce((a, m) => a + candMes.get(m).length, 0).toLocaleString("es-ES")} ticker-mes`);
console.log(`  media de tickers disponibles/mes ${(conCono / MESES.length).toFixed(1)}`);

// ── el motor de una simulación ──────────────────────────────────────────────
// fam: "cono" ($500+$500), "call" ($1.000 en la call), "put" ($1.000 en la put)
function pnlIntento(fam, x) {
  if (fam === "cono") return (APUESTA / 2) * (x.C.ret + x.P.ret);
  if (fam === "call") return APUESTA * x.C.ret;
  return APUESTA * x.P.ret;
}
function patasDe(fam, x) {
  if (fam === "cono") return [(APUESTA / 2) * x.C.ret, (APUESTA / 2) * x.P.ret];
  if (fam === "call") return [APUESTA * x.C.ret];
  return [APUESTA * x.P.ret];
}
function sirve(fam, x) { return fam === "cono" ? !!(x.C && x.P) : fam === "call" ? !!x.C : !!x.P; }

function simular(fam, K, semilla) {
  const r = semilla == null ? null : rng(semilla);
  const elegidos = [];
  for (const mes of MESES) {
    const cand = candMes.get(mes).filter((x) => sirve(fam, x));
    if (!cand.length) continue;
    if (r === null || K >= cand.length) { elegidos.push(...cand); continue; }
    const idx = cand.map((_, i) => i);
    for (let i = 0; i < K; i++) {
      const j = i + Math.floor(r() * (idx.length - i));
      const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
      elegidos.push(cand[idx[i]]);
    }
  }
  // dinero
  let gan = 0, per = 0, aciertos = 0;
  let ganP = 0, perP = 0;                       // a nivel de pata
  const porAno = new Map();
  const eventos = [];                           // {fecha, delta} para la caja
  const abre = [];                              // {ini, fin}
  let mayor = -Infinity;
  const todosPnl = [];
  for (const x of elegidos) {
    const p = pnlIntento(fam, x);
    todosPnl.push(p);
    if (p > mayor) mayor = p;
    if (p > 0) { gan += p; aciertos++; } else per += -p;
    for (const q of patasDe(fam, x)) { if (q > 0) ganP += q; else perP += -q; }
    if (!porAno.has(x.ano)) porAno.set(x.ano, { g: 0, p: 0, n: 0 });
    const a = porAno.get(x.ano); a.n++; if (p > 0) a.g += p; else a.p += -p;
    eventos.push({ f: x.diaSalida, d: p });
    abre.push({ ini: x.dia, fin: x.diaSalida });
  }
  // caja acumulada y bajón máximo (P&L realizado, ordenado por día de SALIDA)
  eventos.sort((a, b) => (a.f < b.f ? -1 : 1));
  let caja = 0, pico = 0, bajon = 0;
  for (const e of eventos) { caja += e.d; if (caja > pico) pico = caja; if (pico - caja > bajon) bajon = pico - caja; }
  // capital parado: máximo de posiciones abiertas a la vez
  const marcas = [];
  for (const a of abre) { marcas.push({ f: a.ini, v: 1 }); marcas.push({ f: a.fin, v: -1 }); }
  marcas.sort((a, b) => (a.f === b.f ? a.v - b.v : a.f < b.f ? -1 : 1));
  let ab = 0, maxAb = 0; const serie = [];
  for (const m of marcas) { ab += m.v; if (ab > maxAb) maxAb = ab; serie.push(ab); }
  serie.sort((a, b) => a - b);
  const medAb = serie.length ? serie[Math.floor(serie.length / 2)] : 0;

  const anos = [...porAno.entries()].sort();
  const ratiosAno = anos.map(([a, v]) => [a, v.p > 0 ? v.g / v.p : Infinity, v.g - v.p, v.n]);
  const netosAno = ratiosAno.map((x) => x[2]);
  return {
    n: elegidos.length, gan, per, ratio: per > 0 ? gan / per : Infinity,
    ratioPata: perP > 0 ? ganP / perP : Infinity, ganP, perP,
    acierto: elegidos.length ? aciertos / elegidos.length : 0,
    caja, bajon, maxAbiertas: maxAb, medAbiertas: medAb,
    ratiosAno, netosAno, mayor, todosPnl,
    anosNeg: netosAno.filter((x) => x < 0).length, anosTot: netosAno.length,
  };
}

// ── LA TABLA PRINCIPAL ──────────────────────────────────────────────────────
const NIVELES = [1, 2, 3, 5, 10, 20, 40];
const FAMS = [["cono", "el cono (call+put)"], ["call", "sólo calls"], ["put", "sólo puts"]];
const RES = new Map();

console.log(`\n\n${"═".repeat(112)}`);
console.log(`  LA CONCENTRACIÓN — ${NIVELES.length} niveles × ${FAMS.length} familias = ${NIVELES.length * FAMS.length} celdas, cada una con ${REPS} sorteos al azar`);
console.log(`  ($${APUESTA} por intento · sin ninguna señal · el sorteo sólo mira el pasado)`);
console.log(`${"═".repeat(112)}`);

for (const [fam, etq] of FAMS) {
  console.log(`\n### ${etq}\n`);
  console.log("| intentos/mes | n operac. | ratio PATA p10 / mediana / p90 | ratio INTENTO mediana | acierto | caja mediana | bajón máx | $ parado | años en pérdida |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const K of NIVELES) {
    const sims = [];
    for (let i = 0; i < (K >= 40 ? 1 : REPS); i++) sims.push(simular(fam, K, K >= 40 ? null : 1000 + K * 7919 + i));
    const rp = sims.map((s) => s.ratioPata).filter(Number.isFinite);
    const ri = sims.map((s) => s.ratio).filter(Number.isFinite);
    const cj = sims.map((s) => s.caja);
    const bj = sims.map((s) => s.bajon);
    const ca = sims.map((s) => s.maxAbiertas * APUESTA);
    const an = sims.map((s) => s.anosNeg);
    RES.set(`${fam}|${K}`, { sims, rp, ri, cj, bj, ca, an });
    const et = K >= 40 ? "TODOS" : String(K);
    console.log(`| ${et} | ${$(media(sims.map((s) => s.n)))} | ${pctl(rp, 0.1).toFixed(2)} / **${pctl(rp, 0.5).toFixed(2)}** / ${pctl(rp, 0.9).toFixed(2)} | ${pctl(ri, 0.5).toFixed(2)} | ${pct(media(sims.map((s) => s.acierto)))} | $${$(pctl(cj, 0.5))} | $${$(pctl(bj, 0.5))} | $${$(pctl(ca, 0.5))} | ${pctl(an, 0.5)} de ${sims[0].anosTot} |`);
  }
}

// ── ¿CUÁNDO APARECE LA COLA? ────────────────────────────────────────────────
console.log(`\n\n${"═".repeat(112)}`);
console.log(`  ¿CUÁNTOS INTENTOS HACEN FALTA PARA QUE LA COLA APAREZCA? — el cono, ${REPS} sorteos por nivel`);
console.log(`${"═".repeat(112)}\n`);
console.log("| intentos/mes | sorteos que baten 1,03 | sorteos que pierden dinero | mejor año − peor año (mediana) | el mayor billete (mediana) | ratio peor sorteo | ratio mejor sorteo |");
console.log("|---|---|---|---|---|---|---|");
for (const K of NIVELES) {
  const { sims, rp } = RES.get(`cono|${K}`);
  const bate = sims.filter((s) => s.ratioPata > 1.03).length / sims.length;
  const pierde = sims.filter((s) => s.caja < 0).length / sims.length;
  const rango = sims.map((s) => Math.max(...s.netosAno) - Math.min(...s.netosAno));
  const may = sims.map((s) => s.mayor);
  console.log(`| ${K >= 40 ? "TODOS" : K} | ${pct(bate)} | ${pct(pierde)} | $${$(pctl(rango, 0.5))} | $${$(pctl(may, 0.5))} | ${Math.min(...rp).toFixed(2)} | ${Math.max(...rp).toFixed(2)} |`);
}

// ── AÑO A AÑO Y CRISIS, AL NIVEL DE TODOS Y AL DE 3 ──────────────────────────
console.log(`\n\n${"═".repeat(112)}`);
console.log(`  AÑO A AÑO — el cono. "TODOS" es determinista; en "3 intentos" se da la mediana de los ${REPS} sorteos`);
console.log(`${"═".repeat(112)}\n`);
const anosLista = RES.get("cono|40").sims[0].ratiosAno.map((x) => x[0]);
console.log("| año | ratio con TODOS | neto con TODOS | ratio con 3 (mediana) | ratio con 3 (p10) | ratio con 3 (p90) | sorteos de 3 que pierden ese año |");
console.log("|---|---|---|---|---|---|---|");
for (let i = 0; i < anosLista.length; i++) {
  const a = anosLista[i];
  const todo = RES.get("cono|40").sims[0].ratiosAno.find((x) => x[0] === a);
  const tres = RES.get("cono|3").sims.map((s) => s.ratiosAno.find((x) => x[0] === a)).filter(Boolean);
  const r3 = tres.map((x) => (Number.isFinite(x[1]) ? x[1] : 99));
  const neg = tres.filter((x) => x[2] < 0).length / (tres.length || 1);
  const crisis = ["2018", "2020", "2022", "2025"].includes(a) ? " ⚑" : "";
  console.log(`| **${a}**${crisis} | ${todo[1].toFixed(2)} | $${$(todo[2])} | ${pctl(r3, 0.5).toFixed(2)} | ${pctl(r3, 0.1).toFixed(2)} | ${pctl(r3, 0.9).toFixed(2)} | ${pct(neg)} |`);
}

// ── DEPENDENCIA DE TICKERS Y DE EVENTOS, EN EL UNIVERSO COMPLETO ─────────────
console.log(`\n\n${"═".repeat(112)}`);
console.log(`  ¿DE CUÁNTOS DEPENDE? — universo completo, a nivel de pata`);
console.log(`${"═".repeat(112)}\n`);
const porTk = new Map();
for (const o of ops) {
  if (!porTk.has(o.sym)) porTk.set(o.sym, { g: 0, p: 0, n: 0 });
  const t = porTk.get(o.sym); t.n++;
  const d = APUESTA * o.ret; if (d > 0) t.g += d; else t.p += -d;
}
const tkOrden = [...porTk.entries()].sort((a, b) => (b[1].g - b[1].p) - (a[1].g - a[1].p));
const ganTot = tkOrden.reduce((a, x) => a + x[1].g, 0);
const perTot = tkOrden.reduce((a, x) => a + x[1].p, 0);
let ac = 0, mitad = 0;
for (const v of [...porTk.values()].sort((a, b) => b.g - a.g)) { ac += v.g; mitad++; if (ac >= ganTot / 2) break; }
const tkNeg = tkOrden.filter(([, v]) => v.g - v.p < 0).length;
console.log(`  ratio del universo completo (pata) ... ${(ganTot / perTot).toFixed(2)}   ← tiene que dar ~1,03 (el listón)`);
console.log(`  tickers que aportan la MITAD de lo ganado: ${mitad} de ${tkOrden.length}`);
console.log(`  tickers con neto negativo: ${tkNeg} de ${tkOrden.length}`);
console.log(`  los 6 que más aportan: ${tkOrden.slice(0, 6).map(([s, v]) => `${s} $${$(v.g - v.p)}`).join(" · ")}`);
const todosD = ops.map((o) => APUESTA * o.ret).sort((a, b) => b - a);
const mayorBillete = todosD[0];
const ganSinMejor = ganTot - mayorBillete;
console.log(`  el mayor billete ..................... $${$(mayorBillete)} sobre $${APUESTA}`);
console.log(`  ratio quitando ese único evento ...... ${(ganSinMejor / perTot).toFixed(2)}`);
let ac2 = 0, evMitad = 0;
for (const d of todosD) { if (d <= 0) break; ac2 += d; evMitad++; if (ac2 >= ganTot / 2) break; }
console.log(`  operaciones que aportan la MITAD de lo ganado: ${evMitad} de ${ops.length.toLocaleString("es-ES")} (${pct(evMitad / ops.length)})`);

// ── EL DINERO PARADO, EN DETALLE ────────────────────────────────────────────
console.log(`\n\n${"═".repeat(112)}`);
console.log(`  EL DINERO QUE HAY QUE TENER PARADO — el cono. Cada intento inmoviliza $${APUESTA} desde que entra hasta que sale (23 días de bolsa)`);
console.log(`${"═".repeat(112)}\n`);
console.log("| intentos/mes | posiciones abiertas a la vez (máx) | $ parado en el pico | $ parado habitual | caja al final (mediana) | caja / $ parado |");
console.log("|---|---|---|---|---|---|");
for (const K of NIVELES) {
  const { sims } = RES.get(`cono|${K}`);
  const maxAb = pctl(sims.map((s) => s.maxAbiertas), 0.5);
  const medAb = pctl(sims.map((s) => s.medAbiertas), 0.5);
  const cj = pctl(sims.map((s) => s.caja), 0.5);
  console.log(`| ${K >= 40 ? "TODOS" : K} | ${maxAb} | $${$(maxAb * APUESTA)} | $${$(medAb * APUESTA)} | $${$(cj)} | ${(cj / (maxAb * APUESTA)).toFixed(2)} |`);
}

// ── VEREDICTO ───────────────────────────────────────────────────────────────
console.log(`\n\n${"═".repeat(112)}`);
console.log(`  LO QUE SALE`);
console.log(`${"═".repeat(112)}`);
const medRatio = NIVELES.map((K) => [K, pctl(RES.get(`cono|${K}`).rp, 0.5)]);
console.log(`  ratio mediano del cono por nivel: ${medRatio.map(([K, r]) => `${K >= 40 ? "todos" : K}→${r.toFixed(2)}`).join(" · ")}`);
const disp = NIVELES.map((K) => [K, pctl(RES.get(`cono|${K}`).rp, 0.9) - pctl(RES.get(`cono|${K}`).rp, 0.1)]);
console.log(`  ancho del abanico (p90−p10):      ${disp.map(([K, d]) => `${K >= 40 ? "todos" : K}→${d.toFixed(2)}`).join(" · ")}`);
console.log(``);
console.log(`  EL DINERO DE VERDAD (cono): hay que tener el pico parado MÁS el bajón, porque el bajón`);
console.log(`  hay que pagarlo de la cuenta. Y al lado, lo que deja en ${MESES.length} meses (${(MESES.length / 12).toFixed(1)} años):`);
console.log(`  | intentos | parado | bajón | dinero de verdad | caja al final | %/año sobre el dinero de verdad |`);
for (const K of NIVELES) {
  const { sims } = RES.get(`cono|${K}`);
  const parado = pctl(sims.map((s) => s.maxAbiertas), 0.5) * APUESTA;
  const baj = pctl(sims.map((s) => s.bajon), 0.5);
  const cj = pctl(sims.map((s) => s.caja), 0.5);
  const cap = parado + baj;
  const anos = MESES.length / 12;
  const cagr = cap > 0 ? (Math.pow(Math.max(0.01, 1 + cj / cap), 1 / anos) - 1) : NaN;
  console.log(`  | ${String(K >= 40 ? "TODOS" : K).padStart(5)} | $${$(parado).padStart(7)} | $${$(baj).padStart(7)} | $${$(cap).padStart(8)} | $${$(cj).padStart(8)} | ${(100 * cagr).toFixed(1).padStart(6)}% |`);
}
console.log(`\n  (comprar y quedarse el índice dio ~14%/año en este mismo período, sin bajones de este tipo)`);
console.log(`${"═".repeat(112)}\n`);
