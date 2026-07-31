/**
 * Panel fijo de subyacentes líquidos que EVA escanea a diario, llueva o truene.
 *
 * Por qué existe: el aprendizaje (saveTrades) y el sub-agente "Confirmación de Precio" solo
 * acumulan historia de un ticker cuando ese ticker se analiza. Con un panel fijo garantizamos
 * historia CONTINUA sobre un set controlado — base tanto de la memoria por-ticker como del
 * forward-test del scorecard completo (incluidas Estructura e IV, que no se pueden backtestear
 * hacia atrás por falta de cadena histórica).
 */
export const PANEL_TICKERS = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META",
  "TSLA", "AMD", "NFLX", "QQQ", "SPY", "HOOD",
] as const;

export type PanelTicker = (typeof PANEL_TICKERS)[number];
