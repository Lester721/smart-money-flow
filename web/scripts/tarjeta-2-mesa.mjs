// ═══════════════════════════════════════════════════════════════════════════════════════════
// TARJETA DE MESA — la regla escrita, medida ENTERA sobre los 1.122 días
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/tarjeta-2-mesa.mjs
//
// ═══ DE DÓNDE SALE LA REGLA ════════════════════════════════════════════════════════════════
// De todo el bloque "GEX como NIVELES" lo único que replicó en las dos mitades fue el LADO del
// imán de gamma (gamD.imanNeto) en los días de gamma neta NEGATIVA. Los muros no aguantan el
// precio, el imán no atrae (t máx 1,23 contra niveles al azar) y el punto de giro no sobrevive
// al cruce. Queda el lado, y sólo se puede cobrar con riesgo definido.
//
// ═══ QUÉ SE MIDE AQUÍ ══════════════════════════════════════════════════════════════════════
//   · entrada 09:35 con precios REALES (se compra al ASK, se vende al BID)
//   · la SALIDA se ELIGE en una mitad y se PRUEBA en la otra, y al revés
//   · el CONTROL que decide: la misma vertical con el lado al azar, con dos monedas —
//     la 50/50 y una SESGADA a la misma tasa alcista del imán (esa aísla la deriva del mercado)
//   · el TAMAÑO: libro de caja real arrancando en $7.977, sin vender HOOD
//
// ═══ LO QUE NO SE MIDE, Y SE DICE ══════════════════════════════════════════════════════════
//   · El cierre es el último tick del índice en la cadena de 5 min, NO el print oficial de
//     liquidación de SPXW. Puede diferir en décimas. No se rellena con un modelo.
//   · Comisión de Robinhood $0; tasas regulatorias ~$0,03 por contrato, restadas explícitamente.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from "node:fs";

