---
validador: ux
modelo: claude-opus-5-5
etapa: V2-F00-E24
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: []
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

A etapa é só documentação e apresentação ("Portão visual: não se aplica (sem UI nem MOBILE)"; proíbe "mudança em API ou painel"). O que ela entrega a quem lê é TEXTO: `dc360/docs/SEGURANCA-DO-AGENTE.md`, `CARTAO-DO-AGENTE.md` (o cartão de bolso da saída a campo), `GUIA-DO-COORDENADOR.md`, `LEIA-ME.md`, `PRIVACIDADE.md`, `PAPEIS_E_RESPONSABILIDADES.md`, `dc360/README.md` e as duas páginas de apresentação (`dc360/docs/apresentacao/2026-09-15-para-o-alyson.html` e `docs/apresentacao-produto-alyson.html`).

Por que não herdada: o diff `1ed0b71..fd17ff4` toca `dc360/README.md` (totais de testes e o parágrafo da guarda de códigos de erro e do portão de dependências) e `app.css` e páginas do painel. Conferi: os documentos da etapa, salvo o README, não mudam desde a correção 3 (`b17949a`, anterior a `1ed0b71`); as linhas do README que mudaram não falam de saída a campo; a tela "Quem está em campo" do painel, que os documentos descrevem, foi capturada no SHA.

| Critério | Prova | Resultado |
| --- | --- | --- |
| Nenhum documento promete a declaração no app sem ressalva | guarda da etapa: `node docs/evidencias-v2/G00/V2-F00-E24/correcao-2/verificar-ressalvas.mjs`, código 0, "11 ocorrência(s) conferida(s), 0 sem a ressalva "em construção"." (`saidas/e24-guarda.txt`) | PASS |
| Guarda dentro do `npm test` | `npx vitest run test/ressalva-saida-a-campo.test.ts test/regras-de-conteudo.test.ts test/permissoes-no-readme.test.ts` em `packages/shared`: 3 arquivos, 58 casos, código 0 (`saidas/e24-vitest-shared.txt`) | PASS |
| Nenhum passo do cartão manda declarar a saída no aplicativo | `CARTAO-DO-AGENTE.md` lido no SHA: passo 2 "AVISE A COORDENAÇÃO PARA ONDE VOCÊ VAI", "pelo meio que o seu município combinou (rádio, telefone)", com o quadro "O aplicativo ainda não registra a sua saída. Esse recurso está em construção." | PASS |
| Nenhum "Pronto" na linha de segurança do agente | apresentação de 15/09: "Segurança do agente sozinho" com selo "Parcial" e o texto "Pronto no servidor e na tela da coordenação: ... O aplicativo do agente ainda não declara a saída, não prorroga ...", nas 8 combinações de Chromium e 4 de Firefox e WebKit (`ux-E24-15-09-seguranca-*`, 16) | PASS (ver Tentativas) |
| Sem travessão | contagem de U+2014 = 0 em README, COLOCAR-DE-PE, SEGURANCA, CARTAO, GUIA, LEIA-ME, PRIVACIDADE e nas duas apresentações | PASS |
| Portão visual nas duas apresentações e na tela que os documentos descrevem | ver lista abaixo | PASS, com os anotados |

Portão visual (seção 0 de `19`) nas duas apresentações e em "Quem está em campo":

- Alinhamento: selos alinhados na coluna "Estado" (`ux-E24-15-09-seguranca-1280-escuro-chromium.png`).
- Espaçamento: linhas da tabela com o mesmo respiro.
- Nada fora do lugar: sem rolagem horizontal da PÁGINA nas 48 capturas; a 390 e 320 px a tabela da apresentação rola dentro do próprio contêiner (`ux-E24-15-09-seguranca-320-escuro-chromium.png`), como na rodada 6 (anotado 2).
- Hierarquia: título, cabeçalho e selo distintos.
- Texto: ressalvas claras, sem prometer data, sem travessão.
- Responsivo: 1280, 768, 390 e 320 px (Chromium); 1280 e 390 (Firefox e WebKit).
- Dois temas: as páginas seguem o esquema de cor do sistema; selo "Parcial" legível nos dois.
- Estado vazio: "Quem está em campo" diz "Ninguém declarou saída a campo", "Esta lista mostra o que os agentes declararam, e nada além disso. O sistema não detecta queda...", e "Lista vazia significa que ninguém declarou, e não que ninguém está na rua." (`ux-E24-quem-esta-em-campo-390-escuro-firefox.png`), mas também "Declarar a saída é um passo do aplicativo do agente, feito na base e com sinal." (anotado 1).

