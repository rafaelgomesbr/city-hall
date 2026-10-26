# V2-F03-E04: domínio de papel no banco e o papel `usuario_orgao` (parte 1A do lote 1)

Ramo `trab/f03-1a-e04-papel`, base `origin/v2/f03` (8e29684f). Plano: `docs/roadmap-v2/retomada/plano-f03.md`, lote 1, parte 1A. Norma de trabalho: ADR 0009 (PROPOSTA), decisão 5. Risco ALTO (migração).

## Fatos

### Banco: migração 053 e a volta

- `dc360/db/migrations/053_dominio_de_papel_e_usuario_orgao.sql`:
  - três domínios: `papel_de_conta` (os quatro papéis de servidor mais `usuario_orgao`), `papel_de_autor_administrativo` (esses cinco mais `operador_da_plataforma`) e `tipo_de_ator` (`servidor`, `usuario_orgao`, `sistema`; nenhuma coluna o usa ainda, é da E06);
  - as quatro colunas (`usuarios.papel`, `trilha_eventos.autor_papel`, `ocorrencia_consultas.usuario_papel`, `trilha_administrativa.autor_papel`) trocam o CHECK solto pelo domínio e continuam NOT NULL;
  - `trilha_eventos.origem` ganha `portal` (continua `text` com CHECK);
  - gatilho `usuarios_papel_nao_se_converte` (`BEFORE UPDATE OF papel`, função SECURITY INVOKER) recusa `usuario_orgao` para servidor e servidor para `usuario_orgao`, com `check_violation` e a constraint `papel_nao_se_converte`.
- `dc360/db/migrations/desfazer/053_dominio_de_papel_e_usuario_orgao.sql`: devolve os cinco CHECKs com os mesmos nomes e listas, e RECUSA (sem apagar nem reescrever histórico) se já existir conta `usuario_orgao`, autor `usuario_orgao` ou origem `portal`.
- Não cria função SECURITY DEFINER, exceção ao isolamento nem UPDATE por coluna: `db/test/catalogo/f03-e04.ts` fica sem entradas, com o motivo escrito, e o teste da migração prova que o conjunto de SECURITY DEFINER, a ACL de coluna, a RLS e as policies são idênticos antes e depois.
- A troca de `text` para domínio com restrição reescreve as quatro tabelas uma vez, sob ACCESS EXCLUSIVE, sem disparar gatilho de linha nem abrir privilégio. Está dito no cabeçalho da migração.

### Shared

- `dominio.ts`: `PAPEIS_DE_SERVIDOR` (os quatro), `PAPEIS` = servidores + `usuario_orgao` (no fim, para não mudar a ordem de nada que já usava), `ROTULO_PAPEL.usuario_orgao` ("Usuário de órgão externo"), `ehPapelDeServidor`, tipo `PapelDeServidor`; `ORIGENS` ganha `portal` (para o shared bater com o CHECK).
- `permissoes.ts`: `usuario_orgao` com lista de ações VAZIA e posto 1; `papeisQuePodeConceder` devolve só papéis de servidor.
- `schemas.ts`: `usuarioSchema` e o cadastro (`cadastroUsuarioSchema`) aceitam só `PAPEIS_DE_SERVIDOR`; a edição (`edicaoUsuarioSchema`) aceita todos os papéis de conta, de propósito, para o pedido de conversão chegar à regra e voltar 409 (e não 422 genérico). `eventoTrilhaSchema` fica com `PAPEIS` (a trilha pode ter autor `usuario_orgao`).
- `erros.ts`: `papel_nao_se_converte` (409, permanente) sai de `CODIGOS_RESERVADOS` e entra em `CODIGOS_DE_ERRO`; o teste `catalogo-de-erros.test.ts` do shared foi ajustado no lugar.

### API

- `rotas/administracao.ts`, só o `PATCH /usuarios/:id`: depois de ler o alvo e conferir o posto, se exatamente um dos dois lados (papel atual, papel pedido) é `usuario_orgao`, responde 409 `papel_nao_se_converte` sem escrever nada; a corrida (gatilho do banco) é traduzida para o mesmo 409.
- `auth/servico.ts`, UMA mudança em `entrar`: conta `usuario_orgao` segue o mesmo caminho do e-mail inexistente (mesma resposta 401 `credenciais`, mesmo corpo, mesmo gasto de tempo), ANTES da senha, sem contar falha na conta e sem chave de configuração (premissa P-09). `PORTAL_ATIVO` fica para a 1C e a 2A.
- `openapi/v1.json` regerado por `npm run openapi` (só mudou o `enum` de `papel` das respostas do contrato, que usa `PAPEIS`; ver "Para o orquestrador").

