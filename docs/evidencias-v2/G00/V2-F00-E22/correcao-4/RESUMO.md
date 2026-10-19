# V2-F00-E22, correção 4 (2026-10-19)

Motivo: a rodada 4 de validação (SHA bb0f654, `VEREDITO.md` e `validacao/bb0f654/qa.md`) reprovou a etapa por documentação desmentida pelo código: a tabela de permissões "gerada" do README sem `levantar_interdicao` e sem o teste que ela dizia ter, `SAIDA-DE-MUNICIPIO.md` dizendo que a leitura sob suspensão "não cria registro" (a sonda deu 0 para 1 em `ocorrencia_consultas`), pendências já fechadas pelo código nos `PENDENCIAS.md` do painel e do campo, e afirmações falsas em quatro documentos de `dc360/docs/`. Esta correção conserta cada divergência, prende a tabela de permissões a teste e refaz a varredura (DoD da etapa) sobre o HEAD `7d0ba27`, que traz as correções novas de E07 (troca de senha numa transação, sob a trava por pessoa), E09 (id normalizado nas recusas sobre a própria conta), E10 (migração 051), E05 (catálogo de 10 códigos e `CODIGOS_DA_ENTRADA`), E15, E25 (restore v3) e E03 (V-API-3).

## Fatos

### O teste que prende as tabelas de permissões

Arquivo novo: `dc360/packages/shared/test/permissoes-no-readme.test.ts` (10 casos, em `packages/shared`). Código de produção NÃO foi tocado para ele.

- Gera, de `acoesDoPapel`, `ROTULO_ACAO` e `ROTULO_PAPEL`, a tabela "Papel | Pode" que o README traz abaixo do marcador `<!-- permissoes: gerado ... -->`, e compara linha a linha. Reprova se faltar ação, se sobrar ação, se o papel não tiver linha, se houver linha de papel que não existe, se a ordem divergir ou se o marcador sumir. A mensagem de falha traz a linha certa, para colar.
- Confere a coerência do catálogo (rótulo único e sem vírgula, toda ação é de algum papel) e que cada ação aparece no README.
- Prende também a tabela "A tabela, de uma vez" de `docs/PAPEIS_E_RESPONSABILIDADES.md` (uma linha por ação, uma coluna por papel, cada "sim" e "não" contra `podeExecutar`, e o CABEÇALHO: cada título de coluna precisa ser o começo do rótulo do papel daquela coluna; a primeira versão do teste não conferia o cabeçalho, e trocar as colunas Operador e Coordenador dava 10 de 10 verde, achado do revisor independente). Esse documento dizia a mesma frase ("um teste reprova se esta tabela divergir do código") e também não tinha teste: estava sem 3 das 16 ações (`levantar_interdicao`, `consultar_oficio`, `acompanhar_saida_a_campo`).
- ANTES-VERMELHO (`saidas/01`): contra o README de `bb0f654`, 5 de 8 casos reprovam (a tabela sem `levantar a interdição de um imóvel`, e a linha do administrador com o rótulo "Administrador" em vez do de `ROTULO_PAPEL`). DEPOIS-VERDE (`saidas/02`): 10 de 10.
- Mutações no código real de permissões, restauradas com cópia do original (`git diff` vazio em `packages/shared/src`): operador ganha `exportar_dados` sem o README mudar (`saidas/03`, reprova); coordenador perde `levantar_interdicao` e o README continua com ela (`saidas/04`, reprova); operador perde `consultar_oficio` (`saidas/05`, reprovam o README e o documento de papéis); colunas Operador e Coordenador trocadas no cabeçalho do documento de papéis (`saidas/06`, reprova, e o arquivo foi restaurado byte a byte). Os casos "mordida" do próprio arquivo alteram o texto em memória (ação que falta, que sobra, papel sem linha, linha inventada, ordem trocada, marcador removido, célula sim/não trocada, linha removida) e exigem que a comparação acuse.
- A tabela do README foi regerada pelo próprio código (cabeçalho do README: o papel passou a se chamar "Administrador da organização", como em `ROTULO_PAPEL`). `scripts/baseline.mjs`: entrada `V2-F00-E22-correcao-4` em `MUDANCAS_DO_TESTE_SHARED_POR_ETAPA` com `total: 10`. Sem `puladas`: a base do shared não conta puladas, e acrescentar o campo faz a soma virar NaN (o `baseline.test.mjs` compara só `total` e `falhas` para essa suíte).

### Regressão

