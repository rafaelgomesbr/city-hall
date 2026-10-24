# V2-F01-E12: Deploy de HML por merge e PROD por promoção manual

Estado desta entrega: **só a parte de código**. Os dois workflows, a régua de
`/saude`, o ajuste do `vercel.json`, os testes e os runbooks estão prontos e
verdes. **Nenhum dos dois workflows foi executado**: HML não existe (CP-05), os
ambientes do GitHub e os tokens ainda não foram criados, e a Vercel ainda não foi
mexida. Nada foi provado no ar.

## Fatos

**Arquivos novos:**

- `.github/workflows/deploy-hml.yml` (4 jobs). Gatilho `workflow_run` do
  `Verificar`, concluído, ramo `master`; o job `construir` só roda se
  `conclusion == 'success'`, `event == 'push'`, `head_branch == 'master'` e o
  repositório de origem é este (PR e fork nunca disparam). Todo checkout usa
  `workflow_run.head_sha`. Jobs: `construir` (build das duas imagens uma vez, com
  `DC360_VERSAO` e `DC360_COMMIT`, push ao GHCR, digest lido do registro),
  `implantar` (ambiente `homologacao`: cópia do banco de HML com
  `copiar-producao.mjs --ambiente hml`, `migrar-producao.mjs --ambiente hml
  --aplicar` e `--conferir`, cópia das imagens ao registro do Fly de HML por
  `docker buildx imagetools create` com o digest preservado, `flyctl deploy
  --image <app>@<digest>` da API e depois do console, e `conferir-saude-remota.mjs`
  com `--versao` e `--commit` depois de cada um), `painel` (move o ramo
  `homologacao` com `gh api`) e `aprovar` (põe o selo `hml-ok-<sha>` nas duas
  imagens, só depois dos anteriores).
- `.github/workflows/promover-producao.yml` (2 jobs). Só `workflow_dispatch`, com
  entradas `tag`, `sha`, `confirmacao` e `migracao_confirmada`. `validar` (sem
  ambiente nem segredo): falha fora da `master`, confere o formato da tag e do SHA,
  a frase `PROMOVER <tag>`, a migração confirmada, que a tag existe e aponta para
  o SHA (`refs/tags/<tag>^{commit}`), que o SHA está no histórico da `master`
  (`merge-base --is-ancestor`), `versao.mjs conferir` e `conferir-tag`, e exige o
  selo `hml-ok-<sha>` nas DUAS imagens (SHA sem deploy bem-sucedido em HML é
  recusado). `promover` (ambiente `producao`): registra o `/saude` de antes,
  copia as mesmas imagens por digest ao registro de PROD, implanta a API,
  confere `/saude`, implanta o console, confere `/saude`, move o ramo `producao`
  e escreve no resumo do run os digests e o tempo de troca. Não tem migration,
  nem `--ambiente hml`, nem criação de tag.
- `dc360/scripts/conferir-saude-remota.mjs` e `conferir-saude-remota.test.mjs`
  (7 casos): `/saude` com tentativas, reaproveitando `problemasDaSaude` do smoke
  das imagens; só aceita URL https sem caminho e SHA de 40 caracteres.

**Arquivos editados:**

- `dc360/vercel.json`: `git.deploymentEnabled.master = false` (a Vercel deixa de
  publicar a `master`). Nenhuma outra chave mudou.
- `dc360/scripts/vercel-json.test.mjs`: 9 para 11 casos (a regra de não publicar
  a `master`, e o caso que prova que ela morde).
