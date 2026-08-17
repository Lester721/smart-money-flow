// LA CARTERA DE VERDAD — ¿el filtro se convierte en dinero, o se lo come la horquilla?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/cartera-gamma.mjs
//
// ═══ POR QUÉ ESTA PRUEBA Y NO OTRA ════════════════════════════════════════════════════════
//
// El filtro separa: los meses con mucha gamma en dólares lejos del dinero acaban en ganancia el
// 47% de las veces (decil 10) contra el 19% (decil 1). Pero en este proyecto TODO lo que separaba
// murió después en el vehículo: EVA separaba +2,43 puntos de forma monótona y el mejor tercio se
// quedaba en cero; el "+0,68% del flujo" de anoche era real y era peaje de horquilla.
//
// Así que la pregunta ya no es si separa. Es si **queda algo después de comprar al ask y vender
// al bid**, que en calls muy fuera del dinero es un peaje ancho.
//
// ═══ EL CRITERIO, ESCRITO ANTES DE CORRER NADA ════════════════════════════════════════════
//
// SIN MIRAR AL FUTURO, y esto es lo que más falsea este tipo de prueba:
//
// "Operar el 5% mejor de la historia" es tramposo — en 2018 nadie sabía cuál iba a ser el
// percentil 95 de los ocho años siguientes. Las reglas de aquí sólo usan información que existía
// ESE MES:
//
//   REGLA A · "el mejor del mes"      — cada mes, el ticker con la señal más alta de los 28.
//                                       12 operaciones al año. No necesita ningún umbral.
//   REGLA B · "sólo si destaca"       — el mejor del mes, PERO sólo si su señal supera el
//                                       percentil 90 de TODO lo visto hasta ese momento (ventana
//                                       expansiva, nunca futura). Menos operaciones, más selectivo.
//   CONTROL  · "al azar"              — cada mes, un ticker cualquiera. Es el listón: si A y B no
//                                       le ganan, el filtro no aporta nada.
//
// LA OPERACIÓN, idéntica en las tres reglas:
//   · Se compra la call del cubo estrella (>365 días, >60% fuera) más cercana al 60% de distancia,
//     con el vencimiento más cercano a 500 días. Al ASK real de cierre.
//   · Filtros de operabilidad: ask ≥ $0,10 y horquilla ≤ 40%. Si no hay ninguna, no se opera.
//   · $500 fijos por operación. Se compran contratos enteros; el resto se queda en caja.
//   · Se aguanta hasta VENCIMIENTO y se vende al BID real. Si el contrato desapareció de la
//     cadena, valió CERO — es la pérdida total, no un dato que falta.
//   · Comisiones cero (Robinhood). La horquilla SÍ está dentro.
//
// SE DECLARA ANTES: el resultado que importa es la CURVA DE DINERO, no la media de múltiplos. Y
// se compara contra comprar SPY el mismo período, que es el listón real de este proyecto.
//
// SI SALE MAL, hay que poder decir POR QUÉ. Por eso se reportan por separado: cuánto se pagó de
// horquilla, cuántas operaciones no se pudieron abrir, y cuál habría sido el resultado al punto
// medio (diagnóstico, NO operable).

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const FILAS = "scripts/puente-filas.json";
const POR_OPERACION = Number(process.env.POR_OPERACION || 500);
const DTE_OBJETIVO = 500, OTM_OBJETIVO = 60;
const ASK_MIN = 0.10, SPREAD_MAX = 0.40;

