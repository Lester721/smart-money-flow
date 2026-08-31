// Z3 — LA DISTANCIA MEDIDA EN MOVIMIENTO ESPERADO, NO EN PORCENTAJE.
//
// ═══ QUÉ MIDE Y POR QUÉ ═════════════════════════════════════════════════════════════════════
//
// La esquina barata compra "5% fuera del dinero". Pero un 5% NO es lo mismo en KO que en TSLA:
// en una acción tranquila el 5% está lejísimos y la opción casi nunca llega; en una nerviosa el
// 5% es casi el dinero. Mezclar las dos cosas en la misma celda mete ruido en TODAS las celdas,
// y puede ser la razón de que el mapa de la rejilla salga plano.
//
// Aquí la distancia se mide en unidades del MOVIMIENTO QUE EL MERCADO DESCUENTA. Ese movimiento
// se lee SIN NINGÚN MODELO, directamente de la cadena: la CUÑA al dinero = call al dinero (ask)
// + put al dinero (ask) del mismo vencimiento. Eso es, literalmente, lo que cuesta comprar el
// movimiento hasta el vencimiento — es un precio, no una estimación.
//
//   distancia en cuñas = |strike − spot| / cuña        (0,25 · 0,5 · 0,75 · 1 · 1,5 · 2)
//
// Se barre eso contra los mismos plazos y salidas, y AL LADO se barre la misma rejilla con la
// distancia en PORCENTAJE del precio (2 · 5 · 8 · 12 · 20 %), que es como se hacía. Así la
// comparación es cara a cara: ¿normalizar por la cuña mejora el ratio respecto a normalizar por
// el precio, con el mismo plazo y la misma salida?
//
// Y la pregunta hermana: ¿HAY TICKERS QUE SON MEJOR ENVASE QUE OTROS? Con 40 se puede mirar.
// Se reporta el ratio por ticker, cuántos aportan la mitad del dinero ganado, y si los buenos son
// los de mayor VOLATILIDAD DE LA VOLATILIDAD — que también se lee sin modelo, como la dispersión
// de la propia cuña a lo largo de los años.
//
// ═══ LA VARA ════════════════════════════════════════════════════════════════════════════════
//
//   RATIO = dólares ganados en total / dólares perdidos en total, arriesgando $1.000 en cada
//   intento (tamaño igual siempre; sumar primas mediría el tamaño de los contratos, no la idea).
//
//   El listón ya medido (5% · 90 días · salir a los 23): el CONO da 1,03. Calls 1,45, puts 0,65.
//   El cono es la medida honesta: el 1,45 de las calls es la deriva de una década alcista.
//
// ═══ LAS REGLAS DE LA CASA ══════════════════════════════════════════════════════════════════
//   1. Se COMPRA al ASK y se VENDE al BID. Nunca punto medio.
//   2. Ningún modelo de precios. Si el precio no está en la cadena, la operación no existe.
//   3. Un HUECO no es un cero: si no hay cadena el día de salida, la operación se descarta y se
//      cuenta aparte. Si la cadena SÍ está y el contrato no tiene puja, eso es un CERO real.
//   4. Sólo el pasado: el spot, la cuña y el strike salen de la cadena del propio día de entrada.
//   5. La salida nunca cae después del vencimiento (si cayera, no se puede leer el bid: se
//      descarta y se cuenta aparte, jamás se pone 0).
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/z3-la-distancia-en-movimiento.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const ASK_MIN = 0.10;
const APUESTA = 1000;

const CUNAS  = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0];   // distancia en cuñas
const PCTS   = [0.02, 0.05, 0.08, 0.12, 0.20];      // distancia en % del precio (el brazo de control)
const PLAZOS = [30, 60, 90, 120];                   // días hasta el vencimiento (objetivo)
const SALIDAS = [5, 11, 23];                        // días de bolsa hasta salir

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const pct = (x) => (100 * x).toFixed(1) + "%";
const fmt = (n) => Math.round(n).toLocaleString("es-ES");
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const cal = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);

