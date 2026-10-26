---
validador: ux
modelo: claude-opus-5-5
etapa: V2-F00-E13
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [UI, A11Y, AUTH]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Montagem (minha, no scratchpad `val-ux/`): API do SHA na porta 3797 (PGlite semeado), painel construído do SHA com `VITE_API_URL` e servido por `vite preview` na 4797. Playwright 1.62.1, Chromium, Firefox e WebKit. A árvore de `dc360/` em HEAD `55209ab` é idêntica à de `fd17ff4`. Capturas em `capturas/` desta pasta (prefixo `ux-E13-`, motor no nome); saídas em `SCRATCH/val-ux/saidas/`.

Superfícies da etapa: a entrada que parte de `/` e as confirmações (`<Toast>`) de gravar e de corrigir em Usuários, Equipes e Órgãos, com a posição do aviso em relação à barra do pé e o fundo no tema escuro. Não herdada porque o diff `1ed0b71..fd17ff4` toca `app.css` (o `scroll-padding-top` e o `scroll-margin-top` do bloco de até 600 px) e `Usuarios.tsx` (as janelas). Procurei a regressão nessas telas:

| Critério | Prova | Resultado |
| --- | --- | --- |
| Entrar a partir de `/` leva à tela do papel | quatro papéis, sem sessão `/` leva a `/entrar`; depois de entrar: coordenadora, operador e administradora em `/painel` ("Painel operacional"), agente em `/meu-trabalho` ("Meu trabalho"); zero "Esta página não existe"; a 1280 claro, 390 escuro e 320 claro, nos três motores (36 de 36) (`saidas/e13-{chromium,firefox,webkit}.txt`; `ux-E13-entrada-pela-raiz-*`, 36) | PASS |
| Confirmação de gravar e de corrigir nas três telas, com `role=status` | as seis frases ("Usuário cadastrado. Ele já aparece na lista abaixo.", "Cadastro corrigido. A lista abaixo já mostra o que mudou.", "Equipe criada. Ela já aparece na lista abaixo.", "Equipe corrigida. ...", "Órgão cadastrado. Ele já aparece na lista abaixo.", "Órgão corrigido. ...") com `role="status"` e `aria-live="polite"` em 142 de 144 medições (1280, 768, 390, 320; dois temas; três motores). As 2 que faltam são a correção de equipe a 1280 claro em Firefox e WebKit, recusada com "Já existe uma equipe com esse nome neste município." porque o meu roteiro repetiu um nome de uma execução anterior que tinha parado (erro de dado de teste meu, e o estado de erro está bem desenhado: `ux-E13-equipes-correcao-1280-claro-webkit.png`) | PASS |
| O aviso não cai em cima da barra do pé | folga de 15 px até a barra em todas as 108 medições de 768, 390 e 320 px; dentro da janela em 142 de 142 | PASS |
| "Fechar" do aviso com 44 px | 64x44 em 142 de 142 | PASS |
| Fundo do aviso no tema escuro não deixa o texto da página atravessar | a camada de cor do aviso no escuro é `rgba(105, 219, 124, 0.12)` sobre o fundo do próprio aviso; nas capturas o campo e o texto atrás não aparecem através dele (`ux-E13-usuarios-correcao-320-escuro-chromium.png`) | PASS |
| Nada cortado, grudado ou fora do lugar | `geometria()` em todas as telas: sem rolagem horizontal, nada fora da janela; em Usuários a 1280 px a tabela quebra dentro de emails sem nenhum ponto na parte local (anotado 1) | PASS, com o anotado 1 |
| Zero erro de console | zero em Chromium e Firefox; no WebKit só o 409 da recusa de nome repetido do meu roteiro | PASS |
| Rafael aprova as seis frases e entra pelo domínio | pendente | humano |

Portão visual (seção 0 de `19`), item a item:

| Item | Resultado |
| --- | --- |
| Alinhamento | OK: o aviso ocupa a largura útil (16 a 374 a 390 px, 332 a 752 a 768, 844 a 1264 a 1280) |
| Espaçamento | OK: 15 px até a barra do pé no celular e no tablet |
| Nada fora do lugar | OK, com o anotado 1 |
| Hierarquia | OK |
| Texto | OK: seis frases no mesmo molde, português correto, sem travessão |
| Responsivo | OK a 1280, 768, 390 e 320 |
| Dois temas, foco, estado não só por cor | OK: confirmação com ícone e texto nos dois temas |
| Estados de erro | O nome repetido mostra uma frase que diz o que houve, no alto da tela (`ux-E13-equipes-correcao-1280-claro-webkit.png`; a recusa da sigla repetida da primeira execução no Firefox, "Já existe um órgão com esse nome ou essa sigla neste município. Use o que já está cadastrado, senão os relatórios contam o mesmo destino duas vezes.", foi vista antes de a captura ser sobrescrita pela segunda execução) |

Heurísticas: visibilidade do estado (gravar diz que gravou e onde ver), controle ("Fechar" de 44 px), consistência (mesmo molde nas seis frases), prevenção de erro (entrar pela raiz não termina em página de erro).

## Evidência

- `MOTOR=<motor> node SCRATCH/val-ux/e13.mjs`: Chromium código 0 na primeira execução; Firefox e WebKit pararam na primeira (código 1, a sigla do órgão de teste que eu reutilizei entre motores, recusada pelo servidor) e passaram na segunda com a sigla corrigida (código 0) (`saidas/e13-{chromium,firefox,webkit}.txt` e `-run.txt`). 60 capturas por motor.

## Cenários positivos

1. Os quatro papéis entram por `/` e chegam à tela do papel nos três motores.
2. Gravar e corrigir em Usuários, Equipes e Órgãos mostram a confirmação certa, com `role=status`, acima da barra do pé.

## Cenários negativos

1. Nome e sigla repetidos (provocados sem querer pelo meu roteiro): recusa com frase clara, no alto da página, sem aviso de sucesso.

## Tentativas de reprovar

- WebKit (não rodado na rodada 6) em todas as telas da etapa.
- 320 px no tema escuro com a frase mais longa ("Cadastro corrigido. A lista abaixo já mostra o que mudou."): quatro linhas dentro do aviso, sem cobrir a barra.
- Procurei regressão do `scroll-padding-top` novo no aviso: o aviso é fixo em relação à janela e não depende de rolagem; a folga até a barra é a mesma da rodada 6 (15 px).

## Achados

1. **anotado.** Na tabela de Usuários, emails cuja parte local não tem nenhum ponto ("joanaplantao24horasdefesacivilmunicipal...", criado pelo e2e, e o meu "plantaocoordenacaodefesacivilserraalta@...") quebram dentro da parte local a 1280 px; não há ponto onde quebrar. Igual à rodada 6, registrado pelo implementador.
2. **anotado.** Nenhum outro desta etapa. O encobrimento do campo focado pelo topo e pela barra do pé, visto nesta rodada, é da E09 (achados 1 e 2 dela) e não toca as confirmações.

## Não verificado

- O Tab que traz cada item da barra inteiro para a tela (medido na rodada 6; não refeito, porque `app.css` desta rodada não mexe na barra).
- A regressão do aviso que espera a janela fechar (correção 4 da E09), não refeita nesta rodada.
- Leitor de tela e aparelho real.

## Risco residual

Baixo: as confirmações aparecem certas nos três motores e nas quatro larguras, e entrar pela raiz não leva mais a página de erro.

## Motivo do humano

A validação humana da etapa é do Rafael: digitar só o domínio, entrar e chegar à tela do papel; aprovar as seis frases. Capturas para ele: `ux-E13-entrada-pela-raiz-agente-390-escuro-webkit.png`, `ux-E13-usuarios-confirmacao-390-claro-firefox.png`, `ux-E13-orgaos-correcao-320-escuro-chromium.png`.
