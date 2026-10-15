---
validador: seguranca-aplicacao (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E07
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [AUTH, DB, MIGRATION, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: nao
escalar: arbitragem em Opus sobre o achado 1 (mesmo defeito do FAIL do banco e do red-team desta rodada)
---
## Critérios verificados

Reexecutei neste SHA, e avaliei de forma INDEPENDENTE o defeito que banco e red-team já apontaram (login com a senha antiga simultâneo à troca de senha/redefinição/desativação): reproduzi com script próprio, medi, e procurei o que ninguém olhou (segundo fator depois da troca, `/auth/sair` com token rotacionado, corpo vazio).

| Critério | Resultado | Prova |
| --- | --- | --- |
| Sessão rotacionada só vale enquanto a cadeia vive; encerramento no meio da renovação não deixa sessão viva (FAIL da rodada 2) | **PASS** | corrida real PG17, 14/14 (`12-corrida-repo-pg17.txt`); mutação MA (renovação sem `travar_sessoes_do_usuario`) derruba 6 de 14 no bloco real (`30-mutacao-MA`); restaurado 14/14 (`31`) |
| Papel alterado se renova (401 `nao_autenticado`), não escreve com o papel velho | PASS | `familia-da-sessao.test.ts` verde (`01-suites-alvo-pglite.txt`); mutação MB (rotacionada sempre viva) derruba 8 de 43 (`32-mutacao-MB`) |
| Senha provisória vencida nem escreve nem se troca | PASS | `senha-provisoria.test.ts` verde (`01-suites`); `trocarSenha` relê `senha_provisoria_ate` (`servico.ts:909-930`) |
| Migração aplicada do zero e idempotente (049, 050) | PASS | PG17 real: `migrar` aplica 001..050, `--conferir` "Esquema em dia", de novo idempotente (`14-migrar.txt`, `15-migrar-conferir.txt`) |
| **Sessão revogada (item 2 da seção 7 de `28`; item "sessão revogada" do G00)** | **FAIL** | achado 1 |

## Achados

**1. FAIL (bloqueia; item 2 da seção 7 de `28`, autenticação/sessão revogada, não admite risco aceito; "Reabre se" do G00).**

Uma sessão aberta por um login que conferiu a senha ANTIGA, iniciado no mesmo instante de uma troca de senha, de uma redefinição por link, de uma redefinição por quem administra ou de uma desativação, SOBREVIVE à revogação que esses atos fazem, e renova e escreve.

Mecanismo, lido no código: `entrar` (`auth/servico.ts:275-376`) lê a credencial numa transação (`credenciais_para_login`, conferência do scrypt fora do banco) e abre a sessão em OUTRA transação (`emitirPar` → `abrirSessao` → `abrir_sessao`, linha 564). No ramo de login (`familia_id NULL`), `abrir_sessao` da 050 só confere a suspensão do município (`FOR SHARE` em `organizacoes`): NÃO toma `travar_sessoes_do_usuario`, NÃO relê `usuarios.ativo` nem o hash da senha. A correção 2 (migração 049) pôs a trava por pessoa em `trocar_senha`, `consumir_recuperacao`, `revogar_sessoes_do_usuario` e `console_suspender_municipio`, e a 050 fechou o login contra a SUSPENSÃO; o login contra a troca/redefinição/desativação ficou de fora da mesma trava. Em READ COMMITTED, o `UPDATE sessoes` desses atos não enxerga a linha que o login ainda não confirmou, e a sessão nova nasce viva.

Reprodução própria, determinística, em PGlite, com um grampo que segura o login entre a leitura da credencial e a abertura da sessão (`$SP/val/seguranca-aplicacao/sondas/e07-login-contra-troca.test.ts`, saída `20-e07-sonda-login-e-bordas.txt`):

- A1 (troca de senha pela própria pessoa, agente): login com a senha antiga abre sessão 200; o par renova 200, lê 200 e ESCREVE 200 (`/auth/encerrar-sessoes` derruba a sessão da vítima). Controle: a senha antiga agora dá 401. Sessão viva nascida depois da troca: 1.
- A2 (troca pela coordenadora): login antigo 200, escreve 200, renova 200.
- A3 (redefinição por link, `consumir_recuperacao`): login antigo 200, escreve 200, renova 200.
- A4 (redefinição por quem administra, senha provisória): login antigo 200 e o par NÃO carrega a marca `sp` (lida antes da redefinição), então a escrita passa 200 e a troca obrigatória de senha é CONTORNADA.
- A5 (desativação pelo painel): login antigo abre sessão 200, mas a escrita subsequente recebe 403 `conta_desativada` e a renovação 403 (a vigência da E04 relê `ativo`); a leitura segue 200 por até 15 min. Este é o caso MITIGADO na escrita.

A troca de senha é o remédio de quem desconfia de vazamento da senha; que ela não feche com certeza uma sessão aberta no mesmo instante com a senha antiga é exatamente a falha que o item "sessão revogada" do G00 proíbe. A janela é a do scrypt (centenas de ms) e o limite de login por endereço a estreita, mas a regra é inegociável e a sessão sobrevivente renova por 14 dias.

Conserto mínimo (não implemento): o login abrir a sessão sob `travar_sessoes_do_usuario` e, na mesma transação, reler `ativo` e uma versão da credencial que a troca/redefinição altera (recusando se mudou desde o scrypt); a mesma conferência no segundo fator e na ativação; caso no bloco de Postgres real com a disputa segurada. Dono: E07 (mesma família das migrações 049/050).

**2. CORRIGE ANTES DE CRESCER (mesmo dono, mesma raiz): o segundo fator não fecha a janela.**
- B: desafio de código emitido antes da troca de senha, usado com um código válido DEPOIS da troca, abre sessão (`conferirSegundoFator`, `servico.ts:427-474`, relê `ativo` e a suspensão mas não a senha). Escrita 200, renovação 200 (`20-...`, bloco B).
- C: o desafio de ATIVAÇÃO obrigatória do segundo fator (administradora sem 2FA), emitido antes de uma redefinição por link, continua válido depois dela: `iniciar`/`confirmar` com o desafio antigo abrem sessão de administradora e escrevem 200 (`20-...`, bloco C). Pior que B, porque não exige código prévio.

**3. ANOTADO (desenho anterior; dono F02-E03): corpo JSON vazio.** `POST /auth/sair`, `/auth/renovar`, `/auth/entrar` e `/auth/trocar-senha` com corpo vazio ou JSON truncado respondem 500 `erro_interno` em vez de 400/413. Sem vazamento de interno (mensagem genérica + id). Bloco F de `20-...`.

**4. ANOTADO (desenho anterior): `/auth/sair` com token já rotacionado.** Responde 204 e NÃO encerra a cadeia nem trata como reuso (`servico.ts:998-1038` chama `revogar_sessao`, que não acha o token rotacionado e devolve 0, em silêncio). Bloco E de `20-...`: a cadeia segue viva, o token de acesso pré-rotação escreve, o par novo renova. Baixo impacto (quem tem o token rotacionado já renovou), mas o "sair" não devolve a garantia que a tela sugere. Fora do escopo estrito da E07.

## Cenários positivos
- Renovação normal: os dois tokens escrevem; a rotação não é expulsão (caso 5 do bloco real, `12-corrida-repo-pg17.txt`).
- D (bloco D de `20-...`): trocar a senha com o token anterior à renovação encerra a cadeia e deixa 0 sessão viva; o token velho e o par antigo caem. Correto.

## Cenários negativos
- Os encerramentos em massa (admin, própria pessoa, troca, reuso, suspensão) contra a renovação concorrente: 0 sessão viva (14/14, `12-corrida-repo-pg17.txt`); a mutação MA prova que a trava é o que segura (6 vermelhos).
- O login concorrente (achado 1): sessão viva sobrevive à revogação. FAIL.

## Tentativas de reprovar
1. Desfiz a trava da renovação (MA): o bloco real cai 6/14; restaurado, 14/14. O conserto da rodada 2 morde.
2. Fiz a rotacionada contar como sempre viva (MB): 8/43 caem. A regra da família morde.
3. Tirei o prazo da provisória de `exigirVigencia` (MC, `33-mutacao-MC`): 62/62 passam. NENHUM teste reprova (achado de teste do red-team desta rodada se confirma: o comportamento real está certo, mas falta um caso que fixe 401 `sessao_encerrada` numa escrita comum com prazo vencido). Anotado como lacuna de teste, mesmo dono.
4. Grampeei o login entre a leitura da credencial e a abertura da sessão e disparei troca/redefinição/desativação/2FA no meio: A1-A4, B, C reproduzem a sessão sobrevivente; A5 é mitigada na escrita pela vigência.
5. `/auth/sair` com token rotacionado e corpo vazio nas rotas de auth: achados 3 e 4.

## Não verificado
- Campanha de concorrência natural (sem grampo) em Postgres real para medir a frequência: o mecanismo e o desfecho estão provados de forma determinística pelo grampo em PGlite e pela leitura do código; a medição por corrida já está nos relatórios de banco desta rodada (que li: troca 13/30, redefinição 30/60 com sessão viva). Não repeti a campanha para não duplicar.
- CI do passo novo "Corrida de renovação contra encerramento" no GitHub (repositório privado, sem rede): rodei o mesmo teste nas condições do job, em PG17 real local.

## Risco residual
- A troca de senha, remédio de quem desconfia de vazamento, não fecha com certeza uma sessão aberta no mesmo instante com a senha antiga; a sessão sobrevivente renova por 14 dias e escreve. Até o conserto, o item "sessão revogada" do G00 não está satisfeito.

## Motivo do humano
Nenhum: o defeito é objetivamente verificável por execução.
