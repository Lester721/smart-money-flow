// ══════════════════════════════════════════════════════════════════════════════════════════
// GRIEGAS-TAMAÑO · PASO 3 — LA AUTOPSIA DEL ÚNICO NÚMERO GRANDE, Y EL DINERO REAL
// ══════════════════════════════════════════════════════════════════════════════════════════
//
// El paso 2 dio 36 pruebas y una sola por encima del listón: "IV pagada − IV vendida" contra
// |retorno| EN PUNTOS a 1 día, t(filas)=−4,01 y t(días no solapados)=−3,29 con listón 3,20.
// Pero con el signo AL REVÉS del mecanismo, y SÓLO en el objetivo sin normalizar. La misma
// métrica contra el movimiento normalizado por la volatilidad propia del ticker da t=+1,18.
//
// Esa pareja de resultados tiene una explicación obvia y comprobable: **|retorno| en puntos no
// está normalizado, así que ordena por lo volátil que es cada ticker.** Si ivRel es más alto en
// los tickers tranquilos, la separación negativa la produce la volatilidad de base, no el flujo.
// Aquí se comprueba con el dato, no se supone:
//
//   A. correlación de ivRel con la volatilidad previa rv20 (transversal, dentro del día)
//   B. la MISMA prueba controlando por rv: dentro de cada día se ordena por ivRel SÓLO entre
//      tickers de volatilidad parecida (quintiles de rv). Si el efecto sobrevive, es del flujo;
//      si desaparece, era la volatilidad de base.
//
// ══ Y DESPUÉS: EL DINERO ═══════════════════════════════════════════════════════════════════
// Ninguna prueba estadística responde "¿sirve para comprar calls o puts?". Eso lo responde
// comprar la opción. Sobre los 27 tickers que tienen cadena real:
//   · se ordena el universo COMPLETO por la métrica (más información que ordenar sólo 27)
//   · en los tickers del tercio ALTO se compra un CONO: call y put a la misma distancia y plazo
//   · se paga el ASK. Se liquida a vencimiento por el intrínseco con el CIERRE REAL. Cero modelo.
//   · el control es el tercio BAJO y el "todos los días", que ya se sabe que da −26,8%
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/marketsnack/griegas-tamano-3-dinero.mjs

import fs from "node:fs";
import { listonT, tWelch } from "../../lib/barreraHallazgos.ts";
import { radiografia } from "../../lib/radiografia.ts";

const PANEL = "scripts/marketsnack/griegas-tamano-panel.json";
const CDIR = "scripts/cache-theta/cadenas";
const CIERRES = "scripts/cache-theta/cierres";
const SALIDA = "scripts/marketsnack/griegas-tamano-3-salida.json";

const CUENTA = 56389;
const MIN_SIMBOLOS_DIA = 15;
const RUPTURA = "2026-07-16";
const DIST = 0.05;                  // distancia del cono, 5% fuera del dinero a cada lado
const DTE = [7, 30];
const TOL_DTE = { 7: 4, 30: 10 };
const ULTIMO = "20260806";          // las cadenas y los cierres paran aquí
const PRUEBAS_DINERO = 8;           // 2 métricas × 2 plazos × 2 objetivos(cono / mejor pata)

const ymd = (s) => s.replace(/-/g, "");
const iso = (y) => `${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}`;
const dd = (a, b) => Math.round((Date.parse(iso(b)) - Date.parse(iso(a))) / 86400000);
const media = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const desv = (a) => { if (a.length < 2) return 0; const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const tUna = (a) => (a.length < 3 ? NaN : media(a) / (desv(a) / Math.sqrt(a.length)));
const fmt = (x, d = 2) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d);

const J = JSON.parse(fs.readFileSync(PANEL, "utf8"));
const panel = J.panel;
const METRICAS = ["iGamma", "zGamma", "iVega", "zVega", "ivRel", "zIvRel"];

