# 01-baseline: Baseline atual, revalidação dos itens 1 a 13 e mapa de testes

Auditoria Baseline Zero da V2, frente BAS. Escopo: seções 3, 4 e 25. Somente leitura: nenhum arquivo versionado foi alterado (conferido com `git status` no fim: só resta o `docs/AUDITORIA-2026-09-30.md` já não rastreado). Efeito colateral de rodar os gates: os diretórios `dist/` (todos ignorados pelo git) de shared, db, packages/campo e apps/web foram reconstruídos; `apps/web/dist` ficou com o build apontado para a API do e2e (porta 3691).

Saídas brutas: `C:\Users\Rfasg\AppData\Local\Temp\claude\c--Projetos-city-hall\2efdae76-a927-4d87-ad22-11b077ee6191\scratchpad\v2\raw\` (nomes citados entre crases em cada linha). Convenção: "categoria A/B/C" nos testes vermelhos é a da auditoria de 30/09 (A gap funcional real, B defeito pequeno, C fragilidade do portão ou do ambiente); "classe A a G" na matriz é a do preâmbulo.

## Resumo

- Nenhum commit novo desde 17/09/2026 (HEAD e82719e, branch master). Tudo o que a auditoria de 30/09 mediu continua igual: os números de hoje coincidem, caso a caso, com os dela (comparação, não fonte).
- O baseline NÃO está verde. Falham hoje: 1 teste do shared, 14 do web (5 arquivos), 2 da API mais 1 suíte (banco-tls), 20 do app de campo (5 suítes), 3 de `test:scripts`, `conferir:numeros` (13 afirmações do README/docs desatualizadas), `auditar` (reprova runtime e ainda quebra no Windows), e os 3 e2e de navegador. `npm run verificar` não fecha em nenhum passo depois do typecheck.
- Achado mais grave que a auditoria anterior subdimensionou: `apps/api/src/auth/vigencia.ts` está DESLIGADO em `servidor.ts` desde o commit b4439ac ("ultimo commit", 17/09). Conta desativada, papel rebaixado e sessão encerrada por quem administra continuam escrevendo por até 15 minutos; a falha da senha provisória (item 4) é só um sintoma. O comentário de `auth/sessoes.ts:23` afirma o contrário do código.
- Os vermelhos de item 6 NÃO giram todos em torno de "sessão encerrada": são 4 causas distintas (2 testes com texto velho, 4 com mock velho, 6 e 8 testes escritos primeiro cuja correção nunca entrou no código, incluindo um aviso de saída que não avisa que sair apaga a vistoria começada).
- A causa de `banco-tls` NÃO é openssl fora do PATH: é a variável de ambiente `OPENSSL_CONF` apontando para arquivo inexistente (provado: 13/13 passam sem ela). A hipótese do CRLF está provada para `ocorrencia-encerramento.test.ts`.
- `npm audit` não fecha em zero: raiz 3 moderadas (1 de runtime, fast-uri, correção sem --force); campo 4 (1 alta, 3 moderadas). CI não consultável (repo privado): NÃO CONFIRMADO.
- Bug real achado pelo e2e local: entrar a partir de `/` leva a "Esta página não existe". E2E da API: PUT de evidência do navegador reprovado no preflight por `if-none-match` fora de `allowedHeaders`.
- Padrão de processo: o commit 5ecdf4c (15/09 23:28) tem 275 arquivos, 24.453 inserções, e traz testes escritos antes das correções que nunca chegaram (web 11, API 1, campo 14 testes).

---

## 3. Baseline atual

### 3.1 Estado do git (comandos rodados nesta sessão)

| Item | Valor |
| --- | --- |
| Branch | master |
| Último commit | e82719e, 2026-09-17 16:57 -0300, "Tema serio e neutro na apresentacao, em vez do visual colorido de produto" |
| `git status --short` | `?? docs/AUDITORIA-2026-09-30.md` (único item; árvore limpa) |
| Commits depois de 30/09/2026 | Nenhum (`git log --since=2026-09-18` vazio; último commit é de 17/09). Diff desde a auditoria: zero arquivos rastreados |
| Total de commits | 119 |
| `core.autocrlf` | true (sem `.gitattributes` no repositório). Índice em LF, árvore de trabalho em CRLF (`git ls-files --eol`: `i/lf w/crlf`) |
| Remoto | github.com/rafaelgomesbr/city-hall (privado: API pública responde 404; `gh` sem login) |
| Node / npm | v22.17.0 / 10.9.2 |

Commits do dia 17/09 depois da "implementação" gigante (5ecdf4c, 15/09 23:28): b4439ac 15:05 "ultimo commit"; b387ee3 15:32 ícone DC no Edge (SVG); 2cd1266 15:36 apresentação não técnica; b793e82 15:36 tela de Organização (retenção e saída de município); 124be71 16:00 três cartões de leitura; f013d2f 16:32; 2beb998 16:38; 7a115b2 16:46; e82719e 16:57. O b4439ac é o que desliga a vigência (item 4) e o b387ee3 é quem escreveu o `borderRadius: "8px"` que reprova o portão de design (item 10).

### 3.2 Estrutura

- Raiz do repositório (`C:\Projetos\city-hall`): `dc360/` (produto), `mockup/` (protótipo, fora de escopo), `docs/`, `scripts/` (4 arquivos do pacote de demonstração: `empacotar-demo.ps1`, `conferir-pacote.mjs`, `conferir-roteiro.mjs`, `conferir-demo.ps1`), `relatorio/`, `dist/`.
- `dc360/package.json` (`workspaces`): `packages/*` (shared, campo), `apps/api`, `apps/console`, `apps/web`, `db`. `apps/campo` (Expo) fica FORA dos workspaces, com `package-lock.json` próprio.
- Aplicações: 4 (`apps/api` Fastify; `apps/web` React/Vite; `apps/console` fornecedor; `apps/campo` React Native/Expo SDK 57, pacote `@dc360/campo-app`). Packages: 2 (`@dc360/shared`, `@dc360/campo` = motor offline). Mais `db/` (migrations, aplicador, provedores, seeds).
- Migrations: 46 arquivos (`db/migrations/001_base.sql` a `046_senha_provisoria_e_o_dono_do_token_diz_por_que.sql`). Última: 046.
- Arquivos de teste (contados no disco): api 86, web 36 (mais 2 e2e `.mjs`), campo jest 121 (37 em `src/ui`, 34 em `src/__tests__`, 30 em `src/dados`, 12 em `src/push`, 8 em `src/ui/mapa`), console 16, shared 14 (12 em `test/` e 2 em `src/`), db 11, packages/campo 8, scripts 18 (`*.test.mjs`).
- Não existe: lint (nenhum `eslint` nos dois lockfiles, nenhum script `lint`, nenhum `.eslintrc`/`eslint.config`, embora haja comentários `eslint-disable` em `apps/campo/src/app/(agente)/*.tsx`), formatador, `.editorconfig`, `.gitattributes`.
- Não existe superfície 4 (portal das secretarias) nem 5 (app do cidadão) como código (fora do meu escopo provar; outros auditores).

### 3.3 Pipelines e scripts de validação

`dc360/package.json` (raiz): `typecheck` (= `build:shared` + typecheck em todos os workspaces), `test` (= `build:shared` + `npm run test --workspaces --if-present`), `test:isolamento` (= `test` do workspace db, a mesma suíte do db), `test:api`, `test:console`, `test:e2e` (web, modo local), `test:e2e:api` (`scripts/e2e-api.mjs`), `test:campo` (`scripts/testar-campo.mjs`: compila shared e campo, typecheck do app, jest, cruza contagem), `test:scripts` (`node --test scripts/*.test.mjs`), `conferir:numeros`, `auditar`, e `verificar` = `typecheck && test && test:scripts && test:campo && auditar && conferir:numeros`.

Workspaces: api (`test`=vitest run, `typecheck`, `build`), web (`test`, `test:e2e`, `test:e2e:api`, `build`=`tsc -b && vite build`), console, shared, packages/campo, db (`migrar`), campo-app (`test`=jest, `typecheck`, scripts de EAS).

CI: um único arquivo, `.github/workflows/verificar.yml`, com 5 jobs: `produto` (npm ci, typecheck, `test:isolamento`, `npm test`, `npm audit --audit-level=low`, `conferir:numeros`), `navegador` (build, preview, e2e local em Chromium e Firefox, `test:e2e:api`), `demonstracao` (pacote zip, conferir, roteiro), `aplicativo` (typecheck, `npm test` do app, `npm ls`, `expo-doctor` com `EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1`, `npm audit --audit-level=low`), `implantavel` (Postgres 16 real: migrar, migrar de novo com `--conferir`, API sobe com papel restrito e `/saude`). NÃO entram no CI: `test:scripts`, `test:campo` (o job usa `npm test` direto), `auditar`. Status real do CI: NÃO CONFIRMADO (repo privado, sem `gh auth`).

### 3.4 Execução (comando | workspace | duração | resultado | raw)

Todas as rodadas na máquina do Rafael (Windows 11, Git Bash, 16 CPUs), sequenciais salvo indicação. Durações são de relógio.

| Comando | Workspace | Duração | Resultado | Raw |
| --- | --- | --- | --- | --- |
| `npm run typecheck` | dc360 (shared, db, campo pkg, api, console, web) | 46 s | PASSOU (exit 0) | `typecheck-raiz.txt` |
| `npx vitest run` | db | 72 s | PASSOU: 11 arquivos, 318 testes (315 passaram, 3 pulados por `it.runIf` em `busca.test.ts:364,377,386`, por desenho). Inclui `isolamento.test.ts` 137 casos (63,8 s) e `migrar.test.ts` 17 | `teste-db.txt` |
| `npx vitest run` | packages/shared | 12 s | FALHOU: 14 arquivos, 149 testes, 1 falha (`regras-de-conteudo`, travessão) | `teste-shared.txt` |
| `npx vitest run` | packages/campo | 7 s | PASSOU: 8 arquivos, 159 testes | `teste-packages-campo.txt` |
| `npx vitest run` | apps/console | 155 s | PASSOU: 16 arquivos, 259 testes | `teste-console.txt` |
| `npx vitest run` | apps/web | 16 s | FALHOU: 36 arquivos, 550 testes, 14 falhas em 5 arquivos | `teste-web.txt` |
| `npx vitest run` | apps/api | 206 s | FALHOU: 86 arquivos, 1109 testes: 1089 passaram, 2 falharam, 18 pulados (13 de `banco-tls`, suíte caída no `beforeAll`, e 5 de `describe.skip` em `vigencia-na-escrita.test.ts:102`), mais 1 suíte com falha (`banco-tls`) | `teste-api.txt` |
| `npm run typecheck` | apps/campo | 26 s | FALHOU: 2 erros TS2345 (`perfil.tsx(1212,44)` e `Sino.tsx(154,73)`, rota `/(agente)/avisos`) | `typecheck-campo.txt` |
| `tsc` com `tsconfig` de escopo (scratch) sem `.expo/types` | apps/campo | 21 s | PASSOU (0 erros): prova que os 2 erros vêm só do cache local `.expo/types/router.d.ts` | `typecheck-campo-sem-cache-expo.txt` |
| `npm run test:campo` | dc360 | 22 s | FALHOU no passo de typecheck do app (mesmos 2 erros), antes do jest | `test-campo-script.txt` |
| `npx jest --silent` (direto, contornando o script) | apps/campo | 74 s | FALHOU: 121 suítes (116 ok, 5 falharam), 1801 testes (1781 ok, 20 falharam) | `teste-campo-jest.txt` |
| `npm audit` / `--omit=dev` | dc360 raiz | 4 s / 5 s | FALHOU: 3 moderadas / 1 moderada (runtime) | `audit-raiz.txt`, `audit-raiz.json`, `audit-raiz-omit-dev.txt`, `audit-raiz-omit-dev.json`, `audit-raiz-json.txt` (saída do 1o `--json`, ver nota abaixo) |
| `npm audit` / `--omit=dev` | apps/campo | 5 s / 5 s | FALHOU: 4 (1 alta, 3 moderadas), as mesmas 4 com `--omit=dev` | `audit-campo.txt`, `audit-campo.json`, `audit-campo-omit-dev.txt`, `audit-campo-omit-dev.json` |
| `npx expo-doctor` | apps/campo | 30 s | FALHOU 20/21: 9 pacotes Expo com drift de patch | `expo-doctor.txt` |
| `EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1 npx expo-doctor` (como no CI) | apps/campo | 10 s | PASSOU 20/20 | `expo-doctor-como-no-ci.txt` |
| `npm ls` (gate de árvore coerente do CI) | apps/campo | 2 s | PASSOU (exit 0) | `npm-ls-campo.txt` |
| `npm run test:scripts` | dc360 | 4 s | FALHOU: 165 testes, 158 ok, 3 falharam, 4 pulados | `test-scripts.txt` |
| `npm run conferir:numeros` | dc360 | 38 s | FALHOU: 13 afirmações de README/docs não batem (9 bateram) | `conferir-numeros.txt` |
| `npm run auditar` | dc360 | 1 s | QUEBROU: `spawnSync npm ENOENT` (Windows) | `auditar.txt` |
| `npm run auditar` com shim de `npm` via `NODE_OPTIONS` (scratch, fora do repo) | dc360 | 5 s | REPROVADO: "1 moderate em dependência de runtime" (a parte do app de campo não chegou a rodar) | `auditar-com-shim-windows.txt`, `_shim-npm.cjs` |
| `npm run build --workspace @dc360/web` | apps/web | 23 s | PASSOU | `build-web-local.txt` |
| `npm run test:e2e` (Chromium, modo local) | apps/web | 45 s | FALHOU na seção 2 (`.indicador` não aparece em 30 s) | `e2e-local-chromium.txt` |
| `MOTOR=firefox npm run test:e2e` | apps/web | 54 s | FALHOU no mesmo ponto | `e2e-local-firefox.txt` |
| `npm run test:e2e:api` (Chromium; sobe API e painel sozinho, sem serviço externo) | apps/web | 71 s | FALHOU na seção 13 (PUT de evidência, "Failed to fetch"); seções 1 a 12 OK | `e2e-api-chromium.txt` |
| `npx vitest run test/banco-tls.test.ts` com `OPENSSL_CONF` não definido | apps/api | 4 s | PASSOU 13/13 (teste de hipótese) | `teste-banco-tls-sem-openssl-conf.txt` |
| lint | todos | n/a | NÃO EXISTE | (ver 3.2) |

Notas: (a) `test:isolamento` = `npm run test --workspace @dc360/db`, a mesma suíte da linha do db; não rodei duas vezes. (b) `audit-raiz-json.txt` (primeira tentativa de `--json`, com cabeçalho do meu executor misturado) não foi usado; a análise do audit da raiz vem de `audit-raiz.json` e `audit-raiz-omit-dev.json`. (c) O raw `teste-api.txt` contém um JWT de teste impresso numa mensagem de asserção (token efêmero de banco em memória, segredo de teste); foi redigido no arquivo. (d) `test:campo` e `auditar` dependem do ambiente Windows (itens 13 e 8).

### 3.5 Comparação com a auditoria de 30/09 (só comparação)

| Medida | Auditoria 30/09 | Hoje | Igual? |
| --- | --- | --- | --- |
| db | 318 (315 + 3 pulados) | 318 (315 + 3) | sim |
| shared | 149, 1 falha | 149, 1 falha | sim (causa tem um segundo acerto novo, ver 12) |
| packages/campo | 159 | 159 | sim |
| api | 1109: 1089 + 18 pulados + 2 falhas + 1 suíte | idem | sim |
| console | 259 | 259 | sim |
| web | 550, 14 falhas, 5 arquivos | idem | sim |
| campo jest | 1801, 20 falhas, 5 suítes | idem | sim |
| npm audit raiz | 3 moderadas (1 runtime) | idem | sim |
| npm audit campo | 4 (1 alta, 3 moderadas) | idem | sim |
| expo-doctor | 20/21, 9 pacotes | 20/21, 9 pacotes | sim |
| typecheck campo | 2 erros | 2 erros | sim |

Não constavam na auditoria anterior: `test:scripts` (3 falhas), `conferir:numeros` (13 afirmações), `auditar` (quebra e reprova), os 3 e2e de navegador, a causa real de `banco-tls`, a prova do cache `.expo`, a causa de cada um dos 5 arquivos do campo, o desligamento da vigência, e o fato de o laudo do pacote de saída nunca ter tido o aviso de equipe (não é regressão).

### 3.6 Hipóteses de ambiente testadas

1. `core.autocrlf=true` quebra teste que procura `"\n}\n"`: CONFIRMADA para `apps/web/test/ocorrencia-encerramento.test.ts` (linha 170). Prova barata sem alterar arquivo: no texto real do disco (CRLF) `indexOf("\n}\n")` dá -1 e `onEnviar(` conta 4; no mesmo texto normalizado para LF dá posição 68592 e conta 1 (o que o teste espera). O teste depende de LF. `git ls-files --eol`: `i/lf w/crlf`. Não há `.gitattributes` para fixar. O CI (Linux) não tem o problema: inferência, NÃO CONFIRMADO (sem acesso ao CI).
2. `openssl` fora do PATH quebra `banco-tls`: REFUTADA. O `openssl` é achado (Git, `/mingw64/bin/openssl`) e o erro é "Command failed" (processo rodou e saiu com 1). A causa: a variável de ambiente `OPENSSL_CONF=C:\Program Files\PostgreSQL\psqlODBC\etc\openssl.cnf` (instalador do driver ODBC do PostgreSQL) aponta para arquivo que não existe; o `openssl req` falha com "Can't open ... openssl.cnf". Com `env -u OPENSSL_CONF`, `banco-tls.test.ts` passa 13/13 (`teste-banco-tls-sem-openssl-conf.txt`). É defeito de ambiente desta máquina, não do produto.
3. Quebras de portabilidade Windows adicionais, achadas ao rodar os gates: `execFileSync("npm", ...)` sem shell dá ENOENT no Windows (provado com `node -e`: `npm` ENOENT, `npm.cmd` EINVAL). Isso derruba `scripts/auditar.mjs:61` e o caso 19 de `comando-de-migracao.test.mjs`. O caso 22 de `copiar-producao.test.mjs` usa caminhos POSIX (`/Users/alguem/...`) com `path.resolve`/`sep`, que no Windows viram `C:\Users\...`: inferido de `scripts/copiar-producao.mjs:112-122`, NÃO CONFIRMADO em Linux (sem WSL aqui).

---

## 4. Revalidação dos achados 1 a 13

### Item 1. Falta tela para redefinir a senha de outro usuário

- Estado atual: API pronta, tela ausente. Confirmado.
- Evidência: rota `POST /usuarios/:id/redefinir-senha` em `apps/api/src/rotas/administracao.ts:433` (permissão `gerenciar_usuarios`, recusa a própria conta com 422 `autoredefinicao`, outro município responde 404). Camada de dados do painel pronta: `apps/web/src/dados/http.ts:752` (`redefinirSenhaDeUsuario`), stub no modo local `local.ts:458`, reexportada em `repositorio.ts:65`, listada em `paridade-dos-modos.test.ts:258`. Nenhuma página chama: `grep` de `redefinirSenhaDeUsuario`, `encerrarSessoesDeUsuario`, `encerrarMinhasSessoes` em `apps/web/src` só acha essas definições; `SenhaTemporaria` (que o teste importa) não existe em `Usuarios.tsx`; o único "Redefinir senha" da interface é `RecuperarSenha.tsx` (fluxo por email).
- Risco: com recuperação por email desligada, quem administra não tem botão para devolver o acesso a um agente que esqueceu a senha. Estado de produção da recuperação por email: NÃO CONFIRMADO por mim (há `docs/LIGAR-O-EMAIL.md` e `recuperacao-desligada.test.ts`, que indicam que o desligamento é suportado).
- Corrigido depois de 30/09? Não (nenhum commit novo).
- Teste cobrindo: SIM, vermelho: `apps/web/test/seguranca-da-conta.test.ts`, 8 casos, criado no commit 5ecdf4c (15/09) sem a tela. O lado API tem teste dentro da suíte verde da API (não isolei o arquivo: NÃO CONFIRMADO qual).

### Item 2. Falta tela para encerrar as sessões de outro usuário

- Estado: idem item 1. Rota `POST /usuarios/:id/encerrar-sessoes` (`administracao.ts:550`), função `http.ts:762`, stub `local.ts:471`. Nenhuma tela.
- Agravante novo: o comentário de `apps/api/src/auth/sessoes.ts:23-28` diz que "toda escrita relê a sessão do token no banco (`auth/vigencia.ts`)" e que sessão encerrada responde 401 no pedido seguinte. Isso NÃO é verdade no código atual (item 4): o token de acesso já emitido continua escrevendo até expirar (`ACESSO_MINUTOS` padrão 15, `config.ts:356`). Então mesmo quando a tela existir, "encerrar sessões" não corta a escrita na hora.
- Cobertura: mesmo arquivo de teste vermelho (casos "os dois botões existem", "cada um pergunta antes", "depois de encerrar as sessões, a tela confirma com um Toast", "só quem o posto deixa administrar").

### Item 3. Falta tela para encerrar as minhas outras sessões

- Estado: API pronta (`POST /auth/encerrar-sessoes`, `autenticacao.ts:229`, aberta também com senha provisória via `servidor.ts:816`), função `http.ts:854` (`encerrarMinhasSessoes`), stub `local.ts:478`. `MinhaConta.tsx` não chama e não tem `MinhasOutrasSessoes`. Foto de perfil no painel: fora deste item.
- Cobertura: `seguranca-da-conta.test.ts` (2 casos "Minha conta", vermelhos).
- Risco: quem perde o celular não tem como derrubar o acesso pelo painel (só pela API). Nota: a rota existe de propósito sem pedir senha (comentário em `autenticacao.ts`), o que torna a ausência do botão mais cara.

### Item 4. Senha provisória que expira durante a sessão ativa

- Estado: falha reproduzida hoje: `apps/api/test/senha-provisoria.test.ts:183` ("uma sessão viva cuja senha provisória venceu no meio não escreve nem renova") recebe 200 onde espera 401 `sessao`.
- Causa no código, em três camadas:
  1. `auth/vigencia.ts` implementa `lerVigencia`/`exigirVigencia`, que recusam (401 `sessao`) conta inativa, papel diferente do token, sessão encerrada e `senha_provisoria_ate < agora`.
  2. `apps/api/src/servidor.ts:447-469` (`exigirAutenticacao`) NÃO chama mais essa função: só `exigirAcessoAtivo` (suspensão do município). O bloco diz "DESLIGADO NESTA IMPLANTAÇÃO, DE PROPÓSITO" porque a revisão "não terminou de rodar a própria suíte". O commit que removeu as chamadas é b4439ac (17/09/2026 15:05, "ultimo commit"); o teste `vigencia-na-escrita.test.ts:94-102` foi marcado `describe.skip` (5 testes pulados) no mesmo commit.
  3. `auth/servico.ts:667` (`trocarSenha`) só confere se a senha atual bate; não confere `senha_provisoria_ate`. `/auth/trocar-senha` é rota aberta para token com marca `sp` (`servidor.ts:809`), e a marca do token (`conteudo.sp`) não expira sozinha. Só a renovação confere o vencimento (`servico.ts:524`, `senhaProvisoriaVencida`), por isso a parte "não renova" do teste passa.
- Alcance real, maior que o teste: os 5 casos pulados provam, por escrita, "conta desativada não escreve mais", "papel rebaixado escreve como o papel novo", "sessão encerrada por quem administra", etc. Com a vigência desligada nada disso vale durante a janela do token (15 min por padrão). Leitura nunca foi coberta (decisão antiga em `auth/suspensao.ts`). A janela só mata a renovação.
- Risco: um coordenador rebaixado, ou uma conta desativada por suspeita de abuso, continua podendo registrar, despachar, encerrar ocorrência e subir vistoria por até 15 min (trilha é append-only, correção não apaga). O vetor específico da senha provisória é estreito (exige sessão aberta antes do vencimento e conhecer a senha provisória).
- Documentação: não há menção no README nem em `apps/api/PENDENCIAS.md` de que a vigência está desligada (grep por "vigencia/vigência" nos .md: zero acertos relevantes). O README linha 130 diz que o token é "verificado por assinatura, sem ida ao banco", coerente com o estado atual. A fonte que cita o "plano de execução (PAUSADO em 15/09/2026)" não existe no repositório: NÃO CONFIRMADO onde está.
- Corrigido depois de 30/09: não. Teste cobrindo: o vermelho acima e o `describe.skip` (5).

### Item 5. Divergência no laudo dentro do pacote de saída do município

- Estado: falha reproduzida (`saida-de-municipio.test.ts:367`, "o laudo do pacote imprime o aviso de equipe divergente, como o laudo emitido": o HTML do laudo do pacote não contém "estava designada à Equipe Alfa").
- Causa: o laudo emitido pela rota lê as duas equipes da vistoria (`apps/api/src/rotas/documentos.ts:108-118`: `ed.nome AS equipe_designada_nome, ea.nome AS equipe_do_agente_nome`, com `LEFT JOIN equipes ed/ea` em `v.equipe_designada_id`/`v.equipe_do_agente_id`). `avisoDeEquipe` em `documentos/laudo.ts:~503-519` imprime o aviso a partir desses campos. A consulta de vistorias de `apps/api/src/saida/pacote.ts:479-494` (`DISTINCT ON (v.ocorrencia_id)`) junta só `usuarios u` (nome e matrícula do agente) e calcula `sem_despacho`; nunca seleciona as equipes. Só o caso `sem_despacho` está coberto no pacote.
- NÃO é regressão: `git log -S'equipe_designada_nome' -- apps/api/src/saida/pacote.ts` não retorna commit algum; o teste nasceu no 5ecdf4c (15/09) descrevendo um conserto que não entrou no `pacote.ts`. O b4439ac só trocou `gerarPacote()` por `baixarPacote(tokenAdministradora)` no teste.
- Risco: dois documentos que deveriam ser idênticos (laudo emitido e laudo do pacote) divergem justamente no aviso que aponta coleta por agente de outra equipe. O município que levar o pacote embora leva o "papel limpo". Quebra o princípio do produto de um único gerador de laudo. Classe de gravidade: alta para auditoria e laudo de interdição, baixa de frequência.
- Corrigido: não. Cobertura: o próprio teste vermelho.

### Item 6. Testes de "sessão encerrada" do app de campo (causa raiz por arquivo)

Reprodução: `teste-campo-jest.txt` (20 falhas, 5 suítes). A auditoria anterior agrupou os 5 como "mesmo tema". Não são. Quatro causas distintas; histórico com `git log -S`/blame. O commit 5ecdf4c (15/09 23:28) toca código e testes de todos.

| Arquivo | Falhas | O que o teste espera | O que o código faz | Quem está certo | Causa raiz |
| --- | --- | --- | --- | --- | --- |
| `src/__tests__/a-sessao-que-terminou-nao-e-falta-de-sinal.test.tsx` | 1 ("o ⓘ ensina o caminho de volta...") | explicação com "Sair da conta" e "continua guardado no aparelho" | `src/dados/falha-de-atualizacao.ts` `comoContarAFalha("sessao-encerrada")` manda "Toque em Entrar de novo" e diz expressamente que NÃO manda "Sair da conta", porque `sair()` apaga o dado local (vistoria começada); o botão da faixa é "Entrar de novo" (`index.tsx:1233`, chama `encerrarSessaoVencida`, que não apaga) | O CÓDIGO. A decisão está escrita e datada em `index.tsx:1222` ("Até 15/09/2026 este botão chamava `sair()`...") e o teste de unidade irmão (`falha-de-atualizacao.test.ts`) passa | Texto do teste ficou da versão anterior; a mudança entrou no 5ecdf4c sem atualizar o teste |
| `src/__tests__/perfil-a-sessao-que-terminou-e-o-aviso-que-fecha.test.tsx` | 1 ("...sem prometer o que não vale") | `toque em "Sair da conta" e entre de novo` | mesmo texto novo | O CÓDIGO | Mesma causa |
| `src/push/logout-cala-o-aparelho.test.tsx` | 4 | login/saída funcionando com `banco-local` mockado só com `apagarDadosLocais` (linha 18-20) | `sessao.tsx:180` agora chama `acolherNoAparelho` (e `marcarDonoDosDadosLocais`), ausentes do mock: `TypeError: acolherNoAparelho is not a function` | O CÓDIGO (a regra "mesma pessoa reencontra a vistoria, outra pessoa limpa" é deliberada, `banco-local.ts:195-258`) | Mock do teste (último toque 09/09) não acompanhou o `sessao.tsx` alterado no 5ecdf4c |
| `src/ui/dialogo-na-conta-com-vistoria-comecada.test.tsx` | 6 (4 do diálogo, 2 "fila lida ao vivo") | O Perfil assina a fila pelo gancho `useResumoDaFila` e o diálogo de saída conta rascunhos ("2 vistorias começadas neste aparelho", "sair apaga") | `perfil.tsx:449-453` lê `fila.resumo()` UMA vez na montagem (`git log -S` mostra essa linha desde f72c244, 14/09; `assinar` nunca esteve no `perfil.tsx`); o diálogo de saída (`perfil.tsx:539`, 1464-1467) só diz "Você vai precisar de sinal e da sua senha para entrar de novo" e nunca lista rascunhos; `listarRascunhos` nem é importado no Perfil. O mock do teste só tem `assinar`, então `fila.resumo is not a function` | O TESTE. Descreve dois achados do revisor de 15/09 que nunca foram implementados | Correção escrita como teste (vermelho) e nunca feita. O comentário de `banco-local.ts:273-277` ("É por isso que o diálogo de saída conta os rascunhos e avisa") descreve um comportamento que o código não tem (documentação contradiz código) |
| `src/__tests__/vistoria-o-teclado-a-camera-e-o-que-ela-promete.test.tsx` | 8 | seis achados do revisor cético de 15/09 (cabeçalho do teste, linhas 11-33) | `vistoria/[id].tsx` NÃO tem: nenhuma referência a teclado (`Keyboard`/`keyboardShouldPersistTaps`: 0 acertos); nenhum `barra-da-camera`; nenhum "Abrir os ajustes do aparelho"; nenhuma frase "saiu vazio" (só existe em `dados/evidencia-no-disco.ts:59`, e `fotografar` a engole); `Math.round(posicao.coords.accuracy)` em `[id].tsx:1447` dá 0 abaixo de 0,5 m e `schemas.ts:411` exige `z.number().positive()`; a tela de vistoria guardada ainda diz "sobe assim que houver rede, mesmo com o aplicativo fechado" (`[id].tsx:2232-2233`) e não há sincronização em segundo plano (`package.json`/`app.config.ts` sem task-manager nem modos de fundo) | O TESTE (correções não feitas) | Seis defeitos de produto documentados e não corrigidos, um deles (frase "mesmo com o aplicativo fechado") é promessa falsa ao agente |

Síntese: 6 dos 20 (2 arquivos) são texto de teste desatualizado; 4 são mock desatualizado; 14 descrevem defeitos reais do app que ainda existem (6 do Perfil e 8 da vistoria). O pior deles para o usuário: sair da conta pelo Perfil apaga a vistoria começada sem aviso; GPS excelente (menos de 0,5 m) impede concluir; promessa falsa de envio em segundo plano.

### Item 7. Memória da exportação e da saída de município

- Estado: risco CONFIRMADO no código, já escrito no próprio repositório.
- Evidência: `apps/api/src/saida/pacote.ts:433-449` faz `SELECT <colunas> FROM <tabela> ORDER BY ...` sem `LIMIT` para cada tabela de `TABELAS_DA_SAIDA` (lista a partir da linha 49: organizacoes, equipes, usuarios, ocorrencias, vistorias, ..., evidencias, providencias, oficios...) e acumula `tabelas.push({ nome, colunas, linhas: r.rows })` dentro de uma transação, antes do primeiro `yield`. Depois vêm consultas inteiras de ocorrências (linha ~458), vistorias (479), órgãos indicados (505), ofícios (520), evidências (535), usuários (550). Só as fotografias saem em fluxo, uma por vez. `somas` (SHA-256) guarda só hash e caminho. O ZIP sai em fluxo (`rotas/saida.ts` `Readable.from(fluxoZip(...))`), sem `content-length`.
- Contradiz o comentário da rota? Em parte. O parágrafo de `rotas/saida.ts` sobre o fluxo promete não segurar o pacote em memória, MAS o parágrafo seguinte se corrige: "ATENÇÃO, ESTE PARÁGRAFO AINDA NÃO É VERDADE INTEIRA ... lê TODAS as tabelas sem LIMIT ... Está escrito em `apps/api/PENDENCIAS.md`". Esse aviso entrou em 09/09 (commit 2c4e488), bem antes da auditoria; a auditoria de 30/09 leu só a promessa. O que persiste é a pendência em `apps/api/PENDENCIAS.md` (única seção do arquivo): o conserto proposto é paginar por cursor e emitir CSV/JSON linha a linha.
- Capacidade: `fly.toml:122-127`: `shared-cpu-1x`, 1 GB. O mesmo processo gera PDF com Chromium. `trilha_eventos` e `trilha_administrativa` só crescem (append-only).
- Teste de carga: NÃO existe para a saída. `db/test/carga.test.ts` (15 casos) mede correção sob volume (200 ocorrências, 5 aparelhos) e diz no cabeçalho que NÃO mede desempenho; não toca `montarPacoteDeSaida` (o próprio cabeçalho admite que repete o SQL da rota). `saida-de-municipio.test.ts` (19 casos) usa a semente pequena de Serra Alta. Medição de memória real: NÃO CONFIRMADO (não medi).
- Corrigido: não. Risco: P0 de continuidade no dia da saída; dimensão do município que estoura 1 GB: NÃO CONFIRMADO (sem medição).

### Item 8. Vulnerabilidades do `npm audit` (hoje, base de advisories de 30/09/2026)

Raiz `dc360` (3 moderadas; 1 em runtime):

| Pacote | Caminho | Severidade | Runtime ou dev | Advisory | Correção sem `--force`? |
| --- | --- | --- | --- | --- | --- |
| `fast-uri` (3.1.5 e 4.1.2 instalados) | `@dc360/api` > `fastify@5.12.1` > `@fastify/ajv-compiler@4.0.6` > `ajv@8.20.0` > `fast-uri@3.1.5`; também `@fastify/ajv-compiler` > `fast-uri@4.1.2` e `fast-json-stringify@7.0.1` > `fast-uri@4.1.2` | moderada | RUNTIME (aparece com `--omit=dev`) | GHSA-hrr3-gc8f-f4qj (host com percent-encoding), GHSA-jvvf-x445-j334 (mailto header injection); faixas afetadas `3.0.0 - 3.1.7` e `4.0.0 - 4.1.4` | SIM (`fixAvailable: true`; corrigidas em 3.1.8 e 4.1.5). NÃO apliquei (proibido) |
| `@vitest/mocker` (3.2.7) | `vitest@3.2.7` (dependência direta de api, campo pkg, db, shared, web) | moderada | dev | GHSA-82fw-gwwq-j7x9 (path traversal em mock) | NÃO: só com `vitest@5.0.3` (salto maior, `--force`) |
| `vitest` | direta | moderada | dev | via `@vitest/mocker` | idem |

Exploração real de `fast-uri` no Fastify: NÃO CONFIRMADO (não tentei); a rota não parseia URL de usuário via ajv-formats `uri`, mas não li o esquema de cada rota.

`apps/campo` (4: 1 alta, 3 moderadas; o `--omit=dev` lista as mesmas 4):

| Pacote | Caminho | Severidade | Runtime ou dev | Correção |
| --- | --- | --- | --- | --- |
| `brace-expansion` (1.1.18 sob `glob@7`/`minimatch@3.1.5`; 5.0.9 sob `@expo/fingerprint`/`minimatch@10.2.6`) | `jest@29.7.0` > `@jest/core` > (`@jest/reporters`, `jest-config`, `jest-runtime`) > `glob@7.2.3`; `react-native` > `@react-native/jest-preset` > `babel-jest` > `babel-plugin-istanbul` > `test-exclude`; `expo` > `@expo/fingerprint` > `minimatch` | ALTA (DoS por expansão quadrática GHSA-q2hr-2g5m-vwhr e por recursão GHSA-qhr7-859c-m2p7 e GHSA-6j4f-fj2g-mc7p) | Declarado "prod" pelo npm porque `expo-router` traz `@testing-library/react-native` (peer opcional) e `expo` traz o CLI `@expo/fingerprint`; na prática é ferramenta Node/Jest (inferência: não provei que não vai para o bundle RN) | SIM sem `--force` (`fixAvailable: true`; 1.1.21 e 5.0.12) |
| `decode-uri-component` 0.2.2 | `expo-router@57.0.21` > `query-string@7.1.3` > `decode-uri-component@0.2.2` | moderada (DoS GHSA-vcc3-ghjq-m6fr, `<=0.4.2`) | RUNTIME do app (`expo-router/build/fork/getPathFromState*` usa `query-string`) | NÃO pelo caminho do `npm audit` (só sugere `expo-router@5.1.11`, que é downgrade absurdo). A versão `0.5.0` existe no npm, mas `query-string@7.1.3` pede `^0.2.2`; só por `overrides`, compatibilidade NÃO CONFIRMADA |
| `query-string` 7.1.3, `expo-router` | cadeia acima | moderada | runtime | arrastados |

O `scripts/auditar.mjs` aceita `decode-uri-component` numa lista nomeada (`ACEITAS_NO_APLICATIVO`) com motivo escrito (DoS só por URL de link profundo). Pela lógica do script aplicada ao JSON (`audit-campo-omit-dev.json`), `brace-expansion` seria "NOVA" e reprovaria o app (inferência, o script parou antes por causa da raiz). O CI usa `npm audit --audit-level=low` puro, que falha nas duas árvores hoje. O README (`README.md:16`) afirma "`npm audit` em zero" e o CLAUDE.md torna isso regra não negociável: contradição ativa.

### Item 9. Drift do Expo Doctor

`expo-doctor.txt`: 20/21. Falha só a checagem de versões (consulta a rede, então muda com o tempo): expo 57.0.23 (esperado ~57.0.26), expo-camera 57.0.5 (~57.0.6), expo-constants 57.0.18 (~57.0.20), expo-image-manipulator 57.0.18 (~57.0.20), expo-image-picker 57.0.18 (~57.0.20), expo-linking 57.0.10 (~57.0.11), expo-location 57.0.18 (~57.0.20), expo-notifications 57.0.19 (~57.0.21), expo-router 57.0.21 (~57.0.24). Os intervalos do `package.json` (`~57.0.16` etc.) já admitem as versões novas: é atraso do lockfile, não do manifesto; atualizar é `npm update` dentro da faixa (não executei). O CI desliga exatamente essa checagem (`EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1`, comentário escrito no workflow), então o job fica verde: com ela desligada o doctor roda 20 checagens e passa 20/20. O README afirma "21 de 21" (`README.md:16`): só é verdade com a checagem de rede ligada e sem drift. Risco: baixo (patch), mas o binário nativo novo precisa ser recompilado.

### Item 10. Problemas conhecidos do painel web: cada teste vermelho (14 casos, 5 arquivos; `teste-web.txt`)

| Arquivo | Casos | Causa | Categoria 30/09 | Evidência |
| --- | --- | --- | --- | --- |
| `seguranca-da-conta.test.ts` | 8 | Telas dos itens 1 a 3 inexistentes; `SenhaTemporaria` não exportado de `Usuarios.tsx` (um caso quebra com "Element type is invalid"); `MinhasOutrasSessoes` ausente | A (gap funcional real) | `teste-web.txt` linhas 399-2157; teste criado no 5ecdf4c |
| `semente-e-confirmacoes.test.ts` | 3 | `Usuarios.tsx`, `Equipes.tsx`, `Orgaos.tsx` não usam `<Toast`. Só `Ocorrencia.tsx` usa o componente (`Toast.tsx` existe). Sem `role=status`, quem usa leitor de tela não ouve a confirmação de gravar | A (menor; acessibilidade) | linhas 2176, 2627, 2903 |
| `design-system.test.ts` | 1 | `componentes/Estrutura.tsx:132`: `style={{ borderRadius: "8px" }}` escrito à mão; blame: b387ee3 (17/09, commit do ícone do Edge), ou seja, a violação nasceu DEPOIS da suíte verde conhecida | B (defeito pequeno) | linha 349 |
| `acessibilidade.test.ts` | 1 | `componentes/Modal.tsx:260`: o `onClick` do fundo do modal tem exceção escrita ("acessibilidade: excecao", linha 254, seis linhas acima); o portão olha só quatro linhas (`acessibilidade.test.ts:318`, `slice(Math.max(0, el.linha - 5), el.linha - 1)`). A justificativa é verdadeira: Escape fecha (`Modal.tsx:133`) e os botões do rodapé fecham por teclado. Modal.tsx não muda desde 09/09; o portão é de 21/08 | C (portão frágil) | linha 327 |
| `ocorrencia-encerramento.test.ts` | 1 | CRLF do `core.autocrlf=true` (provado, seção 3.6) | C (ambiente) | linha 380 |

Nenhum dos 14 é fluxo de negócio quebrado em produção; os 11 das categorias A são capacidades ausentes.

Achado extra do painel, NÃO coberto por teste de unidade: o e2e local falha (`e2e-local-chromium.txt`, `e2e-local-firefox.txt`) porque, ao entrar partindo da raiz `/`, o painel cai em "Esta página não existe" (confirmado num script de diagnóstico: URL continua `/`, corpo mostra a tela `NaoEncontrada` com o usuário já logado). Causa: `App.tsx` `Protegida` manda `voltarPara: "/"` para `/entrar` (`App.tsx:43-50`), `entrar-regras.ts` `rotaInterna("/")` devolve "/" como rota válida (só barra `//` e `/entrar`), e não existe rota `/` nem `index` (`App.tsx:105-145`: o curinga `*` vira `NaoEncontrada`). A lógica nasceu no 5ecdf4c. Risco de produto: primeira impressão de quem digita só o domínio e entra. O ponto exato de falha no e2e de Firefox é o mesmo.

### Item 11. Problemas conhecidos da API

1. Vigência de conta, papel e sessão desligada na escrita (itens 2 e 4). Gap de segurança.
2. Pacote de saída: memória sem limite (item 7) e laudo sem aviso de equipe (item 5).
3. `banco-tls.test.ts` (13 casos, suíte cai no `beforeAll`): defeito de ambiente (`OPENSSL_CONF`), prova em 3.6. Em máquina sem esse ambiente, corre; em CI não confirmado.
4. `senha-provisoria.test.ts:183` (item 4).
5. CORS: `servidor.ts:369-378` libera `allowedHeaders: ["content-type", "authorization", "accept"]`, mas os cabeçalhos da URL de envio de evidência incluem `if-none-match: *` (`armazenamento/memoria.ts:105-109`; o comentário diz que repete o adaptador S3). Preflight medido contra uma API local que subi e derrubei: resposta `access-control-allow-headers: content-type, authorization, accept`, sem `if-none-match`, para o pedido com esse cabeçalho (a resposta é idêntica com e sem ele). Resultado: o PUT feito pelo navegador no e2e da API (`fluxo-api.e2e.mjs`, seção 13, linha 22 da função avaliada) falha com "Failed to fetch". O aplicativo nativo não passa por CORS, então o efeito de produção é limitado (upload de evidência por navegador); o e2e, porém, está vermelho. Desde quando: NÃO CONFIRMADO.
6. `apps/api/PENDENCIAS.md` tem uma única pendência (a do item 7). Logo a vigência desligada, o CORS e o laudo do pacote NÃO estão listados como pendência em lugar nenhum fora de comentário de código e testes.
7. 5 testes da API pulados por decisão (vigência).

### Item 12. Problemas conhecidos do packages/shared

1 falha: `test/regras-de-conteudo.test.ts` "nenhum travessão em texto nenhum" (`teste-shared.txt`). A varredura lê `.ts/.md/...` de `dc360/`, `mockup/` e `docs/` (raiz), ignora só `docs/referencia`, `relatorio` e `dc360/packages/shared/test`. Dois acertos hoje:
- `dc360/apps/web/test/trilha-detalhe.test.ts:181` (`expect(rotulo).not.toContain(...)` com o caractere literal dentro de um teste que verifica ausência dele; blame 5ecdf4c, 15/09): falso positivo autorreferente que já existia no HEAD limpo (inferência pela data do blame e pela lógica do scanner; não rodei a varredura em árvore sem o arquivo abaixo).
- `docs/AUDITORIA-2026-09-30.md:313` (arquivo NÃO rastreado, é a auditoria anterior, que cita o caractere ao descrever o falso positivo acima). Acerto NOVO: escrever relatório de auditoria em `docs/` com esse caractere derruba o portão. Esta auditoria (V2) grava fora do repositório, por isso não contribui.
Categoria: C. Conserto sem decisão de produto: usar `"\u2014"` no literal, ou estender `CAMINHOS_IGNORADOS`.

### Item 13. Problemas conhecidos do app de campo

- Typecheck local falha por cache: `apps/campo/.expo/types/router.d.ts` (gitignored, datado de 27/08) não tem as rotas `mapa`, `perfil`, `avisos`; sem esse cache o mesmo typecheck passa (0 erros, `typecheck-campo-sem-cache-expo.txt`). Em runner limpo não existe `.expo/`: inferência de que o CI passa, NÃO CONFIRMADO. `tsconfig.json` inclui `.expo/types/**/*.ts` e `app.config.ts:620` liga `typedRoutes`.
- Jest: 20 falhas, causas no item 6.
- `npm audit` (item 8) e drift do Expo (item 9).
- `apps/campo/PENDENCIAS.md` tem 13 itens abertos (títulos lidos: autoria do servidor sem reação da tela, vistoria que morre por arquivo sumido, cache de foto antiga, coleta de agente que não volta, `assumir`, devolução de tarefa vencida combinada e não conferida, "nada disto foi executado em aparelho", `expo-haptics` exige regenerar `ios/`, identidade 2.0, agente sem equipe, sino sem saber do push, menu de vidro só no iOS). Li apenas os títulos nesta sessão; conteúdo de cada um: NÃO CONFIRMADO por mim.
- Nenhum teste em aparelho ou simulador (ver 25). Quatro portões em `scripts/portao-*.test.mjs` cobrem design, acessibilidade, densidade e mapa do app por análise estática.
- Risco de dupla árvore de dependências: `apps/campo` fora dos workspaces, lockfile próprio, `npm audit` separado; `auditar.mjs` foi escrito justamente porque o portão raiz "estava cego".

---

## 25. Mapa de testes

Base: contagens de hoje (seção 3.4) e de `conferir-numeros.txt` (2536 testes vitest somados; 4337 com o app; 68 + 103 verificações de navegador). `conferir:numeros` lê 1104 para a API (vs. 1109 executados: os 5 de `describe.skip` não entram na lista estática).

| Nível | O que existe (arquivos, contagem real) | Como rodar | Roda no CI? | O que NÃO existe / buracos |
| --- | --- | --- | --- | --- |
| Unidade | `packages/shared` 14 arquivos, 149; `packages/campo` 8, 159 (fila 58, depósito SQLite 9 com dublê); `apps/web` 36 arquivos vitest, 550 (grande parte "testes de fonte": leem `.tsx` com regex, ex. `seguranca-da-conta`, `semente-e-confirmacoes`, `ocorrencia-encerramento`, o que os torna sensíveis a formatação e a CRLF); `apps/campo` 121 suítes jest, 1801 | `npm test` na raiz (vitest, exclui o app); `npm test` em `apps/campo` (jest); `npm run test:campo` | Sim: job `produto` (`npm test`) e job `aplicativo` (`npm test` do app) | Sem cobertura medida (nenhum relatório de cobertura, nenhum limiar). Testes de regex sobre código-fonte dão falso conforto e já produziram vermelho espúrio |
| Integração | `apps/api` 86 arquivos, 1109 (`app.inject` contra PGlite com `SET LOCAL ROLE dc360_app`, `apps/api/src/banco/memoria.ts:57`); `apps/console` 16, 259; `packages/campo` ↔ API (`campo-integracao.test.ts`, 10) | `npm run test:api`, `npm run test:console` | Sim (`npm test`) | Nenhum teste de API roda contra Postgres real. O job `implantavel` só migra, migra de novo e chama `/saude`. PGlite é WASM, um processo, uma conexão: concorrência real, `pg_dump`, TLS real do driver, pooler e extensões como `pg_trgm` (3 testes pulados por `runIf`) ficam fora |
| Banco | `db` 11 arquivos, 318 (isolamento 137, migrar 17, eliminação de município 39, busca 40, recuperação do console 30, carga 15, minimização 15...) | `npm run test:isolamento` (= suíte do db) | Sim: `test:isolamento` isolado e de novo em `npm test` | Mesma restrição: só PGlite. Não há teste de restauração de backup automatizado (RNF-06/CA-08 dependem de procedimento manual, documentado, não confirmado por mim) |
| Autorização | `packages/shared/test/permissoes.test.ts` (permissões por papel e posto); `apps/api/test/superficie.test.ts` (11 casos; lê a árvore de rotas do servidor montado e exige autenticação de toda rota, com lista de isenções justificada); `posto-abaixo-do-seu.test.ts`; `acesso-suspenso.test.ts`; `agente-so-ve-a-equipe.test.ts`; `encerrada-nao-recebe-ato.test.ts`; `apps/console/test/superficie.test.ts` | dentro de `npm test` | Sim | Matriz EXAUSTIVA papel x rota x método: NÃO existe (o `superficie` prova autenticação, não autorização por papel). Vigência (conta desativada, papel rebaixado, sessão encerrada) sem teste ativo (item 4) |
| Isolamento | CA-06: `db/test/isolamento.test.ts` (137, catálogo do Postgres, FK composta, papéis sem privilégio); `db/test/carga.test.ts` (isolamento sob disputa com 260 ocorrências); `eliminacao-de-municipio`; `apps/console/test/plateia-nao-atravessa.test.ts`; testes de 404 por rota na API | `npm run test:isolamento` | Sim, como portão separado | Isolamento nos arquivos do armazenamento (prefixo `tenant/{organizacao_id}/`) só por CHECK e testes de unidade; não conferido em S3/R2 real (NÃO CONFIRMADO). Sem teste de isolamento com dois pools e Postgres real |
| E2E (navegador) | `apps/web/test/fluxo.e2e.mjs` (68 verificações, modo local) e `fluxo-api.e2e.mjs` (103, contra API real); `apps/console/test/no-navegador.test.ts` e `ponta-a-ponta.test.ts` (dentro do vitest); Playwright `^1.49.0`, navegadores instalados (chromium, firefox, webkit) | `npm run test:e2e` (precisa de build e `vite preview` na 4173), `MOTOR=firefox ...`, `npm run test:e2e:api` (sobe tudo sozinho nas portas 3691 e 4691) | Sim: job `navegador` (Chromium e Firefox no local; Chromium na API) | HOJE OS TRÊS REPROVAM (rota `/` e CORS, itens 10 e 11). WebKit instalado e não usado no CI (README diz que Safari é desaconselhado no modo local). Sem e2e do console contra produção. Sem e2e com aparelho |
| Mobile | Jest com React Native Testing Library (121 suítes, 1801); 4 portões estáticos `scripts/portao-*-do-aplicativo.test.mjs`; `paridade-de-tokens`, `entitlements-do-ios` | `npm test` em `apps/campo`; `npm run test:scripts` | App: sim. `test:scripts`: NÃO roda no CI | Nenhum teste em aparelho ou simulador (sem Detox, Maestro ou Appium; busca negativa em código, `package.json` e workflows). Módulos nativos (câmera, GPS, `expo-sqlite`, `expo-file-system`, `expo-haptics`, `expo-blur`, push) só com dublê. `entitlements-do-ios` pula sem pasta `ios/`. Só 1 iPhone real citado pelo README (NÃO CONFIRMADO por mim). Android: sem aparelho citado |
| Offline | `packages/campo` (fila, idempotência, backoff, `deposito-sqlite` com dublê, correção, devolução, prova perdida); API `vistoria-em-corrida`, `coleta-nao-reescreve-prova`, `autoria-da-coleta`, `bytes-confirmados-nao-se-trocam`; jest do app (faixa de sincronização, sessão vencida não apaga vistoria) | `npm test` (shared/campo/api) e jest do app | Sim | O simulador de "perda de sinal" real em rede móvel não existe; o disco real (`expo-sqlite`, sistema de arquivos) é provado só com dublê (documentado em `apps/campo/PENDENCIAS.md`, título 7, NÃO CONFIRMADO o conteúdo). Fila com 14 testes vermelhos de tela (itens 6 e 13) |
| Contrato / API | Esquemas Zod compartilhados servem de contrato entre pontas; `paridade-dos-modos.test.ts` (modo local x HTTP); `notificador-http.test.ts` (contrato do provedor de email); `eventos-tem-rotulo` | dentro de `npm test` | Sim | Sem OpenAPI, sem teste de contrato consumidor/produtor e sem snapshot de respostas (`vercel.json` cita "openapi" uma vez, não investigado; nenhum teste a usa). Mudança de resposta da API só é pega se uma tela ou um teste quebrar |
| Carga / desempenho | `db/test/carga.test.ts` (15: correção sob volume, NÃO mede tempo, cabeçalho diz isso); `apps/api/test/pico-lista-e-mapa.test.ts`, `apps/web/test/pico-lista-e-mapa.test.ts`; `limite-por-usuario.test.ts` (rate limit) | dentro de `npm test` | Sim, mas sem medir latência | Nenhuma ferramenta de carga (k6, autocannon, Artillery: busca negativa). Nenhuma medição de p95 (RNF-02), de memória da saída de município (item 7), do PDF sob concorrência com Chromium em máquina de 1 GB, nem do console (155 s de teste local). Nenhum teste de soak |
| Segurança | `enumeracao-pelo-bloqueio`, `segundo-fator`, `rotacao-de-segredo`, `config`, `banco-tls` (vermelho por ambiente), `limite-por-usuario`, `senha-e-sessoes`, `senha-provisoria`, `superficie`, `assinatura*`, `push-segredo`; `regras-de-conteudo` (travessão e normas); `npm audit --audit-level=low` | dentro de `npm test`; `npm audit` | `npm audit` e testes: sim | Sem SAST (nenhum CodeQL, Semgrep, Sonar), sem DAST (nenhum ZAP/Nuclei), sem varredura de segredos (gitleaks/trufflehog), sem Dependabot/Renovate (só existe `verificar.yml` em `.github/`), sem SBOM. Sem fuzz nem teste de propriedade (`fast-check` ausente) em upload de evidência, CSV de importação, link curto do Maps ou parser de coordenada. Vigência desligada (item 4) |
| Acessibilidade | `apps/web/test/acessibilidade.test.ts` (15; contraste calculado sobre tokens, teclado e rótulos por varredura estática), `design-system.test.ts`, `foco.test.ts`, `modal.test.ts`, `toast.test.ts`; `scripts/portao-acessibilidade-do-aplicativo.test.mjs` | dentro de `npm test`; `npm run test:scripts` (app) | Web: sim. `test:scripts`: não | Nenhuma varredura dinâmica (axe, pa11y, Lighthouse: busca negativa), nenhum teste com leitor de tela, nenhum teste de zoom/reflow. Dois casos web vermelhos (Toast ausente em 3 telas; portão do Modal) |
| Ferramentas de repositório | `scripts/*.test.mjs` 18 arquivos, 165 testes (migração, cópia de produção, portões do app, `e2e-porta-ocupada`, `fontes-do-painel`, `paridade`, `entitlements`) | `npm run test:scripts` | NÃO | 3 vermelhos hoje (2 por Windows, 1 por regex desatualizado vs refator de `app.config.ts`, ver BAS-37 e BAS-39) |
| Conferência de documentação | `scripts/conferir-numeros.mjs` | `npm run conferir:numeros` | Sim (último passo do job `produto`) | 13 afirmações erradas hoje; o CI ficaria vermelho por isso mesmo depois de tudo mais consertado |

Buracos de maior peso, com linha na matriz: carga e memória da saída (BAS-45), teste em aparelho (BAS-46), fuzz de upload e propriedade (BAS-47), SAST/DAST/segredos (BAS-48), matriz de autorização papel x rota (BAS-44), contrato de API (BAS-49), acessibilidade dinâmica (BAS-50), restauração de backup automatizada (BAS-51).

---

## Matriz D

| ID | SUPERFÍCIE | DOMÍNIO | REQUISITO / CAPACIDADE | ESTADO | EVIDÊNCIA | RISCO | DEPENDÊNCIAS | DECISÃO HUMANA? | OBSERVAÇÃO |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BAS-01 | Todas | Build | Typecheck TypeScript estrito dos 6 workspaces do monorepo | A | `typecheck-raiz.txt`, exit 0, 46 s | Baixo | `build:shared` | Não | Passou; não cobre `apps/campo` |
| BAS-02 | Banco | Isolamento | Portão CA-06 (`isolamento.test.ts`, 137 casos) | A | `teste-db.txt`: 137 passaram em 63,8 s | Baixo | PGlite, papel `dc360_app` | Não | Só PGlite; Postgres real só no job `implantavel` (não rodado) |
| BAS-03 | Banco | Suíte | Suíte completa do db | A | 315 passaram, 3 pulados por `it.runIf` (`busca.test.ts:364,377,386`) | Baixo | - | Não | Pulos por desenho |
| BAS-04 | Shared | Conteúdo | Portão de travessão/normas (`regras-de-conteudo`) | B | `teste-shared.txt`: 2 acertos (`trilha-detalhe.test.ts:181` e `docs/AUDITORIA-2026-09-30.md:313`) | Baixo | Varre `docs/` | Não | Falso positivo autorreferente mais documento de auditoria na pasta varrida |
| BAS-05 | Campo (motor) | Offline | `packages/campo` | A | 159 passaram, 7 s | Baixo | - | Não | Dublê de SQLite |
| BAS-06 | API | Suíte | Suíte da API | B | 1089 ok, 2 falhas, 18 pulados, 1 suíte caída (`teste-api.txt`) | Médio | itens 4, 5, BAS-30 | Não | Duração 206 s |
| BAS-07 | Console | Suíte | Suíte do console | A | 259 passaram, 155 s | Baixo | - | Não | A mais lenta por teste |
| BAS-08 | Web | Suíte | Suíte do painel | B | 14 falhas em 5 arquivos (`teste-web.txt`) | Médio | itens 1 a 3, 10 | Não | Mesmo número da auditoria anterior |
| BAS-09 | Campo | Build | Typecheck do app | B | `typecheck-campo.txt` 2 erros; sem cache `.expo`: 0 erros | Baixo | `.expo/types` gitignored | Não | Falso vermelho local; CI provavelmente verde (NÃO CONFIRMADO) |
| BAS-10 | Campo | Suíte | Jest do app | B | 20 falhas em 5 suítes (`teste-campo-jest.txt`) | Alto | item 6 | Não | 14 são defeitos reais, 6 testes velhos |
| BAS-11 | API | Dependências | `npm audit` raiz, runtime | B | `audit-raiz-omit-dev.json`: fast-uri moderada, fix sem --force | Médio | fastify | Não | Regra do CLAUDE.md exige zero |
| BAS-12 | Campo | Dependências | `npm audit` do app | B | `audit-campo.json`: 1 alta, 3 moderadas; `decode-uri-component` em runtime do app sem correção | Médio | expo-router, jest | Sim (aceitar ou override) | Lista `ACEITAS_NO_APLICATIVO` |
| BAS-13 | Campo | Dependências | Expo Doctor | B | `expo-doctor.txt` 20/21; 20/20 como no CI | Baixo | lockfile | Não | README diz 21/21 |
| BAS-14 | Raiz | Portões | `test:scripts` | B | `test-scripts.txt`: 3 falhas | Baixo | Windows, regex | Não | Não roda no CI |
| BAS-15 | Raiz | Docs | `conferir:numeros` | B | 13 afirmações erradas (`conferir-numeros.txt`) | Baixo | README, `docs/COLOCAR-DE-PE.md` | Não | Quebra o job `produto` |
| BAS-16 | Raiz | Portões | `auditar` (`npm run auditar`) | B | `auditar.txt` ENOENT; com shim: reprova runtime | Médio | Windows | Não | Portão não roda na máquina do dono |
| BAS-17 | Web | E2E | E2E local (Chromium e Firefox) | B | `e2e-local-chromium.txt`, `e2e-local-firefox.txt` | Alto | BAS-31 | Não | Reprova na seção 2 |
| BAS-18 | Web/API | E2E | E2E contra a API | B | `e2e-api-chromium.txt` seção 13 | Médio | BAS-30 | Não | Seções 1 a 12 OK |
| BAS-19 | Todas | CI | Status real do CI no GitHub | G | Repo privado, `gh` sem login, API pública 404 | Desconhecido | acesso ao repo | Sim | Só li o workflow |
| BAS-20 | Todas | Qualidade | Lint e análise estática | D | Nenhum eslint nos lockfiles; comentários `eslint-disable` sem ferramenta | Baixo | - | Sim | Só `tsc` estrito |
| BAS-21 | API | Autenticação | Vigência (conta ativa, papel, sessão viva, senha provisória) na escrita | B | `servidor.ts:447-469` sem chamada; `vigencia-na-escrita.test.ts:102` `describe.skip`; b4439ac | Alto | item 4 | Sim | Janela de 15 min, `sessoes.ts:23` afirma o contrário |
| BAS-22 | API | Autenticação | Expiração de senha provisória durante sessão ativa | B | `senha-provisoria.test.ts:183` recebe 200 esperando 401; `servico.ts:667` | Médio | BAS-21 | Não | Vetor estreito |
| BAS-23 | Web | Administração | Redefinir senha de outro usuário (tela) | B | rota `administracao.ts:433` e `http.ts:752`; nenhuma página chama | Alto | seguranca-da-conta.test | Não | API pronta |
| BAS-24 | Web | Administração | Encerrar sessões de outro usuário (tela) | B | `administracao.ts:550`, `http.ts:762`; sem tela | Alto | BAS-21 | Não | Não corta escrita na hora |
| BAS-25 | Web | Conta | Encerrar minhas outras sessões (tela) | B | `autenticacao.ts:229`, `http.ts:854`; sem tela | Médio | - | Não | Rota sem senha por desenho |
| BAS-26 | API | Saída de município | Laudo do pacote com aviso de equipe divergente | B | `saida-de-municipio.test.ts:367`; `pacote.ts:479-494` sem equipes | Médio | laudo.ts, documentos.ts | Não | Nunca implementado (não é regressão) |
| BAS-27 | API | Saída de município | Pacote sem acumular a base em memória | B | `pacote.ts:433-449` sem LIMIT; `PENDENCIAS.md` | Alto | `fly.toml` 1 GB | Sim | Comentário da rota se autocorrige |
| BAS-28 | Campo | Sessão | Aviso e ato de "sessão encerrada" (texto atual) | A | `falha-de-atualizacao.ts`, `index.tsx:1233`; testes de unidade passam | Baixo | - | Não | 2 testes de tela com texto velho |
| BAS-29 | Campo | Sessão | Login preserva vistoria da mesma pessoa e limpa a de outra (`acolherNoAparelho`) | A | `banco-local.ts:252`, `sessao.tsx:180`, `a-sessao-vencida-nao-apaga-a-vistoria.test.tsx` passa | Baixo | - | Não | 4 testes de logout com mock velho |
| BAS-30 | API | CORS/armazenamento | Upload de evidência pelo navegador (preflight com `if-none-match`) | B | `servidor.ts:369-378` vs `memoria.ts:105-109`; preflight medido | Baixo | e2e | Não | App nativo não sofre CORS |
| BAS-31 | Web | Navegação | Entrar partindo de `/` cai em "Esta página não existe" | B | `App.tsx:43-50,105-145`, `entrar-regras.ts`, diagnóstico e `e2e-local-*` | Médio | - | Não | Sem rota `/` |
| BAS-32 | Campo | Perfil | Diálogo de saída avisa que sair apaga vistoria começada e lê a fila ao vivo | B | `perfil.tsx:449-453,539,1464`; teste vermelho (6); `banco-local.ts:273-277` afirma o contrário | Alto | item 6 | Não | Risco de perda de dado de campo |
| BAS-33 | Campo | Vistoria | Seis correções da revisão de 15/09 (teclado, câmera, permissão, GPS, foto vazia, frase falsa) | B | `vistoria/[id].tsx:1447,2232`; teste vermelho (8) | Alto | item 6 | Não | GPS < 0,5 m impede concluir |
| BAS-34 | Web | Acessibilidade | Confirmação por `Toast` em Usuários, Equipes e Órgãos | B | `semente-e-confirmacoes.test.ts` (3); só `Ocorrencia.tsx` usa `<Toast` | Médio | `Toast.tsx` | Não | Leitor de tela |
| BAS-35 | Web | Design | Sem valor de design escrito à mão | B | `Estrutura.tsx:132` (b387ee3) | Baixo | - | Não | Violação pós-baseline |
| BAS-36 | Web | Acessibilidade | Portão de `onClick` em elemento não interativo | B | `Modal.tsx:254-260` vs janela de 4 linhas `acessibilidade.test.ts:318` | Baixo | - | Não | Portão frágil, código correto |
| BAS-37 | Ambiente | Portabilidade | Testes e scripts que dependem de LF, POSIX ou `npm` sem shell | B | `ocorrencia-encerramento`, `auditar.mjs:61`, 2 casos de `test:scripts` | Baixo | `autocrlf`, Windows | Sim | Sem `.gitattributes` |
| BAS-38 | Ambiente | Portabilidade | `banco-tls` no Windows do dono | B | `OPENSSL_CONF` inválido; 13/13 sem ela | Baixo | máquina | Não | Hipótese antiga refutada |
| BAS-39 | Raiz | Portões | `entitlements-do-ios.test.mjs` caso 37 (regex literal) | B | `app.config.ts:158,597` usa `PERFIL_DE_PRODUCAO` | Baixo | - | Não | Teste velho vs refator |
| BAS-40 | Processo | Git | Mudança de 275 arquivos num commit, com testes vermelhos escritos antes da correção | B | `git show --shortstat 5ecdf4c` | Médio | - | Sim | Mensagem não descreve |
| BAS-41 | Processo | Documentação | README e docs com números e promessas desatualizados | B | `conferir-numeros.txt`; README:16 "npm audit em zero", "21 de 21" | Baixo | - | Não | 13 linhas |
| BAS-42 | Testes | Unidade/integração | Cobertura medida e limiar | D | Nenhum relatório de cobertura | Médio | - | Sim | - |
| BAS-43 | Testes | Banco | Testes da API e do banco contra Postgres real | C | Só o job `implantavel` (migrar e `/saude`); resto PGlite | Médio | Docker/serviço | Sim | - |
| BAS-44 | Testes | Autorização | Matriz exaustiva papel x rota x método | C | `superficie.test.ts` (autenticação), `permissoes.test.ts`, `posto-abaixo-do-seu` | Alto | - | Não | Sem matriz completa |
| BAS-45 | Testes | Carga | Carga e memória (saída de município, PDF, pico de sincronização com medição) | D | `carga.test.ts` declara que não mede desempenho | Alto | BAS-27 | Sim | Sem k6/autocannon |
| BAS-46 | Testes | Mobile | Testes em aparelho ou simulador (Android e iOS) | D | Busca negativa por Detox/Maestro/Appium | Alto | aparelhos | Sim | README cita 1 iPhone manual |
| BAS-47 | Testes | Segurança | Fuzz e propriedade em upload, CSV, links e coordenadas | D | `fast-check` ausente | Médio | - | Não | - |
| BAS-48 | Testes | Segurança | SAST, DAST, varredura de segredos, Dependabot, SBOM | D | Só `verificar.yml` em `.github/` | Médio | conta GitHub | Sim | - |
| BAS-49 | Testes | Contrato | Contrato de API (OpenAPI ou snapshot) | D | Nenhum teste de contrato | Médio | - | Sim | `vercel.json` cita "openapi", não investigado |
| BAS-50 | Testes | Acessibilidade | Varredura dinâmica (axe, pa11y) e leitor de tela | D | Busca negativa | Médio | - | Não | Portão estático apenas |
| BAS-51 | Testes | Continuidade | Restauração de backup automatizada | G | Procedimento manual documentado, não lido por mim nesta frente | Médio | fornecedor do banco | Sim | CA-08 |
| BAS-52 | Processo | CI | `test:scripts` e `auditar` dentro do CI | D | `verificar.yml` não os chama | Baixo | - | Não | Vermelhos passam despercebidos |
| BAS-53 | Superfícies 4 e 5 | Produto | Portal das secretarias e app do cidadão | E | Fora do meu escopo provar; nenhum teste ou pasta encontrados nas listagens desta frente | n/a | outros auditores | Sim | Ver relatórios dos outros auditores |

## Fluxos

Fluxo da cadeia de validação `npm run verificar` (definida no `package.json` raiz), rodada passo a passo nesta sessão.

| FLUXO | PASSO | ESTADO (EXISTE/PARCIAL/AUSENTE/NOVO V2) | EVIDÊNCIA |
| --- | --- | --- | --- |
| verificar | typecheck (6 workspaces) | EXISTE (passa) | `typecheck-raiz.txt` |
| verificar | `npm test` (vitest de 6 workspaces) | PARCIAL (reprova em shared, web, api) | `teste-shared.txt`, `teste-web.txt`, `teste-api.txt` |
| verificar | `test:scripts` | PARCIAL (3 falhas) | `test-scripts.txt` |
| verificar | `test:campo` | PARCIAL (para no typecheck do app por cache local) | `test-campo-script.txt` |
| verificar | `auditar` | PARCIAL (quebra no Windows; reprova runtime) | `auditar.txt`, `auditar-com-shim-windows.txt` |
| verificar | `conferir:numeros` | PARCIAL (13 afirmações) | `conferir-numeros.txt` |
| CI `navegador` | e2e local Chromium, Firefox; e2e API | PARCIAL (os três reprovam aqui) | `e2e-*.txt` |
| CI `implantavel` | API sobe em Postgres 16 real | NÃO CONFIRMADO (não rodado: exige Postgres e `psql`) | `.github/workflows/verificar.yml` |

## Gaps

- P0 SEGURANÇA: vigência de conta, papel e sessão desligada na escrita (BAS-21, 22, 24). Conta desativada ou rebaixada segue escrevendo até 15 min; comentário de `auth/sessoes.ts:23` afirma o contrário; ausente do README e do PENDENCIAS.
- P0 SEGURANÇA: `npm audit` não fecha em zero, contra a regra do CLAUDE.md (BAS-11 com correção sem `--force`; BAS-12 alta em árvore de dev e `decode-uri-component` sem correção de caminho).
- P0 INTEGRIDADE: laudo dentro do pacote de saída sem o aviso de equipe divergente (BAS-26).
- P1 CONTINUIDADE: pacote de saída carrega a base inteira em memória numa máquina de 1 GB (BAS-27, 45).
- P1 OPERAÇÃO: sem tela para redefinir senha de terceiro, encerrar sessões de terceiro ou as próprias (BAS-23 a 25), com recuperação por email dependente de provedor.
- P1 OPERAÇÃO: diálogo de saída do app não avisa que sair apaga vistoria começada; GPS abaixo de 0,5 m impede concluir; promessa falsa de envio com o app fechado; teclado e câmera sem tratamento (BAS-32, 33).
- P1 PRODUTO: entrar pela raiz `/` leva a "Esta página não existe" (BAS-31); `Toast` ausente em três telas administrativas (BAS-34).
- P1 OPERAÇÃO: os três e2e de navegador e vários gates do `verificar` reprovados; CI sem status verificável (BAS-16 a 19, 52).
- P1 OPERAÇÃO: CORS impede PUT de evidência com `if-none-match` pelo navegador (BAS-30).
- P2 EVOLUÇÃO: lint ausente; cobertura não medida; testes contra Postgres real; OpenAPI; SAST/DAST/segredos; fuzz; aparelho real; acessibilidade dinâmica (BAS-20, 42 a 50).
- A DEFINIR: política de fim de linha e de ambiente de desenvolvimento Windows x CI Linux (BAS-37, 38); testes escritos antes da correção (BAS-40); override de `decode-uri-component` (BAS-12).

## Decisões humanas

1. Religar `auth/vigencia.ts` na escrita? Pergunta: religar agora, religar só para conta inativa e sessão encerrada, ou aceitar a janela de 15 min. Importa porque hoje a desativação de conta e o encerramento de sessões não cortam a escrita na hora. Bloqueia: confiança no botão "encerrar sessões" (itens 2 e 3) e o teste de senha provisória. Alternativas: (a) religar e consertar os 5 testes pulados (risco: travar escrita legítima, foi o motivo do desligamento); (b) religar parcial (menos cobertura, menos risco de travar); (c) reduzir `ACESSO_MINUTOS` e documentar (risco: janela continua, renovação mais frequente no campo offline); (d) aceitar e documentar no README (risco: incidente de conta comprometida sem corte imediato).
2. O que fazer com testes escritos antes das correções que nunca chegaram (web 11, API 1, campo 14)? Importa porque misturam defeito real com teste velho. Bloqueia: baseline verde. Alternativas: implementar; apagar ou reescrever o que for decisão superada (item 6, textos do aviso de sessão); marcar pulados com data e dono. Risco de cada: implementar atrasa a V2; apagar perde prova de defeito real; pular esconde vermelho (exatamente o que aconteceu com a vigência).
3. Padronizar fim de linha e ambiente (`.gitattributes`, script de setup, `OPENSSL_CONF`, `npm` em Windows). Importa porque o dono trabalha em Windows e o CI em Linux. Bloqueia: `npm run verificar` local. Alternativas: `.gitattributes` com `eol=lf`; corrigir os scripts com `shell: true`/`npm.cmd`; desenvolver em WSL ou contêiner. Risco: normalização de EOL reescreve todos os arquivos no primeiro checkout; WSL muda o fluxo do dono.
4. Política de `npm audit`: lista de aceites no app (`decode-uri-component`), override, troca de `expo-router`, e se dependência de desenvolvimento reprova. Importa porque a regra do CLAUDE.md diz zero. Bloqueia: CI verde. Alternativas: override de `0.5.0` (risco: quebrar deep link sem teste em aparelho); aceitar com prazo; esperar o Expo. Vitest 5 é salto maior: decidir quando.
5. Saída de município: limite de porte, paginação por cursor ou exportação assíncrona por arquivo. Importa para CA-10. Bloqueia: promessa comercial de portabilidade. Risco de cada: paginar mantém o processo de 1 GB; fila assíncrona exige armazenamento temporário e mais LGPD (arquivo com dado pessoal guardado).
6. Processo de commit: aceitar mudanças de 275 arquivos? Importa pela rastreabilidade de auditoria de um produto de dado pessoal. Bloqueia: nada técnico. Alternativas: commits pequenos com suíte verde; PR obrigatório e CI como portão; manter como está. Risco: mais atrito para o dono sozinho.
7. Exibir o status do CI: dar acesso de leitura (gh auth ou exportar logs) a esta auditoria. Bloqueia: confirmar se vermelhos são só do Windows.

## Riscos arquiteturais

- Dois mundos de dependência (`apps/campo` fora dos workspaces, lockfile próprio, `npm audit` próprio, gate próprio): o portão raiz nunca viu o app, e hoje o `test:campo` não roda no CI.
- Toda a confiança de banco e de API vem de PGlite (WASM, processo único, superusuário com `SET ROLE`). O que só existe em Postgres real (concorrência, pooler, TLS, extensões) é visto só pelo job `implantavel`.
- Autorização na escrita depende do token de 15 min sem consulta ao banco (vigência desligada): revogação é "eventual".
- Comportamento prometido em comentário e documentação diverge do código em pelo menos 3 pontos (`sessoes.ts:23`, `banco-local.ts:273-277`, parágrafo de fluxo de `rotas/saida.ts`), e o README desatualiza nos números.
- Processo: histórico com um commit gigante e testes-primeiro vermelhos; o último commit real (17/09, "ultimo commit") desligou um controle de segurança.
- Teste de fonte por regex sobre `.tsx` (web) acopla o teste ao formato do arquivo (CRLF, distância de comentário) em vez do comportamento.
- Máquina de 1 GB com Chromium do PDF e extração de município no mesmo processo.

## Dívidas técnicas

- 14 testes web, 1 shared, 2 API, 20 campo vermelhos; 5 pulados na API; 3 vermelhos em `test:scripts`.
- Cache `.expo/types` obsoleto local; lockfile do Expo atrasado em 9 pacotes.
- README e docs com números velhos (13 linhas); `README.md:16` afirma zero vulnerabilidades e 21/21.
- Sem lint; comentários `eslint-disable` sem ferramenta.
- `scripts/auditar.mjs` e 2 casos de `test:scripts` não rodam em Windows; `test:scripts` e `auditar` fora do CI.
- `Estrutura.tsx:132` com raio escrito à mão; portão de `Modal` com janela curta.
- `Usuarios.tsx`, `MinhaConta.tsx`, `Equipes.tsx`, `Orgaos.tsx`: telas e Toast pendentes.
- `perfil.tsx` lê a fila uma vez; `vistoria/[id].tsx` sem as seis correções.
- `pacote.ts` sem paginação e sem as equipes no laudo.
- Plano de execução citado em `servidor.ts` e no teste ("PAUSADO em 15/09/2026") não está no repositório.

## NÃO CONFIRMADO

- Status real do CI (repo privado). Se os vermelhos de Windows (CRLF, `npm` sem shell, caminhos POSIX, cache `.expo`) aparecem em Linux: inferido, não provado.
- Job `implantavel` (Postgres 16 real): não rodado.
- Se `brace-expansion` do app chega ao bundle React Native; se `fast-uri` é explorável pelas rotas; se o override de `decode-uri-component` 0.5.0 é compatível.
- Consumo real de memória da saída de município; quantidade de dados que estoura 1 GB.
- Em que commit o CORS passou a recusar `if-none-match` e se o e2e da API já estava vermelho no CI.
- Conteúdo dos 13 itens de `apps/campo/PENDENCIAS.md`, dos 5 de `apps/web/PENDENCIAS.md` e dos 6 de `db/PENDENCIAS.md` (li só os títulos).
- Qual arquivo de teste da API cobre as rotas dos itens 1 a 3 (passam dentro da suíte verde, não isolei).
- Comportamento em aparelho, procedimento de restore de backup, e estado de produção da recuperação por email.
