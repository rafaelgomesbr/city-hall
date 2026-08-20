# Especificação técnica preliminar: Plataforma Defesa Civil Operacional 360

Transcrição em texto de `Defesa_Civil_Operacional_360_Especificacao_Tecnica_Preliminar.docx` (mesma pasta), para leitura e busca sem depender de abrir o binário. Fonte da verdade é o `.docx`; em caso de divergência, ele prevalece.

Destinatário técnico: Rafael. Responsável pela visão de negócio: Alyson. Versão e data: v0.1, 18 de agosto de 2026. Status: documento para análise, não constitui ETP, TR ou projeto executivo. Nome do produto provisório, sujeito à validação com Defesas Civis municipais.

**Decisão recomendada:** construir primeiro um sistema operacional de registro de ocorrências, despacho, vistoria de campo offline, evidências, documentos e acompanhamento. Preparar a arquitetura para o modo emergência e a logística humanitária, mas não tentar entregar tudo no primeiro MVP.

## Resumo executivo

A oportunidade não é criar outro aplicativo de alerta meteorológico nem substituir o S2ID. A dor mais concreta está na operação municipal diária: receber uma solicitação, classificar o risco, enviar uma equipe, vistoriar mesmo sem internet, registrar evidências, gerar o documento técnico, encaminhar providências e comprovar o encerramento.

Hoje, essa cadeia costuma ser fragmentada entre telefone, WhatsApp, planilhas, fotos pessoais, mapas separados e modelos de documentos. Quando ocorre uma emergência, a mesma equipe precisa ampliar rapidamente essa operação para equipes, abrigos, recursos e suprimentos. O produto proposto transforma esse fluxo em um único registro auditável e georreferenciado.

O primeiro comprador-alvo deve ser uma Defesa Civil municipal atuante ou um consórcio regional. O modelo técnico recomendado é SaaS multi-tenant, web responsivo e PWA offline-first. Aplicativos Android e iOS nativos não são necessários no MVP.

## Sumário de seções

1. Problema e recorte da oportunidade
2. Visão do produto e proposta de valor
3. Usuários e permissões
4. Escopo por fases
5. Fluxos operacionais
6. Requisitos funcionais do MVP
7. Evoluções para emergência e logística
8. Regras de negócio
9. Requisitos não funcionais
10. Arquitetura de referência
11. Modelo conceitual de dados
12. Integrações e APIs
13. Segurança e LGPD
14. Critérios de aceite
15. Roadmap e estimativa preliminar
16. Questões para Rafael
17. Validação de campo
18. Referências públicas

## 1. Problema e recorte da oportunidade

### 1.1 O que já existe e o que permanece descoberto

O governo federal e alguns estados oferecem componentes importantes, porém não há uma solução nacional padronizada que cubra integralmente a gestão operacional cotidiana das Defesas Civis municipais. Há iniciativas locais e estaduais próprias, o que comprova a necessidade, mas também mostra fragmentação e ausência de oferta uniforme.

| Camada existente | O que cobre | Lacuna que o produto deve preencher |
| --- | --- | --- |
| S2ID | Planos, registro de desastre, reconhecimento, solicitação e prestação de contas de recursos federais. | Não é o sistema diário de protocolo, despacho, vistoria, documentos, providências e encerramento de ocorrências locais. |
| Defesa Civil Alerta / IDAP | Envio de alertas à população por canais oficiais. | Não gerencia equipes, inspeções, evidências, documentos, abrigos ou materiais. |
| Cemaden e centros estaduais | Monitoramento de ameaças, chuva, rios e cenários de risco. | Não substituem o fluxo municipal de atendimento e comprovação da resposta. |
| Sistemas próprios locais | Alguns entes criaram soluções para suas rotinas. | Oferta fragmentada, com pouca padronização, suporte e produto replicável para municípios menores. |

**Posicionamento correto:** a solução será a camada operacional municipal e consorcial. Ela deverá produzir dados e documentos que facilitem o trabalho com sistemas oficiais, sem prometer substituir competências federais ou integrações ainda não disponíveis.

### 1.2 Evidências públicas da dor

- Jaboatão dos Guararapes justificou a contratação de solução web e aplicativo para ocorrências após registrar cerca de 14,7 mil ocorrências em 2022; o documento aponta limites de ferramentas gratuitas e inviabilidade do desenvolvimento interno [R3].
- O Estado do Rio de Janeiro desenvolveu internamente o PRODEC porque poucos municípios tinham recursos para comprar ou criar sistemas; 71 aderiram e 41 o utilizavam rotineiramente [R4].
- Aracaju e Eldorado do Sul também divulgaram sistemas próprios, sinal de que equipes atuantes procuram organizar solicitações, vistorias, documentos, resgates, abrigos, voluntários e recursos [R5-R6].
- Em consulta de inovação de Joinville, o desafio de gestão de donativos em calamidades recebeu apenas uma proposta, apresentada por pessoa física e ainda em nível de protótipo/demonstração. É sinal de escassez relativa, não prova isolada de mercado [R7].
- Estudo de mercado do Espírito Santo encontrou poucas alternativas maduras para gestão completa de incidentes e concluiu não haver equivalente nacional à solução internacional analisada [R8].

