# Execução, validação e relatórios da V2

Decisão D-30 (Rafael, 2026-10-07). Este arquivo é a política que diz como uma etapa é executada, quem a valida, como o gate decide, como o estado é reconstruído sem depender da conversa e como o relatório para o sócio é gerado. Ele vale para todas as 618 etapas sem editá-las: o campo "Validação humana" de cada etapa passa a ser lido pela regra da seção 4.

A versão desta política que aprovou uma etapa fica gravada no `VEREDITO.md` dela (`politica_validacao_sha`, o último commit que alterou este arquivo). Mudar a política é mudar este arquivo num commit; validação com este arquivo modificado e não commitado é BLOCKED.

## 1. Por que existe

O gargalo da V2 deixou de ser escrever código e passou a ser validar. 500 das 618 etapas terminam em "Rafael vê" ou "Rafael aprova", e uma pessoa só não valida 618 etapas à mão. Ao mesmo tempo, o projeto vai atravessar dezenas de sessões do Claude Code, e a memória da conversa não é confiável. A resposta é: o repositório é a memória, agentes independentes validam o que é objetivamente validável sobre um commit exato, e Rafael fica com o que exige pessoa.

## 2. Princípios

1. **O repositório é a memória; a conversa é rascunho.**
2. **Prova mais objetiva possível** (E1 a E5, seção 8).
3. **Quem escreve não aprova.** Implementador, validador e gatekeeper rodam em contextos separados. O PASS nasce de evidência conferida sobre um SHA exato.
4. **Fail-closed, e prova não se falsifica.** Na dúvida, BLOCKED. BLOCKED só vira PASS quando o bloqueio é removido e a validação é refeita. Seguir sem prova é RISCO ACEITO, registrado à parte, nunca PASS.
5. **Determinístico onde puder, julgamento onde precisar.** Seleção de validador, conferência de evidência, regressão e status saem de script.
6. **Proporcional ao risco.** Etapa de risco baixo não recebe quatro revisores.
7. **Relatório é visão do estado**, nunca com status mais forte que o registrado.
8. **Emenda explícita, nunca afrouxamento silencioso.** Toda troca de validação humana por prova automatizada fica registrada no VEREDITO.

## 3. Regra de contexto

A conversa nunca é fonte de verdade sobre o projeto. Toda sessão que vai agir sobre a V2 reconstrói o estado a partir do repositório, nesta ordem: estado gerado (`ESTADO-ATUAL.md`), etapa, gate anterior, checkpoints citados, decisões e ADRs citados, evidência arquivada, código real no SHA corrente. Se a memória da conversa, um handoff ou uma nota divergirem do repositório, vale o repositório e a divergência é registrada. Uma sessão só afirma sobre etapa anterior o que consegue apontar num arquivo ou num commit.

| Pergunta | Fonte | Nunca |
| --- | --- | --- |
| Objetivo e escopo da etapa | bloco da etapa no arquivo da fase | resumo do implementador |
| Estado das etapas, gates e CPs | `STATUS.md` (seções 6, 7 e 8), `VEREDITO.md`, `GATE.md` | memória do chat, handoff |
| Decisões | `01-decisoes-e-principios.md`, `docs/adr/`, `docs/evidencias-v2/CP-nn/decisao.md` | conversa |
| Estado técnico | código e testes no SHA | descrição de etapa anterior |
| Prova | `docs/evidencias-v2/`, com `INDEX.md` e SHA-256 | afirmação sem arquivo |
| Validação | `validacao/<sha7>/` e `VEREDITO.md` | "o agente disse que passou" |
| Prosseguir sem prova | `RISCO-ACEITO.md` | status inflado |

`ESTADO-ATUAL.md` é gerado por script e nunca editado à mão. Handoff de sessão (`.claude/handoffs/`) é efêmero e fica fora do git; o que nele for durável vira skill ou documentação.

## 4. Regra global de validação

Todo critério de etapa ou gate é validado por quem não o implementou, sobre o SHA exato do candidato, com evidência arquivada compatível com a natureza do critério e no nível mais objetivo disponível (seção 8).

O campo "Validação humana" de cada etapa passa a ser lido assim: o que nele for objetivamente verificável por teste, execução ou inspeção é validado por agente independente sob o gatekeeper, e Rafael recebe o veredito e a evidência. Continua exigindo pessoa somente o que depende de:

- aparelho físico;
- percepção humana nos casos de risco visual da seção 10;
- texto de produto;
- decisão de produto ou de domínio;
- ambiente externo inacessível;
- responsabilidade profissional ou jurídica;
- ou o que o roadmap reserve nominalmente a uma pessoa por razão substantiva.

