# Guia de validação humana da F00 (antes de aprovar o G00)

- **Para quem:** Rafael, executando sozinho, passo a passo.
- **Escrito em:** 2026-10-07, a partir de `docs/roadmap-v2/STATUS.md` (seções 8 e 11), dos `RESUMO.md` de cada etapa em `docs/evidencias-v2/G00/` e do campo "Validação humana" de cada etapa em `docs/roadmap-v2/03-fase-00-estabilizacao.md`.
- **Regra deste guia:** comando, porta, usuário, rótulo de botão e frase foram copiados do repositório. O que não foi possível confirmar no código ou na evidência está marcado "(conferir)".

## Para que serve

Todas as etapas da F00, menos a E19, estão implementadas e medidas, mas ficaram EM ANDAMENTO porque cada uma pede algo que só você faz: ver uma tela, ver um teste reprovar, ler e aprovar uma frase, decidir uma regra, ou pedir a uma segunda pessoa que repita um roteiro. Este guia junta tudo isso na ordem que menos troca de ambiente.

## Quanto tempo leva (estimativa honesta)

| Bloco | Tempo |
| --- | --- |
| Preparação (instalar, subir API, painel e app) | 45 min a 1 h 30 (o app no celular é o que mais varia) |
| A) Painel web | 2 h 30 |
| B) App de campo | 2 h |
| C) Terminal | 1 h 30 (boa parte é espera de teste) |
| D) Segunda pessoa e CI | 3 h da outra pessoa (E01 cerca de 1 h 30, E25 cerca de 1 h 30) e 15 min seus |
| E) Leitura e decisão | 1 h 30 |
| **Total seu** | **cerca de 9 a 10 horas, em dois ou três dias** |

## O que ter em mãos

1. Esta máquina (Windows 11, Git Bash e PowerShell) com Node 22 (`dc360/.nvmrc` diz `22`) e npm 10.
2. Um celular na mesma rede Wi-Fi do PC, com o Expo Go instalado. O `apps/campo/LEIA-ME.md` fala em iPhone (relato de 2026-09-08) e em emulador; simulador de iOS só existe em Mac. A E16 pede iPhone, e Android real quando houver.
3. PostgreSQL instalado só para a E25 (o roteiro usa `C:/Program Files/PostgreSQL/18/bin`; a produção é 17).
4. Uma segunda pessoa (ou outra máquina limpa) para a E01 e a E25.
5. Acesso ao GitHub do repositório `rafaelgomesbr/city-hall` (privado) para ver o run do workflow `Verificar`.
6. Alyson, para a E24 (premissa D-25).

## Onde registrar cada resultado

Na `docs/roadmap-v2/STATUS.md`, seção 8, linha da etapa (V2-F00-Enn), coluna Observação. Sugestão de texto: `Validação humana em AAAA-MM-DD: aprovada` ou `Validação humana em AAAA-MM-DD: reprovada, <o que viu>`. Foto ou captura que você tirar vai para a pasta da etapa, por exemplo `docs/evidencias-v2/G00/V2-F00-E16/` (a E16 pede isso explicitamente). Os itens do G00 só se marcam no próprio gate, no `GATE.md`. Commit só com a sua autorização.

---

## Preparação, uma vez só

Todos os comandos abaixo são de Git Bash, a partir de `C:/Projetos/city-hall/dc360`. No PowerShell, variável de ambiente se escreve `$env:NOME="valor"; comando`.

### 1. Conferir o ponto de partida

```bash
cd /c/Projetos/city-hall
git status            # esperado: ".claude/handoffs/", este guia e a linha do STATUS que aponta para ele, se ainda não commitados
git log --oneline -1  # esperado: 99390e0 V2-F00-E11 a E25 ...
```

As sondas do bloco C mexem num arquivo por vez e o restauram com `git restore`. Por isso a árvore precisa estar limpa antes.

### 2. Instalar e compilar o pacote comum

Nesta máquina as dependências já estão instaladas. NÃO rode `npm ci` aqui: ele apaga e reinstala o `node_modules`, e é o estado atual dele que as etapas mediram. O `npm ci` só entra na máquina limpa da E01 (D1).

```bash
cd /c/Projetos/city-hall/dc360
npm run build:shared
npx playwright install chromium firefox   # só se os navegadores do Playwright ainda não estiverem instalados
```

`npm run build:shared` é obrigatório antes de rodar teste da API ou do app: os dois leem o `dist` do pacote comum (achado da E05 e da E06).

### 3. Subir a API local (terminal 1)

```bash
JWT_SEGREDO="pelo-menos-trinta-e-dois-bytes-aqui" npm run dev:api
```

- Endereço: `http://127.0.0.1:3333` (padrão de `PORT` e `HOST` em `apps/api/src/config.ts`).
- Sem `DATABASE_URL` a API sobe um Postgres em WebAssembly, efêmero, já semeado com Serra Alta e Vale Fundo. Não precisa de Postgres instalado para os blocos A, B e C.
- `npm run dev:api` usa `tsx watch`: qualquer arquivo salvo em `apps/api/src` reinicia o processo e o banco nasce de novo. Durante as sondas do bloco C, desligue a API.

### 4. Subir o painel ligado à API (terminal 2)

```bash
VITE_API_URL=http://127.0.0.1:3333 npm run dev
```

- Endereço: `http://localhost:5173` (porta de `apps/web/vite.config.ts`).
- O padrão de `ORIGENS_PERMITIDAS` e de `URL_PAINEL` na API já é `http://localhost:5173`, então não precisa configurar CORS.
- Para a largura de celular (390 px), use o modo responsivo das ferramentas do navegador (F12) com largura 390.

### 5. App de campo no celular (terminal 3, só para o bloco B)

O celular não alcança `127.0.0.1` do PC. Para o bloco B, suba a API escutando na rede e dizendo ao app o endereço do PC:

```bash
ipconfig    # no PowerShell ou no Git Bash; anote o IPv4 da placa Wi-Fi, por exemplo 192.168.0.10

# terminal 1, no lugar do passo 3:
HOST=0.0.0.0 URL_PUBLICA=http://<IP-do-PC>:3333 JWT_SEGREDO="pelo-menos-trinta-e-dois-bytes-aqui" npm run dev:api

# terminal 3:
cd apps/campo
DC360_API_URL=http://<IP-do-PC>:3333 npx expo start
```

