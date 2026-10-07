# Pendências do painel web

O que este turno deixou pronto para o próximo pegar, e o que ficou fora da
faixa de `apps/web/`. Cada item diz o que precisa existir e por quê, para o
turno seguinte não ter que reconstruir o raciocínio.

**Revisão de 2026-10-07 (V2-F00-E22).** Três itens deste arquivo descreviam
como pendente o que o código já tem (1, 3 e 5) e um descrevia como manual o
que o CI já roda (10.1); o vermelho de CRLF do item 9.1 fechou na V2-F00-E21.
Eles continuam aqui, marcados como resolvidos e com a prova, porque o
raciocínio de cada um ainda explica o código. O que REALMENTE resta, conferido
contra o código nesta data:

| O que resta | Item | Quem fecha |
| --- | --- | --- |
| Prova do link encurtado contra o Google de verdade (todos os testes usam dublê) | 2 | validação humana |
| `google.maps.Marker` obsoleto e carregador sem `loading=async`; `fitBounds` num município espalhado | 4 | F10 |
| Reset do segundo fator de outra pessoa, tela consolidada de conta, expurgo de IP e user-agent | 6.1 | F03-E11, F10-E01, F05-E12 |
| Senha temporária conhecida por quem a sorteia; "encerrar as outras" preserva por id | 6.2, 6.5 | F03-E10, F03-E02 |
| Lista de usuários em 390 px rola na horizontal | 6.3 | F10 |
| Envio real de e-mail; `Referrer-Policy` só nas duas rotas; header só visto na Vercel; sem olho na senha; prazo do link não dito | 7 | CP-19, F10 |
| Os outros downloads (`baixarCsvDeOcorrencias`, `abrirDocumento`, `abrirOficio`) com `fetch` solto | 8.1 | V2-F00-E23 ou F10 |
| Pacote montado inteiro em memória, no servidor e na aba | 8.2 | F07-E06 |
| Frase de permissão fala em "alterar" no download do pacote | 8.3 | F03 |
| Município suspenso não baixa o pacote | 8.4 | Rafael com o jurídico (CP-29) |
| Barra de navegação a 390 px rola na horizontal | 9.2 | F10 |
| Janela de milissegundos na renovação | 9.3 | F03-E02 |
| e2e contra a API no Firefox fora do CI; nenhum run do CI conferido | 10.1 | F01-E03, validação humana |
| CORS por ambiente e do armazenamento externo | 10.2 | F01-E10, F06-E15 |
| Ver a foto subir na seção 13 | 10.3 | validação humana |

## 1. ~~Rota da API: corrigir a coordenada de uma ocorrência já aberta~~ (feita)

**Resolvido, conferido em 2026-10-07.** A rota existe: `POST
/ocorrencias/:id/coordenada` (`apps/api/src/rotas/ocorrencias.ts`), com
`exigirPermissao` de `abrir_ocorrencia`, recusa em estado terminal pela máquina
de estados, trilha com o ponto anterior, o novo e o motivo, e a coordenada pelo
`coordenadaGravadaSchema` compartilhado. O painel a chama por
`corrigirCoordenada` (`src/dados/http.ts`) na tela da ocorrência
(`src/paginas/Ocorrencia.tsx`). O texto abaixo é a especificação de antes, e
fica porque explica as decisões da rota.

Não foi feita naquele turno porque exigia rota nova na API, que estava com
outro agente.

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

## 2. Rota da API: resolver link encurtado. Feita em 15/09/2026

Até 15/09/2026 o painel **não resolvia** link encurtado, e dizia isso ao
coordenador em vez de falhar calado. O reclame de quem paga, na letra: "o campo
localização do mapa ao abrir a ocorrência tem que aceitar link curto do gmaps,
hoje não tá aceitando". A especificação que esta seção guardava para "o dia em
que a rota fosse feita" virou a rota, item a item. O que ficou, e onde:

