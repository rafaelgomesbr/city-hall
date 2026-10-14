---
validador: privacidade-lgpd
modelo: claude-sonnet-5-5
etapa: V2-F00-E11
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [LGPD, SEGURANCA, API, UI, E2E]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
Aviso: não sou advogado e isto não é parecer jurídico. Cobre a parte técnica. Base legal da entrega, cláusula de reversibilidade e eliminação das cópias do fornecedor ficam para advogado.

## Critérios verificados

Inventário do que o ZIP leva (`apps/api/src/saida/pacote.ts`, `TABELAS_DA_SAIDA`): todas as tabelas do município em CSV e JSON (ocorrências com endereço, coordenada, nome e contato do solicitante e descrição de vulnerabilidade; usuários com nome, e-mail, matrícula; trilhas; exportações e aberturas de ofício com IP), fotografias, assinaturas, laudos e ofícios em HTML, esquema SQL. Não saem: `sessoes`, `recuperacoes_senha`, `segundo_fator*` e as demais com motivo escrito em `TABELAS_QUE_NAO_SAEM`; colunas `senha_hash`, `aparelhos.ficha`, `oficio_envios.token_hash`. Desde a rodada 1 o pacote ganhou `v.latitude` e `v.longitude` da vistoria (`pacote.ts`, consulta das vistorias): é dado do município, já presente no laudo emitido pela rota, e não amplia o escopo da entrega ao controlador.

Controles:

1. Quem baixa: `POST /saida/pacote.zip` exige `exportar_dados` e depois `gerenciar_organizacao` (`apps/api/src/rotas/saida.ts:57-58`), antes de qualquer consulta. Coordenador tem a primeira e não a segunda (`packages/shared/src/permissoes.ts:97-130`), então só o administrador baixa. Por ser POST, a vigência (conta ativa, papel, sessão) é conferida em `servidor.ts` (`escrita`). O método GET não está registrado.
2. Nada de outro município: a organização vem do token (`quem.organizacaoId`) e toda leitura passa por `comTenant` sob RLS. O e2e conferiu os arquivos reais do ZIP baixado.
3. Rastro: o INSERT em `exportacoes` (nível `completo`, IP, justificativa fixa) e `registrarAtoAdministrativo` ficam na mesma transação, antes do primeiro byte (`saida.ts`, bloco comentado).
4. Servidor: sem arquivo em disco nem URL assinada; o fluxo sai por `Readable.from(fluxoZip(...))`; `cache-control: no-store` em toda resposta (hook global, `servidor.ts` ~linha 399).
5. No navegador: `baixarPacoteDeSaida` (`apps/web/src/dados/http.ts:1105-1111`) cria um blob e `createObjectURL`; `Organizacao.tsx:207-262` revoga a URL 30 s depois do clique (`MS_ATE_LIBERAR_O_ARQUIVO`) e também na saída da tela (limpeza do `useEffect`). O Blob não é guardado em estado, armazenamento nem cache da aplicação; o arquivo baixado fica na pasta de downloads de quem baixou, fora do controle do produto. Erro mostra a frase da API, sem corpo.
6. Evidência arquivada sem dado de pessoa: `V2-F00-E11/pacote/` guarda só lista de nomes e SHA-256 (`sha256-do-zip-chromium.txt`: 235462 bytes); nenhum ZIP, CSV ou imagem de dado está rastreado fora de `capturas/` (conferi com `git ls-files`); a prova usa a semente sintética de Serra Alta.

## Evidência

- `scratchpad/baseline/17-e2e-api.txt`, seção 28: 35 verificações OK, entre elas "POST /pacote.zip na raiz e 404", "a coordenadora recebe 403 sem_permissao da API", "toda linha de toda tabela e de Serra Alta (nenhuma de outro municipio)", "o cadastro de organizacoes do pacote e so o de Serra Alta", "nenhum arquivo de dado cita Vale Fundo nem o id dele", "nenhuma coluna proibida (senha_hash, ficha, token_hash) em CSV ou JSON", "nenhum arquivo traz hash de senha (scrypt$)", "nenhuma tabela de credencial nem do fornecedor no pacote", "com 401 no primeiro pedido o painel renova UMA vez e baixa o ZIP", "a recusa nao derruba a sessao", município suspenso com a frase de contrato; total 279 aprovadas, 0 falha.
- `scratchpad/baseline/05-teste-api.txt`: `saida-de-municipio.test.ts` (28) e `pacote-de-saida-contrato.test.ts` (8) verdes; este varre cabeçalhos, chaves JSON e o conteúdo inteiro de todos os arquivos atrás de ficha, hash e valores sentinela.
- Leitura de `rotas/saida.ts`, `saida/pacote.ts`, `http.ts`, `Organizacao.tsx`.

## Cenários positivos

Administradora baixa `dc360-pacote-de-saida-AAAA-MM-DD.zip`, assinatura `PK`, diretório com `tabelas/ocorrencias.csv` e laudo em `documentos/`, somas SHA-256 batendo arquivo a arquivo.

## Cenários negativos

Coordenadora: 403 `sem_permissao`; sem token: 401; município suspenso: `acesso_suspenso`; raiz `/pacote.zip` e `GET /saida/pacote.zip`: não baixam.

## Tentativas de reprovar

- Procurei segredo (hash de senha, ficha de push, token de ofício) no ZIP: o teste de varredura e o e2e não encontram; o catálogo é a lista de colunas menos as proibidas.
- Procurei linha de outro município: o e2e varre todas as linhas dos CSV e JSON, e o conteúdo, atrás do segundo município.
- Procurei exportação sem rastro e caminho em que um papel menor baixe (coordenador, operador, agente): só administrador passa; a segunda guarda é a que fecha.
- Procurei cópia do ZIP no servidor, no cache HTTP (`no-store`) e no armazenamento do navegador: não há. Resta o blob na memória da aba por até 30 s e o arquivo na pasta de downloads.
- Procurei ZIP, CSV ou foto de dado versionado nas evidências: não há.
- Não executei o e2e (usa a API e o banco) nem abri o ZIP; mordida independente do teste não foi refeita (a rodada proíbe modificar o repositório).

## Achados

1. anotado. `usuarios.csv` leva `foto_chave`, `bloqueado_ate`, `falhas_login` e `senha_provisoria_ate`: metadado de segurança, não credencial. Avaliar incluí-los em `COLUNAS_QUE_NUNCA_SAEM`.
2. anotado. `oficio_aberturas` leva IP e user-agent de representantes de órgão; entra no expurgo F05-E12.
3. anotado. Não há aviso ao titular nem ao encarregado a cada exportação; a consulta fica em `/relatorios/exportacoes`.
4. anotado. O registro da exportação é gravado antes do download terminar; uma extração interrompida deixa rastro (erro barato, documentado).

## Não verificado

- Execução do e2e e abertura do ZIP por mim (E2): dependem do banco desta rodada. Aceito a saída da linha de base como prova de execução e a leitura do código como E3a.
- Comportamento do pacote em produção (volume, memória).
- Base legal da entrega, cláusula de reversibilidade, prazo de eliminação das cópias do fornecedor: advogado.

## Risco residual

O arquivo baixado e guardado pelo município (pen drive, e-mail, nuvem) fica fora do alcance do produto. Pacote inteiro em memória durante a montagem (F07-E06).

## Motivo do humano

Rafael baixa o pacote com a API local e abre o ZIP (campo "Validação humana" do bloco). Cláusula contratual de saída e eliminação de cópias pedem advogado.
