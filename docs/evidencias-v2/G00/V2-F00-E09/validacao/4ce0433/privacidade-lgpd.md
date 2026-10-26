---
validador: privacidade-lgpd
modelo: claude-sonnet-5-5
etapa: V2-F00-E09
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
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

Campo "Impacto LGPD" da etapa: "a listagem não mostra IP nem user-agent completo (IDN-29); sessão é dado técnico da própria pessoa".

Inventário dos dados tocados: `sessoes.ip` e `sessoes.user_agent` (guardados, migração 002), `sessoes.criada_em`/`expira_em`/`familia_id` (técnicos), `usuarios.nome` e `senha_hash` (a redefinição grava hash e prazo provisório de 72 h; a senha temporária só existe na resposta e na tela).

Fluxo e controles:
- Minimização na saída própria: `GET /auth/sessoes` (`apps/api/src/rotas/autenticacao.ts:265`, `auth/servico.ts:1352`) filtra por `usuario_id` do token e devolve só `entrouEm`, `validaAte`, `aparelho` (uma frase) e `atual`. `auth/aparelho.ts` reduz o user-agent a "Chrome em Windows" ou "Aparelho não identificado". Sonda minha (arquivo temporário já removido, saída em `sonda1.txt`): com user-agent Chrome/126 completo no login, a resposta foi `{"itens":[{"entrouEm":...,"validaAte":...,"aparelho":"Chrome em Windows","atual":true}]}`, sem "Mozilla", sem "126.0", sem "127.0.0.1"; o banco guardava IP 127.0.0.1 e o user-agent inteiro (confirma que o dado fica guardado e não sai).
- Minimização para terceiros: `GET /usuarios/:id/sessoes` (`rotas/administracao.ts:625`) devolve só `sessoesAbertas`, `ultimaEntradaEm`, `validaAte`, depois de `gerenciar_usuarios`, 404 para outro município e `exigirPostoParaGerir`. Teste "a administradora vê a quantidade e as datas, e nada do aparelho" e "conta de outro município: 404, igual a id que não existe" passam.
- Acesso: `GET /auth/sessoes` só da própria conta (teste "só a própria conta: a de outra pessoa e a de outro município não aparecem").
- A senha temporária não vai para a trilha (`administracao.ts` registra `sessoesEncerradas` e `ativo`, nunca a senha nem o hash), a resposta sai com `cache-control: no-store` (`servidor.ts:384-399`), e `Usuarios.tsx` não usa localStorage, sessionStorage nem console (grep vazio); a cópia para a área de transferência é ato do usuário (`Usuarios.tsx:688`).
- Retenção de IP e user-agent: não há expurgo; está fora do escopo da etapa por ordem expressa ("O que NÃO deve ser implementado": F05-E12), e a F05-E12 (`docs/roadmap-v2/06-lgpd-arquivos.md:348`) o cobre. Ver Achados.

Correção 3 (id da própria conta em outra caixa), no que toca privacidade: recusar `autoredefinicao` e `autoencerramento` impede que uma sessão esquecida aberta troque a senha da titular sem a senha atual (conta tomada). `idSchema` em `administracao.ts:24` normaliza para minúsculas.

## Evidência

- `npx vitest run` (apps/api) em `sessoes-da-conta`, `id-da-propria-conta`, `recuperacao*`, `registro-de-consulta`, `acesso-suspenso`: 9 arquivos, 120 testes, código 0 (`api1.txt`). Dos quais `sessoes-da-conta.test.ts` 27 e `id-da-propria-conta.test.ts` 13.
- `npx vitest run` (apps/web) em `seguranca-da-conta`, `sessoes-e-senha-temporaria`, `recuperar-senha*`, `seo`, `sessao-e-entrada`: 6 arquivos, 134 testes, código 0 (`web1.txt`).
- Mutação minha (aplicada em `administracao.ts:24`, removendo o `.transform(toLowerCase)`; restaurada com `cmp` e `git status` limpo): 6 de 13 vermelhos (`mut2.txt`). O teste morde.
- Sonda de ponta a ponta com a API em memória (`sonda1.txt`): lista de ocorrências sem `solicitante_contato`, `descricao`, `vulnerabilidade_descricao`.
- Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L05-lgpd/`.

## Cenários positivos

Própria conta lista as próprias sessões com a marca "atual"; a administradora vê a quantidade; id de OUTRA pessoa em maiúsculas continua redefinindo (200); sessão encerrada ou vencida não aparece.

## Cenários negativos

Coordenador de outro município: 404 em `GET /usuarios/:id/sessoes`; agente de campo: 403 `sem_permissao` nas três rotas; posto acima: 403 `posto_insuficiente`; próprio id em minúsculas, maiúsculas e caixa mista: 422 `autoredefinicao`, `autoencerramento` e `autodesativacao`, conta intacta; sete formatos alternativos de uuid nunca dão 200.

## Tentativas de reprovar

Tentei achar IP ou user-agent na resposta da própria conta com um user-agent longo e específico: não vazam. Tentei o id da própria conta em maiúsculas (mutação sem normalização): o teste reprova, logo a defesa está viva. Procurei senha temporária em trilha, em cache e em armazenamento do navegador: não há. Procurei listagem de sessões de terceiros com IP no corpo de `GET /usuarios/:id/sessoes`: só contagem e datas.

## Achados

- anotado: IP e user-agent completos de servidores ficam em `sessoes` (e `ip` em `recuperacoes_senha`, `exportacoes`) sem prazo nem expurgo, e `docs/PRIVACIDADE.md` seção 2.2 (servidor público) não os lista como dado tratado; o `DICIONARIO-DE-DADOS.md` os cita só na linha de `sessoes`. Já tem dono: V2-F05-E12 (expurgo) e a atualização de `PRIVACIDADE.md` prevista nela. Não bloqueia esta etapa, cujo critério é "a listagem não expor".
- anotado: o `ultimaEntradaEm` de um colega fica visível a quem administra; é dado funcional e documentado ("só quantidade e datas").

## Não verificado

Fluxo humano no painel (frase da senha única, confirmações). Navegador real: não rodei o e2e da seção 26 nem capturas (dimensões UX e acessibilidade). Leitura de log do Fly em produção.

## Risco residual

IP e user-agent acumulando sem prazo até a F05-E12; senha temporária conhecida por quem a sorteou (IDN-18, registrada em `PENDENCIAS.md`).

## Motivo do humano

Não se aplica a esta dimensão; a validação humana da etapa (Rafael faz o fluxo) é da especificação e já consta no STATUS.

### Itens do "Motivo do veredito" da rodada 4 que tocam privacidade

(1) id em maiúsculas burlando a recusa de agir sobre a própria conta (risco de tomada de conta): CONSERTADO, provado por `id-da-propria-conta.test.ts` (13 de 13) e pela mutação minha (6 vermelhos sem o conserto). (2) redefinição perdendo para troca em voo: é do banco/E07 e das rotas de senha, não de privacidade; os casos 21, 28 do bloco de Postgres real passaram na minha execução (`api-pg.txt`, 60 de 60).
