// ══════════════════════════════════════════════════════════════════════════════════════════
// GRIEGAS-TAMAÑO · PASO 4 — INTERROGATORIO DE LA ÚNICA CELDA POSITIVA
// ══════════════════════════════════════════════════════════════════════════════════════════
//
// El paso 3 dejó una sola celda con dinero encima: comprar el CONO a 7 días sobre los tickers
// del tercio ALTO de `zIvRel` (IV pagada − IV vendida, en z contra sus propios 20 días) da
// +3,3% por operación contra −33,8% del tercio bajo: 37,1 puntos de separación, t=+2,31.
// El listón de esa familia era 2,74, así que NO pasa — pero está lo bastante cerca para que
// declararla muerta sin mirarla sería igual de deshonesto que declararla viva.
//
// Y HAY UNA INCOHERENCIA QUE HAY QUE RESOLVER ANTES DE NADA: la misma métrica NO separa el
// movimiento del subyacente (paso 2: sep +0,011, t=+0,51). Si el cono paga pero la acción no se
// mueve más, entonces lo que la señal está eligiendo NO es "va a haber un salto" sino otra cosa.
// Las dos candidatas son:
//    · la OPCIÓN ESTABA BARATA  (prima baja respecto al movimiento que luego hubo)
//    · UN BILLETE DE LOTERÍA    (una o dos operaciones de 10x mueven la media de 300)
// Las dos se comprueban aquí con el dato.
//
// SEIS INTERROGATORIOS:
//   1. LA BARRERA completa sobre las filas de dinero (muestra, concentración, tercios, t).
//   2. ¿ES UNA SOLA OPERACIÓN? — mediana, % de ganadoras, y qué queda al quitar la mejor, las 3
//      mejores y el 1% superior. Con sd=182% la media es del extremo, no del centro.
//   3. PERMUTACIÓN — se baraja la métrica DENTRO de cada día 2.000 veces. Con una distribución
//      de lotería la t de Student no vale; el p empírico sí. Éste es el árbitro.
//   4. ¿MOVIMIENTO O PRECIO? — para las mismas filas del cono: |retorno| a 7 días del subyacente
//      y prima/S del tercio alto contra el bajo. Separa las dos explicaciones.
//   5. LOS DOS TRAMOS del 2026-07-16.
//   6. LAS PATAS — el cono es call+put. Si todo viene de una pata, es dirección disfrazada.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/marketsnack/griegas-tamano-4-interrogar.mjs

import fs from "node:fs";
import { pasarBarrera, informe, listonT, tWelch } from "../../lib/barreraHallazgos.ts";
import { radiografia } from "../../lib/radiografia.ts";

const PANEL = "scripts/marketsnack/griegas-tamano-panel.json";
const CDIR = "scripts/cache-theta/cadenas";
const CIERRES = "scripts/cache-theta/cierres";
const SALIDA = "scripts/marketsnack/griegas-tamano-4-salida.json";

const CUENTA = 56389;
const MIN_SIMBOLOS_DIA = 15;
const RUPTURA = "2026-07-16";
const DIST = 0.05;
const DTE_FOCO = 7;
const TOL_DTE = { 7: 4, 30: 10 };
const ULTIMO = "20260806";
const METRICA = "zIvRel";
const PERMUTACIONES = 2000;

const ymd = (s) => s.replace(/-/g, "");
const iso = (y) => `${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}`;
const dd = (a, b) => Math.round((Date.parse(iso(b)) - Date.parse(iso(a))) / 86400000);
const media = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const desv = (a) => { if (a.length < 2) return 0; const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const tUna = (a) => (a.length < 3 ? NaN : media(a) / (desv(a) / Math.sqrt(a.length)));
const pctl = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const fmt = (x, d = 2) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d);

const J = JSON.parse(fs.readFileSync(PANEL, "utf8"));
const panel = J.panel;

// rangos transversales
const porDia = new Map();
for (const a of panel) { if (!porDia.has(a.dia)) porDia.set(a.dia, []); porDia.get(a.dia).push(a); }
for (const [, arr] of porDia) {
  if (arr.length < MIN_SIMBOLOS_DIA) continue;
  const con = arr.filter((a) => a[METRICA] != null && Number.isFinite(a[METRICA]));
  if (con.length < MIN_SIMBOLOS_DIA) continue;
  con.sort((x, y) => x[METRICA] - y[METRICA]);
  con.forEach((a, i) => { a.rango = con.length > 1 ? i / (con.length - 1) : 0.5; });
}
const idxPanel = new Map();
for (const a of panel) idxPanel.set(`${a.raiz}|${a.dia}`, a);

