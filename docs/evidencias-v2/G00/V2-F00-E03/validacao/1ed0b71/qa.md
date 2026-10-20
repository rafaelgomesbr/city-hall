---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E03
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [ARQUIVO]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Pasta das saídas (fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/qa/` (abaixo, `SAIDAS/`). Mac arm64, Node v24.15.0, `openssl` do sistema = LibreSSL 3.3.6, `apps/campo/ios/` presente. Árvore em `5044e7a` (produto igual a `1ed0b71`). O que a etapa mudou desde a rodada 4: o commit `8c0c255` (correção 5).

| Critério | Resultado | Prova |
| --- | --- | --- |
| Motivo da reprovação da rodada 4: o vermelho do LibreSSL sem linha no registro | CONSERTADO | `classificacao-dos-vermelhos.md` seção 10, linha V-API-3 (FECHADO, saída 2 da T42, com o registro de reescrita em `docs/DECISOES-DE-TESTE-DA-FASE-00.md` linha 455) |
| O conserto segura no Mac de hoje | PASS | `npm run test:api` pelo roteiro: código 0, 1590 passam, 34 pulados por ambiente, 0 falhas (`SAIDAS/bl2/01-teste-api.txt`); `openssl-do-teste.test.ts` mais `banco-tls.test.ts`: 23 de 23 (`SAIDAS/e03-openssl-antes.txt`) |
| O teste novo morde | PASS | o teste de antes (`git show 8c0c255^:`) reprova no LibreSSL, 1 de 10 (`SAIDAS/e03-openssl-teste-antigo.txt`); mutante no helper (manter `OPENSSL_CONF` mesmo apontando para arquivo inexistente: a condição `existe(valor)` removida) reprova 2 de 10, inclusive o caso reescrito (`SAIDAS/e03-openssl-mutante.txt`); restaurado com `git restore`, 10 de 10 (`SAIDAS/e03-openssl-depois.txt`) |
| A causa registrada é verdadeira na máquina | PASS | `/private/etc/ssl/openssl.cnf` existe e não tem `x509_extensions` (busca vazia), como a linha V-API-3 afirma |
| Registro inteiro contra a realidade de hoje: "0 abertas" | PASS | o roteiro inteiro no Mac: nenhuma suíte com falha (typecheck, shared 223, db 345 e 3, pacote de campo 238, API 1590 e 34, console 274, painel 688, jest do aplicativo 1997, `test:campo`, `test:scripts` 288, `conferir:numeros`, `auditar`, os três E2E); a única divergência do roteiro é de contagem de pulados, sem teste vermelho (ver Achados) |
| Dependências (V-DEP-2b, V-DEP-3) batem com o registro | PASS | raiz: 3 avisos (1 moderada, 2 críticas: `@vitest/mocker`, `tinypool`, `vitest`), igual à linha 258; campo: 59 (8 moderadas, 50 altas, 1 crítica), coerente com a linha 259; `auditar` 0 com as exceções nomeadas, dono e prazo 2027-01-05 (`SAIDAS/bl4/01`, `02`, `SAIDAS/bl3/05-auditar.txt`) |
| Instáveis fechados na seção 9 (V-INS-02 a V-INS-06, V-ROT-02) | PASS no que roda aqui | `test:isolamento` 345 e 3 em 22 s sem `Errors`; `e2e-firefox` existe e confere (70); `test:e2e:api` 288 e 149; shared 223 sem estouro de tempo |
| Positivo: a soma do registro fecha (contagem 10.3) | PASS | 72 fechadas de 73 mais 1 tolerada (V-DEP-3) e 0 abertas; seções 9.3 e 10.3 coerentes (71 + 1 nova) |
| Negativo: nenhum vermelho sem linha; nenhuma linha B sem evidência datada | PASS | nenhum vermelho de teste no Mac hoje; V-API-3 cita commit, data e saídas numeradas |
| Regra de BZ-N:N.3 decidida por Rafael | PASS (documental) | correção 2 registra Q1 a Q5 decididas em 2026-10-13 |
| Evidência e `INDEX.md` | PASS | 106 de 106 linhas batem byte a byte; nenhum arquivo rastreado fora do índice; `conferir-evidencia.mjs` sem falha (`SAIDAS/index-conferencia.txt`, `SAIDAS/conferir-evidencia-E03.txt`) |

## Evidência

- `node scripts/baseline.mjs --sem-instalar --so=<lote> --saida=SAIDAS/blN`, cinco lotes cobrindo os 18 passos: códigos 0, 0, 3, 0, 0 (`SAIDAS/bl1.log` a `SAIDAS/bl5.log`).
- `npx vitest run test/openssl-do-teste.test.ts test/banco-tls.test.ts` (em `apps/api`): código 0, 23 de 23.
- Teste antigo copiado para um arquivo temporário não rastreado e rodado: código 1, 1 falha (o caso do `OPENSSL_CONF` válido); arquivo apagado.
- Mutante em `apps/api/test/openssl-do-teste.ts` aplicado com `sed`, rodado (código 1, 2 falhas) e desfeito com `git restore`; `git status` limpo depois.
- `npm test` como comando único: código 0 (`SAIDAS/npm-test.txt`).

## Cenários positivos

- `test:api` inteiro verde num Mac com LibreSSL, sem skip nem ramificação por família de `openssl`.
- `banco-tls.test.ts` 13 de 13 no LibreSSL.
- O registro, a política (R3) e o registro de decisões de teste contam a mesma história do conserto.

## Cenários negativos

- O teste de antes da correção reprova no Mac com a mensagem que motivou a rodada 4.
- Helper que mantém a variável quebrada: reprovam o caso unitário e o caso de verdade com o `openssl` do sistema.
- O `npm audit` cru continua vermelho e o `auditar` só aceita o que tem nome, dono e prazo.

## Tentativas de reprovar

1. Rodei todas as suítes no SHA procurando um vermelho sem linha no registro, que foi o motivo da reprovação da rodada 4: não há nenhum teste vermelho no Mac hoje.
2. Conferi a causa declarada (o `openssl.cnf` do macOS sem `x509_extensions`) no próprio arquivo da máquina: confere.
3. Tentei ver o caso reescrito passar à toa (mutante que mantém a variável quebrada): ele reprova.
4. Comparei os números de dependência do registro com o `npm audit` de hoje: batem em total e severidade.
5. Procurei no registro uma linha para a divergência do roteiro no Mac (`test:scripts` com 0 pulados contra 4): não há (Achado 1).

## Achados

1. **Anotado.** O roteiro da linha de base sai 3 no Mac porque os 4 casos de iOS de `test:scripts` rodam (e passam) onde existe `apps/campo/ios/`. Não é teste vermelho nem skip, então não cabe na T42; está explicado no `dc360/README.md` e no `COMO-REPRODUZIR.md` da E01, mas o registro de vermelhos não o menciona. Quem ler só o registro ("0 abertas") e rodar o roteiro num Mac verá um "divergente" sem linha correspondente.
2. **Anotado.** A seção 10.2 diz que o caso do `OPENSSL_CONF` inexistente depende de a instalação do `openssl` ter o seu `openssl.cnf` padrão; é pressuposto declarado, não conferido em OpenSSL 3 de Linux nesta rodada.

## Não verificado

- O comportamento no Linux do CI (OpenSSL 3 com o `openssl.cnf` da distribuição, que manda `v3_ca`) e no Windows: CI ausente (H32), sem Windows aqui.
- V-INS-03 a V-INS-06 sob carga: não repeti as medições de carga; rodei as suítes uma vez, em máquina sem carga extra.
- A decisão de Rafael (Q1 a Q5) só foi conferida no texto registrado.

## Risco residual

O registro diz a verdade sobre a árvore de hoje num Mac. A confirmação em Linux depende do run do CI, que não existe para este SHA. Instabilidades fechadas sem reprodução (V-INS-03, 04 e 06) podem voltar sob carga diferente da medida.

## Motivo do humano

não se aplica