**A rota: `POST /mapa/resolver-link { url }`**, em `apps/api/src/rotas/mapa.ts`,
registrada em `apps/api/src/servidor.ts` sob o prefixo `/mapa`. Autenticada,
com `exigirPermissao(..., "abrir_ocorrencia")` (a mesma competência de quem
informa a localização ao registrar). Responde 200 `{ latitude, longitude,
urlFinal }` (a URL final sem os parâmetros de rastreamento), 422
`link_nao_aceito` (host fora da lista), 422 `sem_ponto` (destino sem
coordenada legível), 502 `nao_resolveu` (tempo, saltos, destino recusado),
cada recusa com a frase que a tela mostra. Teto de trinta pedidos por minuto
por pessoa. Nada de link nem de coordenada no log, e nada no banco: a rota é
resposta, não registro.

**As defesas, cada uma com teste em `apps/api/test/resolver-link.test.ts`:**

- **Lista fechada de encurtador**: `maps.app.goo.gl` e `goo.gl`, mais nada,
  conferida no texto da URL ANTES de consultar nome ou conectar. Só `https:`,
  sem usuário na URL, sem porta.
- **Endereço conferido DEPOIS de resolver o nome, a CADA salto**, e a conexão
  feita NESSE endereço, por um `lookup` fixo entregue ao `https.request`, sem
  uma segunda consulta ao DNS. Recusa faixa privada, retorno local, link-local
  (o serviço de metadados de nuvem), o espaço partilhado de operadora,
  multicast, reservado e não roteável, em IPv4 e em IPv6 (inclusive o IPv4
  embutido em `::ffff:`, NAT64 e 6to4). O teste prova a recusa no primeiro e
  no SEGUNDO salto, e prova com um servidor local que a camada de rede de
  produção conecta no endereço conferido e não no nome.
- **Tetos**: quatro saltos, cinco segundos para a cadeia inteira, e nenhum
  corpo lido: a conexão é derrubada assim que os cabeçalhos chegam.
- **O destino final** só pode ser `www.google.com`, `google.com`,
  `maps.google.com`, `www.google.com.br` ou `google.com.br`; os encurtadores
  valem só como salto intermediário. A coordenada é lida da URL final pelo
  MESMO leitor do painel (`lerLocalizacao`, em `packages/shared`), que ganhou
  `destination=` para o link de "como chegar". URL final sem coordenada
  legível responde `sem_ponto`: nome não é ponto, e transformar um no outro
  seria geocodificação.

**O painel** (`src/componentes/DescobrirPonto.tsx`, com as decisões puras em
`src/paginas/link-encurtado.ts`): ao ler `encurtado`, a dica do campo diz que
o servidor da prefeitura pode abrir o link e oferece o botão "Descobrir o
ponto". É um ato explícito, nunca automático ao colar, porque abrir o link é o
servidor contando ao Google que o ponto foi consultado. Enquanto espera, a
tela diz "Abrindo o link no servidor da prefeitura para descobrir o ponto"; no
sucesso, o campo recebe a coordenada e a dica diz de onde ela veio, com o link
final para conferir; na falha, a frase da API. Vale na abertura da ocorrência
(`NovaOcorrencia.tsx`) e na correção da coordenada (`Ocorrencia.tsx`), que
usam o mesmo componente, e o teste `test/link-encurtado.test.ts` reprova se
uma das duas deixar de usá-lo. `resolverLinkDeMapa` existe nos dois modos do
repositório: no modo de demonstração ela recusa dizendo que não há servidor
para abrir link nenhum.

**O que continua sem prova, e está dito:** a rota nunca resolveu um link de
verdade contra o Google. Todos os testes usam dublê de rede e de DNS. O que a
prova real pode revelar: o Google respondendo ao servidor com uma página de
consentimento (`consent.google.com`, que a lista recusa de propósito), com
uma busca por nome em vez de um ponto (`sem_ponto`), ou com um formato de URL
que o leitor compartilhado ainda não conhece.

A saída de dado correspondente está declarada em `docs/SUBPROCESSADORES.md`,
seção 2.2 ("O link encurtado, a pedido do coordenador").

## 3. ~~O README ficou desatualizado sobre o mapa de base~~ (resolvido)

