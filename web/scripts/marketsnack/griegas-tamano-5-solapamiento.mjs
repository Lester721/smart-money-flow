// ══════════════════════════════════════════════════════════════════════════════════════════
// GRIEGAS-TAMAÑO · PASO 5 — EL SOLAPAMIENTO, LA COLA Y EL VEREDICTO
// ══════════════════════════════════════════════════════════════════════════════════════════
//
// El paso 4 dejó la celda de zIvRel a 7 días rozando el listón por los dos lados: la barrera da
// t=1,83 (listón 2,74) y la permutación p=0,0065 (umbral 0,0063). Y dejó tres cosas que la
// pueden explicar entera. Las tres se resuelven aquí:
//
//   A. EL MISMO SUCESO CONTADO TRES VECES. De las 5 mayores ganadoras del tercio alto, tres son
//      AAPL el 25, el 29 y el 30 de junio: un cono de 7 días comprado tres días seguidos apuesta
//      TRES VECES al mismo movimiento. La permutación baraja DENTRO de cada día y por eso no lo
//      caza. Aquí se rehace con entradas NO SOLAPADAS: como mucho una por ticker cada 7 días.
//
//   B. LA COLA. El movimiento MEDIO apenas separa (+0,67 pts, t=1,61) y sin embargo el cono paga
//      37 puntos. Sólo puede venir de la COLA: una opción es convexa y sólo cobra los extremos.
//      Se mide directamente el p90 / p95 / p99 de |retorno|, que es lo que compra el que compra.
//
//   C. LA PATA DE CALL EN UN MERCADO ALCISTA. La call sola aporta +119 pts y la put +16. La
//      ventana fue SPY +8,1% y QQQ +9,1% en 106 días. Si el tercio alto simplemente contiene los
//      tickers que subieron, esto es la trampa que ya tumbó el pase anterior del vehículo.
//      Se comprueba con la cola FIRMADA: subidas grandes contra bajadas grandes.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/marketsnack/griegas-tamano-5-solapamiento.mjs

import fs from "node:fs";
import { pasarBarrera, informe, listonT, tWelch } from "../../lib/barreraHallazgos.ts";
import { radiografia } from "../../lib/radiografia.ts";

const PANEL = "scripts/marketsnack/griegas-tamano-panel.json";
const CDIR = "scripts/cache-theta/cadenas";
const CIERRES = "scripts/cache-theta/cierres";
const SALIDA = "scripts/marketsnack/griegas-tamano-5-salida.json";

const CUENTA = 56389;
const MIN_SIMBOLOS_DIA = 15;
const DIST = 0.05, DTE_FOCO = 7, TOL_DTE = 4, ULTIMO = "20260806";
const METRICA = "zIvRel";
const PERMUTACIONES = 4000;

const iso = (y) => `${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}`;
const dd = (a, b) => Math.round((Date.parse(iso(b)) - Date.parse(iso(a))) / 86400000);
const media = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const desv = (a) => { if (a.length < 2) return 0; const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const pctl = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const fmt = (x, d = 2) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d);

const J = JSON.parse(fs.readFileSync(PANEL, "utf8"));
const panel = J.panel;
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

const tickersCadena = [...new Set(fs.readdirSync(CDIR).filter((f) => /^[A-Z]+_d\d{8}\.json$/.test(f)).map((f) => f.split("_d")[0]))].sort();
const diasCadena = {};
for (const t of tickersCadena) {
  const ds = fs.readdirSync(CDIR).filter((f) => f.startsWith(`${t}_d2026`)).map((f) => f.slice(-13, -5)).sort().filter((d) => d >= "20260422" && d <= ULTIMO);
  if (ds.length) diasCadena[t] = ds;
}
const cierres = {};
for (const t of Object.keys(diasCadena)) if (fs.existsSync(`${CIERRES}/${t}.json`)) cierres[t] = JSON.parse(fs.readFileSync(`${CIERRES}/${t}.json`, "utf8"));

