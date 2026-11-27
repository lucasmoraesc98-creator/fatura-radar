/**
 * FATURA RADAR — Google Apps Script (Code.gs)
 *
 * Cole este arquivo inteiro no editor do Apps Script (substitui o Code.gs atual)
 * e publique uma NOVA VERSÃO do Web App (Implantar > Gerenciar implantações > editar > Nova versão).
 *
 * Seções:
 *   1. Configuração
 *   2. Utilitários
 *   3. Gemini (classificação de gastos)
 *   4. Lançamentos (aba "Lancamentos")
 *   5. Ciclo da fatura
 *   6. Parcelas
 *   7. Fechamento de fatura
 *   8. Gatilho automático (dia 27)
 *   9. API Web (doGet / doPost)
 */

// ============================================================
// 1. CONFIGURAÇÃO
// ============================================================
const SHEET_LANCAMENTOS = "Lancamentos";
const SHEET_RESUMO_ANUAL = "Resumo Anual";
const PREFIXO_RESUMO_MENSAL = "Resumo e Tetos/";
const TZ = "America/Sao_Paulo";
const DIA_FECHAMENTO = 27;

// Ciclo em andamento quando o script foi instalado (YYYY-MM do mês em que a fatura FECHA).
// Hoje a fatura de Nov/2026 já fechou, então o ciclo vigente é Dez/2026.
// Depois do primeiro uso, o valor passa a ser guardado nas propriedades do script.
const CICLO_INICIAL = "2026-12";
const PROP_CICLO = "CICLO_ATUAL";

const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_NOME = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// Colunas da aba Lancamentos (1-based). A coluna I (AppId) guarda o id do app para evitar duplicidade.
const COL = { ID: 1, DATA: 2, DESC: 3, VALOR: 4, CAT: 5, SUBTIPO: 6, ORIGEM: 7, OBS: 8, APPID: 9 };
const NUM_COLS = 9;

const CABECALHO_ARQUIVO = ["id", "date", "desc", "val", "cat", "subtipo", "meioPagamento", "origem"];

const CATEGORIAS = [
  "Mercado / Hortifruti",
  "Transporte",
  "Restaurante / Delivery",
  "Assinaturas / IA / Apps",
  "Compras / Presentes",
  "Conveniência / Dia a dia",
  "Saúde / Cuidados"
];

// ============================================================
// 2. UTILITÁRIOS
// ============================================================
function pad2_(n) {
  return ("0" + n).slice(-2);
}

function arredondar_(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function numero_(v) {
  if (typeof v === "number") return v;
  let s = String(v == null ? "" : v).replace(/R\$|\s/g, "");
  if (!s) return 0;
  if (s.indexOf(",") > -1) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function fmtDataBR_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, "dd/MM/yyyy");
  const s = String(v == null ? "" : v).trim();
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return pad2_(dmy[1]) + "/" + pad2_(dmy[2]) + "/" + dmy[3];
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[3] + "/" + iso[2] + "/" + iso[1];
  return s;
}

function hojeBR_() {
  return Utilities.formatDate(new Date(), TZ, "dd/MM/yyyy");
}

function hojeISO_() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
}

