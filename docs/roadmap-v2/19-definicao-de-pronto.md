# Definição de pronto, definição de preparado e padrão de evidência

Este arquivo vale para todas as etapas e todos os gates do Roadmap V2. Cada etapa tem a sua própria "Definition of Done" (específica); o que está aqui é o piso comum, o que precisa estar pronto antes de começar etapas de alto risco (DoR) e como se guarda a evidência.

## 0. REGRAS INEGOCIÁVEIS (decisão de Rafael, 2026-10-02)

1. **Nenhuma etapa avança sem PROVA.** Só se passa para a etapa seguinte quando está provado, com saída de testes E2E e, em toda etapa que toca interface (painel, portal, console, app do agente, app do cidadão), com CAPTURAS DE TELA reais (ou foto do aparelho nos apps) mostrando que o que foi pedido está satisfeito. Sem prova arquivada, a etapa não está concluída, mesmo com os testes unitários verdes.
2. **A interface tem de estar perfeitamente alinhada e bem escrita.** Não se aceita card desalinhado ou grudado, texto fora do lugar, texto cortado ou sobreposto, espaçamento irregular nem texto mal escrito. Tudo é conferido pelo portão visual abaixo antes de a etapa fechar.

### Portão de qualidade visual e de texto (toda etapa que toca interface)

Prova: capturas (Playwright no web, simulador e aparelho nos apps) em desktop e celular, tema claro e escuro, nos estados normal, vazio, erro e carregando, arquivadas em `docs/evidencias-v2/Gnn/V2-Fnn-Enn/capturas/` com o `INDEX.md`. Checklist, item por item, com resultado registrado:

- [ ] Alinhamento: tudo na grade; bordas e linhas de base alinhadas; colunas e cards com a mesma largura e altura quando fazem parte do mesmo grupo.
- [ ] Espaçamento: só os tokens de espaçamento; nenhum card, botão ou bloco grudado em outro; respiro igual entre elementos do mesmo tipo.
- [ ] Nada fora do lugar: sem texto cortado, sobreposto, quebrado no meio da palavra, saindo do card ou escondido atrás de outro elemento; sem rolagem horizontal na página.
- [ ] Hierarquia: título, rótulo, valor e ação com tamanho e peso corretos dos tokens; números tabulares alinhados.
- [ ] Texto bem escrito: português do Brasil correto, sem erro de digitação, sem travessão, rótulo que diz o que digitar, mensagem de erro que diz o que fazer, termos do domínio corretos.
- [ ] Responsivo: 320 px, 768 px e desktop sem quebra; zoom de 200 por cento sem perda.
- [ ] Os dois temas completos, foco visível, contraste AA, estado nunca só por cor.
- [ ] Estados vazios e de erro desenhados, com a mesma qualidade do estado normal.
- [ ] Rafael vê as capturas e aprova; defeito visual é defeito da etapa, não "polimento" adiado.

## 1. Definition of Done comum a toda etapa

Uma etapa NÃO está pronta porque uma tela funciona. Quando aplicável, ela só está pronta com coerência entre as 25 camadas abaixo, com as camadas 26 a 33 da seção 1.1 (quando a etapa toca um módulo ou uma exigência das fases F29 a F35) e com as regras inegociáveis da seção 0. Quando uma camada não se aplica, a etapa diz isso, com o motivo, no campo correspondente do template (nunca em branco).

