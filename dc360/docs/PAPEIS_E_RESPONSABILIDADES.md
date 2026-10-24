# Quem faz o quê no Defesa Civil 360

Documento para conversa entre sócios. Descreve **o que existe hoje no código**,
não o que se pretende construir. Onde o produto diverge da especificação
preliminar, o texto diz isso na cara, porque decidir a divergência é o motivo
deste documento existir.

Gerado a partir de `packages/shared/src/permissoes.ts` em 28/08/2026 e
reconferido em 19/10/2026 (V2-F00-E22, correção 4). A tabela "A tabela, de uma
vez", no fim da primeira metade, é presa ao código por
`packages/shared/test/permissoes-no-readme.test.ts`: o teste reprova se faltar ou
sobrar ação, ou se um "sim" ou "não" divergir de `acoesDoPapel`. O texto em
volta, não: ele é lido por gente.

---

## Em uma frase

Uma ocorrência entra pelo telefone, é classificada, é despachada para uma
equipe, é vistoriada em campo mesmo sem sinal, vira documento oficial, gera
providência para outra secretaria e é encerrada com motivo. Tudo isso deixa
rastro que a aplicação não reescreve (as duas exceções, definidas no banco, estão
em "Três regras que valem para todos").

O produto tem **quatro papéis**. Cada um existe porque alguém diferente faz
aquela parte do trabalho, e porque juntar duas delas na mesma pessoa tira o
sentido da trilha de auditoria.

---

## Os quatro papéis

### Operador de plantão

**Quem é:** quem atende o telefone. Em município pequeno, pode ser o próprio
coordenador em outro turno.

**O que faz no sistema:**

| Pode | Não pode |
| --- | --- |
| Registrar ocorrência (gera o protocolo) | Classificar severidade |
| Registrar a resposta de uma providência | Despachar equipe |
| Consultar os ofícios de encaminhamento (só leitura) | Encerrar ocorrência |
| Acompanhar quem está em campo, e encerrar uma saída dizendo o que foi feito (em construção, ver abaixo) | Emitir documento |
| | Emitir ou enviar ofício |

**Por que a linha é essa:** classificar severidade é decisão técnica com
consequência de prazo. Quem atende a ligação registra o que ouviu; quem tem
competência técnica decide o que aquilo significa.

**Por que ele acompanha quem está em campo:** é a única permissão deste produto
concedida ao posto mais baixo por uma razão que não é de fluxo. O valor inteiro
daquela tela é alguém enxergar que um agente não deu notícia, e a pessoa que está
na sala às três da manhã de uma noite de temporal é o operador de plantão.
Restringir à coordenação seria escolher a arrumação da tabela contra a finalidade
da coisa, e o custo do erro é um agente no morro sem ninguém olhando. Ele também
encerra a saída, porque é ele quem chama o agente pelo rádio: ver o alerta sem
poder registrar o que fez deixaria o fato aberto na tela e o ato invisível.
**Estado do recurso: em construção.** A tela da coordenação e a permissão já
existem, mas o aplicativo do agente ainda não declara a saída (previsto na
V2-F14-E01, sem data). Até lá a tela fica vazia e nenhum prazo estourado
aparece: o operador não deve contar com ela para saber quem está no morro.

**Por que ele responde providência:** é ele quem atende o telefone quando a
secretaria liga de volta dizendo o que fez. Fazer essa pessoa anotar num papel
para outra digitar depois é o hábito que o produto existe para substituir.

**Ponto em aberto, e é o mais importante deste papel:** a especificação
preliminar dá ao operador "classifica **e despacha**", e o produto não dá. A
divergência nunca foi decidida por escrito. Se num município de 50 a 150 mil
habitantes quem atende o telefone é o próprio coordenador, este papel some e a
primeira tela do produto muda de dono.

### Agente de campo

**Quem é:** quem vai ao local. É a única pessoa do sistema que trabalha sem
internet, e o aplicativo existe para ele.

**O que faz no sistema:**

| Pode | Não pode |
| --- | --- |
| Registrar vistoria (checklist, foto, coordenada, assinatura) | Registrar ocorrência |
| Ver as tarefas despachadas para a equipe dele | Ver a fila do município |
| Ver a equipe e o que ele mesmo já concluiu | Despachar, encerrar |
| Ver o sino de avisos da equipe dele | Emitir laudo ou termo |
| | Consultar ofício, nem ver aviso de outra equipe |

**Por que ele não vê a fila inteira:** ele trabalha sobre o que foi despachado
para a equipe dele. A fila do município é ferramenta de coordenação, e mostrar
tudo a todos transformaria o aplicativo numa lista que ninguém lê.