function elegir(cad, S, tipo, hoy) {
  let mejorExp = null, mejorDD = Infinity;
  for (const exp of Object.keys(cad)) {
    const d = dd(hoy, exp);
    if (d < 1) continue;
    const x = Math.abs(d - DTE_FOCO);
    if (x < mejorDD) { mejorDD = x; mejorExp = exp; }
  }
  if (!mejorExp || mejorDD > TOL_DTE) return null;
  const objetivo = tipo === "C" ? S * (1 + DIST) : S * (1 - DIST);
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
  if (Math.abs(distReal - DIST) > DIST * 0.30) return null;
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
    const c = elegir(cad, S, "C", dY), put = elegir(cad, S, "P", dY);
    if (!c || !put || c.exp !== put.exp) continue;
    const ce = cierres[t][c.exp];
    if (!(ce > 0)) continue;
    const prima = (c.ask + put.ask) * 100;
    const pagoC = Math.max(0, ce - c.K) * 100, pagoP = Math.max(0, put.K - ce) * 100;
    conos.push({ ticker: t, fecha: d, exp: c.exp, rango: fila.rango, prima,
      ret: (pagoC + pagoP) / prima - 1, pnl: (pagoC + pagoP) / prima - 1,
      retReal: ce / S - 1, absRet: Math.abs(ce / S - 1),
      patC: pagoC / (c.ask * 100) - 1, patP: pagoP / (put.ask * 100) - 1 });
  }
}
console.log("═".repeat(100));
console.log(`PASO 5 · ${METRICA} · cono ${DTE_FOCO}d al ${DIST * 100}% — el solapamiento, la cola y el veredicto`);
console.log("═".repeat(100));
radiografia(conos, ["ret", "prima", "rango", "absRet"], "conos 7d", { cerosLegitimos: [] });

const altoT = conos.filter((c) => c.rango >= 2 / 3), bajoT = conos.filter((c) => c.rango <= 1 / 3);
const sepTodas = media(altoT.map((c) => c.ret)) - media(bajoT.map((c) => c.ret));
console.log(`\nCON TODAS LAS ENTRADAS (solapadas): alto n=${altoT.length} ${fmt(100 * media(altoT.map((c) => c.ret)), 1)}% · bajo n=${bajoT.length} ${fmt(100 * media(bajoT.map((c) => c.ret)), 1)}% · sep ${fmt(100 * sepTodas, 1)} pts`);

// ══ A. ENTRADAS NO SOLAPADAS ══════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(100));
console.log("A. ENTRADAS NO SOLAPADAS — como mucho UNA por ticker cada 7 días");
console.log("═".repeat(100));
console.log("  Un cono de 7 días comprado tres días seguidos sobre AAPL es UNA apuesta, no tres.");
console.log("  Se recorre en orden de fecha y se acepta la entrada sólo si han pasado ≥7 días naturales");
console.log("  desde la última aceptada DE ESE TICKER. La regla no mira el resultado: es ciega.\n");

function noSolapadas(filas) {
  const ord = [...filas].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.ticker.localeCompare(b.ticker));
  const ultima = new Map();
  const out = [];
  for (const c of ord) {
    const u = ultima.get(c.ticker);
    if (u && (Date.parse(c.fecha) - Date.parse(u)) / 86400000 < DTE_FOCO) continue;
    ultima.set(c.ticker, c.fecha);
    out.push(c);
  }
  return out;
}
const conosNS = noSolapadas(conos);
const altoNS = conosNS.filter((c) => c.rango >= 2 / 3), bajoNS = conosNS.filter((c) => c.rango <= 1 / 3);
const sepNS = media(altoNS.map((c) => c.ret)) - media(bajoNS.map((c) => c.ret));
console.log(`  conos: ${conos.length} solapados → ${conosNS.length} no solapados (${[...new Set(conosNS.map((c) => c.ticker))].length} tickers, ${[...new Set(conosNS.map((c) => c.fecha))].length} días)`);
console.log(`  alto n=${altoNS.length} ${fmt(100 * media(altoNS.map((c) => c.ret)), 1)}% (mediana ${fmt(100 * pctl(altoNS.map((c) => c.ret), 0.5), 0)}%) · bajo n=${bajoNS.length} ${fmt(100 * media(bajoNS.map((c) => c.ret)), 1)}%`);
console.log(`  separación ${fmt(100 * sepNS, 1)} pts · t de Student ${fmt(tWelch(altoNS.map((c) => c.ret), bajoNS.map((c) => c.ret)))}`);
const vNS = pasarBarrera(conosNS, (f) => f.rango, { pruebas: 8, nMinimo: 100, maxPorTicker: 0.2 });
console.log(informe(vNS, `${METRICA} · cono 7d · NO SOLAPADO`));
const top5NS = [...altoNS].sort((x, y) => y.ret - x.ret).slice(0, 5);
console.log(`  las 5 mayores del tercio alto ya sin repetir suceso: ${top5NS.map((c) => `${c.ticker} ${c.fecha} ${fmt(100 * c.ret, 0)}%`).join(" · ")}`);

