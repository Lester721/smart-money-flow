// ══ DÓNDE ANDA CADA FORWARD TEST ══ Lester, 31-ago-2026: «repasa dónde anda cada forward test».
// Lee TODOS los cuadernos de Redis y dice, de cada uno, si ya dice algo o todavía no.
// Cada familia guarda con nombres distintos — esa trampa ya dio por muertos a tres cuadernos.
import Redis from "ioredis";
const r = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
const CUAD = [
  ["forward:la-palanca",       "LA PALANCA",                 "objeto", "resultado", "$ por operación"],
  ["forward:tsla-missile",     "TSLA's Missile",             "objeto", "resultado", "$ por operación"],
  ["forward:mariposa-15h",     "Mariposa de hierro · 15:00", "condor", "pl",        "$ por operación"],
  ["forward:tres-sies",        "Cóndor · los tres síes",     "condor", "pl",        "$ por operación"],
  ["forward:gex-condor",       "Cóndor · filtro de GEX",     "condor", "pl",        "$ por operación"],
  ["forward:condor-sinfiltro", "Cóndor · sin filtro",        "condor", "pl",        "$ por operación"],
  ["forward:condor-tendencia", "Cóndor · filtro tendencia",  "condor", "pl",        "$ por operación"],
  ["forward:ledger",           "Credit spread",              "riesgo", "retOnRisk", "% sobre riesgo"],
  ["forward:wheel",            "Wheel",                      "riesgo", "retOnRisk", "% sobre riesgo"],
  ["forward:ideas",            "Ideas (scorecard EVA)",      "riesgo", "retOnRisk", "% sobre riesgo"],
];
const D = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
console.log("");
console.log("  " + "cuaderno".padEnd(28) + "desde".padEnd(12) + "cerr".padStart(6) + "abier".padStart(7) +
  "acierta".padStart(9) + "resultado".padStart(14) + "   ¿dice algo ya?");
for (const [k, n, fam, campo, uni] of CUAD) {
  let raw; try { raw = JSON.parse((await r.get(k)) ?? "null"); } catch { raw = null; }
  if (!raw) { console.log("  " + n.padEnd(28) + "— vacío —"); continue; }
  let filas = Array.isArray(raw) ? raw
    : [...(raw.operaciones ?? []), ...(raw.abiertas ?? [])];
  const dia = fam === "riesgo" ? "entryDate" : "dia";
  const est = fam === "riesgo" ? "status" : "estado";
  const cer = fam === "riesgo" ? "closed" : "cerrada";
  const abi = fam === "riesgo" ? "open" : "abierta";
  const fechas = filas.map(f => f[dia] ?? f.dC).filter(Boolean).sort();
  const cerradasT = filas.filter(f => f[est] === cer);
  const cerradas = cerradasT.filter(f => typeof f[campo] === "number");
  const mudas = cerradasT.length - cerradas.length;   // cerradas SIN resultado = el cuaderno cierra pero no apunta
  const abiertas = filas.filter(f => f[est] === abi).length;
  const V = cerradas.map(f => f[campo]);
  const gan = V.filter(x => x > 0).length;
  const suma = V.reduce((a, b) => a + b, 0);
  const veredicto = cerradas.length === 0 ? "NO — aún sin operaciones cerradas"
    : cerradas.length < 30 ? "no — hacen falta ~30, van " + cerradas.length
    : "sí, ya se puede leer";
  // ⚠️ `retOnRisk` YA viene en PORCENTAJE (mín −100, mediana 2,6, máx 21,4). Multiplicarlo por
  //    100 daba "124,51% medio" en el credit spread, que es imposible. Comprobado leyendo el crudo.
  const res = V.length ? (uni.startsWith("$") ? D(suma) + " total" : (suma/V.length).toFixed(2) + "% medio") : "—";
  console.log("  " + n.padEnd(28) +
    (fechas[0] ? (fechas[0].length===8 ? fechas[0].slice(4,6)+"-"+fechas[0].slice(6,8) : fechas[0].slice(5)) : "—").padEnd(12) +
    String(cerradas.length).padStart(6) + String(abiertas).padStart(7) +
    (V.length ? (Math.round(100*gan/V.length) + "%") : "—").padStart(9) +
    res.padStart(14) + "   " + veredicto + (mudas ? "   ⛔ " + mudas + " cerradas SIN resultado" : ""));
}
await r.quit();
console.log("");
