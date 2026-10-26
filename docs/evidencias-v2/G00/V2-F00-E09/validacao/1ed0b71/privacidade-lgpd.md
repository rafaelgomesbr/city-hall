---
validador: privacidade-lgpd
modelo: claude-sonnet-5-5
etapa: V2-F00-E09
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD]
nivel_de_prova_exigido: [E1, E3a]
nivel_de_prova_obtido: [E1, E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Critério da etapa (campo "Impacto LGPD"): "a listagem não mostra IP nem user-agent completo (IDN-29); sessão é dado técnico da própria pessoa". Mais o risco de segurança: "a senha temporária aparece uma vez" e "a listagem não pode expor IP de terceiros".

Inventário dos dados pessoais tocados (campo, onde nasce, onde fica, quem lê, por quanto tempo):

| Dado | Nasce | Fica | Quem lê | Prazo |
| --- | --- | --- | --- | --- |
| `sessoes.ip` (inet) | login e renovação (`enderecoDoCliente(req)`) | tabela `sessoes`, RLS por município | nenhuma rota de sessão devolve; só investigação | sem expurgo hoje (dono V2-F05-E12) |
| `sessoes.user_agent` (texto inteiro) | cabeçalho do login | tabela `sessoes` | nenhuma rota devolve; `resumirAparelho` (`apps/api/src/auth/aparelho.ts`) o reduz a uma frase | sem expurgo hoje (V2-F05-E12) |
| `criada_em`, `expira_em`, `familia_id` | sessão | `sessoes` | a própria pessoa (`entrouEm`, `validaAte`); quem administra só vê quantidade e datas | vida da sessão |
| `nome`, `email` do alvo | cadastro | `usuarios` | tela de Usuários | vida da conta |
| senha temporária | sorteada na rota `POST /usuarios/:id/redefinir-senha` | só a resposta HTTP (`cache-control: no-store`) e o estado do componente; o banco guarda o hash | quem administra, uma vez | prazo de 72 h de validade |

Fluxo e controles, com arquivo e linha:
- `GET /auth/sessoes` (`apps/api/src/rotas/autenticacao.ts:265`, `auth/servico.ts:1352`) filtra por `usuario_id` do token; devolve só `entrouEm`, `validaAte`, `aparelho`, `atual`.
- `GET /usuarios/:id/sessoes` (`rotas/administracao.ts:625`): `gerenciar_usuarios` antes da transação, 404 para conta de outro município, `exigirPostoParaGerir` (403 `posto_insuficiente`); devolve `id`, `sessoesAbertas`, `ultimaEntradaEm`, `validaAte`.
- `redefinir-senha` (`administracao.ts:444`): resposta com `no-store`; a trilha administrativa grava `sessoesEncerradas`, nunca a senha.
- Painel: `Usuarios.tsx` e `MinhaConta.tsx` não usam localStorage, sessionStorage, indexedDB nem console (grep vazio); a senha temporária só vive no estado do componente (`Usuarios.tsx:689,709`).

Recusas sobre a própria conta (id normalizado em minúsculas, `administracao.ts`, `idSchema`): conferidas por `id-da-propria-conta.test.ts` (13 casos) e pelas suítes do item abaixo.

## Evidência

- API, 12 arquivos, 187 testes, código 0, no SHA: `sessoes-da-conta`, `id-da-propria-conta`, `senha-e-sessoes`, `familia-da-sessao`, `log`, mais os de recuperação e pacote. Saída: `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/api-e09-e10-e11.txt`.
- API, `superficie.test.ts`, `config.test.ts`, `acesso-suspenso.test.ts`, 48 testes, código 0 (`/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/api-superficie.txt`): nenhuma rota nova sem permissão.
- Painel, 7 arquivos, 112 testes, código 0 (`seguranca-da-conta`, `sessoes-e-senha-temporaria`, `recuperar-senha*`, `pacote-de-saida`, `paridade-dos-modos`, `correcao-4-da-e09`): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/web-testes.txt`.
- Sonda minha (API real em memória, PGlite, arquivo temporário já removido; saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/e09e10/`):
  - user-agent longo com marcador próprio no login: `e09-minhas-sessoes.json` traz `"aparelho":"Chrome em Linux"` e `"Safari em iOS"`, sem o marcador, sem "Mozilla", sem IP. O banco guardava o texto inteiro e o IP (`e09-banco-sessoes.json`): o dado fica guardado e não sai.
  - `e09-sessoes-de-terceiro.json`: só `id`, `sessoesAbertas`, `ultimaEntradaEm`, `validaAte`.
  - `e09-cache-headers.txt`: `no-store` nas duas leituras e em `redefinir-senha`.
  - `e09-temp-em-trilha.txt`: a senha temporária não aparece em `trilha_administrativa`, `trilha_eventos` nem `exportacoes`.
  - `e09-log-achados.txt`: log bruto do servidor (pino) e console durante login, listagem e redefinição: sem a senha temporária, sem o marcador do user-agent, sem a senha de login, sem o email.