// permutación sobre las NO solapadas
console.log(`\n  PERMUTACIÓN sobre las no solapadas (${PERMUTACIONES} barajas dentro de cada día):`);
const porFechaNS = new Map();
for (const c of conosNS) { if (!porFechaNS.has(c.fecha)) porFechaNS.set(c.fecha, []); porFechaNS.get(c.fecha).push(c); }
const gruposNS = [...porFechaNS.values()].filter((g) => g.length >= 3);
let may = 0; const nulosNS = [];
for (let it = 0; it < PERMUTACIONES; it++) {
  const A = [], B = [];
  for (const g of gruposNS) {
    const r = g.map((c) => c.rango);
    for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
    g.forEach((c, i) => { if (r[i] >= 2 / 3) A.push(c.ret); else if (r[i] <= 1 / 3) B.push(c.ret); });
  }
  if (A.length < 10 || B.length < 10) continue;
  const s = media(A) - media(B);
  nulosNS.push(s);
  if (s >= sepNS) may++;
}
const pNS = (may + 1) / (nulosNS.length + 1);
console.log(`    nulo: sd ${(100 * desv(nulosNS)).toFixed(1)} pts · p95 ${fmt(100 * pctl(nulosNS, 0.95), 1)} · p99 ${fmt(100 * pctl(nulosNS, 0.99), 1)}`);
console.log(`    p empírico: ${pNS.toFixed(4)} (${may} de ${nulosNS.length}) · umbral Bonferroni 8 pruebas: ${(0.05 / 8).toFixed(4)} → ${pNS < 0.05 / 8 ? "PASA" : "NO PASA"}`);
console.log(`    n EFECTIVA real: ${altoNS.length} apuestas del tercio alto sin solapamiento en el tiempo,`);
console.log(`    repartidas en ${[...new Set(altoNS.map((c) => c.fecha))].length} días de un mercado que se mueve junto → menos aún.`);

// ══ B. LA COLA ════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(100));
console.log("B. LA COLA — una opción es convexa: sólo cobra los extremos");
console.log("═".repeat(100));
const cola = [];
for (const [nom, g] of [["TODAS", { a: altoT, b: bajoT }], ["NO SOLAPADAS", { a: altoNS, b: bajoNS }]]) {
  const A = g.a.map((c) => c.absRet), B = g.b.map((c) => c.absRet);
  const fila = { conjunto: nom, media: [media(A), media(B)], p75: [pctl(A, 0.75), pctl(B, 0.75)], p90: [pctl(A, 0.9), pctl(B, 0.9)], p95: [pctl(A, 0.95), pctl(B, 0.95)], tMedia: tWelch(A, B) };
  cola.push(fila);
  console.log(`  |retorno| a 7d · ${nom}`);
  console.log(`    media  alto ${(100 * fila.media[0]).toFixed(2)}%  bajo ${(100 * fila.media[1]).toFixed(2)}%  (t=${fmt(fila.tMedia)})`);
  console.log(`    p75    alto ${(100 * fila.p75[0]).toFixed(2)}%  bajo ${(100 * fila.p75[1]).toFixed(2)}%`);
  console.log(`    p90    alto ${(100 * fila.p90[0]).toFixed(2)}%  bajo ${(100 * fila.p90[1]).toFixed(2)}%`);
  console.log(`    p95    alto ${(100 * fila.p95[0]).toFixed(2)}%  bajo ${(100 * fila.p95[1]).toFixed(2)}%`);
  console.log(`    % que supera el 5% (el strike): alto ${(100 * A.filter((x) => x > 0.05).length / A.length).toFixed(1)}%  bajo ${(100 * B.filter((x) => x > 0.05).length / B.length).toFixed(1)}%`);
}

