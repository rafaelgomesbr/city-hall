# Armazenamento: o teto por município e o objeto órfão

Este documento é do operador da plataforma. Ele explica a conta que motiva as
duas peças, as decisões que cada uma tomou, e os comandos.

## A conta, medida

| Onde | Quanto | Por ano, num município com 2.000 atendimentos |
| --- | --- | --- |
| Banco | cerca de 8 KB por ocorrência com vida completa | 16 MB |
| Armazenamento de objeto | seis fotos de 2 MB por vistoria, 12 MB por vistoria | cerca de 24 GB |

Três ordens de grandeza de diferença. O banco não é o problema e nunca vai ser:
dez anos de contrato cabem num pendrive. O que cresce é fotografia, e ela não
está no banco, está no Supabase Storage por S3.

Duas ausências vinham disso, e as duas estavam nomeadas como pendência.

---

## 1. Teto de armazenamento por município

### De quem é a decisão do número

Do **fornecedor**, e isso é o inverso da retenção da migração 021.

O prazo de retenção é do município porque o município é o **controlador do
dado**: escolher por ele o dia em que um dado de cidadão é destruído seria o
operador decidindo no lugar do controlador. O teto de armazenamento é do
fornecedor porque a **fatura é dele**, e um teto que o próprio limitado levanta
não limita nada.

Isso está imposto no banco e não na tela: `dc360_app` tem `UPDATE` em
`organizacoes` desde a migração 001 (o administrador edita nome, UF e os prazos
de retenção), e um gatilho da migração 035 recusa especificamente a alteração de
`teto_armazenamento_bytes` por esse papel. A garantia não depende de nenhuma rota
lembrar de não expor o campo.

`NULL` é o padrão e quer dizer **sem teto**: é o estado de todos os municípios no
dia em que isto entra. Ninguém acorda com o balde fechado por causa de uma
migração.

### O que acontece quando o teto chega perto, e quando ele estoura

O teto é **freio de mão, não freio de pé**. Quatro faixas, e a regra inteira mora
numa função só (`situacao_de_armazenamento`), lida pela rota e cobrada por um
gatilho:

| Faixa | O que acontece |
| --- | --- |
| Abaixo de 80% do teto | nada |
| 80% a 100% | a autorização de envio passa, e carrega o aviso. `GET /armazenamento/uso` mostra o número para quem administra o município |
| 100% a 150% | a autorização de envio **continua passando**, marcada como acima do teto |
| Acima de 150% | a autorização é recusada com **507** |

**Por que passar de 100% não recusa.** O aparelho do agente está no morro, sem
sinal, com a coleta pronta. Recusar a foto no primeiro byte acima do teto
significaria que um número de contrato, decidido meses antes num escritório,
destrói a vistoria de uma interdição. Quem precisa agir quando o balde enche é
quem renegocia contrato, e essa pessoa está na mesa, não no barranco. A margem de
50% cobre com folga o evento que justifica o estouro: uma semana de temporal com
o dobro das vistorias de um mês normal.

**Por que a recusa é 507 e não 413.** `packages/campo/src/transporte.ts`
classifica 5xx e 429 como falha **temporária**; as recusas de 4xx que são do dado
ou do papel (400, 403 `sem_permissao`, 404, 409 e 422) como **permanente**; trata
401 e os 403 de conta desativada e de senha provisória como pausa da fila, sem
perder o item; e o 403 de suspensão do município como temporário. Item permanente vira `bloqueado` na fila do aparelho e
só anda quando alguém age nele: reenviar (que some quando a recusa é do dado),
corrigir o rascunho ou descartar. Um 4xx aqui prenderia a vistoria no telefone do
agente até alguém agir, e descartar, que apaga, é a saída que o produto nunca
quer induzir para trabalho de campo.

Com 507 a fila adia e insiste, sem teto de tentativas para falha temporária. A
coleta sobrevive no aparelho e **drena sozinha** no dia em que o teto for
ampliado, sem ninguém tocar no telefone de quem está na rua. A frase que o agente
lê diz isso com todas as letras: a coleta continua guardada, o envio será tentado
sozinho, avise a coordenação.

