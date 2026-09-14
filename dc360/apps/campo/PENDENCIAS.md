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

## 9. O que a revisão adversarial achou e NÃO consertou

Estas três ficam registradas porque são decisão de quem desenha o produto, e
não defeito com conserto óbvio. As duas primeiras têm portão: elas estão
declaradas como dívida em `scripts/portao-design-do-aplicativo.test.mjs`, com um
caso irmão que REPROVA no dia em que alguém as ligar e esquecer de tirar o nome
da lista. Dívida que não sabe morrer vira permanente.

### 9.1 `elevacao(tema).folha` não tem um único uso

O topo da escala de elevação foi escrito, na própria declaração de `tokens.ts`,
para "o que cobre a tela e pede decisão (diálogo, painel que sobe)". A única
peça dessa classe no aplicativo é a folha do `Dialogo`, e ela desenha a
superfície à mão: fundo `tema.superficie`, contorno só no topo, sem sombra
nenhuma. O nível nasceu para um componente que existe e nunca foi ligado nele,
pelo mesmo motivo do véu: `Dialogo` era arquivo protegido no turno em que os
tokens nasceram.

Por que não foi ligado aqui: `folha` desce a sombra 12 pontos, ou seja, foi
desenhado para uma folha que PAIRA. A única folha do produto é colada no rodapé,
onde essa sombra cai para fora da tela. Espalhar o nível pela metade é
exatamente o que a declaração do token proíbe (ela é um estilo completo porque
no tema escuro quem carrega a elevação é a superfície, não a sombra), e inverter
a direção da sombra no ponto de uso seria decidir a escala de elevação dentro de
um componente.

**Consequência visível hoje, e ela é pequena mas real:** no tema escuro a folha
do diálogo fica em `superficie` (`t850`), que é a mesma superfície de um cartão
comum. A peça que está por cima de tudo tem a elevação de uma peça que está no
fundo. O véu de 0,66 é o que separa as duas, e é só ele.

**O que decidir:** ou `folha` ganha uma variante para folha colada (e aí a
sombra sobe em vez de descer), ou o nível é aposentado e a escala passa a ter
dois degraus. Precisa de olho em aparelho, nos dois temas, que é o que esta
revisão não tem.

### 9.2 `fonte.corpoG` e `linha.corpoG` são um degrau que nenhuma peça sabe pedir

A escala tipográfica declara oito degraus. A união `variante` do `Txt`, que é a
única peça que lê a escala, expõe sete: display, h1, h2, h3, corpo, corpoP e
legenda. `corpoG` (17 pontos) não está lá, e passá-lo devolveria `fontSize:
undefined`.

Nenhuma das duas saídas é neutra. Abrir a variante no `Txt` cria um tamanho novo
na interface, que alguém vai usar. Apagar o degrau tira da escala do aplicativo
um passo que o painel TEM (`--ds-fs-body-lg`, que lá vale 18 e aqui valeria 17,
e a paridade de propósito não mapeia este par). Escolher por dedução, sem ver a
tela, seria mexer na tipografia do produto por conta própria.

### 9.3 `fonteMinima` quer dizer duas coisas diferentes em dois arquivos

`tokens.ts` declara `fonteMinima = 14` com a frase "o texto da interface nunca
encolhe abaixo disto, mesmo em tela pequena". Lida assim, ela é um piso para
redução dinâmica, e `fonte.legenda` (12) continua sendo um degrau legítimo da
escala: o aplicativo usa `variante="legenda"` em 29 lugares.

`ui/Chip.tsx` lê a MESMA constante como piso da escala ("o texto não desce
abaixo de `fonteMinima`") e é por isso que o chip usa 14. `vistoria/[id].tsx`
leu do mesmo jeito ao recusar o `Selo` de 12. Duas leituras da mesma linha, as
duas defensáveis, e foi essa ambiguidade que fez duas frentes construírem duas
pílulas diferentes.

**Não corrigido de propósito.** As saídas são subir os 29 rótulos de 12 para 14
(mudança de densidade em cinco telas que ninguém viu em aparelho) ou estreitar a
frase do token para dizer que ela vale para texto de interação e não para
legenda. A segunda é quase certamente a certa, e mesmo ela é decisão de produto:
o que está escrito hoje autoriza as duas.
