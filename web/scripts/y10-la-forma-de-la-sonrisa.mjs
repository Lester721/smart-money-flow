// LA FORMA DE LA SONRISA — ¿qué punto de la curva de strikes está sistemáticamente más barato?
//
// ═══ QUÉ MIDE Y POR QUÉ ═════════════════════════════════════════════════════════════════════
//
// El envase que ya está fijado compra "10% fuera del dinero, 60 días de plazo, vender a los 30
// días de bolsa". Ese 10% se eligió BARRIENDO EL RESULTADO: se probaron muchas distancias y se
// quedó la que mejor salió. Nadie miró nunca el PRECIO.
//
// Esta familia pregunta otra cosa, y es una pregunta de precio puro, no de predicción:
// dentro de la MISMA cadena y el MISMO día, ¿hay puntos de la curva de strikes que están
// sistemáticamente más baratos que otros? Y sobre todo: ¿esa forma CAMBIA de un día a otro?
// Porque si unos días la curva está empinada y otros plana, comprar en los días planos las de
// lejos sería más barato DE VERDAD, y eso sí es una señal utilizable.
//
// ── Cómo se mide "caro" o "barato" sin usar ningún modelo de precios ────────────────────────
// Black-Scholes está prohibido en este repo, así que no hay volatilidad implícita. Se usan tres
// varas, las tres construidas sólo con números reales:
//
//   1. PRIMA / SUBYACENTE          — el precio desnudo, en % de la acción. Es la foto cruda.
//   2. PRIMA / MOVIMIENTO REAL     — la prima dividida por un movimiento típico de la acción a
//                                    ese plazo, medido con la desviación de los retornos PASADOS
//                                    de la propia acción (ventana que termina el día ANTERIOR).
//                                    Contesta literalmente "cuánto cuesta en relación a lo que
//                                    la acción se mueve de verdad".
//   3. PRIMA / PRIMA AL DINERO     — el precio de la de lejos dividido por el precio de la que
//                                    está pegada al dinero, MISMO día, MISMA cadena, MISMO
//                                    vencimiento. Es la sonrisa vista en dinero, y tiene la
//                                    ventaja de que se anula por completo el nivel de volatilidad
//                                    del día: sólo queda la FORMA.
//
//   Además, PRIMA / VALOR EMPÍRICO: lo que habría valido esa opción si el pasado del propio
//   ticker se repitiera (media de los pagos max(r−d,0) sobre los retornos pasados). Es una
//   valoración sin modelo — es sólo contar lo que pasó — y dice cuántas veces su "precio justo
//   histórico" se está pagando.
//
// ── El aviso del enunciado, respetado ──────────────────────────────────────────────────────
// Al alejarse del dinero la horquilla se dispara. TODAS las varas se calculan con el ASK, que es
// lo que de verdad se paga. Así el descuento que luego te cobra el dealer NO se cuela como
// "está barata". La horquilla se imprime aparte, por distancia, para verlo.
//
// ── LA SEÑAL QUE SE PRUEBA ─────────────────────────────────────────────────────────────────
// En vez de comprar SIEMPRE al 10%, cada día se compra la distancia que ESE DÍA esté más barata
// de lo normal PARA ESE TICKER: se compara la vara de hoy contra la mediana de las veces
// anteriores del mismo ticker, misma distancia, mismo lado (sólo pasado, nunca toda la historia),
// y se compra el mínimo. El listón es la distancia fija.
//
// ── LAS REGLAS DE LA CASA ──────────────────────────────────────────────────────────────────
//   · se COMPRA al ASK y se VENDE al BID. Nunca punto medio.
//   · ningún modelo de precios.
//   · un hueco no es un cero: si falta la cadena del día de salida, la operación se DESCARTA y
//     se cuenta aparte. Si la cadena existe y el contrato no tiene puja, vale 0 y eso es real.
//   · toda ventana (mediana, desviación) termina el día ANTERIOR al de la compra.
//   · el spot sale de la paridad put-call SÓLO EN EL VENCIMIENTO MÁS CERCANO (la versión
//     corregida de z1-la-rejilla-completa.mjs; la de esquina-barata-10anos.mjs infla el precio).
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y10-la-forma-de-la-sonrisa.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CIERRES = "scripts/cache-theta/cierres";
const SPOTCACHE = "scripts/cache-theta/y10-spots.json";

// ── parámetros del envase (FIJADOS, no se tocan) ────────────────────────────
const DISTS = [0.02, 0.05, 0.10, 0.15, 0.20];
const ENVASES = [
  { nom: "A", dte: 60, salida: 30, fija: 0.10 },
  { nom: "B", dte: 90, salida: 30, fija: 0.05 },
];
const TOLK = 0.50;          // cuánto puede apartarse el strike real de la distancia pedida
const ASKMIN = 0.10;        // mismo umbral que el listón publicado
const APUESTA = 1000;
const MIN_PASADO = 250;     // días de cadena de historia mínima para medir el movimiento real
const MIN_HIST = 6;         // observaciones previas mínimas para saber qué es "lo normal"
const DESPL = 13;           // desplazamiento FIJO del barajado (13 entradas mensuales)

const tolDte = (d) => Math.max(6, Math.round(d * 0.28));