- `HOST`, `URL_PUBLICA` e `DC360_API_URL` existem em `apps/api/src/config.ts` e `apps/campo/app.config.ts`. `URL_PUBLICA` importa porque o endereço de envio de foto sai dela; com o padrão `127.0.0.1` a foto do celular iria para porta morta (comentário de `scripts/e2e-api.mjs`).
- Leia o QR do terminal com o Expo Go (é o caminho do `LEIA-ME`: "aparelho na mesma rede, com o Expo Go").
- O Windows deve perguntar se libera o Node na rede privada: libere.
- Esta combinação (API em `0.0.0.0` mais Expo Go num aparelho físico a partir do Windows) não tem rodada registrada no repositório (conferir). Se o Expo Go recusar a versão do SDK 57, o caminho é um build instalável (`eas build --profile desenvolvimento --platform android`, do `LEIA-ME`); num build de iOS por cabo, a folga de rede local é `DC360_DEV_LOCAL=1` (`app.config.ts`).
- Num emulador Android o PC costuma ser `10.0.2.2` em vez do IPv4 (conferir: não está no repositório).

### 6. Voltar ao estado da semente

- API: Ctrl+C no terminal 1 e suba de novo. O banco efêmero nasce semeado (README, "Como rodar").
- Painel: clique em "Sair" antes de reiniciar a API, ou limpe os dados do site `localhost:5173` nas ferramentas do navegador. Uma sessão do banco anterior não existe no banco novo.
- App: depois de reiniciar a API, o app mostra a faixa "Sua sessão terminou"; toque em "Entrar de novo". Coletas e rascunhos do aparelho ficam.

### 7. Usuários da semente

Semente sintética de `dc360/db/seeds/desenvolvimento.sql`. A senha de todas as contas é `defesa-civil-2026` (definida no cabeçalho desse arquivo e no `README.md`, "Como rodar"; só existe no banco efêmero de desenvolvimento).

| Nome | Email | Papel | Município | Equipe |
| --- | --- | --- | --- | --- |
| Helena Vasques Coutinho | `helena.coutinho@serraalta.exemplo.gov.br` | coordenador | Serra Alta | |
| Jonas Ferreira | `jonas.ferreira@serraalta.exemplo.gov.br` | operador | Serra Alta | |
| Diego Nakamura Alves | `diego.alves@serraalta.exemplo.gov.br` | agente_campo | Serra Alta | Equipe Alfa |
| Rita Sampaio Lopes | `rita.lopes@serraalta.exemplo.gov.br` | administrador | Serra Alta | |
| Aurélio Prates Machado | `aurelio.machado@valefundo.exemplo.gov.br` | coordenador | Vale Fundo | |
| Simone Vieira da Paz | `simone.paz@valefundo.exemplo.gov.br` | operador | Vale Fundo | |
| Tarcísio Bueno Ramos | `tarcisio.ramos@valefundo.exemplo.gov.br` | agente_campo | Vale Fundo | Equipe Única |

Para entrar no painel: `http://localhost:5173/entrar`, campos "Email funcional" e "Senha", botão "Entrar". Tela inicial por papel (`telaInicial` em `apps/web/src/paginas/entrar-regras.ts`): o agente cai em "Meu trabalho" (`/meu-trabalho`), os outros em "Painel operacional" (`/painel`). Só a administradora (Rita) tem o menu "Organização", onde fica o pacote de saída.

---

## A) Painel web

Pré-condição comum: passos 3 e 4 da preparação, API recém-subida.

### A1. V2-F00-E13: entrar a partir do domínio

- **Onde:** web, 1280 px e 390 px.
- **Pré-condição:** nenhuma sessão aberta no navegador.
1. Digite só `http://localhost:5173` na barra de endereço (sem caminho).
2. Entre como Helena.
3. Clique em "Sair" (barra lateral). Digite de novo só `http://localhost:5173` e entre como Diego.
4. Repita os passos 1 a 3 com a janela em 390 px.
- **O que deve ver:** Helena chega em "Painel operacional"; Diego chega em "Meu trabalho". Em momento nenhum aparece "Esta página não existe". Diego NÃO cai na última tela que a Helena tinha aberto (defeito achado e corrigido na E13).
- **Reprova se:** aparecer "Esta página não existe", ou a segunda pessoa cair na tela da primeira.
- **Registrar:** linha V2-F00-E13.

### A2. V2-F00-E13: as seis frases de confirmação

- **Onde:** web, 1280 px e 390 px, tema claro e escuro.
- **Pré-condição:** entrar como Rita.
1. Em "Usuários", cadastre um usuário (botão "Cadastrar usuário"); depois "Corrigir" nele e "Salvar correção".
2. Em "Equipes", "Cadastrar equipe"; depois corrija e "Salvar alterações".
3. Em "Órgãos de destino", "Cadastrar órgão"; depois corrija e "Salvar alterações".
- **O que deve ver (aviso passageiro, texto exato do código):**
  - "Usuário cadastrado. Ele já aparece na lista abaixo."
  - "Cadastro corrigido. A lista abaixo já mostra o que mudou."
  - "Equipe criada. Ela já aparece na lista abaixo."
  - "Equipe corrigida. A lista abaixo já mostra o que mudou."
  - "Órgão cadastrado. Ele já aparece na lista abaixo."
  - "Órgão corrigido. A lista abaixo já mostra o que mudou."
  - Em 390 px o aviso aparece ACIMA da barra de navegação de baixo, com fundo opaco (a E13 corrigiu o aviso desenhado em cima da barra).
- **Reprova se:** frase diferente, aviso sobre a barra, texto da página atravessando o aviso no tema escuro.
- **Registrar:** linha V2-F00-E13 (junto com A1). A aprovação do texto está também em "Decisões que só você toma".

### A3. V2-F00-E09: redefinir senha, senha temporária e encerrar sessões