| # | Camada | O que prova que ela está coberta |
| --- | --- | --- |
| 1 | Regra de negócio | A regra está escrita na etapa e mora no banco ou no pacote compartilhado, nunca só na tela |
| 2 | Modelo de domínio | Entidades, estados e transições nomeados e testados (máquina de estados no `shared`) |
| 3 | Banco | Tabelas, colunas, restrições e índices necessários, com FKs compostas por `organizacao_id` |
| 4 | Migration | Arquivo `NNN_nome.sql` aplicável do zero e sobre produção, com plano de rollback; `migrar --conferir` verde |
| 5 | RLS | Policy ativada e forçada na tabela nova, fail-closed; teste de catálogo verde |
| 6 | Autorização | `exigirPermissao` antes de tocar o banco, ação declarada no manifesto rota x ação, default deny |
| 7 | API | Rota sob `/v1`, validação Zod no servidor, códigos de erro do catálogo, 404 (nunca 403) para recurso de outro município ou órgão |
| 8 | Contrato | OpenAPI atualizado e teste de contrato cliente x rota verde |
| 9 | UX | Fluxo, rótulos que dizem o que digitar, estados de carregamento, vazio, erro e sucesso |
| 10 | Design | Só tokens do design system; sem cor, sombra, raio ou duração fora dos tokens |
| 11 | Frontend ou app | Implementado na superfície correta, sem compartilhar DOM com React Native |
| 12 | Acessibilidade | Teclado, foco, rótulos, contraste e nunca comunicar estado só por cor; leitor de tela em aparelho nas etapas de app |
| 13 | Arquivos | Quando há arquivo: cadeia segura, classe de origem, cota, URL assinada, nada entra em laudo sozinho |
| 14 | Auditoria | Evento append-only com autor, momento e alvo; consulta sensível registrada por usuário nominal |
| 15 | LGPD | Dado pessoal classificado no manifesto, minimizado, com retenção; nenhuma base legal inventada |
| 16 | Observabilidade | Request id, erro centralizado, métrica ou alerta quando a etapa cria fila, rotina ou integração |
| 17 | Tratamento de erro | Falha de rede, de provedor e de validação tratadas; mensagem sem vazar detalhe interno |
| 18 | Idempotência | Criação reenviável sem duplicar (chave do cliente e UNIQUE) |
| 19 | Teste positivo | O caminho feliz com dado realista (sintético) |
| 20 | Teste negativo | Entrada inválida, conta desativada, papel errado, recurso de outro município ou órgão, IDs trocados |
| 21 | Teste de regressão | Kit de regressão da seção 2 e os gates anteriores verdes |
| 22 | E2E | Fluxo ponta a ponta no navegador ou no aparelho, quando a etapa toca a experiência |
| 23 | Documentação | README, `PENDENCIAS.md`, ADR, runbook ou guia atualizados; nenhuma afirmação que o código não sustenta |
| 24 | Evidência | Arquivada conforme a seção 3, sem segredo e sem dado real, com capturas de tela nas etapas de interface |
| 25 | Qualidade visual e de texto | Portão visual da seção 0 aprovado, com capturas |

**Regras de honestidade:** nada é declarado testado sem ter sido rodado; limitação conhecida é listada; "não consegui provar" é um resultado válido e vira pendência explícita; um teste que falha por motivo de ambiente é registrado como tal e não como sucesso.

### 1.1 Camadas adicionais das fases novas (decisões D-07 a D-29, de 2026-10-01)

As camadas 26 a 33 valem em TODA etapa, de qualquer fase, que toque o assunto da camada: não só nas fases F29 a F35. O campo "Definition of Done" da etapa cita as camadas que se aplicam; as que não se aplicam dizem o motivo, como nas camadas 1 a 25.

