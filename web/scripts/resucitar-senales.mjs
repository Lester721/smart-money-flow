// LAS SEÑALES MUERTAS, MEDIDAS OTRA VEZ CON EL VEHÍCULO BARATO.
//
// ═══ POR QUÉ MERECE REPETIRLO ═══════════════════════════════════════════════════════════════
//
// Muchas señales de este proyecto murieron no por no separar, sino porque el vehículo con el que
// se cobraban se comía la ventaja. El caso más claro: el hallazgo del flujo daba +0,68% y resultó
// ser exactamente la horquilla.
//
// Ahora hay un vehículo distinto y medido: **la esquina barata** —5% fuera del dinero, ~90 días,
// salir a los ~23— que sobre 6.924 operaciones y 10 años da un cono de **+1,0% (t=0,71)**. Es
// decir: es JUSTO. No regala nada pero tampoco se come nada.
//
// Eso baja el listón de forma decisiva: una señal ya no tiene que superar un peaje del 26,9%,
// sólo tiene que separar más del **1%**. Señales que se descartaron por no llegar a t=3 separaban
// bastante más que eso.
//
// ═══ QUÉ SE PRUEBA ══════════════════════════════════════════════════════════════════════════
//
// Señales construibles SÓLO desde la cadena, que es lo que tenemos para 27 tickers y 10 años:
//   · interés abierto lejos del dinero (el "puente" que se retiró porque el fichero venía truncado)
//   · el sesgo (skew): qué se paga más, la protección o la apuesta
//   · la estructura temporal: IV corta contra IV larga
//   · el ratio put/call de interés abierto
//   · el momento del subyacente (3 meses), como control conocido
//
// LA MEDIDA: transversal DENTRO de cada mes — se ordenan los tickers por la señal y se compara el
// tercio alto contra el bajo comprando la MISMA esquina. Así la deriva del mercado se cancela y lo
// que queda es la selección.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/resucitar-senales.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const OTM = 5, DTE_OBJ = 90, DTE_TOL = 25, SALIR = 23, ASK_MIN = 0.10;

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const pct = (x) => (x * 100).toFixed(1) + "%";
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);

const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
const TICKERS = [...diasPorSim.keys()].sort();

const cache = new Map();
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  if (cache.has(k)) { const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  const v = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  cache.set(k, v);
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return v;
}
function spotDe(c) {
  let k = null, dm = Infinity;
  for (const g of Object.values(c)) for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const K = Number(cl.slice(0, -2)); const p = g[`${K}|P`];
    if (!p) continue;
    const d = Math.abs((ba[0] + ba[1]) / 2 - (p[0] + p[1]) / 2);
    if (d < dm) { dm = d; k = K; }
  }
  return k;
}

/** Compra la esquina barata y la vende a los 23 días. Precios reales: ask al comprar, bid al vender. */
function esquina(sym, dia, tipo) {
  const c = cadena(sym, dia);
  if (!c) return null;
  const sp = spotDe(c);
  if (!sp) return null;
  const dias = diasPorSim.get(sym);
  const i = dias.indexOf(dia);
  if (i < 0 || i + SALIR >= dias.length) return null;
  const diaSalida = dias[i + SALIR];
  const obj = tipo === "C" ? sp * (1 + OTM / 100) : sp * (1 - OTM / 100);
  let mejor = null, mejorD = Infinity;
  for (const [exp, g] of Object.entries(c)) {
    const dte = Math.round((ms(exp) - ms(dia)) / 86_400_000);
    if (Math.abs(dte - DTE_OBJ) > DTE_TOL) continue;
    for (const [clave, ba] of Object.entries(g)) {
      if (clave.slice(-1) !== tipo) continue;
      const K = Number(clave.slice(0, -2));
      if (!(ba[1] >= ASK_MIN)) continue;
      const d = Math.abs(K - obj) / sp + Math.abs(dte - DTE_OBJ) / 1000;
      if (d < mejorD) { mejorD = d; mejor = { exp, clave, ask: ba[1] }; }
    }
  }
  if (!mejor) return null;
  const salida = cadena(sym, diaSalida)?.[mejor.exp]?.[mejor.clave]?.[0] ?? 0;
  return (salida - mejor.ask) / mejor.ask;
}