function meioPagamento_(obs) {
  return /d[eé]bito|pix/i.test(String(obs || "")) ? "Débito" : "Crédito";
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// 3. GEMINI (classificação de gastos)
// ============================================================
const SYSTEM_PROMPT = `Você é o classificador financeiro da planilha Fatura Radar.
Receba uma frase de gasto em português e retorne APENAS um JSON válido (sem markdown) no formato:
{
  "data": "DD/MM/AAAA",
  "estabelecimento": "Nome limpo do local/item",
  "valor": 0.00,
  "categoria": "UMA DAS 7 CATEGORIAS EXATAS",
  "subtipo": "Tag curta",
  "observacoes": "Observação breve ou vazio"
}

CATEGORIAS PERMITIDAS (use exatamente uma destas):
1. "Mercado / Hortifruti"
2. "Transporte"
3. "Restaurante / Delivery"
4. "Assinaturas / IA / Apps"
5. "Compras / Presentes"
6. "Conveniência / Dia a dia"
7. "Saúde / Cuidados"

REGRAS OBRIGATÓRIAS:
- Se "data" não for mencionada na frase, use a data de hoje fornecida no contexto (formato DD/MM/AAAA, ano completo).
- Transporte: Metrô/CPTM ou corridas Uber/99 com valor < R$ 30,00 -> subtipo "Trabalho". Corridas Uber/99 >= R$ 30,00 -> subtipo "Lazer".
- Padaria, Oxxo, café rápido, água, energético, vending machine -> "Conveniência / Dia a dia".
- Farmácia, barbeiro/cabelo, cuidados pessoais -> "Saúde / Cuidados".
- Se mencionar débito ou pix, anote em "observacoes" (ex: "Pago no débito").
- Estorno, reembolso ou devolução: "valor" NEGATIVO (ex: -15.00), na categoria do item estornado.
- Compra parcelada (ex: "3x de 50", "em 6 vezes"): "valor" = valor de UMA parcela (se o usuário informar o total e o número de parcelas, divida e arredonde para 2 casas) e o "estabelecimento" deve terminar com " - Parcela 1/N" (ou a parcela informada, ex: " - Parcela 2/6").`;

function classificarEGerarLancamento(textoUsuario) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  const hoje = hojeBR_();

  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey;

  const payload = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{
      parts: [{ text: "Data de hoje: " + hoje + "\nGasto informado: \"" + textoUsuario + "\"" }]
    }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json"
    }
  };

  const response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const json = JSON.parse(response.getContentText());
  const rawText = json.candidates[0].content.parts[0].text;
  const item = JSON.parse(rawText);

  item.valor = arredondar_(item.valor);
  if (CATEGORIAS.indexOf(item.categoria) === -1) item.categoria = "Compras / Presentes";
  item.data = fmtDataBR_(item.data) || hoje;

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const r = inserirNaPlanilha(item, "");
    r.item.meioPagamento = meioPagamento_(item.observacoes);
    return r;
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// 4. LANÇAMENTOS (aba "Lancamentos")
//    Layout: linha 1 = cabeçalho, linhas 2..n = lançamentos, última linha = "Total Geral"
// ============================================================
function obterAbaLancamentos_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LANCAMENTOS);
  if (!sheet) throw new Error("Aba '" + SHEET_LANCAMENTOS + "' não encontrada.");
  return sheet;
}

function localizarLinhaTotal_(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return 2;
  const col = sheet.getRange(1, COL.DESC, last, 1).getValues();
  for (let i = col.length - 1; i >= 1; i--) {
    if (String(col[i][0]).trim() === "Total Geral") return i + 1;
  }
  return last + 1;
}

function lerLancamentos_() {
  const sheet = obterAbaLancamentos_();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const vals = sheet.getRange(2, 1, last - 1, NUM_COLS).getValues();
  const out = [];
  vals.forEach(function (r) {
    const desc = String(r[COL.DESC - 1] || "").trim();
    if (desc === "Total Geral") return;
    if (desc === "" && r[COL.VALOR - 1] === "") return;
    out.push({
      id: r[COL.ID - 1],
      data: fmtDataBR_(r[COL.DATA - 1]),
      desc: desc,
      valor: arredondar_(numero_(r[COL.VALOR - 1])),
      cat: String(r[COL.CAT - 1] || ""),
      subtipo: String(r[COL.SUBTIPO - 1] || ""),
      origem: String(r[COL.ORIGEM - 1] || ""),
      obs: String(r[COL.OBS - 1] || ""),
      appId: String(r[COL.APPID - 1] || "")
    });
  });
  return out;
}

function inserirNaPlanilha(item, appId) {
  const sheet = obterAbaLancamentos_();
  const linhaTotal = localizarLinhaTotal_(sheet);

  sheet.insertRowBefore(linhaTotal);
  const novaLinha = linhaTotal;
  const novoId = novaLinha - 1;

  sheet.getRange(novaLinha, 1, 1, NUM_COLS).setValues([[
    novoId,
    fmtDataBR_(item.data),
    item.estabelecimento,
    arredondar_(item.valor),
    item.categoria,
    item.subtipo || "",
    item.origem || "Chat Sync",
    item.observacoes || "",
    appId || ""
  ]]);

  sheet.getRange(novaLinha, COL.VALOR).setNumberFormat("R$ #,##0.00");
  sheet.getRange(novaLinha + 1, COL.VALOR).setFormula("=SUM(D2:D" + novaLinha + ")");

  return { ok: true, id: novoId, item: item };
}

