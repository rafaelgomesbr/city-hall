# Pendências do aplicativo de campo

O que este turno deixou pronto para o próximo pegar, e o que ficou fora da faixa
de `apps/campo/` e `packages/campo/`. Cada item diz o que precisa existir e por
quê, para o turno seguinte não ter que reconstruir o raciocínio.

## 1. O portão de autoria fechou do lado do servidor. Falta a tela reagir ao código

**Feito na API, em 09/09/2026.** O envelope passou a ter `coletadaPor`
(`packages/shared/src/schemas.ts`), `POST /sincronizacao/vistoria` compara esse
campo com o dono do token verificado e recusa a divergência com **409
`autor_divergente`**, e a tentativa recusada entra na trilha como
`vistoria_recusada_autor_divergente`, com quem apresentou o token e com o autor
que o envelope declarou. O portão do cliente continua onde estava, e agora ele é
a primeira barreira e não a única: binário adulterado ou defeito futuro em
`prontos` não produz mais laudo assinado por quem não estava lá.

Duas coisas ficaram decididas e precisam ser conhecidas antes de mexer aqui:

- **`coletadaPor` é OPCIONAL, e vai continuar sendo por enquanto.** Existe
  aparelho em campo com coleta gravada antes deste campo, com `autor: null`, e
  a fila não reenvia sozinha item que o servidor recusou pelo dado (a tela só
  oferece corrigir o rascunho, quando a coleta é da própria pessoa, ou
  descartar): campo obrigatório daria 422 do Zod para sempre nessas coletas, e
  uma vistoria de morro seria destruída por uma mudança de esquema. Ele pode virar obrigatório no
  mesmo dia em que o cartão "Sem autor registrado" puder sair daqui (item 5), e
  não antes.
- **O campo é montado na hora do envio**, a partir de `item.autor`
  (`envelopeComAutoria`, em `packages/campo/src/fila.ts`), e não gravado dentro
  do envelope no `enfileirar`. É o que faz `assumir` chegar ao servidor: a coleta
  antiga não tem autor no disco, alguém afirma com o dedo que ela é dele, e é
  esse nome que sobe.

