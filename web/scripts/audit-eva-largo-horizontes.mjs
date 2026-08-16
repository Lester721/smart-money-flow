// AUDITORÍA ADVERSARIA — ¿por qué 180 d da −15,41% y 365 d da −5,16%?
// Solo lectura. No toca ningún fichero del test.
// Uso: node --max-old-space-size=6144 scripts/audit-eva-largo-horizontes.mjs

import { readFileSync } from "node:fs";

const ENTRADA = process.env.EVA_LARGO_FILAS || "scripts/eva-largo-filas.json";
const H = [30, 90, 180, 365];

const filas = JSON.parse(readFileSync(ENTRADA, "utf8"));
const media = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN);
const pct = (x) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(2)}%`;
const sd = (x) => { const m = media(x); return Math.sqrt(x.reduce((a, v) => a + (v - m) ** 2, 0) / (x.length - 1)); };
const tCero = (x) => media(x) / (sd(x) / Math.sqrt(x.length));
const q = (x, p) => { const s = [...x].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const id = (f) => `${f.ticker}|${f.dia}|${f.exp}|${f.strike}|${f.right}|${f.ts}|${f.prima}|${f.size}`;
const mes = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}`;

console.log(`filas totales: ${filas.length.toLocaleString("es-ES")}\n`);

// ══ 0. REPRODUCIR LA TABLA ATACADA ══════════════════════════════════════════
console.log("═══ 0 · tabla reproducida desde el fichero ═══");
console.log("horiz       n    flujo      cubo     DIFER      t      DTE med  DTE med(exp)  %ausenteT  %ausenteC");
for (const h of H) {
  const s = filas.filter((f) => f.h[h]);
  if (!s.length) continue;
  const d = s.map((f) => f.h[h].d);
  const ausT = s.filter((f) => f.h[h].ausenteT).length;
  const totC = s.reduce((a, f) => a + f.h[h].n, 0);
  const ausC = s.reduce((a, f) => a + f.h[h].ausentesC, 0);
  console.log(
    `${String(h).padStart(4)} ${String(s.length).padStart(7)}  ${pct(media(s.map((f) => f.h[h].t))).padStart(8)}  ` +
    `${pct(media(s.map((f) => f.h[h].c))).padStart(8)}  ${pct(media(d)).padStart(8)}  ${tCero(d).toFixed(2).padStart(6)}  ` +
    `${media(s.map((f) => f.dte)).toFixed(0).padStart(7)}  ${String(q(s.map((f) => f.dte), 0.5)).padStart(10)}  ` +
    `${((ausT / s.length) * 100).toFixed(1).padStart(8)}%  ${((ausC / totC) * 100).toFixed(1).padStart(8)}%`);
}

// ══ 1. ¿MISMAS FILAS O POBLACIONES DISTINTAS? ═══════════════════════════════
console.log("\n═══ 1 · solapamiento entre horizontes (por identidad de fila) ═══");
const sets = {};
for (const h of H) sets[h] = new Set(filas.filter((f) => f.h[h]).map(id));
console.log("        " + H.map((h) => String(h).padStart(9)).join(""));
for (const a of H) {
  let l = `en ${String(a).padStart(3)}d:`;
  for (const b of H) {
    let n = 0;
    for (const k of sets[a]) if (sets[b].has(k)) n++;
    l += String(n).padStart(9);
  }
  console.log(l + `   (|${a}d| = ${sets[a].size})`);
}
const en365no180 = [...sets[365]].filter((k) => !sets[180].has(k)).length;
console.log(`\nfilas con 365 d pero SIN 180 d: ${en365no180}`);
console.log(`filas con los CUATRO horizontes: ${[...sets[365]].filter((k) => sets[180].has(k) && sets[90].has(k) && sets[30].has(k)).length}`);

