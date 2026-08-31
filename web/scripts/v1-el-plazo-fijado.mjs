// FIJAR EL PLAZO Y VOLVER A MEDIR EL ENVASE VACÍO.
//
// ═══ POR QUÉ EXISTE ══════════════════════════════════════════════════════════════════════════
//
// El envase dice "60 días" pero compra el vencimiento que le pilla más cerca dentro de una
// tolerancia ancha (w1-entrar-mas-veces.mjs línea 83: ±17 días en A, ±25 en B). Resultado: el
// plazo real baila 14 días según el día de entrada y la horquilla pasa del 10.3% de la prima el
// día 1 del mes al 23.0% el día 4. O sea: EL DÍA DE ENTRADA DECIDE QUÉ CONTRATO SE COMPRA.
// Cualquier señal diaria mide eso, no el mercado.
//
// Aquí se arregla: sólo se acepta un vencimiento DENTRO DE UNA BANDA ESTRECHA. Si ese día no hay
// ninguno en la banda, NO SE OPERA y se cuenta aparte.
//
// ═══ QUÉ SE MIDE ═════════════════════════════════════════════════════════════════════════════
//
//   ENVASE A: 10% fuera del dinero · plazo objetivo 60 días · vender a los 30 días de bolsa
//   ENVASE B:  5% fuera del dinero · plazo objetivo 90 días · vender a los 30 días de bolsa
//
//   BANDAS: ±5 · ±10 · ±15 · "libre" (la tolerancia vieja de w1: ±17 en A, ±25 en B) ← referencia
//   FILTRO DE VENCIMIENTO: TODOS  vs  SÓLO TERCER VIERNES (los mensuales líquidos)
//
//   Universo DIARIO: todas las sesiones de bolsa de los 28 tickers con cadena diaria.
//   COMBINACIONES MEDIDAS: 2 envases × 4 bandas × 2 filtros = 16. Ninguna se elige por resultado:
//   la pregunta es cuál es el listón honesto, no cuál gana.
//
// ═══ LAS REGLAS DE LA CASA ═══════════════════════════════════════════════════════════════════
//   · se COMPRA AL ASK y se VENDE AL BID. Nunca punto medio.
//   · nada de Black-Scholes ni de ningún modelo de precios.
//   · un HUECO no es un cero: si falta la cadena del día de salida o el vencimiento entero, la
//     operación se descarta y SE CUENTA. Si el vencimiento está y el contrato no aparece, es que
//     no tiene puja: vale 0, y eso es un dato REAL.
//   · el precio del subyacente sale de la paridad put-call SÓLO en el vencimiento más cercano
//     (la serie ya validada de y9/w1, scripts/cache-theta/_y9-spots.json).
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/v1-el-plazo-fijado.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CIERRES = "scripts/cache-theta/cierres";
const SPOTCACHE = "scripts/cache-theta/_y9-spots.json";

const APUESTA = 1000;
const TOLK = 0.50;      // cuánto puede apartarse el strike de la distancia pedida (igual que w1)
const SALIDA = 30;      // días de bolsa hasta vender
const ASKMIN = 0.10;    // la regla del listón

const ENVASES = [
  { id: "A", dist: 0.10, dte: 60, libre: 17 },
  { id: "B", dist: 0.05, dte: 90, libre: 25 },
];
const BANDAS = [
  { id: "±5", w: 5 },
  { id: "±10", w: 10 },
  { id: "±15", w: 15 },
  { id: "libre", w: null },   // la tolerancia vieja: ±17 (A) / ±25 (B)
];
const FILTROS = [
  { id: "todos", tv: false },
  { id: "3ºvie", tv: true },
];
const NV = BANDAS.length * FILTROS.length;          // 8 variantes por envase
const vidx = (bi, fi) => bi * FILTROS.length + fi;
const etiqueta = (ei, bi, fi) =>
  `${ENVASES[ei].id} · banda ${BANDAS[bi].id === "libre" ? `libre (±${ENVASES[ei].libre})` : BANDAS[bi].id} · ${FILTROS[fi].id}`;

const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "n/d");
const usd = (n) => (Number.isFinite(n) ? "$" + Math.round(n).toLocaleString("en-US") : "n/d");
const num = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "n/d");
const mil = (n) => n.toLocaleString("en-US");
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const L = (x = "") => console.log(x);
/** ¿es el vencimiento un TERCER VIERNES (la expiración mensual estándar, la líquida)? */
function tercerViernes(e) {
  const d = new Date(ms(e));
  return d.getUTCDay() === 5 && Number(e.slice(6, 8)) >= 15 && Number(e.slice(6, 8)) <= 21;
}

