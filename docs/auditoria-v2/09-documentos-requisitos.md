# 09. Documentos oficiais (seção 17) e revalidação dos requisitos do documento do Alyson

Auditoria somente leitura. Repositório C:\Projetos\city-hall, HEAD e82719e (árvore limpa exceto docs/AUDITORIA-2026-09-30.md). Todo caminho abaixo é relativo a C:\Projetos\city-hall\dc360, salvo quando indicado. Executei apenas dois arquivos de teste pontuais (ver "O que executei"); os números oficiais de suíte são do agente de baseline.

## Resumo

- O documento oficial (laudo, termo de interdição, termo de desinterdição, ofício) é GERADO SOB DEMANDA a partir do estado atual do banco e nunca é guardado: nem HTML, nem PDF, nem hash do conteúdo, nem versão do modelo. Evidência: apps/api/src/rotas/documentos.ts:53-280 e 845-849, migração 017:351-354.
- O que existe é um REGISTRO DE EMISSÃO: uma linha na trilha por par (documento, vistoria), só a primeira emissão (trilha.ts:72-95, migração 009:104-111), mais um registro de acesso a cada abertura (documentos.ts:698-703). Ele diz quem, quando e de qual vistoria; não diz qual conteúdo saiu.
- O "identificador da emissão" é sha256 truncado a 12 hex de (documento, protocolo, vistoria, instante). Identifica o ato, não o conteúdo (laudo.ts:257-273). A conferência (GET /documentos/validar/:codigo) exige login, vale só dentro do município, varre a trilha e NÃO tem tela nem QR (documentos.ts:877-938).
- O laudo emitido hoje NÃO é o mesmo amanhã: nova vistoria, coordenada corrigida, foto avulsa, renomeação de agente ou equipe, minimização por prazo e qualquer deploy do modelo alteram a reimpressão. O sistema só deixa rastro de UM desses casos (correção de coordenada, flag documentoJaEmitido).
- Não existe revisão, aprovação, responsável técnico, cargo/registro profissional, assinatura digital, cancelamento, substituição nem arquivamento de documento. DOC-04 do Alyson: AUSENTE (nenhum estado, tabela ou papel em migrações, API ou shared).
- Produção (fly.toml:69) roda com marca d'água "DOCUMENTO DE VALIDAÇÃO": por configuração do repositório, os documentos ainda não "valem".
- Causa do laudo divergente no pacote de saída: há DOIS montadores do mesmo modelo. apps/api/src/saida/pacote.ts:479-494 faz a própria consulta de vistoria e nunca juntou as duas equipes (as junções de documentos.ts:103-118 não existem lá, em nenhum dos 10 commits que tocaram o arquivo). Não é regressão: o teste foi escrito em 5ecdf4c sem o conserto. Há mais quatro divergências latentes no mesmo caminho (seção 1.4).
- Revalidação dos 83 requisitos/regras/RNF/CA: J) 14 atendidos, K) 41 parciais, L) 8 não atendidos + 8 NÃO CONFIRMADOS, 12 de fase futura (mais RN-08/RN-09). Corrigi a auditoria de 30/09 para MAIS (rota de correção de coordenada existe e o teste passa 13/13; teto de 6 casas existe no esquema e no banco) e para MENOS (16 linhas marcadas "Completo" têm lacuna nomeada).
- Decisões que só o Rafael/jurídico tomam: congelar ou regenerar documento; quem aprova e assina; assinatura eletrônica; validação por terceiros; retenção de documento versus minimização LGPD; retirar a marca d'água.

## O que executei

- `npx vitest run test/saida-de-municipio.test.ts` (apps/api): 18 passaram, 1 falhou (saida-de-municipio.test.ts:367, "estava designada à Equipe Alfa" ausente do laudo do pacote). Confirma a causa da seção 1.3.
- `npx vitest run test/coordenada-de-ocorrencia-aberta.test.ts` (apps/api): 13/13 passaram. Prova que POST /ocorrencias/:id/coordenada existe e funciona (contradiz o "Não implementado" herdado da documentação).
- Todo o resto é leitura de código, migrações, `git log -S` e grep.

---

## 1. Seção 17: documento como fluxo

### 1.1 Respostas diretas

| Pergunta | Resposta | Evidência |
| --- | --- | --- |
| Gerado sob demanda ou guardado? | Sob demanda, sempre. Nenhuma tabela ou objeto guarda HTML ou PDF emitido. O PDF nasce em Chromium a partir do HTML e vai direto ao cliente. | documentos.ts:723-727 (HTML), 769-843 (PDF: `pdf.gerar(...)` devolve bytes que são enviados e descartados), pdf.ts:54-118, comentário "gerado sob demanda, e não guardado" em 761-767 |
| Há hash ou versão do que foi emitido? | Não para o conteúdo. Há identificador de 12 hex (48 bits) derivado de documento, protocolo, vistoria e instante da primeira emissão. Não há versão do modelo: o modelo é código (laudo.ts, folha.ts) e o rodapé não imprime versão. O sha256 existe só para cada FOTO (evidencias.sha256, calculado pelo servidor ao confirmar: evidencias.ts:138-163), e não entra no laudo nem no registro de emissão. | laudo.ts:257-273, folha.ts:314-357, migração 003:11-16 |
| O que garante que o laudo emitido "é o mesmo" amanhã? | Nada. A reimpressão relê o banco. Só a assinatura de próprio punho e o papel já impresso/PDF salvo pelo coordenador funcionam como cópia fiel. | documentos.ts:53-280 |
| O que acontece se a ocorrência mudar depois da emissão? | Muda a reimpressão. Ver tabela 1.2. O único aviso é em correção de coordenada (evento leva `documentoJaEmitido`). Ocorrência ENCERRADA não aceita correção de coordenada nem ato novo, o que limita a deriva depois do fechamento. | ocorrencias.ts:1325-1333 (recusa se encerrada), 1345-1372 (flag) |
| Existe registro de emissão (quem, quando, qual conteúdo)? | Quem e quando: sim, na trilha (primeira emissão do par) e em ocorrencia_consultas (toda abertura, com usuário, papel, recurso, finalidade e IP). Qual conteúdo: não. O `detalhe` guarda só {documento, vistoriaId, formato}. | trilha.ts:81-91, documentos.ts:698-703, consulta.ts:105-125 |
| Existe aprovação por responsável técnico? | Não. Quatro papéis (coordenador, operador, agente_campo, administrador). Quem emite é coordenador ou administrador, e o mesmo ato emite e "decide". Não há papel de técnico responsável, cargo, registro profissional, revisão nem aprovação. | dominio.ts:257-258, permissoes.ts:81-110, migração 001:83-95, laudo.ts:672 e 816 (cargo fixo em texto) |

### 1.2 O que muda numa reimpressão (prova por leitura de código)

| Gatilho depois da emissão | Efeito no documento reimpresso | Evidência | Deixa rastro? |
| --- | --- | --- | --- |
| Vistoria nova chega | O laudo passa a imprimir a nova vistoria (vigente = última RECEBIDA). O laudo da vistoria anterior não pode mais ser regenerado pela rota; só termos de interdição usam a vistoria do ato | documentos.ts:100-121 e 601-604 | Emissão nova é gravada (par documento+vistoria novo), a antiga permanece só como linha |
| Coordenada da ocorrência corrigida | Endereço/coordenada impressos mudam | ocorrencias.ts:1356-1374 | Sim, evento com antes/depois/motivo e `documentoJaEmitido` |
| Foto avulsa anexada | Aparece em seção "Fotografias anexadas ao protocolo" | documentos.ts:180-191, laudo.ts:621-639 | Só no log de evidências |
| Nome/matrícula do agente ou nome da equipe editados | O documento lê `usuarios.nome`, `usuarios.matricula`, `equipes.nome` vivos, sem snapshot | documentos.ts:103-118 e 62-66; PATCH /usuarios/:id em administracao.ts:294 | Sim na trilha administrativa, mas o papel antigo não é recuperável |
| Minimização por prazo (retenção do município) | Nome do solicitante, relato e observações viram "removido por prazo" | laudo.ts:323-338, apps/api/test/laudo-depois-da-minimizacao.test.ts | Sim (evento por remoção, migração 021) |
| Deploy com modelo novo | Todo documento reimpresso sai com o modelo novo; nenhum dado de "modelo da época" existe | folha.ts, laudo.ts (código); nenhuma coluna de versão | Não |
| Providência respondida / ofício | O ofício é remontado de ocorrencias+providencias na hora de imprimir | migração 017:351-354, oficios.ts:92-136 | Não |
| Segunda via | Rodapé imprime "Emitido em <agora> por <quem reimprimiu>" mas o identificador é o da PRIMEIRA emissão; /validar responde a primeira emissão | documentos.ts:278, laudo.ts:687-688, folha.ts:344-352, documentos.ts:899-908 | Só em ocorrencia_consultas |

### 1.3 Causa estrutural do laudo do pacote de saída divergente

Sintoma: `test/saida-de-municipio.test.ts:364-369` espera que o laudo do pacote contenha "estava designada à Equipe Alfa" e "lotado na Equipe Bravo" (aviso de equipe divergente). Falha (executado por mim).

Causa, em três elos:

1. O aviso é impresso por `avisoDeEquipe` (laudo.ts:503-520), que devolve string vazia quando `equipe_designada_nome` está ausente (laudo.ts:508-509).
2. A rota normal alimenta o modelo com `ed.nome AS equipe_designada_nome, ea.nome AS equipe_do_agente_nome` via duas junções (documentos.ts:103-118).
3. O pacote monta os dados por CONSULTA PRÓPRIA (pacote.ts:479-494): seleciona vistoria, agente, `sem_despacho`, mas NÃO junta `equipes` duas vezes, então o modelo recebe `undefined` e o aviso some. As colunas existem e o teste as popula (saida-de-municipio.test.ts:187-189).

Causa-raiz de arquitetura: o modelo `DadosDocumento` é alimentado por dois montadores independentes, `reunirDados` (documentos.ts) e o bloco inline do pacote. Cada correção de conteúdo precisa ser feita em dois lugares e só um foi. Prova de que não é regressão: `git log -S"equipe_designada_nome"` toca documentos.ts (2c4e488, 09/09) e nunca pacote.ts; nenhum dos 10 commits que tocaram pacote.ts contém "equipe_designada". O teste entrou em 5ecdf4c (15/09) sem a correção correspondente.

### 1.4 Outras divergências, por leitura, no mesmo caminho (não reproduzidas em teste)

| Divergência | Pacote (pacote.ts) | Rota normal (documentos.ts) |
| --- | --- | --- |
| Fotos do laudo | Todas as evidências enviadas da OCORRÊNCIA, agrupadas só por ocorrência (534-539, 652-671) | Só as da vistoria vigente (156-163), avulsas em seção própria (180-191). Reintroduz o defeito "laudo da re-vistoria B com fotos da A" |
| Registros perdidos (foto/assinatura não recuperadas) | Não consulta `vistoria_evidencias_perdidas` | Consulta e imprime a seção e o texto da assinatura perdida (226-234; laudo.ts:563-584, 659-664) |
| Coordenada medida pelo aparelho | Não seleciona `v.latitude/longitude` (479-493) | Seleciona (103-106); laudo imprime "Coordenada capturada no local" |
| Termo de interdição (segunda via) e termo de desinterdição | Usam a vistoria VIGENTE (661, 731-733) | Usam a vistoria do ato e a do levantamento (documentos.ts:427-456, 502-517, 601-604, 618-623) |
| Identificador do rodapé | `emitidoEm: agora` (687) e sem `emissao`: o identificador impresso não corresponde a nenhuma linha da trilha, então /documentos/validar responderia 404 para documentos do pacote (dedução do cálculo em laudo.ts:268-273; não executei) | Corresponde à emissão registrada |

