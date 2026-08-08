// Avisos por Telegram — para que las cosas que importan lleguen al bolsillo de Lester.
//
// Reutiliza el bot que ya existe en el proyecto Wally (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID).
// Es de UNA SOLA VÍA a propósito: EVA avisa, no conversa. Conversar se hace en la sesión de
// escritorio, que es la que tiene la caché de ThetaData y puede correr backtests.
//
// REGLA: un aviso que se manda solo es un aviso que se ignora en dos semanas. Esto se usa para
// lo que Lester pidió explícitamente o para lo que le cuesta dinero no saber — no para
// "terminó el script".

const API = "https://api.telegram.org";

export interface ResultadoAviso {
  enviado: boolean;
  motivo?: string;
}

/**
 * Manda un mensaje. NUNCA lanza: un fallo de aviso no puede tumbar el cron que lo llama —
 * perder el forward-test de un día por un timeout de Telegram sería absurdo.
 */
export async function avisar(texto: string): Promise<ResultadoAviso> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) {
    return { enviado: false, motivo: "faltan TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID" };
  }
  // Telegram corta en 4096 caracteres y devuelve error en vez de recortar.
  const cuerpo = texto.length > 4000 ? `${texto.slice(0, 3990)}\n…(recortado)` : texto;
  try {
    const r = await fetch(`${API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: cuerpo, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return { enviado: false, motivo: `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}` };
    return { enviado: true };
  } catch (e) {
    return { enviado: false, motivo: String(e) };
  }
}

/** Comprueba que las credenciales sirven, sin mandar nada al chat. */
export async function comprobarBot(): Promise<{ ok: boolean; nombre?: string; motivo?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, motivo: "falta TELEGRAM_BOT_TOKEN" };
  try {
    const r = await fetch(`${API}/bot${token}/getMe`, { signal: AbortSignal.timeout(10_000) });
    const j = (await r.json()) as { ok: boolean; result?: { username?: string }; description?: string };
    return j.ok ? { ok: true, nombre: j.result?.username } : { ok: false, motivo: j.description };
  } catch (e) {
    return { ok: false, motivo: String(e) };
  }
}
