---
validador: privacidade-lgpd (agente general-purpose com o papel da dimensão)
modelo: claude-sonnet-5-5
etapa: V2-F00-E11
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [LGPD, SEGURANCA, API, UI, E2E]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
Aviso: não sou advogado e isto não é parecer jurídico. Cobre a parte técnica. Base legal da entrega, cláusula de reversibilidade e eliminação das cópias do fornecedor ficam para advogado. `$SP` é a pasta de trabalho da sessão do gatekeeper (`.../scratchpad`).

## Critérios verificados

Esta etapa não tem correção própria na rodada 3, mas o diff `4b96ea7..52952a1` toca o pacote em `dc360/apps/api/src/saida/pacote.ts` (E12, correção 2: a assinatura declarada só entra se o arquivo existe) e em `documentos/laudo.ts`. Avaliei as duas mudanças sob a ótica de dado pessoal.

### Inventário: o que o ZIP leva de dado pessoal

`TABELAS_DA_SAIDA` (`apps/api/src/saida/pacote.ts:49`) enumera as tabelas do município em CSV e JSON, mais fotografias, assinaturas, laudos e ofícios em HTML e o esquema SQL. Dado pessoal presente, por titular:

| Titular | Dado | Onde no ZIP |
| --- | --- | --- |
| Cidadão atendido e família | nome, contato, endereço, coordenada, descrição da vulnerabilidade, fotografias da casa, assinatura do morador | `tabelas/ocorrencias`, `evidencias/`, `documentos/` |
| Servidor público | nome, e-mail, matrícula, foto de perfil, equipes, trilha de atos | `tabelas/usuarios`, trilhas |
| Representante de órgão externo | IP e user-agent da abertura de ofício | `tabelas/oficio_aberturas` |
| Quem exportou | nome, IP, justificativa fixa | `tabelas/exportacoes` |

O que NÃO sai (`TABELAS_QUE_NAO_SAEM`, `pacote.ts:149`, com motivo escrito por tabela): `sessoes`, `recuperacoes_senha`, `segundo_fator*`, `interesse_municipio`, `eliminacoes_de_municipio`. Colunas que nunca saem (`COLUNAS_QUE_NUNCA_SAEM`, `pacote.ts:206`): `usuarios.senha_hash`, `aparelhos.ficha`, `oficio_envios.token_hash`. Nenhuma migração desde a rodada 2 acrescentou tabela de negócio que escape dessa decisão: o teste "tabela nova de migração futura obriga alguém a decidir se ela sai" (`test/saida-de-municipio.test.ts:276`) passa, e as migrações 049 e 050 não criam tabela.

### A quem o ZIP vai e o que fica registrado

1. Quem baixa: `POST /saida/pacote.zip` (`apps/api/src/rotas/saida.ts:39`) exige `exportar_dados` (via `autorizar`) e, antes de qualquer consulta, `exigirPermissao(quem.papel, "gerenciar_organizacao")` (`saida.ts:58`): só o administrador do município. Coordenador, operador e agente recebem 403; sem token, 401. GET não está registrado.
2. De qual município: a organização vem do token (`quem.organizacaoId`); cabeçalho, parâmetro e corpo são ignorados (teste "a organização continua vindo do token"). Toda leitura roda em `comTenant` sob RLS, e o laudo do pacote só lê assinatura cuja chave começa com `tenant/<organizacaoId>/` (`conferirAssinatura`, `pacote.ts` acrescentada na correção 2 da E12), o que também impede ler arquivo de outro município por chave forjada.
3. Trilha: na mesma transação e antes do primeiro byte, `INSERT INTO exportacoes` (`saida.ts:98`: nível `completo`, IP do cliente, justificativa fixa, total de ocorrências) e `registrarAtoAdministrativo` (`saida.ts:113`, ação `saida_de_municipio_exportada`, `nadaFoiApagado: true`). A trilha é append-only no banco. O registro vem antes do download terminar: uma extração interrompida deixa rastro (erro barato, documentado no código).
4. Servidor: sem arquivo em disco nem URL assinada; o fluxo sai por `fluxoZip` e `Readable.from`; `cache-control: no-store` em toda resposta. O arquivo `SOMAS-SHA256.txt` cobre os arquivos.
5. Navegador (`apps/web/src/dados/http.ts` e `Organizacao.tsx`): blob criado e revogado depois do download começar e na saída da tela; não vai para estado, armazenamento nem cache da aplicação. O arquivo baixado fica na pasta de downloads de quem baixou, fora do controle do produto.
6. Mudança da correção 2 da E12: assinatura ausente no armazenamento passa a ser dita no laudo ("Assinatura não coletada") em vez de imprimir quadro quebrado; armazenamento sem resposta vira "Não foi possível conferir a assinatura no armazenamento ao montar este pacote" e a cópia do arquivo cai em `PENDENCIAS-DA-EXTRACAO.txt` como NÃO LIDO. Em termos de privacidade, nenhum dado novo sai, e a falta de resposta deixa de ser afirmada como ausência (honestidade do registro que o município leva).

