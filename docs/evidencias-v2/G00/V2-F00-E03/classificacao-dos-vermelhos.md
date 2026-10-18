# V2-F00-E03: Classificação dos vermelhos por causa

Data: 2026-10-05. Base: as saídas arquivadas da E01 (`docs/evidencias-v2/G00/V2-F00-E01/saidas/*.txt`, medidas em 2026-10-05 sobre o commit `e82719e`), conferidas uma a uma contra o código citado. Nenhum código foi alterado nesta etapa. Cada afirmação da etapa foi relida no arquivo e na linha (seção 4): onde não bateu, a divergência está na seção 5 e não foi copiada.

Situação da decisão: a regra da seção 1 está aplicada como PREMISSA (STATUS, seção 9), porque Rafael ainda não decidiu BZ-N:N.3. A validação humana pedida está na seção 7.

**Atualização de 2026-10-13 (correção 1 da E03).** As seções 1 a 7 são a fotografia de 2026-10-05, escrita antes das 22 etapas seguintes, e dizem "Fecha em" no futuro. A seção 8 é o registro vivo: cada linha com seu estado de hoje (FECHADO ou ABERTO), a etapa e o commit que fecharam, a prova do comando que rodou, e, para o que segue aberto, dono, issue e prazo pela política T42. As instabilidades conhecidas (`resolver-link.test.ts`, `dominio.test.ts`, `regras-de-conteudo`, `test:isolamento`, o e2e da API em Firefox) entram ali como linhas. A contagem final está em 8.7. Onde as seções antigas e a 8 divergirem, vale a 8.

## 1. Classes e regra aplicada

| Classe | O que é | O que muda | Regra |
| --- | --- | --- | --- |
| A | Defeito real, ou funcionalidade que o teste exige e o código nunca teve | O código. O teste fica como está | R2 |
| B | Teste desatualizado: o código tem uma decisão datada, posterior ao teste, e um teste irmão que passa a afirma | O teste, com registro em `docs/DECISOES-DE-TESTE-DA-FASE-00.md` | R1 |
| C | Ambiente ou portabilidade: a regra do teste vale, mas ele depende da máquina (fim de linha, variável de ambiente, `npm` no Windows, caminho POSIX, cache local) | O jeito de o teste ou o script falar com a máquina, sem enfraquecer o que ele afirma. Se o teste mudar, registro igual ao da classe B | R3 |
| D | Número escrito em documento que envelheceu: o conferidor está certo | O texto do documento | R4 |
| E | Dependência com vulnerabilidade ou versão fora da faixa: não é teste, é pacote | O pacote, conforme a política de audit (CP-03) | R5 |
| F | Instável: passa e falha sem mudar o código | A espera do teste, de tempo fixo para condição com limite | R6 |

As regras R1 a R6 estão escritas em `dc360/docs/POLITICA-DE-TESTE-VERMELHO.md`, seção "Quando o teste e o código discordam". Em uma frase: onde há decisão datada no código e teste irmão passando, o código vale e o teste é reescrito com registro (R1); onde o teste descreve como defeito algo confirmado por leitura do código, o teste vale e o código é consertado (R2). Sem uma das duas provas o teste não se reescreve: trata-se como defeito até Rafael dizer o contrário.

Dono de todas as linhas: `rafael` (dono padrão, premissa da E02). "Fecha em" é a etapa da fase 00 que o conserta.

## 2. A soma contra o baseline da E01

| Passo da E01 | Baseline | Linhas deste registro | Fecha em |
| --- | --- | --- | --- |
| `teste-shared` | 1 falha de 149 | V-SHA-1 (1) | E20 |
| `teste-web` | 14 falhas de 550 | V-WEB-01 a V-WEB-14 (14: 8 + 5 + 1) | E09 (8), E13 (5), E21 (1) |
| `teste-api` | 2 falhas, 18 pulados, de 1109 | V-API-1 e V-API-2 (2); 13 pulados de V-API-S1 (a suíte `banco-tls`); 5 pulados de V-API-S2 (a vigência) | E07, E12, E21, E04 |
| `teste-db` | 3 pulados de 318, verde | nenhuma linha: pulo por ambiente (`it.runIf` de `db/test/busca.test.ts`), contado pelo portão da E02 | nenhuma |
| `typecheck`, `teste-campo-pacote`, `teste-console` | verdes | nenhuma | nenhuma |
| `teste-campo-app` (jest) | 20 falhas de 1801 | V-CAM-01 a V-CAM-20 (20: 2 + 4 + 14) | E14 (6), E15 (7), E16 (7) |
| `test-campo` | sai 2 no typecheck | V-TC-1 (2 erros de tipo) | E21 |
| `test-scripts` | 3 falhas de 181 | V-SCR-1 a V-SCR-3 (3) | E17 |
| `conferir-numeros` | 13 afirmações | V-NUM-01 a V-NUM-13 (13) | E17 (rodada final na E22) |
| `auditar`, `audit-raiz`, `audit-campo`, `expo-doctor` | 4 passos vermelhos | V-DEP-1 a V-DEP-4 (4) | E19 |
| `e2e`, `e2e-api` (e Firefox) | 3 execuções vermelhas (2 medidas na E01, Firefox só em 2026-09-30) | V-E2E-1 a V-E2E-3 (3) | E13 e E18 |

Total de testes vermelhos propriamente ditos: 1 + 14 + 2 + 20 + 3 = 40. Mais: 13 casos que a suíte `banco-tls` não chega a rodar, 5 casos pulados da vigência, 13 afirmações de números, 1 passo de typecheck, 4 passos de dependência e 3 execuções de navegador. Os 17 passos medidos continuam todos com situação `confere`: este registro não cria nem retira nenhum vermelho do baseline. Nenhum vermelho do baseline ficou sem linha, e nenhuma linha existe sem vermelho no baseline (o vermelho novo da E02, instável, está na seção 6 e não entra na soma do baseline).

## 3. O registro, vermelho por vermelho

Fonte de cada mensagem: arquivo e linha da saída da E01 (pasta `saidas/`). Causa "confirmada em" é o arquivo e a linha lidos nesta etapa.

### 3.1 Pacote compartilhado (1)

| ID | Teste | Mensagem na saída | Causa confirmada em | Classe | Fecha em |
| --- | --- | --- | --- | --- | --- |
| V-SHA-1 | `packages/shared/test/regras-de-conteudo.test.ts` > "nenhum travessão em texto nenhum" | `02-teste-shared.txt:40-47`: 5 ocorrências em 3 arquivos | `apps/web/test/trilha-detalhe.test.ts:181` (o caractere dentro de um `not.toContain`, nascido em 5ecdf4c, 2026-09-15), `docs/AUDITORIA-2026-09-30.md:313` (relatório que cita o caractere) e `docs/auditoria-v2/raw/teste-shared.txt:23,33,41` (saída bruta que reimprime a linha). O portão está certo; as fontes são legítimas | C | E20 |

Regra R3. A reescrita prevista (literal vira escape; isenção por extensão) mexe no teste de varredura e precisa de registro: está em `docs/DECISOES-DE-TESTE-DA-FASE-00.md`, seção "shared: varredura de travessão".

### 3.2 Painel (14)

| ID | Teste | Mensagem na saída | Causa confirmada em | Classe | Fecha em |
| --- | --- | --- | --- | --- | --- |
| V-WEB-01 | `acessibilidade.test.ts` > "nenhum onClick pendurado em elemento que o teclado não alcança" | `07-teste-web.txt:331-340`: `componentes/Modal.tsx:260` | A exceção "acessibilidade: excecao" está escrita em `Modal.tsx:254` (eafc4ca, 2026-09-09), num bloco de comentário que termina em :259; o último commit do teste é 88c6bcf (2026-08-28). O portão olha só as 4 linhas acima do elemento (`acessibilidade.test.ts:318`, `slice(el.linha - 5, el.linha - 1)`), então não a enxerga. O código está certo e o portão é estreito | B | E13 |
| V-WEB-02 | `design-system.test.ts` > "nem no CSS, nem nos estilos escritos dentro do componente" | `07-teste-web.txt:353-370`: `componentes/Estrutura.tsx:132` | `borderRadius: "8px"` à mão em `Estrutura.tsx:132`, nascido em b387ee3 (2026-09-17), depois do teste (2026-09-15). A classe `.lateral__marca` existe em `estilos/app.css:146`. Defeito real, o teste vale | A | E13 |
| V-WEB-03 | `ocorrencia-encerramento.test.ts` > "nada grava o encerramento fora do ramo de confirmação" | `07-teste-web.txt:384-398`: esperava 1 chamada de `onEnviar(`, achou 4 | `ocorrencia-encerramento.test.ts:166` procura `"\n}\n"`. Com `core.autocrlf=true` e sem `.gitattributes`, o índice fica LF e a árvore CRLF (`git ls-files --eol`: `i/lf w/crlf`), o marcador não existe, `slice(inicio, -1)` pega o arquivo todo | C | E21 |
| V-WEB-04 | `seguranca-da-conta.test.ts` > "os dois botões existem, por linha, e chamam a camada de dados" | `07-teste-web.txt:403`: `redefinirSenhaDeUsuario(` não está em `Usuarios.tsx` | Nenhuma página chama as funções que existem em `dados/http.ts:752,762,854`, `local.ts:458,471,478` e `repositorio.ts:65-73`. Funcionalidade ausente, teste de 2026-09-15 (5ecdf4c) | A | E09 |
| V-WEB-05 | idem > "cada um pergunta antes, com o nome da pessoa no botão, e é destrutivo" | `:854`: `BotaoRedefinirSenha não existe em Usuarios.tsx` | idem | A | E09 |
| V-WEB-06 | idem > "só quem o posto deixa administrar vê os botões, pela função da tela e não por cópia da regra" | `:866`: esperava `/usuarioId/` num trecho vazio | idem | A | E09 |
| V-WEB-07 | idem > "a senha temporária aparece uma vez, copiável, com a frase de que não volta" | `:885`: componente `SenhaTemporaria` indefinido (não exportado) | idem | A | E09 |
| V-WEB-08 | idem > "depois de encerrar as sessões, a tela confirma com um Toast" | `:900`: frase "Sessões de ... encerradas" ausente | idem | A | E09 |
| V-WEB-09 | idem > "no modo de demonstração os botões não aparecem, e a tela diz por quê" | `:1351` | idem | A | E09 |
| V-WEB-10 | "Minha conta: encerrar minhas outras sessões" > "o botão existe, chama a camada de dados e pergunta antes" | `:1802`: `encerrarMinhasSessoes(` ausente de `MinhaConta.tsx` | idem | A | E09 |
| V-WEB-11 | idem > "no modo de demonstração o cartão explica em vez de oferecer" | `:2161` | idem | A | E09 |
| V-WEB-12 | `semente-e-confirmacoes.test.ts` > "paginas/Usuarios.tsx anuncia o que gravou com um Toast" | `:2180`: `paginas/Usuarios.tsx não usa Toast` | `<Toast` só existe em `paginas/Ocorrencia.tsx:386`. O teste descreve o defeito (cadastrar não confirma nada para leitor de tela); defeito real | A | E13 |
| V-WEB-13 | idem > "paginas/Equipes.tsx anuncia o que gravou com um Toast" | `:2631` | idem | A | E13 |
| V-WEB-14 | idem > "paginas/Orgaos.tsx anuncia o que gravou com um Toast" | `:2907` | idem | A | E13 |

