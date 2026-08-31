// ENTRAR MÁS DE UNA VEZ AL MES — arreglar los cimientos del envase.
//
// ═══ POR QUÉ EXISTE ══════════════════════════════════════════════════════════════════════════
//
// Todo lo medido hasta ahora entra UNA VEZ AL MES POR TICKER, SIEMPRE EL PRIMER DÍA DE BOLSA
// DEL MES (z1-la-rejilla-completa.mjs línea 176, y9-despues-del-susto.mjs línea 271). Eso tiene
// tres consecuencias graves:
//   1) cualquier señal que mire "ayer" mira SIEMPRE el último día del mes;
//   2) la muestra se queda en ~600 operaciones al año con 40 tickers;
//   3) el resultado de cada año depende de en qué día del mes cayeron los sustos.
//
// Aquí se re-mide el ENVASE VACÍO (sin ninguna señal) con nueve frecuencias de entrada, para
// contestar UNA pregunta: ¿cambia el 1.11 del envase vacío?
//
//   · mes-1   : primer día de bolsa del mes            ← EL CONTROL (lo de hoy)
//   · mes-5   : primer día de bolsa en o después del 5 del mes
//   · mes-10  : ídem, día 10
//   · mes-15  : ídem, día 15
//   · mes-20  : ídem, día 20
//   · mes-rot : una vez al mes pero ROTANDO 5→10→15→20 (mismo número de operaciones, sin día fijo)
//   · lunes   : todos los lunes con cadena
//   · miércol : todos los miércoles con cadena
//   · diario  : TODOS los días de bolsa
//
// ═══ EL ENVASE — el mismo de siempre, no se toca ═════════════════════════════════════════════
//
//   A (principal):  10% fuera del dinero · 60 días de plazo · vender a los 30 días de bolsa
//   B (contraste):   5% fuera del dinero · 90 días de plazo · vender a los 30 días de bolsa
//
// Se COMPRA AL ASK y se VENDE AL BID. Nunca punto medio. Nada de Black-Scholes.
// Call y put en cada entrada. $1,000 arriesgados en cada intento. Ask mínimo $0.10 (regla del listón).
//
// ═══ EL PRECIO DEL SUBYACENTE ════════════════════════════════════════════════════════════════
//
// Paridad put-call SÓLO EN EL VENCIMIENTO MÁS CERCANO (el fallo conocido de
// esquina-barata-10anos.mjs línea 66 es mirar toda la cadena y quedarse con el precio a futuro).
// Se REUTILIZA la serie ya construida y validada en scripts/cache-theta/_y9-spots.json; si no
// está, se reconstruye con la misma función.
//
// ═══ DÍAS ROTOS ══════════════════════════════════════════════════════════════════════════════
//
// Misma criba que y9: sin precio, o se aparta >5% del CIERRE REAL de disco, o salta >35% en un
// día sin que el cierre real lo avale (splits, y la raíz "META" que entre 09/2021 y 01/2022 es de
// otra empresa). Si hay un día roto entre la compra y la venta, la operación se descarta ENTERA
// y se cuenta aparte. Nunca se rellena.
//
// ═══ HUECOS ═════════════════════════════════════════════════════════════════════════════════
//
// Falta la cadena del día de salida o el vencimiento entero → HUECO: se descarta y se cuenta.
// El vencimiento SÍ está y el contrato no aparece → no tiene puja: vale 0. Eso es un dato real.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/w1-entrar-mas-veces.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CIERRES = "scripts/cache-theta/cierres";
const SPOTCACHE = "scripts/cache-theta/_y9-spots.json";

const APUESTA = 1000;
const TOLK = 0.50;      // cuánto puede apartarse el strike de la distancia pedida
const SALIDA = 30;      // días de bolsa hasta vender
const ASKMIN = 0.10;    // la regla del listón

const ENVASES = [
  { id: "A", dist: 0.10, dte: 60 },
  { id: "B", dist: 0.05, dte: 90 },
];

const FREQS = [
  { id: "mes-1",   et: "1 al mes · primer día de bolsa (CONTROL)" },
  { id: "mes-5",   et: "1 al mes · el 5 del mes" },
  { id: "mes-10",  et: "1 al mes · el 10 del mes" },
  { id: "mes-15",  et: "1 al mes · el 15 del mes" },
  { id: "mes-20",  et: "1 al mes · el 20 del mes" },
  { id: "mes-rot", et: "1 al mes · rotando 5→10→15→20" },
  { id: "lunes",   et: "1 por semana · lunes" },
  { id: "miercol", et: "1 por semana · miércoles" },
  { id: "diario",  et: "TODOS los días de bolsa" },
];
const FI = new Map(FREQS.map((f, i) => [f.id, i]));

const tolDte = (d) => Math.max(6, Math.round(d * 0.28));   // 60 → ±17 ; 90 → ±25
const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "n/d");
const usd = (n) => (Number.isFinite(n) ? "$" + Math.round(n).toLocaleString("en-US") : "n/d");
const num = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "n/d");
const mil = (n) => n.toLocaleString("en-US");
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const L = (x = "") => console.log(x);

// ── índice de días por ticker ────────────────────────────────────────────────
const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
// mismo corte que y9: sólo tickers con cadena diaria de verdad. Los de 83 y 158 días no pueden
// dar ni un año de operaciones y romperían la comparación entre frecuencias.
let TICKERS = [...diasPorSim.keys()].filter((t) => diasPorSim.get(t).length >= 800).sort();
if (process.env.SOLO) TICKERS = TICKERS.filter((t) => process.env.SOLO.split(",").includes(t));

function leer(sym, dia) {
  const f = `${CDIR}/${sym}_d${dia}.json`;
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; }
}

