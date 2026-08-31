// Y4-B — LENTE 2 sobre "la curva del propio ticker": ¿ES SOLO 2020, O SOLO UNOS POCOS TICKERS?
//
// ═══ QUE MIDE Y POR QUE ═════════════════════════════════════════════════════════════════════
//
// El hallazgo y4 dice: comprando solo cuando el frente esta caro respecto al fondo (cociente
// 30/180, restandole al ticker su estacionalidad de mes, y quedandose con el 40% mas alto de su
// propia historia), el envase A pasa de 1.15 a 1.45 y el acierto de 18.3% a 22.3%.
//
// Aqui NO se busca una senal nueva. Se coge esa MISMA senal, ya fijada, y se le pregunta si el
// dinero viene de un solo ano o de un pu?ado de tickers. Se copia la pasada 1 de y4 tal cual
// (mismo spot por paridad en el vencimiento mas cercano, mismo envase, mismas reglas de huecos)
// y se cambia SOLO lo que se mide despues.
//
// LO QUE SE HACE, Y POR QUE ASI:
//
//  1. EL LISTON SIEMPRE AL LADO. Nunca se mira el ratio de la senal solo. Al lado va el envase
//     VACIO medido sobre EXACTAMENTE los mismos dias en que la senal esta viva (el "universo"),
//     y ademas el RESTO del universo (los dias que la senal descarta). Si en un ano la senal da
//     1.90 pero el envase vacio da 1.85 ese mismo ano, la senal no ha aportado nada ahi.
//
//  2. DENTRO DE CADA ANO. La comparacion ano a ano contra el universo entero mezcla dos cosas:
//     que el ano fuera bueno y que la senal eligiera bien. Comparar la senal contra el RESTO DEL
//     MISMO ANO separa las dos. Es la prueba que de verdad contesta "es solo 2020".
//
//  3. LA MEZCLA DE ANOS. Si la senal dispara mas en 2019-2020 que el universo, parte de su ratio
//     es simplemente "operar en el ano bueno". Se mide el reparto por ano de la senal contra el
//     del universo, y se calcula un LISTON REPESADO: el envase vacio con la MISMA mezcla de anos
//     que la senal. Esa es la comparacion honesta.
//
//  4. TICKERS. Cuantos hacen falta para la mitad del dinero ganado, quitando los 3 mejores, y
//     dejando fuera un ticker cada vez (lo peor que puede pasar). Y LO MISMO PARA EL LISTON: si
//     el envase vacio esta igual de concentrado, la concentracion no es un defecto de la senal.
//
//  5. EVENTOS vs TICKERS. En una estrategia convexa es NORMAL que pocos EVENTOS pongan el dinero
//     — es el dise?o. Lo que no vale es que un TICKER o un ANO lo sostengan todo. Se miden las
//     dos concentraciones por separado y siempre contra la del envase vacio.
//
//  6. EL BARAJADO, MUCHAS VECES. y4 lo probo con dos desplazamientos (7 y 12 meses). Un control
//     de dos tiradas no es un control. Aqui se corren doce desplazamientos fijos.
//
//  7. CALLS Y PUTS POR SEPARADO. y4 dice calls 2.09 y puts 0.92. Hay que ver si el envase vacio
//     ya esta partido asi de por si.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y4b-lente2-anos-y-tickers.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const APUESTA = 1000;
const ASK_MIN = 0.10;

const ENVASES = {
  A: { dist: 0.10, dte: 60, tolDte: 17, salida: 30, tolK: 0.50 },
  B: { dist: 0.05, dte: 90, tolDte: 25, salida: 30, tolK: 0.50 },
};
const TRAMOS = [["f", 30, 10], ["m", 90, 22], ["b", 180, 45]];
const COCIENTES = [["30/90", "f", "m"], ["30/180", "f", "b"], ["90/180", "m", "b"]];
const METODOS = ["todos", "propio", "residuo"];
const MIN_ANOS_MES = 2;
const NB = 5;
const MIN_POOL = 300;
const MIN_PROPIO = 12;

// LA SENAL YA FIJADA por y4 (no se busca nada nuevo aqui)
const SEN = { nom: "30/180", met: "residuo", qs: [3, 4] };     // el "corte ancho": 40% mas alto
const SEN_ESTRECHA = { nom: "30/180", met: "residuo", qs: [4] }; // el quinto monton solo

// doce barajados fijos (nada de Math.random), en meses de desplazamiento por ticker
const DESPL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13];

const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "—");
const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
const num = (n) => Math.round(n).toLocaleString("en-US");
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const cal = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");