// ── reconstruir los conos de 7 días ───────────────────────────────────────────────────────
const tickersCadena = [...new Set(fs.readdirSync(CDIR).filter((f) => /^[A-Z]+_d\d{8}\.json$/.test(f)).map((f) => f.split("_d")[0]))].sort();
const diasCadena = {};
for (const t of tickersCadena) {
  const ds = fs.readdirSync(CDIR).filter((f) => f.startsWith(`${t}_d2026`)).map((f) => f.slice(-13, -5)).sort().filter((d) => d >= "20260422" && d <= ULTIMO);
  if (ds.length) diasCadena[t] = ds;
}
const cierres = {};
for (const t of Object.keys(diasCadena)) if (fs.existsSync(`${CIERRES}/${t}.json`)) cierres[t] = JSON.parse(fs.readFileSync(`${CIERRES}/${t}.json`, "utf8"));

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

const conos = [];
for (const t of Object.keys(diasCadena)) {
  if (!cierres[t]) continue;
  for (const dY of diasCadena[t]) {
    const d = iso(dY);
    const fila = idxPanel.get(`${t}|${d}`);
    if (!fila || fila.rango == null) continue;
    const S = cierres[t][dY];
    if (!(S > 0)) continue;
    const p = `${CDIR}/${t}_d${dY}.json`;
    if (!fs.existsSync(p)) continue;
    let cad; try { cad = JSON.parse(fs.readFileSync(p, "utf8")); } catch { continue; }
    const c = elegir(cad, S, DTE_FOCO, DIST, "C", dY), put = elegir(cad, S, DTE_FOCO, DIST, "P", dY);
    if (!c || !put || c.exp !== put.exp) continue;
    const cierreExp = cierres[t][c.exp];
    if (!(cierreExp > 0)) continue;
    const prima = (c.ask + put.ask) * 100;
    const pagoC = Math.max(0, cierreExp - c.K) * 100, pagoP = Math.max(0, put.K - cierreExp) * 100;
    conos.push({
      ticker: t, fecha: d, rango: fila.rango, prima, pago: pagoC + pagoP, ret: (pagoC + pagoP) / prima - 1,
      pnl: (pagoC + pagoP) / prima - 1,
      retReal: cierreExp / S - 1, absRet: Math.abs(cierreExp / S - 1),
      primaRel: prima / (S * 100),               // prima como % del subyacente
      patC: pagoC / (c.ask * 100) - 1, patP: pagoP / (put.ask * 100) - 1,
      pesoC: c.ask / (c.ask + put.ask),
      tramo: d < RUPTURA ? "antes" : "despues",
    });
  }
}
console.log("═".repeat(100));
console.log(`INTERROGATORIO · cono a ${DTE_FOCO} días, ${DIST * 100}% fuera, ordenado por ${METRICA}`);
console.log("═".repeat(100));
console.log(`conos reconstruidos: ${conos.length} · ${[...new Set(conos.map((c) => c.ticker))].length} tickers · ${[...new Set(conos.map((c) => c.fecha))].length} días`);
radiografia(conos, ["ret", "prima", "rango", "absRet", "primaRel"], "conos 7d con rango de " + METRICA, { cerosLegitimos: [] });

const alto = conos.filter((c) => c.rango >= 2 / 3), bajo = conos.filter((c) => c.rango <= 1 / 3);
const sepObs = media(alto.map((c) => c.ret)) - media(bajo.map((c) => c.ret));
console.log(`\ntercio ALTO n=${alto.length} ret ${fmt(100 * media(alto.map((c) => c.ret)), 1)}%  ·  tercio BAJO n=${bajo.length} ret ${fmt(100 * media(bajo.map((c) => c.ret)), 1)}%  ·  separación ${fmt(100 * sepObs, 1)} pts · t=${fmt(tWelch(alto.map((c) => c.ret), bajo.map((c) => c.ret)))}`);

// ══ 1. LA BARRERA ═════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(100));
console.log("1. LA BARRERA — las cuatro cribas sobre las filas de DINERO");
console.log("═".repeat(100));
const v = pasarBarrera(conos, (f) => f.rango, { pruebas: 8, nMinimo: 200, maxPorTicker: 0.2 });
console.log(informe(v, `${METRICA} · cono ${DTE_FOCO}d`));

