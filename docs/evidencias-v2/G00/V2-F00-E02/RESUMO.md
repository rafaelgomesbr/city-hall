# V2-F00-E02: Política T42 para teste vermelho e skip

Situação: IMPLEMENTADA E MEDIDA em 2026-10-05. Status da etapa no STATUS: EM ANDAMENTO, só porque falta a validação humana de Rafael (ler a política e confirmar o prazo máximo e o dono padrão, hoje assumidos como premissa). Nada além disso falta.

## O que foi entregue

- `dc360/docs/POLITICA-DE-TESTE-VERMELHO.md`: a regra da casa, as três saídas (consertar, reescrever com registro, pular com dono, prazo e referência), a diferença entre pular por ambiente (permitido e contado) e de forma incondicional (exige marca), a marca `// T42 dono=<nome> issue=<ref> ate=AAAA-MM-DD`, o prazo máximo, o dono padrão e quem decide prazo.
- `dc360/scripts/portao-de-skip.mjs`: o varredor (lê linha a linha, sem dependência nova). `dc360/scripts/portao-de-skip.test.mjs`: o portão e os 17 casos que o provam. Entram em `npm run test:scripts`.
- `dc360/apps/api/test/vigencia-na-escrita.test.ts`: só a marca acima do `describe.skip` da vigência (`dono=rafael issue=V2-F00-E04 ate=2026-11-05`). Ele sai na E04.
- `docs/DECISOES-DE-TESTE-DA-FASE-00.md`: registro de decisão de cada teste reescrito (vazio por enquanto, com o formato). Não consome número de ADR.
- `dc360/scripts/baseline.mjs` e `baseline.test.mjs`: o esperado do passo `test-scripts` agora soma `TESTES_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS` (tabela por etapa, hoje só a E02 com 17) e o `baseline.test.mjs` confere a tabela contra o arquivo de teste de cada etapa. `TESTES_DA_E01_EM_SCRIPTS` ficou intacto (16).
- `dc360/README.md`: parágrafo sobre a política na seção "Como testar".

## Resultados medidos

| O que | Resultado |
| --- | --- |
| `node --test scripts/portao-de-skip.test.mjs` | 17 testes, 17 ok, 0 falhas |
| Árvore atual no portão | 594 arquivos varridos, 0 problemas |
| Skips por ambiente contados | 10 em 3 arquivos: `db/test/busca.test.ts` 3 (`it.runIf`), `scripts/entitlements-do-ios.test.mjs` 4, `scripts/som-de-despacho.test.mjs` 3 |
| Incondicionais com marca | 1: `vigencia-na-escrita.test.ts:103` |
| Prova de reprovação (o teste falha antes e passa depois) | O arquivo de HEAD, sem marca, reprova (`saidas/02-prova-de-reprovacao.txt`); com a marca passa. Casos sintéticos: sem marca, sem dono, vencida e `.only` reprovam; `describe.skip` com marca dentro do prazo passa |
| `node --test scripts/baseline.test.mjs` | 16 testes, 16 ok |
| `baseline.mjs --so=test-scripts` | `confere`: 198 testes (181 de antes mais 17), 191 ok, 3 falhas (as três da E17), 4 pulados |
| Regressão `npm test` (via `baseline.mjs`) | shared 149 com 1 falha (confere), db 318 verde com o isolamento (confere), campo 159 (confere), console 259 (confere), web 550 com 14 falhas (confere), api: ver abaixo |
| `regras-de-conteudo.test.ts` | só as linhas de travessão pré-existentes (`trilha-detalhe.test.ts:181`, `AUDITORIA-2026-09-30.md:313`, `docs/auditoria-v2/raw/teste-shared.txt`); nenhum arquivo desta etapa |
| `conferir:numeros` | 13 afirmações que não batem, as mesmas de antes (E17) |

O isolamento (`db/test/isolamento.test.ts`, CA-06) roda dentro do passo db e está verde.

## O que ficou vermelho e por quê

- Tudo o que já era vermelho continua igual (E03 a E25).
- Na primeira rodada da regressão a API deu 3 falhas em vez de 2: `resolver-link.test.ts` ("conecta no endereço conferido...") falhou por tempo, esperando 20 ms pelo fechamento da conexão com a máquina carregada pela suíte inteira. Isolado, passou 3 de 3 vezes (37 testes), e a segunda rodada completa da API voltou a 1109 com 2 falhas e 18 pulados (`confere`). Não tem relação com esta etapa (só se tocou numa linha de comentário de um arquivo pulado), mas é um teste sensível a carga que a E03 deve classificar. As duas saídas estão arquivadas (`regressao-npm-test/04-teste-api.txt` e `regressao-api-segunda-rodada/`).

## Premissas assumidas (registradas no STATUS, seção 9)

1. Prazo máximo de um skip incondicional: 30 dias corridos. O portão tolera mais um dia de folga porque o relógio dele é UTC.
2. Dono padrão: `rafael`.
3. A marca do `describe.skip` da vigência aponta para V2-F00-E04 com prazo `2026-11-05`. Observação: de 2026-10-05 a 2026-11-05 são 31 dias, um a mais que o máximo de 30. A folga de fuso de um dia é o que a deixa passar hoje; a partir de amanhã o prazo cabe sem folga.

## Limitações

- O varredor é uma leitura por linha, não um analisador de sintaxe: não vê uma opção `skip` escrita numa linha separada do `test(` nem uma chamada escondida atrás de um apelido. O que passa por esses buracos precisa de teste novo no portão.
- O portão não está ligado ao CI (V2-F01-E03): o CI do GitHub ainda não o enxerga.
- O teste da árvore real depende do relógio: depois de 2026-11-05 a marca vence e o portão reprova, de propósito (a E04 precisa ter tirado o skip antes).

## O que falta

Validação humana: Rafael lê a política, confirma (ou troca) o prazo máximo de 30 dias e o dono padrão `rafael`. Mudar o prazo é editar `PRAZO_MAXIMO_EM_DIAS` em `dc360/scripts/portao-de-skip.mjs` e a política. O item "política T42" do G00 só se marca no próprio gate.
