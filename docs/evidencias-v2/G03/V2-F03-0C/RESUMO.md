# V2-F03, parte 0C: andaime do shared

Ramo `trab/f03-0c-andaime-shared`, base `origin/v2/f03`. Parte do lote 0 da F03 (plano em `docs/roadmap-v2/retomada/plano-f03.md`). Não é etapa do roadmap: só prepara pontos de extensão para que as partes seguintes não disputem `index.ts` e `erros.ts`.

## O que entrou

1. Três módulos vazios em `dc360/packages/shared/src/`, cada um com um comentário dizendo quem o preenche:
   - `identidade.ts`: V2-F03-E02, E15 e E17.
   - `ator.ts`: V2-F03-E06.
   - `sigilo.ts`: V2-F03-E21.
2. `dc360/packages/shared/src/index.ts` exporta os três. **A partir daqui o `index.ts` está CONGELADO durante a F03**: nenhuma parte da fase o edita (o comentário está no próprio arquivo).
3. `dc360/packages/shared/src/erros.ts`: bloco novo no INÍCIO de `CODIGOS_RESERVADOS`, antes das linhas `versao_do_aplicativo_*` (que a F02 está movendo). Nenhum código existente mudou de nome ou de lugar.
4. `dc360/packages/shared/test/catalogo-de-erros.test.ts`: 1 caso novo (os códigos da F03 estão reservados e fora da lista emitida; `segundo_fator_desligado` e `usuario_repetido` não foram reservados de novo). O teste genérico do catálogo e a varredura da API não contam reservados, então não precisaram de ajuste.
5. Contabilidade dos números: chave `V2-F03-0C` (+1) em `MUDANCAS_DO_TESTE_SHARED_POR_ETAPA` de `dc360/scripts/baseline.mjs`; contagens citadas em `dc360/README.md` (417 para 418; 4366 para 4367) e `dc360/docs/COLOCAR-DE-PE.md` (6376 para 6377).

## Códigos reservados (status e categoria são a proposta do roadmap; a etapa dona confirma ao emitir e move a linha para `CODIGOS_DE_ERRO` no mesmo commit)

| Código | Status | Categoria | Etapa dona |
| --- | --- | --- | --- |
| `papel_nao_se_converte` | 409 | permanente | V2-F03-E04 (`PATCH /usuarios/:id` de ou para `usuario_orgao`) |
| `pessoa_em_varios_municipios` | 409 | permanente | V2-F03-E11 (reset do segundo fator) e V2-F03-E08 (redefinição de senha, decisão H-a) |
| `convite_invalido` | 404 | permanente | V2-F03-E10 (convite usado, vencido, reemitido ou aceito com sessão de outra pessoa; um status só, sem oráculo) |
| `escolha_de_municipio_obrigatoria` | 409 | permanente | V2-F03-E16 (aplicativo abaixo de `VERSAO_ESCOLHA_DE_MUNICIPIO` com várias contas) |
| `termo_nao_aceito` | 422 | corrigir | V2-F03-E17 (vínculo de órgão externo sem o termo aceito) |

O status de `convite_invalido` (404) e o de `termo_nao_aceito` (422) são escolha desta parte: o roteiro diz só "link inválido" e "vínculo sem termo: recusado". A 4B e a 6A confirmam ou mudam ao emitir.

## O que NÃO foi reservado, e por quê

- `segundo_fator_desligado` (503, E11) e `usuario_repetido` (409, E09) já são emitidos e estão em `CODIGOS_DE_ERRO`.
- Reaproveitam códigos existentes: sessão encerrada, conta desativada, suspenso (E03), org sem conta, plateia errada, desafio vencido, município fora da lista (`nao_autenticado`, `credenciais`), recurso de outro município e `trocar-municipio` sem conta (`nao_encontrada`), rota sem manifesto e coordenador resetando administrador (`sem_permissao`, `posto_insuficiente`), auto-reset (`autoredefinicao`), limite de taxa (`excesso_de_requisicoes`, `bloqueado`), corpo com `senha`, convite a servidor em órgão externo e restringir sigilo sem motivo (`dados_invalidos`).

## Portões (a partir da raiz do worktree, `dc360/`)

| Portão | Resultado |
| --- | --- |
| `npm run typecheck` | verde nos cinco pacotes |
| `npm test --workspace @dc360/shared` | 417 passam, 1 falha: o EPERM de symlink de `regras-de-conteudo.test.ts` (DV-46, ambiente Windows) |
| `npm run test:api` | 2039 passam, 34 puladas, 2 falham em `test/semear-homologacao.test.ts` ("o comando de verdade recusa antes de conectar": o processo filho devolve `status` nulo). Não toca em nada desta parte; é ambiente (criação do processo filho no Windows). A varredura do catálogo (`catalogo-de-erros.test.ts`) passa com os reservados |
| `npm run lint` | OK nos dois conjuntos |
| `npm run formato:conferir` | OK, 837 arquivos |
| `npm run conferir:numeros` | OK (`saidas/01-conferir-numeros.txt`) |
| `npx vitest run packages/shared/test/regras-de-conteudo.test.ts` | 9 passam, 1 EPERM de symlink (DV-46) |
| `node --test scripts/baseline.test.mjs` | 29 passam |
| `node dc360/scripts/conferir-indices-de-evidencia.mjs` e `node scripts/roadmap/gerar-estado.mjs --conferir` | verdes (índice com 1 pasta nova; estado confere) |

Limitação: a falha de `semear-homologacao` não foi reproduzida na base limpa; a atribuição a ambiente vem de a falha ser na criação do processo filho e de esta parte não tocar código da API.