### 3.3 API (2 vermelhos, 1 suíte e 5 pulados)

| ID | Teste | Mensagem na saída | Causa confirmada em | Classe | Fecha em |
| --- | --- | --- | --- | --- | --- |
| V-API-1 | `senha-provisoria.test.ts:183` > "uma sessão viva cuja senha provisória venceu no meio não escreve nem renova" | `05-teste-api.txt:789-805`: recebeu 200, esperava 401 | `auth/servico.ts:667` (`trocarSenha`) só confere a senha atual; a marca `sp` do token não expira; `auth/vigencia.ts:69-70` trata a sessão rotacionada como viva. Defeito real. A asserção da linha 184 (`erro` igual a `"sessao"`) será renomeada pelo catálogo da E05: ver a seção "api: senha provisória vencida" do registro de decisões | A | E07 |
| V-API-2 | `saida-de-municipio.test.ts:364` > "o laudo do pacote imprime o aviso de equipe divergente, como o laudo emitido" | `:434-440`: HTML do laudo sem "estava designada à Equipe Alfa" | `saida/pacote.ts:479-494` seleciona só `usuarios u` e `sem_despacho`; `rotas/documentos.ts:108-118` junta `equipes ed` e `ea` e `documentos/laudo.ts:503` (`avisoDeEquipe`) imprime. O conserto nasceu como teste em 5ecdf4c e nunca entrou. Defeito real | A | E12 |
| V-API-S1 | `banco-tls.test.ts` (suíte inteira, 13 casos, reportados como pulados) | `05-teste-api.txt:417-430`: `Command failed: openssl req -x509 ...` no `beforeAll` | `banco-tls.test.ts:109` roda `openssl` herdando o ambiente. `OPENSSL_CONF` desta máquina aponta para `C:\Program Files\PostgreSQL\psqlODBC\etc\openssl.cnf`, que não existe. Prova de 2026-09-30: 13 de 13 passam sem a variável (`docs/auditoria-v2/raw/teste-banco-tls-sem-openssl-conf.txt`). A saída da E01 não mostra a causa porque o teste usa `stdio: "ignore"` | C | E21 |
| V-API-S2 | `vigencia-na-escrita.test.ts:103` (`describe.skip`, 5 casos) | `05-teste-api.txt:193`: 9 testes, 5 pulados | O teste descreve o defeito (conta desativada ainda escreve) e o código está desligado de propósito em `servidor.ts:454-467` (b4439ac, 2026-09-17). Está pulado com a marca T42 `ate=2026-11-05` | A | E04 |

### 3.4 Aplicativo de campo, jest (20)

Os 14 defeitos (V-CAM-07 a V-CAM-20) são tratados como defeitos reais até Rafael dizer o contrário (premissa).

| ID | Teste | Causa confirmada em | Classe | Fecha em |
| --- | --- | --- | --- | --- |
| V-CAM-01 | `a-sessao-que-terminou-nao-e-falta-de-sinal.test.tsx:203-204` > "o ⓘ ensina o caminho de volta, e promete a fila de pé" (`08-teste-campo-app.txt:70`) | Espera `/Sair da conta/` e `/continua guardado no aparelho/`. O código manda "Entrar de novo" e "Nada é apagado" de propósito (`falha-de-atualizacao.ts:100-130`, `index.tsx:1222`, "Até 15/09/2026 este botão chamava `sair()`" e `sair()` apaga a vistoria começada). Evidência datada em V-CAM-01 e V-CAM-02: o teste é de 2026-09-14 (dcdcec9) e a decisão no código é de 2026-09-15 23:28 (5ecdf4c); teste irmão passando: `a-sessao-vencida-nao-apaga-a-vistoria.test.tsx` (`08-teste-campo-app.txt:8051`) | B | E14 |
| V-CAM-02 | `perfil-a-sessao-que-terminou-e-o-aviso-que-fecha.test.tsx:156-159` > "e ensina o caminho de volta, sem prometer o que não vale" (`:3545`) | Espera `toque em "Sair da conta" e entre de novo`; a tela mostra "Toque em \"Entrar de novo\" ... Nada é apagado". Último commit do teste: 4a55563 (2026-09-15 13:18), anterior à decisão. Mesmo teste irmão | B | E14 |
| V-CAM-03 | `push/logout-cala-o-aparelho.test.tsx` > "manda a ficha deste aparelho junto com a saída" (`:4`) | `TypeError: acolherNoAparelho is not a function`. O dublê de `../dados/banco-local` (`logout-cala-o-aparelho.test.tsx:18-20`) só tem `apagarDadosLocais`; `dados/sessao.tsx:4,150,180,247` importa e chama `acolherNoAparelho` e `marcarDonoDosDadosLocais` (`banco-local.ts:252`, `:228`), introduzidos em 5ecdf4c (2026-09-15). O teste é de 57795e9 (2026-09-09) e nunca foi tocado depois. Teste irmão passando: `dados/logout-nao-apaga-prova.test.ts` (`:8147`) | B | E14 |
| V-CAM-04 | idem > "sai normalmente quando este aparelho nunca teve ficha" (`:21`) | idem | B | E14 |
| V-CAM-05 | idem > "esquece a ficha depois de mandá-la, para ela não sobreviver ao turno" (`:37`) | idem | B | E14 |
| V-CAM-06 | idem > "guarda o município da sessão, que é o que a barreira de push compara" (`:53`) | idem | B | E14 |
| V-CAM-07 | `ui/dialogo-na-conta-com-vistoria-comecada.test.tsx` > "diz quantas vistorias começadas serão apagadas, e que as fotos vão junto" (`:388`) | `perfil.tsx:449-453` lê `fila.resumo()` uma vez e o diálogo (`:535-541`, `:1462-1467`) só conta a fila; `listarRascunhos` e `useResumoDaFila` não aparecem em `perfil.tsx`. `sair()` (`sessao.tsx:190-224`) chama `apagarDadosLocais` (`banco-local.ts:286`), que leva o rascunho. O comentário de `banco-local.ts:273-277` afirma que o diálogo avisa. O teste cita "achados do revisor de 15/09/2026"; `perfil.tsx` não mudou depois de bcb02c0 (2026-09-15 17:03), antes do teste (5ecdf4c, 23:28). Defeito real | A | E15 |
| V-CAM-08 | idem > "uma só, sem foto: singular, e sem prometer foto que não existe" (`:1177`) | idem | A | E15 |
| V-CAM-09 | idem > "o botão de confirmar é o de perigo, porque o ato apaga" (`:1966`) | idem | A | E15 |
| V-CAM-10 | idem > "sem vistoria começada e sem fila, a pergunta não fala em apagar" (`:2014`) | idem | A | E15 |
| V-CAM-11 | idem > "quando a fila esvazia, o chip e o aviso de esperar somem sem trocar de aba" (`:2062`) | idem (leitura única da fila, `perfil.tsx:449-453`) | A | E15 |
| V-CAM-12 | idem > "o diálogo de saída conta a fila de AGORA, e não a da montagem" (`:2756`) | idem | A | E15 |
| V-CAM-13 | `vistoria-o-teclado-a-camera-e-o-que-ela-promete.test.tsx` > "abaixo de meio metro vira 1, e não zero" (`:6982`) | `vistoria/[id].tsx:1447` faz `Math.round(posicao.coords.accuracy)` (abaixo de 0,5 vira 0) e `packages/shared/src/schemas.ts:411` exige `z.number().positive()`: o servidor responderia 422. Defeito real | A | E15 |
| V-CAM-14 | idem > "não promete envio com o aplicativo fechado, porque isso não existe" (`:4779`) | `vistoria/[id].tsx:2233` diz "mesmo com o aplicativo fechado"; `package.json` e `app.config.ts` não têm `expo-task-manager` nem modos de fundo | A | E16 |
| V-CAM-15 | idem > "o primeiro toque fora do campo AGE, em vez de só fechar o teclado" (`:4797`) | `vistoria/[id].tsx` não tem `keyboardShouldPersistTaps` | A | E16 |
| V-CAM-16 | idem > "a rolagem sabe a altura do teclado, para o campo digitado não ficar embaixo dele" (`:4816`) | a tela não trata teclado (nenhuma ocorrência de `Keyboard`) | A | E16 |
| V-CAM-17 | idem > "reserva a área segura de baixo, onde o menu escondido não está mais para reservar" (`:4835`) | a tela não usa `useSafeAreaInsets` | A | E16 |
| V-CAM-18 | idem > "de câmera: a tarja traz 'Abrir os ajustes do aparelho', e o botão abre os ajustes" (`:4888`) | a tela não chama `openSettings` (o padrão existe em `src/push/PortaExpo.ts`) | A | E16 |
| V-CAM-19 | idem > "de localização: a mesma tarja, o mesmo botão" (`:5935`) | idem | A | E16 |
| V-CAM-20 | idem > "a tarja diz a frase certa, com o que fazer, e não a genérica" (`:7001`) | `fotografar` tem `catch` genérico ("Tente de novo", `vistoria/[id].tsx:1482`) e engole a frase de `evidencia-no-disco.ts` ("Tire a foto de novo") | A | E16 |

Contagem: B = 6 (V-CAM-01 a V-CAM-06), A = 14 (V-CAM-07 a V-CAM-20), 7 para a E15 (V-CAM-07 a V-CAM-13) e 7 para a E16 (V-CAM-14 a V-CAM-20).

### 3.5 Typecheck do campo, scripts, números, dependências e navegador

