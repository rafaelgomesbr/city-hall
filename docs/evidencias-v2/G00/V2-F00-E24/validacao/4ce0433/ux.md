---
validador: ux
modelo: claude-opus-5-5
etapa: V2-F00-E24
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: []
nivel_de_prova_exigido: [E2, E3b]
nivel_de_prova_obtido: [E2, E3b]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: guarda-da-etapa-vermelho-no-sha
---
## Critérios verificados

A etapa não tem tela própria: é documentação e apresentação (o bloco diz "Portão visual: não se aplica (sem UI nem MOBILE)" e proíbe "mudança em API ou painel"). O que ela entrega ao usuário é TEXTO: os documentos `dc360/docs/SEGURANCA-DO-AGENTE.md`, `CARTAO-DO-AGENTE.md`, `GUIA-DO-COORDENADOR.md` (seção 9), `LEIA-ME.md`, `PRIVACIDADE.md`, `PAPEIS_E_RESPONSABILIDADES.md`, `dc360/README.md`, e duas páginas de apresentação (`dc360/docs/apresentacao/2026-09-15-para-o-alyson.html` e o PDF derivado, `docs/apresentacao-produto-alyson.html`). Audito esse texto e as duas páginas como superfície visual, e o estado vazio do painel que a rodada 4 apontou.

Entre `bb0f654` e `4ce0433` a correção 4 da E22 mexeu em seis desses documentos (`git diff bb0f654..4ce0433 -- dc360/docs dc360/README.md`); as apresentações e o PDF não mudaram desde `3ed4fb6` (correção 2 da E24).

| Critério | Prova | Resultado |
| --- | --- | --- |
| Nenhum documento promete a declaração no app sem ressalva | lidos no SHA: SEGURANCA (quadro "Estado atual: recurso em construção", linha 8), CARTAO (passo 2 "AVISE A COORDENAÇÃO", "O aplicativo ainda não registra a sua saída", e "Ao voltar" sem mandar confirmar no app), GUIA seção 9 ("Estado atual: a tela existe, mas fica vazia", "o sino não vai avisar de prazo estourado nenhum"), LEIA-ME, README (quadro "pela metade"), PRIVACIDADE ("Recurso em construção") | PASS, com o Achado 1 |
| Nenhum "Pronto" na linha de segurança do agente | 15/09, linha "Segurança do agente sozinho" com selo "Parcial" e a ressalva inteira, nas 8 combinações de largura e tema (`ux-15-09-seguranca-*`) | PASS |
| Apresentação e PDF coerentes | PDF e HTML mudaram juntos pela última vez em `3ed4fb6`; PDF de 891717 bytes, 24 páginas (contagem de objetos de página) | PASS (texto do PDF não reextraído, ver Não verificado) |
| O guia diz que a tela ficará vazia | GUIA seção 9, citado acima | PASS |
| Sem travessão | contagem de U+2014 = 0 nos nove arquivos auditados | PASS |
| Teste negativo da etapa (guarda `correcao-2/verificar-ressalvas.mjs`) | `node docs/evidencias-v2/G00/V2-F00-E24/correcao-2/verificar-ressalvas.mjs`: código 1, "11 ocorrência(s) conferida(s), 1 sem a ressalva" (`e24-ressalvas.txt`) | REGREDIU no SHA (Achado 1) |

Portão visual (seção 0 de `19`) aplicado às duas páginas de apresentação e ao estado vazio do painel:

- Alinhamento: PASS. Selos alinhados na coluna "Estado"; os quatro cartões de papel da apresentação do produto com a mesma altura em 1280 e 768.
- Espaçamento: PASS. Nada grudado; linhas da tabela com o mesmo respiro.
- Nada fora do lugar: PASS na página (`rolagemPagina: 0` em 1280, 768, 390 e 320, nos dois arquivos, nos dois temas). A 390 e 320 as tabelas rolam dentro do contêiner (`.rolavel`, `.matrix-wrap`: 350 ou 280 px visíveis de 560), então a coluna "Observação" da 15/09 e as colunas Coordenador e Administrador da matriz ficam fora da vista até rolar (Achado 3).
- Hierarquia: PASS.
- Texto bem escrito: PASS nas frases da etapa. Ressalvas claras, sem prometer data ("planejada, sem data"), sem travessão. A frase do cartão do Operador ("quando a saída a campo estiver no aplicativo (em construção), acompanha quem está em campo") é correta, embora carregada.
- Responsivo: 1280, 768, 390 e 320 px conferidos; zoom de 200 por cento não.
- Dois temas: PASS. As duas páginas respeitam o esquema de cor (fundo `rgb(250, 250, 248)` claro e `rgb(23, 22, 26)` escuro), selos legíveis nos dois.
- Estados vazios: o estado vazio do painel "Quem está em campo" ainda diz "Declarar a saída é um passo do aplicativo do agente, feito na base e com sinal" (Achado 2).
- Rafael vê e aprova: pendente.

