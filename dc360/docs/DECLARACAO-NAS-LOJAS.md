# Declaração de dados nas lojas de aplicativo

- **Versão:** 3, de 15/09/2026 (a 1 é de 09/09/2026; a 2 acrescenta a leitura da última posição conhecida pelas telas de tarefas e de mapa, e o caminho por ruas a pedido do agente; a 3 troca as âncoras por número de linha por âncoras por símbolo conferidas por portão, inclui a foto de perfil e atualiza o que a seção 7 dizia de vencido)
- **Companheiro de:** `PRIVACIDADE.md` e `SUBPROCESSADORES.md`
- **Para quem preenche:** os formulários "Privacy Nutrition Labels" (App Store
  Connect) e "Segurança dos dados" (Google Play Console)
- **Substitui:** a tabela de segurança de dados que estava em
  `../apps/campo/LOJAS.md`, passo 5, e que dizia "Dados são compartilhados com
  terceiros? Não"

Este documento existe porque aquela resposta deixou de ser verdadeira. O turno
T7 ligou a notificação por push falando **direto com a Apple (APNs) e direto com
o Google (FCM)**, sem o serviço de push da Expo no meio. A partir daí a ficha do
aparelho e o dado da mensagem passam por servidor dessas duas empresas, fora do
país. Marcar "não compartilha com terceiros" num formulário de loja é uma
declaração, não um texto de marketing: submeter assim é declarar falso, e as duas
lojas derrubam por isso.

**Regra de uso deste arquivo.** Toda linha das tabelas abaixo aponta para o
arquivo e o SÍMBOLO do código que a sustenta, escrito entre crases na forma
caminho/arquivo.ts#nomeDoSimbolo (função, constante, coluna, chave de
configuração), ou com `#!` antes do nome quando o que sustenta a afirmação é
uma AUSÊNCIA. Se uma afirmação não tiver essa âncora, ela não pode ser copiada
para o formulário: quem submete assina.

Até a versão 2 as âncoras eram por número de linha, e um revisor provou em
15/09/2026 o que número de linha faz: seis delas já apontavam para o lugar
errado, porque os arquivos cresceram em cima delas. Uma âncora que mente é pior
que nenhuma. Desde então `scripts/ancoras-da-declaracao.test.mjs` confere, a
cada `npm run test:scripts`, que cada arquivo citado existe, que cada símbolo
citado aparece nele (ou não aparece, nas âncoras de ausência), e que nenhuma
âncora por número de linha voltou. O que o portão não confere, e continua sendo
leitura de gente, é se o símbolo faz o que a frase diz.

---

## 1. O levantamento, lido do código

### 1.1 O que o aplicativo pede ao sistema operacional

| Recurso | Onde é pedido | Quando |
| --- | --- | --- |
| Câmera | `apps/campo/src/app/(agente)/vistoria/[id].tsx#fotografar` | Quando o agente abre a câmera dentro da vistoria |
| Localização, primeiro plano | mesmo arquivo, `apps/campo/src/app/(agente)/vistoria/[id].tsx#capturarGps`, que chama `apps/campo/src/app/(agente)/vistoria/[id].tsx#requestForegroundPermissionsAsync` | Quando o agente toca em capturar a coordenada |
| Localização, última posição conhecida (sem pedir permissão e sem ligar o GPS) | `apps/campo/src/app/(agente)/mapa.tsx#verOndeEstou` e `apps/campo/src/app/(agente)/index.tsx#verOndeEstou` (`getForegroundPermissionsAsync` seguido de `getLastKnownPositionAsync`, nos dois: `apps/campo/src/app/(agente)/mapa.tsx#getLastKnownPositionAsync`, `apps/campo/src/app/(agente)/index.tsx#getLastKnownPositionAsync`) | Ao abrir a tela do mapa ou a de tarefas, só se a permissão já foi concedida na vistoria. Lê a posição que o sistema já tinha; não pede permissão e não liga o rádio |
| Notificação | `apps/campo/src/push/permissao.ts#proximoPasso` | Nunca antes do primeiro login, e uma vez só |
| Notificação local, som e vibração (desde 15/09/2026) | `apps/campo/src/push/ProvedorDePush.tsx#montarAvisoLocalDeTarefaNova` (o bloco 7 do cabeçalho) e `apps/campo/src/push/PortaExpo.ts#avisarLocalmente` | Quando a atualização periódica da lista traz uma ocorrência despachada que não estava lá. Usa a mesma permissão de notificação já concedida: não há pedido novo. O som (`assets/sons/despacho.wav`) é gerado por código e embarcado no binário; o aplicativo **toca** som e **não grava** som (`RECORD_AUDIO` continua bloqueado) |
| Câmera (da frente), para a foto de perfil | `apps/campo/src/dados/foto-do-agente.ts#escolherFoto`, com a origem `camera` | Quando o agente toca em "Tirar foto agora" no Perfil. Mesma permissão e mesmo texto da câmera da vistoria |
| Seletor de fotos do sistema, para a foto de perfil (desde 15/09/2026) | `apps/campo/src/dados/foto-do-agente.ts#escolherFoto`, com a origem `galeria`; o texto da chave em `apps/campo/app.config.ts#TEXTO_GALERIA` | Quando o agente toca em "Escolher da galeria" no Perfil. **Não pede permissão de biblioteca**: o seletor abre fora do processo (Photo Picker no Android, seletor do sistema no iOS) e só a imagem tocada chega ao aplicativo. O binário declara `NSPhotoLibraryUsageDescription`, em português, porque a Apple exige a chave quando o seletor é usado |

Não há pedido de contatos, agenda, microfone, telefone, armazenamento
compartilhado nem localização em segundo plano, e não há pedido de acesso à
biblioteca de fotos inteira: a foto de perfil entra pelo seletor do sistema,
uma imagem por vez, e `READ_EXTERNAL_STORAGE` continua bloqueado no manifesto.
As chaves que o binário declarava por herança dos plugins foram removidas nesta
mesma entrega (seção 5).

### 1.2 O que fica guardado no aparelho, e onde

