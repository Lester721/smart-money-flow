// Censo de subyacentes en el flujo cacheado: cuántas operaciones y en cuántos días aparece
// cada root. Sirve para decidir a qué tickers hay que bajarles la serie de precio.
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";

const DIR = path.join("scripts","cache-theta","marketsnack","flujo-100k");
const CHART = path.join("scripts","cache-theta","marketsnack","aux","chart-all");
const RE = /^([A-Z0-9.]+?)(\d{6})([CP])(\d{8})$/;

const dias = fs.readdirSync(DIR).filter(f=>f.endsWith(".jsonl.gz")).sort();
const ops = new Map(), dcount = new Map();
for (const f of dias) {
  const L = zlib.gunzipSync(fs.readFileSync(path.join(DIR,f))).toString("utf8").split("\n");
  const vistos = new Set();
  for (const ln of L) { if(!ln) continue; const r = JSON.parse(ln);
    const m = RE.exec(r.symbol); if(!m) continue;
    ops.set(m[1],(ops.get(m[1])||0)+1); vistos.add(m[1]); }
  for (const t of vistos) dcount.set(t,(dcount.get(t)||0)+1);
}
const ya = new Set(fs.existsSync(CHART)? fs.readdirSync(CHART).map(f=>f.replace(".json.gz","")) : []);
const ord = [...ops.entries()].sort((a,b)=>b[1]-a[1]);
const total = ord.reduce((a,x)=>a+x[1],0);
console.log(`días=${dias.length} roots=${ord.length} ops=${total}`);
const faltan = ord.filter(([t])=>!ya.has(t));
console.log(`con serie ya: ${ord.length-faltan.length} · faltan ${faltan.length}`);
// candidatos: aparece en >=40 de los 86 días (para que el panel transversal sea estable)
const cand = faltan.filter(([t])=> (dcount.get(t)||0) >= 40);
console.log(`FALTAN con >=40 días de presencia: ${cand.length}`);
console.log(cand.map(([t,n])=>`${t}(${n}/${dcount.get(t)}d)`).join(" "));
fs.writeFileSync(path.join("scripts","cache-theta","marketsnack","censo-roots.json"),
  JSON.stringify({dias:dias.length,total,roots:ord.map(([t,n])=>({t,n,d:dcount.get(t)}))},null,0));
