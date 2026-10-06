# 08, LGPD e privacidade (inventário técnico) e cadeia de arquivos

Escopo: seções 15 (LGPD e privacidade, inventário técnico) e 16 (uploads e arquivos) da Baseline Zero da V2. Prefixos da matriz: LGP (dados pessoais) e UPL (arquivos).
Base: repositório C:\Projetos\city-hall, branch master, HEAD e82719e (17/09/2026), data da leitura 30/09/2026. Somente leitura. Nenhum arquivo do repositório foi alterado (git status idêntico ao da largada: só `docs/AUDITORIA-2026-09-30.md` não rastreado).

## Resumo

1. Rodei UM arquivo de teste, `apps/api/test/evidencias.test.ts`: 21 de 21 passaram (33 s). Todo o resto é leitura de código, migrações, rotas e documentos. Não tenho acesso ao banco, ao armazenamento nem aos logs de produção: tudo que depende deles está marcado NÃO CONFIRMADO.
2. EXISTE e está provado por teste: minimização por prazo (migrações 021, 029, 043), registro de consulta a dossiê/laudo/termos (021), registro de exportação com nível e justificativa (007, 021), pacote de saída do município, eliminação de município (038), prefixo por tenant no armazenamento, URLs pré-assinadas curtas, escrita única do objeto, SHA-256 medido no servidor, teto de armazenamento e lista de objetos órfãos.
3. NÃO EXISTE (prova por varredura de código, esquema e telas): aceite de termos, versão do termo, aceite de privacidade, registro ou revogação de consentimento, política publicada, encarregado nomeado, e qualquer mecanismo de direitos do titular (acesso, correção, eliminação sob demanda, portabilidade por pessoa). A política está "redigida, ainda não publicada", com 10 campos `[[ ]]` abertos.
4. A minimização só age se o município fixar prazo (padrão NULL em todos), só conta a partir do encerramento da ocorrência, e o agendador (`setInterval` de 60 min, sem execução na partida) não tem teste. Se algum município tem prazo configurado em produção: NÃO CONFIRMADO.
5. Furo que contradiz a promessa do próprio projeto: o texto livre `tipoDescricao` (relato, até 300 caracteres) é copiado para a trilha append-only (`ocorrencias.ts:684` e `:792`) e nenhuma migração o alcança. Além dele, ficam fora da minimização: fotos, assinatura, endereço, coordenadas, legendas, providências, observações de ofício, IPs, sessões, leads do formulário público, logs e backups.
6. Arquivos: só o tipo DECLARADO é validado (lista de 4 imagens, 15 MB). Não há magic bytes, nem MIME real, nem malware, nem quarentena, nem tratamento de EXIF, nem miniatura, nem derivado, nem retenção de foto, nem backup dos objetos, nem object lock. O teste de fraude é possível pela leitura do código (bytes arbitrários com `content-type` de imagem e tamanho igual ao declarado passam na confirmação).
7. O ofício por link de uso único entrega a um órgão externo, sem conta, o nome do solicitante, o relato e a descrição de vulnerabilidade; a abertura autenticada do mesmo documento não gera registro de consulta. O texto da política sobre isso é ambíguo.
8. V2: portal de secretarias e app do cidadão não existem no código. As tabelas de auditoria fixam 4 papéis por CHECK, `evidencias` exige ocorrência e agente autor, e o tipo de arquivo é fixado por CHECK: cada um vira migração.
9. Decisões humanas pendentes (não decidi nenhuma): retenção, anexos (tipos, tamanho, vídeo), malware, EXIF/GPS, consentimento e base legal por canal, direitos do titular, divulgação de vulnerabilidade a órgãos.

---

# §15 LGPD e privacidade: inventário técnico

## 15.1 Método e limites

- Li as migrações 001 a 046 (cabeçalho e corpo das que criam ou alteram coluna com dado pessoal: 001, 002, 003, 004, 005, 007, 009, 010, 011, 012, 015, 016, 017, 018, 021, 024, 028, 029, 030, 031, 035, 037, 038, 040, 041, 043, 044, 045), `apps/api/src/privacidade/*`, `apps/api/src/armazenamento/*`, as rotas de evidência, usuarios-eu, armazenamento, saída, prestação de contas, ofícios, documentos, sincronização, administração e ocorrências, `packages/shared` (evidencia, telefone, localizacao, schemas, permissoes, protocolo), a configuração de log do Fastify (API e console), `docs/PRIVACIDADE.md`, `SUBPROCESSADORES.md`, `DECLARACAO-NAS-LOJAS.md`, `SAIDA-DE-MUNICIPIO.md`, `ARMAZENAMENTO.md`, os trechos de backup de `COLOCAR-DE-PE.md` e `fly.toml`.
- Documentação NÃO é prova de comportamento. Onde só a documentação afirma, escrevi "documentado, NÃO CONFIRMADO".
- Não invento base legal. Toda menção a base legal por finalidade é DECISÃO HUMANA.
- Titulares: cidadão, servidor municipal, agente de campo, usuário de secretaria (futuro), operador DC360, e uma categoria que o produto já grava e o pedido não listou: contato comercial de município interessado (`interesse_municipio`).

## 15.2 Inventário de dados pessoais ATUAIS

Legenda das colunas: Nasce (onde o dado entra) / Salvo (tabela.coluna ou chave de storage) / Quem acessa / Finalidade técnica / Retenção / Expurgo / Exportação / Auditoria / Gap.

### 15.2.1 Cidadão (solicitante, morador, assinante, terceiros citados)

| Dado | Nasce | Salvo | Quem acessa | Finalidade técnica | Retenção | Expurgo | Exportação | Auditoria | Gap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Nome do solicitante | `POST /ocorrencias` por operador, coordenador ou administrador (`solicitanteNome`, schemas.ts:86); agente não cria | `ocorrencias.solicitante_nome` (001:168); cópia derivada em `ocorrencias.busca` (041:220-224); cópia no SQLite do aparelho do agente da equipe (tabela `pendencias`, documentado em DECLARACAO-NAS-LOJAS §1.2, NÃO CONFIRMADO por mim no aparelho) | Todos os papéis do município (a lista entrega o nome de propósito, lista.ts:20-24); agente só da equipe (recorte-do-agente); externo via ofício | Identificar quem relatou, retorno, laudo | Prazo fixado pelo município, contado do ENCERRAMENTO; padrão NULL = indefinida (021:70-72, 115-118) | `minimizar_por_prazo` troca por 'removido por prazo' (021:372-495; 043:177-495), relógio de 60 min (index.ts:286) | CSV nível completo, pacote de saída, laudo HTML/PDF, ofício (oficios/documento.ts:116) | `ocorrencia_consultas` (dossiê, laudo, termos, busca que casou nome), `exportacoes`, evento de trilha `minimizacao_por_prazo` | Ocorrência nunca encerrada nunca expira; município sem prazo não perde nada; busca pela lista `?busca=` devolve o nome sem registro (ver LGP-19); cópia no aparelho só sai no logout |
| Telefone ou contato | Mesmo formulário (`solicitanteContato`, até 120 caracteres, schemas.ts:87); máscara em shared/telefone.ts (não recusa formato) | `ocorrencias.solicitante_contato` (001:169) | Dossiê e agente da equipe; a lista NÃO entrega (lista.ts:31-36) | Retornar, avisar vistoria e interdição | Igual ao nome | Vira NULL junto do nome (021:435-443) | CSV completo, pacote | Igual ao nome | Campo de texto livre: pode conter e-mail, nome de terceiro ou segundo telefone, e isso não é detectado |
| E-mail do cidadão | NÃO existe campo. Só entra se digitado em `solicitante_contato` ou no relato | (nenhum) | n/a | n/a | n/a | n/a | n/a | n/a | D para campo próprio. Nasce na V2 com a conta do app |
| Endereço residencial e ponto de referência | `endereco` (obrigatório, ate 400) e `pontoReferencia` (012) | `ocorrencias.endereco` (001:165), `ocorrencias.ponto_referencia` (012), ambos dentro de `ocorrencias.busca` | Todos os papéis; laudo; ofício; CSV | Objeto do ato administrativo | Permanente por decisão (021:24-28) | Nenhum | CSV BÁSICO já leva endereço e coordenada (prestacao-de-contas.ts:361-364), pacote, laudo, ofício | Dossiê e laudo | "Nível básico sem pessoa" é relativo: endereço residencial mais `vulnerabilidade_presente` identifica uma família. `ponto_referencia` é texto livre ("viela do bar do Zé", 012) e fica sem prazo |
| Coordenadas | Digitadas, coladas de link (shared/localizacao.ts) ou GPS do agente | `ocorrencias.latitude/longitude` (001:166-167), `evidencias.latitude/longitude` (001:254-255), `vistorias.latitude/longitude` (030:81-82, onde o agente esteve), `vistoria_evidencias_perdidas` (030) | Como o endereço | Achar o imóvel, carimbar a vistoria | Permanente | Nenhum | CSV básico, pacote | Dossiê e laudo | Saem para o Google no mapa do painel, no SDK do app e na Routes API (SUBPROCESSADORES §2.2, documentado, NÃO CONFIRMADO no tráfego real) |
| Relato (narrativa) | `descricao` (ate 4000, schemas.ts:118) | `ocorrencias.descricao` (001:172); `ocorrencias.tipo_descricao` (019, ate 300); COPIA em `trilha_eventos.detalhe.tipoDescricao` (ocorrencias.ts:684) e `detalhe.tipoDescricaoAnterior` (ocorrencias.ts:792) | Dossiê; ofício externo imprime o relato (oficios/documento.ts:124); CSV completo | Triagem | `descricao`: o mais curto dos dois prazos (043:200-206). `tipo_descricao` e a cópia na trilha: sem prazo | `descricao` vira marcador (043:319-324). A cópia na trilha NÃO | CSV completo, pacote, ofício | Dossiê, laudo | FURO: texto livre do solicitante gravado em tabela append-only e fora do alcance da função (ver LGP-07) |
| Vulnerabilidade (saúde, deficiência, idade, gestação) | Triagem por quem tem `classificar_triagem` | `ocorrencias.vulnerabilidade_presente` (booleano, permanente), `ocorrencias.vulnerabilidade_descricao` (texto livre) | Dossiê; laudo; OFÍCIO externo imprime a descrição (oficios/documento.ts:126-129) | Priorização | Descrição: prazo mais curto; marca booleana: permanente | Descrição vira NULL com data (021:444-449), ordem garantida por CHECK (021:107-113) | CSV completo (descrição), CSV básico (só a marca), pacote | Dossiê e laudo | O ofício por link entrega a descrição a destinatário externo (ver LGP-19 e 15.10) |
| Pessoas atingidas | Vistoria em campo | `vistorias.desalojados, desabrigados, feridos, desaparecidos, obitos` (015), inteiros de 0 a 100000 | Laudo, dossiê | Dimensionar abrigo | Permanente | Nenhum | Pacote | Laudo | Só contagens, sem identificação. NÃO existe cadastro individual ou familiar de atingidos (nenhuma tabela): é a Fase 3 do documento original, e muda o inventário quando entrar |
| Fotografias | Agente, `POST /evidencias/autorizar-envio` | Objeto `tenant/<org>/ocorrencias/<oc>/<sufixo>-<nome>` (protocolo.ts:18-26, evidencias.ts:379-381) e `evidencias.*` (001:248-261, 003, 024) | Todos os papéis do município, agente só da equipe (evidencias.ts:535) | Prova técnica do ato | Nenhuma (permanente) | Só órfão, por comando manual de operador (035, armazenamento/cli.ts) | Pacote (originais), laudo HTML/PDF (URL de 30 min, documentos.ts:259) | Trilha `evidencia_anexada` com autor e SHA-256 (evidencias.ts:185-193). LEITURA da foto NÃO registrada | Sem prazo, sem tratamento de EXIF, sem backup do balde (ver §16) |
| Assinatura manuscrita (traço PNG) e nome do assinante | Tela de assinatura do app | Objeto PNG com chave REMONTADA pelo servidor (sincronizacao.ts:597-603), `vistorias.assinatura_chave` (001:222, CHECK de prefixo 009), `vistorias.assinante_nome` (001:221) | Laudo, termo | Ciência do ato de interdição | Permanente por decisão (043:42-46) | Nenhum; o nome foi retirado da trilha (sincronizacao.ts:850-873) e redigido nos eventos antigos (043:396-402) | Laudo, termo, pacote | Trilha (sem o nome) | O nome permanece sem prazo por decisão declarada |
| Terceiros em texto livre (vizinhos, familiares, menores) | Qualquer campo livre | `providencias.descricao/resposta/responsavel`, `evidencias.legenda` (ate 300), `oficios.observacoes`, `ocorrencias.motivo_encerramento`, `trilha_eventos.detalhe.motivo`, `vistoria_evidencias_perdidas.legenda` | Conforme a tela | Operação | Sem prazo | Nenhum | Pacote | Trilha | A política admite que são "orientação operacional, não promessa de descarte" (PRIVACIDADE.md:218-222; 043:519-523) |
| IP de quem abre o ofício (pessoa de outro órgão) | Abertura do link público | `oficio_aberturas.ip` e `agente_do_navegador` (017:541-543) | Quem consulta o ofício (oficios.ts devolve `host(ip)`) | Prova de compartilhamento | Permanente por decisão (021:511-518) | Nenhum | Pacote | Próprio registro | Dado pessoal de servidor de OUTRO órgão, sem aviso nem prazo |
| Dispositivo e IP do cidadão | Não existe canal do cidadão hoje | (nenhum) | n/a | n/a | n/a | n/a | n/a | n/a | Nasce na V2 (app) |

