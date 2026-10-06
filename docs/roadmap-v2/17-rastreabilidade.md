# Matriz de rastreabilidade do Roadmap V2

Esta matriz prova que nada da auditoria, do Decision Pack, das decisões do pedido, do documento do Alyson e das decisões de 2026-10-01 (D-07 a D-29) ficou sem destino. Ela cobre as 36 fases (F00 a F35) e as 617 etapas do roadmap, conferidas por busca nos arquivos 03 a 16 e 22 a 27. Cada linha leva ORIGEM, ID, DESCRIÇÃO, FASE, ETAPA, GATE, CHECKPOINT e EVIDÊNCIA ESPERADA.

## Como ler

- **Prefixos de origem.** Os identificadores dos documentos colidem em prefixo (AUT-01 do Alyson e AUT-05 da Matriz D; DOC-01 e DOC-11; D1 a D13 com significados diferentes). Por isso: `ALY:` é o documento do Alyson (as lacunas L1 a L16 também usam `ALY`); `REL` são as lacunas L17 a L26, vindas dos relatórios do Baseline; `BZ-D:` é a Matriz D do Baseline; `BZ-F` é o gap da seção F, com ID de rastreio estável `GAP-...` (P0S, P0I, P0L, P1O, P1P, P1C, P2, DEF), na ordem em que aparece em `docs/AUDITORIA-V2-BASELINE-ZERO.md`; `BZ-M` são os requisitos novos da V2; `BZ-N` as divergências; `DP:` o Decision Pack; `PR:` as decisões do pedido e as de 2026-10-01 (D-07 a D-29); `FV2` é um item numerado de `21-fora-da-v2.md`; `CP-NOVO` é um checkpoint novo com nome provisório.
- **Casos especiais nas colunas FASE e ETAPA.** `fora da V2` aponta um item de `21-fora-da-v2.md` que continua fora depois de PR:D-07 a PR:D-29. `dívida aceita` aponta a dívida declarada. `decisão pendente` deixou de ser usado: CP-40 foi decidido por PR:D-20 e as lacunas L1 a L26 têm etapa. `processo (sem etapa)` marca regra de trabalho sem etapa de código (PR:D-28 e PR:D-29).
- **Gates e fases.** Quando uma linha lista vários gates ou fases, o item passa a valer no primeiro e é reconfirmado nos seguintes.
- **Itens duplicados.** O Baseline repete achados em vários relatórios (a vigência aparece cinco vezes entre os P0 de segurança). Cada repetição tem linha própria, marcada como duplicata, apontando para a mesma etapa.
- **Cobertura.** O fim do arquivo (Parte 4 e a seção "Verificação de cobertura") lista a contagem de linhas por origem, o que continua fora por decisão e o que tem cobertura parcial, para que nada fique escondido. Checkpoints decididos (CP-01, CP-02, CP-18, CP-23, CP-40) continuam citados na coluna CHECKPOINT; a decisão está na evidência.


## Parte 1. Decisões, checkpoints e superfícies

Evidência esperada usa o padrão de `19-definicao-de-pronto.md`: `docs/evidencias-v2/Gnn/V2-Fnn-Enn/` para etapas, `docs/evidencias-v2/Gnn/GATE.md` para o gate e `docs/evidencias-v2/CP-nn/decisao.md` para checkpoints. Em checkpoint novo, a evidência é `docs/evidencias-v2/CP-NOVO-<assunto>/decisao.md` até a numeração.

### 1.1 Decision Pack: decisões técnicas T01 a T43 e T28a

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DP | T01 | Identidade com pessoa global: uma conta da pessoa, vínculo por município e órgão, cidadão em realm separado (PR:D-08 emenda T01 e T05) | F03, F20 | V2-F03-E01, V2-F03-E02, V2-F03-E04, V2-F03-E05, V2-F03-E15, V2-F03-E16, V2-F20-E18 | G03, G20 | CP-49 | ADR 0009 de pessoa global; migrations de pessoa e vínculo; test:isolamento e cruzamento F03-E18 verdes |
| DP | T02 | Cidadão com realm, audiência `dc360-cidadao` e tabelas próprias | F15 | E01 a E07 | G15 | CP-25 | ADR 0015; teste de plateia; RLS do cidadão e negativos |
| DP | T03 | Usuário de secretaria: papel genérico `usuario_orgao`, `orgao_vinculos`, audiência do portal, MFA | F03 | E04, E05, E07, E11 | G03 | CP-08 | testes de vínculo, de audiência e de MFA obrigatório |
| DP | T04 | E-mail único entre pessoas ativas e convite de uso único, para pessoa nova ou já existente | F03 | V2-F03-E09, V2-F03-E10 | G03 | CP-05 | índice parcial em pessoas; convite real em HML |
| DP | T05 | Pessoa em várias secretarias e vários municípios, troca de município e órgão externo no catálogo (PR:D-08 revoga o item 1 de 21-fora-da-v2) | F03, F10, F11, F12 | V2-F03-E05, V2-F03-E15, V2-F03-E16, V2-F03-E17, V2-F03-E18, V2-F10-E02, V2-F10-E03, V2-F11-E23, V2-F11-E24, V2-F11-E25, V2-F11-E29, V2-F12-E08 | G03, G10, G11, G12 | CP-51, CP-51 | cruzamento F03-E18 e F11-E25: pessoa em A e B nunca lê A com token de B |
| DP | T06 | JWT enxuto (sub é a pessoa, org é o município ativo, sid, aud, exp); papel e vínculo relidos do banco | F03 | V2-F03-E02 | G03 | - | teste de que papel no token não é autoridade |
| DP | T07 | Isolamento intra-município híbrido: dossiê, RLS por órgão fail-closed, manifesto, arquivos por chave | F03, F04 | F03-E06; F04-E01, E04, E05, E09 | G04 | CP-09 | teste Obras x Saúde; catálogo por órgão |
| DP | T08 | Rota nova nunca nasce aberta: ator exigido, manifesto, default deny, matriz | F03, F04, F25 | F03-E12, E13, E14; F04-E08; F25-E03 | G03 | - | manifesto; matriz papel x rota como teste fixo |
| DP | T09 | Vigência na escrita e em toda requisição, com códigos de erro distintos | F00, F03, F07 | F00-E04 a E07; F03-E03; F07-E08 | G00 | - | sonda de conta desativada; testes sem skip |
| DP | T10 | Competência por destino explícito, categorias de demanda e competência do órgão por COBRADE e território como sugestão e validação (PR:D-18) | F04, F10, F11, F32 | V2-F04-E02, V2-F04-E15, V2-F10-E17, V2-F10-E19, V2-F11-E28, V2-F32-E10 | G04, G10, G11, G32 | CP-20, CP-53 | sugestão de destino por competência testada; sem competência cadastrada a lista é vazia |
| DP | T11 | Secretaria devolve só antes do aceite e sugere destino; a Defesa Civil reencaminha (PR:D-23) | F04, F10, F11 | V2-F04-E17, V2-F10-E05, V2-F11-E15 | G04, G10, G11 | - | E2E do fluxo D; devolução depois do aceite recusada em teste |
| DP | T12 | Escalonamento em percentual do prazo, cobrança, escalonamento ao gestor do órgão e cadeia acima dele por município (PR:D-18) | F04, F10, F11, F12 | V2-F04-E10, V2-F04-E16, V2-F10-E06, V2-F10-E18, V2-F11-E12, V2-F11-E17, V2-F11-E28, V2-F12-E03 | G04, G10, G11, G12 | CP-21, CP-53 | relógio de lembretes testado; cadeia por município; eventos append-only |
| DP | T13 | Sete estados do encaminhamento e eventos | F04, F11 | F04-E03; F11-E09, E14 | G04 | - | máquina de estados testada |
| DP | T14 | Reinspeção como nova rodada de vistoria; encerrada reabre por 30 dias com motivo e depois só ocorrência vinculada (PR:D-21) | F13 | V2-F13-E01 a V2-F13-E11 | G13 | CP-23 | E2E do fluxo E; reabertura testada dentro e fora do prazo; documento emitido intacto |
| DP | T15 | Portal como aplicação separada `apps/portal` | F11 | E01 a E03 | G11 | - | ADR 0014; deploy HML próprio |
| DP | T16 | Pacote `design-tokens` como fonte única | F08 | E01 a E03, E06 | G08 | - | paridade das superfícies |
| DP | T17 | Identidade visual: DC360 com nome, logotipo e cor de destaque do município, contraste AA validado (PR:D-11) | F08, F11, F35 | V2-F08-E07, V2-F08-E10, V2-F08-E11, V2-F11-E07, V2-F35-E02 a V2-F35-E08 | G08, G11, G35 | CP-95 | guia visual; cor reprovada no contraste recusada na gravação; portal com nome do município |
| DP | T18 | Login do cidadão por e-mail com código de uso único, mais gov.br, SMS e login social por interface de provedores (PR:D-07) | F15, F17, F34 | V2-F15-E04, V2-F15-E05, V2-F15-E14, V2-F15-E18, V2-F17-E04, V2-F34-E12 a V2-F34-E17 | G15, G17, G34 | CP-04, CP-19, CP-91, CP-92, CP-93 | OTP real em HML; vínculo seguro testado; provedor real só com credencial |
| DP | T19 | CPF do cidadão passa a ser coletado e obrigatório no relato identificado, cifrado e mascarado; reverte T19 (PR:D-07) | F05, F15, F16, F17, F18, F25, F34 | V2-F05-E13, V2-F05-E14, V2-F15-E02, V2-F15-E16, V2-F16-E16, V2-F17-E20, V2-F18-E13, V2-F25-E17, V2-F34-E14 | G05, G15, G16, G17, G18, G25, G34 | CP-46 | CPF cifrado, com hash e máscara testados; CPF real só após o parecer |
| DP | T20 | Município do relato resolvido no servidor (IBGE, polígono no PostGIS, candidatos na divisa) | F15, F16, F17, F32 | V2-F15-E13, V2-F16-E05, V2-F17-E06, V2-F32-E03 | G15, G16, G17, G32 | CP-28, CP-85 | testes de divisa; opt-in por município; malha por função privilegiada |
| DP | T21 | Estados e protocolos do relato; ocorrência só na conversão | F16, F17, F18 | F16-E01 a E04, E10; F17-E09 a E12; F18 | G16 | - | testes de estados e de protocolo; fluxos F e G |
| DP | T22 | Anti-abuso mínimo: conta verificada, limites em duas camadas, bloqueio manual, moderação humana | F15 | E09, E10, E11 | G15 | CP-26, CP-27 | testes de cota; bloqueio com efeito imediato |
| DP | T23 | Modelo de anexos: `arquivos`, vínculos, promoção, `incluir_no_laudo` | F06 | E01, E02, E09, E12; F11-E13 | G06 | CP-13 | foto avulsa não entra em laudo (teste) |
| DP | T24 | Tipos e limites de arquivo, com vídeo do cidadão de até 30 s e 50 MB, um por relato (PR:D-07) | F06, F07, F17, F34 | V2-F06-E05, V2-F06-E06, V2-F06-E18 a V2-F06-E20, V2-F07-E10, V2-F07-E11, V2-F17-E07, V2-F34-E03, V2-F34-E04 | G06, G07, G17, G34 | CP-12, CP-13, CP-47 | suíte de limites e de tipos; vídeo hostil recusado; cota por classe |
| DP | T25 | Cadeia segura de upload: quarentena, verificação, normalização, ativo, inclusive vídeo transcodificado em worker isolado | F06, F07, F24, F25 | V2-F06-E03 a V2-F06-E10, V2-F06-E16, V2-F06-E18 a V2-F06-E23, V2-F07-E04, V2-F07-E10, V2-F24-E04, V2-F24-E10, V2-F25-E07, V2-F25-E08, V2-F25-E18 | G06, G07, G24, G25 | - | suíte de arquivos maliciosos em worker; vídeo hostil recusado |
| DP | T26 | Documento emitido imutável (PDF, snapshot, hash, versão do template) | F09 | E01 a E05, E09 a E11, E13 | G09 | CP-16 | teste de reimpressão idêntica |
| DP | T27 | Aprovação autenticada, com assinatura avançada por provedor externo atrás de interface plugável (PR:D-09) | F09, F10 | V2-F09-E06, V2-F09-E07, V2-F09-E08, V2-F09-E19 a V2-F09-E28, V2-F10-E32, V2-F10-E35 | G09, G10 | CP-14, CP-41 | aprovação com MFA, hash e versão; provedor em memória e sandbox |
| DP | T28 | O que compartilhar entre agente e cidadão (tokens, esquemas neutros, cliente de API) | F08, F17 | F08-E05; F17-E03 | G08 | - | subpaths do shared; binário do cidadão sem permissões |
| DP | T28a | Packages só com dois consumidores reais (`design-tokens`, `cliente-api`, `upload-core`) | F08, F17 | F08-E01, E04; F17-E03 | G08 | - | lista de consumidores por package |
| DP | T29 | Acessibilidade: WCAG 2.2 AA, leitor de tela em aparelho, validação humana | F08, F10, F11, F14, F17, F23 | F08-E06; F10-E11; F11-E21; F14-E10; F17-E15; F23 | G23 | CP-32 | relatório de conformidade; axe no CI |
| DP | T30 | Três ambientes: DEV, HML sintético e PROD | F01 | E09 a E13 | G01 | CP-04, CP-05 | HML de pé; migração ensaiada |
| DP | T31 | E-mail, push multiaplicativo, SMS no login do cidadão e WhatsApp oficial por adaptador (PR:D-07, PR:D-14) | F11, F14, F15, F17, F31, F34 | V2-F11-E17, V2-F14-E05, V2-F15-E14, V2-F17-E13, V2-F31-E07 a V2-F31-E10, V2-F34-E15 | G11, G14, G15, G17, G31, G34 | CP-04, CP-19, CP-92, CP-78 | e-mail e push reais em HML; SMS e WhatsApp só com provedor contratado |
| DP | T32 | Backup e restore com RPO e RTO de referência | F22 | E01 a E07 | G22 | CP-31, CP-37 | relatório de restore com tempos medidos |
| DP | T33 | Observabilidade mínima P0 e P1, mais tracing distribuído com OpenTelemetry e SLO por rota crítica (PR:D-13) | F01, F21 | V2-F01-E14, V2-F21-E01 a V2-F21-E14 | G01, G21 | CP-06, CP-07, CP-60 | erro centralizado; alerta que alguém lê; trace e SLO sem dado pessoal |
| DP | T34 | SDLC: PR, CI, secretos, SAST, dependências, release, DAST, pentest, mais lint, SBOM, licenças e scan de contêiner (PR:D-19) | F01, F25 | V2-F01-E01 a V2-F01-E08, V2-F01-E17 a V2-F01-E20, V2-F25-E01, V2-F25-E10, V2-F25-E12, V2-F25-E21 | G01, G25 | CP-03, CP-33, CP-43, CP-74 | master protegida; CI com os portões; SBOM por release |
| DP | T35 | API `/v1`, OpenAPI, idempotência, versão mínima | F02, F14, F28 | F02; F14-E08; F28-E11 | G02 | - | teste de contrato cliente x rota no CI |
| DP | T36 | PostGIS entra: extensão, ponto geográfico, malha, áreas, imóvel e busca por raio; reverte T36 (PR:D-16) | F01, F16, F32 | V2-F01-E21, V2-F01-E22, V2-F16-E05 a V2-F16-E07, V2-F32-E01 a V2-F32-E16 | G01, G16, G32 | CP-44 | testes espaciais em Postgres real; PGlite sem a extensão segue verde |
| DP | T37 | Console x prefeitura: quem registra, quem recupera, quem suspende | F03, F10, F20 | F03-E11; F10-E03; F20 | G20 | CP-29, CP-30 | reemissão de acesso testada |
| DP | T38 | Suporte assistido do fornecedor: concessão nominal, curta, só leitura, com trilha no município; sem impersonation completa (PR:D-10) | F10, F20, F25 | V2-F10-E16, V2-F20-E01, V2-F20-E08, V2-F20-E11, V2-F25-E15 | G10, G20, G25 | CP-30, CP-54 | ADR 0018; leitura sem concessão negada; concessão expira; diagnóstico sem dado pessoal |
| DP | T39 | Campo após retorno da secretaria: só motivo, resumo e nova tarefa | F13, F14 | F13-E05; F14-E09 | G13 | - | teste negativo de payload do agente |
| DP | T40 | Cidadão para agente: só depois da conversão, lista de inclusão de campos | F18, F19 | F18-E07; F19 | G19 | CP-09 | testes negativos de payload; fluxo H |
| DP | T41 | Manifesto de tabelas: saída, eliminação, dado pessoal, retenção e backup, inclusive as tabelas dos módulos novos | F05, F16, F29, F30, F32, F33, F34 | V2-F05-E01 a V2-F05-E05, V2-F16-E14, V2-F29-E16, V2-F30-E17, V2-F32-E15, V2-F33-E16, V2-F34-E19 | G05, G16, G29, G30, G32, G33, G34 | CP-10, CP-29 | teste de catálogo nos dois sentidos; tabela nova sem classe reprova |
| DP | T42 | Política para teste vermelho: nenhum vermelho conhecido | F00 | E02, E03 | G00 | - | portão que reprova skip sem data e dono |
| DP | T43 | Topologia: worker, API pública separada, uma imagem | F07 | E01 a E09 | G07 | - | worker isolado; `/saude` por serviço |

### 1.2 Decisões do pedido (D-01 a D-06) e ajustes (A-01 a A-04)

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PR | D-01 | Portal das secretarias primeiro, cidadão depois, sem paralelo | F11, F12, F15 | F12-E07; F15-E01 | G12 | CP-36 | `GATE.md` do G12 aprovado antes de qualquer etapa da F15 |
| PR | D-02 | Revogada por PR:D-08: portal com pessoa global, vínculos por município e órgão externo; isolamento entre municípios mantido | F03, F04, F11 | V2-F03-E01, V2-F03-E05, V2-F03-E15 a V2-F03-E18, V2-F04-E12, V2-F11-E23, V2-F11-E24 | G03, G04, G11 | CP-49 | ADR 0009 revisada; pessoa de A negada em B (F03-E18) |
| PR | D-03 | Canal do cidadão: conta, verificação, sem anonimato, opt-in por município; vídeo, chat, gov.br, SMS, login social e CPF entram por PR:D-07 | F15, F16, F17, F34 | V2-F15-E04, V2-F15-E13, V2-F16-E10, V2-F17-E04, V2-F34-E01 a V2-F34-E20 | G15, G16, G17, G34 | CP-28 | canal desligado por padrão testado; relato anônimo recusado |
| PR | D-04 | Fase 0 de estabilização como gate obrigatório | F00 | E01 a E25 | G00 | CP-02, CP-03 | `GATE.md` do G00 aprovado |
| PR | D-05 | Documento emitido imutável | F09 | E01 a E05, E09 a E11 | G09 | - | teste de reimpressão idêntica |
| PR | D-06 | Aprovação autenticada, sem chamar de assinatura eletrônica | F09 | E01, E06, E07 | G09 | CP-14 | nomenclatura revisada em telas e documentos |
| PR | A-01 | Revogado por PR:D-08: o mesmo e-mail liga a pessoa a mais de um município; e-mail único entre pessoas ativas | F03 | V2-F03-E01, V2-F03-E09, V2-F03-E15 | G03 | - | ADR 0009 revisada e índice parcial de e-mail em pessoas |
| PR | A-02 | Papel de banco da API pública decidido por evidência | F15 | E01 | G15 | CP-25 | tabela comparativa de grants e testes negativos |
| PR | A-03 | Rate limit em duas camadas, sem Redis | F15 | E09, E10 | G15 | - | camada de borda e cotas persistentes testadas |
| PR | A-04 | APROVAÇÃO AUTENTICADA enquanto J8 estiver aberto | F09 | E06, E07, E14 | G09 | CP-14 | nomenclatura em telas e documentos |

### 1.2b Decisões de 2026-10-01 (D-07 a D-29)

Itens desta tabela: 23. Origem `PR:` das decisões que ampliaram a V2 (`01-decisoes-e-principios.md`, seção 11).

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PR | D-07 | Canal do cidadão ampliado: vídeo de até 30 s e 50 MB, chat por relato, gov.br, SMS e login social; CPF obrigatório no relato identificado; sem anonimato | F05, F06, F07, F15, F16, F17, F18, F19, F34 | V2-F34-E01 a V2-F34-E20, V2-F05-E13, V2-F05-E14, V2-F06-E18 a V2-F06-E20, V2-F07-E10, V2-F07-E11, V2-F15-E16, V2-F15-E18, V2-F16-E16, V2-F17-E20, V2-F18-E13, V2-F19-E04 | G34 | CP-46, CP-47, CP-91, CP-92, CP-93, CP-94 | E2E do canal ampliado em HML (F34-E20); relato anônimo recusado |
| PR | D-08 | Pessoa global com vínculos por município e órgão; token de um município por vez; órgão externo multi-município; isolamento mantido; revoga D-02 e A-01 | F03, F10, F11, F12, F20, F25 | V2-F03-E01, V2-F03-E02, V2-F03-E15 a V2-F03-E18, V2-F10-E02, V2-F10-E03, V2-F10-E34, V2-F11-E04, V2-F11-E23 a V2-F11-E25, V2-F11-E29, V2-F12-E08, V2-F20-E18, V2-F25-E14 | G03 | CP-49, CP-51, CP-51, CP-50, CP-59 | cruzamento F03-E18 e F11-E25; revisão manual F25-E14 |
| PR | D-09 | Assinatura avançada e ICP-Brasil por provedor externo via API; nomenclatura segue "aprovação autenticada" até o parecer J8 | F09, F10, F24, F25 | V2-F09-E19 a V2-F09-E28, V2-F10-E32, V2-F10-E35, V2-F24-E13, V2-F25-E16 | G09 | CP-14, CP-41 | provedor em memória e sandbox; assinado guardado e validado depois |
| PR | D-10 | Suporte assistido do fornecedor: concessão do administrador, nominal, com MFA, curta, só leitura, com trilha no município; sem impersonation completa | F10, F20, F25 | V2-F20-E01, V2-F20-E11, V2-F10-E16, V2-F25-E15 | G20 | CP-30, CP-54 | leitura sem concessão negada; concessão expira; trilha no município |
| PR | D-11 | White-label: logotipo, nome e cor de destaque por município, com contraste AA validado; sem tema por secretaria e sem tema completo editável | F08, F23, F35 | V2-F08-E10, V2-F08-E11, V2-F35-E02 a V2-F35-E08, V2-F35-E13, V2-F23-E12 | G35 | CP-95 | cor reprovada no contraste recusada; cinco superfícies com a identidade |
| PR | D-12 | Idiomas inglês e espanhol e VLibras nas telas web e nos apps; sem Libras em vídeo | F08, F11, F17, F23, F35 | V2-F08-E08, V2-F08-E09, V2-F08-E12, V2-F11-E27, V2-F11-E30, V2-F17-E15, V2-F23-E10, V2-F23-E11, V2-F35-E09 a V2-F35-E12, V2-F35-E14 | G35 | CP-45, CP-73, CP-73 | pendentes.json vazio; VLibras só por clique e fora de tela com dado pessoal |
| PR | D-13 | Tracing distribuído e SLO por rota crítica (premissa: OpenTelemetry com destino configurável) | F21, F25 | V2-F21-E10 a V2-F21-E14, V2-F25-E19 | G21 | CP-60 | trace de rota crítica sem dado pessoal; alerta por consumo do orçamento de erro |
| PR | D-14 | Integrações externas: conectores reais onde há API pública e adaptador com sandbox para S2ID, SEI e Defesa Civil Alerta, ativados só com credenciamento | F31 | V2-F31-E01 a V2-F31-E20 | G31 | CP-77, CP-78, CP-79, CP-80, CP-81, CP-82, CP-83, CP-84 | suíte de contrato, falha injetada e segredo varrido; ativação real só por CP |
| PR | D-15 | Abrigos, incidentes e logística humanitária completos (INC-01 a INC-04, ABR-01, LOG-01 a LOG-07, RN-08, RN-09), no painel e no app offline | F29, F30 | V2-F29-E01 a V2-F29-E18, V2-F30-E01 a V2-F30-E18 | G29, G30 | CP-62, CP-63, CP-66, CP-67 | fluxos O e P ponta a ponta em aparelho físico |
| PR | D-16 | PostGIS e busca por raio, imóvel e área de risco (ALY:GEO-02) | F01, F16, F32 | V2-F01-E21, V2-F01-E22, V2-F16-E05 a V2-F16-E07, V2-F32-E01 a V2-F32-E16 | G32 | CP-44, CP-85, CP-86, CP-87 | testes espaciais em Postgres real e em HML |
| PR | D-17 | Importação de lote por CSV, configuração versionada de tipos, severidades, prazos, formulários e modelos, e checklist por tipo com perguntas condicionais | F09, F33 | V2-F33-E01 a V2-F33-E16, V2-F09-E16 | G33 | CP-88, CP-89, CP-90 | versão imutável; checklist avaliado offline; lote idempotente e reversível |
| PR | D-18 | Escalonamento acima do gestor do órgão e competência por COBRADE ou território | F04, F10, F11, F12 | V2-F04-E15, V2-F04-E16, V2-F10-E17, V2-F10-E18, V2-F10-E19, V2-F11-E28, V2-F12-E03 | G04 | CP-21, CP-53 | cadeia por município testada; competência sugere e valida o destino |
| PR | D-19 | Dívidas operacionais entram: lint, trava de migration, SBOM, licenças, scan de contêiner, redundância, DR anual, pentest recorrente, console, indicadores por órgão, estilo inline | F01, F07, F10, F20, F22, F25 | V2-F01-E17 a V2-F01-E20, V2-F07-E12, V2-F07-E13, V2-F10-E21, V2-F10-E22, V2-F20-E12 a V2-F20-E15, V2-F22-E10, V2-F22-E11, V2-F25-E21 | G01 | CP-43, CP-56, CP-61, CP-74, CP-31 | cada etapa com testes e evidência no próprio gate |
| PR | D-20 | As lacunas L1 a L26 entram, distribuídas como etapas novas ao fim das fases donas (resolve CP-40) | F02, F03, F04, F05, F06, F09, F10, F14, F15, F20, F32, F33 | V2-F02-E09, V2-F03-E14, V2-F03-E19 a V2-F03-E21, V2-F04-E14, V2-F05-E15, V2-F06-E17, V2-F06-E21 a V2-F06-E23, V2-F09-E16 a V2-F09-E18, V2-F10-E20, V2-F10-E23 a V2-F10-E31, V2-F10-E33, V2-F10-E36, V2-F14-E16 a V2-F14-E22, V2-F15-E17, V2-F20-E16, V2-F20-E17, V2-F32-E07, V2-F33-E05 a V2-F33-E08 | G10 | CP-40 | linhas L1 a L26 da seção 2.8, todas com etapa e gate |
| PR | D-21 | Reabrir ocorrência encerrada com motivo por 30 dias, configurável por município; depois só ocorrência vinculada (resolve CP-23 e K17) | F13, F26 | V2-F13-E01, V2-F13-E06, V2-F13-E07, V2-F13-E09 a V2-F13-E11, V2-F26-E05 | G13 | CP-23 | reabertura dentro e fora do prazo; documento emitido intacto |
| PR | D-22 | Painel e portal são site responsivo e instalável na tela inicial (PWA), sem funcionar offline | F10, F11, F12, F23 | V2-F10-E15, V2-F11-E26, V2-F23-E09, V2-F12-E08 | G10, G11 | - | instalação acessível; service worker sem cache de dado |
| PR | D-23 | Encaminhamento só pode ser devolvido antes do aceite | F04, F11 | V2-F04-E17, V2-F11-E10, V2-F11-E15 | G04, G11 | CP-20 | devolução depois do aceite recusada; ação desabilitada com o motivo |
| PR | D-24 | Só a coordenação classifica e despacha; o operador não; o critério ALY:CA-01 é corrigido (resolve a divergência M4) | F03 | V2-F03-E13 | G03 | - | matriz papel x rota x método nega ao operador classificar e despachar |
| PR | D-25 | Premissa: a saída a campo é implementada no app (CP-02 igual a implementar) | F14 | V2-F14-E01 | G14 | CP-02 | saída declarada pelo app em aparelho físico |
| PR | D-26 | Premissa: a foto de perfil é construída no painel (CP-18 igual a construir) | F10 | V2-F10-E09 | G10 | CP-18 | foto enviada, removida e mostrada no painel |
| PR | D-27 | Premissa: o segundo fator do agente de campo é opcional, com tela de código no app | F14 | V2-F14-E16 | G14 | CP-57 | ativação opcional pelo app; recuperação decidida |
| PR | D-28 | Capacidade de uma pessoa dedicada (CP-01); um commit por etapa aprovada com mensagem V2-Fnn-Enn; repositório privado; seção de retomada no CLAUDE.md | processo (sem etapa) | 00-README.md; STATUS.md; CLAUDE.md | - | CP-01 | STATUS.md e git log com um commit por etapa aprovada |
| PR | D-29 | Ordem de execução das fases: os números de F29 a F35 não são a ordem; cada gate depende de todos os anteriores na ordem de STATUS.md | processo (sem etapa) | STATUS.md seção 5; 02-mapa-de-dependencias.md | - | - | cada GATE.md confere os gates anteriores na ordem de execução |

