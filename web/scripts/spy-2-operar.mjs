// ═══════════════════════════════════════════════════════════════════════════════════════════
// SPY · PASO 2 — OPERAR LOS NIVELES DE GEX CON EL VEHÍCULO BARATO
//
// La pregunta de Victor no es "¿opero hoy?" (eso ya se midió dos veces y no separa) sino
// "¿hacia dónde va el precio y dónde se para?". Aquí se cobra esa respuesta con SPY.
//
// ═══ LAS DOS ESTRATEGIAS, declaradas ANTES de mirar ninguna cifra ═══════════════════════════
//
//   REBOTE   el precio toca un muro → se opera EN CONTRA, objetivo el imán.
//            toca el muro de calls (arriba) → CORTO · toca el de puts (abajo) → LARGO
//   ROTURA   el precio atraviesa un muro → se opera A FAVOR, hasta el cierre.
//            atraviesa el de calls → LARGO · atraviesa el de puts → CORTO
//
// Son la misma señal con el signo cambiado: si una gana, la otra pierde (menos dos peajes).
// Por eso se miden las dos: el par dice si el muro contiene o si el muro empuja.
//
// ═══ MECÁNICA, sin regalos ═════════════════════════════════════════════════════════════════
//
//   DISPARO en el minuto m (el precio cruza el nivel) · RELLENO en el minuto m+1.
//     Nunca se entra al precio que dispara la señal: ese precio es el que se está MIRANDO para
//     decidir. Entrar en él regala un minuto de información. Igual en la salida.
//   PRECIOS REALES: camino[] es el punto MEDIO del NBBO de SPY. Se COMPRA al ask (medio+0,005)
//     y se VENDE al bid (medio−0,005). Nunca el punto medio como resultado.
//   TASAS: Robinhood no cobra comisión en acciones. Sí hay tasas regulatorias en la VENTA:
//     SEC 0,0000278 × principal + FINRA TAF 0,000166 × acciones (tope $8,30). Se restan.
//   UNA OPERACIÓN POR DÍA, la del PRIMER toque. Coger el mejor toque del día sería elegir con
//     el futuro puesto. Y SIEMPRE se cierra el mismo día (es day trading).
//   TAMAÑO: $56.389 de nocional = la cuenta entera a 1x, SIN apalancar. El poder de compra es
//     $73.874, así que cabe. SPY no se puede apalancar sin margen intradía, y no hace falta.
//
// ═══ LOS DOS CONTROLES QUE DECIDEN ═════════════════════════════════════════════════════════
//
//   AZAR   niveles aleatorios A LA MISMA DISTANCIA: el día i recibe las distancias (en % del
//          precio) de otro día j elegido al azar. Misma geometría, cero información del día i.
//          200 barajas → percentil del resultado real. Si el muro no le gana a una raya puesta
//          al azar a la misma distancia, el muro no existe.
//   CRUCE  se elige el mejor ajuste en 2022-2023 y se prueba en 2024-2026, y AL REVÉS.
//          Sólo cuenta lo que funcione en las DOS direcciones.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/spy-2-operar.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos.ts";

const ENTRADA = "scripts/spy-dias.json";
const SALIDA = "scripts/spy-operar.json";
const CUENTA = 56389;          // el nocional de cada operación: la cuenta a 1x
const MEDIA_HORQ = 0.005;      // media horquilla de SPY = medio céntimo
const SEC = 0.0000278;         // tasa SEC sobre el principal de la VENTA
const TAF = 0.000166;          // FINRA TAF por acción vendida, tope $8,30
const BARAJAS = 200;

const J = JSON.parse(readFileSync(ENTRADA, "utf8"));
const DIAS = J.dias;
const DIAS_ANO = 252;