| # | Camada | O que prova que ela está coberta |
| --- | --- | --- |
| 26 | Idiomas (pt-BR, en, es) | Todo texto de tela, e-mail, SMS e push sai de CHAVE do catálogo de `packages/i18n` (F08-E08), nunca de texto fixo no componente. O teste de cobertura reprova chave sem as três línguas e texto fixo fora do catálogo; en e es podem ficar em `pendentes.json` só até o G35, e o G35 fecha com `pendentes.json` vazio e toda chave revisada (CP-73). Data, número e fuso saem do idioma e do município (F08-E09). O cliente traduz o erro da API pelo `codigo`; a mensagem livre escrita por pessoa não é traduzida; o documento oficial permanece em pt-BR. Etapa de tela depois da F35 traz capturas nos TRÊS idiomas |
| 27 | Tema do município com contraste AA | A cor de destaque do município só é gravada e só é renderizada se passar AA nos dois modos (claro e escuro) pela derivação da F08-E10; reprovou, a gravação responde 422 `contraste_insuficiente` e a tela volta ao tema DC360. Só a lista fechada de tokens derivados muda; nenhuma cor, sombra, raio ou duração fora dos tokens. Capturas com o tema DC360 e com as identidades de prova de F23-E12 e F35, nos dois modos. A identidade de um município nunca aparece em outro |
| 28 | VLibras | Carrega só nas telas da lista, só depois do clique do usuário, desligado por padrão, fora de tela com dado pessoal, com a CSP ajustada e sem alterar o foco nem o contraste (F08-E12, F23-E10); em produção só depois de CP-45 |
| 29 | Geografia em Postgres real | Toda consulta espacial (PostGIS, F32) tem teste que roda em Postgres real: `npm run test:espacial`, CI com `DC360_EXIGE_POSTGIS=1` e HML. A suíte PGlite (`npm run test:isolamento`) continua verde sem a extensão, e a migration espacial é condicional. Raio com teto imposto no banco; plano de consulta arquivado com `Index Scan`; coincidência exata e aproximada distinguidas; teste de divisa entre dois municípios; função privilegiada devolve só identificadores. Latitude e longitude seguem como colunas comuns |
| 30 | Vídeo e conversa do cidadão | O vídeo passa pela cadeia inteira: inspeção do contêiner, validação por bytes, transcodificação em worker isolado e sem rede, derivado sem metadados (GPS) e poster, estados do processamento sem motivo técnico para o cidadão, limites de 30 s e 50 MB impostos antes do envio E no servidor, alternativa em texto obrigatória, moderação por ocultar e remover com motivo, nunca apagar. Vídeo, conversa, telefone, CPF e identidade de provedor ficam fora do agente, do laudo, do CSV, da busca, do sino, da ocorrência e do log (teste de ausência por caminho). Conversa sem tempo real: nenhum temporizador no app |
| 31 | Integração externa só em sandbox até o credenciamento | Cada integração tem porta, adaptador em memória e sandbox, modo `desligado` por padrão, `sandbox` só em DEV e HML e `real` só com a dupla chave (o município liga, o fornecedor libera). Segredo cifrado, nunca em repositório, log, trilha, resposta ou pacote de saída; trilha de toda chamada sem corpo; saída pela fila, idempotente, com tentativas limitadas; nenhuma chamada externa no caminho do pedido do usuário; entrada por webhook assinado com resposta uniforme. Suíte de contrato e falha injetada verdes. A evidência é de sandbox ou de provedor de teste, com dado sintético. Nenhuma tela diz "oficial" ou "homologado" sem o checkpoint decidido |
| 32 | Módulo offline sem duplicar na fila | Todo dado que o app do agente escreve (presença, ocupação de abrigo, evento de tarefa, movimento de estoque, entrega, contagem, aditamento, vistoria) entra pela fila generalizada de `packages/campo` com chave de idempotência e UNIQUE no servidor. Provas: reenvio do mesmo item, queda no meio do envio, dois aparelhos sobre o mesmo recurso, migração da base local com item em voo, reconexão sem duplicar nem perder; o conflito fica registrado (`divergencia`) em vez de descartar; o painel mostra o item uma só vez. Prova em aparelho físico (Android e iOS) com foto do aparelho. A foto de prova nunca é recodificada |
| 33 | Registro se encerra, não se apaga; manifesto de módulo | Incidente, lote de importação, versão de configuração, ajuste de estoque e área do território não têm DELETE: encerram com motivo ou entram como evento ou versão nova. Toda tabela nova de módulo entra no manifesto com classificação (saída, eliminação, pessoal, retenção), no pacote de saída e na eliminação; `npm run test:isolamento` verde; versão imutável nunca é trocada por UPDATE |