- **Onde:** web, dois navegadores (ou uma janela normal e uma anônima).
- **Pré-condição:** navegador 1 com Helena; navegador 2 sem sessão.
1. Navegador 1, "Usuários", linha do Jonas Ferreira: botão "Redefinir senha".
2. A janela "Redefinir senha" diz: "A senha atual de Jonas Ferreira deixa de valer agora e as sessões abertas caem. O sistema sorteia uma senha temporária, mostrada uma única vez, que vale por 72 horas e precisa ser trocada na primeira entrada." Confirme em "Redefinir a senha de Jonas Ferreira".
3. A janela "Senha temporária" mostra "Anote agora. Esta senha não aparece de novo: o sistema não guarda o texto dela. Se fechar esta janela sem anotar, redefina a senha outra vez." Clique fora da janela: ela NÃO fecha. Use "Copiar senha" (deve aparecer "Senha copiada.") e feche com "Já anotei a senha".
4. Navegador 2: entre como Jonas com a senha temporária. Deve abrir "Defina a sua senha", com "Senha provisória que você recebeu", "Senha nova", "Repita a senha nova" e o botão "Definir senha e entrar". Defina uma senha de 12 caracteres ou mais e entre.
5. Navegador 1, linha do Jonas: "Encerrar sessões". A janela diz quantas sessões ele tem abertas e "Jonas Ferreira sai de todos os navegadores e aparelhos agora e precisa entrar de novo com a própria senha, que não muda. Quem está em campo fica sem sincronizar até entrar outra vez." Confirme em "Encerrar sessões de Jonas Ferreira".
6. O aviso passageiro diz "Sessões de Jonas Ferreira encerradas. 1 sessão caiu." (ou "N sessões caíram").
7. Navegador 2: faça qualquer gravação como Jonas (por exemplo, registrar uma ocorrência). Deve cair na entrada com "Sua sessão foi encerrada." (frase completa em A5).
8. "Encerrar minhas outras sessões": entre como Helena nos dois navegadores. No navegador 1, "Minha conta", cartão "Minhas sessões": a sessão atual tem o selo "Esta sessão". Clique em "Encerrar minhas outras sessões"; a janela diz "Esta sessão continua aberta, e a senha não muda."; o botão de confirmar diz "Encerrar a outra sessão". No navegador 2, a próxima gravação leva à entrada com "Sua sessão foi encerrada."; o navegador 1 continua aberto.
- **Reprova se:** a janela da senha fechar por clique fora, a senha antiga continuar valendo, a sessão encerrada continuar gravando, ou a sessão do navegador 1 cair no passo 8.
- **Registrar:** linha V2-F00-E09.

### A4. V2-F00-E05: as três frases da tela de entrada

- **Onde:** web, 1280 px e 390 px.
- **Pré-condição:** A3 feito (a frase de sessão encerrada já apareceu lá).
1. Sessão encerrada: já vista em A3, passos 7 e 8.
2. Conta desativada: navegador 2 com Jonas; navegador 1 com Helena em "Usuários", linha do Jonas, "Desativar". A janela "Desativar usuário" diz "A pessoa perde o acesso agora: as sessões dela caem e o aplicativo de campo para de sincronizar. O nome continua nos laudos que ela assinou e na trilha de auditoria, e reativar devolve o acesso." Confirme em "Desativar Jonas Ferreira". No navegador 2, faça uma gravação.
3. Sessão expirada: não há passo simples para provocar à mão. Veja as capturas `docs/evidencias-v2/G00/V2-F00-E05/capturas/entrada-expirou-*.png`.
4. Reative o Jonas ("Reativar", sem pergunta).
- **O que deve ver (texto exato de `apps/web/src/paginas/Entrar.tsx`):**
  - "Sua sessão expirou. Entre de novo para continuar de onde estava. Nada do que já tinha sido gravado se perdeu."
  - "Sua sessão foi encerrada. Entre de novo para continuar de onde estava. Isso acontece quando o acesso é encerrado em outro aparelho, por quem administra o sistema, ou quando o seu cadastro muda. Nada do que já tinha sido gravado se perdeu."
  - "Sua conta foi desativada. Entrar de novo não resolve: procure a coordenação do seu município. Nada do que você já registrou se perdeu." (tom de perigo, com ícone)
  - Tentar entrar com a conta desativada dá recusa genérica, sem dizer que a conta existe.
- **Reprova se:** frase trocada (por exemplo "expirou" no lugar de "desativada"), texto cortado em 390 px.
- **Registrar:** linha V2-F00-E05. A aprovação do texto está em "Decisões".

### A5. V2-F00-E10: recuperação de senha com o notificador de arquivo

- **Onde:** web e terminal.
- **Pré-condição:** pare a API do passo 3 e suba assim (o arquivo é acrescentado, a pasta precisa existir):

```bash
mkdir -p /c/dc360-teste
NOTIFICADOR_ARQUIVO=C:/dc360-teste/notificacoes.txt JWT_SEGREDO="pelo-menos-trinta-e-dois-bytes-aqui" npm run dev:api
```

1. Saia do painel. Na entrada, clique em "Esqueceu a senha?".
2. A tela "Redefinir senha" mostra o campo "Email funcional" e o botão "Enviar link de redefinição". Peça para `tarcisio.ramos@valefundo.exemplo.gov.br` (o exemplo de `dc360/docs/LIGAR-O-EMAIL.md`).
3. Deve aparecer: "Se existir conta com esse email, enviamos um link de redefinição. Confira sua caixa de entrada."
4. Peça de novo ("Pedir de novo") para um email que não existe, por exemplo `ninguem@valefundo.exemplo.gov.br`: a frase tem de ser a MESMA.
5. `cat /c/dc360-teste/notificacoes.txt`: copie a linha `.../redefinir-senha?token=...` e abra no navegador. O token some da barra de endereço logo que a tela carrega.
6. Tela "Nova senha": "Nova senha", "Repita a nova senha", botão "Definir nova senha". Teste senha curta (deve marcar "A senha precisa de pelo menos 12 caracteres.") e senhas diferentes ("As duas senhas precisam ser iguais."). Depois defina uma válida: "Senha redefinida. Entre com a nova senha." e o botão "Ir para a entrada".
7. Abra o MESMO link outra vez: "Este link de redefinição não vale mais. Ele pode ter vencido, já ter sido usado ou ter sido trocado por um pedido mais novo. Peça um novo link."
8. Produção desligada:

```bash
grep -n "RECUPERACAO_ATIVA" fly.toml                         # esperado: RECUPERACAO_ATIVA = "nao"
grep -n "EMAIL_ATIVO" fly.toml                               # esperado: nada (padrão "nao" em config.ts)
npx vitest run --root apps/api test/recuperacao-em-producao.test.ts   # esperado: todos verdes
```

- **Reprova se:** a frase do passo 4 for diferente da do passo 3, o link usado funcionar de novo, o token ficar na barra, ou `fly.toml` disser `"sim"`.
- **Registrar:** linha V2-F00-E10. O envio real de email continua no CP-19 (aberto).

### A6. V2-F00-E11: baixar o pacote de saída e abrir o ZIP

- **Onde:** web (Chromium e Firefox).
- **Pré-condição:** entrar como Rita.
1. Menu "Organização", cartão "Saída de município", botão "Baixar pacote de saída" (enquanto gera, o botão diz "Gerando").
2. Repita no Firefox.
3. Abra o ZIP no Explorador do Windows.
- **O que deve ver:** o download termina sem erro; dentro do ZIP há `INDICE.csv`, `INDICE.html`, `LEIA-ME.txt`, `PENDENCIAS-DA-EXTRACAO.txt`, `SOMAS-SHA256.txt`, a pasta `documentos/` (por exemplo `documentos/000473-2026/laudo-de-vistoria.html`) e a pasta `esquema/` com as migrações (lista de referência em `docs/evidencias-v2/G00/V2-F00-E11/pacote/lista-de-nomes-do-zip-chromium.txt`). Nenhum dado de Vale Fundo.
- **Reprova se:** 404, arquivo vazio ou ZIP que não abre.
- **Registrar:** linha V2-F00-E11.

### A7. V2-F00-E12: o laudo do pacote traz o mesmo aviso de equipe divergente

Duas formas. A primeira é a recomendada (tudo confirmado no código); a segunda deixa você ver as duas folhas com os próprios olhos.

**Forma 1, pelo e2e:**

```bash
EVIDENCIA_E12=C:/dc360-teste/e12 npm run test:e2e:api
cat /c/dc360-teste/e12/trecho-do-aviso-chromium.txt
```

- **O que deve ver:** o bloco "== 29. O laudo do pacote avisa a equipe divergente (V2-F00-E12) ==" com todas as linhas `OK`, e no arquivo os dois trechos iguais e a linha `Identicos: sim`.

**Forma 2, à mão** (o passo 3 é HTTP direto porque o app não oferece ao agente da Alfa uma tarefa da Bravo; esse pedido não foi executado neste formato: conferir):

1. Como Helena, abra a ocorrência de protocolo 000472/2026 (alagamento, em triagem). Registre a triagem (botão "Registrar triagem") e despache para a Equipe Bravo (cartão "Despachar equipe", botão "Despachar").
2. No Git Bash, entre como Diego e envie a coleta (corpo copiado da seção 29 de `apps/web/test/fluxo-api.e2e.mjs`):

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:3333/auth/entrar -H "content-type: application/json" \
  -d '{"email":"diego.alves@serraalta.exemplo.gov.br","senha":"defesa-civil-2026"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).acesso')
AGORA=$(node -pe 'new Date().toISOString()')
curl -s -X POST http://127.0.0.1:3333/sincronizacao/vistoria \
  -H "content-type: application/json" -H "authorization: Bearer $TOKEN" \
  -d '{"idempotencyKey":"'"$(node -pe 'crypto.randomUUID()')"'","ocorrenciaId":"11111111-1111-4111-8111-0000000000c2","coletadaEm":"'"$AGORA"'","vistoria":{"checklist":[{"chave":"risco_iminente","resposta":true},{"chave":"evacuacao_necessaria","resposta":true},{"chave":"interdicao_indicada","resposta":true},{"chave":"acionar_outro_orgao","resposta":false}],"fotos":[],"gpsPrecisaoMetros":6.2,"assinanteNome":"Cleuza Ramos de Andrade","assinaturaChave":null,"coletadaEm":"'"$AGORA"'","observacoes":"Trinca ativa no talude."}}'
