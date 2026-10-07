# V2-F00-E13: vermelhos do painel e a entrada que partia de `/`

Executada em 2026-10-06. Nada foi commitado (o commit depende de Rafael).

## 0. O número do título está errado, e a correção é esta

O título da etapa fala em **14 vermelhos do painel**. Esse era o número medido
em 2026-09-30. A V2-F00-E09 já zerou 8 deles (os de
`apps/web/test/seguranca-da-conta.test.ts`, que passaram a verde sem mudar uma
linha de teste). Antes desta etapa o painel tinha **6 falhas**, não 14, e isso
foi conferido na prática antes de qualquer mudança:

```
 Test Files  4 failed | 37 passed (41)
      Tests  6 failed | 622 passed (628)
```

As 6, por arquivo:

| # | Arquivo e caso | Dono |
| --- | --- | --- |
| 1 | `semente-e-confirmacoes.test.ts` > `paginas/Usuarios.tsx` anuncia o que gravou com um Toast | E13 |
| 2 | `semente-e-confirmacoes.test.ts` > `paginas/Equipes.tsx` anuncia o que gravou com um Toast | E13 |
| 3 | `semente-e-confirmacoes.test.ts` > `paginas/Orgaos.tsx` anuncia o que gravou com um Toast | E13 |
| 4 | `design-system.test.ts` > nenhum valor de design escrito à mão (`Estrutura.tsx:132`, `borderRadius: "8px"`) | E13 |
| 5 | `acessibilidade.test.ts` > nenhum `onClick` pendurado em elemento que o teclado não alcança (`Modal.tsx:260`) | E13 |
| 6 | `ocorrencia-encerramento.test.ts` > nada grava o encerramento fora do ramo de confirmação (CRLF) | **E21** |

**Esta etapa zerou as 5 que são dela. A sexta sobra de propósito**: é o caso de
CRLF, que a própria etapa manda não implementar aqui (`O que NÃO deve ser
implementado nesta etapa: ... o caso de CRLF (E21)`). Com a E21, o painel fecha
em zero. O resultado depois desta etapa:

```
 Test Files  1 failed | 40 passed (41)
      Tests  1 failed | 632 passed (633)
```

## 1. O que foi implementado

**Confirmação de gravação com `role="status"`** (`paginas/Usuarios.tsx`,
`Equipes.tsx`, `Orgaos.tsx`): gravar mostra um `<Toast tom="sucesso">` com a
frase do que aconteceu ("Usuário cadastrado. Ele já aparece na lista abaixo.",
"Equipe criada...", "Órgão cadastrado...", e as três versões de correção). Antes,
o formulário limpava em silêncio: quem enxerga ficava na dúvida se o clique
pegou, e quem usa leitor de tela não ouvia nada.

**Raio do ícone da marca fora do componente** (`componentes/Estrutura.tsx`,
`estilos/app.css`): `style={{ borderRadius: "8px" }}` virou
`.lateral__marca img { border-radius: var(--ds-radius); }`.

**O portão de acessibilidade passou a ler o comentário inteiro**
(`test/acessibilidade.test.ts`): a janela era fixa em quatro linhas, e isso
punia justamente a exceção bem escrita. A de `Modal.tsx` explica em sete linhas
por que o clique no fundo não ganha `tabIndex`; a marca ficava na primeira linha
e o portão lia só as quatro últimas. Agora ele sobe pelo bloco de comentário
contíguo (`/* ... */` ou `//` seguidos), sem teto de linhas, atravessando linha
em branco, e para no primeiro código. A marca SOLTA no código, fora de
comentário, continua não valendo (caso de teste).

**A entrada que partia de `/`** (`App.tsx`, `paginas/entrar-regras.ts`): quem
digitava só o domínio chegava a `/`, era mandado a `/entrar` com
`voltarPara: "/"` e, depois de entrar, voltava para `/`, que não tinha rota: o
painel respondia "Esta página não existe" logo depois do login. Duas metades:
`rotaInterna` passou a recusar `/` (e `/?...`, `/#...`) como caminho de volta, e
`App.tsx` ganhou uma rota índice que desvia para `telaInicial(papel)`.