| Dado | Onde fica | Evidência |
| --- | --- | --- |
| Token de sessão e de renovação | Cofre do sistema (Keychain no iOS, Keystore no Android) | `apps/campo/src/dados/sessao.tsx#CHAVE_CREDENCIAIS`, gravada com `apps/campo/src/dados/sessao.tsx#WHEN_UNLOCKED_THIS_DEVICE_ONLY` |
| Identidade do agente (nome, matrícula, papel, município) | Mesmo cofre | `apps/campo/src/dados/sessao.tsx#CHAVE_IDENTIDADE`; formato em `apps/campo/src/dados/api.ts#Identidade` |
| Ficha de push deste aparelho | Mesmo cofre | `apps/campo/src/push/ficha-do-aparelho.ts#guardarFicha` |
| Ocorrências despachadas para a equipe, com nome e contato do solicitante, endereço, coordenada, relato e descrição de vulnerabilidade social | Banco SQLite privado do aplicativo, tabela `pendencias` | Esquema em `apps/campo/src/dados/banco-local.ts#pendencias`; conteúdo em `apps/campo/src/dados/api.ts#Pendencia` (`solicitante_nome`, `solicitante_contato`, `endereco`, `descricao`, `vulnerabilidade_descricao`) |
| Rascunho da vistoria: checklist, coordenada, precisão do GPS, contagem de pessoas atingidas, nome de quem assina, observações | Mesmo banco, tabela `rascunhos` | `apps/campo/src/dados/banco-local.ts#rascunhos`; formato em `apps/campo/src/dados/rascunho.ts#Rascunho` |
| Fotografias da vistoria | Diretório privado do aplicativo, como `foto-<carimbo>-<ordem>.jpg` | `apps/campo/src/dados/evidencia-no-disco.ts#guardarFotoNoAparelho` |
| Traço da assinatura | Mesmo diretório, como `assinatura-<carimbo>.png` | `apps/campo/src/ui/Assinatura.tsx#Assinatura`, na gravação em `Paths.document` |
| Fila de envio, com a coleta inteira até subir | Mesmo banco, tabela `fila_sincronizacao` | `packages/campo/src/deposito-sqlite.ts#TABELA` e `packages/campo/src/deposito-sqlite.ts#prepararSqlite` |
| Foto de perfil do próprio agente (desde 15/09/2026) | Diretório privado do aplicativo, uma cópia local para a tela do Perfil e do menu, mais a chave no servidor | `apps/campo/src/dados/foto-do-agente.ts#fotoLocalDoAgente` e `apps/campo/src/dados/foto-do-agente.ts#enviarFoto`; no servidor, `db/migrations/040_foto_do_agente.sql#foto_chave` |

Três fatos que a declaração precisa refletir, e que decidem respostas do
formulário:

1. **Nada disso é cópia de nuvem do fabricante.** O backup automático do Android
   está desligado (`apps/campo/app.config.ts#allowBackup`, com `false`),
   e o cofre é gravado com `apps/campo/src/dados/sessao.tsx#WHEN_UNLOCKED_THIS_DEVICE_ONLY`,
   que não sai deste aparelho.
2. **Sair da conta apaga o dado do cidadão do aparelho.**
   `apps/campo/src/dados/banco-local.ts#apagarDadosLocais` zera `rascunhos`,
   `pendencias`, `marcas` e `coletas` e remove os arquivos de prova que nenhuma
   coleta da fila ainda referencia. Isso é o que permite responder "sim" à
   pergunta sobre exclusão de dados no aparelho.
3. **A fila NÃO é apagada no logout, de propósito** (o comentário dentro de
   `apps/campo/src/dados/banco-local.ts#apagarDadosLocais` sobre
   `fila_sincronizacao`): ela guarda vistoria já feita e ainda não entregue, e
   apagá-la destruiria prova de ato administrativo. Cada item carrega o carimbo
   de quem coletou, e o envio só ocorre para o autor.

### 1.3 O que sai do aparelho para o servidor do município

Tudo por HTTPS, sem exceção de transporte no iOS
(`apps/campo/app.config.ts#NSAllowsArbitraryLoads`, com `false`). O
servidor é o do fornecedor, operando em nome do município: os provedores estão
nomeados em `SUBPROCESSADORES.md`, seção 1, e ficam no Brasil.

Sai: email e senha na entrada (`apps/campo/src/dados/api.ts#entrar`), a ficha de
push com a plataforma (`apps/campo/src/dados/api.ts#registrarAparelho`), a coleta
da vistoria inteira, com fotografias e assinatura, e, desde 15/09/2026, **a foto
de perfil do próprio agente**, escolhida por ele: os bytes vão direto ao
armazenamento do município por URL assinada de vida curta, e a chave é
confirmada na API (`apps/campo/src/dados/api.ts#autorizarEnvioDaFoto`,
`apps/campo/src/dados/api.ts#confirmarFoto`; do lado do servidor,
`apps/api/src/rotas/usuarios-eu.ts#prefixoDaFoto`, migração
`db/migrations/040_foto_do_agente.sql#foto_chave`). É dado pessoal do servidor
público, não do cidadão: não entra em laudo, não entra em ofício, não sai por
exportação, e a pessoa a remove sozinha (`apps/campo/src/dados/api.ts#removerFoto`).
Onde ela aparece e por quanto tempo fica está na seção 2.2 de `PRIVACIDADE.md`.

### 1.4 O que sai do país, e é isto que muda a declaração

O aviso de push viaja por servidor da Apple ou do Google. Duas partes, e elas
têm regimes diferentes:

| Parte da mensagem | Conteúdo | Evidência |
| --- | --- | --- |
| **Vitrine** (o que fica legível na tela bloqueada) | Texto fixo, sem interpolação: "Nova tarefa" ou "Prazo vencendo", mais uma frase mandando abrir o aplicativo | `apps/api/src/push/mensagem.ts#VITRINE` |
| **Dado da mensagem** (lido pelo aplicativo) | `tipo`, `organizacaoId`, `ocorrenciaId`, e quando existirem `severidade` e `prazoEm` | `apps/api/src/push/mensagem.ts#montarAviso` |
| **Ficha do aparelho** | O identificador que a Apple ou o Google usa para entregar | `apps/campo/src/push/PortaExpo.ts#obterFicha`; guardado no servidor em `db/migrations/016_aparelho_e_aviso_de_prazo.sql#aparelhos`, coluna `ficha` |

**Protocolo, endereço, nome e contato do cidadão NÃO entram na notificação**, e
isso não é disciplina de quem escreve texto: há uma trava de tempo de execução
que faz o envio falhar se algum campo do dado aparecer no texto visível
(`apps/api/src/push/mensagem.ts#VitrineIndiscreta`, levantada dentro de `montarAviso`).

