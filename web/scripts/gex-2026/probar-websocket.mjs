// PRUEBA DEL WEBSOCKET DE THETADATA — con el mercado abierto.
//
// La pregunta: ¿la suscripción de Lester (Options: STANDARD) permite el stream de operaciones?
// Con el mercado cerrado no se puede distinguir "no tienes permiso" de "no hay nada que mandar":
// las dos cosas se ven como silencio. Por eso esto hay que correrlo en sesión.
//
// Si llegan trades: se puede montar el Institutional Flow Tape y, más importante, MEDIR si el
// desequilibrio compra/venta predice algo. Si llega un error de permisos, sabemos qué plan pedir.
//
// El stream vive en el puerto 25520, distinto del 25503 del resto de la API. Solo admite UNA
// conexión a la vez.
//
// Uso: node scripts/gex-2026/probar-websocket.mjs [segundos]

const URL = process.env.THETA_WS || "ws://127.0.0.1:25520/v1/events";
const SEGUNDOS = Number(process.argv[2]) || 90;
const hoyET = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const ahoraET = () => new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false });

const cuenta = { total: 0, trades: 0, quotes: 0, status: new Map(), errores: [] };
const muestra = [];

console.log(`═══ PRUEBA DEL STREAM · ${hoyET()} ${ahoraET()} ET ═══`);
console.log(`   ${URL} · escuchando ${SEGUNDOS} s\n`);

if (typeof WebSocket === "undefined") { console.log("✗ este Node no trae WebSocket nativo"); process.exit(1); }
const ws = new WebSocket(URL);
let conectado = false;

ws.onopen = () => {
  conectado = true;
  console.log("✓ conectado\n");
  // Suscripción al stream de operaciones de SPXW (todo el root, no un contrato suelto).
  const sub = { msg_type: "STREAM", sec_type: "OPTION", req_type: "TRADE", add: true, id: 1, contract: { root: "SPXW" } };
  ws.send(JSON.stringify(sub));
  console.log(`→ pedido: ${JSON.stringify(sub)}\n`);
};

ws.onmessage = (e) => {
  cuenta.total++;
  let m;
  try { m = JSON.parse(String(e.data)); } catch { return; }
  const tipo = m?.header?.type ?? "?";
  if (tipo === "STATUS") {
    const s = m.header.status ?? "?";
    cuenta.status.set(s, (cuenta.status.get(s) ?? 0) + 1);
    if (cuenta.status.get(s) === 1) console.log(`  STATUS: ${s}`);
    if (/DENIED|PERMISSION|UNAUTH|FORBID/i.test(s)) cuenta.errores.push(s);
    return;
  }
  if (tipo === "TRADE") {
    cuenta.trades++;
    if (muestra.length < 8) { muestra.push(m); console.log(`  TRADE: ${JSON.stringify(m).slice(0, 220)}`); }
    return;
  }
  if (tipo === "QUOTE") { cuenta.quotes++; return; }
  if (cuenta.total < 5) console.log(`  ${tipo}: ${JSON.stringify(m).slice(0, 200)}`);
};

ws.onerror = (e) => console.log(`  ✗ error: ${String(e?.message ?? e).slice(0, 160)}`);
ws.onclose = (e) => console.log(`  cerrado: código ${e.code} ${String(e.reason ?? "").slice(0, 120)}`);

setTimeout(() => {
  console.log(`\n═══ RESULTADO ═══`);
  console.log(`   conectado: ${conectado ? "sí" : "NO"}`);
  console.log(`   mensajes: ${cuenta.total}  ·  trades: ${cuenta.trades}  ·  quotes: ${cuenta.quotes}`);
  console.log(`   estados: ${[...cuenta.status.entries()].map(([k, v]) => `${k}×${v}`).join(", ") || "ninguno"}`);
  console.log("");
  if (cuenta.trades > 0) {
    console.log(`   ✓ EL STREAM FUNCIONA. ${cuenta.trades} operaciones en ${SEGUNDOS} s`);
    console.log(`     -> se puede montar el flow tape Y, lo que importa, medir si el`);
    console.log(`        desequilibrio compra/venta predice algo.`);
  } else if (cuenta.errores.length) {
    console.log(`   ✗ RECHAZADO POR PERMISOS: ${cuenta.errores[0]}`);
    console.log(`     -> hay que mirar qué plan incluye el streaming antes de gastar nada.`);
  } else if (cuenta.status.get("DISCONNECTED")) {
    console.log(`   ✗ El Terminal no alcanza los servidores de streaming (estado DISCONNECTED).`);
    console.log(`     No es de permisos: es conectividad. Mirar el log del Terminal por [FPSS],`);
    console.log(`     y si persiste, sospechar del firewall/Norton — ya nos rompió el TLS una vez.`);
  } else {
    console.log(`   ? Conectado y en silencio. Si el mercado está abierto, algo falla en la`);
    console.log(`     suscripción: revisar el formato del mensaje contra docs.thetadata.us/Streaming.`);
  }
  try { ws.close(); } catch { /* ya cerrado */ }
  process.exit(0);
}, SEGUNDOS * 1000);