## 2. O que a etapa NÃO tocou, de propósito

Os 8 casos de `seguranca-da-conta.test.ts` (eram da E09, já verdes), o caso de
CRLF (E21), o CORS do PUT de evidência (E18), ErrorBoundary e estados padrão
(F10-E10) e acessibilidade dinâmica (F10-E11).

## 3. Dois defeitos achados durante a execução, e consertados

### 3.1 Sair de propósito deixava caminho de volta para a PESSOA SEGUINTE

Com a entrada pela raiz consertada, o E2E local passou da seção 2 pela primeira
vez e morreu na seção 11: depois de "Sair" na tela do mapa, o próximo perfil a
entrar naquele navegador caía em `/mapa`, e não na tela do papel dele.

A causa: o clique em "Sair" também passa pela rota protegida (a tela ainda está
montada quando a sessão some), e `Protegida` gravava em `voltarPara` a tela
abandonada. Caminho de volta existe para link profundo e para sessão que caiu
sozinha; sair é sair. O provedor de sessão passou a distinguir os dois
(`saidaVoluntaria` em `estado/sessao.tsx`) e a decisão virou função pura
(`caminhoDeVolta` em `entrar-regras.ts`), provada sem navegador.

Medido no navegador, antes e depois:

```
antes:   url na saida: .../entrar  state: {"motivo":null,"voltarPara":"/mapa"}
         url depois do login do operador: .../mapa
depois:  url na saida: .../entrar  state: {"motivo":null,"voltarPara":null}
         url depois do login do operador: .../painel
```

### 3.2 O aviso passageiro caía em cima da barra de navegação no celular

Achado nas capturas desta etapa, a 390 px: a confirmação de gravação era
desenhada POR CIMA dos destinos da barra do rodapé, com as frases sobrepostas e
o botão "Fechar" em cima de "Mapa da cidade"; e, no tema escuro, o texto da
página atravessava o aviso, porque `--ds-success-bg` e os irmãos dele são
translúcidos (12%), feitos para tingir um cartão e não para flutuar.

A posição do aviso saiu do `style` do componente (regra de media query não vence
estilo escrito no elemento) e foi para `.toast`, em `estilos/app.css`. No bloco
`@media (max-width: 900px)` ele sobe a altura da barra, e a altura não é um
número escolhido: é a mesma conta que desenha a barra,
`calc(var(--ds-sp-4) + var(--ds-touch) + var(--ds-sp-5) * 2)`. O aviso também
ganhou `background: var(--ds-surface)`, que é exatamente o fundo que o teste de
contraste já supunha (`sobre: --ds-surface`).

Antes e depois: `capturas/antes/usuarios-confirmacao-390-escuro.png` contra
`capturas/usuarios-confirmacao-390-escuro.png`. Isto já estava registrado como
pendência 4 da seção 6 de `dc360/apps/web/PENDENCIAS.md`, e foi riscado lá.

## 4. O ponto de interface pedido pelo orquestrador: a barra a 390 px corta "Mapa da cidade"?

**Resposta: é rolagem horizontal deliberada, e não texto cortado.** Medido
(`saidas/04-...` e `saidas/05-...`):

- `.lateral` tem `overflow-x: auto`; `scrollWidth` 1484 contra `clientWidth` 390.
- O rótulo está inteiro no elemento: `textOverflow: clip`, `overflow: visible`,
  `larguraDoTexto` 161 igual a `larguraDaCaixa` 161. Nada de reticências, nada
  de corte por CSS. O que termina em 390 px é a área visível da barra.
- **Toque:** um arrasto por toque de verdade (eventos de toque, não mouse) rola
  a barra de `scrollLeft` 0 para 265.
- **Teclado:** os dez itens são alcançados por Tab, na ordem.

