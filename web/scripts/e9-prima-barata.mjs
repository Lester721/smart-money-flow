// E9 · ¿ESTÁ BARATA LA OPCIÓN HOY? — el movimiento que el mercado cobra contra el que ocurre.
//
// Uso:  node --import tsx scripts/e9-prima-barata.mjs
//
// ═══ QUÉ MIDE Y POR QUÉ ══════════════════════════════════════════════════════════════════════
//
// Todas las ideas anteriores de este proyecto intentaban ACERTAR LA DIRECCIÓN. Aquí no. Aquí la
// pregunta es otra: ¿hay días en que la opción del día está BARATA, se compre lo que se compre?
//
// El precio que el mercado le pone al movimiento del día se lee SIN NINGÚN MODELO: es lo que
// cuesta comprar a la vez la call y la put del mismo strike pegado al precio (el "straddle"),
// las dos al ask, a las 09:35. Si el mercado cree que hoy se mueve poco, eso sale barato.
//
// El movimiento que ocurre DE VERDAD es |cierre − precio de las 09:35|. Nada más.
//
// El que compra el straddle gana si el movimiento real supera lo que pagó. Así que lo primero
// no es una señal, es un HECHO que hay que poner en números sobre los 1.123 días:
//
//     ¿cuánto cuesta de media el billete, y cuánto paga de media el viaje?
//
// Ése es el peaje estructural de comprar volatilidad en 0DTE. Si el billete cuesta de media
// mucho más de lo que paga el viaje, comprar volatilidad es perder dinero por construcción y
// cualquier "señal" que lo arregle tiene que ser enorme.
//
// Luego sí viene la señal: se ordenan los días por lo barato que está el straddle RESPECTO A SÍ
// MISMO (contra su propia mediana de los 20 días anteriores, y en % del índice para que 2022 y
// 2026 sean comparables), se parten en cinco escalones, y se mira si en el escalón barato la
// compra sale rentable DESPUÉS del peaje. Y de propina, si en esos días barates alguna regla
// direccional simple (momento de la primera media hora, imán de interés abierto) despierta.
//
// ═══ LAS REGLAS DE LA CASA (van dentro, no se pueden apagar) ═════════════════════════════════
//   · Se compra al ASK y se vende al BID: lo hace operar() del banco.
//   · Sólo se mira el pasado: la mediana de 20 días es de días ANTERIORES, el percentil que
//     define el escalón se calcula contra los 250 días ANTERIORES, y la dirección del momento
//     se lee a las 10:00 para entrar a las 10:00.  (La entrada del straddle es 09:35.)
//   · Un hueco NO es un cero: cada precio que falta se cuenta aparte y se informa.
//   · Controles obligatorios: el control tonto (todos los días sin filtro), las dos mitades y
//     los tres tercios, el barajado (la señal de OTRO día) y la simetría (call contra put).

import { diasDisponibles, cargarDia, operar, idxHora, rejilla, compraEn, resumen } from "./lib0dte.mjs";

const HORA_ENTRADA = "09:35";
const SALIDAS = ["12:00", "14:00", "15:55", "CIERRE"];
// 15:55 es la última barra con un BID de verdad. La barra 16:00 la liquida el banco a
// min(bid, intrínseco), que es un convenio de liquidación, no un precio de mercado: se mide
// pero no se usa para titular. Ver el bloque «DE DÓNDE SALE EL AGUJERO».
const pc = (x) => (x * 100).toFixed(2).replace(".", ",") + "%";
const d0 = (x) => "$" + Math.round(x).toLocaleString("es-ES");
const n2 = (x) => x.toFixed(2).replace(".", ",");

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PASADA ÚNICA: de cada día se saca una ficha compacta y se tira la cadena.
// ─────────────────────────────────────────────────────────────────────────────────────────────
const dias = diasDisponibles();
console.log(`días con cadena: ${dias.length}  (${dias[0]} … ${dias[dias.length - 1]})`);

const fichas = [];
const huecos = { straddleEntrada: 0, op: 0, sinBarra0935: 0, sinOI: 0, diasIncompletos: 0 };
let t0 = Date.now();

