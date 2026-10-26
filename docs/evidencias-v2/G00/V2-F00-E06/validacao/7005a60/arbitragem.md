---
arbitro: arquiteto-software
modelo: claude-opus-5-5
etapa: V2-F00-E06
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
conflito: [qa, testes, red-team]
decisao: FAIL
confianca: alta
---
## Conflito

`qa.md` deu PASS com o 403 `troca_de_senha_obrigatoria` NÃO executado e escreveu a condição: "Se o gatekeeper ler `troca_de_senha_obrigatoria` como 403 de conta, este achado passa a BLOQUEIA e o veredito muda para FAIL". `testes.md` e `red-team.md` deram FAIL depois de executar o cenário, em unidade e contra a API real. Não há divergência de fato entre os três: o PASS do QA é condicional a uma pergunta de leitura que ele mesmo deixou em aberto. Cabe responder a pergunta.

## Prova reproduzida

Reprodução por leitura do código no SHA (HEAD 665b2be difere só no STATUS). Esta sessão não tinha ferramenta de execução de comando; as execuções são as de `testes.md` (Ponto 1) e `red-team.md` (A1), e a leitura abaixo confirma cada elo delas.

1. A API emite o código em toda escrita da fila: `apps/api/src/servidor.ts:478-486` lê a vigência do banco em escrita (`senhaProvisoria = vigencia.senhaProvisoriaAte !== null`) e `:495-497` lança `TrocaDeSenhaObrigatoria` para toda rota fora de `ROTAS_ABERTAS_COM_SENHA_PROVISORIA`.
2. O caminho é o ordinário: `apps/api/src/rotas/administracao.ts:487` grava `senha_provisoria_ate = now() + interval '72 hours'` e `:498` encerra as sessões. A sessão velha recebe 401 `sessao_encerrada` e pausa (a E06 funciona aí); o agente entra com a senha provisória e o próximo dreno recebe 403.
3. O aplicativo não trata a entrada com senha provisória: em `apps/campo/src` o único uso de `troca_de_senha_obrigatoria` é a frase de `dados/api.ts:74`; `trocaDeSenhaObrigatoria` não aparece. Nada impede o dreno automático de `_layout.tsx:186`.
4. O classificador: `packages/campo/src/transporte.ts:80-83` só faz `FalhaDeSessao` de 401 e de 403 cuja ação é `parar_e_avisar`; no catálogo (`packages/shared/src/codigos-de-erro.ts:89-91`) `troca_de_senha_obrigatoria` tem ação `trocar_a_senha`, então cai em `FalhaPermanente` (`:93-97`). `packages/campo/src/fila.ts:992` transforma `FalhaPermanente` em `bloqueado`.
5. A tela: `app/(agente)/fila.tsx:1354` `podeDescartar = parada || ...` oferece "Descartar" ao item bloqueado; `red-team.md` A1 executou o descarte e o servidor ficou com 0 vistorias, ou seja, a única cópia da coleta foi apagada.

## Decisão e fundamento

FAIL. Não há conflito real: o PASS do QA era condicional e a condição se verifica.

`troca_de_senha_obrigatoria` é 403 "de conta" no sentido do bloco e do gate:

- O código está em `CODIGOS_DE_ERRO_DE_ACESSO`, o mesmo catálogo de `conta_desativada`, e descreve o estado da conta do próprio usuário (`usuarios.senha_provisoria_ate`), não o dado enviado nem a permissão do papel.
- O bloco faz uma única exceção nominal: "403 `sem_permissao` continua permanente". Exceção nominal não se estende por analogia; o resto cai na regra geral.
- A DoD é escrita por efeito: "nenhum item bloqueado ou descartado por 401 ou 403 de sessão ou conta". O gate G00, item "Fila do campo sem perda": "401 e 403 de sessão ou conta pausam a fila e nenhum item é bloqueado, descartado ou duplicado". O efeito medido (todos os itens `bloqueado`, dreno não para, "Descartar" apaga a coleta) é literalmente o Problema que a etapa diz resolver ("fica marcada como recusada ... sem tela para desbloquear e com Descartar ao lado").
- Item 5 da seção 7 de `28` (perda de dado do campo) e item 2 (vigência): não admitem risco aceito. Registrar em `PENDENCIAS.md` (item 14) não aceita o risco.
- O título "trata os três códigos" nomeia o que motivou a etapa; não restringe a DoD, que é mais ampla e mais recente na leitura do gate.

Não é BLOCKED para Rafael: o critério é técnico e o texto decide. O que fica com ele é a frase de produto do novo motivo de pausa (a DoD já pede "frase aprovada").

Fora da pergunta arbitrada, e sem mudar esta decisão: a corrida `cancelar()` + troca de usuário (pausa atribuída ao usuário errado, `qa.md` 1, `testes.md` Ponto 2) e o autor errado na trilha append-only (`red-team.md` achado 2, itens 2 e 4 da seção 7) seguem com o gatekeeper, que decide se entram na correção da E06 ou em etapa própria do G00; nenhum dos dois pode virar risco aceito.

## Conserto mínimo no escopo

1. Teste vermelho primeiro, nas duas camadas: em `packages/campo/test/pausa-de-sessao.test.ts`, 403 `{erro:"troca_de_senha_obrigatoria"}` deixa todos os itens `pendente`, zero `bloqueado`, tentativas inalteradas e dreno parado; em `apps/api/test/campo-integracao.test.ts`, o roteiro A1 (redefinir senha, sessão velha pausa, entrada com senha provisória, dreno) termina com zero `bloqueado` e, depois da troca da senha, UMA vistoria no servidor.
2. `packages/campo/src/tipos.ts`: `MotivoDeSessao` ganha `troca_de_senha_obrigatoria`.
3. `packages/campo/src/transporte.ts` (`falhaDaResposta`): 403 com ação `trocar_a_senha` vira `falhaDeSessao("troca_de_senha_obrigatoria", corpo)`. Generalizar para "todo 403 do catálogo de acesso exceto `sem_permissao`" é a forma que impede o próximo código de escapar.
4. `fila.ts`: a pausa nova substitui a pausa velha (`pausadaPor` deixa de ficar em `sessao_encerrada`).
5. `apps/campo/src/dados/falha-de-atualizacao.ts` e a faixa da fila: motivo e frase próprios ("defina a sua senha no painel; suas coletas continuam guardadas neste aparelho"), sujeitos à aprovação do Rafael.
