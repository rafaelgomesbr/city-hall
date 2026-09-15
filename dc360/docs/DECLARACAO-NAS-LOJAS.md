# Declaração de dados nas lojas de aplicativo

- **Versão:** 2, de 15/09/2026 (a 1 é de 09/09/2026; a 2 acrescenta a leitura da última posição conhecida pelas telas de tarefas e de mapa, e o caminho por ruas a pedido do agente)
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
arquivo e a linha do código que a sustenta. Se uma afirmação não tiver essa
âncora, ela não pode ser copiada para o formulário: quem submete assina.

---

## 1. O levantamento, lido do código

### 1.1 O que o aplicativo pede ao sistema operacional

| Recurso | Onde é pedido | Quando |
| --- | --- | --- |
| Câmera | `apps/campo/src/app/(agente)/vistoria/[id].tsx`, `fotografar()` | Quando o agente abre a câmera dentro da vistoria |
| Localização, primeiro plano | mesmo arquivo, `capturarGps()`, linha 326 (`requestForegroundPermissionsAsync`) | Quando o agente toca em capturar a coordenada |
| Localização, última posição conhecida (sem pedir permissão e sem ligar o GPS) | `apps/campo/src/app/(agente)/mapa.tsx`, `verOndeEstou()`, linhas 359 a 361, e `apps/campo/src/app/(agente)/index.tsx`, linhas 316 a 318 (`getForegroundPermissionsAsync` seguido de `getLastKnownPositionAsync`) | Ao abrir a tela do mapa ou a de tarefas, só se a permissão já foi concedida na vistoria. Lê a posição que o sistema já tinha; não pede permissão e não liga o rádio |
| Notificação | `apps/campo/src/push/permissao.ts`, `proximoPasso`, linhas 57 a 87 | Nunca antes do primeiro login, e uma vez só |
| Câmera (da frente), para a foto de perfil | `apps/campo/src/dados/foto-do-agente.ts`, `escolherFoto("camera")` | Quando o agente toca em "Tirar foto agora" no Perfil. Mesma permissão e mesmo texto da câmera da vistoria |
| Seletor de fotos do sistema, para a foto de perfil (desde 15/09/2026) | `apps/campo/src/dados/foto-do-agente.ts`, `escolherFoto("galeria")` | Quando o agente toca em "Escolher da galeria" no Perfil. **Não pede permissão de biblioteca**: o seletor abre fora do processo (Photo Picker no Android, seletor do sistema no iOS) e só a imagem tocada chega ao aplicativo. O binário declara `NSPhotoLibraryUsageDescription`, em português, porque a Apple exige a chave quando o seletor é usado |

Não há pedido de contatos, agenda, microfone, telefone, armazenamento
compartilhado nem localização em segundo plano, e não há pedido de acesso à
biblioteca de fotos inteira: a foto de perfil entra pelo seletor do sistema,
uma imagem por vez, e `READ_EXTERNAL_STORAGE` continua bloqueado no manifesto.
As chaves que o binário declarava por herança dos plugins foram removidas nesta
mesma entrega (seção 5).

### 1.2 O que fica guardado no aparelho, e onde

| Dado | Onde fica | Evidência |
| --- | --- | --- |
| Token de sessão e de renovação | Cofre do sistema (Keychain no iOS, Keystore no Android) | `apps/campo/src/dados/sessao.tsx`, linhas 25, 26 e 62 |
| Identidade do agente (nome, matrícula, papel, município) | Mesmo cofre | `apps/campo/src/dados/sessao.tsx`, linha 26; formato em `dados/api.ts`, linhas 161 a 181 |
| Ficha de push deste aparelho | Mesmo cofre | `apps/campo/src/push/ficha-do-aparelho.ts`, linhas 26 a 34 |
| Ocorrências despachadas para a equipe, com nome e contato do solicitante, endereço, coordenada, relato e descrição de vulnerabilidade social | Banco SQLite privado do aplicativo, tabela `pendencias` | Esquema em `apps/campo/src/dados/banco-local.ts`, linhas 118 a 122; conteúdo em `dados/api.ts`, linhas 295 a 313 |
| Rascunho da vistoria: checklist, coordenada, precisão do GPS, contagem de pessoas atingidas, nome de quem assina, observações | Mesmo banco, tabela `rascunhos` | `apps/campo/src/dados/banco-local.ts`, linhas 113 a 117; formato em `dados/rascunho.ts`, linhas 24 a 67 |
| Fotografias da vistoria | Diretório privado do aplicativo, como `foto-<carimbo>-<ordem>.jpg` | `apps/campo/src/dados/evidencia-no-disco.ts`, linha 36 |
| Traço da assinatura | Mesmo diretório, como `assinatura-<carimbo>.png` | `apps/campo/src/ui/Assinatura.tsx`, linha 208 |
| Fila de envio, com a coleta inteira até subir | Mesmo banco, tabela `fila_sincronizacao` | `packages/campo/src/deposito-sqlite.ts`, linhas 47 a 62 |

