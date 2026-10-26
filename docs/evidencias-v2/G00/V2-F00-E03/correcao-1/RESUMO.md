# V2-F00-E03, correção 1: o registro de vermelhos passa a dizer o estado de hoje

Corrige o que a validação de `7005a60` provou reprovado (`../VEREDITO.md` e `../validacao/7005a60/qa.md`). Medido em 2026-10-13 sobre o HEAD `5dfc389` (depois das correções `4fcc241` a `5dfc389`), no Windows 11 com Node 22.17.0.

## Fatos

### O que a validação reprovou

1. `classificacao-dos-vermelhos.md` era a fotografia de 2026-10-05: nenhuma linha marcada como fechada, "Fecha em" no futuro, `npm audit` descrito com números velhos.
2. Instabilidades conhecidas fora do registro: `dominio.test.ts` e `regras-de-conteudo` do `@dc360/shared`, `test:isolamento` sob carga, a espera fixa de 20 ms de `resolver-link.test.ts` e o `test:e2e:api` em Firefox no Windows.
3. BZ-N:N.3 e os 14 defeitos do campo seguem pendentes de decisão de Rafael. Esta correção NÃO decide: deixa a tabela pronta.

### O que mudou

- `docs/evidencias-v2/G00/V2-F00-E03/classificacao-dos-vermelhos.md`: seção 8 nova, o registro vivo. 71 linhas, cada uma com estado, etapa e commit que fecharam e a prova (comando e resultado), ou dono, issue e prazo pela T42. As seções 1 a 7 ficaram como a fotografia de 2026-10-05, com três avisos de atualização (cabeçalho, seção 6, seção 7).
- `dc360/apps/api/test/resolver-link.test.ts`: a espera fixa `setTimeout(resolve, 20)` virou `vi.waitFor(..., { timeout: 5000, interval: 10 })`, com a mesma asserção e a mesma mensagem. Um arquivo, 13 linhas acrescentadas e 3 trocadas.
- `docs/DECISOES-DE-TESTE-DA-FASE-00.md`: o "Depois" de quatro seções que ainda diziam "previsto" (E05, E13, E17, E20) foi completado com o diff real, e a seção de `resolver-link` e a linha do índice dizem o que foi feito e o que segue aberto.
- `dc360/docs/POLITICA-DE-TESTE-VERMELHO.md`: a regra R6 passa a dizer onde o instável vive (a seção 8 do registro) e que sem dono, issue e prazo ele conta como item aberto.
- `docs/evidencias-v2/G00/V2-F00-E03/RESUMO.md`: um parágrafo no topo apontando para esta correção.
- Nenhum outro código, teste ou script foi alterado. O roteiro `dc360/scripts/baseline.mjs` NÃO foi tocado (é da correção da E01): ver V-ROT-01.

### Contagem final do registro (seção 8.7)

- **Abertos: 9**, todos com dono, issue e prazo: V-DEP-2b, V-DEP-3, V-DEP-4, V-ROT-01 e V-INS-02 a V-INS-06. Um (V-DEP-3) é tolerado por decisão já tomada (CP-03, até 2027-01-05).
- **Fechados: 62 de 71.** As 63 linhas do baseline da E01 (com V-DEP-2 dividida em 2a, fechada, e 2b, aberta) mais 7 novas; V-INS-01 (`resolver-link`) fecha nesta correção.
- **Pendentes de decisão humana: 5 perguntas** (Q1 a Q5, seção 8.6). Delas dependem 27 das 62 linhas fechadas e 5 das 9 abertas.
- O item do G00 "o registro da E03 tem zero itens abertos e a regra de BZ-N:N.3 está decidida por Rafael" NÃO está satisfeito: há 9 linhas abertas (com dono) e a decisão é de Rafael.

### O que rodou hoje (saídas em `saidas/`, `brutas/` e `regressao-final/`, todas passadas por `redigir`)