**O que falta, e é desta faixa.** O que o aplicativo faz hoje com o 409, lido do
código e não suposto: `transporte.ts` transforma todo 4xx desta rota em
`FalhaPermanente`; `tratarFalha` não encontra `autor_divergente` em
`CODIGOS_SEM_DESTINO` e marca o item como `bloqueado`; a tela mostra a mensagem
que veio do servidor ("Esta coleta foi feita por outro agente. Entre neste
aparelho com a conta de quem fez a vistoria para poder enviá-la"), com os botões
de reenviar e descartar. Ou seja: existe saída, e ela não é destrutiva. O que
está torto é o caminho de volta:

1. **Quando o autor entra de novo no aparelho, o item continua `bloqueado`** e só
   volta a andar se alguém tocar em "Tentar enviar agora" naquele cartão. A
   correção certa é o motor devolver para `pendente` o item bloqueado em
   `autor_divergente` assim que a sessão aberta for a do autor dele, do mesmo
   jeito que o item aposentado pelo teto antigo já volta na leitura. Sem isso, a
   pessoa certa entra no aparelho e a coleta continua parada, sem nada dizendo
   que basta um toque.
2. **A frase pode dizer o nome.** O item bloqueado nesse código tem `item.autor`
   preenchido, então a tela pode dizer de quem é a coleta, como já faz no cartão
   "De outro agente", em vez de repetir a frase genérica do servidor.
3. **Enquanto isso não existir, não mexer no filtro em `prontos`** sem ler o
   comentário que está lá: é ele que impede a recusa de acontecer no uso normal.

## 2. ~~API: vistoria não pode morrer porque um arquivo sumiu~~ (feita)

**Resolvido, conferido em 2026-10-19 (V2-F00-E22, correção 4).** Este item
descrevia como pendente o que o código já tem. O envelope ganhou
`evidenciasPerdidas` (`packages/shared/src/schemas.ts`), o motor
`abrirMaoDasEvidenciasPerdidas` (`packages/campo/src/fila.ts`) solta o item que
travou por `arquivo_sumiu` quando o agente assume a perda, a tela da fila
pergunta antes (`fila.tsx`: "Enviar sem os registros perdidos", com a contagem
e a assinatura dita à parte), a API grava a perda em `vistoria_evidencias_perdidas`
(`apps/api/src/rotas/sincronizacao.ts`) e o laudo ganha a seção que declara a
causa (`apps/api/src/documentos/laudo.ts`). O pacote de saída de município
também leva a tabela (`docs/SAIDA-DE-MUNICIPIO.md`).

O que continua verdade do texto antigo, e vale conhecer: as fotos sobem ANTES do
envelope, de propósito (o laudo não pode apontar para arquivo que não existe), e
o aplicativo só marca como perdido o arquivo que SUMIU do disco (ou ficou com zero
byte), nunca decide sozinho jogar uma foto fora; a escolha de seguir sem ela é do agente, com a
frase na tela. Nada disto rodou em aparelho (item 7).

## 3. Aparelho que atualiza com foto antiga ainda no cache

**Dentro da faixa, não feito.** A cópia para o diretório de documentos vale da
captura em diante. Coleta que já estava na fila quando esta versão chegou
continua apontando para o cache do sistema, e continua sob risco de ser apagada
pelo sistema operacional antes de sincronizar.

O conserto é uma varredura única na abertura: para cada item da fila, copiar para
`Paths.document` o que ainda estiver no cache e reescrever o `uriLocal`. Não foi
feito aqui porque mexe em arquivo de aparelho e o teste possível fora do celular
é com sistema de arquivos falso, o que prova o algoritmo e não prova o aparelho.
Ver a nota de sempre em `LEIA-ME.md`: nada disto rodou em aparelho.

## 4. Coordenação: o que fazer com coleta de agente que não volta mais

O aparelho hoje oferece uma saída, e ela é destrutiva: descartar, com pergunta
que diz o nome de quem coletou. É o suficiente para o crachá poder zerar (crachá
que nunca zera é crachá que a pessoa aprende a ignorar), mas é pouco para uma
vistoria que foi feita de verdade.

O caminho certo passa pela coordenação, e ele não existe: alguém no painel
precisa conseguir dizer "esta coleta é da agente que saiu da prefeitura, aceito
recebê-la como tal", e o aparelho precisa de um verbo para isso. Enquanto não
existir, a orientação de plantão é a que está escrita na tela: chamar quem
coletou para entrar no aparelho com sinal, e avisar a coordenação com o
protocolo.

## 5. `assumir` só existe para coleta sem autor registrado

`assumir` (em `packages/campo/src/fila.ts`) carimba a sessão aberta como autora
de um item que não tem autor nenhum, o que só acontece em coleta gravada por
versão anterior a este turno. Ele NUNCA reescreve um autor existente, de
propósito: um toque bastaria para produzir o mesmo dado falso que o carimbo
inteiro existe para impedir.

Consequência a conhecer: quando não sobrar nenhum aparelho com coleta daquela
época, o verbo e o cartão "Sem autor registrado" podem ser removidos. Não antes.

Esse mesmo dia é o gatilho de outra mudança, e as duas andam juntas: é quando
`coletadaPor` pode deixar de ser opcional no envelope (item 1). Enquanto houver
coleta sem autor no disco de algum aparelho, tornar o campo obrigatório
transforma essa coleta em 422 permanente.

## 6. Devolução de tarefa vencida: o caminho do servidor é combinado, não conferido

**Dentro da faixa, feito, com uma ponta aberta.** A devolução sai por
`POST /sincronizacao/devolucao` (`packages/campo/src/transporte.ts`), com o corpo
exatamente no formato de `devolucaoDeTarefaSchema`. **Esse caminho foi escolhido
por simetria com `/sincronizacao/vistoria` e nunca foi exercitado contra a API**:
a rota estava sendo escrita por outra frente ao mesmo tempo que esta tela. Quem
pegar isto confere o nome do caminho e o formato da resposta (o aplicativo lê
`duplicada`, e trata qualquer 2xx como aceito) antes de instalar em aparelho.

Os códigos de recusa também são tratados por família e não por nome: qualquer
4xx vira falha permanente, o item fica `bloqueado` e a tarefa volta para a lista
com a frase que o servidor mandou. Isso funciona com qualquer código, mas
significa que a frase que o agente lê é a do servidor: se ela for técnica, o
agente lê texto técnico no barranco.

Duas decisões desta faixa que o próximo turno precisa conhecer:

- **A tarefa sai da lista na hora e o item fica na fila até o servidor
  confirmar.** Quem esconde a tarefa é o item da fila
  (`devolucoesPorOcorrencia`), e não uma marca separada. Quando a devolução é
  confirmada, a lista apaga a linha local (`esquecerPendencia`), porque o item
  confirmado sai da fila em trinta segundos e sem isso a tarefa voltaria a
  aparecer sem explicação.
- **Não se devolve tarefa que tem coleta guardada neste aparelho.** A trava está
  em dois lugares de propósito: na tela (com a frase escrita) e no motor
  (`enfileirarDevolucao` recusa com `coleta_na_fila`). A tela olha a fila E a
  lápide da coleta; o motor olha só a fila, que é o que ele enxerga.

## 7. Nada disto foi executado em aparelho

Continua valendo o que `LEIA-ME.md` já diz. Em especial, três coisas deste turno
só foram exercitadas com dublê: a cópia da foto para o diretório de documentos, a
leitura da fila durante a limpeza do logout, e a existência do arquivo no momento
do envio. As três dependem de `expo-file-system` real.

## 8. `expo-haptics` entrou, e a pasta `ios/` precisa ser gerada de novo

O retorno tátil (fotografia capturada, assinatura confirmada, vistoria
concluída, fila esvaziada) passou a depender de `expo-haptics`, que é MÓDULO
NATIVO. Consequência prática, e ela precisa estar escrita antes da próxima
compilação:

- **O binário instalado hoje no iPhone não tem a ponte.** Ele foi compilado
  antes desta dependência existir. `src/ui/retornoTatil.ts` engole a falha de
  propósito (um aplicativo que quebra por não conseguir vibrar seria pior do que
  um que não vibra), então o aplicativo continua funcionando ali: ele
  simplesmente não vibra.
- **Antes da próxima instalação:** `npx expo prebuild` e `pod install`. Sem
  isso, o módulo não é ligado e o retorno tátil nunca será exercitado.
- **E o portão do `entitlements` precisa passar depois disso.** Foi exatamente
  uma regeneração de `ios/` que esvaziou aquele arquivo e quase matou o push, e
  é por isso que `scripts/entitlements-do-ios.test.mjs` existe. Rode o portão
  inteiro DEPOIS do prebuild, e não só antes.

**Nada do retorno tátil foi sentido em aparelho.** Os testes provam qual chamada
sai para qual momento e em qual plataforma; se o motor treme, e como treme, só o
iPhone na mão diz. O caminho do Android em particular (`performAndroidHapticsAsync`,
escolhido porque é o único que respeita a preferência de retorno tátil do
sistema) nunca rodou em Android nenhum, porque não há aparelho Android no projeto.

## 9. As três dívidas de design, FECHADAS em 14/09/2026

Esta seção listava três coisas que a revisão adversarial achou e não consertou,
porque as três eram decisão de quem desenha o produto e nenhuma delas tinha
saída neutra. A identidade 2.0 (frente F1 da Onda 1) fechou as três, e cada uma
saiu junto da lista de dívida do portão de design: `SEM_DONO_DECLARADO`, em
`scripts/portao-design-do-aplicativo.test.mjs`, está vazia de novo.

O registro fica porque o que importa guardar não é o conserto, é o ARGUMENTO que
desfez cada recusa. Este repositório trata ausência como recusa argumentada, e
desfazer uma exige argumento melhor que o escrito.

### 9.1 `elevacao(tema).folha` não tinha um único uso. Agora tem

**O que estava escrito:** o nível descia a sombra 12 pontos, ou seja, tinha sido
desenhado para uma folha que PAIRA, e a única folha do produto é colada no
rodapé, onde essa sombra cai para fora da tela. Espalhar o nível pela metade era
o que a declaração do token proíbe, e inverter a direção no ponto de uso seria
decidir a escala de elevação dentro de um componente. A escolha entre acertar o
nível e aposentá-lo ficou para quem desenha o produto.

**O argumento que faltava:** nenhuma folha deste aplicativo paira, e nenhuma
vai. O cabeçalho de `Dialogo.tsx` recusa a folha no meio da tela com o motivo
escrito (o polegar de quem segura o telefone com uma mão só não alcança o meio
sem regripar), e a folha arrastável sobre o mapa nasce ancorada embaixo pelo
mesmo motivo. Um nível desenhado para uma classe de peça que o produto decidiu
não ter é um nível ERRADO, e não um nível sem uso. Aposentá-lo custava mais: a
folha passaria a pedir emprestado o `flutuante`, cuja declaração diz outra coisa,
e o topo da escala viraria o nível do meio.

**O que mudou:** `folha` passou a projetar a sombra para CIMA (`shadowOffset`
com altura negativa), que é a única borda visível de uma folha colada no rodapé,
e o `Dialogo` espalha o nível inteiro. O defeito visível foi junto: no tema
escuro a folha estava em `superficie`, a mesma superfície de um cartão comum, e
agora clareia para `superficie2`, que é como o produto separa camada no escuro.

### 9.2 `fonte.corpoG` era um degrau que nenhuma peça sabia pedir. Foi aposentado

**O que estava escrito:** a escala declarava oito degraus e o `Txt` expunha
sete; passar `corpoG` devolvia `fontSize: undefined`. Abrir a variante criaria um
tamanho novo na interface, e apagar o degrau tiraria da escala um passo que o
painel TEM (`--ds-fs-body-lg`).

**O argumento que faltava, e ele é um número conferido:** `--ds-fs-body-lg` vale
**18** no painel, e 18 é exatamente o `h3` daqui. O passo do painel não se perde,
porque ele já estava nesta escala com outro nome. O que `corpoG` acrescentava era
um **17** que o painel não tem em lugar nenhum, a um ponto de cada vizinho. E um
ponto não é degrau: a identidade 2.0 é hierarquia por escala, e três tamanhos
dentro de dois pontos, bem no meio da escala onde vive o texto que a pessoa lê,
são a tela em que tudo tem o mesmo peso.

**O que mudou:** `fonte.corpoG` e `linha.corpoG` saíram. `hierarquia.test.ts`
reprova qualquer degrau a menos de dois pontos do vizinho, então a escala não
volta a se fechar em silêncio.

### 9.3 `fonteMinima` queria dizer duas coisas. Agora diz uma

**O que estava escrito:** `tokens.ts` declarava `fonteMinima = 14` com a frase "o
texto da interface nunca encolhe abaixo disto". Lida como piso de redução
dinâmica, `legenda` (12) continua degrau legítimo; lida como piso da escala, 12
está proibido. `Chip.tsx` leu do segundo jeito, a tela de vistoria também, e foi
essa ambiguidade que fez duas frentes construírem duas pílulas diferentes. As
saídas eram subir 29 rótulos de 12 para 14 (mudança de densidade em cinco telas
que ninguém viu em aparelho) ou estreitar a frase.

**O argumento que decidiu, e ele não é empate:** o aplicativo não tem, e nunca
teve, nenhum mecanismo de redução dinâmica de fonte. Nenhuma linha do produto
consultava esse valor para encolher coisa alguma; a constante só aparecia em
teste. Das duas leituras, uma descrevia um mecanismo inexistente.

**O que mudou:** o token passou a se chamar `fonteMinimaDeInteracao`, que só
admite uma leitura, e a fronteira virou DADO e não disciplina: `hierarquia.ts`
tem o degrau `interacao` (piso de 14, para o que se toca ou nomeia o que se toca)
e o degrau `apoio` (12, para o que ninguém toca). O nome ambíguo não volta: o
portão de design reprova quem escrever `fonteMinima` de novo.

## 10. O que a identidade 2.0 deixou aberto

- **Nada disto foi visto em aparelho.** A régua de hierarquia, o gradiente do
  botão primário e a sombra que sobe na folha foram provados por teste e por
  portão, e nenhum deles foi olhado num iPhone. A reclamação de origem foi
  visual, e prova visual exige o aparelho na mão.
- ~~**A cascata de entrada de lista não tem uso ainda.**~~ Passou a ter, conferido
  em 2026-10-19: `atrasoEmCascata()` é chamada em quatro telas (`avisos.tsx`,
  `fila.tsx`, `index.tsx` e `perfil.tsx`), pelo `ItemDeLista`. O que resta do
  argumento original é a régua de densidade: uma quinta tela deve usar o mesmo
  ritmo, e não escolher o dela.
- **A altura de linha própria para a fonte tabular NÃO foi criada**, e a
  ausência é deliberada: a Roboto Mono tem métrica diferente da Work Sans, e um
  protocolo ao lado de texto de corpo pode desalinhar a linha de base, mas isso
  se mede olhando a tela, e não deduzindo. Token criado por dedução é token que
  nasce sem dono.

## 11. O agente sem equipe perde o próprio histórico, e a correção é do servidor

**Achado pela frente F7 da Onda 2, em 14/09/2026, ao ligar `totalConcluidas`.**

`GET /campo/meu-trabalho` tem um atalho no começo: agente sem `equipe_id`
recebe `{ equipe: null, colegas: [], designadas: [], concluidas: [] }` e a função
retorna ali mesmo, ANTES de contar as vistorias. Os dois números novos
(`totalConcluidas` e `tetoDeConcluidas`) também não saem nesse ramo.

O caso que isso produz é real e não é raro: o agente que foi retirado da equipe
(mudou de setor, saiu de férias, a equipe foi desativada e recriada) abre o
Perfil e lê **zero vistorias concluídas**, depois de ter assinado dezenas. As
vistorias existem, estão em `vistorias` com o `agente_id` dele, e a consulta que
as conta simplesmente não roda.

O lado do aplicativo já está preparado: `normalizarMeuTrabalho`
(`src/dados/api.ts`) dá padrão aos dois campos, então o ramo sem equipe mostra o
tamanho da lista em vez de estourar. Só que a lista também vem vazia, e aí o
padrão devolve zero de verdade.

**O conserto é de uma linha e mora no servidor**, fora desta faixa: mover o
`SELECT count(*)` e a consulta de concluídas para ANTES do atalho, e devolvê-los
nos dois ramos. A equipe é o que decide o que ele tem PARA FAZER; o histórico
é o registro do que ele JÁ FEZ, e os dois não dependem um do outro.

## 12. O sino do aplicativo não sabe o que o push já entregou

**Declarado pela frente F7 da Onda 2, em 14/09/2026.**

O sino (`GET /avisos`, em `src/dados/avisos.ts`) e o push são dois canais
independentes para o mesmo assunto, e nenhum dos dois conhece o outro. Duas
consequências, e nenhuma delas quebra nada hoje:

- **Os tipos não se sobrepõem, por acaso e não por projeto.** O push manda
  `tarefa_nova` e `prazo_vencendo`; o sino carrega `vistoria_recebida`,
  `prazo_vencido`, `providencia_respondida` e `retorno_nao_confirmado`. Se um dia
  o push passar a mandar um tipo que o sino também tem, o agente recebe o mesmo
  fato duas vezes, e não há nada nomeando essa relação.
- **Tocar na notificação não marca o aviso como lido.** As duas coisas moram em
  tabelas diferentes no servidor, e ligá-las exige decidir o que "lido"
  significa quando a pessoa só viu o texto na tela bloqueada.

O sino sincroniza quando a tela de avisos abre (se há sinal, ou se ainda não há
cópia no aparelho) e quando a pessoa puxa a lista para atualizar, e não em
segundo plano: o crachá na barra de abas mostra o que o último
`sincronizarAvisos` trouxe. É escolha e
não descuido (rede em segundo plano gasta bateria e dado do agente no morro),
mas quem olhar o crachá esperando tempo real vai se enganar.

## 13. O menu de vidro: `expo-blur` entrou, o vidro só existe no iOS, e nada foi visto em aparelho

**Frente do menu, 15/09/2026.** O menu inferior voltou a flutuar (`src/ui/BarraDeAbas.tsx`),
agora como pílula de vidro, e junto com ele entrou a correção da aba que ficava
escura (a causa e a regra estão no cabeçalho de `src/app/(agente)/_layout.tsx`).
Três coisas ficam para o próximo turno saber antes de mexer:

- **`expo-blur` é MÓDULO NATIVO**, na mesma situação do `expo-haptics` (item 8):
  o binário que está no iPhone não o contém. Antes da próxima instalação,
  `npx expo prebuild` e `pod install`, e o portão de `entitlements` DEPOIS do
  prebuild. Sem isso o `BlurView` não é ligado e a pílula aparece sem desfoque.
- **O vidro só existe no iOS.** No Android o `expo-blur` só desfoca de verdade
  com `blurMethod` de "dimezis" mais um `BlurTargetView` envolvendo o que está
  por BAIXO do menu, e o navegador não expõe esse ponto (a barra é irmã das
  cenas, dentro dele). Sem o alvo, o que ele desenha é tinta translúcida sem
  desfoque, ou seja, texto da lista lido pela metade atrás do texto do menu.
  Então no Android a pílula é a reserva opaca de `elevacao(tema).flutuante`,
  com a mesma forma, a mesma sombra e o mesmo indicador (`VIDRO_DISPONIVEL`,
  em `BarraDeAbas.tsx`). Vidro no Android é trabalho declarado, não feito.
- **A sombra da pílula no iOS é calculada por pixel**, porque o fundo dela é
  transparente para o desfoque enxergar a lista (o `RCTViewComponentView` só
  usa o contorno quando o fundo é opaco). É uma pílula só e ela não muda de
  tamanho; se algum dia aparecer travando, o preço está aqui nomeado.

E o que as telas ainda precisam ligar: **`useRecuoDoMenu()`** no
`contentContainerStyle.paddingBottom` de toda tela rolável, porque a pílula
paira sobre a cena e ninguém mais reserva o espaço dela. Enquanto uma tela não
chamar, o último item dela morre atrás do vidro.

Nada disto foi visto em aparelho: a pílula, o indicador deslizando, o anel do
Perfil e o cabeçalho mais alto para o sino foram provados por teste e por
portão, e a reclamação de origem era visual.

## 14. A fila pausa pela sessão e pela conta (V2-F00-E06). Falta ver no aparelho

**Feito em 2026-10-06.** O transporte (`packages/campo/src/transporte.ts`) lê
os três códigos do catálogo de `@dc360/shared` e a fila deixou de bloquear coleta
por recusa de sessão:

| Resposta da API | O que o aparelho faz |
| --- | --- |
| 401 `nao_autenticado` | pede UM token novo (`obterToken({ renovarJa: true })`, com a trava e o piso de `dados/token.ts`) e repete o pedido; se o token não mudou ou o pedido falha de novo, é `sessao_encerrada` |
| 401 `sessao_encerrada` (e 401 sem código) | a fila para, o item fica `pendente`, a pessoa entra de novo e a coleta sobe com a mesma chave |
| 403 `conta_desativada` | a fila para, o item fica `pendente`; entrar de novo não resolve, a coordenação reativa a conta |
| 403 `sem_permissao` e as demais recusas de 4xx | continuam bloqueando o item (recusa do dado) |
| sem token no aparelho | é `sessao_encerrada` (antes era `FalhaPermanente`, e o item bloqueava) |

`ResultadoDreno.paradaPor` diz qual das duas pausas; `ResumoFila.pausadaPor`
alimenta a faixa do topo, o aviso no alto da tela de envio e o cartão da coleta
("Guardada"). Só a sessão encerrada traz o botão "Entrar de novo" (o mesmo ato
da lista de hoje, que não apaga nada). As frases moram em `src/dados/pausa-da-fila.ts`.

Duas decisões que o próximo precisa conhecer:

- **A pausa vive só na memória da fila**, e é da pessoa que estava logada. Se o
  aplicativo for fechado, a primeira tentativa depois de aberto descobre de novo
  com uma requisição. Quando a fila acha que não há nada seu para enviar, a
  pausa é limpa: ela não aparece para quem entrou depois.
- **O laço de fundo espera 60 s, e não 15 s, enquanto a fila está pausada**
  (`ESPERA_COM_A_FILA_PAUSADA_MS`): cada volta é uma requisição que o servidor já
  recusou. Entrar de novo reinicia o laço na hora.

**Correção 1 da V2-F00-E06 (2026-10-13): o 403 `troca_de_senha_obrigatoria` agora
PAUSA a fila.** A decisão que a E07 tinha registrado aqui (deixá-lo como recusa
permanente, "porque o aparelho praticamente não chega a ele") foi derrubada pela
validação: redefinir a senha derruba as sessões (401, pausa), o agente entra com a
senha provisória, o aplicativo ignora `trocaDeSenhaObrigatoria` e o dreno recebia
403 em toda escrita. Todas as coletas viravam `bloqueado`, o dreno não parava e o
cartão oferecia "Descartar", que apaga coleta que o servidor nunca recebeu. É
perda de dado, e o caso é o procedimento padrão de recuperação de conta.

Matriz final do transporte (`falhaDaResposta`), lida pela AÇÃO do catálogo e não
por lista de códigos:

| Resposta | Fila |
| --- | --- |
| 401 de qualquer código (inclui sem código) | pausa `sessao_encerrada` (antes renova UMA vez no `nao_autenticado`) |
| 403 `conta_desativada` (ação `parar_e_avisar`) | pausa `conta_desativada` |
| 403 `troca_de_senha_obrigatoria` (ação `trocar_a_senha`) | pausa `troca_de_senha_obrigatoria` |
| 403 `acesso_suspenso` (ação `aguardar_o_contrato`) | temporária (a API já responde 503 à fila; este é o cinto) |
| 403 `sem_permissao` e 403 sem código | permanente: recusa do papel, bloqueia |
| 409 `autor_divergente` | permanente por desenho (a coleta espera a conta de quem a fez) |
| 409 `ja_encerrada` | arquivada |
| 5xx, 429, rede | temporária |

Como o aplicativo NÃO tem tela de troca de senha, a pausa não traz botão: a frase
(`src/dados/pausa-da-fila.ts`, `troca_de_senha_obrigatoria`) manda definir a senha
no painel, no computador, e entrar aqui de novo, e promete que as coletas continuam
guardadas. A mesma classificação vale para as telas que vão à rede
(`falha-de-atualizacao.ts`, motivo `troca-de-senha`). **A frase é texto de produto e
precisa da aprovação do Rafael.** Quando o aplicativo ganhar a tela de troca de
senha, o ato certo passa a ser levar a pessoa a ela na entrada
(`trocaDeSenhaObrigatoria` do login), e a pausa vira o cinto.

Na mesma correção, a pausa passou a ser do AUTOR do item (e não de quem está
logado quando a resposta chega), um 401 tardio de um dreno cancelado não devolve a
`pendente` item que outro dreno já confirmou, e o motor refaz a pergunta "ainda é a
conta do autor?" antes de CADA chamada do item (autorização, bytes, confirmação,
envelope). O servidor fecha o resto: autorizar e confirmar o envio de foto conferem
o autor (409 `autor_divergente`).