**Resolvido em 2026-10-07 (V2-F00-E22):** `dc360/README.md`, em "O que falta, e
por quê", passou a descrever o mapa do Google com a chave servida por
`GET /configuracao` e o modo esquemático sem chave, e não cita mais MapLibre
como mapa vigente. O registro de antes:

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

## 5. ~~O teto de seis casas está no painel, e ainda não no banco~~ (resolvido)

**Resolvido, conferido em 2026-10-07.** O teto mora no esquema compartilhado
(`coordenadaGravadaSchema`, em `packages/shared/src/schemas.ts`), usado em toda
entrada que grava coordenada, inclusive o GPS do aparelho
(`evidenciaFotoSchema`), e o banco cobra o mesmo teto por `CHECK` (migração
030). O registro de antes:

O painel arredonda em seis casas o que lê do campo colado, e imprime seis na
tela da ocorrência e no mapa. O caminho do aplicativo de campo (GPS do
aparelho) não passa por aqui: ele grava o que o aparelho dá. Enquanto o teto
não existir no banco ou no esquema compartilhado, a mesma coluna guarda seis
casas quando veio do painel e quinze quando veio do celular, e as duas telas
mostram números com aparência de precisão diferente para o mesmo tipo de dado.

## 6. Telas de sessões e de redefinição de senha (V2-F00-E09): o que ficou de fora

Feitas: em Usuários, **Redefinir senha** e **Encerrar sessões** por linha (só em
quem o posto deixa administrar, nunca na própria conta, com confirmação que
repete o nome); a janela da **senha temporária**, mostrada uma única vez; em
Minha conta, **Minhas sessões** com a marca "Esta sessão" e o botão de encerrar
as outras. O modo de demonstração explica em vez de oferecer.

O que não é desta etapa e continua aberto:

1. **Reset do segundo fator de outra pessoa** (F03-E11), **tela consolidada de
   conta e segurança** (F10-E01) e **expurgo de IP e user-agent** (F05-E12).
2. **A senha temporária é conhecida por quem a sorteou** (IDN-18 do REL:06):
   quem administra a vê e a dita. Ela vale 72 horas e a primeira entrada exige
   troca, mas durante essa janela duas pessoas a conhecem. O fim disso é o
   convite por link de uso único (F03-E10).
3. **A lista de usuários em 390 px** rola na horizontal, com o aviso de sempre, e
   os quatro botões da linha ficam na última coluna, fora da primeira dobra. Foi
   deixado assim de propósito: transformar a tabela em cartões no celular é
   decisão de interface para a F10, e mexer nela aqui ampliaria o escopo.
4. ~~**O aviso passageiro no celular** (`Toast`) é desenhado em cima da barra de
   menu fixa de baixo.~~ RESOLVIDO na V2-F00-E13: a posição do aviso saiu do
   `style` do componente e foi para `.toast`, em `estilos/app.css`, onde o bloco
   responsivo o levanta a altura da barra (`--ds-touch` mais o respiro da
   própria lateral). O mesmo conserto deu fundo opaco ao aviso, porque no tema
   escuro os fundos de aviso são translúcidos (12%) e o texto da página
   atravessava a confirmação. Vale também para o aviso de registro da
   ocorrência.
5. **"Encerrar as outras"** preserva a sessão pelo identificador que o token traz
   (`preservarSessaoId`). Quem clica com um token de acesso emitido antes da
   última renovação derruba a sessão viva da própria cadeia (e o token cai em
   seguida). A lista de "Minhas sessões" já marca "esta" por família; alinhar o
   encerramento a ela é da F03-E02 (renovação em uma transação só).

## 7. Recuperação de senha por e-mail (V2-F00-E10): o que ficou de fora

Feitas: as duas telas (`/recuperar-senha` e `/redefinir-senha`) com todos os
estados (verificando, desligada, formulário, enviando, enviado, erro de campo,
limite de pedidos, falha de rede e de servidor, link que não vale mais, link
incompleto, senhas diferentes, senha curta, sucesso), o token fora da barra de
endereço, `Referrer-Policy: no-referrer` e `noindex` só nessas duas rotas, e o
pedido sem sessão (não leva token nem derruba a sessão de quem está logado).

