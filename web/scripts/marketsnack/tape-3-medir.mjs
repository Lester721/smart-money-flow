// PANEL FLOW-TAPE · PASO 3 — ¿SEPARA ALGO?
//
// Método (el mismo de los ingredientes):
//   · TRANSVERSAL DENTRO DE CADA DÍA. Se ordenan los ~30-60 símbolos de ese día por la métrica,
//     tercio alto menos tercio bajo del retorno FUTURO. Eso mata el factor mercado: un día que
//     sube entero no puntúa. La t se calcula sobre la SERIE DIARIA (n = días), no sobre las filas
//     agrupadas, que es lo que infla las t cuando las filas del mismo día están correlacionadas.
//   · pasarBarrera() sobre las filas con el retorno DEMEDIADO dentro del día (= el mismo vehículo
//     largo/corto, pero en formato fila) para que corran las cribas de concentración y tercios.
//   · Signo igual en los TRES tercios del calendario o no cuenta.
//
// PRUEBAS DECLARADAS: 8 métricas × 4 cortes × 2 horizontes = 64. El listón sale de listonT(64).
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/marketsnack/tape-3-medir.mjs

import fs from "node:fs";
import path from "node:path";
import { listonT, pasarBarrera, informe, potencia } from "../../lib/barreraHallazgos";

const RAIZ = "C:/Users/leste/dev/agente-tito-metralleta/web";
const PANEL = path.join(RAIZ, "scripts/cache-theta/marketsnack/tape-panel.json");
const SALIDA = path.join(RAIZ, "scripts/marketsnack/tape-3-salida.json");

const METRICAS = ["ritmoRel", "acel", "dirAcel", "netoTardio", "racha", "centroide", "concord", "neto"];
const CORTES = ["11:00ET", "13:00ET", "15:00ET", "dia"];
const HORIZ = ["r1", "r5"];
const PRUEBAS = METRICAS.length * CORTES.length * HORIZ.length;   // 64
const LISTON = listonT(PRUEBAS);
const MIN_SIM = 12;      // símbolos mínimos en el día para que el tercio tenga sentido
const CUENTA = 56389;

