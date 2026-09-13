# Ligar o email

Duas funções do produto dependem de email e estão desligadas hoje:

| Função | Estado hoje | O que o cidadão ou o servidor vê |
| --- | --- | --- |
| Recuperação de senha | `RECUPERACAO_ATIVA=nao` | A rota responde **503** e a tela manda procurar quem administra o município |
| Ofício por email para órgão | `EMAIL_ATIVO=nao` | A rota de envio recusa dizendo que o recurso está desligado |

As duas ficaram assim pelo mesmo motivo, e vale dizer em voz alta qual foi: **o
produto não tinha cliente de email.** `NOTIFICADOR_URL` e `NOTIFICADOR_CHAVE`
existiam na configuração, a partida em produção recusava subir sem elas, e
nenhuma linha do servidor jamais falou com provedor nenhum. Depois apareceu um
cliente que montava o pedido com nomes de campo inventados (`de`, `para`,
`nome`, `assunto`, `texto`), que provedor nenhum aceita: ligar naquele estado
teria produzido cem por cento de recusa, descoberta uma a uma por quem estava
esperando o email.

Agora existe cliente de verdade, falando o contrato publicado do **Resend**,
com teste conferindo o corpo campo a campo. O que falta é a conta.

---

## Por que Resend

Está escrito no código, em `apps/api/src/auth/notificador.ts`, e a razão é a
mesma que já governou outras escolhas deste produto:

1. **É um POST com JSON e `Authorization: Bearer`.** Sem SDK. Um SDK de email
   traz uma árvore de dependências inteira para dentro do `npm audit`, que
   precisa fechar em zero aqui, em troca de montar um objeto.
2. **A faixa gratuita cobre um piloto municipal.** Cem mensagens por dia e três
   mil por mês, no plano gratuito, com até três domínios verificados. O volume
   real deste produto é link de redefinição de senha e ofício para órgão, não
   boletim.
3. **O erro é legível e catalogado.** Importa no dia da estreia, quando o erro
   vai ser domínio não verificado.
4. **Ele devolve o identificador da mensagem**, e o produto guarda esse número
   (coluna `oficio_envios.provedor_id`, migração 027). É o que permite responder
   "o provedor aceitou, e o número é este" quando o órgão disser que não
   recebeu.

Documentação que foi lida para escrever o cliente:

- Envio: https://resend.com/docs/api-reference/emails/send-email
- Erros: https://resend.com/docs/api-reference/errors
- Limite de requisição: https://resend.com/docs/api-reference/rate-limit
- Chave de idempotência: https://resend.com/docs/dashboard/emails/idempotency-keys
- Verificar domínio: https://resend.com/docs/add-a-domain

Trocar de provedor depois é possível, mas **não é só trocar a URL**: cada
provedor tem nomes de campo próprios, então trocar exige mexer no cliente e no
teste dele. Não existe formato genérico de envio de email, e foi exatamente
acreditar que existia que produziu o defeito acima.

---

## O passo a passo, nesta ordem

### 1. Decida o endereço remetente antes de tudo

Ele precisa ser de um domínio que a **prefeitura controla**, porque só quem
controla o domínio consegue publicar os registros de DNS do passo 3. Não serve
Gmail, não serve o domínio do fornecedor.

A recomendação do provedor, e ela é boa, é usar um **subdomínio** em vez do
domínio raiz, para isolar a reputação de envio:

```
defesacivil@avisos.serraalta.mg.gov.br
```

Se a prefeitura só liberar o domínio raiz, funciona igual, só sem o isolamento
de reputação.

Quem precisa estar na conversa: quem administra o DNS da prefeitura. Sem essa
pessoa, o passo 3 trava, e ele é o passo que demora.

### 2. Crie a conta

1. Abra https://resend.com e crie a conta.
2. Confirme o email de cadastro.

Use um endereço institucional, e não o pessoal de alguém: esta conta vira
dependência de operação do município.

### 3. Adicione e VERIFIQUE o domínio

Este é o passo longo, e o único que depende de terceiro.

