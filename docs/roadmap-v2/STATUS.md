# STATUS DO ROADMAP V2 (LEIA ESTE ARQUIVO PRIMEIRO)

Este é o ÚNICO lugar com o estado vivo do trabalho. Se o chat perdeu o contexto, comece aqui: a seção 1 diz onde estamos, a seção 2 diz como retomar, e as demais mostram o que está concluído e o que falta.

**Atualizado em:** 2026-10-06

## 1. ONDE ESTAMOS (ponto de partida e ponto de parada)

- **Fase do trabalho:** IMPLEMENTAÇÃO INICIADA em 2026-10-05, depois do "prossiga" de Rafael sobre a revisão de escopo (36 fases, 618 etapas, 36 gates, 95 checkpoints). Está em V2-F00-E10 (E01 a E09 implementadas, com validação humana pendente; ver abaixo). Nada commitado.
- **Última ação concluída (2026-10-06, depois da E09):** V2-F00-E10: recuperação de senha por e-mail de ponta a ponta com o notificador de teste; a produção continua desligada (o CP-19 trava só o envio real). API (sem migração): `POST /auth/recuperar` passou a enviar DEPOIS da resposta (aguardado dentro do pedido, o relógio contava quem tem conta, e o provedor fora do ar derrubava o pedido com 500 só para quem tem conta; a falha agora vai para o log sem o link nem o e-mail, e o encerramento do servidor espera os envios em voo), conta pedidos por e-mail (`RECUPERACAO_POR_EMAIL_HORA`, padrão 5 por hora, por processo, igual para e-mail inexistente), `GET /auth/recuperacao` nova (sem token, só `{ ativa }`) e três mensagens com acento. Painel: `RecuperarSenha.tsx` reescrita com todos os estados (verificando, desligada com os quatro passos que apontam o botão Redefinir senha da E09, formulário, enviando, enviado, erro de campo, limite de pedidos, sem rede, falha do servidor; senha nova com senha curta e senhas diferentes no campo certo, salvando, sucesso; link que não vale mais com UMA frase para vencido, usado, trocado e inventado; endereço sem link), o token lido para o estado e apagado da barra de endereço (`history.replaceState`), pedido SEM SESSÃO em `http.ts` (achado real da sonda: o link de redefinição aberto num navegador onde outra pessoa está logada renovava a sessão dela e a derrubava no 401 do link vencido), `vercel.json` com `Referrer-Policy: no-referrer` e `X-Robots-Tag: noindex` SÓ em `/recuperar-senha` e `/redefinir-senha` (premissa na seção 9: a chave do Google Maps é restrita por referenciador) e alvo de toque de 44 px no rodapé da entrada. Sonda antes do conserto: 8 dos 15 casos novos da API e 3 de 3 do painel reprovam; depois, 15 de 15 e 3 de 3. API 1220 testes com a mesma 1 falha (laudo, E12) e 13 pulados (25 novos); isolamento 330 (igual, nada de banco mudou); superfície 9 de 9; shared 162 com a mesma 1 falha; painel 621 testes com as mesmas 6 falhas (E13 e E21; 40 novos); console 259; `typecheck` verde; `test:scripts` 198 igual; `conferir:numeros` 13 (README corrigido de 175 para 208 verificações de e2e); `baseline.mjs` confere nos quatro passos tocados (shared, banco, API e painel) (esperado por etapa: API +25, web +40). Seção 27 do e2e provada em cópia aparada (33 de 33, zero erro de console) e a seção 14 mantida (7 de 7); 96 capturas (24 estados) em 1280 e 390, claro e escuro, com normal, vazio, erro e carregando; contraste AA medido (pior caso 4,75:1) e foco visível. Evidência em `docs/evidencias-v2/G00/V2-F00-E10/`. Antes dela, V2-F00-E09: telas de sessões e de redefinição de senha no painel. API (sem migração): `GET /auth/sessoes` (as sessões vivas da própria conta, uma linha por família, com entrou em, expira em, aparelho em uma frase e a marca da atual) e `GET /usuarios/:id/sessoes` (`gerenciar_usuarios`, posto, 404 de outro município; só quantidade e datas), nenhuma com IP nem user-agent; `auth/aparelho.ts` resume o user-agent; três mensagens sem acento de `/auth/trocar-senha` e `/auth/encerrar-sessoes` corrigidas. Painel: em Usuários, `BotaoRedefinirSenha` e `BotaoEncerrarSessoes` por linha (só quando `motivoParaNaoAdministrar` é nulo, nunca na própria conta, só no modo com servidor, cada um atrás de `ConfirmarAcao` destrutiva com o nome), `SenhaTemporaria` exportado (senha uma vez, fonte tabular, copiar, frase de que não volta, janela que não fecha por clique fora) e Toast ao encerrar; em Minha conta, `MinhasOutrasSessoes` (lista com "Esta sessão", carregando, erro, só-esta, botão com confirmação); o modo local explica em vez de oferecer. As capturas mostraram a coluna Ação quebrando em três fileiras e a tabela passando da largura: ficou em grade 2x2 e `tabela--justa` (902 de 902 em 1280). Os 8 casos de `seguranca-da-conta.test.ts` (V-WEB-04 a V-WEB-11) passaram de vermelhos a verdes sem mudar uma linha do teste (T42: descrevia defeito real); painel de 14 falhas para 6 (as da E13 e da E21), 581 testes (18 novos). API 1195 testes com a mesma 1 falha (laudo, E12) e 13 pulados (27 novos; 11 reprovam com as rotas desligadas); isolamento 330 (igual); superfície 9 de 9; shared 162 com a mesma 1 falha; console 259; `typecheck` verde; `test:scripts` 198 igual; `conferir:numeros` 13 (README corrigido de 126 para 175 verificações de e2e); `baseline.mjs` confere os quatro passos tocados (esperado por etapa: API +27, web +18 com 8 falhas a menos). Seção 26 do e2e provada em cópia aparada (50 de 50, zero erro de console), 68 capturas em 1280 e 390, claro e escuro, com normal, vazio, carregando, erro e modo de demonstração. Evidência em `docs/evidencias-v2/G00/V2-F00-E09/`. Antes dela, V2-F00-E08: ação nova `consultar_oficio` no shared (operador, coordenador e administrador; nunca o agente de campo); `GET /oficios` e `GET /oficios/:id` passam por `autorizar` antes de abrir transação e antes de validar o id, e o agente recebe 403 `sem_permissao` igual para ofício que existe, que não existe e que é de outro município; `GET /avisos` aplica o recorte da equipe (`eRecorteDoAgente`) à lista E à contagem de não lidos (a contagem passou a juntar `ocorrencias`), e `POST /avisos/lidos` só marca o que o agente vê (antes `marcados: 1` confirmava aviso de outra equipe); a escrita dentro do GET segue (idempotente) e ficou registrada em `apps/api/PENDENCIAS.md`; o painel só chama `listarOficios` e só desenha o cartão de ofícios para quem tem a ação (o 403 derrubaria o dossiê do agente), e o modo local recusa igual à API. Sonda antes do conserto: 9 de 14 casos novos reprovam; sonda HTTP com o token do agente, antes: 200 na lista e na ficha do ofício e 1 de 3 avisos de outra equipe, depois: 403, 403 e 0 de 2. Depois: 14 de 14. API 1168 testes com a mesma 1 falha (laudo, E12) e 13 pulados; isolamento 330 (igual, nada de banco mudou); superfície 9 de 9; shared 162 com a mesma 1 falha; pacote campo 187; web 563 com as mesmas 14 falhas; console 259; `typecheck` verde; `baseline.mjs` confere os cinco passos tocados (esperado por etapa: API +14, shared +3, web +4); `conferir:numeros` 13 (README corrigido de 112 para 126 verificações de e2e); seção 25 do e2e provada em cópia aparada (14 de 14, zero erro de console, 8 capturas do dossiê do agente e do operador em 1280 e 390, claro e escuro). Sem migração. Não rodei o jest do app de campo: o contrato do app não mudou (mesmo formato de `GET /avisos`). Evidência em `docs/evidencias-v2/G00/V2-F00-E08/`. Antes dela, V2-F00-E07: migração `047_familia_da_sessao.sql` (`sessoes.familia_id`, backfill `familia_id = id`, índice parcial das famílias vivas, `abrir_sessao` recriada com a família opcional e a assinatura antiga removida, teto de 27 definers intacto); `auth/vigencia.ts` só aceita a sessão rotacionada se a família ainda tem sessão de pé (o token de acesso anterior à renovação cai quando a cadeia é encerrada por quem administra, pela pessoa, por sair, por reuso ou por troca de senha), e papel do banco diferente do token virou 401 `nao_autenticado` (renova e repete; a E05 tinha posto `sessao_encerrada`), conferido depois de conta desativada, sessão encerrada e provisória vencida; `renovar` herda a família; `trocarSenha` recusa por conta própria a provisória vencida; a troca de papel NÃO revoga sessões (decisão registrada). Painel: `aoRenovar` faz a sessão da tela acompanhar o papel que a renovação trouxe (o menu Usuários some sem entrar de novo). Sonda antes do conserto: 11 dos 20 casos novos da API reprovam (7 só tirando a regra da família); depois 20 de 20. API 1154 testes com a mesma 1 falha (laudo, E12) e 13 pulados; isolamento 330 (12 novos, 3 pulados por ambiente); superfície 9 de 9; web 559 com as mesmas 14 falhas; `e2e-api` igual ao baseline (cai na seção 13, E18) e a seção 24 nova provada em cópia aparada (9 de 9, zero erro de console, 8 capturas em 1280 e 390, claro e escuro). `migrar` mais `--conferir` ensaiados em Postgres 18.3 real (cluster descartável): do zero e sobre banco existente com sessões antigas, ambos "Esquema em dia". `baseline.mjs` ganhou o esperado por etapa também para o banco, e os cinco passos tocados conferem. O 403 `troca_de_senha_obrigatoria` na fila do campo ficou FORA, anotado. SEM foto de aparelho (o app não mudou). Evidência em `docs/evidencias-v2/G00/V2-F00-E07/`. Antes dela, V2-F00-E06: o transporte do campo (`packages/campo/src/transporte.ts`) lê os três códigos de acesso do catálogo pelo CÓDIGO: 401 `nao_autenticado` (e 401 sem código) pede UM token novo (`obterToken({ renovarJa: true })`, com a trava e o piso de `token.ts`) e repete o pedido; se o token não muda ou o pedido falha de novo, vira `sessao_encerrada`; 401 `sessao_encerrada` e 403 `conta_desativada` (e a falta de token) são `FalhaDeSessao`, nova, distinta de `FalhaPermanente` e `FalhaTemporaria`; 403 `sem_permissao` segue bloqueando. A fila para o dreno, mantém o item `pendente` (sem contar tentativa, sem bloquear, progresso das fotos preservado) e devolve `paradaPor`; `ResumoFila.pausadaPor` alimenta a faixa do topo, um aviso no alto da tela de envio e o cartão "Guardada" (sem "Descartar"); só a sessão encerrada traz o botão "Entrar de novo". O app lê o 403 `conta_desativada` como motivo próprio (`conta-desativada`). Sonda: com o transporte antigo de volta 16 de 86 reprovam, com a fila antiga 13 de 86, com a tela antiga 7 de 9. Pacote 187 testes (28 novos), jest do app 1836 com as MESMAS 20 falhas (E14 a E16), API 1134 (15 na integração com a API real, 4 novos, 1 reescrito), isolamento 318, `test:campo` com os mesmos 2 erros do `.expo` (E21), `test:scripts` 198 com as mesmas 3 falhas, `conferir:numeros` 13, e `baseline.mjs --so=teste-campo-pacote,teste-campo-app` confere (esperado por etapa também para o pacote e o app). SEM captura de tela e SEM E2E em emulador: o Expo não renderiza neste ambiente; a prova da tela é por teste de componente e a foto do aparelho é pendência humana. Evidência em `docs/evidencias-v2/G00/V2-F00-E06/`. Antes dela, V2-F00-E05: catálogo `packages/shared/src/codigos-de-erro.ts` (seis códigos de acesso, com status, ação do cliente e mensagem); a API passou a emitir `sessao_encerrada` (401, no lugar de `sessao`) e `conta_desativada` (403, nova, também em `/auth/renovar`), com a conta desativada conferida antes da sessão encerrada; `/auth/entrar` não mudou (recusa genérica, provada); o painel reconhece as três respostas e a tela de entrada diz a frase de cada uma (expirou, encerrada, desativada). Sonda: 8 de 16 casos novos vermelhos com o código velho. API 1129 testes, 1 falha (laudo do pacote, E12), 13 pulados; shared 159 (1 falha pré-existente); web 557 (as mesmas 14 falhas da E13); isolamento 318 verde; superfície 9 de 9; `e2e-api` igual ao baseline (cai na seção 13, E18) e a seção 23 nova provada em cópia aparada (16 de 16, zero erro de console); 12 capturas das três frases (1280 e 390, claro e escuro). `baseline.mjs` ganhou o mesmo mecanismo de esperado por etapa para shared e web e os quatro passos conferem. Evidência em `docs/evidencias-v2/G00/V2-F00-E05/`. Antes dela, V2-F00-E04: `auth/vigencia.ts` religada na escrita em `servidor.ts` (conta ativa, papel do token, sessão viva e senha provisória pelo banco, na mesma ida da suspensão), `describe.skip` e marca T42 removidos, 4 casos de borda novos. Sonda antes do conserto: 6 de 13 reprovam no arquivo da vigência (conta desativada, papel rebaixado e sessão encerrada ainda escreviam com 200); depois: 13 de 13. API: 1113 testes, 1 falha (laudo do pacote, E12), 13 pulados (`banco-tls`); a falha de senha provisória (`senha-provisoria.test.ts:183`, que era da E07) ficou verde sozinha. Isolamento 318 (315 e 3 pulados) e `superficie.test.ts` verdes; `e2e-api` igual ao baseline (cai na seção 13, E18). `baseline.mjs` soma por etapa o esperado da API e `--so=teste-api` confere. Evidência em `docs/evidencias-v2/G00/V2-F00-E04/`. Antes dela: V2-F00-E03 feita só em documentação, sem tocar em código: cada vermelho do baseline da E01 foi conferido nas saídas arquivadas e no código citado e entrou numa tabela com causa, classe (A defeito real, B teste desatualizado, C ambiente, D número em documento, E dependência, F instável), regra, etapa e dono. A soma fecha contra o baseline (shared 1, painel 14 = 8 + 5 + 1, API 2 mais a suíte `banco-tls` com 13, campo 20 = 2 + 4 + 14, `test:scripts` 3, `conferir:numeros` 13, e2e 3, mais typecheck do campo e 4 passos de dependência). A regra de BZ-N:N.3 entrou na política como premissa (seção 9). Sete divergências (D-1 a D-7) foram registradas, a maior: os números de `npm audit` da E19 estão velhos (raiz tem `fastify` alto em execução; campo tem 54, não 4). Vermelho intermitente da E02 (`resolver-link.test.ts`) classificado como instável (seção 11). Evidência em `docs/evidencias-v2/G00/V2-F00-E03/`; registro em `docs/DECISOES-DE-TESTE-DA-FASE-00.md`; regra em `dc360/docs/POLITICA-DE-TESTE-VERMELHO.md`. Antes dela, a E02: política, portão de skip (17 testes, dentro de `npm run test:scripts`, esperado 198) e marca T42 na vigência (E04, prazo 2026-11-05). E01 e E02 seguem com validação humana pendente.
- **PRÓXIMA AÇÃO:** V2-F00-E11 (bug `/pacote.zip` e prova do pacote de saída contra a API real, P0, depende só da E01; a E15 também pode andar em paralelo). A E08 não tem migração e vai com a API e o painel; pendência de Rafael que não bloqueia: ver a sonda do agente antes e depois e as capturas (`docs/evidencias-v2/G00/V2-F00-E08/RESUMO.md`). A E04, a E05, a E06 e a E07 vão juntas para produção, com a migração 047 aplicada ANTES do código, e a prova em aparelho da E06 continua pendente. Pendências de Rafael que não bloqueiam a E11: fazer o fluxo da E10 com o notificador de arquivo (`dc360/docs/LIGAR-O-EMAIL.md`, seção "O que já está pronto e provado sem provedor"), ler as frases das capturas e conferir que a produção continua desligada (`docs/evidencias-v2/G00/V2-F00-E10/RESUMO.md` e `capturas/`), decidir o CP-19 para o envio real, e conferir o `Referrer-Policy` na URL da Vercel no primeiro deploy; fazer o fluxo da E09 no painel e conferir a frase da senha única e as confirmações (`docs/evidencias-v2/G00/V2-F00-E09/RESUMO.md` e `capturas/`). Pendências de Rafael que não bloqueiam a E08: ver as três sondas da E07 antes e depois e as capturas (`docs/evidencias-v2/G00/V2-F00-E07/RESUMO.md`), ver a frase e a coleta preservada no aparelho ou no emulador (`docs/evidencias-v2/G00/V2-F00-E06/RESUMO.md`, seção das frases, e `apps/campo/LEIA-ME.md`, passo 7), ler e aprovar as três frases da tela de entrada (`docs/evidencias-v2/G00/V2-F00-E05/RESUMO.md` e `capturas/`), ver a sonda da E04 antes e depois (`docs/evidencias-v2/G00/V2-F00-E04/RESUMO.md`), validação humana da E01 (`docs/evidencias-v2/G00/V2-F00-E01/COMO-REPRODUZIR.md` e o último run do workflow Verificar), da E02 (ler a política e confirmar prazo e dono) e da E03 (decidir a regra de BZ-N:N.3, confirmar os 14 defeitos do campo e aprovar as reescritas previstas: seção 7 de `classificacao-dos-vermelhos.md`). Os commits `V2-F00-E01` a `V2-F00-E07` só com a aprovação dele. Os documentos da revisão de escopo continuam sem commit.
- **PONTO DE PARADA:** fim da V2-F00-E10. Pelo regime de 2026-10-05 a execução segue para a E11 sem esperar aprovação, mas nenhum commit é feito sem Rafael.
- **PONTO DE PARTIDA DA IMPLEMENTAÇÃO (depois da aprovação):** `V2-F00-E01`. CP-01 já está decidido (1 pessoa dedicada). Antes de F00-E19 é preciso CP-03 (política de npm audit) e antes de F00-E24 já vale CP-02 (implementar). Nada novo entra antes de G00 (D-04). A ordem de execução das fases é a da seção 5 (a numeração das fases F29 a F35 NÃO é a ordem).

## 2. COMO RETOMAR (protocolo para uma conversa nova)

1. Leia este arquivo inteiro (principalmente as seções 1, 4 e 5).
2. Leia `00-README.md` (protocolo de execução) e a seção 11 de `01-decisoes-e-principios.md` (decisões).
3. Confira com `git log --oneline -10` e `git status` se o repositório bate com o que a seção 1 diz.
4. Se a fase do trabalho é REVISÃO DE ESCOPO: pegue o primeiro pacote RV não concluído da seção 4 e execute-o; ao terminar, atualize a seção 4, a seção 1 e o diário (seção 10).
5. Se a fase do trabalho é IMPLEMENTAÇÃO: pegue a primeira etapa PENDENTE da seção 8 NA ORDEM DE EXECUÇÃO da seção 5, abra o arquivo da fase, confira o gate anterior (seção 6), as dependências e os checkpoints (seção 7) e siga o protocolo de `00-README.md`.
6. Se algo estiver bloqueado por checkpoint aberto, PARE e pergunte a Rafael; nunca decida J1 a J13 pelo roadmap.

## 3. REGRAS DE ATUALIZAÇÃO (obrigatórias)

- Depois de CADA etapa, gate, checkpoint ou pacote de revisão: atualizar a linha correspondente, a seção 1 (última ação, próxima ação, ponto de parada) e o diário (seção 10), com data em formato ISO.
- Status de etapa: `PENDENTE`, `EM ANDAMENTO`, `CONCLUÍDA` (exige evidência em `docs/evidencias-v2/Gnn/V2-Fnn-Enn/`), `BLOQUEADA` (diz o CP), `CANCELADA` (diz o motivo e a decisão).
- Status de gate: `NÃO INICIADO`, `EM ANDAMENTO`, `APROVADO`, `REPROVADO` (diz a etapa que reprovou). Gate aprovado volta a REPROVADO se uma etapa posterior quebrar algo dele.
- Status de checkpoint: `ABERTO`, `PARCIAL`, `DECIDIDO` (diz a resposta e quem decidiu), `ADIADO`.
- Um commit por etapa aprovada (decisão D-28), com a mensagem `V2-Fnn-Enn: resumo`; o commit inclui a atualização deste arquivo. A regra de 2026-10-05 ("não parar por nada, a não ser que os tokens acabem") tira a parada entre etapas, mas NÃO autoriza commit: commitar continua dependendo de Rafael.
- Validação humana pendente (segunda pessoa, run do CI, aparelho físico, decisão de checkpoint): registrar na coluna de observação da etapa e na seção 11; não bloqueia a etapa seguinte, a não ser que ela dependa de um checkpoint em aberto.
- Etapa com implementação e evidência prontas mas validação humana pendente: status `EM ANDAMENTO` com a observação "falta validação humana" (nunca CONCLUÍDA sem a prova que a etapa exige).
- Nunca marcar CONCLUÍDA sem ter rodado os testes da etapa. Limitações e falhas são registradas na coluna de observação.

## 4. REVISÃO DE ESCOPO (pacotes de trabalho)