- `dc360/scripts/conferir-workflows.test.mjs`: 24 para 44 casos. A regra "nenhum
  workflow declara escrita" virou uma lista nomeada (`ESCRITAS_PERMITIDAS`):
  `construir:packages`, `aprovar:packages`, `painel:contents` (HML) e
  `promover:contents` (PROD). Escrita no topo continua proibida. Novas regras:
  gatilho, travas do `if`, `head_sha`, ambiente por job, segredo só em ambiente,
  um token do Fly por app, deploy sempre `--image` por digest e com `-a`, ordem
  cópia, migration, API, console, painel, `/saude` com versão e commit, ausência
  de migration e de HML na promoção, ausência de `git tag`/`git push`, ausência de
  `${{ }}` dentro de `run:`, mesmo `flyctl` (versão e SHA-256) nos dois, nomes dos
  apps iguais aos dos `fly*.toml`. Doze casos estragam o workflow real e provam
  que a regra morde.
- `dc360/scripts/runbooks.test.mjs`: `gh workflow run` e `fly tokens` entram nas
  listas de comandos conhecidos; as marcações "depende de V2-F01-E12" saem dos
  quatro runbooks que deixaram de depender.
- `dc360/scripts/baseline.mjs`: `V2-F01-E02` 24 para 44, `V2-F01-E10-vercel-json`
  9 para 11, nova linha `V2-F01-E12: 7`. `npm run conferir:numeros` e
  `baseline.test.mjs` (29 casos) verdes.
- Documentação: `docs/runbooks/deploy.md` (caminho normal por workflow e caminho
  manual de emergência), `rollback.md`, `migracao.md`, `acesso-e-segredos.md`,
  `ensaio-da-segunda-pessoa.md`; `docs/IMPLANTACAO.md` (seção 10 nova e passo 8 da
  seção 9.2); `docs/VERCEL-PAINEL.md` (emenda da E12).

**Resultados (saídas em `saidas/`):**

- `conferir-workflows.test.mjs`: 44 de 44.
- `conferir-saude-remota`, `vercel-json`, `runbooks`, `baseline`: todos verdes.
- `npm run test:scripts`: 707 casos, 702 passam, 4 pulados, 0 falhas; 1 suíte
  cancelada (`lint-regras.test.mjs`, "as regras mordem no aplicativo de campo"),
  porque `apps/campo/node_modules` não está instalado neste worktree (E17, não
  tocada por esta etapa).
- `regras-de-conteudo` (10), `apps/web` `seo.test.ts` (27), `conferir:numeros`
  ("Todos os números da documentação batem"), `lint:teto`, `formato:conferir` e o
  ESLint do monorepo: verdes. O ESLint do aplicativo de campo não rodou (mesma
  razão: sem `node_modules` do campo).
- Sintaxe bash de todos os 26 blocos `run:` dos dois workflows (`bash -n`): sem
  erro. YAML dos dois lido por um parser (Ruby) sem erro.

**O que NÃO foi feito, e por quê:**

- Nenhum workflow rodou. Sem ambiente de HML (CP-05), ambientes do GitHub, tokens
  e projeto Vercel de HML.
- Não há prova de `/saude` antes e depois nem de tempo de troca: isso é a
  evidência do ensaio, que é do dono (`docs/IMPLANTACAO.md`, seção 10.3).
- O painel (Vercel) não é conferido pelo workflow; só API e console.
- Premissas não confirmadas contra o Fly de verdade (seção 10.4 de
  `IMPLANTACAO.md`): `docker login registry.fly.io -u x` com token de deploy de
  app; `imagetools create` para `registry.fly.io`; `flyctl deploy --image
  <app>@sha256:...`; push de ramo por `GITHUB_TOKEN` acionar o webhook da Vercel.

## Justificativa

**`workflow_run` em vez de `push`.** O requisito é implantar HML depois do CI
verde. Um gatilho de `push` correria em paralelo com o `Verificar`. O custo de
`workflow_run` é que ele roda no contexto do ramo padrão com segredos; por isso a
trava de quatro condições no `if` e o checkout do `head_sha` (e não da ponta do
ramo) estão no teste.