Consequência para CA-10/RNF-12: o "documento do município" no pacote de saída é uma RECONSTRUÇÃO diferente do papel emitido, por desenho, porque nada foi guardado. Há SOMAS-SHA256.txt no pacote (pacote.ts:906), que prova integridade do arquivo depois da exportação, não fidelidade ao emitido.

### 1.5 Mapa dos 19 elementos do documento como fluxo

Legenda: EXISTE, PARCIAL, AUSENTE.

| Elemento | Estado | O que existe (evidência) | O que falta |
| --- | --- | --- | --- |
| Minuta | EXISTE | Montada no aparelho, sem sinal, marcada "MINUTA SEM VALOR DE DOCUMENTO" (shared/src/minuta.ts:34-35, 117-274; apps/campo vistoria/[id].tsx:2315-2359; ui/MinutaDoLaudo.tsx) | Não é versão do laudo; não há minuta no painel (coordenador edita nada: o laudo é derivado) |
| Revisão | AUSENTE | Nenhum estado, papel ou rota (grep "aprov/revis/rascunho/em_revisao" em migrações, api e shared: zero ocorrências de documento) | Fluxo de revisão, comentários, devolução |
| Aprovação | AUSENTE | Idem. O ato de emitir é o único passo e é do coordenador | Aprovador distinto do emissor, estados rascunho/em revisão/aprovado/cancelado (DOC-04 do Alyson) |
| Decisão | PARCIAL | A vistoria indica (`interdicao_indicada`, checklist obrigatório: dominio.ts:306-313); a coordenação decide ao emitir o termo; `interditada_em/por` gravam quem/quando (trilha.ts:143-155, migração 014). Regras de integridade recusam ato sem despacho, sem indicação, em ocorrência encerrada (documentos.ts:345-399, 582-607, 658-673) | Registro explícito de decisão com justificativa própria (hoje só o motivo do levantamento é obrigatório: schemas.ts:513-518) |
| Competência | PARCIAL | Permissão `emitir_documento` só para coordenador e administrador (permissoes.ts:88, 104); agente não emite (documentos.test.ts:826); outro município recebe 404 (documentos.test.ts:407) | Competência técnica por tipo de documento (quem pode assinar laudo ou termo), decisão humana |
| Signatário | PARCIAL | Traço da pessoa presente (imagem, VIS-06) mais linhas de "Assinatura de próprio punho" para agente/coordenação (laudo.ts:672-674, 720-721, 816-817; folha.ts:377-439) | Signatário eletrônico identificado; o rodapé "emitido por" é quem imprimiu, não quem assina |
| Cargo | AUSENTE como dado | Rótulos fixos no modelo: "Agente de proteção e defesa civil", "Coordenação de proteção e defesa civil" (laudo.ts:672, 816). `usuarios` não tem cargo nem registro profissional (migração 001:83-95) | Campo cargo/registro por pessoa, decisão humana sobre o que é exigido |
| Fundamento | PARCIAL | Texto fixo nos dois termos: "Lei 12.608/2012 ... alterada pela Lei 14.750/2023", sem artigo (laudo.ts:707, 803), ambas constam em docs/CONTEXTO.md:29; o laudo de vistoria não tem fundamento | Fundamento configurável por município/tipo; conteúdo jurídico é decisão humana, não inventar |
| Versão | PARCIAL | "Versão" implícita por vistoria: nova vistoria gera nova linha de emissão e novo identificador (identificador-da-emissao.test.ts:166-173) | Versão do modelo e do documento impressas; histórico de versões consultável |
| Hash | AUSENTE | Só sha256 de foto (evidencias.ts:138-163) e SOMAS-SHA256 do pacote (pacote.ts:906). O identificador de 12 hex não é hash do conteúdo | Hash do conteúdo emitido, reverificação do sha256 das fotos na emissão (documentos.ts não relê o armazenamento além de `descrever` da assinatura: 295-320) |
| Assinatura | PARCIAL | Traço do presente (imagem ligada à vistoria, migração 009, CHECK de prefixo do tenant); papel impresso para assinar à caneta | Assinatura eletrônica/digital (ICP-Brasil ou gov.br) é MVP 2 no documento do Alyson; não há |
| Emissão | EXISTE | registrarEmissao, uma por (documento, vistoria), na mesma transação do efeito (trilha.ts:72-95, documentos.ts:650-706); PDF só efetiva depois de renderizar (documentos.ts:795-833) | Emissões subsequentes não entram na trilha (só no log de consultas) |
| Protocolo | PARCIAL | Protocolo da OCORRÊNCIA em todo documento; ofício tem numeração própria por município e ano (migração 017:293-338, 343-385) | Laudo e termo não têm número de documento próprio; só protocolo + identificador |
| Substituição | AUSENTE | Não há relação "substitui/substituído por". Um laudo novo só aparece por vistoria nova | Vínculo entre documentos, status "substituído" |
| Cancelamento | AUSENTE | Comentário do próprio painel: ofício "não tem cancelamento" (Ocorrencia.tsx:1692-1696); ofício é único por providência (migração 017:370) | Cancelar/anular com motivo, preservando numeração (RN-02) |
| Recebimento | PARCIAL | Ofício: abertura do link registrada com IP e uso único (oficios.ts:602-669; migração 017:532-600), recibo do provedor (migração 027) | Em produção o envio por email está desligado por configuração (oficios.ts:379-387; EMAIL_ATIVO padrão "nao", fly.toml não liga); acuse de recebimento do órgão; portal V2 |
| Prazo | PARCIAL | Prazo da providência impresso no ofício (oficio/documento.ts:101); prazo da ocorrência por severidade (dominio.ts:113-118) | Prazo do próprio documento (validade, resposta esperada) |
| Resposta | PARCIAL | Resposta à providência registrada pela Defesa Civil em nome do órgão, com desfecho em lista fechada (migração 006; schemas.ts:468-493) | Resposta do órgão por conta própria, anexos de comprovação, pedido de complemento (V2 portal) |
| Arquivamento | AUSENTE | O mais próximo é encerrar a ocorrência (terminal, dominio.ts:188) e o pacote de saída | Repositório de documentos emitidos, retenção própria, consulta por protocolo |

### 1.6 Achados adicionais de documentos

- Marca d'água de produção: fly.toml:68-69 diz "Só apague quando o município homologar e os documentos passarem a valer" e define MARCA_DAGUA = "DOCUMENTO DE VALIDAÇÃO". Por configuração, o piloto emite documentos que se declaram sem validade. A configuração viva é NÃO CONFIRMADA (segredos do Fly ficam fora do repositório).
- PDF existe só para laudo e termo de interdição (documentos.ts:845-849). Termo de desinterdição e ofício saem apenas em HTML com botão imprimir (folha.ts:326).
- Leitura interna de ofício (GET /oficios/:id/documento, oficios.ts:345-355) não grava registro de consulta: `RecursoConsultado` não tem "oficio" (consulta.ts:70-81). O ofício concentra endereço, nome do solicitante e descrição de vulnerabilidade (oficio/documento.ts:32-62, 97-129). O mesmo vale para a leitura das fotos (evidencias.ts não chama registrarConsulta).
- Consulta pública do ofício: rota sem login, segredo de 32 bytes, abre uma vez, abertura registrada (oficios.ts:598-669). Desenho correto para o que propõe; depende de email ligado.
- Renderizador de PDF: Chromium com `--no-sandbox`, contexto novo com JavaScript habilitado, `setContent(html)` de HTML com texto livre de cidadão (pdf.ts:69-72, 94-102). A barreira é `escapar` (folha.ts:19-26). Não encontrei injeção; é endurecimento pendente, não falha provada.
- Fuso dos documentos: correto por UF (folha.ts:60-100). O CSV de ocorrências NÃO usa esse fuso: `dataParaPlanilha` usa getHours/getDate do processo (prestacao-de-contas.ts:153-160), e o contêiner não define TZ (Dockerfile e fly.toml sem TZ). Em produção provavelmente imprime UTC (3 h à frente de Brasília) sem indicar. Não executei em produção.
- Protocolo: o ano vem de `new Date().getFullYear()` do processo (ocorrencias.ts:637-639), enquanto o ofício usa o relógio do banco de propósito (oficios.ts:271-281). Em contêiner UTC, entre 21h e 24h de 31/12 (Brasília) o protocolo sai com o ano seguinte. Suspeita por leitura, não reproduzida.
- Conferência do identificador sem tela: nenhum arquivo de apps/web, apps/campo ou apps/console chama /documentos/validar. docs/GUIA-DO-COORDENADOR.md:124 manda o coordenador chamar o endpoint.

### 1.7 Correções à auditoria de 30/09/2026 (docs/AUDITORIA-2026-09-30.md)

Para MAIS (o código é melhor que a auditoria disse):

- RN-04, OCO-02 e seção 10 item 4: a rota `POST /ocorrencias/:id/coordenada` EXISTE (ocorrencias.ts:1299-1376), o painel a chama (web dados/http.ts:598-601, Ocorrencia.tsx:588), há teste e ele passou 13/13 na minha execução. Commit ed61cbb de 12/09/2026. apps/web/PENDENCIAS.md item 1 é documentação velha.
- Seção 10 item 6: o teto de seis casas existe no esquema compartilhado (schemas.ts:60-63, localizacao.ts:42) e no banco (CHECK, migração 030:228-231). apps/web/PENDENCIAS.md item 5 é documentação velha.
- README.md:1361-1364 ("falta quem produz a assinatura") está velho: apps/campo/src/ui/Assinatura.tsx (378 linhas) está ligado em vistoria/[id].tsx:40 e 1723-1742.

Para MENOS (marcado "Completo" na auditoria, com lacuna): OCO-02, OCO-05, OCO-06, VIS-05, VIS-08, DOC-01, DOC-02, FLU-01, FLU-02, FLU-03, GEO-01, AUT-01, AUT-03, AUD-01, RNF-14, RN-03, RN-06, CA-01, CA-03, CA-05. Detalhe linha a linha nas listas K abaixo.

Causa do teste vermelho do pacote: a auditoria disse "quebrado de novo ou nunca fechado". É "nunca fechado" (seção 1.3).

---

## 2. Revalidação dos requisitos do documento do Alyson

Método: para cada ID das seções 6, 7, 8, 9 e 14, li o texto do requisito e do critério de aceite e procurei implementação em migrações, rotas, shared, web e campo antes de afirmar presença ou ausência. "Completo" da auditoria anterior só foi mantido onde o critério de aceite inteiro tem correspondência no código. Teste, quando citado, é pontual ou não executado por mim (dito em cada caso). Estados da matriz: A comprovado, B existe com gap, C parcial, D não existe, E novo V2, F decisão humana, G não confirmado.

### J) ATENDIDOS (14)

