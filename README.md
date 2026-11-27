# Fatura Radar

Controle dos gastos do cartão de crédito com lançamento por voz/texto (classificação via Gemini) e sincronização com o Google Sheets.

## Estrutura

```
index.html            página única (carrega css/ e js/)
css/style.css         estilos
js/
  config.js           URL do Apps Script, tetos, cores, dia de fechamento
  utils.js            formatação e normalização (funções puras)
  installments.js     leitura de "Parcela X/Y"
  cycle.js            rótulo do ciclo (fallback local)
  state.js            estado, cache local e consolidação dos lançamentos
  parser.js           interpretação local de comandos (fallback offline)
  api.js              chamadas ao Apps Script
  actions.js          lançar gasto, sincronizar, fechar fatura
  voice.js            microfone (Web Speech API)
  view.js             renderização
  main.js             eventos e sincronização automática
apps-script/Code.gs   código do Google Apps Script (cole no editor do script)
```

O app usa módulos ES nativos: precisa ser aberto por `https://` (GitHub Pages), não por `file://`.

## Fechamento da fatura (dia 27)

- **Automático:** gatilho do Apps Script roda todo dia 27 às 23h (`instalarGatilhoFechamento`, executar uma vez).
- **Manual:** botão **Fechar fatura** no app (aparece também um aviso se o fechamento estiver pendente).

Ao fechar, o script:
1. salva todos os lançamentos do ciclo na aba `Fatura_<Mês>_<Ano>`;
2. grava total, quantidade e categorias no `Resumo Anual`;
3. zera `Lancamentos` e recria só as próximas parcelas (`Parcela X/Y` com X < Y, valor igual, X+1);
4. avança o ciclo e renomeia a aba `Resumo e Tetos/<Mês-Ano>`.

O ciclo vigente fica guardado nas propriedades do script (`CICLO_ATUAL`). Valor inicial: `CICLO_INICIAL` em `Code.gs`.

## Atualizar o Apps Script

1. Abra o projeto em script.google.com e substitua o conteúdo de `Código.gs` por `apps-script/Code.gs`.
2. Execute `instalarGatilhoFechamento` uma vez (aceite as permissões).
3. Implantar → Gerenciar implantações → editar a implantação existente → Versão: **Nova versão** → Implantar (a URL continua a mesma).
