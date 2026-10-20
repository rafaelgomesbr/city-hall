---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E10
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Mutação de migração na árvore principal, desfeita com `git restore`, `git status` conferido. Saídas em `SCRATCH/validadores/red-team`.

| Critério | Resultado | Prova |
| --- | --- | --- |
| Reuso: o mesmo link não serve duas vezes | OK | `recuperacao.test.ts` "o mesmo link não serve duas vezes" verde (49 de 49 nos cinco arquivos de recuperação, PGlite). |
| O link pendente morre com a troca/redefinição de senha e com a desativação (achado da rodada 4) | OK | Migração 051: gatilho `recuperacoes_morrem_com_a_credencial` AFTER UPDATE OF senha_hash, ativo. `recuperacao-morre-com-a-credencial.test.ts` 7 de 7. |
| `consumir_recuperacao` confere `ativo` | OK | Caso "link vivo numa conta desativada: recusado, gasto, senha não muda" verde; mesmo com o gatilho desligado esse caso passa (defesa própria em `consumir_recuperacao`). |
| Os testes mordem | OK | Desliguei o gatilho (WHERE do UPDATE com `AND false` na migração 051): 3 de 7 reprovam (redefinição por quem administra, troca pela própria pessoa, dois links um mata o outro). Restaurado. |
| Enumeração por corpo: 202 neutro para e-mail existente, inexistente e acima do teto | OK | `recuperacao-sem-oraculo.test.ts` verde. |
| Redirecionamento / token na URL | OK | `vercel.json`: `Referrer-Policy: no-referrer`. `RecuperarSenha.tsx:372`: `history.replaceState` remove o token da barra depois de ler uma vez. |
| Produção desligada | OK | `config.ts`: recusa `RECUPERACAO_ATIVA=sim` sem `EMAIL_ATIVO=sim`; `recuperacao-em-producao.test.ts` e `recuperacao-desligada.test.ts` verdes. |

## Evidência

- `$W/e10-pglite.txt`: cinco arquivos de recuperação, 49 de 49, código 0.
- `$W/e10-trigger-mutado.txt`: gatilho da 051 desligado, `recuperacao-morre-com-a-credencial.test.ts` 3 falhas (prova que morde). Restaurado (0 ocorrências de `AND false`).
- Leitura: `Referrer-Policy: no-referrer` em `vercel.json:24`; `history.replaceState` em `RecuperarSenha.tsx:372`; travas em `config.ts`.

## Cenários positivos

- Link do notificador de arquivo redefine a senha; a nova entra e a antiga não (controle verde).
- Dois links pendentes: usar/pedir um mata o outro (mesma marca `usada_em`).

## Cenários negativos

- Link reusado: a segunda vez é recusada.
- Link pendente depois de redefinição por quem administra, troca pela própria pessoa ou desativação: não vale mais (gatilho); conta desativada: link gasto e senha inalterada (`consumir_recuperacao` confere `ativo`).
- E-mail inexistente/no município errado: 202 idêntico (sem oráculo por corpo).

## Tentativas de reprovar

1. Desarmar o gatilho da 051: 3 casos reprovam (admin reset, troca própria, dois links). A trilha de segurança segura: o teste morde.
2. Desativação sem o gatilho: ainda recusada, porque `consumir_recuperacao` relê `usuarios.ativo` (defesa em profundidade). Não escapa.
3. Reuso sequencial do mesmo link: recusado.
4. Enumeração por corpo: resposta uniforme 202; não distinguível.
5. Token/Referer: removido da URL (`replaceState`) e Referer fechado (`no-referrer`).

## Achados

Nenhum que bloqueie.

- **anotado.** Não há teste de corrida dedicado ao consumo do link em Postgres real (duas chamadas simultâneas a `consumir_recuperacao`, ou consumo contra redefinição no mesmo instante); a defesa é a ordem de travas da migração 051 e os casos 29 e 32 de `renovacao-contra-encerramento.test.ts`.
- **anotado.** A desativação tem defesa dupla (gatilho e releitura de `ativo` em `consumir_recuperacao`): com o gatilho desarmado o caso de desativação continua verde, então ele não prova o gatilho nesse ramo; os outros três casos provam.
- **anotado** (herdado da rodada 4, não remedido): 0,09 ms de mediana entre pedido com e sem conta, não explorável com o teto atual.

## Não verificado

- Corrida de consumo do link sob Postgres 17.6 concorrente (duas chamadas simultâneas a `consumir_recuperacao`, ou consumo contra redefinição no mesmo instante): não há teste de corrida dedicado à recuperação; o `consumir_recuperacao` usa FOR NO KEY UPDATE na pessoa e FOR UPDATE relendo o link, com ordem de travas documentada na 051 para evitar 40P01, e os casos 29/32 de `renovacao-contra-encerramento.test.ts` (Postgres real) medem a troca contra o link. Não reexecutei esses casos em PG real nesta rodada.
- Enumeração por tempo: a rodada 4 mediu 0,09 ms de mediana (não explorável); não remedi.
- Run do CI do SHA (ausente, H32).
- As telas e a validação humana (UX / Rafael).

## Risco residual

Baixo. Os três defeitos da rodada 4 (link sobrevive a redefinição/troca/desativação; `consumir` não checa `ativo`; corrida da troca em voo) têm conserto no banco (gatilho 051 + releitura + travas) com prova que morde no gatilho. O único ponto não reexecutado por mim é a corrida de consumo em Postgres real concorrente, mitigada pela ordem de travas documentada e pelos casos reais da E07.

## Motivo do humano

Não se aplica a esta dimensão. A validação humana (Rafael faz o fluxo com o notificador de arquivo e confere a produção desligada) segue pendente.
