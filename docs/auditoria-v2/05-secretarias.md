# Frente 05: Secretarias e órgãos (§9 portal das secretarias, §12 fluxo Defesa Civil -> Secretaria)

Prefixo de ID na matriz: SEC. Auditoria somente leitura. HEAD e82719e (17/09/2026), árvore limpa exceto docs/AUDITORIA-2026-09-30.md. A auditoria anterior foi usada como mapa, nunca como prova.

## Resumo

- A superfície 4 (portal autenticado de secretarias/órgãos) NÃO existe. Não há app, rota, tabela, papel, coluna ou tela de órgão autenticável. `apps/` tem só `api`, `campo`, `console`, `web`. `usuarios.papel` é `CHECK IN ('coordenador','operador','agente_campo','administrador')` (001_base.sql:89) e `usuarios` não tem coluna de órgão.
- O "órgão" de hoje é um CATÁLOGO DE DESTINO (tabela `orgaos`, 017): nome, sigla, e-mail, telefone, ativo. Serve para (a) padronizar o destino da providência, (b) emitir ofício numerado, (c) formar a lista fechada de domínios de e-mail do envio. Não é entidade operacional nem tenant aninhado.
- Isso que existe está sólido: 24/24 testes de `orgaos-e-oficio.test.ts` passaram nesta auditoria; FK composta, RLS forçada, 404 entre municípios, ofício numerado sem colisão, link de uso único por índice parcial, lista de domínios no banco.
- A resposta do órgão acontece FORA do sistema (ofício impresso/telefone) e é DIGITADA por operador/coordenador/administrador da Defesa Civil, com "quem respondeu" em texto livre. O órgão nunca se autentica, nunca aceita, devolve, transfere, escala, anexa ou pede complemento. Documentado em PAPEIS_E_RESPONSABILIDADES.md:219-224 e confirmado no código (ocorrencias.ts:1038-1079).
- O link público `/publico/oficio/:token` é de LEITURA do ofício, uso único, não é canal de resposta. O próprio ofício diz "A resposta deste órgão deve ser registrada no protocolo acima" (oficios/documento.ts:139) sem dar canal.
- Isolamento ENTRE órgãos dentro de um município: inexistente. Toda leitura é por município (`app_organizacao_atual()`). Pelo menos 16 handlers de leitura de dado de negócio exigem só autenticação; `GET /oficios` e `GET /oficios/:id` respondem inclusive ao `agente_campo` (lido no código, não executado).
- Dois achados de segurança que bloqueiam qualquer portal: (1) `auth/vigencia.ts` (conta desativada, papel alterado, sessão encerrada) foi REMOVIDO do caminho de escrita em b4439ac (17/09/2026) e o teste está em `describe.skip`, embora dois comentários no código ainda afirmem que vale; (2) a resposta da providência não tem trava no banco nem lock (`UPDATE` de tabela inteira, sem `AND respondida_em IS NULL`).
- Fluxo Defesa Civil -> Secretaria: 4 passos EXISTEM (ocorrência, providência, ofício, sino na resposta), 7 PARCIAIS, 9 AUSENTES/NOVO V2 (ver Fluxos). Reinspeção e reabertura não têm aresta na máquina de estados (`providencia_pendente: ["encerrada"]`, dominio.ts:187).
- Tornar isso um portal autenticado SEM quebrar o isolamento entre municípios é viável (usuário de órgão continua sendo `usuarios` do município, herda RLS e FK composta), mas o modelo atual não dá nenhum isolamento por órgão; exige vínculo, competência, RLS/ACL por órgão, revisão das leituras e 4 CHECKs de papel. 13 decisões humanas listadas (D1 a D13: competência, transferência, escalonamento, prazos, MFA, concessionárias multi-município, modelo de tenant, dossiê mínimo, papel/vínculo, encaminhar antes da vistoria, encerramento, desativação, forma do portal).

---

# 1. §9 Portal das secretarias/órgãos: o que existe hoje

## 1.1 Como a evidência foi obtida

- Leitura de: `apps/api/src/rotas/orgaos.ts`, `oficios.ts`, `ocorrencias.ts` (providência, resposta, encerramento, pendentes, indicadores, detalhe), `evidencias.ts`, `busca.ts`, `avisos.ts`, `recorte-do-agente.ts`, `servidor.ts`, `auth/tokens.ts`, `auth/vigencia.ts`, `auth/suspensao.ts`, `auth/sessoes.ts`; migrações 001, 002, 003, 006, 017, 018, 020, 021, 028, 034, 043; `packages/shared` (`schemas.ts`, `dominio.ts`, `permissoes.ts`); `apps/web/src/paginas/Ocorrencia.tsx` e `Orgaos.tsx`; testes `orgaos-e-oficio`, `api.test.ts`, `agente-so-ve-a-equipe`, `vigencia-na-escrita`, `db/test/isolamento.test.ts`.
- Comando executado (um arquivo, como autorizado): `cd dc360/apps/api && npx vitest run test/orgaos-e-oficio.test.ts` -> 1 arquivo, 24 testes, 24 passaram (14,7 s). Cobre catálogo, providência amarrada, ofício, envio, link de uso único, expirado.
- `git show b4439ac^:dc360/apps/api/src/servidor.ts` tem `lerVigencia`/`exigirVigencia` (linhas 461-462); `git show b4439ac:...` tem zero ocorrências. `git log` confirma: introduzido em 5ecdf4c (15/09/2026), removido em b4439ac (17/09/2026, mensagem "ultimo commit").
- Tudo que aparece como "lido no código, não executado" não foi rodado; está marcado.

## 1.2 As 17 perguntas

**1. O conceito atual de "órgão" é catálogo/destinatário ou entidade operacional autenticável?**
Catálogo/destinatário. Prova: o cabeçalho de `rotas/orgaos.ts:7-30` descreve o catálogo como "órgãos de destino do município" e "lista fechada de domínios"; a tabela `orgaos` (017:86-132) tem `nome, sigla, email, telefone, ativo, desativado_em, motivo_desativacao` e nada de credencial, responsável, unidade ou competência. Não existe coluna `orgao_id` em `usuarios` (001_base.sql:83-95; migrações 002, 013, 040, 045, 046 só acrescentam credencial, foto, busca). O JWT carrega `sub, org, papel, nome, sid, sp` (tokens.ts:18-36), sem órgão. O órgão não é autenticável: classe E (novo requisito).

**2. Existe tabela equivalente a: secretaria; órgão; unidade administrativa; usuário de secretaria; vínculo usuário x órgão; competência; encaminhamento; aceite; devolução; escalonamento?**

| Conceito | Equivalente hoje | Veredito |
| --- | --- | --- |
| Secretaria | `orgaos` (sem tipo: bombeiros, secretaria e concessionária são a mesma coisa) | PARCIAL, catálogo plano |
| Órgão | `orgaos` (017) | EXISTE como catálogo |
| Unidade administrativa | Nenhuma. A especificação §11 (linha 310) prevê `Organization, Unit, User, Role, Team`; só Organization e Team existem. `equipes` são equipes da própria Defesa Civil (001:62-70) | AUSENTE |
| Usuário de secretaria | Nenhum. `papel` fechado em 4 valores, em 4 tabelas (ver SEC-48) | AUSENTE |
| Vínculo usuário x órgão | Nenhum. O único vínculo de lotação é `usuarios.equipe_id` (Defesa Civil) | AUSENTE |
| Competência | Nenhuma. `equipes.especialidade` é texto livre da DC; `vistoria_orgaos_indicados` (020) é indicação do agente ("acionar X"), não competência | AUSENTE |
| Encaminhamento | `providencias` (+ `oficios`, `oficio_envios`, `oficio_aberturas`) | EXISTE, sem estado próprio (derivado de `respondida_em`/`desfecho`) |
| Aceite | Nenhum. Mais próximo: `oficio_aberturas.resultado='entregue'` (abertura anônima do link; IP e user-agent) | AUSENTE |
| Devolução | `devolucoes_de_tarefa` (028) existe, mas é equipe de campo -> coordenação, sobre tarefa de vistoria; não sobre providência | AUSENTE para providência |
| Escalonamento | Nenhum. Busca por `escalon\|redirecion\|transferir\|reencaminh` em `dc360/**/*.{ts,tsx,sql,md}` só acha ruído não relacionado | AUSENTE |

**3. Como funciona hoje a resposta de um órgão parceiro?**
Fora do sistema, e registrada por terceiros. Fluxo real: coordenação cria providência (`POST /ocorrencias/:id/providencia`, ocorrencias.ts:976), emite ofício (`POST /oficios`), imprime ou envia link por e-mail; o órgão responde por telefone ou papel; alguém da DC abre "Registrar resposta do órgão" (Ocorrencia.tsx:2005-2137) e chama `POST /ocorrencias/:id/providencia/:providenciaId/resposta` (ocorrencias.ts:1038) com `desfecho` (lista fechada: atendida, atendida_parcialmente, recusada), `resposta` (texto) e `respondidaPor` (texto livre). Documentação e código concordam: PAPEIS_E_RESPONSABILIDADES.md:221-224 ("a providência sai por ofício e volta por telefone, e por isso o operador ganhou a ação de registrar a resposta").

**4. Existe link/token de uso único? (validade, hash, invalidação)**
Sim, mas é para LEITURA do ofício, não para resposta. `gerarTokenRenovacao()` = 32 bytes aleatórios base64url; só o hash SHA-256 vai ao banco (`oficio_envios.token_hash text NOT NULL UNIQUE`, 017:435; `hashDoToken`, tokens.ts:285). Validade `OFICIO_LINK_HORAS`, padrão 72, faixa 1-720 (config.ts:129); teto de reenvio `OFICIO_MAX_ENVIOS` padrão 3, faixa 1-20, teto absoluto 20 no banco (017:457). Invalidação: a primeira abertura grava `oficio_aberturas.resultado='entregue'`; índice único parcial `oficio_link_abre_uma_vez ON oficio_aberturas (organizacao_id, envio_id) WHERE resultado='entregue'` (017:565-567) e `abrir_oficio()` com `FOR UPDATE` (017:599-653) recusam a segunda com 410 e registram a recusa. Expirado: 410, registrado. Desconhecido: 404 sem registro (017:617-623). `oficio_envios` só aceita UPDATE de `desfecho`, `detalhe`, `provedor_id` (017:674-675; isolamento.test.ts:3976-3978), então `expira_em` e `token_hash` não se reescrevem. A ficha do ofício não devolve token nem hash (oficios.ts:203-246). Provado por testes: orgaos-e-oficio.test.ts:464-494, 542-552, 682+; isolamento.test.ts:2820-2880, 2953-2955. O token na URL é redigido no log (`PREFIXOS_COM_SEGREDO_NA_URL`, servidor.ts:159-161).

