// AUDITORÍA 3 — ¿es correcto el ARREGLO de splits que se acaba de meter en eva-comprar-largo.mjs?
// Replica detectarSplits() tal cual y comprueba: ratio exacto, falsos positivos, y si la clave
// ajustada `k/factor` aterriza en un strike que EXISTE en la cadena de salida.
// Solo lectura. Uso: node --max-old-space-size=6144 scripts/audit-split-fix.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const diasPorSimbolo = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  (diasPorSimbolo.get(m[1]) ?? diasPorSimbolo.set(m[1], []).get(m[1])).push(m[2]);
}
for (const v of diasPorSimbolo.values()) v.sort();

const cache = new Map();
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  if (cache.has(k)) { const h = cache.get(k); cache.delete(k); cache.set(k, h); return h; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  const v = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  cache.set(k, v);
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return v;
}

// ── réplica EXACTA de detectarSplits() del medidor ──────────────────────────
function detectarSplits() {
  const out = [];
  for (const [sym, dias] of diasPorSimbolo) {
    let prev = 0, prevDia = null;
    for (const d of dias) {
      if (d < "20231001") continue;
      const c = cadena(sym, d);
      if (!c) continue;
      let maxK = 0;
      for (const grupo of Object.values(c))
        for (const clave of Object.keys(grupo)) {
          const k = Number(clave.slice(0, -2));
          if (k > maxK) maxK = k;
        }
      if (prev && maxK > 0 && prev / maxK >= 1.8) out.push({ sym, desde: d, anterior: prevDia, ratio: prev / maxK, maxAntes: prev, maxDespues: maxK });
      prev = maxK; prevDia = d;
    }
  }
  return out;
}

const SPLITS = detectarSplits();
console.log("═══ 1. Lo que detecta el arreglo (ratio = maxStrike_ayer / maxStrike_hoy) ═══\n");
if (!SPLITS.length) console.log("  ninguno");
for (const s of SPLITS)
  console.log(`  ${s.sym}  ${s.anterior} → ${s.desde}   maxK ${s.maxAntes} → ${s.maxDespues}   RATIO USADO = ${s.ratio}`);

// ── 2. ¿Cuál es el ratio VERDADERO? Se mide con la mediana y con el percentil 90 ──
console.log("\n\n═══ 2. El ratio verdadero, medido de tres maneras distintas ═══\n");
for (const s of SPLITS) {
  const a = cadena(s.sym, s.anterior), b = cadena(s.sym, s.desde);
  const ks = (c) => { const v = []; for (const g of Object.values(c)) for (const k of Object.keys(g)) v.push(Number(k.slice(0, -2))); v.sort((x, y) => x - y); return v; };
  const ka = ks(a), kb = ks(b);
  const q = (v, p) => v[Math.min(v.length - 1, Math.floor(v.length * p))];
  console.log(`  ${s.sym} ${s.anterior}→${s.desde}`);
  console.log(`     por MAX     : ${q(ka, 0.9999)} / ${q(kb, 0.9999)} = ${(Math.max(...ka) / Math.max(...kb)).toFixed(4)}   ← EL QUE USA EL ARREGLO`);
  console.log(`     por MEDIANA : ${q(ka, 0.5)} / ${q(kb, 0.5)} = ${(q(ka, 0.5) / q(kb, 0.5)).toFixed(4)}`);
  console.log(`     por p90     : ${q(ka, 0.9)} / ${q(kb, 0.9)} = ${(q(ka, 0.9) / q(kb, 0.9)).toFixed(4)}`);
  console.log(`     por MIN>0   : ${ka[0]} / ${kb[0]} = ${(ka[0] / kb[0]).toFixed(4)}`);
}

// ── 3. LA PRUEBA DECISIVA: con el ratio del arreglo, ¿aterriza la clave ajustada? ──
console.log("\n\n═══ 3. Con el ratio del arreglo, ¿existe `strike/factor` en la cadena de salida? ═══\n");
for (const s of SPLITS) {
  const a = cadena(s.sym, s.anterior), b = cadena(s.sym, s.desde);
  const expsComunes = Object.keys(a).filter((e) => b[e]);
  let acierta = 0, falla = 0, sinAjustar = 0;
  const ejemplos = [];
  for (const e of expsComunes) for (const clave of Object.keys(a[e])) {
    const k = Number(clave.slice(0, -2)), right = clave.slice(-1);
    const nueva = `${k / s.ratio}|${right}`;
    if (b[e][nueva]) acierta++; else { falla++; if (ejemplos.length < 8) ejemplos.push({ e, clave, nueva, hay: !!b[e][`${k / 10}|${right}`] }); }
    if (b[e][clave]) sinAjustar++;
  }
  const tot = acierta + falla;
  console.log(`  ${s.sym} ratio ${s.ratio}: de ${tot} contratos, ${acierta} aciertan (${((acierta / tot) * 100).toFixed(1)}%), ${falla} NO (${((falla / tot) * 100).toFixed(1)}%)`);
  console.log(`     (y ${sinAjustar} existirían SIN ajustar, que es el choque con otro instrumento)`);
  for (const x of ejemplos) console.log(`     exp ${x.e} ${x.clave} → busca "${x.nueva}" · ¿existe con /10? ${x.hay ? "SÍ" : "no"}`);

  // ¿y con el ratio 10 exacto?
  let a10 = 0, f10 = 0;
  for (const e of expsComunes) for (const clave of Object.keys(a[e])) {
    const k = Number(clave.slice(0, -2)), right = clave.slice(-1);
    if (b[e][`${k / 10}|${right}`]) a10++; else f10++;
  }
  console.log(`     con ratio 10 EXACTO: ${a10} aciertan (${((a10 / (a10 + f10)) * 100).toFixed(1)}%), ${f10} no`);
}

// ── 4. FALSOS POSITIVOS: días donde el maxK cae por otra razón ──────────────
console.log("\n\n═══ 4. ¿Cuántos días tienen caídas de maxK grandes pero por debajo del umbral 1,8? ═══\n");
for (const [sym, dias] of diasPorSimbolo) {
  let prev = 0, prevDia = null; const caidas = [];
  for (const d of dias) {
    if (d < "20231001") continue;
    const c = cadena(sym, d); if (!c) continue;
    let maxK = 0;
    for (const g of Object.values(c)) for (const k of Object.keys(g)) { const v = Number(k.slice(0, -2)); if (v > maxK) maxK = v; }
    if (prev && maxK > 0 && prev / maxK >= 1.3) caidas.push({ de: prevDia, a: d, r: prev / maxK, prev, maxK });
    prev = maxK; prevDia = d;
  }
  if (caidas.length) {
    console.log(`  ${sym}: ${caidas.length} caídas de maxK ≥ 1,3x`);
    for (const c of caidas.slice(0, 6)) console.log(`     ${c.de}→${c.a}  maxK ${c.prev} → ${c.maxK}  (x${c.r.toFixed(2)})${c.r >= 1.8 ? "   ← DETECTADO COMO SPLIT" : ""}`);
  }
}
