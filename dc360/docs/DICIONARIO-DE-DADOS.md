# Dicionário de dados

- **Versão:** 2, de 15/09/2026 (a 1 era de 09/09/2026)
- **Para quê:** entregar junto com a exportação de saída de município
  (`SAIDA-DE-MUNICIPIO.md`), e servir de referência para quem for auditar ou
  migrar. `status = 'em_campo'` não se explica sozinho.

Este documento descreve o **significado**. A estrutura autoritativa são as
migrações em `db/migrations/`, e elas mandam em caso de divergência.

---

## Regras que valem para o banco inteiro

**`organizacao_id` em toda tabela de negócio.** É o município dono da linha. A
segurança em nível de linha está **ativada e forçada** em todas elas, e o papel
de aplicação (`dc360_app`) não é dono nem superusuário, então não a contorna. O
município vem sempre do token verificado, colocado na transação com `SET LOCAL`,
e nunca de parâmetro de requisição.

**Nada se apaga.** Ocorrência se encerra com motivo; usuário e equipe se
desativam. As chaves estrangeiras usam `ON DELETE RESTRICT` justamente para que
uma remoção acidental esbarre no banco.

**A trilha não se reescreve.** `trilha_eventos` e `trilha_administrativa` não
têm política de alteração nem de remoção: o banco simplesmente não permite.
Correção entra como evento novo.

**Tempo é sempre `timestamptz`**, gravado em UTC e exibido no fuso de quem lê.

**Nulo significa "não sei", nunca zero.** Vale especialmente para a contagem de
pessoas atingidas: `NULL` é "não contado", e o laudo diz isso por extenso, para
ninguém ler zero onde ninguém contou.

---

## `organizacoes`

O município. Uma linha por órgão de proteção e defesa civil.

| Coluna | Significado |
| --- | --- |
| `id` | Identificador. É o valor que aparece como `organizacao_id` em todas as outras |
| `nome` | Nome do órgão, como sai no cabeçalho dos documentos |
| `municipio`, `uf` | Município e unidade federativa |
| `criado_em` | Quando foi provisionado |
| `acesso_suspenso_em`, `suspensao_motivo` | O fornecedor suspendeu o acesso (migração 038). Enquanto preenchido, nenhuma sessão nova abre (`abrir_sessao` recusa) e todas as sessões existentes foram revogadas com o motivo "acesso suspenso pelo fornecedor". Os dois andam juntos: não há suspensão sem motivo |
| `eliminacao_agendada_para` | O fim do prazo de arrependimento de sete dias. Preenchido junto com a linha do livro de eliminações, é o que autoriza o relógio da API a apagar. Cancelar limpa. Exige suspensão |
| `eliminada_em` | As linhas filhas já foram apagadas. A linha da organização **fica** até o armazenamento ser purgado, para a API saber qual prefixo purgar (`tenant/<id>/`) |
| `armazenamento_purgado_em` | Marcada por `concluir_eliminacao` um instante antes de a linha ser apagada |

**Essas cinco colunas são do fornecedor.** O papel de aplicação tem `UPDATE`
em `organizacoes`, mas o gatilho `suspensao_nao_se_altera_pela_aplicacao`
recusa qualquer escrita nelas vinda de `dc360_app`: um município não limpa a
própria suspensão, e não marca a si mesmo como eliminado. Só as funções do
console (`console_suspender_municipio`, `console_reativar_municipio`,
`console_agendar_eliminacao`, `console_cancelar_eliminacao`) e as do relógio
(`executar_eliminacoes_vencidas`, `concluir_eliminacao`) as escrevem.

---

## `usuarios`

Servidor público que usa o sistema. **Não se apaga:** assina laudo e aparece na
trilha.

| Coluna | Significado |
| --- | --- |
| `nome` | Como aparece assinando o laudo |
| `matricula` | Matrícula funcional. É por ela que se entra no sistema |
| `email` | Institucional. Usado em recuperação de senha |
| `papel` | `administrador`, `coordenador`, `operador` ou `agente_campo`. A hierarquia é por posto numérico: ver ADR 0006 |
| `equipe_id` | A equipe do agente. Decide quais tarefas ele recebe. Nulo para quem não vai a campo |
| `ativo` | `false` é o "apagado" deste sistema. O município nunca fica sem administrador ativo |

