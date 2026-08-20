// ═══════════════════════════════════════════════════════════════════════════════════════════
// RESPETAR · GIRO (3) — EL CRUCE INTRADÍA. La única versión de la hipótesis que quedaba viva.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/gex-giro-medir3.mjs
//
// ═══ POR QUÉ HACE FALTA UNA TERCERA PASADA ═════════════════════════════════════════════════
// Las dos primeras clasifican el día por dónde ABRE respecto al giro. Resultado, reproducido hoy
// al dígito: en crudo el día que abre por debajo tiene un rango 1,30–1,42× mayor (t = 7,8 a 10,2,
// percentil 100 contra el azar, sobrevive al cruce de mitades) — pero el straddle ATM de las 09:35
// YA cobra esa diferencia (0,632% abajo contra 0,447% arriba, t=11–13). Con la elasticidad puesta
// por los datos (0,86–1,24) el efecto residual de estar abajo es t = −1,8 a +2,24 contra un listón
// de 3,17: NADA. Y en dólares, −$15.498 a −$32.878 al año, percentil 6–31 contra el azar.
//
// O sea: la clasificación de APERTURA es un termómetro de volatilidad, y el termómetro ya está
// dentro del precio. Pero eso NO es lo que hace un day trader. Lo que hace es esperar a que el
// precio ROMPA el giro a media sesión. Ese suceso permite la única comparación que el confuso del
// régimen no puede contaminar:
//
//        LOS 60 MINUTOS DE DESPUÉS CONTRA LOS 60 MINUTOS DE ANTES, DEL MISMO DÍA.
//
// El nivel de volatilidad de ese día, su VIX, su straddle, sus noticias: todo eso es idéntico a
// los dos lados del cruce. Se cancela por construcción, sin dividir por nada y sin asumir ninguna
// elasticidad. Si la gamma negativa amplifica, el cociente después/antes tiene que ser > 1 al
// romper hacia ABAJO y < 1 al romper hacia ARRIBA. Es la prueba más limpia que admiten estos datos.
//
// ═══ REGLAS ════════════════════════════════════════════════════════════════════════════════
//  · Nada del futuro: el giro es el de gex-niveles.json — OI sellado antes de las 09:15 (cierre de
//    ayer) e IV real de la barra de 09:35. El cruce se detecta según avanza la cinta, no después.
//  · UN SOLO SUCESO POR DÍA (el primero que cumple la ventana). Nada de inflar la n con entradas
//    del mismo día.
//  · CONTROL: (a) ESPEJO — el mismo |distancia| al otro lado. (b) BARAJA — 500 sorteos repartiendo
//    la distancia de un día al camino de OTRO. (c) LADO AL AZAR — lo que pide el encargo al pie de
//    la letra, con su pega dicha: la mitad de los sorteos cae sobre el nivel de verdad y diluye.
//  · MUESTRA PARTIDA 2022-2023 / 2024-2026 en las DOS direcciones.
//  · Dólares con precios REALES: straddle ATM al ASK de la barra del cruce → intrínseco al cierre.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from "node:fs";

const NIV = "scripts/gex-niveles.json";
const CAM = "scripts/gex-giro-camino.json";
const SALIDA = "scripts/gex-giro-resultado3.json";
const CUENTA = 56389;
const SORTEOS = 500;
const VENT = 12;                 // 12 barras de 5 min = 60 minutos a cada lado
const PRUEBAS_DECLARADAS = 48;   // 32 de las dos pasadas anteriores + 16 nuevas de ésta

// ── estadística ────────────────────────────────────────────────────────────────────────────
const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const varianza = (v) => { if (v.length < 2) return NaN; const m = media(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };
const sd = (v) => Math.sqrt(varianza(v));
const pct = (v, p) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))]; };
const mediana = (v) => pct(v, 50);
const eur = (x) => (x == null || !Number.isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));

