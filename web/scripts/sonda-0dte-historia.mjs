// ¿HASTA DÓNDE ATRÁS HAY 0DTE DE SPX? — la pregunta de Lester: ¿se puede validar desde 2020?
//
// Dos límites distintos, y hay que separarlos:
//   1. EL MERCADO: SPX no tuvo vencimientos TODOS los días hasta 2022. Antes eran lunes,
//      miércoles y viernes, y más atrás sólo viernes. Un cóndor 0DTE diario no EXISTÍA.
//   2. LA SUSCRIPCIÓN: aunque el contrato existiera, ThetaData puede no servirlo.
// Se comprueban los dos, año por año, pidiendo un día real de cada uno.

const B = (process.env.THETA_BASE || "http://127.0.0.1:25503").replace(/\/+$/, "").replace(/\/v3$/, "") + "/v3";

async function probar(ruta) {
  try {
    const r = await fetch(B + "/" + ruta, { signal: AbortSignal.timeout(60_000) });
    const t = (await r.text()).trim();
    const l = t.split("\n").filter(Boolean);
    // HTTP 200 con cuerpo vacío se lee como "funciona". Se valida por FILAS.
    return { http: r.status, filas: Math.max(0, l.length - 1), msg: l.length < 2 ? t.slice(0, 90).replace(/\s+/g, " ") : "" };
  } catch (e) { return { http: "—", filas: 0, msg: e.message.slice(0, 60) }; }
}

// Un miércoles de mediados de junio de cada año — día hábil seguro y sin festivos cerca.
const DIAS = ["20200617", "20210616", "20220615", "20230614", "20240612", "20250618", "20260617"];

console.log("\n═══ ¿HAY CADENA 0DTE DE SPXW ESE MISMO DÍA? ═══\n");
for (const d of DIAS) {
  const iv = await probar(`option/history/greeks/implied_volatility?symbol=SPXW&expiration=${d}&start_date=${d}&end_date=${d}&right=C&interval=5m`);
  const oi = await probar(`option/history/open_interest?symbol=SPXW&expiration=${d}&start_date=${d}&end_date=${d}`);
  console.log(`  ${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}  cadena 5m: http ${String(iv.http).padEnd(4)} ${String(iv.filas).padStart(6)} filas  ·  ` +
              `interés abierto: http ${String(oi.http).padEnd(4)} ${String(oi.filas).padStart(5)} filas` +
              (iv.filas ? "  ✅" : `  ❌ ${iv.msg}`));
}

console.log("\n═══ ¿Y CUÁNTOS VENCIMIENTOS POR SEMANA HABÍA? ═══\n");
console.log("   (si sólo hay lunes/miércoles/viernes, el cóndor DIARIO no existía)\n");
for (const [ini, fin, et] of [["20200601","20200612","2020"],["20220601","20220610","2022"],["20240603","20240607","2024"]]) {
  const d = await probar(`option/list/expirations?symbol=SPXW&start_date=${ini}&end_date=${fin}`);
  console.log(`   ${et}: http ${d.http} · ${d.filas} vencimientos listados en esas dos semanas`);
}