| ID | Evidência | Ressalva |
| --- | --- | --- |
| OCO-01 | proximo_protocolo com linha de sequência travada (migração 001:124-147), UNIQUE (organizacao_id, protocolo) (001:182), uso em ocorrencias.ts:637-639 | Ano pelo relógio do processo (ver 1.6); suspeita não reproduzida |
| OCO-03 | schemas.ts:131-151, ocorrencias.ts:722-799 (tipo, severidade, vulnerabilidade, prazo por severidade, trilha com tipo anterior), fila ordenada (ocorrencias.ts:395) | "Risco de agravamento" do fluxo 5.1 não é campo separado; severidade cobre prioridade e risco |
| OCO-07 | trilha_eventos com apenas SELECT e INSERT (migração 001:300-335), autor, origem, ocorrido_em e registrado_em | Imutável por privilégio, sem selo criptográfico (ver riscos) |
| VIS-02 | GET /campo/meu-trabalho (rotas/campo.ts:43), fila e depósito SQLite em packages/campo (fila.ts, deposito-sqlite.ts), checklist embutido no aparelho | Comprovado em testes do motor; aparelho só iPhone, Android nunca (campo/PENDENCIAS.md item 7, documentado) |
| VIS-03 | gps_precisao_metros (001:220), ponto da vistoria (migração 030), autoria com coletadaPor (migração 024), laudo imprime precisão e coordenada capturada (laudo.ts:364-372) | O laudo não apresenta GPS como exato |
| VIS-07 | Estados da fila pendente, enviando, confirmado, bloqueado, destino perdido (packages/campo/src/tipos.ts:13-25), ui/FaixaDeSincronizacao.tsx, perdida marcada por foto (fila.ts:780-790) | Sem aviso de descarte: o descarte de coleta exige confirmação nomeando o autor (campo/PENDENCIAS.md:91-96) |
| PAI-01 | Indicadores (ocorrencias.ts:1434-1481: fila, em campo, atrasadas, críticas, providências abertas e vencidas), resumo por tipo e mediana (prestacao-de-contas.ts:526-585, Auditoria.tsx:413-432), recorte do agente | Filtro só por período e situação; painel inicial sem filtro |
| AUD-02 | consultar_trilha só coordenador e administrador (permissoes.ts:92, 108; prestacao-de-contas.ts:175, 587, 615); sem policy de UPDATE/DELETE | |
| RNF-03 | fila visível e retomada foto a foto (fila.ts:795-811), FaixaDeSincronizacao | "Retomável" aqui é por arquivo, não por byte (ver RNF-08) |
| RNF-04 | scrypt (auth/senha.ts:1), verify-full exigido em produção (config.ts:~655), helmet e rate limit (servidor.ts:344-381), force_https (fly.toml), Zod nas rotas | Segurança em profundidade é de outra frente |
| RN-01 | RLS forçada em toda tabela de negócio, chave de storage com prefixo do tenant por CHECK (001: evidencias), 404 para outro município (documentos.ts:579-580) | Teste db/test/isolamento.test.ts não foi executado por mim (número oficial com o agente de baseline) |
| RN-02 | Sequência por organização e ano, número não retorna; não existe cancelamento de ocorrência, só encerramento terminal (dominio.ts:188) | Mesmo ressalva do ano de OCO-01 |
| RN-07 | Exportação completa exige posto e justificativa, registrada em `exportacoes` e na trilha administrativa (prestacao-de-contas.ts:316-325, 412-457); colunas de pessoa fora da lista (consulta.ts:47-57); não há painel público | Lacunas de registro de leitura estão em AUD-01 |
| CA-06 | db/test/isolamento.test.ts (descobre tabelas pelo catálogo) | Execução oficial com o agente de baseline |

Nota: desses 14, nenhum foi reexecutado por mim em suíte completa; "atendido" significa código coerente com o critério e teste correspondente existente.

### K) PARCIALMENTE ATENDIDOS (41), com o que falta

| ID | Evidência do que existe | O que falta |
| --- | --- | --- |
| AUT-01 | Organizações e equipes em modelo multi-tenant (001:44-95, 62-72), console cria município (migração 036) | "Unidades": nenhuma tabela, coluna ou conceito (grep "unidade" em migrações e shared: zero). Critério de aceite (isolamento) atendido |
| AUT-02 | Login, renovação, sair, recuperar, redefinir, trocar senha, bloqueio por conta e por IP (rotas/autenticacao.ts:116-241), sessões registradas (migração 002:39-50) | Em produção RECUPERACAO_ATIVA="nao" (fly.toml:67); reset administrativo existe na API e NENHUMA página o chama (web dados/http.ts:752-763 definidos, sem uso em paginas/); falhas de login são só contador sobrescrito (migração 002:105-130), sem evento; login e saída não entram na trilha |
| AUT-03 | RBAC compartilhado (permissoes.ts), superficie.test.ts, toda escrita passa por `autorizar` (varredura: só rotas públicas de auth, interesse, armazenamento local e segundo fator ficam de fora) | "Unidade" e "nível de sigilo" do texto da seção 3 não existem |
| AUT-04 | TOTP com códigos de recuperação (migração 022, auth/segundo-fator.ts) | Exigência é por PAPEL administrador e flag GLOBAL (segundo-fator.ts:114-116, config.ts:291), não política por organização; padrão "nao", não ligado em fly.toml (estado vivo NÃO CONFIRMADO) |
| OCO-02 | Todos os campos do critério existem (schemas.ts:85-127, migração 001:152-182) | Regras por tipo: só "outro" exige descrição (schemas.ts:121-127). Anexos: a web não tem upload (nenhum input file; web só lista evidências, dados/http.ts:792-797); só o aplicativo de campo e a API avulsa; aceita apenas imagem (migração 003:19-24) |
| OCO-04 | GET /ocorrencias/duplicidades/consulta, operador confirma vínculo ou segue independente (NovaOcorrencia.tsx:147-166, 239-284) | Só mesmo tipo, trecho do endereço (antes da vírgula), ocorrência ativa, janela de 48 h (ocorrencias.ts:694-718). Sem coordenada, sem contato, sem janela configurável |
| OCO-05 | Vínculo `vinculada_a` mostrado nos dois sentidos (Ocorrencia.tsx:397-405); busca textual por endereço com tolerância a erro (rotas/busca.ts, migração 041) | Sem entidade imóvel, área ou evento; histórico territorial só por texto; GEO-02 ausente |
| OCO-06 | Despacho a EQUIPE com prazo e instruções (schemas.ts:154-158, ocorrencias.ts:801-975) | Sem responsável individual e sem ACEITE do agente; instruções só no evento da trilha; unidade de despacho é a equipe por decisão documentada (docs/PAPEIS_E_RESPONSABILIDADES.md:170-172) |
| VIS-01 | App nativo React Native/Expo para Android e iOS em vez de PWA (apps/campo); painel tem manifest.webmanifest mas nenhum service worker | Divergência deliberada (seção M); sem ADR; Android sem aparelho; "estado de instalação" do PWA não se aplica |
| VIS-04 | Captura JPEG com qualidade 0,6 fixa (vistoria/[id].tsx:1460-1470), envio direto por URL pré-assinada, retomada arquivo a arquivo e idempotente (fila.ts:795-811), teto 15 MB por arquivo (migração 003:29) | Compressão não configurável (valor fixo); sem miniaturas (grep "miniatura" só UI do aparelho); sem upload retomável por byte (PUT único do arquivo inteiro lido em memória); sem antivírus |
| VIS-05 | Quatro itens obrigatórios e dois opcionais, lista de órgãos condicional ao item "acionar outro órgão" (dominio.ts:306-313, 324-335) | UM checklist fixo para todos os tipos COBRADE; sem perguntas condicionais por tipo; sem formulário configurável (depende de CFG-01) |
| VIS-06 | Captura no dedo (ui/Assinatura.tsx), chave ligada à vistoria com CHECK de tenant (migração 009:75-79), impressa no laudo e no termo | Assinatura não tem finalidade, data ou hash próprios: a data é a da vistoria; a pessoa assina a MINUTA, e o laudo é remontado depois; sem ligação criptográfica ao documento |
| VIS-08 | Evidência confirmada não troca de bytes (evidencias.ts:225-240, teste bytes-confirmados-nao-se-trocam.test.ts), ocorrência encerrada recusa evidência nova (evidencias.ts:298-304), re-vistoria é linha nova | "Aditamento" versionado com justificativa não existe como conceito; nova vistoria não exige justificativa |
| DOC-01 | Laudo em HTML e PDF com protocolo, dados, checklist, fotos, autoria e data (laudo.ts:666-691, documentos.ts:845-849) | Critério pede "versão": não há. Em produção sai com marca d'água de validação (fly.toml:69). PDF síncrono no processo da API |
| DOC-02 | Laudo, termo de interdição, termo de desinterdição e ofício de encaminhamento (laudo.ts, oficio/documento.ts) | Faltam notificação e relatório fotográfico avulso; modelos não são habilitáveis por organização ou tipo |
| DOC-03 | Registro de emissão por (documento, vistoria) e identificador (trilha.ts:72-95, laudo.ts:257-273) | Critério "preserva conteúdo e modelo da época" NÃO atendido: nada é guardado (ver 1.1 e 1.2) |
| FLU-01 | Providência com órgão (catálogo, migração 017:248-280), responsável (texto), prazo, descrição (schemas.ts:460-466, ocorrencias.ts:976-1037), evento na linha do tempo | Sem prioridade; "fila do responsável" não existe (responsável é texto livre e o órgão não entra no sistema); só lista do município (ocorrencias.ts:1414-1432) |
| FLU-02 | Resposta com desfecho fechado e quem respondeu (migração 006, schemas.ts:489-493, ocorrencias.ts:1038-1080) | Sem evidência de cumprimento anexada à resposta; encerramento NÃO exige resposta nem "justificativa de dispensa" (ocorrencias.ts:1090-1099 só avisa) |
| FLU-03 | Sino e push para prazo de VISTORIA vencendo/vencido (migrações 016 e 018:52-66) | Providência vencida só aparece como indicador e lista (ocorrencias.ts:1467-1469, 1414-1432); não há aviso de providência vencendo ou vencida (tipos de aviso: vistoria_recebida, prazo_vencido da ocorrência, providencia_respondida) |
| FLU-04 | Encerrar com motivo obrigatório por CHECK e verificação de providências abertas e interdição ativa (migração 001:173-180, ocorrencias.ts:1081-1143) | Reabrir não existe: `encerrada: []` terminal (dominio.ts:188); caminho é ocorrência nova vinculada (ocorrencias.ts:1328-1330) |
| GEO-01 | GET /ocorrencias/mapa e Mapa.tsx/MapaDoGoogle.tsx mostram ativas com coordenada, tipo, status e severidade (por forma, não só cor) | O mapa NÃO tem filtro (consultaMapaSchema só paginação: ocorrencias.ts:82-85; Mapa.tsx sem controles); a lista filtra situação, severidade e atrasadas, não tipo (ocorrencias.ts:43-50, Ocorrencias.tsx:211-235); teto de 200 pontos com total informado |
| REL-01 | CSV com filtros de período e situação, dois níveis, defesa contra injeção de fórmula, registro em `exportacoes` (prestacao-de-contas.ts:310-517) | Sem exportação em PDF de relatório; o arquivo não identifica filtros, organização, data de emissão nem responsável (só o registro no servidor e a data no nome); datas no fuso do processo (1.6); filtros sem tipo e severidade |
| AUD-01 | trilha_eventos, trilha_administrativa, exportacoes, ocorrencia_consultas (detalhe da ocorrência, laudo e termos, busca por nome) | Sem registro: leitura de ofício, leitura de fotos, consulta à própria trilha, login/saída/bloqueio; "contexto técnico" (IP, agente) só em consultas e exportações, não em trilha_eventos (migração 001:300-312) |
| RNF-05 | Proteção contra alteração (append-only) e pesquisa da trilha (filtroTrilhaSchema, prestacao-de-contas.ts:174) | Retenção configurável existe só para dado pessoal (migrações 021, 029, 043); o log em si não tem política de retenção por organização |
| RNF-08 | Ver VIS-04 | Política de retenção de mídia por organização não existe (minimizacao.ts não trata evidências); foto não é minimizada |
| RNF-09 | Portões estáticos de contraste e teclado nos dois temas (apps/web/test/acessibilidade.test.ts; sem axe-core) | Sem teste com leitor de tela real ou pessoa; a auditoria anterior registrou 1 caso vermelho (resultado oficial: agente de baseline) |
| RNF-10 | Painel roda em Chromium e Firefox por E2E (.github/workflows/verificar.yml) | Campo é nativo, não navegador/PWA (divergência); iOS Safari para painel local desaconselhado (README, documentado) |
| RNF-11 | Logs estruturados pino com redact (servidor.ts:244-259), /saude (servidor.ts:597), métricas de negócio por município para o console | Nenhum alerta de erro ou APM (grep de sentry, opentelemetry, prom-client: zero); sem métrica de latência por rota; rastreio de sincronização só por eventos de negócio |
| RNF-12 | POST /saida/pacote.zip com CSV, JSON, esquema, evidências, documentos e somas (saida/pacote.ts, rotas/saida.ts:39) | Carrega todas as tabelas em memória (pacote.ts:446-449; apps/api/PENDENCIAS.md:7-30); documentos do pacote são reconstruções divergentes (1.3 e 1.4); 1 teste vermelho |
| RNF-13 | CI com typecheck, isolamento, suíte completa, npm audit, E2E (.github/workflows/verificar.yml), migrações versionadas | Deploy manual (`fly deploy`, fly.toml:13-14); não encontrei ambiente de homologação (grep "staging" só em IMPLANTACAO sobre binário iOS) |
| RNF-14 | Documentos com fuso por UF (folha.ts:60-100), pt-BR | CSV no fuso do processo (prestacao-de-contas.ts:153-160); ano do protocolo pelo relógio do processo |
| RN-03 | Bytes confirmados não se trocam, ocorrência encerrada recusa evidência nova, evidência sem DELETE (migração 034), sha256 por foto | Não existe "documento aprovado"; sha256 não é reverificado na emissão; UPDATE continua permitido à aplicação nessa tabela (034:~) |
| RN-04 | Coordenada + precisão + data + autoria na vistoria (001:220, migração 030, 024); ajuste manual justificado com antes/depois na trilha (ocorrencias.ts:1361-1372; teste 13/13) | A coordenada da OCORRÊNCIA não guarda origem (digitada, link, GPS) nem precisão; origem só implícita |
| RN-05 | Motivo obrigatório por CHECK, responsável na trilha, providências abertas listadas na resposta e na trilha (ocorrencias.ts:1096-1134) | Verificação não bloqueia e não há conceito de providência "obrigatória": decisão deliberada de não travar a fila (ocorrencias.ts:1090-1095). Bloqueia só interdição ativa |
| RN-06 | Idempotência por chave do cliente (001:204-205), autor divergente recusado com 409 e evento (sincronizacao.ts:306-357, 453-463), vigente = última recebida (documentos.ts:77-99) | Sem fila de revisão humana no painel: coleta recusada só aparece como evento na trilha; campo/PENDENCIAS.md:91-103 diz que o caminho via coordenação "não existe" |
| CA-01 | Cadeia completa por rotas e testes (api.test.ts, scripts/e2e-api.mjs não executado por mim) | O operador do critério "classifica e despacha"; no produto só coordenação/administração classificam e despacham (permissoes.ts:79-110; docs/PAPEIS_E_RESPONSABILIDADES.md:58-62 admite "nunca foi decidido por escrito") |
| CA-03 | PDF do laudo com protocolo, respostas, evidências, autoria e data | Sem "versão"; marca d'água de validação em produção |
| CA-04 | Providência atribuída, respondida e atraso no painel (Painel.tsx:203-207) | "Notificada": ofício por email desligado em produção; "comprovada": sem anexo de evidência; resposta digitada pela Defesa Civil |
| CA-05 | Regra previsível (idempotência, vigente = última recebida, 409 de autor divergente) | "Fila de revisão" do lado da coordenação não existe (ver RN-06) |
| CA-07 | Criação, status, exportação e consulta de dossiê rastreáveis | "Aprovação" não existe; lacunas de AUD-01 |
| CA-10 | Pacote ZIP com LEIA-ME, índice, esquema, somas (teste saida-de-municipio.test.ts: 18 de 19 passam, executado por mim) | Risco de memória; documentos reconstruídos divergentes; PDF nunca é o emitido |

