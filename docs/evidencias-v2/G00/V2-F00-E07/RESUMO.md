# V2-F00-E07: Papel alterado, sessão rotacionada e senha provisória

Situação: IMPLEMENTADA E MEDIDA em 2026-10-06; FALTA A VALIDAÇÃO HUMANA (Rafael vê as três sondas antes e depois, ver abaixo). Por isso a etapa está EM ANDAMENTO no STATUS e os itens "papel alterado", "sessão revogada" e "senha provisória" do G00 não foram marcados (só se marca no próprio gate).

## O que foi entregue

Banco:
- `dc360/db/migrations/047_familia_da_sessao.sql`: coluna `sessoes.familia_id` (backfill `familia_id = id`, padrão `gen_random_uuid()`, não nula), índice parcial `sessoes_familia_viva_idx` (onde `revogada_em IS NULL`) e `abrir_sessao` recriada com o sétimo parâmetro opcional (a família a herdar). A assinatura antiga SAIU (DROP) em vez de ficar ao lado: duas versões somariam uma ao teto de 27 funções `SECURITY DEFINER` de `isolamento.test.ts`, que não mudou. A função só aceita herdar uma família do MESMO usuário e do MESMO município e recusa as outras com o mesmo erro (`DC369`, sem dizer qual condição falhou). A recusa de município suspenso (038) foi preservada.

API:
- `auth/vigencia.ts`: a sessão rotacionada só conta como viva se a família dela ainda tem sessão com `revogada_em IS NULL`; papel do banco diferente do token deixou de ser `sessao_encerrada` e passou a 401 `nao_autenticado` (o cliente renova e repete), conferido DEPOIS de conta desativada, sessão encerrada e provisória vencida (quem foi rebaixado E derrubado entra de novo).
- `auth/servico.ts`: `renovar` lê a família sob tenant (antes da rotação) e a passa a `emitirPar`/`abrir_sessao`; `trocarSenha` lê `senha_provisoria_ate` na mesma consulta da senha atual e recusa com 401 `sessao_encerrada` quando o prazo passou, sem depender da rota; `FalhaAutenticacao` ganhou o código `nao_autenticado`.
- A troca de papel NÃO revoga sessões (decisão, ver abaixo).

Painel (necessário para o critério "a próxima ação renova em silêncio e passa a ter só as ações do papel novo"):
- `apps/web/src/dados/http.ts`, `tipos.ts`, `local.ts`, `repositorio.ts`: `aoRenovar` (mesmo desenho de `aoExpirar`): a renovação avisa a tela do papel e do nome que o servidor devolveu.
- `apps/web/src/estado/sessao.tsx`: o provedor se inscreve e atualiza a sessão da tela só quando algo mudou. Sem isso o servidor passaria a recusar com 403 o que o botão ainda oferece.

Testes (todos novos, mais 5 reescritos no lugar com registro):
- `apps/api/test/familia-da-sessao.test.ts` (20 casos): cadeia (renovação normal, várias rotações, administrador, própria pessoa, sair, reuso, troca de senha, família por login, o que o banco guarda), papel (rebaixado, promovido, não revoga sessões, sessão encerrada vence papel, isolamento A x B, B sem ganho em A), provisória (no prazo, vencida pela rota, vencida pelo SERVIÇO, senha comum segue trocando).
- `db/test/familia-da-sessao.test.ts` (12 casos): backfill sobre sessões antigas, coluna não nula, índice, `abrir_sessao` de seis e de sete argumentos, recusa de família alheia nas três formas, suspensão intacta, uma só função, teto de definers, permissões, RLS.
- `apps/web/test/sessao-e-entrada.test.ts` (+2 casos e 1 reescrito) e a seção 24 de `apps/web/test/fluxo-api.e2e.mjs` (9 verificações).
- Reescritos no lugar: `codigos-de-erro.test.ts` (papel é `nao_autenticado`), `vigencia-na-escrita.test.ts` (idem), `sessao-e-entrada.test.ts` (papel mudado). Registro em `docs/DECISOES-DE-TESTE-DA-FASE-00.md`. Nenhuma asserção foi enfraquecida.

Roteiro e documentação: `dc360/scripts/baseline.mjs` e `baseline.test.mjs` (esperado por etapa também para o banco: `BASE_DO_TESTE_DB`; API +20, web +2, banco +12), `dc360/README.md` (autenticação, cadeia da sessão, papel), `dc360/apps/api/PENDENCIAS.md` (as decisões da E07), `dc360/apps/campo/PENDENCIAS.md` (decisão sobre o 403 `troca_de_senha_obrigatoria`), `dc360/docs/DICIONARIO-DE-DADOS.md` (coluna nova), `dc360/docs/COLOCAR-DE-PE.md` (ordem do deploy: migrar ANTES do código; o código antigo contra o banco migrado funciona).

## O que sobrou de `senha-provisoria.test.ts:183` e da classificação da E03

O caso ficou verde sozinho na E04 e continua como está. O que a E07 acrescentou é o par que faltava: `trocarSenha` recusa por conta própria (teste pelo serviço, vermelho antes do conserto). A linha V-API-1 da classificação da E03 fica fechada. Entrar e renovar com a provisória vencida já recusavam.