Histórico dos pacotes da revisão de escopo (todos concluídos). Cada pacote foi dono de arquivos distintos, aplicou as decisões da seção 11 de `01`, reescreveu as etapas afetadas, acrescentou etapas novas (IDs seguintes ao último da fase) e ajustou o gate da fase. O RV-15 reconciliou as contradições entre pacotes e numerou os checkpoints. Backups dos originais da revisão estão só no scratchpad da sessão (o repositório ainda não commitou nada).

| Pacote | Arquivos que edita | O que muda | Status |
| --- | --- | --- | --- |
| RV-01 | `05-api-identidade-autorizacao.md` (F02, F03, F04) | Pessoa global com vínculos e escolha de município (D-08, reescreve F03-E01, E02, E04, E05, E06, E09, E10, E11); escalonamento acima do gestor e competência COBRADE ou território (D-18); lacunas de identidade e autorização (nível de sigilo, cenário de upload entre equipes); devolução só antes do aceite (D-23) | CONCLUÍDO (2026-10-02) |
| RV-02 | `06-lgpd-arquivos.md` (F05, F06, F07) | Vídeo na cadeia de arquivos (D-07); classe de anexo da prefeitura; upload retomável; expurgo de aparelho revogado; CPF no manifesto de dados | CONCLUÍDO (2026-10-02) |
| RV-03 | `04-fundacao-engenharia.md` (F01, F08) | Lint, trava de migration, SBOM, licenças e scan de contêiner (D-19); infraestrutura de idiomas e de tema por município (D-11, D-12); PostGIS no HML e no CI (D-16) | CONCLUÍDO (2026-10-02) |
| RV-04 | `07-documentos.md` (F09) | Assinatura avançada e ICP-Brasil por provedor externo (D-09); modelos por organização, notificação e relatório fotográfico (lacuna L8); qualidade de modelos configuráveis (D-17) | CONCLUÍDO (2026-10-02) |
| RV-05 | `08-painel-prefeitura.md` (F10) | Filtros de mapa e lista; relatório PDF e cabeçalho do CSV; prioridade da providência; edição de chamado; trilha de sessão; indicadores por órgão; estilo inline; instalação PWA; liberação do suporte assistido; foto de perfil (D-26); escalonamento e competência na tela da Defesa Civil | CONCLUÍDO (2026-10-02) |
| RV-06 | `09-portal-secretarias.md` (F11, F12) | Seletor de município e login da pessoa global (D-08); órgão externo; instalação PWA (D-22); escalonamento e competência no portal; cor de destaque do município | CONCLUÍDO (2026-10-02) |
| RV-07 | `10-campo-reinspecao.md` (F13, F14) | Reabrir por 30 dias e depois vinculada (D-21, reescreve F13-E01 e E06); saída a campo (D-25); segundo fator do agente com tela de código (D-27); agente sem equipe; validação no servidor de foto e assinatura; upload retomável e aditamento | CONCLUÍDO (2026-10-02) |
| RV-08 | `11-cidadao-fundacao.md` (F15, F16) | Pessoa e CPF do cidadão (D-07), resolução de município com PostGIS (D-16), ajustes de domínio para chat e vídeo | CONCLUÍDO (2026-10-02) |
| RV-09 | `12-cidadao-app-triagem.md` (F17, F18, F19) | Ganchos para o canal ampliado, idiomas, cor do município; payload do agente sem vídeo nem chat | CONCLUÍDO (2026-10-02) |
| RV-10 | `13-console.md`, `14-operacao-observabilidade-dr.md`, `15-seguranca-acessibilidade.md`, `16-poc-piloto-producao.md` (F20 a F28) | Suporte assistido (D-10); tracing e SLO (D-13); leitura da trilha do fornecedor e livro de eliminações; ciclo do operador do console; cobrança e contrato; exercício anual de DR; redundância; pentest recorrente; POC, piloto e candidata cobrindo os módulos novos | CONCLUÍDO (2026-10-02) |
| RV-11 | `22-incidentes-abrigos-logistica.md` (NOVO, F29 e F30) | Incidentes, abrigos e logística humanitária completos (D-15) | CONCLUÍDO (2026-10-02) |
| RV-12 | `23-integracoes-externas.md` (NOVO, F31) | WhatsApp oficial, camadas GIS, Cemaden, adaptadores S2ID, SEI e Defesa Civil Alerta (D-14) | CONCLUÍDO (2026-10-02) |
| RV-13 | `24-postgis-territorio.md` e `25-configuracao-checklist-importacao.md` (NOVOS, F32 e F33) | PostGIS e consulta territorial (D-16); configuração versionada, checklist por tipo e importação de lote (D-17) | CONCLUÍDO (2026-10-02) |
| RV-14 | `26-canal-cidadao-ampliado.md` e `27-idiomas-identidade-visual.md` (NOVOS, F34 e F35) | Vídeo, chat, gov.br, SMS, login social e CPF (D-07); idiomas, VLibras e cor por município (D-11, D-12) | CONCLUÍDO (2026-10-02) |
| RV-15 | `17`, `18`, `19`, `20`, `21`, `02`, `00`, `01`, `ROADMAP-V2.md`, STATUS | Rastreabilidade com os novos itens; novos checkpoints (provedores, credenciamentos); matrizes; ordem de execução; verificação final; STATUS regenerado | CONCLUÍDO (2026-10-02) |

## 5. ORDEM DE EXECUÇÃO DAS FASES

A numeração das fases novas NÃO é a ordem de execução. Vale esta tabela, e cada gate depende de todos os gates que a precedem NESTA ordem.

| Ordem | Fase | Nome | Gate | Arquivo |
| --- | --- | --- | --- | --- |
| 1 | F00 | Estabilização obrigatória | G00 | 03-fase-00-estabilizacao.md |
| 2 | F01 | Fundação de engenharia e ambientes | G01 | 04-fundacao-engenharia.md |
| 3 | F02 | API v1 e contratos | G02 | 05-api-identidade-autorizacao.md |
| 4 | F03 | Identidade, vigência e contexto de ator | G03 | 05-api-identidade-autorizacao.md |
| 5 | F04 | Isolamento intra-município e encaminhamento | G04 | 05-api-identidade-autorizacao.md |
| 6 | F05 | Manifesto de dados e LGPD técnica | G05 | 06-lgpd-arquivos.md |
| 7 | F06 | Cadeia segura de arquivos | G06 | 06-lgpd-arquivos.md |
| 8 | F07 | Workers e topologia operacional | G07 | 06-lgpd-arquivos.md |
| 9 | F08 | Design system e fundamentos de UX | G08 | 04-fundacao-engenharia.md |
| 10 | F32 | PostGIS e dados territoriais | G32 | 24-postgis-territorio.md |
| 11 | F09 | Documentos oficiais V2 | G09 | 07-documentos.md |
| 12 | F10 | Consolidação do painel da prefeitura | G10 | 08-painel-prefeitura.md |
| 13 | F11 | Portal das secretarias | G11 | 09-portal-secretarias.md |
| 14 | F12 | Homologação do portal com secretaria real | G12 | 09-portal-secretarias.md |
| 15 | F13 | Reinspeção e retorno ao campo | G13 | 10-campo-reinspecao.md |
| 16 | F14 | Consolidação do app do agente | G14 | 10-campo-reinspecao.md |
| 17 | F33 | Configuração por município, checklist por tipo e importação | G33 | 25-configuracao-checklist-importacao.md |
| 18 | F15 | Fundação do canal cidadão | G15 | 11-cidadao-fundacao.md |
| 19 | F16 | Domínio de relatos e triagem (modelo) | G16 | 11-cidadao-fundacao.md |
| 20 | F17 | App do cidadão | G17 | 12-cidadao-app-triagem.md |
| 21 | F18 | Triagem no painel | G18 | 12-cidadao-app-triagem.md |
| 22 | F34 | Canal do cidadão ampliado | G34 | 26-canal-cidadao-ampliado.md |
| 23 | F19 | Integração cidadão, ocorrência e campo | G19 | 12-cidadao-app-triagem.md |
| 24 | F29 | Incidentes e abrigos | G29 | 22-incidentes-abrigos-logistica.md |
| 25 | F30 | Logística humanitária | G30 | 22-incidentes-abrigos-logistica.md |
| 26 | F31 | Integrações externas oficiais | G31 | 23-integracoes-externas.md |
| 27 | F35 | Idiomas, VLibras e identidade visual por município | G35 | 27-idiomas-identidade-visual.md |
| 28 | F20 | Console DC360 V2 | G20 | 13-console.md |
| 29 | F21 | Observabilidade | G21 | 14-operacao-observabilidade-dr.md |
| 30 | F22 | Backup, DR, RPO e RTO | G22 | 14-operacao-observabilidade-dr.md |
| 31 | F23 | Acessibilidade | G23 | 15-seguranca-acessibilidade.md |
| 32 | F24 | Performance e carga | G24 | 14-operacao-observabilidade-dr.md |
| 33 | F25 | Segurança pré-piloto | G25 | 15-seguranca-acessibilidade.md |
| 34 | F26 | POC controlada | G26 | 16-poc-piloto-producao.md |
| 35 | F27 | Piloto municipal | G27 | 16-poc-piloto-producao.md |
| 36 | F28 | Candidata a produção | G28 | 16-poc-piloto-producao.md |

## 6. FASES E GATES

| Ordem | Fase | Nome | Gate | Etapas | Concluídas | Status do gate |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | F00 | Estabilização obrigatória | G00 BASE CONFIÁVEL | 25 | 0 | NÃO INICIADO |
| 2 | F01 | Fundação de engenharia e ambientes | G01 ENGENHARIA E AMBIENTES PRONTOS | 22 | 0 | NÃO INICIADO |
| 3 | F02 | API v1 e contratos | G02 API V1 E CONTRATOS | 9 | 0 | NÃO INICIADO |
| 4 | F03 | Identidade, vigência e contexto de ator | G03 IDENTIDADE E VIGÊNCIA PROVADAS | 21 | 0 | NÃO INICIADO |
| 5 | F04 | Isolamento intra-município e encaminhamento | G04 ISOLAMENTO INTRA-MUNICÍPIO PROVADO | 17 | 0 | NÃO INICIADO |
| 6 | F05 | Manifesto de dados e LGPD técnica | G05 MANIFESTO DE DADOS ATIVO | 15 | 0 | NÃO INICIADO |
| 7 | F06 | Cadeia segura de arquivos | G06 CADEIA DE ARQUIVOS PROVADA | 23 | 0 | NÃO INICIADO |
| 8 | F07 | Workers e topologia operacional | G07 WORKERS E TOPOLOGIA OPERACIONAL | 13 | 0 | NÃO INICIADO |
| 9 | F08 | Design system e fundamentos de UX | G08 DESIGN SYSTEM E FUNDAMENTOS | 13 | 0 | NÃO INICIADO |
| 10 | F32 | PostGIS e dados territoriais | G32 POSTGIS E DADOS TERRITORIAIS PROVADOS | 16 | 0 | NÃO INICIADO |
| 11 | F09 | Documentos oficiais V2 | G09 DOCUMENTOS IMUTÁVEIS | 28 | 0 | NÃO INICIADO |
| 12 | F10 | Consolidação do painel da prefeitura | G10 PAINEL CONSOLIDADO | 36 | 0 | NÃO INICIADO |
| 13 | F11 | Portal das secretarias | G11 PORTAL FUNCIONAL EM HML | 30 | 0 | NÃO INICIADO |
| 14 | F12 | Homologação do portal com secretaria real | G12 PORTAL HOMOLOGADO COM SECRETARIA REAL | 8 | 0 | NÃO INICIADO |
| 15 | F13 | Reinspeção e retorno ao campo | G13 REINSPEÇÃO | 11 | 0 | NÃO INICIADO |
| 16 | F14 | Consolidação do app do agente | G14 APP DO AGENTE EM APARELHO FÍSICO | 22 | 0 | NÃO INICIADO |
| 17 | F33 | Configuração por município, checklist por tipo e importação | G33 CONFIGURAÇÃO, CHECKLIST E IMPORTAÇÃO PROVADOS | 16 | 0 | NÃO INICIADO |
| 18 | F15 | Fundação do canal cidadão | G15 FUNDAÇÃO DO CIDADÃO | 18 | 0 | NÃO INICIADO |
| 19 | F16 | Domínio de relatos e triagem (modelo) | G16 DOMÍNIO DE RELATOS | 16 | 0 | NÃO INICIADO |
| 20 | F17 | App do cidadão | G17 APP DO CIDADÃO EM BETA INTERNO | 20 | 0 | NÃO INICIADO |
| 21 | F18 | Triagem no painel | G18 TRIAGEM NO PAINEL | 13 | 0 | NÃO INICIADO |
| 22 | F34 | Canal do cidadão ampliado | G34 CANAL DO CIDADÃO AMPLIADO | 20 | 0 | NÃO INICIADO |
| 23 | F19 | Integração cidadão, ocorrência e campo | G19 CIDADÃO ATÉ O CAMPO | 7 | 0 | NÃO INICIADO |
| 24 | F29 | Incidentes e abrigos | G29 INCIDENTES E ABRIGOS | 18 | 0 | NÃO INICIADO |
| 25 | F30 | Logística humanitária | G30 LOGÍSTICA HUMANITÁRIA | 18 | 0 | NÃO INICIADO |
| 26 | F31 | Integrações externas oficiais | G31 INTEGRAÇÕES EXTERNAS OFICIAIS | 20 | 0 | NÃO INICIADO |
| 27 | F35 | Idiomas, VLibras e identidade visual por município | G35 IDIOMAS, VLIBRAS E IDENTIDADE POR MUNICÍPIO | 14 | 0 | NÃO INICIADO |
| 28 | F20 | Console DC360 V2 | G20 CONSOLE V2 | 19 | 0 | NÃO INICIADO |
| 29 | F21 | Observabilidade | G21 OBSERVABILIDADE | 14 | 0 | NÃO INICIADO |
| 30 | F22 | Backup, DR, RPO e RTO | G22 BACKUP E DR PROVADOS | 11 | 0 | NÃO INICIADO |
| 31 | F23 | Acessibilidade | G23 ACESSIBILIDADE VALIDADA | 13 | 0 | NÃO INICIADO |
| 32 | F24 | Performance e carga | G24 DESEMPENHO MEDIDO | 14 | 0 | NÃO INICIADO |
| 33 | F25 | Segurança pré-piloto | G25 SEGURANÇA PRÉ-PILOTO | 21 | 0 | NÃO INICIADO |
| 34 | F26 | POC controlada | G26 POC APROVADA | 12 | 0 | NÃO INICIADO |
| 35 | F27 | Piloto municipal | G27 PILOTO ENCERRADO | 9 | 0 | NÃO INICIADO |
| 36 | F28 | Candidata a produção | G28 CANDIDATA A PRODUÇÃO | 16 | 0 | NÃO INICIADO |

## 7. CHECKPOINTS (decisões humanas)

| CP | Assunto | Quem decide | Status | Resposta ou observação |
| --- | --- | --- | --- | --- |
| CP-01 | Capacidade, custo e plano da onda (DECIDIDO: 1 pessoa dedicada, D-28) | 🛑 Rafael | DECIDIDO | 1 pessoa dedicada (D-28) |
| CP-02 | Saída a campo: implementar ou retirar a promessa (DECIDIDO: implementar, D-25, premissa) | 🛑 Rafael, Alyson | DECIDIDO | implementar a saída a campo no app (D-25, premissa a confirmar) |
| CP-03 | Política de npm audit | 🛑 Rafael | ABERTO |  |
| CP-04 | Entidade, domínio, contas de loja, marca e bundle ids | 🛑 Rafael, Alyson | ABERTO |  |
| CP-05 | Contratação do ambiente de homologação | 🛑 Rafael | ABERTO |  |
| CP-06 | Ferramenta de erro e de log, residência do dado | 🛑 Rafael e ⚖️ jurídico | ABERTO |  |
| CP-07 | Segunda pessoa com acesso e plantão | 🛑 Rafael | ABERTO |  |
| CP-08 | MFA obrigatório para usuário de órgão | 🛑 Alyson | ABERTO |  |
| CP-09 | Conteúdo do dossiê mínimo e o que desce ao agente | 🛑 Alyson e ⚖️ DPO, município | ABERTO |  |
| CP-10 | Retenção padrão, IP e user-agent, documento emitido | 🛑 município e ⚖️ jurídico | ABERTO |  |
| CP-11 | Privacidade: base legal, política, termos, aceite, menores, titular, encarregado | ⚖️ jurídico, DPO | ABERTO |  |
| CP-12 | PDF da secretaria antes do scanner completo | 🛑 Rafael | ABERTO |  |
| CP-13 | Cotas e limites de anexo | 🛑 Rafael | ABERTO |  |
| CP-14 | Aprovação, nomenclatura jurídica e marca d'água | 🛑 município, Alyson e ⚖️ jurídico | ABERTO |  |
| CP-15 | PDF oficial acessível (tagged) | 🛑 Rafael | ABERTO |  |
| CP-16 | QR de validação de autenticidade | 🛑 Alyson | ABERTO |  |
| CP-17 | Encerramento com providência em aberto | 🛑 Alyson | ABERTO |  |
| CP-18 | Foto de perfil no painel (DECIDIDO: construir, D-26, premissa) | 🛑 Rafael | DECIDIDO | construir a foto de perfil no painel (D-26, premissa a confirmar) |
| CP-19 | Contratação para uso externo (e-mail, storage, banco, erro) | 🛑 Rafael | ABERTO | Trava só o ENVIO REAL de e-mail (provedor e domínio). O fluxo completo de recuperação de senha já está pronto e provado com o notificador de teste (V2-F00-E10); a produção segue com `RECUPERACAO_ATIVA=nao` até a decisão. |
| CP-20 | Secretaria piloto, estados e atribuição do encaminhamento (PARCIAL: devolução só antes do aceite, D-23) | 🛑 Alyson | PARCIAL | devolver só antes do aceite (D-23); falta secretaria piloto, atribuição e estados com dado real |
| CP-21 | Percentuais de lembrete e cadeia de escalonamento | 🛑 Alyson, município | ABERTO |  |
| CP-22 | Ofício por link: manter ou desligar | 🛑 Alyson | ABERTO |  |
| CP-23 | Reabertura de ocorrência x ocorrência vinculada (DECIDIDO: reabrir por 30 dias e depois vinculada, D-21) | 🛑 Alyson | DECIDIDO | reabrir por 30 dias (configurável) e depois só ocorrência vinculada (D-21) |
| CP-24 | Detalhes do app do agente | 🛑 Rafael, Alyson | ABERTO |  |
| CP-25 | Papel PostgreSQL da API pública | 🛑 Rafael (decisão técnica com evidência) | ABERTO |  |
| CP-26 | Trote, abuso e conteúdo ilícito | ⚖️ jurídico | ABERTO |  |
| CP-27 | Anti-abuso além da base | 🛑 Rafael | ABERTO |  |
| CP-28 | Habilitação do canal por município e processo de triagem | 🛑 município, Alyson | ABERTO |  |
| CP-29 | O que se preserva de município eliminado | ⚖️ jurídico, município | ABERTO |  |
| CP-30 | Suporte do fornecedor e acesso assistido (PARCIAL: somente leitura, D-10; falta o parecer J10) | ⚖️ jurídico e 🛑 Rafael | PARCIAL | suporte assistido somente leitura (D-10); falta parecer J10; impersonation completa fora |
| CP-31 | RPO, RTO e disponibilidade a prometer | 🛑 Rafael, Alyson | ABERTO |  |
| CP-32 | Acessibilidade: aplicabilidade legal e teste com pessoa com deficiência | ⚖️ jurídico e 🛑 Alyson | ABERTO |  |
| CP-33 | Pentest externo: contratação e escopo | 🛑 Rafael | ABERTO |  |
| CP-34 | Piloto municipal: prefeitura, secretaria, agentes, período | 🛑 Rafael, Alyson, município | ABERTO |  |
| CP-35 | Revalidação dos itens fora da V2 | 🛑 Rafael, Alyson | ABERTO |  |
| CP-36 | Replanejamento de capacidade e custo da próxima onda | 🛑 Rafael | ABERTO |  |
| CP-37 | Resultado da medição de RPO e RTO | 🛑 Rafael | ABERTO |  |
| CP-38 | Orientação do aparelho e layout de tablet no app do cidadão | 🛑 Alyson | ABERTO |  |
| CP-39 | Alternativa à assinatura por traço de dedo na vistoria | 🛑 Alyson | ABERTO |  |
| CP-40 | Lacunas do MVP do documento do Alyson (DECIDIDO: L1 a L26 entram na V2, D-20) | 🛑 Alyson, Rafael | DECIDIDO | lacunas L1 a L26 entram, distribuídas nas fases donas (D-20) |
| CP-41 | Provedor de assinatura externa: escolha, tarifa e contrato | 🛑 Rafael, município e ⚖️ jurídico | ABERTO |  |
| CP-42 | Texto e fundamento legal da notificação ao responsável pelo imóvel | ⚖️ município e jurídico dele | ABERTO |  |
| CP-43 | Licenças de dependência permitidas e proibidas | 🛑 Rafael e ⚖️ jurídico | ABERTO |  |
| CP-44 | PostGIS no provedor gerenciado de HML e de produção | 🛑 Rafael | ABERTO |  |
| CP-45 | VLibras: integração no app e script do governo nas telas web | 🛑 Rafael | ABERTO |  |
| CP-46 | CPF obrigatório no relato identificado: base legal e finalidade | ⚖️ jurídico, DPO e 🛑 Rafael | ABERTO |  |
| CP-47 | Custo de armazenamento e de máquina do vídeo do relato | 🛑 Rafael | ABERTO |  |
| CP-48 | Destino da foto de vistoria sinalizada pelo antivírus | 🛑 Alyson e ⚖️ jurídico | ABERTO |  |
| CP-49 | Pessoa global: parecer do encarregado sobre identidade global | ⚖️ DPO e 🛑 Rafael | ABERTO |  |
| CP-50 | Segundo fator e redefinição de acesso da pessoa com vários municípios | 🛑 Rafael e Alyson | ABERTO |  |
| CP-51 | Termo, base legal e piloto do órgão externo | ⚖️ jurídico e 🛑 Rafael, Alyson | ABERTO |  |
| CP-52 | Níveis de sigilo da ocorrência e quem vê cada um | 🛑 Alyson e ⚖️ jurídico, DPO | ABERTO |  |
| CP-53 | Escalonamento por município e rigor da competência do órgão | 🛑 Alyson e município | ABERTO |  |
| CP-54 | Prazo padrão e teto do acesso assistido do fornecedor | 🛑 Rafael e Alyson | ABERTO |  |
| CP-55 | Lista final de motivos de encerramento da ocorrência | 🛑 Alyson | ABERTO |  |
| CP-56 | Definição de taxa de atendimento e tempo de resposta por órgão | 🛑 Alyson | ABERTO |  |
| CP-57 | Agente que perde o aparelho e os códigos: desligar o segundo fator dele | 🛑 Rafael | ABERTO |  |
| CP-58 | Fonte, licença e custo dos tiles do mapa offline | 🛑 Rafael | ABERTO |  |
| CP-59 | Tokens de municípios diferentes na mesma sessão do portal | 🛑 Rafael | ABERTO |  |
| CP-60 | Destino, país e retenção dos traces (OpenTelemetry) | 🛑 Rafael | ABERTO |  |
| CP-61 | Planos, valores, excedente, nota fiscal e cobrança por gateway | 🛑 Rafael e Alyson | ABERTO |  |
| CP-62 | Escala de níveis do incidente e estrutura de comando | 🛑 Alyson | ABERTO |  |
| CP-63 | Papéis de incidente e de logística | 🛑 Rafael e Alyson | ABERTO |  |
| CP-64 | Conteúdo do relatório de situação do incidente | 🛑 Alyson | ABERTO |  |
| CP-65 | Cadastro nominal de abrigados | 🛑 Rafael e ⚖️ jurídico, DPO | ABERTO |  |
| CP-66 | Saldo negativo de estoque com o agente offline | 🛑 Rafael | ABERTO |  |
| CP-67 | Quem aprova ajuste de estoque | 🛑 Alyson | ABERTO |  |
| CP-68 | Categorias padrão e itens controlados do catálogo | 🛑 Alyson e ⚖️ jurídico | ABERTO |  |
| CP-69 | Dados de doador e de recebedor: finalidade e retenção | ⚖️ jurídico e DPO | ABERTO |  |
| CP-70 | Valores finais dos alertas de estoque | 🛑 Alyson | ABERTO |  |
| CP-71 | Regra final de kits permanentes e de inventários simulados | 🛑 Alyson | ABERTO |  |
| CP-72 | Operação degradada da logística sem o sistema | 🛑 Alyson e município | ABERTO |  |
| CP-73 | Revisão das traduções em inglês e em espanhol | 🛑 Rafael | ABERTO |  |
| CP-74 | Dono e orçamento das rotinas recorrentes de segurança e de DR | 🛑 Rafael | ABERTO |  |
| CP-75 | Quais módulos novos entram no piloto | 🛑 Rafael, Alyson e município | ABERTO |  |
| CP-76 | Credenciais de integração real que o piloto usa | 🛑 Rafael, Alyson e município | ABERTO |  |
| CP-77 | Onde mora a chave mestra dos segredos de integração por município | 🛑 Rafael | ABERTO |  |
| CP-78 | WhatsApp oficial: provedor, conta, modelos e contrato | 🛑 Rafael | ABERTO |  |
| CP-79 | Relato de cidadão por WhatsApp diante de conta e CPF obrigatórios | 🛑 Rafael e ⚖️ jurídico | ABERTO |  |
| CP-80 | Fontes, licença e serviços WMS das camadas GIS | ⚖️ município | ABERTO |  |
| CP-81 | Existe API pública utilizável do Cemaden | 🛑 Rafael | ABERTO |  |
| CP-82 | Credenciamento do município no S2ID | ⚖️ município | ABERTO |  |
| CP-83 | Credenciamento e instância do SEI do município | ⚖️ município | ABERTO |  |
| CP-84 | Credenciamento para o Defesa Civil Alerta | ⚖️ município | ABERTO |  |
| CP-85 | Malha municipal do IBGE: fonte, versão, simplificação e carga | 🛑 Rafael | ABERTO |  |
| CP-86 | Áreas de risco: origem, licença e quem vê | ⚖️ município e 🛑 Alyson | ABERTO |  |
| CP-87 | O que identifica um imóvel (inscrição, matrícula, endereço) | 🛑 município e Alyson | ABERTO |  |
| CP-88 | Quem publica uma versão de configuração e se precisa de segundo aprovador | 🛑 Alyson e Rafael | ABERTO |  |
| CP-89 | Quem escreve as perguntas técnicas do checklist por tipo | 🛑 Alyson | ABERTO |  |
| CP-90 | Campos, estados e protocolo legado importáveis por CSV | 🛑 Alyson e município | ABERTO |  |
| CP-91 | Login gov.br: credenciamento, homologação, escopos e uso da marca | 🛑 Rafael e ⚖️ jurídico | ABERTO |  |
| CP-92 | Provedor de SMS: preço, teto diário e contrato de dados | 🛑 Rafael | ABERTO |  |
| CP-93 | Login social: contas de desenvolvedor, regra da Apple e privacidade | 🛑 Rafael | ABERTO |  |
| CP-94 | Quem responde o chat do relato, em que horário e com que prazo | 🛑 Alyson e município | ABERTO |  |
| CP-95 | Declaração de uso da imagem do logotipo do município | ⚖️ jurídico | ABERTO |  |