- `npm run build:shared` e `npm run typecheck` (inclui o `tsc` da API, depois de mexer em comentários de `servidor.ts`, `s3.ts`, `senha.ts` e `pontuador.ts`): código 0 (`saidas/34`).
- `packages/shared`: 17 arquivos, 185 de 185 (`saidas/33`); portão de conteúdo `regras-de-conteudo`: 10 de 10 (`saidas/32`).
- `npm run conferir:numeros`: código 0, 25 afirmações, "o roteiro espera o mesmo total de casos que a árvore tem, nas oito suítes" (`saidas/30`). Totais ajustados: README (shared 185, "3140 testes em seis pacotes") e `COLOCAR-DE-PE.md` (5072 com o aplicativo).
- `node --test scripts/baseline.test.mjs`: 29 de 29 (`saidas/31`).
- `npm run test:api`: a primeira corrida (`saidas/10`) reprovou 16 casos em 7 arquivos porque a máquina parou (carga 27 por processos do sistema, hooks de 120 s estourados e tokens de 15 minutos vencendo no meio dos testes; nenhum dos 7 arquivos é de arquivo tocado aqui). Os 7 arquivos sozinhos, sem paralelismo: 122 aprovados e 34 pulados (`saidas/11`). Segunda corrida completa, depois que a carga baixou: **104 arquivos, 1451 aprovados, 34 pulados, 0 falhas** (`saidas/12`). `openssl-do-teste.test.ts` passou no LibreSSL do macOS (V-API-3 da E03).
- Sondas da correção 3 reaproveitadas em `sondas/`: referências a arquivo entre crases (`saidas/20`: sobram só nomes gerados ou de pasta ignorada, mais o teste novo ainda não rastreado), variáveis de ambiente e rotas citadas (`saidas/21`: 110 variáveis, 6 sem ocorrência e todas legítimas, `CNAME`, `JSONB`, `VACUUM`, `PGPASSFILE`, `TMPDIR`, `PASTA_RESTORE`, termos de SQL ou variáveis de shell do roteiro de restore; 36 rotas, 0 sem registro), tabelas fora do dicionário (36 relações, 0 fora) e funções `SECURITY DEFINER` (27, com 51 migrações), sem travessão nos 32 arquivos tocados (`saidas/22`).
- `npm run auditar`: código 0 com rede (runtime da raiz em 0 vulnerabilidades, aplicativo só com as exceções aceitas e sem advisory nova; `saidas/35`). `npm audit` puro da raiz: 3 avisos de ferramenta de teste (`vitest`, `@vitest/mocker`, `tinypool`), como o README diz.
- Testes de API dos arquivos de teste/comentário tocados (`vigencia-na-escrita`, `acesso-suspenso`, `prova-dinamica-dos-codigos-de-erro`): 34 de 34 (`saidas/36`); âncoras da declaração das lojas: 11 de 11 (`saidas/37`).
- Os números da prova dinâmica que o README cita (114 pares, 112 chegam ao handler, 48 com 2xx, 66 sem 2xx, e os 12 perfis com 10/10/10/10/93/62/61/100/47/49/96/54) foram conferidos contra a matriz que o próprio teste grava (`saidas/38`).
- Não rodados aqui: `npm run auditar` e `npm audit` (exigem rede e não são desta mudança; o comentário de `s3.ts` e `pontuador.ts` foi acertado para `--omit=dev`), o CI, e qualquer coisa em aparelho. `npm run test:isolamento` não foi rodado (nenhum SQL, política ou função mudou).

### A varredura, sobre o HEAD 7d0ba27

Escopo: `dc360/README.md`, `GUIA-DO-COORDENADOR.md`, `PAPEIS_E_RESPONSABILIDADES.md` e `SEGURANCA-DO-AGENTE.md` (estes quatro lidos LINHA A LINHA por mim, depois de lidos por um conferidor independente em Sonnet, com cada achado reconferido contra o código; as afirmações numéricas do README sobre a prova dinâmica foram regeradas, `saidas/38`), os três `PENDENCIAS.md` de app, `db/PENDENCIAS.md`, `apps/campo/LEIA-ME.md` e `LOJAS.md`, os 18 `dc360/docs/*.md` e os comentários de vigência. Parte da leitura (`GUIA-DO-COORDENADOR`, `SEGURANCA-DO-AGENTE`, `PAPEIS_E_RESPONSABILIDADES`, `INDISPONIBILIDADE`, `LIGAR-O-EMAIL`, `VERCEL-PAINEL`, `SUBPROCESSADORES`, `POLITICA-DE-TESTE-VERMELHO`, `IMPLANTACAO`, `db/PENDENCIAS`, `apps/api/PENDENCIAS`) foi do mesmo conferidor; os demais documentos foram conferidos por mim, por amostra dirigida e pelas sondas mecânicas. Limite declarado: a leitura não é exaustiva (cerca de 10 mil linhas de documento).