Três fatos que a declaração precisa refletir, e que decidem respostas do
formulário:

1. **Nada disso é cópia de nuvem do fabricante.** O backup automático do Android
   está desligado (`apps/campo/app.config.ts`, `allowBackup: false`, linha 212),
   e o cofre é gravado com `WHEN_UNLOCKED_THIS_DEVICE_ONLY`
   (`dados/sessao.tsx`, linha 62), que não sai deste aparelho.
2. **Sair da conta apaga o dado do cidadão do aparelho.**
   `apagarDadosLocais()` zera `rascunhos`, `pendencias`, `marcas` e `coletas` e
   remove os arquivos de prova que nenhuma coleta da fila ainda referencia
   (`apps/campo/src/dados/banco-local.ts`, linhas 184 a 251). Isso é o que
   permite responder "sim" à pergunta sobre exclusão de dados no aparelho.
3. **A fila NÃO é apagada no logout, de propósito** (mesmo arquivo, comentário
   das linhas 194 a 211): ela guarda vistoria já feita e ainda não entregue, e
   apagá-la destruiria prova de ato administrativo. Cada item carrega o carimbo
   de quem coletou, e o envio só ocorre para o autor.

### 1.3 O que sai do aparelho para o servidor do município

Tudo por HTTPS, sem exceção de transporte no iOS
(`apps/campo/app.config.ts`, `NSAllowsArbitraryLoads: false`, linha 117). O
servidor é o do fornecedor, operando em nome do município: os provedores estão
nomeados em `SUBPROCESSADORES.md`, seção 1, e ficam no Brasil.

Sai: email e senha na entrada (`dados/api.ts`, linhas 191 a 199), a ficha de
push com a plataforma (`dados/api.ts`, linhas 264 a 275), e a coleta da vistoria
inteira, com fotografias e assinatura.

### 1.4 O que sai do país, e é isto que muda a declaração

O aviso de push viaja por servidor da Apple ou do Google. Duas partes, e elas
têm regimes diferentes:

| Parte da mensagem | Conteúdo | Evidência |
| --- | --- | --- |
| **Vitrine** (o que fica legível na tela bloqueada) | Texto fixo, sem interpolação: "Nova tarefa" ou "Prazo vencendo", mais uma frase mandando abrir o aplicativo | `apps/api/src/push/mensagem.ts`, linhas 55 a 64 |
| **Dado da mensagem** (lido pelo aplicativo) | `tipo`, `organizacaoId`, `ocorrenciaId`, e quando existirem `severidade` e `prazoEm` | `apps/api/src/push/mensagem.ts`, linhas 74 a 99 |
| **Ficha do aparelho** | O identificador que a Apple ou o Google usa para entregar | `apps/campo/src/push/PortaExpo.ts`, linhas 141 a 154; guardado no servidor em `db/migrations/016_aparelho_e_aviso_de_prazo.sql`, linhas 78 a 101 |

**Protocolo, endereço, nome e contato do cidadão NÃO entram na notificação**, e
isso não é disciplina de quem escreve texto: há uma trava de tempo de execução
que faz o envio falhar se algum campo do dado aparecer no texto visível
(`apps/api/src/push/mensagem.ts`, linhas 116 a 127).