## Cenários positivos

Própria conta lista as duas sessões com a marca "atual" na de onde veio o pedido; quem administra vê a contagem de um agente; redefinição devolve `senhaTemporaria` uma vez e as chaves `senhaTemporaria`, `sessoesEncerradas`, `mensagem`.

## Cenários negativos

Todos executados na sonda (`/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/e09e10/e09-outro-municipio.json`, `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/neg/negativos.json`):
- administradora de Serra Alta sobre usuário de Vale Fundo: `GET /usuarios/:id/sessoes` e `POST /usuarios/:id/redefinir-senha` respondem 404 com corpo idêntico ao de id inexistente (`nao_encontrado`), nunca 403.
- operador pedindo sessões de terceiro: 403 `sem_permissao`; agente nas três rotas: 403 `sem_permissao` (3 de 3).
- coordenador sobre administrador: 403 `posto_insuficiente`; sobre agente: 200 só com contagem.
- `GET /auth/sessoes` sem token: 401; com `?usuarioId=`, `?usuario_id=` e cabeçalho `x-usuario-id` de outra pessoa: devolve só as sessões do dono do token.

## Tentativas de reprovar

1. Procurei IP e user-agent em qualquer corpo de resposta de sessão com marcador próprio: não vazam.
2. Procurei a senha temporária em trilha, em outras tabelas de auditoria, em log e em armazenamento do navegador: não há.
3. Tentei ler sessão de outra pessoa por parâmetro, cabeçalho e rota de terceiro: sempre o dono do token ou 403/404.
4. Mutação em `apps/api/src/rotas/administracao.ts:24` (tirei o `.transform` que põe o id em minúsculas, restaurei com `git restore` e `cmp`): `id-da-propria-conta` e `sessoes-da-conta` ficam com 6 vermelhos de 40, todos nas três recusas sobre a própria conta (autoredefinição, autoencerramento, autodesativação) com id em maiúsculas e caixa mista (`/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/mut-e09-idschema.txt`). O teste morde.
5. Id da própria conta em maiúsculas (defeito da rodada 4): `id-da-propria-conta.test.ts` 13 de 13 no SHA sem a mutação.

## Achados

- anotado: `sessoes.ip` e `sessoes.user_agent` ficam completos e sem prazo de expurgo (dono V2-F05-E12, `docs/roadmap-v2/06-lgpd-arquivos.md:348`). O `DICIONARIO-DE-DADOS.md` já descreve que ficam guardados e não saem; `docs/PRIVACIDADE.md` ainda não lista IP e user-agent de servidor como dado tratado (grep sem resultado). Não bloqueia: o critério é a listagem não expor.
- anotado: o log operacional de toda requisição grava `remoteAddress` (`servidor.ts:335`), IP de servidor público e de cidadão; é prática de operação, mas precisa de prazo de retenção de log no Fly, a definir por profissional.
- anotado: `ultimaEntradaEm` de um colega fica visível a quem administra; é dado funcional documentado ("só quantidade e datas").

## Não verificado

- Fluxo humano no painel (frase da senha única, confirmações) e leitor de tela: dimensões de UX e acessibilidade, e pendência humana da etapa.
- Retenção real de log no Fly em produção (não há acesso).
- Base legal, controlador e prazo de retenção de IP e user-agent: decisão de profissional.
- Postgres 17 real: a prova de privacidade desta etapa usa PGlite, que aplica as mesmas migrações; a corrida troca-de-senha contra redefinição é de outra dimensão.

## Risco residual

IP e user-agent acumulando sem prazo até a V2-F05-E12; senha temporária conhecida por quem a sorteou (IDN-18, registrada em `PENDENCIAS.md`).

## Motivo do humano

não se aplica.
