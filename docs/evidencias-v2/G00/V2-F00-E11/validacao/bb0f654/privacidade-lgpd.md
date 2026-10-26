---
validador: privacidade-lgpd (general-purpose com o papel da dimensão)
modelo: claude-sonnet-5-5
etapa: V2-F00-E11
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [UI, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2, E3a]
nivel_de_prova_obtido: [E1, E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
Aviso: não sou advogado e isto não é parecer jurídico. Cobre a parte técnica (inventário, fluxo, controles, evidência). Base legal, controlador e operador, DPO e prazo de retenção ficam para pessoa. `$SP` é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/privacidade-lgpd-e09-e10-e11-e15-e17`. Nada foi herdado; tudo foi executado nesta rodada no HEAD `0290af5` (produto de `bb0f654`).

## Critérios verificados

1. O pacote de saída traz só dado do município de quem pediu (organização do token verificado), nunca de outro município.
2. Material de credencial não vai no ZIP: hash de senha, hash de token de sessão e de recuperação, segredo do segundo fator, ficha de push, hash do link do ofício.
3. Só quem tem `exportar_dados` E `gerenciar_organizacao` baixa; a exportação fica registrada com nível completo antes do primeiro byte.
4. O que o botão faz no navegador: o ZIP é recebido em memória, o endereço do objeto é liberado, o arquivo sensível não vira evidência arquivada.
5. O dicionário e a documentação de saída descrevem o que o pacote leva.
6. Dado pessoal do ZIP é inventariado (o que sai, de quem).

## Evidência

Inventário do que o ZIP leva (execução real, `$SP/sonda-zip.mts`, saída `$SP/sonda-zip-saida.txt`; pacote da Serra Alta gerado por `montarPacoteDeSaida` e pela rota `POST /saida/pacote.zip`, 112 entradas):
- `tabelas/*.csv` e `.json` de 27 tabelas: `aparelhos, avisos, avisos_lidos, devolucoes_de_tarefa, equipes, evidencias, exportacoes, metricas_municipio, notificacoes_enviadas, objetos_orfaos, ocorrencia_consultas, ocorrencias, oficio_aberturas, oficio_envios, oficio_sequencias, oficios, organizacoes, orgaos, protocolo_sequencias, providencias, saidas_a_campo, trilha_administrativa, trilha_eventos, usuarios, vistoria_evidencias_perdidas, vistoria_orgaos_indicados, vistorias`. Dados de cidadão: nome e contato do solicitante, endereço, coordenada, descrição de vulnerabilidade, fotografias, assinaturas. Dados de servidor: `usuarios` (nome, matrícula, e-mail, papel, equipe, `foto_chave`, `ultimo_acesso`, `falhas_login`, `bloqueado_ate`, `senha_provisoria_ate`), mais as fotos de perfil.
- Colunas de pessoa que também saem: `exportacoes.ip`, `ocorrencia_consultas.ip`, `oficio_aberturas.ip` e `oficio_aberturas.agente_do_navegador` (IP e navegador de quem abriu o ofício, que é gente do órgão destinatário).
- NÃO saem: `sessoes`, `recuperacoes_senha`, `segundo_fator`, `segundo_fator_recuperacao`, `interesse_municipio`, `eliminacoes_de_municipio` (`apps/api/src/saida/pacote.ts:149-190`), nem as colunas `usuarios.senha_hash`, `aparelhos.ficha`, `oficio_envios.token_hash` (`pacote.ts:206-220`; a lista de saída está em `pacote.ts:49-147`).

Fluxo e controles, com arquivo e linha:
- `apps/api/src/rotas/saida.ts:36-126`: `autorizar(..., "exportar_dados")` e `exigirPermissao(..., "gerenciar_organizacao")` ANTES do banco; organização do token; `INSERT INTO exportacoes` (nível `completo`, IP de quem pediu) e `registrarAtoAdministrativo` na mesma transação, antes do primeiro byte; log só com UUIDs.
- `pacote.ts`: tudo lido por `banco.comTenant(organizacaoId)` sob RLS; lista explícita de tabelas (`TABELAS_DA_SAIDA`) e de exclusões (`TABELAS_QUE_NAO_SAEM`); `esquema/` leva o SQL das migrações (código, com nomes de municípios fictícios em comentários).
- Navegador: `apps/web/src/dados/http.ts:1105-1111` (`baixarPacoteDeSaida`) passa por `chamar` (renovação de 401); `Organizacao.tsx:225-262` libera o objeto 30 s depois e na saída da tela.

Execuções desta rodada:
- E1: `saida-de-municipio.test.ts` (37) e `pacote-de-saida-contrato.test.ts` dentro dos 130 testes verdes (`$SP/api-1.txt`); `apps/web` `pacote-de-saida.test.ts` (parte dos 90 de `$SP/web-testes.txt`).
- E2, conteúdo do ZIP (sonda minha): plantei IP 192.0.2.201 a 203 e user-agents com marcadores nas sessões e uma recuperação; procurei em todos os arquivos de texto do ZIP: hash de senha (`scrypt$`), hash de token de sessão e de recuperação, IP, user-agent, marcador de matrícula: nenhum aparece.
- E2, isolamento (`$SP/sonda-zip-b-saida.txt`): geração dos pacotes das DUAS organizações da semente; Serra Alta: 8 protocolos próprios achados, 2 alheios achados 0, solicitantes alheios 0; Vale Fundo: 2 próprios achados, 8 alheios 0, solicitantes alheios 0; controle: o e-mail de Vale Fundo aparece no pacote de Vale Fundo e não no de Serra Alta. Fora do esquema SQL em comentário, nenhuma menção ao outro município. Tabelas com `organizacao_id` fora das duas listas: só a visão `console_situacao_dos_municipios` (a visão não sai, documentado).
- E2, rota HTTP: `POST /saida/pacote.zip` do administrador: 200, `application/zip`, `cache-control: no-store`, nome `saida-serra-alta-mg-<data>.zip`, 243981 bytes.
- E2, navegador: o botão está coberto pelos testes e pelo e2e da seção 28; não repeti o clique no navegador porque o e2e do implementador usa a porta da suíte e a minha sonda era de LGPD. A tela do botão diz "É o arquivo mais sensível do sistema, e baixar não apaga nada."
- Provas de que o teste morde (mutação, desfeita com `git restore`, árvore limpa conferida): M5 `COLUNAS_QUE_NUNCA_SAEM.usuarios` esvaziada: 2 testes reprovam, "nenhum cabeçalho de CSV nem chave de JSON traz coluna proibida" e "nem hash de senha, nem token de sessão, nem ficha" (`$SP/mut-e11-m5.txt`); M6 `sessoes` colocada na lista de saída: reprova (`$SP/mut-e11-m6.txt`).
- Evidência arquivada da etapa: sem ZIP, sem dump; só lista de nomes e hash. Varredura por segredos: nada.

## Cenários positivos

- Administrador baixa o ZIP completo do próprio município (rota, teste de contrato e e2e).
- A exportação grava `exportacoes` e `trilha_administrativa` antes do primeiro byte (lido no código e nas tabelas do ZIP, `exportacoes.csv` com o cabeçalho e 1 linha depois da minha chamada à rota).
- Coordenador (sem `gerenciar_organizacao`) recebe 403 e a tela mostra a frase (teste de contrato).

## Cenários negativos

- Pacote de A sem protocolo, solicitante nem e-mail de B; pacote de B idem, contra A.
- Segredos de sessão, recuperação, segundo fator, ficha de push e hash de senha ausentes (E1 e E2).
- `POST /pacote.zip` na raiz e `GET /saida/pacote.zip`: 404 (provado no e2e e no contrato).
- Município suspenso: `acesso_suspenso` (teste de contrato).

## Tentativas de reprovar

1. Dado de outro município no ZIP: gerei o pacote das duas organizações e procurei todos os protocolos, solicitantes e e-mails da outra; zero. Não consegui.
2. Credencial no ZIP: plantei marcadores em sessão e recuperação e procurei em todo texto do pacote; zero. Mutei a exclusão (M5, M6): os testes reprovam, logo a defesa é cobrada.
3. IP e navegador de servidor: procurei no ZIP; os de SESSÃO não saem, mas `exportacoes.ip`, `ocorrencia_consultas.ip` e `oficio_aberturas` (IP e navegador de gente de outro órgão) saem. Isso é por desenho (registro de operação, prova para o titular) e está em `PRIVACIDADE.md` seção 4 para exportação e consulta, mas não para a abertura do ofício; vira Achado 2 e decisão de DPO.
4. Cabeçalho `usuarios.csv`: confere com o esquema, sem `senha_hash`; com colunas de estado de autenticação (`falhas_login`, `bloqueado_ate`, `ultimo_acesso`, `senha_provisoria_ate`) que o dicionário não descreve (Achado 1).
5. Cache do arquivo: `no-store`.
6. Rastro do arquivo no navegador: o objeto é liberado em 30 s e na saída da tela; o arquivo em si cai na pasta de downloads de quem pediu (fora do alcance do produto, ver "Não verificado").
7. Evidência com dado real: varredura por segredos, CPF e URLs com credencial na pasta da etapa: nada.

## Achados

1. **corrige antes de crescer (dicionário).** O dicionário (`dc360/docs/DICIONARIO-DE-DADOS.md`, "Para quê": entregar junto com a exportação de saída) não descreve, na seção `usuarios`, as colunas `falhas_login`, `bloqueado_ate`, `ultimo_acesso` e `senha_provisoria_ate`, que vão em `tabelas/usuarios.csv` e `.json`. O município recebe colunas sem explicação. Reprodução: `$SP/colunas-faltando-por-tabela.txt` (linha `usuarios`) contra o cabeçalho de `usuarios.csv` impresso em `$SP/sonda-zip-saida.txt`.
2. **anotado (decisão de DPO).** IP e navegador de quem abriu o ofício (`oficio_aberturas.ip`, `agente_do_navegador`) e IP de servidores em `exportacoes` e `ocorrencia_consultas` vão no pacote. Anterior à etapa, por desenho; a minimização desses campos é decisão do DPO e do controlador (CP-10), não minha.
3. **anotado.** O ZIP inteiro é montado em memória no navegador e na API (limitação já declarada em `apps/api/PENDENCIAS.md` e no código de `saida.ts`); não é questão de privacidade, mas aumenta o tempo que o dado fica na memória.

## Não verificado

- CI do SHA: `ci_run` ausente.
- O download real no Firefox e no WebKit, e o arquivo na pasta de downloads do aparelho de quem pede (fora do controle do produto).
- Pacote com o município de produção: só a semente sintética.
- Fotos e assinaturas dentro do ZIP (pastas `evidencias/` e `usuarios/`): olhei os nomes e o isolamento por prefixo `tenant/<org>/` no código, não abri imagem alguma.
- Leitor de tela e aparelho físico.
- Base legal e finalidade da exportação de saída (cláusula de reversibilidade do contrato): jurídico.

## Risco residual

- O ZIP é o arquivo mais sensível do produto e, depois de baixado, é responsabilidade de quem o guarda; o produto só avisa na tela.
- IP e navegador de terceiros no ZIP (Achado 2) sem decisão de DPO.

## Motivo do humano

`humano_necessario: sim`: (a) decisão do DPO e do controlador sobre IP e navegador no pacote de saída e a retenção desses campos (CP-10); (b) a etapa pede que Rafael baixe o pacote pelo painel e abra o ZIP, que é a abertura de um arquivo com dado sensível por pessoa. As verificações técnicas (conteúdo, isolamento, exclusão de credenciais, acesso, registro, log) foram feitas por execução e estão acima.