## As três sondas, antes e depois

Antes do conserto (testes novos contra o código da E06, `saidas/02-sonda-antes-do-conserto.txt`): 11 dos 20 casos reprovam e 9 passam (guardas que já passavam).

| Sonda | Antes | Depois |
| --- | --- | --- |
| Sessão rotacionada: admin, própria pessoa, sair, reuso e troca de senha encerram a cadeia; o token de acesso de ANTES da renovação ainda escrevia | 200 em todos (6 casos reprovam) | 401 `sessao_encerrada` em todos; renovação normal continua escrevendo nos dois tokens |
| Papel rebaixado ou promovido: o token velho | 401 `sessao_encerrada` (entre de novo) | 401 `nao_autenticado`; `/auth/renovar` devolve o papel novo; operador abre ocorrência (201) e não despacha (403 `sem_permissao`); A rebaixado não vê nada de B (404) |
| Senha provisória vencida no meio, pelo serviço | `trocarSenha` trocava (sem erro) | 401 `sessao_encerrada`, hash intacto; no prazo troca; senha comum troca |
| Colunas da cadeia | coluna inexistente | `familia_id` = `id` no login, herdada na renovação, nova a cada login |

Para reproduzir (Rafael): em `dc360`, `npx vitest run --root apps/api test/familia-da-sessao.test.ts` passa 20 de 20. Para ver o ANTES, tire o `AND EXISTS (...)` da consulta de `sessao_viva` em `apps/api/src/auth/vigencia.ts` (deixando só `OR s.motivo_revogacao = 'rotacionada na renovacao'`) e rode o mesmo arquivo: 7 dos 20 casos reprovam (os de cadeia, com 200 onde se espera 401; medido). Restaure e rode de novo.

## Resultados medidos (2026-10-06)

| Passo | Antes (repetido hoje) | Depois |
| --- | --- | --- |
| `npm run test:api` | 1134 testes, 1 falha (laudo do pacote, E12), 13 pulados | 1154 testes, 1 falha (a mesma), 13 pulados (`banco-tls`); 1140 passam |
| `npm run test:isolamento` | 318, 3 pulados | 330 testes: 327 passam, 3 pulados por ambiente (12 novos, `isolamento.test.ts` intacto) |
| `apps/api/test/superficie.test.ts` | verde | 9 de 9 |
| `packages/shared` | 159 com 1 falha pré-existente (E20) | igual |
| `packages/campo` | 187 | 187 |
| `apps/web` | 557 com 14 falhas (E09, E13, E21) | 559 com as MESMAS 14 |
| `apps/console` | 259 | 259 |
| `npm run test:campo` | sai 2, os 2 erros de tipo do `.expo` (E21) | igual |
| jest do app de campo | 1836 com 20 falhas (E14 a E16) | igual |
| `test:scripts` | 198 com 3 falhas (E17) | igual (198, 3 falhas, 4 pulados) |
| `baseline.test.mjs` e `portao-de-skip.test.mjs` | 33 de 33 | 33 de 33 |
| `conferir:numeros` | 13 afirmações | 13 (a seção 24 somou 9 verificações do painel contra a API, de 103 para 112; o README foi corrigido no mesmo passo) |
| `baseline.mjs --so=teste-shared,teste-db,teste-campo-pacote,teste-api,teste-web` | | 5 de 5 `confere` (`saidas/baseline-depois/`) |
| `npm run test:e2e:api` | 40 `OK`, cai na seção 13 (CORS do PUT, E18) | 40 `OK`, cai na mesma seção 13 (`saidas/18-e2e-api-completo.txt`) |
| `regras-de-conteudo.test.ts` | só as linhas pré-existentes | só elas |
| `typecheck` | verde | verde |

## Postgres real (ensaio de `migrar` mais `--conferir`)

O ambiente não tem Docker nem acesso ao Postgres 18 que roda na máquina (porta 4002, senha desconhecida), então o ensaio usou os binários do PostgreSQL 18.3 instalados para subir um cluster DESCARTÁVEL numa pasta temporária, com porta e senha próprias, apagado no fim. É Postgres de verdade, mas é a versão 18, e não a 16 do CI nem a 17.6 da produção (ver a matriz de versões em `COLOCAR-DE-PE.md`).

- Banco do zero: `npm run migrar` aplicou 001 a 047 (`saidas/20-migrar-do-zero.txt`) e `--conferir` respondeu "Esquema em dia" (`21`).
- Banco existente: criado até a 046 pelo próprio aplicador, com 3 sessões antigas (uma viva, uma rotacionada, uma de outro município); `--conferir` antes acusou a pendente (saída 1, `22`); `npm run migrar` aplicou só a 047 (`23`); `--conferir` depois: "Esquema em dia" (`24`).
- Sondas no banco real (`saidas/25-sondas-do-banco-real.txt`): as 3 sessões antigas ficaram com `familia_id = id`; coluna não nula com padrão; índice parcial; UMA `abrir_sessao` de sete argumentos; 27 funções `SECURITY DEFINER` (o teto); `dc360_app` executa e `dc360_console` não; como `dc360_app`, o login abre família nova, a renovação herda, e a família do outro município, a do outro usuário e a inexistente recebem o mesmo erro sem gravar nada.
- Depois de o arquivo da migração ser convertido para CRLF (padrão do repositório), `--conferir` continuou "Esquema em dia" nos dois bancos (a soma de verificação ignora espaço em branco).