**A ficha é obtida do sistema operacional, e não do serviço da Expo.**
`apps/campo/src/push/PortaExpo.ts#getDevicePushTokenAsync`, com o motivo escrito
no próprio código (dentro de `obterFicha`): usar
`getExpoPushTokenAsync` acrescentaria um subprocessador que não está em
`SUBPROCESSADORES.md`.

**No Android, a biblioteca do Firebase (FCM) mantém identificadores próprios do
aparelho e do aplicativo com o Google**, além da ficha. O projeto está declarado
em `apps/campo/google-services.json` e ligado por
`apps/campo/app.config.ts#googleServicesFile`. É por isso que a categoria de
identificadores de aparelho tem de ser marcada nas duas lojas.

**E a coordenada sai do país por mais duas vias, as duas só no município que
as ligou**, e as duas descritas na seção 2 deste documento e na seção 2.2 de
`SUBPROCESSADORES.md`:

| Via | Conteúdo | Quando | Evidência |
| --- | --- | --- | --- |
| Mapa do Google dentro do aplicativo | Coordenada do imóvel, a região do mapa, e a posição do agente enquanto o mapa está aberto | Com a tela do mapa ou a da vistoria aberta, no município com `MAPS_KEY` | `apps/campo/src/ui/mapa/MapaDoImovel.tsx` (`PROVIDER_GOOGLE`, `showsUserLocation`); a autorização em `dados/mapa.ts`, `decidirModoDoMapa` |
| Caminho por ruas | A posição do agente, arredondada a três casas decimais, e a coordenada do imóvel | Só no toque em "Ver o caminho", no município com `ROUTES_KEY` | `apps/campo/src/dados/rota.ts` (para a API do produto) e `apps/api/src/rotas/rota.ts` (da API para o Google) |

### 1.5 O que o aplicativo NÃO coleta

Verificado por ausência, e não por promessa:

- Sem biblioteca de análise de comportamento, de publicidade ou de relatório de
  falha. As dependências estão em `apps/campo/package.json#dependencies`, e
  não há nenhuma dessas.
- Sem identificador de propaganda, sem rastreamento entre aplicativos, sem
  cruzamento com dado de outra empresa.
- Sem microfone: `apps/campo/app.config.ts#recordAudioAndroid` com `false` e a
  permissão em `apps/campo/app.config.ts#blockedPermissions`.
- Sem localização em segundo plano:
  `apps/campo/app.config.ts#isAndroidBackgroundLocationEnabled` com `false`,
  e nenhuma tarefa de fundo no código
  (`apps/campo/src#!watchPositionAsync`, `apps/campo/src#!requestBackgroundPermissionsAsync`).

---

## 2. A frase exata sobre localização

Este é o ponto que mais derruba submissão, então a frase vai inteira, pronta
para colar, seguida do que a sustenta.

> O aplicativo lê a localização **precisa**, **somente com o aplicativo aberto e
> em primeiro plano**. O GPS é ligado **somente quando o agente toca no botão
> que registra a coordenada da vistoria**, e essa coordenada é gravada no laudo
> técnico para provar onde a vistoria foi feita. As telas de tarefas e de mapa
> leem a **última posição que o sistema já conhecia**, sem ligar o GPS e sem
> pedir permissão, para dizer a distância até cada tarefa; essa leitura não é
> gravada. Se o agente tocar em "Ver o caminho", a posição dele e a coordenada
> do imóvel são enviadas ao servidor do município e dali ao Google, uma vez,
> para traçar o caminho por ruas; nenhuma das duas é guardada pelo servidor.
> Não há leitura contínua, não há leitura em segundo plano, não há histórico de
> deslocamento do agente, e a localização não é usada para publicidade nem
> para rastreamento.

O que sustenta cada pedaço. O GPS, em
`apps/campo/src/app/(agente)/vistoria/[id].tsx#capturarGps`:

| Afirmação | Evidência |
| --- | --- |
| Primeiro plano, e só | `apps/campo/src/app/(agente)/vistoria/[id].tsx#requestForegroundPermissionsAsync`. Não existe chamada a `requestBackgroundPermissionsAsync` nem a `watchPositionAsync` em lugar nenhum do aplicativo (`apps/campo/src#!requestBackgroundPermissionsAsync`, `apps/campo/src#!watchPositionAsync`) |
| Precisa, e não aproximada | `apps/campo/src/app/(agente)/vistoria/[id].tsx#Location.Accuracy.High`. O comentário ao lado diz o porquê: coordenada de cem metros não identifica qual casa do morro, e o laudo técnico precisa dessa distinção. No Android, `ACCESS_FINE_LOCATION` está declarada (`apps/campo/app.config.ts#ACCESS_FINE_LOCATION`) |
| Uma leitura por toque, sem rastro | `apps/campo/src/app/(agente)/vistoria/[id].tsx#getCurrentPositionAsync` numa função disparada pelo botão. Não há assinatura de posição contínua |
| Serve ao laudo | Dentro de `capturarGps`: a coordenada é gravada no rascunho com seis casas decimais (`toFixed(6)`), junto com a precisão em metros que o aparelho informou (`apps/campo/src/dados/rascunho.ts#Rascunho`) |
| A vistoria funciona sem ela | Dentro de `capturarGps`: permissão negada não trava a vistoria, mostra uma frase explicando o que se perde |

A última posição conhecida, nas telas de tarefas e de mapa:

| Afirmação | Evidência |
| --- | --- |
| Não pede permissão | `apps/campo/src/app/(agente)/mapa.tsx#getForegroundPermissionsAsync` e `apps/campo/src/app/(agente)/index.tsx#getForegroundPermissionsAsync` só CONSULTAM; se não foi concedida na vistoria, a função retorna sem ler nada. `mapa-tela-dedicada.test.tsx` prova que `requestForegroundPermissionsAsync` não é chamada pela tela do mapa (`apps/campo/src/app/(agente)/mapa.tsx#!requestForegroundPermissionsAsync`) |
| Não liga o GPS | `apps/campo/src/app/(agente)/mapa.tsx#getLastKnownPositionAsync` e `apps/campo/src/app/(agente)/index.tsx#getLastKnownPositionAsync`, que devolvem o que o sistema já tinha, sem ligar o rádio. Nula é o caso comum, e a tela diz "sem distância" em vez de estimar |
| Só com a tela aberta | A leitura está dentro de `useFocusEffect`: acontece ao entrar na tela, e não a cada quadro nem em segundo plano |
| Não é gravada | A posição fica em estado de tela (`useState`) e serve para a distância e o rumo em linha reta. Não entra no rascunho, no laudo nem no banco local |
| Vai ao mapa do Google quando o município autorizou | `MapaDoImovel`, `showsUserLocation`: o SDK do Google desenha o ponto do agente, e por isso a posição chega ao Google enquanto o mapa está aberto. Declarado em `SUBPROCESSADORES.md`, seção 2.2, e ausente no modo esquemático |