### 1.3 Decision Pack: checkpoints K1 a K22

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DP | K1 | Estados do encaminhamento, prazos e pausa do relógio | F12 | E02, E03 | G12 | CP-20 | ata da sessão com a secretaria piloto |
| DP | K2 | Percentuais de lembrete, canal e cadeia de escalonamento | F12 | E03 | G12 | CP-21 | valores finais registrados |
| DP | K3 | Conteúdo do dossiê mínimo | F04, F12 | F04-E04; F12-E04 | G04 | CP-09 | lista de campos aprovada |
| DP | K4 | Atrito do MFA para usuário de órgão | F03, F12 | F03-E11; F12-E06 | G03 | CP-08 | taxa de ativação |
| DP | K5 | Encerramento com providência obrigatória em aberto | F10 | E13 | G10 | CP-17 | regra e teste |
| DP | K6 | Prazos de retenção padrão por município | F05 | E09 | G05 | CP-10 | prazos aprovados |
| DP | K7 | RPO e RTO realmente medidos | F22 | E07 | G22 | CP-37 | tempos medidos em HML |
| DP | K8 | SMS entra no login do cidadão (PR:D-07), com teto de custo e provedor a contratar | F34 | V2-F34-E15 | G34 | CP-92 | porta de provedor e código de uso único testados; envio real só com contrato |
| DP | K9 | Anonimato, atestação de aplicativo ou CAPTCHA | F15, F27 | F15-E09 a E11; F27-E06 | G15 | CP-27 | taxa de spam medida |
| DP | K10 | Cotas e limites de anexo | F06, F27 | F06-E09; F27-E06 | G06 | CP-13 | custo de armazenamento por relato |
| DP | K11 | PDF para secretaria antes do scanner completo | F06 | E14 | G06 | CP-12 | decisão e suíte maliciosa |
| DP | K12 | Vídeo do relato entra (PR:D-07): até 30 s e 50 MB, um por relato, transcodificado em worker isolado | F06, F07, F34 | V2-F06-E18 a V2-F06-E20, V2-F07-E10, V2-F07-E11, V2-F34-E03, V2-F34-E04 | G06, G07, G34 | CP-47 | cadeia hostil de vídeo recusada; custo medido em F24-E10 |
| DP | K13 | Ferramenta de erro e de log e residência | F01, F21 | F01-E14; F21-E08 | G01 | CP-06 | `SUBPROCESSADORES.md` atualizado |
| DP | K14 | Saída a campo decidida como implementar (CP-02 por PR:D-25); criptografia local, segundo plano e OTA seguem em CP-24 | F00, F14 | V2-F00-E24, V2-F14-E01, V2-F14-E04, V2-F14-E06 | G00, G14 | CP-02, CP-24 | documentação ajustada; app com saída a campo em aparelho físico |
| DP | K15 | Plantão e segunda pessoa com acesso | F01, F21, F27 | F01-E16; F21-E06; F27-E02 | G01 | CP-07 | canal de alerta e acesso de recuperação |
| DP | K16 | Retirar a marca d'água dos documentos | F09, F28 | F09-E14; F28-E06 | G09 | CP-14 | parecer e configuração |
| DP | K17 | Reabertura x ocorrência vinculada: reabrir por 30 dias com motivo e, depois, só ocorrência vinculada (CP-23 decidido por PR:D-21) | F13 | V2-F13-E06, V2-F13-E09, V2-F13-E10, V2-F13-E11 | G13 | CP-23 | ALY:FLU-04 atendido por D-21; reabertura testada dentro e fora do prazo |
| DP | K18 | Orientação do aparelho e layout de tablet | F17 | E15 | G17 | CP-38 | decisão registrada |
| DP | K19 | White-label por município: logotipo, nome e cor de destaque; sem tema por secretaria (PR:D-11) | F08, F35 | V2-F08-E10, V2-F08-E11, V2-F35-E02 a V2-F35-E08 | G08, G35 | CP-95 | tema do município com contraste AA nos dois modos |
| DP | K20 | Idiomas en e es e VLibras nas telas web e nos apps; sem Libras em vídeo (PR:D-12) | F08, F35 | V2-F08-E08, V2-F08-E09, V2-F08-E12, V2-F35-E09 a V2-F35-E12 | G08, G35 | CP-45, CP-73 | pendentes.json vazio; VLibras só por clique |
| DP | K21 | PDF oficial acessível (tagged) | F09, F23 | F09-E15; F23-E06 | G09 | CP-15 | relatório de validação do PDF |
| DP | K22 | Encaminhamento atribuído a pessoa ou só ao órgão | F11, F12 | F11-E11; F12-E02 | G12 | CP-20 | decisão e teste de atribuição |

### 1.4 Decision Pack: itens jurídicos J1 a J13 (o roadmap NÃO decide)

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DP | J1 | Base legal por canal e controlador dos dados da conta do cidadão | F05, F15, F28 | F05-E06 a E08 (mecanismo); F15-E15; F28-E03 | G05 | CP-11 | parecer arquivado; mecanismo de aceite existente |
| DP | J2 | Política de privacidade, termos, aceite versionado e consentimentos | F05, F17 | F05-E06, E07; F17-E14 | G05 | CP-11 | política publicada em URL estável |
| DP | J3 | Menores de idade | F15 | E15 | G15 | CP-11 | campo de classificação etária declarada |
| DP | J4 | Retenção: relato, anexos, IP, logs, documento emitido, backup | F05, F09 | F05-E09, E12; F09-E12 | G05 | CP-10 | classes de retenção; prazos aprovados |
| DP | J5 | Direitos do titular | F05 | E08 | G05 | CP-11 | fila de pedidos e exportação por titular |
| DP | J6 | O que cada órgão vê do dossiê e o que desce ao aparelho do agente | F04, F12, F19 | F04-E04; F12-E04; F19-E01, E03 | G04 | CP-09 | lista de campos aprovada |
| DP | J7 | Transferência internacional e novos subprocessadores | F01, F21, F22, F28 | F01-E14; F21-E08; F22-E02; F28-E08 | G01 | CP-06 | `SUBPROCESSADORES.md` e aviso aos municípios |
| DP | J8 | Competência para aprovar, nível de assinatura, provedor externo e marca d'água | F09, F28 | V2-F09-E06 a V2-F09-E08, V2-F09-E14, V2-F09-E19 a V2-F09-E21, V2-F09-E28, V2-F28-E06 | G09, G28 | CP-14, CP-41 | parecer e configuração; nomenclatura trocada só após o parecer |
| DP | J9 | Exigências de acessibilidade por superfície | F23 | E05, E07 | G23 | CP-32 | relatório de conformidade |
| DP | J10 | Papel do fornecedor no suporte: acesso assistido de leitura com concessão do município (PR:D-10) | F20 | V2-F20-E01, V2-F20-E11 | G20 | CP-30, CP-54 | ADR 0018; concessão, expiração e trilha testadas |
| DP | J11 | Trote, abuso e conteúdo ilícito, inclusive no vídeo e na conversa do relato | F06, F15, F18, F34 | V2-F06-E13, V2-F15-E11, V2-F18-E09, V2-F34-E10 | G06, G15, G18, G34 | CP-26 | registro de moderação append-only; termos |
| DP | J12 | O que se preserva de município eliminado | F05, F20 | F05-E05; F20-E04 | G05 | CP-29 | regra aprovada |
| DP | J13 | Nomeação do encarregado e canal | F05, F28 | F05-E07; F28-E03 | G05 | CP-11 | encarregado e canal publicados |

### 1.5 Decision Pack: perguntas R1 a R8

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DP | R1 | Capacidade e custo | antes de F00 | (planejamento) | G08, G12, G19 | CP-01, CP-36 | decisão e balanço de cada onda |
| DP | R2 | Ordem das superfícies, município e secretaria piloto | F12, F27 | F12-E02; F27-E01 | G12 | CP-20, CP-34 | sessão com a secretaria; termo do piloto |
| DP | R3 | Escopo dos órgãos: antes só os do próprio município, revisto por PR:D-08 para órgão externo com pessoa global | F03 | V2-F03-E01, V2-F03-E05, V2-F03-E17 | G03 | CP-51 | ADR 0009 revisada por PR:D-08 |
| DP | R4 | Perfil do canal do cidadão, ampliado por PR:D-07 com vídeo, chat, CPF e provedores de login | F15, F34 | V2-F15-E13, V2-F34-E01 a V2-F34-E20 | G15, G34 | CP-28 | decidido por PR:D-03 e PR:D-07 |
| DP | R5 | Entidade, domínio e contas de loja | F01 | E10, E13 | G01 | CP-04 | decisão registrada |
| DP | R6 | Contratação do que a V2 pressupõe | F01, F11, F12, F22 | F01-E11; F11-E17; F22-E01 | G01 | CP-05, CP-19 | custos confirmados |
| DP | R7 | RPO, RTO e disponibilidade a prometer | F22, F28 | F22-E01, E02; F28-E05 | G22 | CP-31 | decisão e relatório de restore |
| DP | R8 | A estabilização é portão de entrada | F00 | E01 a E25 | G00 | - | decidido por PR:D-04 |

### 1.6 As cinco superfícies

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PR | S1 | `apps/web`: painel da prefeitura, instalável na tela inicial, com os módulos de incidente, logística, território e configuração | F00, F10, F29, F30, F32, F33 | V2-F00-E13, V2-F10-E01 a V2-F10-E36, V2-F29-E10 a V2-F29-E12, V2-F30-E12, V2-F30-E13, V2-F32-E11, V2-F32-E12, V2-F33-E11, V2-F33-E15 | G00, G10, G29, G30, G32, G33 | CP-17, CP-18, CP-22 | E2E do painel em API e em modo local; capturas aprovadas |
| PR | S2 | `apps/campo`: app do agente, com incidente, estoque, território, checklist condicional, mapa offline e segundo fator | F00, F13, F14, F29, F30, F32, F33 | V2-F00-E14 a V2-F00-E16, V2-F13-E05, V2-F14-E01 a V2-F14-E22, V2-F29-E13, V2-F29-E14, V2-F30-E14, V2-F30-E15, V2-F32-E13, V2-F33-E07, V2-F33-E08 | G00, G13, G14, G29, G30, G32, G33 | CP-02, CP-24, CP-57, CP-58 | prova em Android e iOS físicos |
| PR | S3 | `apps/console`: console do fornecedor, com suporte assistido, livro de eliminações, contrato e identidade do município | F20, F31, F35 | V2-F20-E01 a V2-F20-E18, V2-F31-E18, V2-F35-E13 | G20, G31, G35 | CP-29, CP-30 | testes do console e plateia-nao-atravessa verdes |
| PR | S4 | `apps/portal`: portal das secretarias e órgãos externos, instalável, em três idiomas | F11, F12 | V2-F11-E01 a V2-F11-E30, V2-F12-E01 a V2-F12-E08 | G11, G12 | CP-19, CP-20, CP-21, CP-51 | homologação com a secretaria real |
| PR | S5 | `apps/cidadao`: app do cidadão, com canal ampliado, CPF, provedores de login, idiomas e identidade do município | F15, F16, F17, F18, F19, F34, F35 | V2-F15-E01 a V2-F15-E18, V2-F16-E01 a V2-F16-E16, V2-F17-E01 a V2-F17-E20, V2-F18-E01 a V2-F18-E13, V2-F19-E01 a V2-F19-E07, V2-F34-E03, V2-F34-E08, V2-F34-E17, V2-F35-E07 | G15, G16, G17, G18, G19, G34, G35 | CP-11, CP-25, CP-33 | beta interno em aparelho; fluxos F, G, H |

### 1.7 Fluxos E2E A a P

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PR | Fluxo A | Prefeitura, ocorrência manual | F00, F10 | F00-E18 | G00 | - | E2E do painel verde; refeito no POC |
| PR | Fluxo B | Prefeitura, agente, vistoria, prefeitura | F00, F14 | F14-E12 | G14 | - | prova em aparelho físico |
| PR | Fluxo C | Prefeitura, secretaria, resposta, prefeitura | F11, F12 | F11-E22; F12-E02 | G12 | CP-20 | E2E em HML e sessão com a secretaria real |
| PR | Fluxo D | Secretaria devolve, prefeitura reencaminha a outro órgão | F10, F11, F12 | F10-E05; F11-E22 | G12 | - | E2E em HML |
| PR | Fluxo E | Secretaria responde, reinspeção, agente | F13, F14 | F13-E08; F14-E13 | G14 | CP-23 | E2E e prova em aparelho |
| PR | Fluxo F | Cidadão, relato, complemento, triagem | F17, F18 | F17-E18; F18-E11 | G18 | - | E2E em HML |
| PR | Fluxo G | Cidadão, relato, ocorrência | F18 | E11 | G18 | - | E2E; protocolo oficial só na conversão |
| PR | Fluxo H | Relato convertido, agente | F19 | E07 | G19 | CP-09 | E2E e testes negativos de payload |
| PR | Fluxo I | Ocorrência, documento imutável | F09 | E10 | G09 | - | teste de reimpressão idêntica |
| PR | Fluxo J | Documento, substituição | F09 | E09 | G09 | - | nova versão e anterior preservada |
| PR | Fluxo K | Município, exportação completa | F00, F05, F09, F28 | F00-E11; F05-E05; F09-E11; F28-E10 | G28 | CP-29 | pacote completo conferido contra o manifesto |
| PR | Fluxo L | Município, eliminação | F05, F20, F28 | F05-E05; F20-E04; F28-E10 | G28 | CP-29 | eliminação com aviso e sem tabela esquecida |
| PR | Fluxo M | Backup, restore | F00, F22 | F00-E25; F22-E03, E07 | G22 | CP-31, CP-37 | relatório de restore com tempos |
| PR | Fluxo N | DC360, provisionamento de município e do primeiro administrador como pessoa com vínculo | F20, F26 | V2-F20-E02, V2-F20-E18, V2-F26-E06 | G20, G26 | - | provisionamento e primeiro administrador testados |
| PR | Fluxo O | Ativação de emergência (ALY §5.2): incidente, ocorrências agrupadas, equipes, presença, abrigo e relatório de situação | F29 | V2-F29-E18 | G29 | CP-62, CP-63 | E2E ponta a ponta e prova em aparelho físico |
| PR | Fluxo P | Suprimentos humanitários (ALY §5.3): estoque, doação, necessidade, carga, entrega com prova e ajuste aprovado | F30 | V2-F30-E18 | G30 | CP-66, CP-67 | E2E ponta a ponta e prova em aparelho físico |

### 1.8 Fases F29 a F35 e gates G29 a G35

Itens desta tabela: 14. Sete fases novas e sete gates, na ordem de execução de `STATUS.md` seção 5 (a numeração não é a ordem).

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PR | F29 | Fase 29, Incidentes e abrigos (PR:D-15): incidente, agrupamento sem alterar ocorrência, quadro, equipes, presença, abrigos, relatório de situação e app offline | F29 | V2-F29-E01 a V2-F29-E18 | G29 | CP-62, CP-63, CP-64, CP-65 | docs/evidencias-v2/G29/GATE.md; fluxo O em aparelho físico |
| PR | F30 | Fase 30, Logística humanitária (PR:D-15): locais, catálogo, razão de movimentos, ajuste aprovado, QR, doações, cargas, kits, alertas e app offline | F30 | V2-F30-E01 a V2-F30-E18 | G30 | CP-66, CP-67, CP-68, CP-69, CP-70, CP-71, CP-72 | docs/evidencias-v2/G30/GATE.md; fluxo P em aparelho físico |
| PR | F31 | Fase 31, Integrações externas oficiais (PR:D-14): porta única, segredo cifrado, WhatsApp, camadas GIS, Cemaden, adaptadores S2ID, SEI e alerta público | F31 | V2-F31-E01 a V2-F31-E20 | G31 | CP-77, CP-78, CP-79, CP-80, CP-81, CP-82, CP-83, CP-84 | docs/evidencias-v2/G31/GATE.md; ativação real só por checkpoint |
| PR | F32 | Fase 32, PostGIS e dados territoriais (PR:D-16): extensão, malha IBGE, áreas, imóvel, busca por raio, competência por área e prova em Postgres real | F32 | V2-F32-E01 a V2-F32-E16 | G32 | CP-44, CP-85, CP-86, CP-87 | docs/evidencias-v2/G32/GATE.md; isolamento espacial provado |
| PR | F33 | Fase 33, Configuração por município, checklist por tipo e importação (PR:D-17): versão imutável, publicação, checklist condicional, CSV com prévia e desfazer | F33 | V2-F33-E01 a V2-F33-E16 | G33 | CP-88, CP-89, CP-90 | docs/evidencias-v2/G33/GATE.md; versão aplicada gravada |
| PR | F34 | Fase 34, Canal do cidadão ampliado (PR:D-07): vídeo, conversa por relato, gov.br, SMS, login social, CPF verificado, minimização e moderação | F34 | V2-F34-E01 a V2-F34-E20 | G34 | CP-47, CP-94, CP-91, CP-92, CP-93, CP-46 | docs/evidencias-v2/G34/GATE.md; E2E em HML e prova em aparelho |
| PR | F35 | Fase 35, Idiomas, VLibras e identidade visual por município (PR:D-11, PR:D-12): logotipo, nome, cor, en e es, VLibras e restauração do tema | F35 | V2-F35-E01 a V2-F35-E14 | G35 | CP-95, CP-73, CP-45, CP-73 | docs/evidencias-v2/G35/GATE.md; cinco superfícies, três idiomas, claro e escuro |
| PR | G29 | Gate G29 INCIDENTES E ABRIGOS: libera F30, F31, F20 em diante e o piloto com modo incidente; reabre se rota da F29 escrever em ocorrências | F29 | V2-F29-E17, V2-F29-E18 | G29 | - | GATE.md; G00 a G19 e G32 verdes; test:isolamento verde |
| PR | G30 | Gate G30 LOGÍSTICA HUMANITÁRIA: libera F31, F35, F20 em diante e o piloto com logística; reabre se existir saldo editável ou movimento com UPDATE | F30 | V2-F30-E17, V2-F30-E18 | G30 | - | GATE.md; G00 a G19, G32 e G29 verdes; test:isolamento verde |
| PR | G31 | Gate G31 INTEGRAÇÕES EXTERNAS OFICIAIS: libera F35, F20, F21, F25 e F26 com integração em sandbox; não libera ativação real | F31 | V2-F31-E19, V2-F31-E20 | G31 | - | GATE.md; suíte de contrato, falha injetada e varredura de segredo |
| PR | G32 | Gate G32 POSTGIS E DADOS TERRITORIAIS PROVADOS: libera G09 e, em cadeia, G10, G15, G16, G31 e G24 sobre consultas espaciais | F32 | V2-F32-E15, V2-F32-E16 | G32 | - | GATE.md; isolamento espacial e plano de consulta em Postgres real |
| PR | G33 | Gate G33 CONFIGURAÇÃO, CHECKLIST E IMPORTAÇÃO PROVADOS: libera G15, F19, F29, F30, F20 e G26 a G28 | F33 | V2-F33-E16, V2-F33-E15 | G33 | - | GATE.md; versão aplicada gravada; lote idempotente e reversível |
| PR | G34 | Gate G34 CANAL DO CIDADÃO AMPLIADO: libera F19 e, na ordem de execução, F29 em diante; não libera abertura pública nem provedor real | F34 | V2-F34-E19, V2-F34-E20 | G34 | CP-11, CP-26, CP-28 | GATE.md; payload do agente sem vídeo nem conversa; E2E em HML |
| PR | G35 | Gate G35 IDIOMAS, VLIBRAS E IDENTIDADE POR MUNICÍPIO: libera F20, F21 a F25 e a POC; não libera VLibras nem logotipo real em produção | F35 | V2-F35-E14, V2-F35-E11 | G35 | - | GATE.md; pendentes.json vazio; cinco identidades de prova |

### 1.9 Checkpoints novos da revisão (CP-NOVO)

Itens desta tabela: 59. Nomes provisórios; um coordenador os troca pelos números seguintes ao CP-40 em `18-checkpoints.md`. Cada linha lista as etapas que o checkpoint bloqueia.

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CP-NOVO | CP-41 | Qual provedor de assinatura contratar, com que tarifa, quem paga e qual contrato de tratamento de dados | F09, F10, F24, F25, F28 | V2-F09-E20, V2-F09-E22, V2-F09-E27, V2-F10-E32, V2-F10-E35, V2-F24-E13, V2-F25-E16, V2-F28-E15 | G09, G10, G24, G25, G28 | CP-41 | decisao.md arquivada; bloqueia adaptador real, envio real e cota |
| CP-NOVO | CP-42 | Qual texto e fundamento legal do modelo de notificação ao responsável pelo imóvel | F09, F10 | V2-F09-E17, V2-F10-E36 | G09, G10 | CP-42 | decisao.md arquivada; bloqueia ligar a notificação em produção |
| CP-NOVO | CP-43 | Quais licenças de dependência são permitidas e proibidas | F01 | V2-F01-E19 | G01 | CP-43 | decisao.md arquivada; bloqueia a conferência de licenças só avisa |
| CP-NOVO | CP-44 | O provedor gerenciado deixa criar a extensão postgis em HML e produção | F01, F16, F32 | V2-F01-E22, V2-F16-E05, V2-F32-E01, V2-F32-E02 | G01, G16, G32 | CP-44 | decisao.md arquivada; bloqueia F32 em HML e produção |
| CP-NOVO | CP-45 | Como o app integra o VLibras e se o script do governo pode carregar nas telas web | F08, F11, F17, F23, F35 | V2-F08-E12, V2-F11-E30, V2-F17-E15, V2-F23-E10, V2-F35-E12 | G08, G11, G17, G23, G35 | CP-45 | decisao.md arquivada; bloqueia ativação do VLibras em produção |
| CP-NOVO | CP-46 | Base legal e finalidade do CPF obrigatório no relato identificado | F05, F15, F16, F17, F18, F25, F26, F27, F34 | V2-F05-E13, V2-F05-E14, V2-F15-E02, V2-F15-E15, V2-F15-E16, V2-F16-E16, V2-F17-E20, V2-F18-E13, V2-F25-E17, V2-F26-E09, V2-F27-E08, V2-F34-E14 | G05, G15, G16, G17, G18, G25, G26, G27, G34 | CP-46 | decisao.md arquivada; bloqueia CPF real e abertura pública do canal |
| CP-NOVO | CP-47 | Custo de armazenamento e de máquina do vídeo do relato | F07, F22, F24, F25, F26, F27, F34 | V2-F07-E11, V2-F22-E09, V2-F24-E10, V2-F25-E18, V2-F26-E09, V2-F27-E08, V2-F34-E04, V2-F34-E20 | G07, G22, G24, G25, G26, G27, G34 | CP-47 | decisao.md arquivada; bloqueia video_cidadao em produção |
| CP-NOVO | CP-48 | Destino da foto de vistoria sinalizada pelo antivírus, que é prova e não pode ser alterada | F06 | V2-F06-E23 | G06 | CP-48 | decisao.md arquivada; bloqueia antivírus de foto em produção |
| CP-NOVO | CP-49 | Parecer do encarregado sobre identidade global de servidores e órgãos externos | F03, F20, F25, F26 | V2-F03-E01, V2-F03-E15, V2-F20-E18, V2-F25-E14, V2-F26-E11 | G03, G20, G25, G26 | CP-49 | decisao.md arquivada; bloqueia a mesma pessoa em mais de um município em produção |
| CP-NOVO | CP-50 | Quem redefine MFA e senha de pessoa vinculada a vários municípios (grafado CP-50 na F03) | F03, F20 | V2-F03-E11, V2-F20-E02 | G03, G20 | CP-50 | decisao.md arquivada; bloqueia esse reset |
| CP-NOVO | CP-51 | Termo e base legal para o órgão externo ver o dossiê (grafado CP-51 na F03) | F03 | V2-F03-E17 | G03 | CP-51 | decisao.md arquivada; bloqueia convidar órgão externo real |
| CP-NOVO | CP-52 | Níveis de sigilo da ocorrência e quem vê cada um | F03 | V2-F03-E21 | G03 | CP-52 | decisao.md arquivada; bloqueia uso em produção |
| CP-NOVO | CP-53 | Níveis e prazos de escalonamento por município e rigor da competência do órgão | F04 | V2-F04-E15, V2-F04-E16 | G04 | CP-53 | decisao.md arquivada; bloqueia ligar em produção |
| CP-NOVO | CP-54 | Prazo padrão e teto do acesso assistido do fornecedor | F10, F20 | V2-F10-E16, V2-F20-E01, V2-F20-E11 | G10, G20 | CP-54 | decisao.md arquivada; bloqueia suporte assistido em produção, com CP-30 |
| CP-NOVO | CP-52 | Níveis de sigilo e quem vê cada um (mesmo tema de CP-52) | F10 | V2-F10-E31 | G10 | CP-52 | decisao.md arquivada; bloqueia tela de sigilo em produção |
| CP-NOVO | CP-55 | Lista final de motivos de encerramento da ocorrência | F10 | V2-F10-E27 | G10 | CP-55 | decisao.md arquivada; bloqueia lista final de motivos |
| CP-NOVO | CP-56 | Definição de taxa de atendimento e tempo de resposta por órgão | F10 | V2-F10-E21 | G10 | CP-56 | decisao.md arquivada; bloqueia definição final dos indicadores |
| CP-NOVO | CP-57 | Agente que perde aparelho e códigos: o administrador pode desligar o segundo fator dele | F14 | V2-F14-E16 | G14 | CP-57 | decisao.md arquivada; bloqueia segundo fator do agente em produção |
| CP-NOVO | CP-58 | Fonte, licença e custo dos tiles do mapa offline | F14 | V2-F14-E21 | G14 | CP-58 | decisao.md arquivada; bloqueia mapa offline no app |
| CP-NOVO | CP-50 | A troca de município pede novo código de segundo fator e quem redefine o MFA de pessoa com vários municípios | F11, F12 | V2-F11-E05, V2-F11-E23, V2-F12-E06, V2-F12-E08 | G11, G12 | CP-50 | decisao.md arquivada; bloqueia F11-E23 em produção |
| CP-NOVO | CP-51 | Qual órgão externo é o piloto e qual instrumento de tratamento de dados vale | F11, F12 | V2-F11-E24, V2-F12-E08 | G11, G12 | CP-51 | decisao.md arquivada; bloqueia conta real de órgão externo |
| CP-NOVO | CP-59 | A F03 aceita tokens de municípios diferentes na mesma sessão; sem isso a caixa e o sino consolidados caem para contador por município | F11 | V2-F11-E29 | G11 | CP-59 | decisao.md arquivada; bloqueia modo Todos da F11-E29 |
| CP-NOVO | CP-60 | Qual ferramenta, país e prazo de retenção para os traces de OpenTelemetry | F21, F25 | V2-F21-E10, V2-F21-E12, V2-F25-E19 | G21, G25 | CP-60 | decisao.md arquivada; bloqueia destino de produção do tracing |
| CP-NOVO | CP-61 | Planos, valores, excedente, e se nota fiscal e cobrança por gateway entram | F20 | V2-F20-E14 | G20 | CP-61 | decisao.md arquivada; bloqueia valor real e cobrança |
| CP-NOVO | CP-62 | Escala de níveis do incidente e estrutura de comando | F29 | V2-F29-E01, V2-F29-E03 | G29 | CP-62 | decisao.md arquivada; bloqueia produção da F29 |
| CP-NOVO | CP-63 | Papéis de incidente e de logística: quem faz o quê | F29, F30 | V2-F29-E01, V2-F30-E02 | G29, G30 | CP-63 | decisao.md arquivada; bloqueia produção da F29 e da F30 |
| CP-NOVO | CP-64 | Conteúdo do relatório de situação do incidente | F29 | V2-F29-E15 | G29 | CP-64 | decisao.md arquivada; bloqueia uso oficial do relatório |
| CP-NOVO | CP-65 | O cadastro nominal de abrigados, que é dado pessoal sensível, entra | F29 | V2-F29-E09 | G29 | CP-65 | decisao.md arquivada; bloqueia só essa ampliação |
| CP-NOVO | CP-66 | Política para saldo negativo de estoque quando o agente está offline | F30 | V2-F30-E01, V2-F30-E04, V2-F30-E14 | G30 | CP-66 | decisao.md arquivada; bloqueia produção da F30 |
| CP-NOVO | CP-67 | Quem aprova ajuste de estoque | F30 | V2-F30-E01, V2-F30-E06 | G30 | CP-67 | decisao.md arquivada; bloqueia produção da F30 |
| CP-NOVO | CP-68 | Categorias padrão e itens controlados, como medicamento | F30 | V2-F30-E03 | G30 | CP-68 | decisao.md arquivada; bloqueia uso real do catálogo |
| CP-NOVO | CP-69 | Finalidade e retenção dos dados de doador e recebedor | F30 | V2-F30-E08, V2-F30-E09, V2-F30-E17 | G30 | CP-69 | decisao.md arquivada; bloqueia dado real de doador e recebedor |
| CP-NOVO | CP-70 | Valores finais dos alertas de estoque | F30 | V2-F30-E11 | G30 | CP-70 | decisao.md arquivada; bloqueia valores finais |
| CP-NOVO | CP-71 | Regra final de kits e inventários simulados | F30 | V2-F30-E10 | G30 | CP-71 | decisao.md arquivada; bloqueia regra final |
| CP-NOVO | CP-72 | Operação degradada da logística quando o sistema está fora | F30 | V2-F30-E16 | G30 | CP-72 | decisao.md arquivada; bloqueia operação real da logística |
| CP-NOVO | CP-73 | Quem revisa as traduções en e es | F23 | V2-F23-E11 | G23 | CP-73 | decisao.md arquivada; bloqueia marcar o idioma como revisado |
| CP-NOVO | CP-74 | Dono e orçamento do pentest recorrente, do exercício anual de DR e das licenças | F25, F28 | V2-F25-E21, V2-F28-E16 | G25, G28 | CP-74 | decisao.md arquivada; bloqueia a promessa dessas rotinas |
| CP-NOVO | CP-75 | Quais módulos novos entram no piloto | F27 | V2-F27-E07 | G27 | CP-75 | decisao.md arquivada; bloqueia degraus 4 a 6 do piloto |
| CP-NOVO | CP-76 | Quais credenciais de integração real o piloto usa | F27, F28 | V2-F27-E09, V2-F28-E15 | G27, G28 | CP-76 | decisao.md arquivada; bloqueia degrau 6 do piloto |
| CP-NOVO | CP-77 | Onde mora a chave mestra dos segredos de integração por município | F31 | V2-F31-E01, V2-F31-E03 | G31 | CP-77 | decisao.md arquivada; bloqueia produção da F31 |
| CP-NOVO | CP-78 | Provedor, conta, modelos de mensagem e contrato do WhatsApp oficial | F31 | V2-F31-E09 | G31 | CP-78 | decisao.md arquivada; bloqueia envio real por WhatsApp |
| CP-NOVO | CP-79 | Relato de cidadão por WhatsApp é aceitável diante de conta e CPF obrigatórios | F31 | V2-F31-E10 | G31 | CP-79 | decisao.md arquivada; bloqueia qualquer relato por WhatsApp |
| CP-NOVO | CP-80 | Fontes, licença e serviços WMS das camadas GIS | F31 | V2-F31-E11, V2-F31-E12 | G31 | CP-80 | decisao.md arquivada; bloqueia fonte real de camada |
| CP-NOVO | CP-81 | Existe API pública utilizável do Cemaden | F31 | V2-F31-E14 | G31 | CP-81 | decisao.md arquivada; bloqueia conector real do Cemaden |
| CP-NOVO | CP-82 | Credenciamento do município no S2ID | F31 | V2-F31-E15 | G31 | CP-82 | decisao.md arquivada; bloqueia adaptador real do S2ID |
| CP-NOVO | CP-83 | Credenciamento e instância do SEI do município | F31 | V2-F31-E16 | G31 | CP-83 | decisao.md arquivada; bloqueia adaptador real do SEI |
| CP-NOVO | CP-84 | Credenciamento para o Defesa Civil Alerta | F31 | V2-F31-E17 | G31 | CP-84 | decisao.md arquivada; bloqueia adaptador real do alerta |
| CP-NOVO | CP-85 | Fonte, versão, simplificação e quem carrega a malha municipal | F32 | V2-F32-E03 | G32 | CP-85 | decisao.md arquivada; bloqueia malha real |
| CP-NOVO | CP-86 | Origem, licença e quem vê as áreas de risco | F32 | V2-F32-E05, V2-F32-E06 | G32 | CP-86 | decisao.md arquivada; bloqueia dado real de área de risco |
| CP-NOVO | CP-87 | O que identifica um imóvel: inscrição ou matrícula | F32 | V2-F32-E07 | G32 | CP-87 | decisao.md arquivada; bloqueia campos além do endereço |
| CP-NOVO | CP-88 | Quem publica uma versão de configuração e se precisa de segundo aprovador | F33 | V2-F33-E01, V2-F33-E04 | G33 | CP-88 | decisao.md arquivada; bloqueia publicação por coordenador |
| CP-NOVO | CP-89 | Quem escreve as perguntas técnicas do checklist por tipo | F33 | V2-F33-E05 | G33 | CP-89 | decisao.md arquivada; bloqueia conteúdo por tipo |
| CP-NOVO | CP-90 | Campos, estados e protocolo legado importáveis por CSV | F33 | V2-F33-E12, V2-F33-E13 | G33 | CP-90 | decisao.md arquivada; bloqueia dado real na importação |
| CP-NOVO | CP-91 | Credenciamento, homologação, escopos e uso da marca do gov.br | F34 | V2-F34-E13, V2-F34-E17 | G34 | CP-91 | decisao.md arquivada; bloqueia ativar o login gov.br |
| CP-NOVO | CP-92 | Provedor de SMS, preço, teto diário e contrato de dados | F34 | V2-F34-E15 | G34 | CP-92 | decisao.md arquivada; bloqueia envio real de SMS |
| CP-NOVO | CP-93 | Contas de desenvolvedor, regra da Apple (não confirmada) e rótulo de privacidade | F34 | V2-F34-E16, V2-F34-E17 | G34 | CP-93 | decisao.md arquivada; bloqueia login Google e Apple |
| CP-NOVO | CP-94 | Quem responde o chat do relato, em que horário e com que prazo | F34 | V2-F34-E07 | G34 | CP-94 | decisao.md arquivada; bloqueia conversa em produção |
| CP-NOVO | CP-73 | Quem revisa en e es (mesmo tema de CP-73, a unificar) | F35 | V2-F35-E11 | G35 | CP-73 | decisao.md arquivada; bloqueia concluir a F35 |
| CP-NOVO | CP-95 | Declaração de uso da imagem do logotipo do município | F35 | V2-F35-E03 | G35 | CP-95 | decisao.md arquivada; bloqueia logotipo de município real |

