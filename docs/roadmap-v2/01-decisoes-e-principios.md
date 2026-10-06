# Decisões, princípios e contradições resolvidas

> **ATENÇÃO (2026-10-01): este arquivo foi emendado.** Rafael declarou que a V2 é absoluta: tudo que foi planejado entra nela. As decisões D-07 a D-29 da seção 11 EMENDAM ou REVOGAM partes de D-02, D-03, D-06 e A-01 (marcadas abaixo) e a lista de "fora da V2" de `21-fora-da-v2.md`. Onde este arquivo e a seção 11 divergem, vale a seção 11. O estado vivo do trabalho está em `STATUS.md`.

Este arquivo reúne o que o roadmap trata como FECHADO, os princípios que governam a execução e as contradições que o próprio pedido e as fontes continham, com a resolução adotada. Não reabra silenciosamente nada daqui: mudança passa por checkpoint ou por nova decisão registrada.

## 1. Hierarquia das fontes

Quando houver divergência, vale nesta ordem:

1. Decisões humanas confirmadas no pedido do roadmap (D-01 a D-06 e A-01 a A-04, abaixo).
2. `docs/auditoria-v2/12-decision-pack.md`.
3. Baseline Zero (`docs/AUDITORIA-V2-BASELINE-ZERO.md`) e os relatórios `docs/auditoria-v2/01` a `11`.
4. O estado técnico atual do código, só para saber o que existe hoje.
5. O documento do Alyson (`docs/referencia/ESPECIFICACAO_TECNICA_PRELIMINAR.md`), como origem de requisitos, riscos e objetivos.
6. Documentação antiga.

O código determina o ESTADO ATUAL. O Decision Pack e as decisões do pedido determinam a DIREÇÃO da V2. Os relatórios de auditoria são evidência histórica e nunca são alterados por este roadmap.

## 2. Decisões humanas confirmadas

| ID | Decisão | O que muda no plano | Onde aparece |
| --- | --- | --- | --- |
| D-01 | PORTAL DAS SECRETARIAS primeiro, APP DO CIDADÃO depois; as duas superfícies não são desenvolvidas em paralelo. Sequência: fundação, portal, estabilização e homologação, cidadão | O início efetivo do cidadão (F15) depende do gate G12 (portal homologado com secretaria real) | F11, F12, F15, 02-mapa-de-dependencias |
| D-02 (REVOGADA por D-08) | Usuários autenticados do Portal pertencem ao PRÓPRIO município. Concessionárias, órgãos estaduais e identidades que operam em vários municípios NÃO fazem parte do modelo autenticado da V2; no curto prazo, conta separada por município ou mecanismo legado controlado (o ofício por link de uso único), sem identidade multi-tenant global | Sem pessoa global; `orgao_vinculos` por município; ofício por link continua durante a transição | F03-E01, F03-E05, F04-E12, 21-fora-da-v2 itens 1 e 2 |
| D-03 (EMENDADA por D-07) | Canal do cidadão: conta obrigatória, verificação por e-mail, sem relato anônimo, sem vídeo, sem chat livre. Habilitado por município; padrão DESLIGADO; a prefeitura habilita quando tiver processo e equipe de triagem | Login por e-mail OTP; anti-abuso base; opt-in por município; checklist de prontidão | F15, F16, F17, CP-28 |
| D-04 | A Fase 0 de estabilização é OBRIGATÓRIA. Nenhuma feature relevante da V2 começa antes de fechar os bloqueadores do Gate G00 | Nada novo entra antes do G00 (vigência, vermelhos, contas, pacote de saída, `npm audit`, documentação, decisão sobre saída a campo, baseline) | F00, G00 |
| D-05 | DOCUMENTO EMITIDO É IMUTÁVEL. Conteúdo não muda silenciosamente; PDF oficial recuperável; hash, snapshot dos dados e versão do template ficam associados; correção produz nova versão ou substituição; a versão anterior é preservada conforme a política aplicável | Tabela `documentos_emitidos` append-only, PDF guardado, montador único, pacote de saída com o mesmo artefato | F09 |
| D-06 (ESTENDIDA por D-09) | Até parecer jurídico ou municipal específico, NÃO chamar o mecanismo técnico de "assinatura eletrônica" como conclusão jurídica: usar APROVAÇÃO AUTENTICADA (usuário nominal, MFA, data e hora, documento, versão, hash, decisão, trilha). A arquitetura continua preparada para assinatura simples, avançada, ICP-Brasil e provedor externo | Nomenclatura em todas as telas e documentos; interface plugável de assinatura sem implementação além da aprovação autenticada | F09, CP-14, 21-fora-da-v2 item 11 |

