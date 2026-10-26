---
validador: ux
modelo: claude-opus-5-5
etapa: V2-F00-E11
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, A11Y, LGPD]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Superfície da etapa: o cartão "Saída de município" em `/organizacao` (`apps/web/src/paginas/Organizacao.tsx:213-273`) e o cliente `baixarPacoteDeSaida` (`apps/web/src/dados/http.ts:1105-1111`). Entre `4ce0433` e `1ed0b71` nenhum dos dois arquivos mudou (`git diff 4ce0433..1ed0b71 --stat` não os lista); o que mudou no painel nesse intervalo (Toast, Modal, `app.css`, `comuns.tsx`) não toca o cartão, e a regressão foi conferida nas capturas abaixo.

| Critério (DoD, cinco campos de teste e portão visual da seção 0 de `19`) | Prova | Resultado |
| --- | --- | --- |
| Botão baixa o ZIP contra a API real, em dois navegadores | API real (Postgres em WebAssembly, semente) e painel construído do SHA; Rita (administradora) clica; 8 combinações em Chromium e 4 em Firefox: nome `dc360-pacote-de-saida-2026-10-20.zip`, 248 a 249 mil bytes, assinatura `PK`, `failure()` nulo (`saidas/e11-run-chromium.txt`, `saidas/e11-run-firefox.txt`) | PASS |
| Estado "Gerando" e botão desabilitado enquanto gera | pedido segurado 1,5 s; texto "Gerando", `disabled=true`, 118x44 (`ux-E11-carregando-*`, 12 capturas) | PASS |
| Recusa mostra a frase do servidor (coordenadora 403, município suspenso, rede caída) | corpo 403 `sem_permissao` REAL pedido à API com o token da Helena e servido ao navegador; `acesso_suspenso` com a frase do catálogo; rede abortada. As três frases aparecem dentro do cartão, sem sair da tela nem derrubar a sessão (`url` continua `/organizacao`) (`ux-E11-erro-*`, 36 capturas) | PASS, com o achado 3 (texto) |
| Alinhamento e espaçamento | aviso de erro de 41 a 727 px num cartão de 16 a 752 (768), de 41 a 279 num de 16 a 304 (320): mesma margem interna dos dois lados; botão sempre dentro do cartão | PASS |
| Nada fora do lugar, cortado ou grudado | `geometria()` em todas as 12 combinações: sem rolagem horizontal, nada fora da janela, sem palavra quebrada no meio; o único "cortado" acusado é o `label.oculto-visualmente` da busca (rótulo só para leitor de tela, falso positivo da sonda) | PASS |
| Responsivo 1280, 768, 390, 320 | `ux-E11-normal-chromium-{1280,768,390,320}-{claro,escuro}.png`; fim da página a 320 e 390: o botão termina 41 px acima da barra do rodapé nos dois motores (`saidas/e11-fim.txt`, `ux-E11-fim-da-pagina-*`) | PASS |
| Dois temas | escuro com fundo, aviso de perigo e selo legíveis (`ux-E11-erro-rede-chromium-1280-escuro.png`, `ux-E11-erro-suspenso-chromium-320-escuro.png`) | PASS |
| Toque de 44 px no celular | botão 216x44 e 118x44 em 390 e 320 | PASS |
| Foco visível | Tab real até o botão nos dois motores: anel violeta inteiro (`ux-E11-foco-por-tab-chromium-1280-claro.png`, `ux-E11-foco-por-tab-firefox-1280-claro.png`) | PASS |
| Texto em português, sem travessão | frases do cartão e das recusas lidas nas capturas; sem U+2014 | PASS, com o achado 3 |
| Nome do arquivo `dc360-pacote-de-saida-AAAA-MM-DD.zip` | formato confere; o DIA sai em UTC (achado 1) | PASS no formato, achado 1 |
| Rafael vê e aprova | pendente | humano |

Heurísticas de Nielsen aplicadas ao cartão:

