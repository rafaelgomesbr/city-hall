---
validador: arbitragem
modelo: claude-opus-5-5
etapa: V2-F00-E10
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD, INFRA]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Arbitragem da dimensão UX (seção 7 de `docs/roadmap-v2/28-execucao-e-validacao.md`, "Conflito entre validadores"). O validador de UX deu PASS (`ux.md`) e anotou, sem reprovar, que no modo de demonstração a tela da senha nova responde "Tente de novo em instantes", que não resolve. A disputa é se isso é defeito da etapa pela seção 0 de `docs/roadmap-v2/19-definicao-de-pronto.md` ("Texto bem escrito: ... mensagem de erro que diz o que fazer"; "Estados vazios e de erro desenhados"; "defeito visual é defeito da etapa").

Escopo da etapa usado na decisão (pacote `V2-F00-E10.md`): "`RecuperarSenha.tsx` cobre pedido (resposta neutra ...), link inválido, vencido e já usado (frase que manda pedir outro), senhas diferentes, senha curta e sucesso; com a recuperação desligada, a tela manda procurar quem administra e aponta o botão da E09; ao ler o token, remove-o da barra de endereço"; "Compatibilidade: a produção segue com a tela mandando procurar quem administra". O bloco não menciona o modo de demonstração (local). Os Fatos do implementador listam "modo de demonstração" entre os estados do PEDIDO e não entre os da senha nova. A produção do painel é o modo com API (`dc360/vercel.json`: `VITE_API_URL` fixo no build).

| Item em disputa | Reproduzido | No escopo da etapa | Viola a seção 0 | Decisão |
| --- | --- | --- | --- | --- |
| 1. Modo de demonstração: senha nova responde "Tente de novo em instantes" | sim | não: modo não prometido pela etapa, e o estado só se alcança digitando um endereço com token inventado | não decide a etapa | anotado, não reprova |

Item do "Motivo do veredito" da rodada 4 que toca a dimensão: o FAIL foi a corrida da redefinição pelo link contra a troca em voo (QA), não visível em tela; esta arbitragem não o reexaminou (fora da disputa).

## Evidência

Diretório de trabalho: `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/A01-arbitragem-ux/` (abaixo, `W/`).

- Painel do SHA construído em modo local (`vite build` sem `VITE_API_URL`, código 0, `W/saidas/build-local.txt`; árvore de `dc360/` idêntica a `4ce0433`), servido em `localhost:4992`, Chromium do Playwright.
- `node W/item4.mjs`, código 0, saída `W/saidas/item4.txt`.
- Capturas em `docs/evidencias-v2/G00/V2-F00-E10/validacao/4ce0433/capturas/` (abaixo, `capturas/`): `arb-definir-modo-demonstracao-sem-token-390-claro.png`, `arb-definir-modo-demonstracao-formulario-390-claro.png`, `arb-definir-modo-demonstracao-enviou-390-claro.png`, `arb-definir-modo-demonstracao-enviou-1280-escuro.png`, `arb-definir-modo-demonstracao-enviou-320-claro.png`.
- Leitura de código: `dc360/apps/web/src/dados/local.ts:441` (`redefinirSenha` lança "A recuperação de senha exige a API. Este painel está em modo local."), `:437` (`situacaoDaRecuperacao` devolve `{ ativa: false }`), `paginas/recuperar-regras.ts:107` (`novaFalhou`: "Não foi possível redefinir a senha agora. Tente de novo em instantes."), `paginas/RecuperarSenha.tsx` (o estado `local` existe só em `FaseDoPedido`), `dc360/vercel.json`.

## Cenários positivos

- `/recuperar-senha` no modo de demonstração: aviso "A recuperação de senha exige o servidor. Este painel está em modo de demonstração, sem email nem contas." e botão desabilitado (`saidas/item4.txt`).
- `/redefinir-senha` sem token no modo de demonstração: "Link incompleto. Este endereço não traz um link de redefinição..." com "Pedir um novo link", que leva à explicação acima (`capturas/arb-definir-modo-demonstracao-sem-token-390-claro.png`).
- O token some da barra de endereço também no modo local (URL depois de abrir: `/redefinir-senha`).

## Cenários negativos

- `/redefinir-senha?token=qualquer-coisa-digitada` no modo de demonstração, senha nova válida nas duas caixas, "Definir nova senha": "Não foi possível redefinir a senha agora. Tente de novo em instantes."; a segunda tentativa dá o mesmo (`saidas/item4.txt`, `capturas/arb-definir-modo-demonstracao-enviou-390-claro.png`, `-1280-escuro`, `-320-claro`). Reproduzido.

## Tentativas de reprovar

- Procurei caminho pela interface até o estado: não há. No modo de demonstração a entrada não tem "Esqueceu a senha?" (único link: `/quero-conhecer`), o pedido não envia nada (botão desabilitado) e nenhum link de redefinição nasce; só se chega ao formulário com token digitando o endereço com um token inventado.
- Procurei se o modo de demonstração é estado prometido da senha nova: o bloco da etapa não fala em modo local; a etapa promete a recuperação desligada da produção, que no modo com API é desenhada (o 503 da senha nova leva à orientação de procurar quem administra, conferida pelo validador de UX). A produção do painel é o modo com API.
- Procurei texto mal escrito na frase: está em português correto; o defeito é a frase escolhida para esse erro, que manda tentar de novo algo que nunca vai funcionar.
- Procurei corte, sobreposição ou quebra no meio da palavra nas três larguras e nos dois temas desse estado: nenhum à vista nas capturas.

## Achados

1. anotado (item da disputa: reproduzido, fora do escopo, não decide a etapa). No modo de demonstração, a tela da senha nova aceita o formulário e responde "Tente de novo em instantes", em vez de explicar, como o pedido explica, que a recuperação exige o servidor. Não reprova porque (a) o modo de demonstração não é estado prometido pelo bloco da etapa para a senha nova, (b) o estado não é alcançável pela interface, só digitando um endereço com token inventado num modo em que nenhum link existe, e (c) a produção é o modo com API, onde a recuperação desligada está desenhada. Conserto simples, que vale fazer para coerência com o pedido: tratar o erro do modo local (ou `situacaoDaRecuperacao().ativa === false`) na senha nova com a mesma frase do pedido (`FRASES.pedidoLocal`).

## Não verificado

- Os demais critérios do relatório `ux.md` (estados do pedido e da senha nova no modo com API, resposta neutra, link morto pela redefinição, alvo de toque) não foram refeitos: a arbitragem decide só o item em disputa; não copio a conclusão deles.
- `Referrer-Policy` e `X-Robots-Tag` na Vercel; 768 px, zoom de 200 por cento, leitor de tela, Firefox e WebKit.

## Risco residual

Baixo. O estado só aparece a quem fabrica um endereço no painel de demonstração; a frase não engana ninguém que chegou pelo caminho normal.

## Motivo do humano

A etapa tem validação humana própria (Rafael faz o fluxo com o notificador de arquivo e confere que a produção continua desligada) e o gatilho de tela pública (`28`, seção 10). Esta arbitragem não a substitui. Se o Rafael quiser o modo de demonstração coerente também na senha nova, a captura é `capturas/arb-definir-modo-demonstracao-enviou-390-claro.png`.
