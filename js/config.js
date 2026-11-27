// Configuração central do Fatura Radar
export const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxUvm8v0A3EcsnnskvXBenJi15jx2OGckKZbXLcWh_kn_HyRWwqLdFmei9y-Cp97Rlu/exec";

export const STORAGE_KEY = "fatura_radar_entries_dez_2026_v1";
export const STORAGE_CICLO_KEY = "fatura_radar_ciclo_v1";

export const SYNC_TIMEOUT_MS = 6000;
export const COMMAND_TIMEOUT_MS = 20000; // Gemini + gravação na planilha
export const CLOSE_TIMEOUT_MS = 90000; // fechamento mexe em várias abas
export const AUTO_SYNC_INTERVAL_MS = 20000;

export const CLOSING_DAY = 27;
export const MONTHS_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export const CATEGORY_CAPS = {
  "Mercado / Hortifruti": 600.0,
  "Assinaturas / IA / Apps": 350.0,
  "Restaurante / Delivery": 450.0,
  "Transporte": 200.0,
  "Compras / Presentes": 300.0,
  "Conveniência / Dia a dia": 220.0,
  "Saúde / Cuidados": 150.0
};

export const CATEGORY_COLORS = {
  "Mercado / Hortifruti": "#10b981",
  "Assinaturas / IA / Apps": "#8b5cf6",
  "Restaurante / Delivery": "#f97316",
  "Transporte": "#38bdf8",
  "Compras / Presentes": "#ec4899",
  "Conveniência / Dia a dia": "#eab308",
  "Saúde / Cuidados": "#14b8a6"
};