/** EL SPOT ARREGLADO: paridad put-call en el vencimiento MÁS CERCANO. */
function spotOk(c, hoy) {
  let exp = null, md = Infinity;
  for (const e of Object.keys(c)) { const d = dteDe(hoy, e); if (d < 1) continue; if (d < md) { md = d; exp = e; } }
  if (!exp) return null;
  const g = c[exp];
  let K = null, dm = Infinity;
  for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2)); const p = g[`${k}|P`]; if (!p) continue;
    const d = Math.abs((ba[0] + ba[1]) / 2 - (p[0] + p[1]) / 2);
    if (d < dm) { dm = d; K = k; }
  }
  if (K == null) return null;
  const C = g[`${K}|C`], P = g[`${K}|P`];
  const s = K + (C[0] + C[1]) / 2 - (P[0] + P[1]) / 2;
  return s > 0 ? s : null;
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 1 — la serie de precios (reutilizada de y9)
// ════════════════════════════════════════════════════════════════════════════
let SPOTS = existsSync(SPOTCACHE) ? JSON.parse(readFileSync(SPOTCACHE, "utf8")) : {};
{
  let faltan = TICKERS.filter((t) => !Array.isArray(SPOTS[t]) || SPOTS[t].length !== diasPorSim.get(t).length);
  if (faltan.length) {
    L(`## reconstruyendo la serie de precios de ${faltan.length} tickers (el resto se lee de ${SPOTCACHE})`);
    for (const sym of faltan) {
      const arr = [];
      for (const d of diasPorSim.get(sym)) { const c = leer(sym, d); arr.push(c ? spotOk(c, d) : null); }
      SPOTS[sym] = arr;
      process.stderr.write(`\r   spots · ${sym}     `);
    }
    process.stderr.write("\n");
    writeFileSync(SPOTCACHE, JSON.stringify(SPOTS));
  } else {
    L(`## serie de precios leída de ${SPOTCACHE} (misma que usa y9) — ${TICKERS.length} tickers`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 2 — días rotos (misma criba que y9)
// ════════════════════════════════════════════════════════════════════════════
const cierresDe = (t) => { const p = `${CIERRES}/${t}.json`; if (!existsSync(p)) return null; try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const ROTO = {}, PREF = {};
let rotoSinSpot = 0, rotoContraCierre = 0, rotoSalto = 0, saltoSalvado = 0;
for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym), s = SPOTS[sym], cl = cierresDe(sym);
  const n = dias.length, ro = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (s[i] == null) { ro[i] = true; rotoSinSpot++; continue; }
    const c = cl?.[dias[i]];
    if (c != null && c > 0 && Math.abs(s[i] / c - 1) > 0.05) { ro[i] = true; rotoContraCierre++; continue; }
    if (i > 0 && s[i - 1] != null) {
      const rat = s[i] / s[i - 1];
      if (Math.abs(rat - 1) > 0.35) {
        const c0 = cl?.[dias[i - 1]], c1 = cl?.[dias[i]];
        const confirmado = c0 > 0 && c1 > 0 && Math.abs(rat / (c1 / c0) - 1) < 0.03;
        if (confirmado) saltoSalvado++; else { ro[i] = true; rotoSalto++; }
      }
    }
  }
  ROTO[sym] = ro;
  // suma acumulada, para preguntar "¿hay algún roto entre i y j?" en tiempo constante
  const pf = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) pf[i + 1] = pf[i] + (ro[i] ? 1 : 0);
  PREF[sym] = pf;
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 3 — qué días son de entrada, por frecuencia
// ════════════════════════════════════════════════════════════════════════════
/** Devuelve un array de máscaras de bits: mascara[i] tiene el bit f si el día i es entrada de la
 *  frecuencia f. Un mismo día puede servir a varias frecuencias — la operación se calcula UNA vez
 *  y se anota en todas las que la contienen. */
function mascaras(dias) {
  const n = dias.length;
  const mk = new Int32Array(n);
  // mensuales: primer día de bolsa del mes con día de calendario >= N
  const meses = [];                     // [{ mes, indices:[...] }]
  let cur = null;
  for (let i = 0; i < n; i++) {
    const mes = dias[i].slice(0, 6);
    if (!cur || cur.mes !== mes) { cur = { mes, idx: [] }; meses.push(cur); }
    cur.idx.push(i);
  }
  const primeroDesde = (m, N) => { for (const i of m.idx) if (Number(dias[i].slice(6, 8)) >= N) return i; return -1; };
  const ROT = [5, 10, 15, 20];
  meses.forEach((m, mi) => {
    for (const [N, id] of [[1, "mes-1"], [5, "mes-5"], [10, "mes-10"], [15, "mes-15"], [20, "mes-20"]]) {
      const i = primeroDesde(m, N);
      if (i >= 0) mk[i] |= 1 << FI.get(id);
    }
    const i = primeroDesde(m, ROT[mi % 4]);
    if (i >= 0) mk[i] |= 1 << FI.get("mes-rot");
  });
  // semanales por día de la semana, y diario
  for (let i = 0; i < n; i++) {
    const wd = new Date(ms(dias[i])).getUTCDay();
    if (wd === 1) mk[i] |= 1 << FI.get("lunes");
    if (wd === 3) mk[i] |= 1 << FI.get("miercol");
    mk[i] |= 1 << FI.get("diario");
  }
  return mk;
}

/** Posición del día DENTRO de su mes (0 = primer día de bolsa del mes). Sirve para partir el
 *  universo diario en ~21 submuestras disjuntas del mismo tamaño y ver si el día 0 es especial
 *  o si es simplemente una submuestra pequeña más. */
function domIndices(dias) {
  const n = dias.length, dom = new Int32Array(n);
  let mes = null, k = 0;
  for (let i = 0; i < n; i++) {
    const m = dias[i].slice(0, 6);
    if (m !== mes) { mes = m; k = 0; }
    dom[i] = Math.min(k, 21);
    k++;
  }
  return dom;
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 4 — el barrido. Un pase por ticker, una cadena en memoria cada vez.
// ════════════════════════════════════════════════════════════════════════════
const acc = () => ({ n: 0, win: 0, gan: 0, per: 0, coste: 0, horq: 0, sinValor: 0, trunc: 0, dist: 0, dte: 0, tv: 0 });
function add(a, ret, o) {
  const d = APUESTA * ret;
  a.n++; if (d > 0) { a.win++; a.gan += d; } else a.per += -d;
  a.coste += o.coste; a.horq += o.horq; a.dist += o.distReal; a.dte += o.dteReal; a.tv += o.tercerViernes;
  if (o.salida === 0) a.sinValor++; a.trunc += o.trunc;
}
/** ¿es el vencimiento un TERCER VIERNES (la expiración mensual estándar, la líquida)? */
function tercerViernes(e) {
  const d = new Date(ms(e));
  return d.getUTCDay() === 5 && Number(e.slice(6, 8)) >= 15 && Number(e.slice(6, 8)) <= 21 ? 1 : 0;
}
const R = (a) => (a.per > 0 ? a.gan / a.per : (a.gan > 0 ? Infinity : NaN));

// acumuladores: [freq][env] -> { T, C, P, anos:Map, tks:Map, mayor }
const CUB = FREQS.map(() => ENVASES.map(() => ({
  T: acc(), C: acc(), P: acc(), anos: new Map(), tks: new Map(), mayor: null,
  dteBin: new Map(),   // bin de plazo real (de 7 en 7 días) -> acc
  soloTV: acc(),       // sólo vencimientos de tercer viernes
})));
// EL CONTROL DE VERDAD: el universo diario partido por posición del día dentro del mes (22
// submuestras disjuntas) y por día de la semana (5). Así se ve si el "primer día del mes" es
// especial o si es una submuestra pequeña más entre veintiuna.
const DOM = ENVASES.map(() => Array.from({ length: 22 }, acc));
const DOMANO = ENVASES.map(() => Array.from({ length: 22 }, () => new Map()));
const DOW = ENVASES.map(() => Array.from({ length: 7 }, acc));
// el universo diario, operación a operación, para el reparto al azar POR FECHAS (ver más abajo)
const DIARIO = ENVASES.map(() => ({ fecha: [], dol: [], dte: [], dom: [] }));
// posiciones abiertas: [freq][env] -> Map(fecha -> delta de patas)
const DELTA = FREQS.map(() => ENVASES.map(() => new Map()));
const FECHAS = new Set();

let diasVistos = 0, entradasCalc = 0, sinSpot = 0, sinContrato = 0, huecos = 0, contaminadas = 0, opsGlob = 0;
const t0 = Date.now();

for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym);
  const s = SPOTS[sym], pf = PREF[sym], n = dias.length;
  const idxDe = new Map(dias.map((d, i) => [d, i]));
  const mk = mascaras(dias);
  const dom = domIndices(dias);
  for (const d of dias) FECHAS.add(d);

  // pendientes: por índice de día de salida -> lista de operaciones abiertas
  const pend = new Map();

  for (let j = 0; j < n; j++) {
    const necesitaSalir = pend.has(j);
    const esEntrada = mk[j] !== 0 && j + SALIDA < n;
    if (!necesitaSalir && !esEntrada) continue;

    const c = leer(sym, dias[j]);
    diasVistos++;

    // ── 1) cerrar lo que vence hoy ──────────────────────────────────────────
    if (necesitaSalir) {
      for (const o of pend.get(j)) {
        if (!c) { huecos += popcount(o.mask); continue; }
        const grupo = c[o.exp];
        if (!grupo) { huecos += popcount(o.mask); continue; }
        const salida = grupo[o.clave]?.[0] ?? 0;    // sin puja = 0. Dato real.
        const ret = (salida - o.ask) / o.ask;
        const d = APUESTA * ret;
        o.salida = salida;
        opsGlob += popcount(o.mask);
        // partición del universo diario — se anota UNA vez por operación, no una por frecuencia
        DIARIO[o.ei].fecha.push(o.dia); DIARIO[o.ei].dol.push(d);
        DIARIO[o.ei].dte.push(o.dteReal); DIARIO[o.ei].dom.push(o.dom);
        add(DOM[o.ei][o.dom], ret, o);
        add(DOW[o.ei][o.dow], ret, o);
        {
          const m = DOMANO[o.ei][o.dom];
          if (!m.has(o.ano)) m.set(o.ano, acc());
          add(m.get(o.ano), ret, o);
        }
        for (let f = 0; f < FREQS.length; f++) {
          if (!(o.mask & (1 << f))) continue;
          const cu = CUB[f][o.ei];
          add(cu.T, ret, o); add(cu[o.tipo], ret, o);
          if (!cu.anos.has(o.ano)) cu.anos.set(o.ano, acc());
          add(cu.anos.get(o.ano), ret, o);
          if (!cu.tks.has(sym)) cu.tks.set(sym, acc());
          add(cu.tks.get(sym), ret, o);
          const bin = Math.floor(o.dteReal / 7);
          if (!cu.dteBin.has(bin)) cu.dteBin.set(bin, acc());
          add(cu.dteBin.get(bin), ret, o);
          if (o.tercerViernes) add(cu.soloTV, ret, o);
          if (!cu.mayor || d > cu.mayor.d) cu.mayor = { d, sym, dia: o.dia, tipo: o.tipo, K: o.K, exp: o.exp };
          const dl = DELTA[f][o.ei];
          dl.set(o.dia, (dl.get(o.dia) ?? 0) + 1);
          dl.set(dias[j], (dl.get(dias[j]) ?? 0) - 1);
        }
      }
      pend.delete(j);
    }

    // ── 2) abrir lo de hoy ──────────────────────────────────────────────────
    if (!esEntrada || !c) continue;
    const sp = s[j];
    if (sp == null || ROTO[sym][j]) { sinSpot += popcount(mk[j]); continue; }
    // ¿día roto entre la compra y la venta? La operación no es de fiar: fuera entera.
    if (pf[j + SALIDA + 1] - pf[j] > 0) { contaminadas += popcount(mk[j]); continue; }
    entradasCalc++;

    for (let ei = 0; ei < ENVASES.length; ei++) {
      const env = ENVASES[ei];
      let exp = null, md = Infinity;
      for (const e of Object.keys(c)) { const dt = dteDe(dias[j], e); if (dt < 1) continue; const x = Math.abs(dt - env.dte); if (x < md) { md = x; exp = e; } }
      if (!exp || md > tolDte(env.dte)) { sinContrato += 2 * popcount(mk[j]); continue; }

      // día de salida: 30 de bolsa, o el vencimiento si cae antes
      let iSal = j + SALIDA, trunc = 0;
      if (dias[iSal] >= exp) {
        const k = idxDe.get(exp);
        if (k == null || k <= j) { huecos += 2 * popcount(mk[j]); continue; }
        iSal = k; trunc = 1;
      }

      for (const tipo of ["C", "P"]) {
        const objetivo = tipo === "C" ? sp * (1 + env.dist) : sp * (1 - env.dist);
        let mej = null, dd = Infinity;
        for (const [clave, ba] of Object.entries(c[exp])) {
          if (clave.slice(-1) !== tipo) continue;
          if (!(ba[1] > 0) || ba[1] < ASKMIN) continue;
          const K = Number(clave.slice(0, -2));
          const d = Math.abs(K - objetivo);
          if (d < dd) { dd = d; mej = { K, clave, bid: ba[0], ask: ba[1] }; }
        }
        if (!mej) { sinContrato += popcount(mk[j]); continue; }
        const distReal = tipo === "C" ? mej.K / sp - 1 : 1 - mej.K / sp;
        if (Math.abs(distReal - env.dist) > env.dist * TOLK) { sinContrato += popcount(mk[j]); continue; }

        const o = {
          mask: mk[j], ei, tipo, dia: dias[j], ano: dias[j].slice(0, 4), exp, clave: mej.clave,
          K: mej.K, ask: mej.ask, coste: mej.ask / sp, horq: (mej.ask - mej.bid) / mej.ask,
          distReal, trunc, salida: null,
          dteReal: dteDe(dias[j], exp), tercerViernes: tercerViernes(exp),
          dom: dom[j], dow: new Date(ms(dias[j])).getUTCDay(),
        };
        if (!pend.has(iSal)) pend.set(iSal, []);
        pend.get(iSal).push(o);
      }
    }
  }
  // lo que quede abierto al final del fichero del ticker no tiene salida: es un hueco
  for (const [, arr] of pend) for (const o of arr) huecos += popcount(o.mask);
  process.stderr.write(`\r   ${sym} · ${mil(diasVistos)} días leídos · ${mil(opsGlob)} operaciones · ${Math.round((Date.now() - t0) / 1000)}s     `);
}
process.stderr.write("\n");