Item do "Motivo do veredito" da rodada 4 (UX FAIL arbitrado): a frase do estado vazio de "Quem está em campo" (`apps/web/src/paginas/QuemEstaEmCampo.tsx:191-193`) NÃO foi consertada; reproduzi no SHA contra a API real, como coordenadora, nas capturas `ux-painel-quem-esta-em-campo-vazio-{1280,390}-{claro,escuro}.png`. O que mudou é a outra metade do achado ("nenhuma pendência cita a frase"): ela agora está registrada como H30 em `docs/roadmap-v2/pendencias-humanas.md:32`, com dono Rafael e Alyson, ligada à D-25. Pela arbitragem da rodada 4 isso fica fora do escopo da etapa (que proíbe mexer no painel).

## Evidência

- `node e24.mjs <capturas> e24-saida.txt` (Playwright Chromium, `reducedMotion: reduce` porque a apresentação do produto rola com `scroll-behavior: smooth` e a primeira rodada capturou no meio da rolagem): código 0, zero erro de console e de página. Saída: `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L08-ux/e24-saida.txt`.
- Guarda da etapa: `.../L08-ux/e24-ressalvas.txt` (código 1).
- Painel: API real na 3791 e painel na 4791, construídos do worktree de `4ce0433`.
- Capturas em `docs/evidencias-v2/G00/V2-F00-E24/validacao/4ce0433/capturas/` (todas abertas em folhas de contato `.../L08-ux/folhas/e24-*.png`):
  - `ux-15-09-{seguranca,perfil,sino,operador}-{1280,768,390,320}-{claro,escuro}.png` (32)
  - `ux-produto-{cartao-operador,matriz}-{1280,768,390,320}-{claro,escuro}.png` (16)
  - `ux-painel-quem-esta-em-campo-vazio-{1280,390}-{claro,escuro}.png` (4)

## Cenários positivos

- As linhas "Segurança do agente sozinho" (Parcial), "Perfil com foto e números" (com a nota do indicador), "Sino do painel" e "Operador / plantonista" da 15/09 mostram a ressalva nas oito combinações.
- O cartão do Operador e a linha "Acompanhar quem está em campo (em construção)" da matriz, mais a nota abaixo dela, na apresentação do produto.
- Os quadros "Estado atual" de SEGURANCA, GUIA e README continuam no SHA depois da correção 4 da E22.

## Cenários negativos

- Nenhum passo do cartão de bolso manda declarar a saída ou confirmar o retorno no aplicativo (passo 2 e "Ao voltar" lidos).
- Nenhum selo "Pronto" na linha de segurança do agente.
- A nota da matriz ("A última linha é a única diferença operacional entre coordenador e administrador") continua verdadeira depois da linha nova: a última linha é "Configurar retenção, armazenamento e saída do município", só do administrador.

## Tentativas de reprovar

- Rodei a guarda que a própria etapa criou como teste negativo, no SHA: está vermelha (Achado 1).
- Procurei frase nova sem ressalva nos documentos que a correção 4 da E22 reescreveu depois da rodada 4: achei a tabela nova de PAPEIS (Achado 1); GUIA, SEGURANCA, CARTAO, PRIVACIDADE e LEIA-ME mantêm as ressalvas.
- Telas estreitas (390 e 320) para achar ressalva escondida: a ressalva da 15/09 fica na coluna que rola, mas o selo "Parcial" está sempre à vista (Achado 3).
- Tema escuro nas duas apresentações: completo.
- Travessão nos nove arquivos: nenhum.
- Abri o estado vazio do painel para ver se o item da rodada 4 foi consertado: não foi (Achado 2).