// rangos transversales dentro del día (igual que el paso 2)
const porDia = new Map();
for (const a of panel) { if (!porDia.has(a.dia)) porDia.set(a.dia, []); porDia.get(a.dia).push(a); }
for (const [, arr] of porDia) {
  if (arr.length < MIN_SIMBOLOS_DIA) continue;
  for (const h of [1, 5, 20]) {
    const con = arr.filter((a) => a[`r${h}`] != null);
    if (con.length >= MIN_SIMBOLOS_DIA) {
      const muA = media(con.map((a) => Math.abs(a[`r${h}`])));
      for (const a of con) a[`ax${h}`] = Math.abs(a[`r${h}`]) - muA;
    }
    const conM = arr.filter((a) => a[`m${h}`] != null);
    if (conM.length >= MIN_SIMBOLOS_DIA) {
      const muM = media(conM.map((a) => a[`m${h}`]));
      for (const a of conM) a[`mx${h}`] = a[`m${h}`] - muM;
    }
  }
  for (const M of METRICAS) {
    const con = arr.filter((a) => a[M] != null && Number.isFinite(a[M]));
    if (con.length < MIN_SIMBOLOS_DIA) continue;
    con.sort((x, y) => x[M] - y[M]);
    con.forEach((a, i) => { a[`p_${M}`] = con.length > 1 ? i / (con.length - 1) : 0.5; });
  }
  // quintil de volatilidad previa DENTRO del día — el control del artefacto
  const conRv = arr.filter((a) => a.rv != null);
  if (conRv.length >= MIN_SIMBOLOS_DIA) {
    conRv.sort((x, y) => x.rv - y.rv);
    conRv.forEach((a, i) => { a.qRv = Math.min(4, Math.floor((5 * i) / conRv.length)); a.pRv = i / (conRv.length - 1); });
  }
}
const listaDias = [...porDia.keys()].filter((d) => porDia.get(d).length >= MIN_SIMBOLOS_DIA).sort();

// ══════════════════════════════════════════════════════════════════════════════════════════
// A. ¿ES LA VOLATILIDAD DE BASE? — el único número grande, bajo la lupa
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("═".repeat(100));
console.log("A. AUTOPSIA DEL t=−4,01 — ¿flujo, o volatilidad de base?");
console.log("═".repeat(100));

