// ════════════════════════════════════════════════════════════════════════════════════════════
// LENTE 2 — LA COLA DE LAS PÉRDIDAS DE LA MARIPOSA DE LAS 15:00
// ════════════════════════════════════════════════════════════════════════════════════════════
//
// QUÉ SE PONE A PRUEBA
//   El hallazgo dice: a las 15:00, si el SPX está por encima de su media de 5 cierres Y de la
//   de 50, vender la mariposa de hierro al dinero sobre SPXW del mismo día (alas de 50 puntos)
//   y aguantar a vencimiento. $11.405/año con un contrato, mediana $226, peor día -$3.247,
//   caída máxima de caja $5.321, n=518.
//
// POR QUÉ ESTA LENTE
//   Vender prima gana casi siempre y pierde mucho de golpe. La media es una mentira por
//   construcción: basta con que tres días muy malos no hayan caído dentro de la muestra para
//   que el $/año se dispare. Aquí se abre la distribución entera y se le quitan los peores y
//   los mejores días para ver de qué vive el número.
//
// LO DECISIVO PARA LESTER
//   Tiene ~$7.977 de EFECTIVO libre y Robinhood retiene $5.000 por la mariposa. Un resultado
//   anual correcto que en algún momento exige más efectivo del que hay NO SE PUEDE OPERAR.
//   Aquí se simula la caja de verdad: empieza en $7.977, se le suma el resultado de cada día,
//   y se comprueba si alguna vez cae por debajo de los $5.000 que hacen falta para abrir la
//   siguiente. También se mira si los días de verdad malos del período están DENTRO o si la
//   regla se los salta.
//
// TODO SE RECALCULA DESDE CERO CON EL BANCO (estructura()). No se lee ningún resultado previo.
//
// SE EJECUTA:  node --import tsx scripts/v5b-lente2-cola-mariposa.mjs
// ════════════════════════════════════════════════════════════════════════════════════════════

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { diasDisponibles, cargarDia, estructura, hayHora, idxHora, rejilla, condor, resumen, CACHE }
  from "./lib0dte.mjs";

const ANOS = 4.60;
const CAJA_INICIAL = 7977;      // efectivo libre real de Lester
const COLATERAL = 5000;         // lo que retiene Robinhood por la mariposa de alas 50

const mariposa = (c, A) => [
  { K: c,     lado: "C", dir: -1 },
  { K: c + A, lado: "C", dir:  1 },
  { K: c,     lado: "P", dir: -1 },
  { K: c - A, lado: "P", dir:  1 },
];

// días de verdad malos que hay que buscar en la muestra
const DIAS_MALOS = ["2022-10-13", "2025-04-09", "2025-10-10", "2026-06-09"];

// ── variantes que se miden ──────────────────────────────────────────────────────────────────
const V = {
  "mariposa 15:00 A=50 CON filtro":  { h: "15:00", A: 50, filtro: true },
  "mariposa 13:30 A=50 CON filtro":  { h: "13:30", A: 50, filtro: true },
  "mariposa 15:00 A=50 SIN filtro":  { h: "15:00", A: 50, filtro: false },
};
const acc = {}; for (const k of Object.keys(V)) acc[k] = [];
const liston = [];
const listonSalt = { filtro: 0, credito: 0, huecos: 0 };
const huecos = {}; for (const k of Object.keys(V)) huecos[k] = 0;
const saltados = {}; for (const k of Object.keys(V)) saltados[k] = 0;
const bloqueados = {}; for (const k of Object.keys(V)) bloqueados[k] = 0;

const dias = diasDisponibles();
console.log(`días disponibles: ${dias.length}  (${dias[0]} → ${dias[dias.length - 1]})`);

const cierres = [];
let diasOk = 0, sinMA = 0;
const mediasSes = [];
let validado = false;

