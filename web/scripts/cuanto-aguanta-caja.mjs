// ¿QUÉ AGUANTA SU CUENTA DE VERDAD? — la simulación de CAJA, día a día, en dólares.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/cuanto-aguanta-caja.mjs
//
// ═══ LA PREGUNTA ════════════════════════════════════════════════════════════════════════════
// Lester cree que la caída del FILTRO DE AMPLITUD sí la aguanta su cuenta y la del CÓNDOR DE HOY
// no. Eso no lo decide un porcentaje: lo decide la caja. Aquí se simula la cuenta real, día a día:
//
//   efectivo $7.977 · 500 HOOD ($48.135) · poder de compra $73.874 · interés de margen 5%
//   colateral = ancho del ala × 100 por contrato (una vertical al ancho completo, Robinhood)
//   LAS PÉRDIDAS SALEN DEL EFECTIVO. El colateral sale del poder de compra.
//
// ═══ SUPUESTOS DECLARADOS (no son datos, son modelo — y se dicen) ═══════════════════════════
//  1. HOOD se mantiene a $48.135 durante los 4,3 años. No se simula su precio: es una constante
//     declarada. Si HOOD cae, la línea de llamada sube y todo lo de abajo empeora.
//  2. Línea de llamada de margen: efectivo < −70% del valor de HOOD (mantenimiento del 30%).
//  3. Poder de compra disponible = $73.874 + (efectivo − $7.977). Un dólar perdido resta un dólar
//     de poder de compra. En Reg-T real resta MÁS (≈2×): esto es optimista, se dice.
//  4. NO se modela la liquidación forzosa tras una llamada de margen. Se marca la fecha y la
//     simulación sigue, para poder ver el resto del camino.
//  5. El interés corre sobre saldo negativo, días naturales entre sesiones, 5%/año.
//
// ═══ LA REGLA DE HIERRO ═════════════════════════════════════════════════════════════════════
// Nada se ajusta aquí: las tres geometrías y el filtro vienen dados. Aun así todo se mide TRES
// veces — período entero, mitad A (2022-2023) y mitad B (2024-2026), cada mitad arrancando con
// los mismos $7.977 — y se exige el mismo signo en las dos mitades para creerse la comparación.
//
// PRUEBAS DECLARADAS: 3 geometrías × 2 tamaños × 3 períodos = 18.

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

// ── LA CUENTA REAL ──────────────────────────────────────────────────────────────────────────
const EFECTIVO = 7977;
const CUENTA = 56389;
const HOOD = 48135;
const LINEA = -0.70 * HOOD;
const BP0 = 73874;
const INT = 0.05;
const PRUEBAS = 18;

