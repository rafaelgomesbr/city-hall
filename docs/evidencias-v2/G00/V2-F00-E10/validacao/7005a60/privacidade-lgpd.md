---
validador: privacidade-lgpd
modelo: claude-sonnet-5-5
etapa: V2-F00-E10
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [LGPD, SEGURANCA, API, UI]
nivel_de_prova_exigido: [E1, E3a]
nivel_de_prova_obtido: [E1, E3a]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Inventário dos dados tocados:

| Dado | Onde | Controle |
| --- | --- | --- |
| e-mail do titular | `usuarios`; lido por `abrir_recuperacao` só para enviar o link | resposta uniforme exista a conta ou não (`rotas/autenticacao.ts:167-181`) |
| token de recuperação | `recuperacoes_senha.token_hash` (migração 005) | só o hash SHA-256 (`hashDoToken`) é gravado; o token em claro só existe no link |
| prazo | `expira_em` = `RECUPERACAO_MINUTOS` (padrão 30, entre 5 e 120) | `consumir_recuperacao` exige `usada_em IS NULL AND expira_em > now()` |
| uso único | `usada_em` | link consumido ou substituído por pedido novo é marcado usado (`abrir_recuperacao` invalida os anteriores) |
| IP do pedido | `recuperacoes_senha.ip` | retido sem expurgo até a F05-E12 (fora do escopo) |

Eliminação do token: o token não é apagado, fica inutilizado. A tabela é sem DELETE para a aplicação (migração 034, "tabelas centrais não se apagam") e não entra no pacote de saída (`TABELAS_QUE_NAO_SAEM`). Como só há hash, o resíduo não é credencial viva. O que sobra é IP e data, a expurgar na F05-E12. Anotado, não bloqueia.

Para onde vai o e-mail do notificador de teste:
- `index.ts:121-135`: `NOTIFICADOR_ARQUIVO` (arquivo local) tem precedência; senão, `EMAIL_ATIVO=sim` monta o cliente HTTP real; senão, `notificadorDeLog` (padrão do servidor), que grava só `para` encoberto (`a***@dominio`) e o assunto, nunca o corpo.
- O arquivo de teste grava destinatário e link inteiros em texto puro (`notificador.ts:96-108`); o e2e o põe em `mkdtempSync(tmpdir())` e o apaga em `rmSync` (`scripts/e2e-api.mjs:46,87`). Nenhum arquivo de notificação ou ZIP versionado (`git ls-files`), e nenhuma evidência contém link com token nem JWT.
- Nada de e-mail real sai com a variável desligada: `EMAIL_ATIVO` padrão `nao`, e sem ele só há log ou arquivo. Só `EMAIL_ATIVO=sim` com `NOTIFICADOR_URL`, `NOTIFICADOR_CHAVE` e remetente chama o provedor.

Produção desligada:
- `fly.toml:67` `RECUPERACAO_ATIVA = "nao"`. Com a variável em `nao`, `POST /auth/recuperar` e `/auth/redefinir` respondem 503 antes de tocar o banco ou o notificador (`autenticacao.ts:167-169, 203-205`), então nenhum token é gerado nem e-mail enviado.
- `config.ts:702-752`: em produção a partida é recusada com `NOTIFICADOR_ARQUIVO`, com recuperação ligada sem `NOTIFICADOR_URL` e `NOTIFICADOR_CHAVE`, ou com recuperação ligada e `EMAIL_ATIVO != sim`.
- O padrão de `RECUPERACAO_ATIVA` no código é `sim` (`config.ts:83`); a segurança vem de a trava de produção recusar a partida, não do padrão. Ok.

Vazamento do token: `RecuperarSenha.tsx:324-342` lê o token uma vez e faz `history.replaceState` para tirar da barra; `vercel.json` põe `Referrer-Policy: no-referrer` em `/recuperar-senha` e `/redefinir-senha`.

## Evidência
- `npx vitest run` de `recuperacao-desligada`, `recuperacao-em-producao`, `recuperacao-sem-oraculo` e `recuperacao` (14 casos: link duas vezes, token inventado, link anterior invalidado, derruba sessões): 7 arquivos juntos, 102 testes, saída 0 (`scratchpad/api.txt`).

## Cenários positivos
Pedido gera hash e link; redefinição troca a senha, derruba sessões e desbloqueia a conta.

## Cenários negativos
Mesmo link duas vezes (recusado); token inventado (mesma mensagem); e-mail inexistente (resposta idêntica); conta desativada não recebe link; produção com `RECUPERACAO_ATIVA=sim` e `EMAIL_ATIVO=nao` não sobe; `NOTIFICADOR_ARQUIVO` em produção não sobe. Isolamento: o pedido com e-mail do município B responde igual ao inexistente (`recuperacao-sem-oraculo.test.ts`).

## Tentativas de reprovar
- Procurei token em claro no banco, no log e na evidência: só hash; o log de notificação omite o corpo; nada nas evidências.
- Procurei caminho com a variável desligada que ainda enviasse: as duas rotas recusam em 503 primeiro.
- Procurei partida de produção com o arquivo de teste: `config.ts` derruba.

## Achados
1. anotado. O token vai na query do link e o host estático (Vercel) enxerga a URL nos logs de acesso dele. Mitigado por uso único, 30 minutos e hash no banco; entra no inventário de operadores quando o CP-19 ligar o e-mail.
2. anotado. `recuperacoes_senha.ip` e as linhas usadas ficam sem prazo até a F05-E12.
3. anotado. A redefinição por link não grava na trilha (F03).

## Não verificado
- Operador de e-mail, contrato e transferência internacional do provedor: não aplicável hoje (desligado), é do CP-19.
- Texto do aviso de privacidade sobre recuperação: pessoa.
- Envio real a provedor: sem credencial, nem deveria.

## Risco residual
Baixo enquanto a produção permanece desligada.

## Motivo do humano
Escolha do provedor, residência do dado, contrato de operador e base legal do tratamento do e-mail no CP-19 são decisão de pessoa (e de advogado).