### 15.2.2 Servidor municipal (operador, coordenador, administrador)

| Dado | Nasce | Salvo | Quem acessa | Finalidade técnica | Retenção | Expurgo | Exportação | Auditoria | Gap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Nome, matrícula, e-mail institucional, papel, equipe, situação | `POST /usuarios` (administracao.ts:143) | `usuarios.nome/matricula/email/papel/equipe_id/ativo` (001:83-95), `usuarios.busca` (041:225) | Coordenador e administrador (lista), o próprio (`GET /usuarios/eu`), nome aparece como autor em toda trilha | Identidade e autoria | Permanente: usuário se desativa, não se apaga (PRIVACIDADE.md:91-95) | Nenhum | Pacote (sem `senha_hash`, pacote.ts:206-216) | `trilha_administrativa` (010) | Nenhum mecanismo de correção ou anonimização. O nome é copiado em tabelas append-only: `trilha_eventos.autor_nome`, `ocorrencia_consultas.usuario_nome`, `exportacoes.usuario_nome`, `oficios.emitido_por_nome` |
| Credenciais | Criação e troca de senha | `usuarios.senha_hash` (002:22), `falhas_login`, `bloqueado_ate`, `ultimo_acesso`, `segundo_fator` cifrado (022) | Só o banco; não sai em rota | Login | Permanente | Nenhum | NÃO sai (COLUNAS_QUE_NUNCA_SAEM) | Trilha administrativa (liga e desliga o 2º fator) | Sem gap de privacidade relevante nesta leitura |
| Foto de perfil (opcional) | `PUT /usuarios/eu/foto` (usuarios-eu.ts:204-296) | `usuarios.foto_chave` (040), `usuarios.foto_bytes` (045), objeto sob `tenant/<org>/usuarios/<id>/` | Equipe e coordenação | Identificação visual | Até trocar ou remover | Trocar ou remover apaga o objeto (usuarios-eu.ts:293, 317) | Pacote, pasta `usuarios/` | `trilha_administrativa` `foto_trocada` (:267-274) | Sem validação do conteúdo (ver UPL-28) |
| IP e user agent do login | `abrir_sessao` (002:173-194) | `sessoes.ip`, `sessoes.user_agent` (002:48-49), `recuperacoes_senha.ip` (005:22) | Só o banco (nenhuma rota lê) | Segurança de sessão | Sem prazo | NÃO existe expurgo: `DELETE FROM` em apps/api/src só aparece em avisos.ts:365 (o módulo de eliminação não tem DELETE direto, chama funções do banco) | NÃO saem no pacote (sessoes e recuperacoes são tabelas que não saem, pacote.ts:154-156) | Nenhuma | Acumulam sem limite. A migração 011:71-72 afirma que IP "entra na purga junto" de sessoes e recuperacoes_senha: nenhuma purga existe |
| IP em atos | `enderecoDoCliente(req)` | `exportacoes.ip` (007:26), `ocorrencia_consultas.ip` (021:258) | Só o banco; `/relatorios/consultas` omite o IP de propósito (prestacao-de-contas.ts:648-655) | Investigação | Permanente por decisão | Nenhum | Pacote (inclui) | Próprio registro | Decisão declarada, sem prazo |
| Autoria de atos | Toda escrita | `trilha_eventos.autor_*` (001:300-312), `trilha_administrativa` | Quem tem `consultar_trilha` | Auditoria | Permanente, append-only | Só a redação do `assinante` pela função 043 | Pacote | Próprio | Nome e papel copiados: não corrigíveis |

### 15.2.3 Agente de campo

Tudo da tabela anterior, mais:

| Dado | Nasce | Salvo | Quem acessa | Finalidade técnica | Retenção | Expurgo | Exportação | Auditoria | Gap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Token de push (ficha), plataforma, ambiente APNs | `POST /aparelhos` (aparelhos.ts:101) | `aparelhos.ficha` (016:90, EM CLARO), `plataforma`, `ambiente` (044), `visto_em`, `revogado_em` | Só o varredor | Entregar aviso | Aparelho revogado permanece | NENHUM para `aparelhos` | Pacote SEM a coluna `ficha` | `notificacoes_enviadas` | No estado versionado o push está desligado: `fly.toml:86-90` deixa `PUSH_ATIVO` comentado e `config.ts:167-169` diz que as rotas de aparelho recusam. Então hoje não deve haver ficha gravada em produção: NÃO CONFIRMADO no ambiente real |
| Avisos enviados | Varredor | `notificacoes_enviadas` (016:153) | Só o banco | Idempotência e suporte | 90 dias | `varrer_prazos` (016:296) com piso de 30 dias na policy (037:49-53) | Pacote | Próprio | Depende do push ligado |
| Localização | GPS no ato da vistoria; saída a campo declarada | `vistorias.latitude/longitude` (030:81-82), `saidas_a_campo` (031:104) | Coordenação | Segurança do agente, laudo | Permanente | Nenhum | Pacote | Trilha | O produto não rastreia: `POST /rota` não grava (rota.ts só registra falhas do provedor) e `req.body.origem` está redigido em log (servidor.ts:214-215). A posição sai para o Google enquanto o mapa está aberto (SUBPROCESSADORES §2.2) |
| Dado de cidadão no aparelho | Sincronização do trabalho da equipe | SQLite privado: `pendencias`, `rascunhos`, `fila_sincronizacao`, arquivos `foto-*.jpg` e `assinatura-*.png` (DECLARACAO-NAS-LOJAS §1.2) | O próprio aparelho | Trabalhar offline | Até o logout | `apagarDadosLocais` zera `rascunhos`, `pendencias`, `marcas`, `coletas`; NÃO zera `fila_sincronizacao` de propósito (banco-local.ts:286-326) | n/a | n/a | `allowBackup: false` (app.config.ts:398). Não encontrei cifra de aplicação no SQLite (nenhuma ocorrência de sqlcipher, encrypt ou cifr em banco-local.ts). A fila carrega nome do assinante, observações e fotos até subir |

### 15.2.4 Usuário de secretaria (futuro)

HOJE não existe conta, tela nem papel de secretaria. O que existe e se relaciona:

| Dado | Salvo | Observação |
| --- | --- | --- |
| Contato institucional do órgão | `orgaos.nome/sigla/email/telefone` (017:89-96) | Catálogo por município |
| Responsável indicado pelo órgão | `providencias.responsavel` (001:280), texto livre; `respondidaPor` em `trilha_eventos.detalhe` (ocorrencias.ts:1071-1075) | Nome de servidor de outro órgão em texto livre, registrado por operador do município |
| Destinatário do ofício | `oficio_envios.destinatario_email` (017:431), restrito por gatilho ao domínio de órgão ativo do catálogo | Institucional |
| Quem abriu o link | `oficio_aberturas.ip`, `agente_do_navegador` | Sem conta: o acesso é por link de uso único |

Dados que o portal provavelmente introduz (classe E, inferência, não requisito confirmado): conta (nome, e-mail, matrícula ou outro identificador, órgão, cargo, telefone), credencial e segundo fator, vínculo com órgão, registro de quem abriu o quê (hoje `ocorrencia_consultas.usuario_papel` tem CHECK de 4 papéis, 021:219-221), IP e dispositivo de login, prazos, aceite, devolução com motivo, pedido de complemento e respostas em texto livre (podem conter dado de cidadão), anexos com autoria e notificações por e-mail (o provedor Resend está escolhido e NÃO ligado, SUBPROCESSADORES §1). Identidade entre municípios (concessionárias) conflita com o e-mail único global de `usuarios` (002:31, `usuarios_email_global_idx`) e com `usuarios.organizacao_id` único.

### 15.2.5 Operador DC360 (console do fornecedor)

| Dado | Salvo | Retenção, expurgo, exportação, auditoria, gap |
| --- | --- | --- |
| Conta do operador | `console_operadores` (038:198-260): e-mail, `senha_hash` com CHECK de scrypt, `segundo_fator` cifrado (CHECK `v1.%`), papel, ativo, `falhas_login`, `bloqueado_ate`, `ultimo_passo_totp` | Permanente; não sai no pacote do município. Segundo fator obrigatório por CHECK. Sem gap de privacidade nesta leitura |
| Códigos de recuperação | `console_codigos_de_recuperacao` (039) | Só resumo guardado (documentado; não li o corpo da 039) |
| Livro de eliminações | `eliminacoes_de_municipio.solicitada_por_email`, `cancelada_por_email`, `motivo` (038:421-423) | Fica com o fornecedor por desenho (SAIDA-DE-MUNICIPIO.md §3) |
| Decisor de descarte de órfão | `objetos_orfaos` com nome do operador digitado em `--operador` (armazenamento/cli.ts, 035) | Texto livre informado por quem roda o comando |
| Leitura de leads | Por banco, com credencial de dono (011:13-20) | Acesso direto ao banco não gera registro no produto: NÃO CONFIRMADO qualquer controle externo (pgaudit ou equivalente) |
| Logs do console | Fastify com nível `info`, sem `redact` e sem serializador de `req` (apps/console/src/servidor.ts:257-262) | O serializador padrão registra `url` com query string e endereço remoto. O console não define `trustProxy` (busca por trustProxy sem resultado), então o endereço tende a ser o do proxy. Console não trata dado de cidadão |

### 15.2.6 Contato comercial de município (`interesse_municipio`)

Nome, cargo, e-mail, telefone, município, UF, órgão, faixa de população, número de agentes, mensagem e IP (011:35-81), gravados por `POST /publico/interesse` (interesse.ts:54-70). O papel de aplicação só tem INSERT (011:108-109), então nenhuma rota lê ou apaga. A coluna `ip` diz "Descartar junto com o registro após o prazo de retenção definido com o jurídico" (011:157-159): nenhum código de descarte existe. O formulário (`apps/web/src/paginas/QueroConhecer.tsx`) não menciona privacidade (busca por privacidade, lgpd, dados, aceit, consent sem resultado). Titular: servidor público de município prospect.

## 15.3 Aceite, termos e consentimento: existe HOJE?

Resposta: NÃO. Prova:

1. Varredura de `apps/`, `packages/` e `db/` (ts, tsx, sql, json, html, sem node_modules e dist) por `aceite|aceitou|consentimento|consent|termos de uso|política de privacidade|privacy`: nenhuma tabela, coluna, rota, esquema Zod ou tela. As únicas ocorrências de "consentimento" (packages/campo/src/fila.ts:681-700, 816-817; tipos.ts:236) tratam do agente autorizar seguir com uma foto perdida, sem relação com titular.
2. Lista de tabelas criadas pelas migrações (`CREATE TABLE`): organizacoes, equipes, usuarios, protocolo_sequencias, ocorrencias, vistorias, evidencias, providencias, trilha_eventos, sessoes, recuperacoes_senha, exportacoes, trilha_administrativa, interesse_municipio, aparelhos, notificacoes_enviadas, orgaos, oficio_sequencias, oficios, oficio_envios, oficio_aberturas, avisos, avisos_lidos, vistoria_orgaos_indicados, ocorrencia_consultas, segundo_fator, segundo_fator_recuperacao, metricas_municipio, devolucoes_de_tarefa, vistoria_evidencias_perdidas, saidas_a_campo, objetos_orfaos, console_operadores, eliminacoes_de_municipio, console_codigos_de_recuperacao. Nenhuma guarda aceite, versão de termo ou consentimento.
3. Telas de entrada (web `Entrar.tsx`, `QueroConhecer.tsx`, login do app campo): sem link ou texto de privacidade (busca por privacidade, lgpd, termos em apps/web/src e apps/campo/src devolve só comentários de código e rótulos de busca).
4. `sessoes.ip` e `sessoes.user_agent` registram o login, não um aceite.
5. `aparelhos.revogado_em` e `motivo_revogacao` (016:97-100) são revogação de token de push, não revogação de consentimento.
6. `docs/PRIVACIDADE.md:3-13`: "Versão: 1, de 09/09/2026", "Situação: redigida, ainda não publicada", campos `[[assim]]` para razão social, CNPJ, endereço, encarregado e endereço de publicação (10 ocorrências de `[[`). Não há rota que sirva o documento: `apps/web/public` contém só ícones, manifest, fontes e robots.txt. `DECLARACAO-NAS-LOJAS.md:564-569` confirma que o documento "não vai para o ar" enquanto houver `[[ ]]`.

