// AUDITORIA 2 (solo lectura): replica la construccion del cubo sobre una MUESTRA de dias y
// compara ask->bid contra mid->mid. Si el efecto se evapora, era peaje de horquilla, no seleccion.
// Uso: node --max-old-space-size=6144 scripts/audit-eva-largo-cubo.mjs [pasoMuestreo]
import { readFileSync, existsSync, readdirSync } from "node:fs";

const FDIR = "scripts/cache-theta/flujo-historico";
const CDIR = "scripts/cache-theta/cadenas";
const PASO = Number(process.argv[2] || 12);      // 1 de cada PASO dias de flujo
const HORIZONTES = [30, 180];
const PRIMA_MIN = 3_000_000, CUBO_EXP_DIAS = 30, CUBO_PRIMA_LO = 0.5, CUBO_PRIMA_HI = 2.0, CUBO_MIN = 5;

const sinG = (s) => String(s).replace(/-/g, "");
const aIso = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
const ms = (ymd) => Date.parse(aIso(ymd) + "T00:00:00Z");

const diasPorSimbolo = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  (diasPorSimbolo.get(m[1]) ?? diasPorSimbolo.set(m[1], []).get(m[1])).push(m[2]);
}
for (const v of diasPorSimbolo.values()) v.sort();
const ULTIMO_DIA = Math.max(...[...diasPorSimbolo.values()].map((v) => Number(v[v.length - 1])));
console.log("PRUEBA A: diasPorSimbolo ->", [...diasPorSimbolo].map(([k, v]) => `${k}:${v.length}`).join(" "), "| ULTIMO_DIA:", ULTIMO_DIA);
console.log("PRUEBA A2: ultimo dia por simbolo ->", [...diasPorSimbolo].map(([k, v]) => `${k}:${v[v.length - 1]}`).join(" "));

function diaSalida(sym, objetivo) {
  const dias = diasPorSimbolo.get(sym);
  if (!dias) return null;
  let lo = 0, hi = dias.length - 1, res = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (dias[m] >= objetivo) { res = dias[m]; hi = m - 1; } else lo = m + 1; }
  if (!res) return null;
  return (ms(res) - ms(objetivo)) / 86_400_000 <= 10 ? res : null;
}
const cacheCad = new Map();
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  const hit = cacheCad.get(k);
  if (hit !== undefined) { cacheCad.delete(k); cacheCad.set(k, hit); return hit; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  const v = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  cacheCad.set(k, v);
  if (cacheCad.size > 200) cacheCad.delete(cacheCad.keys().next().value);
  return v;
}
// ask->bid (el del test)
function retAB(cadEnt, cadSal, exp, clave) {
  const ent = cadEnt?.[exp]?.[clave]; if (!ent) return null;
  const ask = ent[1]; if (!(ask > 0)) return null;
  const sal = cadSal?.[exp]?.[clave];
  return ((sal ? sal[0] : 0) - ask) / ask;
}
// mid->mid (sin peaje de horquilla)
function retMM(cadEnt, cadSal, exp, clave) {
  const ent = cadEnt?.[exp]?.[clave]; if (!ent) return null;
  const mEnt = (ent[0] + ent[1]) / 2; if (!(mEnt > 0)) return null;
  const sal = cadSal?.[exp]?.[clave];
  const mSal = sal ? (sal[0] + sal[1]) / 2 : 0;
  return (mSal - mEnt) / mEnt;
}

const media = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN);
const sd = (x) => { const m = media(x); return Math.sqrt(x.reduce((a, v) => a + (v - m) ** 2, 0) / (x.length - 1)); };
const t1 = (x) => media(x) / (sd(x) / Math.sqrt(x.length));
const pct = (v) => (v * 100).toFixed(2) + "%";

const ficheros = readdirSync(FDIR).filter((f) => f.endsWith(".json")).sort().filter((_, i) => i % PASO === 0);
console.log(`\nmuestra: ${ficheros.length} dias de flujo (1 de cada ${PASO})\n`);

const acc = {};
for (const H of HORIZONTES) acc[H] = { ab: [], mm: [], sprT: [], sprC: [], dteT: [], dteC: [], askT: [], askC: [] };

