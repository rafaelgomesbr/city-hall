---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E22
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [DB]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Saídas em `SCRATCH/validadores/qa/e21e22/` (SCRATCH é o scratchpad da sessão do gatekeeper). Regressão na árvore principal (HEAD `5044e7a`, produto idêntico a `1ed0b71`); mutações de documento num worktree descartável no SHA, removido no fim. Mac arm64, Node v24.15.0.

Foco pedido: o código que as correções 4 e 5 mudaram depois da última passada da E22 (`git diff bb0f654..1ed0b71` e `4ce0433..1ed0b71` em `dc360`: guarda de códigos de erro da E05, fila pausada da E06 c3 e c3b, testes da E15, foco e frases da E09 c4, ressalva da saída a campo da E24, contagens) contra README, LEIA-ME, PENDENCIAS, `dc360/docs/` e comentários.

| Critério | Prova | Resultado |
| --- | --- | --- |
| `npm run conferir:numeros` com zero divergência | `e22-01` | 25 afirmações conferidas, "Todos os números da documentação batem", código 0 |
| `npm test` verde, com `regras-de-conteudo` (sem travessão, sem norma fora da lista) | `r-02` (código 0); `e22-04` (`permissoes-no-readme`, `regras-de-conteudo`, `ressalva-saida-a-campo`: 58 de 58) | verde |
| `npm run auditar` | `e22-05` (com rede) | código 0: runtime 0; 3 de desenvolvimento aceitas (`vitest`, `@vitest/mocker`, `tinypool`); aplicativo com as 6 exceções nomeadas, como README e LEIA-ME dizem |
| Testes negativos de grep ("DESLIGADO NESTA IMPLANTAÇÃO", "sem ida ao banco", "NUNCA RODOU EM APARELHO", "MapLibre" vigente) | `e22-06` (`git grep` no SHA) | 5 acertos, todos devidos: "404 sem ida ao banco" no console (outro sentido), registro histórico riscado em `apps/web/PENDENCIAS.md` item 3, ADR 0004 (decisão histórica) |
| Tabela de permissões do README presa por teste (FAIL da rodada 4) | `e22-03`: "levantar a interdição" tirada das duas linhas no worktree | 4 casos reprovam; restaurado, 10 de 10 |
| Leitura sob suspensão, pendências já fechadas, `ARMAZENAMENTO`, `LEIA-ME`, `DICIONARIO`, `CARTAO` (FAIL da rodada 4) | releitura dirigida dos trechos | corrigidos (tabela da correção 4 do pacote); nenhum voltou |
| Afirmações conferidas uma a uma contra código ou execução | lista abaixo | 34 conferidas à mão, mais as 25 da máquina; 3 imprecisões (Achados) |

**As 34 afirmações conferidas** (V = verdadeira, X = divergente):

