// Renderização da interface
import { state, getAllEntries, groupCategories } from "./state.js";
import { roundCents, formatBRL, esc } from "./utils.js";
import { upcomingInstallments } from "./installments.js";
import { fallbackCycleLabel } from "./cycle.js";

export function buildDonutSVG(categories, total) {
  const r = 74, cx = 105, cy = 105, circ = 2 * Math.PI * r;
  let offset = 0;
  const segs = categories.map(cat => {
    const val = Math.max(0, cat.total);
    const frac = total > 0 ? val / total : 0;
    const dash = frac * circ;
    const gap = Math.max(0, circ - dash);
    const active = state.selectedCategory === cat.name;
    const opacity = state.selectedCategory && !active ? 0.35 : 1;
    const circle = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${cat.color}" stroke-width="${active ? 24 : 20}" stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})" opacity="${opacity}" style="cursor:pointer" data-cat="${encodeURIComponent(cat.name)}" />`;
    offset += dash;
    return circle;
  }).join("");
  return `<svg width="210" height="210" viewBox="0 0 210 210">${segs}</svg>`;
}

function rideCard() {
  const r = state.pendingRide;
  if (!r) return "";
  return `
    <div class="card" style="background:linear-gradient(180deg,rgba(56,189,248,0.14),#121216);border-color:rgba(56,189,248,0.4);">
      <div class="row-between" style="font-size:11px;font-weight:700;text-transform:uppercase;color:#7dd3fc;">
        <span>Corrida de Transporte</span>
        <button type="button" class="btn-ghost" data-action="cancel-ride">Cancelar</button>
      </div>
      <div style="margin-top:8px;font-size:15px;font-weight:700;">Esse transporte de ${formatBRL(r.valor)} foi Trabalho ou Lazer?</div>
      <div style="margin-top:2px;font-size:12px;color:#9a9aa6;">"${esc(r.desc)}"</div>
      <div class="grid-2" style="margin-top:10px;">
        <button type="button" class="btn-primary" style="padding:10px;background:rgba(56,189,248,0.2);border-color:rgba(56,189,248,0.45);color:#e0f2fe;" data-action="ride-work">Trabalho</button>
        <button type="button" class="btn-primary" style="padding:10px;background:rgba(244,63,94,0.2);border-color:rgba(244,63,94,0.45);color:#ffe4e6;" data-action="ride-leisure">Lazer</button>
      </div>
    </div>`;
}

function pendingCloseBanner(label, next) {
  const c = state.ciclo;
  if (!c || !c.pendente || state.closeConfirm) return "";
  return `
    <div class="card card-amber">
      <div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#fcd34d;">Fechamento pendente</div>
      <div style="margin-top:6px;font-size:13px;line-height:1.4;">A fatura ${esc(label)} fechou em ${esc(c.fechaEm)} e ainda não foi fechada. Feche para começar ${esc(next)}.</div>
      <button type="button" class="btn-warn" style="margin-top:10px;width:100%;" data-action="close-open">Fechar agora</button>
    </div>`;
}

function closeConfirmCard(label, next, entries, total) {
  if (!state.closeConfirm) return "";
  const parcels = upcomingInstallments(entries);
  const parcelsTotal = roundCents(parcels.reduce((s, p) => s + p.valor, 0));
  const list = parcels.length
    ? `<ul class="list-mini tabular">${parcels.slice(0, 8).map(p =>
        `<li class="row-between"><span class="truncate">${esc(p.desc)} → ${p.next}/${p.total}</span><span style="flex-shrink:0;color:#e4e4e7;">${formatBRL(p.valor)}</span></li>`).join("")}</ul>
       <div class="tabular" style="margin-top:6px;font-size:12px;color:#9a9aa6;">${esc(next)} começa com ${parcels.length} parcela(s): ${formatBRL(parcelsTotal)}</div>`
    : `<div style="margin-top:8px;font-size:12px;color:#9a9aa6;">Nenhuma parcela continua: ${esc(next)} começa zerada.</div>`;
  const busy = state.isClosing;
  return `
    <div class="card card-amber">
      <div class="row-between" style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#fcd34d;">
        <span>Fechar fatura ${esc(label)}?</span>
        <button type="button" class="btn-ghost" data-action="close-cancel" ${busy ? "disabled" : ""}>Cancelar</button>
      </div>
      <div class="tabular" style="margin-top:8px;font-size:15px;font-weight:700;">${formatBRL(total)} · ${entries.length} lançamentos</div>
      <div style="margin-top:2px;font-size:12px;color:#9a9aa6;">Tudo é salvo na planilha e o app passa a contar só o próximo ciclo.</div>
      ${list}
      <button type="button" class="btn-warn" style="margin-top:12px;width:100%;" data-action="close-confirm" ${busy ? "disabled" : ""}>${busy ? "Fechando..." : "Confirmar fechamento"}</button>
    </div>`;
}

export function renderApp() {
  const root = document.getElementById("app");
  if (!root) return;

  const entries = getAllEntries();
  const grandTotal = roundCents(entries.reduce((s, x) => s + x.valor, 0));
  const debitTotal = roundCents(entries.filter(x => String(x.meioPagamento).toLowerCase() === "débito").reduce((s, x) => s + x.valor, 0));
  const creditTotal = roundCents(grandTotal - debitTotal);

  const cats = groupCategories(entries);
  const activeCat = cats.find(c => c.name === state.selectedCategory);
  const workTotal = roundCents(entries.filter(x => x.categoria === "Transporte" && x.subtipo === "Trabalho").reduce((s, x) => s + x.valor, 0));
  const leisureTotal = roundCents(entries.filter(x => x.categoria === "Transporte" && x.subtipo === "Lazer").reduce((s, x) => s + x.valor, 0));

  const cicloLabel = state.ciclo && state.ciclo.atual ? state.ciclo.atual : fallbackCycleLabel();
  const nextLabel = state.ciclo && state.ciclo.proximo ? state.ciclo.proximo : "o próximo ciclo";
  const closesText = state.ciclo && state.ciclo.fechaEm ? "Fecha em " + state.ciclo.fechaEm + " (automático às 23h)" : "";

  const recent = entries.slice(0, 5);
  const syncColor = state.syncState === "synced" ? "#34d399" : state.syncState === "syncing" ? "#38bdf8" : "#fbbf24";
  const syncText = state.syncState === "synced"
    ? "Auto-sync OK" + (state.lastSyncTime ? " · " + state.lastSyncTime : "")
    : state.syncState === "syncing" ? "Sincronizando..." : "Cache Local + Auto-sync";
  const fbColor = state.feedbackTone === "ok" ? "#6ee7b7" : state.feedbackTone === "warn" ? "#fcd34d" : "#9a9aa6";

  const recentHtml = recent.map(it => {
    const badge = it.subtipo === "Trabalho" ? '<span class="badge-work">Trabalho</span>'
      : it.subtipo === "Lazer" ? '<span class="badge-leisure">Lazer</span>'
      : it.valor < 0 ? '<span class="badge-refund">Estorno</span>' : "";
    const canUndo = String(it.id).startsWith("VOZ-");
    return `
      <div class="row-between tabular" style="padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:12px;">
        <div style="min-width:0;display:flex;align-items:center;gap:8px;">
          <span class="dot" style="background:${it.syncStatus === "synced" ? "#34d399" : "#fbbf24"};"></span>
          <div class="truncate">
            <span style="font-weight:600;">${esc(it.estabelecimento)}</span>${badge}
            <div style="font-size:10px;color:#71717a;">${esc(it.data)} · ${esc(it.categoria)} · ${esc(it.meioPagamento || "Crédito")}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          <span style="font-weight:700;color:${it.valor < 0 ? "#6ee7b7" : "#f4f4f6"};">${formatBRL(it.valor)}</span>
          ${canUndo ? `<button type="button" class="btn-undo" data-undo="${esc(it.id)}">Desfazer</button>` : ""}
        </div>
      </div>`;
  }).join("") || `<div style="padding:10px 0;font-size:12px;color:#71717a;">Nenhum lançamento neste ciclo ainda.</div>`;

  const catsHtml = cats.map(c => {
    const share = grandTotal > 0 ? ((c.total / grandTotal) * 100).toFixed(1) : "0.0";
    const ratio = c.cap > 0 ? Math.min(100, Math.max(0, (c.total / c.cap) * 100)).toFixed(1) : "100.0";
    const bal = roundCents(c.cap - c.total);
    const balTxt = bal >= 0 ? "Saldo: " + formatBRL(bal) : "Acima: " + formatBRL(Math.abs(bal));
    const exp = state.selectedCategory === c.name;
    const itemsHtml = exp ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;gap:6px;">
      ${c.items.map(e => {
        const b = e.subtipo === "Trabalho" ? '<span class="badge-work">Trabalho</span>' : e.subtipo === "Lazer" ? '<span class="badge-leisure">Lazer</span>' : "";
        return `<div class="row-between tabular" style="font-size:12px;color:#9a9aa6;">
          <span class="truncate">${esc(e.data)} · <strong style="color:#f4f4f6;">${esc(e.estabelecimento)}</strong>${b}</span>
          <span style="font-weight:600;color:${e.valor < 0 ? "#6ee7b7" : "#e4e4e7"};flex-shrink:0;">${formatBRL(e.valor)}</span>
        </div>`;
      }).join("")}
    </div>` : "";

    return `
      <div class="surface cat-card ${exp ? "expanded" : ""}" data-cat="${encodeURIComponent(c.name)}">
        <div class="row-between tabular" style="font-size:13px;font-weight:600;">
          <span style="display:flex;align-items:center;gap:8px;min-width:0;">
            <span class="dot" style="width:10px;height:10px;background:${c.color};"></span>
            <span class="truncate">${esc(c.name)}</span>
          </span>
          <span style="flex-shrink:0;">${formatBRL(c.total)} (${share}%)</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${ratio}%;background:${c.color};"></div></div>
        <div class="row-between tabular" style="margin-top:6px;font-size:11px;color:#9a9aa6;">
          <span class="truncate">${c.count} itens · Teto ${formatBRL(c.cap)} (${balTxt})</span>
          <span style="flex-shrink:0;">${exp ? "Ocultar ▲" : "Itens ▼"}</span>
        </div>
        ${itemsHtml}
      </div>`;
  }).join("");

  root.innerHTML = `
    <div class="card" style="text-align:center;display:flex;flex-direction:column;gap:10px;">
      <div class="row-between">
        <span style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#34d399;">Fatura Radar — ${esc(cicloLabel)}</span>
        <span class="pill"><span class="dot" style="background:${syncColor};"></span><span>${esc(syncText)}</span></span>
      </div>
      <button type="button" class="mic-btn ${state.isListening ? "listening" : ""}" data-action="mic" aria-label="Falar gasto">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="2" width="6" height="12" rx="3"></rect>
          <path d="M5 10a7 7 0 0 0 14 0"></path>
          <line x1="12" y1="19" x2="12" y2="22"></line>
        </svg>
      </button>
      <div style="font-size:14px;font-weight:700;">${state.isListening ? "Ouvindo agora..." : state.isSendingAI ? "Processando com Gemini..." : "Toque para falar o gasto"}</div>
      <div style="font-size:12px;line-height:1.4;color:${fbColor};">${esc(state.feedbackText)}</div>
      <div class="cmd-bar">
        <input id="cmdInput" class="cmd-input" type="text" placeholder='Ex.: "42,50 mercado" ou "estorno 15 mercado"' />
        <button type="button" class="btn-primary" data-action="submit-cmd">${state.isSendingAI ? "..." : "Lançar"}</button>
      </div>
    </div>

    ${pendingCloseBanner(cicloLabel, nextLabel)}
    ${closeConfirmCard(cicloLabel, nextLabel, entries, grandTotal)}
    ${rideCard()}

    <div class="card">
      <div class="row-between" style="margin-bottom:6px;">
        <span style="font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#d4d4d8;">Últimos Lançamentos</span>
        <button type="button" class="btn-ghost" data-action="refresh">${state.isPulling ? "Atualizando..." : "Atualizar ↻"}</button>
      </div>
      ${recentHtml}
    </div>

    <div class="card">
      <div class="row-between">
        <span style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#34d399;">Total Consolidado</span>
        <button type="button" class="btn-ghost" data-action="close-open" ${state.isClosing ? "disabled" : ""}>Fechar fatura</button>
      </div>
      <div class="tabular" style="margin-top:2px;font-size:28px;font-weight:800;letter-spacing:-0.02em;">${formatBRL(grandTotal)}</div>
      <div class="tabular" style="font-size:12px;color:#9a9aa6;">${entries.length} lançamentos · Crédito: ${formatBRL(creditTotal)} · Débito: ${formatBRL(debitTotal)}</div>
      ${closesText ? `<div style="margin-top:2px;font-size:11px;color:#71717a;">${esc(closesText)}</div>` : ""}

      <div class="grid-2" style="margin-top:12px;">
        <div class="surface tabular" style="padding:11px;">
          <div style="font-size:11px;color:#9a9aa6;">Transporte — Trabalho</div>
          <div style="margin-top:2px;font-size:16px;font-weight:700;color:#38bdf8;">${formatBRL(workTotal)}</div>
        </div>
        <div class="surface tabular" style="padding:11px;">
          <div style="font-size:11px;color:#9a9aa6;">Transporte — Lazer</div>
          <div style="margin-top:2px;font-size:16px;font-weight:700;color:#f43f5e;">${formatBRL(leisureTotal)}</div>
        </div>
      </div>

      <div class="donut-wrap">
        ${buildDonutSVG(cats, grandTotal)}
        <div class="donut-center tabular">
          <div style="font-size:11px;text-transform:uppercase;color:#9a9aa6;">${esc(activeCat ? activeCat.name.split(" / ")[0] : "Fatura Líquida")}</div>
          <div style="margin-top:2px;font-size:17px;font-weight:800;">${formatBRL(activeCat ? activeCat.total : grandTotal)}</div>
          <div style="margin-top:2px;font-size:11px;font-weight:600;color:#34d399;">${activeCat ? ((activeCat.total / (grandTotal || 1)) * 100).toFixed(1) + "% · " + activeCat.count + " itens" : entries.length + " itens"}</div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:9px;">${catsHtml}</div>
    </div>
  `;
}