Toda substituição de validação humana por prova automatizada é registrada no VEREDITO, com o critério original, a prova que o substituiu e o motivo. Prosseguir sem prova só é possível por RISCO ACEITO registrado, nos critérios que o admitem (seção 7), e nunca é chamado de validado. A aprovação de gate é sempre de Rafael.

**Limites que esta regra assume:**

| Área | Agente pode | Agente não substitui |
| --- | --- | --- |
| Acessibilidade | axe (quando existir), teclado, foco, contraste, semântica, DOM, teste estático | VoiceOver, TalkBack, aparelho físico, pessoa com deficiência, avaliação externa (CP-32) |
| LGPD | mapear dado, conferir minimização, retenção, acesso, exportação, eliminação, logs | base legal, controlador e operador, DPO, jurídico |
| Segurança | revisão de código, threat model, IDOR, tenant e órgão cruzados, fuzz, grants, RLS, segredos, red-team | pentest externo independente (CP-33) |
| Mobile | emulador Android (nível E2), teste de componente | aparelho físico quando a etapa o exige (E4) |
| UX | heurística, fluxo no navegador | usabilidade com pessoa real |
| Independência | outro contexto, outro modelo, tentativa de reprovação | revisor humano que não escreveu o sistema (CP-07) |

## 5. Papéis

| Papel | Contexto | Recebe | Pode | Não pode | Produz |
| --- | --- | --- | --- | --- | --- |
| Implementador | sessão própria | pacote de contexto da etapa | editar código, testes e docs da etapa; commit candidato e push no ramo da fase | marcar VALIDADA ou CONCLUÍDA | candidato, evidência, RESUMO com fatos e justificativa separados |
| Validador | subagente novo por dimensão, sobre o SHA fixado | bloco da etapa, diff base..SHA, fatos do RESUMO, evidência, decisões registradas (premissas e "O que NÃO deve"), run do CI do SHA, app executável | ler, rodar, criar ou modificar só `validacao/<sha7>/<dimensao>.md` | editar produto ou arquivo de outra dimensão, ler a justificativa do implementador | relatório da dimensão (seção 15) |
| Gatekeeper | sessão nova | etapa ou gate e o SHA | rodar scripts, chamar validadores, acrescentar dimensão, commit de registro | corrigir, tirar dimensão obrigatória, emitir RISCO ACEITO, converter BLOCKED em PASS | `VEREDITO.md`, rascunho de `RISCO-ACEITO.md` para quem pode aceitar |
| Rafael | n/a | VEREDITO, evidência, folhas de contato | decidir CP, aprovar texto de produto, testar aparelho, aceitar risco permitido, aprovar gate, merge em master | n/a | decisões, aprovação do gate |

A seleção obrigatória de validadores sai de script (seção 9); o gatekeeper só acrescenta, nunca tira. Os validadores do V0 rodam **em sequência**, na mesma working tree; o paralelismo fica para quando houver isolamento por worktree ou processo.

## 6. Ciclo Git e status

```
ramo da fase v2/fnn, com PR rascunho para master aberto no início da fase
IMPLEMENTAR
 -> testes locais, regressão seletiva, evidência do implementador
 -> COMMIT CANDIDATO        "V2-Fnn-Enn: candidato, <resumo>"
 -> REGISTRO DO CANDIDATO   "V2-Fnn-Enn: registro do candidato <sha7>" (só STATUS e ESTADO:
                            a etapa vira IMPLEMENTADA citando o SHA; um commit não cita o próprio SHA)
 -> PUSH no ramo da fase    (dispara o CI daquele SHA)
 -> sessão NOVA: GATEKEEPER fixa o SHA, confere o CI do SHA,
    chama os VALIDADORES sobre exatamente aquele SHA
 -> VEREDITO: PASS | FAIL | BLOCKED
 -> COMMIT DE REGISTRO      "V2-Fnn-Enn: registro da validação de <sha7>, <veredito>"
FAIL: correção -> "V2-Fnn-Enn: correção N, <resumo>" -> novo SHA -> nova validação
```

Regras:

