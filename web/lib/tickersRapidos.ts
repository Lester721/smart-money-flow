// LOS TICKERS DE ACCESO RÁPIDO — definidos UNA vez.
//
// Estaban escritos a mano dentro de `HeaderBar`, así que sólo existían en la página de Ticker.
// Lester los echó de menos en Time & Sales, que también trabaja con un ticker:
//
//   "¿por qué no me salen las acciones que tenía al lado de Estado? HOOD, TSLA, NVDA, QQQ"
//
// Tenía razón: no es que la página no los necesite, es que la lista vivía dentro de un componente
// que esa página no usa. Aquí viven sueltos, y cualquier vista que trabaje con un ticker los pone.
//
// HOOD va primero a propósito: es donde Lester tiene el 85% de su cuenta.

export const TICKERS_RAPIDOS = ["HOOD", "TSLA", "NVDA", "QQQ"] as const;