O caminho por ruas, a pedido:

| Afirmação | Evidência |
| --- | --- |
| Só no toque | `apps/campo/src/app/(agente)/mapa.tsx#pedirOCaminho`, disparado pela folha do botão "Ver o caminho": é o único chamador de `apps/campo/src/dados/rota.ts#verOCaminho`. `mapa-tela-dedicada.test.tsx` prova que abrir a tela não pede caminho nenhum |
| Passa pelo servidor do município, nunca direto ao Google | `apps/campo/src/dados/rota.ts#pedirCaminho`: `POST /rota` na API do produto. `scripts/portao-do-mapa-do-aplicativo.test.mjs` reprova `routes.googleapis.com` em qualquer arquivo do aplicativo |
| O servidor não guarda | `apps/api/src/rotas/rota.ts`: nenhuma escrita no banco, nenhum log com coordenada; `apps/api/test/rota.test.ts` lê o log e o esquema do banco para provar. A posição sai arredondada a três casas decimais |
| No aparelho, some no logout | `apps/campo/src/dados/rota.ts#lerCaminhoGuardado` lê a tabela `marcas` do banco local, que `apps/campo/src/dados/banco-local.ts#apagarDadosLocais` esvazia; `dados/rota.test.ts` prova |

**Nas duas lojas, portanto: localização precisa, sim; localização aproximada,
sim** (o Android concede as duas juntas quando `ACCESS_FINE_LOCATION` é
concedida, e `ACCESS_COARSE_LOCATION` está declarada em
`apps/campo/app.config.ts#ACCESS_COARSE_LOCATION`); **localização em segundo
plano, não.** Responder "segundo plano" faz a
Google pedir vídeo demonstrando o uso, para um uso que não existe.

**E compartilhada com terceiro, sim, em duas situações, as duas declaradas em
`SUBPROCESSADORES.md`:** enquanto o mapa do Google está aberto (a posição do
agente vai ao SDK do Google, no município que autorizou o mapa), e no toque em
"Ver o caminho" (a posição do agente e a coordenada do imóvel vão ao servidor
do município e dali à Routes API do Google, no município que ligou o caminho).
No município que não ligou nenhuma das duas, a localização não sai do
aparelho por nenhuma via do produto.

---

## 3. App Store: Privacy Nutrition Labels

Para o formulário "App Privacy" do App Store Connect. As três colunas da direita
são as três perguntas que a Apple faz sobre cada tipo de dado.

**"Vinculado à identidade" é sim em quase tudo, e isso é esperado**: o
aplicativo só funciona depois do login com conta criada pela coordenação do
município, então todo dado é atribuível a um servidor público identificado. Isso
não é defeito, é o requisito de auditoria do produto: quem assina laudo responde
pelo ato.

**"Usado para rastreamento" é não em tudo**, sem exceção. O aplicativo não tem
identificador de propaganda, não combina dado com o de terceiros e não faz
`App Tracking Transparency`. Por isso ele não pede a autorização de rastreamento
e não deve pedir.

| Categoria da Apple | Tipo | Coletado | Finalidade a declarar | Vinculado à identidade | Usado para rastreamento |
| --- | --- | --- | --- | --- | --- |
| Contact Info | Email Address | Sim | Funcionalidade do app | Sim | Não |
| Contact Info | Name | Sim | Funcionalidade do app | Sim | Não |
| Contact Info | Phone Number | Sim | Funcionalidade do app | Sim | Não |
| Contact Info | Physical Address | Sim | Funcionalidade do app | Sim | Não |
| Location | Precise Location | Sim | Funcionalidade do app | Sim | Não (vai ao Google para desenhar o mapa e traçar o caminho, e o Google não a usa para rastreamento nem para publicidade nos nossos termos; ver a seção 2) |
| User Content | Photos or Videos | Sim (fotografias da vistoria e, desde 15/09/2026, a foto de perfil do agente) | Funcionalidade do app | Sim | Não |
| User Content | Other User Content | Sim | Funcionalidade do app | Sim | Não |
| Identifiers | User ID | Sim | Funcionalidade do app | Sim | Não |
| Identifiers | Device ID | Sim | Funcionalidade do app | Sim | Não |
| Sensitive Info | Sensitive Info | Sim | Funcionalidade do app | Sim | Não |
| Diagnostics | (nenhum) | Não | | | |
| Usage Data | (nenhum) | Não | | | |
| Purchases | (nenhum) | Não | | | |
| Financial Info | (nenhum) | Não | | | |
| Browsing History | (nenhum) | Não | | | |
| Search History | (nenhum) | Não | | | |
| Contacts | (nenhum) | Não | | | |

Por que cada "sim", em uma linha:

- **Email Address**: é o que a tela de entrada envia (`apps/campo/src/dados/api.ts#entrar`).
- **Name**: o do agente, que vem no login e é gravado no cofre
  (`apps/campo/src/dados/api.ts#Identidade`); e o do solicitante e o de quem
  assina a ciência, que descem para o aparelho e voltam na coleta
  (`apps/campo/src/dados/api.ts#solicitante_nome`;
  `apps/campo/src/dados/rascunho.ts#assinanteNome`).
- **Phone Number**: o contato do solicitante, em
  `apps/campo/src/dados/api.ts#solicitante_contato`.
- **Physical Address**: o endereço do imóvel vistoriado
  (`apps/campo/src/dados/api.ts#Pendencia`, campo `endereco`).
- **Precise Location**: seção 2 acima.
- **Photos or Videos**: as fotografias da vistoria (só fotos, nunca vídeo:
  `apps/campo/src/app/(agente)/vistoria/[id].tsx#takePictureAsync` é a única
  captura no código, e `apps/campo/src#!recordAsync`), e, desde 15/09/2026,
  **a foto de perfil do agente** (`apps/campo/src/dados/foto-do-agente.ts#escolherFoto`),
  tirada com a câmera da frente ou escolhida uma a uma pelo seletor do sistema,
  redimensionada a 512 pontos (`apps/campo/src/dados/foto-do-agente.ts#LADO_DA_FOTO`)
  e enviada ao armazenamento do município.
- **Other User Content**: o traço da assinatura, as observações do agente e as
  respostas do checklist técnico (`apps/campo/src/dados/rascunho.ts#Rascunho`:
  `checklist`, `assinaturaUri`, `observacoes`).