## 3. Ajustes às recomendações do Decision Pack

| ID | Ajuste | Como entra no plano |
| --- | --- | --- |
| A-01 (REVOGADA por D-08) | Na V2 aceita-se conscientemente que UM MESMO E-MAIL INSTITUCIONAL NÃO precisa suportar duas contas municipais ativas ao mesmo tempo (órgãos multi-município ficaram fora). Não redesenhar o login agora. Registrar em ADR e backlog | ADR 0009 (F03-E01) e e-mail único entre contas ativas (F03-E09); item 1 de `21-fora-da-v2.md` |
| A-02 | O papel de banco da API pública NÃO é automaticamente `dc360_app`. Checkpoint de segurança antes de publicar a API do cidadão: `dc360_app` ou papel próprio de menor privilégio, decidido por grants reais, functions, RLS, superfície de ataque, testes negativos e manutenção, não por elegância | CP-25 em F15-E01; a ADR 0015 registra a tabela comparativa |
| A-03 | Rate limit em duas camadas: (1) limite grosseiro antes da lógica de negócio, quando a infraestrutura permitir; (2) cotas persistentes por conta, IP e ação no banco. Sem Redis, salvo evidência de necessidade | F15-E09 (camada 1), F15-E10 (camada 2); item 22 de `21-fora-da-v2.md` |
| A-04 | Enquanto J8 não estiver decidido, usar APROVAÇÃO AUTENTICADA e não ASSINATURA ELETRÔNICA nas features cuja validade jurídica ainda não foi definida | F09, CP-14 |

## 4. Cinco superfícies

1. `apps/web`: painel da Defesa Civil e da Prefeitura (existe).
2. `apps/campo`: app React Native do agente de campo (existe).
3. `apps/console`: console do fornecedor DC360 (existe).
4. `apps/portal`: NOVO portal web autenticado das secretarias e órgãos, aplicação separada do painel, com domínio e deploy próprios e audiência `dc360-portal`.
5. `apps/cidadao`: NOVO app React Native para Android e iOS, do cidadão (não é PWA), sem reutilizar a interface do agente.

Mais o backend (`apps/api`, `packages/shared`) e o banco (`db`), compatíveis com as cinco.

## 5. Arquitetura-alvo em uma página

Resumo das decisões técnicas do Decision Pack que o roadmap executa; o detalhe e a rastreabilidade estão nos arquivos de fase e em `17-rastreabilidade.md`.

- **Identidade:** híbrido refinado. Servidor e usuário de órgão ficam em `usuarios` do município (usuário de órgão com papel genérico `usuario_orgao` e vínculo temporal em `orgao_vinculos`); o cidadão tem realm separado (`dc360-cidadao`, tabelas próprias); sem pessoa global. JWT enxuto (`sub`, `org`, `sid`, `aud`, `exp`); papel, vínculo, órgão e situação da conta são relidos do banco por requisição.
- **Tenants:** `organizacao_id` com RLS forçada, como hoje. O ÓRGÃO é contexto dentro do tenant, não tenant: vem da rota e é validado contra o vínculo vivo no banco. A regra do CLAUDE.md "a organização vem do token e de mais lugar nenhum" continua valendo para o tenant, e a ADR 0009 registra o esclarecimento sobre o órgão.
- **Órgãos:** o órgão nunca consulta `ocorrencias`. Ele lê o encaminhamento (evolução de `providencias`, sete estados, eventos append-only) e um dossiê mínimo montado pela Defesa Civil. RLS por órgão fail-closed só nas tabelas desse domínio.
- **Cidadão:** relato é entidade própria, com protocolo próprio; ocorrência oficial só nasce na conversão, com vínculo auditável. O relato não consome protocolo operacional, não conta nas métricas oficiais, não vira evidência, não aparece em laudo e não é fato confirmado.
- **Autorização:** ator no banco (`app.ator_tipo`, `app.ator_id`, `app.orgao_atual`), vigência por requisição, manifesto rota x ação com default deny, matriz empírica papel x rota como teste fixo.
- **Arquivos:** modelo `arquivos` com vínculos por domínio e classes de origem; cadeia quarentena, verificação, normalização, ativo ou rejeitado, executada em worker; foto de vistoria é prova e nunca é recodificada; promoção de anexo a evidência é ato humano.
- **Documentos:** emitido imutável (PDF guardado, snapshot, hash, versão do template), aprovação autenticada, montador único.
- **Notificações:** e-mail pelo adaptador atual (Resend, destino configurável), push por APNs e FCM diretos com `aparelhos` multiaplicativo; SMS fora da V2.
- **Aplicativos:** tokens, cliente de API e, no segundo consumidor, o núcleo de upload são pacotes compartilhados; interface web e interface nativa não se compartilham.

