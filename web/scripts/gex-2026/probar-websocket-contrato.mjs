// PRUEBA DEL STREAM, PERO POR CONTRATO — no por root entero.
//
// Por qué existe este segundo script: `probar-websocket.mjs` se suscribe con
// {"contract":{"root":"SPXW"}}, o sea el root completo. ThetaData confirmó (2026-08-11) que
// Options STANDARD permite streaming de hasta 15.000 contratos, pero que "the full market-wide
// trade stream (every option trade in one subscription) is only available on Pro". Una
// suscripción por root podría caer del lado de Pro.
//
// Aquí se pide UN contrato concreto. Y la prueba no depende de que lleguen operaciones —con el
// mercado cerrado no van a llegar—: lo que se mira es si /v3/terminal/fpss/status pasa a
// CONNECTED. Eso separa "el formato no vale" de "no hay nada que mandar".
//
// Uso: node scripts/gex-2026/probar-websocket-contrato.mjs [expiración] [strike] [C|P] [segundos]

const WS = process.env.THETA_WS || "ws://127.0.0.1:25520/v1/events";
const B = process.env.THETA_BASE || "http://127.0.0.1:25503/v3";
const EXP = process.argv[2] || "2026-08-12";
const STRIKE = Number(process.argv[3] || 7730);
const RIGHT = (process.argv[4] || "C").toUpperCase();
const SEGUNDOS = Number(process.argv[5]) || 40;

const estado = async (cual) => {
  try {
    const r = await fetch(`${B}/terminal/${cual}/status`, { signal: AbortSignal.timeout(6000) });
    return (await r.text()).trim();
  } catch { return "sin respuesta"; }
};

console.log(`═══ STREAM POR CONTRATO · SPXW ${EXP} ${STRIKE}${RIGHT} ═══`);
console.log(`   fpss antes: ${await estado("fpss")}  ·  mdds: ${await estado("mdds")}\n`);

const ws = new WebSocket(WS);
const cuenta = { total: 0, trades: 0, status: new Map() };

ws.onopen = () => {
  console.log("✓ conectado al Terminal");
  // El contrato entero, no solo el root. Ese es todo el cambio respecto al otro script.
  const sub = {
    msg_type: "STREAM", sec_type: "OPTION", req_type: "TRADE", add: true, id: 1,
    contract: { root: "SPXW", expiration: EXP.replaceAll("-", ""), strike: STRIKE * 1000, right: RIGHT },
  };
  ws.send(JSON.stringify(sub));
  console.log(`→ ${JSON.stringify(sub)}\n`);
};

ws.onmessage = (e) => {
  cuenta.total++;
  let m; try { m = JSON.parse(String(e.data)); } catch { return; }
  const t = m?.header?.type ?? "?";
  if (t === "STATUS") {
    const s = m.header.status ?? "?";
    cuenta.status.set(s, (cuenta.status.get(s) ?? 0) + 1);
    if (cuenta.status.get(s) === 1) console.log(`  STATUS: ${s}`);
    return;
  }
  if (t === "TRADE") { cuenta.trades++; if (cuenta.trades <= 5) console.log(`  TRADE: ${JSON.stringify(m).slice(0, 200)}`); return; }
  if (cuenta.total < 6) console.log(`  ${t}: ${JSON.stringify(m).slice(0, 180)}`);
};
ws.onerror = (e) => console.log(`  ✗ ${String(e?.message ?? e).slice(0, 140)}`);

// Sondear el estado de FPSS mientras corre: es lo que de verdad responde la pregunta.
const marcas = [];
const reloj = setInterval(async () => marcas.push(`${marcas.length * 5 + 5}s=${await estado("fpss")}`), 5000);

setTimeout(async () => {
  clearInterval(reloj);
  console.log(`\n═══ RESULTADO ═══`);
  console.log(`   fpss durante: ${marcas.join("  ")}`);
  console.log(`   fpss final: ${await estado("fpss")}`);
  console.log(`   mensajes: ${cuenta.total}  ·  trades: ${cuenta.trades}`);
  console.log(`   estados: ${[...cuenta.status.entries()].map(([k, v]) => `${k}×${v}`).join(", ") || "ninguno"}\n`);

  const fin = await estado("fpss");
  if (cuenta.trades > 0) console.log("   ✓ LLEGAN OPERACIONES. El stream por contrato funciona.");
  else if (fin === "CONNECTED")
    console.log("   ✓ FPSS CONECTÓ. La suscripción es válida; con el mercado cerrado no hay\n     operaciones que mandar. Repetir en sesión para confirmar que llegan trades.");
  else
    console.log("   ✗ FPSS sigue sin conectar. No es el formato por contrato: el Terminal no\n     alcanza sus servidores de streaming.");
  try { ws.close(); } catch { /* ya cerrado */ }
  process.exit(0);
}, SEGUNDOS * 1000);
