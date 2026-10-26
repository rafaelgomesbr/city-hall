---
validador: red-team (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E10
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [UI, AUTH, API, LGPD, INFRA]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito: **PASS na dimensão red-team**, com o achado da rodada 2 (oráculo de existência por IP inválido) ainda reproduzível. Ele está mascarado em produção, porque lá a recuperação está desligada, e precisa ser corrigido antes do CP-19. A correção 2 desta etapa só mexeu na tela (`RecuperarSenha.tsx`, `recuperar-regras.ts`, `app.css`, `comuns.tsx`): tirou o redirecionamento por tempo. As rotas `/auth/recuperar` e `/auth/redefinir` e o serviço não mudaram desde a rodada 2 (o diff de `auth/servico.ts` é de abrir sessão, da E07). Saídas em `$SP/val/red-team/` (prefixos `E10-` e `E09E10-`).

| Critério | Resultado |
| --- | --- |
| Resposta neutra: conta ativa, inexistente, de outro município, desativada, em maiúsculas | PASS: 202 com o mesmo corpo nos cinco casos, de 1 a 2 ms cada (R1) |
| Uso único, inclusive sob corrida | PASS: dois `POST /auth/redefinir` simultâneos com o mesmo token, um 200 e o outro 401 "Este link de redefinição não vale mais", e só a senha do vencedor entra (R2) |
| Token de uma conta não serve a outra; link vence; pedir de novo invalida o anterior | PASS (suítes `recuperacao` e `recuperacao-sem-oraculo`) |
| Vazamento no log | PASS: com envio, redefinição e token adulterado, o log não contém o token, o e-mail nem o link (R3) |
| Os testes mordem | PASS: mutação em `pedirRecuperacao` que trata conta inexistente com erro 404 reprova 7 casos; restaurado, 29 de 29 (`E10-03`, `E10-04`) |
| Produção desligada | PASS: `fly.toml:67` `RECUPERACAO_ATIVA = "nao"`; `recuperacao-desligada` e `recuperacao-em-producao` verdes (`E09E10-02`) |
| Token fora da URL e do Referer | PASS por leitura: `RecuperarSenha.tsx:361-373` lê o token uma vez e faz `history.replaceState` sem a query; `vercel.json` manda `Referrer-Policy: no-referrer` em `/redefinir-senha` |
| Rodada 2, achado 1: IP inválido vira 500 só para conta existente | **Ainda morde** (achado 1) |
| Rodada 2, motivo do FAIL (redirecionamento por tempo) | Fora desta dimensão. Por leitura, o efeito com `setTimeout` e `location.assign` saiu da tela (QA e acessibilidade conferem no navegador) |

## Evidência

- Sonda `zz-rt-e09e10.test.ts` (cópia em `$SP/val/red-team/`, apagada do repositório depois da execução), saída `E09E10-01-sonda-api.txt`: R1 a R5. Em R1, o único caso diferente é o e-mail cercado de espaços, recusado com 422 de validação antes de qualquer consulta, igual para conta que existe e que não existe. A asserção da sonda era rígida demais, e isso não é defeito.
- Sonda `zz-rt-borda.test.ts` (idem), saída `E10-05-borda-entrar.txt`: `/auth/entrar` com `Fly-Client-IP` inválido.
- Suítes: código 0, 7 arquivos, 95 casos (`E09E10-02-suites.txt`).
- Mutação com `git restore apps/api/src/auth/servico.ts`: `E10-03` (código 1, 7 falhas) e `E10-04` (código 0, 29 de 29).

## Cenários positivos

- O link do notificador de teste redefine a senha, a nova entra e a antiga não (suítes e R2).

## Cenários negativos

- O mesmo link duas vezes ao mesmo tempo: um só vale.
- Token adulterado: a mesma frase de link que não vale mais.
- Conta de outro município pedida pela mesma API: resposta idêntica à de e-mail inexistente.
- Conta desativada: resposta idêntica, sem link (suíte).

## Tentativas de reprovar

1. Enumeração por corpo, status e tempo: nenhuma diferença entre conta existente, inexistente, de outro município e desativada.
2. Corrida no uso único: o banco consome o token numa operação só (`consumir_recuperacao`), e só um pedido vence.
3. Enumeração por cabeçalho da borda (`PROXY_DE_BORDA=fly`, o valor de `fly.toml:81`): `Fly-Client-IP` inválido em `/auth/recuperar` dá 500 para conta existente e 202 para inexistente (achado 1). Em `/auth/entrar` não vaza: senha errada dá 401 igual para conta existente e inexistente, e só a senha certa dá 500.
4. Rodízio de `X-Forwarded-For` para escapar do limite: sem borda, a chave é o endereço do socket (suíte "o quarto pedido ... leva 429"). Com a borda `fly`, a chave é o próprio `Fly-Client-IP`, e o limite depende de a borda sobrescrever o cabeçalho, a mesma premissa do achado 1.
5. Vazamento no log durante falha do provedor e com token adulterado: nada.

## Achados

**CORRIGE ANTES DO CP-19 (não bloqueia esta etapa; a rota está desligada em produção)**

1. **IP inválido vindo da borda vira 500 só para conta existente (achado 1 da rodada 2, ainda morde).** Reprodução (`E09E10-01`, caso R4): servidor com `PROXY_DE_BORDA=fly`; `POST /auth/recuperar` com `Fly-Client-IP` igual a `nao-e-ip`, `1.2.3.4, 5.6.7.8` ou `' OR 1=1 --`. Conta existente: 500 `erro_interno`. Conta inexistente: 202. Causa: `enderecoDoCliente` (`rede.ts`) devolve o cabeçalho sem validar, e `abrir_recuperacao` só converte para `inet` depois de achar a conta. Não há injeção SQL: o valor vai como parâmetro, e o erro é de conversão. Correção curta: validar com `net.isIP` e gravar nulo quando inválido; antes de ligar a recuperação, provar contra a borda real que o `Fly-Client-IP` enviado pelo cliente é descartado. O mesmo vale para a chave do limitador.

**ANOTADO**

2. A política `no-referrer` existe só no `vercel.json`. Um painel servido por outro caminho (prévia local, outro hospedeiro) não a recebe, e `index.html` não tem `<meta name="referrer">`. O token sai da barra de endereço no primeiro efeito, o que reduz a janela.

## Não verificado

- O comportamento real da borda do Fly com `Fly-Client-IP` forjado (sem ambiente de produção).
- Os cabeçalhos servidos pelo Vercel de verdade (só lidos no `vercel.json`).
- A tela no navegador (QA, UX e acessibilidade).
- Postgres 17 real: sondas em PGlite. A conversão `::inet` que falha é a mesma nos dois motores.

## Risco residual

Ao ligar a recuperação (CP-19) sem o achado 1 corrigido, a enumeração de e-mails passa a depender só do comportamento da borda.

## Motivo do humano

Nenhum para esta dimensão.
