---
validador: privacidade-lgpd (agente general-purpose com o papel da dimensão)
modelo: claude-sonnet-5-5
etapa: V2-F00-E09
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [LGPD, SEGURANCA, API, UI]
nivel_de_prova_exigido: [E1, E3a]
nivel_de_prova_obtido: [E1, E2, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
Aviso: não sou advogado e isto não é parecer jurídico. Cobre a parte técnica (inventário, fluxo, controles, evidência). Base legal, controlador, operador, DPO e prazo de retenção ficam para pessoa. `$SP` é a pasta de trabalho da sessão do gatekeeper (`.../scratchpad`).

## Critérios verificados

Nada herdado: reli o código no SHA e reexecutei tudo. O diff `4b96ea7..52952a1` toca o que importa para esta etapa em quatro pontos, todos avaliados abaixo: migrações 049 e 050 (sessões), `auth/sessoes.ts`, `auth/servico.ts` (renovação) e `MinhaConta.tsx`/`app.css`/`comuns.tsx` (correção 2 da E09).

### Inventário dos dados tocados

| Dado | Onde fica | Quem enxerga e como | Retenção |
| --- | --- | --- | --- |
| IP e user-agent (até 400 caracteres) da sessão | tabela `sessoes`, gravados por `abrir_sessao` (`db/migrations/050_login_e_suspensao_na_mesma_linha.sql`, o `INSERT` ao fim da função) | ninguém pela API: nenhuma rota seleciona `ip`; só `user_agent` é lido, e só para ser resumido | sem expurgo no código (grep de `DELETE FROM sessoes` em `apps` e `db`: só o teste de isolamento apaga). Fora do escopo por decisão do bloco (expurgo é F05-E12) |
| Aparelho em uma frase ("Chrome em Linux") | resposta de `GET /auth/sessoes` (`apps/api/src/rotas/autenticacao.ts:265`, `auth/servico.ts:1108`, `auth/aparelho.ts`) | só a PRÓPRIA conta: o SELECT filtra `usuario_id = identidade.usuarioId` sob `comTenant` | derivado, não guardado |
| Quantidade, última entrada, validade | `GET /usuarios/:id/sessoes` (`rotas/administracao.ts:614`) | `gerenciar_usuarios` (coordenador e administrador), `exigirPostoParaGerir`, 404 para outro município | derivado |
| Senha temporária | resposta única de `POST /usuarios/:id/redefinir-senha`; no banco só o hash scrypt e `senha_provisoria_ate` (72 h) | quem administra, uma vez, na janela `SenhaTemporaria` | hash até a troca |
| Autor, alvo, contagem de sessões encerradas | `trilha_administrativa` (append-only) | relatório de trilha | permanente por desenho |
| Trava consultiva por pessoa (049) | `pg_advisory_xact_lock(hashtext(...), hashtext(usuario_id))` | nada é gravado: trava de transação | só a transação |

### O que a migração 049 e a 050 mudam em termos de dado pessoal

Nada. Li as duas inteiras: nenhuma tabela, coluna, policy nem função `SECURITY DEFINER` nova; `abrir_sessao` continua gravando os mesmos campos (`left(coalesce(p_user_agent,''),400)` e `nullif(p_ip,'')::inet`). A trava usa só o hash do id; o teto de 27 funções privilegiadas fica intacto (`db/test/login-e-suspensao-na-mesma-linha.test.ts`). A 049 faz `encerrarSessoes` tomar a trava antes do UPDATE (`auth/sessoes.ts`), o que fecha a janela em que um token de quem foi encerrado por quem administra renovava (cadeia encerrada ainda emitia par). Do ponto de vista de privacidade isso é positivo: o encerramento pedido pelo titular ou por quem administra passa a valer de verdade.

### Controles reverificados

1. Minimização da lista própria: `GET /auth/sessoes` devolve `entrouEm`, `validaAte`, `aparelho`, `atual`. Sem IP, sem user-agent, sem identificador de sessão ou de família.
2. Minimização da lista de terceiros: só `count`, `max(entrada da família)`, `max(expira_em)`.
3. Quem vê o quê: operador e agente de campo levam 403 `sem_permissao`; posto igual ou acima, 403 `posto_insuficiente`; município de outro: 404 igual ao de id inexistente.
4. Senha temporária: sorteada no servidor (`auth/senha.ts`), devolvida uma vez, nunca na trilha; no painel só em estado React (`Usuarios.tsx:73,486-493`, `SenhaTemporaria` 680-730), sem `localStorage`/`sessionStorage` (os usos de armazenamento do painel são só tokens de sessão em `sessionStorage`, tema e marca de semente em `localStorage`), sem `console.*` com ela, janela não fecha por clique fora.
5. Correção 2 da E09 (botão que quebra linha, foco na confirmação): só CSS, componente `Aviso` e foco. Não introduz dado novo nem armazenamento.

## Evidência

- `cd dc360 && npm run build:shared` (código 0, `$SP/val/privacidade-lgpd/00-build-shared.txt`).
- API, `npx vitest run` em 11 arquivos de sessão, senha e recuperação (`sessoes-da-conta`, `familia-da-sessao`, `senha-e-sessoes`, `senha-provisoria`, `log`, `recuperacao`, `recuperacao-desligada`, `recuperacao-em-producao`, `recuperacao-sem-oraculo`, `notificador-http`, `renovacao-contra-encerramento`): 148 passaram, 9 pulados por ambiente (os 9 de Postgres real de `renovacao-contra-encerramento`, que dependem de `DC360_POSTGRES_DE_PROVA`; o job do CI os roda), 0 falha. Saída: `$SP/val/privacidade-lgpd/10-api-sessoes-recuperacao.txt`.
- Painel, `npx vitest run --root apps/web` em `recuperar-senha`, `recuperar-senha-e-sessao`, `seguranca-da-conta`, `paridade-dos-modos`, `minha-conta-estreita`: 74 de 74 (`80-web.txt`).
- Navegador contra a API real: `node scripts/e2e-api.mjs chromium` (E2): suíte principal 288 aprovadas, 0 falha; geometria 64 aprovadas, 0 falha (`30-e2e-api-chromium.txt`). Seção 26 (E09), linhas relevantes: "a lista mostra o navegador em uma frase e nao entrega IP nem o texto do user-agent", "a senha esta em fonte tabular", "clicar fora NAO fecha a janela da senha", "ao fechar, a senha some da tela", "o agente de campo recebe 403 sem_permissao nas tres rotas", "o token de renovacao do aparelho antigo morreu", "e o token de acesso dele nao escreve mais: 401 sessao_encerrada". Processos derrubados (conferi `lsof`).
- Sonda própria `$SP/val/privacidade-lgpd/sonda-sessoes.mts` (`12-sonda-sessoes.txt`): dois logins da mesma conta, um com user-agent HOSTIL (`Chrome ... token=SEGREDO-123 helena.coutinho@... 198.51.100.77`) vindo do endereço 198.51.100.77. `GET /auth/sessoes` devolveu `{"itens":[{"aparelho":"Chrome em Linux","atual":true,...},{"aparelho":"Safari em iOS","atual":false,...}]}`; o corpo não contém o IP, nem texto do user-agent, nem `@`.
- Mordida dos testes de privacidade (mudei o código, rodei, `git restore`):
  - M4 (`aparelho: l.user_agent ?? ""` no lugar de `resumirAparelho`): 4 de 27 vermelhos em `sessoes-da-conta.test.ts`, entre eles "não entrega IP, user-agent completo nem identificador de sessão" (`73-mut-M4.txt`).
  - M5 (comentei `exigirPostoParaGerir` em `GET /usuarios/:id/sessoes`): 1 vermelho, "posto igual ou acima: 403 posto_insuficiente" (`74-mut-M5.txt`).
  - Árvore depois de restaurar: `git status --porcelain | grep -v '^??'` vazio.

## Cenários positivos

Pessoa vê as próprias sessões com a marca "esta" e o aparelho em uma frase; coordenador vê a contagem de quem está abaixo; administrador redefine a senha, vê a senha uma vez, a agente entra com a temporária e só alcança a troca; "encerrar minhas outras sessões" derruba o segundo navegador e mantém este.

## Cenários negativos

Outro município: 404; posto igual ou acima: 403 `posto_insuficiente`; operador e agente: 403 `sem_permissao`; `autoredefinicao` e `autoencerramento`: 422; sem token: 401. Defeitos das rodadas 1 e 2 desta dimensão: nenhum era de bloqueio (todos "anotado"), e reexecutei os que têm reprodução: IP/UA sem expurgo (ainda sem expurgo, ver achado 1), redefinição por link sem trilha (ainda sem trilha, ver achado 2), filtro de segredo do baseline (ainda não cobre `?token=`, `senhaTemporaria`, `scrypt$`, e-mail e CPF: `50-redigir.txt`, ver achado 3). Nenhum deles é regressão desta rodada.

## Tentativas de reprovar

- Procurei IP ou user-agent bruto em qualquer campo de saída das duas rotas de leitura, com user-agent hostil carregando e-mail, token e IP: não sai.
- Procurei caminho para quem administra ver o aparelho de terceiro: a única rota que lista aparelho filtra pela identidade do token; a de terceiros não seleciona a coluna (mutação M5 prova que a guarda de posto é a única barreira de posto e que o teste a cobra).
- Procurei na 049 e na 050 coluna, tabela ou função nova que ampliasse o que é guardado: não há; o `FOR SHARE` da 050 só muda a leitura da suspensão no login.
- Procurei efeito colateral da trava na privacidade (encerramento que não encerra): a 049 fecha exatamente isso; `renovacao-contra-encerramento.test.ts` roda 5 casos em PGlite e 9 em Postgres real (estes pulados aqui, verdes no CI).
- Procurei a senha temporária no armazenamento do navegador, no console, na trilha e na evidência arquivada: o único texto de senha é a fixture sintética `corvo-lento-praia` em `V2-F00-E09/diff-da-etapa.patch:1259`.
- Procurei rota irmã sem guarda (outro método em `/usuarios/:id/sessoes`): só o GET existe.
- Não consegui quebrar nada na dimensão.

## Achados

1. anotado (herdado, sem dono de código antes da F05-E12). IP e user-agent bruto ficam em `sessoes` sem prazo, inclusive de sessões revogadas e vencidas. `dc360/docs/PRIVACIDADE.md` não lista essa coleta (o texto trata de outras categorias) e `apps/api/PENDENCIAS.md` (seção "Sessões no painel") diz que as rotas não devolvem IP, mas não registra a ausência de prazo. Sugiro acrescentar uma linha em `PRIVACIDADE.md` com o que é guardado, para quê (investigação de incidente) e que o prazo é decisão do município; o prazo em si é jurídico.
2. anotado. A redefinição por link de e-mail não grava na trilha administrativa (F03).
3. corrige antes de crescer (transversal, E01/E22 e F01): `redigir` em `dc360/scripts/baseline.mjs:683` e `PADROES_DE_SEGREDO` em `scripts/roadmap/conferir-evidencia.mjs:77` não mascaram `?token=`, `senhaTemporaria`, token de renovação, `scrypt$`, e-mail nem CPF. Reprodução: `node $SP/val/privacidade-lgpd/red.mjs`. Hoje as saídas arquivadas estão limpas (varredura em `51-varredura-evidencia.txt`), exceto o que está no achado 3 da E10.
4. anotado. A senha temporária é conhecida por quem a sorteou e pode ficar na área de transferência de quem copiou (IDN-18, `PENDENCIAS.md`).

## Não verificado

- Mordida das mutações no nível do navegador (só testes de API e unidade mordem; o e2e passa, mas não o mutei).
- Renovação contra encerramento em Postgres real: 9 casos pulados aqui; confiei no CI (job "A API sobe contra Postgres real", verde) como alegação, não como prova minha. Não subi Postgres 17 descartável.
- Painel renderizado e capturas: ficam para UX e acessibilidade.
- Leitor de tela (CP-32), Firefox (não instalado).
- Concorrência de duas redefinições do mesmo alvo.
- Base legal do tratamento de IP e user-agent, prazo de retenção, aviso de privacidade: pessoa.

## Risco residual

Baixo. IP e user-agent retidos sem prazo; senha temporária conhecida por quem a sorteou; a lista de segredos do baseline é curta.

## Motivo do humano

Prazo de retenção de IP e user-agent de sessão e a base legal do tratamento são decisão jurídica (CP-10). Rafael confere o fluxo e a frase da senha única (campo "Validação humana" do bloco).