// ── índice de días por ticker ────────────────────────────────────────────────
const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
const TICKERS = [...diasPorSim.keys()].sort();
const TOTDIAS = [...diasPorSim.values()].reduce((a, v) => a + v.length, 0);
console.log(`\n## ${TICKERS.length} tickers · ${TOTDIAS.toLocaleString("es-ES")} días de cadena`);
console.log(`## rejilla: ${CUNAS.length} distancias en cuñas + ${PCTS.length} en % × ${PLAZOS.length} plazos × ${SALIDAS.length} salidas`);
console.log(`## = ${(CUNAS.length + PCTS.length) * PLAZOS.length * SALIDAS.length} CELDAS medidas sobre los mismos 10 años\n`);

// ── caché acotada de cadenas ─────────────────────────────────────────────────
const cache = new Map();
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  if (cache.has(k)) { const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  let v = null;
  if (existsSync(f)) { try { v = JSON.parse(readFileSync(f, "utf8")); } catch { v = null; } }
  if (cache.size >= 120) cache.delete(cache.keys().next().value);
  cache.set(k, v);
  return v;
}
/** El spot por PARIDAD: el strike donde call y put valen casi lo mismo. Identidad, no modelo. */
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

// ── acumuladores por celda ───────────────────────────────────────────────────
const celdas = new Map();
function celda(k) {
  if (!celdas.has(k)) celdas.set(k, {
    k, n: 0, gan: 0, per: 0, wins: 0, sinValor: 0, huecos: 0, sumAskPct: 0, maxWin: 0,
    porTipo: { C: { n: 0, gan: 0, per: 0, wins: 0 }, P: { n: 0, gan: 0, per: 0, wins: 0 } },
    porAno: new Map(), porTicker: new Map(),
  });
  return celdas.get(k);
}
function registrar(k, sym, ano, tipo, ask, bid, S) {
  const c = celda(k);
  const ret = (bid - ask) / ask;
  const d = APUESTA * ret;
  c.n++; c.sumAskPct += ask / S;
  if (bid <= 0) c.sinValor++;
  const t = c.porTipo[tipo]; t.n++;
  if (d > 0) { c.gan += d; c.wins++; t.gan += d; t.wins++; if (d > c.maxWin) c.maxWin = d; }
  else { c.per += -d; t.per += -d; }
  for (const [mp, key] of [[c.porAno, ano], [c.porTicker, sym]]) {
    if (!mp.has(key)) mp.set(key, { n: 0, gan: 0, per: 0, wins: 0, C: { gan: 0, per: 0 }, P: { gan: 0, per: 0 } });
    const o = mp.get(key); o.n++;
    if (d > 0) { o.gan += d; o.wins++; o[tipo].gan += d; } else { o.per += -d; o[tipo].per += -d; }
  }
}
const ratio = (o) => (o.per > 0 ? o.gan / o.per : (o.gan > 0 ? Infinity : NaN));

// ── contadores de sanidad globales ───────────────────────────────────────────
let opsTot = 0, huecosTot = 0, trasVto = 0, sinSalida = 0, expVacia = 0;
let entradasOk = 0, entradasSinSpot = 0, entradasSinCadena = 0;
const cunaPorTicker = new Map();   // W/S al plazo de 90 días → volatilidad de la volatilidad

