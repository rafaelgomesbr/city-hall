---
validador: privacidade-lgpd
modelo: claude-sonnet-5-5
etapa: V2-F00-E09
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [LGPD, SEGURANCA, API, UI]
nivel_de_prova_exigido: [E1, E3a]
nivel_de_prova_obtido: [E1, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
Aviso: não sou advogado e isto não é parecer jurídico. Cobre a parte técnica (inventário, fluxo, controles, evidência). Base legal, papéis de controlador e operador e prazo de retenção ficam para pessoa.

## Critérios verificados

Inventário dos dados tocados (nada herdado da rodada 1; reli o código no SHA):

| Dado | Onde | Sai da API? | Retenção |
| --- | --- | --- | --- |
| entrada, validade, user-agent bruto e IP da sessão | tabela `sessoes` | só `entrouEm`, `validaAte`, `aparelho` (frase resumida) e `atual`, e só para a PRÓPRIA conta (`GET /auth/sessoes`) | sem expurgo hoje (F05-E12, declarado fora do escopo) |
| quantidade de sessões, última entrada, validade | `GET /usuarios/:id/sessoes` | sim, só isso, sem aparelho e sem IP | idem |
| senha temporária | resposta única de `POST /usuarios/:id/redefinir-senha` | uma vez | só o hash scrypt no banco; prazo de 72 h em `senha_provisoria_ate` |
| autor, alvo (id e nome), contagem de sessões encerradas | `trilha_administrativa` | via relatório de trilha | append-only |

Controles e onde estão:

1. Minimização da listagem própria: `apps/api/src/auth/servico.ts:1063-1085` (`listarMinhasSessoes`). O SELECT lê `user_agent`, o mapeamento devolve só `entrouEm`, `validaAte`, `aparelho: resumirAparelho(...)` e `atual`. O IP nem é selecionado. `apps/api/src/auth/aparelho.ts` resume por lista fechada (navegador e sistema; texto sem padrão vira "Aparelho não identificado"), então um user-agent hostil não faz o servidor devolver o texto dele.
2. Minimização da listagem de terceiros: `apps/api/src/rotas/administracao.ts:614-655`. Agrega `count`, `max(criada_em da família)` e `max(expira_em)`. Nenhuma coluna de IP nem de aparelho. Quem administra não vê o aparelho de ninguém (decisão IDN-29 comentada na rota).
3. Quem vê a sessão de quem: a rota de terceiros exige `gerenciar_usuarios` (só coordenador e administrador, `packages/shared/src/permissoes.ts:97-130`) antes do banco, depois `exigirPostoParaGerir` (posto igual ou acima: 403 `posto_insuficiente`). O alvo é lido sob `comTenant(quem.organizacaoId)`, então conta de outro município não aparece: 404 igual ao de id inexistente. Operador e agente de campo não têm a permissão: 403 `sem_permissao`. A lista própria filtra `usuario_id = identidade.usuarioId` sob o tenant do token, então nem o administrador de outro município nem um colega alcança a lista de alguém por esta rota.
4. Senha temporária só uma vez e nunca persistida:
   - O servidor sorteia 60 bits (`apps/api/src/auth/senha.ts:127-139`, `randomBytes`, alfabeto de 32 símbolos, sem viés de módulo), guarda só o hash e devolve o texto uma única vez (`administracao.ts:520-530`). A resposta sai com `cache-control: no-store` (hook global de `servidor.ts`).
   - A trilha grava `depois: { sessoesEncerradas, ativo }` (`administracao.ts:509-515`), sem senha e sem hash, na mesma transação.
   - O corpo de resposta não é logado (o serializador de `req` do Fastify só leva método, caminho, host e endereço; `CAMINHOS_REDIGIDOS` cobre o que entra).
   - No painel a senha vive só no estado React de `Usuarios.tsx` (`senhaGerada`, linhas 73, 486-493) e em `SenhaTemporaria` (linhas 680-730). `grep` por `localStorage` e `sessionStorage` em `apps/web/src`: o `sessionStorage` guarda só os tokens de sessão (`dados/http.ts:41-51`, `estado/sessao.tsx`) e o `localStorage` só a marca de semente e o tema. Nenhum guarda a senha. Nenhum `console.*` em `apps/web/src` leva a senha (os dois existentes são o aviso de rótulo de `ConfirmarAcao` e o de IndexedDB do modo local). Sem SDK de telemetria no painel (grep sem resultado).
   - Fechar a janela apaga o estado; clicar fora não fecha (o e2e prova: "clicar fora NAO fecha a janela da senha" e "ao fechar, a senha some da tela").
   - Modo local (demonstração): `local.ts:463` `redefinirSenhaDeUsuario` lança em vez de gerar senha, então nada é gravado no IndexedDB.
5. Mudança desde a rodada 1 que toca esta etapa: `apps/api/src/auth/sessoes.ts` agora preserva a CADEIA (`familia_id`) da sessão de quem pede em "encerrar as outras" (migração 047), e `tratarTokenRecusado` (`servico.ts:~720-780`) devolve `conta_desativada` só a quem apresenta token que o servidor reconhece (token desconhecido continua `sessao_encerrada`, sem oráculo). Nenhum dos dois amplia o que sai nas listas.

## Evidência

- `cd dc360 && npx vitest run --root apps/web test/recuperar-senha.test.ts test/recuperar-senha-e-sessao.test.ts test/seguranca-da-conta.test.ts test/paridade-dos-modos.test.ts`: 4 arquivos, 58 testes, 0 falha (`scratchpad/lgpd/web.txt`). Entre eles `seguranca-da-conta.test.ts` (os 8 casos da etapa) e `paridade-dos-modos.test.ts` (10).
- Linha de base completa no SHA (17 de 17, `scratchpad/baseline/`): `05-teste-api.txt` mostra `sessoes-da-conta.test.ts` com 27 testes verdes (entre eles "não entrega IP, user-agent completo nem identificador de sessão", "só a própria conta: a de outra pessoa e a de outro município não aparecem", "a administradora vê a quantidade e as datas, e nada do aparelho", "conta de outro município: 404, igual a id que não existe", "o operador e o agente de campo não têm a ação: 403 sem_permissao nas três rotas", "redefinir a própria senha e encerrar as próprias sessões por esta via: 422"); suíte inteira 99 arquivos, 1299 testes, 0 falha. `17-e2e-api.txt`, seção 26: 48 verificações OK, entre elas "a lista mostra o navegador em uma frase e nao entrega IP nem o texto do user-agent", "a senha esta em fonte tabular", "ao fechar, a senha some da tela" e "o agente de campo recebe 403 sem_permissao nas tres rotas"; total 279 aprovadas, 0 falha.
- `scratchpad/lgpd/red.mjs`: ver achado 3 (redação de saída de teste).

## Cenários positivos

Lista da própria conta marca a atual e mostra uma linha por família; coordenadora vê contagem de quem está abaixo; administradora redefine a senha, vê a senha uma vez, a agente entra com a temporária e só alcança a troca.

## Cenários negativos

Outro município: 404; posto igual ou acima: 403 `posto_insuficiente`; agente e operador: 403 `sem_permissao`; id que não é uuid: 422; sem token: 401; `autoredefinicao` e `autoencerramento`: 422 (testes e e2e acima).

## Tentativas de reprovar

- Procurei IP ou user-agent bruto em qualquer campo das duas respostas de leitura, na trilha e no mapeamento: não há (código e teste).
- Procurei caminho para o administrador, ou o coordenador, ver o aparelho de terceiro: a única rota que lista aparelho filtra pela identidade do token; a de terceiros não seleciona a coluna.
- Procurei a senha temporária no armazenamento do navegador, no console, na trilha, no log da API e em evidência arquivada: o único registro de texto de senha no repositório é fixture de teste (`diff-da-etapa.patch`, `senhaTemporaria: "corvo-lento-praia"`), sintética.
- Procurei rota irmã sem a mesma guarda (outro método HTTP em `/usuarios/:id/sessoes`): só o GET existe.
- Procurei cadeia com `$3` nulo em `encerrarSessoes` para o caso de quem administra: `$3::uuid IS NULL` derruba tudo, como deve.
- Não consegui quebrar nada na dimensão. Prova de que o teste morde (desfazer o conserto e ver vermelho) NÃO foi refeita por mim: a rodada proíbe modificar o repositório. Risco da etapa é médio, então a exigência de mordida não é obrigatória na seção 8.

## Achados

1. anotado. IP e user-agent bruto seguem em `sessoes` sem prazo até a F05-E12 (declarado fora do escopo). Sem regressão.
2. anotado. A redefinição por link de e-mail não grava na trilha administrativa (F03). Só o ato por administrador deixa rastro.
3. corrige antes de crescer (transversal, vale também para E10 e E17). `redigir` de `dc360/scripts/baseline.mjs:599-616` mascara JWT, Bearer, Basic, credencial em URL, pasta de usuário do Windows e travessão. NÃO mascara `?token=` de link de recuperação, `senhaTemporaria`, token de renovação (não é JWT), hash `scrypt$`, e-mail nem CPF (verifiquei com amostras em `scratchpad/lgpd/red.mjs`). O `conferir-evidencia.mjs:77-84` tem a mesma lista curta. Hoje as saídas da linha de base conferidas estão limpas (grep de JWT, `token=`, CPF, `scrypt$` e e-mail em `scratchpad/baseline/*.txt`: só um e-mail de fixture do console), mas a saída de uma FALHA do e2e imprime `extra` cru (`fluxo-api.e2e.mjs:48-51`) e pode levar a senha temporária ou o link. Ampliar as regras antes de arquivar saída de falha.
4. anotado. A senha temporária é conhecida por quem a sorteou e pode ficar na área de transferência de quem clicou em copiar (fora do controle do produto). Registrado como IDN-18 em `PENDENCIAS.md`.

## Não verificado

- Mordida independente do teste de privacidade (restrição desta rodada: não modifico o repositório; os testes de API usam o banco que outro validador ocupa). Cito a execução da linha de base e as saídas ANTES/DEPOIS do implementador apenas como alegação.
- Painel renderizado no navegador por mim: a evidência é o e2e da linha de base (E1) e a leitura do código; as capturas ficam para UX.
- Concorrência de duas redefinições do mesmo alvo.
- Base legal, controlador e operador, aviso de privacidade, DPO: pessoa.

## Risco residual

Baixo. IP e user-agent retidos sem prazo; senha temporária conhecida por quem a sorteou.

## Motivo do humano

Prazo de retenção de IP e user-agent de sessão, base legal do tratamento e o texto do aviso de privacidade são decisão de pessoa (e de advogado). Rafael confere o fluxo e a frase da senha única (campo "Validação humana" do bloco).
