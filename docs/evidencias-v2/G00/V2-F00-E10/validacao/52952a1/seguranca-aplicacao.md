---
validador: seguranca-aplicacao (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E10
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito da dimensão: **PASS**, com o achado da rodada 2 sobre `Fly-Client-IP` malformado AINDA MORDENDO no código (nada mudou em `rede.ts` nem na migração 005 desde a rodada 2) e, de novo, sem superfície em produção: a borda do Fly sobrescreveu o cabeçalho na conferência desta rodada e a recuperação está desligada (`RECUPERACAO_ATIVA = "nao"`). Continua "corrige antes do CP-19". Nível E2: API real (`npx tsx src/index.ts`) contra Postgres 17.10 real, com `PROXY_DE_BORDA=fly`, `RECUPERACAO_ATIVA=sim` e o notificador de arquivo, sondada por HTTP. Saídas em `$SP/val/seguranca-aplicacao/lote2/` (abaixo, `L2/`).

| Critério | Resultado | Prova |
| --- | --- | --- |
| Pedido responde 202 neutro, idêntico para conta existente, de outro município, desativada e inexistente | PASS | `L2/30-sonda-e10-pg17.txt`: os quatro corpos e status são o mesmo texto ("respostas identicas: true"); a conta desativada não recebe mensagem no notificador |
| Tempo não distingue conta existente | PASS (medido) | Postgres 17, HTTP local, 12 amostras de cada: mediana 0,98 ms existente contra 0,79 ms inexistente, mínimo 0,82 contra 0,66 (`L2/30-*`). Diferença de cerca de 0,2 ms, abaixo do ruído de rede de qualquer cliente remoto, com 5 pedidos por email por hora |
| Token de uso único, vence, pedido novo invalida o anterior, inventado dá a mesma frase | PASS | `L2/31-sonda-e10-pg17-parte2.txt`: link velho depois de pedido novo 401; link novo 200; o mesmo link de novo 401; token inventado 401 com a MESMA frase; link vencido (`expira_em` no passado) 401 com a mesma frase; a senha da tentativa recusada não entra (401) e a válida entra (200) |
| Corrida: o mesmo link usado em paralelo | PASS | 10 redefinições simultâneas com o mesmo link: `200,401,401,401,401,401,401,401,401,401` (`L2/31-*`) |
| Token guardado só como hash | PASS | nenhum dos tokens dos links aparece em `recuperacoes_senha.token_hash` (`L2/31-*`) |
| Limite: teto por email (5 por hora, sem distinguir maiúscula) e por endereço | PASS | 7 pedidos alternando maiúscula e minúscula: sempre 202, e o total de mensagens para o email parou em 5 (`L2/31-*`); mutação M11 (sem o teto): 2 vermelhos de 29 em `recuperacao-sem-oraculo.test.ts` (`L2/mut/M11-*.txt`); `recuperacao.test.ts` "o quarto pedido do mesmo endereço leva 429, e trocar o cabeçalho não ajuda" verde (`L2/01-*`) |
| Log não leva link, token, email nem senha | PASS | `L2/pg/api.log` depois de toda a sonda: 0 ocorrências de `token=`, `redefinir-senha`, `exemplo.gov.br` e das senhas usadas |
| Produção desligada; `config.ts` recusa ligar sem e-mail e recusa `NOTIFICADOR_ARQUIVO` em produção | PASS | `recuperacao-em-producao.test.ts` e `recuperacao-desligada.test.ts` verdes (`L2/01-api-suites-alvo.txt`, 18 arquivos, 217 de 217) |
| Token sai da barra de endereço; `Referrer-Policy: no-referrer` nas duas telas | PASS (leitura e teste) | `apps/web/src/paginas/RecuperarSenha.tsx:372` (`history.replaceState`); `dc360/vercel.json`: `/(recuperar-senha|redefinir-senha)` com `Referrer-Policy=no-referrer` e `X-Robots-Tag=noindex`; vitest do painel `recuperar-senha` e `recuperar-senha-e-sessao`: 50 de 50 (`L2/32-web-recuperar.txt`) |
| `Fly-Client-IP` malformado (achado da rodada 2) | AINDA MORDE, sem superfície | ver Achados 1 |

A correção 2 desta etapa (`10af77e`) só mexe em tela (sem redirecionamento por tempo, foco na confirmação, hover do botão): nada de autenticação mudou no servidor. Conferi que o botão de sucesso é um `<a href="/entrar">` com navegação completa e que nenhuma tela de recuperação usa `innerHTML` ou `dangerouslySetInnerHTML`.

## Evidência

- `L2/01-api-suites-alvo.txt`: `recuperacao`, `recuperacao-sem-oraculo`, `recuperacao-desligada`, `recuperacao-em-producao`, `endereco-de-origem` entre 18 arquivos, 217 de 217, código 0.
- Postgres 17.10 descartável (porta 55541, papéis como o job `implantavel`), 50 migrações, semente; API real na porta 55542 (`L2/20..24-*.txt`, `L2/pg/api.log`); sonda `L2/pg/e10-recuperacao.mjs` (saídas `L2/30-*` e `L2/31-*`). PG derrubado e pasta apagada (`L2/90-pg-stop.txt`).
- Borda do Fly, conferida nesta rodada: `curl -H "Fly-Client-IP: nao-e-ip" -H "X-Forwarded-For: lixo1" https://debug.fly.dev/` devolveu `Fly-Client-Ip: <ip real>` e `X-Forwarded-For: lixo1, <ip real>, <ip do edge>` (IPs omitidos aqui): o atacante na internet não escolhe o valor.
- M11: `if (!cabeNoTetoDoEmail(email)) return;` comentado, 2 vermelhos, `git restore`, SHA-256 igual antes e depois.

## Cenários positivos

- Pedido de conta existente: 202, link no notificador de arquivo; redefinição 200; a senha nova entra e a anterior não.

## Cenários negativos

- Email inexistente, de outro município e de conta desativada: o mesmo 202, byte a byte.
- Link usado, vencido, trocado por pedido novo e inventado: 401 com a mesma frase.
- Dez usos simultâneos do mesmo link: um 200 e nove 401.
- Sexto e sétimo pedido do mesmo email na hora (em caixa diferente): 202 e nenhuma mensagem.

## Tentativas de reprovar

1. `Fly-Client-IP` malformado contra a API real em Postgres 17, borda `fly` declarada: `nao-e-ip`, `fe80::1%eth0`, `999.1.1.1` e `1.2.3.4, 5.6.7.8` dão 500 `erro_interno` para a conta que EXISTE e 202 para a que não existe (`L2/30-*`). O log registra `invalid input syntax for type inet` (sem o email). O mesmo acontece em `/auth/entrar`: senha certa com o cabeçalho lixo dá 500, senha errada dá 401.
2. Diferença de tempo em banco real: 0,2 ms de mediana com 12 amostras, sem ataque estatístico viável com o teto de 5 por email por hora.
3. Usar o link em paralelo para redefinir duas vezes: um só passa.
4. Contornar o teto por maiúscula e minúscula: não contorna.
5. Procurar o link ou o email no log do servidor: nada.

## Achados

**Corrige antes do CP-19 (não reprova a E10; rodada 2, ainda morde)**

1. O IP do cliente chega cru a `abrir_recuperacao` (`nullif(p_ip,'')::inet`, migração 005) sem validação em `enderecoDoCliente` (`apps/api/src/rede.ts:72-86`). Quem alcança o processo com um endereço que não é IP (fora da borda do Fly, ou numa plataforma com `PROXY_DE_BORDA` errado) distingue conta existente (500) de inexistente (202). Reprodução: `L2/pg/e10-recuperacao.mjs`, seção 1. Sem superfície hoje: a borda sobrescreve o cabeçalho (conferido nesta rodada) e a recuperação está desligada em produção. O mesmo cast existe em `/auth/entrar` (migrações 047, 049, 050: 500 só com a senha certa) e no registro de exportação da saída de município (`rotas/saida.ts`): conserto de uma linha em `enderecoDoCliente` (`net.isIP`, e nulo quando inválido) fecha os três. Dono: F01 (antes do CP-19).

**Anotado**

2. Diferença de tempo de cerca de 0,2 ms entre conta existente e inexistente em Postgres 17 local; medir com latência real antes de ligar.

## Não verificado

- Cabeçalhos servidos pela Vercel em produção (o `vite preview` não aplica `vercel.json`): só leitura do arquivo e o teste que o lê.
- Provedor de e-mail real (CP-19 adiado): só o notificador de arquivo.
- Leitor de tela e o anúncio do sucesso (dimensão de acessibilidade).
- Query string do link no log de acesso da Vercel (operação do CP-19).

## Risco residual

- Ao ligar a recuperação fora do Fly, ou com a borda mal declarada, o achado 1 passa a valer sem o conserto.
- O link continua levando o token na query: mitigado por `replaceState`, `no-referrer` e vida curta de uso único.

## Motivo do humano

Nenhum para esta dimensão (o CP-19 é decisão de contratação, registrada à parte).
