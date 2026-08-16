// AUDITORÍA 4 — ¿los contratos "ausentes" tenían de verdad puja 0, o la caché tiene huecos?
// 15 peticiones SECUENCIALES a ThetaData. Solo lectura. No escribe nada en la caché.
// Uso: node scripts/audit-theta-ausentes.mjs

const BASE = process.env.THETA_BASE || "http://127.0.0.1:25503";

// Los 15 ausentes a 30 días de la copia POST-arreglo (salida de audit-ausentes.mjs, sección 6).
const CASOS = [
  ["AMD",  "20240816", 185000, "C", "20240812", 10.85, "20240712"],
  ["NVDA", "20260618", 165000, "C", "20250404", 16,    "20250305"],
  ["NVDA", "20250620",  90000, "C", "20250404", 32.1,  "20250305"],
  ["NVDA", "20251212", 220000, "C", "20251208", 2.77,  "20251107"],
  ["QQQ",  "20250328", 540000, "C", "20250326", 3.95,  "20250224"],
  ["QQQ",  "20260220", 630000, "C", "20260219", 5.79,  "20260120"],
  ["QQQ",  "20260515", 625000, "P", "20260514", 12.2,  "20260414"],
  ["SPY",  "20241025", 435000, "P", "20241023", 0.25,  "20240923"],
  ["SPY",  "20250124", 450000, "P", "20250122", 0.3,   "20241223"],
  ["SPY",  "20250509", 440000, "P", "20250508", 9.53,  "20250408"],
  ["SPY",  "20250523", 405000, "P", "20250519", 1.04,  "20250417"],
  ["SPY",  "20250606", 460000, "P", "20250602", 0.77,  "20250502"],
  ["SPY",  "20250630", 470000, "P", "20250626", 0.41,  "20250527"],
  ["SPY",  "20260206", 585000, "P", "20260205", 0.39,  "20260106"],
  ["SPY",  "20260515", 495000, "P", "20260506", 0.8,   "20260406"],
];

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let n = 0, conBid0 = 0, conBidPos = 0, sinFila = 0, error = 0;
  console.log("sym   exp        strike  R  dia venta   askEnt   →  respuesta de ThetaData");
  console.log("─".repeat(104));
  for (const [sym, exp, k, right, dia, askEnt] of CASOS) {
    const url = `${BASE}/v3/option/history/eod?symbol=${sym}&expiration=${exp}&strike=${k}&right=${right}&start_date=${dia}&end_date=${dia}`;
    n++;
    let txt = "", est = 0;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      est = r.status;
      txt = (await r.text()).trim();
    } catch (e) { error++; console.log(`${sym.padEnd(5)} ${exp}  ${String(k / 1000).padStart(6)}  ${right}  ${dia}  ${String(askEnt).padStart(7)}   → ERROR ${e.message}`); await dormir(300); continue; }

    if (n === 1) console.log(`   [respuesta cruda del primer caso, HTTP ${est}]\n   ${txt.split("\n").slice(0, 2).join("\n   ")}\n`);

    const l = txt.split("\n").filter((x) => x.trim().length);
    if (est !== 200 || l.length < 2) {
      sinFila++;
      console.log(`${sym.padEnd(5)} ${exp}  ${String(k / 1000).padStart(6)}  ${right}  ${dia}  ${String(askEnt).padStart(7)}   → HTTP ${est}, SIN FILA (${l.length} lineas)`);
      await dormir(300); continue;
    }
    const h = l[0].split(",").map((x) => x.trim());
    const iB = h.indexOf("bid"), iA = h.indexOf("ask");
    const c = l[l.length - 1].split(",");
    const bid = Number((c[iB] ?? "").replace(/"/g, "").trim());
    const ask = Number((c[iA] ?? "").replace(/"/g, "").trim());
    const veredicto = !(bid > 0)
      ? "bid = 0  ✔ el −100% es CORRECTO"
      : `bid = ${bid}  ✘ HUECO DE CACHÉ: el retorno real era ${(((bid - askEnt) / askEnt) * 100).toFixed(1)}%, no −100%`;
    if (bid > 0) conBidPos++; else conBid0++;
    console.log(`${sym.padEnd(5)} ${exp}  ${String(k / 1000).padStart(6)}  ${right}  ${dia}  ${String(askEnt).padStart(7)}   → bid ${String(bid).padStart(6)} ask ${String(ask).padStart(6)}  ${veredicto}`);
    await dormir(300);
  }
  console.log("─".repeat(104));
  console.log(`peticiones: ${n} · bid 0 confirmado: ${conBid0} · bid > 0 (hueco): ${conBidPos} · sin fila: ${sinFila} · error: ${error}`);
})();