// ── índice de días por ticker ────────────────────────────────────────────────
const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
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
// ETAPA 1 — la serie de precios (reutilizada de y9/w1, sin recalcular)
// ════════════════════════════════════════════════════════════════════════════
const SPOTS = existsSync(SPOTCACHE) ? JSON.parse(readFileSync(SPOTCACHE, "utf8")) : {};
{
  const faltan = TICKERS.filter((t) => !Array.isArray(SPOTS[t]) || SPOTS[t].length !== diasPorSim.get(t).length);
  if (faltan.length) {
    L(`## reconstruyendo la serie de precios de ${faltan.length} tickers`);
    for (const sym of faltan) {
      const arr = [];
      for (const d of diasPorSim.get(sym)) { const c = leer(sym, d); arr.push(c ? spotOk(c, d) : null); }
      SPOTS[sym] = arr;
      process.stderr.write(`\r   spots · ${sym}     `);
    }
    process.stderr.write("\n");
    writeFileSync(SPOTCACHE, JSON.stringify(SPOTS));
  } else {
    L(`## serie de precios leída de ${SPOTCACHE} (la misma de y9/w1) — ${TICKERS.length} tickers`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 2 — días rotos (misma criba que y9/w1)
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
  const pf = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) pf[i + 1] = pf[i] + (ro[i] ? 1 : 0);
  PREF[sym] = pf;
}

/** Posición del día DENTRO de su mes (0 = primer día de bolsa del mes). */
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
// ETAPA 3 — acumuladores
// ════════════════════════════════════════════════════════════════════════════
const acc = () => ({ n: 0, win: 0, gan: 0, per: 0, coste: 0, horq: 0, sinValor: 0, dist: 0, dte: 0, dte2: 0, tv: 0 });
function add(a, ret, o) {
  const d = APUESTA * ret;
  a.n++; if (d > 0) { a.win++; a.gan += d; } else a.per += -d;
  a.coste += o.coste; a.horq += o.horq; a.dist += o.distReal;
  a.dte += o.dteReal; a.dte2 += o.dteReal * o.dteReal; a.tv += o.tv;
  if (o.salida === 0) a.sinValor++;
}
const R = (a) => (a.per > 0 ? a.gan / a.per : (a.gan > 0 ? Infinity : NaN));
const sdDte = (a) => (a.n > 1 ? Math.sqrt(Math.max(0, a.dte2 / a.n - (a.dte / a.n) ** 2)) : NaN);

// VAR[ei][v]
const VAR = ENVASES.map(() => Array.from({ length: NV }, () => ({
  T: acc(), C: acc(), P: acc(),
  anos: new Map(), tks: new Map(), mayor: null,
  dom: Array.from({ length: 22 }, acc),
  dteBin: new Map(),                   // bin de plazo real de 5 en 5 días, desde 40
  porFecha: new Map(),               // fecha -> {n,gan,per}  (para el barajado)
  // contabilidad de días
  diasOperados: 0, diasSinBanda: 0, operadosPorDom: new Int32Array(22),
  sinBandaPorAno: new Map(), sinBandaPorDom: new Int32Array(22), sinBandaPorTk: new Map(),
  maxRacha: 0, rachas: 0, sumRacha: 0,
  huecos: 0, sinContrato: 0,
})));

let diasVistos = 0, diasValidos = 0, diasNoValidos = 0, diasContaminados = 0, opsGlob = 0, entradasFinDeFichero = 0;
const FECHAS = new Set();
const t0 = Date.now();

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 4 — el barrido: un pase por ticker, una cadena leída una sola vez
// ════════════════════════════════════════════════════════════════════════════
for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym);
  const s = SPOTS[sym], pf = PREF[sym], n = dias.length;
  const idxDe = new Map(dias.map((d, i) => [d, i]));
  const dom = domIndices(dias);
  for (const d of dias) FECHAS.add(d);

  const pend = new Map();                       // índice del día de salida -> [ops]
  const rachaAct = ENVASES.map(() => new Int32Array(NV));

  for (let j = 0; j < n; j++) {
    const c = leer(sym, dias[j]);
    diasVistos++;

    // ── 1) cerrar lo que sale hoy ────────────────────────────────────────────
    if (pend.has(j)) {
      for (const o of pend.get(j)) {
        if (!c || !c[o.exp]) {                  // HUECO: no se puede medir. No se rellena.
          for (let ei = 0; ei < ENVASES.length; ei++) for (let v = 0; v < NV; v++) if (o.ei === ei && (o.mask & (1 << v))) VAR[ei][v].huecos++;
          continue;
        }
        const salida = c[o.exp][o.clave]?.[0] ?? 0;   // sin puja = 0. Dato REAL.
        const ret = (salida - o.ask) / o.ask;
        const d = APUESTA * ret;
        o.salida = salida;
        for (let v = 0; v < NV; v++) {
          if (!(o.mask & (1 << v))) continue;
          opsGlob++;
          const cu = VAR[o.ei][v];
          add(cu.T, ret, o); add(cu[o.tipo], ret, o);
          add(cu.dom[o.dom], ret, o);
          {
            const bin = Math.floor((o.dteReal - 40) / 5);
            if (bin >= 0 && bin < 12) {
              if (!cu.dteBin.has(bin)) cu.dteBin.set(bin, acc());
              add(cu.dteBin.get(bin), ret, o);
            }
          }
          if (!cu.anos.has(o.ano)) cu.anos.set(o.ano, acc());
          add(cu.anos.get(o.ano), ret, o);
          if (!cu.tks.has(sym)) cu.tks.set(sym, acc());
          add(cu.tks.get(sym), ret, o);
          if (!cu.mayor || d > cu.mayor.d) cu.mayor = { d, sym, dia: o.dia, tipo: o.tipo, K: o.K, exp: o.exp };
          let pf2 = cu.porFecha.get(o.dia);
          if (!pf2) { pf2 = { n: 0, gan: 0, per: 0 }; cu.porFecha.set(o.dia, pf2); }
          pf2.n++; if (d > 0) pf2.gan += d; else pf2.per += -d;
        }
      }
      pend.delete(j);
    }

    // ── 2) abrir lo de hoy ───────────────────────────────────────────────────
    if (j + SALIDA >= n) { entradasFinDeFichero++; continue; }   // no hay día de salida en el fichero
    if (!c) { diasNoValidos++; continue; }
    const sp = s[j];
    if (sp == null || ROTO[sym][j]) { diasNoValidos++; continue; }
    if (pf[j + SALIDA + 1] - pf[j] > 0) { diasContaminados++; continue; }  // día roto entre compra y venta
    diasValidos++;

    // vencimientos disponibles hoy
    const disp = [];
    for (const e of Object.keys(c)) {
      const dt = dteDe(dias[j], e);
      if (dt >= 1) disp.push({ e, dt, tv: tercerViernes(e) });
    }

    for (let ei = 0; ei < ENVASES.length; ei++) {
      const env = ENVASES[ei];
      // qué vencimiento elige cada variante
      const expDe = new Array(NV).fill(null);
      for (let bi = 0; bi < BANDAS.length; bi++) {
        const w = BANDAS[bi].w ?? env.libre;
        for (let fi = 0; fi < FILTROS.length; fi++) {
          let best = null, bd = Infinity;
          for (const x of disp) {
            if (FILTROS[fi].tv && !x.tv) continue;
            const dd = Math.abs(x.dt - env.dte);
            if (dd > w) continue;
            if (dd < bd) { bd = dd; best = x; }
          }
          expDe[vidx(bi, fi)] = best;
        }
      }
      // contabilidad de días perdidos por no haber vencimiento en la banda
      for (let v = 0; v < NV; v++) {
        const cu = VAR[ei][v];
        if (expDe[v]) {
          cu.diasOperados++; cu.operadosPorDom[dom[j]]++;
          if (rachaAct[ei][v] > 0) { cu.rachas++; cu.sumRacha += rachaAct[ei][v]; cu.maxRacha = Math.max(cu.maxRacha, rachaAct[ei][v]); rachaAct[ei][v] = 0; }
        } else {
          cu.diasSinBanda++;
          const y = dias[j].slice(0, 4);
          cu.sinBandaPorAno.set(y, (cu.sinBandaPorAno.get(y) ?? 0) + 1);
          cu.sinBandaPorDom[dom[j]]++;
          cu.sinBandaPorTk.set(sym, (cu.sinBandaPorTk.get(sym) ?? 0) + 1);
          rachaAct[ei][v]++;
        }
      }
      // construir los contratos: una vez por vencimiento distinto
      const usados = new Map();               // exp -> { C: op|null, P: op|null }
      for (let v = 0; v < NV; v++) {
        const x = expDe[v];
        if (!x) continue;
        if (usados.has(x.e)) continue;
        // día de salida: 30 de bolsa, o el vencimiento si cae antes
        let iSal = j + SALIDA, trunc = 0;
        if (dias[iSal] >= x.e) {
          const k = idxDe.get(x.e);
          if (k == null || k <= j) { usados.set(x.e, { C: null, P: null, hueco: true }); continue; }
          iSal = k; trunc = 1;
        }
        const par = { C: null, P: null, hueco: false, iSal };
        for (const tipo of ["C", "P"]) {
          const objetivo = tipo === "C" ? sp * (1 + env.dist) : sp * (1 - env.dist);
          let mej = null, dd = Infinity;
          for (const [clave, ba] of Object.entries(c[x.e])) {
            if (clave.slice(-1) !== tipo) continue;
            if (!(ba[1] > 0) || ba[1] < ASKMIN) continue;
            const K = Number(clave.slice(0, -2));
            const d = Math.abs(K - objetivo);
            if (d < dd) { dd = d; mej = { K, clave, bid: ba[0], ask: ba[1] }; }
          }
          if (!mej) continue;
          const distReal = tipo === "C" ? mej.K / sp - 1 : 1 - mej.K / sp;
          if (Math.abs(distReal - env.dist) > env.dist * TOLK) continue;
          par[tipo] = {
            mask: 0, ei, tipo, dia: dias[j], ano: dias[j].slice(0, 4), exp: x.e, clave: mej.clave,
            K: mej.K, ask: mej.ask, coste: mej.ask / sp, horq: (mej.ask - mej.bid) / mej.ask,
            distReal, trunc, salida: null, dteReal: x.dt, tv: x.tv ? 1 : 0, dom: dom[j], iSal,
          };
        }
        usados.set(x.e, par);
      }
      // repartir los bits de variante
      for (let v = 0; v < NV; v++) {
        const x = expDe[v];
        if (!x) continue;
        const par = usados.get(x.e);
        if (par.hueco) { VAR[ei][v].huecos += 2; continue; }
        for (const tipo of ["C", "P"]) {
          if (!par[tipo]) { VAR[ei][v].sinContrato++; continue; }
          par[tipo].mask |= 1 << v;
        }
      }
      // encolar
      for (const par of usados.values()) {
        if (par.hueco) continue;
        for (const tipo of ["C", "P"]) {
          const o = par[tipo];
          if (!o || !o.mask) continue;
          if (!pend.has(o.iSal)) pend.set(o.iSal, []);
          pend.get(o.iSal).push(o);
        }
      }
    }
  }
  // rachas abiertas al terminar el ticker
  for (let ei = 0; ei < ENVASES.length; ei++) for (let v = 0; v < NV; v++) {
    if (rachaAct[ei][v] > 0) { const cu = VAR[ei][v]; cu.rachas++; cu.sumRacha += rachaAct[ei][v]; cu.maxRacha = Math.max(cu.maxRacha, rachaAct[ei][v]); }
  }
  // lo que quede abierto al final del fichero es un hueco
  for (const [, arr] of pend) for (const o of arr) for (let v = 0; v < NV; v++) if (o.mask & (1 << v)) VAR[o.ei][v].huecos++;
  process.stderr.write(`\r   ${sym} · ${mil(diasVistos)} días · ${mil(opsGlob)} operaciones · ${Math.round((Date.now() - t0) / 1000)}s     `);
}
process.stderr.write("\n");