**A ficha é obtida do sistema operacional, e não do serviço da Expo.**
`getDevicePushTokenAsync`, com o motivo escrito no próprio código
(`apps/campo/src/push/PortaExpo.ts`, linhas 141 a 154): usar
`getExpoPushTokenAsync` acrescentaria um subprocessador que não está em
`SUBPROCESSADORES.md`.

**No Android, a biblioteca do Firebase (FCM) mantém identificadores próprios do
aparelho e do aplicativo com o Google**, além da ficha. O projeto está declarado
em `apps/campo/google-services.json` e ligado por
`apps/campo/app.config.ts`, linha 138. É por isso que a categoria de
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
  falha. As dependências estão em `apps/campo/package.json`, linhas 17 a 44, e
  não há nenhuma dessas.
- Sem identificador de propaganda, sem rastreamento entre aplicativos, sem
  cruzamento com dado de outra empresa.
- Sem microfone: `recordAudioAndroid: false` e a permissão bloqueada
  (`apps/campo/app.config.ts`, linhas 169 a 175 e 254).
- Sem localização em segundo plano: `isAndroidBackgroundLocationEnabled: false`
  e nenhuma tarefa de fundo no código.

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

O que sustenta cada pedaço. O GPS, em `apps/campo/src/app/(agente)/vistoria/[id].tsx`,
função `capturarGps()`:

| Afirmação | Evidência |
| --- | --- |
| Primeiro plano, e só | Linha 326: `Location.requestForegroundPermissionsAsync()`. Não existe chamada a `requestBackgroundPermissionsAsync` nem a `watchPositionAsync` em lugar nenhum do aplicativo |
| Precisa, e não aproximada | Linha 337: `accuracy: Location.Accuracy.High`. O comentário ao lado diz o porquê: coordenada de cem metros não identifica qual casa do morro, e o laudo técnico precisa dessa distinção. No Android, `ACCESS_FINE_LOCATION` está declarada (`app.config.ts`, linha 164) |
| Uma leitura por toque, sem rastro | `getCurrentPositionAsync` numa função disparada pelo botão. Não há assinatura de posição contínua |
| Serve ao laudo | Linhas 339 a 347: a coordenada é gravada no rascunho com seis casas decimais, junto com a precisão em metros que o aparelho informou |
| A vistoria funciona sem ela | Linhas 327 a 332: permissão negada não trava a vistoria, mostra uma frase explicando o que se perde |

A última posição conhecida, nas telas de tarefas e de mapa:

| Afirmação | Evidência |
| --- | --- |
| Não pede permissão | `apps/campo/src/app/(agente)/mapa.tsx`, linha 359, e `index.tsx`, linha 316: `getForegroundPermissionsAsync()` só CONSULTA; se não foi concedida na vistoria, a função retorna sem ler nada. `mapa-tela-dedicada.test.tsx` prova que `requestForegroundPermissionsAsync` não é chamada pela tela do mapa |
| Não liga o GPS | Linha 361 (`mapa.tsx`) e 318 (`index.tsx`): `getLastKnownPositionAsync()`, que devolve o que o sistema já tinha, sem ligar o rádio. Nula é o caso comum, e a tela diz "sem distância" em vez de estimar |
| Só com a tela aberta | A leitura está dentro de `useFocusEffect`: acontece ao entrar na tela, e não a cada quadro nem em segundo plano |
| Não é gravada | A posição fica em estado de tela (`useState`) e serve para a distância e o rumo em linha reta. Não entra no rascunho, no laudo nem no banco local |
| Vai ao mapa do Google quando o município autorizou | `MapaDoImovel`, `showsUserLocation`: o SDK do Google desenha o ponto do agente, e por isso a posição chega ao Google enquanto o mapa está aberto. Declarado em `SUBPROCESSADORES.md`, seção 2.2, e ausente no modo esquemático |

O caminho por ruas, a pedido:

| Afirmação | Evidência |
| --- | --- |
| Só no toque | `apps/campo/src/app/(agente)/mapa.tsx`, botão "Ver o caminho" (`onPress` na linha 302): é o único chamador de `verOCaminho` (`dados/rota.ts`, linha 328). `mapa-tela-dedicada.test.tsx` prova que abrir a tela não pede caminho nenhum |
| Passa pelo servidor do município, nunca direto ao Google | `dados/rota.ts`, `pedirCaminho()`: `POST /rota` na API do produto. `scripts/portao-do-mapa-do-aplicativo.test.mjs` reprova `routes.googleapis.com` em qualquer arquivo do aplicativo |
| O servidor não guarda | `apps/api/src/rotas/rota.ts`: nenhuma escrita no banco, nenhum log com coordenada; `apps/api/test/rota.test.ts` lê o log e o esquema do banco para provar. A posição sai arredondada a três casas decimais |
| No aparelho, some no logout | `dados/rota.ts`, tabela `marcas` do banco local, que `apagarDadosLocais()` esvazia; `dados/rota.test.ts` prova |

**Nas duas lojas, portanto: localização precisa, sim; localização aproximada,
sim** (o Android concede as duas juntas quando `ACCESS_FINE_LOCATION` é
concedida, e `ACCESS_COARSE_LOCATION` está declarada em `app.config.ts`, linha
165); **localização em segundo plano, não.** Responder "segundo plano" faz a
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
| User Content | Photos or Videos | Sim | Funcionalidade do app | Sim | Não |
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

- **Email Address**: é o que a tela de entrada envia (`dados/api.ts`, linhas 191
  a 199).
- **Name**: o do agente, que vem no login e é gravado no cofre
  (`dados/api.ts`, linhas 203 a 211); e o do solicitante e o de quem assina a
  ciência, que descem para o aparelho e voltam na coleta (`dados/api.ts`, linha
  306; `dados/rascunho.ts`, linha 47).
- **Phone Number**: o contato do solicitante, em `solicitante_contato`
  (`dados/api.ts`, linha 307).
- **Physical Address**: o endereço do imóvel vistoriado (`dados/api.ts`, linha
  300).
- **Precise Location**: seção 2 acima.
- **Photos or Videos**: as fotografias da vistoria (só fotos, nunca vídeo:
  `takePictureAsync` é a única captura no código).
- **Other User Content**: o traço da assinatura, as observações do agente e as
  respostas do checklist técnico (`dados/rascunho.ts`, linhas 29, 49 e 50).
- **User ID**: `usuarioId` e matrícula do agente (`dados/api.ts`, linhas 162 a
  165).
- **Device ID**: a ficha de push, que a Apple e o Google conhecem por
  definição (`push/PortaExpo.ts`, linhas 141 a 154).
- **Sensitive Info**: a descrição de vulnerabilidade social desce para o
  aparelho e é exibida na tela da vistoria (`dados/api.ts`, linha 309;
  `app/(agente)/vistoria/[id].tsx`, linhas 1055 a 1058). Ela pode revelar
  deficiência, gestação ou condição de saúde, e `PRIVACIDADE.md`, seção 2.1, já
  a trata como dado sensível na acepção da Lei 13.709/2018. Marcar "não" aqui
  seria a mesma classe de erro que este documento veio corrigir.

**Ponto que precisa de decisão humana, e não de palpite:** se o traço da
assinatura de próprio punho deve ser declarado também como dado biométrico
dentro de "Sensitive Info". A assinatura é gravada como imagem
(`ui/Assinatura.tsx`, linha 208) e serve como prova de ciência do ato, não como
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

Todas as linhas: **cifrado em trânsito, sim** (HTTPS obrigatório, `app.config.ts`
linha 117; o transporte com a APNs e com a FCM é HTTP/2 sobre TLS,
`apps/api/src/push/apns.ts` e `apps/api/src/push/fcm.ts`).

