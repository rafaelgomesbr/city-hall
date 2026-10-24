# Roteiro de implantação e treinamento

- **Versão:** 2, de 15/09/2026 (a seção 6, do console do fornecedor, é nova)

O produto pode estar certo e a implantação fracassar, e o motivo quase nunca é
técnico: é o agente que não confia no aplicativo depois que ele engoliu uma
vistoria, e é o coordenador que volta para a planilha porque a planilha ele já
sabe usar.

Este roteiro é escrito contra esses dois riscos.

---

> **Runbooks de operação (rascunho, V2-F01-E16):** implantar, migrar, girar
> segredo e conceder acesso têm texto próprio, um por operação, em
> `docs/runbooks/`. As seções 6 a 8 abaixo continuam sendo a fonte dos
> comandos; os runbooks organizam o mesmo conteúdo em pré-condições, passos,
> verificação e volta atrás.

## 1. Antes de qualquer tela

Nada disto é software, e tudo isto trava a implantação se ficar para depois.

| O que | Quem decide | Sem isso |
| --- | --- | --- |
| Os três prazos de retenção da seção 4 da política de privacidade | Município | A minimização não tem número para executar |
| Encarregado de dados do município | Município | O cidadão não tem a quem pedir seus direitos |
| Aceitar ou recusar o envio de coordenada ao Google, no mapa | Município | O mapa não pode ser ligado |
| Quem é o administrador do município | Município | Não há a quem entregar o primeiro acesso |
| Equipes, e quem está em cada uma | Município | Despacho não tem para quem despachar |
| Concordar com os prazos por severidade do sistema (72, 48, 24 e 4 horas; hoje não há tela para o município mudá-los) | Município | O relógio de atraso não teria o aval de quem responde por ele |
| Lista de órgãos para acionamento | Município | O checklist trava justamente sem sinal |
| Aparelhos: quantos, de quem, iOS ou Android | Município | Não dá para preparar a instalação |

**Reunião única, com o coordenador e o administrador na sala, e uma ata.** Cada
linha acima vira uma decisão registrada. Implantação que começa com "isso a
gente resolve depois" chega no primeiro temporal com isso não resolvido.

---

## 2. Sequência

| Etapa | O que acontece | Duração |
| --- | --- | --- |
| 1 | Provisionamento do município e do primeiro administrador, por linha de comando ou pela tela "Cadastrar prefeitura" do console do fornecedor (nunca pelo painel do município). A senha inicial é impressa **uma vez** e entregue em mãos | 1 hora |
| 2 | O administrador cria equipes e usuários. Cada um troca a senha no primeiro acesso | 2 horas |
| 3 | Cadastro da lista de órgãos (os prazos por severidade são os do sistema, não se cadastram) | 1 hora |
| 4 | Instalação do aplicativo nos aparelhos, e primeiro acesso de cada agente **com sinal**, para baixar a lista | 30 minutos por aparelho |
| 5 | **Operação assistida:** duas semanas com os dois sistemas em paralelo, o novo e o que existia | 2 semanas |
| 6 | Corte, com o antigo em modo de leitura por mais 30 dias | 1 dia |

A etapa 5 é a que não se corta. Ela existe para que o primeiro defeito real seja
descoberto **com rede de segurança**, e não com uma família esperando vistoria.

---

## 3. Treinamento por perfil

O treinamento é curto de propósito. Treinamento longo em prefeitura não é
assistido: o pessoal é chamado no meio.

### 3.1 Agente de campo, 40 minutos, no aparelho dele

O agente aprende sete coisas, nesta ordem, fazendo:

1. Entrar, e **baixar a lista antes de subir o morro**. Esta é a lição número
   um: o que não foi baixado não existe lá em cima.
2. Abrir uma tarefa e ler o cabeçalho: endereço, referência, relato, prazo.
3. **Abrir no aplicativo de mapas** para chegar no imóvel.
4. Preencher a vistoria: checklist, fotografia, contagem de pessoas.
5. **Colher a assinatura** de quem estava no local, e por que ela importa: é a
   prova de que a pessoa foi cientificada.
6. Concluir **sem sinal**, e ver o item entrar na fila. Depois ligar o sinal e
   ver a fila esvaziar.
7. "Salvar e sair" no meio de uma vistoria, e voltar depois, para saber que o
   trabalho não se perde.

**O exercício 6 é o coração do treinamento e é feito com o modo avião ligado, de
verdade.** O agente precisa ver com os próprios olhos que a vistoria não sumiu.
Quem não vê isso não confia, e quem não confia anota no papel "por garantia", e
aí existem dois sistemas.

Ele também sai sabendo três coisas que evitam chamado de suporte:

- Tarefa que sumiu da lista tem explicação (concluída, encerrada, devolvida ou
  passou para outra equipe), mas o aplicativo ainda não a mostra: o servidor
  devolve o desfecho (e o motivo, quando há) e a tela do aplicativo não os lê. O agente aprende a perguntar
  à coordenação, com o protocolo.
- Ocorrência já coletada neste aparelho mostra aviso, e refazer é ato
  deliberado.
- Espera que passa de seis segundos avisa e oferece saída.

### 3.2 Operador de plantão, 30 minutos

1. Registrar chamado com a pessoa na linha, sem travar na conversa.
2. Reconhecer **duplicidade**: o sistema avisa quando já existe ocorrência no
   mesmo endereço, e o operador decide se é a mesma.
3. Preencher vulnerabilidade social quando houver, e **por que ela muda a
   prioridade**.
4. O que fazer quando falta informação: registrar com o que tem, porque
   protocolo aberto vale mais que formulário perfeito.

### 3.3 Coordenador, 1 hora

