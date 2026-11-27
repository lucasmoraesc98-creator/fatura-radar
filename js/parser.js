// Interpretação local de comandos (usada quando o Gemini/Apps Script não responde)
import { roundCents } from "./utils.js";

export function extractNumber(raw) {
  const m = (raw || "").match(/(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)/i);
  if (!m) return null;
  let t = m[1];
  if (t.includes(",") && t.includes(".")) t = t.replace(/\./g, "").replace(",", ".");
  else if (t.includes(",")) t = t.replace(",", ".");
  const v = parseFloat(t);
  return Number.isFinite(v) && v > 0 ? roundCents(v) : null;
}

export function parseCommandFallback(rawInput) {
  const clean = (rawInput || "").trim();
  if (!clean) return null;
  const norm = clean.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const absVal = extractNumber(norm);
  if (!absVal) return null;

  const isRefund = /\b(estorno|reembolso|devolucao|refund|creditado)\b/.test(norm);
  const valor = isRefund ? -absVal : absVal;
  const meioPagamento = /\bdebito\b/.test(norm) ? "Débito" : "Crédito";

  const isRide = /\b(uber|99|corrida|taxi|ride)\b/.test(norm);
  const isWork = /\b(trabalho|trabalhar|escritorio|reuniao|cliente|firma|servico)\b/.test(norm);
  const isLeisure = /\b(lazer|festa|amigo|amigos|role|sair|passeio|bar|balada)\b/.test(norm);
  const base = { valor, meioPagamento, desc: clean, needsConfirm: false, subtipo: "" };

  if ((isRide || isWork || isLeisure) && !isRefund) {
    if (isWork && !isLeisure) return { ...base, categoria: "Transporte", subtipo: "Trabalho" };
    if (isLeisure && !isWork) return { ...base, categoria: "Transporte", subtipo: "Lazer" };
    return { ...base, needsConfirm: true };
  }

  const rules = [
    [/\b(metro|cptm|onibus|passagem|bilhete|transporte)\b/, "Transporte", "Trabalho"],
    [/\b(mercado|hortifruti|supermercado|feira|pomar|acougue|verdura|fruta|lopes)\b/, "Mercado / Hortifruti", ""],
    [/\b(pizza|keeta|ifood|99food|restaurante|lanche|burger|hamburguer|sushi|japa|jantar|delivery|comida)\b/, "Restaurante / Delivery", ""],
    [/\b(oxxo|pao|croissant|cafe|leite|conveniencia|americanas|maquina|vend perto|padaria|dia a dia|energetico|monster|red bull)\b/, "Conveniência / Dia a dia", ""],
    [/\b(anthropic|claude|ia|ai|chatgpt|apple|netflix|canva|vivo|assinatura|app)\b/, "Assinaturas / IA / Apps", ""],
    [/\b(farmacia|drogasil|remedio|saude|cabelo|hair|estetica|salao|medico|dentista)\b/, "Saúde / Cuidados", ""]
  ];
  for (const [re, categoria, subtipo] of rules) {
    if (re.test(norm)) return { ...base, categoria, subtipo };
  }
  return { ...base, categoria: "Compras / Presentes" };
}

// "guardei 50 na caixinha (tiktok)" → { valor, desc }. Só reconhece quando há palavra de guardar/caixinha.
export function parseGuardado(rawInput) {
  const clean = (rawInput || "").trim();
  const norm = clean.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!/\b(guardei|guardado|guardar|caixinha)\b/.test(norm)) return null;
  const valor = extractNumber(norm);
  if (!valor) return null;
  const desc = clean
    .replace(/(?:r\$\s*)?\d+(?:[.,]\d{1,2})?(\s*reais)?/i, "")
    .replace(/\b(guardei|guardado|guardar|na|da|do|de|a|para|pra|caixinha|o|valor|dinheiro|que|comprei|no|credito|crédito)\b/gi, " ")
    .replace(/[()\-:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { valor, desc: desc || "Guardado na caixinha" };
}
