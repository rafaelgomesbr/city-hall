# Política de versões da API

## 1. Para que serve e para quem

Esta política orienta o gestor técnico da prefeitura e o time que mantém o
Defesa Civil 360. Ela diz como publicar uma rota, avisar que um caminho vai
sair de uso e encerrar esse caminho sem perder o trabalho do aplicativo.

É a parte documental da V2-F02-E08. O prefixo `/v1` identifica o contrato da
API. O espelho legado é a cópia das rotas antigas no caminho sem prefixo,
mantida para os aplicativos já instalados.

**Situação nesta árvore:** o prefixo, o espelho, os cabeçalhos de aviso, a
versão mínima por aplicativo com a resposta 426 (E06), o contador de uso do
espelho e a recusa do espelho encerrado (E08) existem no código da API e têm
teste. O que cada parte faz está descrito abaixo. Este documento não liga o
encerramento: `ESPELHO_LEGADO_ENCERRADO` nasce em `nao`.

## 2. O ciclo de vida de uma rota

### Introdução

Rota nova nasce só em `/v1`. Descreva a resposta no contrato OpenAPI de `/v1`
antes de publicar. Inclua os campos, os status e as respostas de erro.

Hoje o registro compartilhado cria a rota nos dois caminhos por padrão.
Para cumprir esta regra, registre a rota nova no bloco `if (!espelho)` de
`registrarRotasDeNegocio`, em `apps/api/src/servidor.ts`. Declare também a
entrada em `ROTAS_SO_NO_V1`, em `apps/api/src/versao-v1.ts`. O teste de
paridade confere essa declaração. Não amplie o espelho com rotas novas.

As exceções de infraestrutura não são o espelho: `GET /saude`,
`GET /armazenamento/objeto`, `PUT /armazenamento/objeto` e
`GET /publico/oficio/:token`. Seus endereços continuam
sem prefixo pelas razões registradas em `ROTAS_FORA_DO_PREFIXO`.

### Depreciação

Depreciar é avisar que o caminho será encerrado. Durante o aviso, ele continua
atendendo. Informe o caminho sucessor e comunique a mudança ao gestor técnico
e ao time responsável pelos aplicativos.

Toda resposta do espelho traz estes cabeçalhos, inclusive respostas de erro:

| Cabeçalho | O que informa |
| --- | --- |
| `Deprecation` | O caminho sem prefixo está depreciado. Hoje o código envia `true` |
| `Sunset` | A data de `ESPELHO_LEGADO_ATE`, como data HTTP, às 23:59:59 UTC daquele dia |
| `Link` | O mesmo caminho sob `/v1`, com `rel="successor-version"` |

Exemplo de sucessor: `Link: </v1/ocorrencias>; rel="successor-version"`.
O código retira a consulta da URL antes de montar esse cabeçalho.

**PROPOSTA a confirmar pelo Rafael:** aviso mínimo de **90 dias corridos**
antes do encerramento. Conte a partir da comunicação registrada com a data
confirmada e o sucessor disponível. O `Sunset` provisório, sozinho, não inicia
esse prazo. Registre novo aviso se houver adiamento e preserve o prazo mínimo.

**PENDENTE (Rafael):** definir a data de início da depreciação que substituirá
o valor `true` de `Deprecation`. A troca do cabeçalho exige implementação.
Este documento não atribui uma data a esse início.

### Encerramento

O encerramento do espelho pertence à V2-F28-E11. Exige data confirmada pelo
Rafael, aviso mínimo cumprido e revisão dos dados de uso e dos aplicativos.

Depois do fim do dia de `ESPELHO_LEGADO_ATE`, e somente com
`ESPELHO_LEGADO_ENCERRADO=sim`, o espelho deve responder HTTP **426**, com
`erro: "versao_do_aplicativo_antiga"` e `Link` para o caminho correspondente
sob `/v1`, com `rel="successor-version"`.