---

## `equipes`

| Coluna | Significado |
| --- | --- |
| `nome` | Como o coordenador a chama ao despachar |
| `especialidade` | Texto livre. Informativo |
| `ativa` | Equipe desativada não recebe despacho e continua nos registros antigos |

---

## `ocorrencias`

O centro do sistema. Uma linha por atendimento.

| Coluna | Significado |
| --- | --- |
| `protocolo` | O número que o cidadão anota, no formato `NNNNNN/AAAA`. Único por município e por ano, gerado por sequência própria de cada município |
| `tipo` | Nomenclatura COBRADE: `deslizamento`, `inundacao`, `alagamento`, `enxurrada`, `vendaval`, `granizo`, `colapso_edificacao`, `incendio_urbano`. Não é taxonomia nossa |
| `status` | Ver a tabela de estados abaixo |
| `severidade` | `baixa`, `media`, `alta`, `critica`. Definida na triagem, e é ela que dá o prazo. Nula antes da triagem |
| `vulnerabilidade_presente` | Há pessoa em situação de maior risco no local |
| `vulnerabilidade_descricao` | **Dado sensível.** Obrigatória quando a anterior é verdadeira. Não aparece em lista, resumo nem exportação básica |
| `endereco` | Endereço do imóvel. É o objeto do atendimento, e permanece mesmo depois da minimização |
| `latitude`, `longitude` | Coordenada. Nula quando não foi registrada. Existe porque no morro numeração muitas vezes não existe |
| `solicitante_nome`, `solicitante_contato` | Quem acionou. **São os campos que a retenção por minimização remove no fim do prazo** |
| `canal_entrada` | `telefone`, `whatsapp`, `presencial`, `oficio` ou `outro` |
| `descricao` | O relato, nas palavras de quem ligou |
| `equipe_id` | Para quem foi despachada |
| `vinculada_a` | Aponta para outra ocorrência do mesmo evento. É como duplicidade se resolve sem apagar nada |
| `prazo_em` | Quando vence. Calculado na triagem a partir da severidade. **Despachar não mexe nele** |
| `encerrado_em`, `motivo_encerramento` | Obrigatórios quando `status = 'encerrada'`, e o banco recusa encerrar sem motivo |

### Estados de `status`

| Estado | Significa | Quem move |
| --- | --- | --- |
| `rascunho` | Registro começado e não confirmado | Operador |
| `registrada` | Chamado aberto, ainda sem classificação. **Sem prazo** | Operador |
| `triagem` | Classificada: tipo e severidade definidos. O relógio começa | Coordenador |
| `em_campo` | Despachada para equipe. É este estado que faz a tarefa aparecer no aparelho | Coordenador |
| `vistoria_concluida` | Vistoria recebida e laudo disponível | Agente, pela sincronização |
| `providencia_pendente` | Há providência encaminhada e não respondida | Coordenador |
| `encerrada` | Terminada, com motivo | Coordenador |

---

## `vistorias`

O que o agente registrou no local. Uma por visita.

| Coluna | Significado |
| --- | --- |
| `agente_id` | Quem foi. Nulo só se o usuário foi removido, o que não acontece |
| `checklist` | `JSONB`, lista de `{chave, resposta}`. As chaves são `risco_iminente`, `evacuacao_necessaria`, `interdicao_indicada`, `acionar_outro_orgao`, `danos_estruturais`, `acesso_comprometido` |
| `gps_precisao_metros` | Precisão da leitura no momento da coleta. Número alto significa leitura ruim, e o laudo mostra para quem for julgar |
| `assinante_nome` | Quem estava no local e assinou |
| `assinatura_chave` | Endereço do traço de assinatura no armazenamento. **Nulo significa que não foi coletada**, e o laudo declara isso em vez de deixar espaço em branco |
| `observacoes` | Texto livre do agente |
| `coletada_em` | **Quando a vistoria aconteceu de verdade**, no relógio do aparelho. É a data de referência do ato |
| `sincronizada_em` | Quando chegou ao servidor. Diferente da anterior sempre que a coleta foi sem sinal, e o laudo mostra as duas |
| `idempotency_key` | Cunhada pelo aparelho ao abrir a vistoria. É o que impede a mesma coleta de virar duas vistorias quando a rede repete o envio |
| `desalojados` | Saíram de casa e têm para onde ir. **`NULL` é "não contado"** |
| `desabrigados` | Dependem de abrigo público. É o número que dimensiona vaga de abrigo |
| `feridos`, `desaparecidos`, `obitos` | Mesma regra do nulo |

