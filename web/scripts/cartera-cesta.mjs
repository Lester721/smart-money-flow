// CESTA + TRES ACCIONES + DOS VEHÍCULOS — la versión que arregla lo que rompí en la primera
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/cartera-cesta.mjs
//
// ═══ QUÉ SE ARREGLA RESPECTO A cartera-gamma.mjs ═══════════════════════════════════════════
//
// La primera simulación dio 6,27x para el filtro contra 7,01x del AZAR. Tres cosas la rompieron,
// y dos son culpa del diseño, no de la señal:
//
//   1. UN SOLO CONTRATO POR MES, elegido por mí (el más cercano a 60% fuera y 500 días). Esa
//      elección no la mide ninguna prueba: la inventé. La medición que SÍ pasó las cribas
//      promediaba TODOS los contratos del cubo ese mes. Al quedarme con uno le puse una lotería
//      encima de otra. → Ahora se compra LA CESTA ENTERA, a partes iguales.
//   2. UNA SOLA ACCIÓN AL MES → 43 operaciones en diez años. Con un pago de cola larga eso no
//      distingue nada. → Ahora las TRES mejores del mes.
//   3. (No se arregla y hay que decirlo) Intel se multiplicó por seis y sus tres entradas fueron
//      el 69% de toda la ganancia. Ninguna mejora del diseño crea sucesos que no ocurrieron.
//
// ═══ LOS DOS VEHÍCULOS, Y POR QUÉ ═════════════════════════════════════════════════════════
//
// El filtro mejora sobre todo la FRECUENCIA de acertar (34% contra 21%), no tanto el tamaño del
// premio (14,13x contra 12,05x). Pero comprar la call desnuda cobra en el TAMAÑO: el dinero sale
// de que una haga 60x. Puede que la señal sea buena y el vehículo esté mal elegido.
//
//   · CALL DESNUDA  — se compra la call del cubo y se aguanta. Paga por potencia.
//   · SPREAD DE CALLS — se compra la misma y se VENDE otra al doble de distancia, mismo
//                       vencimiento. Cuesta mucho menos, renuncia al 60x, y el acierto pesa más.
//                       Paga por puntería. Y Lester los opera de un botón en Robinhood.
//
// Los dos con precios reales: se paga el ASK de la que se compra y se cobra el BID de la que se
// vende; al cerrar, al revés. La horquilla está dentro de las dos patas.
//
// ═══ CRITERIO, ESCRITO ANTES DE CORRER ════════════════════════════════════════════════════
//
// El listón es el CONTROL AL AZAR, igual que antes: mismas reglas, mismos vehículos, pero eligiendo
// la acción al azar. Si el filtro no le gana al azar en los dos vehículos, no aporta.
//
// Nada mira al futuro: cada mes se ordenan las 28 acciones por la señal de ESE mes y se cogen las
// tres primeras. El azar usa semilla fija para que la prueba sea repetible.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { radiografia } from "../lib/radiografia";

