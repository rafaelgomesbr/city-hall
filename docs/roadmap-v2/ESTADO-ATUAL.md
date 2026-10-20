# ESTADO ATUAL DA V2

> GERADO por `node scripts/roadmap/gerar-estado.mjs`. NÃO edite à mão: a próxima geração apaga a edição.
> Conferir: `node scripts/roadmap/gerar-estado.mjs --conferir` (falha se este arquivo difere do repositório).
> Fontes: STATUS.md, arquivos de fase, GATE.md, VEREDITO.md e RISCO-ACEITO.md. Não usa HEAD, hora nem ramo.
> Se algo divergir da conversa ou de uma nota, vale o repositório (28, seção 3).

## Fase atual
- F00 Estabilização obrigatória (ordem 1 de 36), gate G00 BASE CONFIÁVEL: EM ANDAMENTO
- Último gate aprovado: nenhum
- Gate anterior na ordem: nenhum (primeira fase)
- GATE.md do G00 em docs/evidencias-v2/G00/: ausente

## Etapas da F00 (25)
- IMPLEMENTADA 10, VALIDADA 5, VALIDADA COM PENDÊNCIA HUMANA 5, BLOQUEADA 5
- Próxima etapa acionável na ordem da tabela: nenhuma

## Checkpoints ABERTOS ou PARCIAIS citados (fase atual e próxima)
- CP-04 ABERTO: Entidade, domínio, contas de loja, marca e bundle ids (F01: cabeçalho da fase, F01-E10,...)
- CP-05 ABERTO: Contratação do ambiente de homologação (F01: cabeçalho da fase, F01-E11)
- CP-06 ABERTO: Ferramenta de erro e de log, residência do dado (F01: cabeçalho da fase, F01-E14)
- CP-07 ABERTO: Segunda pessoa com acesso e plantão (F01: cabeçalho da fase, F01-E16)
- CP-43 ABERTO: Licenças de dependência permitidas e proibidas (F01: cabeçalho da fase, F01-E19)
- CP-44 ABERTO: PostGIS no provedor gerenciado de HML e de produção (F01: cabeçalho da fase, F01-E22)

## Etapas com pendência humana (15)
- Observação com "falta" em etapa EM ANDAMENTO ou IMPLEMENTADA, ou status VALIDADA COM PENDÊNCIA HUMANA:
  F00-E03, F00-E05, F00-E06, F00-E07, F00-E08, F00-E09, F00-E10, F00-E11, F00-E13, F00-E14, F00-E15,
  F00-E16, F00-E22, F00-E24, F00-E25

## Riscos aceitos vigentes (0)
- nenhum RISCO-ACEITO.md em docs/evidencias-v2/

## Gates REABERTOS (0)
- nenhum

## Não iniciar
- Fases depois da F00 na ordem de execução (35), enquanto o gate G00 não estiver APROVADO:
  F01, F02, F03, F04, F05, F06, F07, F08, F32, F09, F10, F11, F12, F13, F14, F33, F15, F16, F17, F18,
  F34, F19, F29, F30, F31, F35, F20, F21, F22, F23, F24, F25, F26, F27, F28