- **Commit candidato não é CONCLUÍDA.** Significa só "candidato implementado para validação".
- **Sem amend, rebase, squash ou force-push** no ramo da fase. Toda rodada fica no histórico.
- **O commit de registro não revalida o produto.** O produto validado continua sendo o `sha_validado`. O registro roda só conferências documentais e estruturais rápidas: o diff `<sha_validado>..HEAD` dentro da lista permitida, `INDEX.md` e SHA-256, formato dos relatórios e do VEREDITO, `gerar-estado --conferir`, varredura de segredos e de travessão. Lista permitida: `docs/evidencias-v2/**/validacao/**`, `VEREDITO.md`, `RISCO-ACEITO.md`, `STATUS.md`, `ESTADO-ATUAL.md` e `docs/relatorios-v2/**`. Se tocar qualquer arquivo fora dela, a validação é invalidada e refeita sobre um SHA novo.
- **Revalidação depois de FAIL:** as dimensões que reprovaram rodam de novo inteiras. As que passaram só são herdadas se o diff entre os dois SHAs não toca o mapa de impacto delas, e isso fica registrado como "herdado de <sha7>, sem impacto". Senão, rodam de novo.
- **A validação roda com HEAD igual ao SHA e árvore limpa.** O gatekeeper registra a árvore antes e depois de cada validador. Mudança além do arquivo daquela dimensão deixa a dimensão BLOCKED, e a árvore é restaurada antes do próximo validador.
- **CI:** o gatekeeper lê o run do SHA e avalia job a job. Vale como run do candidato o run de um commit descendente cujo diff contra o candidato toque só a lista permitida (caso do registro do candidato, que sobe no mesmo push), porque o produto é o mesmo; o VEREDITO cita os dois SHAs. Run pendente: espera. Run inexistente: BLOCKED. Job vermelho: FAIL ou BLOCKED na dimensão ligada a ele, conforme a causa. O CI completo é obrigatório no candidato de etapa de risco alto ou crítico e no fechamento de gate. O CI reduzido nas demais só vale se a medição real de minutos o justificar.
- **Merge em master** só com o gate APROVADO, por Rafael, com commit de merge (nunca squash), para os SHAs citados nos VEREDITOs continuarem existindo em master.
- **Autorização durável (D-30):** commit candidato, commit de correção, commit de registro e push no ramo da fase não pedem autorização a cada vez. Merge e push em master, e qualquer reescrita de histórico, continuam com Rafael.
- **Toda regra que aprova precisa estar num commit.** Esta política, o mapa de impacto e a skill do gatekeeper com mudança não commitada deixam a validação BLOCKED.

**Status de etapa:**

| Status | Significa |
| --- | --- |
| PENDENTE | não começou |
| EM ANDAMENTO | implementador trabalhando |
| IMPLEMENTADA | candidato `<sha7>` no ramo, com push; aguarda validação |
| EM VALIDAÇÃO | gatekeeper rodando sobre o SHA |
| VALIDADA | PASS em `<sha7>`, sem pendência E4 ou E5 |
| VALIDADA COM PENDÊNCIA HUMANA | PASS no que é de agente; lista o E4 ou E5 que falta |
| REPROVADA | FAIL; volta a EM ANDAMENTO no commit de correção |
| BLOQUEADA | BLOCKED com motivo; sai só removendo o bloqueio e revalidando |
| CONCLUÍDA | validada e com as pendências humanas resolvidas com evidência |
| CONCLUÍDA COM RISCO ACEITO | algum critério permitido seguiu sem prova, com `RISCO-ACEITO.md` |
| CANCELADA | diz o motivo e a decisão |

**Status de gate:** NÃO INICIADO, EM ANDAMENTO, RECOMENDADO (pelo gatekeeper), APROVADO (por Rafael, com o merge feito), APROVADO COM RISCO ACEITO, REPROVADO (na primeira conferência) e REABERTO.

**REABERTO** é o estado atual de um gate já aprovado quando um risco aceito expira ou uma regressão quebra um item dele, com o motivo ("condição expirada: <risco>" ou "regressão: <etapa>"). O fato histórico "APROVADO em <data> por <quem>" nunca é reescrito: o `GATE.md` ganha uma linha nova. Gate reaberto bloqueia o avanço das fases que dependem dele até ser revalidado.

## 7. Vereditos e risco aceito

| Termo | Significa | Quem emite | Onde fica |
| --- | --- | --- | --- |
| PASS | foi provado, com evidência compatível | validador e gatekeeper | `validacao/`, `VEREDITO.md` |
| FAIL | a prova mostrou defeito | validador e gatekeeper | idem |
| BLOCKED | não foi possível provar (ambiente, CP aberto, evidência ausente, conflito) | validador e gatekeeper | idem |
| N/A | a dimensão não se aplica: a tag que a exige está ausente | gatekeeper | `VEREDITO.md` |
| RISCO ACEITO | DECISÃO de prosseguir sem a prova num critério permitido | dono do critério | `RISCO-ACEITO.md` |