const ms = (y) => Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`);

// ── Calendario y cadenas ────────────────────────────────────────────────────
const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();

const cache = new Map();
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  const hit = cache.get(k);
  if (hit !== undefined) { cache.delete(k); cache.set(k, hit); return hit; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  const v = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  cache.set(k, v);
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return v;
}

/** Splits: el strike cambia y el contrato "desaparece". Se detectan solos. */
function splitsDe(sym) {
  const out = [];
  let prev = 0;
  for (const d of diasPorSim.get(sym) ?? []) {
    const c = cadena(sym, d);
    if (!c) continue;
    let maxK = 0;
    for (const g of Object.values(c)) for (const k of Object.keys(g)) { const v = Number(k.slice(0, -2)); if (v > maxK) maxK = v; }
    if (prev && maxK > 0 && prev / maxK >= 1.8) out.push({ desde: d, ratio: prev / maxK });
    prev = maxK;
  }
  return out;
}
const SPLITS = new Map();
const factorSplit = (sym, desde, hasta) => {
  if (!SPLITS.has(sym)) SPLITS.set(sym, splitsDe(sym));
  return SPLITS.get(sym).reduce((f, s) => (s.desde > desde && s.desde <= hasta ? f * s.ratio : f), 1);
};

/** Precio del subyacente por paridad put/call, del propio día. */
function spotDe(c) {
  let mejorK = null, mejorDif = Infinity;
  for (const g of Object.values(c)) {
    for (const [clave, ba] of Object.entries(g)) {
      if (clave.slice(-1) !== "C") continue;
      const K = Number(clave.slice(0, -2));
      const p = g[`${K}|P`];
      if (!p) continue;
      const dif = Math.abs((ba[0] + ba[1]) / 2 - (p[0] + p[1]) / 2);
      if (dif < mejorDif) { mejorDif = dif; mejorK = K; }
    }
  }
  return mejorK;
}

/** Elige el contrato del cubo estrella más cercano a los objetivos. null si no hay ninguno operable. */
function elegirContrato(sym, dia) {
  const c = cadena(sym, dia);
  if (!c) return null;
  const sp = spotDe(c);
  if (!sp) return null;
  let mejor = null, mejorCoste = Infinity;
  for (const [exp, g] of Object.entries(c)) {
    const dte = Math.round((ms(exp) - ms(dia)) / 86_400_000);
    if (dte <= 365) continue;
    for (const [clave, ba] of Object.entries(g)) {
      if (clave.slice(-1) !== "C") continue;
      const K = Number(clave.slice(0, -2));
      const otm = ((K - sp) / sp) * 100;
      if (otm <= OTM_OBJETIVO) continue;
      const [bid, ask] = ba;
      if (!(ask >= ASK_MIN) || !((ask - bid) / ask <= SPREAD_MAX)) continue;
      // "más cercano a los objetivos": se penaliza la distancia a 60% fuera y a 500 días
      const coste = Math.abs(otm - OTM_OBJETIVO) / 20 + Math.abs(dte - DTE_OBJETIVO) / 200;
      if (coste < mejorCoste) { mejorCoste = coste; mejor = { exp, K, clave, bid, ask, dte, otm, spot: sp }; }
    }
  }
  return mejor;
}

/** Vende al bid del último día hábil ≤ vencimiento. Ausente = CERO (pérdida total). */
function liquidar(sym, dia, ct) {
  const dias = diasPorSim.get(sym) ?? [];
  if (ct.exp > dias[dias.length - 1]) return null;      // aún no ha vencido: no se puede medir
  let lo = 0, hi = dias.length - 1, iu = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (dias[m] <= ct.exp) { iu = m; lo = m + 1; } else hi = m - 1; }
  if (iu < 0) return null;
  const dSal = dias[iu];
  const F = factorSplit(sym, dia, dSal);
  const claveSal = F === 1 ? ct.clave : `${ct.K / F}|C`;
  const sal = cadena(sym, dSal)?.[ct.exp]?.[claveSal];
  return { diaSal: dSal, bid: sal ? sal[0] * F : 0, mid: sal ? ((sal[0] + sal[1]) / 2) * F : 0 };
}

// ── Las señales, mes a mes ──────────────────────────────────────────────────
const filas = JSON.parse(readFileSync(FILAS, "utf8")).filter((x) => x.gamLejos != null);
const porMes = new Map();
for (const f of filas) {
  if (!porMes.has(f.mes)) porMes.set(f.mes, []);
  porMes.get(f.mes).push(f);
}
const meses = [...porMes.keys()].sort();

/** Último día hábil de ese mes para ese símbolo. */
function ultimoDiaDelMes(sym, mes) {
  const dias = (diasPorSim.get(sym) ?? []).filter((d) => d.slice(0, 6) === mes);
  return dias.length ? dias[dias.length - 1] : null;
}

// ── Las tres reglas ─────────────────────────────────────────────────────────
// El "azar" usa un generador con semilla fija: la prueba tiene que dar lo mismo cada vez que se
// corra, o no se puede auditar.
let semilla = 42;
const azar = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };

function correr(regla) {
  const vistas = [];                 // señales ya observadas — ventana EXPANSIVA, nunca futura
  const ops = [];
  let sinContrato = 0, sinLiquidar = 0, noOpera = 0;

  for (const mes of meses) {
    const delMes = porMes.get(mes);
    const ordenado = [...delMes].sort((a, b) => b.gamLejos - a.gamLejos);
    let elegido = null;

    if (regla === "azar") elegido = delMes[Math.floor(azar() * delMes.length)];
    else if (regla === "mejor") elegido = ordenado[0];
    else if (regla === "destaca") {
      // percentil 90 de TODO lo visto HASTA AHORA (sin el mes en curso)
      if (vistas.length >= 100) {
        const s = [...vistas].sort((a, b) => a - b);
        const p90 = s[Math.floor(s.length * 0.9)];
        if (ordenado[0].gamLejos >= p90) elegido = ordenado[0];
      }
    }
    for (const f of delMes) vistas.push(f.gamLejos);     // el mes se añade DESPUÉS de decidir
    if (!elegido) { noOpera++; continue; }

    const dia = ultimoDiaDelMes(elegido.ticker, mes);
    if (!dia) { sinContrato++; continue; }
    const ct = elegirContrato(elegido.ticker, dia);
    if (!ct) { sinContrato++; continue; }
    const liq = liquidar(elegido.ticker, dia, ct);
    if (!liq) { sinLiquidar++; continue; }

    const nContratos = Math.floor(POR_OPERACION / (ct.ask * 100));
    if (nContratos < 1) { sinContrato++; continue; }
    const invertido = nContratos * ct.ask * 100;
    const recuperado = nContratos * liq.bid * 100;
    const alMid = nContratos * liq.mid * 100;
    ops.push({
      mes, ticker: elegido.ticker, dia, exp: ct.exp, K: ct.K, dte: ct.dte, otm: ct.otm,
      ask: ct.ask, bid: ct.bid, nContratos, invertido, recuperado, alMid,
      spreadPagado: nContratos * (ct.ask - ct.bid) * 100,
      diaSal: liq.diaSal, mult: recuperado / invertido,
    });
  }
  return { ops, sinContrato, sinLiquidar, noOpera };
}

// ── Resultados ──────────────────────────────────────────────────────────────
const eur = (x) => `$${Math.round(x).toLocaleString("es-ES")}`;
console.log(`\n## CARTERA · $${POR_OPERACION} por operación · comprar al ask, vender al bid, aguantar a vencimiento\n`);
console.log(`${meses.length} meses (${meses[0]} → ${meses[meses.length - 1]}) · ${diasPorSim.size} tickers\n`);

