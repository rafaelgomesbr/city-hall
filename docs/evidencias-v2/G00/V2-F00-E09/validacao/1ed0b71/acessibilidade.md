---
validador: acessibilidade
modelo: claude-opus-5-5
etapa: V2-F00-E09
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Montagem própria: API do SHA (árvore `dc360/` de `5044e7a` idêntica à de `1ed0b71`, conferido por `git diff --stat 1ed0b71 HEAD`, que só mostra STATUS e ESTADO-ATUAL) em 127.0.0.1:3891 com PGlite recém-semeado e `NOTIFICADOR_ARQUIVO`, reiniciada do zero antes de cada suíte; painel construído do SHA com `VITE_API_URL` numa pasta do scratchpad e servido por `vite preview` na 4891. Chromium e Firefox do Playwright (`dc360/node_modules`). `V` abaixo é `SCRATCH/validadores/acessibilidade` (SCRATCH é o scratchpad da sessão do gatekeeper).

| Critério (bloco da etapa, correções 2 e 4) | WCAG | Resultado | Prova |
| --- | --- | --- | --- |
| Confirmação de encerrar sessões anunciada por `role=status`, ícone mais texto | 4.1.3, 1.4.1 | OK nos dois motores | `V/saidas/05-fluxo-api-{chromium,firefox}.txt` ("o aviso e anunciado como status") |
| Foco devolvido ao botão (Cancelar e ao fechar a senha temporária) | 2.4.3 | OK nos dois motores | `05-fluxo-api-*` ("devolve o foco ao botao que a abriu", "o foco volta ao botao da linha", "o foco comeca em Cancelar") |
| Depois de encerrar as outras sessões o foco vai à confirmação, não a BODY (correção 2) | 2.4.3 | OK nos dois motores | `V/saidas/01-layout-estreito-firefox.txt` e `02-...-chromium.txt`, seção 7 |
| Aviso passageiro não cobre a janela da senha temporária; toque nos botões da janela (correção 4, defeito 2) | 2.5.8, 1.4.13 | OK nos dois motores | seção 8 de `layout-estreito` nos dois arquivos |
| Alvos de 44 px e nada fora do lugar a 320, 390, 768 e 1280 px | 2.5.8, 1.4.10 | OK nos dois motores | seções 2, 5 e 6 de `layout-estreito` |
| Erro da senha atual ligado ao campo (`aria-invalid`, `aria-describedby`), texto com acento e `role=alert` | 3.3.1, 3.3.3, 4.1.3 | OK nos dois motores | `V/saidas/03-sonda-foco-senha.txt` (`role=alert`, `aria-invalid=true`, `describedby=conta-senha-atual-erro`) |
| Foco depois de enviar a senha errada vai ao campo inválido (correção 4, item 3, declarado consertado) | 2.4.3 | **FALHA no Firefox**, OK no Chromium | achado 1 |
| Contraste dos avisos e erros, dois temas | 1.4.3 | OK (medido nas telas irmãs com o mesmo `Aviso`: 4,75 a 8,98) | `V/saidas/11-sonda-telas.txt` |
| Portões estáticos de acessibilidade do painel | 4.1.2, 2.1.1 | OK (688 de 688) | `V/saidas/06-vitest-web.txt` |

## Evidência

- `npm run test --workspace @dc360/web`: código 0, 45 arquivos, 688 testes (`V/saidas/06-vitest-web.txt`).
- `MOTOR=firefox node test/layout-estreito.e2e.mjs` contra a minha API recém-semeada: código 1, "Passou: 142 Falhou: 7", as sete na seção 10 (`V/saidas/01-layout-estreito-firefox.txt`, linhas 120 a 144).
- `MOTOR=chromium node test/layout-estreito.e2e.mjs` contra API recém-semeada: código 0, "Passou: 149 Falhou: 0" (`V/saidas/02-layout-estreito-chromium.txt`).
- `node test/fluxo-api.e2e.mjs` (API nova a cada motor): Chromium código 0, 288 de 288; Firefox código 0, 288 de 288; zero erro de console (`V/saidas/05-fluxo-api-{chromium,firefox}.txt`).
- Sonda própria `V/sondas/foco-senha.mjs` (código 0, `V/saidas/03-sonda-foco-senha.txt`): pessoa nova criada pela API para cada caso, senha temporária, tela "Defina a sua senha" e depois Minha conta; três modos de envio (clique, Espaço no botão focado, Enter no último campo); `document.activeElement` amostrado a 0, 100, 400, 1000 e 2000 ms depois de o erro aparecer; Chromium e Firefox, sem janela e COM janela (navegador de verdade na tela).
- Sonda de causa `V/sondas/causa-raf.mjs` (código 0, `V/saidas/04-sonda-causa-raf.txt`): instrumenta `requestAnimationFrame` e registra, no momento em que o quadro roda, se já existe campo com `aria-invalid="true"`.
- Capturas: `capturas/a11y-E09-minha-conta-senha-errada-foco-firefox-390.png` (sem anel de foco em lugar nenhum) contra `capturas/a11y-E09-minha-conta-senha-errada-foco-chromium-390.png` (anel no campo da senha atual); `capturas/a11y-E09-defina-senha-errada-foco-{chromium,firefox}-390.png`.

## Cenários positivos