// ════════════════════════════════════════════════════════════════════════════
// SALIDA
// ════════════════════════════════════════════════════════════════════════════
const ANOS = [...new Set([].concat(...VAR.map((r) => r.map((c) => [...c.anos.keys()]).flat())))].sort();
const NANOS = ANOS.length;
const DIASEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

L(`\n${"═".repeat(130)}`);
L("  SANIDAD");
L(`${"═".repeat(130)}`);
L(`  tickers: ${TICKERS.length} · días de cadena: ${mil(TICKERS.reduce((a, t) => a + diasPorSim.get(t).length, 0))} · de ${diasPorSim.get("BAC")[0]} a ${diasPorSim.get("BAC").at(-1)}`);
L(`  días de cadena leídos de disco: ${mil(diasVistos)}`);
L(`  días de bolsa VÁLIDOS para entrar (spot bueno, sin día roto en el camino): ${mil(diasValidos)}`);
L(`  descartados antes de mirar el plazo — sin spot o día roto: ${mil(diasNoValidos)} · día roto entre compra y venta: ${mil(diasContaminados)} · sin día de salida en el fichero: ${mil(entradasFinDeFichero)}`);
L(`  operaciones anotadas (sumando las 16 combinaciones; cada una cuenta la suya): ${mil(opsGlob)}`);
L(`\n  DÍAS ROTOS en la serie de precios: sin precio ${mil(rotoSinSpot)} · se apartan >5% del cierre real ${mil(rotoContraCierre)} · saltos >35% no avalados ${mil(rotoSalto)} · saltos avalados que se quedan ${saltoSalvado}`);
L(`\n  PUERTAS ABIERTAS: 2 envases × ${BANDAS.length} bandas × ${FILTROS.length} filtros de vencimiento = ${2 * NV} combinaciones medidas.`);
L(`  Ninguna se elige por resultado: lo que se busca es el LISTÓN honesto con el plazo fijado.`);