## Parte 2. Requisitos do documento do Alyson e requisitos novos da V2

Prioridades do Alyson: M indispensável ao MVP, S importante, C desejável, F evolução futura. O estado (ATENDIDO, PARCIAL, AUSENTE, NÃO CONFIRMADO, FASE FUTURA) abre a descrição.

### Requisitos do Alyson: AUT (organização, usuários e acesso)

Itens desta tabela: 5.

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ALY | ALY:AUT-01 | PARCIAL (M). Multi-tenant e equipes existem e o isolamento está atendido (CA-06); falta o conceito de unidade, que fica fora (21-fora-da-v2 item 26) (REL:09 2) | F03, F04 | V2-F03-E05, V2-F04-E05 | G03, G04 | - | isolamento.test.ts verde; órgãos com vínculo temporal; unidade reavaliada se órgão grande pedir |
| ALY | ALY:AUT-02 | PARCIAL (M). Login, renovação, bloqueio e recuperação existem; recuperação desligada em produção, reset administrativo sem tela, login e saída fora da trilha (BAS-24, REL:06); trilha de sessão na F03-E20 e consulta própria na F10-E30 (L11) | F00, F03, F10 | V2-F00-E09, V2-F00-E10, V2-F03-E20, V2-F10-E30 | G00, G03, G10 | CP-19 | telas de sessão e reset no painel; login, saída e falha na trilha com IP e agente; consulta da própria trilha |
| ALY | ALY:AUT-03 | PARCIAL (M). RBAC compartilhado existe e toda escrita passa por exigirPermissao; falta a unidade (21-fora-da-v2 item 26, segue fora); o nível de sigilo entra na F03-E21 e na F10-E31 (L12) (REL:06) | F03, F10 | V2-F03-E12, V2-F03-E13, V2-F03-E21, V2-F10-E31 | G03, G10 | CP-52, CP-52 | manifesto rota x ação reprova rota sem ação; matriz papel x rota fixa; sigilo aplicado no banco |
| ALY | ALY:AUT-04 | PARCIAL (S). TOTP existe, mas só é exigido ao administrador e por flag global desligada; V2 exige para usuário de órgão, coordenador e administrador (IDN-16) | F03, F11 | V2-F03-E11, V2-F11-E05 | G03, G11 | CP-08 | login sem segundo fator falha para os três papéis; reset por superior com trilha |
| ALY | ALY:AUT-05 | AUSENTE (S). Nenhuma tabela, rota ou tela registra aceite de termos; falta versão, data, usuário e IP, sem texto jurídico (LGP-29, REL:08) | F05 | V2-F05-E06 | G05 | CP-11 | aceite e revogação gravados com versão, usuário e IP; UPDATE negado ao app |

### Requisitos do Alyson: OCO (ocorrência e protocolo)

Itens desta tabela: 8.

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ALY | ALY:OCO-01 | ATENDIDO (M). MANTER. Protocolo único por organização e ano, com sequência travada e UNIQUE; o ano e o fuso passam a ser os do município na F02-E09 (L5) (REL:09 2) | F00, F02, F16 | V2-F00-E18, V2-F02-E09, V2-F16-E15 | G00, G02, G16 | - | fluxo.e2e.mjs verde; ano do protocolo pelo fuso do município; relato nunca consome protocolo oficial |
| ALY | ALY:OCO-02 | PARCIAL (M). Campos existem; regra por tipo e prazos vêm da configuração versionada da F33; o operador anexa arquivo pelo painel na F06-E17 e na F10-E29 (L2) (REL:09 2) | F06, F10, F33 | V2-F06-E17, V2-F10-E29, V2-F33-E03, V2-F33-E09 | G06, G10, G33 | - | anexo da prefeitura pela cadeia segura; campos extras por tipo versionados |
| ALY | ALY:OCO-03 | ATENDIDO (M). MANTER. Tipo, severidade, vulnerabilidade, prazo e histórico de mudança geram fila ordenada; risco de agravamento é coberto pela severidade (REL:09 2) | F00 | V2-F00-E18 | G00 | - | fluxo A do navegador e test:api verdes; regressão do painel reabre G10 |
| ALY | ALY:OCO-04 | PARCIAL (S). Duplicidade manual só por tipo, trecho do endereço e 48 horas; F16-E07 acrescenta coordenada e raio no relato e a F10-E24 estende a duplicidade manual com contato e janela configurável (L3) (REL:07 11.7) | F10, F16, F18 | V2-F10-E24, V2-F16-E07, V2-F18-E05 | G10, G16, G18 | - | duplicidade manual por coordenada, contato e janela; LIKE escapado; triagem confirma o vínculo |
| ALY | ALY:OCO-05 | PARCIAL (M). vinculada_a nos dois sentidos e busca por endereço existem; imóvel e área entram na F32 (L4) e o evento na F29, onde o incidente agrupa sem alterar a ocorrência (REL:09 2) | F13, F29, F32 | V2-F13-E06, V2-F29-E04, V2-F32-E07, V2-F32-E09 | G13, G29, G32 | CP-23, CP-87 | vínculo com tipo e motivo; imóvel e área no PostGIS; agrupamento sem alterar a ocorrência |
| ALY | ALY:OCO-06 | PARCIAL (M). Despacho à equipe com prazo e instruções existe; faltam responsável individual e aceite do agente (CMP, REL:03) | F14 | V2-F14-E14 | G14 | CP-24 | aceite e devolução provados em aparelho, ou etapa cancelada com decisão registrada |
| ALY | ALY:OCO-07 | ATENDIDO (M). MANTER. trilha_eventos só com SELECT e INSERT, com autoria e data; sem selo criptográfico (REL:09 2) | F00, F05 | V2-F00-E01, V2-F05-E10 | G00, G05 | - | test:isolamento verde; trilha sem policy de UPDATE e DELETE |
| ALY | ALY:OCO-08 | AUSENTE (C). Importação de lote por CSV não existia; entra na F33 com prévia linha a linha, lote idempotente e desfazer por encerramento (REL:09 2) | F33 | V2-F33-E12 a V2-F33-E15 | G33 | CP-90 | prévia validada; lote idempotente; desfazer por encerramento com motivo |

### Requisitos do Alyson: VIS (vistoria de campo)

Itens desta tabela: 8.

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ALY | ALY:VIS-01 | PARCIAL (M). Apps React Native para Android e iOS (campo e cidadão) substituem o PWA do agente por decisão do Rafael; painel e portal ficam instaláveis na tela inicial, sem offline (PR:D-22) (REL:09 2) | F10, F11, F14, F17, F23 | V2-F14-E11, V2-F17-E17, V2-F10-E15, V2-F11-E26, V2-F23-E09 | G10, G11, G14, G17, G23 | - | manifesto, ícones e service worker sem cache de dado; instalação acessível |
| ALY | ALY:VIS-02 | ATENDIDO (M). MANTER. Tarefas e checklist baixados, fila e SQLite no aparelho; provado no motor e em iPhone, nunca em Android (CMP, REL:03) | F00, F14 | V2-F00-E06, V2-F14-E12 | G00, G14 | - | vistoria em modo avião em Android e iOS físicos sem perda |
| ALY | ALY:VIS-03 | ATENDIDO (M). MANTER. GPS, precisão, data e autoria acompanham a vistoria e o laudo não os apresenta como exatos; corrigir precisão abaixo de 0,5 m (CMP-33) | F00 | V2-F00-E15 | G00 | - | test:campo verde; vistoria com precisão abaixo de 0,5 m sem erro 422 |
| ALY | ALY:VIS-04 | PARCIAL (M). Qualidade fixa 0,6, sem miniatura, retomada só por arquivo e sem antivírus; F06-E07 cobre anexos; a foto de vistoria ganha compressão no aparelho, envio retomável e antivírus sem recodificar (F06-E21 a E23, F14-E22) (REL:08) | F06, F14 | V2-F06-E07, V2-F06-E21 a V2-F06-E23, V2-F14-E22 | G06, G14 | CP-48 | miniatura nos anexos; envio retomável; foto de vistoria provadamente intacta |
| ALY | ALY:VIS-05 | PARCIAL (M). Um checklist fixo para todos os tipos COBRADE, sem perguntas condicionais; a F33 traz checklist por tipo com perguntas condicionais e avaliador offline (REL:09 2) | F33 | V2-F33-E05 a V2-F33-E08 | G33 | CP-89 | checklist por tipo avaliado offline; sincronização valida a versão respondida |
| ALY | ALY:VIS-06 | PARCIAL (S). Traço de dedo ligado à vistoria e impresso no laudo, sem hash nem finalidade próprios; o congelamento calcula o hash do traço (REL:11, A11-27) | F09 | V2-F09-E04 | G09 | CP-39 | hash do traço no snapshot; alternativa ao traço de dedo decidida em CP-39 |
| ALY | ALY:VIS-07 | ATENDIDO (M). MANTER. Fila com estados pendente, enviando, confirmado, bloqueado e destino perdido; faltava só descarte com motivo (CMP, REL:03) | F14 | V2-F14-E02, V2-F14-E03 | G14 | - | descarte pede motivo; nada some em silêncio, provado em aparelho |
| ALY | ALY:VIS-08 | PARCIAL (M). Evidência confirmada é imutável e nova vistoria é linha nova; a rodada de reinspeção traz o motivo e o aditamento avulso por texto entra na F14-E19 e na F14-E20 (L7) (REL:09 2) | F06, F13, F14 | V2-F13-E02, V2-F06-E11, V2-F14-E19, V2-F14-E20 | G06, G13, G14 | - | rodada numerada com motivo; aditamento versionado; evidência original intacta; UPDATE em evidencias negado |

### Requisitos do Alyson: DOC e FLU (documentos e providências)

Itens desta tabela: 8.

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ALY | ALY:DOC-01 | PARCIAL (M). Laudo em HTML e PDF existe sem versão, com marca d'água de validação em produção e PDF síncrono no processo da API (DOC-11, REL:09) | F09 | V2-F09-E04, V2-F09-E05 | G09 | CP-14 | PDF com versão do template e hash; marca d'água só sai após CP-14 |
| ALY | ALY:DOC-02 | PARCIAL (M). Laudo, dois termos e ofício existem; notificação, relatório fotográfico avulso e modelos por organização e tipo entram na F09-E16 a E18 e na F10-E33 (L8) (DOC-02, REL:09) | F09, F10 | V2-F09-E08, V2-F09-E16 a V2-F09-E18, V2-F10-E33, V2-F10-E36 | G09, G10 | CP-14, CP-42 | política e habilitação por município e tipo testadas; modelos novos versionados |
| ALY | ALY:DOC-03 | PARCIAL (M). A emissão só registra identificador; nada guarda conteúdo e modelo da época e a reimpressão regenera (DOC-11, DOC-12, REL:09 1) | F09 | V2-F09-E03, V2-F09-E04, V2-F09-E10 | G09 | - | documentos_emitidos append-only; laudo de amanhã igual ao de hoje |
| ALY | ALY:DOC-04 | AUSENTE (S). Nenhum estado, papel ou rota de revisão e aprovação de documento; a V2 cria a APROVAÇÃO AUTENTICADA (DOC-18, REL:09 1) | F09 | V2-F09-E06, V2-F09-E07 | G09 | CP-14 | estados e permissões por estado testados; aprovação com MFA, versão e hash |
| ALY | ALY:FLU-01 | PARCIAL (M). Há órgão, responsável em texto e prazo; a prioridade entra na F04-E14 e na F10-E20 (L9); destinatário nominal e caixa do órgão cobrem a fila (REL:05) | F04, F10, F11 | V2-F04-E02, V2-F04-E14, V2-F10-E20, V2-F11-E09 | G04, G10, G11 | - | caixa de entrada do órgão filtra por estado; prioridade da providência com ordenação e filtro |
| ALY | ALY:FLU-02 | PARCIAL (M). Resposta com desfecho fechado existe; faltam evidência de cumprimento e encerramento que exija resposta ou dispensa justificada (RN-05, REL:05) | F10, F11 | V2-F11-E13, V2-F10-E13 | G10, G11 | CP-17 | anexo da secretaria pela cadeia segura; regra de encerramento decidida em CP-17 |
| ALY | ALY:FLU-03 | PARCIAL (M). Sino e push cobrem prazo de vistoria; providência vencida só aparece como indicador; faltam aviso de vencendo e vencida (REL:05) | F04, F11 | V2-F04-E10, V2-F11-E17 | G04, G11 | CP-19, CP-21 | lembretes em percentual do prazo disparam sino e e-mail em relógio simulado |
| ALY | ALY:FLU-04 | PARCIAL (M). Encerrar com motivo existe; reabrir por 30 dias com motivo entra por PR:D-21 e, passado o prazo, o fato novo vira ocorrência vinculada | F13 | V2-F13-E01, V2-F13-E06, V2-F13-E09, V2-F13-E10, V2-F13-E11 | G13 | CP-23 | reabertura dentro e fora do prazo testada; encerrada nunca sai por SQL; regra decidida por D-21 |

### Requisitos do Alyson: GEO, PAI, REL, AUD e CFG (mapa, painel, relatório, auditoria, configuração)

Itens desta tabela: 7.

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ALY | ALY:GEO-01 | PARCIAL (M). O mapa mostra ativas por tipo, estado e severidade, mas não tinha filtro e a lista não filtrava por tipo; filtros na F10-E23 (L1) e camadas externas na F31-E13 (REL:09 2) | F10, F31 | V2-F10-E23, V2-F31-E13 | G10, G31 | - | filtros na URL com total honesto; camadas ligáveis com legenda |
| ALY | ALY:GEO-02 | AUSENTE (S). Sem PostGIS, sem busca por raio ou área de risco; a F32 entrega extensão, áreas, imóvel e consulta territorial (REL:09 2) | F01, F24, F32 | V2-F01-E21, V2-F01-E22, V2-F32-E02, V2-F32-E04, V2-F32-E08, V2-F32-E09, V2-F32-E11, V2-F32-E16, V2-F24-E11 | G01, G24, G32 | CP-44, CP-86 | busca por raio e área testada em Postgres real; isolamento espacial provado |
| ALY | ALY:PAI-01 | ATENDIDO (M). MANTER. Indicadores de fila, atrasadas, críticas e providências e resumo por tipo existem; filtro só por período e situação (REL:09 2) | F10 | V2-F10-E06, V2-F10-E10 | G10 | - | Painel.tsx e resumo sem regressão; estados vazios e de erro padrão |
| ALY | ALY:REL-01 | PARCIAL (M). CSV com filtros e defesa contra injeção existe; PDF e cabeçalho com filtros, organização, emissor e data entram na F10-E25 (L10); a F10-E08 cobre a tela do CSV (REL:09 2) | F02, F10 | V2-F02-E09, V2-F10-E08, V2-F10-E25 | G02, G10 | - | CSV e PDF com cabeçalho de filtros, município, data, responsável e fuso |
| ALY | ALY:AUD-01 | PARCIAL (M). Trilhas e consultas existem; leitura de ofício e de foto entra na F05-E11 e a consulta à própria trilha, login, saída e IP na F03-E20 e na F10-E30 (L11) (LGP-19, REL:08) | F03, F05, F10 | V2-F03-E20, V2-F05-E11, V2-F10-E30 | G03, G05, G10 | - | ofício, foto e busca por nome gravam consulta nominal; login e saída na trilha com IP |
| ALY | ALY:AUD-02 | ATENDIDO (M). MANTER. consultar_trilha só para coordenador e administrador; trilha sem policy de UPDATE e DELETE (REL:09 2) | F03 | V2-F03-E13 | G03 | - | matriz papel x rota fixa; consultar_trilha negado aos demais papéis |
| ALY | ALY:CFG-01 | AUSENTE (S). Tipos, severidades e prazos eram constantes; a F33 traz versão imutável, publicação sem quebrar ocorrência em andamento e painel de configuração | F33 | V2-F33-E01 a V2-F33-E04, V2-F33-E09 a V2-F33-E11 | G33 | CP-88 | versão publicada por município; ocorrência em andamento mantém a versão aplicada |

### Requisitos do Alyson: INC, ABR e LOG (fase futura)

Itens desta tabela: 12.

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ALY | ALY:INC-01 | FASE FUTURA (F), agora na V2 (PR:D-15). Criar incidente com nível, período, área, comando e objetivos; nenhuma tabela incidente existe (REL:09 L2) | F29 | V2-F29-E01 a V2-F29-E03, V2-F29-E10 | G29 | CP-62 | incidente com nível, período, área, comando e objetivos; ciclo de vida só por arestas |
| ALY | ALY:INC-02 | FASE FUTURA (F), agora na V2 (PR:D-15). Manter quadro de situação e linha do tempo operacional do incidente; não iniciado (REL:09 L2) | F29 | V2-F29-E05, V2-F29-E11 | G29 | - | quadro versionado com conflito 409 e linha do tempo operacional |
| ALY | ALY:INC-03 | FASE FUTURA (F), agora na V2 (PR:D-15). Gerenciar equipes, turnos, tarefas e check-in e check-out; não iniciado (REL:09 L2) | F29 | V2-F29-E06 a V2-F29-E08, V2-F29-E11, V2-F29-E13, V2-F29-E14 | G29 | CP-63 | equipes, turnos, tarefas e presença sem duplicar nem perder item; prova em aparelho |
| ALY | ALY:INC-04 | FASE FUTURA (F), agora na V2 (PR:D-15). Emitir relatório de situação por período consolidando ocorrências, ações, recursos e pendências; não iniciado (REL:09 L2) | F29 | V2-F29-E15 | G29 | CP-64 | relatório de situação imutável, reimprimível com o mesmo hash |
| ALY | ALY:ABR-01 | FASE FUTURA (F), agora na V2 (PR:D-15). Cadastrar abrigos, capacidade, ocupação e necessidades; "desabrigados" do laudo é só contagem de vistoria (REL:09 L2) | F29 | V2-F29-E09, V2-F29-E12, V2-F29-E13, V2-F29-E14 | G29 | CP-65 | abrigo com capacidade, ocupação em histórico imutável e necessidades, só contagens |
| ALY | ALY:LOG-01 | FASE FUTURA (F), agora na V2 (PR:D-15). Cadastrar depósitos, pontos de coleta, abrigos e responsáveis, com geografia e permissões; não iniciado (REL:09 L2) | F30 | V2-F30-E02, V2-F30-E12 | G30 | CP-63 | depósitos e pontos de coleta com geografia, horário e responsáveis |
| ALY | ALY:LOG-02 | FASE FUTURA (F), agora na V2 (PR:D-15). Registrar item, unidade, lote, validade, condição e origem, com entrada gerando movimento; não iniciado (REL:09 L2) | F30 | V2-F30-E03, V2-F30-E05, V2-F30-E12 | G30 | CP-68 | item, unidade, lote e validade; entrada gera movimento |
| ALY | ALY:LOG-03 | FASE FUTURA (F), agora na V2 (PR:D-15). Ler QR code ou código de barras, mantendo a entrada manual; não iniciado (REL:09 L2) | F30 | V2-F30-E07, V2-F30-E15 | G30 | - | QR e código de barras resolvem item e lote; entrada manual sempre possível |
| ALY | ALY:LOG-04 | FASE FUTURA (F), agora na V2 (PR:D-15). Controlar entrada, transferência, separação, entrega e ajuste, com saldo derivado de movimentos auditados; não iniciado (REL:09 L2) | F30 | V2-F30-E04, V2-F30-E05, V2-F30-E06, V2-F30-E14 | G30 | CP-66, CP-67 | saldo é a soma dos movimentos; ajuste só aprovado por outra pessoa |
| ALY | ALY:LOG-05 | FASE FUTURA (F), agora na V2 (PR:D-15). Comparar necessidade, estoque disponível e promessa de doação por local e período; não iniciado (REL:09 L2) | F30 | V2-F30-E08, V2-F30-E13 | G30 | CP-69 | falta, cobertura e excesso calculados no servidor |
| ALY | ALY:LOG-06 | FASE FUTURA (F), agora na V2 (PR:D-15). Registrar carga, rota e comprovante de entrega com itens, destino, recebedor e evidência; não iniciado (REL:09 L2) | F30 | V2-F30-E09, V2-F30-E14, V2-F30-E15, V2-F30-E16 | G30 | CP-69 | entrega idempotente com prova não recodificada e comprovante reproduzível |
| ALY | ALY:LOG-07 | FASE FUTURA (F), agora na V2 (PR:D-15). Operar estoque permanente de kits e simulados, com alertas de validade e inventário; não iniciado (REL:09 L2) | F30 | V2-F30-E10, V2-F30-E11, V2-F30-E13 | G30 | CP-71, CP-70 | kits, inventário e simulado só mudam o saldo por ajuste aprovado |

### Requisitos do Alyson: RN (regras de negócio)

Itens desta tabela: 10.

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ALY | ALY:RN-01 | ATENDIDO (sem prioridade). MANTER. Isolamento por tenant: RLS forçada em toda tabela, prefixo do tenant no storage por CHECK e 404 para outro município (REL:09 2) | F00, F25, F29, F30, F32 | V2-F00-E01, V2-F25-E04, V2-F25-E20, V2-F29-E17, V2-F30-E17, V2-F32-E16 | G00, G25, G29, G30, G32 | - | test:isolamento verde em todo gate; cruzamento ampliado em G25 e nos módulos novos |
| ALY | ALY:RN-02 | ATENDIDO (sem prioridade). MANTER. Número único por organização e ano, que não volta; não há cancelamento, só encerramento terminal; o ano passa a vir do fuso do município na F02-E09 (REL:09 2) | F00, F02, F16 | V2-F00-E18, V2-F02-E09, V2-F16-E15 | G00, G02, G16 | - | fluxo.e2e.mjs verde; ano pelo fuso do município; relato nunca consome protocolo oficial |
| ALY | ALY:RN-03 | PARCIAL (sem prioridade). Bytes confirmados não se trocam e evidência não tem DELETE; faltam documento aprovado, sha256 reverificado na emissão e UPDATE negado (REL:09 2) | F06, F09 | V2-F06-E08, V2-F06-E11, V2-F09-E07 | G06, G09 | - | hash reverificado na emissão; UPDATE em evidencias negado ao papel da aplicação |
| ALY | ALY:RN-04 | PARCIAL (sem prioridade). A vistoria guarda coordenada, precisão, data e autoria; a coordenada da ocorrência não guarda origem nem precisão (REL:09 2) | F10, F19 | V2-F19-E02, V2-F10-E26 | G10, G19 | - | coordenada_origem gravada e impressa no laudo; precisão da coordenada com teto (L14) |
| ALY | ALY:RN-05 | PARCIAL (sem prioridade). Motivo e responsável existem; a verificação das providências só avisa e não há providência obrigatória, só interdição ativa bloqueia (REL:05) | F10 | V2-F10-E13 | G10 | CP-17 | regra decidida em CP-17 aplicada ao encerramento: avisar, justificar ou bloquear |
| ALY | ALY:RN-06 | PARCIAL (sem prioridade). Idempotência, 409 de autor divergente e vigente igual à última recebida existem; falta fila de revisão humana (CMP-56, REL:03) | F14 | V2-F14-E03 | G14 | - | seção Precisa de decisão na fila; descarte com motivo gravado na trilha |
| ALY | ALY:RN-07 | ATENDIDO (sem prioridade). MANTER. Exportação completa exige posto e justificativa, colunas de pessoa ficam fora da lista e não há painel público (REL:09 2) | F05, F10 | V2-F05-E05, V2-F10-E08 | G05, G10 | - | manifesto classifica colunas pessoais; saída e CSV completo não as carregam |
| ALY | ALY:RN-08 | FASE FUTURA (sem prioridade), agora na V2 (PR:D-15). Agrupar em incidente não altera autoria, datas, documentos nem histórico da ocorrência; a ocorrência segue individual e auditável (REL:09 L2) | F29 | V2-F29-E04 | G29 | - | hash da ocorrência, da trilha e dos documentos idêntico antes e depois de agrupar |
| ALY | ALY:RN-09 | FASE FUTURA (sem prioridade), agora na V2 (PR:D-15). Saldo de estoque é a soma de movimentos e ajuste exige motivo e aprovação; depende do módulo de logística (REL:09 L2) | F30 | V2-F30-E04, V2-F30-E06 | G30 | CP-67 | não existe coluna de saldo; banco recusa ajuste sem aprovação |
| ALY | ALY:RN-10 | AUSENTE (sem prioridade). Não há configuração versionável e o modelo é código; CFG-01 entra na F33 (REL:09 2) | F33 | V2-F33-E01, V2-F33-E02, V2-F33-E04 | G33 | CP-88 | versão imutável por município; publicação sem quebrar ocorrência em andamento |

