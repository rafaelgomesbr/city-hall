---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E09
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
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

Mutações na árvore principal, desfeitas com `git restore`, `git status` conferido. Saídas em `SCRATCH/validadores/red-team`.

| Critério | Resultado | Prova |
| --- | --- | --- |
| Negativo da etapa: a API recusa `autoredefinicao` e `autoencerramento` (e `autodesativacao`) sobre a própria conta, inclusive com o id em outra caixa (a lacuna que reprovou a rodada 4) | OK | `idSchema = z.string().uuid().transform(id=>id.toLowerCase())` (`rotas/administracao.ts:24`). `test/id-da-propria-conta.test.ts` 13 de 13: próprio id em minúsculas (controle), maiúsculas, caixa misturada e 7 formatos alternativos de uuid, nas três rotas, nunca 200. |
| O teste morde | OK | Removi a normalização (`z.string().uuid()` só): 6 de 13 reprovam (maiúsculas e caixa misturada nas três rotas voltam a 200 sobre a própria conta). Restaurado. |
| Formatos alternativos de uuid (chaves, sem hífen, urn:uuid, espaço, quebra de linha) | OK | Rejeitados pelo `uuid()` do zod antes da comparação (casos verdes); id de outra pessoa em maiúsculas segue valendo (200). |
| Isolamento: coordenador de A pede redefinir/listar sessões de B: 404; agente: 403 `sem_permissao` | não contestado | Coberto por QA; não reabri (sem defeito reportado na rodada 5 nesse ponto). |

## Evidência

- `$W/e09-M1.txt`: `test/id-da-propria-conta.test.ts` com `idSchema` sem `.transform(toLowerCase)`: 6 falhas, 7 passam.
- Execução no SHA sem mutação: 13 de 13, código 0.

## Cenários positivos

- A administradora com o próprio id em minúsculas (forma canônica do banco) recebe 422 nas três rotas, sem `senhaTemporaria`, conta intacta.
- A redefinição de OUTRA pessoa com id em maiúsculas segue respondendo 200 (o normalizar não quebra o caso legítimo).

## Cenários negativos

- Próprio id em MAIÚSCULAS e em caixa misturada nas três rotas: 422 com o código da recusa, conta intacta (a lacuna da rodada 4 está fechada).
- Sete formatos alternativos de uuid do próprio id: nunca 200 (barrados pelo `uuid()`).

## Tentativas de reprovar

1. Próprio id em maiúsculas/caixa misturada (o IDOR por normalização que reprovou a rodada 4): PEGO pela normalização a minúsculas. Não escapa.
2. Formatos que o Postgres aceitaria como uuid (chaves, sem hífen, urn:uuid, espaço, quebra de linha): barrados pelo `uuid()` do zod (422/400). Não escapam.
3. Unicode / case folding: o alfabeto do uuid é só hex `[0-9a-f]`, sem letras com dobra de caixa unicode (sem `i`/`ı`), então `toLowerCase()` em ASCII é estável; não há bypass unicode.
4. Biting: sem a normalização, o teste reprova 6 casos. A trava segura.

## Achados

- **anotado.** O achado 2 da rodada 4 (a redefinição por quem administra perde para uma troca de senha em voo da sessão derrubada) é consertado no `trocar_senha` da E07 (correção 4, trava da linha e releitura na transação, README:137 e migração 051). É de outra etapa; não o reverifiquei em profundidade aqui, mas o mecanismo está presente.

## Não verificado

- A corrida da troca em voo (achado 2) sob Postgres real concorrente: é da E07; não a reexecutei nesta dimensão.
- Run do CI do SHA (ausente, H32).
- As telas e as seis frases (UX e validação humana).

## Risco residual

Baixo. O IDOR por normalização de caixa que reprovou a rodada 4 está fechado com prova que morde. A comparação é sempre contra a forma canônica (minúsculas, hifenizada) que o banco e o token carregam; os demais formatos caem no `uuid()`.

## Motivo do humano

Não se aplica a esta dimensão. A validação humana (Rafael faz o fluxo e confere a senha única e as confirmações) é de UX e segue pendente.