// ── LA TABLA PRINCIPAL ──────────────────────────────────────────────────────
for (let ei = 0; ei < ENVASES.length; ei++) {
  const env = ENVASES[ei];
  L(`\n${"═".repeat(130)}`);
  L(`  ENVASE ${env.id} — ${pct(env.dist)} fuera del dinero · plazo objetivo ${env.dte} días · vender a los ${SALIDA} días de bolsa · UNIVERSO DIARIO`);
  L(`${"═".repeat(130)}`);
  L(`  | banda de plazo | filtro | n | ops/año | RATIO | acierto | ganador medio | perdedor medio | prima/subyac. | horquilla | plazo real | ± del plazo | días perdidos | vence sin valor |`);
  L(`  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|`);
  for (let bi = 0; bi < BANDAS.length; bi++) {
    for (let fi = 0; fi < FILTROS.length; fi++) {
      const cu = VAR[ei][vidx(bi, fi)], a = cu.T;
      if (!a.n) { L(`  | ${BANDAS[bi].id} | ${FILTROS[fi].id} | 0 | | | | | | | | | | | |`); continue; }
      const perd = cu.diasSinBanda / (cu.diasSinBanda + cu.diasOperados);
      const banda = BANDAS[bi].id === "libre" ? `libre (±${env.libre})` : BANDAS[bi].id;
      L(`  | ${banda} | ${FILTROS[fi].id} | ${mil(a.n)} | ${mil(Math.round(a.n / NANOS))} | **${num(R(a))}** | ${pct(a.win / a.n)} | ${usd(a.gan / a.win)} | ${usd(a.per / (a.n - a.win))} | ${pct(a.coste / a.n)} | ${pct(a.horq / a.n)} | ${num(a.dte / a.n, 1)} d | ${num(sdDte(a), 1)} d | ${pct(perd)} | ${pct(a.sinValor / a.n)} |`);
    }
  }
  L(`\n  calls y puts por separado:`);
  L(`  | banda | filtro | RATIO total | RATIO calls | RATIO puts | acierto calls | acierto puts |`);
  L(`  |---|---|---|---|---|---|---|`);
  for (let bi = 0; bi < BANDAS.length; bi++) for (let fi = 0; fi < FILTROS.length; fi++) {
    const cu = VAR[ei][vidx(bi, fi)];
    if (!cu.T.n) continue;
    L(`  | ${BANDAS[bi].id} | ${FILTROS[fi].id} | ${num(R(cu.T))} | ${num(R(cu.C))} | ${num(R(cu.P))} | ${pct(cu.C.win / cu.C.n)} | ${pct(cu.P.win / cu.P.n)} |`);
  }
}

// ── LOS DÍAS PERDIDOS: ¿se agrupan? ─────────────────────────────────────────
L(`\n${"═".repeat(130)}`);
L("  LOS DÍAS QUE SE PIERDEN POR NO HABER VENCIMIENTO EN LA BANDA — ¿se agrupan?");
L(`${"═".repeat(130)}`);
L(`  | combinación | días válidos | días operados | días perdidos | % perdido | racha más larga | racha media |`);
L(`  |---|---|---|---|---|---|---|`);
for (let ei = 0; ei < ENVASES.length; ei++) for (let bi = 0; bi < BANDAS.length; bi++) for (let fi = 0; fi < FILTROS.length; fi++) {
  const cu = VAR[ei][vidx(bi, fi)];
  const tot = cu.diasOperados + cu.diasSinBanda;
  L(`  | ${etiqueta(ei, bi, fi)} | ${mil(tot)} | ${mil(cu.diasOperados)} | ${mil(cu.diasSinBanda)} | ${pct(cu.diasSinBanda / tot)} | ${cu.maxRacha} días | ${num(cu.rachas ? cu.sumRacha / cu.rachas : NaN, 1)} días |`);
}