**5. A resposta atual exige autenticação?**
Sim, a escrita da resposta: `autorizar(app, req, "responder_providencia")` (ocorrencias.ts:1039), ou seja, token de usuário da Defesa Civil. O órgão nunca autentica. A única rota de leitura sem autenticação que devolve dado de município é `GET /publico/oficio/:token` (servidor.ts:742-752, comentário "A ÚNICA rota de leitura sem autenticação que devolve dado de município"), protegida por segredo de 32 bytes, expiração e uso único.

**6. Quem pode responder?**
`operador`, `coordenador`, `administrador` (permissoes.ts:79, 81-95, 96-111). `agente_campo` recebe 403 (api.test.ts:805-813). Nenhum vínculo com o órgão destinatário: qualquer um dos três registra resposta de qualquer providência de qualquer órgão do município (a consulta é `WHERE id = $1 AND ocorrencia_id = $2`, sem órgão, ocorrencias.ts:1047-1050).

**7. Como a autoria é registrada?**
Duas camadas distintas. (a) Quem DIGITOU: a trilha `resposta_providencia` grava `autor_id/autor_nome/autor_papel/origem='escritorio'` do token (trilha.ts:18-35) e `detalhe = {orgao, desfecho, respondidaPor}`. (b) Quem RESPONDEU: `providencias.respondida_por`, texto livre de 1 a 200 caracteres (schemas.ts:492), ex.: "Fiscal da Secretaria de Obras" (api.test.ts:741). Não há prova de que a pessoa nomeada respondeu, nem identidade do órgão.

**8. Existe prazo? Quem define? O que acontece ao vencer?**
Existe. Quem define: a coordenação no encaminhamento, `prazoHoras` inteiro 1 a 2160 (schemas.ts:464); o formulário abre com 72 fixo (Ocorrencia.tsx:1377); `prazo_em = now() + prazoHoras`. Não é por tipo nem por severidade (`PRAZO_PADRAO_HORAS` é da ocorrência, dominio.ts). Ao vencer: nada automático. A providência aparece em `GET /ocorrencias/providencias/pendentes` (ocorrencias.ts:1414-1432, ordenada por prazo) e nos contadores `providencias_abertas/providencias_vencidas` (ocorrencias.ts:1461-1468), provados em api.test.ts:910-945. NÃO gera aviso do sino: o `prazo_vencido` do sino varre `ocorrencias.prazo_em` (avisos.ts:256-285) e os tipos de aviso são `vistoria_recebida, prazo_vencido, providencia_respondida, retorno_nao_confirmado...` (018:56-62; 031:404-407). Não há push, e-mail, escalonamento nem rota de prorrogação de prazo de providência (as únicas escritas em `providencias` são o INSERT do encaminhamento e o UPDATE da resposta). Encerrar a ocorrência com providência vencida é permitido e só é avisado (ocorrencias.ts:1089-1099, 1130-1139).

**9. Existe aceite nominal?**
Não. A semântica mais próxima é "Aberto pelo órgão em <data>" (oficio-regras.ts:73-77), derivada de `oficio_aberturas` (IP, user-agent), anônima por construção.

**10. Existe devolução?**
Não para providência. O desfecho `recusada` é o único substituto, e é digitado pela DC. A `devolucoes_de_tarefa` (028) é a devolução de tarefa vencida pela equipe de campo à coordenação: outro conceito (append-only, com motivo fechado, idempotente), mas é bom precedente de padrão.

**11. Existe transferência?**
Não. O workaround é criar nova providência para outro órgão; não há campo de origem/vínculo entre providências (001_base.sql:274-285 + 006 + 017 não têm `parent`).

**12. Existe escalonamento?**
Não (ver pergunta 2).

**13. Existe anexação de evidência pelo órgão?**
Não. `evidencias` pertence à ocorrência (`ocorrencia_id`, 003:54-55), sem `providencia_id`. O envio exige `registrar_vistoria` (evidencias.ts:210-211), que só o `agente_campo` tem (permissoes.ts:80; nem coordenador nem administrador). O banco só aceita imagem (`tipo_de_imagem_aceito`, 003:20-24: jpeg, png, webp, heic), então um órgão não anexaria PDF, laudo ou ART mesmo que a permissão existisse. O requisito FLU-02 da especificação ("Registrar resposta e evidência de cumprimento", espec. linha 196) não está implementado.

**14. Existe histórico completo?**
Parcial. Na trilha da ocorrência entram `providencia`, `resposta_providencia`, `oficio_emitido`, `oficio_enviado` (só envio aceito) e `encerramento` (com `providenciasSemResposta`). `oficio_envios` guarda todas as tentativas (inclusive as que falharam) e `oficio_aberturas` todas as aberturas (append-only). Falta: aceite, devolução, reatribuição, prazo alterado, complemento, nova vistoria ligada à providência. E `providencias` é linha mutável (UPDATE em nível de tabela, ver SEC-32): só a trilha preserva o antes.

**15. O órgão consegue ver outras ocorrências do município?**
Hoje o órgão não tem acesso nenhum (sem conta). Se alguém criasse uma conta com o papel mais baixo existente (`operador`), ela leria o município inteiro: `GET /ocorrencias/:id` devolve `o.*`, trilha completa, vistoria e TODAS as providências de todos os órgãos (ocorrencias.ts:506-531, 606-625); `GET /ocorrencias`, `/mapa`, `/interditados`, `/providencias/pendentes` e `/busca` idem. O único recorte intra-município que existe é o do `agente_campo` por equipe (`recorte-do-agente.ts:30-38`).

**16. O órgão consegue ver apenas o item encaminhado?**
Só pelo link de uso único do ofício: um documento, uma abertura, sem navegação. Não existe "visão do item" autenticada, nem recorte por órgão em rota nenhuma.

**17. O modelo atual permitiria transformar esse fluxo em portal autenticado sem quebrar o isolamento?**
Resposta: sim para o isolamento ENTRE MUNICÍPIOS, não para o isolamento ENTRE ÓRGÃOS, que teria de ser construído. Argumento:

- RLS atual: toda policy de negócio contém `app_organizacao_atual()` (isolamento.test.ts:313-418); o GUC vem do token verificado (servidor.ts:417-489). Se o usuário de órgão for um `usuarios` do município (mesmo `org` no token), herda o isolamento entre municípios sem mudança. O portão não barra policy com condição a mais (ele só exige que cada expressão contenha `app_organizacao_atual`), então uma segunda condição por órgão passa no CA-06 (inferência, não testada).
- FKs compostas: o padrão `(organizacao_id, X_id) -> (organizacao_id, id)` (008, 017, 020) e o portão "toda referência entre tabelas de negócio inclui a organização" (isolamento.test.ts:435-450) cobrem tabelas novas de órgão, unidade, vínculo e encaminhamento desde que sigam o padrão. Uma FK composta também pode amarrar `orgao_id` a `organizacao_id` do usuário.
- O que NÃO está no modelo: nenhum conceito de "órgão do usuário". RLS e FK composta garantem "mesmo município", não "mesmo órgão". Um usuário de órgão com qualquer papel existente leria o município inteiro (pergunta 15). Seria preciso: vínculo; segundo contexto (novo GUC, como `app.orgao_atual`) ou filtro de aplicação no estilo `recorteDoAgente` (que hoje é SQL de aplicação, não RLS, e cada leitura precisa lembrar de aplicar); ACL por encaminhamento; revisão dos ~16 handlers de leitura que exigem só autenticação; 4 CHECKs de papel; `origem` da trilha.
- Risco de "quebrar o isolamento" por implementação: (1) policy com `OR app_orgao_atual() IS NULL` é fail-open se uma rota esquecer o `SET LOCAL`; (2) um novo papel de banco (ex.: `dc360_portal`) reprova o portão "nenhum papel além do de aplicação e do dono tem privilégio em tabela de negócio" (isolamento.test.ts:4005-4011; inferência pela leitura do teste, não executada), e as policies desse papel teriam de citar `app_organizacao_atual()` (313-418); (3) login de usuário de órgão por e-mail reaproveita `credenciais_para_login` (002:80-102) sem função nova, mas o e-mail é ÚNICO GLOBAL (`usuarios_email_global_idx`, 002:31), o que impede a mesma pessoa em dois municípios; (4) o teto de funções `SECURITY DEFINER` está em 27 (isolamento.test.ts:625-626); qualquer porta pré-tenant nova tem de caber ali ou ser recusada.
- Conclusão: o desenho atual suporta, com custo de banco e API, um portal dentro do mesmo município. Não suporta, sem decisão humana (D6), um órgão externo que atende vários municípios: ADR 0006:102 recusa explicitamente "um token que vale para mais de um município".

---

# 2. Modelo de segurança necessário na V2 (SEM implementar, SEM presumir que é o correto)

## 2.1 Entidades que provavelmente precisariam existir

Hipótese de trabalho: Município -> Secretaria/Órgão -> Unidade -> Usuário -> Papel + Competência. Cada linha abaixo é candidata, não decisão.

| Entidade candidata | Existe hoje? | O que o modelo atual já oferece | O que faltaria (hipótese) |
| --- | --- | --- | --- |
| Município (tenant) | Sim, `organizacoes` | RLS forçada, `organizacao_id`, suspensão, eliminação | Nada para o portal, salvo decisão sobre órgão externo (D6) |
| Órgão/Secretaria | Parcial, `orgaos` | Catálogo, unicidade por município, desativação com motivo, FK composta | Tipo (secretaria, autarquia, concessionária, bombeiros), gestor institucional, domínios permitidos, política de MFA, status operacional |
| Unidade (departamento/distrito/regional) | Não | Nenhum (a espec. §11 previa `Unit`) | Tabela filha de `orgaos` com FK composta; decidir se precisa existir |
| Usuário de órgão | Não | `usuarios` (município) com `papel` | Novo papel ou dimensão ortogonal; nome/cargo/matrícula funcional |
| Vínculo usuário x órgão/unidade | Não | `usuarios.equipe_id` como precedente de lotação lida do banco | Tabela N:N ou coluna, com início/fim, quem concedeu, motivo (registro não se apaga) |
| Papel no órgão | Não | `POSTO`, `podeGerirPapel` para a DC | Gestor do órgão, receptor/triador, executor, leitor |
| Competência | Não | `equipes.especialidade` (texto livre); COBRADE fechada em `dominio.ts` | Órgão x tipo COBRADE x tipo de providência x território x severidade (D1) |
| Encaminhamento com estado próprio | Parcial, `providencias` | Órgão do catálogo, prazo, responsável texto, resposta imutável por regra de app | Máquina de estados, destinatário nominal (FK usuário), prioridade, `parent_id` (complemento/transferência), prazo alterável com motivo |
| Eventos do encaminhamento | Parcial, `trilha_eventos` | Append-only, mesma transação do ato | Aceite, devolução, transferência, escalonamento, complemento, execução, conclusão; `autor_papel` e `origem` abertos a órgão |
| Anexos do encaminhamento | Não | `evidencias` (imagem, por ocorrência), presigned de 5 min | Anexo por encaminhamento, tipos além de imagem, autoria, escopo por órgão |
| Concessão/visibilidade por item | Não | `recorteDoAgente` (por equipe, em SQL) | ACL por encaminhamento ou RLS por órgão; dossiê mínimo por competência |
| Regras de escalonamento/SLA | Não | `PRAZO_PADRAO_HORAS` (ocorrência, fixo no código) | Prazo por tipo, configurável por município, cadeia de escalonamento |
| Delegação/substituição | Não | Nenhum | Substituto de gestor, férias (decidir se entra) |

