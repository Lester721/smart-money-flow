// ═══════════════════════════════════════════════════════════════════════════════════════════
// ¿HAY ALGÚN SELECTOR DE CONVEXIDAD QUE SUPERE AL AZAR?
//
// Lester quiere el perfil de pago convexo (+9x, +36x, +66x). Ese perfil sólo lo dan opciones
// LARGAS y LEJOS del dinero. El pago nunca fue el problema: el problema es ELEGIR cuál comprar.
// Hoy ya se probó un selector (gamma en dólares lejos del dinero) y quedó en el percentil 80
// del azar. Aquí se prueban 20 selectores × 2 lados con TODO lo que hay en disco.
//
// ───────────────────────────────────────────────────────────────────────────────────────────
// CRITERIO ESCRITO ANTES DE CORRER  (no se toca después de ver ningún número)
// ───────────────────────────────────────────────────────────────────────────────────────────
// PRUEBAS DECLARADAS: 20 selectores × 2 lados (call lejos arriba / put lejos abajo) = 40.
//   → listón de Bonferroni |t| ≥ listonT(40) = 3,23
//   → listón del control aleatorio: percentil ≥ 99,75 (0,05/40/2 por cola) sobre 500 sorteos.
//
// UNIDAD = SUCESO. Un suceso es un (ticker, vencimiento). Se exige unicidad en código: si dos
//   días de entrada apuntan al mismo vencimiento del mismo ticker, sólo cuenta el primero.
//   (Trampa nº6: 854 "operaciones" que eran 5 sucesos.)
//
// UNIVERSO. Los 28 tickers con cadena diaria en disco, entradas el ÚLTIMO día hábil de cada mes
//   de 2021-01 a 2026-04. Para cada (ticker, mes) se toma el vencimiento con DTE más cercano a
//   90 días dentro de [60,120]. Se declara como limitación que los 28 tickers se eligieron HOY
//   (sesgo de supervivencia del universo); afecta IGUAL al selector y al control, así que la
//   comparación entre ambos es limpia, pero el nivel absoluto no lo es.
//
// CONTRATO. Lado CALL: strike más cercano a spot × 1,30, exigiendo |K/(1,30·S) − 1| ≤ 0,10.
//   Lado PUT: strike más cercano a spot × 0,70 con la misma tolerancia.
//   Se paga el ASK (precio real). Comisión $0,03. Sin ask cotizado no hay operación.
//
// LIQUIDACIÓN. Intrínseco contra el CIERRE REAL del día de vencimiento (fichero cierres/, sin
//   ajustar por split — verificado: NVDA 2024-06-07 = 1208,88 y 2024-06-10 = 121,79).
//   Los splits entre entrada y vencimiento se detectan de la propia serie de cierres y se
//   aplican SÓLO en la liquidación (en ese momento el split ya es pasado, no es mirar al
//   futuro). Pago por contrato original = 100 × max(0, S_venc × R − K).
//   NO se usa la presencia del contrato en la cadena del día de vencimiento: el descargador
//   tira los bid ≤ 0, así que un contrato que expira sin valor NO está en la cache y leerlo
//   como "sin dato" tiraría a los perdedores (trampa nº3). Aquí AUSENTE no puede pasar.
//
// RESULTADO. mult = pago / coste. Se reporta la MEDIA del múltiplo (el perfil es convexo: la
//   mediana es 0 casi siempre y no dice nada) y su traducción a $/año sobre un presupuesto
//   anual FIJO de prima, repartido a partes iguales entre los sucesos elegidos.
//
// CÓMO SE MIDE UN SELECTOR. Los sucesos se ordenan DENTRO DE CADA MES de entrada (rango
//   transversal 0..1). Se toma el tercio alto. Así el selector no puede ganar simplemente por
//   "comprar más en los meses buenos" — el control aleatorio saca EXACTAMENTE el mismo número
//   de sucesos por mes. Se reporta aparte la versión sin estratificar, que sí mezcla el "qué"
//   con el "cuándo".
//
// PARA QUE UN SELECTOR CUENTE COMO HALLAZGO (las cinco, todas):
//   1. n ≥ 200 sucesos en el tercio alto.
//   2. Ningún ticker > 20% del tercio alto.
//   3. Mismo signo de (tercio alto − tercio bajo) en los TRES tercios de tiempo.
//   4. |t| ≥ 3,23 (Bonferroni, 40 pruebas).
//   5. Percentil ≥ 99,75 contra 500 sorteos aleatorios estratificados por mes.
//   6. La ventaja sobrevive a punto-medio-a-punto-medio (trampa nº4): si comprando a MID la
//      ventaja desaparece, era horquilla y no señal.
//
// SELECTORES DECLARADOS (los 20; todos calculables el día de la entrada, nada del futuro):
//   S01 flujoNetoC       prima de COMPRA agresiva de calls − VENTA agresiva, 20 sesiones, /total
//   S02 flujoNetoCLejos  igual pero sólo operaciones con strike > 1,10·S y dte > 30
//   S03 flujoRatioCP     compra agresiva de calls / (calls + puts) de compra agresiva
//   S04 flujoNetoP       prima de compra agresiva de PUTS − venta agresiva, /total
//   S05 oiLejosShare     OI de calls por encima de 1,25·S / OI total de calls
//   S06 oiLejosDelta20   cambio de S05 en 20 sesiones
//   S07 oiEnStrike       OI del contrato / OI mediano de las calls de ese vencimiento
//   S08 skew             IV(K) − IV(ATM) del mismo vencimiento
//   S09 ivMenosRV        IV(ATM, nuestro vencimiento) − volatilidad realizada 20d
//   S10 estructura       IV(ATM ~30d) − IV(ATM nuestro vencimiento)
//   S11 ivContrato       IV del propio contrato comprado
//   S12 momento60        S / S[-60] − 1
//   S13 momento250       S / S[-250] − 1
//   S14 rvExpansion      rv20 / rv250
//   S15 gexNorm          (gamma$ calls − gamma$ puts) / (calls + puts), del día
//   S16 precioContrato   el propio ask (billete barato vs caro)
//   S17 horquillaRel     (ask − bid) / mid en la entrada
//   S18 distanciaSigma   (K/S − 1) / (rv20 · √T) — cuántas sigmas fuera está el strike
//   S19 volumenRel       volumen 20d del subyacente / volumen 250d
//   S20 oiTotalRel       OI total del ticker / su mediana de las 250 sesiones ANTERIORES
//
// Cada selector se prueba en sus DOS sentidos (alto y bajo) pero eso NO multiplica las pruebas:
// el signo se declara aquí de antemano sólo para el listón; se reporta la separación con signo.
//
// ───────────────────────────────────────────────────────────────────────────────────────────
// AÑADIDO DESPUÉS DE LA PRIMERA CORRIDA — se deja escrito para que se vea qué es pre-registro
// y qué no. Nada de esto puede CREAR un hallazgo; sólo matar uno.
//   · MODO=sigma. La primera corrida "aprobó" ivContrato y precioContrato (t=4,4 y 5,4,
//     percentil 100). Al mirar qué compraban: el tercio alto estaba a 1,68 sigmas del dinero y
//     el bajo a 3,14. No elegían mejor, elegían OTRO PRODUCTO. Con el strike fijado en sigmas
//     los dos se caen a t=1,25 y 0,69.
//   · Criba de CONCENTRACIÓN DEL PAGO. La criba de la barrera cuenta SUCESOS, y con el 94% de
//     los sucesos valiendo cero eso no protege de nada: aprobaba "TSLA 13% de la muestra"
//     mientras NVDA+AMD eran el 48% de todo el dinero. Se exige además: ningún ticker > 25% del
//     múltiplo total y los 10 mayores sucesos ≤ 40%.
//   · Autopsia (sección 6) y potencia (sección 7).
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
//   node --max-old-space-size=10240 scripts/conv-selector.mjs
//   LADO=put node --max-old-space-size=10240 scripts/conv-selector.mjs
//   OTM=1.15 node ... (robustez)

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const OIDIR = "scripts/cache-theta/oi-ancho";
const CIERRES = "scripts/cache-theta/cierres";
const VOLDIR = "scripts/cache-theta/volumen";
const FLUJO = "scripts/cache-theta/flujo-historico";

