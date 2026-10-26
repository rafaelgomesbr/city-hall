---
validador: ux
modelo: claude-opus-5-5
etapa: V2-F00-E11
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
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

Montagem (minha, no scratchpad `val-ux/`): API do SHA na porta 3797 (PGlite semeado), painel construído do SHA com `VITE_API_URL` e servido por `vite preview` na 4797. Playwright 1.62.1, Chromium, Firefox e WebKit. A árvore de `dc360/` em HEAD `55209ab` é idêntica à de `fd17ff4`. Capturas em `capturas/` desta pasta (prefixo `ux-E11-`, motor no nome); saídas em `SCRATCH/val-ux/saidas/`.

Superfície: o cartão "Saída de município" em `/organizacao` e o cliente `baixarPacoteDeSaida`. Nenhum dos dois mudou em `1ed0b71..fd17ff4`; não herdada porque o diff toca `app.css` e páginas do painel. Procurei a regressão no cartão:

| Critério (DoD, cinco campos de teste, portão da seção 0 de `19`) | Prova | Resultado |
| --- | --- | --- |
| O botão baixa o ZIP de verdade contra a API real, em mais de um navegador | Rita (administradora) clica; 24 combinações (1280, 768, 390, 320; dois temas; Chromium, Firefox e WebKit): nome `dc360-pacote-de-saida-2026-10-20.zip`, 330 a 339 mil bytes, assinatura `PK`, `failure()` nulo (`saidas/e11-{chromium,firefox,webkit}.txt`) | PASS |
| "Gerando" e botão desabilitado enquanto gera | pedido segurado 1,5 s: texto "Gerando", `disabled=true`, 118x44, nas 24 combinações (`ux-E11-gerando-*`) | PASS |
| Recusa mostra a frase do servidor sem derrubar a sessão | corpo 403 `sem_permissao` REAL pedido à API com o token da coordenadora e servido ao navegador ("Seu perfil não tem permissão para alterar os dados do município."); `acesso_suspenso` com a frase do catálogo da API ("O acesso deste município ao sistema foi suspenso pelo fornecedor. Procure quem administra o contrato na sua prefeitura."); rede caída ("Sem conexão com o servidor. O arquivo não foi baixado. Verifique o sinal e tente de novo."). As três dentro do cartão, URL continua `/organizacao` (`ux-E11-erro-{sem-permissao,suspenso,rede}-*`, 72) | PASS, com o anotado 1 (texto) |
| Alinhamento e espaçamento | aviso de 41 a 727 px num cartão de 16 a 752 (768), de 41 a 279 num de 16 a 304 (320), de 321 a 890 num de 296 a 915 (1280): mesma margem interna dos dois lados, nos três motores | PASS |
| Nada fora do lugar, cortado ou grudado | `geometria()` nas 120 telas: sem rolagem horizontal, nada fora da janela, nenhum toque abaixo de 44 px, nenhuma palavra quebrada no meio (zero linhas de problema nos três arquivos de saída) | PASS |
| Responsivo 1280, 768, 390, 320 | `ux-E11-normal-{1280,768,390,320}-{claro,escuro}-{chromium,firefox,webkit}.png` | PASS |
| Dois temas | escuro com fundo, aviso de perigo e botão legíveis (`ux-E11-erro-suspenso-320-escuro-webkit.png`) | PASS |
| Toque de 44 px no celular | botão 118x44 a 390 e 320 | PASS |
| Texto em português, sem travessão | frases do cartão e das recusas lidas; sem U+2014 | PASS, com o anotado 1 |
| Rafael baixa o pacote e abre o ZIP | pendente | humano |

Heurísticas de Nielsen no cartão: visibilidade do estado ("Gerando" e desabilitado); mundo real ("pacote de saída", "baixar não apaga nada"); consistência (`Aviso tom="perigo"` igual ao resto do painel); prevenção de erro (só quem administra vê o cartão).

## Evidência

- `MOTOR=<motor> node SCRATCH/val-ux/e11.mjs`, código 0 em Chromium, Firefox e WebKit; 40 capturas por motor; saídas `saidas/e11-{chromium,firefox,webkit}.txt` e `-run.txt`.
- O corpo do 403 foi pedido à API real com o token da coordenadora (`403 {"erro":"sem_permissao",...}`, primeira linha de `saidas/e11-chromium.txt`); o suspenso usa a frase de `MENSAGEM_DE_ACESSO_SUSPENSO` (`apps/api/src/auth/suspensao.ts:134`).
- Erros de console: só os provocados (403 de propósito; no Firefox, o aviso de pedido bloqueado da rede abortada); nenhum `pageerror`.
- Os 24 ZIPs baixados (a base inteira do município de teste) foram apagados do scratchpad logo depois da medição.

## Cenários positivos

1. Administradora baixa o pacote nas quatro larguras, dois temas e três motores; o arquivo é um ZIP com o nome esperado.
2. Durante a geração o botão diz "Gerando" e não aceita segundo clique.

## Cenários negativos

1. Recusa de permissão (corpo real do servidor), município suspenso e queda de rede: a frase aparece dentro do cartão e a sessão continua.

## Tentativas de reprovar

- WebKit (não rodado na rodada 6) com download real.
- 320 px no tema escuro com a frase mais longa (suspenso): dentro do cartão, sem corte.
- Procurei regressão do `app.css` desta rodada no cartão e no fim da página a 320 e 390 px: nada mudou na geometria do cartão.
- Segurei o pedido 1,5 s para pegar o estado intermediário nas 24 combinações: o botão estava `disabled` em todas (não tentei o segundo clique em si).

## Achados

1. **anotado.** Igual à rodada 6: a recusa de permissão diz "alterar os dados do município" quando a pessoa tentou BAIXAR o pacote; a frase é genérica do servidor. Fora do escopo da correção desta rodada.
2. **anotado.** Igual à rodada 6: o nome do arquivo usa a data em UTC (`toISOString`), e depois das 21 h em Brasília sai com o dia seguinte. Não exercitado agora (a medição foi de dia).

## Não verificado

- A abertura do ZIP por uma pessoa e o conteúdo dele (dimensão de QA e LGPD).
- Leitor de tela e aparelho real.
- O 401 que renova durante o download (coberto pelo e2e da etapa, não por esta sonda).

## Risco residual

Baixo: o botão baixa de verdade nos três motores e todos os estados estão desenhados. Resíduo de texto (frase genérica de permissão) e de data em UTC no nome do arquivo.

## Motivo do humano

A validação humana da etapa é do Rafael: baixar o pacote pelo painel com a API local e abrir o ZIP. Capturas para ele: `ux-E11-normal-390-claro-chromium.png`, `ux-E11-gerando-390-escuro-firefox.png`, `ux-E11-erro-suspenso-320-escuro-webkit.png`.