const CDIR = "scripts/cache-theta/cadenas";
const POR_TICKER = Number(process.env.POR_TICKER || 500);   // dólares por acción y mes
const N_TICKERS = Number(process.env.N_TICKERS || 3);
const OTM_MIN = 60, DTE_MIN = 365;
const ASK_MIN = 0.10, SPREAD_MAX = 0.40;
const MODO = process.env.MODO || "fraccion";
const ms = (y) => Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`);

const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();

const cache = new Map();
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  const hit = cache.get(k);
  if (hit !== undefined) { cache.delete(k); cache.set(k, hit); return hit; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  const v = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  cache.set(k, v);
  if (cache.size > 250) cache.delete(cache.keys().next().value);
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
/** Último día con cadena en o antes del vencimiento. -1 si vence después de los datos. */
function idxVenc(sym, exp) {
  const dias = diasPorSim.get(sym) ?? [];
  if (!dias.length || exp > dias[dias.length - 1]) return -1;
  let lo = 0, hi = dias.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (dias[m] <= exp) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}

/**
 * La CESTA de un (acción, mes): todos los contratos del cubo, con su resultado en los dos vehículos.
 * Devuelve null si no hay ninguno operable o si aún no ha vencido.
 */
function cesta(sym, dia) {
  const c = cadena(sym, dia);
  if (!c) return null;
  const sp = spotDe(c);
  if (!sp) return null;

  const patas = [];
  for (const [exp, g] of Object.entries(c)) {
    const dte = Math.round((ms(exp) - ms(dia)) / 86_400_000);
    if (dte <= DTE_MIN) continue;
    const iu = idxVenc(sym, exp);
    if (iu < 0) continue;                                  // aún viva: NO se mide
    const dSal = (diasPorSim.get(sym) ?? [])[iu];
    const gSal = cadena(sym, dSal)?.[exp] ?? {};
    for (const [clave, ba] of Object.entries(g)) {
      if (clave.slice(-1) !== "C") continue;
      const K = Number(clave.slice(0, -2));
      const otm = ((K - sp) / sp) * 100;
      if (otm <= OTM_MIN) continue;
      const [bid, ask] = ba;
      if (!(ask >= ASK_MIN) || !((ask - bid) / ask <= SPREAD_MAX)) continue;

      // Vehículo 1 — CALL DESNUDA: pagas el ask, cobras el bid al vencimiento. Ausente = 0.
      const salLarga = gSal[clave];
      const valorDesnuda = salLarga ? salLarga[0] : 0;

      // Vehículo 2 — SPREAD: se vende otra call al DOBLE de distancia, mismo vencimiento.
      // El corto se abre cobrando su BID y se cierra pagando su ASK.
      const Kobj = sp * (1 + (2 * otm) / 100);
      let corto = null, dm = Infinity;
      for (const [cl2, ba2] of Object.entries(g)) {
        if (cl2.slice(-1) !== "C") continue;
        const K2 = Number(cl2.slice(0, -2));
        if (K2 <= K) continue;
        const d = Math.abs(K2 - Kobj);
        if (d < dm && ba2[0] > 0) { dm = d; corto = { clave: cl2, K: K2, bid: ba2[0], ask: ba2[1] }; }
      }
      let spread = null;
      if (corto) {
        const coste = ask - corto.bid;                     // lo que pagas por el spread
        if (coste > 0.02) {
          const salCorta = gSal[corto.clave];
          const valor = valorDesnuda - (salCorta ? salCorta[1] : 0);   // cierras pagando su ask
          spread = { coste, valor: Math.max(0, valor), K2: corto.K };
        }
      }
      patas.push({ exp, K, dte, otm, ask, bid, valorDesnuda, spread, dSal });
    }
  }
  return patas.length ? patas : null;
}

// ── Señales ─────────────────────────────────────────────────────────────────
const filas = JSON.parse(readFileSync("scripts/puente-filas.json", "utf8")).filter((x) => x.gamLejos != null);
radiografia(filas, ["gamLejos", "resultado"], "señales", { cerosLegitimos: ["resultado"] });
const porMes = new Map();
for (const f of filas) { if (!porMes.has(f.mes)) porMes.set(f.mes, []); porMes.get(f.mes).push(f); }
const meses = [...porMes.keys()].sort();
const ultimoDiaDelMes = (sym, mes) => {
  const d = (diasPorSim.get(sym) ?? []).filter((x) => x.slice(0, 6) === mes);
  return d.length ? d[d.length - 1] : null;
};

let semilla = 42;
const azar = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };

function correr(regla) {
  const R = { desnuda: { inv: 0, rec: 0, n: 0, gan: 0 }, spread: { inv: 0, rec: 0, n: 0, gan: 0 } };
  const porAño = new Map();
  let sinCesta = 0, mesesOperados = 0;

  for (const mes of meses) {
    const delMes = porMes.get(mes);
    let elegidos;
    if (regla === "azar") {
      const copia = [...delMes];
      elegidos = [];
      for (let i = 0; i < N_TICKERS && copia.length; i++) elegidos.push(copia.splice(Math.floor(azar() * copia.length), 1)[0]);
    } else elegidos = [...delMes].sort((a, b) => b.gamLejos - a.gamLejos).slice(0, N_TICKERS);

    let operoAlgo = false;
    for (const e of elegidos) {
      const dia = ultimoDiaDelMes(e.ticker, mes);
      if (!dia) { sinCesta++; continue; }
      const patas = cesta(e.ticker, dia);
      if (!patas) { sinCesta++; continue; }
      operoAlgo = true;
      const año = mes.slice(0, 4);
      if (!porAño.has(año)) porAño.set(año, { inv: 0, rec: 0, n: 0 });

      // A PARTES IGUALES entre todas las patas de la cesta. Se permiten fracciones de contrato: no
      // son operables, pero aislan la señal de la lotería de "cuál me cabía con $500". El efecto
      // de los contratos enteros se mide aparte, en la columna de la cesta media.
      // ── CÓMO SE REPARTEN LOS $500 ───────────────────────────────────────
      // MODO=fraccion  → a partes iguales, con fracciones de contrato. NO ES OPERABLE: aísla la
      //                  señal de la lotería de "cuál me cabía", pero nadie compra 0,03 contratos.
      // MODO=enteros   → CONTRATOS ENTEROS, uno de cada, del más barato al más caro, hasta que se
      //                  acaba el dinero. Es lo que haría una persona con $500: diversificar todo
      //                  lo que le dé el presupuesto.
      // MODO=repartido → contratos enteros, pero recorriendo el cubo de forma pareja (uno de cada
      //                  k) para no quedarse sólo con lo más barato, que es lo más lejano.
      //
      // La diferencia entre `fraccion` y los otros dos ES la pregunta: si el resultado sólo existe
      // con fracciones, no se puede operar y hay que decirlo.
      let compras;
      if (MODO === "fraccion") {
        const cuota = POR_TICKER / patas.length;
        compras = patas.map((p) => ({ p, uD: cuota / (p.ask * 100), gasto: cuota }));
      } else {
        const orden = MODO === "enteros"
          ? [...patas].sort((x, y) => x.ask - y.ask)
          : (() => {                                    // reparto parejo por el cubo
              const k = Math.max(1, Math.floor(patas.length / 20));
              return patas.filter((_, i) => i % k === 0);
            })();
        compras = [];
        let queda = POR_TICKER;
        for (const p of orden) {
          const coste = p.ask * 100;
          if (coste > queda) continue;
          queda -= coste;
          compras.push({ p, uD: 1, gasto: coste });
        }
      }
      for (const { p, uD, gasto } of compras) {
        R.desnuda.inv += gasto; R.desnuda.rec += uD * p.valorDesnuda * 100; R.desnuda.n++;
        if (p.valorDesnuda > p.ask) R.desnuda.gan++;
        const a = porAño.get(año); a.inv += gasto; a.rec += uD * p.valorDesnuda * 100; a.n++;
        if (p.spread) {
          const costeS = p.spread.coste * 100;
          const uS = MODO === "fraccion" ? gasto / costeS : 1;
          R.spread.inv += MODO === "fraccion" ? gasto : costeS;
          R.spread.rec += uS * p.spread.valor * 100; R.spread.n++;
          if (p.spread.valor > p.spread.coste) R.spread.gan++;
        }
      }
    }
    if (operoAlgo) mesesOperados++;
  }
  return { R, porAño, sinCesta, mesesOperados };
}

const eur = (x) => `$${Math.round(x).toLocaleString("es-ES")}`;
console.log(`\n## CESTA · las ${N_TICKERS} mejores del mes · $${POR_TICKER} por acción · precios reales\n`);
console.log(`${meses.length} meses (${meses[0]} → ${meses[meses.length - 1]})\n`);