// ── formato: punto para decimales, coma para miles ──────────────────────────
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : "—");
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : "—");
const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "—");
const num = (n) => Math.round(n).toLocaleString("en-US");
const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const mediana = (v) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };

const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);

// ── índice de días por ticker ───────────────────────────────────────────────
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

console.log(`\n${"═".repeat(100)}`);
console.log("  LA FORMA DE LA SONRISA — qué strike está sistemáticamente más barato");
console.log(`${"═".repeat(100)}`);
console.log(`  ${TICKERS.length} tickers · ${num(TOTDIAS)} días de cadena`);

// ── caché LRU de cadenas ────────────────────────────────────────────────────
const cache = new Map();
const MAXC = 260;
let lecturas = 0, noHallados = 0;
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  if (cache.has(k)) { const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  let v = null;
  if (existsSync(f)) { try { v = JSON.parse(readFileSync(f, "utf8")); lecturas++; } catch { v = null; } }
  else noHallados++;
  if (cache.size >= MAXC) cache.delete(cache.keys().next().value);
  cache.set(k, v);
  return v;
}

/** El spot ARREGLADO: paridad put-call en el vencimiento MÁS CERCANO, no en toda la cadena. */
function spotOk(c, hoy) {
  let exp = null, md = Infinity;
  for (const e of Object.keys(c)) { const d = dteDe(hoy, e); if (d < 1) continue; if (d < md) { md = d; exp = e; } }
  if (!exp) return null;
  const g = c[exp];
  let K = null, dm = Infinity;
  for (const cl of Object.keys(g)) {
    if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2)); const p = g[`${k}|P`]; if (!p) continue;
    const ba = g[cl];
    const d = Math.abs((ba[0] + ba[1]) / 2 - (p[0] + p[1]) / 2);
    if (d < dm) { dm = d; K = k; }
  }
  if (K == null) return null;
  const C = g[`${K}|C`], P = g[`${K}|P`];
  const s = K + (C[0] + C[1]) / 2 - (P[0] + P[1]) / 2;
  return s > 0 ? s : null;
}

// ════════════════════════════════════════════════════════════════════════════
// PASO 1 — serie diaria del subyacente, deducida de la propia cadena.
// Hace falta para saber "cuánto se mueve la acción de verdad" en 2016-2020, donde el fichero de
// cierres reales no llega. Se cachea a disco porque cuesta un minuto.
// ════════════════════════════════════════════════════════════════════════════
let SPOTS = {};
if (existsSync(SPOTCACHE) && !process.env.RECALC) {
  SPOTS = JSON.parse(readFileSync(SPOTCACHE, "utf8"));
  console.log(`  serie de spot: leída de caché (${Object.keys(SPOTS).length} tickers)`);
}
const FALTAN = TICKERS.filter((t) => !SPOTS[t]);
if (FALTAN.length) {
  const t0 = Date.now();
  for (const sym of FALTAN) {
    const s = {};
    for (const d of diasPorSim.get(sym)) {
      const c = cadena(sym, d);
      if (!c) continue;
      const v = spotOk(c, d);
      if (v) s[d] = Math.round(v * 1000) / 1000;
    }
    SPOTS[sym] = s;
    cache.clear();
    process.stderr.write(`\r   spot · ${sym} · ${Math.round((Date.now() - t0) / 1000)}s     `);
  }
  process.stderr.write("\n");
  writeFileSync(SPOTCACHE, JSON.stringify(SPOTS));
  console.log(`  serie de spot: ${FALTAN.length} tickers construidos en ${Math.round((Date.now() - t0) / 1000)}s y cacheados`);
}

// ── SANIDAD del spot contra los cierres reales de disco ─────────────────────
{
  const errs = [];
  let comparados = 0;
  for (const sym of TICKERS) {
    const p = `${CIERRES}/${sym}.json`;
    if (!existsSync(p)) continue;
    let cl; try { cl = JSON.parse(readFileSync(p, "utf8")); } catch { continue; }
    for (const [d, v] of Object.entries(cl)) {
      const s = SPOTS[sym]?.[d];
      if (s > 0 && v > 0) { errs.push(Math.abs(s / v - 1)); comparados++; }
    }
  }
  errs.sort((a, b) => a - b);
  console.log(`  sanidad del spot: ${num(comparados)} días comparados contra cierres reales · error mediano ${pct(errs[errs.length >> 1])} · peor 10% ${pct(errs[Math.floor(errs.length * 0.9)])}`);
}

// ════════════════════════════════════════════════════════════════════════════
// PASO 2 — la curva, entrada a entrada
// ════════════════════════════════════════════════════════════════════════════

const acc = () => ({ n: 0, win: 0, gan: 0, per: 0 });
function suma(a, d) { a.n++; if (d > 0) { a.win++; a.gan += d; } else a.per += -d; }
const ratio = (a) => (a.per > 0 ? a.gan / a.per : NaN);

// acumuladores descriptivos: clave `env|tipo|idxDist`
const desc = new Map();
function D(k) {
  let o = desc.get(k);
  if (!o) { o = { n: 0, cS: [], cMov: [], cAtm: [], cEmp: [], horq: [], distReal: [], empCero: 0, porAno: new Map() }; desc.set(k, o); }
  return o;
}

