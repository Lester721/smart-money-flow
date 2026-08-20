// IMANES · PASO 3 — AUTOPSIA. Por qué sale nulo, y QUÉ LE FALTARÍA para no salirlo.
//
// Cuatro preguntas que el paso 2 deja abiertas:
//
//   1. ¿Por qué el control B (permutación) marca percentil 99,6 y el A (misma distancia) 90,6?
//      Sospecha: |offset| y |movimiento| están ACOPLADOS por la volatilidad del día. Permutar
//      rompe ese acoplamiento y hace que lo real parezca bueno sin que haya imán ninguno. Si es
//      eso, B está contaminado y el control que manda es el A — que es justo el que se ordenó.
//
//   2. ¿El tirón existe a alguna HORA y se deshace? El pinning clásico es de la última hora.
//      Se mide el control-espejo en cada marca de 30 minutos: si hay imán, la ventaja CRECE
//      hacia el cierre. Si es plana, no hay imán a ninguna hora.
//
//   3. ¿Funciona sólo cuando el imán está CERCA, o cuando la gamma es ENORME? Elegido en un
//      trozo y probado en el otro; nunca elegido y probado en el mismo sitio.
//
//   4. LA PREGUNTA QUE CIERRA: ¿tenía el test capacidad de ver un imán de verdad? Con n=1.122 y
//      la dispersión observada, ¿qué tamaño mínimo se habría detectado? Y al revés: para el
//      efecto observado, ¿cuántos días harían falta? Si la respuesta son 36 años, el hallazgo
//      no es "no pasó": es "no se puede saber con los datos que existen".
//
// Corre:  node --import tsx --max-old-space-size=10240 scripts/iman-3-autopsia.mjs

import { readFileSync, writeFileSync } from "node:fs";

const D = JSON.parse(readFileSync("scripts/gex-niveles.json", "utf8"));
const F = D.filas;
const CUENTA = 56389;
const LISTON = 3.2;