## 2.2 Comparação resumida com o modelo atual

- Hoje: tenant único (município), 4 papéis todos da DC, autorização `papel x ação` no pacote compartilhado, sem dimensão de "de quem é o item" exceto `equipe_id` para o agente.
- V2: passa a existir uma segunda dimensão de escopo (órgão) que deve valer na API, no banco, nos arquivos, na busca, nos documentos, nas notificações, nas exportações e na trilha. Hoje essa dimensão não existe em nenhuma camada.

## 2.3 Decisões arquiteturais a tomar (cada item aponta para a decisão humana correspondente, em "Decisões humanas")

1. Órgão como tenant aninhado (`organizacao_id` + `orgao_id` em toda tabela, RLS em dois níveis) versus entidade dentro do município (RLS só por município, órgão por ACL/filtro de aplicação/visões) versus híbrido (RLS por município em tudo, RLS por órgão só nas tabelas de encaminhamento). (D7)
2. RLS por órgão além da do município: mecanismo (segundo GUC `SET LOCAL`, policy por papel de banco, visão `security_invoker`), e como não ser fail-open. (D7)
3. Usuário pertence a um órgão ou a vários? E a uma unidade? (D9)
4. Competência: por tipo de ocorrência (COBRADE), por tipo de providência (taxonomia a definir pelo domínio, não inventar), por território, por severidade; quem define; configurável por município? (D1)
5. Identidade de órgão externo (concessionária, bombeiros estadual) e de quem atende mais de um município (conflita com `usuarios_email_global_idx` e com ADR 0006:102). (D6)
6. Papel: valor novo em `papel` (afeta 4 CHECKs + `POSTO` + `podeGerirPapel` + regra do último administrador) versus dimensão ortogonal (papel na DC x papel no órgão). (D9)
7. Autorização lida do token (JWT com órgãos) versus lida do banco por requisição (precedente: equipe do agente, sincronizacao.ts:542-545 e recorte-do-agente.ts:17-18). Decisão técnica, com efeito em SEC-46. (D7)
8. Quem administra usuários do órgão: administrador do município, gestor do órgão (teto do órgão, análogo à ADR 0006) ou ambos. (D9)
9. Portal como app separado (origem própria, `aud` de JWT própria, como o console e o `dc360-desafio`) versus rota do `apps/web` com papel restrito. (D13)
10. Trilha: mesmos `trilha_eventos` (abrir `autor_papel`/`origem`, acrescentar visibilidade por evento) versus tabela própria de eventos do encaminhamento. (D8, D13)
11. Convivência do link de uso único (órgão sem conta) com o portal autenticado. (D13)
12. O que acontece com encaminhamentos abertos quando o órgão é desativado ou o usuário é desvinculado. (D12)

## 2.4 Autorização por camada: hoje e o que a V2 teria que garantir

Premissa: esconder menu não é controle. A web monta o menu por `acoesDoPapel` (Estrutura.tsx) mas a prova de controle é o servidor.

| Camada | Como existe hoje para o fluxo de órgão (prova) | O que a V2 teria que garantir |
| --- | --- | --- |
| API | Escrita: `autorizar(app, req, acao)` antes do banco (orgaos.ts:114,151,208,258; oficios.ts:253,346,366; ocorrencias.ts:977,1039,1082). Órgão: `gerenciar_equipes`; ofício: `emitir_documento`; envio: `encaminhar_providencia`; resposta: `responder_providencia`. Leitura: `exigirAutenticacao` sem permissão em ~16 handlers (ocorrencias 7, evidencias 2, oficios 2, avisos 2, orgaos 1, busca 1, documentos 1; contagem por grep de `app.exigirAutenticacao(req)`). `GET /oficios` e `GET /oficios/:id` sem permissão nem recorte (oficios.ts:177-246). `superficie.test.ts` prova só que toda rota exige autenticação (lista curta de isenções com razão). Não há gate de "toda leitura declara quem pode ler" | Toda rota tocada por usuário de órgão declara (papel x órgão x competência x estado do item) e devolve 404 para item fora do escopo; gate automatizado que reprove rota nova sem declaração; revisar as ~16 leituras |
| Banco | RLS forçada por município; FK composta; append-only por ausência de policy; `providencias` com GRANT UPDATE de tabela inteira e policy `providencias_atualizacao` só por município (034:259-262): o banco não impede reescrever `prazo_em`, `orgao_id`, `descricao`, `resposta` | Escopo por órgão no banco para tabelas de encaminhamento; UPDATE por coluna (o projeto já faz isso em `oficio_envios`, `devolucoes_de_tarefa`, `saidas_a_campo`: isolamento.test.ts:3962-3986); imutabilidade da resposta por trigger/restrição; teste de isolamento por órgão no mesmo estilo do CA-06 |
| Arquivos/evidências | Chave `tenant/<org>/ocorrencias/<id>/...` com CHECK (001:258-260; sincronizacao.ts:718); URL de leitura pré-assinada de 5 min (`segundosLeitura = 5*60`, s3.ts:62-63), emitida só após conferir permissão e recorte de equipe (evidencias.ts:523-597); URL é credencial ao portador durante a janela, sem ligação com a identidade; só imagens | Emissão de URL re-autorizada por órgão/encaminhamento; janela curta; nunca em log; anexos de órgão em prefixo próprio ou por metadado com RLS; tipos além de imagem com validação; ao desativar usuário, sem URL longa viva |
| Busca | `GET /busca` obedece "a mesma regra da rota de lista de cada tipo" (busca.ts:35-50): qualquer conta acha órgãos; ocorrências só recortadas para o agente; órgão do catálogo aparece para todos | Busca do portal restrita aos encaminhamentos do órgão; nunca a ocorrências do município; nunca pelo nome do solicitante (a busca por nome registra consulta hoje, busca.ts:59-66) |
| Documentos/ofícios | `GET /oficios/:id/documento` exige `emitir_documento` (oficios.ts:345-346) e NÃO registra consulta; laudo registra (`registrarConsulta`, documentos.ts:698). O ofício leva nome do solicitante, endereço, descrição e vulnerabilidade a qualquer órgão (documento.ts:113-129), sem minimização por competência | Documento do órgão gerado por competência (dossiê mínimo), com registro de consulta por usuário nominal; decisão de LGPD sobre o que cada órgão vê |
| Notificações/e-mail | `Notificador` genérico (auth/notificador.ts); ofício por e-mail leva só número, município, tipo e link de uso único (documento.ts:177-209); destinatário restrito por trigger a domínio de órgão ativo do catálogo (017:501-523); `EMAIL_ATIVO` padrão `nao` (config.ts:102) e `fly.toml` não o liga; nada notifica prazo de providência; push só para agente de campo (busca por "providencia" em `src/push`: zero) | Notificação ao usuário/caixa do órgão sem dado sensível no corpo (manter a regra do ofício); destinatário resolvido pelo vínculo, não por texto; prazo próximo e vencido; decisão de canal |
| Exportações | `exportar_dados` só coordenador/administrador (permissoes.ts:93,109); saída de município inclui `providencias`, `orgaos`, `oficios` inteiros (saida/pacote.ts:92-94); registro de exportação (007) | Nenhuma exportação para papel de órgão, ou exportação escopada ao que o órgão pode ver, com registro |
| Eventos/trilha | `trilha_eventos` append-only; `autor_papel` CHECK com 4 valores e `origem` CHECK `('campo','escritorio')` (001:307-308); `GET /ocorrencias/:id` devolve a trilha inteira a qualquer autenticado não-agente (ocorrencias.ts:516-521) | Eventos de órgão com autor nominal (usuário + órgão); visibilidade por evento (o que o órgão vê da trilha); trilha de concessão/revogação de vínculo e de mudança de competência |

## 2.5 Cenários negativos: sistema atual (com prova) e o que a V2 precisaria garantir

