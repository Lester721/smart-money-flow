// CIERRES DIARIOS DE LOS ÍNDICES DE VOLATILIDAD — el grupo 2 del filtro de régimen.
//
// La suscripción es Index: FREE → sólo EOD. Por eso estos cierres SÓLO se pueden usar CON UN DÍA
// DE RETRASO: el cierre de hoy son 5 horas de futuro respecto a la entrada de las 11:00.
// Quien lea esto después: si usas vix[hoy] para decidir la entrada de hoy, estás mirando al futuro.

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
const B = (process.env.THETA_BASE || "http://127.0.0.1:25503").replace(/\/+$/, "") + "/v3";
const DIR = "scripts/cache-theta/vol-indices";
if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
const limpia = (s) => String(s ?? "").replace(/"/g, "").trim();

for (const sim of ["VIX", "VIX9D", "VIX3M", "VVIX"]) {
  const out = {};
  for (let a = 2023; a <= 2026; a++) {                 // 2023 para tener el rezago del 2 de enero de 2024
    const r = await fetch(`${B}/index/history/eod?symbol=${sim}&start_date=${a}0101&end_date=${a === 2026 ? "20260817" : `${a}1231`}`,
      { signal: AbortSignal.timeout(120_000) });
    if (!r.ok) { console.log(`  ${sim} ${a}: http ${r.status}`); continue; }
    const l = (await r.text()).trim().split("\n");
    if (l.length < 2) continue;
    const h = l[0].split(",").map(limpia);
    const iC = h.indexOf("close");
    const iT = h.indexOf("last_trade") >= 0 ? h.indexOf("last_trade") : h.indexOf("created");
    if (iC < 0 || iT < 0) { console.log(`  ${sim} ${a}: faltan columnas (${h.join("|")})`); continue; }
    for (let j = 1; j < l.length; j++) {
      const c = l[j].split(",");
      const d = limpia(c[iT]).slice(0, 10).replace(/-/g, ""), v = Number(limpia(c[iC]));
      if (d.length === 8 && v > 0) out[d] = v;
    }
  }
  const dias = Object.keys(out).sort();
  if (!dias.length) { console.log(`  ${sim}: SIN DATOS`); continue; }
  writeFileSync(`${DIR}/${sim}.json`, JSON.stringify(out), "utf8");
  console.log(`  ${sim.padEnd(6)} ${dias.length} días · ${dias[0]} → ${dias[dias.length - 1]}`);
}

// VALIDACIÓN — el recuento MIENTE. Se abren los ficheros y se miran los valores.
console.log(`\n### Validación\n`);
const v = {};
for (const s of ["VIX", "VIX9D", "VIX3M", "VVIX"]) {
  const f = `${DIR}/${s}.json`;
  if (!existsSync(f)) { console.log(`  ${s}: no se escribió`); continue; }
  v[s] = JSON.parse(readFileSync(f, "utf8"));
  const val = Object.values(v[s]).sort((a, b) => a - b);
  const rango = { VIX: [8, 90], VIX9D: [7, 90], VIX3M: [9, 80], VVIX: [55, 210] }[s];
  const fuera = val.filter((x) => x < rango[0] || x > rango[1]).length;
  console.log(`  ${s.padEnd(6)} min ${val[0].toFixed(2)} · mediana ${val[val.length >> 1].toFixed(2)} · máx ${val[val.length - 1].toFixed(2)} · ` +
    `fuera de rango plausible ${rango[0]}-${rango[1]}: ${fuera} ${fuera ? "⚠️" : "✅"}`);
}
// El VIX9D tiene que estar por DEBAJO del VIX en calma y por ENCIMA en pánico. Si nunca cruza,
// una de las dos series está mal etiquetada.
if (v.VIX && v.VIX9D) {
  const com = Object.keys(v.VIX).filter((d) => v.VIX9D[d]);
  const inv = com.filter((d) => v.VIX9D[d] > v.VIX[d]).length;
  console.log(`\n  VIX9D por encima del VIX (estrés) en ${inv} de ${com.length} días = ${((inv / com.length) * 100).toFixed(0)}%`);
  console.log(`  (si fuera 0% o 100% las series estarían mal; lo normal es entre 10% y 40%)`);
}
// ¿Cubre los 653 días del cóndor?