## 6. Princípios de execução

1. **Gates cumulativos.** O fluxo é preparar, implementar, testar, testar negativamente, testar regressão, homologar, produzir evidência, documentar, gate, próxima etapa. Se uma etapa posterior quebra algo aprovado antes, o gate anterior volta a REPROVADO.
2. **Completude.** Uma feature não está pronta porque uma tela funciona: valem as 24 camadas de `19-definicao-de-pronto.md`.
3. **Preservação.** Não se reescreve o projeto. Cada etapa classifica o que existe como MANTER, CORRIGIR, REFATORAR, EXPANDIR ou SUBSTITUIR; SUBSTITUIR exige justificativa.
4. **Escopo fechado.** Cada etapa diz o que NÃO faz. O que é adiado mora em `21-fora-da-v2.md` e não reaparece escondido.
5. **Honestidade.** Nada é declarado testado sem ter sido rodado; limitação conhecida é listada.
6. **Decisão humana é do humano.** Os checkpoints (`18-checkpoints.md`) param a execução na etapa que dependem deles. J1 a J13 nunca são decididos pelo roadmap.
7. **Segurança por padrão.** Default negado, fail-closed, 404 e não 403, organização só do token, escrita sempre depois de `exigirPermissao`.
8. **Sem cronograma inventado.** O roadmap usa tamanho, complexidade, risco e paralelismo, não datas.

## 7. O que existe hoje e como cada coisa é tratada

| Área existente | Classificação | Observação |
| --- | --- | --- |
| Isolamento entre municípios (RLS forçada, FKs compostas, `SET LOCAL`, 404) | MANTER e EXPANDIR | Provado em `db/test/isolamento.test.ts` (CA-06); a V2 o estende ao órgão e ao cidadão sem enfraquecê-lo |
| Trilha append-only por ausência de policy de UPDATE e DELETE | MANTER | Correção entra como evento novo |
| Motor offline (`packages/campo`) | MANTER | Corrigir tratamento de 401 (F00-E06) e expandir para saída a campo (F14) |
| Autenticação (scrypt, JWT de 15 minutos, refresh rotativo com detecção de reuso) | MANTER | Corrigir a vigência (F00-E04); enxugar as claims (F03-E02) |
| Vigência de conta, papel e sessão | CORRIGIR | Desligada de propósito em `servidor.ts`; religar na escrita (F00) e em toda requisição (F03) |
| `providencias` | EXPANDIR | Vira o encaminhamento; não se cria tabela paralela (F04-E02) |
| `evidencias` | CORRIGIR e EXPANDIR | Imutável após confirmação e com promoção de anexo (F06) |
| Documentos (`apps/api/src/documentos/`, rota `documentos`) | REFATORAR e EXPANDIR | Montador único e `documentos_emitidos` (F09) |
| Segundo montador do pacote de saída (`saida/pacote.ts`) | SUBSTITUIR | Dois montadores do mesmo modelo divergem (laudo sem aviso de equipe, fotos de todas as vistorias, identificador que não valida); o montador único os substitui (F09-E02, F09-E11) |
| Limitador de taxa em memória por processo | SUBSTITUIR | Não vale entre instâncias e divide balde atrás de NAT móvel; as duas camadas de A-03 o substituem na API pública (F15-E09, F15-E10) |
| Senha inicial digitada por quem cria a conta | SUBSTITUIR | Sem convite nem verificação de e-mail (BZ-D:IDN-19); o convite de uso único a substitui (F03-E10) |
| Painel (`apps/web`) | MANTER, CORRIGIR, EXPANDIR | Partes funcionais ficam; vermelhos fechados (F00); consolidação em F10; build de produção sem PGlite (F10-E12) |
| Console (`apps/console`) | MANTER e EXPANDIR | Real e com testes; reemissão de acesso, aviso na suspensão, auditoria própria (F20) |
| Ofício por link de uso único | MANTER (transição) | Até o portal e CP-22 |
| Armazenamento por URL assinada (ADR 0005) | MANTER | Provar S3 real em HML (F06-E15) |
| Infraestrutura Fly, Vercel, Supabase | MANTER e EXPANDIR | Ambiente de HML, worker e API pública (F01, F07, F15) |
| CI (`verificar.yml`) | EXPANDIR | Passa a rodar o que hoje só roda local (F01-E03) |
| Tokens de design | REFATORAR | Fonte única `design-tokens` (F08) |