| # | Cenário | Sistema ATUAL | V2 precisaria garantir |
| --- | --- | --- | --- |
| 1 | Obras tentando acessar Saúde | Não testável: não existe usuário de órgão nem vínculo (papel CHECK 4 valores; `usuarios` sem órgão). Um operador da DC veria os dois (ocorrencias.ts:506-531) | Usuário de Obras não lê, não lista, não busca, não baixa arquivo, não recebe e-mail de Saúde; 404, com teste por camada |
| 2 | Secretaria A tentando acessar Secretaria B | Idem: dimensão inexistente | Mesmo que 1, inclusive por URL de arquivo e por ofício |
| 3 | Usuário de um município tentando acessar outro | PROVADO. API: `PATCH /orgaos/<id de B>` por coordA = 404 e o nome de B não mudou (orgaos-e-oficio.test.ts:219-233); `GET /oficios/<id de A>` por coordB = 404 (366-371); providência para órgão de B = 404 `orgao_nao_encontrado` (270-284); api.test.ts:258-283. Banco: `SELECT` de órgão/ofício/envio de outro município devolve 0 linhas (isolamento.test.ts:2559-2563, 2731-2740); FK composta recusa providência para órgão de B (2566-2593); domínio de B recusado no envio (orgaos-e-oficio.test.ts:415-420) | Manter; acrescentar: órgão de A não recebe encaminhamento de B; usuário de órgão externo multi-município não cruza contexto |
| 4 | Acesso direto alterando ID | Entre municípios: 404 (acima). Dentro do município: qualquer autenticado não-agente lê qualquer ocorrência/providência/ofício por id; agente recebe 404 fora da equipe (agente-so-ve-a-equipe.test.ts:166-229). `POST .../providencia/:pid/resposta` exige o par `(providenciaId, ocorrenciaId)` (ocorrencias.ts:1047-1050); não há teste de 404 entre municípios especificamente desta rota (por RLS o SELECT volta vazio: lido no código, não executado) | Autorização por objeto: encaminhamento fora do órgão/competência do usuário = 404; teste de IDOR por rota |
| 5 | URL de arquivo conhecida | Presigned de leitura 5 min (s3.ts:62-63), bearer durante a janela; sem URL pública (evidencias.ts:516-522); local: assinatura e validade conferidas (armazenamento-local.ts:25-29,66-72). Link do ofício: uso único, 72 h padrão, 410 na 2ª abertura, 404 se desconhecido (orgaos-e-oficio.test.ts:464-494). Não testado contra S3/R2 real | URL emitida só após autorizar o usuário do órgão e o item; janela curta; proibir log de URL; decidir se o portal faz streaming pela API (permite revogar) |
| 6 | Usuário desativado | Login e renovação recusam (servico.ts:192, 341-342, 375-376, 500-506); `PATCH /usuarios/:id/situacao` revoga as sessões (administracao.ts:255-257). MAS o token de acesso vivo continua lendo E escrevendo até `ACESSO_MINUTOS` (padrão 15, máx 60, config.ts:356): a conferência de vigência foi removida (servidor.ts:463-467 só chama `exigirAcessoAtivo`, que só checa suspensão do município; b4439ac) e o teste de conta desativada está `describe.skip` (vigencia-na-escrita.test.ts:102-119). Dois comentários ainda afirmam o contrário: auth/sessoes.ts:20-27 e auth/suspensao.ts:36-42 | Conferência de vigência (conta, vínculo ao órgão, papel, sessão) na leitura e na escrita de portal, ou janela de token de minutos; teste ativo |
| 7 | Encaminhamento encerrado | Criar providência em ocorrência encerrada: recusado (`exigirTransicao`, `transicaoPermitida(encerrada, providencia_pendente)` falso; ocorrencias.ts:150-155; dominio.ts:188). Anexar evidência: recusado (evidencias.ts:298-303). Registrar RESPOSTA: o código NÃO confere status (ocorrencias.ts:1038-1079) e não há teste; a pendente continua listada depois de encerrar (api.test.ts:940+) | Regra explícita (pode responder após encerrar? como complemento?), com teste; estado próprio do encaminhamento independente do da ocorrência |
| 8 | Usuário removido da secretaria | Não existe vínculo. Análogo: desativar ÓRGÃO com providências abertas é permitido (orgaos.ts:207-247, sem checagem; o `GET /orgaos` só mostra a contagem) e ofício novo para órgão desativado é recusado (oficios.ts:410-416; test 577) | Desvincular revoga acesso ao que era do órgão na hora, reatribui ou sinaliza itens em andamento, registra quem e por quê |
| 9 | Mudança de secretaria | Não existe. Precedente bom: a equipe do agente é lida do banco a cada leitura e na sincronização, "e não do token" (recorte-do-agente.ts:17-18; sincronizacao.ts:542-545; teste "Agente sem equipe", agente-so-ve-a-equipe.test.ts:231-256). Precedente ruim: o `papel` vem do token (tokens.ts:18-36) e não é revalidado (cenário 6) | Vínculo lido do banco por requisição; itens abertos do órgão antigo não acompanham o usuário; histórico preserva o vínculo da época |
| 10 | Tentativa de responder item não atribuído | Hoje "atribuído" não existe: `responsavel` é texto livre (schemas.ts:463); qualquer operador/coordenador/administrador do município responde qualquer providência de qualquer órgão e pode digitar qualquer `respondidaPor` (api.test.ts:732-761). Agente: 403 (805-813) | Só usuário vinculado ao órgão destinatário (e, se a regra for essa, ao responsável designado) responde; 404 para o resto; resposta sem `respondidaPor` digitado, autoria vem do token |

---

# 3. §12 Fluxo ponta a ponta, passo a passo

Resumo: a cadeia Ocorrência -> Providência -> Órgão -> Ofício -> Resposta existe, mas a metade "órgão" é de papel e telefone. Detalhe por passo na seção Fluxos (abaixo). Pontos que merecem narrativa:

- **Só depois da vistoria.** A máquina de estados só aceita `providencia_pendente` a partir de `vistoria_concluida` (dominio.ts:158,185-187; `exigirTransicao` em ocorrencias.ts:982). Uma enxurrada que exige Trânsito ou Obras antes de a equipe chegar não pode ser encaminhada pelo sistema; ou se faz vistoria, ou se encerra. Decisão de produto (D10).
- **Status único da ocorrência, sem status da providência.** Depois de responder, a ocorrência continua `providencia_pendente` (a rota de resposta não muda status, ocorrencias.ts:1064-1076) até o encerramento. Várias providências convivem (nova providência não exige transição: `de === para`, ocorrencias.ts:130-149), sem vínculo entre si.
- **Execução e evidência não existem.** Nenhum passo registra que o órgão executou, nem anexa prova de cumprimento; o campo `resposta` é texto (máx. 2000).
- **Retorno à Defesa Civil.** O sino recebe `providencia_respondida` por trigger na transição `respondida_em` nulo -> preenchido (018:315-338; teste em sino-de-avisos.test.ts:619). Aceitar, pedir complemento, reinspecionar ou reabrir não existem: a única saída é nova providência ou encerrar (`providencia_pendente: ["encerrada"]`, dominio.ts:187; `encerrada` é terminal; não há rota `reabr*`/`reinsp*`, verificado por grep em ocorrencias.ts).
- **Encerramento.** Permitido com providência sem resposta; só avisa e registra `providenciasSemResposta` na trilha (ocorrencias.ts:1089-1139; api.test.ts:815-853; README:420-423). A especificação RN-05 pede "verificação das providências obrigatórias" (espec. linha 244): a implementação escolheu não travar, por escrito. Bloqueia apenas interdição ativa (ocorrencias.ts:1118-1124).
- **Três lados da "vigência na escrita":** comentário (sessoes.ts:20-27 e suspensao.ts:36-42 dizem que vale desde 15/09/2026), código (servidor.ts:454-467: "DESLIGADO NESTA IMPLANTAÇÃO, DE PROPÓSITO"; só checa suspensão do município) e teste (`describe.skip`). Não escolho versão: vale o código executado; ver SEC-46.

---

## Matriz D