Os checkpoints CP-41 a CP-95 nasceram da revisão de escopo de 2026-10-01 (provedores, credenciamentos, pareceres, decisões de negócio). Todos começam ABERTO; cada um diz em `18-checkpoints.md` o que bloqueia. Os que bloqueiam só a ATIVAÇÃO EM PRODUÇÃO (por exemplo gov.br, SMS, WhatsApp, S2ID) não impedem implementar e testar a etapa com adaptador e sandbox.

## 8. ETAPAS (status por etapa)

Tabela gerada dos arquivos de fase em 2026-10-02 (todas as etapas, antigas e novas). Os IDs existentes não mudam; etapa que deixar de valer vira CANCELADA, nunca some.

### F00 Estabilização obrigatória (gate G00)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F00-E01 | Baseline atual reproduzível em máquina limpa | S | P0 | EM ANDAMENTO | Implementada e medida em 2026-10-05, 17 de 17 conferem; falta validação humana (segunda pessoa com `npm ci` e run do CI). Evidência: `docs/evidencias-v2/G00/V2-F00-E01/` |
| V2-F00-E02 | Política T42 para teste vermelho e skip | S | P0 | EM ANDAMENTO | Implementada e medida em 2026-10-05: portão com 17 testes (árvore atual verde, 594 arquivos, 10 skips por ambiente contados, 1 incondicional marcado), `test:scripts` 198 com as 3 falhas da E17. Falta validação humana: Rafael lê a política e confirma prazo máximo e dono padrão (premissas). Evidência: `docs/evidencias-v2/G00/V2-F00-E02/` |
| V2-F00-E03 | Classificar os vermelhos por causa e registrar | S | P0 | EM ANDAMENTO | Registro feito em 2026-10-05, só documentação: 40 testes vermelhos, 13 casos da suíte `banco-tls`, 5 pulados da vigência, 13 afirmações de números, typecheck do campo, 4 passos de dependência e 3 e2e, cada um com classe, regra, etapa e dono; soma fechada contra o baseline da E01 (17 de 17). Faltam: a decisão de Rafael sobre BZ-N:N.3 e os 14 defeitos do campo (hoje premissa, seção 9) e a leitura das divergências (D-1 a D-7). Evidência: `docs/evidencias-v2/G00/V2-F00-E03/` |
| V2-F00-E04 | Religar a vigência de conta, papel e sessão na escrita e tirar o skip | S | P0 | EM ANDAMENTO | Implementada e medida em 2026-10-06: vigência religada em `servidor.ts`, skip e marca T42 fora, sonda 6 de 13 vermelhos antes e 13 de 13 verdes depois, API 1113 testes com 1 falha (E12) e 13 pulados (`banco-tls`), isolamento e superfície verdes. Falta validação humana (Rafael vê a sonda antes e depois) e o E2E de navegador (fica para a E05); não implantar sem E05 e E06. Evidência: `docs/evidencias-v2/G00/V2-F00-E04/` |
| V2-F00-E05 | Códigos de erro 401 nao_autenticado, 401 sessao_encerrada e 403 conta_desativada, com catálogo | S | P0 | EM ANDAMENTO | Implementada e medida em 2026-10-06: catálogo no shared (seis códigos), `sessao_encerrada` e `conta_desativada` emitidos e testados (16 casos novos na API, 8 vermelhos com o código velho), painel com as três frases, `/auth/entrar` intacta, 404 de outro município intacto; API 1129 testes com 1 falha (E12) e 13 pulados, shared 159, web 557 com as mesmas 14 falhas, isolamento 318, superfície 9. Falta validação humana (Rafael aprova as três frases) e o E2E completo do painel (`e2e-api` cai na seção 13, E18; a seção 23 foi provada em cópia aparada). Não implantar sem E06. Evidência: `docs/evidencias-v2/G00/V2-F00-E05/` |
| V2-F00-E06 | Fila do campo trata os três códigos sem perder item (`packages/campo/src/transporte.ts`) | M | P0 | EM ANDAMENTO | Implementada e medida em 2026-10-06: `FalhaDeSessao` (nova), 401 `nao_autenticado` renova UMA vez e repete, 401 `sessao_encerrada` e 403 `conta_desativada` (e sem token) param a fila e mantêm o item pendente (zero bloqueado, tentativas inalteradas, `paradaPor` no dreno, `pausadaPor` no resumo), 403 `sem_permissao` segue bloqueando; faixa, aviso e cartão "Guardada" no app, frase de conta desativada em `falha-de-atualizacao.ts`; sonda 16 de 86 vermelhos com o transporte antigo, 13 com a fila antiga, 7 de 9 com a tela antiga; pacote 187, jest do app 1836 com as mesmas 20 falhas (E14 a E16), API 1134 (4 casos novos contra a API real), isolamento 318. Falta validação humana: Rafael vê a frase e a coleta preservada no aparelho ou no emulador e aprova as frases; NÃO há captura de tela nem E2E em emulador (o Expo não renderiza no ambiente da etapa), só teste de componente e o texto que a tela desenha. Evidência: `docs/evidencias-v2/G00/V2-F00-E06/` |
| V2-F00-E07 | Papel alterado, sessão rotacionada e senha provisória | M | P0 | EM ANDAMENTO | Implementada e medida em 2026-10-06: migração 047 (`sessoes.familia_id`, `abrir_sessao` com a família opcional), sessão rotacionada só vale enquanto a cadeia vive (administrador, própria pessoa, sair, reuso e troca de senha derrubam o token anterior à renovação), papel diferente do token é 401 `nao_autenticado` e a renovação traz o papel novo (a troca de papel não revoga sessões), `trocarSenha` recusa a provisória vencida por conta própria, painel acompanha o papel da renovação; sonda 11 de 20 vermelhos antes e 20 de 20 verdes depois; API 1154 testes com 1 falha (E12) e 13 pulados, isolamento 330, superfície 9, web 559 com as mesmas 14 falhas; `migrar` mais `--conferir` ensaiados em Postgres 18.3 real, do zero e sobre banco existente. Falta validação humana (Rafael vê as três sondas) e o E2E completo do painel (`e2e-api` cai na seção 13, E18; a seção 24 foi provada em cópia aparada, com 8 capturas). Sem foto de aparelho (o app não mudou). Implantar com a E04, a E05 e a E06, migrando antes. Evidência: `docs/evidencias-v2/G00/V2-F00-E07/` |
| V2-F00-E08 | Fechar vazamentos P0 de leitura ao agente: GET /oficios, GET /oficios/:id e GET /avisos (que escreve) | M | P0 | EM ANDAMENTO | Implementada e medida em 2026-10-06: ação `consultar_oficio` (operador, coordenador, administrador), 403 `sem_permissao` ao agente nas duas rotas de ofício, sino e contagem do agente recortados à equipe (`POST /avisos/lidos` também), painel e modo local alinhados; sonda 9 de 14 vermelhos antes e 14 de 14 verdes depois, sonda HTTP 200 e 200 e 1 de 3 avisos alheios antes contra 403, 403 e 0 de 2 depois; API 1168 testes com 1 falha (E12) e 13 pulados, isolamento 330, superfície 9, shared 162 (1 falha E20), web 563 com as mesmas 14. Falta validação humana (Rafael vê a sonda do agente antes e depois) e o E2E completo (`e2e-api` cai na seção 13, E18; a seção 25 foi provada em cópia aparada, 14 de 14, com 8 capturas). A escrita dentro do `GET /avisos` segue, registrada em `apps/api/PENDENCIAS.md` (F07-E03, F04-E11). Sem migração. Evidência: `docs/evidencias-v2/G00/V2-F00-E08/` |
| V2-F00-E09 | Telas de sessões e de redefinição de senha no painel | M | P1 | EM ANDAMENTO | Implementada e medida em 2026-10-06: `GET /auth/sessoes` e `GET /usuarios/:id/sessoes` (sem IP nem user-agent), botões de redefinir senha e encerrar sessões por linha com confirmação, janela da senha temporária única, Minha conta com a lista de sessões e "encerrar minhas outras sessões"; o modo local explica. Os 8 casos de `seguranca-da-conta.test.ts` ficaram verdes sem tocar no teste; painel 581 testes com 6 falhas (E13 e E21), API 1195 com a mesma 1 falha (E12), isolamento 330, `baseline.mjs` confere. Seção 26 do e2e provada em cópia aparada (50 de 50), 68 capturas. FALTA a validação humana (Rafael faz o fluxo e confere a frase da senha única). Não capturei 320 px, 768 px nem zoom de 200 por cento. Evidência em `docs/evidencias-v2/G00/V2-F00-E09/`. |
| V2-F00-E10 | Recuperação de senha por e-mail: fluxo completo com notificador de teste | M | P1 | EM ANDAMENTO | Implementada e medida em 2026-10-06: o pedido responde 202 igual para e-mail que existe, que não existe e que passou do teto por hora (envio depois da resposta, falha do provedor só no log), `GET /auth/recuperacao`, as duas telas com todos os estados, o token fora da barra de endereço, pedido sem sessão (achado real: o link vencido derrubava a sessão de quem estava logado), `Referrer-Policy: no-referrer` e `noindex` só nas duas rotas, e a produção desligada provada por teste do `fly.toml` e de `config.ts`. Sonda: 8 de 15 casos da API e 3 de 3 do painel reprovam antes e passam depois. API 1220 testes com a mesma 1 falha (E12), painel 621 com as mesmas 6 (E13 e E21), isolamento 330, superfície 9 de 9. Seção 27 do e2e em cópia aparada (33 de 33) e seção 14 mantida (7 de 7), 96 capturas, contraste AA medido. FALTA a validação humana (Rafael faz o fluxo com o notificador de arquivo e confere que a produção segue desligada) e o ENVIO REAL de e-mail, que é o CP-19 (aberto). Não capturei 320 px, 768 px nem zoom de 200 por cento. Evidência em `docs/evidencias-v2/G00/V2-F00-E10/`. |
| V2-F00-E11 | Bug /pacote.zip e prova do pacote de saída ponta a ponta contra a API real | S | P0 | PENDENTE |  |
| V2-F00-E12 | Pacote de saída: laudo com aviso de equipe divergente | M | P0 | PENDENTE |  |
| V2-F00-E13 | Vermelhos do painel (14), incluindo "entrar a partir de /" que leva a "Esta página não existe" | M | P1 | PENDENTE |  |
| V2-F00-E14 | Vermelhos do app de campo por texto velho e mock velho reescritos conforme decisão de 2026-09-15 | S | P1 | PENDENTE |  |
| V2-F00-E15 | Defeitos reais do campo, parte 1: sair da conta não apaga vistoria começada; precisão de GPS abaixo de 0,5 m (CMP-52, CMP-33) | M | P0 | PENDENTE |  |
| V2-F00-E16 | Defeitos reais do campo, parte 2: mensagem de foto vazia, teclado e câmera na área segura, permissão sem botão de ajustes (CMP-35, CMP-89) | M | P1 | PENDENTE |  |
| V2-F00-E17 | Scripts e conferência de números: test:scripts (3 falhas) e conferir:numeros (13 afirmações) | M | P1 | PENDENTE |  |
| V2-F00-E18 | E2E de navegador (3) e CORS do PUT de evidência | M | P1 | PENDENTE |  |
| V2-F00-E19 | npm audit conforme política aprovada (raiz e campo) e expo-doctor | M | P0 | PENDENTE |  |
| V2-F00-E20 | Portão de conteúdo: zerar as linhas vermelhas pré-existentes (`trilha-detalhe.test.ts:181`, `AUDITORIA-2026-09-30.md:313`, `docs/auditoria-v2/raw`) | S | P1 | PENDENTE |  |
| V2-F00-E21 | Ambiente: CRLF em ocorrencia-encerramento, OPENSSL_CONF em banco-tls, Windows e Linux | S | P1 | PENDENTE |  |
| V2-F00-E22 | Documentação desatualizada ou falsa (README números, PENDENCIAS, ADR 0008, SAIDA cap. 2 x 5, LEIA-ME do campo, comentários de vigência) | M | P1 | PENDENTE |  |
| V2-F00-E23 | Teste de contrato mínimo painel x API (caminhos de `dados/http.ts` contra as rotas registradas) | S | P0 | PENDENTE |  |
| V2-F00-E24 | K14: ajustar documentação e apresentação conforme a decisão sobre saída a campo, antes de nova demonstração | S | P0 | PENDENTE |  |
| V2-F00-E25 | Restore das 46 migrações provado em máquina limpa (CA-08) e roteiro mínimo | M | P0 | PENDENTE |  |

### F01 Fundação de engenharia e ambientes (gate G01)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F01-E01 | Proteção da master: PR obrigatório, checks obrigatórios, sem push direto, auto-aprovação registrada | S | P0 | PENDENTE |  |
| V2-F01-E02 | CI confiável: permissions mínimas, timeouts, ações fixadas por SHA, cache | M | P0 | PENDENTE |  |
| V2-F01-E03 | CI passa a rodar o que hoje só roda local: `auditar`, `test:scripts`, `test:campo` (paridades e portões do app) | M | P0 | PENDENTE |  |
| V2-F01-E04 | Varredura de segredos (gitleaks) no CI e no pre-commit | S | P0 | PENDENTE |  |
| V2-F01-E05 | SAST (Semgrep CE) no CI com política de exceção | S | P1 | PENDENTE |  |
| V2-F01-E06 | Dependências: Dependabot ou Renovate e política de atualização | S | P1 | PENDENTE |  |
| V2-F01-E07 | SemVer, tags, changelog e estratégia de release | S | P1 | PENDENTE |  |
| V2-F01-E08 | Imagem Docker no CI e runbook de rollback (Fly releases, Vercel, EAS) | M | P1 | PENDENTE |  |
| V2-F01-E09 | Contratos de ambiente DEV, HML e PROD (matriz de variáveis, validação na subida, `.env.example`) | M | P0 | PENDENTE |  |
| V2-F01-E10 | Domínio, DNS, TLS e CORS por ambiente | S | P0 | PENDENTE |  |
| V2-F01-E11 | HML: app Fly, projeto Supabase, bucket e e-mail de teste, dados sintéticos, migração ensaiada | L | P0 | PENDENTE |  |
| V2-F01-E12 | Deploy HML por merge e PROD por promoção manual | M | P0 | PENDENTE |  |
| V2-F01-E13 | Perfil EAS de HML com bundle ids distintos | S | P1 | PENDENTE |  |
| V2-F01-E14 | Observabilidade P0 inicial: request id, erro centralizado (API e painel), monitor de /saude, rotinas em nível error, alerta de storage | M | P0 | PENDENTE |  |
| V2-F01-E15 | Dump antes de migration e roteiros multiplataforma (hoje só macOS) | S | P1 | PENDENTE |  |
| V2-F01-E16 | Runbooks mínimos (deploy, rollback, migração, rotação de segredo) e acesso da segunda pessoa | S | P1 | PENDENTE |  |
| V2-F01-E17 | Lint e formatação do monorepo (ESLint e Prettier) com baseline que só diminui | M | P2 | PENDENTE |  |
| V2-F01-E18 | Trava contra migration concorrente e regra de migration reversível | M | P1 | PENDENTE |  |
| V2-F01-E19 | SBOM por release e verificação de licenças | M | P1 | PENDENTE |  |
| V2-F01-E20 | Scan de contêiner (Trivy) no CI com política de exceção | S | P1 | PENDENTE |  |
| V2-F01-E21 | PostGIS no CI e no ambiente local: imagem Postgres com a extensão e testes espaciais em Postgres real | M | P1 | PENDENTE |  |
| V2-F01-E22 | PostGIS no provedor e no HML: CREATE EXTENSION permitido, esquema da extensão e conferência | S | P1 | PENDENTE |  |

