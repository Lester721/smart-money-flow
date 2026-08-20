// TENDENCIA-OTRA-VEZ · PASO 3 — la rejilla completa y EL CRUCE.
//
// REGLA DE HIERRO: se elige con un período delante y se aplica al otro SIN TOCAR NADA.
// Nada de lo que decide la entrada se observa después de las 11:00:
//   · las medias móviles terminan en el cierre de AYER
//   · el nivel es el spot de las 11:00
//   · el straddle es el de las 11:00
//   · el percentil móvil usa sólo días anteriores
import { readFileSync, writeFileSync } from "node:fs";
import { listonT, tWelch } from "../lib/barreraHallazgos.ts";

const { filas, largos } = JSON.parse(readFileSync("scripts/tend-filas.json", "utf8"));
filas.sort((a, b) => a.fecha.localeCompare(b.fecha));

const A = filas.filter((f) => f.fecha < "2024-01-01");   // 2022-2023
const B = filas.filter((f) => f.fecha >= "2024-01-01");  // 2024-2026
console.log(`período A (2022-2023): ${A.length} días · período B (2024-2026): ${B.length} días`);

// ── métricas de una selección de días dentro de un período ──
const P = (v, q) => v[Math.min(v.length - 1, Math.max(0, Math.round((v.length - 1) * q)))];
function metricas(periodo, pasa) {
  const pls = [];
  let acum = 0, pico = 0, peorRacha = 0;
  for (const f of periodo) {
    const p = pasa(f) ? f.pl : 0;
    if (pasa(f)) pls.push(f.pl);
    acum += p; pico = Math.max(pico, acum); peorRacha = Math.min(peorRacha, acum - pico);
  }
  const nTot = periodo.length, nOp = pls.length;
  const tot = pls.reduce((a, b) => a + b, 0);
  const ord = [...pls].sort((a, b) => a - b);
  const k5 = Math.max(1, Math.floor(nOp * 0.05));
  return {
    nTot, nOp, pctOp: nOp / nTot, total: tot, ano: tot / (nTot / 252),
    peorRacha, peorDia: nOp ? ord[0] : 0,
    p1: nOp ? P(ord, 0.01) : 0, p5: nOp ? P(ord, 0.05) : 0,
    es5: nOp ? ord.slice(0, k5).reduce((a, b) => a + b, 0) / k5 : 0,
    n2000: pls.filter((x) => x <= -2000).length, n4000: pls.filter((x) => x <= -4000).length,
    tasa2000: pls.filter((x) => x <= -2000).length / nTot,
    tasa4000: pls.filter((x) => x <= -4000).length / nTot,
  };
}

// ── PERCENTIL MÓVIL: la distancia de hoy comparada con las 200 sesiones ANTERIORES ──
// (lo que arregla el problema de unidades: un umbral fijo en % se endurece solo cuando cambia
//  el régimen; un percentil no.)
const VENT = 200;
const LARGOS_PCT = largos.filter((N) => N <= 50);
for (const N of LARGOS_PCT) {
  const hist = [];
  for (const f of filas) {
    const d = f["d" + N];
    if (hist.length >= VENT) {
      const ven = hist.slice(-VENT).sort((a, b) => a - b);
      let c = 0; for (const x of ven) if (x < d) c++;
      f["q" + N] = c / ven.length;
    } else f["q" + N] = null;
    hist.push(d);
  }
}
const conPct = filas.filter((f) => f["q" + LARGOS_PCT[0]] != null);
console.log(`percentil móvil disponible desde ${conPct[0].fecha} (${conPct.length} de ${filas.length} días)`);

// ── LA REJILLA ──
const UMB = []; for (let u = -5; u <= 5.0001; u += 0.5) UMB.push(+u.toFixed(2));      // %
const SIG = []; for (let u = -8; u <= 12.0001; u += 1) SIG.push(u);                    // σ del día
const QS  = [5,10,15,20,25,30,35,40,45,50];                                            // percentil