### 1.3 Dor prioritária

Para municípios com Defesa Civil atuante, a dor recorrente e orçamentariamente defensável é perder controle do ciclo operacional e da prova do atendimento. Isso aparece como demora na triagem, falta de histórico do imóvel, dificuldade para localizar fotos, documentos inconsistentes, providências sem retorno, dados pessoais em canais inadequados e pouca capacidade de demonstrar o que foi feito.

**Hipótese central:** se a equipe conseguir executar todo o ciclo da ocorrência em um único sistema, inclusive em campo sem conexão, ela reduzirá retrabalho, acelerará respostas e formará uma memória técnica útil para gestão de risco, defesa administrativa e auditoria.

## 2. Visão do produto e proposta de valor

Nome provisório: Defesa Civil Operacional 360. Categoria: sistema de registro operacional e coordenação de campo para municípios e consórcios públicos.

### 2.1 Proposta de valor

- Para a coordenação: visão em tempo real de prioridades, filas, prazos, equipes e áreas recorrentes.
- Para o agente de campo: formulário simples, offline, com GPS, fotos, assinatura e geração de relatório.
- Para a prefeitura: histórico auditável, documentos padronizados e proteção adequada dos dados.
- Para o município em emergência: continuidade do mesmo cadastro, agora agrupado em incidente, equipes, abrigos e logística.
- Para consórcios: visão regional e possibilidade futura de apoio mútuo, estoques compartilhados e consolidação de indicadores.

### 2.2 Resultados que devem ser medidos

| Indicador | Linha de base | Meta inicial de piloto |
| --- | --- | --- |
| Tempo da entrada à triagem | Medir no município-piloto | Redução mínima de 30% |
| Tempo para localizar o processo completo | Medir antes do piloto | Até 2 minutos por protocolo |
| Vistorias concluídas sem retrabalho documental | Medir no piloto | Pelo menos 85% |
| Providências vencidas sem responsável | Medir no piloto | Redução mínima de 50% |
| Evidências com data, local e autoria | Medir no piloto | Pelo menos 95% |
| Adoção semanal dos agentes | Não aplicável | Pelo menos 80% dos usuários ativos |

## 3. Usuários e permissões

| Perfil | Responsabilidades principais | Acesso típico |
| --- | --- | --- |
| Administrador da organização | Configura município, unidades, usuários, formulários e modelos. | Todos os módulos do tenant; sem acesso a outros entes. |
| Coordenador da Defesa Civil | Prioriza, distribui, supervisiona, ativa incidente e aprova documentos. | Painel completo, relatórios e auditoria. |
| Operador / plantonista | Registra chamados, localiza duplicidades, classifica e despacha. | Ocorrências, contatos e fila operacional. |
| Agente / vistoriador | Atende em campo, coleta evidências e propõe providências. | Suas tarefas, formulários offline e histórico necessário. |
| Técnico responsável | Valida laudos, interdições e documentos que exigem competência técnica. | Documentos, evidências e assinatura/aprovação. |
| Órgão parceiro | Recebe e responde encaminhamentos de Obras, Assistência, Meio Ambiente etc. | Somente demandas atribuídas e anexos autorizados. |
| Gestor / controle / auditor | Consulta indicadores, trilha de auditoria e exportações. | Leitura, relatórios e logs conforme perfil. |
| Cidadão | Abre solicitação e acompanha status não sigiloso. | Portal externo limitado por protocolo. |

Regra estrutural: permissões devem ser definidas por organização, unidade, perfil e, quando necessário, nível de sigilo. O sistema não deve assumir que todo servidor pode visualizar dados de famílias, documentos pessoais ou endereços sensíveis.

## 4. Escopo por fases

| Fase | Objetivo | Inclui | Não inclui |
| --- | --- | --- | --- |
| Descoberta | Validar o fluxo real e prototipar. | Entrevistas, mapa de processo, protótipo navegável e escolha técnica. | Código de produção. |
| MVP 1 | Resolver a rotina diária ponta a ponta. | Ocorrências, triagem, despacho, PWA offline, evidências, documentos, providências, mapa, painel e auditoria. | Logística completa, sensores, app nativo e integrações complexas. |
| MVP 2 | Aumentar gestão e colaboração. | Portal do cidadão, formulários configuráveis, integrações municipais, BI, assinatura e regras de SLA. | Centro completo de comando de incidentes. |
| Fase 3 | Operar emergências e logística. | Incidentes, equipes, quadro de situação, abrigos, recursos, estoques, doações, distribuição e prova de entrega. | Previsão meteorológica própria e despacho 190/193. |
| Fase 4 | Escala regional e interoperabilidade. | Apoio mútuo consorcial, APIs, integrações oficiais validadas e módulos especializados. | Promessas de integração sem API ou autorização. |

