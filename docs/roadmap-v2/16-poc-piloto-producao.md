# Fase 26: POC controlada

**Gate da fase:** G26 POC APROVADA | **Depende dos gates:** G25 (cumulativo na ordem de execução de `STATUS.md`: G00 a G25 e G29 a G35; o imediato é G25) | **Superfícies tocadas:** as cinco (`apps/web`, `apps/campo`, `apps/console`, `apps/portal`, `apps/cidadao`), `apps/api`, `db`, ambiente HML (nada em produção) | **Checkpoints da fase:** nenhum próprio; herda CP-14 (a marca d'água permanece), CP-29 e CP-31 (decididos em G20 e G22, ou adiados com o bloqueio declarado); os CP-NOVO dos módulos novos (CPF, provedor de assinatura, VLibras, custo de vídeo) só liberam dado real, e a POC usa sandbox e dado sintético

A POC é a prova ponta a ponta, em HML e com dado SINTÉTICO, de que as cinco superfícies funcionam juntas: cidadão, relato, triagem, ocorrência, despacho, agente em aparelho físico, secretaria, reinspeção, documento imutável, encerramento, exportação, eliminação, restore e provisionamento, e os módulos novos (incidentes, abrigos, logística, território, integrações, canal ampliado, idiomas, pessoa global). Os gates anteriores provaram peças; a POC prova a costura, num município sintético, com os fluxos A a N de `docs/roadmap-v2/20-matrizes.md` (seção C) e os critérios ALY:CA-01 a CA-10 mapeados por cenário; os módulos novos têm os cenários 6 a 10 (E08 a E12).

A POC NÃO é produção, NÃO é piloto (F27) e NÃO usa dado real de pessoa, de servidor ou de município; nenhum e-mail sai para pessoa real; integração externa e provedor de assinatura só em sandbox; CPF só gerado na hora. PRESERVA (MANTER): HML e semente de F01-E11 e F12-E01, os E2E automatizados de cada fase (rodam de novo, não são trocados por roteiro manual) e a marca d'água de validação (`fly.toml:69`). NÃO faz: abrir o canal do cidadão em município real (CP-28, F27), decidir questão jurídica (F28-E02) nem implementar item de `docs/roadmap-v2/21-fora-da-v2.md`. Defeito achado reabre a etapa de origem (o gate daquela fase volta a REPROVADO) e o cenário afetado é refeito inteiro na tag nova. Arquivos citados e criados por fases anteriores (por exemplo `scripts/e2e-portal.mjs`, F11-E22) só existem depois dessas etapas; esta fase não os cria.

Ordem: E01; E02 a E06 e E08 a E12 em qualquer ordem (cada uma parte de dados semeados na E01), com execução recomendada encadeada (a convertida da E02 é a do passo H da E03; a resposta da E04 alimenta a E05 e a E11); a E06 agenda a eliminação no começo, porque o banco impõe 7 dias mínimos, e faz o restore por último; E07 fecha e consolida todas.

## Etapas

### V2-F26-E01 - Roteiro, ambiente HML e dados sintéticos do POC
- **Prioridade:** P0
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (E02 a E06 usam a tag e a semente)
- **Objetivo:** congelar tag de HML, semente sintética e roteiro dos dez cenários antes de executar qualquer um.
- **Problema que resolve:** sem roteiro comum a POC vira demonstração solta; semente real ou tag que muda invalida a evidência.
- **Origem:** PR:Prompt-F26; PR:Fluxos; ALY:CA-01 a CA-10.
- **Estado atual:** CRIAR (roteiro, perfil `poc`); MANTER (HML de F01-E11).
- **Dependências de entrada:** G25 (cumulativo; inclui G20 a G24 e G29 a G35).
- **O que deve ser implementado:**
  - Arquivos: `dc360/docs/POC.md` (a criar): passos, estado e evento de trilha por cenário (1 a 10); matriz dos fluxos A a N e de CA-01 a CA-10.
  - Banco: `db/seeds/poc.sql` (a criar), perfil `poc` de `apps/api/src/semear-homologacao.ts`: Serra Alta, Vale Fundo, Obras, Saúde, órgão externo em dois municípios, abrigo, incidente, estoque, geometria e cor, senha sorteada; zero CPF e telefone.
  - Infraestrutura: HML na tag do G25 com `MARCA_DAGUA`, portal e MFA ligados; canal do cidadão só em Serra Alta; en e es ligados; integrações e assinatura só em sandbox; Android e iPhone físicos.
- **O que NÃO deve ser implementado nesta etapa:** execução dos cenários (E02 a E06); dado real; produção (F27).
- **Arquivos e módulos prováveis:** `dc360/docs/POC.md`, `dc360/db/seeds/poc.sql`, `dc360/db/test/seed-sintetica.test.ts`.
- **Risco de segurança:** HML ligada ao banco de PROD; senha sorteada no repositório.
- **Impacto LGPD:** só dado sintético; e-mail só a domínio de teste.
- **Migração necessária:** Não.
- **Compatibilidade:** HML apenas; PROD intocado.
- **Rollback:** recriar a semente (F01-E11).
- **Testes positivos:** perfil `poc` cria municípios e dados de partida; `/saude` devolve a tag.
- **Testes negativos:** perfil `poc` com `AMBIENTE_DC360=prod`: recusado; CPF em `poc.sql`: `seed-sintetica.test.ts` reprova.
- **Testes de autorização e isolamento:** conta de Serra Alta lê recurso de Vale Fundo: 404; usuário da Saúde lê encaminhamento da Obras: 404.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`, `npm run test:scripts`; gates anteriores.
- **E2E:** Não se aplica: a etapa prepara.
- **Validação humana:** Rafael e Alyson aprovam a tag.
- **Evidência a produzir:** `docs/evidencias-v2/G26/V2-F26-E01/`: roteiro, tag, `/saude`, aparelhos.
- **Documentação a atualizar:** `dc360/docs/AMBIENTES.md`.
- **Definition of Done:** roteiro aprovado; semente sem dado real; tag congelada.
- **Checkpoint:** Não.

### V2-F26-E02 - Cenário 1: cidadão, relato, triagem, ocorrência
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com E04 e E06)
- **Objetivo:** provar em Android e iPhone físicos e no painel de HML os fluxos F e G, sem relato nas métricas antes da conversão.
- **Problema que resolve:** F17-E18 e F18-E11 provaram em Node; relato não pode virar protocolo, métrica, evidência nem laudo, e o aparelho ficou para o POC.
- **Origem:** PR:Fluxos F, G; PR:Regra-relato; ALY:CA-01.
- **Estado atual:** MANTER (F16 a F18); EXPANDIR o roteiro.
- **Dependências de entrada:** E01.
- **O que deve ser implementado:**
  - Roteiro: OTP no e-mail de teste; `POST /v1/cidadao/relatos` com tipo COBRADE, GPS e duas fotos; a triagem assume, pede complemento, vincula duplicata, rejeita um relato e converte outro (`POST /v1/triagem/relatos/:id/converter`).
  - Conferências: `GET /relatorios/resumo` e CSV iguais antes e depois do relato, +1 só na conversão; protocolo oficial consumido uma vez; laudo sem foto nem texto do cidadão; nota interna ausente do app.
  - Automatizado: `scripts/e2e-cidadao.mjs`.
- **O que NÃO deve ser implementado nesta etapa:** despacho e agente (E03); canal em município real (F27-E01); anonimato (fora da V2); vídeo, chat, CPF e login ampliado (E09).
- **Arquivos e módulos prováveis:** `dc360/docs/POC.md`, `dc360/scripts/e2e-cidadao.mjs`, `dc360/apps/api/test/relato-nao-e-ocorrencia.test.ts`.
- **Risco de segurança:** relato visível a outro município; token do cidadão aceito em rota de servidor.
- **Impacto LGPD:** só dado sintético; fotos de aparelho de teste.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: só execução.
- **Rollback:** Não se aplica: nada muda.
- **Testes positivos:** do envio à conversão nos dois aparelhos.
- **Testes negativos:** converter duas vezes consome um protocolo; cinco reenvios geram um relato; canal desligado responde "não habilitado".
- **Testes de autorização e isolamento:** cidadão lê relato de outro cidadão: 404; coordenador de Vale Fundo lê relato de Serra Alta: 404.
- **Regressão obrigatória:** `npm run test:cidadao`, `npm run test:api`, `npm run test:isolamento`; G15 a G19.
- **E2E:** este é o E2E em aparelho de F e G.
- **Validação humana:** Alyson conduz sem ajuda; Rafael confere as métricas.
- **Evidência a produzir:** `docs/evidencias-v2/G26/V2-F26-E02/`: vídeo por aparelho, resumo antes e depois.
- **Documentação a atualizar:** `dc360/docs/POC.md`.
- **Definition of Done:** F e G completos; zero relato nas métricas antes da conversão.
- **Checkpoint:** Não.

### V2-F26-E03 - Cenário 2: despacho, agente, vistoria, prefeitura (aparelho físico)
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (o passo H usa a convertida da E02)
- **Objetivo:** provar em Android e iPhone físicos os fluxos A, B e H: vistoria offline sem perda e relato convertido chegando ao agente sem dado do cidadão.
- **Problema que resolve:** G14 provou o app com ocorrência de operador e F19-E07 o fluxo H sem aparelho; falta a prova física (BZ-N:N.7).
- **Origem:** PR:Fluxos A, B, H; BZ-N:N.7; ALY:CA-02; ALY:CA-05.
- **Estado atual:** MANTER (`packages/campo`); EXPANDIR o roteiro.
- **Dependências de entrada:** E01.
- **O que deve ser implementado:**
  - A e B: operador registra, a coordenação despacha; o agente entra em modo avião, preenche, captura GPS e cinco fotos, mata o app no envio, liga o sinal; a fila drena sem duplicar; o painel mostra vistoria e laudo.
  - H: no iPhone, a convertida da E02 vem com origem "relato" e coordenada declarada, sem nome, contato, foto, vídeo nem chat.
  - CA-05: coordenação edita com o agente offline; ao sincronizar aparece a revisão (F14-E03).
- **O que NÃO deve ser implementado nesta etapa:** reinspeção (E05); portal (E04); carga (F24); pessoa ou local real nas fotos.
- **Arquivos e módulos prováveis:** `dc360/docs/POC.md`, `dc360/apps/campo`, `dc360/apps/api/test/fluxo-h-relato-ate-o-agente.test.ts`.
- **Risco de segurança:** item perdido na fila; dado do cidadão no SQLite do aparelho.
- **Impacto LGPD:** fotos e coordenada sintéticas; SQLite inspecionado só por sentinelas.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: só execução.
- **Rollback:** Não se aplica: nada muda.
- **Testes positivos:** do despacho ao laudo nos dois aparelhos.
- **Testes negativos:** app morto no envio em modo avião: nada perdido; conta desativada no meio: erro tratado (F00-E06), vistoria preservada.
- **Testes de autorização e isolamento:** agente de outra equipe lê a tarefa: 404; agente de Vale Fundo: 404.
- **Regressão obrigatória:** `npm run test:campo`, `npm run test:api`, `npm run test:isolamento`; G14 e G19.
- **E2E:** este é o E2E físico de A, B e H.
- **Validação humana:** quem não escreveu o app opera; Rafael anota pedidos de ajuda.
- **Evidência a produzir:** `docs/evidencias-v2/G26/V2-F26-E03/`: tabela por aparelho, vídeos.
- **Documentação a atualizar:** `dc360/apps/campo/LEIA-ME.md`.
- **Definition of Done:** A, B e H completos nos dois aparelhos; CA-02 e CA-05 provados.
- **Checkpoint:** Não.

### V2-F26-E04 - Cenário 3: Defesa Civil, secretaria, aceite, resposta
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com E02 e E06)
- **Objetivo:** percorrer os fluxos C e D no portal de HML, com convite, MFA, aceite, resposta com anexo, devolução e reencaminhamento.
- **Problema que resolve:** F11-E22 provou C e D por script com contas semeadas; falta convite por e-mail de teste e MFA em aparelho.
- **Origem:** PR:Fluxos C, D; DP:T11; BZ-M:V2-SEC-03; ALY:CA-04.
- **Estado atual:** MANTER (portal de F11, G12).
- **Dependências de entrada:** E01.
- **O que deve ser implementado:**
  - C: a coordenação encaminha à Obras; o gestor ativa o TOTP, aceita, pede esclarecimento (prazo pausa) e responde com imagem; a coordenação vê o anexo e conclui; anexo fora do laudo sem promoção (F06-E12); lembrete chega por e-mail de teste.
  - D: a coordenação envia à Saúde por engano (a sugestão por competência, F10-E19, apontava a Obras); a Saúde devolve; a coordenação reencaminha.
  - Ofício por link de uso único (CP-22): abre uma vez.
  - Automatizado: `scripts/e2e-portal.mjs`.
- **O que NÃO deve ser implementado nesta etapa:** secretaria real (G12); reinspeção (E05); PDF antes do scanner (CP-12).
- **Arquivos e módulos prováveis:** `dc360/docs/POC.md`, `dc360/scripts/e2e-portal.mjs`, `dc360/apps/portal`.
- **Risco de segurança:** Obras ver Saúde; MFA desligado; upload sem cadeia segura.
- **Impacto LGPD:** dossiê sintético; consulta nominal registrada.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: só execução.
- **Rollback:** Não se aplica: nada muda.
- **Testes positivos:** C e D completos; prazo pausa e retoma.
- **Testes negativos:** segundo aceite: 409; usuário desativado no meio da sessão é expulso; arquivo de tipo falso: rejeitado.
- **Testes de autorização e isolamento:** usuário da Saúde lê encaminhamento da Obras: 404; token do portal em rota do painel: negado.
- **Regressão obrigatória:** `npm run test:e2e:portal`, `npm run test:api`, `npm run test:isolamento`; G04, G11 e G12.
- **E2E:** este é o E2E de C e D em HML.
- **Validação humana:** Alyson como coordenação, Rafael como gestor, MFA no próprio aparelho.
- **Evidência a produzir:** `docs/evidencias-v2/G26/V2-F26-E04/`: vídeo, trace, trilha.
- **Documentação a atualizar:** `dc360/docs/HOMOLOGACAO-DO-PORTAL.md`.
- **Definition of Done:** C e D completos; Obras x Saúde 404 em toda rota cruzada.
- **Checkpoint:** Não.

### V2-F26-E05 - Cenário 4: reinspeção, documento imutável, encerramento e reabertura
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com E02 e E06)
- **Objetivo:** provar os fluxos E, I e J: reinspeção, documento imutável com aprovação autenticada, substituição, encerramento e reabertura em 30 dias.
- **Problema que resolve:** F13-E08, F09-E10 e G14 provaram cada ponta; falta o laudo de amanhã igual ao de hoje depois da reabertura.
- **Origem:** PR:Fluxos E, I, J; PR:D-05; PR:D-21; ALY:CA-03; ALY:CA-07; ALY:FLU-04.
- **Estado atual:** MANTER (F09, F13, F14); EXPANDIR o roteiro.
- **Dependências de entrada:** E01.
- **O que deve ser implementado:**
  - E: `POST /v1/ocorrencias/:id/reinspecao`; o agente recebe a rodada 2 com motivo e resumo, sem texto da secretaria; o laudo novo não altera o da rodada 1.
  - I e J: aprovação autenticada (TOTP) e emissão; troca-se o nome do agente e reimprime-se com os mesmos bytes; `POST /v1/documentos/emitidos/:id/substituicao` preserva a v1.
  - Encerramento: providência aberta segue CP-17; a coordenação reabre a encerrada, com motivo, em até 30 dias (D-21) por `POST /v1/ocorrencias/:id/reabertura`: rodada nova e emitido intacto; depois, só ocorrência vinculada. Marca "DOCUMENTO DE VALIDAÇÃO" em todo PDF.
- **O que NÃO deve ser implementado nesta etapa:** retirar a marca d'água (F28-E06); QR (CP-16); assinatura por provedor (E12).
- **Arquivos e módulos prováveis:** `dc360/docs/POC.md`, `dc360/apps/api/test/fluxo-e-reinspecao.test.ts`, `dc360/apps/api/test/laudo-de-amanha-igual-ao-de-hoje.test.ts`.
- **Risco de segurança:** histórico da secretaria no aparelho; documento emitido mudando.
- **Impacto LGPD:** famílias e endereços fictícios.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: só execução.
- **Rollback:** Não se aplica: nada muda.
- **Testes positivos:** v2 com `substitui_id`; mesmo sha256 na reimpressão; reabertura aos 5 dias vai a `triagem`.
- **Testes negativos:** segunda reinspeção sobre a mesma resposta: 409; reabertura aos 31 dias: 409; PDF adulterado: 500 `integridade_do_documento`.
- **Testes de autorização e isolamento:** agente de outra equipe lê a rodada 2: 404; operador cancela documento ou reabre ocorrência: 403.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:campo`, `npm run test:isolamento`; G09, G13 e G14.
- **E2E:** de E, I e J.
- **Validação humana:** Rafael e Alyson comparam o hash.
- **Evidência a produzir:** `docs/evidencias-v2/G26/V2-F26-E05/`: PDFs com sha256 de v1 e v2.
- **Documentação a atualizar:** `dc360/docs/POC.md`.
- **Definition of Done:** E, I e J completos; v1 preservada; reabertura no prazo e fora dele.
- **Checkpoint:** Não.

### V2-F26-E06 - Cenário 5: exportação, eliminação e restore de município sintético
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** crítica  |  **Risco:** crítico  |  **Paralelizável:** sim (com E02 a E05)
- **Objetivo:** provar os fluxos K, L, M e N: provisionar pelo console, exportar, restaurar HML em banco limpo e eliminar um município sintético.
- **Problema que resolve:** provados em gates separados, nunca sobre os mesmos dados; a eliminação espera 7 dias no mínimo.
- **Origem:** PR:Fluxos K, L, M, N; ALY:CA-08; ALY:CA-10.
- **Estado atual:** MANTER (console, `saida/pacote.ts`, `eliminacao/relogio.ts`); EXPANDIR o roteiro.
- **Dependências de entrada:** E01.
- **O que deve ser implementado:**
  - N: operador do console (TOTP) cria município sintético (`POST /prefeituras`); o administrador perde o acesso e o console o reemite (F20-E02).
  - L (agendar no começo): o município agendado segue exportando (F20-E04); ao vencer, o relógio purga o armazenamento (vídeos inclusive) e deixa zero linha em toda tabela.
  - K: o administrador de Serra Alta baixa `POST /v1/saida/pacote.zip`; índice e `SOMAS-SHA256.txt` batem com o manifesto e o PDF emitido.
  - M: restore de HML em banco limpo (F22-E03); a API sobe nele; mesmo índice; tempos.
- **O que NÃO deve ser implementado nesta etapa:** município real (F28-E10); o que se preserva (CP-29); suporte (CP-30).
- **Arquivos e módulos prováveis:** `dc360/docs/POC.md`, `dc360/apps/console/src/servidor.ts`, `dc360/apps/api/src/eliminacao/relogio.ts`.
- **Risco de segurança:** eliminar o município errado; segredo no pacote.
- **Impacto LGPD:** pacote sintético fora do repositório: só índice e SHA-256.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: só execução.
- **Rollback:** cancelar a eliminação em 7 dias.
- **Testes positivos:** pacote com todas as tabelas do manifesto; restore com índice igual.
- **Testes negativos:** eliminar com nome errado: recusado; suspender município agendado: recusado; antes de 7 dias: não executa.
- **Testes de autorização e isolamento:** administrador de Vale Fundo baixa o pacote de Serra Alta: 404; operador do console lê ocorrência: negado.
- **Regressão obrigatória:** `npm run test:console`, `npm run test:isolamento`, `npm run test:api`; G05, G20 e G22.
- **E2E:** E2E de K, L, M e N.
- **Validação humana:** quem não escreveu o sistema faz o restore.
- **Evidência a produzir:** `docs/evidencias-v2/G26/V2-F26-E06/`: log do restore com tempos, índice e SHA-256.
- **Documentação a atualizar:** `dc360/docs/SAIDA-DE-MUNICIPIO.md`.
- **Definition of Done:** K, L, M e N completos; purga completa; restore com índice igual.
- **Checkpoint:** Não.

### V2-F26-E07 - Relatório do POC e evidências
- **Prioridade:** P0
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** não (depende de E02 a E06)
- **Objetivo:** consolidar a POC num relatório que diga o que foi provado, o que não foi e se o piloto pode começar.
- **Problema que resolve:** E2E verde não autoriza pôr pessoas reais; o que NÃO foi provado precisa estar escrito antes do piloto.
- **Origem:** PR:Prompt-F26; PR:Fluxos; DP:R2; ALY:CA-01 a CA-10.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E02 a E06; E08 a E12.
- **O que deve ser implementado:**
  - Arquivos: `docs/evidencias-v2/G26/RELATORIO.md`: resultado, tag, tempo e defeitos por cenário; matriz dos fluxos A a N e dos cenários 6 a 10 por evidência; tabela CA-01 a CA-10 (CA-09 no piloto, CA-10 real em F28-E10); custo de HML; o que NÃO foi provado; recomendação.
  - Arquivos: `docs/evidencias-v2/G26/DEFEITOS.md`: ciclo de cada defeito; nenhum P0 ou P1 aberto.
  - Varredura de segredos e de padrão de CPF e telefone antes de arquivar.
- **O que NÃO deve ser implementado nesta etapa:** iniciar o piloto (F27-E01); mudar código (defeito reabre a etapa de origem).
- **Arquivos e módulos prováveis:** `docs/evidencias-v2/G26/RELATORIO.md` (a criar), `docs/evidencias-v2/G26/DEFEITOS.md` (a criar), `docs/evidencias-v2/G26/GATE.md`.
- **Risco de segurança:** aprovar sem ler o "não provado"; segredo em evidência.
- **Impacto LGPD:** Não se aplica: dado sintético; a varredura confirma.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: documento.
- **Rollback:** o G26 volta a REPROVADO sem o relatório.
- **Testes positivos:** `regras-de-conteudo.test.ts` aprova; todo item do G26 aponta evidência com `INDEX.md`.
- **Testes negativos:** defeito P0 ou P1 aberto reprova; cenário em tag diferente reprova; CPF em evidência reprova a varredura.
- **Testes de autorização e isolamento:** Não se aplica: documento; os negativos ficam nas E02 a E06.
- **Regressão obrigatória:** `npm test --workspace @dc360/shared`, `npm run conferir:numeros`; gates anteriores.
- **E2E:** Não se aplica: documento.
- **Validação humana:** Rafael e Alyson aprovam em ata: seguir para F27, corrigir ou parar.
- **Evidência a produzir:** `docs/evidencias-v2/G26/V2-F26-E07/`: relatório, defeitos, varredura.
- **Documentação a atualizar:** `docs/ROADMAP-V2.md` (estado).
- **Definition of Done:** relatório aprovado; zero defeito P0 ou P1 aberto; G26 com data ISO.
- **Checkpoint:** Não.

### V2-F26-E08 - Cenário 6: incidentes, abrigos e logística humanitária (painel e app do agente offline)
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com E02 a E06)
- **Objetivo:** provar em HML, no painel e no app do agente em aparelho físico, incidentes, abrigos e logística humanitária, com a ocorrência individual e auditável.
- **Problema que resolve:** F29 e F30 provaram em teste; falta a prova em aparelho, offline e no isolamento (D-15).
- **Origem:** PR:D-15; ALY:INC-01 a INC-04; ALY:ABR-01; ALY:LOG-01 a LOG-07; ALY:RN-08.
- **Estado atual:** MANTER (F29 e F30); EXPANDIR o roteiro.
- **Dependências de entrada:** E01; G29; G30.
- **O que deve ser implementado:**
  - Roteiro: um incidente com ocorrências vinculadas; um abrigo com capacidade e ocupação; estoque e distribuição; no aparelho, em modo avião, o agente registra a ocupação e uma distribuição, mata o app no envio e sincroniza sem duplicar (passos por requisito: F29-E18 e F30-E18).
  - Conferências: cada ocorrência segue individual (RN-08); contagens do painel iguais às do aparelho; trilha nominal; tabelas novas no manifesto (G05).
  - Automatizado: `e2e-crise.mjs`.
