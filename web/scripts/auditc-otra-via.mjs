// AUDITORÍA — recálculo INDEPENDIENTE de la cesta (MODO=enteros, filtro) para 2016-2020.
//
// Escrito desde cero. No importa nada de cartera-cesta.mjs. Sólo lee:
//   · scripts/puente-filas.json          (las señales)
//   · scripts/cache-theta/cadenas/*.json (las cadenas crudas)
//
// Uso: node scripts/auditc-otra-via.mjs
//
// Además del número, imprime diagnósticos pensados para ROMPERLO:
//   · concentración: qué (acción,mes) y qué contratos producen el dinero
//   · SPLITS: contratos cuyo strike existe al vencimiento pero el subyacente se partió en medio
//   · VALOR INTRÍNSECO al vencimiento contra el bid registrado (si el bid >> intrínseco, dato malo)
//   · spot calculado por DOS vías distintas

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const PRESUPUESTO = 500;
const N = 3;
const OTM_MIN = 60, DTE_MIN = 365, ASK_MIN = 0.10, SPREAD_MAX = 0.40;
const DESDE = "201601", HASTA = "202012";

const aMs = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
const dias = (a, b) => Math.round((aMs(b) - aMs(a)) / 86400000);

// ── índice de días por símbolo ───────────────────────────────────────────────
const calendario = new Map();
for (const nombre of readdirSync(CDIR)) {
  const m = /^([A-Z]+)_d(\d{8})\.json$/.exec(nombre);
  if (!m) continue;
  let a = calendario.get(m[1]);
  if (!a) calendario.set(m[1], (a = []));
  a.push(m[2]);
}
for (const a of calendario.values()) a.sort();

const memo = new Map();
function leerCadena(sym, dia) {
  const k = sym + dia;
  if (memo.has(k)) return memo.get(k);
  const ruta = `${CDIR}/${sym}_d${dia}.json`;
  const v = existsSync(ruta) ? JSON.parse(readFileSync(ruta, "utf8")) : null;
  if (memo.size > 400) memo.delete(memo.keys().next().value);
  memo.set(k, v);
  return v;
}

/** Último día de cotización con fichero <= tope. null si no hay. */
function diaHasta(sym, tope) {
  const a = calendario.get(sym) || [];
  let lo = 0, hi = a.length - 1, r = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (a[m] <= tope) { r = a[m]; lo = m + 1; } else hi = m - 1; }
  return r;
}

/**
 * Spot por paridad put-call, VÍA DISTINTA a la del simulador: se usa SÓLO el vencimiento
 * más cercano con al menos 5 días, no la mezcla de todos.
 */
function spotCercano(cadena, dia) {
  let expElegido = null, mejorDte = Infinity;
  for (const exp of Object.keys(cadena)) {
    const d = dias(dia, exp);
    if (d < 5) continue;
    if (d < mejorDte) { mejorDte = d; expElegido = exp; }
  }
  if (!expElegido) return null;
  const g = cadena[expElegido];
  let mejor = null, dif = Infinity;
  for (const clave of Object.keys(g)) {
    if (!clave.endsWith("|C")) continue;
    const K = +clave.slice(0, -2);
    const p = g[K + "|P"];
    if (!p) continue;
    const c = g[clave];
    const d = Math.abs((c[0] + c[1]) / 2 - (p[0] + p[1]) / 2);
    if (d < dif) { dif = d; mejor = K; }
  }
  return mejor;
}

/** Spot por la vía del simulador (mezclando TODOS los vencimientos), para comparar. */
function spotTodos(cadena) {
  let mejor = null, dif = Infinity;
  for (const g of Object.values(cadena)) {
    for (const clave of Object.keys(g)) {
      if (!clave.endsWith("|C")) continue;
      const K = +clave.slice(0, -2);
      const p = g[K + "|P"];
      if (!p) continue;
      const c = g[clave];
      const d = Math.abs((c[0] + c[1]) / 2 - (p[0] + p[1]) / 2);
      if (d < dif) { dif = d; mejor = K; }
    }
  }
  return mejor;
}

/** Detector de split: mayor strike listado el día, sirve de escala del subyacente. */
function escala(cadena) {
  let mx = 0;
  for (const g of Object.values(cadena)) for (const c of Object.keys(g)) { const K = +c.slice(0, -2); if (K > mx) mx = K; }
  return mx;
}

// ── señales ──────────────────────────────────────────────────────────────────
const filas = JSON.parse(readFileSync("scripts/puente-filas.json", "utf8"))
  .filter((f) => f.gamLejos != null && f.mes >= DESDE && f.mes <= HASTA);
