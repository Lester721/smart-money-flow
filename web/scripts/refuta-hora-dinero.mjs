// REFUTACIÓN CON LA LENTE "DINERO" del hallazgo "entrar a las 13:45 parte la cola".
// Reconstruye el cóndor exactamente igual que estructura4-hora-cola.mjs pero GUARDA
// todo lo que el original tira: anchos reales de ala, distancia real de la pata corta,
// bid/ask pata a pata, colateral, y la curva de caja desde el día 1.
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { media, sd, pct, eur, drawdown } from "./anatomia3-lib.mjs";

const DIR = "scripts/cache-theta/gex-2026";
const SEP = 25, ALA = 50, COMM = 0.03;
const HORAS = ["09:35","09:45","10:00","10:15","10:30","10:45","11:00","11:15","11:30","11:45",
  "12:00","12:15","12:30","12:45","13:00","13:15","13:30","13:45","14:00","14:15","14:30","14:45","15:00"];

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").split("\n");
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid");
  const iA = cab.indexOf("ask"), iU = cab.indexOf("underlying_price");
  if ([iK,iT,iB,iA,iU].some((x) => x < 0)) throw new Error("faltan columnas en " + f);
  const set = new Set(HORAS), filas = new Map(), spots = new Map();
  let cierre = 0, hFin = "", nAskCero = 0, nTot = 0;
  for (let j = 1; j < lin.length; j++) {
    const L = lin[j]; if (L.length < 20) continue;
    const c = L.split(",");
    const h = c[iT].slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && h >= hFin) { hFin = h; cierre = sp; }
    if (!set.has(h)) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    nTot++; if (!(ask > 0)) nAskCero++;
    if (!(K > 0) || !(ask > 0) || !(bid >= 0)) continue;
    if (!filas.has(h)) filas.set(h, []);
    filas.get(h).push({ K, bid, ask });
    if (sp > 0) spots.set(h, sp);
  }
  return { filas, spots, cierre, hFin, nAskCero, nTot };
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));
const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();

const porHora = new Map(HORAS.map((h) => [h, []]));
const hFins = new Map();
let askCeroTot = 0, filasTot = 0;
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) continue;
  hFins.set(fecha, C.hFin);
  askCeroTot += C.nAskCero + P.nAskCero; filasTot += C.nTot + P.nTot;
  const S = C.cierre;
  for (const h of HORAS) {
    const fc = C.filas.get(h), fp = P.filas.get(h), spot = C.spots.get(h);
    if (!fc || !fp || !(spot > 0)) continue;
    const cC = cerca(fc, spot + SEP), pC = cerca(fp, spot - SEP);
    const cL = cerca(fc, cC.K + ALA), pL = cerca(fp, pC.K - ALA);
    if (cL.K <= cC.K || pL.K >= pC.K) continue;
    const credito = cC.bid + pC.bid - cL.ask - pL.ask;
    if (!(credito > 0)) continue;
    const anchoC = cL.K - cC.K, anchoP = pC.K - pL.K;
    const perdC = Math.min(Math.max(S - cC.K, 0), anchoC);
    const perdP = Math.min(Math.max(pC.K - S, 0), anchoP);
    porHora.get(h).push({
      fecha, ticker: "SPXW", pl: (credito - perdC - perdP) * 100 - 8 * COMM,
      credito: credito * 100, anchoC, anchoP,
      distC: cC.K - spot, distP: spot - pC.K,
      bidCortaC: cC.bid, bidCortaP: pC.bid, askAlaC: cL.ask, askAlaP: pL.ask,
      spreadCortaC: cC.ask - cC.bid, spreadAlaC: cL.ask - cL.bid,
      colateral: (Math.max(anchoC, anchoP) - credito) * 100,
      spot, S,
    });
  }
}
const cvar = (pls, q) => { const s = [...pls].sort((a,b)=>a-b); return media(s.slice(0, Math.max(1, Math.floor(s.length*q)))); };
const minAcum = (pls) => { let a = 0, m = 0; for (const p of pls) { a += p; if (a < m) m = a; } return m; };

console.log("=".repeat(110));
console.log("REFUTACION · lente DINERO · " + fechas.length + " dias de SPXW 0DTE");
console.log("=".repeat(110));

