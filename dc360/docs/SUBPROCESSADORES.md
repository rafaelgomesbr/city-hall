# Subprocessadores e cláusula de operador

- **Versão:** 3, de 15/09/2026 (a 1 é de 09/09/2026; a 2, de 14/09/2026, acrescenta o mapa dentro do aplicativo de campo; a 3 acrescenta o caminho por ruas a pedido do agente, e corrige a seção 2.4 para as chaves por plataforma)
- **Companheiro de:** `PRIVACIDADE.md`

Um contrato de operador que diz "podemos usar subcontratados" sem nomear
ninguém é uma cláusula vazia: o município não tem como avaliar risco que ele não
consegue enxergar. Este documento nomeia cada empresa que toca dado do
município, o que ela toca, e onde.

> Os campos `[[assim]]` dependem de decisão do Rafa e não podem ser inventados.

---

## 1. Lista nominal

Estado em 09/09/2026, com o produto no piloto de Florianópolis.

| Empresa | O que faz | Que dado alcança | Onde ficam os servidores |
| --- | --- | --- | --- |
| **Supabase** | Banco de dados PostgreSQL | **Todos** os dados do sistema | São Paulo, Brasil (`sa-east-1`) |
| **Supabase Storage** | Armazenamento das fotografias e assinaturas | Fotografia de imóvel, traço de assinatura | São Paulo, Brasil |
| **Fly.io** | Servidor da API | Todos, em trânsito e em memória durante o processamento | São Paulo, Brasil (`gru`) |
| **Vercel** | Entrega do painel do coordenador | **Nenhum.** Serve arquivo estático; o dado vai do navegador direto à API | Rede de distribuição global |
| **Apple (APNs)** | Notificação no iPhone | Identificador do aparelho, o texto genérico, e os identificadores de município e de ocorrência mais a severidade | Estados Unidos |
| **Google (Firebase Cloud Messaging)** | Notificação no Android | O mesmo do acima | Estados Unidos |
| **Google (Maps)** | Mapa no painel do coordenador | Coordenada das ocorrências desenhadas, enviada ao carregar o mapa | Estados Unidos |
| **Google (Maps SDK)** | Mapa dentro do aplicativo de campo | Coordenada do imóvel da tarefa, a região que o agente está olhando, e a posição do próprio agente enquanto o mapa está aberto | Estados Unidos |
| **Google (Routes API)** | O caminho por ruas e o tempo de carro até a tarefa, quando o agente toca em "Ver o caminho" | A posição do agente (arredondada a três casas decimais) e a coordenada do imóvel, uma vez por toque, enviadas pelo servidor do município. Ver a seção 2.2 | Estados Unidos |
| **Apple (Mapas) e Google (Maps), por entrega** | O botão "Navegar até lá" abre a rota no aplicativo de mapas do próprio aparelho | Coordenada do imóvel, uma vez, no toque do agente. Ver a seção 2.4 | Estados Unidos |
| **Google (encurtador `maps.app.goo.gl` e Maps), por link** | Descobrir o ponto de um link curto do Google Maps, quando o coordenador toca em "Descobrir o ponto" | O link, uma vez por toque, enviado pelo servidor do município; volta a coordenada. O servidor não guarda o link. Ver a seção 2.2 | Estados Unidos |

**O que NÃO está nesta lista, e por que isso precisou ser dito.** Até
15/09/2026 o painel do coordenador carregava as fontes Work Sans e Roboto Mono
de `fonts.googleapis.com`: cada abertura do painel mandava ao Google, fora do
país, o endereço IP, o agente do navegador e a página de quem estava usando, e
a linha da Vercel acima dizia que nenhum dado sai do painel estático. Era um
destino ausente desta lista. Desde essa data o painel serve as fontes de si
mesmo (`apps/web/public/fontes/`, com a licença ao lado), como o console do
fornecedor já fazia, e o portão `apps/web/test/design-system.test.ts` reprova
qualquer fonte vinda de rede. A linha da Vercel voltou a ser verdadeira.

### Ainda não contratados, e que entram nesta lista quando entrarem

