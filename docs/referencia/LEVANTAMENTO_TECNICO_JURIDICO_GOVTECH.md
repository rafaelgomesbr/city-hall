# Levantamento técnico e jurídico completo
## Sistema de gestão operacional para prefeituras, consórcios e órgãos federais
**Base:** Defesa Civil Operacional 360, especificação preliminar v0.1 (Alyson, 18/08/2026)
**Autor técnico:** Rafael
**Versão deste documento:** v1.1, 19/08/2026 (revisada após as decisões de stack, mobile e execução)
**Status:** insumo de decisão. Não é ETP, não é TR, não é parecer jurídico.

---

## 0. Como usar este documento

Este é o **script**, não o roadmap. Ele responde três perguntas antes de qualquer linha de código:

1. O que a lei brasileira **obriga** um software vendido a prefeitura ou ministério a ter.
2. O que a engenharia precisa ter para que essa obrigação seja **verificável**, e não apenas declarada em contrato.
3. O que precisa estar **decidido** antes do primeiro commit, porque mudar depois custa caro.

A seção 11 fecha com o escopo exato do protótipo HTML clicável que você pediu como primeira entrega. A seção 12 contém o comando literal que você deve me mandar na próxima mensagem para eu gerar o roadmap por etapas com gate de UX e QA.

**Aviso honesto:** eu não sou advogado. As referências normativas abaixo foram verificadas em fontes oficiais em 19/08/2026, mas contrato administrativo, cessão de direitos de software e cláusulas de LGPD precisam de revisão de advogado com prática em direito público e digital antes de qualquer assinatura. O custo disso é baixo perto do risco.

### Registro de revisões (v1.1, 19/08/2026)

Decisões tomadas depois da v1.0, que este documento agora reflete. Onde uma seção antiga divergir deste registro, o registro prevalece.

- **Stack fechada, todos os canais em React (decisão do Rafael).** Web admin em React + Vite + TypeScript; app de campo e futuro app do cidadão em React Native com Expo; monorepo com pacote shared (tipos, schemas Zod, cliente de API, regras de domínio, tokens de design). Angular descartado neste projeto. React Native elimina o risco da guideline 4.2 da Apple (rejeição de site reempacotado) e dá SQLite nativo (expo-sqlite) para a fila offline, superior ao IndexedDB em WebView.
- **Backend revisto para a capacidade real.** Primeiro ciclo com PostgreSQL gerenciado e Row Level Security via BaaS (ex.: Supabase, confirmando região Brasil), cobrindo autenticação, storage com URL assinada e PostGIS. Backend Node próprio entra depois, apenas para o que exige servidor: geração de PDF, endpoint de sincronização com idempotência e jobs. Migração futura é um dump, não uma reescrita.
- **Estratégia mobile ampliada: o produto também vira app de loja.** Duas trilhas de distribuição: app do agente em distribuição privada (Managed Google Play e Apple Business Manager; apps permanentemente privados têm regras de target API mais folgadas) e app do cidadão nas lojas públicas, com bundle id e política de privacidade próprios. Fatos oficiais verificados: Apple exige que apps com dados sensíveis sejam submetidos por entidade legal (guideline 5.1.1.ix), permissão explícita antes de compartilhar dado pessoal com IA de terceiros (5.1.2.i), exclusão de conta dentro do app e conta demo para o revisor; Google exige target API 36 para apps novos desde 31/08/2026, verificação de desenvolvedor no Brasil a partir de 30/09/2026, e a regra de 12 testadores por 14 dias vale só para conta pessoal (conta de organização é isenta). Segurança mobile pela régua OWASP MASVS/MASTG: token em Keychain e Keystore, nenhum segredo no bundle JS.
- **Societário em andamento.** CNPJ em abertura com contador; D-U-N-S na sequência (pré-requisito das contas de organização Apple e Google). O acordo escrito com o Alyson continua sendo condição antes de qualquer receita (risco R08).
- **Cronograma recalibrado para a capacidade real: um desenvolvedor, até 10 horas por semana.** Piloto realista em 18 a 24 meses; MVP recortado para o núcleo (ocorrência com protocolo, triagem, despacho, vistoria offline com foto e GPS, PDF do relatório e linha do tempo auditável); mapa, providências com SLA e painel de indicadores entram depois. Construção real só começa com contrato ou carta de intenção (rota CPSI ou piloto pago).
- **Design system v0.1 criado e versionado no kit da Fase 0.** Identidade no laranja institucional da Defesa Civil, temas claro e escuro, sombras por elevação, tokens em CSS e SCSS, contraste AA verificado numericamente, e a regra estrutural: o laranja é identidade, nunca severidade. Vira o design system compartilhado da fase real.
- **Fase 0 operacionalizada como kit de Claude Code** (workspace CITY-HALL): CLAUDE.md com regras invioláveis, roadmap CP1 a CP8, agentes revisores de QA e de UX (auditoria em 10 dimensões), um commit por checkpoint aprovado, empacotamento para o pior caso de apresentação e roteiro de vídeo como plano B da demo.

### Antes de tudo: o que muda em relação ao documento do Alyson

O documento do Alyson é bom. Ele acerta no recorte de mercado, no posicionamento e no escopo do MVP. Três pontos onde eu divirjo ou complemento, e você precisa saber disso agora:

| Ponto | Documento v0.1 | Recomendação deste levantamento | Motivo |
| --- | --- | --- | --- |
| Stack de frontend | Sugere React/TypeScript como combinação comum | **React no web e React Native (Expo) nos apps** (fechado na v1.1) | Decisão do Rafael: um único paradigma em todos os canais. React Native elimina o risco da guideline 4.2 da Apple e dá SQLite nativo para a fila offline. Ver Registro de revisões. |
| Camada jurídica | Trata LGPD em uma seção de 10 bullets | Camada jurídica é **requisito funcional de primeira classe**, não anexo | Em venda para setor público, conformidade é critério de habilitação e de sobrevivência do contrato, não diferencial. |
| Rota de venda | Assinatura anual por município | Assinatura anual **mais** rota de entrada via LC 182/2021 (CPSI) ou consórcio | Licitação tradicional é ciclo de 6 a 18 meses. Sem uma rota curta de entrada você fica sem caixa antes do primeiro contrato. |

---

## 1. Enquadramento do comprador e o que ele impõe à arquitetura

Vender para poder público não é vender SaaS B2B com nome diferente. O comprador tem restrições que viram requisito técnico.

| Característica do comprador público | Consequência técnica direta |
| --- | --- |
| Não pode ficar refém de fornecedor (vedação legal ao aprisionamento tecnológico) | Exportação total de dados e documentos em formato aberto e documentado, desde o MVP. Plano de saída contratual. |
| Precisa comprovar o que fez para tribunal de contas, Ministério Público e controle interno | Trilha de auditoria imutável, documentos versionados, evidência com cadeia de custódia. |
| Servidor público rotativo, troca a cada eleição | Onboarding autoexplicativo, material de treinamento, permissões fáceis de reatribuir, nada dependente de uma pessoa. |
| Orçamento anual, empenho, exercício financeiro | Numeração e relatórios por exercício. Contrato anual, faturamento previsível, não usage-based agressivo. |
| Sigilo de dados de vítimas, famílias e endereços | Controle de acesso por sigilo, log de consulta (não só de alteração), mascaramento em exportações amplas. |
| Fiscal de contrato precisa medir entrega | SLA mensurável com evidência automática: status page, relatório de disponibilidade, métricas de incidente. |
| Órgão federal ou estadual tem regras próprias de TIC mais duras | Se você mira ministério, precisa aderir ao padrão federal de contratação de TIC desde o desenho. Ver seção 2.2. |

