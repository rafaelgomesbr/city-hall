# Runbook: implantar (deploy)

- **Versão:** 1, de 2026-10-24 (V2-F01-E16, rascunho).
- **Quem executa:** hoje, o dono (Rafael). A segunda pessoa executa em HML no
  ensaio (`ensaio-da-segunda-pessoa.md`); em PROD só depois do CP-07 e só pelo
  caminho que a V2-F01-E12 criar.
- **Quando usar:** toda entrega de código para um ambiente que está no ar.
- **Fontes deste texto:** `fly.toml`, `fly.console.toml`, `vercel.json`,
  `apps/campo/eas.json`, `docs/IMPLANTACAO.md` (seções 6, 7 e 8),
  `docs/VERCEL-PAINEL.md`, `docs/COLOCAR-DE-PE.md`.

## O que existe hoje, e o que ainda não

Hoje só existe PROD, e a implantação é feita **à mão, da máquina do dono**:

| Peça | Onde roda | Como é implantada hoje |
| --- | --- | --- |
| API | Fly, app `defesa-civil` | `fly deploy -a defesa-civil`, de `dc360/` |
| Console do fornecedor | Fly, app `defesa-civil-console` | `fly deploy -c fly.console.toml --ha=false`, de `dc360/` |
| Painel web | Vercel, projeto `dc360-painel-web` | A Vercel publica sozinha a cada entrada na `master` |
| Aplicativo de campo | Lojas, por EAS | `eas build` e `eas submit`, de `apps/campo/` |

Três coisas deste quadro mudam quando outras etapas chegarem, e o texto abaixo
diz o que fazer ANTES delas:

- **HML (app Fly, banco e bucket de teste):** depende de V2-F01-E11. Enquanto
  não existir, não há onde ensaiar este runbook antes de PROD, e o primeiro
  ensaio por uma segunda pessoa fica bloqueado.
- **Deploy de HML por merge e promoção manual de PROD por tag:** depende de
  V2-F01-E12. Quando existir, os passos 3 a 6 abaixo deixam de ser comando
  digitado e passam a ser o workflow; as pré-condições e a verificação
  continuam valendo.
- **`/saude` com `versao` e `commit`:** depende de V2-F01-E08. Hoje o `/saude`
  da API devolve `status`, `banco`, `ultimaMigracao`, `eliminacoes` e `push`,
  e nada diz qual commit está no ar. Até a E08, anote o número do release do
  Fly (passo 1) como a única ligação entre o que está no ar e um commit.

## Pré-condições

Todas precisam ser verdadeiras. Se uma não for, pare.

1. **Existe um PR com o CI completo verde no commit que vai ser implantado.**
   Veja em `https://github.com/rafaelgomesbr/city-hall/actions` ou, com o `gh`
   autenticado, `gh run list --branch <ramo> --limit 5`. O CI é a prova; rodar
   `npm run verificar` na máquina não substitui.
2. **A árvore local é exatamente esse commit.** O `fly deploy` sobe a pasta
   de trabalho, inclusive arquivo não commitado:
   ```bash
   git status --short        # tem que sair vazio
   git rev-parse HEAD        # tem que ser o SHA do PR verde
   ```
3. **A versão e o changelog conferem:**
   ```bash
   cd dc360
   node scripts/versao.mjs conferir
   node scripts/versao.mjs mostrar
   ```
   Se a entrega for uma versão nova, `node scripts/versao.mjs subir plataforma y`
   (ou `z`) e a seção do `CHANGELOG.md` entram no PR, antes. Tag é ato do dono
   (o script nunca cria): o nome se confere com
   `node scripts/versao.mjs conferir-tag v<X.Y.Z>`. A promoção automática por
   tag depende de V2-F01-E12.
4. **Migração pendente?** Veja o que falta, sem escrever nada:
   ```bash
   node scripts/migrar-producao.mjs
   ```
   Se faltar alguma, o passo 2 abaixo é `migracao.md`, inteiro, e só depois
   vem a API. A API e o console **recusam subir** contra esquema atrasado.
5. **Conta no Fly com acesso aos apps** (`fly auth whoami` mostra quem é) e
   o `flyctl` instalado. Quem não está logado não deve improvisar: a lista de
   contas e quem concede está em `acesso-e-segredos.md`.
6. **Segredos que o código novo exige já estão no Fly.** Compare os NOMES com
   `fly secrets list -a defesa-civil`. O `fly secrets list` mostra nome e
   resumo, nunca o valor. Variável nova e obrigatória sem estar no Fly faz a
   partida recusar (de propósito), e o release anterior segue atendendo. A
   matriz de variáveis por ambiente e o comparador automático dependem de
   V2-F01-E09.

## Passos

Tudo a partir de `dc360/`.

### 1. Anotar o ponto de volta

```bash
curl -sS https://defesa-civil.fly.dev/saude
fly releases -a defesa-civil
fly status -a defesa-civil
```

Anote (fora do repositório, sem segredo): o número do release atual, a
`ultimaMigracao` que o `/saude` devolve e a hora. É com isso que o
`rollback.md` (escrito pela V2-F01-E08) volta atrás.

### 2. Migrar, se faltar (passo 4 das pré-condições)

Siga `migracao.md`. **Migração antes do código**, sempre.

### 3. Implantar a API

```bash
fly deploy -a defesa-civil
```