**E a vistoria não espera pela foto.** O envelope (texto, checklist, assinante,
as duas marcas de tempo) custa kilobytes e passa normalmente, com teto estourado
ou não. Recusá-lo por causa do balde de fotografias transformaria um problema de
fatura em perda de ato administrativo.

### O que conta no teto

A soma de `evidencias.tamanho_bytes` das linhas **não abandonadas**, ou seja,
inclui a autorização que ainda não virou arquivo. Contar só o confirmado
permitiria autorizar mil envios e passar do teto antes de qualquer confirmação. O
preço é que autorização perdida segura teto, e é a varredura da parte 2 que a
solta.

**Mais a foto de perfil de cada servidor** (`usuarios.foto_bytes`, migração
045). Ela ocupa o mesmo balde e, até 15/09/2026, não entrava na conta nem a rota
de foto perguntava ao teto: uma equipe inteira trocando de foto num município no
limite passava por cima dele sem aviso. Hoje a rota `POST
/usuarios/eu/foto/autorizar-envio` consulta o teto antes de emitir a URL, e a
confirmação (`PUT /usuarios/eu/foto`) grava o tamanho lido do próprio
armazenamento, na mesma transação em que confere o teto de novo (o gatilho
`foto_dentro_do_teto` cobra a mesma conta por baixo). A recusa é 507 com uma
frase própria da foto, que diz que a anterior continua como estava.

Duas coisas a saber sobre essa parcela:

- **A foto confirmada antes da migração 045 conta zero.** O banco guardava só a
  chave, e o tamanho de um objeto só o armazenamento sabe. Inventar um número
  seria contar errado; ela passa a contar no dia em que a pessoa trocar de
  foto. São dezenas de kilobytes por servidor, então a diferença não move a
  situação de município nenhum.
- **Ela nunca é grande.** O aparelho redimensiona a 512 pontos antes de enviar,
  e o teto por foto é de 2 MB (contra 15 MB por fotografia de vistoria). Ela
  entra na conta por coerência, não por peso.

---

## 2. Varredura de objeto órfão

### O que é um órfão, e o que não é

Órfão é a fotografia que está no armazenamento e que **nenhum registro vivo do
banco justifica**. O caso comum é banal: o `PUT` chegou e a confirmação não,
porque o sinal caiu, o aplicativo foi fechado, o aparelho foi trocado. O arquivo
fica lá para sempre, invisível para o sistema inteiro (toda consulta filtra
`enviada_em IS NOT NULL`), pagando armazenamento e guardando imagem do imóvel de
uma família sem nenhuma finalidade.

Órfão **não é** "objeto que não está na tabela agora". As fotos sobem ANTES do
envelope da vistoria, de propósito, para o laudo nunca apontar para arquivo que
não existe. Existe portanto uma janela legítima em que o objeto está lá e o
registro ainda não fechou, e ela dura o tempo que o aparelho levar para achar
sinal.

### O critério, por extenso

Um objeto entra na lista quando:

1. está no armazenamento há mais de **trinta dias** (e, quando existe linha de
   autorização para ele, essa linha também tem mais de trinta dias: a idade
   considerada é a do **mais novo** dos dois relógios, para a janela errar sempre
   para o lado de esperar mais); **e**
2. o município dono do prefixo da chave não tem nenhuma linha viva de evidência
   apontando para ela.

Trinta dias precisa cobrir a maior distância plausível entre a foto subir e o
envelope chegar: aparelho dias sem sinal, agente de férias com a coleta guardada
(o aplicativo promete, com razão, que ela continua lá), coleta bloqueada
esperando decisão de gente. O erro de ser generoso demais custa armazenamento por
mais um mês; o erro de ser curto demais custa a fotografia de uma interdição. O
número é escolhido pelo segundo.

Duas espécies entram na lista, e a diferença importa:

- `envio_nunca_confirmado`: existe linha, nunca confirmada, e o prazo passou. É o
  caso comum.