| ID | SUPERFÍCIE | DOMÍNIO | REQUISITO / CAPACIDADE | ESTADO | EVIDÊNCIA | RISCO | DEPENDÊNCIAS | DECISÃO HUMANA? | OBSERVAÇÃO |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SEC-01 | Web DC (1) | Órgão | Catálogo de órgãos por município (nome, sigla, e-mail, telefone, desativação com motivo) | A | 017:86-156; orgaos.ts:113-290; orgaos-e-oficio.test.ts:175-267 (24/24 passaram) | Baixo | RLS, FK composta | Não | Cadastro estrutural, gerido por `gerenciar_equipes` (coordenador/administrador) |
| SEC-02 | Portal (4) | Órgão | Órgão como entidade operacional autenticável | E | `usuarios` sem órgão (001:83-95); JWT sem órgão (tokens.ts:18-36); `apps/` só api/campo/console/web | Alto | D6, D7, D9 | Sim | Não existe: prova por ausência |
| SEC-03 | Portal (4) | Órgão | Tipologia e hierarquia: secretaria, órgão, unidade, concessionária | D | `orgaos` plano; espec. §11 (linha 310) prevê `Unit`; nenhuma tabela de unidade | Médio | D1, D7 | Sim | A espec. e a PAPEIS_E_RESPONSABILIDADES (pergunta 9, linha 281) já perguntavam por unidade/distrito |
| SEC-04 | Portal (4) | Identidade | Usuário de secretaria/órgão com papel próprio | E | `usuarios.papel CHECK` com 4 valores (001:89) | Alto | SEC-48, D9 | Sim | Hoje ninguém de fora da DC tem conta |
| SEC-05 | Portal (4) | Identidade | Vínculo usuário x órgão/unidade, com histórico | E | Nenhuma tabela/coluna; só `usuarios.equipe_id` (DC) | Alto | D9 | Sim | Precedente de lotação lida do banco: recorte-do-agente.ts:17-18 |
| SEC-06 | Portal (4) | Competência | Competência do órgão (quem pode receber o quê) | E | Nenhum campo de competência em `orgaos` (017:86-132); `equipes.especialidade` é texto da DC | Alto | D1 | Sim | Não inventar taxonomia: COBRADE é a única lista fechada de tipos |
| SEC-07 | Web DC (1) | Órgão | Criação automática de órgão por trigger a partir de texto livre | B | 017:248-282; orgaos-e-oficio.test.ts:286-311 | Médio (V2) | D1, D7 | Sim | Útil hoje (não trava encaminhamento urgente); na V2 criaria "órgão fantasma" sem usuário, e-mail nem competência |
| SEC-08 | Web DC (1) | Órgão | Desativação de órgão com providências abertas | B | orgaos.ts:207-247 (sem checagem de abertas); `GET /orgaos` só informa contagem (orgaos.ts:96-107) | Médio | D12 | Sim | Providências abertas ficam órfãs de destinatário ativo |
| SEC-09 | Web DC (1) | Encaminhamento | Encaminhar providência a órgão do catálogo, com isolamento entre municípios | A | ocorrencias.ts:976-1028; 017:221-226; orgaos-e-oficio.test.ts:270-284; isolamento.test.ts:2566-2593 | Baixo | | Não | 404 `orgao_nao_encontrado` para órgão de outro município |
| SEC-10 | Web DC (1) | Encaminhamento | Encaminhar a qualquer momento (antes da vistoria) | B | dominio.ts:158,185-187; ocorrencias.ts:982 | Médio | | Sim | Providência só a partir de `vistoria_concluida`; triagem/em_campo não encaminham |
| SEC-11 | Web DC (1) | Encaminhamento | Cancelar/corrigir providência enviada ao órgão errado | D | Só há INSERT e UPDATE da resposta em `providencias` (ocorrencias.ts:1009-1017, 1064-1068); sem rota de cancelamento | Médio | | Sim | Contradiz "registro se encerra com motivo" (CLAUDE.md); o workaround é registrar `recusada` |
| SEC-12 | Web DC (1) | Encaminhamento | Responsável nominal no órgão (destinatário do item) | C | `responsavel` texto livre 1-200 (schemas.ts:463); ofício imprime "Responsável indicado" (documento.ts:102) | Médio | SEC-05 | Sim | Não é usuário, não gera fila do responsável (FLU-01 da espec.) |
| SEC-13 | Web DC (1) | Prazo | Prazo da providência | C | `prazoHoras` 1-2160 (schemas.ts:464); padrão 72 na tela (Ocorrencia.tsx:1377); `prazo_em = now()+horas` (ocorrencias.ts:1012) | Médio | | Sim | Fixo por formulário; não por tipo/severidade |
| SEC-14 | Web DC (1) | Prazo | Visibilidade de providência vencida (lista e indicador) | A | ocorrencias.ts:1414-1432, 1461-1468; api.test.ts:910-945 | Baixo | | Não | Lista por prazo; não some ao encerrar a ocorrência |
| SEC-15 | Web DC (1) | Prazo | Notificação ou escalonamento ao vencer/próximo de vencer | D | Sino varre `ocorrencias.prazo_em` (avisos.ts:256-285); tipos de aviso sem prazo de providência (018:56-62; 031:404-407); `src/push` sem "providencia" | Alto | D3, D4 | Sim | Espec. FLU-03 (M): "Notificar prazos próximos e vencidos". O sino materializa o prazo vencido só quando alguém o consulta (avisos.ts:244-248; o mesmo vale para o retorno de saída, 299-303) |
| SEC-16 | Web DC (1) | Prazo | Prorrogação/alteração de prazo da providência, com motivo | D | Nenhuma rota escreve `prazo_em` de providência além do INSERT | Médio | | Sim | `saidas_a_campo` tem prorrogação idempotente (032) como precedente de padrão |
| SEC-17 | Web DC (1) | Ofício | Ofício numerado por município/ano, um por providência | A | 017:293-338, 343-405; oficios.ts:252-343; isolamento.test.ts:2664-2730; orgaos-e-oficio.test.ts:314-364 | Baixo | | Não | Numeração travada em transação; sem UPDATE/DELETE |
| SEC-18 | Web DC (1) | Ofício | Link de uso único (hash, expiração, teto de reenvio, 410, 404) | A | 017:426-653; oficios.ts:598-670; orgaos-e-oficio.test.ts:464-494, 542-552, 682+; isolamento.test.ts:2820-2880, 2953-2955 | Baixo | | Não | Canal de LEITURA do ofício, não de resposta |
| SEC-19 | Web DC (1) | Ofício | Link que sobrevive a pré-leitura automática (scanner de e-mail, prévia) | B | Consumo por GET (oficios.ts:602-627); comentário admite "o provedor de email" como quem pode abrir antes (oficios.ts:630-638) | Médio | | Sim | O link pode ser "queimado" por robô; o destinatário legítimo recebe 410 e pede reenvio (teto 3) |
| SEC-20 | Web DC (1) | Ofício | Envio do ofício por e-mail ao órgão | B | oficios.ts:365-581; `EMAIL_ATIVO` padrão `nao` (config.ts:102); fly.toml não o liga (só RECUPERACAO_ATIVA=nao, linha 67); orgaos-e-oficio.test.ts:373-680 com notificador de teste | Médio | Provedor de e-mail | Sim | Existe e passa em teste; no deploy padrão o envio recusa com 503 `envio_desligado` |
| SEC-21 | Web DC (1) | Ofício | Entrega real por provedor de e-mail em produção | G | notificador-http.test.ts (contrato, sem rede); docs/LIGAR-O-EMAIL.md:8; nenhum provedor real exercitado | Médio | | Não | NÃO CONFIRMADO: sem acesso a segredos/ambiente real |
| SEC-22 | Web DC (1) | Ofício | Lista fechada de domínios (só domínio de órgão ativo do catálogo) | A | 017:501-523; orgaos-e-oficio.test.ts:399-427; isolamento.test.ts:2743-2775 | Baixo | | Não | Protege contra uso do painel como encaminhador; o e-mail do órgão é editável por `gerenciar_equipes` com trilha (orgaos.ts:173-184) |
| SEC-23 | Portal (4) | Recebimento | Recebimento/ciência do órgão | C | `oficio_aberturas` (IP/UA); "Aberto pelo órgão em" (oficio-regras.ts:73-77) | Médio | | Não | Anônimo; prova que alguém abriu, não quem |
| SEC-24 | Portal (4) | Aceite | Aceite nominal do encaminhamento por usuário autorizado | E | Nenhum aceite em schema, rota ou tela | Alto | SEC-04, SEC-05 | Sim | Semântica do aceite (assumir responsabilidade) é decisão |
| SEC-25 | Portal (4) | Devolução | Devolução do encaminhamento pelo órgão, com motivo | E | `devolucoes_de_tarefa` (028) só para campo; para providência não existe | Alto | SEC-24 | Sim | Padrão reaproveitável: append-only, motivo fechado, idempotência |
| SEC-26 | Portal (4) | Transferência | Transferência entre órgãos/unidades, com vínculo à origem | E | Sem `parent` em `providencias` (001:274-285; 006; 017) | Médio | D1, D2 | Sim | Quem pode encaminhar a outra secretaria é decisão de competência |
| SEC-27 | Portal (4) | Escalonamento | Escalonamento por prazo/recusa/inércia | E | Nenhuma ocorrência no código (grep) | Médio | SEC-15 | Sim | |
| SEC-28 | Portal (4) | Complemento | Pedido de complemento (DC -> órgão e órgão -> DC) | E | Nenhum | Médio | SEC-24 | Sim | Hoje: nova providência, desconectada |
| SEC-29 | Web DC (1) | Resposta | Registrar a resposta do órgão (desfecho fechado, texto, quem respondeu) | C | ocorrencias.ts:1038-1079; schemas.ts:468-494; Ocorrencia.tsx:2005-2137; api.test.ts:732-761 | Médio | | Não | Feita pela DC, em nome do órgão |
| SEC-30 | Portal (4) | Resposta | Resposta pelo próprio órgão, autenticado | E | Nenhuma | Alto | SEC-04, SEC-05 | Sim | |
| SEC-31 | Web DC (1) | Resposta | Autoria da resposta | C | Trilha: digitador do token (trilha.ts:18-35); `respondida_por` texto livre (schemas.ts:492) | Médio | | Sim | Quem respondeu não é verificável |
| SEC-32 | Web DC (1) | Resposta | Imutabilidade da resposta (banco e concorrência) | B | Check-then-act sem lock: SELECT (ocorrencias.ts:1047-1050) depois `UPDATE ... WHERE id = $1` sem `AND respondida_em IS NULL` (1064-1068); GRANT UPDATE de tabela (001:330-333), policy `providencias_atualizacao` só por município (034:259-262); coluna `providencias` fora da lista de UPDATE por coluna (isolamento.test.ts:3962-3986); sem teste de corrida | Alto | | Não | TOCTOU por leitura de código, NÃO reproduzido (PGlite serializa). A trilha guarda as duas respostas (desfecho e respondidaPor), não o texto |
| SEC-33 | Web DC (1) | Resposta | Registrar resposta depois do encerramento da ocorrência | G | Código sem conferência de status (ocorrencias.ts:1038-1079); sem teste; pendente listada após encerrar (api.test.ts:940+) | Baixo | | Sim | Comportamento permitido por omissão; não confirmado como intenção |
| SEC-34 | Portal (4) | Evidência | Evidência de cumprimento anexada ao encaminhamento | D | `evidencias` sem `providencia_id` (003:54-55); `autorizar-envio` exige `registrar_vistoria` (evidencias.ts:210-211), só `agente_campo` (permissoes.ts:80); espec. FLU-02 (linha 196) | Alto | | Sim | Requisito já especificado, não entregue |
| SEC-35 | Portal (4) | Evidência | Anexo não-imagem (PDF, laudo, ART) | E | CHECK `tipo_de_imagem_aceito` (003:20-24) | Médio | SEC-34 | Sim | O banco recusaria PDF |
| SEC-36 | Web DC (1) | Histórico | Histórico completo do encaminhamento | C | Trilha: `providencia`, `resposta_providencia`, `oficio_emitido`, `oficio_enviado`, `encerramento` (ocorrencias.ts:1019, 1071, 1130; oficios.ts:312, 553); `oficio_envios`/`oficio_aberturas` append-only | Médio | | Não | Falta aceite/devolução/reatribuição/prazo; `providencias` é mutável |
| SEC-37 | Web DC (1) | Retorno | Aviso à DC quando o órgão responde | A | 018:315-338 (trigger só na transição); sino-de-avisos.test.ts:619 | Baixo | | Não | Só no sino do painel; sem push/e-mail |
| SEC-38 | Portal (4) | Notificação | Notificação ao órgão de novo encaminhamento/prazo | C | Só o e-mail do ofício (SEC-20), desligado por padrão; nada de prazo | Médio | SEC-20 | Sim | |
| SEC-39 | Web DC (1) | Retorno | Reinspeção/reabertura após a resposta | D | `providencia_pendente: ["encerrada"]`, `encerrada: []` (dominio.ts:187-188); sem rota `reabr*`/`reinsp*`; espec. FLU-04 prevê "reabrir" | Alto | | Sim | A vistoria só se aceita em ocorrência `em_campo` para o agente (sincronizacao.ts:1398,1537) |
| SEC-40 | Web DC (1) | Retorno | Nova providência após a resposta | C | Permitida (`de === para`, ocorrencias.ts:130-149); sem vínculo com a anterior | Médio | | Sim | |
| SEC-41 | Web DC (1) | Encerramento | Encerramento verificando providências obrigatórias | B | Só avisa (ocorrencias.ts:1089-1139; api.test.ts:815-853; README:420-423); espec. RN-05 (linha 244) pede verificação | Médio | | Sim | Divergência entre espec. e implementação, decidida por escrito no README |
| SEC-42 | Todas | Isolamento | Isolamento entre municípios para órgão/providência/ofício/arquivo | A | isolamento.test.ts:313-450, 2486-2880; orgaos-e-oficio.test.ts:219-233, 366-371 | Baixo | | Não | Pilar do produto; FK composta impede vazamento por FK (017:23-33) |
| SEC-43 | Portal (4) | Isolamento | Isolamento entre órgãos dentro do município (RLS/ACL por órgão) | E | RLS só conhece `app.organizacao_atual` (001:35-38); nenhuma policy por órgão | Crítico | D7 | Sim | É o requisito central do portal |
| SEC-44 | Web DC (1) | Autorização | Leituras autenticadas sem permissão nem recorte por órgão | B | ~16 handlers só com `exigirAutenticacao`; `GET /oficios` e `/oficios/:id` (oficios.ts:177-246) sem recorte, inclusive para `agente_campo` (lido no código, não executado; `agente-so-ve-a-equipe.test.ts` não cobre ofício) | Alto | | Não | `/oficios/:id` devolve `orgao_email`, `destinatario_email`, IP de quem abriu e `observacoes` |
| SEC-45 | Web DC (1) | Autorização | Recorte por equipe lido do banco, sem depender do token | A | recorte-do-agente.ts:30-38; agente-so-ve-a-equipe.test.ts:103-256 | Baixo | | Não | Precedente de escopo intra-município; é SQL de aplicação, não RLS |
| SEC-46 | Todas | Sessão | Vigência do token de acesso (conta desativada, papel rebaixado, sessão encerrada) | B | `auth/vigencia.ts` pronto; removido de servidor.ts em b4439ac (17/09/2026); servidor.ts:454-467; vigencia-na-escrita.test.ts:102 `describe.skip`; comentários divergentes em sessoes.ts:20-27 e suspensao.ts:36-42 | Alto | | Não | Janela de 15 min (máx. 60) para ler e escrever com conta/papel já revogados |
| SEC-47 | Web DC (1) | Sessão | Revogar sessões de renovação ao desativar usuário | A | administracao.ts:202-257; servico.ts:192,341,375,500-506 | Baixo | | Não | Fecha login e renovação, não o token vivo (SEC-46) |
| SEC-48 | Portal (4) | Identidade | Papel de secretaria exige mudar CHECKs e tipos | E | `usuarios.papel` (001:89), `trilha_eventos.autor_papel` (001:307), `trilha_administrativa.autor_papel` (025:55-59), `ocorrencia_consultas.usuario_papel` (021:219-221), `trilha_eventos.origem` (001:308); `PAPEIS` (dominio.ts:257) | Médio | D9 | Sim | `Record<Papel,...>` em `permissoes.ts` e `POSTO` obrigam a tratar o novo valor |
| SEC-49 | Portal (4) | Identidade | Mesma pessoa em mais de um município/órgão | F | `usuarios_email_global_idx` (002:31); token com um `org` (tokens.ts:18-36); ADR 0006:102 recusa token multi-município | Alto | D6 | Sim | Afeta concessionárias e órgãos estaduais |
| SEC-50 | Portal (4) | Identidade | MFA para usuários de secretaria | F | TOTP só obrigatório para `administrador` (segundo-fator.ts:108-115); `SEGUNDO_FATOR_ATIVO` padrão `nao` (servidor.ts:404-405) e fly.toml não o liga | Alto | D5 | Sim | |
| SEC-51 | Portal (4) | Identidade | Federação (gov.br) para portal externo | F | Nenhum OIDC/SAML no código (busca por openid/OIDC/SAML/govbr em `apps/**/*.{ts,tsx}`: só falsos positivos de e-mail de exemplo); espec. linha 334 "Avaliar para portal externo" | Médio | D5 | Sim | |
| SEC-52 | Portal (4) | Identidade | Concessionárias e órgãos externos ao município | F | Nenhuma entidade de órgão externo; `orgaos` é por município | Alto | D6 | Sim | |
| SEC-53 | Portal (4) | Banco | Encaixe nos portões do banco (papel de banco novo, funções privilegiadas) | E | isolamento.test.ts:625-626 (teto de 27 `SECURITY DEFINER`), :4005-4011 (nenhum papel além do de aplicação e do dono com privilégio em tabela de negócio), :313-418 (toda policy cita `app_organizacao_atual`) | Médio | D7 | Sim | Inferência pela leitura dos testes, não executada: manter `dc360_app` e acrescentar GUC não dispara o portão de papéis; um papel de banco novo com grants dispara |
| SEC-54 | Web DC (1) | Arquivos | Leitura de evidência por URL curta, só após conferir permissão e equipe | A | evidencias.ts:523-597; s3.ts:62-63; agente-so-ve-a-equipe.test.ts:195-222 | Baixo | | Não | 5 min, credencial ao portador na janela; não testado contra S3/R2 real |
| SEC-55 | Portal (4) | Arquivos | Escopo de arquivo por órgão/encaminhamento | E | Chave `tenant/<org>/ocorrencias/<id>/` (sincronizacao.ts:718); sem segmento de órgão | Alto | D7 | Sim | |
| SEC-56 | Portal (4) | Busca | Busca restrita ao escopo do órgão | E | busca.ts:35-50 (regra por papel, sem órgão) | Médio | SEC-43 | Não | |
| SEC-57 | Web DC (1) | Documentos | Registro de consulta na abertura do documento do ofício | B | `GET /oficios/:id/documento` sem `registrarConsulta` (oficios.ts:345-355); laudo registra (documentos.ts:698); `recurso` fechado em 4 valores (021:232-237) | Alto | | Não | Inconsistência interna: o ofício concentra os mesmos dados do laudo |
| SEC-58 | Portal (4) | Documentos | Dossiê do ofício mínimo por competência do órgão | F | Ofício leva solicitante, endereço, descrição, vulnerabilidade a qualquer órgão (documento.ts:113-129) | Alto | D8 | Sim | Decisão de LGPD: não defino base legal |
| SEC-59 | Portal (4) | Exportação | Exportação escopada por órgão (ou proibida) | E | `exportar_dados` só coordenador/administrador (permissoes.ts:93,109); pacote de saída inclui providências/órgãos/ofícios (saida/pacote.ts:92-94) | Médio | | Não | |
| SEC-60 | Portal (4) | Trilha | Visibilidade da trilha por órgão e eventos de órgão | E | `GET /ocorrencias/:id` devolve a trilha inteira (ocorrencias.ts:516-521) | Alto | D8, D13 | Sim | |
| SEC-61 | Todas | LGPD | Retenção/minimização do texto livre de providência e resposta | F | 043:519-523 ("FICAM... ninguém decidiu ainda") | Alto | | Sim | Com órgão escrevendo, o volume de texto livre com nome de pessoa cresce |
| SEC-62 | Portal (4) | Superfície | Portal autenticado (app/rotas/telas) | E | `apps/` = api, campo, console, web; nenhuma página de órgão em `apps/web/src/paginas` | Alto | D13 | Sim | |
| SEC-63 | Portal (4) | Encaminhamento | Máquina de estados própria do encaminhamento | E | Estado derivado de `respondida_em`/`desfecho` (006:13-29) | Alto | | Sim | A ocorrência tem máquina (dominio.ts:155-189); a providência não |
| SEC-64 | Web DC (1) | Encaminhamento | Prioridade e "fila do responsável" (FLU-01) | D | Sem coluna de prioridade; `responsavel` texto | Médio | SEC-12 | Sim | Espec. FLU-01 (linha 195) |
| SEC-65 | Web DC (1) | Indicadores | Indicadores por órgão (atendimento, tempo de resposta) | C | `GET /orgaos` traz total e abertas (orgaos.ts:96-107); `ROTULO_DESFECHO` lista fechada (schemas.ts:468-479) | Baixo | | Não | Base existe (catálogo + desfecho); não há relatório por órgão confirmado |
| SEC-66 | Portal (4) | Administração | Quem administra usuários do órgão (delegação, teto do órgão) | F | ADR 0006: teto do município; `podeGerirPapel` (permissoes.ts:165-168) | Alto | D9 | Sim | |
| SEC-67 | Web DC (1) | Autorização | `exigirPermissao` antes da escrita de órgão/ofício/providência | A | orgaos.ts:114,151,208,258; oficios.ts:253,346,366; ocorrencias.ts:977,1039; orgaos-e-oficio.test.ts:210-217; api.test.ts:805-813 | Baixo | | Não | Esconder botão não é o controle |
| SEC-68 | Todas | Autorização | Gate automatizado de "toda leitura declara quem pode ler" | D | superficie.test.ts prova só autenticação (linhas 32-51, 190-198) | Médio | | Não | Sem ele, uma rota nova herda o município inteiro |

