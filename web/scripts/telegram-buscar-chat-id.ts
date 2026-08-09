// Encuentra tu TELEGRAM_CHAT_ID sin tener que buscarlo a mano.
//
// Uso:  node --env-file=.env.local --import tsx scripts/telegram-buscar-chat-id.ts
//
// ANTES: (1) crear el bot con @BotFather, (2) pegar el token en .env.local como
// TELEGRAM_BOT_TOKEN, (3) ESCRIBIRLE algo al bot desde Telegram.
//
// El paso (3) no es opcional: Telegram prohíbe que un bot inicie la conversación. Hasta que no
// le hablas, getUpdates viene vacío y no hay forma de saber tu chat_id. Es el punto donde se
// atasca todo el mundo, así que el script lo dice con esas palabras en vez de dar un error seco.

import { appendFileSync, readFileSync } from "node:fs";

interface Update {
  message?: { chat?: { id?: number; first_name?: string; username?: string; type?: string }; text?: string };
}

(async () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log(`\n✗ Falta TELEGRAM_BOT_TOKEN en .env.local`);
    console.log(`  Créalo con @BotFather (/newbot) y pega el token ahí.\n`);
    process.exit(1);
  }

  // getMe primero: separa "el token es malo" de "no me has escrito todavía".
  const me = await fetch(`https://api.telegram.org/bot${token}/getMe`).then((r) => r.json()).catch(() => null) as
    { ok?: boolean; result?: { username?: string }; description?: string } | null;
  if (!me?.ok) {
    console.log(`\n✗ El token no sirve: ${me?.description ?? "sin respuesta de Telegram"}`);
    console.log(`  Cópialo otra vez de @BotFather, entero y sin espacios.\n`);
    process.exit(1);
  }
  console.log(`\n✓ Bot @${me.result?.username}`);

  const upd = await fetch(`https://api.telegram.org/bot${token}/getUpdates`).then((r) => r.json()).catch(() => null) as
    { ok?: boolean; result?: Update[] } | null;
  const chats = new Map<number, string>();
  for (const u of upd?.result ?? []) {
    const c = u.message?.chat;
    if (c?.id != null) chats.set(c.id, c.username ? `@${c.username}` : (c.first_name ?? c.type ?? ""));
  }

  if (!chats.size) {
    console.log(`\n✗ Telegram no tiene ningún mensaje para este bot.`);
    console.log(`\n  Casi seguro es esto: **todavía no le has escrito**. Telegram no permite que un`);
    console.log(`  bot inicie la conversación, así que hasta que no le mandes algo no existe chat.`);
    console.log(`\n  Abre Telegram → busca @${me.result?.username} → escríbele "hola" → vuelve a correr esto.\n`);
    process.exit(1);
  }

  console.log(`\n✓ Chat(s) encontrados:\n`);
  for (const [id, quien] of chats) console.log(`     ${id}   ${quien}`);

  const yaEsta = (() => { try { return readFileSync(".env.local", "utf8").includes("TELEGRAM_CHAT_ID"); } catch { return false; } })();
  const id = [...chats.keys()][0];
  if (yaEsta) {
    console.log(`\n   TELEGRAM_CHAT_ID ya está en .env.local — no lo toco.\n`);
  } else {
    appendFileSync(".env.local", `\nTELEGRAM_CHAT_ID=${id}\n`, "utf8");
    console.log(`\n✓ Añadido TELEGRAM_CHAT_ID=${id} a .env.local`);
    console.log(`\n   Ahora comprueba que llega de verdad:`);
    console.log(`   node --env-file=.env.local --import tsx scripts/probar-telegram.ts\n`);
  }
})();