- **User ID**: `usuarioId` e matrícula do agente
  (`apps/campo/src/dados/api.ts#Identidade`).
- **Device ID**: a ficha de push, que a Apple e o Google conhecem por
  definição (`apps/campo/src/push/PortaExpo.ts#obterFicha`).
- **Sensitive Info**: a descrição de vulnerabilidade social desce para o
  aparelho e é exibida na tela da vistoria
  (`apps/campo/src/dados/api.ts#vulnerabilidade_descricao`;
  `apps/campo/src/app/(agente)/vistoria/[id].tsx#vulnerabilidade_descricao`). Ela pode revelar
  deficiência, gestação ou condição de saúde, e `PRIVACIDADE.md`, seção 2.1, já
  a trata como dado sensível na acepção da Lei 13.709/2018. Marcar "não" aqui
  seria a mesma classe de erro que este documento veio corrigir.

**Ponto que precisa de decisão humana, e não de palpite:** se o traço da
assinatura de próprio punho deve ser declarado também como dado biométrico
dentro de "Sensitive Info". A assinatura é gravada como imagem
(`apps/campo/src/ui/Assinatura.tsx#Assinatura`) e serve como prova de ciência do ato, não como
autenticação de pessoa. A leitura deste documento é que ela é "Other User
Content"; confirmar isso é chamada do encarregado de dados, e a resposta muda
uma célula da tabela.

---

## 4. Google Play: formulário de Segurança dos dados

"Compartilhado" no vocabulário da Google significa transferir para uma empresa
distinta. A infraestrutura contratada pelo fornecedor para prestar o serviço
(banco, armazenamento, servidor) é processamento, e não compartilhamento. A
notificação é o caso que muda: a Apple e o Google recebem a ficha e o dado da
mensagem para conseguirem entregar, e é por isso que as duas últimas linhas
abaixo dizem "sim" na coluna de compartilhamento.

Todas as linhas: **cifrado em trânsito, sim** (HTTPS obrigatório,
`apps/campo/app.config.ts#NSAllowsArbitraryLoads` com `false`; o transporte com
a APNs e com a FCM é HTTP/2 sobre TLS, `apps/api/src/push/apns.ts#transporteApnsHttp2`
e `apps/api/src/push/fcm.ts#criarProvedorFcm`).

| Tipo de dado (categoria da Google) | Coletado | Compartilhado | Obrigatório | Finalidade | Pode ser apagado |
| --- | --- | --- | --- | --- | --- |
| Informações pessoais > Nome | Sim | Não | Obrigatório | Funcionalidade do app | Sim, pelo município |
| Informações pessoais > Endereço de email | Sim | Não | Obrigatório | Funcionalidade do app, gerenciamento da conta | Sim, pelo município |
| Informações pessoais > Número de telefone | Sim | Não | Obrigatório | Funcionalidade do app | Sim, pelo município |
| Informações pessoais > Endereço | Sim | Não | Obrigatório | Funcionalidade do app | Não, ver observação |
| Informações pessoais > Outras informações | Sim | Não | Obrigatório | Funcionalidade do app | Sim, pelo município |
| Local > Localização precisa | Sim | **Sim**, ver observação | Opcional | Funcionalidade do app | Não, ver observação |
| Local > Localização aproximada | Sim | **Sim**, ver observação | Opcional | Funcionalidade do app | Não, ver observação |
| Fotos e vídeos > Fotos | Sim (fotografias da vistoria e, desde 15/09/2026, a foto de perfil do agente) | Não | Obrigatório para a vistoria; a foto de perfil é opcional | Funcionalidade do app | Não para a vistoria, ver observação; a foto de perfil, sim, pela própria pessoa |
| Arquivos e documentos | Sim | Não | Obrigatório | Funcionalidade do app | Não, ver observação |
| Saúde e fitness > Informações de saúde | Sim | Não | Opcional | Funcionalidade do app | Sim, pelo município |
| IDs do dispositivo | Sim | **Sim** | Opcional | Funcionalidade do app | Sim, ao sair da conta |
| Atividade no app > Outras ações | Sim | **Sim** | Opcional | Funcionalidade do app | Sim, ao sair da conta |
| Registros de falhas, diagnóstico, desempenho | Não | | | | |
| Histórico de navegação, de pesquisa, contatos, agenda, SMS, áudio, informações financeiras | Não | | | | |

Observações que precisam ir junto, e que a Google aceita no campo de texto:

- **"Outras informações"** é o relato do chamado, o ponto de referência, as
  observações do agente e o checklist técnico
  (`apps/campo/src/dados/api.ts#Pendencia`: `descricao`, `ponto_referencia`;
  `apps/campo/src/dados/rascunho.ts#Rascunho`: `checklist`, `observacoes`).
- **"Arquivos e documentos"** é o traço da assinatura, gravado como PNG
  (`apps/campo/src/ui/Assinatura.tsx#Assinatura`).
- **"Fotos"** inclui a foto de perfil do agente desde 15/09/2026. Ela é opcional,
  é do servidor público e não do cidadão, e a própria pessoa a troca ou remove
  no Perfil (`apps/campo/src/dados/api.ts#removerFoto`); trocar apaga a anterior
  do armazenamento, com o rastro na trilha administrativa
  (`apps/api/src/rotas/usuarios-eu.ts#prefixoDaFoto`).
- **"Informações de saúde"** é a descrição de vulnerabilidade social, pela mesma
  razão da linha "Sensitive Info" da Apple. É opcional porque a ocorrência pode
  não ter nenhuma.
- **"Localização" é opcional** porque a vistoria pode ser concluída sem a
  coordenada quando a permissão é negada
  (dentro de `apps/campo/src/app/(agente)/vistoria/[id].tsx#capturarGps`).
- **"Localização" é compartilhada** desde 14/09/2026 (mapa dentro do
  aplicativo) e 15/09/2026 (caminho por ruas): a posição do agente vai ao SDK
  do Google enquanto o mapa está aberto, e, no toque em "Ver o caminho", ao
  servidor do município e dali à Routes API do Google. As duas saídas estão
  descritas na seção 2 deste documento e na seção 2.2 de
  `SUBPROCESSADORES.md`, as duas só existem no município que as ligou, e a
  coordenada do imóvel vistoriado sai pelas mesmas vias. Até a versão 1 deste
  documento a coluna dizia "não", e a frase "é o único compartilhamento do
  produto" (abaixo) valia; hoje são três.