// operaciones: cada arm guarda filas {ticker, ano, dia, tipo, d, pnl, salida, coste}
const ARMS = new Map();
function arm(k) { let a = ARMS.get(k); if (!a) { a = []; ARMS.set(k, a); } return a; }

let entradas = 0, sinSpot = 0, sinPasado = 0, huecos = 0, ops = 0, sinContrato = 0, grupoAusente = 0;
let COMB = 0;   // combinaciones medidas, contadas de verdad

const t1 = Date.now();
for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym);
  const spotSym = SPOTS[sym] || {};
  const idxDia = new Map(dias.map((d, i) => [d, i]));
  const vistos = new Set();

  // historia por (envase, tipo, distancia) — sólo pasado, se rellena según avanza
  const hist = new Map();
  const H = (k) => { let v = hist.get(k); if (!v) { v = []; hist.set(k, v); } return v; };
  // cola de elecciones pasadas para el barajado (desplazamiento fijo)
  const colaElec = new Map();

  for (let i = 0; i < dias.length; i++) {
    const dia = dias[i];
    const mes = dia.slice(0, 6);
    if (vistos.has(mes)) continue;         // una entrada al mes por ticker (igual que el listón)
    vistos.add(mes);
    const ano = dia.slice(0, 4);

    const c = cadena(sym, dia);
    if (!c) continue;
    const S = spotOk(c, dia);
    if (!S) { sinSpot++; continue; }
    entradas++;

    // ── retornos PASADOS de la propia acción (ventana que acaba el día anterior) ──
    if (i < MIN_PASADO) { sinPasado++; continue; }
    const serie = [];
    for (let j = Math.max(0, i - 520); j < i; j++) { const v = spotSym[dias[j]]; if (v > 0) serie.push(v); }
    if (serie.length < MIN_PASADO) { sinPasado++; continue; }

    for (const env of ENVASES) {
      // ── vencimiento elegido ──
      let exp = null, md = Infinity, dteReal = 0;
      for (const e of Object.keys(c)) {
        const dt = dteDe(dia, e);
        if (dt < 1) continue;
        const x = Math.abs(dt - env.dte);
        if (x < md) { md = x; exp = e; dteReal = dt; }
      }
      if (!exp || md > tolDte(env.dte)) continue;

      // horizonte en días de bolsa que le queda de vida a la opción
      const h = Math.max(5, Math.round(dteReal * 252 / 365));
      const rets = [];
      for (let j = 0; j + h < serie.length; j++) rets.push(serie[j + h] / serie[j] - 1);
      if (rets.length < 60) { continue; }
      const sig = sd(rets);
      if (!(sig > 0)) continue;

      // ── día de salida (30 días de bolsa) ──
      let ds = dias[i + env.salida] ?? null;
      let trunc = 0;
      if (!ds) { huecos++; continue; }
      if (ds >= exp) { ds = exp; trunc = 1; }
      const cs = cadena(sym, ds);
      if (!cs) { huecos++; continue; }
      const gsal = cs[exp];
      if (!gsal) { huecos++; grupoAusente++; continue; }

      const g = c[exp];

      for (const tipo of ["C", "P"]) {
        // ── ancla al dinero (misma cadena, mismo vencimiento, mismo lado) ──
        let atm = null, adm = Infinity;
        for (const cl of Object.keys(g)) {
          if (cl.slice(-1) !== tipo) continue;
          const K = Number(cl.slice(0, -2));
          const ba = g[cl];
          if (!(ba[1] > 0)) continue;
          const dd = Math.abs(K / S - 1);
          if (dd < adm && dd <= 0.03) { adm = dd; atm = ba[1]; }
        }

        // ── mejor strike por distancia ──
        const cand = DISTS.map(() => null);
        const obj = DISTS.map((d) => (tipo === "C" ? S * (1 + d) : S * (1 - d)));
        for (const cl of Object.keys(g)) {
          if (cl.slice(-1) !== tipo) continue;
          const K = Number(cl.slice(0, -2));
          const ba = g[cl];
          const ask = ba[1];
          if (!(ask >= ASKMIN)) continue;
          for (let a = 0; a < DISTS.length; a++) {
            const dd = Math.abs(K - obj[a]);
            const cur = cand[a];
            if (!cur || dd < cur.dd) cand[a] = { dd, K, bid: ba[0], ask, clave: cl };
          }
        }

        // ── varas por distancia + la operación real ──
        const filas = [];
        for (let a = 0; a < DISTS.length; a++) {
          const ct = cand[a];
          if (!ct) { sinContrato++; filas.push(null); continue; }
          const distReal = tipo === "C" ? ct.K / S - 1 : 1 - ct.K / S;
          if (Math.abs(distReal - DISTS[a]) > DISTS[a] * TOLK) { sinContrato++; filas.push(null); continue; }

          // valor empírico: lo que habría valido si el pasado se repitiera (sin modelo, contando)
          let pago = 0;
          for (const r of rets) pago += tipo === "C" ? Math.max(r - distReal, 0) : Math.max(-r - distReal, 0);
          const emp = (S * pago) / rets.length;

          const salida = gsal[ct.clave]?.[0] ?? 0;   // cadena y vencimiento existen: sin puja = 0 real
          const ret = (salida - ct.ask) / ct.ask;

          filas.push({
            a, distReal, ask: ct.ask, bid: ct.bid, K: ct.K, clave: ct.clave,
            cS: ct.ask / S,
            cMov: ct.ask / (S * sig),            // prima en unidades de un movimiento típico
            cAtm: atm > 0 ? ct.ask / atm : NaN,  // la sonrisa vista en dinero
            cEmp: emp > 0 ? ct.ask / emp : NaN,  // veces su precio justo histórico
            empCero: !(emp > 0),
            horq: (ct.ask - ct.bid) / ct.ask,
            salida, ret, pnl: APUESTA * ret, trunc,
          });
        }

        // ── descriptivo ──
        for (const fi of filas) {
          if (!fi) continue;
          const k = `${env.nom}|${tipo}|${fi.a}`;
          const o = D(k);
          o.n++; o.cS.push(fi.cS); o.cMov.push(fi.cMov); o.horq.push(fi.horq); o.distReal.push(fi.distReal);
          if (Number.isFinite(fi.cAtm)) o.cAtm.push(fi.cAtm);
          if (fi.empCero) o.empCero++; else o.cEmp.push(fi.cEmp);
          if (!o.porAno.has(ano)) o.porAno.set(ano, []);
          o.porAno.get(ano).push(fi.cAtm);
        }

        // ── z de baratura: hoy contra lo normal de ESTE ticker (sólo pasado) ──
        const zMov = filas.map((fi, a) => {
          if (!fi) return NaN;
          const hs = H(`${env.nom}|${tipo}|${a}|mov`);
          return hs.length >= MIN_HIST ? fi.cMov / mediana(hs) : NaN;
        });
        const zAtm = filas.map((fi, a) => {
          if (!fi || !Number.isFinite(fi.cAtm)) return NaN;
          const hs = H(`${env.nom}|${tipo}|${a}|atm`);
          return hs.length >= MIN_HIST ? fi.cAtm / mediana(hs) : NaN;
        });

        const iFija = DISTS.indexOf(env.fija);
        const okFija = !!filas[iFija];

        const argmin = (z) => {
          let b = -1, bv = Infinity;
          for (let a = 0; a < z.length; a++) if (Number.isFinite(z[a]) && z[a] < bv) { bv = z[a]; b = a; }
          return b;
        };
        const disponibles = zMov.filter(Number.isFinite).length;
        const elecMov = disponibles >= 3 ? argmin(zMov) : -1;
        const elecAtm = zAtm.filter(Number.isFinite).length >= 3 ? argmin(zAtm) : -1;
        // variante sin historia: el punto más barato HOY en veces su precio justo histórico
        const elecEmp = (() => {
          let b = -1, bv = Infinity;
          for (let a = 0; a < filas.length; a++) { const fi = filas[a]; if (fi && Number.isFinite(fi.cEmp) && fi.cEmp < bv) { bv = fi.cEmp; b = a; } }
          return filas.filter(Boolean).length >= 3 ? b : -1;
        })();

        // barajado: la elección que se hizo DESPL entradas atrás, aplicada hoy
        const ck = `${env.nom}|${tipo}`;
        if (!colaElec.has(ck)) colaElec.set(ck, []);
        const cola = colaElec.get(ck);
        const elecBaraj = cola.length >= DESPL ? cola[cola.length - DESPL] : -1;
        cola.push(elecMov);
        // barajado DEL FILTRO: el permiso de comprar que se dio DESPL entradas atrás, usado hoy.
        // Si esto ya da lo mismo, lo que manda es CUÁNDO se opera y no el precio de hoy.
        const fk = `F|${env.nom}|${tipo}`;
        if (!colaElec.has(fk)) colaElec.set(fk, []);
        const colaF = colaElec.get(fk);
        const permisoBaraj = colaF.length >= DESPL ? colaF[colaF.length - DESPL] : false;
        colaF.push(elecEmp >= 0 && filas[elecEmp] && filas[elecEmp].cEmp < 1.00);
        // barajado DE LA ELECCIÓN de punto barato (control correcto del brazo EMP)
        const ek = `E|${env.nom}|${tipo}`;
        if (!colaElec.has(ek)) colaElec.set(ek, []);
        const colaE = colaElec.get(ek);
        const elecEmpBaraj = colaE.length >= DESPL ? colaE[colaE.length - DESPL] : -1;
        colaE.push(elecEmp);

        // ── PUERTA COMÚN: todos los brazos operan exactamente los mismos días, o ninguno.
        //    Si un brazo pudiera operar días que otro no, la comparación no sería del mismo mercado.
        const puerta = okFija && elecMov >= 0 && elecAtm >= 0 && elecEmp >= 0;

        const anota = (nomArm, idx) => {
          if (!puerta || idx < 0 || !filas[idx]) return;
          const fi = filas[idx];
          arm(`${env.nom}|${nomArm}`).push({ ticker: sym, ano, dia, tipo, d: DISTS[idx], distReal: fi.distReal, pnl: fi.pnl, salida: fi.salida, coste: fi.cS, horq: fi.horq, ask: fi.ask });
          ops++;
        };
        anota("FIJA", iFija);
        anota("MOV", elecMov);
        anota("ATM", elecAtm);
        anota("EMP", elecEmp);
        anota("BARAJ", elecBaraj);
        // ── el filtro: además de elegir el punto más barato, NO comprar si ni siquiera ese
        //    está por debajo de su precio justo histórico. Reduce la frecuencia a cambio de
        //    no pagar de más. Se prueban tres listones.
        if (elecEmp >= 0 && filas[elecEmp]) {
          const v = filas[elecEmp].cEmp;
          if (v < 1.00) anota("F100", elecEmp);
          if (v < 0.80) anota("F080", elecEmp);
          if (v < 0.60) anota("F060", elecEmp);
        }
        // ── DESCOMPOSICIÓN honesta: ¿el mérito es ELEGIR el punto, o simplemente NO COMPRAR
        //    cuando está caro? Este brazo aplica el MISMO filtro a la distancia FIJA de siempre.
        //    Si éste ya llega solo, entonces lo que manda es el filtro (y ése es el terreno de
        //    otra familia que corre en paralelo), no la forma de la sonrisa.
        if (filas[iFija] && Number.isFinite(filas[iFija].cEmp) && filas[iFija].cEmp < 1.00) anota("FIJA_F", iFija);
        if (permisoBaraj) anota("F100_BAR", elecEmp);
        anota("EMP_BAR", elecEmpBaraj);
        // cada distancia, por separado, sobre la misma muestra (para ver la forma en resultado)
        for (let a = 0; a < DISTS.length; a++) anota(`SOLO${a}`, a);

        // ── la historia se actualiza DESPUÉS de decidir ──
        for (let a = 0; a < filas.length; a++) {
          const fi = filas[a];
          if (!fi) continue;
          H(`${env.nom}|${tipo}|${a}|mov`).push(fi.cMov);
          if (Number.isFinite(fi.cAtm)) H(`${env.nom}|${tipo}|${a}|atm`).push(fi.cAtm);
        }
      }
    }
  }
  cache.clear();
  process.stderr.write(`\r   ${sym} · ${num(entradas)} entradas · ${num(ops)} operaciones · ${Math.round((Date.now() - t1) / 1000)}s     `);
}
process.stderr.write("\n");