## 2. Kit de regressão padrão

Cada etapa lista a regressão específica; o kit abaixo é o mínimo comum, rodado na raiz de `dc360/`:

- `npm run typecheck`
- `npm test` (inclui `regras-de-conteudo`)
- `npm run test:isolamento` (suíte INTEIRA de `db/`, inclui `isolamento.test.ts`, o critério CA-06)
- `npm run test:api`, `npm run test:console`, `npm run test:campo` (quando tocar o app), `npm run test:scripts`
- `npm run test:e2e` e `npm run test:e2e:api` (quando tocar o painel, o portal ou a API em fluxo)
- `npm run test:espacial` (quando tocar geografia ou PostGIS; roda só em Postgres real) e `npm run test:cidadao` (quando tocar o app ou a API do cidadão)
- `npm run auditar` e `npm run conferir:numeros`
- Os gates anteriores: a lista de itens de cada `# GATE Gnn` aprovado anteriormente continua verdadeira.

Se uma etapa posterior quebra algo aprovado antes, o gate anterior volta a REPROVADO e a etapa não fecha.

## 3. Padrão de evidência

**Onde fica:** `docs/evidencias-v2/Gnn/V2-Fnn-Enn/` para cada etapa, `docs/evidencias-v2/Gnn/GATE.md` para o gate e `docs/evidencias-v2/CP-nn/` para cada checkpoint. Cada pasta tem um `INDEX.md` com a lista de arquivos, a data (formato ISO), quem produziu e o hash SHA-256 de cada arquivo.

**O que conta como evidência:**

- saída de teste (arquivo de texto com comando, versão e resultado);
- captura de tela (OBRIGATÓRIA nas etapas de interface) e vídeo curto de E2E, sem dado real;
- relatório curto (o que foi feito, o que foi medido, limitações);
- diff ou lista de arquivos alterados;
- hash e artefato (por exemplo, hash do PDF emitido);
- matriz (por exemplo, a matriz papel x rota gerada);
- log de restore, de migração, de varredura;
- relatório de pentest e checklist;
- resultado em aparelho físico (modelo, versão do sistema, passos, resultado);
- capturas nos três idiomas e nos dois modos de tema, quando a etapa é de tela depois da F35 ou é de idiomas ou identidade;
- saída da suíte de contrato e da falha injetada de uma integração, em sandbox, e o plano de consulta espacial (com `Index Scan`) em Postgres real.

**O que NUNCA entra em evidência:** segredo, token, chave, senha, URL com credencial, credencial ou certificado de integração, dado real de cidadão, de servidor ou de município, CPF real, logotipo de município real sem o termo de uso (CP-95), e arquivo de aparelho pessoal com metadado (EXIF, localização). Evidência com dado pessoal é refeita com dado sintético. Antes de arquivar, passa-se a varredura de segredos do repositório.

**Travessão e o portão de conteúdo (V2-F00-E20, 2026-10-07):** `dc360/packages/shared/test/regras-de-conteudo.test.ts` varre `docs/` inteiro atrás do travessão (U+2014). A saída bruta arquivada (arquivo que não é `.md`, dentro de `docs/evidencias-v2/` e de `docs/auditoria-v2/raw/`) fica fora da varredura, porque reproduz a linha que um teste reprovou e reescrevê-la apagaria a prova; o mesmo vale para o relatório histórico `docs/AUDITORIA-2026-09-30.md`, isento pelo nome exato. O `RESUMO.md`, o `INDEX.md` e qualquer outro `.md` de evidência continuam varridos e reprovam com travessão. Mesmo isenta, a saída bruta continua passando por `redigir` de `dc360/scripts/baseline.mjs` antes de arquivar (troca o travessão por `[travessao]` e apaga JWT de teste). A lista de isenções muda só no próprio teste, com comentário de motivo e caso de âncora.