1. Painel: o que cada número significa, e o que é "atrasada".
2. Triagem: classificar tipo pela COBRADE e severidade, e o efeito no prazo.
3. Despachar para equipe, e acompanhar.
4. Ler o laudo que voltou e decidir: providência, interdição, encerramento.
5. **Encerrar com motivo**, e por que não existe apagar.
6. Emitir laudo e termo, imprimir, assinar.
7. Trilha de auditoria: onde ver quem fez o quê. É o que protege o próprio
   coordenador quando o ato for questionado.

### 3.4 Administrador, 30 minutos, além do treinamento de coordenador

1. Criar, desativar e trocar papel de usuário, e o limite: ninguém administra
   posto acima do seu.
2. Redefinir a senha de quem esqueceu, e que isso **derruba as sessões** da
   pessoa.
3. Alterar dados do órgão.
4. O que **não** dá para fazer pela tela, e por quê: provisionar município e
   apagar registro.

---

## 4. O que entregar por escrito

| Peça | Para quem | Estado |
| --- | --- | --- |
| Cartão de bolso do agente, uma página, plastificado | Agente | `CARTAO-DO-AGENTE.md` |
| Guia do coordenador | Coordenador | `GUIA-DO-COORDENADOR.md` |
| Política de privacidade | Município | `PRIVACIDADE.md`, com campos a preencher |
| Lista de subprocessadores | Município | `SUBPROCESSADORES.md` |
| Procedimento de indisponibilidade e contatos | Município | `INDISPONIBILIDADE.md` |
| Plano de saída | Município | `SAIDA-DE-MUNICIPIO.md` |
| Ata das decisões da seção 1 | Ambos | Feita na reunião |

O cartão de bolso do agente é o item de maior retorno da lista e o mais barato
de fazer: uma página, os sete passos da seção 3.1, e a frase "baixe a lista
antes de subir". Escrito em `CARTAO-DO-AGENTE.md`; falta a diagramação para
impressão e os contatos de suporte.

---

## 5. Como saber se deu certo

Medido na terceira semana, já depois do corte:

| Sinal | Meta | O que significa se falhar |
| --- | --- | --- |
| Vistorias registradas no sistema, sobre o total atendido | Acima de 90% | Existem dois sistemas, e o de papel venceu |
| Vistorias com assinatura coletada | Acima de 80% | O passo é ignorado, e os laudos saem sem ciência |
| Vistorias com fotografia | Acima de 95% | A prova técnica não está sendo feita |
| Chamados de suporte por semana | Abaixo de 5 | O treinamento não pegou, ou há defeito real |
| Ocorrências encerradas sem motivo útil | Zero | O campo virou formalidade, e a trilha perdeu valor |

**Esses números precisam sair do próprio sistema**, e não de pergunta ao
coordenador. Hoje eles saem de consulta ao banco. É exatamente para isso que
serve a tabela de métricas da ADR 0008.

---

## 6. Colocar o console do fornecedor no ar

As cinco seções acima são sobre implantar num MUNICÍPIO. Esta é sobre a
infraestrutura do FORNECEDOR, e ela acontece uma vez, antes do primeiro
município: o console da ADR 0008 é o que responde "o município está usando?" sem
ninguém abrir `psql` na produção com a credencial de dono.

O console é **aplicativo próprio no Fly**, separado da API, porque a decisão 1
da ADR 0008 pede outro processo com outro segredo e outra conexão. Dois
processos no mesmo aplicativo do Fly compartilhariam a mesma lista de segredos.

Arquivos que mandam aqui: `dc360/Dockerfile.console` e `dc360/fly.console.toml`.

Desde a V2-F01-E09 o `[env]` do `fly.console.toml` carrega também
`AMBIENTE_DC360` e `CONSOLE_IDENTIDADE_DO_BANCO`, e a partida recusa subir sem
elas: a `CONSOLE_DATABASE_URL` precisa trazer a identidade (a referência do
projeto do banco) no usuário ou no host. A API tem as suas (`fly.toml`). A
explicação, a lista do que a partida recusa e o conferidor dos segredos estão em
`docs/AMBIENTES.md`; rode `node scripts/conferir-ambiente.mjs --ambiente=prod
--app=console` antes do deploy.

### 6.1 A armadilha das aspas, antes de qualquer comando

Esta é a única parte deste documento que precisa ser lida antes de ser
executada, porque o erro que ela descreve **não dá erro**.

```bash
fly secrets set CONSOLE_OPERADORES="[...]"     # NÃO faça isto
```

Com aspas duplas, quem lê o valor primeiro é o **shell**, e ele expande
`$131072`, `$8` e `$1` do hash de senha (formato `scrypt$N$r$p$sal$hash`) para
string vazia, antes de o `fly` receber qualquer coisa. O que sobe para o
provedor é `scrypt$$$sal$hash`. E aí:

- o JSON continua válido, porque só mudou o conteúdo de um campo de texto;
- o esquema da variável continua passando, porque `senha` só precisava ser texto;
- o envelope do segundo fator continua abrindo, porque ele é base64 e não tem `$`;
- **o processo sobe normal**, atende, e mostra a tela de entrada;
- a senha certa é recusada para sempre, sem uma linha de log.

`CONSOLE_JWT_SEGREDO` e `CONSOLE_SEGUNDO_FATOR_CHAVE` correm risco parecido, por
serem base64 com `+`, `/` e `=`.

**As duas defesas, e as duas estão em vigor:**

1. O roteiro abaixo põe os segredos num **arquivo** e usa `fly secrets import`,
   que lê linha a linha sem shell no meio.
2. Desde 15/09/2026 a partida **recusa** hash que não tenha as seis partes do
   formato, dizendo que a causa provável foram as aspas. Um deploy feito pelo
   caminho errado falha, e o release anterior continua atendendo.

### 6.2 O passo que falta no banco, e que não está em nenhum outro roteiro

