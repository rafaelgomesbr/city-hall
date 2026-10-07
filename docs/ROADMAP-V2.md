# Roadmap V2 do Defesa Civil 360

Plano de execução da V2, em gates cumulativos. Cinco superfícies (painel da prefeitura, app do agente, console do fornecedor, portal das secretarias e app do cidadão). A V2 é ABSOLUTA (decisão de Rafael em 2026-10-01): tudo que foi descrito e planejado entra nela, inclusive incidentes, abrigos, logística, integrações, PostGIS, canal ampliado do cidadão, idiomas e identidade visual por município.

**Onde está o estado vivo:** [roadmap-v2/STATUS.md](roadmap-v2/STATUS.md). Se o chat perdeu o contexto, comece por ele: diz onde estamos, o que está concluído, o que falta e o ponto de parada.

**Como pedir:** "Execute V2-Fnn-Enn". Quem executa lê a etapa, confere o gate anterior NA ORDEM DE EXECUÇÃO, implementa só o escopo, roda os testes definidos, arquiva a PROVA (saída dos testes E2E e, em etapa de interface, capturas de tela reais, com o portão de alinhamento e texto) e PARA. Detalhe em [roadmap-v2/00-README.md](roadmap-v2/00-README.md).

**Números:** 36 fases, 618 etapas, 36 gates (G00 a G35), 95 checkpoints (CP-01 a CP-95).

**Decisões fechadas:** D-01 a D-06 e A-01 a A-04 (pedido original, algumas emendadas) e D-07 a D-29 (2026-10-01: canal do cidadão ampliado, pessoa global, assinatura por provedor externo, suporte assistido, white-label, idiomas, tracing, integrações, módulos humanitários, PostGIS, configuração, escalonamento, reabertura por 30 dias, PWA, capacidade e ordem de execução). Em [roadmap-v2/01-decisoes-e-principios.md](roadmap-v2/01-decisoes-e-principios.md).

**Atenção à ordem:** a numeração das fases F29 a F35 NÃO é a ordem de execução. Vale a coluna "Ordem" da tabela abaixo (a mesma de [02-mapa-de-dependencias](roadmap-v2/02-mapa-de-dependencias.md) e do STATUS).

## Fases, gates e arquivos (em ordem de execução)