**Quem confere:** Rafael vê a evidência listada em "Validação humana" da etapa. Evidência sem `INDEX.md` não conta.

## 4. Evidência do gate

`docs/evidencias-v2/Gnn/GATE.md` contém: o checklist do gate com cada item marcado, a etapa e o arquivo de evidência que o prova, a data, quem aprovou, a lista de checkpoints decididos ou adiados (com o que ficou bloqueado), e o resultado da regressão dos gates anteriores. O gate só passa com todos os itens `[x]`. Se um item depender de um checkpoint em aberto, o gate registra "BLOQUEADO por CP-nn" e não passa.

**Checkpoint novo.** Checkpoint que a revisão de 2026-10-01 criou aparece como `CP-NOVO-<ASSUNTO>` até o coordenador numerá-lo; o `GATE.md` o cita por esse nome.

**Gates das fases F29 a F35 e checkpoint de ativação real.** Nesses gates o item de DESENVOLVIMENTO (provado em HML, em sandbox ou em provedor de teste, com dado sintético) é obrigatório. O checkpoint de ATIVAÇÃO REAL (contratação, credenciamento, parecer, escolha humana) pode estar "decidido" ou "adiado por escrito": nesse caso o `GATE.md` lista o que fica bloqueado em produção e o gate pode passar. A regra acima ("BLOQUEADO por CP-nn e não passa") continua valendo para o checkpoint cuja resposta muda o desenho da etapa.

**Reabertura:** se um item de um gate aprovado deixa de ser verdadeiro, o `GATE.md` recebe a anotação "REPROVADO em <data> por <etapa>" e todos os gates seguintes ficam suspensos até a correção.

## 5. Definição de preparado (DoR) para etapas e fases de alto risco

A DoR é a lista do que precisa estar verdadeiro ANTES de começar. Se algum item não está, a execução para e pergunta.

### DoR comum a toda etapa

- [ ] O gate da fase anterior está aprovado (ou a etapa é da fase 00).
- [ ] As dependências de entrada da etapa estão fechadas.
- [ ] Os checkpoints citados na etapa estão decididos, ou a etapa não depende deles.
- [ ] O escopo da etapa e o que ela NÃO faz foram lidos.
- [ ] O kit de regressão estava verde antes de começar (baseline da etapa registrado).

### DoR da F03 e F04 (identidade e isolamento)

- [ ] G02 aprovado (`/v1`, contratos e catálogo de erros).
- [ ] `npm run test:isolamento` verde antes de qualquer migration.
- [ ] A ADR 0009 (pessoa global com contas e vínculos por município, D-08) escrita antes de qualquer migration de papel, de pessoa ou de vínculo.
- [ ] CP-08 (MFA) e CP-09 (dossiê) conhecidos, ou as etapas afetadas marcadas como aguardando.
- [ ] CP-49 conhecido: sem ele a mesma pessoa em mais de um município fica bloqueada em produção.
- [ ] O teste de cruzamento (pessoa com conta em A e B nunca lê dado de A com token de B) escrito antes de a migration de `pessoas` ser aplicada, e a lista de exceções nomeadas em `isolamento.test.ts` aprovada.

### DoR da F06 (antes de QUALQUER upload de arquivo de fora da Defesa Civil)

- [ ] G05 aprovado (manifesto e classificação das tabelas de arquivos).
- [ ] Modelo `arquivos` e classes de origem decididos em ADR.
- [ ] CP-13 (cotas) e CP-12 (PDF) conhecidos.
- [ ] S3 real provado em HML (F06-E15) e `CP-05` decidido.
- [ ] Regra de preservação de prova de vistoria escrita (nunca recodificar).
- [ ] Para o vídeo do cidadão (F06-E18 a E21): tipos e limites decididos em ADR, worker de transcodificação isolado e sem rede previsto (F07-E10) e CP-47 conhecido (sem ele o vídeo não vai à produção).