`dc360_console` foi criado **NOLOGIN** na migração 023, de propósito. Ele não
serve de usuário de string de conexão: é o papel de privilégio, não o de
entrada. A `CONSOLE_DATABASE_URL` aponta para **outro** papel, com LOGIN, membro
dele. É o mesmo desenho de `dc360_api` para `dc360_app`.

```sql
CREATE ROLE dc360_console_login LOGIN PASSWORD 'SENHA-SORTEADA' NOSUPERUSER;
GRANT dc360_console TO dc360_console_login WITH SET TRUE;
```

O `WITH SET TRUE` não é enfeite: toda transação do console emite
`SET LOCAL ROLE dc360_console` (ver `apps/console/src/banco.ts`), e sem ele o
`SET ROLE` é recusado e **toda** consulta falha.

Rode isto com o papel de setup (no Supabase, o usuário `postgres` da conexão
direta), que é o mesmo usado para migrar.

### 6.3 O roteiro, na ordem

Tudo a partir de `dc360/`.

**Passo 1. Conferir o esquema.** O console recusa subir contra um banco que não
tenha o que ele usa, e o mínimo hoje é a migração 039: a 038 cria a tabela
`console_operadores` (onde vivem as contas de quem entra no console) e as
quatro funções de suspender, reativar, agendar e cancelar a eliminação de um
município; a 039 cria `console_codigos_de_recuperacao` e as três funções da
recuperação de senha. Sem elas a partida diz, pelo nome, o que falta.

```bash
node scripts/migrar-producao.mjs            # só confere, não aplica
node scripts/copiar-producao.mjs            # a cópia, antes de aplicar (seção 8)
node scripts/migrar-producao.mjs --aplicar  # só se faltar alguma; recusa sem cópia recente
```

**Passo 2. Criar o papel de login** (seção 6.2), com o papel de setup.

**Passo 3. Provar a conexão antes de ela virar segredo.** Este passo existe para
o erro aparecer aqui, e não dentro de um contêiner que não sobe.

```bash
CA="$(pwd)/db/provedores/supabase-prod-ca-2021.crt"
psql "postgresql://dc360_console_login.bppklrxxwjshxvkvwirw:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=${CA}" \
  -c "SET ROLE dc360_console; SELECT count(*) FROM console_situacao_dos_municipios;"
```

Três detalhes que fazem esta linha funcionar ou não:

- **Pelo pooler, o papel leva o projeto colado** (`dc360_console_login.bppklrxxwjshxvkvwirw`).
  É exigência do provedor, e é assim que ele sabe para qual banco encaminhar.
  O papel de verdade continua sendo `dc360_console_login`.
- **Porta 5432, modo sessão.** 6543 é modo transação, onde a conexão volta para
  o bolo ao fim de cada transação.
- **`sslmode=verify-full`**, sem exceção: sem verificação do certificado a
  conexão com o banco de **todos** os municípios sobe cifrada e não autenticada,
  e o SCRAM não acusa nada, porque o intermediário só retransmite o desafio.

Se o `SET ROLE` falhar, o que falta é o `WITH SET TRUE` do passo 2. Se o
`SELECT` falhar com permissão negada, o que falta é o `GRANT` do passo 2.

**Passo 4. Abrir o arquivo de segredos e gerar as duas chaves.**

O arquivo vem ANTES do operador, e a ordem é o ponto: assim a chave do segundo
fator nunca aparece numa linha de comando, e portanto nunca entra no histórico
do terminal.

```bash
node -e "console.log('CONSOLE_JWT_SEGREDO=' + require('node:crypto').randomBytes(48).toString('base64url'))"
node -e "console.log('CONSOLE_SEGUNDO_FATOR_CHAVE=' + require('node:crypto').randomBytes(32).toString('base64'))"

nano segredos-do-console.env      # cole as duas linhas acima e as outras duas
chmod 600 segredos-do-console.env
```

Use um **editor**, e não `echo` nem heredoc: o conteúdo de um heredoc entra no
histórico do shell, em texto puro, para sempre. Uma variável por linha, sem
aspas em volta do valor:

```
NODE_ENV=production
CONSOLE_DATABASE_URL=postgresql://dc360_console_login.bppklrxxwjshxvkvwirw:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full
CONSOLE_JWT_SEGREDO=...
CONSOLE_SEGUNDO_FATOR_CHAVE=...
CONSOLE_OPERADORES=
```

`CONSOLE_JWT_SEGREDO` precisa ser **diferente** do `JWT_SEGREDO` da API. A
separação de verdade é a plateia do token (`aud=dc360-console`), que recusa o
token do produto mesmo com os dois segredos iguais, mas dois valores iguais em
dois aplicativos são uma convenção que ninguém consegue conferir depois.

`CONSOLE_OPERADORES` fica vazia por enquanto: ela é o passo 5.

**Passo 5. Criar a semente do dono, com a chave lida do arquivo.**

Desde a migração 038 os operadores do console vivem no **banco**, na tabela
`console_operadores`, e não mais na configuração. `CONSOLE_OPERADORES` virou a
**semente do dono**: a partida lê a variável UMA vez, quando a tabela está
vazia, grava a linha como `dono` pelo próprio papel do console (a policy da 038
tem um ramo para isso, que fecha na primeira linha), e avisa no log. Depois
disso a variável é ignorada, com aviso, e pode sair da configuração.

```bash
CONSOLE_SEGUNDO_FATOR_CHAVE="$(sed -n 's/^CONSOLE_SEGUNDO_FATOR_CHAVE=//p' segredos-do-console.env)" \
  npm run provisionar --workspace @dc360/console -- --email pessoa@fornecedor.com.br
```

A chave sai do arquivo e volta para o processo sem passar pela linha digitada, e
ela precisa ser a **mesma** com que o console vai subir: o envelope do segundo
fator do dono é conferido na partida contra a linha do banco, e com a chave
trocada o processo não sobe.