function importarItensDoApp_(itens) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const existentes = {};
    lerLancamentos_().forEach(function (r) { if (r.appId) existentes[r.appId] = true; });
    let inseridos = 0;
    (itens || []).forEach(function (it) {
      const appId = String(it.id || "");
      if (appId && existentes[appId]) return;
      const debito = String(it.meioPagamento || "").toLowerCase().indexOf("d") === 0;
      inserirNaPlanilha({
        data: it.date,
        estabelecimento: it.desc,
        valor: it.val,
        categoria: it.cat,
        subtipo: it.subtipo,
        origem: it.origem || "App Voz",
        observacoes: debito ? "Pago no débito" : ""
      }, appId);
      if (appId) existentes[appId] = true;
      inseridos++;
    });
    return { ok: true, inseridos: inseridos };
  } finally {
    lock.releaseLock();
  }
}

function reescreverLancamentos_(sheet, parcelas) {
  const totalAntigo = localizarLinhaTotal_(sheet);
  const ultima = sheet.getLastRow();
  if (ultima >= 2) sheet.getRange(2, 1, ultima - 1, Math.max(NUM_COLS, sheet.getLastColumn())).clearContent();

  const n = parcelas.length;
  const novoTotal = n + 2;

  if (n > 0) {
    const linhas = parcelas.map(function (p, i) {
      return [i + 1, p.data, p.desc, p.valor, p.cat, p.subtipo || "", p.origem, p.obs, ""];
    });
    sheet.getRange(2, 1, n, NUM_COLS).setValues(linhas);
    // Formatação das linhas de lançamento: copia da linha 2 (modelo) quando existir mais de uma parcela
    if (n > 1 && totalAntigo > 2) sheet.getRange(2, 1, 1, NUM_COLS).copyFormatToRange(sheet, 1, NUM_COLS, 3, n + 1);
    sheet.getRange(2, COL.VALOR, n, 1).setNumberFormat("R$ #,##0.00");
  }

  sheet.getRange(novoTotal, COL.DESC).setValue("Total Geral");
  sheet.getRange(novoTotal, COL.VALOR).setFormula(n > 0 ? "=SUM(D2:D" + (n + 1) + ")" : "=0").setNumberFormat("R$ #,##0.00");

  // Estilo da linha de total acompanha a nova posição; sobras de formatação da posição antiga são limpas
  if (totalAntigo !== novoTotal) {
    sheet.getRange(totalAntigo, 1, 1, NUM_COLS).copyFormatToRange(sheet, 1, NUM_COLS, novoTotal, novoTotal);
    if (totalAntigo > novoTotal) sheet.getRange(novoTotal + 1, 1, totalAntigo - novoTotal, NUM_COLS).clearFormat();
  }
}

// ============================================================
// 5. CICLO DA FATURA
//    O ciclo é identificado pelo mês em que a fatura FECHA, no formato "YYYY-MM".
// ============================================================
function cicloAtual_() {
  return PropertiesService.getScriptProperties().getProperty(PROP_CICLO) || CICLO_INICIAL;
}

function partesCiclo_(ciclo) {
  const p = String(ciclo).split("-");
  return { ano: Number(p[0]), mes: Number(p[1]) };
}

function rotuloCiclo_(ciclo) {
  const c = partesCiclo_(ciclo);
  return MESES_ABREV[c.mes - 1] + "/" + c.ano;
}

function proximoCiclo_(ciclo) {
  const c = partesCiclo_(ciclo);
  let m = c.mes + 1;
  let a = c.ano;
  if (m > 12) { m = 1; a++; }
  return a + "-" + pad2_(m);
}

function dataFechamentoISO_(ciclo) {
  const c = partesCiclo_(ciclo);
  return c.ano + "-" + pad2_(c.mes) + "-" + pad2_(DIA_FECHAMENTO);
}

function dataFechamentoBR_(ciclo) {
  const c = partesCiclo_(ciclo);
  return pad2_(DIA_FECHAMENTO) + "/" + pad2_(c.mes) + "/" + c.ano;
}

function statusCiclo_() {
  const ciclo = cicloAtual_();
  return {
    atual: rotuloCiclo_(ciclo),
    chave: ciclo,
    proximo: rotuloCiclo_(proximoCiclo_(ciclo)),
    fechaEm: dataFechamentoBR_(ciclo),
    pendente: hojeISO_() > dataFechamentoISO_(ciclo)
  };
}

