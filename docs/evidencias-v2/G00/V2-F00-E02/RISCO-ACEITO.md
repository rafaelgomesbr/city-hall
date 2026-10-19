# RISCO ACEITO em V2-F00-E02 (RASCUNHO do gatekeeper, NÃO aceito)

- Critério: conferência mecânica de evidência (seção 8 de `28-execucao-e-validacao.md` e regra 0.1 de `19-definicao-de-pronto.md`): o `INDEX.md` da pasta da etapa precisa bater, por SHA-256, com o conteúdo commitado.
- Por que não foi provado: BLOCKED na rodada 3 (2026-10-15, SHA 52952a1). O `INDEX.md` foi calculado no Windows sobre saídas de fim de linha misto que o git normalizou para LF no commit; num checkout novo os hashes não batem (ver `VEREDITO.md`, rodada 3, "Conferência mecânica"). Todas as dimensões de validação desta etapa deram PASS na rodada 3, com execução própria.
- Admite aceite? Sim em tese: o critério não está na lista da seção 7 de `28`. O gatekeeper NÃO recomenda aceitar: o conserto é mecânico (recalcular o `INDEX.md` sobre o conteúdo commitado, com nota datada, e tirar dele o `VEREDITO.md` quando estiver listado), não toca o mapa de impacto de nenhuma dimensão e permite herdar os PASS desta rodada na rodada 4.
- Risco: a evidência arquivada da etapa fica sem integridade verificável fora da máquina do autor.
- Mitigação: o conteúdo está no histórico do git desde o commit que o criou; os validadores da rodada 3 reexecutaram as provas.
- Dono: implementador da F00 (correção mecânica da E21 cobre as oito pastas).
- Validade: até a rodada 4 da F00.
- Quem aceitou: (vazio; só Rafael pode aceitar critério técnico)
- O BLOCKED original continua em VEREDITO.md, rodada 3.
- Superado na rodada 4 (2026-10-19, SHA bb0f654): o `INDEX.md` desta pasta bate byte a byte com o conteúdo commitado (correção 1 da E21, conferida por `conferir-indices-de-evidencia` e pelos validadores). O BLOCKED foi removido por revalidação, não por aceite; este rascunho nunca foi aceito e não vale mais.
- Status: encerrado (superado na rodada 4, sem aceite).