- **As duas linhas de push com "sim" em compartilhamento** são a ficha e o dado
  da mensagem: eles vão para a Apple (APNs) e para o Google (FCM), que são
  empresas distintas do fornecedor e do município. Junto com a localização
  (acima), são os três compartilhamentos do produto. O conteúdo exato está na
  seção 1.4. A categoria "Atividade no app
  > Outras ações" é a que mais se aproxima do dado da mensagem no vocabulário da
  Google, que não tem uma categoria para identificador de registro. A escolha da
  categoria é discutível; o que **não** é discutível é a coluna de
  compartilhamento marcada, e é ela que a loja confere.
- **"Pode ser apagado: não"** nas linhas de endereço, coordenada, foto e
  arquivo não é recusa a atender o titular: é o limite legal descrito em
  `PRIVACIDADE.md`, seção 5. O que sustenta ato administrativo (o laudo, a
  interdição, a trilha) não se elimina a pedido. Nome e contato do solicitante
  saem por prazo, pela varredura de minimização descrita na seção 4 daquele
  documento. O texto para o formulário: "a exclusão é pedida ao município, que é
  o controlador dos dados; o que sustenta ato administrativo é preservado por
  obrigação legal".
- **"Pode ser apagado: sim, ao sair da conta"** nas duas linhas de push: o
  logout manda a ficha ao servidor, que a revoga
  (`apps/campo/src/dados/sessao.tsx#sair`, que chama
  `apps/campo/src/dados/api.ts#revogarAparelho`; do lado do servidor,
  `apps/api/src/rotas/aparelhos.ts#revogar` e a rota `/auth/sair` em
  `apps/api/src/rotas/autenticacao.ts#sair`), e apaga a cópia local
  (`apps/campo/src/push/ficha-do-aparelho.ts#esquecerFicha`).

**A pergunta sobre criptografia em repouso**, quando aparecer: o dado no
aparelho fica no diretório privado do aplicativo, protegido pela criptografia do
próprio sistema operacional; token, identidade e ficha ficam no Keychain ou no
Keystore (`apps/campo/src/dados/sessao.tsx#WHEN_UNLOCKED_THIS_DEVICE_ONLY`). O
banco SQLite local **não** tem
criptografia adicional própria, e essa é a resposta honesta.

---

## 5. Permissões que o binário declara, e o que dizer sobre cada uma

A Play Store mostra esta lista para quem vai instalar, e o revisor da Apple lê a
equivalente. Ela é a soma do que `app.config.ts` pede com o que cada biblioteca
declara sozinha. Conferida com `npx expo config --type introspect`, com a pasta
`android/` ausente.

| Permissão | De onde vem | Por que existe |
| --- | --- | --- |
| `INTERNET` | `apps/campo/app.config.ts#permissions` (`android.permission.INTERNET`) | Falar com o servidor do município |
| `ACCESS_NETWORK_STATE` | `apps/campo/app.config.ts#ACCESS_NETWORK_STATE` | Saber se há sinal, para a fila decidir quando enviar |
| `CAMERA` | `apps/campo/app.config.ts#permissions` (`android.permission.CAMERA`) | Fotografar o imóvel na vistoria, e a foto de perfil pela câmera da frente |
| `ACCESS_FINE_LOCATION` | `apps/campo/app.config.ts#ACCESS_FINE_LOCATION` | Coordenada da vistoria |
| `ACCESS_COARSE_LOCATION` | `apps/campo/app.config.ts#ACCESS_COARSE_LOCATION` | Concedida junto com a acima |
| `POST_NOTIFICATIONS` | `expo-notifications` | Aviso de tarefa nova e de prazo vencendo |
| `RECEIVE_BOOT_COMPLETED` | `expo-notifications` | Restaurar aviso agendado depois de o aparelho reiniciar. É comportamento da biblioteca, declarado no `AndroidManifest.xml` dela |
| `VIBRATE` | modelo base do Expo | O canal de despacho e o de urgência vibram (`apps/campo/src/push/canais.ts#VIBRACAO_DE_DESPACHO` e `apps/campo/src/push/canais.ts#CANAIS`; a tradução para o sistema está em `apps/campo/src/push/PortaExpo.ts#vibrationPattern`) |

E as que foram **bloqueadas nesta entrega**, com o motivo, em
`apps/campo/app.config.ts#blockedPermissions`:

| Permissão bloqueada | Quem pedia | Por que sai |
| --- | --- | --- |
| `RECORD_AUDIO` | `expo-camera` | O aplicativo não grava som |
| `READ_EXTERNAL_STORAGE` | `expo-file-system` | Tudo é gravado no diretório privado do aplicativo (`Paths.document`) |
| `WRITE_EXTERNAL_STORAGE` | `expo-file-system` | Idem |
| `SYSTEM_ALERT_WINDOW` | modelo base do Expo | Nenhuma tela desenha por cima de outro aplicativo |

No iOS, o Info.plist gerado passa a ter **três** chaves de uso:
`NSCameraUsageDescription` e `NSLocationWhenInUseUsageDescription`, com os
textos de `apps/campo/app.config.ts#TEXTO_CAMERA` e
`apps/campo/app.config.ts#TEXTO_LOCALIZACAO`, e, desde a foto de perfil,
`NSPhotoLibraryUsageDescription` com o texto de
`apps/campo/app.config.ts#TEXTO_GALERIA` (seção 1.1: o seletor do sistema não
pede a biblioteca inteira, mas a Apple exige a chave quando ele é usado).

---

## 6. O que mudou em relação à declaração anterior, e por quê

Para quem submeter saber que isto não é retoque de texto.

### 6.1 A resposta sobre compartilhamento com terceiros mudou de "não" para "sim"

`../apps/campo/LOJAS.md`, no passo 5 da Play Store, trazia a linha "Dados são
compartilhados com terceiros? Não". Era verdade quando foi escrita, e deixou de
ser no turno T7: a notificação passou a falar direto com a **APNs (Apple)** e com
a **FCM (Google)**, cada uma recebendo a ficha do aparelho e o dado da mensagem
para conseguir entregar. As duas estão nomeadas em `SUBPROCESSADORES.md`, seção
1, com os servidores nos Estados Unidos, e a transferência internacional está
tratada na seção 2.3 daquele documento.

O que **não** mudou, e vale dizer no formulário: o que sai do país continua sendo
o mínimo. Nome, contato, endereço, protocolo, relato, fotografia, assinatura e
descrição de vulnerabilidade **não** entram na notificação, e há trava de tempo
de execução que faz o envio falhar se entrarem
(`apps/api/src/push/mensagem.ts#VitrineIndiscreta`).

