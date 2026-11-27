// Funções puras de formatação e normalização
export const roundCents = n => Math.round((Number(n) || 0) * 100) / 100;
export const toCents = n => Math.round(roundCents(n) * 100);
export const pad2 = n => String(n).padStart(2, "0");

export function formatBRL(v) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function todayBR() {
  const d = new Date();
  return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear();
}

export function nowTimeBR() {
  const d = new Date();
  return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}

export function formatDateBR(raw) {
  if (!raw) return todayBR();
  const s = String(raw).trim();
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return pad2(dmy[1]) + "/" + pad2(dmy[2]) + "/" + dmy[3];
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[3] + "/" + iso[2] + "/" + iso[1];
  const p = new Date(s);
  return isNaN(p.getTime()) ? s : pad2(p.getDate()) + "/" + pad2(p.getMonth() + 1) + "/" + p.getFullYear();
}

export function normMerchant(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(trabalho|lazer|credito|debito)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 18);
}

export function dedupKey(it) {
  return formatDateBR(it.data) + "|" + normMerchant(it.estabelecimento) + "|" + toCents(it.valor);
}

export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
