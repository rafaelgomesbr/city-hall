# Fase 17: App do cidadão

**Gate da fase:** G17 APP DO CIDADÃO EM BETA INTERNO | **Depende dos gates:** G15, G16, G08, G12, G32 (cumulativo: todos os anteriores na ordem de execução de `STATUS.md`, seção 5) | **Superfícies tocadas:** `apps/cidadao` (a criar), `apps/api` (rotas do cidadão no modo `publica`), `packages/upload-core` (a criar), `packages/campo` e `apps/campo` (só a extração do envio de arquivo), `packages/design-tokens`, `packages/i18n` e `packages/shared` (consumo) | **Checkpoints da fase:** CP-04, CP-11, CP-38, CP-46, CP-45 (CP-27 é revisitado no gate)

Esta fase constrói o aplicativo do cidadão: React Native com Expo, Android e iOS, NÃO é PWA, em `apps/cidadao`, com bundle, realm e API pública próprios. Fluxo: abrir o app, entrar por e-mail com código de uso único (primeiro provedor de identidade, com gancho para os demais), informar o CPF (obrigatório no relato identificado), home, novo relato (tipo COBRADE, local, descrição, fotos, revisão, envio idempotente com rascunho local), protocolo do relato, acompanhamento em etapas padrão, complemento a pedido da triagem, encerramento e histórico, push, aceite e política dentro do app. O app mostra sempre o aviso fixo de que NÃO substitui 190, 192 e 193.

Preserva (MANTER): `apps/campo` e `packages/campo` sem mudança de comportamento (a extração de `upload-core` em E03 mantém a interface `Transporte` e as classes `Falha*`) e o isolamento: o token do cidadão nunca vale na API de servidor. NÃO reutiliza a UI do agente (`apps/campo/src/ui`): importa só tokens gerados, `cliente-api`, `upload-core`, `packages/i18n` e o subcaminho neutro de `@dc360/shared` (F08).

Texto, tema e idiomas (D-11 e D-12): todo texto do app vem do pacote de idiomas da F08 (pt-BR, en e es; F08-E08 a E10), nunca fixo na tela; nome, logotipo e cor de destaque vêm do tema do município (F08-E11; cadastro e rota na F35); o VLibras entra pelo ponto da F08-E12 (aplicação na F35). O município do relato é resolvido no servidor com PostGIS (F32 e F16-E05). Toda etapa de tela passa pelo portão visual de `19-definicao-de-pronto.md`, seção 0 (nada desalinhado, grudado ou fora do lugar; texto bem escrito) e pelo portão da F08 (F08-E13): capturas do simulador e foto do aparelho, claro e escuro, estados normal, vazio, erro e carregando.

NÃO faz: relato anônimo (fora da V2, decisão de Rafael). Vídeo, chat por relato, login gov.br, SMS e login social (Google e Apple) são da F34 (D-07; vídeo F34-E03 e E04, chat E05 a E08, login E12 a E16), que executa depois da F18 e antes da F19; aqui ficam os ganchos: a tela de login (E04) lista provedores por configuração, o fluxo do relato (E06 a E09) aceita anexo e mensagem de outros tipos sem refazer telas, e o CPF vindo do gov.br preenche o campo da E20. G17 é BETA INTERNO (equipe, HML, dados sintéticos, TestFlight interno e teste interno do Google Play): beta externo e abertura pública só depois de CP-11, CP-26, CP-28, G25 e CP-33. G17 libera F34 (junto de G18) e F19 (junto de G18, G34 e G14).

Ordem sugerida: E01, E02; depois E03, E04, E13, E14, E16 e E17 em paralelo (arquivos disjuntos); E20 depois de E04 e E14; E05 a E12 em sequência; E15 e E18 por último.

## Etapas

### V2-F17-E01 - ADR 0017: apps/cidadao (Expo, bundle id, EAS, fora do workspaces)
- **Prioridade:** P0
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (E02 e E17 dependem da ADR)
- **Objetivo:** registrar em ADR que `apps/cidadao` é aplicativo nativo próprio, com limites de importação.
- **Problema que resolve:** `REL:07 10.4`: app único com "modo cidadão" levaria permissões do agente ao binário público; a especificação original prevê PWA, contra PR:D-03.
- **Origem:** DP:T02; DP:R5; DP:T28; REL:07 (10.3, 10.4); PR:D-01; PR:D-03; PR:D-07; PR:D-11; PR:D-12.
- **Estado atual:** CRIAR (a ADR).
- **Dependências de entrada:** G12, G15; ADRs 0015 e 0016.
- **O que deve ser implementado:**
  - Arquivos: `docs/adr/0017-app-do-cidadao.md` decide: Expo na versão do campo (SDK 57, React Native 0.86.3); pasta FORA do `workspaces`, lockfile próprio; um binário para todos os municípios; bundle provisório `com.solerte.dc360.cidadao`, sufixo `.hml`; API pública, audiência `dc360-cidadao`; perfis EAS `desenvolvimento`, `homologacao`, `beta-interno`.
  - Arquivos: o que o app PODE importar (tokens gerados, `cliente-api`, `upload-core`, `packages/i18n`, subcaminho neutro do shared) e o que NÃO (`apps/campo/src/ui`, `@dc360/campo`, barril do shared, `PAPEIS`, `PERMISSOES`); aviso fixo; beta externo travado (CP-11, CP-26, CP-28, G25, CP-33).
  - Arquivos: ganchos da F34 (provedor de identidade por interface, hoje só e-mail; anexo e mensagem por configuração); texto pelo catálogo da F08; tema pelo contrato da F08-E11.
- **O que NÃO deve ser implementado nesta etapa:** código (E02); contas e builds (E17); texto legal (E14); vídeo, chat e login ampliado (F34-E03 a E16).
- **Arquivos e módulos prováveis:** `docs/adr/0017-app-do-cidadao.md` (a criar em `C:/Projetos/city-hall/docs/adr/`).
- **Risco de segurança:** médio; importação errada levaria permissões do agente ao binário; portão na E02.
- **Impacto LGPD:** Não se aplica: sem dado.
- **Migração necessária:** Não.
- **Compatibilidade:** o campo segue com `com.solerte.dc360.campo`.
- **Rollback:** reverter o texto.
- **Testes positivos:** `regras-de-conteudo.test.ts` passa.
- **Testes negativos:** travessão, norma fora da lista ou data fora de ISO reprova o mesmo teste.
- **Testes de autorização e isolamento:** Não se aplica: documento.
- **Regressão obrigatória:** `npm test`, `npm run conferir:numeros`; gates anteriores.
- **E2E:** Não se aplica: documento.
- **Validação humana:** Rafael e Alyson.
- **Evidência a produzir:** `docs/evidencias-v2/G17/V2-F17-E01/`: hash e aprovação.
- **Documentação a atualizar:** `dc360/README.md`, `apps/campo/LOJAS.md`.
- **Definition of Done:** ADR aprovada com bundle, importações e travas.
- **Checkpoint:** CP-04 (entidade, contas, marca e bundle ids; sem decisão vale o provisório; E17 e F28-E07 sem build de loja).

### V2-F17-E02 - Scaffold, tokens, tema, idiomas e ErrorBoundary
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (as demais partem do scaffold)
- **Objetivo:** `apps/cidadao` abre em Android e iOS, em dois temas e três idiomas, com ErrorBoundary.
- **Problema que resolve:** não existe app do cidadão; os scripts fixam `apps/campo` (REL:07 gap 25); D-11 e D-12 pedem idiomas e tema por município desde a primeira tela.
- **Origem:** DP:T16; DP:T28; DP:T29; REL:07 (10.2, gap 25); PR:D-11; PR:D-12.
- **Estado atual:** CRIAR (a pasta) e MANTER (`apps/campo` intocado).
- **Dependências de entrada:** E01; G08 (F08-E08, E10, E11, E13).
- **O que deve ser implementado:**
  - Mobile: `apps/cidadao/` com `package.json` nas versões do campo (com `file:../../packages/i18n`), `app.config.ts` (`allowBackup: false`, só câmera e localização), `_layout.tsx` com `ErrorBoundary`; `src/ui/` sobre `tokens.gerado.ts`.
  - Idiomas e tema: `t()` da F08-E08, idioma do aparelho (pt-BR de reserva), toda frase em chave `cidadao.*`; `temaComMunicipio` (F08-E11), DC360 sem município (cadastro na F35).
  - Infraestrutura: `alvos.json`, `superficies.json`, `testar-cidadao.mjs`, `auditar.mjs` e job `cidadao`.
  - Testes: `isolamento-do-cidadao.test.mjs` (grafo sem `apps/campo` nem barril do shared), `versoes-dos-apps.test.mjs`, `textos-do-cidadao.test.ts`.
- **O que NÃO deve ser implementado nesta etapa:** telas de negócio (E04 a E12); upload (E03); erros (E16); lojas (E17); VLibras (E15).
- **Arquivos e módulos prováveis:** `apps/cidadao/` (a criar em `dc360/apps/`), `dc360/scripts/superficies.json`.
- **Risco de segurança:** médio; o barril do shared levaria permissões ao binário.
- **Impacto LGPD:** Não se aplica: sem coleta.
- **Migração necessária:** Não.
- **Compatibilidade:** `apps/campo` não muda.
- **Rollback:** remover a pasta e o job.
- **Testes positivos:** `npm run test:cidadao` verde; abre em dois temas e três idiomas; ErrorBoundary mostra o código.
- **Testes negativos:** barril do shared ou `apps/campo/src/ui` reprova; frase fixa em tela reprova; chave ausente em en cai em pt-BR; cor sem contraste AA cai no DC360.
- **Testes de autorização e isolamento:** Não se aplica: sem dado nem rota.
- **Regressão obrigatória:** `npm run test:campo`, `test:scripts`, `auditar`, `typecheck`.
- **E2E:** Não se aplica: sem fluxo (E18); capturas do portão da F08-E13 na tela inicial.
- **Validação humana:** Rafael abre o app no emulador e no simulador; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G17/V2-F17-E02/`: testes, capturas e `INDEX.md`.
- **Documentação a atualizar:** `apps/cidadao/LEIA-ME.md`.
- **Definition of Done:** abre nos dois sistemas; portões verdes; job no CI.
- **Checkpoint:** Não.

### V2-F17-E03 - Pacote upload-core extraído do campo (segundo consumidor real)
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com F17-E04 e F17-E14)
- **Objetivo:** extrair o protocolo de envio de arquivo (autorizar, PUT assinado, confirmar) para `packages/upload-core`, usado pelo campo e pelo cidadão.
- **Problema que resolve:** o protocolo vive em `transporteHttp` (`packages/campo/src/transporte.ts`) e na foto de perfil (`apps/campo/src/dados/api.ts`); o cidadão faria a terceira cópia.
- **Origem:** DP:T28a; DP:T28; REL:07 (10.2, DT-01).
- **Estado atual:** REFATORAR (extrai o que funciona; o campo não muda de comportamento).
- **Dependências de entrada:** E02 (e `cliente-api` de G08).
- **O que deve ser implementado:**
  - Domínio: `packages/upload-core/src/` (sem DOM nem React Native, `fetch` injetado): `enviarArquivo({ autorizar, bytes, confirmar, buscar, tempoLimiteMs })`; PUT com 5xx, 429 e 403 (URL vencida) temporário, demais 4xx permanente; tempo do PUT é o quádruplo (regra de hoje); cabeçalhos assinados repetidos como vieram; `jaEnviada` dispensa o PUT.
  - Mobile: `transporteHttp` e a foto de perfil usam o pacote e mantêm `Transporte` e `Falha*`; `file:../../packages/upload-core` em `apps/campo/package.json`, no job `aplicativo` e em `scripts/testar-campo.mjs`.
- **O que NÃO deve ser implementado nesta etapa:** classes de arquivo, cotas e rotas (F06); leitura do disco; envio em segundo plano.
- **Arquivos e módulos prováveis:** `packages/upload-core/` (a criar em `dc360/packages/`), `dc360/packages/campo/src/transporte.ts`, `dc360/apps/campo/src/dados/api.ts`.
- **Risco de segurança:** médio; regressão derruba o envio de prova do agente; URL assinada fora de log.
- **Impacto LGPD:** Não se aplica: só carrega bytes.
- **Migração necessária:** Não.
- **Compatibilidade:** `Transporte` e `Falha*` idênticos.
- **Rollback:** reverter por consumidor.
- **Testes positivos:** autorizar, PUT e confirmar com `fetch` falso; `jaEnviada` pula o PUT.
- **Testes negativos:** PUT 403, 503 e 429 temporários; 413 e 415 permanentes; confirmar 409 `tamanho_divergente` permanente.
- **Testes de autorização e isolamento:** o PUT não leva `authorization`; confirmar arquivo de outro município: 404.
- **Regressão obrigatória:** `npm run test:campo`, `npm run test:api` (`campo-integracao.test.ts`), `npm run typecheck`; gates anteriores.
- **E2E:** `campo-integracao.test.ts` (foto contra a API real) sem editar expectativa.
- **Validação humana:** Rafael envia uma foto de vistoria no emulador.
- **Evidência a produzir:** `docs/evidencias-v2/G17/V2-F17-E03/`: saída dos dois lados.
- **Documentação a atualizar:** `dc360/README.md`, `apps/campo/LEIA-ME.md`.
- **Definition of Done:** protocolo único em `upload-core`; campo sem cópia; pronto para E07 e E08.
- **Checkpoint:** Não.

### V2-F17-E04 - Login por e-mail OTP
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com F17-E03 e F17-E16)
- **Objetivo:** o cidadão entra com e-mail e código de seis dígitos; a sessão fica no cofre do aparelho.
- **Problema que resolve:** sem login não há relato nem "só o meu" (REL:07 gap 1).
- **Origem:** DP:T18; PR:D-03; DP:T29; REL:07 (DH-01); PR:D-07.
- **Estado atual:** CRIAR; reaproveita a renovação do campo por `cliente-api`.
- **Dependências de entrada:** E02; G15 (F15-E04, E05, E16); CP-19 para e-mail real.
- **O que deve ser implementado:**
  - Mobile: telas `entrar` e `codigo` em `apps/cidadao/src/app/`; código com `textContentType="oneTimeCode"` e colar permitido; reenvio com espera; resposta uniforme sobre o e-mail; acesso e renovação em `expo-secure-store` (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`); sair revoga no servidor e apaga rascunho, cache e fotos locais.
  - Mobile: gancho da F34-E12: `src/dados/provedores.ts` lista os provedores ativos (hoje só e-mail) e `entrar` desenha um botão por provedor; `cpfPendente` (F15-E16) leva à E20.
  - API: rotas de F15-E04 e F15-E05; nenhuma nova.
  - Observabilidade: código e e-mail fora de log e snapshot.
- **O que NÃO deve ser implementado nesta etapa:** senha e link mágico; gov.br, SMS, Google e Apple (F34-E13, E15, E16); aceite (E14); CPF (E20).
- **Arquivos e módulos prováveis:** `apps/cidadao/src/app/entrar.tsx`, `codigo.tsx`, `src/dados/sessao.tsx`, `provedores.ts` (a criar).
- **Risco de segurança:** alto; credencial no aparelho; o acesso do cidadão não vale na API de servidor.
- **Impacto LGPD:** coleta o e-mail; base legal em CP-11 (E14).
- **Migração necessária:** Não.
- **Compatibilidade:** envia `X-App-Version`.
- **Rollback:** desligar o canal (F15-E13).
- **Testes positivos:** código certo abre a sessão; renovação silenciosa; sair revoga.
- **Testes negativos:** código errado não diz se o e-mail existe; 429 mostra a espera; `sessao_encerrada` volta ao login e preserva o rascunho; provedor desconhecido na configuração não aparece.
- **Testes de autorização e isolamento:** acesso do cidadão em `GET /ocorrencias`: 401; sair num aparelho não encerra outro.
- **Regressão obrigatória:** `npm run test:cidadao`, `test:api`, `test:isolamento`; G15.
- **E2E:** login em `apps/cidadao/e2e/` (E18), com capturas.
- **Validação humana:** Rafael entra em Android e iOS; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G17/V2-F17-E04/`: testes, capturas e `INDEX.md`.
- **Documentação a atualizar:** `apps/cidadao/LEIA-ME.md`.
- **Definition of Done:** login, renovação e saída em HML; zero dado pessoal em log.
- **Checkpoint:** Não.

### V2-F17-E05 - Home e estados vazios
- **Prioridade:** P1
- **Tamanho:** S  |  **Complexidade:** baixa  |  **Risco:** baixo  |  **Paralelizável:** não (E06 usa o layout criado aqui)
- **Objetivo:** após o login o cidadão vê o aviso fixo, o botão de novo relato, os últimos relatos e os estados vazios ou de bloqueio.
- **Problema que resolve:** o canal não pode parecer atendimento de emergência (REL:07 DH-37); sem estados padrão o app abre em branco.
- **Origem:** REL:07 (DH-37, DH-31); DP:T29; DP:T35.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E04.
- **O que deve ser implementado:**
  - Mobile: `apps/cidadao/src/app/(cidadao)/_layout.tsx` com `AvisoDeEmergencia` fixo e não dispensável ("Este aplicativo não substitui 190, 192 e 193. Em emergência, ligue") e três botões de ligar de 48 dp; `index.tsx` com "Relatar uma situação" e os três últimos relatos (lidos pela E10).
  - UX: `EstadoDaTela` para: nenhum relato; sem sinal (lista guardada e hora); versão desatualizada (426 de F15-E12, bloqueia o envio); conta bloqueada (F15-E11, texto genérico).
  - Acessibilidade: o aviso é o primeiro elemento do foco.
- **O que NÃO deve ser implementado nesta etapa:** fluxo de relato (E06 a E09); lista completa (E10); push (E13); texto legal (E14).
- **Arquivos e módulos prováveis:** `apps/cidadao/src/app/(cidadao)/_layout.tsx` e `index.tsx`, `src/ui/AvisoDeEmergencia.tsx`, `src/ui/EstadoDaTela.tsx` (a criar).
- **Risco de segurança:** baixo; a lista guardada é dado pessoal local e sai no logout.
- **Impacto LGPD:** cache local, apagado ao sair.
- **Migração necessária:** Não.
- **Compatibilidade:** leitura de F16-E09.
- **Rollback:** reverter o commit.
- **Testes positivos:** `aviso-de-emergencia.test.tsx` varre as rotas do grupo e exige o aviso em todas.
- **Testes negativos:** sem rede mostra a lista guardada e a hora; 426 e conta bloqueada escondem o botão; o aviso não tem botão de fechar.
- **Testes de autorização e isolamento:** o cache é apagado no logout e outra conta não o lê.
- **Regressão obrigatória:** `npm run test:cidadao`, `test:scripts`, `typecheck`.
- **E2E:** abrir logado e ver o aviso em `apps/cidadao/e2e/` (E18), com capturas.
- **Validação humana:** Alyson lê o aviso e os estados no aparelho; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G17/V2-F17-E05/`: capturas e `INDEX.md`.
- **Documentação a atualizar:** `apps/cidadao/LEIA-ME.md`.
- **Definition of Done:** aviso em toda tela autenticada; quatro estados testados.
- **Checkpoint:** Não.