| Comando | Resultado |
| --- | --- |
| `node scripts/baseline.mjs --sem-instalar` | 12 de 17 passos conferem; 5 divergem só porque o roteiro tem contagens antigas (V-ROT-01) |
| `npm run typecheck` | saída 0 |
| `npm test` completo, 5 rodadas em sequência | saída 0 nas 5; shared 168, campo (pacote) 223, API 1299, console 259, painel 649, banco 327 e 3 pulados por ambiente, iguais nas 5 |
| `npm run test:api` | 1299 de 1299 |
| painel (`npm run test --workspace @dc360/web`) | 649 de 649 |
| `npm run test:campo` | tipos limpos e 1903 de 1903 |
| `npm run test:scripts` | 230 casos, 226 ok, 0 falhas, 4 pulados por ambiente; portão de skip: 10 skips por ambiente em 3 arquivos, 0 incondicionais com marca |
| `npm run conferir:numeros` | 24 afirmações conferidas, todas batem |
| portão de conteúdo (`npx vitest run --root packages/shared test/regras-de-conteudo.test.ts`) | 8 de 8, depois de escrito todo o texto desta correção |
| `npm run test:e2e` (painel), Chromium e Firefox | 70 passou, 0 falhou, nos dois |
| `npm run test:e2e:api`, Chromium | 279 passou e 0 falhou, mais 50 e 0 da largura estreita |
| `npm run test:e2e:api -- firefox`, 4 rodadas | 4 de 4 verdes, 279 e 50 em cada |
| `npm run auditar` | saída 0 (runtime 0) |
| `npm audit` raiz / campo, `npx expo-doctor` | 3 avisos de desenvolvimento / 59 / 20 de 21: V-DEP-2b, V-DEP-3, V-DEP-4 |
| arquivos de teste de cada linha com `--reporter=verbose` | todos os testes nomeados na seção 3 passam (`brutas/prova-*.txt`) |

### `resolver-link.test.ts`: a troca foi pequena, então foi feita

- Antes: `await new Promise((resolve) => setTimeout(resolve, 20)); expect(conexaoFechada, ...).toBe(true)`.
- Depois: `await vi.waitFor(() => expect(conexaoFechada, ...).toBe(true), { timeout: 5000, interval: 10 })`, com a mesma mensagem. O teste passa assim que a conexão fecha e só reprova se ela NÃO fechar em 5 s.
- 10 rodadas isoladas: 37 de 37 em todas (`brutas/resolver-link-10-rodadas.txt`).
- 10 rodadas sob carga sintética (12 processos Node em laço ocupado em 16 núcleos) com a versão nova, e 10 sob a mesma carga com a versão antiga (cópia de `git show HEAD:...`): 20 de 20 verdes, 37 de 37 em cada (`brutas/resolver-link-sob-carga.txt`). A carga NÃO reproduziu a falha da versão antiga. Isso não prova o conserto: prova que a causa "carga da máquina" continua hipótese.
- Teste mutante (o servidor deixa de registrar o `close`): reprova depois do limite, com a mensagem do teste (`brutas/resolver-link-mutante.txt`). O teste continua mordendo.
- 5 rodadas de `npm test` completo com a versão nova: API 1299 de 1299 nas 5.
- Os outros 10 pontos de 20 ms em 4 arquivos, e 6 esperas fixas de 10 a 100 ms em 3 arquivos de push e recuperação, NÃO foram tocados: seguem abertos como V-INS-02, dependem de Rafael aceitar a troca (Q4).

### Instabilidades medidas hoje (seção 8.4 do registro)

- `resolver-link`: 0 falhas em 36 execuções (11 com a versão antiga, 25 com a nova).
- `dominio.test.ts` e `regras-de-conteudo` (shared): 0 falhas em 6 execuções completas; eram 2 de cerca de 7 na validação.
- `test:isolamento`: 0 falhas em 6; 327 ok e 3 pulados por ambiente.
- `test:e2e:api` em Firefox no Windows: 0 falhas em 4 (279 e 50 em todas); eram 1 em 4 na validação. Total medido: 1 falha em 8 rodadas em Firefox.
- Nenhuma foi repetida até passar, nenhuma foi pulada, e nenhuma ficou sem linha no registro.

### Divergências D-1 a D-7

Cada uma tem a situação na seção 8.5. Cinco estão fechadas, D-1 está superada pelos números novos e D-4 é parcial (o roteiro ainda não tem o passo do Firefox: V-ROT-01).