### Requisitos do Alyson: RNF (requisitos não funcionais)

Itens desta tabela: 15.

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ALY | ALY:RNF-01 | NÃO CONFIRMADO (MVP). Meta de 99,5% mensal sem medição: só a sonda /saude do Fly, sem histórico, janela pactuada nem SLO (OPS-16, REL:10) | F01, F21, F28 | V2-F01-E14, V2-F21-E04, V2-F21-E13, V2-F21-E14, V2-F28-E05 | G01, G21, G28 | CP-31 | série externa de 30 dias; SLO por rota crítica com alerta; nível de serviço só com números medidos |
| ALY | ALY:RNF-02 | NÃO CONFIRMADO (MVP). Sem tempo de resposta por rota; carga.test.ts em PGlite não mede desempenho; falta p95 contra Postgres real (REL:02) | F21, F24 | V2-F21-E09, V2-F24-E01, V2-F24-E02 | G21, G24 | - | p95 por rota em HML sob carga; meta 95% em até 2 s |
| ALY | ALY:RNF-03 | ATENDIDO (MVP). MANTER. Fila visível e retomada foto a foto, por arquivo; a sincronização sob concorrência passa a ser medida (CMP, REL:03) | F14, F24 | V2-F14-E12, V2-F24-E08 | G14, G24 | - | vistoria sincroniza sem perda nem duplicação em aparelho físico; carga medida |
| ALY | ALY:RNF-04 | ATENDIDO (MVP). MANTER. scrypt, verify-full em produção, helmet, limite de taxa e Zod nas rotas; a V2 só acrescenta a varredura completa (SEC, REL:06) | F00, F25 | V2-F00-E19, V2-F25-E01 | G00, G25 | - | npm audit em zero; SAST, SCA e segredos tratados |
| ALY | ALY:RNF-05 | PARCIAL (MVP). Append-only e pesquisa da trilha existem; falta política de retenção e destino do log por organização (OPS-32, REL:10) | F05, F21 | V2-F21-E08, V2-F05-E09 | G05, G21 | CP-06, CP-10 | destino, país e prazo do log documentados; retenção por classe em modo relatar |
| ALY | ALY:RNF-06 | NÃO CONFIRMADO (MVP). Restore só documentado, sem backup agendado nem RPO e RTO medidos (hipótese 24 h e 8 h) (OPS-13, REL:10) | F00, F22 | V2-F00-E25, V2-F22-E03, V2-F22-E07 | G00, G22 | CP-31, CP-37 | restore registrado em máquina limpa e em HML; RPO e RTO medidos |
| ALY | ALY:RNF-07 | NÃO CONFIRMADO (MVP). Limitador de taxa e falhas de login em memória, Chromium no processo, uma máquina; sem teste com duas instâncias; a API de servidores ganha cotas persistentes na F03-E19 (L13) (REL:02) | F03, F07, F15 | V2-F03-E19, V2-F07-E03, V2-F07-E05, V2-F07-E12, V2-F15-E10 | G03, G07, G15 | - | relógios e PDF fora da API; cotas no banco; duas máquinas de worker testadas |
| ALY | ALY:RNF-08 | PARCIAL (MVP). Sem miniatura, compressão configurável, retomada por byte e retenção de mídia por organização; a V2 cobre miniatura de anexo, retomada por parte, compressão no aparelho e retenção por classe (REL:08) | F05, F06 | V2-F06-E07, V2-F06-E21 a V2-F06-E23, V2-F05-E09 | G05, G06 | CP-10 | miniatura no anexo ativo; envio retomável; classe de retenção da mídia no manifesto |
| ALY | ALY:RNF-09 | PARCIAL (MVP). Portões estáticos de contraste e teclado, sem axe nem leitor de tela; WCAG 2.1 AA é coberto por WCAG 2.2 AA na F23 (A11, REL:11) | F23 | V2-F23-E01, V2-F23-E03 | G23 | CP-32 | axe sem violação; VoiceOver, TalkBack e NVDA com roteiro preenchido |
| ALY | ALY:RNF-10 | PARCIAL (MVP). Painel roda em Chromium e Firefox por E2E (manter em F00-E18); painel e portal ficam instaláveis na tela inicial, sem offline (PR:D-22), e o app móvel é nativo (REL:09 2) | F00, F10, F11, F23 | V2-F00-E18, V2-F10-E15, V2-F11-E26, V2-F23-E09 | G00, G10, G11, G23 | - | E2E em Chromium e Firefox; instalação acessível; service worker sem cache de dado |
| ALY | ALY:RNF-11 | PARCIAL (MVP). Logs pino com redact e /saude existem; sem alerta de erro, sem latência por rota e sem rastreio de jobs (OPS-50, REL:10) | F01, F21 | V2-F01-E14, V2-F21-E01, V2-F21-E09 | G01, G21 | CP-06 | erro centralizado com alerta; percentis por rota; fila e push em /saude |
| ALY | ALY:RNF-12 | PARCIAL (MVP). Pacote ZIP com somas existe; carrega tabelas em memória, reconstrói documentos que divergem e chamava rota errada (ARQ-28, REL:02) | F00, F07, F09 | V2-F00-E11, V2-F07-E06, V2-F09-E11 | G00, G07, G09 | - | pacote baixado e legível; documento igual ao emitido; memória medida |
| ALY | ALY:RNF-13 | PARCIAL (MVP). CI, migrações e testes existem; deploy manual, sem ambiente de homologação e sem auditar nem test:campo no CI (OPS, REL:10) | F01 | V2-F01-E03, V2-F01-E11, V2-F01-E12 | G01 | CP-05 | CI roda auditar e test:campo; HML por merge e PROD por promoção |
| ALY | ALY:RNF-14 | PARCIAL (MVP). Documentos usam fuso por UF; o CSV e o ano do protocolo passam ao fuso do município na F02-E09 (REL:09 2) | F02, F09 | V2-F02-E09, V2-F09-E04 | G02, G09 | - | snapshot do documento guarda o fuso; CSV e ano do protocolo pelo fuso do município |
| ALY | ALY:RNF-15 | NÃO CONFIRMADO (Fase 3). INDISPONIBILIDADE.md existe sem simulado; falta exercício de indisponibilidade e operação degradada (OPS-20, REL:10) | F21, F27, F30 | V2-F21-E07, V2-F27-E02, V2-F30-E16 | G21, G27, G30 | CP-07 | simulado com runbook; ensaio de nível 2 em HML; ficha de contingência da logística |

### Requisitos do Alyson: CA (critérios de aceite do MVP)

Itens desta tabela: 10.

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ALY | ALY:CA-01 | PARCIAL (critério do MVP). Cadeia por rotas e testes existe; o operador do critério não classifica nem despacha, só a coordenação: critério corrigido por PR:D-24 e travado na matriz (REL:09 2) | F00, F03, F14, F26 | V2-F00-E18, V2-F03-E13, V2-F14-E12, V2-F26-E07 | G00, G03, G14, G26 | - | fluxos A e B provados, B em aparelho; operador negado em classificar e despachar |
| ALY | ALY:CA-02 | NÃO CONFIRMADO (critério do MVP). Motor coberto por testes; o cenário literal de modo avião, GPS e cinco fotos só existe por relato em iPhone (CMP, REL:03) | F14 | V2-F14-E12 | G14 | - | Android e iOS físicos: avião, GPS e cinco fotos sem perda nem duplicação |
| ALY | ALY:CA-03 | PARCIAL (critério do MVP). PDF com protocolo, respostas, evidências, autoria e data existe; falta versão e a marca d'água de validação segue em produção (DOC-01, REL:09) | F09 | V2-F09-E04, V2-F09-E10 | G09 | CP-14 | fluxo I: PDF guardado com versão e hash; reimpressão idêntica |
| ALY | ALY:CA-04 | PARCIAL (critério do MVP). Providência atribuída, respondida e atrasada no painel; falta notificada (e-mail desligado) e comprovada (sem anexo) (REL:05) | F11, F12 | V2-F11-E13, V2-F11-E17, V2-F11-E22, V2-F12-E02 | G11, G12 | CP-19 | fluxos C e D em HML sintético (G11) e com secretaria real (G12) |
| ALY | ALY:CA-05 | PARCIAL (critério do MVP). Regra previsível existe (idempotência, vigente igual à última recebida, 409 de autor); falta fila de revisão da coordenação (REL:03) | F14 | V2-F14-E03, V2-F14-E12 | G14 | - | tela de revisão sem descarte silencioso; prova em aparelho físico |
| ALY | ALY:CA-06 | ATENDIDO (critério do MVP). MANTER. db/test/isolamento.test.ts descobre as tabelas pelo catálogo e prova que um município não acessa o outro (REL:09 2) | F00, F25, F29, F30, F32 | V2-F00-E01, V2-F25-E04, V2-F25-E20, V2-F29-E17, V2-F30-E17, V2-F32-E16 | G00, G25, G29, G30, G32 | - | test:isolamento verde em todo gate; cruzamento ampliado em G25 e nos módulos novos |
| ALY | ALY:CA-07 | PARCIAL (critério do MVP). Criação, status, exportação e consulta de dossiê são rastreáveis; faltam aprovação e as lacunas de AUD-01 (REL:09 2) | F05, F09 | V2-F05-E11, V2-F09-E07 | G05, G09 | - | consulta nominal gravada; aprovação autenticada com MFA; fluxo I no POC |
| ALY | ALY:CA-08 | NÃO CONFIRMADO (critério do MVP). Restore só documentado, sem registro repetido nem script; falta restaurar backup de teste com procedimento escrito (REL:10) | F00, F22 | V2-F00-E25, V2-F22-E03 | G00, G22 | - | restore das 46 migrações em máquina limpa e restore automatizado em HML |
| ALY | ALY:CA-09 | NÃO CONFIRMADO (critério do MVP). Exige agentes reais do piloto concluindo o roteiro principal sem assistência constante (REL:09 2) | F27 | V2-F27-E04, V2-F27-E06 | G27 | CP-34 | taxa de conclusão do roteiro registrada; desvio explicado no relatório do piloto |
| ALY | ALY:CA-10 | PARCIAL (critério do MVP). Pacote ZIP com LEIA-ME, índice, esquema e somas (18 de 19 testes); falta memória segura e o PDF emitido no pacote (RNF-12, REL:09) | F00, F09, F28 | V2-F00-E11, V2-F09-E11, V2-F28-E10 | G00, G09, G28 | - | pacote legível; PDF igual ao emitido; município de ensaio exportado em G28 |

### Requisitos novos da V2: V2-SEC (portal das secretarias e órgãos)

Itens desta tabela: 12.

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BZ-M | V2-SEC-01 | AUSENTE. Usuários próprios por secretaria, com vínculo usuário x órgão (um ou vários); hoje usuarios não tem órgão e o papel é enum de 4 valores (REL:05, REL:06) | F03, F10 | V2-F03-E04, V2-F03-E05, V2-F03-E15, V2-F10-E03 | G03, G10 | - | usuario_orgao e orgao_vinculos temporais com RLS; gestão de vínculos no painel |
| BZ-M | V2-SEC-02 | AUSENTE. Competência do órgão (o que recebe, vê e responde) como dado por COBRADE e território; sugere e valida o destino que a Defesa Civil escolhe (PR:D-18) (REL:05) | F04, F10, F11, F32 | V2-F04-E15, V2-F10-E17, V2-F10-E19, V2-F11-E28, V2-F32-E10 | G04, G10, G11, G32 | CP-53 | competência sugere destino; sem cadastro a lista é vazia; transferência direta entre secretarias segue fora |
| BZ-M | V2-SEC-03 | AUSENTE. Recebimento do encaminhamento e aceite nominal por usuário autorizado; hoje a resposta é digitada pela Defesa Civil e não há aceite (REL:05) | F10, F11 | V2-F10-E04, V2-F11-E11 | G10, G11 | CP-20 | aceite nominal gravado com usuário e instante; fluxo C em HML |
| BZ-M | V2-SEC-04 | AUSENTE. Devolução com motivo e destino sugerido antes do aceite, escalonamento ao gestor e acima dele por município; transferência direta entre secretarias segue fora (item 25) (REL:05) | F04, F10, F11 | V2-F11-E15, V2-F10-E05, V2-F10-E06, V2-F04-E16, V2-F10-E18, V2-F04-E17 | G04, G10, G11 | CP-21, CP-53 | devolução com motivo e destino sugerido; reencaminhar em um clique; cobrar e escalar pela cadeia do município |
| BZ-M | V2-SEC-05 | PARCIAL. Prazo acompanhado por responsável nominal; existe prazo na providência, sem responsável do lado do órgão; o prazo pausa em aguardando_dc (REL:05) | F04, F11 | V2-F11-E12, V2-F04-E10 | G04, G11 | CP-21 | selo de prazo com ícone e texto; pausa e retomada em relógio simulado |
| BZ-M | V2-SEC-06 | AUSENTE. Evidências anexadas pelo próprio órgão; hoje evidencias exige ocorrência e agente; a V2 usa a cadeia segura de arquivos para a resposta da secretaria (REL:05, REL:08) | F06, F11 | V2-F11-E13, V2-F06-E05 | G06, G11 | CP-12, CP-13 | anexo da secretaria validado por bytes, em quarentena até ativo; cota por classe |
| BZ-M | V2-SEC-07 | AUSENTE. Pedido de complemento, aceite da resposta pela Defesa Civil e reinspeção; providencia_pendente só ia para encerrada e a V2 acrescenta a volta (REL:03, REL:05) | F10, F13 | V2-F10-E05, V2-F13-E03, V2-F13-E04 | G10, G13 | CP-23 | fluxo E: resposta, reinspeção e agente em HML |
| BZ-M | V2-SEC-08 | PARCIAL. Autorização na API, banco, arquivos, busca, documentos, notificações, exportações e eventos, não só menus; hoje há isolamento por município e nenhuma dimensão de órgão (REL:06) | F03, F04 | V2-F04-E05, V2-F04-E09, V2-F03-E12 | G03, G04 | - | RLS por órgão fail-closed; teste Obras x Saúde; busca e exportação do próprio órgão |
| BZ-M | V2-SEC-09 | NÃO CONFIRMADO. Cenários negativos garantidos: Obras x Saúde, ID trocado, URL de arquivo, usuário desativado, encaminhamento encerrado, usuário movido e item não atribuído (REL:05, REL:06) | F04, F25 | V2-F04-E13, V2-F25-E05 | G04, G25 | - | suíte negativa por cenário verde; cruzamento de órgão repetido no pré-piloto |
| BZ-M | V2-SEC-10 | PARCIAL. Histórico completo e auditável do fluxo do órgão; a trilha existe para a ocorrência, mas abrir o documento do ofício não registra consulta (REL:05) | F04, F05, F11 | V2-F04-E03, V2-F05-E11, V2-F11-E16 | G04, G05, G11 | - | eventos append-only do encaminhamento; histórico sem vazamento; consulta nominal do ofício |
| BZ-M | V2-SEC-11 | AUSENTE. Provisionamento de secretarias e de seus usuários (quem cadastra), com MFA e recuperação; console e painel não conhecem órgão como usuário (REL:04, REL:05) | F03, F10 | V2-F03-E10, V2-F03-E11, V2-F10-E02, V2-F10-E03 | G03, G10 | CP-08 | convite de uso único; MFA obrigatório; gestor cadastra e desativa usuário do órgão |
| BZ-M | V2-SEC-12 | AUSENTE. Órgãos externos ao município (concessionárias, órgão estadual) como participantes, com pessoa global, vínculo por município e escolha do município ao entrar (PR:D-08) (REL:05) | F03, F10, F11, F12 | V2-F03-E15, V2-F03-E16, V2-F03-E17, V2-F03-E18, V2-F10-E02, V2-F11-E23, V2-F11-E24, V2-F11-E25, V2-F12-E08 | G03, G10, G11, G12 | CP-51, CP-51, CP-49 | órgão externo em dois municípios entra e vê só o município escolhido; cruzamento negado |

### Requisitos novos da V2: V2-CID (app do cidadão)

Itens desta tabela: 11.

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BZ-M | V2-CID-01 | AUSENTE. Aplicativo novo do cidadão com bundle, ficha de loja e permissões próprios; nenhum código existe (REL:07) | F17 | V2-F17-E01, V2-F17-E02, V2-F17-E17 | G17 | CP-04 | apps/cidadao com ADR 0017, build interno e bundle id próprio |
| BZ-M | V2-CID-02 | AUSENTE. Realm de identidade e autorização do cidadão separado do servidor; hoje usuarios, Papel e a audiência dc360 servem só ao servidor (REL:06, REL:07) | F15 | V2-F15-E01, V2-F15-E03, V2-F15-E06 | G15 | CP-25 | audiência dc360-cidadao com teste de plateia; RLS só o meu; ADR 0015 |
| BZ-M | V2-CID-03 | AUSENTE. Relato como entidade própria, com protocolo próprio, separado da ocorrência; o modelo atual não comporta (canal_entrada fechado, solicitante_nome obrigatório) (REL:07) | F16 | V2-F16-E01, V2-F16-E02, V2-F16-E03 | G16 | - | tabelas de relato com protocolo distinto; relato fora de métrica, laudo e protocolo oficial |
| BZ-M | V2-CID-04 | AUSENTE. Triagem da Defesa Civil: rejeitar, pedir complemento, marcar duplicidade, classificar e converter; a fila existe só para ocorrência (REL:07) | F18 | V2-F18-E01, V2-F18-E03, V2-F18-E04, V2-F18-E05, V2-F18-E06 | G18 | - | caixa de triagem com as cinco ações e estados; fluxo F no POC |
| BZ-M | V2-CID-05 | AUSENTE. Conversão preserva o vínculo com o relato original; hoje vinculada_a liga só ocorrência a ocorrência e só no INSERT (REL:07) | F16, F18 | V2-F16-E10, V2-F18-E07 | G16, G18 | - | relato_origem_id gravado; protocolo oficial só na conversão |
| BZ-M | V2-CID-06 | AUSENTE. Acompanhamento pelo cidadão sem expor notas internas nem dado sensível; a leitura atual é SELECT o.* com lista de exclusão (REL:07) | F16, F17 | V2-F16-E09, V2-F17-E10 | G16, G17 | - | leitura por lista de inclusão; teste de contrato reprova coluna nova no payload |
| BZ-M | V2-CID-07 | AUSENTE. Anexos do cidadão com validação, antivírus, remoção de EXIF e limite; foto e vídeo de até 30 s entram por PR:D-07; antivírus só no PDF do órgão (REL:08) | F06, F16, F17, F34 | V2-F16-E12, V2-F06-E07, V2-F06-E18 a V2-F06-E20, V2-F17-E07, V2-F34-E03, V2-F34-E04 | G06, G16, G17, G34 | CP-13, CP-47 | foto e vídeo validados por bytes e sem metadados de GPS; cota por classe de origem |
| BZ-M | V2-CID-08 | AUSENTE. Anti-abuso: limite de taxa, bloqueio, moderação, spam e denúncia falsa; CAPTCHA e atestação de app só com abuso observado (21-fora-da-v2 itens 22 e 23) (REL:07) | F15, F18, F34 | V2-F15-E09, V2-F15-E10, V2-F15-E11, V2-F18-E09, V2-F34-E11 | G15, G18, G34 | CP-26, CP-27 | limite em duas camadas, bloqueio manual imediato e moderação com motivo |
| BZ-M | V2-CID-09 | AUSENTE. Município do relato sem token: a geografia decide o município, o que conflita com organização vinda do token; a V2 usa o código IBGE e o polígono municipal no PostGIS (REL:07) | F15, F16, F32 | V2-F16-E05, V2-F15-E13, V2-F32-E03 | G15, G16, G32 | CP-28, CP-85 | município resolvido por polígono; candidatos na divisa; canal habilitado por município |
| BZ-M | V2-CID-10 | AUSENTE. Push ao cidadão com aparelho sem usuário e mais de um bundle APNs; hoje depende de usuarios, de um bundle e de um projeto FCM (REL:07) | F14, F17 | V2-F17-E13, V2-F14-E05 | G14, G17 | CP-04 | aparelho do cidadão sem usuário recebe push de teste em dois bundles |
| BZ-M | V2-CID-11 | NÃO CONFIRMADO. Contas nas lojas, ficha, rótulos de privacidade, homologação e builds assinados; EAS sem build comprovado e eas.json com placeholders (REL:10) | F17, F28 | V2-F17-E17, V2-F28-E07 | G17, G28 | CP-04 | build interno em TestFlight e teste interno do Google Play; fichas e rótulos conferidos |

### Requisitos novos da V2: V2-TRV (transversais)

Itens desta tabela: 10.

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BZ-M | V2-TRV-01 | AUSENTE. Política de privacidade publicada, termos com versão, aceite, consentimento e revogação; a V2 entrega o mecanismo e o texto depende do parecer (REL:08) | F05, F28 | V2-F05-E06, V2-F05-E07, V2-F28-E03 | G05, G28 | CP-11 | versão publicada em URL estável; aceite e revogação gravados; texto jurídico fora do código |
| BZ-M | V2-TRV-02 | AUSENTE. Direitos do titular (acesso, correção, eliminação, portabilidade do cidadão); hoje não há fila nem exportação por titular (REL:08) | F05, F17, F20 | V2-F05-E08, V2-F17-E19, V2-F20-E09 | G05, G17, G20 | CP-11 | pedido de titular com estados e exportação por titular; fluxo no app |
| BZ-M | V2-TRV-03 | PARCIAL. Retenção de relato, de documento emitido e de dado de usuário de secretaria; hoje a minimização por prazo existe só para ocorrência encerrada (REL:08) | F05, F09, F16 | V2-F05-E09, V2-F09-E12, V2-F16-E14 | G05, G09, G16 | CP-10 | retenção por município e classe, padrão vazio; jobs em modo relatar até o CP-10 |
| BZ-M | V2-TRV-04 | PARCIAL. MFA por papel, recuperação, revogação e desativação sem apagar histórico; hoje MFA só do administrador e do console, atrás de flag, e recuperação desligada em produção (REL:06) | F00, F03, F10 | V2-F03-E11, V2-F00-E07, V2-F00-E10, V2-F10-E03 | G00, G03, G10 | CP-08, CP-19 | MFA obrigatório nos três papéis; sessão revogada com papel alterado; recuperação testada |
| BZ-M | V2-TRV-05 | PARCIAL. Religar e provar a vigência de conta, papel e sessão na escrita e na leitura; hoje desligada de propósito e o teste está em skip (BAS-21, REL:02) | F00, F03 | V2-F00-E04, V2-F03-E03 | G00, G03 | - | conta desativada não escreve nem lê; zero skip em vigência; custo da consulta medido |
| BZ-M | V2-TRV-06 | AUSENTE. Ambientes de homologação, CD, monitoramento, erro centralizado e página de status; hoje o deploy é manual e não há HML (REL:10) | F01, F21 | V2-F01-E11, V2-F01-E12, V2-F01-E14, V2-F21-E05 | G01, G21 | CP-05, CP-06 | HML com dados sintéticos; deploy por merge; erro centralizado; página de status |
| BZ-M | V2-TRV-07 | AUSENTE. Documento como fluxo quando secretarias emitirem ou aprovarem: versão, hash, responsável técnico e aprovação; a V2 usa APROVAÇÃO AUTENTICADA (REL:09) | F09 | V2-F09-E06, V2-F09-E07, V2-F09-E08 | G09 | CP-14 | estados, aprovação com MFA, hash e versão do template; política por município e tipo |
| BZ-M | V2-TRV-08 | AUSENTE. Console passa a provisionar secretarias e acompanhar uso dos novos canais; na V2 a prefeitura provisiona órgãos e usuários e o console só acompanha uso (REL:04) | F10, F20 | V2-F10-E02, V2-F10-E03, V2-F20-E07 | G10, G20 | - | gestão de órgãos no painel; métricas agregadas do portal e do cidadão no console |
| BZ-M | V2-TRV-09 | AUSENTE. Acessibilidade para público amplo no app do cidadão (idosos, pessoas com deficiência), com validação humana; hoje só há portões automatizados (A11, REL:11) | F17, F23 | V2-F17-E15, V2-F23-E03, V2-F23-E05 | G17, G23 | CP-32, CP-38 | VoiceOver e TalkBack em aparelho físico; teste com pessoa com deficiência, se viável |
| BZ-M | V2-TRV-10 | AUSENTE. Teste de contrato entre cliente e rotas, contra 404 de caminho como o do pacote de saída; hoje nenhum teste liga caminho do cliente à rota (REL:02) | F00, F02 | V2-F00-E23, V2-F02-E05 | G00, G02 | - | caminhos de dados/http.ts conferidos contra as rotas registradas no CI |

### Requisitos do Alyson: integrações e fluxos novos (§4.1, §5.2, §5.3, §12 e §13)

Itens desta tabela: 8.

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ALY | ALY:§5.2 | Fluxo de ativação de emergência: incidente, ocorrências agrupadas, equipes, presença, abrigo e relatório de situação (Fluxo O) | F29 | V2-F29-E18 | G29 | CP-62 | E2E ponta a ponta e prova em aparelho físico |
| ALY | ALY:§5.3 | Fluxo de suprimentos humanitários: estoque, doação, necessidade, carga, entrega com prova e ajuste aprovado (Fluxo P) | F30 | V2-F30-E18 | G30 | CP-66 | E2E ponta a ponta e prova em aparelho físico |
| ALY | ALY:§12.1 (WhatsApp) | Integração com WhatsApp oficial: consentimento, telefone cifrado, modelos aprovados, estado de entrega e recebimento verificado | F31 | V2-F31-E07 a V2-F31-E10 | G31 | CP-78, CP-79 | adaptadores de teste verdes; envio real só com provedor contratado |
| ALY | ALY:§12.1 (camadas GIS) | Camadas GIS por GeoJSON, KML e WMS no mapa do painel, com legenda e atribuição | F31 | V2-F31-E11 a V2-F31-E13 | G31 | CP-80 | camada ligável com lista alternativa; WMS real só com licença |
| ALY | ALY:§12.1 (S2ID e SEI) | Adaptadores de S2ID e SEI com porta, registro canônico e sandbox simulado; ativação só com credenciamento | F31 | V2-F31-E15, V2-F31-E16 | G31 | CP-82, CP-83 | sandbox simulado verde; sem promessa de integração real |
| ALY | ALY:§4.1 (Cemaden e alerta) | Dados do Cemaden a confirmar e adaptador do Defesa Civil Alerta com aprovação por segunda pessoa; sirenes, sensores e previsão seguem fora (item 28) | F31 | V2-F31-E14, V2-F31-E17, 21-fora-da-v2 item 28 | G31 | CP-81, CP-84 | exibição com origem e hora; alerta simulado exige segunda pessoa |
| ALY | ALY:§12.2 | Arquitetura de integração por portas e adaptadores, com configuração por município, trilha de toda chamada, fila e webhook assinado | F31 | V2-F31-E01 a V2-F31-E06, V2-F31-E18, V2-F31-E20 | G31 | CP-77 | suíte de contrato, falha injetada e varredura de segredo |
| ALY | ALY:§13 (integrações) | LGPD das integrações: inventário, subprocessadores, manifesto de dados e consentimento do WhatsApp | F31 | V2-F31-E08, V2-F31-E19 | G31 | CP-06, CP-11 | teste de documentação e manifesto das tabelas de integração |

### Lacunas do MVP do Alyson (L1 a L26, resolvidas por PR:D-20)