### 6.2 Passou a existir uma categoria de identificador de aparelho

A ficha de push é um identificador de aparelho conhecido pela Apple e pelo
Google. Antes do T7 ela não existia, e nenhuma das duas tabelas a trazia.

### 6.3 Passou a existir uma categoria de dado sensível declarada

A descrição de vulnerabilidade social já descia para o aparelho antes do T7, mas
nenhuma versão da declaração de loja a reconhecia. Este documento a declara em
"Sensitive Info" (Apple) e em "Informações de saúde" (Google). Não é mudança de
código, é correção de uma omissão da declaração.

### 6.4 O binário parou de declarar permissão que o aplicativo não usa

Sete declarações saíram do binário nesta entrega, e todas eram herança de
plugin, nunca decisão de alguém. Antes desta correção, o Info.plist gerado
trazia:

- `NSLocationAlwaysAndWhenInUseUsageDescription` e
  `NSLocationAlwaysUsageDescription`, esta última com o texto padrão em inglês.
  O aplicativo nunca pede autorização permanente de localização. Chave de
  "Always" no binário é o que faz a Apple tratar o aplicativo como candidato a
  segundo plano;
- `NSMotionUsageDescription`, em inglês, para sensor de movimento que nenhum
  código lê;
- `NSMicrophoneUsageDescription`, em inglês, num aplicativo que não grava som;
- `NSFaceIDUsageDescription`, em inglês, prometendo leitura de biometria. O
  cofre é usado só com `apps/campo/src/dados/sessao.tsx#keychainAccessible`,
  nunca com `requireAuthentication` (`apps/campo/src/dados/sessao.tsx#!requireAuthentication`);
- `NSPhotoLibraryAddUsageDescription`, em português, prometendo salvar a foto na
  galeria do aparelho. O aplicativo copia a foto para o diretório privado dele
  (`apps/campo/src/dados/evidencia-no-disco.ts#guardarFotoNoAparelho`) e não
  existe `expo-media-library` no projeto (`apps/campo/package.json#!expo-media-library`).

E o manifesto do Android pedia `READ_EXTERNAL_STORAGE`,
`WRITE_EXTERNAL_STORAGE` (do `expo-file-system`) e `SYSTEM_ALERT_WINDOW` (do
modelo base do Expo), embora o comentário do próprio `app.config.ts` afirmasse
que armazenamento externo não era pedido.

Duas consequências, e as duas importam para a submissão: o revisor lia texto em
inglês numa ficha em português, e o binário declarava capacidade que o formulário
diz não existir. Divergência entre binário e formulário é motivo de recusa nas
duas lojas.

### 6.5 O texto de câmera que ninguém lia

`app.config.ts` tinha dois textos de câmera: um longo em `ios.infoPlist` e um
curto na opção do plugin `expo-camera`. A opção do plugin sempre ganha (ver
`applyPermissions`, em `@expo/config-plugins`), então o texto longo nunca chegou
ao binário. Agora existe uma constante só, usada nos dois lugares
(`apps/campo/app.config.ts#TEXTO_CAMERA`).

### 6.6 O despacho passou a tocar em toda severidade, com som próprio (15/09/2026)

Até esta data o aviso só tocava para severidade alta e crítica, inclusive na
tarefa nova. A decisão, na letra de quem paga: o celular do agente deve
obrigatoriamente ser notificado, vibrado ou sonoro, de que recebeu uma nova
ocorrência, com som característico. O argumento anterior (um aviso de baixa
severidade tocando de madrugada ensina a calar o aplicativo inteiro) continua
valendo para o **prazo**, que é relógio, e deixou de valer para o **despacho**,
que é uma pessoa decidindo agora que a equipe vai. O raciocínio inteiro está em
`apps/campo/src/push/canais.ts`.

O que muda no binário e na declaração:

- **Um arquivo de som embarcado**, `apps/campo/assets/sons/despacho.wav` (PCM 16
  bits, 44,1 kHz, mono, 1,2 s), gerado por `scripts/gerar-som-de-despacho.mjs` e
  declarado ao plugin do `expo-notifications` em `app.config.ts` (`sounds`). O
  aplicativo **toca** som; continua **não gravando** som, e `RECORD_AUDIO` continua
  bloqueado (seção 5).
- **Um canal novo no Android**, `dc360.despacho.v1`, com o som acima, vibração
  explícita e importância máxima. Os dois canais anteriores continuam, agora só
  para o aviso de prazo. `bypassDnd` não é ligado pelo aplicativo: furar o "Não
  perturbe" é escolha da pessoa nos ajustes do canal.
- **Um direito novo no iOS**, `com.apple.developer.usernotifications.time-sensitive`
  (`app.config.ts`, `ios.entitlements`), exigido pelo `interruption-level:
  time-sensitive` que o servidor manda no despacho. Não é o alerta crítico (que
  fura o modo silencioso e exige aprovação caso a caso da Apple); esse continua
  fora.
- **Um aviso local**: com o aplicativo aberto, a atualização periódica da lista
  descobre a ocorrência despachada e mostra a mesma notificação, com o mesmo
  texto genérico, o mesmo som e o mesmo canal, mais o retorno tátil. Nenhum dado
  novo sai do aparelho por causa disso: o aviso local não vai à rede.

O aviso de despacho sai do **servidor** no momento do despacho: `POST
/ocorrencias/:id/despacho` enfileira uma linha `tarefa_nova` por aparelho vivo da
equipe, na mesma transação que grava o despacho, e a varredura de avisos (a mesma
do prazo, a cada cinco minutos) a envia à APNs e ao FCM (migração 042).

O que **não** muda: a vitrine continua genérica ("Nova tarefa", sem protocolo e
sem endereço), com a mesma trava de tempo de execução dos dois lados
(`apps/api/src/push/mensagem.ts` e `apps/campo/src/push/aviso-local.ts`), e o
dado da mensagem continua sendo `tipo`, `organizacaoId`, `ocorrenciaId`,
`severidade` e `prazoEm`.

---

## 7. O que ainda trava a submissão

Nomeado, para não virar surpresa no dia do envio.

