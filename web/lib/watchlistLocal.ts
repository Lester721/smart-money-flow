// El watchlist del estudiante, en su navegador.
//
// Vive en localStorage por la misma razón que el perfil de riesgo (`eva.risk.*`): la
// entrada guarda tu saldo y tu sizing del momento, y eso no tiene por qué llegar al
// servidor. De paso resuelve el despliegue compartido — con un archivo único en el
// servidor toda la clase escribía en el mismo watchlist.
//
// Contrapartida asumida: no cruza dispositivos y limpiar el navegador lo borra.

import { sortEntries, type WatchlistEntry } from "./watchlist";
import { leerClave, escribirClave } from "@/lib/claves";

// EL WATCHLIST ES EL DATO MÁS CARO DE PERDER de toda la aplicación: es una lista que el
// usuario ha construido a mano. Va por lib/claves.ts, que migra lo guardado con el nombre
// viejo la primera vez que se lee.
const KEY = "watchlist";
const KEY_BROKER = "watchlist.broker";
/** Marca de la importación única desde el viejo data/watchlist.json. */
const KEY_MIGRATED = "watchlist.migrated";

export function loadEntries(): WatchlistEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = leerClave(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WatchlistEntry[];
    return Array.isArray(parsed) ? sortEntries(parsed) : [];
  } catch {
    return []; // JSON corrupto: preferimos vacío a romper la página
  }
}

export function saveEntries(entries: WatchlistEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    escribirClave(KEY, JSON.stringify(entries));
  } catch {
    // cuota llena o modo privado: el watchlist sigue en memoria esta sesión
  }
}

export function loadBroker(): string {
  if (typeof window === "undefined") return "none";
  return leerClave(KEY_BROKER) ?? "none";
}

export function saveBroker(id: string): void {
  if (typeof window === "undefined") return;
  try {
    escribirClave(KEY_BROKER, id);
  } catch {
    // ver saveEntries
  }
}

/** ¿Ya importamos el watchlist viejo del servidor? Solo se hace una vez. */
export function hasMigrated(): boolean {
  if (typeof window === "undefined") return true;
  return leerClave(KEY_MIGRATED) === "1";
}

export function markMigrated(): void {
  if (typeof window === "undefined") return;
  try {
    escribirClave(KEY_MIGRATED, "1");
  } catch {
    // si no se puede marcar, se reintentará la próxima vez: la importación es idempotente
  }
}