## Fluxos

| FLUXO | PASSO | ESTADO (EXISTE/PARCIAL/AUSENTE/NOVO V2) | EVIDÊNCIA |
| --- | --- | --- | --- |
| Defesa Civil -> Secretaria | 1. Ocorrência registrada e classificada | EXISTE | ocorrencias.ts:629 (POST /), :722 (triagem); máquina em dominio.ts:155-189 |
| Defesa Civil -> Secretaria | 2. Vistoria concluída (pré-condição do encaminhamento) | EXISTE | `providencia_pendente` só a partir de `vistoria_concluida` (dominio.ts:186); não há encaminhamento antes da vistoria |
| Defesa Civil -> Secretaria | 3. Providência criada (órgão, descrição, responsável, prazo) | EXISTE | ocorrencias.ts:976-1028; schemas.ts:460-466 |
| Defesa Civil -> Secretaria | 4. Seleção da Secretaria/Órgão (catálogo) | EXISTE | BlocoProvidencia (Ocorrencia.tsx:1364-1462); 404 entre municípios (orgaos-e-oficio.test.ts:270-284); sem competência (SEC-06) |
| Defesa Civil -> Secretaria | 5. Ofício numerado emitido | EXISTE | oficios.ts:252-343; orgaos-e-oficio.test.ts:314-364 |
| Defesa Civil -> Secretaria | 6. Envio ao órgão | PARCIAL | E-mail com link de uso único (oficios.ts:365-581), desligado por padrão (config.ts:102); na prática impresso/telefone (README/PAPEIS:221-224) |
| Defesa Civil -> Secretaria | 7. Recebimento pela Secretaria | PARCIAL | Abertura anônima do link, registrada (017:565-653; oficio-regras.ts:73-77); sem usuário, sem caixa da secretaria |
| Defesa Civil -> Secretaria | 8. Aceite nominal | NOVO V2 | Nenhum aceite em nenhuma camada (SEC-24) |
| Defesa Civil -> Secretaria | 9. Responsável designado | PARCIAL | `responsavel` texto livre (schemas.ts:463); não é usuário nem gera fila (SEC-12) |
| Defesa Civil -> Secretaria | 10. Prazo acompanhado | PARCIAL | Prazo fixado na criação (schemas.ts:464); lista/indicador de vencidas (ocorrencias.ts:1414-1474); sem aviso, sem prorrogação, sem escalonamento (SEC-15, 16, 27) |
| Defesa Civil -> Secretaria | 11. Execução pelo órgão | AUSENTE | Nenhum estado "em execução"; estado da providência é derivado de 2 colunas (006:13-29) |
| Defesa Civil -> Secretaria | 12. Evidências do órgão | AUSENTE | SEC-34: `evidencias` sem `providencia_id`; só imagem; permissão só do agente; espec. FLU-02 |
| Secretaria -> Defesa Civil | 13. Resposta do órgão | PARCIAL | Digitada pela DC (ocorrencias.ts:1038-1079; Ocorrencia.tsx:2005-2137); `respondida_por` livre |
| Secretaria -> Defesa Civil | 14. Aviso à Defesa Civil de que respondeu | EXISTE | Trigger 018:315-338; sino-de-avisos.test.ts:619 |
| Secretaria -> Defesa Civil | 15. Devolução pelo órgão, com motivo | NOVO V2 | Só existe `recusada` como desfecho digitado pela DC (schemas.ts:468-472) |
| Secretaria -> Defesa Civil | 16. Pedido de complemento pelo órgão | NOVO V2 | Nenhum (SEC-28) |
| Secretaria -> Defesa Civil | 17. Transferência a outra secretaria | NOVO V2 | Nenhuma; workaround é nova providência sem vínculo (SEC-26) |
| Secretaria -> Defesa Civil | 18. Aceite da Defesa Civil sobre a resposta | AUSENTE | Não há estado "resposta aceita"; a resposta apenas fecha a cobrança da providência (Ocorrencia.tsx:2118-2123) |
| Secretaria -> Defesa Civil | 19. Complemento solicitado pela Defesa Civil | AUSENTE | Nenhum mecanismo (SEC-28) |
| Secretaria -> Defesa Civil | 20. Reinspeção/nova vistoria ligada à providência | AUSENTE | `providencia_pendente: ["encerrada"]` (dominio.ts:187); sem rota (grep `reinsp`/`reabr`) |
| Secretaria -> Defesa Civil | 21. Nova providência | PARCIAL | Permitida, independente da anterior (ocorrencias.ts:130-149; sem `parent`) |
| Secretaria -> Defesa Civil | 22. Encerramento da ocorrência | PARCIAL | Com motivo; não trava por providência aberta, só avisa (ocorrencias.ts:1089-1139; api.test.ts:815-853); trava por interdição ativa (1118-1124) |