| ID | O que | Mensagem na saída | Causa confirmada em | Classe | Fecha em |
| --- | --- | --- | --- | --- | --- |
| V-TC-1 | `npm run test:campo` sai 2 no typecheck; o jest e a contagem não chegam a rodar | `09-test-campo.txt`: TS2345 em `perfil.tsx(1212,44)` e `Sino.tsx(154,73)`, rota `"/(agente)/avisos"` | `apps/campo/.expo/types/router.d.ts` (ignorado pelo git, arquivo de 2026-08-29) tem 0 ocorrências de `avisos`, `perfil` e `mapa`, que existem em `src/app/(agente)/`. Prova de 2026-09-30: sem o cache o typecheck passa com 0 erros | C | E21 |
| V-SCR-1 | `comando-de-migracao.test.mjs:52` > "rodando da raiz, --conferir confere e NÃO aplica" (caso 35 na saída, 19 na contagem antiga) | `10-test-scripts.txt:214-231`: "o comando não chegou a CONFERIR nada" | `execFileSync("npm", ...)` na linha 68: `npm` é `npm.cmd` no Windows e dá ENOENT; o `catch` engole e a saída fica vazia. `scripts/testar-campo.mjs:103` já usa `shell: process.platform === "win32"` | C | E17 |
| V-SCR-2 | `copiar-producao.test.mjs:48` > "a pasta de copias recusa o repositorio, a nuvem de arquivos e a Area de Trabalho" (caso 38, antigo 22) | `:248-267`: `The "string" argument must be of type string. Received type object (null)` | caminhos POSIX literais (`/Users/[usuario]/...`) passados a `razaoParaRecusarAPasta`, que usa `resolve` e `sep`; no Windows viram `C:\Users\[usuario] e a função devolve `null` | C | E17 |
| V-SCR-3 | `entitlements-do-ios.test.mjs:73` > "a escolha do ambiente continua morando no app.config.ts, e não escrita à mão" (caso 53, antigo 37) | `:354-360`: "app.config.ts deixou de decidir o aps-environment pelo perfil do build" | o regex procura a escrita literal `EAS_BUILD_PROFILE"] === "producao" ? ...`; `app.config.ts:158` a guarda na constante `PERFIL_DE_PRODUCAO`, lida em `:597` (`mode`) e `:642` (`pushAmbiente`) de propósito, para não haver duas expressões. Decisão datada: 5ecdf4c (2026-09-15 23:28); último commit do teste: bcb02c0 (2026-09-15 17:03). Não há teste irmão que afirme o mesmo, então a reescrita precisa afirmar a constante e os dois usos (como a E17 prevê) | B | E17 |
| V-NUM-01 a V-NUM-13 | `conferir:numeros`: 13 afirmações (`11-conferir-numeros.txt`) | `docs/COLOCAR-DE-PE.md:40` e `:288` (3927 testes, real 1801 ou 4337); `README.md:12` (285, real 315), `:13` (454, real 550), `:14` (962, real 1104 ou 103), `:15` (138, real 159), `:16` (1708, real 1801 ou 4337), `:17` (250, real 259); `README.md:1103` (2219, real 2536), `:1104` (285, real 315), `:1105` (962), `:1106` (138), `:1107` (1708) | 2 + 6 + 5 = 13 afirmações. O conferidor está certo; o texto envelheceu. A API lista estaticamente 1104 testes e executa 1109: os 5 do `describe.skip` não entram na lista | D | E17 |
| V-DEP-1 | `auditar` (`12-auditar.txt`) | `spawnSync npm ENOENT` em `scripts/auditar.mjs:61` | mesma causa de V-SCR-1 (`npm` sem `shell` no Windows) | C | E19 |
| V-DEP-2 | `npm audit` na raiz (`13-audit-raiz.txt`) | 4 vulnerabilidades: 3 moderadas e 1 alta | `fastify` 5.12.1 (alta, 5 avisos, entre eles desvio de autenticação por URL malformada; correção por `npm audit fix`), `fast-uri` 4.1.4 (moderada, correção por `npm audit fix`), `vitest` e `@vitest/mocker` (moderadas, só com `vitest@5.0.3`). Os dois primeiros são de execução. Ver divergência D-1 | E | E19 |
| V-DEP-3 | `npm audit` em `apps/campo` (`14-audit-campo.txt`) | 54 vulnerabilidades: 3 moderadas e 51 altas | raízes: `brace-expansion` (alta), `braces` (alta), `decode-uri-component` (moderada), `node-forge` (alta), com a cadeia `@expo/*` abaixo. Ver divergência D-1 | E | E19 |
| V-DEP-4 | `npx expo-doctor` (`15-expo-doctor.txt`) | 20 de 21; 9 pacotes Expo com deriva de versão de patch | `expo` 57.0.23 (esperado ~57.0.26) e mais oito | E | E19 |
| V-E2E-1 | `npm run test:e2e`, Chromium (`16-e2e.txt`) | `waitForSelector('.indicador')` estoura 30 s na seção 2 | por leitura do código: `App.tsx:43-50` manda `voltarPara` igual a `/`; `entrar-regras.ts:49-54` (`rotaInterna`) aceita `/`; `App.tsx:105-145` não tem rota para `/`, então cai em `NaoEncontrada`. Confirmado por leitura, não por captura | A | E13 (e prova final na E18) |
| V-E2E-2 | `MOTOR=firefox npm run test:e2e` | não medido na E01: o roteiro `baseline.mjs` só roda o Chromium. Última medição: 2026-09-30, mesma falha (`docs/auditoria-v2/raw/e2e-local-firefox.txt`) | mesma causa de V-E2E-1 | A | E13 (e prova final na E18) |
| V-E2E-3 | `npm run test:e2e:api` (`17-e2e-api.txt`) | seção 13, `Failed to fetch` em `fluxo-api.e2e.mjs:350`; 40 verificações OK antes | `servidor.ts:378` libera só `content-type`, `authorization` e `accept`; a URL de envio assinada repete `if-none-match: *` (`armazenamento/memoria.ts:108`, `s3.ts:121`); o preflight do navegador reprova | A | E18 |

## 4. As alegações da etapa conferidas contra o código

| Alegação | Resultado |
| --- | --- |
| Web 14 = 8 + 5 + 1 | Confirmada (seção 3.2) |
| `Usuarios.tsx`, `Equipes.tsx` e `Orgaos.tsx` não usam `<Toast` | Confirmada (só `Ocorrencia.tsx:386`) |
| `Estrutura.tsx:132` com raio à mão, de b387ee3 | Confirmada (2026-09-17) |
| Portão de acessibilidade olha 4 linhas; exceção em `Modal.tsx:254`; `onClick` em :260 | Confirmada (`acessibilidade.test.ts:318`) |
| Caso de CRLF em `ocorrencia-encerramento.test.ts:166` e :170 | Confirmada (`git ls-files --eol`: `i/lf w/crlf`; sem `.gitattributes`; `core.autocrlf=true`) |
| `App.tsx:43-50`, `entrar-regras.ts:49-54`, sem rota índice | Confirmada, só por leitura |
| `senha-provisoria.test.ts:183`, `servico.ts:667`, `vigencia.ts:69-70` | Confirmada |
| `pacote.ts:479-494` sem nomes de equipe; `documentos.ts:108-118` com eles | Confirmada |
| `banco-tls`: causa é `OPENSSL_CONF`, e não `openssl` fora do PATH | Confirmada (variável definida hoje, arquivo inexistente) |
| Campo 20 = 2 + 4 + 14; E15 7 e E16 7 | Confirmada pelos nomes dos 20 testes (seção 3.4) |
| `index.tsx:1222` é decisão datada de 15/09/2026 | Confirmada |
| Teste irmão `falha-de-atualizacao.test.ts` | Ajustada: ver D-2 |
| Mock do logout sem `acolherNoAparelho`; `sessao.tsx:150,180,247` | Confirmada |
| `perfil.tsx:449-453`, `:535-541`, `:1462-1467`; `sessao.tsx:190-235`; `banco-local.ts:273-277` e `:286-372` | Confirmada |
| `vistoria/[id].tsx:1447` e `schemas.ts:411` | Confirmada |
| `vistoria/[id].tsx:2232-2233`, sem `expo-task-manager` | Confirmada |
| "mesmo padrão das notificações no Perfil" para `Linking.openSettings` | Ajustada: ver D-3 |
| `test:scripts` casos 19, 22 e 37 | Confirmada, com outra numeração na saída: 35, 38 e 53 (deslocamento de 16 pelos testes da E01) |
| `conferir:numeros`: 13 afirmações; API 1104 contra 1109 | Confirmada |
| E19: raiz "3 moderadas" e campo "4, 1 alta" | Divergente: ver D-1 |
| E21: `.expo/types/router.d.ts` "de 2026-08-27" | Ajustada: o arquivo é de 2026-08-29 (27 é a data da pasta); o resto confere |
| E04: bloco desligado em `servidor.ts:454-467`; `describe.skip` em `vigencia-na-escrita.test.ts` | Confirmada (o comentário começa em :454, a escrita sem vigência em :463-466; skip em :103) |
| E09: rotas `administracao.ts:433` e `:550`; funções do painel; nenhuma página as chama | Confirmada |
| E18: `servidor.ts:369-378`; `memoria.ts:105-109`; `s3.ts:121` | Confirmada |
| E17: `execFileSync("npm"` na linha 68; `app.config.ts` linhas 158, 597 e 642 | Confirmada |
| "e2e 3 (E13 e E18)" | Ajustada: ver D-4 |

## 5. Divergências encontradas (registradas, não copiadas)

- **D-1. Os números de `npm audit` da E19 estão velhos.** O roadmap diz raiz com 3 moderadas e campo com 4 (1 alta). A saída de 2026-10-05 mostra raiz com 4 (3 moderadas e 1 alta: o próprio `fastify`, de execução, com 5 avisos, um deles desvio de autenticação por URL malformada) e campo com 54 (3 moderadas e 51 altas, pelas cadeias de `braces`, `node-forge` e `brace-expansion` sob `@expo/*`). Os dois `package-lock.json` não mudam desde 2026-09-17: o que mudou foi a base de avisos. O roteiro `baseline.mjs` só confere que `npm audit` continua vermelho, por isso a E01 marcou `confere`. Consequência: a E19 precisa partir destes números, e o `fastify` alto em execução é bug pela regra do projeto (vulnerabilidade conhecida em execução), com `fixAvailable` verdadeiro. Proposta no STATUS, seção 11.
- **D-2. O teste irmão da decisão de `index.tsx:1222` não é `falha-de-atualizacao.test.ts`.** Esse arquivo passa, mas cobre a frase do acesso suspenso e a classificação do 401 (linha 48); o comentário da linha 66 ainda cita a frase antiga da sessão encerrada. Quem afirma o "Entrar de novo" e que `sair()` não é chamado é `src/__tests__/a-sessao-vencida-nao-apaga-a-vistoria.test.tsx` (passa, `08-teste-campo-app.txt:8051`), do mesmo commit da decisão (5ecdf4c). Esse arquivo ainda cita `dados/sessao-vencida-nao-apaga.test.tsx` no cabeçalho, que não existe. A E14 deve citar o arquivo certo no registro.
- **D-3. `Linking.openSettings` não está em `perfil.tsx`.** O padrão está em `src/push/PortaExpo.ts`.
- **D-4. Só 2 dos 3 e2e foram medidos na E01.** O roteiro roda o Chromium e a API; o Firefox continua com a última medição de 2026-09-30. A E13 e a E18 devem acrescentar o `MOTOR=firefox`.
- **D-5. A causa de `banco-tls` não aparece na saída arquivada.** O teste esconde a saída do `openssl` (`stdio: "ignore"`), então a prova da causa vem do experimento de 2026-09-30 (13 de 13 sem a variável) e da variável hoje definida, e não da saída da E01.
- **D-6. O "teste velho" do campo não é uniforme.** V-CAM-03 a V-CAM-06 e V-SCR-3 mudam de lugar o que o teste afirma; a reescrita deve manter a intenção (a ficha segue com a saída; a constante decide os dois usos) e não pode enfraquecer.
- **D-7. Reescritas previstas em etapas que não listam o registro.** A E13 (portão de acessibilidade), a E17 (três testes de scripts), a E20 (varredura de travessão), a E21 (helper de leitura, `banco-tls`) e a E05 (renomear `sessao` nos testes) reescrevem teste, mas só a E14 lista `DECISOES-DE-TESTE-DA-FASE-00.md` em "Documentação a atualizar". Pela política cada uma precisa registrar. As seções já estão abertas no registro de decisões com a decisão pronta, para a etapa só completar a evidência.