**O que falta** (validação humana): ver a frase e a coleta preservada em
aparelho ou emulador, desativando o agente no painel durante uma coleta na fila,
e a reativação seguida de nova entrada; e redefinindo a senha do agente. O ambiente
não renderiza o app Expo; a prova foi por teste de componente
(`src/ui/fila-pausada-pela-sessao.test.tsx`), e a foto do aparelho continua pendente.

**Ainda aberto, anotado pela validação e fora desta correção:**

- Rebaixar o PAPEL de um agente com coleta na fila (403 `sem_permissao`) bloqueia
  tudo, com "Descartar". É o que o bloco da E06 manda ("continua permanente"), mas
  o efeito para a coleta é o mesmo que a etapa eliminou para a desativação. Decisão
  do Rafael: pausar ou continuar bloqueando.
- `descartar` aceita item de outro autor em qualquer estado (aparelho compartilhado:
  o agente A pode apagar a coleta guardada do agente B, com confirmação nominal).
- A recusa por autor divergente na FOTO não deixa evento na trilha (a da vistoria e
  a da devolução deixam, com tipo próprio). Fica só o aviso no log do servidor.
- 401 `nao_autenticado` dentro do piso de 60 s do obtentor pausa como
  `sessao_encerrada` quando só faltava esperar; corrige sozinho no próximo dreno.