- **O que NÃO deve ser implementado nesta etapa:** funcionalidade nova (F29, F30); pessoa acolhida real; piloto (F27).
- **Arquivos e módulos prováveis:** `dc360/docs/POC.md`, `dc360/scripts/e2e-crise.mjs` (a criar), `dc360/apps/campo`.
- **Risco de segurança:** pessoa acolhida visível a outro município; item perdido na fila offline.
- **Impacto LGPD:** dado de acolhido: só sintético.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: só execução.
- **Rollback:** Não se aplica: nada muda.
- **Testes positivos:** do incidente à distribuição, no painel e nos dois aparelhos.
- **Testes negativos:** app morto no envio em modo avião: nada perdido nem duplicado; ocupação acima da capacidade: recusada; distribuição sem estoque: 409.
- **Testes de autorização e isolamento:** coordenador de Vale Fundo lê abrigo ou estoque de Serra Alta: 404; agente de outra equipe: 404.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:campo`, `npm run test:isolamento`; G29, G30.
- **E2E:** este é o E2E em aparelho de incidente, abrigo e logística.
- **Validação humana:** quem não escreveu o app opera; Alyson confere os números.
- **Evidência a produzir:** `docs/evidencias-v2/G26/V2-F26-E08/`: vídeo por aparelho, contagens.
- **Documentação a atualizar:** `dc360/docs/POC.md`.
- **Definition of Done:** os três módulos provados em aparelho e no isolamento.
- **Checkpoint:** Não.

### V2-F26-E09 - Cenário 7: canal ampliado (vídeo, chat, CPF, login) e idiomas
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com E02 a E06)
- **Objetivo:** provar em Android e iPhone físicos o relato com CPF, vídeo e chat, o login e o idioma, até a conversão.
- **Problema que resolve:** falta o HEVC do iPhone real, o chat com a triagem e a tela em en e es no aparelho (D-07, D-12).
- **Origem:** PR:D-07; PR:D-12; PR:Fluxos F, G; ALY:CA-01.
- **Estado atual:** MANTER (F34, F35); EXPANDIR o roteiro da E02.
- **Dependências de entrada:** E01; E02; G34; G35.
- **O que deve ser implementado:**
  - Roteiro: o app em en e em es; OTP no e-mail de teste e, só com credencial de sandbox, gov.br, SMS e login social; CPF gerado na hora; relato com foto, vídeo de 20 s e chat; a triagem vê o vídeo transcodificado, responde e converte.
  - Conferências: CPF em máscara nas listas e ausente do log; o agente não recebe vídeo nem chat (F19-E05); custo de armazenamento medido.
- **O que NÃO deve ser implementado nesta etapa:** anonimato e tempo real do chat (fora da V2); município real (F27); CPF real.
- **Arquivos e módulos prováveis:** `dc360/docs/POC.md`, `dc360/scripts/e2e-cidadao.mjs`.
- **Risco de segurança:** CPF em log; vídeo hostil `ativo`.
- **Impacto LGPD:** CPF gerado na hora; vídeo sem rosto nem voz reais.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: só execução.
- **Rollback:** Não se aplica: nada muda.
- **Testes positivos:** relato ampliado chega à conversão nos dois aparelhos, em en e es.
- **Testes negativos:** vídeo de 51 MB e segundo vídeo: recusados; CPF inválido: 422; relato identificado sem CPF: recusado.
- **Testes de autorização e isolamento:** cidadão B lê vídeo ou chat do relato do A: 404; coordenador de Vale Fundo lê o chat de Serra Alta: 404.
- **Regressão obrigatória:** `npm run test:cidadao`, `npm run test:api`, `npm run test:isolamento`; G17, G18, G34, G35.
- **E2E:** E2E em aparelho do canal ampliado.
- **Validação humana:** Alyson conduz sem ajuda; falante de en e es lê duas telas.
- **Evidência a produzir:** `docs/evidencias-v2/G26/V2-F26-E09/`: vídeos, custo.
- **Documentação a atualizar:** `dc360/docs/POC.md`.
- **Definition of Done:** relato ampliado completo nos dois aparelhos; zero CPF em log.
- **Checkpoint:** Não (CP-46 e CP-47 só liberam dado real).

### V2-F26-E10 - Cenário 8: território, configuração por município e integrações
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com E02 a E06)
- **Objetivo:** provar em HML a consulta por raio, imóvel e área de risco (PostGIS), a configuração versionada com checklist por tipo, a importação em lote e as integrações em sandbox.
- **Problema que resolve:** falta a costura no município sintético, com o Postgres real de HML e o isolamento entre Serra Alta e Vale Fundo.
- **Origem:** PR:D-14; PR:D-16; PR:D-17; ALY:GEO-02; ALY:OCO-08; ALY:CFG-01.
- **Estado atual:** MANTER (F31 a F33); EXPANDIR o roteiro.
- **Dependências de entrada:** E01; G31; G32; G33.
- **O que deve ser implementado:**
  - Território: ocorrências a 500 m de um ponto, por imóvel e dentro de uma área de risco; o município de um relato resolvido por coordenada.
  - Configuração: tipo e prazo versionados, checklist condicional na vistoria, CSV de 50 linhas com 1 inválida.
  - Integrações: camada GeoJSON, KML e WMS de host de teste; WhatsApp oficial e adaptadores S2ID, SEI e Defesa Civil Alerta só em sandbox; dado do Cemaden se a API for confirmada (F31-E14).
- **O que NÃO deve ser implementado nesta etapa:** credenciamento real (F27, F28-E15); funcionalidade nova.
- **Arquivos e módulos prováveis:** `dc360/docs/POC.md`, `dc360/scripts/e2e-territorio.mjs` (a criar em `dc360/scripts/`).
- **Risco de segurança:** URL de camada que alcança rede interna; lote que grava em outro município.
- **Impacto LGPD:** Não se aplica: CSV e coordenadas sintéticos.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: só execução.
- **Rollback:** Não se aplica: nada muda.
- **Testes positivos:** raio, imóvel e área devolvem o esperado; as 49 linhas válidas entram.
- **Testes negativos:** CSV com `organizacao_id` na coluna: recusado; URL de camada fora da lista: recusada; webhook sem assinatura: 401.
- **Testes de autorização e isolamento:** consulta por raio com geometria de Vale Fundo em Serra Alta: 0 linhas; lote de Vale Fundo só entra em Vale Fundo.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`; G31, G32, G33.
- **E2E:** E2E de HML dos três blocos.
- **Validação humana:** Alyson confere o mapa e o relatório do CSV.
- **Evidência a produzir:** `docs/evidencias-v2/G26/V2-F26-E10/`: saídas e mapa.
- **Documentação a atualizar:** `dc360/docs/POC.md`.
- **Definition of Done:** os três blocos provados; zero vazamento.
- **Checkpoint:** Não.

### V2-F26-E11 - Cenário 9: pessoa global, órgão externo, competência e escalonamento
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com E02 a E06)
- **Objetivo:** provar no portal de HML uma pessoa de órgão externo com contas em dois municípios, a sugestão de destino por competência e o escalonamento acima do gestor do órgão.
- **Problema que resolve:** falta o caminho inteiro, com MFA, escolha de município e prazo vencido (D-08, D-18).
- **Origem:** PR:D-08; PR:D-18; PR:D-23; PR:Fluxos C, D.
- **Estado atual:** MANTER (F03, F04, F10, F11); EXPANDIR o roteiro da E04.
- **Dependências de entrada:** E01; E04.
- **O que deve ser implementado:**
  - Roteiro: Elisa (distribuidora, órgão externo) convidada por Serra Alta e por Vale Fundo; entra, escolhe o município e troca sem sair; a coordenação envia o encaminhamento ao órgão sugerido pela competência por COBRADE e território; Elisa aceita; o prazo vence e o escalonamento notifica a cadeia do município.
  - Conferências: dois vínculos, uma pessoa; token de um município por vez; MFA herdado na troca; trilha de cada escolha.
- **O que NÃO deve ser implementado nesta etapa:** órgão externo real (F27); reset multimunicípio sem o checkpoint.
- **Arquivos e módulos prováveis:** `dc360/docs/POC.md`, `dc360/scripts/e2e-portal.mjs`, `dc360/apps/portal`.
- **Risco de segurança:** token de A aceito em B; pessoa que vê os dois municípios ao mesmo tempo.
- **Impacto LGPD:** identidade global sintética; termo do órgão externo aceito no convite (CP-51).
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: só execução.
- **Rollback:** Não se aplica: nada muda.
- **Testes positivos:** escolha, troca, aceite e escalonamento completos.
- **Testes negativos:** devolver depois do aceite: 409 (D-23); segunda conta no mesmo município: recusada; e-mail inexistente responde igual ao existente.
- **Testes de autorização e isolamento:** Elisa com token de A lê encaminhamento de B: 404; usuário da Saúde lê o da Obras: 404.
- **Regressão obrigatória:** `npm run test:e2e:portal`, `npm run test:api`, `npm run test:isolamento`; G03, G04, G11, G12.
- **E2E:** este é o E2E da pessoa global em HML.
- **Validação humana:** Rafael como gestor, Alyson como coordenação, MFA no aparelho.
- **Evidência a produzir:** `docs/evidencias-v2/G26/V2-F26-E11/`: vídeo, trace, trilha.
- **Documentação a atualizar:** `dc360/docs/HOMOLOGACAO-DO-PORTAL.md`.
- **Definition of Done:** pessoa em dois municípios sem cruzamento; escalonamento provado.
- **Checkpoint:** Não (CP-49 só libera dado real).

