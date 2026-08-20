// ¿Los saltos grandes de los cierres SIN AJUSTAR son splits o son movimientos reales?
// Un split tiene forma de razón simple (2:1, 1:10...). Un salto de resultados, no.
// Retirar el símbolo entero por un +33% de earnings sesgaría el universo hacia los valores
// tranquilos — eso sería una selección que yo mismo estaría metiendo.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const DIR = "scripts/cache-theta/marketsnack/aux/chart-all";
const RAZONES = [2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30, 40, 50];
const esSplit = (r) => RAZONES.some((k) => Math.abs(r - k) / k < 0.03 || Math.abs(r - 1 / k) * k < 0.03);

const saltos = [];
for (const f of fs.readdirSync(DIR)) {
  const T = f.replace(".json.gz", "");
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR, f))).toString("utf8"));
  const s = (j.data || []).map((p) => ({ f: p.t.slice(0, 10), c: p.v })).filter((p) => p.c > 0).sort((a, b) => a.f.localeCompare(b.f));
  for (let i = 1; i < s.length; i++) {
    const r = s[i].c / s[i - 1].c;
    if (Math.abs(r - 1) > 0.25) saltos.push({ T, de: s[i - 1].f, a: s[i].f, p0: s[i - 1].c, p1: s[i].c, r, split: esSplit(r) });
  }
}
const sp = saltos.filter((x) => x.split), no = saltos.filter((x) => !x.split);
console.log(`saltos >25%: ${saltos.length}  ·  con FORMA DE SPLIT: ${sp.length}  ·  sin forma de split: ${no.length}`);
console.log(`\nCON FORMA DE SPLIT (se retiran esos días):`);
for (const x of sp) console.log(`  ${x.T.padEnd(6)} ${x.de}→${x.a}  ${x.p0} → ${x.p1}   razón ${x.r.toFixed(3)}`);
console.log(`\nSIN forma de split — los 12 mayores (movimientos reales, se quedan):`);
for (const x of no.sort((a, b) => Math.abs(b.r - 1) - Math.abs(a.r - 1)).slice(0, 12)) console.log(`  ${x.T.padEnd(6)} ${x.de}→${x.a}  ${x.p0} → ${x.p1}   razón ${x.r.toFixed(3)}`);
const dentro = saltos.filter((x) => x.a >= "2026-04-22");
console.log(`\nsaltos DENTRO del período de medición (desde 2026-04-22): ${dentro.length}, de los cuales con forma de split: ${dentro.filter((x) => x.split).length}`);