## 8. ADRs

**Novas (numeração a partir de 0009, em `docs/adr/`):**

| ADR | Assunto | Etapa que a cria |
| --- | --- | --- |
| 0009 | Identidade com PESSOA GLOBAL e conta por município (D-08, que emenda A-01); token de um município por vez; órgão como contexto dentro do tenant | V2-F03-E01 |
| 0010 | Isolamento por órgão (RLS fail-closed, dossiê, órgão não consulta `ocorrencias`) | V2-F04-E01 |
| 0011 | Modelo de arquivos, classes, promoção e imutabilidade de prova | V2-F06-E01 |
| 0012 | Modo de serviço (api, worker, publica) numa só imagem | V2-F07-E01 |
| 0013 | Documento emitido imutável e aprovação autenticada | V2-F09-E01 |
| 0014 | `apps/portal` como aplicação separada | V2-F11-E01 |
| 0015 | Realm do cidadão e papel de banco da API pública (A-02) | V2-F15-E01 |
| 0016 | Relato como entidade própria, protocolos separados | V2-F16-E01 |
| 0017 | `apps/cidadao` (Expo, bundle id, EAS) | V2-F17-E01 |
| 0018 | Responsabilidade do fornecedor x prefeitura; sem impersonation | V2-F20-E01 |

**Existentes que a V2 emenda (a emenda é feita pela ADR nova indicada e referenciada na ADR antiga, sem apagá-la):**

- ADR 0001 (isolamento no banco): estendida ao órgão pela 0010.
- ADR 0003 (painel em dois modos): o portal não tem modo local; ver 0014.
- ADR 0004 (autenticação própria): o cidadão tem realm separado; ver 0015.
- ADR 0006 (administrador é o teto do município): papel genérico de órgão e vínculo; ver 0009.
- ADR 0008 (console sem credencial que veja dois municípios): suporte e ausência de impersonation; ver 0018. O relatório 04 já a considera desatualizada quanto a "sem rota de escrita".

**ADRs das fases novas (F29 a F35) e das etapas novas:** os arquivos de fase citam as ADRs que cada etapa cria pelo assunto (por exemplo ADR de integrações da F31-E01, de PostGIS da F32-E01, de configuração versionada da F33, do canal ampliado da F34 e de idiomas e identidade visual da F35). A numeração é feita na execução, a partir da 0019 e na ordem em que as etapas rodam, e cada ADR é registrada em `docs/adr/`. Nenhuma etapa deve fixar número de ADR antes de executar.

## 9. Contradições encontradas e como foram resolvidas