### 4.1 Fora do MVP

- Aplicativos nativos Android e iOS; a primeira entrega será PWA instalável.
- Previsão meteorológica, hardware, sensores, sirenes ou telecomunicações de emergência.
- Substituição do S2ID, Defesa Civil Alerta, Cemaden, 190, 192 ou 193.
- Integração não oficial com WhatsApp; somente API oficial em fase posterior.
- Gestão de obras de engenharia, prontuário de saúde ou benefícios socioassistenciais completos.
- Microserviços e infraestrutura de alta complexidade antes de existir escala que os justifique.

## 5. Fluxos operacionais

Figura 1: fluxo operacional diário proposto (diagrama original não incluído nesta transcrição em texto).

### 5.1 Fluxo A: ocorrência diária

1. Entrada por operador, formulário do cidadão, encaminhamento interno ou importação autorizada.
2. Busca por endereço, telefone, coordenada e assunto para sugerir possível duplicidade.
3. Triagem com tipo, gravidade, urgência, pessoas vulneráveis e risco de agravamento.
4. Designação de equipe e prazo; agente recebe os dados mínimos necessários.
5. Vistoria offline com checklist, GPS, precisão, fotos, observações, assinatura e classificação.
6. Geração de relatório, notificação, termo de interdição ou encaminhamento a outro órgão.
7. Acompanhamento de providências e alertas de vencimento.
8. Encerramento com motivo, responsável, evidências e trilha de auditoria.

### 5.2 Fluxo B: ativação de emergência

A coordenação cria um incidente e associa ocorrências já abertas, áreas, equipes e recursos. O sistema passa a oferecer quadro de situação, tarefas críticas, turnos e relatórios de período. O histórico das ocorrências permanece individual e auditável.

### 5.3 Fluxo C: suprimentos humanitários

Na fase 3, pontos de coleta, depósitos e abrigos registram entrada, lote, validade, condição, transferência, separação, entrega e comprovante. O saldo deve ser calculado por movimentos, sem edição direta silenciosa. Necessidades, estoque e promessas de doação devem ser comparados para reduzir excessos e faltas.

## 6. Requisitos funcionais do MVP

Prioridades: M = indispensável ao MVP; S = importante e deve entrar se o cronograma permitir; C = desejável; F = evolução futura.

### 6.1 Organização, usuários e acesso

| ID | Requisito funcional | Pri. | Critério de aceite resumido |
| --- | --- | --- | --- |
| AUT-01 | Cadastrar organizações, unidades e equipes em modelo multi-tenant. | M | Usuário de um tenant não consulta nem altera dados de outro. |
| AUT-02 | Autenticar por e-mail e senha com recuperação segura. | M | Fluxos de entrada, saída, bloqueio e redefinição funcionam e ficam registrados. |
| AUT-03 | Aplicar controle de acesso por perfil e unidade. | M | Rotas de API e interface respeitam as mesmas permissões. |
| AUT-04 | Permitir MFA para administradores e perfis críticos. | S | Segundo fator pode ser ativado e exigido por política da organização. |
| AUT-05 | Registrar aceite de termos e ciência de uso. | S | Versão, data, usuário e IP ficam disponíveis para auditoria. |

### 6.2 Ocorrências, protocolo e triagem

| ID | Requisito funcional | Pri. | Critério de aceite resumido |
| --- | --- | --- | --- |
| OCO-01 | Criar protocolo com número único por organização e ano. | M | Duas ocorrências não recebem o mesmo número; sequência é rastreável. |
| OCO-02 | Registrar solicitante, contato, endereço, coordenada, descrição e anexos. | M | Campos obrigatórios e regras variam conforme tipo de ocorrência. |
| OCO-03 | Classificar tipo, prioridade, risco, vulnerabilidade e prazo. | M | Classificação produz fila ordenada e histórico de mudanças. |
| OCO-04 | Sugerir possíveis duplicidades por endereço, coordenada, contato e período. | S | Operador confirma vínculo ou mantém protocolos independentes. |
| OCO-05 | Relacionar ocorrências ao mesmo imóvel, área ou evento. | M | Histórico territorial pode ser consultado sem mesclar registros. |
| OCO-06 | Atribuir equipe, responsável, prazo e instruções. | M | Responsáveis recebem a tarefa e a coordenação vê aceite e andamento. |
| OCO-07 | Manter linha do tempo imutável dos principais eventos. | M | Criação, edição, despacho, visita, documento e encerramento aparecem com autoria e data. |
| OCO-08 | Importar lote inicial por CSV validado. | C | Arquivo inválido gera relatório de erros sem criar dados parciais silenciosos. |

### 6.3 PWA de campo e vistoria offline