## Evidência

- `npm run build:shared` (código 0). `npx vitest run test/saida-de-municipio.test.ts test/pacote-de-saida-contrato.test.ts test/saida-a-campo.test.ts test/saida-nao-declara-inexistente.test.ts`: 4 arquivos, 78 testes, 0 falha (`$SP/val/privacidade-lgpd/20-api-saida.txt`). Entre eles: "exige administrador: quem só exporta relatório não tira a base inteira", "recusa operador e recusa quem não apresenta token", "deixa trilha, registra a exportação e NÃO apaga nada", "a organização vem do token, e não de parâmetro nenhum", "o pacote de um município não carrega nada do outro", "nenhum cabeçalho de CSV nem chave de JSON traz coluna proibida, e o valor sentinela não aparece", "recebe 403 acesso_suspenso com a frase de contrato, e nada é extraído nem registrado".
- Painel: `apps/web/test/pacote-de-saida.test.ts`, 7 de 7.
- Navegador contra a API real (E2, `30-e2e-api-chromium.txt`), seção 28: 36 conferências OK, 0 falha, entre elas "POST /pacote.zip na raiz e 404", "GET /saida/pacote.zip tambem nao baixa nada", "a coordenadora recebe 403 sem_permissao da API", "o ZIP abre pelo diretorio central", "cada soma SHA-256 e a do arquivo de verdade", "toda linha de toda tabela e de Serra Alta (nenhuma de outro municipio)", "nenhum arquivo de dado cita Vale Fundo nem o id dele", "nenhuma coluna proibida (senha_hash, ficha, token_hash) em CSV ou JSON", "nenhum arquivo traz hash de senha (scrypt$)", "nenhuma tabela de credencial nem do fornecedor no pacote", "com 401 no primeiro pedido o painel renova UMA vez e baixa o ZIP", "a tela mostra a frase do servidor" (sem permissão e suspenso), "a recusa nao derruba a sessao". Total 288 e 64, 0 falha.
- Mordida (mudei o código, rodei, `git restore`):
  - M1, tirei `exigirPermissao(quem.papel, "gerenciar_organizacao")`: 3 vermelhos, entre eles "coordenadora ... recebe 403 e a frase" e "exige administrador" (`70-mut-M1.txt`). Prova que a segunda guarda é a que fecha o buraco para coordenador.
  - M2, o `INSERT INTO exportacoes` passa a não executar: 1 vermelho, "deixa trilha, registra a exportação e NÃO apaga nada" (`71-mut-M2.txt`).
  - M3, `COLUNAS_QUE_NUNCA_SAEM.usuarios` esvaziada (o hash de senha volta ao CSV): 2 vermelhos, "nem hash de senha, nem token de sessão, nem ficha de notificação" e "nenhum cabeçalho de CSV ... traz coluna proibida" (`72-mut-M3.txt`).
  - Árvore depois de restaurar: `git status --porcelain | grep -v '^??'` vazio.