// ── 0 · ¿LOS PRECIOS SON DE VERDAD? ──────────────────────────────────────────────────────────
console.log("\n-- 0 · INTEGRIDAD DE LAS CUATRO PATAS --------------------------------------------------------");
console.log("\n| hora | n | ala C =50pts | ala P =50pts | corta C lejos de 25 | bid corta C =0 | ask ala C <=0,05 | horq. corta C | horq. ala C | horq/credito | credito med |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
const integridad = {};
for (const h of HORAS) {
  const v = porHora.get(h); if (!v.length) continue;
  const I = {
    n: v.length,
    alaC50: v.filter((x) => x.anchoC === ALA).length / v.length,
    alaP50: v.filter((x) => x.anchoP === ALA).length / v.length,
    distMal: v.filter((x) => Math.abs(x.distC - SEP) > 2.6).length / v.length,
    bidCero: v.filter((x) => x.bidCortaC <= 0).length / v.length,
    askAlaMin: v.filter((x) => x.askAlaC <= 0.05).length / v.length,
    horqCorta: media(v.map((x) => x.spreadCortaC)),
    horqAla: media(v.map((x) => x.spreadAlaC)),
    credito: pct(v.map((x) => x.credito), 0.5),
  };
  I.horqSobreCred = (2 * I.horqCorta + 2 * I.horqAla) * 100 / I.credito;
  integridad[h] = I;
  console.log(`| ${h}${h==="11:00"?" <--":""} | ${I.n} | ${(I.alaC50*100).toFixed(1)}% | ${(I.alaP50*100).toFixed(1)}% | ${(I.distMal*100).toFixed(1)}% | ${(I.bidCero*100).toFixed(1)}% | ${(I.askAlaMin*100).toFixed(1)}% | $${I.horqCorta.toFixed(2)} | $${I.horqAla.toFixed(2)} | ${(I.horqSobreCred*100).toFixed(0)}% | ${eur(I.credito)} |`);
}
console.log(`\n  filas con ask=0 descartadas al leer: ${askCeroTot} de ${filasTot} (${(askCeroTot/filasTot*100).toFixed(1)}%)`);

// ── 1 · ¿A QUE HORA SE LIQUIDA DE VERDAD? ────────────────────────────────────────────────────
const cuentaFin = new Map();
for (const v of hFins.values()) cuentaFin.set(v, (cuentaFin.get(v) || 0) + 1);
console.log("\n-- 1 · ULTIMO SELLO DE TIEMPO CON SUBYACENTE (contra el que se liquida) -----------------------");
console.log("  " + [...cuentaFin].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,n])=>`${k}: ${n} dias`).join(" · "));

// ── 2 · LA CAJA: ¿SOBREVIVE CON $7.977? ──────────────────────────────────────────────────────
const CAJA = 7977;
console.log("\n-- 2 · LA CAJA REAL: $7.977 libres. Colateral + lo que la curva se hunde desde el dia 1 -------");
console.log("\n| hora | $/ano | peor racha | MINIMO acumulado desde dia 1 | colateral med | caja necesaria | cabe en $7.977 |");
console.log("|---|---|---|---|---|---|---|");
const caja = {};
for (const h of HORAS) {
  const v = porHora.get(h); if (v.length < 100) continue;
  const s = [...v].sort((a,b)=>a.fecha.localeCompare(b.fecha));
  const pls = s.map((x) => x.pl);
  const mn = minAcum(pls), col = pct(s.map((x)=>x.colateral), 0.5);
  const nec = col + Math.abs(mn);
  caja[h] = { alAno: pls.reduce((a,b)=>a+b,0)/(v.length/251), dd: drawdown(pls), min: mn, col, nec, c5: cvar(pls,0.05) };
  console.log(`| ${h}${h==="11:00"?" <--":""} | ${eur(caja[h].alAno)} | ${eur(caja[h].dd)} | ${eur(mn)} | ${eur(col)} | ${eur(nec)} | ${nec <= CAJA ? "SI" : "NO"} |`);
}

// ── 3 · ¿GANA A OPERAR MAS PEQUEÑO A LAS 11:00? ─────────────────────────────────────────────
console.log("\n-- 3 · LA ALTERNATIVA TRIVIAL: operar MENOS a las 11:00. Mismo drawdown, quien ingresa mas ----");
const B = caja["11:00"];
console.log("\n| hora | $/ano | peor racha | factor para igualar la racha | 11:00 escalada da | la hora GANA | idem con CVaR5 |");
console.log("|---|---|---|---|---|---|---|");
let ganaDD = 0, pierdeDD = 0, ganaC = 0, pierdeC = 0;
for (const h of HORAS) {
  const v = porHora.get(h); if (v.length < 100 || h === "11:00") continue;
  const r = caja[h];
  const fac = Math.abs(r.dd) / Math.abs(B.dd);
  const baseEsc = B.alAno * fac;
  const g = r.alAno > baseEsc;
  if (Math.abs(r.dd) < Math.abs(B.dd)) { if (g) ganaDD++; else pierdeDD++; }
  const facC = Math.abs(r.c5)/Math.abs(B.c5);
  const gC = r.alAno > B.alAno * facC;
  if (Math.abs(r.c5) < Math.abs(B.c5)) { if (gC) ganaC++; else pierdeC++; }
  console.log(`| ${h} | ${eur(r.alAno)} | ${eur(r.dd)} | ${fac.toFixed(3)} | ${eur(baseEsc)} | ${g?"SI":"no"} | ${gC?"SI":"no"} |`);
}
console.log(`\n  de las horas que REDUCEN la peor racha: ${ganaDD} ganan a escalar la base, ${pierdeDD} pierden.`);
console.log(`  de las horas que REDUCEN el CVaR5:      ${ganaC} ganan a escalar la base, ${pierdeC} pierden.`);