const porMes = new Map();
for (const f of filas) { let a = porMes.get(f.mes); if (!a) porMes.set(f.mes, (a = [])); a.push(f); }
const meses = [...porMes.keys()].sort();

// ── simulación ───────────────────────────────────────────────────────────────
let inv = 0, rec = 0, nPatas = 0, nGana = 0;
const porTM = [];              // contribución de cada (ticker, mes)
const operaciones = [];        // detalle de cada contrato comprado
const avisos = { spotDistinto: 0, sinCadenaSalida: 0, sinVencimientoEnSalida: 0, claveAusente: 0, escalaCambia: 0 };
let sinCesta = 0;

for (const mes of meses) {
  const elegidos = [...porMes.get(mes)].sort((a, b) => b.gamLejos - a.gamLejos).slice(0, N);
  for (const e of elegidos) {
    const sym = e.ticker;
    const listaDias = calendario.get(sym) || [];
    const delMes = listaDias.filter((d) => d.slice(0, 6) === mes);
    const diaEntrada = delMes.length ? delMes[delMes.length - 1] : null;
    if (!diaEntrada) { sinCesta++; continue; }
    const cadEnt = leerCadena(sym, diaEntrada);
    if (!cadEnt) { sinCesta++; continue; }

    const spA = spotCercano(cadEnt, diaEntrada);
    const spB = spotTodos(cadEnt);
    if (spA == null) { sinCesta++; continue; }
    if (spB != null && Math.abs(spA - spB) / spA > 0.03) avisos.spotDistinto++;
    const sp = spA;
    const escEnt = escala(cadEnt);

    const ultimoDato = listaDias[listaDias.length - 1];

    // candidatos
    const cand = [];
    for (const [exp, g] of Object.entries(cadEnt)) {
      if (dias(diaEntrada, exp) <= DTE_MIN) continue;
      if (exp > ultimoDato) continue;                 // aún viva: no se mide
      const diaSal = diaHasta(sym, exp);
      if (!diaSal) continue;
      for (const [clave, ba] of Object.entries(g)) {
        if (!clave.endsWith("|C")) continue;
        const K = +clave.slice(0, -2);
        if (!(K > sp * (1 + OTM_MIN / 100))) continue;
        const bid = ba[0], ask = ba[1];
        if (!(ask >= ASK_MIN)) continue;
        if (!((ask - bid) / ask <= SPREAD_MAX)) continue;
        cand.push({ exp, clave, K, ask, bid, diaSal });
      }
    }
    if (!cand.length) { sinCesta++; continue; }

    // MODO=enteros: uno de cada, del más barato al más caro, hasta agotar el presupuesto
    cand.sort((a, b) => a.ask - b.ask);
    let queda = PRESUPUESTO;
    let invTM = 0, recTM = 0;
    for (const c of cand) {
      const coste = c.ask * 100;
      if (coste > queda) continue;
      queda -= coste;

      const cadSal = leerCadena(sym, c.diaSal);
      let valor = 0, estado = "ok";
      if (!cadSal) { avisos.sinCadenaSalida++; estado = "sin-cadena"; }
      else {
        const gSal = cadSal[c.exp];
        if (!gSal) { avisos.sinVencimientoEnSalida++; estado = "sin-venc"; }
        else {
          const ba = gSal[c.clave];
          if (!ba) { avisos.claveAusente++; estado = "clave-ausente"; }
          else valor = ba[0];
        }
      }
      // diagnóstico de split e intrínseco
      const spSal = cadSal ? spotTodos(cadSal) : null;
      const escSal = cadSal ? escala(cadSal) : null;
      const partido = escEnt && escSal && (escEnt / escSal >= 1.8 || escSal / escEnt >= 1.8);
      if (partido) avisos.escalaCambia++;
      const intrin = spSal != null ? Math.max(0, spSal - c.K) : null;

      inv += coste; rec += valor * 100; nPatas++;
      invTM += coste; recTM += valor * 100;
      if (valor > c.ask) nGana++;
      operaciones.push({ sym, mes, exp: c.exp, K: c.K, ask: c.ask, salida: valor, coste, ingreso: valor * 100,
                          spEnt: sp, spSal, intrin, partido, estado, diaSal: c.diaSal });
    }
    porTM.push({ sym, mes, inv: invTM, rec: recTM, gam: e.gamLejos });
  }
}