// ── LAS SEÑALES, todas desde la cadena y observables el día de entrar ───────
function senales(sym, dia) {
  const c = cadena(sym, dia);
  if (!c) return null;
  const sp = spotDe(c);
  if (!sp) return null;

  let oiLejosC = 0, oiLejosP = 0, ivCorta = [], ivLarga = [];
  let primaCallLejos = 0, primaPutLejos = 0;
  for (const [exp, g] of Object.entries(c)) {
    const dte = Math.round((ms(exp) - ms(dia)) / 86_400_000);
    if (dte < 5) continue;
    for (const [clave, ba] of Object.entries(g)) {
      const K = Number(clave.slice(0, -2));
      const tipo = clave.slice(-1);
      const dist = (K - sp) / sp;
      const mid = (ba[0] + ba[1]) / 2;
      if (!(mid > 0)) continue;
      // "lejos" = más del 10% fuera. Es donde vive la apuesta direccional, no la cobertura ATM.
      if (tipo === "C" && dist > 0.10) { oiLejosC += mid; primaCallLejos += mid; }
      if (tipo === "P" && dist < -0.10) { oiLejosP += mid; primaPutLejos += mid; }
      // estructura temporal: la prima relativa de lo cercano al dinero, corta contra larga
      if (Math.abs(dist) < 0.03) { (dte < 45 ? ivCorta : ivLarga).push(mid / sp); }
    }
  }
  const totalLejos = primaCallLejos + primaPutLejos;
  return {
    // el sesgo: ¿se paga más por apostar al alza o por protegerse? >0 = más calls
    sesgo: totalLejos > 0 ? (primaCallLejos - primaPutLejos) / totalLejos : null,
    // estructura temporal: >1 = lo corto se paga relativamente más caro (miedo inmediato)
    estructura: ivCorta.length && ivLarga.length ? media(ivCorta) / media(ivLarga) : null,
    // cuánta prima total vive lejos del dinero, normalizada por el precio
    apuestaLejos: totalLejos / sp,
  };
}

// ── construir el panel (ticker, mes) ────────────────────────────────────────
console.log(`\n## Construyendo el panel · ${TICKERS.length} tickers\n`);
const filas = [];
for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym);
  const vistos = new Set();
  // el momento de 3 meses necesita el precio de hace ~63 sesiones
  for (let i = 0; i < dias.length; i++) {
    const d = dias[i];
    const mes = d.slice(0, 6);
    if (vistos.has(mes)) continue;
    vistos.add(mes);
    const s = senales(sym, d);
    if (!s) continue;
    const c = cadena(sym, d); const sp = c ? spotDe(c) : null;
    const cAntes = i >= 63 ? cadena(sym, dias[i - 63]) : null;
    const spAntes = cAntes ? spotDe(cAntes) : null;
    const call = esquina(sym, d, "C"), put = esquina(sym, d, "P");
    if (call == null || put == null) continue;
    filas.push({ sym, mes, ...s, momento: sp && spAntes ? sp / spAntes - 1 : null, call, put, cono: (call + put) / 2 });
  }
  process.stdout.write(`\r   ${sym} · ${filas.length} filas   `);
}
console.log(`\n\n${filas.length.toLocaleString("es-ES")} filas (ticker × mes)\n`);

// ── medir: transversal dentro de cada mes, tercio alto contra bajo ──────────
function medir(nombre, campo, vehiculo) {
  const porMes = new Map();
  for (const f of filas) {
    if (f[campo] == null || !isFinite(f[campo])) continue;
    if (!porMes.has(f.mes)) porMes.set(f.mes, []);
    porMes.get(f.mes).push(f);
  }
  const altos = [], bajos = [];
  for (const g of porMes.values()) {
    if (g.length < 6) continue;
    const o = [...g].sort((a, b) => b[campo] - a[campo]);
    const k = Math.floor(o.length / 3);
    for (const x of o.slice(0, k)) altos.push(x[vehiculo]);
    for (const x of o.slice(-k)) bajos.push(x[vehiculo]);
  }
  if (altos.length < 100) { console.log(`| ${nombre} | ${altos.length} | muestra corta | | |`); return null; }
  const dif = media(altos) - media(bajos);
  const se = Math.sqrt(sd(altos) ** 2 / altos.length + sd(bajos) ** 2 / bajos.length);
  const t = dif / se;
  console.log(`| ${nombre} | ${altos.length} | ${pct(media(altos))} | ${pct(media(bajos))} | **${pct(dif)}** | ${t.toFixed(2)} |`);
  return { nombre, dif, t, n: altos.length };
}

const res = [];
for (const [veh, et] of [["call", "COMPRANDO LA CALL"], ["put", "COMPRANDO LA PUT"], ["cono", "EL CONO (sin dirección)"]]) {
  console.log(`### ${et}\n`);
  console.log("| señal | n | tercio alto | tercio bajo | separación | t |");
  console.log("|---|---|---|---|---|---|");
  for (const [nom, campo] of [["sesgo (más calls que puts lejos)", "sesgo"], ["estructura temporal", "estructura"], ["prima lejos del dinero", "apuestaLejos"], ["momento 3 meses", "momento"]]) {
    const r = medir(nom, campo, veh);
    if (r) res.push({ ...r, vehiculo: veh });
  }
  console.log("");
}