1. **A política de privacidade não está publicada, e as duas lojas exigem uma
   URL pública.** `PRIVACIDADE.md` ainda tem campos `[[assim]]`: razão social,
   CNPJ, endereço, nome e contato do encarregado, endereço definitivo de
   publicação, e os prazos de retenção que o município fixa. Enquanto houver um
   `[[ ]]`, o documento não vai para o ar, e sem ele nenhuma das duas lojas
   aceita a submissão. É o item de caminho crítico deste bloco.
2. **`SUBPROCESSADORES.md` também tem `[[ ]]`**: os prazos da cláusula de
   operador e a revisão por advogado. O provedor de email já está nomeado lá
   (Resend, escolhido e ainda não ligado). Ele não é exigido pelas lojas, mas é
   o documento que sustenta a resposta de compartilhamento dada aqui, e o
   município lê os dois.
3. **A conta de demonstração para a revisão da Apple não existe.** Se o caminho
   escolhido for a App Store pública, a Apple exige usuário e senha que
   funcionem, num município de demonstração com pelo menos uma ocorrência
   despachada. Ver `../apps/campo/LOJAS.md`, "Conta de revisão".
4. **O endereço de produção do servidor está apontado, o de homologação não.**
   O perfil `producao` de `apps/campo/eas.json#DC360_API_URL` aponta para
   `https://defesa-civil.fly.dev`, que é a API de verdade no Fly; o perfil
   `homologacao` continua em `api-homologacao.exemplo.gov.br`, e os
   identificadores de submissão da Apple (`appleId`, `ascAppId`, `appleTeamId`)
   continuam como `PREENCHER`. Binário de loja sai do perfil `producao`, então
   isto deixou de travar a submissão; o que trava é o item 5.
5. **Os identificadores de conta não existem**: número D-U-N-S da Apple e
   verificação de identidade da Google, os dois de prazo longo. Ver
   `../apps/campo/LOJAS.md`.
6. **A notificação nunca chegou à tela de um aparelho registrado**, e é isto,
   e não mais que isto, que fica sem prova. Em 13/09/2026 as credenciais
   falaram com a Apple e com o Google DE VERDADE (`scripts/conferir-push.mjs`):
   com uma ficha de aparelho deliberadamente falsa, a APNs respondeu
   `BadDeviceToken` nos dois ambientes e a FCM respondeu `UNREGISTERED`, que é
   a resposta de quem aceitou a credencial, conferiu time, tópico e projeto, e
   não achou o aparelho. Os cabeçalhos de `apps/api/src/push/apns.ts#transporteApnsHttp2`
   e `apps/api/src/push/fcm.ts#criarProvedorFcm` registram isso desde então. O
   que exige um telefone na mão continua por fazer: a permissão de notificação,
   a câmera e o GPS se comportando num aparelho como este documento descreve.
   Isso não impede submeter: as afirmações daqui são sobre o que o código pede e
   envia, que é o que o formulário pergunta. O som de despacho (seção 6.6) está
   na mesma situação: o arquivo está na régua das duas lojas e o cabeçalho é
   conferido por portão, mas ele nunca tocou num aparelho, e só chega ao
   binário depois de `npx expo prebuild`.
7. **A decisão sobre a assinatura como dado biométrico** (seção 3) continua
   aberta e depende do encarregado de dados.

---

## 8. Divergências encontradas nos documentos que já existiam

Este documento foi escrito lendo o código, e três coisas não bateram com o que
estava escrito antes. Nenhuma foi corrigida aqui, porque mexer em política de
privacidade e em lista de subprocessadores é decisão de quem responde por elas.

1. **`SUBPROCESSADORES.md`, seção 2.1, diz que o detalhe "viaja no corpo cifrado
   da mensagem e só é lido pelo aplicativo".** A frase induz a entender que a
   Apple e o Google não conseguem lê-lo, e não é isso que acontece: o dado da
   mensagem trafega cifrado até o servidor da loja, e ali é legível para ela,
   exatamente como o cabeçalho de `apps/api/src/push/mensagem.ts#VITRINE`
   descreve. O parágrafo seguinte da própria seção 2.1 já diz a coisa certa
   ("o dado da mensagem também atravessa a fronteira"), então a correção é de
   redação: trocar "corpo cifrado" por "corpo da mensagem, cifrado em trânsito e
   legível para o servidor da loja".
2. **`PRIVACIDADE.md`, seção 2.4, afirma que não há acesso a microfone nem a
   biblioteca de fotos.** A intenção sempre foi essa e o código sempre foi
   assim, mas até esta entrega o binário gerado declarava as duas chaves, por
   herança de plugin (seção 6.4). A afirmação passou a ser verdadeira também no
   binário, e não só no código.
3. **`PRIVACIDADE.md`, seção 2.1, restrição 1, diz que a descrição de
   vulnerabilidade social não aparece em nenhuma lista.** Na tela isso é
   cumprido: a lista de tarefas do aplicativo mostra apenas o aviso
   "Vulnerabilidade social" sem a descrição
   (`apps/campo/src/app/(agente)/index.tsx#vulnerabilidade_presente`, e
   `apps/campo/src/app/(agente)/index.tsx#!vulnerabilidade_descricao`). O que a
   frase não cobre é que a descrição **desce e fica guardada no aparelho** para
   todas as ocorrências da equipe, e não só para a que o agente abrir
   (`apps/api/src/rotas/sincronizacao.ts#vulnerabilidade_descricao`, e a tabela
   `apps/campo/src/dados/banco-local.ts#pendencias`). É consequência de o aplicativo
   trabalhar sem sinal, é apagada no logout, e está declarada nas duas tabelas
   deste documento. Vale acrescentar essa frase à seção 2.1, para o município
   não descobrir isso numa conferência.

---

## 9. Como manter isto honesto

Vale aqui a mesma regra de `SUBPROCESSADORES.md`, seção 4, e pelo mesmo motivo:
declaração de loja desatualizada é declaração falsa.

1. **Permissão nova no binário, ou dado novo saindo do aparelho, muda este
   documento no mesmo commit.** Se a mudança acrescenta um destino fora do
   fornecedor, ela muda `SUBPROCESSADORES.md` junto.
2. **Antes de cada envio, confira o binário contra a tabela da seção 5**, com
   `npx expo config --type introspect` na pasta `apps/campo`, sem as pastas
   `android/` e `ios/` presentes. Elas são geradas e ficam fora do git de
   propósito, e uma cópia velha delas mascara exatamente a divergência que este
   documento existe para impedir.
3. **Nenhuma célula das tabelas 3 e 4 muda sem a linha de código que a
   sustenta.** Se a evidência não existir, a resposta certa é procurar no
   código, e não escolher a opção que parece melhor no formulário.