// MODO=pct  → strike a un % fijo del spot (el diseño de arriba)
// MODO=sigma → strike a un nº fijo de SIGMAS (rv20 · √T). CONTROL DECISIVO: iguala el producto.
//   Sin esto, "comprar alta IV" no es un selector: es comprar una opción que está a 1,7 sigmas
//   en vez de a 3,1, y eso no elige mejor, elige OTRA COSA.
const MODO = (process.env.MODO || "pct").toLowerCase();
const SIGMA = Number(process.env.SIGMA || 2.0);
const LADO = (process.env.LADO || "call").toLowerCase();      // call | put
const OTM = Number(process.env.OTM || (LADO === "call" ? 1.30 : 0.70));
const TOL = 0.10;
const DTE_OBJ = 90, DTE_MIN = 60, DTE_MAX = 120;
const PRUEBAS = 40;
const SEMILLAS = 500;
const PRESUPUESTO_ANUAL = 3000;   // $ de prima al año, repartidos entre los sucesos elegidos
const COMISION = 0.03;
const DESDE = "20210104", HASTA_ENTRADA = "20260430";

const listonT = (p) => { const q = 0.05 / p / 2; const t = Math.sqrt(-2 * Math.log(q)); return Math.round((t - (2.30753 + 0.27061 * t) / (1 + 0.99229 * t + 0.04481 * t * t)) * 100) / 100; };
const LISTON = listonT(PRUEBAS);