```

   Esperado: resposta com `"foraDaEquipeDesignada":true`.
3. Na ficha da ocorrência, botão "Laudo de vistoria".
4. Como Rita, "Organização", "Baixar pacote de saída", e abra `documentos/000472-2026/laudo-de-vistoria.html` do ZIP.

- **O que deve ver (nas duas folhas, palavra por palavra):** "Atenção: esta ocorrência estava designada à Equipe Bravo e a vistoria foi coletada por agente lotado na Equipe Alfa. O sistema registrou a coleta e manteve a tarefa com a equipe designada. A divergência precisa ser conferida pela coordenação antes de o ato ser praticado."
- **Reprova se:** o laudo do pacote sair sem o aviso, ou com texto diferente do laudo da rota.
- **Observação:** no laudo do pacote a coordenada ainda sai "não registrada" (achado da E12, decisão sua em "Decisões").
- **Registrar:** linha V2-F00-E12.

---

## B) App de campo (celular)

Pré-condição comum: passo 5 da preparação; app aberto no celular; entrar como Diego (Equipe Alfa; a tarefa 000471/2026 está em campo para a Alfa). Painel aberto no PC como Helena. O roteiro do aparelho é o do `dc360/apps/campo/LEIA-ME.md`, "O que conferir no aparelho, nesta ordem"; os itens abaixo são os passos 7, 8 e 9 dele, mais a leitura da E14. Tire foto da tela em cada "o que deve ver".

### B1. V2-F00-E06: conta desativada e sessão encerrada param a fila sem perder a coleta

- **Onde:** mobile (iPhone; Android quando houver).
1. Coloque o celular em modo avião. Conclua uma vistoria da 000471/2026 (checklist, foto, assinatura, "Concluir vistoria"). Ela entra na fila.
2. No painel, como Helena, "Usuários", linha do Diego, "Desativar" e confirme em "Desativar Diego Nakamura Alves".
3. Tire o modo avião, com o app aberto.
4. Veja a faixa do topo e a tela de envio.
5. No painel, "Reativar" o Diego. No app, entre de novo (pelo botão que o app oferecer nesse estado: conferir qual) e espere a fila.
6. Repita com "Encerrar sessões" no lugar de "Desativar" (sessão encerrada).
- **O que deve ver (texto de `apps/campo/src/dados/pausa-da-fila.ts`):**
  - Conta desativada: faixa "Conta desativada", "Suas coletas continuam guardadas neste aparelho, procure a coordenação"; tela "Sua conta foi desativada e o envio está parado"; cartão da coleta "Guardada neste aparelho. Só sobe depois que a coordenação reativar a sua conta e você entrar."
  - Sessão encerrada: faixa "Sessão encerrada", "Entre de novo: suas coletas continuam guardadas"; tela "Sua sessão terminou e o envio está parado"; cartão "Guardada neste aparelho. Sobe sozinha depois que você entrar de novo."
  - Em nenhum dos dois casos aparece o botão "Descartar". Depois de entrar de novo, a MESMA coleta sobe uma vez só (no painel, a 000471/2026 tem uma vistoria nova, não duas).
  - Em 390 de largura (celular comum) a frase da conta desativada quebra em mais de uma linha sem cortar (pedido da evidência da E06).
- **Reprova se:** a coleta virar "bloqueada", aparecer "Descartar", sumir, ou subir duas vezes.
- **Registrar:** linha V2-F00-E06. A aprovação das frases está em "Decisões".

### B2. V2-F00-E14: as frases finais da sessão encerrada

- **Onde:** mobile.
1. Com Diego logado, no painel "Encerrar sessões" do Diego.
2. No app, toque no ícone de informação ao lado de "Sua sessão terminou" (na lista ou no Perfil).
- **O que deve ver (texto de `apps/campo/src/dados/falha-de-atualizacao.ts`):** resumo "Sua sessão terminou"; detalhe "O servidor não reconhece mais a sua entrada neste aparelho, então nenhuma tarefa nova desce até você entrar outra vez. Toque em "Entrar de novo" e entre com o seu email e a sua senha. Nada é apagado: a vistoria começada, as fotos e o que você já coletou continuam neste aparelho e voltam para você assim que entrar com a sua conta." O botão é "Entrar de novo". A frase NÃO manda "Sair da conta".
- **Reprova se:** a frase mandar sair da conta, ou o "Entrar de novo" apagar a vistoria começada.
- **Registrar:** linha V2-F00-E14.

### B3. V2-F00-E15: sair da conta avisa o que apaga; GPS abaixo de meio metro

- **Onde:** mobile.
1. Comece uma vistoria (marque o checklist, tire uma foto, colha a assinatura) SEM concluir.
2. Perfil, "Sair da conta". Leia o diálogo e toque em "Continuar conectado". Abra a vistoria: nada se perdeu.
3. GPS: com localização simulada abaixo de 0,5 m, toque em "Capturar localização" e conclua a vistoria. Num iPhone físico não há como forçar essa precisão (conferir); use emulador Android com localização simulada ou um app de localização falsa (conferir).
- **O que deve ver:**
  - Diálogo (texto de `apps/campo/src/dados/aviso-da-saida.ts`): "Você tem 1 vistoria começada neste aparelho, com fotos e assinatura, que ainda não foi concluída. Sair apaga essa vistoria e tudo o que já foi preenchido nela, inclusive as fotos e a assinatura, sem volta. Para não perder, conclua antes de sair." O botão de confirmar é o de perigo; "Continuar conectado" não apaga nada.
  - GPS: a tela diz "Precisão de 1 metro" (singular) e a conclusão sobe sem erro 422.
- **Reprova se:** o diálogo não citar a vistoria começada, "Continuar conectado" apagar algo, aparecer "0 metros" ou "1 metros", ou a conclusão voltar com 422.
- **Registrar:** linha V2-F00-E15.

### B4. V2-F00-E16: permissão negada, teclado e área segura

- **Onde:** mobile, iPhone (e Android real quando houver).
1. Nos Ajustes do celular, negue a câmera ao app (no Expo Go a permissão é do Expo Go: conferir). Na vistoria, toque em "Tirar foto".
2. A tarja traz "Abrir os ajustes do aparelho" e, abaixo, "Fechar". Toque em "Abrir os ajustes do aparelho": abre os Ajustes. Repita negando a localização ("Capturar localização").
3. Digite o nome de quem assina com o teclado aberto e toque em "Tirar foto": o PRIMEIRO toque abre a câmera, e o campo digitado não fica embaixo do teclado.
4. Na câmera: o obturador e "Voltar sem fotografar" ficam acima da barra do sistema.
5. Conclua: o aviso "Ela sobe com o aplicativo aberto" diz "Nada depende de sinal agora. A coleta está guardada neste aparelho e sobe quando o aplicativo estiver aberto e houver rede: se agora não há sinal, ela sobe quando você abrir o aplicativo com sinal. A fila de envio mostra o andamento."
- **Reprova se:** a tarja não tiver o botão, o primeiro toque só fechar o teclado, o obturador ficar sob a barra, ou a frase prometer envio com o app fechado.
- **Registrar:** linha V2-F00-E16, com a foto do aparelho na pasta da etapa.

---

## C) Terminal e banco

Pré-condição comum: API do passo 3 DESLIGADA (o `tsx watch` reiniciaria a cada arquivo salvo), `git status` limpo, `npm run build:shared` feito. Todas a partir de `C:/Projetos/city-hall/dc360`. Depois de cada sonda: `git restore <arquivo>` e `git status` de novo, que tem de voltar limpo.

### C1. V2-F00-E04: a vigência na escrita, antes e depois

1. Depois (código atual):

```bash
npx vitest run --root apps/api test/vigencia-na-escrita.test.ts
```

   Esperado: 13 de 13 verdes.
2. Antes: em `apps/api/src/servidor.ts`, ponha `//` no começo da linha 482 (`exigirVigencia(vigencia, conteudo, statusDaSuspensao);`) e rode o mesmo comando. Esperado: parte dos 13 reprova com 200 onde se espera 401 ou 403. Na evidência da etapa foram 6 de 13, com a variante de então (as duas linhas apagadas); a contagem exata com esta variante não foi medida (conferir).
3. `git restore apps/api/src/servidor.ts` e rode de novo: 13 de 13.
- **Referência:** `docs/evidencias-v2/G00/V2-F00-E04/saidas/02-sonda-antes-do-conserto.txt`.
- **Reprova se:** o passo 1 ou o 3 tiver falha, ou o passo 2 passar inteiro.
- **Registrar:** linha V2-F00-E04.