// ── el barrido ───────────────────────────────────────────────────────────────
for (const sym of TICKERS) {
  const ds = diasPorSim.get(sym);
  const vistos = new Set();
  for (let i = 0; i < ds.length; i++) {
    const dia = ds[i];
    const mes = dia.slice(0, 6);
    if (vistos.has(mes)) continue;       // una entrada al mes por ticker, como el listón
    vistos.add(mes);
    const ano = dia.slice(0, 4);

    const c = cadena(sym, dia);
    if (!c) { entradasSinCadena++; continue; }
    const S = spotDe(c);
    if (!(S > 0)) { entradasSinSpot++; continue; }
    entradasOk++;

    // días de salida candidatos (por índice de día de bolsa, como el listón)
    const salDia = new Map();
    for (const sal of SALIDAS) {
      const j = i + sal;
      if (j >= ds.length) { sinSalida++; continue; }
      const d2 = ds[j], k = cal(dia, d2);
      if (k >= 1 && k <= sal * 3 + 10) salDia.set(sal, d2);   // guarda contra huecos del calendario
      else sinSalida++;
    }
    if (!salDia.size) continue;

    // vencimientos disponibles
    const expArr = [];
    for (const e of Object.keys(c)) { const d = cal(dia, e); if (d >= 1) expArr.push([e, d]); }
    if (!expArr.length) continue;

    const pedidos = [];   // {sal, exp, K, tipo, ask, key}
    for (const dteObj of PLAZOS) {
      const tolDte = Math.max(10, Math.round(dteObj * 0.30));
      let exp = null, dd = Infinity;
      for (const [e, d] of expArr) { const x = Math.abs(d - dteObj); if (x < dd) { dd = x; exp = e; } }
      if (!exp || dd > tolDte) continue;
      const g = c[exp];

      // LA CUÑA: call al dinero (ask) + put al dinero (ask) del mismo vencimiento
      let K0 = null, d0 = Infinity, W = 0;
      for (const [cl, ba] of Object.entries(g)) {
        if (cl.slice(-1) !== "C") continue;
        const K = Number(cl.slice(0, -2));
        const p = g[`${K}|P`];
        if (!p || !(ba[1] > 0) || !(p[1] > 0)) continue;
        const d = Math.abs(K - S);
        if (d < d0) { d0 = d; K0 = K; W = ba[1] + p[1]; }
      }
      if (!(W > 0) || K0 === null) continue;
      if (dteObj === 90) {
        if (!cunaPorTicker.has(sym)) cunaPorTicker.set(sym, []);
        cunaPorTicker.get(sym).push(W / S);
      }

      // strikes utilizables por lado (con ask mínimo real)
      const lados = { C: [], P: [] };
      for (const [cl, ba] of Object.entries(g)) {
        if (!(ba[1] >= ASK_MIN)) continue;
        lados[cl.slice(-1)]?.push([Number(cl.slice(0, -2)), ba[1]]);
      }

      const familias = [
        ["cuna", CUNAS, (m) => m * W, (K, tipo) => (tipo === "C" ? K - S : S - K) / W, (m) => Math.max(0.12, 0.30 * m)],
        ["pct", PCTS, (m) => m * S, (K, tipo) => (tipo === "C" ? K - S : S - K) / S, (m) => Math.max(0.01, 0.30 * m)],
      ];
      for (const [fam, ms_, dist, distReal, tol] of familias) {
        for (const m of ms_) {
          for (const tipo of ["C", "P"]) {
            const objetivo = tipo === "C" ? S + dist(m) : S - dist(m);
            let mejorK = null, mejorAsk = 0, md = Infinity;
            for (const [K, ask] of lados[tipo]) { const d = Math.abs(K - objetivo); if (d < md) { md = d; mejorK = K; mejorAsk = ask; } }
            if (mejorK === null) continue;
            if (Math.abs(distReal(mejorK, tipo) - m) > tol(m)) continue;   // el strike disponible se aleja demasiado
            for (const [sal, d2] of salDia) {
              if (d2 >= exp) { trasVto++; continue; }                      // la salida caería tras el vencimiento
              pedidos.push({ sal, d2, exp, K: mejorK, tipo, ask: mejorAsk, key: `${fam}|${m}|${dteObj}|${sal}` });
            }
          }
        }
      }
    }
    if (!pedidos.length) continue;

    // una carga por día de salida
    const porDia = new Map();
    for (const p of pedidos) { if (!porDia.has(p.d2)) porDia.set(p.d2, []); porDia.get(p.d2).push(p); }
    for (const [d2, lista] of porDia) {
      const c2 = cadena(sym, d2);
      for (const p of lista) {
        if (!c2) { celda(p.key).huecos++; huecosTot++; continue; }   // UN HUECO NO ES UN CERO
        const g2 = c2[p.exp];
        if (!g2) expVacia++;
        const bid = g2 ? (g2[`${p.K}|${p.tipo}`]?.[0] ?? 0) : 0;
        registrar(p.key, sym, ano, p.tipo, p.ask, bid, S);
        opsTot++;
      }
    }
  }
  cache.clear();
  process.stdout.write(`\r   ${sym.padEnd(6)} · ${opsTot.toLocaleString("es-ES")} operaciones   `);
}
console.log("\n");