O que não é desta etapa e continua aberto:

1. **O envio real de e-mail** (provedor e domínio verificado) é o CP-19. Até
   lá a produção segue desligada e a tela manda procurar quem administra.
2. **A política de referenciador é só das duas rotas**, e não do painel inteiro
   como o texto da etapa dizia: a chave do Google Maps é restrita por
   referenciador HTTP, e `no-referrer` global faria o Google recusá-la. As saídas
   dessas duas telas recarregam a página de propósito (para a política não seguir
   a pessoa para dentro do painel). Se um dia o mapa deixar de depender de
   referenciador, a política pode subir para o painel todo.
3. **O header só se vê na Vercel**: `vite preview` não aplica o `vercel.json`. A
   prova é o teste que lê o arquivo (`apps/web/test/recuperar-senha.test.ts`); a
   conferência na URL de produção fica para o primeiro deploy depois desta etapa.
4. **Sem mostrar a senha** (olho para ver o que se digita) e sem medidor de
   força: a etapa não pede, e a regra da casa é comprimento mínimo sem regra de
   composição. Fica como melhoria de interface da F10.
5. **A tela não sabe por quanto tempo o link vale** (o servidor decide por
   `RECUPERACAO_MINUTOS`), então diz "pouco tempo". Se o município quiser o número
   na tela, a leitura de `GET /auth/recuperacao` pode devolvê-lo.


## 8. Baixar o pacote de saída (V2-F00-E11): o que ficou de fora

Feitas: o botão chama `POST /saida/pacote.zip` (o caminho de antes, `/pacote.zip`, nunca
existiu: todo clique dava 404), passa por `chamar` (um 401 de token vencido renova UMA
vez e repete), a recusa do servidor chega à tela com a frase dele, a rede que cai
(inclusive no meio do arquivo) diz "O arquivo não foi baixado", e o endereço do arquivo só
é liberado 30 segundos depois do clique, para o download começar antes. Esse relógio vive
num `useEffect` com limpeza: a primeira versão usava um `setTimeout` solto dentro do
tratador do clique, que continuava de pé depois de a tela sair (o portão de
`test/portoes-de-componente.test.ts` reprova isso, e reprovou). Sair de Organização antes
dos 30 segundos libera o endereço na hora. A prova é a seção 28 de
`test/fluxo-api.e2e.mjs`, contra a API real.

O que não é desta etapa e continua aberto:

1. **Os outros downloads seguem com `fetch` solto**: `baixarCsvDeOcorrencias`,
   `abrirDocumento` e `abrirOficio` não renovam o token em 401 nem passam pela
   política de sessão morta. O mesmo conserto (`chamar` com `arquivo: true`) vale para
   eles. Fica para a E23 (teste de contrato geral) ou para a F10, que mexe nessas telas.
2. **O pacote ainda é montado inteiro na memória do servidor** antes do primeiro byte
   (F07-E06): o botão fica em "Gerando" durante todo esse tempo, sem barra de progresso,
   e o navegador também guarda o ZIP inteiro na memória da aba (`blob()`) antes de
   entregá-lo ao disco. Para um município grande isso pesa; o pacote em fluxo, sem
   memória, é da F07-E06 (o lado do navegador precisará acompanhar).
