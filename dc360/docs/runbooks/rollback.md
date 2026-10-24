# Rollback: como voltar para a versão anterior

Para quem opera o DC360 e precisa desfazer uma entrega que deu errado, na ordem
em que a pessoa vai precisar. Escrito na V2-F01-E08.

**Estado deste roteiro: NÃO ENSAIADO.** Os comandos abaixo vêm da documentação
das ferramentas e do que o repositório já faz, e nenhum deles foi rodado contra
os aplicativos de produção para escrever este arquivo. A primeira vez que alguém
voltar uma versão de verdade, ou o ensaio da V2-F01-E16 (runbooks mínimos e
acesso da segunda pessoa), deve conferir cada passo e corrigir o que estiver
diferente. Até lá, leia o passo inteiro antes de executar o primeiro comando.

## 0. Antes de mexer em qualquer coisa

1. **Decida pelo sintoma, não pela pressa.** O que quebrou?
   - A API ou o console responde errado ou nem sobe: seção 1 ou 3.
   - O painel (a tela do município) está errado: seção 2.
   - O aplicativo de campo se comporta errado no aparelho: seção 4.
   - Dado errado ou sumido no banco: seção 5. **Não é rollback de código.**
2. **Anote a hora e a versão atual** (`/saude`, abaixo). Se o incidente for
   registrado depois, a linha do tempo precisa existir.
3. **Nunca `UPDATE` em produção com a credencial de dono do banco para contornar
   defeito.** Ela ignora o isolamento entre municípios. A regra está em
   `docs/INDISPONIBILIDADE.md`, seção 3.3, e vale mais que a pressa.
4. **Avise o município** antes de ele descobrir sozinho (`docs/INDISPONIBILIDADE.md`,
   seção 3.2).

## Como saber qual versão está no ar

`/saude`, da API e do console, é pública e responde `versao` e `commit` da imagem
que está de pé (carimbo gravado no build, `apps/api/src/versao-do-build.ts`):

```
curl -s https://defesa-civil.fly.dev/saude
```

A resposta traz `"versao": "0.1.0"` e `"commit": "<sha>"`. `desconhecida` e
`desconhecido` querem dizer que a imagem foi construída sem os argumentos de build
(veja o aviso abaixo). Imagens construídas antes da V2-F01-E08 nem têm os dois
campos.

**Aviso, enquanto a V2-F01-E12 (deploy por promoção) não existe:** o `fly deploy`
de hoje não passa os argumentos de build sozinho. Para a imagem sair carimbada, o
deploy manual é:

```
cd dc360
fly deploy -a defesa-civil \
  --build-arg DC360_VERSAO="$(node scripts/versao.mjs mostrar | awk '/^plataforma:/ {print $2}')" \
  --build-arg DC360_COMMIT="$(git rev-parse HEAD)"
```

Sem isso o deploy funciona, e `/saude` diz `desconhecida`. O rollback abaixo não
depende do carimbo; ele só serve para conferir de fora que a versão certa voltou.

## 1. API (Fly, aplicativo `defesa-civil`)

O Fly guarda cada entrega como uma *release* com a imagem que a gerou. Voltar é
publicar de novo a imagem da release anterior, **sem reconstruir** nada.

1. Veja as releases e as imagens:

   ```
   fly releases -a defesa-civil --image
   ```

   Cada linha tem o número da versão (`v123`), o estado e a referência da imagem
   (`registry.fly.io/defesa-civil:deployment-...`). Escolha a última que estava
   boa, normalmente a imediatamente anterior à entrega ruim.

2. Publique essa imagem, a partir da pasta `dc360` (onde mora o `fly.toml`):

   ```
   cd dc360
   fly deploy -a defesa-civil --image registry.fly.io/defesa-civil:deployment-XXXXXXXX
   ```

   **O que volta é a imagem, e não a configuração.** O `fly deploy --image` usa o
   `fly.toml` que está na pasta agora e os segredos atuais (`fly secrets list`).
   Se a entrega ruim mudou o `fly.toml` ou um segredo, desfaça isso também (o
   `git revert` do `fly.toml` e o `fly secrets set` com o valor anterior).

3. Confira de fora:

   ```
   fly status -a defesa-civil
   curl -s https://defesa-civil.fly.dev/saude
   ```

   `status` e `banco` devem ser `ok`, e `versao` e `commit` devem ser os da
   imagem que você escolheu. Se a imagem é de antes da V2-F01-E08, esses dois
   campos nem aparecem: confira pela hora da release em `fly releases`.

4. Se a máquina só está travada e o código não é o culpado, reiniciar basta e é
   mais barato: `fly machine restart -a defesa-civil` (veja `fly machines list`).

**O que faz o rollback da API ser seguro:** a API anterior continua funcionando
contra o banco que já recebeu a migração nova, porque a regra de migração em
produção é *aditiva ou compatível com a versão que está no ar*
(`docs/IMPLANTACAO.md`). Uma migração que apagou ou renomeou coluna quebra esta
garantia; nesse caso, não volte a API antes de ler a seção 5.

## 2. Painel web (Vercel, projeto `dc360-painel-web`)

O painel é estático e a Vercel guarda todo deploy anterior. Voltar é promover o
deploy anterior de volta para produção.

- **Pelo painel da Vercel:** projeto `dc360-painel-web`, aba *Deployments*, o último
  deploy de produção que estava bom, menu `...`, *Instant Rollback* (ou *Promote to
  Production*, conforme o plano). A troca é imediata e não reconstrói nada.