### DoR da F11 (Portal das secretarias)

- [ ] G10 (painel consolidado), G08 (design system), G07 (workers e arquivos) e G04 (isolamento por órgão) aprovados.
- [ ] HML de pé (G01) e e-mail de teste funcionando (CP-05).
- [ ] CP-08 (MFA) decidido e CP-19 (e-mail externo) decidido ou etapas de notificação marcadas como aguardando.
- [ ] Teste Obras x Saúde verde e catálogo por órgão verde.
- [ ] ADR do portal (domínio, CSP, sessão, audiência) escrita.
- [ ] Login em dois passos (pessoa, depois município) e troca de município provados na F03 (F03-E16, F03-E18); CP-50 e CP-51 conhecidos, ou as etapas do órgão externo marcadas como aguardando.

### DoR do início efetivo do App do Cidadão (F15 em diante)

- [ ] G12, G14 e G33 aprovados (portal homologado com secretaria real; app do agente; configuração por município) e CP-36 (replanejamento) feito. Na ordem de execução a F33 vem antes da F15.
- [ ] HML, cadeia de arquivos (G06), workers (G07), e-mail (CP-04, CP-19) e observabilidade P0 prontos.
- [ ] Mecanismos genéricos de privacidade existem (F05-E06 a E08); o parecer (CP-11) NÃO é necessário para começar tabelas, e é necessário para abrir ao público.
- [ ] CP-25 (papel PostgreSQL da API pública) a decidir na primeira etapa da F15, antes de publicar.
- [ ] Contas de loja (CP-04) para os builds internos.
- [ ] CPF: validação, cifra, hash e máscara escritas (F05-E13) antes de qualquer coluna de CPF; CP-46 só é necessário para CPF real e para abrir ao público.

### DoR da abertura pública do canal do cidadão (beta externo)

- [ ] G17, G18, G34 e G19 aprovados.
- [ ] CP-11 (privacidade), CP-26 (moderação), CP-28 (habilitação) e CP-46 (base legal e finalidade do CPF) decididos.
- [ ] Vídeo, conversa e cada provedor de login (gov.br, SMS, Google, Apple) ficam DESLIGADOS até o checkpoint do recurso (CP-47, CP-94, CP-91, CP-92, CP-93) e são ligados por município.
- [ ] G25 aprovado com pentest externo concluído e remediado (CP-33).
- [ ] Triagem funcionando no município que habilita o canal (processo, equipe e horário).

### DoR do piloto (F27)

- [ ] G26 (POC aprovada), G21 (observabilidade), G22 (backup e DR provados), G23 (acessibilidade), G24 (desempenho) e G25 (segurança) aprovados.
- [ ] CP-34 (piloto), CP-07 (plantão), CP-19 (provedores de produção) e CP-31 (RPO e RTO) decididos.
- [ ] CP-75 (quais módulos entram) decidido; só os módulos escolhidos e com os próprios checkpoints respondidos sobem ao piloto (F27-E07 a E09).
- [ ] CP-76 decidido e, para cada integração real, a DoR de ativar integração real (seção 5) cumprida.
- [ ] Termo do piloto com período, escopo, suporte e critério de parada.
- [ ] Marca d'água de validação mantida nos documentos até CP-14.

### DoR da F32 (PostGIS e dados territoriais)

