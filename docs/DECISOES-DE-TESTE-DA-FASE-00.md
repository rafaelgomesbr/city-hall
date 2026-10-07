# Decisões de teste da Fase 00

Registro curto de cada teste reescrito (e não consertado no código) durante a
Fase 00 do Roadmap V2. Existe pela política T42
(`dc360/docs/POLITICA-DE-TESTE-VERMELHO.md`): reescrever um teste vermelho sem
registro é o padrão que escondeu defeito real no commit 5ecdf4c.

Este arquivo não consome número de ADR: a sequência 0009 em diante já está
reservada pelas fases seguintes.

## Como registrar

Uma seção por teste (ou por grupo de testes da mesma causa), com estes campos:

- **Teste:** arquivo e nome.
- **Antes:** o que o teste afirmava.
- **Decisão que o torna velho:** a decisão datada e onde ela está escrita no código.
- **Depois:** o que o teste passa a afirmar.
- **Evidência:** a saída que prova o comportamento atual e o teste irmão que passa.
- **Etapa e data.**

Defeito real nunca entra aqui: ele se conserta no código.

## Regra geral (V2-F00-E03, 2026-10-05)

Decisão: quando o teste e o código discordam, vale a regra escrita em
`dc360/docs/POLITICA-DE-TESTE-VERMELHO.md`, seção "Quando o teste e o código
discordam".

1. Onde há decisão datada no código, posterior ao teste, e um teste irmão
   passando que a afirma, o código vale e o teste é reescrito, com registro
   aqui (R1).
2. Onde o teste descreve como defeito algo que a leitura do código confirma, o
   teste vale e o código é consertado (R2). Não se registra aqui.
3. Sem uma das duas provas o teste não se reescreve: trata-se como defeito até
   Rafael dizer o contrário.

Estado da decisão: PREMISSA assumida pela E03 (STATUS, seção 9). Rafael ainda não
decidiu BZ-N:N.3 nem confirmou os 14 defeitos do campo. Enquanto ele não decide,
as reescritas abaixo estão prontas na decisão e na evidência, e a etapa que
reescreve cada teste completa o campo "Depois" com o diff real. A tabela de
todos os vermelhos, com a regra aplicada a cada um, está em
`docs/evidencias-v2/G00/V2-F00-E03/classificacao-dos-vermelhos.md`.

O que fica FORA deste registro, por ser defeito real: os 14 testes do campo das
etapas E15 e E16 (diálogo de saída, precisão de GPS, frase de envio, teclado,
área segura, ajustes e foto vazia), os 8 do painel da E09, os 3 de Toast, o de
design-system e o do `/` da E13 (com os dois e2e locais), os 2 da API (E07 e
E12), os 5 da vigência (E04) e o e2e da API (E18). O conserto deles é no código.

## Índice dos registros

| Seção | Testes | Etapa que reescreve | Situação do registro |
| --- | --- | --- | --- |
| campo: sessão encerrada e logout | 6 (mais 1 caso de deriva novo) | E14 | feito e provado na V2-F00-E14 |
| painel: portão de acessibilidade | 1 | E13 | idem |
| shared: varredura de travessão | 1 (mais 1 literal) | E20 | idem |
| painel: leitura de fonte com fim de linha | 1 | E21 | feito e provado na V2-F00-E21 |
| API: certificado de teste do banco | 13 casos (1 suíte) | E21 | feito e provado na V2-F00-E21 |
| scripts: três testes de portabilidade e de configuração | 3 | E17 | idem |
| API: código de erro da sessão | 3 arquivos, 7 ocorrências | E05 (e E07) | idem |
| API: espera fixa de 20 ms | 1 instável (e 10 pontos a medir) | a definir (proposta: E21) | proposta, sem etapa aceita |
| fila do campo: 401 e 403 de sessão deixam de ser permanentes | 3 (2 no pacote, 1 na integração com a API) | E06 | feito e provado na V2-F00-E06 |
| API e painel: papel diferente do token deixa de ser `sessao_encerrada` | 3 (2 na API, 1 no painel) | E07 | feito e provado na V2-F00-E07 |
| painel, e2e contra a API: a seção 15 conta só a tabela da trilha | 1 verificação (e as 2 anteriores da mesma seção, que usavam o mesmo seletor) | E18 | feito e provado na V2-F00-E18 |
| painel, e2e contra a API no Firefox: miniatura com `loading="lazy"` e os abortos de propósito no console | 1 verificação e o portão de console | E18 | feito e provado na V2-F00-E18 |

