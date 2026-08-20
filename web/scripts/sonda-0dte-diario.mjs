// ¿DESDE CUÁNDO EXISTE UN 0DTE DE SPX **TODOS LOS DÍAS**?
//
// ThetaData sí sirve cadenas desde 2020 — eso ya está comprobado. Pero eso NO significa que el
// cóndor diario se pudiera operar: hasta 2022 SPX vencía lunes, miércoles y viernes. Los martes
// y jueves NO tenían contrato, así que no había nada que vender.
//
// La prueba decisiva: coger un MARTES y un JUEVES de cada año y ver si existe cadena ESE día
// con vencimiento ESE día. Si no existe, ese año no se puede incluir en el backtest — y decirlo,
// no rellenarlo.
const B = (process.env.THETA_BASE || "http://127.0.0.1:25503").replace(/\/+$/, "").replace(/\/v3$/, "") + "/v3";

async function filas(d) {
  try {
    const r = await fetch(`${B}/option/history/greeks/implied_volatility?symbol=SPXW&expiration=${d}&start_date=${d}&end_date=${d}&right=C&interval=5m`,
      { signal: AbortSignal.timeout(60_000) });
    const t = (await r.text()).trim();
    return r.ok ? Math.max(0, t.split("\n").filter(Boolean).length - 1) : 0;
  } catch { return 0; }
}
const nombre = (d) => ["dom", "LUN", "MAR", "MIÉ", "JUE", "VIE", "sáb"][new Date(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T12:00:00Z`).getUTCDay()];

// Una semana completa de cada año (mediados de junio, sin festivos).
const SEMANAS = {
  2020: ["20200615","20200616","20200617","20200618","20200619"],
  2021: ["20210614","20210615","20210616","20210617","20210618"],
  2022: ["20220606","20220607","20220608","20220609","20220610"],
  2023: ["20230612","20230613","20230614","20230615","20230616"],
};
console.log("\n═══ UNA SEMANA ENTERA DE CADA AÑO · ¿hay 0DTE cada día? ═══\n");
for (const [ano, dias] of Object.entries(SEMANAS)) {
  const out = [];
  for (const d of dias) { const n = await filas(d); out.push(`${nombre(d)} ${n ? String(n).padStart(5) : "  ---"}`); }
  const completos = out.filter((x) => !x.includes("---")).length;
  console.log(`  ${ano}:  ${out.join(" · ")}   →  ${completos}/5 días` + (completos === 5 ? "  ✅ DIARIO" : "  ❌ no es diario"));
}