- RISCO ACEITO vale para um critério nomeado, nunca para a etapa inteira. O registro traz o critério, por que não foi provado, o risco, a mitigação, o dono, a validade (data ou gate de reavaliação) e quem aceitou. O BLOCKED original continua no histórico.
- Quando o risco aceito vence, nada é reescrito: a etapa fica BLOQUEADA ("condição expirada") e o gate em que ele foi aceito fica REABERTO.
- **Quem aceita:** Rafael, para critério técnico e de produto; Alyson, para critério de domínio; para critério de responsabilidade jurídica ou de DPO, só o profissional.

**Não admitem RISCO ACEITO:**

1. isolamento entre municípios: RLS forçada, organização vinda do token, `test:isolamento` (CA-06), 404 entre municípios;
2. autenticação, autorização e vigência (`exigirPermissao`, sessão revogada, conta desativada) e todo critério P0 de segurança (origem BZ-F:P0-SEG);
3. vazamento de dado pessoal ou de dado de outra equipe ou órgão;
4. trilha de auditoria append-only e "registro não se apaga";
5. perda ou duplicação de dado do campo (fila offline);
6. imutabilidade de documento emitido (D-05);
7. dependência de execução com vulnerabilidade conhecida: exceção só pela política do CP-03, nunca por aceite avulso;
8. etapa sem nenhuma prova (regra 0.1 de `19-definicao-de-pronto.md`);
9. as condições "Reabre se" de qualquer gate;
10. critério que o gate declare inegociável, e qualquer validação E5 (pentest, parecer jurídico, DPO, avaliação externa) que o gate declare obrigatória: ela é inegociável naquele gate;
11. critério de responsabilidade jurídica ou de DPO decidido por quem não é o profissional.

**Tratamentos do gatekeeper:**

- **N/A:** só com a tag ausente, citada no motivo. Dimensão obrigatória pela matriz nunca é N/A.
- **Instável:** até 2 repetições. Passou só na repetição: PASS com achado "instável", que entra na política T42 (`dc360/scripts/portao-de-skip.mjs`). Mais de uma instabilidade na mesma suíte no mesmo gate: BLOCKED.
- **Ambiente indisponível:** BLOCKED, nomeando o ambiente.
- **Requisito impossível:** BLOCKED com proposta de emenda; o gatekeeper nunca dispensa critério.
- **Evidência vencida:** a evidência guarda o SHA em que foi produzida; diff posterior que toca o mapa de impacto dela a manda para a regressão.
- **Conflito entre validadores:** uma arbitragem em Opus com os dois relatórios; persistindo, BLOCKED para Rafael.

## 8. Hierarquia de evidência

| Nível | O que é | Quem produz |
| --- | --- | --- |
| E1 | prova automatizada reproduzível; em risco alto e crítico, inclui a prova de que o teste morde (desfazer o conserto ou aplicar a variante da sonda, ver vermelho, restaurar, ver verde) | script, CI |
| E2 | execução independente por agente (navegador, emulador, cenário negativo, rede inspecionada) | validador |
| E3a | revisão por agente especialista | validador |
| E3b | revisão por pessoa especialista que não escreveu o código (CP-07) | pessoa |
| E4 | validação humana obrigatória | Rafael ou Alyson |
| E5 | validação externa profissional | contratado |

**Nenhum PASS sem evidência compatível com a natureza e o nível de prova exigido.** Quando E1 ou E2 forem possíveis para o critério, E3a não pode ser usado para evitá-los. E3a nunca substitui E4 nem E5. Não se pede E4 quando E1 ou E2 provam.

| Dimensão | Evidência mínima para PASS |
| --- | --- |
| QA | E1 ou E2 com execução: comando, saída arquivada, ao menos um cenário negativo por critério |
| Segurança, banco, red-team | E1 ou E2 com execução: sonda, query, requisição negativa; em risco alto, prova de que o teste morde |
| UX | checklist heurístico estruturado (heurísticas e portão visual da DoD) item a item, capturas citadas por arquivo, tentativas de reprovação |
| Acessibilidade | E1 onde houver (teste estático, e2e de teclado, axe quando existir) e checklist WCAG aplicável com capturas |
| LGPD técnico | inventário dos dados tocados, fluxo, controles (minimização, retenção, acesso, eliminação) e evidência de implementação (arquivo e linha, teste) |
| Especificação | matriz requisito, implementação e evidência cobrindo cada item da DoD e os cinco campos de teste |
| Infra e CI | run do CI do SHA, job a job, com artefato |

## 9. Tags e validadores

As tags são derivadas por script, sem editar etapa, da união de três fontes: campos da etapa (Risco, Prioridade, Migração, Impacto LGPD, Validação humana), prefixos de camada em "O que deve ser implementado" e caminhos do diff.