| Tipo de dado (categoria da Google) | Coletado | Compartilhado | Obrigatório | Finalidade | Pode ser apagado |
| --- | --- | --- | --- | --- | --- |
| Informações pessoais > Nome | Sim | Não | Obrigatório | Funcionalidade do app | Sim, pelo município |
| Informações pessoais > Endereço de email | Sim | Não | Obrigatório | Funcionalidade do app, gerenciamento da conta | Sim, pelo município |
| Informações pessoais > Número de telefone | Sim | Não | Obrigatório | Funcionalidade do app | Sim, pelo município |
| Informações pessoais > Endereço | Sim | Não | Obrigatório | Funcionalidade do app | Não, ver observação |
| Informações pessoais > Outras informações | Sim | Não | Obrigatório | Funcionalidade do app | Sim, pelo município |
| Local > Localização precisa | Sim | **Sim**, ver observação | Opcional | Funcionalidade do app | Não, ver observação |
| Local > Localização aproximada | Sim | **Sim**, ver observação | Opcional | Funcionalidade do app | Não, ver observação |
| Fotos e vídeos > Fotos | Sim | Não | Obrigatório | Funcionalidade do app | Não, ver observação |
| Arquivos e documentos | Sim | Não | Obrigatório | Funcionalidade do app | Não, ver observação |
| Saúde e fitness > Informações de saúde | Sim | Não | Opcional | Funcionalidade do app | Sim, pelo município |
| IDs do dispositivo | Sim | **Sim** | Opcional | Funcionalidade do app | Sim, ao sair da conta |
| Atividade no app > Outras ações | Sim | **Sim** | Opcional | Funcionalidade do app | Sim, ao sair da conta |
| Registros de falhas, diagnóstico, desempenho | Não | | | | |
| Histórico de navegação, de pesquisa, contatos, agenda, SMS, áudio, informações financeiras | Não | | | | |

Observações que precisam ir junto, e que a Google aceita no campo de texto:

- **"Outras informações"** é o relato do chamado, o ponto de referência, as
  observações do agente e o checklist técnico (`dados/api.ts`, linhas 302 e 305;
  `dados/rascunho.ts`, linhas 29 e 50).
- **"Arquivos e documentos"** é o traço da assinatura, gravado como PNG
  (`ui/Assinatura.tsx`, linha 208).
- **"Informações de saúde"** é a descrição de vulnerabilidade social, pela mesma
  razão da linha "Sensitive Info" da Apple. É opcional porque a ocorrência pode
  não ter nenhuma.
- **"Localização" é opcional** porque a vistoria pode ser concluída sem a
  coordenada quando a permissão é negada
  (`app/(agente)/vistoria/[id].tsx`, linhas 327 a 332).
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
  (`dados/sessao.tsx`, linhas 159 a 202; `apps/api/src/rotas/aparelhos.ts`,
  linhas 162 a 180), e apaga a cópia local
  (`push/ficha-do-aparelho.ts`, linhas 47 a 49).

**A pergunta sobre criptografia em repouso**, quando aparecer: o dado no
aparelho fica no diretório privado do aplicativo, protegido pela criptografia do
próprio sistema operacional; token, identidade e ficha ficam no Keychain ou no
Keystore (`dados/sessao.tsx`, linha 62). O banco SQLite local **não** tem
criptografia adicional própria, e essa é a resposta honesta.

---

## 5. Permissões que o binário declara, e o que dizer sobre cada uma

A Play Store mostra esta lista para quem vai instalar, e o revisor da Apple lê a
equivalente. Ela é a soma do que `app.config.ts` pede com o que cada biblioteca
declara sozinha. Conferida com `npx expo config --type introspect`, com a pasta
`android/` ausente.

| Permissão | De onde vem | Por que existe |
| --- | --- | --- |
| `INTERNET` | `app.config.ts`, linha 166 | Falar com o servidor do município |
| `ACCESS_NETWORK_STATE` | `app.config.ts`, linha 167 | Saber se há sinal, para a fila decidir quando enviar |
| `CAMERA` | `app.config.ts`, linha 163 | Fotografar o imóvel na vistoria |
| `ACCESS_FINE_LOCATION` | `app.config.ts`, linha 164 | Coordenada da vistoria |
| `ACCESS_COARSE_LOCATION` | `app.config.ts`, linha 165 | Concedida junto com a acima |
| `POST_NOTIFICATIONS` | `expo-notifications` | Aviso de tarefa nova e de prazo vencendo |
| `RECEIVE_BOOT_COMPLETED` | `expo-notifications` | Restaurar aviso agendado depois de o aparelho reiniciar. É comportamento da biblioteca, declarado no `AndroidManifest.xml` dela |
| `VIBRATE` | modelo base do Expo | O canal de urgência vibra (`push/PortaExpo.ts`, linha 128) |

