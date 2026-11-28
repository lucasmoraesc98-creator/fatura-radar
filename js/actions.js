// Ações do app: lançar gasto, sincronizar com a planilha e fechar a fatura
import { state, saveLocal, saveCiclo, render, setFeedback } from "./state.js";
import { roundCents, formatBRL, todayBR, nowTimeBR, formatDateBR, dedupKey } from "./utils.js";
import { flushPendingQueue, fetchSheet, sendCommand, closeInvoiceRemote, guardarRemote, removerGuardadoRemote } from "./api.js";
import { parseCommandFallback } from "./parser.js";
import { parseGuardado } from "./parser.js";

const hasPending = () => state.addedEntries.some(it => it.syncStatus !== "synced");

function dropSyncedLocal() {
  state.addedEntries = state.addedEntries.filter(it => it.syncStatus !== "synced");
  saveLocal();
}

export async function syncPull(silent) {
  if (state.isPulling) return;
  state.isPulling = true;
  if (!silent) {
    state.syncState = "syncing";
    render();
  }

  try {
    await flushPendingQueue();
    const data = await fetchSheet();
    if (data && data.ok && Array.isArray(data.items)) {
      state.remoteEntries = data.items.map((r, idx) => ({
        id: String(r.id || "SHEET-" + (idx + 1)),
        data: formatDateBR(r.date || r.data || todayBR()),
        estabelecimento: String(r.desc || r.estabelecimento || "Lançamento"),
        valor: roundCents(r.val !== undefined ? r.val : r.valor),
        categoria: String(r.cat || r.categoria || "Compras / Presentes"),
        subtipo: String(r.subtipo || ""),
        meioPagamento: String(r.meioPagamento || "Crédito"),
        origem: String(r.origem || "Planilha"),
        syncStatus: "synced"
      }));

      // A planilha é a fonte da verdade: o que já subiu deixa de ficar duplicado no cache local
      const knownKeys = new Set(state.remoteEntries.map(dedupKey));
      state.addedEntries.forEach(loc => {
        if (loc.syncStatus !== "synced" && knownKeys.has(dedupKey(loc))) loc.syncStatus = "synced";
      });
      dropSyncedLocal();

      if (Array.isArray(data.recorrentes)) state.recorrentes = data.recorrentes;
      if (Array.isArray(data.guardado)) state.guardado = data.guardado;
      if (Array.isArray(data.historico)) state.historico = data.historico;
      if (data.ciclo) {
        state.ciclo = data.ciclo;
        saveCiclo();
      }
      state.syncState = "synced";
      state.lastSyncTime = nowTimeBR();
    } else {
      state.syncState = "fallback";
    }
  } catch (_) {
    state.syncState = "fallback";
  } finally {
    state.isPulling = false;
    render();
  }
}

export function addEntry(valor, categoria, subtipo, desc, meioPagamento, preSynced) {
  const entry = {
    id: "VOZ-" + Date.now(),
    data: todayBR(),
    estabelecimento: desc,
    valor: roundCents(valor),
    categoria,
    subtipo: subtipo || "",
    meioPagamento: meioPagamento || "Crédito",
    origem: "App Voz",
    syncStatus: preSynced ? "synced" : "pending"
  };
  state.addedEntries = [entry].concat(state.addedEntries);
  saveLocal();
  const label = subtipo ? categoria + " — " + subtipo : categoria;
  setFeedback(
    (entry.valor < 0 ? "Estorno de " : "Registrado ") + formatBRL(Math.abs(entry.valor)) + " (" + entry.meioPagamento + ") em " + label + ".",
    "ok"
  );
  render();
  if (!preSynced) syncPull(true);
}

export function removeLocalEntry(id) {
  state.addedEntries = state.addedEntries.filter(it => it.id !== id);
  saveLocal();
  setFeedback("Lançamento local removido.", "muted");
  render();
}

export async function processCommand(text) {
  const clean = (text || "").trim();
  if (!clean || state.isSendingAI) return;

  const g = parseGuardado(clean);
  if (g) {
    await guardarDinheiro(g.valor, g.desc);
    return;
  }

  state.isSendingAI = true;
  setFeedback('Gemini interpretando "' + clean + '" e gravando na planilha...', "ok");
  render();

  try {
    const data = await sendCommand(clean);
    if (data && data.ok) {
      if (data.needsConfirm) {
        state.pendingRide = {
          needsConfirm: true,
          valor: roundCents(data.valor),
          meioPagamento: data.meioPagamento || "Crédito",
          desc: data.estabelecimento || clean
        };
        setFeedback("Confirme se o transporte de " + formatBRL(state.pendingRide.valor) + " foi Trabalho ou Lazer.", "ok");
        state.isSendingAI = false;
        render();
        return;
      }

      const it = data.item || {};
      addEntry(
        it.valor,
        it.categoria || "Compras / Presentes",
        it.subtipo || "",
        it.estabelecimento || clean,
        it.meioPagamento || "Crédito",
        true
      );
      state.isSendingAI = false;
      await syncPull(true);
      return;
    }
    throw new Error((data && data.erro) || "Falha no Apps Script/Gemini");
  } catch (_) {
    state.isSendingAI = false;
    const fallback = parseCommandFallback(clean);
    if (!fallback) {
      setFeedback('Não identifiquei valor em "' + clean + '". Ex.: "42,50 mercado" ou "estorno 15 mercado".', "warn");
      render();
      return;
    }
    if (fallback.needsConfirm) {
      state.pendingRide = fallback;
      setFeedback("Confirme se o transporte de " + formatBRL(fallback.valor) + " foi Trabalho ou Lazer.", "ok");
      render();
      return;
    }
    addEntry(fallback.valor, fallback.categoria, fallback.subtipo, fallback.desc, fallback.meioPagamento, false);
  }
}