Tabela: afirmação, onde, o que o código faz, ação.

| Afirmação | Onde | O que o código faz | Ação |
| --- | --- | --- | --- |
| Tabela "gerada" e "presa por teste"; sem `levantar_interdicao` | `README.md` (Autorização por papel) | `permissoes.ts` concede a ação a coordenador e administrador; o teste não existia | tabela regerada e teste criado |
| "Um teste reprova se esta tabela divergir", tabela sem 3 de 16 ações; "ninguém gerencia posto igual" | `docs/PAPEIS_E_RESPONSABILIDADES.md` | `podeGerirPapel`: o administrador gerencia posto igual; sem teste | linhas acrescentadas, teste criado, texto do posto corrigido |
| "Provisionar município é por linha de comando, não por tela" | `PAPEIS_E_RESPONSABILIDADES.md`, `IMPLANTACAO.md` | O console do fornecedor tem "Cadastrar prefeitura" (`POST /prefeituras`) | corrigida |
| Lista do coordenador sem desinterdição e sem acompanhar quem está em campo | `PAPEIS_E_RESPONSABILIDADES.md` | `acoesDoPapel("coordenador")` | acrescentadas |
| Leitura sob suspensão "não cria registro nenhum" | `docs/SAIDA-DE-MUNICIPIO.md`; comentário de `apps/api/test/acesso-suspenso.test.ts` | O dossiê e a busca gravam `ocorrencia_consultas` (`registrarConsulta`) mesmo sob suspensão (sonda da rodada 4: 0 para 1) | corrigida nos dois, com a decisão de produto dita como pendente |
| "A janela de milissegundos da renovação" pendente de F03-E02 | `apps/web/PENDENCIAS.md` (tabela, itens 6.5 e 9.3) | Renovação em uma transação sob `travar_sessoes_do_usuario` (049) | removida da tabela, itens marcados como resolvidos |
| "A vistoria deveria poder subir SEM o arquivo perdido ... exige campo no envelope" | `apps/campo/PENDENCIAS.md` item 2 | `evidenciasPerdidas` no envelope, `abrirMaoDasEvidenciasPerdidas`, tabela `vistoria_evidencias_perdidas`, seção do laudo | item reescrito como feito |
| Cascata de lista "não tem uso ainda" | `apps/campo/PENDENCIAS.md` item 10 | `atrasoEmCascata` em `avisos`, `fila`, `index` e `perfil` | corrigida |
| O sino sincroniza "quando a aba Perfil é aberta" | `apps/campo/PENDENCIAS.md` item 12 | `sincronizarAvisos` roda na tela de avisos (e ao puxar a lista) | corrigida |
| "Nenhum registro de execução no simulador de iOS"; E15 fora da lista de capturas de emulador | `apps/campo/LEIA-ME.md`; `README.md`, `LOJAS.md`, `COLOCAR-DE-PE.md` | Relato de build Debug e abertura no Simulador (iPhone 17 Pro, iOS 26.5) nos `qa.md` da E06 e da E15, sem captura no repositório; captura de emulador da E15 em `validacao/4b96ea7/anexos/` | corrigidas (dito: compila e abre, nada além) |
| "Não existe tela" de uso de armazenamento | `docs/ARMAZENAMENTO.md` | Cartão "Uso de armazenamento" em `Organizacao.tsx` | corrigida |
| Dicionário "vai junto com a exportação de saída" | `docs/LEIA-ME.md`, `docs/DICIONARIO-DE-DADOS.md` | `saida/pacote.ts` não o emite; `SAIDA-DE-MUNICIPIO.md` diz que é entregue à parte | corrigidas |
| "As chaves estrangeiras usam ON DELETE RESTRICT" | `docs/DICIONARIO-DE-DADOS.md` | Há CASCADE e SET NULL desde a 001; a barreira é a falta de `GRANT DELETE` (032 a 034) | corrigida |
| "A tarefa sumiu: o aplicativo explica o motivo (concluída, cancelada, devolvida...)" | `docs/CARTAO-DO-AGENTE.md`, `docs/IMPLANTACAO.md`, `docs/GUIA-DO-COORDENADOR.md` | O servidor devolve `desfecho` e `motivo`; a tela do aplicativo só usa o `status` para apagar a lápide; não existe desfecho "cancelada" | corrigidas nos três |
| Lista devolve o contato | `docs/PRIVACIDADE.md` | `privacidade/lista.ts` tira contato, descrição e vulnerabilidade | corrigida |
| "A única rota de escrita sem autenticação" | `docs/COLOCAR-DE-PE.md` | `/auth/entrar`, `/auth/recuperar` e outras também gravam (credencial, sessão); a única que grava dado de negócio é `POST /publico/interesse` | corrigida |
| Indicadores "Aguardando triagem" e "Providência pendente" | `docs/GUIA-DO-COORDENADOR.md` | `Painel.tsx`: Na fila, Em campo, Atrasadas, Críticas ativas, Encerradas em 7 dias, Providências vencidas | tabela reescrita |
| A troca de papel encerra a sessão ("por uma troca de papel") | `docs/GUIA-DO-COORDENADOR.md` | Decisão da E07: a troca de papel NÃO revoga sessões; o token velho leva 401 `nao_autenticado` e a renovação traz o papel novo (`apps/api/PENDENCIAS.md`, `auth/servico.ts`, `web/dados/http.ts`) | corrigida |
| Botão Redefinir senha some "na linha de quem tem o mesmo posto ou acima" | `GUIA-DO-COORDENADOR.md` | `podeGerirPapel`: administrador gerencia administrador | corrigida |
| "O agente anterior é avisado do motivo pelo aplicativo" (troca de equipe) | `GUIA-DO-COORDENADOR.md` | O aplicativo não mostra o motivo | corrigida |
| O link "venceu, foi usado ou foi trocado por pedido mais novo" | `GUIA-DO-COORDENADOR.md` | Desde a 051 também morre em toda mudança de senha e desativação | corrigida |
| "O município nunca fica sem administrador ativo" | `GUIA-DO-COORDENADOR.md` | A conferência é por contagem sem trava (anotado em `apps/api/PENDENCIAS.md`); dois administradores se desativando juntos furam | corrigida |
| Desinterdição "com nova vistoria" | `GUIA-DO-COORDENADOR.md` | `desinterdicaoSchema` exige só motivo de 15 caracteres | corrigida |
| `npm run auditar --prefix ..` | `apps/campo/LOJAS.md` | De `apps/campo`, `..` é `apps/`, sem `package.json`; o certo é `../..` | corrigida |
| Pendência de contraste da borda do aplicativo "aparece na saída" | `README.md` | `PENDENTES` do portão está vazio; a borda passa | corrigida |
| "O trabalho que confere os números nem instala as dependências" do aplicativo | `README.md` | O job "Testes, tipos e scripts" instala (`verificar.yml`) | corrigida |
| "Cinco workspaces"; "CRLF só para `.ps1`" | `README.md` | Seis workspaces; `.gitattributes` põe CRLF também em `.bat` e `.cmd` | corrigidas |
| "ASVS 4.0 (2.4.3)" para o scrypt | `README.md`, comentário de `auth/senha.ts` | No ASVS 4.0.3 o 2.4.3 trata de PBKDF2; o item de hash com função aprovada é o 2.4.1 | corrigida |
| "Com a árvore de hoje ainda não houve run de CI" | `README.md` | Há o run 39143791434 (9 de 9, segundo o STATUS) que a rodada 4 não leu; correções posteriores sem CI | reescrita com o limite dito |
| "19 de 19 passos" como o roteiro de hoje | `README.md` | `baseline.mjs --so-listar` lista 20 passos desde a correção 4 da E03 (`e2e-firefox`) | nota acrescentada |
| "27 de 27 ... depois de aplicar as 50 migrações" | `README.md` | Com 51 migrações continua 27 (sonda desta correção) | acrescentado |
| "Nenhum dos dois (Dockerfile e compose) foi construído" | `README.md` (Contêiner) | O `Dockerfile` é a imagem de produção construída pelo Fly (`fly.toml`); o `compose.yaml` nunca foi executado | corrigida |
| Armazenamento "R2", "falta o bucket", "nunca falou com um R2 ou S3" | `README.md` (3 trechos) | Produção usa Supabase Storage por S3 (`fly.toml`, `ARMAZENAMENTO.md`); só a varredura nunca falou com o provedor | corrigidos |
| `scripts/conferir-demo.ps1` a partir de `dc360/` | `README.md` | O arquivo está na raiz do repositório | corrigida |
| "Não depende de email, que é o que ainda não existe" | `README.md` | O cliente existe e está desligado até o CP-19 | corrigida |
| `GET /saude` "responde 503 com esquema atrasado"; "50 migrações de hoje" | `docs/INDISPONIBILIDADE.md` | 503 só quando a consulta falha; esquema atrasado impede a partida; hoje são 51 e o roteiro vigente é o v3 | corrigidas |
| "O detalhe viaja no corpo cifrado"; lista sem o prazo | `docs/SUBPROCESSADORES.md` | Dado da mensagem em TLS, legível para Apple e Google; leva `prazoEm` | corrigidas |
| "`PRIVACIDADE.md` não menciona `metricas_municipio`" | `db/PENDENCIAS.md` | Cita na lista de pendências | reescrita |
| "Configurar `VITE_API_URL` no painel da Vercel" | `docs/VERCEL-PAINEL.md` seção 2 | Já vem em `vercel.json` (`build.env`) | corrigida |
| Comentários "o `npm audit` fecha em zero" | `armazenamento/s3.ts`, `busca/pontuador.ts` | `npm audit --omit=dev` da raiz fecha em zero; o aplicativo de campo só passa com `ACEITAS_NO_APLICATIVO` (`scripts/auditar.mjs`) | corrigidos (comentário), dizendo os dois |