### Painel

- `Usuarios.tsx`: o formulário oferece só os quatro papéis de servidor (já vinha de `papeisQuePodeConceder`); o estado do papel passou a `PapelDeServidor`; o botão "Corrigir" de uma linha `usuario_orgao` fica desabilitado com o motivo, e `editar` não abre o formulário para ela.

### Testes novos e ajustes

- `dc360/db/test/dominio-de-papel.test.ts` (36 casos): 053 sobre dado antigo (linhas idênticas), domínios, positivos nas quatro colunas e em `portal`, papel inventado e origem inventada recusados, `operador_da_plataforma` só na trilha administrativa, gatilho nos dois sentidos (inclusive como `dc360_app`), isolamento intacto (RLS forçada, trilhas append-only, SECURITY DEFINER igual, ACL de coluna igual) e a volta (idêntica, e recusa com dado que o CHECK antigo não aceita).
- `dc360/apps/api/test/papeis-batem-com-o-banco.test.ts` (26 casos): shared contra banco (`PAPEIS`, autores administrativos, `ORIGENS`, `tipo_de_ator`), o papel em si, PATCH 409 nos dois sentidos, POST 422, login fechado (igual a e-mail inexistente, com senha certa e errada, sem falha contada, sem sessão), conta de A ausente na lista de B e 404 no PATCH de B.
- `db/test/migracoes-regras.test.ts` e `db/test/chave-de-criacao-migracao.test.ts`: ajustados porque a 053 real passou a existir (a primeira usava "053" como número de migração fictícia, agora "900"; a segunda assumia que a 052 era a última e agora para na 052). Nenhum caso novo.
- Documentação: `DICIONARIO-DE-DADOS.md` (seção "O domínio de papel (migração 053)" e as linhas `papel` e `origem`), `README.md` (linha vazia do `usuario_orgao` na tabela de permissões, mais parágrafo; totais), `COLOCAR-DE-PE.md` (total), `RESTORE-DO-BANCO.md` (53 migrações), `scripts/baseline.mjs` (chave `V2-F03-E04` na API, +26, e no banco, +36).

## Portões (a partir de `dc360/`)

| Portão | Resultado |
| --- | --- |
| `npm run typecheck` | verde nos oito pacotes |
| `npm run test:isolamento` (banco) | 546 casos: 537 passam, 6 puladas, 9 falham. 8 são as de ambiente Windows aceitas (`desfazer-migracao` 5, `guarda-da-semente` 3). **1 NÃO é de ambiente: `catalogo-nominal.test.ts`, "S5a: redefinir com uma migração que não existe reprova"** (ver "Para o orquestrador") |
| `npm run test:api` | 2067 casos: 2064 passam, 34 puladas, 3 falhavam: `semear-homologacao` 2 (ambiente aceito) e `openapi` "sem deriva" (resolvido pelo `v1.json` regerado, verificado depois em `saidas/02-teste-da-api.txt`) |
| `npm test --workspace @dc360/shared` | 418 casos: 417 passam, 1 falha (`regras-de-conteudo`, EPERM em symlink, DV-46) |
| web e console | 820 e 379 casos, todos passam |
| `CI=true npm run test:scripts` | 831 casos, 808 passam, 0 falham (o resto é pulado) |
| `node --test scripts/baseline.test.mjs` | 29 passam |
| `npm run lint`, `lint:teto` (431), `formato:conferir` | verdes |
| `npm run conferir:numeros` | verde (`saidas/03-conferir-numeros.txt`) |
| `node scripts/auditar.mjs` | runtime limpo |

Saídas em `saidas/`. O `apps/console/test/no-navegador.test.ts` passou na rodada completa.

## Justificativa das escolhas