Itens desta tabela: 26. Lista de `21-fora-da-v2.md` (seção "Lacunas do MVP do Alyson que a V2 não fecha"); CP-40 foi decidido por PR:D-20 e cada lacuna tem etapa.

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ALY | L1 | ALY:GEO-01 (M): mapa sem filtros por tipo, estado e severidade e lista sem filtro por tipo (GAP-P1P-40) | F10 | V2-F10-E23 | G10 | - | filtros na URL com total honesto; recorte do agente intacto |
| ALY | L2 | ALY:OCO-02 (M): o operador não anexa arquivo à ocorrência no painel | F06, F10 | V2-F06-E17, V2-F10-E29 | G06, G10 | - | anexo da prefeitura pela cadeia segura; fora do laudo sem inclusão |
| ALY | L3 | ALY:OCO-04 (S): duplicidade manual só por tipo, endereço e 48 horas; sem coordenada, contato e janela configurável | F10 | V2-F10-E24 | G10 | - | duplicidade por coordenada, contato e janela; LIKE escapado |
| ALY | L4 | ALY:OCO-05 (M): sem entidade imóvel nem histórico territorial | F32 | V2-F32-E07, V2-F32-E09 | G32 | CP-87 | imóvel vinculado sem mesclar registros; consulta por imóvel e área |
| ALY | L5 | ALY:OCO-01, ALY:RN-02, ALY:RNF-14 (M): ano do protocolo e fuso do CSV pelo relógio do processo | F02 | V2-F02-E09 | G02 | - | ano do protocolo e datas do CSV pelo fuso do município |
| ALY | L6 | ALY:VIS-04, ALY:RNF-08 (M): compressão configurável, upload retomável por byte e antivírus de foto de vistoria | F06, F14 | V2-F06-E21 a V2-F06-E23, V2-F14-E22 | G06, G14 | CP-48 | envio retomável; foto de vistoria provadamente intacta; antivírus sem recodificar |
| ALY | L7 | ALY:VIS-08 (M): aditamento avulso de vistoria com justificativa versionada, sem reinspeção | F14 | V2-F14-E19 | G14 | - | aditamento versionado com justificativa; evidência original intacta |
| ALY | L8 | ALY:DOC-02 (M): notificação, relatório fotográfico avulso e modelos por organização e tipo | F09, F10 | V2-F09-E16 a V2-F09-E18, V2-F10-E33, V2-F10-E36 | G09, G10 | CP-42 | habilitação por município e tipo; modelos versionados no snapshot |
| ALY | L9 | ALY:FLU-01 (M): prioridade da providência | F04, F10 | V2-F04-E14, V2-F10-E20 | G04, G10 | - | prioridade com ordenação e filtro na caixa do órgão |
| ALY | L10 | ALY:REL-01 (M): relatório em PDF e CSV sem cabeçalho de filtros, organização, data e responsável (GAP-P1P-38) | F02, F10 | V2-F10-E25, V2-F02-E09 | G02, G10 | - | CSV e PDF com cabeçalho completo e fuso do município |
| ALY | L11 | ALY:AUD-01, ALY:AUT-02 (M): login, saída e falha fora da trilha; sem consulta à própria trilha; sem IP e agente (GAP-P1O-33, GAP-DEF-02) | F03, F10 | V2-F03-E20, V2-F10-E30 | G03, G10 | - | eventos de sessão na trilha com IP e agente; consulta própria |
| ALY | L12 | ALY:AUT-03 (M): controle por perfil e unidade sem nível de sigilo | F03, F10 | V2-F03-E21, V2-F10-E31 | G03, G10 | CP-52, CP-52 | sigilo aplicado no banco e na tela; unidade segue fora (item 26) |
| ALY | L13 | ALY:RNF-07 (M): limitador de taxa e falhas de login da API de servidores em memória por processo | F03, F15 | V2-F03-E19, V2-F15-E10 | G03, G15 | - | cotas persistentes entre instâncias na API de servidores |
| ALY | L14 | ALY:RN-04 (M): a precisão da coordenada da ocorrência não é guardada | F10 | V2-F10-E26 | G10 | - | precisão gravada com teto e impressa no laudo |
| ALY | L15 | ALY:CA-01 (M): o critério diz que o operador classifica e despacha, mas só a coordenação o faz (divergência M4) | F03 | V2-F03-E13 | G03 | - | critério corrigido por PR:D-24; matriz nega ao operador; sem etapa dedicada |
| ALY | L16 | ALY:VIS-05 (M): checklist único para todos os tipos, sem perguntas condicionais | F33 | V2-F33-E05 a V2-F33-E08 | G33 | CP-89 | checklist por tipo avaliado offline com a versão respondida |
| REL | L17 | GAP-P1O-19 (CMP-12): agente sem equipe perde o histórico | F14 | V2-F14-E17 | G14 | - | histórico e mensagem em vez de tela vazia |
| REL | L18 | GAP-P1O-07 (REL:05): motivo mínimo do encerramento de apenas 1 caractere | F10 | V2-F10-E27 | G10 | CP-55 | motivo mínimo e lista de motivos no shared e no banco |
| REL | L19 | GAP-P1O-42, GAP-P1O-43 (LGP-43): aparelho revogado só classificado, sem expurgo | F05, F15 | V2-F05-E15, V2-F15-E17 | G05, G15 | CP-10 | expurgo de aparelho revogado em modo relatar e depois executar |
| REL | L20 | GAP-P1P-11 (CON-52): a prefeitura não lê a trilha dos atos do fornecedor | F20 | V2-F20-E16 | G20 | - | prefeitura lê os atos do fornecedor na própria trilha |
| REL | L21 | GAP-P1P-32 (UPL-04): cenário de teste do upload de agente de outra equipe | F03 | V2-F03-E14 | G03 | - | upload de agente de outra equipe negado em teste |
| REL | L22 | GAP-P1P-04 (PRF-24): edição dos dados do chamado depois do registro | F10 | V2-F10-E28 | G10 | - | edição com motivo e histórico |
| REL | L23 | GAP-P1P-09, GAP-P1P-43 (CMP-64, CMP-80, CMP-58, REQ-021): aditamento por texto, mapa offline e fila de revisão do coordenador | F14 | V2-F14-E19, V2-F14-E20, V2-F14-E21 | G14 | CP-58 | aditamento versionado; fila de revisão; mapa offline da área |
| REL | L24 | GAP-P1P-13 (CON-54): livro de eliminações no console | F20 | V2-F20-E17 | G20 | - | livro de eliminações e município eliminado na lista do console |
| REL | L25 | GAP-DEF-09 (CMP-44): foto e assinatura obrigatórias só no cliente | F14 | V2-F14-E18 | G14 | - | servidor e shared validam sem destruir coleta offline |
| REL | L26 | GAP-DEF-10 (CMP-04): segundo fator do agente sem tela de código no app | F14 | V2-F14-E16 | G14 | CP-57 | tela de código no app; ativação opcional |

### Itens de 21-fora-da-v2.md (1 a 44) e o destino de cada um

Itens desta tabela: 44. Os itens retomados por PR:D-07 a PR:D-19 apontam para a etapa; os que continuam fora (3, 22, 23, 26 a 30, 32, 34, 35 e as partes marcadas) mantêm o gatilho de reavaliação.

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FV2 | item 1 | Multi-município para órgão externo autenticado: retomado por PR:D-08 com pessoa global e vínculos por município | F03, F11, F12 | V2-F03-E15 a V2-F03-E18, V2-F11-E24, V2-F11-E25, V2-F12-E08 | G03, G11, G12 | CP-51, CP-51 | órgão externo em dois municípios vê só o município escolhido |
| FV2 | item 2 | Entidade Pessoa global: retomada por PR:D-08, com backfill de usuarios e exceção nomeada ao isolamento | F03, F20 | V2-F03-E01, V2-F03-E02, V2-F03-E15, V2-F20-E18 | G03, G20 | CP-49 | ADR 0009 revisada; backfill sem perda; cruzamento negado |
| FV2 | item 3 | Relato anônimo: continua fora; o canal exige conta verificada | fora da V2 | 21-fora-da-v2 item 3 | - | - | taxa de abandono alta no login e abuso baixo medidos no beta e no piloto |
| FV2 | item 4 | Vídeo do cidadão: retomado por PR:D-07 (30 s, 50 MB, um por relato); vídeo de secretaria segue fora | F06, F07, F34 | V2-F06-E18 a V2-F06-E20, V2-F07-E10, V2-F07-E11, V2-F34-E03, V2-F34-E04, V2-F34-E10, V2-F34-E20 | G06, G07, G34 | CP-47 | cadeia de vídeo hostil recusada; custo medido em F24-E10 |
| FV2 | item 5 | Chat do cidadão: retomado por PR:D-07 como conversa por relato sem tempo real; tempo real continua fora (item 5) | F34 | V2-F34-E05 a V2-F34-E09, 21-fora-da-v2 item 5 | G34 | CP-94 | conversa com limites, não lidas e consulta sem temporizador |
| FV2 | item 6 | SMS: retomado por PR:D-07 no login do cidadão, com teto de custo | F34, F35 | V2-F34-E15, V2-F35-E10 | G34, G35 | CP-92 | porta de provedor e código de uso único testados |
| FV2 | item 7 | Login com gov.br: retomado por PR:D-07 (OIDC com PKCE e CPF verificado) | F15, F34 | V2-F15-E18, V2-F34-E12, V2-F34-E13, V2-F34-E14, V2-F34-E17 | G15, G34 | CP-91 | adaptador e testes verdes; ativação só com credenciamento |
| FV2 | item 8 | Login social: retomado por PR:D-07 (Google e Apple por token de identidade) | F34 | V2-F34-E12, V2-F34-E16, V2-F34-E17 | G34 | CP-93 | vínculo seguro e desvínculo testados; botões após a regra da loja |
| FV2 | item 9 | CPF do cidadão: retomado por PR:D-07; obrigatório no relato identificado, cifrado, com hash e máscara | F05, F15, F16, F17, F18, F25, F34 | V2-F05-E13, V2-F05-E14, V2-F15-E02, V2-F15-E16, V2-F16-E16, V2-F17-E20, V2-F18-E13, V2-F25-E17, V2-F34-E14 | G05, G15, G16, G17, G18, G25, G34 | CP-46 | CPF cifrado e mascarado; revelação com finalidade; CPF real só após parecer |
| FV2 | item 10 | PostGIS e consulta por raio ou área de risco: retomados por PR:D-16 | F01, F24, F32 | V2-F01-E21, V2-F01-E22, V2-F32-E01 a V2-F32-E16, V2-F24-E11 | G01, G24, G32 | CP-44 | testes espaciais em Postgres real; plano de consulta em HML |
| FV2 | item 11 | Assinatura avançada, ICP-Brasil e provedor externo: retomados por PR:D-09 atrás do parecer J8 | F09, F10, F24, F25 | V2-F09-E19 a V2-F09-E28, V2-F10-E32, V2-F10-E35, V2-F24-E13, V2-F25-E16 | G09, G10, G24, G25 | CP-14, CP-41 | provedor em memória e sandbox; assinado guardado e validado |
| FV2 | item 12 | White-label: logotipo, nome e cor de destaque por município retomados por PR:D-11; tema por secretaria continua fora (item 12) | F08, F35 | V2-F08-E10, V2-F08-E11, V2-F35-E02 a V2-F35-E08, V2-F35-E13, 21-fora-da-v2 item 12 | G08, G35 | CP-95 | contraste AA nos dois modos e no Alto Contraste |
| FV2 | item 13 | Idiomas en e es e VLibras retomados por PR:D-12; Libras em vídeo continua fora (item 13) | F08, F23, F35 | V2-F08-E08, V2-F08-E09, V2-F08-E12, V2-F35-E09 a V2-F35-E12, V2-F35-E14, V2-F23-E10, V2-F23-E11, 21-fora-da-v2 item 13 | G08, G23, G35 | CP-45, CP-73 | pendentes.json vazio; VLibras só por clique |
| FV2 | item 14 | Impersonation: a versão assistida somente leitura entra por PR:D-10; impersonation completa continua fora (item 14) | F10, F20, F25 | V2-F10-E16, V2-F20-E01, V2-F20-E11, V2-F25-E15, 21-fora-da-v2 item 14 | G10, G20, G25 | CP-30, CP-54 | leitura sem concessão negada; concessão expira; trilha no município |
| FV2 | item 15 | Tracing distribuído e SLO por rota crítica: retomados por PR:D-13 | F21, F25 | V2-F21-E10 a V2-F21-E14, V2-F25-E19 | G21, G25 | CP-60 | trace e SLO sem dado pessoal; alerta por consumo do orçamento |
| FV2 | item 16 | Integrações oficiais e WhatsApp: retomadas por PR:D-14 como portas e adaptadores; 190, 192 e 193 continuam fora (item 16) | F31 | V2-F31-E01 a V2-F31-E20, 21-fora-da-v2 item 16 | G31 | CP-78, CP-81, CP-82, CP-83, CP-84 | suíte de contrato; ativação real só por checkpoint |
| FV2 | item 17 | Abrigos, incidentes e logística humanitária e as regras RN-08 e RN-09: retomados por PR:D-15 | F29, F30 | V2-F29-E01 a V2-F29-E18, V2-F30-E01 a V2-F30-E18 | G29, G30 | CP-62, CP-63 | fluxos O e P ponta a ponta em aparelho físico |
| FV2 | item 18 | Importação de lote por CSV (ALY:OCO-08): retomada por PR:D-17 | F33 | V2-F33-E12 a V2-F33-E15 | G33 | CP-90 | prévia linha a linha; lote idempotente; desfazer por encerramento |
| FV2 | item 19 | Configuração versionada de tipos, prioridades, prazos e modelos (ALY:CFG-01, ALY:RN-10): retomada por PR:D-17 | F33 | V2-F33-E01 a V2-F33-E04, V2-F33-E09 a V2-F33-E11 | G33 | CP-88 | versão imutável; ocorrência em andamento mantém a versão aplicada |
| FV2 | item 20 | PWA instalável do painel e do portal: retomado por PR:D-22, sem offline; apps nativos seguem para campo e cidadão | F10, F11, F23 | V2-F10-E15, V2-F11-E26, V2-F23-E09 | G10, G11, G23 | - | instalação acessível; service worker sem cache de dado |
| FV2 | item 21 | Reabertura de ocorrência encerrada: retomada por PR:D-21, por 30 dias com motivo; depois só ocorrência vinculada | F13 | V2-F13-E01, V2-F13-E06, V2-F13-E09 a V2-F13-E11 | G13 | CP-23 | reabertura dentro e fora do prazo testada |
| FV2 | item 22 | Redis ou fila distribuída para limite de taxa: continua fora; valem duas camadas, borda e cotas no banco (PR:A-03) | fora da V2 | 21-fora-da-v2 item 22 | - | - | medição mostrar que as cotas no banco não bastam |
| FV2 | item 23 | Atestação de aplicativo e CAPTCHA: continua fora; só com abuso observado (CP-27) | fora da V2 | 21-fora-da-v2 item 23 | - | - | taxa de spam acima do tolerado no beta ou no piloto |
| FV2 | item 24 | Cadeia de escalonamento acima do gestor do órgão: retomada por PR:D-18, por município | F04, F10, F11, F12 | V2-F04-E16, V2-F10-E18, V2-F11-E28, V2-F12-E03 | G04, G10, G11, G12 | CP-21, CP-53 | cadeia testada em relógio simulado; eventos append-only |
| FV2 | item 25 | Competência do órgão por COBRADE ou território: retomada por PR:D-18; transferência direta entre secretarias continua fora (item 25) | F04, F10, F11, F32 | V2-F04-E15, V2-F10-E17, V2-F10-E19, V2-F11-E28, V2-F32-E10, 21-fora-da-v2 item 25 | G04, G10, G11, G32 | CP-53 | competência sugere e valida o destino escolhido pela Defesa Civil |
| FV2 | item 26 | Unidade administrativa dentro do órgão: continua fora; fica a coluna opcional em orgao_vinculos | fora da V2 | 21-fora-da-v2 item 26 | - | - | órgão grande com várias unidades |
| FV2 | item 27 | Ambiente dedicado ou instalação local: continua fora | fora da V2 | 21-fora-da-v2 item 27 | - | - | cliente pagante que justifique o custo |
| FV2 | item 28 | Previsão meteorológica própria, hardware, sensores e sirenes: continuam fora | fora da V2 | 21-fora-da-v2 item 28 | - | - | nenhum: fora do escopo do produto |
| FV2 | item 29 | Formulários configuráveis, BI e regras de SLA do MVP 2: formulários retomados por PR:D-17 (F33-E09); BI e regras de SLA continuam fora | fora da V2 | 21-fora-da-v2 item 29 | - | - | pedido do piloto por BI ou regra de SLA |
| FV2 | item 30 | Transferência de relato entre municípios: continua fora; quebraria o isolamento entre tenants | fora da V2 | 21-fora-da-v2 item 30 | - | - | nenhum |
| FV2 | item 31 | Trava contra migration concorrente e migration reversível (BZ-D:OPS-80, OPS-81): retomadas por PR:D-19 | F01, F07 | V2-F01-E18, V2-F07-E13 | G01, G07 | - | trava testada com duas migrations simultâneas; regra de reversibilidade no CI |
| FV2 | item 32 | Pacote ui-web compartilhado entre painel e portal: continua fora; o portal escreve os próprios componentes (F08-E07) | fora da V2 | 21-fora-da-v2 item 32 | - | - | duplicação medida entre painel e portal com dois consumidores reais |
| FV2 | item 33 | Lint e formatação padronizados no monorepo (BZ-D:OPS-64): retomados por PR:D-19 | F01 | V2-F01-E17 | G01 | - | ESLint e Prettier no CI com baseline que só diminui |
| FV2 | item 34 | Bloqueio de conta de cidadão com efeito em todos os municípios: continua fora; a F15-E11 bloqueia por município (confirmar com Rafael) | fora da V2 | 21-fora-da-v2 item 34 | - | - | abuso reincidente que atravesse municípios |
| FV2 | item 35 | Ferramenta de carga da geometria municipal no console: continua fora; a F32-E03 deixa só o script de carga (confirmar com Rafael) | fora da V2 | 21-fora-da-v2 item 35 | - | - | mais municípios habilitados do que o processo manual comporta |
| FV2 | item 36 | Ciclo de vida do operador do console e edição de dados da prefeitura pelo fornecedor: retomados por PR:D-19 | F20 | V2-F20-E12, V2-F20-E13 | G20 | - | operador reativado, e-mail reutilizável, dono transferido; correção cadastral com trilha |
| FV2 | item 37 | Rotinas do fornecedor que usam credencial de dono do banco: retomadas por PR:D-19 | F07, F20 | V2-F20-E15, V2-F07-E03 | G07, G20 | - | rotinas rodam sem credencial de dono; teste de privilégio |
| FV2 | item 38 | Exercício anual de recuperação de desastre de ponta a ponta: retomado por PR:D-19 | F22, F28 | V2-F22-E10, V2-F28-E16 | G22, G28 | CP-74, CP-37 | exercício registrado com executor diferente de quem escreveu o sistema |
| FV2 | item 39 | Pentest anual e revisão de segurança recorrente: retomados por PR:D-19 como rotina | F25, F28 | V2-F25-E21, V2-F28-E16 | G25, G28 | CP-74 | calendário de rotinas com dono e orçamento |
| FV2 | item 40 | Varredura de contêiner, SBOM e verificação de licenças (GAP-P1O-55): retomados por PR:D-19 | F01 | V2-F01-E19, V2-F01-E20 | G01 | CP-43 | SBOM por release; licença proibida reprova; scan de contêiner no CI |
| FV2 | item 41 | Redundância de máquinas da API e do console: retomada por PR:D-19 | F07, F22 | V2-F07-E12, V2-F07-E13, V2-F22-E11 | G07, G22 | CP-31 | duas máquinas por serviço; deploy sem indisponibilidade; failover verificado |
| FV2 | item 42 | Indicadores por órgão (GAP-P2-09): retomados por PR:D-19, sem ranking | F10 | V2-F10-E21 | G10 | CP-56 | indicador por órgão no painel da Defesa Civil, com definição aprovada |
| FV2 | item 43 | Dívida de estilo do painel (UXD-14, UXD-48): retomada por PR:D-19 | F10 | V2-F10-E22 | G10 | - | estilo inline e letter-spacing sob portão de tokens |
| FV2 | item 44 | Contrato, plano, vigência e faturamento no console (GAP-DEF-17): retomados por PR:D-19 | F20 | V2-F20-E14 | G20 | CP-61 | contrato, plano e demonstrativo no console; valor real só após o CP |

## Parte 3. Gaps do Baseline Zero (seção F) e divergências (seção N)

Totais: P0 de segurança 18, P0 de integridade 13, P0 de LGPD 8, P1 de operação 60, P1 de produto 51, P1 de continuidade 15, P2 24, a definir 51, divergências 12.

### F.P0 SEGURANÇA (GAP-P0S-01 a GAP-P0S-18)

18 itens.

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BZ-F | GAP-P0S-01 | Vigência de conta, papel e sessão desligada na escrita: conta desativada ou rebaixada segue escrevendo até 15 min e os comentários afirmam o contrário (BAS-21, BAS-22, BAS-24; REL:01) | F00, F03 | V2-F00-E04, V2-F00-E05, V2-F00-E06, V2-F00-E07, V2-F03-E03 | G00, G03 | - | teste de vigência sem skip e sonda de conta desativada negada |
| BZ-F | GAP-P0S-02 | npm audit não fecha em zero, contra a regra do CLAUDE.md (BAS-11, BAS-12; REL:01) | F00, F01 | V2-F00-E19, V2-F01-E06 | G00, G01 | CP-03 | npm run auditar verde conforme a política aprovada no CP-03 |
| BZ-F | GAP-P0S-03 | duplica GAP-P0S-01: vigência do token desligada na escrita, conta desativada e papel rebaixado seguem escrevendo, provado por sonda (G-01; REL:02) | F00, F03 | V2-F00-E04, V2-F00-E05, V2-F00-E06, V2-F00-E07, V2-F03-E03 | G00, G03 | - | teste de vigência sem skip e sonda de conta desativada negada |
| BZ-F | GAP-P0S-04 | duplica GAP-P0S-01: vigência desligada, conta desativada lê e escreve até 15 min, bloqueia qualquer papel escopado de secretaria (REL:05) | F00, F03 | V2-F00-E04, V2-F00-E05, V2-F00-E06, V2-F00-E07, V2-F03-E03 | G00, G03 | - | teste de vigência sem skip e sonda de conta desativada negada |
| BZ-F | GAP-P0S-05 | Ao menos 16 handlers de leitura de dado de negócio exigem só autenticação; GET /oficios entrega e-mail e IP a qualquer papel, inclusive agente (REL:05) | F00, F03 | V2-F00-E08, V2-F03-E12, V2-F03-E13, V2-F03-E14 | G00, G03 | - | manifesto rota x ação verde e agente sem acesso a /oficios (teste) |
| BZ-F | GAP-P0S-06 | duplica GAP-P0S-01: vigência desligada na escrita, conta desativada ou rebaixada escreve por até 15 min; comentários e testes divergem (AUT-19, IDN-10; REL:06) | F00, F03 | V2-F00-E04, V2-F00-E05, V2-F00-E06, V2-F00-E07, V2-F03-E03 | G00, G03 | - | teste de vigência sem skip e sonda de conta desativada negada |
| BZ-F | GAP-P0S-07 | Funções SECURITY DEFINER de autenticação (trocar_senha, revogar_sessoes_do_usuario, registrar_tentativa_login) não conferem o tenant do contexto (AUT-05; REL:06) | F03 | V2-F03-E08 | G03 | - | teste de catálogo: função SD com uuid de outro município falha |
| BZ-F | GAP-P0S-08 | GET /oficios e GET /oficios/:id sem recorte; GET /avisos sem recorte e com escrita em GET (AUT-12, AUT-13; REL:06) | F00, F04 | V2-F00-E08, V2-F04-E11 | G00, G04 | - | agente de campo negado em /oficios e /avisos; GET /avisos sem escrita |
| BZ-F | GAP-P0S-09 | Padrão fail-open de papel novo: 13 leituras abertas a qualquer autenticado e recorte só para agente_campo (AUT-10, AUT-11; REL:06) | F03 | V2-F03-E12, V2-F03-E13, V2-F03-E14 | G03 | - | papel novo recebe vazio ou 404 em toda leitura, matriz empírica fixa |
| BZ-F | GAP-P0S-10 | Senha inicial digitada por quem cria a conta, não provisória, sem convite nem verificação de e-mail (IDN-19; REL:06) | F03 | V2-F03-E10 | G03 | CP-05 | criação de conta só por convite de uso único; senha digitada recusada (teste) |
| BZ-F | GAP-P0S-11 | Sem realm de identidade e autorização do cidadão: reaproveitar usuarios, Papel e plateia dc360 misturaria autorização (REL:07) | F15 | V2-F15-E01, V2-F15-E02, V2-F15-E03 | G15 | CP-25 | ADR 0015 aceita e teste de plateia dc360-cidadao contra dc360 |
| BZ-F | GAP-P0S-12 | Leitura pública seria SELECT o.* com lista de exclusão e coluna nova vazaria por padrão; exige lista de inclusão e teste de contrato (REL:07) | F16 | V2-F16-E09 | G16 | - | teste de contrato do modelo de leitura do cidadão por lista de inclusão |
| BZ-F | GAP-P0S-13 | Restrição só o meu inexistente no banco; o recorte por fragmento SQL em rota já causou vazamento (REL:07) | F15, F25 | V2-F15-E06, V2-F25-E06 | G15, G25 | - | RLS cidadao_id igual a ator_id e cruzamento de cidadão negativo (teste) |
| BZ-F | GAP-P0S-14 | Anexos sem verificação de conteúdo, antivírus, limite de dimensão nem remoção de EXIF; tipo apenas declarado (REL:07) | F06 | V2-F06-E05, V2-F06-E06, V2-F06-E07, V2-F06-E16 | G06 | - | suíte de arquivos maliciosos verde (polyglot, bomba, tipo falso, EXIF) |
| BZ-F | GAP-P0S-15 | Teto de armazenamento compartilhado: upload de cidadão esgota o teto e o servidor devolve 507 à evidência de campo (REL:07) | F06 | V2-F06-E09 | G06 | CP-13 | cota por classe de origem separada; teste de esgotar a cota do cidadão |
| BZ-F | GAP-P0S-16 | Sem anti-automação e com limite em memória por IP, vulnerável a abuso em escala e a NAT móvel (REL:07) | F15, F25 | V2-F15-E09, V2-F15-E10, V2-F25-E09 | G15, G25 | CP-27 | limites em duas camadas provados; CAPTCHA só se o CP-27 aprovar |
| BZ-F | GAP-P0S-17 | duplica GAP-P0S-01: bloqueio de conta não vale dentro do token vivo, e o bloqueio de cidadão depende disso (REL:07) | F00, F03 | V2-F00-E04, V2-F00-E05, V2-F00-E06, V2-F00-E07, V2-F03-E03 | G00, G03 | - | teste de vigência sem skip e sonda de conta desativada negada |
| BZ-F | GAP-P0S-18 | duplica GAP-P0S-14: upload sem validação de conteúdo, só o tipo declarado é conferido; vira crítico quando abrir a cidadão e secretaria (REL:08 16.2) | F06 | V2-F06-E05, V2-F06-E06, V2-F06-E07, V2-F06-E16 | G06 | - | suíte de arquivos maliciosos verde (polyglot, bomba, tipo falso, EXIF) |

### F.P0 INTEGRIDADE (GAP-P0I-01 a GAP-P0I-13)

