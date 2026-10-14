---
validador: acessibilidade
modelo: claude-sonnet-5-5
etapa: V2-F00-E16
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [UI, A11Y, MOBILE]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: nenhum
---
Escopo de acessibilidade da E16 (DoD: "alvo de toque de 44 por 44 nos botões novos, ícone mais texto, tarja lida por leitor de tela"): a tarja de erro com "Abrir os ajustes do aparelho", a câmera em tela cheia (obturador e "Voltar sem fotografar" na área segura), o teclado na vistoria e as frases de envio sem promessa de segundo plano. Esta etapa não teve relatório de acessibilidade na rodada 1. Nada herdado. SHA 4b96ea7. Prova: portões estáticos do aplicativo, jest da etapa, e as capturas do emulador Android do QA do campo (`scratchpad/qa-campo/capturas/`, build atual, E2), medidas por mim pixel a pixel. Não subi o emulador por mim: a restrição desta rodada era usar a captura do QA, que cobre os estados da etapa. Pasta de trabalho: `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/a11y/` (`a11y/`). Mutação em `apps/campo`: nenhuma (a restrição do lote só permitia `apps/web`).

## Critérios verificados

1. Portões estáticos do aplicativo (E1): `node --test` de `portao-acessibilidade-do-aplicativo.test.mjs`, `portao-sem-promessa-de-segundo-plano-do-aplicativo.test.mjs`, `portao-densidade-do-aplicativo.test.mjs`, `portao-design-do-aplicativo.test.mjs`: 37 de 37 (`a11y/portoes-app.txt`). O portão de acessibilidade calcula contraste dos pares de tokens do tema (claro e escuro), régua de 52 pontos de alvo e nome acessível de todo elemento tocável.
2. Jest da etapa (E1): `vistoria-o-teclado-a-camera-e-o-que-ela-promete.test.tsx` (17 casos) e `fila-como-produto.test.tsx`: 82 de 82 (`a11y/jest-e16.txt`).
3. Tarja de permissão negada (`E16-tarja-camera-negada-com-botao-de-ajustes.png`): título "Não deu certo" com ícone mais texto; `Aviso` com `accessibilityRole="alert"` (perigo) e a tarja com `accessibilityLiveRegion="assertive"` (`vistoria-o-teclado...test.tsx:436`); botão "Abrir os ajustes do aparelho" (realce) com rótulo acessível "Abrir os ajustes do sistema para liberar a permissão deste aplicativo" e botão "Fechar" separado. O botão de ajustes mede cerca de 52 dp (136 px a 420 dpi) e o "Fechar" também. Só permissão negada liga o botão (o código passa `abreAjustes: true` apenas pelos dois ramos de permissão; os testes cobrem o negativo).
4. Contraste da tarja, medido na captura (`a11y/px2.py`): corpo e título em vermelho `#C92A2A` sobre `#FDEBEB` 4,75:1; botão de ajustes `#4C1D95` sobre `#C4B5FD` 5,93:1; "Fechar" `#14191D` sobre branco 17,70:1; faixa "Sem sinal" `#92400E` sobre `#FEF3C7` 6,37:1. Todos acima de 4,5:1 (tema claro; o tema escuro não foi capturado).
5. Frases sem promessa de segundo plano: portão novo (`portao-sem-promessa-de-segundo-plano...`, 4 casos) e a captura `E16-vistoria-guardada-sem-promessa-de-segundo-plano.png` ("Ela sobe com o aplicativo aberto"): ícone `i` mais título e corpo, `info` com texto de 14 pt legível, botões de 52 dp.
6. Câmera em tela cheia (`E16-camera-em-tela-cheia.png`): `paddingBottom` soma a área segura, obturador de 84 pt com `accessibilityLabel="Tirar a fotografia"`, e a barra do sistema (traço de gesto) não cobre os dois botões na captura. O botão "Voltar sem fotografar" é o achado 1.

## Evidência

`a11y/portoes-app.txt`, `a11y/jest-e16.txt`, `a11y/px.py` (medição de contraste no pixel do botão da câmera) e `a11y/px2.py` (tarja). Capturas do emulador, do QA do campo: `qa-campo/capturas/E16-camera-em-tela-cheia.png`, `E16-foto-vazia-mensagem-tire-de-novo.png` (mostra a mesma barra da câmera), `E16-tarja-camera-negada-com-botao-de-ajustes.png`, `E16-vistoria-guardada-sem-promessa-de-segundo-plano.png`, `E16-ajustes-do-aparelho-abertos.png`. Código: `apps/campo/src/app/(agente)/vistoria/[id].tsx` linhas 2515 a 2575 (câmera), `apps/campo/src/ui/componentes.tsx` função `Botao` (secundário: `fundo: transparent`, `texto: tema.texto`), `apps/campo/src/ui/tokens.ts` (`visor.fundo = "#000000"`, `temaClaro.texto = #14191D`).

## Cenários positivos

Permissão de câmera negada mostra a tarja com o botão de ajustes e o "Fechar"; a vistoria guardada diz a verdade sobre o envio; a câmera reserva a área segura; as tarjas têm contraste AA no tema claro.

