// Diagnóstico: ¿por qué /option/history/quote devuelve NOT_FOUND en medir-eva-flujo
// pero SÍ funcionó dentro de bajar-flujo-historico?
//
// Prueba el MISMO contrato con variantes de formato, una por una, y enseña el código
// y las primeras filas. Un argumento mal formateado no da error: devuelve vacío.
const B = (process.env.THETA_BASE || "http://127.0.0.1:25503").replace(/\/+$/, "") + "/v3";

async function probar(nombre, qs) {
  const url = `${B}/option/history/quote?${qs}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(45_000) });
    const t = await r.text();
    const lineas = t.trim().split("\n");
    const ok = r.ok && lineas.length > 1;
    console.log(`${ok ? "OK  " : "FALLO"} ${r.status} · ${lineas.length - 1} filas · ${nombre}`);
    if (ok) console.log(`        cab: ${lineas[0].slice(0, 90)}`);
    else console.log(`        ${t.slice(0, 160).replace(/\n/g, " ")}`);
    console.log(`        ${qs}`);
  } catch (e) {
    console.log(`ERROR      ${nombre} · ${e.message}`);
  }
}

// Contrato real, sacado de SPY_20240102.json (tiene bid 53.29 / ask 54.06 guardados,
// así que la cotización EXISTE y el descargador la consiguió).
const base = { symbol: "SPY", expiration: "20240119", strike: "420", right: "C" };

console.log("contrato: SPY 2024-01-19 C 420 · día 2024-01-02 (bid/ask guardados: 53.29 / 54.06)\n");

await probar("como lo pide EVA (interval=1m)",
  `symbol=SPY&expiration=20240119&strike=420&right=C&start_date=20240102&end_date=20240102&interval=1m`);

await probar("strike en milésimas (420000)",
  `symbol=SPY&expiration=20240119&strike=420000&right=C&start_date=20240102&end_date=20240102&interval=1m`);

await probar("right en minúscula",
  `symbol=SPY&expiration=20240119&strike=420&right=c&start_date=20240102&end_date=20240102&interval=1m`);

await probar("sin interval",
  `symbol=SPY&expiration=20240119&strike=420&right=C&start_date=20240102&end_date=20240102`);

await probar("interval=60000 (milisegundos)",
  `symbol=SPY&expiration=20240119&strike=420&right=C&start_date=20240102&end_date=20240102&interval=60000`);

await probar("fechas con guiones",
  `symbol=SPY&expiration=2024-01-19&strike=420&right=C&start_date=2024-01-02&end_date=2024-01-02&interval=1m`);

await probar("strike decimal 420.0",
  `symbol=SPY&expiration=20240119&strike=420.0&right=C&start_date=20240102&end_date=20240102&interval=1m`);

// Y el control: el endpoint que SÍ sabemos que va (operaciones con comodín).
console.log("\ncontrol — el que sí funciona en el descargador:");
const r = await fetch(`${B}/option/history/trade?symbol=SPY&expiration=*&start_date=20240102&end_date=20240102`,
  { signal: AbortSignal.timeout(180_000) });
const t = await r.text();
console.log(`  ${r.ok ? "OK" : "FALLO"} ${r.status} · ${t.trim().split("\n").length - 1} filas`);