const reglas = [];
for (const N of largos) {
  for (const u of UMB) {
    reglas.push({ id: `MA${N} ≥ ${u}%`, fam: "encima", N, u, f: (x) => x["d" + N] * 100 >= u });
    reglas.push({ id: `MA${N} ≤ ${u}%`, fam: "debajo", N, u, f: (x) => x["d" + N] * 100 <= u });
  }
  for (let i = 0; i < UMB.length; i++) for (let j = i + 1; j < UMB.length; j++) {
    const lo = UMB[i], hi = UMB[j];
    reglas.push({ id: `MA${N} en [${lo}%,${hi}%]`, fam: "banda", N, u: lo, u2: hi,
                  f: (x) => { const d = x["d" + N] * 100; return d >= lo && d <= hi; } });
  }
  for (const u of SIG) {
    reglas.push({ id: `MA${N} ≥ ${u}σ`, fam: "sigma+", N, u, f: (x) => x["s" + N] >= u });
    reglas.push({ id: `MA${N} ≤ ${u}σ`, fam: "sigma-", N, u, f: (x) => x["s" + N] <= u });
  }
}
for (const N of LARGOS_PCT) for (const q of QS) {
  reglas.push({ id: `MA${N} percentil ≥ ${q}`, fam: "pct+", N, u: q, f: (x) => x["q" + N] != null && x["q" + N] * 100 >= q });
  reglas.push({ id: `MA${N} percentil ≤ ${100 - q}`, fam: "pct-", N, u: 100 - q, f: (x) => x["q" + N] != null && x["q" + N] * 100 <= 100 - q });
}
console.log(`\nPRUEBAS DECLARADAS: ${reglas.length} reglas × 2 direcciones del cruce`);
console.log(`listón de t (Bonferroni, ${reglas.length} pruebas) = ${listonT(reglas.length)}`);

const baseA = metricas(A, () => true), baseB = metricas(B, () => true), baseT = metricas(filas, () => true);
const eur = (x) => `$${Math.round(x).toLocaleString("es-ES")}`;
console.log(`\nSIN FILTRO`);
console.log(`  A 2022-23 : ${eur(baseA.ano)}/año · racha ${eur(baseA.peorRacha)} · peor día ${eur(baseA.peorDia)} · p5 ${eur(baseA.p5)} · ES5 ${eur(baseA.es5)} · >$2k ${baseA.n2000} · >$4k ${baseA.n4000}`);
console.log(`  B 2024-26 : ${eur(baseB.ano)}/año · racha ${eur(baseB.peorRacha)} · peor día ${eur(baseB.peorDia)} · p5 ${eur(baseB.p5)} · ES5 ${eur(baseB.es5)} · >$2k ${baseB.n2000} · >$4k ${baseB.n4000}`);
console.log(`  TODO      : ${eur(baseT.ano)}/año · racha ${eur(baseT.peorRacha)} · peor día ${eur(baseT.peorDia)} · p5 ${eur(baseT.p5)} · ES5 ${eur(baseT.es5)} · >$2k ${baseT.n2000} · >$4k ${baseT.n4000}`);

// ── evaluar TODAS las reglas en los dos períodos ──
const tabla = [];
for (const r of reglas) {
  const mA = metricas(A, r.f), mB = metricas(B, r.f);
  tabla.push({ id: r.id, fam: r.fam, N: r.N, u: r.u, u2: r.u2 ?? null, A: mA, B: mB });
}
console.log(`evaluadas ${tabla.length} reglas en los dos períodos.`);

// coste = $ de ingreso perdido al año por cada $ de racha eliminada
function coste(m, base) {
  const dIng = base.ano - m.ano;             // >0 = ingreso perdido
  const dCai = base.peorRacha - m.peorRacha; // >0 = racha mejorada (menos negativa)
  return { dIng, dCai, ratio: dCai > 0 ? dIng / dCai : (dIng <= 0 ? -Infinity : Infinity) };
}
for (const t of tabla) { t.cA = coste(t.A, baseA); t.cB = coste(t.B, baseB); }

writeFileSync("scripts/tend-rejilla.json", JSON.stringify({ tabla, baseA, baseB, baseT, nReglas: reglas.length }));
console.log("escrito scripts/tend-rejilla.json");