## Capturas reais (Playwright, Chromium, painel)

`capturas/`: 8 imagens da tela Minha conta de Helena (coordenadora logada, rebaixada para operador pela administradora com a tela aberta): ANTES da escrita (papel "Coordenador", menu com Usuários) e DEPOIS (a troca de senha passou depois de 401, renovação e repetição; "Operador de plantão" e o menu sem Usuários), em 1280 e 390, claro e escuro. A de 1280 claro depois traz o aviso "Senha trocada" ainda na tela. Roteiro: seção 24 provada numa cópia aparada do arquivo (`sondas/e2e-aparado-secao-24.mjs`) contra uma API recém-semeada e o painel construído: 9 de 9 `OK` e zero erro de console (`saidas/06-e2e-secao-24-em-api-limpa.txt`). O `e2e-api` completo não chega à seção 24 porque cai na 13 (E18), igual ao baseline.

Portão visual: nada desalinhado, grudado ou cortado nas duas larguras e nos dois temas. Esta etapa NÃO cria tela nova nem texto novo: a mudança visível é só o papel e o menu acompanharem a renovação. Não há estado vazio nem de erro novos para capturar (o erro, 401 de sessão morta, é o da E05, já capturado lá). No celular, o menu de baixo rola na horizontal e corta o último item na borda, como já fazia antes (fora do escopo). App Expo: sem captura, o Expo não renderiza neste ambiente, e a etapa não mexe no aplicativo (a E06 já trata `nao_autenticado`: renova uma vez e repete). Pendência de foto de aparelho: não há mudança de tela no app nesta etapa; a prova de que o papel alterado não perde coleta na fila fica coberta pelo teste de integração da E06 (`campo-integracao.test.ts`) e pela renovação única do `token.ts`.

## Decisões (registradas, não deixadas ao acaso)

1. A troca de papel NÃO revoga sessões. A segurança não depende disso: a escrita confere o papel do banco, então o token velho não escreve com o papel antigo, e a renovação entrega o token novo sem a pessoa (nem a fila do campo) notar. Revogar obrigaria a entrar de novo com coleta na fila. Escrita em `apps/api/PENDENCIAS.md` e no README.
2. Papel diferente do token é 401 `nao_autenticado`, e não `sessao_encerrada` (que era a escolha da E05). Três testes reescritos no lugar com registro.
3. `troca_de_senha_obrigatoria` (403) na fila do campo: FICA FORA, anotado. A E07 mexe só na vigência da API; o aplicativo praticamente não chega a esse 403 (quem entra com provisória é mandado ao painel, e redefinir a senha derruba as sessões, que já é pausa); tratá-lo como pausa sem tela de troca de senha no app deixaria o item parado sem saída. Reabrir junto com essa tela. Em `apps/campo/PENDENCIAS.md`.
4. A migração é aditiva e deve rodar ANTES do código novo (o código novo contra banco sem a 047 quebraria todo login; o antigo contra o banco migrado funciona).

## Limitações

- Janela de milissegundos na própria renovação: entre `revogar_sessao` (a antiga) e `abrir_sessao` (a nova) a família não tem sessão viva, e uma escrita com o token antigo nesse intervalo leva 401 `sessao_encerrada`. A fila do campo mantém o item pendente e a pessoa entra de novo; fechar a janela exige renovar numa só transação (F03-E02). Documentado em `apps/api/PENDENCIAS.md`.
- A vigência continua só na ESCRITA: a leitura com token vivo segue pela assinatura até a F03-E03 (um coordenador rebaixado ainda LÊ o que o papel antigo lia por até 15 minutos).
- O E2E de navegador da seção 24 foi provado em cópia aparada, não no roteiro completo (cai na seção 13, E18).
- O Postgres do ensaio é o 18.3 local, não o 16 do CI nem o 17.6 da produção; o CI não foi rodado (repositório privado, `gh` sem login).
- O diff `diff-da-etapa.patch` é contra o `HEAD` e, nos arquivos já alterados pelas etapas E04 a E06 (nada está commitado), traz também os trechos delas; os arquivos novos da E07 aparecem inteiros.
- Sem foto de aparelho (o app não mudou).

## O que falta

- Validação humana: Rafael vê as três sondas antes e depois (reproduzir como acima) e confere as capturas.
- Itens "papel alterado", "sessão revogada" e "senha provisória" do G00: só no gate.
- Implantação: E04, E05, E06 e E07 vão juntas, com a migração 047 aplicada antes do código.

## Premissas assumidas

Ver STATUS, seção 9 (V2-F00-E07).
