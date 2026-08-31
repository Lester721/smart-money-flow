// ══ REPARAR LOS HUECOS DEL GRUPO A ══
// LLY, LMT y LRCX salieron con EXACTAMENTE los mismos días en 2019 (163), 2020 (208) y 2022
// (231). Tres tickers distintos con cuentas idénticas no es falta de datos: es la respuesta
// cortándose por tamaño. Se rebajan PARTIDOS EN SEMESTRES para que ninguna respuesta llegue
// al límite.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
const DIR = join(CACHE, "cadenas-A");
const BASE = "http://127.0.0.1:25503/v3/option/history/eod";
const HUECOS = [["LLY",2019],["LLY",2020],["LLY",2022],["LMT",2019],["LMT",2020],["LMT",2022],
                ["LRCX",2019],["LRCX",2020],["LRCX",2022]];
async function trozo(tk, ini, fin) {
  const r = await fetch(`${BASE}?symbol=${tk}&expiration=*&start_date=${ini}&end_date=${fin}`,
    { signal: AbortSignal.timeout(900000) });
  if (!r.ok) return { dias: 0, err: "HTTP " + r.status };
  const lin = (await r.text()).split("\n");
  if (lin.length < 10) return { dias: 0, err: "vacío" };
  const cab = lin[0].split(",");
  const iE=cab.indexOf("expiration"), iK=cab.indexOf("strike"), iR=cab.indexOf("right"),
        iC=cab.indexOf("created"), iB=cab.indexOf("bid"), iA=cab.indexOf("ask");
  const porDia = new Map();
  for (let n=1;n<lin.length;n++){ const c=lin[n].split(","); if(c.length<cab.length) continue;
    const q=(s)=>String(s??"").replace(/^"|"$/g,"");
    const exp=q(c[iE]).replace(/-/g,""), d=q(c[iC]).slice(0,10).replace(/-/g,"");
    if(!/^\d{8}$/.test(exp)||!/^\d{8}$/.test(d)) continue;
    const bid=+c[iB], ask=+c[iA]; if(!(bid>0)||!(ask>0)||ask<bid) continue;
    const lado=q(c[iR]).toUpperCase().startsWith("P")?"P":"C";
    if(!porDia.has(d)) porDia.set(d,{}); const g=porDia.get(d);
    if(!g[exp]) g[exp]={}; g[exp][Math.round(+c[iK]*1000)/1000+"|"+lado]=[bid,ask]; }
  for (const [d,g] of porDia) writeFileSync(join(DIR,`${tk}_d${d}.json`), JSON.stringify(g));
  return { dias: porDia.size };
}
console.log("");
console.log("  ══ REPARANDO (por semestres) ══");
for (const [tk, a] of HUECOS) {
  const s1 = await trozo(tk, a+"0101", a+"0630");
  const s2 = await trozo(tk, a+"0701", a+"1231");
  const tot = s1.dias + s2.dias;
  console.log("  " + tk + " " + a + ":  1er sem " + String(s1.dias).padStart(3) +
    "  ·  2do sem " + String(s2.dias).padStart(3) + "  ·  total " + String(tot).padStart(3) +
    (tot >= 248 ? "  ✓" : "  ⚠ sigue corto") + (s1.err||s2.err ? "  " + (s1.err||"") + (s2.err||"") : ""));
}
console.log("");
