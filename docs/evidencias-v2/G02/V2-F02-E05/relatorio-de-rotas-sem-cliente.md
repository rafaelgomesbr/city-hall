# Contrato cliente x rota: relatório (V2-F02-E05)

Rotas `/v1` registradas pelo servidor montado: 96. Chamadas distintas (método e caminho) do painel: 75; do campo: 21; do console: 15 (de 16 rotas do console).

Este relatório NÃO reprova nada: há rota só de API. Rafael marca as que deveriam ter cliente.

## Rotas /v1 sem cliente (nem painel nem campo) (9)

- GET /aplicativos/:p/versao-minima
- GET /auth/eu
- GET /documentos/validar/:p
- GET /evidencias/:p/url
- GET /saida-a-campo/minha
- POST /aparelhos/revogar
- POST /saida-a-campo
- POST /saida-a-campo/prorrogar
- POST /saida-a-campo/retorno

## Rotas /v1 só do painel (66)

- GET /armazenamento/uso
- GET /auth/recuperacao
- GET /auth/sessoes
- GET /busca
- GET /documentos/:p/laudo
- GET /documentos/:p/laudo.pdf
- GET /documentos/:p/termo-de-desinterdicao
- GET /documentos/:p/termo-de-interdicao
- GET /documentos/:p/termo-de-interdicao.pdf
- GET /equipes
- GET /ocorrencias
- GET /ocorrencias/devolvidas
- GET /ocorrencias/duplicidades/consulta
- GET /ocorrencias/indicadores/painel
- GET /ocorrencias/interditados
- GET /ocorrencias/mapa
- GET /ocorrencias/providencias/pendentes
- GET /oficios
- GET /oficios/:p
- GET /oficios/:p/documento
- GET /organizacao/retencao
- GET /orgaos
- GET /relatorios/consultas
- GET /relatorios/exportacoes
- GET /relatorios/ocorrencias.csv
- GET /relatorios/resumo
- GET /saida-a-campo
- GET /segundo-fator
- GET /trilha
- GET /trilha/tipos
- GET /usuarios
- GET /usuarios/:p/sessoes
- PATCH /equipes/:p
- PATCH /organizacao/retencao
- PATCH /orgaos/:p
- PATCH /usuarios/:p
- PATCH /usuarios/:p/situacao
- POST /auth/encerrar-sessoes
- POST /auth/recuperar
- POST /auth/redefinir
- POST /auth/segundo-fator
- POST /auth/trocar-senha
- POST /equipes
- POST /mapa/resolver-link
- POST /ocorrencias
- POST /ocorrencias/:p/coordenada
- POST /ocorrencias/:p/desinterdicao
- POST /ocorrencias/:p/despacho
- POST /ocorrencias/:p/encerramento
- POST /ocorrencias/:p/providencia
- POST /ocorrencias/:p/providencia/:p/resposta
- POST /ocorrencias/:p/triagem
- POST /oficios
- POST /oficios/:p/envio
- POST /orgaos
- POST /orgaos/:p/desativacao
- POST /orgaos/:p/reativacao
- POST /publico/interesse
- POST /saida-a-campo/encerrar
- POST /saida/pacote.zip
- POST /segundo-fator/confirmar
- POST /segundo-fator/desativar
- POST /segundo-fator/iniciar
- POST /usuarios
- POST /usuarios/:p/encerrar-sessoes
- POST /usuarios/:p/redefinir-senha

## Rotas /v1 só do campo (12)

- DELETE /usuarios/eu/foto
- GET /sincronizacao/pendencias
- GET /usuarios/eu
- POST /aparelhos
- POST /evidencias/autorizar-envio
- POST /evidencias/confirmar-envio
- POST /rota
- POST /sincronizacao/devolucao
- POST /sincronizacao/pendencias/reconciliar
- POST /sincronizacao/vistoria
- POST /usuarios/eu/foto/autorizar-envio
- PUT /usuarios/eu/foto

## Rotas /v1 dos dois (9)

- GET /avisos
- GET /campo/meu-trabalho
- GET /configuracao
- GET /evidencias/ocorrencia/:p
- GET /ocorrencias/:p
- POST /auth/entrar
- POST /auth/renovar
- POST /auth/sair
- POST /avisos/lidos

## Rotas do console sem chamada no script do console (1)

- GET /municipios/:p/serie

## Chamadas por arquivo

| Cliente | Arquivo | Chamadas lidas | Mecanismo (definição, repetição, envio, assinada) | Contadas por outro caminho |
|---|---|---|---|---|
| painel | `apps/web/src/dados/http.ts` | 71 | 3 (definicao, envio, repeticao) | 74 |
| campo | `apps/campo/src/dados/api.ts` | 13 | 2 (definicao, envio) | 15 |
| campo | `apps/campo/src/dados/historico-da-casa.ts` | 2 | 2 (definicao, envio) | 4 |
| campo | `apps/campo/src/dados/mapa.ts` | 1 | 0 (nenhum) | 1 |
| campo | `apps/campo/src/dados/rota.ts` | 1 | 0 (nenhum) | 1 |
| campo | `apps/campo/src/dados/foto-do-agente.ts` | 0 | 1 (assinada) | 1 |
| campo | `packages/campo/src/transporte.ts` | 4 | 5 (assinada, definicao, definicao, envio, repeticao) | 9 |
| console | `apps/console/src/pagina.ts (JS_DO_CONSOLE)` | 15 | 4 (definicao, definicao, envio, repeticao) | 19 |