1. Visibilidade do estado: "Gerando" e desabilitado durante o pedido; depois do download o cartão volta ao repouso sem dizer que o arquivo saiu (achado 4).
2. Correspondência com o mundo real: "pacote de saída", "baixar não apaga nada": linguagem do domínio.
3. Controle e liberdade: baixar não apaga nada e pode ser repetido; não há cancelar durante a geração (aceitável para um pedido curto).
4. Consistência: botão secundário com ícone, `Aviso tom="perigo"` igual ao resto do painel.
5. Prevenção de erro: a rota de raiz não é mais chamada; só quem administra vê o cartão.
6. Reconhecer em vez de lembrar: o parágrafo diz o que o pacote contém.
7. Eficiência: um clique.
8. Estética: cartão enxuto, alinhado aos irmãos "Uso de armazenamento" e "Prazo de retenção".
9. Recuperação de erro: as três frases dizem o que aconteceu; a de rede diz o que fazer ("Verifique o sinal e tente de novo"); a de permissão fala em "alterar" (achado 3).
10. Ajuda: a frase do suspenso diz a quem procurar.

## Evidência

- API: `npx tsx src/index.ts` em `apps/api`, porta 3795, `ORIGENS_PERMITIDAS` e `URL_PAINEL` na 4795 (log em `SCRATCH/validadores/ux-l3/saidas/api.log`); `/saude` 200 com `ultimaMigracao` 051.
- Painel: `VITE_API_URL=http://127.0.0.1:3795 npx vite build --outDir SCRATCH/validadores/ux-l3/web-dist` (código 0, `saidas/build-web.txt`), servido por `vite preview` na 4795. Ambos derrubados no fim; `web-dist` apagado.
- `node e11.mjs chromium`: código 0, `SCRATCH/validadores/ux-l3/saidas/e11-run-chromium.txt` (e `saidas/e11.txt`).
- `node e11.mjs firefox`: código 0, `saidas/e11-run-firefox.txt`.
- `node e11-fim.mjs`: código 0, `saidas/e11-fim-run.txt`.
- SCRATCH é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad`; os roteiros estão em `SCRATCH/validadores/ux-l3/`.
- Capturas (79) em `docs/evidencias-v2/G00/V2-F00-E11/validacao/1ed0b71/capturas/`: `ux-E11-{normal,carregando,depois-do-download,erro-sem-permissao,erro-suspenso,erro-rede}-chromium-{1280,768,390,320}-{claro,escuro}.png`, as mesmas em `firefox-{1280,390}-{claro,escuro}`, `ux-E11-fim-da-pagina-{chromium,firefox}-{320,390}-claro.png`, `ux-E11-foco-por-tab-{chromium,firefox}-1280-claro.png`. Olhadas uma a uma, entre outras: `ux-E11-normal-chromium-1280-claro.png`, `ux-E11-carregando-chromium-390-escuro.png`, `ux-E11-erro-rede-chromium-1280-escuro.png`, `ux-E11-erro-sem-permissao-chromium-768-escuro.png`, `ux-E11-erro-suspenso-chromium-320-escuro.png`.
- Erros de console: em Chromium só os "Failed to load resource" (403 e `ERR_FAILED`) que eu mesmo provoquei nas recusas; em Firefox só o aviso de CORS do pedido que eu abortei. Nenhum `pageerror`. Nas combinações sem recusa, zero.

## Cenários positivos

- Download completo pelo botão, por clique e por Enter, em Chromium e Firefox, em 1280, 768, 390 e 320 px, nos dois temas.
- "Gerando" aparece e o botão volta a "Baixar pacote de saída" ao fim.
- Cartão inteiro e alcançável no fim da página a 320 px, sem ficar atrás da barra do rodapé.

## Cenários negativos

- Coordenadora (sem `gerenciar_organizacao`): a API responde 403 `sem_permissao` com "Seu perfil não tem permissão para alterar os dados do município." e a tela mostra exatamente essa frase (`ux-E11-erro-sem-permissao-*`).
- Município suspenso: a frase de contrato aparece inteira e quebra em linhas a 320 px sem cortar (`ux-E11-erro-suspenso-chromium-320-escuro.png`).
- Rede caída: "Sem conexão com o servidor. O arquivo não foi baixado. Verifique o sinal e tente de novo." (`ux-E11-erro-rede-*`).
- Em nenhuma recusa a sessão cai nem a URL muda.

## Tentativas de reprovar

- Largura mínima (320x568) e tema escuro na frase mais longa (suspenso): cabe, sem palavra partida, sem rolagem horizontal.
- Rolar até o fim a 320 e 390 para ver se a barra fixa do rodapé cobre o botão: sobra 41 px nos dois motores.
- Relógio da página em 20/10/2026 às 22:30 em `America/Sao_Paulo` (`page.clock.setSystemTime`, `timezoneId`): o arquivo sai `dc360-pacote-de-saida-2026-10-21.zip`, em Chromium e em Firefox (achado 1).
- Teclado: Enter no botão baixa; o foco depois vai ao BODY nos dois motores (achado 2).
- Procurei confirmação de conclusão dentro da página depois do download: não há (achado 4).
- Regressão das mudanças de Toast, Modal e `app.css` desde a rodada 5 no cartão: nenhuma diferença visível nem medida.

## Achados

1. corrige antes de crescer (herdado da rodada 4, não consertado): o nome do arquivo usa a data UTC (`http.ts:1109`, `new Date().toISOString().slice(0, 10)`). Reprodução: relógio às 22:30 de 20/10/2026 em Brasília, clique em "Baixar pacote de saída": o arquivo chega como `dc360-pacote-de-saida-2026-10-21.zip` (`saidas/e11-run-chromium.txt` e `saidas/e11-run-firefox.txt`, linha "data"). Das 21h à meia-noite o nome diz o dia seguinte. Não reprova: o DoD pede o formato, que confere.
2. corrige antes de crescer (acessibilidade, já com dono V2-F10-E11 pela arbitragem da rodada 4): ao acionar o botão por teclado o foco cai no BODY ao fim do download (`foco=BODY` em todas as combinações), por causa de `disabled={baixando}`.
3. anotado (texto de catálogo, F03, já registrado em `apps/web/PENDENCIAS.md` seção 8): quem não administra e tenta BAIXAR lê "Seu perfil não tem permissão para alterar os dados do município." A frase é verdadeira sobre a permissão, mas não sobre o gesto.
4. anotado: depois do download nenhuma mensagem na página confirma que o pacote saiu; a confirmação fica só com a barra de downloads do navegador. Para o "arquivo mais sensível do sistema" uma linha "Pacote gerado em ... (n arquivos)" ajudaria; não é critério da etapa.
5. anotado (fora do escopo, componente da busca global): a 320 px o texto do campo de busca do topo aparece como "Buscar registro ou funç" (`ux-E11-erro-suspenso-chromium-320-escuro.png`), já registrado pela rodada 5 da E13.

## Não verificado

- A renovação por 401 vista no navegador (é da dimensão de QA; não provoquei 401 aqui).
- Conteúdo do ZIP além da assinatura e do tamanho (QA e LGPD).
- Zoom de 200 por cento e leitor de tela real.
- WebKit (a etapa pede Chromium e Firefox).
- A abertura do ZIP por uma pessoa (validação humana da etapa).

## Risco residual

Baixo na interface: o cartão é pequeno e os quatro estados estão desenhados. Fica o nome com a data errada à noite (o arquivo pode ser arquivado com o dia seguinte e confundir quem procura o pacote por data) e a falta de confirmação de conclusão dentro da página.

## Motivo do humano

A validação humana da etapa: Rafael baixa o pacote pelo painel com a API local e abre o ZIP. Só uma pessoa confere que o arquivo abre no descompactador do sistema dela e que o conteúdo faz sentido para quem recebe a saída do município. Capturas para ver primeiro: `ux-E11-normal-chromium-1280-claro.png`, `ux-E11-carregando-chromium-390-escuro.png`, `ux-E11-erro-suspenso-chromium-320-escuro.png` e `ux-E11-erro-sem-permissao-chromium-768-escuro.png` (achado 3).
