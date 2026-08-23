// AUTOPSIA DE CUATRO OPERACIONES — reconstruir a qué hora entró, desde la cinta real.
//
// ═══ QUÉ SE SABE Y QUÉ NO ═══════════════════════════════════════════════════════════════════
//
// Eduardo publicó una captura con cuatro calls de SPXW del 21 de agosto (0DTE), con su ganancia
// en dólares y en porcentaje. Nada más: ni la hora, ni cuántos contratos, ni las que perdió.
//
//     SPXW 7690 C   +$900   +36,15%
//     SPXW 7685 C   +$250   +32,06%
//     SPXW 7685 C   +$170   +20,99%
//     SPXW 7675 C   +$150   +8,03%
//
// ═══ LO QUE SÍ SE PUEDE DEDUCIR ═════════════════════════════════════════════════════════════
//
// Esos dos números encadenan el precio de entrada, si se supone un número de contratos:
//
//     ganancia = (salida − entrada) × 100 × contratos
//     retorno  = (salida − entrada) / entrada
//     ⇒ entrada = ganancia / (retorno × 100 × contratos)
//
// Y la CINTA REAL decide cuál de esas combinaciones es posible: si para 1 contrato la entrada
// sale a $24,89 y ese contrato nunca cotizó a $24,89 ese día, entonces no era 1 contrato.
//
// Así que se prueba cada número de contratos contra el bid/ask real de cada barra de 5 minutos, y
// se queda con las combinaciones donde el precio de entrada Y el de salida existieron de verdad.
//
// ═══ LO QUE ESTO NO PUEDE DAR ═══════════════════════════════════════════════════════════════
//
// La hora exacta, si un precio se repitió. Lo que da es la VENTANA de horas compatibles — y con
// cuatro operaciones a la vez, las ventanas se cruzan y el margen se estrecha mucho.
//
// Uso: node --import tsx scripts/autopsia-eduardo.mjs <ruta-del-csv-de-quotes>

import { readFileSync } from "node:fs";

const CSV = process.argv[2];
if (!CSV) { console.error("Falta la ruta del CSV de quotes de SPXW del 21."); process.exit(1); }

// Las cuatro, tal como aparecen en la captura.
const OPS = [
  { strike: 7690, ganancia: 900, retorno: 0.3615 },
  { strike: 7685, ganancia: 250, retorno: 0.3206 },
  { strike: 7685, ganancia: 170, retorno: 0.2099 },
  { strike: 7675, ganancia: 150, retorno: 0.0803 },
];
const CONTRATOS = [1, 2, 3, 4, 5, 10, 20];
const TOL = 0.06;          // margen: la captura redondea el % a dos decimales

// ── la cinta ────────────────────────────────────────────────────────────────
const lin = readFileSync(CSV, "utf8").trim().split("\n");
const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
const iK = cab.indexOf("strike"), iR = cab.indexOf("right"), iT = cab.indexOf("timestamp");
const iB = cab.indexOf("bid"), iA = cab.indexOf("ask");
if ([iK, iR, iT, iB, iA].some((x) => x < 0)) { console.error("Faltan columnas: " + cab.join("|")); process.exit(1); }

/** { strike → [{ hora, bid, ask, mid }] } sólo de las calls, ordenado por hora. */
const porStrike = new Map();
for (let j = 1; j < lin.length; j++) {
  const c = lin[j].split(",");
  if (!String(c[iR]).replace(/"/g, "").toUpperCase().startsWith("C")) continue;
  const K = Number(String(c[iK]).replace(/"/g, ""));
  const bid = Number(c[iB]), ask = Number(c[iA]);
  if (!(K > 0) || !(ask > 0)) continue;
  const hora = String(c[iT]).slice(11, 16);
  if (!porStrike.has(K)) porStrike.set(K, []);
  porStrike.get(K).push({ hora, bid, ask, mid: (bid + ask) / 2 });
}
for (const v of porStrike.values()) v.sort((a, b) => a.hora.localeCompare(b.hora));

console.log(`\n## Cinta del 21 de agosto · ${porStrike.size} strikes de call\n`);

// ── para cada operación, qué combinaciones son POSIBLES ─────────────────────
for (const op of OPS) {
  const barras = porStrike.get(op.strike);
  console.log(`### SPXW ${op.strike} C  ·  +$${op.ganancia}  (+${(op.retorno * 100).toFixed(2)}%)`);
  if (!barras) { console.log("  sin cinta para ese strike\n"); continue; }

  const posibles = [];
  for (const n of CONTRATOS) {
    // entrada y salida que exigen esos dos números
    const entrada = op.ganancia / (op.retorno * 100 * n);
    const salida = entrada * (1 + op.retorno);
    if (entrada < 0.05) continue;

    // ¿existió ese precio de ENTRADA en alguna barra? (se compra al ask, o cerca)
    const dondeEntra = barras.filter((b) => Math.abs(b.ask - entrada) <= TOL || Math.abs(b.mid - entrada) <= TOL);
    // ¿y el de SALIDA después? (se vende al bid, o cerca)
    const dondeSale = barras.filter((b) => Math.abs(b.bid - salida) <= TOL || Math.abs(b.mid - salida) <= TOL);
    if (!dondeEntra.length || !dondeSale.length) continue;

    // la salida tiene que ser POSTERIOR a la entrada
    const pares = [];
    for (const e of dondeEntra) for (const s of dondeSale) if (s.hora > e.hora) pares.push([e.hora, s.hora]);
    if (!pares.length) continue;

    posibles.push({
      n, entrada, salida,
      entradas: [...new Set(dondeEntra.map((b) => b.hora))],
      salidas: [...new Set(dondeSale.map((b) => b.hora))],
      pares: pares.length,
    });
  }

  if (!posibles.length) {
    console.log("  ninguna combinación de 1 a 20 contratos encaja con la cinta real.");
    console.log("  (puede ser un spread de varias patas, o la captura no da el detalle suficiente)\n");
    continue;
  }
  for (const p of posibles) {
    const eIni = p.entradas[0], eFin = p.entradas[p.entradas.length - 1];
    console.log(`  ${String(p.n).padStart(2)} contratos → entra a $${p.entrada.toFixed(2)}, sale a $${p.salida.toFixed(2)}`);
    console.log(`     entrada compatible entre ${eIni} y ${eFin}  (${p.entradas.length} barras)`);
    console.log(`     salida compatible: ${p.salidas.slice(0, 6).join(", ")}${p.salidas.length > 6 ? "…" : ""}`);
  }
  console.log("");
}

// ── el contexto del día, para leer las horas ────────────────────────────────
console.log("### El precio del subyacente, para situar las horas\n");
const ref = porStrike.get(7675) ?? [...porStrike.values()][0];
const atm = [];
for (const h of ["09:30", "09:45", "10:00", "10:30", "11:00", "11:30", "12:00", "13:00", "14:00", "15:00", "15:55"]) {
  // el spot se deduce por paridad aproximada: el strike donde la call vale ~lo mismo que la put
  // no está aquí, así que se usa el valor de la call 7675 como termómetro
  const b = ref.find((x) => x.hora === h);
  if (b) atm.push(`  ${h}  call 7675 a $${b.mid.toFixed(2)}`);
}
console.log(atm.join("\n"));
console.log("\n  (la call 7675 subiendo = SPX subiendo. Es el termómetro del día.)\n");