### V2-F17-E06 - Novo relato: tipo COBRADE e local (GPS, mapa, endereço)
- **Prioridade:** P0
- **Tamanho:** L  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (E07 continua o fluxo)
- **Objetivo:** o cidadão escolhe o tipo e o local do fato (GPS, pino ou endereço) e vê a Defesa Civil resolvida pelo servidor.
- **Problema que resolve:** o município do relato não vem de token (REL:07 DH-29); classificar é competência da triagem (`TIPO_A_CLASSIFICAR`).
- **Origem:** DP:T20; DP:T36; BZ-M:V2-CID-09; REL:07 DH-29; PR:D-16.
- **Estado atual:** CRIAR; reaproveita `TIPOS_COBRADE` e `ROTULO_TIPO_COBRADE` (`dominio.ts`), coordenada e `localizacao.ts` do subcaminho neutro.
- **Dependências de entrada:** E04 e G16 (município em F16-E05).
- **O que deve ser implementado:**
  - Mobile: tipo (os oito tipos e "Não sei dizer", com ajuda curta em linguagem simples); local por "Usar minha localização" (`expo-location`, primeiro plano, precisão exibida), "Marcar no mapa" (`react-native-maps`, chave própria; sem chave só GPS e endereço) e endereço com ponto de referência; rótulo "local do fato"; permissão negada leva a "Abrir ajustes".
  - API: envia a coordenada à resolução de F16-E05 (PostGIS, F32); trata município habilitado (mostra o nome), candidatos na divisa (confirmar) e não habilitado (mensagem fixa, sem lista).
- **O que NÃO deve ser implementado nesta etapa:** descrição e fotos (E07); envio (E08); transferência entre municípios; lista pública de municípios.
- **Arquivos e módulos prováveis:** `apps/cidadao/src/app/(cidadao)/relatar/tipo.tsx` e `local.tsx`, `src/relato/tipos.ts`, `src/relato/local.ts` (a criar).
- **Risco de segurança:** alto; ponto de divisa e oráculo de município habilitado.
- **Impacto LGPD:** localização precisa pedida no toque, só em primeiro plano; mapa é subprocessador (CP-06).
- **Migração necessária:** Não.
- **Compatibilidade:** rota de F16-E05.
- **Rollback:** reverter.
- **Testes positivos:** GPS, pino e endereço geram coordenada válida; divisa pede confirmação.
- **Testes negativos:** permissão negada segue por endereço; precisão de 500 m avisa; não habilitado dá a mesma mensagem em qualquer ponto; coordenada fora da faixa recusada.
- **Testes de autorização e isolamento:** a resposta não distingue município inexistente de desligado.
- **Regressão obrigatória:** `npm run test:cidadao`, `test:api`, `typecheck`.
- **E2E:** relato até o local confirmado em `apps/cidadao/e2e/` (E18), com capturas.
- **Validação humana:** Alyson confere as ajudas; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G17/V2-F17-E06/`: capturas e `INDEX.md`.
- **Documentação a atualizar:** `docs/SUBPROCESSADORES.md`.
- **Definition of Done:** três locais e três respostas de município (PostGIS) em HML.
- **Checkpoint:** Não.

### V2-F17-E07 - Descrição e fotos (limites T24)
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (E08 monta o envio sobre estas telas)
- **Objetivo:** o cidadão descreve o fato e anexa até cinco fotos JPEG ou PNG (10 MB, 25 megapixels), preparadas no aparelho.
- **Problema que resolve:** a cadeia confia só no tipo declarado (REL:07 gap 4); o aparelho deve entregar imagem dentro dos limites.
- **Origem:** DP:T24; DP:T25; BZ-M:V2-CID-07; REL:07 (10.2, DH-10); PR:D-07.
- **Estado atual:** CRIAR; reaproveita só o seletor de `apps/campo/src/dados/foto-do-agente.ts`.
- **Dependências de entrada:** E06 e E03.
- **O que deve ser implementado:**
  - Mobile: descrição com limites de F16-E04 e rótulo que diz o que digitar; fotos por `expo-image-picker` (câmera do sistema e seletor sem permissão de biblioteca, `exif: false`); `expo-image-manipulator` converte HEIC em JPEG, reduz o lado maior e confere tamanho e megapixels; cópia em `Paths.document`; contador "3 de 5", remover foto, texto alternativo, orientação ("evite rostos e placas"); `anexos.ts` lista os tipos aceitos (só foto; a F34 acrescenta vídeo).
- **O que NÃO deve ser implementado nesta etapa:** envio e rascunho (E08); validação por bytes (F06-E05); vídeo (F34-E03, limites de F06-E18 a E20).
- **Arquivos e módulos prováveis:** `apps/cidadao/src/app/(cidadao)/relatar/descricao.tsx` e `fotos.tsx`, `src/relato/foto.ts`, `src/relato/contexto.tsx` (a criar).
- **Risco de segurança:** alto; arquivo de aparelho de terceiro; o servidor revalida.
- **Impacto LGPD:** foto mostra pessoas e placas; sem permissão de biblioteca; cópia apagada no envio e no logout.
- **Migração necessária:** Não.
- **Compatibilidade:** limites de F06-E05 e F06-E06.
- **Rollback:** reverter.
- **Testes positivos:** HEIC vira JPEG dentro do limite; a sexta foto é recusada.
- **Testes negativos:** 30 megapixels reduzido ou recusado; PNG de 12 MB recusado; descrição fora dos limites recusada.
- **Testes de autorização e isolamento:** fotos do rascunho de A somem no login de B no mesmo aparelho.
- **Regressão obrigatória:** `npm run test:cidadao`, `test:campo` (`foto-do-agente.test.ts`), `typecheck`.
- **E2E:** relato com fotos até a revisão (E18), com capturas.
- **Validação humana:** Rafael anexa fotos da câmera e da galeria em Android e iOS; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G17/V2-F17-E07/`: tamanhos e capturas com `INDEX.md`.
- **Documentação a atualizar:** `apps/cidadao/LEIA-ME.md`.
- **Definition of Done:** limites de T24 no aparelho; diretório limpo no logout.
- **Checkpoint:** Não.

### V2-F17-E08 - Revisão e envio idempotente com rascunho local
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (E09 depende do envio)
- **Objetivo:** o cidadão revisa e envia o relato sem duplicar, mesmo com sinal ruim, com rascunho no aparelho.
- **Problema que resolve:** a criação não é idempotente e a rede móvel falha no meio (REL:07 gap 20).
- **Origem:** DP:T35; DP:T22; BZ-M:V2-CID-06; REL:07 (gap 20); PR:D-07.
- **Estado atual:** CRIAR; usa `chaveDeCriacao` (F02-E07) e a criação de relato e anexo (F16).
- **Dependências de entrada:** E07; E20.
- **O que deve ser implementado:**
  - Mobile: revisão completa e "Enviar"; `rascunho.ts` sobre `expo-sqlite` guarda o relato e as cópias das fotos; `chaveDeCriacao` UUID nasce com o rascunho e vale em todo reenvio; fotos enviadas por `upload-core`, cada uma com chave própria; estados `rascunho`, `enviando`, `enviado` e `falha`; reenvio manual e automático ao voltar a rede (`expo-network`).
  - API: criação de relato e anexo de F16; o 403 `cpf_pendente` (F16-E05) leva à E20 e o rascunho fica.
  - UX: "Sem sinal: guardamos o relato neste aparelho"; progresso por foto.
- **O que NÃO deve ser implementado nesta etapa:** fila em segundo plano; edição depois do envio; contato a agentes (F19-E03); vídeo (F34-E03).
- **Arquivos e módulos prováveis:** `apps/cidadao/src/dados/rascunho.ts` e `envio.ts`, `relatar/revisao.tsx`, `apps/api/test/cidadao-integracao.test.ts` (a criar).
- **Risco de segurança:** alto; relato duplicado; a chave de criação vale por conta.
- **Impacto LGPD:** rascunho e fotos locais apagados no envio e no logout.
- **Migração necessária:** Não.
- **Compatibilidade:** `X-App-Version`.
- **Rollback:** desligar o canal do município (F15-E13).
- **Testes positivos:** envio devolve o protocolo; o rascunho sobrevive a reiniciar o app.
- **Testes negativos:** reenvio com a mesma chave depois de o servidor gravar: um só relato; 5xx numa foto retoma só a foto.
- **Testes de autorização e isolamento:** a mesma `chaveDeCriacao` em outro cidadão cria relato distinto.
- **Regressão obrigatória:** `npm run test:cidadao`, `test:api`, `test:isolamento`.
- **E2E:** `cidadao-integracao.test.ts` com cinco reenvios concorrentes; `apps/cidadao/e2e/` (E18), com capturas.
- **Validação humana:** Rafael envia em modo avião e religa o sinal; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G17/V2-F17-E08/`: testes e capturas com `INDEX.md`.
- **Documentação a atualizar:** `apps/cidadao/LEIA-ME.md`.
- **Definition of Done:** reenvio nunca duplica; rascunho sobrevive a reinício; logout limpa.
- **Checkpoint:** Não.

### V2-F17-E09 - Protocolo e confirmação
- **Prioridade:** P0
- **Tamanho:** S  |  **Complexidade:** baixa  |  **Risco:** médio  |  **Paralelizável:** não (E10 parte desta tela)
- **Objetivo:** depois do envio o cidadão vê o protocolo do relato, guarda-o e entende o próximo passo.
- **Problema que resolve:** o protocolo do relato não é o oficial; sem prefixo e explicação o cidadão o cita em ofício como se fosse (DP:T21, risco residual).
- **Origem:** DP:T21; BZ-M:V2-CID-03; REL:07 (11.2, 11.4).
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E08.
- **O que deve ser implementado:**
  - Mobile: tela `confirmacao` com o protocolo exatamente como o servidor devolve (F16-E03), botão copiar, o texto "Este é o número do seu relato. Não é o protocolo oficial de uma ocorrência; esse número só existe se a Defesa Civil abrir o atendimento", três passos do que acontece agora e "Ver meus relatos"; protocolo em Roboto Mono.
  - Acessibilidade: confirmação em faixa persistente (F08-E07), `AccessibilityInfo.announceForAccessibility`, foco no título e protocolo lido por grupos de caracteres.
- **O que NÃO deve ser implementado nesta etapa:** compartilhar em redes; protocolo oficial (só após a conversão, F18-E07); busca por protocolo.
- **Arquivos e módulos prováveis:** `apps/cidadao/src/app/(cidadao)/relatar/confirmacao.tsx` (a criar).
- **Risco de segurança:** médio; o protocolo não é segredo, a leitura exige a conta (F15-E06).
- **Impacto LGPD:** Não se aplica: sem dado novo.
- **Migração necessária:** Não.
- **Compatibilidade:** o formato do protocolo vem do servidor; o app não o monta.
- **Rollback:** reverter o commit.
- **Testes positivos:** protocolo exibido igual ao da resposta; copiar funciona.
- **Testes negativos:** resposta sem protocolo mostra erro e mantém o rascunho (nunca "enviado" falso); o protocolo oficial não aparece nesta tela.
- **Testes de autorização e isolamento:** o app não tem busca por protocolo; relato de outro cidadão por id: 404 (F16-E09).
- **Regressão obrigatória:** `npm run test:cidadao`, `npm run typecheck`.
- **E2E:** relato completo até a confirmação (E18), com capturas.
- **Validação humana:** Alyson lê o texto da confirmação; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G17/V2-F17-E09/`: capturas e `INDEX.md`.
- **Documentação a atualizar:** `apps/cidadao/LEIA-ME.md`.
- **Definition of Done:** protocolo exibido, copiável, anunciado ao leitor de tela e explicado como não oficial.
- **Checkpoint:** Não.

### V2-F17-E10 - Acompanhamento (etapas padrão, protocolos)
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (E11 e E12 partem do detalhe)
- **Objetivo:** o cidadão acompanha cada relato em etapas padrão, com o protocolo do relato e, após a conversão, o oficial.
- **Problema que resolve:** a leitura atual devolve `o.*` e a trilha (REL:07 11.5); o cidadão não vê nota interna, equipe nem terceiros.
- **Origem:** DP:T21; BZ-M:V2-CID-06; REL:07 (11.5, 11.6); PR:D-07.
- **Estado atual:** CRIAR; consome F16-E09.
- **Dependências de entrada:** E09.
- **O que deve ser implementado:**
  - Mobile: "Meus relatos" e detalhe com linha do tempo nas oito etapas padrão (recebido, em análise, "precisamos de mais informações", "encaminhado à equipe", "vistoria realizada", "atendimento concluído", "vinculado a outro registro", "não foi possível atender"), datas, protocolos e mensagens públicas da triagem.
  - Mobile: `etapas.ts` traduz o código pelo catálogo (pt-BR, en e es) e o desconhecido vira "Em andamento"; o esquema descarta campo desconhecido antes do cache; o detalhe monta a linha por blocos, para a F34-E08 acrescentar a conversa.
  - API: lista e detalhe do relato do próprio cidadão (F16-E09).
- **O que NÃO deve ser implementado nesta etapa:** chat (F34-E08); equipe, severidade, prazo, trilha, vulnerabilidade, duplicidade e nome de servidor.
- **Arquivos e módulos prováveis:** `apps/cidadao/src/app/(cidadao)/relatos/index.tsx` e `[id].tsx`, `src/relato/etapas.ts`, `src/dados/relatos.ts` (a criar).
- **Risco de segurança:** alto; campo novo do servidor não chega à tela nem ao cache.
- **Impacto LGPD:** cache apagado no logout.
- **Migração necessária:** Não.
- **Compatibilidade:** etapa nova vira "Em andamento".
- **Rollback:** reverter.
- **Testes positivos:** cada etapa vira a frase certa; protocolo oficial após a conversão.
- **Testes negativos:** fixture com `equipe`, `severidade` e `notaInterna` não é exibida nem guardada; sem rede, o cache.
- **Testes de autorização e isolamento:** relato de outro cidadão ou município: 404, igual a id inexistente.
- **Regressão obrigatória:** `npm run test:cidadao`, `test:api`, `test:isolamento`.
- **E2E:** acompanhar um relato convertido (E18), com capturas.
- **Validação humana:** Alyson valida as frases em pt-BR e Rafael lê en e es; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G17/V2-F17-E10/`: capturas e `INDEX.md`.
- **Documentação a atualizar:** `LEIA-ME.md`.
- **Definition of Done:** oito etapas em texto simples; só a lista de inclusão chega à tela.
- **Checkpoint:** Não.

### V2-F17-E11 - Complemento a pedido da triagem
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com F17-E12: arquivos disjuntos)
- **Objetivo:** quando a triagem pede mais informação, o cidadão responde uma vez, com texto e fotos, e o relato volta à análise.
- **Problema que resolve:** sem retorno o relato fica parado em `aguardando_cidadao` (REL:07 fluxo 14); o chat por relato é da F34-E05 a E08 e o complemento segue resposta única.
- **Origem:** DP:T21; REL:07 (11.5, DH-16, DH-18); PR:D-07.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E10; V2-F18-E04 (cria `CAMPOS_DO_COMPLEMENTO` e os limites da mensagem em `packages/shared/src/relato-complemento.ts`; a E11 só fecha depois da F18-E04).
- **O que deve ser implementado:**
  - Mobile: no detalhe, com o relato em `aguardando_cidadao`, mostra a mensagem pública e os campos pedidos (lista fechada `CAMPOS_DO_COMPLEMENTO`, definida em F18-E04) e um formulário de resposta única; reaproveita os campos da E07 e `upload-core`; `chaveDeCriacao` própria; depois do envio a etapa volta a "em análise".
  - API: rota de complemento do cidadão de F16 (transição `aguardando_cidadao` para `em_analise`).
  - UX: sem campo fora do pedido; mostra o prazo de expiração se o servidor o informar (F16-E13).
- **O que NÃO deve ser implementado nesta etapa:** chat (F34-E08), mensagem espontânea, edição do relato, push (E13).
- **Arquivos e módulos prováveis:** `apps/cidadao/src/app/(cidadao)/relatos/[id]/complemento.tsx`, `src/relato/complemento.ts` (a criar).
- **Risco de segurança:** médio; resposta duplicada ou fora de estado; o servidor só aceita em `aguardando_cidadao`.
- **Impacto LGPD:** texto livre fica no relato com retenção (F16-E14), nunca na trilha.
- **Migração necessária:** Não.
- **Compatibilidade:** campo desconhecido mostra só a mensagem.
- **Rollback:** reverter.
- **Testes positivos:** resposta com foto devolve o relato a "em análise"; reenvio com a mesma chave não duplica.
- **Testes negativos:** responder relato fora de `aguardando_cidadao`: 409 explicado na tela; resposta vazia recusada; segunda resposta ao mesmo pedido recusada.
- **Testes de autorização e isolamento:** cidadão B responde ao pedido do relato de A: 404.
- **Regressão obrigatória:** `npm run test:cidadao`, `test:api`, `test:isolamento`.
- **E2E:** fluxo F: pedido de complemento e resposta (F18-E11).
- **Validação humana:** Rafael responde a um pedido sintético; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G17/V2-F17-E11/`: capturas, `INDEX.md` e testes.
- **Documentação a atualizar:** `apps/cidadao/LEIA-ME.md`.
- **Definition of Done:** uma resposta por pedido, idempotente.
- **Checkpoint:** Não.

