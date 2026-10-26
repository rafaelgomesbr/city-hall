# Pendências conhecidas da API

O que está escrito aqui é defeito reproduzido ou risco identificado que **não**
foi corrigido, com o detalhe suficiente para alguém atacar sem repetir a
investigação. Item que já tem correção sai daqui e vira teste.

**Revisão de 2026-10-07 (V2-F00-E22).** Até esta data o arquivo tinha seções
escritas por várias etapas e deixava de fora pendências que só estavam no
STATUS do roadmap ou no README. Cada item abaixo foi conferido contra o código
nesta data; as seções antigas ficaram, e o que faltava entrou no fim, em "O que
estava fora daqui".

**Segunda conferência de 2026-10-13 (correção 1 da V2-F00-E22).** A validação
de 7005a60 reprovou a conferência acima por restos falsos. Reconferido contra o
código de hoje: a vigência (escrita por método OU por `ROTA_GET_COM_EFEITO`), a
fila do campo diante de `troca_de_senha_obrigatoria` (agora pausa) e a lista de
diferenças entre o laudo da rota e o do pacote. Saiu o item da dependência de
execução com aviso (`fastify`, `fast-uri`): `npm audit --omit=dev` na raiz dá 0
e `npm run auditar` fecha com saída 0 pela política do CP-03 (V2-F00-E19). O
que resta, numa linha cada:

| O que resta | Seção | Quem fecha |
| --- | --- | --- |
| O pacote de saída monta a base inteira do município em memória antes do primeiro byte | "O pacote de saída lê TODAS as tabelas" | F07-E06 |
| A vigência (conta, papel, sessão) vale na escrita e nos GET marcados como com efeito; a LEITURA PURA confia no token por até `ACESSO_MINUTOS` | "A vigência de conta, papel e sessão" | F03-E03 |
| `GET /avisos` escreve dentro de um GET, com o token de qualquer papel (a vigência já vale nele) | "`GET /avisos` ESCREVE" | F07-E03, F04-E11 |
| A senha temporária é conhecida por quem a sorteia | "Sessões no painel" | F03-E10 |
| O teto de pedidos de recuperação é por processo; produção com a recuperação desligada | "Recuperação de senha por e-mail" | F03, CP-19 |
| Dois montadores de dados do laudo: o do pacote mistura as fotos de todas as vistorias, não imprime a seção das fotos avulsas, e o termo de interdição dele sai da vistoria vigente em vez da vistoria do ato | "Dois montadores de dados do documento" | F09-E02 |
| `GET /orgaos` (com o e-mail de cada órgão) responde a qualquer papel autenticado, inclusive ao agente de campo | "O que estava fora daqui", 1 | F03-E12 ou F04-E09 |
| Município com o acesso suspenso não baixa o pacote de saída | "O que estava fora daqui", 2 | decisão de Rafael com o jurídico (CP-29) |
| Ninguém desliga o segundo fator de OUTRA pessoa | "O que estava fora daqui", 3 | F03-E11 |

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

**O que acontece:** desde V2-F00-E04 toda escrita confere no banco se a conta
está ativa, se o papel é o do token, se a sessão do token não foi encerrada por
alguém e se a senha provisória não venceu. Escrita é todo método que não é GET
nem HEAD MAIS as rotas GET marcadas com `ROTA_GET_COM_EFEITO` (`servidor.ts`),
com o HEAD delas: o laudo, o termo de interdição, o termo de desinterdição e os
PDFs, `GET /relatorios/ocorrencias.csv` e `GET /avisos`. Foi a correção 1 da E04: até ela a decisão era só pelo método, e
conta desativada, papel rebaixado e cadeia encerrada interditavam imóvel e
exportavam dado pessoal por GET. A lista é fixada por
`test/get-com-efeito.test.ts`, que reprova GET novo que escreve sem a marca. A
LEITURA PURA continua confiando só na assinatura do token, por até
`ACESSO_MINUTOS` (15 por padrão, 60 no máximo): conta desativada ainda lê, nas
rotas que só leem, até o token vencer.

