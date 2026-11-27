// Metas do mês e desconto do dinheiro guardado (funções puras)
import { CATEGORY_CAPS, INVESTIMENTO_MENSAL } from "./config.js";
import { roundCents } from "./utils.js";

export const META_TETO = roundCents(Object.values(CATEGORY_CAPS).reduce((s, v) => s + v, 0));
export const META_INVESTIR = roundCents(META_TETO - INVESTIMENTO_MENSAL);

function goal(nome, limite, liquido) {
  const saldo = roundCents(limite - liquido);
  return { nome, limite, saldo, ok: saldo >= 0, pct: limite > 0 ? Math.max(0, (liquido / limite) * 100) : 0 };
}

// gasto = total da fatura; guardado = dinheiro já separado para pagá-la
export function evaluateGoals(gasto, guardado) {
  const liquido = roundCents(gasto - guardado);
  return {
    gasto: roundCents(gasto),
    guardado: roundCents(guardado),
    liquido,
    meta1: goal("Meta 1 · teto da planilha", META_TETO, liquido),
    meta2: goal("Meta 2 · investir " + INVESTIMENTO_MENSAL, META_INVESTIR, liquido)
  };
}