O comando imprime a senha sorteada, o segredo do segundo fator (para ler no
aplicativo de autenticação) e a linha `CONSOLE_OPERADORES` pronta. **Nada disso
fica guardado em lugar nenhum**, e a senha não aparece de novo. Copie a linha
`CONSOLE_OPERADORES` para dentro do arquivo, com o editor, configure o
aplicativo de autenticação, e só então feche o terminal.

**Exatamente uma linha**, a do dono. Os demais operadores são criados pelo
dono, depois de entrar, na tela **Usuários** do console: a tela sorteia senha e
segredo do segundo fator, mostra os dois uma vez (com o código QR desenhado
pelo próprio processo), e grava a conta com quem a criou. Operador se desativa
pela mesma tela, e não se apaga. Cada operador, inclusive o dono, troca a
própria senha na tela **Minha senha**, com a senha atual e um código novo do
aplicativo; trocar a senha derruba as outras sessões daquela conta.

**Na primeira entrada do dono, gere os códigos de recuperação.** A semente não
traz nenhum: na tela **Minha senha**, com a senha e um código novo do
aplicativo, o botão "Gerar códigos de recuperação" mostra oito códigos UMA vez.
Guarde-os fora do computador. São a única saída do dono no dia em que a senha
se for junto com o telefone (seção 6.4), e cada operador criado pela tela
recebe os dele junto com a senha inicial.

