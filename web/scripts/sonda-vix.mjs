// ¿QUÉ ÍNDICES DE VOLATILIDAD ME SIRVE LA SUSCRIPCIÓN? — y sobre todo, ¿INTRADÍA?
//
// OJO AL PUNTO QUE DECIDE TODO: para filtrar una entrada de las 11:00 hace falta el VIX DE LAS
// 11:00. Usar el cierre del VIX para decidir si entrar a las 11:00 es mirar al futuro, y es
// exactamente el fallo que ya nos costó dos hallazgos. Si sólo hay EOD, el grupo 2 NO se puede
// medir sin contaminar — y eso hay que saberlo ANTES de gastar una descarga.
//
// Se prueba con SPX de control: si SPX responde y VIX no, es la suscripción, no el Terminal.

const B = (process.env.THETA_BASE || "http://127.0.0.1:25503").replace(/\/+$/, "") + "/v3";
const SIMS = ["SPX", "VIX", "VIX9D", "VIX3M", "VVIX", "SPXW"];

async function probar(ruta, etiqueta) {
  try {
    const r = await fetch(`${B}/${ruta}`, { signal: AbortSignal.timeout(30_000) });
    const t = (await r.text()).trim();
    const lin = t.split("\n").filter(Boolean);
    // TRAMPA CONOCIDA: HTTP 200 con cuerpo vacío se lee como "funciona". Se valida por FILAS.
    const filas = Math.max(0, lin.length - 1);
    return { ok: r.ok && filas > 0, http: r.status, filas,
             muestra: filas ? lin[1].slice(0, 70) : t.slice(0, 90).replace(/\s+/g, " ") };
  } catch (e) { return { ok: false, http: "—", filas: 0, muestra: e.message.slice(0, 60) }; }
}

console.log(`\n═══ 1 · CIERRE DIARIO (EOD) ═══\n`);
for (const s of SIMS.slice(0, 5)) {
  const r = await probar(`index/history/eod?symbol=${s}&start_date=20260810&end_date=20260814`, s);
  console.log(`  ${s.padEnd(6)} ${r.ok ? "✅" : "❌"} http ${String(r.http).padEnd(4)} ${String(r.filas).padStart(3)} filas   ${r.muestra}`);
}

console.log(`\n═══ 2 · INTRADÍA — LO QUE DE VERDAD HACE FALTA ═══\n`);
// Varias formas de pedir intradía; no sé cuál expone v3 para índices, así que se prueban.
const RUTAS = [
  ["ohlc 5m",  (s) => `index/history/ohlc?symbol=${s}&start_date=20260811&end_date=20260811&interval=5m`],
  ["ohlc 1h",  (s) => `index/history/ohlc?symbol=${s}&start_date=20260811&end_date=20260811&interval=1h`],
  ["price",    (s) => `index/history/price?symbol=${s}&start_date=20260811&end_date=20260811&interval=5m`],
  ["quote",    (s) => `index/history/quote?symbol=${s}&start_date=20260811&end_date=20260811&interval=5m`],
];
for (const s of ["SPX", "VIX"]) {
  for (const [nom, f] of RUTAS) {
    const r = await probar(f(s), s);
    console.log(`  ${s.padEnd(4)} ${nom.padEnd(9)} ${r.ok ? "✅" : "❌"} http ${String(r.http).padEnd(4)} ${String(r.filas).padStart(4)} filas   ${r.muestra}`);
  }
}

console.log(`\n═══ 3 · ¿HASTA DÓNDE LLEGA LA HISTORIA DEL VIX? ═══\n`);
for (const a of ["2024", "2025"]) {
  const r = await probar(`index/history/eod?symbol=VIX&start_date=${a}0102&end_date=${a}0110`, "VIX");
  console.log(`  enero ${a}  ${r.ok ? "✅" : "❌"} ${r.filas} filas   ${r.muestra}`);
}