Consequência: aceite, versão do termo, aceite de privacidade, data do aceite, IP do aceite, usuário do aceite, revogação e registro de consentimento são todos D. A decisão sobre SE e POR QUAL BASE cada canal precisa de consentimento é humana (LGP-29 a LGP-32, DH-05).

## 15.4 Minimização e retenção: o mecanismo real

### 15.4.1 O que a função faz (`minimizar_por_prazo`, versão vigente 043)

- Função `SECURITY DEFINER`, `SET search_path = public, pg_temp`, `SET row_security = off` (043:183-186). Sem parâmetro de município e sem parâmetro de prazo: só `p_teto` (quantas ocorrências por rodada).
- O prazo vem de `organizacoes.retencao_solicitante_dias` e `retencao_vulnerabilidade_dias` (021:70-72), faixa 1 a 36500 dias (021:90-96), vulnerabilidade nunca maior que o nome (021:107-113). Padrão NULL: município que não decidiu não perde nada (021:358, 296-298 em index.ts).
- Critério: ocorrência com `encerrado_em` antes de `now() - prazo` (043:207-230). "Venceu o nome" usa o prazo do solicitante; "venceu o texto" usa o MAIS CURTO entre o da vulnerabilidade e o do solicitante (043:214-224).
- O que sai (por ocorrência vencida):
  - `solicitante_nome` vira 'removido por prazo' e `solicitante_contato` vira NULL, com `solicitante_removido_em` (043:304-312);
  - `vulnerabilidade_descricao` vira NULL, com `vulnerabilidade_removida_em` (043:313-318);
  - `descricao` (relato) vira o marcador, com `descricao_removida_em` (043:319-324), CHECK `marcador_de_relato_e_coerente` (043:125-129);
  - `devolucoes_de_tarefa.observacao` vira o marcador (029:239-249; 043:338-348);
  - `vistorias.observacoes` vira o marcador (043:358-369);
  - `trilha_eventos.detalhe.assinante` dos eventos `vistoria` é redigido para o marcador (043:396-402), único UPDATE em trilha, feito só pela função como dono, com conferência de contagem que aborta tudo (código DC368, 043:458-466).
- Registra um evento de trilha `minimizacao_por_prazo` por ocorrência, com os campos removidos e sem o conteúdo (043:435-448), na mesma instrução.
- Exige dono das tabelas com BYPASSRLS: sem ele a função estoura com DC368 em vez de "minimizar zero" (043:474-491; teste db/test/minimizacao-do-relato-e-da-trilha.test.ts:379-409).

### 15.4.2 Quando roda e quem a dispara

- `apps/api/src/index.ts:286` define `INTERVALO_DA_MINIMIZACAO_MS = 60 * 60_000`; `index.ts:304-317` instancia `agendarMinimizacao` com pool próprio e trava de Postgres (`travaPostgres`) para as duas máquinas do Fly. Não há variável para desligar (index.ts:288-303).
- O disparo é `setInterval` com `unref()` (privacidade/minimizacao.ts:153-166). Não há execução na partida: o primeiro disparo ocorre 60 minutos DEPOIS de cada início de processo. Deploys ou reinícios mais frequentes que uma hora adiam a varredura indefinidamente (não medi a frequência de deploy).
- Teto de 500 ocorrências por rodada (minimizacao.ts:66). Falha da rodada vira linha de log `minimizacao por prazo falhou inteira` (minimizacao.ts:157-162); não há alarme.
- Ninguém humano a dispara. O que um humano precisa fazer é fixar o prazo: `PATCH /organizacao/retencao`, permissão `gerenciar_organizacao` (só administrador), com antes e depois na trilha administrativa (administracao.ts:632-702), tela em `apps/web/src/paginas/Organizacao.tsx`.
- Provas por teste: `apps/api/test/minimizacao.test.ts` (ao menos 20 casos: marcador, trilha, município sem prazo, aberta não minimiza, teto por rodada, duas máquinas, não atravessa município), `db/test/minimizacao-do-relato-e-da-trilha.test.ts`, `apps/api/test/laudo-depois-da-minimizacao.test.ts`, `apps/api/test/retencao-do-municipio.test.ts`. Nenhum teste importa `agendarMinimizacao` (busca em apps/api/test): o relógio em si não tem prova.
- Produção: não tenho como ver se algum município tem prazo configurado nem se a varredura já rodou. NÃO CONFIRMADO.

### 15.4.3 O que NÃO é alcançado pela retenção

| Item | Por quê | Evidência |
| --- | --- | --- |
| Ocorrência sem `encerrado_em` | O relógio começa no encerramento; quem nunca encerra mantém tudo | 043:227; PRIVACIDADE.md:190-193 admite |
| Município sem prazo | Padrão NULL | 021:70-72 |
| Fotografias e assinatura (objetos e `evidencias`) | "Previsto, não implantado" | 021:544-549; PRIVACIDADE.md:171, 370-374 |
| `ocorrencias.endereco`, `ponto_referencia`, coordenadas | Decisão declarada: atributo do imóvel | 021:24-28 |
| `ocorrencias.tipo_descricao` | "FICA por enquanto" | 043:513-517 |
| Cópia do relato na trilha (`tipoDescricao`, `tipoDescricaoAnterior`) | Nenhuma migração a trata; 043 redige só `assinante` | ocorrencias.ts:684, 792; grep por `tipoDescricao` em db/migrations só acha o comentário da 019 |
| `vistorias.assinante_nome` | Decisão declarada | 043:42-46 |
| `evidencias.legenda`, `providencias.descricao/resposta/responsavel`, `oficios.observacoes`, `motivo_encerramento`, motivos na trilha | Texto livre sem decisão | 043:519-523 |
| `trilha_eventos`, `trilha_administrativa`, `ocorrencia_consultas`, `exportacoes`, `oficio_aberturas` | Append-only por desenho (a consulta e a exportação por decisão declarada) | 021:502-551 |
| `sessoes`, `recuperacoes_senha` (IP, user agent) | Não existe expurgo | 002, 005; busca de DELETE |
| `interesse_municipio` | Não existe expurgo e o papel de aplicação não lê nem apaga | 011:108-109, 157-159 |
| `aparelhos` (ficha) | Revogado não é apagado | 016 (comentário "Aparelho nao se apaga") |
| `usuarios`, `equipes`, `orgaos` | Desativação, não remoção | PRIVACIDADE.md:91-95 |
| `ocorrencias.busca`, `usuarios.busca` (colunas geradas) | Seguem a fonte: a de ocorrência acompanha o nome minimizado, mas mantém endereço | 041:220-226 |
| Cópia local no aparelho | Só o logout, e não a fila | banco-local.ts:286-326 |
| Logs da API e do provedor | Destino e retenção não estão no repositório | servidor.ts:284-293 registra IP por requisição; retenção NÃO CONFIRMADA |
| Backups do banco e do balde | Retenção do provedor não conferida; fotos nem entram no dump | COLOCAR-DE-PE.md:587-597 |
| Dados no Apple, Google (push, mapas, rotas) | Fora do controle do produto | SUBPROCESSADORES §2 |

### 15.4.4 Outros expurgos que existem

- `notificacoes_enviadas`: 90 dias, dentro de `varrer_prazos` (016:296), só quando o push está ligado.
- `avisos`: 60 dias, na policy `avisos_expurgo` (018:170-174) e na rota do sino (avisos.ts:358-372), teste em sino-de-avisos.test.ts:512.
- Foto de perfil: trocar ou remover apaga o objeto (usuarios-eu.ts:293, 317).
- Eliminação de município: `eliminacao/relogio.ts` a cada 15 min, apaga linhas (038) e o prefixo do armazenamento, com purga retomável apenas pela memória do processo (SAIDA-DE-MUNICIPIO.md:173-203; relogio.ts:50-71).
- Objeto órfão: só lista; apagar é comando manual com operador e motivo (armazenamento/cli.ts; ARMAZENAMENTO.md:173-200).

## 15.5 Registro de consulta a dado de cidadão

O que registra (021:209-289; privacidade/consulta.ts:105-125): quem (id, nome e papel copiados), quando, qual recurso (`ocorrencia_detalhe`, `laudo`, `termo_de_interdicao`, `termo_de_desinterdicao`, e `busca` desde a 041), finalidade fixada pela rota (`atendimento` ou `emissao_de_documento`) e IP. Sem conteúdo lido. Gravado na mesma transação da leitura. Append-only por ausência de policy. Chamadores: `ocorrencias.ts:599-603` (dossiê), `documentos.ts:698-702` (documentos), `busca.ts:229-232` (busca que casou nome). Leitura do registro: `GET /relatorios/consultas` com `consultar_trilha` (coordenador e administrador), sem IP (prestacao-de-contas.ts:614-663). Testes: `registro-de-consulta.test.ts` (inclui repetição, vizinho, append-only, operador sem acesso, "a listagem não registra" na linha 139).

O que NÃO registra (verificado por leitura de código, não executado):

- `GET /ocorrencias?busca=`: casa por `o.busca` (inclui `solicitante_nome`) e por `descricao` (ocorrencias.ts:342-352) e devolve nome e endereço por linha, sem `registrarConsulta`. É a mesma associação pessoa e endereço que a rota `/busca` registra.
- `GET /oficios/:id/documento` (oficios.ts:345-355): imprime nome, relato e descrição de vulnerabilidade, sem registro.
- `GET /evidencias/:id/url` e `GET /evidencias/ocorrencia/:id` (evidencias.ts:523-597): entregam a foto da casa da família, sem registro.
- `GET /trilha` (prestacao-de-contas.ts:174), `GET /campo/meu-trabalho` e `GET /sincronizacao/pendencias` (este último leva contato, relato e vulnerabilidade ao aparelho do agente, decisão declarada em consulta.ts:58-66).
- Acesso do fornecedor por credencial de dono ao banco: fora do produto.

## 15.6 Exportações registradas, pacote de saída e eliminação

- `exportacoes` (007, 021): tipo, filtros, total, IP, `nivel` (`basico` ou `completo`) e `justificativa` com mínimo de 20 caracteres exigido por CHECK (021:331-336). CSV: `GET /relatorios/ocorrencias.csv` (prestacao-de-contas.ts:310-517), nível completo só para administrador, teto de 5000 linhas (:100, :388-396), também entra na trilha administrativa (:441-457). Pacote de saída: `POST /saida/pacote.zip` registra nível completo com justificativa fixa ANTES do primeiro byte (saida.ts, bloco `banco.comTenant`). Testes: `exportacao-em-dois-niveis.test.ts`, `saida-de-municipio.test.ts` (inclui "deixa trilha, registra a exportação e NÃO apaga nada"). Lacuna: `GET /relatorios/exportacoes` seleciona só `id, usuario_nome, tipo, filtros, total_registros, criada_em` (prestacao-de-contas.ts:589-595), sem `nivel` nem `justificativa`: a tela de auditoria não distingue rotina de retirada da base de nomes.
- Pacote de saída (`saida/pacote.ts`): todas as tabelas do município em CSV e JSON (lista fechada e conferida por teste contra o banco, `saida-de-municipio.test.ts:276`), arquivos originais, laudos em HTML, índice e SOMAS-SHA256. Fora: `sessoes`, `recuperacoes_senha`, `interesse_municipio`, `segundo_fator*`, `eliminacoes_de_municipio` (pacote.ts:149-197) e as colunas `senha_hash`, `ficha`, `token_hash` (pacote.ts:206-216). É portabilidade do CONTROLADOR (município), não do titular. Risco de memória documentado e NÃO corrigido em `apps/api/PENDENCIAS.md` (todas as linhas de ~20 tabelas em memória, sem LIMIT, em máquina de 1 GB, `fly.toml`).
- Eliminação de município: ver 15.4.4.

## 15.6.1 Logs: o que a API e o console gravam

