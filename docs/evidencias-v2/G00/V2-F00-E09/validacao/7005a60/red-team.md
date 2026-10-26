---
validador: red-team
modelo: claude-sonnet-5-5
etapa: V2-F00-E09
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

1. Encerrar, redefinir ou listar sessão de outra pessoa sem permissão: operador e agente receberam `403 sem_permissao` nas três rotas (`redefinir-senha`, `encerrar-sessoes`, `GET /usuarios/:id/sessoes`).
2. Papel insuficiente contra posto: coordenador contra coordenador e contra administrador: `403 posto_insuficiente` nas três rotas, sem efeito. Administrador contra outro administrador: 200 (desenho da rota; ver achado 4).
3. Outro município: administrador de A contra usuário de B e contra UUID inexistente: `404 {"erro":"nao_encontrado","mensagem":"Usuário não encontrado."}` nas três rotas, corpo idêntico nos dois casos.
4. A própria sessão: `422 autoredefinicao` e `422 autoencerramento`. `/auth/encerrar-sessoes` preserva a sessão de onde se clicou (4 sessões encerradas, a corrente seguiu viva).
5. IDOR por id de sessão: não existe parâmetro de sessão em nenhuma rota. `/auth/sessoes` devolve só `entrouEm`, `validaAte`, `aparelho`, `atual` (sem id, sem IP, sem user-agent; mandei `user-agent: SEGREDO-UA-XYZ` e ele não saiu). `DELETE /auth/sessoes/<id>` e `DELETE /auth/sessoes` deram 404 de rota.
6. CSRF: a API autentica só por `Authorization: Bearer`; nenhum cookie é emitido (`ctx.cookies()` vazio depois do login no Playwright). Preflight de `https://evil.example` para `redefinir-senha`: sem `access-control-allow-origin`. POST cross-origin sem token: 401. CSRF clássico não se aplica.
7. Token vivo de quem perdeu o poder: coordenadora DESATIVADA com token vivo tentando `redefinir-senha` de operador: `403 conta_desativada`. Coordenadora REBAIXADA no banco (o token ainda diz coordenador) tentando redefinir: `401 nao_autenticado`. Token de sessão já revogada chamando `/auth/encerrar-sessoes`: `401 sessao_encerrada`. A vigência na escrita segura as três.
8. Força bruta: 9 senhas erradas contra a conta com senha temporária recém-sorteada deram 401, e a senha temporária CERTA em seguida também deu 401 (bloqueio por conta ativo: 5 falhas, 15 minutos). A temporária tem 12 símbolos de um alfabeto de 32 (60 bits). Limite geral: 330 `GET /usuarios/:id/sessoes` seguidas deram 278 respostas 200 e 52 respostas 429 (teto de 300 por minuto por usuário funciona).
9. Telas do painel: redefinição, janela da senha única e confirmações já exercitadas pelo e2e do QA; não repeti.

## Evidência

- Sonda própria em teste temporário de API: `scratchpad/rt-api.txt` (blocos "E09 ..."), `npx vitest run test/zz-redteam-tmp.test.ts` em `dc360/apps/api`, saída 0.
- Clickjacking: `scratchpad/rt-frame.mjs` (Playwright, Chromium), painel construído do SHA em `scratchpad/web-dist` e servido na porta 4777: o painel renderiza (`#entrada-email`, "Defesa Civil Operacional 360") dentro de iframe de outra origem. A API envia `x-frame-options: SAMEORIGIN` e `frame-ancestors none`; o painel não envia nenhum.
- Arquivos temporários apagados; `git status --porcelain` só mostra `validacao/`. Servidores de teste (portas 3777 e 4777) encerrados.

## Cenários positivos

Redefinir senha de operador por administrador; listar sessões próprias; encerrar as outras; contar sessões de um agente.

## Cenários negativos

Itens 1 a 8.

## Tentativas de reprovar

1. Escalada por posto (coordenador contra administrador e contra coordenador): barrada.
2. Município vizinho: barrado com 404 indistinguível de UUID inexistente.
3. Token de quem foi desativado, rebaixado ou teve a sessão encerrada: barrado na escrita.
4. Vazar IP ou user-agent pela listagem: não vazou.
5. CSRF e CORS com origem hostil: nada passa.
6. Embutir o painel em página de terceiro (clickjacking): CONSEGUI (achado 1).
7. Estourar o limite de taxa: 429 aparece depois de 300 por minuto.
8. Redefinir a própria senha pela rota de administração: 422.

## Achados

1. corrige antes de crescer. O painel não envia `frame-ancestors`, `X-Frame-Options` nem CSP. `vercel.json` só define `Referrer-Policy` e `X-Robots-Tag` em duas rotas e cache em estáticos. A E09 acrescenta ações destrutivas ao painel (Redefinir senha, Encerrar sessões) e o painel abre em iframe de outra origem (`scratchpad/rt-frame.mjs`). Impacto: um site hostil pode induzir quem administra a dar os dois cliques (botão e `ConfirmarAcao`) e derrubar sessões ou trocar a senha de alguém; a senha temporária só aparece para o administrador, então o efeito é negação de acesso, não tomada de conta. Correção: cabeçalho `Content-Security-Policy: frame-ancestors none` (e `X-Frame-Options: DENY`) para todas as rotas em `vercel.json`, com teste de configuração no molde de `recuperar-senha.test.ts`. Reprodução na produção real não feita (Vercel não é acessível daqui); vale pelo arquivo de configuração e pelo painel construído do mesmo SHA.
2. anotado. `GET /usuarios/:id/sessoes` e `GET /auth/sessoes` são leitura e não passam pela vigência: coordenadora desativada ou rebaixada ainda lista contagem e datas por até 15 minutos, e um token de sessão revogada ainda lista as sessões vivas da própria conta. Só quantidade, datas e rótulo de aparelho. É a limitação F03-E03 já declarada.
3. anotado. O bloqueio por 5 falhas (15 minutos) é arma de negação: qualquer anônimo que conheça o e-mail de um administrador o bloqueia, e com a recuperação desligada só outro administrador desbloqueia (a redefinição zera `bloqueado_ate`). Pré-existente; o teto de 10 entradas por IP em 5 minutos limita o varejo, não um ataque distribuído.
4. anotado. Administrador redefine a senha e encerra sessões de outro administrador do mesmo município (200). É o desenho (posto igual); um administrador comprometido toma os pares. A trilha registra `senha_redefinida` com autor e alvo.
5. anotado. Não há reautenticação para redefinir a senha de outra pessoa; a `ConfirmarAcao` é o único freio de clique induzido. Aceitável com o achado 1 fechado.

## Não verificado

- Concorrência: duas redefinições simultâneas do mesmo alvo.
- Conta com segundo fator ativo passando pelas três rotas.
- Modo local (demonstração) no navegador.
- Cabeçalhos servidos de fato pela Vercel.

## Risco residual

Janela de 15 minutos de leitura com token de quem perdeu o acesso; bloqueio de conta como negação de serviço; ausência de CSP no painel.

## Motivo do humano

Não se aplica à dimensão red-team.