| # | Contradição | Resolução |
| --- | --- | --- |
| 1 | O exemplo de gate do pedido chama G11 de "PORTAL HOMOLOGADO" e diz que ele libera a Fase 13, mas a Fase 12 é a homologação com secretaria real | G11 = PORTAL FUNCIONAL EM HML (E2E, MFA, convite, fluxo completo em dados sintéticos). G12 = PORTAL HOMOLOGADO COM SECRETARIA REAL. Só G12 libera F13, a versão final de F14 e F15 |
| 2 | A cadeia de arquivos (F06) vem antes dos workers (F07), mas a verificação deve rodar fora do processo da API antes de qualquer upload público | A cadeia nasce na F06 como módulo independente do runner, provada com runner local; a F07 a isola num worker. Nenhum upload externo (portal ou cidadão) antes do G07 |
| 3 | R6 (contratar e-mail, storage, HML) é necessário para convite (F03) e HML (F01), antes do portal | CP de R6 dividido: CP-05 (HML, antes de F01-E11) e CP-19 (uso externo, antes de qualquer pessoa real) |
| 4 | Observabilidade completa (F21) vem "antes do piloto", mas é necessária antes do primeiro usuário externo (F12) | O subconjunto P0 entra na F01-E14; a F21 completa. G12 exige o P0 |
| 5 | Restore e DR (F22) vêm tarde, mas migrations de papel, policy e grant começam na F03 | Etapa de restore das 46 migrações em máquina limpa entra na F00-E25 |
| 6 | Reinspeção (F13) vem antes da consolidação do app (F14) | F13 entrega backend, painel e o mínimo no app já existente (tarefa normal com motivo); a prova em aparelho físico é do G14, que reabre a prova da reinspeção (F14-E13) |
| 7 | App do cidadão (F17) e triagem (F18) parecem sequenciais, mas dependem apenas da F16 | Podem andar lado a lado; os fluxos F e G só fecham em G18 e G19 |
| 8 | O console (F20) vem depois do cidadão, mas colunas novas em `organizacoes` (habilitação do canal, IBGE) são lidas por ele | O teste de colunas e grants do console entra em F15-E13; F20 só consolida |
| 9 | ALY:FLU-04 pede "encerrar e reabrir ocorrência"; DP:T14 e o pedido fecham "encerrada é terminal; fato novo vira ocorrência vinculada" | Segue a decisão mais nova; o desvio é registrado como divergência conhecida de FLU-04 e submetido ao Alyson em CP-23 |
| 10 | ALY:VIS-01 e ALY:RNF-10 falam em PWA; a V2 usa React Native nos dois aplicativos | Registrado em `21-fora-da-v2.md` (item 20); o painel e o portal são web responsivos |
| 11 | ALY:RNF-09 fala em WCAG 2.1 AA; o alvo técnico do roadmap é WCAG 2.2 AA | 2.2 AA mantém quase tudo o que a 2.1 AA pede (o critério de análise de código 4.1.1 saiu na 2.2) e acrescenta alvo de toque, foco não obscurecido e autenticação acessível; a aplicabilidade legal é CP-32 |
| 12 | O portão de conteúdo (`regras-de-conteudo.test.ts`) já está vermelho hoje por 4 linhas que não são do roadmap | Fica como etapa explícita da F00 (F00-E20); este conjunto de documentos foi escrito para não acrescentar nenhuma violação |
| 13 | Os identificadores dos documentos colidem em prefixo (AUT-01 do Alyson e AUT-05 da Matriz D; DOC-01 e DOC-11; D1 a D13 com significados diferentes) | Prefixos de origem em todo o roadmap (`ALY:`, `BZ-D:`, `BZ-F:`, `BZ-M:`, `BZ-N:`, `DP:`, `PR:`, `REL:`); a matriz `17` os separa |
| 14 | O nome "Fase 0" tem três sentidos (Descoberta no Alyson; o protótipo em `docs/ROADMAP_FASE0.md`; a estabilização do roadmap) | Neste roadmap, "Fase 0" é sempre a F00 de estabilização; os checkpoints `CP1` a `CP9` do protótipo são outra coisa e os da V2 se escrevem `CP-nn` |
| 15 | O pedido propõe 20 arquivos de saída; o conjunto precisa também de matrizes e de "fora da V2" em destaque | Dois arquivos a mais (`20-matrizes.md`, `21-fora-da-v2.md`) |
| 16 | A auditoria classificou os 20 vermelhos do app de campo como 6 de texto velho, 4 de mock velho e 14 defeitos reais, o que soma 24 | Rodando o jest, são 2 de texto velho, 4 de mock velho e 14 defeitos reais; a F00 usa essa contagem (F00-E14 a E16) |
| 17 | A auditoria aponta 4 linhas vermelhas no portão de conteúdo | São 5 ocorrências em 3 arquivos; a F00-E20 trata as cinco |
| 18 | O README diz que o armazenamento real nunca foi provado; `fly.toml` e `docs/COLOCAR-DE-PE.md` mostram um bucket real com 7 objetos | A F06-E15 prova o que falta (versionamento, SigV4, CORS do PUT) em HML e não presume nem nega o que existe em produção |
| 19 | O exemplo de etapa do contrato mandava religar a vigência E tratar a sessão rotacionada; em `auth/vigencia.ts` a regra de sessão rotacionada é deliberada | A F00-E04 só religa; a cadeia de sessão rotacionada é da F00-E07 (migration de família da sessão) |
| 20 | O contrato dizia que "sair da conta" não apaga a vistoria começada; os testes exigem apenas AVISO antes de apagar | A F00-E15 segue o que os testes e a decisão de 2026-09-15 pedem: aviso, e nenhuma vistoria apagada em silêncio |
| 21 | DP:T42 pede "ADR curta" para teste reescrito, mas a numeração 0009 em diante está reservada | As decisões de teste ficam em `docs/DECISOES-DE-TESTE-DA-FASE-00.md` (F00-E02 e E03) |
| 22 | DP:T07 usa `app.ator_id` também para restringir a autoria na trilha (`WITH CHECK autor_id = app_ator_id()`) | A F03-E06 não faz isso na V2 (exigiria ator no modo local do painel) e registra a pendência em `apps/api/PENDENCIAS.md` |
| 23 | DP:T09 pede checagem de vigência "na mesma transação"; o contrato pedia "via comTenant" | A F03-E03 faz uma consulta por requisição; fundir com a consulta do contexto é otimização posterior |
| 24 | DP:T37 diz que só o administrador nomeia o gestor do órgão; a primeira versão da matriz de autorização dava essa ação ao coordenador | Seguiu-se o DP:T37 (F10-E03; `20-matrizes.md` corrigida) |
| 25 | A F04 só permite devolver encaminhamento em `enviado`; quem descobre depois do aceite que o item não é do órgão só tem o pedido de esclarecimento | Decidido em CP-20 (se `aceito` também devolve, a F04-E03 muda) |
| 26 | O contrato criava `relato_anexos` na F06-E02, mas a tabela `relatos` só nasce na F16-E02 | A F06-E02 cria só `encaminhamento_anexos`; `relato_anexos` nasce na F16-E12 com o mesmo molde |
| 27 | O contrato chamava F28-E10 de "município real", mas eliminar o município do piloto destrói dado real | Renomeada: exportação e eliminação provadas em produção com município de ensaio; o piloto real não é eliminado |
| 28 | `console_operadores` e `console_codigos_de_recuperacao` não estão em nenhuma lista de saída ou eliminação | Entram na lista de plataforma do manifesto (F05-E04) |
| 29 | `vercel.json` do painel não define CSP e o token fica em `sessionStorage` (`dados/http.ts`) | Tratado na revisão de segurança (F25-E02) e na ADR do portal (F11-E01), que define CSP e sessão próprios |