## O que foi conferido contra o esquema do registro (chamadas do painel e do campo; o console não tem registro)

| Situação | Corpo | Consulta |
|---|---|---|
| conferido | 27 | 3 |
| sem-esquema | 0 | 0 |
| sem-entrada | 0 | 0 |
| esquema-ilegivel | 0 | 0 |
| nao-lido | 19 | 9 |
| sem-dado | 50 | 84 |

- `conferido`: o texto do cliente mostrou as chaves e o esquema do registro as aceitou (sem chave desconhecida, com todas as obrigatórias).
- `nao-lido`: o corpo vem de variável ou de expressão (ou a query é montada em tempo de execução): NÃO se leu estaticamente, e fica declarado aqui.
- `sem-esquema` / `sem-entrada` / `esquema-ilegivel`: o registro não descreve o corpo ou a consulta, ou a rota está em `pendentes`, ou o esquema não é um objeto simples.
- `sem-dado`: a chamada não manda corpo/consulta e a rota não exige.

## Corpos e consultas que não deu para ler estaticamente (28)

- POST /segundo-fator/iniciar (apps/web/src/dados/http.ts linha 490): corpo: o corpo não é um objeto literal
- GET /ocorrencias (apps/web/src/dados/http.ts linha 585): consulta: a query é montada em tempo de execução; só as chaves escritas no texto foram conferidas
- POST /ocorrencias/:p/coordenada (apps/web/src/dados/http.ts linha 758): corpo: o corpo vem da variável correcao
- GET /ocorrencias/duplicidades/consulta (apps/web/src/dados/http.ts linha 778): consulta: a query é montada em tempo de execução; só as chaves escritas no texto foram conferidas
- POST /ocorrencias (apps/web/src/dados/http.ts linha 787): corpo: o corpo vem da variável dados
- POST /ocorrencias/:p/triagem (apps/web/src/dados/http.ts linha 792): corpo: o corpo vem da variável t
- POST /ocorrencias/:p/despacho (apps/web/src/dados/http.ts linha 796): corpo: o corpo vem da variável d
- POST /ocorrencias/:p/providencia (apps/web/src/dados/http.ts linha 813): corpo: o corpo vem da variável p
- POST /ocorrencias/:p/encerramento (apps/web/src/dados/http.ts linha 821): corpo: o corpo vem da variável e
- POST /ocorrencias/:p/providencia/:p/resposta (apps/web/src/dados/http.ts linha 830): corpo: o corpo vem da variável resposta
- POST /publico/interesse (apps/web/src/dados/http.ts linha 979): corpo: o corpo vem da variável dados
- GET /trilha (apps/web/src/dados/http.ts linha 1082): consulta: a query é montada em tempo de execução; só as chaves escritas no texto foram conferidas
- GET /relatorios/resumo (apps/web/src/dados/http.ts linha 1099): consulta: a query é montada em tempo de execução; só as chaves escritas no texto foram conferidas
- GET /relatorios/ocorrencias.csv (apps/web/src/dados/http.ts linha 1120): consulta: a query é montada em tempo de execução; só as chaves escritas no texto foram conferidas
- PATCH /organizacao/retencao (apps/web/src/dados/http.ts linha 1146): corpo: o corpo vem da variável dados
- GET /relatorios/consultas (apps/web/src/dados/http.ts linha 1191): consulta: a query é montada em tempo de execução; só as chaves escritas no texto foram conferidas
- GET /avisos (apps/web/src/dados/http.ts linha 1222): consulta: a query é montada em tempo de execução; só as chaves escritas no texto foram conferidas
- GET /orgaos (apps/web/src/dados/http.ts linha 1250): consulta: a query é montada em tempo de execução; só as chaves escritas no texto foram conferidas
- POST /orgaos (apps/web/src/dados/http.ts linha 1257): corpo: o corpo vem da variável dados
- PATCH /orgaos/:p (apps/web/src/dados/http.ts linha 1265): corpo: o corpo vem da variável dados
- POST /oficios/:p/envio (apps/web/src/dados/http.ts linha 1337): corpo: o corpo não é um objeto literal
- POST /saida-a-campo/encerrar (apps/web/src/dados/http.ts linha 1407): corpo: o corpo vem da variável encerramento
- POST /auth/sair (apps/campo/src/dados/api.ts linha 299): corpo: o corpo não é um objeto literal
- POST /usuarios/eu/foto/autorizar-envio (apps/campo/src/dados/api.ts linha 739): corpo: o corpo vem da variável foto
- GET /avisos (apps/campo/src/dados/api.ts linha 862): consulta: a query é montada em tempo de execução; só as chaves escritas no texto foram conferidas
- POST /evidencias/autorizar-envio (packages/campo/src/transporte.ts linha 323): corpo: o corpo não é um objeto literal
- POST /sincronizacao/devolucao (packages/campo/src/transporte.ts linha 390): corpo: o corpo vem da variável devolucao
- POST /sincronizacao/vistoria (packages/campo/src/transporte.ts linha 395): corpo: o corpo vem da variável envelope