1. V `README.md:11` 223 testes do shared (execução `r-02`: 223).
2. V `README.md:13` 688 do painel (`r-02`: 688).
3. V `README.md:14` 1590 da API (`r-02`: 1590 e 34 pulados por ambiente).
4. V `README.md:14` sem `openssl` no PATH a suíte de TLS reprova em vez de pular (`e22-02`: PATH só com o node, código 1, "o openssl não está no PATH").
5. V `README.md:15` 238 do motor de campo (`r-02`).
6. V `README.md:16` 1997 do aplicativo (`test:campo` com 1997 de 1997, ver relatório da E21, `e21-07`).
7. V `README.md:17` 274 do console (`r-02`).
8. V `README.md:1515` "3358 testes em seis pacotes" (238+223+1590+274+688+345; `workspaces` do `package.json` = 6).
9. V `docs/COLOCAR-DE-PE.md:41,352` 5355 com o aplicativo (3358+1997).
10. V `README.md:1128-1131` tabela de permissões gerada e presa (`e22-03`).
11. V README, tabela de códigos: 10 códigos do catálogo, na mesma ordem (lidos do `dist` do shared); 3 da entrada.
12. V Guarda: `onRequest` instalado logo depois de `Fastify()` e antes de qualquer plugin e rota (`apps/api/src/servidor.ts:385-389`, antes de `declararProxyDeBorda` e do `helmet`).
13. V Guarda: teto de 64 KiB (`guarda-de-codigos-de-erro.ts:118`).
14. V Guarda: código no log só com a forma `^[a-z_]{1,64}$` (`:121`).
15. V Guarda: "falhar" em teste e "corrigir" fora, por `NODE_ENV` (`servidor.ts:386`); genérico 401 `nao_autenticado` e 403 `sem_permissao` (`:97-98`).
16. V Guarda: chave `erro` repetida recusada (`:159`); HEAD fora (`:234`).
17. V Guarda: `test/guarda-falha-alto.ts` em toda a suíte (`setupFiles` da API e do console).
18. X Guarda: "planta como rotas as dezesseis formas que a varredura não lia" (Achado 1).
19. V Guarda: "os dezesseis escapes" (`ESCAPES_DA_REVISAO` tem 16, mais o e08 à parte).
20. X "`ressalva-saida-a-campo.test.ts` confere os cinco documentos" (Achado 2).
21. V Prova dinâmica, 17 números do README (114 pares, 112, 48, 66, 2 e os 12 perfis 10/10/10/10/93/62/61/100/47/49/96/54): regerados com `SAIDA_ALCANCE` (`e22-07-resumo-alcance.txt`), todos iguais.
22. X README, parágrafo depois da matriz de plataformas: "as correções posteriores a ele [run 39143791434] ... ainda não passaram por CI" (Achado 3).
23. V README: roteiro da linha de base com 20 passos, 18 sem instalar (`baseline.mjs --so-listar`).
24. V README: scrypt N=2^17, r=8, p=1 (`auth/senha.ts:34`).
25. V README: teto de 27 funções `SECURITY DEFINER` (`db/test/isolamento.test.ts:653`).
26. V README e api/PENDENCIAS: `ACESSO_MINUTOS` 15, teto 60 (`config.ts:356`).
27. V GUIA: prazos 72, 48, 24, 4 horas fixos (`packages/shared/src/dominio.ts:113-118`).
28. V GUIA: desinterdição com 15 caracteres (`schemas.ts:531-534`).
29. V GUIA: "Na fila" inclui em campo (`status NOT IN ('encerrada','rascunho')`, `rotas/ocorrencias.ts:67`); os seis indicadores com os rótulos de `Painel.tsx:204-210`.
30. V README e LEIA-ME: `auditar` com runtime 0 e as seis exceções do aplicativo (`e22-05`).
31. V `apps/campo/LEIA-ME.md`, cache `.expo/types`: `tsc` direto reprova com cache velho e `test:campo` limpa (execução da E21, `e21-06` e `e21-07`).
32. V `.gitattributes` e README: CRLF só para `.ps1`, `.bat`, `.cmd`.
33. V `apps/campo/PENDENCIAS.md` itens 14 e 16 contra a correção 3 e 3b da E06: nada do que dizem ficou falso (a pausa continua só na memória e é limpa quando não há nada do usuário; o título "Ela sobe com o aplicativo aberto" segue valendo quando a fila não está pausada). Omissão anotada abaixo.
34. V README e GUIA contra as frases novas da E09 c4 (senha atual errada, foco, janela no topo, e-mail que quebra): nenhum documento cita as frases antigas ("A senha atual nao confere") nem afirma o comportamento antigo.

## Evidência

Caminhos relativos a `SCRATCH/validadores/qa/e21e22/`:

- `e22-01-conferir-numeros.txt` (código 0, 25 afirmações)
- `e22-02-tls-sem-openssl.txt` (código 1, a suíte reprova sem `openssl`)
- `e22-03-permissoes-readme-mutado.txt` (código 1, 4 reprovam), `e22-04-portoes-doc-verde.txt` (58 de 58)
- `e22-05-auditar.txt` (código 0)
- `e22-06-grep-negativo.txt`
- `e22-07-prova-dinamica.txt` (código 0), `e22-07-alcance.json`, `e22-07-resumo-alcance.txt`
- `r-01-typecheck.txt`, `r-02-npm-test.txt`, `r-03-test-scripts.txt` (todos código 0; scripts 288 de 288, 0 pulados porque existe `apps/campo/ios/` nesta máquina)

## Cenários positivos

- Números da documentação conferidos pela máquina (25) e à mão contra a execução (shared, painel, API, motor, console, banco, aplicativo, somas).
- 17 números da prova dinâmica regerados e iguais ao README.
- Portões de documento verdes: permissões no README e no documento de papéis, conteúdo, ressalva da saída a campo.

## Cenários negativos

- README com uma ação a menos na tabela de permissões: o teste reprova (4 casos).
- Suíte de TLS sem `openssl` no PATH: reprova, não pula (o README diz isso).
- Grep pelas frases proibidas: zero acerto indevido.
- Autorização e isolamento: não se aplicam (só documentação); `test:isolamento` verde dentro do `npm test` (345 e 3 pulados).

## Tentativas de reprovar

1. Li o diff `4ce0433..1ed0b71` inteiro de `dc360` atrás de código novo que desmentisse texto: guarda da E05 (README e cabeçalho de `codigos-de-erro.ts` conferidos contra o código da guarda e o teste dela), fila pausada da E06 (procurei em README, CARTAO, ARMAZENAMENTO, GUIA, SEGURANCA e PENDENCIAS do campo promessa de "sai quando houver sinal" sem a ressalva da pausa, e de "a pausa só cai quando o envio dá certo"), testes da E15 (sem mudança de produto), E09 c4 (frases e foco), E24 c3b (cobertura do guarda de ressalva). Achei os três itens dos Achados.
2. Regerei a matriz da prova dinâmica para pegar número velho no README depois das mudanças de rota e de guarda: bate.
3. Contei as formas e os escapes plantados no teste da guarda contra o número que o README dá: as formas não batem (Achado 1).
4. Conferi a afirmação de cobertura do teste de ressalva contra as listas do próprio teste (Achado 2).
5. Conferi o histórico de CI que o README conta contra o registro do repositório (commit `3ce67c7` do STATUS): diverge (Achado 3).
6. Procurei a contagem "258 contra a API" contra o que o `e2e:api` roda: o roteiro roda também `layout-estreito.e2e.mjs` (53 `ok(`), que nenhuma frase conta (anotado, abaixo).