- `objeto_sem_linha`: não existe linha nenhuma. **Não deveria acontecer**, e é
  justamente por isso que ele é relatado em vez de resolvido em silêncio.

E uma terceira categoria nunca entra: a chave que **não dá para atribuir** a
município nenhum (sem prefixo de tenant, ou com prefixo de organização
inexistente). Ela é relatada e nunca proposta para descarte: só dá para dizer que
um objeto é órfão comparando com as linhas do município dono dele, e afirmar sem
saber o dono é afirmar o que ninguém verificou.

**A foto de perfil tem outra linha justificadora.** A varredura reconhece
`usuarios.foto_chave` (migração 040) como registro vivo, conferido dentro do
contexto do mesmo município: a foto atual de um servidor **nunca** entra na
lista, por mais velha que seja, e no descarte a chave é reconferida contra
`usuarios` também, para a foto que virou perfil entre a varredura e a decisão
ser mantida. Até 15/09/2026 a varredura só conhecia `evidencias`, e passados
trinta dias todo retrato virava `objeto_sem_linha`: um descarte autorizado sobre
essa lista apagaria o rosto de cada agente com a chave ainda gravada na linha.
O que continua órfão de verdade, e de propósito, é a foto **anterior** de uma
troca cujo apagamento falhou: nenhuma linha aponta para ela, e ela é exatamente
o objeto que a rota de troca deixa para a varredura encontrar.

### A decisão que governa tudo: a varredura NÃO apaga

Esta foi a escolha mais difícil desta entrega, e o argumento é este.

**Apagar é irreversível, e todo modo conhecido de o critério errar erra para o
mesmo lado.** Página de listagem perdida no meio da paginação, banco restaurado
de cópia, defeito no prefixo, provedor devolvendo 429 numa parte das chamadas:
todos produzem "o banco não conhece este objeto", que é literalmente a definição
de órfão que a rotina usa. Este produto já pagou uma vez por juntar "não existe"
com "não consegui ler": era um `.catch(() => null)` em `baixar()`, e ele fazia o
pacote de saída declarar inexistentes fotografias que existiam, com soma de
verificação ao lado dando aparência de conferência feita, num procedimento cujo
passo seguinte é a eliminação das nossas cópias.

**A assimetria de custo é gritante.** Guardar um órfão um mês a mais custa
centavos. Apagar a fotografia de uma interdição custa o ato administrativo,
porque ela é a prova material dele e pode acabar numa audiência.

**E o produto inteiro é construído contra apagar prova.** A trilha é append-only
por ausência de policy, ocorrência não se apaga (se encerra com motivo), usuário
não some (se desativa). Uma rotina automática que destrói arquivo seria a única
exceção a esse princípio, e ela nasceria rodando sozinha, de madrugada, sem
ninguém olhando.

O contra-argumento tem peso e está respondido: guardar para sempre também é
errado, porque é dado pessoal sem finalidade. A resposta não é apagar automático,
é **tornar a lista barulhenta e o descarte fácil de autorizar**: a varredura roda
sozinha, a lista fica sempre atualizada, e apagar é um comando com nome e motivo.

### A reconferência antes de apagar

Entre varrer e decidir passam dias ou semanas: alguém lê o relatório, fala com o
município, e só então autoriza. Nesse intervalo a coleta que estava presa num
aparelho pode ter drenado, e o objeto que constava como órfão passou a ser a
prova de um ato. Por isso o descarte confere **cada chave de novo** contra o
banco no instante de apagar, e o que voltou a ser referido é marcado como
`mantido`, com o motivo, em vez de apagado.

Pela mesma razão o descarte é sobre a lista de **uma rodada**: quem autoriza
autoriza aquela lista, do dia em que a leu. Objeto que entrou na lista depois não
está coberto.

### A reserva que nunca virou byte

O outro lado do órfão, e ele não custa armazenamento: a linha que autorizou um
envio que nunca aconteceu. Ela não é lixo no balde, é **reserva no teto**. A
varredura marca `abandonada_em` nessas linhas (nunca apaga: registro não se
apaga, se encerra com motivo), e elas param de consumir o teto. Se o mesmo envio
for retomado com a mesma chave de idempotência, a rota de autorização
**ressuscita** a reserva.

