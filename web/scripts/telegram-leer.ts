// LEER lo que Lester escribe en Telegram.
//
// El bot era de una sola vía: EVA avisaba y Lester no podía responder. Inyectar sus mensajes
// directamente en la sesión de Claude no se puede (la herramienta que lo haría está deshabilitada
// para procesos desatendidos), pero SÍ se puede hacer lo contrario: que Claude vaya a leerlos
// cuando quiera. Este script es esa lectura.
//
// El desplazamiento (`offset`) se guarda en disco, así que cada corrida devuelve SOLO lo nuevo.
// Sin eso, Telegram repite los últimos mensajes una y otra vez y no hay forma de saber qué ya se
// leyó — que es justo lo que rompe la conversación.
//
// Uso:
//   node --env-file=.env.local --import tsx scripts/telegram-leer.ts          → lo NO leído
//   node --env-file=.env.local --import tsx scripts/telegram-leer.ts --todo   → sin marcar leído

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const ESTADO = process.env.TG_ESTADO || "data/telegram-offset.json";
const SOLO_MIRAR = process.argv.includes("--todo");

interface Msg { id: number; fecha: string; texto: string }

(async () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) { console.log("✗ Falta TELEGRAM_BOT_TOKEN en .env.local"); process.exit(1); }

  const leerOffset = (): number => { try { return JSON.parse(readFileSync(ESTADO, "utf8")).offset ?? 0; } catch { return 0; } };
  const offset = SOLO_MIRAR ? 0 : leerOffset();

  let j: { ok?: boolean; result?: unknown[]; description?: string };
  try {
    const url = `https://api.telegram.org/bot${token}/getUpdates${offset ? `?offset=${offset}` : ""}`;
    j = await (await fetch(url, { signal: AbortSignal.timeout(20_000) })).json();
  } catch (e) { console.log(`✗ No se pudo hablar con Telegram: ${String(e)}`); process.exit(1); }
  if (!j.ok) { console.log(`✗ Telegram: ${j.description ?? "sin detalle"}`); process.exit(1); }

  const msgs: Msg[] = [];
  let ultimo = offset;
  for (const u of (j.result ?? []) as { update_id: number; message?: { date?: number; text?: string } }[]) {
    ultimo = Math.max(ultimo, u.update_id + 1);
    const texto = u.message?.text?.trim();
    if (!texto) continue;
    const fecha = u.message?.date ? new Date(u.message.date * 1000).toISOString().slice(0, 16).replace("T", " ") : "";
    msgs.push({ id: u.update_id, fecha, texto });
  }

  if (!msgs.length) { console.log(`(sin mensajes nuevos)`); }
  else {
    console.log(`\n## ${msgs.length} mensaje(s) de Lester\n`);
    for (const m of msgs) console.log(`   [${m.fecha}] ${m.texto}`);
    console.log("");
  }

  // Marcar leído SOLO si no es una mirada de cortesía. Se guarda al final: si algo peta antes,
  // los mensajes siguen sin leer y se recuperan en la siguiente pasada.
  if (!SOLO_MIRAR && ultimo > offset) {
    if (!existsSync(dirname(ESTADO))) mkdirSync(dirname(ESTADO), { recursive: true });
    writeFileSync(ESTADO, JSON.stringify({ offset: ultimo, actualizado: new Date().toISOString() }), "utf8");
  }
})();
