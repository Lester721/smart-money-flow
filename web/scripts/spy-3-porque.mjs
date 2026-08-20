// ═══════════════════════════════════════════════════════════════════════════════════════════
// SPY · PASO 3 — POR QUÉ no funciona, y QUÉ LE FALTARÍA para funcionar.
//
// El paso 2 dice que ninguna de las 9 variantes pasa. Eso es dónde EMPIEZA el trabajo, no
// dónde termina. Aquí se abre el mecanismo:
//
//   0. AUDITORÍA DEL PROPIO MOTOR: rebote-a-cierre y rotura-a-cierre son la MISMA operación con
//      el signo cambiado. Si su P&L no suma ≈ −2 peajes, hay un fallo en el motor y todo lo de
//      antes sobra. Se comprueba ANTES de interpretar nada.
//   1. LA FORMA del rebote: acierta el 62% y pierde dinero. ¿Cuánto gana cuando gana y cuánto
//      pierde cuando pierde?
//   2. ¿CONTIENE EL MURO? — sin dinero de por medio: cuánto se pasa el precio DEL nivel, real
//      contra una raya puesta al azar a la misma distancia. Es la pregunta física.
//   3. EL PUENTE: exigir una distancia mínima al muro. Elegido en una mitad, probado en la otra,
//      y al revés.
//   4. POTENCIA: qué ventaja por operación habría hecho falta, y si se habría visto.
//   5. EL PEAJE: cuánto se lleva en total. ¿Sobreviviría si fuese gratis?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/spy-3-porque.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos.ts";

const CUENTA = 56389, MEDIA_HORQ = 0.005, SEC = 0.0000278, TAF = 0.000166, DIAS_ANO = 252;
const J = JSON.parse(readFileSync("scripts/spy-dias.json", "utf8"));
const DIAS = J.dias;