| Empresa | Para quê | Quando |
| --- | --- | --- |
| **Resend** (escolhido, ainda não ligado) | Recuperação de senha e ofício com endereço de uso único. O cliente já fala o contrato publicado dele (`docs/LIGAR-O-EMAIL.md`), e o processo sobe com `EMAIL_ATIVO=nao` | Quando `EMAIL_ATIVO=sim` entrar em produção. Nesse dia esta linha sobe para a tabela nominal, com o que ele alcança (endereço de email do servidor público e o texto do ofício) e onde ficam os servidores |

---

## 2. As três que exigem conversa com o município antes de ligar

### 2.1 Notificação: Apple e Google

O conteúdo da notificação **sai do país** e passa por servidor de terceiro. Por
isso a mensagem que aparece na tela bloqueada é **genérica**: ela diz que há
tarefa nova ou prazo vencendo, e não diz endereço, nome, protocolo nem
severidade. O detalhe viaja no corpo cifrado da mensagem e só é lido pelo
aplicativo depois que o agente destrava o aparelho.

Isso não é preciosismo. Uma notificação que diz "Interdição em Servidão Boa
Esperança, 148" fica legível na tela bloqueada, na mão de quem estiver por
perto, e passa por um servidor estrangeiro no caminho.

**E o dado da mensagem também atravessa a fronteira**, junto com a vitrine. Por
isso ele carrega o mínimo: identificador do município, identificador da
ocorrência, severidade e prazo. Protocolo e endereço foram tirados, porque o
aplicativo já tem a ocorrência no disco e o identificador basta para abri-la.
Para a tarefa que ele ainda não baixou, a tela diz isso e oferece atualizar, o
que é melhor do que mandar o endereço de uma família para fora do país para
economizar um toque. A severidade fica porque ela escolhe o canal de notificação
no Android antes de o aplicativo abrir, e é uma palavra de quatro valores
possíveis que não diz nada sobre pessoa nenhuma.

### 2.2 Mapa: Google

Ao desenhar o mapa, coordenada é enviada ao Google. Coordenada de imóvel
vistoriado por Defesa Civil é dado sobre pessoa identificável quando cruzada com
o resto.

**Isto acontece em dois lugares, e não em um.** Até 13/09/2026 havia só o mapa
do painel. Desde 14/09/2026 o aplicativo de campo também desenha mapa, e ele é
um segundo caminho de coordenada saindo do país, com dado que o painel não
manda. Os dois estão descritos abaixo, separados, porque o que sai de cada um é
diferente. Depois deles vêm as duas saídas que só acontecem por um toque: o
caminho por ruas, pedido pelo agente, e o link encurtado, aberto a pedido do
coordenador.

#### No painel do coordenador

Sai a coordenada das ocorrências ativas desenhadas, a cada carregamento da tela.

#### No aplicativo de campo

Saem três coisas, e a terceira é nova em relação ao painel:

1. **A coordenada do imóvel** da tarefa aberta, que é o que o mapa desenha.
2. **A região que o agente está olhando.** Mapa nativo busca ladrilho por
   pedaço de território, então o Google recebe onde o mapa está apontado, e não
   só o ponto. É consequência inevitável de qualquer mapa cartográfico, e está
   escrita aqui para não ser descoberta numa auditoria.
3. **A posição do próprio agente**, enquanto a tela do mapa está aberta. O mapa
   desenha o ponto do agente para ele saber para que lado andar, e quem desenha
   esse ponto é o SDK do Google. Esse dado é sobre um servidor público
   identificável, e não sobre o cidadão atendido: ele não entra no laudo, não é
   guardado por nós, e a leitura acontece com o aplicativo aberto, a pedido do
   agente, nunca em segundo plano (ver `DECLARACAO-NAS-LOJAS.md`).

#### O caminho por ruas, a pedido do agente

Desde 15/09/2026 existe uma quarta saída, e ela é diferente das três acima
porque **não acontece sozinha**: ela acontece quando o agente toca em "Ver o
caminho", no cartão da tarefa escolhida, na tela do mapa. Sem o toque, nada
disto sai.

O que sai, e por onde:

1. **A posição do agente**, arredondada a três casas decimais (cerca de 111
   metros), e **a coordenada do imóvel** da tarefa. Os dois pontos vão do
   aplicativo ao servidor do município (`POST /rota`, na API do produto), e do
   servidor do município à Routes API do Google, com o modo de viagem "de
   carro". Nada mais vai: nem endereço, nem protocolo, nem nome, nem
   identificador de ocorrência. O corpo do pedido ao Google tem exatamente
   três campos, e `apps/api/test/rota.test.ts` confere isso campo a campo.