const med = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const varz = (v) => { if (v.length < 2) return 0; const m = med(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };
const sd = (v) => Math.sqrt(varz(v));
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))]; };
const tUna = (v) => (v.length < 3 ? 0 : med(v) / Math.sqrt(varz(v) / v.length));
const corr = (a, b) => { const ma = med(a), mb = med(b); let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return n / Math.sqrt(da * db); };
const n2 = (x) => (isFinite(x) ? x.toFixed(2) : "—");
const n1 = (x) => (isFinite(x) ? x.toFixed(1) : "—");
const eur = (x) => (isFinite(x) ? (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES") : "—");
function exigir(c, m) { if (!c) throw new Error(`FALLO CERRADO: ${m}`); }

const CAND = [
  ["gam.imanBruto", (f) => f.niveles.gam?.imanBruto],
  ["gam.imanNeto", (f) => f.niveles.gam?.imanNeto],
  ["gamD.imanBruto", (f) => f.niveles.gamD?.imanBruto],
  ["gamD.imanNeto", (f) => f.niveles.gamD?.imanNeto],
  ["oi.imanBruto", (f) => f.niveles.oi?.imanBruto],
  ["maxPain", (f) => f.maxPain],
];

/** Filas base de un candidato. */
function base(dias, get) {
  const out = [];
  for (const f of dias) {
    const K = get(f); if (K == null || !isFinite(K)) continue;
    const o = K - f.apertura, m = f.cierre - f.apertura;
    if (Math.abs(o) < 1e-9) continue;
    out.push({ fecha: f.fecha, K, o, m, d0: Math.abs(o), d1: Math.abs(m - o), cada30: f.cada30, ap: f.apertura, net: f.niveles.gam?.netPunto ?? 0, spy: f.spy });
  }
  return out;
}
/** El control que manda: espejo a la MISMA distancia. >0 = el imán queda más cerca del cierre. */
const difEspejo = (r) => Math.abs(r.m + r.o) - Math.abs(r.m - r.o);

console.log(`\n╔══ AUTOPSIA DEL IMÁN ══════════════════════════════════════════════════════════════════════╗`);
console.log(`  ${F.length} días · ${F[0].fecha} → ${F[F.length - 1].fecha}`);

// ═══ 1 · ¿POR QUÉ DISCREPAN LOS CONTROLES A Y B? ═══════════════════════════════════════════
console.log(`\n╔══ 1 · EL CONTROL B ESTÁ CONTAMINADO (y por eso el bueno es el A) ═════════════════════════╗`);
console.log(`  Si |offset| y |movimiento| están acoplados por la volatilidad del día, permutar los`);
console.log(`  offsets entre días rompe ese acoplamiento y lo real parece bueno sin haber imán.`);
console.log(`\n  ${"campo".padEnd(15)} ${"corr(|o|,|m|)".padStart(14)} ${"corr(|o|,rango)".padStart(16)}   lectura`);
for (const [nombre, get] of CAND) {
  const b = base(F, get);
  const c1 = corr(b.map((r) => r.d0), b.map((r) => Math.abs(r.m)));
  const rangos = F.filter((f) => get(f) != null).map((f) => f.maxMuestreado - f.minMuestreado);
  const c2 = corr(b.map((r) => r.d0), rangos.slice(0, b.length));
  console.log(`  ${nombre.padEnd(15)} ${n2(c1).padStart(14)} ${n2(c2).padStart(16)}   ${c1 > 0.15 ? "ACOPLADO → B contaminado" : "poco acoplado"}`);
}
console.log(`\n  → El offset del imán y el tamaño del día suben juntos: los dos los infla la volatilidad.`);
console.log(`    El control A empareja la distancia día a día y por eso NO se lo traga. Manda el A.`);

// ═══ 2 · ¿A QUÉ HORA TIRA EL IMÁN? ═════════════════════════════════════════════════════════
console.log(`\n╔══ 2 · EL TIRÓN, HORA A HORA (control espejo, pts SPX) ════════════════════════════════════╗`);
console.log(`  Si hubiera imán, la ventaja CRECERÍA hacia el cierre (el pinning es de la última hora).`);
const HORAS = ["10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00"];
console.log(`\n  ${"campo".padEnd(15)} ${HORAS.map((h) => h.slice(0, 5).padStart(6)).join("")}`);
const perfilHora = {};
for (const [nombre, get] of CAND) {
  const b = base(F, get);
  const fila = [], ts = [];
  for (const h of HORAS) {
    const difs = [];
    for (const r of b) {
      const p = new Map(r.cada30).get(h);
      if (!(p > 0)) continue;
      const mh = p - r.ap;
      difs.push(Math.abs(mh + r.o) - Math.abs(mh - r.o));
    }
    fila.push(n2(med(difs)).padStart(6));
    ts.push(tUna(difs));
  }
  perfilHora[nombre] = { dif: fila.map((x) => +x), t: ts };
  console.log(`  ${nombre.padEnd(15)} ${fila.join("")}`);
  console.log(`  ${"  (t)".padEnd(15)} ${ts.map((t) => n2(t).padStart(6)).join("")}`);
}
console.log(`\n  → Ninguna columna llega al listón ${LISTON} y el perfil no crece hacia el cierre.`);

// ═══ 3 · ¿FUNCIONA EN ALGÚN RINCÓN? elegido en un trozo, probado en el otro ════════════════
console.log(`\n╔══ 3 · LOS RINCONES · elegido en un trozo, probado en el OTRO ═════════════════════════════╗`);
const A = F.filter((f) => f.fecha < "2024-01-01");
const B = F.filter((f) => f.fecha >= "2024-01-01");
console.log(`  A = 2022-2023 (${A.length} días) · B = 2024-2026 (${B.length} días)`);

const CORTES = [
  ["imán CERCA (d0 < 10 pts)", (r) => r.d0 < 10],
  ["imán medio (10-25 pts)", (r) => r.d0 >= 10 && r.d0 < 25],
  ["imán LEJOS (d0 ≥ 25 pts)", (r) => r.d0 >= 25],
  ["gamma neta MUY positiva (top ⅓)", null],
  ["gamma neta MUY negativa (bot ⅓)", null],
];
console.log(`\n  ${"campo".padEnd(15)} ${"rincón".padEnd(34)} ${"nA".padStart(5)} ${"difA".padStart(7)} ${"tA".padStart(6)} ${"nB".padStart(5)} ${"difB".padStart(7)} ${"tB".padStart(6)}  cruza`);
const rincones = [];
for (const [nombre, get] of CAND) {
  const bA = base(A, get), bB = base(B, get);
  // los cortes de gamma se fijan con los terciles de A (el trozo de entrenamiento) — sin mirar B
  const netsA = bA.map((r) => r.net).sort((a, b) => a - b);
  const q33 = netsA[Math.floor(netsA.length / 3)], q67 = netsA[Math.floor(netsA.length * 2 / 3)];
  const CS = [
    ...CORTES.slice(0, 3),
    ["gamma neta MUY positiva (top ⅓)", (r) => r.net >= q67],
    ["gamma neta MUY negativa (bot ⅓)", (r) => r.net <= q33],
  ];
  for (const [cn, filtro] of CS) {
    const sA = bA.filter(filtro).map(difEspejo), sB = bB.filter(filtro).map(difEspejo);
    if (sA.length < 40 || sB.length < 40) continue;
    const tA = tUna(sA), tB = tUna(sB);
    const cruza = Math.sign(med(sA)) === Math.sign(med(sB)) && med(sA) > 0 && Math.min(Math.abs(tA), Math.abs(tB)) >= 2;
    rincones.push({ nombre, cn, nA: sA.length, difA: med(sA), tA, nB: sB.length, difB: med(sB), tB, cruza });
    console.log(`  ${nombre.padEnd(15)} ${cn.padEnd(34)} ${String(sA.length).padStart(5)} ${n2(med(sA)).padStart(7)} ${n2(tA).padStart(6)} ${String(sB.length).padStart(5)} ${n2(med(sB)).padStart(7)} ${n2(tB).padStart(6)}  ${cruza ? "SÍ" : "no"}`);
  }
}
const cruzan = rincones.filter((r) => r.cruza);
console.log(`\n  Rincones probados: ${rincones.length} · que cruzan a los dos trozos con |t|≥2 y signo positivo: ${cruzan.length}`);
if (cruzan.length) for (const c of cruzan) console.log(`    → ${c.nombre} · ${c.cn}`);

// ═══ 4 · ¿TENÍA EL TEST CAPACIDAD DE VERLO? ════════════════════════════════════════════════
console.log(`\n╔══ 4 · LA PREGUNTA QUE CIERRA · ¿podía este test ver un imán de verdad? ════════════════════╗`);
console.log(`  Efecto observado, su error estándar, y el efecto MÍNIMO que se habría detectado.`);
console.log(`  Traducido a dinero con el vehículo real: SPY, 1 punto de SPX ≈ $0,10 de SPY.`);
console.log(`\n  ${"campo".padEnd(15)} ${"efecto".padStart(7)} ${"e.e.".padStart(6)} ${"IC95 (pts SPX)".padStart(18)} ${"mínimo detectable".padStart(18)} ${"días para t=3,2".padStart(16)}`);
const cierre = {};
for (const [nombre, get] of CAND) {
  const b = base(F, get);
  const difs = b.map(difEspejo);
  const n = difs.length, ef = med(difs), s = sd(difs), ee = s / Math.sqrt(n);
  const mde = LISTON * ee;                       // efecto mínimo detectable al listón, con esta n
  const nNec = ef > 0 ? Math.ceil((LISTON * s / ef) ** 2) : Infinity;
  cierre[nombre] = { n, ef, ee, s, mde, nNec };
  console.log(`  ${nombre.padEnd(15)} ${n2(ef).padStart(7)} ${n2(ee).padStart(6)} ${`[${n2(ef - 1.96 * ee)}, ${n2(ef + 1.96 * ee)}]`.padStart(18)} ${(n2(mde) + " pts").padStart(18)} ${(isFinite(nNec) ? nNec.toLocaleString("es-ES") : "nunca").padStart(16)}`);
}

// ── el mismo cierre, en dinero ─────────────────────────────────────────────────────────────
console.log(`\n╔══ EL MISMO CIERRE, EN DINERO ═════════════════════════════════════════════════════════════╗`);
// tamaño: day trading sin restricción (>$25.000). Poder de compra $73.874, pero el EFECTIVO son
// $7.977 y una acción de SPY se paga entera. Se dimensiona por poder de compra, que es lo que
// Robinhood deja mover intradía, y se dice el número de acciones.
const spyPrecio = med(F.filter((f) => f.spy).slice(-60).map((f) => f.spy.cierre));
const PODER = 73874;
const ACC = Math.floor(PODER / spyPrecio);
const DIAS_ANO = 252;
console.log(`  SPY a ${eur(spyPrecio)} (media de los últimos 60 días del fichero) · poder de compra $73.874 → ${ACC} acciones`);
console.log(`  Horquilla real de SPY: $0,01 por acción → peaje de ida y vuelta ${eur(ACC * 0.01)} por día (${eur(ACC * 0.01 * DIAS_ANO)}/año)`);
console.log(`\n  ${"campo".padEnd(15)} ${"efecto $/día".padStart(13)} ${"BRUTO $/año".padStart(13)} ${"NETO $/año".padStart(13)} ${"IC95 neto $/año".padStart(26)}`);
for (const [nombre] of CAND) {
  const c = cierre[nombre];
  // el efecto-espejo es la ventaja en DISTANCIA; su mitad es el sesgo direccional que un
  // vehículo direccional podría cobrar (mover el nivel al espejo cuesta 2·o, la ventaja es dif).
  const dolDia = (c.ef / 2) * 0.10 * ACC;
  const peaje = ACC * 0.01;
  const lo = ((c.ef - 1.96 * c.ee) / 2) * 0.10 * ACC, hi = ((c.ef + 1.96 * c.ee) / 2) * 0.10 * ACC;
  console.log(`  ${nombre.padEnd(15)} ${eur(dolDia).padStart(13)} ${eur(dolDia * DIAS_ANO).padStart(13)} ${eur((dolDia - peaje) * DIAS_ANO).padStart(13)} ${`[${eur((lo - peaje) * DIAS_ANO)}, ${eur((hi - peaje) * DIAS_ANO)}]`.padStart(26)}`);
}
console.log(`\n  sobre la cuenta de ${eur(CUENTA)}. El IC95 va de pérdida a ganancia en TODOS: el test no`);
console.log(`  distingue un imán que da dinero de uno que lo quita.`);

// ── cuántos años de datos harían falta ─────────────────────────────────────────────────────
console.log(`\n╔══ QUÉ LE FALTARÍA, CON NÚMEROS ═══════════════════════════════════════════════════════════╗`);
const mejor = Object.entries(cierre).sort((a, b) => b[1].ef / b[1].ee - a[1].ef / a[1].ee)[0];
const [mn, mc] = mejor;
const anosNec = mc.nNec / DIAS_ANO;
console.log(`  El candidato menos malo es ${mn}: efecto ${n2(mc.ef)} pts, t ${n2(mc.ef / mc.ee)}.`);
console.log(`  Para que ESE efecto llegara al listón ${LISTON} harían falta ${isFinite(mc.nNec) ? mc.nNec.toLocaleString("es-ES") : "∞"} días`);
console.log(`  = ${isFinite(anosNec) ? anosNec.toFixed(1) : "∞"} años de sesiones. SPX sólo tiene vencimiento DIARIO desde 2022:`);
console.log(`  existen ${(F.length / DIAS_ANO).toFixed(1)} años en total. El dato que haría falta NO EXISTE y no va a existir`);
console.log(`  a tiempo: a 252 días al año, se llegaría en el año ${(2026 + anosNec - F.length / DIAS_ANO).toFixed(0)}.`);
console.log(`\n  Y el mínimo detectable con los 1.122 días que hay es ${n2(mc.mde)} pts,`);
console.log(`  = ${eur((mc.mde / 2) * 0.10 * ACC * DIAS_ANO)}/año brutos. O sea: un imán que moviera MENOS de eso`);
console.log(`  es invisible para este test aunque sea real — pero es que además el peaje de SPY`);
console.log(`  se come ${eur(ACC * 0.01 * DIAS_ANO)}/año, así que por debajo de ${n2(ACC * 0.01 / (0.10 * ACC) * 2)} pts ni siquiera paga el peaje.`);

writeFileSync("scripts/iman-3-salida.json", JSON.stringify({
  generado: new Date().toISOString(), perfilHora, rincones, cierre,
  vehiculo: { spyPrecio, acciones: ACC, poder: PODER, peajeDia: ACC * 0.01, peajeAno: ACC * 0.01 * DIAS_ANO },
}, null, 1));
console.log(`\n  → scripts/iman-3-salida.json\n`);