### L) NÃO ATENDIDOS (6) e L-G) NÃO CONFIRMADOS (8)

| ID | Estado | Evidência | O que faltaria |
| --- | --- | --- | --- |
| AUT-05 | D | Grep "aceite, termos de uso, consentimento, ciência" em migrações, api, web, campo e shared: nenhuma tabela, rota ou tela | Tabela de versões de termos, aceite por usuário com versão, data e IP, tela de aceite; texto é decisão humana |
| OCO-08 | D | Única ocorrência de CSV é exportação (shared/src/csv.ts, prestacao-de-contas.ts:310); nenhuma rota ou tela de importação | Rota de importação com validação total e relatório de erros, sem efeito parcial |
| DOC-04 | D | Nenhum estado, papel ou rota de revisão/aprovação de documento (seção 1.5) | Máquina de estados do documento, papel de responsável técnico, permissões por estado |
| GEO-02 | D | Sem PostGIS (README.md:1372-1373; compose.yaml usa imagem postgis mas nenhuma migração cria a extensão), sem busca por raio ou área (grep: zero) | Índice espacial, consulta por raio/polígono, camadas de risco (GeoJSON/KML) |
| CFG-01 | D | Tipos, severidades e prazos são constantes (dominio.ts:113-118, 306-313); só retenção de dado pessoal (PATCH /organizacao/retencao, administracao.ts:632) e catálogo de órgãos são configuráveis por município | Configuração por organização de tipos, prioridades, prazos, checklists e modelos, com versão |
| RN-10 | D | Não há configuração versionável; modelo é código | Depende de CFG-01 |
| RNF-01 | G | Só existe sonda /saude a cada 15 s pelo Fly (fly.toml:112-121); nenhum histórico ou SLO no repositório | Monitor externo de disponibilidade, definição de janela pactuada, ao menos 30 dias de série |
| RNF-02 | G | db/test/carga.test.ts diz de si que NÃO mede desempenho (PGlite); não há tempo de resposta instrumentado por rota | p95 por rota a partir de log/APM e teste de carga contra Postgres real em ambiente de homologação |
| RNF-06 | G | Procedimento de restore "executado em 09/09/2026" só em docs/COLOCAR-DE-PE.md e INDISPONIBILIDADE.md:99-105; periodicidade "[[a definir]]"; não há backup agendado no repositório | Evidência do restore (log), RPO/RTO medidos, rotina de cópia agendada |
| RNF-07 | G | Sinais de instância única: limitador de taxa em memória (servidor.ts:381, sem store), mapa de falhas de login em memória (auth/servico.ts:106-147), Chromium no processo, 1 máquina (fly.toml). Há trava advisory no varredor de push (push/trava.ts:114) | Teste com 2+ instâncias; contadores compartilhados |
| RNF-15 | G | docs/INDISPONIBILIDADE.md (documentado, NÃO CONFIRMADO); modo degradado depende de papel e do aplicativo offline | Exercício de simulado de indisponibilidade |
| CA-02 | G | Motor coberto por testes (packages/campo), cenário literal (avião, cinco fotos, aparelho) só por relato (README: 3 vistorias reais em iPhone) | Execução em aparelho Android e iOS com cinco fotos |
| CA-08 | G | Ver RNF-06 | Restore repetido e registrado |
| CA-09 | G | Exige usuários reais do piloto | Sessões de usabilidade com agentes |

### L2) FASE FUTURA, NÃO INICIADA (12 requisitos mais fases)

Conferido por grep em migrações, api, web, campo (nenhuma tabela incidente, abrigo, depósito, estoque, lote, movimento, necessidade, doação, entrega):

- INC-01, INC-02, INC-03, INC-04, ABR-01, LOG-01, LOG-02, LOG-03, LOG-04, LOG-05, LOG-06, LOG-07 (todos prioridade F). "Desabrigados" no laudo (migração 015) é contagem de vistoria, não ABR-01.
- RN-08 (incidente), RN-09 (estoque): dependem das fases acima.
- MVP 2: portal do cidadão (só existe o formulário de interesse de MUNICÍPIO em rotas/interesse.ts), formulários configuráveis, integrações municipais, BI, assinatura (ICP-Brasil), regras de SLA.
- Fase 3: modo incidente, equipes por turno, abrigos, logística.
- Fase 4: apoio mútuo consorcial, APIs e integrações oficiais.
- Integrações da seção 12.1 (S2ID pacote de dados, GeoJSON/KML, processo eletrônico PDF+metadados, assinatura ICP, mensageria SMS/WhatsApp): nada de S2ID/KML/WFS no código; push e email existem.
- Para a V2, as superfícies 4 (portal das secretarias) e 5 (app do cidadão) absorvem parte disso; ver linhas E da matriz.

### M) DIVERGÊNCIAS DELIBERADAS DE ARQUITETURA EM RELAÇÃO AO DOCUMENTO

| # | Documento do Alyson | Produto | Evidência | Registro formal? |
| --- | --- | --- | --- | --- |
| M1 | PWA instalável, offline, IndexedDB (VIS-01, RNF-10, 10.2) | App nativo React Native/Expo com SQLite (expo-sqlite) | CLAUDE.md "O produto real"; apps/campo; packages/campo/src/deposito-sqlite.ts | Só CLAUDE.md. Nenhum ADR (docs/adr/0001 a 0008 não tratam) |
| M2 | PostgreSQL com PostGIS (10.1, 10.3) | PostgreSQL sem PostGIS; lat/lng em double precision com CHECK de 6 casas | migração 030:228-231; README.md:1372-1373 | README |
| M3 | Fila de jobs para PDF, miniatura, notificação, importação, exportação (10.1) | Tudo síncrono no processo: PDF em Chromium, relógios em processo (varredura de push, minimização, resumo, órfão, eliminação), pacote de saída em memória | README.md:1383-1386; fly.toml:26-36 | README |
| M4 | Operador "classifica e despacha" (seção 3) | Só coordenador e administrador classificam e despacham | permissoes.ts:79-110; PAPEIS_E_RESPONSABILIDADES.md:58-62 | Documentado como "nunca decidido por escrito" |
| M5 | Permissões por organização, unidade, perfil e sigilo (seção 3, AUT-01/03) | Organização e perfil; sem unidade nem sigilo | grep "unidade/sigilo": zero | Não |
| M6 | Oito perfis (incl. técnico responsável, órgão parceiro, gestor/auditor, cidadão) | Quatro papéis | dominio.ts:257-258 | Não; órgão parceiro e cidadão viram superfícies V2 |
| M7 | Descarte controlado (seção 13) e registro que não se apaga | Minimização por prazo em vez de apagar; eliminação só de município inteiro com prazo de arrependimento | migrações 021, 029, 043, 038; CLAUDE.md | CLAUDE.md e PRIVACIDADE.md |
| M8 | Mapa: "biblioteca de mapa e custo de tiles" em aberto | Google Maps (chave em tempo de execução); README ainda cita MapLibre | rotas/configuracao.ts; web/PENDENCIAS.md item 3 | Parcial (README velho) |
| M9 | API versionada desde o início (12.2); chave de idempotência em escritas relevantes | Rotas sem prefixo de versão; idempotência só na sincronização e na evidência (POST /ocorrencias não tem) | servidor.ts:665-771 | Não |
| M10 | Autenticação: "próprio ou gerenciado" em aberto | Autenticação própria scrypt + JWT HS256 | ADR 0004 | Sim |
| M11 | Sem item equivalente | Acréscimos: console do fornecedor, pacote de saída, ofício por link de uso único, saída a campo, push | ADR 0008; rotas/saida.ts; oficios.ts; migração 031 | Parcial |
| M12 | Painel em um modo | Painel em dois modos (local PGlite para demonstração e API) | ADR 0003 | Sim |
| M13 | Assinatura: "aprovação interna e identificação de autoria" no MVP (12.1) | Nem aprovação interna nem assinatura eletrônica; autoria é quem emitiu/imprimiu | seção 1.5 | Não |