### Correção 2 da E06 (2026-10-14): uma fila só por aparelho, e o cartão da tarefa não pede sinal quando a fila está pausada

Três coisas mudaram, todas presas por teste de componente ou de módulo com a fila de
produção:

- **`obterFila` (`src/dados/fila.ts`) devolve UMA instância por dono, também sob
  chamadas simultâneas.** A variável de módulo guarda a PROMESSA da fila, atribuída de
  forma síncrona antes de qualquer `await`. Antes, a faixa global, a barra de abas, o
  laço de fundo e a tela da fila passavam todas pela conferência com a variável ainda
  nula e cada uma montava a sua fila; a pausa nascia numa fila que ninguém mais
  escutava e a faixa dizia "Tudo sincronizado" com a sessão encerrada. Uma criação que
  falha não fica gravada, mas `bancoLocal()` memoiza a própria promessa rejeitada: um
  banco que falhou ao abrir continua falhando até `esquecerConexao()` ou o aplicativo
  ser reaberto.
- **O cartão da tarefa não manda esperar sinal quando a fila está pausada.** Com a
  coleta guardada e a fila parada pela sessão, pela senha provisória ou pela conta
  desativada, o cartão dizia "O que falta é sinal para enviar" enquanto a faixa dizia
  "Sessão encerrada". `ordemDoDia` recebe `pausadaPor` (opcional) e, no caso "a
  primeira da lista já foi vistoriada", usa a frase `daLista` de `pausa-da-fila.ts`
  (uma por motivo: entrar de novo, a coordenação reativar a conta, definir a senha no
  painel e entrar de novo). A tela de tarefas (`index.tsx`) guarda a pausa que a fila
  entrega no resumo e a passa à ordem. O mapa não mostra essa frase. Texto de produto
  novo: precisa da aprovação do Rafael.