---

## `evidencias`

Fotografia anexada a uma vistoria.

| Coluna | Significado |
| --- | --- |
| `chave_storage` | Onde o arquivo está. Entregue por endereço temporário assinado, nunca por link público |
| `legenda` | Texto do agente |
| `latitude`, `longitude`, `capturada_em` | Onde e quando a foto foi tirada |
| `ordem` | Sequência no laudo |

---

## `providencias`

O encaminhamento que sai de uma vistoria.

| Coluna | Significado |
| --- | --- |
| `orgao_destino` | Quem foi acionado |
| `descricao` | O que se pediu |
| `responsavel` | Quem responde pelo lado de lá |
| `prazo_em` | Quando se espera resposta |
| `respondida_em`, `resposta` | Nulos até a baixa |

---

## `trilha_eventos`

Trilha operacional. **Append-only.**

| Coluna | Significado |
| --- | --- |
| `tipo` | O que aconteceu |
| `autor_id`, `autor_nome`, `autor_papel` | Quem fez. O nome e o papel são copiados no momento do evento, de propósito: se a pessoa mudar de papel amanhã, a trilha continua dizendo em que papel ela agiu |
| `origem` | `campo` ou `escritorio` |
| `ocorrido_em` | Quando o ato aconteceu |
| `registrado_em` | Quando o sistema soube. Diferente do anterior em coleta offline |
| `detalhe` | `JSONB` com o que é próprio daquele tipo de evento |

## `trilha_administrativa`

Mesma ideia, para atos sobre contas, equipes e o próprio órgão. Também
append-only.

---

## `aparelhos`

Qual aparelho recebe notificação de qual agente.

| Coluna | Significado |
| --- | --- |
| `usuario_id` | De quem é o aparelho. Chave estrangeira **composta** com `organizacao_id`, para não existir aparelho apontando para usuário de outro município |
| `plataforma` | `ios` ou `android` |
| `ficha` | O identificador que a Apple ou o Google usa para entregar. **É a única coisa aqui que um terceiro estrangeiro conhece** |
| `visto_em` | Última vez que o aplicativo confirmou este aparelho |
| `revogado_em`, `motivo_revogacao` | Aparelho revogado não recebe mais. Revogar é o que impede quem saiu de continuar recebendo tarefa da equipe |

**A unicidade é `(organizacao_id, ficha)`, e não `ficha` sozinha.** Unicidade
global vazaria existência entre municípios: o segundo município a registrar o
mesmo aparelho físico receberia um erro dizendo que aquela ficha já existe em
algum lugar, e isso é informação sobre outra prefeitura. O custo aceito, escrito
na própria migração, é que a mesma ficha pode ficar viva em dois municípios; a
defesa contra isso é o `organizacaoId` viajar no dado da notificação, e o
aplicativo descartar o que não é do município em que está.

## `notificacoes_enviadas`

Quem foi avisado do quê, e quando.

| Coluna | Significado |
| --- | --- |
| `tipo` | `tarefa_nova` ou `prazo_vencendo` |
| `desfecho` | `enviando`, `entregue`, `falha` ou `ficha_invalida` |
| `tentativas` | Quantas vezes se tentou |

A restrição de unicidade `(organizacao_id, aparelho_id, ocorrencia_id, tipo)` é o
que impede a mesma notificação de sair duas vezes quando o varredor reinicia.
**Não existe política de remoção nesta tabela**, então nenhuma requisição apaga
registro de quem foi avisado: o expurgo por idade é feito pela própria função de
varredura, com retenção de 90 dias.

## `orgaos`

Para quem o município encaminha providência: bombeiros, obras, assistência
social. **Uma linha por órgão, por município.**

Existe porque `providencias.orgao_destino` era texto livre, e "Corpo de
Bombeiros", "Bombeiros", "CBMSC" e "corpo de bombeiros" viravam quatro destinos
diferentes. Nenhum relatório de quantas providências foram para bombeiros saía
certo.