// correlación de Spearman dentro del día entre ivRel y rv (los dos ya son rangos percentiles)
const rhos = [];
for (const d of listaDias) {
  const arr = porDia.get(d).filter((a) => a.p_ivRel != null && a.pRv != null);
  if (arr.length < MIN_SIMBOLOS_DIA) continue;
  const mx = media(arr.map((a) => a.p_ivRel)), my = media(arr.map((a) => a.pRv));
  let sxy = 0, sxx = 0, syy = 0;
  for (const a of arr) { const dx = a.p_ivRel - mx, dy = a.pRv - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (sxx > 0 && syy > 0) rhos.push(sxy / Math.sqrt(sxx * syy));
}
console.log(`  correlación de rangos ivRel ↔ volatilidad previa, dentro del día:`);
console.log(`    media ${fmt(media(rhos), 3)} sobre ${rhos.length} días · t de esa media contra cero: ${fmt(tUna(rhos))}`);
console.log(`    → si es claramente NEGATIVA, "pagan IV alta" está marcando a los tickers TRANQUILOS,`);
console.log(`      y un objetivo sin normalizar (|retorno| en puntos) los penaliza por definición.`);

// La misma prueba, pero comparando sólo dentro del mismo quintil de volatilidad
console.log(`\n  LA MISMA PRUEBA CONTROLANDO POR VOLATILIDAD (ordena por ivRel sólo dentro de cada quintil de rv):`);
console.log(`  objetivo                       sin control        con control por rv`);
console.log("  " + "─".repeat(70));
const autopsia = [];
for (const [pre, nom] of [["ax", "|retorno| en puntos"], ["mx", "movimiento / rv propia"]]) {
  // sin control
  const todas = panel.filter((a) => a.p_ivRel != null && a[`${pre}1`] != null);
  const ord = [...todas].sort((x, y) => y.p_ivRel - x.p_ivRel);
  const k = Math.floor(ord.length / 3);
  const sinC = { sep: media(ord.slice(0, k).map((a) => a[`${pre}1`])) - media(ord.slice(-k).map((a) => a[`${pre}1`])), t: tWelch(ord.slice(0, k).map((a) => a[`${pre}1`]), ord.slice(-k).map((a) => a[`${pre}1`])), n: todas.length };
  // con control: dentro de cada (día, quintil de rv) se parte en mitades por ivRel
  const alto = [], bajo = [];
  for (const d of listaDias) {
    for (let q = 0; q < 5; q++) {
      const g = porDia.get(d).filter((a) => a.qRv === q && a.p_ivRel != null && a[`${pre}1`] != null);
      if (g.length < 4) continue;
      const o = [...g].sort((x, y) => y.p_ivRel - x.p_ivRel);
      const kk = Math.floor(o.length / 2);
      for (const a of o.slice(0, kk)) alto.push(a[`${pre}1`]);
      for (const a of o.slice(-kk)) bajo.push(a[`${pre}1`]);
    }
  }
  const conC = { sep: media(alto) - media(bajo), t: tWelch(alto, bajo), n: alto.length + bajo.length };
  autopsia.push({ objetivo: pre, nom, sinControl: sinC, conControl: conC });
  console.log(`  ${nom.padEnd(28)} ${fmt(sinC.sep, 3).padStart(7)} (t ${fmt(sinC.t)})   ${fmt(conC.sep, 3).padStart(7)} (t ${fmt(conC.t)})  n=${conC.n}`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// B. EL DINERO — comprar el cono con precios REALES
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(100));
console.log("B. EL DINERO — cono real (call + put al ASK) sobre los tickers con cadena");
console.log("═".repeat(100));

const tickersCadena = [...new Set(fs.readdirSync(CDIR).filter((f) => /^[A-Z]+_d\d{8}\.json$/.test(f)).map((f) => f.split("_d")[0]))].sort();
const diasCadena = {};
for (const t of tickersCadena) {
  const ds = fs.readdirSync(CDIR).filter((f) => f.startsWith(`${t}_d2026`)).map((f) => f.slice(-13, -5)).sort().filter((d) => d >= "20260422" && d <= ULTIMO);
  if (ds.length) diasCadena[t] = ds;
}
const cierres = {};
for (const t of Object.keys(diasCadena)) if (fs.existsSync(`${CIERRES}/${t}.json`)) cierres[t] = JSON.parse(fs.readFileSync(`${CIERRES}/${t}.json`, "utf8"));
const conCadena = Object.keys(diasCadena).filter((t) => cierres[t]);
const enPanel = new Set(panel.map((a) => a.raiz));
const medibles = conCadena.filter((t) => enPanel.has(t));
console.log(`  tickers con cadena en la ventana: ${conCadena.length} · de ellos con flujo de MS en el panel: ${medibles.length}`);
console.log(`  ${medibles.join(" ")}`);
const fueraDeCadena = [...new Set(panel.map((a) => a.raiz))].filter((t) => !conCadena.includes(t)).length;
console.log(`  ✗ ${fueraDeCadena} tickers del panel NO tienen cadena: su señal se puede medir pero NO se puede comprar.`);

function elegir(cad, S, dteObj, dist, tipo, hoy) {
  let mejorExp = null, mejorDD = Infinity;
  for (const exp of Object.keys(cad)) {
    const d = dd(hoy, exp);
    if (d < 1) continue;
    const x = Math.abs(d - dteObj);
    if (x < mejorDD) { mejorDD = x; mejorExp = exp; }
  }
  if (!mejorExp || mejorDD > TOL_DTE[dteObj]) return null;
  const objetivo = tipo === "C" ? S * (1 + dist) : S * (1 - dist);
  let mejorK = null, mejorKD = Infinity;
  for (const clave of Object.keys(cad[mejorExp])) {
    const [ks, r] = clave.split("|");
    if (r !== tipo) continue;
    const K = Number(ks);
    const x = Math.abs(K - objetivo);
    if (x < mejorKD) { mejorKD = x; mejorK = K; }
  }
  if (mejorK == null) return null;
  const distReal = tipo === "C" ? mejorK / S - 1 : 1 - mejorK / S;
  if (Math.abs(distReal - dist) > dist * 0.30) return null;
  const [bid, ask] = cad[mejorExp][`${mejorK}|${tipo}`];
  if (!(ask > 0) || !(bid > 0) || ask < bid) return null;
  return { exp: mejorExp, K: mejorK, bid, ask };
}

// índice del panel por (ticker, día) para leer el rango de la métrica
const idxPanel = new Map();
for (const a of panel) idxPanel.set(`${a.raiz}|${a.dia}`, a);

const conos = [];
let sinCadena = 0, sinPata = 0, sinResolver = 0;
for (const t of medibles) {
  for (const dY of diasCadena[t]) {
    const d = iso(dY);
    const fila = idxPanel.get(`${t}|${d}`);
    if (!fila) { sinCadena++; continue; }                 // ese día MS no dio suficiente flujo del ticker
    const S = cierres[t][dY];
    if (!(S > 0)) continue;
    const p = `${CDIR}/${t}_d${dY}.json`;
    if (!fs.existsSync(p)) continue;
    let cad; try { cad = JSON.parse(fs.readFileSync(p, "utf8")); } catch { continue; }
    for (const dte of DTE) {
      const c = elegir(cad, S, dte, DIST, "C", dY);
      const put = elegir(cad, S, dte, DIST, "P", dY);
      if (!c || !put || c.exp !== put.exp) { sinPata++; continue; }
      const cierreExp = cierres[t][c.exp];
      if (!(cierreExp > 0)) { sinResolver++; continue; }
      const prima = (c.ask + put.ask) * 100;              // se COMPRA al ask, las dos patas
      const pago = (Math.max(0, cierreExp - c.K) + Math.max(0, put.K - cierreExp)) * 100;
      const fil = { ticker: t, fecha: d, dte, exp: c.exp, S, prima, pago, ret: pago / prima - 1,
        retCall: Math.max(0, cierreExp - c.K) / c.ask - 1, retPut: Math.max(0, put.K - cierreExp) / put.ask - 1,
        peaje: ((c.ask - c.bid) + (put.ask - put.bid)) / (c.ask + put.ask),
        tramo: d < RUPTURA ? "antes" : "despues" };
      for (const M of METRICAS) fil[`p_${M}`] = fila[`p_${M}`] ?? null;
      conos.push(fil);
    }
  }
}
console.log(`\n  conos construidos: ${conos.length} · ${sinCadena} días-ticker sin fila de flujo · ${sinPata} sin las dos patas · ${sinResolver} sin cierre del vencimiento`);
radiografia(conos, ["prima", "ret", "peaje", "S"], "conos reales", { cerosLegitimos: [] });

console.log(`\n  CONTROL — comprar el cono TODOS los días (sin señal):`);
for (const dte of DTE) {
  const g = conos.filter((f) => f.dte === dte);
  if (g.length < 20) continue;
  const r = g.map((f) => f.ret);
  console.log(`    ${String(dte).padStart(2)}d: n=${String(g.length).padStart(4)} · prima media $${media(g.map((f) => f.prima)).toFixed(0)} · peaje ${(100 * media(g.map((f) => f.peaje))).toFixed(1)}% · retorno ${fmt(100 * media(r), 1)}% · t=${fmt(tUna(r))}`);
}

console.log(`\n  CON SEÑAL — tercio ALTO menos tercio BAJO del ranking transversal de cada día:`);
console.log(`  métrica   dte    n_alto   ret_alto   ret_bajo    dif      t     n_ef(no solapado)`);
console.log("  " + "─".repeat(84));
const dinero = [];
for (const M of METRICAS) {
  for (const dte of DTE) {
    const g = conos.filter((f) => f.dte === dte && f[`p_${M}`] != null);
    if (g.length < 60) continue;
    const alto = g.filter((f) => f[`p_${M}`] >= 2 / 3), bajo = g.filter((f) => f[`p_${M}`] <= 1 / 3);
    if (alto.length < 20 || bajo.length < 20) continue;
    const ra = alto.map((f) => f.ret), rb = bajo.map((f) => f.ret);
    const t = tWelch(ra, rb);
    // n efectiva: días no solapados × tickers distintos que caen en el tercio
    const diasA = [...new Set(alto.map((f) => f.fecha))].length;
    const nEf = Math.floor(diasA / dte) * Math.min([...new Set(alto.map((f) => f.ticker))].length, Math.ceil(alto.length / diasA));
    dinero.push({ metrica: M, dte, nAlto: alto.length, nBajo: bajo.length, retAlto: media(ra), retBajo: media(rb), dif: media(ra) - media(rb), t, diasAlto: diasA, nEf });
    console.log(`  ${M.padEnd(8)} ${String(dte).padStart(3)}   ${String(alto.length).padStart(6)}   ${fmt(100 * media(ra), 1).padStart(7)}%   ${fmt(100 * media(rb), 1).padStart(7)}%  ${fmt(100 * (media(ra) - media(rb)), 1).padStart(7)}%  ${fmt(t).padStart(6)}   ${String(nEf).padStart(6)}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// C. EN DÓLARES AL AÑO, Y CUÁNTO FALTARÍA
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(100));
console.log(`C. EN DÓLARES AL AÑO — cuenta de $${CUENTA.toLocaleString()}`);
console.log("═".repeat(100));
const LIST_D = listonT(PRUEBAS_DINERO);
const mejorDinero = [...dinero].sort((a, b) => b.dif - a.dif)[0];
const anual = [];
for (const D of dinero) {
  const g = conos.filter((f) => f.dte === D.dte && f[`p_${D.metrica}`] != null && f[`p_${D.metrica}`] >= 2 / 3);
  const prima = media(g.map((f) => f.prima));
  const ciclos = 365 / D.dte;
  anual.push({ ...D, prima, ciclos, dolarAno: prima * D.retAlto * ciclos });
}
anual.sort((a, b) => b.dolarAno - a.dolarAno);
console.log("  métrica   dte   capital/cono   ret tercio alto   ciclos/año    $/año (1 cono)");
console.log("  " + "─".repeat(78));
for (const a of anual) console.log(`  ${a.metrica.padEnd(8)} ${String(a.dte).padStart(3)}   ${("$" + a.prima.toFixed(0)).padStart(11)}   ${fmt(100 * a.retAlto, 1).padStart(13)}%   ${a.ciclos.toFixed(1).padStart(8)}   ${("$" + a.dolarAno.toFixed(0)).padStart(14)}`);
const top = anual[0];
console.log(`\n  el mejor cubo (elegido CON retrovisor, así que es un techo, no una expectativa):`);
console.log(`    ${top.metrica} a ${top.dte}d → ${fmt(100 * top.retAlto, 1)}% por operación, $${top.prima.toFixed(0)} de capital por cono, $${top.dolarAno.toFixed(0)}/año con UN cono rodando.`);
console.log(`    con el 10% de la cuenta comprometido ($${(CUENTA * 0.1).toFixed(0)} = ${Math.floor(CUENTA * 0.1 / top.prima)} conos): $${(top.dolarAno * Math.floor(CUENTA * 0.1 / top.prima)).toFixed(0)}/año`);

console.log("\n" + "═".repeat(100));
console.log("CUÁNTO FALTARÍA — qué haría falta para que esto se pudiera establecer");
console.log("═".repeat(100));
const cuantoFalta = [];
for (const D of dinero) {
  const g = conos.filter((f) => f.dte === D.dte && f[`p_${D.metrica}`] != null);
  const s = desv(g.map((f) => f.ret));
  // n necesaria por grupo para que |t| llegue al listón con la separación OBSERVADA
  const nNec = D.dif !== 0 ? Math.ceil(2 * (LIST_D * s / D.dif) ** 2) : Infinity;
  const diasNec = Math.ceil(nNec / Math.max(1, D.nAlto / D.diasAlto) * 3);   // ×3: sólo un tercio entra
  cuantoFalta.push({ metrica: D.metrica, dte: D.dte, sd: s, difObs: D.dif, nNecPorGrupo: nNec, diasNec });
}
cuantoFalta.sort((a, b) => a.diasNec - b.diasNec);
console.log(`  listón de |t| con ${PRUEBAS_DINERO} pruebas de dinero: ${LIST_D}`);
console.log("  métrica   dte   sd del retorno   dif observada   n necesaria/grupo   días de flujo necesarios");
console.log("  " + "─".repeat(94));
for (const c of cuantoFalta.slice(0, 6)) console.log(`  ${c.metrica.padEnd(8)} ${String(c.dte).padStart(3)}   ${(100 * c.sd).toFixed(0).padStart(13)}%   ${fmt(100 * c.difObs, 1).padStart(12)}%   ${(Number.isFinite(c.nNecPorGrupo) ? c.nNecPorGrupo : "∞").toString().padStart(16)}   ${(Number.isFinite(c.diasNec) ? c.diasNec.toLocaleString() : "∞").padStart(22)}`);
console.log(`\n  hay ${listaDias.length} días de flujo de MarketSnack y su archivo es una ventana rodante: NO hay más`);
console.log(`  y no se pueden recuperar. La fila de arriba dice cuántos harían falta.`);

fs.writeFileSync(SALIDA, JSON.stringify({
  generado: new Date().toISOString(),
  parametros: { DIST, DTE, MIN_SIMBOLOS_DIA, RUPTURA, ULTIMO, PRUEBAS_DINERO, LISTON_DINERO: LIST_D, CUENTA },
  autopsiaIvRel: { rhoMedia: media(rhos), rhoT: tUna(rhos), nDias: rhos.length, detalle: autopsia },
  cobertura: { conCadena: conCadena.length, medibles: medibles.length, tickersPanelSinCadena: fueraDeCadena, conos: conos.length },
  control: DTE.map((dte) => { const g = conos.filter((f) => f.dte === dte); return { dte, n: g.length, prima: media(g.map((f) => f.prima)), peaje: media(g.map((f) => f.peaje)), ret: media(g.map((f) => f.ret)), t: tUna(g.map((f) => f.ret)) }; }),
  dinero, anual, cuantoFalta,
}, null, 1));
console.log(`\n→ ${SALIDA}`);
