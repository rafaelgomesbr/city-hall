---
validador: qa (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E22
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
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

Varredura refeita no SHA `bb0f654` sobre `dc360/README.md`, os quatro `PENDENCIAS.md`, `apps/campo/LEIA-ME.md` e `LOJAS.md`, os `dc360/docs/*.md`, as notas de revisão das ADR 0004 e 0008 e os comentários de vigência. Parte da leitura foi feita por três subagentes de busca (Explore, Sonnet) em paralelo, e TODO achado listado abaixo foi reconferido por mim contra o código, com arquivo e linha, e os três principais por execução. Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/qa-E03-E21-E22/` (abreviado `V/`).

| Critério | Resultado | Prova |
| --- | --- | --- |
| Objetivo: nenhum documento do produto afirma o contrário do código | **FAIL** | sete afirmações desmentidas pelo código nos documentos que a etapa e a correção 3 tocam, duas delas provadas por execução (achados 1 a 4b) |
| `npm run conferir:numeros` com zero divergência | PASS | código 0, 25 afirmações (`V/05-conferir-numeros.txt`) |
| `npm test` (portão de conteúdo) e `npm run auditar` | PASS | shared 170 de 170 com `regras-de-conteudo` 10 de 10 (`V/03-test-shared.txt`); `auditar` código 0 segundo o subagente e a correção 1; não rodei o `auditar` eu mesmo |
| Negativos da etapa: grep de "DESLIGADO NESTA IMPLANTAÇÃO", "sem ida ao banco", "NUNCA RODOU EM APARELHO", "MapLibre" vigente | PASS | `V/22-grep-negativo.txt`: sobram só registro histórico (ADR 0004:36, migrações 031 e 035, `apps/web/PENDENCIAS.md` item 3 riscado) e comentário do console sobre UUID |
| Correção 3, achado da rodada 3 (teto de `SECURITY DEFINER`) | PASS | sonda própria aplica as 50 migrações em PGlite: 27 funções `SECURITY DEFINER` (`V/22-definers.txt`); teste `toBeLessThanOrEqual(27)`; README `:943` diz 27 de 27 |
| Correção 3, achado da rodada 3 (assinatura perdida no pacote) | PASS | `saida/pacote.ts` lê `vistoria_evidencias_perdidas` (consulta `perdidas`); `SAIDA-DE-MUNICIPIO.md:95,172` e a tabela das diferenças batem com o comentário do código (três diferenças e uma deliberada) |
| Mudanças de E07 c3 refletidas (login sob a trava, `cr` no desafio, `corpo_invalido`) | PASS | README `:133`, `:267`, `:177-181` contra `auth/servico.ts:161-165,696-712`, `auth/tokens.ts:220`, `rotas/segundo-fator.ts:107,222`, `servidor.ts:640-665` |
| `expo-doctor` 21 de 21 (afirmado em README, LEIA-ME, PENDENCIAS do campo) | PASS | `npx expo-doctor` hoje: "21/21 checks passed" (`V/22-expo-doctor.txt`) |
| Referências a arquivo e rota | PASS | sonda de crases: só nomes gerados ou de pasta ignorada (`V/22-referencias.txt`); 32 rotas citadas, todas registradas (com prefixo de `servidor.ts`); tabelas e visões das migrações todas no dicionário |

## Evidência

| Comando | Código | Saída |
| --- | --- | --- |
| `node V/sondas/permissoes.mjs` (gera a tabela de `acoesDoPapel` do `dist` do shared e compara com a tabela "gerada" do README) | 0; coordenador 14 no código e 13 no README, administrador 15 e 14; falta "levantar a interdição de um imóvel" | `V/22-sonda-permissoes.txt` |
| teste-sonda num clone do SHA (cópia de `acesso-suspenso.test.ts`, caso "leitura continua até o token vencer", contando `ocorrencia_consultas` antes e depois do GET do dossiê com o município suspenso) | 1 (de propósito): `antes=0 depois=1` | `V/22-sonda-leitura-suspensa.txt`, `V/sondas/zz-sonda-leitura-suspensa.test.ts` |
| `node V/sondas/definers.mjs` | 0; 27 | `V/22-definers.txt` |
| `npx expo-doctor` em `apps/campo` | 0; 21/21 | `V/22-expo-doctor.txt` |
| `npm run conferir:numeros`, `npm run test --workspace @dc360/shared` | 0, 0 | `V/05`, `V/03` |
| `git grep` das frases negativas | (lista) | `V/22-grep-negativo.txt` |
| sonda de referências entre crases | (lista) | `V/22-referencias.txt`, `V/sondas/refs.py` |
| `ls dc360/apps/package.json` (para o comando de `LOJAS.md:274`) | 1, não existe | (reproduzido no terminal) |

## Cenários positivos

- Os números da documentação batem com a máquina (25 afirmações), o teto 27 bate com o catálogo, o `expo-doctor` bate com o dia, e as três frentes que mudaram desde a rodada 3 (E07 c3, E12 c3, E25 c1) estão descritas como o código faz, nos pontos que conferi.
- Rotas, arquivos, tabelas e variáveis citados existem.

## Cenários negativos

- A tabela de permissões do README, que se declara "gerada" e "presa por teste", foi regerada por mim a partir do código: diverge em dois papéis (achado 1).
- A afirmação de que a leitura sob suspensão "não cria registro nenhum" foi posta à prova com um teste: o dossiê grava uma linha (achado 2).
- O comando de `LOJAS.md` foi resolvido contra a árvore: aponta para um `package.json` que não existe (achado 5).

## Tentativas de reprovar

1. Regerar a tabela "gerada" de permissões e comparar: reprovou.
2. Procurar o teste que o README diz prender a tabela (`git grep` por `permissoes: gerado`, `README` e `acoesDoPapel` nos testes e scripts): não existe; o marcador só aparece no README.
3. Pôr à prova as frases de suspensão de `SAIDA-DE-MUNICIPIO.md` com o código de `registrarConsulta`: reprovou, por execução.
4. Ler os `PENDENCIAS.md` atrás de pendência que o código já fechou: achei duas (achados 3 e 4).
5. Conferir o teto 27, o `expo-doctor`, os números, as rotas e as referências: bateram.
6. Procurar a frase velha "quinze de quinze" fora das migrações: só nas migrações 031 e 035 (registro histórico).

## Achados

1. **FAIL.** `dc360/README.md:976-988`: "Esta tabela é gerada a partir de `acoesDoPapel`, e um teste reprova se ela divergir do código", e a tabela de Coordenador e Administrador não tem "levantar a interdição de um imóvel", que `packages/shared/src/permissoes.ts:28,49,106,123` concede aos dois desde `1a2eda5` (2026-08-28). Nenhum teste lê a tabela (o marcador `<!-- permissoes: gerado ... -->` só existe no README). Documento afirma o contrário do código duas vezes: na tabela e na garantia de teste. Reprodução: `node V/sondas/permissoes.mjs`.
2. **FAIL.** `dc360/docs/SAIDA-DE-MUNICIPIO.md:204-209`: com o município suspenso, "quinze minutos de leitura não criam registro nenhum". O código grava: `GET /ocorrencias/:id` (`rotas/ocorrencias.ts:599`) e a busca (`rotas/busca.ts:229`) chamam `registrarConsulta`, que faz `INSERT INTO ocorrencia_consultas` (`privacidade/consulta.ts:116`), e essas rotas não levam `ROTA_GET_COM_EFEITO`, então passam sob suspensão. O próprio comentário de `auth/suspensao.ts:63-67` (corrigido na correção 2 desta etapa) já diz isso; o documento ficou com a frase antiga, e a correção 3 lista o capítulo de `SAIDA` como "conferido, sem mudança". Reprodução: teste-sonda acima, `antes=0 depois=1`. A mesma frase está no comentário de `apps/api/test/acesso-suspenso.test.ts:369-370`.
3. **FAIL.** `dc360/apps/web/PENDENCIAS.md:36`, `:270-271` e `:361-362` mantêm como pendente, com destino F03-E02, "a janela de milissegundos da renovação". O código a fechou: a renovação é uma transação sob `travar_sessoes_do_usuario` (`apps/api/src/auth/servico.ts:855-867`, migração 049), e o comentário diz que a "janela na renovação" deixou de existir. O item 7 da etapa manda refazer este arquivo "com o que realmente resta".
4. **FAIL.** `dc360/apps/campo/PENDENCIAS.md:56-77` (item 2): "a vistoria deveria poder subir SEM o arquivo perdido ... Isso exige um campo no envelope", como pendência. Existe: `evidenciasPerdidas` no envelope (`packages/shared/src/schemas.ts:406`), `abrirMaoDasEvidenciasPerdidas` (`packages/campo/src/fila.ts:1234`), gravação em `vistoria_evidencias_perdidas` e a seção do laudo (`apps/api/src/documentos/laudo.ts:591`, citada como existente em `apps/api/PENDENCIAS.md:338-339`).
4b. **FAIL (mesma classe, em `dc360/docs/`, arquivos que a correção 3 diz ter lido e corrigido).** (a) `docs/ARMAZENAMENTO.md:296-297`: "Não existe tela. O número sai por rota e por comando, e nenhuma página do painel o mostra ainda"; o painel mostra: `apps/web/src/paginas/Organizacao.tsx:129,168-182` (`CartaoDeArmazenamento`, cartão "Uso de armazenamento", lê `GET /armazenamento/uso`). (b) `docs/LEIA-ME.md:38` e `docs/DICIONARIO-DE-DADOS.md:4`: o dicionário "vai junto com a exportação de saída"; `apps/api/src/saida/pacote.ts` não o emite (zero ocorrência de "dicionario" em `src/saida`), e o próprio `SAIDA-DE-MUNICIPIO.md:100` diz que "ainda não vai dentro do pacote". (c) `docs/CARTAO-DO-AGENTE.md:83`: "A tarefa sumiu da lista: o aplicativo explica o motivo (concluída, cancelada, devolvida, mudou de equipe)"; nenhum arquivo de `apps/campo/src` fora de teste lê `desfecho` nem `motivo` da reconciliação (`git grep` vazio), e o servidor não tem desfecho "cancelada" (`rotas/sincronizacao.ts:1486-1503`); mesma promessa em `docs/IMPLANTACAO.md:79`. Outras, de menor peso, achadas pelo subagente e conferidas por amostra: `DICIONARIO-DE-DADOS.md:22` ("as chaves estrangeiras usam `ON DELETE RESTRICT`", há CASCADE e SET NULL desde a 001), `PRIVACIDADE.md:386-390` (diz que a lista ainda devolve o contato; `privacidade/lista.ts` já o tira), `COLOCAR-DE-PE.md:691` ("a única rota de escrita sem autenticação": `POST /auth/recuperar` também grava), `GUIA-DO-COORDENADOR.md:35-38` (indicadores "Aguardando triagem" e "Providência pendente" que o `Painel.tsx` não tem).
5. **Corrige antes de crescer.** `dc360/apps/campo/LOJAS.md:274`: `npm run auditar --prefix ..` dentro de um bloco que começa em `cd dc360/apps/campo` aponta para `dc360/apps/`, que não tem `package.json` (o certo é `--prefix ../..`). Entrou na correção 2 desta etapa.
6. **Corrige antes de crescer.** `dc360/README.md:796-799` descreve como viva a pendência de contraste da borda de controle do aplicativo ("aparece na saída da execução"), e `scripts/portao-acessibilidade-do-aplicativo.test.mjs:164` tem `PENDENTES = new Map([])`. `README.md:1412-1413` diz que o job que confere os números "nem instala as dependências" do aplicativo, e o job `produto` instala (`.github/workflows/verificar.yml:104-107`). `README.md:1383` fala em "cinco workspaces" (são seis, `dc360/package.json:6-12`). `README.md:1115` diz "CRLF só para `.ps1`" (`.gitattributes` também põe `.bat` e `.cmd`).
7. **Corrige antes de crescer.** `dc360/apps/campo/LEIA-ME.md:28`: "Não há nenhum registro de execução no simulador de iOS". O relatório de QA da E06 na rodada 3 (`docs/evidencias-v2/G00/V2-F00-E06/validacao/52952a1/qa.md:92`, commitado) registra build Debug e o aplicativo aberto no Simulador (iPhone 17 Pro, iOS 26.5), e o da E15 (`.../V2-F00-E15/validacao/52952a1/qa.md:41`) também. É a mesma classe do achado 3 da rodada 3, corrigido só para o Android. O LEIA-ME também não cita a captura de emulador da E15 (`.../V2-F00-E15/validacao/4b96ea7/anexos/E15-dialogo-sair-da-conta.png`).
8. **Anotado.** `apps/campo/PENDENCIAS.md` itens 10 e 12 (cascata "sem uso ainda"; o sino sincroniza "quando a aba Perfil é aberta") descrevem o código de antes (`atrasoEmCascata` usado em quatro telas; `sincronizarAvisos` só em `avisos.tsx:231`). Comentários `apps/api/src/armazenamento/s3.ts:374` e `apps/web/src/busca/pontuador.ts:5` dizem que o `npm audit` do produto "fecha em zero" (o puro do aplicativo não fecha, como o próprio README diz). `README.md:129` cita "ASVS 4.0 (2.4.3)" para o scrypt; no ASVS 4.0.3 o 2.4.3 trata de PBKDF2 (confiança média, texto anterior à V2, `fde3f80`). `README.md:1159` ("com a árvore de hoje ainda não houve run de CI") envelhece por construção.

## Não verificado

- O run do CI (Linux, Postgres 17) e a leitura humana da tabela antes e depois (validação humana da etapa).
- `npm run auditar` e `npm audit` não rodados por mim (só pelo subagente, que relata código 0 no `auditar`).
- `dc360/docs/*.md` foram lidos por um subagente; conferi pessoalmente as três divergências do achado 4b (a, b, c) e as de menor peso só por amostra. RESTORE-DO-BANCO, INDISPONIBILIDADE e SUBPROCESSADORES não tiveram afirmação divergente reportada, e eu não os li por inteiro.
- Medições datadas de máquina (Windows, macOS de 2026-10-14) não são verificáveis pelo código e foram tratadas como históricas.

## Risco residual

- A tabela de permissões é o tipo de documento que a própria etapa diz ter "mentido antes"; sem o teste que o README promete, ela volta a divergir na próxima ação nova.
- A varredura por leitura não é exaustiva: o README tem cerca de 1750 linhas e os `PENDENCIAS.md` acumulam história; outras afirmações velhas podem sobrar.

## Motivo do humano

A validação humana da etapa (Rafael lê a tabela antes e depois e confirma que nada ficou prometido sem existir) continua pendente; e é decisão de produto se a leitura sob suspensão deve mesmo gravar `ocorrencia_consultas` (o código diz que sim, o documento que não).