// ── ¿ELIGE MOMENTOS O ELIGE TICKERS? ───────────────────────────────────────
// Si el tercio alto es siempre la misma media docena de nombres, no hay señal: hay una lista
// de acciones que se movieron mucho y que ELEGIMOS nosotros hace meses.
function tercioAlto(campo) {
  const porMes = new Map();
  for (const f of filas) { if (f[campo] == null || !isFinite(f[campo])) continue; if (!porMes.has(f.mes)) porMes.set(f.mes, []); porMes.get(f.mes).push(f); }
  return porMes;
}
console.log("### ¿La señal elige MOMENTOS o elige TICKERS?");
console.log("");
for (const campo of ["apuestaLejos", "momento"]) {
  const porMes = tercioAlto(campo);
  const cuenta = new Map(); let total = 0;
  for (const g of porMes.values()) {
    if (g.length < 6) continue;
    const o = [...g].sort((a, b) => b[campo] - a[campo]); const k = Math.floor(o.length / 3);
    for (const x of o.slice(0, k)) { cuenta.set(x.sym, (cuenta.get(x.sym) ?? 0) + 1); total++; }
  }
  const top = [...cuenta].sort((a, b) => b[1] - a[1]).slice(0, 6);
  console.log(`  ${campo} — los 6 que más caen en el tercio alto:`);
  for (const [t, n] of top) console.log(`     ${t.padEnd(6)} ${n} meses (${((n / total) * 100).toFixed(1)}% del tercio)`);
  console.log(`     los 6 juntos: ${((top.reduce((a, x) => a + x[1], 0) / total) * 100).toFixed(1)}% de todas las selecciones`);
  console.log(`     tickers distintos que aparecen: ${cuenta.size} de ${TICKERS.length}`);
  console.log("");
}

// LA PRUEBA QUE DECIDE: quitar los 3 que más pesan y volver a medir.
console.log("### La misma señal SIN los 3 tickers que más aportan");
console.log("");
console.log("| señal | vehículo | con todos | sin los 3 | ¿sobrevive? |");
console.log("|---|---|---|---|---|");
for (const [campo, nom] of [["apuestaLejos", "prima lejos"], ["momento", "momento 3m"]]) {
  const porMes = tercioAlto(campo);
  const cuenta = new Map();
  for (const g of porMes.values()) {
    if (g.length < 6) continue;
    const o = [...g].sort((a, b) => b[campo] - a[campo]); const k = Math.floor(o.length / 3);
    for (const x of o.slice(0, k)) cuenta.set(x.sym, (cuenta.get(x.sym) ?? 0) + 1);
  }
  const fuera = new Set([...cuenta].sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]));
  for (const veh of ["call", "cono"]) {
    const conTodos = [], sinEllos = [];
    for (const g of porMes.values()) {
      if (g.length < 6) continue;
      const o = [...g].sort((a, b) => b[campo] - a[campo]); const k = Math.floor(o.length / 3);
      const alt = o.slice(0, k), baj = o.slice(-k);
      conTodos.push(media(alt.map((x) => x[veh])) - media(baj.map((x) => x[veh])));
      const a2 = alt.filter((x) => !fuera.has(x.sym)), b2 = baj.filter((x) => !fuera.has(x.sym));
      if (a2.length && b2.length) sinEllos.push(media(a2.map((x) => x[veh])) - media(b2.map((x) => x[veh])));
    }
    const c1 = media(conTodos), c2 = media(sinEllos);
    const ok = Math.abs(c2) > 0.01 && Math.sign(c2) === Math.sign(c1);
    console.log(`| ${nom} | ${veh} | ${pct(c1)} | ${pct(c2)} | ${ok ? "sí" : "**NO**"} | (fuera: ${[...fuera].join(", ")})`);
  }
}
console.log("");

// ── EL VEREDICTO CONTRA EL LISTÓN NUEVO ────────────────────────────────────
// El cono al azar dio +1,0%. Una señal sirve si separa MÁS que eso, con signo estable.
const buenas = res.filter((r) => Math.abs(r.dif) > 0.01 && Math.abs(r.t) >= 2);
console.log(`${"═".repeat(78)}`);
console.log(`  LISTÓN: separar más del 1,0% (lo que da el cono al azar) con |t| ≥ 2`);
console.log(`  ${buenas.length} de ${res.length} lo superan\n`);
for (const b of buenas.sort((a, b2) => Math.abs(b2.dif) - Math.abs(a.dif))) {
  console.log(`    ${b.vehiculo.padEnd(5)} ${b.nombre.padEnd(34)} ${pct(b.dif).padStart(8)} · t ${b.t.toFixed(2)} · n ${b.n}`);
}
if (!buenas.length) console.log(`    ninguna — el vehículo barato no resucita a ninguna de estas cuatro`);
console.log(`\n  ⚠️  Esto NO es un hallazgo todavía: falta el cruce de períodos y el control contra`);
console.log(`      el azar. Es una criba para saber a cuáles vale la pena hacérselo.`);
console.log("═".repeat(78));