| Tag | Derivação |
| --- | --- |
| UI | `Frontend:`, "portão visual" na Validação humana, diff em `apps/web/src` ou `apps/console/src` |
| MOBILE | `Mobile:`, diff em `apps/campo/` ou `packages/campo/` |
| OFFLINE | diff em transporte, fila ou sincronização do campo |
| A11Y | `Acessibilidade:`, ou tag UI ou MOBILE |
| AUTH | diff em `apps/api/src/auth/`, sessão, senha ou token |
| AUTHZ | `Autorização:`, `exigirPermissao`, catálogo de ações |
| TENANT | `organizacao_id`, `SET LOCAL`, `comTenant`, `test:isolamento` |
| RLS | migration com `POLICY`, `GRANT` ou `ROW LEVEL SECURITY` |
| DB, MIGRATION | "Migração necessária: Sim", `Migration:`, `Banco:`, diff em `db/` |
| API, PUBLIC_API | `API:`; rota sem autenticação ou do cidadão |
| LGPD | "Impacto LGPD" diferente de "Não se aplica" |
| DOCUMENTO | laudo, termo, montador, `saida/` |
| ARQUIVO | `Arquivos:`, upload, storage |
| INFRA | `Infraestrutura:`, `.github/`, `fly.toml` |

| Situação | Validadores obrigatórios | Opus revisa? |
| --- | --- | --- |
| Toda etapa | qa | não |
| UI | qa, ux, acessibilidade | não; Rafael só pelos gatilhos da seção 10 |
| MOBILE ou OFFLINE | qa (emulador quando houver), testes | não; aparelho físico conforme a etapa |
| AUTH ou AUTHZ | qa, seguranca-aplicacao, red-team | sim |
| TENANT ou RLS | qa, banco-de-dados, red-team | sim |
| MIGRATION sem RLS | banco-de-dados, testes | não |
| LGPD | qa, privacidade-lgpd | sim se estrutural (manifesto, retenção, eliminação) |
| PUBLIC_API ou ARQUIVO público | qa, seguranca-aplicacao, red-team | sim |
| DOCUMENTO | qa, especificacao | sim se imutabilidade ou assinatura |
| INFRA | engenharia-entrega | não, salvo segredo ou produção |

Na coluna "Opus revisa?", "sim" vale só para etapa de Risco alto ou crítico; em risco baixo ou médio a revisão fica nos validadores Sonnet, salvo gatilho da seção 12. Calibração de 2026-10-07: sem esse corte, a matriz mandava Opus em 315 das 618 etapas, porque AUTH, AUTHZ, TENANT, RLS e PUBLIC_API aparecem em muitas etapas de risco médio.

Teto de 4 validadores por etapa: qa sempre, mais os três de maior risco. Os agentes do usuário não declaram modelo e herdariam o da sessão, por isso toda chamada passa o modelo explicitamente. O prompt do validador sobrescreve a régua e o formato de saída de cada agente (a régua do projeto é OWASP ASVS 4.0 nível 2).

## 10. Portão visual por risco

As capturas continuam obrigatórias em toda etapa de interface (regra 1 de `19-definicao-de-pronto.md`, seção 0). O que muda é quem as confere: Rafael é obrigatório (E4 visual) quando algum gatilho dispara; na rotina, conferem os validadores. O gatilho é detectado por script e, na dúvida, conta como disparado.

| Gatilho | Detecção |
| --- | --- |
| novo padrão visual | diff cria componente compartilhado novo ou token novo (`tokens.css`, pasta de componentes) |
| nova superfície ou tela | rota nova, página nova em `apps/*/src/paginas/`, tela nova no app |
| nova jornada relevante | seção nova no e2e, ou fluxo novo descrito na etapa |
| texto de produto | literal em português visível ao usuário criado ou alterado (catálogo de mensagens, arquivos de texto de tela) |
| tela pública | rota sem login, cidadão, portal anônimo, validação de documento |
| mudança grande de UX | tela com "Estado atual" CRIAR ou SUBSTITUIR, ou prefixo `UX:` |
| fluxo de erro crítico | mensagem de sessão, permissão, perda de dado ou falha de envio |
| gate de fase | sempre (smoke visual) |
| critério E4 explícito na etapa | sempre |

**Texto da etapa ou diff.** Antes da implementação, só o texto da etapa existe, e quase toda etapa futura "cria" algo. Por isso o gatilho visual é decidido pelo DIFF do candidato, na validação. Pelo texto, só disparam sozinhos: critério E4 explícito, tela pública e gate de fase. Os demais (padrão visual novo, tela nova, jornada nova, texto de produto, mudança grande de UX, erro crítico) ficam "a decidir pelo diff". Calibração de 2026-10-07: decidido só pelo texto, Rafael ficaria obrigatório em 207 das 250 etapas de interface, contra o objetivo do portão por risco. Mudança grande de UX pelo diff: página nova, rota nova, ou alteração em mais de um arquivo de tela com mudança de estrutura (elemento novo de layout, não só texto ou estilo); na dúvida, dispara.