- **Domínio em vez de CHECK**: a lista de papéis passa a ter um lugar por tipo de autor no banco, e a trilha append-only não pode recusar um papel novo depois (não se corrige). A volta recusa em vez de apagar pelo mesmo motivo.
- **Gatilho além do 409 da API**: a API cobre só quem passa por ela; o gatilho cobre SQL por fora (console, migração, teste). É função SECURITY INVOKER de propósito, para não entrar no teto de funções privilegiadas.
- **Login pelo caminho do e-mail inexistente e antes da senha**: igual no corpo, no status e no tempo, e sem contar falha (a conta ficaria bloqueada sem culpa quando o portal abrir). Quem tenta não descobre que a conta existe nem de que tipo é.
- **`PAPEIS` com `usuario_orgao` no fim**: preserva a ordem usada por tabelas e testes existentes (a tabela de permissões do README é ordenada por `PAPEIS`).
- **Edição aceita `usuario_orgao`**: sem isso, o pedido de conversão daria 422 genérico e a regra 409 nunca seria alcançada pela API.

## Limitações

- O E2E de navegador do formulário de Usuários (`test:e2e`) não foi rodado aqui; a garantia dos "quatro papéis" é por `papeisQuePodeConceder` (teste no `papeis-batem-com-o-banco`) e pelo typecheck do painel. A validação humana da etapa (Rafael confere o formulário) continua pendente.
- A prova de que a corrida (papel mudando entre a leitura e o UPDATE) volta 409 é só pelo gatilho no banco; a tradução do erro na rota não tem teste de concorrência (o PGlite tem uma conexão só).
- A migração reescreve quatro tabelas sob lock exclusivo; em município grande, rodar fora do horário de plantão.

## Para o orquestrador

- **Linha do STATUS sugerida:** `V2-F03-E04 | IMPLEMENTADA | candidato no ramo trab/f03-1a-e04-papel | migração 053 (domínio de papel, usuario_orgao, origem portal, gatilho de conversão) | falta validação`.
- **Dívidas pagas:** nenhuma. **Pendências humanas:** a validação humana da E04 (Rafael confere o formulário de Usuários, só quatro papéis).
- **PRECISA DE AÇÃO NA JUNÇÃO:** `db/test/catalogo-nominal.test.ts`, linhas 766 a 770 (caso "S5a: redefinir com uma migração que não existe reprova") usa o número `053` como migração que NÃO existe. Com a 053 real, o caso reprova. Eu NÃO editei o arquivo (o briefing o congela). Correção de uma troca de número: trocar `053` por um número inexistente (por exemplo `999`) nas duas ocorrências desse caso (a de `comS5a("053")` e a do regex `a migração 053 não existe`). Os outros casos que citam 053 injetam o texto da migração no mapa e passam. Vale para qualquer parte que crie a 053; a 1B (054) não é afetada por isto.
- **Conflitos prováveis com a 1B na junção:** `dc360/docs/RESTORE-DO-BANCO.md` linha 25 e o contador "migrações" (53 aqui, 54 depois da 1B); `db/test/chave-de-criacao-migracao.test.ts` e `db/test/migracoes-regras.test.ts` (a 1B, ao criar a 054, pode ter feito o mesmo tipo de ajuste); totais de testes no README e no `COLOCAR-DE-PE.md` (somam os deltas: API +26 e banco +36 desta parte); `apps/api/openapi/v1.json` (regerar na junção com `npm run openapi`, que é o que o integrador já faz).
- **Mudança de plano / premissas:** (1) o plano manda o teste do contrato cobrar a linha `erros` do PATCH pela 1C; não mexi em `contrato/**`. O contrato usa `PAPEIS` nas respostas de login e de conta, então `usuario_orgao` apareceu no `enum` de `v1.json` (regerado; inofensivo: a conta não loga). A 1C pode restringir esse `enum` a `PAPEIS_DE_SERVIDOR` se quiser, e então `v1.json` volta a mudar. (2) `PAPEIS` ficou com cinco papéis; `auth/tokens.ts` (2A) aceita `usuario_orgao` no token por usar `z.enum(PAPEIS)`, mas nenhum token é emitido para essa conta; a 2A decide. (3) `provisionar.ts` ainda valida `--papel` contra `PAPEIS` e depois exige `administrador`: sem efeito prático. (4) Nenhuma divergência entre o plano e a ADR 0009 nesta parte.