const resultados = {};
for (const regla of ["azar", "mejor", "destaca"]) {
  const { ops, sinContrato, sinLiquidar, noOpera } = correr(regla);
  resultados[regla] = ops;
  if (!ops.length) { console.log(`${regla}: sin operaciones`); continue; }
  const inv = ops.reduce((a, o) => a + o.invertido, 0);
  const rec = ops.reduce((a, o) => a + o.recuperado, 0);
  const mid = ops.reduce((a, o) => a + o.alMid, 0);
  const sp = ops.reduce((a, o) => a + o.spreadPagado, 0);
  const gan = ops.filter((o) => o.recuperado > o.invertido).length;
  const años = (ms(meses[meses.length - 1] + "01") - ms(meses[0] + "01")) / (365 * 86_400_000);
  const nombre = { azar: "CONTROL · al azar", mejor: "REGLA A · el mejor del mes", destaca: "REGLA B · sólo si destaca" }[regla];
  console.log(`── ${nombre}`);
  console.log(`   ${ops.length} operaciones (${(ops.length / años).toFixed(1)}/año) · ganan ${gan} (${((gan / ops.length) * 100).toFixed(0)}%)`);
  console.log(`   invertido ${eur(inv)} → recuperado ${eur(rec)}   =  ${(rec / inv).toFixed(2)}x   (${rec > inv ? "+" : ""}${eur(rec - inv)})`);
  console.log(`   horquilla pagada al entrar: ${eur(sp)} (${((sp / inv) * 100).toFixed(1)}% de lo invertido)`);
  console.log(`   al punto medio habría sido ${(mid / inv).toFixed(2)}x  ← diagnóstico, NO operable`);
  if (sinContrato || sinLiquidar || noOpera)
    console.log(`   descartes: sin contrato operable ${sinContrato} · sin liquidar (aún vivo) ${sinLiquidar} · no opera ${noOpera}`);
  console.log("");
}

// ── La curva, año a año ─────────────────────────────────────────────────────
console.log("── CÓMO FUE AÑO A AÑO (regla A) ──");
const porAño = new Map();
for (const o of resultados.mejor ?? []) {
  const a = o.mes.slice(0, 4);
  if (!porAño.has(a)) porAño.set(a, { inv: 0, rec: 0, n: 0, gan: 0 });
  const x = porAño.get(a);
  x.inv += o.invertido; x.rec += o.recuperado; x.n++; if (o.recuperado > o.invertido) x.gan++;
}
for (const [a, x] of [...porAño].sort())
  console.log(`   ${a}  ${String(x.n).padStart(2)} ops · ${eur(x.inv)} → ${eur(x.rec)}  ${(x.rec / x.inv).toFixed(2)}x  (${x.gan} ganadoras)`);

console.log(`
⚠️  LO QUE ESTO NO ES: no es una curva de patrimonio con reinversión. Es "$${POR_OPERACION} por
   operación, ¿cuánto vuelve?". La reinversión y el tamaño de posición son la siguiente pregunta,
   y con una distribución de lotería cambian el resultado por completo.`);