// ══ 2. ¿ES UNA SOLA OPERACIÓN? ════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(100));
console.log("2. ¿UNA SEÑAL, O UN BILLETE DE LOTERÍA?");
console.log("═".repeat(100));
const ra = alto.map((c) => c.ret), rb = bajo.map((c) => c.ret);
console.log(`  tercio ALTO: media ${fmt(100 * media(ra), 1)}% · MEDIANA ${fmt(100 * pctl(ra, 0.5), 1)}% · ganadoras ${(100 * ra.filter((x) => x > 0).length / ra.length).toFixed(1)}% · sin valor ${(100 * ra.filter((x) => x === -1).length / ra.length).toFixed(1)}% · máx ${fmt(100 * Math.max(...ra), 0)}%`);
console.log(`  tercio BAJO: media ${fmt(100 * media(rb), 1)}% · MEDIANA ${fmt(100 * pctl(rb, 0.5), 1)}% · ganadoras ${(100 * rb.filter((x) => x > 0).length / rb.length).toFixed(1)}% · sin valor ${(100 * rb.filter((x) => x === -1).length / rb.length).toFixed(1)}% · máx ${fmt(100 * Math.max(...rb), 0)}%`);
const recortes = [];
for (const q of [1, 3, 5]) {
  const a2 = [...ra].sort((x, y) => y - x).slice(q), b2 = [...rb].sort((x, y) => y - x).slice(q);
  recortes.push({ quitando: q, sep: media(a2) - media(b2), t: tWelch(a2, b2), retAlto: media(a2) });
  console.log(`  quitando las ${q} mejores de CADA tercio: alto ${fmt(100 * media(a2), 1)}% · separación ${fmt(100 * (media(a2) - media(b2)), 1)} pts · t=${fmt(tWelch(a2, b2))}`);
}
// las mayores ganadoras del tercio alto, con nombre y apellido
const top5 = [...alto].sort((x, y) => y.ret - x.ret).slice(0, 5);
console.log(`  las 5 mayores del tercio ALTO: ${top5.map((c) => `${c.ticker} ${c.fecha} ${fmt(100 * c.ret, 0)}%`).join(" · ")}`);
console.log(`  esas 5 aportan ${(100 * top5.reduce((s, c) => s + c.ret - media(ra), 0) / ra.length / media(ra)).toFixed(0)}% de la media del tercio alto`);

// ══ 3. PERMUTACIÓN — el árbitro ═══════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(100));
console.log(`3. PERMUTACIÓN (${PERMUTACIONES} barajas de la métrica DENTRO de cada día)`);
console.log("═".repeat(100));
console.log("  con sd=182% y una cola de 17x, la t de Student no vale. El p empírico sí.");
const porFecha = new Map();
for (const c of conos) { if (!porFecha.has(c.fecha)) porFecha.set(c.fecha, []); porFecha.get(c.fecha).push(c); }
const grupos = [...porFecha.values()].filter((g) => g.length >= 3);
let mayores = 0;
const nulos = [];
for (let it = 0; it < PERMUTACIONES; it++) {
  const A = [], B = [];
  for (const g of grupos) {
    const rangos = g.map((c) => c.rango);
    for (let i = rangos.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rangos[i], rangos[j]] = [rangos[j], rangos[i]]; }
    g.forEach((c, i) => { if (rangos[i] >= 2 / 3) A.push(c.ret); else if (rangos[i] <= 1 / 3) B.push(c.ret); });
  }
  if (A.length < 20 || B.length < 20) continue;
  const s = media(A) - media(B);
  nulos.push(s);
  if (s >= sepObs) mayores++;
}
const pEmp = (mayores + 1) / (nulos.length + 1);
console.log(`  separación observada: ${fmt(100 * sepObs, 1)} pts`);
console.log(`  nulo: media ${fmt(100 * media(nulos), 1)} pts · sd ${(100 * desv(nulos)).toFixed(1)} pts · p95 ${fmt(100 * pctl(nulos, 0.95), 1)} pts · p99 ${fmt(100 * pctl(nulos, 0.99), 1)} pts`);
console.log(`  p empírico a una cola: ${pEmp.toFixed(4)}  (${mayores} de ${nulos.length} barajas dieron ${fmt(100 * sepObs, 1)} pts o más)`);
console.log(`  con 8 pruebas de dinero declaradas, el umbral de Bonferroni a una cola es p < ${(0.05 / 8).toFixed(4)} → ${pEmp < 0.05 / 8 ? "PASA" : "NO PASA"}`);

