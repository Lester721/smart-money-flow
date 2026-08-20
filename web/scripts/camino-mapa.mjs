// CAMINO · PASO 4 — EL MAPA DE DECISIÓN, y su cruce.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/camino-mapa.mjs
//
// La pregunta del encargo no es "¿qué umbral va mejor?" sino "¿EXISTE UN MOMENTO en que ya se
// sabe que el día va mal?". Se responde así: en cada estado (hora × distancia al corto) se
// comparan las dos únicas cosas que se pueden hacer —aguantar hasta el cierre o salir AHORA al
// precio real de esa marca— y se mira cuál deja más dinero. Eso es un mapa, no un umbral.
//
// Y el mapa se cruza entero: se dibuja con 2022-2023 y se aplica tal cual a 2024-2026, y al revés.
// Un umbral elegido a ojo puede acertar de casualidad; un mapa de 30 casillas que se sostiene en
// el otro período ya no.
//
// Precios reales en las dos direcciones: al salir se recompra al ASK y se vende al BID.

import { radiografia } from "../lib/radiografia";
import { listonT, tWelch } from "../lib/barreraHallazgos";
import { cargar, media, pct, eur, peorRacha, periodo, P1, P2, COMM, PATAS, EFECTIVO } from "./camino-lib.mjs";

const dias = cargar();
const ULTIMA = "15:45";
for (const d of dias) {
  d.iFin = d.h.indexOf(ULTIMA);
  d.mC = d.sp.map((s) => d.KC - s);
  d.mP = d.sp.map((s) => s - d.KP);
}
radiografia(dias, ["pl", "cred", "cierre"], "mapa");

const HOR = [["11:00-11:55", "11:00", "12:00"], ["12:00-12:55", "12:00", "13:00"], ["13:00-13:55", "13:00", "14:00"], ["14:00-14:55", "14:00", "15:00"], ["15:00-15:45", "15:00", "15:50"]];
const MAR = [["más de 15", 15, 999], ["10 a 15", 10, 15], ["5 a 10", 5, 10], ["0 a 5", 0, 5], ["−10 a 0", -10, 0], ["roto >10", -999, -10]];
const cubHora = (h) => HOR.findIndex(([, a, b]) => h >= a && h < b);
const cubMar = (m) => MAR.findIndex(([, a, b]) => m >= a && m < b);
const clave = (ih, im) => `${ih}|${im}`;

const perdCall = (S, K, ala) => Math.min(Math.max(S - K, 0), ala - K);
const perdPut = (S, K, ala) => Math.min(Math.max(K - S, 0), K - ala);

// ═══ 1 · EL MAPA DEL CÓNDOR ENTERO ═══════════════════════════════════════════════════════════
/** Para cada estado: cuánto deja aguantar y cuánto deja salir ahora, sobre los días del grupo. */
function mapaEntero(sel) {
  const cel = new Map();
  for (const d of sel) {
    for (let i = 0; i <= d.iFin; i++) {
      if (d.sal[i] == null) continue;
      const ih = cubHora(d.h[i]), im = cubMar(Math.min(d.mC[i], d.mP[i]));
      if (ih < 0 || im < 0) continue;
      const k = clave(ih, im);
      if (!cel.has(k)) cel.set(k, { agu: [], sal: [] });
      const c = cel.get(k);
      c.agu.push(d.pl);
      c.sal.push((d.cred - d.sal[i]) * 100 - PATAS * COMM);
    }
  }
  return cel;
}

/** Simula un grupo de días con un mapa: sale en la PRIMERA marca cuya casilla dice "salir". */
function simular(sel, salirEn) {
  return sel.map((d) => {
    for (let i = 0; i <= d.iFin; i++) {
      if (d.sal[i] == null) continue;
      const ih = cubHora(d.h[i]), im = cubMar(Math.min(d.mC[i], d.mP[i]));
      if (ih < 0 || im < 0) continue;
      if (salirEn.has(clave(ih, im))) return (d.cred - d.sal[i]) * 100 - PATAS * COMM;
    }
    return d.pl;
  });
}

// ═══ 2 · EL MAPA POR LADOS ═══════════════════════════════════════════════════════════════════
function mapaLado(sel) {
  const cel = new Map();
  for (const d of sel) {
    for (let i = 0; i <= d.iFin; i++) {
      for (const [m, coste, perd] of [
        [d.mC[i], d.salC[i], perdCall(d.cierre, d.KC, d.KCL)],
        [d.mP[i], d.salP[i], perdPut(d.cierre, d.KP, d.KPL)],
      ]) {
        if (coste == null) continue;
        const ih = cubHora(d.h[i]), im = cubMar(m);
        if (ih < 0 || im < 0) continue;
        const k = clave(ih, im);
        if (!cel.has(k)) cel.set(k, { agu: [], sal: [] });
        const c = cel.get(k);
        c.agu.push(-perd * 100);          // lo que cuesta esa vertical si se aguanta
        c.sal.push(-coste * 100);         // lo que cuesta cerrarla ahora
      }
    }
  }
  return cel;
}