## Registros

### campo: sessão encerrada e logout (E14)

- **Teste:** seis, em três arquivos de `dc360/apps/campo/src`.
  - `__tests__/a-sessao-que-terminou-nao-e-falta-de-sinal.test.tsx:203-204`,
    "o ⓘ ensina o caminho de volta, e promete a fila de pé".
  - `__tests__/perfil-a-sessao-que-terminou-e-o-aviso-que-fecha.test.tsx:156-159`,
    "e ensina o caminho de volta, sem prometer o que não vale".
  - `push/logout-cala-o-aparelho.test.tsx`, quatro casos ("manda a ficha deste
    aparelho junto com a saída", "sai normalmente quando este aparelho nunca
    teve ficha", "esquece a ficha depois de mandá-la, para ela não sobreviver ao
    turno", "guarda o município da sessão, que é o que a barreira de push
    compara").
- **Antes:** os dois primeiros esperavam a frase `Sair da conta` e a promessa
  "continua guardado no aparelho" como instrução da sessão encerrada. Os quatro
  do logout usavam um dublê de `../dados/banco-local` com só `apagarDadosLocais`.
- **Decisão que o torna velho:**
  1. Desde 15/09/2026 a sessão encerrada manda "Entrar de novo" e diz "Nada é
     apagado", porque `sair()` apaga a vistoria começada. Escrita em
     `apps/campo/src/app/(agente)/index.tsx:1222` e em
     `apps/campo/src/dados/falha-de-atualizacao.ts` (`comoContarAFalha`), commit
     5ecdf4c (2026-09-15 23:28). Os dois testes são de 2026-09-14 (dcdcec9) e
     2026-09-15 13:18 (4a55563).
  2. `dados/sessao.tsx:4,150,180,247` passou a importar e chamar
     `acolherNoAparelho` e `marcarDonoDosDadosLocais` (`dados/banco-local.ts:252`
     e `:228`), também em 5ecdf4c. O teste do logout é de 57795e9 (2026-09-09) e
     não foi tocado depois, então o dublê ficou para trás.
- **Depois (feito na V2-F00-E14, 2026-10-07):**
  - Os dois casos de frase exigem a frase inteira `Toque em "Entrar de novo"`
    (e não só as três palavras, que também são o rótulo do botão do aviso) e
    `Nada é apagado`. O negativo do diálogo da lista recusa qualquer
    `Sair da conta` dentro de `explicacao` (`queryByText(...)` nulo); o do
    Perfil recusa a INSTRUÇÃO `toque em "Sair da conta"`, porque a tela tem um
    botão legítimo com esse rótulo. O roadmap escreve `not.toMatch`; o
    equivalente na biblioteca de tela é `queryByText` nulo, que procura em
    todos os textos desenhados e não em uma string só.
  - O dublê de `../dados/banco-local` em `push/logout-cala-o-aparelho.test.tsx`
    ganhou `acolherNoAparelho` (devolve `{ apagou: false }`, a mesma pessoa
    entrando) e `marcarDonoDosDadosLocais`. Os quatro casos do logout continuam
    afirmando o mesmo (a ficha segue com a saída, é esquecida depois, o
    município da sessão é guardado): nenhuma linha de asserção mudou.
  - Caso novo, "o dublê do banco local acompanha tudo o que sessao.tsx importa
    dele": lê a fonte de `dados/sessao.tsx`, extrai os nomes do import de
    `./banco-local` e reprova listando o nome que faltar no dublê. Reprova
    também se o import não for encontrado (casamento vazio não é acerto).
- **Sondas (o teste reescrito ainda pega o defeito):** com `acolherNoAparelho`
  tirado do dublê, os 5 casos do arquivo reprovam e o de deriva diz
  `["acolherNoAparelho"]`; com a frase antiga ("toque em \"Sair da conta\" e
  entre de novo ... continua guardado no aparelho") posta de volta em
  `falha-de-atualizacao.ts` por um instante, os 2 casos de frase reprovam. O
  arquivo de produto voltou idêntico (SHA-256 conferido). Saídas em
  `docs/evidencias-v2/G00/V2-F00-E14/saidas/`.
- **Evidência:** o teste irmão é `__tests__/a-sessao-vencida-nao-apaga-a-vistoria.test.tsx`
  (afirma o "Entrar de novo" e que `sair()` não é chamado; passa em
  `V2-F00-E01/saidas/08-teste-campo-app.txt:8051`, mesmo commit da decisão).
  `dados/logout-nao-apaga-prova.test.ts` também passa (`:8147`). Não é o
  `falha-de-atualizacao.test.ts` que o roadmap cita: ele passa, mas cobre o
  acesso suspenso e a classificação do 401 (ver a divergência D-2 da
  classificação). As seis falhas atuais estão em `08-teste-campo-app.txt:4,70,3545`.
  Leitura de apoio da E14: `dados/banco-local.ts:215-285` (`donoDosDadosLocais`,
  `marcarDonoDosDadosLocais` em `:228`, `acolherNoAparelho` em `:252`, que
  apaga só quando outra pessoa entra) e o comentário de
  `app/(agente)/index.tsx:1222` ("Até 15/09/2026 este botão chamava `sair()`").
- **Etapa e data:** decisão registrada na V2-F00-E03 em 2026-10-05; reescrita na
  V2-F00-E14 em 2026-10-07, sem tocar em nenhum arquivo de produto.

### painel: portão de acessibilidade (E13)

- **Teste:** `apps/web/test/acessibilidade.test.ts`, "nenhum onClick pendurado
  em elemento que o teclado não alcança" (a janela está em `:318`).
- **Antes:** o portão procurava "acessibilidade: excecao" só nas 4 linhas acima
  do elemento (`slice(el.linha - 5, el.linha - 1)`).
- **Decisão que o torna velho:** o bloco de comentário com a exceção e a razão
  de `componentes/Modal.tsx:254-259` (commit eafc4ca, 2026-09-09) tem 6 linhas
  e a regra do próprio teste diz que a razão "costuma não caber em uma". O
  portão é que está estreito: o elemento (`Modal.tsx:260`) tem a exceção escrita.
- **Depois (previsto, E13):** o portão procura a marca no bloco de comentário
  contíguo acima do elemento, sem janela fixa; um caso sintético prova que um
  `onClick` sem exceção ainda reprova.
- **Evidência:** `V2-F00-E01/saidas/07-teste-web.txt:331-340`; leitura de
  `Modal.tsx:253-260`. Teste irmão: os demais casos do mesmo arquivo passam.
- **Etapa e data:** decisão registrada na V2-F00-E03 em 2026-10-05; reescrita na
  V2-F00-E13. A E13 não lista este arquivo em "Documentação a atualizar": deve
  completar este registro.

### shared: varredura de travessão (E20)

- **Teste:** `packages/shared/test/regras-de-conteudo.test.ts`, "nenhum
  travessão em texto nenhum"; e o literal em `apps/web/test/trilha-detalhe.test.ts:181`.
- **Antes:** a varredura lê tudo em `docs/`, e três fontes legítimas reprovam:
  o literal do próprio `trilha-detalhe.test.ts:181` (nascido em 5ecdf4c,
  2026-09-15), a citação em `docs/AUDITORIA-2026-09-30.md:313` e a saída bruta
  em `docs/auditoria-v2/raw/teste-shared.txt:23,33,41`.
- **Decisão que o torna velho:** nenhuma decisão superada: o portão está certo.
  O que muda é a fonte do acerto. A E01 já trocou o travessão por `[travessao]`
  nas saídas novas que arquiva; os relatórios históricos não se reescrevem
  (seriam evidência apagada).
- **Depois (previsto, E20):** o literal vira escape (`"\u2014"`) com a mesma
  asserção; `CAMINHOS_IGNORADOS` cobre `docs/auditoria-v2/raw` e
  `docs/evidencias-v2` só para arquivos que não são `.md`, e o arquivo
  `docs/AUDITORIA-2026-09-30.md`, cada um com o motivo; casos de âncora provam
  que a isenção não é mais larga.
- **Evidência:** `V2-F00-E01/saidas/02-teste-shared.txt:40-47`.
- **Etapa e data:** decisão registrada na V2-F00-E03 em 2026-10-05; reescrita na
  V2-F00-E20 (lista de isenções aprovada por Rafael).

### painel: leitura de fonte com fim de linha (E21)

- **Teste:** `apps/web/test/ocorrencia-encerramento.test.ts:166`, "nada grava o
  encerramento fora do ramo de confirmação".
- **Antes:** procurava `"\n}\n"` no texto lido do disco.
- **Decisão que o torna velho:** nenhuma decisão superada: é ambiente. Com
  `core.autocrlf=true` e sem `.gitattributes`, o índice fica LF e a árvore
  CRLF, e o marcador não existe (`slice(inicio, -1)` pega o arquivo inteiro).
- **Depois (feito na E21, 2026-10-07):** `apps/web/test/ler-fonte.ts` lê e
  normaliza `\r\n` para `\n` (`lerFonte`) e recorta a função até a chave na
  coluna zero (`blocoDaFuncao`), lançando erro em vez de devolver o resto do
  arquivo quando não acha o fim. As três afirmações do caso não mudaram.
  `apps/web/test/ler-fonte.test.ts` (7 casos) prova a mesma fonte em CRLF e em
  LF com o mesmo recorte, e os negativos: a chave de fechamento movida para
  antes do `onEnviar` tira a chamada do bloco, e função sem chave na coluna
  zero reprova alto. O `.gitattributes` da raiz passou a fixar LF.
- **Evidência:** `V2-F00-E01/saidas/07-teste-web.txt:384-398`; `git ls-files --eol`
  mostra `i/lf w/crlf` para o arquivo.
- **Etapa e data:** decisão registrada na V2-F00-E03 em 2026-10-05; reescrita na
  V2-F00-E21.

### API: certificado de teste do banco (E21)

- **Teste:** `apps/api/test/banco-tls.test.ts:109` (o `beforeAll` que roda
  `openssl req`), 13 casos.
- **Antes:** o `openssl` herdava o ambiente da máquina.
- **Decisão que o torna velho:** nenhuma decisão superada: é ambiente. A variável
  `OPENSSL_CONF` desta máquina aponta para
  `C:\Program Files\PostgreSQL\psqlODBC\etc\openssl.cnf`, que não existe.
- **Depois (feito na E21, 2026-10-07):** o `beforeAll` chama
  `gerarCertificadoAutoassinado` de `apps/api/test/openssl-do-teste.ts`, que
  passa ao `openssl` um ambiente sem `OPENSSL_CONF` só quando ela aponta para
  arquivo inexistente e imprime o motivo no `stderr` do teste. As 13 afirmações
  não mudaram e os 13 casos RODAM (nenhum pulado), no Git Bash e no PowerShell
  (lá o `openssl` não está no PATH e é achado ao lado do `git`; sem ele em
  lugar nenhum a suíte reprova com frase). `openssl-do-teste.test.ts`
  (10 casos) prova as duas metades: a variável quebrada sai, e uma configuração
  válida é lida de verdade (ela pede `CA:FALSE` e o certificado sai com
  `ca === false`; sem ela, `ca === true`).
- **Evidência:** `docs/auditoria-v2/raw/teste-banco-tls-sem-openssl-conf.txt`
  (13 de 13 sem a variável, 2026-09-30); a saída da E01
  (`05-teste-api.txt:417-430`) não mostra a causa porque o teste usa
  `stdio: "ignore"`.
- **Etapa e data:** decisão registrada na V2-F00-E03 em 2026-10-05; reescrita na
  V2-F00-E21.

### scripts: três testes de portabilidade e de configuração (E17)

- **Teste:** `scripts/comando-de-migracao.test.mjs:52` ("rodando da raiz,
  --conferir confere e NÃO aplica"), `scripts/copiar-producao.test.mjs:48` ("a
  pasta de copias recusa o repositorio, a nuvem de arquivos e a Area de
  Trabalho") e `scripts/entitlements-do-ios.test.mjs:73` ("a escolha do ambiente
  continua morando no app.config.ts, e não escrita à mão").
- **Antes:** o primeiro chamava `execFileSync("npm", ...)` sem `shell` (ENOENT no
  Windows); o segundo usava caminhos POSIX literais com `resolve` e `sep`; o
  terceiro procurava por regex a escrita literal do `aps-environment`.
- **Decisão que o torna velho:** os dois primeiros são portabilidade (ambiente),
  sem decisão superada. O terceiro tem decisão datada: `apps/campo/app.config.ts:158`
  guarda a escolha na constante `PERFIL_DE_PRODUCAO`, lida em `:597` e `:642`
  de propósito, para não existirem duas expressões (commit 5ecdf4c, 2026-09-15
  23:28; o teste é de bcb02c0, 2026-09-15 17:03). Para este terceiro não existe
  teste irmão que afirme o mesmo: por isso a reescrita precisa afirmar a
  constante E os dois usos, e não só apagar o regex.
- **Depois (previsto, E17):** o primeiro usa a invocação portátil de
  `scripts/testar-campo.mjs:103`; o segundo monta os caminhos com `join` e
  `resolve` a partir da raiz da plataforma e continua recusando repositório,
  iCloud, Dropbox, Google Drive, OneDrive e Área de Trabalho; o terceiro confere
  que `PERFIL_DE_PRODUCAO` nasce de `EAS_BUILD_PROFILE === "producao"` e alimenta
  o `mode` do plugin e `extra.pushAmbiente`, e reprova se o `mode` voltar a ser
  escrito à mão.
- **Evidência:** `V2-F00-E01/saidas/10-test-scripts.txt:214,248,354` (casos 35,
  38 e 53 na numeração atual; 19, 22 e 37 na antiga).
- **Etapa e data:** decisão registrada na V2-F00-E03 em 2026-10-05; reescrita na
  V2-F00-E17. A E17 não lista este arquivo em "Documentação a atualizar": deve
  completar este registro.

### API: código de erro da sessão (E05, com efeito na E07)

- **Teste:** `apps/api/test/senha-provisoria.test.ts:184`
  (`expect(troca.json().erro).toBe("sessao")`), `apps/api/test/vigencia-na-escrita.test.ts`
  e `apps/web/test/sessao-e-entrada.test.ts:79` (7 ocorrências em 3 arquivos,
  segundo a E05).
- **Antes:** afirmam o código `sessao` para sessão encerrada.
- **Decisão que o torna velho:** a E05 cria o catálogo de códigos
  (`nao_autenticado`, `sessao_encerrada`, `conta_desativada`) e troca `sessao`
  por `sessao_encerrada`. É decisão do roadmap, ainda não implementada. A
  primeira asserção do `senha-provisoria.test.ts:183` (o status 401) é defeito
  real e não se reescreve: é a que falha hoje e fecha na E07.
- **Depois (previsto, E05 e E07):** só o valor do código muda; o status e o
  comportamento afirmados ficam.
- **Evidência:** `V2-F00-E01/saidas/05-teste-api.txt:789-805`.
- **Etapa e data:** decisão registrada na V2-F00-E03 em 2026-10-05; reescrita na
  V2-F00-E05.

### API: espera fixa de 20 ms (instável)

- **Teste:** `apps/api/test/resolver-link.test.ts:418-419`, "conecta no endereço
  conferido com o nome no cabeçalho Host, e fecha sem ler o corpo".
- **Antes:** espera `setTimeout(resolve, 20)` e confere que o evento `close` da
  resposta chegou ao servidor local.
- **Decisão que o torna velho:** nenhuma decisão superada: é instabilidade. Falhou
  uma vez em três rodadas completas (E02, `V2-F00-E02/saidas/regressao-npm-test/04-teste-api.txt:565-580`)
  e passou isolado 3 de 3 e na segunda rodada completa.
- **Depois (proposto):** espera com condição e limite (por exemplo `vi.waitFor`
  com teto de 2 s) no lugar do tempo fixo, afirmando a mesma coisa. A mesma
  espera fixa aparece em outros 10 pontos de 4 arquivos (`desinterdicao`,
  `fotos-do-documento`, `identificador-da-emissao`, `segunda-via-nao-reinterdita`):
  medir antes de trocar.
- **Evidência:** classificação, seção 6.
- **Etapa e data:** proposta feita na V2-F00-E03 em 2026-10-05; nenhuma etapa
  existente a cobre (a E21 é a mais próxima). Aguarda Rafael aceitar o quarto
  item da E21 ou abrir etapa própria.

### API: `tokens.coordA` do `api.test.ts` entra de novo depois do teste de reuso

- **Teste:** `apps/api/test/api.test.ts`, "rotaciona o token de renovação e derruba tudo se o antigo reaparecer" (a asserção não muda; muda o que vem depois dela).
- **Antes:** o teste fazia um segundo login da Helena e provocava o reuso, que derruba TODAS as sessões dela, inclusive a de `tokens.coordA` aberta no `beforeAll`. Como o token de acesso só era conferido por assinatura na escrita, vários testes seguintes continuavam escrevendo com uma sessão já revogada.
- **Decisão que o torna velho:** a vigência na escrita religada na V2-F00-E04 (`servidor.ts`, `exigirAutenticacao`): sessão encerrada por reuso nega a escrita no pedido seguinte, que é o comportamento que o produto quer.
- **Depois:** o teste termina com `tokens["coordA"] = await entrar(...)`, como o painel faria depois de um 401. Nenhuma asserção foi enfraquecida; o efeito do reuso sobre o token vivo é provado em `vigencia-na-escrita.test.ts`.
- **Evidência:** `docs/evidencias-v2/G00/V2-F00-E04/saidas/07-api-test-sem-o-ajuste-do-coordA.txt` (sem o ajuste, 26 dos 52 testes de `api.test.ts` reprovam com `401` no lugar de `200`, `201`, `403` e `404`; com o ajuste, 52 de 52 passam e a API inteira fecha em `03-api-completa-depois.txt`).
- **Etapa e data:** V2-F00-E04, 2026-10-06.

### API e painel: o código `sessao` deixa de existir (oito ocorrências em três arquivos)

- **Testes:** `apps/api/test/senha-provisoria.test.ts` ("uma sessão viva cuja senha provisória venceu no meio não escreve nem renova"), `apps/api/test/vigencia-na-escrita.test.ts` (os seis casos que liam `erro` igual a `sessao`) e `apps/web/test/sessao-e-entrada.test.ts` ("renovação recusada: os tokens somem...", o dublê da rota `/auth/renovar`).
- **Antes:** esperavam `erro` igual a `sessao` em todo 401 de vigência e de renovação, e o teste da vigência esperava 401 para a conta desativada.
- **Decisão que o torna velho:** a V2-F00-E05 separou o código em três (`nao_autenticado`, `sessao_encerrada`, `conta_desativada`), porque a conta desativada pede ação oposta à da sessão encerrada: `sessao` não existe mais no servidor nem no catálogo de `@dc360/shared`.
- **Depois:** seis ocorrências da API esperam `sessao_encerrada` (mesmo status 401, mesma mensagem), a da conta desativada passa a esperar 403 `conta_desativada`, e o dublê do painel passa a responder `sessao_encerrada`. Nenhuma asserção foi enfraquecida: o status continua conferido em todas, e o teste da conta desativada ficou mais exigente (403 e código). O que o painel faz com cada código é provado em `sessao-e-entrada.test.ts` (sete casos novos) e a emissão no servidor em `codigos-de-erro.test.ts` (dezesseis casos).
- **Evidência:** `docs/evidencias-v2/G00/V2-F00-E05/saidas/02-sonda-antes-do-conserto.txt` (com o código velho de volta, 8 dos 16 casos novos reprovam) e `03-api-completa-depois.txt`.
- **Etapa e data:** V2-F00-E05, 2026-10-06.

### Fila do campo: 401 e 403 de sessão deixam de ser falha permanente (três testes)

- **Testes:** `packages/campo/test/fila.test.ts`, "401 é permanente de propósito, para não bloquear a conta do agente" e "sem token nem tenta a chamada"; `apps/api/test/campo-integracao.test.ts`, "token vencido bloqueia o item em vez de martelar o login do agente".
- **Antes:** afirmavam que o 401 e a falta de token eram `FalhaPermanente` (e, no teste de integração, que o item ficava `bloqueado` com uma tentativa gasta). Era o desenho original: sessão expirada não se resolve repetindo o envio, e reenviar em laço com token morto bloqueia a conta de quem está trabalhando.
- **Decisão que o torna velho:** a V2-F00-E06. Marcar a coleta como `bloqueado` por 401 ou 403 de sessão ou de conta convida a pessoa a descartar uma vistoria feita no morro (o botão "Descartar" fica ao lado do item), sendo que o servidor não recusou a coleta, recusou quem a manda. O catálogo de códigos (E05) permite distinguir `nao_autenticado`, `sessao_encerrada` e `conta_desativada`.
- **Depois:** o 401 e a falta de token são `FalhaDeSessao` (nem permanente nem temporária); o 401 `nao_autenticado` renova UMA vez e repete; a fila para, mantém o item `pendente`, não conta tentativa e devolve `paradaPor`. O motivo original (não martelar o servidor) continua provado: uma renovação por pedido, com a trava e o piso do `token.ts`, e a segunda recusa pausa a fila. Nenhuma asserção foi enfraquecida: o item ainda não é enviado, e o teste de integração agora também confere `tentativas` igual a zero e que nada chegou ao banco. O 403 `sem_permissao` continua bloqueando, provado em `pausa-de-sessao.test.ts` e em `campo-integracao.test.ts`.
- **Evidência:** `docs/evidencias-v2/G00/V2-F00-E06/saidas/02a-sonda-transporte-antigo.txt` (com o transporte antigo de volta, 16 dos 86 testes de `fila.test.ts` e `pausa-de-sessao.test.ts` reprovam), `02b-sonda-fila-antiga.txt` (com a fila antiga de volta, 13 reprovam), `02c-sonda-tela-antiga.txt` (com a tela antiga de volta, 7 dos 9 casos da tela reprovam) e `04-api-completa-depois.txt`.
- **Etapa e data:** V2-F00-E06, 2026-10-06.

### API e painel: papel diferente do token deixa de ser `sessao_encerrada` (três testes)

- **Testes:** `apps/api/test/codigos-de-erro.test.ts`, "papel diferente do token também é sessao_encerrada, e NÃO conta desativada"; `apps/api/test/vigencia-na-escrita.test.ts`, "papel rebaixado escreve como o papel NOVO, não como o do token"; `apps/web/test/sessao-e-entrada.test.ts`, "papel mudado (401 sessao_encerrada) com a renovação viva renova e repete".
- **Antes:** afirmavam que o papel gravado diferente do papel do token responde 401 `sessao_encerrada` ("entre de novo"). Foi a escolha da E05, que ainda não tinha a renovação trazendo o papel novo como parte do desenho.
- **Decisão que o torna velho:** a V2-F00-E07. A sessão está de pé e o token é legítimo: o que mudou foi o cadastro. A resposta correta é 401 `nao_autenticado` ("renove e repita"), porque a renovação lê o papel do banco e devolve o token com o papel novo, sem a pessoa (nem a fila do campo) perder nada. `sessao_encerrada` fica para o que "entrar de novo" resolve.
- **Depois:** os dois da API esperam `nao_autenticado` (mesmo status 401, a mesma mensagem do catálogo); o do painel passa a simular `nao_autenticado` e a conferir que a renovação avisa a tela do papel novo (`aoRenovar`). Nenhuma asserção foi enfraquecida: o status 401 e a recusa da escrita com o papel velho continuam conferidos, e a sessão encerrada de verdade segue como `sessao_encerrada`, agora provada também para o token anterior à renovação (`familia-da-sessao.test.ts`, 20 casos).
- **O que sobrou de `senha-provisoria.test.ts:183`:** nada para reescrever. O caso ("uma sessão viva cuja senha provisória venceu no meio não escreve nem renova") ficou verde sozinho na E04, porque a rota passou a recusar a escrita pela vigência. Na E07 ele continua como está e ganhou o par que faltava: `trocarSenha` recusa por conta própria quando o prazo passou (teste pelo serviço em `familia-da-sessao.test.ts`, vermelho antes do conserto), sem depender de a rota ter conferido.
- **Evidência:** `docs/evidencias-v2/G00/V2-F00-E07/saidas/` (sonda antes do conserto: 11 dos 20 casos novos da API reprovam).
- **Etapa e data:** V2-F00-E07, 2026-10-06.

### API: a frase de "link que não vale mais" ganha acento (uma asserção)

- **Teste:** `apps/api/test/recuperacao.test.ts`, "token inventado é recusado, e a mensagem não confirma nada".
- **Antes:** esperava que a mensagem do 401 de `POST /auth/redefinir` contivesse `nao vale mais`, a frase escrita sem acento ("Este link de redefinicao nao vale mais. Peca um novo.").
- **Decisão que o torna velho:** a V2-F00-E10. Essa frase aparece na tela de quem esqueceu a senha, e texto sem acento na interface reprova o portão visual (`19-definicao-de-pronto.md`, seção 0). As três mensagens de `/auth/recuperar`, `/auth/redefinir` e da recuperação desligada passaram a sair com acento, na linha das três que a E09 já tinha corrigido em `/auth/trocar-senha`.
- **Depois:** espera `não vale mais`. Nenhuma asserção foi enfraquecida: o status 401 e a regra de "não confirmar nada" continuam conferidos, e o caso novo `recuperacao-sem-oraculo.test.ts` confere a frase inteira ("Este link de redefinição não vale mais. Peça um novo.") e que vencido e inventado devolvem o MESMO corpo.
- **Evidência:** `docs/evidencias-v2/G00/V2-F00-E10/saidas/02-sonda-antes-do-conserto-api.txt` (a frase acentuada reprova com o código velho).
- **Etapa e data:** V2-F00-E10, 2026-10-06.

### Painel, e2e contra a API: a seção 15 conta só a tabela da trilha (uma verificação)

- **Teste:** `dc360/apps/web/test/fluxo-api.e2e.mjs`, seção 15, "filtrar por autor funciona" (e, pelo mesmo seletor, "a trilha do municipio aparece" e "cada evento diz quem agiu").
- **Antes:** contava `.tabela tbody tr` na página inteira de Prestação de contas e exigia que toda linha, depois de filtrar por "helena", trouxesse "Helena". Esperava a resposta do filtro com um `waitForTimeout(1500)`.
- **Decisão que o torna velho:** a tela ganhou mais duas tabelas `.tabela` acima e abaixo da trilha, os cartões "Quem exportou o quê" e "Quem consultou dado de cidadão" (`apps/web/src/paginas/Auditoria.tsx`, `CartaoDeExportacoes` e `CartaoDeConsultas`, com legenda própria cada um). O filtro por autor é só da trilha, e a linha de consulta de outra pessoa entrava na conta. Ninguém viu porque a suíte morria na seção 13 desde então. O teste irmão que afirma o filtro é o da rota (`apps/api/test/prestacao-de-contas.test.ts`, `GET /trilha?autor=helena`), e a tela filtra certo: na mesma execução, a tabela da trilha sai só com linhas de Helena.
- **Depois:** acha a tabela pela legenda ("Eventos da trilha") e conta só as linhas dela; espera o total do título "Trilha de auditoria (N)" mudar, em vez de 1500 ms. Nenhuma asserção foi enfraquecida: as mesmas três verificações, com o mesmo critério (toda linha da trilha filtrada traz "Helena" e há ao menos uma).
- **Evidência:** `docs/evidencias-v2/G00/V2-F00-E18/saidas/02-e2e-api-chromium-depois-do-cors.txt` (com o CORS consertado e o seletor antigo: "FALHA filtrar por autor funciona (26 linhas)") e as execuções finais `03` e `04` (verde nos dois motores).
- **Etapa e data:** V2-F00-E18, 2026-10-07.

### Painel, e2e contra a API no Firefox: miniatura preguiçosa e os abortos de propósito no console

- **Teste:** `dc360/apps/web/test/fluxo-api.e2e.mjs`, seção 13, "a imagem carrega pela URL assinada", e a lista `ESPERADOS` do portão "zero erro de console".
- **Antes:** conferia `img.complete && img.naturalWidth > 0` no instante em que a galeria aparecia; e a lista `ESPERADOS` só conhecia a forma do Firefox para o aborto da seção 28 (`/saida/pacote.zip`).
- **Decisão que o torna velho:** a miniatura da galeria é `loading="lazy"` de propósito (`apps/web/src/paginas/Ocorrencia.tsx`), e o Firefox só a busca quando ela chega perto da área visível; o Chromium busca de mais longe, por isso o teste nunca reprovou nele. E o Firefox registra como "Cross-Origin Request Blocked ... CORS request did not succeed" o pedido que a própria suíte aborta com `route.abort` (seções 19 e 27), e como `downloadable font: download failed ... status=2152398850` (NS_BINDING_ABORTED) a fonte cuja carga a navegação da suíte cancelou. A suíte nunca tinha rodado inteira no Gecko antes desta etapa.
- **Depois:** rola até a miniatura e espera o `load` (ou o `error`, que reprova) por até 15 s; `naturalWidth` zero continua reprovando. A lista ganhou três padrões estreitos, presos ao caminho abortado (`/ocorrencias/duplicidades/consulta?` e `/auth/recuperar.`) e ao código de aborto da fonte. Bloqueio de CORS em qualquer outro caminho e fonte ausente de verdade (outro status) continuam reprovando. Nenhuma asserção foi enfraquecida.
- **Evidência:** `docs/evidencias-v2/G00/V2-F00-E18/saidas/11-e2e-api-firefox-rodada-1-miniatura-lazy.txt` (a miniatura e os dois abortos), `12-e2e-api-firefox-rodada-2-console-dos-abortos.txt` (271 de 271, só o console) e `04-e2e-api-firefox-final.txt` (verde).
- **Etapa e data:** V2-F00-E18, 2026-10-07.