2. **O que volta** é a duração estimada, a distância e a linha do caminho, que
   o aplicativo desenha sobre o mapa e resume numa frase ("cerca de 14 min de
   carro, 4,2 km").
3. **Quem fala com o Google é o servidor**, e não o aparelho. A chave que
   serve para isso (`ROUTES_KEY`) é chave de servidor, é segredo, e nunca sai
   de lá: o aplicativo não a tem e não a recebe. A chave do aplicativo, assada
   no binário, é restrita a Apps iOS ou Android e o Google a recusa por HTTP.
4. **O servidor não guarda nada disso.** A rota é resposta, não registro:
   nenhuma coordenada vai para o banco, para o log ou para tabela de
   estatística. Existe uma memória de 24 horas por par de pontos, dentro do
   processo do servidor, para o mesmo toque não custar duas vezes; ela morre
   no reinício, não é consultável por ninguém e não é um histórico de
   deslocamento. O teste lê o log do servidor para provar que nenhuma
   coordenada aparece nele, e confere que não existe tabela nem coluna de rota.
   No aparelho, o caminho fica guardado por tarefa, e some no logout junto com
   o resto do dado de tarefa.

**As consequências assumidas desta quarta saída:**

- Ela é a única saída do produto em que a posição do agente sai do país **por
  decisão dele**, um toque por tarefa, e não por o mapa estar aberto. É por
  isso que o pedido é um botão e não um automatismo: o aplicativo não traça o
  caminho sozinho ao abrir a tela.
- Ela tem um segundo interruptor, separado do mapa: `ROUTES_KEY` no servidor.
  Município que ligou o mapa e não quer o caminho simplesmente não a
  preenche, e o botão responde "o seu município não ligou o caminho por ruas",
  com a distância e o rumo em linha reta continuando na tela. Município que
  ligou o caminho e não o mapa recebe a frase e não a linha.
- Ela custa dinheiro por toque que passa da memória, e por isso o servidor
  limita a trinta pedidos por minuto por pessoa, além da memória de 24 horas.

**O que continua NÃO saindo, em todos os lugares:** nome, contato, endereço,
protocolo, relato, fotografia, assinatura e descrição de vulnerabilidade. O
aplicativo não chama geocodificação nem em um sentido nem no outro, e não
chama a Routes API nem a Directions API diretamente, e isso é portão de código
e não promessa: `scripts/portao-do-mapa-do-aplicativo.test.mjs` reprova
`geocodeAsync`, `reverseGeocodeAsync`, Geocoding, Places, Directions e Routes
em qualquer arquivo do aplicativo, e reprova Directions e Routes em qualquer
arquivo da API que não seja `apps/api/src/rotas/rota.ts`, que é o único lugar
do produto autorizado a pedir caminho ao Google. Transformar endereço em ponto
mandaria o endereço da família junto, e transformar ponto em endereço traria
de volta um endereço que o Google passou a conhecer. Nenhuma das duas resolve
problema deste produto: a coordenada já está gravada.

#### O link encurtado, a pedido do coordenador

Desde 15/09/2026 existe uma quinta saída, e ela é a única em que o que sai
**não é coordenada**: é um link. O solicitante manda pelo WhatsApp um link
curto do Google Maps (`maps.app.goo.gl/...`), que não carrega a coordenada
dentro dele; ela só aparece depois que alguém segue o redirecionamento. O
painel não segue link nenhum a partir do navegador do coordenador (a
requisição sairia da rede interna da prefeitura, com os cookies e o alcance de
rede dela). Quem segue é o servidor do município, e só quando o coordenador
aperta "Descobrir o ponto" no campo de localização, na abertura da ocorrência
ou na correção da coordenada. Sem o toque, nada sai.

O que sai, e por onde:

1. **O link, e só ele.** Vai do painel ao servidor do município (`POST
   /mapa/resolver-link`, na API do produto), e do servidor ao encurtador do
   Google e ao Google Maps, que são os únicos destinos que o servidor aceita
   seguir (`maps.app.goo.gl` e `goo.gl` como encurtador; `www.google.com`,
   `google.com`, `maps.google.com`, `www.google.com.br` e `google.com.br`
   como destino). Nem endereço, nem protocolo, nem nome, nem identificador de
   ocorrência: o servidor pede os cabeçalhos da página e derruba a conexão
   antes do corpo.
2. **O que volta** é a coordenada lida da URL final, e a própria URL final sem
   os parâmetros de rastreamento, para o coordenador conferir no mapa o que o
   servidor viu. Se a URL final não tiver coordenada (o Google às vezes
   redireciona para uma busca por nome), a resposta diz que o link não aponta
   para um ponto: nome não é ponto, e transformar um no outro seria
   geocodificação, que este produto não faz.
3. **O que o Google fica sabendo** é que o servidor daquele município abriu
   aquele link naquela hora, ou seja, que aquele ponto foi consultado por
   aquela prefeitura. É a mesma natureza do que o mapa já conta ao desenhar,
   e por isso a saída mora nesta seção. O link não leva chave nenhuma: é uma
   requisição comum, sem `MAPS_KEY` e sem `ROUTES_KEY`.
4. **O servidor não guarda o link.** Nem no banco, nem no log (o teste lê o
   log para provar que nem o link nem a coordenada aparecem nele), nem em
   memória: cada toque é uma consulta, e a coordenada que volta só entra no
   banco se a ocorrência for gravada com ela, pelo caminho normal da abertura
   ou da correção.

**As consequências assumidas desta quinta saída:**

- Ela é a única saída em que uma URL vinda de fora entra no servidor e o
  servidor sai para buscá-la, o que é a forma de uma requisição forjada do
  lado servidor. As defesas estão em `apps/api/src/rotas/mapa.ts` e cada uma
  tem teste em `apps/api/test/resolver-link.test.ts`: lista fechada de
  encurtador, endereço conferido depois de resolver o nome e a cada salto
  (privado, retorno local, link-local e não roteável são recusados), conexão
  feita no endereço conferido e não numa segunda consulta ao DNS, quatro
  saltos, cinco segundos, nenhum corpo lido, e destino final só no Google
  Maps.
- Município que não quer o servidor falando com o Google nem por link tem o
  caminho de sempre: o coordenador abre o link no próprio navegador e cola o
  endereço da barra, que o painel lê sem sair para a rede. O botão é opcional
  por construção; o campo continua aceitando o link longo e a coordenada.
- O servidor limita a trinta pedidos por minuto por pessoa, para um cliente
  com defeito não virar um laço de consultas ao Google.

#### As consequências assumidas, e elas valem para os dois

1. O município precisa ser informado disso **antes** de o mapa ser ligado, e a
   informação está aqui para que ele possa decidir.
2. Existe **modo sem chave** nos dois. No painel ele desenha as ocorrências
   sobre um plano esquemático; no aplicativo, o imóvel, a posição do agente, a
   distância e o rumo, desenhados pelo próprio aparelho. Nos dois casos não há
   uma única requisição ao Google. Município que não aceitar o envio da
   coordenada trabalha nesse modo, e o resto do produto não muda. O caminho
   por ruas tem o próprio interruptor (`ROUTES_KEY`), e sem ele o botão
   explica e a linha reta continua.
3. **A tela DIZ em qual dos dois modos está**, com ícone e com palavra, no
   painel e no aplicativo. É assim que o município confere esta promessa
   olhando, em vez de acreditar.

### 2.4 Navegar até lá: a entrega ao aplicativo de mapas do aparelho

Esta é a terceira saída de coordenada, e ela é diferente das duas de cima
porque **não é o nosso produto desenhando**: é o agente tocando em "Navegar até
lá" e o sistema operacional abrindo o aplicativo de mapas dele.

O que sai, e para onde:

- **No Android**, o esquema `geo:` é entregue ao aplicativo de mapas instalado
  no aparelho. Quem faz a requisição de rede a partir daí é aquele aplicativo,
  com a conta daquele aparelho, e não nós.
- **No iOS**, o endereço `maps.apple.com` abre o Mapas da Apple, com o mesmo
  raciocínio.
- **Como último recurso**, quando o aparelho não tem aplicativo de mapas que
  atenda os dois acima, o endereço `https://www.google.com/maps/...` abre no
  navegador, e aí a coordenada chega ao Google por essa via.

**Isto NÃO é coberto pelo modo sem chave**, e a distinção precisa estar escrita
em vez de ser descoberta: o modo sem chave governa o que o aplicativo desenha
sozinho, na tela, sem ninguém pedir. Este caminho só acontece quando o agente
toca no botão, uma vez, para a tarefa que ele está indo fazer, e o destino é o
aplicativo de mapas que ele já usa todo dia para chegar em qualquer lugar.

**A consequência assumida:** município que recusou o envio de coordenada ao
Google continua com este botão funcionando, porque tirá-lo significaria o
agente digitar a coordenada à mão no mesmo aplicativo de mapas, com o mesmo
resultado e uma chance a mais de errar o número. Município que quiser fechar
também essa saída precisa dizer isso, e a decisão é dele, não nossa.

A escolha tem endereço operacional. A **autorização** do mapa é a variável
`MAPS_KEY` no servidor daquele município: o painel a pede em tempo de execução
por `GET /configuracao` e usa a chave; o aplicativo pede a mesma rota e lê o
booleano `mapaAutorizado`, que o servidor deriva dela. Vazia, o mapa é o plano
esquemático nas duas pontas. Ela fica no servidor de cada município, e não no
painel, porque o painel é um build só servindo todos: a chave ali seria a do
fornecedor, e o município não teria onde recusar nem onde pagar a própria
conta.

**Uma diferença técnica do aplicativo, dita porque ela muda o procedimento.** O
SDK nativo do Google não aceita chave em tempo de execução: no Android ela é
`com.google.android.geo.API_KEY` no manifesto, e no iOS é
`GMSServices.provideAPIKey(...)` no AppDelegate, as duas escritas quando o
aplicativo é gerado. Então o aplicativo daquele município precisa ser compilado
com as chaves dele, do mesmo jeito que já é compilado com o endereço do
servidor dele (`DC360_API_URL`). **São duas variáveis, e não uma**, porque o
console do Google aceita um tipo de restrição por chave: `DC360_MAPS_CHAVE_IOS`
(chave restrita a Apps iOS, com o identificador do aplicativo) e
`DC360_MAPS_CHAVE_ANDROID` (chave restrita a Apps Android, com o pacote e a
impressão digital do certificado). Uma chave só, sem restrição, seria uma
chave que qualquer aplicativo do mundo gasta na conta do município. E nenhuma
das duas é a `MAPS_KEY` do servidor, que é restrita a sites: são três chaves
do mesmo projeto do Google, cada uma presa ao lugar de onde é usada.

O que `GET /configuracao` decide no aplicativo é a **autorização**: sem ela, o
mapa do Google não é montado e nada sai do aparelho, mesmo que o binário tenha
a credencial. Um aplicativo compilado SEM a chave da plataforma dele nunca
desenha mapa do Google, e nesse caso a tela diz isso com todas as letras em vez
de tentar e falhar em silêncio. O aplicativo **não compara** a chave do
servidor com a do binário: até 15/09/2026 ele comparava, e como as duas são
diferentes por construção, a tela avisava "gerar o aplicativo de novo" em toda
instalação certa.

**O caminho por ruas tem a quarta variável**, e ela é de outra natureza:
`ROUTES_KEY`, no servidor do município, é chave de servidor restrita por
endereço IP, é segredo, e nunca é entregue a cliente nenhum. Sem ela o botão
"Ver o caminho" responde que o município não ligou o caminho. Ver a seção 2.2.

### 2.3 Transferência internacional

Apple, Google e Vercel operam fora do Brasil. A LGPD admite transferência
internacional, e as três hipóteses que se aplicam aqui são: execução de contrato
do qual o titular é parte por meio do município, cumprimento de obrigação legal
do município, e o consentimento não é a base usada.

O dado que efetivamente atravessa a fronteira está limitado, por decisão de
projeto, ao mínimo listado na tabela da seção 1: identificador de aparelho, texto
genérico de notificação, identificador de município e de ocorrência, severidade,
prazo, coordenada de mapa, a região de mapa consultada, a posição do agente de
campo enquanto ele tem o mapa aberto, e, a pedido dele, a posição dele e a
coordenada do imóvel para traçar o caminho. **Nome, contato, endereço,
protocolo, relato, fotografia, assinatura e descrição de vulnerabilidade não
saem do Brasil.**

As três últimas entraram em 14/09/2026, com o mapa dentro do aplicativo de
campo, e a terceira merece ser lida com atenção porque muda a natureza do que
sai: até então tudo que atravessava a fronteira era sobre a OCORRÊNCIA, e a
posição do agente é sobre uma PESSOA, servidor público do município. Ela sai
enquanto a tela do mapa está aberta, para o mapa poder desenhar onde ele está,
não é guardada por nós, não entra no laudo e não é lida em segundo plano. O
município que preferir não ter esse fluxo trabalha no modo sem chave, em que
nem ela nem a coordenada do imóvel saem do aparelho.

A quarta entrou em 15/09/2026, com o caminho por ruas, e é a única que sai por
DECISÃO do agente: um toque em "Ver o caminho", uma vez por tarefa. Ela passa
pelo servidor do município antes de sair do país, e o servidor não a guarda.
O município que preferir não ter esse fluxo não preenche `ROUTES_KEY`, e o
resto do produto não muda.

---

## 3. Cláusula de operador, para o contrato

> Texto para o instrumento contratual. Revisão jurídica pendente:
> `[[revisão por advogado]]`.

**1. Objeto e limite.** O OPERADOR trata dados pessoais exclusivamente para
prestar o serviço contratado, seguindo instrução documentada do CONTROLANTE.
Não usa os dados para finalidade própria, não os comercializa, não os cede, não
os cruza com dados de outro contratante e não os utiliza para desenvolver ou
treinar produto, modelo estatístico ou sistema de inteligência artificial.

**2. Confidencialidade.** O OPERADOR mantém sigilo, impõe a mesma obrigação a
quem tenha acesso, e o dever subsiste ao fim do contrato.

**3. Segurança.** O OPERADOR adota as medidas técnicas e administrativas
descritas na seção 6 da política de privacidade vigente, e comunica o
CONTROLANTE de alteração que reduza o nível de proteção.

**4. Subprocessadores.** O OPERADOR pode contratar subprocessadores, e mantém
lista nominal atualizada e pública, com o que cada um processa e onde.
Subprocessador novo é comunicado ao CONTROLANTE com **30 dias** de antecedência,
prazo no qual ele pode se opor motivadamente. Havendo oposição não sanada, o
CONTROLANTE pode rescindir sem multa.

**5. Isolamento.** O OPERADOR garante que nenhuma credencial de aplicação
alcança dado de mais de um município, e que essa garantia é verificada por teste
automatizado que bloqueia a entrega quando falha.

**6. Incidente.** O OPERADOR comunica o CONTROLANTE em até **24 horas** da
detecção de incidente de segurança com risco relevante, informando o que se sabe
até ali, e presta apoio na comunicação à autoridade nacional e aos titulares.

**7. Direitos do titular.** O OPERADOR apoia o CONTROLANTE no atendimento a
pedido de titular, dentro dos prazos legais, e não responde diretamente ao
titular salvo instrução do CONTROLANTE.

**8. Auditoria.** O CONTROLANTE pode auditar o cumprimento desta cláusula,
mediante aviso prévio de `[[prazo]]` dias, diretamente ou por terceiro sob
sigilo.

**9. Término e devolução.** Encerrado o contrato, o OPERADOR entrega ao
CONTROLANTE, em formato aberto e legível por máquina, a íntegra dos dados do
município, incluindo fotografias e documentos gerados, e elimina as cópias em
até `[[prazo]]` dias, salvo retenção exigida por lei, que é informada por
escrito. O procedimento está descrito em `SAIDA-DE-MUNICIPIO.md`.

**10. Responsabilidade.** O OPERADOR responde pelo dano causado por
descumprimento desta cláusula ou por inobservância de instrução lícita do
CONTROLANTE.

---

## 4. Manutenção deste documento

Este arquivo **desatualizado é pior que inexistente**: ele é o que o município
usa para avaliar risco, e uma lista que omite um subprocessador vira declaração
falsa.

Regra: **nenhuma dependência que toque dado do município entra em produção sem
uma linha aqui, no mesmo commit.** Se a variável de ambiente nova aponta para um
serviço de terceiro, esta tabela cresce junto.
