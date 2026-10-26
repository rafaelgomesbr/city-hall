---
validador: ux
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
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

Montagem (minha, no scratchpad `val-ux/`): API do SHA na porta 3797 (PGlite semeado), painel construído do SHA com `VITE_API_URL` em pasta do scratchpad e servido por `vite preview` na 4797, console do fornecedor do SHA (`apps/console`, PGlite, dona provisionada por `provisionar-operador.ts` só para esta prova, com chave e segredos efêmeros guardados em pasta do scratchpad e apagados no fim) na 3847. Playwright 1.62.1, Chromium, Firefox e WebKit. A árvore de `dc360/` em HEAD `55209ab` é idêntica à de `fd17ff4`. Capturas em `capturas/` desta pasta (prefixo `ux-E05-`, motor no nome); saídas em `SCRATCH/val-ux/saidas/`.

Por que não herdada: o diff `1ed0b71..fd17ff4` toca `Entrar.tsx` (o foco da senha provisória) e a guarda de códigos de erro do console. Conferi as frases da etapa por fluxo REAL (sem interceptar resposta) no SHA atual:

| Critério | Resultado | Prova |
| --- | --- | --- |
| `nao_autenticado`: leitura com os dois tokens inválidos leva à entrada com "Sua sessão expirou. Entre de novo para continuar de onde estava. Nada do que já tinha sido gravado se perdeu." | OK nos três motores, 1280, 390 e 320, dois temas; aviso de alerta com ícone e texto | `ux-E05-entrada-expirou-{1280,390,320}-{claro,escuro}-{chromium,firefox,webkit}.png` (18) |
| `sessao_encerrada`: a administradora encerra as sessões do Jonas; a próxima escrita dele leva à entrada com "Sua sessão foi encerrada. Entre de novo para continuar de onde estava. Isso acontece quando o acesso é encerrado em outro aparelho, por quem administra o sistema, ou quando o seu cadastro muda. Nada do que já tinha sido gravado se perdeu." | OK nos três motores (encerrar 200; via escrita "Trocar senha") | `ux-E05-entrada-encerrada-*` (18) |
| `conta_desativada`: o Diego é desativado, o token de acesso vence, a renovação responde 403 e a entrada diz "Sua conta foi desativada. Entrar de novo não resolve: procure a coordenação do seu município. Nada do que você já registrou se perdeu." | OK nos três motores; tom de perigo com ícone e texto | `ux-E05-entrada-desativada-*` (18) |
| A entrada continua genérica para conta desativada | OK: "Email ou senha inválidos.", igual à senha errada, nos três motores | `ux-E05-entrada-desativada-tenta-entrar-*` (18) |
| Console (regressão da guarda): recusa da entrada e sessão que termina com 401 real do servidor | OK em Chromium e Firefox, 1280, 390 e 320, dois temas: "Email ou senha incorretos." e, com um token que o servidor não reconhece, a porta volta com "A sessão terminou. Entre de novo." | `ux-E05-console-recusa-*`, `ux-E05-console-sessao-terminou-*`, `saidas/e05-console-{chromium,firefox}.txt` |

Portão visual (seção 0 de `19`), item a item, sobre 78 telas do painel e 24 do console:

| Item | Resultado |
| --- | --- |
| Alinhamento | OK: aviso e cartão com a mesma largura e o mesmo eixo nos três tamanhos (`ux-E05-entrada-encerrada-320-escuro-webkit.png`) |
| Espaçamento | OK: respiro igual entre aviso, cartão e rodapé nos três motivos |
| Nada fora do lugar | OK medido em todas as telas: sem rolagem horizontal, nada fora da janela, nada cortado, nenhuma palavra quebrada no meio (`saidas/e05-{chromium,firefox,webkit}.txt`); a frase mais longa (encerrada) ocupa 10 linhas a 320 px dentro da caixa |
| Hierarquia | OK: primeira frase em negrito, resto em peso normal |
| Texto | OK: português correto, sem travessão; cada frase diz o que fazer |
| Responsivo e zoom | OK a 1280, 390, 320 e a 640x450 (1280 com zoom de 200 por cento), nos três motores (`ux-E05-entrada-desativada-zoom200-claro-*`) |
| Temas, contraste, estado não só por cor | OK: dois temas no painel; alerta e perigo sempre com ícone e texto |
| Estados de erro | São o objeto da etapa, desenhados com a mesma qualidade do formulário |

Heurísticas: correspondência com o mundo real (causa e ação em cada frase), prevenção de erro ("Entrar de novo não resolve"), consistência (mesmo componente de aviso nos três motivos).