API (apps/api/src/servidor.ts):
- Pino com `redact` de `req.headers.authorization`, `req.headers.cookie`, `req.body.senha`, `senhaAtual`, `novaSenha`, `renovacao`, `token`, `codigo`, `desafio`, `segredo`, `origem`, `destino`, `ficha` (:180-224). O serializador de `req` grava método, `url` SEM query (com `query: "[removido]"` quando havia) e sem segredo de rota (`caminhoParaLog`, :170-178), `host` e `remoteAddress` = IP do cliente (:284-293). O serializador de `err` descarta `detail`, `where` e `internalQuery` do `pg` (:294-309).
- Consequência: TODA requisição grava o IP do cliente e os identificadores de recurso na URL (UUID de ocorrência). Nome, contato e relato não são gravados em log por código lido (busca por `log.*` com esses campos: sem resultado). Teste: `apps/api/test/log.test.ts` (o próprio cabeçalho admite que os casos de corpo não discriminam, linhas 65-78).
- `notificadorDeLog` mascara o e-mail e não grava o corpo (auth/notificador.ts:54-70); o notificador de arquivo grava a mensagem inteira e a configuração o proíbe em produção (notificador.ts:88-108).
- Pacote de saída registra só ids (`saida.ts`: `req.log.info({ organizacao, por }, ...)`).
- Retenção, local e acesso aos logs: NÃO CONFIRMADO (dependem do Fly).
- Console: ver 15.2.5 (sem `redact`).
- App campo: não há SDK de telemetria, crash ou analytics nas dependências (busca por sentry, crashlytics, analytics, mixpanel, datadog, bugsnag, posthog, amplitude sem resultado; a única menção é `sentry-expo` na lista `transformIgnorePatterns` do Jest, apps/campo/package.json:68).

## 15.7 Direitos do titular

Nenhum mecanismo por titular existe. Prova:

| Direito | Existe? | Evidência |
| --- | --- | --- |
| Acesso / confirmação de tratamento | NÃO. Não há entidade "pessoa": o solicitante é texto livre em `ocorrencias`, sem identificador. O mais próximo é consultar `GET /relatorios/consultas?ocorrencia=` (por ocorrência, só coordenador e administrador) | 021:209-267; prestacao-de-contas.ts:614-663 |
| Correção | NÃO. `grep "SET solicitante_"` em apps/api/src só acha a função de minimização (migrações); as rotas de ocorrência alteram status, triagem, coordenada, providência e encerramento; nenhuma corrige nome, contato ou relato. A trilha é append-only | ocorrencias.ts (rotas listadas em `app.post`), trilha.ts |
| Eliminação ou anonimização sob demanda | NÃO. Só por prazo do município e para o município inteiro. Ocorrência "não se apaga, se encerra" | 021, 038; CLAUDE.md |
| Portabilidade | NÃO por titular. Existe a do município (pacote) | saida.ts |
| Informação sobre compartilhamento | PARCIAL: `oficio_aberturas` (quem abriu o link e de onde) e a lista de subprocessadores em prosa | 017:532-545; SUBPROCESSADORES §1 |
| Canal e encarregado | NÃO: política não publicada, campos `[[ ]]` abertos; IMPLANTACAO.md:21 lista "encarregado de dados do município" como pendência do município | PRIVACIDADE.md:9-13, 36-39 |
| Revogação de consentimento | NÃO (não há consentimento registrado) | 15.3 |
| Revisão de decisão automatizada | Documentado: "o sistema não toma decisão automatizada" (PRIVACIDADE.md:297-299). Observação de código: o prazo de atendimento nasce de tabela por severidade (`PRAZO_PADRAO_HORAS`, ocorrencias.ts:775-781); a severidade é humana | documentado, parcialmente confirmado |

Hoje, atender um pedido de titular seria operação manual do fornecedor com credencial de dono no banco, fora do produto, e deixaria a trilha e os registros de acesso (append-only) com os nomes antigos.

## 15.8 Divergências entre documentação, teste e código (três lados)

1. Lista de ocorrências. PRIVACIDADE.md:63-67 diz que a lista deixou de entregar contato, relato e vulnerabilidade em 15/09/2026; PRIVACIDADE.md:382-386 (seção 6) diz que a lista "ainda devolve nome e contato junto" e que estreitar as colunas "é o passo que falta". Código: `lista.ts:31-36` e `ocorrencias.ts:419` removem `solicitante_contato`, `descricao`, `vulnerabilidade_descricao` e `busca`; teste `registro-de-consulta.test.ts:139`. Código e §2.1 concordam; a seção 6 está desatualizada. A lista ainda entrega `solicitante_nome` por decisão declarada (lista.ts:20-24).
2. Ofício e dado sensível. PRIVACIDADE.md:151-155: "sai o número do ofício e um endereço de uso único, e não o dado em si... O dado sensível não viaja por email". Código: a página aberta pelo link imprime nome do solicitante, relato e descrição de vulnerabilidade (oficios/documento.ts:116, 124, 126-129, montados em oficios.ts:117-122 e servidos em oficios.ts:598-627). O comentário de `apps/api/test/superficie.test.ts:55-62` reconhece que é "a única leitura sem autenticação que devolve dado de município" e que por isso o e-mail não leva o conteúdo. A frase da política vale para o e-mail, não para a página.
3. Purga de IP. 011:71-72 afirma que o IP "entra na purga junto com o resto, pela mesma razão que `sessoes` e `recuperacoes_senha` entram". Código: nenhuma purga de `sessoes`, `recuperacoes_senha` nem `interesse_municipio` (DELETE só em avisos.ts:365 e nas funções 016, 038). PRIVACIDADE.md não menciona retenção de sessões, de links de redefinição nem do formulário de interesse.
4. Texto livre na trilha. 029:26-28 afirma "texto livre vive só nesta tabela... se algum dia voltar a entrar na trilha, esta migração vira teatro"; 043:513-517 lista `tipo_descricao` como "FICA por enquanto" sem mencionar a cópia em `trilha_eventos`. Código: ocorrencias.ts:684 e 792 gravam o texto na trilha.
5. Política de fotos. A política e a migração 021 dizem com todas as letras que fotografia "permanece" (previsto, não implantado): consistente com o código (nenhuma retenção). O contrato de prazo de fotografia (`[[prazo definido pelo município]]`, PRIVACIDADE.md:171) é promessa futura.

## 15.9 O que os dois novos canais introduzem (E)

- Portal das secretarias: titular novo (usuário de órgão) com conta e credencial; acesso a dado de cidadão DENTRO da plataforma (hoje é por link e por e-mail); anexos com autoria; texto livre de respostas e devoluções; necessidade de registro de acesso por usuário de secretaria (a tabela `ocorrencia_consultas` só aceita os 4 papéis atuais por CHECK, 021:219-221; o mesmo vale para `trilha_eventos.autor_papel`, 001:307, e `trilha_administrativa.autor_papel`, 010); expurgo do que o órgão escrever (não há coluna marcadora nem função para tabelas novas); escopo de visibilidade por órgão (RLS atual é só por município).
- App do cidadão: titular novo em massa; conta, telefone ou e-mail, eventualmente documento (DECISÃO HUMANA); geolocalização do cidadão; fotos e possivelmente vídeo do cidadão, com EXIF de aparelho pessoal; relato livre com terceiros e possíveis menores; token de push do cidadão (Apple e Google) e ambiente; identificador e modelo de aparelho, sistema, versão do app; IP; aceite de termo e política com versão e data; revogação; pedidos de titular por autoatendimento; dados de crianças. O relato NÃO é ocorrência oficial: precisa de tabela e fluxo próprios, pois `ocorrencias.canal_entrada` aceita só `telefone, whatsapp, presencial, oficio, outro` (001:170-171) e `ocorrencias.solicitante_nome` é obrigatório. Quem é controlador dos dados da conta do cidadão num app único para vários municípios: DECISÃO HUMANA.

---

# §16 Cadeia de arquivos

Legenda: EXISTE = código que executa e que li; RECOMENDADO = só aparece no documento de especificação ou no levantamento técnico (`docs/referencia/`), sem código.

## 16.1 Estado real, item a item

| Item | Estado real | Onde | Teste | Especificação apenas recomenda |
| --- | --- | --- | --- | --- |
| Bucket privado | Código só emite URL pré-assinada, nunca pública (tipos.ts:11-14). Se o BUCKET é privado no provedor (Supabase Storage, balde `dc360-evidencias`): NÃO CONFIRMADO, é configuração do provedor e não está no repositório | s3.ts:97-151; COLOCAR-DE-PE.md:587-589 | `evidencias.test.ts` "A URL não é pública" (:344-421), contra o armazenamento em memória | Criptografia em repouso e versionamento: RECOMENDADO, não verificado |
| Prefixo por tenant | EXISTE. `tenant/<org>/ocorrencias/<oc>/<sufixo>-<nome>`; CHECK `chave_com_prefixo_do_tenant` (001:258-260), idem assinatura (009) e foto de perfil com o id do usuário (040:54-58); servidor remonta a chave, cliente só dá o nome (protocolo.ts:18-26, evidencias.ts:379-381, sincronizacao.ts:597-603) | | `evidencias.test.ts:405` (leitura de outro município), `:468` (chave forjada), `foto-do-agente.test.ts:181-213` | RN-01 |
| Autorização para upload | EXISTE: `registrar_vistoria` (só `agente_campo`, permissoes.ts:80), ocorrência sob RLS (404 de outro município), não encerrada, teto, data de captura plausível, chave decidida no servidor. NÃO há recorte por equipe nesta rota: `SELECT ... FROM ocorrencias WHERE id = $1` sem `eRecorteDoAgente` (evidencias.ts:288-297), ao contrário da leitura (:535). Um agente autenticado pode autorizar anexo em ocorrência não encerrada de outra equipe do mesmo município; a autoria fica em `anexada_por` e na trilha. Não executei o cenário | evidencias.ts:210-303, 353-404 | `evidencias.test.ts:141-247`; não encontrei teste de fora da equipe para esta rota | |
| Autorização para download | EXISTE: autenticação qualquer e RLS por município; agente só da equipe (evidencias.ts:523-557, 560-597). Sem permissão específica e sem registro de consulta | | `evidencias.test.ts:331-421` | |
| URL temporária e validade | EXISTE: escrita 15 min (s3.ts:62), leitura 5 min (s3.ts:63), leitura embutida no laudo 30 min (documentos.ts:259, 271, 319), leitura interna 60 s (s3.ts:200-208) | | `evidencias.test.ts:385` (URL vencida) | |
| MIME informado versus real | SÓ O INFORMADO. `tipoConteudo` do cliente é validado contra `TIPOS_ACEITOS` (evidencia.ts:96-100) e entra assinado no PUT; o conteúdo nunca é inspecionado | evidencias.ts:114-197 | `evidencias.test.ts:182-190` só testa o tipo DECLARADO `application/pdf` | RECOMENDADO: validação por magic bytes (levantamento §5.4) |
| Extensão | Livre: `nomeArquivo` (até 200) é higienizado por `[^a-zA-Z0-9._-]` e vira sufixo da chave; a extensão não é amarrada ao tipo | evidencia.ts:93-95; protocolo.ts:24 | | |
| Magic bytes | NÃO EXISTE (busca por magic, ffd8, PNG, RIFF, ftyp sem resultado em src) | | | RECOMENDADO (levantamento §5.4) |
| Tamanho e limite | EXISTE: 15 MB por arquivo (evidencia.ts:42, 101-112; CHECK 003:28-31), 2 MB para foto de perfil (usuarios-eu.ts:98, 115-118), `content-length` assinado no PUT (s3.ts:118-122) e conferido na confirmação com os bytes lidos (evidencias.ts:129-136). Foto de perfil: só `HEAD` (`descrever`), e a checagem de tamanho é pulada se o provedor não informar (usuarios-eu.ts:222-236) | | `evidencias.test.ts:296`, `foto-do-agente.test.ts:132` | |
| Compressão | SÓ NO CLIENTE: vistoria com `quality: 0.6` (vistoria/[id].tsx:1468-1471); perfil reduzido a 512 pontos e recomprimido em JPEG (foto-do-agente.ts:135-146). O servidor não comprime nem recodifica | | apps/campo/src/dados/foto-do-agente.test.ts (cliente) | VIS-04: "comprimidas com qualidade configurada" (especificação, linha 181); RNF-08 |
| Metadado e EXIF | O servidor NÃO lê, NÃO remove e NÃO preserva seletivamente. Cliente: a câmera não passa `exif: true` (vistoria/[id].tsx:1468-1471; o padrão da biblioteca expo-camera NÃO foi confirmado por mim); a foto de perfil usa `exif: false` (foto-do-agente.ts:95-99, teste :163-165). A coordenada das fotos vai em CAMPO SEPARADO (`evidencias.latitude/longitude`, vem do rascunho da vistoria), não do EXIF (fila.ts:862) | | apps/campo/src/dados/foto-do-agente.test.ts:163-165 (só perfil) | Levantamento §4.5: preservar EXIF no original arquivado e remover nas cópias exportadas: RECOMENDADO, não implementado |
| Sanitização / re-codificação | NÃO EXISTE | | | RECOMENDADO implícito (antivírus e validação) |
| Miniatura | NÃO EXISTE (busca por thumbnail e miniatura só acha o componente visual do app) | | | RNF-08 e jobs de miniatura (especificação, linhas 262 e 288): RECOMENDADO |
| Original versus derivado | Só o original é guardado; o painel e o laudo usam o original por URL assinada; não há coluna ou chave de derivado | documentos.ts:257-276; laudo.ts:529, 627 | | |
| Hash | EXISTE em parte: SHA-256 MEDIDO pelo servidor ao ler o objeto na confirmação (evidencias.ts:138) e gravado em `evidencias.sha256` e na trilha; o hash declarado pelo cliente só é comparado (:139-146). O aparelho ainda não declara (comentário evidencias.ts:84-93). `evidencias.sha256` é `text` sem CHECK de formato (003:16). O hash não é reverificado na leitura nem no laudo; o pacote de saída recalcula e lista, sem comparar com a coluna (pacote.ts:407-413) | | `bytes-confirmados-nao-se-trocam.test.ts:196-233` | Levantamento §4.5: hash no cliente e no servidor, divergência gera alerta: RECOMENDADO, metade implementada |
| Malware scanning | NÃO EXISTE (busca por clamav, antivirus, malware, virus sem resultado em código) | | | RECOMENDADO (levantamento §5.4, ClamAV assíncrono com quarentena); especificação §14 lista "antivírus" como pergunta aberta |
| Quarentena | NÃO EXISTE. `enviada_em IS NULL` significa "ainda sem bytes confirmados", e toda consulta filtra por ele, mas isso não é isolamento para análise | | | RECOMENDADO |
| Arquivo órfão e limpeza | EXISTE, LISTA e não apaga: janela de 30 dias, espécies `envio_nunca_confirmado` e `objeto_sem_linha`, reconferência no descarte, descarte manual com operador e motivo, reserva de teto `abandonada_em` (035; orfaos.ts:70, 187, 483). O relógio de 24 h sobe só com `VARREDURA_DE_ORFAOS_ATIVA=sim` (config.ts:178-198), e `fly.toml` não a define. Nunca rodou contra o provedor real (ARMAZENAMENTO.md:256-270, documentado). Foto de perfil viva nunca é candidata | | `objeto-orfao.test.ts` (17 casos), `listagem-do-armazenamento.test.ts` | |
| Retenção | NÃO EXISTE para foto, assinatura nem foto de perfil além de trocar e remover. Expurgo por eliminação de município (038) e por descarte manual de órfão | 021:544-549 | | RNF-08 "política de retenção por organização": RECOMENDADO |
| Exportação | EXISTE: pacote de saída com os originais em pasta por protocolo, `SOMAS-SHA256.txt`, pendências de extração para o que o banco promete e o armazenamento não tem, leitura com recuo e distinção entre ausente e falha (s3.ts:169-270). Os originais saem com qualquer EXIF que tenham | saida/pacote.ts | `saida-de-municipio.test.ts:331-341, 408` | |
| Evidência de autoria | EXISTE: `evidencias.anexada_por` com FK composta ao município (024:79-101), evento `evidencia_anexada` com autor, tamanho e SHA-256 na trilha, na mesma transação (evidencias.ts:158-193) | | `prova-fotografica.test.ts` | Levantamento §4.5: imutabilidade com object lock: RECOMENDADO, não implementado (busca por object lock sem resultado) |
| Imutabilidade depois de confirmada | PARCIAL. O OBJETO não se sobrescreve: `if-none-match: *` assinado no PUT (s3.ts:118-122) e recusa de nova URL de escrita para chave já enviada (evidencias.ts:238-270, 421-427). A LINHA, porém, tem policy de UPDATE para o papel de aplicação sobre todas as colunas (034:241-244, GRANT de 001:330-333), sem gatilho que proteja `sha256`, `chave_storage`, `legenda`, `enviada_em` depois da confirmação: só o código da rota impede | | `bytes-confirmados-nao-se-trocam.test.ts:147-174` | |

