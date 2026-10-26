# Política de versões da API

## 1. Para que serve e para quem

Esta política orienta o gestor técnico da prefeitura e o time que mantém o
Defesa Civil 360. Ela diz como publicar uma rota, avisar que um caminho vai
sair de uso e encerrar esse caminho sem perder o trabalho do aplicativo.

É a parte documental da V2-F02-E08. O prefixo `/v1` identifica o contrato da
API. O espelho legado é a cópia das rotas antigas no caminho sem prefixo,
mantida para os aplicativos já instalados.

**Situação nesta árvore:** o prefixo, o espelho e os cabeçalhos de aviso já
existem. Os controles da E06 e o código restante da E08 estão **PENDENTES de
implementação no lote seguinte**. As regras abaixo descrevem também o que
esse lote deve entregar. Este documento não liga o encerramento.

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

**PENDENTE (E08, lote seguinte):** implementar e provar essa recusa por data e
chave. Hoje não há recusa automática ao chegar a data provisória.

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

**PENDENTE (E06, lote seguinte):** entregar o comportamento abaixo:

- O campo envia `X-App-Version` com a versão do aplicativo. O painel envia
  `painel/<build>` apenas para observabilidade.
- A API compara maior, menor e correção, ignorando o pré-lançamento. Cada
  aplicativo tem seu mínimo: `VERSAO_MINIMA_CAMPO` e `VERSAO_MINIMA_CIDADAO`.
  Ambas ficam vazias por padrão, sem recusa por versão mínima.
- Em `/v1`, aplicativo abaixo do mínimo recebe 426 **antes da autenticação**,
  com `{ erro: "versao_do_aplicativo_antiga", mensagem, versaoMinima }`.
- Até o fim do espelho, cabeçalho ausente é aceito e contado em log de nível
  `info`. Cabeçalho malformado é ignorado, sem virar erro 500.
- A rota pública `GET /v1/aplicativos/:aplicativo/versao-minima` informa o mínimo
  sem token e sem dado de município. O CORS permite `x-app-version`.
- **A fila do campo nunca perde item por receber 426.** O item permanece
  guardado no aparelho para envio depois da atualização. O 426 não confirma
  entrega e não autoriza limpar a fila. A prova da E06 deve conferir isso.

Esvaziar o mínimo desliga a recusa por versão daquele aplicativo. Isso não
reabre um espelho encerrado, que depende de outra chave.

## 5. Como decidir a data do fim do espelho

Não escolha a data só pelo calendário. Primeiro meça as chamadas que ainda
dependem do caminho antigo e confira as versões disponíveis para atualização.

**PENDENTE (E08, lote seguinte):** contador de uso do espelho em log
estruturado, nível `info`, por método, rota e `X-App-Version`. Use o modelo da
rota, como `/ocorrencias/:id`, sem o identificador real. Conte separadamente
chamadas sem versão e com versão inválida. Elas também são uso do espelho.

O contador guarda rota, versão e quantidade. Não junte usuário, município,
token, endereço IP, corpo ou consulta da URL. O relatório precisa mostrar o
período medido e as contagens por rota e versão. Ausência de medição não prova
ausência de uso.

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
| `ESPELHO_LEGADO_ATE` | `2027-12-31` (PROVISÓRIO) | Já existe. Data `AAAA-MM-DD`, validada como data real. Hoje só alimenta `Sunset` |
| `ESPELHO_LEGADO_ENCERRADO` | `nao` | **PENDENTE de criação no lote seguinte (E08)**. Só a V2-F28-E11 liga `sim`, depois da decisão e do prazo |
| `VERSAO_MINIMA_CAMPO` | Vazia, sem mínimo | **PENDENTE de criação no lote seguinte (E06)**. Mínimo aceito para o aplicativo de campo |
| `VERSAO_MINIMA_CIDADAO` | Vazia, sem mínimo | **PENDENTE de criação no lote seguinte (E06)**. Mínimo aceito para o aplicativo do cidadão |

Ao implementar as variáveis pendentes, inclua seus padrões na configuração e
na matriz de ambientes. Não trate seus efeitos como disponíveis antes da
entrega do código e das provas. Este arquivo cobre somente a documentação.

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