const $ = (x) => "$" + Math.round(x).toLocaleString("es-ES");
console.log(`\n══ RECÁLCULO INDEPENDIENTE · filtro · MODO=enteros · ${DESDE}–${HASTA} ══\n`);
console.log(`${meses.length} meses · ${nPatas} patas · ${sinCesta} (acción,mes) sin cesta`);
console.log(`aciertos ${((nGana / nPatas) * 100).toFixed(0)}%`);
console.log(`INVERTIDO ${$(inv)}  →  RECUPERADO ${$(rec)}   =   ${(rec / inv).toFixed(2)}x\n`);

// año a año
const anios = new Map();
for (const t of porTM) { const a = t.mes.slice(0, 4); const x = anios.get(a) || { inv: 0, rec: 0 }; x.inv += t.inv; x.rec += t.rec; anios.set(a, x); }
console.log("── año a año ──");
for (const [a, x] of [...anios].sort()) console.log(`   ${a}  ${$(x.inv).padStart(9)} → ${$(x.rec).padStart(12)}  ${(x.rec / x.inv).toFixed(2)}x`);

console.log("\n── avisos ──");
console.log(JSON.stringify(avisos));

console.log("\n── CONCENTRACIÓN: los 12 (acción,mes) que más dinero devuelven ──");
for (const t of [...porTM].sort((a, b) => b.rec - a.rec).slice(0, 12))
  console.log(`   ${t.sym.padEnd(5)} ${t.mes}  gamLejos ${t.gam.toFixed(4)}  ${$(t.inv).padStart(7)} → ${$(t.rec).padStart(12)}  ${(t.rec / (t.inv || 1)).toFixed(1)}x`);

console.log("\n── CONCENTRACIÓN: los 15 CONTRATOS que más dinero devuelven ──");
for (const o of [...operaciones].sort((a, b) => b.ingreso - a.ingreso).slice(0, 15))
  console.log(`   ${o.sym.padEnd(5)} ${o.mes} K=${String(o.K).padStart(7)} venc ${o.exp} · spotEnt ${String(o.spEnt).padStart(7)} spotSal ${String(o.spSal).padStart(7)}` +
              ` · ask ${o.ask.toFixed(2)} → bid ${o.salida.toFixed(2)}  ${$(o.ingreso).padStart(10)}` +
              ` · intrínseco ${o.intrin == null ? "?" : o.intrin.toFixed(2)}${o.partido ? "  ⚠SPLIT" : ""}`);

// ¿el bid de salida es coherente con el intrínseco?
const malos = operaciones.filter((o) => o.intrin != null && o.salida > 0 && o.salida > o.intrin * 1.5 + 1);
const dineroMalo = malos.reduce((a, o) => a + o.ingreso, 0);
console.log(`\n── BID DE SALIDA MUY POR ENCIMA DEL INTRÍNSECO: ${malos.length} de ${operaciones.length} contratos, ${$(dineroMalo)} de ${$(rec)} (${((dineroMalo / rec) * 100).toFixed(1)}%)`);
for (const o of malos.sort((a, b) => b.ingreso - a.ingreso).slice(0, 10))
  console.log(`   ${o.sym} ${o.mes} K=${o.K} venc ${o.exp} salida ${o.diaSal} · bid ${o.salida} · spotSal ${o.spSal} · intrínseco ${o.intrin.toFixed(2)}`);

// ¿cuánto dinero viene de contratos que atraviesan un split?
const conSplit = operaciones.filter((o) => o.partido);
console.log(`\n── CONTRATOS QUE ATRAVIESAN UN CAMBIO DE ESCALA (split): ${conSplit.length}, devuelven ${$(conSplit.reduce((a, o) => a + o.ingreso, 0))}`);

// ¿la salida ocurre EL DÍA del vencimiento?
const desfase = operaciones.map((o) => dias(o.diaSal, o.exp));
const hist = {};
for (const d of desfase) hist[d] = (hist[d] || 0) + 1;
console.log(`\n── días entre el día de salida y el vencimiento: ${JSON.stringify(hist)}`);

// SIN los ganadores extremos
const orden = [...operaciones].sort((a, b) => b.ingreso - a.ingreso);
for (const k of [1, 3, 5, 10]) {
  const quitados = orden.slice(0, k);
  const i2 = inv - quitados.reduce((a, o) => a + o.coste, 0);
  const r2 = rec - quitados.reduce((a, o) => a + o.ingreso, 0);
  console.log(`   sin los ${String(k).padStart(2)} mejores contratos: ${(r2 / i2).toFixed(2)}x`);
}
