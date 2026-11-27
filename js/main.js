// Ponto de entrada: liga eventos, renderização e sincronização automática
import { AUTO_SYNC_INTERVAL_MS } from "./config.js";
import { state, setRenderer, render, setFeedback } from "./state.js";
import { renderApp } from "./view.js";
import {
  syncPull, processCommand, removeLocalEntry, confirmRide, cancelRide,
  openCloseConfirm, cancelClose, confirmClose, setTab, guardarDinheiro, removerGuardado
} from "./actions.js";
import { toggleVoice } from "./voice.js";
import { extractNumber } from "./parser.js";

setRenderer(renderApp);
const app = document.getElementById("app");

function submitFromInput() {
  const inp = document.getElementById("cmdInput");
  if (inp && inp.value.trim()) {
    const val = inp.value;
    inp.value = "";
    processCommand(val);
  }
}

function submitGuardado() {
  const v = document.getElementById("guardValor");
  const d = document.getElementById("guardDesc");
  const valor = v ? extractNumber(v.value) : null;
  if (!valor) {
    state.guardadoMsg = "Informe um valor válido (ex.: 61,23).";
    render();
    return;
  }
  const desc = d && d.value.trim() ? d.value.trim() : "Guardado na caixinha";
  if (v) v.value = "";
  if (d) d.value = "";
  guardarDinheiro(valor, desc);
}

const handlers = {
  guardar: submitGuardado,
  mic: toggleVoice,
  refresh: () => syncPull(false),
  "submit-cmd": submitFromInput,
  "ride-work": () => confirmRide("Trabalho"),
  "ride-leisure": () => confirmRide("Lazer"),
  "cancel-ride": cancelRide,
  "close-open": openCloseConfirm,
  "close-cancel": cancelClose,
  "close-confirm": confirmClose
};

app.addEventListener("click", e => {
  const tabBtn = e.target.closest("[data-tab]");
  if (tabBtn) { setTab(tabBtn.getAttribute("data-tab")); return; }
  const rmBtn = e.target.closest("[data-remove-guardado]");
  if (rmBtn) { removerGuardado(rmBtn.getAttribute("data-remove-guardado")); return; }
  const undoBtn = e.target.closest("[data-undo]");
  if (undoBtn) {
    e.stopPropagation();
    removeLocalEntry(undoBtn.getAttribute("data-undo"));
    return;
  }
  const actionEl = e.target.closest("[data-action]");
  if (actionEl) {
    if (actionEl.disabled) return;
    const fn = handlers[actionEl.getAttribute("data-action")];
    if (fn) fn();
    return;
  }
  const catEl = e.target.closest("[data-cat]");
  if (catEl) {
    const name = decodeURIComponent(catEl.getAttribute("data-cat"));
    state.selectedCategory = state.selectedCategory === name ? null : name;
    render();
  }
});

app.addEventListener("keydown", e => {
  if (e.target && e.target.id === "cmdInput" && e.key === "Enter") {
    e.preventDefault();
    submitFromInput();
  }
});

render();
syncPull(false);
setInterval(() => { if (!document.hidden) syncPull(true); }, AUTO_SYNC_INTERVAL_MS);
document.addEventListener("visibilitychange", () => { if (!document.hidden) syncPull(true); });
window.addEventListener("focus", () => syncPull(true));