| Depois da troca de papel o token antigo "deixa de servir no pedido seguinte" | `GUIA-DO-COORDENADOR.md` | A vigência só é conferida na ESCRITA (`servidor.ts`, `escrita` ou `comEfeito`); a leitura segue com o papel antigo até o token vencer (`vigencia-na-escrita.test.ts`, "o token de acesso continua LENDO") | corrigida: escrita recusa, leitura continua até vencer |
| `/saude` "só informa a última migração" e "não existe sonda de push" | `INDISPONIBILIDADE.md` | `servidor.ts`: devolve `ultimaMigracao`, `eliminacoes` e `push` | corrigida |
| Comentário promete `esquemaEmDia: false` em `/saude` | `apps/api/src/servidor.ts` | A resposta não tem esse campo; esquema atrasado impede a partida (`index.ts`) | comentário corrigido |
| Roteiro de restore "até `050_...sql` (50 hoje)" | `RESTORE-DO-BANCO.md` | A pasta vai até a 051 | corrigida |
| "seção 6, item 4" de `PRIVACIDADE.md` | `db/PENDENCIAS.md` | A lista é "Pendências desta política" (item 4) | corrigida |
| `api.ts#revogarAparelho` no logout | `DECLARACAO-NAS-LOJAS.md` | Sumiu; o logout chama `api.ts#sair`, que manda a ficha a `POST /auth/sair` | corrigida |
| Lista "só leva o nome" | `PRIVACIDADE.md` | `lista.ts` tira contato, descrição e vulnerabilidade; endereço e coordenada continuam | corrigida |
| "A única exceção é o PowerShell" | `.gitattributes` (comentário) | Também `.bat` e `.cmd` em CRLF | comentário corrigido |
| Título "escreve como o papel NOVO" para um caso que prova 401 | `apps/api/test/vigencia-na-escrita.test.ts` | O corpo do caso prova 401 `nao_autenticado` | só o título corrigido |
| "Quando a API entrar" | `README.md` (Autorização por papel) | A API existe | corrigida |
| Dockerfile registra o 503 de "imagem sem navegador" | `README.md`, `COLOCAR-DE-PE.md` | `Dockerfile`: o Chromium estava na imagem; o 503 vinha do pacote `playwright` em `devDependencies` | corrigida |
| Armazenamento "fechar em zero no `npm audit`" | `README.md` | Só `npm audit --omit=dev` da raiz fecha (o que `auditar` prende) | corrigida |
| Job "Testes e tipos" | `README.md` | `verificar.yml`: "Testes, tipos e scripts" | corrigida |
| "Encerrar antes de classificar" é coisa que o coordenador não consegue | `GUIA-DO-COORDENADOR.md` | Só a tela esconde o botão (`ocorrencia-regras.ts`); a API aceita encerrar de rascunho e registrada (`dominio.ts`, `POST /:id/encerramento`) | corrigida; achado de produto registrado em `apps/api/PENDENCIAS.md` (item 4) |
| "Na fila" = ocorrências ativas que esperam andamento | `GUIA-DO-COORDENADOR.md` | `status NOT IN ('encerrada','rascunho')`: inclui `em_campo` | corrigida |
| Desinterdição "15 caracteres ou mais" | `GUIA-DO-COORDENADOR.md` | O esquema mede antes do `trim`; a rota grava o texto aparado | dito no guia; registrado em `apps/api/PENDENCIAS.md` (item 5) |
| Coordenação "interdita" | `GUIA-DO-COORDENADOR.md` | O termo só sai com `interdicao_indicada` da vistoria vigente | corrigida |
| Prazos por severidade "configurados pelo município"; "o relógio começou na triagem" | `GUIA-DO-COORDENADOR.md`, `IMPLANTACAO.md` | `PRAZO_PADRAO_HORAS` fixo (72, 48, 24, 4); `prazo_em = criado_em + horas`, gravado na triagem | corrigidas nos dois |
| Duplicidade "mesmo endereço" | `GUIA-DO-COORDENADOR.md` | `GET /duplicidades/consulta`: mesmo tipo, ativa, 48 horas, começo do endereço | corrigida |
| Papel "não existe acima do administrador, nem para os fornecedores" | `PAPEIS_E_RESPONSABILIDADES.md` | O console do fornecedor lista todos os municípios com contagens, cadastra, suspende e agenda eliminação, e não vê dado de cidadão | reescrito com o que ele vê e faz |
| "Acionei apoio" exige o que foi acionado "e a que horas" | `SEGURANCA-DO-AGENTE.md`, `GUIA-DO-COORDENADOR.md` | `schemas.ts`: observação de pelo menos 3 caracteres; a hora é o carimbo do servidor | corrigidas |
| "Registre no papel e digite depois, com a data real do atendimento" | `GUIA-DO-COORDENADOR.md`, `INDISPONIBILIDADE.md` | Não há campo para a data real: `criado_em` é `now()` e o prazo conta daí | corrigidas |
| "onze itens da lateral"; "os dois últimos testes de CA-06"; "o design system tem dois casos"; três portões em `scripts/` | `README.md`, `apps/web/PENDENCIAS.md` | Dez itens no código (nove para o administrador); o bloco "Isolamento sob concorrência"; mais casos; há outros portões | corrigidas |
| expo-doctor só até 2026-10-14; `test:api` "20 pulados"; "o município não fica sem administrador" | `README.md` | Voltou a 20 de 21 em 2026-10-18; 34 pulados hoje; a conferência do último administrador não é à prova de corrida | corrigidas |

