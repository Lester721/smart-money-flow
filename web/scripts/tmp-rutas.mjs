// Golpea todas las rutas de la API y dice cuáles sobreviven sin Massive.
const BASE = process.env.BASE || "http://localhost:8000";
const RUTAS = [
  ["bars",          "/api/bars?ticker=SPY"],
  ["chain",         "/api/chain?ticker=SPY"],
  ["credit-spread", "/api/credit-spread"],
  ["flow",          "/api/flow?ticker=SPY"],
  ["forward-gex",   "/api/forward-gex"],
  ["gex",           "/api/gex?ticker=SPY"],
  ["gex/vencim.",   "/api/gex/vencimientos?ticker=SPY"],
  ["history",       "/api/history?ticker=SPY"],
  ["ideas",         "/api/ideas"],
  ["logo",          "/api/logo?ticker=SPY"],
  ["news",          "/api/news"],
  ["prediction",    "/api/prediction?ticker=SPY"],
  ["validation",    "/api/validation?ticker=SPY"],
  ["watchlist",     "/api/watchlist"],
  ["wheel",         "/api/wheel"],
];
console.log(`sin MASSIVE_API_KEY · ${BASE}\n`);
console.log("ruta            estado  qué devuelve");
for (const [n, url] of RUTAS) {
  let est = "?", nota = "";
  try {
    const r = await fetch(BASE + url, { signal: AbortSignal.timeout(90_000) });
    est = String(r.status);
    const t = await r.text();
    const massive = /MASSIVE_API_KEY|MassiveError/i.test(t);
    if (r.ok) {
      let j = null; try { j = JSON.parse(t); } catch {}
      const vacio = !t || t === "[]" || t === "{}" || (j && Array.isArray(j) && !j.length);
      nota = massive ? "OK pero MENCIONA massive" : vacio ? "OK pero VACÍO" : `OK · ${t.length} bytes`;
    } else {
      nota = massive ? "✗ NECESITA MASSIVE" : `✗ ${t.replace(/\s+/g," ").slice(0, 70)}`;
    }
  } catch (e) { est = "---"; nota = `✗ ${e.message.slice(0, 60)}`; }
  console.log(`  ${n.padEnd(14)} ${est.padEnd(6)} ${nota}`);
}