| Ordem | Fase | Nome | Gate | Etapas | Arquivo |
| --- | --- | --- | --- | --- | --- |
| 1 | F00 | Estabilização obrigatória | G00 BASE CONFIÁVEL | 25 | [03](roadmap-v2/03-fase-00-estabilizacao.md) |
| 2 | F01 | Fundação de engenharia e ambientes | G01 ENGENHARIA E AMBIENTES PRONTOS | 22 | [04](roadmap-v2/04-fundacao-engenharia.md) |
| 3 | F02 | API v1 e contratos | G02 API V1 E CONTRATOS | 9 | [05](roadmap-v2/05-api-identidade-autorizacao.md) |
| 4 | F03 | Identidade, vigência e contexto de ator | G03 IDENTIDADE E VIGÊNCIA PROVADAS | 21 | [05](roadmap-v2/05-api-identidade-autorizacao.md) |
| 5 | F04 | Isolamento intra-município e encaminhamento | G04 ISOLAMENTO INTRA-MUNICÍPIO PROVADO | 17 | [05](roadmap-v2/05-api-identidade-autorizacao.md) |
| 6 | F05 | Manifesto de dados e LGPD técnica | G05 MANIFESTO DE DADOS ATIVO | 15 | [06](roadmap-v2/06-lgpd-arquivos.md) |
| 7 | F06 | Cadeia segura de arquivos | G06 CADEIA DE ARQUIVOS PROVADA | 23 | [06](roadmap-v2/06-lgpd-arquivos.md) |
| 8 | F07 | Workers e topologia operacional | G07 WORKERS E TOPOLOGIA OPERACIONAL | 13 | [06](roadmap-v2/06-lgpd-arquivos.md) |
| 9 | F08 | Design system e fundamentos de UX | G08 DESIGN SYSTEM E FUNDAMENTOS | 13 | [04](roadmap-v2/04-fundacao-engenharia.md) |
| 10 | F32 | PostGIS e dados territoriais | G32 POSTGIS E DADOS TERRITORIAIS PROVADOS | 16 | [24](roadmap-v2/24-postgis-territorio.md) |
| 11 | F09 | Documentos oficiais V2 | G09 DOCUMENTOS IMUTÁVEIS | 28 | [07](roadmap-v2/07-documentos.md) |
| 12 | F10 | Consolidação do painel da prefeitura | G10 PAINEL CONSOLIDADO | 36 | [08](roadmap-v2/08-painel-prefeitura.md) |
| 13 | F11 | Portal das secretarias | G11 PORTAL FUNCIONAL EM HML | 30 | [09](roadmap-v2/09-portal-secretarias.md) |
| 14 | F12 | Homologação do portal com secretaria real | G12 PORTAL HOMOLOGADO COM SECRETARIA REAL | 8 | [09](roadmap-v2/09-portal-secretarias.md) |
| 15 | F13 | Reinspeção e retorno ao campo | G13 REINSPEÇÃO | 11 | [10](roadmap-v2/10-campo-reinspecao.md) |
| 16 | F14 | Consolidação do app do agente | G14 APP DO AGENTE EM APARELHO FÍSICO | 22 | [10](roadmap-v2/10-campo-reinspecao.md) |
| 17 | F33 | Configuração por município, checklist por tipo e importação | G33 CONFIGURAÇÃO, CHECKLIST E IMPORTAÇÃO PROVADOS | 16 | [25](roadmap-v2/25-configuracao-checklist-importacao.md) |
| 18 | F15 | Fundação do canal cidadão | G15 FUNDAÇÃO DO CIDADÃO | 18 | [11](roadmap-v2/11-cidadao-fundacao.md) |
| 19 | F16 | Domínio de relatos e triagem (modelo) | G16 DOMÍNIO DE RELATOS | 16 | [11](roadmap-v2/11-cidadao-fundacao.md) |
| 20 | F17 | App do cidadão | G17 APP DO CIDADÃO EM BETA INTERNO | 20 | [12](roadmap-v2/12-cidadao-app-triagem.md) |
| 21 | F18 | Triagem no painel | G18 TRIAGEM NO PAINEL | 13 | [12](roadmap-v2/12-cidadao-app-triagem.md) |
| 22 | F34 | Canal do cidadão ampliado | G34 CANAL DO CIDADÃO AMPLIADO | 20 | [26](roadmap-v2/26-canal-cidadao-ampliado.md) |
| 23 | F19 | Integração cidadão, ocorrência e campo | G19 CIDADÃO ATÉ O CAMPO | 7 | [12](roadmap-v2/12-cidadao-app-triagem.md) |
| 24 | F29 | Incidentes e abrigos | G29 INCIDENTES E ABRIGOS | 18 | [22](roadmap-v2/22-incidentes-abrigos-logistica.md) |
| 25 | F30 | Logística humanitária | G30 LOGÍSTICA HUMANITÁRIA | 18 | [22](roadmap-v2/22-incidentes-abrigos-logistica.md) |
| 26 | F31 | Integrações externas oficiais | G31 INTEGRAÇÕES EXTERNAS OFICIAIS | 20 | [23](roadmap-v2/23-integracoes-externas.md) |
| 27 | F35 | Idiomas, VLibras e identidade visual por município | G35 IDIOMAS, VLIBRAS E IDENTIDADE POR MUNICÍPIO | 14 | [27](roadmap-v2/27-idiomas-identidade-visual.md) |
| 28 | F20 | Console DC360 V2 | G20 CONSOLE V2 | 19 | [13](roadmap-v2/13-console.md) |
| 29 | F21 | Observabilidade | G21 OBSERVABILIDADE | 14 | [14](roadmap-v2/14-operacao-observabilidade-dr.md) |
| 30 | F22 | Backup, DR, RPO e RTO | G22 BACKUP E DR PROVADOS | 11 | [14](roadmap-v2/14-operacao-observabilidade-dr.md) |
| 31 | F23 | Acessibilidade | G23 ACESSIBILIDADE VALIDADA | 13 | [15](roadmap-v2/15-seguranca-acessibilidade.md) |
| 32 | F24 | Performance e carga | G24 DESEMPENHO MEDIDO | 14 | [14](roadmap-v2/14-operacao-observabilidade-dr.md) |
| 33 | F25 | Segurança pré-piloto | G25 SEGURANÇA PRÉ-PILOTO | 21 | [15](roadmap-v2/15-seguranca-acessibilidade.md) |
| 34 | F26 | POC controlada | G26 POC APROVADA | 12 | [16](roadmap-v2/16-poc-piloto-producao.md) |
| 35 | F27 | Piloto municipal | G27 PILOTO ENCERRADO | 9 | [16](roadmap-v2/16-poc-piloto-producao.md) |
| 36 | F28 | Candidata a produção | G28 CANDIDATA A PRODUÇÃO | 16 | [16](roadmap-v2/16-poc-piloto-producao.md) |

## Demais documentos

| Documento | Para que serve |
| --- | --- |
| [STATUS](roadmap-v2/STATUS.md) | Estado vivo: onde estamos, o que está concluído, o que falta, ponto de parada |
| [02-mapa-de-dependencias](roadmap-v2/02-mapa-de-dependencias.md) | Grafo de fases e gates, ordem de execução, caminho crítico, paralelismo |
| [17-rastreabilidade](roadmap-v2/17-rastreabilidade.md) | Nada da auditoria, do Decision Pack, das decisões e do Alyson ficou sem destino |
| [18-checkpoints](roadmap-v2/18-checkpoints.md) | Os 95 checkpoints de decisão humana |
| [19-definicao-de-pronto](roadmap-v2/19-definicao-de-pronto.md) | Regras inegociáveis, portão visual, Definition of Done, Definition of Ready, padrão de evidência |
| [20-matrizes](roadmap-v2/20-matrizes.md) | Superfícies, autorização, fluxos E2E por gate |
| [21-fora-da-v2](roadmap-v2/21-fora-da-v2.md) | O que continua fora, o que entrou em 2026-10-01 e o gatilho para reavaliar |
| [28-execucao-e-validacao](roadmap-v2/28-execucao-e-validacao.md) | Como a etapa é executada, validada por agentes independentes e decidida no gate; estado gerado; relatórios executivos (D-30) |

A auditoria que originou este roadmap está em `docs/AUDITORIA-V2-BASELINE-ZERO.md` e `docs/auditoria-v2/` (evidência histórica, não alterada por este roadmap).