### C2. V2-F00-E07: as três sondas (sessão rotacionada, papel, senha provisória)

1. `npx vitest run --root apps/api test/familia-da-sessao.test.ts`: esperado 20 de 20.
2. Antes: em `apps/api/src/auth/vigencia.ts`, troque as linhas 92 a 97 (de `OR (s.motivo_revogacao = 'rotacionada na renovacao'` até `)))`) por `OR s.motivo_revogacao = 'rotacionada na renovacao')`. Rode o mesmo arquivo: esperado 7 de 20 reprovando (os de cadeia, com 200 onde se espera 401), medido na etapa.
3. `git restore apps/api/src/auth/vigencia.ts` e rode de novo: 20 de 20.
4. Veja as capturas `docs/evidencias-v2/G00/V2-F00-E07/capturas/papel-*.png`.
- **Reprova se:** verde incompleto nos passos 1 e 3, ou o passo 2 sem reprovação.
- **Registrar:** linha V2-F00-E07.

### C3. V2-F00-E08: o agente não lê ofício nem aviso de outra equipe

1. `npx vitest run --root apps/api test/leitura-do-agente-oficios-e-avisos.test.ts`: esperado 14 de 14.
2. Antes: em `apps/api/src/rotas/oficios.ts`, nas linhas 189 e 226, troque `autorizar(app, req, "consultar_oficio")` por `app.exigirAutenticacao(req)`. Rode o mesmo arquivo: os casos do agente em ofício reprovam. `git restore apps/api/src/rotas/oficios.ts`.
3. Sonda HTTP contra a API semeada: suba a API (passo 3 da preparação) e, noutro terminal:

```bash
node ../docs/evidencias-v2/G00/V2-F00-E08/sondas/sonda-agente-http.mjs
```

- **O que deve ver no passo 3** (igual a `saidas/04-sonda-http-depois.txt`):

```
FECHA  GET /oficios (token do agente)  -> 403 sem_permissao
FECHA  GET /oficios/:id (token do agente)  -> 403 sem_permissao
FECHA  GET /avisos: avisos de outra equipe na lista do agente  -> 0 de 2 (protocolos: nenhum)
FECHA  GET /avisos: naoLidos do agente alem da lista dele  -> naoLidos=2, lista=2, municipio=3

RESULTADO: fechado
```

- **Reprova se:** qualquer linha `VAZA` ou `RESULTADO: VAZAMENTO`. Reinicie a API depois (a sonda emite um ofício).
- **Registrar:** linha V2-F00-E08.

### C4. V2-F00-E23: o contrato painel x API reprova `/pacote.zip`

1. `cd apps/api && npx vitest run test/contrato-do-painel.test.ts`: esperado 12 de 12.
2. Em `apps/web/src/dados/http.ts`, linha 1098, troque `"/saida/pacote.zip"` por `"/pacote.zip"` e rode de novo.
3. `git restore apps/web/src/dados/http.ts` e rode de novo: 12 de 12.
- **O que deve ver no passo 2:** `Tests  1 failed | 11 passed (12)` e a linha `"POST /pacote.zip (http.ts linha 1098)"` (igual a `docs/evidencias-v2/G00/V2-F00-E23/saidas/sonda-pacote-zip-no-http-ts-vermelha.txt`).
- **Registrar:** linha V2-F00-E23.

### C5. V2-F00-E18: os três e2e e a foto subindo na seção 13

```bash
npm run test:e2e:api                 # painel contra a API, Chromium
node scripts/e2e-api.mjs firefox     # o mesmo, Firefox
```

Para o modo local, o painel tem de estar servido em `http://localhost:4173` SEM `VITE_API_URL`:

```bash
npm run build --workspace @dc360/web
(cd apps/web && npx vite preview --port 4173 --strictPort)   # deixe neste terminal
npm run test:e2e                      # noutro terminal, Chromium
MOTOR=firefox npm run test:e2e        # Firefox
```

- **O que deve ver:** contra a API, `Passou: 271   Falhou: 0`, `Zero erro de console.` e `TUDO CERTO: o caminho de produção passou de ponta a ponta.`; no bloco "== 13. Galeria de evidencia no painel ==", entre outras, `OK   os bytes sobem direto para o armazenamento`, `OK   o servidor confirma o envio` e `OK   a foto do agente aparece para o coordenador`. Modo local: `Passou: 70   Falhou: 0`. Números de referência em `docs/evidencias-v2/G00/V2-F00-E18/saidas/03-e2e-api-chromium-final.txt` e `05-e2e-local-chromium.txt`.
- **Reprova se:** qualquer falha, erro de console, ou o roteiro pendurado sem voltar ao terminal (defeito corrigido na E18).
- **Registrar:** linha V2-F00-E18.

### C6. V2-F00-E17: scripts e números na sua máquina

```bash
npm run test:scripts
npm run conferir:numeros
```

- **O que deve ver:** `test:scripts` com 206 testes, 0 falhas e 4 pulados por ambiente (número das medições da E22 e da E23); `conferir:numeros` terminando em `Afirmações conferidas: 24` e `Todos os números da documentação batem com a realidade.`
- **Reprova se:** falha em `test:scripts` ou divergência em `conferir:numeros`. A parte Linux está em D3.
- **Registrar:** linha V2-F00-E17.

### C7. V2-F00-E21: `npm run verificar` no Windows e o fim de linha

```bash
git -C .. ls-files --eol | grep "i/crlf"    # esperado: nenhuma linha
npm run verificar
```