**Mas havia um defeito ali, e ele foi consertado.** Quatro itens recebiam o foco
do teclado PELA METADE: o navegador só rola sozinho um item que está TOTALMENTE
fora da área visível, então o Tab parava em "Mapa da cidade" (de 255 px a 416 px
numa barra de 390 px) com o rótulo cortado na borda e o anel de foco em cima de
um texto ilegível. O mesmo valia para "Equipes", "Usuários" e "Tema escuro".
Tentar resolver só com `scroll-padding-inline` na folha não mudou nada (medido e
registrado). O conserto é o `onFocus` dos itens da barra em `Estrutura.tsx`
(`scrollIntoView({ inline: "nearest", block: "nearest" })`), com o
`scroll-padding-inline` dando o respiro de chegada.

Antes e depois, com 500 ms de espera depois de cada Tab para não medir o quadro
anterior:

```
antes:   Tab 22 Mapa da cidade   scrollLeft=0     inteiroNaTela=false
         Tab 24 Equipes          scrollLeft=328   inteiroNaTela=false
         Tab 26 Usuários         scrollLeft=640   inteiroNaTela=false
         Tab 28 Tema escuro      scrollLeft=947   inteiroNaTela=false
depois:  os dez itens com inteiroNaTela=true
```

Captura do resultado: `capturas/barra-foco-no-mapa-390-claro.png` e
`...-390-escuro.png`. A barra continuar rolando é decisão de interface da F10:
dez destinos não cabem em 390 px, e o rótulo por extenso vale mais do que um
ícone a adivinhar. Fica registrado em `PENDENCIAS.md` seção 9, item 2.

## 5. Resultados medidos

| O que | Comando | Resultado |
| --- | --- | --- |
| Painel, antes | `npm run test --workspace @dc360/web` | 628 testes, **6 falhas** |
| Painel, depois | idem | 633 testes, **1 falha** (a de CRLF, da E21) |
| Tipos | `npm run typecheck` | código 0, zero erro |
| Paridade dos modos | `npx vitest run test/paridade-dos-modos.test.ts` | 10 de 10 |
| E2E do painel, Chromium | `npm run test:e2e` | **70 de 70, código 0**, zero erro de console |
| E2E do painel, Firefox | `MOTOR=firefox npm run test:e2e` | **70 de 70, código 0**, zero erro de console |
| API (sem regressão) | `npm run test:api` | 1221 passaram, **0 falhas**, 13 pulados (`banco-tls`, E21) |
| Linha de base | `node scripts/baseline.mjs --so=teste-web,e2e` | 2 de 2 **conferem** |

O E2E do painel estava vermelho desde sempre nesta linha de base (o esperado
registrado era `waiting for locator('.indicador') to be visible`). **Ele fecha
verde a partir desta etapa**, e o esperado do passo `e2e` em
`dc360/scripts/baseline.mjs` foi trocado para `codigo: 0` com
`contem: "Passou: 70   Falhou: 0"`.

### Testes novos (5)

- `acessibilidade.test.ts`: a exceção vale pelo comentário inteiro, e só por ele
  (bloco longo passa, `//` passa, marca solta no código não passa, bloco com
  código no meio não passa).
- `acessibilidade.test.ts`: o Tab traz o item da barra do rodapé inteiro para a
  tela (guarda o `onFocus` e o `scroll-padding-inline`).
- `acessibilidade.test.ts`: o aviso passageiro não cai em cima da barra de
  navegação (guarda a posição na folha e a altura em tokens).
- `sessao-e-entrada.test.ts`: entrar a partir de `/` leva à tela do papel, e não
  a "Esta página não existe" (mais a rota índice em `App.tsx`).
- `sessao-e-entrada.test.ts`: sair de propósito não deixa caminho de volta para
  a pessoa seguinte.

E 2 verificações novas no E2E (seção 2): entrar a partir de `/` e abrir `/` já
com sessão.

### Testes negativos exigidos pela etapa

- `rotaInterna` recusa `//outro.exemplo`, `https://outro.exemplo` e `/entrar`:
  casos que já existiam em `sessao-e-entrada.test.ts` e seguem verdes, agora com
  `/`, `/?x=1` e `/#topo` junto.
- O portão de acessibilidade ainda reprova `onClick` sem exceção escrita: caso
  sintético novo (marca fora de comentário, e bloco com código entre ele e o
  elemento, não valem).

## 6. Portão visual (seção 0 de `19-definicao-de-pronto.md`)