function simularLado(sel, salirEn) {
  return sel.map((d) => {
    let cC = null, cP = null;
    for (let i = 0; i <= d.iFin; i++) {
      const ih = cubHora(d.h[i]);
      if (ih < 0) continue;
      if (cC == null && d.salC[i] != null) { const im = cubMar(d.mC[i]); if (im >= 0 && salirEn.has(clave(ih, im))) cC = d.salC[i]; }
      if (cP == null && d.salP[i] != null) { const im = cubMar(d.mP[i]); if (im >= 0 && salirEn.has(clave(ih, im))) cP = d.salP[i]; }
    }
    const a = cC ?? perdCall(d.cierre, d.KC, d.KCL);
    const b = cP ?? perdPut(d.cierre, d.KP, d.KPL);
    return (d.cred - a - b) * 100 - PATAS * COMM;
  });
}

// ═══ el mapa sobre TODO, sólo para mirarlo ═══════════════════════════════════════════════════
console.log(`\n═══ 1 · EL MAPA · ¿en qué estado sale a cuenta salir? (los 1.121 días, sólo para verlo) ═══`);
console.log(`\nCada casilla: [nº de marcas] aguantar → salir ahora. En verde mental las que ganan saliendo.\n`);
const mapaTodo = mapaEntero(dias);
console.log(`| margen \\ hora | ${HOR.map((x) => x[0]).join(" | ")} |`);
console.log(`|---|${HOR.map(() => "---").join("|")}|`);
for (let im = 0; im < MAR.length; im++) {
  const cols = HOR.map((_, ih) => {
    const c = mapaTodo.get(clave(ih, im));
    if (!c || c.agu.length < 20) return c ? `n=${c.agu.length} (pocas)` : "—";
    const dif = media(c.sal) - media(c.agu);
    return `n=${c.agu.length} · ${eur(media(c.agu))} → ${eur(media(c.sal))} · ${dif > 0 ? "+" : ""}${eur(dif)}`;
  });
  console.log(`| ${MAR[im][0]} | ${cols.join(" | ")} |`);
}

console.log(`\n\n═══ 2 · EL MISMO MAPA, PERO POR LADOS (cada vertical por su cuenta) ═══\n`);
const mapaLadoTodo = mapaLado(dias);
console.log(`| margen del lado \\ hora | ${HOR.map((x) => x[0]).join(" | ")} |`);
console.log(`|---|${HOR.map(() => "---").join("|")}|`);
for (let im = 0; im < MAR.length; im++) {
  const cols = HOR.map((_, ih) => {
    const c = mapaLadoTodo.get(clave(ih, im));
    if (!c || c.agu.length < 20) return c ? `n=${c.agu.length} (pocas)` : "—";
    const dif = media(c.sal) - media(c.agu);
    return `n=${c.agu.length} · ${eur(media(c.agu))} → ${eur(media(c.sal))} · ${dif > 0 ? "+" : ""}${eur(dif)}`;
  });
  console.log(`| ${MAR[im][0]} | ${cols.join(" | ")} |`);
}

// ═══ EL CRUCE ════════════════════════════════════════════════════════════════════════════════
const grupo = { [P1]: dias.filter((d) => periodo(d.f) === P1), [P2]: dias.filter((d) => periodo(d.f) === P2) };
const metricas = (p) => ({
  n: p.length, total: p.reduce((a, x) => a + x, 0), anual: (p.reduce((a, x) => a + x, 0) / p.length) * 252,
  p1: pct(p, 0.01), p5: pct(p, 0.05), peor: Math.min(...p), racha: peorRacha(p),
  gan: p.filter((x) => x > 0).length / p.length,
});
const base = Object.fromEntries(Object.entries(grupo).map(([k, v]) => [k, metricas(v.map((d) => d.pl))]));

const PRUEBAS = 4;   // dos mapas × dos direcciones. El mapa se aplica ENTERO, no casilla a casilla.
console.log(`\n\n═══ 3 · EL CRUCE · ${PRUEBAS} pruebas · listón de |t| = ${listonT(PRUEBAS)} ═══`);
console.log(`\nSe dibuja el mapa con UN período (salir en las casillas donde salir dejó más dinero, con`);
console.log(`al menos 20 marcas) y se aplica TAL CUAL al otro. Sin tocar una casilla.\n`);

