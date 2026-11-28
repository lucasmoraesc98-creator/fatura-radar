// Estado compartilhado do app + persistência local
import { STORAGE_KEY, STORAGE_CICLO_KEY } from "./config.js";
import { roundCents, toCents, formatDateBR, dedupKey } from "./utils.js";
import { CATEGORY_CAPS, CATEGORY_COLORS } from "./config.js";

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
}

const savedEntries = readJSON(STORAGE_KEY, []);

export const state = {
  addedEntries: Array.isArray(savedEntries) ? savedEntries : [],
  remoteEntries: null,
  ciclo: readJSON(STORAGE_CICLO_KEY, null), // { atual, chave, proximo, fechaEm, pendente }
  recorrentes: [],
  guardado: [],
  historico: [],
  tab: "fatura",
  isSavingGuardado: false,
  guardadoMsg: "",
  selectedCategory: null,
  pendingRide: null,
  closeConfirm: false,
  isClosing: false,
  isListening: false,
  isSendingAI: false,
  isPulling: false,
  recognition: null,
  syncState: "syncing",
  lastSyncTime: "",
  feedbackText: 'Fale ou digite: "42,50 mercado", "estorno 15 mercado" ou "Uber 32"',
  feedbackTone: "muted"
};

let renderer = () => {};
export function setRenderer(fn) { renderer = fn; }
export function render() { renderer(); }

export function setFeedback(text, tone) {
  state.feedbackText = text;
  state.feedbackTone = tone;
}

export function saveLocal() { writeJSON(STORAGE_KEY, state.addedEntries); }
export function saveCiclo() { writeJSON(STORAGE_CICLO_KEY, state.ciclo); }

export function getAllEntries() {
  const remote = Array.isArray(state.remoteEntries) ? state.remoteEntries.slice().reverse() : [];
  const seenIds = new Set();
  const seenKeys = new Set();
  const out = [];

  for (const arr of [state.addedEntries, remote]) {
    for (const it of arr) {
      if (!it || toCents(it.valor) === 0) continue;
      const norm = Object.assign({}, it, { data: formatDateBR(it.data), valor: roundCents(it.valor) });
      const id = String(norm.id || "").trim();
      const key = dedupKey(norm);
      if (id && seenIds.has(id)) continue;
      if (seenKeys.has(key)) continue;
      if (id) seenIds.add(id);
      seenKeys.add(key);
      out.push(norm);
    }
  }
  return out;
}

export function groupCategories(entries) {
  const map = {};
  for (const it of entries) {
    const cat = it.categoria || "Compras / Presentes";
    if (!map[cat]) {
      map[cat] = {
        name: cat,
        total: 0,
        count: 0,
        items: [],
        color: CATEGORY_COLORS[cat] || "#10b981",
        cap: CATEGORY_CAPS[cat] || 300
      };
    }
    map[cat].total = roundCents(map[cat].total + it.valor);
    map[cat].count += 1;
    map[cat].items.push(it);
  }
  return Object.values(map).sort((a, b) => b.total - a.total);
}