**Por que ele não consulta ofício e o sino dele é o da equipe:** o aparelho do
agente anda pelo morro, cai e é emprestado. A ficha do ofício traz o e-mail do
órgão, as observações da coordenação e o IP de quem abriu o link, e o aviso
traz o protocolo e o tipo do fato. Até 2026-10-06 as duas rotas respondiam ao
token do agente com dado de ocorrência de qualquer equipe, enquanto a lista de
ocorrências do mesmo token já respondia 404 a elas. Hoje o ofício responde 403
(ele não tem a ação) e o sino é recortado à equipe, igual às demais leituras.

**O que só ele pode fazer:** registrar vistoria. Ninguém mais, nem o
coordenador. O motivo é que a vistoria é ato de quem esteve no local e assina
por isso.

**Ponto em aberto:** essa exclusividade foi decidida por nós, sem fonte. Em
município pequeno o coordenador é quem sai no carro, e hoje ele **não
consegue registrar o que fez**. Se isso for verdade no piloto, muda no
primeiro dia.

**Segundo ponto em aberto:** a especificação dá ao agente "propõe
providências". O produto dá a metade: no checklist ele marca "Necessário acionar
outro órgão" e indica QUAIS órgãos (a lista fica em `vistoria_orgaos_indicados`),
o que é uma proposta de encaminhamento; mas ele não cria a providência, que só a
coordenação encaminha.

### Coordenador da Defesa Civil

**Quem é:** quem decide o que a Defesa Civil faz, e responde por isso.

**O que faz no sistema:** tudo do fluxo operacional.

- Registrar ocorrência
- Classificar na triagem (define severidade, e a severidade define o prazo)
- Despachar equipe, e trocar a equipe depois
- Encaminhar providência a outra secretaria
- Registrar a resposta de uma providência
- Encerrar ocorrência, com motivo
- Emitir laudo e termo de interdição
- Consultar os ofícios de encaminhamento (e emitir e enviar)
- Levantar a interdição de um imóvel (desinterdição, com motivo escrito)
- Acompanhar quem está em campo agora (em construção, como no operador)
- Gerenciar equipes e usuários
- Consultar a trilha de auditoria e exportar dados (a exportação com dados
  pessoais, o CSV completo, é só do administrador; a do coordenador é a básica)

**Por que o encerramento é dele:** encerrar é encerrar a responsabilidade do
órgão sobre aquele caso. É ato de coordenação, e a trilha registra quem
encerrou e por quê.

**Por que a emissão de documento é dele:** o laudo reúne numa página só o nome
do solicitante, o endereço, a coordenada, a descrição da vulnerabilidade da família
e todas as fotos da casa (o contato do solicitante não é impresso). Cada pedaço já circula em algum lugar do sistema; a
concentração é que muda a natureza da coisa, e é ela que sai impressa e vai
parar num processo.

**Ponto em aberto, e é o maior do documento:** hoje o papel sai da impressora
com a linha de assinatura do **agente de campo**, e a permissão de emitir é da
**coordenação**. Quem assina não é quem tem direito de produzir. Ver a seção
"A decisão que falta" no fim.

### Administrador da organização

**Quem é:** quem responde pelo cadastro do município dentro do sistema.

**O que faz:** tudo o que o coordenador faz, **mais** alterar os dados do
município, exportar o CSV completo com dados pessoais, gerar o pacote de saída do
município e trocar o e-mail de outra pessoa.

**Ele não é um coordenador com outro nome.** A diferença está no sistema de
postos: administrador é posto 3, coordenador é posto 2, operador e agente são
posto 1. **Ninguém gerencia uma conta de posto acima do seu, e só o administrador
gerencia uma de posto igual** (alguém precisa poder criar o segundo
administrador): o coordenador não gerencia outro coordenador, não rebaixa um
administrador, e ninguém se promove.

**Não existe papel de aplicação acima dele.** Nenhum papel do painel ou do
aplicativo enxerga dois municípios, e isso é decisão de arquitetura registrada
(ADR 0008): o dia em que existir uma conta capaz de ler os dados de dois
municípios, o isolamento vira promessa em vez de mecanismo.

**O que o fornecedor tem, e é outra coisa:** o console do fornecedor
(`apps/console`), um processo separado, com segundo fator obrigatório e credencial
própria. Ele **lista todos os municípios com contagens**. A tela mostra, por
município (nome e UF): o sinal (em dia, ou "calado" depois de 36 horas sem o
resumo diário do município escrever), o estado do acesso e, em números,
ocorrências que entraram, encerradas, vistorias recebidas, abertas, atrasadas,
servidores ativos, aparelhos sumidos e a mediana de minutos até a vistoria. (A
consulta do console devolve ainda ofícios emitidos e aparelhos ativos, que a tela
não desenha.) Ele
**faz**: cadastrar prefeitura, suspender e reativar o acesso, e agendar a
eliminação do município (com prazo de arrependimento de sete dias, em que o
cancelamento é possível); quem executa o apagamento é o relógio da API, não o
console, e só o dono do console desativa e elimina. Ele **não vê** nome,
contato, relato, endereço, foto nem trilha de nenhum cidadão ou ocorrência:
só números e o cadastro do município.

