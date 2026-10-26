# Roadmap V2 do Defesa Civil 360: como ler e como executar

Este conjunto de documentos é o plano de execução da V2 do Defesa Civil 360. Ele transforma as conclusões da auditoria Baseline Zero (`docs/AUDITORIA-V2-BASELINE-ZERO.md` e `docs/auditoria-v2/01` a `12`) e as decisões de escopo de 2026-10-01 (D-07 a D-29) em etapas que podem ser pedidas uma a uma. O estado vivo (onde estamos, o que foi feito, o que falta) está SOMENTE em `STATUS.md`:

> Rafael: "Execute V2-F04-E07."
> Quem executa: lê a etapa, confere o gate anterior, implementa só o escopo definido, roda os testes definidos, produz as evidências definidas e PARA. Depois Rafael aprova ou manda avançar.

**O que este roadmap NÃO é:** não é auditoria nova, não é cronograma (não há datas, só tamanho, complexidade, risco e paralelismo), não decide questões jurídicas (J1 a J13 são checkpoints) e não implementa nada. Ele é documentação e não altera código, migrations, testes, configuração, workflows nem `docs/auditoria-v2/`, que continua sendo evidência histórica.

## 1. Os arquivos

| Arquivo | O que contém |
| --- | --- |
| `docs/ROADMAP-V2.md` | Índice mestre de uma página |
| `STATUS.md` | Estado vivo: ponto de partida e de parada, etapas, gates, checkpoints, diário |
| `00-README.md` | Este arquivo |
| `01-decisoes-e-principios.md` | Decisões fechadas (D-01 a D-06, A-01 a A-04), princípios, arquitetura-alvo, o que se preserva, ADRs, contradições resolvidas |
| `02-mapa-de-dependencias.md` | Grafo das fases e gates, caminho crítico, o que anda em paralelo |
| `03-fase-00-estabilizacao.md` | F00 e G00 |
| `04-fundacao-engenharia.md` | F01 (engenharia e ambientes) e F08 (design system), com G01 e G08 |
| `05-api-identidade-autorizacao.md` | F02 (API v1), F03 (identidade e vigência), F04 (isolamento e encaminhamento), com G02, G03, G04 |
| `06-lgpd-arquivos.md` | F05 (manifesto de dados), F06 (cadeia de arquivos), F07 (workers), com G05, G06, G07 |
| `07-documentos.md` | F09 e G09 |
| `08-painel-prefeitura.md` | F10 e G10 |
| `09-portal-secretarias.md` | F11 (portal) e F12 (homologação com secretaria real), com G11 e G12 |
| `10-campo-reinspecao.md` | F13 (reinspeção) e F14 (app do agente), com G13 e G14 |
| `11-cidadao-fundacao.md` | F15 (fundação do cidadão) e F16 (domínio de relatos), com G15 e G16 |
| `12-cidadao-app-triagem.md` | F17 (app do cidadão), F18 (triagem), F19 (cidadão até o campo), com G17, G18, G19 |
| `13-console.md` | F20 e G20 |
| `14-operacao-observabilidade-dr.md` | F21, F22, F24, com G21, G22, G24 |
| `15-seguranca-acessibilidade.md` | F23 e F25, com G23 e G25 |
| `16-poc-piloto-producao.md` | F26, F27, F28, com G26, G27, G28 |
| `22-incidentes-abrigos-logistica.md` | F29 (incidentes e abrigos) e F30 (logística humanitária), com G29 e G30 |
| `23-integracoes-externas.md` | F31, com G31 |
| `24-postgis-territorio.md` | F32, com G32 |
| `25-configuracao-checklist-importacao.md` | F33, com G33 |
| `26-canal-cidadao-ampliado.md` | F34, com G34 |
| `27-idiomas-identidade-visual.md` | F35, com G35 |
| `17-rastreabilidade.md` | Matriz final: nada da auditoria, do Decision Pack, das decisões e dos requisitos do Alyson ficou sem fase, etapa, gate e evidência |
| `18-checkpoints.md` | Os 95 checkpoints de decisão (CP-01 a CP-95) |
| `19-definicao-de-pronto.md` | Definition of Done comum, Definition of Ready de alto risco, padrão de evidência |
| `20-matrizes.md` | Matriz das cinco superfícies, matriz de autorização futura, mapa dos fluxos E2E por gate |
| `21-fora-da-v2.md` | O que continua fora da V2, o que entrou em 2026-10-01 e o gatilho para reavaliar |

