# Baseline Zero da V2: frente 03, app do agente de campo (§7) e offline (§18)

Auditor: frente CMP. Repositório C:\Projetos\city-hall, HEAD e82719e (17/09/2026), data da auditoria 30/09/2026. Somente leitura, mais a execução pontual de arquivos de teste (lista na seção "O que eu executei").

## Resumo

1. O app do agente (React Native/Expo) e o motor offline (`packages/campo`) existem e têm prova forte até o nível (c): fila persistente, idempotência por chave, portão de autoria (cliente e servidor), devolução de tarefa, perda de arquivo com declaração no laudo. Executei 159 testes do motor, 15 de integração fila+API+PGlite e 100 de API: todos passaram.
2. Prova em aparelho (níveis d/e): NENHUM artefato verificável no repositório (sem log, captura, vídeo, dump). Há relatos datados (emulador Android 16 em 27/08, commit b37b00d; iPhone 16 instalado em 08/09, vistoria 000009/2026 em 15/09) e uma documentação que os contradiz (`apps/campo/LEIA-ME.md:3`: "NUNCA RODOU EM APARELHO", linha de 23/08 nunca atualizada). Três versões divergentes, descritas abaixo sem escolher uma. Para esta auditoria, (d) e (e) = NÃO CONFIRMADO.
3. O HEAD do app regride contra os próprios testes: 5 suítes e 20 testes falham (reproduzido por mim). Entre eles, seis correções "provadas com o aparelho na mão em 15/09/2026" que os testes exigem e o fonte não tem (precisão de GPS abaixo de 0,5 m vira 0 e o servidor recusa; promessa falsa de envio "mesmo com o aplicativo fechado"; diálogo de saída que não avisa que apaga a vistoria começada).
4. Saída a campo (segurança do agente sozinho): API e painel web existem e passam (27 testes); o APLICATIVO não tem nenhuma chamada a essas rotas. O cartão de bolso do agente, `SEGURANCA-DO-AGENTE.md` e a apresentação de 15/09 ("Pronto") afirmam que o agente declara a saída no app.
5. Sincronização só roda com o app aberto (laço JS em `_layout.tsx`); não há tarefa em segundo plano do SO. A tela promete o contrário.
6. Dados locais: SQLite e fotos em claro (declarado em `DECLARACAO-NAS-LOJAS.md`), sem wipe remoto, sem limpeza depois da sincronização, sem bloqueio local do app. `acolherNoAparelho` (troca de pessoa apaga dado) não tem teste; o comentário cita um teste que nunca existiu.
7. Escopo do agente: leituras recortadas por equipe e provadas; o sino (`GET /avisos`) e a autorização de upload de evidência não têm recorte de equipe.
8. Despacho -> agente: instruções do despacho e `prazoHoras` não chegam ao aparelho; não há aceite; não há pedido de complemento nem reinspeção (máquina de estados sem volta). Push: código e credenciais provados, entrega real em aparelho NÃO CONFIRMADA e "desligado" em produção segundo a apresentação de 15/09.

---

## Método, legenda e o que eu executei

Níveis de prova: (a) teste unitário; (b) teste com sistema de arquivos ou SQLite falso, ou SQLite real em memória via `node:sqlite`; (c) integração contra API real/PGlite; (d) emulador/simulador; (e) aparelho físico. (d) e (e) só contam com artefato verificável; relato sem artefato fica NÃO CONFIRMADO.

Executei (somente leitura; os executores gravam caches em `node_modules/.vite` e no cache do jest):

| Comando | Resultado |
| --- | --- |
| `packages/campo`: `npx vitest run` | 8 arquivos, 159 testes, todos passaram (fila 58, correção 21, devolução 24, prazo 12, coleta 14, conclusão 11, prova-perdida 10, depósito-sqlite 9) |
| `apps/campo`: jest em `logout-nao-apaga-prova`, `evidencia-no-disco`, `token` | 3 suítes, 27 testes, passaram |
| `apps/campo`: jest em `tela-de-vistoria`, `vistoria-nao-sai-quebrada`, `coletas`, `sessao`, `push/registro` | 5 suítes, 58 testes, passaram |
| `apps/campo`: jest nas 5 suítes que a auditoria de 30/09 apontou + `a-sessao-vencida-nao-apaga-a-vistoria` | 5 FALHARAM (20 testes), 1 passou. Reproduz exatamente o achado anterior |
| `apps/api`: vitest em `campo-integracao`, `vistoria-em-corrida` | 15 testes passaram (nível c: fila real sobre HTTP real, Postgres PGlite) |
| `apps/api`: vitest em `autoria-da-coleta`, `agente-so-ve-a-equipe`, `saida-a-campo`, `push-aparelhos`, `prova-perdida-e-ponto-da-vistoria`, `reconciliar-pendencias`, `vistoria-e-da-equipe`, `despacho-avisa` | 8 arquivos, 100 testes passaram |

Não rodei a suíte completa do app (a auditoria anterior registrou 116 de 121 suítes passando; só reproduzi as 5 que falham). Quando cito teste que não executei, digo "existe, não executado por mim". Não rodei `typecheck`.

---

## 7. Aplicativo do agente de campo: inventário

Arquitetura lida no código: `apps/campo` (Expo SDK 57, expo-router, fora do `workspaces`), `packages/campo` (motor TypeScript puro: fila, depósito, transporte, regras), servidor em `apps/api/src/rotas/{sincronizacao,campo,evidencias,saida-a-campo,aparelhos,avisos,recorte-do-agente}.ts`. O único arquivo do app que liga o motor ao aparelho é `apps/campo/src/dados/fila.ts` (fila sobre `expo-sqlite`, `expo-file-system`).

### 7.1 Evidência de prova em aparelho: três lados que divergem

Não escolho uma versão. Descrevo as três com evidência.

- Lado da documentação "nunca rodou": `apps/campo/LEIA-ME.md:3` ("escrito por inteiro, compila, NUNCA RODOU EM APARELHO") e "nenhuma tela foi aberta em aparelho nenhum". `git blame` mostra que essa linha é do commit 447a79a de 23/08/2026 e nunca foi atualizada, embora o mesmo arquivo tenha ganho em 27/08 a seção sobre o erro `executeSync` do worklets, descoberta só ao compilar.
- Lado da documentação "rodou, em uso": `dc360/README.md:16` ("Instalado e usado em iPhone de verdade (compilação nativa, 08/09/2026), com três vistorias reais coletadas"); `docs/apresentacao/2026-09-15-para-o-alyson.html` ("instalada num iPhone 16 em 08/09; vistorias reais coletadas desde então; binário de 15/09 já está no aparelho"; "Android verificado só em emulador, nunca em aparelho"; CA-02 "Parcial", com o ciclo em modo avião no aparelho "pendente de mão humana"); `apps/campo/PENDENCIAS.md` §8, §10, §13 ("o binário instalado hoje no iPhone").
- Lado do código e do histórico: commit b37b00d (27/08/2026 20:58) relata compilação (BUILD SUCCESSFUL, APK de 91 MB), instalação em emulador Android 16, login contra a API, baixa da tarefa, coleta em modo avião, processo morto com rascunho intacto, e dois defeitos que só o aparelho achou (worklets; `NativeStatement.runAsync has been rejected`, corrigido em `banco-local.ts:104`). Existe localmente (gitignored, fora do repositório versionado) `apps/campo/android/app/build/outputs/apk/debug/app-debug.apk` com 95.081.390 bytes (90,7 MiB), carimbo 27/08 20:17, coerente com o relato de compilação, mas compilar não é rodar. Comentários e testes de regressão citam fatos do iPhone com identificadores: vistoria 000009/2026 em 15/09/2026, foto de 812 KB com `size` zerado (`evidencia-no-disco.ts:50-90`, `evidencia-no-disco.test.ts:19,252`), sessão de um iPhone revogada pelo servidor "nove horas" antes (`a-sessao-que-terminou-nao-e-falta-de-sinal.test.tsx:9`), "as TRÊS vistorias reais do piloto de Florianópolis chegaram com `assinatura_chave` nula" em 09/09 (`conclusao.ts`).
- Avaliação: o relato é datado, específico e consistente entre commit, comentários e testes de regressão derivados dos defeitos (o que lhe dá credibilidade). Mas não há artefato verificável no repositório: nenhum log, captura, vídeo, dump do banco de produção. O banco de produção não está no repositório. Para fins desta auditoria: (d) e (e) = NÃO CONFIRMADO, com "relato consistente" anotado.

### 7.2 Inventário dos 27 pontos

Classificação: COMPROVADO / PARCIAL / AUSENTE / NÃO CONFIRMADO. "Aparelho" = níveis (d)/(e).