// ── indice de dias por ticker ────────────────────────────────────────────────
const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
let TICKERS = [...diasPorSim.keys()].sort();
if (process.env.SOLO) TICKERS = TICKERS.filter((t) => process.env.SOLO.split(",").includes(t));
const TOTDIAS = [...diasPorSim.values()].reduce((a, v) => a + v.length, 0);
console.log(`\n## ${TICKERS.length} tickers · ${num(TOTDIAS)} dias de cadena`);
console.log(`## NO se buscan celdas nuevas: la senal viene fijada de y4 (${SEN.nom} / ${SEN.met} / montones 4+5).`);
console.log(`## Puertas nuevas abiertas aqui: 0 de busqueda. Controles: ${DESPL.length} barajados.\n`);

// ── cache de cadenas ─────────────────────────────────────────────────────────
const cache = new Map();
let lecturas = 0, noExiste = 0;
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  if (cache.has(k)) { const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  let v = null;
  if (existsSync(f)) { try { v = JSON.parse(readFileSync(f, "utf8")); lecturas++; } catch { v = null; } }
  else noExiste++;
  if (cache.size >= 100) cache.delete(cache.keys().next().value);
  cache.set(k, v);
  return v;
}

/** EL SPOT por paridad put-call, SOLO en el vencimiento mas cercano. */
function spotOk(c, hoy) {
  let exp = null, md = Infinity;
  for (const e of Object.keys(c)) { const d = cal(hoy, e); if (d < 1) continue; if (d < md) { md = d; exp = e; } }
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
function sigmaDe(g, S, dte) {
  let mejor = null, dm = Infinity;
  for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const K = Number(cl.slice(0, -2));
    const p = g[`${K}|P`];
    if (!p) continue;
    if (!(ba[1] > 0) || !(p[1] > 0)) continue;
    const d = Math.abs(K - S);
    if (d < dm) { dm = d; mejor = { K, c: (ba[0] + ba[1]) / 2, p: (p[0] + p[1]) / 2 }; }
  }
  if (!mejor) return null;
  if (dm > S * 0.05) return null;
  const cuna = mejor.c + mejor.p;
  if (!(cuna > 0)) return null;
  return (cuna / S) / Math.sqrt(dte / 365);
}
function elegir(c, S, hoy, env, tipo) {
  let exp = null, dd = Infinity;
  for (const e of Object.keys(c)) {
    const d = cal(hoy, e);
    if (d < 1) continue;
    const x = Math.abs(d - env.dte);
    if (x < dd) { dd = x; exp = e; }
  }
  if (!exp || dd > env.tolDte) return null;
  const objetivo = tipo === "C" ? S * (1 + env.dist) : S * (1 - env.dist);
  let K = null, ba = null, kd = Infinity;
  for (const [clave, v] of Object.entries(c[exp])) {
    if (clave.slice(-1) !== tipo) continue;
    if (!(v[1] >= ASK_MIN)) continue;
    const k = Number(clave.slice(0, -2));
    const d = Math.abs(k - objetivo);
    if (d < kd) { kd = d; K = k; ba = v; }
  }
  if (K == null) return null;
  const distReal = tipo === "C" ? K / S - 1 : 1 - K / S;
  if (Math.abs(distReal - env.dist) > env.dist * env.tolK) return null;
  return { exp, K, clave: `${K}|${tipo}`, bid: ba[0], ask: ba[1] };
}