---

## Matriz D

Convenção: DOC-xx são capacidades de documento (seção 17). REQ-xxx são os requisitos do documento do Alyson, com o ID original entre colchetes. Superfícies: 1 Web, 2 Campo, 3 Console, 4 Portal de órgãos (V2), 5 App do cidadão (V2), API, DB.

| ID | SUPERFÍCIE | DOMÍNIO | REQUISITO / CAPACIDADE | ESTADO | EVIDÊNCIA | RISCO | DEPENDÊNCIAS | DECISÃO HUMANA? | OBSERVAÇÃO |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DOC-01 | API, 1 | Documento | Laudo de vistoria em HTML imprimível | A | documentos.ts:729-732, laudo.ts:666-691, documentos.test.ts:162-250 | Baixo | | Não | Sob demanda, vistoria vigente |
| DOC-02 | API, 1 | Documento | PDF de laudo e termo de interdição via Chromium | B | pdf.ts:54-118, documentos.ts:769-849 | Médio: PDF síncrono, 1 GB, Chromium --no-sandbox | DOC-11 | Não | Sem PDF para desinterdição e ofício |
| DOC-03 | API | Documento | Termo de interdição como ato; segunda via não reinterdita | A | documentos.ts:458-490, 650-706; trilha.ts:143-155; segunda-via-nao-reinterdita.test.ts | Baixo | DOC-07 | Não | Recusa sem despacho, sem indicação, em encerrada |
| DOC-04 | API, 1 | Documento | Termo de desinterdição e levantamento com motivo | A | ocorrencias.ts:1171-1242, documentos.ts:756-759, laudo.ts:780-834, migração 014, desinterdicao.test.ts | Baixo | | Não | Só HTML |
| DOC-05 | API, 1 | Documento | Ofício de encaminhamento numerado, emissão, envio por email, link de uso único | B | oficios.ts:252-387, 602-669; migração 017:293-385, 532-600 | Médio | DOC-30 | Sim (envio em produção) | Conteúdo remontado na impressão; email desligado por padrão |
| DOC-06 | 2 | Documento | Minuta no aparelho, sem valor de documento | A | minuta.ts:34-35, 117-274; vistoria/[id].tsx:2315-2359 | Baixo | | Não | Teste de paridade minuta x laudo citado no código |
| DOC-07 | API, DB | Documento | Registro de emissão na trilha (uma por documento e vistoria) | B | trilha.ts:72-95; migração 009:104-111 | Médio: só a primeira, sem conteúdo | DOC-11 | Não | Demais aberturas só em ocorrencia_consultas |
| DOC-08 | API | Documento | Identificador da emissão (sha256 12 hex) | B | laudo.ts:257-273 | Médio | DOC-09 | Não | Identifica o ato, não o conteúdo; 48 bits |
| DOC-09 | API | Documento | Conferência do identificador (GET /documentos/validar/:codigo) | B | documentos.ts:877-938; identificador-da-emissao.test.ts:176-215 | Médio | DOC-10 | Sim | Exige login, só o mesmo município, varredura de toda a trilha, sem tela |
| DOC-10 | API, 1 | Documento | Validação por terceiro e QR no documento | D | folha.ts:349-352 (selo é texto, não QR); QR só em segundo fator (web qr.ts, console qr.ts) | Médio | DOC-09 | Sim | MP, tribunal e cidadão não conferem |
| DOC-11 | API, DB | Documento | Documento emitido guardado e congelado, com hash do conteúdo | D | documentos.ts:836-842 (bytes enviados e descartados); nenhuma tabela | Alto | DOC-12 | Sim | Núcleo da seção 17 |
| DOC-12 | API | Documento | Versão do modelo e do documento | D | folha.ts:314-357 (rodapé sem versão); laudo.ts | Alto | DOC-11 | Sim | Modelo é código |
| DOC-13 | API | Documento | Reimpressão fiel ao emitido | D | documentos.ts:53-280; tabela 1.2 | Alto | DOC-11 | Sim | Só deixa rastro na correção de coordenada |
| DOC-14 | API | Documento | Rodapé da segunda via coerente com o identificador | B | documentos.ts:278; laudo.ts:687-688; folha.ts:344-352 | Médio | DOC-08 | Não | Mostra quem reimprimiu e quando, com identificador do primeiro ato |
| DOC-15 | API | Documento | Aviso de equipe divergente e de vistoria sem despacho no laudo | A | laudo.ts:503-520, documentos.ts:103-118, 124-133 | Baixo | | Não | Correto na rota; ausente no pacote (DOC-16) |
| DOC-16 | API | Documento | Laudo do pacote de saída idêntico ao laudo emitido | B | pacote.ts:479-494; saida-de-municipio.test.ts:364-369 (falha, executado por mim) | Alto | DOC-17 | Não | Dois montadores de dados para um modelo |
| DOC-17 | API | Documento | Fotos, perdidas, coordenada do ponto, vistoria do ato e identificador no pacote | B | pacote.ts:534-539, 652-671, 677-689, 731-733 | Alto | DOC-16 | Não | Divergências latentes, por leitura |
| DOC-18 | API, 1 | Documento | Revisão, aprovação, cancelamento e substituição de documento | D | zero ocorrências em migrações, api, shared | Alto | DOC-19 | Sim | REQ-DOC-04 |
| DOC-19 | API, DB, 1 | Documento | Responsável técnico, competência e cargo/registro do signatário | D | dominio.ts:257-258; migração 001:83-95; laudo.ts:672, 816 | Alto | DOC-18 | Sim | Não inventar norma de habilitação |
| DOC-20 | 2, API | Documento | Traço da pessoa presente e assinatura de próprio punho | B | laudo.ts:672-674; folha.ts:377-439; migração 009 | Médio | REQ-VIS-06 | Não | Sem data e finalidade próprias |
| DOC-21 | API | Documento | Assinatura eletrônica qualificada (ICP-Brasil ou gov.br) | D | grep: nenhum | Médio | DOC-19 | Sim | MVP 2 do Alyson |
| DOC-22 | API | Documento | Fundamento legal nos termos | A | laudo.ts:707, 803; docs/CONTEXTO.md:29 | Baixo | | Sim (conteúdo) | Só norma autorizada, sem artigo |
| DOC-23 | API | Documento | Marca d'água "DOCUMENTO DE VALIDAÇÃO" em produção | F | fly.toml:68-69 | Médio | | Sim | Documento do piloto declara-se sem validade |
| DOC-24 | API | Documento | Número próprio do documento | C | ofício: migração 017:293-338; laudo e termo: só protocolo e identificador | Médio | | Não | |
| DOC-25 | API, 4 | Documento | Recebimento: abertura registrada e acuse do órgão | C | oficios.ts:602-669; migração 017:532-600; migração 027 | Médio | DOC-05 | Sim | Acuse do órgão é V2 |
| DOC-26 | API, 4 | Documento | Prazo e resposta ligados ao documento | C | oficio/documento.ts:101; schemas.ts:489-493 | Médio | DOC-25 | Não | Resposta digitada pela Defesa Civil |
| DOC-27 | API | Documento | Cancelamento e substituição de ofício | D | Ocorrencia.tsx:1692-1696; migração 017:370 | Médio | DOC-18 | Sim | Um ofício por providência, sem cancelar |
| DOC-28 | API, DB | Documento | Arquivamento e retenção do documento emitido | D | sem armazenamento; laudo-depois-da-minimizacao.test.ts | Alto | DOC-11 | Sim | Conflito prova x minimização LGPD |
| DOC-29 | API | Documento | Registro de cada abertura de laudo e termos | A | documentos.ts:698-703; consulta.ts:70-125 | Baixo | | Não | |
| DOC-30 | API | Documento | Registro de leitura de ofício e de fotos | D | consulta.ts:70-81 (sem "oficio"); evidencias.ts sem registrarConsulta | Médio (LGPD) | | Não | Lacuna do próprio controle |
| DOC-31 | API | Documento | Permissão de emitir e isolamento (404) | A | permissoes.ts:88, 104; documentos.ts:569, 579-580; documentos.test.ts:407, 826 | Baixo | | Não | |
| DOC-32 | API | Documento | Emissão de ato refaz a decisão na gravação (estado mudou) | A | documentos.ts:650-673 | Baixo | | Não | |
| DOC-33 | API | Documento | Aviso de documento já emitido ao corrigir coordenada | A | ocorrencias.ts:1345-1372 | Baixo | | Não | Único gatilho com rastro |
| DOC-34 | API | Documento | Fuso correto nos documentos | A | folha.ts:60-117; fuso-do-documento.test.ts | Baixo | | Não | CSV fora (REQ-REL-01) |
| DOC-35 | API | Documento | Renderizador de PDF endurecido | G | pdf.ts:69-72, 94-102 | Médio | DOC-02 | Não | Sem sandbox, JS ligado; depende de escapar() |
| DOC-36 | 4, API | Documento | Órgão recebe, aceita ou devolve e anexa evidência dentro do sistema | E | sem portal; hoje link único por email | Alto | DOC-25, DOC-26 | Sim | Superfície 4 da V2 |
| DOC-37 | 5, API | Documento | Cidadão acompanha protocolo sem dado sensível | E | sem rota pública de acompanhamento | Médio | DOC-10 | Sim | Superfície 5 da V2 |
| REQ-001 | DB, API | Acesso | [AUT-01] Organizações, unidades e equipes multi-tenant | C | migração 001:44-95, 036; sem "unidade" | Médio | | Sim (unidade no piloto?) | Isolamento atendido |
| REQ-002 | API, 1 | Acesso | [AUT-02] Login e recuperação segura com registro | B | autenticacao.ts:116-241; fly.toml:67; migração 002:105-130 | Alto | REQ-003 | Sim (provedor de email) | Sem UI de reset administrativo; falhas sem evento |
| REQ-003 | API | Acesso | [AUT-03] Controle de acesso por perfil e unidade | C | permissoes.ts; superficie.test.ts | Médio | REQ-001 | Sim | Sem unidade e sigilo |
| REQ-004 | API | Acesso | [AUT-04] MFA exigido por política da organização | C | segundo-fator.ts:114-116; config.ts:291 | Médio | | Sim | Exigência por papel e flag global |
| REQ-005 | API, 1 | Acesso | [AUT-05] Aceite de termos com versão, data, usuário e IP | D | grep zero | Médio | | Sim (texto, jurídico) | |
| REQ-006 | API, DB | Ocorrência | [OCO-01] Protocolo único por organização e ano | A | migração 001:124-147, 182; ocorrencias.ts:637 | Baixo | | Não | Ano pelo relógio do processo |
| REQ-007 | API, 1 | Ocorrência | [OCO-02] Dados do chamado, regras por tipo, anexos | C | schemas.ts:85-127; web sem upload | Médio | | Não | |
| REQ-008 | API, 1 | Ocorrência | [OCO-03] Classificação, fila ordenada, histórico | A | ocorrencias.ts:722-799, 395 | Baixo | | Não | |
| REQ-009 | API, 1 | Ocorrência | [OCO-04] Duplicidade por endereço, coordenada, contato e período | C | ocorrencias.ts:694-718 | Médio | | Não | Só tipo + endereço + 48 h |
| REQ-010 | API, 1 | Ocorrência | [OCO-05] Relacionar ao mesmo imóvel, área ou evento | C | Ocorrencia.tsx:397-405; busca.ts | Médio | REQ-030 | Não | Só vínculo manual e busca textual |
| REQ-011 | API, 1 | Ocorrência | [OCO-06] Atribuir equipe, responsável, prazo, instruções; ver aceite | C | schemas.ts:154-158; ocorrencias.ts:801 | Médio | | Sim (responsável individual) | Sem aceite |
| REQ-012 | DB, API | Ocorrência | [OCO-07] Linha do tempo imutável | A | migração 001:300-335 | Baixo | | Não | Sem selo criptográfico |
| REQ-013 | API, 1 | Ocorrência | [OCO-08] Importação de lote por CSV | D | só exportação: csv.ts, prestacao-de-contas.ts:310 | Baixo | | Não | Prioridade C |
| REQ-014 | 2 | Campo | [VIS-01] PWA responsiva e instalável | C | apps/campo nativo | Médio | | Sim (registrar ADR) | Divergência M1 |
| REQ-015 | 2 | Campo | [VIS-02] Tarefas e formulários offline | A | campo.ts:43; packages/campo | Baixo | | Não | Android não exercitado |
| REQ-016 | 2 | Campo | [VIS-03] GPS, precisão, data e autoria | A | 001:220; migrações 024, 030 | Baixo | | Não | |
| REQ-017 | 2 | Campo | [VIS-04] Fotos comprimidas e upload retomável | C | vistoria/[id].tsx:1460-1470; fila.ts:795-811 | Médio | | Não | Sem miniatura, sem resume por byte |
| REQ-018 | 2 | Campo | [VIS-05] Checklist por tipo, condicional, offline | C | dominio.ts:306-335 | Médio | REQ-036 | Não | Lista única |
| REQ-019 | 2 | Campo | [VIS-06] Assinatura na tela com finalidade, data e vínculo | C | ui/Assinatura.tsx; migração 009 | Médio | DOC-20 | Não | |
| REQ-020 | 2 | Campo | [VIS-07] Rascunhos, pendências e conflitos visíveis | A | tipos.ts:13-25; FaixaDeSincronizacao.tsx | Baixo | | Não | |
| REQ-021 | 2, API | Campo | [VIS-08] Complemento sem apagar evidência, versionado com justificativa | C | evidencias.ts:225-240, 298-304 | Médio | | Não | Sem aditamento justificado |
| REQ-022 | API, 1 | Documento | [DOC-01] Relatório de vistoria em PDF com versão | B | documentos.ts:845; sem versão | Médio | DOC-12 | Não | |
| REQ-023 | API, 1 | Documento | [DOC-02] Notificação, encaminhamento, termo, relatório fotográfico | C | laudo.ts, oficio/documento.ts | Médio | | Sim | Sem notificação e relatório fotográfico |
| REQ-024 | API | Documento | [DOC-03] Versionar modelos e documentos emitidos | C | trilha.ts:72-95 | Alto | DOC-11 | Sim | Critério não atendido |
| REQ-025 | API | Documento | [DOC-04] Revisão e aprovação por responsável técnico | D | seção 1.5 | Alto | DOC-18, DOC-19 | Sim | |
| REQ-026 | API, 1 | Fluxo | [FLU-01] Providência com responsável, prazo, prioridade e órgão | C | schemas.ts:460-466; ocorrencias.ts:976-1037 | Médio | | Não | Sem prioridade |
| REQ-027 | API, 1 | Fluxo | [FLU-02] Resposta e evidência de cumprimento | C | migração 006; ocorrencias.ts:1038-1080 | Médio | DOC-36 | Sim (dispensa) | Encerra sem resposta |
| REQ-028 | API, 2, 1 | Fluxo | [FLU-03] Notificar prazos próximos e vencidos | C | migrações 016, 018:52-66 | Médio | | Não | Providência sem aviso |
| REQ-029 | API, 1 | Fluxo | [FLU-04] Encerrar e reabrir com motivo | C | ocorrencias.ts:1081-1143; dominio.ts:188 | Médio | | Sim (reabrir) | Reabrir ausente |
| REQ-030 | 1, API | Geo | [GEO-01] Mapa por coordenada, status, tipo, prioridade, com filtros | C | ocorrencias.ts:449-493; Mapa.tsx | Médio | | Não | Mapa sem filtro |
| REQ-031 | API, DB | Geo | [GEO-02] Histórico por imóvel, raio ou área | D | README.md:1372 | Médio | | Não | |
| REQ-032 | 1, API | Painel | [PAI-01] Fila, prazos, volume, tipos, tempo | A | ocorrencias.ts:1434-1481; prestacao-de-contas.ts:526-585 | Baixo | | Não | |
| REQ-033 | 1, API | Relatório | [REL-01] Exportar PDF e CSV identificando filtros, data, organização, responsável | C | prestacao-de-contas.ts:310-517 | Médio | | Não | Sem PDF; fuso do CSV |
| REQ-034 | API, DB | Auditoria | [AUD-01] Registrar criação, alteração, consulta sensível, exportação | B | consulta.ts; prestacao-de-contas.ts:412-457 | Médio (LGPD) | DOC-30 | Não | |
| REQ-035 | API, 1 | Auditoria | [AUD-02] Auditoria só para perfis autorizados | A | permissoes.ts:92, 108 | Baixo | | Não | |
| REQ-036 | API, 1 | Config | [CFG-01] Configurar tipos, prioridades, prazos, modelos, com versão | D | dominio.ts:113-118 | Médio | | Sim | Só retenção e órgãos |
| REQ-037 | DB | Fase futura | [INC-01] Incidente com nível, período, área, comando | D | sem tabela | Baixo | | Sim | Fase 3 |
| REQ-038 | DB | Fase futura | [INC-02] Quadro de situação | D | idem | Baixo | REQ-037 | Sim | Fase 3 |
| REQ-039 | DB | Fase futura | [INC-03] Equipes, turnos, check-in/out | D | idem (saída a campo, migração 031, é outro escopo) | Baixo | REQ-037 | Sim | Fase 3 |
| REQ-040 | API | Fase futura | [INC-04] Relatório de situação | D | idem | Baixo | REQ-037 | Sim | Fase 3 |
| REQ-041 | DB | Fase futura | [ABR-01] Abrigos | D | idem | Baixo | | Sim | Fase 3 |
| REQ-042 a REQ-048 | DB | Fase futura | [LOG-01 a LOG-07] Logística humanitária | D | sem tabela | Baixo | REQ-041 | Sim | Fase 3; uma linha cada no anexo abaixo |
| REQ-049 | Transversal | Regra | [RN-01] Isolamento por tenant | A | RLS forçada; migração 001 | Baixo | | Não | |
| REQ-050 | DB | Regra | [RN-02] Protocolo único, cancelamento não libera | A | migração 001:124-182 | Baixo | | Não | |
| REQ-051 | API | Regra | [RN-03] Evidência em documento aprovado não se substitui | C | evidencias.ts:225-240; migração 034 | Médio | REQ-025 | Não | Sem estado aprovado |
| REQ-052 | API, 2 | Regra | [RN-04] Coordenada, precisão, data, origem, ajuste justificado | C | migração 030; ocorrencias.ts:1299-1376 | Médio | | Não | Ocorrência sem origem/precisão |
| REQ-053 | API | Regra | [RN-05] Encerramento com motivo, responsável, verificação | B | ocorrencias.ts:1081-1143 | Médio | REQ-027 | Sim | Não bloqueia por providência |
| REQ-054 | API, 2 | Regra | [RN-06] Conflito offline previsível ou revisão humana | C | sincronizacao.ts:306-357 | Médio | | Não | Sem fila de revisão |
| REQ-055 | API | Regra | [RN-07] Sigilo de dado pessoal | A | prestacao-de-contas.ts:316-325 | Médio | REQ-034 | Não | |
| REQ-056 | DB | Regra | [RN-08] Agrupar em incidente | D | sem tabela | Baixo | REQ-037 | Sim | Fase 3 |
| REQ-057 | DB | Regra | [RN-09] Saldo por movimento | D | sem tabela | Baixo | REQ-042 | Sim | Fase 3 |
| REQ-058 | API | Regra | [RN-10] Configuração versionada | D | dominio.ts | Médio | REQ-036 | Sim | |
| REQ-059 | Transversal | RNF | [RNF-01] Disponibilidade 99,5% | G | fly.toml:112-121 | Médio | | Sim | Sem série |
| REQ-060 | Transversal | RNF | [RNF-02] p95 em 2 s | G | db/test/carga.test.ts | Médio | | Não | Não medido |
| REQ-061 | 2 | RNF | [RNF-03] Offline com fila visível e retomável | A | fila.ts | Baixo | | Não | |
| REQ-062 | API | RNF | [RNF-04] TLS, senha forte, segredo, RBAC, validação | A | config.ts; senha.ts | Baixo | | Não | |
| REQ-063 | DB, API | RNF | [RNF-05] Logs protegidos, retenção e pesquisa configuráveis | C | migração 001; prestacao-de-contas.ts:174 | Médio | | Sim | |
| REQ-064 | Transversal | RNF | [RNF-06] Backup RPO 24 h, RTO 8 h | G | COLOCAR-DE-PE.md (doc) | Alto | | Sim | Documentado, NÃO CONFIRMADO |
| REQ-065 | API | RNF | [RNF-07] Escala horizontal | G | servidor.ts:381; auth/servico.ts:106-147 | Médio | | Não | |
| REQ-066 | 2, API | RNF | [RNF-08] Compressão, miniatura, retomável, retenção | C | ver REQ-017 | Médio | | Sim (retenção de mídia) | |
| REQ-067 | 1 | RNF | [RNF-09] WCAG 2.1 AA | C | web/test/acessibilidade.test.ts | Médio | | Não | |
| REQ-068 | 1, 2 | RNF | [RNF-10] Chrome, Edge, Android, iOS | C | apps/campo nativo | Médio | | Sim | |
| REQ-069 | API | RNF | [RNF-11] Métricas, logs, alertas, rastreio | C | servidor.ts:244-259, 597 | Médio | | Não | Sem alertas |
| REQ-070 | API | RNF | [RNF-12] Exportação do tenant | B | saida/pacote.ts | Alto | DOC-16 | Não | Memória e reconstrução |
| REQ-071 | Transversal | RNF | [RNF-13] Testes, migrações, CI/CD, ambientes | C | .github/workflows/verificar.yml | Médio | | Não | Sem homologação |
| REQ-072 | Transversal | RNF | [RNF-14] Português, datas e fusos | B | folha.ts:60-100; prestacao-de-contas.ts:153-160 | Médio | | Não | |
| REQ-073 | Transversal | RNF | [RNF-15] Contingência antes da fase 3 | G | docs/INDISPONIBILIDADE.md | Médio | | Sim | Documentado, NÃO CONFIRMADO |
| REQ-074 | Transversal | Aceite | [CA-01] Ocorrência completa | B | api.test.ts (não executado por mim) | Médio | REQ-011 | Sim | Papel do operador |
| REQ-075 | 2 | Aceite | [CA-02] Vistoria offline, cinco fotos, sem duplicar | G | packages/campo/test | Alto | | Não | Sem prova em aparelho |
| REQ-076 | API | Aceite | [CA-03] PDF padronizado com versão | B | documentos.ts:845 | Médio | DOC-12 | Não | |
| REQ-077 | API, 1 | Aceite | [CA-04] Encaminhamento atribuído, notificado, respondido, comprovado | C | ocorrencias.ts:976-1080 | Médio | DOC-36 | Não | |
| REQ-078 | API, 2 | Aceite | [CA-05] Conflito sem descarte silencioso | C | sincronizacao.ts:453-463 | Médio | | Não | |
| REQ-079 | DB | Aceite | [CA-06] Isolamento entre municípios | A | db/test/isolamento.test.ts | Baixo | | Não | Execução oficial com baseline |
| REQ-080 | API | Aceite | [CA-07] Rastreabilidade inclusive aprovação | C | seção 1 | Médio | REQ-025 | Não | |
| REQ-081 | Transversal | Aceite | [CA-08] Backup restaurado e documentado | G | COLOCAR-DE-PE.md | Alto | | Sim | Mesma prova de RNF-06 |
| REQ-082 | 2, 1 | Aceite | [CA-09] Usabilidade sem assistência | G | sem dado de campo | Médio | | Não | Precisa de piloto |
| REQ-083 | API | Aceite | [CA-10] Exportação legível e documentada | B | saida-de-municipio.test.ts (18/19) | Alto | DOC-16 | Não | |
| REQ-084 | API, 1 | Perfis | [Seção 3] Operador classifica e despacha | F | permissoes.ts:79; PAPEIS_E_RESPONSABILIDADES.md:58-62 | Médio | | Sim | Divergência aberta |
| REQ-085 | API, 1 | Perfis | [Seção 3] Técnico responsável valida laudos | D | sem papel | Alto | DOC-19 | Sim | |
| REQ-086 | 4, API | Perfis | [Seção 3] Órgão parceiro acessa só demandas atribuídas | E | sem login de órgão | Alto | DOC-36 | Sim | Superfície 4 V2 |
| REQ-087 | 1, API | Perfis | [Seção 3] Gestor, controle e auditor só leitura | D | quatro papéis; consultar_trilha é do coordenador | Médio | | Sim | |
| REQ-088 | 5, API | Perfis | [Seção 3] Cidadão abre solicitação e acompanha | E | sem portal | Médio | DOC-37 | Sim | Superfície 5 V2, não é ocorrência oficial |
| REQ-089 | API | Arquitetura | [12.2] API versionada e idempotência em escritas relevantes | C | servidor.ts:665-771 | Médio | | Não | Idempotência só em sync e evidência |
| REQ-090 | API | Arquitetura | [10.1] Fila de jobs | D | README.md:1383-1386 | Médio | | Não | Divergência M3 |