**A mesma imagem por digest, via GHCR.** PREMISSA (não testada): o token de deploy do Fly
é por app e não lê o registro de outro app, então a imagem de HML não poderia ser
puxada por PROD diretamente. A imagem é construída uma vez e publicada no GHCR; cada ambiente a
copia por `imagetools create` para o registro do próprio app, o que preserva o
digest (um `docker pull/push` poderia recriar o manifesto). O custo é uma
escrita de pacotes (`packages: write`) em dois jobs de HML, nomeada e travada no
teste. O `/saude` com o `commit` carimbado fecha a prova de que subiu a imagem
certa.

**O selo `hml-ok-<sha>` como prova de "passou por HML".** A promoção não confia no
input do operador: exige uma marca no registro que só o job `aprovar` de HML
escreve, depois de migrar, implantar e conferir tudo. Fica a ressalva de que quem
tem escrita de pacotes pode escrever a tag; o controle contra isso é o acesso ao
repositório.

**O painel por ramo, e não por token da Vercel.** O roteiro da etapa manda o
projeto de PROD usar um ramo atualizado só pela promoção. Mover um ramo exige
`contents: write` em um job por workflow (`painel` em HML, `promover` em PROD),
justificado e travado no teste, e evita guardar um token da Vercel no GitHub. O
`vercel.json` ganhou `git.deploymentEnabled.master = false`: o repositório, e não
só o painel de um provedor, declara que a `master` não publica. Se o dono esquecer
de trocar o ramo de produção na Vercel, o painel simplesmente não é publicado
(falha segura).

**Migration de PROD fora do CI.** A etapa e a ADR 0008 mantêm a credencial de dono
do banco de PROD fora do CI. A promoção não tem migration; ela exige a caixa
`migracao_confirmada` e, se o operador esquecer, a partida da API recusa subir
contra esquema atrasado e o Fly mantém o release anterior.

**Tag é ato do dono.** A promoção exige que a tag já exista e aponte para o SHA, e
os testes proíbem `git tag` e `git push` nos workflows.

## Para o orquestrador

Linha sugerida do STATUS:
`V2-F01-E12 | IMPLEMENTADA (só código) | candidato <sha7> | workflows de deploy de HML e promoção de PROD prontos e testados na forma (conferir-workflows 44/44); não executados: dependem de CP-05 e de ambientes, tokens e Vercel criados pelo dono`.

Pendências humanas (o que o Rafael faz fora do repositório; roteiro em
`dc360/docs/IMPLANTACAO.md`, seção 10):

1. Depois do CP-05: criar os ambientes do GitHub `homologacao` (sem revisor, só
   `master`) e `producao` (revisor obrigatório, só `master`).
2. Criar os tokens de deploy do Fly, um por app, e gravá-los como segredos de
   ambiente: `FLY_TOKEN_API` e `FLY_TOKEN_CONSOLE` em cada ambiente (apps de HML
   em `homologacao`, apps de PROD em `producao`), e `DC360_SENHA_BANCO_HML` em
   `homologacao`.
3. Vercel: trocar o ramo de produção de `dc360-painel-web` de `master` para
   `producao`; criar o projeto do painel de HML (ramo `homologacao`) só DEPOIS de
   fechar a exceção da E10 (o `build.env` do `vercel.json` ainda fixa a API de
   PROD).
4. Recomendado: ruleset para os ramos `producao` e `homologacao` (só o workflow
   escreve).
5. Ensaiar: um merge de prova até HML; um CI vermelho que não dispara deploy; uma
   promoção (e a recusa de um SHA sem selo); um rollback pelo runbook. Guardar
   `/saude` antes e depois e o tempo de troca em
   `docs/evidencias-v2/G01/V2-F01-E12/`.
6. Confirmar no primeiro run as quatro premissas listadas acima.

Riscos para o integrador: `verificar.yml` não foi tocado; o job `imagens` dele já
constrói as mesmas imagens, e o `deploy-hml.yml` as constrói de novo no merge (uma
construção a mais por merge, de propósito: a do CI não publica nada).