- **`troca-de-conta-com-pedido-em-voo.test.ts` não depende mais da ordem dos casos**
  (recarrega o módulo e zera banco e `fetch` em cada caso); reprovava com
  `--randomize` em quatro das oito sementes.

Continua sem prova de aparelho: esta correção não foi vista em emulador nem em aparelho
(a validação anterior exercitou o emulador Android sobre o código sem ela; ver o
`LEIA-ME.md`). As capturas da correção (`docs/evidencias-v2/G00/V2-F00-E06/correcao-2/capturas/`) são de
nível E1+ (a árvore real em Chromium, sem a barra de abas nem a fonte do aparelho).

## 15. Sair da conta avisa o que apaga, e o GPS bom conclui (V2-F00-E15). Falta ver no aparelho

**Feito em 2026-10-07.** Dois defeitos reais (CMP-52 e CMP-33):

- **Sair da conta.** A saída explícita apaga o dado local (`apagarDadosLocais`),
  e isso inclui a vistoria começada: rascunho, fotos e assinatura. O diálogo só
  contava a fila, lida uma vez na montagem. Agora o Perfil assina a fila por
  `useResumoDaFila` (chip, aviso de esperar e diálogo acompanham a fila ao
  vivo), e no toque em "Sair da conta" lê `listarRascunhos`; o texto vem de
  `src/dados/aviso-da-saida.ts`: quantas vistorias começadas, se há fotos e
  assinatura, e que **sair apaga**, com singular e plural; o que se apaga vem
  antes do que fica guardado (a fila, que a saída NÃO apaga). Sem rascunho e
  sem fila, volta à frase curta. Se o disco não responder, avisa do mesmo
  jeito. O botão de confirmar continua o destrutivo.