**Consequência prática:** provisionar um município novo não é feito pelo painel
do município. É feito por linha de comando (`scripts/cadastrar-prefeitura.mjs`,
com credencial de banco) ou pela tela "Cadastrar prefeitura" do console do
fornecedor, que é outro processo, com segundo fator.

---

## A tabela, de uma vez

| Ação | Operador | Agente | Coordenador | Administrador |
| --- | :---: | :---: | :---: | :---: |
| Registrar ocorrência | sim | não | sim | sim |
| Classificar na triagem | não | não | sim | sim |
| Despachar equipe | não | não | sim | sim |
| Registrar vistoria | não | **só ele** | não | não |
| Encaminhar providência | não | não | sim | sim |
| Responder providência | sim | não | sim | sim |
| Encerrar ocorrência | não | não | sim | sim |
| Emitir laudo ou termo | não | não | sim | sim |
| Consultar os ofícios de encaminhamento | sim | não | sim | sim |
| Levantar a interdição de um imóvel | não | não | sim | sim |
| Acompanhar quem está em campo agora | sim (em construção) | não | sim (em construção) | sim (em construção) |
| Gerenciar equipes | não | não | sim | sim |
| Gerenciar usuários | não | não | sim | sim |
| Consultar a trilha | não | não | sim | sim |
| Exportar dados | não | não | sim | sim |
| Alterar dados do município | não | não | não | **só ele** |

---

## O que a equipe significa

**Equipe é a unidade de despacho.** O coordenador não despacha para uma pessoa,
despacha para uma equipe. Todo agente daquela equipe passa a ver a ocorrência
no aplicativo.

Uma equipe tem nome, especialidade opcional e situação (ativa ou inativa).
Equipe inativa não recebe despacho novo, e os agentes dela continuam
conseguindo enviar o que já coletaram.

**Um agente pertence a uma equipe só.** Agente sem equipe não recebe nada, e o
aplicativo diz isso com todas as letras em vez de mostrar uma lista vazia.

**Equipe não se apaga, se desativa.** Ela aparece na trilha de despachos
antigos, e apagar reescreveria o histórico.

---

## Três regras que valem para todos

**Nada se apaga.** Ocorrência se encerra com motivo. Usuário e equipe se
desativam. A trilha de auditoria não tem policy de alteração nem de exclusão: nem
a aplicação, nem quem administra, reescreve ou apaga um evento; correção entra
como evento novo. Duas exceções existem, e as duas são funções do banco, não
telas: a minimização por prazo (`minimizar_por_prazo`, migração 043) troca o nome de
quem assinou a vistoria, dentro do evento `vistoria` da trilha, por "removido por
prazo" quando o prazo da privacidade vence, e registra que fez isso; e a
eliminação do município, agendada pelo console do fornecedor com sete dias de
arrependimento, apaga tudo dele, trilha inclusa, depois do pacote de saída.

**O município vem do login, e de mais lugar nenhum.** Um usuário nunca alcança
dado de outro município, e a recusa é "não encontrado", nunca "sem permissão",
porque dizer "sem permissão" já confirmaria que o registro existe.

**Esconder o botão não é controle.** Toda ação é verificada no servidor antes
de tocar o banco. A tela apenas reflete a mesma tabela.

---

## As três divergências não decididas

Estas existem porque o produto foi construído sobre uma tabela de oito perfis
da especificação preliminar, e implementou quatro. Os quatro que faltam não
foram cortados por decisão: sumiram.

### 1. Técnico responsável

A especificação cria um perfil que "valida laudos, interdições e documentos que
exigem competência técnica", com poder de **assinatura e aprovação**. Ele não
existe no produto, e a ausência dele é a causa da contradição da assinatura.

**A pergunta para o coordenador:** quem assina o termo de interdição no seu
município, e essa pessoa precisa de registro profissional?

Se a resposta for "engenheiro com registro", entra um campo de responsável
técnico e o fluxo ganha um passo de encaminhamento para assinatura.

### 2. Órgão parceiro

A especificação prevê que Obras e Assistência Social entrem no sistema para
responder o que foi encaminhado a elas. Hoje não entram: a providência sai por
ofício e volta por telefone, e por isso o operador ganhou a ação de registrar a
resposta.

