// ¿Funciona la cookie de MarketSnack? Y de paso, ¿qué devuelve su flujo?
//
// No imprime la cookie NUNCA — solo su longitud y si autentica. Es una credencial de la sesión
// de Lester: sirve para entrar a su cuenta, así que no acaba en la consola ni en un log.
//
// Uso: node scripts/marketsnack/probar-cookie.mjs [TICKER]

import fs from "node:fs";

const BASE = "https://app.marketsnack.com";
const TICKER = (process.argv[2] || "SPX").toUpperCase();

// Se lee .env.local a mano: este script se corre suelto, fuera de Next.js.
function cookie() {
  let txt;
  try { txt = fs.readFileSync(".env.local", "utf8"); }
  catch { return null; }
  const m = txt.split("\n").find((l) => l.startsWith("MARKETSNACK_COOKIE="));
  if (!m) return null;
  const v = m.slice("MARKETSNACK_COOKIE=".length).trim();
  return v || null;
}

const C = cookie();
if (!C) {
  console.log("✗ MARKETSNACK_COOKIE está vacía o no existe en web/.env.local");
  process.exit(1);
}
console.log(`✓ cookie encontrada · ${C.length} caracteres · ${C.split(";").length} pares nombre=valor`);
console.log(`   (no se imprime el valor: es una credencial)\n`);

async function pedir(ruta) {
  const r = await fetch(`${BASE}${ruta}`, {
    headers: { Accept: "application/json", Cookie: C },
    redirect: "manual",
    signal: AbortSignal.timeout(45000),
  });
  const ct = r.headers.get("content-type") || "";
  let cuerpo = null;
  if (ct.includes("json")) { try { cuerpo = await r.json(); } catch { /* no era json */ } }
  else { cuerpo = (await r.text()).slice(0, 160); }
  return { estado: r.status, tipo: ct.split(";")[0], cuerpo };
}

const RUTAS = [
  `/api/flow_feed?filter[scope]=all&filter[symbol][]=${TICKER}&period=1d`,
  `/api/flow_feed?filter[scope]=all&period=1d&filter[premium][gte]=250000`,
];

for (const ruta of RUTAS) {
  console.log(`── ${ruta.slice(0, 92)}`);
  try {
    const r = await pedir(ruta);
    if (r.estado === 401 || r.estado === 403 || (r.estado >= 300 && r.estado < 400)) {
      console.log(`   ✗ ${r.estado} — la sesión no vale. Hay que volver a copiar la cookie.\n`);
      continue;
    }
    if (r.estado !== 200) { console.log(`   ✗ ${r.estado} · ${r.tipo}\n`); continue; }

    const lista = r.cuerpo?.list ?? r.cuerpo?.data ?? (Array.isArray(r.cuerpo) ? r.cuerpo : null);
    console.log(`   ✓ 200 · ${r.tipo}`);
    if (!lista) { console.log(`   claves de la respuesta: ${Object.keys(r.cuerpo ?? {}).join(", ")}\n`); continue; }
    console.log(`   registros: ${lista.length}  ·  hay página siguiente: ${r.cuerpo?.meta?.next_page_token ? "sí" : "no"}`);
    if (lista[0]) {
      console.log(`   campos de cada operación:`);
      console.log(`     ${Object.keys(lista[0]).join(", ")}`);
      console.log(`   primer registro:`);
      console.log(`     ${JSON.stringify(lista[0]).slice(0, 400)}`);
      const fechas = lista.map((t) => t.timestamp ?? t.time ?? t.created_at).filter(Boolean).sort();
      if (fechas.length) console.log(`   rango de fechas en esta página: ${fechas[0]}  →  ${fechas[fechas.length - 1]}`);
    }
    console.log("");
  } catch (e) {
    console.log(`   ✗ ${String(e.message).slice(0, 100)}\n`);
  }
}