42 capturas em `capturas/`, 1280 px e 390 px, claro e escuro, nos estados
normal, confirmação, vazio e erro, mais 6 em `capturas/antes/`. Zero erro de
console e de página durante a captura (o roteiro falha se houver).

| Item | Resultado |
| --- | --- |
| Alinhamento | OK: cartões do mesmo grupo com a mesma largura; o aviso passageiro alinhado à margem direita do conteúdo |
| Espaçamento | OK: nada grudado; o aviso ganhou o respiro da barra no celular (era o defeito 3.2) |
| Nada fora do lugar | OK depois dos consertos 3.2 e 4: sem texto sobreposto e sem foco em rótulo cortado. A página não rola na horizontal; quem rola é a barra do rodapé, de propósito |
| Hierarquia | OK: título, rótulo e valor com os tokens de sempre |
| Texto bem escrito | OK: as seis frases novas de confirmação dizem o que aconteceu e onde ver; sem travessão |
| Responsivo | 1280 px e 390 px provados aqui. **320 px, 768 px e zoom de 200% NÃO foram capturados nesta etapa** (limitação declarada) |
| Dois temas, foco, contraste | OK: todas as telas nos dois modos; o anel de foco aparece inteiro na barra (captura `barra-foco-no-mapa`) |
| Vazios e erro desenhados | OK: `orgaos-vazio-*` e `usuarios-erro-de-campo-*` |
| Rafael vê e aprova | **PENDENTE** |

## 7. Limitações e pendências

1. **Validação humana (a etapa pede):** Rafael digita só o domínio, entra e
   confere que chega à tela do papel. Não dá para fazer por ele.
2. **Aprovação das seis frases de confirmação** ("Usuário cadastrado. Ele já
   aparece na lista abaixo." e as cinco irmãs) continua com ele.
3. **O painel ainda tem 1 vermelho**, o de CRLF, que é da E21. A soma zero que a
   Definition of Done pede depende dela.
4. **Larguras de 320 px, 768 px e zoom de 200%** não foram capturadas: a etapa
   pedia desktop e celular, e foi isso que se fez.
5. **A sonda "antes" da barra** (`saidas/04-...`) é transcrição fiel da execução
   feita antes do conserto, e não um arquivo gravado pelo roteiro naquele
   momento; o "depois" é gravado direto. Para reproduzir o "antes", remova os
   três `onFocus={trazerParaATela}` e rode `roteiros/sonda-barra-2.mjs`.
6. **Uma rodada do E2E em Chromium falhou 1 de 68** logo depois de uma
   reconstrução do painel, com o servidor de prévia ainda servindo a versão
   anterior. As seis rodadas seguintes (três em Chromium, três em Firefox)
   fecharam em 70 de 70. Fica registrado porque aconteceu.
7. **O E2E em Firefox acusava 3 erros de console** que não são do painel:
   download de fonte ABORTADO (`NS_BINDING_ABORTED`) quando o teste troca de
   tela antes de o arquivo chegar. Numa página parada as mesmas fontes respondem
   200 e `document.fonts` as dá por carregadas, sem erro. O filtro posto em
   `fluxo.e2e.mjs` é estreito: só download de fonte, só abortado; fonte com 404
   ou corrompida continua reprovando.

## 8. Arquivos

Código: `apps/web/src/App.tsx`, `apps/web/src/paginas/entrar-regras.ts`,
`Usuarios.tsx`, `Equipes.tsx`, `Orgaos.tsx`,
`apps/web/src/componentes/Estrutura.tsx`, `Toast.tsx`,
`apps/web/src/estado/sessao.tsx`, `apps/web/src/estilos/app.css`.

Testes: `apps/web/test/acessibilidade.test.ts`,
`apps/web/test/sessao-e-entrada.test.ts`, `apps/web/test/fluxo.e2e.mjs`.

Roteiro da linha de base: `dc360/scripts/baseline.mjs` (esperados de `teste-web`
e do passo `e2e`).

Documentação: `dc360/apps/web/PENDENCIAS.md`, `docs/roadmap-v2/STATUS.md`.
