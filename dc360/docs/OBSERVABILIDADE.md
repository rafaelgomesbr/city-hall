# Observabilidade: código de suporte, erro, rotinas e o monitor de /saude

- **Versão:** 1, de 2026-10-24 (V2-F01-E14).
- **Estado:** a parte de código está pronta e testada. O destino externo do erro
  e o monitor de `/saude` dependem de decisão e de conta do dono (seção 5).

Antes desta etapa, uma falha só era vista por quem abria o log de propósito:
o id da requisição ia ao log e a lugar nenhum mais, a rotina que falhava
escrevia a falha no mesmo nível de uma rodada boa, e nada avisava se a API
caísse. Este documento diz o que existe agora e o que ainda falta.

## 1. O código de suporte (id da requisição)

Toda resposta da API e do console devolve o cabeçalho `X-Request-Id`, um UUID.
O mesmo valor está em toda linha de log daquela requisição (campo `reqId`) e,
no erro 500, no corpo da resposta (campo `requisicao`).

- **O painel mostra o código nos erros 5xx.** A mensagem termina com
  "Código de suporte: `<uuid>`". Erro 4xx (a pessoa corrigindo algo) não mostra.
- **Quem recebe o código** procura no log por `reqId` igual a ele, ou
  `requisicao` na linha `erro nao tratado`.
- **O cliente pode mandar o próprio `X-Request-Id`**, e ele só vale se for UUID.
  Qualquer outra coisa (texto, quebra de linha, 200 caracteres) é descartada e a
  requisição ganha um id novo. É assim porque o id entra em toda linha de log e
  volta num cabeçalho: texto livre ali seria injeção de linha no log.
- **O id correlaciona, não autentica.** Como o cliente pode escolher o valor,
  dois pedidos podem chegar com o mesmo id. Quem fez o quê está na trilha de
  auditoria, nunca no id.
- O id é um UUID sem relação com pessoa ou município: não vaza dado pessoal nem
  a organização de ninguém.

## 2. O erro inesperado

Todo erro que cai no tratador central da API (o 500) passa pelo
`ReportadorDeErros` (`apps/api/src/observabilidade/reportador.ts`):

1. **Log em nível `error`**, com `requisicao`, `origem`, `metodo`, o MOLDE da rota
   (`/ocorrencias/:id`, nunca a barra de endereço com identificador e query
   string) e o status. Mensagem e pilha saem com e-mail, CPF, telefone,
   coordenada e token trocados por marcador.
2. **Destino externo: ainda não existe.** O desenho já está pronto (a função
   `enviar` de `criarReportador` recebe o evento depois de
   `filtrarEventoParaTerceiros`, que é o `beforeSend` do SDK), mas NÃO há SDK
   instalado nem chamada de rede, porque a ferramenta e o lugar onde o dado mora
   são decisão do CP-06 (K13 e J7). Com `ERROS_DSN` definido, a API avisa na
   partida que o valor está sendo ignorado, para ninguém achar que o erro já
   chega a um terceiro. O DSN nunca é escrito em log.

O que o filtro garante que nunca sai para um terceiro: corpo, cabeçalhos
(`authorization`, `cookie`, `user-agent`, `x-forwarded-for`), cookies, barra de
endereço e query string, IP, bloco de usuário e variáveis locais da pilha. O que
sai é mascarado: e-mail, CPF, telefone, coordenada de quatro casas ou mais e
token. A máscara é rede de segurança, não garantia: nome de pessoa e endereço
escrito por extenso passam por ela.

Erro que escapa de tudo (exceção não tratada, promessa rejeitada sem `catch`)
passa pelo mesmo reportador e depois derruba o processo com código 1, que é o que
o Node já fazia. No painel, erro global do navegador vai para o console do
navegador com a mesma máscara, sem pilha e sem endereço da página.

## 3. Rotinas agendadas

A minimização por prazo, a escrita do resumo e a varredura de objeto órfão agora
escolhem o nível de cada linha. **Falha é `error`**; rodada boa continua em
`info`. A varredura de órfãos que termina com falha de listagem também é `error`,
porque a lista tem buraco.

| Linha de log | Nível |
| --- | --- |
| `minimizacao por prazo falhou inteira` | `error` |
| `municipio nao conseguiu escrever o proprio resumo` | `error` |
| `escrita do resumo dos municipios falhou inteira` | `error` |
| `varredura de objeto orfao falhou inteira` | `error` |
| `varredura de objeto orfao concluida`, com falhas | `error` |
| as mesmas rotinas, sem falha | `info` |

A eliminação por prazo continua registrando tudo em `warn`, por decisão antiga
(ver `eliminacao/relogio.ts`); separar a falha dela é dívida registrada no
RESUMO desta etapa.

## 4. O alerta de armazenamento do bucket

`S3_COTA_BYTES` é a cota do bucket, em bytes inteiros, contratada com o provedor.
Com ela definida, a API mede o bucket inteiro uma vez por dia (e na partida) e
escreve uma linha:

- **acima de 80% da cota:** `armazenamento acima do limiar de alerta da cota do bucket`,
  em nível `error`, com `objetos`, `bytes`, `cotaBytes` e `percentual`;
- **até 80%:** a mesma conta em `info`;
- **listagem que falha:** `error`, e nenhum número (uma soma parcial diria 40%
  quando o balde está em 90%).

Sem `S3_COTA_BYTES` não há alerta, e valor inválido (`10GB`, `0`, `1e12`) desliga o
alerta e escreve um aviso na partida. Isto é diferente do teto por município
(`ARMAZENAMENTO.md`): o teto é o contratado com cada prefeitura, a cota é o balde
do fornecedor, que se encher para todos de uma vez. A medição lista o balde (chamada
cobrada pelo provedor), por isso roda com trava, uma máquina por vez.

**A linha de log sozinha não acorda ninguém.** Quem a transforma em aviso é uma
regra no destino de logs ou no monitor (seção 5).

## 5. O que depende do dono

| O quê | Por quê |
| --- | --- |
| Criar o monitor externo de `/saude` | É conta em serviço de terceiro. Configuração sugerida abaixo |
| Receber o alerta de teste | Só o dono confirma que o aviso chegou |
| Decidir a ferramenta de erro e onde o dado mora (CP-06) | Subprocessador novo: exige aviso aos municípios com 30 dias de antecedência. Quando houver decisão, a linha entra em `SUBPROCESSADORES.md` |
| Regra de alerta para linhas `error` das rotinas e do armazenamento | Depende do destino de logs escolhido |
| Definir `S3_COTA_BYTES` no ambiente | É segredo/ambiente de produção e HML (a linha de contrato é da E09) |

**Monitor de `/saude` (sugestão):** pedido `GET` a `<url da API>/saude` a cada
minuto; sucesso é status 200 e corpo com `"status":"ok"`; o banco fora do ar
responde 503 com `"status":"indisponivel"`. Alertar depois de 2 falhas seguidas,
para um canal que o dono realmente lê. Fazer o mesmo para o console
(`/saude` dele responde `{"ok":true,...}`). `/saude` é pública e não traz nome de
município nem de pessoa: só contagens, a versão e o commit.