## 16.2 Teste de fraude: dá para subir arquivo que não é imagem com content-type de imagem?

Resposta: SIM, pelo código lido. Caminho, com evidência:

1. `POST /evidencias/autorizar-envio` com token de agente: `tipoConteudo: "image/jpeg"`, `tamanhoBytes: N` (1 a 15 MB), `capturadaEm` plausível. O esquema valida só o texto do tipo e o número (evidencia.ts:82-127). A rota devolve URL pré-assinada com `content-type`, `content-length` e `if-none-match: *` assinados (s3.ts:118-133).
2. O cliente faz PUT de N bytes quaisquer (PDF, HTML, executável) com esses cabeçalhos. Nada no caminho do armazenamento olha o conteúdo.
3. `POST /evidencias/confirmar-envio`: `confirmarBytes` baixa o objeto (evidencias.ts:119), compara `byteLength` com o autorizado (:129-136), calcula o SHA-256 (:138) e marca `enviada_em` (:158-164). Não há nenhum passo que confira assinatura de arquivo. A linha passa a valer, o evento `evidencia_anexada` é gravado e a foto "anexada" entra no laudo (`fotosAvulsas` ou `fotos`, documentos.ts:257-276) como `<img src>` (laudo.ts:529, 627), buscada e decodificada pelo Chromium do servidor quando o PDF é gerado.
4. O próprio teste `evidencias.test.ts:296-310` grava `Buffer.alloc(9999, 1)` (bytes que não são PNG) sob `image/png` e o servidor só o recusa pelo TAMANHO (`tamanho_divergente`). Com tamanho igual, o mesmo caminho confirma.
5. No armazenamento local (dev e teste) a rota confere apenas o cabeçalho `content-type` (armazenamento-local.ts:33-36), então o teste de unidade não consegue pegar isso.

Execução: rodei `apps/api/test/evidencias.test.ts` (21 de 21 passaram, 33 s em 30/09/2026 16:23) e ele não contém caso de fraude por conteúdo. NÃO executei um cenário com bytes não imagem de tamanho igual ao declarado, porque exigiria criar arquivo de teste novo, o que o escopo proíbe. Classe: a capacidade de validar o conteúdo é D; a afirmação "a fraude passa" é por leitura de código.

Quem pode explorar hoje: agente autenticado (`registrar_vistoria`), no seu município, contra ocorrência não encerrada. Em V2 o mesmo caminho seria aberto a cidadão e a usuário de secretaria.

Variante do perfil: `PUT /usuarios/eu/foto` também não inspeciona bytes e vale para qualquer papel autenticado (usuarios-eu.ts:204-296; teste "recusa tipo que não é imagem" só cobre o tipo declarado, foto-do-agente.test.ts:137).

## 16.3 Risco adicional da confirmação

`confirmarBytes` baixa o objeto inteiro para a memória do processo antes de conferir o tamanho (evidencias.ts:119-136). O teto de 15 MB depende de o provedor aplicar o `content-length` assinado; que o Supabase Storage o aplica NÃO CONFIRMADO. A máquina tem 1 GB e hospeda o Chromium (fly.toml). É a segunda exceção documentada à regra "o arquivo nunca passa pelo servidor" (tipos.ts:51-76).

## 16.4 O que o V2 exige da cadeia de arquivos (E)

- Quem pode subir: hoje só `agente_campo`, e só por um fluxo amarrado a ocorrência e a vistoria (`evidencias.ocorrencia_id NOT NULL`, 003:62-64; `anexada_por` é FK para `usuarios`, 024:96-99). Anexo de secretaria ou de cidadão exige autor não-`usuario`, permissão nova e tabela ou vínculo novo (o relato do cidadão não é ocorrência).
- Tipos: CHECK `tipo_de_imagem_aceito` fixa jpeg, png, webp e heic (003:20-24) e o teto de 15 MB (003:28-31). PDF, documento, áudio e vídeo exigem nova migração e nova decisão de armazenamento. O aplicativo de campo produz sempre JPEG (vistoria/[id].tsx:1507-1508); HEIC é aceito pelo esquema e a renderização de HEIC no painel e no PDF do servidor NÃO foi confirmada.
- Prefixo: o app do cidadão precisa de identidade de tenant no token (município escolhido), caso contrário `chave_com_prefixo_do_tenant` e a regra "a organização vem do token" não se aplicam.
- Leitura: `GET /evidencias/*` só exige autenticação e RLS de município; portal de secretaria exige visibilidade por órgão e por tarefa.
- Auditoria de quem viu a foto: hoje ausente (15.5).

---

## Matriz D

