// LOS CONTRATOS QUE MULTIPLICARON POR 10 — qué tenían en común, y cuántos más lo tenían y NO explotaron
//
// Uso: node --max-old-space-size=8192 scripts/contratos-10x.mjs
// Salida: scripts/10x-resumen.json
//
// ═══ LA PREGUNTA DE LESTER (2026-08-16) ═══════════════════════════════════════════════════
//
// "¿Podemos analizar los contratos que subieron un 1000% y ver qué tenían en común, para crear
//  nuestras propias reglas de qué buscar antes de que el precio explote?"
//
// Es un enfoque distinto a todo lo anterior: hasta ahora siempre partíamos de "el flujo lo marcó,
// ¿ganó?". Esto invierte la pregunta: parte de los ganadores.
//
// ═══ LA TRAMPA, Y CÓMO SE EVITA — leer antes de creerse cualquier número de aquí ══════════
//
// Mirar sólo a los ganadores es SELECCIONAR POR EL RESULTADO, el error que se lleva por delante
// casi todos los estudios de este tipo. Si coges los contratos que hicieron 10x vas a encontrar
// que casi todos eran calls baratas, lejos del dinero y de poco plazo. Y también lo eran DIEZ MIL
// que se fueron a cero. "Lo que tenían en común" no es una regla: es una descripción.
//
// Por eso este script mide siempre LAS DOS MITADES:
//   1. Qué caracteriza a los que hicieron 10x.
//   2. LA TASA BASE: de todos los contratos con ESAS MISMAS características, ¿qué fracción lo
//      consiguió? Si de cada 1.000 candidatos explotan 3, la "regla" pierde dinero aunque los 3
//      hagan x10 — y eso sólo se ve con el denominador delante.
//
// ═══ DEFINICIONES, para que no haya ambigüedad ════════════════════════════════════════════
//
// COMPRAR = pagar el ASK de cierre de ese día. VENDER = cobrar el BID de cierre de otro día.
// Un contrato "hizo 10x" si en ALGÚN día posterior su bid llegó a 10 veces el ask de entrada.
// Eso es el mejor caso posible (timing perfecto de salida): sirve para responder "¿existía la
// oportunidad?", NO para decir "esto se habría ganado". Nadie vende en el máximo.
//
// SPLITS. Un split cambia el strike y rompe la serie del contrato: el 1200 de NVDA pasó a 120 el
// 2024-06-10. Se detectan solos (caída brusca del strike máximo entre dos días consecutivos) y
// todo se normaliza a unidades POST-split: strike dividido por el factor acumulado y precio
// multiplicado por él. Sin esto la trayectoria se cortaría justo donde más se mueve.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const SALIDA = process.env.SALIDA_10X || "scripts/10x-resumen.json";
const MULTIPLO = Number(process.env.MULTIPLO || 10);     // 10x = +900%
const DESDE = process.env.DESDE || "20160101";
// FILTROS DE LIQUIDEZ. Sin esto el analisis lo dominan los contratos de centimos: comprar a $0,01
// y que la puja llegue a $0,10 cuenta como "10x" y no existe — la horquilla es del 100% y nadie
// cruza ahi. En la prueba de 2024-2026 AMD daba 6,9% de 10x contra 0,5% de MSFT, trece veces mas,
// y era esto. Un contrato que no se puede comprar no es una oportunidad.
const ASK_MIN = Number(process.env.ASK_MIN || 0.10);      // $0,10 = $10 por contrato
const SPREAD_MAX = Number(process.env.SPREAD_MAX || 40);  // % de la prima
const ms = (y) => Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`);

// ── Días por símbolo ────────────────────────────────────────────────────────
const porSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m || m[2] < DESDE) continue;
  if (!porSim.has(m[1])) porSim.set(m[1], []);
  porSim.get(m[1]).push(m[2]);
}
for (const v of porSim.values()) v.sort();

const cargar = (sym, dia) => {
  const f = `${CDIR}/${sym}_d${dia}.json`;
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
};

/** Splits del símbolo: caída brusca del strike máximo entre dos días consecutivos. */
function splitsDe(sym, dias) {
  const out = [];
  let prev = 0;
  for (const d of dias) {
    const c = cargar(sym, d);
    if (!c) continue;
    let maxK = 0;
    for (const g of Object.values(c)) for (const k of Object.keys(g)) {
      const v = Number(k.slice(0, -2));
      if (v > maxK) maxK = v;
    }
    if (prev && maxK > 0 && prev / maxK >= 1.8) out.push({ desde: d, ratio: prev / maxK });
    prev = maxK;
  }
  return out;
}

const resumen = { multiplo: MULTIPLO, desde: DESDE, porSimbolo: {}, global: null };

// ── LOS CUBOS: aqui vive la respuesta ───────────────────────────────────────
// Para cada combinacion de (plazo x distancia al dinero x tipo) se cuenta CUANTAS compras habia
// y cuantas llegaron a 10x. Sin ese denominador, "los ganadores eran calls baratas lejos del
// dinero" es una descripcion inutil: tambien lo eran las decenas de miles que se fueron a cero.
//
// Se guarda ademas la media del MEJOR MULTIPLO ALCANZABLE de todas las compras del cubo. Ojo:
// supone vender en el maximo exacto, que nadie hace. Es un TECHO. Si ni siquiera el techo da mas
// de 1,0, comprar ese cubo pierde dinero incluso adivinando la salida perfecta.
const cubos = new Map();
const cuboDte = (d) => (d <= 7 ? "0-7" : d <= 30 ? "8-30" : d <= 90 ? "31-90" : d <= 180 ? "91-180" : d <= 365 ? "181-365" : ">365");
const cuboOtm = (o) => (o == null ? "?" : o < 0 ? "dentro" : o < 5 ? "0-5%" : o < 15 ? "5-15%" : o < 30 ? "15-30%" : o < 60 ? "30-60%" : ">60%");
// `final` = lo que devuelve COMPRAR Y AGUANTAR hasta la ultima cotizacion del contrato, sin
// adivinar nada. Es el unico numero operable de esta tabla: el "techo" supone vender en el maximo
// exacto de cada contrato, que no lo hace nadie. Si el techo es 8x y aguantar da 0,3x, lo que
// habia no era una oportunidad — era la necesidad de acertar el dia de salida.
// Desglose del cubo estrella (calls, >365 dias, >60% fuera) por ticker y por ano de entrada.
// Es la comprobacion que decide si "aguantar da 2,5x" es una estrategia o es que nuestros 8
// tickers son los 8 ganadores de la decada. Un resultado que vive en dos nombres y tres anos no
// es un criterio: es el retrovisor.
const detalle = { ticker: new Map(), ano: new Map() };
function anotarDetalle(sym, dia, right, dte, otm, final) {
  if (!(right === "C" && dte > 365 && otm != null && otm > 60) || final == null) return;
  for (const [mapa, k] of [[detalle.ticker, sym], [detalle.ano, dia.slice(0, 4)]]) {
    let c = mapa.get(k);
    if (!c) { c = { n: 0, suma: 0, ceros: 0 }; mapa.set(k, c); }
    c.n++; c.suma += Math.min(final, 50); if (final <= 0) c.ceros++;
  }
}
function anotarCubo(right, dte, otm, mult, final) {
  const k = `${right}|${cuboDte(dte)}|${cuboOtm(otm)}`;
  let c = cubos.get(k);
  if (!c) { c = { n: 0, de10x: 0, sumaMult: 0, sumaCap: 0, sumaFinal: 0, nFinal: 0 }; cubos.set(k, c); }
  c.n++;
  if (mult >= MULTIPLO) c.de10x++;
  c.sumaMult += mult;
  c.sumaCap += Math.min(mult, 50);   // media recortada a 50x: un solo 800x mueve la media entera
  if (final != null) { c.sumaFinal += Math.min(final, 50); c.nFinal++; }
}
const TODOS = [];       // una fila por (contrato, día de entrada) que llegó a hacer 10x
let totalEntradas = 0;  // el DENOMINADOR: todas las compras posibles

for (const [sym, dias] of porSim) {
  const splits = splitsDe(sym, dias);
  /** Factor acumulado para llevar el día `d` a unidades post-split. */
  const factor = (d) => splits.reduce((f, s) => (s.desde > d ? f * s.ratio : f), 1);

  // series[claveNormalizada] = [{i, ask, bid}]  con i = índice del día
  const series = new Map();
  const spotPorDia = [];

  for (let i = 0; i < dias.length; i++) {
    const d = dias[i];
    const c = cargar(sym, d);
    if (!c) { spotPorDia.push(null); continue; }
    const F = factor(d);
    // Spot por paridad: el strike donde call y put valen casi lo mismo.
    let mejorK = null, mejorDif = Infinity;
    for (const [exp, grupo] of Object.entries(c)) {
      const expN = exp;
      for (const [clave, ba] of Object.entries(grupo)) {
        const right = clave.slice(-1);
        const K = Number(clave.slice(0, -2));
        if (!(K > 0)) continue;
        const kN = K / F;
        const askN = ba[1] * F, bidN = ba[0] * F;
        const key = `${expN}|${kN}|${right}`;
        let s = series.get(key);
        if (!s) { s = []; series.set(key, s); }
        s.push({ i, ask: askN, bid: bidN });
        // paridad, sólo con el vencimiento más cercano
        if (right === "C") {
          const p = grupo[`${K}|P`];
          if (p) {
            const midC = (ba[0] + ba[1]) / 2, midP = (p[0] + p[1]) / 2;
            const dif = Math.abs(midC - midP);
            if (dif < mejorDif) { mejorDif = dif; mejorK = kN; }
          }
        }
      }
    }
    spotPorDia.push(mejorK);
  }

  /** Indice del ultimo dia con cadena en disco que cae en o antes del vencimiento `exp`.
   *  -1 si el vencimiento es posterior a los datos que tenemos: en ese caso el contrato sigue
   *  vivo y su ultima cotizacion SI es su valor actual, no un cero. */
  const ultimoDiaHasta = (exp) => {
    if (exp > dias[dias.length - 1]) return -1;          // vence despues de nuestros datos
    let lo = 0, hi = dias.length - 1, res = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (dias[m] <= exp) { res = m; lo = m + 1; } else hi = m - 1; }
    return res;
  };

  // Para cada contrato: máximo futuro del bid, y de ahí el múltiplo alcanzable por día de entrada.
  let entradasSym = 0, ganadorasSym = 0;
  for (const [key, s] of series) {
    if (s.length < 2) continue;
    const [expN, kStr, right] = key.split("|");
    const K = Number(kStr);
    // sufijo-máximo del bid: maxFut[j] = mayor bid en los días POSTERIORES a j
    const maxFut = new Array(s.length).fill(0);
    for (let j = s.length - 2; j >= 0; j--) maxFut[j] = Math.max(maxFut[j + 1], s[j + 1].bid);

    for (let j = 0; j < s.length - 1; j++) {
      const ask = s[j].ask, bid = s[j].bid;
      if (!(ask >= ASK_MIN)) continue;                        // demasiado barato para ser real
      const spRel = ((ask - bid) / ask) * 100;
      if (!(spRel <= SPREAD_MAX)) continue;                   // sin mercado: no se puede comprar
      entradasSym++;
      const mult = maxFut[j] / ask;
      const dia = dias[s[j].i];
      const spot = spotPorDia[s[j].i];
      const dteJ = Math.round((ms(expN) - ms(dia)) / 86_400_000);
      const otmJ = spot ? ((right === "C" ? K - spot : spot - K) / spot) * 100 : null;
      // 🪤 AGUANTAR HASTA EL FINAL — y "el final" NO es la ultima cotizacion guardada.
      //
      // El descargador descarta todo contrato con puja <= 0, asi que una call que expira sin valor
      // simplemente DESAPARECE de las cadenas. Su ultima fila guardada es la del ultimo dia en que
      // todavia valia algo. Usar esa fila como "lo que devolvio" excluye el resultado mas comun de
      // comprar opciones fuera del dinero — el cero — y por eso la primera version daba 3,5x de
      // media, que era imposible.
      //
      // Lo correcto: si el contrato dejo de cotizar ANTES del ultimo dia habil de su vencimiento,
      // es que la puja se fue a cero. Devuelve 0, o sea -100%.
      // TRES CASOS, y la primera version confundia el primero con el tercero:
      //   -1  → vence DESPUES de donde acaban los datos: sigue vivo, vale su ultima cotizacion.
      //         (Sin esto, las 123.801 compras de 2026 salian todas a −100% y hundian el ano.)
      //   ok  → llego vivo hasta su vencimiento: vale su ultimo bid.
      //   no  → dejo de cotizar antes: la puja se fue a cero. −100%.
      // SOLO SE MIDE LO QUE YA SE RESOLVIO.
      //
      // Tres casos, y las dos primeras versiones se equivocaron en dos de ellos:
      //   vence DESPUES de los datos → NO SE MIDE (null). Contarlo a cero decia que el 100% de las
      //     compras de 2026 se habian perdido; contarlo a su cotizacion de hoy dice que van
      //     ganando, en un mercado que subio. Las dos cosas son falsas: no ha terminado.
      //   llego vivo a su vencimiento  → vale su ultimo bid.
      //   dejo de cotizar antes        → la puja se fue a cero. −100%.
      const idxUltimoVivo = ultimoDiaHasta(expN);
      const finalMult = idxUltimoVivo < 0 ? null
        : (s[s.length - 1].i >= idxUltimoVivo ? s[s.length - 1].bid / ask : 0);
      anotarCubo(right, dteJ, otmJ, mult, finalMult);
      anotarDetalle(sym, dia, right, dteJ, otmJ, finalMult);
      if (mult < MULTIPLO) continue;
      ganadorasSym++;
      TODOS.push({
        sym, dia, exp: expN, strike: K, right,
        ask, mult, dte: dteJ, otm: otmJ, spreadRel: spRel,
      });
    }
  }
  totalEntradas += entradasSym;
  resumen.porSimbolo[sym] = { entradas: entradasSym, de10x: ganadorasSym, tasa: ganadorasSym / entradasSym };
  console.log(`${sym.padEnd(5)} ${dias.length} días · ${series.size.toLocaleString("es-ES")} contratos · ` +
              `${entradasSym.toLocaleString("es-ES")} compras posibles · ${ganadorasSym.toLocaleString("es-ES")} llegaron a ${MULTIPLO}x ` +
              `(${((ganadorasSym / entradasSym) * 100).toFixed(3)}%)` +
              (splits.length ? `  [splits: ${splits.map((x) => x.desde + " " + x.ratio.toFixed(1) + ":1").join(", ")}]` : ""));
}

// ── LA TASA BASE, que es lo único que convierte una descripción en una regla ─
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length * q)]; };
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);

console.log(`\n═══ ${TODOS.length.toLocaleString("es-ES")} compras llegaron a ${MULTIPLO}x, de ${totalEntradas.toLocaleString("es-ES")} posibles ` +
            `(${((TODOS.length / totalEntradas) * 100).toFixed(3)}%) ═══\n`);

if (TODOS.length) {
  const campos = [["dte", "días a vencimiento"], ["otm", "% fuera del dinero"], ["ask", "prima pagada $"], ["spreadRel", "horquilla %"]];
  console.log("qué tenían en común (percentiles de los GANADORES):\n");
  for (const [c, nombre] of campos) {
    const v = TODOS.map((x) => x[c]).filter((x) => x != null && Number.isFinite(x));
    if (!v.length) continue;
    console.log(`  ${nombre.padEnd(22)} p10 ${pct(v, 0.1).toFixed(1).padStart(8)} · p50 ${pct(v, 0.5).toFixed(1).padStart(8)} · p90 ${pct(v, 0.9).toFixed(1).padStart(8)}`);
  }
  const calls = TODOS.filter((x) => x.right === "C").length;
  console.log(`\n  calls ${calls} (${((calls / TODOS.length) * 100).toFixed(0)}%) · puts ${TODOS.length - calls}`);
  const porAno = {};
  for (const x of TODOS) porAno[x.dia.slice(0, 4)] = (porAno[x.dia.slice(0, 4)] ?? 0) + 1;
  console.log(`  por año: ${Object.entries(porAno).sort().map(([a, n]) => `${a}=${n}`).join(" · ")}`);
  console.log(`  múltiplo alcanzado: mediana ${pct(TODOS.map((x) => x.mult), 0.5).toFixed(1)}x · máximo ${TODOS.reduce((a, x) => (x.mult > a ? x.mult : a), 0).toFixed(0)}x`);
}

// ── LA TABLA QUE DE VERDAD RESPONDE ─────────────────────────────────────────
console.log(`
═══ LA TASA BASE POR CUBO — el denominador ═══`);
console.log(`(techo = media del mejor multiplo alcanzable, recortada a 50x. SUPONE VENDER EN EL`);
console.log(` MAXIMO EXACTO, o sea que es un techo imposible: si el techo no pasa de 1,0, ese cubo`);
console.log(` pierde dinero incluso adivinando la salida perfecta)
`);
console.log("tipo plazo      distancia    compras     lleg. a 10x    1 de cada    techo   AGUANTAR");
const ordenados = [...cubos].filter(([, c]) => c.n >= 500).sort((a, b) => b[1].de10x / b[1].n - a[1].de10x / a[1].n);
for (const [k, c] of ordenados.slice(0, 22)) {
  const [right, dte, otm] = k.split("|");
  const tasa = c.de10x / c.n;
  console.log(`${right}   ${dte.padEnd(9)} ${otm.padEnd(9)} ${String(c.n).padStart(10)} ${String(c.de10x).padStart(12)}` +
              `   ${(tasa > 0 ? (1 / tasa).toFixed(0) : "—").padStart(9)}   ${(c.sumaCap / c.n).toFixed(2).padStart(6)}` +
              `   ${(c.nFinal ? (c.sumaFinal / c.nFinal).toFixed(2) : "—").padStart(8)}`);
}
resumen.cubos = Object.fromEntries([...cubos].map(([k, c]) => [k, { ...c, tasa: c.de10x / c.n, techo: c.sumaCap / c.n, aguantar: c.nFinal ? c.sumaFinal / c.nFinal : null }]));
resumen.global = { entradas: totalEntradas, de10x: TODOS.length, tasa: TODOS.length / totalEntradas };
// ── ¿DE DÓNDE SALE EL CUBO ESTRELLA? ────────────────────────────────────────
// La comprobación que decide si "aguantar da 2,5x" es un criterio o es el retrovisor. Nuestros 8
// símbolos son AAPL, AMD, META, MSFT, NVDA, QQQ, SPY y TSLA: los OCHO son ganadores de la década.
// No hay ni un Intel, ni un banco, ni una petrolera que se quedara plana. Si el número vive en dos
// nombres y tres años, no sirve para elegir contratos — sirve para describir qué acción tocó.
console.log(`\n═══ EL CUBO ESTRELLA (calls, >365 días, >60% fuera) — ¿de dónde sale? ═══\n`);
for (const [titulo, mapa] of [["POR TICKER", detalle.ticker], ["POR AÑO DE ENTRADA", detalle.ano]]) {
  console.log(`  ${titulo}`);
  for (const [k, c] of [...mapa].sort((a, b) => (b[1].suma / b[1].n) - (a[1].suma / a[1].n)))
    console.log(`    ${String(k).padEnd(7)} n=${String(c.n).padStart(8)}  aguantar ${(c.suma / c.n).toFixed(2).padStart(6)}x` +
                `  · a cero ${((c.ceros / c.n) * 100).toFixed(0).padStart(3)}%`);
  console.log("");
}
resumen.detalleCuboEstrella = {
  ticker: Object.fromEntries([...detalle.ticker].map(([k, c]) => [k, { ...c, aguantar: c.suma / c.n }])),
  ano: Object.fromEntries([...detalle.ano].map(([k, c]) => [k, { ...c, aguantar: c.suma / c.n }])),
};

writeFileSync(SALIDA, JSON.stringify({ resumen, ganadores: TODOS }), "utf8");
console.log(`\nescrito ${SALIDA}`);
console.log(`
⚠️  ESTO TODAVÍA NO ES UNA REGLA. Lo de arriba describe a los ganadores. Para saber si sirve hace
   falta el paso 2: coger TODOS los contratos que cumplían esas mismas características el día de
   entrada y ver qué fracción llegó a ${MULTIPLO}x. Ese denominador lo calcula 10x-tasa-base.mjs.`);