const CUENTA = 56389, EFECTIVO = 7977, TASA = 0.03;
const PRUEBAS_DECLARADAS = 24;
function listonT(p0) { if (p0 <= 1) return 2; const p = 0.05 / p0 / 2, t = Math.sqrt(-2 * Math.log(p)); return Math.round((t - (2.30753 + 0.27061 * t) / (1 + 0.99229 * t + 0.04481 * t * t)) * 100) / 100; }
const LISTON = listonT(PRUEBAS_DECLARADAS);
const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const tOf = (v) => (sd(v) > 0 ? media(v) / (sd(v) / Math.sqrt(v.length)) : NaN);
const pct = (v, p) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))]; };
const mediana = (v) => pct(v, 50);
function exigir(c, m) { if (!c) throw new Error(`FALLO CERRADO: ${m}`); }
function rng(s0) { let a = s0 >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function rachas(s) { let peor = 0, act = 0, caida = 0, acum = 0, pico = 0; for (const x of s) { if (x < 0) { act++; peor = Math.max(peor, act); } else act = 0; acum += x; pico = Math.max(pico, acum); caida = Math.min(caida, acum - pico); } return { peorRacha: peor, peorCaida: caida }; }

const S = JSON.parse(readFileSync("scripts/tarjeta-salidas.json", "utf8"));
const HORAS = S.horas;
const CANDIDATAS = [...HORAS.filter((h) => h !== "09:35"), "vencimiento"];
const DIAS_TOTALES = S.n;

console.log("\n" + "═".repeat(100));
console.log("TARJETA DE MESA — el GEX como NIVELES, la regla medida entera");
console.log("═".repeat(100));
console.log(`listón para ${PRUEBAS_DECLARADAS} pruebas declaradas: t = ${LISTON}   ·   cuenta $${CUENTA.toLocaleString("es-ES")} · efectivo $${EFECTIVO.toLocaleString("es-ES")}`);

// ═══ 0 · RADIOGRAFÍA ════════════════════════════════════════════════════════════════════════
console.log(`\n## 0 · RADIOGRAFÍA (no se mide un campo sin mirarlo)`);
console.log(`   días de cadena con imán y las cuatro patas: ${DIAS_TOTALES}`);
const NEG = S.dias.filter((d) => d.net < 0);
console.log(`   de esos, con gamma neta NEGATIVA (los que se operan): ${NEG.length} (${(100 * NEG.length / DIAS_TOTALES).toFixed(1)}%)`);
const dist = NEG.map((d) => Math.abs(d.iman - d.ap));
console.log(`   distancia imán↔apertura: p25 ${pct(dist, 25).toFixed(1)} · p50 ${mediana(dist).toFixed(1)} · p75 ${pct(dist, 75).toFixed(1)} pts`);
const tasaAlcista = NEG.filter((d) => d.lado > 0).length / NEG.length;
console.log(`   el imán manda ARRIBA el ${(100 * tasaAlcista).toFixed(1)}% de esos días  ← la deriva del mercado entra por aquí; el control tiene que igualarla`);
for (const h of ["09:35", "12:00", "15:30", "16:00"]) {
  const hq = NEG.map((d) => d.call.larga[h]).map(([b, a]) => a - b);
  console.log(`   horquilla de la call ATM a las ${h}: p50 ${mediana(hq).toFixed(2)} pts · p90 ${pct(hq, 90).toFixed(2)} pts`);
}

// ═══ 1 · CONSTRUIR LAS VERTICALES — los dos lados de cada día ═══════════════════════════════
// débito  = ASK de la larga − BID de la corta          (peaje entero de las dos patas)
// salida a hora h = BID de la larga − ASK de la corta  (peaje entero otra vez, las dos patas)
// salida a vencimiento = intrínseco topado al ancho    (exacto: SPXW liquida en efectivo, sin peaje)
function vertical(d, lado) {
  const v = lado > 0 ? d.call : d.put;
  const e = v.larga["09:35"], c = v.corta["09:35"];
  if (!e || !c) return null;
  const debito = e[1] - c[0];
  if (!(debito > 0) || debito >= v.ancho) return null;
  const intr = lado > 0 ? Math.max(0, d.ci - v.KL) : Math.max(0, v.KL - d.ci);
  const salidas = { vencimiento: Math.min(intr, v.ancho) };
  for (const h of HORAS) {
    if (h === "09:35") continue;
    const L = v.larga[h], C = v.corta[h];
    salidas[h] = L && C ? L[0] - C[1] : null;
  }
  const pnl = {};
  for (const s of CANDIDATAS) {
    const val = salidas[s];
    if (val === null || val === undefined) { pnl[s] = null; continue; }
    const patas = s === "vencimiento" ? 2 : 4;      // a vencimiento no se cierra nada
    pnl[s] = (val - debito) * 100 - patas * TASA;
  }
  return { debito, ancho: v.ancho, riesgo: debito * 100, techo: (v.ancho - debito) * 100, pnl };
}

const OPS = [];
const fuera = {};
const cae = (k) => { fuera[k] = (fuera[k] || 0) + 1; };
for (const d of NEG) {
  const real = vertical(d, d.lado);
  const espejo = vertical(d, -d.lado);
  if (!real) { cae("la vertical del imán no es operable (débito ≥ ancho o ≤ 0)"); continue; }
  OPS.push({ fecha: d.fecha, ano: +d.fecha.slice(0, 4), mitad: +d.fecha.slice(0, 4) <= 2023 ? "A" : "B",
    lado: d.lado, dist: Math.abs(d.iman - d.ap), net: d.net, real, espejo });
}
for (const [k, v] of Object.entries(fuera)) console.log(`   descartados por ${k}: ${v}`);
exigir(OPS.length > 400, `muestra pequeña: ${OPS.length}`);
OPS.sort((a, b) => a.fecha.localeCompare(b.fecha));
const DIAS_ANO = 252 * (OPS.length / DIAS_TOTALES);
console.log(`   operaciones válidas: ${OPS.length} → ${DIAS_ANO.toFixed(0)} días de operación al año`);
console.log(`   riesgo (débito) por contrato: p25 $${pct(OPS.map((o) => o.real.riesgo), 25).toFixed(0)} · p50 $${mediana(OPS.map((o) => o.real.riesgo)).toFixed(0)} · p75 $${pct(OPS.map((o) => o.real.riesgo), 75).toFixed(0)}`);

// ═══ 2 · LA SALIDA — se ELIGE en una mitad y se PRUEBA en la otra ═══════════════════════════
console.log(`\n## 2 · ¿DÓNDE SALE? — se elige la hora en una mitad y se prueba en la OTRA`);
const R = {};
for (const s of CANDIDATAS) {
  const T = OPS.map((o) => o.real.pnl[s]).filter((x) => x !== null);
  const A = OPS.filter((o) => o.mitad === "A").map((o) => o.real.pnl[s]).filter((x) => x !== null);
  const B = OPS.filter((o) => o.mitad === "B").map((o) => o.real.pnl[s]).filter((x) => x !== null);
  R[s] = { n: T.length, med: media(T), t: tOf(T), gana: 100 * T.filter((x) => x > 0).length / T.length,
    A: media(A), tA: tOf(A), nA: A.length, B: media(B), tB: tOf(B), nB: B.length };
}
console.log(`   ${"salida".padEnd(12)} ${"n".padStart(4)} ${"$/op".padStart(8)} ${"t".padStart(6)} ${"gana%".padStart(6)}  ${"A 22-23".padStart(8)} ${"tA".padStart(6)}  ${"B 24-26".padStart(8)} ${"tB".padStart(6)}`);
for (const s of CANDIDATAS) { const r = R[s];
  console.log(`   ${s.padEnd(12)} ${String(r.n).padStart(4)} ${r.med.toFixed(2).padStart(8)} ${r.t.toFixed(2).padStart(6)} ${r.gana.toFixed(1).padStart(6)}  ${r.A.toFixed(2).padStart(8)} ${r.tA.toFixed(2).padStart(6)}  ${r.B.toFixed(2).padStart(8)} ${r.tB.toFixed(2).padStart(6)}`); }
const mejorA = CANDIDATAS.reduce((m, s) => (R[s].A > R[m].A ? s : m), CANDIDATAS[0]);
const mejorB = CANDIDATAS.reduce((m, s) => (R[s].B > R[m].B ? s : m), CANDIDATAS[0]);
console.log(`\n   mejor salida elegida SÓLO con 2022-2023: ${mejorA} → en 2024-2026 da $${R[mejorA].B.toFixed(2)}/op (t=${R[mejorA].tB.toFixed(2)})`);
console.log(`   mejor salida elegida SÓLO con 2024-2026: ${mejorB} → en 2022-2023 da $${R[mejorB].A.toFixed(2)}/op (t=${R[mejorB].tA.toFixed(2)})`);
const cruceOK = R[mejorA].B > 0 && R[mejorB].A > 0;
console.log(`   ¿lo elegido en una mitad gana dinero en la otra, en las DOS direcciones? ${cruceOK ? "SÍ" : "NO"}`);
const SALIDA = mejorA === mejorB ? mejorA : "vencimiento";
console.log(`   → SALIDA DE LA TARJETA: ${SALIDA}${mejorA === mejorB ? "  (las dos mitades eligen la misma)" : "  (no coinciden → se queda vencimiento, que no se eligió mirando)"}`);

// ═══ 3 · EL CONTROL QUE DECIDE ══════════════════════════════════════════════════════════════
console.log(`\n## 3 · CONTROL — la MISMA vertical con el lado al azar (nivel al azar al mismo lado del precio)`);
const conEspejo = OPS.filter((o) => o.espejo && o.espejo.pnl[SALIDA] !== null);
console.log(`   días con la vertical ESPEJO operable (mismo día, lado contrario, precios reales): ${conEspejo.length}/${OPS.length}`);
const realV = OPS.map((o) => o.real.pnl[SALIDA]).filter((x) => x !== null);
const realMed = media(realV);
function nube(sesgo, semilla) {
  const rnd = rng(semilla), res = [];
  for (let s = 0; s < 500; s++) {
    const v = [];
    for (const o of conEspejo) {
      const alza = rnd() < sesgo;
      const usa = (alza && o.lado > 0) || (!alza && o.lado < 0) ? o.real : o.espejo;
      const p = usa.pnl[SALIDA];
      if (p !== null) v.push(p);
    }
    res.push(media(v));
  }
  return res;
}
const realComparable = media(conEspejo.map((o) => o.real.pnl[SALIDA]));
const CTRL = {};
for (const [et, sesgo, sem] of [["moneda 50/50", 0.5, 4242], [`moneda SESGADA (${(100 * tasaAlcista).toFixed(0)}% alcista, la misma tasa del imán)`, tasaAlcista, 777]]) {
  const N = nube(sesgo, sem);
  const p = 100 * N.filter((x) => x < realComparable).length / N.length;
  CTRL[et] = { azar: media(N), sd: sd(N), pctil: p };
  console.log(`   real $${realComparable.toFixed(2)}/op  vs  ${et}: $${media(N).toFixed(2)} (sd ${sd(N).toFixed(2)}) → percentil ${p.toFixed(1)}  ${p >= 97.5 ? "← LE GANA" : "← NO le gana"}`);
}
const siempreAlza = media(conEspejo.map((o) => (o.lado > 0 ? o.real : o.espejo).pnl[SALIDA]));
const siempreBaja = media(conEspejo.map((o) => (o.lado < 0 ? o.real : o.espejo).pnl[SALIDA]));
console.log(`   referencias tontas: SIEMPRE alcista $${siempreAlza.toFixed(2)}/op · SIEMPRE bajista $${siempreBaja.toFixed(2)}/op`);

writeFileSync("scripts/tarjeta-ops.json", JSON.stringify({
  generado: new Date().toISOString(), salida: SALIDA, liston: LISTON, diasAno: +DIAS_ANO.toFixed(1),
  ops: OPS.map((o) => ({ fecha: o.fecha, ano: o.ano, mitad: o.mitad, lado: o.lado, dist: o.dist, net: o.net,
    debito: o.real.debito, ancho: o.real.ancho, riesgo: o.real.riesgo, techo: o.real.techo, pnl: o.real.pnl[SALIDA],
    pnlEspejo: o.espejo ? o.espejo.pnl[SALIDA] : null, riesgoEspejo: o.espejo ? o.espejo.riesgo : null })),
  salidasTabla: R, control: CTRL, tasaAlcista, siempreAlza, siempreBaja,
}, null, 1));
console.log(`\n   → scripts/tarjeta-ops.json  (${OPS.length} operaciones, para el libro de caja)`);
