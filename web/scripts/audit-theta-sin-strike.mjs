// LA PETICIÓN 20 (y última) — misma consulta pero SIN los parámetros strike/right, que es el
// formato que usa el descargador. Verifica dos cosas de un tiro:
//   a) el control positivo: SPY 20241025 300C, que la caché dice bid 277,97
//   b) el ausente real:     SPY 20241025 435P el 20241023 (entrada 20240923 al ask 0,25)
// Solo lectura. Uso: node scripts/audit-theta-sin-strike.mjs

const B = process.env.THETA_BASE || "http://127.0.0.1:25503";
const url = `${B}/v3/option/history/eod?symbol=SPY&expiration=20241025&start_date=20241023&end_date=20241023`;

console.log(`GET ${url}\n`);
const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
const txt = (await r.text()).trim();
console.log(`HTTP ${r.status} · ${txt.split("\n").length} líneas\n`);
if (txt.split("\n").length < 2) { console.log(txt.slice(0, 300)); process.exit(0); }

const l = txt.split("\n");
const h = l[0].split(",").map((x) => x.replace(/"/g, "").trim());
console.log(`cabecera: ${h.join(" | ")}\n`);
const iK = h.indexOf("strike"), iR = h.indexOf("right"), iB = h.indexOf("bid"), iA = h.indexOf("ask"),
      iV = h.indexOf("volume"), iC = h.indexOf("close");
const num = (s) => Number(String(s).replace(/"/g, "").trim());

let c300 = null, p435 = null, filas = 0, conBid0 = 0;
for (let j = 1; j < l.length; j++) {
  const c = l[j].split(",");
  if (c.length < 3) continue;
  filas++;
  const K = num(c[iK]), R = String(c[iR]).replace(/"/g, "").trim().toUpperCase();
  const bid = num(c[iB]), ask = num(c[iA]);
  if (!(bid > 0)) conBid0++;
  if (R.startsWith("C") && (K === 300 || K === 300000)) c300 = { K, bid, ask, vol: iV >= 0 ? num(c[iV]) : null, close: iC >= 0 ? num(c[iC]) : null };
  if (R.startsWith("P") && (K === 435 || K === 435000)) p435 = { K, bid, ask, vol: iV >= 0 ? num(c[iV]) : null, close: iC >= 0 ? num(c[iC]) : null };
}
console.log(`filas de contrato: ${filas} · con bid <= 0: ${conBid0} (${((conBid0 / filas) * 100).toFixed(1)}%)\n`);
console.log(`CONTROL POSITIVO  SPY 20241025 300 C → ${c300 ? JSON.stringify(c300) : "NO APARECE"}`);
console.log(`   (la caché dice bid 277,97 / ask 279,08)`);
console.log(`\nAUSENTE REAL      SPY 20241025 435 P → ${p435 ? JSON.stringify(p435) : "NO APARECE EN LA RESPUESTA DE THETA TAMPOCO"}`);
if (p435) {
  const ask0 = 0.25;
  console.log(`   entrada al ask ${ask0} el 20240923 → retorno real = ${(((p435.bid - ask0) / ask0) * 100).toFixed(1)}%` +
              (p435.bid > 0 ? "   ✘ el −100% del test es FALSO para este contrato" : "   ✔ bid 0: el −100% es correcto"));
}
