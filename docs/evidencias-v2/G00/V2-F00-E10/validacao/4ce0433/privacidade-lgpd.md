---
validador: privacidade-lgpd
modelo: claude-sonnet-5-5
etapa: V2-F00-E10
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD, INFRA]
nivel_de_prova_exigido: [E1, E3a]
nivel_de_prova_obtido: [E1, E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Campo "Impacto LGPD": "o e-mail do servidor é tratado só para enviar o link; o notificador de teste grava em arquivo local e `config.ts` o recusa em produção". E o risco declarado: token na query, resposta uniforme contra enumeração, produção desligada.

Inventário: `usuarios.email` e `nome` (lidos por `abrir_recuperacao` para enviar), `recuperacoes_senha` (`token_hash`, `criada_em`, `expira_em`, `usada_em`, `ip inet`, migração 005), o link (credencial de uso único, `?token=` no painel), o e-mail enviado ao provedor (Resend, ainda não ligado).

Fluxo e controles:
- Enumeração: `POST /auth/recuperar` responde 202 com o mesmo corpo para e-mail existente ou não (`rotas/autenticacao.ts:176-195`); o envio sai depois da resposta (`auth/servico.ts:279 enviarSemEsperar`), o teto por e-mail conta igual para quem não existe (`recuperacao-sem-oraculo.test.ts`, 15 casos). Sonda minha (arquivo temporário removido; `sonda2.txt`), 25 pares com e-mail existente e inexistente: status 202 e 202, corpo idêntico, mediana 0,9 ms contra 0,8 ms (sem relógio útil).
- Token em log: mesma sonda, com o provedor falhando e ecoando o pedido inteiro: log sem o e-mail, sem o token, sem o link (`semOsEnderecos` em `auth/notificador.ts`, chamado em `servico.ts:291`). O notificador de log só escreve o destinatário encoberto e o assunto (`notificador.ts`, `notificadorDeLog`). Hash do token no banco, nunca o token (teste "o banco guarda o hash do token e nunca o token").
- Token em Referer e na barra: `vercel.json:24` põe `Referrer-Policy: no-referrer` (e `X-Robots-Tag: noindex`) nas duas telas, e só nelas (justificado: chave do Google Maps); `RecuperarSenha.tsx:372` limpa a barra com `history.replaceState`; `dados/http.ts` usa `semSessao` nos três pedidos da recuperação (o 401 de link vencido não derruba a sessão de quem só abriu o link). Os testes de fonte passam (`recuperar-senha.test.ts`).
- Notificador de arquivo só fora de produção: `recuperacao-em-producao.test.ts`, 10 de 10; `fly.toml` mantém `RECUPERACAO_ATIVA = "nao"`.

O que a correção 4 mudou que toca dado pessoal (migração 051, `db/migrations/051_link_de_recuperacao_morre_com_a_credencial.sql`):
- O que guarda: nada novo. Nenhuma tabela, coluna ou policy; o gatilho `recuperacoes_morrem_com_a_credencial` (linha 113) só marca `usada_em` nos links pendentes (`usada_em IS NULL`), e portanto não toca `ip` nem os links já gastos.
- Por quanto tempo: igual ao anterior. A linha do link e o `ip` ficam para sempre (sem expurgo, ver Achados); o link em si morre ao primeiro de: uso, `expira_em`, pedido novo, mudança de senha, desativação.
- Quem lê: a função do gatilho é SECURITY INVOKER (EXECUTE revogado de PUBLIC, 051 linha 110), roda sob a RLS forçada do chamador; `consumir_recuperacao` continua SECURITY DEFINER com `search_path` fixo; a contagem de funções SECURITY DEFINER não subiu (a 051 não cria nenhuma; o `test:isolamento` do gatekeeper está verde, 345 aprovados). A tabela `recuperacoes_senha` não sai no pacote de saída por ser credencial (`saida/pacote.ts:156`).
- Minimização de credencial: conta desativada não recebe senha por link antigo (`consumir_recuperacao` confere `ativo`, linha 146 e 164), a resposta é a mesma do link vencido (sem dizer o motivo).

## Evidência

- `recuperacao-morre-com-a-credencial.test.ts` + `renovacao-contra-encerramento.test.ts` contra Postgres 17.6 real (binário local, porta própria, `DC360_POSTGRES_DE_PROVA`): 2 arquivos, 60 testes, código 0 (`api-pg.txt`), incluindo o caso 29 e o 32 (link contra troca e contra redefinição, sem impasse).
- PGlite: `recuperacao*` e `recuperacao-morre-com-a-credencial` (7) dentro dos 120 de `api1.txt`.
- Mutação minha: removi o `CREATE TRIGGER` da 051 (restaurado com `cmp`, `git status` limpo): 3 de 7 vermelhos em `recuperacao-morre-com-a-credencial` (redefinição por quem administra, troca pela própria pessoa, dois links), `mut1.txt`. O teste morde.
- Migração 051 aplicada por cima das 50 anteriores com o aplicador do repositório no meu Postgres 17.6 (`DATABASE_URL` próprio): 51 aplicadas, gatilho presente (contagem 1 em `pg_trigger`), colunas de `recuperacoes_senha` conferidas (`id, organizacao_id, usuario_id, token_hash, criada_em, expira_em, usada_em, ip`).
- Web: `recuperar-senha.test.ts`, `recuperar-senha-e-sessao.test.ts`: dentro dos 134 de `web1.txt`.

## Cenários positivos

O link redefine a senha, a nova entra e a antiga não; só o link mais novo vale; e-mail que existe e que não existe recebem a mesma resposta.

## Cenários negativos

Link pendente morre com redefinição por quem administra, com troca pela própria pessoa e com desativação (nem a reativação o ressuscita); link vivo numa conta desativada é gasto sem trocar a senha; reativação e falha de login não matam link; campos de município no corpo e cabeçalho são ignorados (`recuperacao-sem-oraculo.test.ts:200`); `RECUPERACAO_ATIVA=sim` sem `EMAIL_ATIVO=sim` ou com notificador de arquivo em produção é recusado.

## Tentativas de reprovar

Tentei distinguir e-mail existente por corpo, status e tempo (25 pares): nada. Tentei fazer o token ou o e-mail aparecerem no log com o provedor ecoando o pedido: não aparecem. Tentei derrubar o gatilho (mutação) para ver se o teste percebe: percebe. Procurei o token em evidência arquivada da etapa: só valores inventados (`token-so-para-a-captura-...`). Procurei segredo (Resend, JWT, URL de banco com senha) em E09, E10, E11, E15, E17 fora de `validacao/`: nenhum.

## Achados

- anotado: em minha sonda, quando o provedor devolve erro com o eco do pedido, o log (nível error, `servico.ts:291`) leva o texto do corpo sem o link e sem o e-mail, mas COM o nome do servidor ("Olá, Helena Vasques Coutinho"), truncado em `TETO_DO_ERRO_NO_LOG`. O código só remove endereços e e-mail. Nome de servidor no log de erro é dado pessoal de baixa sensibilidade; vale cortar o corpo inteiro do eco antes do CP-19 (Resend ligado).
- anotado: `recuperacoes_senha.ip` não tem prazo nem expurgo e não consta na linha da tabela no `DICIONARIO-DE-DADOS.md:327` (que só fala de `usada_em`). Dono: V2-F05-E12.
- anotado (CP-19): `docs/LIGAR-O-EMAIL.md` não manda desligar o rastreamento de cliques do provedor. Com rastreamento de link ligado no Resend, o `?token=` passaria pelo servidor do provedor. Verificar ao ligar o e-mail.
- anotado: a URL `/redefinir-senha?token=` chega ao servidor de borda da Vercel (log de acesso da plataforma) antes de o `replaceState` rodar, enquanto `SUBPROCESSADORES.md` diz que a Vercel alcança "Nenhum" dado. A linha só vale para dado de município; o token é uso único e expira em `RECUPERACAO_MINUTOS`, mas a tabela deveria dizer que a Vercel vê IP, user-agent e a URL. Não verificável aqui (não tenho o painel da Vercel).

## Não verificado

Envio real de e-mail (CP-19 aberto, produção desligada). Painel de log da Vercel e do Fly em produção. Navegador real do fluxo (seção 27 do e2e), a cargo de QA e UX. Concorrência com mais de uma máquina para o teto por e-mail (em memória, anotado pelo implementador).

## Risco residual

Teto por e-mail só por processo; IP sem expurgo; o link permanece em log de borda do host do painel até o fim de sua vida curta.

## Motivo do humano

Não se aplica a esta dimensão.

### Itens do "Motivo do veredito" da rodada 4 que tocam privacidade

O FAIL do QA era perda de serialização (senha do link não entra depois da troca em voo): CONSERTADO (60 de 60 em Postgres 17.6 real, casos 22, 29 e 32). Os "corrige antes de crescer" de Segurança e Red-team (link pendente sobrevive à redefinição, à troca e à desativação; `consumir_recuperacao` não conferia `ativo`): CONSERTADOS pela 051, provados por teste e por minha mutação do gatilho.