- [ ] G08 aprovado, e G00 a G08 verdes. Na ordem de execução a F32 é a 10ª fase: vem logo depois da F08 e ANTES da F09 (D-29); F09, F10 e F16 consomem o que ela entrega.
- [ ] PostGIS disponível em Postgres real no CI e no ambiente local (F01-E21) e a imagem de teste roda `npm run test:espacial`; no provedor e no HML, `CREATE EXTENSION` permitido (F01-E22), ou CP-44 adiado por escrito com HML e PRODUÇÃO desta fase bloqueados.
- [ ] ADR do modelo territorial (F32-E01) aprovada antes de qualquer migration: malha municipal COMUM sem `organizacao_id`, sem GRANT à aplicação e lida só por função privilegiada que devolve identificadores; bairro, setor, área de risco e imóvel DO município, com RLS ativada e forçada e sem DELETE; convenção geográfica fixada.
- [ ] `npm run test:isolamento` (PGlite, sem a extensão) verde antes da primeira migration, e a migration espacial desenhada como condicional.
- [ ] CP-85, CP-86 e CP-87 conhecidos: sem eles a fase roda só com malha, áreas e imóvel sintéticos e fica bloqueado o dado real.
- [ ] A tabela de reconciliação com F10-E24, F10-E17, F10-E19, F15-E13, F16-E05, F16-E06 e F16-E07 está combinada, para o módulo geográfico em TypeScript e o PostGIS não divergirem.

### DoR da F29 (incidentes e abrigos) e da F30 (logística humanitária)

- [ ] F29: G19 e G32 aprovados (G19 é o gate imediato na ordem de execução); F30: G29 aprovado.
- [ ] A ADR de cada fase (F29-E01, F30-E01) aprovada antes de migration: o incidente agrupa por tabela de vínculo e NUNCA escreve em `ocorrencias` (RN-08); o saldo de estoque nunca é coluna, é a soma dos movimentos, e ajuste só existe aprovado por outra pessoa (RN-09).
- [ ] As ações novas de `permissoes.ts` estão no manifesto rota x ação; CP-63 e CP-62 conhecidos: o padrão proposto libera o desenvolvimento e a produção fica bloqueada até a decisão.
- [ ] Checkpoints da logística conhecidos, com a produção bloqueada onde faltar resposta: CP-66, CP-67, CP-68, CP-69, CP-70, CP-71 e CP-72.
- [ ] CP-64 e CP-65 conhecidos: o abrigo guarda só contagens até o segundo ser decidido.
- [ ] O motor offline (`packages/campo`) com testes verdes e a fila generalizada desenhada para os tipos novos (presença, ocupação, evento de tarefa, movimento, entrega, contagem); Android e iOS físicos disponíveis para o E2E de fechamento (F29-E18, F30-E18).
- [ ] O texto "presença não é socorro" e a regra "foto de entrega nunca é recodificada" aprovados antes das telas.
- [ ] Nenhuma função SECURITY DEFINER nova prevista; se a etapa precisar de uma, volta para decisão.

### DoR da F31 (integrações externas oficiais)

- [ ] G30 aprovado e todos os anteriores na ordem de execução, em especial G07 (fila e worker), G09 (documento imutável), G10 (painel), G15 (modo `publica` e cotas) e G32 (tipo geométrico e índice espacial).
- [ ] A ADR das integrações (F31-E01) com as nove cláusulas aprovada antes de qualquer adaptador: uma porta por integração, modos `desligado`, `sandbox` e `real` com dupla chave, segredo cifrado, trilha, fila, webhook assinado e rede segura.
- [ ] CP-77 (onde mora a chave mestra dos segredos por município) decidido, ou a produção da fase bloqueada por escrito; CP-06 (subprocessadores) conhecido.
- [ ] Nenhuma credencial real, certificado ou dado real entra no repositório nem na evidência: tudo é feito primeiro contra memória e sandbox simulado.
- [ ] Os checkpoints de cada integração conhecidos (CP-78, CP-79, CP-80, CP-81, CP-82, CP-83, CP-84): o que depende de credenciamento fica em sandbox e não promete integração sem API ou autorização.

### DoR de ativar uma integração REAL (passo de produção, uma integração por vez)