### Limitações ditas abertamente

- Tudo foi medido numa máquina só, Windows 11, sem WSL nem Docker. A prova de Linux é do CI (F01-E03 liga `test:scripts` e `auditar` ao CI).
- A carga sintética é CPU. Não simula disco disputado nem outro processo gravando em `docs/`, que são as hipóteses de `regras-de-conteudo`.
- As causas de V-INS-03 a V-INS-06 não foram medidas; estão rotuladas HIPÓTESE no registro. Nenhuma reproduziu hoje, e isso não é conserto.
- `expo-doctor` e as 3 vulnerabilidades de desenvolvimento NÃO foram corrigidas: a primeira muda pacote nativo, a segunda é salto de major do `vitest`, e as duas dependem de Rafael (Q5).
- O roteiro `baseline.mjs` sai 1 numa árvore verde (V-ROT-01). Não foi corrigido aqui porque pertence à correção da E01; se ela já estiver no HEAD quando esta for lida, V-ROT-01 fecha.
- A coluna "Commit" de uma etapa implementada em lote aponta o commit do lote (`5d6bc57` ou `99390e0`), não um commit por linha.
- Um incidente da própria execução, dito por inteiro: ao interromper uma medição de carga que ficou em laço, rodei `taskkill /F /IM node.exe`, que encerra TODOS os processos Node da máquina, e não só os meus. Era o único jeito que achei na hora de parar os 32 processos de carga, mas derrubou qualquer outro Node em execução (um servidor de desenvolvimento de outro projeto, por exemplo). Nada do repositório foi afetado; quem tinha um `ng serve` ou similar aberto precisa subir de novo. Depois disso só parei processos pelo comando exato.

### Premissas e pendências humanas

- PREMISSA: o dono das linhas abertas é `rafael` (padrão da T42), e os prazos (2026-10-20, 2026-10-27 e 2026-11-12) e as issues (`V2-F00-E01`, `V2-F00-E18`, `V2-F00-E19`, `V2-F00-E21`) são propostas deste registro, dentro dos 30 dias da política. Rafael muda.
- Pendente de Rafael: Q1 a Q5 da seção 8.6 da classificação.
- Falta no STATUS (não toquei): a linha da E03, a seção 9 (premissas) e o diário, para o orquestrador.

## Justificativa

- **Seção nova em vez de reescrever as sete antigas.** A fotografia de 2026-10-05 é a base da E03 e a validação a leu como tal; reescrevê-la apagaria o que foi prometido e o que aconteceu. A seção 8 é a que o G00 consulta, e o cabeçalho manda ler ela quando houver divergência.
- **Duas colunas, e não uma.** Fechado e aberto têm perguntas diferentes: de quem fechou quer-se etapa, commit e prova; de quem segue aberto, dono, issue e prazo. Uma tabela só deixaria a metade vazia em toda linha.
- **Prova de comando em cada linha, e não "a etapa disse".** Os `RESUMO.md` das etapas foram entregues como alegações a derrubar. Rodei o arquivo de teste de cada linha com o relatório detalhado e conferi o nome do teste, para o registro não herdar a palavra de quem implementou.
- **`resolver-link` trocado, os outros 10 pontos não.** A troca é de um arquivo, mantém a asserção e foi provada com o mutante. Os outros pontos pedem medir cada espera para saber o que ela espera, e a decisão de aceitar a troca em lote é de Rafael (Q4); trocar às cegas repetiria o erro que a R6 proíbe.
- **Honestidade sobre a causa.** A carga sintética não reproduziu a falha antiga. Registrar que "a carga explica" seria afirmar o que não foi medido, e a política já diz que a causa é hipótese até alguém medir.
- **Instabilidade que não reproduziu hoje segue aberta.** Passar em 6 rodadas não prova que a causa saiu; o registro as mantém abertas com prazo para o tratamento (limite explícito, captura da saída bruta) e não as fecha por sorte.
- **Não decidir BZ-N:N.3.** A regra é de Rafael (política, "Quem tem a última palavra"). O que cabia a quem implementa era deixar a decisão com uma resposta por linha: sim, ou "troque por X", e o que muda em cada caso.