| Coluna | Significado |
| --- | --- |
| `nome`, `sigla` | Como o órgão é chamado, e a sigla que sai no ofício |
| `email` | Para onde o ofício é enviado. **É a lista fechada de destinos**: não sai email para domínio que não esteja aqui |
| `ativo`, `desativado_em`, `motivo_desativacao` | Órgão **não se apaga**, se desativa. Ele aparece em ofício já emitido |

A chave estrangeira de `providencias` para cá é **composta** com
`organizacao_id`. Chave simples deixaria uma providência apontar para órgão de
outro município, e a segurança em nível de linha não protege contra isso: a
integridade referencial roda por dentro do banco, e é a única coisa que fecha
essa porta.

## `oficios`, `oficio_sequencias`, `oficio_envios`, `oficio_aberturas`

O ofício que encaminha uma providência a um órgão.

| Tabela | Para quê |
| --- | --- |
| `oficio_sequencias` | O último número usado por município e por ano, igual ao protocolo. Sequência global vazaria volume entre municípios |
| `oficios` | O documento: número no formato `NNNNNN/AAAA`, a providência, o órgão, quem emitiu |
| `oficio_envios` | Uma linha **por tentativa** de envio, inclusive as que falharam. Tentativa que não fica registrada é a que ninguém consegue investigar |
| `oficio_aberturas` | Quem abriu o endereço de uso único, quando, e de qual endereço de origem |

**O email leva só o número e um link de uso único, e essa é a decisão de
privacidade do bloco.** O ofício carrega endereço, nome do solicitante e às
vezes descrição de vulnerabilidade social. Email sai do nosso controle no
instante em que é entregue: fica na caixa de quem recebeu, no servidor do
provedor dele, e em qualquer encaminhamento que ele fizer. Então o dado sensível
não viaja por email: quem precisa dele abre o link, o acesso fica registrado em
`oficio_aberturas`, e a segunda abertura é recusada.

## `avisos` e `avisos_lidos`

O sino do painel. **Duas tabelas, e a separação é o ponto.**

`avisos` guarda o FATO (vistoria chegou, prazo venceu, providência respondida).
`avisos_lidos` guarda quem leu o quê. Uma coluna `lido` no próprio aviso faria a
primeira pessoa a ler apagar o sino de todo mundo, que é o defeito clássico
deste recurso.

| Coluna de `avisos` | Significado |
| --- | --- |
| `tipo` | Que fato aconteceu |
| `ocorrencia_id` | Sobre qual ocorrência |
| `chave_do_fato` | O que impede o mesmo fato de virar dois avisos |
| `criado_em` | Também é metade do cursor de leitura |

O cursor da consulta é o par `(criado_em, id)`, e o `id` não é enfeite: uma
sincronização grava várias vistorias na mesma transação, com o mesmo instante, e
com o instante sozinho um corte no meio de um empate deixaria os empatados para
trás para sempre. Retenção de 60 dias, dentro da própria política de remoção.

## Tabelas de apoio

