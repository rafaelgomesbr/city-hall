---
validador: ux
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Montagem: API do SHA (árvore de `dc360/` idêntica a `1ed0b71`) na porta 3791, PGlite semeado; painel construído do SHA com `VITE_API_URL`, servido por `vite preview` na 4791; console do fornecedor do SHA (`apps/console`, PGlite, dona provisionada por `provisionar-operador.ts` só para esta prova, segredos efêmeros apagados no fim) na 3844. Chromium do Playwright. Capturas em `capturas/` desta pasta (prefixo `ux-E05-`); saídas em `SCRATCH/validadores/ux/saidas/`.

O que a etapa põe na tela: as três frases da entrada (sessão expirou, encerrada, conta desativada) e a recusa genérica da entrada para conta desativada. Todas obtidas por fluxo REAL, sem interceptar resposta:

| Critério | Resultado | Prova |
| --- | --- | --- |
| "Renove o token" (`nao_autenticado`): leitura com os dois tokens inválidos leva à entrada com "Sua sessão expirou. Entre de novo para continuar de onde estava. Nada do que já tinha sido gravado se perdeu." | OK, aviso de alerta com ícone e texto | `ux-E05-entrada-expirou-{1280,390,320}-{claro,escuro}.png` |
| "Entre de novo" (`sessao_encerrada`): quem administra encerra as sessões do Jonas pelo endpoint; a próxima escrita dele (trocar senha) leva à entrada com "Sua sessão foi encerrada. ..." | OK | `ux-E05-entrada-encerrada-*` |
| "Pare e avise" (`conta_desativada`): a administradora desativa o Diego pelo endpoint; o token de acesso dele vence (assinatura adulterada); a renovação responde 403 e a tela diz "Sua conta foi desativada. Entrar de novo não resolve: procure a coordenação do seu município. Nada do que você já registrou se perdeu." | OK, tom de perigo com ícone e texto | `ux-E05-entrada-desativada-*` |
| Entrada continua genérica para conta desativada | OK: "Email ou senha inválidos." | `ux-E05-entrada-desativada-tenta-entrar-*` |
| Console (regressão): recusa da entrada e sessão que termina | OK: "Email ou senha incorretos."; com um 401 real do servidor (token que ele não reconhece) a porta volta com "A sessão terminou. Entre de novo." | `ux-E05-console-recusa-{1280,390}-{claro,escuro}.png`, `ux-E05-console-sessao-terminou-*`, `saidas/e05-console.txt` |

Portão visual, item a item (26 capturas do painel e 8 do console):

| Item | Resultado |
| --- | --- |
| Alinhamento | OK: aviso e cartão com a mesma largura e o mesmo eixo nos três tamanhos (`ux-E05-entrada-desativada-1280-escuro.png`) |
| Espaçamento | OK: respiro entre aviso, cartão e rodapé igual nos três motivos |
| Nada fora do lugar | OK medido: sem rolagem horizontal, nada fora da janela, nada cortado, nenhuma palavra quebrada no meio, nas 26 telas (`saidas/e05.txt`); a frase mais longa (encerrada) ocupa 9 linhas a 320 px dentro da caixa (`ux-E05-entrada-encerrada-320-claro.png`) |
| Hierarquia | OK: a primeira frase em negrito, o resto em peso normal |
| Texto | OK: português correto, sem travessão; cada frase diz o que fazer |
| Responsivo e zoom | OK a 1280, 390, 320 px e a 640x450 (equivalente a 1280 px com zoom de 200 por cento), sem perda (`ux-E05-entrada-desativada-zoom200-claro.png`) |
| Temas, contraste, estado não só por cor | OK: dois temas; alerta (amarelo) e perigo (vermelho) sempre com ícone e texto |
| Estados de erro | São o próprio objeto da etapa; desenhados com a mesma qualidade do formulário |

Heurísticas: correspondência com o mundo real (cada frase diz a causa e a ação); prevenção de erro ("Entrar de novo não resolve" evita a tentativa inútil); consistência (mesmo componente de aviso nos três motivos).

## Evidência

- `node SCRATCH/validadores/ux/e05.mjs` (código 0), saída `saidas/e05.txt` e `saidas/e05-run.txt`: 26 capturas do painel.
- `node SCRATCH/validadores/ux/e05-console.mjs` (código 0), saída `saidas/e05-console.txt`, 8 capturas do console; zero erro de página.
- Os 401 e 403 no console do navegador durante o roteiro são os provocados de propósito (66 linhas "Failed to load resource" com 401 ou 403); nenhum `pageerror`.

## Cenários positivos

1. Sessão expirada, encerrada e conta desativada levam cada uma à frase própria, nos três tamanhos e dois temas.
2. Console: recusa e fim de sessão com a frase do contrato do console.

## Cenários negativos

1. Conta desativada tentando entrar: recusa genérica igual à de senha errada.
2. Token de acesso adulterado com renovação inexistente: "expirou", sem derrubar nada além da própria sessão.

## Tentativas de reprovar

- Largura mínima (320 px) com a frase mais longa: cabe, sem corte.
- Zoom de 200 por cento (640x450): cabe, sem rolagem horizontal.
- Tema escuro: contraste do tom de perigo e de alerta lido nas capturas, legível.
- Caso anotado na rodada 4 (encerrada por quem administra e a pessoa volta depois de o token vencer): continua mostrando "Sua sessão expirou" (`ux-E05-entrada-encerrada-token-vencido-1280-claro.png`), anotação 1.
- Desativada que tenta entrar logo depois: o aviso de "conta desativada" continua na tela junto da recusa genérica (anotação 2).
- Foco depois da recusa da entrada (anotação 3).

## Achados

1. **anotado** (mantido da rodada 4). Sessão encerrada por quem administra e retomada depois de o token de acesso vencer mostra "Sua sessão expirou" em vez de "foi encerrada": a renovação devolve 401 `sessao_encerrada`, mas `http.ts` decide o motivo pela resposta original (401 `nao_autenticado`). As duas frases mandam entrar de novo; nada se perde. Captura `ux-E05-entrada-encerrada-token-vencido-1280-claro.png`.
2. **anotado.** Depois do aviso de conta desativada, uma tentativa de entrada recusada mostra o aviso antigo e "Email ou senha inválidos." ao mesmo tempo (`ux-E05-entrada-desativada-tenta-entrar-390-claro.png`). Para a própria pessoa é coerente; se outra pessoa usar o mesmo navegador, lê "Sua conta foi desativada" sobre a conta dela. O aviso some ao entrar com sucesso.
3. **corrige antes de crescer.** Depois da recusa da entrada o foco vai para BODY (o botão fica desabilitado enquanto envia), em Chromium; a frase tem `role="alert"`. Comportamento anterior à etapa e do mesmo tipo que a E09 consertou nas telas de senha.

## Não verificado

- O app de campo (sem emulador nem aparelho): a frase do aparelho para `conta_desativada` não foi vista.
- Firefox e WebKit nestas telas; leitor de tela.
- No console, a guarda em modo "corrigir" com código fora do catálogo (exigiria mutar o código; é prova das dimensões de QA e segurança).

## Risco residual

Baixo para a experiência: as três frases aparecem certas nos caminhos reais; a confusão "expirou" em lugar de "encerrada" depois do vencimento não leva a ação errada.

## Motivo do humano

A validação humana da etapa é do Rafael: ler as três frases e aprovar (conteúdo de produto; portão visual com Rafael obrigatório). Capturas: `ux-E05-entrada-expirou-390-claro.png`, `ux-E05-entrada-encerrada-390-claro.png`, `ux-E05-entrada-desativada-390-claro.png`.