## 10. Limites conhecidos deste roadmap

- Os tamanhos, as complexidades e as dependências refletem a leitura da auditoria e do código em 2026-09-30; o roadmap não foi prototipado.
- Caminhos de arquivo foram confirmados por busca no repositório no momento da escrita; onde a etapa cria algo novo, o caminho é "a criar" em diretório existente. Nomes de tabelas novas são propostos e fixados na migration.
- Custos de infraestrutura, planos de provedor e prazos de loja são NÃO CONFIRMADOS e dependem de CP-04, CP-05, CP-19 e CP-31.
- Os pareceres J1 a J13 estão fora do controle técnico; o roadmap mostra o que se implementa sem eles e o que eles bloqueiam.

## 11. Decisões de 2026-10-01 que ampliam a V2 (D-07 a D-29)

Resposta de Rafael às perguntas de escopo. A V2 passa a conter tudo que foi planejado. Onde havia conflito, as respostas abaixo são a decisão. Itens marcados PREMISSA foram assumidos por mim para não parar o trabalho e podem ser corrigidos.

| ID | Decisão | Revoga ou emenda | Onde entra |
| --- | --- | --- | --- |
| D-07 | Canal do cidadão ampliado entra: vídeo (até 30 s e 50 MB, 1 por relato), chat por relato (mensagens, sem tempo real), login gov.br, SMS e login social (Google e Apple). Relato anônimo NÃO entra. CPF é OBRIGATÓRIO no relato identificado, com finalidade escrita e parecer jurídico antes de abrir ao público | Emenda D-03; reverte DP:T19 (CPF não coletar) | F34 (nova), e ajustes em F15, F16, F17, F18, F19, F06, F07 |
| D-08 | Órgão externo multi-município entra, com PESSOA GLOBAL e vínculos: uma conta da pessoa, vínculo em cada município e órgão; o token vale para UM município por vez e a pessoa escolhe o município ao entrar. O isolamento entre municípios continua como hoje | Revoga D-02 e A-01; emenda DP:T01 e T05 | F03 (reescrita), F04, F10, F11, F20 |
| D-09 | Assinatura avançada e ICP-Brasil entram por PROVEDOR EXTERNO via API. A nomenclatura continua "aprovação autenticada" até o parecer J8 | Estende D-06 | F09 (etapas novas) |
| D-10 | Suporte assistido do fornecedor entra: o administrador do município libera acesso temporário, nominal, com MFA, curto (por exemplo 2 horas), SOMENTE LEITURA, com trilha no município. Impersonation completa NÃO entra | Emenda ADR 0008, DP:T38, CP-30 | F20 (etapas novas), F10 (liberação), ADR 0018 |
| D-11 | White-label: logotipo, nome e cor de destaque por município, com contraste AA validado automaticamente. Sem tema por secretaria e sem tema completo editável | Estende DP:T17 | F08 (infra), F35 (nova) |
| D-12 | Idiomas inglês e espanhol e VLibras nas telas web e nos apps. Sem Libras em vídeo | Estende DP:K20 | F08 (infra), F35 (nova) |
| D-13 | Tracing distribuído e SLO por rota crítica entram (PREMISSA: OpenTelemetry com destino configurável) | Estende DP:T33 | F21 (etapas novas) |
| D-14 | Integrações externas: conectores reais onde há API pública (WhatsApp oficial, camadas GIS GeoJSON, KML e WMS, dados do Cemaden a confirmar); adaptador e sandbox prontos para S2ID, SEI e Defesa Civil Alerta, ativados só com credenciamento | Estende ALY §12 | F31 (nova) |
| D-15 | Abrigos, incidentes e logística humanitária entram COMPLETOS (INC-01 a INC-04, ABR-01, LOG-01 a LOG-07, RN-08, RN-09), no painel e no app do agente offline | Retira os itens 16 e 17 de `21-fora-da-v2.md` | F29 e F30 (novas), depois da F19 e antes da F20 |
| D-16 | PostGIS e busca por raio, imóvel e área de risco (ALY:GEO-02) entram | Reverte DP:T36 | F32 (nova), ajustes em F01 e F16 |
| D-17 | Importação de lote por CSV, configuração versionada de tipos, severidades, prazos, formulários e modelos, e checklist por tipo com perguntas condicionais, entram (ALY:OCO-08, CFG-01, RN-10, VIS-05) | Retira os itens 18 e 19 de `21-fora-da-v2.md` | F33 (nova), ajustes em F09 e F14 |
| D-18 | Escalonamento acima do gestor do órgão e competência por COBRADE ou território entram | Retira os itens 24 e 25 de `21-fora-da-v2.md`; emenda DP:T10 e T12 | F04, F10, F11 (etapas novas) |
| D-19 | Dívidas operacionais entram: SBOM, licenças e scan de contêiner, lint, trava de migration concorrente, redundância de máquinas, exercício anual de DR, pentest recorrente, ciclo de vida do operador do console, cobrança e contrato no console, indicadores por órgão, estilo inline do painel | Retira os itens 31 a 44 de `21-fora-da-v2.md` | F01, F10, F20, F22, F25 (etapas novas) |
| D-20 | As lacunas L1 a L26 entram, DISTRIBUÍDAS como etapas novas ao fim das fases donas | Resolve CP-40 | Fases donas de cada lacuna |
| D-21 | Reabrir ocorrência encerrada é permitido com motivo por 30 dias (configurável por município); depois disso, só ocorrência vinculada | Resolve CP-23 e K17; atende ALY:FLU-04 | F13 (reescrita) |
| D-22 | Painel e portal são site responsivo E instalável na tela inicial (PWA), sem funcionar offline | Retira o item 20 de `21-fora-da-v2.md` | F10 e F11 (etapas novas) |
| D-23 | Encaminhamento só pode ser devolvido ANTES do aceite | Resolve parte de CP-20 | F04 (já é assim) |
| D-24 | Só a coordenação classifica e despacha; o operador não. O critério ALY:CA-01 é corrigido nesse sentido | Resolve a divergência M4 | Matriz de autorização |
| D-25 | PREMISSA: a saída a campo é implementada no app (CP-02 = implementar) | Resolve CP-02 | F14-E01 |
| D-26 | PREMISSA: a foto de perfil é construída no painel (CP-18 = construir) | Resolve CP-18 | F10-E09 |
| D-27 | PREMISSA: o segundo fator do agente de campo é opcional, com tela de código no app | Resolve GAP-DEF-10 | F14 (etapa nova) |
| D-28 | Capacidade: 1 pessoa dedicada (CP-01). Um commit por etapa aprovada, com mensagem `V2-Fnn-Enn: resumo`. O repositório é privado. Seção "Retomada do Roadmap V2" no CLAUDE.md | Resolve CP-01 | Todas |
| D-29 | ORDEM DE EXECUÇÃO das fases: os números das fases novas (F29 a F35) não indicam a ordem; vale a tabela de ordem de execução de `STATUS.md` e de `02-mapa-de-dependencias.md`. A regra "cada gate depende de todos os anteriores" vale NA ORDEM DE EXECUÇÃO | Substitui a numeração como ordem | `STATUS.md`, `02` |