for (const d of dias) {
  const dia = cargarDia(d);
  if (!dia) continue;
  diasOk++;
  const cierreHoy = dia.barras[dia.barras.length - 1].spot;

  // media sesión: SPX congelado de 13:05 al cierre
  let ultimaEntrada = dia.barras.length - 1;
  const i1305 = hayHora(dia, "13:05");
  if (i1305 >= 0) {
    const sp = dia.barras.slice(i1305).map((b) => b.spot);
    if (sp.every((x) => x === sp[0])) { mediasSes.push(d); ultimaEntrada = hayHora(dia, "13:00"); }
  }

  // validación: la mariposa de 4 patas tiene que dar EXACTAMENTE la suma de sus dos verticales
  if (!validado) {
    const iv = idxHora(dia, "15:00");
    const c0 = rejilla(dia.barras[iv].spot);
    const m = estructura(dia, iv, "vencimiento", mariposa(c0, 50));
    const vc = estructura(dia, iv, "vencimiento", [{ K: c0, lado: "C", dir: -1 }, { K: c0 + 50, lado: "C", dir: 1 }]);
    const vp = estructura(dia, iv, "vencimiento", [{ K: c0, lado: "P", dir: -1 }, { K: c0 - 50, lado: "P", dir: 1 }]);
    if (m && vc && vp) {
      const dif = Math.abs(m.dolares - (vc.dolares + vp.dolares));
      if (dif > 1e-9) throw new Error(`la mariposa NO es la suma de sus dos verticales: dif ${dif}`);
      console.log(`validación OK — mariposa == vertical call + vertical put al céntimo ` +
        `(${d} 15:00 A=50: $${m.dolares.toFixed(2)}, riesgo $${m.riesgoMax.toFixed(2)})`);
      validado = true;
    }
  }

  const hayMA = cierres.length >= 50;
  const ma5 = hayMA ? cierres.slice(-5).reduce((a, b) => a + b, 0) / 5 : null;
  const ma50 = hayMA ? cierres.slice(-50).reduce((a, b) => a + b, 0) / 50 : null;
  if (!hayMA) sinMA++;

  if (hayMA) {
    for (const [k, cfg] of Object.entries(V)) {
      const iE = hayHora(dia, cfg.h);
      if (iE < 0) continue;
      if (iE > ultimaEntrada) { bloqueados[k]++; continue; }
      const S = dia.barras[iE].spot;
      if (cfg.filtro && !(S > ma5 && S > ma50)) { saltados[k]++; continue; }
      const c0 = rejilla(S);
      const r = estructura(dia, iE, "vencimiento", mariposa(c0, cfg.A));
      if (!r) { huecos[k]++; continue; }
      acc[k].push({
        dia: d, d: r.dolares, credito: r.credito * 100, riesgo: r.riesgoMax,
        entrada: S, cierre: cierreHoy, centro: c0, movPct: 100 * (cierreHoy - S) / S,
      });
    }

    // listón: los tres síes
    const iv = hayHora(dia, "11:00");
    if (iv >= 0) {
      const S = dia.barras[iv].spot;
      if (S > ma5 && S > ma50) {
        const r = estructura(dia, iv, "vencimiento", condor(rejilla(S), 45, 50));
        if (!r) listonSalt.huecos++;
        else if (r.credito * 100 < 100) listonSalt.credito++;
        else liston.push({ dia: d, d: r.dolares, credito: r.credito * 100, riesgo: r.riesgoMax,
          entrada: S, cierre: cierreHoy, centro: rejilla(S), movPct: 100 * (cierreHoy - S) / S });
      } else listonSalt.filtro++;
    }
  }
  cierres.push(cierreHoy);
}
console.log(`días cargados: ${diasOk}   sin MA50 todavía: ${sinMA}   medias sesiones: ${mediasSes.length} (${mediasSes.join(" ")})`);

// ── utilidades ──────────────────────────────────────────────────────────────────────────────
const sum = (v) => v.reduce((a, b) => a + b, 0);
const med = (v) => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))]; };

