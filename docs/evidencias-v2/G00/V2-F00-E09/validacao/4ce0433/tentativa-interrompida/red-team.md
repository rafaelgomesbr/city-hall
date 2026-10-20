---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E09
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [AUTH, AUTHZ, API, UI]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Ambiente: o mesmo do relatório da E07 (worktree descartável em `4ce0433`, PostgreSQL 17.6 real, porta 55871, apagados no fim). Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/a749c2d6-f207-483e-8a7b-380fcd3f5d28/scratchpad/rt1/saidas/`.

- Motivo da rodada 4, item 1 (id em maiúsculas burlando `autoredefinicao` e `autoencerramento`): CONSERTADO. `idSchema` em `dc360/apps/api/src/rotas/administracao.ts:24` baixa a caixa depois do `uuid()`, e as três recusas (linhas 218, 448 e 571) comparam a forma canônica. `id-da-propria-conta.test.ts` 13 de 13 (`01`). Tirei a normalização no worktree e 6 de 13 ficaram vermelhos, os seis casos de caixa (`20`). Restaurado.
- Motivo da rodada 4, item 2 (redefinição perde para troca em voo): CONSERTADO pela correção 4 da E07. Os casos 11 e 21 (a redefinição confirma no meio da troca), 28 (a troca já segura a linha e a redefinição espera) e 7 estão verdes em PG 17.6 (`01`, `31` a `33`) e vermelhos com o `servico.ts` de `bb0f654` (`10`).
- A API recusa `autoredefinicao` e `autoencerramento` (422), e as variações de uuid não chegam a 200: verde (`01`).
- `GET /usuarios/:id/sessoes` de outro município responde 404, igual a id inexistente; redefinir e encerrar sessões de conta de outro município respondem 404 e nada muda lá; `GET /auth/sessoes` não mostra sessões de outra pessoa nem de outro município: verde (`01`, `sessoes-da-conta` e `senha-e-sessoes`).

## Evidência

- `01-testes-auth-pg17.txt`: 10 arquivos, 195 de 195, código 0, inclusive `id-da-propria-conta`, `sessoes-da-conta` e `senha-e-sessoes`.
- `20-mutacao-E09-sem-normalizar-VERMELHO.txt`: `.transform((id) => id.toLowerCase())` removido do `idSchema`, `id-da-propria-conta.test.ts`: código 1, 6 falhas e 7 aprovados. `git restore`, árvore do worktree limpa.
- `10-mutacao-servico-de-bb0f654-VERMELHO.txt` e `31` a `33`: ver o relatório da E07.

## Cenários positivos

- O id de outra pessoa em maiúsculas continua valendo para a redefinição (200 com a temporária), caso positivo de `id-da-propria-conta`.
- Encerrar as outras sessões mantém a de onde se clicou (`senha-e-sessoes`).

## Cenários negativos

- O próprio id em maiúsculas e em caixa misturada nas três rotas: 422, conta intacta.
- Sete formatos alternativos de uuid: nunca 200.
- Outro município: 404, nunca 403, e nada muda lá.

## Tentativas de reprovar

- Desfiz a normalização: o teste morde (6 vermelhos).
- Varri `administracao.ts` atrás de outra recusa sobre a própria conta que compare texto: só as três, todas sobre o id normalizado. `quem.usuarioId` vem do `sub` do token, que o servidor cunha a partir do valor do banco (minúsculas).
- Procurei outro caminho que tome a conta pela sessão aberta de quem administra sem pedir a senha atual (o mesmo raciocínio que justifica a recusa `autoredefinicao`): achei um, descrito em Achados.

## Achados

- corrige antes de crescer (bloqueia o CP-19): `PATCH /usuarios/:id` (`administracao.ts:305`) não recusa o próprio id, e o administrador troca o PRÓPRIO email sem informar a senha atual. Com a recuperação por email ligada, quem senta numa sessão de administrador esquecida aberta põe o email dele na conta, pede o link e define a senha. É a escalada que o comentário da recusa `autoredefinicao` descreve, por outro caminho. Hoje a produção roda com `RECUPERACAO_ATIVA=nao`, então o efeito está desligado até o CP-19. Encontrado na leitura do código (sem condição para o próprio id antes do UPDATE da linha 365), sem medição. Para reproduzir: com o token da administradora, `PATCH /usuarios/<próprio id>` com o mesmo cadastro e outro email, depois `POST /auth/recuperar` com o email novo.
- Nenhum achado que bloqueia esta etapa.

## Não verificado

- O achado acima não foi medido por requisição.
- Não rodei a suíte web (`seguranca-da-conta`, `posto-abaixo-do-seu`) nem o e2e de navegador: são telas, fora desta dimensão.
- Também não rodei sonda própria de disputas com tempo sorteado entre redefinição e troca. A prova é a das disputas seguradas do repositório, nas duas ordens, mais a mutação (ver o relatório da E07).
- O run do CI não foi visto.

## Risco residual

A recusa sobre a própria conta agora vale em qualquer caixa. O que sobra é o caminho do email próprio (Achados), que só passa a valer quando a recuperação for ligada.

## Motivo do humano

Não se aplica.