O `fly.toml` já manda construir pelo `Dockerfile`, usa uma máquina e espera
até 30 segundos no encerramento (laudo em renderização). A verificação de
saúde chama o `/saude` a cada 15 segundos, e a partida recusa subir sem o
esquema em dia ou com configuração inválida, caso em que o deploy falha e o
release anterior continua atendendo. Com uma máquina só, a troca pode ter uma
interrupção curta: o aplicativo de campo segue trabalhando sem sinal
(`docs/INDISPONIBILIDADE.md`, seção 1), mas evite implantar com ocorrência em
andamento no painel e avise o plantão do município quando houver evento.

### 4. Implantar o console, se a entrega o tocou

Só se a migração for uma que o console lê (`apps/console/src/esquema.ts`) ou
se houve mudança em `apps/console/`:

```bash
fly deploy -c fly.console.toml --ha=false
```

O `-c fly.console.toml` não é opcional: sem ele o `fly` pega o `fly.toml` da API
e implanta a API por cima do console. Os segredos do console entram por
arquivo (`fly secrets import`), nunca por `fly secrets set` com aspas; ver
`docs/IMPLANTACAO.md`, seção 6.1.

### 5. Verificar a API e o console (seção abaixo) ANTES do painel

### 6. Painel web

Hoje o painel é publicado pela Vercel quando o PR entra na `master`. Por isso
**a entrada na `master` é o último passo**, depois de API e console conferidos:
o painel novo não pode chegar antes da API nova. Com o ruleset da `master`,
isso é o merge do PR por squash (push direto está bloqueado).

Conferir que a Vercel concluiu: `https://vercel.com` > projeto
`dc360-painel-web` > Deployments (o último precisa estar `Ready`). O painel de
PROD passar a usar um ramo `producao` atualizado só pela promoção depende de
V2-F01-E12.

### 7. Aplicativo de campo (só quando a entrega o tocou)

O aplicativo tem versão própria (`campo-vX.Y.Z`, `VERSAO` em
`apps/campo/app.config.ts`) e o `BUILD` é do EAS. De `apps/campo/`:

```bash
eas build --platform ios --profile producao
eas submit --platform ios --latest
eas build --platform android --profile producao
```

O perfil `producao` aponta para `https://defesa-civil.fly.dev`. O perfil de HML
(`homologacao`) hoje tem um endereço de exemplo e bundle id igual ao de
produção: o perfil de HML com bundle ids distintos depende de V2-F01-E13. A
entrada nas lojas (revisão, TestFlight, faixa interna) é assunto de
`docs/COLOCAR-DE-PE.md` e de `apps/campo/LOJAS.md`, e a automação do deploy do
aplicativo é da V2-F14-E11, não desta etapa.

## Verificação

Depois de cada peça implantada:

```bash
curl -sS https://defesa-civil.fly.dev/saude
fly status -a defesa-civil
fly logs -a defesa-civil
```

Precisa valer, para a API:

- `/saude` com `"status":"ok"` e `"banco":"ok"`;
- `ultimaMigracao` igual à última migração que a entrega espera (a lista está em
  `db/migrations/`);
- `fly status` mostra UMA máquina saudável (`min_machines_running = 1`);
- o log não mostra a partida recusando por esquema atrasado, por segredo
  ausente ou por configuração inválida (cada recusa nomeia a causa);
- com o push ligado, o `/saude` traz `push` com `rodadaEm` preenchido depois de
  uma rodada (`null` é push desligado; ver `docs/IMPLANTACAO.md`, seção 7.4).

Para o console:

```bash
curl -sS https://defesa-civil-console.fly.dev/saude
fly status -a defesa-civil-console
fly logs -a defesa-civil-console
```

O `/saude` do console só diz que o processo está de pé (não confere o banco);
procure no log a linha `console do fornecedor pronto`.

Para o painel: abrir `https://dc360-painel-web.vercel.app`, entrar com uma conta
e abrir a lista de ocorrências. Conta de verificação própria para PROD não está
definida (lacuna a decidir no CP-07 e na E11); sem ela, a verificação de
painel em PROD é só a tela de entrada carregar e o `/saude` da API responder.

Quem pode confirmar o que foi implantado, de fora, por commit: nada hoje.
Depende de V2-F01-E08 (`versao` e `commit` no `/saude`).

## Voltar atrás (rollback)

Não corrija em produção sob pressão. Volte ao release anterior:
**`rollback.md`** (escrito pela V2-F01-E08; depende de V2-F01-E08 para existir
no repositório). Se o problema for o esquema do banco, não é rollback de
imagem: siga a seção de volta de `migracao.md`.

Regra que vale aqui e em `docs/INDISPONIBILIDADE.md` (3.3): nunca `UPDATE` na
produção com a credencial de dono para contornar defeito.

## O que este runbook ainda não cobre

- Ensaio em HML: depende de V2-F01-E11.
- Deploy de HML por merge e promoção de PROD por tag: depende de V2-F01-E12.
- Versão e commit no `/saude`: depende de V2-F01-E08.
- Matriz de variáveis por ambiente: depende de V2-F01-E09.
- Perfil EAS de HML: depende de V2-F01-E13.
- Plantão, canal de alerta e SLA: F21-E06, F27-E02 e F28-E05 (bloqueados pelo
  CP-07).
