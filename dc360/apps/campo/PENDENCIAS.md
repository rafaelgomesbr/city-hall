# Pendências do aplicativo de campo

O que este turno deixou pronto para o próximo pegar, e o que ficou fora da faixa
de `apps/campo/` e `packages/campo/`. Cada item diz o que precisa existir e por
quê, para o turno seguinte não ter que reconstruir o raciocínio.

## 1. API: o envelope precisa dizer quem coletou, e o servidor precisa conferir

**Fora da faixa.** Exige campo novo no esquema compartilhado e mudança na rota
`/sincronizacao/vistoria`, que estão com outros agentes.

**O problema, que só está meio resolvido.** Hoje o envelope não carrega autor: o
servidor tira o `agente_id` de quem apresentou o token. No aparelho de plantão
compartilhado isso fazia a coleta do agente da manhã subir com a credencial do
agente da noite, e o laudo saía atribuído a um servidor que nunca esteve no
local, contra a minuta lida em voz alta ali com outro nome. A trilha é
append-only: o autor errado nunca é corrigido, só comentado por um evento novo.

Neste turno o aplicativo passou a carimbar o autor no item da fila e a se recusar
a enviar coleta que não é de quem está logado (`packages/campo/src/fila.ts`,
`autoriaDaColeta` e o filtro em `prontos`). **Isso é um portão de cliente, e
portão de cliente não é controle de acesso.** Um binário adulterado, ou um
defeito futuro nesse filtro, volta a produzir o mesmo laudo falso e o servidor
aceita sem piscar.

O que a API precisa:

1. **Campo `coletadaPor` no envelope** (id do usuário), no esquema Zod
   compartilhado, obrigatório.
2. **O servidor compara** esse campo com o dono do token verificado. Diferentes:
   recusa com código próprio (`autor_divergente`), 409, e a mensagem diz para
   entrar com a conta de quem fez a vistoria. O transporte já transforma isso em
   falha permanente, e a tela da fila já sabe mostrar item bloqueado com saída.
3. **A recusa entra na trilha**, porque a tentativa de gravar vistoria com autor
   divergente é exatamente o evento que alguém vai querer auditar depois.
4. Enquanto o campo não existir, o portão do cliente é tudo o que há: não mexer
   nele sem ler o comentário em `prontos`.

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

## 6. Nada disto foi executado em aparelho

Continua valendo o que `LEIA-ME.md` já diz. Em especial, três coisas deste turno
só foram exercitadas com dublê: a cópia da foto para o diretório de documentos, a
leitura da fila durante a limpeza do logout, e a existência do arquivo no momento
do envio. As três dependem de `expo-file-system` real.