1. No painel, vá em **Domains** e clique em **Add Domain**.
2. Informe o domínio (ou o subdomínio) escolhido no passo 1.
3. Escolha a região de envio mais próxima dos destinatários.
4. O painel mostra a aba **Records** com os registros de DNS a publicar
   (`TXT` e `MX` ou `CNAME`, para DKIM e SPF). Copie e cole: eles precisam
   bater exatamente.
5. Peça a quem administra o DNS da prefeitura para publicar esses registros. Se
   o DNS estiver na Cloudflare, os registros `CNAME` **não podem** ficar com o
   proxy ligado (a nuvem laranja), senão a verificação não conclui.
6. Espere. A verificação costuma concluir em quinze minutos, mas propagação de
   DNS pode levar até setenta e duas horas.

O domínio precisa aparecer como **Verified** antes do passo seguinte. Enquanto
ele não estiver, toda mensagem vai voltar com `403 validation_error`, dizendo
que o domínio não foi verificado. Esse é o erro mais comum na estreia, e o
cliente do produto já o traduz com o nome da variável a conferir.

Depois de verificado, vale publicar também o registro **DMARC**, que o provedor
explica no painel. Não é obrigatório para enviar, e melhora a chance de a
mensagem não cair no spam da caixa do órgão destinatário.

### 4. Crie a chave de API

1. No painel, vá em **API Keys** e crie uma chave.
2. Dê a ela permissão de **envio** (`Sending access`). Não use uma chave de
   acesso total: esta chave vai viver no servidor da API, e o menor privilégio
   aqui vale o mesmo que vale no resto do produto.
3. Copie o valor. Ele começa com `re_` e **só aparece uma vez**.

### 5. Preencha as variáveis, nesta ordem

No ambiente da API (o `.env` de produção, ou os segredos da plataforma onde ela
roda), nesta ordem, porque a última é a que liga:

```bash
NOTIFICADOR_URL=https://api.resend.com/emails
NOTIFICADOR_CHAVE=re_...                       # a chave do passo 4
EMAIL_REMETENTE=defesacivil@avisos.serraalta.mg.gov.br   # o endereço do passo 1
EMAIL_ATIVO=sim                                # e só agora ligue
```

Três coisas que a configuração vai cobrar, e é melhor saber antes:

- **As três primeiras são obrigatórias com `EMAIL_ATIVO=sim`**, em qualquer
  ambiente. Se faltar uma, o processo **não sobe**, e a mensagem de erro diz
  qual. Isso é deliberado: servidor que sobe pela metade parece que funcionou.
- **`EMAIL_REMETENTE` passou a ser obrigatória**, e a obrigação é do provedor:
  ele trata `from` como campo obrigatório. Ela já foi opcional aqui, e opcional
  queria dizer "configuração completa, servidor de pé, toda mensagem recusada".
- **`NOTIFICADOR_ARQUIVO` precisa continuar VAZIA.** Ela é canal de teste: grava
  a mensagem inteira, com o link de redefinição, num arquivo em texto puro. Esse
  link é credencial viva capaz de assumir qualquer conta de qualquer município.
  A partida em produção derruba o processo se ela vier preenchida.

### 6. Só depois, ligue a recuperação de senha

```bash
RECUPERACAO_ATIVA=sim
```

Nesta ordem, e não antes, porque a configuração recusa `RECUPERACAO_ATIVA=sim`
com `EMAIL_ATIVO=nao`: seria a recuperação respondendo "enviamos o link"
enquanto escreve a credencial de uso único no log do servidor. Era exatamente
esse o estado anterior, e é por isso que a produção estava em `nao`.

### 7. Reinicie a API

A configuração é lida na partida. Se o processo subir, as variáveis passaram na
validação. Se não subir, o log diz qual faltou.

---

## Como conferir que funcionou

Na ordem, do mais barato para o mais caro.

**a) O processo subiu.** Se ele recusou, a mensagem nomeia a variável. Nada de
adivinhar.

**b) `GET /saude` responde.** É a checagem de sempre, e confirma que o processo
está servindo.

**c) Peça uma recuperação de senha para uma conta sua.**

```bash
curl -X POST https://api.seudominio.com.br/auth/recuperar \
  -H 'content-type: application/json' \
  -d '{"email":"voce@seumunicipio.gov.br"}'
```

