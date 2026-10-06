# Fora da V2: o que entrou em 2026-10-01 e o que continua fora

Em 2026-10-01 Rafael declarou que a V2 é ABSOLUTA: tudo que foi planejado entra. As decisões D-07 a D-29 (`01-decisoes-e-principios.md`, seção 11) retiraram da lista de "fora" quase tudo o que ela continha. Este arquivo agora tem duas listas e uma regra:

1. **Seção 1: itens que continuam fora da V2.** São só os que o parágrafo final da seção 11 de `01` mantém fora e os que as etapas das fases F29 a F35 declaram como fora. Cada um tem o gatilho para reavaliar.
2. **Seção 2: itens que entraram na V2 em 2026-10-01.** Cada um com a decisão (PR:D-xx) e a fase e a etapa que o cobre. Os 44 itens antigos mantêm o NÚMERO original (a numeração não foi refeita, porque outros arquivos citam "item N de `21-fora-da-v2.md`"); onde um item foi só em parte coberto, a parte que ficou fora reaparece na seção 1 com o mesmo número.
3. **Seção 3: lacunas L1 a L26.** Todas entraram (D-20; CP-40 decidido), distribuídas nas fases donas.

**Regra:** item que continua fora NÃO reaparece escondido numa etapa. Nenhuma etapa pode listá-lo em "O que deve ser implementado". Se um item da seção 1 passar a ser necessário, ele sobe pelo checkpoint CP-35 (revalidação, feita em F28-E12), com custo e justificativa, e só depois ganha etapa.

**Como a regra é conferida:** a verificação final procura os termos dos itens da SEÇÃO 1 nos campos "O que deve ser implementado" de todas as etapas. Aparecer ali reprova o roadmap. Em "O que NÃO deve ser implementado" e em "Estado atual" a menção é permitida (é assim que a etapa se protege de expansão acidental). Os termos da seção 2 (vídeo do cidadão, SMS, PostGIS, abrigos e outros) deixaram de ser vigiados: são escopo da V2.

**Ganchos:** onde a V2 deixa um ponto de extensão sem implementar o item, o gancho está descrito e a etapa que o cria está nomeada. Gancho é estrutura (coluna opcional, interface), nunca funcionalidade.

**Estado ainda aberto:** o que depende de contratação, credenciamento, parecer ou escolha humana NÃO está fora da V2: está implementado e DESLIGADO, atrás de um checkpoint (CP-NOVO-...). Está listado na seção 4.

## 1. Itens que continuam fora da V2

O número é o do item na lista antiga; os números de 45 em diante são de itens que as fases novas declararam fora.