## 6. O vermelho intermitente da E02: `resolver-link.test.ts`

Classe F (instável). Não entra na soma do baseline, porque a E01 o mediu verde (1109 testes, 2 falhas).

- **O que aconteceu.** Na primeira rodada completa da API da E02 (`V2-F00-E02/saidas/regressao-npm-test/04-teste-api.txt:565-580`) falhou "conecta no endereço conferido com o nome no cabeçalho Host, e fecha sem ler o corpo": `expected false to be true` em `resolver-link.test.ts:419` (o arquivo levou 38 s). Na segunda rodada completa (`regressao-api-segunda-rodada/01-teste-api.txt:395`) passou, em 10,6 s; isolado, passou 3 de 3. A E01 também passou. Resultado: 1 falha em 3 rodadas completas.
- **Causa provável.** O teste espera um tempo fixo (`setTimeout(resolve, 20)`, linha 418) pelo evento `close` da resposta no servidor local (`conexaoFechada`, linha 365) depois de o cliente fechar a conexão. Com a suíte inteira e o pool de 4 fios derivando senha (scrypt de 128 MB), o laço de eventos demora mais de 20 ms para entregar o `close`. É a mesma classe de defeito que `apps/api/vitest.config.ts` descreve desde 2026-09-09. É hipótese, não prova: a falha só foi vista sob carga e o teste não imprime o tempo.
- **Alcance.** A mesma espera fixa de 20 ms aparece em outros 10 pontos de 4 arquivos da API (`desinterdicao.test.ts` 3, `fotos-do-documento.test.ts` 2, `identificador-da-emissao.test.ts` 2, `segunda-via-nao-reinterdita.test.ts` 3). Nenhum falhou nas três rodadas e nenhum foi classificado aqui: ficam listados.
- **Quem trata.** Nenhuma etapa existente cabe com precisão: a E21 é a mais próxima (objetivo "a suíte inteira passa sem depender da máquina"), mas o escopo escrito dela é CRLF, `OPENSSL_CONF` e cache do campo. Registrado como achado novo no STATUS, seção 11, com a proposta de a E21 receber um quarto item ("esperas fixas sob carga"): trocar a espera de 20 ms por espera com condição e limite (por exemplo `vi.waitFor` com teto de 2 s) em `resolver-link.test.ts` e, depois de medir, nos outros 10 pontos. A troca é reescrita de teste e pede o registro que a política exige. Enquanto isso, quem vir o teste vermelho numa rodada completa roda o arquivo sozinho e registra a rodada; não pula e não repete até passar.

**Atualização de 2026-10-13.** A espera de 20 ms de `resolver-link.test.ts` foi trocada por `vi.waitFor` com limite de 5 s (linha V-INS-01, fechada). Os outros 10 pontos de 20 ms e as demais esperas fixas seguem abertos, com dono, issue e prazo (V-INS-02). A carga sintética não reproduziu a falha da versão antiga: a causa "carga da máquina" continua hipótese (8.4).

## 7. Decisão pedida a Rafael

Com esta tabela na mão, três respostas:

1. A regra de BZ-N:N.3 (política, seção "Quando o teste e o código discordam"): onde há decisão datada no código e teste irmão passando, o código vale e o teste é reescrito com registro; onde o teste descreve defeito confirmado por leitura do código, o teste vale e o código é consertado. Aprova, ou troca? Situação hoje: premissa assumida.
2. Os 14 defeitos do campo (V-CAM-07 a V-CAM-20) são defeitos reais? Situação hoje: tratados como defeitos reais, premissa assumida.
3. Os 6 do campo e os 3 de scripts que a regra manda reescrever (V-CAM-01 a V-CAM-06, V-SCR-3, e os de classe C com mudança de teste) podem ser reescritos nas etapas E14, E17 e E21 com o registro já aberto?

Resposta de Rafael: dada em 2026-10-13 (ver a situação abaixo e a seção 8.6).

Situação em 2026-10-13: DECIDIDA pelo Rafael, pergunta por pergunta no roteiro de aprovação da F00: Q1 sim, a regra vale; Q2 sim, os 14 defeitos do campo são reais; Q3 sim, as 13 reescritas ficam; Q4 sim, a troca de espera fixa por espera com condição vale e os outros 10 pontos entram numa etapa futura; Q5 aceitar o aviso do `vitest` como exceção com dono e prazo (o Expo foi atualizado, D1). A tabela abaixo é o que ela decidiu. A tabela pronta, com as cinco perguntas (as três acima, mais a troca de espera fixa por condição e a política dos avisos de ferramenta), as linhas que dependem de cada uma e o que muda no sim e no não, está na seção 8.6.

## 8. Registro vivo em 2026-10-13 (correção 1 da E03)

Base: HEAD `5dfc389` (depois das correções `4fcc241` a `5dfc389`) mais a troca de espera de `resolver-link.test.ts` feita nesta correção. Máquina: Windows 11, Node 22.17.0, a das medições da E01. As seções 1 a 7 ficam como a fotografia de 2026-10-05: o "Fecha em" delas é o que foi prometido, e esta seção diz o que aconteceu. Onde divergirem, vale esta.

Estados: **FECHADO** (o teste passa hoje, com a prova ao lado) e **ABERTO** (segue vermelho ou avisando, e tem dono, issue e prazo pela T42). Dono padrão `rafael` (PREMISSA da E02). Os prazos das linhas abertas eram PROPOSTA deste registro, dentro do máximo de 30 dias que a política tinha então (até 2026-11-12); o teto passou a 5 dias em 2026-10-13 (D2) e os prazos vigentes estão em 8.8. A coluna "Commit" é o commit do código que fechou; as etapas E01 a E10 entraram em `5d6bc57`, as E11 a E25 em `99390e0`, e as correções 1 de 2026-10-13 têm o próprio commit.

### 8.1 O que rodou hoje, e onde está a saída

Saídas passadas por `redigir` de `dc360/scripts/baseline.mjs`, na pasta `docs/evidencias-v2/G00/V2-F00-E03/correcao-1/`.

| Comando | Resultado | Arquivo |
| --- | --- | --- |
| `node scripts/baseline.mjs --sem-instalar` (17 passos) | 12 conferem, 5 divergem: ver V-ROT-01 (o roteiro, e não a árvore, está desatualizado) | `saidas/RESUMO.md` |
| `npm run typecheck` | saída 0 | `saidas/01-typecheck.txt` |
| `npm test` completo, 5 rodadas em sequência | saída 0 nas 5; contagens iguais nas 5: shared 168, campo (pacote) 223, API 1299, console 259, painel 649, banco 327 e 3 pulados por ambiente | `brutas/npm-test-rodada-1.txt` a `5` |
| `npm run test:api` | 1299 de 1299, 99 arquivos | `saidas/05-teste-api.txt` |
| `npm run test --workspace @dc360/web` | 649 de 649, 43 arquivos | `saidas/07-teste-web.txt` |
| `npm run test:campo` | tipos limpos e 1903 de 1903 casos (129 suítes) | `saidas/09-test-campo.txt` |
| `npx jest --silent` em `apps/campo` | 1903 de 1903 | `saidas/08-teste-campo-app.txt` |
| `npm run test:scripts` | 230 casos, 226 ok, 0 falhas, 4 pulados por ambiente (sem `ios/`); o portão de skip diz "10 skips por ambiente em 3 arquivos; 0 incondicionais com marca T42" | `saidas/10-test-scripts.txt` |
| `npm run conferir:numeros` | "Todos os números da documentação batem com a realidade." | `saidas/11-conferir-numeros.txt` |
| `npm run test:isolamento` | 327 ok e 3 pulados por ambiente (`busca.test.ts`, `it.runIf`) | `saidas/03-teste-db.txt` |
| `npm run test:e2e` (painel), Chromium | 70 passou, 0 falhou | `saidas/16-e2e.txt` |
| `MOTOR=firefox npm run test:e2e` (painel) | 70 passou, 0 falhou | `saidas-firefox-painel/01-e2e.txt` |
| `npm run test:e2e:api`, Chromium | 279 passou e 0 falhou (arquivo do fluxo), 50 e 0 (largura estreita) | `saidas/17-e2e-api.txt` |
| `npm run test:e2e:api -- firefox`, 4 rodadas | 4 de 4 verdes, 279 e 50 em cada uma | `brutas/e2e-api-firefox-rodada-1.txt` a `4`, `brutas/e2e-api-firefox-rodadas.txt` |
| `npm run auditar` | saída 0: runtime 0, 3 avisos de desenvolvimento, app de campo sem advisory nova | `saidas/12-auditar.txt` |
| `npm audit` raiz / `apps/campo` / `npx expo-doctor` | 3 (1 moderada, 2 críticas, todas de desenvolvimento) / 59 / 20 de 21: ver V-DEP-2b, V-DEP-3 e V-DEP-4 | `saidas/13`, `14`, `15` |
| Provas por linha (arquivo de teste com `--reporter=verbose`) | todos os testes nomeados na seção 3 passam: shared 8 de 8, painel 59 de 59 em 5 arquivos, API 61 de 61 em 4 arquivos, campo 44 de 44 em 6 arquivos, scripts 22 (18 ok, 4 pulados por ambiente) | `brutas/prova-shared.txt`, `prova-web.txt`, `prova-api.txt`, `prova-campo.txt`, `prova-scripts.txt` |

A coluna "Prova" das tabelas abaixo cita estes arquivos. Os testes nomeados de cada linha aparecem com ✓ nos arquivos `brutas/prova-*.txt`.

### 8.2 Linhas fechadas (62 de 71 na correção 1; 65 de 71 depois da correção 2, ver 8.8.4)