### F02 API v1 e contratos (gate G02)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F02-E01 | Prefixo /v1 com espelho legado sem prefixo e data de remoção | M | P0 | PENDENTE |  |
| V2-F02-E02 | Migrar painel, campo e console para /v1 | M | P0 | PENDENTE |  |
| V2-F02-E03 | Esquema de erro padronizado e catálogo de códigos (inclui os de F00-E05) | S | P1 | PENDENTE |  |
| V2-F02-E04 | OpenAPI gerado dos esquemas Zod (rotas existentes; obrigatório nas novas) | L | P1 | PENDENTE |  |
| V2-F02-E05 | Teste de contrato cliente x rota no CI (generaliza F00-E23) | M | P0 | PENDENTE |  |
| V2-F02-E06 | X-App-Version, versão mínima por aplicativo e resposta 426 | M | P1 | PENDENTE |  |
| V2-F02-E07 | Idempotência: chave de criação do cliente e UNIQUE (ocorrência, evidência) | M | P1 | PENDENTE |  |
| V2-F02-E08 | Política de depreciação (Deprecation e Sunset, calendário de remoção do espelho) | S | P2 | PENDENTE |  |
| V2-F02-E09 | Ano do protocolo e datas do CSV pelo fuso do município | S | P1 | PENDENTE |  |

### F03 Identidade, vigência e contexto de ator (gate G03)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F03-E01 | ADR 0009: pessoa global com contas e vínculos por município; revoga D-02 e A-01 | S | P0 | PENDENTE |  |
| V2-F03-E02 | JWT enxuto: sub é a pessoa, org é o município ativo; papel e sp deixam de ser autoridade | M | P0 | PENDENTE |  |
| V2-F03-E03 | Vigência em TODA requisição autenticada via comTenant (uma consulta, leituras inclusive) | M | P0 | PENDENTE |  |
| V2-F03-E04 | Domínio de papel e de ator no banco (CREATE DOMAIN) e papel usuario_orgao (migration) | M | P0 | PENDENTE |  |
| V2-F03-E05 | Vínculo da pessoa com o órgão: orgao_vinculos temporal por município, RLS e FKs compostas (migration) | M | P0 | PENDENTE |  |
| V2-F03-E06 | Contexto do ator no banco: app.ator_tipo, app.ator_id, app.pessoa_id, app.ator_papel, app.orgao_atual (fail-closed) | L | P0 | PENDENTE |  |
| V2-F03-E07 | Audiência dc360-portal por conta e teste de plateia | S | P0 | PENDENTE |  |
| V2-F03-E08 | Funções SECURITY DEFINER de autenticação conferem o tenant; lista nominal no lugar do teto de 27 | M | P0 | PENDENTE |  |
| V2-F03-E09 | E-mail único entre pessoas ativas (índice parcial em pessoas) e conflito genérico | S | P1 | PENDENTE |  |
| V2-F03-E10 | Convite de uso único: a prefeitura convida pessoa nova ou existente e cria a conta no município | M | P0 | PENDENTE |  |
| V2-F03-E11 | MFA TOTP na pessoa, obrigatório para usuario_orgao, coordenador e administrador; reset por superior com trilha | M | P0 | PENDENTE |  |
| V2-F03-E12 | Manifesto rota x ação e default deny (rota sem ação declarada reprova) | L | P0 | PENDENTE |  |
| V2-F03-E13 | Matriz empírica papel x rota x método como teste fixo | M | P0 | PENDENTE |  |
| V2-F03-E14 | Recorte fail-closed para todo papel novo e cenário do upload do agente de outra equipe | M | P0 | PENDENTE |  |
| V2-F03-E15 | Migração de usuarios para pessoa e conta no município, com backfill sem perda e exceção nomeada ao isolamento | L | P0 | PENDENTE |  |
| V2-F03-E16 | Login em dois passos, escolha do município e troca de município com token e sessão novos | L | P0 | PENDENTE |  |
| V2-F03-E17 | Órgão externo no catálogo de cada município (concessionária, órgão estadual, bombeiros) e a mesma pessoa em vários municípios | M | P0 | PENDENTE |  |
| V2-F03-E18 | Teste de cruzamento: pessoa com conta em A e B nunca lê dado de A com token de B | M | P0 | PENDENTE |  |
| V2-F03-E19 | Cotas persistentes também na API de servidores (limite de taxa e falha de login entre instâncias) | M | P1 | PENDENTE |  |
| V2-F03-E20 | Trilha de sessão: login, saída e falha de login com IP e agente, e consulta da própria trilha | M | P1 | PENDENTE |  |
| V2-F03-E21 | Nível de sigilo por ocorrência, aplicado no banco | M | P1 | PENDENTE |  |

### F04 Isolamento intra-município e encaminhamento (gate G04)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F04-E01 | ADR 0010: isolamento por órgão (RLS fail-closed, dossiê, órgão nunca consulta ocorrencias) | S | P0 | PENDENTE |  |
| V2-F04-E02 | Encaminhamento: EXPANDIR providencias (estados, destinatário nominal, parent, prazo) (migration) | M | P0 | PENDENTE |  |
| V2-F04-E03 | Eventos append-only do encaminhamento e máquina de estados de 7 estados no shared | M | P0 | PENDENTE |  |
| V2-F04-E04 | Dossiê mínimo: snapshot imutável composto pela Defesa Civil no envio | M | P0 | PENDENTE |  |
| V2-F04-E05 | RLS por órgão fail-closed e teste Obras x Saúde | L | P0 | PENDENTE |  |
| V2-F04-E06 | Teste de catálogo: toda tabela com orgao_id tem policy fail-closed (estilo CA-06) | M | P0 | PENDENTE |  |
| V2-F04-E07 | UPDATE por coluna e resposta imutável no banco (elimina a corrida de providencias) | M | P0 | PENDENTE |  |
| V2-F04-E08 | Rotas do encaminhamento (Defesa Civil e órgão) com exigirPermissao e manifesto | L | P0 | PENDENTE |  |
| V2-F04-E09 | Busca, exportação e ofício leem só encaminhamentos do próprio órgão | M | P0 | PENDENTE |  |
| V2-F04-E10 | Relógio de prazo e lembretes em percentual do prazo (T12) | M | P1 | PENDENTE |  |
| V2-F04-E11 | Avisos e sino do órgão sem vazamento | M | P1 | PENDENTE |  |
| V2-F04-E12 | Ofício por link: manter sem vazar e registrar consulta (transição até o portal) | S | P1 | PENDENTE |  |
| V2-F04-E13 | Cenários negativos: ID trocado, URL de arquivo, encaminhamento encerrado, usuário movido, item não atribuído | M | P0 | PENDENTE |  |
| V2-F04-E14 | Prioridade do encaminhamento | S | P1 | PENDENTE |  |
| V2-F04-E15 | Competência do órgão por COBRADE e território como dado (a Defesa Civil escolhe, a competência sugere e valida) | M | P1 | PENDENTE |  |
| V2-F04-E16 | Cadeia de escalonamento por município acima do gestor do órgão, com lembretes e eventos append-only | M | P1 | PENDENTE |  |
| V2-F04-E17 | Devolução só antes do aceite (D-23): regra explícita, mensagem e testes de borda | S | P0 | PENDENTE |  |

### F05 Manifesto de dados e LGPD técnica (gate G05)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F05-E01 | Manifesto declarativo de tabelas (formato e local) | S | P0 | PENDENTE |  |
| V2-F05-E02 | Teste de catálogo nos dois sentidos (tabela sem classificação reprova) | M | P0 | PENDENTE |  |
| V2-F05-E03 | Classificar as tabelas atuais e novas (saída, eliminação, pessoal, retenção) | M | P0 | PENDENTE |  |
| V2-F05-E04 | Lista de tabelas de plataforma fora de tenant e sua política | S | P1 | PENDENTE |  |
| V2-F05-E05 | Saída e eliminação derivam do manifesto (fim das listas paralelas) | M | P0 | PENDENTE |  |
| V2-F05-E06 | Aceite versionado (tabela, API, revogação), sem texto jurídico | M | P1 | PENDENTE |  |
| V2-F05-E07 | Política de privacidade versionada (publicação, versão, URL estável) | S | P1 | PENDENTE |  |
| V2-F05-E08 | Pedidos de titular: fila, estados e exportação por titular | M | P1 | PENDENTE |  |
| V2-F05-E09 | Retenção configurável por município e classe (padrão vazio, jobs) | M | P1 | PENDENTE |  |
| V2-F05-E10 | Minimização e redação: tipoDescricao na trilha, mecanismo de anonimização | M | P0 | PENDENTE |  |
| V2-F05-E11 | Auditoria de acesso: ofício, fotos e dossiê geram consulta nominal | M | P0 | PENDENTE |  |
| V2-F05-E12 | Expurgo de IP e user-agent (sessões, recuperações, aberturas de ofício) | S | P1 | PENDENTE |  |
| V2-F05-E13 | CPF do cidadão: dado de alto valor (validação, cifra, hash, máscara, classificação) | M | P0 | PENDENTE |  |
| V2-F05-E14 | CPF: acesso auditado, retenção própria e saída por titular | M | P0 | PENDENTE |  |
| V2-F05-E15 | Expurgo de aparelho revogado (ficha de push) | S | P1 | PENDENTE |  |

### F06 Cadeia segura de arquivos (gate G06)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F06-E01 | ADR 0011: modelo de arquivos, classes, promoção e imutabilidade de prova | S | P0 | PENDENTE |  |
| V2-F06-E02 | Tabela arquivos e vínculos (migration) com RLS e FK composta | M | P0 | PENDENTE |  |
| V2-F06-E03 | Máquina de estados do arquivo e prefixos de quarentena e ativo | M | P0 | PENDENTE |  |
| V2-F06-E04 | Autorizar e confirmar: URL assinada com tamanho e tipo presos, validade curta, HEAD | M | P0 | PENDENTE |  |
| V2-F06-E05 | Validação por bytes: magic bytes e MIME real; tipos permitidos (imagem e vídeo) | M | P0 | PENDENTE |  |
| V2-F06-E06 | Limites de tamanho, dimensões, megapixels e duração; bombas de descompressão | M | P0 | PENDENTE |  |
| V2-F06-E07 | Recodificação JPEG sem EXIF e miniatura (anexos; nunca em prova de vistoria) | M | P0 | PENDENTE |  |
| V2-F06-E08 | Hashes do original e do armazenado; reverificação na emissão | M | P0 | PENDENTE |  |
| V2-F06-E09 | Cota por classe de origem (inclui video_cidadao) separada do teto de evidência de campo | M | P0 | PENDENTE |  |
| V2-F06-E10 | Órfãos e limpeza de quarentena | M | P1 | PENDENTE |  |
| V2-F06-E11 | evidencias imutável no banco após confirmação (UPDATE restrito) | M | P0 | PENDENTE |  |
| V2-F06-E12 | Promoção anexo -> evidência e incluir_no_laudo (foto avulsa não entra no laudo) | L | P0 | PENDENTE |  |
| V2-F06-E13 | Moderação e remoção com motivo (append-only) | M | P1 | PENDENTE |  |
| V2-F06-E14 | PDF do órgão: scanner antivírus e validação estrutural | L | P2 | PENDENTE |  |
| V2-F06-E15 | S3 real provado em HML: versionamento, SigV4, CORS do PUT | M | P0 | PENDENTE |  |
| V2-F06-E16 | Suíte de arquivos maliciosos (polyglot, bomba, tipo falso, EXIF) | M | P0 | PENDENTE |  |
| V2-F06-E17 | Classe de anexo da prefeitura: operador anexa arquivo à ocorrência no painel | M | P1 | PENDENTE |  |
| V2-F06-E18 | Vídeo do cidadão: inspeção segura do contêiner (MP4, MOV e HEVC) | M | P0 | PENDENTE |  |
| V2-F06-E19 | Vídeo do cidadão: derivado sem metadados (GPS) e poster | M | P0 | PENDENTE |  |
| V2-F06-E20 | Vídeo do cidadão: leitura assinada, moderação, remoção e barreiras (laudo e agente) | M | P0 | PENDENTE |  |
| V2-F06-E21 | Upload retomável por parte (foto de vistoria e vídeo) | L | P1 | PENDENTE |  |
| V2-F06-E22 | Foto de vistoria: compressão configurável no aparelho, sem recodificar a prova | M | P1 | PENDENTE |  |
| V2-F06-E23 | Antivírus da foto de vistoria sem recodificar | M | P1 | PENDENTE |  |

### F07 Workers e topologia operacional (gate G07)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F07-E01 | ADR 0012: modo de serviço (api, worker, publica) em uma imagem | S | P0 | PENDENTE |  |
| V2-F07-E02 | Fila de trabalho com lease no Postgres (SKIP LOCKED) | M | P0 | PENDENTE |  |
| V2-F07-E03 | Mover os cinco relógios para o worker | M | P0 | PENDENTE |  |
| V2-F07-E04 | Pipeline de arquivos executado pelo worker | L | P0 | PENDENTE |  |
| V2-F07-E05 | PDF e Chromium isolados (sandbox, sem JS no laudo) | L | P0 | PENDENTE |  |
| V2-F07-E06 | Pacote de saída fora do processo da API (streaming) | M | P1 | PENDENTE |  |
| V2-F07-E07 | /saude e métricas por serviço (semântica) | M | P1 | PENDENTE |  |
| V2-F07-E08 | Limites de recurso: pool, statement_timeout, memória e timeouts | S | P1 | PENDENTE |  |
| V2-F07-E09 | Configuração do app Fly da API pública (sem publicar) | S | P2 | PENDENTE |  |
| V2-F07-E10 | Transcodificação de vídeo em worker isolado (ffmpeg sem rede) | L | P0 | PENDENTE |  |
| V2-F07-E11 | Capacidade do worker de vídeo e custo de armazenamento por município | M | P1 | PENDENTE |  |
| V2-F07-E12 | Redundância de máquinas: duas por serviço e API sem estado de sessão em memória | M | P1 | PENDENTE |  |
| V2-F07-E13 | Deploy sem indisponibilidade (rolante, migration compatível) | M | P1 | PENDENTE |  |

### F08 Design system e fundamentos de UX (gate G08)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F08-E01 | Pacote design-tokens (fonte única) | M | P1 | PENDENTE |  |
| V2-F08-E02 | Geradores CSS e TS e arquivo gerado commitado para o console | M | P1 | PENDENTE |  |
| V2-F08-E03 | Paridade de tokens nas três superfícies atuais e contrato para as novas | M | P1 | PENDENTE |  |
| V2-F08-E04 | Pacote cliente-api (transporte, renovação de token, classificação de erro) | L | P1 | PENDENTE |  |
| V2-F08-E05 | Subpaths de exportação neutros do shared (sem permissões no binário do cidadão) | M | P1 | PENDENTE |  |
| V2-F08-E06 | Portões de acessibilidade e de design parametrizados por superfície | M | P1 | PENDENTE |  |
| V2-F08-E07 | Linguagem visual: identidade DC360 com nome, logotipo e cor do município; guia do portal e do cidadão | S | P1 | PENDENTE |  |
| V2-F08-E08 | Pacote i18n: catálogo de textos em pt-BR, en e es compartilhado pelas superfícies | M | P1 | PENDENTE |  |
| V2-F08-E09 | Formatação de data, número e fuso por idioma e por município | S | P1 | PENDENTE |  |
| V2-F08-E10 | Tema por município: derivação da cor de destaque e validação automática de contraste AA nos dois modos | M | P1 | PENDENTE |  |
| V2-F08-E11 | Entrega do tema do município pelos tokens: painel, app de campo e contrato para portal e cidadão | M | P1 | PENDENTE |  |
| V2-F08-E12 | Ponto de integração do VLibras nas superfícies web e no app | S | P2 | PENDENTE |  |
| V2-F08-E13 | Portão de qualidade visual e de texto: comando reutilizável por superfície, com capturas como prova | L | P0 | PENDENTE |  |

### F32 PostGIS e dados territoriais (gate G32)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F32-E01 | ADR do modelo territorial: camada comum x por município, convenção geográfica e PGlite sem PostGIS | S | P0 | PENDENTE |  |
| V2-F32-E02 | Extensão PostGIS na migration condicional, ponto geográfico e saúde espacial | M | P0 | PENDENTE |  |
| V2-F32-E03 | Código IBGE do município e malha municipal comum com resolução por função privilegiada | M | P0 | PENDENTE |  |
| V2-F32-E04 | Ponto geográfico e índice GiST nas ocorrências e vistorias | M | P1 | PENDENTE |  |
| V2-F32-E05 | Áreas do município: bairro, distrito, setor e área de risco com validação de geometria e versões | L | P0 | PENDENTE |  |
| V2-F32-E06 | Importação de áreas por GeoJSON e KML com prévia, relatório e idempotência | L | P1 | PENDENTE |  |
| V2-F32-E07 | Imóvel: cadastro mínimo e vínculo da ocorrência sem mesclar registros | M | P1 | PENDENTE |  |
| V2-F32-E08 | Busca por raio com teto, recorte e coincidência aproximada | M | P0 | PENDENTE |  |
| V2-F32-E09 | Consulta por imóvel e por área de risco, com coincidência exata ou aproximada | M | P0 | PENDENTE |  |
| V2-F32-E10 | Competência por área e áreas do ponto para a sugestão de destino | M | P1 | PENDENTE |  |
| V2-F32-E11 | Painel: consulta territorial por raio, imóvel e área no mapa | L | P1 | PENDENTE |  |
| V2-F32-E12 | Painel: gestão de áreas e importação com prévia | M | P1 | PENDENTE |  |
| V2-F32-E13 | App do agente: contexto territorial da tarefa guardado para uso sem sinal | M | P2 | PENDENTE |  |
| V2-F32-E14 | Troca do Haversine e do módulo geográfico em TypeScript: reconciliação com F10 e F16 | M | P1 | PENDENTE |  |
| V2-F32-E15 | Manifesto, saída, eliminação e retenção das tabelas territoriais | M | P0 | PENDENTE |  |
| V2-F32-E16 | Prova em Postgres real: isolamento espacial, divisa, plano de consulta e HML | M | P0 | PENDENTE |  |

### F09 Documentos oficiais V2 (gate G09)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F09-E01 | ADR 0013: documento emitido imutável e aprovação autenticada (sem chamar de assinatura) | S | P0 | PENDENTE |  |
| V2-F09-E02 | Montador único de dados do documento (rota e pacote de saída) | L | P0 | PENDENTE |  |
| V2-F09-E03 | Tabela documentos_emitidos append-only e versionamento (migration) | M | P0 | PENDENTE |  |
| V2-F09-E04 | Snapshot estruturado, versão do template e hash do PDF | M | P0 | PENDENTE |  |
| V2-F09-E05 | PDF final guardado como objeto de escrita única | M | P0 | PENDENTE |  |
| V2-F09-E06 | Estados rascunho, revisão, aprovação autenticada e emissão | M | P0 | PENDENTE |  |
| V2-F09-E07 | Registro de aprovação autenticada (usuário nominal, MFA, versão, hash, decisão) | M | P0 | PENDENTE |  |
| V2-F09-E08 | Políticas por município e tipo (exige aprovação, dupla) e cargo e registro profissional opcionais | M | P1 | PENDENTE |  |
| V2-F09-E09 | Substituição e cancelamento como eventos e histórico | M | P0 | PENDENTE |  |
| V2-F09-E10 | Reimpressão serve o PDF guardado; teste laudo de amanhã igual ao de hoje | M | P0 | PENDENTE |  |
| V2-F09-E11 | Pacote de saída usa o mesmo artefato guardado | M | P0 | PENDENTE |  |
| V2-F09-E12 | Retenção do documento emitido: classe própria e derivado redigido | M | P1 | PENDENTE |  |
| V2-F09-E13 | QR de validação de autenticidade (se aprovado no escopo) | S | P3 | PENDENTE |  |
| V2-F09-E14 | Marca d'água de validação: condição de saída | S | P1 | PENDENTE |  |
| V2-F09-E15 | PDF acessível (tagged) | M | P2 | PENDENTE |  |
| V2-F09-E16 | Catálogo de modelos de documento e habilitação por município e tipo de ocorrência | M | P1 | PENDENTE |  |
| V2-F09-E17 | Notificação ao responsável pelo imóvel como modelo versionado | M | P1 | PENDENTE |  |
| V2-F09-E18 | Relatório fotográfico avulso como modelo versionado | M | P1 | PENDENTE |  |
| V2-F09-E19 | ADR do provedor externo de assinatura: adaptador, custódia e nomenclatura | S | P1 | PENDENTE |  |
| V2-F09-E20 | Interface ProvedorDeAssinatura: adaptador injetável, provedor em memória e sandbox em HML | M | P1 | PENDENTE |  |
| V2-F09-E21 | Signatário nominal, tipos de assinatura e política por tipo de documento | M | P1 | PENDENTE |  |
| V2-F09-E22 | Envio do documento aprovado ao provedor, com MFA no ato e fila | L | P1 | PENDENTE |  |
| V2-F09-E23 | Retorno do PDF assinado e da prova por consulta do worker | M | P1 | PENDENTE |  |
| V2-F09-E24 | Guarda do PDF assinado como artefato imutável ligado ao emitido | M | P1 | PENDENTE |  |
| V2-F09-E25 | Validação posterior da assinatura guardada | S | P1 | PENDENTE |  |
| V2-F09-E26 | Falha, reenvio idempotente e expiração da solicitação | M | P1 | PENDENTE |  |
| V2-F09-E27 | Cota e custo por assinatura, por município | M | P1 | PENDENTE |  |
| V2-F09-E28 | Nomenclatura da interface: texto único e troca depois do parecer J8 | S | P2 | PENDENTE |  |