Essa resposta vem antes da autenticação e é igual para todos os municípios.
Não leva dado do município. Não devolva 404 para anunciar o encerramento:
o aplicativo antigo deve parecer desatualizado, não quebrado.

Data futura ou chave em `nao` mantém o atendimento normal do espelho, com os
cabeçalhos de aviso. Só mudar a data não encerra o espelho. Só ligar a chave
também não antecipa o prazo. As rotas de infraestrutura ficam fora dessa regra.

**Implementado (E08):** a recusa por data e chave existe e tem teste
(`apps/api/test/versao-v1.test.ts`). A regra, como o código a aplica:

- O espelho só encerra com `ESPELHO_LEGADO_ENCERRADO=sim` **e** depois das
  23:59:59 UTC do dia de `ESPELHO_LEGADO_ATE`, o mesmo instante do `Sunset`.
  O dia da data vale inteiro.
- A resposta é HTTP 426, `{ erro: "versao_do_aplicativo_antiga", mensagem }`,
  com `Deprecation`, `Sunset` e `Link: </v1/...>; rel="successor-version"`.
  Vem antes da autenticação e da validação do corpo, vale para toda rota do
  espelho (escrita inclusive) e não carrega dado de município nem de pessoa.
- Data futura, ou chave em `nao` (o padrão), mantêm o atendimento normal com os
  cabeçalhos de aviso.
- `/v1` não é afetado. `GET /saude`, `GET` e `PUT /armazenamento/objeto` e
  `GET /publico/oficio/:token` ficam fora da regra.
- A partida recusa a configuração sem data decidida. Data inválida (formato
  errado ou dia que não existe) ou vazia impede a partida em qualquer ambiente,
  produção inclusive. Ligar `ESPELHO_LEGADO_ENCERRADO=sim` sem escrever
  `ESPELHO_LEGADO_ATE` no ambiente também impede a partida: o padrão
  provisório não vale como decisão de encerrar.
- Rollback: voltar a chave para `nao` reabre o espelho sem novo deploy de
  código.

## 3. O que pode mudar dentro de `/v1`

Mudança compatível acrescenta capacidade sem exigir mudança no cliente que
já funciona. Os clientes precisam tolerar campos opcionais e códigos novos.

| Mudança compatível | Cuidado antes de publicar |
| --- | --- |
| Campo novo opcional | O cliente antigo continua funcionando sem conhecer o campo |
| Código de erro novo no catálogo | Documente o código; preserve o tratamento genérico de erro desconhecido |
| Rota nova | Publique só em `/v1`, com a resposta descrita no OpenAPI |

Acrescentar um código ao catálogo não autoriza trocar o status ou o código
`erro` de uma resposta já contratada.

São mudanças incompatíveis: remover ou renomear campo; mudar o status HTTP ou
o campo `erro` de uma resposta existente; tornar obrigatório o que era opcional.

Mudança incompatível exige **nova versão no caminho**. Nunca a publique dentro
de `/v1`. Mantenha o contrato anterior durante o aviso e planeje sua migração.
Esta política não cria `/v2`.

## 4. A versão do aplicativo

A versão do aplicativo é diferente da versão do caminho. O cabeçalho
`X-App-Version: campo/1.4.0` identifica o aplicativo e sua versão instalada.
Ele serve para compatibilidade. Não concede acesso nem identifica município.

**Implementado na API (E06):**

- A API lê `X-App-Version` no formato `aplicativo/versão`: `campo/1.4.0`,
  `cidadao/2.0.1` ou `painel/<build>`. O painel envia a build apenas para
  observabilidade, e o painel nunca é recusado por versão.
  O **envio** do cabeçalho pelo campo e pelo painel é a parte de cliente da E06
  (aplicativo de campo e painel), registrada na evidência dela. Enquanto o
  cliente não envia, o cabeçalho ausente é aceito e contado.