| Linha(s) | Fechou em | Commit | Prova de hoje |
| --- | --- | --- | --- |
| V-SHA-1 | E20 | `99390e0` | `prova-shared.txt`: "nenhum travessão em texto nenhum" ✓, 8 de 8; o literal de `trilha-detalhe.test.ts` virou escape e as isenções têm casos de âncora |
| V-WEB-01 | E13 | `99390e0` | `prova-web.txt`: "nenhum onClick pendurado em elemento que o teclado não alcança" ✓; o portão lê o bloco de comentário inteiro (`comentarioAcima`), e `Modal.tsx` não mudou desde 2026-09-09 |
| V-WEB-02 | E13 | `99390e0` | `prova-web.txt`: design-system "nem no CSS, nem nos estilos escritos dentro do componente" ✓; `Estrutura.tsx` não tem mais `borderRadius: "8px"` (busca sem resultado) |
| V-WEB-03 | E21 | `99390e0` | `prova-web.txt`: "nada grava o encerramento fora do ramo de confirmação" ✓ com a árvore em CRLF; `.gitattributes` e o leitor de fonte da E21 |
| V-WEB-04 a V-WEB-11 | E09 | `5d6bc57`, correção `39051f7` | `prova-web.txt`: os 8 casos de `seguranca-da-conta.test.ts` ✓ (botões, pergunta antes, quem vê, senha temporária, Toast, modo de demonstração, Minha conta) |
| V-WEB-12 a V-WEB-14 | E13 | `99390e0` | `prova-web.txt`: "anuncia o que gravou com um Toast" ✓ em `Usuarios.tsx`, `Equipes.tsx` e `Orgaos.tsx` |
| V-API-1 | E04 (a vigência na escrita), E07 (o par que faltava) | `5d6bc57` | `prova-api.txt`: "uma sessão viva cuja senha provisória venceu no meio não escreve nem renova" ✓ |
| V-API-2 | E12 | `99390e0`, correção `5dfc389` | `prova-api.txt`: "o laudo do pacote imprime o aviso de equipe divergente, como o laudo emitido" ✓ |
| V-API-S1 | E21 | `99390e0` | `prova-api.txt`: `banco-tls.test.ts` 13 de 13 ✓ (não é mais suíte pulada). `OPENSSL_CONF` continua apontando para arquivo que não existe nesta máquina; o teste avisa em stderr e roda o `openssl` sem a variável |
| V-API-S2 | E04 | `5d6bc57`, correção `4fcc241` | `prova-api.txt`: `vigencia-na-escrita.test.ts` roda inteiro, 13 de 13 ✓ (o `describe.skip` saiu; "conta desativada não escreve mais, no pedido seguinte" ✓); portão de skip: "0 incondicionais com marca T42" |
| V-CAM-01 a V-CAM-06 | E14 | `99390e0` | `prova-campo.txt`: os 2 testes da sessão encerrada e os 4 do logout ✓; teste irmão `a-sessao-vencida-nao-apaga-a-vistoria.test.tsx` ✓ (3 casos). Regra R1 (depende de Q1 e Q3) |
| V-CAM-07 a V-CAM-13 | E15 | `99390e0`, correção `a5da710` | `prova-campo.txt`: os 6 de `dialogo-na-conta-com-vistoria-comecada.test.tsx` ✓ e "abaixo de meio metro vira 1, e não zero" ✓. Defeitos reais (depende de Q2) |
| V-CAM-14 a V-CAM-20 | E16 | `99390e0`, correção `81a5223` | `prova-campo.txt`: os 7 de `vistoria-o-teclado-a-camera-e-o-que-ela-promete.test.tsx` ✓ (segundo plano, toque fora, teclado, área segura, ajustes de câmera e de localização, frase certa). Defeitos reais (depende de Q2) |
| V-TC-1 | E21 | `99390e0` | `saidas/09-test-campo.txt`: tipos limpos, 1903 casos |
| V-SCR-1, V-SCR-2, V-SCR-3 | E17 | `99390e0` | `prova-scripts.txt`: "rodando da raiz, --conferir confere e NÃO aplica" ok, "a pasta de copias recusa o repositorio..." ok, "a escolha do ambiente continua morando no app.config.ts..." ok, mais o negativo novo ("reprova o mode escrito à mão") ok |
| V-NUM-01 a V-NUM-13 | E17, rodada final na E22 | `99390e0`, `4fcc241`, `5dfc389` | `saidas/11-conferir-numeros.txt`: "Todos os números da documentação batem com a realidade." |
| V-DEP-1 | E19 | `e2d4aec` | `saidas/12-auditar.txt`: o `auditar` roda no Windows (sem `ENOENT`) e sai 0 |
| V-DEP-2a (`fastify` e `fast-uri`, de execução) | correção do CI da D-30 e E19 | `e16209b`, `e2d4aec` | `brutas/npm-audit-raiz-omit-dev.txt`: "found 0 vulnerabilities"; `fastify` 5.12.5 e `fast-uri` 4.2.1 no `package-lock.json`; `auditar`: "Runtime (vai para a imagem): 0 vulnerabilidade(s)" |
| V-E2E-1, V-E2E-2 | E13 | `99390e0` | `saidas/16-e2e.txt` (Chromium) e `saidas-firefox-painel/01-e2e.txt` (Firefox): 70 passou, 0 falhou; a seção 2 não morre mais esperando `.indicador` |
| V-E2E-3 | E18 | `99390e0` | `saidas/17-e2e-api.txt` e as 4 rodadas em Firefox: 279 e 50 passou, 0 falhou em todas |
| V-INS-01 (`resolver-link.test.ts`, espera fixa de 20 ms) | esta correção (E03, classe F) | o commit desta correção | `vi.waitFor` com limite de 5 s no lugar de `setTimeout(resolve, 20)`; 10 rodadas isoladas e 10 sob carga sintética, 37 de 37 em todas; o mutante (ninguém avisa que fechou) reprova em 5 s. Ver 8.4 |

Soma das linhas fechadas: 1 + 1 + 1 + 1 + 8 + 3 + 1 + 1 + 1 + 1 + 6 + 7 + 7 + 1 + 3 + 13 + 1 + 1 + 2 + 1 + 1 = 62.

### 8.3 Linhas que estavam abertas (9); 3 fecharam em 2026-10-13 e restam 6 (prazos e etapas vigentes: 8.8.2)

Todas têm dono, issue e prazo. Nenhuma está pulada: o portão de skip não tem o que marcar, e a T42 se aplica aqui como registro. Pela regra R6, nenhuma foi repetida até passar.

| Linha | O que segue aberto | Dono | Issue | Prazo | Tratamento |
| --- | --- | --- | --- | --- | --- |
| V-DEP-2b | `npm audit` da raiz lista 3 avisos só de desenvolvimento: `@vitest/mocker` (moderada), `tinypool` (crítica, 2 avisos de execução remota de código no processo de teste) e `vitest` (crítica, só por depender dos dois). O `auditar` sai 0 e diz "Não reprova, e precisa de dono" | `rafael` | `V2-F00-E19` (nova rodada) | 2026-11-12 | FECHADA em 2026-10-13: Rafael respondeu a Q5 (aceitar como aviso com dono e prazo). Os três pacotes entraram em `ACEITAS_EM_DESENVOLVIMENTO` (`scripts/auditar-excecoes.mjs`), dono Rafael, prazo 2027-01-05, e o `auditar` passou a dizer "todas aceitas com dono e prazo" em vez de "precisa de dono". Subir o `vitest` para 5 fica como etapa planejada. Não é runtime: `npm audit --omit=dev` dá 0 |
| V-DEP-3 | `apps/campo`: `npm audit` lista 59 (55 fora de desenvolvimento: 8 moderadas, 46 altas, 1 crítica), todas da cadeia de ferramenta do Expo. O `auditar` aceita 6 pelo nome | `rafael` | `CP-03` (decidido em 2026-10-07) e `V2-F00-E19` | 2027-01-05 (o prazo do CP-03; o portão reprova depois dele) | Subir o SDK do Expo por inteiro (a saída que o CP-03 registrou; `npm audit fix` descartado por misturar SDK 57 e 58). Tolerado por decisão já tomada |
| V-DEP-4 | `npx expo-doctor` dá 20 de 21: 6 pacotes com deriva de patch (`expo` 57.0.27 contra ~57.0.28, `expo-crypto`, `expo-location`, `expo-router`, `expo-splash-screen`, `jest-expo`). Estava 21 de 21 em 2026-10-08; a deriva é externa, por patch novo publicado | `rafael` | `V2-F00-E19` (nova rodada) | 2026-11-12 | FECHADA em 2026-10-13 (V2-F00-E19, correção 2): Rafael decidiu atualizar (D1); `npx expo install --fix` subiu os seis pacotes dentro do SDK 57 e o `expo-doctor` voltou a 21 de 21 (prova em `V2-F00-E19/correcao-2/`). Muda pacote nativo: o próximo binário precisa ser recompilado. A deriva reabre sozinha a cada patch novo do Expo, e então é item novo |
| V-ROT-01 (novo) | O roteiro `dc360/scripts/baseline.mjs` diverge numa árvore verde: espera 643 testes no painel (rodam 649), 1880 no jest (1903), 226 casos em `test:scripts` (230), 271 verificações no e2e da API (279 mais as 50 da largura estreita) e vermelho no `auditar` (agora verde). Sai com código 1. Também falta o passo do Firefox (D-4) | `rafael` | `V2-F00-E01` (correção 1) | 2026-10-20 | FECHADA em 2026-10-13 pela correção 1 da E01 (`dd90dc2`): as tabelas de esperado passaram a ter fonte única conferida por `conferir:numeros`, o código de saída separa 0, 1 (só divergência explicada), 3 e 2, e com o `expo-doctor` de volta a 21 de 21 (E19, correção 2) não sobra divergência explicada. O passo do Firefox (D-4) segue fora do roteiro |
| V-INS-02 (novo) | Os outros 10 pontos com `setTimeout(r, 20)` em 4 arquivos da API (`desinterdicao` 3, `fotos-do-documento` 2, `identificador-da-emissao` 2, `segunda-via-nao-reinterdita` 3) e 6 esperas fixas de 10 a 100 ms em `push-rodada-diz-o-que-fez`, `push-sem-resposta` e `recuperacao-sem-oraculo`. Nenhum falhou em nenhuma rodada medida | `rafael` | sem etapa (H03) (ver 8.8.2) | 2026-10-18 | Medir e trocar por `vi.waitFor` com limite onde o teste espera um evento (a mesma troca de V-INS-01), com registro em `DECISOES-DE-TESTE-DA-FASE-00.md`. Depende de Q4 |
| V-INS-03 (novo) | `packages/shared/test/dominio.test.ts` ("ninguém redefine o checklist fora do pacote compartilhado") estoura os 5 s do limite padrão sob carga. Falhou em 2 de cerca de 7 rodadas completas de `npm test` na validação de 2026-10-13, e uma vez na E10; passa isolado em 252 ms | `rafael` | `V2-F00-E20` (encaixe parcial) (ver 8.8.2) | 2026-10-18 | Causa provável: a varredura lê o código-fonte de todo o produto e disputa disco e CPU com o resto da suíte; HIPÓTESE, não medida. Tratamento: limite explícito e generoso por teste (`it(..., 60_000)`) e, se medido, o cache da lista de arquivos. Não pular, não repetir até passar. Depende de Q4 |
| V-INS-04 (novo) | `packages/shared/test/regras-de-conteudo.test.ts` ("nenhum travessão em texto nenhum"): falhou em 1 execução de `npm test` na E19 (mensagem não capturada, não reproduzida em 4 reexecuções) e nas rodadas completas da validação, junto com o item anterior | `rafael` | `V2-F00-E20` (ver 8.8.2) | 2026-10-18 | Causa provável: a varredura lê `docs/` inteiro enquanto outro processo grava arquivo (o `npm install` do Expo, uma evidência sendo escrita): HIPÓTESE. Tratamento: arquivar a saída bruta completa da próxima falha (a da E19 perdeu a mensagem), tolerar arquivo que some entre a listagem e a leitura (`ENOENT`), se for essa a causa, e fixar o limite de tempo. Depende de Q4 |
| V-INS-05 (novo) | `npm run test:isolamento` (o portão número um, CA-06) falhou sob carga da máquina: em 2026-10-07, 4 rodadas com 1 saída diferente de 0 (2 com `Timeout calling "onTaskUpdate"` do vitest, com 327 passando, e 2 com a varredura de seis caminhos de privilégio passando de 60 s), com um `ng serve` de outro projeto a 50% de CPU | `rafael` | sem etapa (H03) (ver 8.8.2) | 2026-10-18 | Rodar com a máquina livre e medir; se repetir, subir o limite de tempo da varredura (ela passou de 60 s nas falhas) com a medição ao lado, e nunca afrouxar a asserção. O arquivo do CA-06 sozinho fecha 137 de 137 em 22 s |
| V-INS-06 (novo) | `npm run test:e2e:api -- firefox` no Windows: 1 falha em 4 rodadas na validação de 2026-10-13, `CONNECTION_REFUSED` na seção 23 | `rafael` | `V2-F00-E18` (ver 8.8.2) | 2026-10-18 | Causa NÃO medida. A seção 23 abre um segundo contexto de navegador e navega de novo para o painel. Hipóteses a testar: o painel ainda não aceitava a conexão nesse instante, ou o Firefox no Windows resolveu `localhost` para IPv6 enquanto o servidor escuta em IPv4. Tratamento: na próxima falha arquivar a saída bruta e o trace (URL e hora da recusa), e então esperar o servidor responder, com limite, antes de abrir o contexto. O CI Linux roda o e2e da API e passa (run 37739535524) |

