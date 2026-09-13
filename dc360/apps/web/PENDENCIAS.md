# Pendências do painel web

O que este turno deixou pronto para o próximo pegar, e o que ficou fora da
faixa de `apps/web/`. Cada item diz o que precisa existir e por quê, para o
turno seguinte não ter que reconstruir o raciocínio.

## 1. Rota da API: corrigir a coordenada de uma ocorrência já aberta

Não foi feita neste turno porque exige rota nova na API, que está com outro
agente. A tela do painel é a parte fácil e fica esperando a rota.

**O problema real.** O operador cola a localização durante a ligação, com o
telefone no ombro. Depois o agente chega no local e descobre que o ponto está
na quadra errada, ou a ocorrência foi aberta sem coordenada nenhuma e alguém
descobriu o ponto depois. Hoje não há como corrigir: a coordenada entra na
abertura e nunca mais muda. Isso empurra a prefeitura para o pior caminho
possível, que é abrir outro protocolo para o mesmo evento só para poder digitar
o ponto certo, e aí a cidade tem duas ocorrências onde existe uma casa.

**O que a rota precisa fazer, e o que ela precisa recusar.**

1. **Só enquanto a ocorrência não estiver encerrada.** Ocorrência encerrada é
   peça de processo: o laudo já saiu com a coordenada impressa, e mudar o ponto
   depois faria o documento assinado divergir do banco sem que nada na tela
   avisasse. Encerrada se corrige por evento novo, não por edição.
2. **Evento na trilha, com o valor ANTERIOR e o NOVO.** A trilha é append-only
   no banco (sem policy de UPDATE nem de DELETE), então o registro da correção
   é a única forma de alguém, meses depois, responder "por que o laudo diz um
   ponto e o sistema diz outro". Gravar só o valor novo apagaria exatamente a
   informação que a pergunta pede. O evento precisa carregar quem corrigiu e
   quando, como os demais.
3. **Teto de seis casas decimais na gravação.** Seis casas são cerca de dez
   centímetros, o laudo e a minuta já imprimem seis (`apps/api/src/documentos/
   laudo.ts` e `packages/shared/src/minuta.ts`), e o painel passou a imprimir
   seis também neste turno. Sem o teto no servidor, o mesmo campo aceita quinze
   casas por outra porta e a divergência volta pela API.
4. **`exigirPermissao` antes de tocar no banco**, como toda escrita, e a
   organização vinda do token verificado. Ocorrência de outro município
   responde 404, nunca 403.
5. **Validação pelo esquema compartilhado**, o mesmo que a abertura usa: a
   regra de coordenada válida não pode existir só no formulário.

**O que o painel já tem pronto para consumir isso.** `lerLocalizacaoColada`
(`src/paginas/coordenada-colada.ts`) lê link do Google, `geo:`, par com ponto,
par com vírgula decimal e grau/minuto/segundo, aplica o teto de seis casas e
recusa o texto ambíguo. A tela de correção é o mesmo campo da abertura mais uma
chamada; falta só a chamada.

## 2. Rota da API: resolver link encurtado, se um dia for resolvido

Hoje o painel **não resolve** link encurtado, e diz isso ao coordenador em vez
de falhar calado: "este link é encurtado, e o painel não abre link nenhum para
descobrir o que tem dentro". `maps.app.goo.gl` e companhia não carregam a
coordenada no próprio endereço; ela só aparece depois que alguém segue o
redirecionamento.

**Por que não foi resolvido no painel.** Seguir o link a partir do navegador do
coordenador expõe a máquina dele: a requisição sai da rede interna da
prefeitura, com os cookies e o alcance de rede dela.

**Por que a rota de servidor é perigosa.** Uma rota que aceita URL do usuário e
vai buscar é uma ferramenta de requisição forjada do lado servidor. Se ela for
feita, precisa, no mínimo:

- **Recusar destino privado, de retorno local e de metadados de nuvem DEPOIS de
  resolver o nome**, e não antes. Conferir só o texto da URL não protege: o
  nome resolve para outro endereço na hora da conexão, e é o endereço que
  importa. Entram na recusa as faixas privadas, o retorno local, o link-local
  (que é onde mora o serviço de metadados de nuvem, o alvo clássico) e o
  endereço não roteável.
- **Repetir a conferência a CADA SALTO do redirecionamento.** O primeiro salto
  vai para um destino público e o segundo aponta para dentro: é assim que a
  defesa que só olha a primeira URL é contornada.
- **Teto de redirecionamentos** (poucos, três ou quatro), teto de tempo e teto
  de tamanho de resposta, para o encurtador não virar laço infinito nem
  download.