function caja(v, inicial = 0) {
  let a = inicial, pico = inicial, peor = 0, min = inicial, iPeor = -1, iMin = -1, iPico = -1, picoIdx = 0;
  for (let i = 0; i < v.length; i++) {
    a += v[i];
    if (a > pico) { pico = a; picoIdx = i; }
    if (pico - a > peor) { peor = pico - a; iPeor = i; iPico = picoIdx; }
    if (a < min) { min = a; iMin = i; }
  }
  return { final: a, caidaMax: peor, iPeor, iPico, min, iMin };
}

function informe(nombre, filas) {
  const v = filas.map((f) => f.d);
  const ord = [...v].sort((a, b) => a - b);
  const r = resumen(v);
  const c = caja(v);
  const cCash = caja(v, CAJA_INICIAL);

  console.log(`\n${"═".repeat(96)}`);
  console.log(`  ${nombre}`);
  console.log(`${"═".repeat(96)}`);
  console.log(`  n=${filas.length}   ${filas[0].dia} → ${filas[filas.length - 1].dia}`);
  const cr = filas.map((f) => f.credito), ri = filas.map((f) => f.riesgo);
  console.log(`  SANIDAD crédito $ min/p5/med/p95/max: $${Math.round(Math.min(...cr))} / $${Math.round(pct(cr, 0.05))} / $${Math.round(med(cr))} / $${Math.round(pct(cr, 0.95))} / $${Math.round(Math.max(...cr))}`);
  console.log(`  SANIDAD riesgo máx $ min/med/max: $${Math.round(Math.min(...ri))} / $${Math.round(med(ri))} / $${Math.round(Math.max(...ri))}`);
  const violaTope = filas.filter((f) => f.d < -f.riesgo - 0.01).length;
  console.log(`  días que pierden MÁS que su riesgo máximo teórico: ${violaTope}   ← debe ser 0`);
  console.log(`  $/año: $${Math.round(sum(v) / ANOS).toLocaleString("en-US")}   total $${Math.round(sum(v)).toLocaleString("en-US")}   media/op $${r.media.toFixed(1)}   t=${r.t.toFixed(2)}   aciertos ${(100 * r.aciertos).toFixed(1)}%`);
  console.log(`  mediana $${Math.round(med(v))}   mejor $${Math.round(ord[ord.length - 1]).toLocaleString("en-US")}   PEOR $${Math.round(ord[0]).toLocaleString("en-US")}`);

  console.log(`\n  ── LA DISTRIBUCIÓN ENTERA ──`);
  const qs = [0.005, 0.01, 0.02, 0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95, 0.99];
  console.log(`  percentil: ` + qs.map((q) => `p${(q * 100).toFixed(q < 0.05 ? 1 : 0)}`).map((s) => s.padStart(9)).join(""));
  console.log(`  $        : ` + qs.map((q) => ("$" + Math.round(pct(v, q)).toLocaleString("en-US")).padStart(9)).join(""));
  const tramos = [[-Infinity, -3000], [-3000, -2000], [-2000, -1000], [-1000, -500], [-500, 0],
    [0, 250], [250, 500], [500, 750], [750, 1000], [1000, Infinity]];
  console.log(`  reparto por tramos:`);
  for (const [a, b] of tramos) {
    const n = v.filter((x) => x >= a && x < b).length;
    if (!n) continue;
    const et = `${a === -Infinity ? "  <" : "$" + a} a ${b === Infinity ? "  +" : "$" + b}`;
    console.log(`    ${et.padEnd(20)} ${String(n).padStart(4)} días (${(100 * n / v.length).toFixed(1).padStart(5)}%)  ${"█".repeat(Math.round(60 * n / v.length))}`);
  }
  const perd = v.filter((x) => x < 0), gan = v.filter((x) => x > 0);
  console.log(`  días perdedores: ${perd.length} (${(100 * perd.length / v.length).toFixed(1)}%)   pérdida media cuando pierde: $${Math.round(sum(perd) / perd.length)}`);
  console.log(`  días ganadores : ${gan.length} (${(100 * gan.length / v.length).toFixed(1)}%)   ganancia media cuando gana : $${Math.round(sum(gan) / gan.length)}`);
  const casi = filas.filter((f) => f.d <= -0.90 * f.riesgo).length;
  const tot = filas.filter((f) => f.d <= -0.999 * f.riesgo).length;
  console.log(`  días que pierden ≥90% del riesgo máximo: ${casi} (${(100 * casi / v.length).toFixed(1)}%)   el 100%: ${tot}`);

  console.log(`\n  ── QUITANDO LOS PEORES Y LOS MEJORES ──`);
  console.log(`  quitar N   sin los N PEORES        sin los N MEJORES`);
  for (const N of [0, 5, 10, 25, 50]) {
    const sp = N === 0 ? sum(v) : sum(ord.slice(N));
    const sm = N === 0 ? sum(v) : sum(ord.slice(0, -N));
    console.log(`  ${String(N).padStart(6)}   ${("$" + Math.round(sp / ANOS).toLocaleString("en-US") + "/año").padStart(18)}   ${("$" + Math.round(sm / ANOS).toLocaleString("en-US") + "/año").padStart(18)}`);
  }
  console.log(`  los 5 mejores días suman $${Math.round(sum(ord.slice(-5))).toLocaleString("en-US")} (${(100 * sum(ord.slice(-5)) / sum(v)).toFixed(0)}% del total)`);
  console.log(`  los 25 mejores días suman $${Math.round(sum(ord.slice(-25))).toLocaleString("en-US")} (${(100 * sum(ord.slice(-25)) / sum(v)).toFixed(0)}% del total)`);
  console.log(`  los 5 peores días restan $${Math.round(sum(ord.slice(0, 5))).toLocaleString("en-US")}   los 25 peores restan $${Math.round(sum(ord.slice(0, 25))).toLocaleString("en-US")}`);
  console.log(`  los 12 PEORES días, uno a uno:`);
  for (const f of [...filas].sort((a, b) => a.d - b.d).slice(0, 12))
    console.log(`    ${f.dia}  $${Math.round(f.d).toString().padStart(6)}   entrada ${f.entrada.toFixed(0)} centro ${f.centro} cierre ${f.cierre.toFixed(0)}  (movió ${f.movPct.toFixed(2)}%)  crédito $${Math.round(f.credito)}  riesgo $${Math.round(f.riesgo)}`);

  console.log(`\n  ── AÑO A AÑO ──`);
  const porAno = {};
  for (const f of filas) (porAno[f.dia.slice(0, 4)] ??= []).push(f);
  for (const [a, fs] of Object.entries(porAno)) {
    const xs = fs.map((f) => f.d);
    const ca = caja(xs);
    console.log(`    ${a}: $${Math.round(sum(xs)).toLocaleString("en-US").padStart(8)}  (n=${String(xs.length).padStart(3)})  mediana $${Math.round(med(xs)).toString().padStart(5)}  peor $${Math.round(Math.min(...xs)).toLocaleString("en-US").padStart(7)}  caída dentro del año $${Math.round(ca.caidaMax).toLocaleString("en-US")}`);
  }
  const pa = Object.entries(porAno).filter(([, fs]) => sum(fs.map((f) => f.d)) <= 0);
  console.log(`    años perdedores: ${pa.length ? pa.map(([a]) => a).join(" ") : "ninguno"}`);

  console.log(`\n  ── LA CAJA ──`);
  console.log(`    final $${Math.round(c.final).toLocaleString("en-US")}   CAÍDA MÁXIMA $${Math.round(c.caidaMax).toLocaleString("en-US")}   punto más bajo desde cero $${Math.round(c.min).toLocaleString("en-US")}`);
  if (c.iPeor >= 0) console.log(`    la caída máxima va de ${filas[c.iPico].dia} a ${filas[c.iPeor].dia}`);
  console.log(`    ── ¿CABE EN LOS $${CAJA_INICIAL.toLocaleString("en-US")} DE EFECTIVO? ──`);
  console.log(`    efectivo simulado: empieza en $${CAJA_INICIAL.toLocaleString("en-US")}, mínimo alcanzado $${Math.round(cCash.min).toLocaleString("en-US")}${cCash.iMin >= 0 ? " el " + filas[cCash.iMin].dia : " (nunca baja del inicio)"}`);
  const bloqueo = [];
  let cash = CAJA_INICIAL;
  for (const f of filas) { if (cash < COLATERAL) bloqueo.push(f.dia); cash += f.d; }
  console.log(`    días en que NO habría habido los $${COLATERAL.toLocaleString("en-US")} de colateral para abrir: ${bloqueo.length}${bloqueo.length ? " → " + bloqueo.slice(0, 10).join(" ") : ""}`);
  console.log(`    colchón si el PEOR día cayera el primer día: $${Math.round(CAJA_INICIAL + ord[0]).toLocaleString("en-US")}`);

  console.log(`\n  ── RACHAS ──`);
  let racha = 0, peorRacha = 0;
  for (const f of filas) { racha = f.d < 0 ? racha + f.d : 0; if (racha < peorRacha) peorRacha = racha; }
  console.log(`    peor racha de días perdedores consecutivos: $${Math.round(peorRacha).toLocaleString("en-US")}`);
  for (const W of [5, 10, 20, 40]) {
    let pv = 0, pi = 0;
    for (let i = 0; i + W <= v.length; i++) { const s = sum(v.slice(i, i + W)); if (s < pv) { pv = s; pi = i; } }
    console.log(`    peor ventana de ${String(W).padStart(2)} operaciones seguidas: $${Math.round(pv).toLocaleString("en-US")}  (${filas[pi].dia} → ${filas[pi + W - 1].dia})`);
  }

  console.log(`\n  ── ¿ESTÁN LOS DÍAS DE VERDAD MALOS? ──`);
  for (const dm of DIAS_MALOS) {
    const f = filas.find((x) => x.dia === dm);
    if (f) console.log(`    ${dm}: SÍ opera  →  $${Math.round(f.d)}   (movió ${f.movPct.toFixed(2)}%, crédito $${Math.round(f.credito)})`);
    else console.log(`    ${dm}: NO opera`);
  }
  return { nombre, n: v.length, dolAno: sum(v) / ANOS, mediana: med(v), peor: ord[0],
    caidaMax: c.caidaMax, min: c.min, cashMin: cCash.min, bloqueos: bloqueo.length };
}

