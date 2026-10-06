# Pendências conhecidas da API

O que está escrito aqui é defeito reproduzido ou risco identificado que **não**
foi corrigido, com o detalhe suficiente para alguém atacar sem repetir a
investigação. Item que já tem correção sai daqui e vira teste.

## O pacote de saída lê TODAS as tabelas em memória, e a rota promete o contrário

**Onde:** `src/saida/pacote.ts` (o bloco `banco.comTenant` que monta `dados`) e
`src/rotas/saida.ts` por volta da linha 145.

**O que acontece:** `montarPacoteDeSaida` abre uma transação e faz
`SELECT <colunas> FROM <tabela> ORDER BY ...` **sem `LIMIT` nenhum** para cada
uma das vinte e poucas tabelas de `TABELAS_DA_SAIDA`, e guarda todas as linhas
em `tabelas[].linhas`, na memória do processo, antes de o primeiro byte do ZIP
sair. Depois disso vêm as consultas de ocorrências, vistorias, evidências,
providências e ofícios, também inteiras. Só as fotografias são buscadas em
fluxo, uma a uma, e essas já estão corrigidas.

**A promessa que isso contradiz:** o comentário da rota diz, com todas as
letras, que a resposta vai em fluxo porque "montar antes para saber
significaria segurar o pacote inteiro na memória do processo. Um município com
dez mil vistorias derrubaria o servidor no dia em que pedisse para sair, que é
o pior dia possível para o servidor cair". O comportamento é o inverso do texto:
o que está em memória não é o ZIP, mas é a base inteira do município em linhas
de JavaScript, que é maior que o ZIP.

**Por que importa:** a máquina do Fly tem 1 GB (ver `fly.toml`), e o Chromium do
PDF já ocupa parte disso. `trilha_eventos` e `trilha_administrativa` são as
tabelas que mais crescem, porque a trilha é append-only por decisão de projeto:
elas nunca encolhem. Um município com três anos de operação derruba o processo
por falta de memória exatamente no dia da saída, e o sintoma que o município vê
é o download que começa e morre no meio, sem mensagem. Pior: o processo que cai
leva junto o plantão de quem estava usando o sistema.

**Como atacar:** paginar por cursor (`WHERE id > $ultimo ORDER BY id LIMIT n`) e
emitir CSV e JSON linha a linha, `yield` a cada página, em vez de acumular. Duas
restrições que não podem cair no caminho:

1. A ordem tem que continuar estável entre duas extrações, senão a conferência
   do passo 5 do procedimento deixa de valer (é por isso que existe o `ORDER BY`
   explícito hoje).
2. O JSON precisa continuar sendo um documento válido, então o `[` e o `]` saem
   fora do laço e a vírgula é decidida por posição.

A transação pode continuar existindo, e continua fechando antes das
fotografias: o problema não é ela, é acumular o resultado.

**Ainda não medido:** quantos megabytes um município de três anos produz de
verdade. Sem essa medida, qualquer teto escolhido é chute. O caminho mais barato
para medir é gerar carga sintética com o que já existe em `db/test/carga.test.ts`
e observar o processo.

## A vigência de conta, papel e sessão vale só na ESCRITA

**Onde:** `src/servidor.ts` (`exigirAutenticacao`) e `src/auth/vigencia.ts`.

**O que acontece:** desde V2-F00-E04 toda escrita (método que não é GET nem HEAD)
confere no banco se a conta está ativa, se o papel é o do token, se a sessão do
token não foi encerrada por alguém e se a senha provisória não venceu. A LEITURA
continua confiando só na assinatura do token, por até `ACESSO_MINUTOS` (15 por
padrão, 60 no máximo): conta desativada ainda lê até o token vencer. Pior, as
leituras que escrevem (`GET /avisos`) seguem fora da vigência.

**Decisões da V2-F00-E07, para não serem reabertas por engano:**

- **Papel alterado:** papel gravado diferente do token responde 401
  `nao_autenticado` (renove e repita), depois de conta desativada e de sessão
  encerrada (quem foi rebaixado E derrubado entra de novo). A troca de papel
  NÃO revoga as sessões da pessoa: a segurança não depende disso, porque a
  escrita confere o papel do banco, e revogar obrigaria a entrar de novo com
  coleta na fila.
- **Cadeia da sessão:** o token de acesso emitido antes de uma renovação só
  escreve enquanto a família (`sessoes.familia_id`, migração 047) tem sessão
  não revogada. Limite conhecido: entre `revogar_sessao` (a antiga) e
  `abrir_sessao` (a nova) da própria renovação a família não tem sessão viva
  por alguns milissegundos, e uma escrita com o token antigo nessa janela leva
  401 `sessao_encerrada`. A fila do campo (E06) mantém o item pendente e a
  pessoa entra de novo; fechar a janela exige renovar numa só transação
  (F03-E02, claims enxutas e rotação).
- **Senha provisória vencida:** `trocarSenha` recusa por conta própria (401
  `sessao_encerrada`), além de a rota já recusar a escrita pela vigência.
  Entrar e renovar já recusavam.
- **`troca_de_senha_obrigatoria` na fila do campo:** continua recusa permanente
  no transporte (ver `apps/campo/PENDENCIAS.md`, item 14). Não é tratada aqui:
  a E07 só mexe na vigência da API, e o aplicativo leva a pessoa à troca de
  senha antes de ela chegar à fila.