**Validadores de interface não saem pelo teto.** Em etapa com tag UI e sem gatilho visual para Rafael, `ux` é obrigatório e não é cortado pelo teto de 4 (senão ninguém olharia a tela); o teto corta primeiro a duplicidade entre `red-team` e `seguranca-aplicacao` em risco médio.

UI de rotina: Playwright com capturas (1280 e 390 px, claro e escuro; 320 e 768 px quando a etapa pede), validador de UX lendo as capturas, validador de acessibilidade e amostragem (seção 11).

## 11. Amostragem humana

- **Sempre, sem ser amostra:** todo E4 e todo gatilho visual.
- **Por gate:** um smoke humano do fluxo de maior risco do gate, e a folha de contato de uma etapa de UI de rotina por superfície tocada no gate (painel, console, portal, app de campo, app do cidadão), escolhida pelo gatekeeper entre as de maior diff visual.
- **Por etapa de risco crítico:** uma prova sorteada pelo gatekeeper.
- **Calibração inicial:** cada superfície começa reforçada (Rafael vê a folha de contato de todas as etapas de UI dela) na primeira fase em que é tocada sob esta política, e sai de reforçada depois de um gate sem falso verde nela.
- **Adaptação:** um falso verde (defeito que um validador aprovou e que Rafael, o CI ou uma etapa posterior achou) deixa aquela dimensão ou superfície reforçada (Opus como segunda revisão e Rafael confere todas as provas dela) até um gate inteiro sem falso verde. Defeito plantado não detectado tem o mesmo efeito.

## 12. Modelos e escalonamento

Sonnet é o padrão. Opus é exceção, preferencialmente como planejador e revisor: em etapa aberta (várias arquiteturas plausíveis de alto impacto), Opus escreve uma nota de decisão, Sonnet implementa e Opus revisa. Opus e Sonnet são da mesma família: modelo diferente é diversidade parcial, não auditoria externa. O custo é medido nas primeiras etapas da F01 e a tabela é recalibrada no G01.

| Tipo de tarefa | Modelo padrão | Quando escalar | Revisor |
| --- | --- | --- | --- |
| CRUD e endpoint com contrato definido | Sonnet | tocar autorização ou tenant | Sonnet (qa, testes) |
| UI e tela | Sonnet | fluxo novo sem especificação de UX | ux e acessibilidade |
| Migration definida | Sonnet | RLS, grant, policy ou dado existente | banco-de-dados; Opus se RLS |
| Bug com causa conhecida | Sonnet | 2 tentativas sem achar a causa | testes |
| E2E e evidência | Sonnet | instabilidade persistente | qa |
| Autenticação e sessão | Sonnet implementa | sempre: Opus revisa | seguranca-aplicacao e Opus |
| RLS, tenant e isolamento | Opus planeja, Sonnet implementa | sempre | banco-de-dados e red-team; Opus revisa |
| LGPD estrutural | Sonnet | retenção ou dado novo | privacidade-lgpd; Opus revisa |
| Documentos oficiais | Opus planeja, Sonnet implementa | sempre | qa e seguranca; Opus revisa |
| API pública e arquivos públicos | Sonnet | sempre: Opus revisa | red-team e seguranca; Opus revisa |
| Infra e CI | Sonnet | segredo, produção ou papel de banco | engenharia-entrega |
| Gate crítico (G00, G03, G04, G05, G06, G09, G25, G28) | consolidação em Opus | sempre | gatekeeper Opus |
| Gate comum | Sonnet | conflito ou BLOCKED disputado | gatekeeper Sonnet |
| Incidente e regressão de gate anterior | Opus | sempre | red-team se for segurança |
| Arquitetura transversal e divergência roadmap x código | Opus | sempre | arquiteto-software |
| Relatório semanal | Sonnet | gate reaberto ou regressão grave, se Rafael pedir | Rafael revisa |

**Gatilhos detectados por script** (o gatekeeper aplica sem perguntar):