function popcount(x) { let c = 0; while (x) { x &= x - 1; c++; } return c; }

// ════════════════════════════════════════════════════════════════════════════
// SANIDAD
// ════════════════════════════════════════════════════════════════════════════
const ANOS = [...new Set([].concat(...CUB.map((r) => r.map((c) => [...c.anos.keys()]).flat())))].sort();
const NANOS = ANOS.length;

L(`\n${"═".repeat(112)}`);
L("  SANIDAD");
L(`${"═".repeat(112)}`);
L(`  tickers: ${TICKERS.length} · días de cadena: ${mil(TICKERS.reduce((a, t) => a + diasPorSim.get(t).length, 0))} · de ${diasPorSim.get(TICKERS[0])[0]} a ${diasPorSim.get(TICKERS[0]).at(-1)}`);
L(`  días de cadena leídos de disco en este barrido: ${mil(diasVistos)}`);
L(`  días de ENTRADA calculados (uno por día de bolsa útil, compartidos entre frecuencias): ${mil(entradasCalc)}`);
L(`  operaciones anotadas (sumando frecuencias, cada una cuenta la suya): ${mil(opsGlob)}`);
L(`  descartes — sin spot o día roto en la entrada: ${mil(sinSpot)} · día roto entre compra y venta: ${mil(contaminadas)}`);
L(`  descartes — sin contrato que encaje (strike lejos o ask < $${ASKMIN.toFixed(2)}): ${mil(sinContrato)}`);
L(`  HUECOS descartados (falta la cadena de salida o el vencimiento entero): ${mil(huecos)} = ${pct(huecos / (huecos + opsGlob))} de lo intentado`);
L(`\n  DÍAS ROTOS en la serie de precios:  sin precio ${mil(rotoSinSpot)} · se apartan >5% del cierre real ${mil(rotoContraCierre)} · saltos >35% no avalados ${mil(rotoSalto)} · saltos avalados que se quedan ${saltoSalvado}`);
L(`\n  PUERTAS ABIERTAS: ${FREQS.length} frecuencias × ${ENVASES.length} envases = ${FREQS.length * ENVASES.length} mediciones.`);
L(`  No se elige ninguna por resultado: la pregunta es si el CONTROL (mes-1) sigue en pie, no cuál gana.`);

