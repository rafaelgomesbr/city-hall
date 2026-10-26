---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E22
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [DB, API, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: nenhum
---
Veredito: FAIL. A rodada 1 reprovou porque a documentação dizia o contrário do código. A correção consertou os itens que o relatório antigo apontou (lista das leituras que escrevem em `vigencia.ts`, `PENDENCIAS.md` e `README.md:130`; os restos do `npm audit`; `SAIDA-DE-MUNICIPIO.md`), mas a varredura completa achou seis afirmações verificáveis que o código ou a execução desmentem. Duas delas são sobre segurança e sobre o papel emitido, exatamente a classe que a etapa declara como risco. Cinco os outros validadores já tinham apontado e eu confirmei por execução; a da assinatura no laudo do pacote e a do `LOJAS.md` eu achei.

Saídas e temporários em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/qa-painel/` (abaixo, `qa-painel/`). API minha na porta 3991 (banco em memória). Nada foi commitado e a árvore ficou limpa.

## Critérios verificados

Cada afirmação verificável foi conferida no código ou por execução. Método: li README, os quatro `PENDENCIAS.md`, ADR 0008, `SAIDA-DE-MUNICIPIO.md`, `LEIA-ME` do campo, `COLOCAR-DE-PE.md`, `RESTORE-DO-BANCO.md`, `LOJAS.md` e os comentários de vigência; extraí número, "existe", "não existe", "só X escapa", e conferi.

### O que está certo (PASS, com como conferi)

| Afirmação | Onde | Conferência |
| --- | --- | --- |
| Rotas GET com efeito passam pela vigência: laudo, termos, PDFs, CSV e `GET /avisos` | `vigencia.ts:53-62`, `PENDENCIAS.md` da API (linhas 80 a 100), `README.md:130` | `servidor.ts:112` (`ROTA_GET_COM_EFEITO`) e `servidor.ts:516`. Executei: Rita desativa Helena; o token antigo dá 403 em `GET /avisos`, em `HEAD /avisos` e em `GET /relatorios/ocorrencias.csv`, e 200 em `GET /ocorrencias` (leitura pura, a janela declarada) (`qa-painel/e22-vigencia.txt`) |
| `npm run conferir:numeros`: 24 afirmações, 0 divergência | README e `COLOCAR-DE-PE.md` | `baseline/11-conferir-numeros.txt`; só confere contagem de teste e de verificação |
| `npm audit` raiz em zero em execução; `npm run auditar` sai 0 | `README.md:218-220`, `LEIA-ME` do campo | `baseline/12-auditar.txt` (runtime 0, 3 de ferramenta aceitas com dono e prazo), `baseline/13-audit-raiz.txt` (3 de desenvolvimento, que o texto diz) |
| `expo-doctor` 21 de 21 | `README.md:16`, `apps/campo/LEIA-ME.md:23` e `:148`, `PENDENCIAS.md` do campo item 17 | Executei `npx expo-doctor` no `apps/campo`: "21/21 checks passed", código 0 (`qa-painel/expo-doctor.txt`; `baseline/15-expo-doctor.txt` igual) |
| 223 testes do motor de campo | `LEIA-ME` do campo (linhas 25, 98, 115) | `npm test --workspace @dc360/campo`: 223 de 223 |
| ADR 0008, nota de revisão | `docs/adr/0008-...md` | 45 linhas acrescentadas e nenhuma apagada (`git diff afde25c..4b96ea7 --numstat`); `fly.console.toml` existe; `CONSOLE_DATABASE_URL` em `apps/console/src/config.ts:100`; rotas `/municipios/:id/suspender` e `eliminar` em `apps/console/src/servidor.ts`; sete dias em `038...sql:714`; as quatro funções `console_*` na 038 |
| `SAIDA-DE-MUNICIPIO.md`, capítulo 2 contra o 5 | linhas 49 a 63 | `038...sql:712` (`PERFORM console_suspender_municipio` dentro de `console_agendar_eliminacao`) e o 403 `acesso_suspenso` da rota (`apps/api/PENDENCIAS.md`, item 2 do fim) concordam com o texto |
| `db/PENDENCIAS.md` | todo | `agendarResumo` ligado em `apps/api/src/index.ts`, `apps/console` existe, `docs/PRIVACIDADE.md` realmente não cita `metricas_municipio`, teto `<= 27` em `db/test/isolamento.test.ts:625` |
| `apps/web/PENDENCIAS.md` itens 1 a 5 | rotas e símbolos | existem: `corrigirCoordenada`, `coordenadaGravadaSchema`, `resolver-link`, `/configuracao`, `saida/pacote.zip` |
| Portão de conteúdo: sem travessão, sem norma inventada | todos os `.md` tocados | `npm run test --workspace @dc360/shared`: `regras-de-conteudo` 8 de 8, 168 de 168 (`qa-painel/shared-test.txt`); `grep` por travessão nos seis documentos principais: zero |
| `docs/COLOCAR-DE-PE.md` e README: contagens | 4828, 2925 etc. | cobertas pelo `conferir:numeros` (24 conferidas) |

## Evidência

`qa-painel/e22-vigencia.txt`, `e22-assinatura.txt`, `e22-assinatura-zip.txt`, `expo-doctor.txt`, `shared-test.txt`; `baseline/11` a `15` e `baseline/RESUMO.md` (17 de 17 conferem, 0 divergente, 0 divergente explicada); CI 38445527075 (job "Restore do banco, Postgres 17 (CA-08)" success); leitura dos arquivos com número de linha.

## Cenários positivos

As afirmações da tabela acima.

## Cenários negativos

Uma pergunta por afirmação de segurança: o que o código faz quando o documento diz "só", "nenhum", "sem efeito" ou "não provado". Foram seis respostas contra o texto (achados abaixo).

## Tentativas de reprovar

1. Procurei, para cada "só X escapa" e "nenhum registro", o caminho que o texto esquece. Achei `GET /avisos` documentado como "segue aceitando o token" quando ele leva a marca desde a correção 1 da E04 (execução: 403).
2. Procurei, para cada "diferença de mecanismo, sem efeito no papel", o efeito no papel. Montei uma vistoria com a assinatura declarada e os bytes nunca enviados e comparei os dois laudos (achado 2).
3. Procurei contagem e estado desatualizados entre documentos que falam do mesmo fato: `expo-doctor` (README:16 contra README:1613 e 1172), emulador e aparelho (LEIA-ME do campo, COLOCAR-DE-PE, LOJAS, README), Postgres 17 (RESTORE contra o job do CI).
4. Conferi se a ADR foi reescrita em vez de revisada: não foi (45 acréscimos, 0 remoções).
5. Procurei restos das frases que o item 4 do bloco manda zerar (`DESLIGADO NESTA IMPLANTAÇÃO`, `sem ida ao banco`, `MapLibre` como mapa vigente): zero acertos indevidos. `NUNCA RODOU EM APARELHO` literal não existe, mas `LOJAS.md:290` diz o mesmo com outras palavras (achado 6).
6. Procurei se o `conferir:numeros` cobre a afirmação que falhou: não cobre nenhuma das seis (ele só conta teste e verificação).

## Achados

Primeiro balde, BLOQUEIA (6 itens). Dono: E22 em todos, salvo onde diz outro.

1. **`apps/api/src/auth/suspensao.ts:48-53` (comentário) afirma o contrário do código.** Diz que quinze minutos de leitura "não produzem registro nenhum, com UMA exceção conhecida: `GET /avisos` escreve ... e segue aceitando esse token". Reprodução: `qa-painel/e22-vigencia.mjs`; esperado pelo texto: 200; obtido: 403 em `GET /avisos` e `HEAD /avisos` com o token de conta desativada, e também no CSV. Duas frases falsas: `GET /avisos` NÃO segue aceitando o token (leva `ROTA_GET_COM_EFEITO`), e não são "nenhum registro" (`registrarConsulta` do dossiê e da busca grava, como `servidor.ts:96-104` diz). A linha 36 ("qualquer método que não seja GET ou HEAD") também ficou curta: a escrita inclui as rotas GET marcadas. É o mesmo tipo de defeito que reprovou a rodada 1, agora no segundo comentário de vigência que a etapa mandava conferir (o primeiro, `vigencia.ts`, foi consertado).
2. **`apps/api/PENDENCIAS.md:265` (e a frase correspondente do laudo do pacote) diz "Assinatura ... diferença de mecanismo, sem efeito no papel". Tem efeito no papel.** Reprodução (`qa-painel/e22-assinatura.mjs`, saída `e22-assinatura.txt` e `e22-assinatura-zip.txt`): coordenadora abre ocorrência, tria e despacha; agente da equipe sincroniza a vistoria com `assinaturaChave: "assinatura-nunca-enviada.png"` sem enviar o arquivo. Laudo da rota `GET /documentos/:id/laudo`: nenhuma tag `<img>` (a rota confere no armazenamento e omite). Laudo dentro de `POST /saida/pacote.zip`: `<img class="traco" src="../../evidencias/000479-2026/assinatura-nunca-enviada.png" alt="Assinatura de Maria QA">`, apontando para arquivo que NÃO está no ZIP (`saida/pacote.ts:699-701` monta o endereço só pela chave, sem conferir a existência; a falta só vai para `PENDENCIAS-DA-EXTRACAO.txt`). O papel que o município leva embora traz um retângulo de imagem quebrado onde a rota imprime "assinatura não colhida", e o comentário de `rotas/documentos.ts:290-293` diz que isso "é pior que assinatura nenhuma: parece documento adulterado". A tabela dos montadores precisa trocar a última linha por "diferença com efeito no papel: imagem quebrada quando o objeto falta", e o teste "campo por campo" de `saida-de-municipio.test.ts` ganhar o caso.
3. **`README.md:1613` diz que o aplicativo "passa no `expo-doctor` menos uma verificação, a de versões de pacote".** Falso e contraditório com o próprio README (linha 16: "21 de 21"). Executei: 21 de 21, código 0 (`qa-painel/expo-doctor.txt`). O CI pula a checagem de versão (`EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK`), então a frase vale menos ainda.
4. **`README.md:1172-1173` e `docs/evidencias-v2/G00/V2-F00-E01/COMO-REPRODUZIR.md:65-67` prometem código de saída 1 por V-DEP-4.** O README diz "Hoje a única divergência explicada é o `expo-doctor` (V-DEP-4)"; o roteiro diz "uma árvore verde e rede disponível dão código 1, por V-DEP-4 e só por ela". V-DEP-4 fechou em 2026-10-13 (`classificacao-dos-vermelhos.md`, linha 260) e o próprio `scripts/baseline.mjs:28` diz "nenhuma: a última foi o expo-doctor (V-DEP-4), fechada". A linha de base do gatekeeper no SHA conferiu 17 de 17, 0 divergente explicada (`baseline/RESUMO.md`). Quem seguir o roteiro com a árvore verde espera um 1 que não vem.
5. **`docs/RESTORE-DO-BANCO.md:47-48` e `:50` dizem que Postgres 17 e Linux não foram provados, e o título e as linhas 19, 25, 32, 120 e 279 falam em 47 migrações.** O CI prova os dois: o job "Restore do banco, Postgres 17 (CA-08)" roda o roteiro em Linux com dois servidores Postgres 17 e passou no run 38445527075 (`gh run view` do run, 9 de 9). O texto "o CI usa 16" vale só para o job `implantavel`. Existem 48 migrações (`db/migrations/`, última `048_dono_do_token_diz_se_a_conta_esta_ativa.sql`); a nota das linhas 21 e 22 reconhece a 048, mas o título e a conta de linhas seguem em 47. Dono: E25 e E22 (a etapa manda varrer `COLOCAR-DE-PE.md` e a documentação de restore pertence à mesma família).
6. **`apps/campo/LOJAS.md:290-291` diz "O aplicativo nunca rodou ... nenhuma tela foi aberta em aparelho nenhum" e "Câmera, GPS e assinatura nunca foram exercitados".** `docs/COLOCAR-DE-PE.md:47-49` diz que o app "foi verificado inteiro no emulador Android: menu, minuta, login, GPS, câmera, o ciclo completo"; o README (linha 16) diz que há relato de compilação nativa e de três vistorias coletadas em iPhone em 08/09/2026. O item 6 da etapa era exatamente tirar a contradição entre os documentos sobre o que rodou onde (BZ-N:N.7) e só o `LEIA-ME` foi tratado. O `LOJAS.md` é o documento que vira texto de loja.

Segundo balde, CORRIGE ANTES DE CRESCER:

7. `apps/api/src/rotas/avisos.ts:195` ainda diz "O produto tem doze dessas e um portão que reprova a décima terceira" (funções `SECURITY DEFINER`); o teto hoje é 27 (`db/test/isolamento.test.ts:625`, `db/PENDENCIAS.md`).
8. `docs/COLOCAR-DE-PE.md:40-42` diz que "nem todos estão verdes e o `npm audit` não está em zero" durante a F00; hoje todos estão verdes (baseline 17 de 17) e `auditar` sai 0. Erra para menos, mas é prosa sobre estado que ninguém confere.
9. `apps/campo/LEIA-ME.md:16` diz "Não há emulador nesta máquina"; há o AVD `Medium_Phone_API_36.1` (`emulator -list-avds`).
10. `apps/web/PENDENCIAS.md:37` (tabela do topo, item 10.1) ainda diz "nenhum run do CI conferido"; o texto do item 10.1, mais abaixo, já diz que o gatekeeper leu o run e só falta a conferência humana.
11. O `conferir:numeros` só confere contagem de teste e de verificação. Nenhum dos seis achados do primeiro balde é número de teste; por isso o portão verde convive com eles. Vale uma conferência mecânica para o resultado do `expo-doctor`, o número de migrações e a lista de rotas GET com efeito.

Terceiro balde, ANOTADO:

12. Os `.d.ts` em `apps/api/dist/auth/` (ignorados pelo git) guardam o comentário antigo; somem no próximo `build`.
13. A seção "A vigência..." de `apps/api/PENDENCIAS.md` e o README descrevem corretamente a lista, que `test/get-com-efeito.test.ts` fixa; só `suspensao.ts` ficou para trás.

## Não verificado

- A leitura da tabela antes e depois pelo Rafael (validação humana da etapa).
- Cada número de linha das migrações e a contagem exata de funções `SECURITY DEFINER` (confiei no teto do teste de banco e na contagem do `RESTORE`).
- `docs/auditoria-v2/*` (fora do escopo) e o plano `03-fase-00-estabilizacao.md`, que ainda repete o texto antigo sobre `GET /avisos` (o implementador registrou).
- Documentos fora da lista da etapa que tratam de iPhone e emulador (`docs/DECLARACAO-NAS-LOJAS.md`, `INDISPONIBILIDADE.md`) só por amostra.
- Mutação: não se aplica a documentação; os testes de regressão a escrever estão no item 2 (caso novo em `saida-de-municipio.test.ts`) e no item 11. Os scripts `qa-painel/e22-assinatura.mjs` e `e22-vigencia.mjs` reproduzem os dois defeitos de execução e podem virar teste.

## Risco residual

Quem ler `suspensao.ts` ou `PENDENCIAS.md` da API planeja a F03-E03 com a lista errada do que escreve sem vigência e com a ideia de que os dois laudos só diferem por mecanismo. Município que levar o pacote embora e imprimir o laudo de uma vistoria cuja assinatura se perdeu leva um documento com imagem quebrada.

## Motivo do humano

A etapa pede que Rafael leia a tabela antes e depois e confirme que nada ficou prometido sem existir; essa leitura segue pendente e depende das seis correções.
