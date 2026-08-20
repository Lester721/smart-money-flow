// PASO 6 — LAS TRES PRUEBAS QUE DECIDEN SI ESTO SE PUEDE OPERAR.
//
//  A. FORMA ADAPTATIVA: en vez de un umbral fijo (que selecciona el 33% de los dias en 2022-23 y
//     el 13% en 2024-26), el percentil de rvManana DENTRO DE LOS 60 DIAS ANTERIORES. Sin nada del
//     futuro. Si el efecto es "el dia picado", la forma adaptativa tiene que funcionar igual o mejor.
//  B. CORTE A LAS 10:55: la version estricta, que no usa el precio de las 11:00 para decidir la
//     entrada de las 11:00. Si el hallazgo muere aqui, vive de un filo.
//  C. LA CAJA: efectivo de $7.977, prestado maximo, y la linea de llamada de margen en -$33.888.
//     Es lo unico que decide si Lester puede operarlo.
import { construir, media, pct, eur, racha, tWelch } from "./mov-lib.mjs";
import { readFileSync } from "node:fs";

const TODOS = construir();
const F = TODOS.filter((f) => f.huecoSig != null && f.rangoAnteSig != null && f.vel30Sig != null && f.rvIv != null);
const A = F.filter((f) => f.fecha < "2024-01-01"), B = F.filter((f) => f.fecha >= "2024-01-01");
const met = (sel, nTot) => {
  const pl = sel.map((f) => f.pl); const tot = pl.reduce((a, b) => a + b, 0);
  return { n: pl.length, alAno: tot / (nTot / 252), peor: Math.min(...pl), p1: pct(pl, 0.01), p5: pct(pl, 0.05),
           dd: racha(pl), p2000: pl.filter((x) => x < -2000).length / pl.length, p4000: pl.filter((x) => x < -4000).length / pl.length };
};

// ═══ A. FORMA ADAPTATIVA — percentil de rvManana dentro de los 60 dias ANTERIORES ═══
const ordF = [...F].sort((a, b) => a.fecha.localeCompare(b.fecha));
for (let i = 0; i < ordF.length; i++) {
  if (i < 60) { ordF[i].rank60 = null; continue; }
  const prev = ordF.slice(i - 60, i).map((x) => x.rvManana);
  ordF[i].rank60 = prev.filter((x) => x < ordF[i].rvManana).length / prev.length;
}
const Fa = ordF.filter((x) => x.rank60 != null);
const Aa = Fa.filter((f) => f.fecha < "2024-01-01"), Ba = Fa.filter((f) => f.fecha >= "2024-01-01");
console.log(`\n## A · FORMA ADAPTATIVA — percentil de rvManana en los 60 dias previos (n=${Fa.length})\n`);
console.log("| corte de percentil | 22-23 fuera | 22-23 D$/ano | 22-23 Dcaida | 24-26 fuera | 24-26 D$/ano | 24-26 Dcaida |");
console.log("|---|---|---|---|---|---|---|");
for (const R of [0.60, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95]) {
  const cols = [];
  for (const G of [Aa, Ba]) {
    const b = met(G, G.length), f = met(G.filter((x) => x.rank60 <= R), G.length);
    cols.push(`${(100 * (1 - f.n / G.length)).toFixed(0)}%`, eur(f.alAno - b.alAno), eur(Math.abs(b.dd) - Math.abs(f.dd)));
  }
  console.log(`| p${(R * 100).toFixed(0)} | ${cols.join(" | ")} |`);
}