- **GPS.** `Math.round(0.3)` era 0 e o esquema recusa 0 (422). O aparelho grava
  `precisaoDoGpsEmMetros` (`src/dados/precisao-do-gps.ts`): piso de 1 metro,
  nulo quando não informada. O esquema não afrouxou (`gpsPrecisaoMetrosSchema`,
  em `@dc360/shared`, continua `positive()` e recusa em português).

`useResumoDaFila` passou a reassinar só quando a PESSOA muda (`usuarioId`), e não
a cada função ou objeto novo da sessão: reassinar devolvia o número do instante da
assinatura e prendia a tela no valor velho.

**O que NÃO mudou, de propósito:** a regra de apagar. Preservar o rascunho depois
de sair é decisão do CP-24 (F14-E02); criptografia local é F14-E04. A sessão
vencida ("Entrar de novo") continua sem apagar nada, e outra pessoa que entra
continua recebendo o aparelho limpo (`acolherNoAparelho`). A fila e os arquivos
que ela usa continuam fora da limpeza (`src/dados/sair-e-entrar-nao-perde-a-coleta.test.ts`).

**O que falta** (validação humana): os dois fluxos num aparelho ou emulador
(LEIA-ME, passo 8), com foto do diálogo; a prova física é F14-E12. Achado fora
do escopo: o laudo (`packages/shared/src/minuta.ts`) e o cartão de vistoria
concluída do Perfil escrevem "N metros" sem singular, e com o piso de 1 metro
"1 metros" passa a ser comum; fica para a etapa que mexer nesses textos.

### Correção 1 da E15 (2026-10-13): "Entrar de novo" na tela da vistoria, e o que sobrou da LGPD

**Feito.** A tela da vistoria oferecia "Sair e entrar de novo" quando a baixa dava
401, e o botão chamava `sair()`, que apaga rascunho, fotos e assinatura sem avisar.
Agora ela oferece "Entrar de novo" e chama `encerrarSessaoVencida`, como a lista de
tarefas e a fila. Não há mais nenhum `sair()` no app fora do diálogo "Sair da conta?"
do Perfil. O outro apagamento, `acolherNoAparelho` (quando OUTRA pessoa entra num
aparelho com dado de turno), é a regra de isolamento entre agentes e continua; o
agente que perde o rascunho por isso não é avisado na hora, porque quem está na tela
é o colega, e esse aviso é a decisão do CP-24 (F14-E02).

**Achados de LGPD da validação, abertos e SEM dono de código ainda** (nada disto é
da correção 1; a validação classificou como "corrigir antes de crescer"):

1. **A fila e os arquivos dela ficam no aparelho sem prazo**, inclusive depois que
   outro agente entra (envelope com CPF e coordenada, fotos, assinatura). Dono
   provável: F05-E09 (retenção por classe) para o prazo, e F14-E02 para o item de
   outro autor e o item bloqueado.
2. **JPEG e PNG de coleta já enviada ou descartada só saem no logout**, que o agente
   raramente faz. Dono: F14-E15 (já escrita para isso, com `limparMidiaConfirmada`).
3. **O original da câmera no cache nunca é apagado** (`takePictureAsync` copia para
   `Paths.document`, o original fica em `Paths.cache`, que nada limpa). Dono
   provável: F14-E15, ou F14-E04 junto da criptografia das fotos. A F14-E15 hoje
   NÃO cita o cache: quem a implementar precisa acrescentar.
4. **Coordenada gravada com 6 casas** (cerca de 0,11 m, `vistoria/[id].tsx`), mais
   fina que o GPS informa; 5 casas bastariam. Dono provável: F05-E10 (minimização).
5. **Resíduo de WAL e páginas livres do SQLite** depois de `DELETE` sem `VACUUM`.
   Risco baixo (armazenamento privado do aplicativo). Dono: F14-E04.

## 16. A vistoria diz a verdade sobre o envio, respeita teclado e área segura, e abre os ajustes (V2-F00-E16). Falta ver no aparelho

**Feito em 2026-10-07.** Defeitos reais CMP-35 e CMP-89, na tela de vistoria
(`src/app/(agente)/vistoria/[id].tsx`):

- **A frase do envio.** A tela de "vistoria guardada" prometia que a coleta subia
  "mesmo com o aplicativo fechado", e não existe sincronização em segundo plano.
  Agora o título é "Ela sobe com o aplicativo aberto" e o texto diz que ela sobe
  quando o aplicativo estiver aberto e houver rede, e que a fila de envio mostra
  o andamento.
