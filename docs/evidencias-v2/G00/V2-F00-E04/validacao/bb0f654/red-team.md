---
validador: red-team (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E04
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [AUTH, AUTHZ, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---

## Critérios verificados

1. Conta desativada, papel rebaixado e sessão encerrada deixam de escrever com o token ainda vivo (objetivo e testes negativos da etapa), em toda rota de escrita e nos GET com efeito, inclusive as rotas que mudaram desde a rodada 3 (segundo fator, `servico.ts`, `tokens.ts`, `servidor.ts`).
2. A sessão rotacionada só vale enquanto a cadeia tem sessão de pé; reúso de renovação derruba a cadeia; senha provisória vencida nega na escrita.
3. Token do município B contra ocorrência do município A continua 404, e a conta desativada não confirma nada sobre o outro município.
4. Zero `skip` na vigência e os testes mordem (risco alto).

## Evidência

Todas as saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/red-team-E04-E05-E06-E08/`.

- Ambiente montado por mim: cluster PostgreSQL 17.6 (binários do scratchpad), papéis como no README (papel de setup com CREATEROLE e BYPASSRLS, papel de API sem superusuário e sem BYPASSRLS, membro de `dc360_app`), `npm run migrar` até a 050 (`migrar.log`, código 0), semente de desenvolvimento, API real (`npx tsx src/index.ts`) na porta 3791 com `DATABASE_URL` do papel de API (`api.log`). `npm run build:shared` rodou antes (mexe só em `dist`, ignorado pelo git).
- Lista de rotas: `rotas.mts` monta o servidor com o próprio `construirServidor` e o parser `rotasRegistradas` do repositório: 114 entradas (`rotas.json`).
- `varredura.mjs` (saída `saida-varredura.tsv`, código 0): cada rota com token (fora de `SEM_TOKEN`), GET e HEAD inclusive, em 7 estados de conta, com retrato md5 de TODAS as tabelas de `public` antes e depois de cada pedido (função de sonda criada no meu cluster, lida como superusuário, que não passa pela RLS). Controle sem pedido: nenhuma tabela mudou.
- `corrida.mjs` (saída `saida-corrida.txt`): escrita em voo contra desativação.
- Testes do repositório sem mutação: `t-api-base.txt` (7 arquivos, 107 de 107: vigência, GET com efeito, códigos, ofícios e avisos, integração do campo, suspensão, autor da evidência), `t-api-extra.txt` (segundo fator, senha provisória, superfície: 40 de 40).
- Mutações (todas desfeitas com `git restore`, `git status --short -- src` vazio depois de cada uma): `m1.txt`, `m2.txt`, `m3.txt`.

## Cenários positivos

- Quem está vigente escreve: a criação das contas de teste, a desativação, o encerramento e as escritas da Rita e da Helena responderam 200 ou 201 durante as sondas.
- Rotação sem encerramento não expulsa (coberto por `vigencia-na-escrita.test.ts`, verde em `t-api-base.txt`).

## Cenários negativos

Varredura (`saida-varredura.tsv`), 153 pedidos por estado: 51 rotas de escrita e 51 rotas GET, cada GET também em HEAD:

| Estado do token (conta administradora, para a permissão nunca barrar antes) | Escritas aceitas | Resposta de toda escrita |
| --- | --- | --- |
| conta desativada pela rota do painel (`PATCH /usuarios/:id/situacao`) | 0 de 51 | 403 `conta_desativada` |
| papel trocado no banco sem revogar | 0 de 51 | 401 `nao_autenticado` |
| papel rebaixado pela rota (`PATCH /usuarios/:id`) | 0 de 51 | 401 `nao_autenticado` |
| sessões encerradas por quem administra | 0 de 51 | 401 `sessao_encerrada` |
| reúso de renovação (cadeia derrubada), token novo da rotação | 0 de 51 | 401 `sessao_encerrada` |
| token ANTERIOR à rotação depois de a cadeia ser encerrada | 0 de 51 | 401 `sessao_encerrada` |
| senha provisória vencida no banco | 0 de 51 | 401 `sessao_encerrada` |

Os seis GET com efeito (laudo, laudo.pdf, termo de interdição e PDF, termo de desinterdição, CSV) e `GET /avisos` responderam a mesma recusa em GET e HEAD, sem mudar tabela nenhuma. As rotas novas desde a rodada 3 (`POST /segundo-fator/iniciar`, `/confirmar`, `/desativar`) estão entre as 51 e recusaram igual. Em todos os 7 x 153 pedidos, além do `GET /ocorrencias/:id` (registro da própria leitura, decisão registrada), o único pedido que mudou o banco foi `HEAD /ocorrencias/:id`, que também grava `ocorrencia_consultas` (ver Achados).

Isolamento: com a conta desativada de Serra Alta, `POST /ocorrencias/<id de Vale Fundo>/triagem` e o mesmo pedido num id inexistente deram 403 `conta_desativada` com corpo idêntico e tempo mediano 1,13 ms contra 1,12 ms (30 amostras); a coordenadora vigente de Serra Alta recebeu 404 com corpo idêntico ao do id inexistente; a ocorrência de Vale Fundo ficou intocada (`saida-e05.txt`).

## Tentativas de reprovar

1. Procurei rota de escrita que pule `exigirAutenticacao` ou valide corpo antes dela: todas as 51 escritas responderam o código de vigência mesmo com corpo `{}`, logo a vigência vem antes da validação em todas.
2. Procurei GET que escreve fora da lista `COM_EFEITO`, pelo retrato do banco inteiro e não por lista de tabelas: nenhum além do registro de consulta do dossiê.
3. HEAD de rota marcada: recusa igual ao GET.
4. Token anterior à rotação depois do encerramento da cadeia, e token novo depois de reúso: negam.
5. Rotas novas da correção 3 da E07 (segundo fator, `emitirPar`, leitor de corpo `corpo_invalido`): recusam pela vigência; o tratamento de `FST_ERR_CTP_*` acontece antes da autenticação, mas é recusa (4xx) sem escrita.
6. Disputa temporal (pedido em voo durante a desativação): REPRODUZIDA, ver Achados.
7. Mordida (risco alto), cada uma desfeita com `git restore`:
   - M1, `auth/vigencia.ts` sem `AND s.usuario_id = u.id`: 1 de 13 reprova em `vigencia-na-escrita.test.ts` ("token com o sid de OUTRA pessoa não escreve") (`m1.txt`).
   - M2, `exigirVigencia` sem a conferência da senha provisória vencida: `senha-provisoria.test.ts` reprova ("a escrita comum com a senha provisória vencida responde 401 sessao_encerrada") (`m2.txt`). Observação: `vigencia-na-escrita.test.ts` sozinho não pega esta mutação; outro arquivo pega.
   - M3, conta desativada conferida depois da sessão: 7 casos reprovam em três arquivos (`m3.txt`).

## Achados

1. **Corrige antes de crescer: a escrita que já passou pela vigência confirma DEPOIS da desativação.** A conferência é uma transação própria em `exigirAutenticacao`, e a escrita do handler é outra, sem reconferir. Reprodução (`corrida.mjs`, `saida-corrida.txt`): administradora A dispara `POST /usuarios`; a Rita desativa A; o pedido de A termina 201 e cria uma conta ADMINISTRADORA ativa. Em 8 de 8 rodadas (atraso de 0 a 120 ms), a transação que criou a conta COMEÇOU entre 101 e 223 ms depois de a desativação estar confirmada e respondida a quem desativou (a janela é o scrypt de `derivarSenha`, entre a vigência e o INSERT). A trilha mostra `usuario_desativado` e só depois `usuario_criado` com A como autor. Não quebra o critério escrito (o README diz "responde no pedido seguinte", e é verdade), por isso não é FAIL; mas é o mesmo tipo de disputa que a correção 3 da E07 fechou no login. Caminho natural: conferir a vigência dentro da transação de escrita, sob a trava da pessoa, quando a F03-E03 centralizar em `comTenant`.
2. **Anotado:** `HEAD /ocorrencias/:id` com token de conta desativada (ou qualquer estado acima) grava `ocorrencia_consultas`, como o GET. É coerente com a decisão registrada (dossiê e busca fora da marca até a F03-E03), mas o README e o comentário falam do GET; o HEAD do dossiê também deixa registro de leitura.

## Não verificado

- O run do CI do SHA (não lido nesta sessão); nada do meu critério depende dele.
- O roteiro de navegador "desativar no painel e ver o próximo POST falhar" (`npm run test:e2e:api`): não rodei; a parte de API foi provada por requisição real e a de tela é da E05.
- Município suspenso com a vigência: não refiz a sonda HTTP (coberto por `acesso-suspenso.test.ts`, verde em `t-api-base.txt`).
- Vigência em LEITURA pura: fora da etapa por decisão; confirmei que conta desativada ainda lê (por exemplo `GET /usuarios` 200), como o README diz.
- Fluxo de desafio do segundo fator com o recurso ligado: o servidor da sonda subiu com `SEGUNDO_FATOR_ATIVO=nao`; o caminho do desafio foi coberto só pelo arquivo `segundo-fator.test.ts` (verde) e por leitura de código.
- Produção em PostgreSQL 17 gerenciado com TLS: a sonda foi em 17.6 local sem TLS.

## Risco residual

A janela do achado 1 (até o fim do pedido em voo, cerca de 230 ms nas rotas com scrypt) permite a quem tem o token, no instante da desativação, ter uma escrita confirmada depois dela, inclusive criar conta administradora. A leitura continua sem vigência por até 15 minutos (F03-E03).

## Motivo do humano

Não há item humano na dimensão red-team desta etapa: tudo foi provado por execução. A decisão de quando fechar a disputa do achado 1 é de priorização, não de validação.
