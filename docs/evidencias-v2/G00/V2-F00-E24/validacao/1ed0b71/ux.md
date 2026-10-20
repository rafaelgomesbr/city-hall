---
validador: ux
modelo: claude-opus-5-5
etapa: V2-F00-E24
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
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

A etapa é só documentação e apresentação ("Portão visual: não se aplica (sem UI nem MOBILE)", e proíbe "mudança em API ou painel"). O que ela entrega a quem lê é TEXTO: `dc360/docs/SEGURANCA-DO-AGENTE.md`, `CARTAO-DO-AGENTE.md`, `GUIA-DO-COORDENADOR.md` (seção 9), `LEIA-ME.md`, `PRIVACIDADE.md`, `PAPEIS_E_RESPONSABILIDADES.md`, `dc360/README.md`, e duas páginas de apresentação (`dc360/docs/apresentacao/2026-09-15-para-o-alyson.html` com o PDF derivado, e `docs/apresentacao-produto-alyson.html`). Auditei o texto e as páginas como superfície visual, e o estado vazio do painel que as rodadas 4 e 5 apontaram.

Desde a rodada 5 (`4ce0433`) a etapa mudou: a linha 209 de `PAPEIS_E_RESPONSABILIDADES.md` (o defeito que deixou o guarda vermelho), o teste novo `packages/shared/test/ressalva-saida-a-campo.test.ts`, o README (abertura do quadro de estado e parágrafo do portão de conteúdo). As duas apresentações e o PDF não mudam desde `3ed4fb6`.

| Critério | Prova | Resultado |
| --- | --- | --- |
| Nenhum documento promete a declaração no app sem ressalva | lidos no SHA: quadro "Estado atual: recurso em construção" em SEGURANCA (linhas 8 a 15); CARTAO manda avisar a coordenação pelo meio combinado; GUIA seção 9 com o quadro "a tela existe, mas fica vazia" (linha 240: "prazo estourado nenhum. Tela vazia, hoje, não quer dizer que ninguém está no morro"); README abre a seção com "Estado em 07/10/2026: recurso em construção, pela metade" (linha 1031); PRIVACIDADE com "Recurso em construção"; PAPEIS linha 209 agora "sim (em construção)" nas três colunas | PASS |
| Guarda da etapa (o FAIL da rodada 5) | `node docs/evidencias-v2/G00/V2-F00-E24/correcao-2/verificar-ressalvas.mjs`: código 0, "11 ocorrência(s) conferida(s), 0 sem a ressalva" (`saidas/e24-guarda-correcao-2.txt`) | PASS (consertado) |
| Guarda dentro do `npm test` | `npx vitest run test/ressalva-saida-a-campo.test.ts test/regras-de-conteudo.test.ts test/permissoes-no-readme.test.ts` em `packages/shared`: 3 arquivos, 58 casos, código 0 (`saidas/e24-vitest-shared.txt`) | PASS |
| Nenhum "Pronto" na linha de segurança do agente | 15/09, "Segurança do agente sozinho" com selo "Parcial" (`pilula p-parcial`) e a ressalva, nas 8 combinações (`ux-E24-15-09-seguranca-*`) | PASS |
| Apresentação e PDF coerentes | texto do PDF extraído (pypdf): 24 páginas, a linha "Segurança do agente sozinho" com "Parcial" e "O aplicativo do agente ainda não declara a saída, não prorroga e não confirma o retorno: hoje a tela 'Quem está em campo' fica vazia...", as ressalvas de "Perfil com foto e números", "Sino do painel" e "Operador / plantonista" presentes, 0 travessão (`saidas/e24-pdf-texto.txt`) | PASS |
| O guia diz que a tela ficará vazia | GUIA seção 9, citado acima | PASS |
| Sem travessão | contagem de U+2014 = 0 nos nove arquivos da etapa; `regras-de-conteudo` verde | PASS |
| Portão visual nas duas apresentações | ver lista abaixo | PASS, com o anotado 2 |