// ── utilidades ─────────────────────────────────────────────────────────────────────────────
const media = (v) => v.reduce((a, b) => a + b, 0) / v.length;
function tStat(v) {
  if (v.length < 3) return 0;
  const m = media(v);
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
  return sd > 0 ? (m / (sd / Math.sqrt(v.length))) * 1 : 0;
}
const P = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
// generador reproducible — un control que cambia en cada corrida no es un control
function rng(semilla) {
  let s = semilla >>> 0;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// ═══ EL MOTOR ══════════════════════════════════════════════════════════════════════════════
// niveles = {call, put, objetivo}  en DÓLARES DE SPY, ya convertidos. modo = "rebote"|"rotura".
// Devuelve null si ese día no hubo señal.
function operar(dia, niveles, modo) {
  const cam = dia.camino;
  const p0 = cam[0][1];                               // SPY a las 09:35
  const { call, put } = niveles;
  const callOK = call != null && call > p0;           // el muro de calls tiene que estar ARRIBA
  const putOK = put != null && put < p0;              // el de puts, ABAJO
  if (!callOK && !putOK) return null;

  // ── disparo: primer cruce, mirando de 09:36 en adelante ──
  let dispIdx = -1, lado = null;
  for (let i = 1; i < cam.length - 1; i++) {
    const p = cam[i][1];
    if (callOK && p >= call) { dispIdx = i; lado = "call"; break; }
    if (putOK && p <= put) { dispIdx = i; lado = "put"; break; }
  }
  if (dispIdx < 0) return null;

  // rebote = en contra del muro · rotura = a favor
  const dir = modo === "rebote" ? (lado === "call" ? -1 : 1) : (lado === "call" ? 1 : -1);

  // ── relleno en el minuto SIGUIENTE al que dispara ──
  const fill = dispIdx + 1;
  const midIn = cam[fill][1];
  const pIn = dir === 1 ? midIn + MEDIA_HORQ : midIn - MEDIA_HORQ;   // compro al ask, vendo al bid
  const acciones = Math.floor(CUENTA / pIn);
  if (acciones < 1) return null;

  // ── objetivo: sólo vale si está del lado que gana; si no, se aguanta al cierre ──
  let obj = niveles.objetivo;
  let objValido = obj != null && ((dir === 1 && obj > midIn) || (dir === -1 && obj < midIn));

  let salIdx = cam.length - 1, porObjetivo = false;
  if (objValido) {
    for (let i = fill + 1; i < cam.length - 1; i++) {
      const p = cam[i][1];
      if ((dir === 1 && p >= obj) || (dir === -1 && p <= obj)) { salIdx = i + 1; porObjetivo = true; break; }
    }
  }
  const midOut = cam[salIdx][1];
  const pOut = dir === 1 ? midOut - MEDIA_HORQ : midOut + MEDIA_HORQ; // cierro largo al bid, corto al ask

  const bruto = dir * (pOut - pIn) * acciones;
  const principalVenta = (dir === 1 ? pOut : pIn) * acciones;         // una sola VENTA por ida y vuelta
  const tasas = principalVenta * SEC + Math.min(8.30, acciones * TAF);
  return {
    fecha: dia.fecha, ano: dia.ano, lado, dir, acciones,
    minEntrada: cam[fill][0], minSalida: cam[salIdx][0], porObjetivo, objValido,
    pIn: +pIn.toFixed(3), pOut: +pOut.toFixed(3),
    pnl: +(bruto - tasas).toFixed(2), tasas: +tasas.toFixed(2),
  };
}

// ── resumen de una lista de operaciones ────────────────────────────────────────────────────
function resumir(ops, nDias) {
  if (!ops.length) return { n: 0 };
  const v = ops.map((o) => o.pnl);
  const total = v.reduce((a, b) => a + b, 0);
  const opsAno = (ops.length / nDias) * DIAS_ANO;
  let acum = 0, pico = 0, peorRacha = 0;
  const orden = [...ops].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  for (const o of orden) { acum += o.pnl; if (acum > pico) pico = acum; if (acum - pico < peorRacha) peorRacha = acum - pico; }
  const peor = orden.reduce((a, b) => (b.pnl < a.pnl ? b : a));
  return {
    n: ops.length, opsAno: +opsAno.toFixed(1),
    mediaOp: +media(v).toFixed(2), medianaOp: +P(v, 0.5).toFixed(2),
    t: +tStat(v).toFixed(2),
    acierto: +((v.filter((x) => x > 0).length / v.length) * 100).toFixed(1),
    anual: +((total / nDias) * DIAS_ANO).toFixed(0),
    anualPct: +(((total / nDias) * DIAS_ANO / CUENTA) * 100).toFixed(2),
    peorDia: +peor.pnl.toFixed(0), peorFecha: peor.fecha,
    peorRacha: +peorRacha.toFixed(0),
    porObjetivo: +((ops.filter((o) => o.porObjetivo).length / ops.length) * 100).toFixed(1),
  };
}

// ═══ LA REJILLA — declarada aquí, entera, antes de ver un solo número ══════════════════════
const LENTES = ["gam", "gamD", "oi"];
const OBJETIVOS = {
  iman: (d, L) => d.niv[L].imanBruto,
  apertura: (d) => d.camino[0][1],
};
const PRUEBAS = [];
for (const L of LENTES) for (const o of Object.keys(OBJETIVOS)) PRUEBAS.push({ id: `rebote|${L}|${o}`, L, modo: "rebote", obj: o });
for (const L of LENTES) PRUEBAS.push({ id: `rotura|${L}|cierre`, L, modo: "rotura", obj: null });
const LISTON = listonT(PRUEBAS.length);

console.log(`\n╔══ SPY · OPERAR LOS NIVELES DE GEX ══╗`);
console.log(`  ${DIAS.length} días · ${DIAS[0].fecha} → ${DIAS[DIAS.length - 1].fecha}`);
console.log(`  ${J.conversion}`);
console.log(`  nocional $${CUENTA.toLocaleString("es")} por operación (1x, sin apalancar) · horquilla $0,01 ida y vuelta + tasas SEC/TAF`);
console.log(`  disparo en el minuto m, RELLENO en m+1 · una operación al día · cierre el mismo día`);
console.log(`  ${PRUEBAS.length} pruebas declaradas → listón |t| ≥ ${LISTON}\n`);

// ── ejecutar la rejilla completa sobre TODO el período ─────────────────────────────────────
const niv = (d, p) => ({ call: d.niv[p.L].muroCall, put: d.niv[p.L].muroPut, objetivo: p.obj ? OBJETIVOS[p.obj](d, p.L) : null });
const todo = {};
for (const p of PRUEBAS) {
  const ops = [];
  for (const d of DIAS) { const o = operar(d, niv(d, p), p.modo); if (o) ops.push(o); }
  todo[p.id] = { ops, res: resumir(ops, DIAS.length) };
}

console.log(`── 1. TODO EL PERÍODO (2022-01 → 2026-08) ──`);
console.log(`  ${"estrategia".padEnd(22)} ${"n".padStart(5)} ${"ops/año".padStart(8)} ${"$/op".padStart(9)} ${"acierto".padStart(8)} ${"t".padStart(7)} ${"$/año".padStart(10)} ${"%/año".padStart(7)}  peor día   peor racha`);
for (const p of PRUEBAS) {
  const r = todo[p.id].res;
  if (!r.n) { console.log(`  ${p.id.padEnd(22)} SIN OPERACIONES`); continue; }
  console.log(`  ${p.id.padEnd(22)} ${String(r.n).padStart(5)} ${String(r.opsAno).padStart(8)} ${r.mediaOp.toFixed(0).padStart(9)} ${(r.acierto + "%").padStart(8)} ${r.t.toFixed(2).padStart(7)} ${r.anual.toLocaleString("es").padStart(10)} ${(r.anualPct + "%").padStart(7)}  ${r.peorDia.toLocaleString("es").padStart(8)}  ${r.peorRacha.toLocaleString("es").padStart(10)}`);
}

// ═══ 2. EL CONTROL DEL AZAR ════════════════════════════════════════════════════════════════
// El día i recibe las distancias porcentuales de otro día j. Misma geometría, cero información.
console.log(`\n── 2. CONTRA NIVELES ALEATORIOS A LA MISMA DISTANCIA (${BARAJAS} barajas) ──`);
const azar = {};
for (const p of PRUEBAS) {
  const r = todo[p.id].res;
  if (!r.n) continue;
  // distancias reales, en % del precio de entrada de cada día
  const dist = DIAS.map((d) => {
    const p0 = d.camino[0][1];
    const n = niv(d, p);
    return {
      c: n.call == null ? null : (n.call - p0) / p0,
      u: n.put == null ? null : (n.put - p0) / p0,
      o: n.objetivo == null ? null : (n.objetivo - p0) / p0,
    };
  });
  const anuales = [];
  const rnd = rng(20260820 + p.id.length * 7919);
  for (let b = 0; b < BARAJAS; b++) {
    const ops = [];
    for (let i = 0; i < DIAS.length; i++) {
      const j = Math.floor(rnd() * DIAS.length);
      const d = DIAS[i], p0 = d.camino[0][1], dj = dist[j];
      const o = operar(d, {
        call: dj.c == null ? null : p0 * (1 + dj.c),
        put: dj.u == null ? null : p0 * (1 + dj.u),
        objetivo: dj.o == null ? null : p0 * (1 + dj.o),
      }, p.modo);
      if (o) ops.push(o);
    }
    anuales.push(ops.length ? (ops.reduce((a, x) => a + x.pnl, 0) / DIAS.length) * DIAS_ANO : 0);
  }
  const mejores = anuales.filter((x) => x < r.anual).length;
  azar[p.id] = { p50: +P(anuales, 0.5).toFixed(0), p95: +P(anuales, 0.95).toFixed(0), percentil: +((mejores / BARAJAS) * 100).toFixed(1) };
  console.log(`  ${p.id.padEnd(22)} real ${r.anual.toLocaleString("es").padStart(9)} · azar p50 ${azar[p.id].p50.toLocaleString("es").padStart(9)} · azar p95 ${azar[p.id].p95.toLocaleString("es").padStart(9)} → percentil ${String(azar[p.id].percentil).padStart(5)}%`);
}

// ═══ 3. LA PARTICIÓN — en las DOS direcciones ══════════════════════════════════════════════
const CORTE = "2024-01-01";
const A = DIAS.filter((d) => d.fecha < CORTE), B = DIAS.filter((d) => d.fecha >= CORTE);
console.log(`\n── 3. PARTICIÓN  A=${A[0].fecha}→${A[A.length - 1].fecha} (${A.length} días) · B=${B[0].fecha}→${B[B.length - 1].fecha} (${B.length} días) ──`);
const porMitad = {};
for (const p of PRUEBAS) {
  const oA = todo[p.id].ops.filter((o) => o.fecha < CORTE), oB = todo[p.id].ops.filter((o) => o.fecha >= CORTE);
  porMitad[p.id] = { A: resumir(oA, A.length), B: resumir(oB, B.length) };
}
console.log(`  ${"estrategia".padEnd(22)} ${"A $/año".padStart(10)} ${"A t".padStart(7)} ${"A acc".padStart(7)} | ${"B $/año".padStart(10)} ${"B t".padStart(7)} ${"B acc".padStart(7)}   mismo signo`);
for (const p of PRUEBAS) {
  const m = porMitad[p.id];
  if (!m.A.n || !m.B.n) { console.log(`  ${p.id.padEnd(22)} sin muestra en una mitad`); continue; }
  const mismo = Math.sign(m.A.anual) === Math.sign(m.B.anual);
  console.log(`  ${p.id.padEnd(22)} ${m.A.anual.toLocaleString("es").padStart(10)} ${m.A.t.toFixed(2).padStart(7)} ${(m.A.acierto + "%").padStart(7)} | ${m.B.anual.toLocaleString("es").padStart(10)} ${m.B.t.toFixed(2).padStart(7)} ${(m.B.acierto + "%").padStart(7)}   ${mismo ? (m.A.anual > 0 ? "✅ los dos +" : "🔻 los dos −") : "❌ se contradicen"}`);
}

// el cruce de verdad: ELEGIR en una mitad y PROBAR en la otra
const mejorEn = (mitad) => PRUEBAS.filter((p) => porMitad[p.id][mitad].n >= 30).sort((a, b) => porMitad[b.id][mitad].anual - porMitad[a.id][mitad].anual)[0];
const mA = mejorEn("A"), mB = mejorEn("B");
console.log(`\n  ELIJO en A → "${mA.id}" ($${porMitad[mA.id].A.anual.toLocaleString("es")}/año en A) → en B da $${porMitad[mA.id].B.anual.toLocaleString("es")}/año (t=${porMitad[mA.id].B.t})`);
console.log(`  ELIJO en B → "${mB.id}" ($${porMitad[mB.id].B.anual.toLocaleString("es")}/año en B) → en A da $${porMitad[mB.id].A.anual.toLocaleString("es")}/año (t=${porMitad[mB.id].A.t})`);
const sobreviveCruce = porMitad[mA.id].B.anual > 0 && porMitad[mB.id].A.anual > 0;
console.log(`  ¿sobrevive el cruce en las DOS direcciones? ${sobreviveCruce ? "SÍ" : "NO"}`);

// ═══ 4. TERCIOS — tres, no dos ═════════════════════════════════════════════════════════════
console.log(`\n── 4. TERCIOS (tres, no dos mitades) ──`);
const n3 = Math.floor(DIAS.length / 3);
const T = [DIAS.slice(0, n3), DIAS.slice(n3, 2 * n3), DIAS.slice(2 * n3)];
const porTercio = {};
console.log(`  ${"estrategia".padEnd(22)} ${"T1 $/año".padStart(10)} ${"T2 $/año".padStart(10)} ${"T3 $/año".padStart(10)}   3 de 3`);
for (const p of PRUEBAS) {
  const r = T.map((t) => { const s = new Set(t.map((d) => d.fecha)); return resumir(todo[p.id].ops.filter((o) => s.has(o.fecha)), t.length); });
  porTercio[p.id] = r.map((x) => x.anual ?? 0);
  const tres = r.every((x) => x.n && x.anual > 0);
  console.log(`  ${p.id.padEnd(22)} ${(r[0].anual ?? 0).toLocaleString("es").padStart(10)} ${(r[1].anual ?? 0).toLocaleString("es").padStart(10)} ${(r[2].anual ?? 0).toLocaleString("es").padStart(10)}   ${tres ? "✅" : "—"}`);
}

// ═══ 5. AÑO A AÑO del mejor candidato ══════════════════════════════════════════════════════
const CAND = PRUEBAS.filter((p) => todo[p.id].res.n >= 100).sort((a, b) => todo[b.id].res.anual - todo[a.id].res.anual)[0];
console.log(`\n── 5. AÑO A AÑO · "${CAND.id}" (el que más cerca quedó) ──`);
const anos = [...new Set(DIAS.map((d) => d.ano))].sort();
const porAno = {};
for (const y of anos) {
  const dy = DIAS.filter((d) => d.ano === y);
  const r = resumir(todo[CAND.id].ops.filter((o) => o.ano === y), dy.length);
  porAno[y] = r;
  if (r.n) console.log(`  ${y}  n=${String(r.n).padStart(4)} · $/op ${r.mediaOp.toFixed(0).padStart(7)} · acierto ${String(r.acierto).padStart(5)}% · t ${r.t.toFixed(2).padStart(6)} · $/año ${r.anual.toLocaleString("es").padStart(10)}`);
}

// ═══ 6. EL LISTÓN ══════════════════════════════════════════════════════════════════════════
console.log(`\n── 6. VEREDICTO CONTRA EL LISTÓN (|t| ≥ ${LISTON} con ${PRUEBAS.length} pruebas) ──`);
for (const p of PRUEBAS) {
  const r = todo[p.id].res;
  if (!r.n) continue;
  const pasa = Math.abs(r.t) >= LISTON && r.anual > 0 && (azar[p.id]?.percentil ?? 0) >= 95;
  console.log(`  ${p.id.padEnd(22)} t=${r.t.toFixed(2).padStart(6)} · azar pctil ${String(azar[p.id]?.percentil ?? "—").padStart(5)} · $/año ${r.anual.toLocaleString("es").padStart(9)} → ${pasa ? "PASA" : "no pasa"}`);
}

writeFileSync(SALIDA, JSON.stringify({
  generado: new Date().toISOString(), cuenta: CUENTA, nDias: DIAS.length,
  desde: DIAS[0].fecha, hasta: DIAS[DIAS.length - 1].fecha,
  pruebas: PRUEBAS.length, liston: LISTON, corte: CORTE,
  todo: Object.fromEntries(PRUEBAS.map((p) => [p.id, todo[p.id].res])),
  azar, porMitad, porTercio, porAno, candidato: CAND.id, sobreviveCruce,
  mejorEnA: mA.id, mejorEnB: mB.id,
  opsCandidato: todo[CAND.id].ops,
}, null, 1), "utf8");
console.log(`\n  escrito ${SALIDA}`);