// ── 4 · SENSIBILIDAD DEL LIMITE DE LA "FRANJA" ──────────────────────────────────────────────
console.log("\n-- 4 · LA FRANJA DE TARDE GANA EN DINERO: aguanta mover el limite 15 minutos ------------------");
const ing = Object.fromEntries(HORAS.filter((h)=>caja[h]).map((h)=>[h, caja[h].alAno]));
const c5s = Object.fromEntries(HORAS.filter((h)=>caja[h]).map((h)=>[h, caja[h].c5]));
const mediaDe = (hs) => media(hs.map((h)=>ing[h]));
const mediaC5 = (hs) => media(hs.map((h)=>c5s[h]));
const cortes = [
  ["11:00-12:45  vs  13:00-14:30  (el del informe)", ["11:00","11:15","11:30","11:45","12:00","12:15","12:30","12:45"], ["13:00","13:15","13:30","13:45","14:00","14:15","14:30"]],
  ["10:45-12:45  vs  13:00-15:00", ["10:45","11:00","11:15","11:30","11:45","12:00","12:15","12:30","12:45"], ["13:00","13:15","13:30","13:45","14:00","14:15","14:30","14:45","15:00"]],
  ["11:00-12:45  vs  13:00-15:00", ["11:00","11:15","11:30","11:45","12:00","12:15","12:30","12:45"], ["13:00","13:15","13:30","13:45","14:00","14:15","14:30","14:45","15:00"]],
  ["10:45-12:45  vs  13:00-14:30", ["10:45","11:00","11:15","11:30","11:45","12:00","12:15","12:30","12:45"], ["13:00","13:15","13:30","13:45","14:00","14:15","14:30"]],
  ["10:30-12:45  vs  13:00-15:00", ["10:30","10:45","11:00","11:15","11:30","11:45","12:00","12:15","12:30","12:45"], ["13:00","13:15","13:30","13:45","14:00","14:15","14:30","14:45","15:00"]],
  ["primera mitad 09:35-12:15  vs  segunda 12:30-15:00", HORAS.slice(0,12), HORAS.slice(12)],
];
console.log("\n| corte | franja A $/ano | franja TARDE $/ano | gana en dinero | CVaR5 A | CVaR5 tarde |");
console.log("|---|---|---|---|---|---|");
for (const [nom, a, b] of cortes) {
  const A = a.filter((h)=>ing[h]), Bq = b.filter((h)=>ing[h]);
  console.log(`| ${nom} | ${eur(mediaDe(A))} | ${eur(mediaDe(Bq))} | ${mediaDe(Bq)>mediaDe(A)?"TARDE":"MEDIODIA"} | ${eur(mediaC5(A))} | ${eur(mediaC5(Bq))} |`);
}