// ════════════════════════════════════════════════════════════════════════════
// PASADA 1 — identica a y4
// ════════════════════════════════════════════════════════════════════════════
const obs = [], ops = [];
let entradas = 0, sinSpot = 0, sinCadenaEntrada = 0, sinTramo = 0, sinContrato = 0, huecos = 0, huecoGrupo = 0, trasVto = 0;
const t0 = Date.now();
for (const sym of TICKERS) {
  const ds = diasPorSim.get(sym);
  const vistos = new Set();
  for (let i = 0; i < ds.length; i++) {
    const dia = ds[i];
    const mes = dia.slice(0, 6);
    if (vistos.has(mes)) continue;
    vistos.add(mes);
    const ano = dia.slice(0, 4);
    const c = cadena(sym, dia);
    if (!c) { sinCadenaEntrada++; continue; }
    const S = spotOk(c, dia);
    if (!(S > 0)) { sinSpot++; continue; }
    entradas++;
    const sig = {};
    for (const [nom, obj, tol] of TRAMOS) {
      let exp = null, dd = Infinity;
      for (const e of Object.keys(c)) {
        const d = cal(dia, e);
        if (d < 1) continue;
        const x = Math.abs(d - obj);
        if (x < dd) { dd = x; exp = e; }
      }
      if (!exp || dd > tol) continue;
      const s = sigmaDe(c[exp], S, cal(dia, exp));
      if (s > 0) sig[nom] = s;
    }
    const coc = {};
    for (const [nom, a, b] of COCIENTES) if (sig[a] > 0 && sig[b] > 0) coc[nom] = sig[a] / sig[b];
    if (!Object.keys(coc).length) { sinTramo++; continue; }
    const idxObs = obs.length;
    obs.push({ sym, dia, ano, coc });
    const dSal = ds[i + 30] ?? null;
    if (!dSal) { huecos += 4; continue; }
    const cs = cadena(sym, dSal);
    for (const [en, env] of Object.entries(ENVASES)) {
      for (const tipo of ["C", "P"]) {
        const ct = elegir(c, S, dia, env, tipo);
        if (!ct) { sinContrato++; continue; }
        if (dSal >= ct.exp) { trasVto++; continue; }
        if (!cs) { huecos++; continue; }
        const g2 = cs[ct.exp];
        if (!g2) { huecos++; huecoGrupo++; continue; }
        const bid = g2[ct.clave]?.[0] ?? 0;
        ops.push({ sym, dia, ano, env: en, tipo, idxObs, ret: (bid - ct.ask) / ct.ask, coste: ct.ask / S, sinValor: bid <= 0 ? 1 : 0 });
      }
    }
  }
  cache.clear();
  process.stderr.write(`\r   ${sym.padEnd(6)} · ${entradas} entradas · ${num(ops.length)} operaciones · ${Math.round((Date.now() - t0) / 1000)}s     `);
}
process.stderr.write("\n");

