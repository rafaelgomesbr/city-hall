# V2-F04, parte 0C: andaime do shared

Ramo `trab/f04-0c-andaime-shared`, base `origin/v2/f04` (ponta `c50b92b2`). Parte do lote 0 da F04 (plano em `docs/roadmap-v2/retomada/plano-f04.md`, norma: ADRs 0009 e 0010). Não é etapa do roadmap: só prepara pontos de extensão para que as partes seguintes não disputem `index.ts` e `erros.ts`.

## Fatos

1. Quatro módulos vazios em `dc360/packages/shared/src/`, cada um com um comentário dizendo quem o preenche:
   - `encaminhamento.ts`: partes 0D (máquina de estados e eventos), 3C e 5B.
   - `dossie.ts`: parte 0E (dossiê mínimo, lista de inclusão).
   - `competencia.ts`: parte 0F (competência do órgão por COBRADE e território).
   - `prazo-do-encaminhamento.ts`: parte 4B (relógio de prazo e lembretes em percentual).
2. `dc360/packages/shared/src/index.ts` exporta os quatro num bloco "Andaime da F04" no FIM do arquivo, depois do bloco da F03 e da linha `mensagensDoZodEmPortugues`. **A partir daqui o `index.ts` está CONGELADO durante a F04**: nenhuma parte da fase o edita (o comentário está no próprio arquivo).
3. `dc360/packages/shared/src/erros.ts`: bloco F04 no FIM de `CODIGOS_RESERVADOS`, depois de `versao_do_aplicativo_ausente` e longe do bloco da F03 (no início). Nenhum código existente mudou de nome ou de lugar.
4. `dc360/packages/shared/test/catalogo-de-erros.test.ts`: 1 caso novo (os quatro códigos da F04 estão reservados, fora da lista emitida, no fim da lista, com o bloco da F03 ainda no início; `transicao_invalida` e `ja_respondida` não foram reservados de novo). O teste genérico do catálogo e a varredura da API não contam reservados, então não precisaram de ajuste.
5. Contabilidade dos números: chave `V2-F04-0C` (+1) em `MUDANCAS_DO_TESTE_SHARED_POR_ETAPA` de `dc360/scripts/baseline.mjs`; contagens citadas em `dc360/README.md` (418 para 419; 4504 para 4505) e `dc360/docs/COLOCAR-DE-PE.md` (6514 para 6515).

## Códigos reservados (status e categoria são a proposta do roadmap; a etapa dona confirma ao emitir e move a linha para `CODIGOS_DE_ERRO` no mesmo commit)

| Código | Status | Categoria | Etapa dona |
| --- | --- | --- | --- |
| `orgao_sem_gestor` | 409 | permanente | V2-F04-E08 (escalonar encaminhamento de órgão sem vínculo `gestor` vigente) |
| `encaminhamento_encerrado` | 409 | permanente | V2-F04-E13, cenário 6 (aceite, devolução ou resposta em encaminhamento `concluido` ou `cancelado`) |
| `devolucao_so_antes_do_aceite` | 409 | permanente | V2-F04-E17 (devolução em `aceito`, `aguardando_dc` ou `respondido`; a E08 já emite, pela P-09) |
| `cadeia_esgotada` | 409 | permanente | V2-F04-E16 (escalonar sem nível acima disponível); citado em `docs/roadmap-v2/08-painel-prefeitura.md` linha 177 como código de F04-E08 |

A categoria `permanente` segue o par existente `ja_respondida` e `transicao_invalida` (409 de estado: repetir o pedido não resolve; o cliente recarrega ou orienta).

## O que NÃO foi reservado, e por quê

- `transicao_invalida` (409) e `ja_respondida` (409) já são emitidos e estão em `CODIGOS_DE_ERRO`.
- Reaproveitam códigos existentes: recusa de papel, leitor aceitando e atribuição a outro executor (`sem_permissao`, 403); limite de taxa por solicitante e por órgão (`excesso_de_requisicoes`, 429); recurso de outro órgão ou município (`nao_encontrada`, 404); corpo inválido, `respondidaPor` no corpo, busca sem `q` válido (`dados_invalidos`, 422).
- Justificativa ausente (campo sensível do dossiê na E04, competência na E15, prioridade na E14, prazo na E08): 422 com o campo, por `dados_invalidos`; o item "justificativa ausente se `dados_invalidos` não bastar" do plano foi avaliado e não precisou de código próprio.
- Os 410 do link do ofício (E12) são do comportamento já existente do `GET /publico/oficio/:token`, fora do catálogo desta parte.

## Portões (a partir de `dc360/`)

| Portão | Resultado |
| --- | --- |
| `npm run typecheck` | verde |
| `npm test --workspace @dc360/shared` | 418 passam, 1 falha: o EPERM de symlink de `regras-de-conteudo.test.ts` (DV-46, ambiente Windows) (`saidas/02-teste-shared.txt`) |
| `npm run test:api` | 2039 passam, 34 puladas, 2 falham em `test/semear-homologacao.test.ts` (falha de ambiente aceita: processo filho no Windows). A varredura do catálogo (`catalogo-de-erros.test.ts`) passa com os reservados |
| `npm run lint` e `npm run lint:teto` | OK nos dois conjuntos; teto em 431 |
| `npm run formato:conferir` | OK, 865 arquivos |
| `npm run conferir:numeros` | OK (`saidas/01-conferir-numeros.txt`) |
| `npx vitest run packages/shared/test/regras-de-conteudo.test.ts` | 9 passam, 1 EPERM de symlink (DV-46) |
| `node --test scripts/baseline.test.mjs` | 29 passam |
| `conferir-indices-de-evidencia.mjs` e `gerar-estado.mjs --conferir` (da raiz) | verdes (ver o commit) |

## Para o orquestrador

- Linha do STATUS sugerida: "V2-F04-0C (andaime do shared) IMPLEMENTADA em `trab/f04-0c-andaime-shared`; `index.ts` do shared congelado na F04; 4 códigos reservados no fim de `CODIGOS_RESERVADOS`."
- Dívidas pagas: nenhuma. Pendências humanas: nenhuma.
- Mudança de plano: o plano previa 3 códigos mais "justificativa ausente se `dados_invalidos` não bastar e o que a leitura achar"; a leitura achou `cadeia_esgotada` (só citado no doc 08 e implícito na E16) e `dados_invalidos` basta para justificativa. Se o orquestrador preferir não reservar `cadeia_esgotada` agora, basta apagar a linha e o nome do teste; a E16 pode reservá-lo na sua parte.