const filas = [];
for (const [nom, hazMapa, simula] of [["cóndor entero", mapaEntero, simular], ["por lados", mapaLado, simularLado]]) {
  for (const [aj, pb] of [[P1, P2], [P2, P1]]) {
    const m = hazMapa(grupo[aj]);
    const salirEn = new Set();
    for (const [k, c] of m) if (c.agu.length >= 20 && media(c.sal) > media(c.agu)) salirEn.add(k);
    const mAj = metricas(simula(grupo[aj], salirEn));
    const mPb = metricas(simula(grupo[pb], salirEn));
    const t = tWelch(simula(grupo[pb], salirEn), grupo[pb].map((d) => d.pl));
    console.log(`── mapa "${nom}" dibujado en ${aj} (${salirEn.size} casillas de salida de ${m.size}) ──`);
    console.log(`   en ${aj} (ajuste): ${eur(mAj.anual)}/año · peor día ${eur(mAj.peor)} · p5 ${eur(mAj.p5)} · racha ${eur(mAj.racha)}   [base ${eur(base[aj].anual)}/año, peor ${eur(base[aj].peor)}, racha ${eur(base[aj].racha)}]`);
    console.log(`   en ${pb} (PRUEBA): ${eur(mPb.anual)}/año · peor día ${eur(mPb.peor)} · p5 ${eur(mPb.p5)} · racha ${eur(mPb.racha)}   [base ${eur(base[pb].anual)}/año, peor ${eur(base[pb].peor)}, racha ${eur(base[pb].racha)}]`);
    const ingPerdido = base[pb].total - mPb.total, caidaQuit = Math.abs(base[pb].racha) - Math.abs(mPb.racha);
    console.log(`   PRECIO fuera de muestra: ${caidaQuit > 0 ? (ingPerdido / caidaQuit).toFixed(2) + " $ de ingreso por cada $ de caída quitado" : "no quita caída"} · t vs base ${t.toFixed(2)}\n`);
    filas.push({ nom, aj, pb, mAj, mPb, t, casillas: [...salirEn] });
  }
}

// ═══ ¿COINCIDEN LOS DOS MAPAS? ═══════════════════════════════════════════════════════════════
console.log(`\n═══ 4 · ¿DICEN LO MISMO LOS DOS PERÍODOS? ═══\n`);
for (const nom of ["cóndor entero", "por lados"]) {
  const a = new Set(filas.find((f) => f.nom === nom && f.aj === P1).casillas);
  const b = new Set(filas.find((f) => f.nom === nom && f.aj === P2).casillas);
  const comunes = [...a].filter((k) => b.has(k));
  console.log(`  ${nom}: ${a.size} casillas de salida en 22-23, ${b.size} en 24-26, ${comunes.length} coinciden.`);
  const nombre = (k) => { const [ih, im] = k.split("|").map(Number); return `${HOR[ih][0]} & ${MAR[im][0]}`; };
  console.log(`    sólo en 22-23: ${[...a].filter((k) => !b.has(k)).map(nombre).join(" · ") || "ninguna"}`);
  console.log(`    sólo en 24-26: ${[...b].filter((k) => !a.has(k)).map(nombre).join(" · ") || "ninguna"}`);
  console.log(`    en las dos:    ${comunes.map(nombre).join(" · ") || "ninguna"}\n`);
}

// ═══ EL MAPA COMÚN — lo único que se puede llevar a la mesa ══════════════════════════════════
console.log(`\n═══ 5 · SI SÓLO SE USAN LAS CASILLAS QUE SALEN EN LOS DOS PERÍODOS ═══\n`);
for (const nom of ["cóndor entero", "por lados"]) {
  const a = new Set(filas.find((f) => f.nom === nom && f.aj === P1).casillas);
  const b = new Set(filas.find((f) => f.nom === nom && f.aj === P2).casillas);
  const comun = new Set([...a].filter((k) => b.has(k)));
  if (!comun.size) { console.log(`  ${nom}: no hay casillas comunes.\n`); continue; }
  const sim = nom === "cóndor entero" ? simular : simularLado;
  const t = { [P1]: metricas(sim(grupo[P1], comun)), [P2]: metricas(sim(grupo[P2], comun)) };
  const todo = metricas(sim(dias, comun));
  console.log(`  ${nom} · ${comun.size} casillas comunes`);
  console.log(`    22-23: ${eur(t[P1].anual)}/año · peor ${eur(t[P1].peor)} · p5 ${eur(t[P1].p5)} · racha ${eur(t[P1].racha)}`);
  console.log(`    24-26: ${eur(t[P2].anual)}/año · peor ${eur(t[P2].peor)} · p5 ${eur(t[P2].p5)} · racha ${eur(t[P2].racha)}`);
  console.log(`    TODO : ${eur(todo.anual)}/año · peor ${eur(todo.peor)} · p1 ${eur(todo.p1)} · p5 ${eur(todo.p5)} · racha ${eur(todo.racha)} · ${(todo.gan * 100).toFixed(0)}% de días ganados`);
  const cont = Math.max(0, Math.min(Math.floor(EFECTIVO / Math.abs(todo.racha)), 14));
  console.log(`    con $${EFECTIVO.toLocaleString("es-ES")} de efectivo: ${cont} contratos → ${cont ? eur(todo.anual * cont) + "/año" : "no cabe ni uno"}\n`);
}
const baseTodo = metricas(dias.map((d) => d.pl));
console.log(`  base (aguantar siempre) · TODO: ${eur(baseTodo.anual)}/año · peor ${eur(baseTodo.peor)} · p1 ${eur(baseTodo.p1)} · p5 ${eur(baseTodo.p5)} · racha ${eur(baseTodo.racha)}`);