for (const d of dias) {
  const D = cargarDia(d);
  if (!D) { huecos.diasIncompletos++; continue; }
  const i0 = idxHora(D, HORA_ENTRADA);
  if (i0 < 0) { huecos.sinBarra0935++; continue; }
  const b0 = D.barras[i0];
  const spot0 = b0.spot;
  const K = rejilla(spot0);

  const askC = compraEn(b0, K, "C");
  const askP = compraEn(b0, K, "P");
  if (askC == null || askP == null || !(askC > 0) || !(askP > 0)) { huecos.straddleEntrada++; continue; }

  const iUlt = D.barras.length - 1;
  const spotCierre = D.barras[iUlt].spot;

  // operaciones: comprar la call ATM y la put ATM a las 09:35, salir en tres horizontes
  const ops = {};
  for (const s of SALIDAS) {
    const iS = s === "CIERRE" ? iUlt : idxHora(D, s);
    if (iS < 0 || iS <= i0) { ops[s] = null; continue; }
    const c = operar(D, i0, iS, K, "C");
    const p = operar(D, i0, iS, K, "P");
    if (!c || !p) { huecos.op++; ops[s] = null; continue; }
    ops[s] = { c, p };
  }

  const iFin = idxHora(D, "15:55") >= 0 ? idxHora(D, "15:55") : iUlt;   // salida limpia, con bid real

  // dirección por momento: se LEE a la hora H y se ENTRA a la hora H (nada del futuro)
  let mom = null;
  const momG = {};                       // rejilla de robustez: hora de entrada × hora de salida
  for (const hE of ["10:00", "10:30", "11:00"]) {
    const iE = idxHora(D, hE);
    if (iE <= i0) continue;
    const bm = D.barras[iE];
    const lado = bm.spot >= spot0 ? "C" : "P";
    const Km = rejilla(bm.spot);
    for (const hS of ["12:00", "14:00", "15:55"]) {
      const iS = idxHora(D, hS);
      if (iS <= iE) continue;
      momG[`${hE}>${hS}`] = operar(D, iE, iS, Km, lado);
    }
    if (hE === "10:00") {
      mom = { lado, op: operar(D, iE, iFin, Km, lado), opInv: operar(D, iE, iFin, Km, lado === "C" ? "P" : "C") };
    }
  }

  // imán de interés abierto: el strike con más OI total dentro de ±1,5% del precio de 09:30
  let iman = null;
  if (D.oi) {
    let mejorK = null, mejorOI = -1;
    const lim = spot0 * 0.015;
    for (const clave of Object.keys(D.oi)) {
      const [ks] = clave.split("|");
      const k = +ks;
      if (!(Math.abs(k - spot0) <= lim)) continue;
      const tot = (D.oi[`${ks}|C`] || 0) + (D.oi[`${ks}|P`] || 0);
      if (tot > mejorOI) { mejorOI = tot; mejorK = k; }
    }
    if (mejorK != null) {
      const lado = mejorK >= spot0 ? "C" : "P";
      const op = operar(D, i0, iFin, K, lado);
      const opInv = operar(D, i0, iFin, K, lado === "C" ? "P" : "C");
      iman = { K: mejorK, oi: mejorOI, lado, op, opInv };
    }
  } else huecos.sinOI++;

  fichas.push({
    dia: d, ano: d.slice(0, 4),
    horaUlt: D.barras[iUlt].t, nBarras: D.barras.length,
    intrC: Math.max(0, spotCierre - K), intrP: Math.max(0, K - spotCierre),
    spot0, K, askC, askP, straddle: askC + askP,
    rel: (askC + askP) / spot0,               // straddle en % del índice: comparable entre años
    spotCierre, mov: Math.abs(spotCierre - spot0), movFirmado: spotCierre - spot0,
    ops, mom, momG, iman,
  });
}
console.log(`fichas: ${fichas.length}   (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
console.log(`huecos → días incompletos ${huecos.diasIncompletos} · sin barra 09:35 ${huecos.sinBarra0935} · ` +
            `sin straddle a la entrada ${huecos.straddleEntrada} · operaciones descartadas ${huecos.op} · sin OI ${huecos.sinOI}`);

// ─────────────────────────────────────────────────────────────────────────────────────────────
// VALIDACIÓN — antes de creerse un número, mirar que los precios son de este mundo.
// ─────────────────────────────────────────────────────────────────────────────────────────────
const costesC = fichas.map((f) => f.askC).sort((a, b) => a - b);
const costesS = fichas.map((f) => f.straddle).sort((a, b) => a - b);
const q = (v, p) => v[Math.floor(p * (v.length - 1))];
console.log(`\n── VALIDACIÓN DE PRECIOS ────────────────────────────────────────────────`);
console.log(`call ATM al ask 09:35 :  min ${n2(costesC[0])}  p10 ${n2(q(costesC, 0.1))}  mediana ${n2(q(costesC, 0.5))}  p90 ${n2(q(costesC, 0.9))}  max ${n2(costesC[costesC.length - 1])}`);
console.log(`straddle ATM al ask   :  min ${n2(costesS[0])}  p10 ${n2(q(costesS, 0.1))}  mediana ${n2(q(costesS, 0.5))}  p90 ${n2(q(costesS, 0.9))}  max ${n2(costesS[costesS.length - 1])}`);
console.log(`spot 09:35            :  min ${n2(Math.min(...fichas.map(f => f.spot0)))}  max ${n2(Math.max(...fichas.map(f => f.spot0)))}`);
const horq = fichas.map((f) => f.ops.CIERRE ? f.ops.CIERRE.c.horquillaPct : NaN).filter((x) => !isNaN(x)).sort((a, b) => a - b);
console.log(`horquilla call ATM    :  p10 ${pc(q(horq, 0.1))}  mediana ${pc(q(horq, 0.5))}  p90 ${pc(q(horq, 0.9))}`);

const mediaDe = (v) => v.reduce((a, b) => a + b, 0) / v.length;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 0-bis) DE DÓNDE SALE EL AGUJERO — cuadrar el resultado medido contra la aritmética.
//
// Si el straddle medio cuesta X y el movimiento medio es X, comprar y aguantar hasta el final
// debería dar CERO. Si la medición da otra cosa, hay que saber por qué ANTES de informar nada.
// Las dos sospechas: (a) el strike es un múltiplo de 5, no el precio exacto; (b) el banco
// liquida la última barra a min(bid, valor intrínseco), que nunca es más que el intrínseco.
// ─────────────────────────────────────────────────────────────────────────────────────────────
{
  const horas = {};
  for (const f of fichas) horas[f.horaUlt] = (horas[f.horaUlt] || 0) + 1;
  console.log(`\n── DE DÓNDE SALE EL AGUJERO ─────────────────────────────────────────────`);
  console.log(`última barra del día: ${Object.entries(horas).map(([h, n]) => `${h}×${n}`).join("  ")}`);
  const conCierre = fichas.filter((f) => f.ops.CIERRE);
  const teorico = conCierre.map((f) => (f.intrC + f.intrP - f.straddle) * 100);   // liquidar al intrínseco puro
  const medido = conCierre.map((f) => f.ops.CIERRE.c.dolares + f.ops.CIERRE.p.dolares);
  const movK = mediaDe(conCierre.map((f) => f.intrC + f.intrP));                  // |cierre − STRIKE|
  console.log(`|cierre − spot 09:35| medio = ${n2(mediaDe(conCierre.map(f => f.mov)))} · |cierre − STRIKE| medio = ${n2(movK)}  (el redondeo a múltiplo de 5)`);
  console.log(`comprar y liquidar al INTRÍNSECO puro : ${d0(mediaDe(teorico))}/op`);
  console.log(`lo que mide el banco (min(bid,intr))  : ${d0(mediaDe(medido))}/op`);
  console.log(`diferencia = lo que se come el convenio de salida del banco: ${d0(mediaDe(medido) - mediaDe(teorico))}/op`);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 1) EL HECHO: el billete contra el viaje
// ─────────────────────────────────────────────────────────────────────────────────────────────
const medStraddle = mediaDe(fichas.map((f) => f.straddle));
const medMov = mediaDe(fichas.map((f) => f.mov));
const gana = fichas.filter((f) => f.mov > f.straddle).length;
console.log(`\n══ 1) EL HECHO — lo que cuesta el billete contra lo que paga el viaje ══════════`);
console.log(`straddle ATM medio (ask+ask, 09:35) : ${n2(medStraddle)} puntos  = ${d0(medStraddle * 100)} por contrato`);
console.log(`movimiento real medio |cierre−09:35| : ${n2(medMov)} puntos  = ${d0(medMov * 100)}`);
console.log(`días en que el movimiento SUPERA al straddle: ${gana} de ${fichas.length} = ${pc(gana / fichas.length)}`);
console.log(`peaje estructural (viaje − billete)  : ${n2(medMov - medStraddle)} puntos por día = ${d0((medMov - medStraddle) * 100)}/día`);
{
  const ms = [...fichas.map((f) => f.straddle)].sort((a, b) => a - b);
  const mm = [...fichas.map((f) => f.mov)].sort((a, b) => a - b);
  console.log(`MEDIANAS (la media la levantan cuatro días de pánico): straddle ${n2(q(ms, 0.5))} · movimiento ${n2(q(mm, 0.5))} → el día NORMAL se mueve ${pc(q(mm, 0.5) / q(ms, 0.5) - 1)} respecto al billete`);
}
// y por año, para cada año de la muestra
const anos = [...new Set(fichas.map((f) => f.ano))].sort();
for (const a of anos) {
  const g = fichas.filter((f) => f.ano === a);
  console.log(`   ${a}: n=${String(g.length).padStart(4)}  straddle ${n2(mediaDe(g.map(f => f.straddle))).padStart(7)}  movimiento ${n2(mediaDe(g.map(f => f.mov))).padStart(7)}  ` +
              `supera ${pc(g.filter(f => f.mov > f.straddle).length / g.length)}`);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LA SEÑAL — caro/barato contra su propia mediana de 20 días, y el escalón por percentil causal
// ─────────────────────────────────────────────────────────────────────────────────────────────
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const MIN_HIST = 60, VENTANA_PCT = 250;

for (let i = 0; i < fichas.length; i++) {
  const prev20 = fichas.slice(Math.max(0, i - 20), i).map((f) => f.rel);
  fichas[i].ratio = prev20.length >= 20 ? fichas[i].rel / mediana(prev20) : null;
}
for (let i = 0; i < fichas.length; i++) {
  if (fichas[i].ratio == null) { fichas[i].cubo = null; continue; }
  const hist = [];
  for (let j = Math.max(0, i - VENTANA_PCT); j < i; j++) if (fichas[j].ratio != null) hist.push(fichas[j].ratio);
  if (hist.length < MIN_HIST) { fichas[i].cubo = null; continue; }
  const p = hist.filter((x) => x < fichas[i].ratio).length / hist.length;
  fichas[i].pct = p;
  fichas[i].cubo = Math.min(4, Math.floor(p * 5));   // 0 = el más BARATO de su propia historia
}
const conCubo = fichas.filter((f) => f.cubo != null);
console.log(`\ndías con escalón asignado (necesitan 20 días de mediana + 60 de historia de ratio): ${conCubo.length}`);

// años de muestra, para pasar todo a $/año
const ANOS_MUESTRA = (new Date(fichas[fichas.length - 1].dia) - new Date(fichas[0].dia)) / (365.25 * 24 * 3600 * 1000);
console.log(`la muestra cubre ${n2(ANOS_MUESTRA)} años`);

// ─────────────────────────────────────────────────────────────────────────────────────────────
// La contabilidad de una regla: recibe días y una función que devuelve el $ de la operación.
// ─────────────────────────────────────────────────────────────────────────────────────────────
function medir(grupo, extractor) {
  const rets = [], dol = [];
  let nulos = 0;
  for (const f of grupo) {
    const r = extractor(f);
    if (!r) { nulos++; continue; }
    rets.push(r.ret); dol.push(r.dolares);
  }
  const R = resumen(rets);
  const dolMedio = dol.length ? mediaDe(dol) : NaN;
  return { n: R.n, media: R.media, t: R.t, aciertos: R.aciertos, dolMedio, dolAno: (dol.length / ANOS_MUESTRA) * dolMedio, nulos };
}
const exStraddle = (s) => (f) => f.ops[s] ? { ret: (f.ops[s].c.ingreso + f.ops[s].p.ingreso - f.ops[s].c.coste - f.ops[s].p.coste) / (f.ops[s].c.coste + f.ops[s].p.coste), dolares: f.ops[s].c.dolares + f.ops[s].p.dolares } : null;
const exCall = (s) => (f) => f.ops[s]?.c ?? null;
const exPut = (s) => (f) => f.ops[s]?.p ?? null;
const fila = (etq, m) => `${etq.padEnd(30)} n=${String(m.n).padStart(4)}  media ${pc(m.media).padStart(9)}  t=${n2(m.t).padStart(6)}  aciertos ${pc(m.aciertos).padStart(7)}  ${d0(m.dolMedio).padStart(9)}/op  ${d0(m.dolAno).padStart(11)}/año  huecos ${m.nulos}`;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2) EL CONTROL TONTO — comprar TODOS los días, sin filtro
// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log(`\n══ 2) EL CONTROL TONTO — comprar todos los días, sin mirar nada ════════════════`);
const CONTROL = {};
for (const s of SALIDAS) {
  CONTROL[`straddle_${s}`] = medir(fichas, exStraddle(s));
  CONTROL[`call_${s}`] = medir(fichas, exCall(s));
  CONTROL[`put_${s}`] = medir(fichas, exPut(s));
  console.log(fila(`straddle 09:35→${s}`, CONTROL[`straddle_${s}`]));
  console.log(fila(`sólo call 09:35→${s}`, CONTROL[`call_${s}`]));
  console.log(fila(`sólo put  09:35→${s}`, CONTROL[`put_${s}`]));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 3) LA ESCALERA DE LOS CINCO ESCALONES
// ─────────────────────────────────────────────────────────────────────────────────────────────
const ETQ = ["1 MÁS BARATO", "2", "3 normal", "4", "5 MÁS CARO"];
for (const s of SALIDAS) {
  console.log(`\n══ 3) ESCALERA · salida ${s} ════════════════════════════════════════════════`);
  for (const nombre of ["straddle", "call", "put"]) {
    const ex = nombre === "straddle" ? exStraddle(s) : nombre === "call" ? exCall(s) : exPut(s);
    console.log(`  ── ${nombre} ──`);
    for (let c = 0; c < 5; c++) {
      const g = conCubo.filter((f) => f.cubo === c);
      console.log("   " + fila(ETQ[c], medir(g, ex)));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 4) EL BARAJADO — el mismo escalón, pero con la señal de OTRO día (desplazamiento fijo, 37)
// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log(`\n══ 4) EL BARAJADO — señal de otro día (desplazada 37 sesiones) ═════════════════`);
const DESP = 37;
for (const s of ["15:55"]) {
  for (const nombre of ["straddle", "call", "put"]) {
    const ex = nombre === "straddle" ? exStraddle(s) : nombre === "call" ? exCall(s) : exPut(s);
    for (const c of [0, 4]) {
      const g = conCubo.filter((f, i) => conCubo[(i + DESP) % conCubo.length].cubo === c);
      console.log("   " + fila(`${nombre} escalón ${ETQ[c]} BARAJADO`, medir(g, ex)));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 5) MITADES, TERCIOS Y AÑOS del escalón barato
// ─────────────────────────────────────────────────────────────────────────────────────────────
function trozos(grupo, ex, etq) {
  const n = grupo.length;
  const m1 = medir(grupo.slice(0, n >> 1), ex), m2 = medir(grupo.slice(n >> 1), ex);
  const t1 = medir(grupo.slice(0, Math.floor(n / 3)), ex);
  const t2 = medir(grupo.slice(Math.floor(n / 3), Math.floor((2 * n) / 3)), ex);
  const t3 = medir(grupo.slice(Math.floor((2 * n) / 3)), ex);
  console.log(`   ${etq}`);
  console.log(`      mitades : ${pc(m1.media)} (n=${m1.n})  |  ${pc(m2.media)} (n=${m2.n})`);
  console.log(`      tercios : ${pc(t1.media)}  /  ${pc(t2.media)}  /  ${pc(t3.media)}`);
  for (const a of anos) {
    const g = grupo.filter((f) => f.ano === a);
    if (!g.length) continue;
    const m = medir(g, ex);
    console.log(`      ${a}: n=${String(m.n).padStart(3)}  ${pc(m.media).padStart(9)}  ${d0(m.dolMedio).padStart(9)}/op  ${d0(m.dolAno).padStart(10)}/año`);
  }
  return { m1, m2, t1, t2, t3 };
}
console.log(`\n══ 5) MITADES, TERCIOS Y AÑOS ═════════════════════════════════════════════════`);
const barato = conCubo.filter((f) => f.cubo === 0);
const caro = conCubo.filter((f) => f.cubo === 4);
const TROZOS = {};
TROZOS.baratoStraddle = trozos(barato, exStraddle("15:55"), "escalón BARATO · straddle · salida 15:55");
TROZOS.baratoCall = trozos(barato, exCall("15:55"), "escalón BARATO · sólo call · salida 15:55");
TROZOS.baratoPut = trozos(barato, exPut("15:55"), "escalón BARATO · sólo put · salida 15:55");
TROZOS.todoStraddle = trozos(fichas, exStraddle("15:55"), "TODOS los días · straddle · salida 15:55 (el control tonto)");
TROZOS.caroStraddle = trozos(caro, exStraddle("15:55"), "escalón CARO · straddle · salida 15:55");
TROZOS.baratoCall1200 = trozos(barato, exCall("12:00"), "escalón BARATO · sólo call · salida 12:00");

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 6) EL CRUCE — ¿despierta alguna regla direccional en los días de prima barata?
// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log(`\n══ 6) EL CRUCE — reglas direccionales, todos los días contra los días baratos ══`);
const exMom = (f) => f.mom?.op ?? null;
const exMomInv = (f) => f.mom?.opInv ?? null;
const exIman = (f) => f.iman?.op ?? null;
const exImanInv = (f) => f.iman?.opInv ?? null;
console.log(fila("momento 10:00 → 15:55 (todos)", medir(fichas, exMom)));
console.log(fila("  su contrario (simetría)", medir(fichas, exMomInv)));
console.log(fila("momento · sólo BARATOS", medir(barato, exMom)));
console.log(fila("  su contrario (simetría)", medir(barato, exMomInv)));
console.log(fila("momento · sólo CAROS", medir(caro, exMom)));
console.log(fila("imán OI 09:35 → 15:55 (todos)", medir(fichas, exIman)));
console.log(fila("  su contrario (simetría)", medir(fichas, exImanInv)));
console.log(fila("imán OI · sólo BARATOS", medir(barato, exIman)));
console.log(fila("  su contrario (simetría)", medir(barato, exImanInv)));
console.log(fila("imán OI · sólo CAROS", medir(caro, exIman)));

// escalera del momento, por si el efecto es monótono
console.log(`\n  escalera del momento 10:00→15:55 por escalón de prima:`);
for (let c = 0; c < 5; c++) console.log("   " + fila(ETQ[c], medir(conCubo.filter((f) => f.cubo === c), exMom)));
console.log(`\n  escalera del imán de OI 09:35→15:55 por escalón de prima:`);
for (let c = 0; c < 5; c++) console.log("   " + fila(ETQ[c], medir(conCubo.filter((f) => f.cubo === c), exIman)));

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 7) LO MISMO PERO VENDIENDO — si comprar pierde, el espejo es el candidato natural.
//    OJO: aquí se VENDE al bid y se RECOMPRA al ask, o sea el peaje también va en contra.
// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log(`\n══ 7) EL ESPEJO — vender el straddle (mismo peaje, en contra) ══════════════════`);
console.log(`   (el retorno de vender es el de comprar cambiado de signo MENOS dos horquillas;`);
console.log(`    aquí se da en dólares, que es lo que se cobra, no en % sobre lo invertido)`);
for (const s of SALIDAS) {
  for (const [etq, g] of [["todos", fichas], ["BARATOS", barato], ["CAROS", caro]]) {
    const dol = [];
    for (const f of g) {
      const o = f.ops[s];
      if (!o) continue;
      dol.push(-(o.c.dolares + o.p.dolares));
    }
    const m = mediaDe(dol);
    console.log(`   vender straddle → ${s} · ${etq.padEnd(8)} n=${String(dol.length).padStart(4)}  ${d0(m).padStart(9)}/op  ${d0((dol.length / ANOS_MUESTRA) * m).padStart(11)}/año   ⚠ SIN el peaje de la venta`);
  }
}

console.log(`\n(NOTA sobre el bloque 7: es el reflejo aritmético de comprar, sin descontar las dos`);
console.log(` horquillas que pagaría el vendedor. Sirve para ver el TAMAÑO del peaje que cobra el`);
console.log(` vendedor, no como resultado de una estrategia de venta: eso pide su propio script.)`);

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 8) LA ÚNICA VARIANTE QUE ASOMA — momento a las 10:00 SÓLO en días de prima barata.
//    Es la mejor de la tanda (+9,57%), así que se le pasan TODOS los controles, no sólo el
//    que le conviene: mitades, tercios, años, barajado y simetría.
// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log(`\n══ 8) EL MEJOR CANDIDATO A EXAMEN COMPLETO ════════════════════════════════════`);
trozos(barato, exMom, "momento 10:00→15:55 · sólo días de prima BARATA");
console.log(`   simetría (comprar el lado contrario): ${pc(medir(barato, exMomInv).media)}  ${d0(medir(barato, exMomInv).dolMedio)}/op`);
const baratoBarajado = conCubo.filter((f, i) => conCubo[(i + DESP) % conCubo.length].cubo === 0);
console.log(`   BARAJADO (etiqueta de barato de otro día): ` + fila("", medir(baratoBarajado, exMom)));
for (const desp of [11, 23, 37, 53, 91]) {
  const g = conCubo.filter((f, i) => conCubo[(i + desp) % conCubo.length].cubo === 0);
  const m = medir(g, exMom);
  console.log(`     desplazamiento ${String(desp).padStart(3)}: n=${m.n}  ${pc(m.media).padStart(9)}  ${d0(m.dolMedio).padStart(8)}/op`);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 9) LA REJILLA DE ROBUSTEZ — el mismo candidato con OTRAS horas. Si sólo funciona con la
//    combinación exacta que le encontré, es que le he encontrado la combinación, no la señal.
// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log(`
══ 9) REJILLA DE ROBUSTEZ del momento en días de prima barata ══════════════════`);
console.log(`   (cada casilla: media % · $/op · n) — «todos» es el control tonto de esa misma casilla`);
for (const hE of ["10:00", "10:30", "11:00"]) {
  for (const hS of ["12:00", "14:00", "15:55"]) {
    const k = `${hE}>${hS}`;
    const ex = (f) => f.momG[k] ?? null;
    const mb = medir(barato, ex), mt = medir(fichas, ex), m12 = medir(conCubo.filter((f) => f.cubo <= 1), ex);
    if (!mb.n) continue;
    console.log(`   ${k}  BARATO ${pc(mb.media).padStart(9)} ${d0(mb.dolMedio).padStart(7)}/op n=${String(mb.n).padStart(3)}  |  ` +
                `BARATO+2 ${pc(m12.media).padStart(9)} ${d0(m12.dolMedio).padStart(7)}/op n=${String(m12.n).padStart(3)}  |  ` +
                `todos ${pc(mt.media).padStart(9)} ${d0(mt.dolMedio).padStart(7)}/op n=${mt.n}`);
  }
}