- A API compara maior, menor e correção, ignorando o pré-lançamento
  (`1.4.0-beta.2` vale `1.4.0`). Cada aplicativo tem seu mínimo:
  `VERSAO_MINIMA_CAMPO` e `VERSAO_MINIMA_CIDADAO`. Ambas ficam vazias por
  padrão, sem recusa por versão mínima. Um valor que não seja
  `maior.menor.correção` impede a partida: mínimo digitado errado não pode
  desligar a recusa em silêncio.
- Só em `/v1`, aplicativo abaixo do mínimo **do próprio aplicativo** recebe 426
  **antes da autenticação** e antes da validação do corpo, com
  `{ erro: "versao_do_aplicativo_antiga", mensagem, versaoMinima }`. O espelho e
  as rotas de infraestrutura não têm essa recusa.
- Até o fim do espelho, cabeçalho ausente é aceito e contado em log de nível
  `info` (`evento: "versao_do_aplicativo"`, `situacao: "ausente"`). Cabeçalho
  malformado, de aplicativo desconhecido ou repetido é ignorado, contado como
  `ilegivel`, e nunca vira erro 500. O log não guarda o texto recebido.
- A rota pública `GET /v1/aplicativos/:aplicativo/versao-minima` (`campo` ou
  `cidadao`) informa `{ aplicativo, versaoMinima }` sem token e sem dado de
  município, e `versaoMinima` é `null` quando não há mínimo. Ela nunca é recusada
  por versão: é por ela que o aplicativo velho descobre o que instalar. Só existe
  em `/v1`. O CORS permite `x-app-version`.
- **A fila do campo nunca perde item por receber 426.** O item permanece
  guardado no aparelho para envio depois da atualização. O 426 não confirma
  entrega e não autoriza limpar a fila. O lado do aparelho (a fila do campo) é
  a parte de cliente da E06 e tem prova própria.

O código `versao_do_aplicativo_ausente` continua RESERVADO no catálogo
(`packages/shared/src/erros.ts`): a API não recusa cabeçalho ausente, e a
obrigatoriedade no modo público do cidadão é da F11.

Esvaziar o mínimo desliga a recusa por versão daquele aplicativo. Isso não
reabre um espelho encerrado, que depende de outra chave.

## 5. Como decidir a data do fim do espelho

Não escolha a data só pelo calendário. Primeiro meça as chamadas que ainda
dependem do caminho antigo e confira as versões disponíveis para atualização.

**Implementado (E08):** cada pedido ao espelho gera uma linha de log
estruturado, nível `info`, com `evento: "uso_do_espelho"`, `metodo`, `rota`,
`aplicativo` e `versao`. A `rota` é o modelo da rota, como `/ocorrencias/:id`,
sem o identificador real. Chamadas sem versão têm `aplicativo: "ausente"` e
chamadas com versão inválida, `aplicativo: "ilegivel"`; as duas também são uso
do espelho. Pedido recusado por falta de token ou por validação também conta.
As rotas de infraestrutura e o `/v1` não geram essa linha.

O contador é a própria linha de log: o relatório conta as linhas por rota e
versão no período. Ele guarda método, rota e versão. Não leva usuário,
município, token, endereço IP, corpo nem consulta da URL, e o teste prova isso.
O relatório precisa mostrar o período medido e as contagens por rota e versão.
Ausência de medição não prova ausência de uso: a retenção do log e a ferramenta
que o agrega pertencem à operação, não a este código.

O time mantém a medição e prepara o relatório. O gestor técnico da prefeitura
revisa o impacto na operação e a possibilidade de atualizar os aparelhos.
O Rafael revisa esses dados e confirma ou adia a data.

**PROPOSTA a confirmar pelo Rafael:** revisar o relatório mensalmente, após
cada publicação de aplicativo e antes de autorizar a V2-F28-E11.

Em cada revisão, registre em `docs/evidencias-v2/G02/V2-F02-E08/`:

1. Período observado, contagens por rota e versão e chamadas sem versão válida.
2. Versão mínima publicada de cada aplicativo, pela rota da E06, e versão
   disponível para atualização. Se houver mudança, registre o mínimo proposto.
   Confirme que a versão aceita está disponível para quem precisa atualizar.