const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const pct = (x) => (x < 0 ? "−" : "") + Math.abs(x * 100).toFixed(1) + "%";
const suma = (v) => v.reduce((a, b) => a + b, 0);
const anosEntre = (a, b) => (new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000 / 365.25;

const J = JSON.parse(readFileSync("scripts/cuanto-aguanta-dias.json", "utf8"));
const D = J.dias;

// ── RADIOGRAFÍA antes de medir nada ─────────────────────────────────────────────────────────
radiografia(
  D.map((d) => ({
    sp11: d.sp11, cierre: d.cierre, straddle: d.straddle,
    plA: d.A.pl, plB: d.B.pl, plC: d.C.pl,
    credA: d.A.cred, credC: d.C.cred, distC: d.C.distC,
  })),
  ["sp11", "cierre", "straddle", "plA", "plB", "plC", "credA", "credC", "distC"],
  "cóndor 0DTE SPXW · 3 geometrías",
);
// `opera` es binario a propósito (el filtro de amplitud): radiografía lo rechazaría por no
// ordenar tercios, así que se cuenta a mano — que es lo único que hay que comprobar de un flag.
console.log(`  opera (filtro MA20+MA50): ${D.filter((d) => d.opera === true).length} sí · ${D.filter((d) => d.opera === false).length} no · ${D.filter((d) => d.opera == null).length} nulos`);

// ── LAS TRES CONFIGURACIONES ────────────────────────────────────────────────────────────────
const CFG = [
  { id: "A", nom: "cóndor de HOY  ±25 pts · alas 50", ala: 50, pl: (d) => d.A.pl, abre: () => true },
  { id: "B", nom: "FILTRO AMPLITUD ±30 pts · alas 50", ala: 50, pl: (d) => d.B.pl, abre: (d) => d.opera === true },
  { id: "C", nom: "por STRADDLE 2,3× · alas 30", ala: 30, pl: (d) => d.C.pl, abre: () => true },
];

/** La caja, día a día. Devuelve todo lo que decide si la cuenta aguanta o no. */
function caja(cfg, n, dias) {
  let efectivo = EFECTIVO, interes = 0;
  let minC = EFECTIVO, fechaMin = dias[0].fecha;
  let pico = EFECTIVO, dd = 0, fechaDD = "";
  let enRojo = null, llamada = null, peorDia = 0, fechaPeor = "";
  let opera = 0, filtrados = 0, sinPoder = 0;
  let prev = dias[0].fecha;
  const porAno = {};

  for (const d of dias) {
    // 1 · interés sobre saldo negativo, días naturales
    const nd = Math.max(0, (new Date(d.fecha + "T00:00:00Z") - new Date(prev + "T00:00:00Z")) / 86400000);
    prev = d.fecha;
    if (efectivo < 0 && nd > 0) { const it = efectivo * INT * nd / 365; interes += it; efectivo += it; }

    // 2 · ¿se abre?
    let pl = 0;
    if (cfg.abre(d)) {
      const necesita = cfg.ala * 100 * n;
      const disponible = BP0 + (efectivo - EFECTIVO);
      if (necesita > disponible) sinPoder++;
      else { pl = cfg.pl(d) * n; opera++; }
    } else filtrados++;

    // 3 · las pérdidas salen del efectivo
    efectivo += pl;
    const a = d.ano; porAno[a] = porAno[a] || { pl: 0, dias: 0, pico: -Infinity, dd: 0, acc: 0 };
    porAno[a].pl += pl; if (pl !== 0) porAno[a].dias++;
    porAno[a].acc += pl;
    if (porAno[a].acc > porAno[a].pico) porAno[a].pico = porAno[a].acc;
    if (porAno[a].pico - porAno[a].acc > porAno[a].dd) porAno[a].dd = porAno[a].pico - porAno[a].acc;

    if (pl < peorDia) { peorDia = pl; fechaPeor = d.fecha; }
    if (efectivo > pico) pico = efectivo;
    if (pico - efectivo > dd) { dd = pico - efectivo; fechaDD = d.fecha; }
    if (efectivo < minC) { minC = efectivo; fechaMin = d.fecha; }
    if (efectivo < 0 && !enRojo) enRojo = d.fecha;
    if (efectivo < LINEA && !llamada) llamada = d.fecha;
  }

  const anos = anosEntre(dias[0].fecha, dias[dias.length - 1].fecha);
  return {
    anos, final: efectivo, neto: efectivo - EFECTIVO, anual: (efectivo - EFECTIVO) / anos,
    interes, minC, fechaMin, dd, fechaDD, ddPct: dd / CUENTA,
    peorDia, fechaPeor, enRojo, llamada, opera, filtrados, sinPoder,
    colateral: cfg.ala * 100 * n, porAno,
  };
}

// ── PERÍODOS ────────────────────────────────────────────────────────────────────────────────
const A = D.filter((d) => d.ano <= 2023);
const B = D.filter((d) => d.ano >= 2024);
const PER = [["TODO", D], ["A 2022-23", A], ["B 2024-26", B]];

console.log("\n" + "═".repeat(118));
console.log(`  ¿QUÉ AGUANTA SU CUENTA? · ${D.length} sesiones · ${D[0].fecha} → ${D[D.length - 1].fecha} · SPXW 0DTE, precios reales`);
console.log(`  efectivo $${EFECTIVO.toLocaleString("es-ES")} · HOOD $${HOOD.toLocaleString("es-ES")} · poder de compra $${BP0.toLocaleString("es-ES")} · llamada de margen si el efectivo baja de ${eur(LINEA)}`);
console.log("═".repeat(118));
console.log(`\n  A = ${A[0].fecha} → ${A[A.length - 1].fecha} (${A.length} días) · B = ${B[0].fecha} → ${B[B.length - 1].fecha} (${B.length} días)`);
console.log(`  Listón con ${PRUEBAS} pruebas declaradas: |t| ≥ ${listonT(PRUEBAS).toFixed(2)} (aquí no se contrasta ninguna hipótesis: se cuenta dinero).`);

// ═══ 1 · LA TABLA QUE DECIDE ════════════════════════════════════════════════════════════════
console.log("\n\n### 1 · LA CAJA, PERÍODO ENTERO — arranca con $7.977 el " + D[0].fecha + "\n");
console.log("| geometría | ctr | colateral | $/año NETO | interés | peor día | caída máx | caída % cuenta | caja mínima (fecha) | efectivo < $0 desde | LLAMADA | días op. |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
const R = {};
for (const cfg of CFG) for (const n of [1, 2]) {
  const r = caja(cfg, n, D); R[`${cfg.id}${n}|TODO`] = r;
  console.log(`| ${cfg.nom} | ${n} | ${eur(r.colateral)} | **${eur(r.anual)}** | ${eur(r.interes)} | ${eur(r.peorDia)} | **${eur(-r.dd)}** | **${pct(-r.ddPct)}** | ${eur(r.minC)} (${r.fechaMin}) | ${r.enRojo || "nunca"} | ${r.llamada ? "**" + r.llamada + "**" : "no"} | ${r.opera} |`);
}

// ═══ 2 · LAS DOS MITADES, cada una arrancando con los mismos $7.977 ═════════════════════════
for (const [nom, dd] of PER.slice(1)) {
  console.log(`\n\n### 2 · MITAD ${nom} — arranca de nuevo con $7.977 el ${dd[0].fecha}\n`);
  console.log("| geometría | ctr | $/año NETO | interés | peor día | caída máx | caída % cuenta | caja mínima (fecha) | efectivo < $0 | LLAMADA | días op. |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const cfg of CFG) for (const n of [1, 2]) {
    const r = caja(cfg, n, dd); R[`${cfg.id}${n}|${nom}`] = r;
    console.log(`| ${cfg.nom} | ${n} | ${eur(r.anual)} | ${eur(r.interes)} | ${eur(r.peorDia)} | ${eur(-r.dd)} | ${pct(-r.ddPct)} | ${eur(r.minC)} (${r.fechaMin}) | ${r.enRojo || "nunca"} | ${r.llamada || "no"} | ${r.opera} |`);
  }
}

// ═══ 3 · AÑO A AÑO (1 y 2 contratos) ════════════════════════════════════════════════════════
const anos = [...new Set(D.map((d) => d.ano))].sort();
for (const n of [1, 2]) {
  console.log(`\n\n### 3 · AÑO A AÑO con ${n} contrato${n > 1 ? "s" : ""} — ganancia del año y caída máxima DENTRO del año\n`);
  console.log("| geometría | " + anos.map((a) => `${a} $ / caída`).join(" | ") + " |");
  console.log("|---|" + anos.map(() => "---").join("|") + "|");
  for (const cfg of CFG) {
    const r = R[`${cfg.id}${n}|TODO`];
    console.log(`| ${cfg.nom} | ` + anos.map((a) => {
      const p = r.porAno[a]; return p ? `${eur(p.pl)} / ${eur(-p.dd)}` : "—";
    }).join(" | ") + " |");
  }
}

// ═══ 4 · LA PREGUNTA DE LESTER, EN UNA LÍNEA ════════════════════════════════════════════════
console.log("\n\n### 4 · LA PREGUNTA: ¿aguanta la caja el filtro de amplitud y NO el cóndor de hoy?\n");
console.log("| tamaño | | cóndor de HOY (±25/50) | FILTRO AMPLITUD (±30/50) | por STRADDLE (2,3×/30) |");
console.log("|---|---|---|---|---|");
for (const n of [1, 2]) {
  const a = R[`A${n}|TODO`], b = R[`B${n}|TODO`], c = R[`C${n}|TODO`];
  const fila = (et, f) => console.log(`| ${n} contrato${n > 1 ? "s" : ""} | ${et} | ${f(a)} | ${f(b)} | ${f(c)} |`);
  fila("caída máxima", (r) => `**${eur(-r.dd)}** (${pct(-r.ddPct)} de la cuenta)`);
  fila("caja mínima", (r) => `${eur(r.minC)}`);
  fila("¿se queda sin efectivo?", (r) => (r.enRojo ? `**SÍ**, el ${r.enRojo}` : "no"));
  fila("¿llamada de margen?", (r) => (r.llamada ? `**SÍ**, el ${r.llamada}` : "NO"));
  fila("$/año NETO", (r) => `${eur(r.anual)}`);
  fila("interés pagado (4,3 años)", (r) => `${eur(r.interes)}`);
}

// ═══ 5 · EL LÍMITE DE TAMAÑO: ¿cuántos contratos antes de la llamada? ═══════════════════════
console.log("\n\n### 5 · ¿CUÁNTOS CONTRATOS ANTES DE LA LLAMADA DE MARGEN? (período entero)\n");
console.log("| geometría | 1 | 2 | 3 | 4 | 5 | 6 | máximo sin llamada | máximo sin quedarse sin efectivo |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const cfg of CFG) {
  const cel = [], sinLl = [], sinRojo = [];
  for (let n = 1; n <= 6; n++) {
    const r = caja(cfg, n, D);
    cel.push(r.llamada ? `LLAMADA ${r.llamada}` : r.enRojo ? `rojo ${r.enRojo}` : `ok ${eur(r.minC)}`);
    if (!r.llamada) sinLl.push(n);
    if (!r.enRojo) sinRojo.push(n);
  }
  console.log(`| ${cfg.nom} | ${cel.join(" | ")} | ${sinLl.length ? Math.max(...sinLl) : 0} | ${sinRojo.length ? Math.max(...sinRojo) : 0} |`);
}

// ═══ 6 · CONTROL DE HONESTIDAD sobre el filtro ══════════════════════════════════════════════
console.log("\n\n### 6 · CONTROL — el filtro salta días. ¿La caída baja por el FILTRO o por operar menos?\n");
const nOp = R["B1|TODO"].opera, nTot = D.length;
console.log(`El filtro opera ${nOp} de ${nTot} días (${(nOp / nTot * 100).toFixed(1)}%). Se compara contra:`);
console.log(`  · el ±30/50 SIN filtro (mismos días que el cóndor de hoy)`);
console.log(`  · saltar ${nTot - nOp} días AL AZAR con la misma geometría ±30/50 (500 sorteos)\n`);
const sinFiltro = { id: "B0", nom: "±30/50 SIN filtro", ala: 50, pl: (d) => d.B.pl, abre: () => true };
console.log("| variante | caída máxima | caída % cuenta | caja mínima | $/año | ¿llamada? |");
console.log("|---|---|---|---|---|---|");
for (const [nom, r] of [["±30/50 SIN filtro", caja(sinFiltro, 1, D)], ["±30/50 CON filtro de amplitud", R["B1|TODO"]]])
  console.log(`| ${nom} | ${eur(-r.dd)} | ${pct(-r.ddPct)} | ${eur(r.minC)} | ${eur(r.anual)} | ${r.llamada || "no"} |`);
const saltar = nTot - nOp;
const DI = D.map((d, i) => ({ ...d, _i: i }));
const dds = [], anuales = [];
for (let it = 0; it < 500; it++) {
  const idx = new Set(); while (idx.size < saltar) idx.add((Math.random() * nTot) | 0);
  const r = caja({ ...sinFiltro, abre: (d) => !idx.has(d._i) }, 1, DI);
  dds.push(r.dd); anuales.push(r.anual);
}
const q = (v, p) => { const s = [...v].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const mejores = dds.filter((x) => x <= R["B1|TODO"].dd).length;
console.log(`\n**Azar (500 sorteos, saltando ${saltar} días al azar):** caída mediana ${eur(-q(dds, 0.5))} · p10 ${eur(-q(dds, 0.10))} · p90 ${eur(-q(dds, 0.90))} · $/año mediano ${eur(q(anuales, 0.5))}`);
console.log(`**El filtro da ${eur(-R["B1|TODO"].dd)}. Sólo ${mejores} de 500 sorteos al azar (${(mejores / 5).toFixed(1)}%) consiguen una caída igual o menor.**`);
console.log(`\n(si ese porcentaje es alto, el filtro no está eligiendo días: sólo está operando menos, y eso se consigue gratis bajando el tamaño)`);