const outs = [];
outs.push(informe(`LISTÓN — «LOS TRES SÍES» (cóndor ±45/50 a las 11:00, crédito ≥ $100)`, liston));
console.log(`  saltadas: filtro MA ${listonSalt.filtro}, crédito<$100 ${listonSalt.credito}, huecos ${listonSalt.huecos}`);

for (const k of Object.keys(V)) {
  outs.push(informe(k.toUpperCase(), acc[k]));
  console.log(`  saltados por filtro: ${saltados[k]}   huecos: ${huecos[k]}   bloqueados por media sesión: ${bloqueados[k]}`);
}

console.log(`\n${"═".repeat(96)}`);
console.log("  RESUMEN COMPARADO");
console.log(`${"═".repeat(96)}`);
console.log("  variante".padEnd(42) + "n".padStart(5) + "$/año".padStart(10) + "mediana".padStart(9) +
  "peor día".padStart(10) + "caídaMáx".padStart(10) + "mín caja".padStart(10) + "  efectivo mín");
for (const o of outs)
  console.log("  " + o.nombre.slice(0, 40).padEnd(42) + String(o.n).padStart(5) +
    ("$" + Math.round(o.dolAno).toLocaleString("en-US")).padStart(10) +
    ("$" + Math.round(o.mediana)).padStart(9) +
    ("$" + Math.round(o.peor).toLocaleString("en-US")).padStart(10) +
    ("$" + Math.round(o.caidaMax).toLocaleString("en-US")).padStart(10) +
    ("$" + Math.round(o.min).toLocaleString("en-US")).padStart(10) +
    ("  $" + Math.round(o.cashMin).toLocaleString("en-US")).padStart(15));

writeFileSync(join(CACHE, "..", "v5b-lente2-salida.json"), JSON.stringify({ outs, filas: acc, liston }, null, 1));
console.log("\nescrito scripts/v5b-lente2-salida.json");