| A lateral tem "dez itens" (ou "nove" para o administrador) | `README.md`, `apps/web/PENDENCIAS.md` (itens 9.2 e 11) | `Estrutura.tsx`: 10 destinos mais "Tema" e "Sair" na mesma barra: 12 controles, 11 para o administrador | corrigidas |
| Corrida do último administrador entre "dois que se desativam" | `README.md` | A autodesativação é proibida; a corrida é um desativando ou rebaixando o outro | corrigida |
| Tabela "gerada" a partir de `acoesDoPapel` | `README.md` | O teste gera a tabela esperada em memória; o README é colado à mão | corrigida |
| "nenhum run de CI repetiu" o roteiro de 20 passos; 34 pulados explicados só pela E07 e E10 | `README.md` | O run 39143791434 já tinha o `e2e-firefox` (verde segundo o STATUS); a subida inclui a correção 3 da E09 (+13) | corrigidas |
| "Ver a Parte 2 de `COLOCAR-DE-PE.md`" | `README.md` | O Dockerfile e o `fly deploy` estão na Parte 3, item 3 | corrigida |
| `/saude` dá 503 "ou o esquema está atrasado"; "o `npm audit` deste produto" sem `--omit=dev` | `fly.toml`, `README.md` | Esquema atrasado impede a partida, não vira 503; `--omit=dev` | corrigidos |
| "só números" no `/saude` | `servidor.ts` (comentário) | `push.rodadaEm` é instante; sem nome de município nem de pessoa | comentário corrigido |
| "A lista delas está logo abaixo" (providências vencidas) | `GUIA-DO-COORDENADOR.md` | O cartão lista todas as sem resposta, vencidas e no prazo, no máximo 8, abaixo da fila, e some se não houver | corrigida |
| Desinterdição: "espaços valem" | `GUIA-DO-COORDENADOR.md`, `apps/api/PENDENCIAS.md` (item 5) | O painel apara antes de validar (`Ocorrencia.tsx`); só a API conta o texto bruto | corrigidas |
| "o painel e o aplicativo renovam sozinhos e repetem"; leitura "até 15 minutos" | `GUIA-DO-COORDENADOR.md` | No aplicativo só a fila renova e repete (uma vez); o sino do painel consulta `GET /avisos` (rota com efeito) a cada ~30 s, então o painel percebe a troca em cerca de meio minuto; 15 minutos é o teto | corrigidas |
| `motivo` "em linguagem de quem está na rua" | `apps/campo/PENDENCIAS.md` (item 18), `IMPLANTACAO.md` | `motivo` é nulo em concluída e outra equipe; `desfecho` carrega os quatro | corrigidas |
| Arquivo "que SUMIU" é o único marcado perdido | `apps/campo/PENDENCIAS.md` (item 2) | Arquivo de zero byte também | corrigida |
| Console: lista "ofícios emitidos e aparelhos ativos, nome, dias" | `PAPEIS_E_RESPONSABILIDADES.md` | A tela mostra município (UF), sinal (calado depois de 36 h), acesso, entraram, encerradas, vistorias, abertas, atrasadas, servidores, aparelhos sumidos e mediana | reescrito |
| Formulário de interesse "única rota pública que grava" | `COLOCAR-DE-PE.md` | `GET /publico/oficio/:token` grava `oficio_aberturas` e `PUT /armazenamento/objeto` grava a foto | corrigida |
| Barreira de DELETE é "a ausência de GRANT DELETE (032 a 034)" | `DICIONARIO-DE-DADOS.md` | São duas: sem GRANT (001, 002, 005, 016, 017, 022) e sem policy de DELETE (032 a 034 recortaram as policies `FOR ALL`) | corrigida |
| "A trilha não se reescreve nem se apaga" | `PAPEIS_E_RESPONSABILIDADES.md`, `GUIA-DO-COORDENADOR.md`, `SEGURANCA-DO-AGENTE.md`, `README.md` | Append-only para a aplicação e para quem administra; exceções definidas no banco: `minimizar_por_prazo` (043) troca o assinante no evento `vistoria`, e a eliminação do município (038) apaga tudo, trilha inclusa | corrigidas nos quatro |
| O laudo reúne "o contato" do solicitante | `PAPEIS_E_RESPONSABILIDADES.md`, `README.md` | `laudo.ts` imprime o nome, não o contato | corrigidas |
| Agente "coleta e cala" | `PAPEIS_E_RESPONSABILIDADES.md` | O agente marca "Necessário acionar outro órgão" e indica quais (`vistoria_orgaos_indicados`); não cria a providência | corrigida |
| Coordenador "exporta dados"; administrador "tudo do coordenador mais alterar dados" | `PAPEIS_E_RESPONSABILIDADES.md`, `README.md` | CSV completo, pacote de saída e troca de e-mail de outra pessoa são do administrador | corrigidas |
| Minuta no aparelho como proposta futura | `PAPEIS_E_RESPONSABILIDADES.md` | Já existe (`minuta.ts`, `MinutaDoLaudo`); falta a aprovação | corrigida |
| Ordena "quem foi sozinho na frente"; "hora do aparelho" no encerramento | `GUIA-DO-COORDENADOR.md`, `SEGURANCA-DO-AGENTE.md` | Só entre as vencidas; no encerramento só há `now()` | corrigidas |
| Painel "executa `001_base.sql`"; `FalhaDeSessao`; "será `expo-sqlite`"; "quando o PDF entrar"; CSV com contato | `README.md` | Executa todas as migrações; também `troca_de_senha_obrigatoria`, e `acesso_suspenso` é temporário; `expo-sqlite` já existe; PDF já existe; só o nível completo (administrador) | corrigidas |
| Prorrogação conta "do prazo corrente" | `packages/shared/src/schemas.ts` (comentário) | `saida-a-campo.ts`: conta de `now()`, com `GREATEST` | comentário corrigido |