### V2-F26-E12 - Cenário 10: suporte assistido, assinatura por provedor, PWA e tracing
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** crítico  |  **Paralelizável:** sim (com E02 a E06)
- **Objetivo:** provar em HML o suporte assistido somente leitura, a assinatura por provedor em sandbox, a instalação do painel e do portal e o tracing sem dado pessoal.
- **Problema que resolve:** cada um foi provado sozinho; a POC prova a costura e que "aprovação autenticada" segue como nome até J8.
- **Origem:** PR:D-09; PR:D-10; PR:D-13; PR:D-22; PR:D-06.
- **Estado atual:** MANTER (F09, F10, F20, F21); EXPANDIR o roteiro.
- **Dependências de entrada:** E01; E05; G09; G10; G20; G21.
- **O que deve ser implementado:**
  - Suporte: o administrador de Serra Alta libera 2 horas com TOTP; o operador do console lê e tenta escrever; revoga; a trilha registra.
  - Assinatura: o laudo aprovado vai ao provedor de sandbox; o worker consulta; o PDF assinado fica guardado e ligado ao emitido; falha injetada e reenvio sem duplicar.
  - PWA e tracing: painel e portal instalados em Android e iPhone, sem rede mostra o aviso; um span de relato no destino de HML sem dado pessoal e o SLO medido.
- **O que NÃO deve ser implementado nesta etapa:** provedor real e valor jurídico (CP-41, J8); impersonation; produção.
- **Arquivos e módulos prováveis:** `dc360/docs/POC.md`, `dc360/apps/console`.
- **Risco de segurança:** escrita pela sessão de suporte; PDF assinado diferente do enviado.
- **Impacto LGPD:** só documento sintético vai ao provedor.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: só execução.
- **Rollback:** Não se aplica: nada muda.
- **Testes positivos:** leitura registrada; PDF assinado com sha256 ligado ao emitido.
- **Testes negativos:** `POST` com sessão de suporte: 403; concessão vencida: 401; retorno com hash diferente: recusado.
- **Testes de autorização e isolamento:** concessão de Serra Alta lê Vale Fundo: 404; coordenador libera suporte: 403.
- **Regressão obrigatória:** `npm run test:console`, `npm run test:api`, `npm run test:isolamento`; G09, G20, G21.
- **E2E:** E2E de HML dos quatro itens.
- **Validação humana:** Rafael tenta escrever com o suporte e compara os hashes.
- **Evidência a produzir:** `docs/evidencias-v2/G26/V2-F26-E12/`: trilha, hashes, capturas.
- **Documentação a atualizar:** `dc360/docs/POC.md`.
- **Definition of Done:** os quatro itens provados; nomenclatura "aprovação autenticada" mantida.
- **Checkpoint:** Não (CP-30 e o provedor só liberam uso real).

# GATE G26 - POC APROVADA