// ── 5 · BOOTSTRAP EMPAREJADO 11:00 vs 13:45 ─────────────────────────────────────────────────
console.log("\n-- 5 · BOOTSTRAP DE BLOQUES, EMPAREJADO (mismos dias) 11:00 vs 13:45 -------------------------");
const m11 = new Map(porHora.get("11:00").map((x)=>[x.fecha,x]));
const m13 = new Map(porHora.get("13:45").map((x)=>[x.fecha,x]));
const com = [...m11.keys()].filter((f)=>m13.has(f)).sort();
const a11 = com.map((f)=>m11.get(f).pl), a13 = com.map((f)=>m13.get(f).pl);
console.log(`  dias comunes: ${com.length}`);
const est = (p) => ({ ano: media(p)*251, dd: drawdown(p), c5: cvar(p,0.05), p5: pct(p,0.05), peor: Math.min(...p) });
const e11 = est(a11), e13 = est(a13);
console.log(`  11:00 -> ${eur(e11.ano)}/ano · racha ${eur(e11.dd)} · CVaR5 ${eur(e11.c5)} · p5 ${eur(e11.p5)} · peor ${eur(e11.peor)}`);
console.log(`  13:45 -> ${eur(e13.ano)}/ano · racha ${eur(e13.dd)} · CVaR5 ${eur(e13.c5)} · p5 ${eur(e13.p5)} · peor ${eur(e13.peor)}`);
const BL = 10, NB = 3000;
const dAno = [], dDD = [], dC5 = [], dEf = [];
for (let b = 0; b < NB; b++) {
  const i11 = [], i13 = [];
  while (i11.length < com.length) {
    const s = (Math.random()*com.length)|0;
    for (let k = 0; k < BL && i11.length < com.length; k++) { const j = (s+k)%com.length; i11.push(a11[j]); i13.push(a13[j]); }
  }
  const x = est(i11), y = est(i13);
  dAno.push(y.ano - x.ano); dDD.push(Math.abs(x.dd) - Math.abs(y.dd)); dC5.push(Math.abs(x.c5) - Math.abs(y.c5));
  dEf.push((y.ano/Math.abs(y.dd)) - (x.ano/Math.abs(x.dd)));
}
const ic = (v) => { const s=[...v].sort((a,b)=>a-b); return [s[Math.floor(NB*0.025)], s[Math.floor(NB*0.5)], s[Math.floor(NB*0.975)]]; };
const pPos = (v) => v.filter((x)=>x>0).length/v.length;
for (const [nom, v] of [["D ingreso (13:45 - 11:00)", dAno], ["racha ELIMINADA", dDD], ["CVaR5 ELIMINADO", dC5], ["D eficiencia $/ano por $racha", dEf]]) {
  const [lo,md,hi] = ic(v);
  console.log(`  ${nom.padEnd(32)} mediana ${eur(md).padStart(10)} · IC95 [${eur(lo)} , ${eur(hi)}] · P(>0)=${(pPos(v)*100).toFixed(0)}%`);
}

// ── 6 · POR AÑO ─────────────────────────────────────────────────────────────────────────────
console.log("\n-- 6 · AÑO A AÑO (mismos dias) ----------------------------------------------------------------");
console.log("\n| año | n | 11:00 $/ano | 11:00 racha | 11:00 peor dia | 13:45 $/ano | 13:45 racha | 13:45 peor dia |");
console.log("|---|---|---|---|---|---|---|---|");
for (const y of ["2024","2025","2026"]) {
  const idx = com.map((f,i)=>[f,i]).filter(([f])=>f.startsWith(y)).map(([,i])=>i);
  const p1 = idx.map((i)=>a11[i]), p2 = idx.map((i)=>a13[i]);
  const an = idx.length/251;
  console.log(`| ${y} | ${idx.length} | ${eur(p1.reduce((a,b)=>a+b,0)/an)} | ${eur(drawdown(p1))} | ${eur(Math.min(...p1))} | ${eur(p2.reduce((a,b)=>a+b,0)/an)} | ${eur(drawdown(p2))} | ${eur(Math.min(...p2))} |`);
}

// ── 7 · ¿CUANTOS DIAS MANDAN EN LA RACHA? ───────────────────────────────────────────────────
console.log("\n-- 7 · DE CUANTOS DIAS DEPENDE LA PEOR RACHA --------------------------------------------------");
for (const [nom, p] of [["11:00", a11], ["13:45", a13]]) {
  const tot = p.filter((x)=>x <= -3000).length;
  const sorted = [...p].sort((a,b)=>a-b);
  const iPeor = p.indexOf(Math.min(...p));
  const sinPeor = p.filter((_,i)=>i!==iPeor);
  console.log(`  ${nom}: dias por debajo de -$3.000 = ${tot} · suma de los 5 peores = ${eur(sorted.slice(0,5).reduce((a,b)=>a+b,0))} · racha ${eur(drawdown(p))}`);
  console.log(`     quitando SOLO el peor dia, la racha pasa a ${eur(drawdown(sinPeor))}`);
}

// ── 8 · LOS DIAS QUE 13:45 NO PUEDE ABRIR ───────────────────────────────────────────────────
const soloEn11 = [...m11.keys()].filter((f)=>!m13.has(f));
console.log("\n-- 8 · DIAS QUE 13:45 DESCARTA (credito<=0) Y QUE 11:00 SI OPERA -----------------------------");
console.log(`  ${soloEn11.length} dias: ${soloEn11.map((f)=>`${f} (pl 11:00 ${eur(m11.get(f).pl)})`).join(" · ")}`);

writeFileSync("scripts/refuta-hora-dinero.json", JSON.stringify({ integridad, caja, comunes: com.length,
  boot: { dAno: ic(dAno), dDD: ic(dDD), dC5: ic(dC5), dEf: ic(dEf), pAno: pPos(dAno), pDD: pPos(dDD), pC5: pPos(dC5), pEf: pPos(dEf) },
  finTs: [...cuentaFin] }, null, 2));
console.log("\n-> scripts/refuta-hora-dinero.json");
