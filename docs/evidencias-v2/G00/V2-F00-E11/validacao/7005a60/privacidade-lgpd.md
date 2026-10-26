---
validador: privacidade-lgpd
modelo: claude-sonnet-5-5
etapa: V2-F00-E11
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [LGPD, SEGURANCA, API, UI, E2E]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Inventário do que o ZIP leva (`apps/api/src/saida/pacote.ts`):
- Todas as tabelas de `TABELAS_DA_SAIDA` em CSV e JSON, com os dados do município inteiro: `ocorrencias` (endereço, coordenada, nome e contato do solicitante, descrição de vulnerabilidade), `usuarios` (nome, e-mail, matrícula, `foto_chave`), `trilha_*`, `exportacoes` e `oficio_aberturas` (com IP), `ocorrencia_consultas`.
- Arquivos: fotografias das evidências e assinaturas em pastas por protocolo, foto de perfil de servidor (`:fotosDeServidor`), laudos e ofícios em HTML, esquema SQL.
- Não saem: `sessoes`, `recuperacoes_senha`, `segundo_fator`, `segundo_fator_recuperacao`, `interesse_municipio`, `eliminacoes_de_municipio` (cada uma com motivo escrito em `TABELAS_QUE_NAO_SAEM`); colunas `usuarios.senha_hash`, `aparelhos.ficha`, `oficio_envios.token_hash` (`COLUNAS_QUE_NUNCA_SAEM`). O teste `pacote-de-saida-contrato.test.ts` ("Coluna proibida não sai, nem o valor dela") varre cabeçalhos CSV, chaves JSON e o conteúdo inteiro de todos os arquivos atrás de ficha, hash `scrypt$` e valores sentinela, e passou. Um teste de catálogo (`saida-de-municipio.test.ts`) obriga tabela nova a cair em um dos dois lados.
- Tratamento: o município é o controlador e recebe o dado de volta; isto é entrega ao controlador, não compartilhamento. Ok sob a ótica técnica.

Quem pode pedir: `autorizar(..., "exportar_dados")` e `exigirPermissao(papel, "gerenciar_organizacao")` antes de qualquer consulta (`rotas/saida.ts:44-45`): só administrador; coordenador 403 (teste verde). Organização sempre do token; pacote só de A não tem linha de B (RLS, `comTenant`).

Registro de quem exportou e quando: na mesma transação, antes do primeiro byte, `INSERT INTO exportacoes` (usuário, tipo `saida_de_municipio`, nível `completo`, total, IP, justificativa fixa) e `registrarAtoAdministrativo` com `saida_de_municipio_exportada` e `pedidoEm`. Ambos append-only. Há um registro mesmo se o download for interrompido (erro barato, documentado). O IP do administrador fica no registro: dado pessoal do servidor, justificável como trilha de segurança.

O pacote some do servidor: sim. Não se grava arquivo: `Readable.from(fluxoZip(pacote))` envia em fluxo, e `montarPacoteDeSaida` mantém tudo em memória do processo, sem arquivo em disco nem URL assinada. Existe resíduo em memória durante a montagem (limitação já declarada em `PENDENCIAS.md`, é tema de desempenho, F07-E06). A resposta sai com `cache-control: no-store` pelo hook global (`servidor.ts:353-368`). No navegador o blob é revogado depois de começar o download (`Organizacao.tsx:227-237`); o arquivo baixado fica na máquina de quem baixou, fora do controle do produto (aviso no LEIA-ME e no procedimento).

Evidência arquivada sem dado de pessoa: `V2-F00-E11/pacote/` guarda só lista de nomes e SHA-256; nenhum ZIP versionado (`git ls-files`). A prova usa a semente sintética.

## Evidência
- `pacote-de-saida-contrato.test.ts` e `saida-de-municipio.test.ts` entre os 7 arquivos, 102 testes, saída 0 (`scratchpad/api.txt`).
- Leitura de `rotas/saida.ts` e `saida/pacote.ts`.

## Cenários positivos
Administradora baixa o ZIP; índice, laudo, `tabelas/ocorrencias.csv` presentes.

## Cenários negativos
Coordenadora: 403 `sem_permissao`; sem token 401; município suspenso: `acesso_suspenso`; pacote de A não contém linha de B.

## Tentativas de reprovar
- Procurei segredo (hash de senha, ficha de push, token de ofício, hash de sessão ou recuperação) no ZIP: o teste de varredura de conteúdo não encontra; confirmei no código que o catálogo é a lista de colunas do banco menos as proibidas.
- Procurei exportação sem registro: o INSERT e a trilha vêm antes do `send`, na mesma transação.
- Procurei cópia do ZIP em disco do servidor ou no repositório: não há.

## Achados
1. anotado. `usuarios.csv` leva `foto_chave`, `bloqueado_ate`, `falhas_login` e `senha_provisoria_ate`; não são credencial utilizável, mas são metadado de segurança. Sugestão para depois: avaliar se a lista de colunas que nunca saem deve incluí-los.
2. anotado. `oficio_aberturas` leva IP e user-agent de terceiros (representantes de órgão); é dado do município e fica no pacote por decisão registrada. Entra no expurgo F05-E12.
3. anotado. Não há notificação ao titular nem ao DPO a cada exportação; a consulta fica em `/relatorios/exportacoes`.

## Não verificado
- Não executei o e2e com Chromium e Firefox nem abri o ZIP baixado (nível E2 do bloco fica no QA; E3a minha). O QA registrou que a conferência humana ao baixar e abrir o ZIP é pendência.
- Que o pacote em produção se comporta igual ao da semente (volume, memória).
- Base legal da entrega, cláusula de reversibilidade do contrato e prazo da eliminação posterior: advogado.

## Risco residual
O arquivo baixado e guardado pelo município fica fora do alcance do produto (cópia em pen drive, e-mail, nuvem).

## Motivo do humano
Rafael confere o download e a abertura do ZIP no painel (exigido pelo bloco). A cláusula contratual de saída e o procedimento de eliminação das cópias do fornecedor pedem advogado.