// ══ 4. ¿MOVIMIENTO O PRECIO? ══════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(100));
console.log("4. ¿MOVIMIENTO O PRECIO? — la incoherencia con el paso 2");
console.log("═".repeat(100));
const abA = alto.map((c) => c.absRet), abB = bajo.map((c) => c.absRet);
const prA = alto.map((c) => c.primaRel), prB = bajo.map((c) => c.primaRel);
console.log(`  |retorno| del subyacente a ${DTE_FOCO}d:  alto ${(100 * media(abA)).toFixed(2)}%  ·  bajo ${(100 * media(abB)).toFixed(2)}%  ·  dif ${fmt(100 * (media(abA) - media(abB)), 2)} pts · t=${fmt(tWelch(abA, abB))}`);
console.log(`  prima del cono como % del subyacente: alto ${(100 * media(prA)).toFixed(2)}%  ·  bajo ${(100 * media(prB)).toFixed(2)}%  ·  dif ${fmt(100 * (media(prA) - media(prB)), 2)} pts · t=${fmt(tWelch(prA, prB))}`);
console.log(`  → si el movimiento NO separa pero la prima SÍ (más barata arriba), lo que la señal`);
console.log(`    elige es opción BARATA, no salto. Y eso es un efecto de VALORACIÓN, no de flujo.`);
const ratioA = media(abA) / media(prA), ratioB = media(abB) / media(prB);
console.log(`  movimiento / prima (veces):          alto ${ratioA.toFixed(2)}x  ·  bajo ${ratioB.toFixed(2)}x`);

// ══ 5. LOS DOS TRAMOS ═════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(100));
console.log(`5. LOS DOS TRAMOS DEL ${RUPTURA}`);
console.log("═".repeat(100));
const tramos = {};
for (const tr of ["antes", "despues"]) {
  const g = conos.filter((c) => c.tramo === tr);
  const a = g.filter((c) => c.rango >= 2 / 3).map((c) => c.ret), b = g.filter((c) => c.rango <= 1 / 3).map((c) => c.ret);
  if (a.length < 15 || b.length < 15) { console.log(`  ${tr}: muestra insuficiente (alto ${a.length}, bajo ${b.length})`); tramos[tr] = null; continue; }
  tramos[tr] = { nAlto: a.length, nBajo: b.length, retAlto: media(a), retBajo: media(b), sep: media(a) - media(b), t: tWelch(a, b), medAlto: pctl(a, 0.5) };
  console.log(`  ${tr.padEnd(8)} alto n=${String(a.length).padStart(3)} ${fmt(100 * media(a), 1).padStart(7)}% (mediana ${fmt(100 * pctl(a, 0.5), 0)}%) · bajo n=${String(b.length).padStart(3)} ${fmt(100 * media(b), 1).padStart(7)}% · separación ${fmt(100 * (media(a) - media(b)), 1).padStart(7)} pts · t=${fmt(tWelch(a, b))}`);
}
if (tramos.antes && tramos.despues) console.log(`  mismo signo en los dos tramos: ${Math.sign(tramos.antes.sep) === Math.sign(tramos.despues.sep) ? "sí" : "NO"}`);

// ══ 6. LAS PATAS ══════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(100));
console.log("6. LAS PATAS — ¿es el cono, o es dirección disfrazada?");
console.log("═".repeat(100));
for (const [nom, key] of [["call", "patC"], ["put", "patP"]]) {
  const a = alto.map((c) => c[key]), b = bajo.map((c) => c[key]);
  console.log(`  ${nom.padEnd(5)} suelta: alto ${fmt(100 * media(a), 1).padStart(7)}% · bajo ${fmt(100 * media(b), 1).padStart(7)}% · dif ${fmt(100 * (media(a) - media(b)), 1).padStart(7)} pts · t=${fmt(tWelch(a, b))}`);
}
const retA = alto.map((c) => c.retReal), retB = bajo.map((c) => c.retReal);
console.log(`  retorno FIRMADO del subyacente: alto ${fmt(100 * media(retA), 2)}% · bajo ${fmt(100 * media(retB), 2)}% · dif ${fmt(100 * (media(retA) - media(retB)), 2)} pts · t=${fmt(tWelch(retA, retB))}`);

