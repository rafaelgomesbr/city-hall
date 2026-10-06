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
  não existe tela para desbloquear item que o servidor recusou: campo
  obrigatório daria 422 do Zod para sempre nessas coletas, e uma vistoria de
  morro seria destruída por uma mudança de esquema. Ele pode virar obrigatório no
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

## 2. API: vistoria não pode morrer porque um arquivo sumiu

**Fora da faixa.** Exige campo no envelope e decisão de produto sobre o laudo.

As fotos sobem ANTES do envelope, de propósito (o laudo não pode apontar para
arquivo que não existe). A consequência: se um arquivo não estiver mais no
aparelho, a leitura falha e o envelope inteiro (checklist, GPS, assinatura,
observações, órgãos a acionar) nunca sai. Uma foto perdida destrói a vistoria
inteira.

Neste turno isso deixou de ser silencioso e deixou de ser eterno: a foto passou a
ser copiada para o diretório de documentos na hora da captura
(`src/dados/evidencia-no-disco.ts`), e o arquivo ausente virou falha permanente
com frase em português que termina numa ação, em vez de erro cru do sistema
repetido a cada cinco minutos para sempre.

O que falta, e é decisão de produto antes de ser código: **a vistoria deveria
poder subir SEM o arquivo perdido, com a perda registrada.** Isso exige um campo
no envelope (algo como `evidenciasPerdidas: [{ idempotencyKey, capturadaEm }]`),
um evento na trilha, e uma linha no laudo dizendo que houve registro fotográfico
que não pôde ser recuperado. Sem esse registro, subir a vistoria sem a foto seria
entregar um laudo que parece completo e não é, que é pior do que não entregar.

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
- **A cascata de entrada de lista não tem uso ainda.** `cascata` e
  `atrasoEmCascata()` existem para as quatro frentes de tela usarem o MESMO
  ritmo, que é o defeito que a régua de densidade documenta (cinco frentes,
  cinco decisões certas sozinhas, uma tela poluída no fim). Enquanto nenhuma
  lista a chamar, ela é vocabulário e não comportamento.
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

O sino sincroniza quando a aba Perfil é aberta, e não em segundo plano: o crachá
na barra de abas mostra o que o último `sincronizarAvisos` trouxe. É escolha e
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

**Decisão da V2-F00-E07 sobre o 403 `troca_de_senha_obrigatoria`:** fica FORA da
etapa e continua recusa permanente do item, por três razões. (1) A E07 só mexe
na vigência da API (papel, cadeia da sessão e senha provisória vencida), e a
classificação desse 403 na fila é do motor offline, que a E06 fechou para os três
códigos de acesso. (2) O aparelho praticamente não chega a ele: quem entra com a
senha provisória é mandado ao painel para trocá-la (`src/dados/api.ts`,
`ErroDaApi`), e redefinir a senha de alguém derruba as sessões dele (401
`sessao_encerrada`, que já é pausa, não bloqueio). (3) Tratá-lo como pausa sem
haver tela de troca de senha no aplicativo deixaria o item parado sem saída.
Reabrir quando o aplicativo ganhar a tela de troca de senha.

**O que falta** (validação humana): ver a frase e a coleta preservada em
aparelho ou emulador, desativando o agente no painel durante uma coleta na fila,
e a reativação seguida de nova entrada. O ambiente desta etapa não renderiza o
app Expo; a prova foi por teste de componente (`src/ui/fila-pausada-pela-sessao.test.tsx`),
e a foto do aparelho continua pendente. Fora do escopo e ainda aberto: o 403
`troca_de_senha_obrigatoria` (senha provisória) e o 403 `acesso_suspenso` nas
rotas que não são da fila ainda são lidos como recusa permanente do item pelo
transporte; a API responde 503 à fila no caso da suspensão, que é temporário.
