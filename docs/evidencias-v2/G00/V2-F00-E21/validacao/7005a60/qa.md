---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E21
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

| Critério | Resultado | Prova |
| --- | --- | --- |
| `.gitattributes` em vigor, `git ls-files --eol` sem `i/crlf` | PASS | `* text=auto eol=lf`, `.ps1/.bat/.cmd` em CRLF, binários marcados. `git ls-files --eol`: 757 `i/lf w/lf`, 728 `i/lf w/crlf`, 29 `i/lf w/mixed`, 301 `i/-text`, **0 `i/crlf`**. |
| `ocorrencia-encerramento.test.ts` passa com árvore CRLF | PASS | A árvore de hoje está em CRLF (`file` confirma); `npx vitest run test/ocorrencia-encerramento.test.ts`: 13 de 13. |
| Helper não esconde mudança real | PASS (sonda) | Inseri um segundo `onEnviar(` dentro de `BlocoEncerramento` em `src/paginas/Ocorrencia.tsx`: o caso "nada grava o encerramento fora do ramo de confirmação" reprovou (1 falha de 13). Arquivo restaurado por `cp`, `git status` limpo. |
| `banco-tls.test.ts` 13 de 13 com `OPENSSL_CONF` para arquivo inexistente | PASS | `OPENSSL_CONF=C:/nao/existe/openssl.cnf npx vitest run test/banco-tls.test.ts`: 13 de 13, com o aviso "OPENSSL_CONF aponta para ... que não existe; o openssl do teste roda sem a variável". |
| Com `OPENSSL_CONF` válido o teste o respeita | PASS por leitura + caso unitário | `ambienteDoOpenssl` só remove a variável quando `existe(valor)` é falso; não sondei com um arquivo de configuração real. |
| Typecheck do campo não depende de cache `.expo/types` velho | PASS | Gravei um `router.d.ts` velho em `apps/campo/.expo/types` e rodei `node scripts/testar-campo.mjs`: "Cache .expo/types desatualizado (o cache de rotas tipadas não conhece /entrar, /avisos, /fila, /mapa, /perfil, /vistoria/[id]): apagado", depois o typecheck seguiu. A pasta não existia antes e foi consumida pelo próprio script. |
| Suíte passa em Linux | PASS via CI | Log do run 37739535524 (`gh run view --log`): `test/banco-tls.test.ts (13 tests)` e `test/ocorrencia-encerramento.test.ts (13 tests)` verdes no job "Testes, tipos e scripts" (runner Linux). |
| Scripts de shell em LF | PASS | `file dc360/scripts/*.sh`: 0 com CRLF. |

## Evidência

Comandos acima, rodados nesta sessão no Windows (Git Bash). Log Linux: run 37739535524, timestamps 06:55 e 07:02 de 2026-10-08.

## Cenários positivos

Árvore CRLF + helper `lerFonte`; `OPENSSL_CONF` quebrado; cache de rotas velho.

## Cenários negativos

Mudança estrutural real na fonte (segundo `onEnviar`) ainda reprova; `blocoDaFuncao` lança em vez de devolver o resto do arquivo quando não acha o fechamento.

## Tentativas de reprovar

1. Mutação em `Ocorrencia.tsx` (acima): o teste mordeu.
2. `OPENSSL_CONF` vazio e `OPENSSL_CONF` apontando para caminho que não existe: ambos 13 de 13.
3. Cache de rotas velho: tentei primeiro só rodar `npm run typecheck` com um `router.d.ts` sintético; ele não reproduziu os 2 TS2345 originais (meu arquivo sintético era mais curto que o real e não provocou o erro), então a prova válida é a da limpeza pelo script, não a do erro.
4. Procurei fim de linha misturado em shell script (quebra no Linux): nenhum.

## Achados

1. **Anotado.** 35 arquivos de teste do painel leem fonte com `readFileSync`; só 3 usam `lerFonte`. Hoje não quebram em CRLF (a árvore é CRLF e a suíte do painel passa), mas o helper não é obrigatório. Sugestão para a F01.
2. **Anotado.** O 20 de 21 de `expo-doctor` e outros desvios de ambiente aparecem na E19, não aqui.

## Não verificado

- Árvore CRLF dentro do Linux (clone de Windows para Linux): só o log do CI, que faz checkout LF.
- `npm run verificar` completo no Windows, `npm run test:api` e `test:isolamento` inteiros: não rodei; rodei os arquivos tocados.
- A matriz plataforma x comando do README foi lida (linhas 1105 a 1122), não reexecutada linha a linha.

## Risco residual

Árvores clonadas antes do `.gitattributes` seguem em CRLF até renormalizar; o helper cobre os testes de fonte tocados.

## Motivo do humano

Nenhum necessário; o run em Linux pedido à etapa existe (CI, 9 de 9).
