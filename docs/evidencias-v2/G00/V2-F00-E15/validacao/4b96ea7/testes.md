---
validador: testes
modelo: claude-sonnet-5-5
etapa: V2-F00-E15
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, LGPD]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Veredito na primeira linha: **PASS**, com três lacunas de mutação anotadas (E2, E8, E9). O FAIL da rodada 1 (teste que travava a perda de rascunho) está consertado e o teste novo, com sessão, banco e tela reais, morde nos três pontos em que o defeito poderia voltar. A etapa é de risco alto, então a lista "Não verificado" está preenchida.

Base de evidência: `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/testes/` (abreviada `testes/`; índice em `testes/00-INDICE-DE-MUTACOES.txt`, entradas E1 a E13).

| Critério | Resultado |
| --- | --- |
| rodada 1: o teste que exigia `sair` foi reescrito, e o conserto não o reprova | PASS (E12: `vistoria-ainda-nao-baixada` e o teste novo reprovam quando o botão deixa de encerrar a sessão) |
| "Entrar de novo" na vistoria preserva rascunho, foto e assinatura, com módulos reais | PASS (E12 e E13 morrem; E13 faz `encerrarSessaoVencida` apagar tudo: 2 reprovam) |
| a saída explícita (a do Perfil) continua apagando (controle) | PASS (E5: `apagarDadosLocais` sem apagar rascunho reprova 3) |
| outro agente recebe aparelho limpo; a mesma pessoa reencontra a vistoria; a fila fica intacta | PASS (E1, E3, E4 morrem) |
| diálogo "Sair da conta?" conta rascunhos e fotos, singular e plural | PASS (E6, E7 morrem) |
| diálogo sem rascunho nem fila não fala em apagar; fila lida ao vivo | PASS (testes presentes; E9 sobrevive, ver achado 3) |
| GPS: 0,3 vira 1, 12,4 vira 12, ausente `null`; o esquema continua recusando 0 | PASS (E10: 3 reprovam; E11: tela sem o piso reprova 2) |
| suíte estável e sem teste afrouxado | PASS (lote randomizado 3 vezes sem falha nos arquivos desta etapa) |

## Evidência

- Lote de 9 arquivos: `dialogo-na-conta-com-vistoria-comecada`, `dialogo-na-conta`, `aviso-da-saida`, `precisao-do-gps`, `vistoria-sessao-vencida-preserva-o-rascunho`, `vistoria-ainda-nao-baixada`, `sair-e-entrar-nao-perde-a-coleta`, `logout-nao-apaga-prova`, `vistoria-o-teclado-a-camera-e-o-que-ela-promete`: 66 de 66 (`testes/70-e15-base.txt`).
- Lote randomizado de 21 arquivos (E06, E14, E15, E16) 3 vezes: todos os arquivos desta etapa passam em todas as rodadas (`testes/110-app-lote-randomizado-3x.txt`).
- Mutações (`apps/campo/src`, `git restore` depois de cada, árvore conferida limpa; script `testes/e15-muts.mjs`; saídas `testes/m-E*.txt`, resumos `testes/71-...txt` e `testes/72-...txt`):
  - Mortas (10): E1 outra pessoa nunca limpa o aparelho (1); E3 a limpeza apaga o arquivo que a fila usa (5); E4 o logout apaga a fila (5); E5 o logout não apaga o rascunho (3); E6 singular trocado (5); E7 aviso ignora fotos (3); E10 piso de GPS zero (3); E11 tela sem o piso (2); E12 `entrarDeNovo` não encerra a sessão (2); E13 sessão vencida apaga tudo (2).
  - **Sobreviventes (3):** E2 `acolherNoAparelho` apaga também quando o dono é nulo (66 de 66); E8 `perguntarSaida` trata disco ilegível como "nada a perder" (66 de 66); E9 o diálogo deixa de contar os bloqueados da fila (66 de 66).
- Li `vistoria-sessao-vencida-preserva-o-rascunho.test.tsx` e `sair-e-entrar-nao-perde-a-coleta.test.ts` por inteiro. Os dois usam o `ProvedorDeSessao`, o `banco-local` e o `rascunho` reais sobre o `node:sqlite` (SQL real, tabelas reais) e só simulam cofre, rede, nomes de arquivo e bibliotecas nativas. Os dublês de `expo-file-system` aqui só implementam `name`, `delete()` e `Directory.list()` síncronos, que é o que a biblioteca real faz (conferi `FileSystemModule.kt`: `Function("delete")` e `bytesSync` são síncronos; só `copy` e `bytes` são assíncronos, e o código desta etapa não usa nenhum dos dois).