// ══ C. ¿ES EL MERCADO ALCISTA? ════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(100));
console.log("C. ¿ES LA PATA DE CALL EN UN MERCADO ALCISTA?");
console.log("═".repeat(100));
console.log("  La ventana fue SPY +8,1% y QQQ +9,1% en 106 días. Si el tercio alto sólo contiene");
console.log("  los que subieron, esto es la trampa que ya tumbó el pase anterior del vehículo.\n");
const cAlto = altoNS.map((c) => c.retReal), cBajo = bajoNS.map((c) => c.retReal);
console.log(`  retorno FIRMADO del subyacente (no solapadas): alto ${fmt(100 * media(cAlto), 2)}% · bajo ${fmt(100 * media(cBajo), 2)}% · t=${fmt(tWelch(cAlto, cBajo))}`);
console.log(`  cola de SUBIDAS  (>+5%): alto ${(100 * cAlto.filter((x) => x > 0.05).length / cAlto.length).toFixed(1)}% · bajo ${(100 * cBajo.filter((x) => x > 0.05).length / cBajo.length).toFixed(1)}%`);
console.log(`  cola de BAJADAS  (<−5%): alto ${(100 * cAlto.filter((x) => x < -0.05).length / cAlto.length).toFixed(1)}% · bajo ${(100 * cBajo.filter((x) => x < -0.05).length / cBajo.length).toFixed(1)}%`);
const patC = { alto: media(altoNS.map((c) => c.patC)), bajo: media(bajoNS.map((c) => c.patC)) };
const patP = { alto: media(altoNS.map((c) => c.patP)), bajo: media(bajoNS.map((c) => c.patP)) };
console.log(`  pata CALL (no solapadas): alto ${fmt(100 * patC.alto, 1)}% · bajo ${fmt(100 * patC.bajo, 1)}% · dif ${fmt(100 * (patC.alto - patC.bajo), 1)} pts · t=${fmt(tWelch(altoNS.map((c) => c.patC), bajoNS.map((c) => c.patC)))}`);
console.log(`  pata PUT  (no solapadas): alto ${fmt(100 * patP.alto, 1)}% · bajo ${fmt(100 * patP.bajo, 1)}% · dif ${fmt(100 * (patP.alto - patP.bajo), 1)} pts · t=${fmt(tWelch(altoNS.map((c) => c.patP), bajoNS.map((c) => c.patP)))}`);
const soloCall = (patC.alto - patC.bajo) / ((patC.alto - patC.bajo) + (patP.alto - patP.bajo));
console.log(`  → la call aporta el ${(100 * soloCall).toFixed(0)}% de la separación del cono.`);

// ══ EL DINERO Y LO QUE FALTA ══════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(100));
console.log(`EN DÓLARES AL AÑO — cuenta de $${CUENTA.toLocaleString()} · sólo entradas NO SOLAPADAS`);
console.log("═".repeat(100));
const prima = media(altoNS.map((c) => c.prima));
const rNS = altoNS.map((c) => c.ret);
const diasVentana = (Date.parse("2026-08-06") - Date.parse("2026-04-22")) / 86400000;
const opsAno = altoNS.length / diasVentana * 365;
const dolarAno = prima * media(rNS) * opsAno;
console.log(`  capital por cono                 : $${prima.toFixed(0)}`);
console.log(`  retorno medio del tercio alto    : ${fmt(100 * media(rNS), 1)}% · mediana ${fmt(100 * pctl(rNS, 0.5), 0)}% · ${(100 * rNS.filter((x) => x === -1).length / rNS.length).toFixed(0)}% expiran sin valor`);
console.log(`  operaciones al año a este ritmo  : ${opsAno.toFixed(0)} (${altoNS.length} en ${diasVentana} días)`);
console.log(`  capital comprometido a la vez    : ~$${(prima * altoNS.length / [...new Set(altoNS.map((c) => c.fecha))].length * DTE_FOCO).toFixed(0)} si se toman todas las señales`);
console.log(`  $/año                            : ${fmt(dolarAno, 0)}`);
let acum = 0, pico = 0, peor = 0;
for (const c of [...altoNS].sort((x, y) => x.fecha.localeCompare(y.fecha))) { acum += c.ret * prima; pico = Math.max(pico, acum); peor = Math.min(peor, acum - pico); }
console.log(`  peor racha (1 cono, en orden de fecha): ${fmt(peor, 0)} $`);