| ID | Requisito funcional | Pri. | Critério de aceite resumido |
| --- | --- | --- | --- |
| VIS-01 | Disponibilizar PWA responsiva e instalável. | M | Funciona nos navegadores móveis-alvo e apresenta estado de instalação/sincronização. |
| VIS-02 | Baixar tarefas e formulários para uso sem conexão. | M | Agente conclui uma vistoria em modo avião e sincroniza posteriormente. |
| VIS-03 | Capturar GPS, precisão, data/hora e autoria. | M | Metadados acompanham a inspeção e não são apresentados como precisão absoluta. |
| VIS-04 | Capturar fotos, legendas e ordem de evidência. | M | Fotos são comprimidas com qualidade configurada e upload retomável. |
| VIS-05 | Preencher checklist por tipo de ocorrência. | M | Perguntas condicionais, obrigatórias e opções padronizadas funcionam offline. |
| VIS-06 | Coletar assinatura na tela quando aplicável. | S | Assinatura registra finalidade, data e vínculo com o documento. |
| VIS-07 | Exibir rascunhos, pendências e conflitos de sincronização. | M | Nenhum dado é descartado sem aviso e ação explícita do usuário. |
| VIS-08 | Permitir complemento posterior sem apagar evidência original. | M | Aditamento é versionado com autoria e justificativa. |

### 6.4 Documentos, providências e acompanhamento

| ID | Requisito funcional | Pri. | Critério de aceite resumido |
| --- | --- | --- | --- |
| DOC-01 | Gerar relatório de vistoria em PDF a partir de modelo. | M | PDF contém protocolo, dados, checklist, fotos, autoria, data e versão. |
| DOC-02 | Gerar notificação, encaminhamento, termo e relatório fotográfico. | M | Modelos podem ser habilitados conforme a organização e o tipo. |
| DOC-03 | Versionar modelos e documentos emitidos. | M | Documento emitido preserva conteúdo e modelo da época. |
| DOC-04 | Permitir revisão/aprovação por responsável técnico. | S | Estados rascunho, em revisão, aprovado e cancelado têm permissões próprias. |
| FLU-01 | Criar providência com responsável, prazo, prioridade e órgão. | M | Providência aparece na fila do responsável e na linha do tempo. |
| FLU-02 | Registrar resposta e evidência de cumprimento. | M | Encerramento exige resposta ou justificativa de dispensa. |
| FLU-03 | Notificar prazos próximos e vencidos. | M | Alertas internos funcionam; canais externos são configuráveis em fase posterior. |
| FLU-04 | Encerrar e reabrir ocorrência com motivo obrigatório. | M | A ação fica auditada e não apaga dados anteriores. |

### 6.5 Mapa, painel, relatórios e auditoria

| ID | Requisito funcional | Pri. | Critério de aceite resumido |
| --- | --- | --- | --- |
| GEO-01 | Exibir ocorrências por coordenada, status, tipo e prioridade. | M | Filtros alteram mapa e lista de forma consistente. |
| GEO-02 | Consultar histórico por imóvel, raio ou área de risco. | S | Pesquisa retorna registros autorizados e diferencia coincidência aproximada. |
| PAI-01 | Exibir fila, prazos, volume, tipos e tempo de atendimento. | M | Indicadores respeitam filtros e permissões. |
| REL-01 | Exportar relatórios PDF e CSV. | M | Exportação identifica filtros, data, organização e responsável pela emissão. |
| AUD-01 | Registrar criação, alteração, consulta sensível e exportação. | M | Log contém usuário, ação, alvo, data, tenant e contexto técnico. |
| AUD-02 | Permitir consulta de auditoria somente a perfis autorizados. | M | Logs não podem ser alterados pela interface comum. |
| CFG-01 | Configurar tipos, prioridades, prazos e modelos básicos. | S | Configuração é versionada e não quebra registros históricos. |

## 7. Evoluções para emergência e logística

### 7.1 Modo incidente

| ID | Requisito funcional | Pri. | Critério de aceite resumido |
| --- | --- | --- | --- |
| INC-01 | Criar incidente com nível, período, área, comando e objetivos. | F | Incidente agrupa recursos sem apagar a autonomia das ocorrências. |
| INC-02 | Manter quadro de situação e linha do tempo operacional. | F | Atualizações têm autoria, horário e versão. |
| INC-03 | Gerenciar equipes, turnos, tarefas e check-in/check-out. | F | Coordenação visualiza disponibilidade e responsável por cada ação. |
| INC-04 | Emitir relatório de situação por período. | F | Documento consolida ocorrências, ações, recursos e pendências. |
| ABR-01 | Cadastrar abrigos, capacidade, ocupação e necessidades. | F | Painel mostra capacidade declarada e atualização mais recente. |

### 7.2 Logística humanitária 365

