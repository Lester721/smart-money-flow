// ═══════════════════════════════════════════════════════════════════════════════════════════
// TARJETA (5) — LAS DOS TARJETAS CANDIDATAS, medidas con el mismo rasero
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/tarjeta-5-final.mjs
//
// TARJETA ANCHA:   larga ATM, corta a 0,5% fuera (~25 pts). Débito ~$920. Es la que más gana.
// TARJETA ESTRECHA: larga ATM, corta 10 pts fuera. Débito ~$470. Es la que CABE en $7.977.
//
// A las dos se les aplica lo mismo: precios reales, salida a vencimiento, cruce por mitades,
// tres tercios, año a año, el CONTROL de lado al azar con moneda sesgada, y la prueba de ruina
// con la caja real. Sin esto, "cabe" no significa nada.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
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

function columnas(cab) { const c = cab.split(",").map((s) => s.trim()); const idx = {};
  for (const n of ["strike", "timestamp", "bid", "ask"]) { const i = c.indexOf(n); if (i < 0) throw new Error(`FALLO CERRADO: falta ${n}`); idx[n] = i; } return idx; }
function leer0935(ruta) {
  const txt = readFileSync(ruta, "utf8"); const nl = txt.indexOf("\n"); const idx = columnas(txt.slice(0, nl));
  const cot = new Map(); let pos = nl + 1;
  while (pos < txt.length) { let fin = txt.indexOf("\n", pos); if (fin < 0) fin = txt.length;
    const l = txt.slice(pos, fin); pos = fin + 1; if (l.length < 20) continue;
    const p = l.split(","); if (p[idx.timestamp].slice(11, 16) !== "09:35") continue;
    cot.set(+p[idx.strike], [+p[idx.bid], +p[idx.ask]]); }
  return cot;
}

const J = JSON.parse(readFileSync("scripts/gex-niveles.json", "utf8"));
console.log("\n" + "═".repeat(100));
console.log("TARJETA (5) — LAS DOS CANDIDATAS CON EL MISMO RASERO");
console.log("═".repeat(100));
console.log(`listón t=${LISTON} · cuenta $${CUENTA.toLocaleString("es-ES")} · efectivo $${EFECTIVO.toLocaleString("es-ES")}`);