13 itens.

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BZ-F | GAP-P0I-01 | Laudo dentro do pacote de saída sem o aviso de equipe divergente (BAS-26; REL:01) | F00 | V2-F00-E12 | G00 | - | teste vermelho do pacote passa e o laudo traz o aviso de equipe |
| BZ-F | GAP-P0I-02 | Sair da conta apaga em silêncio a vistoria começada; o diálogo só conta itens da fila (CMP-52; REL:03) | F00 | V2-F00-E15 | G00 | - | diálogo de saída avisa o rascunho e o teste do Perfil passa |
| BZ-F | GAP-P0I-03 | Correções de 2026-09-15 ausentes: GPS abaixo de 0,5 m vira 0 e o servidor recusa com 422; foto vazia, teclado, câmera e ajustes (CMP-33, CMP-35, CMP-89; REL:03) | F00 | V2-F00-E15, V2-F00-E16 | G00 | - | testes da vistoria passam e GPS preciso conclui a vistoria |
| BZ-F | GAP-P0I-04 | Eliminação de município sem trava, suspende na hora, impede exportar, sem aviso ao município e com exclusão da trilha dele (CON-47 a CON-50, CON-53; REL:04) | F20, F05 | V2-F20-E04, V2-F05-E05 | G20, G05 | CP-29 | agendar eliminação não suspende; aviso ao município e exportação antes de apagar |
| BZ-F | GAP-P0I-05 | Resposta da providência sem trava no banco: UPDATE sem respondida_em IS NULL, duas respostas simultâneas sobrescrevem a primeira (REL:05) | F04 | V2-F04-E07 | G04 | - | teste de duas respostas simultâneas: o banco recusa a segunda |
| BZ-F | GAP-P0I-06 | Trilha append-only recebeu evento de conta já desativada; laudo reimpresso reflete nome e matrícula editados depois (IDN-30; REL:06) | F00, F09 | V2-F00-E04, V2-F09-E04, V2-F09-E10 | G00, G09 | - | evento de conta desativada recusado e reimpressão idêntica ao emitido (teste) |
| BZ-F | GAP-P0I-07 | Foto avulsa em evidencias entra automaticamente no laudo oficial; anexo de cidadão viraria prova no documento com brasão (REL:07) | F06 | V2-F06-E12 | G06 | - | foto avulsa não entra no laudo sem incluir_no_laudo (teste negativo) |
| BZ-F | GAP-P0I-08 | Relato gravado como ocorrência inflaria métricas e prestação de contas, queimaria o protocolo oficial e gravaria texto livre na trilha imutável (REL:07) | F16 | V2-F16-E01, V2-F16-E03, V2-F16-E11, V2-F16-E15 | G16 | - | relato não conta em métrica nem consome protocolo oficial (testes negativos) |
| BZ-F | GAP-P0I-09 | Esquema atual não representa relato: canal_entrada CHECK, solicitante_nome NOT NULL, trilha e consultas amarradas a ocorrência e a servidor (REL:07) | F16 | V2-F16-E01, V2-F16-E02 | G16 | - | ADR 0016 aceita e migrations de relatos com RLS e FKs compostas |
| BZ-F | GAP-P0I-10 | evidencias aceita UPDATE irrestrito do papel de aplicação, sem proteger sha256, chave_storage e legenda após a confirmação (UPL-18, UPL-27; REL:08) | F06 | V2-F06-E11, V2-F06-E08 | G06 | - | UPDATE de sha256 após confirmação recusado pelo banco (teste de isolamento) |
| BZ-F | GAP-P0I-11 | Documento emitido não é guardado nem tem hash do conteúdo; a reimpressão não reproduz o emitido (DOC-11, DOC-12, DOC-13, DOC-28; REL:09) | F09 | V2-F09-E03, V2-F09-E04, V2-F09-E05, V2-F09-E10 | G09 | - | laudo reimpresso amanhã idêntico ao de hoje, com hash do PDF |
| BZ-F | GAP-P0I-12 | Pacote de saída reconstrói documentos por um segundo montador, com divergências de aviso de equipe, fotos, registros, coordenada e identificador (DOC-16, DOC-17; REL:09) | F09 | V2-F09-E02, V2-F09-E11 | G09 | - | pacote usa o mesmo montador e o mesmo artefato guardado da rota |
| BZ-F | GAP-P0I-13 | sha256 das fotos não é reverificado contra o armazenamento na emissão e não entra no registro de emissão (REL:09) | F06, F09 | V2-F06-E08, V2-F09-E04 | G06, G09 | - | emissão reverifica o hash das fotos e o grava no registro |

### F.P0 LGPD (GAP-P0L-01 a GAP-P0L-08)

8 itens.

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BZ-F | GAP-P0L-01 | Abrir o documento do ofício não gera registro de consulta, ao contrário do laudo; o link público registra IP e user-agent sem identidade (REL:05) | F05, F04 | V2-F05-E11, V2-F04-E12 | G04, G05 | - | abertura de ofício gera consulta nominal e aparece na linha do tempo |
| BZ-F | GAP-P0L-02 | IP e user-agent em sessoes, recuperacoes_senha e oficio_aberturas sem expurgo e fora da política de privacidade; base legal e prazo são decisão humana (IDN-29; REL:06) | F05 | V2-F05-E12 | G05 | CP-10 | job de expurgo apaga IP e user-agent no prazo decidido no CP-10 |
| BZ-F | GAP-P0L-03 | Política de privacidade não publicada, com campos em aberto, escrita para dado ditado por operador e não para coleta direta do titular (REL:07) | F05, F15 | V2-F05-E07, V2-F15-E15 | G05, G15 | CP-11 | política versionada publicada em URL estável após o parecer do CP-11 |
| BZ-F | GAP-P0L-04 | Sem encarregado nomeado, nem canal ou função para direitos do titular (procure o município) (REL:07) | F05, F28 | V2-F05-E08, V2-F28-E03 | G05, G28 | CP-11 | fila de pedidos de titular em operação e encarregado nomeado (CP-11) |
| BZ-F | GAP-P0L-05 | Sem registro de aceite e sem tratamento de menores, em app de loja aberta que a política diz não ser dirigido a menores (REL:07) | F05, F17 | V2-F05-E06, V2-F17-E14 | G05, G17 | CP-11 | aceite versionado gravado e revogável; classificação etária conforme o CP-11 |
| BZ-F | GAP-P0L-06 | tipoDescricao (relato do solicitante, até 300 caracteres) é copiado para trilha_eventos.detalhe e nenhuma migração o minimiza (REL:08) | F05 | V2-F05-E10 | G05 | - | teste de minimização: a trilha não guarda o texto livre do relato |
| BZ-F | GAP-P0L-07 | duplica GAP-P0L-03 e GAP-P0L-04: nenhum texto de privacidade publicado, nenhum encarregado, canal ou mecanismo de direitos do titular (LGP-24 a LGP-27, LGP-32; REL:08) | F05 | V2-F05-E07, V2-F05-E08 | G05 | CP-11 | política publicada e fila de pedidos de titular em operação (CP-11) |
| BZ-F | GAP-P0L-08 | duplica GAP-P0L-01: leitura interna de ofício e de fotos de uma família não gera registro de consulta, enquanto laudo, termos e dossiê geram (DOC-30; REL:09) | F05 | V2-F05-E11 | G05 | - | leitura de ofício e de fotos gera consulta nominal na mesma transação |

### F.P1 CONTINUIDADE (GAP-P1C-01 a GAP-P1C-15)

15 itens.

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BZ-F | GAP-P1C-01 | Pacote de saída carrega a base inteira em memória numa máquina de 1 GB (BAS-27, BAS-45; REL:01) | F07, F24 | V2-F07-E06, V2-F24-E06 | G07, G24 | - | pacote de município grande gerado em streaming dentro do limite de memória |
| BZ-F | GAP-P1C-02 | Botão de saída de município chama caminho inexistente (http.ts:951), 404 provado, sem teste de contrato cliente x rota (G-02; REL:02) | F00, F02 | V2-F00-E11, V2-F00-E23, V2-F02-E05 | G00, G02 | - | teste de contrato cliente x rota verde e pacote.zip baixado da API real |
| BZ-F | GAP-P1C-03 | duplica GAP-P1C-01: pacote de saída carrega a base inteira em memória numa máquina de 1 GB; trilhas só crescem (G-03; REL:02) | F07, F24 | V2-F07-E06, V2-F24-E06 | G07, G24 | - | pacote de município grande gerado em streaming dentro do limite de memória |
| BZ-F | GAP-P1C-04 | Dono único do console, fixo, não desativável e de papel imutável; console em uma máquina e uma região, sem HA (CON-09, CON-65; REL:04) | F07, F20, F22 | V2-F20-E12, V2-F07-E12, V2-F07-E13, V2-F22-E11 | G07, G20, G22 | CP-31 | ciclo de vida do operador testado; duas máquinas por serviço; failover verificado |
| BZ-F | GAP-P1C-05 | Tentativas de envio de ofício que falharam ficam só em oficio_envios, não na trilha da ocorrência, por desenho (REL:05) | F21 | V2-F21-E03 | G21 | - | contagem de falha de envio de e-mail e alerta; trilha segue em aberto |
| BZ-F | GAP-P1C-06 | Último administrador sem telefone e sem códigos depende de SQL com credencial de dono (IDN-20, IDN-26; REL:06) | F20, F10 | V2-F20-E02, V2-F10-E01 | G20, G10 | - | reemissão de acesso do administrador pelo console, com trilha (teste) |
| BZ-F | GAP-P1C-07 | Scripts de gate e workspaces ignoram um novo app; npm audit zero não o alcança até ajuste (REL:07) | F01, F11, F17 | V2-F01-E03, V2-F11-E02, V2-F17-E01 | G01, G11, G17 | - | CI roda auditar e test:scripts e inclui apps/portal e apps/cidadao |
| BZ-F | GAP-P1C-08 | Documentação de loja, declaração de privacidade e rótulos existentes descrevem só o app do agente (REL:07) | F28 | V2-F28-E07 | G28 | CP-04 | fichas, rótulos de privacidade e política cobrem agente e cidadão |
| BZ-F | GAP-P1C-09 | Balde de fotografias fora do backup e sem procedimento escrito; retenção do backup do provedor não conferida (UPL-25, LGP-46; REL:08) | F22 | V2-F22-E02, V2-F22-E01 | G22 | CP-31, CP-06 | storage versionado com cópia fora da conta e restore documentado |
| BZ-F | GAP-P1C-10 | Pacote de saída carrega o município inteiro em memória; restore só documentado e periodicidade aberta (REQ-070, REQ-064, REQ-081; REL:09) | F07, F22 | V2-F07-E06, V2-F22-E03, V2-F22-E06 | G07, G22 | - | pacote em streaming e restore automatizado com relatório trimestral |
| BZ-F | GAP-P1C-11 | Nenhum restore refeito desde que o esquema passou de 15 para 46 migrações; o roteiro provavelmente falha em dc360_console e pg_trgm (REL:10) | F00, F22 | V2-F00-E25, V2-F22-E03 | G00, G22 | - | restore das 46 migrações em máquina limpa com saída arquivada |
| BZ-F | GAP-P1C-12 | duplica GAP-P1C-09: fotos e assinaturas sem nenhuma cópia, versionamento ou object lock; o dump exclui storage.objects (REL:10) | F22 | V2-F22-E02, V2-F22-E01 | G22 | CP-31, CP-06 | storage versionado com cópia fora da conta e restore documentado |
| BZ-F | GAP-P1C-13 | Operação de produção (cópia, migração) só roda em macOS por chaveiro de uma pessoa; fator de ônibus 1 (REL:10) | F01 | V2-F01-E15, V2-F01-E16 | G01 | CP-07 | scripts rodam em Windows, Linux e macOS e há segunda pessoa com acesso |
| BZ-F | GAP-P1C-14 | Inventário de segredos sem cofre nem cópia de guarda; SEGUNDO_FATOR_CHAVE perdida torna ilegíveis os TOTP (REL:10) | F22 | V2-F22-E08 | G22 | CP-07 | backup do cofre e recuperação provados por exercício registrado |
| BZ-F | GAP-P1C-15 | Contatos de plantão vazios, sem página de status, sem simulação de incidente (REL:10) | F21 | V2-F21-E06, V2-F21-E07, V2-F21-E05 | G21 | CP-07 | plantão e canal de alerta definidos, runbook de incidente e simulação registrada |

### Gaps P1 OPERAÇÃO da seção F do Baseline Zero (GAP-P1O-01 a GAP-P1O-60)