Conferidas contra o código, sem mudança, as de maior risco das correções novas: troca de senha sob a trava e login (`README.md:133` e `:137`, `apps/api/PENDENCIAS.md`), migração 051 e `consumir_recuperacao` com conta ativa (`README.md:136`, `COLOCAR-DE-PE.md`, `DICIONARIO-DE-DADOS.md`, `RESTORE-DO-BANCO.md`: "a 051 não acrescenta função `SECURITY DEFINER`"), catálogo de 10 códigos e `CODIGOS_DA_ENTRADA` (`README.md`), `openssl-do-teste` (V-API-3, `README.md`), restore v3 (`RESTORE-DO-BANCO.md`), id normalizado da E09 (sem afirmação em documento), diálogo de saída da E15 (sem afirmação em documento além de `PENDENCIAS` do campo, item 15).

### Achados de código, registrados e NÃO consertados (não são desta etapa)

1. A leitura sob suspensão grava `ocorrencia_consultas` (decisão de produto, pendência humana já listada no `VEREDITO.md`; a documentação agora diz o que o código faz).
2. O aplicativo de campo não mostra o motivo de a tarefa sair da lista (o servidor devolve `desfecho` e `motivo`); a documentação agora diz isso.
3. Desativar ou rebaixar o último administrador confere por contagem sem trava (já anotado em `apps/api/PENDENCIAS.md`).
4. Encerrar ocorrência antes da triagem é regra só da tela: a API aceita (`apps/api/PENDENCIAS.md`, item 4; contraria a regra do projeto de que regra de negócio mora no banco e no pacote compartilhado; dono provável F10).
5. A desinterdição mede os 15 caracteres do motivo antes do `trim` (`apps/api/PENDENCIAS.md`, item 5).
6. O aplicativo de campo não mostra por que a tarefa saiu da lista (`apps/campo/PENDENCIAS.md`, item 18).