- **O teclado.** O formulário ganhou `keyboardShouldPersistTaps="handled"` (o
  primeiro toque em "Tirar foto" com o teclado aberto age) e
  `automaticallyAdjustKeyboardInsets` (no iOS o campo digitado não fica embaixo
  do teclado; no Android o sistema redimensiona a janela).
- **A câmera.** A barra do obturador e de "Voltar sem fotografar" soma a área
  segura de baixo (`useSafeAreaInsets`) ao próprio recuo.
- **Permissão negada.** As tarjas de câmera e de localização negadas ganham
  "Abrir os ajustes do aparelho" (`Linking.openSettings`, mesmo padrão das
  notificações no Perfil), com "Fechar" logo abaixo. Falha de outra natureza não
  ganha o botão, nem quando vem logo depois de uma de permissão: a frase e o
  "abre os ajustes" moram no mesmo estado.
- **Foto vazia.** `fotografar` mostra a frase de `guardarFotoNoAparelho` ("Tire a
  foto de novo") em vez da genérica. A cópia recusada pelo sistema (disco cheio)
  também sai em português, de `src/dados/evidencia-no-disco.ts`. A câmera que não
  dispara continua com a frase genérica, porque o erro nativo vem em inglês.

**O que NÃO mudou, de propósito:** sincronização em segundo plano (F14-E06, só se
o CP-24 aprovar), acessibilidade completa do app (F14-E10), ErrorBoundary
(F14-E07).

**O que falta** (validação humana, F14-E12): no iPhone (e em Android real quando
houver), negar a câmera e tocar em "Abrir os ajustes do aparelho" (abre os
Ajustes); digitar o nome de quem assina com o teclado aberto e tocar em "Tirar
foto" no primeiro toque; ver o obturador acima da barra do sistema. Foto do
aparelho para a evidência da etapa. O ambiente da etapa não renderiza o app Expo:
a prova foi por teste de componente
(`src/__tests__/vistoria-o-teclado-a-camera-e-o-que-ela-promete.test.tsx`).

### Correção 1 da E16 (2026-10-13): a fila também prometia segundo plano

A validação (arbitragem em Opus) achou "o envio acontece sozinho, em segundo
plano" em duas frases da fila (`fila.tsx`). A varredura do aplicativo inteiro
achou a mesma promessa, com outras palavras, em 12 frases de 5 arquivos (fila,
lista de tarefas, vistoria guardada, pausa da sessão e acesso suspenso). Todos
passaram a dizer a condição: **"quando o aplicativo estiver aberto e houver
sinal"**. O portão `scripts/portao-sem-promessa-de-segundo-plano-do-aplicativo.test.mjs`
impede a volta (varre a fonte, menos comentários). Frases novas são texto de
produto e aguardam a aprovação do Rafael (lista no `RESUMO.md` da correção).
Segundo plano de verdade continua sendo a F14-E06, só se o CP-24 aprovar.

### Correção 2 da E16 (2026-10-14): a cópia da foto é esperada, o contraste sobre o visor e o portão por classe

- **A cópia da foto é assíncrona e agora é esperada.** No `expo-file-system` 57,
  `File.copy` devolve uma `Promise`; `guardarFotoNoAparelho` (`src/dados/evidencia-no-disco.ts`)
  chamava sem `await` e lia o tamanho antes de a cópia existir, de modo que no emulador
  Android toda foto era recusada como "o arquivo saiu vazio", com o JPEG inteiro órfão no
  disco. Agora o `await` fica dentro do `try` (a recusa do sistema, como disco cheio, chega
  como Promise rejeitada e sai em português), e foto vazia ou cópia pela metade apaga o
  destino antes de a recusa subir. O dublê de `File` do teste foi reescrito para o
  contrato real (`copy` assíncrona, `copySync` síncrona, `size` zero para arquivo que não
  existe); trocar `copy` por `copySync` também passa.
- **O botão sobre a câmera é legível.** "Voltar sem fotografar" media 1,19:1 de rótulo
  sobre o visor preto no tema claro (exigido 4,5:1). As peças sobre o visor agora leem o
  tema escuro nos dois temas (`SobreOVisor`, em `ui/componentes.tsx`, sem cor nova): rótulo
  18,46:1 e contorno 8,81:1. Um teste mede o estilo renderizado nos dois temas do aparelho
  (rótulo de pelo menos 4,5 e contorno de pelo menos 3).
- **A fila deixou de prometer que continua sozinha.** O cartão "Aguardando" com muitas
  tentativas diz "Já tentou Nx e vai continuar tentando enquanto o aplicativo estiver
  aberto. A conexão daqui não está completando o envio." (`fila.tsx`).
- **O portão `scripts/portao-sem-promessa-de-segundo-plano-do-aplicativo.test.mjs` passou
  a ser por classe, e não por lista de frases:** reconhece o afastamento (fechar, minimizar,
  bloquear, sair do aplicativo...) e a promessa (enviar, subir, terminar, continuar...) por
  radical do verbo, e reprova a frase que junta as duas sem a condição "aberto". Medido
  contra 22 promessas plantadas: a regra da rodada anterior deixou passar 15, a por classe
  deixa passar 0. O arquivo tem 15 casos.

Continua valendo: nada disto foi visto num aparelho (o que a cópia faz no `expo-file-system`
real do iPhone ou do Android é o que só o aparelho responde).

## 17. `expo-doctor` deu 20 de 21 por patches novos do Expo (V2-F00-E19, correção 1; RESOLVIDO em 2026-10-13, correção 2; reaberto e RESOLVIDO de novo em 2026-10-14, correção 4)

**RESOLVIDO DE NOVO em 2026-10-18 (V2-F00-E19, correção 5).** O estado atual é **21 de 21**.
Em 2026-10-18 (linha de base sobre `6d9d09f`) o `npx expo-doctor` voltou a dar **20 de 21**
pela mesma verificação de versões: `expo` 57.0.29 contra ~57.0.30 e `expo-router` 57.0.27
contra ~57.0.28. O código não mudou; o Expo publicou patches. `npx expo install
expo@~57.0.30 expo-router@~57.0.28` em `apps/campo` mudou só `package.json` e
`package-lock.json` (o lock puxou os transitivos do Expo, como `@expo/cli` e
`babel-preset-expo`), e o `expo-doctor` deu **21 de 21**. Prova em
`docs/evidencias-v2/G00/V2-F00-E19/correcao-5/`. **PREMISSA, dita como premissa:** o Rafael
não decidiu isso para estes dois pacotes; o tratamento é o mesmo da D1 por analogia, e a
confirmação dele está pendente (H24). O que segue é o registro das correções anteriores.

**RESOLVIDO DE NOVO em 2026-10-14 (V2-F00-E19, correção 4).** O estado atual é **21 de 21**.
Na manhã de 2026-10-14 (medido na rodada de conserto da V2-F00-E22), o `npx expo-doctor`
em `apps/campo` voltou a dar **20 de 21**, pela mesma verificação ("Check that packages match
versions required by installed Expo SDK"): o Expo publicou mais patches depois da subida de
2026-10-13, e cinco pacotes ficaram um patch atrás (`expo` 57.0.28 contra ~57.0.29,
`expo-constants` 57.0.21 contra ~57.0.22, `expo-linking` 57.0.12 contra ~57.0.13,
`expo-notifications` 57.0.22 contra ~57.0.23 e `expo-router` 57.0.26 contra ~57.0.27). Saída em
`docs/evidencias-v2/G00/V2-F00-E22/correcao-2/saidas/`. No mesmo dia o coordenador rodou
`npx expo install --fix` em `apps/campo` (só `package.json` e `package-lock.json` mudaram) e
o `expo-doctor` deu **21 de 21**; `npm run auditar` com código 0, jest do aplicativo 1927 de
1927 e linha de base completa no Mac 15 de 17 (os dois que divergem são de máquina:
`teste-api` por causa do LibreSSL e `test-scripts` por causa de `apps/campo/ios/`). Prova em
`docs/evidencias-v2/G00/V2-F00-E19/correcao-4/`. **PREMISSA, dita como premissa:** o Rafael
decidiu (D1, 2026-10-13) atualizar os seis pacotes anteriores; **não decidiu** isso para
estes cinco. O coordenador aplicou o mesmo tratamento por analogia, e a confirmação do
Rafael está pendente (o patch da pasta reverte com `git apply -R`). Não foi provado num
aparelho nem no CI em Linux com os pacotes novos. Nos textos abaixo, "hoje" e "agora" valem
para a data de cada registro, não para o estado atual.

**RESOLVIDO em 2026-10-13 (V2-F00-E19, correção 2).** O Rafael decidiu atualizar (D1 do
roteiro de aprovação). `npx expo install --fix` em `apps/campo` subiu os seis pacotes
(`expo` ~57.0.28, `expo-crypto` ~57.0.4, `expo-location` ~57.0.21, `expo-router`
~57.0.26, `expo-splash-screen` ~57.0.10, `jest-expo` ~57.0.6) e o
`package-lock.json`. Depois (números daquele dia; hoje o jest do aplicativo tem 1927 casos):
`npx expo-doctor` **21 de 21**, `npm run test:campo`
1903 de 1903, testes do pacote `campo` 223 de 223, `npm run typecheck` com código 0 e
`npm run auditar` com código 0 (runtime em zero e nenhuma advisory nova no aplicativo).
Prova em `docs/evidencias-v2/G00/V2-F00-E19/correcao-2/`. O texto abaixo é o registro
da deriva como ela estava em 2026-10-13, antes da correção. A deriva volta a cada patch
novo do Expo: quando voltar, é um item novo.

**Deriva externa, não defeito do projeto.** Em 2026-10-13, `npx expo-doctor` em
`apps/campo` deu **20 de 21**. A única verificação que falha é "Check that
packages match versions required by installed Expo SDK", com seis pacotes um
patch atrás do que o SDK 57 exige hoje: `expo` (57.0.27, esperado ~57.0.28),
`expo-crypto` (57.0.3, ~57.0.4), `expo-location` (57.0.20, ~57.0.21),
`expo-router` (57.0.25, ~57.0.26), `expo-splash-screen` (57.0.9, ~57.0.10) e
`jest-expo` (57.0.5, ~57.0.6). O baseline Linux de 2026-10-08 deu 21 de 21: o
Expo publicou os patches depois. Nenhum pacote foi atualizado nesta correção, de
propósito: o CP-03 decidiu que mexer na árvore do Expo (`npm audit fix`) mistura
pacotes do SDK 57 e 58, e subir patch sem rodar a suíte do aplicativo e o
`prebuild` não é um conserto de uma linha.

- **Dono:** Rafael (decide quando subir os seis patches).
- **Como fechar:** `npx expo install --check` em `apps/campo`, conferir o
  `package-lock.json`, rodar `npm run test:campo` e `npx expo-doctor`
  (esperado 21 de 21). Pode entrar junto com a subida do SDK que fecha o CP-03
  (prazo das exceções: 2027-01-05).
- **Efeito no G00:** o critério "`expo-doctor` 21 de 21" da E19 e do gate G00
  estava BLOQUEADO; deixou de estar com a correção 2 (21 de 21).

## 18. A tarefa sai da lista sem o aplicativo dizer por quê (achado da V2-F00-E22, correção 4)

`POST /sincronizacao/pendencias/reconciliar` (`apps/api/src/rotas/sincronizacao.ts`)
devolve, para cada ocorrência que saiu da lista do agente, o `desfecho` (concluída,
encerrada, devolvida ou passou para outra equipe, que é quem carrega os quatro
casos) e o `motivo`, que só vem preenchido no encerramento (o texto da coordenação)
e na devolução (o rótulo do motivo), e é nulo nos outros dois. O aplicativo só usa o `status` dessa resposta, para apagar a
lápide da coleta já recebida (`aplicarReconciliacao`, `src/dados/pendencias.ts`); nenhuma
tela lê `desfecho` nem `motivo`. Resultado: a tarefa some da lista e o agente não
sabe se foi concluída, encerrada ou passada a um colega. `docs/CARTAO-DO-AGENTE.md`,
`docs/IMPLANTACAO.md` e `docs/GUIA-DO-COORDENADOR.md` agora dizem isso. O conserto
é uma frase na lista ou no sino a partir dos dois campos que já chegam; não foi
feito aqui (resolver pendência não é desta etapa).