### V2-F17-E12 - Encerramento e histórico
- **Prioridade:** P1
- **Tamanho:** S  |  **Complexidade:** baixa  |  **Risco:** médio  |  **Paralelizável:** sim (com F17-E11: arquivos disjuntos)
- **Objetivo:** o cidadão vê como cada relato terminou, cancela um relato recém-enviado e gerencia a sessão.
- **Problema que resolve:** sem tela de encerramento o cidadão não sabe se foi atendido (REL:07 DH-32); sem cancelar, relato enviado por engano vira ruído.
- **Origem:** DP:T21; REL:07 (DH-17, DH-32); PR:D-12.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E10.
- **O que deve ser implementado:**
  - Mobile: relato `encerrado` mostra a resolução em frase fixa por código (catálogo nos três idiomas): convertido (com o protocolo oficial), vinculado a outro registro, não foi possível atender (motivo estruturado), fora do município atendido, expirado, cancelado por você; filtro "encerrados" na lista.
  - Mobile: "Cancelar relato" só em `recebido`, com confirmação que repete o verbo e o protocolo (resolução `cancelado_pelo_cidadao`).
  - Mobile: "Minha conta" com e-mail, CPF mascarado (E20), aceite vigente (E14), idioma (pt-BR, en ou es, guardado no aparelho), "Sair deste aparelho" e "Sair em todos os aparelhos" (F15-E05).
- **O que NÃO deve ser implementado nesta etapa:** pedidos de titular (E19); reabrir relato encerrado.
- **Arquivos e módulos prováveis:** `apps/cidadao/src/app/(cidadao)/conta.tsx`, `src/relato/resolucoes.ts` (a criar).
- **Risco de segurança:** médio; texto de rejeição que acuse o cidadão; só frase fixa por código, nunca o texto interno.
- **Impacto LGPD:** a conta mostra só o e-mail e o CPF mascarado próprios.
- **Migração necessária:** Não.
- **Compatibilidade:** resolução desconhecida vira "Encerrado".
- **Rollback:** reverter.
- **Testes positivos:** cancelar em `recebido` encerra com `cancelado_pelo_cidadao`; "sair em todos" revoga os outros aparelhos.
- **Testes negativos:** relato `em_analise` não mostra "Cancelar" e o servidor responde 409; rejeição nunca exibe texto livre; trocar o idioma não perde a sessão.
- **Testes de autorização e isolamento:** cancelar relato de outro cidadão: 404.
- **Regressão obrigatória:** `npm run test:cidadao`, `test:api`, `test:isolamento`.
- **E2E:** relato cancelado e convertido (E18), com capturas.
- **Validação humana:** Alyson lê as seis frases em pt-BR e Rafael as de en e es; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G17/V2-F17-E12/`: capturas e `INDEX.md`.
- **Documentação a atualizar:** `apps/cidadao/LEIA-ME.md`.
- **Definition of Done:** seis resoluções em frase fixa; cancelamento só no estado certo.
- **Checkpoint:** Não.

### V2-F17-E13 - Push do cidadão (aparelho sem usuário)
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com F17-E03 e F17-E04: arquivos disjuntos)
- **Objetivo:** o cidadão recebe aviso de novidade no relato em aparelho ligado à sua conta.
- **Problema que resolve:** `aparelhos` é preso a `usuarios`, a um bundle e a um projeto FCM (REL:07 gap 21).
- **Origem:** DP:T31; BZ-M:V2-CID-10; REL:07 (gap 21, DH-15); PR:D-12.
- **Estado atual:** EXPANDIR; mantém `apns.ts`, `fcm.ts` e a vitrine constante.
- **Dependências de entrada:** G15 (aparelhos do cidadão em F15-E02).
- **O que deve ser implementado:**
  - Banco: migration com a fila `avisos_do_cidadao`, a coluna `idioma` da ficha e a função `varrer_avisos_do_cidadao`, que reivindica antes de enviar (molde de `varrer_tarefas_novas`).
  - API: `POST /v1/cidadao/aparelhos` e revogação (`cidadao_id` do token); credenciais por aplicativo (`APNS_BUNDLE` e conta FCM próprios); evento público enfileira o aviso; vitrine constante por idioma ("Há uma novidade no seu relato", catálogo da F08-E08).
  - Mobile: `expo-notifications`; permissão pedida depois do primeiro relato, com explicação antes; sair revoga a ficha.
- **O que NÃO deve ser implementado nesta etapa:** push do agente (F14-E05); conteúdo na notificação.
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `apps/api/src/push/`, `apps/api/src/config.ts`, `apps/cidadao/src/push/` (a criar).
- **Risco de segurança:** alto; entrega ao cidadão errado em aparelho trocado de mão.
- **Impacto LGPD:** a ficha identifica o aparelho; revogada no logout.
- **Migração necessária:** Sim (`NNN_push_do_cidadao.sql`, NNN próxima livre, hoje 047).
- **Compatibilidade:** push do agente igual.
- **Rollback:** desligar o envio.
- **Testes positivos:** mudança pública do relato gera um aviso por aparelho do dono; rodada repetida não duplica.
- **Testes negativos:** vitrine sem texto do relato; idioma desconhecido cai em pt-BR; ficha inválida (410) revoga o aparelho; sem permissão o app segue sem erro.
- **Testes de autorização e isolamento:** ficha re-registrada por B passa a B; aviso do relato de A nunca sai ao aparelho de B.
- **Regressão obrigatória:** `npm run test:api` (`push-*.test.ts`), `test:isolamento`.
- **E2E:** `apps/api/test/push-do-cidadao.test.ts` (a criar), com provedor falso.
- **Validação humana:** Rafael recebe o aviso em aparelho de HML; foto no portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G17/V2-F17-E13/`: testes, foto e `INDEX.md`.
- **Documentação a atualizar:** `docs/SUBPROCESSADORES.md`.
- **Definition of Done:** push com vitrine constante, isolado e revogável.
- **Checkpoint:** Não.

### V2-F17-E14 - Aceite e política dentro do app
- **Prioridade:** P0
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** sim (com F17-E03 e F17-E04: arquivos disjuntos)
- **Objetivo:** o app mostra a política vigente e registra o aceite versionado, sem texto jurídico.
- **Problema que resolve:** não há tela, versão nem registro de aceite (REL:07 gap 9).
- **Origem:** DP:J1; DP:J2; BZ-M:V2-TRV-01; REL:07 (gap 9); PR:D-07.
- **Estado atual:** CRIAR; consome F05-E06, F05-E07 e a rota de F15-E15.
- **Dependências de entrada:** F15-E15 (aceite e política mínima para o beta).
- **O que deve ser implementado:**
  - Mobile: depois do login, se houver versão com `exige_aceite`, tela antes do primeiro relato: resumo curto, link da política em URL estável (`expo-web-browser`, sem WebView), "Li e aceito" e "Agora não"; a finalidade do CPF (F15-E15) tem aceite próprio, pedido antes da E20; versão e data em "Minha conta" (E12); revogar volta a bloquear o envio; política na língua da versão publicada.
  - API: consome a versão vigente e o aceite do cidadão (F15-E15); sem versão publicada nada aparece.
- **O que NÃO deve ser implementado nesta etapa:** texto, base legal, menores e termos (CP-11).
- **Arquivos e módulos prováveis:** `apps/cidadao/src/app/aceite.tsx`, `src/dados/aceite.ts` (a criar).
- **Risco de segurança:** alto; aceite forjado ou pulado; o servidor recusa relato sem aceite vigente.
- **Impacto LGPD:** registra versão, data e IP (F05-E06); texto real em CP-11.
- **Migração necessária:** Não.
- **Compatibilidade:** sem versão o fluxo segue sem tela.
- **Rollback:** desligar `exige_aceite`.
- **Testes positivos:** aceite grava a versão vigente; nova versão pede novo aceite.
- **Testes negativos:** "Agora não" impede enviar relato; revogar bloqueia o envio; sem aceite vigente: recusado.
- **Testes de autorização e isolamento:** o aceite de A não vale para B.
- **Regressão obrigatória:** `npm run test:cidadao`, `test:api`, `test:isolamento`.
- **E2E:** aceite com versão sintética (E18), com capturas.
- **Validação humana:** Rafael aceita e revoga uma versão sintética; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G17/V2-F17-E14/`: capturas, `INDEX.md` e testes.
- **Documentação a atualizar:** `docs/PRIVACIDADE.md`.
- **Definition of Done:** aceite versionado e revogável em HML.
- **Checkpoint:** CP-11 (decide base legal, texto, termos, menores e direitos do titular; bloqueia beta externo e abertura pública; mecanismo e beta interno com texto sintético andam).

### V2-F17-E15 - Acessibilidade nativa, idiomas e VLibras (VoiceOver, TalkBack, fonte 200%, rotação)
- **Prioridade:** P1
- **Tamanho:** L  |  **Complexidade:** alta  |  **Risco:** médio  |  **Paralelizável:** não (varre E05 a E12 e E20)
- **Objetivo:** toda tela passa no alvo de DP:T29 (leitor de tela, fonte 200%, toque de 44 pt e 48 dp, movimento reduzido) nos três idiomas e com o tema do município.
- **Problema que resolve:** nada foi provado em leitor de tela (REL:11); D-11 e D-12 somam idiomas, cor e Libras.
- **Origem:** DP:T29; DP:K18; REL:11; PR:D-11; PR:D-12.
- **Estado atual:** CRIAR; usa F08-E06 e F08-E13.
- **Dependências de entrada:** E05 a E12, E20; F08-E10, E12.
- **O que deve ser implementado:**
  - Acessibilidade: papel, rótulo e estado em todo controle; foco lógico; anúncio de estado; fonte 200% sem corte; alvo de 44 pt e 48 dp; `isReduceMotionEnabled` desliga animação; nada só por cor.
  - Idiomas e tema: rótulos do catálogo e leitor na língua escolhida; en e es sem corte; cor sem contraste AA cai no DC360 (F08-E10).
  - VLibras: `src/ui/Libras.tsx` com o contrato da F08-E12, desligado por padrão e fora de login e CPF; aplicação na F35.
  - Infraestrutura: tokens `toque.minimo.ios` e `toque.minimo.android` (F08-E07).
- **O que NÃO deve ser implementado nesta etapa:** teste com pessoa com deficiência (F23-E05); lint (F23-E02); VLibras em produção.
- **Arquivos e módulos prováveis:** `apps/cidadao/src/ui/`, `src/app/`, `apps/cidadao/ACESSIBILIDADE.md` (a criar).
- **Risco de segurança:** Não se aplica: sem dado.
- **Impacto LGPD:** Não se aplica: sem dado.
- **Migração necessária:** Não.
- **Compatibilidade:** tokens só do cidadão.
- **Rollback:** reverter por tela.
- **Testes positivos:** o portão cobre toda tela; VoiceOver e TalkBack percorrem o fluxo nos três idiomas.
- **Testes negativos:** botão sem rótulo ou alvo de 40 pt reprova; texto cortado a 200% reprova; VLibras sem toque reprova.
- **Testes de autorização e isolamento:** Não se aplica: sem rota.
- **Regressão obrigatória:** `npm run test:cidadao`, `test:scripts`, `conferir:tokens`.
- **E2E:** passada em aparelho e jest de layout com `fontScale` 2.
- **Validação humana:** Alyson e Rafael com leitor de tela e fonte 200%; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G17/V2-F17-E15/`: resultado por tela e capturas.
- **Documentação a atualizar:** `dc360/docs/DESIGN-SYSTEM.md`.
- **Definition of Done:** nenhuma tela reprovada.
- **Checkpoint:** CP-38 (rotação; recomendação: livre); CP-45 (bloqueia ativar em produção).

### V2-F17-E16 - Crash reporting e telemetria sem dado pessoal
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** sim (com F17-E03 e F17-E04: arquivos disjuntos)
- **Objetivo:** erros e quedas do app chegam ao destino de CP-06 com `X-Request-Id` e sem dado pessoal.
- **Problema que resolve:** nenhum app captura erro (REL:11); no cidadão o relatório copiaria e-mail, CPF, texto e coordenada para fora do município.
- **Origem:** DP:T33; REL:11; REL:07 (DH-39); PR:D-07.
- **Estado atual:** CRIAR; usa o adaptador de erro e o `X-Request-Id` de F01-E14.
- **Dependências de entrada:** F01-E14.
- **O que deve ser implementado:**
  - Mobile: `src/observabilidade/erros.ts` com a porta `PortaDeErros` (SDK compatível com Sentry só após CP-06; antes, log local); o `ErrorBoundary` e os erros não tratados passam por `filtrar()`, que remove e-mail, CPF, texto do relato, coordenada, ficha de push, `authorization`, URL com consulta e corpo de requisição; anexa `X-Request-Id` e versão; sem identificador de pessoa ou aparelho.
  - Observabilidade: só contadores por código de falha, sem trilha de uso; a tela de erro mostra o código ao suporte.
- **O que NÃO deve ser implementado nesta etapa:** tracing e SLO (F21); métrica por pessoa; SDK nativo antes de CP-06.
- **Arquivos e módulos prováveis:** `apps/cidadao/src/observabilidade/erros.ts` e `filtro.test.ts` (a criar).
- **Risco de segurança:** alto; relatório de erro é cópia de dado pessoal fora do controle do município; o filtro é o portão.
- **Impacto LGPD:** destino e residência do erro são subprocessador (CP-06); sem dado pessoal por construção.
- **Migração necessária:** Não.
- **Compatibilidade:** adaptador injetável.
- **Rollback:** adaptador de log local.
- **Testes positivos:** erro simulado chega ao adaptador com `X-Request-Id` e versão.
- **Testes negativos:** sentinelas de e-mail, CPF, descrição, latitude, ficha e `Authorization` não saem do filtro; filtro ausente não envia.
- **Testes de autorização e isolamento:** Não se aplica: sem rota nem dado de município; o filtro é o controle.
- **Regressão obrigatória:** `npm run test:cidadao`, `npm run auditar`.
- **E2E:** queda simulada em build de HML chega ao destino.
- **Validação humana:** Rafael provoca o erro e confere o evento.
- **Evidência a produzir:** `docs/evidencias-v2/G17/V2-F17-E16/`: evento filtrado.
- **Documentação a atualizar:** `docs/SUBPROCESSADORES.md`.
- **Definition of Done:** nenhum sentinela sai; request id visível ao suporte.
- **Checkpoint:** Não.

### V2-F17-E17 - Builds internos (TestFlight e teste interno do Google Play)
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** sim (com F17-E03, F17-E04 e F17-E16)
- **Objetivo:** gerar builds de HML e entregá-los à equipe pelo TestFlight interno e pelo teste interno do Google Play.
- **Problema que resolve:** o `eas.json` do campo tem "PREENCHER"; sem HML e contas de loja o app público é risco novo (REL:07 gap 19).
- **Origem:** DP:R5; DP:T30; BZ-M:V2-CID-11; REL:07 (10.4, gap 19, 26).
- **Estado atual:** CRIAR; MANTER `apps/campo/eas.json` e `LOJAS.md`.
- **Dependências de entrada:** E02 (e o perfil EAS de HML de F01-E13).
- **O que deve ser implementado:**
  - Mobile: `apps/cidadao/eas.json` com `desenvolvimento`, `homologacao` (APK interno, bundle `.hml`, URL de HML) e `beta-interno` (build `store` com URL de HML; `submit` com `track: "internal"` e `releaseStatus: "draft"`, e TestFlight interno); `app.config.ts` com textos de permissão em pt-BR, en e es e `NSAllowsArbitraryLoads: false`; `google-services.json` do projeto de CP-04.
  - Infraestrutura: `scripts/perfis-do-eas.test.mjs` (F01-E13) estendido ao cidadão.
  - Documentação: `apps/cidadao/LOJAS.md` com categoria e rótulos de privacidade.
