---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E10
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [UI, AUTH, API, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
Veredito: PASS, com ressalvas que entram no roadmap (achados 1 e 2). O fluxo de ponta a ponta com o notificador de arquivo, a resposta neutra, o uso único, o vencimento e a produção desligada resistiram a todas as tentativas de quebra. O redirecionamento automático em 2,5 s apontado pela acessibilidade é real; para o QA é defeito de acabamento que não impede a tarefa.

Saídas e temporários em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/qa-painel/` (abaixo, `qa-painel/`). API minha na 3991 com `NOTIFICADOR_ARQUIVO` do scratchpad; uma segunda, na 3992, com `RECUPERACAO_MINUTOS=5` para o link vencido de verdade; painel do SHA construído fora do repositório na 4991. Nada foi commitado e a árvore ficou limpa.

## Critérios verificados

| # | Critério | Resultado |
| --- | --- | --- |
| 1 | Pedido responde 202 neutro, igual para e-mail existente, inexistente e de OUTRO município | PASS. Corpo idêntico nos três e com o e-mail em MAIÚSCULAS (`qa-painel/e10-chromium.txt`); o arquivo do notificador tem mensagem para Helena e para Aurélio (Vale Fundo, cada um com o próprio link) e nenhuma para o inexistente |
| 2 | O link do arquivo redefine a senha; a nova entra e a antiga não | PASS no navegador e na API (401 para a antiga, 200 para a nova) |
| 3 | O mesmo link duas vezes: a segunda é recusada | PASS. API 401 e, na tela, a frase "Este link de redefinição não vale mais..." com o caminho de pedir outro; a senha NÃO mudou com o link usado |
| 4 | Link vencido | PASS com vencimento de verdade: `RECUPERACAO_MINUTOS=5`, link usado depois de 5 minutos, 401, mesma mensagem e mesmo status do token inventado, senha da conta intacta (`qa-painel/e10-vencido.txt`) |
| 5 | Token inventado, vazio, link trocado por pedido mais novo | PASS. Inventado: mesmo status e corpo do link usado; vazio: 422 sem 500; o link antigo, depois de um segundo pedido, dá 401 |
| 6 | O token de uma conta não serve para outra | PASS. Token de Jonas com `email` de Rita e `usuarioId` de outro usuário no corpo: redefine só Jonas, Rita segue com a senha da semente |
| 7 | Redefinir derruba as sessões abertas | PASS. A renovação da sessão aberta antes da recuperação dá 401 e o token de acesso antigo não escreve (401) |
| 8 | Estados da tela: senha curta, senhas diferentes, sem link, F5 depois de removido o token | PASS. "A senha precisa de pelo menos 12 caracteres.", "precisam ser iguais"; depois do F5 a tela diz "Link incompleto" e oferece pedir outro, sem "Esta página não existe" |
| 9 | O token sai da barra de endereço (`history.replaceState`) | PASS. A URL perde `token=` e `history.state` não o contém |
| 10 | Produção desligada | PASS (detalhe abaixo) |
| 11 | Entradas sujas no pedido | PASS. E-mail malformado 422; de 5000 caracteres 422 sem 500; corpo vazio 422 |

### Produção desligada

`qa-painel/e10-desligada.txt`, API com `RECUPERACAO_ATIVA=nao`: `GET /auth/recuperacao` diz `ativa: false`; pedido responde 503 `recuperacao_desligada` com corpo idêntico para e-mail que existe e que não existe; `POST /auth/redefinir` também 503; zero linha no arquivo do notificador; a tela `/recuperar-senha` não oferece campo de e-mail, manda procurar quem administra, descreve o botão "Redefinir senha" de Usuários, não dispara nenhum POST e não rola na horizontal a 320 px. Configuração (`qa-painel/config-prod.txt`, `carregarConfig` com uma produção completa): `RECUPERACAO_ATIVA=nao` sobe; ausente (padrão `sim`) recusa; `sim` sem `EMAIL_ATIVO` recusa; `NOTIFICADOR_ARQUIVO` recusa em produção mesmo com a recuperação desligada; `SIM` maiúsculo recusa. O `fly.toml` declara `RECUPERACAO_ATIVA = "nao"` (linha 67). Testes: `recuperacao-em-producao`, `recuperacao-desligada` e `recuperacao` na API, 27 de 27 (`qa-painel/api-recuperacao.txt`); `recuperar-senha.test.ts` e `recuperar-senha-e-sessao.test.ts` no painel dentro dos 649 de 649.

## Evidência

`qa-painel/e10-chromium.txt` (30 de 30), `e10-desligada.txt` (9 de 9), `e10-vencido.txt` (3 de 3), `e10-tempo.txt` e `e10-tempo2.txt` (tempos de resposta), `config-prod.txt`, `api-recuperacao.txt`, `web-vitest.txt`; `baseline/17-e2e-api.txt` (seções 14 e 27 verdes) e `qa-painel/e2e-api-chromium.txt` e `e2e-api-firefox.txt` (minha repetição, 279 mais 50 nos dois motores). A rodada de navegador do agente independente (`web/RELATORIO.md`, T5) repetiu o fluxo em Chromium, Firefox e WebKit.

## Cenários positivos

Pedido, link, senha nova, entrada com a nova; com a recuperação ligada e com ela desligada.

## Cenários negativos

E-mail inexistente e de outro município; link usado, vencido, inventado, vazio e trocado; senha curta, diferente da repetição; F5 depois de removido o token; entradas gigantes; produção com flag errada; `NOTIFICADOR_ARQUIVO` em produção.

## Tentativas de reprovar

1. Enumeração por conteúdo: corpos idênticos nos três casos e com caixa alta. Por tempo: primeiros pedidos de cada conta existente 9,1, 5,6, 4,9, 5,0 e 4,5 ms contra 5,0, 3,7, 4,6, 3,6, 2,9 e 3,1 ms de inexistentes; a diferença é de cerca de 1 ms em loopback, sem oráculo mensurável (o envio sai depois da resposta). Não afirmo ausência de oráculo em rede real.
2. Reuso do link, link de outra conta com campos extras de identidade, link de pedido superado: tudo recusado.
3. Fiz o link vencer de verdade em vez de simular o relógio.
4. Procurei o token em `history.state`, na URL e depois do F5: removido.
5. Procurei o caminho em que a produção sobe com a recuperação ligada sem provedor: não existe (cinco variações recusadas).
6. Procurei a tela "Esta página não existe" no fluxo de link inválido e sem link: não aparece.

## Achados

Primeiro balde, BLOQUEIA: vazio.

Segundo balde, CORRIGE ANTES DE CRESCER:

1. **O redirecionamento automático apaga a única confirmação.** Dono: E10 (`RecuperarSenha.tsx`, `ESPERA_ATE_A_ENTRADA_MS = 2500`, `window.location.assign("/entrar")`). Reprodução: redefinir com link válido e olhar. Obtido: a frase "Senha redefinida. Entre com a nova senha." aparece 872 ms depois do clique e a página troca sozinha 2919 ms depois do clique (cerca de 2 s de leitura); a entrada que carrega não contém "redefinid" (`qa-painel/e10-chromium.txt`, notas e verificação "a entrada NÃO repete que a senha foi redefinida"). Quem lê devagar ou usa leitor de tela perde a confirmação; é o achado 2.2.1 da acessibilidade, que confirmo por execução. Remédio: tirar o redirecionamento e deixar o botão "Ir para a entrada", ou levar a frase para a entrada.
2. **Quem administra sozinho e esquece a senha não tem saída com a recuperação desligada, que é a produção de hoje.** Dono: E10 com a E09. A tela manda "procurar a pessoa que administra (coordenação ou administração)", mas coordenadora não administra administradora (403 `posto_insuficiente`, `qa-painel/e09-iso.txt`) e a própria administradora não redefine a si mesma (422). Só com um segundo administrador há caminho (provado: administradora redefine outra administradora, 200, `qa-painel/e09-admin2.txt`). Nem a tela nem o GUIA DO COORDENADOR dizem isso. Registrar como pendência de operação (município com um administrador só) até o CP-19.

Terceiro balde, ANOTADO:

3. Com a recuperação desligada, `/redefinir-senha?token=...` ainda mostra o formulário e só depois da gravação cai na tela "desligada" (por desenho: token aberto antes do desligamento).
4. O cabeçalho `Referrer-Policy: no-referrer` do `vercel.json` é provado por teste que lê o arquivo (JSON válido, só as duas rotas); não vi o cabeçalho numa implantação real da Vercel (já está em `apps/web/PENDENCIAS.md`).
5. O teste de enumeração por tempo foi em loopback com poucas amostras.

## Não verificado

- Envio real de e-mail (CP-19, fora do escopo) e o cabeçalho numa Vercel de verdade.
- Mutação do `fly.toml` e do `vercel.json`: ficam fora do que eu podia alterar; a prova de que os testes mordem é a da rodada 1 (mutação do `fly.toml` reprovou) e as cinco variações de configuração que executei acima (`config-prod.txt`).
- Leitor de tela e zoom de 200 por cento (acessibilidade tem relatório próprio).
- Dois pedidos simultâneos para o mesmo e-mail (corrida entre o pedido e a invalidação do anterior).

## Risco residual

Município com um só administrador, produção com recuperação desligada: esquecimento de senha dele exige intervenção fora do produto. Quem não lê a confirmação em 2 s sai da tela sem saber que a senha mudou.

## Motivo do humano

Nenhum. O fluxo com o notificador de arquivo e a confirmação de que a produção segue desligada foram provados por execução (substituição já registrada no VEREDITO).