## Evidência

- `MOTOR=<motor> node SCRATCH/val-ux/e24.mjs`, código 0 em Chromium (24 capturas), Firefox (12) e WebKit (12); saídas `saidas/e24-{chromium,firefox,webkit}.txt`; zero erro de página.
- Guarda e vitest acima, com código 0.
- `git log -1` dos documentos da etapa: `b17949a` (correção 3 da E24); `git diff 1ed0b71..fd17ff4 --stat -- dc360/docs` só lista `COLOCAR-DE-PE.md` (totais).

## Cenários positivos

1. A apresentação de 15/09 mostra "Parcial" com a ressalva nos três motores e dois temas.
2. O cartão do agente manda avisar a coordenação pelo meio combinado.

## Cenários negativos

1. Procura por "Pronto" como selo na linha de segurança: não há; a palavra só aparece dentro da explicação ("Pronto no servidor e na tela da coordenação"), que é a forma que o bloco da etapa recomenda ("a API e a tela da coordenação estão prontas; o aplicativo do agente ainda não declara").
2. Procura por travessão nos nove arquivos: zero.

## Tentativas de reprovar

- Medi a linha de segurança com um detector de "Pronto": ele acusa a palavra dentro do texto explicativo; li a linha inteira e o selo da coluna é "Parcial". Não é o selo que o teste negativo proíbe, mas quem lê só o começo do texto vê "Pronto" logo depois de "Parcial" (anotado 3).
- WebKit (não rodado na rodada 6) nas duas apresentações e na tela do painel.
- Procurei, no diff do README desta rodada, qualquer frase nova sobre saída a campo: nenhuma.

## Achados

1. **anotado.** Igual à rodada 6: o estado vazio de "Quem está em campo" ainda diz "Declarar a saída é um passo do aplicativo do agente, feito na base e com sinal.", e o aplicativo não declara; a etapa proíbe mexer no painel, então fica para a F14-E01 ou para uma etapa de painel. A frase seguinte ("Lista vazia significa que ninguém declarou, e não que ninguém está na rua") reduz o risco.
2. **anotado.** A 390 e 320 px a tabela das apresentações rola dentro do contêiner (sem rolagem da página); na apresentação do produto o botão "Alternar tema" tem 112x29 px a 390 e 320 px, abaixo dos 44 de toque. Páginas de apresentação, não o produto.
3. **anotado.** Na linha "Segurança do agente sozinho" o texto começa por "Pronto no servidor e na tela da coordenação"; uma redação que comece pelo que falta seria mais difícil de ler errado. Para Rafael e Alyson decidirem na leitura.

## Não verificado

- O PDF derivado da apresentação (não regenerado nem relido nesta rodada; o HTML fonte não mudou desde `3ed4fb6`, segundo a rodada 6).
- A leitura humana do CP-02 e da apresentação por Rafael e Alyson.

## Risco residual

Baixo: os documentos não prometem a declaração no aplicativo e a guarda que impede a volta do defeito está no `npm test`. O resíduo é o estado vazio do painel e a leitura apressada da linha da apresentação.

## Motivo do humano

A validação humana da etapa é de Rafael e Alyson: decidir o CP-02 e ler a apresentação ajustada antes de qualquer demonstração a município. Capturas para eles: `ux-E24-15-09-seguranca-1280-claro-chromium.png`, `ux-E24-15-09-seguranca-390-escuro-webkit.png`, `ux-E24-quem-esta-em-campo-390-escuro-firefox.png`.