| ID | SUPERFÍCIE | DOMÍNIO | REQUISITO / CAPACIDADE | ESTADO | EVIDÊNCIA | RISCO | DEPENDÊNCIAS | DECISÃO HUMANA? | OBSERVAÇÃO |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LGP-01 | TRANSVERSAL | Inventário | Inventário de dados pessoais por coluna, com classificação, retenção e dono, mantido no repositório | C | PRIVACIDADE.md:43-136 (prosa); DICIONARIO-DE-DADOS.md (523 linhas, uma menção a dado pessoal, linha 79); este relatório é o primeiro por coluna | Médio | LGP-02 a LGP-15 | Não | Não encontrei portão automático que obrigue coluna nova com dado pessoal a declarar retenção (isolamento.test.ts cobre RLS, DELETE e FK). NÃO CONFIRMADO que não exista em outro arquivo |
| LGP-02 | API/BANCO | Minimização | Nome e contato do solicitante viram marcador no prazo fixado pelo município | B | 021:372-495; 029; 043:177-495; minimizacao.ts:51-134; minimizacao.test.ts; db/test/minimizacao-do-relato-e-da-trilha.test.ts | Alto | LGP-11, LGP-12 | Sim (prazo) | Provado em PGlite. Gaps: padrão NULL (021:70-72), só ocorrência encerrada, produção NÃO CONFIRMADA |
| LGP-03 | API/BANCO | Minimização | Relato (`descricao`) vira marcador no mais curto dos prazos | A | 043:319-324, 125-129; db test :213 | Baixo | | Não | |
| LGP-04 | API/BANCO | Minimização | Descrição de vulnerabilidade sai junto ou antes do nome, ordem garantida por CHECK | A | 021:107-113, 395-410; minimizacao.test.ts:250-298 | Baixo | | Não | Marca booleana permanece (021:150-163) |
| LGP-05 | API/BANCO | Minimização | Observação do agente (vistoria e devolução) vira marcador | A | 029:239-249; 043:338-369 | Baixo | | Não | Marcador só onde havia texto (043:254-269) |
| LGP-06 | API/BANCO | Minimização | Nome do assinante: fica na vistoria, não entra mais na trilha, é redigido nos eventos antigos | A | sincronizacao.ts:850-873; 043:396-402; db test :237-250 | Baixo | | Sim (já decidido: permanece) | |
| LGP-07 | API/BANCO | Minimização | Cópia do relato (`tipoDescricao`) na trilha append-only é alcançada pela minimização | B | ocorrencias.ts:671-690 e 778-793; nenhuma migração trata `detalhe.tipoDescricao`; 029:26-28 afirma o contrário | Alto | LGP-02 | Sim | Só chamados `tipo = outro`, até 300 caracteres. Contradiz a promessa declarada. Testes da 043 semeiam outro caso |
| LGP-08 | API/BANCO | Minimização | Texto livre remanescente com prazo (legenda, providência, resposta, observação de ofício, motivos, ponto de referência) | C | 043:519-523; PRIVACIDADE.md:218-222 | Médio | LGP-07 | Sim | Só orientação operacional na tela e na política |
| LGP-09 | API/BANCO | Retenção | Endereço, ponto de referência e coordenadas permanentes | F | 021:24-28 | Médio | | Sim | Decisão já tomada pelo projeto, nunca validada pelo município |
| LGP-10 | API/BANCO | Retenção | Retenção por prazo de fotografias e assinaturas | D | 021:544-549; PRIVACIDADE.md:171, 370-374 | Alto | UPL-23 | Sim | "Previsto, não implantado" |
| LGP-11 | API/BANCO | Minimização | Agendador: sobe sempre, 60 min, trava entre máquinas | B | index.ts:286, 304-317; minimizacao.ts:146-174 (sem execução na partida); nenhum teste importa `agendarMinimizacao` | Médio | | Não | Primeiro disparo 60 min após cada partida. Falha só em log |
| LGP-12 | API/BANCO | Retenção | Prazos realmente configurados por município em produção | G | administracao.ts:611-702; Organizacao.tsx; produção inacessível | Alto | LGP-02 | Sim | Sem configuração, nada expira |
| LGP-13 | API/BANCO | Retenção | Expurgo de sessões e links de redefinição (IP, user agent) | D | 002:39-50; 005:12-22; DELETE FROM só em avisos.ts:365 | Médio | | Sim | 011:71-72 afirma purga inexistente |
| LGP-14 | API/BANCO | Retenção | IP em exportações, consultas e aberturas de ofício: permanente por decisão | F | 007:26; 021:258; 017:541; 021:511-518 | Médio | | Sim | |
| LGP-15 | API/BANCO | Retenção | Leads do formulário público: aviso na coleta e expurgo | D | 011:35-81, 157-159; interesse.ts:54-70; QueroConhecer.tsx sem menção | Médio | | Sim | Titular: servidor público de município prospect |
| LGP-16 | API/BANCO | Retenção | Expurgo de avisos enviados por push (90 dias) | B | 016:296; 037; 045; push-varredor.test.ts:484; fly.toml:86-90 | Baixo | | Não | Existe e testado; depende do push ligado |
| LGP-17 | API/BANCO | Retenção | Expurgo de avisos do sino (60 dias) | A | 018:170-174; avisos.ts:358-372; sino-de-avisos.test.ts:512 | Baixo | | Não | |
| LGP-18 | API/BANCO | Auditoria | Registro de quem consultou dado de cidadão (dossiê, laudo, termos, busca por nome) | A | 021:209-289; consulta.ts:105-125; ocorrencias.ts:599-603; documentos.ts:698-702; busca.ts:229; registro-de-consulta.test.ts | Baixo | | Não | Append-only; sem conteúdo |
| LGP-19 | API/BANCO | Auditoria | Leituras de dado de cidadão sem registro: lista `?busca=`, ofício autenticado, fotos, trilha, pendências do agente | B | ocorrencias.ts:342-352; oficios.ts:345-355; evidencias.ts:523-597 | Médio | LGP-18 | Sim (critério) | A lista associa nome a endereço sem rastro |
| LGP-20 | API/BANCO | Auditoria | Registro de exportação com nível e justificativa | B | 007; 021:309-336; prestacao-de-contas.ts:412-425, 586-598; exportacao-em-dois-niveis.test.ts | Baixo | | Não | Relatório não mostra nível nem justificativa |
| LGP-21 | WEB | Exportação | CSV em dois níveis com teto e justificativa | A | prestacao-de-contas.ts:310-517; exportacao-em-dois-niveis.test.ts | Médio | | Não | Nível básico leva endereço, coordenada e marca de vulnerabilidade |
| LGP-22 | API/BANCO | Portabilidade | Pacote de saída do município (controlador) | A | saida.ts; pacote.ts:49-216; saida-de-municipio.test.ts | Médio | | Não | Risco de memória em PENDENCIAS.md; não é por titular |
| LGP-23 | CONSOLE | Eliminação | Eliminação do município: banco e armazenamento, prazo de sete dias | B | 038:405-445; eliminacao/relogio.ts; SAIDA-DE-MUNICIPIO.md:173-203 | Médio | | Não | Retomada de purga depende da memória do processo (documentado) |
| LGP-24 | TRANSVERSAL | Direitos do titular | Acesso e confirmação de tratamento | D | 15.7; não há entidade pessoa | Alto | LGP-32 | Sim | |
| LGP-25 | TRANSVERSAL | Direitos do titular | Correção de dado pessoal | D | busca de `SET solicitante_` só acha a função de minimização; trilha append-only | Alto | LGP-32 | Sim | |
| LGP-26 | TRANSVERSAL | Direitos do titular | Eliminação ou anonimização sob demanda | D | 15.7 | Alto | LGP-32 | Sim | Só por prazo e por município inteiro |
| LGP-27 | TRANSVERSAL | Direitos do titular | Portabilidade por titular | D | 15.7 | Médio | LGP-32 | Sim | |
| LGP-28 | TRANSVERSAL | Direitos do titular | Informar com quem os dados foram compartilhados | C | 017:532-545; SUBPROCESSADORES.md | Médio | | Sim | `oficio_aberturas` só cobre ofício |
| LGP-29 | TRANSVERSAL | Consentimento | Aceite de termos de uso: versão, data, IP, usuário | D | 15.3 | Alto | | Sim | |
| LGP-30 | TRANSVERSAL | Consentimento | Aceite ou ciência da política de privacidade | D | 15.3 | Alto | LGP-32 | Sim | |
| LGP-31 | TRANSVERSAL | Consentimento | Registro e revogação de consentimento | D | 15.3 | Alto | | Sim | `aparelhos.revogado_em` é revogação de token |
| LGP-32 | TRANSVERSAL | Transparência | Política publicada, encarregado nomeado, canal do titular | D | PRIVACIDADE.md:3-13, 36-39 (10 `[[ ]]`); apps/web/public sem a política; DECLARACAO-NAS-LOJAS.md:564-569 | Alto | | Sim | O piloto já trata dado de cidadão sem texto publicado |
| LGP-33 | TRANSVERSAL | Transparência | Política coerente com o código | B | 15.8 itens 1 a 4 | Médio | | Não | Seção 6 desatualizada; frase do ofício ambígua |
| LGP-34 | API/BANCO | Logs | Redação de log da API e descarte de detalhe de erro do banco | A | servidor.ts:180-224, 244-311; log.test.ts | Baixo | | Não | Casos de corpo não discriminam (log.test.ts:65-78) |
| LGP-35 | API/BANCO | Logs | IP por requisição em log: retenção, destino e acesso aos logs | G | servidor.ts:284-293; retenção do Fly NÃO CONFIRMADA | Médio | | Sim | |
| LGP-36 | CONSOLE | Logs | Log do console sem redact | B | apps/console/src/servidor.ts:257-262 | Baixo | | Não | Sem dado de cidadão; URL com query e IP de proxy |
| LGP-37 | CAMPO | Dispositivo | Dado de cidadão no aparelho: apagado no logout exceto a fila; sem cifra de aplicação | B | banco-local.ts:286-326; app.config.ts:398; DECLARACAO-NAS-LOJAS §1.2 | Médio | | Sim | A fila leva nome do assinante, observações e fotos |
| LGP-38 | API/BANCO | Transferência | Push com vitrine genérica e dado mínimo | A | push/mensagem.ts (VITRINE, montarAviso) | Baixo | | Não | |
| LGP-39 | TRANSVERSAL | Transferência | Coordenadas para Google (mapa, SDK, Routes) e push Apple e Google fora do país | F | SUBPROCESSADORES.md §2 (documentado, NÃO CONFIRMADO no tráfego) | Médio | | Sim | |
| LGP-40 | CAMPO | Servidor | Foto de perfil: opcional, troca apaga, sai no pacote | A | usuarios-eu.ts:204-322; foto-do-agente.test.ts | Baixo | UPL-28 | Não | |
| LGP-41 | TRANSVERSAL | Servidor | Nome de servidor em tabelas append-only: correção e anonimização | F | 15.2.2 | Médio | | Sim | Decisão "usuário não se apaga" é deliberada |
| LGP-42 | CAMPO | Servidor | Localização do agente declarada, não rastreada | A | 031; rota.ts; servidor.ts:214-215 | Baixo | | Não | `vistorias.latitude/longitude` guarda onde esteve (030) |
| LGP-43 | API/BANCO | Dispositivo | Token de push: proteção, revogação, expurgo | B | 016:90; aparelhos.ts; servidor.ts:223; sem expurgo de revogado | Baixo | | Não | Push desligado em `fly.toml` |
| LGP-44 | CONSOLE | Operador DC360 | Credenciais de operador com segundo fator obrigatório e segredo cifrado | A | 038:198-260 (CHECKs) | Baixo | | Não | Corpo da 039 não lido |
| LGP-45 | CONSOLE | Operador DC360 | Acesso do fornecedor a dado de cidadão por credencial de dono, com registro | G | 011:13-20; sem pgaudit visto | Alto | | Sim | Fora do produto |
| LGP-46 | TRANSVERSAL | Backup | Backup do banco e do balde; alcance da eliminação sobre backups | G | COLOCAR-DE-PE.md:587-597; SAIDA-DE-MUNICIPIO.md:§3 | Alto | UPL-25 | Sim | Retenção do provedor não conferida |
| LGP-47 | TRANSVERSAL | Governança | Relatório de impacto à proteção de dados | D | busca por RIPD e impacto em docs/: sem resultado; especificação recomenda avaliação antes de módulos de abrigos, vulnerabilidade e geolocalização sensível | Médio | | Sim | |
| LGP-48 | TRANSVERSAL | Governança | Registro separado de evento de segurança com alerta | D | PRIVACIDADE.md:369 "previsto, não implantado" (documentado) | Médio | | Não | |
| LGP-49 | PORTAL | Novo canal | Conta, credencial e registro de acesso de usuário de secretaria, com visibilidade por órgão | E | 15.2.4; CHECKs de 4 papéis em 001:307, 010, 021:219-221 | Alto | LGP-18 | Sim | |
| LGP-50 | PORTAL | Novo canal | Retenção e expurgo do que a secretaria escreve e anexa | E | 15.9 | Alto | LGP-08 | Sim | |
| LGP-51 | PORTAL | Novo canal | Compartilhamento de dado de cidadão dentro da plataforma, substituindo o ofício por link | E | oficios/documento.ts:116-129 | Alto | LGP-19 | Sim | |
| LGP-52 | CIDADÃO | Novo canal | Aceite de termos e política com versão, data e revogação, por canal | E | 15.3 | Alto | LGP-29 a LGP-31 | Sim | |
| LGP-53 | CIDADÃO | Novo canal | Dados do cidadão no app: identificação, telefone, e-mail, localização, dispositivo, push | E | 15.9 | Alto | | Sim | Base legal por finalidade: DECISÃO HUMANA |
| LGP-54 | CIDADÃO | Novo canal | Menores de idade como titulares ou como fotografados | E | PRIVACIDADE.md:396-401 (só como atingidos) | Alto | | Sim | |
| LGP-55 | CIDADÃO | Novo canal | Autoatendimento de direitos do titular | E | 15.7 | Alto | LGP-24 a LGP-27 | Sim | |
| LGP-56 | CIDADÃO | Novo canal | Relato do cidadão separado de ocorrência oficial, com expurgo próprio | E | 001:170-171 (canais); solicitante obrigatório | Alto | | Sim | |
| UPL-01 | API/BANCO | Armazenamento | Toda leitura por URL pré-assinada, nunca pública | A | tipos.ts:11-14; s3.ts:97-151 | Médio | UPL-02 | Não | |
| UPL-02 | API/BANCO | Armazenamento | Bucket privado, criptografia em repouso e versionamento no provedor | G | configuração do Supabase não versionada; COLOCAR-DE-PE.md:587-589 | Alto | | Não | Bucket público tornaria a chave (UUIDs e sufixo) a única barreira |
| UPL-03 | API/BANCO | Isolamento | Prefixo por tenant, servidor monta a chave, CHECK no banco | A | 001:258-260; 009; 040:54-58; protocolo.ts:18-26; evidencias.test.ts:405, 468 | Baixo | | Não | |
| UPL-04 | API/BANCO | Autorização | Autorização de upload: permissão, RLS, ocorrência aberta, teto, chave do servidor | B | evidencias.ts:210-404; sem recorte de equipe (:288-297) | Médio | | Sim | Agente de outra equipe pode anexar. Não executei |
| UPL-05 | API/BANCO | Autorização | Autorização de download por município e equipe, com registro de quem viu | B | evidencias.ts:523-597; nenhum `registrarConsulta` | Médio | LGP-19 | Sim | |
| UPL-06 | API/BANCO | URL | Validade curta: escrita 15 min, leitura 5 min, laudo 30 min | A | s3.ts:62-63; documentos.ts:259, 271, 319 | Baixo | | Não | URL de 30 min é portadora: quem a copia lê sem login |
| UPL-07 | API/BANCO | Integridade | Objeto escrito uma vez (`if-none-match: *` assinado) | A | s3.ts:118-122; evidencias.ts:238-270; bytes-confirmados-nao-se-trocam.test.ts | Baixo | | Não | Provedor que ignore o cabeçalho perde só esta proteção (s3.ts:110-116) |
| UPL-08 | API/BANCO | Validação | MIME real do conteúdo | D | evidencias.ts:114-197 (só tamanho e hash); evidencias.test.ts:296-310 | Alto | | Não | Fraude passa por leitura de código (16.2) |
| UPL-09 | API/BANCO | Validação | Extensão coerente com o tipo | D | evidencia.ts:93-95; protocolo.ts:24 | Médio | UPL-08 | Não | |
| UPL-10 | API/BANCO | Validação | Magic bytes | D | busca sem resultado; levantamento §5.4 recomenda | Alto | UPL-08 | Não | Chromium do servidor decodifica a imagem ao gerar PDF |
| UPL-11 | API/BANCO | Validação | Lista fechada de tipos declarados (jpeg, png, webp, heic) | A | evidencia.ts:28-33; 003:20-24 | Baixo | | Sim (tipos, DH-02) | |
| UPL-12 | API/BANCO | Validação | Tamanho máximo: 15 MB evidência, 2 MB perfil | A | evidencia.ts:42, 101-112; 003:28-31; usuarios-eu.ts:98 | Baixo | | Sim (DH-02) | Perfil: só HEAD e pulado se sem tamanho |
| UPL-13 | CAMPO | Mídia | Compressão | C | vistoria/[id].tsx:1468-1471; foto-do-agente.ts:135-146; sem compressão no servidor | Baixo | | Não | Especificação VIS-04 pede qualidade configurável |
| UPL-14 | API/BANCO | Mídia | Tratamento de EXIF e GPS embutido no servidor | D | sem leitura nem remoção; levantamento §4.5 recomenda | Médio | | Sim (DH-04) | Originais saem no pacote com o EXIF que tiverem |
| UPL-15 | CAMPO | Mídia | EXIF nas fotos de vistoria e de perfil no cliente | G | perfil `exif: false` (apps/campo/src/dados/foto-do-agente.ts:98, teste no mesmo diretório :163); câmera sem `exif: true` (vistoria/[id].tsx:1468-1471), padrão da biblioteca NÃO confirmado | Médio | UPL-14 | Sim (DH-04) | |
| UPL-16 | API/BANCO | Mídia | Recodificação e sanitização | D | sem código | Médio | UPL-10 | Não | |
| UPL-17 | API/BANCO | Mídia | Miniatura e derivados | D | busca sem resultado no servidor; RNF-08 | Baixo | | Não | Painel e laudo servem o original |
| UPL-18 | API/BANCO | Integridade | SHA-256 do arquivo: medido no servidor, gravado, conferido contra o declarado | B | evidencias.ts:138-146; 003:16; bytes-confirmados-nao-se-trocam.test.ts:196-233 | Médio | | Não | Cliente não declara; sem CHECK de formato; sem reverificação na leitura; pacote não compara com a coluna |
| UPL-19 | API/BANCO | Segurança | Varredura de malware | D | busca sem resultado; levantamento §5.4 | Alto | | Sim (DH-03) | Precondição para abrir upload a cidadão |
| UPL-20 | API/BANCO | Segurança | Quarentena antes de disponibilizar | D | `enviada_em IS NULL` não é quarentena | Alto | UPL-19 | Sim | |
| UPL-21 | API/BANCO | Ciclo de vida | Varredura de objeto órfão: lista, reconferência, descarte manual | B | orfaos.ts; 035; objeto-orfao.test.ts; config.ts:178-198; fly.toml sem a variável | Médio | | Não | Nunca rodou contra o provedor real |
| UPL-22 | API/BANCO | Ciclo de vida | Reserva de teto abandonada e teto por município | A | 035; evidencias.ts:260-264, 353-375; teto-de-armazenamento.test.ts | Baixo | | Não | |
| UPL-23 | API/BANCO | Retenção | Retenção de fotos, assinaturas e fotos de perfil por prazo | D | 021:544-549 | Alto | LGP-10 | Sim (DH-01) | |
| UPL-24 | API/BANCO | Exportação | Originais no pacote de saída com soma de verificação | A | pacote.ts; saida-de-municipio.test.ts:331-341, 408 | Médio | | Não | |
| UPL-25 | API/BANCO | Continuidade | Backup e restauração dos objetos | D | COLOCAR-DE-PE.md:587-593: "segundo procedimento, ainda não escrito e não testado" (documentado) | Alto | LGP-46 | Não | Restaurar o banco devolve linhas apontando para objetos possivelmente ausentes |
| UPL-26 | API/BANCO | Autoria | Autor da evidência e evento de trilha com SHA-256 | A | 024:79-101; evidencias.ts:158-193; prova-fotografica.test.ts | Baixo | | Não | |
| UPL-27 | API/BANCO | Integridade | Imutabilidade da linha de evidência confirmada no banco e object lock | B | 034:241-244; 001:330-333; busca por object lock sem resultado | Alto | UPL-18 | Não | Só a rota protege `sha256`, `chave_storage`, `legenda`. Levantamento §4.5 recomenda |
| UPL-28 | CAMPO | Arquivo | Foto de perfil: prefixo do usuário, teto, troca apaga, sem validar conteúdo | B | usuarios-eu.ts:204-296; foto-do-agente.test.ts | Médio | UPL-08 | Não | |
| UPL-29 | API/BANCO | Arquivo | Assinatura: chave remontada no servidor | A | sincronizacao.ts:597-603; 009; documentos.ts:295-320 | Baixo | | Não | |
| UPL-30 | WEB | Arquivo | Laudo embute URL assinada de 30 min em HTML | B | laudo.ts:529, 627; documentos.ts:259 | Médio | UPL-06 | Não | O HTML salvo perde as imagens depois (documentos.ts:254-256) |
| UPL-31 | API/BANCO | Disponibilidade | Confirmação lê o objeto inteiro em memória | B | evidencias.ts:119-136; tipos.ts:51-76 | Médio | UPL-12 | Não | Depende de o provedor impor o `content-length` assinado: NÃO CONFIRMADO |
| UPL-32 | PORTAL | Novo canal | Anexo por usuário de secretaria: autoria, permissão, visibilidade por órgão | E | 003:62-64; 024:96-99; permissoes.ts:80 | Alto | LGP-49 | Sim | |
| UPL-33 | CIDADÃO | Novo canal | Upload pelo cidadão: identidade de tenant, tabela própria, limite por usuário, abuso | E | 001:170-171; global rate limit existe (limite-por-usuario.test.ts) | Alto | UPL-08, UPL-19 | Sim | |
| UPL-34 | CIDADÃO | Novo canal | Vídeo e áudio | E | CHECKs 003:20-31 | Alto | | Sim (DH-02) | |
| UPL-35 | CIDADÃO | Novo canal | HEIC de iOS: aceito no esquema, renderização no painel e no PDF | G | evidencia.ts:28-33 | Médio | UPL-17 | Sim | |
| UPL-36 | CIDADÃO | Novo canal | Dado de terceiros em foto (rostos, placas, menores) e moderação | E | sem código | Alto | LGP-54 | Sim | |