const media = (v) => v.reduce((a, b) => a + b, 0) / v.length;
function tStat(v) {
  if (v.length < 3) return 0;
  const m = media(v), sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
  return sd > 0 ? m / (sd / Math.sqrt(v.length)) : 0;
}
const P = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
function rng(s0) { let s = s0 >>> 0; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// mismo motor que el paso 2, copiado tal cual para que este fichero se pueda leer solo
function operar(dia, niveles, modo, distMin = 0) {
  const cam = dia.camino, p0 = cam[0][1];
  let { call, put } = niveles;
  if (call != null && (call - p0) / p0 < distMin) call = null;      // distancia mínima exigida
  if (put != null && (p0 - put) / p0 < distMin) put = null;
  const callOK = call != null && call > p0, putOK = put != null && put < p0;
  if (!callOK && !putOK) return null;
  let dispIdx = -1, lado = null;
  for (let i = 1; i < cam.length - 1; i++) {
    const p = cam[i][1];
    if (callOK && p >= call) { dispIdx = i; lado = "call"; break; }
    if (putOK && p <= put) { dispIdx = i; lado = "put"; break; }
  }
  if (dispIdx < 0) return null;
  const dir = modo === "rebote" ? (lado === "call" ? -1 : 1) : (lado === "call" ? 1 : -1);
  const fill = dispIdx + 1, midIn = cam[fill][1];
  const pIn = dir === 1 ? midIn + MEDIA_HORQ : midIn - MEDIA_HORQ;
  const acciones = Math.floor(CUENTA / pIn);
  const obj = niveles.objetivo;
  const objValido = obj != null && ((dir === 1 && obj > midIn) || (dir === -1 && obj < midIn));
  let salIdx = cam.length - 1, porObjetivo = false;
  if (objValido) for (let i = fill + 1; i < cam.length - 1; i++) {
    const p = cam[i][1];
    if ((dir === 1 && p >= obj) || (dir === -1 && p <= obj)) { salIdx = i + 1; porObjetivo = true; break; }
  }
  const midOut = cam[salIdx][1];
  const pOut = dir === 1 ? midOut - MEDIA_HORQ : midOut + MEDIA_HORQ;
  const bruto = dir * (pOut - pIn) * acciones;
  const tasas = (dir === 1 ? pOut : pIn) * acciones * SEC + Math.min(8.30, acciones * TAF);
  // el peaje en dólares: media horquilla a la ida + media a la vuelta, por acción
  const peaje = 2 * MEDIA_HORQ * acciones + tasas;
  return { fecha: dia.fecha, ano: dia.ano, lado, dir, acciones, dispIdx, fill, salIdx, porObjetivo,
           pnl: bruto - tasas, peaje, brutoSinPeaje: dir * (midOut - midIn) * acciones };
}
const resumen = (ops, nDias) => {
  if (!ops.length) return { n: 0, anual: 0, t: 0 };
  const v = ops.map((o) => o.pnl);
  return { n: ops.length, anual: Math.round((v.reduce((a, b) => a + b, 0) / nDias) * DIAS_ANO), t: +tStat(v).toFixed(2),
           acierto: +((v.filter((x) => x > 0).length / v.length) * 100).toFixed(1), mediaOp: +media(v).toFixed(1) };
};
const nivDe = (d, L, objKey) => ({ call: d.niv[L].muroCall, put: d.niv[L].muroPut,
  objetivo: objKey === "iman" ? d.niv[L].imanBruto : objKey === "apertura" ? d.camino[0][1] : null });

console.log(`\n╔══ SPY · PASO 3: POR QUÉ, Y QUÉ FALTARÍA ══╗\n  ${DIAS.length} días · ${DIAS[0].fecha} → ${DIAS[DIAS.length - 1].fecha}\n`);

// ═══ 0. AUDITORÍA DEL MOTOR ════════════════════════════════════════════════════════════════
console.log(`── 0. AUDITORÍA: rebote-a-cierre debe ser el ESPEJO de rotura-a-cierre ──`);
let malos = 0, sumaDif = 0, nPar = 0;
for (const L of ["gam", "gamD", "oi"]) {
  const a = [], b = [];
  for (const d of DIAS) {
    const r1 = operar(d, nivDe(d, L, null), "rebote"), r2 = operar(d, nivDe(d, L, null), "rotura");
    if (r1 && r2) { a.push(r1); b.push(r2); }
  }
  // la suma de los dos P&L tiene que ser ≈ −(peaje1 + peaje2)
  let peor = 0;
  for (let i = 0; i < a.length; i++) {
    const suma = a[i].pnl + b[i].pnl, esperado = -(a[i].peaje + b[i].peaje);
    const dif = Math.abs(suma - esperado);
    sumaDif += dif; nPar++;
    if (dif > 5) { malos++; if (dif > peor) peor = dif; }
  }
  const sa = resumen(a, DIAS.length), sb = resumen(b, DIAS.length);
  console.log(`  ${L.padEnd(5)} n=${a.length} · rebote-a-cierre $${sa.anual}/año · rotura-a-cierre $${sb.anual}/año · suma $${sa.anual + sb.anual}/año (debe ser el peaje doble, negativo)`);
}
console.log(`  desajustes > $5 en el espejo: ${malos} de ${nPar} pares · desajuste medio $${(sumaDif / nPar).toFixed(3)}`);
console.log(`  ${malos === 0 ? "✅ el motor es coherente: lo que gana un lado lo pierde el otro, menos el peaje." : "🔴 EL MOTOR NO CUADRA — no se interpreta nada más hasta arreglarlo."}\n`);
if (malos > 0) process.exit(1);

// ═══ 1. LA FORMA DEL REBOTE ════════════════════════════════════════════════════════════════
console.log(`── 1. LA FORMA: acierta mucho y pierde dinero ──`);
const forma = {};
for (const L of ["gam", "gamD"]) for (const o of ["iman", "apertura"]) {
  const ops = DIAS.map((d) => operar(d, nivDe(d, L, o), "rebote")).filter(Boolean);
  const g = ops.filter((x) => x.pnl > 0).map((x) => x.pnl), pp = ops.filter((x) => x.pnl <= 0).map((x) => x.pnl);
  const porObj = ops.filter((x) => x.porObjetivo).length;
  forma[`${L}|${o}`] = { n: ops.length, acierto: +((g.length / ops.length) * 100).toFixed(1),
    ganaMedia: +media(g).toFixed(0), pierdeMedia: +media(pp).toFixed(0),
    razon: +(media(g) / -media(pp)).toFixed(2), llegaAlObjetivo: +((porObj / ops.length) * 100).toFixed(1),
    minutosEnMercado: Math.round(media(ops.map((x) => x.salIdx - x.fill))) };
  const f = forma[`${L}|${o}`];
  console.log(`  rebote ${L}/${o}: acierta ${f.acierto}% · gana $${f.ganaMedia} cuando gana · pierde $${f.pierdeMedia} cuando pierde`);
  console.log(`     → razón ganancia/pérdida ${f.razon} (para vivir con ${f.acierto}% hace falta > ${((100 - f.acierto) / f.acierto).toFixed(2)})`);
  console.log(`     llega al objetivo el ${f.llegaAlObjetivo}% de las veces · ${f.minutosEnMercado} min en mercado de media`);
}

// ═══ 2. ¿CONTIENE EL MURO? — la pregunta física, sin dinero ════════════════════════════════
// Tras tocar el nivel, ¿cuánto se lo pasa el precio? Real contra raya al azar a la misma distancia.
console.log(`\n── 2. ¿CONTIENE EL MURO? (excursión MÁS ALLÁ del nivel tras tocarlo, en $ de SPY) ──`);
const fisica = {};
function excursiones(dias, tomaNivel) {
  const out = [];
  for (const d of dias) {
    const cam = d.camino, p0 = cam[0][1];
    const n = tomaNivel(d);
    for (const [lado, nivel] of [["call", n.call], ["put", n.put]]) {
      if (nivel == null) continue;
      if (lado === "call" ? !(nivel > p0) : !(nivel < p0)) continue;
      let toco = -1;
      for (let i = 1; i < cam.length; i++) { const p = cam[i][1]; if (lado === "call" ? p >= nivel : p <= nivel) { toco = i; break; } }
      if (toco < 0) continue;
      let extremo = cam[toco][1];
      for (let i = toco; i < cam.length; i++) { const p = cam[i][1]; if (lado === "call" ? p > extremo : p < extremo) extremo = p; }
      const paso = lado === "call" ? extremo - nivel : nivel - extremo;
      // ¿vuelve al precio de las 09:35 antes del cierre?
      let vuelve = false;
      for (let i = toco; i < cam.length; i++) { const p = cam[i][1]; if (lado === "call" ? p <= p0 : p >= p0) { vuelve = true; break; } }
      out.push({ paso, vuelve, lado });
    }
  }
  return out;
}
for (const L of ["gam", "gamD"]) {
  const real = excursiones(DIAS, (d) => nivDe(d, L, null));
  // control: mismas distancias, barajadas entre días
  const rnd = rng(777 + L.length);
  const dist = DIAS.map((d) => { const p0 = d.camino[0][1], n = nivDe(d, L, null);
    return { c: n.call == null ? null : (n.call - p0) / p0, u: n.put == null ? null : (n.put - p0) / p0 }; });
  const azarPasos = [], azarVuelve = [];
  for (let b = 0; b < 50; b++) {
    const e = excursiones(DIAS, (d) => { const p0 = d.camino[0][1], j = Math.floor(rnd() * DIAS.length), dj = dist[j];
      return { call: dj.c == null ? null : p0 * (1 + dj.c), put: dj.u == null ? null : p0 * (1 + dj.u), objetivo: null }; });
    if (e.length) { azarPasos.push(P(e.map((x) => x.paso), 0.5)); azarVuelve.push(e.filter((x) => x.vuelve).length / e.length); }
  }
  const f = { n: real.length,
    pasoP50: +P(real.map((x) => x.paso), 0.5).toFixed(3), pasoP75: +P(real.map((x) => x.paso), 0.75).toFixed(3),
    pasoAzarP50: +media(azarPasos).toFixed(3),
    vuelve: +((real.filter((x) => x.vuelve).length / real.length) * 100).toFixed(1),
    vuelveAzar: +(media(azarVuelve) * 100).toFixed(1) };
  fisica[L] = f;
  console.log(`  ${L}: ${f.n} toques · se pasa del nivel p50 $${f.pasoP50} (azar a la misma distancia: $${f.pasoAzarP50})`);
  console.log(`     vuelve al precio de las 09:35 antes del cierre: ${f.vuelve}%  (azar ${f.vuelveAzar}%)  → diferencia ${(f.vuelve - f.vuelveAzar).toFixed(1)} pp`);
}

// ═══ 3. EL PUENTE: exigir distancia mínima ═════════════════════════════════════════════════
console.log(`\n── 3. EL PUENTE: ¿y si sólo se opera el muro que está LEJOS? ──`);
const CORTE = "2024-01-01";
const A = DIAS.filter((d) => d.fecha < CORTE), B = DIAS.filter((d) => d.fecha >= CORTE);
const UMBRALES = [0, 0.001, 0.002, 0.003, 0.005, 0.0075, 0.01];
const rejilla = [];
for (const L of ["gam", "gamD"]) for (const modo of ["rebote", "rotura"]) for (const u of UMBRALES)
  rejilla.push({ id: `${modo}|${L}|d>=${(u * 100).toFixed(2)}%`, L, modo, u });
const evalua = (p, dias) => resumen(dias.map((d) => operar(d, nivDe(d, p.L, p.modo === "rebote" ? "iman" : null), p.modo, p.u)).filter(Boolean), dias.length);
for (const p of rejilla) { p.A = evalua(p, A); p.B = evalua(p, B); p.T = evalua(p, DIAS); }
const conMuestra = (mitad) => rejilla.filter((p) => p[mitad].n >= 30);
const mejA = conMuestra("A").sort((a, b) => b.A.anual - a.A.anual)[0];
const mejB = conMuestra("B").sort((a, b) => b.B.anual - a.B.anual)[0];
console.log(`  ${rejilla.length} combinaciones probadas (2 lentes × 2 modos × ${UMBRALES.length} distancias)`);
console.log(`  ELIJO en A → "${mejA.id}"  A: $${mejA.A.anual}/año (n=${mejA.A.n})  →  en B: $${mejA.B.anual}/año (n=${mejA.B.n}, t=${mejA.B.t})`);
console.log(`  ELIJO en B → "${mejB.id}"  B: $${mejB.B.anual}/año (n=${mejB.B.n})  →  en A: $${mejB.A.anual}/año (n=${mejB.A.n}, t=${mejB.A.t})`);
const puenteVive = mejA.B.anual > 0 && mejB.A.anual > 0;
console.log(`  ¿sobrevive el cruce en LAS DOS direcciones? ${puenteVive ? "SÍ" : "NO"}`);
console.log(`\n  las 5 mejores de TODO el período (para ver si alguna merece mirarse):`);
for (const p of [...rejilla].sort((a, b) => b.T.anual - a.T.anual).slice(0, 5))
  console.log(`    ${p.id.padEnd(26)} n=${String(p.T.n).padStart(4)} · $${String(p.T.anual).padStart(6)}/año · t=${String(p.T.t).padStart(5)} · A $${String(p.A.anual).padStart(6)} / B $${String(p.B.anual).padStart(6)}`);
const LISTON_PUENTE = listonT(9 + rejilla.length);
console.log(`  listón acumulado tras ${9 + rejilla.length} pruebas: |t| ≥ ${LISTON_PUENTE}`);

// ═══ 4. POTENCIA ═══════════════════════════════════════════════════════════════════════════
console.log(`\n── 4. POTENCIA: ¿se habría visto una ventaja de verdad? ──`);
const potencia = {};
for (const [nombre, L, modo, obj] of [["rebote|gam|iman", "gam", "rebote", "iman"], ["rotura|gamD|cierre", "gamD", "rotura", null]]) {
  const ops = DIAS.map((d) => operar(d, nivDe(d, L, obj), modo)).filter(Boolean);
  const v = ops.map((x) => x.pnl);
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - media(v)) ** 2, 0) / (v.length - 1));
  const liston = listonT(9);
  const necesita = (liston * sd) / Math.sqrt(v.length);      // $/op que daría t = listón
  const opsAno = (ops.length / DIAS.length) * DIAS_ANO;
  const pctDelRango = (necesita / media(ops.map((x) => x.acciones))) / P(DIAS.map((d) => d.max - d.min), 0.5) * 100;
  potencia[nombre] = { n: v.length, sdOp: +sd.toFixed(0), necesitaOp: +necesita.toFixed(0),
    necesitaAno: Math.round(necesita * opsAno), pctDelRangoDiario: +pctDelRango.toFixed(2), observado: +media(v).toFixed(0) };
  const q = potencia[nombre];
  console.log(`  ${nombre}: n=${q.n} · desviación $${q.sdOp}/op`);
  console.log(`     para t=${liston} haría falta $${q.necesitaOp}/op = $${q.necesitaAno}/año. Observado: $${q.observado}/op.`);
  console.log(`     esos $${q.necesitaOp} son el ${q.pctDelRangoDiario}% del rango diario mediano de SPY. Una ventaja así SE HABRÍA VISTO.`);
}