const ms = (y) => Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`);
const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0);
const varianza = (v) => { if (v.length < 2) return 0; const m = media(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };
const tWelch = (a, b) => { if (a.length < 3 || b.length < 3) return 0; const se = Math.sqrt(varianza(a) / a.length + varianza(b) / b.length); return se > 0 ? (media(a) - media(b)) / se : 0; };
const pct = (v, p) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))]; };

// ── Black-Scholes SÓLO AL REVÉS: sacar la IV de un precio REAL ───────────────────────────────
const R = 0.04;
function normCdf(x) { const s = x < 0 ? -1 : 1, z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.3275911 * z); const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z); return 0.5 * (1 + s * y); }
function bsCall(s, k, T, iv) { if (!(s > 0 && k > 0 && T > 0 && iv > 0)) return 0; const d1 = (Math.log(s / k) + (R + 0.5 * iv * iv) * T) / (iv * Math.sqrt(T)); return s * normCdf(d1) - k * Math.exp(-R * T) * normCdf(d1 - iv * Math.sqrt(T)); }
function bsPut(s, k, T, iv) { const c = bsCall(s, k, T, iv); return c - s + k * Math.exp(-R * T); }
function bsGamma(s, k, T, iv) { if (!(s > 0 && k > 0 && T > 0 && iv > 0)) return 0; const sq = Math.sqrt(T), d1 = (Math.log(s / k) + (R + 0.5 * iv * iv) * T) / (iv * sq); return Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI) / (s * iv * sq); }
function iv(precio, s, k, T, esCall) {
  if (!(precio > 0 && s > 0 && k > 0 && T > 0)) return null;
  const f = esCall ? bsCall : bsPut;
  let lo = 0.01, hi = 5;
  if (f(s, k, T, lo) > precio || f(s, k, T, hi) < precio) return null;
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (f(s, k, T, m) < precio) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// ═══ 1. CIERRES, DÍAS HÁBILES Y SPLITS ══════════════════════════════════════════════════════
const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) { const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/); if (!m) continue; if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []); diasPorSim.get(m[1]).push(m[2]); }
for (const v of diasPorSim.values()) v.sort();
const SIMBOLOS = [...diasPorSim.keys()].sort();

const cierres = {}, diasCierre = {}, idxCierre = {}, splits = {}, volumen = {};
const CAND = [2, 3, 4, 5, 6, 7, 8, 10, 15, 20, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 8, 1 / 10, 1 / 20];
for (const s of SIMBOLOS) {
  cierres[s] = JSON.parse(readFileSync(`${CIERRES}/${s}.json`, "utf8"));
  diasCierre[s] = Object.keys(cierres[s]).sort();
  idxCierre[s] = new Map(diasCierre[s].map((d, i) => [d, i]));
  volumen[s] = existsSync(`${VOLDIR}/${s}.json`) ? JSON.parse(readFileSync(`${VOLDIR}/${s}.json`, "utf8")) : {};
  splits[s] = [];
  const k = diasCierre[s];
  for (let i = 1; i < k.length; i++) {
    const dias = (ms(k[i]) - ms(k[i - 1])) / 86400000;
    if (dias > 6) continue;                                   // hueco de datos, no un split
    const r = cierres[s][k[i - 1]] / cierres[s][k[i]];
    if (r <= 1.35 && r >= 0.72) continue;
    let mejor = null, dif = 9;
    for (const c of CAND) { const d = Math.abs(r / c - 1); if (d < dif) { dif = d; mejor = c; } }
    if (dif < 0.05) splits[s].push({ dia: k[i], ratio: mejor });
  }
}
const factorSplit = (s, desde, hasta) => splits[s].filter((x) => x.dia > desde && x.dia <= hasta).reduce((f, x) => f * x.ratio, 1);

// ── volatilidad realizada trailing (sólo pasado) ──
function rv(s, dia, n) {
  const i = idxCierre[s].get(dia); if (i === undefined || i < n) return null;
  let r = [];
  for (let j = i - n + 1; j <= i; j++) {
    const d0 = diasCierre[s][j - 1], d1 = diasCierre[s][j];
    if ((ms(d1) - ms(d0)) / 86400000 > 6) return null;         // hueco: no se puede calcular
    const f = factorSplit(s, d0, d1);
    r.push(Math.log((cierres[s][d1] * f) / cierres[s][d0]));
  }
  return Math.sqrt(varianza(r) * 252);
}

// ═══ 2. FLUJO: agregados por (ticker, día) con el LADO (quién inició) ════════════════════════
const flujoDia = new Map();     // `SYM|YYYYMMDD` → agregados
{
  for (const f of readdirSync(FLUJO)) {
    const m = f.match(/^([A-Z]+)_(\d{8})\.json$/); if (!m) continue;
    const [, sym, dia] = m;
    const j = JSON.parse(readFileSync(`${FLUJO}/${f}`, "utf8"));
    const sp = cierres[sym]?.[dia];
    const a = { cCompra: 0, cVenta: 0, pCompra: 0, pVenta: 0, cCompraLejos: 0, cVentaLejos: 0, total: 0 };
    for (const o of j.notables || []) {
      if (!(o.bid > 0 && o.ask > 0 && o.ask >= o.bid && o.prima > 0)) continue;
      const comp = o.price >= o.ask, vend = o.price <= o.bid;
      if (!comp && !vend) continue;                            // sin lado: no se usa
      a.total += o.prima;
      const esC = o.right === "C";
      if (esC) { if (comp) a.cCompra += o.prima; else a.cVenta += o.prima; }
      else { if (comp) a.pCompra += o.prima; else a.pVenta += o.prima; }
      if (esC && sp > 0) {
        const dte = (Date.parse(o.exp + "T00:00:00Z") - ms(dia)) / 86400000;
        if (o.strike > sp * 1.10 && dte > 30) { if (comp) a.cCompraLejos += o.prima; else a.cVentaLejos += o.prima; }
      }
    }
    flujoDia.set(`${sym}|${dia}`, a);
  }
}
const HAY_FLUJO = new Set([...flujoDia.keys()].map((k) => k.split("|")[0]));

// ═══ 3. CONSTRUCCIÓN DE SUCESOS ═════════════════════════════════════════════════════════════
const cacheC = new Map(), cacheOI = new Map();
function leer(cache, dir, sym, dia) {
  const k = `${sym}|${dia}`; if (cache.has(k)) return cache.get(k);
  const f = `${dir}/${sym}_d${dia}.json`;
  const v = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  if (cache.size > 400) cache.delete(cache.keys().next().value);
  cache.set(k, v); return v;
}

function ivAtm(cad, exp, sp, T) {
  const g = cad[exp]; if (!g) return null;
  let mejor = null, dif = Infinity;
  for (const clave of Object.keys(g)) {
    if (!clave.endsWith("C")) continue;
    const K = Number(clave.slice(0, -2)); if (!(K > 0)) continue;
    const d = Math.abs(K - sp); if (d < dif) { dif = d; mejor = K; }
  }
  if (mejor === null || dif > sp * 0.05) return null;
  const ba = g[`${mejor}|C`];
  return iv((ba[0] + ba[1]) / 2, sp, mejor, T, true);
}

const sucesos = [];
const rechazos = { sinCadena: 0, sinVenc: 0, sinStrike: 0, sinCierreVenc: 0, huecoCierres: 0, dupVenc: 0, sinIV: 0, sinOI: 0 };
const vistos = new Set();      // (ticker, vencimiento) — unicidad de SUCESO

for (const sym of SIMBOLOS) {
  const dias = diasPorSim.get(sym).filter((d) => d >= DESDE && d <= HASTA_ENTRADA);
  const finMes = new Map(); for (const d of dias) finMes.set(d.slice(0, 6), d);
  for (const [mes, dia] of [...finMes.entries()].sort()) {
    const sp = cierres[sym][dia]; if (!(sp > 0)) { rechazos.huecoCierres++; continue; }
    const cad = leer(cacheC, CDIR, sym, dia); if (!cad) { rechazos.sinCadena++; continue; }

    // vencimiento con DTE más cercano a 90 dentro de [60,120]
    let exp = null, mejorD = Infinity, dteSel = 0;
    for (const e of Object.keys(cad)) {
      const dte = (ms(e) - ms(dia)) / 86400000;
      if (dte < DTE_MIN || dte > DTE_MAX) continue;
      const d = Math.abs(dte - DTE_OBJ); if (d < mejorD) { mejorD = d; exp = e; dteSel = dte; }
    }
    if (!exp) { rechazos.sinVenc++; continue; }
    const clave = `${sym}|${exp}`;
    if (vistos.has(clave)) { rechazos.dupVenc++; continue; }

    // strike
    const letra = LADO === "call" ? "C" : "P";
    const rvPrev = rv(sym, dia, 20);
    let obj;
    if (MODO === "sigma") {
      if (!(rvPrev > 0)) { rechazos.sinStrike++; continue; }
      obj = sp * Math.exp((LADO === "call" ? 1 : -1) * SIGMA * rvPrev * Math.sqrt(dteSel / 365));
    } else obj = sp * OTM;
    let K = null, dif = Infinity;
    for (const cl of Object.keys(cad[exp])) {
      if (!cl.endsWith(letra)) continue;
      const k = Number(cl.slice(0, -2)); if (!(k > 0)) continue;
      const d = Math.abs(k - obj); if (d < dif) { dif = d; K = k; }
    }
    if (K === null || Math.abs(K / obj - 1) > TOL) { rechazos.sinStrike++; continue; }
    const ba = cad[exp][`${K}|${letra}`];
    const [bid, ask] = ba;
    if (!(ask > 0)) { rechazos.sinStrike++; continue; }

    // liquidación: cierre real del día de vencimiento (o el último hábil anterior)
    let dVenc = null;
    for (let i = diasCierre[sym].length - 1; i >= 0; i--) { if (diasCierre[sym][i] <= exp) { dVenc = diasCierre[sym][i]; break; } }
    if (!dVenc || (ms(exp) - ms(dVenc)) / 86400000 > 5) { rechazos.sinCierreVenc++; continue; }
    if (dVenc <= dia) { rechazos.sinCierreVenc++; continue; }
    const F = factorSplit(sym, dia, dVenc);
    const sVenc = cierres[sym][dVenc] * F;
    const pago = 100 * Math.max(0, LADO === "call" ? sVenc - K : K - sVenc);
    const coste = ask * 100 + COMISION;
    const costeMid = ((bid + ask) / 2) * 100 + COMISION;
    if (!(coste > 0)) { rechazos.sinStrike++; continue; }

    vistos.add(clave);
    const T = dteSel / 365;

    // ── selectores ──────────────────────────────────────────────────────────────────────────
    const oiDia = leer(cacheOI, OIDIR, sym, dia);
    const i0 = idxCierre[sym].get(dia);
    const dia20 = i0 !== undefined && i0 >= 20 ? diasCierre[sym][i0 - 20] : null;
    const oi20 = dia20 ? leer(cacheOI, OIDIR, sym, dia20) : null;

    function oiAgregado(o) {
      if (!o) return null;
      let cTot = 0, cLejos = 0, pTot = 0, tot = 0;
      for (const g of Object.values(o)) for (const [cl, v] of Object.entries(g)) {
        const n = Number(v) || 0; if (!(n > 0)) continue;
        const k = Number(cl.slice(0, -2)); if (!(k > 0)) continue;
        tot += n;
        if (cl.endsWith("C")) { cTot += n; if (k > sp * 1.25) cLejos += n; } else pTot += n;
      }
      return { cTot, cLejos, pTot, tot, share: cTot > 0 ? cLejos / cTot : null };
    }
    const agg = oiAgregado(oiDia), agg20 = oiAgregado(oi20);

    // GEX del día (calls +, puts −), normalizado como ratio
    let gexC = 0, gexP = 0;
    if (oiDia) {
      for (const [e, g] of Object.entries(oiDia)) {
        const T2 = (ms(e) - ms(dia)) / 365 / 86400000; if (!(T2 > 0.003)) continue;
        const gc = cad[e]; if (!gc) continue;
        const ivRef = ivAtm(cad, e, sp, T2); if (!(ivRef > 0)) continue;
        for (const [cl, v] of Object.entries(g)) {
          const n = Number(v) || 0; if (!(n > 0)) continue;
          const k = Number(cl.slice(0, -2)); if (!(k > 0)) continue;
          const gm = bsGamma(sp, k, T2, ivRef) * n * 100 * sp * sp * 0.01;
          if (!Number.isFinite(gm)) continue;
          if (cl.endsWith("C")) gexC += gm; else gexP += gm;
        }
      }
    }

    // flujo de las 20 sesiones anteriores (incluida la del día de entrada, ya cerrada a las 16:00)
    let fl = null;
    if (HAY_FLUJO.has(sym) && i0 !== undefined && i0 >= 20) {
      const a = { cCompra: 0, cVenta: 0, pCompra: 0, pVenta: 0, cCompraLejos: 0, cVentaLejos: 0, total: 0 };
      let hay = 0;
      for (let j = i0 - 19; j <= i0; j++) {
        const x = flujoDia.get(`${sym}|${diasCierre[sym][j]}`); if (!x) continue;
        hay++; for (const kk of Object.keys(a)) a[kk] += x[kk];
      }
      if (hay >= 10 && a.total > 0) fl = a;
    }

    const rv20 = rv(sym, dia, 20), rv250 = rv(sym, dia, 250);
    const ivC = iv((bid + ask) / 2, sp, K, T, LADO === "call");
    const ivA = ivAtm(cad, exp, sp, T);
    // estructura temporal: vencimiento más cercano a 30 DTE
    let expCorto = null, dC = Infinity;
    for (const e of Object.keys(cad)) { const dte = (ms(e) - ms(dia)) / 86400000; if (dte < 15 || dte > 50) continue; const d = Math.abs(dte - 30); if (d < dC) { dC = d; expCorto = e; } }
    const ivCorto = expCorto ? ivAtm(cad, expCorto, sp, (ms(expCorto) - ms(dia)) / 365 / 86400000) : null;

    const iM60 = i0 !== undefined && i0 >= 60 ? cierres[sym][dia] * factorSplit(sym, diasCierre[sym][i0 - 60], dia) / cierres[sym][diasCierre[sym][i0 - 60]] - 1 : null;
    const iM250 = i0 !== undefined && i0 >= 250 ? cierres[sym][dia] * factorSplit(sym, diasCierre[sym][i0 - 250], dia) / cierres[sym][diasCierre[sym][i0 - 250]] - 1 : null;

    let vol20 = 0, vol250 = 0, nv20 = 0, nv250 = 0;
    if (i0 !== undefined) {
      for (let j = Math.max(0, i0 - 19); j <= i0; j++) { const v = volumen[sym][diasCierre[sym][j]]; if (v > 0) { vol20 += v; nv20++; } }
      for (let j = Math.max(0, i0 - 249); j <= i0; j++) { const v = volumen[sym][diasCierre[sym][j]]; if (v > 0) { vol250 += v; nv250++; } }
    }

    // OI total del ticker contra su propia mediana trailing (250 sesiones ANTERIORES)
    let oiRel = null;
    if (agg && i0 !== undefined && i0 >= 250) {
      const hist = [];
      for (let j = i0 - 250; j < i0; j += 10) {
        const o = leer(cacheOI, OIDIR, sym, diasCierre[sym][j]); if (!o) continue;
        let t = 0; for (const g of Object.values(o)) for (const v of Object.values(g)) t += Number(v) || 0;
        if (t > 0) hist.push(t);
      }
      if (hist.length >= 10) { const m = pct(hist, 0.5); if (m > 0) oiRel = agg.tot / m; }
    }

    const sel = {
      S01: fl ? (fl.cCompra - fl.cVenta) / fl.total : null,
      S02: fl && (fl.cCompraLejos + fl.cVentaLejos) > 0 ? (fl.cCompraLejos - fl.cVentaLejos) / (fl.cCompraLejos + fl.cVentaLejos) : null,
      S03: fl && (fl.cCompra + fl.pCompra) > 0 ? fl.cCompra / (fl.cCompra + fl.pCompra) : null,
      S04: fl ? (fl.pCompra - fl.pVenta) / fl.total : null,
      S05: agg?.share ?? null,
      S06: agg?.share != null && agg20?.share != null ? agg.share - agg20.share : null,
      S07: null,   // se rellena abajo (necesita OI del contrato)
      S08: ivC != null && ivA != null ? ivC - ivA : null,
      S09: ivA != null && rv20 != null ? ivA - rv20 : null,
      S10: ivCorto != null && ivA != null ? ivCorto - ivA : null,
      S11: ivC,
      S12: iM60,
      S13: iM250,
      S14: rv20 != null && rv250 > 0 ? rv20 / rv250 : null,
      S15: agg && (gexC + gexP) > 0 ? (gexC - gexP) / (gexC + gexP) : null,
      S16: ask,
      S17: ask > 0 ? (ask - bid) / ((ask + bid) / 2) : null,
      S18: rv20 > 0 ? (K / sp - 1) / (rv20 * Math.sqrt(T)) : null,
      S19: nv20 > 5 && nv250 > 100 ? (vol20 / nv20) / (vol250 / nv250) : null,
      S20: oiRel,
    };
    // S07: OI del contrato / mediana del OI de ese lado en ese vencimiento
    if (oiDia?.[exp]) {
      const propios = [];
      for (const [cl, v] of Object.entries(oiDia[exp])) { if (cl.endsWith(letra)) { const n = Number(v) || 0; if (n > 0) propios.push(n); } }
      const mio = Number(oiDia[exp][`${K}|${letra}`]) || 0;
      const m = propios.length >= 5 ? pct(propios, 0.5) : null;
      if (m > 0) sel.S07 = mio / m;
    }

    sucesos.push({
      sym, mes, dia, exp, dteSel, K, sp, bid, ask, coste, costeMid, pago, F,
      mult: pago / coste, multMid: pago / costeMid,
      moneyness: K / sp, sel,
    });
  }
  process.stderr.write(sym + " ");
}
process.stderr.write("\n");

// ═══ 4. VALIDACIÓN DE LA MUESTRA ════════════════════════════════════════════════════════════
const R1 = [];
R1.push(`LADO=${LADO}  OTM=${OTM}  DTE objetivo ${DTE_OBJ} [${DTE_MIN},${DTE_MAX}]  listón |t| ≥ ${LISTON} (${PRUEBAS} pruebas)`);
R1.push(`SUCESOS: ${sucesos.length}  ·  (ticker,vencimiento) únicos: ${new Set(sucesos.map((s) => s.sym + "|" + s.exp)).size}`);
R1.push(`rechazos: ${JSON.stringify(rechazos)}`);
const porSym = {}; for (const s of sucesos) porSym[s.sym] = (porSym[s.sym] || 0) + 1;
const maxSym = Object.entries(porSym).sort((a, b) => b[1] - a[1])[0];
R1.push(`tickers: ${Object.keys(porSym).length}, mayor ${maxSym[0]} ${maxSym[1]} (${(100 * maxSym[1] / sucesos.length).toFixed(1)}%)`);
R1.push(`meses de entrada: ${new Set(sucesos.map((s) => s.mes)).size}  ·  con split entre entrada y vencimiento: ${sucesos.filter((s) => s.F !== 1).length}`);
const mults = sucesos.map((s) => s.mult);
R1.push(`múltiplo: media ${media(mults).toFixed(3)}x  mediana ${pct(mults, 0.5).toFixed(3)}x  ceros ${mults.filter((m) => m === 0).length} (${(100 * mults.filter((m) => m === 0).length / mults.length).toFixed(1)}%)  máx ${Math.max(...mults).toFixed(1)}x`);
R1.push(`múltiplo a MID: media ${media(sucesos.map((s) => s.multMid)).toFixed(3)}x`);
R1.push(`moneyness real: mediana ${pct(sucesos.map((s) => s.moneyness), 0.5).toFixed(3)}  ·  ask mediano $${pct(sucesos.map((s) => s.ask), 0.5).toFixed(2)}  ·  horquilla mediana ${(100 * pct(sucesos.map((s) => s.sel.S17), 0.5)).toFixed(0)}%`);
const porAnio = {};
for (const s of sucesos) { const y = s.dia.slice(0, 4); (porAnio[y] ||= []).push(s.mult); }
R1.push("por año de entrada: " + Object.entries(porAnio).sort().map(([y, v]) => `${y} n=${v.length} ${media(v).toFixed(2)}x`).join(" · "));
const cobertura = {};
for (const k of Object.keys(sucesos[0].sel)) cobertura[k] = sucesos.filter((s) => s.sel[k] != null && Number.isFinite(s.sel[k])).length;
R1.push("cobertura de cada selector: " + Object.entries(cobertura).map(([k, v]) => `${k}:${v}`).join(" "));
for (const [k, v] of Object.entries(cobertura)) if (v === 0) throw new Error(`SELECTOR MUERTO: ${k} no tiene ni un valor — un campo que no existe se lee como 0`);

// ═══ 5. MOTOR DE EVALUACIÓN ═════════════════════════════════════════════════════════════════
const meses = [...new Set(sucesos.map((s) => s.mes))].sort();
const porMes = new Map(meses.map((m) => [m, sucesos.filter((s) => s.mes === m)]));

/** Tercio alto / bajo por rango DENTRO de cada mes. Devuelve los sucesos. */
function terciosPorMes(clave, campo = "mult") {
  const alto = [], bajo = [], nPorMes = new Map();
  for (const m of meses) {
    const v = porMes.get(m).filter((s) => s.sel[clave] != null && Number.isFinite(s.sel[clave]));
    if (v.length < 6) continue;
    const ord = [...v].sort((a, b) => b.sel[clave] - a.sel[clave]);
    const k = Math.floor(ord.length / 3);
    alto.push(...ord.slice(0, k)); bajo.push(...ord.slice(-k));
    nPorMes.set(m, { k, disponibles: v });
  }
  return { alto, bajo, nPorMes };
}

/** Control: 500 sorteos que cogen EXACTAMENTE el mismo número por mes del mismo conjunto. */
function controlAleatorio(nPorMes, campo = "mult") {
  const medias = [];
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let it = 0; it < SEMILLAS; it++) {
    const v = [];
    for (const [, { k, disponibles }] of nPorMes) {
      const pool = [...disponibles];
      for (let i = 0; i < k; i++) { const j = i + Math.floor(rnd() * (pool.length - i)); [pool[i], pool[j]] = [pool[j], pool[i]]; v.push(pool[i][campo]); }
    }
    medias.push(media(v));
  }
  medias.sort((a, b) => a - b);
  return medias;
}

function percentil(medias, x) { let c = 0; for (const m of medias) if (m < x) c++; return 100 * c / medias.length; }

function tercios3(filas) {
  const ord = [...filas].sort((a, b) => a.dia.localeCompare(b.dia));
  const k = Math.floor(ord.length / 3);
  return [ord.slice(0, k), ord.slice(k, 2 * k), ord.slice(2 * k)];
}

const NOMBRES = {
  S01: "flujoNetoC", S02: "flujoNetoCLejos", S03: "flujoRatioCP", S04: "flujoNetoP", S05: "oiLejosShare",
  S06: "oiLejosDelta20", S07: "oiEnStrike", S08: "skew", S09: "ivMenosRV", S10: "estructura",
  S11: "ivContrato", S12: "momento60", S13: "momento250", S14: "rvExpansion", S15: "gexNorm",
  S16: "precioContrato", S17: "horquillaRel", S18: "distanciaSigma", S19: "volumenRel", S20: "oiTotalRel",
};

const resultados = [];
for (const clave of Object.keys(NOMBRES)) {
  const { alto, bajo, nPorMes } = terciosPorMes(clave);
  if (alto.length < 30) { resultados.push({ clave, nombre: NOMBRES[clave], n: alto.length, nota: "muestra insuficiente" }); continue; }
  const mAlto = media(alto.map((s) => s.mult)), mBajo = media(bajo.map((s) => s.mult));
  const pool = [...nPorMes.values()].flatMap((x) => x.disponibles);
  const mPool = media(pool.map((s) => s.mult));
  const ctrl = controlAleatorio(nPorMes);
  const p = percentil(ctrl, mAlto);
  const t = tWelch(alto.map((s) => s.mult), bajo.map((s) => s.mult));
  // mismo signo en los tres tercios de TIEMPO
  const t3 = tercios3(alto), b3 = tercios3(bajo);
  const seps = [0, 1, 2].map((i) => media(t3[i].map((s) => s.mult)) - media(b3[i].map((s) => s.mult)));
  const mismoSigno = seps.every((x) => Math.sign(x) === Math.sign(seps[0])) && seps[0] !== 0;
  // concentración por SUCESOS (la de la barrera)…
  const cnt = {}; for (const s of alto) cnt[s.sym] = (cnt[s.sym] || 0) + 1;
  const may = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
  // …y la que de verdad importa en un perfil convexo: concentración del PAGO.
  // Contar sucesos no sirve cuando el 94% valen cero: la barrera aprueba "TSLA 13% de la muestra"
  // mientras NVDA+AMD son la mitad de TODO el dinero. Aquí se mide sobre el múltiplo.
  const totMult = alto.reduce((a, s) => a + s.mult, 0);
  const cntPago = {}; for (const s of alto) cntPago[s.sym] = (cntPago[s.sym] || 0) + s.mult;
  const mayPago = Object.entries(cntPago).sort((a, b) => b[1] - a[1])[0];
  const ord = [...alto].sort((a, b) => b.mult - a.mult);
  const top10 = totMult > 0 ? 100 * ord.slice(0, 10).reduce((a, s) => a + s.mult, 0) / totMult : 0;
  const nGana = alto.filter((s) => s.mult > 0).length;
  // intervalo del 95% de la media por remuestreo (la media de un perfil convexo la mandan 10 datos)
  let seed2 = 777; const rnd2 = () => { seed2 = (seed2 * 1103515245 + 12345) & 0x7fffffff; return seed2 / 0x7fffffff; };
  const bs = []; for (let i = 0; i < 2000; i++) { let a = 0; for (let j = 0; j < alto.length; j++) a += alto[Math.floor(rnd2() * alto.length)].mult; bs.push(a / alto.length); }
  bs.sort((a, b) => a - b);
  // punto medio a punto medio (trampa nº4)
  const mAltoMid = media(alto.map((s) => s.multMid)), mBajoMid = media(bajo.map((s) => s.multMid)), mPoolMid = media(pool.map((s) => s.multMid));
  resultados.push({
    clave, nombre: NOMBRES[clave], n: alto.length, nBajo: bajo.length, nPool: pool.length,
    mAlto, mBajo, mPool, sep: mAlto - mBajo, ventajaPool: mAlto - mPool,
    t, p, ctrlP50: ctrl[Math.floor(ctrl.length / 2)], ctrlP95: ctrl[Math.floor(ctrl.length * 0.95)], ctrlP99: ctrl[Math.floor(ctrl.length * 0.9975)],
    seps, mismoSigno, mayor: may[0], mayorPct: 100 * may[1] / alto.length,
    mayorPago: mayPago[0], mayorPagoPct: totMult > 0 ? 100 * mayPago[1] / totMult : 0, top10, nGana,
    ic95: [bs[Math.floor(bs.length * 0.025)], bs[Math.floor(bs.length * 0.975)]],
    mAltoMid, mBajoMid, mPoolMid, sepMid: mAltoMid - mBajoMid,
    sigmaAlto: media(alto.map((s) => s.sel.S18).filter((x) => x != null)), sigmaBajo: media(bajo.map((s) => s.sel.S18).filter((x) => x != null)),
    moneyAlto: media(alto.map((s) => s.moneyness)), moneyBajo: media(bajo.map((s) => s.moneyness)),
    askAlto: media(alto.map((s) => s.ask)), askBajo: media(bajo.map((s) => s.ask)),
    pasa: alto.length >= 200 && may[1] / alto.length <= 0.20 && mismoSigno && Math.abs(t) >= LISTON && p >= 99.75,
    // criba añadida tras ver el primer resultado: en un perfil convexo la concentración se mide
    // sobre el DINERO, no sobre los sucesos.
    pasaPago: totMult > 0 && (100 * mayPago[1] / totMult) <= 25 && top10 <= 40,
  });
}
resultados.sort((a, b) => (b.ventajaPool ?? -9) - (a.ventajaPool ?? -9));

const anios = (new Set(sucesos.map((s) => s.dia.slice(0, 4)))).size;
const R2 = [];
R2.push("");
R2.push("### RESULTADO — los 20 selectores, tercio alto por rango DENTRO del mes");
R2.push("| # | selector | n alto | media alto | media pool | ventaja | IC95 de la media | t | pct azar | 3 tercios | mayor (sucesos) | mayor (PAGO) | top10 | gana | σ alto/bajo | ventaja a MID | PASA |");
R2.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of resultados) {
  if (r.nota) { R2.push(`| ${r.clave} | ${r.nombre} | ${r.n} | ${r.nota} |`); continue; }
  R2.push(`| ${r.clave} | ${r.nombre} | ${r.n} | ${r.mAlto.toFixed(3)}x | ${r.mPool.toFixed(3)}x | ${(r.ventajaPool >= 0 ? "+" : "") + r.ventajaPool.toFixed(3)} | ${r.ic95[0].toFixed(2)}–${r.ic95[1].toFixed(2)}x | ${r.t.toFixed(2)} | ${r.p.toFixed(1)} | ${r.seps.map((x) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(2)).join(" ")} | ${r.mayor} ${r.mayorPct.toFixed(0)}% | ${r.mayorPago} ${r.mayorPagoPct.toFixed(0)}% | ${r.top10.toFixed(0)}% | ${r.nGana} | ${r.sigmaAlto.toFixed(2)}/${r.sigmaBajo.toFixed(2)} | ${(r.mAltoMid - r.mPoolMid >= 0 ? "+" : "") + (r.mAltoMid - r.mPoolMid).toFixed(3)} | ${r.pasa ? (r.pasaPago ? "SÍ" : "no (dinero concentrado)") : "no"} |`);
}
R2.push("");
R2.push(`Listón del azar: percentil ≥ 99,75. Mediana del control ≈ media del pool por construcción.`);
R2.push(`Traducción a dólares (presupuesto de $${PRESUPUESTO_ANUAL}/año de prima repartido entre los sucesos elegidos):`);
for (const r of resultados.slice(0, 5)) {
  if (r.nota) continue;
  const opsAnio = r.n / anios;
  R2.push(`  ${r.nombre}: ${opsAnio.toFixed(0)} compras/año · ${((r.mAlto - 1) * PRESUPUESTO_ANUAL).toFixed(0)} $/año  (pool: ${((r.mPool - 1) * PRESUPUESTO_ANUAL).toFixed(0)} $/año)`);
}
R2.push(`  Comprar TODO el pool: media ${media(sucesos.map((s) => s.mult)).toFixed(3)}x → ${((media(sucesos.map((s) => s.mult)) - 1) * PRESUPUESTO_ANUAL).toFixed(0)} $/año sobre $${PRESUPUESTO_ANUAL} de prima`);

// ═══ 6. AUTOPSIA DEL MEJOR CANDIDATO ════════════════════════════════════════════════════════
// Añadido DESPUÉS de ver que el mejor selector tiene el 84% del dinero en 10 sucesos. Se marca
// como EXPLORATORIO: estas pruebas no estaban en las 40 declaradas y no pueden crear un hallazgo,
// sólo matar uno.
const R3 = [];
const mejor = resultados.find((r) => !r.nota);
if (mejor) {
  const CL = mejor.clave;
  R3.push("");
  R3.push(`### AUTOPSIA de ${mejor.nombre} (el mejor de los 20) — EXPLORATORIO, no cuenta como hallazgo`);

  // (a) dejar fuera un ticker cada vez: ¿el selector sobrevive sin su ganador?
  const { alto: a0, nPorMes: nm0 } = terciosPorMes(CL);
  const pool0 = [...nm0.values()].flatMap((x) => x.disponibles);
  const tickers = [...new Set(a0.map((s) => s.sym))];
  const fuera = [];
  for (const t of tickers) {
    const a = a0.filter((s) => s.sym !== t), p = pool0.filter((s) => s.sym !== t);
    if (a.length < 100) continue;
    fuera.push({ t, vent: media(a.map((s) => s.mult)) - media(p.map((s) => s.mult)), n: a.length });
  }
  fuera.sort((x, y) => x.vent - y.vent);
  R3.push(`Dejando UN ticker fuera cada vez (28 pruebas), la ventaja sobre el pool va de ${fuera[0].vent.toFixed(3)} (sin ${fuera[0].t}) a ${fuera.at(-1).vent.toFixed(3)} (sin ${fuera.at(-1).t}).`);
  R3.push(`  los 5 que más la sostienen: ${fuera.slice(0, 5).map((x) => `sin ${x.t} → ${x.vent >= 0 ? "+" : ""}${x.vent.toFixed(2)}`).join(" · ")}`);
  const sinDos = a0.filter((s) => s.sym !== fuera[0].t && s.sym !== fuera[1].t);
  const poolSinDos = pool0.filter((s) => s.sym !== fuera[0].t && s.sym !== fuera[1].t);
  R3.push(`  sin ${fuera[0].t} NI ${fuera[1].t}: alto ${media(sinDos.map((s) => s.mult)).toFixed(3)}x vs pool ${media(poolSinDos.map((s) => s.mult)).toFixed(3)}x (n=${sinDos.length})`);

  // (b) año a año: lo que de verdad viviría Lester
  R3.push("");
  R3.push(`Año a año con $${PRESUPUESTO_ANUAL} de prima repartidos entre los sucesos del tercio alto:`);
  R3.push("| año | compras | media alto | $ resultado | media pool | $ pool |");
  R3.push("|---|---|---|---|---|---|");
  for (const y of [...new Set(pool0.map((s) => s.dia.slice(0, 4)))].sort()) {
    const a = a0.filter((s) => s.dia.slice(0, 4) === y), p = pool0.filter((s) => s.dia.slice(0, 4) === y);
    if (!a.length) continue;
    R3.push(`| ${y} | ${a.length} | ${media(a.map((s) => s.mult)).toFixed(2)}x | ${((media(a.map((s) => s.mult)) - 1) * PRESUPUESTO_ANUAL).toFixed(0)} | ${media(p.map((s) => s.mult)).toFixed(2)}x | ${((media(p.map((s) => s.mult)) - 1) * PRESUPUESTO_ANUAL).toFixed(0)} |`);
  }
}