## Fluxos

| FLUXO | PASSO | ESTADO (EXISTE/PARCIAL/AUSENTE/NOVO V2) | EVIDÊNCIA |
| --- | --- | --- | --- |
| Evidência de campo | 1. Autorização (permissão, ocorrência, teto, chave do servidor) | EXISTE | evidencias.ts:210-404 |
| Evidência de campo | 2. PUT direto ao armazenamento com cabeçalhos assinados | EXISTE | s3.ts:97-139 |
| Evidência de campo | 3. Validação do conteúdo (MIME real, magic bytes, malware) | AUSENTE | 16.2 |
| Evidência de campo | 4. Confirmação: tamanho e SHA-256 medidos, trilha | EXISTE | evidencias.ts:114-197 |
| Evidência de campo | 5. Leitura por URL de 5 min, com registro de quem viu | PARCIAL (URL sim, registro não) | evidencias.ts:523-597 |
| Evidência de campo | 6. Retenção e descarte por prazo | AUSENTE | 021:544-549 |
| Evidência de campo | 7. Descarte de órfão | PARCIAL (lista e ato manual) | orfaos.ts; ARMAZENAMENTO.md |
| Minimização por prazo | 1. Município fixa o prazo | EXISTE (padrão vazio) | administracao.ts:632-702 |
| Minimização por prazo | 2. Relógio de 60 min sem execução na partida | PARCIAL (sem teste do agendador) | minimizacao.ts:146-174 |
| Minimização por prazo | 3. Função remove, redige e registra na trilha | EXISTE | 043:177-495 |
| Minimização por prazo | 4. Confirmação de que rodou em produção | NÃO CONFIRMADO | (sem acesso) |
| Pedido de titular | 1. Receber pedido por canal publicado | AUSENTE | 15.3, 15.7 |
| Pedido de titular | 2. Localizar o titular (acesso) | AUSENTE | 15.7 |
| Pedido de titular | 3. Corrigir, anonimizar ou eliminar | AUSENTE | 15.7 |
| Pedido de titular | 4. Responder com quem consultou | PARCIAL (por ocorrência) | prestacao-de-contas.ts:614-663 |
| Compartilhamento com órgão | 1. Emitir ofício numerado | EXISTE | oficios.ts |
| Compartilhamento com órgão | 2. Enviar link de uso único por e-mail | EXISTE, e-mail desligado em `fly.toml` (`RECUPERACAO_ATIVA=nao`; `EMAIL_ATIVO` documentado, NÃO CONFIRMADO) | SUBPROCESSADORES §1 |
| Compartilhamento com órgão | 3. Abertura do link entrega nome, relato e vulnerabilidade, registra IP | EXISTE | oficios.ts:598-627 |
| Compartilhamento com órgão | 4. Abertura autenticada do documento registra consulta | AUSENTE | oficios.ts:345-355 |
| Anexo pela secretaria | Receber, anexar, devolver, pedir complemento, concluir | NOVO V2 | (não existe) |
| Relato com foto pelo cidadão | Aceite, conta, upload, triagem, conversão em ocorrência | NOVO V2 | (não existe) |

## Gaps

1. [P0 LGPD] `tipoDescricao` (relato do solicitante, ate 300 caracteres) é copiado para `trilha_eventos.detalhe` (ocorrencias.ts:684, 792) e nenhuma migração o minimiza. Contradiz 029:26-28 e a promessa de que o relato sai no prazo. Só chamados `tipo = outro`.
2. [P0 LGPD] Nenhum texto de privacidade publicado, nenhum encarregado nomeado, nenhum canal e nenhum mecanismo de acesso, correção, eliminação ou portabilidade por titular. O piloto já trata dado de cidadão (LGP-24 a LGP-27, LGP-32).
3. [P0 SEGURANÇA] Upload sem validação de conteúdo: só o tipo declarado é conferido; bytes arbitrários com `content-type` de imagem e tamanho igual passam (16.2). Hoje exige conta de agente; vira crítico quando o upload for aberto a cidadão e a secretaria.
4. [P0 INTEGRIDADE] `evidencias` aceita UPDATE irrestrito do papel de aplicação, sem gatilho que proteja `sha256`, `chave_storage` e `legenda` depois da confirmação, sem object lock, e o aparelho não declara hash (UPL-18, UPL-27). Hoje só o código da rota protege a prova.
5. [A DEFINIR] Varredura de malware e quarentena inexistentes (UPL-19, UPL-20).
6. [A DEFINIR] Consentimento, aceite, versão e revogação: nenhum registro existe; se cada canal precisa e sob qual base é decisão humana (LGP-29 a LGP-31, LGP-52).
7. [A DEFINIR] O ofício por link entrega nome, relato e descrição de vulnerabilidade a órgão externo, e a abertura autenticada não gera registro de consulta. A política diz que "o dado em si" não sai (15.8, item 2).
8. [P1 OPERAÇÃO] Minimização: padrão NULL em todos os municípios, agendador sem teste e sem execução na partida, configuração de produção desconhecida (LGP-11, LGP-12).
9. [P1 OPERAÇÃO] Sem expurgo de `sessoes`, `recuperacoes_senha`, `interesse_municipio` e `aparelhos` revogados; o comentário da 011 promete purga que não existe (LGP-13, LGP-15, LGP-43).
10. [P1 PRODUTO] Consultas sem registro: lista `?busca=` associa nome a endereço sem rastro, fotos, ofício autenticado, trilha, pendências do agente (LGP-19, UPL-05).
11. [P1 PRODUTO] `GET /relatorios/exportacoes` não mostra `nivel` nem `justificativa` (LGP-20).
12. [P1 CONTINUIDADE] Balde de fotografias fora do backup e sem procedimento escrito; retenção do backup do provedor não conferida (UPL-25, LGP-46).
13. [P1 OPERAÇÃO] Documentação desatualizada: PRIVACIDADE.md seção 6 diz que a lista ainda devolve nome e contato (15.8, item 1).
14. [P1 OPERAÇÃO] Confirmação lê objeto inteiro em memória de máquina de 1 GB junto do Chromium, dependendo de o provedor impor o tamanho assinado (UPL-31). Também a saída de município acumula todas as tabelas em memória (PENDENCIAS.md da API).
15. [A DEFINIR] Sem retenção de fotografia, assinatura e foto de perfil (UPL-23, LGP-10).
16. [A DEFINIR] EXIF e GPS embutido: nenhum tratamento no servidor, padrão do cliente não confirmado, originais saem no pacote (UPL-14, UPL-15).
17. [A DEFINIR] Texto livre remanescente sem prazo (legenda, providência, observações de ofício, motivos, ponto de referência) (LGP-08).
18. [A DEFINIR] Endereço, ponto de referência, coordenadas, nome do assinante e IPs permanentes por decisão do projeto, não confirmada com município (LGP-09, LGP-14).
19. [A DEFINIR] Acesso do fornecedor ao banco por credencial de dono sem registro no produto (LGP-45).
20. [P1 PRODUTO] Autorização de upload sem recorte de equipe (UPL-04), a confirmar com cenário de teste.
21. [P2 EVOLUÇÃO] Miniaturas, derivados, compressão no servidor, hash declarado pelo cliente (UPL-13, UPL-17, UPL-18).
22. [P1 OPERAÇÃO] Varredura de órfãos desligada e nunca exercitada contra o provedor real (UPL-21).
23. [A DEFINIR] Relatório de impacto, registro de eventos de segurança com alerta, transferência internacional de coordenadas e push (LGP-47, LGP-48, LGP-39).
24. [P1 PRODUTO] V2: tabelas de auditoria com 4 papéis por CHECK, `evidencias` presas a ocorrência e agente, tipos de arquivo por CHECK, e-mail único global (15.9, 16.4).

