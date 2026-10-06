# V2-F00-E03: Classificação dos vermelhos por causa

Data: 2026-10-05. Base: as saídas arquivadas da E01 (`docs/evidencias-v2/G00/V2-F00-E01/saidas/*.txt`, medidas em 2026-10-05 sobre o commit `e82719e`), conferidas uma a uma contra o código citado. Nenhum código foi alterado nesta etapa. Cada afirmação da etapa foi relida no arquivo e na linha (seção 4): onde não bateu, a divergência está na seção 5 e não foi copiada.

Situação da decisão: a regra da seção 1 está aplicada como PREMISSA (STATUS, seção 9), porque Rafael ainda não decidiu BZ-N:N.3. A validação humana pedida está na seção 7.

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

## 7. Decisão pedida a Rafael

Com esta tabela na mão, três respostas:

1. A regra de BZ-N:N.3 (política, seção "Quando o teste e o código discordam"): onde há decisão datada no código e teste irmão passando, o código vale e o teste é reescrito com registro; onde o teste descreve defeito confirmado por leitura do código, o teste vale e o código é consertado. Aprova, ou troca? Situação hoje: premissa assumida.
2. Os 14 defeitos do campo (V-CAM-07 a V-CAM-20) são defeitos reais? Situação hoje: tratados como defeitos reais, premissa assumida.
3. Os 6 do campo e os 3 de scripts que a regra manda reescrever (V-CAM-01 a V-CAM-06, V-SCR-3, e os de classe C com mudança de teste) podem ser reescritos nas etapas E14, E17 e E21 com o registro já aberto?

Resposta de Rafael: PENDENTE. O item "vermelhos classificados" do G00 só se marca com a decisão dele.