Quatro dessas nove (V-INS-03 a V-INS-06) são instabilidades vistas fora desta correção (na E10, na E17, na E19 e na validação de 2026-10-13); hoje nenhuma reproduziu (ver 8.4). Elas ficam abertas porque a falta de reprodução não é prova de conserto, e a causa de nenhuma foi medida.

### 8.4 Instabilidades: o que foi medido hoje

Regra R6 da política: não se repete até passar e não se pula; mede-se e registra-se. Esta tabela é o que foi medido, com a máquina sem outro processo pesado (`ng serve` desligado).

| Instável | Rodadas hoje | Resultado hoje | Antes | Leitura |
| --- | --- | --- | --- | --- |
| `resolver-link.test.ts`, "conecta no endereço conferido..." | 11 com a versão antiga (1 do roteiro e 10 sob carga sintética, a cópia de `git show HEAD:...`) e 25 com a nova (5 de `npm test` completo, 10 isoladas e 10 sob a mesma carga) | 0 falhas em 36. A carga sintética (12 processos Node em laço ocupado em 16 núcleos) NÃO reproduziu a falha da versão antiga (10 de 10 verdes) | 1 falha em 3 rodadas completas da E02 | A causa "carga da máquina" continua HIPÓTESE (a política exige dizer isto). O conserto não depende dela: a espera por condição com limite passa assim que a conexão fecha e só reprova se NÃO fechar em 5 s. O mutante (servidor que não avisa o `close`) reprova com a mensagem do teste |
| `dominio.test.ts` e `regras-de-conteudo.test.ts` (shared) | 6 execuções completas (1 do roteiro, 5 de `npm test`) | 0 falhas em 6, shared 168 de 168 em todas; a rodada de prova isolada: `regras-de-conteudo` 8 de 8 | 2 de cerca de 7 rodadas na validação; 1 na E10; 1 na E19 | Não reproduziu hoje. Sem causa medida |
| `test:isolamento` | 6 (1 do roteiro, 5 de `npm test`) | 0 falhas, 327 ok e 3 pulados em todas, 30 s no roteiro | 4 rodadas com 1 falha em 2026-10-07 (máquina com `ng serve`) | A falha só apareceu com a máquina carregada. Sem causa medida |
| `test:e2e:api` em Firefox no Windows | 4 | 4 de 4 verdes, 279 e 50 verificações | 1 falha em 4 na validação (`CONNECTION_REFUSED`, seção 23) | Total medido: 1 falha em 8 rodadas em Firefox. Chromium: 1 de 1 verde hoje e verde no CI Linux |

Arquivos: `brutas/resolver-link-10-rodadas.txt`, `brutas/resolver-link-sob-carga.txt`, `brutas/resolver-link-mutante.txt`, `brutas/npm-test-rodada-1.txt` a `5`, `brutas/e2e-api-firefox-rodadas.txt`.

### 8.5 As divergências D-1 a D-7 da seção 5: situação

| Divergência | Situação em 2026-10-13 |
| --- | --- |
| D-1, números de `npm audit` | Superada. Raiz: runtime 0, 3 avisos de desenvolvimento (V-DEP-2b). Campo: 59 no total, 55 fora de desenvolvimento, aceitos pelo CP-03 (V-DEP-3). O `fastify` alto de execução foi corrigido em `e16209b` (V-DEP-2a) |
| D-2, o teste irmão é `a-sessao-vencida-nao-apaga-a-vistoria.test.tsx` | Fechada. O registro de decisões da E14 cita o arquivo certo, e ele passa hoje (3 casos) |
| D-3, `Linking.openSettings` em `PortaExpo.ts` | Fechada. Era só uma citação a ajustar, e a E16 usa o padrão de `PortaExpo.ts` (V-CAM-18 e V-CAM-19 ✓) |
| D-4, e2e de Firefox fora do roteiro | Parcial: o Firefox foi medido à mão (painel 70 de 70, API 4 de 4 rodadas), mas o `baseline.mjs` ainda não tem o passo. Entrava em V-ROT-01, que foi fechada sem ele; a rodada 2 apontou o órfão e a correção 3 abriu a linha V-ROT-02 (8.8.2), com dono, prazo 2026-10-18 e a E01 como etapa |
| D-5, a causa de `banco-tls` não aparece na saída da E01 | Fechada. O teste de hoje avisa em stderr que `OPENSSL_CONF` aponta para arquivo inexistente e roda o `openssl` sem a variável (`prova-api.txt`) |
| D-6, o teste velho do campo não é uniforme | Fechada. As reescritas da E14 e da E17 mantêm a intenção; o registro de decisões diz "nenhuma asserção foi enfraquecida" em cada uma, e a E17 acrescentou o caso negativo do `mode` escrito à mão |
| D-7, reescritas sem registro previsto | Fechada. `DECISOES-DE-TESTE-DA-FASE-00.md` tem uma seção para cada reescrita (E05, E13, E14, E17, E20, E21), e nesta correção as quatro que ainda diziam "previsto" (E05, E13, E17, E20) receberam o diff real |

### 8.6 Decisão de Rafael: a tabela pronta

Nada aqui foi decidido por quem implementou. A situação de cada pergunta é a PREMISSA aplicada desde a E03 (STATUS, seção 9). A decisão só precisa de um "sim" ou de um "troque por X" por linha.

| # | Pergunta | Hoje | Linhas que dependem | Se disser sim | Se disser não |
| --- | --- | --- | --- | --- | --- |
| Q1 | A regra de BZ-N:N.3 vale? Onde há decisão datada no código, posterior ao teste, e teste irmão passando, o código vale e o teste é reescrito com registro (R1). Onde o teste descreve defeito confirmado por leitura do código, o teste vale e o código é consertado (R2). Sem prova de uma das duas, trata-se como defeito | Premissa aplicada em todas as etapas | 40 linhas: 32 de classe A e 8 de classe B | Nada muda; o item "regra de BZ-N:N.3 decidida" fecha | Rafael diz a regra nova; as 8 reescritas da classe B (V-WEB-01, V-CAM-01 a V-CAM-06, V-SCR-3) voltam a ser defeito de código até a nova regra dizer outra coisa |
| Q2 | Os 14 defeitos do campo (V-CAM-07 a V-CAM-20) são defeitos reais? | Tratados como reais; consertados no código pelas E15 e E16 e provados (8.2) | 14 linhas fechadas | Fica como está | Cada linha que ele disser que não é defeito: o conserto da E15 ou da E16 é revisto e o teste correspondente é reescrito com registro |
| Q3 | As 13 reescritas (V-CAM-01 a V-CAM-06, V-WEB-01, V-WEB-03, V-SHA-1, V-API-S1, V-SCR-1 a V-SCR-3) podem ficar como foram feitas, com o registro de `DECISOES-DE-TESTE-DA-FASE-00.md`? | Feitas e registradas nas E13, E14, E17, E20 e E21 | 13 linhas fechadas | Fica como está | A reescrita escolhida é revertida (o diff de cada uma está no registro) |
| Q4 | Aceita trocar espera fixa por espera com condição e limite nos testes instáveis? Feita em `resolver-link.test.ts` (um arquivo, desfazível) | Feita só em `resolver-link.test.ts` | V-INS-01 (fechada), V-INS-02, V-INS-03 e V-INS-04 | A E21 ganha o quarto item e as três linhas abertas se tratam | Reverter o patch de `resolver-link.test.ts` (volta V-INS-01 a aberta) e Rafael diz como tratar a instabilidade |
| Q5 | (RESPONDIDA: aceitar como aviso com dono e prazo; o Expo já foi atualizado) Aviso de ferramenta que muda sem o código mudar (3 advisories de desenvolvimento da raiz e a deriva de patch do Expo): corrigir já, ou virar aviso com dono e prazo na política do CP-03? | V-DEP-4 (Expo) foi fechada em 2026-10-13 por atualização (D1); V-DEP-2b segue aberta, com prazo 2026-11-12 | V-DEP-2b (e V-DEP-4, já fechada) | Corrige (`vitest` 5, `expo install --fix`) ou entra na lista do CP-03, conforme ele disser | Mantém aberto até o prazo |

### 8.7 Contagem final