| Tabela | Para quê |
| --- | --- |
| `protocolo_sequencias` | O último número usado por município e por ano. Garante protocolo único sem sequência global, que vazaria volume entre municípios |
| `devolucoes_de_tarefa` | A tarefa que venceu e o agente devolveu à coordenação sem ter vistoriado, com motivo de lista fechada, observação, a equipe que estava designada e o prazo que já estava perdido. **Append-only**, como a trilha: é declaração de campo, e correção se faz com despacho novo. Não encerra a ocorrência (ela volta para `triagem`) e não zera `prazo_em`, senão o atraso sumiria do painel |
| `saidas_a_campo` | A ida a campo que o agente declarou ANTES de subir, com o protocolo, o tempo previsto, se foi **sozinho**, e o prazo de retorno carimbado pelo relógio do **servidor**. Uma aberta por agente, imposta por índice único parcial. Não se apaga: encerra com desfecho de lista fechada e quem encerrou, e "acionei apoio" exige dizer o quê. A observação da coordenação é sobre o ATO DA PREFEITURA a respeito da segurança do próprio servidor, e por isso fica fora da minimização por prazo: ver `SEGURANCA-DO-AGENTE.md` |
| `sessoes` | Sessões abertas. É o que permite derrubar acesso ao trocar ou redefinir senha |
| `recuperacoes_senha` | Pedidos de recuperação, com validade e uso único |
| `exportacoes` | Registro de quem exportou o quê e quando. Exportação de dado de cidadão é ato que fica registrado |
| `interesse_municipio` | Município que se cadastrou pela página pública. É a única tabela com dado que não pertence a um município do sistema |
| `segundo_fator` | Verificação em duas etapas por pessoa: o segredo do código de seis dígitos, **cifrado** com chave que vive fora do banco, mais o último passo de tempo aceito (é ele que impede o mesmo código de valer duas vezes) e o teto de tentativas, separado do teto da senha. Desligar apaga o segredo e carimba a data, em vez de apagar a linha: "desde quando esta conta parou de exigir a segunda etapa" precisa ter resposta |
| `segundo_fator_recuperacao` | Os códigos de recuperação, guardados só como resumo. Cada um vale uma vez; desligar a verificação invalida todos em bloco. Código gasto fica marcado como gasto, e não sai da tabela: sem isso ninguém distinguiria "eu usei três" de "alguém usou três por mim" |

---

## As tabelas do fornecedor: `console_operadores` e `eliminacoes_de_municipio`

As duas entraram na migração 038 e **não são de município nenhum**: são do
fornecedor, e só o papel do console (`dc360_console`) as alcança. Nenhum
município as lê, e o papel de aplicação não tem um privilégio sequer nelas.
Nenhuma das duas sai no pacote de saída de município.

### `console_operadores`

Quem entra no console do fornecedor. As contas saíram da configuração do
processo (`CONSOLE_OPERADORES`) para o banco porque o dono pediu tela de
usuários, troca de senha e operadores abaixo dele.

| Coluna | Significado |
| --- | --- |
| `email` | Identidade de login, única sem distinção de caixa |
| `senha_hash` | O hash do produto (`scrypt$...`), nunca a senha. O banco recusa outra forma (`senha_chega_derivada`) |
| `segundo_fator` | O envelope **cifrado** do segredo do TOTP (`v1.<vetor>.<selo>.<texto>`), como em `segundo_fator`. Obrigatório: conta de console sem segundo fator não existe |
| `papel` | `dono` ou `operador`. **Exatamente um dono**, por índice único parcial. O papel não muda depois de gravado (gatilho): promover ou rebaixar é criar outra conta |
| `ativo` | `false` é o "apagado" desta tabela. O dono não se desativa (`dono_sempre_ativo`) |
| `criado_por` | Quem criou. Nulo só para o dono; todo operador nasce pela mão do dono (`operador_tem_criador`) |
| `falhas_login`, `bloqueado_ate` | O teto de tentativas, que antes vivia na memória do processo |
| `ultimo_passo_totp` | O passo de tempo do TOTP já usado, que impede o mesmo código de valer duas vezes. Antes vivia na memória do processo e obrigava o console a rodar numa máquina só |

**A regra da primeira conta, em policies.** O contexto do console é a variável
`app.console_operador`, lida por `console_operador_atual()`. O console lê
todas as linhas (o login acha a conta pelo email antes de haver sessão);
insere `operador` só quando o operador do contexto é o dono, assinado por ele
(`criado_por`), e insere `dono` **só com a tabela vazia** (é a partida do
console semeando a primeira conta a partir de `CONSOLE_OPERADORES`, uma vez;
esse ramo fecha na primeira linha); altera a própria linha, ou, sendo o dono,
a linha de um operador. **Ninguém além do
dono altera o dono**, nem por `UPDATE` nem por função: um `UPDATE` de operador
contra a linha do dono volta dizendo que alterou zero. Sem policy e sem
concessão de `DELETE`: operador se desativa, porque assina o livro de
eliminações com o email.

Durante o login, antes de haver sessão, o console declara `app.console_operador`
com o id da linha que achou pelo email para gravar a tentativa nela: a policy
de `UPDATE` só alcança a própria linha.

### `eliminacoes_de_municipio`