COMB = ENVASES.length * (DISTS.length * 2 /* descriptivo por lado */ + 11 /* brazos */);

// ════════════════════════════════════════════════════════════════════════════
// SANIDAD
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(100)}`);
console.log("  SANIDAD");
console.log(`${"═".repeat(100)}`);
console.log(`  entradas candidatas (una al mes por ticker) : ${num(entradas)}`);
console.log(`  descartadas por no poder deducir el spot     : ${num(sinSpot)}`);
console.log(`  descartadas por no tener 250 días de historia previa : ${num(sinPasado)}`);
console.log(`  HUECOS (falta la cadena del día de salida, o el vencimiento entero): ${num(huecos)} — de ellos ${num(grupoAusente)} por faltar el vencimiento`);
console.log(`  combinaciones (distancia × lado) sin contrato que encaje: ${num(sinContrato)}`);
console.log(`  operaciones anotadas en total: ${num(ops)}`);
console.log(`  ficheros de cadena leídos: ${num(lecturas)} · no encontrados: ${num(noHallados)}`);
console.log(`  COMBINACIONES MEDIDAS: ${COMB}`);

// ════════════════════════════════════════════════════════════════════════════
// LA FORMA DE LA SONRISA
// ════════════════════════════════════════════════════════════════════════════
for (const env of ENVASES) {
  console.log(`\n${"═".repeat(100)}`);
  console.log(`  ENVASE ${env.nom} — vencimiento ~${env.dte} días · la curva de precio por distancia`);
  console.log(`${"═".repeat(100)}`);
  console.log(`  ${"lado".padEnd(6)}${"pedida".padStart(8)}${"real".padStart(8)}${"n".padStart(8)}${"prima/acción".padStart(14)}${"prima/movim.".padStart(14)}${"prima/al dinero".padStart(17)}${"veces justo".padStart(13)}${"horquilla".padStart(11)}${"nunca pagó".padStart(12)}`);
  for (const tipo of ["C", "P"]) {
    for (let a = 0; a < DISTS.length; a++) {
      const o = desc.get(`${env.nom}|${tipo}|${a}`);
      if (!o || !o.n) continue;
      console.log(`  ${(tipo === "C" ? "call" : "put").padEnd(6)}${pct(DISTS[a]).padStart(8)}${pct(media(o.distReal)).padStart(8)}${num(o.n).padStart(8)}${pct(media(o.cS)).padStart(14)}${f3(media(o.cMov)).padStart(14)}${f3(media(o.cAtm)).padStart(17)}${f2(mediana(o.cEmp)).padStart(13)}${pct(media(o.horq)).padStart(11)}${pct(o.empCero / o.n).padStart(12)}`);
    }
  }
  console.log(`\n  · "prima/movimiento" = prima ÷ (acción × movimiento típico a ese plazo, medido con el pasado).`);
  console.log(`  · "prima/al dinero"  = prima ÷ prima de la que está pegada al dinero, MISMO día y vencimiento. Es la sonrisa en dinero.`);
  console.log(`  · "veces justo"      = MEDIANA de prima ÷ lo que habría valido si el pasado del ticker se repitiera. 1.00 = precio justo histórico.`);
  console.log(`  · "nunca pagó"       = % de días en que el pasado del ticker NUNCA llegó tan lejos (el precio justo histórico es cero).`);
}

// ── ¿cambia la forma con el tiempo? ─────────────────────────────────────────
console.log(`\n${"═".repeat(100)}`);
console.log("  ¿CAMBIA LA FORMA CON EL TIEMPO? — sonrisa en dinero (prima/al dinero) al 15% fuera, por año");
console.log(`${"═".repeat(100)}`);
{
  const anos = [...new Set([...desc.values()].flatMap((o) => [...o.porAno.keys()]))].sort();
  const a15 = DISTS.indexOf(0.15);
  console.log(`  ${"año".padEnd(7)}${"call A".padStart(10)}${"put A".padStart(10)}${"call B".padStart(10)}${"put B".padStart(10)}`);
  for (const y of anos) {
    const cel = (env, tipo) => {
      const o = desc.get(`${env}|${tipo}|${a15}`);
      const v = o?.porAno.get(y)?.filter(Number.isFinite) ?? [];
      return v.length ? f3(media(v)) : "—";
    };
    console.log(`  ${y.padEnd(7)}${cel("A", "C").padStart(10)}${cel("A", "P").padStart(10)}${cel("B", "C").padStart(10)}${cel("B", "P").padStart(10)}`);
  }
  // dispersión día a día dentro de un mismo año
  const o = desc.get(`A|C|${a15}`);
  if (o) {
    const v = o.cAtm.filter(Number.isFinite).sort((a, b) => a - b);
    console.log(`\n  Reparto día a día de esa misma cifra (call A, 15%): más bajo 10% = ${f3(v[Math.floor(v.length * 0.1)])} · mediana = ${f3(v[v.length >> 1])} · más alto 10% = ${f3(v[Math.floor(v.length * 0.9)])}`);
    console.log(`  Si el reparto es ancho, hay días de curva PLANA y días de curva EMPINADA: eso es lo que la señal intenta cobrar.`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// RESULTADO EN DINERO
// ════════════════════════════════════════════════════════════════════════════
function resumen(filas) {
  const a = acc();
  let sinValor = 0, sumCoste = 0, sumHorq = 0, sumDist = 0;
  const anos = new Map(), tks = new Map();
  for (const f of filas) {
    suma(a, f.pnl);
    if (f.salida === 0) sinValor++;
    sumCoste += f.coste; sumHorq += f.horq; sumDist += f.distReal;
    if (!anos.has(f.ano)) anos.set(f.ano, acc());
    suma(anos.get(f.ano), f.pnl);
    if (!tks.has(f.ticker)) tks.set(f.ticker, acc());
    suma(tks.get(f.ticker), f.pnl);
  }
  const ganMedio = a.win ? a.gan / a.win : NaN;
  const perMedio = a.n - a.win ? a.per / (a.n - a.win) : NaN;
  // tickers que hacen falta para juntar la mitad del dinero ganado
  const gs = [...tks.values()].map((x) => x.gan).sort((x, y) => y - x);
  let acu = 0, kt = 0;
  for (const g of gs) { if (acu >= a.gan / 2) break; acu += g; kt++; }
  const anosMalos = [...anos.values()].filter((x) => ratio(x) < 1 || !Number.isFinite(ratio(x))).length;
  return { a, r: ratio(a), acierto: a.win / a.n, ganMedio, perMedio, sinValor: sinValor / a.n,
           coste: sumCoste / a.n, horq: sumHorq / a.n, dist: sumDist / a.n, anos, tks, kt, anosMalos, nAnos: anos.size };
}

const ARMNOM = {
  FIJA: "distancia FIJA (el listón)",
  MOV: "la más barata de lo normal (prima/movimiento)",
  ATM: "la más barata de lo normal (sonrisa en dinero)",
  EMP: "la más barata HOY en veces su precio justo",
  BARAJ: "BARAJADO (la elección de 13 entradas antes)",
  F100: "la más barata + sólo si está bajo su precio justo",
  F080: "la más barata + sólo si paga menos del 0.80",
  F060: "la más barata + sólo si paga menos del 0.60",
  FIJA_F: "distancia FIJA + el mismo filtro (descomposición)",
  F100_BAR: "BARAJADO DEL FILTRO (permiso de 13 entradas antes)",
  EMP_BAR: "BARAJADO de la elección barata (13 entradas antes)",
};
const BRAZOS = ["FIJA", "MOV", "ATM", "EMP", "BARAJ", "F100", "F080", "F060", "FIJA_F", "F100_BAR", "EMP_BAR"];

const RES = new Map();
for (const env of ENVASES) {
  console.log(`\n${"═".repeat(100)}`);
  console.log(`  ENVASE ${env.nom} — ${pct(env.fija)} fuera · ${env.dte} días · salir a los ${env.salida} de bolsa`);
  console.log(`${"═".repeat(100)}`);
  console.log(`  ${"brazo".padEnd(46)}${"n".padStart(8)}${"ratio".padStart(8)}${"acierto".padStart(9)}${"ganador".padStart(10)}${"perdedor".padStart(10)}${"dist.".padStart(8)}${"a cero".padStart(8)}${"años<1".padStart(8)}${"tk mitad".padStart(10)}`);
  for (const k of BRAZOS) {
    const filas = ARMS.get(`${env.nom}|${k}`);
    if (!filas || !filas.length) { console.log(`  ${ARMNOM[k].padEnd(46)}${"sin datos".padStart(8)}`); continue; }
    const R = resumen(filas);
    RES.set(`${env.nom}|${k}`, R);
    console.log(`  ${ARMNOM[k].padEnd(46)}${num(R.a.n).padStart(8)}${f2(R.r).padStart(8)}${pct(R.acierto).padStart(9)}${usd(R.ganMedio).padStart(10)}${usd(R.perMedio).padStart(10)}${pct(R.dist).padStart(8)}${pct(R.sinValor).padStart(8)}${(R.anosMalos + "/" + R.nAnos).padStart(8)}${num(R.kt).padStart(10)}`);
  }
  console.log(`\n  Cada distancia SOLA, sobre exactamente la misma muestra:`);
  console.log(`  ${"distancia".padEnd(46)}${"n".padStart(8)}${"ratio".padStart(8)}${"acierto".padStart(9)}${"ganador".padStart(10)}${"perdedor".padStart(10)}${"coste".padStart(8)}${"horq.".padStart(8)}${"a cero".padStart(8)}`);
  for (let a = 0; a < DISTS.length; a++) {
    const filas = ARMS.get(`${env.nom}|SOLO${a}`);
    if (!filas || !filas.length) continue;
    const R = resumen(filas);
    RES.set(`${env.nom}|SOLO${a}`, R);
    console.log(`  ${(pct(DISTS[a]) + " fuera del dinero").padEnd(46)}${num(R.a.n).padStart(8)}${f2(R.r).padStart(8)}${pct(R.acierto).padStart(9)}${usd(R.ganMedio).padStart(10)}${usd(R.perMedio).padStart(10)}${pct(R.coste).padStart(8)}${pct(R.horq).padStart(8)}${pct(R.sinValor).padStart(8)}`);
  }

  // calls vs puts por brazo
  console.log(`\n  Calls contra puts:`);
  console.log(`  ${"brazo".padEnd(46)}${"ratio call".padStart(12)}${"n call".padStart(9)}${"ratio put".padStart(12)}${"n put".padStart(9)}`);
  for (const k of BRAZOS) {
    const filas = ARMS.get(`${env.nom}|${k}`);
    if (!filas) continue;
    const rc = resumen(filas.filter((f) => f.tipo === "C"));
    const rp = resumen(filas.filter((f) => f.tipo === "P"));
    console.log(`  ${ARMNOM[k].padEnd(46)}${f2(rc.r).padStart(12)}${num(rc.a.n).padStart(9)}${f2(rp.r).padStart(12)}${num(rp.a.n).padStart(9)}`);
  }

  // año a año
  console.log(`\n  Año a año (ratio):`);
  const anos = [...new Set([...(ARMS.get(`${env.nom}|FIJA`) || [])].map((f) => f.ano))].sort();
  console.log(`  ${"brazo".padEnd(46)}${anos.map((y) => y.slice(2).padStart(7)).join("")}`);
  for (const k of BRAZOS) {
    const R = RES.get(`${env.nom}|${k}`);
    if (!R) continue;
    console.log(`  ${ARMNOM[k].padEnd(46)}${anos.map((y) => { const x = R.anos.get(y); return (x ? f2(ratio(x)) : "—").padStart(7); }).join("")}`);
  }

  // operaciones al año
  console.log(`
  Operaciones al año, tickers distintos, y sólo calls:`);
  for (const k of BRAZOS) {
    const R = RES.get(`${env.nom}|${k}`);
    if (!R) continue;
    const filas = ARMS.get(`${env.nom}|${k}`);
    const rc = resumen(filas.filter((f) => f.tipo === "C"));
    console.log(`    ${ARMNOM[k].padEnd(48)}${num(R.a.n / 9.6).padStart(5)}/año · ${num(R.tks.size).padStart(3)} tickers · sólo calls: ratio ${f2(rc.r)} acierto ${pct(rc.acierto)} y ${num(rc.a.n / 9.6)}/año`);
  }
  const rf = RES.get(`${env.nom}|FIJA`), rm = RES.get(`${env.nom}|MOV`);
  if (rf) console.log(`\n  Operaciones al año: fija ${num(rf.a.n / rf.nAnos)} · señal ${rm ? num(rm.a.n / rm.nAnos) : "—"} (${rf.nAnos} años de muestra)`);
}

// ── crisis: 2018, 2020, 2022, 2025 por separado, y 2020 sin feb-mayo ─────────
console.log(`\n${"═".repeat(100)}`);
console.log("  LOS AÑOS QUE HAY QUE AGUANTAR — ratio en cada uno por separado");
console.log(`${"═".repeat(100)}`);
console.log(`  ${"brazo".padEnd(46)}${"2018".padStart(9)}${"2020".padStart(9)}${"2022".padStart(9)}${"2025".padStart(9)}${"sin 2020".padStart(11)}`);
for (const env of ENVASES) for (const k of BRAZOS) {
  const filas = ARMS.get(`${env.nom}|${k}`);
  if (!filas || !filas.length) continue;
  const cel = (y) => { const R = resumen(filas.filter((f) => f.ano === y)); return R.a.n ? f2(R.r) : "—"; };
  const sin2020 = resumen(filas.filter((f) => !(f.dia >= "20200201" && f.dia <= "20200531")));
  console.log(`  ${(env.nom + " · " + ARMNOM[k]).padEnd(46)}${cel("2018").padStart(9)}${cel("2020").padStart(9)}${cel("2022").padStart(9)}${cel("2025").padStart(9)}${f2(sin2020.r).padStart(11)}`);
}

// ── ¿el filtro elige DÍAS o elige TICKERS? ──────────────────────────────────
// Si el permiso de comprar cayera repartido por igual entre tickers, sería una señal de fecha.
// Si unos tickers pasan casi siempre y otros casi nunca, es un selector de NOMBRES disfrazado.
console.log(`
${"═".repeat(100)}`);
console.log("  ¿EL FILTRO ELIGE DÍAS O ELIGE NOMBRES?");
console.log(`${"═".repeat(100)}`);
for (const env of ENVASES) {
  const base = ARMS.get(`${env.nom}|EMP`) || [];
  const pasa = ARMS.get(`${env.nom}|F100`) || [];
  const cb = new Map(), cp = new Map();
  for (const f of base) cb.set(f.ticker, (cb.get(f.ticker) || 0) + 1);
  for (const f of pasa) cp.set(f.ticker, (cp.get(f.ticker) || 0) + 1);
  const tasas = [...cb.entries()].map(([t, n]) => [t, (cp.get(t) || 0) / n]).sort((a, b) => b[1] - a[1]);
  const v = tasas.map((x) => x[1]);
  console.log(`  ${env.nom}: pasa el filtro el ${pct(pasa.length / base.length)} de las veces. Por ticker: el que más ${pct(v[0])} (${tasas[0][0]}) · mediana ${pct(mediana(v))} · el que menos ${pct(v[v.length - 1])} (${tasas[v.length - 1][0]})`);
  const top = new Set(tasas.slice(0, Math.ceil(tasas.length / 3)).map((x) => x[0]));
  const rTop = resumen((ARMS.get(`${env.nom}|FIJA`) || []).filter((f) => top.has(f.ticker)));
  const rRes = resumen((ARMS.get(`${env.nom}|FIJA`) || []).filter((f) => !top.has(f.ticker)));
  console.log(`     El listón SIN NINGÚN FILTRO, sólo en el tercio de tickers que más pasa: ratio ${f2(rTop.r)} (n=${num(rTop.a.n)}) · en el resto ${f2(rRes.r)} (n=${num(rRes.a.n)})`);
}

// ── reparto de la elección de la señal ──────────────────────────────────────
console.log(`\n${"═".repeat(100)}`);
console.log("  ¿QUÉ ELIGE LA SEÑAL? — reparto de distancias elegidas");
console.log(`${"═".repeat(100)}`);
for (const env of ENVASES) for (const k of ["MOV", "ATM", "EMP"]) {
  const filas = ARMS.get(`${env.nom}|${k}`);
  if (!filas || !filas.length) continue;
  const cnt = new Map();
  for (const f of filas) cnt.set(f.d, (cnt.get(f.d) || 0) + 1);
  const s = DISTS.map((d) => `${pct(d)}: ${pct((cnt.get(d) || 0) / filas.length)}`).join(" · ");
  console.log(`  ${env.nom} · ${ARMNOM[k].padEnd(46)} ${s}`);
}

// ── resumen para el informe ─────────────────────────────────────────────────
console.log(`\n${"═".repeat(100)}`);
console.log("  RESUMEN");
console.log(`${"═".repeat(100)}`);
for (const env of ENVASES) {
  const rf = RES.get(`${env.nom}|FIJA`);
  const mejor = ["MOV", "ATM", "EMP", "F100", "F080", "F060"].map((k) => [k, RES.get(`${env.nom}|${k}`)]).filter(([, R]) => R).sort((a, b) => b[1].r - a[1].r)[0];
  if (!rf || !mejor) continue;
  console.log(`  ENVASE ${env.nom}: listón (fija ${pct(env.fija)}) ratio ${f2(rf.r)} acierto ${pct(rf.acierto)} n=${num(rf.a.n)}`);
  console.log(`              mejor señal (${mejor[0]}) ratio ${f2(mejor[1].r)} acierto ${pct(mejor[1].acierto)} n=${num(mejor[1].a.n)} · barajado ${f2(RES.get(`${env.nom}|BARAJ`)?.r)}`);
}

mkdirSync("scripts/cache-theta", { recursive: true });
writeFileSync("scripts/cache-theta/y10-resumen.json", JSON.stringify(
  Object.fromEntries([...RES.entries()].map(([k, R]) => [k, { n: R.a.n, ratio: R.r, acierto: R.acierto, ganMedio: R.ganMedio, perMedio: R.perMedio, kt: R.kt, anosMalos: R.anosMalos, nAnos: R.nAnos }])), null, 1));
console.log(`\n  (detalle en scripts/cache-theta/y10-resumen.json)\n`);