Portão visual (seção 0 de `19`) aplicado às duas apresentações:

- Alinhamento: selos alinhados na coluna "Estado"; os quatro cartões de papel da apresentação do produto com a mesma altura em 1280 (334 px cada) e 768 (397 px cada) (`saidas/e24.txt`, `ux-E24-produto-cartao-operador-{1280,768}-*`). A 390 e 320 px os cartões empilham e cada um tem a altura do próprio texto, o esperado.
- Espaçamento: linhas da tabela com o mesmo respiro; nada grudado (`ux-E24-15-09-seguranca-1280-escuro.png`).
- Nada fora do lugar: sem rolagem horizontal da PÁGINA em nenhuma das 16 combinações das duas páginas (`paginaRola:false`). A 390 e 320 px as tabelas rolam dentro do contêiner (`.rolavel` 560/350 e 560/280; `.matrix-wrap` 560/356 e 560/286): anotado 2.
- Hierarquia: título da seção, cabeçalho da tabela e selo distintos, igual ao resto do documento.
- Texto bem escrito: ressalvas claras, sem prometer data ("planejada, sem data"), sem travessão. A matriz usa o sinal "–" (U+2013, meia-risca) como "não", que não é o caractere proibido.
- Responsivo: 1280, 768, 390 e 320 px.
- Dois temas: as duas páginas seguem o esquema de cor do sistema; selo "Parcial" legível nos dois (`ux-E24-15-09-seguranca-1280-escuro.png`, `ux-E24-15-09-seguranca-320-claro.png`).
- Estados vazios: o painel "Quem está em campo" ainda diz "Declarar a saída é um passo do aplicativo do agente, feito na base e com sinal." (achado 1).
- Rafael vê e aprova: pendente.

## Evidência