// ═══ 5. EL PEAJE ═══════════════════════════════════════════════════════════════════════════
console.log(`\n── 5. EL PEAJE: ¿es el peaje el que mata esto? ──`);
const peajes = {};
for (const [nombre, L, modo, obj] of [["rebote|gam|iman", "gam", "rebote", "iman"], ["rotura|gamD|cierre", "gamD", "rotura", null]]) {
  const ops = DIAS.map((d) => operar(d, nivDe(d, L, obj), modo)).filter(Boolean);
  const conPeaje = (ops.reduce((a, x) => a + x.pnl, 0) / DIAS.length) * DIAS_ANO;
  const sinPeaje = (ops.reduce((a, x) => a + x.brutoSinPeaje, 0) / DIAS.length) * DIAS_ANO;
  const costeAno = (ops.reduce((a, x) => a + x.peaje, 0) / DIAS.length) * DIAS_ANO;
  peajes[nombre] = { conPeaje: Math.round(conPeaje), sinPeaje: Math.round(sinPeaje), costeAno: Math.round(costeAno),
    peajeMedioOp: +media(ops.map((x) => x.peaje)).toFixed(2) };
  const q = peajes[nombre];
  console.log(`  ${nombre}: con peaje $${q.conPeaje}/año · SIN peaje (imposible, sólo para ver) $${q.sinPeaje}/año`);
  console.log(`     el peaje cuesta $${q.costeAno}/año ($${q.peajeMedioOp} por operación, con ~105 acciones... el 0,2% del recorrido)`);
  console.log(`     → ${q.sinPeaje > 0 && q.conPeaje < 0 ? "el peaje SÍ es el que lo mata" : q.sinPeaje < 0 ? "REGALANDO el peaje sigue perdiendo: no es el peaje, es la señal" : "el peaje no cambia el signo"}`);
}

writeFileSync("scripts/spy-porque.json", JSON.stringify({
  generado: new Date().toISOString(), forma, fisica, potencia, peajes,
  puente: { vive: puenteVive, mejorEnA: mejA.id, aEnB: mejA.B, mejorEnB: mejB.id, bEnA: mejB.A,
            liston: LISTON_PUENTE, top5: [...rejilla].sort((a, b) => b.T.anual - a.T.anual).slice(0, 5).map((p) => ({ id: p.id, ...p.T, A: p.A.anual, B: p.B.anual })) },
}, null, 1), "utf8");
console.log(`\n  escrito scripts/spy-porque.json`);