## Gaps

1. **P0 SEGURANÇA** Vigência do token de acesso desligada: conta desativada, papel rebaixado ou sessão encerrada continuam lendo e escrevendo até `ACESSO_MINUTOS` (padrão 15, máx. 60). Código removido em b4439ac; teste `describe.skip`; dois comentários afirmam o contrário (sessoes.ts:20-27, suspensao.ts:36-42). Bloqueia qualquer papel escopado de secretaria.
2. **P0 SEGURANÇA** Pelo menos 16 handlers de leitura de dado de negócio exigem só autenticação (ocorrencias 7, evidencias 2, oficios 2, avisos 2, orgaos 1, busca 1, documentos 1; contagem por grep). `GET /oficios` e `GET /oficios/:id` entregam número, órgão, e-mail do órgão, e-mail de destino, IP de quem abriu e `observacoes` a qualquer papel, inclusive `agente_campo` (lido no código, não executado). Severidade atual moderada (dado institucional); crítica para a V2.
3. **P0 INTEGRIDADE** A resposta da providência não tem trava no banco: `UPDATE ... WHERE id = $1` sem `AND respondida_em IS NULL`, sem lock, tabela com UPDATE amplo e sem restrição de coluna; duas respostas simultâneas podem sobrescrever a primeira (a trilha guarda desfecho e respondidaPor de ambas, não o texto). Não reproduzido.
4. **P0 LGPD** Abrir o documento do ofício (que concentra nome do solicitante, endereço e vulnerabilidade) não gera registro de consulta, ao contrário do laudo. O link público registra IP e user-agent, sem identidade.
5. **A DEFINIR** Dossiê do ofício idêntico para qualquer órgão: sem minimização por competência (Trânsito recebe vulnerabilidade da família). Decisão de LGPD.
6. **A DEFINIR** Retenção de texto livre de providência e resposta não decidida (043:519-523); no portal o volume cresce.
7. **P1 PRODUTO** A resposta do órgão é digitada pela Defesa Civil; o órgão não tem canal, conta nem identidade. O ofício pede resposta "no protocolo" sem dar canal.
8. **P1 PRODUTO** Não existem aceite, devolução, transferência, escalonamento nem pedido de complemento para providência.
9. **P1 PRODUTO** Evidência de cumprimento (FLU-02) não existe; `evidencias` é só imagem, da ocorrência, enviada só por `agente_campo`.
10. **P1 PRODUTO** Reinspeção e reabertura não têm aresta na máquina de estados; `encerrada` é terminal; espec. FLU-04 prevê reabrir.
11. **P1 PRODUTO** Providência só pode nascer a partir de `vistoria_concluida`.
12. **P1 PRODUTO** Providência errada não pode ser cancelada ou corrigida; só responder `recusada` ou abrir outra.
13. **P1 OPERAÇÃO** Providência vencida não gera aviso, push nem e-mail; o sino só cobre o prazo da ocorrência e só materializa quando alguém o abre (avisos.ts:244-248).
14. **P1 OPERAÇÃO** Prazo de providência fixo em 72 h no formulário, sem padrão por tipo/severidade e sem prorrogação.
15. **P1 OPERAÇÃO** Envio do ofício por e-mail desligado no deploy padrão; provedor real NÃO CONFIRMADO. Link de uso único consumido por GET pode ser queimado por scanner/prévia de e-mail.
16. **P1 PRODUTO** `responsavel` e `respondida_por` são texto livre; não há fila do responsável (FLU-01) nem autoria verificável.
17. **P1 OPERAÇÃO** Trigger `providencia_amarra_no_catalogo` cria órgão a partir de texto livre; na V2 criaria órgão sem usuário, e-mail nem competência.
18. **A DEFINIR** Desativar órgão com providências abertas é permitido sem destino para os itens.
19. **A DEFINIR** Encerramento não verifica providências obrigatórias (RN-05 da espec.); o README documenta a escolha oposta.
20. **P1 PRODUTO** Não existe gate automatizado de "toda leitura declara quem pode ler" (`superficie.test.ts` só prova autenticação).
21. **A DEFINIR** Modelo de identidade: e-mail único global (`usuarios_email_global_idx`), token com um só `org`, 4 CHECKs de papel, `origem` com 2 valores, `recurso` de consulta com 4 valores, teto de 27 funções privilegiadas: todos dependem de D1, D5, D6, D7 e D9.
22. **A DEFINIR** MFA e federação de identidade para usuários de secretaria.
23. **P2 EVOLUÇÃO** Indicadores por órgão (taxa de atendimento, tempo de resposta) além da contagem em `GET /orgaos`.
24. **P1 CONTINUIDADE** Trilha: tentativas de envio de ofício que falharam ficam só em `oficio_envios`, não na trilha da ocorrência (por desenho, oficios.ts:542-551); quem audita só pela trilha da ocorrência não as vê.

## Decisões humanas

**D1. Competência das secretarias: quem pode receber o quê.**
- Pergunta: cada secretaria/órgão recebe encaminhamento por quais critérios: tipo de ocorrência COBRADE, tipo de providência, território, severidade, ou nenhum (qualquer um recebe qualquer coisa, como hoje)?
- Por que importa: define o "só acessa o que for da sua competência" do portal e o que aparece no seletor de destino.
- O que bloqueia: modelo de competência (SEC-06), filtro do seletor de órgão, regra de 404 por competência, dossiê mínimo (D8), prazos por tipo.
- Alternativas: (a) sem competência, apenas vínculo direto (o encaminhamento nomeia órgão e só ele vê); (b) competência por tipo COBRADE por órgão; (c) por tipo de providência (exige definir lista fechada, não inventar); (d) por território/distrito; (e) combinação.
- Riscos: (a) órgão errado recebe dado sensível sem barreira sistêmica; (b) COBRADE cobre o tipo de ocorrência, não o que se pede ao órgão; (c) taxonomia inventada sem o domínio gera retrabalho e catálogo divergente entre municípios; (d) exige georreferenciamento por órgão e manutenção; (e) complexidade e configuração por município.

**D2. Quem pode encaminhar a outra secretaria, e a transferência entre secretarias.**
- Pergunta: só a Defesa Civil encaminha? A secretaria que recebe pode transferir a outra? Com aceite da origem? Com dossiê completo ou mínimo?
- Por que importa: hoje só a DC encaminha (`encaminhar_providencia`: coordenador/administrador, permissoes.ts:81-111). Transferência cria nova fronteira de acesso a dado de família.
- O que bloqueia: SEC-26, estados do encaminhamento, regra de visibilidade de dossiê entre órgãos.
- Alternativas: (a) só DC encaminha, órgão devolve com motivo; (b) órgão sugere transferência, DC aprova; (c) transferência direta entre órgãos com registro.
- Riscos: (a) gargalo na DC em dia de chuva; (b) atraso e dupla tarefa; (c) dado sensível se espalha sem decisão da DC, isolamento entre órgãos enfraquece.

**D3. Escalonamento.**
- Pergunta: o que acontece quando o órgão não aceita, não responde ou estoura o prazo: para quem sobe, em quanto tempo, por qual canal?
- Por que importa: a ausência de resposta é o risco que o README cita ("a secretaria às vezes nunca responde").
- O que bloqueia: SEC-15, SEC-27, regra de encerramento (D11).
- Alternativas: (a) só alerta à DC; (b) escalonamento para gestor do órgão; (c) escalonamento para o prefeito/controle; (d) sem escalonamento, só indicador.
- Riscos: (a) depende de alguém abrir o painel (o sino hoje é sob demanda); (b) exige gestor de órgão cadastrado; (c) política municipal, pode gerar conflito institucional; (d) mantém o "silêncio" que o produto quer evitar.

**D4. Prazos por tipo.**
- Pergunta: há prazo padrão por tipo de ocorrência/providência/severidade, quem o define, o município pode alterá-lo, e há prorrogação com motivo?
- Por que importa: hoje 72 h fixas no formulário e `PRAZO_PADRAO_HORAS` só para a ocorrência.
- O que bloqueia: SEC-13, SEC-16, SLA e indicadores por órgão.
- Alternativas: (a) manter prazo livre na criação; (b) padrão por tipo/severidade configurável por município; (c) prazo negociado por órgão; (d) prorrogação só por quem encaminhou, com motivo.
- Riscos: (a) inconsistência entre coordenadores; (b) valor "padrão" tratado como política sem decisão da prefeitura; (c) complexidade; (d) disputa sobre quem tem a palavra final.

**D5. Identidade e MFA de usuários de secretaria.**
- Pergunta: como o usuário de secretaria prova quem é: senha própria, MFA (TOTP, e-mail), federação (gov.br, conta institucional)? Obrigatório para todos ou só para quem aceita/responde?
- Por que importa: o portal expõe dado de família a pessoas fora da DC; hoje só o administrador tem TOTP obrigatório (segundo-fator.ts:108-115) e `SEGUNDO_FATOR_ATIVO` é `nao` por padrão.
- O que bloqueia: SEC-50, SEC-51, cadastro de usuários de órgão, recuperação de conta (hoje `RECUPERACAO_ATIVA=nao`, fly.toml:67).
- Alternativas: (a) senha + TOTP obrigatório; (b) senha + TOTP opcional; (c) federação gov.br; (d) link de uso único sem conta (como hoje) para órgão pequeno.
- Riscos: (a) atrito em secretarias pequenas, suporte a perda de dispositivo; (b) contas sem segundo fator com dado sensível; (c) dependência externa e cadastro de quem pode usar; (d) sem autoria nominal.

**D6. Concessionárias e órgãos externos ao município (e quem atende vários municípios).**
- Pergunta: concessionária (água, energia), órgão estadual ou bombeiros com atuação em vários municípios entram como usuários do portal? Um usuário pode pertencer a mais de um município?
- Por que importa: o e-mail é único global e o token tem um só município (002:31; tokens.ts:18-36); ADR 0006:102 recusa token multi-município.
- O que bloqueia: SEC-49, SEC-52, modelo de tenant do órgão externo.
- Alternativas: (a) conta por município (e-mails distintos) para a mesma pessoa; (b) contexto selecionável com token por contexto e lista de vínculos; (c) órgão externo como organização própria com troca controlada de dados entre tenants; (d) fora do portal: só link de uso único.
- Riscos: (a) pessoa com N logins, rotação de equipe difícil; (b) contraria a ADR 0006 e exige nova ADR, risco de token atravessar município; (c) contradiz o desenho de isolamento da ADR 0001/0008; (d) sem aceite nominal nem evidência.

