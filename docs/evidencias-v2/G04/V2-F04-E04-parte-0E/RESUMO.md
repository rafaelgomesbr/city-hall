# V2-F04-E04, parte 0E: o dossiê por lista de inclusão no shared

Ramo `trab/f04-0e-e04-dossie`, base `origin/trab/f04-0c-andaime-shared` (`c0ddab50`). Parte do lote 0 da F04 (plano em `docs/roadmap-v2/retomada/plano-f04.md`, norma: ADR 0009 e ADR 0010 com as correções 1 e 2, decisão 5 e decisão 10). Só a parte shared da E04: `dc360/packages/shared/src/dossie.ts` e `dc360/packages/shared/test/dossie.test.ts`. Sem migração, sem API, sem rota. Risco alto (LGPD: é o que sai da Defesa Civil para uma secretaria).

## Fatos

1. `CAMPOS_DO_DOSSIE` é uma LISTA DE INCLUSÃO de nove campos, congelada, em três categorias:
   - **mínimo fixo** (`protocolo`, `tipo`, `endereco`): saem sempre, sem justificativa;
   - **dado sensível da ocorrência** (`solicitante_nome`, `solicitante_contato`, `vulnerabilidade_descricao`, `descricao`): só saem se marcados E com justificativa de no mínimo 20 caracteres (aparados), registrada pela CHAVE do campo;
   - **texto livre dirigido ao órgão** (`pedido`, obrigatório; `observacoes_da_coordenacao`, opcional): os únicos canais de texto livre ao órgão fora dos eventos (correção 1 da ADR 0010, decisão 5). Ficam em `campos_sensiveis`.
   O catálogo diz, por campo: chave, rótulo, categoria, `sensivel`, `exigeJustificativa`, `obrigatorio` e a origem (coluna de `ocorrencias` ou "escolha da Defesa Civil"). O catálogo completo está em `saidas/09-catalogo-de-campos.txt`.
2. `montarDossie(ocorrencia, escolha)` devolve `{ ok: true, dossie }` ou `{ ok: false, erros }`, nunca lança. O dossiê é um objeto NOVO e congelado em todos os níveis (`campos`, `campos_sensiveis`, `justificativas`, `chaves_incluidas`, `pedido_em_revisao`, `origem`). A entrada não é mutada (provado com entrada congelada em todos os níveis) nem referenciada. Os valores só são lidos da origem declarada no catálogo; coluna que a linha da ocorrência tenha e o catálogo não conheça (documento, e-mail, coordenada) é ignorada e jamais copiada.
3. Campo fora da lista REPROVA (`fora_da_lista`), não é ignorado em silêncio: a rota o responde como `dados_invalidos` (422). Vale para chave inventada, para o nome de qualquer coluna de texto livre de `providencias` e `oficios` e para nomes herdados de `Object` (`__proto__`, `constructor`, `toString`, `hasOwnProperty`).
4. `COLUNAS_DE_TEXTO_LIVRE_FORA_DO_DOSSIE` nomeia as seis colunas que nunca chegam ao órgão direto da coluna: `providencias.descricao`, `.responsavel`, `.orgao_destino`, `.resposta`, `.respondida_por` e `oficios.observacoes`. Nenhum campo do catálogo tem origem nelas (teste). O que `oficios/documento.ts` imprime hoje e que NÃO pode mais sair do ofício: `providencia.descricao` e `providencia.responsavel` (linhas "Providência solicitada" e "Responsável indicado"), `oficio.observacoes` (linha "Observações da coordenação"), e da ocorrência o `solicitante_nome` ("Solicitante"), a `descricao` (o relato, em `<p class="relato">`), a `vulnerabilidade_descricao` ("Vulnerabilidade registrada"), o `ponto_referencia` e a `severidade`. Só voltam pelo dossiê, com marcação e justificativa. Isso é trabalho da E12; aqui está o contrato.
5. `montarDossieDeMigracao(ocorrencia)` é a versão 1 de origem `migracao` dos legados: SÓ o mínimo fixo, `campos_sensiveis: null`, nenhuma justificativa, `pedido_em_revisao: true`. Não copia texto livre de coluna nenhuma, nem se a linha trouxer `pedido`, `observacoes_da_coordenacao`, `descricao`, `resposta` (teste com sentinelas). A recomposição pela Defesa Civil é `montarDossie` (`pedido_em_revisao: false`). `ROTULO_PEDIDO_EM_REVISAO` ("Pedido em revisão pela Defesa Civil") é o texto que o painel e o portal mostram enquanto isso.
6. Erros em português, sem o valor do campo (teste: nenhuma sentinela de dado pessoal aparece em nenhum resultado de recusa). Motivos: `fora_da_lista`, `sensivel_sem_justificativa`, `justificativa_curta`, `justificativa_de_campo_nao_incluido`, `campo_vazio_na_ocorrencia`, `minimo_ausente`, `tipo_a_classificar`, `pedido_ausente`, `pedido_curto`, `texto_longo_demais`.
7. Contabilidade: chave `V2-F04-0E` (+76) em `MUDANCAS_DO_TESTE_SHARED_POR_ETAPA` de `dc360/scripts/baseline.mjs`; totais do `dc360/README.md` (419 para 495 no pacote; 4505 para 4581 em `npm test`) e de `dc360/docs/COLOCAR-DE-PE.md` (6515 para 6591), sobre a árvore da 0C.