// ════════════════════════════════════════════════════════════════════════════
// PASADA 2 — montones con ventana que crece y termina el dia ANTERIOR (identica a y4)
// ════════════════════════════════════════════════════════════════════════════
const orden = [...obs.keys()].sort((a, b) => (obs[a].dia < obs[b].dia ? -1 : obs[a].dia > obs[b].dia ? 1 : (obs[a].sym < obs[b].sym ? -1 : 1)));
for (const o of obs) o.b = {};
function insertar(arr, x) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } arr.splice(lo, 0, x); }
function rango(arr, x) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } return lo / arr.length; }
const pool = new Map(), propio = new Map(), resid = new Map(), mesHist = new Map();
for (const [nom] of COCIENTES) pool.set(nom, []);
let k = 0;
while (k < orden.length) {
  const dia = obs[orden[k]].dia;
  let j = k;
  while (j < orden.length && obs[orden[j]].dia === dia) j++;
  for (let q = k; q < j; q++) {
    const o = obs[orden[q]];
    const MM = o.dia.slice(4, 6);
    for (const [nom] of COCIENTES) {
      const x = o.coc[nom];
      if (!(x > 0)) continue;
      const P = pool.get(nom), kp = `${o.sym}|${nom}`, R = propio.get(kp) ?? [];
      const bs = {};
      bs.todos = P.length >= MIN_POOL ? Math.min(NB - 1, Math.floor(rango(P, x) * NB)) : null;
      bs.propio = R.length >= MIN_PROPIO ? Math.min(NB - 1, Math.floor(rango(R, x) * NB)) : null;
      bs.residuo = null;
      const mh = mesHist.get(`${o.sym}|${nom}|${MM}`);
      if (mh && mh.n >= MIN_ANOS_MES) {
        const r = x - mh.suma / mh.n;
        o.res = o.res ?? {}; o.res[nom] = r;
        const RR = resid.get(kp) ?? [];
        if (RR.length >= MIN_PROPIO) bs.residuo = Math.min(NB - 1, Math.floor(rango(RR, r) * NB));
      }
      o.b[nom] = bs;
    }
  }
  for (let q = k; q < j; q++) {
    const o = obs[orden[q]];
    const MM = o.dia.slice(4, 6);
    for (const [nom] of COCIENTES) {
      const x = o.coc[nom];
      if (!(x > 0)) continue;
      insertar(pool.get(nom), x);
      const kp = `${o.sym}|${nom}`;
      if (!propio.has(kp)) propio.set(kp, []);
      insertar(propio.get(kp), x);
      const km = `${o.sym}|${nom}|${MM}`;
      if (!mesHist.has(km)) mesHist.set(km, { suma: 0, n: 0 });
      const mh = mesHist.get(km); mh.suma += x; mh.n++;
      if (o.res && o.res[nom] !== undefined) {
        if (!resid.has(kp)) resid.set(kp, []);
        insertar(resid.get(kp), o.res[nom]);
      }
    }
  }
  k = j;
}
// barajados: el monton que le tocaba a la entrada de hace N meses del MISMO ticker
const porTicker = new Map();
for (const idx of orden) { const o = obs[idx]; if (!porTicker.has(o.sym)) porTicker.set(o.sym, []); porTicker.get(o.sym).push(idx); }
for (const lista of porTicker.values()) {
  for (let i = 0; i < lista.length; i++) {
    const o = obs[lista[i]];
    o.baraja = {};
    for (const d of DESPL) o.baraja[d] = i - d >= 0 ? obs[lista[i - d]].b : null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// HERRAMIENTAS DE CUENTA
// ════════════════════════════════════════════════════════════════════════════
const acc = () => ({ n: 0, win: 0, gan: 0, per: 0 });
function suma(a, d) { a.n++; if (d > 0) { a.win++; a.gan += d; } else a.per += -d; }
const ratio = (a) => (a.per > 0 ? a.gan / a.per : (a.gan > 0 ? Infinity : NaN));
const acierto = (a) => (a.n ? a.win / a.n : NaN);

/** Las tres poblaciones que se comparan SIEMPRE juntas:
 *   SENAL    = operaciones del envase cuyo monton cae en los elegidos
 *   RESTO    = operaciones del MISMO universo que la senal descarta
 *   UNIVERSO = las dos juntas (= el "liston justo" de y4)  */
function poblar(en, sen, filtro = () => true, fuente = "b") {
  const S = [], R = [];
  for (const o of ops) {
    if (o.env !== en) continue;
    if (!filtro(o)) continue;
    const ob = obs[o.idxObs];
    const src = fuente === "b" ? ob.b : (ob.baraja?.[fuente] ?? null);
    const bs = src ? src[sen.nom] : null;
    if (!bs || bs[sen.met] == null) continue;             // fuera del universo de la senal
    (sen.qs.includes(bs[sen.met]) ? S : R).push(o);
  }
  return { S, R };
}
function cuenta(lista) { const a = acc(); for (const o of lista) suma(a, APUESTA * o.ret); return a; }
function linea(nombre, S, R) {
  const aS = cuenta(S), aR = cuenta(R), aU = cuenta([...S, ...R]);
  return { nombre, S: aS, R: aR, U: aU, exceso: ratio(aS) - ratio(aU) };
}
function fila(l) {
  return `  | ${l.nombre.padEnd(24)} | ${num(l.S.n).padStart(5)} | ${pct(acierto(l.S)).padStart(6)} | **${f2(ratio(l.S))}** | ${num(l.U.n).padStart(5)} | ${pct(acierto(l.U)).padStart(6)} | ${f2(ratio(l.U))} | ${num(l.R.n).padStart(5)} | ${f2(ratio(l.R))} | ${Number.isFinite(l.exceso) ? (l.exceso >= 0 ? "+" : "") + l.exceso.toFixed(2) : "—"} |`;
}
const CAB = `  | corte | senal n | acierta | RATIO | universo n | acierta | RATIO | resto n | RATIO | senal−universo |`;
const SEP = `  |---|---|---|---|---|---|---|---|---|---|`;

// ════════════════════════════════════════════════════════════════════════════
// SANIDAD
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"=".repeat(118)}`);
console.log("  SANIDAD — la pasada 1 tiene que dar exactamente lo mismo que y4");
console.log(`${"=".repeat(118)}`);
console.log(`  dias de entrada usados : ${num(entradas)} · sin cadena ${num(sinCadenaEntrada)} · sin spot ${num(sinSpot)} · sin los tramos ${num(sinTramo)}`);
console.log(`  observaciones de curva : ${num(obs.length)} · operaciones medidas: ${num(ops.length)}`);
console.log(`  HUECOS descartados     : ${num(huecos)} (${pct(huecos / (huecos + ops.length))}) — ${num(huecoGrupo)} por faltar el vencimiento entero`);
console.log(`  salida tras vencimiento: ${num(trasVto)} · sin contrato que encaje: ${num(sinContrato)}`);
console.log(`  ficheros leidos ${num(lecturas)} · no encontrados ${num(noExiste)}`);
for (const en of ["A", "B"]) {
  const l = ops.filter((o) => o.env === en), a = cuenta(l);
  let coste = 0, sv = 0;
  for (const o of l) { coste += o.coste; sv += o.sinValor; }
  console.log(`  ENVASE ${en} VACIO (todo 2016-2026): n=${num(a.n)} · acierta ${pct(acierto(a))} · RATIO ${f2(ratio(a))} · ` +
    `ganador medio ${usd(a.gan / a.win)} · perdedor medio ${usd(a.per / (a.n - a.win))} · prima ${pct(coste / l.length)} de la accion · vence sin valor ${pct(sv / l.length)}`);
}

// ════════════════════════════════════════════════════════════════════════════
// 1 · EL CUADRO GENERAL — senal vs universo vs resto, en los dos envases
// ════════════════════════════════════════════════════════════════════════════
for (const en of ["A", "B"]) {
  const { S, R } = poblar(en, SEN);
  const { S: S2, R: R2 } = poblar(en, SEN_ESTRECHA);
  console.log(`\n${"=".repeat(118)}`);
  console.log(`  1 · EL CUADRO GENERAL — ENVASE ${en}`);
  console.log(`${"=".repeat(118)}`);
  console.log(CAB); console.log(SEP);
  console.log(fila(linea("corte ancho (4+5)", S, R)));
  console.log(fila(linea("corte estrecho (solo 5)", S2, R2)));
}

// ════════════════════════════════════════════════════════════════════════════
// 2 · ¿ES SOLO 2020?  — tres formas de quitarlo, y siempre con el liston al lado
// ════════════════════════════════════════════════════════════════════════════
for (const en of ["A", "B"]) {
  console.log(`\n${"=".repeat(118)}`);
  console.log(`  2 · ¿ES SOLO 2020? — ENVASE ${en} (corte ancho). El liston va al lado en cada corte.`);
  console.log(`${"=".repeat(118)}`);
  console.log(CAB); console.log(SEP);
  const cortes = [
    ["todo", () => true],
    ["sin feb-may 2020", (o) => !(o.dia.slice(0, 6) >= "202002" && o.dia.slice(0, 6) <= "202005")],
    ["sin 2020 entero", (o) => o.ano !== "2020"],
    ["sin 2019 ni 2020", (o) => o.ano !== "2020" && o.ano !== "2019"],
    ["solo 2021-2026", (o) => Number(o.ano) >= 2021],
  ];
  for (const [nombre, f] of cortes) { const { S, R } = poblar(en, SEN, f); console.log(fila(linea(nombre, S, R))); }
}

// ════════════════════════════════════════════════════════════════════════════
// 3 · ANO A ANO, CON EL RESTO DEL MISMO ANO AL LADO
//     Esta es la prueba que de verdad contesta "es solo 2020": dentro de cada ano, ¿la senal
//     bate a lo que la senal DESCARTA ese mismo ano?
// ════════════════════════════════════════════════════════════════════════════
const ANOS = [...new Set(ops.map((o) => o.ano))].sort();
for (const en of ["A"]) {
  console.log(`\n${"=".repeat(118)}`);
  console.log(`  3 · ANO A ANO — ENVASE ${en}. "resto" = los dias del mismo ano que la senal NO elige.`);
  console.log(`${"=".repeat(118)}`);
  console.log(CAB); console.log(SEP);
  let gana = 0, cuentan = 0;
  for (const a of ANOS) {
    const { S, R } = poblar(en, SEN, (o) => o.ano === a);
    if (S.length + R.length === 0) continue;
    const l = linea(a, S, R);
    console.log(fila(l));
    if (S.length >= 20 && R.length >= 20) { cuentan++; if (ratio(l.S) > ratio(l.R)) gana++; }
  }
  console.log(`  → la senal bate al resto de su propio ano en ${gana} de ${cuentan} anos con muestra (20+ a cada lado)`);
}

// ════════════════════════════════════════════════════════════════════════════
// 4 · LA MEZCLA DE ANOS — ¿dispara mas en los anos buenos?
//     Y el LISTON REPESADO: el universo con la MISMA mezcla de anos que la senal.
// ════════════════════════════════════════════════════════════════════════════
{
  const en = "A";
  const { S, R } = poblar(en, SEN);
  const U = [...S, ...R];
  const nS = new Map(), nU = new Map();
  for (const o of S) nS.set(o.ano, (nS.get(o.ano) ?? 0) + 1);
  for (const o of U) nU.set(o.ano, (nU.get(o.ano) ?? 0) + 1);
  console.log(`\n${"=".repeat(118)}`);
  console.log("  4 · LA MEZCLA DE ANOS — ¿la senal se concentra en los anos buenos?");
  console.log(`${"=".repeat(118)}`);
  console.log(`  | ano | % de las operaciones de la SENAL | % de las del UNIVERSO | dispara de mas/de menos |`);
  console.log(`  |---|---|---|---|`);
  for (const a of ANOS) {
    if (!nU.get(a)) continue;
    const pS = (nS.get(a) ?? 0) / S.length, pU = nU.get(a) / U.length;
    console.log(`  | ${a} | ${pct(pS)} | ${pct(pU)} | ${(pS - pU >= 0 ? "+" : "") + (100 * (pS - pU)).toFixed(1)} pts |`);
  }
  // liston repesado: por cada ano, el ratio del universo de ese ano, con el peso de la senal
  let ganW = 0, perW = 0;
  for (const a of ANOS) {
    const nsa = nS.get(a) ?? 0;
    if (!nsa) continue;
    const ua = cuenta(U.filter((o) => o.ano === a));
    if (!ua.n) continue;
    ganW += (ua.gan / ua.n) * nsa;
    perW += (ua.per / ua.n) * nsa;
  }
  const aS = cuenta(S), aU = cuenta(U);
  console.log(`\n  RATIO de la senal ......................................... ${f2(ratio(aS))}`);
  console.log(`  RATIO del universo (el liston justo de y4) ................ ${f2(ratio(aU))}`);
  console.log(`  RATIO del universo CON LA MISMA MEZCLA DE ANOS que la senal ${f2(ganW / perW)}   <-- el liston honesto`);
  console.log(`  → lo que aporta la senal de verdad, ya descontada la mezcla de anos: ${((ratio(aS) - ganW / perW) >= 0 ? "+" : "") + (ratio(aS) - ganW / perW).toFixed(2)}`);
}

// ════════════════════════════════════════════════════════════════════════════
// 5 · TICKERS — concentracion, quitar los 3 mejores, y dejar fuera uno cada vez.
//     SIEMPRE con la misma cuenta hecha sobre el universo, para saber si la concentracion
//     es de la SENAL o es de como esta hecho el envase.
// ════════════════════════════════════════════════════════════════════════════
function porTk(lista) {
  const m = new Map();
  for (const o of lista) { if (!m.has(o.sym)) m.set(o.sym, acc()); suma(m.get(o.sym), APUESTA * o.ret); }
  return m;
}
function mitad(m, total) {
  const l = [...m.values()].map((v) => v.gan).sort((a, b) => b - a);
  let ac = 0, c = 0;
  for (const g of l) { if (g <= 0) break; ac += g; c++; if (ac >= total / 2) break; }
  return c;
}
function sinTop(lista, m, cuantos) {
  const top = [...m.entries()].sort((a, b) => b[1].gan - a[1].gan).slice(0, cuantos).map((x) => x[0]);
  return { a: cuenta(lista.filter((o) => !top.includes(o.sym))), top };
}
function peorFuera(lista, m) {
  let peor = null;
  for (const t of m.keys()) {
    const a = cuenta(lista.filter((o) => o.sym !== t));
    if (!peor || ratio(a) < peor.r) peor = { t, r: ratio(a), n: a.n };
  }
  return peor;
}
for (const en of ["A", "B"]) {
  const { S, R } = poblar(en, SEN);
  const U = [...S, ...R];
  console.log(`\n${"=".repeat(118)}`);
  console.log(`  5 · CONCENTRACION POR TICKER — ENVASE ${en}`);
  console.log(`${"=".repeat(118)}`);
  for (const [et, lista] of [["SENAL", S], ["UNIVERSO (el liston)", U]]) {
    const m = porTk(lista), tot = cuenta(lista);
    const l3 = sinTop(lista, m, 3), l1 = sinTop(lista, m, 1), l5 = sinTop(lista, m, 5);
    const pf = peorFuera(lista, m);
    const conR1 = [...m.values()].filter((v) => ratio(v) > 1).length;
    console.log(`\n  ${et}: ${m.size} tickers · ${conR1} con ratio > 1 · RATIO ${f2(ratio(tot))} (n=${num(tot.n)})`);
    console.log(`    tickers que hacen falta para juntar la MITAD del dinero ganado: ${mitad(m, tot.gan)} de ${m.size}`);
    console.log(`    quitando el mejor (${l1.top.join(",")}): ${f2(ratio(l1.a))} (n=${num(l1.a.n)})`);
    console.log(`    quitando los TRES mejores (${l3.top.join(",")}): ${f2(ratio(l3.a))} (n=${num(l3.a.n)})`);
    console.log(`    quitando los CINCO mejores (${l5.top.join(",")}): ${f2(ratio(l5.a))} (n=${num(l5.a.n)})`);
    console.log(`    dejando fuera un ticker cada vez, lo PEOR que sale: ${f2(pf.r)} (quitando ${pf.t})`);
  }
  // el examen honesto: quitar los 3 mejores de la SENAL, y comparar contra el universo SIN ESOS MISMOS 3
  const mS = porTk(S);
  const top3 = [...mS.entries()].sort((a, b) => b[1].gan - a[1].gan).slice(0, 3).map((x) => x[0]);
  const sSin = cuenta(S.filter((o) => !top3.includes(o.sym))), uSin = cuenta(U.filter((o) => !top3.includes(o.sym)));
  console.log(`\n  EL EXAMEN HONESTO — quitados los 3 mejores de la senal (${top3.join(", ")}) de LOS DOS LADOS:`);
  console.log(`    senal ${f2(ratio(sSin))} (acierta ${pct(acierto(sSin))}, n=${num(sSin.n)}) · universo ${f2(ratio(uSin))} (acierta ${pct(acierto(uSin))}, n=${num(uSin.n)}) · diferencia ${((ratio(sSin) - ratio(uSin)) >= 0 ? "+" : "") + (ratio(sSin) - ratio(uSin)).toFixed(2)}`);
  // dentro de cada ticker: ¿la senal bate al resto DEL MISMO ticker?
  let g = 0, c = 0;
  for (const t of mS.keys()) {
    const s = cuenta(S.filter((o) => o.sym === t)), r = cuenta(R.filter((o) => o.sym === t));
    if (s.n >= 15 && r.n >= 15) { c++; if (ratio(s) > ratio(r)) g++; }
  }
  console.log(`    dentro de cada ticker, la senal bate a lo que ese mismo ticker descarta en ${g} de ${c} tickers con muestra (15+ a cada lado)`);
}

// ════════════════════════════════════════════════════════════════════════════
// 6 · EVENTOS — la cola es el DISENO, pero hay que verla y compararla con el envase vacio
// ════════════════════════════════════════════════════════════════════════════
{
  const en = "A";
  const { S, R } = poblar(en, SEN);
  const U = [...S, ...R];
  console.log(`\n${"=".repeat(118)}`);
  console.log("  6 · CONCENTRACION POR EVENTO — ¿la senal esta MAS colgada de la cola que el envase vacio?");
  console.log(`${"=".repeat(118)}`);
  console.log(`  | poblacion | n | RATIO | top 1 evento | top 5 | top 10 | eventos para la MITAD del dinero |`);
  console.log(`  |---|---|---|---|---|---|---|`);
  for (const [et, lista] of [["SENAL", S], ["UNIVERSO", U], ["RESTO", R]]) {
    const a = cuenta(lista);
    const gs = lista.map((o) => APUESTA * o.ret).filter((d) => d > 0).sort((x, y) => y - x);
    const cum = (k2) => gs.slice(0, k2).reduce((x, y) => x + y, 0) / a.gan;
    let ac = 0, c = 0;
    for (const g of gs) { ac += g; c++; if (ac >= a.gan / 2) break; }
    console.log(`  | ${et} | ${num(a.n)} | ${f2(ratio(a))} | ${pct(cum(1))} | ${pct(cum(5))} | ${pct(cum(10))} | ${c} de ${gs.length} ganadoras (${pct(c / a.n)} de las operaciones) |`);
  }
  // los diez billetes mas grandes de la senal
  const top = [...S].sort((a, b) => b.ret - a.ret).slice(0, 10);
  console.log(`\n  Los 10 billetes mas grandes de la senal:`);
  for (const o of top) console.log(`    ${o.dia} ${o.sym.padEnd(5)} ${o.tipo}  ${usd(APUESTA * o.ret).padStart(9)}`);
  const distintos = new Set(top.map((o) => o.sym)).size, anosTop = new Set(top.map((o) => o.ano)).size;
  console.log(`    → ${distintos} tickers distintos y ${anosTop} anos distintos entre los 10 mayores`);
}

// ════════════════════════════════════════════════════════════════════════════
// 7 · DEJANDO FUERA UN ANO CADA VEZ
// ════════════════════════════════════════════════════════════════════════════
{
  const en = "A";
  console.log(`\n${"=".repeat(118)}`);
  console.log("  7 · DEJANDO FUERA UN ANO CADA VEZ — lo peor que puede pasar");
  console.log(`${"=".repeat(118)}`);
  console.log(`  | ano fuera | senal n | RATIO senal | RATIO universo | diferencia |`);
  console.log(`  |---|---|---|---|---|`);
  let peor = null;
  for (const a of ANOS) {
    const { S, R } = poblar(en, SEN, (o) => o.ano !== a);
    if (!S.length) continue;
    const aS = cuenta(S), aU = cuenta([...S, ...R]);
    if (!peor || ratio(aS) < peor.r) peor = { a, r: ratio(aS) };
    console.log(`  | ${a} | ${num(aS.n)} | ${f2(ratio(aS))} | ${f2(ratio(aU))} | ${((ratio(aS) - ratio(aU)) >= 0 ? "+" : "") + (ratio(aS) - ratio(aU)).toFixed(2)} |`);
  }
  console.log(`  → lo PEOR: quitando ${peor.a} el ratio baja a ${f2(peor.r)}`);
}

// ════════════════════════════════════════════════════════════════════════════
// 8 · CALLS Y PUTS — y4 dice calls 2.09 / puts 0.92. ¿El envase vacio ya viene partido asi?
// ════════════════════════════════════════════════════════════════════════════
{
  console.log(`\n${"=".repeat(118)}`);
  console.log("  8 · CALLS Y PUTS POR SEPARADO — con el liston al lado");
  console.log(`${"=".repeat(118)}`);
  console.log(CAB); console.log(SEP);
  for (const en of ["A", "B"]) for (const tipo of ["C", "P"]) {
    const { S, R } = poblar(en, SEN, (o) => o.tipo === tipo);
    console.log(fila(linea(`envase ${en} · ${tipo === "C" ? "calls" : "puts"}`, S, R)));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 9 · EL BARAJADO, DOCE VECES
// ════════════════════════════════════════════════════════════════════════════
{
  const en = "A";
  const real = cuenta(poblar(en, SEN).S);
  console.log(`\n${"=".repeat(118)}`);
  console.log("  9 · EL BARAJADO — la misma senal con el mes equivocado del mismo ticker, 12 desplazamientos");
  console.log(`${"=".repeat(118)}`);
  console.log(`  | desplazamiento | n | acierta | RATIO |`);
  console.log(`  |---|---|---|---|`);
  console.log(`  | DE VERDAD | ${num(real.n)} | ${pct(acierto(real))} | **${f2(ratio(real))}** |`);
  const rs = [];
  for (const d of DESPL) {
    const a = cuenta(poblar(en, SEN, () => true, d).S);
    rs.push(ratio(a));
    console.log(`  | ${d} meses | ${num(a.n)} | ${pct(acierto(a))} | ${f2(ratio(a))} |`);
  }
  const ok = rs.filter((r) => r >= ratio(real)).length;
  rs.sort((a, b) => a - b);
  console.log(`  → de los ${rs.length} barajados, ${ok} llegan o pasan al de verdad. Peor ${f2(rs[0])} · mediana ${f2(rs[Math.floor(rs.length / 2)])} · mejor ${f2(rs[rs.length - 1])}`);
}

// ════════════════════════════════════════════════════════════════════════════
// 10 · LOS OTROS OCHO CORTES ANCHOS, TAMBIEN CON SU LISTON JUSTO
//      y4 solo saco el liston justo del ganador. Si "residuo" gana solo porque vive en un trozo
//      de historia mejor, se ve aqui: su liston justo tambien seria mas alto.
// ════════════════════════════════════════════════════════════════════════════
{
  console.log(`\n${"=".repeat(118)}`);
  console.log("  10 · LOS NUEVE CORTES ANCHOS CON SU PROPIO LISTON JUSTO (envase A)");
  console.log(`${"=".repeat(118)}`);
  console.log(`  | cociente | cortes | senal n | RATIO senal | RATIO universo | diferencia | acierta senal | acierta universo |`);
  console.log(`  |---|---|---|---|---|---|---|---|`);
  for (const [nom] of COCIENTES) for (const met of METODOS) {
    const { S, R } = poblar("A", { nom, met, qs: [3, 4] });
    const aS = cuenta(S), aU = cuenta([...S, ...R]);
    console.log(`  | ${nom} | ${met} | ${num(aS.n)} | **${f2(ratio(aS))}** | ${f2(ratio(aU))} | ${((ratio(aS) - ratio(aU)) >= 0 ? "+" : "") + (ratio(aS) - ratio(aU)).toFixed(2)} | ${pct(acierto(aS))} | ${pct(acierto(aU))} |`);
  }
}

console.log(`\n  minutos: ${((Date.now() - t0) / 60000).toFixed(1)}`);
console.log(`${"=".repeat(118)}\n`);

// ── volcado ─────────────────────────────────────────────────────────────────
{
  const { S, R } = poblar("A", SEN);
  const U = [...S, ...R];
  writeFileSync("scripts/y4b-lente2-anos-y-tickers.json", JSON.stringify({
    senal: { n: cuenta(S).n, ratio: ratio(cuenta(S)), acierto: acierto(cuenta(S)) },
    universo: { n: cuenta(U).n, ratio: ratio(cuenta(U)), acierto: acierto(cuenta(U)) },
  }, null, 1), "utf8");
}