// ═══ SANIDAD ════════════════════════════════════════════════════════════════
const todas = [...celdas.values()];
const sumaN = todas.reduce((a, c) => a + c.n, 0);
console.log("═".repeat(100));
console.log("  SANIDAD — antes de mirar ningún ratio");
console.log("═".repeat(100));
console.log(`  días de entrada usables ${fmt(entradasOk)} · sin cadena ${fmt(entradasSinCadena)} · sin spot por paridad ${fmt(entradasSinSpot)}`);
console.log(`  operaciones medidas     ${fmt(sumaN)}  (en ${celdas.size} celdas)`);
console.log(`  HUECOS (sin cadena el día de salida, descartadas) ${fmt(huecosTot)}`);
console.log(`     ↑ sale 0 POR CONSTRUCCIÓN: el día de salida se elige de la propia lista de días CON cadena del ticker.`);
console.log(`       El descarte real está en las dos líneas de abajo, y ésas sí se cuentan aparte y no se rellenan.`);
console.log(`  descartadas porque la salida caía tras el vencimiento: ${fmt(trasVto)}`);
console.log(`  días de salida fuera de rango (hueco de calendario): ${fmt(sinSalida)}`);
console.log(`  vencimiento ausente en la cadena de salida (se lee 0): ${fmt(expVacia)} → ${pct(expVacia / Math.max(1, sumaN))}`);
{
  const base = celdas.get("pct|0.05|90|23");
  if (base) {
    console.log(`\n  CELDA DE CONTROL — 5% · 90 días · salir a los 23 (el listón conocido: cono 1,03)`);
    console.log(`     n=${fmt(base.n)} · coste medio de entrada ${pct(base.sumAskPct / base.n)} del subyacente · ` +
      `vence sin valor ${pct(base.sinValor / base.n)} · RATIO cono ${ratio(base).toFixed(2)} · ` +
      `calls ${ratio(base.porTipo.C).toFixed(2)} · puts ${ratio(base.porTipo.P).toFixed(2)}`);
  }
}
{
  const costes = todas.map((c) => c.sumAskPct / c.n);
  console.log(`  coste de entrada en el conjunto de la rejilla: de ${pct(Math.min(...costes))} a ${pct(Math.max(...costes))} del subyacente`);
  console.log(`  (una opción 5% fuera a 90 días cuesta típicamente entre el 1% y el 6% — si no, hay un fallo)\n`);
}

// ═══ EL MAPA, FAMILIA POR FAMILIA ═══════════════════════════════════════════
const MIN_N = 400;
function fila(c) {
  const [fam, m, dte, sal] = c.k.split("|");
  const et = fam === "cuna" ? `${Number(m).toFixed(2).replace(".", ",")} cuñas` : `${(100 * Number(m)).toFixed(0)}%`;
  return `| ${et.padStart(11)} | ${String(dte).padStart(3)}d | ${String(sal).padStart(2)} | ${fmt(c.n).padStart(6)} | ` +
    `${pct(c.wins / c.n).padStart(6)} | ${pct(c.sumAskPct / c.n).padStart(6)} | ${pct(c.sinValor / c.n).padStart(6)} | ` +
    `**${ratio(c).toFixed(2)}** | ${ratio(c.porTipo.C).toFixed(2)} | ${ratio(c.porTipo.P).toFixed(2)} |`;
}
const CAB = "| distancia | plazo | sal | n | acierta | coste | sin valor | RATIO cono | calls | puts |\n|---|---|---|---|---|---|---|---|---|---|";