Fases novas criadas por estas decisões: **F29** Incidentes e abrigos, **F30** Logística humanitária, **F31** Integrações externas oficiais, **F32** PostGIS e dados territoriais, **F33** Configuração por município, checklist por tipo e importação, **F34** Canal do cidadão ampliado, **F35** Idiomas, VLibras e identidade visual por município.

O que continua fora da V2: **nada além do que o próprio Rafael tirar**. Os itens de `21-fora-da-v2.md` que não foram retomados acima (anonimato do relato, Libras em vídeo, impersonation completa, tema por secretaria, tema completo editável, tempo real do chat, ambiente dedicado, previsão meteorológica e sensores, formulários do "MVP 2" além dos de D-17, transferência de relato entre municípios, pacote `ui-web`, unidade administrativa dentro do órgão) permanecem fora até nova decisão; cada um continua com o gatilho descrito lá.

## 12. Reconciliações da revisão de escopo (2026-10-02)

Ao fim da revisão (pacotes RV-01 a RV-15) os pacotes divergiam em alguns pontos. A resolução adotada, já aplicada nos arquivos de fase:

| Ponto | Resolução | Onde |
| --- | --- | --- |
| Reabrir ocorrência (CP-23) | Decidido por D-21: reabrir por 30 dias, configurável; depois, ocorrência vinculada. `estadoTerminal` vira `estaEncerrada` | F13-E06, F09-E09, F10-E13 e E27, F26 |
| Código IBGE e geometria do município | A F32 vem antes da F15: F32-E03 cria o código; F15-E13 fica só com `canal_cidadao_habilitado`; a malha é comum, acessada só por função | F32, F15-E13, F16-E05 |
| Ponto geográfico do relato | Um único módulo `geo.ts` e o tipo `ponto_geografico` (F32-E02); sem `ponto_do_relato` | F16-E06, F32-E02 |
| Raio na lista e no mapa do painel | F10-E24 usa `ocorrencias_no_raio` (F32-E08); a prova de Haversine sai | F10-E24, F32 |
| Console x painel | F10-E16 prova só com API e E2E; a prova do console é a F20-E11 | F10-E16, F20-E11 |
| Idioma do usuário | Começa em `localStorage` (F11-E27) e passa a `pessoas.idioma` no servidor (F35-E09) | F11-E27, F35 |
| Contrato `.strict()` do relato | Regra única na F16-E09; F26 e F27 emendam de forma explícita | F16-E09, F34, F35 |
| Webhook do WhatsApp | Modo `api` (o modo `publica` é do cidadão); a F31 não cria relato por WhatsApp | F31-E06 e E10 |
| Classes de arquivo | Abertas a emenda por ADR; `comprovante_de_entrega` da F30 e a guarda de recodificação cobrem-no | F06-E01, F06-E07, F30-E17 |
| Upload retomável | Servidor e `packages/campo` na F06-E21; tela e aparelho na F14-E22 | F06-E21, F14-E22 |
| Item sem etapa (GAP-DEF-13) | Criada a F20-E19, troca obrigatória da credencial inicial do operador do console | F20-E19 |
| Checkpoints | Nomes provisórios unificados e numerados de CP-41 a CP-95; CP-01, 02, 18, 20, 23, 30 e 40 atualizados pelas decisões | `18-checkpoints.md` |
