# Dicionário de dados

- **Versão:** 1, de 09/09/2026
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
| `sessoes` | Sessões abertas. É o que permite derrubar acesso ao trocar ou redefinir senha |
| `recuperacoes_senha` | Pedidos de recuperação, com validade e uso único |
| `exportacoes` | Registro de quem exportou o quê e quando. Exportação de dado de cidadão é ato que fica registrado |
| `interesse_municipio` | Município que se cadastrou pela página pública. É a única tabela com dado que não pertence a um município do sistema |

---

## O que **não** existe no banco, e é bom saber

- **Não há tabela de senha em texto.** Senha é derivada com custo alto e guardada
  como resumo criptográfico.
- **Não há coluna de exclusão lógica em ocorrência.** Encerramento com motivo faz
  esse papel, e ele é semanticamente diferente: diz por que terminou.
- **Não há papel de banco que enxergue dois municípios**, além do dono, que é
  quem aplica migração e provisiona. Ver ADR 0001 e ADR 0008.