- Guarda: `node docs/evidencias-v2/G00/V2-F00-E24/correcao-2/verificar-ressalvas.mjs` na raiz, código 0, `SCRATCH/validadores/ux-l3/saidas/e24-guarda-correcao-2.txt`.
- Testes de conteúdo: comando acima em `dc360/packages/shared`, código 0, `saidas/e24-vitest-shared.txt`.
- PDF: extração com pypdf, `saidas/e24-pdf-texto.txt`.
- Varredura: `grep -rn -i -E "declar[ae]r? a saída|saída a campo|confirm[ae]r? o retorno|prazo estourado"` em `dc360/docs`, README, `apps/campo/LEIA-ME.md`, `apps/web/PENDENCIAS.md`, `docs/APRESENTACAO.md`, `docs/ROTEIRO_VIDEO.md`, as duas apresentações, `relatorio-apresentacao-alyson.html` e `mockup`, filtrando as linhas que já trazem a ressalva: sobram só linhas DENTRO das seções que abrem com o quadro de estado (SEGURANCA, GUIA seção 9, README "O agente que sobe o morro sozinho") e a tabela de retenção de PRIVACIDADE (prazo do dado que a API guarda, exceção já aceita).
- `node e24.mjs` (Playwright Chromium, `reducedMotion: reduce`): código 0, `saidas/e24-run.txt` e `saidas/e24.txt`. Painel e API do SHA nas portas 3795 e 4795 para o vazio de "Quem está em campo", derrubados no fim.
- SCRATCH é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad`.
- Capturas (50) em `docs/evidencias-v2/G00/V2-F00-E24/validacao/1ed0b71/capturas/`: `ux-E24-15-09-{seguranca,perfil,sino,operador}-{1280,768,390,320}-{claro,escuro}.png` (32), `ux-E24-produto-{cartao-operador,matriz}-{1280,768,390,320}-{claro,escuro}.png` (16), `ux-E24-painel-quem-esta-em-campo-vazio-{1280-claro,390-escuro}.png` (2). Zero erro de console e de página nas duas apresentações.

## Cenários positivos

- As linhas "Segurança do agente sozinho" (Parcial), "Perfil com foto e números" (com a nota do indicador), "Sino do painel" e "Operador / plantonista" da 15/09 trazem a ressalva nas oito combinações, e o PDF diz o mesmo.
- O cartão do Operador e a linha "Acompanhar quem está em campo (em construção)" da matriz da apresentação do produto.
- A tabela de papéis do `PAPEIS_E_RESPONSABILIDADES.md` voltou a ter a ressalva, e a regra agora roda no `npm test` do pacote compartilhado.

## Cenários negativos

- Nenhum passo do cartão de bolso manda declarar a saída ou confirmar o retorno no aplicativo.
- Nenhum selo "Pronto" na linha de segurança do agente, no HTML e no PDF.
- A nota abaixo da matriz ("A última linha é a única diferença operacional entre coordenador e administrador") continua verdadeira depois da linha nova.

## Tentativas de reprovar

- Rodei o guarda que reprovou a rodada 5: verde.
- Varri a mesma classe de frase fora da lista do teste (documentos, apresentações, raiz, protótipo): nada novo sem ressalva.
- Extraí o texto do PDF para ver se ele ficou para trás do HTML (a rodada 5 não tinha conferido): coerente.
- Telas estreitas (390 e 320) para achar ressalva escondida: a ressalva da 15/09 fica na coluna que rola, mas o selo "Parcial" está sempre à vista (anotado 2).
- Tema escuro nas duas apresentações: completo.
- Abri o estado vazio do painel para ver se a frase da rodada 4 mudou: não mudou (achado 1).

## Achados

1. corrige antes de crescer (fora do escopo, dono Rafael, pendência H30 em `docs/roadmap-v2/pendencias-humanas.md`): o estado vazio de "Quem está em campo" no painel diz "Ninguém declarou saída a campo. Declarar a saída é um passo do aplicativo do agente, feito na base e com sinal.", e o aplicativo de hoje não tem esse passo. Reprodução: entrar como coordenadora e abrir `/quem-esta-em-campo` (`ux-E24-painel-quem-esta-em-campo-vazio-1280-claro.png`). Não reprova a etapa: ela proíbe mudar o painel e a arbitragem da rodada 4 já decidiu assim.
2. anotado (anterior, CSS das apresentações não tocado pela etapa): a 390 e 320 px as tabelas das duas apresentações rolam de lado dentro do contêiner, sem dica visual de que há mais colunas; a ressalva da linha "Segurança do agente sozinho" fica fora da vista até rolar (`ux-E24-15-09-seguranca-320-claro.png`), e a matriz mostra só as primeiras colunas (`ux-E24-produto-matriz-320-claro.png`).

## Não verificado

- Zoom de 200 por cento.
- A leitura humana da apresentação antes de demonstração e a confirmação da D-25 (validação humana da etapa).
- Os demais testes do `npm test` fora do pacote compartilhado (a etapa não mexeu em código de API nem de painel; é da dimensão de QA).
- Documentos fora dos diretórios varridos acima.

## Risco residual

Médio na frente de texto: a fase continua reescrevendo esses documentos, e o teste do pacote compartilhado só cobre os arquivos e padrões listados nele. A frase do painel (achado 1) continua prometendo um passo inexistente numa tela de segurança até a H30 ser decidida.

## Motivo do humano

A validação humana da etapa: Rafael e Alyson confirmam a D-25 (CP-02) e leem a apresentação ajustada antes de qualquer demonstração a município; Rafael decide a H30 (a frase do vazio do painel). Gatilho texto de produto. Capturas para ver: `ux-E24-15-09-seguranca-1280-claro.png`, `ux-E24-15-09-seguranca-390-escuro.png`, `ux-E24-produto-matriz-1280-claro.png`, `ux-E24-produto-cartao-operador-768-claro.png` e `ux-E24-painel-quem-esta-em-campo-vazio-1280-claro.png`, mais a linha 209 de `dc360/docs/PAPEIS_E_RESPONSABILIDADES.md`.