for (const f of ficheros) {
  const j = JSON.parse(readFileSync(`${FDIR}/${f}`, "utf8"));
  const sym = j.sym, entrada = j.dia;
  const notables = (j.notables || []).filter((n) => n.prima >= PRIMA_MIN);
  if (!notables.length) continue;
  const cadEnt = cadena(sym, entrada); if (!cadEnt) continue;
  const msEnt = ms(entrada);
  const universo = [];
  for (const [exp, grupo] of Object.entries(cadEnt)) {
    const msExp = ms(exp);
    for (const [clave, ba] of Object.entries(grupo)) if (ba[1] > 0)
      universo.push({ exp, msExp, clave, right: clave.slice(-1), ask: ba[1], bid: ba[0] });
  }
  for (const n of notables) {
    const expYmd = sinG(n.exp), clave = `${n.strike}|${n.right}`;
    const ent = cadEnt[expYmd]?.[clave];
    if (!ent || !(ent[1] > 0)) continue;
    const askEnt = ent[1], bidEnt = ent[0], msExp = ms(expYmd);
    const cubo = universo.filter((u) => u.right === n.right &&
      Math.abs(u.msExp - msExp) <= CUBO_EXP_DIAS * 86_400_000 &&
      u.ask >= askEnt * CUBO_PRIMA_LO && u.ask <= askEnt * CUBO_PRIMA_HI &&
      !(u.exp === expYmd && u.clave === clave));
    if (cubo.length < CUBO_MIN) continue;
    for (const H of HORIZONTES) {
      const objetivo = sinG(new Date(msEnt + H * 86_400_000).toISOString().slice(0, 10));
      if (msExp <= ms(objetivo)) continue;
      if (Number(objetivo) > ULTIMO_DIA) continue;
      const dSal = diaSalida(sym, objetivo); if (!dSal) continue;
      const cadSal = cadena(sym, dSal); if (!cadSal) continue;
      const rTab = retAB(cadEnt, cadSal, expYmd, clave); if (rTab === null) continue;
      const rTmm = retMM(cadEnt, cadSal, expYmd, clave);
      let sAB = 0, sMM = 0, cta = 0, sSpr = 0, sDte = 0, sAsk = 0;
      for (const u of cubo) {
        if (u.msExp <= ms(objetivo)) continue;
        const r = retAB(cadEnt, cadSal, u.exp, u.clave); if (r === null) continue;
        sAB += r; sMM += retMM(cadEnt, cadSal, u.exp, u.clave);
        sSpr += (u.ask - u.bid) / u.ask;
        sDte += (u.msExp - msEnt) / 86_400_000;
        sAsk += u.ask;
        cta++;
      }
      if (cta < CUBO_MIN) continue;
      const a = acc[H];
      a.ab.push(rTab - sAB / cta);
      a.mm.push(rTmm - sMM / cta);
      a.sprT.push((askEnt - bidEnt) / askEnt);
      a.sprC.push(sSpr / cta);
      a.dteT.push((msExp - msEnt) / 86_400_000);
      a.dteC.push(sDte / cta);
      a.askT.push(askEnt); a.askC.push(sAsk / cta);
    }
  }
}

console.log("=== B. ASK->BID (el del test)  vs  MID->MID (sin peaje de horquilla) ===");
console.log("horiz     n    DIF ask->bid       t      DIF mid->mid       t");
for (const H of HORIZONTES) {
  const a = acc[H]; if (a.ab.length < 20) continue;
  console.log(`${String(H).padStart(4)}d ${String(a.ab.length).padStart(6)}   ${pct(media(a.ab)).padStart(9)} ${t1(a.ab).toFixed(2).padStart(8)}    ${pct(media(a.mm)).padStart(9)} ${t1(a.mm).toFixed(2).padStart(8)}`);
}
console.log("\n=== C. EN QUE SE DIFERENCIAN TRATAMIENTO Y CUBO (antes de mirar retornos) ===");
console.log("horiz   horquilla T   horquilla C   dif(pp)   |  dte T   dte C   |  ask T   ask C");
for (const H of HORIZONTES) {
  const a = acc[H]; if (!a.sprT.length) continue;
  const dif = media(a.sprT.map((v, i) => v - a.sprC[i]));
  console.log(`${String(H).padStart(4)}d ${pct(media(a.sprT)).padStart(11)} ${pct(media(a.sprC)).padStart(13)} ${(dif * 100).toFixed(2).padStart(9)}   | ${media(a.dteT).toFixed(0).padStart(6)} ${media(a.dteC).toFixed(0).padStart(7)}   | ${media(a.askT).toFixed(2).padStart(6)} ${media(a.askC).toFixed(2).padStart(7)}`);
}
console.log("\n(dif de horquilla en pp: si es NEGATIVO el contrato del flujo paga MENOS peaje que su cubo)");