**Decisão da correção 1, para não ser reaberta por engano:** o critério da marca
é "o GET pratica um ato (emite documento, interdita, exporta) ou muda dado do
município". `GET /ocorrencias/:id` (o dossiê) e `GET /busca` também escrevem,
mas só o registro de que foram lidos (`registrarConsulta`, a auditoria da
própria leitura); ficam como LEITURA e NÃO levam a marca. Marcá-los antecipa a
F03-E03: o dossiê passaria a conferir a vigência no banco, o que contradiz as
decisões fixadas em `acesso-suspenso.test.ts` ("leitura continua até o token
vencer") e em `familia-da-sessao.test.ts`. Quando a F03-E03 centralizar a
vigência em `comTenant`, eles entram junto com o resto da leitura.

**Decisões da V2-F00-E07, para não serem reabertas por engano:**

- **Papel alterado:** papel gravado diferente do token responde 401
  `nao_autenticado` (renove e repita), depois de conta desativada e de sessão
  encerrada (quem foi rebaixado E derrubado entra de novo). A troca de papel
  NÃO revoga as sessões da pessoa: a segurança não depende disso, porque a
  escrita confere o papel do banco, e revogar obrigaria a entrar de novo com
  coleta na fila.
- **Cadeia da sessão:** o token de acesso emitido antes de uma renovação só
  escreve enquanto a família (`sessoes.familia_id`, migração 047) tem sessão
  não revogada.
- **Renovação contra encerramento (correção 2 da E07, migração 049):** até
  aqui a renovação revogava a antiga e abria a nova em DUAS transações, e o
  instante entre elas tinha dois efeitos. O grave: quem administra (ou a
  própria pessoa, a troca de senha, o reuso de token) encerrava as sessões
  nesse instante, não achava nada da cadeia para encerrar, e a renovação abria
  a nova herdando a família encerrada (a validação de 4b96ea7 viu sessão viva
  sobrar em 5 de 60 corridas). O benigno: a escrita com o token antigo nesse
  instante levava 401 `sessao_encerrada`. Uma transação só fecha o benigno,
  mas NÃO o grave: em READ COMMITTED o UPDATE de quem encerra não enxerga a
  linha que a renovação inseriu e ainda não confirmou. Por isso a renovação é
  uma transação só E toma `travar_sessoes_do_usuario` antes de revogar, e
  todo encerramento em massa toma a mesma trava num comando anterior ao UPDATE
  (`auth/sessoes.ts`, `revogar_sessoes_do_usuario`, `trocar_senha`,
  `consumir_recuperacao` e a suspensão do município pelo console,
  `console_suspender_municipio`, que toma a trava de cada pessoa com sessão
  de pé). `abrir_sessao` também recusa herdar família encerrada. A ordem das
  travas é uma só em todo caminho: quem atualiza a linha de `usuarios` o faz
  antes de tomar a trava; sem isso, a troca de senha pela própria pessoa no
  mesmo instante da redefinição por quem administra terminava em impasse
  (`deadlock detected`, um 500), provado em Postgres 17. Provado em
  `test/renovacao-contra-encerramento.test.ts`: o bloco de PGlite roda
  sempre; o de Postgres real só com `DC360_POSTGRES_DE_PROVA`, que o job
  `implantavel` do CI define contra o Postgres 16 do serviço (e reprova se o
  bloco sair pulado). As disputas seguradas desse bloco só soltam a renovação
  depois de VER a outra conexão parada na trava (`pg_locks`), e reprovam se
  ela não parar.
- **Entrar no mesmo instante da suspensão (consertado na migração 050):** o
  login abria sessão sem família e (até a correção 3 da E07, abaixo) não passava
  pela trava por pessoa, e `abrir_sessao` lia a suspensão com um SELECT comum. Medido em Postgres 16
  real nas duas ordens (o login primeiro, a suspensão primeiro): a sessão do
  login escapava da suspensão e, depois da reativação, renovava. A 050 faz o
  login (só ele) ler a suspensão com `FOR SHARE`, que conflita com o UPDATE de
  `organizacoes` da suspensão: quem chega segundo espera, e o login ou é
  recusado (DC367) ou tem a sessão revogada pela suspensão. A renovação
  continua lendo sem trava de linha, porque ela já segura a trava por pessoa
  e a linha depois dela fecharia ciclo com a suspensão (que toma a linha
  antes da trava). Provado no caso 9 de `test/renovacao-contra-encerramento.test.ts`
  e em `db/test/login-e-suspensao-na-mesma-linha.test.ts`.
- **Entrar no mesmo instante de uma mudança de credencial (correção 3 da E07,
  sem migração nova):** o login lia o hash, gastava o scrypt (cerca de 230 ms)
  e abria a sessão em outra transação, sem trava e sem reler nada; a troca de
  senha pela própria pessoa, a redefinição por quem administra ou a
  desativação que confirmasse nesse intervalo deixava viva a sessão do login
  com a senha antiga (a validação de 52952a1 mediu 13 de 30, 30 de 60 e 18 de
  30). Agora `emitirPar` (`auth/servico.ts`) abre a sessão, toma
  `travar_sessoes_do_usuario` e relê `senha_hash` e `ativo`, nessa ordem e
  numa transação só; se a credencial não é mais a conferida, tudo volta atrás
  e a resposta é a recusa genérica. A ordem é linha do município (o FOR
  SHARE da 050) antes da trava, igual à da suspensão; trava antes da linha
  fecharia ciclo com ela. O segundo fator e a ativação pelo desafio fazem o
  mesmo com a impressão da credencial que o desafio carrega (`cr`, HMAC do
  hash com o segredo de assinatura), e as rotas de ligar o segundo fator
  recusam o desafio cuja senha já mudou; a confirmação da ativação pelo
  desafio confere de novo DENTRO da transação que liga o recurso, sob a
  trava da pessoa (`credencialDoDesafioValeSobTrava`), e a senha que muda
  entre a conferência de `quemEsta` e essa transação não deixa o recurso
  ligado. Provado nos casos 6 a 8 e 10 do primeiro bloco e 10 a 20 do segundo
  de `test/renovacao-contra-encerramento.test.ts` (o 10 do primeiro e o 20 do
  segundo prendem a ordem: trava antes da linha do município faz a suspensão
  parar na trava e fecha ciclo, 40P01 medido) e em três casos de
  `test/segundo-fator.test.ts`.
- **Renovação que perde a trava para a desativação:** responde 403
  `conta_desativada` (pergunta a `dono_do_token`, como o token recusado),
  e não 401 `sessao_encerrada`. A mesma pergunta trata o reúso: quem perde
  para outra renovação com o MESMO token cai como reúso e encerra TODAS as
  sessões da pessoa (`revogar_sessoes_do_usuario`, motivo "reuso de token de
  renovacao"), e não só a família daquele token, que é o que já acontecia
  quando o segundo pedido chegava um instante depois.
- **Senha provisória vencida:** `trocarSenha` recusa por conta própria (401
  `sessao_encerrada`), além de a rota já recusar a escrita pela vigência.
  Entrar e renovar já recusavam. O ramo do prazo em `exigirVigencia` tem caso
  próprio desde o complemento da correção 3 (achado 3 do red-team de
  52952a1): a escrita comum com a provisória vencida responde 401
  `sessao_encerrada`, e não 403 `troca_de_senha_obrigatoria`
  (`test/senha-provisoria.test.ts`).
- **Trocar a senha no mesmo instante de uma reação (correção 4 da E07, sem
  migração nova):** `trocarSenha` conferia a senha atual numa transação,
  gastava os dois scrypt fora do banco e chamava `trocar_senha` em outra, que
  grava sem conferir nada. Quem tinha a senha antiga e uma sessão, com a troca
  em voo, desfazia a redefinição por quem administra, o link do email, a
  desativação ou a troca pela própria pessoa que confirmasse no meio, e ficava
  com a senha DELE, definitiva, e sessão viva (a validação de bb0f654 mediu 20
  de 30 sem grampo na redefinição). Agora a gravação é uma transação só, sob o
  município: a linha da pessoa com FOR NO KEY UPDATE, depois a trava da
  pessoa, depois a releitura (conta ativa, senão 403 `conta_desativada`;
  sessão de pé na cadeia de quem pede e provisória no prazo, senão 401
  `sessao_encerrada`; hash igual ao que o scrypt conferiu, senão a recusa da
  senha atual errada), e só então `trocar_senha`. A ordem é linha de
  `usuarios` antes da trava, a mesma da 049; trava antes da linha fecha ciclo
  com a redefinição (40P01 medido pela mutação). A sessão preservada é a VIVA
  da cadeia, e não o `sid` do token: com o token de antes de uma renovação a
  troca derrubava a própria cadeia (achado 2 da mesma validação). O token
  devolvido leva o `sid` da sessão viva e o papel relido sob a trava. Provado
  nos casos 11 a 19 do primeiro bloco e 7 e 21 a 31 do segundo de
  `test/renovacao-contra-encerramento.test.ts`.
- **Outros caminhos varridos na correção 4, sem o mesmo defeito:** a
  redefinição por quem administra, a desativação, a troca de papel e o link de
  recuperação conferem e gravam na MESMA transação, e não conferem segredo de
  quem pede (o link é conferido e gasto dentro de `consumir_recuperacao`, com
  FOR UPDATE na linha do link); a autoridade de quem administra vem da
  vigência do começo do pedido, e o ato dele é serializável antes de qualquer
  mudança que confirme depois (nenhuma delas lê o que ele grava). Desligar o
  segundo fator confere a senha e grava `segundo_fator` na mesma transação, e
  nenhuma reação lê ou grava `segundo_fator`: o resultado é o de desligar um
  instante antes da reação. Ligar o segundo fator pelo desafio já confere sob a
  trava desde a correção 3. **Fica anotado, fora desta correção:** desativar e
  rebaixar conferem "não é o último administrador" com uma contagem sem trava;
  dois administradores que se desativam (ou se rebaixam) no mesmo instante
  podem deixar o município sem administrador ativo. Lido no código, não
  medido; não é credencial nem sessão, e não entrou nesta correção.
- **`troca_de_senha_obrigatoria` na fila do campo:** PAUSA a fila (correção 1
  da E06, 2026-10-13), e não é mais recusa permanente. A decisão da E07, de deixar
  esse 403 bloquear a coleta porque o aparelho "praticamente não chega a ele",
  foi derrubada: redefinir a senha derruba as sessões, o agente entra com a
  provisória, e o dreno recebia 403 em toda escrita. A matriz do transporte está
  em `apps/campo/PENDENCIAS.md`, item 14. A API não mudou aqui: continua
  respondendo 403 `troca_de_senha_obrigatoria` a toda rota fora da lista aberta.

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
cache, prefetch e repetição automática supõem. A vigência já vale nesta rota
(ela carrega `ROTA_GET_COM_EFEITO` desde a correção 1 da E04, então conta
desativada, papel rebaixado e sessão encerrada não disparam mais essas
escritas), mas a rota continua sendo um GET que escreve. A marca sai quando a
rota virar só leitura.

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
2. **`encerrarMinhasSessoes` preservava por id de sessão** (a lista marca "esta"
   por família). Com um token de acesso anterior à última renovação, o botão
   "encerrar as outras" derrubava a sessão viva da própria cadeia, e a mensagem
   dizia que ela continuava aberta. Corrigido na correção 1 da E04: a
   preservação é pela família (`encerrarSessoes` em `auth/sessoes.ts`), travada
   em `test/get-com-efeito.test.ts`. Sem pendência.
3. **O resumo do aparelho** (`auth/aparelho.ts`) é uma lista curta de padrões de
   user-agent. O que não reconhece vira "Aparelho não identificado" em vez de
   palpite; ampliar a lista é barato e fica para quando houver caso real.
4. **A própria conta com o id em outra caixa** (achado 1 da validação de
   bb0f654). As recusas de redefinir a própria senha, encerrar as próprias
   sessões e desativar a si mesma comparavam o id da rota com o do token como
   texto, e o Postgres lê o uuid sem caixa: o próprio id em maiúsculas passava
   (a administradora redefinia a própria senha sem a atual). Corrigido na
   correção 3 da E09: o esquema do id em `rotas/administracao.ts` devolve o id
   em minúsculas antes de qualquer comparação; os formatos alternativos de uuid
   (chaves, sem hífens, `urn:uuid:`) o `uuid()` do zod já recusa com 422.
   Travado em `test/id-da-propria-conta.test.ts`. As outras comparações de id
   do corpo com o do token (`agenteId` em `saida-a-campo.ts`, `coletadaPor` em
   `evidencias.ts` e `sincronizacao.ts`, `devolvidaPor` em `sincronizacao.ts`)
   usam `!==` para RECUSAR: um id em outra caixa é recusado (`autor_divergente`),
   nunca aceito, e o aplicativo manda o id do próprio token. Sem pendência de
   segurança; a recusa falsa de um cliente que mandasse maiúsculas não existe
   hoje. A redefinição que perdia para a troca de senha em voo (achado 2 da
   mesma validação) foi fechada pela correção 4 da E07.

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
5. **O link pendente morre com a credencial** (correção 3 da E10, migração 051;
   bloqueava o CP-19 pela rodada 4 da validação). Toda mudança de senha (a
   redefinição por quem administra, a troca pela própria pessoa, o próprio link e
   qualquer caminho futuro) e toda desativação marcam `usada_em` nos links
   pendentes da pessoa, por gatilho em `usuarios`, na mesma transação; a
   reativação não ressuscita nenhum. `consumir_recuperacao` confere a conta ativa
   (conta desativada: o link é gasto e nada mais muda) e segura a linha da pessoa
   antes da linha do link, a mesma ordem do gatilho (a ordem inversa fecha ciclo
   com a redefinição; 40P01 medido pela mutação). Travado em
   `test/recuperacao-morre-com-a-credencial.test.ts` e no caso 32 de
   `test/renovacao-contra-encerramento.test.ts`. Efeito aceito, escrito para não
   virar surpresa: quem tem uma sessão e a senha atual e troca a senha também mata
   o link que a pessoa acabou de pedir; a pessoa vê "este link não vale mais" e o
   remédio que vence sempre é a redefinição por quem administra, que derruba as
   sessões. A redefinição pelo link que perdia para a troca em voo (o FAIL do QA na
   rodada 4) foi fechada pela correção 4 da E07.
6. **O gatilho da 051 roda sob RLS forçada, com o papel de quem atualizou
   `usuarios`** (anotado pela revisão do complemento, sem defeito hoje). A função
   `invalidar_recuperacoes_pendentes` é comum (SECURITY INVOKER) para não gastar
   vaga no teto de 27 funções SECURITY DEFINER, e `recuperacoes_senha` tem RLS
   forçada (034). Hoje todo caminho que muda senha ou desativa conta passa por
   uma de duas portas que funcionam: a rota com `dc360_app` e o município no
   contexto (a policy de UPDATE deixa marcar os links do município), ou uma
   função SECURITY DEFINER cujo dono ignora RLS. O risco é de um caminho FUTURO:
   um UPDATE de `senha_hash` ou `ativo` sem município no contexto (um relógio,
   um script de operação, o console) feito por um papel sem BYPASSRLS. O
   UPDATE do gatilho não estoura: enxerga zero linhas e marca zero links, em
   silêncio, e o link pendente sobrevive à mudança. É o mesmo risco que a 037
   descreve para o expurgo de `notificacoes_enviadas` (o que funciona depende
   de um atributo do papel, que nada no produto garante). Quem escrever um
   caminho assim precisa pôr o município no contexto antes do UPDATE, ou fazer a
   mudança por uma função SECURITY DEFINER; e um teste que mude a senha por esse
   caminho e confira o link morto.

## Dois montadores de dados do documento, e eles podem divergir outra vez (V2-F00-E12)

**Onde:** `src/rotas/documentos.ts` (a consulta de vistoria da rota) e
`src/saida/pacote.ts` (a consulta de vistorias do montador do pacote).

**O que acontece:** os dados que `src/documentos/laudo.ts` imprime são montados em
DOIS lugares, por duas consultas escritas à mão, e nada obriga as duas a lerem os
mesmos campos. Foi assim que o defeito desta etapa nasceu: a consulta do pacote
nunca selecionava `equipe_designada_nome` nem `equipe_do_agente_nome`, então
`avisoDeEquipe` não tinha o que imprimir e o laudo de dentro do ZIP saía sem a
ressalva de equipe divergente, enquanto o laudo emitido pela rota, para a MESMA
vistoria, saía com ela. O município que levasse o pacote embora levaria o papel
limpo, e é esse o papel que fica no processo depois de o contrato acabar.

**O que foi corrigido:** as duas junções (`equipes ed` por `v.equipe_designada_id`
e `equipes ea` por `v.equipe_do_agente_id`) entraram na consulta do pacote, iguais
às de `documentos.ts`. São `LEFT JOIN` de propósito: as duas colunas são nulas em
toda vistoria anterior à migração 024, e junção interna apagaria essas vistorias
do pacote em vez de só deixar o aviso de fora.

**O que sobra, medido em 2026-10-13:** a DUPLICIDADE. Campo novo que o laudo passe a imprimir continua
tendo de entrar nas duas consultas, e esquecer uma delas volta a produzir dois
documentos que se contradizem. A unificação num montador só é a **V2-F09-E02**, e
até ela existir a defesa é o teste que compara os dois documentos ENTRE SI, e não
cada um contra um texto esperado: os casos do bloco "O laudo do pacote avisa a
equipe divergente igual ao laudo da rota" em `test/saida-de-municipio.test.ts` e a
seção 29 de `apps/web/test/fluxo-api.e2e.mjs`. O artefato guardado com hash (o
mesmo arquivo em vez de dois montadores) é da F09-E04 e F09-E11.

**As diferenças entre os documentos da rota e os do pacote, para a MESMA vistoria**
(a validação de 7005a60 gerou os dois laudos e comparou, a de 4b96ea7 achou a
assinatura declarada e ausente, a de 52952a1 achou a assinatura coletada e
perdida, e a varredura da correção 3, com a API rodando, achou o termo de
interdição depois de re-vistoria; o bloco "campo por campo" de
`test/saida-de-municipio.test.ts` trava as diferenças abaixo, e reprova se uma
das que continuam some, se a deliberada muda ou se uma das consertadas volta,
para este texto e o de `docs/SAIDA-DE-MUNICIPIO.md` serem atualizados junto. Ele
NÃO compara os documentos inteiros: olha os títulos das seções, a coordenada, a
posição da foto avulsa, a seção dos registros perdidos e o bloco da assinatura
de quem estava no local, no laudo e, nos casos da assinatura perdida e da
re-vistoria, no termo de interdição, e uma diferença nova noutro campo passa
por ele):

| Campo | Rota | Pacote | Estado |
| --- | --- | --- | --- |
| Aviso de equipe | imprime | imprime, igual | igual (E12) |
| Coordenada da vistoria (`v.latitude`, `v.longitude`) | imprime | imprimia "não registrada" | **consertada na correção 1 da E12**: duas colunas a mais na consulta do pacote |
| Fotos do "Registro fotográfico" | só as da vistoria vigente (`vistoria_id` igual ao da vistoria) | as de TODAS as vistorias da ocorrência e a avulsa (`vistoria_id` nulo), numeradas como da vistoria | **continua**, F09-E02 |
| Seção "Fotografias anexadas ao protocolo" (`fotosAvulsas`) | imprime, com quem anexou | não existe | **continua**, F09-E02 |
| Seção "Registros capturados que não puderam ser recuperados" (`vistoria_evidencias_perdidas`) | imprime, só as perdas da vistoria vigente | não existia (o pacote não lia a tabela); agora lê `vistoria_evidencias_perdidas` sob o tenant e entrega a cada documento só as perdas da vistoria vigente, e a seção sai igual no laudo e no termo de interdição | **consertada na correção 3 da E12** |
| Assinatura coletada e perdida no aparelho (`assinatura_chave` nula e uma perda com `papel = 'assinatura'`) | "Assinatura coletada em campo e não recuperada do aparelho" (`ausenciaDaAssinatura`), no laudo e no termo de interdição | imprimia "Assinatura não coletada" nos dois documentos, contra o `tabelas/vistoria_evidencias_perdidas.csv` do próprio pacote; com as perdas lidas, imprime a mesma frase da rota | **consertada na correção 3 da E12** |
| Termo de interdição de protocolo que recebeu re-vistoria depois da interdição | a segunda via sai da vistoria do ato (`vistoria_do_ato`, a gravada na emissão do termo) | sai da vistoria vigente, a re-vistoria, como todos os documentos do pacote | **continua**, F09-E02 ("vistoria do ato") |
| Assinatura presente no armazenamento, ou vistoria sem assinatura e sem perda registrada | imagem; "Assinatura não coletada" | o mesmo | igual |
| Assinatura declarada (`assinatura_chave`) e AUSENTE no armazenamento | confere o prefixo do município, descreve o objeto e imprime "Assinatura não coletada" | imprimia uma imagem quebrada em cima do nome de quem estava no local (montava o caminho só pela chave); agora faz as mesmas duas conferências (`conferirAssinatura`) e imprime "Assinatura não coletada", e a falta continua registrada em `PENDENCIAS-DA-EXTRACAO.txt` | **consertada na correção 2 da E12** |
| Assinatura declarada e o armazenamento SEM RESPOSTA na conferência (`descrever` lança) | trata como ausente (`.catch(() => ({ existe: false }))`) e imprime "Assinatura não coletada" | imprime "Não foi possível conferir a assinatura no armazenamento ao montar este pacote", sem imagem; leva o arquivo se a cópia funcionar, senão o registra em `PENDENCIAS-DA-EXTRACAO.txt` como NÃO LIDO | **diferente de propósito** (correção 2 da E12, revisão): a primeira versão mantinha a imagem, e com o provedor caído a cópia falhava junto e o quadro quebrado voltava; afirmar "não coletada" contradiria o próprio pacote, que diz que falta de resposta não é arquivo inexistente |

A gravidade das três que continuam: a foto avulsa aparece no pacote como feita
pelo agente na vistoria (o documento atribui a ele uma imagem que não fez, o
defeito que a rota já tinha consertado), e o termo de interdição do pacote, num
protocolo que recebeu re-vistoria depois da interdição, imprime embaixo de "Fica
INTERDITADO" a re-vistoria, que pode ser justamente a que atestou a cessação do
risco: um papel que se contradiz, o mesmo defeito que a segunda via da rota já
tinha consertado. Por isso `docs/SAIDA-DE-MUNICIPIO.md` não afirma que os
documentos do pacote dizem o mesmo que os emitidos: só o aviso de equipe, a
coordenada, a seção dos registros perdidos e os quatro estados da assinatura
(presente, ausente sem registro, declarada sem arquivo e coletada e perdida)
estão provados iguais, e a do armazenamento sem resposta difere de propósito,
com a tabela pública dizendo isso.

Até a correção 3 havia uma quarta, mais grave do que as outras: o pacote não
lia `vistoria_evidencias_perdidas`, e quando a assinatura tinha sido coletada e
se perdido no aparelho, o laudo e o termo de interdição dele afirmavam
"Assinatura não coletada" (no termo, embaixo de "Responsável pelo imóvel,
ciente"), contra o registro do banco que o próprio pacote exporta. Não era só
um documento incompleto: afirmava o contrário do fato.

Depois da correção 3, o pacote imprime "Assinatura não coletada" em três casos,
e só neles: o banco não registra assinatura nem a perda dela; o armazenamento
respondeu que o arquivo da assinatura declarada não existe; ou a chave gravada
não começa por `tenant/<município>/`, e `conferirAssinatura`
(`src/saida/pacote.ts`) responde "ausente" sem perguntar ao armazenamento, como
`enderecoDaAssinatura` faz na rota. O terceiro não acontece pela API: a
sincronização remonta a chave a partir do município do token e aproveita do
aparelho só o nome do arquivo (`src/rotas/sincronizacao.ts`), e o banco recusa
chave fora do prefixo (`assinatura_com_prefixo_do_tenant`, migração 009). A
conferência no pacote é a camada seguinte, para um registro gravado por fora da
aplicação.

## O que estava fora daqui (acrescentado na revisão de 2026-10-07)

1. **`GET /orgaos` responde a qualquer papel autenticado.** Onde:
   `src/rotas/orgaos.ts`, rota `GET /`, que só chama `exigirAutenticacao`. O
   catálogo de órgãos traz o e-mail e o telefone de cada órgão, e o token do
   agente de campo o lê. Não é dado de cidadão nem de outro município (o RLS
   recorta ao município do token), mas é leitura que o papel do agente não
   precisa. Achado da V2-F00-E08, fora do escopo dela; outras leituras que
   exigem só autenticação entram no manifesto rota por ação da F03-E12.
2. **Município com o acesso suspenso não baixa o pacote de saída.** Onde:
   `src/rotas/saida.ts` (`POST /saida/pacote.zip`). A rota é uma escrita, toda
   escrita confere a suspensão, e a resposta é 403 `acesso_suspenso`, provada em
   `test/pacote-de-saida-contrato.test.ts`. É o comportamento que a V2-F00-E11
   pediu, mas é decisão de contrato: o município em litígio é o que mais quer
   sair. Se a saída precisar de exceção à suspensão, a decisão é de Rafael com o
   jurídico (perto do CP-29); até lá fica como está, e
   `docs/SAIDA-DE-MUNICIPIO.md` (capítulo 2) diz para baixar e conferir o pacote
   ANTES de agendar a eliminação.
3. **Ninguém desliga o segundo fator de outra pessoa.** `src/rotas/segundo-fator.ts`
   só tem as rotas da própria conta (`/iniciar`, `/confirmar`, `/desativar`).
   Quem perdeu o telefone usa os códigos de recuperação; quem perdeu o telefone
   E os códigos não tem caminho pela tela. É uma porta para retirar a proteção
   de uma conta alheia e merece etapa própria (F03-E11).
4. **Encerrar sem triagem é regra só da tela.** `POST /ocorrencias/:id/encerramento`
   (`src/rotas/ocorrencias.ts`) exige a permissão `encerrar_ocorrencia` e a
   transição, e `TRANSICOES_PERMITIDAS` (`packages/shared/src/dominio.ts`) deixa
   `rascunho` e `registrada` irem para `encerrada`. Quem esconde o botão antes
   da triagem é `apps/web/src/paginas/ocorrencia-regras.ts`. Isso contraria a
   regra do projeto de que regra de negócio mora no banco e no pacote
   compartilhado, não na tela: ou a máquina de estados passa a exigir a
   triagem, ou o documento assume que encerrar cedo é permitido (o comentário
   da máquina diz que é, para o chamado improcedente). Achado da V2-F00-E22,
   correção 4; decisão de produto (a F10, consolidação do painel, é uma sugestão de
   dono, não decisão).
5. **A API mede o motivo da desinterdição antes do `trim`.**
   `desinterdicaoSchema` (`packages/shared/src/schemas.ts`) exige 15 caracteres
   sobre o texto bruto, e a rota grava `motivo.trim()`: quem chamar a API direto
   passa 15 espaços e uma letra. O painel não tem esse furo, porque apara antes de
   validar (`apps/web/src/paginas/Ocorrencia.tsx`, `desinterdicaoSchema.safeParse({
   motivo: motivo.trim() })`); o guia do coordenador descreve a tela. Anotado.
6. **As métricas do município ainda contam o dia pelo relógio do banco.**
   `db/migrations/023_metricas_do_municipio.sql` (perto da linha 84) agrupa por
   dia sem converter para o fuso do município. A V2-F02-E09 moveu para o fuso
   da UF só o ano do protocolo e as datas e o nome do CSV
   (`packages/shared/src/fuso.ts`); as métricas ficaram de fora de propósito,
   porque mudar a janela do dia reescreve séries já exibidas. Decisão de
   produto, a tratar junto com qualquer etapa que mexa nas métricas.

## O espelho legado sem prefixo (V2-F02-E01)

A API responde toda rota de negócio sob `/v1` e, ainda, sem prefixo, para o
aplicativo de campo já instalado (ver o README, "A versão no caminho"). O que
fica em aberto:

1. **`ESPELHO_LEGADO_ATE` é uma data PROVISÓRIA** (`2027-12-31`). Ela só
   alimenta o cabeçalho `Sunset`; nada deixa de responder nela. Quem fixa a data
   de verdade, com o dado de uso e a versão mínima de cada aplicativo, é a
   V2-F02-E08, e quem retira o espelho é a V2-F28-E11. O Rafael confirma ou troca
   a data na E08.
2. **`Deprecation` sai com o valor `true`**, a forma do rascunho que o RFC 9745
   substituiu por uma data. A data de início da depreciação é decisão da E08.
3. **O painel, o campo e o console ainda falam o caminho sem prefixo.** Migrá-los
   para `/v1` é a V2-F02-E02; até lá o espelho é o caminho vivo dos três, e o
   cabeçalho de depreciação já aparece nas respostas que eles recebem.
4. **Nada mede o uso do espelho ainda.** Sem essa medição, a data de retirada não
   tem como ser decidida com dado. É escopo da E08.

## O contrato OpenAPI do `/v1` (V2-F02-E04)

O registro de rotas (`src/contrato/rotas.ts`) e o documento gerado
(`openapi/v1.json`) existem, mas descrevem a API pela metade. O que fica em
aberto, com o número de cada coisa no relatório
(`docs/evidencias-v2/G02/V2-F02-E04/relatorio-de-rotas.txt`):

1. **A dívida das respostas.** A maioria das entradas existentes ainda não tem
   `resposta`: o documento as marca com `x-resposta-pendente` e o status
   `default`, sem inventar um 200. Descrever a resposta de cada rota é a dívida,
   e o relatório conta quantas faltam. Não reprova (as existentes sem resposta
   saem num relatório); rota `nova` sem resposta reprova.
2. **As rotas sem entrada (`pendentes`).** Quarenta rotas registradas ainda não
   têm entrada, porque o corpo ou a query delas é validado por um esquema que
   mora dentro de `src/rotas/*.ts` (`entradaSchema`, `consultaSchema`,
   `emissaoSchema`...). Copiar esse esquema para o contrato criaria a segunda
   fonte da verdade que a etapa quer evitar, então cada grupo declara a lista
   (`pendentes`) e o teste conta e limita: o teto só desce. O lote 3 da F02
   (partes 3C1 a 3C3) exporta cada esquema, descreve a rota e zera a lista.
3. **Sem validador de OpenAPI.** A conferência é estrutural, escrita no teste
   (versão 3.1.0, caminhos, parâmetros de caminho, referências). Um validador de
   verdade seria dependência nova, e a escolha exige `npm audit` em zero.
4. **A segurança por rota não está no documento.** Quais rotas aceitam token e
   quais são públicas fica para a V2-F03-E12, que estende este mesmo registro
   com ação, ator, plateia e escopo.
5. **Regras `refine` só como texto.** O JSON Schema não expressa `refine` nem
   `superRefine`; o documento as anota em `x-regras-adicionais` (campo e texto
   da regra), não como `if/then`. Um cliente gerado do documento não as
   valida sozinho. Traduzir as mais comuns (campo obrigatório quando outro tem
   certo valor) para `if/then` é possível e fica para quando houver cliente
   gerado (F08-E04).

## Idempotência da criação: o padrão para os próximos criadores (V2-F02-E07)

`POST /ocorrencias` aceita `chaveDeCriacao` (uuid, opcional) e `evidencias`
passou a recusar a chave de foto que já é de outra ocorrência. O padrão que os
próximos criadores copiam (encaminhamento da F04-E08, anexo da F06, relato da
F17-E08), e o que ainda não está coberto:

1. **O padrão, em quatro peças.** (a) O CLIENTE gera o uuid quando abre o
   formulário e o reaproveita em todo reenvio (`novaChaveDeCriacao` em
   `apps/web/src/paginas/ocorrencia-regras.ts`; quem repete o pedido sem a
   mesma chave abre outro registro). (b) Coluna `chave_de_criacao uuid` NULA por
   padrão e índice único PARCIAL `(organizacao_id, chave)` `WHERE chave IS NOT
   NULL`: a chave nunca vale fora do município do token. (c) A rota lê pela
   chave ANTES de qualquer coisa que gaste (no chamado, o `proximo_protocolo`) e
   devolve 200 com o registro existente. (d) Na corrida, o segundo INSERT cai no
   índice (23505 com a constraint conhecida), a transação inteira volta, a rota
   relê e devolve 200. Só esse 23505 é engolido: qualquer outro sobe. O teste
   `apps/api/test/chave-de-criacao.test.ts` é o molde, com a corrida simulada
   (o banco em memória tem uma conexão só e não corre sozinho).
2. **O reenvio com corpo diferente devolve o registro ORIGINAL, sem alterá-lo e
   sem avisar.** É o que a etapa pede (a chave identifica o ato, não o conteúdo).
   Se um cliente reaproveitar a chave num formulário novo por engano, o
   segundo chamado não nasce e a tela mostra o primeiro. O painel evita isso
   gerando a chave na abertura do formulário; um cliente de terceiros, não. Se
   isso virar problema, a saída é comparar um resumo do corpo e responder 409
   `chave_ja_usada_em_outro_registro` quando divergir.
3. **A resposta de repetição é 200 e a de criação é 201**, com o mesmo corpo
   (`{ id, protocolo }`). O painel não distingue os dois; quem precisar saber se
   o chamado já existia olha o status.
4. **O 409 da chave de foto só vale se a chave for um uuid POR foto.** Conferido
   no campo (`apps/campo/src/app/(agente)/vistoria/[id].tsx`): a foto e a
   assinatura recebem `Crypto.randomUUID()` na captura, e a chave do rascunho
   guarda a mesma durante concluir, corrigir e concluir de novo, sempre dentro
   da mesma ocorrência. Nenhum caminho do campo reaproveita a chave entre
   ocorrências, então o aparelho já instalado não recebe o 409 em uso normal. O
   campo trata 4xx como permanente (a coleta vira `bloqueado`): se um dia surgir
   um aparelho que reaproveite a chave, o item para em vez de gravar a foto na
   ocorrência errada, que é o mesmo defeito de antes, só que visível.
5. **O índice de evidência da 052 é mais fraco que o da 004**
   (`evidencias_idempotencia`, por município e chave). Hoje a 004 já impede a
   mesma chave em duas ocorrências do município, então o novo não rejeita nada
   a mais. Ele fica por ser o contrato da etapa e como segunda rede se a 004
   for afrouxada. Se a decisão for um dia permitir a mesma chave em
   ocorrências distintas, a 004 sai e o 409 da API sai junto.
6. **Falta o resto dos criadores.** `POST /ocorrencias` e a foto são os dois
   cobertos. Vistoria já tinha a sua; relato do cidadão, anexo e
   encaminhamento nascem com o padrão acima nas etapas deles. Não existe
   cabeçalho `Idempotency-Key` genérico (fora do escopo; só se surgir
   necessidade).