- **O que NÃO deve ser implementado nesta etapa:** beta externo, trilha aberta, produção (CP-11, CP-26, CP-28, G25, CP-33); F28-E07.
- **Arquivos e módulos prováveis:** `apps/cidadao/eas.json`, `LOJAS.md` (a criar), `dc360/scripts/perfis-do-eas.test.mjs` (F01-E13).
- **Risco de segurança:** alto; build interno apontando para PROD.
- **Impacto LGPD:** aviso de HML; sem dado real.
- **Migração necessária:** Não.
- **Compatibilidade:** campo inalterado.
- **Rollback:** expirar o build interno.
- **Testes positivos:** os builds instalam nos dois sistemas e falam com HML.
- **Testes negativos:** perfil externo ou `releaseStatus` diferente de `draft` reprova `perfis-do-eas.test.mjs`; URL de PROD no perfil de HML reprova.
- **Testes de autorização e isolamento:** acesso emitido em HML não vale na API de PROD: 401 (segredos por ambiente, F01-E09).
- **Regressão obrigatória:** `npm run test:scripts`, `test:cidadao`, `auditar`.
- **E2E:** instalar o build de HML e entrar, em Android e iPhone.
- **Validação humana:** Rafael instala pelas duas trilhas; foto do aparelho no portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G17/V2-F17-E17/`: id do build, hash, capturas e `INDEX.md`.
- **Documentação a atualizar:** `apps/cidadao/LOJAS.md`.
- **Definition of Done:** build instalado pelas trilhas internas, apontando para HML.
- **Checkpoint:** CP-04 (sem entidade e contas só roda `desenvolvimento` em emulador; EAS de HML, TestFlight e Google Play ficam bloqueados).

### V2-F17-E18 - E2E do app (fluxo feliz e erros)
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (varre o fluxo inteiro das etapas E04 a E14)
- **Objetivo:** provar o fluxo do app contra a API real, com dados sintéticos, no caminho feliz e nos erros.
- **Problema que resolve:** testes de tela usam dublês; só o servidor real prova idempotência, plateia e limites, como `campo-integracao.test.ts` no campo.
- **Origem:** PR:Fluxos; DP:T35; REL:07 (11.10); PR:D-07.
- **Estado atual:** CRIAR; EXPANDIR `cidadao-integracao.test.ts`, iniciado na E08.
- **Dependências de entrada:** E12.
- **O que deve ser implementado:**
  - Testes: `apps/api/test/cidadao-integracao.test.ts` com servidor em memória no modo `publica` e os pacotes `cliente-api` e `upload-core` reais: login por OTP com notificador de teste, CPF sintético, relato com duas fotos, reenvio concorrente, acompanhamento, complemento, cancelamento, 401, 404, 426, 429, aceite exigido, `cpf_pendente`, conta bloqueada.
  - Mobile: `apps/cidadao/e2e/` (jest-expo com `fetch` real) e `scripts/e2e-cidadao.mjs`, que sobe a API em porta própria no molde de `scripts/e2e-api.mjs`.
  - Documentação: `apps/cidadao/ROTEIRO-DE-TESTE.md`, roteiro manual com o build de HML (E17).
- **O que NÃO deve ser implementado nesta etapa:** fluxos F e G (F18-E11); fluxo H (F19-E07); aparelho físico (F26-E02); carga (F24-E09); vídeo e chat (F34-E20).
- **Arquivos e módulos prováveis:** `apps/api/test/cidadao-integracao.test.ts`, `apps/cidadao/e2e/`, `dc360/scripts/e2e-cidadao.mjs`, `dc360/package.json` (a criar `test:e2e:cidadao`).
- **Risco de segurança:** médio; o notificador de teste não existe em produção.
- **Impacto LGPD:** Não se aplica: dados sintéticos.
- **Migração necessária:** Não.
- **Compatibilidade:** independente do E2E do painel.
- **Rollback:** reverter o commit.
- **Testes positivos:** do login ao encerramento passa; reenvio concorrente gera um relato.
- **Testes negativos:** envio sem rede guarda o rascunho; código errado repetido bloqueia (F15-E04); 426, 429, conta bloqueada, `cpf_pendente` e município não habilitado mostram a tela certa.
- **Testes de autorização e isolamento:** cidadão B lê relato de A: 404; acesso do cidadão em `GET /ocorrencias`: 401.
- **Regressão obrigatória:** `npm run test:api`, `test:cidadao`, `test:e2e:api`, `test:isolamento`.
- **E2E:** este é o E2E; saída arquivada.
- **Validação humana:** Rafael executa o roteiro manual em Android e iPhone; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G17/V2-F17-E18/`: saída dos testes e do roteiro, capturas e `INDEX.md`.
- **Documentação a atualizar:** `dc360/README.md`.
- **Definition of Done:** fluxo feliz e erros verdes contra a API real.
- **Checkpoint:** Não.

### V2-F17-E19 - Pedido de acesso, correção e exclusão de conta dentro do app
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (mexe em `conta.tsx`)
- **Objetivo:** o cidadão pede acesso, correção ou exclusão no app e acompanha; o município atende pela fila.
- **Problema que resolve:** nada liga o app à fila; as lojas costumam exigir iniciar a exclusão no app (NÃO CONFIRMADO).
- **Origem:** BZ-M:V2-TRV-02; DP:J5; DP:T37.
- **Estado atual:** EXPANDIR `pedidos_de_titular` (F05-E08) e `conta.tsx`.
- **Dependências de entrada:** V2-F17-E04, V2-F05-E08 e V2-F15-E02; CP-11.
- **O que deve ser implementado:**
  - Banco: em `pedidos_de_titular`: `origem`, `cidadao_id`, `relato_id`; UNIQUE parcial de um pedido aberto por cidadão, município e tipo.
  - API: `POST /v1/cidadao/pedidos-de-titular` (tipo, `relatoId`, mensagem de até 500 caracteres, `chaveDeCriacao`) e `GET`; o município sai do relato, nunca do corpo.
  - Mobile: "Meus direitos" em `direitos.tsx`: município dos próprios relatos, confirmação e lista; sem relato, o link do encarregado.
  - Frontend: origem "Pelo aplicativo" na fila; caso semeado em `local.ts`.
- **O que NÃO deve ser implementado nesta etapa:** prazo, quem atende, resposta e base legal (CP-11); apagar a conta (F20); apagar relato convertido.
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `apps/api/src/rotas/pedidos-de-titular-do-cidadao.ts`, `src/dados/pedidos.ts` (a criar).
- **Risco de segurança:** alto; pedido em nome de outro titular.
- **Impacto LGPD:** e-mail e mensagem livre; retenção `a_decidir` (CP-11).
- **Migração necessária:** Sim (`NNN_pedido_de_titular_do_cidadao.sql`, NNN próxima livre, hoje 047).
- **Compatibilidade:** `origem` padrão `painel`.
- **Rollback:** desligar a rota.
- **Testes positivos:** o pedido de A entra na fila do município com origem `app`.
- **Testes negativos:** relato alheio no corpo: 404; segundo pedido aberto do tipo: 409; mensagem de 501 caracteres: 422.
- **Testes de autorização e isolamento:** cidadão B lê pedido de A: 404; token do cidadão na rota do painel: 401.
- **Regressão obrigatória:** `npm run test:isolamento`, `test:api`.
- **E2E:** `cidadao-integracao.test.ts`: abrir, ver na fila, ler o estado; capturas.
- **Validação humana:** Rafael e o DPO; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G17/V2-F17-E19/`: testes, capturas e `INDEX.md`.
- **Documentação a atualizar:** `docs/PRIVACIDADE.md`.
- **Definition of Done:** três pedidos abrem no app, entram na fila e são acompanhados.
- **Checkpoint:** CP-11 (decide prazo, quem atende, base legal e o que a exclusão apaga; bloqueia pedido real; o mecanismo anda em HML).

### V2-F17-E20 - CPF no relato identificado: campo, validação e máscara
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (E08 depende do CPF)
- **Objetivo:** o cidadão informa o CPF, depois só vê a máscara e não envia relato sem ele.
- **Problema que resolve:** D-07 torna o CPF obrigatório; a F15-E16 entrega a rota e a tela é desta fase.
- **Origem:** PR:D-07; DP:J4; BZ-D:LGP-01.
- **Estado atual:** CRIAR; consome a rota de CPF e `GET /v1/cidadao/eu` (F15-E16).
- **Dependências de entrada:** E04; E14; F15-E16; F05-E13; CP-46 para CPF real.
- **O que deve ser implementado:**
  - Mobile: `cpf.tsx` após login e aceite, se `cpfPendente`; rótulo "Digite os 11 números do seu CPF", máscara `000.000.000-00`; `cpfDoCidadaoSchema` recusa dígito errado e sequência repetida, com mensagem que diz o que fazer; salvo, só `cpfMascarado`.
  - Mobile: o campo aceita valor de provedor (gancho da F34: o CPF do gov.br chega pronto, F34-E17); o CPF fica só em memória, sem rascunho, cache nem log.
- **O que NÃO deve ser implementado nesta etapa:** CPF completo depois de salvo; troca de CPF (E19); consulta à Receita; gov.br (F34-E13).
- **Arquivos e módulos prováveis:** `apps/cidadao/src/app/(cidadao)/cpf.tsx`, `src/relato/cpf.ts`, `src/__tests__/cpf.test.tsx` (a criar).
- **Risco de segurança:** alto; CPF em tela e memória; o 409 é oráculo, mensagem genérica.
- **Impacto LGPD:** dado de alto valor, pedido após o aceite e exibido mascarado.
- **Migração necessária:** Não.
- **Compatibilidade:** conta sem CPF segue lendo.
- **Rollback:** reverter o app.
- **Testes positivos:** CPF sintético salva e a tela mostra só a máscara.
- **Testes negativos:** dígito errado e sequência repetida param no aparelho; 409 e 429 genéricos; CPF sentinela ausente de log e `filtrar()` (E16).
- **Testes de autorização e isolamento:** a máscara de A não aparece no login de B no mesmo aparelho.
- **Regressão obrigatória:** `npm run test:cidadao`, `test:api`, `test:isolamento`.
- **E2E:** `scripts/e2e-cidadao.mjs`: cadastrar CPF sintético e relatar, com capturas.
- **Validação humana:** Rafael cadastra um CPF sintético em Android e iOS; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G17/V2-F17-E20/`: testes, capturas e `INDEX.md`.
- **Documentação a atualizar:** `docs/PRIVACIDADE.md`.
- **Definition of Done:** CPF validado, só mascarado, relato barrado sem ele.
- **Checkpoint:** CP-46 (finalidade, retenção e parecer jurídico; bloqueia CPF real; HML sintético anda).

# GATE G17 - APP DO CIDADÃO EM BETA INTERNO
Só passa se:
- [ ] V2-F17-E01 (P0) e CP-04: ADR 0017 aprovada; CP-04 decidido, ou adiado por escrito com bundle provisório e a E17 limitada ao perfil `desenvolvimento` em emulador. Evidência: E01.
- [ ] V2-F17-E02 (P0): `apps/cidadao` abre em Android e iOS, nos dois temas e nos três idiomas, e entra em `isolamento-do-cidadao`, `versoes-dos-apps`, `textos-do-cidadao`, `superficies.test.mjs` e no job `cidadao`; ErrorBoundary testado; tema do município aplicado pelo contrato da F08-E11. Evidência: E02.
- [ ] V2-F17-E03: `upload-core` usado por campo e cidadão, com `campo-integracao.test.ts` e `fila.test.ts` sem expectativa editada. Evidência: E03.
- [ ] V2-F17-E04 (P0): login por OTP, renovação e saída em HML, com a lista de provedores por configuração (gancho da F34-E12); acesso do cidadão em `GET /ocorrencias`: 401; zero dado pessoal em log. Evidência: E04.
- [ ] V2-F17-E20 (P0) e CP-46: o CPF é pedido com máscara e validação, mostrado só mascarado, e o relato sem CPF é barrado; CPF sentinela ausente de log, rascunho e erro; CP-46 decidido ou adiado por escrito com CPF real e abertura pública bloqueados. Evidência: E20.
- [ ] V2-F17-E05: aviso de 190, 192 e 193 em toda tela autenticada e quatro estados testados. Evidência: E05.
- [ ] V2-F17-E06 (P0) e E07 (P0): três formas de local, três respostas de município (não habilitado uniforme) e limites de T24 aplicados no aparelho. Evidência: E06 e E07.
- [ ] V2-F17-E08 (P0): cinco reenvios concorrentes geram um só relato, o rascunho sobrevive a reinício e o logout o apaga. Evidência: E08.
- [ ] V2-F17-E09 (P0) e E10 (P0): protocolo explicado como não oficial; acompanhamento só por lista de inclusão (fixture contaminada não é exibida nem guardada). Evidência: E09 e E10.
- [ ] V2-F17-E19 e CP-11: o cidadão abre pedido de acesso, correção ou exclusão no app e o município o recebe na fila de F05-E08 com origem `app` e município derivado do relato (relato alheio: 404); o app acompanha o estado, nada é apagado nem desativado por ele e nenhum prazo ou texto de resposta foi inventado; CP-11 decidido ou adiado por escrito com atender pedido real bloqueado. Evidência: E19.
- [ ] V2-F17-E11 e E12 (E11 só depois de V2-F18-E04): complemento único e idempotente; cancelamento só em `recebido`; seis resoluções em frase fixa. Evidência: E11 e E12.
- [ ] V2-F17-E13: push com vitrine constante, isolado por conta e revogável no logout. Evidência: E13.
- [ ] V2-F17-E14 (P0) e CP-11: aceite versionado e revogável com texto sintético; CP-11 decidido ou adiado por escrito com beta externo e abertura pública bloqueados. Evidência: E14.
- [ ] V2-F17-E15 e CP-38: passada em VoiceOver e TalkBack nos três idiomas sem tela reprovada, fonte a 200%, toque de 44 pt e 48 dp; ponto do VLibras presente e desligado (CP-45 decidido ou adiado, sem ativar em produção); CP-38 decidido ou adiado (padrão: rotação livre). Evidência: E15.
- [ ] V2-F17-E16: nenhum sentinela de dado pessoal sai do filtro de erro; destino conforme CP-06 ou adaptador local. Evidência: E16.
- [ ] V2-F17-E17 (P0) e CP-04: builds nas trilhas internas das duas lojas apontando para HML, sem perfil externo. Evidência: E17.
- [ ] V2-F17-E18: `cidadao-integracao.test.ts` e o E2E do app verdes, com CPF e `cpf_pendente`. Evidência: E18.
- [ ] Portão visual: toda etapa de tela (E02, E04 a E15, E17 a E20) tem capturas do simulador e foto do aparelho, claro e escuro, nos estados normal, vazio, erro e carregando, com o checklist da seção 0 de `19-definicao-de-pronto.md` preenchido e o portão da F08-E13 verde; Rafael aprovou as capturas. Evidência: `capturas/` e `INDEX.md` de cada etapa.
- [ ] CP-27 revisitado: relatório do beta interno (rejeições e spam por semana) e decisão por escrito de manter a base; CAPTCHA e atestação só com abuso observado. Evidência: relatório em `docs/evidencias-v2/G17/`.
- [ ] Beta externo continua bloqueado por escrito (CP-11, CP-26, CP-28, G25, CP-33): nenhum build externo e canal desligado fora de HML. Evidência: `eas.json` e `perfis-do-eas.test.mjs`.
- [ ] `npm run test:isolamento`, `npm run test:api`, `npm run test:scripts`, `npm run test:campo`, `npm run test:cidadao`, `npm run typecheck`, `npm run auditar` (inclui `apps/cidadao`) e `npm run conferir:numeros` verdes. Evidência: saída arquivada.
- [ ] nenhuma regressão: todos os gates anteriores na ordem de execução continuam verdes (se um quebrar, ESTE gate volta a REPROVADO).
- [ ] documentação atualizada e evidências arquivadas em `docs/evidencias-v2/G17/`.

**Reabre se:** o app apagar ou desativar dado por pedido de titular sem decisão do município; o CPF aparecer completo na tela, em log ou em erro; texto fixo fora do catálogo de idiomas; o app importar o barril do shared ou a UI do campo; um build externo ou perfil de loja pública existir antes de CP-11, CP-26, CP-28, G25 e CP-33; o relato duplicar no reenvio; campo fora da lista de inclusão chegar à tela ou ao cache; dado pessoal sair no erro; `upload-core` quebrar o envio do campo; G15 ou G16 reabrir.
**Este Gate libera:** F18-E11 (E2E dos fluxos F e G), a F34 (junto de G18, que a precede na ordem de execução) e a F19 (junto de G18, G34 e G14), e o beta interno. NÃO libera beta externo nem abertura pública do canal.

# Fase 18: Triagem no painel

**Gate da fase:** G18 TRIAGEM NO PAINEL | **Depende dos gates:** G16 (cumulativo: todos os anteriores na ordem de execução de `STATUS.md`, seção 5; o E2E de E11 depende de G17) | **Superfícies tocadas:** `apps/web` (principal), `apps/api` (rotas de triagem), `packages/shared` (ações e lista de complemento), `packages/i18n` (consumo), `db` (migrations pontuais) | **Checkpoints da fase:** CP-26, CP-46

A caixa de triagem no PAINEL torna o relato operável antes de qualquer beta externo: a Defesa Civil assume, classifica (tipo e prioridade), pede complemento com mensagem pública, vincula a relato ou ocorrência existente, rejeita com motivo, marca fora da jurisdição e converte em ocorrência com descrição operacional escrita pela triagem. NOTA INTERNA e MENSAGEM AO CIDADÃO ficam em campos separados na tela e no banco. Nunca se expõe ao cidadão equipe, severidade interna, dado de terceiro, trilha, vulnerabilidade, nota interna nem ID interno.

Preserva (MANTER): as páginas atuais, `Ocorrencia.tsx` e o fluxo de triagem e despacho da ocorrência (a conversão desemboca nele), `NovaOcorrencia`, `ConfirmarAcao`, `Toast`, os portões estáticos e os dois modos (ADR 0003). Regra dos dois modos (como F10): toda etapa diz como fica na API (`dados/http.ts`) e no modo local (`dados/local.ts`: mesma SQL sob as mesmas migrações; sem cidadão, fotos nem push, recusa com explicação), mantém `apps/web/test/paridade-dos-modos.test.ts` verde e semeia relatos sintéticos em `semente-da-demonstracao.sql`.

Texto e telas (D-11 e D-12): todo texto novo do painel nesta fase vem do catálogo `triagem.*` do pacote de idiomas da F08 (pt-BR, en e es; F08-E08), nunca fixo na tela; a frase pública que o cidadão lê vem do catálogo `cidadao.*` e o app a traduz por código (F17); a mensagem livre escrita pela triagem não é traduzida. O idioma por usuário e a identidade do município no painel são da F35. O VLibras (F08-E12) NÃO entra nas telas desta fase, que mostram dado do cidadão. Toda etapa de tela passa pelo portão visual de `19-definicao-de-pronto.md`, seção 0 (nada desalinhado, grudado ou fora do lugar; texto bem escrito) e pelo portão da F08 (F08-E13): capturas em 320, 768 e 1280 px, claro e escuro, estados normal, vazio, erro e carregando.

Canal ampliado (D-07): vídeo e chat por relato são da F34, que executa depois da F18 e antes da F19; aqui o detalhe do relato é montado por blocos registrados (E01), para a F34-E09 acrescentar o vídeo (leitura assinada de F06-E20) e a conversa sem reescrever a tela. O CPF do relato identificado aparece mascarado e só se revela com finalidade registrada (E13).

A decisão é sempre humana: duplicidade é só sinal, e nenhuma classificação, rejeição ou bloqueio é automático. O aviso de relato novo no sino é a E12 (a tabela `avisos` tem CHECK de quatro tipos e `ocorrencia_id` obrigatório). NÃO faz: prazo do relato (DH-35), expiração (F16-E13), política de moderação (CP-26), vídeo e chat (F34-E09, E10). Ação nova nasce em `packages/shared/src/permissoes.ts`: `triar_relato` (coordenador e administrador; operador só se CP-28 definir) e `anotar_relato` (E08). Ordem: E01, E02; E03 a E06 em sequência (mesmos arquivos); E07 e E08; E09; E12 e E13; E10 fecha as telas; E11 por último.