**Recorte comercial recomendado:** comece por município médio com Defesa Civil atuante ou por consórcio público intermunicipal (Lei 11.107/2005). Consórcio é o melhor canal do país para govtech pequena: uma licitação, muitos municípios atendidos. Ministério entra na fase 3 ou 4, quando você já tiver ISO, pentest, casos e capacidade de suportar exigências federais.

---

## 2. Camada jurídica: o que obriga, artigo por artigo

Esta é a seção que separa um projeto que vende de um projeto que morre na habilitação.

### 2.1 Proteção de dados pessoais (LGPD e ANPD)

**Norma base:** Lei 13.709/2018 (LGPD).

Pontos que atingem diretamente a arquitetura:

- **Papéis.** A prefeitura é **controladora**. Você é **operadora**. Isso precisa estar escrito no contrato, com cláusula de tratamento de dados. Você não define finalidade, você executa. Se você usar dados do cliente para treinar modelo ou gerar estatística própria, vira controlador para essa finalidade e assume obrigação própria. Decida isso antes de vender.
- **Base legal do tratamento.** Para Defesa Civil, o eixo é execução de política pública e atribuição legal do poder público (LGPD art. 7º, incisos II e III, e art. 11 para dados sensíveis). Não é consentimento. Não construa telas de consentimento como se fosse app de varejo. Isso é erro comum e vira apontamento.
- **Dados sensíveis.** Saúde, vulnerabilidade social, dados de crianças e adolescentes, biometria. O módulo de abrigos e famílias trata dado sensível por natureza. Ele exige RIPD (Relatório de Impacto à Proteção de Dados) antes de entrar em produção, e controle de acesso mais rígido que o resto do sistema.
- **Direitos do titular.** Confirmação, acesso, correção, anonimização, portabilidade, informação sobre compartilhamento. Como operador, você precisa de **funcionalidade** que permita ao controlador responder em prazo. Não é jurídico, é tela e endpoint.
- **Incidente de segurança.** Comunicação ao controlador e à ANPD em prazo. Você precisa de plano escrito, canal, detecção e capacidade de dizer **quais titulares** foram afetados. Isso exige log de acesso granular, não só log de erro.
- **Encarregado (DPO).** Obrigatório indicar e publicar contato. Pode ser DPO externo como serviço, modelo admitido pela ANPD. Custo baixo, resolve item de habilitação.
- **ROPA.** Registro das operações de tratamento. Documento vivo, exigido em fiscalização.

**Regulamentações da ANPD que importam para você:**

| Norma | O que impõe | Impacto no seu produto |
| --- | --- | --- |
| Res. CD/ANPD 19/2024 | Regulamento de transferência internacional e cláusulas-padrão contratuais (SCCs), com prazo de adequação encerrado em 23/08/2025 | Se qualquer subprocessador seu (nuvem, e-mail transacional, mapa, IA, monitoramento) processa dado fora do Brasil, você precisa de SCC assinada ou base equivalente. Isso inclui APIs de IA. |
| Res. CD/ANPD 32/2026 | Decisão de adequação recíproca Brasil e União Europeia | Fornecedor com processamento em região europeia fica coberto pela adequação. Fornecedor em região norte-americana exige SCC brasileira. |
| Resolução sobre agentes de pequeno porte | Regime simplificado para pequenas empresas | Reduz sua carga formal no início, mas **não** reduz a obrigação de segurança nem a expectativa do cliente público. |

**Decisão de arquitetura que decorre disso:** hospede em **região Brasil**. Não por proibição legal (a LGPD não exige residência de dados), mas porque elimina a discussão de transferência internacional em todo edital, remove uma cláusula de risco do contrato e é resposta de uma linha em qualquer questionamento. É a decisão mais barata de conformidade que existe neste projeto.

**Ponto de atenção sobre IA:** se você usar API de IA para triagem, classificação ou sumarização de ocorrência, você está enviando dado pessoal a um subprocessador, provavelmente internacional. Isso exige mapeamento no ROPA, SCC, cláusula de não treinamento no contrato do fornecedor, e transparência ao controlador. A ANPD colocou IA como eixo de fiscalização para o biênio 2026 a 2027.

### 2.2 Contratação pública e como o dinheiro chega até você

**Norma base:** Lei 14.133/2021 (Nova Lei de Licitações e Contratos Administrativos), em vigor de forma exclusiva desde 30/12/2023.

Rotas realistas de contratação, da mais rápida à mais longa:

| Rota | Base legal | Prazo típico | Quando usar |
| --- | --- | --- | --- |
| **Dispensa por valor** | Lei 14.133/2021, art. 75, II | 2 a 8 semanas | Piloto pago pequeno. O teto para compras e serviços é atualizado anualmente por decreto, verifique o valor vigente antes de propor. Fracionar contrato para caber no teto é irregular. |
| **CPSI (Compra Pública de Solução Inovadora)** | LC 182/2021 (Marco Legal das Startups), art. 13 e seguintes | 2 a 6 meses | **A melhor rota para o seu caso.** Permite contrato de solução inovadora com fase de testes, tipicamente até 12 meses, sem exigir produto pronto. É exatamente o instrumento que Joinville usou na consulta citada no documento do Alyson. Valor máximo por contrato é definido em lei e atualizado, confirme o vigente. |
| **Adesão a ata de registro de preços (carona)** | Lei 14.133/2021, art. 86 | 4 a 10 semanas | Depois que **um** ente licitar sua solução, outros aderem à ata. Alavanca gigante. Desenhe a primeira licitação pensando nisso. |
| **Pregão eletrônico** | Lei 14.133/2021 | 4 a 12 meses | Rota padrão. Disputa por menor preço, você compete com integrador grande. |
| **Consórcio público** | Lei 11.107/2005 | 3 a 9 meses | Uma contratação, N municípios. Melhor relação esforço e receita. |
| **Credenciamento** | Lei 14.133/2021, art. 79 | variável | Quando o ente quer múltiplos fornecedores habilitados. Raro para software de gestão. |

**Documentos que o cliente precisa produzir e que você deve saber redigir (isso vende):**

- **PCA**, Plano de Contratações Anual. Se seu produto não entrou no PCA do ano, a contratação escorrega para o exercício seguinte. Fale com o cliente entre março e maio.
- **ETP**, Estudo Técnico Preliminar. Justifica a necessidade, avalia alternativas, estima valor.
- **TR**, Termo de Referência. Especifica requisitos, SLA, penalidades, critérios de aceite.
- **Mapa de riscos** da contratação.

Você não pode redigir esses documentos **pelo** órgão em processo que você vai disputar (risco de direcionamento e de impugnação). Mas você pode e deve fornecer **material técnico público de apoio**, benchmark e catálogo de requisitos. É a diferença entre ser fornecedor e ser consultor informal.

**Referência de qualidade mesmo para município:** a IN SGD/ME 94/2022 (processo de contratação de soluções de TIC no SISP federal) e a Portaria SGD/MGI 5.950/2023 (modelo de contratação de software e serviços de computação em nuvem) definem o padrão federal. Município não é obrigado a segui-las, mas quem já atende esse nível de exigência ganha vantagem em qualquer edital e fica pronto para vender a ministério depois. Trate como checklist de maturidade.

**Habilitação: o que sua empresa precisa ter antes de vender**