- **O que deve ver:** `verificar` encadeia typecheck, `npm test`, `test:scripts`, `test:campo`, `auditar` e `conferir:numeros`. Hoje os quatro primeiros fecham e ele PARA em `auditar` (no Windows morre com `spawnSync npm ENOENT` antes de auditar; é da E19, bloqueada). Isso é o esperado até o CP-03.
- **Reprova se:** cair antes do `auditar`, ou o `ls-files` mostrar `i/crlf`. A parte Linux está em D3.
- **Registrar:** linha V2-F00-E21.

---

## D) Segunda pessoa, outra máquina e CI

### D1. V2-F00-E01: baseline do zero numa máquina limpa

- **Quem:** segunda pessoa, ou você noutro computador.
1. Seguir `docs/evidencias-v2/G00/V2-F00-E01/COMO-REPRODUZIR.md` do zero (com `npm ci`; não usar `--sem-instalar`).
2. Gravar a saída FORA do repositório: `node scripts/baseline.mjs --saida=../baseline-da-minha-maquina` (sem `--saida`, o roteiro grava em `docs/evidencias-v2/G00/V2-F00-E01/saidas`).
3. Abrir o `RESUMO.md` da pasta de saída: cada passo diz `confere` ou `divergente`. Os esperados já foram atualizados pelas etapas seguintes; `auditar`, `npm audit` e `expo-doctor` continuam esperados vermelhos (E19). Em Linux, `auditar` não deve morrer com ENOENT: divergência esperada e explicável.
4. Você anexa o último run do workflow `Verificar` em master: `gh run list --workflow=Verificar --branch master --limit 1` (ou pela aba Actions do GitHub). O workflow só roda depois de push, e push é decisão sua.
- **Reprova se:** divergência sem explicação escrita.
- **Registrar:** linha V2-F00-E01, com o `RESUMO.md` da outra máquina (conferido sem segredo) na pasta da etapa.

### D2. V2-F00-E25: restore do banco por outra pessoa

- **Quem:** segunda pessoa, numa máquina limpa, de preferência com PostgreSQL 17.
1. Seguir `dc360/docs/RESTORE-DO-BANCO.md` do passo 0 ao 7, sem ajuda.
2. Conferir no fim: restore com `--exit-on-error` sem erro, linhas por tabela iguais, md5 das 47 impressões de `schema_migracoes` igual, RLS ativada e forçada nas 35 tabelas de negócio, e a API contra a cópia (`/saude` 200 com `banco: ok`).
3. Anotar cada passo em que travou: é o que melhora o roteiro.
- **Reprova se:** a pessoa precisar de ajuda que o roteiro não dá, ou qualquer conferência divergir.
- **Registrar:** linha V2-F00-E25. Linux e macOS e a origem Supabase continuam não provados (o roteiro diz isso).

### D3. V2-F00-E17 e V2-F00-E21: a parte Linux

- Num Linux ou macOS (máquina da segunda pessoa, contêiner ou CI): `npm run test:scripts`, `npm run conferir:numeros` e `npm run verificar`, com a saída arquivada nas pastas das duas etapas. O CI só passará a rodar `test:scripts` na F01-E03.
- **Registrar:** linhas V2-F00-E17 e V2-F00-E21.

---

## E) Só leitura e decisão

### E1. V2-F00-E02: a política de teste vermelho

1. Ler `dc360/docs/POLITICA-DE-TESTE-VERMELHO.md`.
2. Confirmar ou trocar o prazo máximo de um skip incondicional (hoje 30 dias) e o dono padrão (hoje `rafael`). Trocar é editar `PRAZO_MAXIMO_EM_DIAS` e `DONO_PADRAO` em `dc360/scripts/portao-de-skip.mjs` e a política.
- **Registrar:** linha V2-F00-E02.

### E2. V2-F00-E03: a classificação dos vermelhos

1. Ler `docs/evidencias-v2/G00/V2-F00-E03/classificacao-dos-vermelhos.md`, seção 7 ("Decisão pedida a Rafael").
2. Responder às três perguntas (estão em "Decisões que só você toma").
- **Registrar:** linha V2-F00-E03 e a própria seção 7 ("Resposta de Rafael").

### E3. V2-F00-E20: as isenções do portão de conteúdo

1. Ler `CAMINHOS_IGNORADOS` em `dc360/packages/shared/test/regras-de-conteudo.test.ts` (linhas 107 a 131).
2. Aprovar a lista (está em "Decisões").
- **Registrar:** linha V2-F00-E20.

### E4. V2-F00-E22: a tabela antes e depois da documentação

1. Ler a tabela de `docs/evidencias-v2/G00/V2-F00-E22/RESUMO.md` (os oito itens, com arquivo e linha).
2. Confirmar que nada ficou prometido sem existir. Os textos sobre `npm audit` dizem "hoje não fecha" e mudam quando a E19 fechar.
- **Registrar:** linha V2-F00-E22.

### E5. V2-F00-E24: saída a campo e a apresentação

1. Ler `docs/evidencias-v2/CP-02/decisao.md`.
2. Ler `dc360/docs/apresentacao/2026-09-15-para-o-alyson.html` e o `.pdf` (selo "Parcial" com ressalva na segurança do agente).
3. Com o Alyson, confirmar ou reverter a premissa D-25 (está em "Decisões").
- **Registrar:** linha V2-F00-E24 e o próprio `decisao.md` (hoje diz que a confirmação não existe por escrito).

### V2-F00-E19: nada a validar ainda

A E19 (`npm audit`, `npm run auditar` e `expo-doctor`) está PENDENTE e BLOQUEADA pelo CP-03. Não há o que validar nela hoje. O G00 só fecha com ela: o item "Dependências" do gate exige `auditar` verde, `npm audit` conforme a política do CP-03 e `expo-doctor` 21 de 21, e o item "Checkpoints da fase" exige o CP-03 decidido. Depois da E19, a rodada de `auditar` da E22 e os textos "hoje não fecha" precisam ser refeitos.

---

## Decisões que só você toma