console.log("\n" + "═".repeat(100));
console.log("QUÉ FALTARÍA PARA QUE ESTO SE PUDIERA ESTABLECER");
console.log("═".repeat(100));
const sdNS = desv(conosNS.map((c) => c.ret));
const LIST = listonT(8);
const nNec = sepNS !== 0 ? Math.ceil(2 * (LIST * sdNS / sepNS) ** 2) : Infinity;
const porDiaAlto = altoNS.length / [...new Set(altoNS.map((c) => c.fecha))].length;
const diasNec = Math.ceil(nNec / porDiaAlto);
console.log(`  sd del retorno del cono (no solapado): ${(100 * sdNS).toFixed(0)}%`);
console.log(`  separación observada                 : ${fmt(100 * sepNS, 1)} pts`);
console.log(`  n necesaria POR GRUPO para t=${LIST}      : ${nNec}  (hay ${altoNS.length})`);
console.log(`  a ${porDiaAlto.toFixed(1)} señales por día → ${diasNec} días de flujo de MarketSnack (hay 82, y su archivo es ventana rodante)`);
console.log(`  el mismo cálculo con TODAS las entradas (solapadas) daría menos días, pero cada`);
console.log(`  entrada extra sobre el mismo ticker en la misma semana NO añade información.`);

fs.writeFileSync(SALIDA, JSON.stringify({
  generado: new Date().toISOString(),
  parametros: { METRICA, DTE_FOCO, DIST, PERMUTACIONES, CUENTA },
  solapadas: { n: conos.length, nAlto: altoT.length, nBajo: bajoT.length, sep: sepTodas },
  noSolapadas: { n: conosNS.length, nAlto: altoNS.length, nBajo: bajoNS.length, sep: sepNS,
    retAlto: media(altoNS.map((c) => c.ret)), retBajo: media(bajoNS.map((c) => c.ret)),
    medianaAlto: pctl(altoNS.map((c) => c.ret), 0.5), sinValor: rNS.filter((x) => x === -1).length / rNS.length,
    t: tWelch(altoNS.map((c) => c.ret), bajoNS.map((c) => c.ret)),
    barrera: { pasa: vNS.pasa, motivos: vNS.motivos, aprobadas: vNS.aprobadas, detalle: vNS.detalle },
    permutacion: { p: pNS, mayores: may, n: nulosNS.length, sd: desv(nulosNS), p99: pctl(nulosNS, 0.99) },
    top5: top5NS.map((c) => ({ ticker: c.ticker, fecha: c.fecha, ret: c.ret })) },
  cola, direccion: { retAlto: media(cAlto), retBajo: media(cBajo), t: tWelch(cAlto, cBajo),
    subidas: [cAlto.filter((x) => x > 0.05).length / cAlto.length, cBajo.filter((x) => x > 0.05).length / cBajo.length],
    bajadas: [cAlto.filter((x) => x < -0.05).length / cAlto.length, cBajo.filter((x) => x < -0.05).length / cBajo.length],
    patC, patP, cuotaCall: soloCall },
  dolares: { prima, retMedio: media(rNS), opsAno, dolarAno, peorRacha: peor, capitalComprometido: prima * altoNS.length / [...new Set(altoNS.map((c) => c.fecha))].length * DTE_FOCO },
  cuantoFalta: { sd: sdNS, sep: sepNS, nNecPorGrupo: nNec, nActual: altoNS.length, diasNecesarios: diasNec, diasDisponibles: 82 },
}, null, 1));
console.log(`\n→ ${SALIDA}`);