const guardado = {};
for (const regla of ["azar", "filtro"]) {
  const { R, porAño, sinCesta, mesesOperados } = correr(regla);
  guardado[regla] = porAño;
  console.log(`── ${regla === "azar" ? "CONTROL · acciones al azar" : "FILTRO · las mejores por gamma en dólares"}`);
  console.log(`   ${mesesOperados} meses operados · ${sinCesta} (acción,mes) sin cesta operable`);
  for (const v of ["desnuda", "spread"]) {
    const x = R[v];
    if (!x.n) { console.log(`   ${v}: sin operaciones`); continue; }
    console.log(`   ${v === "desnuda" ? "CALL DESNUDA " : "SPREAD DE CALLS"}  ${String(x.n).padStart(6)} patas · ganan ${((x.gan / x.n) * 100).toFixed(0).padStart(3)}% · ` +
                `${eur(x.inv).padStart(10)} → ${eur(x.rec).padStart(11)}  =  ${(x.rec / x.inv).toFixed(2)}x`);
  }
  console.log("");
}

console.log("── AÑO A AÑO (filtro, call desnuda) ──");
for (const [a, x] of [...(guardado.filtro ?? new Map())].sort())
  console.log(`   ${a}  ${String(x.n).padStart(5)} patas · ${eur(x.inv).padStart(9)} → ${eur(x.rec).padStart(11)}  ${(x.rec / x.inv).toFixed(2)}x`);

console.log(`
⚠️  LAS FRACCIONES DE CONTRATO NO SON OPERABLES. Están para aislar la señal de la lotería de
   "cuál me cabía con el presupuesto". Un resultado que sólo aparezca con fracciones no es
   tradeable y hay que decirlo.`);