1. **CP-03, política de `npm audit` (destrava a E19 e o G00).** Bloco completo em `docs/roadmap-v2/18-checkpoints.md`.
   - Qual alternativa: A (zero em tudo, sem exceção), B (a já codificada em `scripts/auditar.mjs`: dependência de execução vulnerável reprova, desenvolvimento só avisa, exceção só nomeada com dono e prazo; é a recomendação técnica) ou C (tolerar moderadas)?
   - Qual o prazo máximo de uma exceção, e quem é o dono padrão?
   - O `decode-uri-component` (moderada, execução do app, hoje a única aceita em `ACEITAS_NO_APLICATIVO`) continua como exceção nomeada, ou tenta-se `overrides` para 0.5.0 (compatibilidade não confirmada)?
   - A correção do `fastify` (execução, alta, sem salto de versão maior, por `npm audit fix`) adianta para antes do CP-03? (proposta da seção 11 do STATUS)
   - O salto de versão maior do `vitest` (só desenvolvimento) fica como aviso?
2. **BZ-N:N.3, quando teste e código discordam (E03).** As três perguntas da seção 7 da classificação: (a) aprova a regra "decisão datada no código com teste irmão passando: vale o código e o teste se reescreve com registro; teste que descreve defeito confirmado: vale o teste e o código se conserta"? (b) os 14 defeitos do campo (V-CAM-07 a V-CAM-20) são defeitos reais? (c) as reescritas das classes B e C (E14, E17, E21) ficam aprovadas com o registro em `docs/DECISOES-DE-TESTE-DA-FASE-00.md`?
3. **Prazo e dono do skip (E02).** 30 dias e `rafael` ficam?
4. **Frases a aprovar** (texto de produto):
   - E05: as três da tela de entrada (A4) e as duas mensagens do catálogo da API: "Sua sessão foi encerrada ou o seu cadastro mudou. Entre novamente." e "Sua conta foi desativada. Procure a coordenação do seu município: o que você já registrou continua guardado."
   - E06: faixa, tela e cartão da fila pausada (B1).
   - E09: "Anote agora..." e as confirmações de redefinir e encerrar (A3).
   - E13: as seis confirmações de gravação (A2).
   - E14: o detalhe de "Sua sessão terminou" (B2).
   - E15: o diálogo de "Sair da conta" (B3).
5. **Isenções do portão de conteúdo (E20).** Seis entradas: `docs/referencia` (pasta), `relatorio` (pasta), `dc360/packages/shared/test` (pasta), e as três da E20: `docs/auditoria-v2/raw` e `docs/evidencias-v2` só para arquivo que não é `.md`, e o arquivo `docs/AUDITORIA-2026-09-30.md`. Aprova?
6. **Premissa D-25 com o Alyson (E24).** A saída a campo será implementada no app (V2-F14-E01, sem data), e até lá a documentação e a apresentação dizem "em construção". Confirma, ou reverte para retirar a promessa?
7. **Coordenada no laudo do pacote (achado da E12).** O laudo de dentro do ZIP imprime "Coordenada capturada no local: não registrada" onde o laudo da rota imprime a coordenada (`apps/api/src/saida/pacote.ts` não lê `v.latitude` nem `v.longitude`). Corrige agora, numa etapa pequena, ou espera a F09-E02 (montador único)?
8. **Outras propostas abertas na seção 11 do STATUS** (decidir quando puder; não bloqueiam o G00 por si):
   - município suspenso não baixa o pacote de saída (E11): precisa de exceção à suspensão?
   - trocar espera fixa de 20 ms por espera com condição em `resolver-link.test.ts` e `dominio.test.ts` (E03, E10, E21);
   - as três propostas da E17 sobre `conferir:numeros` (protocolo manda rodar, número num lugar só, ligar ao CI);
   - "1 metros" no laudo e no Perfil (E15);
   - `GRANT CREATE ON DATABASE` ao `dc360_setup` no CI e na receita do README (E25), agora ou na F01-E03.

---

## Checklist final

| Etapa | Onde | Tempo | Feito | Resultado |
| --- | --- | --- | --- | --- |
| V2-F00-E01 | D1, segunda pessoa e CI | 1 h 30 (outra pessoa) | [ ] | |
| V2-F00-E02 | E1, leitura | 10 min | [ ] | |
| V2-F00-E03 | E2, leitura e decisão | 30 min | [ ] | |
| V2-F00-E04 | C1, terminal | 10 min | [ ] | |
| V2-F00-E05 | A4, web | 15 min | [ ] | |
| V2-F00-E06 | B1, mobile | 30 min | [ ] | |
| V2-F00-E07 | C2, terminal | 10 min | [ ] | |
| V2-F00-E08 | C3, terminal | 15 min | [ ] | |
| V2-F00-E09 | A3, web | 30 min | [ ] | |
| V2-F00-E10 | A5, web e terminal | 25 min | [ ] | |
| V2-F00-E11 | A6, web | 10 min | [ ] | |
| V2-F00-E12 | A7, web e terminal | 20 min | [ ] | |
| V2-F00-E13 | A1 e A2, web | 30 min | [ ] | |
| V2-F00-E14 | B2, mobile | 10 min | [ ] | |
| V2-F00-E15 | B3, mobile | 25 min | [ ] | |
| V2-F00-E16 | B4, mobile | 25 min | [ ] | |
| V2-F00-E17 | C6 e D3, terminal e Linux | 10 min (mais Linux) | [ ] | |
| V2-F00-E18 | C5, terminal | 30 min | [ ] | |
| V2-F00-E19 | nada a validar (bloqueada pelo CP-03) | 0 | [ ] | |
| V2-F00-E20 | E3, leitura | 10 min | [ ] | |
| V2-F00-E21 | C7 e D3, terminal e Linux | 20 min (mais Linux) | [ ] | |
| V2-F00-E22 | E4, leitura | 20 min | [ ] | |
| V2-F00-E23 | C4, terminal | 10 min | [ ] | |
| V2-F00-E24 | E5, leitura com o Alyson | 30 min | [ ] | |
| V2-F00-E25 | D2, segunda pessoa | 1 h 30 (outra pessoa) | [ ] | |

Com todas as linhas feitas, CP-03 decidido e a E19 executada, o próximo passo é a conferência do `# GATE G00` em `docs/roadmap-v2/03-fase-00-estabilizacao.md` e o `GATE.md` em `docs/evidencias-v2/G00/`.
