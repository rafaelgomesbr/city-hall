---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E10
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [UI, API, PUBLIC_API, AUTH, INFRA, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito: **PASS** na dimensão red-team, com uma condição antes do CP-19 (achado 1). Evidência em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/redteam` (`redteam/`).

| Critério | Resultado |
| --- | --- |
| Resposta neutra a e-mail ativo, desativado, inexistente e de outro município | PASS (`out-t2.txt`: 1 corpo distinto entre 4) |
| Uso único, vencimento, token de uma conta não serve a outra | PASS (`recuperacao.test.ts`, `recuperacao-sem-oraculo.test.ts` em `out-api-suites.txt`) |
| Produção desligada (`RECUPERACAO_ATIVA = "nao"` em `fly.toml`): a rota responde 503 antes de qualquer consulta | PASS (lido em `rotas/autenticacao.ts`, linhas 176 a 204, e `fly.toml`) |
| Pista 4: IP inválido gera 500 só para e-mail existente | **Reproduzido no nível de código**, sem superfície hoje (achado 1) |

## Evidência

- Re-execução independente da sonda `seg/e10-ip.test.ts` (configuração de produção, notificador falso), saída `redteam/out-e10-reexec.txt`: com `Fly-Client-IP` que não é IP, ou com `X-Forwarded-For` que não é IP e borda que não acrescenta o próprio salto, o e-mail existente recebe 500 e o inexistente 202; com borda que acrescenta o salto, os dois recebem 202.
- Causa lida: `abrir_recuperacao` (migração 005) só faz `nullif(p_ip, '')::inet` depois de achar a conta ativa; `enderecoDoCliente` (`rede.ts`) devolve o cabeçalho da borda sem validar. Com `NODE_ENV=production`, `trustProxy` confia só no salto imediato (`servidor.ts`, linha 355); fora de produção, `req.ip` é o endereço do socket.
- Documentação do Fly consultada: diz o que o `Fly-Client-IP` contém, mas NÃO diz se um valor enviado pelo cliente é sobrescrito. A alegação do validador de segurança de que é sempre sobrescrito é premissa, não prova.

## Cenários positivos

- Link do arquivo de teste redefine a senha; a nova entra (suítes).

## Cenários negativos

- Segundo uso do link, link vencido, token inventado: recusados com a mesma frase.

## Tentativas de reprovar

1. Fazer o IP chegar inválido: possível com cabeçalho da borda forjado quando o processo é alcançado sem a borda, ou se a borda não sobrescrever o cabeçalho. Em produção a rota está desligada (503), então não há superfície hoje.
2. Outros caminhos com o mesmo IP: `/auth/entrar` e `/auth/renovar` só gravam IP depois de credencial válida (sem oráculo); `GET /publico/oficio/:token` só grava IP depois de achar o token (aleatório).
3. Enumeração por tempo e por corpo na recuperação: não achei diferença (ver E05).

## Achados

**CORRIGE ANTES DO CP-19 (não bloqueia esta etapa)**

1. O IP do cliente entra em `abrir_recuperacao` sem validação: endereço que não é IP vira 500 só para conta existente (oráculo de existência). Correção curta: validar com `net.isIP` em `enderecoDoCliente` e gravar nulo quando inválido. Antes de ligar a recuperação em produção, provar contra a borda real se `Fly-Client-IP` enviado pelo cliente é descartado.

## Não verificado

- Comportamento real da borda do Fly com `Fly-Client-IP` forjado (sem ambiente de produção).
- Telas e cabeçalhos servidos pelo Vercel (QA e UX).

## Risco residual

Ao ligar a recuperação sem o achado 1, a enumeração de e-mails passa a depender só do comportamento da borda.

## Motivo do humano

Nenhum para esta dimensão.