### F10 Consolidação do painel da prefeitura (gate G10)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F10-E01 | Telas de conta e segurança consolidadas (usuários, sessões, reset de MFA) | M | P1 | PENDENTE |  |
| V2-F10-E02 | Gestão de órgãos: cadastro com tipo e abrangência, órgão externo e desativação com regra de itens abertos | M | P1 | PENDENTE |  |
| V2-F10-E03 | Gestão de pessoas do órgão e vínculos: convidar pessoa nova ou já existente, papel no órgão e encerramento | M | P1 | PENDENTE |  |
| V2-F10-E04 | Encaminhamentos do lado da Defesa Civil: criar, compor dossiê, acompanhar | L | P0 | PENDENTE |  |
| V2-F10-E05 | Resposta do órgão: aceitar, pedir complemento, devolver e reencaminhar com um clique | M | P0 | PENDENTE |  |
| V2-F10-E06 | Caixa de pendências e escalonamento (cobrar, escalar pela cadeia do município) | M | P1 | PENDENTE |  |
| V2-F10-E07 | Documentos emitidos: lista, versões, aprovar, substituir e cancelar | M | P1 | PENDENTE |  |
| V2-F10-E08 | Pacote de saída e exportação: telas e estados | M | P1 | PENDENTE |  |
| V2-F10-E09 | Foto de perfil no painel: enviar, remover e mostrar (CP-18 decidido: construir) | S | P2 | PENDENTE |  |
| V2-F10-E10 | ErrorBoundary, estados vazios e de erro padrão | M | P1 | PENDENTE |  |
| V2-F10-E11 | Acessibilidade dinâmica (aria-live, foco em troca de rota, forced-colors) | M | P1 | PENDENTE |  |
| V2-F10-E12 | Build de produção sem PGlite, migrações e semente | M | P1 | PENDENTE |  |
| V2-F10-E13 | Encerramento com providência obrigatória em aberto | S | P1 | PENDENTE |  |
| V2-F10-E14 | Ofício por link x portal: decisão de transição | S | P2 | PENDENTE |  |
| V2-F10-E15 | Painel instalável na tela inicial (PWA): manifesto, ícones, tela de instalação e service worker mínimo | M | P1 | PENDENTE |  |
| V2-F10-E16 | Liberação do suporte assistido do fornecedor pelo administrador do município | M | P1 | PENDENTE |  |
| V2-F10-E17 | Competência do órgão: tipos COBRADE e território como dado | M | P1 | PENDENTE |  |
| V2-F10-E18 | Cadeia de escalonamento acima do gestor do órgão, por município | M | P1 | PENDENTE |  |
| V2-F10-E19 | Sugestão de destino por competência no envio do encaminhamento | M | P1 | PENDENTE |  |
| V2-F10-E20 | Prioridade da providência na tela (lacuna L9) | S | P1 | PENDENTE |  |
| V2-F10-E21 | Indicadores por órgão no painel da Defesa Civil, sem ranking | M | P2 | PENDENTE |  |
| V2-F10-E22 | Dívida de estilo: estilo inline, letter-spacing literal e HTML da API com cores literais, com portão de tokens | L | P2 | PENDENTE |  |
| V2-F10-E23 | Filtros do mapa e da lista por tipo, estado e severidade (lacuna L1) | S | P1 | PENDENTE |  |
| V2-F10-E24 | Duplicidade manual por coordenada, contato e janela configurável, com o LIKE do endereço corrigido (lacuna L3) | M | P1 | PENDENTE |  |
| V2-F10-E25 | Relatório de ocorrências em PDF e CSV com cabeçalho de filtros, município, data, responsável e fuso (lacuna L10) | M | P1 | PENDENTE |  |
| V2-F10-E26 | Precisão da coordenada da ocorrência guardada, com teto (lacuna L14) | S | P2 | PENDENTE |  |
| V2-F10-E27 | Motivo mínimo do encerramento e lista de motivos (lacuna L18) | S | P1 | PENDENTE |  |
| V2-F10-E28 | Edição dos dados do chamado com motivo e histórico (lacuna L22) | M | P1 | PENDENTE |  |
| V2-F10-E29 | Operador anexa arquivo à ocorrência no painel (lacuna L2, lado do painel) | M | P1 | PENDENTE |  |
| V2-F10-E30 | Minha atividade: cada pessoa consulta a própria trilha (lacuna L11, lado do painel) | M | P2 | PENDENTE |  |
| V2-F10-E31 | Nível de sigilo da ocorrência na tela (lacuna L12, lado do painel) | M | P2 | PENDENTE |  |
| V2-F10-E32 | Assinatura por provedor externo: pedir e acompanhar pela tela | M | P1 | PENDENTE |  |
| V2-F10-E33 | Modelos de documento: habilitação por município e tipo de ocorrência | M | P1 | PENDENTE |  |
| V2-F10-E34 | Reatribuição de encaminhamento e proteção de quem responde por item aberto | S | P1 | PENDENTE |  |
| V2-F10-E35 | Assinatura por provedor externo: baixar o assinado, validar depois e consumo da cota | S | P1 | PENDENTE |  |
| V2-F10-E36 | Notificação ao responsável pelo imóvel e relatório fotográfico avulso: telas de emissão | M | P1 | PENDENTE |  |

### F11 Portal das secretarias (gate G11)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F11-E01 | ADR 0014: apps/portal separada (domínio, CSP, sessão, audiência) | S | P0 | PENDENTE |  |
| V2-F11-E02 | Scaffold apps/portal (Vite, React, TypeScript), workspace, CI, tokens e catálogo de idiomas | M | P0 | PENDENTE |  |
| V2-F11-E03 | Domínio, deploy HML e CSP próprios | S | P0 | PENDENTE |  |
| V2-F11-E04 | Login do portal em dois passos: pessoa, depois município (audiência dc360-portal, sessão, refresh) | M | P0 | PENDENTE |  |
| V2-F11-E05 | MFA da pessoa (enrolamento, verificação, recuperação) | M | P0 | PENDENTE |  |
| V2-F11-E06 | Convite e aceite de vínculo (UI): pessoa nova e pessoa já existente | M | P0 | PENDENTE |  |
| V2-F11-E07 | Shell, navegação e tema (identidade DC360 e do município) | M | P1 | PENDENTE |  |
| V2-F11-E08 | Dashboard do órgão (contadores e indicadores do próprio órgão) | M | P1 | PENDENTE |  |
| V2-F11-E09 | Caixa de entrada de encaminhamentos (filtros, estados, município) | M | P0 | PENDENTE |  |
| V2-F11-E10 | Detalhe do encaminhamento: dossiê mínimo, linha do tempo e ações desabilitadas com motivo | M | P0 | PENDENTE |  |
| V2-F11-E11 | Aceite nominal e responsável | M | P0 | PENDENTE |  |
| V2-F11-E12 | Prazo e visibilidade do prazo (pausa em aguardando_dc) | S | P1 | PENDENTE |  |
| V2-F11-E13 | Resposta com anexos (upload da secretaria pela cadeia segura) | L | P0 | PENDENTE |  |
| V2-F11-E14 | Pedido de esclarecimento à Defesa Civil (aguardando_dc) | M | P1 | PENDENTE |  |
| V2-F11-E15 | Devolução com motivo e destino sugerido (só antes do aceite) | M | P0 | PENDENTE |  |
| V2-F11-E16 | Histórico do encaminhamento (eventos sem vazamento) | S | P1 | PENDENTE |  |
| V2-F11-E17 | Notificações por município (e-mail e sino) | M | P1 | PENDENTE |  |
| V2-F11-E18 | Busca no portal restrita ao órgão | S | P2 | PENDENTE |  |
| V2-F11-E19 | Gestão de usuários do órgão pelo gestor (vínculos) | M | P1 | PENDENTE |  |
| V2-F11-E20 | Estados vazios, erro, sessão expirada, vínculo encerrado e conta desativada | S | P1 | PENDENTE |  |
| V2-F11-E21 | Acessibilidade do portal (axe, teclado, leitor de tela) | M | P1 | PENDENTE |  |
| V2-F11-E22 | E2E dos fluxos C e D | M | P0 | PENDENTE |  |
| V2-F11-E23 | Seletor e troca de município e órgão no shell | M | P0 | PENDENTE |  |
| V2-F11-E24 | Órgão externo como usuário do portal (concessionária, órgão estadual) | M | P1 | PENDENTE |  |
| V2-F11-E25 | Teste de cruzamento de municípios na interface | M | P0 | PENDENTE |  |
| V2-F11-E26 | Portal instalável (PWA): manifesto, ícones e service worker sem cache de dado | S | P1 | PENDENTE |  |
| V2-F11-E27 | Idioma do portal (pt-BR, en, es) | M | P1 | PENDENTE |  |
| V2-F11-E28 | Competência do órgão e escalonamento na caixa, no detalhe e no histórico | S | P1 | PENDENTE |  |
| V2-F11-E29 | Caixa e sino de todos os municípios (consolidado no cliente) | M | P1 | PENDENTE |  |
| V2-F11-E30 | Botão de Libras (VLibras) no portal | S | P2 | PENDENTE |  |

### F12 Homologação do portal com secretaria real (gate G12)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F12-E01 | Preparar HML sintético e roteiro de homologação (cenários, estados, prazos) | S | P0 | PENDENTE |  |
| V2-F12-E02 | Sessões com a secretaria piloto: estados, linguagem, aceite, devolução, dossiê, anexos, MFA, notificações | M | P0 | PENDENTE |  |
| V2-F12-E03 | Calibrar prazos, pausa do prazo e lembretes | S | P1 | PENDENTE |  |
| V2-F12-E04 | Validar o conteúdo do dossiê mínimo com o município | S | P0 | PENDENTE |  |
| V2-F12-E05 | Ajustes decorrentes e re-teste (escopo limitado) | M | P0 | PENDENTE |  |
| V2-F12-E06 | Decidir ofício por link e atrito do MFA | S | P1 | PENDENTE |  |
| V2-F12-E07 | Relatório de homologação e decisão de liberar o cidadão | S | P0 | PENDENTE |  |
| V2-F12-E08 | Cenários do órgão externo multi-município, instalação, idioma e cor do município | M | P1 | PENDENTE |  |

### F13 Reinspeção e retorno ao campo (gate G13)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F13-E01 | Aresta providencia_pendente -> em_campo no shared e no banco (motivo, permissão, vínculo) | M | P0 | PENDENTE |  |
| V2-F13-E02 | Rodada de vistoria: modelo, prazo por rodada, documento da vistoria vigente (migration) | M | P0 | PENDENTE |  |
| V2-F13-E03 | API de reinspeção e vínculo ao encaminhamento | M | P0 | PENDENTE |  |
| V2-F13-E04 | Painel: determinar reinspeção a partir da resposta | M | P0 | PENDENTE |  |
| V2-F13-E05 | Minimização: tarefa ao agente com motivo e resumo, sem histórico da secretaria | M | P0 | PENDENTE |  |
| V2-F13-E06 | Reabrir ocorrência encerrada: aresta encerrada -> triagem, motivo, permissão e prazo do município | M | P0 | PENDENTE |  |
| V2-F13-E07 | Indicadores de prazo e trilha por rodada | S | P1 | PENDENTE |  |
| V2-F13-E08 | E2E do fluxo E (secretaria, resposta, reinspeção, agente) | M | P0 | PENDENTE |  |
| V2-F13-E09 | Fato novo depois do prazo: ocorrência vinculada com tipo e motivo, vínculo imutável | M | P0 | PENDENTE |  |
| V2-F13-E10 | Painel: reabrir ocorrência encerrada, prazo restante e fato novo | M | P0 | PENDENTE |  |
| V2-F13-E11 | Reabertura: rodada nova, documento emitido intacto e E2E da API | M | P0 | PENDENTE |  |

### F14 Consolidação do app do agente (gate G14)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F14-E01 | Saída a campo no app: declarar, prorrogar, retorno e /minha | L | P0 | PENDENTE |  |
| V2-F14-E02 | Sessão, logout e fila: rascunhos e conflitos (estende F00-E15) | M | P1 | PENDENTE |  |
| V2-F14-E03 | Conflito de sincronização (CA-05): tela de revisão | M | P1 | PENDENTE |  |
| V2-F14-E04 | Criptografia local do SQLite e das fotos | L | P1 | PENDENTE |  |
| V2-F14-E05 | Push real (APNs e FCM) e aparelhos multiaplicativo | M | P1 | PENDENTE |  |
| V2-F14-E06 | Sincronização em segundo plano | M | P2 | PENDENTE |  |
| V2-F14-E07 | ErrorBoundary e crash reporting | M | P1 | PENDENTE |  |
| V2-F14-E08 | Versão mínima e compatibilidade (X-App-Version, 426, OTA se aprovada) | M | P1 | PENDENTE |  |
| V2-F14-E09 | Reinspeção na experiência do agente | M | P0 | PENDENTE |  |
| V2-F14-E10 | Acessibilidade do app (VoiceOver, TalkBack, fonte 200%, toque 44 e 48) | L | P1 | PENDENTE |  |
| V2-F14-E11 | Builds EAS reais (bundle id definitivo; HML e produção) | M | P0 | PENDENTE |  |
| V2-F14-E12 | Prova em Android físico e iOS físico com artefatos | L | P0 | PENDENTE |  |
| V2-F14-E13 | Reabrir a prova da reinspeção (F13-E08) em aparelho | S | P0 | PENDENTE |  |
| V2-F14-E14 | Aceite explícito da tarefa, devolução antes do prazo e tarefa por pessoa | M | P1 | PENDENTE |  |
| V2-F14-E15 | Limpeza de foto e assinatura depois da sincronização e guarda de espaço livre | M | P2 | PENDENTE |  |
| V2-F14-E16 | Segundo fator do agente: tela de código, ativação e recuperação no app | M | P1 | PENDENTE |  |
| V2-F14-E17 | Agente sem equipe: histórico e mensagem em vez de tela vazia | S | P1 | PENDENTE |  |
| V2-F14-E18 | Foto e assinatura obrigatórias também no servidor e no shared, sem destruir coleta offline | M | P1 | PENDENTE |  |
| V2-F14-E19 | Aditamento avulso de vistoria por texto, com justificativa versionada | L | P1 | PENDENTE |  |
| V2-F14-E20 | Fila de revisão do coordenador: aditamentos e coletas bloqueadas | M | P1 | PENDENTE |  |
| V2-F14-E21 | Mapa offline no app: pacote da área de atuação e pontos sem sinal | L | P2 | PENDENTE |  |
| V2-F14-E22 | Foto de vistoria no aparelho: integração e prova do envio retomável, da qualidade e da varredura | M | P1 | PENDENTE |  |

### F33 Configuração por município, checklist por tipo e importação (gate G33)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F33-E01 | ADR da configuração versionada: versão imutável, publicação e versão aplicada | S | P0 | PENDENTE |  |
| V2-F33-E02 | Versões, rascunho e trilha de versão da configuração (migration), com a versão 1 de cada município | L | P0 | PENDENTE |  |
| V2-F33-E03 | Tipos, severidades e prazos por município: shared, banco e triagem | M | P0 | PENDENTE |  |
| V2-F33-E04 | Publicação de versão sem quebrar ocorrência em andamento, com trilha de versão | M | P0 | PENDENTE |  |
| V2-F33-E05 | Checklist por tipo com perguntas condicionais: modelo no shared e no banco | L | P0 | PENDENTE |  |
| V2-F33-E06 | Sincronização valida a vistoria contra a versão do checklist que o agente respondeu | M | P0 | PENDENTE |  |
| V2-F33-E07 | Entrega do checklist ao aparelho e avaliador offline em packages/campo | M | P0 | PENDENTE |  |
| V2-F33-E08 | Tela do checklist condicional no app do agente | M | P0 | PENDENTE |  |
| V2-F33-E09 | Formulário de abertura por tipo: campos extras versionados | M | P1 | PENDENTE |  |
| V2-F33-E10 | Textos do modelo de documento por município, versionados no snapshot | M | P1 | PENDENTE |  |
| V2-F33-E11 | Painel de configuração: rascunho, comparação, publicação e histórico | L | P1 | PENDENTE |  |
| V2-F33-E12 | Importação por CSV: modelo, envio e prévia com validação linha a linha | L | P1 | PENDENTE |  |
| V2-F33-E13 | Importação por CSV: aplicar o lote com idempotência, protocolo e versão aplicada | L | P1 | PENDENTE |  |
| V2-F33-E14 | Desfazer o lote pelo encerramento com motivo, sem apagar | M | P1 | PENDENTE |  |
| V2-F33-E15 | Painel de importação: enviar, conferir a prévia, aplicar e desfazer | M | P1 | PENDENTE |  |
| V2-F33-E16 | Manifesto, saída, eliminação, retenção e isolamento das tabelas de configuração e importação | M | P0 | PENDENTE |  |

### F15 Fundação do canal cidadão (gate G15)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F15-E01 | ADR 0015: realm do cidadão (audiência, segredo, tabelas, papel de banco decidido) | S | P0 | PENDENTE |  |
| V2-F15-E02 | Migrations: cidadaos (com CPF), sessões, aparelhos e aceites versionados | M | P0 | PENDENTE |  |
| V2-F15-E03 | Audiência dc360-cidadao e teste de plateia | M | P0 | PENDENTE |  |
| V2-F15-E04 | E-mail OTP: primeiro provedor da interface, código, expiração, tentativas e hash | M | P0 | PENDENTE |  |
| V2-F15-E05 | Sessões do cidadão: refresh rotativo e revogação | M | P0 | PENDENTE |  |
| V2-F15-E06 | RLS do cidadão (cidadao_id = ator_id) e negativos | M | P0 | PENDENTE |  |
| V2-F15-E07 | Funções SECURITY DEFINER do login do cidadão e lista nominal | M | P0 | PENDENTE |  |
| V2-F15-E08 | API pública separada (app Fly), CORS e cabeçalhos | M | P0 | PENDENTE |  |
| V2-F15-E09 | Rate limit camada 1: limite grosseiro na borda ou infra | M | P0 | PENDENTE |  |
| V2-F15-E10 | Rate limit camada 2: cotas persistentes do cidadão (reuso de consumir_cota) | M | P0 | PENDENTE |  |
| V2-F15-E11 | Bloqueio manual de conta com efeito imediato | S | P1 | PENDENTE |  |
| V2-F15-E12 | Política de versão do app do cidadão | S | P1 | PENDENTE |  |
| V2-F15-E13 | Opt-in do município (canal_cidadao_habilitado, codigo_ibge) e grants do console | M | P0 | PENDENTE |  |
| V2-F15-E14 | E-mail com domínio verificado para o OTP | S | P0 | PENDENTE |  |
| V2-F15-E15 | Aceite e política mínima para beta (termos e finalidade do CPF) | S | P0 | PENDENTE |  |
| V2-F15-E16 | CPF da conta do cidadão: cadastro, validação, unicidade e cpf_pendente | M | P0 | PENDENTE |  |
| V2-F15-E17 | Expurgo de aparelho revogado do cidadão (cidadao_aparelhos na função da F05-E15) | S | P1 | PENDENTE |  |
| V2-F15-E18 | Interface de provedores de identidade do cidadão (extensível, OTP primeiro) | M | P0 | PENDENTE |  |

### F16 Domínio de relatos e triagem (modelo) (gate G16)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F16-E01 | ADR 0016: relato como entidade própria; protocolos separados | S | P0 | PENDENTE |  |
| V2-F16-E02 | Migrations: relatos, relato_eventos, relato_notas_internas, relato_vinculos | M | P0 | PENDENTE |  |
| V2-F16-E03 | Protocolo próprio (sequência por município e ano, prefixo distinto) | M | P0 | PENDENTE |  |
| V2-F16-E04 | Máquina de estados e resoluções (shared e banco) | M | P0 | PENDENTE |  |
| V2-F16-E05 | Resolução do município por polígono do IBGE com PostGIS (candidatos na divisa) | M | P0 | PENDENTE |  |
| V2-F16-E06 | Contrato geográfico do relato: constantes e validação no cliente, sobre o ponto da F32 | M | P1 | PENDENTE |  |
| V2-F16-E07 | Duplicidade como sinal à triagem (distância e janela com PostGIS) | M | P1 | PENDENTE |  |
| V2-F16-E08 | Nota interna x mensagem pública (tabelas e API) | M | P0 | PENDENTE |  |
| V2-F16-E09 | Modelo de leitura do cidadão por lista de inclusão e teste de contrato | M | P0 | PENDENTE |  |
| V2-F16-E10 | Conversão em ocorrência (relato_origem_id; protocolo oficial só aqui) | L | P0 | PENDENTE |  |
| V2-F16-E11 | Métricas oficiais não contam relato (resumo, CSV, prestação de contas) | M | P0 | PENDENTE |  |
| V2-F16-E12 | Anexos de relato pela cadeia segura (fotos e 1 vídeo) | M | P0 | PENDENTE |  |
| V2-F16-E13 | Expiração de relato (job no worker) | S | P2 | PENDENTE |  |
| V2-F16-E14 | Manifesto das tabelas novas e retenção | S | P0 | PENDENTE |  |
| V2-F16-E15 | Negativos: relato não vira evidência nem laudo e não consome protocolo oficial | M | P0 | PENDENTE |  |
| V2-F16-E16 | Relato identificado: CPF copiado da conta, cifrado e preso à linha | M | P0 | PENDENTE |  |