// ═══ 7. POTENCIA — el lado negativo también se criba ════════════════════════════════════════
// Un "no funciona" con muestra pequeña no es una conclusión: es una prueba mal dimensionada.
R3.push("");
R3.push("### ¿TENÍA FUERZA LA PRUEBA? (potencia ~80%, α del listón)");
R3.push("| selector | n alto | desv. típica del múltiplo | separación MÍNIMA detectable | ¿concluyente si sale que no? |");
R3.push("|---|---|---|---|---|");
for (const r of resultados) {
  if (r.nota) { R3.push(`| ${r.nombre} | ${r.n} | — | — | NO — ${r.nota} |`); continue; }
  const { alto } = terciosPorMes(r.clave);
  const sd = Math.sqrt(varianza(alto.map((s) => s.mult)));
  const det = (LISTON + 0.84) * sd * Math.sqrt(2 / alto.length);
  R3.push(`| ${r.nombre} | ${r.n} | ${sd.toFixed(2)} | ${det.toFixed(2)}x por suceso | ${det < 1 ? "sí" : "NO — sólo vería un efecto enorme"} |`);
}

const salida = [...R1, ...R2, ...R3].join("\n");
console.log(salida);
writeFileSync(`scripts/conv-selector-${MODO}-${LADO}-${String(MODO === "sigma" ? SIGMA : OTM).replace(".", "")}.json`, JSON.stringify({ criterio: { LADO, OTM, DTE_OBJ, PRUEBAS, LISTON, SEMILLAS }, rechazos, resultados, sucesos }, null, 0), "utf8");
writeFileSync(`scripts/conv-selector-${MODO}-${LADO}-${String(MODO === "sigma" ? SIGMA : OTM).replace(".", "")}.md`, salida, "utf8");
