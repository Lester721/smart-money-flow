// TENDENCIA-OTRA-VEZ · PASO 4 — el cruce en las dos direcciones.
import { readFileSync } from "node:fs";
const { tabla, baseA, baseB, nReglas } = JSON.parse(readFileSync("scripts/tend-rejilla.json", "utf8"));
const eur = (x) => `$${Math.round(x).toLocaleString("es-ES")}`;
const pc = (x) => `${(x * 100).toFixed(0)}%`;

// La familia del percentil móvil sólo existe desde 2022-12-05: se mide aparte (paso 5).
const T = tabla.filter((t) => !t.fam.startsWith("pct"));
console.log(`reglas en la rejilla principal: ${T.length} (de ${nReglas}; las ${nReglas - T.length} del percentil móvil van aparte)`);

// ═══ CRITERIOS DE ELECCIÓN — escritos ANTES de mirar el período de prueba ═══
const CRITERIOS = [
  { n: "coste (Δingreso por $ de racha)", ok: (m, b) => m.pctOp >= 0.40 && m.peorRacha >= b.peorRacha * 0.75, val: (m, b, c) => c.ratio },
  { n: "peor racha",                      ok: (m, b) => m.pctOp >= 0.40, val: (m) => -m.peorRacha },
  { n: "peor día",                        ok: (m, b) => m.pctOp >= 0.40, val: (m) => -m.peorDia },
  { n: "percentil 5",                     ok: (m, b) => m.pctOp >= 0.40, val: (m) => -m.p5 },
  { n: "ingreso $/año",                   ok: (m, b) => m.pctOp >= 0.40, val: (m) => -m.ano },
];

function elegir(dir, crit) {   // dir "A" entrena en A, prueba en B
  const ent = dir === "A" ? "A" : "B", pru = dir === "A" ? "B" : "A";
  const bEnt = dir === "A" ? baseA : baseB, bPru = dir === "A" ? baseB : baseA;
  let mejor = null;
  for (const t of T) {
    const m = t[ent], c = dir === "A" ? t.cA : t.cB;
    if (!crit.ok(m, bEnt)) continue;
    const v = crit.val(m, bEnt, c);
    if (!Number.isFinite(v)) continue;
    if (!mejor || v < mejor.v) mejor = { t, v, m, c };
  }
  return mejor ? { ...mejor, bEnt, bPru, ent, pru, mPru: mejor.t[pru],
                   cPru: dir === "A" ? mejor.t.cB : mejor.t.cA } : null;
}

for (const dir of ["A", "B"]) {
  const etEnt = dir === "A" ? "2022-2023" : "2024-2026", etPru = dir === "A" ? "2024-2026" : "2022-2023";
  console.log(`\n${"═".repeat(100)}\n  ELIGIENDO EN ${etEnt}  →  PROBANDO EN ${etPru}\n${"═".repeat(100)}`);
  for (const crit of CRITERIOS) {
    const r = elegir(dir, crit);
    if (!r) { console.log(`\n· criterio "${crit.n}": ninguna regla cumple los requisitos.`); continue; }
    console.log(`\n· criterio "${crit.n}"  →  regla elegida: ${r.t.id}`);
    console.log(`    ${etEnt} (donde se eligió): opera ${pc(r.m.pctOp)} de los días · ${eur(r.m.ano)}/año (base ${eur(r.bEnt.ano)}) · racha ${eur(r.m.peorRacha)} (base ${eur(r.bEnt.peorRacha)}) · peor día ${eur(r.m.peorDia)} · p5 ${eur(r.m.p5)} · >$2k ${r.m.n2000} · >$4k ${r.m.n4000}`);
    console.log(`    ${etPru} (FUERA DE MUESTRA)  : opera ${pc(r.mPru.pctOp)} · ${eur(r.mPru.ano)}/año (base ${eur(r.bPru.ano)}) · racha ${eur(r.mPru.peorRacha)} (base ${eur(r.bPru.peorRacha)}) · peor día ${eur(r.mPru.peorDia)} · p5 ${eur(r.mPru.p5)} · >$2k ${r.mPru.n2000} · >$4k ${r.mPru.n4000}`);
    const mejRacha = r.mPru.peorRacha > r.bPru.peorRacha, mejIng = r.mPru.ano >= r.bPru.ano;
    console.log(`    veredicto fuera de muestra: racha ${mejRacha ? "MEJORA" : "EMPEORA"} (${eur(r.mPru.peorRacha - r.bPru.peorRacha)}) · ingreso ${mejIng ? "aguanta" : "cae"} (${eur(r.mPru.ano - r.bPru.ano)}/año)`);
  }
}

// ═══ EL BARRIDO COMPLETO: ¿existe ALGUNA regla que ayude en LOS DOS PERÍODOS? ═══
console.log(`\n${"═".repeat(100)}\n  BARRIDO — ¿alguna de las ${T.length} reglas mejora la caída en LOS DOS períodos?\n${"═".repeat(100)}`);
const cond = [
  { n: "reduce la peor racha ≥25% en A y en B", f: (t) => t.A.peorRacha >= baseA.peorRacha * 0.75 && t.B.peorRacha >= baseB.peorRacha * 0.75 },
  { n: "…y opera ≥40% de los días", f: (t) => t.A.pctOp >= 0.4 && t.B.pctOp >= 0.4 },
  { n: "…y no destruye el ingreso (≥ base − $2.000/año en los dos)", f: (t) => t.A.ano >= baseA.ano - 2000 && t.B.ano >= baseB.ano - 2000 },
  { n: "…y baja el peor día en los dos", f: (t) => t.A.peorDia > baseA.peorDia && t.B.peorDia > baseB.peorDia },
  { n: "…y baja el p5 en los dos", f: (t) => t.A.p5 > baseA.p5 && t.B.p5 > baseB.p5 },
];
let vivas = T;
for (const c of cond) { vivas = vivas.filter(c.f); console.log(`  ${String(vivas.length).padStart(5)} sobreviven a: ${c.n}`); }
if (vivas.length) {
  vivas.sort((x, y) => (y.A.ano + y.B.ano) - (x.A.ano + x.B.ano));
  console.log(`\n  las 15 mejores de las ${vivas.length} supervivientes (ordenadas por ingreso total):`);
  console.log("  | regla | opera A/B | $/año A | $/año B | racha A | racha B | peor día A/B |");
  console.log("  |---|---|---|---|---|---|---|");
  for (const t of vivas.slice(0, 15))
    console.log(`  | ${t.id} | ${pc(t.A.pctOp)}/${pc(t.B.pctOp)} | ${eur(t.A.ano)} | ${eur(t.B.ano)} | ${eur(t.A.peorRacha)} | ${eur(t.B.peorRacha)} | ${eur(t.A.peorDia)}/${eur(t.B.peorDia)} |`);
}

// ═══ LA REGLA HISTÓRICA que murió: "no operar por debajo de la MA20 ni de la MA50" ═══
console.log(`\n${"═".repeat(100)}\n  LA REGLA QUE YA MURIÓ, medida otra vez con 1.121 días\n${"═".repeat(100)}`);
for (const N of [20, 50]) {
  const t = T.find((x) => x.id === `MA${N} ≥ 0%`);
  if (!t) continue;
  console.log(`  MA${N} ≥ 0%  ·  A: opera ${pc(t.A.pctOp)} ${eur(t.A.ano)}/año racha ${eur(t.A.peorRacha)}  |  B: opera ${pc(t.B.pctOp)} ${eur(t.B.ano)}/año racha ${eur(t.B.peorRacha)}`);
}