### F17 App do cidadão (gate G17)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F17-E01 | ADR 0017: apps/cidadao (Expo, bundle id, EAS, fora do workspaces) | S | P0 | PENDENTE |  |
| V2-F17-E02 | Scaffold, tokens, tema, idiomas e ErrorBoundary | M | P0 | PENDENTE |  |
| V2-F17-E03 | Pacote upload-core extraído do campo (segundo consumidor real) | M | P1 | PENDENTE |  |
| V2-F17-E04 | Login por e-mail OTP | M | P0 | PENDENTE |  |
| V2-F17-E05 | Home e estados vazios | S | P1 | PENDENTE |  |
| V2-F17-E06 | Novo relato: tipo COBRADE e local (GPS, mapa, endereço) | L | P0 | PENDENTE |  |
| V2-F17-E07 | Descrição e fotos (limites T24) | M | P0 | PENDENTE |  |
| V2-F17-E08 | Revisão e envio idempotente com rascunho local | M | P0 | PENDENTE |  |
| V2-F17-E09 | Protocolo e confirmação | S | P0 | PENDENTE |  |
| V2-F17-E10 | Acompanhamento (etapas padrão, protocolos) | M | P0 | PENDENTE |  |
| V2-F17-E11 | Complemento a pedido da triagem | M | P1 | PENDENTE |  |
| V2-F17-E12 | Encerramento e histórico | S | P1 | PENDENTE |  |
| V2-F17-E13 | Push do cidadão (aparelho sem usuário) | M | P1 | PENDENTE |  |
| V2-F17-E14 | Aceite e política dentro do app | S | P0 | PENDENTE |  |
| V2-F17-E15 | Acessibilidade nativa, idiomas e VLibras (VoiceOver, TalkBack, fonte 200%, rotação) | L | P1 | PENDENTE |  |
| V2-F17-E16 | Crash reporting e telemetria sem dado pessoal | M | P1 | PENDENTE |  |
| V2-F17-E17 | Builds internos (TestFlight e teste interno do Google Play) | M | P0 | PENDENTE |  |
| V2-F17-E18 | E2E do app (fluxo feliz e erros) | M | P1 | PENDENTE |  |
| V2-F17-E19 | Pedido de acesso, correção e exclusão de conta dentro do app | M | P1 | PENDENTE |  |
| V2-F17-E20 | CPF no relato identificado: campo, validação e máscara | M | P0 | PENDENTE |  |

### F18 Triagem no painel (gate G18)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F18-E01 | Caixa de triagem: lista, filtros e estados | M | P0 | PENDENTE |  |
| V2-F18-E02 | Assumir relato | S | P0 | PENDENTE |  |
| V2-F18-E03 | Classificar tipo e prioridade | S | P1 | PENDENTE |  |
| V2-F18-E04 | Pedir complemento (mensagem pública) | M | P0 | PENDENTE |  |
| V2-F18-E05 | Vincular a relato ou ocorrência existente (duplicidade) | M | P1 | PENDENTE |  |
| V2-F18-E06 | Rejeitar com motivo e marcar fora da jurisdição | M | P0 | PENDENTE |  |
| V2-F18-E07 | Converter em ocorrência com descrição operacional escrita pela triagem | M | P0 | PENDENTE |  |
| V2-F18-E08 | Nota interna e mensagem ao cidadão em campos separados | S | P0 | PENDENTE |  |
| V2-F18-E09 | Bloqueio de conta e moderação | M | P1 | PENDENTE |  |
| V2-F18-E10 | Acessibilidade, idiomas e estados da triagem | M | P1 | PENDENTE |  |
| V2-F18-E11 | E2E dos fluxos F e G | M | P0 | PENDENTE |  |
| V2-F18-E12 | Aviso de relato novo para a triagem (sino e painel) | S | P1 | PENDENTE |  |
| V2-F18-E13 | CPF do solicitante na triagem: máscara e revelação com finalidade | S | P0 | PENDENTE |  |

### F34 Canal do cidadão ampliado (gate G34)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F34-E01 | ADR do canal ampliado: conversa sem tempo real, vídeo, provedores e minimização | S | P0 | PENDENTE |  |
| V2-F34-E02 | Habilitação de vídeo e conversa por município (padrão desligado) | M | P0 | PENDENTE |  |
| V2-F34-E03 | Vídeo no app: consentimento, captura de até 30 s e alternativa em texto | L | P0 | PENDENTE |  |
| V2-F34-E04 | Vídeo: envio retomável por partes e estados do processamento | L | P0 | PENDENTE |  |
| V2-F34-E05 | Conversa por relato: tabelas, limites e RLS (migration) | M | P0 | PENDENTE |  |
| V2-F34-E06 | Conversa: API do cidadão (enviar, consultar, marcar como lida) | M | P0 | PENDENTE |  |
| V2-F34-E07 | Conversa: API da triagem, aviso no sino e push ao cidadão | M | P0 | PENDENTE |  |
| V2-F34-E08 | Conversa no app: mensagens, fotos, não lidas e consulta sem temporizador | L | P1 | PENDENTE |  |
| V2-F34-E09 | Painel: blocos Vídeo e Conversa no detalhe do relato | L | P1 | PENDENTE |  |
| V2-F34-E10 | Moderação do vídeo e da conversa: ocultar, encerrar e remover | M | P1 | PENDENTE |  |
| V2-F34-E11 | Antiabuso do canal ampliado em duas camadas: borda e cotas persistentes | M | P0 | PENDENTE |  |
| V2-F34-E12 | Provedores de login: lista fechada, vínculo seguro e desvínculo | M | P0 | PENDENTE |  |
| V2-F34-E13 | Login com gov.br (OIDC com PKCE), com o CPF verificado | L | P1 | PENDENTE |  |
| V2-F34-E14 | CPF verificado prevalece sobre o CPF só informado (disputa sem fusão) | M | P1 | PENDENTE |  |
| V2-F34-E15 | Login por SMS: porta de provedor, código de uso único e teto de custo | L | P2 | PENDENTE |  |
| V2-F34-E16 | Login social: Google e Apple por token de identidade | L | P2 | PENDENTE |  |
| V2-F34-E17 | App: entrada por provedor, CPF vindo do gov.br e vínculo em Minha conta | L | P1 | PENDENTE |  |
| V2-F34-E18 | Minimização: vídeo, conversa, telefone e identidade fora do agente, do laudo e do log | M | P0 | PENDENTE |  |
| V2-F34-E19 | Manifesto, trilha, retenção e saída do titular do canal ampliado | M | P0 | PENDENTE |  |
| V2-F34-E20 | E2E do canal ampliado em HML e prova em aparelho | L | P0 | PENDENTE |  |

### F19 Integração cidadão, ocorrência e campo (gate G19)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F19-E01 | Modelo de leitura do agente: lista de inclusão de campos do relato convertido | M | P0 | PENDENTE |  |
| V2-F19-E02 | Descrição operacional e coordenada declarada marcada | S | P0 | PENDENTE |  |
| V2-F19-E03 | Contato só com flag e decisão J6 | S | P1 | PENDENTE |  |
| V2-F19-E04 | Fotos, vídeo e conversa do cidadão não descem; ficam no painel | S | P0 | PENDENTE |  |
| V2-F19-E05 | Testes negativos no payload do agente | M | P0 | PENDENTE |  |
| V2-F19-E06 | Campo: exibir origem relato com coordenada declarada | M | P1 | PENDENTE |  |
| V2-F19-E07 | E2E do fluxo H (relato convertido para o agente) | M | P0 | PENDENTE |  |

### F29 Incidentes e abrigos (gate G29)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F29-E01 | ADR do modo incidente e do local: vocabulário, ações e fronteiras | S | P0 | PENDENTE |  |
| V2-F29-E02 | Migration: incidentes, objetivos, vínculo com ocorrência e eventos | M | P0 | PENDENTE |  |
| V2-F29-E03 | Ciclo de vida do incidente: máquina de estados e rotas | M | P0 | PENDENTE |  |
| V2-F29-E04 | Agrupar e desagrupar ocorrências sem alterá-las (RN-08) | M | P0 | PENDENTE |  |
| V2-F29-E05 | Quadro de situação versionado e linha do tempo operacional (INC-02) | M | P1 | PENDENTE |  |
| V2-F29-E06 | Equipes e turnos do incidente (INC-03, parte 1) | M | P1 | PENDENTE |  |
| V2-F29-E07 | Tarefas do incidente com eventos append-only (INC-03, parte 2) | M | P1 | PENDENTE |  |
| V2-F29-E08 | Presença: check-in e check-out no servidor (INC-03, parte 3) | M | P1 | PENDENTE |  |
| V2-F29-E09 | Locais e abrigos: cadastro, ocupação e necessidades (ABR-01) | L | P0 | PENDENTE |  |
| V2-F29-E10 | Painel: lista, criação e detalhe do incidente com agrupamento | L | P1 | PENDENTE |  |
| V2-F29-E11 | Painel: quadro, linha do tempo, equipes, turnos, tarefas e disponibilidade | L | P1 | PENDENTE |  |
| V2-F29-E12 | Painel: abrigos, ocupação, necessidades e camada no mapa | M | P1 | PENDENTE |  |
| V2-F29-E13 | App do agente, núcleo offline: presença, ocupação e evento de tarefa na fila | L | P0 | PENDENTE |  |
| V2-F29-E14 | App do agente: telas de incidente, tarefas, presença e abrigo | L | P1 | PENDENTE |  |
| V2-F29-E15 | Relatório de situação por período, imutável e com PDF guardado (INC-04) | M | P1 | PENDENTE |  |
| V2-F29-E16 | Manifesto de dados, retenção, saída e eliminação das tabelas de incidente e abrigo | M | P0 | PENDENTE |  |
| V2-F29-E17 | Isolamento entre municípios, equipes e papéis em todas as rotas e tabelas da F29 | M | P0 | PENDENTE |  |
| V2-F29-E18 | E2E do fluxo de ativação de emergência e prova em aparelho físico | M | P0 | PENDENTE |  |

### F30 Logística humanitária (gate G30)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F30-E01 | ADR do razão de estoque: saldo derivado, ajuste aprovado e política do offline | S | P0 | PENDENTE |  |
| V2-F30-E02 | Locais de logística: depósitos, pontos de coleta, horário, responsáveis e permissões (LOG-01) | M | P1 | PENDENTE |  |
| V2-F30-E03 | Catálogo: categorias, itens, unidades e lotes (LOG-02, modelo) | M | P1 | PENDENTE |  |
| V2-F30-E04 | Razão de movimentos e saldo derivado (RN-09, LOG-04 núcleo) | L | P0 | PENDENTE |  |
| V2-F30-E05 | Entrada, transferência com trânsito e separação (LOG-02 e LOG-04) | M | P0 | PENDENTE |  |
| V2-F30-E06 | Ajuste de estoque com motivo e aprovação de outra pessoa (RN-09) | M | P0 | PENDENTE |  |
| V2-F30-E07 | QR code e código de barras com entrada manual sempre possível (LOG-03) | M | P1 | PENDENTE |  |
| V2-F30-E08 | Necessidades, promessas de doação e cobertura (LOG-05, modelo e consulta) | M | P1 | PENDENTE |  |
| V2-F30-E09 | Cargas, rotas, entregas e prova de entrega no servidor (LOG-06) | L | P0 | PENDENTE |  |
| V2-F30-E10 | Kits permanentes, inventário e simulados durante o ano (LOG-07, servidor) | L | P1 | PENDENTE |  |
| V2-F30-E11 | Alertas de validade, estoque mínimo, divergência e inventário atrasado | M | P1 | PENDENTE |  |
| V2-F30-E12 | Painel: locais, itens, saldo, movimentos, ajustes e etiquetas | L | P1 | PENDENTE |  |
| V2-F30-E13 | Painel: cobertura, doações, cargas, entregas, kits, inventário e alertas | L | P1 | PENDENTE |  |
| V2-F30-E14 | App do agente, núcleo offline: movimento, entrega e contagem na fila | L | P0 | PENDENTE |  |
| V2-F30-E15 | App do agente: telas de estoque, leitura de código, entrega com assinatura e contagem | L | P1 | PENDENTE |  |
| V2-F30-E16 | Relatórios de logística, comprovante de entrega e contingência (RNF-15) | M | P1 | PENDENTE |  |
| V2-F30-E17 | Manifesto, minimização, saída, eliminação e isolamento das tabelas de logística | L | P0 | PENDENTE |  |
| V2-F30-E18 | E2E do fluxo de suprimentos humanitários e prova em aparelho físico | M | P0 | PENDENTE |  |

### F31 Integrações externas oficiais (gate G31)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F31-E01 | ADR das integrações externas: porta única, adaptadores, segredo, entrada assinada e rede segura | S | P0 | PENDENTE |  |
| V2-F31-E02 | Núcleo comum: resultado tipado, tempo limite, circuit breaker e rede segura | M | P0 | PENDENTE |  |
| V2-F31-E03 | Configuração por município e segredo cifrado (migration) | M | P0 | PENDENTE |  |
| V2-F31-E04 | Trilha append-only de toda chamada de saída e de entrada (migration) | M | P0 | PENDENTE |  |
| V2-F31-E05 | Fila de saída, idempotência e reenvio com limite (migration e worker) | L | P0 | PENDENTE |  |
| V2-F31-E06 | Webhook de entrada assinado, com verificação e resposta uniforme (migration) | L | P0 | PENDENTE |  |
| V2-F31-E07 | WhatsApp: porta de mensagem, modelos de conteúdo mínimo e adaptadores de teste | M | P1 | PENDENTE |  |
| V2-F31-E08 | WhatsApp: consentimento, telefone cifrado e revogação (migration e telas) | M | P1 | PENDENTE |  |
| V2-F31-E09 | WhatsApp: adaptador oficial, modelos aprovados e estado de entrega | L | P1 | PENDENTE |  |
| V2-F31-E10 | WhatsApp: recebimento, verificação do provedor, parada e orientação (sem relato) | M | P1 | PENDENTE |  |
| V2-F31-E11 | Camadas GIS: importação de GeoJSON e KML pela cadeia de arquivos (migration e worker) | L | P1 | PENDENTE |  |
| V2-F31-E12 | Camadas GIS: WMS por referência, com imagem buscada pelo servidor | M | P1 | PENDENTE |  |
| V2-F31-E13 | Camadas no mapa do painel: ligar, legenda, atribuição e lista alternativa | M | P1 | PENDENTE |  |
| V2-F31-E14 | Cemaden: confirmação documentada, porta de avisos e exibição com origem e hora | M | P2 | PENDENTE |  |
| V2-F31-E15 | S2ID: porta, registro canônico e sandbox simulado, ativação só com credenciamento | L | P2 | PENDENTE |  |
| V2-F31-E16 | SEI: porta de processo eletrônico, envio do documento emitido e sandbox simulado | M | P2 | PENDENTE |  |
| V2-F31-E17 | Defesa Civil Alerta: porta, aprovação por segunda pessoa, simulação e sandbox | L | P2 | PENDENTE |  |
| V2-F31-E18 | Tela de integrações no painel e liberação e leitura no console (migration) | L | P1 | PENDENTE |  |
| V2-F31-E19 | LGPD das integrações: inventário, subprocessadores, manifesto e teste de documentação | M | P1 | PENDENTE |  |
| V2-F31-E20 | Suíte de contrato, falha injetada, varredura de segredo e prova de isolamento | L | P0 | PENDENTE |  |

### F35 Idiomas, VLibras e identidade visual por município (gate G35)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F35-E01 | ADR de idiomas e identidade por município: escopo, resolução e limites | S | P0 | PENDENTE |  |
| V2-F35-E02 | Identidade do município: colunas, API e validação AA na gravação | M | P0 | PENDENTE |  |
| V2-F35-E03 | Logotipo pela cadeia de arquivos: tipos, SVG recusado, tamanho e derivado | M | P0 | PENDENTE |  |
| V2-F35-E04 | Painel: tela Identidade do município com prévia e prova de contraste | M | P1 | PENDENTE |  |
| V2-F35-E05 | Identidade no painel e no portal: cabeçalho, tema e troca de município | M | P1 | PENDENTE |  |
| V2-F35-E06 | Identidade no app de campo: tema, logotipo e cache offline | M | P1 | PENDENTE |  |
| V2-F35-E07 | Identidade no app do cidadão: município resolvido, protocolo e acompanhamento | M | P1 | PENDENTE |  |
| V2-F35-E08 | Documentos oficiais: cabeçalho com logotipo e nome, congelado no snapshot | M | P1 | PENDENTE |  |
| V2-F35-E09 | Idioma: preferência por usuário, município, aparelho e cidadão | M | P1 | PENDENTE |  |
| V2-F35-E10 | E-mail, SMS e push nos três idiomas | M | P1 | PENDENTE |  |
| V2-F35-E11 | Tradução completa e revisada das telas: pendentes.json vazio | L | P0 | PENDENTE |  |
| V2-F35-E12 | VLibras nas telas web e nos apps: lista de telas, chave e CSP | M | P2 | PENDENTE |  |
| V2-F35-E13 | Console: ver a identidade e restaurar o tema DC360 (suporte) | S | P3 | PENDENTE |  |
| V2-F35-E14 | E2E de idiomas e identidade: cinco superfícies, três idiomas, claro e escuro | L | P0 | PENDENTE |  |

### F20 Console DC360 V2 (gate G20)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F20-E01 | ADR 0018: fornecedor x prefeitura; suporte assistido, sem impersonation | S | P1 | PENDENTE |  |
| V2-F20-E02 | Reemissão de acesso do único administrador (com trilha) | M | P1 | PENDENTE |  |
| V2-F20-E03 | Contato institucional por município (coluna, grants, teste de colunas) | S | P1 | PENDENTE |  |
| V2-F20-E04 | Suspensão com aviso ao município; eliminação agendada não suspende na hora | M | P0 | PENDENTE |  |
| V2-F20-E05 | Auditoria própria do console (tabela append-only) | M | P1 | PENDENTE |  |
| V2-F20-E06 | Operador do console: endurecer a confiança em app.console_operador | M | P1 | PENDENTE |  |
| V2-F20-E07 | Métricas agregadas incluindo portal e cidadão; habilitação do canal visível | M | P2 | PENDENTE |  |
| V2-F20-E08 | Pacote de diagnóstico sem dado pessoal | M | P2 | PENDENTE |  |
| V2-F20-E09 | Operação técnica por pedido de titular pelo console, sob instrução do município | M | P2 | PENDENTE |  |
| V2-F20-E10 | Limite de taxa da porta do console por IP de borda | S | P1 | PENDENTE |  |
| V2-F20-E11 | Suporte assistido no console: leitura só com concessão vigente | L | P1 | PENDENTE |  |
| V2-F20-E12 | Ciclo de vida do operador do console: reativar, reutilizar e-mail, transferir o dono | M | P2 | PENDENTE |  |
| V2-F20-E13 | Correção dos dados cadastrais da prefeitura pelo fornecedor | S | P2 | PENDENTE |  |
| V2-F20-E14 | Contrato, plano, vigência e demonstrativo de faturamento no console | L | P2 | PENDENTE |  |
| V2-F20-E15 | Rotinas do fornecedor sem credencial de dono do banco: teto, consumo e órfãos | M | P1 | PENDENTE |  |
| V2-F20-E16 | A prefeitura lê os atos do fornecedor na própria trilha (L20) | S | P1 | PENDENTE |  |
| V2-F20-E17 | Livro de eliminações no console e município eliminado na lista (L24) | S | P2 | PENDENTE |  |
| V2-F20-E18 | Provisão de município e do primeiro administrador cria pessoa e vínculo | M | P0 | PENDENTE |  |
| V2-F20-E19 | Troca obrigatória da credencial inicial do operador do console | S | P1 | PENDENTE |  |

### F21 Observabilidade (gate G21)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F21-E01 | Crash e erro dos apps móveis chegam ao destino com alerta | M | P1 | PENDENTE |  |
| V2-F21-E02 | Fila de arquivos e de sincronização em /saude (profundidade e idade) | M | P1 | PENDENTE |  |
| V2-F21-E03 | Push e e-mail: contagem de falha e alerta | M | P1 | PENDENTE |  |
| V2-F21-E04 | Saúde semântica (console, API, worker, API pública) | S | P1 | PENDENTE |  |
| V2-F21-E05 | P1: página de status e painel por município no console | M | P2 | PENDENTE |  |
| V2-F21-E06 | Plantão, canal de alerta e segunda pessoa | S | P0 | PENDENTE |  |
| V2-F21-E07 | Runbook de incidente e comunicação ao município | S | P1 | PENDENTE |  |
| V2-F21-E08 | Retenção, residência e destino do log e do erro | S | P1 | PENDENTE |  |
| V2-F21-E09 | Percentis de latência por rota em produção | S | P1 | PENDENTE |  |
| V2-F21-E10 | Tracing distribuído: instrumentação OpenTelemetry da API, do worker e do console | M | P1 | PENDENTE |  |
| V2-F21-E11 | Propagação do request id e do contexto de trace até a fila, o worker e os apps | M | P1 | PENDENTE |  |
| V2-F21-E12 | Amostragem do tracing com custo limitado | S | P1 | PENDENTE |  |
| V2-F21-E13 | SLO por rota crítica com alerta por taxa de consumo do orçamento de erro | M | P1 | PENDENTE |  |
| V2-F21-E14 | Painel de SLO no console | M | P2 | PENDENTE |  |