3. **A frase de quem não administra** vem de `exigirPermissao` ("Seu perfil não tem
   permissão para alterar os dados do município."): a verdade, mas fala em "alterar" onde
   a pessoa quis "baixar". Só aparece se o papel mudar com a tela aberta (a rota
   `/organizacao` já é fechada a quem não administra), então não pesa; reescrever a
   frase da rota para falar de saída é uma linha na API, a decidir com o texto do
   catálogo de permissões (F03).
4. **Município com o acesso suspenso não baixa o pacote** (a rota é uma escrita, e toda
   escrita confere a suspensão). É o comportamento que a etapa pediu e está provado, mas
   é uma decisão de contrato: se o município suspenso precisar poder sair, a rota precisa
   de exceção própria, e quem decide é Rafael com o jurídico (CP-29).

## 9. Vermelhos do painel e a entrada pela raiz (V2-F00-E13): o que ficou de fora

Feitos: `<Toast>` com `role="status"` nas gravações de `Usuarios.tsx`,
`Equipes.tsx` e `Orgaos.tsx`; o raio do ícone da marca saiu do `style` de
`Estrutura.tsx` e virou `.lateral__marca img { border-radius: var(--ds-radius) }`;
o portão de `acessibilidade.test.ts` passou a ler o COMENTÁRIO contíguo acima do
elemento, em vez de uma janela fixa de quatro linhas; rota índice em `App.tsx`
desviando a raiz para `telaInicial(papel)` e `rotaInterna` recusando `/` como
caminho de volta.

O que não é desta etapa e continua aberto:

1. ~~**O vermelho de CRLF** em `test/ocorrencia-encerramento.test.ts`~~.
   RESOLVIDO na V2-F00-E21 (`.gitattributes` e `test/ler-fonte.ts`): o painel
   fecha com zero falha.
2. **A barra de navegação em 390 px rola na horizontal** e isso continua sendo
   de propósito: dez destinos não cabem na largura, e o rótulo por extenso vale
   mais do que um ícone a adivinhar. Medido: `scrollWidth` 1484 contra
   `clientWidth` 390, toque arrasta, Tab alcança os dez. O que foi corrigido
   aqui é o Tab parar num item PELA METADE. Transformar a barra em outra coisa
   (menu "mais", ícones sem rótulo, abas) é decisão de interface da F10.
3. **A janela de milissegundos entre revogar e abrir sessão** na renovação
   continua como estava (F03-E02); esta etapa não tocou em sessão no servidor.

## 10. E2E de navegador e CORS do PUT de evidência (V2-F00-E18): o que ficou de fora

Feitos: o CORS da API libera `if-none-match` (o cabeçalho da escrita única que a URL de
envio manda repetir), nome a nome e sem mexer em `ORIGENS_PERMITIDAS`; com isso a seção
13 de `test/fluxo-api.e2e.mjs` sobe a foto pelo navegador e o arquivo inteiro roda de
ponta a ponta, no Chromium e no Firefox. Rodar o arquivo inteiro mostrou três coisas que
a cópia aparada escondia: a checagem de duplicidade dizia "Não foi possível carregar
esta tela" quando o sinal caía ao apertar "Registrar e gerar protocolo" (consertado em
`src/dados/http.ts`, travado por `test/duplicidade-sem-rede.test.ts`); a seção 15 contava
as linhas das três tabelas da Prestação de contas como se fossem da trilha (o teste
passou a achar a tabela pela legenda, registrado em
`docs/DECISOES-DE-TESTE-DA-FASE-00.md`); e `scripts/e2e-api.mjs` nunca terminava quando
tudo passava (agora sai e derruba a API e o painel). No Firefox, a miniatura da galeria (`loading="lazy"`)
precisou de rolagem e espera no teste, e os abortos de propósito das seções 19 e 27
entraram na lista de console esperado, cada um preso ao seu caminho.

O que não é desta etapa e continua aberto:

1. **O e2e contra a API no Firefox não roda no CI.** Corrigido em 2026-10-07
   (V2-F00-E22): este item dizia que os três e2e eram manuais, e não são. O
   trabalho `navegador` de `.github/workflows/verificar.yml` roda o modo local em
   Chromium e em Firefox e o caminho contra a API em Chromium. O que fica fora
   do CI é só o Firefox contra a API (`node scripts/e2e-api.mjs firefox`), e
   nenhuma rodada do CI foi conferida durante a F00 (validação humana pendente
   da V2-F00-E01).
2. **CORS por ambiente e por domínio** (F01-E10) e o CORS do armazenamento externo de
   verdade (F06-E15): esta etapa só exercitou o armazenamento local da própria API.
3. **Validação humana:** Rafael ver o upload da foto pelo painel concluir na seção 13.
