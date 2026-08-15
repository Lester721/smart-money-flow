// CANAL DE TELEGRAM — para avisar a Lester cuando no está delante del ordenador, y para leer
// lo que conteste.
//
// Uso:
//   node --env-file=.env.local scripts/telegram.mjs --enviar "texto"
//   node --env-file=.env.local scripts/telegram.mjs --enviar-fichero informe.md
//   node --env-file=.env.local scripts/telegram.mjs --esperar [minutos]   (espera una respuesta)
//   node --env-file=.env.local scripts/telegram.mjs --leer                (lo no leído, sin esperar)
//
// El `--esperar` usa long-polling: se queda escuchando y TERMINA en cuanto llega un mensaje, así
// que sirve para lanzarlo en segundo plano y enterarme en cuanto conteste.
//
// El offset de los mensajes ya leídos se guarda en data/telegram-offset.json para no releer lo
// mismo dos veces. NUNCA se imprime el token.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;
if (!TOKEN || !CHAT) { console.error("Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en .env.local"); process.exit(1); }

const API = `https://api.telegram.org/bot${TOKEN}`;
const OFFSET = "data/telegram-offset.json";
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const bandera = (n) => process.argv.includes(n);

const leerOffset = () => { try { return JSON.parse(readFileSync(OFFSET, "utf8")).offset ?? 0; } catch { return 0; } };
const guardarOffset = (o) => {
  if (!existsSync(dirname(OFFSET))) mkdirSync(dirname(OFFSET), { recursive: true });
  writeFileSync(OFFSET, JSON.stringify({ offset: o }), "utf8");
};

async function api(metodo, cuerpo, ms = 30_000) {
  const r = await fetch(`${API}/${metodo}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(ms),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`${metodo}: ${j.description || "error"}`);
  return j.result;
}

async function enviar(texto) {
  // Telegram corta a los 4096 caracteres: se parte por líneas, sin romper palabras a la mitad.
  const trozos = [];
  let actual = "";
  for (const linea of String(texto).split("\n")) {
    if ((actual + linea + "\n").length > 3900) { trozos.push(actual); actual = ""; }
    actual += linea + "\n";
  }
  if (actual.trim()) trozos.push(actual);
  for (const t of trozos) await api("sendMessage", { chat_id: CHAT, text: t, disable_web_page_preview: true });
  console.log(`enviado (${trozos.length} mensaje${trozos.length > 1 ? "s" : ""}, ${texto.length} caracteres)`);
}

/** Espera hasta `minutos` a que llegue un mensaje. Termina en cuanto llega uno. */
async function esperar(minutos) {
  const hasta = Date.now() + minutos * 60_000;
  let offset = leerOffset();
  console.log(`escuchando Telegram hasta ${minutos} min…`);
  while (Date.now() < hasta) {
    let ups = [];
    try {
      // timeout=50 → long-polling: el servidor aguanta 50s antes de responder vacío.
      ups = await api("getUpdates", { offset, timeout: 50, allowed_updates: ["message"] }, 60_000);
    } catch (e) {
      if (!/timeout|abort/i.test(e.message)) console.error(`  (reintentando: ${e.message})`);
      continue;
    }
    for (const u of ups) {
      offset = u.update_id + 1;
      const m = u.message;
      if (!m?.text) continue;
      if (String(m.chat?.id) !== String(CHAT)) continue;      // sólo el chat de Lester
      guardarOffset(offset);
      const cuando = new Date(m.date * 1000).toLocaleString("sv-SE", { timeZone: "America/New_York" }).slice(0, 16);
      console.log(`\n📩 MENSAJE DE LESTER (${cuando} ET):`);
      console.log(m.text);
      process.exit(0);
    }
    if (ups.length) guardarOffset(offset);
  }
  console.log("no contestó en el plazo.");
  process.exit(1);
}

/** Lo no leído, sin quedarse esperando. */
async function leer() {
  let offset = leerOffset();
  const ups = await api("getUpdates", { offset, timeout: 0, allowed_updates: ["message"] });
  const mios = ups.filter((u) => u.message?.text && String(u.message.chat?.id) === String(CHAT));
  if (!mios.length) { console.log("(nada nuevo)"); return; }
  for (const u of mios) {
    const m = u.message;
    const cuando = new Date(m.date * 1000).toLocaleString("sv-SE", { timeZone: "America/New_York" }).slice(0, 16);
    console.log(`📩 ${cuando} ET: ${m.text}`);
    offset = u.update_id + 1;
  }
  guardarOffset(offset);
}

try {
  if (bandera("--esperar")) await esperar(Number(arg("--esperar") || 60));
  else if (bandera("--leer")) await leer();
  else if (bandera("--enviar-fichero")) await enviar(readFileSync(arg("--enviar-fichero"), "utf8"));
  else if (bandera("--enviar")) await enviar(arg("--enviar"));
  else { console.error("Usa --enviar, --enviar-fichero, --esperar o --leer"); process.exit(1); }
} catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