// ══ 2. FECHAS DE ENTRADA POR HORIZONTE ══════════════════════════════════════
console.log("\n═══ 2 · fechas de entrada por horizonte ═══");
for (const h of H) {
  const s = filas.filter((f) => f.h[h]).map((f) => f.dia).sort();
  const sal = filas.filter((f) => f.h[h]).map((f) => f.h[h].diaSal).sort();
  console.log(`${String(h).padStart(4)} d  entradas ${s[0]} → ${s[s.length - 1]}   ·   salidas ${sal[0]} → ${sal[sal.length - 1]}`);
}
console.log("\nreparto de entradas por mes (nº de filas con ese horizonte):");
const meses = [...new Set(filas.map((f) => mes(f.dia)))].sort();
console.log("mes        " + H.map((h) => String(h + "d").padStart(8)).join("") + "     flujo30    flujo180   flujo365");
for (const m of meses) {
  const enMes = filas.filter((f) => mes(f.dia) === m);
  let l = m.padEnd(10);
  for (const h of H) l += String(enMes.filter((f) => f.h[h]).length).padStart(8);
  const r = (h) => { const s = enMes.filter((f) => f.h[h]); return s.length ? pct(media(s.map((f) => f.h[h].t))) : "—"; };
  console.log(l + `   ${r(30).padStart(9)}  ${r(180).padStart(10)}  ${r(365).padStart(9)}`);
}

// ══ 3. LA PRUEBA CLAVE: MISMAS FILAS, LOS CUATRO HORIZONTES ═════════════════
console.log("\n═══ 3 · SOLO las filas que tienen los CUATRO horizontes (población fija) ═══");
const cuatro = filas.filter((f) => f.h[30] && f.h[90] && f.h[180] && f.h[365]);
console.log(`n = ${cuatro.length}`);
console.log("horiz     flujo      cubo     DIFER       t");
for (const h of H) {
  const d = cuatro.map((f) => f.h[h].d);
  console.log(`${String(h).padStart(4)} ${pct(media(cuatro.map((f) => f.h[h].t))).padStart(10)}  ` +
              `${pct(media(cuatro.map((f) => f.h[h].c))).padStart(8)}  ${pct(media(d)).padStart(8)}  ${tCero(d).toFixed(2).padStart(6)}`);
}

console.log("\n═══ 3b · el COMPLEMENTO: filas con 180 d pero SIN 365 d ═══");
const solo180 = filas.filter((f) => f.h[180] && !f.h[365]);
console.log(`n = ${solo180.length} · DTE medio ${media(solo180.map((f) => f.dte)).toFixed(0)} · ` +
            `flujo ${pct(media(solo180.map((f) => f.h[180].t)))} · cubo ${pct(media(solo180.map((f) => f.h[180].c)))} · ` +
            `difer ${pct(media(solo180.map((f) => f.h[180].d)))}`);
const con365 = filas.filter((f) => f.h[180] && f.h[365]);
console.log(`filas con 180 d Y 365 d: n = ${con365.length} · DTE medio ${media(con365.map((f) => f.dte)).toFixed(0)} · ` +
            `flujo@180 ${pct(media(con365.map((f) => f.h[180].t)))} · cubo@180 ${pct(media(con365.map((f) => f.h[180].c)))} · ` +
            `difer ${pct(media(con365.map((f) => f.h[180].d)))}`);

// ══ 4. VIDA RESTANTE EN LA SALIDA ═══════════════════════════════════════════
console.log("\n═══ 4 · vida restante del contrato el día de salida (DTE − horizonte) ═══");
console.log("horiz    media    p10    p25   mediana    p75    p90    %con <30d restantes");
for (const h of H) {
  const s = filas.filter((f) => f.h[h]);
  const rest = s.map((f) => f.dte - h);
  const cortos = rest.filter((r) => r < 30).length;
  console.log(`${String(h).padStart(4)} ${media(rest).toFixed(0).padStart(8)} ${String(q(rest, 0.1)).padStart(6)} ` +
              `${String(q(rest, 0.25)).padStart(6)} ${String(q(rest, 0.5)).padStart(8)} ${String(q(rest, 0.75)).padStart(6)} ` +
              `${String(q(rest, 0.9)).padStart(6)}   ${((cortos / s.length) * 100).toFixed(1).padStart(6)}%`);
}