### F22 Backup, DR, RPO e RTO (gate G22)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F22-E01 | Backup e PITR do banco conforme o plano contratado | M | P0 | PENDENTE |  |
| V2-F22-E02 | Storage versionado e cópia fora da conta | M | P0 | PENDENTE |  |
| V2-F22-E03 | Restore automatizado em HML com dado sintético | M | P0 | PENDENTE |  |
| V2-F22-E04 | Roteiro de restore multiplataforma e relatório | M | P1 | PENDENTE |  |
| V2-F22-E05 | Regra: restore pós-migration de papel, policy ou grant | S | P0 | PENDENTE |  |
| V2-F22-E06 | Restore trimestral por pessoa que não escreveu o sistema | S | P1 | PENDENTE |  |
| V2-F22-E07 | Medição de RPO e RTO contra o prometido | M | P0 | PENDENTE |  |
| V2-F22-E08 | Backup do cofre de segredos e recuperação | S | P1 | PENDENTE |  |
| V2-F22-E09 | Cobertura de backup e restore das tabelas e do storage novos | M | P0 | PENDENTE |  |
| V2-F22-E10 | Exercício anual de recuperação de desastre de ponta a ponta | L | P1 | PENDENTE |  |
| V2-F22-E11 | Verificação do failover da redundância de máquinas | M | P1 | PENDENTE |  |

### F23 Acessibilidade (gate G23)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F23-E01 | axe-core no CI (Playwright) nas superfícies web | M | P1 | PENDENTE |  |
| V2-F23-E02 | Regras de acessibilidade para React Native no lint (campo e cidadão) | S | P1 | PENDENTE |  |
| V2-F23-E03 | Leitor de tela real: VoiceOver e TalkBack em todos os fluxos | M | P1 | PENDENTE |  |
| V2-F23-E04 | Fonte 200%, zoom 400% e reflow, contraste, toque e rotação | M | P1 | PENDENTE |  |
| V2-F23-E05 | Teste com pessoa com deficiência (quando viável) | M | P2 | PENDENTE |  |
| V2-F23-E06 | PDF oficial tagged validado | M | P2 | PENDENTE |  |
| V2-F23-E07 | Relatório de conformidade e eMAG como lista de verificação | M | P1 | PENDENTE |  |
| V2-F23-E08 | Correções das falhas encontradas | M | P1 | PENDENTE |  |
| V2-F23-E09 | PWA do painel e do portal: instalação acessível, sem offline | S | P1 | PENDENTE |  |
| V2-F23-E10 | VLibras: acessível, só por clique e fora das telas com dado pessoal | S | P1 | PENDENTE |  |
| V2-F23-E11 | Idiomas pt-BR, en e es: lang, leitor na voz certa e texto longo sem corte | M | P1 | PENDENTE |  |
| V2-F23-E12 | Tema por município: contraste AA renderizado nos dois modos e no Alto Contraste | M | P1 | PENDENTE |  |
| V2-F23-E13 | Módulos novos no portão: incidentes, abrigos, logística, canal ampliado (vídeo e chat) | M | P1 | PENDENTE |  |

### F24 Performance e carga (gate G24)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F24-E01 | Linha de base e metas (p95, concorrência) | S | P1 | PENDENTE |  |
| V2-F24-E02 | API e banco: p95 e consultas lentas sob carga | M | P1 | PENDENTE |  |
| V2-F24-E03 | Worker e pipeline de arquivos sob carga | M | P1 | PENDENTE |  |
| V2-F24-E04 | Upload em pico de desastre | M | P1 | PENDENTE |  |
| V2-F24-E05 | PDF, Chromium e memória | L | P1 | PENDENTE |  |
| V2-F24-E06 | Pacote de município grande | M | P1 | PENDENTE |  |
| V2-F24-E07 | Mapas e relatórios | M | P2 | PENDENTE |  |
| V2-F24-E08 | Sincronização do campo sob concorrência | M | P1 | PENDENTE |  |
| V2-F24-E09 | Portal, cidadão em pico e crescimento da trilha | M | P1 | PENDENTE |  |
| V2-F24-E10 | Transcodificação de vídeo sob carga e custo de armazenamento | M | P1 | PENDENTE |  |
| V2-F24-E11 | Consultas PostGIS: raio, imóvel e área de risco sob volume | M | P1 | PENDENTE |  |
| V2-F24-E12 | Login com escolha de município e troca de município sob rajada | S | P1 | PENDENTE |  |
| V2-F24-E13 | Assinatura por provedor externo sob carga, com provedor simulado | M | P1 | PENDENTE |  |
| V2-F24-E14 | Módulos de incidentes, logística e integrações: carga por fase | M | P2 | PENDENTE |  |

### F25 Segurança pré-piloto (gate G25)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F25-E01 | SAST, SCA e segredos: varredura completa e tratamento | M | P0 | PENDENTE |  |
| V2-F25-E02 | Revisão manual de autenticação, sessão e MFA | L | P0 | PENDENTE |  |
| V2-F25-E03 | Matriz de autorização varrida | M | P0 | PENDENTE |  |
| V2-F25-E04 | Cruzamento de tenant ampliado | M | P0 | PENDENTE |  |
| V2-F25-E05 | Cruzamento de órgão (Obras x Saúde) | M | P0 | PENDENTE |  |
| V2-F25-E06 | Cruzamento de cidadão (só o meu) | M | P0 | PENDENTE |  |
| V2-F25-E07 | IDOR em IDs, URLs de arquivo e presign | M | P0 | PENDENTE |  |
| V2-F25-E08 | Uploads maliciosos em HML (suíte da F06) | M | P0 | PENDENTE |  |
| V2-F25-E09 | Rate limit e abuso (duas camadas) | M | P0 | PENDENTE |  |
| V2-F25-E10 | DAST em HML (baseline) | M | P1 | PENDENTE |  |
| V2-F25-E11 | Fuzz e propriedade nos esquemas críticos | S | P2 | PENDENTE |  |
| V2-F25-E12 | Pentest externo e remediação | L | P0 | PENDENTE |  |
| V2-F25-E13 | Re-teste e relatório | S | P0 | PENDENTE |  |
| V2-F25-E14 | Pessoa global e login em dois passos: revisão manual e ataques | M | P0 | PENDENTE |  |
| V2-F25-E15 | Suporte assistido: somente leitura, com prazo e trilha, provado | M | P0 | PENDENTE |  |
| V2-F25-E16 | Provedor de assinatura e integrações externas: SSRF, retorno e segredos | M | P0 | PENDENTE |  |
| V2-F25-E17 | CPF do cidadão: cifra, hash, máscara e saída | M | P0 | PENDENTE |  |
| V2-F25-E18 | Vídeo e chat do cidadão: cadeia hostil, transcodificação isolada e abuso | M | P0 | PENDENTE |  |
| V2-F25-E19 | Tracing e SLO sem vazar dado | S | P1 | PENDENTE |  |
| V2-F25-E20 | IDOR e isolamento nas cinco superfícies e nos módulos novos | L | P0 | PENDENTE |  |
| V2-F25-E21 | Pentest recorrente, SBOM e licenças como rotina | S | P1 | PENDENTE |  |

### F26 POC controlada (gate G26)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F26-E01 | Roteiro, ambiente HML e dados sintéticos do POC | S | P0 | PENDENTE |  |
| V2-F26-E02 | Cenário 1: cidadão, relato, triagem, ocorrência | M | P0 | PENDENTE |  |
| V2-F26-E03 | Cenário 2: despacho, agente, vistoria, prefeitura (aparelho físico) | M | P0 | PENDENTE |  |
| V2-F26-E04 | Cenário 3: Defesa Civil, secretaria, aceite, resposta | M | P0 | PENDENTE |  |
| V2-F26-E05 | Cenário 4: reinspeção, documento imutável, encerramento e reabertura | M | P0 | PENDENTE |  |
| V2-F26-E06 | Cenário 5: exportação, eliminação e restore de município sintético | M | P0 | PENDENTE |  |
| V2-F26-E07 | Relatório do POC e evidências | S | P0 | PENDENTE |  |
| V2-F26-E08 | Cenário 6: incidentes, abrigos e logística humanitária (painel e app do agente offline) | M | P0 | PENDENTE |  |
| V2-F26-E09 | Cenário 7: canal ampliado (vídeo, chat, CPF, login) e idiomas | M | P0 | PENDENTE |  |
| V2-F26-E10 | Cenário 8: território, configuração por município e integrações | M | P0 | PENDENTE |  |
| V2-F26-E11 | Cenário 9: pessoa global, órgão externo, competência e escalonamento | M | P0 | PENDENTE |  |
| V2-F26-E12 | Cenário 10: suporte assistido, assinatura por provedor, PWA e tracing | M | P0 | PENDENTE |  |

### F27 Piloto municipal (gate G27)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F27-E01 | Preparar a produção do piloto (config, marca d'água, contas, treinamento) | M | P0 | PENDENTE |  |
| V2-F27-E02 | Suporte, plantão e canal do piloto | S | P0 | PENDENTE |  |
| V2-F27-E03 | Rollback e critérios de parada | S | P0 | PENDENTE |  |
| V2-F27-E04 | Métricas e coleta de feedback | S | P1 | PENDENTE |  |
| V2-F27-E05 | Operação do piloto (execução controlada) | L | P0 | PENDENTE |  |
| V2-F27-E06 | Incidentes e relatório do piloto; revalidar anti-abuso e cotas | S | P0 | PENDENTE |  |
| V2-F27-E07 | Degrau 4: incidentes, abrigos, logística e território no piloto | M | P1 | PENDENTE |  |
| V2-F27-E08 | Degrau 5: canal ampliado (vídeo, chat, CPF) e idiomas no piloto | M | P1 | PENDENTE |  |
| V2-F27-E09 | Degrau 6: integrações reais, assinatura por provedor, suporte assistido e órgão externo | M | P2 | PENDENTE |  |

### F28 Candidata a produção (gate G28)

| ID | Etapa | Tam | Prio | Status | Observação |
| --- | --- | --- | --- | --- | --- |
| V2-F28-E01 | Consolidar segurança (pentest, SAST, SCA em zero) | S | P0 | PENDENTE |  |
| V2-F28-E02 | Consolidar o jurídico: J1 a J13 resolvidos ou aceitos por escrito | S | P0 | PENDENTE |  |
| V2-F28-E03 | LGPD ativa: política publicada, aceite, direitos do titular e retenção em operação | M | P0 | PENDENTE |  |
| V2-F28-E04 | Acessibilidade e DR consolidados com relatório | S | P1 | PENDENTE |  |
| V2-F28-E05 | Observabilidade, SLA e suporte | S | P1 | PENDENTE |  |
| V2-F28-E06 | Documentos: marca d'água e aprovação conforme o parecer | S | P0 | PENDENTE |  |
| V2-F28-E07 | Lojas: fichas, rótulos de privacidade, contas e política | M | P0 | PENDENTE |  |
| V2-F28-E08 | Subprocessadores e contrato | S | P1 | PENDENTE |  |
| V2-F28-E09 | Runbooks e treinamento | S | P1 | PENDENTE |  |
| V2-F28-E10 | Exportação e eliminação provadas em produção com município de ensaio | M | P0 | PENDENTE |  |
| V2-F28-E11 | Retirar o espelho legado do /v1 e fechar dívidas da V2 | S | P1 | PENDENTE |  |
| V2-F28-E12 | Revalidar itens fora da V2 e registrar backlog | S | P2 | PENDENTE |  |
| V2-F28-E13 | Relatório final da candidata a produção e retrospectiva do roadmap | S | P0 | PENDENTE |  |
| V2-F28-E14 | Reexecutar na tag os módulos novos (incidentes, abrigos, logística, território, configuração, canal ampliado, idiomas) | M | P0 | PENDENTE |  |
| V2-F28-E15 | Integrações e provedores externos: estado em produção | S | P1 | PENDENTE |  |
| V2-F28-E16 | Rotinas recorrentes entregues à operação | S | P1 | PENDENTE |  |

## 9. PREMISSAS ASSUMIDAS (Rafael pode corrigir)

- D-13: tracing com OpenTelemetry e destino configurável (a ferramenta de destino é checkpoint).
- D-25: a saída a campo será implementada no app (CP-02 = implementar).
- D-26: a foto de perfil será construída no painel (CP-18 = construir).
- D-27: segundo fator do agente opcional, com tela de código no app.
- Os provedores externos (SMS, WhatsApp, assinatura, gov.br, Cemaden) e seus custos são checkpoints; nenhum foi contratado.
- V2-F00-E02 (política T42), assumidas porque Rafael ainda não escolheu: (a) prazo máximo de um skip incondicional = 30 dias corridos (constante `PRAZO_MAXIMO_EM_DIAS` em `dc360/scripts/portao-de-skip.mjs`, com um dia de folga de fuso porque o relógio do portão é UTC); (b) dono padrão = `rafael`; (c) a marca do `describe.skip` da vigência em `apps/api/test/vigencia-na-escrita.test.ts` aponta para V2-F00-E04 com prazo `2026-11-05`, que são 31 dias a partir de 2026-10-05 (cabe só pela folga de um dia, e a partir de 2026-10-06 cabe sem folga). Depois de 2026-11-05 o portão reprova se a E04 ainda não tiver tirado o skip.
- V2-F00-E05 (códigos de erro), assumidas porque a etapa não diz: (a) conta que deixou de existir (ou de outro município) com token válido recebe `sessao_encerrada`, e só conta que existe com `ativo = false` recebe `conta_desativada`; (b) `/auth/renovar` de conta desativada responde 403 `conta_desativada` (como a etapa pede), e o código solto `inativo` do segundo fator e da ativação passou a `credenciais` com a mensagem genérica, para a entrada continuar sem vazar o estado da conta; (c) o desafio de segundo fator vencido e o link de redefinição inválido seguem 401, agora como `sessao_encerrada`, e o painel só trata esse código como sessão morta quando o pedido mandou token; (d) o texto das três frases da tela de entrada e das mensagens do catálogo é minha proposta, Rafael aprova ou troca (arquivos: `packages/shared/src/codigos-de-erro.ts` e `apps/web/src/paginas/Entrar.tsx`); (e) a seção 23 do e2e foi provada numa cópia aparada porque o roteiro completo cai na seção 13 até a E18; (f) o catálogo cobre só os erros de acesso, o esquema de erro único é da F02-E03.
- V2-F00-E06 (fila do campo), assumidas porque a etapa não diz: (a) o 401 sem código reconhecido (corpo vazio, servidor antigo) segue o caminho do `nao_autenticado` (renova uma vez e, se não adiantar, pausa): na dúvida entre perder coleta e pausar, pausa; (b) a pausa vive só na memória da fila e é da pessoa que estava logada (some quando um envio dá certo ou quando não há nada pronto para a sessão atual), e nenhum item carrega marca dela, para não ficar velha depois de reiniciar o app; (c) enquanto a fila está pausada o laço de fundo espera 60 s (`ESPERA_COM_A_FILA_PAUSADA_MS`) em vez de 15 s, e entrar de novo o reinicia na hora; (d) a faixa do topo mostra a pausa antes de "Enviando" e de "Com sinal", e o aviso na tela de envio é de peso leve para respeitar a régua R1 do app (o fundo cheio está na faixa); (e) 403 `troca_de_senha_obrigatoria` e 403 `acesso_suspenso` nas rotas que não são da fila ficam como recusa permanente do item, por estarem fora dos três códigos da etapa (registrado em `apps/campo/PENDENCIAS.md`, item 14); (f) o texto das frases da faixa, do aviso, do cartão e da lista de hoje é minha proposta, Rafael aprova ou troca (`apps/campo/src/dados/pausa-da-fila.ts` e `falha-de-atualizacao.ts`); (g) o cenário de E2E em emulador não pôde ser executado e fica como validação humana.
- V2-F00-E07 (papel, cadeia da sessão e provisória), assumidas porque a etapa não diz: (a) a troca de papel NÃO revoga sessões (a própria etapa diz "decisão registrada", e a registrei em `apps/api/PENDENCIAS.md` e no README): a escrita confere o papel do banco, então o token velho não escreve com o papel antigo, e revogar obrigaria a entrar de novo com coleta na fila; (b) papel diferente do token responde 401 `nao_autenticado` com a mensagem do catálogo, e é conferido DEPOIS de conta desativada, sessão encerrada e provisória vencida (quem foi rebaixado e derrubado entra de novo), o que reescreveu três testes da E05 no lugar, com registro; (c) a sessão rotacionada vale se a família tem sessão com `revogada_em IS NULL`, sem olhar o vencimento dela (a consulta já não olhava para a sessão do próprio token); (d) `abrir_sessao` só aceita herdar família do mesmo usuário e do mesmo município e recusa as demais com o erro `DC369`, sem dizer qual condição falhou, e a assinatura de seis argumentos foi REMOVIDA (não deixada ao lado) para não passar o teto de 27 definers; (e) o painel passou a atualizar o papel da tela com a resposta da renovação (`aoRenovar`), porque o critério de E2E da etapa ("passa a ter só as ações do papel novo") não se cumpre sem isso: é acréscimo de escopo mínimo no painel, sem tela nova; (f) o 403 `troca_de_senha_obrigatoria` na fila do campo fica FORA da E07 (a E06 propôs tratá-lo aqui ou anotar; decidi anotar, em `apps/campo/PENDENCIAS.md`, item 14, porque o app não tem tela de troca de senha e pausar sem saída deixaria o item parado); (g) o ensaio em Postgres real usou os binários do PostgreSQL 18.3 já instalados na máquina, num cluster descartável com porta e senha próprias (o Postgres que roda na máquina tem senha desconhecida e não foi tocado); (h) a migração deve ser aplicada ANTES do código novo, e isso entrou em `COLOCAR-DE-PE.md`; (i) os arquivos de evidência em texto seguem LF, como os das etapas anteriores, e os de código CRLF.
- V2-F00-E03 (classificação dos vermelhos), assumida porque Rafael ainda não decidiu BZ-N:N.3: (a) vale a regra da própria etapa, escrita em `dc360/docs/POLITICA-DE-TESTE-VERMELHO.md` (seção "Quando o teste e o código discordam"): onde há decisão datada no código, posterior ao teste, e teste irmão passando, o código vale e o teste é reescrito com registro (R1); onde o teste descreve como defeito algo que a leitura do código confirma, o teste vale e o código é consertado (R2); sem uma das provas, o teste não se reescreve e trata-se como defeito até Rafael dizer o contrário; (b) os 14 defeitos do campo (E15 e E16) são defeitos reais até Rafael dizer o contrário; (c) o teste irmão da decisão de `index.tsx:1222` é `a-sessao-vencida-nao-apaga-a-vistoria.test.tsx` e não `falha-de-atualizacao.test.ts` (divergência D-2); (d) o vermelho intermitente `resolver-link.test.ts` é instável por espera fixa de 20 ms sob carga (causa provável, não provada). Se Rafael trocar a regra, as classes A e B da tabela se reabrem: só as linhas V-CAM-01 a V-CAM-06 e V-SCR-3 dependem dela para ser reescritas.
- V2-F00-E08 (vazamentos de leitura ao agente), assumidas porque a etapa não diz: (a) o agente recebe 403 `sem_permissao` nas duas rotas de ofício (a etapa manda) e a permissão é conferida ANTES da validação do id, para o agente não distinguir 403 de 422; recurso de outro município segue 404 para quem tem a ação; (b) `POST /avisos/lidos` também recebe o recorte do agente (acréscimo mínimo da mesma causa: sem ele `marcados: 1` confirmava que o aviso de outra equipe existe) e continua sem `exigirPermissao`, porque o sino é de todo papel; (c) a contagem de não lidos passou a juntar `ocorrencias` para TODOS os papéis (a FK garante que o resultado é o mesmo, e lista e contagem passam a medir o mesmo conjunto); (d) o modo local do painel recusa a leitura de ofício por papel, como a API; (e) a seção 25 do e2e foi provada numa cópia aparada porque o roteiro completo cai na seção 13 até a E18; (f) a sonda "antes" da API foi feita com as duas rotas de `HEAD` postas no lugar só durante a subida do servidor de teste, e restauradas em seguida.
- V2-F00-E09 (sessões e redefinição no painel), assumidas porque a etapa não diz: (a) `GET /auth/sessoes` pede só autenticação (é da própria conta, como `/auth/encerrar-sessoes`) e `GET /usuarios/:id/sessoes` usa `gerenciar_usuarios`, a mesma ação das outras duas rotas de administração de sessão, sem ação nova no shared; (b) a lista mostra "Entrou em" (o login da família) e "Expira em" (o vencimento da sessão viva, que se renova a cada uso); (c) os botões novos ficam ocultos, e não desabilitados com motivo, onde o posto não permite, e só aparecem no modo com servidor; (d) a janela da senha temporária não fecha por clique fora e não tem o "Fechar" do canto (a única cópia não pode sumir por esbarrão), mas Escape ainda fecha; (e) mensagens da API sem acento nas duas rotas de sessão foram corrigidas, porque aparecem na tela.
- V2-F00-E10 (recuperação de senha com notificador de teste), assumidas porque a etapa não diz ou diverge do que o código permite: (a) `Referrer-Policy: no-referrer` só em `/recuperar-senha` e `/redefinir-senha`, e NÃO no painel inteiro como o texto da etapa dizia, porque a chave do Google Maps é restrita por referenciador HTTP (`dc360/docs/COLOCAR-DE-PE.md`, `MAPS_KEY`) e `no-referrer` global faria o Google recusá-la; por isso as saídas das duas telas recarregam a página (link comum), para a política não seguir a pessoa para dentro do painel; (b) `GET /auth/recuperacao` (nova, pública, só `{ ativa }`) para a tela saber antes de pedir o e-mail, mantendo o tratamento do 503 como segunda via; (c) teto de 5 pedidos por e-mail por hora (`RECUPERACAO_POR_EMAIL_HORA`), por processo, para a "limitação de taxa" cobrir muitos endereços contra o mesmo e-mail, que `LOGIN_POR_IP` não vê; (d) o envio sai depois da resposta e a falha do provedor não chega à tela (sem oráculo por relógio nem por status); (e) `/redefinir-senha` continua em `ROTAS_PUBLICAS` (o portão de `seo.test.ts` define pública como "fora de `<Protegida>`") e o robô é barrado por `X-Robots-Tag: noindex`; (f) a produção segue desligada até o CP-19, que não decidi.

