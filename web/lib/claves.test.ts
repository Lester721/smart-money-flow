// Las claves del navegador, renombradas sin perder nada.
//
// Este test existe porque el fallo que evita NO GRITA: si la migración se rompe, la página
// compila, arranca, y el usuario se encuentra el watchlist vacío y el perfil de riesgo en blanco
// sin un solo mensaje. Es la clase de avería más cara de las que hay.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { clave, leerClave, escribirClave, borrarClave } from "./claves";

/** Un localStorage de mentira, para poder sembrarlo con el nombre viejo. */
function navegadorCon(inicial: Record<string, string> = {}) {
  const store = new Map(Object.entries(inicial));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  return store;
}

describe("claves — renombrar sin perder lo guardado", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("el nombre nuevo lleva el prefijo eva.", () => {
    expect(clave("watchlist")).toBe("eva.watchlist");
  });

  it("se trae el valor guardado con el nombre VIEJO", () => {
    navegadorCon({ "tito.watchlist": '[{"ticker":"HOOD"}]' });
    expect(leerClave("watchlist")).toBe('[{"ticker":"HOOD"}]');
  });

  it("al traerlo lo copia al nombre nuevo, para no volver a buscarlo", () => {
    const store = navegadorCon({ "tito.risk.accountSize": "55419" });
    leerClave("risk.accountSize");
    expect(store.get("eva.risk.accountSize")).toBe("55419");
  });

  it("NO borra el viejo: si la migración falla, el dato sigue ahí", () => {
    const store = navegadorCon({ "tito.watchlist": "[]" });
    leerClave("watchlist");
    expect(store.has("tito.watchlist")).toBe(true);
  });

  it("el nombre nuevo MANDA sobre el viejo", () => {
    navegadorCon({ "tito.view": "estudiante", "eva.view": "pro" });
    expect(leerClave("view")).toBe("pro");
  });

  it("sin nada guardado devuelve null, no una cadena vacía", () => {
    navegadorCon();
    expect(leerClave("no.existe")).toBeNull();
  });

  it("escribir usa SIEMPRE el nombre nuevo", () => {
    const store = navegadorCon();
    escribirClave("wheel.preset", "balanceado");
    expect(store.get("eva.wheel.preset")).toBe("balanceado");
    expect(store.has("tito.wheel.preset")).toBe(false);
  });

  it("borrar se lleva los dos nombres", () => {
    const store = navegadorCon({ "tito.view": "pro", "eva.view": "pro" });
    borrarClave("view");
    expect(store.has("tito.view")).toBe(false);
    expect(store.has("eva.view")).toBe(false);
  });

  it("un almacenamiento bloqueado no puede tumbar la página", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => { throw new Error("bloqueado"); },
        setItem: () => { throw new Error("bloqueado"); },
        removeItem: () => { throw new Error("bloqueado"); },
      },
    });
    expect(leerClave("watchlist")).toBeNull();
    expect(() => escribirClave("view", "pro")).not.toThrow();
    expect(() => borrarClave("view")).not.toThrow();
  });

  it("en el servidor (sin window) no explota", () => {
    vi.stubGlobal("window", undefined);
    expect(leerClave("watchlist")).toBeNull();
    expect(() => escribirClave("view", "pro")).not.toThrow();
  });
});