| ID | Requisito funcional | Pri. | Critério de aceite resumido |
| --- | --- | --- | --- |
| LOG-01 | Cadastrar depósitos, pontos de coleta, abrigos e responsáveis. | F | Locais possuem geografia, horário e permissões. |
| LOG-02 | Registrar item, unidade, lote, validade, condição e origem. | F | Campos obrigatórios variam por categoria e entrada gera movimento. |
| LOG-03 | Ler QR code ou código de barras quando disponível. | F | Leitura acelera operação, mas entrada manual permanece possível. |
| LOG-04 | Controlar entrada, transferência, separação, entrega e ajuste. | F | Todo saldo deriva de movimentos auditados; ajustes exigem motivo. |
| LOG-05 | Comparar necessidade, estoque disponível e promessa de doação. | F | Painel aponta falta, cobertura e excesso por local e período. |
| LOG-06 | Registrar carga, rota e comprovante de entrega. | F | Entrega vincula itens, quantidades, destino, recebedor e evidência. |
| LOG-07 | Operar estoque permanente de kits e simulados durante o ano. | F | Alertas de validade e inventário mantêm uso fora da calamidade. |

## 8. Regras de negócio essenciais

| Regra | Tema | Definição |
| --- | --- | --- |
| RN-01 | Isolamento por tenant | Todo registro operacional deve conter organização proprietária; consultas e arquivos devem aplicar a mesma segregação. |
| RN-02 | Protocolo | Número único por organização e exercício; cancelamento não libera o número para reutilização. |
| RN-03 | Evidência | Evidência usada em documento aprovado não pode ser substituída; correção ocorre por aditamento. |
| RN-04 | Geolocalização | Guardar coordenada, precisão informada pelo dispositivo, data, origem e possível ajuste manual justificado. |
| RN-05 | Encerramento | Exigir motivo, responsável e verificação das providências obrigatórias. |
| RN-06 | Conflito offline | Registros append-only, como fotos e eventos, são combinados; campos concorrentes exigem regra ou revisão humana. |
| RN-07 | Sigilo | Dados pessoais e endereços sensíveis nunca aparecem no painel público ou em exportação ampla sem autorização. |
| RN-08 | Incidente | Agrupar ocorrência não altera sua autoria, datas, documentos ou histórico. |
| RN-09 | Estoque futuro | Saldo é resultado da soma de movimentos; ajuste é um movimento com motivo e aprovação. |
| RN-10 | Configuração | Alterações de formulário ou modelo devem ser versionadas para preservar processos anteriores. |

## 9. Requisitos não funcionais

| ID | Área/requisito | Definição inicial | Fase |
| --- | --- | --- | --- |
| RNF-01 | Disponibilidade | Meta inicial de 99,5% mensal, excluídas janelas pactuadas; rever para operação de crise. | MVP |
| RNF-02 | Desempenho | 95% das operações online usuais em até 2 segundos, sem contar upload de mídia. | MVP |
| RNF-03 | Offline | Vistoria essencial disponível sem rede; fila de sincronização visível e retomável. | MVP |
| RNF-04 | Segurança | TLS, senhas com algoritmo forte, segredo fora do código, RBAC e validação no backend. | MVP |
| RNF-05 | Auditoria | Logs protegidos contra alteração comum, com retenção e pesquisa configuráveis. | MVP |
| RNF-06 | Backup | Hipótese inicial: RPO 24h e RTO 8h; Rafael deve avaliar custo e necessidade do piloto. | MVP |
| RNF-07 | Escala | Arquitetura multi-tenant capaz de escalar horizontalmente os componentes críticos. | MVP |
| RNF-08 | Mídia | Compressão, miniaturas, upload retomável e política de retenção por organização. | MVP |
| RNF-09 | Acessibilidade | Interface compatível com WCAG 2.1 AA nos fluxos principais. | MVP |
| RNF-10 | Compatibilidade | Chrome/Edge atuais; Android atual e iOS recente via navegador/PWA, com limites documentados. | MVP |
| RNF-11 | Observabilidade | Métricas, logs estruturados, alertas de erro e rastreio de jobs e sincronizações. | MVP |
| RNF-12 | Portabilidade | Exportação dos dados e documentos do tenant em formato documentado. | MVP |
| RNF-13 | Manutenibilidade | Testes automatizados, migrações versionadas, CI/CD e ambientes separados. | MVP |
| RNF-14 | Localização | Português do Brasil, datas e fusos corretos; considerar atuação regional futura. | MVP |
| RNF-15 | Continuidade | Plano de contingência técnica e procedimento de operação degradada antes da fase 3. | Fase 3 |

**Hipóteses, não promessas:** disponibilidade, RPO, RTO e desempenho precisam ser recalculados depois que Rafael escolher hospedagem, banco, estratégia offline e política de mídia. Os números acima orientam a estimativa inicial.

## 10. Arquitetura de referência

A recomendação é começar com um monólito modular, API-first e multi-tenant. Microserviços aumentariam custo operacional sem benefício proporcional no estágio inicial. Os limites de domínio devem existir no código para permitir separação futura, caso o produto cresça.

Figura 2: arquitetura lógica inicial, sujeita à avaliação de Rafael (diagrama original não incluído nesta transcrição em texto).