(Contagem da correção 2; a de hoje está em 8.8.4.) **Abertos: 6** (V-DEP-3, V-INS-02 a V-INS-06), todos com dono, issue e prazo; um deles (V-DEP-3) é tolerado por decisão já tomada (CP-03, até 2027-01-05) e os cinco V-INS são instabilidades que não reproduziram em 5 rodadas completas. **Fechados: 65 de 71** (entram hoje V-DEP-2b, V-DEP-4 e V-ROT-01). **Pendentes de decisão humana: nenhuma** (as cinco perguntas, Q1 a Q5, foram respondidas por Rafael em 2026-10-13). O item do G00 "o registro da E03 tem zero itens abertos e a regra de BZ-N:N.3 está decidida por Rafael": a regra está decidida; "zero itens abertos" NÃO é literalmente verdade (há 6 linhas abertas, todas com dono, issue e prazo). Fica para o gatekeeper e para o Rafael dizer se linha aberta e nomeada, de instabilidade não reproduzida, basta para o item.


## 8.8 Situação depois da rodada 2 da validação (correção 3, 2026-10-13)

A rodada 2 (SHA `4b96ea7`, `qa.md` desta pasta em `validacao/4b96ea7/`) reprovou a etapa por quatro motivos: seis linhas abertas, prazos de 2026-10-27 acima do teto de 5 dias que o Rafael decidiu na D2 (E02, `dc360/docs/POLITICA-DE-TESTE-VERMELHO.md`), referências a E21 e E18 que não contêm o trabalho, e a divergência D-4 sem dono. Esta seção responde aos quatro. Onde ela divergir das seções 8.3, 8.6 e 8.7, vale esta. O prazo da regra R6 é de 5 dias corridos a contar de hoje (2026-10-13), com um dia de folga pelo relógio UTC do portão: o último dia aceito é 2026-10-18. As provas de hoje estão em `correcao-3/saidas/`.

### 8.8.1 O que foi conferido contra a suíte de hoje

Base: HEAD `6b25043` mais a árvore de trabalho da correção 2 da F00. Máquina e Node as mesmas da seção 8.

| Linha | O que rodou hoje | Resultado | Leitura |
| --- | --- | --- | --- |
| V-DEP-3 | `node scripts/auditar.mjs` (com rede) | saída 0; app de campo com 55 vulnerabilidades fora de desenvolvimento, as 6 de pacote próprio nomeadas em `ACEITAS_NO_APLICATIVO`, cada uma com dono e prazo 2027-01-05 | Não é teste vermelho. É exceção de dependência decidida (CP-03), e o portão faz o prazo valer: `auditar.test.mjs` tem o caso "reprova a exceção vencida" |
| V-INS-02 | busca por `setTimeout(..., 20)` em `apps/api/test` | continuam 10 pontos em 4 arquivos (`desinterdicao`, `fotos-do-documento`, `identificador-da-emissao`, `segunda-via-nao-reinterdita`) e as esperas fixas de 10 a 100 ms em `push-rodada-diz-o-que-fez`, `push-sem-resposta` e `recuperacao-sem-oraculo` | Segue aberta: o trabalho não foi feito, e nenhum desses pontos falhou em rodada medida |
| V-INS-03 e V-INS-04 | `npx vitest run --root packages/shared test/dominio.test.ts test/regras-de-conteudo.test.ts`, 2 rodadas | 22 de 22 nas duas (5,6 s e 6,5 s) | Não reproduziu. Sem causa medida, a falta de reprodução não é conserto (R6); seguem abertas |
| V-INS-05 | não rodado nesta correção | sem medição nova | O `test:isolamento` usa o banco da máquina, que outros implementadores usavam ao mesmo tempo; rodar agora seria medir a carga dos outros. Vale a medição da seção 8.4 (6 rodadas, 0 falhas) |
| V-INS-06 | não rodado nesta correção | sem medição nova | O e2e da API em Firefox sobe portas e navegador que outros implementadores usavam. Vale a medição da seção 8.4 (1 falha em 8 rodadas em Firefox) |
| D-4 | `node scripts/baseline.mjs --sem-instalar` (gatekeeper, 17 de 17) e o job de CI | o roteiro não tem o passo do Firefox; o CI roda `MOTOR=firefox npm run test:e2e` (painel) no job de navegador e o e2e da API só em Chromium | A lacuna é real e continua |

### 8.8.2 Estado de cada linha

Dono de todas: `rafael` (padrão da E02). Prazo de todas as abertas: 2026-10-18.

| Linha | Estado | Etapa que contém o trabalho | Observação |
| --- | --- | --- | --- |
| V-DEP-3 | **TOLERADA POR DECISÃO (CP-03, R5)**, fora da contagem de vermelhos abertos | V2-F00-E19 (a lista `ACEITAS_NO_APLICATIVO` e o portão); a saída definitiva, subir o SDK do Expo por inteiro, não tem etapa no roadmap (F01-E06 exclui a troca de SDK) e não precisa de uma agora, porque o portão reprova em 2027-01-05 e força a decisão | A política da casa diz que dependência segue o CP-03 e não a T42 (R5). O prazo de 2027-01-05 é o que o Rafael decidiu em 2026-10-07, e não um prazo de skip. Esta reclassificação é proposta deste registro e vai para o Rafael junto com o H03 |
| D-4 (nova linha **V-ROT-02**) | ABERTO | V2-F00-E01. O texto da etapa pede que `npm run test:e2e` rode "em Chromium e Firefox" na máquina limpa, e o roteiro só roda o Chromium | Trabalho: um passo `e2e-firefox` (`MOTOR=firefox npm run test:e2e`, painel em modo local) em `dc360/scripts/baseline.mjs`, com o esperado e a contagem declarados e conferidos por `conferir:numeros`. Este arquivo é compartilhado e ficou fora da área desta correção; quem fecha é a correção seguinte da E01 |
| V-INS-06 | ABERTO | V2-F00-E18, cujo objetivo é o e2e de navegador verde, e o item do G00 "E2E de navegador" pede Chromium e Firefox | Trabalho: na seção 23 de `fluxo-api.e2e.mjs`, esperar o painel responder, com limite, antes de abrir o segundo contexto; na próxima falha, arquivar a saída bruta e o trace |
| V-INS-04 | ABERTO | V2-F00-E20, cujo objeto é exatamente `regras-de-conteudo.test.ts` | Trabalho: tolerar arquivo que some entre a listagem e a leitura (`ENOENT`) se for essa a causa, e fixar o limite de tempo; arquivar a saída bruta da próxima falha |
| V-INS-03 | ABERTO | V2-F00-E20 (o shared fecha sem vermelho é a DoD dela) | Trabalho: limite explícito por teste em `dominio.test.ts`. É a etapa mais próxima, mas o objeto dela é o portão de conteúdo e não a varredura do checklist: o encaixe é parcial |
| V-INS-05 | ABERTO | **NENHUMA contém o trabalho.** O item do G00 "o `test:isolamento` nunca ficou vermelho durante a fase" é o critério violado, mas nenhuma etapa da F00 mexe em `db/test/` por esse motivo | Vai para a decisão do Rafael (H03): criar uma etapa para ela, ou aceitar a linha aberta e nomeada |
| V-INS-02 | ABERTO | **NENHUMA contém o trabalho.** A resposta do Rafael à Q4 foi "os outros 10 pontos entram numa etapa futura", e essa etapa não existe no roadmap (a proposta de quarto item da E21, STATUS seção 11, nunca foi aceita) | Vai para a decisão do Rafael (H03) |

Recomendação deste registro, que não é decisão: abrir uma etapa curta da F00 (por exemplo `V2-F00-E26`, estabilidade da suíte, tamanho S) com V-INS-02, V-INS-03, V-INS-05 e o passo do Firefox do roteiro, para que cada linha tenha uma etapa que de fato contenha o trabalho. Quem acrescenta etapa ao roadmap é o orquestrador, e a escolha entre isso e aceitar linha aberta e nomeada é do Rafael.

### 8.8.3 Correções de leitura das seções anteriores

- O cabeçalho da seção 8 diz que os prazos são "dentro do máximo de 30 dias da política (até 2026-11-12)". O teto passou a 5 dias em 2026-10-13 (D2). Vale o 8.8.2.
- A tabela 8.6 diz, para a Q4, que "a E21 ganha o quarto item". Não ganhou, e o Rafael respondeu "etapa futura". Vale o 8.8.2.
- O título de 8.2 ("62 de 71") e a tabela de 8.3 (que lista nove linhas, três delas já marcadas FECHADA) descrevem o estado anterior à correção 2. A conta de hoje está em 8.8.4.

### 8.8.4 Contagem final depois da correção 3

| Situação | Linhas |
| --- | --- |
| Fechadas | 65 de 71 (inalterado) |
| Tolerada por decisão de dependência (CP-03, fora da T42) | 1: V-DEP-3 |
| Abertas, com dono, prazo 2026-10-18 e etapa | 4: V-INS-03 e V-INS-04 (E20), V-INS-06 (E18) e V-ROT-02 (D-4, E01) |
| Abertas, com dono e prazo, SEM etapa que contenha o trabalho | 2: V-INS-02 e V-INS-05 |

Total: 65 + 1 + 4 + 2 = 72, porque V-ROT-02 (a D-4) é linha nova: as 71 linhas da seção 8.7 mais ela. Abertas hoje: 6 (V-INS-02, V-INS-03, V-INS-04, V-INS-05, V-INS-06 e V-ROT-02). O item do G00 "zero itens abertos" continua sem fechar à letra; a escolha entre fechar as seis (por uma etapa nova, ou pelo trabalho feito até 2026-10-18) e aceitar linha aberta e nomeada é do Rafael (H03).


## 9. As seis linhas abertas, fechadas pelo trabalho (correção 4, 2026-10-15)

A rodada 3 (SHA `52952a1`, `qa.md` em `validacao/52952a1/`) reprovou a etapa porque o registro ainda tinha 6 linhas abertas e o item do G00 exige zero, e porque V-INS-02 e V-INS-05 nem tinham etapa que contivesse o trabalho. A escolha desta correção foi a que a seção 8.8.4 deixou como alternativa: fechar as seis de verdade, fazendo o trabalho que a coluna "Trabalho" das tabelas 8.3 e 8.8.2 descreve, com prova. Esta seção acrescenta e não apaga: as seções 1 a 8 ficam como o histórico, e onde divergirem desta, vale esta. As saídas estão em `correcao-4/saidas/` (numeradas) e o `RESUMO.md` de `correcao-4/` diz o que cada uma mostra.

Base: HEAD `56d0a24` mais a árvore de trabalho desta correção. Máquina: Mac de 8 núcleos, Node 24.15.0 (outra que a das seções 8 a 8.8, que mediram no Windows). "Carga sintética" abaixo é N laços de CPU ocupados (`node -e 'for(;;){}'`) rodando ao mesmo tempo que a suíte, e quando o texto diz "duas suítes ao mesmo tempo" é isso mesmo. Nenhum teste teve asserção tirada e nenhum limite foi subido sem a medida ao lado.

### 9.1 Estado de cada linha