Anexo da linha REQ-042 a REQ-048 (LOG-01 a LOG-07, todas D, fase futura, prioridade F, sem tabela nem rota): LOG-01 depósitos e pontos de coleta; LOG-02 item, lote, validade; LOG-03 QR/código de barras de item; LOG-04 entrada, transferência, separação, entrega, ajuste; LOG-05 necessidade x estoque x doação; LOG-06 carga, rota e comprovante; LOG-07 estoque permanente de kits.

## Fluxos

### Fluxo 1: Defesa Civil -> Documento (passo a passo)

| FLUXO | PASSO | ESTADO | EVIDÊNCIA |
| --- | --- | --- | --- |
| Defesa Civil -> Documento | 1. Agente coleta vistoria offline com checklist, GPS, fotos e traço da pessoa presente | EXISTE | packages/campo/src/fila.ts; vistoria/[id].tsx |
| Defesa Civil -> Documento | 2. Minuta no aparelho lida em voz alta antes da assinatura | EXISTE | minuta.ts:117-274; vistoria/[id].tsx:2315-2359 |
| Defesa Civil -> Documento | 3. Sincronização cria vistoria idempotente e registra autor e equipes | EXISTE | sincronizacao.ts:426; migração 024 |
| Defesa Civil -> Documento | 4. Revisão da minuta ou do laudo por alguém da coordenação | AUSENTE | seção 1.5 |
| Defesa Civil -> Documento | 5. Aprovação por responsável técnico | AUSENTE | sem papel, sem estado |
| Defesa Civil -> Documento | 6. Decisão de interditar | PARCIAL | indicada no checklist; ato é a emissão do termo (documentos.ts:658-680) |
| Defesa Civil -> Documento | 7. Emissão do laudo ou termo (HTML ou PDF), com permissão emitir_documento | EXISTE | documentos.ts:546-706 |
| Defesa Civil -> Documento | 8. Registro da emissão na trilha e do acesso na consulta | PARCIAL | só a primeira emissão na trilha; conteúdo não registrado (trilha.ts:72-95) |
| Defesa Civil -> Documento | 9. Congelar o documento (PDF guardado, hash, versão do modelo) | AUSENTE | documentos.ts:836-842 |
| Defesa Civil -> Documento | 10. Assinatura de quem assina (próprio punho ou eletrônica) | PARCIAL | próprio punho no papel; traço da pessoa presente; sem eletrônica |
| Defesa Civil -> Documento | 11. Conferir autenticidade depois (por terceiro, com QR) | AUSENTE | validar exige login e não tem tela; sem QR |
| Defesa Civil -> Documento | 12. Segunda via | PARCIAL | sai de novo do banco; rodapé e identificador incoerentes (DOC-14) |
| Defesa Civil -> Documento | 13. Substituir ou cancelar documento emitido | AUSENTE | seção 1.5 |
| Defesa Civil -> Documento | 14. Levantar interdição e emitir termo de desinterdição | EXISTE | ocorrencias.ts:1171-1242; documentos.ts:756-759 |
| Defesa Civil -> Documento | 15. Encaminhar ao órgão por ofício numerado | EXISTE | oficios.ts:252-343 |
| Defesa Civil -> Documento | 16. Envio do ofício por email com link de uso único | PARCIAL | código pronto; EMAIL_ATIVO padrão "nao" e fly.toml não liga (oficios.ts:379-387) |
| Defesa Civil -> Documento | 17. Recebimento: abertura registrada e acuse do órgão | PARCIAL | abertura registrada; acuse não existe |
| Defesa Civil -> Documento | 18. Prazo e resposta do órgão | PARCIAL | prazo impresso; resposta digitada pela Defesa Civil |
| Defesa Civil -> Documento | 19. Arquivar documento e encerrar com motivo | PARCIAL | ocorrência encerra com motivo (ocorrencias.ts:1081-1143); documento não é arquivado |