**D7. Modelo de tenant: órgão aninhado versus entidade do município.**
- Pergunta: o órgão é um sub-tenant (com `orgao_id` em tudo e RLS própria) ou uma entidade do município com escopo aplicado só nas tabelas de encaminhamento?
- Por que importa: define o custo de isolamento e o que o CA-06 passa a provar.
- O que bloqueia: SEC-43, SEC-53, SEC-55, SEC-56.
- Alternativas: (a) sub-tenant completo; (b) híbrido: RLS por órgão só em encaminhamento/anexos/eventos; (c) ACL por encaminhamento (tabela de concessões) sem RLS por órgão; (d) visões `security_invoker` por órgão.
- Riscos: (a) migração de todas as tabelas e FKs, portões refeitos; (b) GUC ausente vira leitura ampla se a policy for `OR ... IS NULL` (fail-open); (c) o filtro fica na aplicação, como o `recorteDoAgente`, e cada rota nova pode esquecer; (d) visão mal configurada vaza (o projeto já viu isso na ADR 0008).
- Decisão técnica associada: o vínculo do usuário ao órgão vem do JWT (mais rápido, stale por até `ACESSO_MINUTOS`) ou do banco a cada requisição (precedente da equipe do agente, custo de uma consulta por leitura). Com a vigência desligada (SEC-46), o JWT já é stale para papel e conta.

**D8. Quanto do dossiê e da trilha cada órgão vê (LGPD).**
- Pergunta: nome do solicitante, endereço exato, descrição de vulnerabilidade, fotos e eventos da trilha (inclusive respostas de outros órgãos e observações internas da coordenação) aparecem para todo órgão ou variam por competência? Há finalidade declarada por acesso?
- Por que importa: hoje o ofício leva tudo a qualquer órgão (documento.ts:113-129) e a base legal e a minimização não são decisão minha.
- O que bloqueia: SEC-58, SEC-57, SEC-61, desenho do documento do portal.
- Alternativas: (a) dossiê completo, com registro de consulta; (b) mínimo por competência; (c) mínimo por padrão e ampliação com justificativa (como a exportação completa exige justificativa, 021).
- Riscos: (a) exposição desnecessária; (b) órgão sem dado suficiente para agir; (c) atrito e justificativas vazias.

**D9. Papel, vínculo e administração de usuários do órgão.**
- Pergunta: secretaria vira um `papel` a mais (com postos) ou um eixo separado (papel na DC x papel no órgão)? O usuário pertence a um órgão ou a vários, e a uma unidade? O gestor do órgão administra a própria equipe?
- Por que importa: `papel` está em 4 CHECKs, `POSTO`, `podeGerirPapel`, regra do "último administrador" (ADR 0006), `Identidade`.
- O que bloqueia: SEC-04, SEC-48, SEC-66.
- Alternativas: (a) novo papel `orgao_*` com posto próprio; (b) eixo ortogonal; (c) o administrador do município cria e gerencia todos.
- Riscos: (a) crescimento da tabela de ações por papel; (b) duas fontes de verdade na autorização; (c) sobrecarga do administrador e sem teto do órgão. Vínculo a vários órgãos amplia o escopo de cada conta (um token comprometido alcança mais) e complica o "usuário removido da secretaria".

**D10. Encaminhar antes da vistoria; reinspeção e reabertura.**
- Pergunta: a DC pode encaminhar em triagem/em_campo? A resposta pode reabrir a ocorrência ou exigir reinspeção? Quem decide?
- Por que importa: hoje só `vistoria_concluida -> providencia_pendente` e `providencia_pendente -> encerrada` (dominio.ts:185-187), sem reabertura (FLU-04 da espec.).
- O que bloqueia: SEC-10, SEC-39, máquina de estados do encaminhamento (SEC-63).
- Alternativas: (a) manter; (b) permitir encaminhar em triagem para urgências; (c) aresta `providencia_pendente -> em_campo/triagem` com nova vistoria; (d) reabertura de encerrada com motivo.
- Riscos: (a) o sistema não acompanha o que a rua faz; (b) a ocorrência sai do fluxo linear e quebra indicadores; (c) toca a máquina central e o app de campo; (d) contradiz "encerrada é terminal" e a trilha.

**D11. Encerramento com providência em aberto e cancelamento de providência.**
- Pergunta: encerrar ocorrência com providência obrigatória sem resposta é proibido, avisado ou exige justificativa? Como se cancela uma providência errada?
- Por que importa: espec. RN-05 versus README (avisa, não trava); "registro se encerra com motivo".
- O que bloqueia: SEC-11, SEC-41.
- Alternativas: (a) manter o aviso; (b) bloquear para providências marcadas obrigatórias; (c) exigir justificativa por providência aberta; cancelamento com motivo e evento append-only.
- Riscos: (a) fila silenciosa de "a prefeitura não fez nada"; (b) fila do coordenador cresce (risco que o README cita); (c) justificativa vazia.

**D12. Desativação de órgão e de usuário com itens em andamento.**
- Pergunta: desativar um órgão ou desvincular um usuário transfere, bloqueia ou apenas sinaliza os encaminhamentos abertos?
- Por que importa: hoje desativar órgão não olha abertas (SEC-08) e não há vínculo.
- O que bloqueia: SEC-08, cenários 8 e 9.
- Alternativas: (a) bloquear a desativação até resolver; (b) transferir em lote para outro órgão; (c) manter aberto e alertar a DC.
- Riscos: (a) órgão extinto não sai do catálogo; (b) dado de família vai para destino que não pediu; (c) itens órfãos.

**D13. Forma do portal e convivência com o link de uso único.**
- Pergunta: o portal é um app separado (origem, CORS, CSP e `aud` de JWT próprios, como o console, ADR 0008) ou telas do `apps/web` com papel restrito? O link de uso único continua existindo para órgão sem conta, ou é substituído?
- Por que importa: define superfície de ataque, deploy e quanto do código do painel (inclusive o modo local em PGlite, `paridade-dos-modos.test.ts`) o portal herda. O link atual é o único canal que funciona sem conta.
- O que bloqueia: SEC-62, SEC-60, desenho de sessão e de CSP do portal.
- Alternativas: (a) app separado; (b) rotas no painel com papel restrito; (c) portal para órgãos com conta e link de uso único mantido para o resto; (d) só portal, link desativado.
- Riscos: (a) mais uma superfície a manter, portões e auditoria duplicados; (b) um bug de autorização no painel expõe o município inteiro ao usuário de fora; (c) dois canais com garantias diferentes (o link não tem autoria nominal); (d) órgão sem capacidade de operar conta fica sem canal.

## Riscos arquiteturais

1. **Isolamento por órgão depende de mecanismo novo.** O CA-06 hoje prova só município; uma policy com `app_orgao_atual() IS NULL OR ...` é fail-open. Alternativa por papel de banco reprova os portões atuais (isolamento.test.ts:4005).
2. **Filtro de aplicação é o padrão intra-município hoje** (`recorteDoAgente`, SQL colado em cada leitura). Estendê-lo a órgão herda o risco de "cada rota nova pode esquecer" e de contagens que entregam existência.
3. **Autorização lida do token.** `papel` no JWT sem revalidação (SEC-46); para órgão, o vínculo precisa ser lido do banco por requisição (precedente: equipe).
4. **Identidade global por e-mail e token de município único** contradizem concessionárias multi-município (SEC-49).
5. **`providencias` mutável no banco**: UPDATE de tabela inteira; hoje as regras de imutabilidade moram na rota (check-then-act). Um portal com mais escritores multiplica o risco de corrida.
6. **Modelo de estado frágil**: estado do encaminhamento derivado de colunas, status único da ocorrência; adicionar aceite/devolução/complemento sem uma máquina própria vira regra espalhada.
7. **Trilha com enumerações fechadas** (`autor_papel` 4 valores, `origem` 2, `recurso` de consulta 4): cada nova ator/ação exige migração em tabelas append-only, que não se corrigem depois.
8. **Portões do banco**: teto de 27 funções privilegiadas e regras de papel de banco limitam atalhos pré-tenant para login/convite de usuário de órgão.
9. **Dois modos no painel** (local em PGlite e API; `paridade-dos-modos.test.ts`): o portal, se viver no `apps/web`, herda a manutenção em paridade. Não investigado em profundidade.
10. **Link de uso único por GET**: adequado para um leitor humano, frágil a robôs; se o portal mantiver o canal para órgão sem conta, o risco de "queimar" o link continua.

## Dívidas técnicas

1. `auth/vigencia.ts` pronto e fora do caminho; teste `describe.skip`; comentários desatualizados em `sessoes.ts` e `suspensao.ts`.
2. Nenhum gate de autorização de leitura; `superficie.test.ts` cobre só autenticação.
3. `GET /oficios` e `GET /oficios/:id` sem permissão/recorte; `oficios` sem teste para agente.
4. Sem teste de corrida nem trava de banco para a resposta da providência; sem teste de 404 entre municípios dedicado à rota de resposta.
5. `providencias` sem UPDATE por coluna (padrão já adotado em `oficio_envios`, `devolucoes_de_tarefa`, `saidas_a_campo`).
6. Sem `registrarConsulta` no documento do ofício; lista fechada de `recurso` sem ofício/providência.
7. `responsavel` e `respondida_por` em texto livre; sem FK para pessoa.
8. `orgaos` com UPDATE amplo; e-mail do órgão é a lista de domínios do envio (editável por `gerenciar_equipes`, com trilha administrativa).
9. Trigger de criação automática de órgão a partir de texto.
10. Envio de ofício por e-mail nunca exercitado com provedor real; `EMAIL_ATIVO` e `SEGUNDO_FATOR_ATIVO` não definidos no `fly.toml`.
11. Documentação de PAPEIS_E_RESPONSABILIDADES.md e espec. preveem "Órgão parceiro" e "Unit"; o código não os tem, e não há ADR de portal de secretarias.

## Não confirmado / limites desta frente

- Não executei `GET /oficios` como `agente_campo`; a afirmação vem de leitura de código (oficios.ts:177-246) e da ausência de recorte/teste.
- Não reproduzi a corrida na resposta da providência (PGlite serializa); é análise de código.
- Não vi o ambiente de produção (segredos do Fly): `EMAIL_ATIVO`, `SEGUNDO_FATOR_ATIVO` e provedor de e-mail reais são NÃO CONFIRMADOS; só o padrão do código e o `fly.toml` versionado.
- Não testei URLs pré-assinadas contra S3/R2 real.
- Só rodei um arquivo de teste (orgaos-e-oficio, 24/24). Os demais testes citados foram lidos, não executados por mim.
- Não li `Ocorrencia.tsx` inteiro (2.100+ linhas); li os blocos de providência, resposta e ofícios.
- Contagem de handlers "só autenticação" (16) vem de grep por arquivo, não de auditoria linha a linha; um handler de `avisos.ts` (linha 531) é escrita da própria pessoa e está incluído na contagem.