## 10. DIÁRIO (acrescentar sempre no fim; nunca apagar)

| Data | O que foi feito | Quem |
| --- | --- | --- |
| 2026-09-30 | Auditoria Baseline Zero e Decision Pack concluídos | Claude |
| 2026-10-01 | Roadmap V2 escrito: 29 fases, 352 etapas, 29 gates, 40 checkpoints, matriz de rastreabilidade de 484 linhas | Claude |
| 2026-10-01 | Rafael declarou a V2 absoluta e respondeu as perguntas de conflito; decisões D-07 a D-29 registradas em `01`; STATUS criado | Claude e Rafael |
| 2026-10-02 | Regras inegociáveis de Rafael: prova (E2E e capturas de tela) antes de avançar e interface perfeitamente alinhada e bem escrita; registradas em `19` seção 0, `00-README`, CLAUDE.md e memória | Claude e Rafael |
| 2026-10-02 | Revisão de escopo concluída (RV-01 a RV-15): 7 fases novas (F29 a F35), 618 etapas, 36 gates, 95 checkpoints; verificação cruzada sem problemas; aguardando aprovação de Rafael | Claude |
| 2026-10-05 | Rafael disse "prossiga"; implementação iniciada. V2-F00-E01: roteiro `baseline.mjs`, `.nvmrc`, README e COLOCAR-DE-PE; medição 17 de 17 confere com o baseline; achados: a saída bruta com travessão faz a evidência reprovar o teste de conteúdo (redação nova) e o E2E local precisa do painel servido | Claude |
| 2026-10-05 | V2-F00-E02: política T42 (`POLITICA-DE-TESTE-VERMELHO.md`), portão `portao-de-skip.test.mjs` com 17 testes dentro de `test:scripts` (198 no total, 3 falhas pré-existentes da E17), marca T42 na vigência (E04, 2026-11-05), `DECISOES-DE-TESTE-DA-FASE-00.md`; esperado do roteiro `baseline.mjs` ajustado por `TESTES_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS`; regressão sem mudança (API teve 1 falha intermitente de tempo em `resolver-link.test.ts`, verde na rodada seguinte); premissas na seção 9 | Claude |
| 2026-10-05 | V2-F00-E03: vermelhos do baseline da E01 conferidos nas saídas e no código e classificados (`classificacao-dos-vermelhos.md`); regra de BZ-N:N.3 na política como premissa; registro por teste em `DECISOES-DE-TESTE-DA-FASE-00.md`; 7 divergências com o roadmap (maior: `npm audit` da E19 com números velhos, `fastify` alto em execução); `resolver-link.test.ts` classificado como instável; só documentação, sem regressão | Claude |
| 2026-10-06 | V2-F00-E04: vigência de conta, papel e sessão religada na escrita (`servidor.ts`), `describe.skip` da vigência e marca T42 removidos, 4 casos de borda novos, ajuste de fixture em `api.test.ts` (o reuso de renovação passa a derrubar o token da Helena de verdade), portão de skip e esperado da API no `baseline.mjs` atualizados; sonda 6 de 13 vermelhos antes e 13 de 13 depois; API 1113 testes, 1 falha (E12), 13 pulados; a falha de senha provisória da E07 ficou verde sozinha; README e PENDENCIAS atualizados | Claude |
| 2026-10-06 | V2-F00-E05: catálogo de códigos de erro de acesso no shared; API emite `sessao_encerrada` (401, o antigo `sessao` sai) e `conta_desativada` (403, também na renovação), com a conta desativada antes da sessão encerrada; `/auth/entrar` e o 404 de outro município provados intactos; o código solto `inativo` do segundo fator virou `credenciais`; painel reconhece as três respostas e a tela de entrada diz a frase de cada uma (sessão expirou, encerrada, conta desativada); 16 casos novos na API (8 vermelhos com o código velho), 10 no shared, 7 no web, seção 23 do e2e (provada em cópia aparada); `baseline.mjs` com esperado por etapa também para shared e web; as oito ocorrências de `sessao` nos testes registradas em `DECISOES-DE-TESTE-DA-FASE-00.md`; README, PENDENCIAS e guia do coordenador atualizados | Claude |
| 2026-10-06 | V2-F00-E06: transporte do campo lê os três códigos do catálogo (`FalhaDeSessao`, renovação única do token com a trava e o piso de `token.ts`), fila para e guarda o item pendente em 401 `sessao_encerrada` e 403 `conta_desativada` (e sem token), 403 `sem_permissao` segue bloqueando; faixa, aviso e cartão "Guardada" no app e motivo `conta-desativada` na lista de hoje; 28 testes novos no pacote, 35 no app, 5 na integração com a API (4 contra a API real); três testes que afirmavam "401 é permanente" reescritos e registrados em `DECISOES-DE-TESTE-DA-FASE-00.md`; `baseline.mjs` com esperado por etapa para o pacote e o app; sonda 16/86, 13/86 e 7/9 vermelhos antes do conserto; sem captura de tela (Expo não renderiza no ambiente), prova por teste de componente; README, PENDENCIAS, LEIA-ME e guia do coordenador atualizados | Claude |
| 2026-10-06 | V2-F00-E07: migração 047 (família da sessão, `abrir_sessao` com a família opcional), vigência com a regra da cadeia e papel diferente do token como 401 `nao_autenticado`, `renovar` herda a família, `trocarSenha` recusa a provisória vencida, painel acompanha o papel da renovação (`aoRenovar`), 20 casos novos na API, 12 no banco, 2 no painel e a seção 24 do E2E (9 verificações, 8 capturas), três testes da E05 reescritos com registro, `baseline.mjs` com esperado por etapa também para o banco. Sonda 11 de 20 antes, 20 de 20 depois; API 1154 com 1 falha (E12) e 13 pulados, isolamento 330, `migrar` e `--conferir` em Postgres 18.3 real. Status EM ANDAMENTO (falta validação humana das sondas). Evidência em `docs/evidencias-v2/G00/V2-F00-E07/`. |
| 2026-10-06 | V2-F00-E08: ação `consultar_oficio` no shared, 403 ao agente em `GET /oficios` e `GET /oficios/:id` (permissão antes do id), sino do agente (lista, contagem e marcar como lido) recortado à equipe dele, painel e modo local alinhados, escrita do GET registrada em PENDENCIAS; 14 casos novos na API (9 vermelhos antes), 3 no shared, 4 no painel e a seção 25 do e2e (14 verificações, 8 capturas); `baseline.mjs` com esperado por etapa (API +14, shared +3, web +4); README corrigido (126 verificações de e2e). Sem migração. Status EM ANDAMENTO (falta validação humana da sonda). Evidência em `docs/evidencias-v2/G00/V2-F00-E08/`. |
| 2026-10-06 | V2-F00-E09: `GET /auth/sessoes` e `GET /usuarios/:id/sessoes` (só quantidade, datas e aparelho em uma frase), botões Redefinir senha e Encerrar sessões em Usuários, janela da senha temporária única, Minha conta com a lista de sessões e o botão de encerrar as outras, modo local explicando; 27 casos novos na API (11 reprovam sem as rotas), 18 no painel, os 8 de `seguranca-da-conta.test.ts` verdes sem mudar o teste (painel de 14 falhas para 6), seção 26 do e2e (50 verificações) e 68 capturas; ajuste de layout da lista de usuários achado nas capturas. `baseline.mjs` com esperado por etapa (API +27, web +18 e 8 falhas a menos). Sem migração. Status EM ANDAMENTO (falta validação humana do fluxo). Evidência em `docs/evidencias-v2/G00/V2-F00-E09/`. | Claude |
| 2026-10-06 | V2-F00-E10: recuperação de senha por e-mail com notificador de teste: `POST /auth/recuperar` envia depois da resposta e conta pedidos por e-mail (sem oráculo por relógio nem por status), `GET /auth/recuperacao`, mensagens com acento, as duas telas com todos os estados, token fora da barra de endereço, pedido sem sessão (o link vencido derrubava a sessão de quem estava logado), `Referrer-Policy` e `noindex` só nas duas rotas, produção desligada provada por teste; 25 casos novos na API (8 reprovam antes), 40 no painel (3 reprovam antes), seção 27 do e2e (33 verificações, cópia aparada) e a 14 mantida, 96 capturas em 1280 e 390, contraste AA medido; falta a validação humana e o CP-19 | Claude |

## 11. PENDÊNCIAS E PONTOS VAGOS DA REVISÃO (para Rafael ler antes de aprovar)

Resolvidos na reconciliação (RV-15): ver `01-decisoes-e-principios.md`, seção 12. O que continua aberto de propósito:

- **Itens 34 e 35 de `21-fora-da-v2.md`:** a faixa 31 a 44 de D-19 os inclui, mas a lista de dívidas não os cita; ficam fora até Rafael confirmar.
- **Unidade administrativa dentro do órgão** (item 26 de `21`): segue fora; ALY:AUT-01 e ALY:AUT-03 ficam parcialmente cobertos.
- **L15 e D-24:** só a matriz de autorização (F03-E13) trava o comportamento (a coordenação classifica e despacha; o operador não).
- **D-28 e D-29** são regras de trabalho, sem etapa própria.
- **Valores propostos, não confirmados:** metas de SLO (99,5% e p95 até 2 s, a calibrar na F24-E01), tetos de importação e de raio (5 000 linhas, 10 km), tempos e cotas de integrações, cargas de F29 a F31. Nenhum endpoint, versão de API ou selo de terceiro foi confirmado: tudo está marcado NÃO CONFIRMADO, com a forma de confirmar em checkpoint.
- **Regra da Apple para login social** (CP-nn de login social): NÃO CONFIRMADA; conferir com o agente `publicacao-lojas` antes de contratar contas.
- **Premissas D-25, D-26 e D-27** (saída a campo, foto de perfil, segundo fator do agente) foram assumidas; Rafael pode corrigi-las.
- **Numeração de ADRs** das fases novas: feita na execução, a partir da 0019.
- **Migrations:** todas citadas como `NNN_nome.sql`, a numerar na execução (a próxima livre hoje é 047, mas a ordem de execução decide).
- **Itens 45 a 51 de `21-fora-da-v2.md`** foram extraídos das fases F29 a F35 (resíduos que cada fase declara fora).
- **Capacidade:** 618 etapas para uma pessoa dedicada (CP-01) é um volume grande; o tamanho de cada etapa (XS a L) permite replanejar. Rafael pode pedir corte de escopo, mas por decisão dele (a V2 é absoluta).
- **Achado novo da E03, `npm audit` (para a E19):** a base de avisos mudou desde 2026-09-30 sem que os lockfiles mudassem (ambos de 2026-09-17). A raiz tem 4 (3 moderadas e 1 alta) e a alta é o `fastify` 5.12.1, de execução, com 5 avisos (um é desvio de autenticação por URL malformada), correção por `npm audit fix`. O campo tem 54 (3 moderadas e 51 altas), não 4. Pela regra do projeto, vulnerabilidade conhecida em execução é bug. PROPOSTA: a E19 parte destes números, e Rafael decide se a correção do `fastify` (execução, sem salto de major, e a política já reprova execução) adianta para antes do CP-03. O roteiro `baseline.mjs` só confere que `npm audit` segue vermelho, por isso a E01 marcou `confere` sem ver a mudança.
- **Achado novo da E03, teste instável:** `apps/api/test/resolver-link.test.ts:418-419` falhou 1 vez em 3 rodadas completas da API (espera fixa de 20 ms pelo `close` do servidor local, sob carga). Nenhuma etapa existente o cobre; a mais próxima é a E21 (suíte que passa sem depender da máquina). PROPOSTA: acrescentar à E21 um quarto item, trocar espera fixa por condição com limite (`vi.waitFor`), primeiro neste teste e depois, medindo, nos outros 10 pontos de 4 arquivos com a mesma espera; ou abrir etapa própria. Enquanto não decidir, o teste não se pula nem se repete até passar.
- **Achado novo da E03, reescritas sem registro previsto:** a E13 (portão de acessibilidade), a E17 (três testes de scripts), a E20 (varredura de travessão), a E21 (leitura de fonte e `banco-tls`) e a E05 (código `sessao`) reescrevem teste e não listam `docs/DECISOES-DE-TESTE-DA-FASE-00.md` em "Documentação a atualizar". Pela política cada uma registra; as seções já estão abertas com a decisão pronta. PROPOSTA: incluir o arquivo na lista de documentação dessas etapas quando forem executadas.
- **Achado novo da E03, e2e de Firefox:** o roteiro `baseline.mjs` só roda o Chromium e o e2e da API; o Firefox segue com a medição de 2026-09-30. PROPOSTA: a E13 e a E18 passam a medir `MOTOR=firefox` e o roteiro ganha o passo quando a E13 fechar.
- **Achado novo da E04, `senha-provisoria.test.ts:183` ficou verde:** a falha de senha provisória que o roadmap reserva para a E07 ("sessão viva cuja senha provisória venceu no meio não escreve nem renova") passou a ficar verde só com a vigência religada, porque `exigirVigencia` já nega a escrita com `senha_provisoria_ate < agora`. A E07 deve conferir se ainda sobra algo dela (renovação com senha provisória vencida, família de sessão, papel alterado) e não esperar que esse teste esteja vermelho. O baseline da API fechou em 1113 testes, 1 falha, 13 pulados. (FECHADO na E07: o caso segue como está e ganhou o par que faltava, `trocarSenha` recusando por conta própria, provado pelo serviço.)
- **Achado novo da E04, `api.test.ts`:** o teste de reuso de renovação derrubava as sessões da Helena que os 26 testes seguintes usavam, e só passava por a escrita não conferir a sessão. Corrigido por login novo no fim do teste (registro em `docs/DECISOES-DE-TESTE-DA-FASE-00.md`). Outros arquivos de teste que compartilham token entre blocos e provoquem reuso ou troca de senha podem aparecer nas etapas seguintes (E05, E07).
- **Achado novo da E05, o app de campo ainda lê o 403 como erro comum (RESOLVIDO no código pela E06, falta a prova em aparelho):** a lista de hoje classifica o 403 `conta_desativada` como "outro" (tenta de novo daqui a pouco) e a fila o trata como falha permanente, igual ao 401 de antes; a coleta fica guardada no aparelho, mas o item aparece travado ao lado de "Descartar". Já está no guia do coordenador (pedir ao agente para não descartar). A E06 corrige a fila e a frase (`falha-de-atualizacao.ts` ganha o motivo `conta-desativada`).
- **Achado novo da E06, a E04, a E05 e a E06 vão juntas:** o impedimento que a E05 tinha (o campo lia o 401 `sessao_encerrada` e o 403 `conta_desativada` como falha permanente) acabou no código, mas só está provado por teste de componente e contra a API real; a prova em aparelho ou emulador (desativar o agente no painel durante uma coleta na fila, ver a frase e a coleta preservada, reativar, entrar de novo e ver a MESMA coleta subir uma vez) é validação humana pendente (`apps/campo/LEIA-ME.md`, passo 7). Até lá, não implantar a E04 e a E05 sem a E06.
- **Achado novo da E06, `npm run build:shared` antes do jest do app:** o app de campo consome `@dc360/campo` pelo `dist`, então quem muda `packages/campo/src` e roda só o jest do app enxerga o motor velho. O passo `typecheck` do roteiro completo reconstrói; `baseline.mjs --so=teste-campo-app` não. Mesma proposta da E05 para `test:api` (E17 ou F01-E03).
- **Achado novo da E06, o 403 da senha provisória na fila:** `troca_de_senha_obrigatoria` (403) na rota de sincronização ainda é recusa permanente do item no transporte: a coleta fica `bloqueado` até a pessoa trocar a senha no painel. É do mesmo risco de perda que a E06 fechou, e não está na lista dos três códigos da etapa. PROPOSTA: tratar na E07 (que mexe em senha provisória) como terceira pausa da fila, com frase própria.
- **Achado novo da E05, `test:api` e o `dist` do shared:** `npm run test:api` (e `baseline.mjs --so=teste-api`) usam o `dist` do `@dc360/shared`, que só se reconstrói em `npm run build:shared` (ou no passo `typecheck`). Quem mudar `packages/shared/src` e rodar só a API enxerga o shared velho. PROPOSTA: a E17 ou a F01-E03 acrescenta o build ao `test:api`; não foi mexido aqui.
- **Achado novo da E05, `GET /avisos` e leituras:** seguem fora da vigência (F03-E03), então a conta desativada ainda lê por até 15 minutos; o código `conta_desativada` só aparece na próxima escrita ou na renovação.
- **Achado novo da E07, janela na renovação:** entre `revogar_sessao` (a sessão antiga) e `abrir_sessao` (a nova) a família não tem sessão viva por milissegundos, e uma escrita com o token antigo nessa janela leva 401 `sessao_encerrada` (a fila do campo mantém o item). Fechar exige renovar numa só transação: PROPOSTA para a F03-E02 (rotação e claims enxutas). Em `apps/api/PENDENCIAS.md`.
- **Achado novo da E07, ordem do deploy:** a migração 047 tem de ser aplicada ANTES do código novo (o código novo contra banco sem a 047 quebra todo login e toda renovação; o antigo contra o banco migrado funciona). Está em `dc360/docs/COLOCAR-DE-PE.md`. A F01 (CI e deploy) deve garantir essa ordem.
- **Achado novo da E07, o 403 `troca_de_senha_obrigatoria` na fila do campo:** decisão tomada (fica fora, anotado): reabrir junto com a tela de troca de senha no aplicativo (ainda sem etapa que a crie: PROPOSTA conferir se a F14-E02 ou outra a cobre).
- **Achado novo da E08, `GET /orgaos`:** o catálogo de órgãos (com o e-mail de cada um) também exige só autenticação e responde ao token do agente de campo. Fora do escopo da E08; PROPOSTA: a F03-E12 (manifesto rota x ação) ou a F04-E09 decide a ação de leitura do catálogo. Outras leituras que exigem só autenticação ficam para o manifesto da F03-E12.
- **Achado novo da E08, papel antigo lê até o token vencer:** a vigência só cobre a escrita, então um coordenador rebaixado a agente ainda consulta ofício e lê o sino do município até o token de 15 minutos vencer. Fecha na F03-E03.
- **Achado novo da E09, a senha temporária é conhecida por quem a sorteia (IDN-18):** continua assim (72 horas e troca obrigatória na primeira entrada); fecha com o convite por link (F03-E10). Em `apps/api/PENDENCIAS.md`.
- **Achado novo da E09, lista de usuários em 390 px e Toast no celular:** a tabela rola dentro do cartão e os quatro botões ficam na última coluna; o Toast é desenhado sobre a barra de menu fixa de baixo. Ambos vêm de peças que já existiam; PROPOSTA para a F10 (cartões no celular) e para a F08 (posição do Toast). Em `apps/web/PENDENCIAS.md`, item 6.
- **Achado novo da E09, "encerrar minhas outras sessões" preserva por id:** com um token de acesso anterior à última renovação o botão derruba a sessão viva da própria cadeia (a lista já marca "esta" por família). PROPOSTA: alinhar a preservação à família na F03-E02.
- **Achado novo da E10, o pedido de recuperação não pode ter sessão:** o cliente HTTP mandava o token da sessão aberta e, no 401 `sessao_encerrada` do link vencido, renovava e depois apagava a sessão de quem só abriu o link no navegador de outra pessoa. Corrigido (`semSessao` em `http.ts`) e provado por sonda. Outros pedidos públicos (`registrarInteresse`, `/auth/entrar`) também passam por `chamar` com o token se houver sessão, mas nenhum devolve os códigos que derrubam a sessão; PROPOSTA: a F10 ou a F08 passa a rota pública para `semSessao` por padrão.
- **Achado novo da E10, `Referrer-Policy` do roadmap versus a chave do Maps:** o texto da E10 pede `no-referrer` no painel; a chave do Google Maps é restrita por referenciador, então vale só nas duas rotas de recuperação (premissa na seção 9). Se um dia o mapa deixar de depender de referenciador, a política pode subir ao painel todo. O header só se vê na Vercel; conferir no primeiro deploy.
- **Achado novo da E10, teto de pedidos por e-mail é por processo:** com mais de uma máquina é por máquina e um reinício o zera; mover o contador para o banco (migração) fica para a F03. Em `apps/api/PENDENCIAS.md`.
- **Achado novo da E10, `NOTIFICADOR_ARQUIVO` só é recusado em `NODE_ENV=production`:** em `staging` ou outro valor ele funciona. A F01 (ambientes) decide se o HML precisa da mesma trava.
- **Achado novo da E10, teste instável por carga:** `packages/shared/test/dominio.test.ts` ("ninguém redefine o checklist fora do pacote compartilhado") estourou os 5 s uma vez logo depois do isolamento e passou sozinho (252 ms) e na rodada seguinte. Mesma classe do `resolver-link.test.ts`; PROPOSTA: a E21 inclui os dois na troca de espera fixa por limite generoso.
- **Não commitado:** nenhum arquivo desta revisão foi commitado (política: commit só com aprovação dele). Estado git: `docs/roadmap-v2/`, `docs/ROADMAP-V2.md`, `docs/AUDITORIA-*` e `CLAUDE.md` modificados ou novos.