1. o diff toca caminho fora de "Arquivos e módulos prováveis" da etapa e fora do mapa de impacto;
2. item de gate anterior reprova na regressão seletiva;
3. o diff atravessa dois ou mais grupos de fronteira: {auth, sessão}, {RLS, policy, grant}, {tenant}, {rota pública}, {arquivo público};
4. Risco crítico, ou Risco alto com tag AUTHZ, TENANT, RLS ou PUBLIC_API, ou com DOCUMENTO só quando toca imutabilidade ou assinatura, ou com LGPD só quando é estrutural (manifesto de dados, base de retenção, eliminação, expurgo, anonimização). Calibração de 2026-10-07: com LGPD e DOCUMENTO amplos o Opus caía em 372 das 618 etapas, contra o princípio de Opus como exceção;
5. terceira rodada na mesma etapa;
6. vereditos opostos na mesma dimensão.

**Gatilhos declarados** (o implementador ou o validador escreve no relatório): 7. roadmap contradiz o código; 8. mais de uma arquitetura plausível de alto impacto; 9. risco residual que não sabe explicar com confiança.

Os gatilhos 1, 4, 7 e 8 escalam planejamento ou revisão; 2, 5 e 6 escalam a investigação; 3 e 9 escalam a revisão. Todo escalonamento fica no VEREDITO.

## 13. Sessões

| Gatilho | Ação |
| --- | --- |
| mudou de fase | sessão nova sempre |
| vai validar uma etapa ou um gate | sessão nova sempre |
| terminou etapa de Risco crítico, ou alto com tag de fronteira | sessão nova para a próxima |
| o contexto foi compactado uma vez | terminar a etapa, commit candidato, sessão nova |
| a próxima etapa muda de domínio (sem tag em comum) | sessão nova |
| decisão arquitetural registrada | sessão nova para implementar sob ela |
| etapas S ou M de risco baixo ou médio, mesmo domínio e fase | podem seguir na mesma sessão |

Sessão de implementação: reconstruir, implementar, testes locais, arquivar, commit candidato, push, STATUS em IMPLEMENTADA com o SHA, regerar o estado. Sessão de validação (sempre nova): fixar o SHA, conferir o CI, validadores em sequência, VEREDITO, commit de registro, push, regerar o estado. Os validadores são subagentes: contexto novo por construção.

## 14. Regressão seletiva

`docs/roadmap-v2/mapa-de-impacto.json` liga padrões de caminho a tags, suítes, seções do e2e e itens de gate. Sempre roda: typecheck, `test:isolamento` e `conferir:numeros`. Roda por impacto: as suítes ligadas aos caminhos do diff. O "Reabre se" de cada gate vira checagem ligada a caminhos. Kit completo no gate e semanalmente no CI. Prova cujo caminho foi tocado fica vencida e é reexecutada.

## 15. Formatos

**Relatório do validador** (`docs/evidencias-v2/Gnn/V2-Fnn-Enn/validacao/<sha7>/<dimensao>.md`):

```
---
validador: <agente>
modelo: <id do modelo>
etapa: V2-Fnn-Enn
sha_validado: <sha>
ci_run: <id ou ausente>
rodada: <n>
herdado_de: <sha7, opcional>
tags: [..]
nivel_de_prova_exigido: [..]
nivel_de_prova_obtido: [..]
veredito: PASS | FAIL | BLOCKED | N/A
confianca: alta | media | baixa
humano_necessario: sim | nao
escalar: nenhum | <gatilho>
---
## Critérios verificados
## Evidência
## Cenários positivos
## Cenários negativos
## Tentativas de reprovar
## Achados
## Não verificado
## Risco residual
## Motivo do humano
```

O relatório é recusado (e conta como inconclusivo) se a evidência é incompatível com a dimensão (seção 8), se "Tentativas de reprovar" está vazia, ou se "Não verificado" está vazio em risco alto.

**Missão do validador** (abre todo prompt de validação):

> Seu trabalho é reprovar esta entrega, não aprová-la. Você ganha quando acha um defeito real e perde quando aprova algo que depois falha. Você valida exatamente o SHA informado. Para cada critério aplicável, primeiro tente violá-lo: rode o cenário negativo, procure o caminho que o teste não cobre, procure a regressão no que a etapa diz preservar. Só declare PASS com evidência compatível com a natureza do critério e com as tentativas de quebra descritas. Se não conseguiu executar o que era executável, o veredito é BLOCKED, nunca PASS. Elogio, resumo do que o implementador fez e "parece correto" não são prova. Régua: OWASP ASVS 4.0 nível 2, isolamento entre municípios como regra número um, português sem travessão. Você só cria ou modifica o arquivo `validacao/<sha7>/<dimensao>.md` da sua dimensão.

**VEREDITO** (`docs/evidencias-v2/Gnn/V2-Fnn-Enn/VEREDITO.md`): uma tabela de rodadas com SHA, data, veredito por dimensão, run do CI e o que foi herdado. Cada rodada registra `politica_validacao_sha`, `mapa_impacto_sha`, `versao_gatekeeper` e o modelo de cada dimensão, mais as substituições de validação humana, os escalonamentos e as pendências E4 e E5.