**Como atacar:** F03-E03 (vigência em toda requisição autenticada, centralizada em
`comTenant`). Os códigos de erro já estão separados desde a V2-F00-E05
(`nao_autenticado`, `sessao_encerrada` e `conta_desativada`, catálogo em
`packages/shared/src/codigos-de-erro.ts`), e desde a V2-F00-E06 a fila do campo
os trata sem perder item (a fila para e mantém o item pendente; ver
`apps/campo/PENDENCIAS.md`, item 14). Resta a validação em aparelho, que é
humana: até ela, a E04, a E05 e a E06 devem ir juntas para produção.


## `GET /avisos` ESCREVE dentro de um GET, e escreve com o token de qualquer papel

**Onde:** `src/rotas/avisos.ts` (rota `GET /`).

**O que acontece:** a consulta do sino materializa os prazos vencidos
(`prazo_vencido`) e as saídas a campo sem retorno confirmado
(`retorno_nao_confirmado`) como avisos do município, e leva um lote de avisos
com mais de 60 dias para fora (`DELETE`). As três escritas são idempotentes
(`NOT EXISTS` mais `ON CONFLICT`), em lote (200 e 500 linhas por consulta) e
restritas ao município do token, e nenhuma depende do que veio na requisição.
Depois da V2-F00-E08 o token do AGENTE DE CAMPO continua disparando as mesmas
escritas: o que mudou é só o que ele LÊ de volta (lista e contagem recortadas à
equipe dele). O teste `leitura-do-agente-oficios-e-avisos.test.ts` fixa as duas
coisas (a escrita segue idempotente, o aviso de outra equipe não chega).

**Por que está assim:** o relógio que materializaria o fato sem ninguém logado
precisaria de função `SECURITY DEFINER`, e o teto de definers do isolamento
(CA-06) é de propósito. O custo declarado: o aviso só nasce quando alguém do
município consulta o sino.

**Por que isto continua sendo dívida:** GET com efeito colateral foge do que
cache, prefetch e repetição automática supõem, e a vigência (E04) só cobre
métodos de escrita, então a conta desativada ainda dispara essas escritas até o
token vencer.

**Como atacar:** F07-E03 (trabalhador que materializa o fato) e F04-E11 (avisos
e sino do órgão sem vazamento): a rota vira só leitura, a materialização e o
expurgo passam para o trabalhador. Até lá, o recorte do agente (E08) é o que
impede o vazamento, e a escrita fica registrada aqui.

## Sessões no painel (V2-F00-E09)

Duas leituras novas, sem migração: `GET /auth/sessoes` (a própria conta: quando
entrou, até quando vale, aparelho em uma frase e a marca "atual") e
`GET /usuarios/:id/sessoes` (`gerenciar_usuarios`, posto e 404 como as rotas de
redefinição: só quantidade e datas). Nenhuma devolve IP nem user-agent. O que
sobra:

1. **A senha temporária é conhecida por quem a sorteou** (IDN-18 do REL:06). Vale
   72 horas e a primeira entrada exige troca. O fim é o convite por link (F03-E10).
2. **`encerrarMinhasSessoes` preserva por id de sessão**, e a lista marca "esta"
   por família. Com um token de acesso anterior à última renovação, o botão
   "encerrar as outras" derruba a sessão viva da própria cadeia. Alinhar a
   preservação à família é da F03-E02 (renovação numa transação só).
3. **O resumo do aparelho** (`auth/aparelho.ts`) é uma lista curta de padrões de
   user-agent. O que não reconhece vira "Aparelho não identificado" em vez de
   palpite; ampliar a lista é barato e fica para quando houver caso real.

## Recuperação de senha por e-mail (V2-F00-E10)

Sem migração. `POST /auth/recuperar` passou a enviar DEPOIS da resposta (a falha do
provedor vai para o log, sem o link e sem o e-mail), a contar pedidos por e-mail
(`RECUPERACAO_POR_EMAIL_HORA`, padrão 5 por hora) e as mensagens de `/auth/recuperar`,
`/auth/redefinir` e da recuperação desligada ganharam acento. `GET /auth/recuperacao`
é nova (sem token, só `{ ativa }`). O que sobra:

1. **O teto por e-mail é por processo** (um mapa em memória com o hash do e-mail).
   Com mais de uma máquina o teto é por máquina, e um reinício o zera. A alternativa
   (uma tabela com a contagem) custa uma migração; o limite por endereço
   (`LOGIN_POR_IP`) continua sendo a defesa principal. Se o piloto subir em mais de
   uma máquina, mover o contador para o banco é da F03.
2. **O teto também pode negar a recuperação a quem é alvo**: quem pede cinco vezes o
   e-mail de outra pessoa a deixa uma hora sem pedir o link. É o preço de proteger a
   caixa de entrada, e a saída é a de sempre: quem administra redefine pelo painel
   (E09). Pedido barrado pelo teto não estende a janela.
3. **Quem pediu e o provedor recusou não é avisado na tela** (a tela não sabe se a
   conta existe, e não deve). Só o log do servidor sabe, e ele não tem o link. A
   auditoria de pedido e de redefinição (quem pediu, de qual endereço, quando) é da
   F03.
4. **A produção segue com `RECUPERACAO_ATIVA=nao`** até o CP-19 (provedor e domínio).
   O `NOTIFICADOR_ARQUIVO` só é recusado quando `NODE_ENV=production`: em
   `staging` ou em qualquer outro valor ele funciona, e a F01 (ambientes) decide se
   o HML precisa da mesma trava.
