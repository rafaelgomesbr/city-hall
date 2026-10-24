# Runbook: rotação e revogação de segredo

- **Versão:** 1, de 2026-10-24 (V2-F01-E16, rascunho).
- **Quem executa:** hoje, o dono (Rafael). A segunda pessoa executa a rotação de
  `JWT_SEGREDO` em HML no ensaio; em PROD, só depois do CP-07 e com o acesso
  mínimo de `acesso-e-segredos.md`.
- **Quando usar:** rotação programada (o segredo está velho e ninguém sabe dele)
  ou revogação por vazamento (alguém o tem). **São procedimentos opostos que
  usam a mesma variável.** Confundir um com o outro é o único erro daqui que não
  aparece em log nenhum.
- **Fontes deste texto:** `scripts/rotacionar-segredo.mjs` (o cabeçalho dele é
  leitura obrigatória), `apps/api/src/config.ts`, `apps/console/src/config.ts`,
  `docs/COLOCAR-DE-PE.md` (Parte 3, item 3), `docs/IMPLANTACAO.md` (seção 6).

## O que se gira, o que não se gira, e o que ainda não tem runbook

| Segredo (nome) | Onde mora | Rotação | Estado |
| --- | --- | --- | --- |
| `JWT_SEGREDO` | `fly secrets`, app `defesa-civil` | Suportada, sem derrubar ninguém (lista com o novo na frente) | Coberto por este runbook |
| `CONSOLE_JWT_SEGREDO` | `fly secrets`, app `defesa-civil-console` | Valor único, sem lista: trocar derruba as sessões do console | Coberto abaixo, seção própria |
| `SEGUNDO_FATOR_CHAVE` | `fly secrets`, app `defesa-civil` | **Não gira sem plano.** Trocar invalida todos os segredos TOTP já guardados | Nenhum plano existe; ver seção própria |
| `CONSOLE_SEGUNDO_FATOR_CHAVE` | `fly secrets`, app `defesa-civil-console` | **Não gira sem plano.** Com a chave trocada o console nem sobe | Nenhum plano existe |
| Senha do papel `dc360_api` (dentro de `DATABASE_URL`) | `fly secrets` e provedor do banco | Sem script e sem ensaio | Sem runbook: lacuna registrada |
| Senha do papel `dc360_console_login` (dentro de `CONSOLE_DATABASE_URL`) | idem, app do console | Sem script e sem ensaio | Sem runbook: lacuna registrada |
| `S3_CHAVE_ID` e `S3_CHAVE_SECRETA` | `fly secrets` e provedor do armazenamento | Sem script e sem ensaio | Sem runbook: lacuna registrada |
| `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_CHAVE` | `fly secrets`; chave no portal da Apple | Revogar e criar no portal (`docs/IMPLANTACAO.md`, 7.1) | Sem runbook próprio |
| `NOTIFICADOR_CHAVE` | `fly secrets` | Do provedor de e-mail | Sem runbook; e-mail ainda desligado em PROD |
| `MAPS_KEY` | `fly secrets` | Não é segredo (viaja no JavaScript da página); protege a restrição por referenciador | Fora de rotação |

A rotina periódica de rotação (calendário, dono, evidência) é da V2-F28-E16, não
desta etapa. As linhas "sem runbook" são lacunas conhecidas, não omissões:
escrever procedimento sem poder ensaiá-lo seria inventar.

## Pré-condições (rotação de `JWT_SEGREDO`)

1. **O valor ATUAL de `JWT_SEGREDO` está em mãos.** O Fly não o devolve:
   `fly secrets list -a defesa-civil` mostra só o nome e um resumo. O plano de
   rotação precisa do valor atual para montar a lista (`novo,antigo`). Hoje esse
   valor mora na máquina do dono; o cofre decidido no CP-07 passa a guardá-lo
   (`acesso-e-segredos.md`). **Sem o valor atual não existe rotação que não derrube
   ninguém:** só resta pôr um valor novo sozinho, que derruba todas as sessões
   (é a revogação, com a consequência dela).
2. A lista atual tem **no máximo dois** segredos. O teto é três, e a partida
   recusa mais que isso. Se houver rotação anterior pela metade, termine-a
   primeiro (passo 2 dela).
