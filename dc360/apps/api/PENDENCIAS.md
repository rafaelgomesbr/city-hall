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
| Dois montadores de dados do laudo: o do pacote mistura as fotos de todas as vistorias, não imprime as seções das fotos avulsas e dos registros perdidos, e imprime imagem quebrada quando a assinatura declarada falta no armazenamento | "Dois montadores de dados do documento" | F09-E02 |
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
  `consumir_recuperacao`). `abrir_sessao` também recusa herdar família
  encerrada. Provado em `test/renovacao-contra-encerramento.test.ts`: o bloco
  de PGlite roda sempre; o de Postgres real só com `DC360_POSTGRES_DE_PROVA`
  (o CI ainda não o liga). Fora da trava: a suspensão do município pelo console
  (`console_suspender_municipio`), que encerra por município e não por
  pessoa. Uma renovação que confirme no mesmo instante da suspensão ainda pode
  deixar uma sessão de pé; ela não escreve nem renova enquanto a suspensão
  durar (a vigência e `abrir_sessao` leem a suspensão), mas volta a valer se
  o município for reativado dentro do prazo dela. Não medido; fica aqui até
  alguém decidir se a suspensão também toma trava.
- **Senha provisória vencida:** `trocarSenha` recusa por conta própria (401
  `sessao_encerrada`), além de a rota já recusar a escrita pela vigência.
  Entrar e renovar já recusavam.
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

**As diferenças entre os dois laudos, para a MESMA vistoria** (a validação de
7005a60 gerou os dois e comparou, e a de 4b96ea7 achou a assinatura; o bloco
"campo por campo" de `test/saida-de-municipio.test.ts` trava as diferenças
abaixo, e reprova se uma delas some, para este texto e o de
`docs/SAIDA-DE-MUNICIPIO.md` serem atualizados junto. Ele NÃO compara o laudo
inteiro: olha os títulos das seções, a coordenada, a posição da foto avulsa e
o bloco da assinatura de quem estava no local, e uma diferença nova noutro
campo passa por ele):

| Campo | Rota | Pacote | Estado |
| --- | --- | --- | --- |
| Aviso de equipe | imprime | imprime, igual | igual (E12) |
| Coordenada da vistoria (`v.latitude`, `v.longitude`) | imprime | imprimia "não registrada" | **consertada na correção 1 da E12**: duas colunas a mais na consulta do pacote |
| Fotos do "Registro fotográfico" | só as da vistoria vigente (`vistoria_id` igual ao da vistoria) | as de TODAS as vistorias da ocorrência e a avulsa (`vistoria_id` nulo), numeradas como da vistoria | **continua**, F09-E02 |
| Seção "Fotografias anexadas ao protocolo" (`fotosAvulsas`) | imprime, com quem anexou | não existe | **continua**, F09-E02 |
| Seção "Registros capturados que não puderam ser recuperados" (`vistoria_evidencias_perdidas`) | imprime | não existe | **continua**, F09-E02 |
| Assinatura declarada (`assinatura_chave`) e AUSENTE no armazenamento | confere o prefixo do município, descreve o objeto e imprime "Assinatura não coletada" | monta o caminho só pela chave e imprime uma imagem quebrada em cima do nome de quem estava no local; a falta fica registrada só em `PENDENCIAS-DA-EXTRACAO.txt` ("Assinatura ausente no armazenamento: protocolo ..., chave ...") | **continua**, F09-E02 |

A gravidade das quatro que continuam: a foto avulsa aparece no pacote como feita
pelo agente na vistoria (o documento atribui a ele uma imagem que não fez, o
defeito que a rota já tinha consertado), a seção dos registros perdidos
some, então o laudo do pacote parece completo sendo incompleto, e a assinatura
que falta no armazenamento vira um quadro quebrado em cima do nome da pessoa,
que no papel pode ser lido como assinatura que houve (a ressalva está só no
arquivo de pendências do pacote, não no laudo). Por isso
`docs/SAIDA-DE-MUNICIPIO.md` não afirma mais que o laudo do pacote diz o mesmo
que o emitido: só o aviso de equipe e a coordenada estão provados iguais.

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