### Fluxo 2: Documento -> Órgão/Secretaria (V2, superfície 4)

| FLUXO | PASSO | ESTADO | EVIDÊNCIA |
| --- | --- | --- | --- |
| Documento -> Órgão | 1. Órgão tem usuário próprio e vê só o que é da competência dele | NOVO V2 | sem login de órgão; orgaos é catálogo de destino (migração 017:86-154) |
| Documento -> Órgão | 2. Órgão recebe a demanda e o documento dentro do sistema | NOVO V2 | hoje link único por email (oficios.ts:602-669) |
| Documento -> Órgão | 3. Aceitar ou devolver com motivo, assumir responsabilidade | NOVO V2 | sem equivalente |
| Documento -> Órgão | 4. Acompanhar prazo | PARCIAL | prazo e indicador existem (Painel.tsx:203-207); sem aviso ao órgão |
| Documento -> Órgão | 5. Responder com anexo, pedir complemento | NOVO V2 | resposta existe sem anexo (schemas.ts:489-493) |
| Documento -> Órgão | 6. Defesa Civil aceita, pede complemento ou abre reinspeção | NOVO V2 | reinspeção = nova vistoria (existe); aceite/complemento não |

### Fluxo 3: Documento -> pacote de saída do município (CA-10)

| FLUXO | PASSO | ESTADO | EVIDÊNCIA |
| --- | --- | --- | --- |
| Saída do município | 1. Administrador pede pacote ZIP | EXISTE | rotas/saida.ts:39 |
| Saída do município | 2. Dados e tabelas em CSV, JSON e esquema | EXISTE | pacote.ts:430-450, 594-619 |
| Saída do município | 3. Documentos como emitidos | AUSENTE | são reconstruídos (pacote.ts:677-738) e divergem (1.3 e 1.4) |
| Saída do município | 4. Integridade do arquivo | EXISTE | SOMAS-SHA256.txt (pacote.ts:906) |
| Saída do município | 5. Memória limitada | AUSENTE | pacote.ts:446-449; apps/api/PENDENCIAS.md:7-30 |

## Gaps