| Linha | Estado | O que mudou no código | Causa: o que foi medido e o que não foi | Por que a causa não volta | Prova |
| --- | --- | --- | --- | --- | --- |
| V-INS-02 | **FECHADO** | Os 10 `setTimeout(r, 20)` de `desinterdicao` (3), `fotos-do-documento` (2), `identificador-da-emissao` (2) e `segunda-via-nao-reinterdita` (3) viraram `esperarORelogioAndar()` (`apps/api/test/esperar-o-relogio.ts`): `vi.waitFor` com limite de 2 s até `Date.now()` passar do instante em que o ato anterior terminou. As 2 esperas de polling (`push-sem-resposta`, e o `esperarAte` de `push-rodada-diz-o-que-fez`) viraram `vi.waitFor` com limite e mensagem. O `setTimeout(ok, 50)` de `recuperacao-sem-oraculo` virou espera pela linha "falha ao enviar o link de recuperacao" no log. | **Nenhum desses pontos falhou em nenhuma rodada, antes nem agora.** O mutante (a função de espera vazia, 6 rodadas sob 16 laços) também fica verde: o ato seguinte já leva mais de 1 ms por causa do pedido HTTP e do banco. Então a espera de 20 ms era seguro, e não conserto de falha observada; o que se mudou foi a forma do seguro. | O carimbo do segundo ato passa a ser garantido maior que o do primeiro pela condição, e não por um tempo que depende de a máquina estar livre. As 3 esperas que restam em `push-rodada-diz-o-que-fez` (50 ms, 100 ms e 100 ms) são janelas de SILÊNCIO: provam que NÃO veio uma segunda rodada, e esperar pouco só pode dar falso verde, nunca falso vermelho; ficam, com o motivo no comentário. | `saidas/01` (7 arquivos, 71 de 71, 5 de 5 rodadas, sob 16 laços e a suíte do shared ao lado), `saidas/02` (mutante) |
| V-INS-03 | **FECHADO** | `dominio.test.ts`, caso "ninguém redefine o checklist...": limite explícito de 60 s (`}, 60_000)`). | Causa NÃO reproduzida aqui: sozinho o caso leva 0,5 s; sob 24 laços, 1,3 a 1,7 s; sob 80 laços, 2,9 a 3,1 s (fator de 6 sobre o livre). O estouro dos 5 s do Windows não aconteceu em nenhuma das 8 rodadas sob carga. A hipótese da seção 8.3 (a varredura lê o código-fonte de todo o produto, `apps/campo/ios/` sozinha passa de 1 GB) é coerente com o fator medido, mas segue hipótese. | Para estourar o novo limite o caso teria de ficar 20 vezes mais lento que o pior tempo medido sob 80 laços. Se estourar, reprova com "Test timed out", que é falha de verdade e abre linha nova. | `saidas/03`, `saidas/04` |
| V-INS-04 | **FECHADO** | `regras-de-conteudo.test.ts`: `statSync(..., { throwIfNoEntry: false })`, `readdirSync` e `readFileSync` tolerantes a `ENOENT` (função `lerSeExistir`; só o `ENOENT` é tolerado, `EISDIR` e permissão continuam derrubando), e limite explícito de 60 s nos casos que varrem a árvore. 2 casos novos: link simbólico pendurado (o instante exato "listado e sumiu") e "só tolera ENOENT". | **Parte medida:** a varredura de fato quebrava com `ENOENT` se um arquivo sumisse entre a listagem e a leitura (reproduzido com um link pendurado: `ENOENT: no such file or directory, stat`, `saidas/05`). **Parte não medida:** a mensagem da falha de 2026-10-13 nunca foi capturada, então não se sabe se foi `ENOENT` ou os 5 s; os dois caminhos estão fechados. Sob carga, o arquivo todo passou de 0,35 s (livre) para 2,3 a 2,9 s (24 laços), 8 vezes. | Arquivo que some entre a listagem e a leitura não derruba mais a varredura (teste que reprova no código antigo, passa no novo); e o estouro de tempo exige 20 vezes o pior tempo medido. | `saidas/05` (vermelho), `saidas/06` (verde), `saidas/03`, `saidas/04` |
| V-INS-05 | **FECHADO** | `db/test/isolamento.test.ts`: o caso das seis vias de privilégio (23 varreduras em série) passa de 60 s para 240 s, e o arquivo cede o laço de eventos (`setImmediate`) após cada caso (`afterEach`) e a cada varredura (`sobras()`). Nenhuma asserção mudou. | **Medida, e é a única das seis em que a causa foi achada.** Uma sonda de atraso do laço (`setInterval` de 200 ms) dentro do worker mostrou, sob 24 laços de CPU, UM atraso de 83 s: o arquivo inteiro correu sem o laço girar, porque o PGlite responde por promessas já resolvidas (microtarefas) e uma cadeia de `await db.query(...)` nunca devolve o laço ao Node. Efeitos observados: (a) o caso passou de 60 s (72 s) e reprovou com "Test timed out in 60000ms"; (b) com só o limite subido (240 s) o caso passou, e o comando AINDA saiu com 1 por `Timeout calling "onTaskUpdate"` (Errors 1), igual às falhas da F00 em que 327 casos passavam; a leitura mais provável, não inspecionada no código do vitest, é que a resposta do processo principal só é lida quando o laço gira e o temporizador de 60 s do RPC dispara antes dela. Máquina livre o arquivo leva 23 s e nada disso aparece, que é por que só aparecia sob carga. | Com a cessão, a sonda mostra atrasos de cerca de 3 s (uma varredura) e nenhum de 83 s, e o erro some: 5 de 5 rodadas sob 24 laços saem com 0 e sem "Errors" (antes: 2 de 2 reprovadas pelo erro). O limite de 240 s é 16 vezes o tempo livre do caso (15 s) e 3 vezes o pior medido sob carga (72 s). | `saidas/07` e `saidas/08` (antes), `saidas/09` e `saidas/10` (a sonda), `saidas/11` (5 rodadas), `saidas/12` e `saidas/22` (livre) |
| V-INS-06 | **FECHADO** | `apps/web/test/fluxo-api.e2e.mjs`: a seção 23 abre o segundo contexto por `irParaQuandoOPainelResponder`, que tenta a navegação de verdade no navegador sob teste e repete SÓ quando o erro é de conexão recusada (`NS_ERROR_CONNECTION_REFUSED` no Firefox, `ERR_CONNECTION_REFUSED` no Chromium), a cada 250 ms, por até 30 s. Outro erro sobe na hora. | **Causa NÃO medida, e a falha NÃO reproduziu** nem no Firefox sob 12 laços (5 de 5 verdes, 288 e 64 verificações) nem no Chromium livre. Das duas hipóteses da seção 8.3, a do `localhost` resolvido por IPv6 prediria falha em TODA rodada e não em 1 de 4, então o que sobra como explicação é o painel ainda não aceitar a conexão naquele instante. | Recusa transitória de conexão passa a ser esperada por até 30 s, no próprio navegador. A prova mostra a função contra um painel que só sobe 2,5 s depois: sem ela o `goto` falha com a mesma mensagem do relato; com ela passa em 2,6 s; painel que nunca sobe reprova no limite com a mensagem do navegador; erro de host inexistente não é repetido. | `saidas/13`, `saidas/14`, `saidas/15` |
| V-ROT-02 | **FECHADO** | `dc360/scripts/baseline.mjs`: passo novo `e2e-firefox` (o `npm run test:e2e` do painel local com `MOTOR=firefox`, mesmo servidor e mesmo esperado de 70 do passo do Chromium), e o motor passa por `ambiente` do passo (`ambienteDoPasso`), e não por prefixo de shell que o Windows não entende; o passo `e2e` fixa `MOTOR: chromium`; o cabeçalho de cada passo, a listagem (`--so-listar`) e o `RESUMO.md` do roteiro mostram o motor na frente do comando (`MOTOR=firefox npm run test:e2e`), para quem repete à mão (`comandoParaMostrar`). `baseline.test.mjs`: 2 casos novos. `COMO-REPRODUZIR.md` da E01: 20 passos (18 com `--sem-instalar`). | Não é instabilidade: era lacuna do roteiro. | O teste do roteiro reprova se o passo sumir, se o servidor ou o esperado divergirem do Chromium, se o texto do comando voltar a ter `MOTOR=`, ou se o E2E deixar de ler `MOTOR`. O mutante `MOTOR=motor-inexistente` faz o passo sair com 2 e "motor desconhecido": o motor chega de fato ao teste. | `saidas/16`, `saidas/17` |

Os números de teste mudaram em duas tabelas de `scripts/baseline.mjs`, conferidos por `npm run conferir:numeros`: o shared passa de 168 para 170 (2 casos de V-INS-04, chave `V2-F00-E03-correcao-4` em `MUDANCAS_DO_TESTE_SHARED_POR_ETAPA`) e os testes de `scripts/` da E01 passam de 27 para 29 (2 casos de V-ROT-02, `TESTES_DA_E01_EM_SCRIPTS`). A API (1327), o banco (345) e o painel não mudaram de contagem.

### 9.2 O que esta correção NÃO prova

- **V-INS-02 não era falha viva.** O fechamento é preventivo: a condição substitui o chute, mas nenhuma rodada, antes ou depois, mostrou o chute falhar. Está dito aqui para não parecer que uma falha foi consertada.
- **V-INS-03, V-INS-04 e V-INS-06 não reproduziram nesta máquina**, nem com 80 laços de CPU (V-INS-03/04) nem em 5 rodadas de Firefox (V-INS-06). O que se afirma é o que mudou e por que o modo de falha conhecido fica fechado (limite 20 vezes acima do pior tempo medido; `ENOENT` tolerado e provado com teste que reprova antes; recusa de conexão esperada com limite e provada contra um painel que sobe tarde). Se um deles cair de novo por OUTRO motivo, é linha nova.
- **A causa de V-INS-05 foi achada num Mac**, sob carga sintética. O Windows em que o `ng serve` ocupava a CPU deu o mesmo erro (`Timeout calling "onTaskUpdate"`, caso das seis vias passando de 60 s), mas lá a sonda não rodou. O mecanismo (laço de eventos sem girar) é de PGlite e do vitest, não do sistema operacional.

### 9.3 Contagem final depois da correção 4

| Situação | Linhas |
| --- | --- |
| Fechadas | 71 de 72 (as 65 de 8.8.4 mais V-INS-02, V-INS-03, V-INS-04, V-INS-05, V-INS-06 e V-ROT-02) |
| Tolerada por decisão de dependência (CP-03, fora da T42) | 1: V-DEP-3, com prazo 2027-01-05 |
| **Abertas** | **0** |

O item do G00 "o registro da E03 tem zero itens abertos" passa a ser verdadeiro à letra: nenhuma linha de teste vermelho, skip ou instável está aberta. V-DEP-3 não é teste: é exceção de dependência com dono e prazo decididos pelo Rafael em 2026-10-07 (R5), contada à parte desde a seção 8.8.2. A pergunta H03 da seção 8.8.2 (criar etapa para V-INS-02 e V-INS-05, ou aceitar a linha aberta) deixa de existir, porque as duas linhas foram fechadas pelo trabalho.
