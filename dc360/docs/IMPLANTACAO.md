# Roteiro de implantação e treinamento

- **Versão:** 2, de 15/09/2026 (a seção 6, do console do fornecedor, é nova)

O produto pode estar certo e a implantação fracassar, e o motivo quase nunca é
técnico: é o agente que não confia no aplicativo depois que ele engoliu uma
vistoria, e é o coordenador que volta para a planilha porque a planilha ele já
sabe usar.

Este roteiro é escrito contra esses dois riscos.

---

## 1. Antes de qualquer tela

Nada disto é software, e tudo isto trava a implantação se ficar para depois.

| O que | Quem decide | Sem isso |
| --- | --- | --- |
| Os três prazos de retenção da seção 4 da política de privacidade | Município | A minimização não tem número para executar |
| Encarregado de dados do município | Município | O cidadão não tem a quem pedir seus direitos |
| Aceitar ou recusar o envio de coordenada ao Google, no mapa | Município | O mapa não pode ser ligado |
| Quem é o administrador do município | Município | Não há a quem entregar o primeiro acesso |
| Equipes, e quem está em cada uma | Município | Despacho não tem para quem despachar |
| Prazos por severidade | Município | O relógio de atraso não tem base |
| Lista de órgãos para acionamento | Município | O checklist trava justamente sem sinal |
| Aparelhos: quantos, de quem, iOS ou Android | Município | Não dá para preparar a instalação |

**Reunião única, com o coordenador e o administrador na sala, e uma ata.** Cada
linha acima vira uma decisão registrada. Implantação que começa com "isso a
gente resolve depois" chega no primeiro temporal com isso não resolvido.

---

## 2. Sequência

| Etapa | O que acontece | Duração |
| --- | --- | --- |
| 1 | Provisionamento do município e do primeiro administrador, por linha de comando. A senha inicial é impressa **uma vez** e entregue em mãos | 1 hora |
| 2 | O administrador cria equipes e usuários. Cada um troca a senha no primeiro acesso | 2 horas |
| 3 | Cadastro dos prazos por severidade e da lista de órgãos | 1 hora |
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

- Tarefa que sumiu da lista tem explicação, e o aplicativo diz qual.
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
tenha o que ele usa, e o mínimo hoje é a migração 038, que cria a tabela
`console_operadores` (onde vivem as contas de quem entra no console) e as
quatro funções de suspender, reativar, agendar e cancelar a eliminação de um
município. Sem ela a partida diz, pelo nome, o que falta.

```bash
node scripts/migrar-producao.mjs            # só confere, não aplica
node scripts/migrar-producao.mjs --aplicar  # só se faltar alguma
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
(migração 038 faltando), tabela de operadores vazia sem `CONSOLE_OPERADORES`
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
- **O dono não tem recuperação de senha pela tela.** Operador que esquece a
  senha é atendido pelo dono (desativa a conta e cria outra). O dono que
  esquecer a própria senha, ou perder o aparelho do segundo fator, precisa da
  credencial de dono do banco para corrigir a linha em `console_operadores`:
  é o único caminho, e é assim de propósito, porque uma rota de "esqueci a
  senha" no console seria uma porta na única conta que enxerga todos os
  municípios.
- **As duas ações perigosas por município (desativar o acesso e eliminar com
  prazo de sete dias) são só do dono**, e o apagamento em si é do relógio da
  API, não do console: o console suspende e agenda, e o que vence sem ser
  cancelado é executado pelo processo da API. Um console fora do ar não atrasa
  nem adianta um apagamento.