| # | Item fora | Por que fica fora | Gatilho para reavaliar | Gancho que a V2 deixa | Origem |
| --- | --- | --- | --- | --- | --- |
| 3 | Relato anônimo | O canal do cidadão exige conta verificada com CPF no relato identificado; anonimato elimina retorno e bloqueio por pessoa. A D-07 manteve a exclusão de propósito | Taxa de abandono no login alta e abuso baixo, medidos no beta e no piloto | Nenhum; toda porta de entrada do canal termina em conta com CPF (F15-E16, F17-E20) | PR:D-07, PR:D-03, DP:R4, DP:K9 |
| 4 | Vídeo de secretaria, de prefeitura e de vistoria (o vídeo do relato do cidadão ENTROU: ver seção 2) | A V2 aceita um vídeo por relato, só do cidadão; vídeo de outras origens repete custo, moderação e superfície de ataque | Caso de uso real que justifique o custo | Cadeia de arquivos com classes e tipos configuráveis (F06-E02, F06-E09) | PR:D-07, DP:K12 |
| 5 | Tempo real: conversa do relato, quadro de incidente e abrigo ao vivo (WebSocket, SSE, long polling) | A conversa por relato ENTROU sem tempo real (o app consulta e recebe push); as telas de incidente consultam ao abrir, por botão e a cada 30 segundos | Volume de conversa que a consulta periódica não atende, medido no piloto | Mensagem pública separada da nota interna (F16-E08); consulta periódica (F29-E10 a E12, F34-E08) | PR:D-07, DP:T31 |
| 12 | Tema por secretaria e tema completo editável (segunda cor, fonte, raio); logotipo em SVG | O white-label por município ENTROU com UM logotipo (PNG ou JPEG) e UMA cor de destaque, com contraste AA validado na gravação. O resto exige portão de contraste por tema e superfície nova de ataque (SVG) | Município ou secretaria pedir identidade própria além da cor de destaque | Lista fechada de cinco tokens derivados (F08-E10, F08-E11); `derivarTemaDoMunicipio` | PR:D-11, DP:T17, DP:K19 |
| 13 | Libras em vídeo; idiomas além de inglês e espanhol; tradução automática em tempo de execução por serviço de terceiro; tradução juramentada | Inglês, espanhol e VLibras ENTRARAM; os demais não têm público definido e a tradução automática mandaria texto de caso a terceiro | Piloto mostrar público que precise | Catálogo `packages/i18n` com chaves por idioma (F08-E08) | PR:D-12, DP:K20 |
| 14 | Impersonation completa do fornecedor (entrar como o usuário do município, com escrita) | O suporte assistido, SOMENTE LEITURA, nominal, com prazo e trilha, ENTROU; entrar como usuário contradiz "nenhuma credencial lê dado de dois municípios" (ADR 0008) | Parecer jurídico e decisão pós-piloto (CP-30) | Pacote de diagnóstico sem dado pessoal (F20-E08); concessão por prazo (F10-E16) | PR:D-10, DP:T38, DP:J10 |
| 16 | Integração com 190, 192 e 193 (despacho e acionamento de emergência) | As integrações oficiais ENTRARAM (S2ID, SEI, Defesa Civil Alerta, Cemaden, WhatsApp, camadas GIS), mas promessa sem API ou autorização é proibida; estes serviços não têm API pública validada | API oficial validada e contrato | Porta única de integração (F31-E01, F31-E02); aviso fixo "ligue 190, 192 ou 193" (F34-E08) | PR:D-14, ALY §4.1 |
| 17 | Cadastro nominal de abrigados (dado pessoal sensível); abrigo guarda só contagens | F29-E09 declara fora até o checkpoint; o dado é sensível e a finalidade não está definida | CP-65 decidir que entra (então vira etapa nova da F29); se negar, permanece fora | Local e ocupação por contagem (F29-E09) | PR:D-15, ALY §7 |
| 22 | Redis, fila distribuída e broker de mensagens fora do Postgres | A-03: duas camadas (borda e cotas no banco) e fila com lease no Postgres, sem Redis, salvo evidência | Medição mostrar que as cotas e a fila no banco não bastam | Cotas persistentes (F03-E19, F15-E10); fila com lease (F07-E02) | PR:A-03 |
| 23 | Atestação de aplicativo e CAPTCHA | Só com abuso observado (CP-27); a F34 confirma que não os faz | Taxa de spam acima do tolerado no beta ou no piloto | Limites e bloqueio manual (F15-E09 a E11, F34-E11) | DP:K9 |
| 25 | Transferência direta entre secretarias (a competência por COBRADE e território ENTROU) | A secretaria devolve e SUGERE destino; quem reencaminha é a Defesa Civil (F11-E15, F10-E05) | Gargalo comprovado na Defesa Civil | Destino sugerido na devolução (F11-E15) | DP:T10, DP:T11, PR:D-23 |
| 26 | Unidade administrativa dentro do órgão | Sem cliente que exija; F03-E05 a exclui de modo expresso | Órgão grande com várias unidades | Nenhum criado pela V2 (a coluna opcional prevista antes não está em F03-E05) | DP:Anexo 5 |
| 27 | Ambiente dedicado ou instalação local | Só depois de existir cliente que pague o custo | Cliente pagante | Nenhum | ALY §15.1 |
| 28 | Previsão meteorológica, hardware, sensores e sirenes; substituir o S2ID, o Defesa Civil Alerta ou o Cemaden | Fora do escopo do produto; as integrações são conectores, nunca substitutos (F31) | Nenhum | Nenhum | ALY §4.1 |
| 29 | BI, regras de SLA e formulários do "MVP 2" do documento original, além dos formulários de abertura por tipo da D-17 | Os formulários de D-17 ENTRARAM (F33-E09); o que sobra é substituído pelo desenho da V2 | Pedido do piloto | Indicadores do painel e versões de configuração (F33) | ALY §4, PR:D-17 |
| 30 | Transferência de relato entre municípios | Quebraria o isolamento entre tenants | Nenhum | Mensagem "seu município ainda não usa o canal" (F16-E05) | DP:T20 |
| 32 | Pacote `ui-web` compartilhado entre painel e portal | O portal escreve os próprios componentes sobre os tokens; extrair agora obrigaria refatorar o painel antes do portal | Duplicação medida que justifique o pacote (dois consumidores reais) | Nenhum | DP:T16, DP:T28a |
| 34 | Bloqueio de conta de cidadão pelo fornecedor com efeito em todos os municípios | A conta do cidadão é do realm global, mas a V2 bloqueia por município (F15-E11), por isolamento; o bloqueio global exige parecer (CP-26) e superfície nova no console | Abuso reincidente que atravesse municípios | Bloqueio por município e realm global (F15-E11) | DP:J11 |
| 35 | Tela de carga da malha municipal no console (a carga por script ENTROU) | A malha do IBGE é carregada por `scripts/carregar-malha-ibge.mjs` e por semente em HML (F32-E03); a etapa exclui a tela no console | Mais municípios habilitados do que o processo por script comporta | Script de carga que valida e grava `fonte_sha256` (F32-E03) | DP:T20, PR:D-16 |
| 44 | Nota fiscal e cobrança por gateway (contrato, plano, vigência e demonstrativo ENTRARAM) | F20-E14 não emite cobrança; o checkpoint decide se nota e gateway entram | CP-61 decidir | Demonstrativo mensal por município (F20-E14) | PR:D-19, REL:04 |
| 45 | Relato aberto por mensagem de WhatsApp; WhatsApp NÃO oficial em qualquer hipótese | O WhatsApp oficial ENTROU só para aviso e orientação (F31-E10 não cria relato); relato por mensagem conflita com conta e CPF obrigatórios | CP-79 aceitar, com parecer jurídico | Resposta fixa de orientação (F31-E10) | PR:D-14, PR:D-07 |
| 46 | WFS, catálogos de camadas por jurisdição, camada GIS dentro do app do agente, reprojeção entre sistemas de coordenadas | A V2 entra com GeoJSON, KML e WMS por referência; o mapa offline do aparelho é da F14-E21 | Município exigir fonte que só existe em WFS ou em catálogo | Núcleo de integração e leitor de GeoJSON e KML (F31-E02, F31-E11) | PR:D-14 |
| 47 | Geocodificação, rota e navegação, edição de geometria no mapa | O produto não geocodifica (teste `mapa-e-coordenada` reprova); a rota da logística é a sequência de paradas escrita pela coordenação | Pedido do piloto | Coordenada declarada marcada (F19-E02); paradas escritas (F30-E09) | PR:D-16, PR:D-15 |
| 48 | Integração com ERP, nota fiscal e sistema de doações; roteirização automática; previsão de demanda; cadastro de doador como relacionamento; medicamento e itens controlados | A logística entra completa em estoque, doação, carga e entrega, sem estes acoplamentos; itens controlados dependem de checkpoint | Município pedir a integração com sistema próprio; CP-68 | Categoria controlada recusada pelo catálogo (F30-E03) | PR:D-15, ALY §5.3 |
| 49 | Edição ou exclusão de mensagem pelo cidadão; chamada de voz ou de vídeo; legenda automática do vídeo | A correção é mensagem nova (registro não se apaga); legenda automática mandaria a voz de terceiros a serviço externo | Pedido do beta e parecer sobre o serviço de legenda | Conversa append-only (F34-E05) | PR:D-07 |
| 50 | Configuração por órgão ou por secretaria; tipo ou severidade novos; migrar ocorrência em andamento para versão nova; texto jurídico livre nos modelos | Os tipos são os oito da COBRADE (o município liga, desliga e renomeia o rótulo); publicar nunca altera o que está em andamento | Município pedir, com parecer sobre texto jurídico | Versão aplicada guardada em cada ocorrência, vistoria e documento (F33-E01, F33-E04) | PR:D-17 |
| 51 | Documento oficial em outros idiomas | O documento emitido permanece em português do Brasil; tradução de texto com efeito jurídico exigiria parecer | Município ou parecer exigir | Cabeçalho com logotipo e nome, congelado no snapshot (F35-E08) | PR:D-12 |