- **Pela linha de comando:** `vercel rollback` (volta ao deploy de produção
  anterior) ou `vercel promote <url-do-deploy>` (promove um deploy específico).

Dois cuidados:

1. Depois de um *Instant Rollback* a Vercel pode deixar de promover sozinha os
   próximos pushes na `master` para o domínio de produção, até alguém promover um
   deploy à mão. Confirme isso no painel da Vercel e promova o deploy corrigido
   quando ele existir; não confie em que o `git push` volta a publicar.
2. O painel antigo fala com a API **de hoje**. O endereço da API (`VITE_API_URL`) é
   gravado no build (`vercel.json`), então o painel antigo e a API nova precisam
   continuar se entendendo. Se a entrega ruim mudou o contrato entre os dois, volte
   as duas pontas, API primeiro (seção 1), e depois o painel.

Conferir: abra `https://dc360-painel-web.vercel.app`, entre com uma conta de teste
e veja o que estava quebrado. A Vercel mostra qual deploy está em produção na
aba *Deployments*.

## 3. Console do fornecedor (Fly, aplicativo `defesa-civil-console`)

É o mesmo procedimento da API, com o outro aplicativo e o outro arquivo de
configuração:

```
fly releases -a defesa-civil-console --image
cd dc360
fly deploy -c fly.console.toml -a defesa-civil-console --image registry.fly.io/defesa-civil-console:deployment-XXXXXXXX
```

Conferir: `curl -s https://defesa-civil-console.fly.dev/saude` responde
`"ok": true` e a `versao` e o `commit` esperados. O console não tem acesso à
`DATABASE_URL` do produto, então voltar o console nunca mexe no dado de município.

## 4. Aplicativo de campo (EAS, Play Console, App Store Connect)

**O binário que já está no aparelho não volta.** Ninguém consegue desinstalar uma
versão ruim do celular do agente. O que dá para fazer, em ordem:

1. **Parar a distribuição da versão ruim.** No Play Console, pause ou interrompa o
   lançamento gradual; no App Store Connect, retire a versão do teste (TestFlight)
   ou da venda, conforme onde ela estiver. Isto impede novos aparelhos de
   receberem a versão ruim.
2. **Publicar uma build nova com o código bom.** O perfil `producao` do
   `apps/campo/eas.json` tem `autoIncrement` e `appVersionSource: remote`, então o
   número de build sobe sozinho:

   ```
   cd dc360/apps/campo
   eas build --profile producao --platform all
   eas submit --profile producao --platform all
   ```

   O código bom é o do commit da última versão estável (volte o código com
   `git revert` da entrega ruim, num PR; não reescreva histórico). Revisão da
   loja leva de horas a dias: este é o caminho **lento**.
3. **Proteger o aparelho pela API enquanto isso.** A API precisa continuar aceitando
   a sincronização das versões antigas do aplicativo (a fila de campo funciona
   offline e reenvia depois). Se a versão ruim do aplicativo manda dado errado,
   a correção rápida é do lado do servidor (seção 1), nunca do banco à mão.

O aplicativo ainda **não usa atualização remota (OTA)**; ela depende da decisão
CP-24 e entra na F14. Quando existir, este passo ganha o caminho rápido
(`eas update` voltando o canal para a atualização anterior) e este arquivo deve ser
atualizado.

## 5. Banco de dados

**Não existe rollback automático de migração em produção.** A defesa é anterior:

- Migração só entra em produção se for **aditiva ou compatível** com a versão da API
  que está no ar. É por isso que voltar a API (seção 1) é seguro: o esquema novo
  tem coluna a mais, e a API antiga a ignora.
- O roteiro `scripts/migrar-producao.mjs --ambiente prod --aplicar` **recusa** aplicar
  sem uma cópia feita por `scripts/copiar-producao.mjs --ambiente prod` nos últimos
  trinta minutos. A cópia é o ponto de volta. (Os roteiros rodam em Windows, Linux
  e macOS desde a V2-F01-E15.)
- O desfazer de migração escrito pela V2-F01-E18 serve **fora de produção**
  (desenvolvimento e HML). Em produção ele não é usado.

Se o problema é **dado** (perda, corrupção, apagado por engano), e não código:

1. Pare de escrever por cima: se for o caso, tire o aplicativo do ar
   (`fly scale count 0 -a defesa-civil`, e `fly scale count 1` para religar; confira
   o `min_machines_running` do `fly.toml` depois).
2. **A decisão de restaurar é do município**, porque restaurar significa perder
   tudo o que entrou depois do ponto de restauração
   (`docs/INDISPONIBILIDADE.md`, seção 3.4).
3. O procedimento de restauração está em `docs/RESTORE-DO-BANCO.md` e foi provado
   em 09/09/2026 (`docs/COLOCAR-DE-PE.md`, Parte 6). Restaure **primeiro numa cópia
   separada** e confira antes de apontar a produção para ela.
4. Registre o incidente: quem fez, o que rodou e por quê.

## 6. Depois de voltar

- [ ] `/saude` da API e do console com `status` e `banco` `ok` e a `versao` esperada.
- [ ] O painel abre e uma conta de teste entra.
- [ ] Um agente de campo consegue sincronizar uma ocorrência de teste.
- [ ] O município foi avisado de que voltou, e o que ficou de fora.
- [ ] O defeito virou item de correção, com teste que o teria pego, e a entrega
      ruim só volta por PR com o CI inteiro verde.
