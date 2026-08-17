// AUDITORÍA CONTRADICTORIA — ¿los SPLITS rompen cartera-cesta.mjs?
//
// cartera-cesta.mjs liquida buscando la MISMA clave `${strike}|C` en la cadena del día de
// vencimiento. Si entre la compra y el vencimiento hubo un split, esa clave o (a) no existe
// —y la pata se cuenta como CERO— o (b) existe pero es OTRO instrumento —y el valor es basura.
//
// Solo lectura. No toca ningún fichero del test.
//
// Uso:
//   node --max-old-space-size=10240 scripts/auditc-splits.mjs            (detecta + simula)
//   FASE=detectar node --max-old-space-size=10240 scripts/auditc-splits.mjs
//
// Los splits detectados se cachean en scripts/auditc-splits-detectados.json para no releer
// 74.571 ficheros en cada pasada.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CACHE_SPLITS = "scripts/auditc-splits-detectados.json";
const POR_TICKER = Number(process.env.POR_TICKER || 500);
const N_TICKERS = Number(process.env.N_TICKERS || 3);
const OTM_MIN = 60, DTE_MIN = 365;
const ASK_MIN = 0.10, SPREAD_MAX = 0.40;
const ms = (y) => Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`);

// ── índice de días por símbolo (idéntico al del test) ───────────────────────
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

// ═══════════════════════════════════════════════════════════════════════════
// A. DETECTOR DE SPLITS sobre TODA la historia (2016-2026), no sólo desde 2023
//    Se mide el strike MÁXIMO y la MEDIANA de cada día. Un split hacia adelante
//    hunde ambos; un split INVERSO (GE 1:8) los multiplica.
// ═══════════════════════════════════════════════════════════════════════════
function detectarSplits() {
  const out = [];
  let leidos = 0;
  for (const [sym, dias] of diasPorSim) {
    let pMax = 0, pMed = 0, pDia = null;
    for (const d of dias) {
      const f = `${CDIR}/${sym}_d${d}.json`;
      let c;
      try { c = JSON.parse(readFileSync(f, "utf8")); } catch { continue; }
      leidos++;
      const ks = [];
      for (const g of Object.values(c)) for (const clave of Object.keys(g)) ks.push(Number(clave.slice(0, -2)));
      if (!ks.length) continue;
      ks.sort((a, b) => a - b);
      const maxK = ks[ks.length - 1];
      const medK = ks[ks.length >> 1];
      if (pMax > 0 && maxK > 0) {
        const rBaja = pMax / maxK;          // >1 = los strikes se hundieron (split normal)
        const rSube = maxK / pMax;          // >1 = los strikes subieron (split inverso)
        if (rBaja >= 1.8 || rSube >= 1.8) {
          out.push({
            sym, anterior: pDia, desde: d,
            maxAntes: pMax, maxDespues: maxK,
            medAntes: pMed, medDespues: medK,
            ratioMax: rBaja >= 1.8 ? rBaja : -rSube,
            ratioMed: pMed && medK ? pMed / medK : null,
            tipo: rBaja >= 1.8 ? "directo" : "inverso",
          });
        }
      }
      pMax = maxK; pMed = medK; pDia = d;
    }
    process.stderr.write(`  ${sym} listo (${leidos} ficheros)\r`);
  }
  process.stderr.write("\n");
  return out;
}

let SPLITS;
if (existsSync(CACHE_SPLITS) && process.env.REDETECTAR !== "1") {
  SPLITS = JSON.parse(readFileSync(CACHE_SPLITS, "utf8"));
  console.log(`(splits leídos de ${CACHE_SPLITS}; REDETECTAR=1 para rehacer)`);
} else {
  console.error("Detectando splits sobre 74.571 cadenas… (unos minutos)");
  SPLITS = detectarSplits();
  writeFileSync(CACHE_SPLITS, JSON.stringify(SPLITS, null, 1));
}

console.log("\n═══ A. SPLITS DETECTADOS (ratio ≥ 1,8 en el strike máximo entre días seguidos) ═══\n");
if (!SPLITS.length) console.log("  ninguno");
for (const s of SPLITS)
  console.log(`  ${s.sym.padEnd(5)} ${s.anterior} → ${s.desde}  ${s.tipo.padEnd(8)}` +
    ` maxK ${String(s.maxAntes).padStart(8)} → ${String(s.maxDespues).padStart(8)}` +
    `   medK ${String(s.medAntes).padStart(7)} → ${String(s.medDespues).padStart(7)}` +
    `   ratioMax ${Math.abs(s.ratioMax).toFixed(2).padStart(6)}  ratioMed ${s.ratioMed ? s.ratioMed.toFixed(2) : "—"}`);

// ── A2. ¿colisionan las claves? ¿existe el strike viejo el día después? ──────
console.log("\n═══ A2. ¿El strike de antes EXISTE después del split (choque de instrumentos)? ═══\n");
for (const s of SPLITS) {
  const a = cadena(s.sym, s.anterior), b = cadena(s.sym, s.desde);
  if (!a || !b) { console.log(`  ${s.sym} ${s.desde}: falta cadena`); continue; }
  const exps = Object.keys(a).filter((e) => b[e]);
  let existe = 0, no = 0; const ej = [];
  for (const e of exps) for (const k of Object.keys(a[e])) {
    if (b[e][k]) { existe++; if (ej.length < 4) ej.push({ e, k, antes: a[e][k], despues: b[e][k] }); }
    else no++;
  }
  console.log(`  ${s.sym} ${s.anterior}→${s.desde}: ${existe + no} contratos comunes de vencimiento · ` +
    `${no} desaparecen (→ el test los liquida a CERO) · ${existe} "siguen" con la misma clave (→ instrumento distinto)`);
  for (const x of ej) console.log(`      exp ${x.e} ${x.k}  [bid,ask] ${JSON.stringify(x.antes)} → ${JSON.stringify(x.despues)}`);
}

if (process.env.FASE === "detectar") process.exit(0);

// ═══════════════════════════════════════════════════════════════════════════
// B. RÉPLICA EXACTA de cartera-cesta.mjs, marcando cada pata que CRUZA un split
// ═══════════════════════════════════════════════════════════════════════════
const splitsPorSym = new Map();
for (const s of SPLITS) {
  if (!splitsPorSym.has(s.sym)) splitsPorSym.set(s.sym, []);
  splitsPorSym.get(s.sym).push(s);
}
/** ¿hay algún split de `sym` con fecha en (dia, dSal]? */
function cruzaSplit(sym, dia, dSal) {
  for (const s of splitsPorSym.get(sym) ?? []) if (s.desde > dia && s.desde <= dSal) return s;
  return null;
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
function idxVenc(sym, exp) {
  const dias = diasPorSim.get(sym) ?? [];
  if (!dias.length || exp > dias[dias.length - 1]) return -1;
  let lo = 0, hi = dias.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (dias[m] <= exp) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}
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
    if (iu < 0) continue;
    const dSal = (diasPorSim.get(sym) ?? [])[iu];
    const gSal = cadena(sym, dSal)?.[exp] ?? {};
    for (const [clave, ba] of Object.entries(g)) {
      if (clave.slice(-1) !== "C") continue;
      const K = Number(clave.slice(0, -2));
      const otm = ((K - sp) / sp) * 100;
      if (otm <= OTM_MIN) continue;
      const [bid, ask] = ba;
      if (!(ask >= ASK_MIN) || !((ask - bid) / ask <= SPREAD_MAX)) continue;
      const salLarga = gSal[clave];
      const valorDesnuda = salLarga ? salLarga[0] : 0;
      patas.push({ sym, exp, K, sp, dte, otm, ask, bid, valorDesnuda, dSal, dia,
                   presente: !!salLarga, split: cruzaSplit(sym, dia, dSal) });
    }
  }
  return patas.length ? patas : null;
}

const filas = JSON.parse(readFileSync("scripts/puente-filas.json", "utf8")).filter((x) => x.gamLejos != null);
const porMes = new Map();
for (const f of filas) { if (!porMes.has(f.mes)) porMes.set(f.mes, []); porMes.get(f.mes).push(f); }
const meses = [...porMes.keys()].sort();
const ultimoDiaDelMes = (sym, mes) => {
  const d = (diasPorSim.get(sym) ?? []).filter((x) => x.slice(0, 6) === mes);
  return d.length ? d[d.length - 1] : null;
};

function correr(regla, MODO) {
  let semilla = 42;
  const azar = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
  const compradas = [];
  for (const mes of meses) {
    const delMes = porMes.get(mes);
    let elegidos;
    if (regla === "azar") {
      const copia = [...delMes]; elegidos = [];
      for (let i = 0; i < N_TICKERS && copia.length; i++) elegidos.push(copia.splice(Math.floor(azar() * copia.length), 1)[0]);
    } else elegidos = [...delMes].sort((a, b) => b.gamLejos - a.gamLejos).slice(0, N_TICKERS);
    for (const e of elegidos) {
      const dia = ultimoDiaDelMes(e.ticker, mes);
      if (!dia) continue;
      const patas = cesta(e.ticker, dia);
      if (!patas) continue;
      let compras;
      if (MODO === "fraccion") {
        const cuota = POR_TICKER / patas.length;
        compras = patas.map((p) => ({ p, uD: cuota / (p.ask * 100), gasto: cuota }));
      } else {
        const orden = MODO === "enteros"
          ? [...patas].sort((x, y) => x.ask - y.ask)
          : (() => { const k = Math.max(1, Math.floor(patas.length / 20)); return patas.filter((_, i) => i % k === 0); })();
        compras = []; let queda = POR_TICKER;
        for (const p of orden) {
          const coste = p.ask * 100;
          if (coste > queda) continue;
          queda -= coste;
          compras.push({ p, uD: 1, gasto: coste });
        }
      }
      for (const { p, uD, gasto } of compras)
        compradas.push({ mes, ...p, gasto, rec: uD * p.valorDesnuda * 100, gana: p.valorDesnuda > p.ask });
    }
  }
  return compradas;
}

const eur = (x) => `$${Math.round(x).toLocaleString("es-ES")}`;
const tot = (v) => {
  const inv = v.reduce((a, x) => a + x.gasto, 0), rec = v.reduce((a, x) => a + x.rec, 0);
  return { n: v.length, inv, rec, x: rec / inv, gan: v.filter((y) => y.gana).length };
};
const linea = (et, t) => `${et.padEnd(26)} ${String(t.n).padStart(6)} patas · gana ${((t.gan / (t.n || 1)) * 100).toFixed(0).padStart(3)}% · ${eur(t.inv).padStart(11)} → ${eur(t.rec).padStart(12)} = ${(t.x || 0).toFixed(2)}x`;

console.log("\n\n═══ B. PATAS QUE CRUZAN UN SPLIT, y qué queda si se quitan ═══");
const guardar = {};
for (const MODO of ["fraccion", "enteros", "repartido"]) {
  console.log(`\n── MODO=${MODO} ──────────────────────────────────────────────────────`);
  for (const regla of ["azar", "filtro"]) {
    const v = correr(regla, MODO);
    if (MODO === "enteros") guardar[regla] = v;
    const cru = v.filter((p) => p.split), lim = v.filter((p) => !p.split);
    const T = tot(v), C = tot(cru), L = tot(lim);
    console.log(`  ${regla.toUpperCase()}`);
    console.log(`    ${linea("TODO (lo publicado)", T)}`);
    console.log(`    ${linea("  · CRUZAN split", C)}`);
    console.log(`    ${linea("  · NO cruzan  ← limpio", L)}`);
    console.log(`    cruzan ${((C.n / T.n) * 100).toFixed(2)}% de las patas, ${((C.inv / T.inv) * 100).toFixed(2)}% del dinero invertido, ` +
      `${((C.rec / T.rec) * 100).toFixed(2)}% de lo recuperado`);
  }
}

// ═══ C. Detalle de las patas que cruzan (modo enteros, filtro) ══════════════
console.log("\n\n═══ C. Las patas que cruzan un split — modo ENTEROS, filtro ═══\n");
const cruF = (guardar.filtro ?? []).filter((p) => p.split);
if (!cruF.length) console.log("  ninguna");
else {
  const porSplit = new Map();
  for (const p of cruF) {
    const k = `${p.sym} ${p.split.desde} (${p.split.tipo})`;
    if (!porSplit.has(k)) porSplit.set(k, []);
    porSplit.get(k).push(p);
  }
  for (const [k, v] of [...porSplit].sort((a, b) => tot(b[1]).rec - tot(a[1]).rec)) {
    const t = tot(v);
    console.log(`  ${k.padEnd(28)} ${String(t.n).padStart(4)} patas · ${eur(t.inv).padStart(9)} → ${eur(t.rec).padStart(11)} = ${t.x.toFixed(2)}x · ` +
      `presentes al vencer ${v.filter((p) => p.presente).length}/${v.length}`);
  }
  console.log("\n  Las 15 patas que cruzan con MAYOR cobro:");
  for (const p of [...cruF].sort((a, b) => b.rec - a.rec).slice(0, 15))
    console.log(`    ${p.sym.padEnd(5)} ent ${p.dia} spot ${String(p.sp).padStart(7)} K ${String(p.K).padStart(8)} exp ${p.exp} sal ${p.dSal} · ` +
      `ask ${p.ask.toFixed(2).padStart(7)} → bid ${p.valorDesnuda.toFixed(2).padStart(8)} · ${eur(p.gasto)} → ${eur(p.rec)} · ${p.presente ? "PRESENTE" : "ausente=0"}`);
}

// ═══ D. Las 15 patas que MÁS aportan de TODAS (crucen o no) ════════════════
console.log("\n═══ D. Las 15 patas que más cobran del total (modo ENTEROS, filtro) ═══\n");
for (const p of [...(guardar.filtro ?? [])].sort((a, b) => b.rec - a.rec).slice(0, 15))
  console.log(`  ${p.sym.padEnd(5)} ent ${p.dia} spot ${String(p.sp).padStart(7)} K ${String(p.K).padStart(8)} exp ${p.exp} · ` +
    `${eur(p.gasto).padStart(6)} → ${eur(p.rec).padStart(9)} · ${(p.valorDesnuda / p.ask).toFixed(1)}x · ${p.split ? "CRUZA SPLIT" : ""}`);

// ═══ E. Reparto del cobro total por ticker ════════════════════════════════
console.log("\n═══ E. Reparto por ticker (modo ENTEROS, filtro) ═══\n");
const porTk = new Map();
for (const p of guardar.filtro ?? []) {
  if (!porTk.has(p.sym)) porTk.set(p.sym, []);
  porTk.get(p.sym).push(p);
}
const recTotal = (guardar.filtro ?? []).reduce((a, x) => a + x.rec, 0);
for (const [k, v] of [...porTk].sort((a, b) => tot(b[1]).rec - tot(a[1]).rec).slice(0, 12)) {
  const t = tot(v);
  console.log(`  ${k.padEnd(5)} ${String(t.n).padStart(5)} patas · ${eur(t.inv).padStart(9)} → ${eur(t.rec).padStart(11)} = ${t.x.toFixed(2)}x · ${((t.rec / recTotal) * 100).toFixed(1)}% de todo lo cobrado`);
}