const media = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const de = (a) => { if (a.length < 2) return 0; const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const tUna = (a) => (a.length > 2 && de(a) > 0 ? media(a) / (de(a) / Math.sqrt(a.length)) : 0);

const panel = JSON.parse(fs.readFileSync(PANEL, "utf8"));
console.log(`=== FLOW TAPE · PASO 3 · MEDICIÓN ===`);
console.log(`   ${panel.length} filas · ${PRUEBAS} pruebas declaradas · listón |t| >= ${LISTON}\n`);

/** Serie diaria largo/corto de una métrica en un corte para un horizonte. */
function largoCorto(corte, metrica, horiz) {
  const porDia = new Map();
  for (const f of panel) {
    if (f.corte !== corte) continue;
    if (f[metrica] == null || f[horiz] == null) continue;
    let g = porDia.get(f.dia); if (!g) { g = []; porDia.set(f.dia, g); }
    g.push(f);
  }
  const serie = [];
  for (const [dia, g] of [...porDia].sort()) {
    if (g.length < MIN_SIM) continue;
    const ord = [...g].sort((a, b) => b[metrica] - a[metrica]);
    const k = Math.floor(ord.length / 3); if (k < 4) continue;
    const alto = media(ord.slice(0, k).map((f) => f[horiz]));
    const bajo = media(ord.slice(-k).map((f) => f[horiz]));
    serie.push({ dia, ls: alto - bajo, n: g.length });
  }
  const v = serie.map((s) => s.ls);
  const k3 = Math.floor(serie.length / 3);
  const ter = [0, 1, 2].map((i) => media((i < 2 ? serie.slice(i * k3, (i + 1) * k3) : serie.slice(2 * k3)).map((s) => s.ls)));
  return {
    nDias: serie.length, nFilas: [...porDia.values()].reduce((a, g) => a + (g.length >= MIN_SIM ? g.length : 0), 0),
    sep: media(v), de: de(v), t: tUna(v), ter,
    mismoSigno: ter.every((x) => x > 0) || ter.every((x) => x < 0),
    serie,
  };
}

// ── LA REJILLA COMPLETA ────────────────────────────────────────────────────────────────────
const rejilla = [];
for (const corte of CORTES) for (const m of METRICAS) for (const h of HORIZ) {
  const r = largoCorto(corte, m, h);
  rejilla.push({ corte, metrica: m, horiz: h, ...r, serie: undefined });
}

const fmt = (r) => `${(r.sep >= 0 ? "+" : "") + r.sep.toFixed(4)} pts · t=${r.t.toFixed(2).padStart(6)} · ` +
  `tercios ${r.ter.map((x) => (x >= 0 ? "+" : "") + x.toFixed(3)).join(" ")} ${r.mismoSigno ? "OK" : "--"}` +
  `${Math.abs(r.t) >= LISTON ? "  <<< PASA EL LISTÓN" : ""}`;

for (const corte of CORTES) {
  console.log(`\n== CORTE ${corte} ${corte === "dia" ? "(cinta completa, entrada en el cierre del día SIGUIENTE)" : "(entrada en el cierre del MISMO día)"} ==`);
  for (const h of HORIZ) {
    const sub = rejilla.filter((r) => r.corte === corte && r.horiz === h);
    console.log(`  -- horizonte ${h} (${h === "r1" ? "1 día" : "5 días"}) · ${sub[0].nDias} días --`);
    for (const r of sub.sort((a, b) => Math.abs(b.t) - Math.abs(a.t))) {
      console.log(`   ${r.metrica.padEnd(11)} ${fmt(r)}`);
    }
  }
}

// ── los que superan el listón ──────────────────────────────────────────────────────────────
const pasan = rejilla.filter((r) => Math.abs(r.t) >= LISTON && r.mismoSigno);
const casi = rejilla.filter((r) => Math.abs(r.t) >= LISTON && !r.mismoSigno);
console.log(`\n${"=".repeat(90)}`);
console.log(`   de ${rejilla.length} pruebas: ${rejilla.filter((r) => Math.abs(r.t) >= LISTON).length} superan |t|>=${LISTON}` +
  ` · de ésas ${pasan.length} mantienen el signo en los tres tercios`);
if (casi.length) for (const r of casi) console.log(`   [t alta pero tercios rotos] ${r.corte} ${r.metrica} ${r.horiz}: ${fmt(r)}`);

// ── pasarBarrera sobre los mejores candidatos ──────────────────────────────────────────────
function filasBarrera(corte, metrica, horiz) {
  const porDia = new Map();
  for (const f of panel) {
    if (f.corte !== corte || f[metrica] == null || f[horiz] == null) continue;
    let g = porDia.get(f.dia); if (!g) { g = []; porDia.set(f.dia, g); }
    g.push(f);
  }
  const filas = [];
  for (const [dia, g] of porDia) {
    if (g.length < MIN_SIM) continue;
    const mr = media(g.map((f) => f[horiz]));           // demediar DENTRO del día = vehículo neutral
    const ord = [...g].sort((a, b) => a[metrica] - b[metrica]);
    ord.forEach((f, i) => filas.push({ pnl: (f[horiz] - mr) / 100, ticker: f.sim, fecha: dia, rango: i / (ord.length - 1) }));
  }
  return filas;
}

const candidatos = [...rejilla].sort((a, b) => Math.abs(b.t) - Math.abs(a.t)).slice(0, 5);
console.log(`\n${"=".repeat(90)}\n   LAS CRIBAS sobre los 5 de |t| más alta\n`);
const veredictos = [];
for (const c of candidatos) {
  const filas = filasBarrera(c.corte, c.metrica, c.horiz);
  const v = pasarBarrera(filas, (f) => f.rango, { pruebas: PRUEBAS, nMinimo: 200, maxPorTicker: 0.2 });
  console.log(informe(v, `${c.metrica} @ ${c.corte} -> ${c.horiz}`));
  const pot = potencia(filas, 0.001);
  console.log(`   potencia: ${pot.mensaje}\n`);
  veredictos.push({ ...c, pasa: v.pasa, motivos: v.motivos, detalle: v.detalle, potencia: pot });
}

// ── traducción a dinero del mejor, pase o no ───────────────────────────────────────────────
const mejor = candidatos[0];
console.log(`${"=".repeat(90)}`);
console.log(`   EN DINERO — ${mejor.metrica} @ ${mejor.corte} -> ${mejor.horiz}, sobre una cuenta de $${CUENTA.toLocaleString("es-ES")}`);
const opsAno = mejor.horiz === "r1" ? 252 : 252 / 5;
const bruto = (mejor.sep / 100) * opsAno * CUENTA;
console.log(`   separación ${mejor.sep.toFixed(4)} pts por rotación × ${opsAno} rotaciones/año × $${CUENTA.toLocaleString("es-ES")} = $${bruto.toFixed(0)}/año BRUTO`);
for (const pb of [2, 5, 10]) {
  const peaje = (pb / 10000) * opsAno * CUENTA * 2 * 2;   // 2 patas (largo+corto) × ida y vuelta
  console.log(`   con horquilla de acciones de ${pb} pb ida/vuelta por pata: peaje $${peaje.toFixed(0)}/año -> NETO $${(bruto - peaje).toFixed(0)}/año`);
}
const pbEquilibrio = ((mejor.sep / 100) / 4) * 10000;
console.log(`   la horquilla que se lo come entero: ${pbEquilibrio.toFixed(2)} pb por pata y viaje.`);
console.log(`   AVISO: MarketSnack NO trae la horquilla de las ACCIONES. Los ${[2, 5, 10].join("/")} pb son SUPUESTOS declarados, no medidos.`);

const nNec = Math.ceil(((LISTON * mejor.de) / Math.abs(mejor.sep)) ** 2);
console.log(`\n   QUÉ LE FALTARÍA: con esta separación (${mejor.sep.toFixed(4)}) y esta desviación (${mejor.de.toFixed(3)}),`);
console.log(`   harían falta ${nNec} días de mercado (${(nNec / 252).toFixed(1)} años). Hay ${mejor.nDias}. Faltan ${nNec - mejor.nDias}.`);

fs.writeFileSync(SALIDA, JSON.stringify({ pruebas: PRUEBAS, liston: LISTON, minSim: MIN_SIM, rejilla, veredictos, dinero: { bruto, opsAno, pbEquilibrio, nNec } }, null, 1));
console.log(`\n   escrito ${SALIDA}`);