## Achados

1. **Corrige antes de crescer.** `dc360/README.md` (seção dos códigos de erro, linha 169): "`apps/api/test/guarda-de-codigos-de-erro.test.ts` planta como rotas as dezesseis formas que a varredura não lia". O teste planta 15: `FORMAS_403` tem m01 a m07 e m10 a m16 (14) mais "sem-corpo" e "texto", e a m09 é rota à parte; a m08 (escrita no socket) não é plantada, porque a guarda não a vê, como o próprio README diz dois parágrafos abaixo. O cabeçalho do teste repete a frase ("cada forma vira uma rota de verdade"). Reprodução: `grep -n "app.get(r(\"m" dc360/apps/api/test/guarda-de-codigos-de-erro.test.ts` (sem m08). Número de documento contra o código, com a ressalva escrita no mesmo texto; não engana sobre a garantia, mas é exatamente a classe que a E22 policia.
2. **Anotado.** `dc360/README.md:824-826`: "`packages/shared/test/ressalva-saida-a-campo.test.ts` confere os cinco documentos que tratam do assunto (README, privacidade, papéis e as duas apresentações)". Depois da correção 3b da E24 (`5ed4bd1`, posterior à frase de `b17949a`) o teste confere 6 arquivos por tabela (os cinco mais `docs/LEIA-ME.md`) e 4 por âncora (`SEGURANCA-DO-AGENTE`, `GUIA-DO-COORDENADOR`, `CARTAO-DO-AGENTE` e o README), linhas 78-90. O código novo desmentiu o número, na direção que subestima a cobertura.
3. **Corrige antes de crescer.** `dc360/README.md:1309-1312`: depois do run 39143791434, "as correções posteriores a ele (E03, E05, E07, E09, E10, E15, E25 e esta) ainda não passaram por CI". O STATUS registra o run 39241470718 do candidato `4ce0433` (commit `3ce67c7`: 9 de 9 verdes, com linha de base em Linux, restore em Postgres 17 e a corrida em Postgres real), que contém todas essas correções; e o texto não diz que as da correção 5 (o SHA validado) estão sem CI por H32. É histórico de processo e subestima a cobertura, mas a frase está falsa no SHA e a coluna Linux da matriz da E21 remete a ela.
4. **Anotado.** `dc360/README.md:13` e `:1678` contam "258 verificações no navegador contra a API" (as do `fluxo-api.e2e.mjs`, contagem do código); o `npm run test:e2e:api` roda também `apps/web/test/layout-estreito.e2e.mjs` (53 `ok(` hoje, `scripts/e2e-api.mjs:208`), que nenhuma frase conta. Anterior a esta rodada (o arquivo nasceu em `39051f7`, 2026-10-13); não é afirmação falsa sobre o arquivo citado, é omissão.
5. **Anotado.** `dc360/apps/campo/PENDENCIAS.md` item 14 não registra a correção 3 e 3b da E06 (nenhuma tela manda esperar sinal com a fila pausada; a pausa velha cai ao entrar de novo, por geração da credencial). Nada do que o item diz ficou falso; é omissão.

## Não verificado

- CI do SHA (ausente, H32): nenhuma afirmação dependente de run foi conferida por mim além do registro no STATUS.
- Leitura integral dos cerca de 10 mil linhas de documento: a varredura foi por amostra dirigida ao código novo das correções 4 e 5 e às afirmações numéricas e de comportamento (34 à mão e 25 pela máquina). `SUBPROCESSADORES`, `LIGAR-O-EMAIL`, `VERCEL-PAINEL`, `RESTORE-DO-BANCO`, `INDISPONIBILIDADE` e `POLITICA-DE-TESTE-VERMELHO` não foram relidos por mim nesta rodada (nenhum código da correção 5 os toca).
- O item 6.3 de `apps/web/PENDENCIAS.md` ("lista de usuários a 390 px rola na horizontal") depois do `EmailQuebravel` da E09 c4: exige o e2e contra a API com navegador, que não rodei.
- `expo-doctor` (depende da rede e do dia), e2e de navegador e aparelho.
- A validação humana da etapa: o Rafael ler a tabela antes e depois.

## Risco residual

Baixo. As afirmações de maior risco (permissões, vigência, leitura sob suspensão, números de teste, prova dinâmica, auditoria) batem com o código e com a execução no SHA, e as presas por teste mordem. Ficam três frases imprecisas (duas sobre cobertura de teste, uma sobre histórico de CI), nenhuma prometendo algo que não existe, e o limite de uma varredura por amostra num corpo de documentação grande que cada etapa volta a mexer.

## Motivo do humano

A validação humana da própria etapa: o Rafael lê a tabela antes e depois e confirma que nada ficou prometido sem existir. É juízo de produto sobre o que o documento promete, que a conferência mecânica e a amostra não substituem.