// ============================================================
// 6. PARCELAS
//    Reconhece "Parcela 3/10", "parc 3/10" ou "(3/10)" na descrição do lançamento.
// ============================================================
function parseParcela_(desc) {
  const s = String(desc || "");
  const m = s.match(/(?:parcela|parc\.?)\s*(\d{1,2})\s*\/\s*(\d{1,2})/i) || s.match(/\((\d{1,2})\s*\/\s*(\d{1,2})\)/);
  if (!m) return null;
  const atual = Number(m[1]);
  const total = Number(m[2]);
  if (atual < 1 || total < 2 || atual > total || total > 60) return null;
  return { atual: atual, total: total, trecho: m[0] };
}

function gerarProximasParcelas_(itens, cicloFechado, cicloNovo, dataBase) {
  const de = MESES_ABREV[partesCiclo_(cicloFechado).mes - 1];
  const para = MESES_ABREV[partesCiclo_(cicloNovo).mes - 1];
  const out = [];
  itens.forEach(function (it) {
    if (!(it.valor > 0)) return;
    const p = parseParcela_(it.desc);
    if (!p || p.atual >= p.total) return;
    const prox = p.atual + 1;
    const novoTrecho = p.trecho.replace(/(\d{1,2})(\s*\/\s*)(\d{1,2})/, prox + "$2" + p.total);
    out.push({
      data: dataBase,
      desc: it.desc.replace(p.trecho, novoTrecho),
      valor: it.valor,
      cat: it.cat,
      subtipo: it.subtipo,
      origem: "Parcela Vigente",
      obs: "Parcela " + prox + "/" + p.total + " (virada de ciclo " + de + " -> " + para + ")"
    });
  });
  return out;
}

// ============================================================
// 7. FECHAMENTO DE FATURA
// ============================================================
function resumirItens_(itens) {
  const porCategoria = {};
  let total = 0;
  itens.forEach(function (it) {
    total += it.valor;
    porCategoria[it.cat] = arredondar_((porCategoria[it.cat] || 0) + it.valor);
  });
  return { total: arredondar_(total), qtd: itens.length, porCategoria: porCategoria };
}

function arquivarItens_(ss, nomeAba, itens) {
  let sh = ss.getSheetByName(nomeAba);
  if (sh) sh.clear();
  else sh = ss.insertSheet(nomeAba, 1);

  const n = itens.length;
  sh.getRange(1, 1, 1, CABECALHO_ARQUIVO.length).setValues([CABECALHO_ARQUIVO]).setFontWeight("bold");

  if (n > 0) {
    sh.getRange(2, 2, n, 1).setNumberFormat("@"); // mantém a data como texto DD/MM/AAAA
    const linhas = itens.map(function (it) {
      return [it.appId || ("L-" + it.id), it.data, it.desc, it.valor, it.cat, it.subtipo, meioPagamento_(it.obs), it.origem];
    });
    sh.getRange(2, 1, n, CABECALHO_ARQUIVO.length).setValues(linhas);
    sh.getRange(2, 4, n, 1).setNumberFormat("R$ #,##0.00");
  }

  const t = n + 2;
  sh.getRange(t, 3).setValue("Total Geral").setFontWeight("bold");
  sh.getRange(t, 4).setFormula(n > 0 ? "=SUM(D2:D" + (t - 1) + ")" : "=0").setNumberFormat("R$ #,##0.00").setFontWeight("bold");
  sh.setFrozenRows(1);
  return sh;
}

function atualizarResumoAnual_(ss, ciclo, resumo) {
  const sh = ss.getSheetByName(SHEET_RESUMO_ANUAL);
  if (!sh) return { atualizado: false, motivo: "Aba '" + SHEET_RESUMO_ANUAL + "' não encontrada." };

  const rotulo = rotuloCiclo_(ciclo);
  const colA = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
  let linha = -1;
  for (let i = 0; i < colA.length; i++) {
    if (String(colA[i][0]).trim() === rotulo) { linha = i + 1; break; }
  }
  if (linha < 0) {
    return { atualizado: false, motivo: "Linha '" + rotulo + "' não existe no Resumo Anual (crie a aba do ano novo)." };
  }

  // Colunas B (total) e E (qtd) são valores; C, D e F são fórmulas e não são tocadas.
  sh.getRange(linha, 2).setValue(resumo.total);
  sh.getRange(linha, 5).setValue(resumo.qtd);

  // Colunas de categoria (a partir da G) são mapeadas pelo nome no cabeçalho (linha 4).
  const cab = sh.getRange(4, 1, 1, sh.getLastColumn()).getValues()[0];
  cab.forEach(function (nome, i) {
    if (i >= 6 && nome) sh.getRange(linha, i + 1).setValue(resumo.porCategoria[String(nome).trim()] || 0);
  });
  return { atualizado: true, linha: linha };
}