// ══ EN DÓLARES ════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(100));
console.log(`EN DÓLARES AL AÑO — cuenta de $${CUENTA.toLocaleString()}`);
console.log("═".repeat(100));
const primaMedia = media(alto.map((c) => c.prima));
const ciclos = 365 / DTE_FOCO;
const dolarAno1 = primaMedia * media(ra) * ciclos;
const nConos = Math.floor(CUENTA * 0.1 / primaMedia);
console.log(`  capital por cono (prima al ask)  : $${primaMedia.toFixed(0)}`);
console.log(`  retorno medio del tercio alto    : ${fmt(100 * media(ra), 1)}%  ·  MEDIANA ${fmt(100 * pctl(ra, 0.5), 1)}%`);
console.log(`  ciclos al año (${DTE_FOCO}d)              : ${ciclos.toFixed(1)}`);
console.log(`  $/año con UN cono rodando        : ${fmt(dolarAno1, 0)}`);
console.log(`  con el 10% de la cuenta ($${(CUENTA * 0.1).toFixed(0)} = ${nConos} conos): ${fmt(dolarAno1 * nConos, 0)}/año`);
console.log(`  ⚠ ese número lo sostiene la MEDIA. Con mediana ${fmt(100 * pctl(ra, 0.5), 1)}%, más de la mitad`);
console.log(`    de las semanas se pierde la prima entera: $${(primaMedia * nConos).toFixed(0)} comprometidos y ${(100 * ra.filter((x) => x === -1).length / ra.length).toFixed(0)}% de ceros.`);
// racha peor: la suma acumulada más negativa por orden de fecha
const cron = [...alto].sort((x, y) => x.fecha.localeCompare(y.fecha));
let acum = 0, pico = 0, peor = 0;
for (const c of cron) { acum += c.ret * primaMedia; pico = Math.max(pico, acum); peor = Math.min(peor, acum - pico); }
console.log(`  peor racha del tercio alto (1 cono, en orden de fecha): ${fmt(peor, 0)} $`);

fs.writeFileSync(SALIDA, JSON.stringify({
  generado: new Date().toISOString(),
  parametros: { METRICA, DTE_FOCO, DIST, PERMUTACIONES, RUPTURA, CUENTA },
  conos: conos.length, tickers: [...new Set(conos.map((c) => c.ticker))].length, dias: [...new Set(conos.map((c) => c.fecha))].length,
  alto: { n: alto.length, ret: media(ra), mediana: pctl(ra, 0.5), ganadoras: ra.filter((x) => x > 0).length / ra.length, sinValor: ra.filter((x) => x === -1).length / ra.length },
  bajo: { n: bajo.length, ret: media(rb), mediana: pctl(rb, 0.5), ganadoras: rb.filter((x) => x > 0).length / rb.length, sinValor: rb.filter((x) => x === -1).length / rb.length },
  sepObs, tStudent: tWelch(ra, rb),
  barrera: { pasa: v.pasa, motivos: v.motivos, aprobadas: v.aprobadas, detalle: v.detalle },
  recortes, top5: top5.map((c) => ({ ticker: c.ticker, fecha: c.fecha, ret: c.ret })),
  permutacion: { pEmp, mayores, n: nulos.length, nuloMedia: media(nulos), nuloSd: desv(nulos), nuloP95: pctl(nulos, 0.95), nuloP99: pctl(nulos, 0.99) },
  movimientoOprecio: { absAlto: media(abA), absBajo: media(abB), tAbs: tWelch(abA, abB), primaRelAlto: media(prA), primaRelBajo: media(prB), tPrima: tWelch(prA, prB), ratioAlto: ratioA, ratioBajo: ratioB },
  tramos,
  patas: { call: { alto: media(alto.map((c) => c.patC)), bajo: media(bajo.map((c) => c.patC)), t: tWelch(alto.map((c) => c.patC), bajo.map((c) => c.patC)) },
           put: { alto: media(alto.map((c) => c.patP)), bajo: media(bajo.map((c) => c.patP)), t: tWelch(alto.map((c) => c.patP), bajo.map((c) => c.patP)) } },
  dolares: { primaMedia, ciclos, dolarAno1, nConos, dolarAnoCartera: dolarAno1 * nConos, peorRacha: peor },
}, null, 1));
console.log(`\n→ ${SALIDA}`);