## Justificativa (decisões que o plano deixou abertas)

- **`pedido` e `observacoes_da_coordenacao` NÃO exigem a justificativa de 20 caracteres** (`exigeJustificativa: false`), embora estejam em `campos_sensiveis`. Leitura da ADR 0010: a decisão 10 pede justificativa para "nome, contato, vulnerabilidade e descrição livre do relato"; a decisão 5 dá aos dois textos "categoria própria", cuja contrapartida é "a tela de composição com o aviso de que vão ao órgão" e o evento que registra as chaves, e não fala em justificativa. Exigi-la do `pedido`, que é obrigatório em todo envio, produziria uma frase decorada em todo dossiê e esvaziaria a justificativa dos dados pessoais. Se o Rafael ou o encarregado quiserem a leitura literal ("todo campo de `campos_sensiveis` com justificativa"), basta trocar duas linhas do catálogo (`exigeJustificativa: true`); os testes que dependem da escolha estão em "o texto livre dirigido ao órgão". Se alguém der justificativa para esses dois campos e ela for curta (menos de 20), o dossiê reprova.
- **Fora do catálogo de propósito, até o CP-09 decidir:** `ponto_referencia` (texto livre da ocorrência, pode citar nome de vizinho), `severidade` e data de interdição. O ofício atual imprime os três. Entrar é acrescentar uma linha em `CAMPOS_DO_DOSSIE`. A ADR 0010 (decisão 10) fixa só o mínimo e os quatro sensíveis, e o padrão é o conservador.
- **Tipo `outro` reprova** (`tipo_a_classificar`), tanto na composição quanto na versão `migracao`. O dossiê é de tipo COBRADE (decisão 10) e o despacho já recusa `outro`. Consequência para a 1A (E04 banco): a migração SQL da versão 1 dos legados precisa dizer o que fazer com uma providência cuja ocorrência ainda é `outro` (a lista da 0E, aplicada no SQL, também não pode copiar `outro`). Registro para o dono da 1A.
- **Campo sensível "marcado" é chave em `incluir`.** O pedido e as observações dispensam a marca: escrever é o ato de incluir (observações vazias não entram).
- **Justificativa de campo não marcado reprova** (`justificativa_de_campo_nao_incluido`), para não existir no registro do envio justificativa de um dado que não foi enviado.
- **Chaves iguais às colunas de `ocorrencias`** (`solicitante_nome`, `vulnerabilidade_descricao`...). A linha entrada é no formato de coluna (snake_case), como o `DadosDoOficio` já recebe.

## Divergências do plano e da ADR

Nenhuma de norma. Duas leituras a confirmar (acima): `pedido`/`observacoes` sem justificativa de 20 caracteres, e `ponto_referencia`/`severidade` fora do catálogo.

## Portões (a partir de `dc360/`)