- Chromium, sem janela e com janela: 6 de 6 casos por tela com o foco no campo inválido (`#conta-senha-atual`, `#senha-nova-atual`) em todas as amostras até 2 s; o Tab seguinte vai à "Senha nova".
- Firefox e Chromium: encerrar as outras sessões leva o foco à confirmação; Cancelar e o fechamento da senha temporária devolvem o foco ao botão da linha; o aviso de sessões encerradas é `role=status`; os botões da janela recebem o toque a 320x568.

## Cenários negativos

- Senha atual errada em Minha conta e senha provisória errada em "Defina a sua senha": erro no campo certo, com `role=alert` e ligação ao campo, nos dois motores; foco perdido no Firefox (achado 1).
- Autorização e isolamento não são desta dimensão (a fluxo-api, que os cobre, passou nos dois motores).

## Tentativas de reprovar

1. Rodei a suíte de largura estreita da própria etapa em Firefox, que o `scripts/e2e-api.mjs` aceita como motor: reprovou 7 verificações, todas de foco depois do envio. Rodei de novo em Chromium contra API limpa: 149 de 149.
2. Para descartar artefato do teste (espera curta) ou do modo sem janela: amostrei até 2 s e repeti com o Firefox aberto em janela. 6 de 6 por tela com o foco em BODY por clique e por Espaço; com Enter o foco fica no ÚLTIMO campo digitado (`#conta-senha-repetida`, `#senha-nova-repetida`), não no campo errado. O Tab seguinte, a partir de BODY, vai a "Pular para o conteúdo": a pessoa recomeça a página do topo.
3. Para separar defeito do motor de defeito da tela: no Firefox o quadro agendado por `depoisDePintar` roda ANTES de o React aplicar o estado (`raf: invalido=nenhum ativo=BODY`), e no Chromium depois (`raf: invalido=senha-nova-atual`). A tela agenda o foco por `requestAnimationFrame` dentro do `catch` de um `await` (`MinhaConta.tsx:109`, `Entrar.tsx:524` via `levarOFocoAoErro`), onde a atualização do React não é síncrona; o comentário de `componentes/foco.ts` só garante a ordem "num evento discreto". É defeito do código, dependente de ordem de agendamento, e não do Firefox.
4. Procurei a mesma classe de defeito nos outros chamadores de `depoisDePintar` depois de `await`: `Usuarios.tsx:123` chama ANTES do `await` (síncrono, não afetado); os de `Ocorrencia.tsx`, `NovaOcorrencia.tsx` e `QueroConhecer.tsx` não são desta etapa e não foram medidos.
5. Tentei achar outros pontos de foco perdido nas telas da etapa (janelas de Usuários, senha temporária, aviso adiado, Minha conta depois do sucesso): todos verdes nos dois motores.

## Achados

1. **bloqueia (WCAG 2.4.3; critério declarado pela correção 4, item 3, e verificação da própria etapa).** No Firefox, depois de enviar a senha atual errada em Minha conta ou a provisória errada em "Defina a sua senha", o foco cai em BODY (clique e Espaço no botão, 6 de 6 por tela, com e sem janela) ou fica no último campo (Enter), e nunca vai ao campo inválido. O erro é identificado e anunciado (`role=alert`, `aria-describedby`), então o 3.3.1 se cumpre; o que falha é a ordem do foco: quem usa teclado ou leitor de tela recomeça do topo da página, exatamente o defeito que a correção 4 declarou consertado e que a correção 2 tratou como defeito em outra peça desta etapa. A verificação da etapa reprova: `layout-estreito.e2e.mjs`, seção 10, 7 falhas no Firefox (`V/saidas/01-layout-estreito-firefox.txt`), o que deixa `node scripts/e2e-api.mjs firefox` vermelho. Causa medida: o `requestAnimationFrame` agendado no `catch` de um `await` roda antes de o React marcar o campo (`V/saidas/04-sonda-causa-raf.txt`). Reprodução: `node V/sondas/foco-senha.mjs` com a API e o painel de pé. Conserto provável: levar o foco por efeito depois da renderização (como `Aviso` com `foco` já faz), e não por quadro agendado antes do estado.
2. **anotado.** Fechar o aviso passageiro pelo teclado leva o foco a BODY (Chromium e Firefox, `V/saidas/11-sonda-telas.txt`, medido na tela de Equipes com o mesmo `Toast`); já registrado em rodadas anteriores.
3. **anotado.** O `Toast` é inserido no DOM já com o texto dentro de `role=status` (`V/saidas/11-sonda-telas.txt`, "inserida-com-texto:true"); a própria E10 registra que região viva inserida assim pode não ser anunciada. Só leitor de tela prova.

## Não verificado

- Leitor de tela (NVDA, VoiceOver, TalkBack): o anúncio real da confirmação, do erro e do aviso passageiro.
- WebKit, aparelho físico, zoom de 200 por cento a 1280 px (equivale a 640 px de largura; medi 320, 390, 768 e 1280 px), espaçamento de texto (1.4.12).
- Os outros chamadores de `depoisDePintar` depois de `await` fora desta etapa.

## Risco residual

Firefox é motor suportado do painel (o e2e da casa roda nele). Até o conserto, quem erra a senha no Firefox perde o lugar na página. O conserto é pequeno e localizado; a verificação que o prende já existe e já reprova.

## Motivo do humano

Só uma pessoa com leitor de tela confere se a confirmação de encerrar sessões, o erro da senha e o aviso passageiro são de fato anunciados; e a validação humana da etapa (Rafael faz o fluxo e confere a frase da senha única e as confirmações) segue pendente.