## Cenários positivos

Mesma pessoa reentra e reencontra checklist, observações, assinatura e foto; plural e singular do diálogo; chip e aviso somem quando a fila esvazia; 0,3 vira 1.

## Cenários negativos

Outro agente entra: rascunho limpo, fila e arquivo da fila intactos (E1, E3 mordem). Saída explícita apaga só o que o diálogo diz que apaga (E4, E5 mordem). Esquema do servidor ainda recusa 0 e negativo com a frase em português.

## Tentativas de reprovar

- Procurei teste que trava comportamento errado: o `vistoria-ainda-nao-baixada` reescrito exige `encerrarSessaoVencida` uma vez, `sair` nunca e `router.replace("/entrar")`, e o teste novo prova no disco. O localizador `botaoDeEntrarDeNovo` aceita o rótulo antigo ou o novo de propósito (documentado no teste), para falhar por perda e não por "botão não encontrado".
- Asserção que nunca falha: as de disco comparam o conjunto exato de nomes (`[ASSINATURA, FOTO]`) e a lista de rascunhos; E13 as derruba.
- Regressão de ordem e de estado: o banco é recriado em `beforeEach` (`mockBanco.close()` e `esquecerConexao()`); lote randomizado verde.
- Caminho que o teste não cobre: (a) primeiro login em aparelho que já tem dado sem dono (E2); (b) disco que falha ao listar rascunhos na hora de perguntar a saída (E8); (c) fila com item bloqueado na contagem do diálogo (E9). Os três sobrevivem.
- Lógica no teste: `precisao-do-gps.test.ts` tem `for` sobre uma lista de leituras e um `if (!r.success)` antes da asserção da mensagem; legíveis, valores literais, anotado.

## Achados

### CORRIGE ANTES DE CRESCER

1. E8: `perguntarSaida` em `perfil.tsx` troca `setRascunhosNaSaida(null)` por `setRascunhosNaSaida(contarRascunhos([]))` e a suíte continua verde. O ramo `null` de `avisoDaSaida` é testado como função pura; o ramo da tela que o alimenta quando `listarRascunhos` rejeita não é. É a promessa que o comentário do código chama de "a promessa que apagava vistoria" ("dizer 'não há nada' sem ter conferido"). Teste a escrever: `listarRascunhos` rejeita e o diálogo traz "Não deu para conferir se há vistoria começada".
2. E2: `acolherNoAparelho(usuarioId)` com dono nulo não deveria apagar (aparelho que já tinha dado de uma versão anterior ao carimbo de dono). Nenhum teste o fixa.
3. E9: o número de coletas do diálogo soma `pendentes + enviando + bloqueados`, e nenhum teste usa bloqueado.

### ANOTADO

- Os dublês de `useSessao` e de `obterFila` em vários testes de tela (Perfil, diálogos) são módulos do próprio aplicativo. O arquivo novo de sessão vencida é o contrapeso, e é bom.
- Os arquivos de foto e assinatura são nomes num conjunto, não o disco do Android (limitação já registrada pelo implementador).
- O GPS "excelente conclui" é provado no esquema e na função de arredondamento, não na conclusão no aparelho (a foto da vistoria bloqueia o fluxo no Android, ver relatório da E16).

## Não verificado

- Emulador ou aparelho: fora da minha dimensão (o QA da rodada 2 cobriu o diálogo no emulador).
- O fluxo completo "concluir vistoria com GPS abaixo de 0,5 m e ver o servidor aceitar" com a rede real: coberto pelo esquema compartilhado e pela saída arquivada da API; não repeti.
- O texto LGPD do diálogo e os cinco achados de LGPD da rodada 1 (fila e arquivos sem prazo, JPEG enviado só sai no logout, original da câmera no cache, coordenada com 6 casas, resíduo de WAL): são de outra dimensão e seguem em `PENDENCIAS.md`.
- Revisão de `dialogo-na-conta.test.tsx` em profundidade: li o diff (dublê acrescentado) e rodei, não mutei esse arquivo especificamente.

## Risco residual

Médio-baixo. O defeito da rodada 1 está guardado por três mutações mortas e um teste com módulos reais. As três lacunas são de borda (disco ilegível, dono nulo, bloqueados), nenhuma reabre o caminho da rodada 1.

## Motivo do humano

Rafael faz os dois fluxos num aparelho (sair com vistoria começada e ler o diálogo; concluir com GPS abaixo de 0,5 m), conforme o bloco da etapa; o emulador cobriu o diálogo, não o aparelho.