| Portão | Resultado |
| --- | --- |
| `npx vitest run packages/shared/test/dossie.test.ts` | 76 passam (`saidas/04-teste-dossie.txt`) |
| `npm test --workspace @dc360/shared` | 494 passam, 1 falha: o EPERM de symlink de `regras-de-conteudo.test.ts` (DV-46, ambiente Windows) (`saidas/03-teste-shared.txt`) |
| `npx vitest run packages/shared/test/regras-de-conteudo.test.ts` | 9 passam, 1 EPERM de symlink (DV-46) (`saidas/05-regras-de-conteudo.txt`) |
| `npm run typecheck` | verde (`saidas/01-typecheck.txt`) |
| `npm run lint` e `npm run lint:teto` | OK; teto em 431 (`saidas/02-lint.txt`) |
| `npm run formato:conferir` | OK (os dois arquivos formatados com Prettier) |
| `node scripts/auditar.mjs` | runtime limpo (`saidas/06-auditar.txt`) |
| `npm run conferir:numeros` | OK, todos os números da documentação batem (`saidas/07-conferir-numeros.txt`) |
| `node --test scripts/baseline.test.mjs` | 29 passam |
| `npm run test:isolamento` (CA-06 e `catalogo-nominal`) | 577 passam, 6 puladas, 8 falham, todas falhas de ambiente Windows aceitas: `desfazer-migracao` 5 e `guarda-da-semente` 3 (reexecutados só esses dois arquivos: as mesmas 8) (`saidas/08-teste-isolamento.txt`) |
| `npm run test:api` | 2039 passam, 34 puladas, 2 falham em `semear-homologacao` (falha de ambiente aceita) (`saidas/11-test-api.txt`) |
| `CI=true npm run test:scripts` | 807 passam; 1 falhava (`conferir-indices-de-evidencia: a evidência real`) até o `INDEX.md` desta pasta existir; fechado com o índice (ver commit) (`saidas/10-test-scripts.txt`) |
| `node scripts/roadmap/gerar-estado.mjs --conferir` (da raiz) | verde |

Não rodei `test:e2e:api` (o CI cobre). Esta parte não toca banco, API nem aplicativo.

## Para o orquestrador

- Linha do STATUS sugerida: "V2-F04-E04 parte 0E (dossiê por lista de inclusão no shared) IMPLEMENTADA em `trab/f04-0e-e04-dossie`; `CAMPOS_DO_DOSSIE`, `montarDossie`, `montarDossieDeMigracao` e `COLUNAS_DE_TEXTO_LIVRE_FORA_DO_DOSSIE` no shared; 76 testes. A E04 só fecha com a 1A (banco) e a 1B (API)."
- Dívidas pagas: nenhuma. Pendências humanas: confirmar com o encarregado/Alyson (a) que `pedido` e `observacoes_da_coordenacao` dispensam a justificativa de 20 caracteres, e (b) se `ponto_referencia` e `severidade` entram no catálogo (CP-09; H117 continua bloqueando o primeiro encaminhamento real).
- Mudança de plano: nenhuma. Para a 1A: a migração SQL da versão 1 `migracao` deve usar a mesma lista (protocolo, tipo, endereço) e decidir o caso `tipo = 'outro'`. Para a 1B (`comporDossie`): chamar `montarDossie` sob o ator da Defesa Civil, mapear `ok: false` para `dados_invalidos` (422) com `erros[].chave` e `mensagem`, gravar `justificativas` e `chaves_incluidas` onde o evento `enviado` as registra (chaves, nunca valores) e decidir se a justificativa é visível ao órgão (a 0E não a deixa dentro de `campos` nem de `campos_sensiveis`). Para a E12: `COLUNAS_DE_TEXTO_LIVRE_FORA_DO_DOSSIE` é a lista para o teste `oficio-so-leva-o-dossie`.
- Conflitos esperados na junção: `dc360/scripts/baseline.mjs` (uma linha própria), `dc360/README.md` e `dc360/docs/COLOCAR-DE-PE.md` (totais, que o integrador recalcula somando as chaves de cada parte).
