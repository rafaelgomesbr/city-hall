---
validador: qa (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E12
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [API, DOCUMENTO]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Árvore no HEAD `95f09f6` (produto igual a `52952a1`). Sonda própria `$SP/val/qa/sondas/qa-e12.test.ts`: gera o laudo da rota (`GET /documentos/:id/laudo`) e o do pacote (`POST /saida/pacote.zip`) para a mesma vistoria e compara o aviso de equipe e também o TEXTO INTEIRO linha a linha (tags tiradas), em sete estados.

| Critério | Prova (`$SP/val/qa/33-sonda-e12.txt`, salvo indicação) | Resultado |
| --- | --- | --- |
| Teste vermelho de `saida-de-municipio.test.ts:364` verde | `test:api` (`01-test-api.txt`), arquivo 32 de 32 também isolado (parte do `41`) | PASS |
| Positivo: vistoria F1 (Alfa designada, agente da Bravo), o aviso do pacote é igual ao da rota | notas idênticas, com "estava designada à Equipe Alfa ... lotado na Equipe Bravo" | PASS |
| Negativo: equipes iguais não imprimem aviso | notas iguais nos dois, sem "designada" nem "lotado na" | PASS |
| Negativo: agente sem equipe imprime a frase própria | "sem equipe registrada no momento do recebimento" nos dois, sem "lotado na" | PASS |
| Negativo: vistoria antiga com colunas nulas não imprime nada | notas iguais, sem aviso | PASS |
| Negativo: sem despacho imprime só a nota própria | `saida-de-municipio.test.ts`, caso "coleta sem despacho" verde no `test:api`; não refeito na minha sonda | PASS (E1 do repositório) |
| Isolamento: o ZIP de A não contém nome de equipe de B | nenhum arquivo de dado do pacote de Serra Alta cita "Equipe Única", "Vale Fundo" nem o prefixo dos ids de Vale Fundo (fora `esquema/`, que são as migrações, com "Vale Fundo" em comentário); `test:isolamento` 345 e 3 pulados, código 0 (`02`) | PASS |
| E2E: baixar o pacote e conferir o aviso | `npm run test:e2e:api`, seção 29 (`07-test-e2e-api.txt`): divergência montada pela API, pacote baixado pelo painel, "o trecho do aviso e IDENTICO nos dois documentos, palavra por palavra", a coleta sem divergência sem aviso nos dois, "nenhum arquivo do pacote cita a equipe de Vale Fundo"; 288 de 288 | PASS |
| Pendência do montador único registrada | `apps/api/PENDENCIAS.md` e `docs/SAIDA-DE-MUNICIPIO.md` lidos: tabela das diferenças com o estado de cada uma | PASS |
| Defeito da rodada 2 (assinatura declarada e ausente: imagem quebrada no pacote, "Assinatura não coletada" na rota, documentação dizendo "sem efeito no papel") | reexecutado: com a chave apontando para objeto inexistente, os dois blocos de assinatura são IGUAIS ("Assinatura não coletada", sem `<img>`), e a falta segue em `PENDENCIAS-DA-EXTRACAO.txt`; a documentação lista a assinatura como "Igual" e o caso do armazenamento sem resposta como "Diferente, de propósito" | não morde mais |
| Diferença deliberada da correção 2 (armazenamento sem resposta) | com `descrever` e a cópia lançando: o pacote não imprime `<img>`, imprime "Não foi possível conferir a assinatura no armazenamento ao montar este pacote", registra "Assinatura NÃO LIDA ... Isto NÃO quer dizer que o arquivo não exista"; o termo de interdição do pacote não traz `<img class="traco">`; a rota imprime "Assinatura não coletada", como a tabela diz | PASS |
| Assinatura presente continua imagem e o pacote leva o arquivo | `<img class="traco" src="../../evidencias/000473-2026/assinatura-qa.png">` e o arquivo no ZIP | PASS |
| Regressão: `test:api`, `test:isolamento`, `test:e2e:api` | `01` 1309 aprovados, 1 falha de ambiente (`openssl-do-teste`); `02` código 0; `07` código 0 | PASS |

Comparação do texto inteiro (procura de diferença NÃO documentada), vistoria F1 com uma foto e assinatura presente, equipes diferentes: só na rota "por Helena Vasques Coutinho (coordenador)" e o identificador da emissão; só no pacote "por Rita Sampaio Lopes (administrador)" e outro identificador. As duas são a linha "Esperado, não é defeito" da tabela de `docs/SAIDA-DE-MUNICIPIO.md` (quem consta como emitente e identificador da emissão). Com a assinatura ausente, as mesmas duas e nada mais.

## Evidência

- `$SP/val/qa/33-sonda-e12.txt`: 8 de 8
- `$SP/val/qa/41-mutacao-M2-assinatura.txt` e `.diff`: `assinaturaUrl` montada só pela chave (o estado da rodada 2) reprova 3 de 32 de `saida-de-municipio.test.ts` e 2 de 8 da minha sonda
- `$SP/val/qa/42-mutacao-M3-M4.txt` e `.diff`: os nomes das equipes trocados por nulo na consulta do pacote reprovam 2 de 8 da minha sonda (equipes diferentes e agente sem equipe)
- As duas mutações restauradas com `git restore`; `git status --porcelain` limpo depois de cada uma
- `$SP/val/qa/01`, `02`, `07`; CI run 38618369218, 9 de 9 `success`

## Cenários positivos

Aviso igual nos dois laudos com divergência; assinatura presente como imagem nos dois, bytes no ZIP.

## Cenários negativos

Equipes iguais, agente sem equipe, colunas nulas (sem aviso falso); assinatura declarada e ausente; armazenamento sem resposta; isolamento do ZIP.

## Tentativas de reprovar

- Diff do texto inteiro dos dois laudos para achar diferença que a tabela não lista: só as esperadas.
- Termo de interdição dentro do pacote com o armazenamento fora do ar: sem imagem quebrada.
- Assinatura com chave de outro município: impossível no banco (CHECK da migração 009 exige o prefixo `tenant/<município>/`), então a conferência de prefixo do pacote é defesa em profundidade; não há cópia de arquivo de outro município por esse caminho.
- Mutações que desfazem o conserto da etapa e o da correção 2: os testes mordem.

## Achados

- ANOTADO (limitação declarada pelo implementador, confirmada por leitura): se a conferência diz que a assinatura existe e a cópia falha logo depois, o laudo do pacote sai com a imagem e o arquivo vai para `PENDENCIAS-DA-EXTRACAO.txt`; janela entre duas chamadas, montador único na F09-E02.
- ANOTADO: as três diferenças que continuam (fotos de todas as vistorias, seções das avulsas e dos registros perdidos) não aparecem no meu diff porque a minha sonda não tem foto avulsa, re-vistoria nem registro perdido; elas estão travadas pelo bloco "campo por campo", verde.

## Não verificado

- Re-vistoria real com fotos de vistoria anterior no pacote.
- Renderização visual dos dois HTML em navegador (a etapa não é de interface).
- Firefox na seção 29.

## Risco residual

Os dois montadores continuam existindo até a F09-E02; o teste "campo por campo" não compara o laudo inteiro, e uma diferença nova em outro campo passa por ele (dito assim na documentação).

## Motivo do humano

Não se aplica: a comparação "rota x pacote" para a vistoria F1 foi feita por execução, inclusive no texto inteiro.