## 2. As cinco superfícies

`apps/web` (painel da prefeitura), `apps/campo` (app do agente), `apps/console` (console do fornecedor), `apps/portal` (NOVO portal das secretarias) e `apps/cidadao` (NOVO app do cidadão). Ordem decidida (D-01): fundação, portal das secretarias, estabilização e homologação, app do cidadão.

## 3. Convenções

**Identificadores**

- Fase: `Fnn` (F00 a F35). A numeração das fases F29 a F35 NÃO é a ordem de execução: vale `STATUS.md` seção 5 e `02-mapa-de-dependencias.md` seção 1B. Etapa: `V2-Fnn-Enn`, por exemplo `V2-F06-E14`. Gate: `Gnn`, com o mesmo número da fase. Checkpoint: `CP-nn`. ADRs novas: `0009` em diante.
- Os `CP-nn` (com hífen) são os checkpoints de decisão da V2. Os `CP1` a `CP9` de `docs/ROADMAP_FASE0.md` são do protótipo e não têm relação com eles.
- Origens citadas nas etapas usam prefixos, porque os identificadores dos documentos colidem: `ALY:` (documento do Alyson), `BZ-D:` (Matriz D do Baseline), `BZ-F:` (gap da seção F), `BZ-M:` (requisito novo V2), `BZ-N:` (divergência), `DP:` (Decision Pack), `PR:` (pedido e decisões do Rafael), `REL:` (relatório de auditoria).

**Estado atual de cada etapa:** MANTER, CORRIGIR, REFATORAR, EXPANDIR, CRIAR ou SUBSTITUIR (este com justificativa).

**Prioridade:** P0 (bloqueia gate de segurança ou integridade, ou é pré-condição de usuário externo), P1 (necessária para o gate da fase), P2 (exigida pelo gate, mas pode ser adiada dentro da fase), P3 (opcional).

**Tamanho:** XS (menos de uma hora), S (cerca de meio dia), M (um a dois dias), L (três a cinco dias). Não existe XL: etapa grande foi dividida. Tamanho é esforço relativo, não prazo.

**Complexidade:** baixa, média, alta, crítica. **Risco:** baixo, médio, alto, crítico. **Paralelizável:** sim (com qual etapa) ou não (o que impede).

## 4. Como pedir uma etapa e o que acontece

Pedido: "Execute V2-Fnn-Enn". O protocolo é sempre este:

1. Ler a etapa e a introdução da fase.
2. Conferir o gate da fase anterior: todos os itens marcados, com evidência em `docs/evidencias-v2/Gnn/`. Conferir também que nenhum gate anterior foi reprovado por regressão.
3. Conferir as "Dependências de entrada" e os checkpoints citados. Se algum estiver aberto, PARAR e dizer o que falta.
4. Rodar o kit de regressão (`19-definicao-de-pronto.md`, seção 2) e registrar a linha de base.
5. Implementar APENAS o que está em "O que deve ser implementado", respeitando "O que NÃO deve ser implementado nesta etapa".
6. Rodar os testes positivos, negativos, de autorização e isolamento, de regressão e o E2E da etapa. Se o ambiente impedir um teste, dizer qual e por quê; nunca declarar como testado o que não foi rodado.
7. Produzir a PROVA em `docs/evidencias-v2/Gnn/V2-Fnn-Enn/` com `INDEX.md` (sem segredo e sem dado real): saída dos testes E2E e, em etapa de interface, capturas de tela reais (ou foto do aparelho) em desktop e celular, claro e escuro, nos estados normal, vazio e erro. Conferir o portão de qualidade visual e de texto de `19-definicao-de-pronto.md` (nada desalinhado, grudado ou fora do lugar; texto bem escrito). SEM PROVA A ETAPA NÃO ESTÁ CONCLUÍDA E NÃO SE AVANÇA (regra inegociável de Rafael).
8. Atualizar a documentação listada na etapa.
9. Conferir a "Definition of Done" e relatar: o que foi feito, resultado dos testes (inclusive as falhas), limitações e pendências.
10. Registrar o resultado no STATUS e seguir para a próxima etapa. REGRA DE 2026-10-05 (Rafael): não se para entre etapas, só se os tokens acabarem. A validação humana que o executor não pode fazer (segunda pessoa, run do CI, aparelho físico, decisão de checkpoint) fica REGISTRADA como pendente no STATUS e não bloqueia a etapa seguinte, exceto quando a seguinte depende de um checkpoint em aberto (aí se pula para etapa independente e se anota). As regras inegociáveis de 2026-10-02 continuam valendo: sem prova arquivada e sem o portão visual a etapa não é marcada CONCLUÍDA. Commit continua só com autorização do Rafael.

