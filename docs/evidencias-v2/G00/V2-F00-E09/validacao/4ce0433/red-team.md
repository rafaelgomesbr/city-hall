---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E09
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Ambiente igual ao do relatório da E07 desta rodada: PostgreSQL 17.6 real, cluster próprio (porta 55877), worktree próprio do SHA `4ce0433`, API em processo sobre `bancoPostgres` real com `SET LOCAL ROLE dc360_app`, sonda própria `$V/sondas/sonda-red-team-r5.test.ts` (`$V` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L01-red-team`). Na semente da sonda entram um segundo administrador em Serra Alta (para a autodesativação não cair na recusa do último administrador e esconder um desvio) e um administrador em Vale Fundo (para o isolamento).

1. Testes negativos "a API recusa `autoredefinicao` e `autoencerramento` (422)" e item 1 do motivo da rodada 4 (id da rota em outra caixa burlando a recusa sobre a própria conta). PASS. 22 grafias do próprio id da administradora, em cada uma de quatro rotas (`POST /usuarios/:id/redefinir-senha`, `POST /usuarios/:id/encerrar-sessoes`, `PATCH /usuarios/:id/situacao` com `ativo: false`, `PATCH /usuarios/:id`): minúsculas, maiúsculas, caixa mista, hexadecimal codificado em `%41` a `%46`, tudo codificado em `%xx`, entre chaves (literal e `%7B`/`%7D`), sem hífens (minúsculo e maiúsculo), `urn:uuid:`, hífens a cada quatro dígitos (todas aceitas pelo `uuid` do Postgres), espaço, tabulação, quebra de linha e NUL no fim ou no começo, zero à esquerda, ponto e barra no fim, `?x=1`, `d` de largura total e `x/../id`. Nas três rotas com recusa: nenhum 200; as grafias canônicas e codificadas levam 422 com o código da recusa, as demais 422 `dados_invalidos` ou 404 (`/` final e `?` caem em outra rota ou no id sem o sufixo); a conta ficou intacta em todas (hash, `ativo`, papel, provisória e a sessão de onde se clicou) (`$V/saidas/10-sonda-conserto.jsonl`, parte `id`; resumo "ID ruins 0" em `$V/saidas/10-sonda-conserto.resumo.txt`).
2. Prova de que morde: tirada só a normalização (`idSchema` sem `.transform(toLowerCase)`), a mesma parte da sonda acusou 6 desvios: redefinir, encerrar e desativar a própria conta com 200, com o id em maiúsculas e com o hexadecimal codificado em `%41`..`%46` (`$V/saidas/22-mutacao-id-sem-minusculas.resumo.txt`). Restaurado com `git checkout` no worktree de mutação.
3. Item 2 do motivo da rodada 4 (a redefinição por quem administra perdendo para a troca em voo da sessão derrubada). PASS, provado na sonda da E07 desta rodada: 120 disputas sem grampo redefinição contra troca do invasor, nas duas ordens, 0 sobrevivente, 25 em voo com a troca recusada; com o `servico.ts` de `bb0f654`, 20 de 30 sobreviventes (`$V/saidas/10-sonda-conserto.resumo.txt`, `$V/saidas/20-mutacao-servico-bb0f654.resumo.txt`). Também 120 disputas "quem administra encerra as sessões" contra a troca: 0 sobrevivente (12 de 30 com a mutação, todos na ordem "ataque primeiro").
4. Testes de autorização e isolamento: administrador de Vale Fundo contra a Helena (Serra Alta), id em minúsculas, maiúsculas e um id inexistente, nas rotas de redefinir, encerrar, situação, edição e `GET /usuarios/:id/sessoes`: 404 `nao_encontrado` em todas, nunca 403; agente de campo nas mesmas: 403 `sem_permissao`; a Helena intacta e com a sessão de pé depois (`isoRuins 0`, `helenaIntacta true`).

## Evidência

- `npx vitest run test/id-da-propria-conta.test.ts` (com os dois arquivos de corrida) no SHA: código 0, 73 de 73 (`$V/saidas/00-testes-do-repo-no-sha.txt`).
- Sonda sobre o conserto, parte `id`: código 0 (`$V/saidas/10-sonda-conserto.txt`).
- Mutação sem a normalização: código 1, 6 desvios (`$V/saidas/22-mutacao-id-sem-minusculas.txt`, `.jsonl`, `.resumo.txt`).
- Mutação A da E07 (troca de `bb0f654`): código 1 (`$V/saidas/20-mutacao-servico-bb0f654.resumo.txt`).

## Cenários positivos

- A administradora redefine a senha de outra pessoa e encerra as sessões dela (positivos rodados centenas de vezes como "reação" na sonda da E07): 200, temporária valendo, sessões dela derrubadas.
- O id de outra pessoa em maiúsculas continua apontando a mesma conta (coberto pelo teste do repositório, verde).

## Cenários negativos

- 66 tentativas sobre a própria conta nas três rotas com recusa, 0 aceitas.
- 20 tentativas de outro município (cinco rotas, quatro grafias): 20 com 404; as mesmas 20 com agente: 20 com 403.

## Tentativas de reprovar

- Todas as grafias de uuid que o Postgres aceita (chaves, sem hífens, `urn:uuid:`, hífens fora do lugar, caixa) e as que um proxy ou o Fastify poderiam decodificar (`%xx`, espaço, NUL, quebra de linha, largura total, segmento `..`): nenhuma chegou ao banco como a própria conta com 200. O `uuid()` do zod 3.25.76 é ancorado e só aceita hexadecimal ASCII com hífens no lugar; a decodificação de `%41` vira `A` antes do esquema e cai na normalização.
- Escondi a recusa do último administrador com um segundo administrador, para a autodesativação ter de ser barrada pela regra própria: barrada.
- Rebaixar a si mesma por `PATCH /usuarios/:id`: o produto não tem recusa própria para isso (com outro administrador ativo, 200 em todas as grafias canônicas, igual para minúsculas e maiúsculas, então a caixa não muda nada).

## Achados

- Anotado: `PATCH /usuarios/:id` deixa quem administra rebaixar o próprio papel (200 com outro administrador ativo; 422 `ultimo_administrador` quando é a única). Não há recusa "sobre a própria conta" nessa rota, e o comportamento é o mesmo em qualquer caixa do id; não é desvio da E09, que só promete as recusas de redefinir, encerrar e desativar. Registro para quem desenhar a F03.
- Anotado: as outras rotas com id de rota (ocorrências, ofícios, órgãos) não normalizam a caixa (declarado pelo implementador); sem recusa sobre a própria conta nelas, o id em maiúsculas só aponta o mesmo registro. Não sondei.

## Não verificado

- O painel (telas, botões escondidos por papel): fora do red-team desta rodada; as recusas foram provadas na API, que é onde o controle mora.
- Postgres 16 e o run do CI do SHA.
- Rotas fora de `administracao.ts` com comparação de id: lidas na varredura do implementador, não sondadas por mim.

## Risco residual

Baixo. A defesa depende de toda rota nova com recusa sobre a própria conta usar o `idSchema` deste arquivo (ou comparar como uuid); uma rota que leia `req.params.id` cru reabre o desvio.

## Motivo do humano

Não se aplica: tudo o que esta dimensão exige foi executado.