O livro de eliminações. Uma linha por pedido, com as fases. **Não tem chave
estrangeira para `organizacoes`**, de propósito: a organização vai sumir e o
livro fica, por isso nome e UF são copiados no agendamento.

| Coluna | Significado |
| --- | --- |
| `organizacao_id`, `municipio_nome`, `uf` | O município, copiado no momento do pedido |
| `solicitada_em`, `executar_em` | O pedido e o fim do prazo de arrependimento. O banco exige sete dias entre os dois (`prazo_de_arrependimento_de_sete_dias`), mesmo para quem escrever por fora da função |
| `solicitada_por_email`, `motivo` | Quem pediu (o dono do console) e por quê. O motivo é obrigatório |
| `cancelada_em`, `cancelada_por_email` | Cancelamento dentro do prazo. Andam juntos. Cancelada e apagada se excluem |
| `banco_apagado_em`, `contagens` | O relógio apagou as linhas. `contagens` é `{"ocorrencias": 41, ...}`: quantas linhas de cada tabela de negócio saíram, e é a prova de que a ordem de apagamento cobriu todas |
| `armazenamento_purgado_em`, `concluida_em` | A API purgou as fotografias (`tenant/<id>/`) e chamou `concluir_eliminacao`, que apaga a linha de `organizacoes` |

**Uma eliminação ativa por município**, por índice único parcial. O console lê
tudo, insere (só o dono, só linha recém-nascida, só com o prazo inteiro) e
altera **só as duas colunas de cancelamento**, e só entrando no estado
cancelado. Sem `DELETE`.

A rota de saúde da API pergunta ao banco se o relógio tem trabalho por
`eliminacoes_pendentes()`, que devolve só dois números (agendadas, vencidas),
contados nas marcas de `organizacoes`.

**O relógio não confia só no livro.** `executar_eliminacoes_vencidas()` só
apaga quando a linha do livro está vencida e não cancelada **e** a organização
está marcada como suspensa e agendada. A segunda marca só a função do console
escreve, então uma linha escrita no livro por fora da função não apaga nada.
Antes do primeiro `DELETE`, a função confere que toda tabela com
`organizacao_id` tem lugar na ordem de apagamento (tabela nova sem lugar
recusa, nomeando a tabela); depois de cada `DELETE`, confere que restou zero
linha daquele município e estoura nomeando a tabela se restou. Com
`row_security = off`, um dono de tabelas sem `BYPASSRLS` produz erro em vez de
zero em silêncio (ver o cabeçalho da migração 037).

**As fases, na ordem:**

1. suspensa: sessões revogadas, sessão nova recusada;
2. agendada: livro escrito, sete dias de prazo;
3. banco apagado: linhas filhas fora, contagens no livro, linha de
   `organizacoes` fica com `eliminada_em`;
4. armazenamento purgado e concluída: linha de `organizacoes` apagada, livro
   fica.

Cancelar cabe até o banco ser apagado, e **não reativa o acesso**: reativar é
ato separado.

---

## O que **não** existe no banco, e é bom saber

- **Não há tabela de senha em texto.** Senha é derivada com custo alto e guardada
  como resumo criptográfico.
- **Não há coluna de exclusão lógica em ocorrência.** Encerramento com motivo faz
  esse papel, e ele é semanticamente diferente: diz por que terminou.
- **Não há segredo de segunda etapa em texto.** O que a coluna guarda é um
  envelope cifrado, e o próprio banco recusa qualquer outra coisa ali (a
  restrição `segredo_vem_cifrado`, migração 022). As duas tabelas de segunda
  etapa **não saem no pacote de saída de município**: são material de
  credencial, e o segredo delas só teria valor com a chave do servidor de
  origem, que o município não leva.
- **Não há papel de banco que enxergue dois municípios**, além do dono, que é
  quem aplica migração e provisiona. Ver ADR 0001 e ADR 0008. O papel do
  console alcança as duas tabelas do fornecedor e nada que seja de município.
- **Não há `DELETE` de dado de município fora de duas funções**,
  `executar_eliminacoes_vencidas` e `concluir_eliminacao`, que o relógio da
  API executa e que só agem no que o console agendou, venceu e ninguém
  cancelou. O papel de aplicação continua sem `DELETE` em tabela nenhuma além
  de `avisos`.