## 2. Itens que entraram na V2 em 2026-10-01

Cada linha é um item da lista antiga. "Cobertura" cita a fase e as etapas que o implementam; o gate da fase é o que o prova. Entrar na V2 significa estar implementado e provado em HML com dado sintético; a ativação real, quando depende de contratação, credenciamento ou parecer, fica atrás do checkpoint citado e DESLIGADA em produção.

| # | Item que entrou | Decisão | Cobertura (fase e etapas) | O que continua atrás de checkpoint ou fora |
| --- | --- | --- | --- | --- |
| 1 | Multi-município para órgão externo autenticado (concessionária, órgão estadual, bombeiros) | PR:D-08 (revoga D-02 e A-01) | F03-E01, E05, E16, E17, E18; F10-E02, E03; F11-E04, E23, E24, E29; F12-E08; F25-E14 | CP-51, CP-51, CP-59 (modo "Todos") |
| 2 | Entidade Pessoa global (uma conta da pessoa, vínculo em cada município e órgão) | PR:D-08 | F03-E01, E02, E15, E16, E18; F11-E04, E05 | CP-49, CP-50, CP-50 |
| 4 (parte) | Vídeo do relato do cidadão (até 30 s e 50 MB, um por relato) | PR:D-07 | F06-E18 a E21; F07-E10, E11; F16-E12; F34-E02, E03, E04, E09, E10; F24-E10; F25-E18 | CP-47, CP-11, CP-26 |
| 5 (parte) | Conversa por relato (mensagens, fotos, não lidas, moderação), sem tempo real | PR:D-07 | F34-E05 a E10, E18, E19 | CP-94 |
| 6 | Login por SMS | PR:D-07 | F34-E12, E15, E17 | CP-92 |
| 7 | Login com gov.br | PR:D-07 | F34-E12, E13, E14, E17 | CP-91 |
| 8 | Login social (Google e Apple) | PR:D-07 | F34-E12, E16, E17 | CP-93 |
| 9 | CPF do cidadão, obrigatório no relato identificado | PR:D-07 (reverte DP:T19) | F05-E13, E14; F15-E16; F16-E16; F17-E20; F18-E13; F34-E14; F25-E17 | CP-46 e CP-11 antes de CPF real e da abertura pública |
| 10 | PostGIS, busca por raio, por imóvel e por área de risco | PR:D-16 (reverte DP:T36) | F01-E21, E22; F32-E01 a E16 (E14 reconcilia F10-E24, F16-E05 a E07); F24-E11 | CP-44, CP-85, CP-86, CP-87 |
| 11 | Assinatura avançada e ICP-Brasil por provedor externo | PR:D-09 | F09-E19 a E28; F10-E32, E35; F24-E13; F25-E16 | CP-41 e parecer J8: a tela continua dizendo APROVAÇÃO AUTENTICADA até lá |
| 12 (parte) | White-label por município: logotipo PNG ou JPEG, nome de exibição e uma cor de destaque com contraste AA | PR:D-11 | F08-E07, E10, E11; F35-E01 a E08, E13; F11-E07; F23-E12 | CP-95 |
| 13 (parte) | Inglês, espanhol e VLibras nas telas web e nos apps | PR:D-12 | F08-E08, E09, E12; F11-E27, E30; F17-E15; F35-E09 a E12, E14; F23-E10, E11 | CP-73 (e CP-73), CP-45 |
| 14 (parte) | Suporte assistido do fornecedor: acesso temporário, nominal, com MFA, somente leitura | PR:D-10 | F10-E16; F20-E01, E11; F25-E15; F26-E12 | CP-30 (parecer J10), CP-54 |
| 15 | Tracing distribuído e SLO por rota crítica (OpenTelemetry com destino configurável) | PR:D-13 | F21-E10 a E14; F25-E19 | CP-60 |
| 16 (parte) | Integrações oficiais: WhatsApp, camadas GeoJSON, KML e WMS, Cemaden a confirmar, adaptador e sandbox de S2ID, SEI e Defesa Civil Alerta | PR:D-14 | F31-E01 a E20 (WhatsApp E07 a E10; camadas E11 a E13; Cemaden E14; S2ID E15; SEI E16; alerta E17; tela e console E18); F25-E16 | CP-78, CP-80, CP-81, CP-82, CP-83, CP-84, CP-77; ativação real só com credenciamento, nunca em produção ao fim da F31 |
| 17 (parte) | Incidentes, abrigos e logística humanitária completos (INC-01 a INC-04, ABR-01, LOG-01 a LOG-07, RN-08, RN-09), no painel e no app do agente offline | PR:D-15 | F29-E01 a E18; F30-E01 a E18; F26-E08; F27-E07 | CP-62, CP-63, CP-64 e os de logística da seção 4; cadastro nominal de abrigados segue fora (item 17, seção 1) |
| 18 | Importação de lote por CSV (ALY:OCO-08) | PR:D-17 | F33-E12 a E15, E16 | CP-90 |
| 19 | Configuração versionada de tipos, severidades, prazos, formulários e modelos (ALY:CFG-01, ALY:RN-10) e checklist por tipo com perguntas condicionais (ALY:VIS-05) | PR:D-17 | F33-E01 a E11 (checklist: E05 a E08; formulário de abertura: E09; modelos: E10) | CP-88, CP-89 |
| 20 | Painel e portal instaláveis na tela inicial (PWA), sem funcionar offline | PR:D-22 | F10-E15; F11-E26; F23-E09 | Os apps do campo e do cidadão continuam React Native; nenhum PWA offline |
| 21 | Reabertura de ocorrência encerrada, com motivo, por 30 dias (configurável); depois, só ocorrência vinculada | PR:D-21 (resolve CP-23) | F13-E06, E09, E10, E11 | Nenhum |
| 24 | Cadeia de escalonamento acima do gestor do órgão | PR:D-18 | F04-E10, E16; F10-E06, E18; F11-E28 | CP-53, CP-21 |
| 25 (parte) | Competência do órgão por COBRADE e território | PR:D-18 | F04-E15; F10-E17, E19; F11-E28; F32-E10 | CP-53; a transferência direta segue fora (item 25, seção 1) |
| 31 | Trava contra migration concorrente e regra de migration reversível | PR:D-19 | F01-E18 | Nenhum |
| 33 | Lint e formatação padronizados no monorepo (inclui a regra de acessibilidade para React Native: F23-E02) | PR:D-19 | F01-E17; F23-E02 | Nenhum |
| 35 (parte) | Carga da malha municipal por script e semente | PR:D-16 | F32-E03 | CP-85; a tela no console segue fora (item 35, seção 1) |
| 36 | Ciclo de vida do operador do console (reativar, reutilizar e-mail, transferir o dono) e edição de dado cadastral da prefeitura pelo fornecedor | PR:D-19 | F20-E12, E13 | Nenhum |
| 37 | Rotinas do fornecedor sem credencial de dono do banco (teto, consumo, órfãos) | PR:D-19 | F20-E15 | Nenhum |
| 38 | Exercício anual de recuperação de desastre de ponta a ponta | PR:D-19 | F22-E10 (e E06, E11) | CP-37 (medição de RPO e RTO) |
| 39 | Pentest recorrente e revisão de segurança por etapa | PR:D-19 | F25-E21; F28-E16 | CP-74, CP-33 |
| 40 | Varredura de contêiner, SBOM e verificação de licenças | PR:D-19 | F01-E19, E20; F25-E21 | CP-43 |
| 41 | Redundância de máquinas da API e do console | PR:D-19 | F07-E12, E13; F22-E11 | CP-31 (disponibilidade a prometer) |
| 42 | Indicadores por órgão no painel da Defesa Civil, sem ranking | PR:D-19 | F10-E21 | CP-56 |
| 43 | Dívida de estilo do painel: estilo inline, letter-spacing literal e HTML da API com cores literais | PR:D-19 | F10-E22 | Nenhum |
| 44 (parte) | Contrato, plano, vigência e demonstrativo de faturamento no console | PR:D-19 | F20-E14 | CP-61; nota fiscal e gateway seguem fora (item 44, seção 1) |