3. Uma pasta de trabalho **fora do repositório**, com permissão restrita, e a
   decisão de apagá-la no fim. Segredo não entra em `git`, em captura de tela,
   em mensagem nem no histórico do shell:
   ```bash
   mkdir -p -m 700 ~/segredos-dc360
   ```
   Os comandos abaixo passam o valor atual ao `rotacionar-segredo.mjs` como
   argumento (o script foi escrito assim), então ele fica visível na lista de
   processos da máquina enquanto roda: faça em máquina de uma pessoa só.
4. Dia e hora sem evento crítico no município: o Fly reinicia a máquina quando
   um segredo muda, e com uma máquina só há uma interrupção curta.
5. Ler `ACESSO_MINUTOS` do ambiente (15 no padrão, teto de 60). É o tempo que o
   passo 2 espera.

## Passos: rotação programada (ninguém é derrubado)

Tudo a partir de `dc360/`. Em HML (depende de V2-F01-E11) o app é o de HML; o
nome do app muda, o resto é igual.

### 1. Gerar o plano, sem imprimir na tela por descuido

```bash
(umask 077; node scripts/rotacionar-segredo.mjs rotacionar "$(cat ~/segredos-dc360/jwt-atual.txt)" > ~/segredos-dc360/plano.txt)
```

O arquivo `plano.txt` traz duas linhas `JWT_SEGREDO="..."`: a do passo 1 (o
novo na frente do antigo) e a do passo 2 (só o novo). O segredo novo tem 48
bytes em `base64url`, sem `+`, `/`, `=` nem vírgula.

### 2. Subir a lista (o novo assina, o antigo ainda aceita)

Com um editor (não `echo`, não heredoc, que vão ao histórico), crie
`~/segredos-dc360/entrada.env` com **uma linha**, sem aspas em volta do valor:

```
JWT_SEGREDO=<novo>,<antigo>
```

```bash
fly secrets import -a defesa-civil < ~/segredos-dc360/entrada.env
```

O Fly implanta de novo ao receber o segredo. O arquivo e o `import` seguem o
mesmo caminho do console (`docs/IMPLANTACAO.md`, 6.1), por causa do shell.

### 3. Verificar a lista nova

Ver "Verificação" abaixo. **Não passe ao passo 4 antes disso.**

### 4. Esperar os tokens antigos vencerem

Espere pelo menos `ACESSO_MINUTOS` (15 minutos no padrão) mais folga. Com o
padrão, 30 minutos. Enquanto esperar, o produto tem dois segredos válidos.

### 5. Aposentar o antigo

`entrada.env` com a linha do passo 2 do plano (só o novo):

```
JWT_SEGREDO=<novo>
```

```bash
fly secrets import -a defesa-civil < ~/segredos-dc360/entrada.env
```

**Este passo não é opcional.** Sem ele a rotação está pela metade: o segredo
antigo continua abrindo sessão, e o produto passou a ter dois segredos em vez de
ter trocado de segredo.

### 6. Guardar e limpar

1. Guarde o valor novo no cofre decidido no CP-07 (hoje: onde o dono já guarda).
2. Apague os arquivos de trabalho: `rm -f ~/segredos-dc360/plano.txt ~/segredos-dc360/entrada.env ~/segredos-dc360/jwt-atual.txt`.
3. Limpe o terminal onde o plano foi impresso ou aberto.

## Verificação

Depois do passo 2 (lista com dois) e de novo depois do passo 5 (só o novo):

```bash
fly status -a defesa-civil
fly logs -a defesa-civil
curl -sS https://defesa-civil.fly.dev/saude
```

- `/saude` com `"status":"ok"`; uma máquina saudável.
- O log não mostra a partida recusando `JWT_SEGREDO` (lista vazia, segredo
  curto, repetido ou acima do teto, cada recusa nomeia a causa).
- **A sessão que já estava aberta no painel continua aberta** depois do passo 2.
  Se ela caiu, a lista foi montada sem o antigo e isto virou revogação: pare e
  veja se o valor antigo usado no plano era o certo.
- **Um login novo funciona** (token novo, assinado pelo segredo novo).
- Depois do passo 5: um login novo ainda funciona. Sessões muito antigas
  (de antes da espera) podem ter caído; é esperado só se a espera foi menor que
  `ACESSO_MINUTOS`.

## Passos: revogação por vazamento (todo mundo cai, e isso é o certo)