---

## Os comandos

Todos rodam com a credencial de **dono** do banco, como `provisionar`. Pela mesma
razão: fixar teto é ato de contrato, varrer alcança o balde de todos os
municípios, e descartar apaga fotografia. Nenhum dos três pode existir atrás de
um token de município.

```bash
# quanto cada município ocupa, e quanto é o teto dele
DATABASE_URL=... npm run armazenamento --workspace @dc360/api -- --uso

# fixar o teto de um município, em gigabytes
DATABASE_URL=... npm run armazenamento --workspace @dc360/api -- \
  --teto --municipio <uuid> --gb 200

# listar objeto órfão. NÃO apaga nada, e imprime o identificador da rodada
DATABASE_URL=... S3_ENDPOINT=... S3_BALDE=... S3_CHAVE_ID=... S3_CHAVE_SECRETA=... \
  npm run armazenamento --workspace @dc360/api -- --varrer

# apagar o que aquela rodada listou, DEPOIS de conferir com o município
DATABASE_URL=... S3_... npm run armazenamento --workspace @dc360/api -- \
  --descartar <id da rodada> \
  --operador "Fulana, operação da plataforma" \
  --motivo "Lista conferida com Serra Alta em 10/09; nenhuma vistoria refere estes arquivos." \
  --confirmo
```

Se o relatório da varredura trouxer **falhas**, a lista tem buraco e não serve
para autorizar descarte: refaça a varredura. O comando imprime isso em voz alta.

### O relógio dentro da API

`VARREDURA_DE_ORFAOS_ATIVA=sim` põe a varredura num relógio de 24 horas dentro da
API. Ela **só relata**, e por isso estar num relógio é seguro: o que o relógio
produz é uma lista atualizada, nunca um arquivo a menos.

Ela sobe **desligada por padrão**, e a razão tem data de validade: a listagem do
S3 (`ListObjectsV2`) nunca falou com provedor de verdade. Ela é conferida contra
XML de resposta em teste, o que prova a leitura e não o diálogo. Ligá-la por
padrão faria um caminho nunca exercitado começar a percorrer o balde inteiro da
produção sozinho no primeiro deploy depois desta entrega.

**Quando essa chave morre:** no dia em que a varredura rodar uma vez pelo comando
do operador contra o provedor de verdade e a contagem de objetos bater com o
painel do armazenamento. Aí a variável some e o relógio passa a subir sempre.

O relógio da API **não recebe lista de municípios**: os donos saem do prefixo das
chaves e são confirmados debaixo do RLS. Assim a API continua sem nenhum
privilégio capaz de enumerar prefeituras, que é a regra número um daqui. O preço,
dito em voz alta: município que não tem nenhum objeto no balde não aparece em
prefixo nenhum, então as reservas velhas dele só são soltas pelo comando do
operador, que traz a lista completa.

---

## O que NÃO foi feito

- **A fotografia REFERIDA por um laudo continua sem descarte por prazo.** A
  seção 4 de `PRIVACIDADE.md` promete esse prazo e continua dizendo que ele não
  está implantado. O que entrou aqui é o passo anterior: o arquivo que nenhum
  registro justifica.
- **A varredura nunca rodou contra o provedor de verdade.** Ver a chave acima.
- **O consumo não aparece no console do fornecedor.** Quem é avisado hoje é o
  administrador do município (`GET /armazenamento/uso`) e o operador da
  plataforma (`--uso`). Levar o número para a métrica que o console lê é uma
  coluna numérica a mais em `metricas_municipio` (migração 023), que ainda não
  foi feita.
- **Não existe tela.** O número sai por rota e por comando, e nenhuma página do
  painel o mostra ainda.
- **O aviso não usa o sino.** `avisos.ocorrencia_id` é obrigatório, e este aviso
  não é sobre uma ocorrência. Ele viaja na resposta da autorização de envio, que
  é o caminho que já acontece seis vezes por vistoria.