### 10.1 Componentes sugeridos

| Componente | Responsabilidade |
| --- | --- |
| Frontend administrativo | Aplicação web responsiva para coordenação, triagem, mapa, relatórios e configuração. |
| PWA de campo | Service worker, cache controlado, banco local e fila de sincronização para inspeções. |
| Backend modular | API versionada, regras de domínio, autorização, validação, documentos e integrações. |
| Banco relacional e GIS | PostgreSQL com PostGIS para consistência, buscas espaciais e histórico territorial. |
| Objetos | Armazenamento compatível com S3 para fotos, PDFs e anexos, usando URLs temporárias. |
| Fila de jobs | Geração de PDF, miniaturas, notificações, importações, exportações e reprocessamento. |
| Auditoria | Eventos de negócio e logs de segurança separados de logs técnicos. |
| Observabilidade | Erros, métricas, disponibilidade, jobs, sincronizações, banco e armazenamento. |

### 10.2 Estratégia offline recomendada

- Sincronizar apenas tarefas autorizadas e dados mínimos necessários para o agente.
- Usar identificadores UUID gerados no cliente para permitir criação offline sem colisão.
- Guardar formulários e metadados em IndexedDB; não depender somente do cache do navegador.
- Tratar fotos como uploads independentes, comprimidos, retomáveis e associados por identificador.
- Mostrar estados claros: salvo localmente, aguardando envio, sincronizado, conflito e erro.
- Aplicar idempotência na API de sincronização para evitar duplicação por repetição de envio.
- Definir política de conflito por tipo de dado; nunca escolher silenciosamente em campos críticos.

### 10.3 Opções de stack para Rafael avaliar

O documento não fixa tecnologia. Uma combinação comum seria frontend React/TypeScript, backend Node.js/TypeScript ou outra linguagem dominada por Rafael, PostgreSQL/PostGIS, armazenamento S3 e contêineres. O critério principal deve ser velocidade de entrega, segurança, capacidade offline e custo de manutenção, não moda tecnológica.

## 11. Modelo conceitual de dados

| Domínio | Entidades principais | Relacionamentos relevantes |
| --- | --- | --- |
| Identidade | Organization, Unit, User, Role, Team | Usuário pertence a organizações/unidades e recebe papéis contextualizados. |
| Ocorrência | Occurrence, Type, Location, Contact, StatusEvent | Ocorrência tem local, solicitantes, linha do tempo e possíveis vínculos territoriais. |
| Campo | Inspection, FormVersion, Answer, Evidence, Signature | Vistoria usa uma versão de formulário e produz respostas e evidências. |
| Documentos | Document, TemplateVersion, Approval | Documento nasce de dados versionados e pode exigir aprovação. |
| Fluxo | Task, Referral, Deadline, Notification | Providências têm responsável, prazo, retorno e evidências. |
| Risco | RiskArea, Asset, GeoLayer | Ocorrências e locais podem interceptar áreas e camadas de risco. |
| Incidente | Incident, SituationUpdate, Assignment, Resource | Incidente agrupa ocorrências, objetivos, equipes e recursos. |
| Abrigos | Shelter, CapacityUpdate, Household, Stay | Dados de famílias são sensíveis e devem ter acesso restrito. |
| Logística | Warehouse, Item, StockLot, StockMovement, Need, Donation, Delivery | Saldo deriva de movimentos; entrega atende uma necessidade. |
| Auditoria | AuditEvent, ExportEvent, AccessEvent | Eventos registram ações e consultas sensíveis por tenant. |

**Decisão crítica:** Rafael deve avaliar se o isolamento multi-tenant será feito por banco separado, schema separado ou coluna organization_id com políticas de acesso. Para o MVP, coluna por tenant com controles rigorosos e testes automáticos costuma ser mais econômica; clientes maiores podem exigir opções dedicadas.

## 12. Integrações e desenho inicial de APIs

### 12.1 Prioridade de integração

| Integração | Estratégia do MVP | Evolução |
| --- | --- | --- |
| S2ID | Gerar pacote de dados, relatórios e anexos para uso humano. | Integrar somente se houver API oficial, credenciamento e regras claras. |
| GIS municipal/estadual | Importar ou referenciar camadas GeoJSON/KML validadas. | Serviços WMS/WFS e catálogos por jurisdição. |
| Processo eletrônico | Exportar PDF e metadados. | API com SEI ou sistema municipal quando disponível. |
| Assinatura digital | Aprovação interna e identificação de autoria. | Integração ICP-Brasil ou provedor autorizado conforme necessidade jurídica. |
| Mensageria | Notificações internas e e-mail transacional. | SMS, WhatsApp oficial e push com consentimento e custo controlado. |
| Login gov.br | Não essencial ao piloto interno. | Avaliar para portal externo e federação de identidade. |

### 12.2 Recursos de API sugeridos