## 3. Lacunas do MVP do Alyson: todas entraram (D-20; CP-40 decidido)

A matriz `17-rastreabilidade.md` encontrou requisitos do documento do Alyson e gaps do Baseline que o repositório atendia só em parte. A D-20 as distribuiu como etapas novas ao fim das fases donas. Esforço é relativo (XS, S, M, L), como nas etapas.

| # | Requisito | Lacuna | Cobertura (fase e etapas) |
| --- | --- | --- | --- |
| L1 | ALY:GEO-01 (M) (também GAP-P1P-40, REQ-030) | Mapa sem filtros por tipo, estado e severidade; lista sem filtro por tipo | F10-E23 |
| L2 | ALY:OCO-02 (M) | Operador não anexa arquivo à ocorrência no painel | F06-E17; F10-E29 |
| L3 | ALY:OCO-04 (S) | Duplicidade manual só por tipo, trecho do endereço e 48 horas | F10-E24 (com o índice espacial da F32-E14) |
| L4 | ALY:OCO-05 (M) | Sem entidade imóvel nem histórico territorial | F32-E07, E09 |
| L5 | ALY:OCO-01, ALY:RN-02 e ALY:RNF-14 (M) | Ano do protocolo e fuso do CSV pelo relógio do processo | F02-E09 |
| L6 | ALY:VIS-04 e ALY:RNF-08 (M) | Compressão configurável, upload retomável e antivírus de foto | F06-E21, E22, E23; F14-E22 |
| L7 | ALY:VIS-08 (M) | Aditamento avulso de vistoria, com justificativa versionada | F14-E19, E20 |
| L8 | ALY:DOC-02 (M) | Notificação, relatório fotográfico avulso e modelos por organização e tipo | F09-E16, E17, E18; F10-E33, E36 |
| L9 | ALY:FLU-01 (M) | Prioridade da providência | F04-E14; F10-E20 |
| L10 | ALY:REL-01 (M) | Relatório em PDF e CSV com cabeçalho de filtros | F10-E25 |
| L11 | ALY:AUD-01 e ALY:AUT-02 (M) | Login, saída e falha de login fora da trilha; sem consulta à própria trilha | F03-E20; F10-E30 |
| L12 | ALY:AUT-03 (M) | Sem nível de sigilo por ocorrência | F03-E21; F10-E31 (a unidade segue fora: item 26) |
| L13 | ALY:RNF-07 (M) | Limitador de taxa e falhas de login da API de servidores em memória | F03-E19 |
| L14 | ALY:RN-04 (M) | Precisão da coordenada não guardada | F10-E26 |
| L15 | ALY:CA-01 (M) | O critério dizia que o operador classifica e despacha; só a coordenação o faz | PR:D-24 (decisão de papel, sem etapa; refletida em `20-matrizes.md`) |
| L16 | ALY:VIS-05 (M) | Checklist único para todos os tipos | F33-E05 a E08 |
| L17 | GAP-P1O-19 (CMP-12) | Agente sem equipe perde o histórico | F14-E17 |
| L18 | GAP-P1O-07 (REL:05) | Motivo mínimo do encerramento de 1 caractere | F10-E27 |
| L19 | GAP-P1O-42 e GAP-P1O-43 | Aparelho revogado sem expurgo | F05-E15; F15-E17 |
| L20 | GAP-P1P-11 (BZ-D:CON-52) | A prefeitura não lê os atos do fornecedor | F20-E16 |
| L21 | GAP-P1P-32 (BZ-D:UPL-04) | Cenário de upload do agente de outra equipe | F03-E14 |
| L22 | GAP-P1P-04 (BZ-D:PRF-24) | Edição dos dados do chamado depois do registro | F10-E28 |
| L23 | GAP-P1P-09 e GAP-P1P-43 | Aditamento por texto, mapa offline e fila de revisão do coordenador | F14-E19, E20, E21 |
| L24 | GAP-P1P-13 (BZ-D:CON-54) | Livro de eliminações no console | F20-E17 |
| L25 | GAP-DEF-09 (BZ-D:CMP-44) | Foto e assinatura obrigatórias só no cliente | F14-E18 |
| L26 | GAP-DEF-10 (BZ-D:CMP-04) | Segundo fator do agente sem tela de código | F14-E16 (PR:D-27) |