for (const fam of ["cuna", "pct"]) {
  const nom = fam === "cuna" ? "DISTANCIA EN CUÑAS (el movimiento que descuenta el mercado)" : "DISTANCIA EN % DEL PRECIO (el control — como se hacía)";
  console.log(`\n### ${nom}\n`);
  console.log(CAB);
  const cs = todas.filter((c) => c.k.startsWith(fam + "|") && c.n >= MIN_N)
    .sort((a, b) => ratio(b) - ratio(a));
  for (const c of cs) console.log(fila(c));
  const flacas = todas.filter((c) => c.k.startsWith(fam + "|") && c.n < MIN_N).length;
  if (flacas) console.log(`  (${flacas} celdas escondidas por tener menos de ${MIN_N} operaciones)`);
}

// ═══ CARA A CARA: mismo plazo, misma salida ═════════════════════════════════
console.log(`\n### CARA A CARA — con el MISMO plazo y la MISMA salida, ¿cuál normaliza mejor?\n`);
console.log("| plazo | salida | mejor CUÑA | ratio | mejor % | ratio | gana |");
console.log("|---|---|---|---|---|---|---|");
let ganaCuna = 0, ganaPct = 0;
for (const dte of PLAZOS) for (const sal of SALIDAS) {
  const sel = (fam) => todas.filter((c) => c.k.startsWith(fam + "|") && c.k.endsWith(`|${dte}|${sal}`) && c.n >= MIN_N)
    .sort((a, b) => ratio(b) - ratio(a))[0];
  const a = sel("cuna"), b = sel("pct");
  if (!a || !b) continue;
  const ga = ratio(a) > ratio(b);
  ga ? ganaCuna++ : ganaPct++;
  const eA = Number(a.k.split("|")[1]).toFixed(2).replace(".", ",") + " cuñas";
  const eB = (100 * Number(b.k.split("|")[1])).toFixed(0) + "%";
  console.log(`| ${dte}d | ${sal} | ${eA} | ${ratio(a).toFixed(2)} | ${eB} | ${ratio(b).toFixed(2)} | ${ga ? "CUÑA" : "%"} |`);
}
console.log(`\n  la cuña gana en ${ganaCuna} de ${ganaCuna + ganaPct} combinaciones de plazo × salida`);

// ═══ LA MEJOR CELDA, A FONDO ════════════════════════════════════════════════
const mejor = todas.filter((c) => c.n >= MIN_N).sort((a, b) => ratio(b) - ratio(a))[0];
const [famM, mM, dteM, salM] = mejor.k.split("|");
const etM = famM === "cuna" ? `${Number(mM).toFixed(2).replace(".", ",")} cuñas fuera del dinero` : `${(100 * Number(mM)).toFixed(0)}% fuera del dinero`;
console.log(`\n${"═".repeat(100)}`);
console.log(`  LA MEJOR CELDA: ${etM} · ${dteM} días de plazo · salir a los ${salM} días de bolsa`);
console.log(`${"═".repeat(100)}`);
console.log(`  n=${fmt(mejor.n)} · acierta ${pct(mejor.wins / mejor.n)} · gana $${fmt(mejor.gan)} · pierde $${fmt(mejor.per)} · RATIO ${ratio(mejor).toFixed(2)}`);
console.log(`  calls ${ratio(mejor.porTipo.C).toFixed(2)} · puts ${ratio(mejor.porTipo.P).toFixed(2)} · huecos ${fmt(mejor.huecos)} · vence sin valor ${pct(mejor.sinValor / mejor.n)}`);
console.log(`  el mayor billete pagó $${fmt(mejor.maxWin)} sobre $${APUESTA} · sin ese único evento el ratio sería ${((mejor.gan - mejor.maxWin) / mejor.per).toFixed(2)}`);