/** t de una muestra contra un valor de referencia. */
function tUna(v, ref) {
  if (v.length < 3) return { t: NaN, n: v.length, m: NaN };
  const s = sd(v) / Math.sqrt(v.length);
  return { t: s > 0 ? (media(v) - ref) / s : NaN, n: v.length, m: media(v) };
}
function welch(a, b) {
  if (a.length < 3 || b.length < 3) return { t: NaN, n1: a.length, n2: b.length };
  const se = Math.sqrt(varianza(a) / a.length + varianza(b) / b.length);
  return { t: se > 0 ? (media(a) - media(b)) / se : NaN, n1: a.length, n2: b.length };
}
function listonT(pruebas) {
  if (pruebas <= 1) return 2;
  const p = 0.05 / pruebas / 2, t = Math.sqrt(-2 * Math.log(p));
  return Math.round((t - (2.30753 + 0.27061 * t) / (1 + 0.99229 * t + 0.04481 * t * t)) * 100) / 100;
}
const LISTON = listonT(PRUEBAS_DECLARADAS);
function rng(s) { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function exigir(c, m) { if (!c) throw new Error(`FALLO CERRADO: ${m}`); }

// ═══ 1 · RADIOGRAFÍA y CRUCE DE CONTROL del fichero nuevo ══════════════════════════════════
const J = JSON.parse(readFileSync(NIV, "utf8"));
const CAMINO = JSON.parse(readFileSync(CAM, "utf8"));

console.log("\n" + "═".repeat(98));
console.log("RESPETAR · GIRO (3) — el CRUCE intradía: 60 minutos después contra 60 minutos antes");
console.log("═".repeat(98));
console.log(`\n## 1 · RADIOGRAFÍA de ${CAM} y cruce de control contra ${NIV}`);

let difAp = 0, difCi = 0, difMax = 0, nCruce = 0, barrasMal = 0, sinStr = 0, nStr = 0;
for (const f of J.filas) {
  const c = CAMINO[f.fecha];
  if (!c) continue;
  nCruce++;
  if (c.h.length !== 78) barrasMal++;
  difAp = Math.max(difAp, Math.abs(c.px[0] - f.apertura));
  difCi = Math.max(difCi, Math.abs(c.px[c.px.length - 1] - f.cierre));
  difMax = Math.max(difMax, Math.abs(Math.max(...c.px) - f.maxMuestreado));
  for (let i = 0; i < c.sAsk.length; i++) { nStr++; if (c.sAsk[i] == null) sinStr++; }
}
console.log(`   días cruzados: ${nCruce} de ${J.filas.length} · días con un número de barras distinto de 78: ${barrasMal}`);
console.log(`   diferencia MÁXIMA camino vs niveles →  apertura ${difAp.toFixed(4)} · cierre ${difCi.toFixed(4)} · máximo ${difMax.toFixed(4)}`);
console.log(`   barras sin straddle cotizado: ${sinStr} de ${nStr} (${((sinStr / nStr) * 100).toFixed(2)}%) — se saltan, no se rellenan`);
exigir(difAp < 0.011 && difCi < 0.011 && difMax < 0.011, "el camino de 5 min no cuadra con gex-niveles.json");
exigir(barrasMal === 0, `${barrasMal} días con un número de barras distinto de 78`);
exigir(nCruce === J.filas.length, `faltan ${J.filas.length - nCruce} días de camino`);

// ═══ 2 · CONSTRUIR LOS SUCESOS DE CRUCE ════════════════════════════════════════════════════
/** Primer cruce del nivel con ventana COMPLETA a los dos lados. null si no lo hay. */
function primerCruce(px, nivel) {
  if (!(nivel > 0)) return null;
  const arriba0 = px[0] > nivel;
  for (let j = 1; j < px.length; j++) {
    const arriba = px[j] > nivel;
    if (arriba === arriba0) continue;
    if (j < VENT || j + VENT >= px.length) return null;   // sin ventana completa no se mide
    return { j, baja: arriba0 };                          // baja = venía de ARRIBA y rompió hacia abajo
  }
  return null;
}
/** Camino recorrido (suma de |rendimientos| de 5 min) en % del precio. */
function recorrido(px, a, b) {
  let s = 0;
  for (let i = a + 1; i <= b; i++) s += Math.abs(px[i] - px[i - 1]) / px[i - 1];
  return s * 100;
}
const rangoV = (px, a, b) => { let mx = -Infinity, mn = Infinity; for (let i = a; i <= b; i++) { if (px[i] > mx) mx = px[i]; if (px[i] < mn) mn = px[i]; } return ((mx - mn) / px[a]) * 100; };

const IDX = new Map(J.filas.map((f, i) => [f.fecha, i]));

function sucesos(nivelDe) {
  const S = [];
  for (const f of J.filas) {
    const c = CAMINO[f.fecha];
    if (!c) continue;
    const nivel = nivelDe(f);
    const cr = primerCruce(c.px, nivel);
    if (!cr) continue;
    const { j, baja } = cr;
    const antes = recorrido(c.px, j - VENT, j), despues = recorrido(c.px, j, j + VENT);
    if (!(antes > 0)) continue;
    S.push({
      fecha: f.fecha, ano: +f.fecha.slice(0, 4), j, hora: c.h[j], baja, nivel,
      antes, despues, coc: despues / antes,
      rAntes: rangoV(c.px, j - VENT, j), rDespues: rangoV(c.px, j, j + VENT),
      cont: ((c.px[j + VENT] - c.px[j]) / c.px[j]) * 100 * (baja ? -1 : 1),
      contCierre: ((c.px[c.px.length - 1] - c.px[j]) / c.px[j]) * 100 * (baja ? -1 : 1),
      sAsk: c.sAsk[j], sBid: c.sBid[j], sK: c.sK[j], cierre: c.px[c.px.length - 1],
    });
  }
  return S;
}
const NIVELES = { gam: (f) => f.niveles.gam.flip, gamD: (f) => f.niveles.gamD.flip };
const ESPEJO = {
  gam: (f) => (f.niveles.gam.flip == null ? null : f.apertura - f.niveles.gam.dFlip.pts),
  gamD: (f) => (f.niveles.gamD.flip == null ? null : f.apertura - f.niveles.gamD.dFlip.pts),
};

console.log(`\n## 2 · LOS SUCESOS — ¿cuántos días llegan a cruzar el giro con 60 min a cada lado?`);
console.log(`   ${"lente".padEnd(6)} ${"días".padStart(6)} ${"cruzan".padStart(7)} ${"%".padStart(6)} ${"rompe abajo".padStart(12)} ${"rompe arriba".padStart(13)} ${"hora mediana".padStart(13)} ${"|dist| mediana".padStart(15)}`);
const SUC = {}, SUC_ESP = {};
for (const L of ["gam", "gamD"]) {
  SUC[L] = sucesos(NIVELES[L]);
  SUC_ESP[L] = sucesos(ESPEJO[L]);
  const S = SUC[L];
  const dist = J.filas.filter((f) => f.niveles[L].flip != null).map((f) => Math.abs(f.niveles[L].dFlip.pts));
  const horas = S.map((s) => s.hora).sort();
  console.log(`   ${L.padEnd(6)} ${String(J.filas.length).padStart(6)} ${String(S.length).padStart(7)} ${((S.length / J.filas.length) * 100).toFixed(1).padStart(5)}% ` +
    `${String(S.filter((s) => s.baja).length).padStart(12)} ${String(S.filter((s) => !s.baja).length).padStart(13)} ${horas[Math.floor(horas.length / 2)].padStart(13)} ${(mediana(dist).toFixed(1) + " pts").padStart(15)}`);
  exigir(S.length > 150, `sólo ${S.length} sucesos de cruce en ${L}`);
}
console.log(`   ESPEJO (mismo |distancia|, otro lado): gam ${SUC_ESP.gam.length} sucesos · gamD ${SUC_ESP.gamD.length}`);

const R = { generado: new Date().toISOString(), entrada: [NIV, CAM], nDias: J.filas.length, liston: LISTON, pruebasDeclaradas: PRUEBAS_DECLARADAS, sorteos: SORTEOS, ventanaMin: VENT * 5, cuenta: CUENTA };
R.sucesos = { gam: { n: SUC.gam.length, abajo: SUC.gam.filter((s) => s.baja).length }, gamD: { n: SUC.gamD.length, abajo: SUC.gamD.filter((s) => s.baja).length } };

// ═══ 3 · LA PRUEBA LIMPIA — cociente después/antes DEL MISMO DÍA ════════════════════════════
console.log(`\n## 3 · DESPUÉS / ANTES, EL MISMO DÍA — el régimen de volatilidad se cancela por construcción`);
console.log(`   hipótesis de Victor: romper hacia ABAJO (entrar en gamma negativa) → cociente > 1 · romper hacia ARRIBA → < 1`);
console.log(`   ${"lente".padEnd(6)} ${"rotura".padEnd(7)} ${"período".padEnd(11)} ${"n".padStart(5)} ${"antes %".padStart(8)} ${"después %".padStart(10)} ${"cociente".padStart(9)} ${"t vs 1".padStart(8)}  ${"t abajo−arriba".padStart(14)}`);
for (const L of ["gam", "gamD"]) {
  for (const [pn, pf] of [["2022-2026", () => true], ["2022-2023", (s) => s.ano <= 2023], ["2024-2026", (s) => s.ano >= 2024]]) {
    const g = SUC[L].filter(pf);
    const ab = g.filter((s) => s.baja), ar = g.filter((s) => !s.baja);
    const w = welch(ab.map((s) => Math.log(s.coc)), ar.map((s) => Math.log(s.coc)));
    R[`tDif|${L}|${pn}`] = { t: +w.t.toFixed(2), nAb: ab.length, nAr: ar.length };
    for (const [dn, dd] of [["ABAJO", ab], ["ARRIBA", ar]]) {
      const t1 = tUna(dd.map((s) => Math.log(s.coc)), 0);
      R[`coc|${L}|${dn}|${pn}`] = { n: dd.length, antes: +mediana(dd.map((s) => s.antes)).toFixed(3), despues: +mediana(dd.map((s) => s.despues)).toFixed(3), coc: +mediana(dd.map((s) => s.coc)).toFixed(3), t: +t1.t.toFixed(2) };
      console.log(`   ${L.padEnd(6)} ${dn.padEnd(7)} ${pn.padEnd(11)} ${String(dd.length).padStart(5)} ${mediana(dd.map((s) => s.antes)).toFixed(3).padStart(8)} ${mediana(dd.map((s) => s.despues)).toFixed(3).padStart(10)} ` +
        `${mediana(dd.map((s) => s.coc)).toFixed(3).padStart(9)} ${t1.t.toFixed(2).padStart(8)}${Math.abs(t1.t) >= LISTON ? " ←" : "  "} ${(dn === "ABAJO" ? w.t.toFixed(2) + (Math.abs(w.t) >= LISTON ? " ←" : "") : "").padStart(14)}`);
    }
  }
}

// ═══ 4 · CONTINUACIÓN CON SIGNO ════════════════════════════════════════════════════════════
console.log(`\n## 4 · CONTINUACIÓN CON SIGNO tras la rotura (+ = el precio SIGUE en el sentido roto)`);
console.log(`   ${"lente".padEnd(6)} ${"rotura".padEnd(7)} ${"período".padEnd(11)} ${"n".padStart(5)} ${"+60 min %".padStart(10)} ${"t".padStart(7)} ${"al cierre %".padStart(12)} ${"t".padStart(7)}`);
for (const L of ["gam", "gamD"]) {
  for (const [pn, pf] of [["2022-2026", () => true], ["2022-2023", (s) => s.ano <= 2023], ["2024-2026", (s) => s.ano >= 2024]]) {
    const g = SUC[L].filter(pf);
    for (const [dn, dd] of [["ABAJO", g.filter((s) => s.baja)], ["ARRIBA", g.filter((s) => !s.baja)]]) {
      const a = tUna(dd.map((s) => s.cont), 0), b = tUna(dd.map((s) => s.contCierre), 0);
      R[`cont|${L}|${dn}|${pn}`] = { n: dd.length, m60: +media(dd.map((s) => s.cont)).toFixed(4), t: +a.t.toFixed(2), mCie: +media(dd.map((s) => s.contCierre)).toFixed(4), tCie: +b.t.toFixed(2) };
      console.log(`   ${L.padEnd(6)} ${dn.padEnd(7)} ${pn.padEnd(11)} ${String(dd.length).padStart(5)} ${media(dd.map((s) => s.cont)).toFixed(4).padStart(10)} ${a.t.toFixed(2).padStart(7)}${Math.abs(a.t) >= LISTON ? "←" : " "} ` +
        `${media(dd.map((s) => s.contCierre)).toFixed(4).padStart(11)} ${b.t.toFixed(2).padStart(7)}${Math.abs(b.t) >= LISTON ? "←" : " "}`);
    }
  }
}

// ═══ 5 · CONTROL: ESPEJO y BARAJA ══════════════════════════════════════════════════════════
console.log(`\n## 5 · CONTROL CONTRA EL AZAR — mismo |distancia| al otro lado (espejo) y 500 barajas`);
console.log(`   la baraja reparte la distancia CON SIGNO del día i al camino del día j: conserva la`);
console.log(`   distribución de distancias y de lados, y rompe sólo el emparejamiento. Es el que manda.`);
console.log(`   ${"lente".padEnd(6)} ${"desenlace".padEnd(21)} ${"t real".padStart(7)} ${"t espejo".padStart(9)} ${"|t| p50".padStart(8)} ${"|t| p95".padStart(8)} ${"percentil".padStart(10)}  veredicto`);
const azar = rng(20260820);
function estad(S, cual) {
  const ab = S.filter((s) => s.baja), ar = S.filter((s) => !s.baja);
  if (ab.length < 3 || ar.length < 3) return NaN;
  if (cual === "coc") return welch(ab.map((s) => Math.log(s.coc)), ar.map((s) => Math.log(s.coc))).t;
  return welch(ab.map((s) => s.cont), ar.map((s) => s.cont)).t;
}
for (const L of ["gam", "gamD"]) {
  const conFlip = J.filas.filter((f) => f.niveles[L].flip != null);
  const pos = new Map(conFlip.map((f, i) => [f.fecha, i]));
  const dists = conFlip.map((f) => f.niveles[L].dFlip.pts);
  // Las 500 barajas se generan UNA vez y se reutilizan para los dos desenlaces: mismo nulo.
  const permutaciones = [];
  for (let k = 0; k < SORTEOS; k++) {
    const perm = dists.slice();
    for (let i = perm.length - 1; i > 0; i--) { const r = Math.floor(azar() * (i + 1)); [perm[i], perm[r]] = [perm[r], perm[i]]; }
    permutaciones.push(perm);
  }
  const nulosPor = { coc: [], cont: [] };
  for (const perm of permutaciones) {
    const S = sucesos((f) => { const i = pos.get(f.fecha); return i == null ? null : f.apertura + perm[i]; });
    nulosPor.coc.push(Math.abs(estad(S, "coc")));
    nulosPor.cont.push(Math.abs(estad(S, "cont")));
  }
  for (const cual of ["coc", "cont"]) {
    const real = estad(SUC[L], cual), esp = estad(SUC_ESP[L], cual);
    const nulos = nulosPor[cual].filter(Number.isFinite);
    const per = (nulos.filter((x) => x < Math.abs(real)).length / nulos.length) * 100;
    R[`azar|${L}|${cual}`] = { real: +real.toFixed(3), espejo: +esp.toFixed(3), p50: +mediana(nulos).toFixed(3), p95: +pct(nulos, 95).toFixed(3), percentil: +per.toFixed(1) };
    console.log(`   ${L.padEnd(6)} ${(cual === "coc" ? "cociente desp/antes" : "continuación 60 min").padEnd(21)} ${real.toFixed(2).padStart(7)} ${esp.toFixed(2).padStart(9)} ${mediana(nulos).toFixed(2).padStart(8)} ${pct(nulos, 95).toFixed(2).padStart(8)} ${per.toFixed(1).padStart(9)}%  ${per >= 95 ? "LE GANA AL AZAR" : "no le gana al azar"}`);
  }
}

// ═══ 6 · LADO AL AZAR — el control literal del encargo ══════════════════════════════════════
console.log(`\n## 6 · LADO AL AZAR (misma distancia, lado sorteado) — con su pega dicha:`);
console.log(`   la mitad de los sorteos cae EXACTAMENTE sobre el giro de verdad, así que el nulo sale`);
console.log(`   contaminado hacia el valor real. Control DÉBIL; el que manda es la baraja de arriba.`);
const azar2 = rng(20260821);
for (const L of ["gam", "gamD"]) {
  const conFlip = J.filas.filter((f) => f.niveles[L].flip != null);
  const pos = new Map(conFlip.map((f, i) => [f.fecha, i]));
  const dists = conFlip.map((f) => f.niveles[L].dFlip.pts);
  const nulosPor = { coc: [], cont: [] };
  for (let k = 0; k < SORTEOS; k++) {
    const sg = dists.map(() => (azar2() < 0.5 ? 1 : -1));
    const S = sucesos((f) => { const i = pos.get(f.fecha); return i == null ? null : f.apertura + sg[i] * Math.abs(dists[i]); });
    nulosPor.coc.push(Math.abs(estad(S, "coc")));
    nulosPor.cont.push(Math.abs(estad(S, "cont")));
  }
  for (const cual of ["coc", "cont"]) {
    const real = estad(SUC[L], cual), nulos = nulosPor[cual].filter(Number.isFinite);
    const per = (nulos.filter((x) => x < Math.abs(real)).length / nulos.length) * 100;
    R[`azarLado|${L}|${cual}`] = { real: +real.toFixed(3), p50: +mediana(nulos).toFixed(3), p95: +pct(nulos, 95).toFixed(3), percentil: +per.toFixed(1) };
    console.log(`   ${L.padEnd(6)} ${(cual === "coc" ? "cociente desp/antes" : "continuación 60 min").padEnd(21)} real ${real.toFixed(2).padStart(6)} · p50 ${mediana(nulos).toFixed(2)} · p95 ${pct(nulos, 95).toFixed(2)} · percentil ${per.toFixed(1)}%`);
  }
}

// ═══ 7 · DÓLARES SIN MODELO ════════════════════════════════════════════════════════════════
console.log(`\n## 7 · DÓLARES SIN MODELO — straddle ATM 0DTE al ASK REAL de la barra del cruce → intrínseco al cierre`);
console.log(`   comprar volatilidad al romper hacia abajo es la traducción literal de "la gamma negativa amplifica".`);
console.log(`   Liquidación del 0DTE de SPXW = |índice al cierre − strike| × 100. Sin modelo, sin punto medio.`);
console.log(`   ${"lente".padEnd(6)} ${"regla".padEnd(32)} ${"período".padEnd(11)} ${"n".padStart(5)} ${"coste med".padStart(10)} ${"$/op".padStart(9)} ${"$/año".padStart(11)} ${"acierto".padStart(8)} ${"t".padStart(7)} ${"peor día".padStart(10)}`);
const ANOS = { "2022-2026": 4.63, "2022-2023": 2, "2024-2026": 2.63 };
const REGLAS3 = [
  ["COMPRAR straddle al romper ABAJO", (s) => (s.baja ? +1 : null)],
  ["COMPRAR straddle al romper ARRIBA", (s) => (!s.baja ? +1 : null)],
  ["VENDER straddle al romper ARRIBA", (s) => (!s.baja ? -1 : null)],
  ["COMPRAR abajo + VENDER arriba", (s) => (s.baja ? +1 : -1)],
];
for (const L of ["gam", "gamD"]) {
  for (const [rn, rf] of REGLAS3) {
    for (const [pn, pf] of [["2022-2026", () => true], ["2022-2023", (s) => s.ano <= 2023], ["2024-2026", (s) => s.ano >= 2024]]) {
      const ops = [], costes = [];
      for (const s of SUC[L].filter(pf)) {
        const lado = rf(s);
        if (lado == null || s.sAsk == null || s.sBid == null) continue;
        const intr = Math.abs(s.cierre - s.sK) * 100;
        ops.push(lado > 0 ? intr - s.sAsk * 100 : s.sBid * 100 - intr);
        costes.push(s.sAsk * 100);
      }
      if (ops.length < 30) continue;
      const t1 = tUna(ops, 0);
      const alAno = ops.reduce((a, b) => a + b, 0) / ANOS[pn];
      R[`$|${L}|${rn}|${pn}`] = { n: ops.length, porOp: +media(ops).toFixed(1), alAno: Math.round(alAno), acierto: +((ops.filter((x) => x > 0).length / ops.length) * 100).toFixed(1), t: +t1.t.toFixed(2), peor: Math.round(Math.min(...ops)) };
      console.log(`   ${L.padEnd(6)} ${rn.padEnd(32)} ${pn.padEnd(11)} ${String(ops.length).padStart(5)} ${eur(mediana(costes)).padStart(10)} ${eur(media(ops)).padStart(9)} ${eur(alAno).padStart(11)} ${((ops.filter((x) => x > 0).length / ops.length) * 100).toFixed(1).padStart(7)}% ${t1.t.toFixed(2).padStart(7)}${Math.abs(t1.t) >= LISTON ? "←" : " "} ${eur(Math.min(...ops)).padStart(10)}`);
    }
  }
}
{
  const h = SUC.gam.filter((s) => s.sAsk != null);
  const horq = h.map((s) => ((s.sAsk - s.sBid) / ((s.sAsk + s.sBid) / 2)) * 100);
  R.peaje = { horquillaP25: +pct(horq, 25).toFixed(2), horquillaP50: +mediana(horq).toFixed(2), horquillaP75: +pct(horq, 75).toFixed(2), costeMediano: Math.round(mediana(h.map((s) => s.sAsk * 100))) };
  console.log(`\n   peaje REAL del straddle en la barra del cruce: horquilla p25 ${pct(horq, 25).toFixed(2)}% · mediana ${mediana(horq).toFixed(2)}% · p75 ${pct(horq, 75).toFixed(2)}% de la prima`);
  console.log(`   coste mediano de una entrada: ${eur(mediana(h.map((s) => s.sAsk * 100)))} por contrato · efectivo de la cuenta $7.977 · base $${CUENTA.toLocaleString("es-ES")}`);
}

// ═══ 8 · CUÁNTO EFECTO HARÍA FALTA — el hueco, en números ═══════════════════════════════════
console.log(`\n## 8 · QUÉ LE FALTA — el tamaño de efecto que haría falta para que esto fuese algo`);
for (const L of ["gam", "gamD"]) {
  const g = SUC[L];
  const ab = g.filter((s) => s.baja).map((s) => Math.log(s.coc)), ar = g.filter((s) => !s.baja).map((s) => Math.log(s.coc));
  const seDif = Math.sqrt(varianza(ab) / ab.length + varianza(ar) / ar.length);
  const necesaria = LISTON * seDif;
  // OJO: los sucesos NO pasan un día de cada uno — sólo el 19–20% de las sesiones llega a cruzar.
  // Convertir la n necesaria en años exige dividir por esa tasa, o el número sale 5 veces corto.
  const nNec = Math.round(g.length * (necesaria / Math.abs(media(ab) - media(ar))) ** 2);
  const tasa = g.length / J.filas.length;
  const anosNec = nNec / tasa / 252;
  R[`hueco|${L}`] = { difObservada: +(media(ab) - media(ar)).toFixed(4), difNecesaria: +necesaria.toFixed(4), cocObservado: +Math.exp(media(ab) - media(ar)).toFixed(3), cocNecesario: +Math.exp(necesaria).toFixed(3), nActual: g.length, nNecesaria: nNec, tasaCruce: +tasa.toFixed(3), anosNecesarios: +anosNec.toFixed(0) };
  console.log(`   ${L}: observado, el cociente después/antes de una rotura ABAJO es ${Math.exp(media(ab) - media(ar)).toFixed(3)}× el de una rotura ARRIBA.`);
  console.log(`         para pasar el listón con esta n (${g.length}) haría falta ${Math.exp(necesaria).toFixed(3)}×.`);
  console.log(`         con el efecto observado harían falta n≈${nNec} sucesos; como sólo cruza el ${(tasa * 100).toFixed(1)}% de las sesiones,`);
  console.log(`         eso son ${Math.round(nNec / tasa).toLocaleString("es-ES")} sesiones = ${anosNec.toFixed(0)} AÑOS de mercado. No es un problema de bajar más datos.`);
}

// ═══ 9 · VEREDICTO ═════════════════════════════════════════════════════════════════════════
console.log(`\n## 9 · VEREDICTO  (listón |t| ≥ ${LISTON} con ${PRUEBAS_DECLARADAS} pruebas declaradas en las TRES pasadas)`);
const pasan = Object.entries(R).filter(([k, v]) => v && typeof v === "object" && Number.isFinite(v.t) && Math.abs(v.t) >= LISTON).map(([k, v]) => `${k} t=${v.t}`);
const ganan = Object.entries(R).filter(([k, v]) => k.startsWith("azar|") && v.percentil >= 95).map(([k]) => k);
const dolPos = Object.entries(R).filter(([k, v]) => k.startsWith("$|") && v.alAno > 0).map(([k, v]) => `${k} ${eur(v.alAno)}/año t=${v.t}`);
console.log(`   pasan el listón: ${pasan.length ? pasan.join(" · ") : "NINGUNO"}`);
console.log(`   le ganan al azar (baraja, percentil ≥ 95): ${ganan.length ? ganan.join(" · ") : "NINGUNO"}`);
console.log(`   dólares con signo positivo: ${dolPos.length ? dolPos.join(" · ") : "NINGUNO"}`);
R.veredicto = { pasanListon: pasan, gananAlAzar: ganan, dolaresPositivos: dolPos };
writeFileSync(SALIDA, JSON.stringify(R, null, 1));
console.log(`\n   escrito: ${SALIDA}\n`);