| Item | Observação |
| --- | --- |
| CNPJ ativo com CNAE de desenvolvimento de software | Obrigatório. MEI não serve para contrato relevante, provavelmente ME ou EPP no Simples. |
| Regularidade fiscal, trabalhista e FGTS | CND federal, estadual, municipal, CNDT, CRF. Certidão vencida derruba na hora. |
| Qualificação técnica (atestado de capacidade técnica) | **Este é o seu gargalo real.** Sem contrato anterior você não tem atestado. Por isso a rota CPSI ou piloto pago importa tanto: gera o primeiro atestado. |
| Qualificação econômico-financeira | Balanço, índices de liquidez. Empresa nova costuma comprovar por capital social. |
| Declarações (não emprego de menor, ME/EPP, inidoneidade) | Formulário. |
| Garantia contratual | Até 5% do valor, seguro-garantia ou caução, conforme edital. |

### 2.3 Governo digital, acessibilidade e relação com o cidadão

| Norma | Obrigação | Requisito técnico derivado |
| --- | --- | --- |
| Lei 14.129/2021 (Governo Digital) | Serviços digitais, interoperabilidade, processo administrativo eletrônico, dados abertos, acessibilidade | API pública documentada, exportação em formato aberto, portal do cidadão acessível, painel de dados agregados |
| Lei 14.063/2020 | Assinatura eletrônica em interações com o poder público, em três níveis: simples, avançada e qualificada | Escolher nível por tipo de documento. Laudo e termo de interdição pedem avançada ou qualificada. Assinatura de recebimento em campo pode ser simples com evidência robusta. |
| MP 2.200-2/2001 | ICP-Brasil, presunção de validade jurídica | Integração com certificado ICP-Brasil (A1/A3) ou provedor de assinatura qualificada na fase 2 |
| Lei 12.527/2011 (LAI) | Transparência ativa e passiva | Dados agregados publicáveis, com anonimização. Nunca expor dado pessoal em painel público. |
| Lei 13.460/2017 | Direitos do usuário de serviço público, ouvidoria, carta de serviços | Portal do cidadão com protocolo, prazo e canal de manifestação |
| Lei 13.146/2015 (LBI), art. 63 | **Acessibilidade obrigatória** em sites e aplicações de uso público | WCAG 2.1 nível AA como piso, eMAG como referência de governo. Isso não é opcional e vira cláusula de edital. |
| Lei 12.965/2014 (Marco Civil) | Guarda de registros de acesso a aplicação por 6 meses | Log de acesso com IP e timestamp, retido e protegido |
| Lei 12.682/2012 e normas do CONARQ (e-ARQ Brasil) | Digitalização, guarda e temporalidade de documentos públicos | Tabela de temporalidade, política de retenção e descarte, metadados arquivísticos no PDF |

### 2.4 Marco setorial de proteção e defesa civil

| Norma | Relevância para o produto |
| --- | --- |
| **Lei 12.608/2012**, alterada pela **Lei 14.750/2023** e pela **Lei 15.367/2026** | Institui a PNPDEC e o SINPDEC. A Lei 14.750/2023 redefiniu conceitos operacionais (acidente, desastre, desabrigado, desalojado, plano de contingência, vulnerabilidade) e **acrescentou deveres de monitoramento e produção de alertas antecipados** para União, estados e municípios. Seu vocabulário de domínio, tipos de ocorrência e classificações **precisam usar exatamente esses termos legais**, não termos inventados. |
| **Lei 12.340/2010** | Transferências de recursos da União para prevenção, resposta e recuperação. Define a lógica de prestação de contas que seus relatórios devem alimentar. |
| **Decreto 12.652/2025** e **Portaria MIDR 3.318/2025** | Estabelecem princípios, diretrizes e o Plano Nacional de Proteção e Defesa Civil. Fonte direta de requisitos de relatório e indicadores. |
| **COBRADE** | Codificação Brasileira de Desastres. **Obrigatório** como taxonomia dos tipos de ocorrência. Se você inventar sua própria classificação, o dado não conversa com S2ID nem com relatório federal. Isso é decisão de modelo de dados, não de tela. |
| **S2ID** | Sistema federal de registro de desastre e reconhecimento. Posição correta, confirmada pelo documento do Alyson: gerar pacote de dados e documentos que **facilite** o preenchimento, sem prometer integração enquanto não houver API oficial e credenciamento. |
| Portarias de reconhecimento federal de SE e ECP | Definem os documentos exigidos (FIDE, DMATE, DOMICÍLIO, relatório fotográfico). Seus modelos de documento devem espelhar esses formulários. **Este é um diferencial comercial enorme e barato de implementar.** |

### 2.5 Propriedade intelectual do software: a decisão que define se você tem um produto ou um serviço

**Normas:** Lei 9.609/1998 (software) e Lei 9.610/1998 (direitos autorais).

Três modelos, consequências opostas:

| Modelo | O que o órgão recebe | Consequência para você |
| --- | --- | --- |
| **SaaS com licença de uso** (recomendado) | Direito de uso durante a vigência, mais os dados dele | Você mantém o código e revende N vezes. É o único modelo em que existe produto escalável. |
| **Desenvolvimento sob encomenda com cessão de direitos** | Titularidade do código | Você recebe uma vez e não pode revender. Vira consultoria. Muitos editais pedem isso por padrão. **Leia sempre esta cláusula.** |
| **Híbrido** | Licença sobre o núcleo, cessão sobre customizações específicas | Aceitável, exige separação clara no repositório entre core e customização |

Registre o software no INPI. Custo baixo, prova de anterioridade e autoria, ajuda em qualificação técnica. Registre também a marca, especialmente se o nome definitivo for outro (o nome atual é provisório, conforme o próprio documento).

**Escrow de código-fonte:** alguns editais exigem depósito do código em terceiro de confiança, liberável se o fornecedor quebrar. É negociável e razoável. Preveja custo.

### 2.6 Inteligência artificial

**Situação em 19/08/2026:** o PL 2338/2023 (Marco Legal da IA) foi aprovado no Senado em dezembro de 2024 e **segue em tramitação na Câmara dos Deputados**, em comissão especial, com propostas apensadas. Não é lei ainda. O modelo é baseado em risco, inspirado no AI Act europeu, prevê o SIA (Sistema Nacional de Regulação e Governança de IA), direitos de transparência, explicação e contestação, e sanções elevadas.

**O que já vale hoje, independentemente do PL:**

- LGPD art. 20: direito à **revisão de decisões automatizadas** que afetem interesses do titular. Se sua IA classificar prioridade ou risco de uma ocorrência, precisa haver revisão humana registrada.
- Dever de transparência: o operador precisa saber que aquilo foi sugerido por IA.
- Responsabilidade do fornecedor pelo output.

**Regra de engenharia que decorre disso, e que você já usa nos seus projetos:** IA sugere, humano decide, sistema registra quem decidiu. Nenhuma saída de IA persiste sem validação por schema estruturado, e nenhuma classificação de risco é gravada como fato sem confirmação humana. Se o PL virar lei, um sistema usado por defesa civil provavelmente cai na faixa de **alto risco** (segurança pública, alocação de recursos essenciais), o que traria avaliação de impacto algorítmico obrigatória. Projete como se já fosse, o custo marginal é pequeno agora e proibitivo depois.

### 2.7 Responsabilidade civil e riscos jurídicos do produto

Este é o item que ninguém coloca no pitch e que pode acabar com a empresa.