### 3. Gestor, controle e auditoria

A especificação prevê um perfil **só de leitura**, para indicadores, trilha e
exportação. Ele não existe, então hoje **quem opera é quem audita**. Isso é o
tipo de coisa que um tribunal de contas repara.

---

## A decisão que falta, e ela é sua e do Alyson

Hoje o produto se contradiz: o laudo e o termo saem impressos com a linha de
assinatura do **agente de campo**, e a permissão de emitir é da **coordenação**.

E há um segundo problema: restringir a emissão sem construir a aprovação
comprou o custo do controle sem comprar o controle. A coordenação não consegue
interditar o que o agente não marcou no checklist, nem desmarcar o que ele
marcou. Ela só consegue atrasar a impressão.

**A saída já estava especificada desde 18/08/2026**, no item DOC-04 da
especificação do Alyson: "Estados rascunho, em revisão, aprovado e cancelado
têm permissões próprias". O documento tem máquina de estados própria, e ela
nunca foi implementada.

Concretamente, `emitir_documento` vira duas ações:

| Ato | Quem | Estado |
| --- | --- | --- |
| Gerar a **minuta** no aparelho, offline, logo após a vistoria (existe) | agente de campo | rascunho |
| Revisar e **aprovar** | coordenação, ou o técnico responsável quando existir | aprovado |
| **Emitir** o documento oficial, com código de validação | quem aprovou | aprovado |
| Cancelar | coordenação | cancelado |

A minuta no aparelho JÁ existe (`packages/shared/src/minuta.ts`, tela
`MinutaDoLaudo`), marcada "MINUTA SEM VALOR DE DOCUMENTO. Aguardando conferência
e emissão pela coordenação."; o que falta é a aprovação e o papel entregue ao
morador. A proposta é que ela saia marcada "MINUTA, SEM VALIDADE, AGUARDANDO
APROVAÇÃO" e sem código de validação. O agente entrega um papel na mão do morador ainda na porta da
casa, o que ele precisa. A coordenação passa a controlar a **validade do ato**,
que é o que ela deveria controlar desde o começo.

**Esta é a única saída que sobrevive às duas respostas possíveis** da pergunta
sobre quem assina. Se só engenheiro assina, muda quem aprova, não quem gera a
minuta.

---

## Acesso técnico do fornecedor à infraestrutura (rascunho do CP-07)

Os quatro papéis acima são os de quem usa o produto. Há um quinto grupo, que não
tem papel no produto e que alcança a infraestrutura: as pessoas do fornecedor que
operam o sistema. Hoje é uma só. A V2-F01-E16 propõe uma segunda, e o CP-07
(decisão do Rafael) diz quem é e quanto acesso tem. **Nada abaixo foi
concedido.**

| Função | Finalidade | Acesso padrão | Prazo |
| --- | --- | --- | --- |
| Dono da plataforma | Operar, implantar, migrar, girar segredo, conceder acesso | Tudo | Sem prazo; revisão trimestral |
| Operador técnico reserva (segunda pessoa) | Manter o serviço no ar e recuperá-lo quando o dono não puder | Só homologação, com dado sintético. Em produção, apenas a recuperação por cofre, com registro de cada abertura | O registrado na ficha de concessão; revisão trimestral; expira se não for renovado |

Quem opera a infraestrutura alcança dado pessoal de cidadão em produção
(banco, armazenamento, logs). Por isso o acesso a produção é a exceção, com
função, finalidade e prazo escritos, e nunca para consulta por curiosidade ou
suporte: para a pergunta específica de um município existe a trilha e o telefone
com quem o administra. O detalhe por conta, o nome dos segredos e a revogação
estão em `docs/runbooks/acesso-e-segredos.md`.

---

## Nove perguntas para o primeiro coordenador

Na ordem de quanto cada resposta muda o produto:

1. Quem assina o termo de interdição, e precisa de registro profissional?
2. O coordenador vai a campo e vistoria?
3. Quem atende o telefone e quem faz a triagem, no dia útil e no plantão de domingo?
4. Existe alguém fora da coordenadoria que cobra número de vocês, e o que essa pessoa precisa ver sem poder mexer?
5. Qual o vínculo do agente, e quando ele sai, o que acontece com os laudos que assinou?
6. Obras e Assistência entrariam no sistema, ou o encaminhamento continua saindo por ofício?
7. O agente precisa entregar o papel na mão do morador ainda na porta da casa?
8. Quem pode ver a foto de dentro da casa e a descrição da vulnerabilidade da família?
9. Existe estrutura de unidade ou distrito dentro do órgão, ou é uma equipe só?