## Evidência

- `MOTOR=<motor> node SCRATCH/val-ux/e05.mjs`, código 0 em Chromium, Firefox e WebKit: 26 capturas por motor (`saidas/e05-{chromium,firefox,webkit}.txt` e `-run.txt`). Os 66 "Failed to load resource" 401 e 403 em Chromium e WebKit são os provocados de propósito; nenhum `pageerror`; Firefox zero.
- `MOTOR=<motor> node SCRATCH/val-ux/e05-console.mjs`, código 0 em Chromium e Firefox (12 capturas cada; zero erro de página). No WebKit o roteiro parou (código 1, `saidas/e05-console-webkit-run.txt`): ver Não verificado.
- Sonda do tema do console (`tema-console.mjs`, `tema-ff.mjs`): em Chromium o console segue a preferência escura (`data-theme=dark`, fundo `rgb(16, 21, 25)`).

## Cenários positivos

1. Sessão expirada, encerrada e conta desativada levam cada uma à frase própria, nos três motores, três tamanhos, dois temas e no zoom de 200 por cento.
2. Console: recusa e fim de sessão com a frase do contrato do console.

## Cenários negativos

1. Conta desativada tentando entrar: recusa genérica igual à de senha errada (não revela o estado da conta).
2. Token de acesso adulterado com renovação inexistente: "expirou".
3. Encerrada por quem administra e a pessoa volta depois de o token vencer: "expirou" (o caso já anotado na rodada 4; a renovação morta não distingue), nos três motores.

## Tentativas de reprovar

- WebKit nas três frases (não rodado na rodada 6): mesmas frases, mesma geometria.
- 320 px e tema escuro com a frase mais longa: dentro da caixa, sem corte.
- Zoom de 200 por cento nos três motores.
- Procurei regressão do diff no que a tela de entrada mostra: o diff de `Entrar.tsx` só troca o foco do passo da senha provisória (coberto na E09); as três frases e a recusa genérica estão iguais às da rodada 6.
- Console: refiz com o 401 real do servidor em 320 px também; frase igual e dentro da caixa.

## Achados

1. **anotado.** Depois da recusa genérica da entrada, o foco fica em BODY nos três motores (`saidas/e05-*.txt`, "desativada tenta entrar ... foco=BODY"); igual à rodada 6, fora do escopo desta etapa (a recusa da entrada não mudou). Fica para a acessibilidade.
2. **anotado.** Na mesma tela, a faixa "Sua conta foi desativada..." continua no alto enquanto o campo mostra "Email ou senha inválidos." (`ux-E05-entrada-desativada-tenta-entrar-390-claro-firefox.png`); as duas frases não se contradizem no que mandam fazer, mas a segunda sugere erro de digitação. Registro para Rafael na leitura das frases.
3. **anotado.** O painel diz "Email ou senha inválidos." e o console "Email ou senha incorretos.": duas redações para a mesma recusa em produtos irmãos.
4. **anotado.** A 390 px o título da entrada quebra deixando "360" sozinho na segunda linha ("Defesa Civil Operacional / 360"); anterior a esta etapa.

## Não verificado

- Console no WebKit: o console manda `upgrade-insecure-requests` e HSTS, e o WebKit leva o envio do formulário em `http://127.0.0.1:3847` para `https`, que não existe localmente ("A TLS error caused the secure connection to fail", `saidas/e05-console-webkit-run.txt`, sonda `e05-console-webkit-debug.mjs`). É do ambiente local sem TLS, não do produto em produção (servido em https); não medi o console no WebKit.
- Tema escuro do console no Firefox: a emulação de `prefers-color-scheme` do Playwright não chega à página do console no Firefox (na mesma sessão chega a outras páginas; o console tem COOP `same-origin`), então as capturas `ux-E05-console-*-escuro-firefox.png` saíram no tema claro. O tema escuro do console foi conferido no Chromium.
- Leitor de tela e aparelho real.

## Risco residual

Baixo: as três frases são claras, distintas e estão no lugar nos três motores. O resíduo é o foco em BODY depois da recusa da entrada (anterior) e duas frases na mesma tela depois de uma conta desativada tentar entrar.

## Motivo do humano

A validação humana da etapa é do Rafael: ler as três frases e aprovar (mensagem é conteúdo de produto). Capturas para ele: `ux-E05-entrada-expirou-390-claro-chromium.png`, `ux-E05-entrada-encerrada-390-claro-chromium.png`, `ux-E05-entrada-desativada-390-escuro-webkit.png`, `ux-E05-entrada-desativada-tenta-entrar-390-claro-firefox.png`.