## Etapas

### V2-F18-E01 - Caixa de triagem: lista, filtros e estados
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (E02 a E09 estendem as telas)
- **Objetivo:** a Defesa Civil lista os relatos com filtros e abre o detalhe, com abertura registrada.
- **Problema que resolve:** o painel só trata ocorrência (REL:07 gap 23); abrir dado do cidadão sem registro repetiria o buraco antigo.
- **Origem:** BZ-M:V2-CID-04; DP:T21; REL:07 (gap 23); BZ-F:P0-LGPD; PR:D-07; PR:D-12.
- **Estado atual:** CRIAR (telas); EXPANDIR `Estrutura.tsx`, `App.tsx`, `TrocaDeTela.tsx`.
- **Dependências de entrada:** G16.
- **O que deve ser implementado:**
  - Banco: `relato_consultas` (molde de `ocorrencia_consultas`): append-only, RLS forçada, manifesto.
  - API: `GET /v1/triagem/relatos` (filtros) e `GET /v1/triagem/relatos/:id`, que grava a consulta na mesma transação; lista de inclusão sem contato, CPF nem texto do cidadão.
  - Autorização: ação `triar_relato` (coordenador e administrador) em `permissoes.ts`, com `ROTULO_ACAO`.
  - Frontend: `Triagem.tsx` (`/triagem`) e `Relato.tsx` (`/triagem/:id`, leitura, por blocos registrados para a F34-E09 acrescentar vídeo e conversa); textos de `triagem.*`; item "Triagem" com contador em `Estrutura.tsx`; `<Exige acao="triar_relato">`; `listarRelatosDaTriagem` e `abrirRelatoDaTriagem` em `http.ts` e `local.ts` (local sem fotos, seis relatos semeados).
- **O que NÃO deve ser implementado nesta etapa:** ações sobre o relato (E02 a E09); sino (E12); acessibilidade final (E10); vídeo e chat (F34-E09).
- **Arquivos e módulos prováveis:** `apps/web/src/paginas/Triagem.tsx`, `Relato.tsx`, `src/dados/http.ts`, `local.ts`, `apps/api/src/rotas/triagem-de-relatos.ts` (a criar).
- **Risco de segurança:** alto; dado do cidadão em lista e abertura sem rastro.
- **Impacto LGPD:** leitura nominal registrada.
- **Migração necessária:** Sim (`NNN_consulta_de_relato.sql`, NNN próxima livre, hoje 047).
- **Compatibilidade:** rotas novas; banco local sobe de `idb://dc360-v4`.
- **Rollback:** esconder o item de menu.
- **Testes positivos:** a lista filtra por estado; abrir grava uma consulta.
- **Testes negativos:** a lista não traz texto, contato nem CPF do cidadão; `UPDATE` em `relato_consultas`: negado.
- **Testes de autorização e isolamento:** coordenador de B abre relato de A: 404; operador sem a ação: 403.
- **Regressão obrigatória:** `npm test --workspace @dc360/web`, `npm run test:api`, `test:isolamento`.
- **E2E:** `fluxo.e2e.mjs` (local) e `fluxo-api.e2e.mjs`: abrir a caixa e um relato, com capturas.
- **Validação humana:** Rafael e Alyson; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G18/V2-F18-E01/`: capturas e `INDEX.md`.
- **Documentação a atualizar:** `dc360/docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** caixa nos dois modos; abertura registrada.
- **Checkpoint:** Não.

### V2-F18-E02 - Assumir relato
- **Prioridade:** P0
- **Tamanho:** S  |  **Complexidade:** baixa  |  **Risco:** médio  |  **Paralelizável:** não (E03 a E06 partem desta ação)
- **Objetivo:** um servidor assume o relato `recebido`, torna-se o responsável e o estado passa a `em_analise`.
- **Problema que resolve:** sem dono, dois servidores triam o mesmo relato.
- **Origem:** BZ-M:V2-CID-04; DP:T21.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E01.
- **O que deve ser implementado:**
  - API: `POST /v1/triagem/relatos/:id/assumir` (`triar_relato`): chama a transição de F16-E04 (`recebido` para `em_analise`) e grava o evento em `relato_eventos`; `UPDATE` condicional (`estado = 'recebido'`), de modo que o segundo recebe 409 `relato_ja_assumido` com o nome do responsável; tomar o relato de outro responsável exige motivo de 10 caracteres, gravado no evento.
  - Migration: só se F16-E02 não criou `responsavel_id` (FK composta para `usuarios`): `NNN_responsavel_do_relato.sql`.
  - Frontend: "Assumir relato" com `ConfirmarAcao` que repete o objeto; filtros "meus" e "sem responsável"; foco no título e Toast; `assumirRelato` em `http.ts` e `local.ts` (mesma SQL).
- **O que NÃO deve ser implementado nesta etapa:** classificar (E03); prazo do relato (DH-35); reatribuição em lote.
- **Arquivos e módulos prováveis:** `apps/web/src/paginas/Relato.tsx`, `apps/web/src/dados/http.ts`, `local.ts`, `apps/api/src/rotas/triagem-de-relatos.ts`, `packages/shared/src/permissoes.ts`.
- **Risco de segurança:** médio; corrida entre dois servidores; o banco decide, a tela só reflete.
- **Impacto LGPD:** Não se aplica: só o responsável.
- **Migração necessária:** Não (condicional: `NNN_responsavel_do_relato.sql`, hoje 047, só se faltar a coluna).
- **Compatibilidade:** rota nova.
- **Rollback:** reverter; o evento fica.
- **Testes positivos:** assumir leva a `em_analise` e grava o evento com o autor.
- **Testes negativos:** dois `POST` simultâneos: um 200 e um 409; assumir relato `encerrado`: 409; tomar de outro sem motivo: 422.
- **Testes de autorização e isolamento:** operador sem a ação: 403; coordenador de B assume relato de A: 404.
- **Regressão obrigatória:** `npm test --workspace @dc360/web`, `npm run test:api`, `npm run test:isolamento`; `paridade-dos-modos.test.ts`.
- **E2E:** `fluxo.e2e.mjs` e `fluxo-api.e2e.mjs`: assumir e ver o filtro "meus".
- **Validação humana:** Alyson, com dois usuários; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G18/V2-F18-E02/`: testes da corrida, capturas e `INDEX.md`.
- **Documentação a atualizar:** `dc360/docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** um responsável por relato, corrida resolvida no banco, nos dois modos.
- **Checkpoint:** Não.

### V2-F18-E03 - Classificar tipo e prioridade
- **Prioridade:** P1
- **Tamanho:** S  |  **Complexidade:** baixa  |  **Risco:** médio  |  **Paralelizável:** não (mesmos arquivos de E02, E04, E05 e E06)
- **Objetivo:** a triagem decide o tipo COBRADE e a prioridade internos, preservando o que o cidadão declarou.
- **Problema que resolve:** o cidadão declara o tipo sem competência técnica (`TIPO_A_CLASSIFICAR`) e a classificação governa o despacho; sem coluna própria o declarado seria sobrescrito.
- **Origem:** BZ-M:V2-CID-04; DP:T21; REL:07 (10.5).
- **Estado atual:** CRIAR; reaproveita `TIPOS_COBRADE` e os quatro níveis de `SEVERIDADES` como prioridade, sem taxonomia nova.
- **Dependências de entrada:** E02.
- **O que deve ser implementado:**
  - Migration: só se F16-E02 não criou `tipo_classificado` e `prioridade`: `NNN_triagem_do_relato.sql`, com RLS forçada.
  - API: `POST /v1/triagem/relatos/:id/classificar` (`triar_relato`) com `tipoClassificado` (só `TIPOS_COBRADE`, nunca `outro`) e `prioridade`, só em `em_analise`; evento com antes e depois.
  - Frontend: "Declarado pelo cidadão" ao lado de "Classificado pela triagem"; a prioridade ordena a caixa e nunca aparece ao cidadão; `classificarRelato` nos dois modos.
- **O que NÃO deve ser implementado nesta etapa:** severidade e prazo da ocorrência (a conversão E07 só os sugere; quem grava é `classificarNaTriagem`); alterar o tipo declarado.
- **Arquivos e módulos prováveis:** `apps/web/src/paginas/Relato.tsx`, `triagem-regras.ts`, `apps/web/src/dados/http.ts`, `local.ts`, `apps/api/src/rotas/triagem-de-relatos.ts`.
- **Risco de segurança:** médio; a prioridade interna vazar ao cidadão; fica fora da lista de inclusão de F16-E09.
- **Impacto LGPD:** Não se aplica: classificação interna.
- **Migração necessária:** Não (condicional: `NNN_triagem_do_relato.sql`, hoje 047, só se faltarem as colunas).
- **Compatibilidade:** tipo declarado imutável.
- **Rollback:** reverter.
- **Testes positivos:** classificar grava o tipo e a prioridade e preserva o declarado.
- **Testes negativos:** `outro` ou tipo fora da COBRADE: 422; relato `recebido` sem dono: 409; relato `encerrado`: 409.
- **Testes de autorização e isolamento:** operador sem a ação: 403; relato de outro município: 404; a leitura do cidadão não traz prioridade.
- **Regressão obrigatória:** `npm test --workspace @dc360/web`, `npm run test:api`, `npm run test:isolamento`.
- **E2E:** `fluxo.e2e.mjs` (modo local): classificar e ver a ordem da caixa.
- **Validação humana:** Alyson classifica três relatos sintéticos; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G18/V2-F18-E03/`: capturas, `INDEX.md` e testes.
- **Documentação a atualizar:** `dc360/docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** classificação interna separada do declarado, nos dois modos.
- **Checkpoint:** Não.

### V2-F18-E04 - Pedir complemento (mensagem pública)
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (mesmos arquivos de E03, E05 e E06)
- **Objetivo:** a triagem pede mais informação com mensagem pública e campos pedidos, e o relato passa a `aguardando_cidadao`.
- **Problema que resolve:** sem pedido estruturado a triagem recorreria à nota interna ou ao telefone (DP:T21).
- **Origem:** DP:T21; BZ-M:V2-CID-04; REL:07 (11.5).
- **Estado atual:** CRIAR; consome a mensagem pública de F16-E08.
- **Dependências de entrada:** E02.
- **O que deve ser implementado:**
  - Domínio: `packages/shared/src/relato-complemento.ts` (a criar, exportado pelo subcaminho neutro): `CAMPOS_DO_COMPLEMENTO` (mais detalhes, nova foto, ponto de referência, confirmar endereço; rótulos no catálogo) e limites da mensagem (10 a 600 caracteres), usados pelo painel e pelo app (F17-E11); a mensagem livre não é traduzida.
  - API: `POST /v1/triagem/relatos/:id/complemento` (`triar_relato`): grava a mensagem e os campos pedidos, transição `em_analise` para `aguardando_cidadao` e evento; 409 se já aguarda.
  - Frontend: "Mensagem ao cidadão" com prévia e `ConfirmarAcao`; a lista marca "respondeu"; `pedirComplementoDoRelato` nos dois modos (local sem cidadão: a semente traz um caso respondido).
- **O que NÃO deve ser implementado nesta etapa:** nota interna (E08); expiração (F16-E13); chat; push (F17-E13).
- **Arquivos e módulos prováveis:** `packages/shared/src/relato-complemento.ts` (a criar), `apps/web/src/paginas/Relato.tsx`, `apps/web/src/dados/http.ts`, `local.ts`.
- **Risco de segurança:** médio; a mensagem pública é lida por terceiro; campo próprio e confirmação.
- **Impacto LGPD:** sem dado de terceiro; aviso na tela; retenção em F16-E14.
- **Migração necessária:** Não.
- **Compatibilidade:** lista fechada e versionada.
- **Rollback:** reverter; relatos em `aguardando_cidadao` seguem.
- **Testes positivos:** pedido grava mensagem e campos e muda o estado; o app recebe a lista.
- **Testes negativos:** mensagem de 5 caracteres e campo fora da lista: 422; segundo pedido com um aberto: 409; relato `recebido`: 409.
- **Testes de autorização e isolamento:** operador sem a ação: 403; relato de outro município: 404.
- **Regressão obrigatória:** `npm test --workspace @dc360/web`, `npm run test:api`.
- **E2E:** `fluxo-api.e2e.mjs`: pedir complemento e ver o estado.
- **Validação humana:** Alyson redige um pedido real de exemplo; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G18/V2-F18-E04/`: capturas, `INDEX.md` e testes.
- **Documentação a atualizar:** `dc360/docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** pedido com mensagem pública e campos fechados, nos dois modos.
- **Checkpoint:** Não.

### V2-F18-E05 - Vincular a relato ou ocorrência existente (duplicidade)
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (mesmos arquivos de E03, E04 e E06)
- **Objetivo:** a triagem vincula o relato a outro relato ou a uma ocorrência e o encerra como `vinculado`, sem expor o outro registro ao cidadão.
- **Problema que resolve:** a duplicidade atual só olha o trecho do endereço, sem coordenada, sem relato e sem N para 1 (REL:07 11.7).
- **Origem:** DP:T21; ALY:OCO-04; REL:07 (11.7, DT-11).
- **Estado atual:** CRIAR; consome o sinal de F16-E07 e `relato_vinculos`.
- **Dependências de entrada:** E02.
- **O que deve ser implementado:**
  - API: `GET /v1/triagem/relatos/:id/semelhantes` (sinais de F16-E07 sobre relatos e ocorrências) e `POST /v1/triagem/relatos/:id/vincular` (`triar_relato`): grava `relato_vinculos`, resolução `vinculado`, estado `encerrado` e evento; destino do mesmo município, nunca o próprio relato, nem relato já `vinculado` (a resposta aponta o destino final), nem ocorrência `encerrada` (409; fato novo vai por E07).
  - Frontend: quadro "Possíveis duplicados" com candidatos lado a lado, escolha manual e `ConfirmarAcao`; mensagem pública fixa; `semelhantesDoRelato` e `vincularRelato` nos dois modos.
- **O que NÃO deve ser implementado nesta etapa:** decisão automática; mostrar o outro registro ao cidadão; fundir relatos; transferir entre municípios.
- **Arquivos e módulos prováveis:** `apps/web/src/paginas/Relato.tsx`, `apps/web/src/dados/http.ts`, `local.ts`, `apps/api/src/rotas/triagem-de-relatos.ts`.
- **Risco de segurança:** médio; vincular ao registro errado esconde urgência.
- **Impacto LGPD:** candidatos mostram só dado operacional; leitura registrada (E01).
- **Migração necessária:** Não.
- **Compatibilidade:** sem sinal de F16-E07 a tela oferece busca manual por protocolo.
- **Rollback:** reverter; corrigir o vínculo é evento novo.
- **Testes positivos:** vincular a ocorrência ativa encerra o relato como `vinculado` e cria o vínculo.
- **Testes negativos:** vincular a si mesmo, a relato já `vinculado` ou a ocorrência `encerrada`: 409; a mensagem pública não cita o destino.
- **Testes de autorização e isolamento:** operador sem a ação: 403; destino de outro município: 404.
- **Regressão obrigatória:** `npm test --workspace @dc360/web`, `npm run test:api`, `npm run test:isolamento`.
- **E2E:** `fluxo.e2e.mjs` (local): vincular dois relatos semeados.
- **Validação humana:** Alyson, com pares semeados; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G18/V2-F18-E05/`: capturas, `INDEX.md` e testes.
- **Documentação a atualizar:** `dc360/docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** vínculo manual N para 1 funcionando, sem exposição ao cidadão.
- **Checkpoint:** Não.

### V2-F18-E06 - Rejeitar com motivo e marcar fora da jurisdição
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (mesmos arquivos de E03 a E05)
- **Objetivo:** a triagem encerra o relato como `rejeitado` com motivo estruturado ou como `fora_da_jurisdicao`, com mensagem pública fixa.
- **Problema que resolve:** encerrar é texto livre de ocorrência (REL:07 fluxo 13); sem motivo estruturado nada orienta o cidadão.
- **Origem:** DP:T21; BZ-M:V2-CID-04; REL:07 (11.9).
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E02.
- **O que deve ser implementado:**
  - Domínio: `packages/shared/src/relato-resolucao.ts` (a criar): `MOTIVOS_DE_REJEICAO` fechados (informação insuficiente, fora do escopo da Defesa Civil, conteúdo impróprio, situação não confirmada), cada um com chave de frase pública no catálogo `cidadao.*` (pt-BR, en, es; nunca acusa o cidadão), e a frase de fora da jurisdição.
  - API: `POST /v1/triagem/relatos/:id/rejeitar` e `POST /v1/triagem/relatos/:id/fora-da-jurisdicao` (`triar_relato`): estado `encerrado`, resolução e evento; a justificativa livre vai só para a nota interna (E08); relato `encerrado` não reabre.
  - Frontend: botões com `ConfirmarAcao` ("Rejeitar relato" mais o protocolo), lista de motivos e "o cidadão verá: ..."; `rejeitarRelato` e `marcarRelatoForaDaJurisdicao` nos dois modos.
- **O que NÃO deve ser implementado nesta etapa:** bloqueio de conta (E09); decisão automática; reabrir relato; transferir ao município certo.
- **Arquivos e módulos prováveis:** `packages/shared/src/relato-resolucao.ts` (a criar), `apps/web/src/paginas/Relato.tsx`, `apps/web/src/dados/http.ts`, `local.ts`.
- **Risco de segurança:** médio; frase pública que acuse o cidadão ou revele critério interno.
- **Impacto LGPD:** a justificativa interna fica na nota; o cidadão lê só a frase fixa.
- **Migração necessária:** Não.
- **Compatibilidade:** lista versionada.
- **Rollback:** reverter; o relato encerrado permanece.
- **Testes positivos:** rejeitar grava motivo, resolução e evento; a frase pública sai pelo contrato de F16-E09.
- **Testes negativos:** motivo fora da lista: 422; rejeitar relato `encerrado`: 409; rejeitar não consome protocolo oficial.
- **Testes de autorização e isolamento:** operador sem a ação: 403; relato de outro município: 404.
- **Regressão obrigatória:** `npm test --workspace @dc360/web`, `npm test --workspace @dc360/shared`, `npm run test:api`.
- **E2E:** `fluxo.e2e.mjs` (local): rejeitar e marcar fora da jurisdição.
- **Validação humana:** Alyson lê as frases públicas; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G18/V2-F18-E06/`: capturas, `INDEX.md` e testes.
- **Documentação a atualizar:** `dc360/docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** duas formas de encerramento com motivo estruturado e frase pública fixa.
- **Checkpoint:** Não.