Só quando alguém que não devia tem, ou pode ter, o segredo. É incidente de
nível 1 (`docs/INDISPONIBILIDADE.md`, seção 2); suspeita de vazamento também
dispara o relógio de 24 horas da comunicação prevista na política de
privacidade.

```bash
(umask 077; node scripts/rotacionar-segredo.mjs revogar "$(cat ~/segredos-dc360/jwt-atual.txt)" "<o valor que vazou>" > ~/segredos-dc360/plano.txt)
```

O plano traz **uma** linha `JWT_SEGREDO=...`, sem o segredo comprometido. Suba
**já**, pelo mesmo `fly secrets import` do passo 2. Toda sessão aberta cai,
inclusive a do plantão; o plantão volta com a senha, e quem tem o segredo, não.

**Não use o plano de rotação neste caso:** ele mantém o segredo antigo válido
por uma janela, e aqui isso é dar a janela ao invasor. O comando recusa se o
valor apontado como vazado não estiver na lista atual (revogar o segredo errado
derruba todo mundo e deixa o comprometido valendo).

## `CONSOLE_JWT_SEGREDO`

É um valor único (mínimo 32 caracteres), sem lista, e **precisa ser diferente**
do `JWT_SEGREDO` da API. Trocar derruba as sessões do console: cada operador
entra de novo com senha e segundo fator. O procedimento é o do console
(`docs/IMPLANTACAO.md`, 6.3): gerar o valor, pôr numa linha do arquivo de
segredos do console, `fly secrets import -a defesa-civil-console < arquivo`,
apagar o arquivo. **Nunca** `fly secrets set` com aspas duplas: o shell expande
`$` do hash de senha e o console sobe quebrado sem uma linha de log.

## `SEGUNDO_FATOR_CHAVE` (e `CONSOLE_SEGUNDO_FATOR_CHAVE`): não gira sem plano

Estas chaves **cifram** o segredo da segunda etapa dentro do banco, e ficam fora
do banco de propósito. Não existe lista de chaves aceitas, e não pode existir
(seria uma lista de chaves que ainda abrem o segredo, o oposto de rotacionar).
Por isso:

- **Perder a chave** deixa ilegíveis os segredos TOTP guardados. A chave precisa
  ter cópia no cofre decidido no CP-07; hoje a única cópia é a do dono. Esta é a
  razão de a V2-F01-E16 incluir "guardar `SEGUNDO_FATOR_CHAVE` no cofre".
- **Trocar a chave** invalida todos os segredos já guardados: todo mundo refaz a
  ativação do aplicativo de autenticação, e quem já estava dentro entra pelos
  códigos de recuperação. No console, a partida confere o envelope do dono
  contra a chave: com a chave trocada, **o processo não sobe**.
- **Não existe plano de rotação** (migração dos envelopes de uma chave para
  outra). Escrevê-lo é código novo e não é desta etapa. Enquanto não existir, a
  única troca possível é a de pior caso acima, e só se a chave vazou.

Antes de qualquer troca, cada pessoa afetada precisa ter seus códigos de
recuperação guardados fora do computador (`docs/IMPLANTACAO.md`, 6.3 e 6.4).

## Voltar atrás (rollback)

- **Rotação de `JWT_SEGREDO`, passo 2:** repor a linha anterior (só o antigo)
  pelo mesmo `fly secrets import`. Os tokens novos assinados com o segredo novo
  deixam de valer: sessões abertas depois do passo 2 caem e entram de novo com a
  senha. Por isso o valor antigo só se apaga depois do passo 6.
- **Rotação, passo 5:** repor `novo,antigo` enquanto o arquivo antigo existir.
- **Revogação:** não se volta. O segredo comprometido não retorna.
- Imagem anterior da API (`rollback.md`, V2-F01-E08) **não** desfaz segredo:
  segredo é configuração do app, não da imagem.

## O que este runbook ainda não cobre

- HML para ensaiar a rotação: depende de V2-F01-E11.
- Cofre que guarda o valor atual e a chave do segundo fator: depende do CP-07.
- Matriz de variáveis por ambiente e comparador de nomes contra
  `fly secrets list`: depende de V2-F01-E09.
- Rotina periódica de rotação e calendário: V2-F28-E16.
- Plano de rotação de `SEGUNDO_FATOR_CHAVE` e dos segredos sem runbook da
  tabela do início: não existem.