## 4. O que está implementado mas DESLIGADO atrás de checkpoint

Não é "fora da V2": a etapa existe e é provada em HML com dado sintético. Fica desligado, ou sem dado real, até a decisão humana. Detalhe e dono de cada checkpoint em `STATUS.md`, seção 7B (o coordenador numera depois).

- **Contratação ou credenciamento:** WhatsApp, SMS, gov.br, login social, S2ID, SEI, Defesa Civil Alerta, Cemaden, provedor de assinatura, tracing, valores do contrato.
- **Parecer jurídico ou do encarregado:** CPF obrigatório, pessoa global, termo do órgão externo, termo do logotipo, nomenclatura da assinatura (J8), suporte assistido (J10), dados de doador e recebedor.
- **Escolha humana ou do município:** níveis e comando do incidente, papéis de incidente e logística, saldo negativo offline, aprovação de ajuste de estoque, categorias controladas, níveis de sigilo, escalonamento e competência, publicação de configuração, checklists por tipo, escopo da importação, fontes de camada e malha, revisão das traduções, VLibras.

## Itens que NÃO estão fora da V2 (para evitar mal-entendido)

- Criptografia local do app do agente, sincronização em segundo plano e atualização remota (OTA) são decisão do checkpoint CP-24 dentro da F14, não adiamento automático.
- Escalonamento por percentual do prazo e lembretes ENTRAM (F04-E10), assim como a cadeia acima do gestor do órgão (F04-E16): nada disso está fora.
- Documento imutável, aprovação autenticada, PDF guardado E a assinatura por provedor externo ENTRAM (F09). A nomenclatura "assinatura" só vale depois do parecer J8.
- Reinspeção E reabertura de ocorrência encerrada ENTRAM (F13); a ocorrência vinculada vale depois de 30 dias.
- Anti-abuso base (conta verificada, limites em duas camadas, bloqueio manual, moderação humana) ENTRA (F15, F34-E11); o que fica fora é o que exige abuso observado (itens 3, 22 e 23).
- Incidente, abrigo e logística ENTRAM como módulos completos (F29, F30); o que fica fora é só o cadastro nominal de abrigados e os acoplamentos do item 48.
- Idiomas inglês e espanhol, VLibras e identidade visual por município ENTRAM (F35); o que fica fora são os itens 12, 13 e 51.
- A ativação real de qualquer integração em produção NÃO ocorre ao fim da F31: é um passo de produção por checkpoint, e a F28-E15 registra o estado em produção.