| Ponto | Classificação | Evidência | Nível de prova (a/b/c) | Aparelho (d/e) |
| --- | --- | --- | --- | --- |
| Autenticação | COMPROVADO no que implementa (e-mail+senha, acesso 15 min, renovação rotativa 14 dias, cofre do SO); PARCIAL no entorno: sem tela de segundo fator, sem bloqueio local | `dados/api.ts:entrar/renovar/sair`; `dados/sessao.tsx:75` (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`); `dados/token.ts` (trava de renovação, folga 120 s); `config.ts:356-357`; `token.test.ts` e `sessao.test.tsx` passaram (a); `campo-integracao.test.ts:329` passou (c). Server aceita ativar 2FA para qualquer papel (`rotas/segundo-fator.ts:156`, `exigidoPara` só força o administrador, `auth/segundo-fator.ts:114`) e o app lê `r.acesso` direto (`api.ts:entrar`), sem tratar desafio: lido no código, não reproduzido. Sem `expo-local-authentication` em `package.json` | a, c | NÃO CONFIRMADO (relato b37b00d: "autenticou contra a API") |
| Escopo do agente (o que o token enxerga) | PARCIAL | Só a ação `registrar_vistoria` (`shared/permissoes.ts:80`). Leituras recortadas por equipe em `recorte-do-agente.ts:26` (ocorrências, dossiê, mapa, interditados, evidências), 404 e nunca 403; `agente-so-ve-a-equipe.test.ts` passou (c). LACUNAS por leitura de SQL: `GET /avisos` sem recorte (`avisos.ts:201, 395-411`: protocolo, tipo e detalhe de avisos de todo o município); `POST /evidencias/autorizar-envio` só confere município e `encerrada` (`evidencias.ts:288-303`), sem equipe; `GET /pendencias` e `/meu-trabalho` recortados | a, c | NÃO CONFIRMADO |
| Equipes | PARCIAL | `GET /campo/meu-trabalho` (`campo.ts`): equipe, colegas ativos, `emCampo`, concluídas (teto 50 + total real), `devolvidasNoMes`. Uma equipe por usuário (`usuarios.equipe_id`). DEFEITO ABERTO e confirmado no código: agente sem equipe recebe `concluidas: []` e sem totais (`campo.ts:62-70`), lê zero vistorias (PENDENCIAS §11). Testes de tela existem (`perfil-equipe-e-concluidas.test.tsx`), não executados por mim | a, c | NÃO CONFIRMADO (apresentação diz "Perfil com foto e números: Pronto") |
| Tarefas | PARCIAL | Tarefa = ocorrência `em_campo` da equipe do agente (`sincronizacao.ts:1521-1583`, teto 200 com `truncada`). Lista e catálogo de órgãos gravados numa transação (`pendencias.ts:atualizarPendencias`); atualização por idade (`atualizacao.ts`, foco/AppState/sinal/60 s); reconciliação do que sumiu (`sincronizacao.ts:1389`, `reconciliar-pendencias.test.ts` passou). Sem aceite; `instrucoes` e `prazoHoras` do despacho ficam só na trilha (`ocorrencias.ts:870-874`, tipo `Pendencia` não os tem) | a, b, c | NÃO CONFIRMADO |
| Saída a campo | AUSENTE no app; COMPROVADO na API e no painel | Rotas `saida-a-campo.ts:168 (declarar), 430 (prorrogar), 576 (retorno), 686 (listar), 736 (encerrar), 837 (minha)`; `saida-a-campo.test.ts` 27 passaram (c). Grep em `apps/campo/src` por `saida-a-campo`, `prorrog`, `sozinho` (no sentido de declaração): zero chamadas; o app só lê `emCampo` dos colegas (`api.ts:503`). Documentação que afirma o contrário: `CARTAO-DO-AGENTE.md` passo 2, `SEGURANCA-DO-AGENTE.md` §5 "No aplicativo do agente", apresentação 15/09 linha "Segurança do agente sozinho: Pronto" | c (API) | n/a |
| Vistoria | PARCIAL | Rascunho gravado a cada toque (`rascunho.ts:salvarRascunho`, UPSERT); conclusão em ordem (`coleta.ts:concluirColetaEmOrdem`, `vistoria/[id].tsx:1788`); conferência antes de enfileirar com os esquemas do servidor (`conferencia.ts:conferirColeta`); correção de coleta recusada (`fila.ts:1153`); `tela-de-vistoria` e `vistoria-nao-sai-quebrada` passaram. Mas 6 correções de 15/09 ausentes do fonte (ver §7.4) | a, b, c | NÃO CONFIRMADO (relato: emulador e iPhone) |
| Checklist | PARCIAL | Lista fixa de 6 itens, 4 obrigatórios, igual para todos os tipos COBRADE (`shared/dominio.ts:306-312`); servidor recusa se faltar obrigatório (`schemas.ts:264`). A especificação VIS-05 pede checklist por tipo com perguntas condicionais; a apresentação classifica "Feito diferente". A auditoria de 30/09 marcou "Completo" (discordo) | a, c | NÃO CONFIRMADO |
| GPS | PARCIAL | `Location.getCurrentPositionAsync({accuracy: High})`, só primeiro plano (`vistoria/[id].tsx:1424-1452`); opcional para concluir; ponto único da vistoria, e cada foto herda esse último ponto, não um GPS próprio (`:1490-1512`); sem detecção de localização simulada; permissão negada sem botão "abrir ajustes" (teste falha) | a | NÃO CONFIRMADO |
| Precisão | PARCIAL, com defeito | `gps_precisao_metros` no envelope e no laudo; divergência do ponto da ocorrência com piso (`divergenciaDeCoordenada`). DEFEITO: `Math.round(posicao.coords.accuracy)` (`:1447`) devolve 0 abaixo de 0,5 m e o esquema exige `positive()` (`schemas.ts:411`), então a coleta é recusada com 422; o teste "abaixo de meio metro vira 1, e não zero" FALHA (reproduzido) | a (falhando) | NÃO CONFIRMADO |
| Fotos | COMPROVADO (motor e servidor); lacunas de desenho | Captura com `expo-camera` qualidade 0,6; cópia para `Paths.document` (`evidencia-no-disco.ts:guardarFotoNoAparelho`); `autorizarFoto` -> PUT direto com URL pré-assinada e escrita única -> `confirmarFoto`; o servidor lê o objeto, confere o tamanho e calcula o SHA-256 (`evidencias.ts:115-200`); `campo-integracao` "Foto de campo do aparelho ao banco" passou (c). Lacunas: o aparelho não calcula hash (prova de integridade só a partir da chegada); PUT único de até 15 MB com limite de 120 s; sem vídeo | a, b, c | NÃO CONFIRMADO (relato: JPEG íntegro offline no emulador; iPhone 15/09 com `size` zerado) |
| Assinatura | COMPROVADO (traço); PARCIAL (obrigatoriedade) | `ui/Assinatura.tsx` (SVG -> PNG em `Paths.document`), sobe com papel próprio `assinatura` (`fila.ts:1505+`, testes `fila.test.ts:1480-1615` passaram). Obrigatória só no cliente (`conclusao.ts:faltaParaConcluir`); o servidor aceita `assinaturaChave` nula (`schemas.ts`), e três vistorias reais chegaram sem assinatura em 09/09 (comentário em `conclusao.ts`; commit 271f6d2). Traços vivem em estado React até "Confirmar": morte do processo antes perde o desenho | a, b, c | NÃO CONFIRMADO |
| Armazenamento | PARCIAL | SQLite único (`banco-local.ts`, WAL, `busy_timeout` 5 s, esquema num lugar), KV JSON para fila, credenciais no SecureStore, fotos e PNG em `Paths.document`. Sem checagem de espaço livre (grep), sem limpeza depois de sincronizar (só o logout apaga), backup do Android desligado (`app.config.ts:398`), exclusão de backup do iOS NÃO CONFIRMADA | b | NÃO CONFIRMADO |
| Offline | PARCIAL | Lista e catálogo em disco, vistoria sem rede, fila, lápide contra segunda vistoria, conferência antes de enfileirar. Sem mapa offline, sem sincronização em segundo plano. CA-02 "Parcial" na própria apresentação | a, b, c | NÃO CONFIRMADO (CA-02 pendente) |
| Fila | COMPROVADO | `packages/campo/src/fila.ts`; 58 testes + 15 de integração passaram; espera exponencial com ruído (`:214`), dreno único com marca (`:491-510`), ordem de coleta, `enviando` retomado após morte do app (`:479`, teste `:855`) | a, b, c | NÃO CONFIRMADO |
| Conflito | PARCIAL | Por desenho: append-only, idempotência, "aceita e marca" para fora da equipe e sem despacho (`sincronizacao.ts:546-577, 925-955`), `ja_encerrada` -> arquivada (`fila.ts:42, 937`), `autor_divergente` -> 409 (`:460`). Sem tela de resolução além de corrigir/reenviar/descartar; sem aditamento (VIS-08) | a, c | NÃO CONFIRMADO |
| Idempotência | COMPROVADO | Chave gerada no aparelho (`Crypto.randomUUID`); UNIQUE por município e `ON CONFLICT DO NOTHING` + releitura (`sincronizacao.ts:470-700`); `campo-integracao` "a mesma coleta enviada dez vezes vira um laudo só" e `vistoria-em-corrida` (5) passaram; evidência (`evidencias.ts:238-285`) e devolução (`sincronizacao.ts:1066-1252`) idem | a, c | NÃO CONFIRMADO (LEIA-ME passo 6 pendente) |
| Sincronização | PARCIAL | Envio pela fila: COMPROVADO. Pull da lista: COMPROVADO. Mas só em primeiro plano: laço JS `LacoDaFila` (`(agente)/_layout.tsx:186-198`); nenhum `expo-task-manager`, `BackgroundFetch` ou `UIBackgroundModes` (grep em `package.json` e `app.config.ts`). As telas dizem "em segundo plano" (`fila.tsx:1658, 1787`) e "mesmo com o aplicativo fechado" (`vistoria/[id].tsx:2233`) | a, b, c | NÃO CONFIRMADO |
| Logout | PARCIAL | `sair()` (`sessao.tsx:190`): esquece credencial antes de avisar o servidor, revoga sessão e cala o push enviando a ficha (servidor: `push-aparelhos.test.ts` passou, c), apaga rascunhos, lista, marcas, lápides e foto do perfil (`banco-local.ts:286-372`), preserva fila e arquivos que ela referencia (`logout-nao-apaga-prova.test.ts`, 4 passaram). DEFEITOS: diálogo não conta rascunhos (`perfil.tsx:534-539`, teste falha); lápides apagadas com a fila mantida; teste do cliente que prova o envio da ficha (`logout-cala-o-aparelho.test.tsx`) está quebrado por mock desatualizado | a, b, c | NÃO CONFIRMADO |
| Sessão expirada | PARCIAL | `encerrarSessaoVencida` não apaga nada (`sessao.tsx:236`; `a-sessao-vencida-nao-apaga-a-vistoria.test.tsx` passou). Item da fila que recebe 401 vira `bloqueado` (`transporte.ts`, `campo-integracao.test.ts:329` passou) e só volta por toque manual; `fila.tsx` não trata `nao_autenticado`, mostra a frase do servidor. 4 suítes de sessão encerrada falham por expectativas desatualizadas | a, c | relato parcial: iPhone com sessão revogada 9 h antes (comentário de teste); NÃO CONFIRMADO |
| Aparelho revogado | PARCIAL | Só a ficha de push: revoga no logout, no varredor quando o provedor recusa o token, e `POST /aparelhos/revogar` (`aparelhos.ts:185`, sem tela). Desativar usuário derruba sessões (`administracao.ts:202-292`, SQL `revogar_sessoes_do_usuario`), mas o token de acesso vale até 15 min. Não há cadastro de aparelho, revogação por aparelho nem wipe remoto | c | n/a |
| Push | PARCIAL | Registro da ficha depois do login (`push/registro.ts`), vitrine constante sem PII (`mensagem.ts:26-90`), dois tipos (`tarefa_nova`, `prazo_vencendo`), aviso enfileirado na transação do despacho e enviado pelo varredor com trava (`ocorrencias.ts:877-930`, `varredor.ts`); `push-aparelhos` (21) e `despacho-avisa` passaram (c). Apple e Google "aceitaram as credenciais" com ficha falsa em 13/09 (`BadDeviceToken`, `UNREGISTERED`): não é entrega. Apresentação de 15/09: "Pronto, desligado" (falta chave no servidor e capacidade Time Sensitive). Entrega real em aparelho: sem evidência | a, c | NÃO CONFIRMADO |
| Tratamento de erro | PARCIAL | Frases em português que terminam numa ação (`api.ts:ErroDaApi.mensagemAmigavel`, `SemSinal`), classificação temporária/permanente (`transporte.ts`), conferência antes de enfileirar. Sem relatório de falhas, telemetria, `ErrorBoundary` ou versão mínima (grep sem resultados) | a | NÃO CONFIRMADO |
| Perda de arquivo | COMPROVADO (lógica); NÃO CONFIRMADO (sistema de arquivos real) | `arquivo_sumiu` marca a foto, o dreno percorre todas, o agente consente, o envelope leva `evidenciasPerdidas`, o servidor grava tabela, evento de trilha e nota no laudo (`fila.ts:754-839, 1061`; `sincronizacao.ts:215, 705, 902-922`); `prova-perdida.test.ts` (10) e `prova-perdida-e-ponto-da-vistoria.test.ts` passaram. `PENDENCIAS.md` §7 admite que a leitura real do `expo-file-system` só foi exercitada com dublê. `PENDENCIAS.md` §2 ainda diz que isso "não foi feito": obsoleto | a, b, c | NÃO CONFIRMADO |
| Retomada de upload | PARCIAL | Retoma arquivo a arquivo e grava o progresso a cada foto (`fila.ts:803-811`, testes `:1341, 1382, 1409, 1569`); `jaEnviada` evita reenvio. Não retoma no byte (PUT único por arquivo, `transporte.ts:enviarBytes`, limite de 4 x 30 s) | a, c | NÃO CONFIRMADO |
| Criptografia local | AUSENTE (própria) | SQLite e arquivos em claro; só a criptografia do SO e o cofre para credenciais. `DECLARACAO-NAS-LOJAS.md:395-400` diz com todas as letras que o banco local não tem criptografia própria. A lista de tarefas traz nome e contato do solicitante e descrição de vulnerabilidade de saúde (`api.ts:Pendencia`) | n/a | n/a |
| Limpeza de dados | PARCIAL | Logout apaga o banco (menos a fila) e os arquivos não referenciados (`banco-local.ts:286-372`); a entrada de OUTRA pessoa também (`acolherNoAparelho`, `:252`). Depois de confirmada a sincronização, foto e assinatura continuam em `Paths.document` até o próximo logout explícito; o próprio código diz que "o agente de campo não sai da conta" (`evidencia-no-disco.ts:~110`). Rascunho órfão de tarefa que saiu da lista também fica | b | NÃO CONFIRMADO |
| Troca de usuário no mesmo aparelho | PARCIAL | Fila: autor carimbado, dreno só envia coleta própria, servidor recusa autor divergente (testes `fila.test.ts:503-757`, `autoria-da-coleta.test.ts` passaram, a/c). Limpeza na entrada de outra pessoa: `acolherNoAparelho` (`banco-local.ts:252`, chamada em `sessao.tsx:180`) SEM NENHUM TESTE que a execute (grep em todos os testes); o comentário de `a-sessao-vencida-nao-apaga-a-vistoria.test.tsx:14` aponta para `dados/sessao-vencida-nao-apaga.test.tsx`, arquivo que nunca existiu no git. Fila do agente anterior permanece no aparelho e qualquer pessoa pode descartá-la (`fila.ts:1184-1205`) | a, c | NÃO CONFIRMADO |

### 7.3 Escopo do token do agente: o que ele enxerga de fato

Lido nas rotas e nos testes: o agente autoriza só `registrar_vistoria`; `GET /sincronizacao/pendencias`, `/campo/meu-trabalho`, `GET /ocorrencias/:id`, `/ocorrencias`, `/mapa`, `/evidencias/ocorrencia/:id` e `/:id/url` são recortados à equipe do cadastro do usuário, lida sob RLS no instante da consulta, e ocorrência de outra equipe responde 404. Dois buracos por leitura de SQL (não reproduzidos): o sino devolve avisos de todo o município (`vistoria_recebida`, `prazo_vencido`, `providencia_respondida`, `retorno_nao_confirmado`, com protocolo e detalhe curto), e a autorização de upload de evidência aceita qualquer ocorrência não encerrada do município. O sino é "sem `exigirPermissao`" por desenho declarado em comentário (`avisos.ts:201-215`), o que conflita com a promessa de `PAPEIS_E_RESPONSABILIDADES.md` de que o agente "não vê a fila do município".

### 7.4 O HEAD do app contra os próprios testes

Reproduzi 20 falhas em 5 suítes. Separei por causa provável, sem ter investigado cada asserção:

- Testes que exigem correção ausente do fonte. `vistoria-o-teclado-a-camera-e-o-que-ela-promete.test.tsx` (9 falhas) documenta "seis achados, provados com o aparelho na mão em 15/09/2026": (1) a tela de "vistoria guardada" prometia envio "mesmo com o aplicativo fechado", e o próprio cabeçalho do teste registra "não há sincronização em segundo plano neste aplicativo (nenhum `expo-task-manager`, nenhum `BackgroundFetch`, nenhum `UIBackgroundModes`)"; o fonte ainda diz a frase (`vistoria/[id].tsx:2233`); (2) teclado sem `keyboardShouldPersistTaps` e sem `automaticallyAdjustKeyboardInsets`; (3) câmera sem `barra-da-camera` com área segura; (4) permissão negada de câmera e localização sem botão "Abrir os ajustes do aparelho"; (5) precisão abaixo de 0,5 m arredondando para zero; (6) mensagem "o arquivo saiu vazio" engolida pela genérica. `dialogo-na-conta-com-vistoria-comecada.test.tsx` (7 falhas) exige que o Perfil conte rascunhos no diálogo de saída e assine a fila ao vivo; o fonte lê `fila.resumo()` uma vez na montagem (`perfil.tsx:450`) e o diálogo só conta itens da fila (`:534-539`), embora o hook `useResumoDaFila` exista (`dados/resumo-da-fila.ts`, usado pela barra de abas). O comentário de `banco-local.ts` ("É por isso que o diálogo de saída conta os rascunhos e avisa") descreve um comportamento que o fonte não tem.
- Testes provavelmente desatualizados em relação a uma mudança deliberada do fonte. `a-sessao-que-terminou-nao-e-falta-de-sinal` e `perfil-a-sessao-que-terminou-e-o-aviso-que-fecha` esperam o texto "toque em Sair da conta e entre de novo"; o fonte passou de propósito a dizer "Entrar de novo" porque "Sair da conta" apaga a vistoria começada (`falha-de-atualizacao.ts`, comentário do `detalhe`). `logout-cala-o-aparelho.test.tsx` mocka `banco-local` sem `acolherNoAparelho`, então `entrar` estoura antes de provar o envio da ficha.
- O commit que introduziu tudo isso (5ecdf4c, 15/09/2026 23:28, 64 arquivos em `apps/campo`, mensagem genérica "Implementação do sistema DC360...") trouxe testes novos e fonte novo no mesmo pacote; não investiguei por que os dois não fecham.

---

## 18. Offline: prova ponto a ponto

Três colunas como pedido. "PROVADO EM APARELHO" fica NÃO CONFIRMADO em todas as linhas pelo critério da seção 7.1; ao lado anoto o relato existente, para não perder a informação.

| Item | PROVADO EM TESTE (nome do teste) | PROVADO EM APARELHO | NÃO PROVADO |
| --- | --- | --- | --- |
| Persistência | `deposito-sqlite.test.ts` "guarda a coleta e a recupera depois de reabrir o aplicativo" (banco falso: um mapa, prova SQL e lógica); `fila.test.ts` "guarda a coleta e a fila sobrevive ao aplicativo fechar" (mapa em memória); no app, `coletas.test.ts`, `catalogo-de-orgaos.test.ts`, `avisos.test.ts` etc. rodam SQL real em memória (`node:sqlite`) | NÃO CONFIRMADO. Relato: emulador 27/08 "rascunho sobreviveu ao processo morto" (b37b00d); iPhone: a vistoria 000009/2026 foi gravada e lida da fila | Durabilidade do `expo-sqlite` sob morte no meio da escrita (LEIA-ME passo 4 e `deposito-sqlite.test.ts:8-9` admitem); `PRAGMA journal_mode=WAL` no aparelho |
| Reinício do app | `fila.test.ts:855` "app morto durante o envio: reenvia com a mesma chave, e o servidor deduplica"; `rascunho-de-versao-antiga.test.ts`; `a-sessao-vencida-nao-apaga-a-vistoria.test.tsx` | NÃO CONFIRMADO (relato: emulador, rascunho intacto) | Reinício do APARELHO (nenhuma evidência); morte do app no meio do envio em aparelho (LEIA-ME passo 6, pendente); atualização do app com fila antiga |
| Modo avião | Nenhum teste liga modo avião. Simulado por transporte que lança `FalhaTemporaria`: `fila.test.ts` "Sinal caindo" (3 testes, `:232-296`) e "O dia inteiro de um agente" (`:1185`); `conectividade.ts` (`expo-network`, `isInternetReachable`) NÃO tem teste | NÃO CONFIRMADO. Relato: emulador "coletou vistoria em modo avião" e "a faixa de conectividade troca nos dois sentidos" (b37b00d). Aparelho físico: CA-02 "Parcial", "pede dedo humano" (apresentação) | O ciclo CA-02 (modo avião, GPS e cinco fotos, reconecta e sincroniza sem duplicar) em aparelho, com captura de cada etapa |
| Anexos | `fila.test.ts:1248-1480` (fotos sobem antes do envelope, retoma, `jaEnviada`, URL vencida, recusa permanente); `evidencia-no-disco.test.ts` (FS falso; passou); `campo-integracao.test.ts` "Foto de campo do aparelho ao banco" (c, passou); `evidencias.test.ts` (existe, não executado) | NÃO CONFIRMADO. Relato: emulador "câmera grava JPEG íntegro offline"; iPhone 15/09 com `size` zerado (defeito real, regressão em `evidencia-no-disco.test.ts`) | Cinco fotos reais ponta a ponta; foto grande (perto de 15 MB) em rede ruim; espaço em disco cheio |
| GPS | `divergenciaDeCoordenada` (testes da tela); servidor: `prova-perdida-e-ponto-da-vistoria.test.ts` passou (ponto gravado como dado da vistoria). `vistoria-o-teclado...` "abaixo de meio metro vira 1" FALHA | NÃO CONFIRMADO | GPS em encosta fechada, permissão negada e precisão ruim em aparelho; correção do arredondamento |
| Assinatura | `fila.test.ts:1505` (sobe com papel próprio), `:1545`, `:1569` (retoma); `assinatura.test.ts` e `assinatura-ausente-no-documento.test.ts` (API, existem) | NÃO CONFIRMADO. Relato: "traço branco em papel branco" achado no primeiro uso real e corrigido (apresentação VIS-06); três vistorias reais com `assinatura_chave` nula em 09/09 | Assinatura sobrevivendo a morte do processo antes de "Confirmar" (por desenho os traços ficam em estado React) |
| Fila | `fila.test.ts` (58 passaram); `campo-integracao.test.ts` (10 passaram) | NÃO CONFIRMADO. Relato: iPhone, vistoria 000009/2026 entrou na fila com 422 três vezes | Fila com muitos itens em aparelho real; drenagem após horas sem sinal |
| Idempotência | `campo-integracao` "a mesma coleta enviada dez vezes vira um laudo só"; `vistoria-em-corrida.test.ts` (5: corrida forçada, responde como reenvio); `fila.test.ts:829` "dois drenos ao mesmo tempo"; `:144` "tocar duas vezes em concluir" | NÃO CONFIRMADO | "Matar o aplicativo no meio do envio e reabrir" em aparelho (LEIA-ME passo 6) |
| Conflito | `autoria-da-coleta.test.ts`, `vistoria-e-da-equipe.test.ts` (passaram); `fila.test.ts:331-388` (arquivada quando encerrada), `:503-757` (aparelho compartilhado) | NÃO CONFIRMADO | Dois agentes da mesma equipe coletando a mesma ocorrência; redespacho durante coleta; aditamento (não existe) |
| Usuário trocado | `fila.test.ts` blocos "Aparelho de plantão compartilhado" (5) e "Coleta sem autor registrado" (3); `autoria-da-coleta.test.ts`; `logout-nao-apaga-prova.test.ts` | NÃO CONFIRMADO | `acolherNoAparelho` (apagar dado de outra pessoa ao entrar): NENHUM teste; destruição silenciosa do rascunho do colega ao entrar (por desenho, sem confirmação) |
| Sessão expirada | `token.test.ts`; `sessao.test.tsx` (renovação única); `a-sessao-vencida-nao-apaga-a-vistoria.test.tsx`; `campo-integracao.test.ts:329` (401 bloqueia sem martelar). 4 suítes de UI falham por expectativa antiga | NÃO CONFIRMADO. Relato: iPhone com sessão revogada 9 h antes (cabeçalho de `a-sessao-que-terminou...test.tsx`) | Renovação ao longo de 14 dias em aparelho; retomada automática da fila depois de novo login (não existe) |
| Dispositivo revogado | `push-aparelhos.test.ts` (21, passaram: saída revoga a ficha; varredor revoga ficha inválida); `despacho-avisa.test.ts` ("aparelho revogado fica de fora") | NÃO CONFIRMADO | Revogação de SESSÃO por aparelho e wipe remoto: não existem |
| Logout | `logout-nao-apaga-prova.test.ts` (4); `coletas.test.ts:241` "apagarDadosLocais leva as lápides"; servidor: `push-aparelhos.test.ts` "a saída revoga o aparelho". O teste do cliente `logout-cala-o-aparelho.test.tsx` FALHA | NÃO CONFIRMADO | Aviso de rascunho no diálogo (teste falha); efeito de apagar lápide com a fila cheia (sem teste) |
| Falha parcial | `fila.test.ts:1341` (retoma da foto que faltou), `:1409`, `:1444`, `:389` (segue para o próximo depois de bloquear); servidor: envelope e fotos na mesma transação, `recusarFoto` derruba tudo (`sincronizacao.ts:764-788`) | NÃO CONFIRMADO | Falha parcial com armazenamento real (R2/S3) a partir do app |
| Retomada | `fila.test.ts:1341, 1382, 1569`; `correcao-da-coleta.test.ts` (21) | NÃO CONFIRMADO | Retomada no byte: não existe |
| Arquivo removido pelo SO | `prova-perdida.test.ts` (10); `evidencia-no-disco.test.ts` (FS falso); `prova-perdida-e-ponto-da-vistoria.test.ts` (API, passou) | NÃO CONFIRMADO (PENDENCIAS §7: leitura real só com dublê) | Limpeza de cache real pelo SO; varredura de foto antiga ainda no cache (PENDENCIAS §3, não implementada) |
| Duplicação | Como idempotência, mais lápide: `coletas.test.ts` (passou), `vistoria-ja-coletada.test.tsx` (existe), `coleta.test.ts` (14 passaram) | NÃO CONFIRMADO | Lápide apagada no logout com fila cheia permite abrir segunda vistoria da mesma ocorrência (lido em `banco-local.ts:333` e `vistoria/[id].tsx:1166-1169`; sem teste, não reproduzido) |
| Criptografia local | Nenhum (não há) | n/a | AUSENTE: banco e arquivos em claro; classe de proteção de arquivo do iOS e exclusão de backup NÃO CONFIRMADAS |
| Limpeza | `logout-nao-apaga-prova.test.ts`; `coletas.test.ts:241`; `evidencia-no-disco.test.ts` (`apagarFotoDoAparelho`) | NÃO CONFIRMADO | Limpeza depois de sincronizar (não existe); retenção por idade no aparelho (não existe) |

---

## Matriz D

Convenção: SUPERFÍCIE "2 CAMPO" = app do agente; "API/CAMPO" = lado servidor das rotas de campo. ESTADO: A existe e comprovado; B existe com gap ou regressão; C existe parcialmente; D não existe; E novo requisito V2; F decisão humana necessária; G não confirmado. Prova em aparelho NÃO CONFIRMADA em toda linha, salvo dito.

| ID | SUPERFÍCIE | DOMÍNIO | REQUISITO / CAPACIDADE | ESTADO | EVIDÊNCIA | RISCO | DEPENDÊNCIAS | DECISÃO HUMANA? | OBSERVAÇÃO |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CMP-01 | 2 CAMPO | Autenticação | Login e-mail+senha, acesso 15 min, renovação rotativa 14 dias | A | `api.ts:entrar/renovar`; `config.ts:356-357`; `token.test.ts` (passou) | Baixo | auth (outra frente) | NÃO | Nível (a,c). Relato b37b00d: autenticou no emulador |
| CMP-02 | 2 CAMPO | Autenticação | Renovação única sem reapresentar token queimado | A | `token.ts:criarObtentorDeToken`; `sessao.test.tsx` 5 casos (passou) | Médio | CMP-01 | NÃO | Falha aqui derruba todas as sessões do agente |
| CMP-03 | 2 CAMPO | Autenticação | Credenciais no cofre do SO (Keychain/Keystore) | A | `sessao.tsx:75-88` | Baixo | n/a | NÃO | (a) apenas |
| CMP-04 | 2 CAMPO | Autenticação | Segundo fator no login do app | D | `rotas/segundo-fator.ts:156` sem filtro de papel; `api.ts:entrar` lê `r.acesso` sem tratar desafio | Médio | auth | SIM | Só o administrador é obrigado; agente que ativar pode ficar sem entrar no app (lido, não reproduzido) |
| CMP-05 | 2 CAMPO | Segurança local | Bloqueio local do app (PIN/biometria/ocioso) | D | `package.json` sem `expo-local-authentication`; grep sem resultado | Médio | CMP-47 | SIM | Aparelho de plantão compartilhado abre direto na sessão |
| CMP-06 | API/CAMPO | Escopo | Recorte do agente nas leituras (ocorrência, dossiê, mapa, evidências) | A | `recorte-do-agente.ts:26`; `agente-so-ve-a-equipe.test.ts` (passou) | Baixo | RLS (outra frente) | NÃO | 404 e nunca 403 |
| CMP-07 | API/CAMPO | Escopo | `exigirPermissao` nas rotas de campo | A | `sincronizacao.ts:427,1017`; `saida-a-campo.ts:169,431,577,838`; `evidencias.ts:211,484` | Baixo | n/a | NÃO | Via `autorizar` (`servidor.ts:858`) |
| CMP-08 | API/CAMPO | Escopo | Sino com recorte de equipe para agente | B | `avisos.ts:201, 395-411` (sem `eRecorteDoAgente`) | Médio | CMP-75 | SIM | Protocolo, tipo e detalhe de outras equipes; comentário declara "sem exigirPermissao" por desenho |
| CMP-09 | API/CAMPO | Escopo | Autorização de upload de evidência restrita à equipe | B | `evidencias.ts:288-303` | Médio | CMP-37 | SIM | Agente de outra equipe pode anexar arquivo (autor fica em `anexada_por` e na trilha) |
| CMP-10 | API/CAMPO | Escopo | Escrita do próprio agente sem `exigirPermissao` (aparelhos, avisos/lidos, foto de perfil) | B | `aparelhos.ts:88-101`; `avisos.ts:203,524`; `usuarios-eu.ts:18` | Baixo | regra do `CLAUDE.md` | SIM | Exceção documentada em comentário contra a regra literal; estreiteza substitui a permissão |
| CMP-11 | API/CAMPO | Equipes | Equipe, colegas, quem está em campo | B | `campo.ts:40-120`; `perfil-equipe-e-concluidas.test.tsx` (existe) | Baixo | CMP-12 | NÃO | Uma equipe por usuário |
| CMP-12 | API/CAMPO | Equipes | Histórico do agente (concluídas, total real, teto 50) | B | `campo.ts:62-70`: agente sem equipe recebe `concluidas: []`, sem totais (PENDENCIAS §11) | Médio | CMP-11 | NÃO | Agente retirado da equipe lê zero vistorias assinadas |
| CMP-13 | API/CAMPO | Tarefas | Lista de tarefas da equipe (`em_campo`), teto 200 com `truncada` | A | `sincronizacao.ts:1521-1583`; `teto-de-pendencias.test.ts` (existe) | Baixo | n/a | NÃO | Pull completo a cada atualização, sem delta |
| CMP-14 | 2 CAMPO | Tarefas | Cópia local da lista e do catálogo numa transação | A | `pendencias.ts:atualizarPendencias`; `lista-cortada.test.ts`, `catalogo-de-orgaos.test.ts` (existem; não executados) | Baixo | CMP-13 | NÃO | Lista traz contato do solicitante e vulnerabilidade de saúde em claro (CMP-47) |
| CMP-15 | 2 CAMPO | Tarefas | Atualização por idade (foco, AppState, sinal, 60 s) | A | `atualizacao.ts`; `(agente)/index.tsx:690-735`; `atualizacao.test.ts` (existe) | Baixo | CMP-65 | NÃO | Só com app aberto |
| CMP-16 | API/CAMPO | Tarefas | Reconciliação: por que a tarefa sumiu (encerrada, outra equipe, devolvida, concluída) | A | `sincronizacao.ts:1389-1505`; `reconciliar-pendencias.test.ts` (passou) | Baixo | CMP-27 | NÃO | Teto de 200 ids por pergunta |
| CMP-17 | API/CAMPO | Despacho | Instruções do despacho chegam ao agente | D | `ocorrencias.ts:870-874` (só trilha); `/pendencias` SELECT sem `instrucoes`; `Pendencia` sem o campo | Médio | CMP-18 | SIM | Campo de 2000 caracteres digitado pela coordenação que o agente nunca lê |
| CMP-18 | API/CAMPO | Despacho | Prazo do despacho (`prazoHoras`) chega ao agente | D | `ocorrencias.ts:848-873`: `prazo_em` da ocorrência não é tocado; `prazoHoras` só na trilha | Médio | CMP-17 | SIM | O agente vê apenas o prazo por severidade |
| CMP-19 | 2 CAMPO | Despacho | Aceite ou recusa da tarefa pelo agente | D | Apresentação OCO-06: "aceite explícito do agente não existe"; nenhuma rota | Médio | CMP-21 | SIM | Decisão de desenho registrada ("quem baixou a lista está ciente") |
| CMP-20 | API/CAMPO | Despacho | Devolução de tarefa vencida pela fila (motivos fechados, relógio do servidor) | A | `sincronizacao.ts:1016-1364`; `devolucao.test.ts` (24 passaram); `devolucao-de-tarefa.test.ts` (existe) | Baixo | CMP-59 | NÃO | Observação livre fora da trilha (minimização) |
| CMP-21 | API/CAMPO | Despacho | Devolução antes do prazo ou por risco imediato | D | `sincronizacao.ts:1204-1212` (`tarefa_no_prazo`); `devolucao.ts:no_prazo` | Médio | CMP-19 | SIM | Motivo `risco_para_a_equipe` só depois de vencida |
| CMP-22 | API/CAMPO | Saída a campo | Declarar, prorrogar, confirmar retorno, encerrar (API) | A | `saida-a-campo.ts:168-837`; `saida-a-campo.test.ts` 27 (passou); migração 031 | Baixo | n/a | NÃO | Relógio do servidor; sem botão de pânico, por desenho |
| CMP-23 | 2 CAMPO | Saída a campo | Declarar/prorrogar/confirmar a saída no aplicativo | D | Grep em `apps/campo/src`: zero chamadas; `CARTAO-DO-AGENTE.md` passo 2; `SEGURANCA-DO-AGENTE.md` §5; apresentação "Pronto" | Alto | CMP-24 | SIM | O cartão de bolso manda o agente usar um recurso que o app não tem. Auditoria de 30/09 listou "saída a campo" como implementada no app (discordo) |
| CMP-24 | WEB/CAMPO | Saída a campo | Tela "Quem está em campo" (painel) | C | `apps/web/src/paginas/QuemEstaEmCampo.tsx`; `http.ts:1186` | Médio | CMP-23 | NÃO | Sem declaração vinda do app, a tela fica vazia na prática |
| CMP-25 | 2 CAMPO | Vistoria | Rascunho gravado a cada toque, UPSERT | A | `rascunho.ts:salvarRascunho`; `tela-de-vistoria.test.tsx` (passou) | Médio | CMP-46 | NÃO | Morte do processo: relato no emulador |
| CMP-26 | 2 CAMPO | Vistoria | Conclusão em ordem (fila, lápide, rascunho) e conferência com esquema do servidor | A | `coleta.ts:concluirColetaEmOrdem`; `conferencia.ts`; `coleta.test.ts` (14 passaram); `vistoria/[id].tsx:1788` | Baixo | CMP-59 | NÃO | Nasceu da vistoria 000009/2026 |
| CMP-27 | 2 CAMPO | Vistoria | Lápide que impede segunda vistoria acidental | B | `coleta.ts`; `coletas.ts`; `banco-local.ts:333` apaga lápides no logout e mantém a fila; `vistoria/[id].tsx:1166-1169` decide só por rascunho e lápide | Médio | CMP-52 | NÃO | Duplicação possível depois de logout com fila cheia (lido, sem teste) |
| CMP-28 | 2 CAMPO | Vistoria | Corrigir a coleta recusada (volta a rascunho com a mesma chave) | A | `fila.ts:1153`; `correcao-da-coleta.test.ts` (21 passaram) | Baixo | CMP-61 | NÃO | Pedido do dono com o aparelho na mão (15/09) |
| CMP-29 | 2 CAMPO | Checklist | Checklist único fixo (6 itens, 4 obrigatórios) para todos os tipos | C | `shared/dominio.ts:306-312`; `schemas.ts:264` | Médio | spec VIS-05 | SIM | Spec pede por tipo e condicional; apresentação: "Feito diferente" |
| CMP-30 | 2 CAMPO | Vistoria | Órgãos a acionar (catálogo offline mais campo livre) | A | `pendencias.ts:orgaosGuardados`; `OrgaosParaAcionar.tsx`; `conclusao.ts`; `orgaos-indicados-na-vistoria.test.ts` (existe) | Baixo | CMP-14 | NÃO | Indicação, não providência formal |
| CMP-31 | 2 CAMPO | Vistoria | Contagem de pessoas atingidas (ausente = não contado) | A | `schemas.ts:298`; `rascunho.ts` (contagens como texto) | Baixo | n/a | NÃO | |
| CMP-32 | 2 CAMPO | GPS | Captura de GPS em primeiro plano, opcional | C | `vistoria/[id].tsx:1424-1452` | Médio | CMP-33 | NÃO | Sem anti-simulação; ponto único por vistoria |
| CMP-33 | 2 CAMPO | GPS | Precisão do GPS registrada e aceita pelo servidor | B | `:1447` arredonda 0,3 para 0; `schemas.ts:411` `positive()`; teste "abaixo de meio metro vira 1" FALHA | Médio | CMP-89 | NÃO | Agente com o melhor GPS fica sem poder concluir |
| CMP-34 | 2 CAMPO | GPS | Coordenada própria por foto | C | `vistoria/[id].tsx:1490-1512` (foto herda o último ponto da vistoria) | Baixo | CMP-32 | NÃO | |
| CMP-35 | 2 CAMPO | GPS | Permissão negada leva aos ajustes do aparelho | B | teste "a permissão negada" (2 falhas); botão só em `perfil.tsx` para notificações | Baixo | CMP-89 | NÃO | |
| CMP-36 | 2 CAMPO | Fotos | Captura e cópia para o diretório do app (não cache, não galeria) | A | `evidencia-no-disco.ts:guardarFotoNoAparelho`; `evidencia-no-disco.test.ts` (passou) | Médio | CMP-42 | NÃO | Defeito do `size` zerado achado no iPhone (relato) |
| CMP-37 | API/CAMPO | Fotos | Upload direto por URL pré-assinada, escrita única, confirmação com SHA-256 medido | A | `evidencias.ts:115-200, 210-514`; `campo-integracao.test.ts` (passou) | Baixo | storage (outra frente) | NÃO | O servidor lê o objeto inteiro (até 15 MB) para medir |
| CMP-38 | 2 CAMPO | Fotos | Retomada arquivo a arquivo e progresso gravado a cada foto | A | `fila.ts:661-812`; `fila.test.ts:1341,1382,1409` | Baixo | n/a | NÃO | |
| CMP-39 | 2 CAMPO | Fotos | Upload retomável no byte (spec VIS-04, RNF-08) | C | `transporte.ts:enviarBytes` (PUT único, 120 s); apresentação VIS-04 "Parcial" | Médio | n/a | SIM | Foto de 15 MB em 3G reinicia do zero |
| CMP-40 | 2 CAMPO | Fotos | Hash calculado no aparelho (integridade de ponta a ponta) | D | `evidencias.ts:61,138`: `sha256` declarado é opcional; o app não calcula | Médio | CMP-37 | SIM | Cadeia de custódia começa na chegada, não na captura |
| CMP-41 | 2 CAMPO | Fotos | Perda de arquivo declarada no laudo e na trilha, com consentimento do agente | A | `fila.ts:754-839,1061`; `sincronizacao.ts:215,705,902-922`; `prova-perdida.test.ts` (10) e API (passaram) | Baixo | CMP-46 | NÃO | FS real NÃO CONFIRMADO (PENDENCIAS §7). `PENDENCIAS.md` §2 está obsoleto |
| CMP-42 | 2 CAMPO | Fotos | Varredura de foto antiga no cache na abertura | D | PENDENCIAS §3; grep sem resultado | Médio | CMP-41 | NÃO | Aparelho atualizado com coleta antiga no cache |
| CMP-43 | 2 CAMPO | Assinatura | Assinatura no dedo, PNG no diretório do app, sobe com papel próprio | A | `ui/Assinatura.tsx`; `fila.test.ts:1480-1615` (passou) | Baixo | CMP-36 | NÃO | Traços só em estado React até confirmar |
| CMP-44 | API/CAMPO | Assinatura | Foto e assinatura obrigatórias também no servidor | C | `schemas.ts` (`fotos` sem mínimo, `assinaturaChave` nula); `conclusao.ts`; incidente de 09/09 | Médio | CMP-43 | SIM | Decisão documentada de não destruir coleta; regra só no formulário |
| CMP-45 | 2 CAMPO | Armazenamento | SQLite único, WAL, `busy_timeout` 5 s | A | `banco-local.ts:104`; defeito real achado no emulador (b37b00d) | Baixo | n/a | NÃO | Durabilidade sob kill: NÃO CONFIRMADO |
| CMP-46 | 2 CAMPO | Armazenamento | Guarda de espaço livre antes de capturar | D | Grep sem resultado | Médio | CMP-51 | NÃO | Aparelho de entrada vive cheio |
| CMP-47 | 2 CAMPO | Segurança local | Criptografia própria do banco e dos arquivos | D | `DECLARACAO-NAS-LOJAS.md:395-400`; `api.ts:Pendencia` traz contato e vulnerabilidade | Alto | CMP-05, CMP-49 | SIM | Depende só da criptografia do SO |
| CMP-48 | 2 CAMPO | Segurança local | Exclusão do diretório de dados do backup do iOS | G | `app.config.ts:398` cobre só `allowBackup` do Android | Médio | CMP-47 | SIM | Não confirmado |
| CMP-49 | 2 CAMPO | Segurança local | Wipe remoto ou revogação de dado local | D | Sem rota nem mecanismo; desativar usuário só derruba sessões (`administracao.ts:202-292`) | Alto | CMP-71 | SIM | Aparelho perdido mantém a lista e a fila |
| CMP-50 | 2 CAMPO | Limpeza | Limpeza no logout explícito (banco e arquivos não referenciados) | A | `banco-local.ts:286-372`; `logout-nao-apaga-prova.test.ts` (4 passaram) | Baixo | CMP-51 | NÃO | Preserva a fila por desenho |
| CMP-51 | 2 CAMPO | Limpeza | Limpeza de foto e assinatura depois da sincronização | D | Grep: nenhum `delete` após confirmação; só logout e remoção manual | Médio | CMP-50 | SIM | O agente não faz logout (comentário do código) |
| CMP-52 | 2 CAMPO | Logout | Diálogo de saída avisa que apaga rascunho e fotos | B | `perfil.tsx:534-539`; teste `dialogo-na-conta-com-vistoria-comecada` FALHA; comentário em `banco-local.ts` afirma o contrário | Alto | CMP-89 | NÃO | Perda silenciosa de vistoria em andamento |
| CMP-53 | 2 CAMPO | Troca de usuário | Entrada de outra pessoa apaga o dado da anterior | B | `banco-local.ts:252`; `sessao.tsx:180`; nenhum teste executa a função; referência a teste inexistente em `a-sessao-vencida...test.tsx:14` | Alto | CMP-56 | SIM | Também destrói, sem confirmação, o rascunho do colega |
| CMP-54 | 2 CAMPO | Troca de usuário | Autoria carimbada no item e portão no cliente e no servidor (409) | A | `fila.ts:85,462-482`; `sincronizacao.ts:460`; `autoria-da-coleta.test.ts` (passou); `fila.test.ts:503-757` | Baixo | n/a | NÃO | |
| CMP-55 | 2 CAMPO | Troca de usuário | Coleta sem autor (legado) assumida com o dedo | A | `fila.ts:1103`; `fila.test.ts:616-685` | Baixo | CMP-57 | NÃO | Removível quando não houver coleta legada (PENDENCIAS §5) |
| CMP-56 | 2 CAMPO | Troca de usuário | Fila do agente anterior no aparelho compartilhado (envelope em claro; qualquer um descarta) | C | `fila.ts:1184-1205`; `banco-local.ts:295-316` | Médio | CMP-53 | SIM | Descarte exige confirmação com o nome de quem coletou |
| CMP-57 | 2 CAMPO | Conflito | `autor_divergente` volta a andar quando a conta certa entra | B | PENDENCIAS §1 (aberto); `CODIGOS_SEM_DESTINO` só `ja_encerrada`; sem código que reative | Médio | CMP-54 | NÃO | Item fica `bloqueado` até toque manual |
| CMP-58 | 2 CAMPO | Conflito | Destino da coleta de agente que não volta (verbo da coordenação) | D | PENDENCIAS §4 | Médio | CMP-56 | SIM | Hoje só descartar |
| CMP-59 | 2 CAMPO | Fila | Fila persistente com estados, espera exponencial com ruído, dreno único | A | `packages/campo/src/fila.ts`; 58 + 15 testes (passaram) | Baixo | n/a | NÃO | Só nível (a,b,c) |
| CMP-60 | 2 CAMPO | Fila | Registro corrompido não é apagado em silêncio | B | `deposito.ts:110-119` remove a chave ilegível; `fila.test.ts:1056,1065` cimenta o comportamento | Médio | CMP-59 | NÃO | Deveria ir para quarentena |
| CMP-61 | API/CAMPO | Idempotência | Vistoria idempotente (chave do aparelho, UNIQUE, `ON CONFLICT DO NOTHING`, releitura) | A | `sincronizacao.ts:470-700`; `campo-integracao.test.ts`, `vistoria-em-corrida.test.ts` (passaram) | Baixo | n/a | NÃO | |
| CMP-62 | API/CAMPO | Idempotência | Evidência e devolução idempotentes | A | `evidencias.ts:238-285`; `sincronizacao.ts:1066-1252` | Baixo | n/a | NÃO | |
| CMP-63 | API/CAMPO | Conflito | Política append-only, "aceita e marca" (fora da equipe, sem despacho), encerrada arquiva | C | `sincronizacao.ts:546-577,925-955`; `fila.ts:42,937`; RN-06 | Médio | CMP-64 | SIM | Sem tela para a coordenação resolver além dos eventos na trilha |
| CMP-64 | 2 CAMPO | Conflito | Aditamento ou complemento de vistoria já enviada (VIS-08) | D | Sem rota nem tela; máquina de estados `dominio.ts:155-188` | Médio | CMP-93 | SIM | Correção só enquanto bloqueada na fila |
| CMP-65 | 2 CAMPO | Sincronização | Sincronização em segundo plano do SO | D | `_layout.tsx:186-198` (laço JS); `package.json` e `app.config.ts` sem task manager, sem `UIBackgroundModes` | Alto | CMP-66 | SIM | Celular bloqueado no bolso não sincroniza quando o sinal volta |
| CMP-66 | 2 CAMPO | Sincronização | Telas não prometem o que não existe | B | `vistoria/[id].tsx:2233`; `fila.tsx:1658,1787`; teste "não promete envio com o aplicativo fechado" FALHA | Médio | CMP-65 | NÃO | O teste descreve a própria ausência de segundo plano |
| CMP-67 | 2 CAMPO | Sessão | Sessão vencida não apaga dado; mesma pessoa reencontra tudo | A | `sessao.tsx:236`; `a-sessao-vencida-nao-apaga-a-vistoria.test.tsx` (passou) | Baixo | CMP-53 | NÃO | |
| CMP-68 | 2 CAMPO | Sessão | 401 na fila: retomada automática depois de novo login e frase própria | B | `transporte.ts` (401 permanente); `campo-integracao.test.ts:329`; `fila.tsx` sem tratamento de `nao_autenticado` | Médio | CMP-57 | NÃO | Coleta boa fica "precisa de atenção" até toque |
| CMP-69 | API/CAMPO | Sessão | Município suspenso: fila recebe 503 e espera | A | `servidor.ts:79,428`; `acesso-suspenso.test.ts` e `api-acesso-suspenso.test.ts` (existem) | Baixo | console (outra frente) | NÃO | |
| CMP-70 | API/CAMPO | Aparelho | Revogação da ficha de push (logout, varredor, rota) | A | `aparelhos.ts:185`; `push-aparelhos.test.ts` (21 passaram) | Baixo | CMP-72 | NÃO | Sem tela para desligar avisos |
| CMP-71 | API/CAMPO | Aparelho | Cadastro de aparelho, revogação de sessão por aparelho, MDM | D | Sessões por usuário (`administracao.ts:550`); acesso vale até 15 min | Médio | CMP-49 | SIM | Sem atestação de aparelho |
| CMP-72 | API/CAMPO | Push | Envio com vitrine sem PII, trava, idempotência no banco | A | `mensagem.ts`; `varredor.ts`; `push-aparelhos`, `despacho-avisa` (passaram) | Baixo | CMP-73 | NÃO | Dois tipos: `tarefa_nova`, `prazo_vencendo` |
| CMP-73 | API/CAMPO | Push | Entrega real em aparelho e push ligado em produção | G | Commit 063b0e8 (credenciais aceitas com ficha falsa); apresentação 15/09 "Pronto, desligado" | Alto | CMP-72 | NÃO | Estado de hoje desconhecido |
| CMP-74 | 2 CAMPO | Push | Aviso local de tarefa nova com o app aberto | A | `pendencias.ts:aoChegarTarefaNova`; `push/ProvedorDePush.tsx`; `tarefa-nova-avisa.test.ts` (existe) | Baixo | CMP-15 | NÃO | Tarefa que sai e volta para a mesma equipe não avisa de novo (limitação declarada) |
| CMP-75 | API/CAMPO | Push | Sino com cursor (criado_em, id) e 4 tipos | A | `avisos.ts`; `sino-de-avisos.test.ts` (existe) | Baixo | CMP-08 | NÃO | Só abre ao entrar no Perfil |
| CMP-76 | API/CAMPO | Push | Aviso de prazo vencido por push | D | `mensagem.ts:26` (só dois tipos); `prazo_vencido` só no sino | Médio | CMP-72 | NÃO | A auditoria de 30/09 marcou FLU-03 "Completo" (parcialmente discordo) |
| CMP-77 | 2 CAMPO | Erros | Frases em português com ação, classificação temporária ou permanente | A | `api.ts:40-110`; `transporte.ts`; `api-*.test.ts` (existem) | Baixo | n/a | NÃO | |
| CMP-78 | 2 CAMPO | Observabilidade | Relatório de falhas, telemetria, `ErrorBoundary`, versão mínima | D | Grep sem resultado em `src`, `package.json`, `app.config.ts` | Alto | n/a | SIM | Defeitos de 15/09 foram achados pelo dono, com o aparelho na mão |
| CMP-79 | 2 CAMPO | Histórico | Histórico da casa (vistoria anterior, providências, devolução, fotos) | C | `historico-da-casa.ts` (só com sinal, nunca estoura) | Baixo | CMP-96 | NÃO | Sem versão offline |
| CMP-80 | 2 CAMPO | Mapa | Mapa Google nativo ou plano esquemático; mapa offline | C | `ui/mapa/*`; apresentação: modo Google nunca rodou no aparelho | Médio | n/a | SIM | Sem tiles offline |
| CMP-81 | 2 CAMPO | Vistoria | Minuta do laudo lida antes de assinar | A | `ui/MinutaDoLaudo.tsx`; `shared/minuta.ts`; `minuta-nao-diverge.test.ts` (existe) | Baixo | n/a | NÃO | |
| CMP-82 | 2 CAMPO | Prova em aparelho | Android físico | G | Apresentação RNF-10: "nunca em aparelho"; PENDENCIAS §8 | Alto | n/a | SIM | O produto declara Android e iOS |
| CMP-83 | 2 CAMPO | Prova em aparelho | Emulador Android 16 (27/08) | G | Commit b37b00d; APK local 95.081.390 bytes (gitignored) | Médio | n/a | NÃO | Relato específico, sem log nem captura |
| CMP-84 | 2 CAMPO | Prova em aparelho | iPhone (instalação 08/09; vistoria 000009/2026 em 15/09) | G | `README.md:16`; apresentação; `evidencia-no-disco.ts:50-90`; `LEIA-ME.md:3` diz o contrário | Médio | n/a | SIM | Três versões divergentes (seção 7.1) |
| CMP-85 | 2 CAMPO | Prova em aparelho | CA-02: modo avião, GPS, 5 fotos, sincroniza sem duplicar | C | Apresentação: "Parcial"; lógica provada em (a,c) | Alto | CMP-84 | SIM | Auditoria de 30/09: "Completo" (discordo) |
| CMP-86 | 2 CAMPO | Prova em aparelho | Matar o app no meio do envio; reinício do aparelho com fila cheia | G | LEIA-ME passos 4 e 6 (pendentes); nenhuma evidência | Alto | CMP-85 | NÃO | |
| CMP-87 | 2 CAMPO | Qualidade | Suíte do app coerente com o fonte | B | 5 suítes, 20 testes falham (reproduzido); ver seção 7.4 | Médio | CMP-89 | NÃO | |
| CMP-88 | 2 CAMPO | Qualidade | Teste de `acolherNoAparelho`, `conectividade.ts` e `sair()` com banco real | D | Grep sem testes; `sessao.test.tsx` só cobre token | Médio | CMP-53 | NÃO | |
| CMP-89 | 2 CAMPO | Qualidade | Seis correções "provadas no aparelho em 15/09" presentes no fonte | B | `vistoria-o-teclado-a-camera-e-o-que-ela-promete.test.tsx` cabeçalho; `vistoria/[id].tsx` | Alto | CMP-33, CMP-35, CMP-52, CMP-66 | NÃO | Os testes foram commitados sem o conserto correspondente |
| CMP-90 | DOC | Documentação | Documentação do app consistente com o código | B | `LEIA-ME.md:3` (23/08); `PENDENCIAS.md` §2 obsoleto; `DECLARACAO-NAS-LOJAS.md:388-393` cita `revogarAparelho`, removida de `api.ts`; nenhum ADR da decisão nativo em vez de PWA | Médio | n/a | NÃO | |
| CMP-91 | 2 CAMPO | Distribuição | Política de versão: mínima, atualização forçada, OTA | D | `eas.json` sem `updates`; nenhum gate de versão na API | Médio | n/a | SIM | O app fala com a API em produção com formatos legados opcionais para sempre |
| CMP-92 | 2 CAMPO | Distribuição | Publicação nas lojas | G | `LOJAS.md`; apresentação: pendências de conta, Time Sensitive | Médio | n/a | SIM | Fora do que o código prova |
| CMP-93 | 2 CAMPO | V2 | Reinspeção ou nova vistoria pedida pela Defesa Civil depois do retorno do órgão | E | `dominio.ts:155-188`: `vistoria_concluida` só vai a `providencia_pendente` ou `encerrada`; `/pendencias` só lista `em_campo` | Alto | portal das secretarias | SIM | Hoje: "ocorrência nova vinculada" |
| CMP-94 | 2 CAMPO | V2 | Pedido de complemento ao agente | E | Inexistente | Médio | CMP-93, CMP-64 | SIM | |
| CMP-95 | 2 CAMPO | V2 | Avisos de retorno de órgão, complemento, reinspeção, relato convertido | E | Push tem 2 tipos; sino tem 4 | Médio | CMP-72, CMP-75 | SIM | |
| CMP-96 | 2 CAMPO | V2 | Agente acompanha providência e resposta de órgão em campo | E | Só `providencia_respondida` no sino e histórico online (CMP-79) | Médio | portal das secretarias | SIM | |
| CMP-97 | 2 CAMPO | V2 | Relato do cidadão triado aparece ao agente (com mídia do cidadão) | E | Hoje "Relato recebido" = texto do solicitante da ocorrência (`vistoria/[id].tsx:2740`) | Alto | app do cidadão | SIM | Minimização e conversão em ocorrência |
| CMP-98 | 2 CAMPO | V2 | Sincronização de tarefas de múltiplas origens com delta e cursor | E | Pull completo limitado a 200 (`sincronizacao.ts:39`) | Médio | CMP-13 | SIM | |
| CMP-99 | 2 CAMPO | V2 | Um app ou vários (agente, cidadão, órgãos); reuso do motor offline | E | Motor é TypeScript puro (`packages/campo`); app fora do `workspaces` | Médio | decisão de produto | SIM | |
| CMP-100 | 2 CAMPO | Privacidade | Dado pessoal na lista do aparelho (nome, contato, vulnerabilidade) em claro | C | `api.ts:Pendencia`; `PRIVACIDADE.md:62-80` declara o motivo | Alto | CMP-47, CMP-51 | SIM | Sem retenção local por idade |

---

## Fluxos

### Defesa Civil -> Agente

| FLUXO | PASSO | ESTADO (EXISTE/PARCIAL/AUSENTE/NOVO V2) | EVIDÊNCIA |
| --- | --- | --- | --- |
| Defesa Civil -> Agente | 1. Coordenador despacha equipe, com prazo em horas e instruções | EXISTE | `ocorrencias.ts:801-880`; `despachoSchema` (`schemas.ts:154`); despacho é por EQUIPE, não por pessoa |
| Defesa Civil -> Agente | 2. Ocorrência passa a `em_campo` com `equipe_id`; `prazo_em` por severidade não é alterado | EXISTE | `ocorrencias.ts:848-870`; `prazo-do-despacho.test.ts` (existe) |
| Defesa Civil -> Agente | 3. A tarefa aparece no app | EXISTE (pull, só com app aberto) | `GET /sincronizacao/pendencias` (`sincronizacao.ts:1521`); atualização por idade (`atualizacao.ts`); cópia local; nível (a,b,c), aparelho NÃO CONFIRMADO |
| Defesa Civil -> Agente | 4. Aviso de tarefa nova com o app fechado (push) | PARCIAL | Enfileirado na transação do despacho e enviado pelo varredor (`ocorrencias.ts:877-930`; `despacho-avisa.test.ts` passou); credenciais aceitas por Apple e Google com ficha falsa (13/09); "Pronto, desligado" em 15/09; entrega real NÃO CONFIRMADA |
| Defesa Civil -> Agente | 5. Aviso de tarefa nova com o app aberto | EXISTE | Comparação de listas e aviso local (`pendencias.ts:aoChegarTarefaNova`, `ProvedorDePush.tsx`); teste existe, não executado |
| Defesa Civil -> Agente | 6. Prazo visível na tarefa e contagem regressiva | PARCIAL | `prazo.ts:quantoFalta` mostra o prazo da ocorrência por severidade; `prazoHoras` do despacho não chega (`ocorrencias.ts:870-874`) |
| Defesa Civil -> Agente | 7. Aviso de prazo vencendo | PARCIAL | Push `prazo_vencendo` (`mensagem.ts:26`, `varredor.ts`); `prazo_vencido` só no sino (pull no Perfil) |
| Defesa Civil -> Agente | 8. Instruções escritas no despacho chegam ao agente | AUSENTE | Só na trilha (`ocorrencias.ts:873`); `Pendencia` e `/pendencias` não as trazem |
| Defesa Civil -> Agente | 9. Agente aceita ou recusa a tarefa | AUSENTE | Apresentação OCO-06; nenhuma rota |
| Defesa Civil -> Agente | 10. Agente consulta o que já houve na casa (vistoria, providências, devolução, fotos) | PARCIAL | `historico-da-casa.ts`; só com sinal; recortado à equipe (`recorte-do-agente.ts`) |
| Defesa Civil -> Agente | 11. Ocorrência encerrada, redespachada ou concluída por colega enquanto o agente está offline | EXISTE | Reconciliação (`sincronizacao.ts:1389`); coleta vira `arquivada` (`fila.ts:937`); `reconciliar-pendencias.test.ts` passou |
| Defesa Civil -> Agente | 12. Resposta do órgão a uma providência avisa o agente | PARCIAL | Tipo `providencia_respondida` no sino (pull, município inteiro, CMP-08) |
| Defesa Civil -> Agente | 13. Coordenação pede complemento ou reinspeção depois da vistoria | AUSENTE / NOVO V2 | Sem transição `vistoria_concluida -> em_campo` (`dominio.ts:155-188`) |
| Defesa Civil -> Agente | 14. Tarefa vinda do portal das secretarias ou de relato do cidadão | NOVO V2 | Superfícies 4 e 5 não existem na frente de campo |

### Agente -> Defesa Civil

| FLUXO | PASSO | ESTADO (EXISTE/PARCIAL/AUSENTE/NOVO V2) | EVIDÊNCIA |
| --- | --- | --- | --- |
| Agente -> Defesa Civil | 1. Vistoria offline: checklist, pessoas, órgãos a acionar, GPS, fotos, assinatura, observações | EXISTE (com os defeitos de CMP-33, CMP-35, CMP-89) | `vistoria/[id].tsx`; `rascunho.ts`; `conclusao.ts`; `tela-de-vistoria.test.tsx` passou |
| Agente -> Defesa Civil | 2. Conclusão: conferência com o esquema do servidor, fila, lápide, rascunho | EXISTE | `conferencia.ts`; `coleta.ts:concluirColetaEmOrdem`; `coleta.test.ts` (14) passou |
| Agente -> Defesa Civil | 3. Sincronização quando volta o sinal | PARCIAL | Só com o app aberto (`_layout.tsx:186-198`); `fila.test.ts` (58) e integração (10) passaram |
| Agente -> Defesa Civil | 4. Evidências: URL pré-assinada, PUT direto, confirmação, SHA-256 do servidor | EXISTE | `evidencias.ts:210-514`; `campo-integracao.test.ts` passou |
| Agente -> Defesa Civil | 5. Vistoria chega: laudo com duas marcas de tempo, trilha, sem duplicar | EXISTE | `sincronizacao.ts:426-977`; "dez vezes vira um laudo só" passou |
| Agente -> Defesa Civil | 6. Arquivo perdido: sobe com a perda declarada | EXISTE | `fila.ts:1061`; `sincronizacao.ts:902-922`; `prova-perdida.test.ts` passou; FS real NÃO CONFIRMADO |
| Agente -> Defesa Civil | 7. Vistoria recusada pelo servidor: corrigir e reenviar com a mesma chave | EXISTE | `fila.ts:1153`; `correcao-da-coleta.test.ts` (21) passou |
| Agente -> Defesa Civil | 8. Devolução de tarefa vencida com motivo | EXISTE (só depois do prazo, relógio do servidor) | `sincronizacao.ts:1016-1364`; `devolucao.test.ts` (24) passou |
| Agente -> Defesa Civil | 9. Saída a campo: declarar, prorrogar, confirmar retorno | AUSENTE no app (API e painel EXISTEM) | Zero chamadas em `apps/campo/src`; `saida-a-campo.ts`; `saida-a-campo.test.ts` (27) passou |
| Agente -> Defesa Civil | 10. Indicar órgãos a acionar (proposta de providência) | PARCIAL | Indicação no laudo (`orgaosParaAcionar`); providência formal é da coordenação |
| Agente -> Defesa Civil | 11. Complemento de vistoria já enviada | AUSENTE | VIS-08 sem implementação |
| Agente -> Defesa Civil | 12. Abrir ocorrência a partir do campo | AUSENTE | `agente_campo` só tem `registrar_vistoria` (`permissoes.ts:80`); coleta em ocorrência sem despacho é aceita e marcada (`sincronizacao.ts:576`) |
| Agente -> Defesa Civil | 13. Receber o retorno da coordenação (aceite, complemento, reinspeção) | AUSENTE / NOVO V2 | Só `vistoria_recebida` no sino |
| Agente -> Defesa Civil | 14. Coordenação vê quem está em campo | PARCIAL | Painel existe; depende da declaração que o app não faz (CMP-23) |
| Agente -> Defesa Civil | 15. Agente convive com o portal das secretarias e com relatos do cidadão | NOVO V2 | Ver Decisões humanas 1 a 4 |

---

## Gaps

- **G01. P0 INTEGRIDADE.** Sair da conta apaga em silêncio a vistoria começada (rascunho, fotos, assinatura não enfileiradas): `sessao.tsx:190-235`, `banco-local.ts:286-372`; o diálogo só conta itens da fila (`perfil.tsx:534-539`) e o teste que exige o aviso falha; o comentário de `banco-local.ts` afirma que o diálogo avisa. CMP-52.
- **G02. P0 INTEGRIDADE.** Correções de 15/09 ausentes do fonte e já cobertas por teste que falha: precisão de GPS abaixo de 0,5 m vira 0 e o servidor recusa com 422 (`vistoria/[id].tsx:1447`, `schemas.ts:411`); mensagem de foto vazia engolida; teclado e câmera sem área segura; permissão sem botão de ajustes. CMP-33, CMP-35, CMP-89.
- **G03. P1 OPERAÇÃO.** A tela promete envio "mesmo com o aplicativo fechado" e "em segundo plano" e o app só sincroniza aberto; nenhum mecanismo de segundo plano do SO. `vistoria/[id].tsx:2233`, `fila.tsx:1658,1787`, `_layout.tsx:186-198`. CMP-65, CMP-66.
- **G04. P1 PRODUTO.** Saída a campo sem cliente no aplicativo, com cartão de bolso, guia e apresentação afirmando que existe. A orientação operacional manda usar recurso inexistente e o painel "Quem está em campo" fica vazio. CMP-23, CMP-24.
- **G05. P1 OPERAÇÃO.** Troca de pessoa no aparelho (`acolherNoAparelho`) sem nenhum teste, com comentário apontando para teste que nunca existiu, e com destruição silenciosa do rascunho do colega. CMP-53, CMP-88.
- **G06. P1 OPERAÇÃO.** Logout apaga as lápides e mantém a fila; a abertura da vistoria só consulta rascunho e lápide, não a fila: pode nascer segunda vistoria com chave nova para a mesma ocorrência (lido, não reproduzido). `banco-local.ts:333`, `vistoria/[id].tsx:1166-1169`. CMP-27.
- **G07. P1 OPERAÇÃO.** Item da fila que recebe 401 vira `bloqueado` e não volta sozinho depois de novo login; o agente lê a frase crua do servidor. `transporte.ts`, `campo-integracao.test.ts:329`, `fila.tsx`. CMP-68. Mesma família: `autor_divergente` (PENDENCIAS §1). CMP-57.
- **G08. P1 OPERAÇÃO.** Sem limpeza de foto e assinatura depois de sincronizar, sem guarda de espaço livre, e o agente não faz logout: acúmulo de imagens de imóveis e de assinaturas no aparelho até lotar. CMP-46, CMP-51.
- **G09. A DEFINIR.** Sem criptografia local própria, sem wipe remoto, sem bloqueio local, exclusão de backup do iOS não confirmada; a lista traz contato e descrição de vulnerabilidade de saúde em claro. Depende de decisão de ameaça (aparelho institucional ou pessoal; MDM). CMP-05, CMP-47, CMP-48, CMP-49, CMP-100.
- **G10. A DEFINIR.** Sino sem recorte de equipe (`avisos.ts:395-411`) e autorização de upload de evidência sem recorte de equipe (`evidencias.ts:288-303`): contradizem a promessa de que o agente só vê a equipe dele; o sino é "sem `exigirPermissao`" por desenho. CMP-08, CMP-09, CMP-10.
- **G11. A DEFINIR.** Foto e assinatura obrigatórias só no cliente; o servidor aceita `fotos: []` e `assinaturaChave` nula, e três vistorias reais do piloto chegaram sem assinatura. A decisão de não destruir coleta está escrita; a regra de negócio fica só no formulário, contra o `CLAUDE.md`. CMP-44.
- **G12. P1 OPERAÇÃO.** Prova em aparelho inexistente como artefato: CA-02 "Parcial", Android físico nunca, matar no envio e reinício do aparelho nunca, push real nunca. CMP-82 a CMP-86.
- **G13. P1 OPERAÇÃO.** Push desligado em produção em 15/09 (chave no servidor e capacidade Time Sensitive); estado de hoje desconhecido. O despacho não avisa com o app fechado. CMP-73.
- **G14. P1 OPERAÇÃO.** Sem observabilidade do cliente (relatório de falhas, telemetria, `ErrorBoundary`, versão mínima): o único detector de defeito de campo hoje é o dono com o aparelho na mão. CMP-78, CMP-91.
- **G15. P1 OPERAÇÃO.** Registro de fila ilegível é apagado em silêncio (`deposito.ts:118`): uma vistoria pode sumir sem rastro, em vez de ir para quarentena. CMP-60.
- **G16. P1 PRODUTO.** Instruções do despacho e `prazoHoras` digitados pela coordenação nunca chegam ao agente; não há aceite. CMP-17, CMP-18, CMP-19.
- **G17. P1 OPERAÇÃO.** Agente sem equipe perde o histórico (`campo.ts:62-70`, PENDENCIAS §11, correção de uma linha ainda não feita). CMP-12.
- **G18. P1 PRODUTO.** Checklist único e fixo (spec VIS-05 pede por tipo e condicional); sem aditamento (VIS-08); sem mapa offline. CMP-29, CMP-64, CMP-80.
- **G19. A DEFINIR.** Segundo fator: servidor permite ativar para qualquer papel e o app não tem tela de código. CMP-04. Lido, não reproduzido.
- **G20. P2 EVOLUÇÃO.** Upload não retomável no byte; sem hash calculado no aparelho (cadeia de custódia); servidor lê o objeto inteiro para medir o SHA-256; pull completo da lista sem delta. CMP-39, CMP-40, CMP-98.
- **G21. P2 EVOLUÇÃO.** Documentação do app diverge do código (LEIA-ME, PENDENCIAS §2, DECLARACAO-NAS-LOJAS, referência a teste inexistente) e não há ADR da decisão nativo em vez de PWA. CMP-90.
- **G22. A DEFINIR.** Aparelho de plantão compartilhado: a fila do agente anterior (envelope em claro) permanece e qualquer pessoa pode descartar coleta alheia; coleta de agente que não volta só tem saída destrutiva. CMP-56, CMP-58.

---

## Decisões humanas

Regra: não escolho. Cada decisão traz pergunta, por que importa, o que bloqueia, alternativas e risco de cada uma.

### 1. Como o agente de campo convive com o portal das secretarias e de órgãos (V2)

- Pergunta: o agente da Defesa Civil passa a ver e agir sobre providências que estão com as secretarias (status, aceite, devolução, resposta)? Ou o app do agente só recebe o resultado final (retorno consolidado) e todo o acompanhamento fica na web da Defesa Civil?
- Por que importa: hoje o app mostra o histórico da casa só com sinal e só como leitura (`historico-da-casa.ts`), e o sino traz `providencia_respondida` para o município inteiro. Se o agente é quem decide reinspecionar, ele precisa da resposta do órgão no aparelho e offline.
- O que bloqueia: desenho de tarefas de retorno, tipos de aviso novos, recorte de dados por órgão, escopo do que desce ao aparelho.
- Alternativas: (A) agente só lê histórico online, como hoje; (B) resposta de órgão vira item baixável e offline no aparelho; (C) o agente nunca lida com órgãos, a coordenação é intermediária e cria nova tarefa.
- Riscos: A deixa o agente na porta sem saber a resposta do órgão; B aumenta dado pessoal e volume no aparelho e exige delta e reconciliação; C concentra carga na coordenação e depende de despacho manual por reinspeção.

### 2. O relato do cidadão no aparelho do agente (V2)

- Pergunta: o que do relato do cidadão (texto, fotos, coordenada, contato, histórico) desce ao aparelho do agente, e em que momento (depois da conversão em ocorrência oficial apenas, ou também durante a triagem)?
- Por que importa: hoje "Relato recebido" é o texto do solicitante da ocorrência e desce com nome, contato e vulnerabilidade (`api.ts:Pendencia`, `PRIVACIDADE.md:62-80`). Mídia do cidadão aumentaria dado pessoal e peso offline.
- O que bloqueia: modelo de conversão relato -> ocorrência, minimização no aparelho, política de retenção local.
- Alternativas: (A) só ocorrência convertida, com os mesmos campos de hoje; (B) mídia do cidadão como anexo baixável; (C) agente pode pedir complemento ao cidadão pelo aparelho.
- Riscos: A perde contexto visual que ajudaria a priorizar; B eleva exposição de dado em aparelho sem criptografia própria; C abre canal de comunicação direta que exige regra de contato e auditoria.

### 3. Reinspeção e pedido de complemento: como chegam ao agente (V2)

- Pergunta: a Defesa Civil abre nova vistoria na mesma ocorrência (nova aresta na máquina de estados) ou sempre como ocorrência nova vinculada? O agente responde a um pedido de complemento dentro da vistoria existente (aditamento versionado) ou com nova vistoria?
- Por que importa: `vistoria_concluida` só vai a `providencia_pendente` ou `encerrada` (`dominio.ts:155-188`), o app só lista `em_campo`, e VIS-08 (aditamento) não existe. É o fluxo central da V2 do lado da Defesa Civil.
- O que bloqueia: máquina de estados, laudo versionado, listagem de tarefas do app, regras de autoria.
- Alternativas: (A) ocorrência vinculada nova; (B) aresta de volta a `em_campo` com motivo; (C) aditamento versionado da vistoria com justificativa.
- Riscos: A fragmenta o histórico e multiplica protocolos; B quebra a propriedade "toda para frente" que o projeto protege e exige rever prazo e indicadores; C exige versionamento do documento oficial e cuidado com a trilha append-only.

### 4. Um app ou vários (agente, cidadão, órgãos) e o que se reaproveita do motor offline (V2)

- Pergunta: o agente e o servidor de órgão usam o mesmo app com papéis diferentes, ou apps separados? O app do cidadão reaproveita `packages/campo` (fila, idempotência) ou nasce independente?
- Por que importa: o motor é TypeScript puro e testado, o app do agente está fora do `workspaces` com lockfile próprio, e a decisão de ser React Native nativo já foi tomada.
- O que bloqueia: estrutura do monorepo, distribuição (lojas, MDM), modelo de autenticação de cada público.
- Alternativas: (A) app único com papéis; (B) apps separados com motor compartilhado; (C) apps separados sem compartilhamento.
- Riscos: A mistura superfícies de risco e aprovações de loja diferentes; B exige versionar o pacote comum com cuidado; C duplica a parte mais cara de errar (fila e idempotência).

### 5. Quanto offline a V2 exige, e sincronização em segundo plano

- Pergunta: por quanto tempo, e com quais volumes, o agente precisa ficar offline, e a sincronização deve ocorrer com o app fechado ou bloqueado?
- Por que importa: a pergunta original da especificação ("quais áreas não têm sinal e por quanto tempo") continua aberta; hoje só se sincroniza com o app aberto, e a tela promete o contrário.
- O que bloqueia: decisão de implementar `expo-task-manager` ou equivalente, capacidades de plataforma, consumo de bateria, e a frase da tela.
- Alternativas: (A) manter foreground e corrigir o texto; (B) segundo plano oportunista (janela do SO, sem garantia); (C) serviço em primeiro plano no Android e modo equivalente no iOS.
- Riscos: A deixa coleta parada com o celular no bolso; B não dá garantia e pode ser morto pelo SO; C aumenta complexidade, permissões e revisão de loja.

### 6. Proteção do dado no aparelho

- Pergunta: o aparelho é institucional (com MDM) ou pessoal? A proteção é a do SO, ou exige criptografia própria (por exemplo SQLCipher), bloqueio local do app, exclusão de backup, wipe remoto e retenção local depois da sincronização?
- Por que importa: lista e fila carregam nome, contato, vulnerabilidade de saúde, fotos de imóveis e assinaturas em claro; `DECLARACAO-NAS-LOJAS.md` admite a ausência; o agente não faz logout, então nada sai sozinho.
- O que bloqueia: escolha de biblioteca, política de retenção, requisitos de contrato com o município, declaração de dados nas lojas.
- Alternativas: (A) confiar no SO e documentar; (B) criptografia própria mais limpeza pós-sincronização; (C) B mais MDM e wipe remoto.
- Riscos: A deixa exposição em aparelho perdido ou compartilhado; B custa desempenho e migração de dados gravados; C depende de infraestrutura que o município pode não ter.

### 7. Saída a campo: implementar no app ou retirar das instruções

- Pergunta: o município quer a declaração de saída no aplicativo (a API já existe), ou o procedimento ficará fora do sistema até decisão posterior?
- Por que importa: o cartão de bolso, o guia e a apresentação dizem que o agente declara no app; hoje isso é falso e o agente pode agir contando com cobertura que não existe.
- O que bloqueia: tela e fluxo no app, procedimento escrito do município, texto das lojas e da apresentação.
- Alternativas: (A) implementar e manter os textos; (B) corrigir os textos e deixar a API sem cliente; (C) implementar com lembrete e prorrogação automática por sinal.
- Riscos: A e C criam expectativa de socorro que o produto declara não cumprir, se mal comunicadas; B remove o único mecanismo de aviso de retorno e mantém o painel vazio.

### 8. Aceite, recusa e devolução antes do prazo

- Pergunta: o agente deve aceitar ou recusar a tarefa explicitamente e poder devolvê-la antes do prazo quando houver risco?
- Por que importa: hoje "quem baixou a lista está ciente" e a devolução só é aceita depois do prazo vencer (`sincronizacao.ts:1204-1212`), inclusive por `risco_para_a_equipe`.
- O que bloqueia: máquina de estados, indicador de atrasadas, responsabilidade por tarefa.
- Alternativas: (A) manter; (B) aceite explícito; (C) devolução imediata por motivos de segurança.
- Riscos: A mantém o agente preso a tarefa que oferece risco até vencer; B cria novo estado e tarefa "não aceita" que envelhece; C abre caminho para esvaziar a lista sem trabalho feito (que o portão do prazo hoje impede).

### 9. Cadeia de custódia da evidência e obrigatoriedade no servidor

- Pergunta: a evidência precisa de hash calculado no aparelho na captura, e foto e assinatura passam a ser obrigatórias também no servidor?
- Por que importa: o SHA-256 só é medido depois que os bytes chegam (`evidencias.ts:138`), e o servidor aceita vistoria sem foto e sem assinatura para não destruir coleta antiga.
- O que bloqueia: contrato do envelope, compatibilidade com aparelhos em campo, valor probatório do laudo.
- Alternativas: (A) manter; (B) hash no aparelho declarado e comparado; (C) B mais obrigatoriedade no servidor com versão mínima do app.
- Riscos: A mantém a prova sem âncora na captura; B exige recalcular sobre arquivos já gravados; C quebra aparelhos que não atualizaram.

### 10. Coleta de agente que saiu e aparelho compartilhado

- Pergunta: como a coordenação recebe uma coleta cujo autor não entra mais no aparelho, e o agente seguinte pode descartar coleta alheia?
- Por que importa: hoje a única saída é descartar (destrutiva), PENDENCIAS §4 admite que falta o verbo, e o aparelho guarda envelope com observações em claro.
- O que bloqueia: verbo de coordenação, regra de autoria, política de descarte.
- Alternativas: (A) manter; (B) coordenação assume autoria com motivo e trilha; (C) proibir descarte de coleta alheia.
- Riscos: A perde vistoria feita; B altera o nome no laudo, que a trilha append-only não corrige; C trava o aparelho com item que ninguém consegue zerar.

### 11. Recorte de equipe no sino e no upload de evidência

- Pergunta: o agente deve ver no sino só avisos da equipe dele, e só poder anexar evidência a ocorrência da equipe dele?
- Por que importa: a promessa em `PAPEIS_E_RESPONSABILIDADES.md` é que o agente não vê a fila do município; hoje o sino vaza protocolo e tipo de outras equipes e o upload não confere equipe.
- O que bloqueia: migração dos avisos com equipe, regra de "aceita e marca" para evidência.
- Alternativas: (A) manter e ajustar o texto; (B) recorte por equipe nas duas rotas; (C) recorte no sino e "aceita e marca" no upload.
- Riscos: A mantém exposição interna; B pode esconder aviso legítimo de redespacho; C aumenta a superfície de eventos na trilha.

### 12. Versão mínima, atualização e distribuição

- Pergunta: como se garante que o parque de aparelhos fala o formato atual da API, e como se distribui o app (lojas, distribuição interna, MDM)?
- Por que importa: campos opcionais existem para sempre por compatibilidade (`coletadaPor`, `orgaosParaAcionar`, `evidenciasPerdidas`); não há versão mínima nem OTA; a publicação nas lojas depende de contas e capacidades ainda pendentes.
- O que bloqueia: endurecimento de contratos, decisão de loja, ciclo de release.
- Alternativas: (A) manter opcionais indefinidamente; (B) versão mínima com bloqueio educado; (C) OTA para JS e binário para nativo.
- Riscos: A acumula ambiguidade; B pode travar agente em campo sem sinal para atualizar; C exige disciplina de compatibilidade entre JS e módulos nativos (o projeto já foi mordido por isso, `LEIA-ME.md`).

### 13. Critério de aceite de prova em aparelho

- Pergunta: o relato datado em commit e apresentação basta como prova de aparelho, ou o critério exige artefato (captura, log, vídeo por etapa) e aparelho Android físico antes da V2?
- Por que importa: a própria apresentação deixa CA-02 "Parcial"; LEIA-ME e README divergem; 20 testes do app falham no HEAD.
- O que bloqueia: declarar o offline pronto, submissão às lojas, confiança do município.
- Alternativas: (A) aceitar relato; (B) roteiro de prova com captura em iPhone e Android; (C) B mais ambiente de teste contínuo em nuvem de aparelhos.
- Riscos: A seguirá com defeitos que só o aparelho acha (já aconteceram dois); B consome tempo de quem segura o aparelho; C tem custo recorrente.

### 14. Tarefa por equipe ou por pessoa

- Pergunta: a V2 mantém o despacho por equipe, ou passa a atribuir tarefa a uma pessoa (responsável), em especial quando órgãos e cidadãos entram no fluxo?
- Por que importa: hoje todo membro da equipe vê a tarefa, qualquer um coleta, a devolução de um colega é tratada como "duplicada", e a autoria do laudo é de quem coletou.
- O que bloqueia: modelo de dados de atribuição, avisos por pessoa, indicadores.
- Alternativas: (A) equipe; (B) pessoa; (C) equipe com responsável designado.
- Riscos: A deixa responsabilidade difusa; B cria tarefa órfã quando a pessoa some; C exige UI de designação e regra de substituição.

---

## Riscos arquiteturais

1. O motor offline vive no laço JavaScript do app em primeiro plano; sem tarefa do SO, a garantia "não perde nem duplica" é sobre o que já está na fila, não sobre quando chega ao servidor.
2. A fila guarda o envelope como JSON opaco num KV sobre SQLite. A compatibilidade com coleta gravada por versões anteriores vive em `normalizar()` e em campos opcionais que nunca poderão virar obrigatórios enquanto houver aparelho antigo; cada mudança de contrato acrescenta dívida.
3. A lista de tarefas é substituída por inteiro a cada atualização (teto 200) e a reconciliação pergunta no máximo 200 ids; a V2 com mais origens de tarefa não escala nesse desenho sem delta e cursor.
4. O aparelho não tem identidade própria para o servidor (sem atestação, sem cadastro, sessão por usuário): roubo do refresh token fora do aparelho só é detectado pela rotação com detecção de reuso.
5. A integridade da evidência começa na chegada ao servidor, não na captura; um arquivo trocado no aparelho antes do upload não é detectável.
6. Regra de negócio espalhada entre `packages/campo` (conclusão, devolução) e o pacote compartilhado: obrigatoriedade de foto e assinatura só existe no cliente.
7. O app está fora do `workspaces` (lockfile e auditoria próprios); mudanças no motor e no compartilhado chegam por `file:` e dependem de `dist` compilado que não é versionado.
8. Três telas concentram a maior parte do comportamento e dos comentários de decisão (`vistoria/[id].tsx` 3748 linhas, `fila.tsx` 1931, `index.tsx` 1761): o conhecimento do produto mora em comentários e a suíte diverge do fonte.
9. Duas fontes de "tarefa" (lista em disco e rede) e três de "coleta" (rascunho, lápide, fila) precisam concordar; o logout quebra essa concordância (CMP-27).
10. O mapa do Google e o push dependem de contas e chaves de fornecedor ainda pendentes, e o modo Google nunca rodou no aparelho.

---

## Dívidas técnicas

1. 5 suítes e 20 testes do app falham no HEAD (reproduzido): seis correções ausentes do fonte e testes desatualizados em relação à mudança deliberada do texto de sessão vencida; `logout-cala-o-aparelho.test.tsx` mocka `banco-local` sem `acolherNoAparelho`.
2. Teste inexistente citado como prova: `dados/sessao-vencida-nao-apaga.test.tsx`, referido em `a-sessao-vencida-nao-apaga-a-vistoria.test.tsx:14` e nunca presente no histórico do git.
3. Sem testes para `acolherNoAparelho`, `marcarDonoDosDadosLocais`, `conectividade.ts` e para `sair()` com banco real (`sessao.test.tsx` só prova token; o `sair()` ali estoura no banco e engole o erro).
4. `deposito.ts:110-119` apaga registro ilegível em vez de isolar, e `fila.test.ts:1056,1065` cimenta isso.
5. `LEIA-ME.md:3` (23/08) contradiz o README e o histórico; `PENDENCIAS.md` §2 descreve como não feito o que está feito e §1, §3, §11 continuam abertos (confirmei §1, §3 e §11 no código); `DECLARACAO-NAS-LOJAS.md` cita `revogarAparelho`, removida de `api.ts`; nenhum ADR para a decisão nativo em vez de PWA.
6. Comentários do código descrevem comportamento que o fonte não tem (diálogo de saída que "conta os rascunhos").
7. `dist` de `packages/campo` não é versionado e o app resolve o pacote por `file:`: um `dist` velho muda o comportamento do app sem mudança de fonte.
8. `Pendencia` e `meu-trabalho` carregam dado pessoal em claro sem retenção local por idade.
9. Mistura de nomes e cópias: `transporte.ts` tem duas implementações de envio (`enviar` separada de `chamar`), apesar do comentário dizer que a cópia foi removida.
10. Correção de uma linha conhecida e não feita: `campo.ts:62-70` (agente sem equipe).