// ══ 5. RETORNO POR VIDA RESTANTE (dentro de cada horizonte) ═════════════════
console.log("\n═══ 5 · retorno del flujo según la vida restante en la salida ═══");
const cubos = [[0, 30], [30, 60], [60, 120], [120, 240], [240, 100000]];
for (const h of H) {
  const s = filas.filter((f) => f.h[h]);
  let l = `${String(h).padStart(4)} d: `;
  for (const [lo, hi] of cubos) {
    const g = s.filter((f) => f.dte - h >= lo && f.dte - h < hi);
    l += `  [${lo}-${hi === 100000 ? "∞" : hi}) n=${String(g.length).padStart(5)} ${g.length ? pct(media(g.map((f) => f.h[h].t))).padStart(8) : "       —"}`;
  }
  console.log(l);
}

// ══ 6. AÑOS DE VENCIMIENTO ══════════════════════════════════════════════════
console.log("\n═══ 6 · año de vencimiento por horizonte ═══");
for (const h of H) {
  const s = filas.filter((f) => f.h[h]);
  const c = new Map();
  for (const f of s) { const a = f.exp.slice(0, 4); c.set(a, (c.get(a) ?? 0) + 1); }
  console.log(`${String(h).padStart(4)} d  ` + [...c].sort().map(([a, n]) => `${a}:${n} (${((n / s.length) * 100).toFixed(0)}%)`).join("  "));
}

// ══ 7. CONCENTRACIÓN POR TICKER Y POR MES DE SALIDA ═════════════════════════
console.log("\n═══ 7 · concentración por ticker ═══");
for (const h of H) {
  const s = filas.filter((f) => f.h[h]);
  const c = new Map();
  for (const f of s) c.set(f.ticker, (c.get(f.ticker) ?? 0) + 1);
  console.log(`${String(h).padStart(4)} d  ` + [...c].sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${t}:${((n / s.length) * 100).toFixed(0)}%`).join("  "));
}

console.log("\n═══ 7b · retorno del flujo por MES DE SALIDA (180 d vs 365 d) ═══");
console.log("mes salida    n180    flujo180      n365    flujo365");
const mesesSal = [...new Set(filas.flatMap((f) => [f.h[180]?.diaSal, f.h[365]?.diaSal].filter(Boolean).map(mes)))].sort();
for (const m of mesesSal) {
  const a = filas.filter((f) => f.h[180] && mes(f.h[180].diaSal) === m);
  const b = filas.filter((f) => f.h[365] && mes(f.h[365].diaSal) === m);
  console.log(`${m.padEnd(12)} ${String(a.length).padStart(6)}  ${(a.length ? pct(media(a.map((f) => f.h[180].t))) : "—").padStart(10)}  ` +
              `${String(b.length).padStart(8)}  ${(b.length ? pct(media(b.map((f) => f.h[365].t))) : "—").padStart(10)}`);
}

// ══ 8. CALL/PUT Y MONEYNESS APROXIMADA (por prima de entrada) ═══════════════
console.log("\n═══ 8 · mezcla call/put y prima de entrada ═══");
console.log("horiz   %calls   askEnt medio   askEnt mediana");
for (const h of H) {
  const s = filas.filter((f) => f.h[h]);
  const c = s.filter((f) => f.right === "C").length;
  console.log(`${String(h).padStart(4)} ${((c / s.length) * 100).toFixed(1).padStart(8)}%  ` +
              `${media(s.map((f) => f.askEnt)).toFixed(2).padStart(12)}  ${q(s.map((f) => f.askEnt), 0.5).toFixed(2).padStart(14)}`);
}

// ══ 9. ¿EL CUBO SIGUE AL TRATAMIENTO? correlación de niveles ════════════════
console.log("\n═══ 9 · el tratamiento y su cubo, ¿se mueven juntos? ═══");
for (const h of H) {
  const s = filas.filter((f) => f.h[h]);
  const t = s.map((f) => f.h[h].t), c = s.map((f) => f.h[h].c);
  const mt = media(t), mc = media(c);
  let num = 0, dt = 0, dc = 0;
  for (let i = 0; i < t.length; i++) { num += (t[i] - mt) * (c[i] - mc); dt += (t[i] - mt) ** 2; dc += (c[i] - mc) ** 2; }
  console.log(`${String(h).padStart(4)} d  corr(t,c) = ${(num / Math.sqrt(dt * dc)).toFixed(3)}  ·  sd(t)=${sd(t).toFixed(3)}  sd(c)=${sd(c).toFixed(3)}  sd(d)=${sd(s.map((f) => f.h[h].d)).toFixed(3)}`);
}
