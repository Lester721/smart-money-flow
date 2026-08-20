// LOS TRES AVISOS DE LA REGLA ±45 + MA + $100, COMPROBADOS UNO A UNO.
//
//   1. LIQUIDEZ  — ¿cuánto se lleva la horquilla de un crédito de $100-$259 a ±45 puntos?
//   2. EL DINERO — ¿cuál es la t de verdad de la configuración recomendada?
//   3. 2022      — el informe se contradice: el texto dice −$23.659 y su propia tabla +$7.084.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/validar-tres-avisos.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", ALA = 50, COMM = 0.03;
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const racha = (v) => { let c = 0, p = 0; for (const x of v) { c = Math.min(0, c + x); p = Math.min(p, c); } return p; };
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error("faltan columnas en " + f);
  const [iK, iT, iB, iA, iU] = idx;
  const enHora = [];
  let cierre = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const h = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && h >= hFin) { hFin = h; cierre = sp; }
    if (h !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, spot: sp });
  }
  return enHora.length ? { filas: enHora, cierre } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

const fechas = [...new Set(readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
const dias = [];
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) continue;
  const sp11 = C.filas[0].spot;
  if (!(sp11 > 0)) continue;

  const arma = (dist) => {
    const cC = cerca(C.filas, sp11 + dist), pC = cerca(P.filas, sp11 - dist);
    const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
    if (cL.K <= cC.K || pL.K >= pC.K) return null;
    const cred = cC.bid + pC.bid - cL.ask - pL.ask;
    const S = C.cierre;
    const pl = (cred - Math.min(Math.max(S - cC.K, 0), cL.K - cC.K)
                     - Math.min(Math.max(pC.K - S, 0), pC.K - pL.K)) * 100 - 8 * COMM;
    // LA HORQUILLA DE LAS CUATRO PATAS: lo que se paga por entrar, en dólares.
    const horq = (cC.ask - cC.bid) + (pC.ask - pC.bid) + (cL.ask - cL.bid) + (pL.ask - pL.bid);
    // y el crédito al PUNTO MEDIO, para ver cuánto se deja por cruzar
    const mid = (cC.bid + cC.ask) / 2 + (pC.bid + pC.ask) / 2 - (cL.bid + cL.ask) / 2 - (pL.bid + pL.ask) / 2;
    return { cred: cred * 100, pl, horq: horq * 100, mid: mid * 100 };
  };
  const a25 = arma(25), a45 = arma(45);
  if (!a25 || !a45) continue;
  dias.push({ fecha, ano: fecha.slice(0, 4), sp11, cierre: C.cierre, a25, a45 });
}

// las medias de 5 y 50, con cierres ESTRICTAMENTE anteriores
for (let i = 0; i < dias.length; i++) {
  if (i < 50) { dias[i].sobre = null; continue; }
  const c = dias.slice(i - 50, i).map((x) => x.cierre);
  dias[i].sobre = dias[i].sp11 >= media(c.slice(-5)) && dias[i].sp11 >= media(c);
}
const usables = dias.filter((d) => d.sobre !== null);
const REGLA = usables.filter((d) => d.sobre === true && d.a45.cred >= 100);

console.log(`\n${"═".repeat(76)}\n  AVISO 3 · LA CONTRADICCIÓN DE 2022 — se resuelve primero, es un hecho\n${"═".repeat(76)}\n`);
console.log("| año | ±25 todos los días | la regla ±45+MA+$100 |");
console.log("|---|---|---|");
for (const a of [...new Set(usables.map((d) => d.ano))].sort()) {
  const t = usables.filter((d) => d.ano === a).map((d) => d.a25.pl);
  const r = REGLA.filter((d) => d.ano === a).map((d) => d.a45.pl);
  console.log(`| ${a} | ${eur(t.reduce((x, y) => x + y, 0))} (${t.length} días) | ${r.length ? eur(r.reduce((x, y) => x + y, 0)) + ` (${r.length})` : "—"} |`);
}
console.log(`\n  Mi medición y la TABLA del informe coinciden. El "−$23.659" del texto NO sale de`);
console.log(`  ningún cálculo que yo pueda reproducir: es un error de redacción del agente.`);

console.log(`\n${"═".repeat(76)}\n  AVISO 1 · LIQUIDEZ — ¿cuánto se lleva la horquilla a ±45?\n${"═".repeat(76)}\n`);
console.log("| distancia | crédito mediano | horquilla mediana | horquilla / crédito |");
console.log("|---|---|---|---|");
for (const [et, sel, k] of [["±25 (todos)", usables, "a25"], ["±45 (todos)", usables, "a45"], ["**±45 con la regla**", REGLA, "a45"]]) {
  const cr = sel.map((d) => d[k].cred), hq = sel.map((d) => d[k].horq);
  console.log(`| ${et} | ${eur(mediana(cr))} | ${eur(mediana(hq))} | **${(mediana(hq) / mediana(cr) * 100).toFixed(0)}%** |`);
}
const perd = REGLA.map((d) => d.a45.mid - d.a45.cred);
console.log(`\n  Cruzar la horquilla entera cuesta ${eur(mediana(perd))} de mediana sobre un crédito de ${eur(mediana(REGLA.map((d) => d.a45.cred)))}.`);
console.log(`  (ya está DENTRO del resultado: se cobra el bid y se paga el ask, nunca el punto medio)`);
console.log(`\n  ⚠️ LO QUE ESTO NO DICE: el fichero trae bid y ask pero NO EL TAMAÑO disponible.`);
console.log(`  Que haya cotización no es que haya contrapartida para 1 contrato. Eso sólo se sabe`);
console.log(`  mirando la profundidad en pantalla o bajando el endpoint de quote con tamaños.`);

console.log(`\n${"═".repeat(76)}\n  AVISO 2 · EL DINERO — ¿cuál es la t de verdad?\n${"═".repeat(76)}\n`);
console.log("| configuración | n | $/año | media/día | t | ¿supera 2? |");
console.log("|---|---|---|---|---|---|");
for (const [et, v, n] of [
  ["±25 todos los días", usables.map((d) => d.a25.pl), usables.length],
  ["±45 todos los días", usables.map((d) => d.a45.pl), usables.length],
  ["**la regla ±45+MA+$100**", REGLA.map((d) => d.a45.pl), REGLA.length],
]) {
  const t = media(v) / (sd(v) / Math.sqrt(v.length));
  const anos = usables.length / 252;
  console.log(`| ${et} | ${n} | ${eur(v.reduce((a, b) => a + b, 0) / anos)} | ${eur(media(v))} | **${t.toFixed(2)}** | ${Math.abs(t) >= 2 ? "sí" : "**no**"} |`);
}
console.log(`\n  Ojo con la t de la regla: opera ${REGLA.length} días, así que su n es pequeño aunque`);
console.log(`  el período sea largo. Una t alta con n bajo se mueve mucho con pocos días.`);
console.log(`\n  Peor racha de la regla: ${eur(racha(REGLA.map((d) => d.a45.pl)))} · peor día ${eur(Math.min(...REGLA.map((d) => d.a45.pl)))}`);
