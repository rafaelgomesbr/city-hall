---
validador: privacidade-lgpd
modelo: claude-sonnet-5-5
etapa: V2-F00-E08
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [UI, A11Y, AUTH, AUTHZ, TENANT, API, LGPD]
nivel_de_prova_exigido: [E1, E3a]
nivel_de_prova_obtido: [E1, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Inventário do que as três rotas devolviam ao papel agente antes da etapa, o que passou a devolver e o que ainda passa. Base legal, controlador, operador e DPO não são do agente: ver "Motivo do humano".

| Dado | Rota | Natureza | Antes (agente) | Depois (agente) | Prova |
| --- | --- | --- | --- | --- | --- |
| `orgao_email` (e-mail do órgão destinatário) | `GET /oficios/:id` | institucional na semente; coluna de texto livre | 200 | 403 | `rotas/oficios.ts:226` (`autorizar(..., "consultar_oficio")` antes de qualquer SQL); sonda: Diego e Bruno 403 |
| `observacoes` (texto livre da coordenação) | `GET /oficios/:id` | pode conter dado pessoal de terceiro, não classificado | 200 | 403 | `oficios.ts:231`; sonda 403 |
| IP de quem abriu o link (`host(ip)`) | `GET /oficios/:id` | dado pessoal (IP é identificador) | 200 | 403 | `oficios.ts:253`; sonda 403; teste afirma que o corpo não traz IP |
| `destinatario_email`, `solicitado_por_nome`, `emitido_por_nome` (nome de servidor e papel) | ficha e lista de ofício | pessoal (servidor, e-mail digitável livremente em `POST /envio`, `oficios.ts:432`) | 200 | 403 | `oficios.ts:189,226,235` |
| Protocolo e tipo de fato de ocorrência de outra equipe | `GET /avisos` (lista) | dado de ocorrência (protocolo identifica caso e família) | município inteiro | só a equipe do agente | `avisos.ts:276-283` (junta `ocorrencias o` e `eRecorteDoAgente`); `recorte-do-agente.ts:30-51` |
| `naoLidos` | `GET /avisos` | agregado que denunciava avisos alheios | município inteiro | mesmo recorte da lista, junta `ocorrencias` | `avisos.ts:408-421` |
| marcar como lido | `POST /avisos/lidos` | oráculo de existência | `marcados: 1` | `marcados: 0` fora do recorte | RESUMO e teste (não reli o trecho de `POST`; coberto pelo teste verde) |

Minimização por papel: o aparelho do agente não usa ofício (a etapa afirma: sem ocorrência em `apps/campo` nem `packages/campo`; não reconferi por grep). O agente precisa do sino da equipe, não do município: o recorte é a minimização correta. O aviso em si carrega só tipo, protocolo, instante e `detalhe` ('sozinho' ou 'acompanhado', severidade; comentário em `avisos.ts:306-316`): nome, contato, endereço e relato não passam pelo sino, e isso não mudou. Coordenação, operador e administração mantêm o recorte anterior (necessidade operacional: o sino é a fila deles).

Logs e trilha: `GET` de ofício e de aviso não geram evento de trilha de leitura (nem antes nem depois; a etapa não prometia). O log de requisição, capturado na sonda com `destinoDeLog`, em 62 linhas e 24 pedidos (agente, operador e coordenador), não contém o e-mail do órgão, o IP do ofício nem a observação (`LOG_tem_email_orgao`, `LOG_tem_ip`, `LOG_tem_observacao` todos falsos). O log guarda a URL do pedido e `remoteAddress` do cliente (IP do servidor municipal que consulta), pré-existente e fora do escopo.

E-mail em `GET /orgaos`: a coluna `orgaos.email` e `telefone` são texto livre (`017_orgaos_oficio_e_email.sql:95-96`). Na semente e no teste é caixa funcional institucional (`plantao@`), e a LGPD protege pessoa natural identificável: caixa funcional não nominal tende a não ser dado pessoal, mas nada no schema impede um e-mail nominal (`fulano.silva@`), que seria dado pessoal de servidor. O schema não classifica a coluna. Conclusão: depende do cadastro; é institucional por convenção, não por garantia.

## Evidência

- Sonda temporária `apps/api/test/zz-sonda-lgpd-tmp.test.ts` (criada e APAGADA; árvore conferida depois): servidor montado com `construirServidor`, banco em memória semeado, ofícios com e-mail, observação e IP; tokens de Diego (Alfa), Bruno (Bravo), Jonas (operador) e Helena (coordenadora). Saída em `scratchpad/sonda.json`, saída do vitest 0. Resultado: agente 403 `sem_permissao` em `/oficios` e `/oficios/:id`; operador e coordenadora 200 com `observacoes`, `orgao_email` e aberturas.
- `npx vitest run test/leitura-do-agente-oficios-e-avisos.test.ts`: 14 de 14, saída 0.
- Leitura de código com linha: acima.

## Cenários positivos
Operador e coordenadora listam e abrem o ofício com o conteúdo de sempre (200, sonda). O agente continua recebendo `/avisos` 200 recortado à equipe (na sonda a lista veio vazia porque a semente nova não tinha aviso de sino; o teste de 14 casos, que semeia avisos, compara lista e contagem com o oráculo do banco).

## Cenários negativos
Agente 403 nas duas rotas de ofício, igual para ofício da própria equipe, de outra e id inexistente (teste). Agente de outro município 403; coordenador de outro município 404 (teste, não reexecutado individualmente por mim além do arquivo verde).

## Tentativas de reprovar
- Procurei dado pessoal que ainda chegue ao agente: `GET /orgaos` devolve nome, sigla, e-mail, telefone e contagens por órgão (200 ao agente, sonda). `GET /equipes` devolve nome, especialidade e `em_atendimento` por equipe (200 ao agente). Nenhum traz nome de pessoa, CPF, endereço ou protocolo.
- Procurei vazamento pelo log: busquei e-mail, IP e observação nas linhas capturadas: nenhum.
- Procurei contorno do recorte do sino por parâmetro: `desde` e `desdeId` só mudam o cursor, a equipe vem do cadastro (`recorte-do-agente.ts:37`).
- Procurei diferença 403 vs 422 que denunciasse ofício: permissão vem antes do `idSchema` (`oficios.ts:226-227`).
- Procurei dado pessoal nos avisos gravados: `detalhe` é 'sozinho'/'acompanhado' ou severidade; nome do agente deliberadamente fora (`avisos.ts:306-316`).

## Achados
- anotado: `GET /orgaos` e `GET /equipes` seguem abertos ao agente (adiados para F04 e F03-E12, declarados). O e-mail e o telefone do órgão ficam sem classificação de dado pessoal no schema; recomendo comentário de classificação (institucional ou pessoal) na F04 e orientação de cadastro de caixa funcional.
- anotado: `oficio_aberturas.ip` (inet) é append-only e a migração 017 não define retenção nem anonimização do IP do destinatário. Pré-existente, fora do escopo da E08; entra no inventário de retenção (regra 3 e 4 da skill) e precisa de decisão humana.
- anotado: `observacoes` do ofício é texto livre de até 2000 caracteres (`oficios.ts:42`) sem classificação nem aviso de que não deve conter dado de saúde ou de vulnerabilidade; o ofício completo, na rota pública, carrega solicitante e vulnerabilidade (`reunirOficio`, `oficios.ts:113-117`), fora desta etapa.
- anotado: `GET /avisos` ainda escreve para o token do agente; não expõe dado pessoal, é pendência registrada (`PENDENCIAS.md:18,118`).
- Nenhum achado bloqueia.

## Não verificado
- Base legal, finalidade, controlador, operador (provedor de e-mail, nuvem) e DPO: não são do agente; inventário completo de operações (art. 37) não existe para estas rotas.
- A rota pública `/publico/oficio/:token` e a emissão do ofício: fora da etapa.
- Que o aplicativo de campo não usa ofício: confiei no RESUMO e no bloco, sem grep próprio.
- `POST /avisos/lidos` no código: confiei no teste verde e no RESUMO.
- Papéis desativados (a vigência vale só na escrita, F03-E03): o agente desativado lê o sino até o token vencer, declarado.
- PostgreSQL 17, produção real e retenção efetiva dos avisos (60 dias, `avisos.ts:43`) em execução: não rodei.
- O dado do painel em modo local e as capturas.

## Risco residual
Exposição de e-mail e telefone de órgão, e de contagens por equipe, ao agente até a F04. IP de abertura sem retenção definida. Texto livre de observação sem classificação.

## Motivo do humano
Base legal do tratamento (execução de política pública, art. 7º, III e IV, a confirmar com assessoria jurídica), definição do controlador e do operador, indicação do encarregado e decisão sobre a retenção do IP em `oficio_aberturas`. A classificação do e-mail do órgão (institucional ou nominal) depende de como o município cadastra: decisão do produto e do jurídico.