### V2-F18-E07 - Converter em ocorrência com descrição operacional escrita pela triagem
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (E11 e F19 dependem da conversão)
- **Objetivo:** a triagem converte o relato em ocorrência com descrição operacional escrita por ela; o protocolo oficial nasce só aqui.
- **Problema que resolve:** o relato é afirmação de terceiro; o texto bruto não pode ir ao aparelho nem à trilha (DP:T40).
- **Origem:** DP:T40; DP:T21; BZ-M:V2-CID-05; REL:07 11.2.
- **Estado atual:** EXPANDIR; chama F16-E10; MANTER `Ocorrencia.tsx`, `classificarNaTriagem` e o despacho.
- **Dependências de entrada:** E02 e F16-E10.
- **O que deve ser implementado:**
  - API: `POST /v1/triagem/relatos/:id/converter` (`triar_relato`) com `descricaoOperacional` obrigatória (20 a 1000 caracteres), endereço, ponto de referência e `chaveDeCriacao`; chama F16-E10 numa transação: ocorrência `registrada`, canal definido pelo sistema, resolução `convertido`, protocolo oficial na sequência existente; `FOR UPDATE` no relato; exige tipo classificado (E03).
  - Frontend: diálogo com o texto do cidadão ao lado e a descrição vazia; avisos, sem bloqueio, se o texto for igual ao do cidadão ou parecer telefone, e-mail ou CPF (`avisosDaDescricao`); depois abre `/ocorrencias/:id`; `converterRelato` nos dois modos.
- **O que NÃO deve ser implementado nesta etapa:** despacho; severidade; contato, CPF e coordenada ao agente (F19); foto e vídeo do cidadão na ocorrência.
- **Arquivos e módulos prováveis:** `apps/web/src/paginas/Relato.tsx`, `triagem-regras.ts`, `apps/web/src/dados/http.ts`, `local.ts`, `apps/api/src/rotas/triagem-de-relatos.ts`.
- **Risco de segurança:** alto; texto bruto chegaria ao aparelho; protocolo consumido duas vezes.
- **Impacto LGPD:** o texto livre do cidadão fica fora da trilha e da ocorrência (migrações 029 e 043).
- **Migração necessária:** Não.
- **Compatibilidade:** `NovaOcorrencia.tsx` não oferece o canal do app.
- **Rollback:** encerrar a ocorrência com motivo.
- **Testes positivos:** cria ocorrência `registrada` com protocolo oficial e a descrição da triagem.
- **Testes negativos:** sem `descricaoOperacional`: 422; sem tipo classificado, `encerrado` ou já convertido: 409; duas conversões simultâneas consomem um protocolo.
- **Testes de autorização e isolamento:** operador sem a ação: 403; outro município: 404.
- **Regressão obrigatória:** `npm test --workspace @dc360/web`, `npm run test:api`, `npm run conferir:numeros`.
- **E2E:** `fluxo.e2e.mjs` e `fluxo-api.e2e.mjs`: converter e abrir a ocorrência.
- **Validação humana:** Rafael e Alyson; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G18/V2-F18-E07/`: testes, capturas e `INDEX.md`.
- **Documentação a atualizar:** `dc360/docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** conversão idempotente, com protocolo oficial único.
- **Checkpoint:** Não.

### V2-F18-E08 - Nota interna e mensagem ao cidadão em campos separados
- **Prioridade:** P0
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** não (mesmos arquivos de E04 a E07)
- **Objetivo:** tela e API separam a nota interna (só a equipe) da mensagem ao cidadão, sem caminho de uma para a outra.
- **Problema que resolve:** a leitura devolve tudo (REL:07 11.5); um campo único faria a nota virar mensagem.
- **Origem:** DP:T21; BZ-M:V2-CID-06; REL:07 (11.5).
- **Estado atual:** CRIAR; consome `relato_notas_internas` e a mensagem pública de F16-E08.
- **Dependências de entrada:** E04.
- **O que deve ser implementado:**
  - Autorização: ação `anotar_relato` em `permissoes.ts` (coordenador e administrador; operador só se CP-28 definir), com `ROTULO_ACAO` e teste de permissões.
  - API: `POST /v1/triagem/relatos/:id/notas` (só nota) e a mensagem pela rota de F16-E08; esquemas `.strict()`: campo da outra rota é 422.
  - Frontend: dois blocos em `Relato.tsx`: "Nota interna (só a equipe vê)" e "Mensagem ao cidadão (ele vai ler)", com rótulo, ícone e texto distintos (nunca só cor), botões "Guardar nota interna" e "Enviar mensagem ao cidadão" e prévia; `anotarRelato` nos dois modos.
- **O que NÃO deve ser implementado nesta etapa:** nota visível ao cidadão; edição ou apagamento de nota (correção é nota nova).
- **Arquivos e módulos prováveis:** `packages/shared/src/permissoes.ts`, `apps/web/src/paginas/Relato.tsx`, `src/dados/http.ts`, `local.ts`.
- **Risco de segurança:** alto; nota interna chegar ao cidadão.
- **Impacto LGPD:** a nota pode ter dado sensível: só a equipe lê; retenção F16-E14.
- **Migração necessária:** Não.
- **Compatibilidade:** papéis atuais sem mudança.
- **Rollback:** reverter; notas ficam.
- **Testes positivos:** nota grava só em `relato_notas_internas`; mensagem grava só como pública.
- **Testes negativos:** corpo da nota com `mensagemPublica`: 422; nota sentinela nunca na leitura do cidadão (F16-E09); `UPDATE` em nota: negado.
- **Testes de autorização e isolamento:** operador sem `anotar_relato`: 403; coordenador de B lê nota de A: 404; agente: 403.
- **Regressão obrigatória:** `npm test --workspace @dc360/web`, `npm run test:api`, `npm run test:isolamento`.
- **E2E:** `fluxo-api.e2e.mjs`: nota e mensagem no mesmo relato; o cliente do cidadão lê só a mensagem.
- **Validação humana:** Alyson; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G18/V2-F18-E08/`: capturas, `INDEX.md` e testes.
- **Documentação a atualizar:** `dc360/docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** dois campos e duas rotas, sem caminho da nota ao cidadão.
- **Checkpoint:** Não.

### V2-F18-E09 - Bloqueio de conta e moderação
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** não (mesmos arquivos de E05 a E08)
- **Objetivo:** a triagem bloqueia conta abusiva e remove conteúdo impróprio, com motivo estruturado, efeito imediato e registro append-only.
- **Problema que resolve:** trote, abuso e conteúdo ilícito caem numa fila humana e não há moderação com registro (REL:07 11.9).
- **Origem:** DP:J11; DP:T22; REL:07 (11.9).
- **Estado atual:** CRIAR; consome o bloqueio de F15-E11 e a remoção com motivo de F06-E13.
- **Dependências de entrada:** F15-E11.
- **O que deve ser implementado:**
  - API: usa as rotas de F15-E11 (bloqueio por referência ao relato: a triagem nunca recebe `cidadao_id` nem e-mail) e de F06-E13 (remoção de anexo); motivos fechados (`trote_confirmado`, `conteudo_ilicito`, `abuso_de_envio`, `outro` com nota interna); efeito imediato pela vigência (T09); desbloquear é evento novo.
  - Frontend: bloco "Moderação" em `Relato.tsx` com "Bloquear conta" (`ConfirmarAcao` e motivo), "Remover foto" ou vídeo (F34-E10) por anexo e histórico; `bloquearContaDoRelato` e `removerAnexoDoRelato` em `http.ts`; `local.ts` recusa com explicação.
- **O que NÃO deve ser implementado nesta etapa:** bloqueio por heurística; termos e consequência (CP-26); banimento de aparelho.
- **Arquivos e módulos prováveis:** `apps/web/src/paginas/Relato.tsx`, `apps/web/src/dados/http.ts`, `local.ts`, `apps/api/src/rotas/triagem-de-relatos.ts`.
- **Risco de segurança:** alto; bloqueio indevido ou sem efeito imediato.
- **Impacto LGPD:** o registro guarda códigos, não o texto do cidadão.
- **Migração necessária:** Não.
- **Compatibilidade:** só consome rotas de F15-E11 e F06-E13.
- **Rollback:** desbloquear é evento novo.
- **Testes positivos:** bloquear revoga as sessões e a próxima escrita falha; remover foto tira o anexo de circulação.
- **Testes negativos:** motivo `outro` sem nota e bloqueio sem motivo: 422; remover anexo de outro município: 404.
- **Testes de autorização e isolamento:** operador sem a ação: 403; coordenador de B a partir de relato de A: 404.
- **Regressão obrigatória:** `npm test --workspace @dc360/web`, `npm run test:api`, `npm run test:isolamento`.
- **E2E:** `fluxo-api.e2e.mjs`: bloquear e ver a recusa no cliente do cidadão.
- **Validação humana:** Alyson e o jurídico; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G18/V2-F18-E09/`: testes, capturas e `INDEX.md`.
- **Documentação a atualizar:** `dc360/docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** bloqueio e remoção com motivo e histórico.
- **Checkpoint:** CP-26 (decide termos, consequência e prazo de guarda; bloqueia a abertura pública; o mecanismo anda em HML).

### V2-F18-E10 - Acessibilidade, idiomas e estados da triagem
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (varre E01 a E09, E12, E13)
- **Objetivo:** as telas da triagem passam nos portões, com foco, estados, tema e idiomas corretos.
- **Problema que resolve:** telas novas nascem sem prova de acessibilidade (REL:11); F10-E10 e F10-E11 criaram o padrão.
- **Origem:** DP:T29; REL:11; PR:D-11; PR:D-12.
- **Estado atual:** EXPANDIR; aplica o padrão de F10-E10 e F10-E11.
- **Dependências de entrada:** E01, E03, E04, E05, E06, E07, E08 e E09.
- **O que deve ser implementado:**
  - Acessibilidade: foco no título ao trocar de relato; `aria-live` único; tabela com `caption` e `scope`; estado e prioridade em ícone e texto; foco devolvido ao botão após `ConfirmarAcao`; 320 px sem rolagem horizontal; `forced-colors`.
  - Frontend: estados vazio, carregando, erro e "sem permissão"; `ErrorBoundary` de F10-E10; Toast padrão.
  - Idiomas: nenhuma frase fixa em `Triagem.tsx` e `Relato.tsx`; chaves `triagem.*` completas em pt-BR, en e es (F08-E08); sem VLibras nestas rotas (F08-E12).
  - Testes: `apps/web/test/triagem-de-relatos.test.ts` (a criar); os portões `acessibilidade.test.ts`, `design-system.test.ts` e `portoes-de-componente.test.ts` varrem as telas.
- **O que NÃO deve ser implementado nesta etapa:** axe-core e leitor real (F23-E01, F23-E03); componente, token ou cor nova; idioma por usuário (F35).
- **Arquivos e módulos prováveis:** `apps/web/src/paginas/Triagem.tsx`, `Relato.tsx`, `apps/web/test/triagem-de-relatos.test.ts` (a criar), `apps/web/test/acessibilidade.test.ts`.
- **Risco de segurança:** Não se aplica: sem rota nem dado novo.
- **Impacto LGPD:** Não se aplica: sem dado novo.
- **Migração necessária:** Não.
- **Compatibilidade:** só atributos e estados.
- **Rollback:** reverter.
- **Testes positivos:** os três portões passam; foco no título ao abrir o relato.
- **Testes negativos:** botão só com ícone, estado só por cor, tabela sem `caption`, frase fixa ou VLibras na rota reprova o portão.
- **Testes de autorização e isolamento:** agente abre `/triagem` pela URL: aviso de perfil, sem formulário.
- **Regressão obrigatória:** `npm test --workspace @dc360/web`, `npm run test:e2e`, `typecheck`.
- **E2E:** `fluxo.e2e.mjs`: caixa, relato e erro de rede, nos dois temas e três idiomas.
- **Validação humana:** Rafael navega a caixa só por teclado; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G18/V2-F18-E10/`: portões, capturas e `INDEX.md`.
- **Documentação a atualizar:** `dc360/docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** portões verdes; estados e foco testados nos dois modos.
- **Checkpoint:** Não.

### V2-F18-E11 - E2E dos fluxos F e G
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (fecha a fase depois de E07 e do app)
- **Objetivo:** provar o fluxo F (cidadão, relato, complemento, triagem) e o G (cidadão, relato, ocorrência) de ponta a ponta, com protocolo oficial consumido uma vez.
- **Problema que resolve:** nada prova que o relato vira ocorrência sem queimar protocolo nem entrar nas métricas (REL:07 11.2).
- **Origem:** PR:Fluxos; DP:T21; BZ-F:P0-INT; PR:D-07.
- **Estado atual:** CRIAR; EXPANDIR `fluxo-api.e2e.mjs` e `fluxo.e2e.mjs`.
- **Dependências de entrada:** E07 e F17-E12.
- **O que deve ser implementado:**
  - Testes: seção "triagem" em `apps/web/test/fluxo-api.e2e.mjs`: o cliente do cidadão em Node (`cliente-api` e `upload-core`) cria o relato com foto; o painel assume, classifica e pede complemento; o cliente responde; o painel converte; confere `GET /relatorios/resumo` antes e depois (relato não conta) e o próximo protocolo; seção local em `fluxo.e2e.mjs` com os relatos semeados.
  - Documentação: roteiro manual em HML com o build `beta-interno` (F17-E17).