console.log(`\n  AÑO A AÑO (el cono):`);
const anos = [...mejor.porAno.keys()].sort();
for (const a of anos) { const o = mejor.porAno.get(a); console.log(`    ${a}  n=${String(o.n).padStart(5)} · acierta ${pct(o.wins / o.n).padStart(6)} · gana $${fmt(o.gan).padStart(9)} · pierde $${fmt(o.per).padStart(9)} · RATIO ${ratio(o).toFixed(2)}`); }
const anosMalos = anos.filter((a) => ratio(mejor.porAno.get(a)) < 1).length;
console.log(`    → ${anosMalos} de ${anos.length} años por debajo de 1`);

console.log(`\n  VECINDAD (¿meseta o diente solitario?):`);
{
  const lista = famM === "cuna" ? CUNAS : PCTS;
  const iM = lista.indexOf(Number(mM));
  const vecinos = [];
  for (const dm of [-1, 0, 1]) for (const dd of [-1, 0, 1]) for (const dsl of [-1, 0, 1]) {
    const im = iM + dm, id = PLAZOS.indexOf(Number(dteM)) + dd, is = SALIDAS.indexOf(Number(salM)) + dsl;
    if (im < 0 || im >= lista.length || id < 0 || id >= PLAZOS.length || is < 0 || is >= SALIDAS.length) continue;
    const c = celdas.get(`${famM}|${lista[im]}|${PLAZOS[id]}|${SALIDAS[is]}`);
    if (c && c.n >= MIN_N) vecinos.push([`${lista[im]}·${PLAZOS[id]}d·${SALIDAS[is]}`, ratio(c)]);
  }
  console.log("    " + vecinos.map(([k, r]) => `${k}=${r.toFixed(2)}`).join("  "));
  const rs = vecinos.map((v) => v[1]);
  console.log(`    ${vecinos.length} vecinas medidas · de ${Math.min(...rs).toFixed(2)} a ${Math.max(...rs).toFixed(2)} · ${rs.filter((r) => r >= 1.03).length} por encima del listón`);
}

// ═══ ¿HAY TICKERS QUE SON MEJOR ENVASE? ═════════════════════════════════════
console.log(`\n${"═".repeat(100)}`);
console.log(`  ¿HAY TICKERS QUE SON MEJOR ENVASE? (en la mejor celda)`);
console.log(`${"═".repeat(100)}`);
const volvol = new Map();
for (const [t, v] of cunaPorTicker) if (v.length >= 24) volvol.set(t, sd(v) / media(v));
const porT = [...mejor.porTicker.entries()].map(([t, o]) => ({ t, ...o, r: ratio(o), vv: volvol.get(t) ?? NaN, cuna: media(cunaPorTicker.get(t) ?? [NaN]) }))
  .sort((a, b) => b.r - a.r);