- Evidência arquivada sem dado de pessoa: `V2-F00-E11/pacote/` guarda só lista de nomes e SHA-256 dos dois navegadores; a prova usa a semente sintética de Serra Alta; varredura da pasta de evidências por CPF, `scrypt$`, `token=` com valor e e-mails fora de domínio de exemplo em `51-varredura-evidencia.txt` (nada de pessoa real; o e-mail `coordenacao@fornecedor.com.br` é fixture do console de teste).

## Cenários positivos

Administradora baixa `dc360-pacote-de-saida-AAAA-MM-DD.zip`, assinatura `PK`, diretório com `tabelas/ocorrencias.csv` e laudo em `documentos/`, somas SHA-256 batendo arquivo a arquivo; um 401 no primeiro pedido renova e baixa.

## Cenários negativos

Coordenadora: 403 `sem_permissao`; operador e agente: 403; sem token: 401; município suspenso: `acesso_suspenso` com a frase de contrato e nada registrado; `/pacote.zip` na raiz e `GET /saida/pacote.zip`: não baixam; município B não aparece em nenhuma linha nem nome de arquivo do pacote de A.

## Tentativas de reprovar

- Procurei segredo no ZIP: hash de senha, ficha de push, token de ofício, tabela de credencial. A varredura do e2e e do teste de contrato não acha, e a mutação M3 prova que o teste detecta o hash se ele voltar.
- Procurei linha ou nome de arquivo de outro município: a varredura cobre todas as linhas dos CSV e JSON e o conteúdo; a nova checagem de prefixo `tenant/<org>/` de `conferirAssinatura` fecha a leitura de objeto de outro município por chave de assinatura adulterada no banco do próprio município.
- Procurei exportação sem rastro: M2 prova que o teste acusa; procurei papel menor que baixe: só administrador passa (M1).
- Procurei cópia do ZIP no servidor, no cache HTTP e no armazenamento do navegador: não há; resta o blob na memória da aba e o arquivo na pasta de downloads.
- Procurei regressão de privacidade na correção 2 da E12: o `diff` de `pacote.ts` e `laudo.ts` não acrescenta coluna nem tabela; `PENDENCIAS-DA-EXTRACAO.txt` só recebe nomes de chave, não conteúdo.
- Não consegui quebrar nada na dimensão.

## Achados

1. anotado. `usuarios.csv` leva `foto_chave`, `bloqueado_ate`, `falhas_login` e `senha_provisoria_ate`: metadado de segurança, não credencial utilizável. Avaliar incluí-los em `COLUNAS_QUE_NUNCA_SAEM`.
2. anotado. `oficio_aberturas` leva IP e user-agent de representantes de órgão; entra no expurgo F05-E12.
3. anotado. Não há aviso ao encarregado nem ao titular a cada exportação; a consulta fica em `/relatorios/exportacoes`.
4. anotado. O registro da exportação é gravado antes do download terminar; uma extração interrompida deixa rastro (erro barato).
5. anotado. O pacote é montado inteiro em memória durante a geração (F07-E06).

## Não verificado

- Firefox: o e2e do bloco pede Chromium e Firefox; só rodei Chromium (Firefox não está instalado nesta máquina). O Firefox consta na evidência do implementador, que trato como alegação.
- Abertura manual do ZIP por uma pessoa (validação humana do bloco).
- Comportamento do pacote em produção (volume, memória, tempo).
- Base legal da entrega, cláusula de reversibilidade, prazo de eliminação das cópias do fornecedor: advogado.

## Risco residual

O arquivo baixado e guardado pelo município (pen drive, e-mail, nuvem) fica fora do alcance do produto. O pacote é a maior concentração de dado pessoal do produto e está protegido por uma só pessoa com papel (o administrador); não há segunda pessoa, notificação ao encarregado nem prazo de expiração do arquivo.

## Motivo do humano

Rafael baixa o pacote com a API local e abre o ZIP (campo "Validação humana" do bloco). Cláusula contratual de saída e eliminação de cópias pedem advogado.