| Recurso | Exemplos de operação | Observação |
| --- | --- | --- |
| /organizations e /users | configurar tenant, equipes e papéis | Somente administradores; auditoria obrigatória. |
| /occurrences | criar, consultar, classificar, atribuir e encerrar | Filtros espaciais e por status. |
| /inspections e /evidence | criar rascunho, sincronizar respostas e mídia | Idempotência e controle de versão. |
| /documents | gerar, revisar, aprovar e baixar | PDF assíncrono e modelo versionado. |
| /tasks e /referrals | atribuir, responder, vencer e comprovar | Notificações derivadas de eventos. |
| /sync | manifesto, pull autorizado, push e resolução de conflito | Contrato próprio para uso offline. |
| /incidents e /logistics | ativar módulos futuros | Rotas separadas por domínio. |
| /exports e /audit | solicitar exportação e consultar trilha | Jobs assíncronos e autorização reforçada. |

A API deve ser versionada desde o início. Operações de escrita relevantes precisam aceitar chave de idempotência e retornar identificador estável, versão e horário do servidor. Eventos de domínio podem alimentar notificações e integrações futuras sem acoplar o núcleo a cada fornecedor.

## 13. Segurança, privacidade e LGPD

- Mapear controlador, operador, finalidades e bases legais com cada cliente; o software não decide isso sozinho.
- Aplicar minimização: o agente recebe somente os dados necessários para a tarefa.
- Criptografar tráfego e armazenamentos; administrar chaves e segredos fora do repositório.
- Separar dados pessoais de painéis públicos e usar anonimização/agregação quando cabível.
- Registrar acesso e exportação de dados sensíveis, não apenas alteração.
- Definir retenção por tipo de dado, obrigação legal e contrato; oferecer descarte controlado.
- Fazer testes automáticos de isolamento entre tenants e perfis em cada versão.
- Prever resposta a incidente, comunicação, backup, restauração e revogação de sessões.
- Evitar fotos e documentos em aparelhos pessoais fora da área controlada pela PWA; estudar limpeza de cache e proteção local.
- Realizar avaliação de impacto antes de módulos de famílias em abrigos, vulnerabilidade e geolocalização sensível.

## 14. Critérios de aceite do MVP

| ID | Cenário | Resultado esperado |
| --- | --- | --- |
| CA-01 | Ocorrência completa | Operador cria, classifica e atribui; agente recebe; coordenação acompanha e encerra com histórico. |
| CA-02 | Vistoria offline | Em modo avião, agente preenche formulário, captura GPS e cinco fotos; ao reconectar, tudo sincroniza sem duplicação ou perda. |
| CA-03 | Documento | Sistema gera PDF padronizado com protocolo, respostas, evidências, autoria, data e versão. |
| CA-04 | Encaminhamento | Providência é atribuída, notificada, respondida e comprovada; atraso aparece no painel. |
| CA-05 | Conflito | Duas alterações concorrentes produzem regra previsível ou fila de revisão, sem descarte silencioso. |
| CA-06 | Isolamento | Testes comprovam que usuário do município A não acessa dados ou arquivos do município B. |
| CA-07 | Auditoria | Criação, mudança de status, aprovação, consulta sensível e exportação são rastreáveis. |
| CA-08 | Recuperação | Backup de teste é restaurado e procedimento é documentado. |
| CA-09 | Usabilidade | Agentes do piloto concluem o roteiro principal sem assistência constante. |
| CA-10 | Exportação | Cliente baixa dados e documentos do piloto em formato legível e documentado. |

## 15. Roadmap e estimativa preliminar

As faixas abaixo são hipóteses para um desenvolvedor full-stack experiente com apoio de Alyson na descoberta e validação. Rafael deve recalcular após escolher stack, profundidade offline, geração de documentos, mapa, hospedagem e escopo do piloto.

| Etapa | Faixa | Entrega principal |
| --- | --- | --- |
| 0. Descoberta | 2-3 semanas | Entrevistas, processo atual, protótipo, tipos de ocorrência, formulários e decisão técnica. |
| 1. Fundação | 2-3 semanas | Tenant, autenticação, autorização, banco, arquivos, CI/CD, ambientes e auditoria básica. |
| 2. Núcleo operacional | 5-7 semanas | Ocorrências, triagem, atribuição, linha do tempo, providências e painel. |
| 3. Campo offline | 4-6 semanas | PWA, formulários, GPS, fotos, fila de sincronização e conflitos. |
| 4. Documentos e mapa | 3-5 semanas | PDFs, modelos, aprovações, mapa, filtros, relatórios e exportação. |
| 5. Piloto assistido | 4-6 semanas | Implantação, treinamento, correções, métricas, segurança e restauração. |

**Faixa total de planejamento:** a soma bruta sugere aproximadamente 20 a 30 semanas até o encerramento de um piloto robusto. Descoberta, design, infraestrutura e validação podem se sobrepor. Não usar esta faixa como compromisso comercial sem a estimativa de Rafael.