Só passa se:
- [ ] Pré-condição: G20 a G25 e G29 a G35 aprovados, cada um com `GATE.md` em `docs/evidencias-v2/Gnn/`; a tag única do POC registrada e nenhum cenário executado em outra tag sem reexecução. Evidência: V2-F26-E01.
- [ ] V2-F26-E01 (P0): `POC.md` aprovado; semente `poc` sem dado real (`seed-sintetica.test.ts` verde); HML na tag congelada com `MARCA_DAGUA` ligada; Android e iPhone físicos listados (modelo, sistema, build). Evidência: E01.
- [ ] V2-F26-E02 (P0): fluxos F e G completos nos dois aparelhos; resumo e CSV iguais antes e depois do envio do relato; protocolo oficial consumido uma vez. Evidência: E02.
- [ ] V2-F26-E03 (P0): fluxos A, B e H completos nos dois aparelhos físicos; CA-02 (modo avião, GPS, cinco fotos, app morto no envio) sem item perdido nem duplicado; CA-05 com tela de revisão; sentinelas do cidadão ausentes do SQLite do aparelho. Evidência: E03.
- [ ] V2-F26-E04 (P0): fluxos C e D em HML com convite, MFA, aceite nominal, pausa do prazo, anexo, devolução e reencaminhamento; Obras x Saúde: 404 em toda rota cruzada. Evidência: E04.
- [ ] V2-F26-E05 (P0): fluxos E, I e J: rodada 2 sem histórico da secretaria; reimpressão com o mesmo sha256; substituição preserva a v1; reabertura dentro do prazo vai a `triagem` e depois dele só ocorrência vinculada; marca d'água em todo PDF. Evidência: E05.
- [ ] V2-F26-E06 (P0): fluxos K, L, M e N: pacote conferido contra manifesto e hashes; eliminação do município sintético concluída com purga completa (o gate NÃO passa antes de o relógio vencer); restore em banco limpo com índice e hashes iguais e tempos registrados; provisionamento com reemissão de acesso. Evidência: E06.
- [ ] V2-F26-E08 (P0): incidente, abrigo e logística completos no painel e nos dois aparelhos, offline sem perda nem duplicata, ocorrência individual e auditável, 404 entre Serra Alta e Vale Fundo. Evidência: E08.
- [ ] V2-F26-E09 (P0): relato com CPF gerado, vídeo e chat nos dois aparelhos, em en e es, até a conversão; CPF só em máscara e ausente do log; agente sem vídeo nem chat; custo de vídeo medido. Evidência: E09.
- [ ] V2-F26-E10 (P0): consulta por raio, imóvel e área de risco, configuração versionada, checklist condicional e lote CSV com linha inválida; integrações em sandbox; zero vazamento entre municípios. Evidência: E10.
- [ ] V2-F26-E11 (P0): pessoa de órgão externo com contas em dois municípios escolhe, troca, aceita e dispara escalonamento; token de um município por vez; 404 cruzado. Evidência: E11.
- [ ] V2-F26-E12 (P0): suporte somente leitura registrado, assinatura por provedor em sandbox com PDF ligado ao emitido, painel e portal instalados sem dado em cache e span sem dado pessoal; "aprovação autenticada" mantida como nome. Evidência: E12.
- [ ] V2-F26-E07 (P0): relatório aprovado por Rafael e Alyson com "o que NÃO foi provado"; matriz dos fluxos A a N e dos cenários 6 a 10 sem lacuna; zero defeito P0 ou P1 aberto. Evidência: E07.
- [ ] ALY:CA-01 a CA-08 provados em HML e CA-10 provado com município sintético, cada um apontado na tabela do relatório; CA-09 declarado "a provar no piloto" e CA-10 com município real declarado "a provar em F28-E10".
- [ ] CP-14, CP-29 e CP-31: estado registrado; se adiados, o relatório diz o que fica bloqueado (marca d'água mantida, eliminação de município real, sem promessa de RPO e RTO).
- [ ] Zero dado real e zero segredo em `docs/evidencias-v2/G26/` (varredura de segredos e de padrão de CPF e telefone verde).
- [ ] `npm run test:isolamento`, `npm run test:api`, `npm run test:campo`, `npm run test:cidadao`, `npm run test:console`, `npm run test:e2e:api`, `npm run test:e2e:portal`, `npm run typecheck`, `npm run auditar` e `npm run conferir:numeros` verdes na tag do POC.
- [ ] nenhuma regressão: gates G00 a G25 e G29 a G35 continuam verdes (se um quebrar, ESTE gate volta a REPROVADO).
- [ ] documentação atualizada (`POC.md`, `SAIDA-DE-MUNICIPIO.md`, `AMBIENTES.md`) e evidências arquivadas em `docs/evidencias-v2/G26/`.

**Reabre se:** defeito P0 ou P1 aparecer em cenário já aprovado; qualquer cenário perder a prova por mudança de tag sem reexecução; dado real entrar em HML ou na evidência; a marca d'água sair dos PDFs; um gate de G00 a G25 ou de G29 a G35 reprovar; módulo novo ligado em HML sem sandbox ou com dado real.
**Este Gate libera:** F27 (piloto municipal), ainda atrás de CP-34 (termo do piloto), CP-19, CP-28 e CP-07; NÃO libera produção, canal do cidadão em município real nem retirada da marca d'água.

# Fase 27: Piloto municipal

**Gate da fase:** G27 PILOTO ENCERRADO | **Depende dos gates:** G26 (cumulativo na ordem de execução de `STATUS.md`: G00 a G26 e G29 a G35) | **Superfícies tocadas:** `apps/web`, `apps/campo` e `apps/console` em produção; `apps/portal` e `apps/cidadao` só conforme o escopo do termo; `apps/api`, `db` (sem migration nova esperada), PROD | **Checkpoints da fase:** CP-34, CP-19, CP-28, CP-07, CP-27, CP-13, CP-75, CP-76 (condicionais ao escopo: CP-08, CP-09, CP-11, CP-22, CP-26, CP-46, CP-47)

O piloto é uso REAL e CONTROLADO: um município, pessoas reais, dado real, período e escopo escritos num termo (CP-34). Não é produção comercial e não vira produção em silêncio: sem termo, sem piloto; ao fim do período ou renova-se por novo termo, ou encerra-se com ata, pacote entregue e contas desativadas (nunca apagadas). A marca d'água de validação (`fly.toml:69`) PERMANECE em todo documento até CP-14: documento do piloto não substitui o ato oficial do município, e o termo diz isso.

O escopo cresce por DEGRAUS com critério de entrada (E05). (1) Defesa Civil com painel, app de campo e console. (2) Mais a secretaria piloto no portal, só com CP-08, CP-09, CP-19 e CP-22 decididos. (3) Mais o canal do cidadão, só com CP-28 (checklist de prontidão, equipe e horário de triagem), CP-11 e CP-26 decididos e G25 cumprido; beta externo só com CP-11, CP-26, CP-33 e G25. (4) Mais incidentes, abrigos, logística e território, com CP-75 decidido (E07). (5) Mais o canal ampliado (vídeo, chat, CPF) e os idiomas, com CP-46, CP-47 e CP-26 decididos (E08). (6) Mais integrações reais, assinatura por provedor, suporte assistido e órgão externo multi-município, cada um só com a sua decisão (E09). Superfície cujo checkpoint está aberto fica DESLIGADA (o canal do cidadão é desligado por padrão).

PRESERVA: a lista de verificação da F26, a escala de gravidade de `dc360/docs/INDISPONIBILIDADE.md`, o isolamento e a trilha. NÃO faz: funcionalidade nova (só correção por promoção, F01-E12), cobrança, SLA contratual (F28-E05) nem item de `docs/roadmap-v2/21-fora-da-v2.md`. Arquivos citados e criados por fases anteriores só existem depois dessas etapas; esta fase só cria os que marca "a criar".

Ordem: E01; E02, E03 e E04 em paralelo (documentos e ensaios em HML disjuntos); E05 depois das três; E07, E08 e E09 (degraus 4 a 6) depois da E05, nessa ordem; E06 fecha.

## Etapas

### V2-F27-E01 - Preparar a produção do piloto (config, marca d'água, contas, treinamento)
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** crítico  |  **Paralelizável:** não (E02 a E05 usam o termo)
- **Objetivo:** ter termo escrito e produção do piloto prontos (degraus, MFA, marca d'água mantida, equipe treinada) antes de dado real.
- **Problema que resolve:** sem termo o piloto vira produção comercial por inércia; em PROD e-mail, recuperação e push seguem desligados (`fly.toml:67`).
- **Origem:** DP:R2; DP:R6; PR:Prompt-F27; BZ-F:P1-OPER.
- **Estado atual:** CRIAR (termo, `PILOTO.md`); EXPANDIR (configuração de PROD).
- **Dependências de entrada:** G26; CP-34; CP-19; CP-28.
- **O que deve ser implementado:**
  - Arquivos: `dc360/docs/PILOTO.md` (a criar) e `docs/evidencias-v2/CP-34/decisao.md`: município, secretaria, agentes e usuários, período (datas ISO), degraus 1 a 6, suporte, parada, métricas, destino dos dados; "piloto não é produção comercial"; instrumento jurídico do município, aqui só o hash.
  - Infraestrutura: `fly.toml`: `MARCA_DAGUA` mantida, MFA ligado; e-mail, recuperação e push só após CP-19.
  - Contas e treinamento: município por `POST /prefeituras`; convite (F03-E10); MFA e prova prática em HML antes da conta de PROD; app de campo interno (`apps/campo/LOJAS.md`).
- **O que NÃO deve ser implementado nesta etapa:** canal do cidadão sem CP-28; retirar a marca d'água (CP-14); contrato comercial.
- **Arquivos e módulos prováveis:** `dc360/docs/PILOTO.md`, `dc360/fly.toml`, `dc360/docs/IMPLANTACAO.md`, `dc360/docs/GUIA-DO-COORDENADOR.md`.
- **Risco de segurança:** dado real sem MFA nem backup; superfície ligada com checkpoint aberto.
- **Impacto LGPD:** município controlador, fornecedor operador; aviso de 30 dias a cada subprocessador novo.
- **Migração necessária:** Não.
- **Compatibilidade:** PROD atual segue.
- **Rollback:** interruptores da E03; promoção anterior.
- **Testes positivos:** município entra com convite e MFA; PDF de PROD traz a marca.
- **Testes negativos:** conta sem MFA não entra no portal; superfície com checkpoint aberto responde desligada.
- **Testes de autorização e isolamento:** órgão piloto lê encaminhamento de outro órgão: 404; endurecimento de PROD volta vazio.
- **Regressão obrigatória:** `npm run verificar`, `npm run test:isolamento`; gates anteriores.
- **E2E:** ensaio do degrau 1 em HML, na tag de PROD.
- **Validação humana:** município e Alyson: termo; Rafael: configuração.
- **Evidência a produzir:** `docs/evidencias-v2/G27/V2-F27-E01/`: hash do termo, CP-34, CP-19, CP-28, diff de `fly.toml`.
- **Documentação a atualizar:** `dc360/docs/PILOTO.md`.
- **Definition of Done:** termo firmado; contas com MFA; marca verificada em PROD; equipe treinada.
- **Checkpoint:** CP-34 (bloqueia o início), CP-19 (convite e OTP reais), CP-28 (canal).

### V2-F27-E02 - Suporte, plantão e canal do piloto
- **Prioridade:** P0
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** sim (com E03 e E04)
- **Objetivo:** haver quem leia o alerta, quem responda, por qual canal e em que prazo, ensaiado antes do primeiro uso real.
- **Problema que resolve:** `dc360/docs/INDISPONIBILIDADE.md` seção 6 tem os quatro contatos vazios e o fator de ônibus é 1 (REL:10).
- **Origem:** DP:K15; REL:10; BZ-F:P1-CONT.
- **Estado atual:** EXPANDIR (`INDISPONIBILIDADE.md`; runbooks de F01-E16 e F21-E07).
- **Dependências de entrada:** E01; CP-07.
- **O que deve ser implementado:**
  - Arquivos: seção 6 por FUNÇÃO e canal; telefone só no termo; suporte escrito: melhor esforço ou janela contratada.
  - Chamado: canal único e formulário: nível (escala 1 a 4: resposta em 15 minutos, 1 hora, 4 horas, 2 dias úteis), superfície, sintoma; sem dado de cidadão.
  - Plantão: quem recebe o alerta de F21-E06; segunda pessoa com acesso (CP-07) ou risco aceito por escrito.
  - Ensaio: nível 2 simulado em HML; alerta, aviso ao município (F21-E07) e tempos contra a escala.
- **O que NÃO deve ser implementado nesta etapa:** SLA contratual (F28-E05); plantão 24 horas; acesso assistido (CP-30).
- **Arquivos e módulos prováveis:** `dc360/docs/INDISPONIBILIDADE.md`, `dc360/docs/runbooks/`, `docs/evidencias-v2/CP-07/`.
- **Risco de segurança:** telefone pessoal ou segredo no repositório; segunda pessoa com acesso demais.
- **Impacto LGPD:** contato pessoal só no termo; chamado sem dado de titular; vazamento suspeito é nível 1.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: documentos.
- **Rollback:** reverter o commit.
- **Testes positivos:** o ensaio gera o alerta, o plantão reconhece, o aviso sai no prazo.
- **Testes negativos:** alerta sem reconhecimento em 15 minutos escala à segunda pessoa; contato em aberto reprova.
- **Testes de autorização e isolamento:** segunda pessoa só tem as contas da matriz de F01-E16; operador do console lê ocorrência: negado.
- **Regressão obrigatória:** `npm run test:console`, `npm run conferir:numeros`; G21.
- **E2E:** o ensaio de incidente em HML.
- **Validação humana:** Rafael conduz; o município confirma canal e horários.
- **Evidência a produzir:** `docs/evidencias-v2/G27/V2-F27-E02/`: tempos do ensaio, seção 6 sem dado pessoal.
- **Documentação a atualizar:** `dc360/docs/INDISPONIBILIDADE.md`.
- **Definition of Done:** seção 6 por função; plantão ensaiado; segunda pessoa com acesso ou aceite.
- **Checkpoint:** CP-07 (bloqueia plantão e suporte do piloto).

### V2-F27-E03 - Rollback e critérios de parada
- **Prioridade:** P0
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** crítico  |  **Paralelizável:** sim (com E02 e E04)
- **Objetivo:** definir com número e dono quando o piloto para e provar em HML que cada interruptor desliga só o que deve.
- **Problema que resolve:** sem critério escrito a parada vira discussão no incidente; sem interruptor ensaiado, desligar é deploy sob pressão.
- **Origem:** PR:Prompt-F27; DP:R2; REL:10.
- **Estado atual:** CRIAR (critérios, ensaio); MANTER (rollback de F01-E08).
- **Dependências de entrada:** E01.
- **O que deve ser implementado:**
  - Arquivos: `dc360/docs/PILOTO.md` (seção "Parada") e `dc360/docs/runbooks/parada-do-piloto.md` (a criar). PARADA IMEDIATA: dado visível a outro município ou órgão; item de fila ou vistoria perdido; `documento_divergente`; incidente nível 1 fora da escala; restore falho; pedido do município. PAUSA E REVISÃO: limites no termo.
  - Interruptores sem deploy: `canal_cidadao_habilitado` falso, desativar usuário (vigência), `PORTAL_ATIVO=nao`, `PUSH_ATIVO` fora, `ASSINATURA_PROVEDOR=desligado`, `CANAL_VIDEO_LIBERADO`, `CANAL_CHAT_LIBERADO`, `INTEGRACOES_ATIVAS`, `VLIBRAS_ATIVO` (F34-E02, F31-E03, F35-E12; F29 e F30 sem chave própria), suspensão com aviso (F20-E04); cada um ensaiado em HML.
  - Rollback: `dc360/docs/runbooks/rollback.md` ensaiado na tag do piloto; a parada devolve o município ao papel, oferece o pacote e não apaga nada.
- **O que NÃO deve ser implementado nesta etapa:** eliminar dado do piloto (F28-E10, CP-29); feature flag nova.
- **Arquivos e módulos prováveis:** `dc360/docs/PILOTO.md`, `dc360/docs/runbooks/parada-do-piloto.md`, `dc360/docs/runbooks/rollback.md`.
- **Risco de segurança:** parar tarde; interruptor que derruba mais do que devia.
- **Impacto LGPD:** a parada preserva trilha e dado; vazamento dispara a comunicação de 24 horas.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: documentos.
- **Rollback:** Não se aplica: a etapa define o rollback.
- **Testes positivos:** canal desligado responde "não habilitado"; conta desativada falha no pedido seguinte, fila do campo intacta.
- **Testes negativos:** `PORTAL_ATIVO=nao`: painel e campo seguem; suspender sem aviso e sem motivo `seguranca`: recusado.
- **Testes de autorização e isolamento:** coordenador desativa usuário: 403; só o administrador do município.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:console`, `npm run test:campo`; G20 e G21.
- **E2E:** ensaio de parada em HML por quem não escreveu.
- **Validação humana:** Rafael, Alyson e o município aprovam.
- **Evidência a produzir:** `docs/evidencias-v2/G27/V2-F27-E03/`: tempos de cada interruptor.
- **Documentação a atualizar:** `dc360/docs/PILOTO.md`.
- **Definition of Done:** gatilhos com número e dono; interruptores e rollback ensaiados.
- **Checkpoint:** Não.

### V2-F27-E04 - Métricas e coleta de feedback
- **Prioridade:** P1
- **Tamanho:** S  |  **Complexidade:** baixa  |  **Risco:** médio  |  **Paralelizável:** sim (com E02 e E03)
- **Objetivo:** ter, antes do primeiro uso, as métricas, o roteiro principal do agente (ALY:CA-09) e o feedback, sem dado pessoal.
- **Problema que resolve:** "sem assistência constante" não se mede sem definir roteiro, assistência e constante; telemetria com dado pessoal é proibida (F17-E16).
- **Origem:** ALY:CA-09; DP:K9; DP:K10.
- **Estado atual:** CRIAR (script, fichas); MANTER (`metricas_municipio`, `/saude`).
- **Dependências de entrada:** E01.
- **O que deve ser implementado:**
  - Arquivos: `dc360/docs/PILOTO.md` (seção "Métricas"): ROTEIRO PRINCIPAL do agente (baixar a lista, abrir a tarefa, preencher, GPS, cinco fotos, enviar, com sinal e em modo avião); ASSISTÊNCIA = intervenção de pessoa do projeto para destravar passo; CONSTANTE = mais de um pedido por execução em mais da metade delas.
  - Medidas: `metricas_municipio`, `/saude`, fila e erros (F21-E01, F21-E02), push e e-mail (F21-E03), encaminhamentos vencidos, relatos rejeitados, storage por relato e por vídeo, mensagens de chat, abrigos ativos (agregado), falhas por integração, ativação do MFA.
  - Fichas por agente (A1, A2, sem nome) e questionário de cinco perguntas por degrau; `dc360/scripts/metricas-do-piloto.mjs` (a criar) lê `console_situacao_dos_municipios` e `/saude`.
- **O que NÃO deve ser implementado nesta etapa:** telemetria com identificador de pessoa nos apps; BI; mudar código para medir.
- **Arquivos e módulos prováveis:** `dc360/docs/PILOTO.md`, `dc360/scripts/metricas-do-piloto.mjs`, `dc360/apps/console/src/consultas.ts`.
- **Risco de segurança:** métrica que identifica agente; ficha com nome.
- **Impacto LGPD:** só agregados e códigos de agente.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: só leitura.
- **Rollback:** remover o script.
- **Testes positivos:** o script gera em HML a tabela com os números de `metricas_municipio`.
- **Testes negativos:** sentinelas de nome e e-mail ausentes da saída; sem credencial, o script recusa.
- **Testes de autorização e isolamento:** o script lê só a visão `console_situacao_dos_municipios`; `SELECT` em `ocorrencias` com a credencial do console: negado.
- **Regressão obrigatória:** `npm run test:console`, `npm run test:scripts`; G21.
- **E2E:** Não se aplica: medição; o roteiro roda na E05.
- **Validação humana:** Alyson aprova o roteiro e o limite de "constante".
- **Evidência a produzir:** `docs/evidencias-v2/G27/V2-F27-E04/`: roteiro, limites, saída em HML.
- **Documentação a atualizar:** `dc360/docs/PILOTO.md`.
- **Definition of Done:** roteiro e limites escritos; script em HML sem dado pessoal.
- **Checkpoint:** Não.

### V2-F27-E05 - Operação do piloto (execução controlada)
- **Prioridade:** P0
- **Tamanho:** L  |  **Complexidade:** alta  |  **Risco:** crítico  |  **Paralelizável:** não (execução; depende de E02 a E04)
- **Objetivo:** operar o município piloto por degraus com critério de entrada e parada, mudando só o que for correção.
- **Problema que resolve:** primeiro uso real; sem degraus e ata o piloto escorre para produção por inércia.
- **Origem:** PR:Prompt-F27; ALY:CA-01 a CA-05; ALY:CA-07; ALY:CA-09.
- **Estado atual:** CRIAR (operação) sobre MANTER (o produto).
- **Dependências de entrada:** E02; E03; E04.
- **O que deve ser implementado:**
  - Degrau 1 (entrada: E01 a E04): um caso real por fluxo habilitado (A, B, I, J) e uma reabertura dentro de 30 dias; vistoria offline real por agente (CA-02); consulta e exportação na trilha (CA-07).
  - Degrau 2 (entrada: degrau 1 sem parada, com ata; CP-08, CP-09, CP-19, CP-22 decididos): portal; fluxos C, D e E reais (CA-04).
  - Degrau 3 (entrada: degrau 2 sem parada; CP-28, CP-11, CP-26 decididos): canal só nesse município; fluxos F, G e H.
  - Ata por degrau (métricas, incidentes, feedback); só correção com teste novo, HML e promoção (F01-E12); um restore ensaiado (F22-E06).
- **O que NÃO deve ser implementado nesta etapa:** funcionalidade nova; cobrança; segunda prefeitura; eliminação (F28-E10).
- **Arquivos e módulos prováveis:** `dc360/docs/PILOTO.md`, `docs/evidencias-v2/G27/`, `dc360/fly.toml`.
- **Risco de segurança:** dado real em degrau sem critério cumprido; correção sem teste.
- **Impacto LGPD:** dado real sob o termo; consulta nominal na trilha; evidência sem dado pessoal.
- **Migração necessária:** Não (só correção aditiva).
- **Compatibilidade:** correção compatível com os apps instalados.
- **Rollback:** interruptores e rollback da E03.
- **Testes positivos:** um caso real por fluxo habilitado; ata por degrau.
- **Testes negativos:** degrau sem ata não sobe; correção sem teste novo não é promovida.
- **Testes de autorização e isolamento:** antes de cada degrau, `npm run test:isolamento` e a sonda cruzada de HML verdes na tag.
- **Regressão obrigatória:** `npm run verificar`, `npm run test:isolamento`; gates anteriores.
- **E2E:** o uso real, um caso por fluxo.
- **Validação humana:** município, Alyson e Rafael nas atas.
- **Evidência a produzir:** `docs/evidencias-v2/G27/V2-F27-E05/`: atas, métricas, versões promovidas, restore.
- **Documentação a atualizar:** `dc360/docs/PILOTO.md`.
- **Definition of Done:** degraus com ata; um caso real por fluxo; zero funcionalidade nova.
- **Checkpoint:** Não.

### V2-F27-E06 - Incidentes e relatório do piloto; revalidar anti-abuso e cotas
- **Prioridade:** P0
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** não (depende de E05)
- **Objetivo:** fechar o piloto com relatório, post-mortem dos incidentes, revalidação de anti-abuso (CP-27) e de cotas (CP-13) e decisão formal de encerramento.
- **Problema que resolve:** cotas e anti-abuso (DP:T22, DP:T24) são hipótese até o piloto; sem relatório a candidata parte de memória.
- **Origem:** DP:K9; DP:K10; PR:Prompt-F27; ALY:CA-09.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E05; CP-27; CP-13.
- **O que deve ser implementado:**
  - Arquivos: `docs/evidencias-v2/G27/RELATORIO.md`: métricas contra meta; CA-01 a CA-10 (provado no piloto, em HML ou não); incidentes (ID, nível, tempos, causa, correção, teste novo); paradas; feedback; custo real; o que NÃO foi provado; recomendação.
  - CP-27: relatos rejeitados, spam por semana e contas bloqueadas decidem manter a base; atestação e CAPTCHA só com abuso observado, como backlog (F28-E12).
  - CP-13: custo de storage por relato, vídeo e vistoria (`GET /v1/armazenamento/uso`) contra as cotas (F06-E09); ajuste por município em configuração.
  - Encerramento: ata: renova por novo termo, ou encerra com pacote entregue e contas desativadas.
- **O que NÃO deve ser implementado nesta etapa:** atestação ou CAPTCHA (fora da V2); cota em código; eliminação (CP-29).
- **Arquivos e módulos prováveis:** `docs/evidencias-v2/G27/RELATORIO.md` (a criar), `dc360/docs/ARMAZENAMENTO.md`, `dc360/docs/PILOTO.md`.
- **Risco de segurança:** relatório que omite incidente; contas do piloto vivas após o termo.
- **Impacto LGPD:** relatório sem dado pessoal; dado do piloto retido até decisão do município.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: documento.
- **Rollback:** Não se aplica: documento.
- **Testes positivos:** `regras-de-conteudo.test.ts` aprova; todo incidente tem teste de regressão.
- **Testes negativos:** incidente nível 1 aberto reprova; relatório sem "não provado" reprova; conta ativa após a ata reprova.
- **Testes de autorização e isolamento:** Não se aplica: documento; os resultados de isolamento vêm da E05.
- **Regressão obrigatória:** `npm test --workspace @dc360/shared`, `npm run conferir:numeros`; gates anteriores.
- **E2E:** Não se aplica: documento.
- **Validação humana:** Rafael, Alyson e o município aprovam relatório e ata.
- **Evidência a produzir:** `docs/evidencias-v2/G27/V2-F27-E06/`: relatório, ata, decisões de CP-27 e CP-13.
- **Documentação a atualizar:** `dc360/docs/ARMAZENAMENTO.md`, `dc360/docs/PILOTO.md`.
- **Definition of Done:** relatório aprovado; CP-27 e CP-13 revalidados; ata de encerramento.
- **Checkpoint:** CP-27 (revalidar; nada na V2 depende) e CP-13 (cotas finais em produção).

### V2-F27-E07 - Degrau 4: incidentes, abrigos, logística e território no piloto
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** crítico  |  **Paralelizável:** não (depois do degrau 1 da E05)
- **Objetivo:** operar com dado real, sob o termo, incidentes, abrigos, logística humanitária e consulta territorial, com critério de entrada e de parada.
- **Problema que resolve:** abrigo guarda pessoa acolhida (dado pessoal, às vezes sensível, Lei 13.709/2018); sem degrau o módulo entra por inércia.
- **Origem:** PR:D-15; PR:D-16; PR:Prompt-F27.
- **Estado atual:** CRIAR (critérios e execução) sobre MANTER (F29 a F33).
- **Dependências de entrada:** E05; G29 a G33; CP-75.
- **O que deve ser implementado:**
  - Arquivos: `dc360/docs/PILOTO.md` (seção "Degrau 4"): entrada: degrau 1 sem parada, treinamento de quem lança ocupação e estoque, interruptor ensaiado (E03), ata. Parada: pessoa acolhida visível fora do município ou do papel; ocupação ou estoque perdido; divergência de contagem sem causa.
  - Operação: um incidente e um abrigo reais, ou exercício do município com dado real da estrutura; uma distribuição, a consulta por raio e a importação do acervo do município, conferidas por amostra.
- **O que NÃO deve ser implementado nesta etapa:** funcionalidade nova; integração real (E09); outro município.
- **Arquivos e módulos prováveis:** `dc360/docs/PILOTO.md`, `docs/evidencias-v2/G27/`, `dc360/fly.toml`.
- **Risco de segurança:** pessoa acolhida visível a quem não deve; módulo ligado sem critério.
- **Impacto LGPD:** dado de acolhido sob o termo, retenção decidida pelo município (CP-10), consulta nominal na trilha.
- **Migração necessária:** Não (só correção aditiva).
- **Compatibilidade:** módulo desligado por padrão até o degrau.
- **Rollback:** interruptor do módulo (E03).
- **Testes positivos:** ata do degrau; contagem do aparelho igual à do painel.
- **Testes negativos:** degrau sem ata não sobe; módulo ligado com o CP aberto responde desligado.
- **Testes de autorização e isolamento:** `npm run test:isolamento` verde antes do degrau; abrigo do piloto lido por outro município: 404.
- **Regressão obrigatória:** `npm run verificar`, `npm run test:isolamento`; G00 a G26 e G29 a G35.
- **E2E:** o uso real, um caso por módulo.
- **Validação humana:** município, Alyson e Rafael na ata.
- **Evidência a produzir:** `docs/evidencias-v2/G27/V2-F27-E07/`: ata, medidas.
- **Documentação a atualizar:** `dc360/docs/PILOTO.md`.
- **Definition of Done:** ata do município; zero parada sem causa.
- **Checkpoint:** CP-75 (módulos que o piloto usa; bloqueia os degraus 4 a 6).

### V2-F27-E08 - Degrau 5: canal ampliado (vídeo, chat, CPF) e idiomas no piloto
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** crítico  |  **Paralelizável:** não (depois do degrau 3 da E05)
- **Objetivo:** abrir vídeo, chat, CPF, login ampliado e os idiomas en e es, só nesse município, com checkpoints decididos e custo e moderação medidos.
- **Problema que resolve:** CPF obrigatório, vídeo e chat multiplicam o risco do canal (D-07); custo e moderação são hipótese até o uso real.
- **Origem:** PR:D-07; PR:D-12; DP:K9; DP:K12.
- **Estado atual:** CRIAR (critérios e execução) sobre MANTER (F34, F35).
- **Dependências de entrada:** E05 (degrau 3); G34; G35; CP-46; CP-47; CP-26.
- **O que deve ser implementado:**
  - Arquivos: `dc360/docs/PILOTO.md` (seção "Degrau 5"): entrada: degrau 3 sem parada, parecer do CPF, custo de vídeo aprovado, moderação com equipe e horário (CP-28). Parada: CPF visível em lista, log ou saída; vídeo hostil `ativo`; mensagem abusiva sem resposta no prazo.
  - Operação: relatos reais com CPF, vídeo e chat; idiomas en e es só se houver público; VLibras conforme CP-45.
  - Medidas: custo de armazenamento por vídeo contra a cota (F06-E09), tempo de moderação, acessos nominais ao CPF.
- **O que NÃO deve ser implementado nesta etapa:** anonimato e tempo real (fora da V2); atestação e CAPTCHA (CP-27); funcionalidade nova.
- **Arquivos e módulos prováveis:** `dc360/docs/PILOTO.md`, `docs/evidencias-v2/G27/`.
- **Risco de segurança:** CPF em log; fila de moderação sem leitor.
- **Impacto LGPD:** CPF só com a base legal do parecer; retenção própria (F05-E14).
- **Migração necessária:** Não.
- **Compatibilidade:** canal ampliado desligado por padrão.
- **Rollback:** interruptor da E03.
- **Testes positivos:** relato real com CPF e vídeo vira ocorrência.
- **Testes negativos:** sem o parecer do CPF, o canal em produção segue desligado; vídeo acima do limite: recusado.
- **Testes de autorização e isolamento:** `cpf-nao-vaza.test.ts` (F25-E17) verde na tag; cidadão lê vídeo de outro: 404.
- **Regressão obrigatória:** `npm run verificar`, `npm run test:cidadao`; G00 a G26 e G29 a G35.
- **E2E:** o uso real, um relato por tipo de anexo.
- **Validação humana:** município e Alyson leem a ata.
- **Evidência a produzir:** `docs/evidencias-v2/G27/V2-F27-E08/`: ata, medidas, custo.
- **Documentação a atualizar:** `dc360/docs/PILOTO.md`.
- **Definition of Done:** ata; custo e moderação medidos; zero CPF em saída.
- **Checkpoint:** CP-46 (bloqueia CPF real) e CP-47 (bloqueia vídeo em produção).

### V2-F27-E09 - Degrau 6: integrações reais, assinatura por provedor, suporte assistido e órgão externo
- **Prioridade:** P2
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** crítico  |  **Paralelizável:** não (depois da E07 e da E08)
- **Objetivo:** ligar no piloto, uma a uma, só as integrações e funções externas com credenciamento ou parecer, e manter desligado o resto, com registro.
- **Problema que resolve:** WhatsApp oficial, assinatura por provedor, suporte assistido e órgão externo multi-município dependem de contratação, credenciamento ou parecer (D-08, D-09, D-10, D-14).
- **Origem:** PR:D-08; PR:D-09; PR:D-10; PR:D-14; PR:Prompt-F27.
- **Estado atual:** CRIAR (critérios e execução) sobre MANTER (F09, F20, F31).
- **Dependências de entrada:** E05; G09; G20; G31; CP-76.
- **O que deve ser implementado:**
  - Arquivos: `dc360/docs/PILOTO.md` (seção "Degrau 6"): tabela por item (WhatsApp oficial, camada GIS, assinatura por provedor, suporte assistido, órgão externo em dois municípios): credencial ou parecer de entrada, quem liga, parada e estado.
  - Operação: cada item só liga com a decisão arquivada (CP-41 e CP-14, CP-30, CP-49, CP-51); o suporte entra por concessão a pedido do município.
  - Medidas: falhas e custo por integração, cota de assinatura consumida, leituras de suporte.
- **O que NÃO deve ser implementado nesta etapa:** S2ID, SEI e Defesa Civil Alerta sem credenciamento (ficam em sandbox); impersonation; contrato comercial.
- **Arquivos e módulos prováveis:** `dc360/docs/PILOTO.md`, `docs/evidencias-v2/G27/`.
- **Risco de segurança:** segredo de provedor mal guardado; função externa ligada sem decisão.
- **Impacto LGPD:** cada provedor é subprocessador com aviso de 30 dias (F28-E08).
- **Migração necessária:** Não.
- **Compatibilidade:** tudo desligado por padrão.
- **Rollback:** `ASSINATURA_PROVEDOR=desligado`, revogar a concessão, desativar o vínculo externo.
- **Testes positivos:** item ligado com decisão arquivada funciona; ata.
- **Testes negativos:** item sem decisão responde desligado; retorno de provedor sem assinatura: 401.
- **Testes de autorização e isolamento:** pessoa com vínculo em dois municípios: token de um por vez; suporte lê só o município que concedeu.
- **Regressão obrigatória:** `npm run verificar`, `npm run test:isolamento`; G00 a G26 e G29 a G35.
- **E2E:** o uso real, um caso por item ligado.
- **Validação humana:** município, Alyson e Rafael decidem item a item.
- **Evidência a produzir:** `docs/evidencias-v2/G27/V2-F27-E09/`: tabela de estados, atas.
- **Documentação a atualizar:** `dc360/docs/PILOTO.md`.
- **Definition of Done:** todo item com estado e decisão registrados.
- **Checkpoint:** CP-76 (credenciais e provedores que o piloto usa; bloqueia o degrau 6).

# GATE G27 - PILOTO ENCERRADO

Só passa se:
- [ ] V2-F27-E01 (P0) e CP-34: termo firmado com período, escopo por degrau, suporte, parada, métricas e destino dos dados; `PILOTO.md` com "piloto não é produção comercial"; CP-19 e CP-28 decididos, ou o que depende deles ficou desligado por escrito. Evidência: E01.
- [ ] Marca d'água: todo PDF emitido em PROD durante o piloto trouxe "DOCUMENTO DE VALIDAÇÃO" (`fly.toml:69` inalterado; amostra sem exceção); CP-14 aberto, ou decidido sem retirada. Evidência: E01 e E05.
- [ ] V2-F27-E02 (P0) e CP-07: plantão ensaiado em HML (tempos x escala), seção 6 de `INDISPONIBILIDADE.md` por função, segunda pessoa com acesso ou aceite escrito. Evidência: E02.
- [ ] V2-F27-E03 (P0): gatilhos de parada com número e dono; interruptores e rollback ensaiados em HML. Evidência: E03.
- [ ] V2-F27-E04 (P1): roteiro principal, ASSISTÊNCIA e CONSTANTE definidos; métricas coletadas sem dado pessoal. Evidência: E04.
- [ ] V2-F27-E05 (P0): cada degrau executado teve ata; um caso real por fluxo habilitado; CA-02 (vistoria offline real por agente) e CA-07 observados; um restore ensaiado; zero mudança fora de correção promovida. Evidência: E05.
- [ ] ALY:CA-09: agentes concluíram o roteiro principal sem assistência constante conforme o limite do termo (taxa registrada), ou o desvio está no relatório com plano. Evidência: E04 e E06.
- [ ] V2-F27-E07 (P1) e CP-75: degrau 4 só com o CP decidido e ata do degrau 1; um caso real por módulo ligado; zero pessoa acolhida visível fora do município ou do papel; módulo sem decisão ficou desligado por escrito. Evidência: E07.
- [ ] V2-F27-E08 (P1): degrau 5 só com CP-46, CP-47 e CP-26 decididos; custo por vídeo e moderação medidos; zero CPF em log, erro ou saída; sem decisão, o canal ampliado ficou desligado. Evidência: E08.
- [ ] V2-F27-E09 (P2) e CP-76: tabela de estados por integração, assinatura, suporte e órgão externo, cada um ligado só com a decisão arquivada; o resto desligado. Evidência: E09.
- [ ] V2-F27-E06 (P0): relatório aprovado por Rafael, Alyson e município; post-mortem de todo incidente nível 1 e 2 com teste de regressão; zero incidente nível 1 aberto; CP-27 e CP-13 revalidados com dado do piloto (ou "sem dado" registrado); ata de encerramento com o destino do piloto. Evidência: E06.
- [ ] Nenhuma parada imediata ocorreu sem ata de causa, correção e nova prova; superfícies com checkpoint aberto permaneceram desligadas.
- [ ] `npm run verificar` e `npm run test:isolamento` verdes na tag do piloto.
- [ ] nenhuma regressão: gates G00 a G26 e G29 a G35 continuam verdes (se um quebrar, ESTE gate volta a REPROVADO).
- [ ] documentação atualizada e evidências arquivadas em `docs/evidencias-v2/G27/`, sem dado de cidadão.

**Reabre se:** o piloto operar sem termo vigente ou virar produção comercial sem ata; documento sair do ambiente sem marca antes de CP-14; vazamento entre municípios ou órgãos; item de fila ou vistoria perdido; funcionalidade nova entrar fora de correção; canal do cidadão ligado sem CP-28; módulo novo, integração, assinatura por provedor ou suporte ligado sem a decisão do degrau.
**Este Gate libera:** F28 (candidata a produção). NÃO libera produção municipal.

# Fase 28: Candidata a produção

**Gate da fase:** G28 CANDIDATA A PRODUÇÃO | **Depende dos gates:** G27 (cumulativo na ordem de execução de `STATUS.md`: G00 a G27 e G29 a G35) | **Superfícies tocadas:** as cinco, `apps/api`, `db`, lojas, `docs/` (política, runbooks, anexos técnicos do contrato), `scripts/` | **Checkpoints da fase:** CP-11, CP-14, CP-29, CP-30, CP-32, CP-04, CP-31, CP-35 (e, pelas linhas de E02, E15 e E16, CP-06, CP-09, CP-10, CP-26, CP-46, CP-49, CP-51, CP-41, CP-45, CP-74)

G28 é o gate FINAL e o roadmap TERMINA em CANDIDATA a produção. A decisão de produção municipal (ligar um município em produção comercial) e o contrato comercial (preço, vigência, penalidades, foro) ficam FORA deste roadmap: G28 prova que a decisão pode ser tomada, não a toma.

A fase não constrói funcionalidade: CONSOLIDA. Cada etapa é uma CHECKLIST verificável em `docs/evidencias-v2/G28/V2-F28-Enn/CHECKLIST.md`, com as colunas item, origem (gate, etapa ou checkpoint), critério objetivo de aprovado, evidência, resultado e quem validou. Tudo é REEXECUTADO sobre uma única TAG CANDIDATA (`vX.Y.Z-rc.N`, F01-E07), fixada na E01: relatório antigo não vale, e commit novo em código invalida as linhas de código.

J1 a J13 chegam resolvidos (parecer arquivado) ou ACEITOS POR ESCRITO por quem tem competência; o roadmap não decide. Aceite por escrito mantém DESLIGADO em produção o que o checkpoint bloqueia. PRESERVA tudo o que os gates anteriores provaram. NÃO faz: item de `docs/roadmap-v2/21-fora-da-v2.md` (só revalida, E12), decisão de produção, cobrança. Arquivos citados e criados por fases anteriores só existem depois dessas etapas; esta fase só cria os que marca "a criar".

Ordem: E01 e E02 primeiro (E03, E07 e E08 dependem do jurídico; a E06 usa o parecer de CP-14 que a E02 consolida); E04, E05, E09, E10, E11, E14 e E15 em paralelo; E16 depois da E04 e da E09; E12 depois da E11; E13 por último (consolida todas).

## Etapas

### V2-F28-E01 - Consolidar segurança (pentest, SAST, SCA em zero)
- **Prioridade:** P0
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** não (fixa a tag das demais)
- **Objetivo:** fixar a tag candidata e provar sobre ela pentest remediado, SAST e SCA em zero, segredos e matrizes de acesso.
- **Problema que resolve:** pentest, SAST e SCA foram aprovados em gates diferentes; o código mudou desde o re-teste (BZ-F:P0-SEG).
- **Origem:** DP:T34; PR:D-04; BZ-F:P0-SEG.
- **Estado atual:** CRIAR (checklist); MANTER (F01, F25).
- **Dependências de entrada:** G27.
- **O que deve ser implementado:**
  - Tag: `vX.Y.Z-rc.N` (F01-E07); código congelado.
  - Pentest (F25-E12, E13; CP-33): zero achado crítico ou alto aberto; médio e baixo com dono e prazo ou aceite de Rafael; diff desde o pentest sem mudar autenticação, autorização ou arquivos (senão, re-teste, F25-E21).
  - SAST e SCA (F01-E05, F00-E19; CP-03): Semgrep sem finding fora de exceção com prazo; `npm run auditar` sai 0; `ACEITAS_NO_APLICATIVO` sem item vencido; SBOM, licenças e Trivy (F01-E19, F01-E20) sem crítico.
  - Segredos e acesso (F01-E04, F25-E03 a E09): gitleaks limpo; matriz papel x rota, tenant, órgão, cidadão, IDOR e rate limit reexecutados.
- **O que NÃO deve ser implementado nesta etapa:** novo pentest sem diff que o exija; corrigir achado novo (reabre F25); aceitar risco (E02).
- **Arquivos e módulos prováveis:** `docs/evidencias-v2/G28/V2-F28-E01/CHECKLIST.md` (a criar), `dc360/scripts/auditar.mjs`.
- **Risco de segurança:** relatório antigo tratado como atual; exceção vencida esquecida.
- **Impacto LGPD:** Não se aplica: a checklist não tem dado pessoal.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: verificação.
- **Rollback:** Não se aplica: sem mudança.
- **Testes positivos:** todas as linhas verdes na tag; relatórios do pentest e do re-teste arquivados.
- **Testes negativos:** commit de código depois da tag invalida as linhas; achado crítico aberto reprova.
- **Testes de autorização e isolamento:** usuário da Saúde lê encaminhamento da Obras: 404; `npm run test:isolamento` verde.
- **Regressão obrigatória:** `npm run verificar`, `npm run test:e2e:api`; gates anteriores.
- **E2E:** `npm run test:e2e` e `test:e2e:api` na tag.
- **Validação humana:** Rafael confere o re-teste com quem testou.
- **Evidência a produzir:** `docs/evidencias-v2/G28/V2-F28-E01/`: checklist, tag, saídas de `auditar`, SAST, gitleaks.
- **Documentação a atualizar:** `dc360/README.md`.
- **Definition of Done:** tag fixada; checklist sem linha vermelha; exceção com dono e prazo.
- **Checkpoint:** Não (CP-03 e CP-33 já decididos).

### V2-F28-E02 - Consolidar o jurídico: J1 a J13 resolvidos ou aceitos por escrito
- **Prioridade:** P0
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** crítico  |  **Paralelizável:** não (E03, E07, E08 usam o resultado)
- **Objetivo:** cada J1 a J13 resolvido por parecer ou aceito por escrito, com o que fica desligado.
- **Problema que resolve:** o roadmap implementa o mecanismo e não decide: base legal, termos, retenção, marca, eliminação e suporte dependem de pareceres.
- **Origem:** DP:J1 a J13; PR:D-06.
- **Estado atual:** CRIAR (tabela de consolidação).
- **Dependências de entrada:** E01.
- **O que deve ser implementado:**
  - Mapa: J1, J2, J3, J5 e J13: CP-11 e CP-46; J4: CP-10; J6: CP-09; J7: CP-06; J8: CP-14 e CP-41; J9: CP-32; J10: CP-30; J11: CP-26; J12: CP-29; pessoa global e órgão externo: CP-49 e CP-51.
  - Critério por linha: parecer arquivado (referência, data ISO, autor) ou aceite escrito (data ISO, quem aceita, o que fica bloqueado, quando reavaliar); risco do município só ele aceita.
  - Desligado sem parecer: J1 a J5 e J13: canal aberto, beta externo e CPF real; J8: marca mantida; J12: eliminação de município real; J9: declaração de conformidade; J10: acesso assistido; pessoa global e órgão externo reais.
- **O que NÃO deve ser implementado nesta etapa:** redigir parecer ou texto jurídico; decidir por J; liberar o que o checkpoint bloqueia.
- **Arquivos e módulos prováveis:** `docs/evidencias-v2/G28/V2-F28-E02/CHECKLIST.md` (a criar), `docs/evidencias-v2/CP-06/`.
- **Risco de segurança:** aceite de quem não tem competência; parecer sem referência.
- **Impacto LGPD:** sem dado pessoal no repositório.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: documento.
- **Rollback:** Não se aplica: documento.
- **Testes positivos:** 13 linhas com parecer ou aceite.
- **Testes negativos:** linha sem data ou autor, aceite sem a lista do desligado e risco do município aceito só por Rafael reprovam.
- **Testes de autorização e isolamento:** Não se aplica: documento.
- **Regressão obrigatória:** `npm test --workspace @dc360/shared`, `npm run conferir:numeros`; gates anteriores.
- **E2E:** Não se aplica: documento.
- **Validação humana:** jurídico e DPO (pareceres), município (J4, J12), Rafael e Alyson (aceites).
- **Evidência a produzir:** `docs/evidencias-v2/G28/V2-F28-E02/`: tabela J1 a J13 e referências.
- **Documentação a atualizar:** `dc360/docs/PRIVACIDADE.md`, `dc360/docs/PAPEIS_E_RESPONSABILIDADES.md`.
- **Definition of Done:** 13 linhas fechadas; lista do que fica desligado.
- **Checkpoint:** CP-11, CP-14, CP-29, CP-30, CP-32 (e os do mapa acima): o aberto fica desligado.

### V2-F28-E03 - LGPD ativa: política publicada, aceite, direitos do titular e retenção em operação
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** crítico  |  **Paralelizável:** sim (com E04 e E05)
- **Objetivo:** provar em operação política publicada, aceite, direitos do titular e retenção, e não só código existente.
- **Problema que resolve:** política redigida e não publicada, sem encarregado nem canal; os mecanismos de F05 só foram provados em HML (BZ-F:P0-LGPD).
- **Origem:** BZ-M:V2-TRV-01; BZ-M:V2-TRV-02; BZ-M:V2-TRV-03; BZ-F:P0-LGPD.
- **Estado atual:** CRIAR (checklist); MANTER (F05).
- **Dependências de entrada:** E02; CP-11.
- **O que deve ser implementado:**
  - Política (F05-E07; J2, J13): URL estável pública devolve a versão vigente; `dc360/docs/PRIVACIDADE.md` sem campo em aberto.
  - Aceite (F05-E06, F17-E14): versão vigente no primeiro uso; versão nova força novo aceite; revogação registrada.
  - Titular (F05-E08, E10, E14): um pedido de cada tipo (acesso, correção, anonimização) concluído em HML, inclusive a saída por titular com CPF, vídeo e mensagens; trilha sem o nome.
  - Retenção (F05-E09, E12; CP-10): jobs ativos com prazo aprovado e contagens, ou "padrão vazio" aceito por escrito.
  - Catálogo (G05, F19-E05): zero tabela sem classificação; agente sem dado do cidadão.
- **O que NÃO deve ser implementado nesta etapa:** texto da política (jurídico); prazo de retenção (município); mecanismo novo.
- **Arquivos e módulos prováveis:** `docs/evidencias-v2/G28/V2-F28-E03/CHECKLIST.md` (a criar), `dc360/docs/PRIVACIDADE.md`, `dc360/apps/api/src/privacidade/minimizacao.ts`, `dc360/db/test`.
- **Risco de segurança:** política divergente do código; nome do titular na trilha.
- **Impacto LGPD:** prova a conformidade técnica, não a jurídica (J1 a J5, J13).
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: verificação.
- **Rollback:** despublicar a versão nova.
- **Testes positivos:** política vigente publicada; aceite e revogação registrados; pedidos concluídos.
- **Testes negativos:** versão publicada diferente da do aceite reprova; tabela sem classificação reprova o catálogo.
- **Testes de autorização e isolamento:** titular lê pedido de outro titular: 404; coordenador de outro município vê a fila: 404.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`, `npm run test:cidadao`; G05 e G17.
- **E2E:** aceite e pedido de titular em HML na tag.
- **Validação humana:** DPO e jurídico leem a política; Rafael confere os pedidos.
- **Evidência a produzir:** `docs/evidencias-v2/G28/V2-F28-E03/`: URL e hash da política, aceites, pedidos.
- **Documentação a atualizar:** `dc360/docs/PRIVACIDADE.md`, `dc360/docs/SUBPROCESSADORES.md`.
- **Definition of Done:** política publicada; aceite, titular e retenção provados.
- **Checkpoint:** CP-11 (bloqueia abertura pública e beta externo).

### V2-F28-E04 - Acessibilidade e DR consolidados com relatório
- **Prioridade:** P1
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com E05 e E09)
- **Objetivo:** um relatório único de acessibilidade e de recuperação de desastre, reexecutado na tag candidata.
- **Problema que resolve:** G22 e G23 foram aprovados antes das últimas mudanças; restore antigo não vale depois de migration de papel, policy ou grant.
- **Origem:** DP:T29; DP:T32; ALY:CA-08; BZ-F:P1-CONT.
- **Estado atual:** CRIAR (checklist); MANTER (G22 e G23).
- **Dependências de entrada:** G23; G22; E01 (tag).
- **O que deve ser implementado:**
  - Acessibilidade (F23-E01 a E13): axe sem violação grave nas superfícies web (três idiomas, PWA, VLibras, tema, módulos novos); VoiceOver, TalkBack, fonte a 200% e toque nos apps; "conforme" só com CP-32; PDF tagged conforme CP-15.
  - DR (F22-E01 a E07; CP-31, CP-37): restore da base na tag em máquina limpa, com PostGIS e vídeo, login e pacote conferidos, posterior à última migration de papel, policy ou grant; RPO e RTO medidos contra o aprovado (ajusta-se a promessa, nunca o relatório).
- **O que NÃO deve ser implementado nesta etapa:** conformidade legal (CP-32); teste com pessoas (F23-E05); promessa de RPO e RTO (E05).
- **Arquivos e módulos prováveis:** `docs/evidencias-v2/G28/V2-F28-E04/CHECKLIST.md` (a criar), `dc360/apps/web/test/acessibilidade.test.ts`.
- **Risco de segurança:** relatório de restore de versão antiga; "conforme" sem parecer.
- **Impacto LGPD:** Não se aplica: o restore usa dado sintético de HML.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: verificação.
- **Rollback:** Não se aplica: sem mudança.
- **Testes positivos:** axe e portões verdes na tag; restore completo dentro do aprovado.
- **Testes negativos:** restore anterior à última migration de papel, policy ou grant reprova; violação grave de axe reprova.
- **Testes de autorização e isolamento:** no restaurado, conta de Serra Alta lê recurso de Vale Fundo: 404.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:scripts`, `npm run test:campo`; G22, G23.
- **E2E:** login e pacote no banco restaurado; leitor de tela no fluxo principal.
- **Validação humana:** Rafael confere os tempos; Alyson, o leitor de tela.
- **Evidência a produzir:** `docs/evidencias-v2/G28/V2-F28-E04/`: relatório de acessibilidade, log do restore.
- **Documentação a atualizar:** `dc360/docs/COLOCAR-DE-PE.md`.
- **Definition of Done:** dois relatórios na tag; restore posterior à última migration.
- **Checkpoint:** Não (CP-31, CP-32 e CP-37 vêm de G22 e G23).

### V2-F28-E05 - Observabilidade, SLA e suporte
- **Prioridade:** P1
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** sim (com E04 e E09)
- **Objetivo:** provar que o alerta chega a quem lê e publicar o nível de serviço só com números medidos.
- **Problema que resolve:** nada mede disponibilidade hoje e `INDISPONIBILIDADE.md` diz "melhor esforço" sem plantão; prometer sem medir é risco contratual.
- **Origem:** DP:R7; DP:K15; DP:T33; ALY:RNF-01; ALY:RNF-06.
- **Estado atual:** CRIAR (`NIVEL-DE-SERVICO.md`); MANTER (G21).
- **Dependências de entrada:** G21; E01 (tag).
- **O que deve ser implementado:**
  - Observabilidade (F21-E01 a E06, mais tracing e SLO; F07-E12 e E13): erro centralizado com destino aprovado (CP-06); `/saude` por serviço; alerta de fila, push e e-mail; ensaio na tag: parar o worker em HML gera alerta reconhecido, com tempo registrado.
  - `dc360/docs/NIVEL-DE-SERVICO.md` (a criar): disponibilidade, RPO e RTO (CP-31, CP-37), escala de gravidade, horário; cada número aponta o relatório que o mede, senão "não medido".
  - Suporte (CP-07): segunda pessoa com acesso, seção 6 por função, runbook de incidente (F21-E07); tempos do piloto (F27-E06) contra a escala.
- **O que NÃO deve ser implementado nesta etapa:** preço, penalidade e vigência (contrato, fora do roadmap); plantão 24 horas; página de status.
- **Arquivos e módulos prováveis:** `docs/evidencias-v2/G28/V2-F28-E05/CHECKLIST.md` (a criar), `dc360/docs/NIVEL-DE-SERVICO.md` (a criar).
- **Risco de segurança:** número prometido sem medição; alerta sem leitor.
- **Impacto LGPD:** Não se aplica: sem dado pessoal.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: documento.
- **Rollback:** Não se aplica: documento.
- **Testes positivos:** ensaio de alerta reconhecido no tempo da escala; todo número do documento com relatório.
- **Testes negativos:** número sem medição reprova; alerta sem reconhecimento em 15 minutos escala à segunda pessoa.
- **Testes de autorização e isolamento:** operador do console lê ocorrência: negado; `/saude` não expõe dado de município.
- **Regressão obrigatória:** `npm run test:console`, `npm run test:api`, `npm run conferir:numeros`; G21 e G22.
- **E2E:** ensaio de incidente em HML.
- **Validação humana:** Rafael e Alyson revisam cada número.
- **Evidência a produzir:** `docs/evidencias-v2/G28/V2-F28-E05/`: ensaio com tempos, tabela número x relatório.
- **Documentação a atualizar:** `dc360/docs/NIVEL-DE-SERVICO.md`, `dc360/docs/INDISPONIBILIDADE.md`.
- **Definition of Done:** alerta ensaiado na tag; documento com números medidos; suporte por função.
- **Checkpoint:** CP-31 (RPO, RTO e disponibilidade; bloqueia o SLA e o plano).

### V2-F28-E06 - Documentos: marca d'água e aprovação conforme o parecer
- **Prioridade:** P0
- **Tamanho:** S  |  **Complexidade:** alta  |  **Risco:** crítico  |  **Paralelizável:** sim (com E03)
- **Objetivo:** cumprir a decisão de CP-14 sobre marca d'água e nomenclatura e provar que o produto a obedece.
- **Problema que resolve:** `MARCA_DAGUA` (`fly.toml:69`) é global: apagá-la desmarca todo município; chamar o mecanismo de assinatura sem parecer é risco jurídico (BZ-N:N.10).
- **Origem:** DP:K16; DP:J8; BZ-N:N.10; PR:D-06.
- **Estado atual:** CRIAR (checklist); MANTER (G09).
- **Dependências de entrada:** G09; E02.
- **O que deve ser implementado:**
  - Decisão: CP-14 registrada (parecer ou aceite escrito): competência, dupla aprovação, nomenclatura, marca.
  - Sem parecer: marca mantida (`fly.toml:69` inalterado); o mecanismo se chama APROVAÇÃO AUTENTICADA em tela, PDF e `docs/`.
  - Com parecer: `documento_vale` e `parecer_referencia` por política de tipo (F09-E14); só então `MARCA_DAGUA` vazia em PROD; documento novo sem marca; os emitidos seguem marcados e valem por substituição (F09-E09).
  - Imutabilidade (G09): `laudo-de-amanha-igual-ao-de-hoje.test.ts` verde; zero `documento_divergente` no piloto; QR (CP-16) e PDF tagged (CP-15) como decidido.
- **O que NÃO deve ser implementado nesta etapa:** assinatura por provedor sem CP-41 e J8; decidir o parecer; retirar a marca sem a condição.
- **Arquivos e módulos prováveis:** `docs/evidencias-v2/G28/V2-F28-E06/CHECKLIST.md` (a criar), `dc360/fly.toml`, `dc360/apps/api/src/config.ts`, `dc360/apps/api/src/documentos`.
- **Risco de segurança:** documento sem marca antes da hora; nomenclatura sem parecer.
- **Impacto LGPD:** Não se aplica: sem dado novo.
- **Migração necessária:** Não.
- **Compatibilidade:** padrão atual preservado: tudo marcado.
- **Rollback:** religar `MARCA_DAGUA`; desligar `documento_vale`.
- **Testes positivos:** com parecer, documento novo sem marca e v1 intacta; sem parecer, todo PDF marcado.
- **Testes negativos:** variável vazia sem `documento_vale` e aprovação: marcado; "assinado" ou "assinatura" como nome do mecanismo: zero ocorrências.
- **Testes de autorização e isolamento:** operador liga `documento_vale`: 403; município liberado não desmarca o outro.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:isolamento`, `npm test --workspace @dc360/shared`; G09.
- **E2E:** `npm run test:e2e:api`: emitir com e sem a condição.
- **Validação humana:** município e Alyson: texto; jurídico: nomenclatura.
- **Evidência a produzir:** `docs/evidencias-v2/G28/V2-F28-E06/`: referência do parecer ou aceite, PDFs com e sem marca, sha256.
- **Documentação a atualizar:** `dc360/docs/COLOCAR-DE-PE.md`, `dc360/docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** decisão registrada; produção coerente com ela; nomenclatura limpa.
- **Checkpoint:** CP-14 (bloqueia retirar a marca d'água e chamar o mecanismo de assinatura).

### V2-F28-E07 - Lojas: fichas, rótulos de privacidade, contas e política
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com E08)
- **Objetivo:** deixar os dois apps prontos para as lojas públicas, aprovados na revisão com a liberação retida.
- **Problema que resolve:** `eas.json` tem campos Apple "PREENCHER" e falta domínio; rótulo falso derruba o app; o cidadão exige política em URL estável.
- **Origem:** BZ-M:V2-CID-11; DP:R5; BZ-F:P1-OPER.
- **Estado atual:** EXPANDIR (`LOJAS.md`, `DECLARACAO-NAS-LOJAS.md`, `eas.json`).
- **Dependências de entrada:** E03; CP-04.
- **O que deve ser implementado:**
  - Contas: Apple e Google na entidade de CP-04, organização verificada; bundle ids definitivos; `eas.json` sem "PREENCHER"; builds de produção (F14-E11, F17-E17) com hashes.
  - Fichas: texto em pt-BR, en e es, capturas sintéticas, faixa etária, URL da política (E03), aviso de 190, 192 e 193.
  - Rótulos: preenchidos de `dc360/docs/DECLARACAO-NAS-LOJAS.md` atualizada com câmera, vídeo, CPF, chat e login social ou gov.br; `npm run test:scripts` (âncoras) verde.
  - Revisão: conta de município de demonstração (`LOJAS.md`); aprovado com liberação retida (NÃO CONFIRMADO: liberação manual na Apple, publicação gerenciada no Google).
- **O que NÃO deve ser implementado nesta etapa:** liberar ao público (decisão de produção, fora do roadmap); ligar o canal sem CP-28.
- **Arquivos e módulos prováveis:** `docs/evidencias-v2/G28/V2-F28-E07/CHECKLIST.md` (a criar), `dc360/apps/campo/eas.json`, `dc360/docs/DECLARACAO-NAS-LOJAS.md`.
- **Risco de segurança:** rótulo que declara menos do que o app coleta; bundle id errado.
- **Impacto LGPD:** rótulos e política iguais ao que o app coleta.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: ficha nova.
- **Rollback:** retirar a versão da revisão.
- **Testes positivos:** `ancoras-da-declaracao.test.mjs` verde; build de produção instala e abre; revisão aprovada.
- **Testes negativos:** rótulo sem âncora reprova; build com URL de HML reprova; sem conta de revisão a loja recusa.
- **Testes de autorização e isolamento:** conta de revisão lê outro município: 404.
- **Regressão obrigatória:** `npm run test:scripts`, `npm run test:campo`, `npm run test:cidadao`; G14 e G17.
- **E2E:** instalar o build de produção em Android e iPhone físicos; fluxo principal.
- **Validação humana:** Rafael e Alyson nas fichas; jurídico nos rótulos.
- **Evidência a produzir:** `docs/evidencias-v2/G28/V2-F28-E07/`: ids e hashes dos builds, rótulos, resultado da revisão.
- **Documentação a atualizar:** `dc360/apps/campo/LOJAS.md`, `dc360/docs/DECLARACAO-NAS-LOJAS.md`.
- **Definition of Done:** dois apps aprovados com liberação retida; rótulos com âncora.
- **Checkpoint:** CP-04 (bloqueia a submissão).

### V2-F28-E08 - Subprocessadores e contrato
- **Prioridade:** P1
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com E07)
- **Objetivo:** fechar a lista nominal de subprocessadores e os anexos técnicos do contrato, revisados pelo jurídico; o contrato comercial fica fora.
- **Problema que resolve:** `SUBPROCESSADORES.md` (versão 3, lista de 2026-09-09) tem campos de decisão abertos; a V2 acrescenta e-mail, erro, cópia de storage, scanner e worker (DP:J7).
- **Origem:** DP:J7; DP:J10; REL:08.
- **Estado atual:** EXPANDIR (`SUBPROCESSADORES.md`).
- **Dependências de entrada:** E02.
- **O que deve ser implementado:**
  - Lista: cada provedor com o dado que alcança e a região (inclusive assinatura, SMS, WhatsApp, VLibras, destino de tracing e login social); todo destino de rede de saída em `apps/*/src` e toda variável de provedor (`S3_*`, `APNS_*`, `NOTIFICADOR_URL`) tem linha.
  - Aviso de 30 dias aos municípios por subprocessador novo desde 2026-09-09; transferência internacional revista pelo jurídico (CP-06).
  - Anexos: lista; cláusula de operador (seção 3) com os campos de decisão preenchidos; responsabilidades (`PAPEIS_E_RESPONSABILIDADES.md`, ADR 0018); nível de serviço (E05); término e devolução (CA-10, CP-29); incidente em 24 horas.
- **O que NÃO deve ser implementado nesta etapa:** preço, vigência, penalidade e foro (contrato comercial, fora do roadmap); provedor novo; texto jurídico próprio.
- **Arquivos e módulos prováveis:** `docs/evidencias-v2/G28/V2-F28-E08/CHECKLIST.md` (a criar), `dc360/docs/SUBPROCESSADORES.md`.
- **Risco de segurança:** provedor ativo fora da lista; aviso de 30 dias esquecido.
- **Impacto LGPD:** a lista é a base do aviso ao município (controlador) e dos rótulos das lojas.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: documento.
- **Rollback:** reverter o commit.
- **Testes positivos:** cada destino de saída e variável de provedor com linha; anexos revisados.
- **Testes negativos:** provedor sem linha reprova; campo de decisão em aberto na cláusula reprova; subprocessador ligado sem o aviso reprova.
- **Testes de autorização e isolamento:** Não se aplica: documento.
- **Regressão obrigatória:** `npm run test:scripts` (`variaveis-de-ambiente.test.mjs`), `npm run conferir:numeros`; gates anteriores.
- **E2E:** Não se aplica: documento.
- **Validação humana:** jurídico revisa os anexos; Rafael confere a lista contra o código; o município recebe o aviso.
- **Evidência a produzir:** `docs/evidencias-v2/G28/V2-F28-E08/`: lista com data ISO, anexos, comprovante do aviso.
- **Documentação a atualizar:** `dc360/docs/SUBPROCESSADORES.md`.
- **Definition of Done:** lista sem lacuna; anexos revisados; aviso enviado.
- **Checkpoint:** Não.

### V2-F28-E09 - Runbooks e treinamento
- **Prioridade:** P1
- **Tamanho:** S  |  **Complexidade:** baixa  |  **Risco:** médio  |  **Paralelizável:** sim (com E04, E05 e E10)
- **Objetivo:** todo runbook executado por quem não o escreveu, e o treinamento por papel conferido na tag.
- **Problema que resolve:** a pasta de runbooks nasceu na V2; restore, eliminação e provisionamento só existiam narrados (REL:10).
- **Origem:** REL:10; DP:K15; BZ-F:P1-CONT.
- **Estado atual:** CRIAR (checklist); MANTER (runbooks de F01-E16, F21-E07, F22-E04, F27-E03).
- **Dependências de entrada:** G21; G22.
- **O que deve ser implementado:**
  - Runbooks (`dc360/docs/runbooks/`): deploy, rollback, migração, rotação de segredo e de `CPF_CHAVE`, acesso, incidente, restore, parada do piloto, provisionamento, eliminação, exportação, e-mail e push, habilitar canal (CP-28), moderação de vídeo e chat, suporte assistido, falha de integração, pedido de titular.
  - Critério: cada um executado em HML na tag por quem não o escreveu; falha registrada, corrigida e reexecutada.
  - Treinamento: `GUIA-DO-COORDENADOR.md`, `CARTAO-DO-AGENTE.md` e guias do portal e da triagem com cada passo executado na tag; prova prática por papel.
- **O que NÃO deve ser implementado nesta etapa:** runbook de item fora da V2; novo treinamento de município (F27 treinou o piloto).
- **Arquivos e módulos prováveis:** `docs/evidencias-v2/G28/V2-F28-E09/CHECKLIST.md` (a criar), `dc360/docs/runbooks/`, `dc360/docs/GUIA-DO-COORDENADOR.md`, `dc360/docs/CARTAO-DO-AGENTE.md`.
- **Risco de segurança:** runbook que só o autor executa; guia que afirma o que o app não faz.
- **Impacto LGPD:** Não se aplica: documentos sem dado pessoal.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: documentos.
- **Rollback:** reverter o commit.
- **Testes positivos:** todos os runbooks executados por outra pessoa; guias iguais ao comportamento da tag.
- **Testes negativos:** passo que falha reprova até corrigir e reexecutar; guia com função inexistente reprova.
- **Testes de autorização e isolamento:** a segunda pessoa executa só com as contas da matriz de F01-E16: dado de município: negado.
- **Regressão obrigatória:** `npm run conferir:numeros`, `npm run test:scripts`; G01, G21 e G22.
- **E2E:** execução em HML de cada runbook e prova prática por papel.
- **Validação humana:** Rafael e a segunda pessoa; o coordenador do município na prova.
- **Evidência a produzir:** `docs/evidencias-v2/G28/V2-F28-E09/`: tabela runbook x executor x data ISO.
- **Documentação a atualizar:** os runbooks e os guias.
- **Definition of Done:** todos os runbooks e guias executados na tag por quem não os escreveu.
- **Checkpoint:** Não.

### V2-F28-E10 - Exportação e eliminação provadas em produção com município de ensaio
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** crítica  |  **Risco:** crítico  |  **Paralelizável:** não (irreversível; após G27 e CP-29)
- **Objetivo:** o município do piloto confere a própria exportação e a eliminação é provada em PROD, sem destruir dado real sem pedido.
- **Problema que resolve:** só houve prova com dado sintético; eliminar município real é irreversível (ALY:CA-10).
- **Origem:** ALY:CA-10; PR:Fluxos K, L; DP:J12.
- **Estado atual:** MANTER (`saida/pacote.ts`, `eliminacao/relogio.ts`); CRIAR (checklist).
- **Dependências de entrada:** G05; G27; E02 (CP-29).
- **O que deve ser implementado:**
  - K: o administrador do piloto baixa `POST /v1/saida/pacote.zip` em PROD; índice, manifesto e `SOMAS-SHA256.txt` conferidos; hash dos PDFs igual ao emitido; ata do município de que entende o formato.
  - L: eliminação em PROD de município de ensaio (o de demonstração das lojas, com arquivo, vídeo e dado dos módulos novos de teste): três fases do relógio, storage purgado, livro com contagens, zero órfão; a pessoa com vínculo em outro município segue viva (`apps/api/src/armazenamento/cli.ts`); a do piloto só por pedido escrito, depois do K e com CP-29 decidido.
- **O que NÃO deve ser implementado nesta etapa:** eliminar o piloto sem pedido escrito; arquivar o pacote real; reabrir CP-29.
- **Arquivos e módulos prováveis:** `docs/evidencias-v2/G28/V2-F28-E10/CHECKLIST.md` (a criar), `dc360/apps/api/src/saida/pacote.ts`, `dc360/apps/api/src/eliminacao/relogio.ts`.
- **Risco de segurança:** apagar município errado ou dado do piloto sem pedido.
- **Impacto LGPD:** o pacote é dado real: vai ao município, nunca ao repositório.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: verificação.
- **Rollback:** cancelar a eliminação em 7 dias.
- **Testes positivos:** pacote conferido pelo município; município de ensaio eliminado com purga completa.
- **Testes negativos:** eliminar com nome errado: recusado; suspender município agendado: recusado; `senha_hash` ou `token_hash` no pacote reprova.
- **Testes de autorização e isolamento:** administrador de outro município baixa o pacote do piloto: 404; coordenador: negado.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`, `npm run test:console`; G05, G20 e G26.
- **E2E:** K e L em PROD, pelo roteiro de F26-E06.
- **Validação humana:** o município confere o pacote; Rafael acompanha o ensaio.
- **Evidência a produzir:** `docs/evidencias-v2/G28/V2-F28-E10/`: contagens, SHA-256, livro, ata.
- **Documentação a atualizar:** `dc360/docs/SAIDA-DE-MUNICIPIO.md`.
- **Definition of Done:** município conferiu; ensaio concluído; piloto só por pedido escrito.
- **Checkpoint:** Não (usa CP-29 decidido na E02).

### V2-F28-E11 - Retirar o espelho legado do /v1 e fechar dívidas da V2
- **Prioridade:** P1
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (medir antes de remover)
- **Objetivo:** desligar o espelho sem prefixo da API e fechar as dívidas da V2, cada uma com destino.
- **Problema que resolve:** o espelho existe por compatibilidade e só sai com uso medido; `PENDENCIAS.md` e `skip` acumulam dívida sem dono.
- **Origem:** DP:T35; BZ-F:P2; BZ-F:P1-OPER.
- **Estado atual:** CORRIGIR (espelho); MANTER (`/v1`).
- **Dependências de entrada:** F02-E08.
- **O que deve ser implementado:**
  - Passo 1: contador de F02-E08 em zero por rota e `X-App-Version`; versão mínima de cada app (F02-E06) acima da última que usa o espelho; `ESPELHO_LEGADO_ENCERRADO=sim` em HML e depois em PROD (426 com `Link` para `/v1`). Passo 2, em release posterior: apagar o espelho e ajustar `versao-v1.test.ts`.
  - Dívidas: `PENDENCIAS.md` de `db`, `apps/api`, `apps/web`, `apps/campo`, `apps/portal`, `apps/cidadao` e as PROPOSTAS dos gates: cada item vira fechado, backlog com dono ou fora da V2; zero `skip` sem data e dono.
- **O que NÃO deve ser implementado nesta etapa:** `/v2`; remover antes de a medição zerar; itens de `docs/roadmap-v2/21-fora-da-v2.md`.
- **Arquivos e módulos prováveis:** `dc360/apps/api/src/servidor.ts`, `dc360/apps/api/src/config.ts`, `dc360/apps/api/test/versao-v1.test.ts`, `dc360/docs/POLITICA-DE-VERSOES-DA-API.md`.
- **Risco de segurança:** app antigo em campo perde acesso; remoção antes da medição.
- **Impacto LGPD:** Não se aplica: sem dado novo.
- **Migração necessária:** Não.
- **Compatibilidade:** só app abaixo da versão mínima recebe 426.
- **Rollback:** `ESPELHO_LEGADO_ENCERRADO=nao` enquanto o código existir.
- **Testes positivos:** chave ligada: legado responde 426 e `/v1` segue 200.
- **Testes negativos:** espelho com uso medido não é encerrado; app abaixo da versão mínima vê a tela de atualização, fila intacta.
- **Testes de autorização e isolamento:** o 426 vem antes da autenticação, igual para todo município; token de B contra recurso de A em `/v1`: 404.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:campo`, `npm run test:console`, `npm run test:e2e:api`; G02.
- **E2E:** painel, campo e console em HML só em `/v1`.
- **Validação humana:** Rafael aprova a data com o contador à vista.
- **Evidência a produzir:** `docs/evidencias-v2/G28/V2-F28-E11/`: contador, versões mínimas, dívidas com destino.
- **Documentação a atualizar:** `dc360/docs/POLITICA-DE-VERSOES-DA-API.md`, os `PENDENCIAS.md`.
- **Definition of Done:** espelho encerrado em PROD; toda dívida com destino.
- **Checkpoint:** Não.

### V2-F28-E12 - Revalidar itens fora da V2 e registrar backlog
- **Prioridade:** P2
- **Tamanho:** S  |  **Complexidade:** baixa  |  **Risco:** baixo  |  **Paralelizável:** não (depende de E11)
- **Objetivo:** revalidar com dado do piloto cada item que `docs/roadmap-v2/21-fora-da-v2.md` ainda lista depois da revisão de escopo de 2026-10-01 e registrar o backlog, sem implementar nada.
- **Problema que resolve:** item adiado sem gatilho medido reaparece escondido; a revisão trouxe para a V2 vídeo, SMS, idiomas, tema, PostGIS e integrações, e o que restou fora precisa de gatilho.
- **Origem:** DP:K8; DP:K12; DP:K19; DP:K20; PR:D-20.
- **Estado atual:** CRIAR (backlog).
- **Dependências de entrada:** E11.
- **O que deve ser implementado:**
  - Arquivos: `docs/evidencias-v2/G28/V2-F28-E12/BACKLOG.md`: para cada item que o arquivo `21` ainda lista, gatilho, dado do piloto (ou "sem dado"), decisão (manter fora ou promover, com custo e justificativa) e dono.
  - Gatilhos: relato anônimo (abandono no login), atestação e CAPTCHA (spam, CP-27), Redis (cotas insuficientes), tempo real do chat (volume de mensagens), Libras em vídeo, tema por secretaria e tema editável (pedido real), impersonation completa (CP-30), ambiente dedicado (cliente pagante).
  - `dc360/docs/BACKLOG-POS-V2.md` (a criar): itens promovidos e dívidas de E11.
- **O que NÃO deve ser implementado nesta etapa:** qualquer item da lista; promover sem CP-35.
- **Arquivos e módulos prováveis:** `docs/evidencias-v2/G28/V2-F28-E12/BACKLOG.md` (a criar), `dc360/docs/BACKLOG-POS-V2.md` (a criar), `docs/roadmap-v2/21-fora-da-v2.md`.
- **Risco de segurança:** item promovido sem custo; gatilho já disparado e esquecido.
- **Impacto LGPD:** Não se aplica: só métricas agregadas.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: documento.
- **Rollback:** reverter o commit.
- **Testes positivos:** toda linha de `21` com gatilho e decisão; promovidos com custo e justificativa.
- **Testes negativos:** item promovido sem custo reprova; linha sem gatilho reprova; item da lista em "O que deve ser implementado" de etapa reprova.
- **Testes de autorização e isolamento:** Não se aplica: documento.
- **Regressão obrigatória:** `npm test --workspace @dc360/shared`, `npm run conferir:numeros`; G00 a G27 e G29 a G35.
- **E2E:** Não se aplica: documento.
- **Validação humana:** Rafael e Alyson decidem em CP-35.
- **Evidência a produzir:** `docs/evidencias-v2/G28/V2-F28-E12/`: backlog com decisões.
- **Documentação a atualizar:** `docs/roadmap-v2/21-fora-da-v2.md` (coluna de decisão).
- **Definition of Done:** backlog decidido; nenhum item implementado.
- **Checkpoint:** CP-35 (revalidação; bloqueia nada, é backlog).

### V2-F28-E13 - Relatório final da candidata a produção e retrospectiva do roadmap
- **Prioridade:** P0
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (consolida E01 a E12)
- **Objetivo:** consolidar um relatório final verificável: gates, checkpoints, pendências, dívidas, tamanho previsto x realizado e o que a decisão de produção ainda precisa.
- **Problema que resolve:** o estado de 36 gates (G00 a G35) e de todos os checkpoints está espalhado em `GATE.md` e `decisao.md`; sem relatório único a decisão parte de memória.
- **Origem:** PR:Prompt-F28; DP:R1; PR:D-04.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E01 a E12; E14 a E16.
- **O que deve ser implementado:**
  - Arquivos: `docs/evidencias-v2/G28/RELATORIO-FINAL.md` (a criar): cada afirmação cita o `GATE.md` ou o `decisao.md` que a sustenta; nada é decidido.
  - Todo gate de G00 a G35, menos este, e todo checkpoint de `18-checkpoints.md`: aprovado, reaberto (motivo e etapa), decidido, adiado ou bloqueado, com data ISO e o que travou.
  - Pendências conhecidas; dívidas aceitas (`docs/roadmap-v2/21-fora-da-v2.md`, backlog de F28-E12); tamanho previsto x realizado por onda (insumo de CP-36 e da próxima versão).
  - O que a decisão de produção municipal, FORA do roadmap, ainda precisa: contrato, SLA, pareceres e o que segue desligado.
- **O que NÃO deve ser implementado nesta etapa:** decidir produção, checkpoint ou parecer; editar `GATE.md` de outra etapa; reabrir gate (só registra).
- **Arquivos e módulos prováveis:** `docs/evidencias-v2/G28/RELATORIO-FINAL.md` (a criar), `docs/evidencias-v2/G28/GATE.md`, `docs/evidencias-v2/CP-36/`.
- **Risco de segurança:** afirmação sem fonte; relatório que esconde gate reaberto.
- **Impacto LGPD:** Não se aplica: sem dado pessoal.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: documento.
- **Rollback:** reverter o commit.
- **Testes positivos:** os 35 gates e todos os checkpoints têm uma linha cada, com fonte.
- **Testes negativos:** gate ou checkpoint sem linha reprova; "aprovado" sem `GATE.md` reprova.
- **Testes de autorização e isolamento:** Não se aplica: documento sem dado de município.
- **Regressão obrigatória:** `npm test --workspace @dc360/shared`, `npm run conferir:numeros`; gates anteriores.
- **E2E:** Não se aplica: documento.
- **Validação humana:** Rafael e Alyson conferem dez afirmações.
- **Evidência a produzir:** `docs/evidencias-v2/G28/V2-F28-E13/`: relatório, tabelas gate x fonte e checkpoint x decisão.
- **Documentação a atualizar:** `docs/ROADMAP-V2.md` (estado final).
- **Definition of Done:** 35 gates e todos os checkpoints, cada um com fonte; lista do que a produção ainda precisa; nada decidido.
- **Checkpoint:** Não.

### V2-F28-E14 - Reexecutar na tag os módulos novos (incidentes, abrigos, logística, território, configuração, canal ampliado, idiomas)
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com E04, E05 e E09)
- **Objetivo:** provar na tag candidata que os módulos das fases F29 a F35 seguem verdes, isolados e provados em aparelho depois das últimas mudanças.
- **Problema que resolve:** esses gates foram aprovados antes do piloto; uma migration de papel, policy ou grant depois deles pode tê-los quebrado.
- **Origem:** PR:D-15; PR:D-16; PR:D-07; PR:D-12; BZ-F:P0-INT.
- **Estado atual:** CRIAR (checklist); MANTER (G29 a G35, F25-E20, F26-E08 a E10).
- **Dependências de entrada:** G29 a G35; E01 (tag).
- **O que deve ser implementado:**
  - Checklist: `docs/evidencias-v2/G28/V2-F28-E14/CHECKLIST.md` (a criar): por fase (F29-E18, F30-E18, F31-E20, F32-E16, F33-E16, F34-E20, F35-E14), os testes de gate reexecutados na tag; manifesto de tabelas (G05) sem tabela sem classificação; migrations aplicadas em banco limpo com PostGIS.
  - Provas: varredura de IDOR (F25-E20) e cruzamento de tenant (F25-E04) na tag; os cenários 6 a 8 da POC (F26-E08 a E10) em HML na tag; `rotas-axe.json` (F23-E13) sem rota nova fora.
  - Idiomas e tema: três idiomas e cinco temas de município (F23-E11, F23-E12) varridos na tag.
- **O que NÃO deve ser implementado nesta etapa:** funcionalidade nova; corrigir (reabre a fase de origem); liberar o que um checkpoint bloqueia.
- **Arquivos e módulos prováveis:** `docs/evidencias-v2/G28/V2-F28-E14/CHECKLIST.md` (a criar), `dc360/db/test/isolamento.test.ts`.
- **Risco de segurança:** gate antigo tratado como atual; módulo novo fora da varredura.
- **Impacto LGPD:** Não se aplica: dado sintético.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: verificação.
- **Rollback:** Não se aplica: sem mudança.
- **Testes positivos:** todas as linhas verdes na tag; migrations aplicam em banco limpo.
- **Testes negativos:** commit de código depois da tag invalida as linhas; gate de F29 a F35 vermelho reprova.
- **Testes de autorização e isolamento:** coordenador de Vale Fundo lê incidente, abrigo e estoque de Serra Alta: 404; `npm run test:isolamento` verde.
- **Regressão obrigatória:** `npm run verificar`, `npm run test:isolamento`; G00 a G27 e G29 a G35.
- **E2E:** `npm run test:e2e:api` e `npm run test:e2e:portal` na tag.
- **Validação humana:** Rafael e Alyson conferem uma linha por fase.
- **Evidência a produzir:** `docs/evidencias-v2/G28/V2-F28-E14/`: checklist, saídas.
- **Documentação a atualizar:** `dc360/README.md`.
- **Definition of Done:** sete fases reexecutadas na tag sem linha vermelha.
- **Checkpoint:** Não.

### V2-F28-E15 - Integrações e provedores externos: estado em produção
- **Prioridade:** P1
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** sim (com E04, E05 e E14)
- **Objetivo:** registrar, por integração e provedor, se está ligada, em sandbox ou desligada em produção, com o credenciamento ou parecer que a liga.
- **Problema que resolve:** integração sem API pública ou credenciamento não se promete; o roadmap implementa adaptador e sandbox, e ligar é decisão humana (D-14).
- **Origem:** PR:D-14; PR:D-09; PR:D-07; DP:T34.
- **Estado atual:** CRIAR (checklist); MANTER (F31, F09, F34).
- **Dependências de entrada:** G31; E02; E08; E01 (tag).
- **O que deve ser implementado:**
  - Tabela: WhatsApp oficial, SMS, login gov.br, social, provedor de assinatura, S2ID, SEI, Defesa Civil Alerta, Cemaden (a confirmar), camadas GIS, VLibras, destino de tracing, e-mail, push, armazenamento e vídeo: tipo (API pública ou credenciamento), estado em produção, decisão (CP ou parecer arquivado), responsável, segredo rotacionado, linha em `SUBPROCESSADORES.md`.
  - Regra: sem credenciamento, a integração sai desligada e a interface não a oferece; sandbox nunca em PROD (`ASSINATURA_PROVEDOR=memoria` recusado).
  - Prova: `apps/api/test/saidas-externas.test.ts` (F25-E16) verde na tag e falha de cada integração ensaiada em HML.
- **O que NÃO deve ser implementado nesta etapa:** credenciar; contratar; promessa de integração sem API validada; integração fora da lista (21-fora-da-v2).
- **Arquivos e módulos prováveis:** `docs/evidencias-v2/G28/V2-F28-E15/CHECKLIST.md` (a criar), `dc360/docs/SUBPROCESSADORES.md`, `dc360/apps/api/src/config.ts`.
- **Risco de segurança:** segredo de sandbox em produção; integração ligada sem decisão.
- **Impacto LGPD:** cada provedor com dado, região e aviso de 30 dias.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: documento e verificação.
- **Rollback:** desligar a integração pela configuração.
- **Testes positivos:** toda linha com estado e decisão; falha de cada integração não derruba a API.
- **Testes negativos:** integração ligada sem decisão, sandbox em PROD e provedor sem linha em `SUBPROCESSADORES.md` reprovam.
- **Testes de autorização e isolamento:** conector de um município não lê camada de outro: 404.
- **Regressão obrigatória:** `npm run test:scripts` (`variaveis-de-ambiente.test.mjs`), `npm run test:api`; G09, G31.
- **E2E:** falha injetada de cada integração em HML.
- **Validação humana:** Rafael confere a tabela contra o código.
- **Evidência a produzir:** `docs/evidencias-v2/G28/V2-F28-E15/`: tabela, saídas.
- **Documentação a atualizar:** `dc360/docs/SUBPROCESSADORES.md`.
- **Definition of Done:** toda integração com estado e decisão; nenhuma ligada sem credenciamento.
- **Checkpoint:** CP-41 e CP-76 (o aberto fica desligado).

### V2-F28-E16 - Rotinas recorrentes entregues à operação
- **Prioridade:** P1
- **Tamanho:** S  |  **Complexidade:** baixa  |  **Risco:** médio  |  **Paralelizável:** não (depende de E01, E04 e E09)
- **Objetivo:** entregar à operação, com dono e data, o que o roadmap provou uma vez: pentest, exercício de DR, restore, SBOM e licenças, rotação de chaves.
- **Problema que resolve:** prova que não se repete envelhece; D-19 trouxe essas rotinas para a V2 e elas precisam de dono antes da decisão de produção.
- **Origem:** PR:D-19; DP:T34; DP:T32; REL:10.
- **Estado atual:** CRIAR (calendário e checklist); MANTER (F01-E19, F22, F25-E21).
- **Dependências de entrada:** E01; E04; E09; CP-74.
- **O que deve ser implementado:**
  - Arquivos: `dc360/docs/ROTINAS-RECORRENTES.md` (a criar): por rotina, gatilho, dono, data ISO da próxima e evidência: pentest anual e a cada mudança relevante (F25-E21); exercício anual de DR de ponta a ponta e restore trimestral (F22); SBOM e licenças por release (F01-E19); rotação de `CPF_CHAVE`, `CPF_HASH_CHAVE` e segredos de provedor (`scripts/rotacionar-segredo.mjs`); revisão de acessos da segunda pessoa (CP-07); reexecução da POC a cada release maior.
  - Checklist: `docs/evidencias-v2/G28/V2-F28-E16/CHECKLIST.md`: cada rotina ensaiada uma vez na tag (a rotação de chave em HML) e com data futura.
- **O que NÃO deve ser implementado nesta etapa:** contratar fornecedor (CP-33); agendador novo; promessa contratual de frequência.
- **Arquivos e módulos prováveis:** `dc360/docs/ROTINAS-RECORRENTES.md` e `docs/evidencias-v2/G28/V2-F28-E16/CHECKLIST.md` (a criar), `dc360/scripts/rotacionar-segredo.mjs`.
- **Risco de segurança:** rotina sem dono; chave nunca rotacionada.
- **Impacto LGPD:** Não se aplica: sem dado pessoal.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: documento.
- **Rollback:** reverter o commit.
- **Testes positivos:** toda rotina com dono, data futura e evidência da última execução.
- **Testes negativos:** rotina sem dono reprova; data vencida reprova; rotação de chave que perde dado antigo reprova.
- **Testes de autorização e isolamento:** a rotação e o restore ensaiados em HML não alcançam outro município: 404.
- **Regressão obrigatória:** `npm run test:scripts`, `npm run conferir:numeros`; G22, G25.
- **E2E:** rotação de `CPF_CHAVE` em HML com leitura de dado antigo.
- **Validação humana:** Rafael confirma dono e data de cada linha.
- **Evidência a produzir:** `docs/evidencias-v2/G28/V2-F28-E16/`: calendário, ensaio da rotação.
- **Documentação a atualizar:** `dc360/docs/ROTINAS-RECORRENTES.md`.
- **Definition of Done:** calendário com dono e data; rotação ensaiada.
- **Checkpoint:** CP-74 (dono e orçamento; bloqueia só a promessa de recorrência).

# GATE G28 - CANDIDATA A PRODUÇÃO

Só passa se:
- [ ] Tag candidata única (`vX.Y.Z-rc.N`) registrada; todo item de código reexecutado nela e nenhum commit de código posterior. Evidência: V2-F28-E01.
- [ ] V2-F28-E01 (P0): pentest e re-teste sem achado crítico ou alto aberto; `npm run auditar` sai 0 e SAST limpo sem exceção vencida; gitleaks limpo; SBOM, licenças e Trivy sem crítico; matrizes de acesso, tenant, órgão, cidadão e IDOR verdes na tag. Evidência: E01.
- [ ] V2-F28-E02 (P0): J1 a J13 com parecer arquivado ou aceite escrito (data ISO, quem aceita, o que fica bloqueado) e lista do que permanece DESLIGADO em produção; CP-11, CP-14, CP-29, CP-30 e CP-32 (e CP-06, CP-09, CP-10, CP-26, CP-46, CP-49, CP-51) decididos ou aceitos. Evidência: E02.
- [ ] V2-F28-E03 (P0): política publicada em URL estável com encarregado e canal; aceite, revogação, pedido de titular (com CPF, vídeo e mensagens) e retenção provados; zero tabela sem classificação. Evidência: E03.
- [ ] V2-F28-E04 (P1): relatórios de acessibilidade (três idiomas, PWA, VLibras, tema, módulos novos) e de DR (com PostGIS e vídeo) na tag; restore posterior à última migration de papel, policy ou grant; RPO e RTO medidos contra CP-31 e CP-37. Evidência: E04.
- [ ] V2-F28-E05 (P1): alerta ensaiado e reconhecido, tracing e SLO por rota crítica medidos e duas máquinas por serviço; `NIVEL-DE-SERVICO.md` com cada número ligado a um relatório (ou "não medido"); CP-31 decidido. Evidência: E05.
- [ ] V2-F28-E06 (P0): decisão de CP-14 cumprida; marca d'água mantida ou retirada pela condição técnica; "assinatura" nunca como nome do mecanismo; documentos imutáveis na tag; assinatura por provedor só com CP-41 e J8. Evidência: E06.
- [ ] V2-F28-E07 (P0): contas, fichas, rótulos com âncora e builds de produção dos dois apps aprovados na revisão, com liberação retida; CP-04 decidido. Evidência: E07.
- [ ] V2-F28-E08 (P1): lista de subprocessadores (inclusive os novos) sem lacuna e anexos técnicos do contrato revisados; o contrato comercial fica fora. Evidência: E08.
- [ ] V2-F28-E09 (P1): runbooks e guias executados na tag por quem não os escreveu. Evidência: E09.
- [ ] V2-F28-E10 (P0): exportação conferida pelo município real; eliminação provada em PROD com município de ensaio (vídeos e tabelas dos módulos novos purgados; pessoa com vínculo em outro município preservada); a do piloto só por pedido escrito e com CP-29 decidido. Evidência: E10.
- [ ] V2-F28-E11 (P1): espelho legado encerrado em PROD com a medição zerada; dívidas com destino; zero `skip` sem data e dono. Evidência: E11.
- [ ] V2-F28-E12 (P2): backlog dos itens fora da V2 decidido em CP-35; nenhum implementado. Evidência: E12.
- [ ] V2-F28-E14 (P0): gates G29 a G35 reexecutados na tag (isolamento, IDOR, cenários 6 a 8 da POC, três idiomas e cinco temas), migrations em banco limpo com PostGIS, nenhum commit de código depois da tag. Evidência: E14.
- [ ] V2-F28-E15 (P1): toda integração e provedor com estado em produção (ligado, sandbox ou desligado) e a decisão que o liga; nenhuma ligada sem credenciamento; sandbox recusado em PROD. Evidência: E15.
- [ ] V2-F28-E16 (P1) e CP-74: calendário de rotinas (pentest anual e por mudança relevante, exercício anual de DR, restore trimestral, SBOM e licenças, rotação de chaves) com dono e data ISO e a rotação de chave ensaiada. Evidência: E16.
- [ ] V2-F28-E13 (P0): `docs/evidencias-v2/G28/RELATORIO-FINAL.md` com os gates G00 a G35 (menos G28) e todos os checkpoints, cada linha apontando o `GATE.md` ou o `decisao.md`; pendências, dívidas aceitas, tamanho previsto x realizado e o que a decisão de produção ainda precisa; nenhuma decisão tomada. Evidência: E13.
- [ ] `docs/evidencias-v2/G28/GATE.md` aponta para esse relatório e traz o que permanece desligado em produção, o que NÃO foi provado e a frase de limite: o roadmap termina em CANDIDATA a produção; a decisão de produção municipal e o contrato comercial ficam fora dele.
- [ ] `npm run verificar`, `npm run test:isolamento`, `npm run test:e2e` e `npm run test:e2e:api` verdes na tag candidata.
- [ ] nenhuma regressão: gates G00 a G27 e G29 a G35 continuam verdes (se um quebrar, ESTE gate volta a REPROVADO).
- [ ] documentação atualizada e evidências arquivadas em `docs/evidencias-v2/G28/`.

**Reabre se:** commit de código entrar depois da tag sem reexecução; parecer ou aceite for revogado; achado de segurança alto ou crítico novo; política publicada divergir do código; documento sair sem marca contra o CP-14; um gate de G00 a G27 ou de G29 a G35 reprovar; integração ligada sem credenciamento.
**Este Gate libera:** a DECISÃO de produção municipal e o contrato comercial, que ficam FORA deste roadmap e só se tomam depois dele. NÃO liga produção, NÃO abre o canal ao público e NÃO publica os apps.