## Decisões humanas

**DH-01 Retenção.**
- Pergunta: por quanto tempo ficam (a) nome e contato, relato e vulnerabilidade (hoje: prazo por município, padrão vazio), (b) fotografias, assinatura e foto de perfil (hoje: para sempre), (c) endereço e coordenadas (hoje: para sempre), (d) IP, sessões, links de redefinição e leads (hoje: para sempre), (e) logs e backups (hoje: desconhecido), (f) o que o portal e o app do cidadão gravarem?
- Por que importa: o produto promete minimização na política; sem prazo configurado nada expira, e a promessa sobre foto é futura.
- Bloqueia: publicação da política, retenção de foto (UPL-23), desenho de expurgo dos canais novos, configuração padrão dos municípios.
- Alternativas: manter padrão vazio e exigir decisão do município no provisionamento; fixar padrão do fornecedor com possibilidade de encurtar; prazos distintos por categoria e por canal; expurgo apenas do que não sustenta ato administrativo.
- Riscos: padrão vazio mantém o estado de hoje (acúmulo indefinido); padrão do fornecedor é o operador decidindo pelo controlador (o projeto recusou isso, 021:59-64); prazos por categoria multiplicam configuração e testes; expurgo de foto exige apagar objeto e linha com consistência (hoje apenas o descarte manual de órfão existe).

**DH-02 Anexos: tipos, tamanho e vídeo.**
- Pergunta: quais tipos (imagem apenas? PDF? documento? áudio? vídeo?), qual tamanho e quantidade por relato ou anexo, e HEIC entra?
- Por que importa: os CHECKs de `evidencias` fixam 4 imagens e 15 MB; o custo de armazenamento hoje estima cerca de 24 GB por município por ano só com fotos (ARMAZENAMENTO.md:8-11).
- Bloqueia: modelo de anexo do portal e do app, dimensionamento do teto, migração do CHECK.
- Alternativas: só imagem; imagem mais PDF; incluir vídeo com limite de duração e tamanho; transcodificar no servidor.
- Riscos: só imagem limita o portal (órgão costuma responder com documento); PDF e vídeo ampliam superfície de ataque e custo (scanner, transcodificação); HEIC sem conversão pode quebrar painel e PDF.

**DH-03 Varredura de malware e quarentena.**
- Pergunta: haverá varredura de todo upload (ClamAV em job, serviço do provedor, nenhuma), e o arquivo fica indisponível até passar?
- Por que importa: o levantamento recomenda; a especificação lista "antivírus" como pergunta aberta; hoje nenhuma validação de conteúdo existe.
- Bloqueia: abertura de upload a cidadão e a secretaria.
- Alternativas: scanner assíncrono com quarentena; validação só por magic bytes e recodificação de imagem; aceitar só imagens recodificadas pelo servidor; nenhuma.
- Riscos: scanner assíncrono adiciona fila, latência e estado "em análise" na vistoria em campo sem sinal; recodificação perde o original e o valor probatório do hash; nenhuma mantém o risco atual.

**DH-04 EXIF e GPS embutido.**
- Pergunta: preservar EXIF no original arquivado e remover nas cópias entregues (recomendação do levantamento §4.5), remover sempre, ou manter sempre? E a coordenada própria da foto continua vindo do rascunho da vistoria?
- Por que importa: o EXIF de foto de aparelho pessoal (cidadão) revela o endereço residencial e o modelo do aparelho; o original tem valor probatório.
- Bloqueia: foto do cidadão, pacote de saída, laudo publicado.
- Alternativas: preservar e derivar cópia sem EXIF para toda saída; remover no upload; manter como está.
- Riscos: preservar exige derivado (hoje inexistente) e decidir qual cópia cada tela serve; remover no upload perde prova de captura; manter expõe o cidadão.

**DH-05 Consentimento, aceite e base legal por canal.**
- Pergunta: para cada canal (painel do servidor, app do agente, portal de secretarias, app do cidadão, formulário de interesse) e cada finalidade, qual base legal se aplica e, quando for consentimento, como registrar versão, data, IP, usuário e revogação? Quem é controlador dos dados da conta do cidadão num app único para vários municípios?
- Por que importa: hoje não há nada registrado; a escolha muda schema, telas e contrato.
- Bloqueia: app do cidadão, publicação nas lojas, cadastro de usuário de secretaria.
- Alternativas: registro de aceite de versão de política em tabela própria por conta; consentimento granular por finalidade (localização, push, foto); nenhum consentimento onde outra base for adotada.
- Riscos: consentimento granular aumenta fricção e superfície de revogação; sem registro não há prova; escolher base errada invalida o desenho (decisão do jurídico, não do produto).

**DH-06 Direitos do titular.**
- Pergunta: quem atende (município como controlador, fornecedor apoiando), por qual canal, com qual procedimento e prazo, e o produto oferece ferramenta (busca por pessoa, correção auditada, anonimização sob demanda, exportação por titular)?
- Por que importa: hoje seria operação manual com credencial de dono e deixaria o nome antigo na trilha e nos registros append-only.
- Bloqueia: política publicada, autoatendimento no app, contrato.
- Alternativas: atendimento manual documentado; ferramenta administrativa no painel com evento de trilha; autoatendimento no app; identificador de titular nas ocorrências.
- Riscos: manual é lento e sem rastro no produto; ferramenta exige modelar "pessoa" (hoje texto livre) e resolver homônimos; autoatendimento amplia superfície de fraude de identidade; anonimização sob demanda em tabela append-only pede mecanismo de redação como o da 043.

**DH-07 Divulgação de vulnerabilidade, nome e relato em ofício a órgão externo.**
- Pergunta: o órgão destinatário precisa da descrição de vulnerabilidade e do nome do solicitante, ou basta a marca e o endereço? Como fica no portal?
- Por que importa: a página aberta pelo link imprime esses campos a pessoa sem conta; a política diz que o dado em si não sai.
- Bloqueia: texto da política, desenho do portal.
- Alternativas: manter; enviar só marca e endereço e liberar detalhe no portal autenticado; mascarar por padrão com liberação justificada e registrada.
- Riscos: manter mantém a divergência com a política; retirar dificulta a triagem pelo órgão; liberar com justificativa exige registro de consulta novo.

**DH-08 Texto livre remanescente, cópia do relato na trilha e retenção de IP e sessões.**
- Pergunta: legenda, providência, resposta, observação de ofício, motivos, ponto de referência, `tipoDescricao` e a cópia na trilha entram na minimização? IP de sessão, exportação, consulta e abertura de ofício têm prazo?
- Por que importa: são os buracos da promessa de minimização e de retenção de segurança.
- Bloqueia: fechamento do gap de `tipoDescricao`, política final.
- Alternativas: estender a função de minimização a essas colunas; redigir a cópia na trilha como se fez com `assinante`; manter como orientação operacional; prazo de log de segurança e expurgo de sessões.
- Riscos: estender reescreve a trilha em mais pontos (a 043 abriu uma única exceção e a protegeu com conferência); manter deixa dado sem prazo; prazo de IP curto enfraquece investigação de vazamento.

**DH-09 Identificação do cidadão e menores (app).**
- Pergunta: que identificador o app do cidadão exige (telefone, e-mail, documento)? Como tratar menor de idade como usuário ou como fotografado?
- Por que importa: define o mais sensível do inventário novo.
- Bloqueia: modelo de conta e de relato.
- Alternativas: relato anônimo com contato opcional; conta com telefone verificado; conta com documento.
- Riscos: anonimato facilita abuso e spam; telefone exige SMS ou outro canal; documento amplia risco e obrigação.

**DH-10 Transferência internacional e mapas.**
- Pergunta: aceitar coordenada para o Google (mapa, SDK, rotas) e push pela Apple e Google, ou adotar alternativas?
- Por que importa: a própria documentação diz que exige conversa com o município antes de ligar (SUBPROCESSADORES §2).
- Bloqueia: declaração nas lojas, política.
- Alternativas: manter com aviso e aceite do município; reduzir a precisão; trocar o provedor de mapa.
- Riscos: manter requer aceite e texto; reduzir precisão prejudica o trabalho em morro; trocar de provedor custa implementação.

**DH-11 Escopo de visibilidade e registro de acesso do portal.**
- Pergunta: que o usuário de secretaria vê (só a tarefa, a ocorrência, fotos?), e que registro de acesso é exigido?
- Por que importa: hoje o município inteiro vê tudo por papel, e as tabelas de auditoria têm 4 papéis.
- Bloqueia: modelo de permissão e de auditoria do portal.
- Alternativas: visão mínima por tarefa; visão da ocorrência sem pessoa; visão completa com registro.
- Riscos: visão mínima dificulta o trabalho do órgão; visão completa amplia exposição de dado de cidadão.

## Riscos arquiteturais

1. Modelo de identidade único: `usuarios` por município, e-mail globalmente único (002:31), 4 papéis fixados por CHECK em `trilha_eventos`, `trilha_administrativa`, `ocorrencia_consultas`. Usuários de secretaria e concessionárias, e o cidadão, exigem novo modelo de identidade e migração dessas tabelas.
2. A minimização é por coluna e por função escrita à mão (marcador por coluna, conferência de contagem). Cada coluna de texto livre que o portal ou o app criar nasce fora do alcance, e não há portão automático que force a decisão (ao contrário de `TABELAS_DA_SAIDA`, que um teste confere).
3. Trilha append-only e dado pessoal em texto livre convivem mal: a única exceção é uma função privilegiada que depende de BYPASSRLS no dono e de `row_security = off`. Mais campos na trilha pedem mais exceções, ou a regra de que texto livre nunca entra nela (já quebrada em `tipoDescricao`).
4. Toda a cadeia de confiança do arquivo termina no servidor da API, que baixa o objeto na memória (1 GB com Chromium) e renderiza imagens não validadas no Chromium para o PDF. Abrir upload a público amplia exatamente esse ponto.
5. Prova material sem imutabilidade no banco nem no balde: a integridade é de código de rota. V2 multiplica quem escreve em `evidencias`.
6. Dependência do papel dono com BYPASSRLS para minimização, varredura de prazo e eliminação (043, 045, 038): instalação com dono sem o atributo falha alto (correto), mas o requisito é operacional e documentado em `COLOCAR-DE-PE.md`.
7. Três caminhos de entrega de dado de cidadão a terceiros sem conta: ofício por link, URLs assinadas de 30 min no laudo HTML, pacote de saída. Todos dependem de o destinatário guardar o segredo.
8. Backups e logs do provedor fora do alcance de minimização e de eliminação; as promessas de eliminação do município (SAIDA-DE-MUNICIPIO §3) dependem de ciclo de backup não conferido.

## Dívidas técnicas

1. Agendador da minimização sem teste e sem execução na partida (minimizacao.ts:146-174).
2. `evidencias.sha256` é `text` livre sem CHECK de formato; sem gatilho de imutabilidade pós-confirmação (003:16; 034:241-244).
3. `GET /relatorios/exportacoes` não expõe nível e justificativa (prestacao-de-contas.ts:589-595).
4. PRIVACIDADE.md seção 6 desatualizada quanto à lista de ocorrências (PRIVACIDADE.md:382-386).
5. Pacote de saída acumula todas as tabelas em memória (apps/api/PENDENCIAS.md).
6. Retomada de purga de eliminação depende de memória do processo; função `eliminacoes_pendentes()` ausente na 038 (SAIDA-DE-MUNICIPIO.md:173-203).
7. `busca` de `ocorrencias` e de `usuarios` é coluna gerada com endereço, nome e e-mail, sem classificação de dado pessoal (041:220-226).
8. Varredura de objeto órfão nunca exercitada contra o provedor (ARMAZENAMENTO.md:256-270).
9. Testes de log de corpo não discriminam (log.test.ts:65-78), e o console não tem `redact` nem `trustProxy`.
10. Documentos com campos `[[ ]]` a preencher: PRIVACIDADE.md (10 ocorrências), SUBPROCESSADORES.md e SAIDA-DE-MUNICIPIO.md (prazos), INDISPONIBILIDADE.md (encarregado).
11. `DICIONARIO-DE-DADOS.md` não classifica dado pessoal, e o pacote de saída entrega o dicionário à parte.