- **Lista de domínios de encurtador aceitos**, em vez de aceitar qualquer URL:
  o produto precisa de `maps.app.goo.gl` e `goo.gl`, e de mais nada.
- Vale registrar que resolver o link é o servidor da prefeitura contando ao
  Google que aquele ponto foi consultado, o que é a mesma preocupação da seção
  2.2 de `docs/SUBPROCESSADORES.md`.

Enquanto a rota não existir, o comportamento atual (dizer que não resolve, e
pedir que a pessoa abra o link e cole o endereço da barra) é o certo.

## 3. O README ficou desatualizado sobre o mapa de base

`dc360/README.md`, seção "O que falta, e por quê", ainda diz que o mapa
cartográfico será MapLibre GL JS com provedor de tiles. Isso deixou de ser
verdade: a chave do Google chega ao painel por `GET /configuracao` da API e
`docs/SUBPROCESSADORES.md` já lista Google (Maps) como subprocessador, com o
modo sem chave prometido na seção 2.2. O painel agora implementa os dois modos.
O README está fora da faixa de `apps/web/` e não foi tocado: alguém precisa
alinhar o texto, ou o próximo a ler vai procurar um MapLibre que não existe.

## 4. O modo com chave do Google, exercido contra o Google em 13/09/2026

Este item era "nunca foi exercido", e a causa não era preguiça: a chave era
lida de `import.meta.env["VITE_GOOGLE_MAPS_CHAVE"]`, que é variável de tempo de
BUILD, e o painel é UM build estático servindo TODOS os municípios. Assar a
chave ali seria assar a chave do FORNECEDOR, cobrada no cartão dele, pagando o
carregamento de mapa de todas as prefeituras, porque o Google cobra por
carregamento. Não havia onde uma prefeitura pôr a dela, a variável ficou vazia
em `vercel.json`, e o modo Google nunca teve contato com o Google.

**A chave passou a vir da API, em tempo de execução**: `MAPS_KEY` no ambiente
do servidor daquele município, servida por `GET /configuracao` (autenticada,
um campo só). A variável de build continua aceita, como RESERVA, para o modo de
demonstração e o `npm run dev`, que não têm API a quem perguntar. Um portão em
`test/mapa-e-coordenada.test.ts` reprova se `vercel.json` voltar a preencher a
variável de build.

Exercitado no navegador, com a chave real do Rafa, painel construído e servido
em `http://localhost:4173` contra a API local:

- o carregador do Google respondeu 200 e `window.google.maps` existe;
- o mapa renderizou com camada de ruas de verdade, e as seis ocorrências da
  semente aparecem como marcadores, cada um com protocolo, tipo, severidade
  POR PALAVRA e endereço no `title`;
- **zero erro de console**, que era o risco maior: chave recusada por restrição
  de referenciador aparece exatamente assim;
- nenhuma requisição a Geocoding, a Places ou com `libraries=`;
- a chave NÃO aparece em nenhum arquivo do build servido, o que é a prova de
  que ela deixou de ser assada.

O caminho de falha também foi exercitado, com chave inválida de propósito: a
tela cai no plano esquemático com as mesmas seis ocorrências, mantém a lista de
teclado completa, e o aviso diz que o Google recusou a chave e onde se conserta
(restrição por referenciador, faturamento, API habilitada). Nada de tela em
branco.

As duas escolhas feitas às cegas continuam de pé, e agora com o aviso do
console confirmado (são AVISOS, não erros):

- o marcador usa `google.maps.Marker`, que o Google marcou como obsoleto em
  favor de `AdvancedMarkerElement`. O substituto exige um `mapId` criado no
  console do Google, que é configuração que ainda não existe neste produto;
- o carregador é uma tag de script sem `callback` e sem `loading=async`, para
  não precisar de função global. O Google imprime um aviso de desempenho no
  console por causa disso. Trocar por `loading=async` exige o `callback`.

O que continua sem prova: como o `fitBounds` enquadra um município grande e
espalhado. A semente é de uma cidade compacta.

## 5. O teto de seis casas está no painel, e ainda não no banco

O painel arredonda em seis casas o que lê do campo colado, e imprime seis na
tela da ocorrência e no mapa. O caminho do aplicativo de campo (GPS do
aparelho) não passa por aqui: ele grava o que o aparelho dá. Enquanto o teto
não existir no banco ou no esquema compartilhado, a mesma coluna guarda seis
casas quando veio do painel e quinze quando veio do celular, e as duas telas
mostram números com aparência de precisão diferente para o mesmo tipo de dado.