### Arquivos tocados

Código de produção: nenhum (só comentários em `apps/api/src/auth/senha.ts`, `apps/api/src/armazenamento/s3.ts`, `apps/api/src/servidor.ts`, `apps/web/src/busca/pontuador.ts` e `packages/shared/src/schemas.ts`; nos testes, o comentário de `apps/api/test/acesso-suspenso.test.ts` e o título de um caso de `apps/api/test/vigencia-na-escrita.test.ts`; o comentário de `.gitattributes`, na raiz, e o de `dc360/fly.toml`). Teste novo: `dc360/packages/shared/test/permissoes-no-readme.test.ts`. Roteiro: `dc360/scripts/baseline.mjs` (só a entrada nova). Documentação: `dc360/README.md`, `apps/campo/{LEIA-ME,LOJAS,PENDENCIAS}.md`, `apps/web/PENDENCIAS.md`, `apps/api/PENDENCIAS.md`, `db/PENDENCIAS.md`, `docs/{ARMAZENAMENTO,CARTAO-DO-AGENTE,COLOCAR-DE-PE,DECLARACAO-NAS-LOJAS,DICIONARIO-DE-DADOS,GUIA-DO-COORDENADOR,IMPLANTACAO,INDISPONIBILIDADE,LEIA-ME,PAPEIS_E_RESPONSABILIDADES,PRIVACIDADE,RESTORE-DO-BANCO,SAIDA-DE-MUNICIPIO,SEGURANCA-DO-AGENTE,SUBPROCESSADORES,VERCEL-PAINEL}.md`. Evidência: esta pasta e as linhas no `INDEX.md` de topo da E22.