// ═══ B. CORTE A LAS 10:55 ═══
const D = JSON.parse(readFileSync("scripts/cache-dias/mov-dias.json", "utf8"));
const sdv = (v) => { const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
for (const f of F) {
  const d = D[f.fecha], i = d.h.indexOf("10:55");
  if (i < 2) { f.rv1055 = null; continue; }
  const m = d.s.slice(0, i + 1), r = [];
  for (let j = 1; j < m.length; j++) r.push(Math.log(m[j] / m[j - 1]));
  f.rv1055 = sdv(r) * Math.sqrt(78 * 252) * 100;
}
const F55 = F.filter((x) => x.rv1055 != null);
const A55 = F55.filter((f) => f.fecha < "2024-01-01"), B55 = F55.filter((f) => f.fecha >= "2024-01-01");
console.log(`\n## B · CORTE A LAS 10:55 — sin usar el precio de las 11:00 para decidir (n=${F55.length})\n`);
console.log("| umbral | 22-23 fuera | 22-23 D$/ano | 22-23 Dcaida | 24-26 fuera | 24-26 D$/ano | 24-26 Dcaida |");
console.log("|---|---|---|---|---|---|---|");
for (const U of [14, 16, 17, 18, 19, 20, 22]) {
  const cols = [];
  for (const G of [A55, B55]) {
    const b = met(G, G.length), f = met(G.filter((x) => x.rv1055 <= U), G.length);
    cols.push(`${(100 * (1 - f.n / G.length)).toFixed(0)}%`, eur(f.alAno - b.alAno), eur(Math.abs(b.dd) - Math.abs(f.dd)));
  }
  console.log(`| ${U} | ${cols.join(" | ")} |`);
}

// ═══ C. LA CAJA ═══
// Efectivo inicial $7.977. Las perdidas salen del efectivo; el interes de margen es el 5% anual
// sobre lo prestado. Llamada de margen cuando lo prestado pasa de $33.888.
function caja(fs, contratos) {
  let ef = 7977, prestadoMax = 0, interes = 0, llamada = null;
  let prevFecha = null;
  for (const f of fs) {
    if (prevFecha) {
      const dias = (Date.parse(f.fecha) - Date.parse(prevFecha)) / 86400000;
      if (ef < 0) interes += (-ef) * 0.05 * (dias / 365);
    }
    prevFecha = f.fecha;
    ef += f.pl * contratos;
    if (ef < 0) { if (-ef > prestadoMax) prestadoMax = -ef; if (-ef > 33888 && !llamada) llamada = f.fecha; }
  }
  return { final: ef, prestadoMax, interes, llamada };
}
console.log("\n## C · LA CAJA DE LESTER — $7.977 de efectivo, linea de llamada en -$33.888\n");
console.log("| estrategia | contratos | $/ano bruto | prestado max | interes total | LLAMADA DE MARGEN | neto $/ano | % de la cuenta |");
console.log("|---|---|---|---|---|---|---|---|");
const anos = F.length / 252;
const VARIANTES = [
  ["operar TODOS los dias", (x) => true, 1],
  ["saltar rvManana > 18", (x) => x.rvManana <= 18, 1],
  ["operar TODOS, 1 contrato pero mitad de tamano (alas 25)", null, null],
];
for (const [et, filtro, c] of VARIANTES) {
  if (!filtro) continue;
  const sel = F.filter(filtro);
  const k = caja(sel, c);
  const bruto = sel.reduce((a, x) => a + x.pl, 0) * c / anos;
  console.log(`| ${et} | ${c} | ${eur(bruto)} | ${eur(k.prestadoMax)} | ${eur(k.interes)} | ${k.llamada ?? "no"} | ${eur(bruto - k.interes / anos)} | ${((bruto - k.interes / anos) / 56389 * 100).toFixed(2)}% |`);
}

// ═══ POR ANO, para ver donde actua ═══
console.log("\n## POR ANO — donde recorta y donde cuesta\n");
console.log("| ano | dias | dias saltados | $ todos | $ con filtro | D | peor dia todos | peor dia filtro |");
console.log("|---|---|---|---|---|---|---|---|");
for (const a of [2022, 2023, 2024, 2025, 2026]) {
  const g = F.filter((x) => x.ano === a); if (!g.length) continue;
  const d = g.filter((x) => x.rvManana <= 18);
  const st = g.reduce((s, x) => s + x.pl, 0), sf = d.reduce((s, x) => s + x.pl, 0);
  console.log(`| ${a} | ${g.length} | ${g.length - d.length} | ${eur(st)} | ${eur(sf)} | ${eur(sf - st)} | ${eur(Math.min(...g.map((x) => x.pl)))} | ${eur(Math.min(...d.map((x) => x.pl)))} |`);
}

// ═══ LA METRICA QUE DECIDE, con el nulo conservador ═══
console.log("\n## LA METRICA QUE DECIDE — $ de ingreso perdido por $ de caida eliminada\n");
const b = met(F, F.length), fl = met(F.filter((x) => x.rvManana <= 18), F.length);
const fueraPct = 1 - fl.n / F.length;
const caidaElim = Math.abs(b.dd) - Math.abs(fl.dd);
console.log(`| lectura | ingreso perdido $/ano | caida eliminada | coste por $ |`);
console.log("|---|---|---|---|");
console.log(`| punto (lo que salio) | ${eur(b.alAno - fl.alAno)} | ${eur(caidaElim)} | $${((b.alAno - fl.alAno) / caidaElim).toFixed(2)} |`);
const nulo = fueraPct * b.alAno;
console.log(`| nulo conservador (los dias saltados eran normales) | ${eur(nulo)} | ${eur(caidaElim)} | $${(nulo / caidaElim).toFixed(2)} |`);
console.log(`| referencia: bajar el TAMANO | proporcional | proporcional | $${(b.alAno / Math.abs(b.dd)).toFixed(2)} |`);
console.log(`\n  dias saltados: ${F.length - fl.n} de ${F.length} (${(fueraPct * 100).toFixed(1)}%)`);