**RISCO-ACEITO** (`docs/evidencias-v2/Gnn/V2-Fnn-Enn/RISCO-ACEITO.md`): critério, por que não foi provado, risco, mitigação, dono, validade, quem aceitou, data, e a referência ao BLOCKED que continua no histórico.

**GATE** (`docs/evidencias-v2/Gnn/GATE.md`): SHA do merge, itens provados, itens com risco aceito numa lista à parte, recomendação do gatekeeper, quem aprovou, e as linhas de reabertura quando houver.

## 16. Relatórios executivos

Três camadas: o estado (mantido pelo processo), a coleta (`scripts/roadmap/coletar-relatorio.mjs`, que gera um JSON do período) e a redação (Sonnet escreve HTML estruturado, `conferir-relatorio` confere, o PDF é gerado). O gatekeeper produz estado e nunca escreve texto executivo. O relatório não relê as 618 etapas nem reroda a suíte.

- **Semanal**, gerado às segundas para Rafael revisar e enviar ao sócio às terças: `docs/relatorios-v2/semanais/AAAA-MM-DD.html`.
- **De fase**, gerado quando o gate fica APROVADO e o merge é feito, de forma idempotente: `docs/relatorios-v2/fases/Fnn.html`, registrado em `docs/relatorios-v2/fases/INDEX.md`.
- **Vocabulário:** IMPLEMENTADA e EM VALIDAÇÃO são "implementado, aguarda validação"; VALIDADA é "validado"; VALIDADA COM PENDÊNCIA HUMANA é "validado, falta <o quê>"; CONCLUÍDA é "concluído" ou "entregue"; CONCLUÍDA COM RISCO ACEITO é "concluído com risco aceito", nunca só "concluído"; REPROVADA é "em correção"; BLOQUEADA é "bloqueado por <motivo>"; "fase concluída" só com gate APROVADO.
- O relatório tem seções separadas para o que foi implementado, validado e concluído, e uma seção de risco aceito quando houver. `conferir-relatorio` reprova termo mais forte que o status registrado, regressão ou gate reaberto omitido e fase chamada de concluída sem gate APROVADO.
- **Segurança:** a coleta não lê saída bruta; achado de segurança aparece em nível executivo, sem rota nem passo de exploração; nenhum segredo nem nome da semente.
- **Histórico:** HTML, JSON da coleta e índice no git; PDF fora do git, como artefato, com o SHA-256 anotado no índice. O envio nunca é automático.

## 17. Métricas de confiança

Gravadas no VEREDITO e agregadas por gate em `docs/relatorios-v2/metricas.md`: achados por validador e severidade; falso verde; detecção de defeito plantado; bugs pós-gate e gates reabertos; divergência entre validadores; FAIL e BLOCKED com motivo; falhas na amostra humana; tokens e tempo por validação e modelo; percentual de critérios em E1 e E2 contra E4; escalonamentos para Opus; regressões de gate anterior; riscos aceitos e vencidos; rodadas por etapa; dimensões herdadas; gatilhos visuais; minutos de CI por run.

## 18. Estado de implementação desta política

| Peça | Situação em 2026-10-07 |
| --- | --- |
| Esta política e as emendas em `00`, `01`, `03`, `19` (seções 2, 3 e 4) e STATUS | escritas |
| Emenda do portão visual na seção 0 de `19-definicao-de-pronto.md` (linha "Rafael vê as capturas e aprova") e na regra inegociável 2 do CLAUDE.md | PENDENTE, a aplicar por Rafael à mão. Até lá vale o texto atual da seção 0: Rafael vê as capturas de toda etapa de interface, e a seção 10 desta política só define a pré-triagem dos validadores |
| `scripts/roadmap/gerar-estado.mjs`, `contexto.mjs`, `tags.mjs` | a construir |
| `scripts/roadmap/conferir-evidencia.mjs` e `mapa-de-impacto.json` | a construir |
| `scripts/roadmap/coletar-relatorio.mjs` e `conferir-relatorio.mjs` | a construir |
| skills `executar-etapa`, `validar-etapa`, `relatorio-semanal`, `relatorio-de-fase` | a construir |
| consertos do CI (artefatos, `test:scripts`, `auditar`, `pg_trgm`, baseline, restore com Postgres 17) | a construir |
| paralelismo de validadores, métricas agregadas, amostragem automática, CI reduzido | V1 |

Enquanto uma peça não existe, a regra que depende dela é aplicada à mão pelo gatekeeper e o VEREDITO diz isso.