60 itens, ORIGEM `BZ-F`, rótulo `BZ-F:P1-OPER`.

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BZ-F | GAP-P1O-01 | BAS-23 a BAS-25 (REL:01): sem tela para redefinir senha de terceiro nem encerrar sessões de terceiro ou próprias; recuperação por e-mail depende de provedor. | F00 | V2-F00-E09, V2-F00-E10 | G00 | CP-19 | telas de sessões e senha no painel; recuperação provada com notificador de teste |
| BZ-F | GAP-P1O-02 | BAS-32, BAS-33 (REL:01): sair apaga vistoria começada sem aviso; GPS abaixo de 0,5 m impede concluir; promessa falsa de envio com app fechado; teclado e câmera. | F00 | V2-F00-E15, V2-F00-E16 | G00 | - | testes de diálogo, GPS, teclado e câmera do campo verdes; frase de envio corrigida |
| BZ-F | GAP-P1O-03 | BAS-16 a BAS-19 e BAS-52 (REL:01): três e2e de navegador e vários gates do verificar reprovados; CI sem status verificável. | F00, F01 | V2-F00-E13, V2-F00-E17, V2-F00-E18, V2-F00-E19, V2-F01-E03 | G00, G01 | CP-03 | npm run verificar verde local; os mesmos portões rodando e verdes no CI |
| BZ-F | GAP-P1O-04 | BAS-30 (REL:01): o CORS impede o PUT de evidência com if-none-match pelo navegador; o preflight reprova e o envio falha. | F00, F06 | V2-F00-E18, V2-F06-E15 | G00, G06 | - | test:e2e:api verde no PUT; S3 real em HML com CORS provado |
| BZ-F | GAP-P1O-05 | G-04 (REL:02): com RECUPERACAO_ATIVA=nao, quem esquece a senha não tem caminho; a API de redefinição existe sem tela; Usuarios.tsx manda usar link inexistente; duplica GAP-P1O-01. | F00 | V2-F00-E09, V2-F00-E10 | G00 | CP-19 | tela de redefinição por quem administra e recuperação ponta a ponta provadas |
| BZ-F | GAP-P1O-06 | G-08 (REL:02): sem homologação, entrega contínua, monitoramento nem página de status; 1 máquina Fly (ver GAP-P1O-38); fotos fora do dump de backup. | F01, F07, F21, F22 | V2-F01-E11, V2-F01-E12, V2-F01-E14, V2-F07-E12, V2-F21-E05, V2-F22-E02, V2-F22-E11 | G01, G07, G21, G22 | CP-05, CP-06 | HML com deploy por merge, monitor, página de status e cópia de storage |
| BZ-F | GAP-P1O-07 | G-15 (REL:02): transições só na API e no shared, sem trigger no banco; motivo mínimo de encerramento de 1 caractere. Gatilho no encaminhamento e nas voltas (F04-E03, F13-E01) e motivo mínimo e lista de motivos na F10-E27 (L18). | F04, F10, F13 | V2-F04-E03, V2-F13-E01, V2-F10-E27 | G04, G10, G13 | CP-23, CP-55 | gatilho em SQL recusa saída de estado terminal; motivo mínimo e lista de motivos validados |
| BZ-F | GAP-P1O-08 | G-17 (REL:02): Chromium com --no-sandbox e JavaScript habilitado dentro do processo da API que serve o banco; sem CSP no HTML do documento. | F07 | V2-F07-E05 | G07 | - | Chromium em processo isolado, sem JS no laudo, teste de sandbox e CSP |
| BZ-F | GAP-P1O-09 | G-22 (REL:02): usuário criado por administrador recebe senha escolhida por quem administra, sem troca obrigatória (administracao.ts:143-193). | F03 | V2-F03-E10 | G03 | CP-05 | convite de uso único por e-mail no lugar da senha digitada; teste negativo |
| BZ-F | GAP-P1O-10 | G03 (CMP-65, CMP-66, REL:03): a tela promete envio com o app fechado e em segundo plano; o app só sincroniza aberto. | F00, F14 | V2-F00-E16, V2-F14-E06 | G00, G14 | CP-24 | frase corrigida na F00; segundo plano provado em aparelho ou decisão registrada |
| BZ-F | GAP-P1O-11 | G05 (CMP-53, CMP-88, REL:03): troca de pessoa no aparelho (acolherNoAparelho) sem teste, com comentário para teste inexistente e destruição silenciosa do rascunho do colega. | F14 | V2-F14-E02 | G14 | - | acolherNoAparelho confirma e nomeia o dono anterior; testes com SQLite em memória |
| BZ-F | GAP-P1O-12 | G06 (CMP-27, REL:03): logout apaga lápides e mantém a fila; a abertura da vistoria não consulta a fila e pode nascer segunda vistoria (lido, não reproduzido). | F14 | V2-F14-E02, V2-F14-E09 | G14 | - | após logout com item na fila, a mesma ocorrência responde ja_coletada |
| BZ-F | GAP-P1O-13 | G07 (CMP-68, CMP-57, REL:03): item da fila com 401 vira bloqueado e não volta após novo login; o agente lê a frase crua do servidor; autor_divergente. | F00, F14 | V2-F00-E06, V2-F14-E03 | G00, G14 | - | 401 e 403 pausam a fila sem bloquear item; autor_divergente na tela de revisão |
| BZ-F | GAP-P1O-14 | G08 (CMP-46, CMP-51, REL:03): sem limpeza de foto e assinatura após sincronizar, sem guarda de espaço livre e sem logout do agente; imagens de imóveis acumulam no aparelho. | F14 | V2-F14-E15 | G14 | - | foto apagada só após hash confirmado; recusa de fotografar sem espaço |
| BZ-F | GAP-P1O-15 | G12 (CMP-82 a CMP-86, REL:03): sem prova em aparelho: CA-02 Parcial, Android físico, matar no envio, reinício do aparelho e push real nunca exercitados. | F14 | V2-F14-E12 | G14 | - | artefatos de prova em Android e iOS físicos arquivados em G14 |
| BZ-F | GAP-P1O-16 | G13 (CMP-73, REL:03): push desligado em produção desde 2026-09-15 (chave no servidor e capacidade Time Sensitive); o despacho não avisa com o app fechado. | F14 | V2-F14-E05 | G14 | CP-04 | push real recebido com app fechado em iPhone e Android físicos |
| BZ-F | GAP-P1O-17 | G14 (CMP-78, CMP-91, REL:03): sem observabilidade do cliente: relatório de falhas, telemetria, ErrorBoundary e versão mínima; o dono com o aparelho na mão é o único detector. | F14, F21 | V2-F14-E07, V2-F14-E08, V2-F21-E01 | G14, G21 | CP-06 | evento de erro chega ao destino em HML; resposta 426 por versão mínima |
| BZ-F | GAP-P1O-18 | G15 (CMP-60, REL:03): registro de fila ilegível é apagado em silêncio (deposito.ts:118); uma vistoria pode sumir sem rastro em vez de ir para quarentena. | F14 | V2-F14-E02 | G14 | - | registro ilegível isolado em quarentena visível na Fila; fila segue |
| BZ-F | GAP-P1O-19 | G17 (CMP-12, REL:03): agente sem equipe perde o histórico (campo.ts:62-70, PENDENCIAS §11); corrigido na F14-E17 (L17). | F14 | V2-F14-E17 | G14 | - | agente sem equipe vê o histórico e uma mensagem, nunca tela vazia |
| BZ-F | GAP-P1O-20 | CON-07 (REL:04): limite por IP do console sem trustProxy; logins e ações por hora são compartilhados atrás do balanceador e um anônimo tranca o dono fora. | F20 | V2-F20-E10 | G20 | - | dois IPs de borda com baldes separados no teste do console |
| BZ-F | GAP-P1O-21 | CON-39 (REL:04): sem reemissão de acesso ao único administrador de um município (senha provisória de 72 h vencida, recuperação desligada); só SQL de dono do banco. | F20 | V2-F20-E02 | G20 | - | console_reemitir_acesso com motivo e trilha; teste de recusa e de reemissão |
| BZ-F | GAP-P1O-22 | CON-36 (REL:04): autoria de municipio_provisionado e de --operador é texto livre digitado em trilha imutável; a sessão autenticada só vai para o log. | F20 | V2-F20-E06 | G20 | - | autor derivado da sessão registrada no banco; id forjado recusado no teste |
| BZ-F | GAP-P1O-23 | CON-56, CON-57, CON-09 (REL:04): auditoria do console é só log; sem tabela de autoria, sem quem e quando da desativação, sem último login, retenção do log desconhecida. | F20, F21 | V2-F20-E05, V2-F21-E08 | G20, G21 | CP-06 | console_auditoria append-only com autor da sessão; retenção do log decidida |
| BZ-F | GAP-P1O-24 | REL:04: documentação desatualizada do console: PENDENCIAS.md, README.md:552-580, ADR 0008 sem emenda (banco separado, teto de dano) e SAIDA-DE-MUNICIPIO.md; a auditoria de 2026-09-30 herdou o erro. | F00, F20 | V2-F00-E22, V2-F20-E01 | G00, G20 | CP-30 | documentos batem com o código; ADR 0018 emenda a 0008 |
| BZ-F | GAP-P1O-25 | CON-09 (REL:04): ciclo de vida do operador do console: sem reativar, e-mail de conta desativada não reutilizável (a regra é desativar e criar outra), sem transferência do dono. | F20 | V2-F20-E12 | G20 | - | operador reativado, e-mail reutilizável e dono transferido com um dono ativo e trilha |
| BZ-F | GAP-P1O-26 | CON-14, CON-15 (REL:04): credenciais do console sem rotação: chave do TOTP única, JWT sem rotação, login de banco criado à mão e não conferido como não privilegiado. | F01, F20, F22 | V2-F01-E16, V2-F20-E06, V2-F22-E08 | G01, G20, G22 | CP-07 | runbook de rotação, partida conferindo login sem privilégio, cópia cifrada da chave do TOTP |
| BZ-F | GAP-P1O-27 | CON-30, CON-41, CON-44 (REL:04): rotinas do fornecedor (teto de armazenamento, consumo, órfãos, provisionamento por CLI) ainda exigem credencial de dono do banco. A F07-E03 move o worker e a F20-E15 tira o resto da credencial de dono. | F07, F20 | V2-F07-E03, V2-F20-E15 | G07, G20 | - | rotinas do fornecedor rodam sem credencial de dono; teste de privilégio |
| BZ-F | GAP-P1O-28 | CON-32 (REL:04): /saude do console só diz que o processo está de pé; banco que cai depois da partida deixa a sonda verde. | F21 | V2-F21-E04 | G21 | - | GET /pronto do console confere banco e esquema; 503 testado com banco fora |
| BZ-F | GAP-P1O-29 | REL:05: providência vencida não gera aviso, push nem e-mail; o sino só cobre o prazo da ocorrência e só materializa quando alguém o abre (avisos.ts:244-248). | F04, F11 | V2-F04-E10, V2-F11-E17 | G04, G11 | CP-21, CP-19 | varredura de lembretes por percentual do prazo; e-mail e sino do portal |
| BZ-F | GAP-P1O-30 | REL:05: prazo de providência fixo em 72 h no formulário, sem padrão por tipo ou severidade e sem prorrogação; configuração versionada ampla entra na F33 (item 19 retomado). | F04, F11, F12, F33 | V2-F04-E10, V2-F11-E12, V2-F12-E03, V2-F33-E03 | G04, G11, G12, G33 | CP-21 | prazo original, pausa e alteração com evento; valores calibrados em homologação |
| BZ-F | GAP-P1O-31 | REL:05: ofício por e-mail desligado no deploy padrão e provedor real NÃO CONFIRMADO; link de uso único consumido por GET pode ser queimado por scanner ou prévia. | F04, F10, F12 | V2-F04-E12, V2-F10-E14, V2-F12-E06 | G04, G10, G12 | CP-22, CP-19 | decisão sobre o link de uso único registrada; consulta do ofício auditada |
| BZ-F | GAP-P1O-32 | REL:05: o gatilho providencia_amarra_no_catalogo cria órgão a partir de texto livre; na V2 criaria órgão sem usuário, e-mail nem competência. | F04 | V2-F04-E02 | G04 | - | rota nova exige orgaoId; gatilho restrito ao caminho legado; teste de banco |
| BZ-F | GAP-P1O-33 | IDN-28 (REL:06): auditoria de autenticação incompleta: sem login, falha, bloqueio, troca da própria senha, recuperação e reúso de refresh. Eventos de sessão na F03-E20 e consulta própria na F10-E30 (L11). | F03, F10 | V2-F03-E20, V2-F10-E30 | G03, G10 | - | login, saída, falha, bloqueio e reúso de refresh na trilha com IP e agente |
| BZ-F | GAP-P1O-34 | AUT-33 (REL:06): sem varredura rota x papel; a única defesa é a revisão humana. | F03, F25 | V2-F03-E13, V2-F25-E03 | G03, G25 | - | matriz papel x rota x método como teste fixo; default deny |
| BZ-F | GAP-P1O-35 | IDN-17, IDN-18, IDN-20 (REL:06): recuperação desligada, redefinição por terceiro que conhece a senha por 72 h e sem reset de TOTP de outra pessoa. | F00, F03 | V2-F00-E10, V2-F03-E10, V2-F03-E11 | G00, G03 | CP-19, CP-05, CP-08 | recuperação provada; convite de uso único; reset de MFA por superior com trilha |
| BZ-F | GAP-P1O-36 | REL:06: documentação desatualizada: comentários dizem vigência em vigor, auditoria de 2026-09-30 afirma console sem MFA, db/PENDENCIAS.md parado em 2026-09-09, avisos.ts cita doze funções SD (são 27). | F00 | V2-F00-E22, V2-F00-E04 | G00 | - | comentários e PENDENCIAS batem com o código; conferência após a E04 |
| BZ-F | GAP-P1O-37 | REL:07: sem provedor de e-mail ou SMS em produção (fly.toml:60-67; config.ts:102), logo sem verificação de contato nem recuperação de conta do cidadão; SMS entra no login pela F34-E15 (item 6 retomado). | F15, F34 | V2-F15-E14, V2-F15-E04, V2-F34-E15 | G15, G34 | CP-04, CP-19, CP-92 | OTP por e-mail entregue em HML com domínio verificado |
| BZ-F | GAP-P1O-38 | REL:07: capacidade para tráfego público de pico não medida; máquina única pequena que também gera PDF em Chromium (fly.toml:109,123-128; carga.test.ts:1-30). | F07, F24 | V2-F07-E05, V2-F24-E05, V2-F24-E09 | G07, G24 | - | relatório de carga com p95, memória e Chromium isolado do processo da API |
| BZ-F | GAP-P1O-39 | REL:07: sem ambiente de homologação (LOJAS.md:59-60). | F01 | V2-F01-E11, V2-F01-E13 | G01 | CP-05, CP-04 | HML no ar com bundle ids distintos e dados sintéticos |
| BZ-F | GAP-P1O-40 | REL:07: IP do cidadão em log (servidor.ts:292) e em interesse_municipio (011:71) sem retenção definida nem purga implementada. | F05 | V2-F05-E12, V2-F05-E09 | G05 | CP-10 | função de expurgo de IP com teste; prazo da classe decidido em CP-10 |
| BZ-F | GAP-P1O-41 | LGP-11, LGP-12 (REL:08): minimização com padrão NULL em todos os municípios, agendador sem teste e sem execução na partida, configuração de produção desconhecida. | F05 | V2-F05-E09, V2-F05-E10 | G05 | CP-10 | padrão vazio e modo relatar provados; agendador de minimização com teste |
| BZ-F | GAP-P1O-42 | LGP-13, LGP-15, LGP-43 (REL:08): sem expurgo de sessoes, recuperacoes_senha, interesse_municipio e aparelhos revogados; o comentário da 011 promete purga inexistente. Aparelho revogado expurgado pela F05-E15 e F15-E17 (L19). | F05, F15 | V2-F05-E12, V2-F05-E03, V2-F05-E15, V2-F15-E17 | G05, G15 | CP-10 | expurgo de rastro de acesso e de aparelho revogado testado |
| BZ-F | GAP-P1O-43 | REL:08: documentação desatualizada: PRIVACIDADE.md seção 6 diz que a lista ainda devolve nome e contato (15.8, item 1); cobertura apenas por referência cruzada. | F05 | V2-F05-E01, V2-F05-E10 | G05 | - | PRIVACIDADE.md coerente com o código e apontando o manifesto |
| BZ-F | GAP-P1O-44 | UPL-31 (REL:08): a confirmação lê o objeto inteiro em memória de máquina de 1 GB junto do Chromium; a saída de município acumula todas as tabelas em memória. | F06, F07 | V2-F06-E04, V2-F07-E04, V2-F07-E06 | G06, G07 | - | HEAD com tamanho preso; pipeline e pacote no worker em streaming |
| BZ-F | GAP-P1O-45 | UPL-21 (REL:08): varredura de órfãos desligada e nunca exercitada contra o provedor real. | F06 | V2-F06-E10, V2-F06-E15 | G06 | - | varredura de órfãos ligada e exercitada contra o S3 real em HML |
| BZ-F | GAP-P1O-46 | REQ-002, REQ-034 (REL:09): login, saída e bloqueio não entram na trilha; falhas são só contador; duplica GAP-P1O-33. Eventos de sessão na F03-E20 e consulta própria na F10-E30 (L11). | F03, F10 | V2-F03-E20, V2-F10-E30 | G03, G10 | - | login, saída, falha e bloqueio na trilha com IP e agente |
| BZ-F | GAP-P1O-47 | REQ-002 (REL:09): recuperação de senha desligada em produção e reset administrativo sem tela; duplica GAP-P1O-01. | F00 | V2-F00-E09, V2-F00-E10 | G00 | CP-19 | telas de sessões e senha no painel; recuperação provada com notificador de teste |
| BZ-F | GAP-P1O-48 | REQ-069, REQ-060, REQ-071 (REL:09): sem alerta de erro, sem latência por rota, sem homologação e deploy manual. | F01, F21 | V2-F01-E11, V2-F01-E12, V2-F01-E14, V2-F21-E09 | G01, G21 | CP-05, CP-06 | HML, deploy por merge, alerta de erro e percentis por rota em produção |
| BZ-F | GAP-P1O-49 | DOC-35 (REL:09): Chromium com --no-sandbox e JavaScript ligado renderizando HTML com texto de cidadão; duplica GAP-P1O-08. | F07 | V2-F07-E05 | G07 | - | Chromium em processo isolado, sem JS no laudo, teste de sandbox e CSP |
| BZ-F | GAP-P1O-50 | REL:10: nenhum alerta, erro centralizado, métrica de aplicação nem tracing; painel e app sem captura de erro; tracing distribuído entra na F21-E10 a E12 (item 15 retomado). | F01, F21 | V2-F01-E14, V2-F21-E01, V2-F21-E09, V2-F21-E10 a V2-F21-E12 | G01, G21 | CP-06 | erro chega ao destino com alerta; trace de rota crítica sem dado pessoal |
| BZ-F | GAP-P1O-51 | REL:10: falha das rotinas de minimização, resumo e órfãos é registrada em info, sem sinal em /saude; a minimização executa obrigação de retenção prometida. | F01, F21 | V2-F01-E14, V2-F21-E04 | G01, G21 | CP-06 | falha de rotina em nível error e visível na sonda de saúde |
| BZ-F | GAP-P1O-52 | REL:10: /saude mistura liveness e readiness, o ramo 503 não tem teste e README, fly.toml e comentário prometem 503 por esquema atrasado que o código não faz. | F07, F21 | V2-F07-E07, V2-F21-E04 | G07, G21 | - | /saude e /pronto separados; 503 por esquema atrasado coberto por teste |
| BZ-F | GAP-P1O-53 | REL:10: npm audit falha nos dois lockfiles e o CI tende a estar vermelho; sem execução agendada nem Dependabot; o README diz em zero. | F00, F01 | V2-F00-E19, V2-F01-E06, V2-F00-E22 | G00, G01 | CP-03 | npm audit zerado na raiz e no campo; Dependabot ativo; README corrigido |
| BZ-F | GAP-P1O-54 | REL:10: o CI não roda os 18 scripts/*.test.mjs, test:campo nem auditar, e não constrói a imagem Docker que os documentos dizem conferir. | F01 | V2-F01-E03, V2-F01-E08 | G01 | - | CI executa auditar, test:scripts, test:campo e constrói as duas imagens |
| BZ-F | GAP-P1O-55 | REL:10: sem lint, SAST, secret scanning, SBOM, licenças, DAST e scan de contêiner; workflows sem permissions, SHA e timeout. Lint na F01-E17, SBOM e licenças na F01-E19 e scan de contêiner na F01-E20 (itens 33 e 40 retomados). | F01, F25 | V2-F01-E02, V2-F01-E04, V2-F01-E05, V2-F01-E17, V2-F01-E19, V2-F01-E20, V2-F25-E01, V2-F25-E10 | G01, G25 | CP-43 | workflows endurecidos; gitleaks e Semgrep no CI; SBOM, licenças e scan de contêiner |
| BZ-F | GAP-P1O-56 | REL:10: sem staging, nem para o backend nem para o app. | F01 | V2-F01-E11, V2-F01-E12, V2-F01-E13 | G01 | CP-05, CP-04 | HML de backend e perfil EAS de HML com bundle ids distintos |
| BZ-F | GAP-P1O-57 | REL:10: sem versionamento, tags, changelog nem versão ou SHA visível em produção; deploy manual da máquina do operador. | F01 | V2-F01-E07, V2-F01-E08, V2-F01-E12 | G01 | - | tags e changelog; /saude mostra versão e commit; PROD por promoção |
| BZ-F | GAP-P1O-58 | A11-03, UXD-02 (REL:11): dois portões do painel vermelhos: falso positivo de janela de 4 linhas (Modal.tsx:254 contra :260) e violação real pequena (Estrutura.tsx:132). | F00 | V2-F00-E13 | G00 | - | acessibilidade.test.ts e design-system.test.ts verdes no painel |
| BZ-F | GAP-P1O-59 | UXD-27, UXD-28 (REL:11): sem ErrorBoundary no painel e no campo; erro de renderização deixa tela em branco ou derruba o app em campo. | F10, F14 | V2-F10-E10, V2-F14-E07 | G10, G14 | - | ErrorBoundary na raiz do painel e do campo; e2e de falha verde |
| BZ-F | GAP-P1O-60 | UXD-49 (REL:11): o texto de sessão encerrada do campo mudou em 2026-09-15 e o teste de 2026-09-14 pede o texto antigo; divergência de três lados. | F00 | V2-F00-E14 | G00 | - | os dois testes reescritos para o texto vigente; falha-de-atualizacao verde |

### Gaps P1 PRODUTO da seção F do Baseline Zero (GAP-P1P-01 a GAP-P1P-51)

51 itens, ORIGEM `BZ-F`, rótulo `BZ-F:P1-PROD`.

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BZ-F | GAP-P1P-01 | BAS-31, BAS-34 (REL:01): entrar pela raiz leva a Esta página não existe; Toast ausente em três telas administrativas (Usuarios, Equipes, Orgaos). | F00 | V2-F00-E13 | G00 | - | login a partir de / chega à tela inicial; Toast nas três telas |
| BZ-F | GAP-P1P-02 | G-05 (REL:02): saída a campo descrita no README e em SEGURANCA-DO-AGENTE.md, mas nenhum código de campo chama POST /saida-a-campo; a tela Quem está em campo fica sem dado. | F00, F14 | V2-F00-E24, V2-F14-E01 | G00, G14 | CP-02, CP-24 | saída declarada pelo app em aparelho (CP-02 decidido: implementar, PR:D-25) |
| BZ-F | GAP-P1P-03 | G-06 (REL:02): a UI só encaminha uma providência por ocorrência (Ocorrencia.tsx:676); resposta digitada pela Defesa Civil; sem alerta de prazo vencido; sem anexar arquivo no painel. | F04, F10, F11 | V2-F04-E10, V2-F10-E04, V2-F11-E13 | G04, G10, G11 | - | vários encaminhamentos por ocorrência no painel; lembretes de prazo; anexos pelo portal |
| BZ-F | GAP-P1P-04 | G-07 (REL:02): sem reabertura nem reinspeção (FLU-04), edição de dados do chamado e configuração de prazos e tipos (CFG-01); reabertura na F13-E06 (D-21), edição do chamado na F10-E28 (L22) e CFG-01 na F33. | F10, F13, F33 | V2-F13-E03, V2-F13-E04, V2-F13-E06, V2-F10-E28, V2-F33-E01 | G10, G13, G33 | CP-23 | determinação de reinspeção pelo painel provada; reabertura por 30 dias; edição com histórico |
| BZ-F | GAP-P1P-05 | G-09 (REL:02): e-mail e push desligados por padrão em produção; ofício por e-mail e recuperação de senha indisponíveis; provedor e domínio não contratados. | F00, F11, F14, F15 | V2-F00-E10, V2-F11-E17, V2-F14-E05, V2-F15-E14 | G00, G11, G14, G15 | CP-04, CP-19 | e-mail com domínio verificado e push real ligados em HML antes de produção |
| BZ-F | GAP-P1P-06 | G-10 (REL:02): foto de perfil sem tela no painel, e a tela de campo promete que a coordenação a vê. | F10 | V2-F10-E09 | G10 | CP-18 | foto de perfil construída no painel (CP-18 decidido por PR:D-26); promessa da tela cumprida |
| BZ-F | GAP-P1P-07 | G04 (CMP-23, CMP-24, REL:03): saída a campo sem cliente no app, mas cartão, guia e apresentação afirmam que existe; painel Quem está em campo vazio; duplica GAP-P1P-02. | F00, F14 | V2-F00-E24, V2-F14-E01 | G00, G14 | CP-02, CP-24 | saída declarada pelo app em aparelho (CP-02 decidido: implementar, PR:D-25) |
| BZ-F | GAP-P1P-08 | G16 (CMP-17, CMP-18, CMP-19, REL:03): instruções do despacho e prazoHoras digitados pela coordenação nunca chegam ao agente; não há aceite. Parcial: instruções do primeiro despacho. | F13, F14 | V2-F13-E02, V2-F13-E05, V2-F14-E14 | G13, G14 | CP-24 | tarefa do agente traz instruções e prazo da rodada; aceite conforme CP-24 |
| BZ-F | GAP-P1P-09 | G18 (CMP-29, CMP-64, CMP-80, REL:03): checklist único e fixo (spec VIS-05 pede por tipo e condicional); sem aditamento (VIS-08); sem mapa offline. Checklist por tipo na F33, aditamento na F14-E19 e mapa offline na F14-E21 (L7, L23). | F14, F33 | V2-F33-E05 a V2-F33-E08, V2-F14-E19, V2-F14-E21 | G14, G33 | CP-89, CP-58 | checklist por tipo avaliado offline; aditamento versionado; mapa offline da área de atuação |
| BZ-F | GAP-P1P-10 | CON-26, CON-27, CON-30, CON-31 (REL:04): calado mede o relógio da API, não o uso; usuarios_ativos mede contas; sem último acesso, erro, fila parada, consumo nem alertas. | F20, F21 | V2-F20-E07, V2-F21-E02, V2-F21-E05 | G20, G21 | - | último acesso real e saúde por município no console; fila parada com alerta |
| BZ-F | GAP-P1P-11 | CON-52 (REL:04): a prefeitura não tem tela nem rota para ler a trilha administrativa onde estão os atos do fornecedor. Entra na F20-E16 (L20). | F20 | V2-F20-E16 | G20 | - | prefeitura lê os atos do fornecedor na própria trilha, sem dado de outro município |
| BZ-F | GAP-P1P-12 | CON-40 (REL:04): sem edição de dados da prefeitura, sem adicionar administrador, sem correção de e-mail do primeiro administrador pelo fornecedor. Reemissão de acesso na F20-E02 e correção cadastral pelo fornecedor na F20-E13. | F20 | V2-F20-E02, V2-F20-E13 | G20 | - | correção de dado cadastral com motivo e trilha; reemissão de acesso testada |
| BZ-F | GAP-P1P-13 | CON-54, CON-29 (REL:04): o console não lê o livro de eliminações e esconde o município eliminado; série por município sem tela. CON-29 na F20-E07 e o livro de eliminações na F20-E17 (L24). | F20 | V2-F20-E07, V2-F20-E17 | G20 | - | série por município com tela; livro de eliminações e município eliminado na lista |
| BZ-F | GAP-P1P-14 | REL:05: a resposta do órgão é digitada pela Defesa Civil; o órgão não tem canal, conta nem identidade; o ofício pede resposta no protocolo sem dar canal. | F03, F11 | V2-F03-E05, V2-F11-E04, V2-F11-E13 | G03, G11 | - | usuário do órgão entra no portal e responde com anexo; teste do fluxo C |
| BZ-F | GAP-P1P-15 | REL:05: não existem aceite, devolução, transferência, escalonamento nem pedido de complemento para providência; transferência direta fica fora (21-fora-da-v2 item 25). | F10, F11 | V2-F10-E06, V2-F11-E11, V2-F11-E14, V2-F11-E15 | G10, G11 | - | aceite, devolução, esclarecimento e escalonamento provados nos fluxos C e D |
| BZ-F | GAP-P1P-16 | REL:05: evidência de cumprimento (FLU-02) não existe; evidencias é só imagem, da ocorrência, enviada só por agente_campo. | F06, F11 | V2-F06-E02, V2-F11-E13 | G06, G11 | - | anexo de secretaria pela cadeia segura, fora do laudo; teste de upload do portal |
| BZ-F | GAP-P1P-17 | REL:05: reinspeção e reabertura não têm aresta na máquina de estados; encerrada é terminal; a especificação FLU-04 prevê reabrir (a reabertura entra na F13-E06 por PR:D-21). | F13 | V2-F13-E01, V2-F13-E06 | G13 | CP-23 | aresta de reinspeção no banco; encerrada recusa saída por SQL |
| BZ-F | GAP-P1P-18 | REL:05: providência só pode nascer a partir de vistoria_concluida. Parcial: a F10-E04 estende a providencia_pendente; antes da vistoria concluída segue vedado. | F10 | V2-F10-E04 | G10 | - | encaminhar em vistoria_concluida e providencia_pendente, vários por ocorrência; teste de tela |
| BZ-F | GAP-P1P-19 | REL:05: providência errada não pode ser cancelada ou corrigida; só responder recusada ou abrir outra. | F04 | V2-F04-E02, V2-F04-E03 | G04 | - | estado cancelado com motivo no banco; transição conferida por gatilho |
| BZ-F | GAP-P1P-20 | REL:05: responsavel e respondida_por são texto livre; não há fila do responsável (FLU-01) nem autoria verificável. | F04, F11 | V2-F04-E02, V2-F11-E09, V2-F11-E11 | G04, G11 | CP-20 | destinatário e respondente nominais; caixa de entrada do responsável no portal |
| BZ-F | GAP-P1P-21 | REL:05: não existe gate automatizado de toda leitura declara quem pode ler (superficie.test.ts só prova autenticação). | F03 | V2-F03-E12, V2-F03-E13 | G03 | - | manifesto rota x ação com default deny; rota sem ação declarada reprova |
| BZ-F | GAP-P1P-22 | IDN-04, IDN-14, IDN-15 (REL:06): conta única por município e papel; e-mail global inclusive de desativadas; a pessoa global com vínculos por município supera a limitação A-01 (PR:D-08, ADR 0009). | F03 | V2-F03-E01, V2-F03-E09, V2-F03-E15 | G03 | - | ADR 0009 revisada; índice de e-mail único entre pessoas ativas |
| BZ-F | GAP-P1P-23 | IDN-35 a IDN-41, AUT-35 a AUT-40 (REL:06): o modelo não suporta secretaria nem cidadão (enum em 4 CHECKs, sem vínculo, sem competência, sem audiência própria). | F03, F15 | V2-F03-E04, V2-F03-E05, V2-F03-E07, V2-F15-E03 | G03, G15 | - | papel usuario_orgao, vínculos temporais e audiências próprias com teste de plateia |
| BZ-F | GAP-P1P-24 | IDN-24 (REL:06): providencias.respondida_por é texto livre; o órgão não tem identidade nem estados de aceite e devolução; duplica GAP-P1P-20 e GAP-P1P-15. | F04, F11 | V2-F04-E02, V2-F11-E09, V2-F11-E11 | G04, G11 | CP-20 | respondida_por_id nominal; estados de aceite e devolução no encaminhamento |
| BZ-F | GAP-P1P-25 | REL:07: sem idempotência na criação de ocorrência e relato e sem versionamento de API (ocorrencias.ts:629-692; nenhuma rota /v1). | F02, F17 | V2-F02-E01, V2-F02-E07, V2-F17-E08 | G02, G17 | - | chave de criação do cliente com UNIQUE; /v1 com espelho legado datado |
| BZ-F | GAP-P1P-26 | REL:07: push preso a usuarios, a dois tipos de aviso e a um bundle e projeto FCM (016:107; config.ts:229,267). | F14, F15, F17 | V2-F14-E05, V2-F15-E02, V2-F17-E13 | G14, G15, G17 | CP-04 | aparelho sem usuário e remetente por aplicativo provados em HML |
| BZ-F | GAP-P1P-27 | REL:07: duplicidade insuficiente para relatos (sem coordenada, contato, relato, janelas maiores, escape de LIKE) (ocorrencias.ts:695-720). O LIKE sem escape fica em PENDENCIAS.md da API. | F10, F16, F18 | V2-F10-E24, V2-F16-E07, V2-F18-E05 | G10, G16, G18 | - | sinal de duplicidade por tipo, janela e raio; consulta manual estendida; vínculo decidido na triagem |
| BZ-F | GAP-P1P-28 | REL:07: sem caixa de entrada de triagem no painel e sem aviso ao plantão para relato novo (018:52-62). | F18 | V2-F18-E01, V2-F18-E12 | G18 | - | caixa de triagem com filtros; sino avisa relato novo ao plantão |
| BZ-F | GAP-P1P-29 | REL:07: sem pacotes compartilhados de UI, tokens e cliente HTTP; quarto cliente e terceira cópia de tokens (tokens.ts:1-14). UI web compartilhada fica fora (21-fora-da-v2 item 32). | F08, F17 | V2-F08-E01, V2-F08-E04, V2-F17-E03 | G08, G17 | - | design-tokens e cliente-api com consumidores reais; upload-core no campo e no cidadão |
| BZ-F | GAP-P1P-30 | LGP-19, UPL-05 (REL:08): consultas sem registro: lista com busca associa nome a endereço sem rastro, fotos, ofício autenticado, trilha e pendências do agente. | F05 | V2-F05-E11 | G05 | - | consulta nominal registrada para ofício, fotos, trilha e dossiê; teste de rastro |
| BZ-F | GAP-P1P-31 | LGP-20 (REL:08): GET /relatorios/exportacoes não mostra nivel nem justificativa. | F10 | V2-F10-E08 | G10 | - | histórico de exportações com nível e justificativa; teste de API e tela |
| BZ-F | GAP-P1P-32 | UPL-04 (REL:08): autorização de upload sem recorte de equipe (evidencias.ts:288-297), a confirmar com cenário de teste. Cenário nomeado na F03-E14 (L21). | F03 | V2-F03-E14 | G03 | - | agente de outra equipe tem o upload de evidência negado (teste negativo) |
| BZ-F | GAP-P1P-33 | REL:08: tabelas de auditoria com 4 papéis por CHECK, evidencias presas a ocorrência e agente, tipos de arquivo por CHECK e e-mail único global (15.9, 16.4). | F03, F06 | V2-F03-E04, V2-F03-E09, V2-F06-E02 | G03, G06 | - | domínio de papel no banco; tabela arquivos com vínculos; e-mail único entre ativas |
| BZ-F | GAP-P1P-34 | DOC-14 (REL:09): rodapé de segunda via mostra quem reimprimiu e quando, com o identificador do primeiro ato. | F09 | V2-F09-E10 | G09 | - | reimpressão devolve o PDF guardado com o mesmo hash; teste laudo de amanhã |
| BZ-F | GAP-P1P-35 | DOC-09, DOC-10 (REL:09): conferência do identificador só com login, só no município, sem tela e sem QR; terceiros não conferem. | F09 | V2-F09-E13 | G09 | CP-16 | conferência pública por QR, sem login, de versão, situação e hash, se aprovada |
| BZ-F | GAP-P1P-36 | DOC-12, REQ-022, REQ-076 (REL:09): documento sem versão do modelo. | F09 | V2-F09-E04 | G09 | - | versão do template e hash do PDF gravados com o snapshot |
| BZ-F | GAP-P1P-37 | DOC-02 (REL:09): PDF só para laudo e termo de interdição; termo de desinterdição e ofício só em HTML. | F09 | V2-F09-E05 | G09 | - | os quatro tipos de documento emitem PDF guardado com escrita única |
| BZ-F | GAP-P1P-38 | REQ-033 (REL:09): CSV de ocorrências imprime datas no fuso do processo (provavelmente UTC) e não identifica filtros, organização nem responsável; sem relatório em PDF. Fuso na F02-E09 e relatório em PDF na F10-E25 (L10). | F02, F10 | V2-F02-E09, V2-F10-E25 | G02, G10 | - | CSV com fuso do município e cabeçalho; relatório em PDF |
| BZ-F | GAP-P1P-39 | REQ-018, REQ-036, REQ-058 (REL:09): checklist único; a F33 traz formulário de abertura por tipo, checklist por tipo e configuração versionada (itens 19 e 29 retomados em parte). | F33 | V2-F33-E01, V2-F33-E05, V2-F33-E09 | G33 | CP-89 | campos extras por tipo versionados; checklist por tipo; BI e regras de SLA seguem fora (item 29) |
| BZ-F | GAP-P1P-40 | REQ-030 (REL:09): mapa sem filtros; lista sem filtro por tipo. Entra na F10-E23 (L1). | F10 | V2-F10-E23 | G10 | - | mapa e lista filtram por tipo, estado e severidade; total honesto |
| BZ-F | GAP-P1P-41 | REQ-009 (REL:09): duplicidade só por tipo + endereço + 48 h; sem coordenada e contato; duplica GAP-P1P-27. | F10, F16, F18 | V2-F10-E24, V2-F16-E07, V2-F18-E05 | G10, G16, G18 | - | sinal de duplicidade por tipo, janela e raio; consulta manual estendida; vínculo decidido na triagem |
| BZ-F | GAP-P1P-42 | REQ-026 a REQ-028, REQ-053 (REL:09): providência sem prioridade, sem fila do responsável, sem anexo de comprovação, sem aviso de vencimento; encerramento sem justificativa de dispensa. Prioridade na F04-E14 e na F10-E20 (L9). | F04, F10, F11 | V2-F04-E10, V2-F04-E14, V2-F10-E13, V2-F10-E20, V2-F11-E09, V2-F11-E13 | G04, G10, G11 | CP-17, CP-21 | fila do responsável, anexo, lembretes e encerramento com dispensa justificada |
| BZ-F | GAP-P1P-43 | REQ-021, REQ-054, REQ-078 (REL:09): aditamento da vistoria sem justificativa versionada; fila de revisão do coordenador para coleta bloqueada inexistente. Descarte rastreado e tela de revisão na F14-E03; aditamento na F14-E19 e fila de revisão do coordenador na F14-E20 (L23). | F14 | V2-F14-E03, V2-F14-E19, V2-F14-E20 | G14 | - | tela Precisa de decisão; descarte com motivo; aditamento versionado |
| BZ-F | GAP-P1P-44 | REL:10: push do cidadão exige aparelho sem usuário, mais de um bundle e FCM; e-mail exige provedor, domínio e plano; dois apps em loja; capacidade da máquina única. | F11, F14, F17, F24, F28 | V2-F11-E17, V2-F14-E05, V2-F17-E13, V2-F24-E09, V2-F28-E07 | G11, G14, G17, G24, G28 | CP-04, CP-19 | push e e-mail em HML, fichas de loja e carga medida |
| BZ-F | GAP-P1P-45 | A11-14, A11-25, A11-35, A11-42 (REL:11): nenhuma validação humana de acessibilidade em nenhuma superfície; só prescrição e análise estática, enquanto o produto declara RNF-09 para o MVP. | F23 | V2-F23-E03, V2-F23-E05 | G23 | CP-32 | registros de VoiceOver e TalkBack por fluxo; relatório de validação humana |
| BZ-F | GAP-P1P-46 | A11-13 (REL:11): nenhuma automação de acessibilidade em navegador real, sem axe-core ou equivalente; os portões atuais leem fonte e tokens. | F23 | V2-F23-E01 | G23 | - | axe-core no CI com Playwright nas superfícies web, zero violação crítica |
| BZ-F | GAP-P1P-47 | A11-30, A11-31 (REL:11): console sem salvaguarda de Alto Contraste e sem contraste medido, defeito já corrigido no painel. | F08, F23 | V2-F08-E06, V2-F23-E08 | G08, G23 | - | portões de contraste e Alto Contraste parametrizados rodando no console |
| BZ-F | GAP-P1P-48 | A11-22 (REL:11): app de campo sem tratamento nem teste de fonte ampliada, com estimador de largura que ignora a escala; efeito NÃO CONFIRMADO. | F14, F23 | V2-F14-E10, V2-F23-E04 | G14, G23 | - | fonte 200% testada em aparelho; estimador de largura respeita a escala |
| BZ-F | GAP-P1P-49 | A11-25 (REL:11): nenhum aparelho Android e nenhuma validação de leitor de tela em aparelho, enquanto o app do cidadão será Android e iOS; duplica parte de GAP-P1P-45. | F14, F23 | V2-F14-E10, V2-F14-E12, V2-F23-E03 | G14, G23 | - | TalkBack e VoiceOver em aparelhos físicos, com artefatos arquivados |
| BZ-F | GAP-P1P-50 | UXD-47 (REL:11): portões presos a apps/web/src e apps/campo/src; superfície nova fica sem portão. | F01, F08 | V2-F01-E03, V2-F08-E06 | G01, G08 | - | portões de acessibilidade e design parametrizados por superfície rodando no CI |
| BZ-F | GAP-P1P-51 | UXD-05, UXD-06, UXD-45 (REL:11): tokens triplicados sem package e sem paridade no console; componentes RN do agente acoplados a tema em SQLite e à fila. | F08, F17 | V2-F08-E01, V2-F08-E02, V2-F17-E02 | G08, G17 | - | fonte única de tokens com paridade; app do cidadão sem UI do agente |

### F.P2 EVOLUÇÃO (GAP-P2-01 a GAP-P2-24)

24 itens.

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BZ-F | GAP-P2-01 | Lint ausente, cobertura não medida, testes contra Postgres real, OpenAPI, SAST, DAST, segredos, fuzz, aparelho real e acessibilidade dinâmica (BAS-20, BAS-42 a BAS-50; REL:01) | F01, F02, F10, F14, F25 | V2-F02-E04, V2-F01-E04, V2-F01-E05, V2-F01-E17, V2-F25-E04, V2-F25-E10, V2-F25-E11, V2-F14-E12, V2-F10-E11 | G01, G02, G10, G14, G25 | - | OpenAPI no CI, SAST, segredos e lint ativos, DAST e prova em aparelho arquivados |
| BZ-F | GAP-P2-02 | Papéis fixos em CHECKs do banco e no shared; e-mail globalmente único; base de ORG e CID exige evolução de identidade (G-18; REL:02) | F03 | V2-F03-E01, V2-F03-E04, V2-F03-E09, V2-F03-E15 | G03 | - | ADR 0009 de pessoa global aceita, domínio de papel no banco e índice parcial de e-mail |
| BZ-F | GAP-P2-03 | Documentação desatualizada: db/PENDENCIAS.md, web/PENDENCIAS.md, SAIDA-DE-MUNICIPIO.md seção 5, comentários de MeuTrabalho.tsx (G-19; REL:02) | F00 | V2-F00-E22 | G00 | - | documentos conferidos contra o código e afirmações falsas corrigidas |
| BZ-F | GAP-P2-04 | Confirmações de sucesso ausentes em Usuários, Equipes e Órgãos; borderRadius fora do token; PATCH /equipes/:id e POST /orgaos/:id/reativacao sem teste (G-20; REL:02) | F00, F03 | V2-F00-E13, V2-F03-E13 | G00, G03 | - | painel com zero testes vermelhos e matriz papel x rota x método fixa |
| BZ-F | GAP-P2-05 | Fila interesse_municipio sem leitor, leitura só por psql (G-21; REL:02) | F05 | V2-F05-E04 | G05 | - | manifesto declara a política da fila; o leitor continua em aberto |
| BZ-F | GAP-P2-06 | Upload não retomável no byte, sem hash no aparelho, servidor lê o objeto inteiro para medir SHA-256, pull completo sem delta (CMP-39, CMP-40, CMP-98; REL:03) | F06 | V2-F06-E04, V2-F06-E08 | G06 | - | confirmação por HEAD sem baixar o objeto; hash do aparelho e delta em aberto |
| BZ-F | GAP-P2-07 | Documentação do app diverge do código (LEIA-ME, PENDENCIAS, DECLARACAO-NAS-LOJAS) e não há ADR da decisão nativo em vez de PWA (CMP-90; REL:03) | F00, F17 | V2-F00-E22, V2-F17-E01 | G00, G17 | - | LEIA-ME do campo corrigido; ADR 0017 registra a decisão nativa |
| BZ-F | GAP-P2-08 | Console: dia da métrica no fuso do servidor (UTC), virada às 21 h em Brasília, aceito no cabeçalho da 023; pagina.ts com 3646 linhas em template string (REL:04) | dívida aceita | PENDENCIAS.md do pacote | - | - | registro em PENDENCIAS.md com gatilho de reavaliação |
| BZ-F | GAP-P2-09 | Indicadores por órgão (taxa de atendimento, tempo de resposta) além da contagem em GET /orgaos (REL:05) | F10 | V2-F10-E21 | G10 | CP-56 | indicador por órgão definido e sem ranking; política aprovada por Alyson |
| BZ-F | GAP-P2-10 | Credencial única do balde e URL assinada bearer (AUT-24, AUT-25; REL:06) | F06, F25 | V2-F06-E04, V2-F06-E15, V2-F25-E07 | G06, G25 | - | URL de escrita com validade curta e presign testado contra IDOR |
| BZ-F | GAP-P2-11 | Cache Google sem tenant e limitador de taxa em memória por máquina (AUT-28; REL:06) | F15 | V2-F15-E10 | G15 | - | cotas persistentes por conta, IP e ação; cache do Google em aberto |
| BZ-F | GAP-P2-12 | Matrícula case-sensitive e deny-list de colunas do pacote de saída fail-open (IDN-05, AUT-23; REL:06) | F03, F05 | V2-F03-E09, V2-F05-E05 | G03, G05 | - | matrícula registrada em PENDENCIAS.md; coluna sem classe no manifesto reprova teste |
| BZ-F | GAP-P2-13 | Extrair subcaminhos de @dc360/shared para não embarcar permissões e vocabulário do agente no app público (REL:07) | F08 | V2-F08-E05 | G08 | - | binário do cidadão sem permissoes.ts (teste de grafo de imports) |
| BZ-F | GAP-P2-14 | Miniaturas, derivados, compressão no servidor e hash declarado pelo cliente (UPL-13, UPL-17, UPL-18; REL:08) | F06 | V2-F06-E07, V2-F06-E08 | G06 | - | derivado JPEG e miniatura gerados; hashes gravados e conferidos |
| BZ-F | GAP-P2-15 | Ano do protocolo pelo relógio, importação CSV, aceite de termos, miniaturas, upload retomável, antivírus, retenção de mídia, API sem versão, documentação velha (REQ-005 a REQ-089; REL:09) | F00, F02, F05, F06, F33 | V2-F02-E01, V2-F05-E06, V2-F05-E09, V2-F06-E07, V2-F06-E14, V2-F00-E22, V2-F33-E12, V2-F33-E13 | G00, G02, G05, G06, G33 | CP-10, CP-11, CP-12 | API em /v1, aceite e retenção configuráveis, antivírus de PDF, importação por CSV e documentos corrigidos |
| BZ-F | GAP-P2-16 | Migração sem rollback e sem trava de concorrência; o endurecimento pós-migração é manual (REL:10) | F01, F22 | V2-F22-E05, V2-F01-E18 | G01, G22 | - | restore pós-migration prova papéis, policies e grants; trava de migration concorrente testada |
| BZ-F | GAP-P2-17 | Request id não é exposto como header, não é aceito de entrada, não é mostrado pelos clientes nem testado (REL:10) | F01 | V2-F01-E14 | G01 | - | request id em header e mostrado ao usuário no erro, com teste |
| BZ-F | GAP-P2-18 | Documentação contraditória sobre operação: db/PENDENCIAS.md, README (audit zero, S3), três versões sobre o app ter rodado em aparelho, LOJAS.md (REL:10) | F00, F14 | V2-F00-E22, V2-F14-E12 | G00, G14 | - | documentos conferidos contra o código e prova em aparelho arquivada |
| BZ-F | GAP-P2-19 | Paridade painel e campo não cobre bordaControle, anelDeFoco e accent-graphic (UXD-04; REL:11) | F08 | V2-F08-E03 | G08 | - | teste de paridade de tokens cobre os três pares que faltavam |
| BZ-F | GAP-P2-20 | 8 de 16 tabelas sem nome acessível, página 404 sem título, alvo de 44 px sem portão (A11-09, A11-10, A11-11; REL:11) | F23, F10 | V2-F23-E08, V2-F10-E10, V2-F23-E04 | G23, G10 | - | tabelas com caption, página 404 com h1 e alvo de toque medido |
| BZ-F | GAP-P2-21 | Estilo inline em 89 pontos do painel, constantes locais fora do --ds- e letter-spacing literal (UXD-14; REL:11) | F10 | V2-F10-E22 | G10 | - | estilo inline e letter-spacing sob portão de tokens; HTML da API com cores dos tokens |
| BZ-F | GAP-P2-22 | HTML servido pela API (página de recusa, ofício) com cores literais e fora de todo portão (UXD-48; REL:11) | F10 | V2-F10-E22 | G10 | - | estilo inline e letter-spacing sob portão de tokens; HTML da API com cores dos tokens |
| BZ-F | GAP-P2-23 | Documentação do design system defasada: tokens.css diz espelhar arquivos do protótipo sem 7 tokens; README fala em 17 pares e o portão tem 21 (UXD-50, A11-01; REL:11) | F08 | V2-F08-E03, V2-F08-E07 | G08 | - | README e comentário do tokens.css batem com o portão de 21 pares |
| BZ-F | GAP-P2-24 | Apenas 1 accessibilityRole header no app de campo; erros do console em role status sem aria-invalid (A11-21, A11-32; REL:11) | F23, F14 | V2-F23-E02, V2-F23-E08, V2-F14-E10 | G23, G14 | - | lint de acessibilidade RN verde e erros do console com aria-invalid |

### F.A DEFINIR (GAP-DEF-01 a GAP-DEF-51)

51 itens.

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BZ-F | GAP-DEF-01 | Política de fim de linha e de ambiente Windows x CI Linux; testes escritos antes da correção; override de decode-uri-component (BAS-37, BAS-38, BAS-40, BAS-12; REL:01) | F00 | V2-F00-E21, V2-F00-E02, V2-F00-E19 | G00 | CP-03 | ambiente e CRLF resolvidos, política T42 ativa e auditar verde pelo CP-03 |
| BZ-F | GAP-DEF-02 | Eventos de autenticação (login, falha de login, bloqueio) sem trilha imutável (G-11; REL:02); entram na F03-E20 (L11) | F03 | V2-F03-E20 | G03 | - | login, falha e bloqueio gravados na trilha append-only |
| BZ-F | GAP-DEF-03 | Painel sem CSP e sem frame-ancestors no repositório; tokens em sessionStorage; estado real dos cabeçalhos na Vercel não confirmado (G-12; REL:02) | F01, F25 | V2-F01-E10, V2-F25-E02, V2-F25-E10 | G01, G25 | - | cabeçalhos medidos em HML; DAST e revisão manual de sessão registrados |
| BZ-F | GAP-DEF-04 | Pacote de produção do painel leva PGlite, migrações e semente de desenvolvimento (G-13; REL:02) | F10 | V2-F10-E12 | G10 | - | build de produção do painel sem PGlite, migrações e semente (teste de bundle) |
| BZ-F | GAP-DEF-05 | PostGIS ausente apesar de constar na stack do CLAUDE.md; consulta por raio e área (GEO-02) depende dele (G-14; REL:02) | F01, F32 | V2-F01-E21, V2-F01-E22, V2-F32-E02, V2-F32-E08, V2-F32-E09 | G01, G32 | CP-44 | busca por raio e área de risco em Postgres real |
| BZ-F | GAP-DEF-06 | Documentos oficiais com marca d'água de validação e brasão textual, sem assinatura; validação do identificador exige login e varre todas as emissões (G-16; REL:02) | F09 | V2-F09-E14, V2-F09-E07, V2-F09-E13 | G09 | CP-14, CP-16 | marca d'água e aprovação autenticada conforme o CP-14; QR só se o CP-16 aprovar |
| BZ-F | GAP-DEF-07 | Campo sem criptografia local, sem wipe remoto nem bloqueio local; lista traz contato e vulnerabilidade em claro; depende da decisão de ameaça (CMP-05, CMP-47 a CMP-49, CMP-100; REL:03) | F14 | V2-F14-E04 | G14 | CP-24 | decisão do CP-24 registrada; SQLite e fotos cifrados se a alternativa for aprovada |
| BZ-F | GAP-DEF-08 | Sino e autorização de upload de evidência sem recorte de equipe, contra a promessa de que o agente só vê a equipe dele (CMP-08, CMP-09, CMP-10; REL:03) | F00, F03, F13 | V2-F00-E08, V2-F03-E13, V2-F03-E14, V2-F13-E05 | G00, G03, G13 | - | agente de outra equipe negado em sino e upload (teste negativo) |
| BZ-F | GAP-DEF-09 | Foto e assinatura obrigatórias só no cliente: o servidor aceita fotos vazias e assinaturaChave nula; regra de negócio só no formulário (CMP-44; REL:03) | F14 | V2-F14-E18 | G14 | - | servidor recusa vistoria sem foto ou assinatura obrigatória; coleta offline preservada |
| BZ-F | GAP-DEF-10 | Segundo fator: o servidor permite ativar para qualquer papel e o app do agente não tem tela de código (CMP-04; REL:03) | F14 | V2-F14-E16 | G14 | CP-57 | agente ativa o segundo fator com tela de código no app; recuperação decidida |
| BZ-F | GAP-DEF-11 | Aparelho de plantão compartilhado: fila do agente anterior em claro, qualquer pessoa descarta coleta alheia, coleta de agente que não volta só tem saída destrutiva (CMP-56, CMP-58; REL:03) | F14 | V2-F14-E02, V2-F14-E03 | G14 | CP-24 | descarte nunca silencioso e itens bloqueados vão à tela de revisão (teste Jest) |
| BZ-F | GAP-DEF-12 | Recuperação do console por um código sozinho toma a conta sem senha nem TOTP e sem alerta (CON-12; REL:04) | F20 | V2-F20-E05, V2-F20-E06 | G20 | - | login e recuperação do operador na auditoria própria; o fluxo segue em aberto |
| BZ-F | GAP-DEF-13 | Credencial inicial de operador do console conhecida pelo dono, sem troca obrigatória (CON-10; REL:04) | F20 | V2-F20-E12; V2-F20-E19 | G20 | - | E12: novo dono e código de recuperação; E19: troca obrigatória da credencial inicial |
| BZ-F | GAP-DEF-14 | DSN do console pode suspender, agendar eliminação e criar municípios; o banco confia no id de operador declarado pelo processo (CON-19; REL:04) | F20 | V2-F20-E06, V2-F20-E01 | G20 | - | ação perigosa exige sessão de operador registrada no banco (teste negativo) |
| BZ-F | GAP-DEF-15 | organizacoes legível por inteiro pelo console e isenta do teste de colunas; coluna pessoal nova fica visível sem o teste quebrar (CON-17; REL:04) | F20 | V2-F20-E03 | G20 | - | console lê colunas nomeadas e o teste de colunas inclui organizacoes |
| BZ-F | GAP-DEF-16 | Sem política de retenção de metricas_municipio, de console_operadores (dado de equipe do fornecedor) e dos logs do console (CON-34, CON-57; REL:04) | F05, F21 | V2-F05-E03, V2-F21-E08 | G05, G21 | CP-10, CP-06 | tabelas classificadas no manifesto com retenção; destino e prazo do log decididos |
| BZ-F | GAP-DEF-17 | Contrato, plano, vigência e faturamento no console (CON-43, CON-44; REL:04) | F20 | V2-F20-E14 | G20 | CP-61 | contrato, plano, vigência e demonstrativo de faturamento no console; valor real só após o CP |
| BZ-F | GAP-DEF-18 | Dossiê do ofício idêntico para qualquer órgão, sem minimização por competência: Trânsito recebe a vulnerabilidade da família; decisão de LGPD (REL:05) | F04 | V2-F04-E04, V2-F04-E12 | G04 | CP-09 | ofício mostra só o dossiê mínimo definido no CP-09 (teste de conteúdo) |
| BZ-F | GAP-DEF-19 | Retenção de texto livre de providência e resposta não decidida (043:519-523); no portal o volume cresce (REL:05) | F05 | V2-F05-E09, V2-F05-E03 | G05 | CP-10 | classe de retenção por tabela e prazo configurável; padrão vazio até o CP-10 |
| BZ-F | GAP-DEF-20 | Desativar órgão com providências abertas é permitido, sem destino para os itens (REL:05) | F10 | V2-F10-E02 | G10 | - | desativação recusada com encaminhamento em aberto (teste negativo) |
| BZ-F | GAP-DEF-21 | Encerramento não verifica providências obrigatórias (ALY:RN-05) e o README documenta a escolha oposta (REL:05) | F10 | V2-F10-E13 | G10 | CP-17 | regra de encerramento aprovada no CP-17 e README coerente |
| BZ-F | GAP-DEF-22 | Modelo de identidade: e-mail único global, token com um só org, 4 CHECKs de papel, origem e recurso de consulta com poucos valores, teto de 27 funções (REL:05) | F03 | V2-F03-E01, V2-F03-E04, V2-F03-E08, V2-F03-E09 | G03 | - | ADR 0009 registra o modelo híbrido; domínio de papel e teto de funções revisados |
| BZ-F | GAP-DEF-23 | MFA e federação de identidade para usuários de secretaria (REL:05) | F03, F11 | V2-F03-E11, V2-F11-E05, V2-F03-E15, V2-F03-E16, V2-F03-E17 | G03, G11 | CP-08, CP-50 | TOTP obrigatório para usuario_orgao (CP-08); pessoa global entre municípios com escolha ao entrar |
| BZ-F | GAP-DEF-24 | MFA desligado por padrão, obrigatório só a administrador; estado de produção desconhecido (IDN-16, IDN-43; REL:06) | F03 | V2-F03-E11 | G03 | CP-08 | MFA obrigatório para os três papéis; estado de produção conferido em HML |
| BZ-F | GAP-DEF-25 | Sessão deslizante sem teto absoluto (IDN-08; REL:06) | F25 | V2-F25-E02, V2-F25-E12 | G25 | - | teto absoluto de sessão provado em teste após a remediação |
| BZ-F | GAP-DEF-26 | E-mail de outro município revelado por 409 a coordenador e administrador (IDN-04; REL:06) | F03 | V2-F03-E09 | G03 | - | conflito de e-mail responde texto genérico (teste negativo) |
| BZ-F | GAP-DEF-27 | Dependência de BYPASSRLS do dono e dos logins dc360_api e dc360_console_login não verificável no repositório (IDN-25, AUT-07; REL:06) | F25, F22 | V2-F25-E04, V2-F22-E03 | G25, G22 | - | cruzamento de tenant no Postgres de HML com os papéis de produção |
| BZ-F | GAP-DEF-28 | Município do relato sem token conflita com a regra de organização vinda do token; sem IBGE, polígono ou lista pública; depende de DH-29 (REL:07) | F15, F16, F32 | V2-F15-E13, V2-F16-E05, V2-F32-E03 | G15, G16, G32 | CP-28, CP-85 | servidor resolve o município por IBGE e geometria entre os habilitados (teste) |
| BZ-F | GAP-DEF-29 | Identidade do cidadão global ou por município e onde ela mora em relação ao RLS; depende de DH-30 (REL:07) | F15 | V2-F15-E01, V2-F15-E06 | G15 | - | ADR 0015 registra o realm do cidadão e a exceção nomeada no isolamento |
| BZ-F | GAP-DEF-30 | Gate de papel de banco só admite dc360_app e dono em tabela de negócio; realm separado com papel próprio exige evoluir o gate por decisão (REL:07) | F15 | V2-F15-E01 | G15 | CP-25 | decisão do CP-25 registrada e gate de papel evoluído com teste |
| BZ-F | GAP-DEF-31 | Política de moderação, denúncia falsa, spam e abuso (DH-20 a DH-22), incluindo remoção de conteúdo ilícito (REL:07) | F06, F15, F18 | V2-F06-E13, V2-F15-E11, V2-F18-E09 | G06, G15, G18 | CP-26 | moderação append-only e bloqueio manual conforme o CP-26 |
| BZ-F | GAP-DEF-32 | Retenção de relato não convertido e de anexos do cidadão (DH-33) e conflito entre prova não se apaga e direito do titular (REL:07) | F05, F16 | V2-F05-E09, V2-F05-E08, V2-F16-E13, V2-F16-E14 | G05, G16 | CP-10, CP-11 | relato expira por job conforme o CP-10; pedido de titular por anonimização |
| BZ-F | GAP-DEF-33 | Varredura de malware e quarentena inexistentes (UPL-19, UPL-20; REL:08) | F06 | V2-F06-E03, V2-F06-E10, V2-F06-E14 | G06 | CP-12 | quarentena e limpeza provadas; antivírus de PDF só após o CP-12 |
| BZ-F | GAP-DEF-34 | Consentimento, aceite, versão e revogação: nenhum registro existe; necessidade por canal e base legal são decisão humana (LGP-29 a LGP-31, LGP-52; REL:08) | F05 | V2-F05-E06 | G05 | CP-11 | aceite versionado e revogável gravado, sem texto jurídico, até o CP-11 |
| BZ-F | GAP-DEF-35 | Ofício por link entrega nome, relato e vulnerabilidade a órgão externo e a abertura autenticada não gera consulta; a política diz que o dado não sai (REL:08) | F04, F05, F10 | V2-F04-E12, V2-F05-E11, V2-F10-E14 | G04, G05, G10 | CP-09, CP-22 | ofício mostra só o dossiê mínimo e a abertura gera registro de consulta |
| BZ-F | GAP-DEF-36 | Sem retenção de fotografia, assinatura e foto de perfil (UPL-23, LGP-10; REL:08) | F05 | V2-F05-E09, V2-F05-E03 | G05 | CP-10 | classe de retenção de mídia no manifesto; prazo só após a decisão do CP-10 |
| BZ-F | GAP-DEF-37 | EXIF e GPS embutido sem tratamento no servidor, padrão do cliente não confirmado, originais saem no pacote (UPL-14, UPL-15; REL:08) | F06 | V2-F06-E07 | G06 | - | derivado de anexo sem EXIF (teste); original de vistoria preservado por regra |
| BZ-F | GAP-DEF-38 | Texto livre remanescente sem prazo (legenda, providência, observações de ofício, motivos, ponto de referência) (LGP-08; REL:08) | F05 | V2-F05-E09, V2-F05-E10 | G05 | CP-10 | texto livre classificado como a_decidir; redação pronta para o prazo do CP-10 |
| BZ-F | GAP-DEF-39 | Endereço, ponto de referência, coordenadas, nome do assinante e IPs permanentes por decisão do projeto, não confirmada com o município (LGP-09, LGP-14; REL:08) | F05 | V2-F05-E09, V2-F05-E12 | G05 | CP-10 | retenção por classe configurável e decisão do município registrada no CP-10 |
| BZ-F | GAP-DEF-40 | Acesso do fornecedor ao banco por credencial de dono, sem registro no produto (LGP-45; REL:08) | F20 | V2-F20-E01, V2-F20-E05, V2-F20-E09 | G20 | CP-30 | operação técnica por rota do console com auditoria; acesso assistido só pelo CP-30 |
| BZ-F | GAP-DEF-41 | Relatório de impacto, registro de eventos de segurança com alerta, transferência internacional de coordenadas e push (LGP-47, LGP-48, LGP-39; REL:08) | F21, F28 | V2-F21-E08, V2-F28-E08 | G21, G28 | CP-06 | residência e subprocessadores registrados (CP-06); relatório de impacto em aberto |
| BZ-F | GAP-DEF-42 | Aprovação, cargo e registro profissional, marca d'água, unidade e sigilo, MFA por política, reabrir ocorrência, operador despacha, auditor só leitura (DOC-18 a DOC-23, REQ-001 a REQ-087; REL:09) | F03, F09, F13 | V2-F09-E07, V2-F09-E08, V2-F09-E14, V2-F03-E11, V2-F03-E13, V2-F03-E21, V2-F13-E06, 21-fora-da-v2 item 26 | G03, G09, G13 | CP-14, CP-08, CP-23, CP-52 | decisões CP-14, CP-08 e CP-23 registradas; unidade segue fora (item 26); REQ-084 e REQ-087 sem etapa |
| BZ-F | GAP-DEF-43 | Backup automático e PITR do provedor não confirmados; ninguém sabe o RPO efetivo (REL:10) | F22 | V2-F22-E01 | G22 | CP-31, CP-19 | plano de backup e PITR confirmados e medidos em HML |
| BZ-F | GAP-DEF-44 | RPO e RTO alvo não decididos e nunca medidos; periodicidade do reteste aberta, com três valores divergentes (REL:10) | F22 | V2-F22-E07, V2-F22-E06 | G22 | CP-31, CP-37 | RPO e RTO medidos contra o prometido; restore trimestral agendado |
| BZ-F | GAP-DEF-45 | Dumps com dado de cidadão em pasta local sem cifragem de arquivo e com eliminação manual; política não cita backup; prazo do ciclo de cópias em aberto (REL:10) | F01, F22, F05 | V2-F01-E15, V2-F22-E02, V2-F05-E07 | G01, G22, G05 | CP-10, CP-31 | cópia cifrada com prazo de ciclo decidido e política que cita o backup |
| BZ-F | GAP-DEF-46 | Sem destino nem prazo de retenção de log; o log leva e-mail de servidor e IP (REL:10) | F21 | V2-F21-E08 | G21 | CP-06 | destino, prazo e residência do log decididos e registrados (CP-06) |
| BZ-F | GAP-DEF-47 | Sem evidência de revisão de código nem proteção de branch (119 commits diretos); a Vercel publica a cada push sem gate conhecido (REL:10) | F01 | V2-F01-E01, V2-F01-E12 | G01 | - | proteção da master ativa e deploy de PROD só por promoção manual |
| BZ-F | GAP-DEF-48 | App de campo: eas.json incompleto, projectId vazio, sem OTA, nenhum build EAS comprovado, bundle id em conflito, contas de loja não confirmadas (REL:10) | F01, F14 | V2-F01-E13, V2-F14-E11, V2-F14-E08 | G01, G14 | CP-04, CP-24 | builds EAS de HML e produção reais com bundle ids definitivos (CP-04) |
| BZ-F | GAP-DEF-49 | PDF oficial não etiquetado: a prioridade depende de quem recebe o documento e de exigência legal (A11-36; REL:11) | F09, F23 | V2-F09-E15, V2-F23-E06 | G09, G23 | CP-15 | PDF tagged validado após a decisão do CP-15 |
| BZ-F | GAP-DEF-50 | Zoom e reflow do painel, fonte em px, orientação do app, alternativa à assinatura por traço, nível de conformidade alvo, idiomas (A11-12, A11-26, A11-27, A11-40, A11-41, UXD-39; REL:11) | F08, F17, F23, F35 | V2-F23-E04, V2-F17-E15, V2-F08-E08, V2-F08-E09, V2-F35-E09 a V2-F35-E12 | G08, G17, G23, G35 | CP-32, CP-38, CP-39, CP-73 | zoom 400% e reflow medidos; CP-32, CP-38 e CP-39 registrados; idiomas na F35 |
| BZ-F | GAP-DEF-51 | Exigência legal de LBI e eMAG sem verificação (A11-37; REL:11) | F23 | V2-F23-E07 | G23 | CP-32 | relatório técnico e lista eMAG sem declaração de conformidade; parecer no CP-32 |

### N. Divergências entre documentação, teste e código (N.1 a N.12)

12 itens.

| ORIGEM | ID | DESCRIÇÃO | FASE | ETAPA | GATE | CHECKPOINT | EVIDÊNCIA ESPERADA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BZ-N | N.1 | Vigência na escrita: comentários e auditoria anterior afirmam que vale, o teste está em skip e o código está desligado; religar foi decidido por PR:D-04 (REL:01, REL:06) | F00, F03 | V2-F00-E04, V2-F00-E22, V2-F03-E03 | G00, G03 | - | vigência religada, skip removido e comentários corrigidos |
| BZ-N | N.2 | Console do fornecedor: README, db/PENDENCIAS.md e auditoria anterior dizem sem escrita nem provisionamento, mas código e testes mostram 20 rotas; ADR 0008 defasada (REL:04) | F00, F20 | V2-F00-E22, V2-F20-E01 | G00, G20 | - | README e PENDENCIAS corrigidos; ADR 0018 substitui a descrição da ADR 0008 |
| BZ-N | N.3 | 20 vermelhos de sessão encerrada no app de campo: 6 por texto velho, 4 por mock velho, 14 por defeitos reais; teste ou código é a verdade (REL:01) | F00 | V2-F00-E03, V2-F00-E14, V2-F00-E15, V2-F00-E16 | G00 | - | vermelhos classificados por causa e zero testes vermelhos no app de campo |
| BZ-N | N.4 | Laudo no pacote de saída: dois montadores do mesmo modelo e teste escrito sem o conserto; nunca existiu, não é regressão (REL:01, REL:09) | F00, F09 | V2-F00-E12, V2-F09-E02, V2-F09-E11 | G00, G09 | - | laudo do pacote com aviso de equipe e montador único com a rota |
| BZ-N | N.5 | Causa do vermelho de banco-tls: OPENSSL_CONF aponta para arquivo inexistente na máquina, não openssl fora do PATH; hipótese anterior refutada (REL:01) | F00 | V2-F00-E21 | G00 | - | banco-tls 13 de 13 em Windows e Linux com ambiente documentado |
| BZ-N | N.6 | Saída a campo: documentação e apresentação dizem que o agente declara a saída no app, mas o app não chama nenhuma rota (REL:02, REL:03) | F00, F14 | V2-F00-E24, V2-F14-E01 | G00, G14 | CP-02, CP-24 | funcionalidade entregue (CP-02 decidido: implementar, PR:D-25) |
| BZ-N | N.7 | Prova em aparelho do app de campo: três versões (nunca rodou, emulador, iPhone) e nenhum artefato no repositório (REL:10) | F14, F00 | V2-F14-E12, V2-F00-E22 | G14, G00 | - | artefatos de prova em Android e iOS físicos arquivados em evidencias-v2 |
| BZ-N | N.8 | Foto de perfil: o app de campo tem upload completo, o painel não tem nada, e a tela diz que a coordenação passa a ver a foto (REL:02) | F10 | V2-F10-E09 | G10 | CP-18 | foto de perfil construída (CP-18 decidido por PR:D-26); texto da tela coerente com o painel |
| BZ-N | N.9 | Números e zero do README: npm audit em zero e expo-doctor 21 de 21 não conferem; conferir:numeros reprova 13 afirmações (REL:01) | F00 | V2-F00-E17, V2-F00-E19, V2-F00-E22 | G00 | CP-03 | conferir:numeros verde e README com os números reais |
| BZ-N | N.10 | Validade dos documentos emitidos: a apresentação trata laudo e termos como oficiais, mas fly.toml roda com marca d'água DOCUMENTO DE VALIDAÇÃO (REL:09) | F09, F28 | V2-F09-E14, V2-F28-E06 | G09, G28 | CP-14 | marca d'água retirada só após o parecer do CP-14 |
| BZ-N | N.11 | Saída e eliminação: SAIDA-DE-MUNICIPIO.md se contradiz entre os capítulos 2 e 5; o código suspende na hora ao agendar a eliminação (REL:04) | F20, F00 | V2-F20-E04, V2-F00-E22 | G20, G00 | CP-29 | documento coerente com o código; agendar eliminação não suspende |
| BZ-N | N.12 | Mapa: o README cita MapLibre, o código usa Google Maps desde 2026-09-13 (REL:02) | F00 | V2-F00-E22 | G00 | - | README e web/PENDENCIAS.md citam o mapa realmente usado |

## Parte 4. O que a matriz considera pendente

- **Decisão pendente (CP-40).** Resolvido: CP-40 foi decidido por PR:D-20 (lacunas L1 a L26 entram, distribuídas nas fases donas). Nenhuma linha usa mais a FASE `decisão pendente`.
- **Cobertura parcial.** Linhas cuja descrição diz que a etapa cobre só parte do item: ALY:AUT-01 e ALY:AUT-03 (unidade administrativa, item 26 de `21-fora-da-v2.md`), GAP-DEF-42 (REQ-084 e REQ-087), GAP-DEF-41 (relatório de impacto) e a parte de BI e regras de SLA do item 29.
- **Decisões que o roadmap não toma.** J1 a J13 (jurídico e DPO), custos e planos de provedor, as decisões de negócio de Rafael e Alyson e os 59 checkpoints novos (seção 1.9), todos em `18-checkpoints.md` depois da numeração.

## Verificação de cobertura

Total de linhas de tabela na matriz: 660. Contagem por origem:

| ORIGEM | LINHAS |
| --- | --- |
| DP | 87 |
| PR | 68 |
| ALY | 107 |
| REL | 10 |
| BZ-M | 33 |
| BZ-F | 240 |
| BZ-N | 12 |
| FV2 | 44 |
| CP-NOVO | 59 |

Conferência de etapas: todos os IDs `V2-Fnn-Enn` citados existem nos arquivos 03 a 16 e 22 a 27 (617 etapas em 36 fases). Todo checkpoint `CP-NOVO-...` citado numa linha tem sua própria linha na seção 1.9 (59 checkpoints).

Itens SEM etapa de código, com o motivo:

- D-28 (capacidade e commit por etapa) e D-29 (ordem de execução): são regras de trabalho, cumpridas por `00-README.md`, `STATUS.md` e `CLAUDE.md`; sem etapa por desenho.
- L15 e PR:D-24 (só a coordenação classifica e despacha): a correção do critério ALY:CA-01 é decisão; a matriz de autorização (F03-E13) apenas trava o comportamento, sem etapa dedicada.
- GAP-DEF-13 (CON-10): coberto pela F20-E19 (troca obrigatória da credencial inicial do operador), criada na reconciliação final.
- Unidade administrativa dentro do órgão (item 26) em ALY:AUT-01 e ALY:AUT-03: continua fora por decisão (gatilho: órgão grande com várias unidades).

Itens de `21-fora-da-v2.md` que continuam fora depois de PR:D-07 a PR:D-29, cada um com o gatilho na linha FV2 da seção 2:

- Item 3 (relato anônimo), 22 (Redis para limite de taxa), 23 (atestação de aplicativo e CAPTCHA), 26 (unidade), 27 (ambiente dedicado), 28 (previsão meteorológica, sensores e sirenes), 30 (transferência de relato entre municípios), 32 (pacote ui-web).
- Partes de itens retomados: tempo real do chat (5), tema por secretaria (12), Libras em vídeo (13), impersonation completa (14), integrações com 190, 192 e 193 (16), transferência direta entre secretarias (25), BI e regras de SLA do MVP 2 (29).
- Itens 34 (bloqueio global de conta de cidadão) e 35 (tela de carga da geometria no console): a faixa 31 a 44 de PR:D-19 os inclui, mas a lista de dívidas da decisão não os cita e nenhuma etapa os cobre; ficam fora até Rafael confirmar.

Observação sobre nomes: a F03 grafa CP-50 e CP-51; esta matriz usa os nomes de `cps-novos.txt` (CP-50 e CP-51). São os mesmos checkpoints.
