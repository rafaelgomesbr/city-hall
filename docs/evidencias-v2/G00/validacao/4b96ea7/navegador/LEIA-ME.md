# Prova de navegador da validação da F00, rodada 2 (SHA 4b96ea7)

Produzida em 2026-10-13 por um agente de automação de navegador (Claude Sonnet 5.5) a pedido do gatekeeper, sobre o SHA `4b96ea7`, com API e painel em portas próprias e banco de teste semeado em memória. Não é relatório de validador e não dá veredito: é a execução, nos três motores (Chromium, Firefox e WebKit), dos roteiros T1 a T6 de `docs/relatorios-v2/aprovacao/ROTEIRO-G00.md`, que antes eram de Rafael, mais capturas das telas das etapas E05, E07, E08, E09, E10, E11 e E13 em 320, 390, 768 e 1280 px, tema claro e escuro.

- `RELATORIO.md`: comandos, resultado de cada roteiro, erros de console, medições de transbordo e o que não foi feito.
- `capturas/`: só as capturas do Chromium que sustentam os achados de layout (Minha conta da E09 a 320 e 390 px, diálogos de encerrar sessões a 390 px, Órgãos da E13 a 320 px). O conjunto inteiro (938 capturas, cerca de 107 MB) ficou fora do git por tamanho.

Atenção ao item 4 do `RELATORIO.md` (aviso de outra equipe no sino do agente): foi investigado e descartado com prova. A causa foi uma mutação temporária de outro validador carregada pela API deste agente; ver `docs/evidencias-v2/G00/V2-F00-E08/validacao/4b96ea7/red-team-sino.md`.