### 15.1 Modelo de implantação que impacta a técnica

- SaaS multi-tenant hospedado pelo fornecedor como padrão do MVP.
- Assinatura anual por município ou consórcio, com implantação e treinamento cobrados separadamente.
- Faixas futuras por número de entes, usuários ativos, armazenamento e módulos contratados.
- Ambiente dedicado ou instalação local somente após existir cliente que pague o custo adicional.
- Custos variáveis a mensurar: armazenamento e tráfego de fotos, mapas, e-mail/SMS/WhatsApp, assinatura, backup e suporte em incidentes.

## 16. Questões que Rafael deverá responder

| Tema | Pergunta para análise técnica |
| --- | --- |
| Arquitetura | Monólito modular é adequado? Quais fronteiras de domínio e riscos técnicos? |
| Stack | Qual combinação reduz tempo de desenvolvimento e risco de manutenção? |
| Offline | Qual estratégia de cache, IndexedDB, sync, idempotência e conflitos? |
| Multi-tenant | Coluna, schema ou banco por cliente? Como testar isolamento? |
| GIS | PostGIS e qual biblioteca de mapa? Como operar camadas e custo de tiles? |
| Documentos | Como gerar PDFs confiáveis, versionar modelos e suportar assinatura futura? |
| Mídia | Compressão, miniaturas, upload retomável, antivírus, retenção e custo? |
| Segurança | Auth próprio ou serviço gerenciado? MFA, logs, backups e gestão de segredos? |
| Infraestrutura | Provedor, ambientes, CI/CD, observabilidade, RPO/RTO e custo mensal inicial? |
| Escopo | O que cortar para piloto sem comprometer o valor central? |
| Estimativa | Horas por módulo, dependências, margem de risco e custo de manutenção? |
| Reuso | Vale avaliar Sahana Eden, OpenBoxes ou componentes de mercado sem herdar complexidade excessiva? |

### 16.1 Entregáveis esperados de Rafael

- Parecer de viabilidade do MVP e principais riscos.
- Arquitetura proposta e escolha justificada da stack.
- Decomposição em épicos, dependências e marcos.
- Estimativa por faixa de esforço, não somente uma data única.
- Estimativa de infraestrutura e custos variáveis para 1, 10 e 50 municípios.
- Lista do que deve ser prototipado ou testado tecnicamente antes do desenvolvimento completo.
- Proposta de escopo mínimo para um piloto com uma Defesa Civil atuante.

## 17. Validação de campo antes de programar a fundo

Recomendação: realizar de 10 a 15 entrevistas com coordenações e agentes de campo, incluindo ao menos um município pequeno, um médio, um de alto volume e um consórcio. Pedir demonstração do último atendimento real, não apenas opiniões gerais.

- Quantos chamados entram por mês e por quais canais?
- Quais tipos de ocorrência ocupam mais tempo e quais exigem documento?
- Como é feita hoje a triagem, o despacho e o plantão?
- Onde ficam fotos, vídeos, coordenadas, assinaturas e relatórios?
- Quais áreas não têm sinal e por quanto tempo o agente fica offline?
- Quais documentos e formulários variam por município ou tipo?
- Como são enviados e cobrados encaminhamentos a outras secretarias?
- Que dados pessoais são coletados e quem pode consultá-los?
- Quais sistemas, mapas e processos eletrônicos já são usados?
- Qual foi o maior problema de auditoria, perda de informação ou resposta tardia?
- Existe orçamento anual, fonte de recurso e rota de contratação?
- O órgão aceitaria piloto pago ou carta de intenção se o protótipo atender ao fluxo?

**Critério de avanço:** só iniciar o desenvolvimento amplo se a dor aparecer de forma recorrente em pelo menos cinco entrevistas e houver pelo menos dois órgãos dispostos a testar formalmente, preferencialmente com piloto pago ou carta de intenção.

## 18. Referências públicas consultadas

- [R1] Ministério da Integração e do Desenvolvimento Regional, Sistema Integrado de Informações sobre Desastres (S2ID)
- [R2] Ministério da Integração e do Desenvolvimento Regional, Defesa Civil Alerta
- [R3] Jaboatão dos Guararapes, Termo de Referência para sistema web e aplicativo de ocorrências
- [R4] MIDR, boa prática PRODEC, Programa de Registro de Ocorrências da Defesa Civil do Rio de Janeiro
- [R5] Prefeitura de Aracaju, SIGER para solicitações, vistorias e documentos georreferenciados
- [R6] Prefeitura de Eldorado do Sul, plataforma para emergências, donativos, abrigos, voluntários e recursos
- [R7] Prefeitura de Joinville, Relatório Final da Consulta para Compra Pública de Soluções Inovadoras 2026
- [R8] Espírito Santo, justificativa e estudo de mercado para sistema de coordenação de incidentes
- [R9] Lei 12.608/2012, Política Nacional de Proteção e Defesa Civil