export function confirmRide(subtipo) {
  const r = state.pendingRide;
  if (!r) return;
  state.pendingRide = null;
  addEntry(r.valor, "Transporte", subtipo, r.desc + " (" + subtipo + ")", r.meioPagamento, false);
}

export function cancelRide() {
  state.pendingRide = null;
  setFeedback("Confirmação cancelada.", "muted");
  render();
}

// ---------- Fechamento de fatura ----------
export function openCloseConfirm() {
  state.closeConfirm = true;
  render();
}

export function cancelClose() {
  state.closeConfirm = false;
  render();
}

export async function confirmClose() {
  if (state.isClosing) return;
  state.isClosing = true;
  const chaveAntes = state.ciclo && state.ciclo.chave;
  setFeedback("Fechando a fatura e salvando na planilha...", "ok");
  render();

  try {
    await flushPendingQueue();
    if (hasPending()) {
      throw new Error("Há lançamentos ainda não sincronizados. Toque em Atualizar e tente de novo.");
    }
    const data = await closeInvoiceRemote();
    if (!data || !data.ok) throw new Error((data && data.erro) || "Falha ao fechar a fatura.");

    state.closeConfirm = false;
    state.remoteEntries = null;
    dropSyncedLocal();
    if (data.ciclo) {
      state.ciclo = data.ciclo;
      saveCiclo();
    }

    const f = data.fechado;
    const p = data.proximo;
    let msg = "Fatura " + f.label + " fechada: " + formatBRL(f.total) + " em " + f.qtd + " lançamentos, salva na aba " + f.aba + ". ";
    msg += p.parcelas.length
      ? p.label + " começa com " + p.parcelas.length + " lançamento(s) (parcelas e recorrentes), " + formatBRL(p.total) + "."
      : p.label + " começa zerada.";
    if (data.anual && !data.anual.atualizado) msg += " Resumo Anual: " + data.anual.motivo;
    setFeedback(msg, "ok");
  } catch (err) {
    // A resposta pode ter se perdido depois do servidor concluir: confere se o ciclo avançou antes de repetir
    await syncPull(true);
    if (chaveAntes && state.ciclo && state.ciclo.chave !== chaveAntes) {
      state.closeConfirm = false;
      setFeedback("Fatura fechada (confirmado na planilha). Ciclo atual: " + state.ciclo.atual + ".", "ok");
    } else {
      setFeedback(
        "Não consegui fechar: " + (err && err.message ? err.message : "erro de conexão") + " Confira a planilha antes de tentar de novo.",
        "warn"
      );
    }
  } finally {
    state.isClosing = false;
    render();
  }
  await syncPull(true);
}

// ---------- Dinheiro guardado ----------
export function setTab(tab) {
  state.tab = tab;
  render();
}

export async function guardarDinheiro(valor, desc) {
  const v = roundCents(valor);
  if (!(v > 0) || state.isSavingGuardado) return;
  state.isSavingGuardado = true;
  state.guardadoMsg = "Guardando " + formatBRL(v) + "...";
  setFeedback(state.guardadoMsg, "ok");
  render();
  try {
    const data = await guardarRemote(v, desc);
    if (!data || !data.ok) throw new Error((data && data.erro) || "Falha ao gravar na planilha.");
    state.guardadoMsg = "Guardado " + formatBRL(v) + (desc ? " (" + desc + ")" : "") + ".";
    setFeedback(state.guardadoMsg, "ok");
    await syncPull(true);
  } catch (err) {
    state.guardadoMsg = "Não consegui guardar: " + (err && err.message ? err.message : "sem conexão") + " Tente de novo.";
    setFeedback(state.guardadoMsg, "warn");
  } finally {
    state.isSavingGuardado = false;
    render();
  }
}

export async function removerGuardado(id) {
  if (state.isSavingGuardado) return;
  state.isSavingGuardado = true;
  render();
  try {
    const data = await removerGuardadoRemote(id);
    if (!data || !data.ok) throw new Error((data && data.erro) || "Falha ao remover.");
    state.guardadoMsg = "Registro removido.";
    await syncPull(true);
  } catch (err) {
    state.guardadoMsg = "Não consegui remover: " + (err && err.message ? err.message : "sem conexão");
  } finally {
    state.isSavingGuardado = false;
    render();
  }
}