- P0 INTEGRIDADE: documento emitido não é guardado nem tem hash do conteúdo; a reimpressão não reproduz o emitido (DOC-11, DOC-12, DOC-13, DOC-28). Sem isso o registro de emissão prova que houve um ato, não o que ele continha.
- P0 INTEGRIDADE: pacote de saída reconstrói os documentos por um segundo montador, com divergências: aviso de equipe (teste vermelho desde 5ecdf4c), fotos de todas as vistorias, registros perdidos, coordenada do ponto, vistoria do ato e identificador que não valida (DOC-16, DOC-17).
- P0 INTEGRIDADE: sha256 das fotos não é reverificado contra o armazenamento na emissão, e não entra no registro de emissão (documentos.ts:295-320 só confere existência da assinatura).
- P0 LGPD: leitura interna de ofício e de fotos de uma família não gera registro de consulta, enquanto laudo, termos e dossiê geram (consulta.ts:70-81; DOC-30).
- P1 PRODUTO: rodapé de segunda via mostra quem reimprimiu e quando, com o identificador do primeiro ato (DOC-14).
- P1 PRODUTO: conferência do identificador só com login, só no município, sem tela e sem QR; terceiros não conferem (DOC-09, DOC-10).
- P1 PRODUTO: documento sem versão do modelo (DOC-12, REQ-022, REQ-076).
- P1 PRODUTO: PDF só para laudo e termo de interdição; termo de desinterdição e ofício só em HTML (DOC-02).
- P1 PRODUTO: CSV de ocorrências imprime datas no fuso do processo (provavelmente UTC) e não identifica filtros, organização nem responsável; sem relatório em PDF (REQ-033).
- P1 PRODUTO: checklist único para todos os tipos; sem formulário configurável (REQ-018, REQ-036, REQ-058).
- P1 PRODUTO: mapa sem filtros; lista sem filtro por tipo (REQ-030).
- P1 PRODUTO: duplicidade só por tipo + endereço + 48 h; sem coordenada e contato (REQ-009).
- P1 PRODUTO: providência sem prioridade, sem fila do responsável, sem anexo de comprovação, sem aviso de vencimento, e encerramento sem justificativa de dispensa (REQ-026 a REQ-028, REQ-053).
- P1 PRODUTO: aditamento da vistoria sem justificativa versionada (REQ-021); fila de revisão do coordenador para coleta bloqueada inexistente (REQ-054, REQ-078).
- P1 OPERAÇÃO: login, saída e bloqueio não entram na trilha; falhas são só contador (REQ-002, REQ-034).
- P1 OPERAÇÃO: recuperação de senha desligada em produção e reset administrativo sem tela (REQ-002).
- P1 OPERAÇÃO: sem alerta de erro, sem latência por rota, sem homologação, deploy manual (REQ-069, REQ-060, REQ-071).
- P1 OPERAÇÃO: Chromium com --no-sandbox e JavaScript ligado renderizando HTML com texto de cidadão (DOC-35).
- P1 CONTINUIDADE: pacote de saída carrega o município inteiro em memória (REQ-070); restore só documentado e periodicidade aberta (REQ-064, REQ-081).
- P2 EVOLUÇÃO: ano do protocolo pelo relógio do processo (REQ-006); importação CSV (REQ-013); aceite de termos (REQ-005); miniaturas, upload retomável por byte, antivírus, retenção de mídia (REQ-017, REQ-066); API sem versão (REQ-089); documentação velha (web/PENDENCIAS.md itens 1 e 5, README.md:1361-1364, GUIA-DO-COORDENADOR.md:124).
- A DEFINIR: aprovação, responsável técnico, cargo e registro profissional (DOC-18, DOC-19, REQ-025, REQ-085); assinatura eletrônica (DOC-21); marca d'água de produção (DOC-23); unidade e sigilo (REQ-001, REQ-003); MFA por política (REQ-004); reabrir ocorrência (REQ-029); operador classifica e despacha (REQ-084); perfil de gestor/auditor só leitura (REQ-087).

## Decisões humanas

1. Congelar ou regenerar o documento emitido.
   - Pergunta: o laudo e o termo emitidos passam a ser guardados (PDF ou HTML) com hash e versão do modelo, ou continuam regenerados do banco?
   - Por que importa: termo de interdição tira famílias de casa e vai para processo; hoje a reimpressão pode divergir do papel e nada prova o emitido.
   - O que bloqueia: DOC-11, 12, 13, 28; validação por terceiros; CA-03 e DOC-03 do Alyson; fidelidade do pacote de saída.
   - Alternativas: (a) congelar na primeira emissão e servir sempre a cópia; (b) guardar só hash e snapshot dos dados de entrada e regenerar; (c) manter como está e declarar que a cópia fiel é o papel.
   - Riscos: (a) custo de armazenamento, conflito com minimização LGPD e com correção de erro; (b) regenerar pode não reproduzir byte a byte se o modelo mudar; (c) manter a prova frágil em contestação.
2. Quem revisa, aprova e assina.
   - Pergunta: existe papel de responsável técnico? O emissor pode ser o aprovador? Que registro profissional (se algum) é exigido por tipo de documento?
   - Por que importa: competência técnica do laudo e do termo; a própria especificação cita aprovação por técnico.
   - O que bloqueia: DOC-04 do Alyson, CA-07, DOC-18, DOC-19.
   - Alternativas: (a) manter emissão pela coordenação; (b) papel novo com aprovação obrigatória para termos; (c) dois olhos apenas para interdição.
   - Riscos: (a) contestação por falta de competência técnica registrada; (b) atrito no plantão e fila travada em temporal; (c) regra por tipo aumenta configuração. A definição jurídica de quem tem competência é do município e do jurídico: não inventei norma.
3. Assinatura e validade jurídica.
   - Pergunta: basta assinatura de próprio punho mais traço da pessoa presente, ou é preciso assinatura eletrônica (gov.br, ICP-Brasil)?
   - Por que importa: validade do ato e recusa de documentos por outros órgãos.
   - O que bloqueia: DOC-21, REQ-019; remoção da marca d'água.
   - Alternativas: (a) manter papel; (b) assinatura eletrônica avançada própria; (c) integração com provedor qualificado.
   - Riscos: (a) retrabalho manual e extravio; (b) força probatória menor que a qualificada; (c) custo e dependência de fornecedor.
4. Validação por terceiros.
   - Pergunta: o documento terá QR e página pública de conferência? O que ela mostra?
   - Por que importa: Ministério Público, tribunal e cidadão não têm login.
   - O que bloqueia: DOC-09, DOC-10, DOC-37.
   - Alternativas: (a) conferência pública só com protocolo, tipo, data e situação; (b) só por login; (c) nenhuma.
   - Riscos: (a) enumeração e exposição de dado pessoal se mal desenhada; (b) não atende ao uso; (c) documento não verificável.
5. Marca d'água de produção.
   - Pergunta: quando os documentos passam a valer e a marca sai (fly.toml:68-69)?
   - Por que importa: hoje o piloto emite documento que se declara sem validade.
   - O que bloqueia: uso oficial pelo município.
   - Alternativas: manter até homologação; retirar por município; retirar só depois das decisões 1 a 3.
   - Riscos: retirar antes de congelar o documento expõe o município a documento não reproduzível.
6. Retenção de documento versus minimização LGPD.
   - Pergunta: depois do prazo de retenção, o laudo emitido perde nome e relato (como hoje) ou é preservado como prova?
   - Por que importa: laudo reimpresso passa a dizer "removido por prazo"; uma cópia congelada manteria o dado.
   - O que bloqueia: decisão 1; DOC-28.
   - Alternativas: minimizar também a cópia guardada; guardar cópia íntegra por prazo legal; guardar cópia com campos pessoais cifrados.
   - Riscos: perder prova; manter dado além da finalidade; complexidade de chave. Base legal e prazos são do jurídico e do município.
7. Política de substituição, cancelamento, segunda via e reabertura.
   - Pergunta: como se corrige documento emitido com erro, e uma ocorrência encerrada pode ser reaberta ou só gerar ocorrência vinculada?
   - Por que importa: hoje o único caminho é nova vistoria ou nova ocorrência; ofício não cancela.
   - O que bloqueia: DOC-18, DOC-27, REQ-029; reinspeção da V2.
   - Alternativas: substituir com vínculo; cancelar com motivo; reabrir com motivo e trilha.
   - Riscos: histórico confuso sem vínculo forte; reabrir contraria "registro não se apaga, se encerra".
8. Operador classifica e despacha?
   - Pergunta: em município onde o operador é o coordenador, o papel some; decidir por escrito.
   - Por que importa: PAPEIS_E_RESPONSABILIDADES.md:58-62 admite a divergência sem decisão.
   - O que bloqueia: CA-01 como o Alyson escreveu.
   - Alternativas: manter; conceder classificar e despachar ao operador; permissão por município.
   - Riscos: classificação sem competência técnica; fila travada no plantão; complexidade de configuração.
9. Unidade, nível de sigilo e MFA por política.
   - Pergunta: o piloto e consórcios precisam de unidades e de sigilo? A exigência de MFA passa a ser configuração do município?
   - Por que importa: AUT-01, AUT-03, AUT-04 do Alyson.
   - O que bloqueia: isolamento intra-município e consórcio.
   - Alternativas: adiar para MVP 2; implementar unidade como coluna e política; só MFA por organização.
   - Riscos: retrabalho em todas as consultas se a coluna entrar tarde.
10. Em que lugar o documento vive na V2 (portal de órgãos).
    - Pergunta: o ofício vira tarefa dentro do portal, substituindo o link único por email?
    - Por que importa: recebimento, aceite, devolução e anexos da superfície 4 dependem de o documento ser entidade guardada.
    - O que bloqueia: DOC-36, REQ-086.
    - Alternativas: manter email com link; portal com tarefa e documento; híbrido.
    - Riscos: duplicar canais; LGPD do usuário externo.
11. Aceite de termos e modelo de documento por município.
    - Pergunta: texto, versão e dono do aceite; quem mantém timbre, fundamento e modelos por município.
    - Por que importa: AUT-05 do Alyson; CFG-01 e RN-10.
    - O que bloqueia: REQ-005, REQ-036.
    - Alternativas: termos fixos do fornecedor; termos por município com versão; modelo por município configurável.
    - Riscos: texto jurídico inventado; explosão de variações de modelo.
12. Registrar formalmente PWA versus nativo.
    - Pergunta: escrever um ADR que registre a troca (hoje só CLAUDE.md).
    - Por que importa: RNF-10, VIS-01 divergem do documento do Alyson.
    - O que bloqueia: nada técnico; risco de leitura errada por terceiros.
    - Alternativas: ADR novo; nota na especificação.
    - Riscos: mínimo.

## Riscos arquiteturais

- O documento é função de estado mutável. Nome do agente, equipe, coordenada, fotos, retenção e modelo mudam o que a reimpressão diz. Qualquer contestação depende do papel impresso.
- Dois montadores para um modelo (documentos.ts e pacote.ts). Cada correção de conteúdo precisa ser dobrada; já existe um teste vermelho por isso e quatro divergências latentes.
- Trilha append-only por privilégio, sem selo criptográfico: dono do banco ou quem restaura de backup reescreve sem rastro verificável. Não há cadeia de hash nem âncora externa.
- Identificador de 48 bits derivado de dados não secretos, recalculado por varredura: prova que a emissão existe na base, não autenticidade do conteúdo, e não serve para terceiros.
- Geração de PDF no processo da API, com 1 GB de memória, relógios no mesmo processo e pacote de saída em memória: um único ponto de falha no dia em que mais precisam (emissão sob enchente, saída de município).
- Modelo de ofício (uma linha mais remontagem) não sustenta o fluxo do portal de órgãos da V2, que exige documento como entidade com estados, anexos e vínculos.
- Conflito entre minimização LGPD e documento como prova: a solução técnica depende da decisão jurídica 6.
- Escalabilidade: a conferência varre todas as emissões do município e a trilha cresce sem teto.

## Dívidas técnicas

- Unificar a montagem de `DadosDocumento` em uma função usada pela rota e pelo pacote, e consertar o teste vermelho.
- Registrar leitura de ofício e de fotos em ocorrencia_consultas (novo RecursoConsultado).
- Corrigir `dataParaPlanilha` para o fuso do município (usar fusoDoEstado) e o ano do protocolo para o relógio do banco.
- Coluna com o código na trilha e índice, em vez de varredura completa (o próprio comentário de documentos.ts:868-871 prevê).
- Rótulos de cargo hardcoded em laudo.ts:672 e 816.
- Documentação desatualizada: web/PENDENCIAS.md itens 1 e 5, README.md:1361-1364, README sobre MapLibre (web/PENDENCIAS.md item 3), GUIA-DO-COORDENADOR.md:124.
- PDFs de desinterdição e ofício; `javaScriptEnabled: false` e bloqueio de rede interna no contexto do Chromium.
- Rota de administração de conta sem tela (reset de senha e encerramento de sessões de terceiros), já apontada pela auditoria de 30/09 e confirmada aqui (nenhuma página usa).
- `ON CONFLICT DO NOTHING` na emissão engole a repetição sem registrar formato e autor das demais.