### Passagens de conferência independente

Depois da primeira entrega, dois revisores em sequência conferiram o TEXTO NOVO linha a linha contra o código (conferidores A a C, mais uma amostra larga de 218 afirmações do texto não tocado, conferidor D). Todo item FALSO ou IMPRECISO deles virou linha da tabela acima; os NÃO VERIFICÁVEIS ("nunca executado", pasta temporária, dono provável F10) passaram a dizer só o que se prova. Fica de fora, por decisão do Rafael pendente (H30, ligada à D-25): o estado vazio de `QuemEstaEmCampo.tsx` ("Declarar a saída é um passo do aplicativo do agente"), que o texto da tela afirma e o aplicativo ainda não cumpre; não foi mexido.

### Limitações

- Varredura por leitura e por sonda mecânica, não exaustiva. Dois documentos foram lidos só pelo conferidor independente e por mim por amostra: `SEGURANCA-DO-AGENTE.md` e `POLITICA-DE-TESTE-VERMELHO.md` (sem divergência reportada).
- Medições datadas de máquina (macOS de 2026-10-14, Windows) e números de run de CI não são verificáveis pelo código e foram tratados como históricos.
- Sem CI, sem `npm audit`, sem aparelho. A validação humana da etapa (Rafael lê a tabela antes e depois) continua pendente.

## Justificativa

A rodada 4 repetiu a classe de defeito das três anteriores: documento que afirma o que o código não faz. A causa comum foi a mesma nas duas tabelas de permissões: uma frase prometia um teste que nunca existiu, então a tabela voltou a divergir na primeira ação nova. Por isso o conserto principal não é texto, é o teste: ele gera a tabela do catálogo e reprova nos dois sentidos (falta e sobra), com mutação real arquivada, e cobre também `PAPEIS_E_RESPONSABILIDADES.md`, que tinha a mesma promessa e a mesma lacuna.

Onde o documento e o código divergiam, decidiu o código (regra da etapa). Nos três casos em que o código parece o errado (leitura sob suspensão grava, aplicativo sem o motivo da saída da lista, último administrador sem trava), a documentação passou a dizer o que o código faz e o achado ficou registrado, sem consertar: resolver pendência não é desta etapa. A varredura foi refeita com um segundo par de olhos (o conferidor em Sonnet) porque a leitura do próprio autor falhou três vezes seguidas nesta etapa; cada achado dele foi reconferido contra o código antes de virar texto, e o que ele não conseguiu conferir está dito acima. A entrada do `baseline.mjs` não leva `puladas` porque a base do shared não as conta; é a diferença em relação à regra geral, e o `baseline.test.mjs` a protege.