**Emenda de 2026-10-07 (D-30, `28-execucao-e-validacao.md`).** O protocolo acima termina no COMMIT CANDIDATO, não na conclusão: depois do passo 9, o executor faz o commit `V2-Fnn-Enn: candidato, <resumo>` no ramo da fase, faz push e marca a etapa IMPLEMENTADA com o SHA. A etapa só vira VALIDADA pelo gatekeeper, numa sessão nova, sobre aquele SHA, e só vira CONCLUÍDA com as pendências humanas resolvidas. Antes do passo 1, o executor reconstrói o contexto pelo repositório (`ESTADO-ATUAL.md` e o pacote de contexto da etapa), nunca pela conversa. O campo "Validação humana" é lido pela regra global da seção 4 de `28`. Commit e push no ramo da fase não pedem autorização a cada vez; merge e push em master continuam com Rafael.

Outros pedidos válidos: "Execute o gate G04" (conferir o checklist do gate e preencher `docs/evidencias-v2/G04/GATE.md`); "Decida CP-nn" (apresentar o checkpoint com as alternativas e registrar a decisão em `docs/evidencias-v2/CP-nn/decisao.md`).

## 5. Gates e checkpoints

- **Gate.** Cada fase termina num gate explícito (`# GATE Gnn - NOME`) com checklist mensurável, "Reabre se" e "Este Gate libera". Os gates são CUMULATIVOS: se uma etapa posterior quebra algo aprovado antes, o gate anterior fica REABERTO (a aprovação histórica não é apagada; o `GATE.md` ganha a linha da reabertura) e os seguintes ficam suspensos até a revalidação (D-30).
- **Checkpoint.** Decisão humana posicionada no momento certo (`18-checkpoints.md`). Marcador 🛑 é decisão de Rafael ou Alyson; ⚖️ é decisão jurídica, de DPO ou do município, que o roadmap NÃO toma. O roadmap diz o que se implementa de forma genérica antes do parecer e quando ele vira bloqueador.
- **Definition of Ready.** Para as etapas e fases de alto risco (identidade, arquivos, portal, cidadão, abertura pública, piloto, produção), a lista do que precisa estar verdadeiro antes de começar está em `19-definicao-de-pronto.md`.

## 6. Regras que valem para todas as etapas

As regras do `CLAUDE.md` para `dc360/` continuam valendo: isolamento entre municípios é a regra número um (RLS ativada e forçada, organização só do token), trilha append-only, registro se encerra e não se apaga, regra de negócio no banco e no pacote compartilhado, `npm audit` sob a política aprovada (CP-03), recurso de outro município ou órgão responde 404, toda escrita passa por `exigirPermissao`. Idioma português do Brasil, taxonomia COBRADE, nenhuma norma inventada.

**Regras de conteúdo destes documentos** (verificadas por `dc360/packages/shared/test/regras-de-conteudo.test.ts`, que varre `docs/`): sem travessão; datas em formato ISO (por exemplo 2026-09-30); só as normas listadas em `docs/CONTEXTO.md` podem ser citadas por número; sem marcadores de preenchimento em colchete duplo; nunca chamar o mecanismo de aprovação de "assinatura eletrônica" como conclusão jurídica (usar APROVAÇÃO AUTENTICADA).

## 7. Números do roadmap

- 36 fases (F00 a F35), 36 gates (G00 a G35), 95 checkpoints (CP-01 a CP-95), 618 etapas.
- Tamanho esperado do esforço: ver as contagens por fase em `docs/ROADMAP-V2.md`.
- A rastreabilidade (`17-rastreabilidade.md`) cobre os requisitos do Alyson, os requisitos novos da V2, os gaps do Baseline, as divergências, as decisões do Decision Pack, as decisões do pedido, as superfícies e os fluxos.

## 8. Limites

O roadmap não foi prototipado: tamanhos e dependências refletem a leitura da auditoria de 2026-09-30. Custos, planos de provedor e prazos de loja são NÃO CONFIRMADOS. Os pareceres J1 a J13 estão fora do controle técnico. Detalhes em `01-decisoes-e-principios.md`, seção 10.