| Risco | Cenário | Mitigação |
| --- | --- | --- |
| Sistema fora do ar durante desastre | Enchente, sistema indisponível, morte | Modo degradado offline obrigatório, SLA com exclusão de responsabilidade por evento extremo, seguro de responsabilidade civil profissional (E&O), comunicação clara de que o sistema é ferramenta de registro e não de decisão |
| Laudo gerado com dado errado embasa interdição indevida | Ação indenizatória contra o município, denunciação à lide contra você | Documento sempre assinado por responsável técnico identificado, sistema registra autoria humana, PDF declara que o conteúdo é de responsabilidade do signatário |
| Vazamento de dados de famílias vulneráveis | Sanção da ANPD, dano de imagem, rescisão | Criptografia, minimização, log de consulta, plano de resposta a incidente, seguro cyber |
| Perda de evidência por falha de sincronização | Processo administrativo sem prova | Nada é apagado sem ação explícita, fila de sincronização auditável, backup do dispositivo, testes automatizados de sync |
| Cláusula de cessão de direitos assinada sem leitura | Você perde o produto | Revisão de contrato por advogado, sempre |

**Providências societárias mínimas:** CNPJ próprio para o produto, contrato social com objeto adequado, separação patrimonial, contrato de sócios se houver sociedade com o Alyson **escrito antes do primeiro real entrar**, definição de participação, vesting e propriedade do código. Sociedade de projeto govtech sem acordo escrito é a causa mais comum de morte desse tipo de empresa.

---

## 3. Matriz de rastreabilidade: da lei ao controle técnico

Esta tabela é o coração do documento. Cada linha vira item de backlog e item de checklist de QA.

| # | Obrigação legal ou normativa | Controle técnico verificável | Como o QA testa |
| --- | --- | --- | --- |
| J01 | LGPD, isolamento entre controladores distintos | Row Level Security no PostgreSQL por `organization_id`, prefixo de tenant no object storage | Teste automatizado que tenta ler dado do tenant B com token do tenant A e espera 404, rodando em cada PR |
| J02 | LGPD, minimização | Agente de campo recebe apenas os campos necessários da tarefa | Inspeção do payload de sync, teste de contrato que falha se campo extra aparecer |
| J03 | LGPD, registro de acesso a dado sensível | Log de **consulta**, não só de alteração, em entidades marcadas como sensíveis | Consultar ficha de família e verificar registro em `access_event` |
| J04 | LGPD, direitos do titular | Endpoint e tela de busca por titular, exportação e correção com rastro | Roteiro de teste que simula pedido de acesso e mede tempo até resposta |
| J05 | LGPD, incidente de segurança | Capacidade de listar titulares afetados por recorte de tempo, tabela e tenant | Simulação de incidente em ambiente de homologação |
| J06 | Res. ANPD 19/2024, transferência internacional | Inventário de subprocessadores, região de processamento declarada, SCC arquivada | Revisão trimestral do inventário, bloqueio de novo fornecedor sem aprovação |
| J07 | LGPD art. 20, revisão de decisão automatizada | Toda sugestão de IA gravada como sugestão, com campo de confirmação humana e autor | Teste que confirma que nenhum registro fica em estado final apenas com autoria de IA |
| J08 | Marco Civil art. 15, guarda de registros | Log de acesso à aplicação retido por no mínimo 6 meses, protegido | Verificação de retenção e de imutabilidade |
| J09 | LBI art. 63, acessibilidade | WCAG 2.1 AA nos fluxos principais | axe-core no CI, auditoria manual com leitor de tela por etapa, navegação completa por teclado |
| J10 | Lei 14.063/2020, assinatura eletrônica | Nível de assinatura por tipo de documento, com evidência (hash, timestamp, autoria, IP, finalidade) | Validação de PDF assinado, conferência de hash |
| J11 | CONARQ, temporalidade documental | Política de retenção por tipo, descarte com log e aprovação | Job de descarte em dry-run com relatório |
| J12 | LAI, transparência sem exposição de dado pessoal | Painel público apenas com dado agregado, com supressão de célula pequena | Teste que tenta reidentificar a partir do painel público |
| J13 | Lei 12.608 e COBRADE | Taxonomia de tipos ancorada em COBRADE, com mapeamento versionado | Validação de schema, teste de migração de dados antigos |
| J14 | Lei 14.133, vedação a aprisionamento | Exportação total de dados e documentos em formato aberto, self-service | Executar exportação completa e reimportar em ambiente limpo |
| J15 | Auditoria e controle externo | Trilha append-only com encadeamento de hash, sem edição pela interface | Tentativa de alteração via API e via banco, ambas registradas |
| J16 | Lei 14.129, interoperabilidade | API REST versionada e documentada em OpenAPI, dados abertos | Contrato validado no CI, changelog de API |
| J17 | Contrato administrativo, SLA | Métrica de disponibilidade coletada e publicada, relatório mensal automático | Comparar relatório com dados de observabilidade |
| J18 | Responsabilidade técnica do laudo | PDF sempre com signatário identificado, matrícula e declaração de responsabilidade | Inspeção do documento gerado |

---

## 4. Arquitetura de software

### 4.1 Estilo arquitetural

**Monólito modular, API-first, multi-tenant.** O documento do Alyson acerta nisso e eu concordo integralmente. Microserviço aqui seria custo operacional sem retorno: você é um desenvolvedor, não um time de plataforma.

O que "modular" precisa significar na prática, para que a separação futura seja possível:

- Módulos por domínio, com fronteira explícita: `identity`, `occurrence`, `field` (inspeção), `document`, `workflow`, `geo`, `audit`, `incident`, `logistics`.
- Comunicação entre módulos por **interface de serviço** e por **eventos de domínio**, nunca por join direto na tabela do outro módulo.
- Cada módulo com seu schema no banco ou, no mínimo, prefixo de tabela e ownership claro.
- Regra de dependência: módulos de domínio não conhecem infraestrutura. Infraestrutura implementa interfaces do domínio.

**ADR obrigatório.** Cada decisão estrutural vira um arquivo `docs/adr/NNNN-titulo.md` com contexto, decisão, alternativas e consequências. Em projeto de 20 a 30 semanas com um dev só, ADR é o que impede você de brigar com decisões do seu eu de três meses atrás. Também é entregável que impressiona em auditoria.

### 4.2 Stack recomendada

| Camada | Recomendação | Justificativa |
| --- | --- | --- |
| Frontend admin | **React + Vite + TypeScript** (v1.1) | Todos os canais em React; tipos, schemas Zod e regras de domínio compartilhados no pacote shared do monorepo. |
| App de campo | **React Native com Expo** (v1.1): expo-sqlite para a fila offline e expo-file-system para mídia | App nativo de loja com SQLite real para o outbox, superior ao IndexedDB em WebView. A PWA permanece como canal web complementar do admin. |
| Mapa | **MapLibre GL JS** com tiles de provedor com custo previsível, ou tiles próprios | Evita dependência de licença comercial cara. Custo de tile é armadilha orçamentária clássica. |
| Backend | **Primeiro ciclo: PostgreSQL gerenciado com RLS via BaaS (ex.: Supabase, região Brasil)**; backend Node próprio depois para PDF, sync idempotente e jobs (v1.1) | Ajuste à capacidade real (um dev, 10h/semana): aprender RLS sem operar uma API inteira. A fronteira de segurança fica no banco; a migração futura é um dump, não uma reescrita. |
| Validação e contrato | **Zod** compartilhado entre front e back | Um schema, uma verdade. Resolve o requisito de validar toda resposta de IA e todo payload de sync. |
| Banco | **PostgreSQL 16+ com PostGIS** | Consistência transacional, consulta espacial, RLS nativo para multi-tenant, JSONB para formulário dinâmico versionado. Não use Firestore aqui: multi-tenant público exige transação, integridade referencial e consulta espacial. |
| Objetos | **S3-compatível** com região Brasil, URL pré-assinada, versionamento e object lock | Fotos e PDFs nunca passam pelo backend no upload, apenas metadados. |
| Fila e jobs | **BullMQ + Redis** | Geração de PDF, thumbnail, notificação, exportação, reprocessamento. |
| Autenticação | Serviço próprio com **OIDC**, ou Keycloak self-hosted | Auth próprio no MVP é aceitável se seguir ASVS. Keycloak dá SSO e federação futura com gov.br sem retrabalho. |
| PDF | **Playwright headless** renderizando template HTML versionado, ou Typst | HTML permite reusar o design system e é fácil de versionar. Gere sempre em job assíncrono. |
| Infra | Contêineres, IaC (Terraform), provedor com região Brasil | Ambiente reproduzível é requisito de auditoria e de sanidade. |
| Observabilidade | OpenTelemetry, logs estruturados JSON, Grafana/Loki ou equivalente gerenciado | Sem isso você não consegue provar SLA. |

