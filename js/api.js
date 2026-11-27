// Comunicação com o Google Apps Script (planilha + Gemini)
import { APPS_SCRIPT_URL, SYNC_TIMEOUT_MS, COMMAND_TIMEOUT_MS, CLOSE_TIMEOUT_MS } from "./config.js";
import { state, saveLocal } from "./state.js";

export async function fetchTimeout(url, opts, ms = SYNC_TIMEOUT_MS) {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
  try {
    return await fetch(url, Object.assign({}, opts || {}, ctrl ? { signal: ctrl.signal } : {}));
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function postJSON(body, ms) {
  return fetchTimeout(
    APPS_SCRIPT_URL,
    {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    },
    ms
  );
}

// Envia ao servidor os lançamentos feitos offline/pendentes
export async function flushPendingQueue() {
  const pending = state.addedEntries.filter(it => it.syncStatus !== "synced");
  if (!pending.length) return;
  try {
    const res = await postJSON(
      {
        items: pending.map(it => ({
          id: it.id,
          date: it.data,
          desc: it.estabelecimento,
          val: it.valor,
          cat: it.categoria,
          subtipo: it.subtipo,
          meioPagamento: it.meioPagamento,
          origem: it.origem
        }))
      },
      SYNC_TIMEOUT_MS * 2
    );
    const data = res && res.ok ? await res.json() : null;
    if (data && data.ok) {
      pending.forEach(it => { it.syncStatus = "synced"; });
      saveLocal();
    }
  } catch (_) {}
}

export async function fetchSheet() {
  const sep = APPS_SCRIPT_URL.includes("?") ? "&" : "?";
  const res = await fetchTimeout(APPS_SCRIPT_URL + sep + "t=" + Date.now(), { method: "GET", redirect: "follow" });
  if (!res || !res.ok) throw new Error("HTTP");
  return res.json();
}

export async function sendCommand(text) {
  const res = await postJSON({ texto: text }, COMMAND_TIMEOUT_MS);
  return res.json();
}

export async function closeInvoiceRemote() {
  const res = await postJSON({ acao: "fechar_fatura" }, CLOSE_TIMEOUT_MS);
  return res.json();
}
