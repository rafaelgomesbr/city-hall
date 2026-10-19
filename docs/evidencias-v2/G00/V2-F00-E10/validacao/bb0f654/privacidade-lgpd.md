---
validador: privacidade-lgpd (general-purpose com o papel da dimensão)
modelo: claude-sonnet-5-5
etapa: V2-F00-E10
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD, INFRA]
nivel_de_prova_exigido: [E1, E2, E3a]
nivel_de_prova_obtido: [E1, E2, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
Aviso: não sou advogado e isto não é parecer jurídico. Cobre a parte técnica (inventário, fluxo, controles, evidência). Base legal, controlador e operador, DPO e prazo de retenção ficam para pessoa. `$SP` é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/privacidade-lgpd-e09-e10-e11-e15-e17`. Nada foi herdado; tudo foi executado nesta rodada no HEAD `0290af5` (produto de `bb0f654`). A confiança é média porque o cabeçalho de produção da Vercel e o provedor de e-mail real são ambientes que não alcancei.

## Critérios verificados

1. O e-mail do servidor é tratado só para enviar o link; a resposta do pedido é a mesma para e-mail existente, de outro município ou inexistente (sem oráculo).
2. O token do link não vaza: nem em log, nem em armazenamento do navegador, nem na barra de endereço depois de lido, nem em pedido de rede de terceiro; Referrer-Policy fechado.
3. O notificador de arquivo (que grava e-mail e link em texto puro) só existe fora de produção, e a produção continua com a recuperação desligada.
4. Nenhum e-mail, link ou nome de pessoa sai em log quando o provedor falha.
5. O link tem uso único, vence e é invalidado por um pedido novo; o token só existe no banco como hash.
6. O dicionário e a política descrevem o dado que a recuperação grava (IP de quem pediu).

## Evidência

Inventário dos dados tocados:

| Dado | Onde fica | Quem lê | Por quanto tempo |
| --- | --- | --- | --- |
| e-mail digitado no pedido | corpo do `POST /auth/recuperar` (não logado); `usuarios.email` (já existia); contador por hash SHA-256 do e-mail em memória (`auth/servico.ts:250-265`) | API | o corpo, só a requisição; o contador, uma hora e limitado em tamanho |
| `recuperacoes_senha.token_hash`, `ip` (inet), `criada_em`, `expira_em`, `usada_em` | tabela com RLS forçada | API (função `abrir_recuperacao`) | sem expurgo: as linhas ficam (não há DELETE) |
| link com token em claro | corpo da mensagem para o notificador; em teste, arquivo de texto | quem recebe o e-mail; em teste, quem lê o arquivo | arquivo só em teste, em pasta temporária de modo 0700, apagada no fim (`scripts/e2e-api.mjs:46,87`) |
| nome e e-mail do destinatário | corpo da mensagem e `para` do notificador | idem | idem |

Controles, com arquivo e linha:
- `apps/api/src/auth/servico.ts:1006-1038` (`pedirRecuperacao`): teto por e-mail (resposta igual quando acima do teto), `abrir_recuperacao` só devolve nome e e-mail internamente, o envio sai depois da resposta (`enviarSemEsperar`, linhas 280-297) e a falha passa por `semOsEnderecos(bruto, corpo, para)` antes do log.
- `apps/api/src/auth/notificador.ts`: `notificadorDeLog` encobre o e-mail e nunca imprime o corpo; `notificadorDeArquivo` grava a mensagem inteira (de propósito, canal de teste); `semOsEnderecos` tira links e o e-mail do texto de erro.
- `apps/api/src/config.ts:702-707`: `NOTIFICADOR_ARQUIVO` em produção derruba a partida; `:720-751`: recuperação ligada exige provedor e `EMAIL_ATIVO=sim`.
- `dc360/fly.toml:67`: `RECUPERACAO_ATIVA = "nao"`.
- `dc360/vercel.json`: `Referrer-Policy: no-referrer` e `X-Robots-Tag: noindex` em `/(recuperar-senha|redefinir-senha)`.
- `apps/web/src/paginas/RecuperarSenha.tsx:352-372`: o token é lido uma vez para o estado e a barra é trocada por `history.replaceState`.
- `db/migrations/005_recuperacao_de_senha.sql:44-125` (`abrir_recuperacao`, `consumir_recuperacao`), versão atual da 049.

Execuções desta rodada:
- E1: `apps/api` `recuperacao.test.ts`, `recuperacao-desligada.test.ts`, `recuperacao-em-producao.test.ts`, `recuperacao-sem-oraculo.test.ts`, `log.test.ts` entre os 8 arquivos e 130 testes, código 0 (`$SP/api-1.txt`); `apps/web` `recuperar-senha.test.ts` entre os 5 arquivos e 90 testes, código 0 (`$SP/web-testes.txt`).
- E2 API (`$SP/sonda-api.mts`): pedido real com notificador capturado: 202; o banco guarda o hash do token (não o token) e o IP de quem pediu (198.51.100.99); redefinir com o link: 200; segundo uso: 401. Varredura de 55 linhas de log (coletor do teste): nenhuma ocorrência do token, do link, de e-mail algum, de senha, de corpo malformado. Corpo JSON malformado com e-mail dentro: 400 `corpo_invalido` sem eco. Senha curta no `POST /auth/redefinir` com token plantado: 422 sem token no log. Provedor que falha ecoando o link e o e-mail: o log recebeu "[endereco removido]" e "[email removido]" (uma linha nível 50).
- E2 navegador (Chromium, API e painel meus, `$SP/nav/sonda-nav-saida.txt`): o pedido pela tela mostra a mensagem neutra; o arquivo do notificador (da minha API) tem e-mail e link em claro, como esperado; ao abrir o link, a barra passa a `/redefinir-senha` sem token, `history.state` e storage sem o token, e, fora o pedido da própria navegação (que por natureza leva o endereço com o token), nenhum pedido de rede leva o token na URL (o `POST /auth/redefinir` leva o token no corpo e o Referer é só a origem); as únicas requisições com o token no Referer foram o JS e o CSS do próprio painel (mesma origem; a origem de todas as requisições foi só `localhost:4781`, nenhum terceiro). O servidor de pré-visualização local não emite o cabeçalho (ele é da Vercel), por isso o fechamento do Referer em produção é provado só pela configuração e pelo teste (ver abaixo). Log real do servidor (485 linhas, `$SP/nav/api.log`): nenhum token, e-mail, senha ou user-agent.
- Provas de que o teste morde (mutação, desfeita com `git restore`, árvore limpa conferida depois): M3 `semOsEnderecos` tirada do erro do envio: reprova "a falha do provedor vai para o log, sem o link e sem o email" (`$SP/mut-e10-m3.txt`); M12 trava de `NOTIFICADOR_ARQUIVO` em produção desligada: 2 testes reprovam (`$SP/mut-e10-m12.txt`); M13 `fly.toml` com `RECUPERACAO_ATIVA = "sim"`: reprova (`$SP/mut-e10-m13.txt`); M14 `Referrer-Policy` trocado por `origin` no `vercel.json`: reprova (`$SP/mut-e10-m14.txt`). Um mutante SOBREVIVEU: M4, retirar `req.body.token` da lista `CAMINHOS_REDIGIDOS` (`$SP/mut-e10-m4.txt`, 16 de 16 passam). Ver Achado 2.
- Evidência arquivada da etapa (fora de `validacao/`) varrida por JWT, `Bearer`, chave de provedor, URL com credencial, CPF: nada. O único token real-looking está em `saidas/02-sonda-antes-do-conserto-api.txt`, sonda de ANTES do conserto, de e-mail sintético `serraalta.exemplo.gov.br`, e é token de teste já gasto.

## Cenários positivos

- Pedido, link, redefinição e entrada com a senha nova; a antiga deixa de valer (e2e e `recuperacao.test.ts`).
- Estados da tela: pedido enviado com a mesma frase para qualquer e-mail, link usado de novo, tela sem link.
- Produção desligada: `fly.toml` e a trava de configuração.

## Cenários negativos

- E-mail de outro município ou inexistente recebe a mesma resposta (`recuperacao-sem-oraculo.test.ts`; os três arquivos de recuperação mais `log.test.ts` somam 45 casos na rodada da mutação M3).
- Mesmo link duas vezes: o segundo, 401 (sonda minha e e2e).
- JSON malformado, e-mail inválido e senha curta não produzem eco do dado no log.
- `NOTIFICADOR_ARQUIVO` ou recuperação ligada sem provedor em produção: a API não sobe (testes mordem).

## Tentativas de reprovar

1. Token no log: passei o link por 5 caminhos (sucesso, redefinição, erro de validação, falha do provedor, corpo malformado). Nenhum registrou o token. Só o contrário: a defesa em profundidade `req.body.token` na redação não é cobrada por teste (Achado 2).
2. E-mail no log: nos mesmos caminhos, nenhum. O e-mail do corpo do provedor sai como "[email removido]".
3. Nome da pessoa no log da falha do provedor: `semOsEnderecos` remove links e e-mail, não o nome. Simulei um provedor que ecoa o texto da mensagem (que começa com "Olá, <nome>"): o nome saiu no log. O Resend real, pelo contrato descrito no código, não ecoa o corpo, então é risco baixo; está no Achado 3.
4. Token na barra de endereço depois de lido: removido. Token em storage e `history.state`: ausente. Token no Referer para terceiro: sem terceiro nas requisições da tela; mesma origem recebe o Referer completo no preview local (sem o cabeçalho), o que a Vercel fecha em produção.
5. Notificador de arquivo em produção: tentei por config (mutação M12): o teste cobra. Pasta do arquivo no e2e: `mkdtemp`, modo 0700, `rmSync` no fim.
6. Oráculo de usuário: respostas iguais, inclusive acima do teto por e-mail.
7. Evidência arquivada com segredo: nada vivo.
8. Link de recuperação de conta de outro município aberto na tela de outro: o token de uma conta não serve a outra (o `consumir_recuperacao` casa pelo hash do token e usa o usuário da linha; coberto em `recuperacao-sem-oraculo.test.ts`).

## Achados

1. **corrige antes de crescer (documentação).** `recuperacoes_senha.ip` (IP de quem PEDIU a recuperação, que pode ser um atacante ou outra pessoa) não é descrito no dicionário (a linha diz "Pedidos de recuperação, com validade e uso único") nem em `PRIVACIDADE.md`; as linhas ficam sem expurgo (CP-10, F05-E12). Não quebra critério da E10 (a etapa declara fora de escopo a auditoria e o expurgo). Reprodução: `$SP/esquema.txt` linha `recuperacoes_senha` (coluna `ip:inet`) contra `grep -n "recuperacoes_senha" dc360/docs/DICIONARIO-DE-DADOS.md`.
2. **anotado.** Mutante sobrevivente M4: a lista `CAMINHOS_REDIGIDOS` (`servidor.ts`) não é cobrada para `req.body.token` por teste; hoje é defesa em profundidade, porque o serializador de `req` não registra corpo. Também não há `req.body.email` na lista. O risco aparece se alguém um dia registrar o corpo em um ponto de diagnóstico.
3. **anotado.** `semOsEnderecos` não remove o NOME da pessoa do texto de erro do provedor. Hoje depende de o provedor não ecoar o corpo.
4. **anotado.** O arquivo do notificador de teste guarda e-mail e link em claro; a defesa é a trava de configuração em produção (verificada e mordente) e a pasta temporária do e2e.

## Não verificado

- CI do SHA: `ci_run` ausente.
- O cabeçalho `Referrer-Policy: no-referrer` em produção (Vercel): verifiquei o `vercel.json` e o teste que o lê, não a resposta real.
- O provedor de e-mail real (Resend): nenhuma mensagem real foi enviada; o formato do erro do provedor foi simulado.
- Leitor de tela e aparelho físico.
- Firefox e WebKit na sonda de navegador.
- Base legal de tratar o e-mail para recuperação e a escolha do provedor (CP-19).

## Risco residual

- IP de quem pediu recuperação guardado sem prazo (Achado 1).
- Com o e-mail de produção ligado no futuro (CP-19), a mensagem passa por provedor externo: operador e subprocessador a definir por pessoa.

## Motivo do humano

`humano_necessario: sim` para o que a seção 4 de `28` mantém com pessoa: (a) CP-19, que decide a contratação do provedor, o papel dele como operador e a base legal de enviar e-mail; (b) o prazo de retenção do IP de recuperação (CP-10). O aviso de "Não verificado" sobre a Vercel é ambiente externo. As verificações técnicas foram feitas por execução e estão acima; nenhuma muda o veredito técnico da etapa.