3. Impacto nas filas do campo e a prova de preservação dos itens com 426.
4. Quem revisou, a decisão do Rafael e o motivo de confirmar ou adiar.
5. Data de encerramento, se aprovada, e registro do aviso aos responsáveis.
   Se adiada, registre o bloqueio e a próxima revisão, sem inventar outra data.

**PENDENTE (Rafael):** aprovar os valores mínimos de cada aplicativo com base
nas versões publicadas. Este documento não escolhe números de versão.

### Calendário do espelho nesta entrega

| Item | Situação |
| --- | --- |
| Data configurada por padrão | **PROVISÓRIA: `2027-12-31`**, lida de `apps/api/src/config.ts`, em `ESPELHO_LEGADO_ATE` |
| Efeito atual dessa data | Alimenta `Sunset`; não encerra o atendimento |
| Encerramento | **ADIADO**, com decisão de data **PENDENTE do Rafael (H86)** |
| Orientação de H86 | Adiar com registro e só encerrar na V2-F28-E11, depois de medir o uso |
| Bloqueio | **V2-F28-E11 não executa sem data decidida** e sem a revisão prevista nesta política |

O adiamento não trava o lote da F02. A data provisória não vale como aprovação
para ligar o encerramento. Quando houver decisão, atualize a configuração,
este calendário e o registro da decisão juntos.

## 6. Variáveis de configuração

Estas são as variáveis desta política. Cabeçalhos HTTP não são variáveis de
ambiente. Nenhuma variável adicional é criada por este documento.

| Variável | Padrão | Situação e efeito |
| --- | --- | --- |
| `ESPELHO_LEGADO_ATE` | `2027-12-31` (PROVISÓRIO) | Data `AAAA-MM-DD`, validada como data real. Alimenta `Sunset` e, com a chave abaixo ligada, marca o fim do atendimento do espelho |
| `ESPELHO_LEGADO_ENCERRADO` | `nao` | `sim` ou `nao`. Só a V2-F28-E11 liga `sim`, depois da decisão e do prazo. Com `sim` exige `ESPELHO_LEGADO_ATE` escrita no ambiente |
| `VERSAO_MINIMA_CAMPO` | Vazia, sem mínimo | `maior.menor.correção`. Mínimo aceito para o aplicativo de campo em `/v1` |
| `VERSAO_MINIMA_CIDADAO` | Vazia, sem mínimo | `maior.menor.correção`. Mínimo aceito para o aplicativo do cidadão em `/v1` |

As quatro estão na configuração da API (`apps/api/src/config.ts`), no
`.env.example`, no `COLOCAR-DE-PE.md` e na matriz de ambientes
(`scripts/ambientes.json`), todas opcionais. Os mínimos são decisão do Rafael,
por aplicativo, com base nas versões publicadas.

## 7. O que este documento não decide

Ficam com o Rafael: a data real do fim do espelho (H86), a data de início para
o cabeçalho `Deprecation`, a confirmação do aviso mínimo e da rotina de revisão
propostos e os mínimos de cada aplicativo. A autorização para encerrar fica
para a V2-F28-E11, depois de medir o uso. Nenhuma dessas decisões está aprovada
por este texto.

## Referências para conferir

- [Plano da F02, E01, E06 e E08](../../docs/roadmap-v2/05-api-identidade-autorizacao.md).
- [Pendências humanas, H86](../../docs/roadmap-v2/pendencias-humanas.md).
- [Código dos cabeçalhos e das exceções](../apps/api/src/versao-v1.ts).
- [Configuração da API](../apps/api/src/config.ts).
- [README, A versão no caminho](../README.md#a-versão-no-caminho-v1-e-o-espelho-sem-prefixo-v2-f02-e01).
- [Pendências da API, espelho legado](../apps/api/PENDENCIAS.md#o-espelho-legado-sem-prefixo-v2-f02-e01).
- [Evidência da E01](../../docs/evidencias-v2/G02/V2-F02-E01/RESUMO.md).