**Nota sobre Firebase:** você domina Firebase, e ele é excelente para produto próprio. Aqui ele não serve como base principal por três motivos concretos: multi-tenant com isolamento auditável é frágil em Firestore, não há consulta geoespacial real, e residência de dados e transferência internacional viram discussão em todo edital. Firebase Cloud Messaging isolado para push é aceitável se você tratar a transferência no ROPA.

### 4.3 Multi-tenancy: a decisão mais crítica do projeto

O documento do Alyson deixa a decisão em aberto. Minha recomendação, com justificativa:

**Banco único, schema único, coluna `organization_id`, com Row Level Security (RLS) do PostgreSQL ativada e forçada.**

Por que RLS e não apenas filtro na aplicação:

- Filtro na aplicação depende de o desenvolvedor lembrar em cada query. Uma query esquecida é um vazamento entre municípios.
- RLS aplica a política **no banco**. Mesmo que a aplicação erre, o banco nega.
- Em auditoria, você mostra a política do banco. É prova, não promessa.

Implementação:

1. Toda tabela de negócio tem `organization_id NOT NULL`.
2. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY`.
3. Política baseada em `current_setting('app.current_org')`.
4. A aplicação define `SET LOCAL app.current_org` no início de cada transação, a partir do token, nunca a partir de parâmetro de requisição.
5. O usuário de aplicação do banco **não** é superuser e **não** é dono das tabelas.
6. Teste automatizado de isolamento roda em cada PR e bloqueia o merge se falhar (requisito J01 e critério de aceite CA-06 do documento original).

Para storage: prefixo `tenant/{org_id}/...` em toda chave, e URL pré-assinada com expiração curta gerada apenas após checagem de permissão. Nunca URL pública.

**Caminho de evolução:** cliente grande que exigir isolamento físico recebe instância dedicada com o mesmo código. Como a fronteira já é `organization_id`, a migração é um dump filtrado, não uma reescrita.

### 4.4 Protocolo offline: o coração técnico do produto

Este é o requisito onde você ganha ou perde o cliente. Agente de defesa civil trabalha em área sem sinal, e perder uma vistoria é inaceitável.

**Princípios inegociáveis:**

1. **Identificador gerado no cliente.** UUID v7 (ordenável por tempo, bom para índice). O agente cria a inspeção offline com id definitivo. Nada de id temporário remapeado depois.
2. **Outbox local.** Toda mutação vira um evento numa fila local persistida no IndexedDB, com estado: `pending`, `sending`, `synced`, `conflict`, `error`. A UI mostra o estado, sempre.
3. **Idempotência.** Todo POST de sincronização carrega `Idempotency-Key`. O servidor guarda a chave e devolve o mesmo resultado em repetição. Sem isso, reenvio por timeout duplica vistoria.
4. **Pull por manifesto.** O cliente pede `/sync/manifest?since=<cursor>` e recebe a lista de mudanças autorizadas para aquele agente. Cursor por versão lógica, não por timestamp (relógio de celular mente).
5. **Mídia é canal separado.** Foto não vai no JSON. Vai por upload direto ao storage com URL pré-assinada, em partes retomáveis, referenciada por id. Se a foto falhar, a inspeção ainda sincroniza e a foto fica pendente e visível.
6. **Política de conflito declarada por campo.** Nunca escolha silenciosa. Três classes:
   - **Append-only** (fotos, eventos de linha do tempo, comentários): mesclagem automática, sempre.
   - **Last-write-wins com registro** (campos descritivos livres): aplica o último e guarda o anterior no histórico.
   - **Revisão humana obrigatória** (classificação de risco, decisão de interdição, status): entra em fila de conflito e um humano resolve.
7. **Nada é descartado sem ação explícita do usuário.** Este é o requisito VIS-07 do documento original e é o mais fácil de violar sem perceber.
8. **Orçamento de armazenamento local.** IndexedDB tem limite e o navegador pode limpar. Peça `navigator.storage.persist()`, monitore `estimate()`, avise o agente quando estiver perto do limite, e nunca guarde mais tarefas do que o necessário.

**Riscos específicos de iOS que precisam estar documentados no contrato:** Safari limpa storage de PWA após período sem uso, notificação push em PWA tem limitações, e a instalação depende de ação manual do usuário. Isso precisa estar na proposta como limitação conhecida, e não como surpresa no piloto. Este é exatamente o tipo de item que o RNF-10 do documento original chama de "limites documentados".

### 4.5 Evidência e cadeia de custódia

Diferencial competitivo forte e barato de implementar:

- No momento do upload, calcule **SHA-256** do arquivo original no cliente e no servidor. Grave os dois. Divergência gera alerta.
- Grave metadados de captura: timestamp do dispositivo, timestamp do servidor, coordenada, precisão declarada pelo GPS, autor, id do dispositivo.
- **Não apresente coordenada como verdade absoluta.** Mostre a precisão. Um laudo que afirma coordenada com erro de 30 metros como se fosse exata é um problema jurídico.
- Evidência vinculada a documento aprovado torna-se **imutável**. Correção só por aditamento versionado (regra RN-03 do documento original). Use object lock no bucket para esses casos.
- No PDF gerado, inclua QR code apontando para uma URL pública de validação que confirma hash, protocolo e data sem expor dado pessoal. Isso resolve, de forma elegante, a pergunta "esse documento é verdadeiro" feita por qualquer terceiro.
- **EXIF:** preserve no original arquivado (valor probatório), remova nas cópias exportadas para fora do órgão (o EXIF carrega GPS e modelo do aparelho do servidor).

### 4.6 Formulários dinâmicos versionados

Requisito CFG-01 e RN-10 do documento original. Modelo recomendado:

- `form_definition` (id, org, tipo de ocorrência, chave)
- `form_version` (id, definition_id, número, schema JSON, publicado_em, publicado_por)
- `inspection` referencia `form_version_id`, nunca `form_definition_id`

Assim, mudar o formulário nunca altera a leitura de uma vistoria antiga. A renderização do PDF usa a versão da época. Este é o tipo de detalhe que separa sistema que sobrevive a auditoria de sistema que não sobrevive.

O schema do formulário é validado por Zod, tanto na definição quanto na resposta. Perguntas condicionais precisam funcionar offline, portanto a avaliação da condição roda no cliente a partir do mesmo schema.

---

## 5. Segurança

Referência de maturidade: **OWASP ASVS 4.0 nível 2** como alvo, **CIS Controls v8 grupo IG1** como piso operacional, **ISO 27001** como meta comercial de médio prazo.

### 5.1 Ciclo de desenvolvimento seguro (SSDLC)

| Prática | Ferramenta ou método | Frequência |
| --- | --- | --- |
| Modelagem de ameaça (STRIDE) | Sessão por épico novo, registrada em ADR | A cada épico |
| SAST | CodeQL ou Semgrep no CI | Cada PR |
| SCA (dependências) | `npm audit`, Dependabot ou Renovate, com SLA de correção por severidade | Contínuo |
| Secret scanning | gitleaks no pre-commit e no CI | Cada commit |
| SBOM | CycloneDX gerado no build | Cada release |
| DAST | OWASP ZAP em staging | Cada release |
| Pentest externo | Empresa especializada | Antes do primeiro cliente e anualmente |
| Revisão de código | PR obrigatório, mesmo trabalhando sozinho (o PR é o registro da mudança) | Sempre |

### 5.2 Autenticação e autorização

- Senha com **Argon2id**, política mínima alinhada ao NIST (comprimento acima de complexidade artificial), verificação contra lista de senhas vazadas.
- **MFA obrigatório** para administrador, coordenador e qualquer perfil com acesso a dado sensível. TOTP no MVP, WebAuthn depois.
- Sessão: JWT de acesso curto (10 a 15 minutos) mais refresh token rotativo com detecção de reuso. Revogação de sessão por usuário e por tenant (requisito da seção 13 do documento original).
- Bloqueio progressivo por tentativa, com log.
- **RBAC mais ABAC.** O papel define a classe de ação. O atributo (unidade, sigilo do registro, atribuição da tarefa) define o alcance. Os oito perfis do documento original mapeiam bem nesse modelo.
- **Break-glass:** acesso excepcional a registro sigiloso mediante justificativa obrigatória, com notificação ao coordenador e destaque na trilha. Isso resolve o caso real ("preciso ver agora, é emergência") sem abrir o sistema.
- Autorização **no backend**, sempre. A UI esconde, o servidor decide. Teste que valida que cada rota nega sem permissão.

### 5.3 Criptografia e segredos

- TLS 1.3, HSTS, certificado gerenciado, redirecionamento forçado.
- Criptografia em repouso no banco e no storage (gerenciada pelo provedor) e, adicionalmente, **criptografia em nível de campo** (pgcrypto ou envelope com KMS) para CPF, dados de saúde e composição familiar.
- Segredos em cofre (Vault, AWS Secrets Manager, GCP Secret Manager). **Nunca** em `.env` commitado, nunca em variável de build de frontend.
- Rotação de chave documentada, com procedimento testado.

### 5.4 Cabeçalhos, superfície e infraestrutura

- CSP restritiva (sem `unsafe-inline`, com nonce), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- Rate limit por IP, por usuário e por tenant. Endpoint de sync merece limite próprio, mais generoso.
- WAF na borda, proteção DDoS do provedor.
- Antivírus (ClamAV) em todo upload, em job assíncrono, com quarentena antes de disponibilizar.
- Validação de tipo real do arquivo por magic bytes, não por extensão nem por `Content-Type`.
- Hardening de contêiner: imagem mínima, usuário não-root, sem shell em produção, filesystem read-only onde possível.
- Segregação de ambientes: `dev`, `staging`, `prod`, com credenciais distintas. **Dado de produção não vai para staging.** Se precisar de massa realista, gere dado sintético ou anonimize com irreversibilidade.

### 5.5 Backup, continuidade e recuperação

| Item | Definição recomendada |
| --- | --- |
| RPO banco | 15 minutos (PITR com WAL contínuo) |
| RTO banco | 4 horas |
| RPO storage | Versionamento ativo, replicação cross-region na mesma jurisdição |
| Backup imutável | Retenção com object lock, protegido contra ransomware e contra a própria conta de operação |
| Teste de restore | **Trimestral, com relatório assinado.** Backup não testado não é backup. Isso atende ao critério CA-08 do documento original. |
| Runbook | Procedimento escrito de restauração, testado por alguém que não escreveu o sistema |
| Modo degradado | Sistema precisa funcionar em leitura e captura offline mesmo com o backend fora do ar. Em desastre real, a rede é a primeira coisa a cair. |

A hipótese de RPO 24h e RTO 8h do documento original é aceitável para piloto, mas fraca para operação de emergência. Como PITR em PostgreSQL gerenciado custa pouco, recomendo o número mais agressivo desde o início.

### 5.6 Auditoria

- Tabela `audit_event` **append-only**, com `previous_hash` formando cadeia. Alteração de registro anterior quebra a cadeia e é detectável.
- Três trilhas separadas: **negócio** (mudou status, aprovou documento), **acesso** (consultou dado sensível, exportou), **técnico** (erro, job, deploy). Não misture.
- Sem `UPDATE` nem `DELETE` na trilha, garantido por permissão de banco e por trigger.
- Retenção configurável por tenant, com mínimo legal respeitado.
- Consulta de auditoria é ela própria um evento auditado.

### 5.7 Resposta a incidente

Plano escrito com: detecção, classificação de severidade, contenção, erradicação, recuperação, comunicação ao controlador, comunicação à ANPD, comunicação aos titulares quando exigido, e post-mortem sem culpabilização. Prazo de comunicação e canal precisam estar no contrato. Simule uma vez por ano.

---

## 6. Dados, armazenamento e ciclo de vida

### 6.1 Classificação

| Classe | Exemplos | Controle |
| --- | --- | --- |
| Público | Tipos de ocorrência, estatística agregada | Cache livre, painel público |
| Interno | Configuração, modelos de documento | Autenticação exigida |
| Restrito | Ocorrência, vistoria, documento | RBAC mais ABAC, log de alteração |
| Pessoal | Nome, contato, endereço do solicitante | Log de consulta, mascaramento em exportação ampla |
| Pessoal sensível | Saúde, vulnerabilidade, composição familiar em abrigo, dado de criança | Criptografia de campo, acesso restrito nominal, RIPD obrigatório, log de consulta com justificativa |

### 6.2 Retenção e descarte

Tabela de temporalidade por tipo, alinhada ao CONARQ e ao que o cliente adotar. Descarte é **job com dry-run, relatório e aprovação humana**, nunca automático e silencioso. Registre o descarte (o que foi descartado, quando, por qual regra, aprovado por quem), porque o registro do descarte é ele próprio documento de auditoria.

### 6.3 Custo de armazenamento: a armadilha do modelo de negócio

Foto é o maior custo variável deste produto e o mais fácil de subestimar.

Estimativa de referência para você calibrar: um município com 1.500 ocorrências por ano, 8 fotos por vistoria, 800 KB por foto após compressão, gera cerca de 10 GB por ano, mais thumbnails. Parece pouco. Multiplique por 50 municípios e por 5 anos de retenção legal e vira meio terabyte, com tráfego de saída toda vez que alguém abre um relatório antigo.

Controles necessários desde o MVP:
- Compressão no cliente antes do upload, com qualidade configurável por organização.
- Thumbnail gerado em job, servido no lugar do original em listagem.
- Tiering: mover para armazenamento frio o que não é acessado há X meses.
- CDN com cache para thumbnail.
- Cota por tenant, com alerta antes do limite e política comercial clara de excedente.
- **Medição por tenant desde o dia um.** Sem isso você não sabe precificar e vai descobrir a margem errada tarde demais.

### 6.4 Portabilidade e plano de saída

Requisito legal (vedação a aprisionamento) e argumento comercial forte. Implemente **no MVP**, não depois:

- Exportação completa self-service: dados em CSV mais JSON com schema documentado, documentos em PDF, mídia em ZIP com manifesto e hashes.
- Dicionário de dados publicado.
- Cláusula contratual: em caso de rescisão, entrega do dump em até N dias e retenção reversível por período de graça antes da eliminação definitiva.

Dizer isso em proposta desarma a principal objeção do jurídico da prefeitura.

---

## 7. Qualidade de engenharia, UX e QA

Você pediu que cada entrega tenha rodada de UX e de QA, com garantia contra bug. Isso não se consegue com boa vontade, se consegue com **gate**: um conjunto de verificações que bloqueia a etapa seguinte enquanto não passar.

### 7.1 Processo de desenvolvimento

- Trunk-based com branches curtas, PR obrigatório, conventional commits, versionamento semântico.
- CI que roda: lint, typecheck, testes unitários, testes de integração, teste de isolamento multi-tenant, axe-core, build. Falhou, não merge.
- Migrations versionadas e reversíveis, aplicadas automaticamente em staging e manualmente aprovadas em produção.
- Feature flag para tudo que é arriscado, permitindo desligar sem deploy.
- Ambientes: `dev` local, `staging` espelho de produção, `prod`.

### 7.2 Pirâmide de testes

| Nível | O que cobre | Ferramenta | Meta |
| --- | --- | --- | --- |
| Unitário | Regras de negócio, validação, cálculo de prazo e de saldo | Vitest / Jest | Cobertura relevante no domínio, não percentual cosmético |
| Integração | Repositório, RLS, transação, job | Testcontainers com PostgreSQL real | Todo caso de acesso negado |
| Contrato | Compatibilidade da API entre versões | Schema OpenAPI validado, Zod compartilhado | Quebra de contrato falha o build |
| E2E | Fluxos críticos ponta a ponta | Playwright | Os 10 critérios de aceite do documento original |
| **Offline e sync** | Modo avião, reconexão, duplicação, conflito | Playwright com controle de rede, mais testes de unidade da fila | **Cobertura obrigatória.** É o requisito mais frágil do produto. |
| Acessibilidade | WCAG 2.1 AA | axe-core no CI, auditoria manual com NVDA e VoiceOver | Zero violação crítica |
| Performance | Tempo de resposta sob carga | k6 | 95% das operações abaixo de 2 segundos, conforme RNF-02 |
| Segurança | ASVS, injeção, autorização quebrada | ZAP, checklist ASVS por etapa | Sem achado alto ou crítico em aberto |

### 7.3 Gate de QA por etapa (o "check" que você pediu)

Nenhuma etapa é considerada concluída sem os oito itens abaixo verificados e registrados:

1. Todos os critérios de aceite da etapa demonstrados em ambiente de homologação, com evidência gravada.
2. CI verde, incluindo teste de isolamento entre tenants.
3. Zero bug crítico ou alto em aberto. Bug médio e baixo listados e priorizados, não escondidos.
4. Auditoria de acessibilidade da etapa executada, com achados corrigidos ou justificados por escrito.
5. Teste de regressão dos fluxos das etapas anteriores executado.
6. Revisão de segurança da etapa contra o checklist ASVS aplicável.
7. Documentação atualizada: ADR, OpenAPI, changelog e manual do usuário.
8. Rodada de UX com pelo menos dois usuários reais do perfil-alvo, com registro do que travou.

### 7.4 Rodada de UX por etapa

- **Antes de construir:** protótipo navegável da etapa, teste com 3 a 5 usuários, roteiro de tarefas reais, medição de conclusão sem ajuda.
- **Depois de construir:** teste de usabilidade em campo, com o agente usando celular real, em local com sinal ruim, de preferência sob sol forte (contraste em tela ao ar livre é problema real de defesa civil, não detalhe estético).
- **Métrica:** tempo para concluir a tarefa, taxa de conclusão sem ajuda, quantidade de erros. Compare com a linha de base da etapa anterior.
- **Design system desde a etapa 1:** tokens de cor, espaçamento, tipografia, componentes. Dark e light. Área de toque mínima de 44 por 44 pixels. Nunca comunicar estado apenas por cor. Safe area respeitada.

### 7.5 Documentação obrigatória

| Documento | Para quem | Quando |
| --- | --- | --- |
| ADR | Você e o próximo dev | A cada decisão estrutural |
| Diagrama C4 (contexto, contêiner, componente) | Auditoria e cliente técnico | Etapa 1, mantido |
| OpenAPI | Integradores | Contínuo |
| Dicionário de dados | Cliente, exportação, auditoria | Etapa 2 |
| Manual do usuário por perfil | Treinamento | Antes do piloto |
| Runbook operacional | Você às 3h da manhã | Etapa 1 |
| Política de privacidade e ROPA | Jurídico do cliente e ANPD | Antes do primeiro dado real |
| Relatório de conformidade LGPD | Comercial e habilitação | Antes da primeira proposta |

---

## 8. Operação, suporte e economia do produto

### 8.1 SLA proposto

| Métrica | MVP e piloto | Contrato maduro |
| --- | --- | --- |
| Disponibilidade mensal | 99,5% | 99,9% com janela pactuada |
| Resposta a incidente crítico | 4 horas úteis | 1 hora, 24 por 7 em período de emergência declarada |
| Resolução de bug crítico | 2 dias úteis | 24 horas |
| Suporte | Horário comercial, canal único | Plantão em situação de emergência decretada |

Cláusula honesta que protege os dois lados: durante emergência ou calamidade decretada, o sistema opera em modo prioritário e o suporte é ampliado, mas o fornecedor não responde por indisponibilidade de rede, energia ou infraestrutura de terceiros. Isso precisa estar escrito.

### 8.2 Estrutura de custo mensal a modelar

Modele para 1, 10 e 50 municípios (entregável cobrado no documento do Alyson):

- Computação (aplicação e workers)
- PostgreSQL gerenciado com PITR
- Redis
- Object storage e tráfego de saída
- Tiles de mapa
- E-mail transacional, SMS, push
- Observabilidade e log
- Backup e replicação
- Domínio, certificado, WAF
- APIs de IA, se usadas
- Pentest anual, seguro, DPO externo, contador

Os cinco últimos itens são os que normalmente ficam fora da planilha e destroem a margem.

### 8.3 Implantação

Roteiro por cliente: reunião de kickoff, configuração do tenant, cadastro de tipos e formulários, importação de base inicial, treinamento por perfil, acompanhamento assistido de duas semanas, revisão de indicadores em 30 e 90 dias. Implantação e treinamento são cobrados à parte da assinatura. Não os inclua na mensalidade.

---

## 9. Riscos principais e mitigação

| # | Risco | Impacto | Probabilidade | Mitigação |
| --- | --- | --- | --- | --- |
| R01 | Ciclo de venda pública longo demais para o seu caixa | Fatal | Alta | Rota CPSI ou piloto pago pequeno, carta de intenção antes de construir, consórcio como alvo |
| R02 | Sincronização offline com perda ou duplicação de dados | Fatal para a reputação | Média | Protocolo da seção 4.4, testes automatizados de sync, piloto assistido |
| R03 | Vazamento entre tenants | Fatal, sanção e rescisão | Baixa se RLS, alta sem RLS | RLS forçada, teste de isolamento em cada PR |
| R04 | Escopo crescendo para logística e incidente antes da hora | Alto | **Muito alta** | Fases congeladas por contrato, backlog separado, "não" documentado |
| R05 | Edital exigir cessão de código-fonte | Alto | Média | Ler cláusula sempre, modelo de licença na proposta, escrow como alternativa |
| R06 | Custo de storage e tiles acima do previsto | Médio | Alta | Medição por tenant desde o dia um, cota, compressão, tiering |
| R07 | Você sozinho como ponto único de falha | Alto | Alta | ADR, documentação, IaC, código legível, escrow, plano de contratação após primeiro contrato |
| R08 | Sociedade sem acordo escrito com o Alyson | Fatal | Média | Acordo de sócios antes do primeiro faturamento |
| R09 | PWA em iOS com limitação de storage ou instalação | Médio | Média | Limitação documentada na proposta, testes em dispositivo real, plano de app nativo na fase 3 |
| R10 | Concorrência de grande integrador em pregão por menor preço | Alto | Alta | Diferenciar por offline real, aderência a COBRADE e formulários de reconhecimento federal, evitar disputa pura de preço via CPSI e consórcio |

---

## 10. Decisões que precisam estar fechadas antes da primeira linha de código

| # | Decisão | Recomendação deste documento | Prazo |
| --- | --- | --- | --- |
| D01 | Stack de frontend | **Fechada (v1.1):** React (Vite) no web; React Native com Expo nos apps; monorepo com pacote shared | Decidida |
| D02 | Backend e linguagem | **Revisada (v1.1):** primeiro ciclo com Postgres gerenciado (BaaS) e RLS; backend Node próprio depois para PDF, sync e jobs | Decidida |
| D03 | Banco e isolamento | PostgreSQL com PostGIS, coluna `organization_id` com RLS forçada | Antes da etapa 1 |
| D04 | Hospedagem e região | Provedor com região Brasil | Antes da etapa 1 |
| D05 | Autenticação | **Revisada (v1.1):** autenticação do BaaS no primeiro ciclo; federação gov.br ou Keycloak quando um edital exigir | Antes da etapa 2 |
| D06 | Taxonomia de ocorrências | COBRADE como base, com extensão local versionada | Antes da etapa 2 |
| D07 | Modelo de licenciamento | SaaS com licença de uso, cessão apenas de customização | Antes da primeira proposta |
| D08 | Nível de assinatura eletrônica por documento | Simples em campo, avançada ou qualificada em laudo e interdição | Antes da etapa 4 |
| D09 | Uso de IA no produto | Apenas como sugestão validada por schema e confirmada por humano | Antes de qualquer feature de IA |
| D10 | Estrutura societária e acordo com o Alyson | CNPJ próprio, acordo escrito de sócios | **Antes de qualquer receita** |
| D11 | Nome definitivo e marca | Validar com Defesas Civis, registrar no INPI | Antes do piloto |
| D12 | Rota de contratação do primeiro cliente | CPSI ou dispensa com piloto pago | Antes de construir |

---

## 11. Fase 0: o protótipo HTML clicável (primeira entrega)

Objetivo desta entrega: **validar o conceito com uma Defesa Civil real, sem escrever backend.** É peça de venda e instrumento de pesquisa, não software.

### 11.1 O que o protótipo deve ter

**Formato:** HTML, CSS e JavaScript em arquivo único ou poucos arquivos, sem framework, sem build, sem backend. Dados fixos em objeto JavaScript. Abre com duplo clique, funciona em qualquer notebook de prefeitura, roda em apresentação sem internet.

**Fluxos navegáveis (o mínimo que prova o conceito):**

1. **Painel do coordenador:** fila de ocorrências com prioridade, prazo, status, contador de atrasadas.
2. **Abertura de ocorrência:** formulário de entrada com endereço, tipo (usando nomes COBRADE reais), gravidade e vulnerabilidade.
3. **Triagem e despacho:** classificar, atribuir a equipe, definir prazo.
4. **Visão de campo em celular (moldura de smartphone na tela):** lista de tarefas, checklist de vistoria, captura simulada de foto, GPS com precisão exibida, **indicador visível de modo offline e de fila de sincronização**.
5. **Documento gerado:** relatório de vistoria em PDF simulado, com protocolo, fotos, autoria, data, versão e QR de validação.
6. **Mapa:** ocorrências em mapa estático com filtro por tipo e status.
7. **Linha do tempo e auditoria:** histórico da ocorrência com autoria e data em cada evento.
8. **Encerramento com providência:** encaminhar a outra secretaria, cobrar prazo, encerrar com motivo.

**Três detalhes que fazem a demo vender, e que quase todo protótipo esquece:**

- O **indicador de offline** funcionando de verdade na demo (botão que simula perda de sinal e mostra a fila enchendo e depois sincronizando). É o momento em que o coordenador entende o produto.
- O **PDF pronto** com cara de documento oficial. Servidor público avalia software pelo documento que sai dele.
- O **contraste e o tamanho de toque** já corretos, porque o agente vai olhar isso no celular dele durante a reunião.

### 11.2 O que o protótipo NÃO deve ter

Banco de dados, login real, backend, upload real, integração, geração real de PDF, responsividade perfeita em todo dispositivo, código reaproveitável para produção. Protótipo é descartável por definição. Tentar reaproveitá-lo é a forma mais comum de contaminar a arquitetura final.

### 11.3 Critério de aprovação do conceito

O protótipo é considerado aprovado quando, em demonstração para pelo menos **três** Defesas Civis distintas:

- O coordenador reconhece o fluxo como o dele, sem precisar de explicação prolongada.
- Pelo menos duas organizações manifestam interesse formal (carta de intenção ou disposição a piloto pago).
- A dor central aparece de forma recorrente em pelo menos cinco entrevistas, conforme o critério de avanço já definido no documento do Alyson.

Se esses critérios não forem atingidos, o roadmap real **não** começa. O protótipo custa dias. A construção custa 20 a 30 semanas da sua vida.

---

## 12. Próximo comando

Quando quiser o roadmap, me mande exatamente isto:

> Gere o roadmap por etapas do projeto, com base no levantamento. Quero: etapa, objetivo, entregáveis, critérios de aceite, gate de UX, gate de QA, riscos e checkpoint de aprovação. Comece pela Fase 0 (protótipo HTML) detalhada, e as demais em nível de épico.

Se preferir começar pelo protótipo em vez do roadmap, mande:

> Construa o protótipo HTML clicável da Fase 0, conforme a seção 11 do levantamento.

---

## Anexo A: referências normativas verificadas

| Norma | Assunto |
| --- | --- |
| Lei 13.709/2018 | LGPD |
| Resolução CD/ANPD 19/2024 | Transferência internacional e cláusulas-padrão contratuais |
| Resolução CD/ANPD 32/2026 | Decisão de adequação Brasil e União Europeia |
| Lei 14.133/2021 | Licitações e contratos administrativos |
| LC 182/2021 | Marco Legal das Startups, Compra Pública de Solução Inovadora |
| Lei 11.107/2005 | Consórcios públicos |
| IN SGD/ME 94/2022 | Processo de contratação de soluções de TIC no SISP |
| Portaria SGD/MGI 5.950/2023 | Modelo de contratação de software e serviços de computação em nuvem |
| Lei 14.129/2021 | Governo Digital |
| Lei 14.063/2020 | Assinaturas eletrônicas em interações com o poder público |
| MP 2.200-2/2001 | ICP-Brasil |
| Lei 12.527/2011 | Acesso à informação |
| Lei 13.460/2017 | Direitos do usuário de serviço público |
| Lei 13.146/2015 | Estatuto da Pessoa com Deficiência, acessibilidade digital (art. 63) |
| Lei 12.965/2014 | Marco Civil da Internet |
| Lei 12.682/2012 e normas do CONARQ | Digitalização e gestão documental |
| Lei 9.609/1998 e Lei 9.610/1998 | Software e direitos autorais |
| Lei 12.608/2012, alterada pelas Leis 14.750/2023 e 15.367/2026 | PNPDEC e SINPDEC |
| Lei 12.340/2010 | Transferências de recursos para desastres |
| Decreto 12.652/2025 e Portaria MIDR 3.318/2025 | Plano Nacional de Proteção e Defesa Civil |
| PL 2338/2023 | Marco Legal da IA, aprovado no Senado em dez/2024, **em tramitação na Câmara** em ago/2026 |

**Fim do documento.**