L(`\n  ¿DÓNDE caen los días perdidos? Porcentaje de días perdidos según la posición del día dentro de su mes.`);
L(`  Si los vencimientos del tercer viernes crearan huecos regulares, esta fila NO sería plana.`);
for (let ei = 0; ei < ENVASES.length; ei++) {
  for (const bi of [0, 1]) {
    const cu = VAR[ei][vidx(bi, 0)];
    const fila = [];
    for (let k = 0; k < 22; k++) {
      const tot = cu.operadosPorDom[k] + cu.sinBandaPorDom[k];
      fila.push(tot ? pct(cu.sinBandaPorDom[k] / tot) : "n/d");
    }
    L(`\n  ${etiqueta(ei, bi, 0)}  (día 1º del mes → 22º)`);
    L(`  | día del mes | ${Array.from({ length: 22 }, (_, k) => k + 1 + "º").join(" | ")} |`);
    L(`  |---|${Array.from({ length: 22 }, () => "---").join("|")}|`);
    L(`  | % perdido | ${fila.join(" | ")} |`);
  }
}

L(`\n  Días perdidos por AÑO (envase A, banda ±5, todos los vencimientos):`);
{
  const cu = VAR[0][vidx(0, 0)];
  L(`  | año | ${ANOS.join(" | ")} |`);
  L(`  |---|${ANOS.map(() => "---").join("|")}|`);
  L(`  | días perdidos | ${ANOS.map((y) => mil(cu.sinBandaPorAno.get(y) ?? 0)).join(" | ")} |`);
}
L(`\n  Días perdidos por TICKER (envase A, banda ±5, todos) — los 8 peores:`);
{
  const cu = VAR[0][vidx(0, 0)];
  const v = [...cu.sinBandaPorTk.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  L(`  ${v.map(([k, n]) => `${k} ${mil(n)}`).join(" · ") || "ninguno"}`);
}

// ── LA HORQUILLA: ¿se estabiliza al fijar el plazo? ──────────────────────────
L(`\n${"═".repeat(130)}`);
L("  LA HORQUILLA — ¿se estabiliza al fijar el plazo? (era medio problema: del 10.3% al 23.0% de la prima según el día)");
L(`${"═".repeat(130)}`);
for (let ei = 0; ei < ENVASES.length; ei++) {
  L(`\n  Envase ${ENVASES[ei].id} — horquilla media (% de la prima) según la posición del día dentro del mes:`);
  L(`  | banda | filtro | ${Array.from({ length: 22 }, (_, k) => k + 1 + "º").join(" | ")} | mín | máx | recorrido |`);
  L(`  |---|---|${Array.from({ length: 22 }, () => "---").join("|")}|---|---|---|`);
  for (let bi = 0; bi < BANDAS.length; bi++) for (let fi = 0; fi < FILTROS.length; fi++) {
    const cu = VAR[ei][vidx(bi, fi)];
    if (!cu.T.n) continue;
    const vals = [], celdas = [];
    for (let k = 0; k < 22; k++) {
      const a = cu.dom[k];
      if (a.n < 200) { celdas.push("n/d"); continue; }
      const h = a.horq / a.n; vals.push(h); celdas.push(pct(h));
    }
    if (!vals.length) continue;
    L(`  | ${BANDAS[bi].id} | ${FILTROS[fi].id} | ${celdas.join(" | ")} | ${pct(Math.min(...vals))} | ${pct(Math.max(...vals))} | **${pct(Math.max(...vals) - Math.min(...vals))}** |`);
  }
  L(`\n  Y el PLAZO REAL medio según la posición del día dentro del mes (el confundido original: bailaba 14 días):`);
  L(`  | banda | filtro | mín | máx | recorrido |`);
  L(`  |---|---|---|---|---|`);
  for (let bi = 0; bi < BANDAS.length; bi++) for (let fi = 0; fi < FILTROS.length; fi++) {
    const cu = VAR[ei][vidx(bi, fi)];
    const vals = [];
    for (let k = 0; k < 22; k++) { const a = cu.dom[k]; if (a.n >= 200) vals.push(a.dte / a.n); }
    if (!vals.length) continue;
    L(`  | ${BANDAS[bi].id} | ${FILTROS[fi].id} | ${num(Math.min(...vals), 1)} d | ${num(Math.max(...vals), 1)} d | **${num(Math.max(...vals) - Math.min(...vals), 1)} d** |`);
  }
}

// ── EL RATIO POR DÍA DEL MES: ¿desaparece el efecto calendario? ──────────────
L(`\n${"═".repeat(130)}`);
L("  ¿DESAPARECE EL EFECTO DEL DÍA DEL MES AL FIJAR EL PLAZO?");
L(`  Con el plazo suelto, los 22 días del mes iban de 0.84 a 1.16 en el envase A. Si eso era PLAZO y no mercado,`);
L(`  con la banda estrecha los 22 tienen que juntarse.`);
L(`${"═".repeat(130)}`);
for (let ei = 0; ei < ENVASES.length; ei++) {
  L(`\n  Envase ${ENVASES[ei].id}:`);
  L(`  | banda | filtro | ratio del 1º del mes | mín de los 22 | máx | recorrido | mediana |`);
  L(`  |---|---|---|---|---|---|---|`);
  for (let bi = 0; bi < BANDAS.length; bi++) for (let fi = 0; fi < FILTROS.length; fi++) {
    const cu = VAR[ei][vidx(bi, fi)];
    const vals = [];
    for (let k = 0; k < 22; k++) { const a = cu.dom[k]; if (a.n >= 200) vals.push(R(a)); }
    if (vals.length < 5) continue;
    const ord = [...vals].sort((a, b) => a - b);
    L(`  | ${BANDAS[bi].id} | ${FILTROS[fi].id} | ${num(R(cu.dom[0]))} | ${num(ord[0])} | ${num(ord.at(-1))} | **${num(ord.at(-1) - ord[0])}** | ${num(ord[ord.length >> 1])} |`);
  }
}

// ── ¿el plazo real que queda suelto mueve el ratio? ─────────────────────────
// Con el filtro de tercer viernes el plazo real sigue bailando (la rejilla de vencimientos es
// MENSUAL: no hay forma de tener plazo fijo Y todos los días). La pregunta es si ese baile
// residual mueve el dinero o no. Si no lo mueve, el filtro de tercer viernes basta.
L(`\n${"═".repeat(130)}`);
L("  ¿MUEVE EL DINERO EL PLAZO REAL QUE QUEDA SUELTO? — ratio por plazo real, en bandas de 5 días");
L(`${"═".repeat(130)}`);
L(`  Con el filtro de tercer viernes el plazo real sigue bailando: la rejilla de vencimientos es MENSUAL,`);
L(`  así que NO existe una regla que fije el plazo Y conserve todos los días. La pregunta es si ese baile`);
L(`  residual mueve el dinero. Cada casilla: ratio (n).`);
L(`  | envase | universo | ${Array.from({ length: 12 }, (_, i) => `${40 + i * 5}-${44 + i * 5}`).join(" | ")} |`);
L(`  |---|---|${Array.from({ length: 12 }, () => "---").join("|")}|`);
for (let ei = 0; ei < ENVASES.length; ei++) for (const [bi, fi, et] of [[3, 0, "libre · todos"], [3, 1, "libre · 3ºvie"], [0, 0, "±5 · todos"]]) {
  const cu = VAR[ei][vidx(bi, fi)];
  const fila = Array.from({ length: 12 }, (_, i) => {
    const a = cu.dteBin.get(i);
    return a && a.n >= 500 ? `${num(a.gan / a.per)} (${mil(a.n)})` : "n/d";
  });
  L(`  | ${ENVASES[ei].id} | ${et} | ${fila.join(" | ")} |`);
}

// ── n por día del mes (para no leer ratios de muestras diminutas) ────────────
L(`\n  n por día del mes — hace falta para no leer como señal un ratio de cuatro operaciones:`);
for (let ei = 0; ei < ENVASES.length; ei++) for (const bi of [0, 3]) {
  const cu = VAR[ei][vidx(bi, 0)];
  L(`  | ${etiqueta(ei, bi, 0)} | ${Array.from({ length: 22 }, (_, k) => mil(cu.dom[k].n)).join(" | ")} |`);
}

// ── AÑO A AÑO ───────────────────────────────────────────────────────────────
for (let ei = 0; ei < ENVASES.length; ei++) {
  L(`\n${"═".repeat(130)}`);
  L(`  AÑO A AÑO — RATIO del envase ${ENVASES[ei].id} vacío con el plazo fijado`);
  L(`${"═".repeat(130)}`);
  L(`  | banda | filtro | total | ${ANOS.join(" | ")} | años < 1.00 |`);
  L(`  |---|---|---|${ANOS.map(() => "---").join("|")}|---|`);
  for (let bi = 0; bi < BANDAS.length; bi++) for (let fi = 0; fi < FILTROS.length; fi++) {
    const cu = VAR[ei][vidx(bi, fi)];
    if (!cu.T.n) continue;
    let malos = 0, cuentan = 0;
    const fila = ANOS.map((y) => {
      const v = cu.anos.get(y);
      if (!v || v.n < 50) return "n/d";
      cuentan++; if (R(v) < 1) malos++;
      return num(R(v));
    });
    L(`  | ${BANDAS[bi].id} | ${FILTROS[fi].id} | **${num(R(cu.T))}** | ${fila.join(" | ")} | ${malos} de ${cuentan} |`);
  }
  L(`\n  n por año (envase ${ENVASES[ei].id}):`);
  L(`  | banda | filtro | ${ANOS.join(" | ")} |`);
  L(`  |---|---|${ANOS.map(() => "---").join("|")}|`);
  for (let bi = 0; bi < BANDAS.length; bi++) for (let fi = 0; fi < FILTROS.length; fi++) {
    const cu = VAR[ei][vidx(bi, fi)];
    if (!cu.T.n) continue;
    L(`  | ${BANDAS[bi].id} | ${FILTROS[fi].id} | ${ANOS.map((y) => mil(cu.anos.get(y)?.n ?? 0)).join(" | ")} |`);
  }
}

// ── TERCIOS ─────────────────────────────────────────────────────────────────
L(`\n${"═".repeat(130)}`);
L("  POR TERCIOS DEL PERÍODO — tres tercios, no dos mitades");
L(`${"═".repeat(130)}`);
const TERCIOS = [["2016", "2019", "2016-2019"], ["2020", "2022", "2020-2022"], ["2023", "2026", "2023-2026"]];
for (let ei = 0; ei < ENVASES.length; ei++) {
  L(`\n  Envase ${ENVASES[ei].id}:`);
  L(`  | banda | filtro | ${TERCIOS.map((t) => t[2]).join(" | ")} |`);
  L(`  |---|---|${TERCIOS.map(() => "---").join("|")}|`);
  for (let bi = 0; bi < BANDAS.length; bi++) for (let fi = 0; fi < FILTROS.length; fi++) {
    const cu = VAR[ei][vidx(bi, fi)];
    if (!cu.T.n) continue;
    const fila = TERCIOS.map(([a, b]) => {
      const s = acc();
      for (const [y, v] of cu.anos) if (y >= a && y <= b) { s.n += v.n; s.win += v.win; s.gan += v.gan; s.per += v.per; }
      return s.n ? `${num(R(s))} (n=${mil(s.n)})` : "n/d";
    });
    L(`  | ${BANDAS[bi].id} | ${FILTROS[fi].id} | ${fila.join(" | ")} |`);
  }
}

// ── LOS AÑOS DUROS ──────────────────────────────────────────────────────────
L(`\n${"═".repeat(130)}`);
L("  LOS AÑOS DUROS POR SEPARADO");
L(`${"═".repeat(130)}`);
L(`  | combinación | 2018 | 2020 | 2022 | 2025 | ratio SIN 2020 |`);
L(`  |---|---|---|---|---|---|`);
for (let ei = 0; ei < ENVASES.length; ei++) for (let bi = 0; bi < BANDAS.length; bi++) for (let fi = 0; fi < FILTROS.length; fi++) {
  const cu = VAR[ei][vidx(bi, fi)];
  if (!cu.T.n) continue;
  const s = acc();
  for (const [y, v] of cu.anos) { if (y === "2020") continue; s.n += v.n; s.win += v.win; s.gan += v.gan; s.per += v.per; }
  L(`  | ${etiqueta(ei, bi, fi)} | ${["2018", "2020", "2022", "2025"].map((y) => { const v = cu.anos.get(y); return v && v.n >= 50 ? `${num(R(v))} (n=${mil(v.n)})` : "n/d"; }).join(" | ")} | ${num(R(s))} (n=${mil(s.n)}) |`);
}

// ── CONCENTRACIÓN POR TICKER ────────────────────────────────────────────────
L(`\n${"═".repeat(130)}`);
L("  ¿DEPENDE DE POCOS TICKERS?");
L(`${"═".repeat(130)}`);
L(`  | combinación | tickers con ratio > 1 | tickers para la mitad del dinero ganado | mejores | peores |`);
L(`  |---|---|---|---|---|`);
for (let ei = 0; ei < ENVASES.length; ei++) for (let bi = 0; bi < BANDAS.length; bi++) for (let fi = 0; fi < FILTROS.length; fi++) {
  const cu = VAR[ei][vidx(bi, fi)];
  if (!cu.T.n) continue;
  const tks = [...cu.tks.entries()].map(([k, v]) => ({ k, v, r: R(v) })).sort((a, b) => b.v.gan - a.v.gan);
  const tot = tks.reduce((a, t) => a + t.v.gan, 0);
  let ac = 0, cuantos = 0;
  for (const t of tks) { ac += t.v.gan; cuantos++; if (ac >= tot / 2) break; }
  const porR = [...tks].sort((a, b) => b.r - a.r);
  L(`  | ${etiqueta(ei, bi, fi)} | ${tks.filter((t) => t.r > 1).length} de ${tks.length} | ${cuantos} | ${porR.slice(0, 3).map((t) => `${t.k} ${num(t.r)}`).join(" · ")} | ${porR.slice(-3).map((t) => `${t.k} ${num(t.r)}`).join(" · ")} |`);
}

// ── EL MAYOR BILLETE ────────────────────────────────────────────────────────
L(`\n${"═".repeat(130)}`);
L("  EL MAYOR BILLETE Y QUÉ PASA SIN ÉL");
L(`${"═".repeat(130)}`);
L(`  | combinación | mayor billete | quién | ratio quitando ESE evento |`);
L(`  |---|---|---|---|`);
for (let ei = 0; ei < ENVASES.length; ei++) for (const bi of [0, 3]) for (let fi = 0; fi < FILTROS.length; fi++) {
  const cu = VAR[ei][vidx(bi, fi)], m = cu.mayor;
  if (!m) continue;
  L(`  | ${etiqueta(ei, bi, fi)} | ${usd(m.d)} | ${m.sym} ${m.tipo} ${m.K} venc. ${m.exp}, entrada ${m.dia} | ${num((cu.T.gan - m.d) / cu.T.per)} |`);
}

// ── EL BARAJADO: tercer viernes contra montones de fechas al azar ───────────
L(`\n${"═".repeat(130)}`);
L("  EL BARAJADO — ¿el TERCER VIERNES es una elección buena o sólo una submuestra afortunada?");
L(`${"═".repeat(130)}`);
L(`  Filtrar a tercer viernes hace DOS cosas a la vez y hay que separarlas:`);
L(`    (1) DEJA DE OPERAR muchos días (los que no tienen un tercer viernes dentro de la banda) → efecto CALENDARIO`);
L(`    (2) en los días que quedan, compra OTRO contrato (el mensual en vez del semanal más cercano) → efecto CONTRATO`);
L(`  Se mide cada uno por separado. El azar reparte FECHAS enteras, no operaciones sueltas (los 28 tickers`);
L(`  de un mismo día suben y bajan juntos). 20 repartos, semilla fija, nunca Math.random.`);
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const medi = (v) => [...v].sort((a, b) => a - b)[v.length >> 1];
for (let ei = 0; ei < ENVASES.length; ei++) {
  for (let bi = 0; bi < BANDAS.length; bi++) {
    const todos = VAR[ei][vidx(bi, 0)], tv = VAR[ei][vidx(bi, 1)];
    if (!tv.T.n || !todos.T.n) continue;
    const fechasTV = new Set(tv.porFecha.keys());
    // (2) efecto CONTRATO: mismas fechas, distinto vencimiento
    const rest = { n: 0, gan: 0, per: 0 };
    for (const [f, a] of todos.porFecha) if (fechasTV.has(f)) { rest.n += a.n; rest.gan += a.gan; rest.per += a.per; }
    // (1) efecto CALENDARIO: esas fechas contra montones del mismo tamaño sacados al azar
    const todasF = [...todos.porFecha.values()];
    const m = fechasTV.size;
    const azar = [];
    for (let s = 0; s < 20; s++) {
      const rnd = mulberry32(2000 + s);
      const ord = todasF.map((v) => ({ v, k: rnd() })).sort((a, b) => a.k - b.k).slice(0, m);
      let g = 0, p = 0;
      for (const x of ord) { g += x.v.gan; p += x.v.per; }
      azar.push(g / p);
    }
    L(`\n  Envase ${ENVASES[ei].id}, banda ${BANDAS[bi].id}:`);
    L(`    todos los vencimientos, todas las fechas  : ratio ${num(R(todos.T))}  (n=${mil(todos.T.n)}, ${mil(todos.porFecha.size)} fechas)`);
    L(`    todos los vencimientos, SÓLO las fechas con tercer viernes en banda: ratio ${num(rest.gan / rest.per)}  (n=${mil(rest.n)}, ${mil(m)} fechas)  ← el efecto CALENDARIO`);
    L(`    tercer viernes                            : ratio ${num(R(tv.T))}  (n=${mil(tv.T.n)})  ← + el efecto CONTRATO`);
    L(`    horquilla: todos ${pct(todos.T.horq / todos.T.n)} · tercer viernes ${pct(tv.T.horq / tv.T.n)}`);
    L(`    montones de ${mil(m)} fechas al azar (20 repartos): de ${num(Math.min(...azar))} a ${num(Math.max(...azar))}, mediana ${num(medi(azar))}`);
    L(`    → repartos al azar que baten al tercer viernes: ${azar.filter((x) => x > R(tv.T)).length} de 20`);
  }
}

// ── DÓNDE ESTÁ EL EQUILIBRIO DE LA ANCHURA ──────────────────────────────────
L(`\n${"═".repeat(130)}`);
L("  EL EQUILIBRIO DE LA ANCHURA — muy estrecha pierde días, muy ancha vuelve a meter el confundido");
L(`${"═".repeat(130)}`);
L(`  | envase | banda | % días perdidos | ± del plazo real | recorrido del plazo entre días del mes | recorrido de la horquilla | RATIO |`);
L(`  |---|---|---|---|---|---|---|`);
for (let ei = 0; ei < ENVASES.length; ei++) for (let bi = 0; bi < BANDAS.length; bi++) {
  const cu = VAR[ei][vidx(bi, 0)];
  if (!cu.T.n) continue;
  const dtes = [], horqs = [];
  for (let k = 0; k < 22; k++) { const a = cu.dom[k]; if (a.n >= 200) { dtes.push(a.dte / a.n); horqs.push(a.horq / a.n); } }
  const perd = cu.diasSinBanda / (cu.diasSinBanda + cu.diasOperados);
  L(`  | ${ENVASES[ei].id} | ${BANDAS[bi].id === "libre" ? `libre (±${ENVASES[ei].libre})` : BANDAS[bi].id} | ${pct(perd)} | ${num(sdDte(cu.T), 1)} d | ${num(Math.max(...dtes) - Math.min(...dtes), 1)} d | ${pct(Math.max(...horqs) - Math.min(...horqs))} | **${num(R(cu.T))}** |`);
}

// ── EL NÚMERO QUE TIENE QUE SALIR DE AQUÍ ───────────────────────────────────
L(`\n${"═".repeat(130)}`);
L("  EL LISTÓN HONESTO CON EL PLAZO FIJADO — lo que viene después se compara contra ESTO");
L(`${"═".repeat(130)}`);
for (let ei = 0; ei < ENVASES.length; ei++) {
  const cu = VAR[ei][vidx(0, 0)];   // ±5, todos los vencimientos
  const li = VAR[ei][vidx(3, 0)];   // libre, todos
  const env = ENVASES[ei];
  L(`\n  ENVASE ${env.id} (${pct(env.dist)} fuera · ${env.dte} días · salir a los ${SALIDA} de bolsa), banda ${env.dte - 5}-${env.dte + 5} días, universo DIARIO:`);
  L(`      RATIO = ${num(R(cu.T))}   (con el plazo suelto daba ${num(R(li.T))})`);
  L(`      acierto ${pct(cu.T.win / cu.T.n)} · ganador medio ${usd(cu.T.gan / cu.T.win)} · perdedor medio ${usd(cu.T.per / (cu.T.n - cu.T.win))}`);
  L(`      n = ${mil(cu.T.n)} operaciones · ${mil(Math.round(cu.T.n / NANOS))} al año · horquilla ${pct(cu.T.horq / cu.T.n)} · plazo real ${num(cu.T.dte / cu.T.n, 1)} ± ${num(sdDte(cu.T), 1)} días`);
  L(`      días perdidos por no haber vencimiento en la banda: ${pct(cu.diasSinBanda / (cu.diasSinBanda + cu.diasOperados))}`);
  L(`      huecos descartados (falta la cadena de salida): ${mil(cu.huecos)}`);
}

// volcado para los encargos que vienen detrás
const salida = {};
for (let ei = 0; ei < ENVASES.length; ei++) for (let bi = 0; bi < BANDAS.length; bi++) for (let fi = 0; fi < FILTROS.length; fi++) {
  const cu = VAR[ei][vidx(bi, fi)];
  if (!cu.T.n) continue;
  salida[etiqueta(ei, bi, fi)] = {
    n: cu.T.n, ratio: R(cu.T), acierto: cu.T.win / cu.T.n,
    ganadorMedio: cu.T.gan / cu.T.win, perdedorMedio: cu.T.per / (cu.T.n - cu.T.win),
    opsAno: cu.T.n / NANOS, horquilla: cu.T.horq / cu.T.n,
    plazoReal: cu.T.dte / cu.T.n, sdPlazo: sdDte(cu.T),
    diasPerdidos: cu.diasSinBanda / (cu.diasSinBanda + cu.diasOperados), huecos: cu.huecos,
    anos: Object.fromEntries([...cu.anos].map(([y, v]) => [y, { n: v.n, ratio: R(v) }])),
  };
}
writeFileSync("scripts/v1-el-plazo-fijado.json", JSON.stringify(salida, null, 1));
L(`\n  (resumen volcado en scripts/v1-el-plazo-fijado.json)`);
L(`\n  tiempo total: ${Math.round((Date.now() - t0) / 1000)}s\n`);
