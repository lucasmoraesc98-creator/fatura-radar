import { CLOSING_DAY, MONTHS_ABBR } from "./config.js";

// Rótulo do ciclo (mês em que a fatura fecha) calculado localmente, usado só quando o servidor ainda não respondeu
export function fallbackCycleLabel(now = new Date()) {
  let m = now.getMonth();
  let y = now.getFullYear();
  if (now.getDate() > CLOSING_DAY) {
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return MONTHS_ABBR[m] + "/" + y;
}
