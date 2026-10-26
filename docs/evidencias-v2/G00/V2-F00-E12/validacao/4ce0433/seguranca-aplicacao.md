---
validador: seguranca-aplicacao
modelo: claude-opus-5-5
etapa: V2-F00-E12
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [API, DOCUMENTO]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Tudo rodado num worktree esparso do validador no SHA `4ce0433`. O código da etapa não mudou desde a rodada 4: `git diff --stat bb0f654 4ce0433` em `apps/api/src/saida`, `src/documentos`, `src/rotas/documentos.ts`, `src/rotas/saida.ts` e `test/saida-de-municipio.test.ts` é vazio; só `docs/SAIDA-DE-MUNICIPIO.md` (um parágrafo sobre leitura sob suspensão, da E22) e `apps/api/PENDENCIAS.md` mudaram.

- **Teste vermelho verde e casos de borda do aviso de equipe** (DoD): `npx vitest run test/saida-de-municipio.test.ts`, 37 de 37, código 0 (`saidas/e12/saida-de-municipio.txt`). PASS.
- **O laudo do pacote imprime o mesmo aviso do laudo da rota, e o teste morde**: mutação M0 (as duas colunas de nome de equipe viram `NULL` na consulta do pacote): 3 de 45 reprovam nos dois arquivos do pacote (`saidas/e12/mutacao-M0-sem-nomes-de-equipe.txt`); sem mutação, 45 de 45 (`sem-mutacao-dois-arquivos.txt`). PASS.
- **Isolamento: o ZIP do município A não contém nada do B** (teste de isolamento da etapa): sonda própria, abaixo, com TODO id, protocolo e e-mail de linha do B em toda tabela que sai: nenhum no pacote de Serra Alta; e o inverso, com o coordenador de Vale Fundo promovido a administrador só na sonda: nada de Serra Alta no pacote de Vale Fundo (fora de `esquema/`, que é o SQL do produto, igual em toda instalação). PASS.
- **Permissão exigida**: sem token 401 `nao_autenticado`; token lixo 401; agente do A 403 `sem_permissao`; coordenador do B 403; coordenador do B com `?organizacao=<A>`, cabeçalho `x-organizacao-id` e corpo apontando o A: 403 (a organização só vem do token). Só o administrador recebe o ZIP. PASS.
- **Sem segredo no ZIP**: nenhum hash de senha, nenhum valor de `sessoes`, nenhum token de acesso ou de renovação emitido na sonda, nenhum JWT (`eyJ...`), nem o segredo do JWT, nem a senha de criação de conta, nem a senha temporária da redefinição, nem os marcadores plantados em `aparelhos.ficha`, `oficio_envios.token_hash`, `segundo_fator.segredo_cifrado` e `segundo_fator_recuperacao.codigo_hash`. PASS.

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L12-seguranca/saidas/e12/`:

- `saida-de-municipio.txt`: 37 de 37, código 0.
- `sonda-saida.txt` e `sonda-vitest.txt`: a sonda `../../sonda/zz-saida-validador.test.ts`, copiada para `apps/api/test/` do worktree só durante a execução e apagada depois. Monta o servidor real sobre PGlite com a semente, faz login de quatro pessoas, renova um token, cria conta com senha, redefine a senha de outra pessoa, planta os quatro marcadores de credencial, baixa os dois pacotes por `POST /saida/pacote.zip`, abre cada ZIP com o `unzip` do sistema (leitor independente do escritor do produto) e procura cada agulha byte a byte em cada arquivo. O vitest sai com código 1 só por falso positivo da própria sonda, conferido à mão: a agulha genérica "MARCADOR" e o texto de `sessoes.motivo_revogacao` aparecem em comentários de `esquema/*.sql`; as agulhas específicas não aparecem em arquivo nenhum (o `grep -rl "MARCADOR-\|MARCADORx"` nos dois diretórios extraídos voltou vazio). As tabelas `aparelhos` e `oficio_envios` saíram com a linha plantada e sem as colunas `ficha` e `token_hash` no cabeçalho.
- `arquivos-do-pacote-serra-alta.txt`: a lista dos 114 arquivos do pacote.
- `mutacao-M0-*.txt`, `mutacao-M1-ficha-sai.txt`, `mutacao-M2-token-hash-do-oficio-sai.txt`, `M2-sonda/`: as mutações em `src/saida/pacote.ts` do worktree, cada uma desfeita com `git checkout` (o `git status` do worktree ficou limpo).

## Cenários positivos

- Administradora de Serra Alta baixa o pacote: 200, `application/zip`, 114 arquivos.
- Administrador (promovido na sonda) de Vale Fundo baixa o pacote do próprio município: 200, 110 arquivos.
- Aviso de equipe divergente igual nos dois laudos (casos do arquivo de teste).

## Cenários negativos

- Sem token, token lixo, agente, coordenador do outro município e coordenador do outro município com parâmetro, cabeçalho e corpo apontando o A: 401, 401, 403, 403, 403. Nenhum devolve dado.
- Pacote de A procurado por 16 identificadores de B e pacote de B por todos os ids, protocolos e e-mails de ocorrências e usuários de A: zero achados.
- 33 agulhas de credencial (valores reais do banco e das respostas, mais os marcadores) nos dois pacotes: zero achados fora do falso positivo de `esquema/`.

## Tentativas de reprovar

- Procurei coluna com nome de credencial em tabela que sai: `aparelhos.ficha`, `oficio_envios.token_hash` e `usuarios.senha_hash` estão em `COLUNAS_QUE_NUNCA_SAEM`; as outras (`avisos.chave_do_fato`, `evidencias.chave_storage`, `objetos_orfaos.chave`, `usuarios.foto_chave`, `vistorias.assinatura_chave`, `usuarios.senha_provisoria_ate`) são chave de armazenamento ou data, não credencial.
- Tentei trocar de município pela requisição (parâmetro, cabeçalho, corpo): 403 antes de qualquer consulta.
- Mutação M1 (a `ficha` passa a sair): 1 de 45 reprova (o valor sentinela de `pacote-de-saida-contrato.test.ts`). A guarda morde.
- Mutação M2 (o `token_hash` do ofício passa a sair): **45 de 45 VERDES**. A sonda do validador, rodada sob a mesma mutação, acha o marcador em `tabelas/oficio_envios.csv` e `.json` (`M2-sonda/sonda-saida.txt`). O teste "nenhum cabeçalho de CSV nem chave de JSON traz coluna proibida" itera a própria lista `COLUNAS_QUE_NUNCA_SAEM`, então tirar uma coluna da lista tira também a conferência dela, e não há valor sentinela de `token_hash` na semente dos testes.

## Achados

1. **corrige antes de crescer.** A exclusão de `oficio_envios.token_hash` do pacote não é presa por teste (mutação M2 verde, reprodução acima). Hoje o código a exclui e a sonda prova que nada vaza; o risco é regressão silenciosa. Conserto: os testes do pacote compararem contra uma lista literal de colunas proibidas (não a constante de produção) e plantarem valor sentinela em `oficio_envios.token_hash`, como já fazem com a `ficha`. Não decide critério desta etapa (a exclusão de segredo é do montador do pacote, E11), por isso não reprova.
2. **anotado.** O teste "Segredo não vai junto" procura só o prefixo `scrypt$` no pacote; a garantia real vem da lista de colunas e das tabelas que não saem, que a sonda confirmou com valores do banco.

## Não verificado

- O e2e de navegador (seções 28 e 29 de `fluxo-api.e2e.mjs`): não rodado por esta dimensão; o aviso do laudo foi provado pelos testes da API e pela mutação.
- Segundo fator ativado de ponta a ponta: `/segundo-fator/iniciar` respondeu 503 (desligado sem chave de cifra no ambiente de teste); por isso o segredo cifrado e o resumo de recuperação foram plantados por SQL.
- Recuperação de senha por e-mail: tabela `recuperacoes_senha` vazia na sonda (a tabela inteira não sai, conferido pela lista de arquivos).
- Postgres 17 real: a sonda rodou sobre PGlite; o isolamento sob RLS forçada no Postgres de produção é do portão CA-06, rodado pelo gatekeeper (345 aprovados).

## Risco residual

Uma mudança futura em `COLUNAS_QUE_NUNCA_SAEM` que retire `token_hash` passaria pela suíte e publicaria o resumo do link de uso único de abertura de ofício no arquivo que mais viaja. Hoje não acontece. As três diferenças conhecidas entre o laudo da rota e o do pacote seguem declaradas até a V2-F09-E02.

## Motivo do humano

Validação humana da etapa: Rafael compara o laudo emitido pela rota com o laudo de dentro do pacote para a vistoria com equipe divergente. Não é desta dimensão e não muda o veredito.

Itens do "Motivo do veredito" da rodada 4: a rodada 4 foi PASS (Especificação, QA, Banco e Segurança) e não pediu conserto. Confirmei que o código da etapa é o mesmo de `bb0f654` (diff vazio nos arquivos de código e de teste) e que o comportamento se mantém por execução: 37 de 37, M0 morde, isolamento e segredo conferidos pela sonda nos dois sentidos.