// ── se leen las DOS cadenas de cada día: hace falta el lado contrario para el control ──
const DIAS = [];
const fuera = {}; const cae = (k) => { fuera[k] = (fuera[k] || 0) + 1; };
let hecho = 0; const t0 = Date.now();
for (const f of J.filas) {
  const net = f.niveles?.gam?.netPunto, K = f.niveles?.gamD?.imanNeto;
  if (!Number.isFinite(net) || net >= 0) { cae("gamma neta no negativa"); continue; }
  if (!(K > 0) || !(f.apertura > 0) || !(f.cierre > 0)) { cae("sin imán/apertura/cierre"); continue; }
  const lado = Math.sign(K - f.apertura); if (lado === 0) { cae("imán en la apertura"); continue; }
  const kC = f.peaje?.callATM?.K, kP = f.peaje?.putATM?.K, k5C = f.peaje?.call05?.K, k5P = f.peaje?.put05?.K;
  if (!(kC > 0) || !(kP > 0) || !(k5C > 0) || !(k5P > 0)) { cae("sin strikes ATM"); continue; }
  const rC = `${DIR}/iv_${f.fecha}_C.csv`, rP = `${DIR}/iv_${f.fecha}_P.csv`;
  if (!existsSync(rC) || !existsSync(rP)) { cae("cadena ausente"); continue; }
  const cC = leer0935(rC), cP = leer0935(rP);
  const qC = cC.get(kC), qP = cP.get(kP);
  if (!qC || !qP || Math.abs(qC[1] - f.peaje.callATM.ask) > 0.011 || Math.abs(qP[1] - f.peaje.putATM.ask) > 0.011) { cae("la cadena no cuadra a las 09:35"); continue; }
  DIAS.push({ fecha: f.fecha, ano: +f.fecha.slice(0, 4), mitad: +f.fecha.slice(0, 4) <= 2023 ? "A" : "B",
    lado, ci: f.cierre, kC, kP, k5C, k5P, cC, cP });
  if (++hecho % 200 === 0) console.log(`   ${hecho} días · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
for (const [k, v] of Object.entries(fuera)) console.log(`   descartados por ${k}: ${v}`);
exigir(DIAS.length > 400, `muestra pequeña: ${DIAS.length}`);
console.log(`días con señal: ${DIAS.length}`);

// ── construye la vertical de un lado dado, con la corta a `anchoFn` puntos ──
function vert(d, lado, anchoFn) {
  const cot = lado > 0 ? d.cC : d.cP;
  const KL = lado > 0 ? d.kC : d.kP;
  const ancho = anchoFn(d, lado);
  if (!(ancho > 0)) return null;
  const KC = KL + lado * ancho;
  const qL = cot.get(KL), qC = cot.get(KC);
  if (!qL || !qC || !(qL[1] > 0)) return null;
  const debito = qL[1] - qC[0];
  if (!(debito > 0) || debito >= ancho) return null;
  const intr = lado > 0 ? Math.max(0, d.ci - KL) : Math.max(0, KL - d.ci);
  return { riesgo: debito * 100, pnl: (Math.min(intr, ancho) - debito) * 100 - 2 * TASA, ancho, debito,
    techo: (ancho - debito) * 100 };
}
const ANCHOS = {
  "ANCHA  (corta a 0,5% fuera)": (d, lado) => Math.abs((lado > 0 ? d.k5C : d.k5P) - (lado > 0 ? d.kC : d.kP)),
  "ESTRECHA (corta a 10 pts)  ": () => 10,
};

const SALIDA = {};
for (const [ET, anchoFn] of Object.entries(ANCHOS)) {
  console.log(`\n${"─".repeat(100)}\n### TARJETA ${ET.trim()}`);
  const ops = [];
  for (const d of DIAS) {
    const real = vert(d, d.lado, anchoFn), esp = vert(d, -d.lado, anchoFn);
    if (!real) continue;
    ops.push({ fecha: d.fecha, ano: d.ano, mitad: d.mitad, lado: d.lado, ...real, espejo: esp });
  }
  ops.sort((a, b) => a.fecha.localeCompare(b.fecha));
  exigir(ops.length > 400, `muestra pequeña en ${ET}`);
  const p = ops.map((o) => o.pnl), r = ops.map((o) => o.riesgo);
  const diasAno = 252 * (ops.length / 1122), anos = ops.length / diasAno;
  console.log(`   n=${ops.length} · débito p25 $${pct(r, 25).toFixed(0)} · p50 $${mediana(r).toFixed(0)} · p75 $${pct(r, 75).toFixed(0)} · ancho p50 ${mediana(ops.map((o) => o.ancho))} pts`);
  console.log(`   $${media(p).toFixed(2)}/op · t=${tOf(p).toFixed(2)} · ${(100 * media(p) / media(r)).toFixed(2)}% sobre riesgo · gana ${(100 * p.filter((x) => x > 0).length / p.length).toFixed(1)}%`);
  console.log(`   1 contrato: $${(media(p) * diasAno).toFixed(0)}/año = ${(100 * media(p) * diasAno / CUENTA).toFixed(1)}% de la cuenta`);

  // cruce por mitades
  const A = ops.filter((o) => o.mitad === "A").map((o) => o.pnl), B = ops.filter((o) => o.mitad === "B").map((o) => o.pnl);
  console.log(`   MITADES  2022-23: n=${A.length} $${media(A).toFixed(2)} (t=${tOf(A).toFixed(2)})  ·  2024-26: n=${B.length} $${media(B).toFixed(2)} (t=${tOf(B).toFixed(2)})  · mismo signo: ${Math.sign(media(A)) === Math.sign(media(B)) ? "SÍ" : "NO"}`);
  // tercios
  const T3 = [];
  for (let i = 0; i < 3; i++) { const g = ops.slice(Math.floor(i * ops.length / 3), Math.floor((i + 1) * ops.length / 3)).map((o) => o.pnl); T3.push(media(g)); }
  console.log(`   TERCIOS  $${T3.map((x) => x.toFixed(2)).join("  ·  $")}   → los tres del mismo signo: ${T3.every((x) => x > 0) ? "SÍ" : "NO"}`);
  // años
  const anosL = [...new Set(ops.map((o) => o.ano))].sort();
  const porAno = anosL.map((a) => ({ a, tot: ops.filter((o) => o.ano === a).reduce((s, o) => s + o.pnl, 0), n: ops.filter((o) => o.ano === a).length }));
  console.log(`   AÑOS     ${porAno.map((x) => `${x.a}: $${x.tot.toFixed(0)}`).join(" · ")}  → positivos ${porAno.filter((x) => x.tot > 0).length}/${porAno.length}`);
  // concentración
  const orden = [...p].sort((a, b) => b - a), tot = p.reduce((a, x) => a + x, 0);
  console.log(`   los 5 mejores días son el ${(100 * orden.slice(0, 5).reduce((a, x) => a + x, 0) / tot).toFixed(1)}% del total · sin los 5 mejores: $${media(orden.slice(5)).toFixed(2)}/op`);

  // CONTROL — lado al azar, moneda sesgada a la misma tasa alcista
  const conEsp = ops.filter((o) => o.espejo);
  const tasaAlz = ops.filter((o) => o.lado > 0).length / ops.length;
  const realC = media(conEsp.map((o) => o.pnl));
  const ctrl = {};
  for (const [et, sesgo, sem] of [["50/50", 0.5, 4242], [`sesgada ${(100 * tasaAlz).toFixed(0)}% alcista`, tasaAlz, 777]]) {
    const rnd = rng(sem), nube = [];
    for (let s = 0; s < 500; s++) { const v = [];
      for (const o of conEsp) { const alza = rnd() < sesgo; v.push(((alza && o.lado > 0) || (!alza && o.lado < 0)) ? o.pnl : o.espejo.pnl); }
      nube.push(media(v)); }
    const q = 100 * nube.filter((x) => x < realC).length / nube.length;
    ctrl[et] = { azar: +media(nube).toFixed(2), pctil: +q.toFixed(1) };
    console.log(`   CONTROL  real $${realC.toFixed(2)} vs lado al azar ${et}: $${media(nube).toFixed(2)} → percentil ${q.toFixed(1)} ${q >= 97.5 ? "← LE GANA" : "← NO le gana"}`);
  }

  // RUINA con la caja real + libro histórico
  const rnd2 = rng(31337); let arr = 0;
  for (let s = 0; s < 2000; s++) {
    const b = [...ops];
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd2() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
    let caja = EFECTIVO, parado = false;
    for (const o of b) { if (o.riesgo > caja) { parado = true; break; } caja += o.pnl; }
    if (parado) arr++;
  }
  let caja = EFECTIVO, minC = EFECTIVO, peorDia = 0, peorFecha = "", racha = 0, peorRacha = 0, pico = EFECTIVO, caida = 0;
  for (const o of ops) { minC = Math.min(minC, caja - o.riesgo); caja += o.pnl;
    if (o.pnl < peorDia) { peorDia = o.pnl; peorFecha = o.fecha; }
    if (o.pnl < 0) { racha++; peorRacha = Math.max(peorRacha, racha); } else racha = 0;
    pico = Math.max(pico, caja); caida = Math.min(caida, caja - pico); }
  console.log(`   CAJA     con $${EFECTIVO.toLocaleString("es-ES")} y 1 contrato: se queda tirada en el ${(100 * arr / 2000).toFixed(1)}% de los órdenes barajados`);
  console.log(`            en el orden histórico: caja final $${caja.toFixed(0)} · mínima $${minC.toFixed(0)} · peor día $${peorDia.toFixed(0)} (${peorFecha}) · racha ${peorRacha} · peor caída $${caida.toFixed(0)}`);
  SALIDA[ET.trim()] = { n: ops.length, debitoP50: +mediana(r).toFixed(0), porOp: +media(p).toFixed(2), t: +tOf(p).toFixed(2),
    pctRiesgo: +(100 * media(p) / media(r)).toFixed(2), alAno: +(media(p) * diasAno).toFixed(0), pctCuenta: +(100 * media(p) * diasAno / CUENTA).toFixed(1),
    gana: +(100 * p.filter((x) => x > 0).length / p.length).toFixed(1),
    mitadA: +media(A).toFixed(2), tA: +tOf(A).toFixed(2), mitadB: +media(B).toFixed(2), tB: +tOf(B).toFixed(2),
    tercios: T3.map((x) => +x.toFixed(2)), terciosMismoSigno: T3.every((x) => x > 0),
    anosPositivos: `${porAno.filter((x) => x.tot > 0).length}/${porAno.length}`, control: ctrl,
    ruinaPct: +(100 * arr / 2000).toFixed(1), cajaFinal: +caja.toFixed(0), minCaja: +minC.toFixed(0),
    peorDia: +peorDia.toFixed(0), peorFecha, peorRacha, peorCaida: +caida.toFixed(0), diasAno: +diasAno.toFixed(0) };
}
writeFileSync("scripts/tarjeta-final.json", JSON.stringify({ generado: new Date().toISOString(), liston: LISTON, cuenta: CUENTA, efectivo: EFECTIVO, tarjetas: SALIDA }, null, 1));
console.log(`\n   → scripts/tarjeta-final.json\n`);