- **O que NÃO deve ser implementado nesta etapa:** fluxo H (F19-E07); aparelho físico (F26-E02); carga (F24-E09); vídeo e chat (F34-E20).
- **Arquivos e módulos prováveis:** `apps/web/test/fluxo-api.e2e.mjs`, `apps/web/test/fluxo.e2e.mjs`, `dc360/scripts/e2e-api.mjs`.
- **Risco de segurança:** alto; falso verde que deixe protocolo ou métrica contaminados.
- **Impacto LGPD:** Não se aplica: só dados sintéticos.
- **Migração necessária:** Não.
- **Compatibilidade:** suítes atuais com as mesmas contagens.
- **Rollback:** reverter.
- **Testes positivos:** fluxos F e G completos; a ocorrência convertida abre no painel com protocolo oficial.
- **Testes negativos:** converter duas vezes consome um protocolo; relato rejeitado fora de `GET /relatorios/resumo`; relato em triagem fora da fila do agente; CPF sintético só mascarado na caixa e ausente da ocorrência.
- **Testes de autorização e isolamento:** coordenador de outro município não vê o relato; token do cidadão no painel: 401.
- **Regressão obrigatória:** `npm run test:e2e`, `test:e2e:api`, `test:api`, `conferir:numeros`.
- **E2E:** este é o E2E dos fluxos F e G.
- **Validação humana:** Rafael e Alyson, com o app de HML e o painel; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G18/V2-F18-E11/`: saída dos E2E, capturas e `INDEX.md`.
- **Documentação a atualizar:** `dc360/README.md` (contagens).
- **Definition of Done:** fluxos F e G verdes em HML, protocolo oficial único e métricas sem relato.
- **Checkpoint:** Não.

### V2-F18-E12 - Aviso de relato novo para a triagem (sino e painel)
- **Prioridade:** P1
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (mexe em `local.ts`, como E02 a E09)
- **Objetivo:** a triagem é avisada pelo sino de relato novo e de complemento recebido, sem conteúdo do relato.
- **Problema que resolve:** `avisos` exige `ocorrencia_id` e `avisos_tipo_check` é fechado (018, 031): relato novo não avisa ninguém.
- **Origem:** BZ-M:V2-CID-04; DP:T21; REL:07 gap 23.
- **Estado atual:** EXPANDIR `Sino.tsx`, `sino-regras.ts` e `rotas/avisos.ts`; MANTER o ciclo de 30 s.
- **Dependências de entrada:** V2-F18-E01.
- **O que deve ser implementado:**
  - Migration: `avisos.relato_id` (FK composta), `ocorrencia_id` nulo com CHECK de exatamente um, `avisos_tipo_check` repete os valores vigentes (F04-E11; ordem na F29) e ganha `relato_novo` e `complemento_recebido`; gatilhos em `relatos` e no evento de resposta do cidadão (F16-E04), só com `canal_cidadao_habilitado` (F15-E13); `detalhe` só com o tipo declarado.
  - API: `GET /avisos` junta o protocolo do relato e entrega os dois tipos só a quem tem `triar_relato`.
  - Frontend: `FRASES` em `sino-regras.ts`; o clique em `Sino.tsx` abre `/triagem/:id`; `local.ts` roda a mesma SQL e a semente traz os dois casos.
- **O que NÃO deve ser implementado nesta etapa:** push ao painel, e-mail e texto do relato no aviso; prazo do relato (DH-35).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `apps/api/src/rotas/avisos.ts`, `apps/web/src/componentes/Sino.tsx`, `sino-regras.ts`, `local.ts`.
- **Risco de segurança:** médio; conteúdo do relato num recurso consultado a cada 30 s.
- **Impacto LGPD:** o aviso guarda protocolo e tipo, nunca dado pessoal.
- **Migração necessária:** Sim (`NNN_avisos_de_relato.sql`, NNN próxima livre, hoje 047).
- **Compatibilidade:** avisos de ocorrência iguais.
- **Rollback:** migration inversa.
- **Testes positivos:** relato novo toca o sino uma vez e o complemento outra; o clique abre o relato.
- **Testes negativos:** mesma chave não duplica; canal desligado não emite; texto sentinela não vai ao aviso.
- **Testes de autorização e isolamento:** agente e operador sem `triar_relato` não recebem; município B não vê.
- **Regressão obrigatória:** `npm run test:api` (`sino-de-avisos.test.ts`), `npm test --workspace @dc360/web` (`sino.test.ts`).
- **E2E:** `fluxo-api.e2e.mjs` e `fluxo.e2e.mjs`: relato novo toca o sino.
- **Validação humana:** Alyson; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G18/V2-F18-E12/`: testes, capturas e `INDEX.md`.
- **Documentação a atualizar:** `dc360/docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** relato novo e complemento avisam só a triagem, sem conteúdo.
- **Checkpoint:** Não.

### V2-F18-E13 - CPF do solicitante na triagem: máscara e revelação com finalidade
- **Prioridade:** P0
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** sim (com E12: arquivos disjuntos)
- **Objetivo:** a triagem vê o CPF do relato mascarado e só o revela com finalidade escrita, registrada.
- **Problema que resolve:** D-07 torna o CPF obrigatório; a F05-E14 cria a revelação e deixa a tela para esta fase.
- **Origem:** PR:D-07; DP:J4; REL:08 15.7.
- **Estado atual:** CRIAR; consome `POST /v1/cpf/revelar` e `mascararCpf` (F05-E13, F05-E14).
- **Dependências de entrada:** E01; F05-E14; F16-E05; CP-46 para CPF real.
- **O que deve ser implementado:**
  - API: o detalhe devolve `cpfMascarado`, nunca o valor; a revelação usa a rota da F05-E14 (ação `ver_cpf`).
  - Frontend: bloco "CPF do solicitante" em `Relato.tsx`: máscara e "Ver CPF completo", que abre diálogo com o campo "Para que você precisa do CPF (mínimo 20 caracteres)" e `ConfirmarAcao`; o valor aparece uma vez, sem copiar, e some ao trocar de relato; textos de `triagem.*`.
  - Frontend: `local.ts` mostra só a máscara semeada e recusa revelar, com explicação.
- **O que NÃO deve ser implementado nesta etapa:** CPF na lista, em lote ou em exportação; busca por CPF; CPF na ocorrência (F19).
- **Arquivos e módulos prováveis:** `apps/web/src/paginas/Relato.tsx`, `src/dados/http.ts`, `local.ts`, `apps/api/src/rotas/triagem-de-relatos.ts`.
- **Risco de segurança:** alto; só a máscara vai ao cliente até a revelação.
- **Impacto LGPD:** cada revelação grava usuário, alvo e finalidade (F05-E14).
- **Migração necessária:** Não.
- **Compatibilidade:** só rota e tela novas.
- **Rollback:** esconder o bloco.
- **Testes positivos:** o detalhe traz só a máscara; revelar com finalidade grava uma linha.
- **Testes negativos:** finalidade de 10 caracteres: 422; CPF completo ausente do detalhe e do DOM antes da revelação.
- **Testes de autorização e isolamento:** operador revela: 403; coordenador de B revela CPF de relato de A: 404.
- **Regressão obrigatória:** `npm test --workspace @dc360/web`, `npm run test:api`, `npm run test:isolamento`.
- **E2E:** `fluxo-api.e2e.mjs`: revelar e conferir o registro; `fluxo.e2e.mjs` (local): máscara; capturas.
- **Validação humana:** Alyson revela um CPF sintético; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G18/V2-F18-E13/`: testes, capturas e `INDEX.md`.
- **Documentação a atualizar:** `dc360/docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** máscara por padrão, revelação só com finalidade registrada.
- **Checkpoint:** CP-46 (quem revela e finalidade; bloqueia CPF real).

# GATE G18 - TRIAGEM NO PAINEL
Só passa se:
- [ ] V2-F18-E01 (P0): a caixa lista, filtra e abre o relato nos dois modos; cada abertura grava `relato_consultas`; a lista não traz texto, contato nem CPF do cidadão; o detalhe é montado por blocos registrados, prontos para o vídeo e a conversa da F34-E09. Evidência: E01.
- [ ] V2-F18-E02 (P0): assumir resolve a corrida no banco (um 200 e um 409) e grava o evento. Evidência: E02.
- [ ] V2-F18-E03: tipo e prioridade classificados sem sobrescrever o declarado; prioridade ausente da leitura do cidadão. Evidência: E03.
- [ ] V2-F18-E04 (P0): pedido de complemento com mensagem pública e campos fechados; o app lê o pedido. Evidência: E04.
- [ ] V2-F18-E05: vínculo manual a relato ou ocorrência, sem exposição ao cidadão, recusando ocorrência `encerrada`. Evidência: E05.
- [ ] V2-F18-E06 (P0): rejeição com motivo estruturado e fora da jurisdição, com frase pública fixa que não acusa o cidadão. Evidência: E06.
- [ ] V2-F18-E07 (P0): conversão com descrição operacional da triagem e protocolo oficial único; duas conversões simultâneas consomem um protocolo. Evidência: E07.
- [ ] V2-F18-E08 (P0): nota interna e mensagem ao cidadão em campos e rotas separados; nota sentinela nunca aparece na leitura do cidadão. Evidência: E08.
- [ ] V2-F18-E09 e CP-26: bloqueio e remoção com motivo, efeito imediato e histórico; CP-26 decidido ou adiado por escrito com a abertura pública bloqueada. Evidência: E09.
- [ ] V2-F18-E10: portões do painel verdes nas telas novas, com foco, anúncio e estados, e nenhuma frase fixa (chaves `triagem.*` completas em pt-BR, en e es); sem VLibras nas rotas de triagem. Evidência: E10.
- [ ] V2-F18-E11 (P0): fluxos F e G verdes em HML, com métricas oficiais sem relato. Evidência: E11.
- [ ] Os dois modos em paridade: `paridade-dos-modos.test.ts` sem exceção nova sem motivo; `npm run test:e2e` e `npm run test:e2e:api` verdes. Evidência: saída dos dois.
- [ ] `npm run test:isolamento`, `npm run test:api`, `npm run test:scripts`, `npm run test:cidadao`, `npm run typecheck` e `npm run conferir:numeros` verdes. Evidência: saída arquivada.
- [ ] V2-F18-E13 (P0) e CP-46: o CPF do relato aparece só mascarado; revelar exige a ação `ver_cpf` e finalidade escrita e grava o acesso; CPF completo ausente de lista, detalhe e DOM antes da revelação; CP-46 decidido ou adiado por escrito com CPF real bloqueado. Evidência: E13.
- [ ] V2-F18-E12: relato novo e complemento recebido tocam o sino só de quem tem `triar_relato`, uma vez por fato, só com o canal habilitado e sem texto do relato, nos dois modos. Evidência: E12.
- [ ] Portão visual: toda etapa de tela (E01 a E10, E12, E13) tem capturas em 320, 768 e 1280 px, claro e escuro, nos estados normal, vazio, erro e carregando, com o checklist da seção 0 de `19-definicao-de-pronto.md` preenchido e o portão da F08-E13 verde; Rafael aprovou as capturas. Evidência: `capturas/` e `INDEX.md` de cada etapa.
- [ ] nenhuma regressão: todos os gates anteriores na ordem de execução continuam verdes (se um quebrar, ESTE gate volta a REPROVADO).
- [ ] documentação atualizada e evidências arquivadas em `docs/evidencias-v2/G18/`.

**Reabre se:** o sino passar a levar texto do relato; o CPF completo chegar à lista, ao detalhe sem revelação registrada, à ocorrência ou a log; texto fixo fora do catálogo de idiomas; relato aparecer em métrica, laudo ou protocolo oficial; nota interna, equipe, severidade ou ID interno chegarem ao cidadão; a conversão consumir protocolo duas vezes ou gravar o texto bruto do cidadão na ocorrência; qualquer decisão da triagem virar automática; os dois modos divergirem.
**Este Gate libera:** a F34 (junto de G17: vídeo e chat do relato) e a F19 (junto de G17, G34 e G14: o relato convertido pode descer ao aparelho pela lista de inclusão), e o beta externo no que depende da triagem; este gate sozinho NÃO libera beta externo (CP-11, CP-26, CP-28, G25 e CP-33).

# Fase 19: Integração cidadão, ocorrência e campo

**Gate da fase:** G19 CIDADÃO ATÉ O CAMPO | **Depende dos gates:** G16, G18, G34, G14 (cumulativo: todos os anteriores na ordem de execução de `STATUS.md`, seção 5, que põe a F34 entre a F18 e esta fase) | **Superfícies tocadas:** `apps/api` (rotas de campo, ocorrência e evidência), `apps/campo` (exibição), `apps/cidadao` e `apps/web` (só E03), `db` (duas migrations) | **Checkpoints da fase:** CP-09, CP-46

Esta fase fecha o caminho do relato até o agente, e só depois da conversão: o relato em triagem NÃO vai ao aparelho. Descem, por LISTA DE INCLUSÃO: classificação operacional, endereço e ponto de referência, coordenada marcada como "declarada pelo cidadão" e a descrição operacional escrita ou confirmada pela triagem. NÃO descem, em nenhuma rota do agente: nome, CPF (completo, mascarado, hash ou cifrado), VÍDEO e fotos brutas do cidadão (ficam no painel), MENSAGENS do chat por relato (D-07: o canal ampliado é da F34, que não alimenta o aparelho), vulnerabilidade além do que a triagem decidiu e notas internas. O contato só desce se o cidadão marcou "posso ser contatado por agentes" e a triagem confirmou (J6, CP-09).

Hoje a lista de tarefas leva nome, contato e vulnerabilidade em claro (`GET /campo/meu-trabalho` e `GET /sincronizacao/pendencias`, REL:08 15.2.3), por escolha de campo registrada em `apps/api/src/privacidade/consulta.ts`. Preserva (MANTER): `recorteDoAgente` (a equipe vem do cadastro), o motor offline `packages/campo`, a sincronização e o payload das ocorrências abertas pelo operador, que só muda se CP-09 decidir. NÃO faz: histórico da secretaria ao aparelho (F13-E05), criptografia local (F14-E04), canal agente x cidadão, foto, vídeo ou chat do cidadão no aparelho.

Texto e telas: o que o app do agente ganha (E06) e o que o app do cidadão ganha (E03) usa o catálogo de idiomas da F08 (pt-BR, en e es; F08-E08), sem frase fixa. Toda etapa de tela passa pelo portão visual de `19-definicao-de-pronto.md`, seção 0 (nada desalinhado, grudado ou fora do lugar; texto bem escrito) e pelo portão da F08 (F08-E13), com foto do aparelho. A coordenada declarada tem duas colunas irmãs: a PRECISÃO (`coordenada_precisao_m`, criada na F10-E26) e a ORIGEM (`coordenada_origem`, E02).

Ordem: E01; E02 e E04 em paralelo (arquivos disjuntos); E03 (atrás de CP-09); E05 depois de E01, E02 e E04; E06; E07 fecha.

## Etapas

### V2-F19-E01 - Modelo de leitura do agente: lista de inclusão de campos do relato convertido
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** crítico  |  **Paralelizável:** não (E02 a E06 usam a projeção)
- **Objetivo:** o agente recebe de ocorrência nascida de relato só a lista de inclusão, em toda rota que o alcança.
- **Problema que resolve:** `meu-trabalho`, `pendencias` e o dossiê do agente (`SELECT o.*`) entregam nome, contato, vulnerabilidade e coluna nova (REL:08 15.2.3).
- **Origem:** DP:T40; DP:J6; BZ-F:P0-LGPD; REL:08 15.2.3; PR:D-07.
- **Estado atual:** EXPANDIR; só o dossiê não lista colunas.
- **Dependências de entrada:** G18; G34; CP-09.
- **O que deve ser implementado:**
  - API: `apps/api/src/privacidade/projecao-do-agente.ts` (a criar) com `COLUNAS_DO_AGENTE` (id, protocolo, tipo, severidade, endereço, ponto de referência, coordenada, descrição, prazo, status, vulnerabilidade só se a triagem a gravou) e `selecionarParaOAgente`, usada por `campo.ts`, `sincronizacao.ts` e pelo ramo `agente_campo` de `ocorrencias.ts`; em ocorrência com `relato_origem_id`, `solicitante_nome` sai como texto fixo, `solicitante_contato` nulo, o id do relato nunca sai e entra `origem`; CPF, vídeo e chat (colunas de F15-E16, F16-E12 e F34) ficam FORA da lista.
- **O que NÃO deve ser implementado nesta etapa:** coordenada marcada (E02); contato (E03); fotos (E04); mudar o payload do operador antes de CP-09.
- **Arquivos e módulos prováveis:** `apps/api/src/privacidade/projecao-do-agente.ts` e `apps/api/test/projecao-do-agente.test.ts` (a criar), `rotas/campo.ts`, `sincronizacao.ts`, `ocorrencias.ts`.
- **Risco de segurança:** crítico; dado do cidadão no SQLite do aparelho.
- **Impacto LGPD:** minimização por inclusão: sem nome, contato, CPF nem texto bruto.
- **Migração necessária:** Não.
- **Compatibilidade:** app instalado igual.
- **Rollback:** reverter.
- **Testes positivos:** o item convertido traz a lista e `origem`; o do operador mantém o payload.
- **Testes negativos:** sentinelas de nome, e-mail, CPF (claro e mascarado), chave de vídeo, mensagem de chat, texto bruto e `relato_origem_id` ausentes nas três rotas; coluna nova sem classificação reprova o catálogo.
- **Testes de autorização e isolamento:** agente de outra equipe: 404; outro município: 404.
- **Regressão obrigatória:** `npm run test:api` (`agente-so-ve-a-equipe.test.ts`, `teto-de-pendencias.test.ts`), `test:campo`.
- **E2E:** `campo-integracao.test.ts` verde; fluxo H em E07.
- **Validação humana:** Alyson e o DPO.
- **Evidência a produzir:** `docs/evidencias-v2/G19/V2-F19-E01/`: lista e saída dos testes.
- **Documentação a atualizar:** `docs/PRIVACIDADE.md`.
- **Definition of Done:** três rotas pela projeção; catálogo verde.
- **Checkpoint:** CP-09 (decide o que desce; sem decisão vale a lista conservadora de DP:T40 só em HML; bloqueia envio a agente em produção).

### V2-F19-E02 - Descrição operacional e coordenada declarada marcada
- **Prioridade:** P0
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** sim (com F19-E04: arquivos disjuntos)
- **Objetivo:** o agente lê a descrição operacional da triagem, nunca o texto bruto, e sabe que a coordenada foi declarada pelo cidadão.
- **Problema que resolve:** coordenada do cidadão é declaração sem prova (REL:07 10.2); sem marca o agente a trata como confirmada.
- **Origem:** DP:T40; REL:07 (10.2, 11.4); PR:D-20.
- **Estado atual:** EXPANDIR; `ocorrencias.latitude` não guarda a origem; `POST /ocorrencias/:id/coordenada` já corrige o ponto.
- **Dependências de entrada:** E01; V2-F10-E26 (cria `coordenada_precisao_m`); V2-F09-E02 e E04 (snapshot e versão do modelo).
- **O que deve ser implementado:**
  - Migration: `NNN_origem_da_coordenada.sql`: só `ocorrencias.coordenada_origem` (`registrada_na_abertura` padrão, `declarada_pelo_cidadao`, `corrigida_pela_coordenacao`) com CHECK e preenchimento das convertidas; a precisão não é recriada; manifesto.
  - API: a conversão de F16-E10 grava `declarada_pelo_cidadao` e copia a precisão do relato, se houver, para `coordenada_precisao_m`; `POST /ocorrencias/:id/coordenada` grava `corrigida_pela_coordenacao`; a projeção (E01) manda `coordenada_declarada` verdadeiro só no primeiro caso, com a precisão ao lado; o snapshot de F09-E02 ganha `ocorrencia.coordenadaOrigem` e `laudo.ts` imprime a etiqueta, com o modelo em nova versão (F09-E04).
- **O que NÃO deve ser implementado nesta etapa:** exibição no app e na minuta do aparelho (E06).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `apps/api/src/rotas/ocorrencias.ts`, `apps/api/src/privacidade/projecao-do-agente.ts`, `apps/api/test/coordenada-de-ocorrencia-aberta.test.ts`.
- **Risco de segurança:** alto; coordenada declarada tratada como prova; migration sobre tabela central.
- **Impacto LGPD:** a localização desce como endereço operacional, sem identidade.
- **Migração necessária:** Sim (`NNN_origem_da_coordenada.sql`, NNN próxima livre, hoje 047).
- **Compatibilidade:** padrão preserva as ocorrências existentes.
- **Rollback:** migration inversa.
- **Testes positivos:** convertida traz `coordenada_declarada` verdadeiro; após a correção da coordenação, falso.
- **Testes negativos:** valor fora da lista: recusado pelo CHECK; migration que recria `coordenada_precisao_m` reprova; relato sem descrição operacional não converte (F18-E07); texto bruto ausente da resposta do agente.
- **Testes de autorização e isolamento:** corrigir sem `abrir_ocorrencia`: 403; ocorrência de outro município: 404.
- **Regressão obrigatória:** `npm run test:isolamento`, `test:api` (`coordenada-de-ocorrencia-aberta.test.ts`), `test:campo`.
- **E2E:** corrigir a coordenada no painel e ver a marca sumir no payload.
- **Validação humana:** Alyson corrige uma coordenada declarada.
- **Evidência a produzir:** `docs/evidencias-v2/G19/V2-F19-E02/`: testes e payload.
- **Documentação a atualizar:** `docs/DICIONARIO-DE-DADOS.md`.
- **Definition of Done:** origem gravada, corrigida e entregue ao agente com a precisão.
- **Checkpoint:** Não.

### V2-F19-E03 - Contato só com flag e decisão J6
- **Prioridade:** P1
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** não (toca app, painel e API da conversão)
- **Objetivo:** o contato do cidadão só chega ao agente se ele marcou "posso ser contatado por agentes" e a triagem confirmou na conversão.
- **Problema que resolve:** `solicitante_contato` desce hoje a toda tarefa (REL:08 15.2.3); o relato não herda isso sem consentimento.
- **Origem:** DP:J6; DP:T40; BZ-F:P0-LGPD; PR:D-07.
- **Estado atual:** CRIAR; usa a projeção de E01.
- **Dependências de entrada:** E01; CP-09.
- **O que deve ser implementado:**
  - Migration: `NNN_contato_para_agente.sql`: `relatos.aceita_contato_de_agente` (falso) e `contato_para_agente`, com CHECK (contato exige o aceite); `ocorrencias.contato_liberado_ao_agente` (falso).
  - API: a conversão aceita `liberarContatoAoAgente`, válido só se o cidadão aceitou; copia o contato para `solicitante_contato`; a projeção só o envia com a liberação.
  - Mobile: caixa desmarcada e campo de telefone (`telefone.ts` do neutro) na revisão do app, por `extra.contatoParaAgente` do build (falso até CP-09); textos do catálogo `cidadao.*`.
  - Frontend: caixa "Liberar o contato ao agente" no diálogo de conversão, habilitada só se o cidadão aceitou.
- **O que NÃO deve ser implementado nesta etapa:** e-mail da conta, CPF ou chat ao agente.
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `apps/api/src/privacidade/projecao-do-agente.ts`, `apps/web/src/paginas/Relato.tsx`, `apps/cidadao/.../revisao.tsx`.
- **Risco de segurança:** alto; contato liberado sem consentimento ou sem confirmação.
- **Impacto LGPD:** consentimento por relato; texto da caixa em CP-09.
- **Migração necessária:** Sim (`NNN_contato_para_agente.sql`, NNN próxima livre, hoje 047).
- **Compatibilidade:** padrão falso.
- **Rollback:** desligar `extra.contatoParaAgente`.
- **Testes positivos:** aceite mais liberação enviam o contato ao agente.
- **Testes negativos:** liberação sem aceite do cidadão: 422; aceite sem liberação: contato ausente; e-mail da conta sentinela ausente.
- **Testes de autorização e isolamento:** operador sem a ação não libera: 403; outro município: 404.
- **Regressão obrigatória:** `npm run test:api`, `test:isolamento`, `test:cidadao`.
- **E2E:** fluxo com e sem liberação em `fluxo-api.e2e.mjs`, com capturas.
- **Validação humana:** Alyson e o DPO; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G19/V2-F19-E03/`: testes, capturas e `INDEX.md`.
- **Documentação a atualizar:** `docs/PRIVACIDADE.md`.
- **Definition of Done:** contato só com aceite e liberação.
- **Checkpoint:** CP-09 (decide se e como o contato desce; bloqueia ligar a opção em produção).