console.log("| ticker | n | acierta | gana | pierde | RATIO cono | calls | puts | cuña media | vol de la vol |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const x of porT) console.log(`| ${x.t} | ${x.n} | ${pct(x.wins / x.n)} | $${fmt(x.gan)} | $${fmt(x.per)} | **${x.r.toFixed(2)}** | ${ratio(x.C).toFixed(2)} | ${ratio(x.P).toFixed(2)} | ${pct(x.cuna)} | ${Number.isFinite(x.vv) ? x.vv.toFixed(2) : "—"} |`);
console.log(`  (los tickers con n de un dígito sólo tienen unos pocos meses de cadena en disco: su ratio es RUIDO, no envase)`);

const totalGan = porT.reduce((a, x) => a + x.gan, 0);
const orden = [...porT].sort((a, b) => b.gan - a.gan);
let acum = 0, cuantos = 0;
for (const x of orden) { acum += x.gan; cuantos++; if (acum >= totalGan / 2) break; }
console.log(`\n  ${cuantos} tickers de ${porT.length} aportan la MITAD del dinero ganado (los primeros: ${orden.slice(0, cuantos).map((x) => x.t).join(", ")})`);
console.log(`  tickers con ratio ≥ 1,03: ${porT.filter((x) => x.r >= 1.03).length} de ${porT.length}`);

// las dos mitades del tiempo, para la mejor celda
{
  const s = (fil) => [...mejor.porAno].filter(([a]) => fil(a)).reduce((x, [, o]) => ({ gan: x.gan + o.gan, per: x.per + o.per }), { gan: 0, per: 0 });
  const A = s((a) => a <= "2020"), B = s((a) => a > "2020");
  console.log(`\n  LAS DOS MITADES DEL TIEMPO: 2016-2020 → ${ratio(A).toFixed(2)}   ·   2021-2026 → ${ratio(B).toFixed(2)}`);
  console.log(`  CRISIS POR SEPARADO: ` + ["2018", "2020", "2022", "2025"].map((a) => `${a}=${mejor.porAno.has(a) ? ratio(mejor.porAno.get(a)).toFixed(2) : "—"}`).join(" · "));
}

// correlación de rangos entre "vol de la vol" y ratio
{
  const con = porT.filter((x) => Number.isFinite(x.vv) && Number.isFinite(x.r) && x.n >= 150);
  if (con.length >= 10) {
    const rank = (arr, f) => { const s = [...arr].sort((a, b) => f(a) - f(b)); const m = new Map(); s.forEach((x, i) => m.set(x.t, i + 1)); return m; };
    const rv = rank(con, (x) => x.vv), rr = rank(con, (x) => x.r);
    const n = con.length;
    const d2 = con.reduce((a, x) => a + (rv.get(x.t) - rr.get(x.t)) ** 2, 0);
    const rho = 1 - (6 * d2) / (n * (n * n - 1));
    console.log(`  correlación de rangos entre VOLATILIDAD DE LA VOLATILIDAD y ratio del ticker: ${rho.toFixed(3)} (n=${n})`);
    const rc = rank(con, (x) => x.cuna);
    const d2c = con.reduce((a, x) => a + (rc.get(x.t) - rr.get(x.t)) ** 2, 0);
    console.log(`  correlación de rangos entre TAMAÑO de la cuña (nerviosismo) y ratio del ticker:  ${(1 - (6 * d2c) / (n * (n * n - 1))).toFixed(3)}`);
  }
}

// ── ¿aguanta el reparto por mitades de tickers? ──────────────────────────────
{
  const mitad = Math.floor(porT.length / 2);
  const orA = [...porT].sort((a, b) => a.t.localeCompare(b.t));
  const suma = (l) => l.reduce((a, x) => ({ gan: a.gan + x.gan, per: a.per + x.per }), { gan: 0, per: 0 });
  const A = suma(orA.slice(0, mitad)), B = suma(orA.slice(mitad));
  console.log(`  partiendo los tickers en dos por orden alfabético: ${ratio(A).toFixed(2)} y ${ratio(B).toFixed(2)}`);
}

// ── volcado para quien quiera repasarlo ──────────────────────────────────────
writeFileSync("scripts/z3-la-distancia-en-movimiento.json", JSON.stringify(todas.map((c) => ({
  celda: c.k, n: c.n, ratio: ratio(c), ratioC: ratio(c.porTipo.C), ratioP: ratio(c.porTipo.P),
  acierto: c.wins / c.n, gan: c.gan, per: c.per, huecos: c.huecos, sinValor: c.sinValor / c.n,
  costePct: c.sumAskPct / c.n, maxWin: c.maxWin,
  porAno: Object.fromEntries([...c.porAno].map(([a, o]) => [a, ratio(o)])),
})), null, 1), "utf8");
console.log(`\nescrito scripts/z3-la-distancia-en-movimiento.json`);