A resposta é **202 em qualquer caso**, e isso é de propósito: resposta diferente
para email inexistente transformaria a rota em lista de emails da prefeitura.
Ou seja, **o 202 não prova que o email saiu.** O que prova é a caixa de entrada
e o painel do provedor.

**d) Abra o painel do provedor, em Emails.** A mensagem tem que estar lá, com o
desfecho dela. Se não estiver, ela não saiu: volte ao log da API, que carrega o
erro do provedor com o link e o endereço já removidos.

**e) Envie um ofício de teste para um órgão do catálogo.** Este é o teste
completo, porque exercita a parte que grava no banco. Depois do envio, a ficha
do ofício mostra a tentativa, e a linha em `oficio_envios` traz:

- `desfecho = entregue`
- `provedor_id` preenchido, que é o identificador para procurar no painel do
  provedor

Se `provedor_id` vier vazio com `desfecho = entregue`, a mensagem saiu mas o
provedor respondeu num formato diferente do documentado. Não é falha de envio,
é perda de rastreabilidade, e vale abrir tarefa.

---

## O que vai dar errado, e o que fazer

| O que aparece no log | O que é | O que fazer |
| --- | --- | --- |
| `HTTP 401`, `missing_api_key` | A chave foi recusada | Confira `NOTIFICADOR_CHAVE`. Chave copiada pela metade é o caso comum |
| `HTTP 403`, `validation_error`, "domain is not verified" | O erro da estreia | O domínio de `EMAIL_REMETENTE` não está verificado, ou é outro domínio. Volte ao passo 3 |
| `HTTP 403`, "You can only send testing emails to your own email address" | A conta ainda não tem domínio verificado nenhum | Mesmo passo 3 |
| `HTTP 422`, `missing_required_field` | Falta campo obrigatório no pedido | É defeito do cliente, não de configuração. Abra tarefa: o teste de contrato deveria ter pego |
| `HTTP 429`, `rate_limit_exceeded` | Saíram mensagens demais por segundo | **Nada.** O cliente já tenta de novo sozinho, duas vezes, respeitando o `retry-after`, com a mesma chave de idempotência. Se ainda assim falhar, o erro diz para tentar em alguns minutos |
| `HTTP 429`, `daily_quota_exceeded` | Estourou a cota do plano gratuito no dia | Cem mensagens por dia. Num dia de temporal isso é alcançável. Se acontecer, é hora de plano pago |
| `nao respondeu` | Tempo limite de dez segundos | Rede, ou provedor fora do ar. A tentativa fica registrada como falha e o ofício pode ser reenviado |

O 429 merece nota, porque é o erro do dia de temporal. O limite publicado é de
dez requisições por segundo. O cliente repete **só** esse erro, e por dois
motivos: ele é o único 4xx que não diz nada sobre a mensagem (ela não tem
defeito, chegou rápido demais), e a rota grava a tentativa no banco antes de
chamar o provedor, então um 429 devolvido para fora queimaria uma das três
tentativas de reenvio do ofício sem nenhuma mensagem ter saído. A repetição usa
a mesma chave de idempotência, que o provedor honra por vinte e quatro horas,
então um 429 sobre um pedido que na verdade tinha passado **não** faz o ofício
sair duas vezes.

---

## O que NÃO fazer

- **Não preencha `NOTIFICADOR_ARQUIVO` em produção**, nem "só para depurar". Ele
  grava o link de redefinição em texto puro. A partida derruba o processo se ele
  aparecer, e essa trava existe por um motivo.
- **Não ligue `RECUPERACAO_ATIVA=sim` antes de `EMAIL_ATIVO=sim`.** A
  configuração recusa, e a recusa está certa.
- **Não use uma chave de acesso total do provedor.** Envio basta.
- **Não use um domínio que a prefeitura não controla** como remetente. Além de
  ser recusado pelo provedor, é falsificação de remetente de órgão público.

## O que continua funcionando sem email

Enquanto o email não estiver ligado, quem esquece a senha procura quem
administra o município, que redefine por dentro do painel. E o ofício continua
saindo em papel: o documento é gerado, numerado e imprimível, e encaminhar pelo
canal de sempre continua sendo um caminho válido. A diferença é que o envio por
email deixa registro de tentativa, de abertura do link e, agora, do recibo do
provedor.