- [ ] G31 aprovado, com a suíte de contrato e a falha injetada verdes para esse adaptador, e o webhook, o proxy WMS e o alerta público no escopo do pentest (F25-E16) já testados.
- [ ] O checkpoint da integração decidido (CP-78, CP-80, CP-81, CP-82, CP-83 ou CP-84), com o credenciamento, o contrato e a instância em mãos do município e do fornecedor, e CP-77 decidido.
- [ ] Inventário de dados e finalidade da integração, `docs/SUBPROCESSADORES.md` e o manifesto atualizados (F31-E19); parecer jurídico quando a integração leva dado pessoal; CP-06 decidido.
- [ ] Consentimento revogável e parada funcionando (WhatsApp); modelos aprovados pelo provedor; exercício de mesa do alerta público com segunda pessoa e simulação por padrão.
- [ ] A liberação do fornecedor no console e a ativação pelo município acontecem em atos separados, com trilha; existe o plano de desligar (voltar a `desligado`) e o rollback ensaiado.
- [ ] Para o piloto: CP-76 decidido. Nenhuma tela diz "oficial" ou "homologado" antes de tudo isso.

### DoR da F34 (canal do cidadão ampliado)

- [ ] G17 e G18 aprovados e, em cadeia, G15, G16 e G32; G06 e G07 aprovados: a cadeia de arquivos e a transcodificação isolada (F06-E18 a E21, F07-E10, F07-E11) existem antes de qualquer captura de vídeo.
- [ ] A ADR do canal ampliado (F34-E01) aprovada: conversa SEM tempo real, vídeo único, provedores por interface e a tabela "quem vê o quê".
- [ ] A interface de provedores (F15-E18), as cotas persistentes (F15-E10, `consumir_cota` da F03-E19) e o bloqueio manual (F15-E11) já existem; nenhuma chave de cota paralela.
- [ ] CP-47, CP-94, CP-91, CP-92, CP-93 e CP-46 conhecidos: tudo roda em HML com provedor falso ou de teste e dado sintético, e nenhum CPF real; a regra da Apple para login social é NÃO CONFIRMADA e é conferida na execução.
- [ ] CP-10, CP-11, CP-13, CP-26, CP-27 e CP-28 conhecidos, com a abertura pública bloqueada até G25 e CP-33.
- [ ] Vídeo e conversa nascem DESLIGADOS por município (F34-E02) e a lista de colunas do console é atualizada na mesma etapa.

### DoR da F35 (idiomas, VLibras e identidade por município)

- [ ] Todos os gates anteriores na ordem de execução aprovados (G00 a G08, G32, G09 a G14, G33, G15 a G18, G34, G19, G29, G30 e G31): a F35 traduz e veste as telas das fases novas.
- [ ] A infraestrutura da F08 pronta: catálogo `packages/i18n` e `pendentes.json` (F08-E08), formatação por idioma e fuso (F08-E09), derivação de tema com validação AA (F08-E10, F08-E11), ponto do VLibras (F08-E12) e o portão visual por superfície (F08-E13).
- [ ] A ADR de idiomas e identidade (F35-E01) aprovada, com a divergência registrada sobre documentos oficiais (permanecem em pt-BR) e a ordem de resolução do idioma.
- [ ] CP-73 (quem revisa en e es) e CP-45 (como integrar e se o script do governo pode carregar) conhecidos; CP-95 conhecido (sem ele só logotipo sintético de ensaio).
- [ ] O conjunto de identidades de prova (as que a F23-E12 valida) e a lista de telas elegíveis ao VLibras definidos antes das capturas.
- [ ] A lista de chaves pendentes está completa: nenhuma etapa das fases anteriores deixou texto fixo escondido.

### DoR da candidata a produção (F28)

- [ ] G27 aprovado e relatório do piloto arquivado.
- [ ] Pareceres jurídicos pendentes resolvidos ou aceitos por escrito (CP-11, CP-14, CP-29, CP-30, CP-32).
- [ ] Contrato, SLA, subprocessadores e política publicada.
- [ ] Estado de cada integração e provedor externo em produção registrado (F28-E15), os módulos novos reexecutados na tag (F28-E14) e as rotinas recorrentes entregues à operação (F28-E16, CP-74).