### V2-F19-E04 - Fotos, vídeo e conversa do cidadão não descem; ficam no painel
- **Prioridade:** P0
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** sim (com F19-E02: arquivos disjuntos)
- **Objetivo:** nenhuma foto, vídeo ou mensagem de chat do cidadão chega ao aparelho do agente, nem como anexo nem como evidência promovida.
- **Problema que resolve:** `GET /evidencias/ocorrencia/:id` lista evidência ao agente da equipe; a foto promovida (F06-E12) entraria na lista; o aparelho guarda mídia sem criptografia (REL:03).
- **Origem:** DP:T40; DP:T23; BZ-F:P0-INT; PR:D-07.
- **Estado atual:** EXPANDIR `evidencias.ts` (`GET /ocorrencia/:id`, `GET /:id/url`) e a regra de leitura de arquivos.
- **Dependências de entrada:** E01.
- **O que deve ser implementado:**
  - API: para `agente_campo`, a lista e a URL de evidência excluem `origem_anexo_id` preenchido (F06-E12); a leitura de `arquivos` das classes `anexo_cidadao` e `video_cidadao` (F06-E18 a E20) é negada ao agente (404) no manifesto rota x ação e em `arquivo_servivel`; as rotas de vídeo e de chat da F34-E04 a E07 respondem 404 ao agente.
  - Autorização: o agente só lê arquivo da classe de evidência de campo da própria equipe.
- **O que NÃO deve ser implementado nesta etapa:** promoção de foto (F06-E12); foto ou vídeo do cidadão em laudo; miniatura no app.
- **Arquivos e módulos prováveis:** `apps/api/src/rotas/evidencias.ts`, `apps/api/src/rotas/arquivos.ts` (F06-E04), `apps/api/test/evidencias.test.ts`.
- **Risco de segurança:** alto; foto de terceiro em aparelho de plantão.
- **Impacto LGPD:** mídia só no painel, com consulta registrada.
- **Migração necessária:** Não.
- **Compatibilidade:** evidência do agente igual.
- **Rollback:** reverter o commit.
- **Testes positivos:** o agente lista só as próprias evidências da ocorrência convertida.
- **Testes negativos:** foto promovida ausente da lista do agente; URL de foto ou vídeo de relato com token de agente: 404; mensagem de chat sentinela ausente de toda resposta.
- **Testes de autorização e isolamento:** coordenador lê a foto promovida; agente de outra equipe: 404; outro município: 404.
- **Regressão obrigatória:** `npm run test:api` (`evidencias.test.ts`, `prova-fotografica.test.ts`), `npm run test:isolamento`.
- **E2E:** parte de E07 (payload e lista de evidências do agente).
- **Validação humana:** Rafael abre a ocorrência convertida no app do agente e confere que não há foto nem vídeo do cidadão.
- **Evidência a produzir:** `docs/evidencias-v2/G19/V2-F19-E04/`: testes e capturas.
- **Documentação a atualizar:** `docs/ARMAZENAMENTO.md`, `docs/SEGURANCA-DO-AGENTE.md`.
- **Definition of Done:** nenhuma rota do agente entrega foto, vídeo ou chat do cidadão.
- **Checkpoint:** Não.

### V2-F19-E05 - Testes negativos no payload do agente
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** crítico  |  **Paralelizável:** não (depende de E01, E02 e E04)
- **Objetivo:** provar por teste que nome, contato, CPF, fotos, vídeo, mensagens do chat, vulnerabilidade declarada e notas do relato não chegam ao agente em nenhuma rota que ele alcança.
- **Problema que resolve:** `agente-so-ve-a-equipe.test.ts` cobre o recorte por equipe, não o conteúdo (REL:07 DT-07).
- **Origem:** DP:T40; PR:Fluxos; BZ-F:P0-SEG; PR:D-07.
- **Estado atual:** CRIAR, no molde de `apps/api/test/agente-so-ve-a-equipe.test.ts`.
- **Dependências de entrada:** E01, E02 e E04; G34.
- **O que deve ser implementado:**
  - Testes: `apps/api/test/agente-nao-recebe-dado-do-relato.test.ts` (a criar): relato com sentinelas (e-mail, CPF claro e mascarado, texto bruto, contato, vulnerabilidade declarada, nota interna, mensagem pública, chave de foto e de vídeo, mensagem de chat) convertido, classificado e despachado à Equipe Alfa; com o token do Diego chama `/campo/meu-trabalho`, `/sincronizacao/pendencias`, `/ocorrencias`, `/ocorrencias/:id`, `/ocorrencias/mapa`, `/evidencias/ocorrencia/:id`, `/busca` e `/avisos` e as rotas de vídeo e de chat da F34; nenhuma resposta contém sentinela, `relato_origem_id` nem `cidadao_id`; as chaves do item são subconjunto da lista de E01 mais `origem` e `coordenada_declarada`.
  - Testes: fixture `apps/campo/src/__tests__/fixtures/pendencia-de-relato.json` (a criar), comparada às chaves reais.
- **O que NÃO deve ser implementado nesta etapa:** correção de vazamento (E01 a E04); fluxo completo (E07).
- **Arquivos e módulos prováveis:** `apps/api/test/agente-nao-recebe-dado-do-relato.test.ts` (a criar), `apps/campo/src/__tests__/fixtures/` (a criar).
- **Risco de segurança:** crítico; falso verde por rota esquecida na lista de chamadas.
- **Impacto LGPD:** Não se aplica: dados sintéticos.
- **Migração necessária:** Não.
- **Compatibilidade:** testes novos.
- **Rollback:** reverter.
- **Testes positivos:** o item traz os campos operacionais, `origem` e a descrição da triagem.
- **Testes negativos:** cada sentinela ausente em cada rota; coluna nova reprova o catálogo de E01.
- **Testes de autorização e isolamento:** token do agente em `GET /v1/triagem/relatos`: 403; em foto de relato: 404; agente de outra equipe: lista vazia.
- **Regressão obrigatória:** `npm run test:api`, `test:isolamento`, `test:campo`, `typecheck`.
- **E2E:** este teste é o portão do fluxo H na API.
- **Validação humana:** Rafael lê rotas e sentinelas.
- **Evidência a produzir:** `docs/evidencias-v2/G19/V2-F19-E05/`: saída do teste e a fixture.
- **Documentação a atualizar:** `apps/api/PENDENCIAS.md`.
- **Definition of Done:** oito rotas e as da F34 varridas por sentinelas; fixture igual ao payload real.
- **Checkpoint:** Não.

### V2-F19-E06 - Campo: exibir origem relato com coordenada declarada
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (mexe em `api.ts`, lista e vistoria)
- **Objetivo:** o agente vê que a tarefa nasceu de relato do cidadão e que a coordenada é declarada, ainda não confirmada.
- **Problema que resolve:** o app trata `latitude` como ponto confirmado (`vistoria/[id].tsx`, `abrirRota` diz "a coordenada da ocorrência").
- **Origem:** DP:T40; REL:07 (10.2); PR:D-12.
- **Estado atual:** EXPANDIR `Pendencia` (`apps/campo/src/dados/api.ts`), `(agente)/index.tsx` e `vistoria/[id].tsx`; MANTER o motor offline.
- **Dependências de entrada:** E01 e G14.
- **O que deve ser implementado:**
  - Mobile: `Pendencia` ganha `origem` e `coordenada_declarada` opcionais; `DadosMinuta` leva `coordenadaDeclarada` e `montarMinuta` etiqueta a linha "Coordenada" quando o agente não capturou o GPS; `pendencias.ts` guarda; o cartão mostra o selo "Relato do cidadão" em ícone e texto; a tela de vistoria diz "Coordenada informada pelo cidadão, ainda não confirmada" e os avisos de rota e cópia dizem o mesmo; a legenda do mapa nomeia o ponto declarado; o GPS capturado pelo agente continua sendo a prova.
  - Acessibilidade e texto: selo e aviso com rótulo para VoiceOver e TalkBack; frases novas no catálogo da F08-E08 (pt-BR, en e es).
- **O que NÃO deve ser implementado nesta etapa:** contato (E03); foto; texto do laudo (E02).
- **Arquivos e módulos prováveis:** `apps/campo/src/dados/api.ts`, `pendencias.ts`, `apps/campo/src/app/(agente)/index.tsx`, `vistoria/[id].tsx`, `apps/campo/src/__tests__/relato-convertido-na-tarefa.test.tsx` (a criar).
- **Risco de segurança:** médio; agente tratar coordenada declarada como confirmada.
- **Impacto LGPD:** Não se aplica: sem dado novo.
- **Migração necessária:** Não.
- **Compatibilidade:** campos opcionais.
- **Rollback:** reverter.
- **Testes positivos:** tarefa de relato mostra selo e aviso; a fixture de E05 renderiza.
- **Testes negativos:** payload sem os campos novos renderiza como hoje; a legenda do mapa não afirma "confirmado" (`mapa-a-legenda-nao-mente.test.tsx`).
- **Testes de autorização e isolamento:** Não se aplica: sem rota nova; o isolamento é do payload (E05).
- **Regressão obrigatória:** `npm run test:campo`, `test:scripts` (portões do app), `typecheck`.
- **E2E:** parte de E07, com fotos do aparelho.
- **Validação humana:** Rafael com um agente de teste, num aparelho; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13, com foto do aparelho.
- **Evidência a produzir:** `docs/evidencias-v2/G19/V2-F19-E06/`: capturas, `INDEX.md` e testes.
- **Documentação a atualizar:** `apps/campo/LEIA-ME.md`, `docs/CARTAO-DO-AGENTE.md`.
- **Definition of Done:** origem e coordenada declarada visíveis, acessíveis e testadas.
- **Checkpoint:** Não.

### V2-F19-E07 - E2E do fluxo H (relato convertido para o agente)
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (fecha a fase)
- **Objetivo:** provar o fluxo H do relato ao agente e de volta ao andamento do cidadão, com dados sintéticos em HML.
- **Problema que resolve:** só o ciclo mostra que relato, conversão, despacho, tarefa e vistoria se encontram sem vazar dado (PR:Fluxos).
- **Origem:** PR:Fluxos; DP:T40; REL:07; PR:D-07.
- **Estado atual:** CRIAR; reutiliza o molde de `campo-integracao.test.ts`.
- **Dependências de entrada:** E05 e E06.
- **O que deve ser implementado:**
  - Testes: `apps/api/test/fluxo-h-relato-ate-o-agente.test.ts` (a criar): o cliente do cidadão (`cliente-api`, `upload-core`) cria o relato com CPF sintético, foto, vídeo e mensagem de chat (F34-E04, E06); staff classifica e converte; despacho à Equipe Alfa; o agente sincroniza `pendencias`, o payload bate com a fixture; a vistoria sobe pela fila de `packages/campo`; o cidadão lê "vistoria realizada" sem dado do agente.
  - Documentação: roteiro em HML com os builds de HML do cidadão (F17-E17) e do agente (F14-E11) e o painel, em Android e iPhone.
- **O que NÃO deve ser implementado nesta etapa:** aparelho físico como portão do POC (F26-E03); reinspeção (F13); carga (F24).
- **Arquivos e módulos prováveis:** `apps/api/test/fluxo-h-relato-ate-o-agente.test.ts` (a criar), `apps/campo/src/__tests__/relato-convertido-na-tarefa.test.tsx`.
- **Risco de segurança:** alto; falso verde que deixe dado do cidadão ou do agente cruzar.
- **Impacto LGPD:** Não se aplica: dados sintéticos.
- **Migração necessária:** Não.
- **Compatibilidade:** suítes atuais intactas.
- **Rollback:** reverter.
- **Testes positivos:** do relato à vistoria concluída em um ciclo; protocolo oficial único.
- **Testes negativos:** relato em triagem fora de `pendencias`; nome, contato, CPF, foto, vídeo e chat sentinelas ausentes no payload; o cidadão não vê equipe, agente nem severidade.
- **Testes de autorização e isolamento:** agente de outra equipe não vê a tarefa; outro município: 404.
- **Regressão obrigatória:** `npm run test:api`, `test:campo`, `test:cidadao`, `test:e2e:api`, `test:isolamento`.
- **E2E:** este é o E2E do fluxo H, em HML.
- **Validação humana:** Rafael e Alyson percorrem o roteiro em aparelho; portão visual (`19-definicao-de-pronto.md`, seção 0) e da F08-E13.
- **Evidência a produzir:** `docs/evidencias-v2/G19/V2-F19-E07/`: saída, builds, fotos do aparelho, capturas e `INDEX.md`.
- **Documentação a atualizar:** `dc360/README.md`.
- **Definition of Done:** fluxo H verde em HML com negativos de payload.
- **Checkpoint:** Não.

# GATE G19 - CIDADÃO ATÉ O CAMPO
Só passa se:
- [ ] V2-F19-E01 (P0) e CP-09: as três rotas do agente usam a lista de inclusão para ocorrência de relato, sem CPF, vídeo nem chat, e o teste de catálogo reprova coluna sem classificação; CP-09 decidido, ou adiado por escrito com a lista conservadora só em HML e o envio a agente em produção bloqueado. Evidência: E01.
- [ ] V2-F19-E02 (P0): descrição operacional entregue e coordenada marcada como declarada pelo cidadão, com a precisão da F10-E26 ao lado (sem recriar a coluna) e a correção da coordenação limpando a marca. Evidência: E02.
- [ ] V2-F19-E03 e CP-09: contato só com aceite do cidadão e liberação da triagem, padrão desligado. Evidência: E03.
- [ ] V2-F19-E04 (P0): nenhuma rota do agente entrega foto, vídeo, chat, anexo ou evidência promovida do cidadão. Evidência: E04.
- [ ] V2-F19-E05 (P0): `agente-nao-recebe-dado-do-relato.test.ts` varre oito rotas e as de vídeo e chat da F34 por sentinelas (inclui CPF, vídeo e mensagem de chat) e a fixture iguala o payload. Evidência: E05.
- [ ] V2-F19-E06: o app do agente mostra origem e coordenada declarada, com acessibilidade e frases do catálogo de idiomas. Evidência: E06.
- [ ] V2-F19-E07 (P0): fluxo H verde em HML. Evidência: E07.
- [ ] O payload das ocorrências abertas pelo operador está igual ao anterior (ou alterado só pela decisão de CP-09), provado por `teto-de-pendencias.test.ts` e `reconciliar-pendencias.test.ts` sem editar expectativa. Evidência: saída arquivada.
- [ ] `npm run test:isolamento`, `npm run test:api`, `npm run test:campo`, `npm run test:cidadao`, `npm run test:e2e:api`, `npm run typecheck` e `npm run conferir:numeros` verdes. Evidência: saída arquivada.
- [ ] CP-36 (capacidade e custo da próxima onda) registrado antes de iniciar F29 e as seguintes (F30, F31, F35 e F20 a F25). Evidência: registro em `docs/evidencias-v2/G19/`.
- [ ] Portão visual: as etapas de tela (E03 e E06) e o roteiro de E07 têm capturas e fotos do aparelho, claro e escuro, com o checklist da seção 0 de `19-definicao-de-pronto.md` preenchido e o portão da F08-E13 verde; Rafael aprovou. Evidência: `capturas/` e `INDEX.md`.
- [ ] nenhuma regressão: todos os gates anteriores na ordem de execução (G00 a G18 e G34) continuam verdes (se um quebrar, ESTE gate volta a REPROVADO).
- [ ] documentação atualizada e evidências arquivadas em `docs/evidencias-v2/G19/`.

**Reabre se:** nome, contato, CPF, foto bruta, vídeo, mensagem de chat, vulnerabilidade declarada, nota interna ou identificador interno do relato chegarem ao aparelho; relato em triagem aparecer na lista do agente; coluna nova de `ocorrencias` sair sem classificação; a coordenada declarada deixar de ser marcada; G14, G16, G18 ou G34 reabrirem.
**Este Gate libera:** F29 (e, em cadeia, F30, F31 e F35), F20, F21, F22, F23, F24 e F25 (cada uma com os demais gates que exige) e o POC (F26) no que depende do fluxo H. O envio de relato convertido a agente em produção só vale com CP-09 decidido.