Desde 15/09/2026 o console **cobra isso sozinho**, enquanto for verdade: a
partida escreve uma linha de `warn` no log ("operador X é dono e não tem
códigos de recuperação; gere em Minha senha", sem segredo nenhum), e a primeira
tela depois da entrada mostra o mesmo aviso, com o botão que leva a Minha
senha. Os dois somem no instante em que o lote é gerado. Se o aviso continuar
aparecendo em `fly logs` depois da primeira semana, ninguém gerou.

**Quem já tem console no ar** (um operador em `CONSOLE_OPERADORES` de antes da
038) não precisa rodar nada: no primeiro deploy com a 038 a tabela está vazia,
a linha da variável é importada como dono, com a mesma senha e o mesmo segundo
fator de sempre, e o log diz "dono do console semeado". Na implantação seguinte,
tire a variável do arquivo de segredos (`fly secrets unset CONSOLE_OPERADORES`).

**Passo 6. Criar o aplicativo, mandar os segredos, implantar.**

```bash
fly apps create defesa-civil-console
fly secrets import -a defesa-civil-console < segredos-do-console.env
fly deploy -c fly.console.toml --ha=false
```

Duas coisas que não são opcionais nessa sequência:

- **`-c fly.console.toml`**, senão o `fly` pega o `fly.toml` da API e implanta a
  API por cima do console.
- **`--ha=false`** continua sendo o recomendado, por economia: um punhado de
  pessoas do fornecedor olhando números não paga duas máquinas. Mas deixou de
  ser exigência de segurança: desde a 038 o teto de tentativas do segundo fator
  e o passo do TOTP já queimado vivem na **linha do operador no banco**, e não
  na memória do processo, então duas máquinas contam as mesmas cinco
  tentativas e recusam o mesmo código já usado.

**Passo 7. Conferir que subiu de verdade.**

```bash
fly status -a defesa-civil-console      # precisa mostrar UMA máquina
fly logs  -a defesa-civil-console       # procure "console do fornecedor pronto"
curl -sS https://defesa-civil-console.fly.dev/saude
```

Se o processo não subir, o log diz qual das recusas foi: `CONSOLE_HOST` de
loopback, hash de senha estragado pelo shell, banco sem o que o console usa
(migração 038 ou 039 faltando), tabela de operadores vazia sem `CONSOLE_OPERADORES`
para semear, ou envelope do segundo fator do dono que não abre com a chave
atual. Todas são de propósito, e todas nomeiam a causa.

Na primeira partida com a 038, procure também `dono do console semeado`: é a
linha que diz que a variável foi consumida e pode sair da configuração.

**Passo 8. Apagar o arquivo de segredos.**

```bash
rm -f segredos-do-console.env
```

### 6.4 O que fica declarado como NÃO coberto

- **O `/saude` do console só diz que o processo está de pé.** Ele não confere o
  banco, ao contrário do `/saude` da API. Banco ausente ou esquema atrasado na
  partida derrubam o processo e o release é revertido; banco que cai **depois**
  de o processo estar de pé mantém a verificação verde e dá erro na tela.
- **O limite por endereço conta todo mundo junto.** O servidor do console não
  declara de quem aceita cabeçalho de origem (não existe ali o `PROXY_DE_BORDA`
  que a API tem), então atrás do Fly o endereço visto é o do balanceador, e as
  20 tentativas de entrada por 5 minutos são compartilhadas por todos os
  operadores. É restritivo, não permissivo, mas pode barrar quem tem direito de
  entrar num momento ruim.
- **A recuperação de senha é por código de recuperação, e só por ele.** Não há
  provedor de email no console, e ninguém acima do dono redefine a senha dele.
  O caminho é: cada operador, inclusive o dono, gera oito códigos em **Minha
  senha** (com a senha atual e um código novo do aplicativo), guarda fora do
  computador, e no dia em que a senha se for usa um deles em **Esqueci a
  senha**, na porta. **Usar um código redefine a senha E troca o segundo
  fator**, mostrando o QR novo na hora: a recuperação existe para o dia em que
  o telefone foi perdido junto com a senha, e nesse dia o autenticador antigo
  é inútil ou está com outra pessoa. Cada código vale uma vez; os outros
  continuam valendo; gerar de novo invalida os anteriores. A rota está sob o
  mesmo limite por endereço da porta, e o cálculo de por que isso basta está
  em `apps/console/src/recuperacao.ts`.
  O que fica declarado como NÃO coberto: **quem nunca gerou os códigos, ou
  perdeu o papel, não tem recuperação pela tela.** Operador nessa situação é
  atendido pelo dono (desativa a conta e cria outra, que nasce com códigos
  novos). O dono nessa situação precisa da credencial de dono do banco para
  corrigir a linha em `console_operadores`, e esse continua sendo o último
  recurso, e o único: por isso o passo 5 manda gerar os códigos na primeira
  entrada, e por isso a partida e a tela avisam enquanto o dono não tiver
  nenhum (passo 5). O aviso não cobre o papel perdido: código gerado e
  perdido é, para o console, código que existe.
- **As duas ações perigosas por município (desativar o acesso e eliminar com
  prazo de sete dias) são só do dono**, e o apagamento em si é do relógio da
  API, não do console: o console suspende e agenda, e o que vence sem ser
  cancelado é executado pelo processo da API. Um console fora do ar não atrasa
  nem adianta um apagamento.

---

## 7. Ligar o push

O aviso no telefone do agente (tarefa nova no despacho, prazo vencendo) sai
direto do servidor para a Apple e para o Google, sem intermediário. O código
está pronto e coberto por teste com dublês; o que falta é a credencial da
Apple no Fly. Esta seção é o passo a passo, e depois dele o roteiro de prova,
porque **a única evidência de que o push funciona é uma notificação aparecendo
num telefone que está no bolso de outra pessoa**.

O que já está versionado em `fly.toml` e NÃO é segredo: `APNS_AMBIENTE`
(o padrão de quem registra sem dizer o ambiente) e `APNS_BUNDLE` (o
identificador do aplicativo, que vira o `apns-topic`). O que é segredo e vai
por `fly secrets`: `APNS_KEY_ID`, `APNS_TEAM_ID` e `APNS_CHAVE`.

### 7.1 O que pegar no portal da Apple

Em **Certificates, Identifiers & Profiles**, **Keys**, crie uma chave com
**Apple Push Notifications service (APNs)** marcado. A Apple entrega **uma vez**
o arquivo `AuthKey_XXXXXXXXXX.p8`; os dez caracteres no nome são o
`APNS_KEY_ID`. O `APNS_TEAM_ID` está no canto superior direito do portal
(Membership details).

Essa chave assina notificação para **qualquer** aplicativo do time, e não só
para este. Quem a obtém escreve na tela bloqueada de um agente de Defesa Civil.
Ela não entra no repositório, não entra na imagem, não vai por email.

### 7.2 O comando de um passo só

A partir da pasta onde o `.p8` foi salvo:

```bash
fly secrets set -a defesa-civil \
  APNS_KEY_ID=XXXXXXXXXX \
  APNS_TEAM_ID=YYYYYYYYYY \
  APNS_CHAVE="$(cat AuthKey_XXXXXXXXXX.p8)"
```

`APNS_CHAVE` é o **conteúdo** do arquivo, com as linhas `BEGIN PRIVATE KEY` e
`END PRIVATE KEY`, e não o caminho: dentro do contêiner não existe caminho
nenhum para ele (`apps/campo` está no `.dockerignore`, de propósito). As aspas
duplas são seguras **aqui**, ao contrário da armadilha da seção 6.1: o PEM é
base64 entre duas linhas de cabeçalho e não tem `$`, então o shell não expande
nada. A quebra de linha dentro do valor é preservada pelo `fly secrets set`.

Depois, e só depois, em `fly.toml`, descomente a linha `PUSH_ATIVO = "sim"` e
faça `fly deploy`. A ordem importa: com `PUSH_ATIVO=sim` e sem as três
variáveis a partida **cai**, de propósito, e o release anterior continua no
ar. Se a chave estiver colada pela metade, a partida também cai, com a mensagem
`A chave de push da Apple (APNS_CHAVE) não é uma chave ES256 válida`, sem citar
o material. Confira o log com `fly logs -a defesa-civil`: a linha que se quer
ver é `varredura de avisos ligada: primeira rodada agora, depois a cada
intervalo e a cada despacho`.

Android fica para depois: sem `FCM_CONTA_SERVICO` o servidor **recusa** registrar
aparelho Android (503 `push_android_desligado`) em vez de guardar um destino que
nunca receberia nada. O aplicativo entende essa recusa e fica quieto.

### 7.3 A migração que este passo exige

A coluna `aparelhos.ambiente` (migração 044) precisa estar aplicada antes do
deploy com `PUSH_ATIVO=sim`; a API recusa subir com esquema atrasado e diz qual
migração falta. Se já existirem aparelhos registrados de um piloto anterior
feito com o binário do Xcode, informe o ambiente em que eles estavam ao migrar,
para as linhas existentes receberem o valor certo:

```bash
APNS_AMBIENTE=teste node scripts/migrar-producao.mjs --aplicar
```

Sem a variável, as linhas existentes ficam `producao`. Vale pouco na prática,
porque o aplicativo registra a ficha de novo a cada abertura, agora dizendo o
próprio ambiente, e a linha se corrige sozinha na primeira abertura depois do
deploy.

### 7.4 Roteiro de prova

Precisa de dois telefones, ou de um telefone e a paciência de trocar de conta.
O agente com o aplicativo instalado, logado, com a permissão de notificação
concedida (ele viu a folha "Quer ser avisado de tarefa nova?" e tocou em
"Ligar os avisos"), e **de equipe**: o aviso sai para a equipe despachada.

1. No painel, abra uma ocorrência, faça a triagem e **despache** para a equipe
   do agente.
2. O log do servidor mostra `despacho enfileirou o aviso de tarefa nova` com
   `aparelhos: N`. **Se N for zero**, a equipe não tem aparelho registrado: o
   agente não está na equipe, não concedeu a permissão, ou entrou antes de o
   push ser ligado (a rota respondia 503 e o aplicativo ficou quieto; ele tenta
   de novo na primeira volta do segundo plano depois de cinco minutos, ou
   feche e abra o aplicativo).
3. Segundos depois (o despacho acorda o varredor; não espera mais o relógio de
   cinco minutos), o telefone toca com o som de despacho e a vitrine "Nova
   tarefa". Tocar abre a vistoria.
4. `GET /saude` mostra `push.entregues` maior que zero. Com o push desligado
   `push` é `null`; ligado e sem rodada ainda, `rodadaEm` é `null`.

Se o telefone não tocar, a resposta está em um de dois lugares: a coluna
`detalhe` de `notificacoes_enviadas` (o suporte lê pelo id da linha) e o log do
varredor (`varredura de avisos terminou com falha de envio`, com os motivos
agregados e sem ficha). O que cada motivo significa:

| O que aparece | O que é | O que fazer |
| --- | --- | --- |
| `apns 400 BadDeviceToken` | A ficha é de um ambiente e o servidor falou com o outro. O varredor **revogou** o aparelho. | O aplicativo diz o ambiente no registro (migração 044). Se aparecer, o binário instalado é anterior ao campo: abra o aplicativo de novo depois de atualizar, ou ajuste `APNS_AMBIENTE` para o binário em uso (`teste` para Xcode, `producao` para TestFlight e loja). |
| `apns 403 InvalidProviderToken` | `APNS_KEY_ID`, `APNS_TEAM_ID` ou `APNS_CHAVE` não casam entre si. | Confira os três no portal. A chave pode ter sido revogada lá. |
| `apns 400 TopicDisallowed` ou `MissingTopic` | `APNS_BUNDLE` não é o bundle do aplicativo, ou a chave não tem APNs habilitado. | `APNS_BUNDLE` precisa ser `com.solerte.dc360.campo` (`ios.bundleIdentifier` em `apps/campo/app.config.ts`). |
| `apns 410 Unregistered` | O aplicativo foi desinstalado deste telefone. O aparelho foi revogado, e é isso mesmo. | Nada. Reinstalar registra ficha nova. |
| Linha `pendente` para sempre, sem `detalhe` | A rodada não reivindicou a linha: o usuário saiu da equipe, foi desativado, a equipe perdeu a tarefa ou a ocorrência encerrou antes da rodada. | Confira a equipe do agente e da ocorrência. A regra está na migração 042. |
| `entregue` e nada na tela | A Apple aceitou. Ou a permissão foi retirada nos ajustes do telefone, ou o aparelho está logado em **outro município** e descartou o aviso em silêncio (a terceira barreira, `apps/campo/src/push/aviso.ts`). | "Minha conta" no aplicativo mostra o estado da permissão. Confira em qual prefeitura o agente está logado. |
| `provedor de ios (teste) nao esta configurado` | Não acontece em produção: os dois provedores da Apple sobem juntos. Se aparecer, é servidor montado à mão com um provedor só. | Ver `apps/api/src/index.ts`. |
| `a APNs nao respondeu no tempo limite` | Rede entre o Fly e a Apple. | A linha volta a ser tentada depois de dez minutos, até cinco vezes. Se persistir, é rede. |

### 7.5 O que fica declarado como NÃO coberto

- **O binário do Xcode e o do TestFlight convivem, mas o de `homologacao` em
  `eas.json` é `distribution: internal` (ad hoc)**, e o `aps-environment` que o
  `app.config.ts` escreve para ele é `development`, pela regra "só o perfil
  `producao` é produção". Se a Apple assinar esse build com perfil ad hoc de
  produção, a ficha será de produção e o aplicativo dirá `teste`. Ninguém
  distribui por `homologacao` hoje; no dia em que distribuir, a regra do
  `PERFIL_DE_PRODUCAO` em `app.config.ts` precisa incluir esse perfil.
- **`/saude` mostra a última rodada DESTA máquina.** Com mais de uma máquina no
  Fly, cada uma responde pelo que ela fez; a que nunca ganha a trava mostra
  `rodadaEm: null`. Hoje `min_machines_running = 1`.
- **A redespacho para a MESMA equipe não avisa de novo**, em canal nenhum: nem
  push (unicidade da migração 042), nem o aviso local do aplicativo aberto
  (alinhado em 15/09/2026, `apps/campo/src/dados/pendencias.ts`). A tarefa
  continua na lista, e o agente a vê ao abrir.

---

## 8. Migrar a produção, na ordem que não perde dado

Vale para toda migração de banco depois do primeiro município no ar, e vale
para a API e para o console, porque os dois recusam subir com esquema atrasado.
Tudo a partir de `dc360/`, com a senha do banco no chaveiro do Mac (a mensagem
de ajuda de `scripts/migrar-producao.mjs` ensina a guardar).

### 8.1 A regra que vem antes do comando: só migração aditiva ou compatível

A API que está no ar continua atendendo enquanto a migração roda e por alguns
minutos depois, até o deploy seguinte. Uma migração que renomeia coluna, apaga
coluna, muda tipo ou aperta uma restrição que a versão no ar ainda escreve faz
a API de hoje falhar contra o banco de amanhã, no meio de um atendimento, e o
deploy que a consertaria ainda não subiu.

Então **migração em produção é aditiva ou compatível com a versão que está no
ar**: coluna nova (nula ou com padrão), tabela nova, função nova, policy nova,
índice novo. O que não cabe nessa lista se faz em duas entregas: primeiro a
migração que acrescenta e a API que passa a escrever nos dois lugares, depois,
com a versão nova no ar, a migração que tira o velho. O aplicador
(`db/src/migrar.ts`) roda cada arquivo na própria transação e recusa histórico
reescrito, mas não tem como saber o que a API de ontem ainda usa: isso é
leitura de gente, na revisão da migração.

### 8.2 O roteiro

**Passo 1. Conferir o que falta**, sem escrever nada:

```bash
node scripts/migrar-producao.mjs
```

**Passo 2. Tirar a cópia.** Desde 15/09/2026 o passo 3 **recusa** sem uma cópia
feita nos últimos trinta minutos, porque o restore testado deste projeto
(`docs/RESTORE-DO-BANCO.md`; o primeiro, de 09/09/2026, está na Parte 6 de
`docs/COLOCAR-DE-PE.md`) parte de uma cópia tirada antes, e migração
irreversível sem cópia é aposta.

```bash
node scripts/copiar-producao.mjs --conferir   # diz o que falta na máquina, sem tocar no banco
node scripts/copiar-producao.mjs              # tira a cópia
```

O que o roteiro faz, e o que ele cobra:

- precisa de `pg_dump` da mesma versão maior do servidor ou mais novo (o
  servidor é 17.x). Sem ele, a saída diz o que instalar (`brew install libpq` e
  o `PATH`); com um mais velho, recusa. A versão do servidor é lida antes de
  pedir o dump, e o cliente é conferido contra ela;
- grava em `~/dc360-copias/<data>.dump`, com permissão 0600, em
  `pg_dump --format=custom --schema=public`, o formato do restore de 09/09/2026.
  **Atenção:** o roteiro vigente (`RESTORE-DO-BANCO.md`, passo 3) exige também
  `--extension=pg_trgm` desde a migração 041, porque sem a opção o
  `pg_restore --exit-on-error` para no índice de busca (`gin_trgm_ops`), e o
  `copiar-producao.mjs` ainda não a passa. Nenhuma etapa do roteiro contém esse conserto (a V2-F01-E15, de dump antes de
  migração, não o cita), então ele não tem dono hoje; até alguém abrir a
  pendência, restaurar uma cópia dele exige antes criar a extensão no destino,
  o que o roteiro de restore não ensaiou;
- **recusa** gravar dentro do repositório, em pasta sincronizada com nuvem de
  arquivos (iCloud, Dropbox, Google Drive, OneDrive) e na Área de Trabalho. O
  dump traz dado real de cidadão: endereço, coordenada, nome e contato do
  solicitante, descrição de vulnerabilidade. Ele **nunca** entra em pasta
  versionada (viraria histórico de git para sempre) nem em nuvem de arquivos
  (a máquina de quem opera não é subprocessador, e passaria a ser).

**Passo 3. Aplicar**, dentro dos trinta minutos:

```bash
node scripts/migrar-producao.mjs --aplicar
```

A conclusão nomeia a cópia usada como ponto de volta e a idade dela. Sem cópia
recente o comando para antes de ler a senha, com a mensagem que ensina o passo
2. A saída de escape é `--sem-copia` escrito à mão junto de `--aplicar`: ela
existe para o dia em que a máquina não tem `pg_dump` e a migração não pode
esperar, e **fica registrada na conclusão** ("CÓPIA PULADA por --sem-copia").
Quem pula, pula por decisão, e a decisão vai para o relatório.

**Passo 4. Endurecer o Supabase, de novo.** Este passo é explícito porque é
idempotente e porque **toda tabela nova nasce concedida** aos papéis do
provedor (`anon`, `authenticated`, `service_role`, este último com BYPASSRLS)
pelo privilégio padrão do schema `public`. Uma migração que cria tabela reabre
o que o endurecimento anterior fechou, e nada quebra para avisar. O arquivo
`db/provedores/supabase-endurecer.sql` revoga tudo isso, inclusive o privilégio
padrão, e pode rodar quantas vezes for preciso:

```bash
CA="$(pwd)/db/provedores/supabase-prod-ca-2021.crt"
psql "postgresql://postgres.bppklrxxwjshxvkvwirw:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=${CA}" \
  -v ON_ERROR_STOP=1 -f db/provedores/supabase-endurecer.sql
```

(com a senha do chaveiro: `security find-generic-password -a dc360 -s senha-do-banco-dc360 -w`,
e nunca colada no histórico). O que confere que deu certo é esta consulta
voltar **vazia**:

```sql
SELECT grantee, table_name
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND grantee IN ('anon', 'authenticated', 'service_role');
```

Uma linha que seja é uma porta de entrada que o produto não projetou. O próprio
arquivo imprime, no fim, a contagem por papel e a confirmação de que
`dc360_app` continua enxergando o que precisa.

**Passo 5. Reimplantar a API** (`fly deploy -a defesa-civil`, de `dc360/`) e,
se a migração for uma que o console lê (`apps/console/src/esquema.ts`), o
console (`fly deploy -c fly.console.toml`). Só depois empurrar para o GitHub: a
Vercel publica o painel sozinha a cada push, e o painel novo não pode chegar
antes da API nova.

**Passo 6. Apagar a cópia** quando a migração tiver sido conferida no ar
(`rm ~/dc360-copias/<data>.dump`). Cópia velha é dado pessoal sem finalidade.

### 8.3 O que fica declarado como NÃO coberto

- **A cópia não é testada por restore a cada migração.** O roteiro grava e
  confere que o `pg_dump` saiu com zero; ele não sobe um cluster descartável
  para restaurar. O procedimento de restore é o de `RESTORE-DO-BANCO.md`
  (a Parte 6 do `COLOCAR-DE-PE.md` é o registro histórico), e a periodicidade
  dele continua por definir (`docs/INDISPONIBILIDADE.md`, 3.4).
- **O endurecimento não roda sozinho depois da migração.** Ele é um passo do
  roteiro, e roteiro se pula; o que não deixa passar despercebido é a consulta
  do passo 4, que a pessoa precisa rodar. Automatizar exige a credencial de
  dono dentro de um processo, que é o que a ADR 0008 recusa.

## 9. Homologação (HML)

HML é o ambiente onde cada migration e cada funcionalidade são ensaiadas antes de
produção, com dado SINTÉTICO. O contrato dele (variáveis, travas, o que a partida
recusa) está em `docs/AMBIENTES.md`; esta seção é o roteiro de criar e semear.

**O que o repositório já traz (V2-F01-E11):** `fly.hml.toml` (API) e
`fly.console.hml.toml` (console), `db/seeds/homologacao.sql`,
`apps/api/src/semear-homologacao.ts` e a guarda do `--semear` em `db/src/cli.ts`.
**O que depende da contratação (CP-05) e é feito pelo Rafael, fora do
repositório:** os dois apps do Fly, o projeto de banco Postgres 17, o bucket, o
domínio de teste de e-mail e o painel de HML (E10).

### 9.1 Os dois marcadores que o CP-05 troca

Os dois `fly*.toml` de HML nascem com `IDENTIDADE_DO_BANCO` (e
`CONSOLE_IDENTIDADE_DO_BANCO`) iguais a `a-definir-no-cp-05`, e a API com
`DOMINIO_DO_AMBIENTE` igual a `painel-hml.a-definir.invalid`. São marcadores,
não valores: nenhuma URL de banco os contém, então a partida RECUSA subir até
alguém trocá-los. É o lado seguro: um HML sem identidade nunca sobe contra o
banco de PROD. Trocar nos dois arquivos E em `scripts/ambientes.json`
(`ambientes.hml.identidadeDoBanco`, `dominio`, `appsNoFly`), no mesmo commit.

### 9.2 Roteiro de criação (depois do CP-05)

Tudo de `dc360/`, e SEMPRE com `-c` ou `-a` do app de HML.

1. Criar os apps: `fly apps create defesa-civil-hml` e
   `fly apps create defesa-civil-console-hml` (os nomes estão nos toml; se o Fly
   recusar por já existirem, trocar nos toml e na matriz).
2. Criar o projeto de banco de HML (Postgres 17, projeto próprio, NUNCA o de
   PROD). Anotar a referência do projeto: é a identidade. Se o CA do provedor de
   HML for diferente de `db/provedores/supabase-prod-ca-2021.crt`, guardar o dele
   e passá-lo na URL com `sslrootcert=` (o migrador e o semeador respeitam o que
   vier escrito; sem ele, usam o de PROD).
3. Criar os papéis (setup, `dc360_app`, `dc360_api` e o login do console), como
   nas seções 6.2 e 8 e no README.
4. Gravar os segredos de HML, todos DISTINTOS dos de PROD (nomes na matriz, valores
   nunca no repositório). Conferir só os nomes:
   `node scripts/conferir-ambiente.mjs --ambiente=hml --app=api --fly=defesa-civil-hml`
   e o mesmo para o console (`--app=console --fly=defesa-civil-console-hml`).
5. **Migrar do zero** com o papel de setup, e conferir:
   `DATABASE_URL=<setup de HML> npm run migrar` e depois
   `DATABASE_URL=<setup de HML> npm run migrar -- --conferir` (deve dizer
   "Esquema em dia"). Rodar o migrar de novo tem de dizer "Nada a fazer"
   (idempotente).
6. **Endurecer o Supabase** de HML:
   `psql "$DATABASE_URL_SETUP" -v ON_ERROR_STOP=1 -f db/provedores/supabase-endurecer.sql`
   e rodar a consulta de conferência da seção 8.2, passo 4: ela volta VAZIA.
7. **Semear** (seção 9.3).
8. Implantar: `fly deploy -c fly.hml.toml` e `fly deploy -c fly.console.hml.toml`.
   `/saude` tem de dar 200 nos dois.

### 9.3 Semear HML com dados sintéticos e senhas sorteadas

NUNCA com `npm run migrar -- --semear`: a semente de desenvolvimento dá a toda
conta a senha `defesa-civil-2026`, que está no repositório. O `--semear` agora
recusa, antes de conectar, qualquer banco que não seja descartável (a própria
máquina), qualquer `AMBIENTE_DC360` prod ou hml, e qualquer URL com a identidade
de PROD.

A semente de HML é outra:

```bash
cd apps/api
AMBIENTE_DC360=hml IDENTIDADE_DO_BANCO=<referência do banco de HML> \
  DATABASE_URL='<url de setup de HML>' npx tsx src/semear-homologacao.ts
```

Ela carrega `db/seeds/homologacao.sql` (sem hash nenhum, as contas nascem
trancadas), sorteia uma senha por conta e grava o hash NA MESMA transação, e
imprime a lista UMA vez. Copie a lista para o cofre de HML na hora: ela não
aparece de novo. Recusa, antes de escrever, quando: `AMBIENTE_DC360` não é
`hml`; a identidade falta, é a de PROD ou não consta na URL; o banco já tem
qualquer município (real, ou a própria semente já aplicada). Para recomeçar,
recrie o banco de HML.

### 9.4 Prova de que está certo

- Entrar pelo e-mail de uma conta de Serra Alta com a senha sorteada: entra.
- A senha `defesa-civil-2026` em qualquer conta de HML: recusada.
- Com a conta de Serra Alta, pedir pela API uma ocorrência de Vale Fundo
  (`22222222-2222-4222-8222-0000000000c1`): 404.
- Gerar um laudo e ver a marca d'água "AMBIENTE DE HOMOLOGAÇÃO".
- Ensaiar uma migration nova aqui ANTES de rodar `scripts/migrar-producao.mjs`.

### 9.5 O que fica declarado como NÃO coberto

- Os dois apps, o banco, o bucket e o e-mail de teste de HML ainda não existem
  (CP-05). Nada disso foi provado no ar: o que está provado é o repositório (a
  partida recusa o que não combina, a semente roda no Postgres em WebAssembly
  com as migrações e a RLS de verdade).
- O ensaio da migration em HML e o `--conferir` contra o banco real de HML são
  da execução do roteiro acima, pelo Rafael.
- Push (E13) e observabilidade (E14) de HML.
