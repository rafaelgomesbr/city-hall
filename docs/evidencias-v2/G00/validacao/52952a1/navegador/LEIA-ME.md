# Capturas de navegador da validação da F00, rodada 3 (SHA 52952a1)

Produzidas em 2026-10-14 pelo validador de UX (claude-opus-5-5), na árvore com HEAD `95f09f6` (descendente de `52952a1` que só muda `docs/roadmap-v2/STATUS.md`: o produto é o do candidato). Servem às dimensões ux e acessibilidade das etapas E05, E08, E09, E10, E11, E13 e E24. Não são relatório nem veredito: os relatórios estão em `docs/evidencias-v2/G00/<etapa>/validacao/52952a1/ux.md`.

## Como foram geradas

Máquina: macOS arm64, Node do sistema, Chromium do Playwright instalado em `dc360/apps/web`. Nenhum arquivo do repositório foi alterado além desta pasta.

```bash
cd dc360
npm run build:shared
# painel construído FORA do repositório, apontando para a API desta rodada
cd apps/web && VITE_API_URL=http://127.0.0.1:3871 npx vite build --outDir $SP/val/ux/dist --emptyOutDir
# API com banco de teste em memória (PGlite, semeado ao subir) e notificador de arquivo
cd apps/api && PORT=3871 HOST=127.0.0.1 JWT_SEGREDO=<segredo de teste com mais de 32 bytes> \
  ORIGENS_PERMITIDAS=http://localhost:4871 URL_PAINEL=http://localhost:4871 URL_PUBLICA=http://127.0.0.1:3871 \
  LOGIN_POR_IP=10000 NOTIFICADOR_ARQUIVO=$SP/val/ux/tmp/notificacoes.txt npx tsx src/index.ts
# painel
cd apps/web && npx vite preview --outDir $SP/val/ux/dist --port 4871 --strictPort
# roteiros, em sequência, com a mesma API (o banco acumula o que cada um cria)
node $SP/val/ux/e13.mjs; node $SP/val/ux/e05.mjs; node $SP/val/ux/e08.mjs
node $SP/val/ux/e09.mjs; node $SP/val/ux/e09-foco.mjs; node $SP/val/ux/e10.mjs
node $SP/val/ux/e11.mjs; node $SP/val/ux/e24.mjs; node $SP/val/ux/e13b.mjs
```

`$SP` é a pasta de rascunho da sessão do validador (fora do git). Os roteiros (`lib.mjs` e um arquivo por etapa), as saídas (`*.log`) e o `resultados.json` (cada verificação, a medição de geometria de cada captura e os eventos de console e de foco) ficam lá. API e painel foram derrubados no fim; portas 3871 e 4871 livres.

## Contas de teste (fictícias, da semente de Serra Alta)

Senha de todas: `defesa-civil-2026`. Helena Vasques Coutinho (coordenadora, `helena.coutinho@serraalta.exemplo.gov.br`), Jonas Ferreira (operador, `jonas.ferreira@...`), Diego Nakamura Alves (agente de campo, Equipe Alfa, `diego.alves@...`), Rita Lopes (administradora, `rita.lopes@...`). Criadas pela API durante a rodada, também fictícias: "Paulo Henrique Duarte" (agente sem equipe, para o estado vazio do sino), "Fabiana Moreira Lins" (operadora, para a recuperação de senha), "Lúcia Andrade Prates" (cadastro de usuário com aviso), "Equipe Delta" e um órgão "Companhia de Saneamento de Serra Alta". Uma captura da E09 (`E09-janela-senha-temporaria-*`) mostra uma senha temporária sorteada por esse banco em memória, que já foi trocada e deixou de existir quando a API caiu.

## Convenções

- Nome: `Enn-<tela>-<largura>-<tema>.png`, larguras 1280, 390 e 320 (768 só no foco da E09), tema `claro` ou `escuro`.
- "vista" é a janela do navegador (o que a pessoa vê); "cheia" estica a janela até a altura do conteúdo (sem `fullPage`, para as barras fixas não aparecerem no meio). Nas capturas cheias as barras de cima e de baixo aparecem nas pontas da imagem.
- O tema é aplicado mudando `data-theme` na raiz (e `dc360:tema`), sem passar pelo botão do painel. Por isso o rótulo do botão de tema na barra de baixo pode não bater com o tema da imagem: é artefato da captura, não do produto.
- Várias larguras de um mesmo estado foram tiradas redimensionando a mesma página. A posição de rolagem depois de redimensionar não é a que a pessoa veria naquela largura; onde isso importa (foco na confirmação de Minha conta) há as capturas `E09-minha-conta-confirmacao-com-foco-nativo-*`, feitas com o fluxo inteiro em cada largura, sem redimensionar.
- Estados obtidos com resposta simulada pelo Playwright (rota interceptada), e não pelo servidor real: `E09-minha-conta-sessoes-carregando-*` (resposta retida), `E09-minha-conta-sessoes-erro-simulado-*` (500), `E10-pedido-desligada-simulada-*` (`{ ativa: false }`), `E11-organizacao-saida-gerando-*` (resposta retida), `E11-organizacao-saida-erro-recusa-*` (o 403 REAL que o servidor deu à coordenadora, servido à tela da administradora), `E11-organizacao-saida-erro-rede-*` (conexão abortada) e `E11-organizacao-saida-erro-servidor-*` (500).
- E24: os dois HTML abertos por `file://`, com recortes dos cartões de papel, da matriz com a nota, e das linhas alteradas das tabelas de 15/09 (a 390 a tabela fica num contêiner que rola na lateral; o recorte mostra a parte visível).

## Medição automática

Cada captura do painel passa por uma medição no navegador: rolagem horizontal da página, controle passando da área útil do cartão ou da janela, texto cortado e alvo com menos de 44 px de altura em 390 e 320. Achados nesta rodada: só "Mostrar desativados" em Órgãos a 320 px (passa 15 px da área útil, anterior à fase) e o botão "Corrigir a coordenada" com 24 px de altura na Ocorrência a 390 px (anterior à fase). Erros de console: só as respostas 401, 403, 500 e de rede provocadas de propósito; nenhum `pageerror`.
