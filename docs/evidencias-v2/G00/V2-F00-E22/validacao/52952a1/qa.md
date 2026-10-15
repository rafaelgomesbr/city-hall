---
validador: qa (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E22
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [DB]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Objetivo da etapa: "nenhum documento do produto afirma o contrário do código; o que ainda não existe é dito como pendência". DoD: os oito itens corrigidos com prova, números conferidos pela máquina.

| Critério | Prova | Resultado |
| --- | --- | --- |
| `conferir:numeros` com zero divergência | 25 conferidas, código 0 (`E17-02`, mesma saída usada na E17); Linux do CI idem | PASS |
| `npm test` com `regras-de-conteudo` verde | `test/regras-de-conteudo.test.ts` 8 de 8 dentro de `R-01-npm-test.txt` | PASS |
| `npm run auditar` | código 0, "Runtime limpo, e o aplicativo sem advisory nova" (`R-02`) | PASS |
| Grep negativo: "DESLIGADO NESTA IMPLANTAÇÃO", "sem ida ao banco", "NUNCA RODOU EM APARELHO", "MapLibre" como vigente | zero acertos indevidos; "MapLibre" só em `apps/web/PENDENCIAS.md:162-171`, como item encerrado (`E22-03`) | PASS |
| Item 1, README (console sem escrita, banco separado, MapLibre, assinatura) | `README.md:620-629` diz que o console TEM rotas de escrita e que o banco é o mesmo Postgres com papel próprio; confere com o ADR e o código | PASS no que o item lista; ver achado 2 para outra afirmação do README |
| Item 2, `db/PENDENCIAS.md` | nenhuma frase de console não construído nem `resumir_municipio` sem chamador; `agendarResumo` em `apps/api/src/index.ts:370`; o teto citado (`isolamento.test.ts:626`, 27) confere | PASS |
| Item 3, `apps/api/PENDENCIAS.md` refeito com o que realmente resta | a tabela "As diferenças entre os dois laudos" e o texto da gravidade omitem uma diferença que o código tem (achado 1) | FAIL |
| Item 4, ADR 0008 com nota de revisão datada | `docs/adr/0008-...md:204` em diante; conferi a 038 e a 039 (`console_suspender_municipio`, `console_codigos_de_recuperacao`), `fly.console.toml`, `CONSOLE_OPERADORES` como semente (`apps/console/src/operadores.ts:27`) e `eliminacoes` no `/saude` (`servidor.ts:693-697`) | PASS |
| Item 5, `SAIDA-DE-MUNICIPIO.md` capítulo 2 contra capítulo 5 | capítulo 2 (linhas 49-60) agora diz que o corte acontece na suspensão e no agendamento da eliminação, coerente com o capítulo 5. Mas a linha 95 e a tabela das linhas 153-165 afirmam um conjunto de diferenças entre os laudos que o código desmente (achado 1) | FAIL |
| Item 6, `LEIA-ME` do campo "sem artefato de aparelho arquivado" | linha 3 diz isso; ver achado 3 (frase sobre emulador desmentida pelo próprio repositório) | PASS com achado |
| Item 7, `apps/web/PENDENCIAS.md` | itens 1, 3 e 5 marcados como resolvidos; 8.1 (`fetch` solto em `abrirDocumento` e `baixarCsvDeOcorrencias`) confere com `apps/web/src/dados/http.ts:889-905` e `:1053-1070` | PASS |
| Item 8, comentários de vigência (`sessoes.ts`, `suspensao.ts`, `servidor.ts`) | `suspensao.ts:41-65` descreve escrita como método OU `ROTA_GET_COM_EFEITO` e lista laudo, termos, PDFs, CSV e `GET /avisos`; confere com `servidor.ts:112` e `:516` e com as cinco rotas marcadas em `documentos.ts:729-848`, `prestacao-de-contas.ts:310`, `avisos.ts:209` | PASS |

Os seis defeitos da rodada 2 (primeiro balde), reexecutados:

1. `suspensao.ts` dizendo que `GET /avisos` segue aceitando o token: CONSERTADO (texto atual em `suspensao.ts:41-56`).
2. `apps/api/PENDENCIAS.md` "sem efeito no papel" na assinatura: CONSERTADO para o caso "declarada e ausente no armazenamento". Mas a varredura desta rodada achou o caso irmão (assinatura coletada e PERDIDA no aparelho), que a tabela não traz: achado 1.
3. README "`expo-doctor` menos uma verificação": CONSERTADO; e executei `npx expo-doctor`: 21 de 21, código 0 (`R-03`), que é o que README, `LEIA-ME` e `LOJAS` dizem como estado final.
4. README e `COMO-REPRODUZIR.md` prometendo código 1 por V-DEP-4: CONSERTADO (`README.md:1190-1204`, `COMO-REPRODUZIR.md:65-67`: V-DEP-4 fechada, código 0, 15 de 17 no Mac pelas duas divergências de máquina).
5. `RESTORE-DO-BANCO.md` 47 migrações e Postgres 17 não provado: CONSERTADO como fato datado, com o marcador de migrações conferido pela máquina. Resíduo anotado: a frase "com a árvore de hoje (50 migrações) o job ainda não rodou" ficou velha, porque o job "Restore do banco, Postgres 17" do run 38618369218 aplicou as 50 (log: "migracoes em disco: 50", "schema_migracoes tem as 50 migracoes").
6. `LOJAS.md` "nunca rodou": CONSERTADO (`LOJAS.md:290-306`).

Segundo balde da rodada 2: 7 (`avisos.ts:195`, teto de 27) consertado NAQUELA linha, mas a mesma afirmação velha sobreviveu em `avisos.ts:315`, no README e em outros comentários (achado 2); 8 (`COLOCAR-DE-PE.md:40-49`) consertado; 9 (emulador) reescrito, mas ver achado 3; 10 (web 10.1) consertado; 11 (portão só para contagem de teste) parcialmente atendido com o marcador de migrações.

## Evidência

Saídas em `$SP/val/qa/lote4/`:

- `E22-01-referencias.txt`: toda referência a arquivo citada entre crases em README, PENDENCIAS, LEIA-ME, LOJAS e `docs/` conferida contra `git ls-files`; sobram só nomes gerados (`INDICE.html`, `router.d.ts`) e um caminho de segredo de exemplo.
- `E22-03-grep-negativo.txt`.
- `E22-04-sonda-vitest.txt` e `E22-04-sonda-assinatura-perdida.txt`: a sonda do achado 1.
- `R-01-npm-test.txt`, `R-02-auditar.txt`, `R-03-expo-doctor.txt`, `E17-02-conferir-numeros.txt`.

Sonda do achado 1 (reprodução independente): arquivo temporário `apps/api/test/zz-sonda-qa-e22.test.ts`, feito das linhas 1 a 245 de `test/saida-de-municipio.test.ts` (o mesmo banco PGlite semeado e o mesmo armazenamento em memória) mais um caso: `UPDATE vistorias SET assinatura_chave = NULL` na vistoria F1 e um `INSERT INTO vistoria_evidencias_perdidas (..., papel) VALUES (..., 'assinatura')`, que é o registro que a migração 030 descreve para traço coletado e perdido. Depois, `GET /documentos/:id/laudo`, `GET /documentos/:id/termo-de-interdicao` e `POST /saida/pacote.zip`. `npx vitest run` código 0; o arquivo foi apagado logo depois e `git status --porcelain` voltou a mostrar só as pastas de relatório.

## Cenários positivos

- Números, portão de conteúdo, `auditar` e `expo-doctor` batem com o que os documentos dizem hoje.
- ADR 0008, `db/PENDENCIAS.md`, comentários de vigência e os seis pontos da rodada 2 conferem com o código.

## Cenários negativos

- Grep negativo da etapa: zero acerto indevido.
- Afirmações que o código desmente: achados 1 e 2.

## Tentativas de reprovar

- Reproduzi por conta própria o caso que o validador de especificação desta rodada apontou na E12 (assinatura coletada e perdida). Confirmado, ver achado 1.
- Procurei a mesma afirmação velha que reprovou a rodada 2 (item 7, teto de funções `SECURITY DEFINER`) no resto da árvore: ela sobreviveu fora da linha consertada (achado 2).
- Procurei artefato de execução do aplicativo no repositório para testar a frase do `LEIA-ME` (achado 3).
- Conferi rotas GET que escrevem além das marcadas: `oficios.ts:359` e `evidencias.ts:589` não escrevem; o dossiê e a busca gravam `ocorrencia_consultas` e estão descritos assim em `suspensao.ts:61-64`.

## Achados

1. **bloqueia.** `dc360/docs/SAIDA-DE-MUNICIPIO.md:95` ("três diferenças continuam até a V2-F09-E02, e uma quarta é deliberada"), a tabela de `SAIDA-DE-MUNICIPIO.md:153-165`, a tabela de `apps/api/PENDENCIAS.md:293-301` e as justificativas de `SAIDA:164` e `PENDENCIAS:301` ("o pacote não afirma ausência que ninguém conferiu") são desmentidas pelo código quando a assinatura foi coletada e se perdeu no aparelho. Reprodução (`E22-04-sonda-assinatura-perdida.txt`): no bloco "Presente no local", o laudo da rota imprime `Assinatura coletada em campo e não recuperada do aparelho` e o laudo do pacote imprime `Assinatura não coletada`; no bloco "Responsável pelo imóvel, ciente" do termo de interdição, a mesma diferença; e o próprio pacote exporta `tabelas/vistoria_evidencias_perdidas.csv` com a linha `papel = assinatura`. Causa no código: `documentos/laudo.ts:672-680` (`ausenciaDaAssinatura` só diz "coletada e não recuperada" se `evidenciasPerdidas` tem `papel === "assinatura"`) e `saida/pacote.ts:738-760`, que monta `DadosDocumento` sem `evidenciasPerdidas`. Ou seja, o pacote AFIRMA ausência contra o registro que ele mesmo leva, o contrário do que a documentação diz, e a contagem de diferenças está errada. O comentário de `laudo.ts:665-671` chama exatamente este texto, no termo de interdição, de "motivo para anular o ato". A E22 existe para que a documentação não afirme o contrário do código, e estes dois documentos são os itens 3 e 5 dela. Conserto mínimo, só documentação: uma linha nas duas tabelas ("assinatura coletada e perdida no aparelho: rota imprime 'coletada em campo e não recuperada do aparelho', pacote imprime 'Assinatura não coletada', no laudo e no termo; diferente até a F09-E02"), a contagem da linha 95 e a gravidade de `PENDENCIAS:303-306` acertadas; ou, em código, o pacote ler `vistoria_evidencias_perdidas` da vistoria vigente (dono provável do código: E12 ou F09-E02).
2. **bloqueia.** `dc360/README.md:932` (seção "O agente que sobe o morro sozinho", tabela de decisões) afirma: "O orçamento está em quinze de quinze e o portão CA-06 reprova a décima sexta." O portão é `db/test/isolamento.test.ts:626`, `toBeLessThanOrEqual(27)`, e o próprio comentário do teste registra a subida para 27 em 15/09/2026 por `varrer_tarefas_novas` (migração 042), que é justamente uma função de relógio para push. É o mesmo defeito do item 7 da rodada 2, consertado só em `avisos.ts:195`. A mesma frase velha continua em comentários de código: `apps/api/src/rotas/avisos.ts:315-316`, `apps/api/src/rotas/saida-a-campo.ts:74-75`, `apps/api/src/armazenamento/orfaos.ts:129-130` e `:184-185`, `apps/api/src/armazenamento/cli.ts:80`. Reprodução: `grep -rn "quinze de quinze" dc360/README.md dc360/apps/api/src` e `sed -n 626p dc360/db/test/isolamento.test.ts`. As migrações 031 e 035 trazem a mesma frase, mas migração é registro histórico e não se corrige.
3. **corrige antes de crescer.** `dc360/apps/campo/LEIA-ME.md:12-18` diz que "nenhuma foto, vídeo, registro ou captura de aparelho está no repositório" e que "nenhum registro de execução num deles [emulador ou simulador] está no repositório". O repositório, no SHA validado, tem capturas do aplicativo rodando no emulador Android e o relato da execução: `docs/evidencias-v2/G00/V2-F00-E06/validacao/4b96ea7/anexos/E06-*.png` (seis capturas, por exemplo `E06-fila-pausada-sessao-encerrada.png`, a tela "Fila de envio" com a barra de status do Android) e `docs/evidencias-v2/G00/V2-F00-E16/validacao/4b96ea7/anexos/E16-ajustes-do-aparelho-abertos.png`, mais `V2-F00-E16/validacao/4b96ea7/qa.md`, que registra a execução no emulador (e um defeito achado nele). Erra para menos, como o item 8 da rodada 2, mas é afirmação sobre o repositório que o repositório desmente. Dono: E22.
4. **anotado.** `dc360/docs/RESTORE-DO-BANCO.md` diz que, com 50 migrações, "o job ainda não rodou"; o run 38618369218 rodou o job com as 50. Frase datada que envelheceu; vale reescrever quando o roteiro for acertado (ver o relatório da E25).
5. **anotado.** `conferir:numeros` não confere "N casos" nem contagem de migrações fora do marcador (ver relatório da E17).

## Não verificado

- Leitura integral, linha a linha, dos 20 documentos tocados pela fase (cerca de 2.400 linhas novas): conferi as afirmações verificáveis por amostragem dirigida (referências a arquivo, números, vigência, laudos, console, emulador, teto de funções privilegiadas, migrações 048 a 050), não cada frase.
- A tabela antes e depois pelo Rafael (validação humana da etapa).

## Risco residual

Médio. Duas afirmações que o código desmente continuam em documentos que a etapa devia ter fechado, e uma delas é sobre o papel que o município leva embora. A classe "afirmação consertada numa linha e esquecida na linha vizinha" se repetiu pela terceira rodada.

## Motivo do humano

A validação humana da etapa (Rafael ler a tabela antes e depois e confirmar que nada ficou prometido sem existir) continua pendente; é leitura de texto de produto, não substituível por execução.
