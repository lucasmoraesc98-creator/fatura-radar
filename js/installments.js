// Reconhece "Parcela 3/10", "parc 3/10" ou "(3/10)" na descrição e prevê a próxima parcela
const RE_KEYWORD = /(?:parcela|parc\.?)\s*(\d{1,2})\s*\/\s*(\d{1,2})/i;
const RE_PARENS = /\((\d{1,2})\s*\/\s*(\d{1,2})\)/;

export function parseInstallment(desc) {
  const s = String(desc || "");
  const m = s.match(RE_KEYWORD) || s.match(RE_PARENS);
  if (!m) return null;
  const cur = Number(m[1]);
  const total = Number(m[2]);
  if (cur < 1 || total < 2 || cur > total || total > 60) return null;
  return { cur, total };
}

// Parcelas que continuam no próximo ciclo (cur < total)
export function upcomingInstallments(entries) {
  const out = [];
  for (const it of entries) {
    if (!(it.valor > 0)) continue;
    const p = parseInstallment(it.estabelecimento);
    if (!p || p.cur >= p.total) continue;
    out.push({ desc: it.estabelecimento, valor: it.valor, next: p.cur + 1, total: p.total });
  }
  return out;
}