E as que foram **bloqueadas nesta entrega**, com o motivo, em
`app.config.ts`, linhas 169 a 209:

| Permissão bloqueada | Quem pedia | Por que sai |
| --- | --- | --- |
| `RECORD_AUDIO` | `expo-camera` | O aplicativo não grava som |
| `READ_EXTERNAL_STORAGE` | `expo-file-system` | Tudo é gravado no diretório privado do aplicativo (`Paths.document`) |
| `WRITE_EXTERNAL_STORAGE` | `expo-file-system` | Idem |
| `SYSTEM_ALERT_WINDOW` | modelo base do Expo | Nenhuma tela desenha por cima de outro aplicativo |

No iOS, o Info.plist gerado passa a ter **exatamente duas** chaves de uso:
`NSCameraUsageDescription` e `NSLocationWhenInUseUsageDescription`, com os
textos de `app.config.ts`, linhas 39 a 48.

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
(`apps/api/src/push/mensagem.ts`, linhas 116 a 127).

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
  cofre é usado só com `keychainAccessible`, nunca com `requireAuthentication`
  (`dados/sessao.tsx`, linha 62);
- `NSPhotoLibraryAddUsageDescription`, em português, prometendo salvar a foto na
  galeria do aparelho. O aplicativo copia a foto para o diretório privado dele
  (`dados/evidencia-no-disco.ts`, linha 36) e não existe `expo-media-library` no
  projeto.

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
(`app.config.ts`, linhas 39 a 48).

---

## 7. O que ainda trava a submissão

Nomeado, para não virar surpresa no dia do envio.

1. **A política de privacidade não está publicada, e as duas lojas exigem uma
   URL pública.** `PRIVACIDADE.md` ainda tem campos `[[assim]]`: razão social,
   CNPJ, endereço, nome e contato do encarregado, endereço definitivo de
   publicação, e os prazos de retenção que o município fixa. Enquanto houver um
   `[[ ]]`, o documento não vai para o ar, e sem ele nenhuma das duas lojas
   aceita a submissão. É o item de caminho crítico deste bloco.
2. **`SUBPROCESSADORES.md` também tem `[[ ]]`**: o provedor de email e os prazos
   da cláusula de operador. Ele não é exigido pelas lojas, mas é o documento que
   sustenta a resposta de compartilhamento dada aqui, e o município lê os dois.
3. **A conta de demonstração para a revisão da Apple não existe.** Se o caminho
   escolhido for a App Store pública, a Apple exige usuário e senha que
   funcionem, num município de demonstração com pelo menos uma ocorrência
   despachada. Ver `../apps/campo/LOJAS.md`, "Conta de revisão".
4. **O endereço de produção do servidor ainda é de exemplo** em `eas.json`
   (`api.exemplo.gov.br`). Binário publicado apontando para lá é binário que não
   funciona.
5. **Os identificadores de conta não existem**: número D-U-N-S da Apple e
   verificação de identidade da Google, os dois de prazo longo. Ver
   `../apps/campo/LOJAS.md`.
6. **O aplicativo nunca rodou em aparelho**, e a notificação nunca foi entregue
   de verdade por nenhuma das duas lojas (`apps/api/src/push/fcm.ts` diz isso no
   cabeçalho). Isso não impede submeter, mas impede afirmar que a permissão de
   notificação, a câmera e o GPS se comportam como este documento descreve. As
   afirmações daqui são sobre o que o código pede e envia, que é o que o
   formulário pergunta.
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
   exatamente como o cabeçalho de `apps/api/src/push/mensagem.ts`, linhas 6 a
   16, descreve. O parágrafo seguinte da própria seção 2.1 já diz a coisa certa
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
   (`app/(agente)/index.tsx`, linhas 362 a 366). O que a frase não cobre é que a
   descrição **desce e fica guardada no aparelho** para todas as ocorrências da
   equipe, e não só para a que o agente abrir
   (`apps/api/src/rotas/sincronizacao.ts`, linha 655, e a tabela `pendencias` em
   `dados/banco-local.ts`, linhas 118 a 122). É consequência de o aplicativo
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