// ── ¿reproduce el control el listón publicado? ───────────────────────────────
L(`\n${"═".repeat(112)}`);
L("  EL CONTROL — ¿reproduce esta tubería el envase vacío publicado?");
L(`${"═".repeat(112)}`);
L(`  publicado, envase A (1 al mes, primer día): ratio 1.11 · acierta 17.3% · ganador medio $4,859 · perdedor medio $916`);
L(`  publicado, envase B: acierta ~33% · ganador ~$1,237 · perdedor ~$602`);
for (let ei = 0; ei < ENVASES.length; ei++) {
  const a = CUB[FI.get("mes-1")][ei].T;
  L(`  aquí, envase ${ENVASES[ei].id}: n=${mil(a.n)} · ratio ${num(R(a))} · acierta ${pct(a.win / a.n)} · ganador medio ${usd(a.gan / a.win)} · perdedor medio ${usd(a.per / (a.n - a.win))}`);
}

// ════════════════════════════════════════════════════════════════════════════
// LA TABLA QUE DECIDE
// ════════════════════════════════════════════════════════════════════════════
for (let ei = 0; ei < ENVASES.length; ei++) {
  const env = ENVASES[ei];
  L(`\n${"═".repeat(112)}`);
  L(`  ENVASE ${env.id} — ${pct(env.dist)} fuera del dinero · ${env.dte} días de plazo · vender a los ${SALIDA} días de bolsa`);
  L(`${"═".repeat(112)}`);
  L(`  | frecuencia | n | ops/año | RATIO | acierto | ganador medio | perdedor medio | prima/subyacente | horquilla | calls | puts |`);
  L(`  |---|---|---|---|---|---|---|---|---|---|---|`);
  for (let f = 0; f < FREQS.length; f++) {
    const cu = CUB[f][ei], a = cu.T;
    if (!a.n) { L(`  | ${FREQS[f].et} | 0 | | | | | | | | | |`); continue; }
    L(`  | ${FREQS[f].et} | ${mil(a.n)} | ${mil(Math.round(a.n / NANOS))} | **${num(R(a))}** | ${pct(a.win / a.n)} | ${usd(a.gan / a.win)} | ${usd(a.per / (a.n - a.win))} | ${pct(a.coste / a.n)} | ${pct(a.horq / a.n)} | ${num(R(cu.C))} | ${num(R(cu.P))} |`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ¿POR QUÉ CAMBIA? — el envase NO compra "60 días": compra el vencimiento que
// le queda más cerca, y ése baila con el día del mes.
// ════════════════════════════════════════════════════════════════════════════
// La prima pagada y la horquilla salen distintas según el día del mes, y eso NO puede ser un
// efecto del mercado: es que se está comprando OTRA COSA. Antes de decir nada sobre el calendario
// hay que ver qué contrato compra cada frecuencia.
for (let ei = 0; ei < ENVASES.length; ei++) {
  const env = ENVASES[ei];
  L(`\n${"═".repeat(112)}`);
  L(`  ¿QUÉ CONTRATO COMPRA CADA FRECUENCIA? — envase ${env.id} (se pidieron ${env.dte} días, se acepta ±${tolDte(env.dte)})`);
  L(`${"═".repeat(112)}`);
  L(`  | frecuencia | plazo real medio | distancia real media | prima/subyacente | horquilla | vencimientos de tercer viernes |`);
  L(`  |---|---|---|---|---|---|`);
  for (let f = 0; f < FREQS.length; f++) {
    const a = CUB[f][ei].T;
    if (!a.n) continue;
    L(`  | ${FREQS[f].et} | ${num(a.dte / a.n, 1)} días | ${pct(a.dist / a.n)} | ${pct(a.coste / a.n)} | ${pct(a.horq / a.n)} | ${pct(a.tv / a.n)} |`);
  }
  // la tabla cruzada que decide: mismo plazo real, distinta frecuencia
  const bins = [...new Set([].concat(...FREQS.map((_, f) => [...CUB[f][ei].dteBin.keys()])))].sort((a, b) => a - b);
  L(`\n  RATIO cruzando FRECUENCIA × PLAZO REAL (bandas de 7 días). Si el día del mes fuera lo que manda,`);
  L(`  las columnas cambiarían dentro de cada fila. Si lo que manda es el PLAZO, cambian las filas.`);
  L(`  | plazo real | ${FREQS.map((f) => f.id).join(" | ")} |`);
  L(`  |---|${FREQS.map(() => "---").join("|")}|`);
  for (const b of bins) {
    const fila = FREQS.map((_, f) => { const v = CUB[f][ei].dteBin.get(b); return v && v.n >= 100 ? num(R(v)) : "n/d"; });
    if (fila.every((x) => x === "n/d")) continue;
    L(`  | ${b * 7}-${b * 7 + 6} días | ${fila.join(" | ")} |`);
  }
  L(`\n  n de cada casilla:`);
  L(`  | plazo real | ${FREQS.map((f) => f.id).join(" | ")} |`);
  L(`  |---|${FREQS.map(() => "---").join("|")}|`);
  for (const b of bins) {
    const fila = FREQS.map((_, f) => mil(CUB[f][ei].dteBin.get(b)?.n ?? 0));
    if (fila.every((x) => x === "0")) continue;
    L(`  | ${b * 7}-${b * 7 + 6} días | ${fila.join(" | ")} |`);
  }
  // el mismo cuadro, pero comprando SÓLO vencimientos mensuales estándar
  L(`\n  Y el mismo envase comprando SÓLO vencimientos de TERCER VIERNES (los mensuales líquidos):`);
  L(`  | frecuencia | n | ops/año | RATIO | acierto | prima/subyacente | horquilla | plazo real medio |`);
  L(`  |---|---|---|---|---|---|---|---|`);
  for (let f = 0; f < FREQS.length; f++) {
    const a = CUB[f][ei].soloTV;
    if (!a.n) continue;
    L(`  | ${FREQS[f].et} | ${mil(a.n)} | ${mil(Math.round(a.n / NANOS))} | **${num(R(a))}** | ${pct(a.win / a.n)} | ${pct(a.coste / a.n)} | ${pct(a.horq / a.n)} | ${num(a.dte / a.n, 1)} días |`);
  }
}

// ── año a año ───────────────────────────────────────────────────────────────
for (let ei = 0; ei < ENVASES.length; ei++) {
  L(`\n${"═".repeat(112)}`);
  L(`  AÑO A AÑO — RATIO del envase ${ENVASES[ei].id} vacío, por frecuencia de entrada`);
  L(`${"═".repeat(112)}`);
  L(`  | frecuencia | total | ${ANOS.join(" | ")} | años < 1.00 |`);
  L(`  |---|---|${ANOS.map(() => "---").join("|")}|---|`);
  for (let f = 0; f < FREQS.length; f++) {
    const cu = CUB[f][ei];
    let malos = 0, cuentan = 0;
    const fila = ANOS.map((y) => {
      const v = cu.anos.get(y);
      if (!v || v.n < 20) return "n/d";
      cuentan++; if (R(v) < 1) malos++;
      return num(R(v));
    });
    L(`  | ${FREQS[f].et} | **${num(R(cu.T))}** | ${fila.join(" | ")} | ${malos} de ${cuentan} |`);
  }
  L(`\n  n por año y frecuencia (envase ${ENVASES[ei].id}):`);
  L(`  | frecuencia | ${ANOS.join(" | ")} |`);
  L(`  |---|${ANOS.map(() => "---").join("|")}|`);
  for (let f = 0; f < FREQS.length; f++) {
    const cu = CUB[f][ei];
    L(`  | ${FREQS[f].et} | ${ANOS.map((y) => mil(cu.anos.get(y)?.n ?? 0)).join(" | ")} |`);
  }
}

// ── los cuatro años duros ───────────────────────────────────────────────────
L(`\n${"═".repeat(112)}`);
L("  LOS AÑOS DUROS POR SEPARADO — envase A");
L(`${"═".repeat(112)}`);
L(`  | frecuencia | 2018 | 2020 | 2022 | 2025 |`);
L(`  |---|---|---|---|---|`);
for (let f = 0; f < FREQS.length; f++) {
  const cu = CUB[f][0];
  L(`  | ${FREQS[f].et} | ${["2018", "2020", "2022", "2025"].map((y) => { const v = cu.anos.get(y); return v && v.n >= 20 ? `${num(R(v))} (n=${mil(v.n)})` : "n/d"; }).join(" | ")} |`);
}

// ── sin febrero-mayo de 2020 / sin 2020 entero ──────────────────────────────
L(`\n${"═".repeat(112)}`);
L("  ¿ES TODO 2020? — envase A, quitando el año entero");
L(`${"═".repeat(112)}`);
L(`  | frecuencia | ratio con 2020 | ratio SIN 2020 | n sin 2020 |`);
L(`  |---|---|---|---|`);
for (let f = 0; f < FREQS.length; f++) {
  const cu = CUB[f][0];
  const a = acc();
  for (const [y, v] of cu.anos) { if (y === "2020") continue; a.n += v.n; a.win += v.win; a.gan += v.gan; a.per += v.per; }
  L(`  | ${FREQS[f].et} | ${num(R(cu.T))} | ${num(R(a))} | ${mil(a.n)} |`);
}

// ── por tercios del período (tres tercios, no dos mitades) ──────────────────
L(`\n${"═".repeat(112)}`);
L("  POR TERCIOS DEL PERÍODO — ¿se apaga con los años?");
L(`${"═".repeat(112)}`);
const TERCIOS = [["2016", "2019", "2016-2019"], ["2020", "2022", "2020-2022"], ["2023", "2026", "2023-2026"]];
for (let ei = 0; ei < ENVASES.length; ei++) {
  L(`\n  Envase ${ENVASES[ei].id}:`);
  L(`  | frecuencia | ${TERCIOS.map((t) => t[2]).join(" | ")} |`);
  L(`  |---|${TERCIOS.map(() => "---").join("|")}|`);
  for (let f = 0; f < FREQS.length; f++) {
    const cu = CUB[f][ei];
    const fila = TERCIOS.map(([a, b]) => {
      const s = acc();
      for (const [y, v] of cu.anos) if (y >= a && y <= b) { s.n += v.n; s.win += v.win; s.gan += v.gan; s.per += v.per; }
      return s.n ? `${num(R(s))} (n=${mil(s.n)})` : "n/d";
    });
    L(`  | ${FREQS[f].et} | ${fila.join(" | ")} |`);
  }
}

// ── concentración por ticker ────────────────────────────────────────────────
L(`\n${"═".repeat(112)}`);
L("  ¿DEPENDE DE POCOS TICKERS? — envase A");
L(`${"═".repeat(112)}`);
L(`  | frecuencia | tickers con ratio > 1 | tickers para la mitad del dinero ganado | mejores | peores |`);
L(`  |---|---|---|---|---|`);
for (let f = 0; f < FREQS.length; f++) {
  const cu = CUB[f][0];
  const tks = [...cu.tks.entries()].map(([k, v]) => ({ k, v, r: R(v) })).sort((a, b) => b.v.gan - a.v.gan);
  const tot = tks.reduce((a, t) => a + t.v.gan, 0);
  let ac = 0, cuantos = 0;
  for (const t of tks) { ac += t.v.gan; cuantos++; if (ac >= tot / 2) break; }
  const porR = [...tks].sort((a, b) => b.r - a.r);
  L(`  | ${FREQS[f].et} | ${tks.filter((t) => t.r > 1).length} de ${tks.length} | ${cuantos} | ${porR.slice(0, 3).map((t) => `${t.k} ${num(t.r)}`).join(" · ")} | ${porR.slice(-3).map((t) => `${t.k} ${num(t.r)}`).join(" · ")} |`);
}

// ── el mayor billete ────────────────────────────────────────────────────────
L(`\n${"═".repeat(112)}`);
L("  EL MAYOR BILLETE Y QUÉ PASA SIN ÉL — envase A");
L(`${"═".repeat(112)}`);
L(`  | frecuencia | mayor billete | quién | ratio quitando ESE evento |`);
L(`  |---|---|---|---|`);
for (let f = 0; f < FREQS.length; f++) {
  const cu = CUB[f][0], m = cu.mayor;
  if (!m) continue;
  L(`  | ${FREQS[f].et} | ${usd(m.d)} | ${m.sym} ${m.tipo} ${m.K} venc. ${m.exp}, entrada ${m.dia} | ${num((cu.T.gan - m.d) / cu.T.per)} |`);
}

// ════════════════════════════════════════════════════════════════════════════
// POSICIONES SOLAPADAS Y DINERO EXIGIDO
// ════════════════════════════════════════════════════════════════════════════
const FECHASORD = [...FECHAS].sort();
L(`\n${"═".repeat(112)}`);
L("  POSICIONES SOLAPADAS — cuántas patas hay abiertas a la vez y cuánto dinero exige");
L(`  Cada pata son $${mil(APUESTA)} arriesgados. Cada entrada abre DOS patas (call y put).`);
L(`${"═".repeat(112)}`);
L(`  | frecuencia | envase | patas abiertas a la vez: máximo | mediana | media | dinero en el pico | dinero mediano |`);
L(`  |---|---|---|---|---|---|---|`);
for (let f = 0; f < FREQS.length; f++) {
  for (let ei = 0; ei < ENVASES.length; ei++) {
    const dl = DELTA[f][ei];
    if (!dl.size) continue;
    let cur = 0; const serie = [];
    for (const d of FECHASORD) { cur += dl.get(d) ?? 0; serie.push(cur); }
    const mx = Math.max(...serie);
    const ord = [...serie].sort((a, b) => a - b);
    const med = ord[ord.length >> 1];
    const avg = serie.reduce((a, b) => a + b, 0) / serie.length;
    L(`  | ${FREQS[f].et} | ${ENVASES[ei].id} | ${mil(mx)} | ${mil(med)} | ${mil(Math.round(avg))} | ${usd(mx * APUESTA)} | ${usd(med * APUESTA)} |`);
  }
}
// por ticker, sólo la frecuencia diaria
{
  L(`\n  Con entradas DIARIAS, por ticker: ${SALIDA} días de bolsa de tenencia significa que en cualquier`);
  L(`  momento hay hasta ${SALIDA} entradas vivas del mismo ticker (× 2 patas = ${SALIDA * 2} contratos por ticker por envase).`);
  L(`  Con ${TICKERS.length} tickers y los dos envases eso son hasta ${mil(SALIDA * 2 * TICKERS.length * 2)} patas = ${usd(SALIDA * 2 * TICKERS.length * 2 * APUESTA)} a la vez si se opera todo.`);
}

// ════════════════════════════════════════════════════════════════════════════
// EL CONTROL QUE DECIDE — el día 1 del mes contra los otros veinte
// ════════════════════════════════════════════════════════════════════════════
// El universo diario partido por posición del día dentro de su mes. Son 22 submuestras DISJUNTAS
// del mismo tamaño (~6.800 operaciones cada una en el envase A), o sea 22 controles del control.
// Si el primer día de bolsa del mes fuera especial de verdad, saldría fuera de la fila. Si no,
// es una submuestra pequeña más y el 1.11 era el mejor de veintiuna tiradas.
const DIASEM = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
for (let ei = 0; ei < ENVASES.length; ei++) {
  L(`\n${"═".repeat(112)}`);
  L(`  EL DÍA 1 CONTRA LOS OTROS VEINTE — envase ${ENVASES[ei].id}, universo diario partido por posición en el mes`);
  L(`${"═".repeat(112)}`);
  L(`  | día de bolsa del mes | n | RATIO | acierto | plazo real medio | prima/subyacente | horquilla |`);
  L(`  |---|---|---|---|---|---|---|`);
  const rs = [];
  for (let k = 0; k < 22; k++) {
    const a = DOM[ei][k];
    if (a.n < 200) continue;
    if (k > 0) rs.push(R(a));
    L(`  | ${k === 0 ? "**1º (el del control)**" : `${k + 1}º`} | ${mil(a.n)} | ${k === 0 ? "**" : ""}${num(R(a))}${k === 0 ? "**" : ""} | ${pct(a.win / a.n)} | ${num(a.dte / a.n, 1)} días | ${pct(a.coste / a.n)} | ${pct(a.horq / a.n)} |`);
  }
  const ord = [...rs].sort((x, y) => x - y);
  const r0 = R(DOM[ei][0]);
  const mejores = rs.filter((x) => x > r0).length;
  L(`\n  el 1º de mes da ${num(r0)}. Los otros ${rs.length} días van de ${num(ord[0])} a ${num(ord.at(-1))}, con mediana ${num(ord[ord.length >> 1])}.`);
  L(`  días que BATEN al 1º: ${mejores} de ${rs.length}.`);
  L(`  → si ese número es alto, el 1º no tiene nada de especial. Si es 0 o 1, el calendario manda de verdad.`);
}
// año a año del día 1 contra el resto — ¿es un año el que lo sostiene?
L(`\n${"═".repeat(112)}`);
L("  ¿QUÉ AÑOS SOSTIENEN AL DÍA 1? — envase A, ratio del 1º de mes contra la mediana de los otros días");
L(`${"═".repeat(112)}`);
L(`  | año | n del 1º | RATIO del 1º | mediana de los otros 20 días | peor | mejor |`);
L(`  |---|---|---|---|---|---|`);
for (const y of ANOS) {
  const a = DOMANO[0][0].get(y);
  if (!a || a.n < 100) continue;
  const otros = [];
  for (let k = 1; k < 22; k++) { const v = DOMANO[0][k].get(y); if (v && v.n >= 100) otros.push(R(v)); }
  otros.sort((x, z) => x - z);
  L(`  | ${y} | ${mil(a.n)} | **${num(R(a))}** | ${num(otros[otros.length >> 1])} | ${num(otros[0])} | ${num(otros.at(-1))} |`);
}
// ── ¿es el PLAZO REAL lo que manda? ─────────────────────────────────────────
L(`\n${"═".repeat(112)}`);
L("  ¿ES EL PLAZO REAL LO QUE MANDA? — universo diario entero (envase A), por plazo real de 3 en 3 días");
L(`${"═".repeat(112)}`);
{
  const b = new Map();
  const D = DIARIO[0];
  for (let i = 0; i < D.dol.length; i++) {
    const k = Math.floor(D.dte[i] / 3);
    if (!b.has(k)) b.set(k, { n: 0, gan: 0, per: 0 });
    const a = b.get(k); a.n++; if (D.dol[i] > 0) a.gan += D.dol[i]; else a.per += -D.dol[i];
  }
  L(`  | plazo real | n | RATIO |`);
  L(`  |---|---|---|`);
  for (const k of [...b.keys()].sort((x, y) => x - y)) {
    const a = b.get(k);
    if (a.n < 500) continue;
    L(`  | ${k * 3}-${k * 3 + 2} días | ${mil(a.n)} | ${num(a.gan / a.per)} |`);
  }
  L(`\n  Y la correlación entre el plazo real medio de cada uno de los 22 días del mes y su ratio:`);
  const xs = [], ys = [];
  for (let k = 0; k < 22; k++) { const a = DOM[0][k]; if (a.n < 200) continue; xs.push(a.dte / a.n); ys.push(R(a)); }
  const mx = xs.reduce((p, q) => p + q, 0) / xs.length, my = ys.reduce((p, q) => p + q, 0) / ys.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  L(`    correlación = ${num(sxy / Math.sqrt(sxx * syy))}  (${xs.length} días del mes; plazo medio de ${num(Math.min(...xs), 1)} a ${num(Math.max(...xs), 1)} días)`);
}

// ── EL BARAJADO POR FECHAS: ¿cabe esta horquilla por puro azar? ──────────────
L(`\n${"═".repeat(112)}`);
L("  EL BARAJADO — ¿cabe la horquilla entre días del mes por puro azar?");
L(`${"═".repeat(112)}`);
L(`  Se reparten TODAS las FECHAS de bolsa al azar en 22 montones (no las operaciones sueltas: las`);
L(`  FECHAS, porque los 28 tickers de un mismo día suben y bajan juntos y repartir operaciones`);
L(`  fingiría una muestra mucho mayor de la que hay). Cada montón queda del tamaño de "el 1º de mes".`);
L(`  20 repartos, semilla fija, nunca Math.random.`);
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
for (let ei = 0; ei < ENVASES.length; ei++) {
  const D = DIARIO[ei];
  const porFecha = new Map();
  for (let i = 0; i < D.dol.length; i++) {
    if (!porFecha.has(D.fecha[i])) porFecha.set(D.fecha[i], { n: 0, gan: 0, per: 0 });
    const a = porFecha.get(D.fecha[i]); a.n++; if (D.dol[i] > 0) a.gan += D.dol[i]; else a.per += -D.dol[i];
  }
  const fechas = [...porFecha.values()];
  const real = R(DOM[ei][0]);
  const maxs = [], mins = [], baten = [];
  for (let s = 0; s < 20; s++) {
    const rnd = mulberry32(1000 + s);
    const ord = fechas.map((v) => ({ v, k: rnd() })).sort((a, b) => a.k - b.k).map((x) => x.v);
    const G = Array.from({ length: 22 }, () => ({ n: 0, gan: 0, per: 0 }));
    ord.forEach((f, i) => { const g = G[i % 22]; g.n += f.n; g.gan += f.gan; g.per += f.per; });
    const rs = G.map((g) => g.gan / g.per).sort((a, b) => a - b);
    maxs.push(rs.at(-1)); mins.push(rs[0]);
    baten.push(rs.filter((x) => x > real).length);
  }
  const med = (v) => [...v].sort((a, b) => a - b)[v.length >> 1];
  L(`\n  Envase ${ENVASES[ei].id} — el 1º de mes de verdad da ${num(real)}.`);
  L(`    en 20 repartos al azar, el MEJOR montón de cada reparto va de ${num(Math.min(...maxs))} a ${num(Math.max(...maxs))} (mediana ${num(med(maxs))})`);
  L(`    y el PEOR, de ${num(Math.min(...mins))} a ${num(Math.max(...mins))} (mediana ${num(med(mins))})`);
  L(`    montones al azar que baten al 1º de mes: mediana ${med(baten)} de 22 · rango ${Math.min(...baten)}-${Math.max(...baten)}`);
  L(`    repartos en los que el mejor montón al azar supera al 1º de mes: ${maxs.filter((x) => x > real).length} de 20`);
}

// día de la semana
L(`\n${"═".repeat(112)}`);
L("  ¿IMPORTA EL DÍA DE LA SEMANA? — envase A y B, universo diario partido por día");
L(`${"═".repeat(112)}`);
L(`  | día | n (A) | RATIO A | acierto A | n (B) | RATIO B | acierto B |`);
L(`  |---|---|---|---|---|---|---|`);
for (let w = 1; w <= 5; w++) {
  const a = DOW[0][w], b = DOW[1][w];
  if (!a.n) continue;
  L(`  | ${DIASEM[w]} | ${mil(a.n)} | ${num(R(a))} | ${pct(a.win / a.n)} | ${mil(b.n)} | ${num(R(b))} | ${pct(b.win / b.n)} |`);
}

// ════════════════════════════════════════════════════════════════════════════
// LA PREGUNTA QUE DECIDE
// ════════════════════════════════════════════════════════════════════════════
L(`\n${"═".repeat(112)}`);
L("  ¿CAMBIA EL 1.11 DEL ENVASE VACÍO?");
L(`${"═".repeat(112)}`);
for (let ei = 0; ei < ENVASES.length; ei++) {
  const ctrl = R(CUB[FI.get("mes-1")][ei].T);
  const diario = R(CUB[FI.get("diario")][ei].T);
  const mens = ["mes-1", "mes-5", "mes-10", "mes-15", "mes-20", "mes-rot"].map((id) => R(CUB[FI.get(id)][ei].T));
  const lo = Math.min(...mens), hi = Math.max(...mens);
  L(`\n  Envase ${ENVASES[ei].id}:`);
  L(`    control (mes-1)          : ${num(ctrl)}`);
  L(`    diario                   : ${num(diario)}   (diferencia ${num(diario - ctrl)})`);
  L(`    las 6 variantes mensuales: de ${num(lo)} a ${num(hi)}  → horquilla de ${num(hi - lo)} SÓLO por cambiar el día del mes`);
  L(`    ¿el control cae dentro de esa horquilla y cerca del diario? ${Math.abs(diario - ctrl) <= (hi - lo) ? "SÍ" : "NO"}`);
}

L(`\n  tiempo total: ${Math.round((Date.now() - t0) / 1000)}s\n`);
