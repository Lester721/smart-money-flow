// REFUTACION - el eje VIRGEN: la HORA de entrada.
// La regla (+-45, por encima de MA5 y MA50) se eligio con la foto de las 11:00. La hora nunca se
// barrio. Si el mecanismo es racimo de volatilidad, tiene que aparecer a CUALQUIER hora.
// Aqui se construye la misma tabla a 10:00, 11:00, 12:00, 13:00 y 14:00 y ademas con alas de 25.
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const HORAS = ["10:00", "11:00", "12:00", "13:00", "14:00"];
const COMM = 0.03;
const DIST = [25, 30, 35, 40, 45, 50];
const ALAS = [50, 25];

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error("faltan columnas en " + f);
  const [iK, iT, iB, iA, iU] = idx;
  const porHora = Object.fromEntries(HORAS.map((h) => [h, []]));
  let cierre = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const h = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && h >= hFin) { hFin = h; cierre = sp; }
    if (!porHora[h]) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) porHora[h].push({ K, bid, ask, spot: sp });
  }
  return { porHora, cierre, hFin };
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

const fechas = [...new Set(readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
console.log(`${fechas.length} sesiones con fichero de calls`);

const dias = [];
let sinCierre16 = 0;
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) continue;
  if (C.hFin !== "16:00") sinCierre16++;
  const fila = { fecha, ano: fecha.slice(0, 4), cierre: C.cierre, hFin: C.hFin, sp: {}, pnl: {}, cred: {} };
  let ok = false;
  for (const h of HORAS) {
    const fc = C.porHora[h], fp = P.porHora[h];
    if (!fc.length || !fp.length) continue;
    const sph = fc[0].spot;
    if (!(sph > 0)) continue;
    fila.sp[h] = sph;
    for (const ala of ALAS) for (const dist of DIST) {
      const cC = cerca(fc, sph + dist), pC = cerca(fp, sph - dist);
      const cL = cerca(fc, cC.K + ala), pL = cerca(fp, pC.K - ala);
      if (cL.K <= cC.K || pL.K >= pC.K) continue;
      const cred = cC.bid + pC.bid - cL.ask - pL.ask;
      if (!(cred > 0)) continue;
      const S = C.cierre;
      const pl = (cred - Math.min(Math.max(S - cC.K, 0), cL.K - cC.K)
                       - Math.min(Math.max(pC.K - S, 0), pC.K - pL.K)) * 100 - 8 * COMM;
      fila.pnl[`${h}|${dist}|${ala}`] = pl;
      fila.cred[`${h}|${dist}|${ala}`] = cred * 100;
      if (h === "11:00" && dist === 45 && ala === 50) ok = true;
    }
  }
  if (Object.keys(fila.sp).length) dias.push(fila);
}
console.log(`${dias.length} dias con al menos una hora - sin ultima marca a las 16:00: ${sinCierre16}`);
for (const h of HORAS) console.log(`  ${h}: ${dias.filter((d) => d.sp[h] != null).length} dias con foto - con condor +-45/alas50: ${dias.filter((d) => d.pnl[`${h}|45|50`] != null).length}`);
writeFileSync("scripts/refutar-amplitud-horas.json", JSON.stringify({ HORAS, DIST, ALAS, dias }));
console.log(`escrito ${dias[0].fecha} a ${dias[dias.length - 1].fecha}`);