function atualizarResumoMensal_(ss, ciclo) {
  const sh = ss.getSheets().filter(function (s) { return s.getName().indexOf(PREFIXO_RESUMO_MENSAL) === 0; })[0];
  if (!sh) return false;
  const c = partesCiclo_(ciclo);
  sh.setName(PREFIXO_RESUMO_MENSAL + MESES_ABREV[c.mes - 1] + "-" + String(c.ano).slice(2));
  sh.getRange("A2").setValue(MESES_NOME[c.mes - 1] + " " + c.ano + " • Acompanhamento de Gastos vs. Tetos Orçamentários");
  sh.getRange("G21:G22").setValue("—");
  return true;
}

/**
 * Fecha o ciclo vigente:
 *  1. salva todos os lançamentos numa aba "Fatura_<Mês>_<Ano>"
 *  2. grava o total e as categorias no "Resumo Anual"
 *  3. recomeça "Lancamentos" só com as próximas parcelas (Parcela X/Y com X < Y)
 *  4. avança o ciclo e renomeia a aba de resumo mensal
 */
function fecharFatura() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error("A planilha está em uso. Tente novamente em instantes.");
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ciclo = cicloAtual_();
    const proximo = proximoCiclo_(ciclo);
    const rotulo = rotuloCiclo_(ciclo);
    const c = partesCiclo_(ciclo);

    const itens = lerLancamentos_();
    const resumo = resumirItens_(itens);

    const nomeAba = "Fatura_" + MESES_ABREV[c.mes - 1] + "_" + c.ano;
    arquivarItens_(ss, nomeAba, itens);
    const anual = atualizarResumoAnual_(ss, ciclo, resumo);

    const parcelas = gerarProximasParcelas_(itens, ciclo, proximo, dataFechamentoBR_(ciclo));
    reescreverLancamentos_(obterAbaLancamentos_(), parcelas);
    PropertiesService.getScriptProperties().setProperty(PROP_CICLO, proximo);
    atualizarResumoMensal_(ss, proximo);
    SpreadsheetApp.flush();

    const totalParcelas = arredondar_(parcelas.reduce(function (s, p) { return s + p.valor; }, 0));
    return {
      ok: true,
      acao: "fechado",
      fechado: { label: rotulo, aba: nomeAba, total: resumo.total, qtd: resumo.qtd },
      proximo: {
        label: rotuloCiclo_(proximo),
        total: totalParcelas,
        parcelas: parcelas.map(function (p) { return { desc: p.desc, valor: p.valor }; })
      },
      anual: anual,
      ciclo: statusCiclo_()
    };
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// 8. GATILHO AUTOMÁTICO (dia 27)
// ============================================================
/** Executada pelo gatilho mensal. Só fecha se o fechamento do ciclo vigente já venceu (evita fechar em dobro). */
function fecharFaturaAutomatico() {
  if (hojeISO_() < dataFechamentoISO_(cicloAtual_())) return;
  fecharFatura();
}

/** Rode UMA VEZ manualmente no editor (menu Executar) para ativar o fechamento automático no dia 27, às 23h. */
function instalarGatilhoFechamento() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "fecharFaturaAutomatico") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("fecharFaturaAutomatico")
    .timeBased()
    .onMonthDay(DIA_FECHAMENTO)
    .atHour(23)
    .inTimezone(TZ)
    .create();
}

// ============================================================
// 9. API WEB
// ============================================================
function doGet(e) {
  try {
    const itens = lerLancamentos_().map(function (r) {
      return {
        id: r.appId || ("SHEET-" + r.id),
        date: r.data,
        desc: r.desc,
        val: r.valor,
        cat: r.cat,
        subtipo: r.subtipo,
        meioPagamento: meioPagamento_(r.obs),
        origem: r.origem
      };
    });
    return jsonOut_({ ok: true, items: itens, ciclo: statusCiclo_() });
  } catch (err) {
    return jsonOut_({ ok: false, erro: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    if (body.acao === "fechar_fatura") return jsonOut_(fecharFatura());
    if (Array.isArray(body.items)) return jsonOut_(importarItensDoApp_(body.items));

    const texto = body.texto || body.message || body.prompt;
    if (!texto) throw new Error("Nenhum texto recebido.");
    return jsonOut_(classificarEGerarLancamento(texto));
  } catch (err) {
    return jsonOut_({ ok: false, erro: String(err) });
  }
}