## Cenários negativos

Falha que não é de permissão não ganha o botão de ajustes (testes verdes); frase de envio não promete segundo plano (portão com 4 casos).

## Tentativas de reprovar

- Medi o texto "Voltar sem fotografar" sobre o visor no pixel da captura do emulador (tema claro): texto `#14191D` sobre `#000000`, **1,19:1** (medido na captura e conferido por cálculo com os tokens). Fora de qualquer AA.
- Procurei se o portão de acessibilidade do aplicativo cobre o par do visor: não cobre (`visor` não aparece em `portao-acessibilidade-do-aplicativo.test.mjs` nem em `fonte-do-aplicativo.mjs`). O portão calcula só pares de tema sobre superfícies do tema, e o botão secundário na câmera usa a cor de texto do TEMA sobre um fundo que NÃO é do tema.
- Procurei a borda do mesmo botão: `bordaControle` `#5A6B76` sobre preto, cerca de 3,8:1, passa 3:1 (1.4.11); o contorno aparece, o texto não.
- Procurei o mesmo defeito no tema escuro: texto `#ECF1F4` sobre preto, cerca de 18:1, legível. O defeito é só do tema claro, que é o que o aparelho usa por padrão (o tema segue `useColorScheme` do sistema).
- Procurei alvo abaixo de 52 dp nos botões novos: nenhum nas capturas; o portão de 52 verde.
- Procurei tarja que não seja lida por leitor de tela: `accessibilityRole="alert"` no aviso de perigo e `assertive` na tarja; sem leitor real não provo o anúncio.
- Procurei promessa de segundo plano restante: o portão novo e os cinco testes de tela não acharam.

## Achados

1. **FAIL (WCAG 1.4.3 Contraste mínimo, texto do botão)**: "Voltar sem fotografar", o único botão de saída da câmera (a outra ação é o obturador), tem 1,19:1 de contraste no tema claro, texto quase preto sobre o visor preto. Quem não souber que ele existe não o vê; quem o vê pelo contorno não lê o rótulo. A E16 reescreveu exatamente esta barra (`paddingBottom` da área segura, `testID="barra-da-camera"`) e o botão está dentro do escopo "obturador e 'Voltar sem fotografar' com `useSafeAreaInsets`". Reprodução: `qa-campo/capturas/E16-camera-em-tela-cheia.png` e `E16-foto-vazia-mensagem-tire-de-novo.png`, `python -I a11y/px.py <captura>` imprime `contraste medido na captura: 1.19:1`. Causa: `Botao tipo="secundario"` tem `fundo: "transparent"` e `texto: tema.texto`, e a câmera pinta `visor.fundo = #000000` por trás. Conserto: dar ao botão da câmera as cores do visor (texto `visor.obturador` branco, borda clara), por exemplo um tipo novo de `Botao` ou `estilo` e um prop de cor; e acrescentar o par (`visor.obturador` sobre `visor.fundo`) ao portão de contraste do aplicativo para que este defeito não volte.
2. anotado: o portão de acessibilidade do aplicativo só calcula pares de TEMA sobre superfícies de TEMA, então qualquer elemento do aplicativo desenhado sobre uma superfície fora do tema (visor da câmera, papel de documento) passa por ele sem medição. O achado 1 é o primeiro caso conhecido; o `papel` do documento tem o mesmo risco.
3. anotado: a tarja de erro da câmera negada foi capturada só no tema claro; não há captura do tema escuro das tarjas novas.

## Não verificado

- Leitor de tela real (TalkBack no Android e VoiceOver no iPhone): nenhum; "tarja lida por leitor de tela" está provado só pelas propriedades (`alert`, `assertive`) e não ouvido.
- Teclado do iPhone, área segura do iPhone (`useSafeAreaInsets` com home indicator), `automaticallyAdjustKeyboardInsets` do iOS, `Linking.openSettings` no iOS: o emulador Android não reproduz; pendência humana (aparelho iPhone, DP pergunta 15).
- Tema escuro do aplicativo nas telas da E16 (sem captura).
- Rodar o emulador e o build por mim: usei as capturas do QA do campo; o botão da câmera foi medido a partir delas, e confirmado por cálculo sobre os tokens, não por nova execução.
- Fonte ampliada (`fontScale` de 200 por cento do sistema) e `accessibilityReduceMotion` nas telas da etapa.
- Mutação do portão do aplicativo (planta de botão sem rótulo): não feita, por regra de lote só `apps/web` aceita mutação.

## Risco residual

Em aparelhos com tema claro (o padrão), o agente não lê o botão que sai da câmera sem fotografar; o contorno ajuda mas não identifica. Anúncio por leitor de tela da tarja e comportamento do teclado no iPhone seguem não provados.

## Motivo do humano

TalkBack e VoiceOver reais para ouvir a tarja e o botão de ajustes; iPhone para o teclado, a área segura e `Linking.openSettings` (CP-32 e DP pergunta 15); olhar humano sobre o botão da câmera depois do conserto, ao sol, que é o caso de risco visual da seção 10.