## Achados

1. corrige antes de crescer, e peço arbitragem (por isso `escalar`): a correção 4 da E22 (`4ce0433`) acrescentou a `dc360/docs/PAPEIS_E_RESPONSABILIDADES.md` a seção "A tabela, de uma vez", com a linha "| Acompanhar quem está em campo agora | sim | não | sim | sim |" (linha 209) sem ressalva e sem nota abaixo da tabela, no mesmo documento em que as linhas 45, 60 e 132 dizem "em construção". Reprodução: `node docs/evidencias-v2/G00/V2-F00-E24/correcao-2/verificar-ressalvas.mjs` sai com código 1 ("SEM RESSALVA ... PAPEIS_E_RESPONSABILIDADES.md (paragrafo 43)"), quando a evidência da correção 2 registrou código 0. Não reprovo sozinho porque a linha é da mesma classe da tabela de permissões do README, que a correção 2 deixou sem ressalva com motivo (descreve a permissão, que existe, e é presa ao código por teste, aqui `packages/shared/test/permissoes-no-readme.test.ts`, que confere os rótulos das células), e as rodadas 3 e 4 aceitaram aquela exceção. Mas a rodada 2 reprovou esta etapa justamente por "acompanha quem está em campo" sem ressalva, e o guarda da etapa está vermelho: o gatekeeper decide. Conserto barato sem tocar nas células: uma nota abaixo da tabela, ou a exceção registrada no guarda.
2. corrige antes de crescer (fora do escopo, dono Rafael): o estado vazio de "Quem está em campo" no painel promete "Declarar a saída é um passo do aplicativo do agente, feito na base e com sinal", e o aplicativo não tem esse passo. Reprodução: entrar como coordenadora e abrir `/quem-esta-em-campo` (`ux-painel-quem-esta-em-campo-vazio-390-claro.png`). Fora do escopo porque a etapa proíbe mudar o painel; agora registrado como H30.
3. anotado (fora do escopo): a 390 e 320 px as tabelas das duas apresentações rolam de lado dentro do contêiner sem dica visual de que há mais colunas; a ressalva da linha "Segurança do agente sozinho" fica parcialmente fora da vista até rolar (`ux-15-09-seguranca-390-claro.png`), e a matriz mostra só Operador e Agente (`ux-produto-matriz-390-claro.png`). O CSS das apresentações não foi tocado pela etapa e o contêiner já rolava antes.

## Não verificado

- Texto do PDF regenerado: não reextraí (só tamanho, páginas e o commit comum com o HTML). A paridade de conteúdo HTML e PDF fica com a dimensão de QA ou com a leitura do Rafael.
- Zoom de 200 por cento.
- Outros documentos fora da lista da etapa que a E22 possa ter mudado (não fiz varredura inteira de `docs/`, só os arquivos da etapa e o guarda).
- Leitura humana da apresentação antes de demonstração (é da validação humana).

## Risco residual

Médio na frente de texto: a etapa existe para que nenhum material entregue a município prometa segurança física sem entrega, e a fase continua reescrevendo esses documentos (a E22 mexeu em seis deles nesta rodada). O guarda da etapa é o que pega a regressão, e ele está vermelho no SHA sem que ninguém o rode no CI. A frase do painel (Achado 2) continua prometendo um passo inexistente, numa tela de segurança.

## Motivo do humano

A validação humana da etapa: Rafael e Alyson confirmam a D-25 (CP-02) e leem a apresentação ajustada antes de qualquer demonstração. Além disso Rafael decide a H30 (frase do estado vazio do painel). Gatilho "texto de produto" (ressalvas novas nos documentos e na apresentação). Capturas que precisa ver: `ux-15-09-seguranca-1280-claro.png`, `ux-15-09-seguranca-390-escuro.png`, `ux-produto-matriz-1280-claro.png`, `ux-produto-cartao-operador-768-claro.png` e `ux-painel-quem-esta-em-campo-vazio-1280-claro.png`, mais a linha 209 de `PAPEIS_E_RESPONSABILIDADES.md` (Achado 1).
