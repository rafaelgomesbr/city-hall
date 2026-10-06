# Auditoria Baseline Zero da V2, frente 07: Cidadão (§10 app do cidadão, §11 fluxo Cidadão -> Defesa Civil)

Convenções deste relatório.

- Caminhos sem prefixo são relativos a `C:\Projetos\city-hall\dc360\`. Caminhos com prefixo `docs/` ou `CLAUDE.md` são relativos à raiz `C:\Projetos\city-hall\`.
- `arquivo:linha` é citação de leitura do código. "Executado" significa que rodei o arquivo de teste citado (um arquivo por vez, sem suíte completa). "Lido" significa que li o teste e não o executei.
- Documentação (README, PENDENCIAS, ADR, comentário de código) não é tratada como prova de comportamento. Onde só ela diz, está escrito "documentado, NÃO CONFIRMADO".
- Nenhum arquivo do repositório foi alterado. O único arquivo criado é este.
- Comandos de prova executados: `npx vitest run test/superficie.test.ts` em `apps/api` (9 testes passaram) e `npx vitest run test/api.test.ts -t "Formulário público de interesse"` (4 passaram, 48 ignorados por filtro).

---

## Resumo

1. A superfície 5 é NOVO PRODUTO. Não existe código de cidadão em lugar nenhum: Glob por `*cidadao*`/`*relato*`, `git log --all --name-only`, grep no `mockup/` e nos cinco `apps/`/`packages/` não encontram app, portal, tabela, rota ou schema de cidadão. O repositório tem uma única branch (`master`).
2. O único código público é `POST /publico/interesse` (lead institucional B2G, não canal de cidadão) e `GET /publico/oficio/:token` (link de uso único para órgão). O portão `apps/api/test/superficie.test.ts` (executado, 9 passaram) lista 11 rotas sem token e nenhuma é de cidadão.
3. O modelo de ocorrência NÃO comporta o relato: `canal_entrada` fechado em 5 valores, `solicitante_nome NOT NULL`, `trilha_eventos.ocorrencia_id NOT NULL` com `autor_papel` limitado a 4 papéis de servidor, `ocorrencia_consultas` idem, `vinculada_a` só ocorrência->ocorrência e só no INSERT, protocolo único por município/ano, resumo de prestação de contas que conta TODA linha de `ocorrencias`.
4. Gravar o relato direto como ocorrência é errado: nasce com protocolo oficial, prazo, trilha imutável, dado pessoal sob retenção atrelada ao encerramento, e entra nos números oficiais. O status `rascunho` não serve de atalho (excluído só de alguns filtros, não do resumo nem do CSV).
5. A premissa de autenticação do produto é contrária ao cidadão: ADR 0004 diz "O usuário não é o cidadão". `usuarios`, `Papel`, plateia `dc360` do JWT, e-mail global único e o gate de papéis de banco (`isolamento.test.ts:4005`) foram desenhados para servidor municipal. O caminho coerente com o repositório é um realm separado (precedente: console, ADR 0008, plateia própria e papel de banco próprio), e ele exige evoluir o gate de isolamento.
6. Compartilhamento com o app de campo: aproveita-se toolchain Expo, o desenho da renovação de token (`token.ts`), princípios (vitrine de push sem dado pessoal, foto sem EXIF no picker) e alguns módulos de `@dc360/shared`. NÃO se aproveita em código: UI (não é pacote), tokens (cópia literal, sem pacote), cliente HTTP (há três), `packages/campo` (fila tipada para vistoria), push (preso a `usuarios`, a um bundle e a um projeto FCM). `@dc360/shared` tem entrada única (barril) e arrastaria permissões e vocabulário do agente para o binário público.
7. Recomendação fundamentada: novo app (`apps/cidadao`) com bundle, ficha de loja, permissões, rótulos de privacidade e realm de API próprios. `LOJAS.md:14` afirma que o app de campo "não é para o cidadão".
8. Bloqueadores não técnicos já visíveis: município do relato sem token (conflita com a regra "organização vem do token"), sem provedor de e-mail/SMS em produção (`RECUPERACAO_ATIVA="nao"`), política de privacidade não publicada e sem encarregado, bloqueio de conta efetivo desligado (`describe.skip` em `vigencia-na-escrita.test.ts:102`).
9. Anexos: só imagem, tipo apenas declarado, sem inspeção de bytes, sem antivírus, sem remoção de EXIF, teto de armazenamento COMPARTILHADO com as fotos dos agentes (abuso de cidadão pode estourar o teto e travar a evidência de campo), e toda foto avulsa de `evidencias` aparece automaticamente no laudo oficial (`rotas/documentos.ts:159-189`).
10. Anti-abuso: limitador em memória por usuário ou IP, sem CAPTCHA, sem atestação de app/dispositivo, sem moderação, sem versionamento de API, sem idempotência na criação de ocorrência, sem homologação. 40 decisões humanas mapeadas, nenhuma escolhida.

---

# §10. App do cidadão (React Native, Android e iOS)

## 10.1 Existe algum código reaproveitável para cidadão?

Resposta curta: não existe código de cidadão. Existe um conjunto pequeno de PADRÕES de superfície pública que valem como referência.

| Item | O que é de verdade | Serve ao cidadão? | Evidência |
| --- | --- | --- | --- |
| `apps/web/src/paginas/QueroConhecer.tsx` | Página do painel web (Vite/React DOM) para um coordenador municipal pedir contato comercial. O próprio cabeçalho diz "A porta de entrada de quem ainda não é cliente" e que não cria município nem conta. | Não como canal. Só como padrão visual/de formulário. Web, não React Native. | `paginas/QueroConhecer.tsx:1-280`; grep de `privacidade`, `LGPD`, `termo`, `consent` no arquivo: zero ocorrências, ou seja, a tela não mostra aviso de privacidade nem colhe aceite |
| `apps/api/src/rotas/interesse.ts` (`POST /publico/interesse`) | Grava `nome, cargo, email, telefone, município, uf, órgão, porte, mensagem, origem, ip` em `interesse_municipio`. Responde sempre 202 igual. Janela de 6 h por e-mail via função `SECURITY DEFINER` `interesse_recente`. | Só como padrão: escrita sem leitura, resposta uniforme (sem oráculo), janela anti-duplicata. Sem município, sem identidade, sem anexo, sem protocolo, sem canal de retorno (por decisão declarada). | `rotas/interesse.ts:33-85`; `db/migrations/011_interesse_de_municipio.sql:35-153`; teste `api.test.ts:1282-1364` (4 passaram, executado) |
| `GET /publico/oficio/:token` | Leitura pública de ofício para pessoa do órgão destinatário. Segredo de 32 bytes no caminho, expira, abre UMA vez (410 na segunda), registra quem abriu, resolve a organização pelo hash do link no banco. | Padrão de "leitura por capacidade" (segredo no link). NÃO serve ao acompanhamento de protocolo: é de uso único e atrelada a um documento. | `rotas/oficios.ts:598-690`; `servidor.ts:139-178` (segredo na URL, redigido do log); `superficie.test.ts:54-63` |
| `GET /saude` | Sonda pública. Deliberadamente não devolve nome de município. | Não. Mas mostra a regra de que rota pública não lista clientes. | `servidor.ts:597-663`, comentário em `:612-616` |
| Rotas `/auth/*` e `/armazenamento/objeto` | Login, segundo fator, renovar, sair, recuperar, redefinir; objeto assinado (só quando a API guarda bytes, proibido em produção). | Não (são de servidor). | `superficie.test.ts:30-47` |
| Portão `superficie.test.ts` | Enumera as rotas do Fastify montado e exige 401 em tudo que não está numa lista de 11 isenções com razão escrita. | Reutilizável como mecanismo de revisão. Mas sua premissa ("toda rota exige token") não descreve um canal de cidadão; teria que virar "toda rota exige a credencial do SEU realm". | `superficie.test.ts:30-64,149-187` (executado, 9 passaram) |

Confirmações negativas:

- Glob `**/*{cidadao,cidadão,relato}*` só acha `db/migrations/043_minimizacao_alcanca_relato_vistoria_e_trilha.sql` e o teste `db/test/minimizacao-do-relato-e-da-trilha.test.ts` ("relato" ali é o texto ditado por telefone) e os PDFs/HTML do dossiê de viabilidade na raiz.
- `git log --all --name-only` com filtro de nomes: os acertos de "cidad" são todos "priva**cidad**e". Nenhum arquivo de cidadão foi criado e apagado.
- `mockup/`: as únicas ocorrências de "cidad" são "cidade" e "duplicidade". Não há visão de cidadão.
- `apps/` contém `api`, `campo`, `console`, `web`. `packages/` contém `campo`, `shared`.
- Documentos que anunciam a superfície (não são prova de capacidade): `docs/referencia/ESPECIFICACAO_TECNICA_PRELIMINAR.md:101` ("Cidadão: abre solicitação e acompanha status não sigiloso. Portal externo limitado por protocolo"), `:111` (MVP 2), `:130` ("formulário do cidadão" como entrada); `docs/referencia/LEVANTAMENTO_TECNICO_JURIDICO_GOVTECH.md:57,59` (app do cidadão em RN/Expo, "bundle id e política de privacidade próprios", lojas públicas). O relatório anterior (`docs/AUDITORIA-2026-09-30.md:428`) já registra que não há rota pública de acompanhamento por protocolo. Confirmo.
- Divergência de documento a documento: a especificação original diz que a primeira entrega é PWA e que app nativo está "fora do MVP" (`ESPECIFICACAO_TECNICA_PRELIMINAR.md` seção 4.1); o levantamento e a decisão da V2 dizem RN/Expo nativo. Não há divergência com o código, que não tem nenhum dos dois.

Observações sobre o padrão `interesse_municipio` que contam como lição para o canal do cidadão:

- O IP do visitante é gravado (`011:71`, `rotas/interesse.ts:73`) e o comentário da coluna promete descarte após prazo de retenção (`011:158-159`) e "purga junto com o resto" (`011:66-68`). Não existe política de DELETE (`034_as_tabelas_centrais_tambem_nao_se_apagam.sql:104`: "policy FOR INSERT só") nem função de purga (grep de `interesse_municipio` em `db/src`, `apps/api/src`, `apps/console/src` e em todas as migrações acha só a rota, a 011, a 034 e o catálogo de saída). Descarte: documentado, NÃO CONFIRMADO, e o código indica que não existe.
- A rota não tem limite próprio além do global (grep de `rateLimit:` em `apps/api/src/rotas` acha só `autenticacao.ts:104`, `busca.ts:187`, `mapa.ts:476`, `rota.ts:259`). O global é 300 por minuto por IP ou usuário (`servidor.ts:381-398`).

## 10.2 O app de campo atual pode compartilhar com o app do cidadão?

Método: li `apps/campo/package.json`, `app.config.ts`, `eas.json`, `.env.example`, `LEIA-ME.md`, `LOJAS.md`, `metro.config.js`, `src/dados/{api,sessao,token,conectividade,foto-do-agente}.ts`, `src/app/_layout.tsx`, cabeçalhos de `src/ui/*`, `packages/campo/src/{index,tipos,transporte,deposito}.ts` e `packages/shared/src/*.ts`.

| Item | Genérico (reaproveitável) | Acoplado ao agente (não reaproveitável) | Veredito |
| --- | --- | --- | --- |
| Design tokens | Valores da paleta violeta/"tinta" e escala em `apps/campo/src/ui/tokens.ts`. | Alvo de toque de 52 pt "com luva, no barranco" diverge do painel (44), por decisão de campo (`tokens.ts:1-14`). Não existe pacote: o arquivo é cópia literal de `apps/web/src/estilos/tokens.css`, guardada por `scripts/paridade-de-tokens-do-aplicativo.test.mjs` (caminhos fixos para o campo). O levantamento previa "tokens de design" no pacote compartilhado (`LEVANTAMENTO...:57`), que não se materializou. | Reaproveitável só por extração para um pacote. Um terceiro consumidor força a terceira cópia ou a extração. A identidade visual do app público (marca do fornecedor, do município) é decisão de produto. |
| Componentes | Primitivos existem: `Txt`, `Botao`, `Cartao`, `Aviso`, `Vazio`, `Carregando`, `Campo`, `Dialogo`, `FolhaDeEscolha`, `Chip`, `Avatar`, `Tocavel`, ícones de estado (`ui/componentes.tsx`, `Campo.tsx`, `Dialogo.tsx`, etc.). | Moram em `apps/campo/src/ui`, não em pacote. Parte é do vocabulário do agente (`SeloSeveridade`, `Dado`, `IconeVulnerabilidade`, `IconeAssinatura`, `IconeChecklist`, `IconeDevolucao`, menu de abas do agente, textos de "rua/barranco"). Testes presos ao jest do campo. | Sem pacote de UI não há compartilhamento. Extração é trabalho novo. |
| Validações (`@dc360/shared`) | `coordenadaSchema`/`coordenadaGravadaSchema` (6 casas), `telefone.ts` (máscara que não recusa número), `localizacao.ts` (lê link de mapa, local), `TIPOS_COBRADE` e rótulos, `evidencia.ts` (`TIPOS_ACEITOS`, 15 MB), `mensagens-do-zod.ts`, `protocoloSchema`. | `permissoes.ts`, `usuarioSchema`, `aberturaOcorrenciaSchema` (formulário do OPERADOR ao telefone: `solicitanteNome`, `canalEntrada`), `vistoriaSchema`, envelope de sincronização, saída a campo, `minuta.ts`, `ROTULO_EVENTO_TRILHA`, `ROTULO_CAMPO` (frases do agente), `glifos-de-severidade`, `csv`. `pedidoDeEvidenciaSchema` exige `ocorrenciaId` (um relato ainda não tem). | Metade é reaproveitável, mas o pacote tem UMA entrada (`package.json` exports `"."`; `src/index.ts:1-17` reexporta tudo) e instala `z.setErrorMap` global no import (`mensagens-do-zod.ts`, última linha). Importar o pacote no app público embarca permissões, papéis, vocabulário de trilha (inclui eventos de segurança do agente) e schemas de vistoria no binário de loja. Precisa de subcaminhos de exportação ou de um pacote menor. |
| Cliente HTTP | A lógica de classificar falha (5xx/429 temporária, 4xx permanente, 401 permanente de propósito) em `packages/campo/src/transporte.ts:1-16` e o padrão de tempo limite/`AbortController`. | Existem TRÊS clientes: `apps/web/src/dados/http.ts` (1245 linhas), `apps/campo/src/dados/api.ts` (856 linhas), `packages/campo/src/transporte.ts` (234 linhas). Em `api.ts` a função `chamar` não é exportada, lê `BASE` de `Constants.expoConfig.extra.apiUrl` no carregamento do módulo e `ErroDaApi.mensagemAmigavel()` tem texto do agente ("Este perfil não pode registrar vistoria", "quem está na rua", troca de senha no painel). `transporte.ts` exige token (`sem_sessao` é falha permanente) e fixa `/evidencias/autorizar-envio`. | Nenhum dos três serve a chamada anônima nem ao realm do cidadão. O levantamento previa "cliente de API" no pacote compartilhado (`LEVANTAMENTO...:57`), não existe. O app do cidadão seria o quarto cliente, a menos que se extraia um. |
| Autenticação (cliente) | `criarObtentorDeToken` (`dados/token.ts`): renovação só perto do vencimento, trava de renovação em voo, getter em vez de valor. Armazenamento em `expo-secure-store` com `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (`dados/sessao.tsx`). | `Identidade` tem `papel`, `matricula`, `organizacaoId`, nome do órgão. `sessao.tsx` trata aparelho compartilhado entre turnos (`acolherNoAparelho`, `apagarDadosLocais`), ficha de push e fila do agente. | O mecanismo de renovação é genérico e bom. O provedor de sessão, não. |
| Autenticação (servidor) | Rotação de refresh com detecção de reuso, hash do refresh no banco, JWT curto, resposta uniforme contra enumeração. | Login por e-mail GLOBAL em `usuarios` (`002_autenticacao.sql:31`, `credenciais_para_login` `:80`), token com `org`, `papel`, `nome`, `sid`, plateia `dc360` (`auth/tokens.ts:18-42`). | Reaproveitável como desenho, não como código nem como tabela. Ver 10.3. |
| Upload | Fluxo autorizar -> PUT pré-assinado com cabeçalhos assinados (`content-type`, `content-length`, `if-none-match: *`, `s3.ts:118-121`) -> confirmar com leitura do objeto e SHA-256 medido no servidor (`rotas/evidencias.ts:114-197`). URL de leitura sempre curta e assinada (`armazenamento/tipos.ts:1-16`). | Permissão `registrar_vistoria`, que só o papel `agente_campo` tem (`rotas/evidencias.ts:211`, `permissoes.ts:80`). `ocorrenciaId` obrigatório; chave `tenant/<org>/ocorrencias/<id>/...` (`packages/shared/src/protocolo.ts`). `anexada_por` ligado a `usuarios`. Teto por município contado em `evidencias` por gatilho (`035:351-353`). Lado do aparelho: `packages/campo/src/fila.ts` (1244 linhas) tipada para vistoria (`FotoNaFila`, autor, equipe). | O protocolo de envio é bom e reaproveitável como desenho. A implementação está soldada ao agente e à ocorrência. |
| Localização | `expo-location` em primeiro plano, `localizacao.ts` do shared, decisão de mapa (Google ou plano esquemático) em `dados/mapa.ts`. | A captura mora dentro de `app/(agente)/vistoria/[id].tsx:1428-1436`, tela de 3748 linhas. Textos de permissão falam de vistoria. Chave de mapa é por binário e por plataforma (`app.config.ts`, `DC360_MAPS_CHAVE*`) e `GET /configuracao` exige autenticação (`rotas/configuracao.ts:101`). | Coordenada do agente é prova de local ("GPS do laudo"); a do cidadão é declaração sem prova. O desenho de permissão (primeiro plano apenas) é reaproveitável. O mapa para o cidadão é decisão de subprocessador (`docs/SUBPROCESSADORES.md` seção 2.2). |
| Câmera | `dados/foto-do-agente.ts`: Photo Picker/seletor do sistema sem pedir permissão de biblioteca, `exif: false`, redução para 512 px. | `expo-camera` (`CameraView`) está dentro de `vistoria/[id].tsx:8,874,2404`, não é componente. A foto de evidência não é reduzida ("prova não se reduz") e mantém metadados. Texto `TEXTO_CAMERA` fala de vistoria. | O padrão do seletor sem permissão de biblioteca é reaproveitável. A câmera de evidência não é. Política de EXIF para foto de cidadão é decisão. |
| Push | `push/PortaExpo.ts`, `ProvedorDePush.tsx`, `permissao.ts` embrulham `expo-notifications`. Princípio de vitrine constante sem dado pessoal (`apps/api/src/push/mensagem.ts:1-70`). | Tabela `aparelhos` com `usuario_id` ligado a `usuarios` (`016:78-107`). Dois tipos de aviso apenas: `tarefa_nova`, `prazo_vencendo`. UM bundle APNs (`config.ts:229`, `fly.toml:98`) e UMA conta de serviço FCM (`config.ts:267`). Regra "nunca antes do primeiro login, e uma vez só" (`docs/DECLARACAO-NAS-LOJAS.md:46`). | O desenho da vitrine é reaproveitável. O envio não sabe de dois aplicativos nem de destinatário que não seja servidor. |
| Packages comuns | `@dc360/shared`, `@dc360/campo`. | Nada de UI, tokens ou cliente. `apps/campo` está FORA de `workspaces` (`package.json:5-11`, `apps/campo/LEIA-ME.md:80`), com lockfile próprio e `file:` para os pacotes. `scripts/auditar.mjs:109` e `scripts/testar-campo.mjs:65` têm o caminho `apps/campo` fixo. | Um novo app herda o modelo "fora do workspace" e os scripts de gate precisam aprender o novo caminho, senão ele escapa de `npm audit` e do `verificar`. |

## 10.3 O que NÃO deve ser compartilhado (acoplamento e segurança)

1. `Papel`/`PAPEIS`/`ACOES`/`PERMISSOES`/`POSTO`/`podeGerirPapel` (`shared/src/dominio.ts:257`, `permissoes.ts:18-222`). Nunca acrescentar "cidadao" a `PAPEIS`: o mesmo enum é CHECK de `usuarios.papel` (`001:89`), de `trilha_eventos.autor_papel` (`001:307`), de `trilha_administrativa.autor_papel` (`010:42`) e schema do JWT (`auth/tokens.ts:20`). Um papel "cidadao" ali faria o cidadão entrar em tabelas e verificações desenhadas para servidor e tornaria qualquer `exigirAutenticacao` um ponto onde o token dele "existe".
2. Plateia e segredo do token do produto (`dc360`, `auth/tokens.ts:41-42`). O console já prova o desenho certo: plateia própria, recusada pela API mesmo com o mesmo segredo (`apps/console/src/tokens.ts:12-30`, `apps/console/test/plateia-nao-atravessa.test.ts`). O token do cidadão precisa de plateia própria pelo mesmo motivo.
3. A tabela `usuarios` e as funções `credenciais_para_login`/`sessao_por_token`/`abrir_sessao` (`002_autenticacao.sql:80+`). O índice `usuarios_email_global_idx` (`:31`) torna o e-mail único no sistema inteiro: e-mail de cidadão colidiria com e-mail de servidor.
4. O papel de banco `dc360_app` com privilégio em todas as tabelas de negócio. O gate `isolamento.test.ts:4005` ("nenhum papel além do de aplicação e do dono tem privilégio em tabela de negócio") e `:1173` foram feitos para barrar exatamente um terceiro papel; um realm de cidadão com papel próprio exige evoluir o gate por decisão, não contorná-lo.
5. A tabela `evidencias`, o teto de armazenamento e `chaveDeStorage`. Toda linha de `evidencias` com `enviada_em` aparece no laudo oficial: as avulsas (`vistoria_id IS NULL`) saem numa seção própria "anexadas por" (`rotas/documentos.ts:159-189`), renderizadas por Chromium no processo da API (`documentos/pdf.ts:63-97`). Além disso `evidencia_dentro_do_teto` conta tudo no teto do município (`035:351-353`).
6. `aparelhos`/push do servidor (FK para `usuarios`, bundle único).
7. O padrão de leitura `SELECT o.*` com lista de exclusão (`privacidade/lista.ts:38-46`): o comentário do arquivo admite que "retirar as três nomeadas deixa o resto passar", ou seja, coluna nova vaza por padrão. Para o cidadão a projeção precisa ser lista de INCLUSÃO.
8. O recorte intra-município por fragmento SQL colado em cada rota (`rotas/recorte-do-agente.ts`). O próprio arquivo registra o defeito que esse modelo já causou (token de agente paginava a base inteira). Acesso do cidadão "só ao que é seu" não pode depender de cada rota lembrar.
9. `ROTULO_EVENTO_TRILHA` e rótulos de severidade/prazo/equipe/vulnerabilidade: vocabulário interno (`dominio.ts:361-495`).
10. Artefatos de publicação do agente: bundle `com.solerte.dc360.campo`, `google-services.json` rastreado do projeto FCM `defesa-civil-360`, `DC360_API_URL`, chaves de mapa restritas ao pacote do agente, textos de `app.config.ts`, `docs/DECLARACAO-NAS-LOJAS.md` e `apps/campo/LOJAS.md` (que dizem "Este aplicativo não é para o cidadão", "sem conteúdo gerado por usuário público").
11. A fila local do agente e `banco-local.ts`/`acolherNoAparelho` (aparelho de plantão compartilhado entre turnos).

## 10.4 É melhor criar uma nova aplicação (`apps/cidadao`)?

Sim, com base no que existe. Argumentos, cada um com evidência:

1. Identidade de loja incompatível. `LOJAS.md:14` define o app de campo como ferramenta do agente, recomenda distribuição interna (Apple Business Manager, teste fechado) e manda NÃO escolher a categoria "Governo" (`:238`); declara "sem conteúdo gerado por usuário público" (`:242`). O app do cidadão é o oposto: loja pública, conteúdo gerado por usuário, rótulos de privacidade de outro perfil. O bundle id é "definitivo" (`LOJAS.md:73`). O levantamento já previa "bundle id e política de privacidade próprios" (`LEVANTAMENTO...:59`).
2. Superfície de ataque no binário público. Um app único com "modo cidadão" e "modo agente" publicaria, num IPA/APK baixável por qualquer um, as telas, rotas e tipos do agente (vistoria, saída a campo, devolução) e as permissões dele (`ACCESS_FINE_LOCATION`, câmera: `app.config.ts`). `LOJAS.md:191` já registra como risco de revisão "login sem finalidade visível ao público".
3. Semântica de município incompatível. O app de campo "já é por município" no sentido de build (`app.config.ts`, comentário sobre `DC360_API_URL`) e "o município vem do login" (`LOJAS.md:77`). O cidadão chega sem login e sem município (DH-29).
4. Realm de API próprio (ver 10.3). Um app novo com plateia própria evita que um bug de UI ou de rota do cidadão toque a autorização do agente.
5. Trens de release diferentes. O app do agente é distribuído de forma interna; o do cidadão passa por revisão pública e por atualização que o usuário demora a aplicar. `LOJAS.md:59-60`: "não há ambiente de homologação de pé". Um app público sem homologação é risco novo.
6. A toolchain é a mesma e já foi domada: Expo SDK 57, RN 0.86, pinos de `react-native-reanimated`/`worklets` que só a compilação nativa acusa (`apps/campo/LEIA-ME.md:95-121`). Um segundo app reaproveita o conhecimento e o `metro.config.js` de monorepo.

Contra-argumentos honestos: o levantamento fixa capacidade de "um desenvolvedor, até 10 horas por semana" (`LEVANTAMENTO...:61`); dois apps nativos dobram builds EAS, contas e revisões; parte do que o cidadão precisa (câmera, localização, anexos, fila de envio, push) precisará ser extraída do campo antes de ser usada, e essa extração é trabalho que não existe hoje. Mitigação coerente com o repositório: pacotes extraídos (UI, tokens, cliente HTTP) em vez de copiar pela terceira vez.

Lado da API (achado, não projeto): o precedente é `apps/console` (ADR 0008): processo, plateia, segredo e papel de banco próprios. O relato do cidadão, porém, precisa ESCREVER em dado de município (sob RLS) e o cidadão precisa LER o que é dele, então o desenho de "escreve e não lê" de `interesse_municipio` (`011:110-114`) cobre só a entrada, não o acompanhamento. Se o realm vai ser processo separado, módulo separado na mesma API, ou a mesma API com plateia e papel de banco novos é decisão de arquitetura e de operação (ver riscos R-02 e R-09) e não escolho aqui.

## 10.5 Quais packages atuais podem ser reutilizados sem misturar autorização?

| Módulo | Situação | Condição |
| --- | --- | --- |
| `@dc360/shared`: `coordenadaSchema`, `coordenadaGravadaSchema`, `CASAS_DE_COORDENADA`, `lerLocalizacao`/`coordenadaEmTexto`/`linkParaMapa` | Reaproveitável | Via subcaminho de exportação ou cópia em pacote menor, para não trazer o barril inteiro |
| `@dc360/shared`: `telefone.ts` | Reaproveitável | Nota: "não recusa número" foi escolha para quem liga pedindo socorro (operador), decisão diferente de validar cadastro |
| `@dc360/shared`: `TIPOS_COBRADE`, `ROTULO_TIPO_COBRADE`, `TIPO_A_CLASSIFICAR`, `precisaReclassificar` | Reaproveitável em parte | Se o cidadão ver ou escolher tipo é DH (o domínio diz que a competência técnica é da triagem, `dominio.ts:45-50`) |
| `@dc360/shared`: `evidencia.ts` (`TIPOS_ACEITOS`, `TAMANHO_MAXIMO_BYTES`, `capturaPlausivel`) | Reaproveitável como regra de formato | `pedidoDeEvidenciaSchema` exige `ocorrenciaId`; um pedido de anexo de relato precisa de schema próprio |
| `@dc360/shared`: `mensagens-do-zod.ts` | Reaproveitável | Tem efeito colateral global no import |
| `@dc360/shared`: `protocolo.ts` (`chaveDeStorage`) | Não | Caminho por ocorrência, prefixo de tenant |
| `@dc360/shared`: `permissoes.ts`, `dominio.ts` (`PAPEIS`, `ROTULO_EVENTO_TRILHA`, status), `schemas.ts` (abertura, triagem, vistoria, usuário, envelope), `minuta.ts`, `glifos`, `csv`, `campos.ts` | Não | Autorização ou vocabulário do agente/operador |
| `@dc360/campo`: `transporte.ts` (classificação de falha), `deposito.ts`/`deposito-sqlite.ts` (chave-valor durável) | Reaproveitável como ideia, após extração | Tipados e nomeados para vistoria (`dc360:fila:`, `autor`, `equipe`) |
| `@dc360/campo`: `fila.ts`, `coleta.ts`, `conclusao.ts`, `devolucao.ts`, `prazo.ts`, `conferencia.ts` | Não | Regra de negócio da vistoria |
| Motor "fila de saída com idempotência" como conceito | Reaproveitável como conceito | Se o relato será montado offline (DH) |

---

# §11. Fluxo Cidadão -> Defesa Civil no domínio atual

## 11.1 O modelo atual de ocorrência comporta o relato?

Não. Componente a componente:

| Componente | O que faz hoje | Comporta o relato? | Evidência |
| --- | --- | --- | --- |
| Máquina de estados | `rascunho, registrada, triagem, em_campo, vistoria_concluida, providencia_pendente, encerrada`. Ocorrência nasce `registrada` (`STATUS_INICIAL`). "Triagem" é um estado de ocorrência JÁ registrada, com protocolo. `encerrada` é terminal, com motivo de texto livre. | Não há estado para "rejeitado", "duplicado", "aguardando complemento", "convertido". O pedido "Defesa Civil recebe em TRIAGEM" colide com o vocabulário: hoje estar em `triagem` significa ser ocorrência oficial. | `shared/src/dominio.ts:124-189,227`; `schemas.ts:496-498` |
| `rascunho` | Reservado para a ocorrência aberta sem sinal no app de campo, "antes de existir protocolo"; "Nenhum produtor hoje". Excluído de `ocorrenciaAtiva`, da lista ativa, do mapa, da busca de duplicidade e de alguns índices. | Tentação de usar como "relato". Não serve: o resumo de prestação de contas e o CSV não excluem `rascunho` (nem nenhum status). | `dominio.ts:229-255`; `rotas/ocorrencias.ts:365,463,712`; `rotas/prestacao-de-contas.ts:532-562` (sem predicado de status no `WHERE`) |
| `canal_entrada` | CHECK fechado: `telefone, whatsapp, presencial, oficio, outro`. Nunca alterado por migração posterior (grep em `db/migrations`). É rotulado no laudo, no CSV e num `<select>` do operador. | Precisa de um valor novo (DROP/ADD de CHECK, como a 019 fez com `tipo`). Como o `<select>` de `NovaOcorrencia.tsx:323` lista `CANAIS_ENTRADA`, um operador poderia escolher "app do cidadão" à mão: a origem deixaria de ser confiável. | `001_base.sql:170-171`; `dominio.ts:271-286`; `documentos/laudo.ts:311`; `prestacao-de-contas.ts:481`; `apps/web/src/paginas/NovaOcorrencia.tsx:323` |
| `solicitante_nome` | `NOT NULL`; `aberturaOcorrenciaSchema.solicitanteNome` com mínimo 1. O marcador `'removido por prazo'` da minimização usa a MESMA coluna (`marcador_de_remocao_e_coerente`). | Relato anônimo não cabe: seria preciso inventar um nome, ou mudar a coluna e a regra do marcador. | `001:168`; `schemas.ts:86`; `021_minimizacao_e_registro_de_consulta.sql:142-150` |
| `TIPO_A_CLASSIFICAR` | Tipo `outro` + `tipo_descricao` obrigatória (CHECKs da 019), barrado no despacho. Casa com a ideia "o cidadão descreve, a triagem classifica". | Parcial e bom. Mas a descrição é copiada para a trilha no evento `registro` e em `triagem` (`ocorrencias.ts:684-686,792`), e a 043 declara que ela "FICA por enquanto" fora da minimização (`043:513`). Texto livre do cidadão na trilha append-only fica para sempre. | `dominio.ts:41-74`; `019:85-113`; `schemas.ts:107-127` |
| Consulta de duplicidade | `GET /ocorrencias/duplicidades/consulta`: tipo IGUAL, ocorrência ativa (não encerrada nem rascunho), últimas 48 h, primeiro trecho do endereço (antes da vírgula, mínimo 4 caracteres) em `LIKE '%termo%'`, máximo 10, exige usuário autenticado. | Faz pouco: não usa coordenada (README `:1372` admite que a extensão PostGIS não existe), não usa telefone (`solicitante_contato` está FORA do índice de busca por decisão, `041:71-77`), não escapa `%` e `_` do termo, não olha tipos diferentes nem janelas maiores, e só enxerga ocorrências, nunca relatos. A vinculação (`vinculada_a`) só é gravada no INSERT; não há rota para vincular depois nem para ligar N relatos a 1 ocorrência. | `rotas/ocorrencias.ts:695-720,647,667`; `008:61-63`; `README.md:1372` |
| Tabela `ocorrencias` | Linha oficial: `protocolo` (único por município/ano), `prazo_em`, equipe, interdição, pessoas atingidas, vulnerabilidade. | É o registro do ato administrativo. Não é caixa de entrada. | `001:152-197` |
| Trilha `trilha_eventos` | Append-only (sem policy de UPDATE/DELETE). `ocorrencia_id NOT NULL` com FK composta, `autor_id` ligado a `usuarios` do mesmo município, `autor_papel` só os 4 papéis, `origem` só `campo` ou `escritorio`. | Não comporta evento de relato (sem ocorrência), nem autor-cidadão, nem moderação. | `001:300-324`; `008:107-115`; `rotas/../trilha.ts:21-39` |
| Registro de consulta a dado de cidadão | `ocorrencia_consultas.ocorrencia_id NOT NULL`, `recurso` em lista fechada. | Não registra leitura de relato por servidor. | `021:209-235` |
| Sino de avisos | `avisos.tipo` fechado em 3 valores (`vistoria_recebida`, `prazo_vencido`, `providencia_respondida`), `ocorrencia_id NOT NULL`. Não há aviso de "chamado novo" nem para ocorrência. | Não há como avisar o plantão de relato novo ou de complemento. | `018_sino_de_avisos.sql:52-62` |
| Permissões | `abrir_ocorrencia` (operador, coordenador, administrador), `classificar_triagem` (coordenador, administrador). | Quem tria relato, quem converte, quem rejeita e quem modera é decisão (DH-34); ações novas exigem mexer em `ACOES`, `ROTULO_ACAO`, `PERMISSOES` e nos testes. | `permissoes.ts:18-112` |

## 11.2 Seria errado gravar direto como ocorrência? Sim, e por quê

Cada ponto abaixo é algo que o domínio FAZ com uma ocorrência:

1. Protocolo oficial. `proximo_protocolo` incrementa uma sequência por município e ano e imprime `NNNNNN/AAAA` com teto de 999999 (`001:124-147`). Esse número sai em laudo, termo de interdição e ofício. Relato indevido, duplicado ou spam queimaria numeração oficial e criaria buracos que o município teria de explicar.
2. Prazo e obrigação. A triagem fixa `prazo_em = criado_em + horas` por severidade (`ocorrencias.ts:766-777`), o aviso de prazo e os indicadores de atraso leem `ocorrencias` (`rotas/avisos.ts:270-272`). Relato gravado como ocorrência geraria dívida de SLA que ninguém assumiu.
3. Trilha imutável. A trilha não tem policy de DELETE (`001:323-324`, reforçado pela 034). O que o cidadão escrever e cair na trilha permanece, imune à retenção (lição das migrações 029 e 043: "texto livre nunca entra na trilha").
4. Dado pessoal com ciclo de vida atrelado ao encerramento. A minimização só começa contada do `encerrado_em` da ocorrência (`021:70-74,186-190`) e cobre colunas nomeadas; `evidencias.legenda`, `providencias.descricao` e `tipo_descricao` ficam de fora (`043:505-540`). Relato que nunca vira ocorrência (rejeitado, spam, duplicado) não tem relógio de retenção nenhum.
5. Estatística oficial. `GET /relatorios/resumo` (total, por tipo, por bairro, mediana) conta toda linha de `ocorrencias` no período, sem filtrar status (`prestacao-de-contas.ts:532-562`). O CSV também. As métricas do console nascem do mesmo resumo. Relatos não triados contaminariam os números que o município leva ao Tribunal de Contas.
6. Operação de campo. Uma ocorrência é o que a fila do agente, o despacho e o push consomem. Um relato falso não pode chegar perto disso.
7. Exportação e saída de município. O pacote de saída e a eliminação são catalogados por tabela (`saida/pacote.ts:100-170`; `eliminacao-de-municipio.test.ts:1274-1288`): o dado do cidadão entra no que o município "leva embora".
8. Decisão oficial. Ocorrência é ato: o encerramento exige motivo, o tipo vira COBRADE para o sistema nacional (`dominio.ts:9-20`), a classificação é decisão técnica assinada por servidor. O relato é uma AFIRMAÇÃO de terceiro; só a triagem a transforma em fato oficial.

## 11.3 Novos estados e entidades necessários (enumeração de necessidade, sem desenho de tela nem de esquema)

Entidades: relato do cidadão (com protocolo próprio e município de destino); anexos do relato (fora de `evidencias`, com teto e quota próprios); identidade do cidadão e suas sessões (realm separado); aceites/consentimentos versionados; dispositivos e fichas de push do cidadão; histórico do relato append-only com ator cidadão ou servidor; registro de moderação (decisão, motivo estruturado, autor, anterior/novo); vínculo relato -> ocorrência (N para 1) que sobrevive à minimização; regra de retenção do relato por município; eventos de notificação ao cidadão; bloqueios e sinais de abuso.

Estados do relato necessários conceitualmente (nomes e visibilidade ao cidadão são DH-32): recebido/aguardando triagem; em análise; aguardando complemento do cidadão; rejeitado (com motivo estruturado); duplicado de outro relato ou de ocorrência; convertido em ocorrência; cancelado pelo cidadão; expirado/arquivado.

## 11.4 Como evitar misturar relato do cidadão com decisão oficial

- Separação estrutural: relato em entidade própria, com protocolo de sequência própria e formato distinguível (o `protocoloSchema` atual aceita qualquer `NNNNNN/AAAA`, não distingue). Conversão é ato explícito de servidor com permissão própria, que CRIA a ocorrência e grava o vínculo; nunca promoção automática por estado.
- Canal da ocorrência convertida atribuído pelo sistema, nunca escolhido em formulário (ver `NovaOcorrencia.tsx:323`).
- Na ocorrência convertida, carregar referência (identificador) ao relato, não o texto livre do cidadão na trilha. As migrações 029 e 043 existem porque a primeira decisão ("o relato fica") estava errada (`043:13-31`).
- Números oficiais: todo leitor de `ocorrencias` que faz total (resumo, CSV, métricas do console, prestação de contas) continua correto só se relato nunca estiver lá. Não há teste que prove isso hoje; teria de existir.
- Distinção na tela do servidor e no laudo: o laudo hoje imprime canal e solicitante como declarações do operador (`laudo.ts:311`).

## 11.5 Como evitar que o cidadão veja notas internas

Fato do repositório: não existe um campo "nota interna" dedicado; texto interno está espalhado em colunas de outras tabelas (`ocorrencias.vulnerabilidade_descricao`, `vistorias.observacoes`, `devolucoes_de_tarefa.observacao`, `providencias.descricao/resposta`, `evidencias.legenda`, `trilha_eventos.detalhe` jsonb). A leitura de dossiê devolve `o.*`, a trilha inteira, a vistoria, as providências e a devolução (`rotas/ocorrencias.ts:494-626`). A leitura de lista usa lista de exclusão (`privacidade/lista.ts:38-46`). Consequências para o canal do cidadão:

- Nenhuma leitura do cidadão pode nascer de `ocorrencias.*` nem de view sobre ela sem lista de INCLUSÃO de campos.
- O que o cidadão vê do andamento deve ser uma entidade própria, escrita por servidor, já no formato em que o cidadão lê, e não uma projeção de colunas internas.
- Restrição "só o meu": RLS atual é por município (`app_organizacao_atual()`); restrição por titular exigiria segunda variável de contexto na política do banco (`postgres.ts:236-238` só seta `app.organizacao_atual`), e não fragmento SQL por rota.
- Teste de contrato que varre a resposta do cidadão contra a lista de campos permitidos, nos moldes de `superficie.test.ts`.

## 11.6 Como permitir acompanhamento sem revelar dado sensível

- Protocolo não é segredo: é sequencial (`000123/2026`). Acompanhar "por protocolo" sem segundo fator de conhecimento é enumerável. O padrão de link de uso único do ofício (`rotas/oficios.ts:598-690`) é de consumo único e não serve a consultas repetidas. As opções (conta, protocolo mais contato, segredo emitido no envio) são DH-14.
- Resposta uniforme para protocolo inexistente, de outro município ou de outro cidadão (404 sem distinguir), como o produto já faz (`superficie.test.ts:212-224`, `oficios.ts:676-689`).
- Endereço, coordenada, vulnerabilidade, equipe, severidade, prazo e nome de servidor: decidir quais o cidadão vê (DH-32). Na notificação, vitrine constante sem dado pessoal (`push/mensagem.ts:30-64`).
- Ter registro de leitura também para o acesso do cidadão, se a política exigir (hoje `ocorrencia_consultas` é só de servidor).
- Cabeçalho `no-store` já é global (`servidor.ts:365-367`).

## 11.7 Duplicidade

O que a consulta atual faz e não faz está na tabela de 11.1. Para o fluxo do cidadão faltam: comparar relato com relato (hoje só existe ocorrência); comparar por coordenada (sem PostGIS, sem índice espacial); comparar por contato (campo excluído da busca); tratar erro de digitação de endereço (a busca por `LIKE` do primeiro trecho é o único critério da consulta de duplicidade; a tolerância a erro da migração 041 está na caixa de busca do painel, não nesta consulta); janelas maiores que 48 h; vincular depois da abertura; ligar N relatos a 1 ocorrência; e nunca exibir ao cidadão os vizinhos encontrados (exporia relato ou ocorrência de terceiros). Além disso, `LIKE` sem escape com termo vindo de usuário permite casar mais do que se queria.

## 11.8 Anexos do cidadão e conteúdo malicioso

A cadeia de evidência atual serve PARCIALMENTE, e só como desenho:

Serve: URL de envio pré-assinada com `content-type`, `content-length` e `if-none-match: *` assinados (tamanho imposto, escrita única, `s3.ts:118-121`); leitura do objeto pelo servidor e SHA-256 medido (`evidencias.ts:114-197`); chave com prefixo de tenant por CHECK (`001:258-260`); URL de leitura sempre curta (`tipos.ts:1-16`); evento de trilha ao confirmar.

Não serve, por evidência: permissão `registrar_vistoria` é só de agente (`permissoes.ts:80`); `ocorrencia_id` obrigatório e chave por ocorrência (`003:55-66`; `protocolo.ts`); `anexada_por` ligado a `usuarios` (024); mesmo teto do município (`035:351-353`), logo abuso de cidadão bloqueia evidência de campo; foto avulsa entra sozinha no laudo oficial (`documentos.ts:159-189`); "evidência não se apaga" (032-034) colide com direito do titular e com exclusão de conta; `legenda` livre fora da minimização (`043:525-530`).

Sobre conteúdo malicioso, o que existe e o que não existe:

- Existe: lista fechada de 4 tipos de imagem e teto de 15 MB, por CHECK e por schema (`003:18-29`, `evidencia.ts:17-35`); `escapar()` em todo texto do laudo (`documentos/folha.ts:19-22`); CSP `default-src 'none'` e `nosniff` nas respostas da API (`servidor.ts:344-348`, `superficie.test.ts:226-232`).
- NÃO existe (grep por `exif`, `magic`, `clamav`, `antiv`, `malware`, `file-type`, `image-size` em `apps/api/src`, `apps/campo/src`, `packages`, `db`): verificação do conteúdo real contra o tipo declarado (o servidor lê os bytes só para tamanho e SHA-256, `evidencias.ts:119-138`), antivírus, limite de dimensões, recodificação, remoção de EXIF (só o seletor de foto de perfil passa `exif: false`, `foto-do-agente.ts:96-98`; foto de evidência mantém metadados por ser prova), quarentena até moderação, denúncia de conteúdo.
- Risco de renderização: o laudo embute fotos via URL assinada num Chromium dentro do processo da API (`documentos/pdf.ts:63-97`, `documentos.ts:259-271`). Imagem de terceiro não confiável nesse caminho é superfície nova.

## 11.9 Como registrar moderação

Hoje o produto só tem `motivo_encerramento` em texto livre e `trilha_eventos`. Moderação precisa de registro próprio append-only (nos moldes de `trilha_administrativa`, `ocorrencia_consultas`, `objetos_orfaos`) com: quem decidiu (servidor), sobre qual relato/anexo/conta, decisão e motivo em lista estruturada mais nota interna, estado anterior e novo, e vínculo de reversão. O princípio da casa ("registro não se apaga, se encerra com motivo", `CLAUDE.md`) deve valer, e o texto livre do cidadão não deve ir para o registro de moderação pelo mesmo motivo da 043. A decisão é sempre humana (a política afirma que o sistema não toma decisão automatizada sobre pessoas, `docs/PRIVACIDADE.md` seção 5): isso limita qualquer bloqueio automático por heurística (DH-21, DH-22, DH-25).

## 11.10 A superfície pública atual serve de base para o canal do cidadão?

Serve como base de PADRÕES e de PORTÕES, não de código.

Reaproveitável como padrão (todos com prova):

- Enumeração de rotas e exigência de resposta 401 fora de uma lista curta com razão escrita (`superficie.test.ts`, executado).
- Resposta uniforme contra oráculo (`interesse.ts:78-84`, `autenticacao.ts:171-187`, `enumeracao-pelo-bloqueio.test.ts`).
- Escrita sem leitura por RLS/GRANT (`011:110-114`, `isolamento.test.ts:275-311`).
- Cabeçalhos: `helmet` com CSP `default-src 'none'`, `no-store` global, sem `x-powered-by` (`servidor.ts:344-367`).
- Endereço de origem só de borda declarada (`PROXY_DE_BORDA`, `rede.ts:72-86`); segredo na URL redigido do log (`servidor.ts:139-178`); lista de caminhos de corpo redigidos (`servidor.ts:180-224`).
- Limitador com chave por identidade verificada, endereço quando não há (`rede.ts:117-132`).

Insuficiente ou contrário ao canal do cidadão:

- Anti-automação: nenhuma. Sem CAPTCHA, atestação (App Attest/Play Integrity), prova de trabalho ou convite (grep de `captcha|turnstile|recaptcha|attest|integrity|appcheck` em `apps`, `packages`, `db`: zero). CORS (`servidor.ts:369-379`, origens sem curinga em produção `config.ts:742-744`) só restringe navegador; cliente nativo e `curl` não enviam `Origin` e não são contidos por ele.
- Limite por IP em memória do processo (`@fastify/rate-limit` sem `store`, `servidor.ts:381-398`), com janela de 300/min e 10 logins em 5 minutos (`config.ts:361`, `autenticacao.ts:104-107`). O próprio `rede.ts:92-116` explica que tráfego atrás de um NAT divide um balde; o cidadão em rede móvel está nessa situação. Em dia de evento, 429 para quem relata. Quantas máquinas há em produção é G (`fly.toml:109` fixa mínimo 1).
- Tenancy: toda escrita do produto exige organização vinda do token (`servidor.ts:412-489`, `CLAUDE.md`). Um relato anônimo não tem token; a organização teria de vir de corpo, de geolocalização no servidor ou de escolha do cidadão, e nada disso existe: `organizacoes` não tem código IBGE, slug nem unicidade de (município, UF) (`001:44-50`, grep de `ALTER TABLE organizacoes` em todas as migrações), não há polígono municipal nem PostGIS (`README.md:1372`), e não existe rota pública de lista de municípios (e `/saude` evita de propósito expor nome de município). DH-29.
- Bloqueio de conta: a escrita não confere conta ativa, papel nem sessão (`servidor.ts:449-466`; comentário "DESLIGADO NESTA IMPLANTAÇÃO"; `vigencia-na-escrita.test.ts:102` é `describe.skip`). Conta desativada continua escrevendo por até 15 minutos. Para cidadão abusivo, significa que o bloqueio não vale dentro do token.
- Escala: uma máquina `shared-cpu-1x` de 1 GB que também roda Chromium para PDF (`fly.toml:109,123-128`), pool de 10 conexões (`banco/postgres.ts:152`), e o teste de carga declara que NÃO mede desempenho (`db/test/carga.test.ts:1-30`). Tráfego público de pico de desastre na mesma instância do painel e da fila dos agentes é risco de disponibilidade (R-05).
- Ambiente de homologação inexistente (`LOJAS.md:59-60`).

---

## Matriz D

Legenda de ESTADO: A existe e comprovado; B existe com gap ou regressão; C existe parcialmente; D não existe; E novo requisito da V2; F decisão humana necessária; G não confirmado. Nas linhas de decisão (CID-81 em diante) o número DH-xx remete à seção "Decisões humanas".

| ID | SUPERFÍCIE | DOMÍNIO | REQUISITO / CAPACIDADE | ESTADO | EVIDÊNCIA | RISCO | DEPENDÊNCIAS | DECISÃO HUMANA? | OBSERVAÇÃO |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CID-01 | 5 Cidadão | Existência | Código de app ou portal do cidadão | D | Glob e `git log --all --name-only` sem arquivos; `apps/` = api, campo, console, web; `mockup/` sem visão de cidadão | Alto | Todas as linhas abaixo | Não | Superfície 5 é produto novo |
| CID-02 | 5 Cidadão | Plataforma | App nativo React Native/Expo (Android e iOS), não PWA | E | `LEVANTAMENTO...:57,59`; divergência com `ESPECIFICACAO...` 4.1 (PWA primeiro) | Médio | Toolchain Expo do campo | Não (decidido) | Decisão já tomada pela V2 |
| CID-03 | 5 Cidadão | Reuso | Formulário público de interesse como canal | C | `rotas/interesse.ts:33-85`; `QueroConhecer.tsx:1-280`; `api.test.ts:1282-1364` (4 passaram, executado) | Baixo | Nenhuma | Não | Lead B2G. Só padrões. Sem aviso de privacidade na página |
| CID-04 | 5 Cidadão | Reuso | Padrão "escreve e não lê" para rota pública | A | `011:110-114`; `isolamento.test.ts:275-311` (lido) | Baixo | RLS/GRANT | Não | Cobre só a entrada, não o acompanhamento |
| CID-05 | 5 API | LGPD | Descarte/retenção de `interesse_municipio` (IP, e-mail, telefone) | D | `011:66-68,158-159` prometem; `034:104` só INSERT; nenhuma função/purga (grep) | Médio | DH-33 (precedente) | Sim | Descarte documentado, NÃO CONFIRMADO; código indica ausência |
| CID-06 | 5 API | Superfície | Inventário e portão de rotas sem token | A | `superficie.test.ts:30-64,149-187` (executado, 9 passaram) | Baixo | Nenhuma | Não | 11 isenções, nenhuma de cidadão |
| CID-07 | 5 API | Anti-abuso | Limite de taxa em rota pública de escrita | C | `servidor.ts:381-398` (300/min por IP ou usuário, memória); `interesse.ts` sem limite próprio; `autenticacao.ts:104-107` | Alto | DH-23 | Sim | Sem `store` compartilhado; nº de máquinas G |
| CID-08 | 5 API | Anti-abuso | CAPTCHA, atestação de app/dispositivo, convite | D | grep `captcha\|turnstile\|recaptcha\|attest\|integrity\|appcheck`: zero | Alto | DH-24, DH-26 | Sim | |
| CID-09 | 5 API | Anti-abuso | CORS como controle | B | `servidor.ts:369-379`; `config.ts:354,742-744` | Médio | Nenhuma | Não | Só restringe navegador; não contém cliente nativo |
| CID-10 | 5 API | Anti-abuso | Chave de limite robusta atrás de NAT móvel | B | `rede.ts:92-132` (NAT da prefeitura já reconhecido); cidadão anônimo cai no IP | Alto | DH-23 | Sim | 429 em dia de evento |
| CID-11 | 5 API | Contrato | Versionamento de API | D | grep `/v1` sem prefixo; `ESPECIFICACAO...` 12.2 exige "versionada desde o início" | Alto | Nenhuma | Não | App em loja demora a atualizar |
| CID-12 | 5 API | Integridade | Idempotência na criação de ocorrência/relato | D | `rotas/ocorrencias.ts:629-692` sem chave; vistorias e evidências têm (`001:230`, `004`) | Alto | CID-32 | Não | Duplo envio no 3G gera registro duplicado |
| CID-13 | 5 App+API | Operação | Ambiente de homologação | D | `LOJAS.md:59-60` | Alto | Nenhuma | Não | App público sem homologação |
| CID-14 | 5 API | Operação | Capacidade para pico público de tráfego | G | `fly.toml:109,123-128`; `banco/postgres.ts:152`; `carga.test.ts:1-30` ("NÃO mede desempenho") | Alto | CID-07 | Não | Nenhum número medido; nº de máquinas em produção não confirmado |
| CID-15 | 5 API | Identidade | Conta/identidade do cidadão | E | `001:83-95` (`usuarios`, papel CHECK de 4 servidores); `ADR 0004:18` ("O usuário não é o cidadão") | Crítico | DH-01, DH-30 | Sim | Não reaproveitar `usuarios` |
| CID-16 | 5 API | Identidade | Realm de token próprio (plateia) | E | `auth/tokens.ts:18-42`; precedente `apps/console/src/tokens.ts:12-30`, `plateia-nao-atravessa.test.ts` | Crítico | CID-15 | Não | Precedente A no console |
| CID-17 | 5 API | Autorização | Acesso "só ao meu relato" como regra do banco | E | RLS só por município (`001:207-209`); `postgres.ts:236-238`; recorte por rota (`recorte-do-agente.ts`) | Crítico | CID-15 | Não | Segunda variável de contexto ou equivalente |
| CID-18 | 5 API | Autorização | Papel de banco/RLS para o realm do cidadão | E | `isolamento.test.ts:1173,4005`; ADR 0008 §3 | Alto | DH (arquitetura) | Sim | Gate hoje barra terceiro papel |
| CID-19 | 5 API | Identidade | E-mail/telefone como identificador do cidadão | E | `002:31` (e-mail único global no sistema); login só por e-mail (`autenticacao.ts:7-10`) | Alto | DH-02 | Sim | Colisão com e-mail de servidor |
| CID-20 | 5 API | Identidade | Verificação de e-mail/telefone (OTP ou link) | D | `Notificador` existe (`notificador.ts:16-54,379`); `EMAIL_ATIVO` padrão `nao` (`config.ts:102`); sem SMS/WhatsApp (grep) | Alto | DH-02 | Sim | Provedor não contratado |
| CID-21 | 5 API | Identidade | Recuperação de conta | C | `autenticacao.ts:171-187`; `fly.toml:67` `RECUPERACAO_ATIVA="nao"`; ADR 0004 "pronta e não entrega nada" | Alto | CID-20 | Sim | Existe para servidor, desligada em produção |
| CID-22 | 5 API | Identidade | Login social / gov.br | E | ADR 0004 (federação "quando um edital exigir"); `ESPECIFICACAO...` 12.1 | Médio | DH-04 | Sim | Não há nenhum OIDC no código |
| CID-23 | 5 API | Abuso | Bloqueio de conta efetivo também na escrita | B | Bloqueio por tentativa existe (`002`, `enumeracao-pelo-bloqueio.test.ts`); escrita não confere conta ativa: `servidor.ts:449-466`, `vigencia-na-escrita.test.ts:102` `describe.skip` | Alto | DH-25 | Sim | Token vivo escreve até 15 min. Fora do meu escopo corrigir; cito |
| CID-24 | 5 API | Dispositivo | Sessões e dispositivos do cidadão (listar, revogar) | C | `sessoes` com `user_agent`/`ip` (`002:40-55`); ADR 0004 "não existe registro de dispositivo... tela de sessões" | Médio | DH-26 | Sim | |
| CID-25 | 5 App+API | LGPD/Lojas | Exclusão de conta dentro do app | D | `usuarios` não se apaga, se desativa (`034`; `CLAUDE.md`); `DECLARACAO-NAS-LOJAS.md:384` "exclusão é pedida ao município"; `LEVANTAMENTO...:59` | Alto | DH-27 | Sim | Regra "registro não se apaga" colide |
| CID-26 | 5 App+API | LGPD | Aceite de termos/privacidade/consentimentos com versão e prova | E | grep `termos de uso\|aceite\|consentimento` sem tabela nem rota (o "consentimento" de `packages/campo/src/fila.ts` é outro assunto) | Alto | DH-06, DH-07, DH-08 | Sim | `LEVANTAMENTO...:106` diz que base legal não é consentimento |
| CID-27 | 5 Jurídico | LGPD | Política de privacidade publicada | C | `PRIVACIDADE.md:3-12` "redigida, ainda não publicada", `[[placeholders]]`; `DECLARACAO-NAS-LOJAS.md:563` | P0 | DH-40 | Sim | Escrita para dado ditado por operador, não para coleta direta do titular |
| CID-28 | 5 App+API | LGPD | Canal e função para direitos do titular | D | `PRIVACIDADE.md:287-307` "procure o município"; `IMPLANTACAO.md:21`; nenhuma rota; `LEVANTAMENTO...:108` ("é tela e endpoint") | P0 | DH-28 | Sim | |
| CID-29 | 5 API | LGPD | Registro de quem leu dado de relato | C | `021:209-235` (`ocorrencia_id NOT NULL`, `recurso` fechado) | Médio | CID-32 | Não | Só ocorrência e laudos |
| CID-30 | 5 Jurídico | LGPD | Encarregado (DPO) nomeado | D | `IMPLANTACAO.md:21`; `PRIVACIDADE.md:36-38,412` `[[nome]]` | P0 | DH-28 | Sim | |
| CID-31 | 5 App+API | LGPD | Tratamento de menores | D | `PRIVACIDADE.md:402` ("não é dirigido a menores"); nenhuma verificação de idade no código | Alto | DH-19 | Sim | App em loja aberta contradiz a frase |
| CID-32 | 5 API | Modelo | Entidade RELATO separada de ocorrência | E | Não existe; `ocorrencias` é ato oficial (`001:152-197`) | Crítico | DH-31 | Não | |
| CID-33 | 5 API | Modelo | Protocolo próprio do relato | E | `proximo_protocolo` por município/ano (`001:124-147`); `protocoloSchema` (`schemas.ts:29-31`) não distingue | Alto | CID-32 | Sim | Formato e sequência do relato |
| CID-34 | 5 API | Modelo | Canal de entrada "app do cidadão" na ocorrência convertida | E | CHECK de 5 valores `001:170-171`; `dominio.ts:271-286`; `NovaOcorrencia.tsx:323` | Médio | CID-45 | Não | Não pode ser selecionável por operador |
| CID-35 | 5 API | Modelo | Solicitante anônimo ou não identificado | E | `solicitante_nome NOT NULL` (`001:168`); marcador `'removido por prazo'` (`021:142-150`) | Alto | DH-01 | Sim | |
| CID-36 | 5 API | Modelo | Vínculo relato -> ocorrência (N para 1) que sobrevive à minimização | E | `vinculada_a` só ocorrência->ocorrência e só no INSERT (`ocorrencias.ts:647,667`; `008:61-63`) | Alto | CID-32, CID-45 | Não | |
| CID-37 | 5 API | Modelo | Estados do relato (recebido, em análise, complemento, rejeitado, duplicado, convertido, cancelado) | E | `dominio.ts:124-189` não os tem; motivo de encerramento é texto livre (`schemas.ts:496-498`) | Alto | DH-32 | Sim | |
| CID-38 | 5 API | Auditoria | Histórico append-only do relato com ator cidadão e servidor | E | `trilha_eventos.ocorrencia_id NOT NULL`, `autor_papel` 4 valores, `origem` campo/escritorio (`001:300-312`; `008:107-115`) | Alto | CID-32 | Não | |
| CID-39 | 5 API | Moderação | Registro de moderação (rejeitar, spam, bloquear) | E | Só `motivo_encerramento` livre; nenhuma tabela | Alto | DH-20, DH-21, DH-22, DH-25 | Sim | |
| CID-40 | 1 Web | Triagem | Caixa de entrada de triagem de relatos no painel | E | Páginas em `apps/web/src/paginas/*` sem relato; `GET /ocorrencias` só lista ocorrências | Alto | CID-32 | Não | Cruza com a frente da superfície 1 |
| CID-41 | 1 Web | Notificação interna | Avisar o plantão de relato novo ou complemento recebido | C | Sino existe, mas `avisos.tipo` tem 3 valores e `ocorrencia_id NOT NULL` (`018:52-62`) | Médio | CID-40 | Não | Nem ocorrência nova avisa hoje |
| CID-42 | 1 Web | Triagem | Classificação técnica (tipo, severidade, vulnerabilidade) | C | `ocorrencias.ts:722-799`; `ORIGENS_DA_TRIAGEM` `dominio.ts:208` | Médio | CID-45 | Não | Triagem existe só para ocorrência já oficial |
| CID-43 | 1 Web | Triagem | Tipo "a classificar" quando o cidadão não sabe | C | `dominio.ts:41-74`; `019:85-113`; texto copiado à trilha (`ocorrencias.ts:684-686`) e fora da minimização (`043:513`) | Médio | DH-10 | Não | Serve ao conceito, vaza texto livre para a trilha |
| CID-44 | 1 Web | Duplicidade | Sugestão de duplicidade aplicável a relato | C | `ocorrencias.ts:695-720`: tipo igual, 48 h, primeiro trecho do endereço em `LIKE`, máx. 10; sem coordenada (`README.md:1372`), sem contato (`041:71-77`), sem escape de `%`/`_` | Alto | CID-32 | Não | Só enxerga ocorrências |
| CID-45 | 1 Web | Conversão | Converter relato em ocorrência oficial preservando vínculo | E | `POST /ocorrencias` é formulário do operador (`ocorrencias.ts:629-692`) | Crítico | CID-32, CID-36 | Não | |
| CID-46 | 1 Web | Triagem | Rejeitar relato com motivo estruturado | E | Só encerrar ocorrência com texto livre | Alto | CID-39 | Sim | |
| CID-47 | 1 Web | Triagem | Pedir complemento ao cidadão | E | Nenhum canal de retorno existe (push só de servidor; e-mail só de ofício/recuperação) | Alto | CID-58, CID-65 | Sim | |
| CID-48 | 5 App+API | Comunicação | Canal bidirecional cidadão e Defesa Civil | E | Inexistente | Alto | DH-18 | Sim | |
| CID-49 | 5 App+API | Relato | Cancelamento do relato pelo cidadão | E | Inexistente | Médio | DH-17 | Sim | |
| CID-50 | 5 App+API | Anexos | Fluxo de envio pré-assinado e confirmação com SHA-256 | C | `evidencias.ts:114-197`; `s3.ts:118-121` | Alto | CID-51 | Não | Desenho reaproveitável, código soldado ao agente |
| CID-51 | 5 API | Anexos | Permissão e chave de anexo para cidadão | E | `registrar_vistoria` só de `agente_campo` (`permissoes.ts:80`; `evidencias.ts:211`); `ocorrencia_id NOT NULL`, chave por ocorrência (`003:55-66`) | Alto | CID-32 | Não | |
| CID-52 | 5 API | Anexos | Verificação do conteúdo real, antivírus, limite de dimensão | D | grep `exif\|magic\|clamav\|antiv\|malware\|file-type\|image-size`: zero; servidor lê bytes só para tamanho e SHA-256 (`evidencias.ts:119-138`) | P0 | CID-50 | Não | Tipo é só o declarado |
| CID-53 | 5 App+API | Anexos | EXIF e metadados de foto de cidadão | D | Só `foto-do-agente.ts:96-98` passa `exif: false`; evidência mantém metadados | Alto | DH-09, DH-10 | Sim | Coordenada da casa do cidadão no arquivo |
| CID-54 | 5 API | Anexos | Teto e quota separados (por cidadão e por município) | E | `evidencia_dentro_do_teto` conta tudo em `evidencias` (`035:351-353`; `uso.ts`) | P0 | CID-56 | Sim | Abuso de cidadão trava evidência de campo (507) |
| CID-55 | 5 API | Anexos | Vídeo, áudio, documento | E | `TIPOS_ACEITOS` = 4 imagens (`evidencia.ts:17-22`; CHECK `003:18-29`) | Médio | DH-11, DH-12 | Sim | |
| CID-56 | 5 API | Anexos | Cadeia de evidência serve a anexo de relato | C | Serve: escrita única, SHA-256 medido, prefixo de tenant. Não serve: FK ocorrência, `anexada_por`, teto, laudo automático (`documentos.ts:159-189`), "não se apaga" (032-034) | Alto | CID-51, CID-54 | Sim | Não gravar anexo de cidadão em `evidencias` |
| CID-57 | 5 API | Anexos | URL de leitura assinada e curta, nunca pública | A | `armazenamento/tipos.ts:1-16`; `documentos.ts:259-271` | Baixo | Nenhuma | Não | |
| CID-58 | 5 API | Anexos | Conteúdo ilícito ou ofensivo: detecção, denúncia, remoção | D | Nenhum código | Alto | DH-21 | Sim | Envolve jurídico |
| CID-59 | 5 App | Localização | Captura de coordenada no app (primeiro plano) | C | `vistoria/[id].tsx:1428-1436` (dentro de tela de 3748 linhas); `app.config.ts` permissões | Médio | DH-09 | Sim | Padrão reaproveitável, código não |
| CID-60 | 5 App+API | Localização | Coordenada declarada pelo cidadão é afirmação, não prova | E | Laudo trata coordenada como prova de local (`CLAUDE.md`, `docs/PRIVACIDADE.md` 2.1) | Médio | DH-09 | Sim | Precisão e falsificação |
| CID-61 | 5 API | Localização | Determinar o município a partir de ponto ou escolha sem token | D | `organizacoes` sem IBGE/slug/unicidade (`001:44-50`); sem polígono nem PostGIS (`README.md:1372`); sem lista pública | Crítico | DH-29 | Sim | Conflita com "organização vem do token" |
| CID-62 | 5 App | Localização | Mapa para o cidadão (subprocessador Google) | C | `app.config.ts` chave por binário e plataforma; `GET /configuracao` exige auth (`configuracao.ts:101`); `SUBPROCESSADORES.md` 2.2 | Médio | DH-39 | Sim | Coordenada do cidadão vai ao Google |
| CID-63 | 5 API | Acompanhamento | Leitura autenticada do próprio relato | E | Inexistente; leituras atuais são de servidor (`ocorrencias.ts:494-626`) | Alto | CID-17 | Não | |
| CID-64 | 5 API | Acompanhamento | Consulta por protocolo sem conta | E | Protocolo sequencial e enumerável (`001:145`); link de uso único do ofício não serve (`oficios.ts:598-690`) | Alto | DH-14 | Sim | |
| CID-65 | 5 API | Acompanhamento | Projeção de INCLUSÃO de campos para o cidadão | D | Padrão atual é `SELECT o.*` com lista de EXCLUSÃO (`privacidade/lista.ts:38-46`) | P0 | CID-63 | Não | Coluna nova vaza por padrão |
| CID-66 | 5 API | Acompanhamento | Separar texto interno do que o cidadão vê | E | Sem campo "nota interna"; texto interno espalhado (`vulnerabilidade_descricao`, `observacoes`, `observacao`, `providencias.descricao`, `legenda`, `detalhe`) | P0 | CID-65 | Sim | |
| CID-67 | 5 App+API | Notificações | Push ao cidadão | E | `aparelhos.usuario_id` FK `usuarios` (`016:78-107`); 2 tipos de aviso; `APNS_BUNDLE` único (`config.ts:229`, `fly.toml:98`); `FCM_CONTA_SERVICO` único (`config.ts:267`) | Alto | DH-15, DH-08 | Sim | |
| CID-68 | 5 API | Notificações | Vitrine sem dado pessoal na tela bloqueada | A | `push/mensagem.ts:30-64` (vitrine constante) | Baixo | Nenhuma | Não | Princípio reaproveitável |
| CID-69 | 5 API | Notificações | E-mail transacional ao cidadão | C | Porta `Notificador` e Resend (`notificador.ts:16-54,170,379`); `EMAIL_ATIVO` padrão `nao`; produção sem provedor (`fly.toml:60-67`) | Alto | DH-02 | Sim | |
| CID-70 | 5 API | LGPD | Retenção e minimização de relato não convertido | E | Minimização conta de `encerrado_em` da ocorrência (`021:70-74,186-190`); `interesse_municipio` sem purga | Alto | DH-33 | Sim | |
| CID-71 | 5 API | LGPD | Saída e eliminação de município cobrem as tabelas novas | A | `saida/pacote.ts:100-170`; `eliminacao-de-municipio.test.ts:1274-1288` (lidos) | Médio | CID-32 | Não | Gates por catálogo vão reprovar tabela sem classificação. Bom. Identidade global do cidadão fica fora disso |
| CID-72 | 5 API | Isolamento | Gates universais de RLS pegam tabela nova | A | `isolamento.test.ts:260-436` (lidos) | Baixo | CID-15 | Não | Tabela global de cidadão exigiria isenção nomeada |
| CID-73 | 5 CI | Qualidade | `npm audit` e `verificar` alcançam o novo app | D | `scripts/auditar.mjs:109` e `testar-campo.mjs:65` com `apps/campo` fixo; `package.json:5-11` `workspaces` | Alto | Nenhuma | Não | Novo app escaparia do gate |
| CID-74 | 5 App | Lojas | Publicação pública (bundle, ficha, rótulos de privacidade, conteúdo de usuário, conta demo) | E | `LOJAS.md:14,73,238,242`; `LEVANTAMENTO...:59`; `DECLARACAO-NAS-LOJAS.md:563` | Alto | DH-38, DH-40 | Sim | Regras de loja citadas no levantamento: NÃO CONFIRMADAS por mim |
| CID-75 | 5 API | Observabilidade | Logs sem dado pessoal do cidadão | C | `servidor.ts:284-293` registra `remoteAddress`; lista de redação é do agente (`:180-224`) | Médio | DH-28 | Sim | IP em log é dado pessoal; retenção de log G |
| CID-76 | 5 API | Operação | Município suspenso ou sem canal habilitado: resposta ao cidadão | E | Suspensão só para servidor (`auth/suspensao.ts`; `servidor.ts:428-466`) | Médio | DH-31 | Sim | |
| CID-77 | 5 Testes | Qualidade | Portões de isolamento, superfície e contrato para o novo realm | E | Padrão existe (`superficie.test.ts`, `plateia-nao-atravessa.test.ts`) | Alto | CID-16 | Não | |
| CID-78 | 5 API | Anexos | Anexo entra no laudo oficial só por escolha explícita do servidor | D | `documentos.ts:159-189` inclui avulsas automaticamente | P0 | CID-56 | Não | |
| CID-79 | 5 API | Integridade | Relato excluído de resumo, CSV, métricas e prestação de contas | E | `prestacao-de-contas.ts:532-562` sem filtro de status | P0 | CID-32 | Não | Garantido só se relato nunca estiver em `ocorrencias` |
| CID-80 | 5 API | Relógio | Relógio de triagem do relato e prazo da ocorrência convertida | F | `prazo_em = criado_em + horas` (`ocorrencias.ts:769`) | Médio | DH-35 | Sim | |
| CID-81 | 5 Decisão | Identidade | Cidadão cria conta ou relata anonimamente | F | DH-01 | Crítico | | Sim | |
| CID-82 | 5 Decisão | Identidade | Telefone e e-mail obrigatórios | F | DH-02 | Alto | | Sim | |
| CID-83 | 5 Decisão | Identidade | CPF | F | DH-03 | Alto | | Sim | O produto evita CPF hoje (`011:25-28`) |
| CID-84 | 5 Decisão | Identidade | Autenticação social e gov.br | F | DH-04 | Médio | | Sim | |
| CID-85 | 5 Decisão | Identidade | Recuperação de conta | F | DH-05 | Alto | | Sim | |
| CID-86 | 5 Decisão | LGPD | Aceite de termos | F | DH-06 | Alto | | Sim | |
| CID-87 | 5 Decisão | LGPD | Aceite de privacidade | F | DH-07 | Alto | | Sim | |
| CID-88 | 5 Decisão | LGPD | Consentimentos | F | DH-08 | Alto | | Sim | |
| CID-89 | 5 Decisão | Localização | Uso de localização | F | DH-09 | Alto | | Sim | |
| CID-90 | 5 Decisão | Anexos | Foto | F | DH-10 | Alto | | Sim | |
| CID-91 | 5 Decisão | Anexos | Vídeo | F | DH-11 | Médio | | Sim | |
| CID-92 | 5 Decisão | Anexos | Outros anexos | F | DH-12 | Médio | | Sim | |
| CID-93 | 5 Decisão | Anexos | Limite de anexos | F | DH-13 | Alto | | Sim | |
| CID-94 | 5 Decisão | Acompanhamento | Acompanhamento por protocolo | F | DH-14 | Alto | | Sim | |
| CID-95 | 5 Decisão | Notificações | Notificações push | F | DH-15 | Médio | | Sim | |
| CID-96 | 5 Decisão | Relato | Complementação posterior | F | DH-16 | Médio | | Sim | |
| CID-97 | 5 Decisão | Relato | Cancelamento | F | DH-17 | Médio | | Sim | |
| CID-98 | 5 Decisão | Comunicação | Comunicação com a Defesa Civil | F | DH-18 | Alto | | Sim | |
| CID-99 | 5 Decisão | LGPD | Menores de idade | F | DH-19 | Alto | | Sim | |
| CID-100 | 5 Decisão | Abuso | Denúncia falsa | F | DH-20 | Alto | | Sim | |
| CID-101 | 5 Decisão | Abuso | Abuso | F | DH-21 | Alto | | Sim | |
| CID-102 | 5 Decisão | Abuso | Spam | F | DH-22 | Alto | | Sim | |
| CID-103 | 5 Decisão | Abuso | Rate limit | F | DH-23 | Alto | | Sim | |
| CID-104 | 5 Decisão | Abuso | CAPTCHA e anti-bot | F | DH-24 | Alto | | Sim | |
| CID-105 | 5 Decisão | Abuso | Bloqueio de conta | F | DH-25 | Alto | | Sim | |
| CID-106 | 5 Decisão | Dispositivo | Dispositivo | F | DH-26 | Médio | | Sim | |
| CID-107 | 5 Decisão | LGPD | Exclusão de conta | F | DH-27 | Alto | | Sim | |
| CID-108 | 5 Decisão | LGPD | Direitos LGPD do titular | F | DH-28 | P0 | | Sim | |
| CID-109 | 5 Decisão | Município | Como o município é determinado | F | DH-29 | Crítico | | Sim | |
| CID-110 | 5 Decisão | Identidade | Conta global ou por município | F | DH-30 | Alto | | Sim | |
| CID-111 | 5 Decisão | Município | Habilitação do canal por município, moderação e SLA | F | DH-31 | Alto | | Sim | |
| CID-112 | 5 Decisão | Acompanhamento | O que o cidadão vê do andamento | F | DH-32 | Alto | | Sim | |
| CID-113 | 5 Decisão | LGPD | Retenção de relato não convertido, rejeitado, spam | F | DH-33 | Alto | | Sim | |
| CID-114 | 5 Decisão | Autorização | Papel de triagem do relato e formato do protocolo | F | DH-34 | Médio | | Sim | |
| CID-115 | 5 Decisão | Relógio | Prazo de triagem e início do prazo da ocorrência | F | DH-35 | Médio | | Sim | |
| CID-116 | 5 Decisão | Relato | Relato em nome de terceiros e dado sensível declarado | F | DH-36 | Alto | | Sim | |
| CID-117 | 5 Decisão | Escopo | Natureza do canal (não é emergência) e competência | F | DH-37 | Alto | | Sim | |
| CID-118 | 5 Decisão | Lojas | Titular da conta de loja, marca, categoria, classificação etária | F | DH-38 | Médio | | Sim | |
| CID-119 | 5 Decisão | Mapa | Mapa e subprocessadores para o cidadão | F | DH-39 | Médio | | Sim | |
| CID-120 | 5 Decisão | LGPD | Quem é controlador dos dados da conta do app | F | DH-40 | Alto | | Sim | |

---

## Fluxos

Fluxo "Cidadão -> Defesa Civil". Estado: EXISTE (comprovado), PARCIAL, AUSENTE (deveria existir e não existe), NOVO V2 (não existia por ser da V2, e nada foi construído).

| FLUXO | PASSO | ESTADO | EVIDÊNCIA |
| --- | --- | --- | --- |
| Cidadão -> Defesa Civil | 1. Cidadão encontra e instala o app na loja pública (bundle e ficha próprios) | NOVO V2 | `LOJAS.md:14,73,238,242` (app de campo é interno); `LEVANTAMENTO...:59` |
| Cidadão -> Defesa Civil | 2. Define o município de destino sem ter token | NOVO V2 | `organizacoes` sem IBGE (`001:44-50`); sem polígono/PostGIS (`README.md:1372`); regra "org do token" (`CLAUDE.md`, `servidor.ts:412-489`) |
| Cidadão -> Defesa Civil | 3. Cria conta ou segue como anônimo | NOVO V2 | ADR 0004:18; `001:83-95`; `002:31` |
| Cidadão -> Defesa Civil | 4. Verifica e-mail ou telefone | AUSENTE | `Notificador` existe mas desligado (`config.ts:102`, `fly.toml:67`); sem SMS (grep) |
| Cidadão -> Defesa Civil | 5. Aceita termos, privacidade e consentimentos, com versão registrada | AUSENTE | grep sem tabela nem rota; `PRIVACIDADE.md:3-12` não publicada |
| Cidadão -> Defesa Civil | 6. Descreve o relato (texto, tipo ou "a classificar", local, vulnerabilidade declarada) | PARCIAL | Esquema do operador `aberturaOcorrenciaSchema` (`schemas.ts:85-128`), COBRADE e "a classificar" (`dominio.ts:9-74`), coordenada (`localizacao.ts`). Nenhum schema de relato |
| Cidadão -> Defesa Civil | 7. Anexa fotos | PARCIAL | Fluxo de envio existe (`evidencias.ts:114-474`) mas só para agente e atrelado a ocorrência (`permissoes.ts:80`, `003:55-66`) |
| Cidadão -> Defesa Civil | 8. Envia com tolerância a falha de rede, sem duplicar | PARCIAL | Idempotência existe em vistoria e evidência (`001:230`, `004`); `POST /ocorrencias` não tem (`ocorrencias.ts:629-692`); fila local é do agente |
| Cidadão -> Defesa Civil | 9. Entrada protegida contra abuso | PARCIAL | Limite global e de login (`servidor.ts:381-398`, `autenticacao.ts:104`); sem CAPTCHA/atestação; vigência desligada (`servidor.ts:449-462`) |
| Cidadão -> Defesa Civil | 10. Relato recebe protocolo próprio | AUSENTE | `proximo_protocolo` é da ocorrência (`001:124-147`) |
| Cidadão -> Defesa Civil | 11. Defesa Civil recebe o relato na triagem (caixa de entrada) | AUSENTE | Páginas do painel e `GET /ocorrencias` só tratam ocorrência; sino sem tipo de relato (`018:52-62`) |
| Cidadão -> Defesa Civil | 12. Operador analisa (com registro de leitura de dado de cidadão) | PARCIAL | `registrarConsulta` só para ocorrência (`021:209-235`; `ocorrencias.ts:599-604`) |
| Cidadão -> Defesa Civil | 13. Rejeita com motivo | AUSENTE | Só encerramento de ocorrência com texto livre (`schemas.ts:496-498`) |
| Cidadão -> Defesa Civil | 14. Pede complemento e recebe resposta | AUSENTE | Sem canal de retorno; push só para servidor (`016:107`) |
| Cidadão -> Defesa Civil | 15. Marca duplicidade | PARCIAL | Consulta para ocorrência (`ocorrencias.ts:695-720`); vínculo só no INSERT (`:647,667`); nada para relato nem N para 1 |
| Cidadão -> Defesa Civil | 16. Classifica (tipo, severidade, vulnerabilidade) | PARCIAL | Triagem de ocorrência existe (`ocorrencias.ts:722-799`); de relato não |
| Cidadão -> Defesa Civil | 17. Converte em ocorrência oficial | AUSENTE | Só `POST /ocorrencias` do operador (`:629-692`); `canal_entrada` sem valor de app (`001:170-171`) |
| Cidadão -> Defesa Civil | 18. Conversão preserva vínculo com o relato original | AUSENTE | `vinculada_a` é ocorrência->ocorrência (`008:61-63`) |
| Cidadão -> Defesa Civil | 19. Depois da conversão: despacho, vistoria, providência, encerramento | EXISTE | `ocorrencias.ts:801-1170`; `packages/shared/src/dominio.ts:155-189` (escopo de outras frentes) |
| Cidadão -> Defesa Civil | 20. Cidadão acompanha o andamento sem ver nota interna | AUSENTE | Sem rota pública de acompanhamento (`superficie.test.ts:30-64`); leitura atual devolve `o.*` e trilha (`ocorrencias.ts:494-626`) |
| Cidadão -> Defesa Civil | 21. Cidadão é notificado (push ou e-mail) | AUSENTE | `aparelhos` preso a `usuarios` (`016:107`); bundle único (`config.ts:229`) |
| Cidadão -> Defesa Civil | 22. Cidadão complementa ou cancela | AUSENTE | Inexistente |
| Cidadão -> Defesa Civil | 23. Moderação e bloqueio de abuso com registro | AUSENTE | Sem tabela; escrita não confere conta ativa (`vigencia-na-escrita.test.ts:102` skip) |
| Cidadão -> Defesa Civil | 24. Retenção e minimização do relato | AUSENTE | Minimização é da ocorrência encerrada (`021:70-74,186-190`) |
| Cidadão -> Defesa Civil | 25. Cidadão exerce direitos do titular e exclui a conta | AUSENTE | `PRIVACIDADE.md:306`; `DECLARACAO-NAS-LOJAS.md:384` |
| Cidadão -> Defesa Civil | 26. Relato fora das estatísticas oficiais e da exportação de município | AUSENTE | Resumo e CSV contam toda linha de `ocorrencias` (`prestacao-de-contas.ts:532-562`); catálogos de saída/eliminação forçam classificar tabela nova (`pacote.ts:100-170`) |

---

## Gaps

Tag única por gap.

1. P0 SEGURANÇA: Não há realm de identidade e autorização do cidadão; reaproveitar `usuarios`/`Papel`/plateia `dc360` misturaria autorização (`001:89,307`, `tokens.ts:20,41`, `002:31`, ADR 0004:18).
2. P0 SEGURANÇA: Leitura pública hoje seria `SELECT o.*` com lista de exclusão; coluna nova vaza por padrão (`privacidade/lista.ts:38-46`). Toda leitura do cidadão exige lista de inclusão e teste de contrato.
3. P0 SEGURANÇA: Restrição "só o meu" inexistente no banco; o padrão de recorte por fragmento SQL em rota já causou vazamento (`recorte-do-agente.ts`).
4. P0 SEGURANÇA: Anexos sem verificação de conteúdo, antivírus, limite de dimensão, nem remoção de EXIF; tipo apenas declarado (`evidencias.ts:119-138`; grep negativo).
5. P0 SEGURANÇA: Teto de armazenamento compartilhado: upload de cidadão pode esgotar o teto e fazer o servidor devolver 507 à evidência de campo (`035:351-353`; `evidencias.ts:353-375`).
6. P0 INTEGRIDADE: Foto avulsa em `evidencias` entra automaticamente no laudo oficial (`rotas/documentos.ts:159-189`); anexo de cidadão nessa tabela viraria "prova" no documento com brasão.
7. P0 INTEGRIDADE: Relato gravado como ocorrência inflaria resumo, CSV, métricas e prestação de contas (`prestacao-de-contas.ts:532-562`), queimaria sequência oficial de protocolo (`001:124-147`) e gravaria texto livre em trilha imutável (`ocorrencias.ts:684-686`; `001:323-324`).
8. P0 INTEGRIDADE: Esquema atual não representa relato: `canal_entrada` CHECK, `solicitante_nome NOT NULL`, `trilha_eventos` e `ocorrencia_consultas` amarrados a ocorrência e a servidor, `vinculada_a` só no INSERT.
9. P0 LGPD: Política de privacidade não publicada, com campos `[[ ]]`, escrita para dado ditado por operador e não para coleta direta do titular (`PRIVACIDADE.md:3-12`; `DECLARACAO-NAS-LOJAS.md:563`).
10. P0 LGPD: Não há encarregado nomeado, nem canal ou função para direitos do titular ("procure o município", `PRIVACIDADE.md:306`; `IMPLANTACAO.md:21`).
11. P0 LGPD: Sem registro de aceite e sem tratamento de menores, num app de loja aberta que a própria política diz não ser dirigido a menores (`PRIVACIDADE.md:402`).
12. P0 SEGURANÇA: Sem anti-automação (CAPTCHA, atestação) e com limite em memória por IP, vulnerável a abuso em escala e a NAT móvel (`servidor.ts:381-398`; `rede.ts:92-132`).
13. P0 SEGURANÇA: Bloqueio de conta não vale dentro do token vivo (`servidor.ts:449-466`; `vigencia-na-escrita.test.ts:102`). Achado da frente de autenticação, citado porque o bloqueio de cidadão depende dele.
14. A DEFINIR: Município do relato sem token conflita com a regra de organização vinda do token; sem IBGE, polígono ou lista pública (`001:44-50`; `README.md:1372`). Depende de DH-29.
15. A DEFINIR: Identidade global ou por município, e onde ela mora em relação ao RLS (`isolamento.test.ts:160-215`, exceções nomeadas). Depende de DH-30.
16. A DEFINIR: Gate de papel de banco (`isolamento.test.ts:1173,4005`) só admite `dc360_app` e dono em tabela de negócio; realm separado com papel próprio exige evoluir o gate por decisão.
17. P1 OPERAÇÃO: Sem provedor de e-mail ou SMS em produção (`fly.toml:60-67`; `config.ts:102`; grep de SMS), logo sem verificação de contato nem recuperação de conta do cidadão.
18. P1 OPERAÇÃO: Capacidade para tráfego público de pico não medida; máquina única pequena que também gera PDF em Chromium (`fly.toml:109,123-128`; `carga.test.ts:1-30`). Nº de máquinas reais G.
19. P1 OPERAÇÃO: Sem ambiente de homologação (`LOJAS.md:59-60`).
20. P1 PRODUTO: Sem idempotência na criação de ocorrência/relato e sem versionamento de API (`ocorrencias.ts:629-692`; grep `/v1`).
21. P1 PRODUTO: Push preso a `usuarios`, a dois tipos de aviso e a um bundle/projeto FCM (`016:107`; `config.ts:229,267`).
22. P1 PRODUTO: Duplicidade insuficiente para o volume e a natureza de relatos (sem coordenada, contato, relato, janelas maiores, escape de `LIKE`) (`ocorrencias.ts:695-720`).
23. P1 PRODUTO: Sem caixa de entrada de triagem no painel e sem aviso ao plantão para relato novo (`018:52-62`).
24. P1 PRODUTO: Sem pacotes compartilhados de UI, tokens e cliente HTTP; quarto cliente e terceira cópia de tokens (`tokens.ts:1-14`; três clientes).
25. P1 CONTINUIDADE: Scripts de gate (`auditar.mjs:109`, `testar-campo.mjs:65`) e `workspaces` ignoram um novo app; `npm audit` zero não o alcança até ajuste.
26. P1 CONTINUIDADE: Documentação de loja, declaração de privacidade e rótulos existentes descrevem só o app do agente (`LOJAS.md:14`; `DECLARACAO-NAS-LOJAS.md`).
27. P1 OPERAÇÃO: IP do cidadão em log (`servidor.ts:292`) e em `interesse_municipio` (`011:71`) sem retenção definida nem purga implementada.
28. P2 EVOLUÇÃO: Extrair subcaminhos de `@dc360/shared` para não embarcar permissões e vocabulário do agente no app público.
29. A DEFINIR: Política de moderação, denúncia falsa, spam e abuso (DH-20 a DH-22), incluindo remoção de conteúdo ilícito.
30. A DEFINIR: Retenção de relato não convertido e de anexos do cidadão (DH-33), e conflito entre "prova não se apaga" e direito do titular.

---

## Decisões humanas

Regra deste bloco: apenas mapear. Nenhuma alternativa é recomendada. "Risco" de cada alternativa é risco técnico, de produto, de privacidade ou de operação que o repositório ou os documentos apontam. Onde há tema legal, o texto apenas indica que a escolha depende de parecer do jurídico; não cito artigo de lei que o repositório não cite.

### DH-01. O cidadão cria conta ou relata anonimamente? (DECISÃO HUMANA)
- Por que importa: define quem é o titular, o canal de retorno, o custo de abuso e o que `solicitante_nome NOT NULL` (`001:168`) vira.
- Bloqueia: identidade, protocolo, acompanhamento, notificação, exclusão, anti-abuso, conversão.
- Alternativas e riscos: (a) só com conta: atrito em situação de risco e mais dado pessoal guardado; (b) só anônimo: sem retorno, sem complemento, sem bloqueio por pessoa, e acompanhamento por segredo; (c) ambos: dois caminhos de segurança e de moderação, e a ocorrência convertida precisa de representação de "não identificado". Em qualquer caso, `solicitante_nome` precisa de regra nova.

### DH-02. Telefone e e-mail são obrigatórios? (DECISÃO HUMANA)
- Por que importa: é o canal de retorno e de verificação; `usuarios` já exige e-mail único global (`002:31`).
- Bloqueia: verificação, recuperação, notificação, duplicidade por contato.
- Alternativas e riscos: (a) e-mail obrigatório: exige provedor (hoje desligado em produção) e deixa de fora quem não usa; (b) telefone obrigatório: exige provedor de SMS ou WhatsApp que não existe e tem custo por mensagem; (c) nenhum obrigatório: sem retorno garantido; (d) qualquer um dos dois: dois fluxos de verificação.

### DH-03. Pede CPF? (DECISÃO HUMANA)
- Por que importa: o produto evita CPF de propósito ("nada de CPF, nada de dado de cidadão", `011:25-28`; `schemas.ts:1005-1009`). CPF aumenta obrigação e valor de ataque.
- Bloqueia: desduplicação de pessoa, vínculo com gov.br, anti-abuso por pessoa.
- Alternativas e riscos: (a) não pedir: menos proteção contra múltiplas contas; (b) pedir e validar formato: dado pessoal a mais, necessidade precisa ser justificada; (c) pedir via gov.br sem guardar: dependência de federação.

### DH-04. Autenticação social e gov.br? (DECISÃO HUMANA)
- Por que importa: ADR 0004 adiou federação "até um edital exigir"; `ESPECIFICACAO...` 12.1 diz "avaliar para portal externo". Dado pessoal passa por terceiro e pode sair do país.
- Bloqueia: escolha de provedor, contrato, subprocessadores, regras de loja para login de terceiro.
- Alternativas e riscos: (a) só e-mail e senha próprios: superfície de autenticação própria (ADR 0004) e recuperação dependente de provedor de e-mail; (b) gov.br: dependência externa e regras de credenciamento; (c) Google/Apple: dado com terceiro privado e possíveis exigências das lojas (citadas no levantamento, NÃO CONFIRMADAS por mim); (d) combinação: mais fluxos para proteger.

### DH-05. Recuperação de conta? (DECISÃO HUMANA)
- Por que importa: hoje a recuperação de servidor existe e está desligada em produção (`fly.toml:67`, ADR 0004).
- Bloqueia: experiência de quem perde o aparelho, e vetor de tomada de conta.
- Alternativas e riscos: (a) link por e-mail: exige provedor; (b) código por SMS: custo e troca de chip; (c) sem recuperação, conta nova: perde histórico e vínculo com relato; (d) suporte humano da Defesa Civil: carga operacional e engenharia social.

### DH-06. Aceite de termos de uso? (DECISÃO HUMANA, com jurídico)
- Por que importa: não existe texto de termos nem registro de aceite (grep).
- Bloqueia: submissão às lojas, regras de conteúdo e de moderação.
- Alternativas e riscos: (a) aceite explícito versionado: precisa de tabela, versão e prova; (b) aviso sem aceite: menos prova; (c) sem termos: conflita com conteúdo gerado por usuário e com regras de loja.

### DH-07. Aceite de política de privacidade? (DECISÃO HUMANA, com jurídico)
- Por que importa: a política não está publicada e o levantamento diz que a base legal de Defesa Civil "não é consentimento" e que não se deve construir "telas de consentimento como se fosse app de varejo" (`LEVANTAMENTO...:106`).
- Bloqueia: publicação nas lojas, texto de tela.
- Alternativas e riscos: (a) ciência registrada sem ser consentimento: exige redação jurídica precisa para não parecer consentimento; (b) aceite como consentimento: pode contrariar a base legal que o próprio levantamento aponta; (c) só link: menos prova de informação ao titular.

### DH-08. Quais consentimentos separados existem (push, localização, compartilhamento com órgãos, foto)? (DECISÃO HUMANA, com jurídico)
- Por que importa: permissão do sistema operacional não é, por si, base legal; o que exige consentimento próprio é questão jurídica que não resolvo.
- Bloqueia: modelo de aceites, tela de ajustes, revogação.
- Alternativas e riscos: (a) só permissões do sistema: menos prova; (b) consentimentos granulares com histórico: mais tabelas, revogação que precisa propagar; (c) nenhum além da política: depende de a base legal cobrir tudo.

### DH-09. Uso de localização? (DECISÃO HUMANA)
- Por que importa: o laudo trata coordenada como prova de local; coordenada do cidadão é afirmação. `SUBPROCESSADORES.md` 2.2: coordenada de imóvel é dado sobre pessoa identificável.
- Bloqueia: permissão do app (`app.config.ts`), precisão, mapa, determinação de município, EXIF.
- Alternativas e riscos: (a) GPS do aparelho em primeiro plano: pode ser falso ou impreciso, e o cidadão pode estar longe do fato; (b) endereço digitado: sem coordenada, pior para triagem (`dominio.ts` comenta a rua sem numeração); (c) ponto escolhido no mapa: depende de subprocessador de mapa; (d) combinação, com marca de origem do dado.

### DH-10. Foto? (DECISÃO HUMANA)
- Por que importa: foto mostra a casa e a rua de família em risco (`armazenamento/tipos.ts:1-16`) e pode trazer rostos e EXIF.
- Bloqueia: fluxo de upload, EXIF, moderação, política de retenção.
- Alternativas e riscos: (a) sem foto: triagem mais cega; (b) foto opcional com EXIF removido: perde evidência de local e data; (c) foto com EXIF preservado: localização da casa do cidadão vai no arquivo e na trilha.

### DH-11. Vídeo? (DECISÃO HUMANA)
- Por que importa: hoje só há imagem (`evidencia.ts:17-22`; CHECK `003:18-29`). Vídeo multiplica tamanho, custo e superfície de conteúdo.
- Bloqueia: limites, armazenamento, renderização, moderação.
- Alternativas e riscos: (a) sem vídeo; (b) vídeo curto com teto: custo e transcodificação; (c) vídeo livre: abuso de armazenamento e conteúdo impróprio.

### DH-12. Outros anexos (documento, áudio, PDF)? (DECISÃO HUMANA)
- Por que importa: cada tipo tem perfil próprio de risco (macros, scripts, PII em documento).
- Bloqueia: lista de tipos e validadores.
- Alternativas e riscos: (a) só imagem; (b) acrescentar PDF/áudio: exige verificação de conteúdo que não existe (CID-52); (c) qualquer arquivo: risco alto.

### DH-13. Limite de anexos (quantidade, tamanho, por relato, por dia, por cidadão)? (DECISÃO HUMANA)
- Por que importa: o teto hoje é por município e contado junto com a evidência dos agentes (`035:351-353`).
- Bloqueia: quota, custo de armazenamento, teto separado.
- Alternativas e riscos: (a) limites baixos: corta evidência útil; (b) limites altos: custo e abuso; (c) limite por município configurável: quem decide o número (o teto é do fornecedor, `035:30-32`)?

### DH-14. Acompanhamento por protocolo: como o cidadão prova que é dono do protocolo? (DECISÃO HUMANA)
- Por que importa: o protocolo é sequencial (`000123/2026`) e enumerável; a especificação fala em "portal limitado por protocolo".
- Bloqueia: rota de consulta, projeção de campos, registro de leitura.
- Alternativas e riscos: (a) só com conta: exclui anônimo; (b) protocolo mais contato informado: depende de contato verificado; (c) protocolo mais segredo emitido no envio (padrão do link do ofício, mas reutilizável): segredo perdido, perde acesso; (d) só protocolo: enumeração e vazamento de status.

### DH-15. Notificações push ao cidadão? (DECISÃO HUMANA)
- Por que importa: a notificação atravessa Apple e Google e fica na tela bloqueada (`push/mensagem.ts:1-30`). Hoje o envio não sabe de dois aplicativos (`config.ts:229,267`).
- Bloqueia: tabela de aparelhos, tipos de aviso, consentimento, conteúdo.
- Alternativas e riscos: (a) sem push, só consulta: menos custo, menos alcance; (b) push com vitrine constante sem dado: reaproveita o princípio, mas o cidadão não vê o conteúdo sem abrir; (c) push com texto do andamento: dado do relato em tela bloqueada e em subprocessador.

### DH-16. Complementação posterior (o cidadão acrescenta informação depois de enviar)? (DECISÃO HUMANA)
- Por que importa: a trilha é imutável; complemento é evento novo, com autor cidadão, que não cabe hoje.
- Bloqueia: modelo de histórico, regra de quando pode (antes da triagem, depois), moderação.
- Alternativas e riscos: (a) não permitir: relato incompleto fica como está; (b) só quando o servidor pedir: exige canal de retorno; (c) livre: abre porta a abuso e a alteração de relato já em análise.

### DH-17. Cancelamento pelo cidadão? (DECISÃO HUMANA)
- Por que importa: "registro não se apaga, se encerra com motivo" (`CLAUDE.md`); cancelar não pode virar apagar, e relato já convertido é ato oficial.
- Bloqueia: estados do relato, regra de corte (até quando).
- Alternativas e riscos: (a) permitido até a triagem: simples, mas o cidadão pode cancelar aviso de risco real; (b) permitido sempre como "retirada" registrada, sem efeito sobre ocorrência já aberta: precisa explicar ao cidadão; (c) não permitido: pressão por exclusão de conta.

### DH-18. Comunicação com a Defesa Civil (mensagens, chat, ligação, nenhuma)? (DECISÃO HUMANA)
- Por que importa: o produto não tem canal de retorno; a especificação exclui integração com 190/193 e WhatsApp não oficial (`ESPECIFICACAO...` 4.1).
- Bloqueia: complemento, rejeição com explicação, notificação.
- Alternativas e riscos: (a) mensagens estruturadas (perguntas do servidor e respostas): menos abuso, mais desenho; (b) chat livre: moderação pesada e expectativa de resposta imediata; (c) só telefone: sem rastro; (d) WhatsApp oficial: só em fase posterior pela especificação, com custo.

### DH-19. Menores de idade? (DECISÃO HUMANA, com jurídico)
- Por que importa: a política diz que o sistema "não é dirigido a menores" (`PRIVACIDADE.md:402`), mas uma loja aberta alcança menores. O levantamento classifica dado de criança como sensível.
- Bloqueia: texto de loja, classificação etária, verificação de idade, regra de relato sobre menor.
- Alternativas e riscos: (a) declaração de idade mínima: fácil de burlar; (b) verificação mais forte: dado e atrito a mais; (c) permitir menores com regras próprias: exige parecer jurídico e fluxo de responsável.

### DH-20. Denúncia falsa (trote)? (DECISÃO HUMANA)
- Por que importa: relato falso pode mobilizar equipe em área de risco e contaminar estatística.
- Bloqueia: política de moderação, consequência para o autor, texto de termos.
- Alternativas e riscos: (a) só descartar: sem dissuasão; (b) registrar e bloquear reincidente: precisa identidade e devido processo interno; (c) medidas legais: fora do produto, mas os termos precisam dizer.

### DH-21. Abuso (conteúdo ofensivo, ilícito, dado de terceiros)? (DECISÃO HUMANA, com jurídico)
- Por que importa: conteúdo gerado por usuário muda o perfil do app perante as lojas (`LOJAS.md:242` diz que hoje não há).
- Bloqueia: denúncia, remoção, quarentena, retenção do que foi removido.
- Alternativas e riscos: (a) moderação humana pelo plantão: custo e exposição do servidor a conteúdo ruim; (b) filtros automáticos: falso positivo e a política afirma que não há decisão automatizada sobre pessoas (`PRIVACIDADE.md` 5); (c) moderação pelo fornecedor: o fornecedor passaria a ver conteúdo de cidadão do município (contrário a `ADR 0008`).

### DH-22. Spam? (DECISÃO HUMANA)
- Por que importa: o relato entra numa fila humana de emergência; spam consome atenção e sequência de protocolo se mal modelado.
- Bloqueia: quarentena antes da fila, limites por conta e por município.
- Alternativas e riscos: (a) fila separada "a verificar" até passar em critérios: atraso em relato real; (b) entra direto na fila com sinalização: fila poluída; (c) limites duros por pessoa/dia: barra o evento com muitos relatos legítimos.

### DH-23. Limite de taxa (rate limit)? (DECISÃO HUMANA)
- Por que importa: o limite atual é por IP ou usuário em memória (`servidor.ts:381-398`); NAT móvel e dia de evento.
- Bloqueia: número por rota, chave do balde, armazenamento compartilhado.
- Alternativas e riscos: (a) por IP: bloqueia legítimos atrás de NAT; (b) por conta: exige conta (DH-01); (c) por dispositivo atestado: exige DH-26; (d) limite alto na criação e baixo no login: exposição a inundação de relatos.

### DH-24. CAPTCHA ou outro anti-bot? (DECISÃO HUMANA)
- Por que importa: não existe nada (grep). CAPTCHA em situação de emergência é atrito; a rota pública recebe texto e anexo.
- Bloqueia: escolha de serviço (terceiro, subprocessador), acessibilidade, UX.
- Alternativas e riscos: (a) CAPTCHA de terceiro: dado do visitante com terceiro e barreira a pessoa com deficiência; (b) atestação nativa (App Attest, Play Integrity): reduz script, não impede uso humano malicioso, depende da loja; (c) prova de trabalho ou convite: complexidade; (d) nada: abuso aberto.

### DH-25. Bloqueio de conta? (DECISÃO HUMANA)
- Por que importa: hoje a escrita não confere conta ativa (`servidor.ts:449-466`).
- Bloqueia: regra de quem bloqueia, duração, recurso, efeito sobre relatos abertos.
- Alternativas e riscos: (a) temporário automático por tentativas (já existe para login): serve a senha, não a abuso de conteúdo; (b) manual pelo plantão com motivo estruturado: exige tela e permissão; (c) bloqueio de dispositivo: DH-26. Risco comum: bloquear quem relata risco real.

### DH-26. Dispositivo (vincular, atestar, banir)? (DECISÃO HUMANA)
- Por que importa: `sessoes` guarda só `user_agent` e `ip`; ADR 0004 diz que não há registro de dispositivo.
- Bloqueia: anti-abuso por dispositivo, revogação de push, várias contas por aparelho.
- Alternativas e riscos: (a) sem vínculo: sem controle; (b) identificador de instalação: troca com reinstalação, e é dado pessoal; (c) atestação da plataforma: dependência de serviço e de regras de loja.

### DH-27. Exclusão de conta? (DECISÃO HUMANA, com jurídico)
- Por que importa: o repositório não apaga usuário (desativa) e a declaração de loja diz que "a exclusão é pedida ao município" (`DECLARACAO-NAS-LOJAS.md:384`); o levantamento cita exigência de exclusão de conta dentro do app (`LEVANTAMENTO...:59`, NÃO CONFIRMADO por mim).
- Bloqueia: submissão às lojas, modelo de anonimização, vínculo com relato convertido.
- Alternativas e riscos: (a) anonimizar a conta e manter relato: preserva o ato, exige separar identidade de relato; (b) apagar tudo: conflita com ocorrência já oficial e com a trilha; (c) apenas desativar: pode não satisfazer a loja nem o titular.

### DH-28. Direitos do titular (acesso, correção, eliminação, portabilidade, informação de compartilhamento)? (DECISÃO HUMANA)
- Por que importa: hoje o cidadão é mandado ao município (`PRIVACIDADE.md:306`) e não há encarregado (`IMPLANTACAO.md:21`). O levantamento diz "não é jurídico, é tela e endpoint" (`:108`).
- Bloqueia: funções de exportação e correção, prazos, quem responde (município ou fornecedor).
- Alternativas e riscos: (a) pedido pelo app, atendido pelo município: fila humana e prazo; (b) autoatendimento de acesso e exportação: precisa de escopo que exclua dado de terceiros; (c) só canal de e-mail: sem rastro e sem prazo medido.

### DH-29. Como o município do relato é determinado sem token? (DECISÃO HUMANA, com arquitetura)
- Por que importa: a regra da casa diz que a organização vem do token e de mais lugar nenhum. Sem token, ela viria de escolha do cidadão, de coordenada ou de código. Não há IBGE, polígono, PostGIS, unicidade de município nem lista pública (CID-61). Divulgar lista de municípios expõe quais são clientes (`servidor.ts:612-616` evita isso).
- Bloqueia: toda escrita do relato.
- Alternativas e riscos: (a) o cidadão escolhe em lista: expõe carteira de clientes e permite relato no município errado; (b) por coordenada no servidor: exige base de limites municipais e mapeamento município/organização; (c) código de município ou convite: mais atrito; (d) um app por município: multiplica lojas; contraria a decisão de um bundle público.

### DH-30. Identidade do cidadão é global ou por município? (DECISÃO HUMANA, com arquitetura)
- Por que importa: todas as tabelas de negócio têm `organizacao_id` e RLS (`isolamento.test.ts:313-436`); uma identidade global seria a segunda exceção nomeada (como `interesse_municipio`), e a eliminação de município não a levaria.
- Bloqueia: modelo de conta, exclusão, isolamento.
- Alternativas e riscos: (a) global: uma conta para vários municípios, mas tabela fora do RLS e responsabilidade de controlador ambígua; (b) por município: isolamento limpo, mas conta repetida ao mudar de cidade e o município precisa estar definido antes do cadastro.

### DH-31. O município habilita o canal? Quem modera e com que SLA? (DECISÃO HUMANA)
- Por que importa: o município é controlador (`PRIVACIDADE.md` 1) e assume a fila humana; município suspenso ou sem equipe não pode receber relato que ninguém lê.
- Bloqueia: configuração por município, mensagem ao cidadão, contrato.
- Alternativas e riscos: (a) canal ligado por padrão: relato sem dono; (b) opt-in por município: adoção mais lenta; (c) horário de atendimento declarado: expectativa do cidadão versus realidade de plantão.

### DH-32. O que o cidadão vê do andamento? (DECISÃO HUMANA)
- Por que importa: severidade, prazo, equipe, vulnerabilidade e endereço são internos ou sensíveis.
- Bloqueia: projeção de leitura (CID-65), notificações, textos.
- Alternativas e riscos: (a) só etapas genéricas (recebido, em análise, encerrado): seguro, pouco informativo; (b) acrescenta resultado (convertido, rejeitado com motivo padrão): expectativa e contestação; (c) mostra equipe e prazo: expõe servidor e promete SLA.

### DH-33. Retenção de relato não convertido, rejeitado ou spam, e de anexos? (DECISÃO HUMANA)
- Por que importa: o prazo é decisão do município enquanto controlador (`021` cabeçalho); minimização hoje só conta do encerramento da ocorrência. `interesse_municipio` não tem purga (CID-05).
- Bloqueia: jobs de descarte, conflito com "prova não se apaga".
- Alternativas e riscos: (a) por prazo do município (como hoje): município sem número não descarta nada (padrão nulo); (b) prazo fixo do fornecedor: contradiz que o controlador decide; (c) guardar rejeitado por mais tempo para auditoria de moderação: mais dado parado.

### DH-34. Quem tria relato (papel), quem converte, e formato do protocolo do relato? (DECISÃO HUMANA)
- Por que importa: `abrir_ocorrencia` é de operador, coordenador e administrador; `classificar_triagem` só de coordenador e administrador (`permissoes.ts:79-111`).
- Bloqueia: ações novas em `ACOES`, teste de permissões, visibilidade do protocolo ao cidadão.
- Alternativas e riscos: (a) operador tria e converte: mais rápido, menos competência técnica; (b) só coordenação: gargalo no plantão; (c) protocolo do relato com prefixo próprio: evita confundir com ocorrência; ou mesmo formato: risco de o cidadão citar o protocolo em ofício como se fosse oficial.

### DH-35. Qual relógio vale? Prazo de triagem do relato e início do prazo da ocorrência convertida. (DECISÃO HUMANA)
- Por que importa: `prazo_em = criado_em + horas` (`ocorrencias.ts:769`); se a ocorrência nasce na conversão, o tempo em fila do relato some do SLA; se `criado_em` for retroagido, falsifica-se o instante de criação.
- Bloqueia: modelo de datas, indicadores de atraso.
- Alternativas e riscos: (a) relógio do relato separado, prazo da ocorrência na conversão: o atraso na fila de triagem não aparece; (b) retroagir: distorce `criado_em` e auditoria; (c) guardar as duas datas e escolher qual alimenta o indicador: precisa regra escrita.

### DH-36. Relato em nome de terceiros e dado sensível declarado pelo cidadão (saúde, deficiência, criança)? (DECISÃO HUMANA, com jurídico)
- Por que importa: a descrição de vulnerabilidade é o dado mais sensível do produto (`021` cabeçalho, `PRIVACIDADE.md` 2.1) e hoje só é preenchida pela triagem.
- Bloqueia: campos do relato, retenção, acesso.
- Alternativas e riscos: (a) o cidadão não informa, só a triagem: perde prioridade cedo; (b) campo livre: texto sensível sem controle; (c) campo estruturado mínimo: menos texto livre, mais desenho.

### DH-37. Natureza do canal: não substitui emergência, e competência do município. (DECISÃO HUMANA)
- Por que importa: a especificação diz que o produto não substitui 190, 192, 193 (`ESPECIFICACAO...` 4.1). Cidadão em risco imediato pode esperar resposta do app.
- Bloqueia: texto da tela, horário, encaminhamento para canais de emergência, responsabilidade.
- Alternativas e riscos: (a) aviso fixo e visível: atrito mínimo, responsabilidade clara, não evita uso errado; (b) triagem por pergunta ("há risco imediato?") com instrução: mais desenho e responsabilidade sobre a resposta; (c) sem aviso: risco reputacional e de dano.

### DH-38. Publicação nas lojas: quem é o titular da conta, marca do app, categoria, classificação etária? (DECISÃO HUMANA)
- Por que importa: o levantamento cita exigência de entidade legal para app com dados sensíveis (`LEVANTAMENTO...:59`, NÃO CONFIRMADO por mim). O bundle é definitivo (`LOJAS.md:73`).
- Bloqueia: submissão, conta demo para revisão, política publicada.
- Alternativas e riscos: (a) marca do fornecedor: um app para todos, cidadão vê marca que não é a da prefeitura; (b) marca por município (um app por município): multiplica submissões; (c) app único com marca do município configurada: decisão técnica de tematização.

### DH-39. Mapa e subprocessadores para o cidadão? (DECISÃO HUMANA)
- Por que importa: hoje o envio de coordenada ao Google é decisão do município e o app cai em plano esquemático sem chave (`SUBPROCESSADORES.md` 2.2; `app.config.ts`). Para o cidadão, o município teria de aceitar que a coordenada DO CIDADÃO vá ao Google.
- Bloqueia: seletor de local, custo de chave, política.
- Alternativas e riscos: (a) sem mapa, só endereço e GPS: menor fluidez; (b) mapa do Google: dado do cidadão sai do país; (c) mapa de outro provedor: novo subprocessador e novo contrato.

### DH-40. Quem é o controlador dos dados da conta do app do cidadão? (DECISÃO HUMANA, com jurídico)
- Por que importa: a política diz que o município é controlador e o fornecedor operador (`PRIVACIDADE.md:24-25`). Em app de loja pública do fornecedor, os dados de conta e de dispositivo podem ter finalidade própria do fornecedor.
- Bloqueia: texto de privacidade, contrato, rótulos de loja, encarregado.
- Alternativas e riscos: (a) município controlador de tudo: fornecedor fica sem poder de moderar conta para segurança do próprio app; (b) fornecedor controlador da conta, município do relato: dois controladores, dois avisos e duas respostas a titular; (c) contrato específico: depende de redação jurídica.

---

## Riscos arquiteturais

- R-01. Misturar autorização: qualquer atalho que ponha o cidadão em `usuarios`, em `PAPEIS` ou em plateia `dc360` faz o token de cidadão chegar a rotas e tabelas desenhadas para servidor. O console já prova o desenho correto e já tem teste de plateia que não atravessa.
- R-02. Conflito com a regra número um: a organização só vem do token. O relato anônimo e a escolha de município sem token exigem uma exceção ao princípio ou uma forma de derivar a organização no servidor. Qualquer exceção precisa ser nomeada e coberta por gate, como `interesse_municipio` (`isolamento.test.ts:160-215`).
- R-03. O gate universal de papéis de banco (`isolamento.test.ts:4005`) foi feito para barrar um terceiro papel. Realm separado com papel próprio exige alterar o gate; alterá-lo para "fazer passar" é o que ele existe para impedir.
- R-04. Cadeia de evidência reaproveitada por engano: anexo de cidadão em `evidencias` entra no laudo oficial, no teto dos agentes e na regra "prova não se apaga".
- R-05. Disponibilidade: uma máquina pequena serve painel, fila dos agentes, PDF (Chromium) e, se nada mudar, o tráfego público de pico de desastre. Sem número medido (`carga.test.ts` declara não medir desempenho) e sem homologação.
- R-06. Dois tipos de "relato" no vocabulário: hoje "relato" é o texto ditado por telefone (`ocorrencias.descricao`; migração 043). Um "relato do cidadão" como entidade nova vai colidir com isso em código, tela, documentação e política de privacidade.
- R-07. Texto livre do cidadão em estruturas imutáveis (trilha, legendas, `tipo_descricao`): a 029 e a 043 já corrigiram isso uma vez; o canal do cidadão multiplica a entrada desse tipo de texto.
- R-08. API sem versionamento e sem idempotência na criação, consumida por binário de loja que não se atualiza de imediato.
- R-09. Escala de confiança invertida: todo o desenho de segurança atual assume usuário conhecido, contratado e identificado (ADR 0004). O cidadão é população aberta, potencialmente hostil, sem contrato, com ferramentas de automação.
- R-10. Política de privacidade e documentação de lojas escritas para um único perfil (servidor). Publicar o app do cidadão sem reescrevê-las cria declaração inconsistente com o que o binário novo faz.
- R-11. Dependência de provedores inexistentes em produção (e-mail, SMS, possivelmente atestação e CAPTCHA) como pré-requisito de conta e recuperação.
- R-12. Extração de pacotes (UI, tokens, cliente) é pré-requisito de eficiência, e não existe. Sem ela, o custo de um segundo app nativo para equipe de uma pessoa sobe (`LEVANTAMENTO...:61`).

## Dívidas técnicas

- DT-01. Três clientes HTTP (`apps/web/src/dados/http.ts` 1245 linhas, `apps/campo/src/dados/api.ts` 856, `packages/campo/src/transporte.ts` 234) com lógica de renovação e erro duplicada.
- DT-02. Tokens de design copiados à mão e guardados por script com caminhos fixos (`scripts/paridade-de-tokens-do-aplicativo.test.mjs`), sem pacote.
- DT-03. Biblioteca de UI do app de campo não empacotada; testes presos ao jest do campo.
- DT-04. `@dc360/shared` com entrada única e efeito colateral global (`z.setErrorMap`) em `mensagens-do-zod.ts`; mistura domínio do agente, schemas de operador e utilidades neutras.
- DT-05. Tela de vistoria com 3748 linhas contendo câmera, GPS e regras (`app/(agente)/vistoria/[id].tsx`); capturas não reaproveitáveis.
- DT-06. `apps/campo` fora de `workspaces` com scripts de gate de caminho fixo (`auditar.mjs:109`, `testar-campo.mjs:65`); `npm audit` do app aceita um advisory nomeado (`auditar.mjs:48`, `decode-uri-component`). Este ponto pertence a outra frente, citado pelo efeito sobre um segundo app.
- DT-07. Padrão de leitura por lista de exclusão (`privacidade/lista.ts`) e por fragmento SQL em rota (`recorte-do-agente.ts`), ambos com histórico de vazamento registrado nos próprios comentários.
- DT-08. `auth/vigencia.ts` escrito e desligado; testes correspondentes em `describe.skip` (`vigencia-na-escrita.test.ts:102`). Achado da frente de autenticação.
- DT-09. Push com um único `APNS_BUNDLE`, uma conta FCM e `aparelhos` ligado a `usuarios` (`config.ts:229,267`; `016:107`).
- DT-10. `interesse_municipio` com IP e contato sem purga implementada, contra o que o comentário da coluna promete (`011:66-68,158-159`).
- DT-11. Consulta de duplicidade sem escape de curingas `LIKE` e sem coordenada/contato (`ocorrencias.ts:702-714`).
- DT-12. Painel "em dois modos" (ADR 0003): qualquer nova entidade exposta ao painel precisa existir nos dois repositórios de dados (`apps/web/src/dados/http.ts` e `local.ts`, este com 2157 linhas). Custo para a caixa de triagem de relatos (frente da superfície 1).

---

## Limites desta auditoria e itens NÃO CONFIRMADOS

- Não executei o app do cidadão (não existe), nem o app de campo, nem `typecheck`, nem a suíte completa. Executei só `superficie.test.ts` e o recorte "Formulário público de interesse" de `api.test.ts`. Os demais testes citados (`isolamento.test.ts`, `eliminacao-de-municipio.test.ts`, `enumeracao-pelo-bloqueio.test.ts`, `carga.test.ts`, `plateia-nao-atravessa.test.ts`) foram lidos, não executados por mim.
- Regras das lojas (exclusão de conta dentro do app, conteúdo gerado por usuário, atestação, entidade legal para dado sensível, target API) vêm do `LEVANTAMENTO...:59` e de `LOJAS.md`: documentadas, NÃO CONFIRMADAS por mim e datadas de setembro de 2026.
- Não confirmei o número de máquinas em produção, a retenção dos logs da plataforma de hospedagem, nem se o descarte de `interesse_municipio` acontece por processo fora do repositório.
- Afirmações legais (base legal, menores, prazos) não foram feitas: estão marcadas como DECISÃO HUMANA com jurídico.
- Não avaliei o conteúdo dos diretórios `apps/web` e `apps/campo` além do necessário ao escopo; outras frentes cobrem a superfície 1 e a 2.
