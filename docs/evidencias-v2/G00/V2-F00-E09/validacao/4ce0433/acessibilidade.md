---
validador: acessibilidade
modelo: claude-opus-5-5
etapa: V2-F00-E09
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---

Pasta de trabalho deste validador (fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L07-acessibilidade/` (abaixo, `saidas/` e `sondas/`). API real (PGlite semeado) na 3777 e painel construído na pasta de trabalho, servido na 4777; axe-core 4.10.2 instalado só na pasta de trabalho, regras WCAG 2.0 e 2.1 A e AA. Produto de `4ce0433` (o painel não mudou desde `bb0f654`, só `busca/pontuador.ts`; a correção 3 da E09 é de API).

## Critérios verificados

Linha "Acessibilidade" da etapa: "confirmação anunciada por `role=status`, foco devolvido ao botão, ícone mais texto". Mais o que a etapa entrega na tela: `BotaoRedefinirSenha` e `BotaoEncerrarSessoes` atrás de `ConfirmarAcao` com o nome da pessoa, `SenhaTemporaria` (senha uma vez, botão de copiar, frase de que não volta), Toast ao encerrar, `MinhasOutrasSessoes` com a frase de que esta sessão continua aberta. Tudo navegado SÓ pelo teclado, contra a API real.

| Item WCAG 2.1 AA | Resultado | Prova |
| --- | --- | --- |
| 2.1.1 e 2.4.3 chegar aos botões da linha pelo Tab | OK | "Redefinir senha" de Diego em 26 Tabs; "Encerrar sessões" de Jonas em 9 (`saidas/12`) |
| 2.4.7 anel de foco nos botões e na confirmação focada | OK | `saidas/12`; `a11y-minha-conta-confirmacao-focada-1280-claro.png` e `-escuro.png` |
| 4.1.2 janela: `role="dialog"`, `aria-modal`, título e descrição ligados | OK | `saidas/12` (`aria-labelledby` "Redefinir senha", `aria-describedby` com a consequência) |
| 2.4.3 foco inicial em Cancelar, Tab preso na janela, fundo `inert` | OK | `saidas/12`, `saidas/13` (Firefox) |
| 2.4.3 Escape fecha e o foco volta ao botão da linha certa | OK | "Redefinir senha" da linha de Diego |
| 2.4.3 senha temporária: foco dentro da janela; "Já anotei a senha" devolve o foco ao "Redefinir senha" de Diego | OK | `saidas/12`, `saidas/13` |
| 4.1.3 "Senha copiada." em região `role="status"` que existe vazia antes | OK | `saidas/12`; `a11y-senha-temporaria-copiada-1280-escuro.png` |
| 4.1.3 encerrar sessões confirmado por Toast `role="status"` `aria-live="polite"` com ícone e frase; foco volta ao "Encerrar sessões" de Jonas | OK | `saidas/12`; `a11y-usuarios-toast-encerradas-1280-escuro.png` |
| 4.1.3 contagem de sessões na pergunta em `role="status"` | OK | "Jonas Ferreira tem 1 sessão aberta..." |
| 1.4.1 selo "Esta sessão" com ícone e texto | OK | `saidas/12` |
| 2.4.3 Minha conta: depois de encerrar as outras, foco na confirmação (`tabindex=-1`, sem `role`, sem região viva em volta) | OK | `saidas/12`, `saidas/13`, `saidas/21` seção 7 |
| 1.4.3 contraste, claro e escuro | OK | axe sem violação na lista, nas três janelas, na senha temporária, no Toast e em Minha conta, nos dois temas; nós "incompletos" por sobreposição medidos à mão: 5,53:1 (claro) e 7,06:1 (escuro) (`saidas/23`) |
| 1.4.10 e alvo de 44 px | OK | Minha conta a 320 px sem rolagem horizontal e sem controle abaixo de 44 px; Usuários a 390 px com os botões das linhas em 44 px e só a tabela rolando (`saidas/12`; `a11y-minha-conta-320-escuro.png`) |
| 2.4.3 caminho de erro da confirmação | FALHA no Chromium, não decide a etapa | ver Achados (`saidas/14`) |

## Evidência

- `npx vitest run` em `apps/web`: 669 de 669, código 0 (`saidas/01`); recorte de 11 arquivos com `sessoes-e-senha-temporaria.test.ts`, `minha-conta-estreita.test.ts`, `modal.test.ts`, `foco.test.ts`, `toast.test.ts`, `acessibilidade.test.ts`: 209 de 209 (`saidas/02`).
- `node sondas/sonda-e09.mjs`: Chromium 44 de 44, código 0 (`saidas/12-sonda-e09-chromium.txt`); Firefox 44 de 44, código 0 (`saidas/13-sonda-e09-firefox.txt`).
- `node sondas/sonda-e09-erros.mjs` (500 e rede caída nas duas janelas e em Minha conta): Chromium 9 aprovadas e 9 falhas, Firefox 18 de 18 (`saidas/14-sonda-e09-erros-chromium.txt`, `saidas/14-sonda-e09-erros-firefox.txt`).
- E2E do repositório contra par recém-semeado: `test/fluxo-api.e2e.mjs` Chromium 288 de 288, zero erro de console, código 0 (`saidas/20`; seção 26: "cancelar fecha a janela e devolve o foco ao botao que a abriu", "o foco comeca em Cancelar", "o foco volta ao botao da linha", "o aviso e anunciado como status"); `test/layout-estreito.e2e.mjs` Chromium 64 de 64, código 0 (`saidas/21`; seções 5 a 7, Minha conta e Usuários a 320, 390 e 768 px e o foco depois de encerrar).
- Capturas desta rodada (`capturas/`): `a11y-janela-redefinir-1280-escuro.png` (olhada: anel de foco em Cancelar, botão destrutivo com o nome completo, fundo escurecido), `a11y-senha-temporaria-copiada-1280-escuro.png`, `a11y-usuarios-toast-encerradas-1280-escuro.png`, `a11y-minha-conta-confirmacao-focada-1280-claro.png`, `a11y-minha-conta-confirmacao-focada-1280-escuro.png`, `a11y-minha-conta-320-escuro.png`, `a11y-janela-erro-foco-redefinir-1280-escuro.png` e `a11y-janela-erro-foco-encerrar-1280-escuro.png` (o erro dentro da janela sem anel de foco em nenhum controle).

## Cenários positivos

- Administradora redefine a senha de Diego só pelo teclado: Tab até o botão, Enter, Tab até "Redefinir a senha de Diego Nakamura Alves", Enter; a senha temporária abre com o foco em "Copiar senha"; Enter copia e a região de estado diz "Senha copiada." com ícone; "Já anotei a senha" fecha e o foco volta ao botão da linha de Diego.
- Encerrar sessões de Jonas: a pergunta lê a contagem em `role="status"`; confirmar mostra o Toast `role="status"` e o foco volta ao botão da linha de Jonas.
- Minha conta com 5 sessões: "Encerrar as outras 4 sessões" pelo teclado; foco na confirmação "As outras 4 sessões foram encerradas. Esta continua aberta.", com anel, sem região viva duplicada.

## Cenários negativos

- Escape no meio da pergunta: fecha sem agir e devolve o foco ao botão.
- Falha do servidor (500) e rede caída ao confirmar: erro em `role="alert"` dentro da janela, que continua aberta (ver Achados quanto ao foco).
- 320 px e 390 px: nenhum controle abaixo de 44 px, página sem rolagem horizontal.

## Tentativas de reprovar

1. Rodei axe-core (ausente da rodada anterior) em cada estado, nos dois temas: zero violação; os nós que o axe não decidiu por sobreposição do modal foram medidos à mão.
2. Testei se o foco volta para a linha CERTA (e não para o primeiro "Redefinir senha" da tabela) depois de duas janelas encadeadas (pergunta, depois senha temporária): volta à linha de Diego.
3. Testei se o anúncio de "Senha copiada." é de região que já existia (o leitor de tela só anuncia mudança em região existente): a região está no DOM vazia antes da cópia.
4. Forcei o caminho de erro (500 e rede) na confirmação das três janelas, pelo teclado, nos dois motores. Reprovou no Chromium (abaixo).
5. Procurei anúncio duplo na confirmação de Minha conta (foco mais região viva): não há região viva em volta nem dentro do aviso focado.

## Achados

1. **Corrige antes de crescer (WCAG 2.4.3, caminho de erro; não decide a etapa).** No Chromium, quando a confirmação falha (500 ou rede caída) em "Redefinir senha", "Encerrar sessões" e "Encerrar minhas outras sessões", o foco cai em `BODY` e o Escape deixa de fechar a janela (o `onKeyDown` do Modal está no painel, e o foco não está mais nele); o Tab seguinte volta ao "Cancelar" e aí o Escape funciona. Causa: `ConfirmarAcao.tsx:141` e `:149`, `disabled={ocupado}` nos dois botões enquanto grava, e o Chromium tira o foco do botão que vira `disabled`. No Firefox o foco fica no botão (18 de 18). Reprodução: `node sondas/sonda-e09-erros.mjs` (`saidas/14`). A etapa usa o componente compartilhado, anterior à fase; a linha "Acessibilidade" da etapa (confirmação anunciada, foco devolvido ao botão ao fechar, ícone mais texto) está atendida, e por isso não reprova. A rodada 4 viu a queda de foco e não o Escape inoperante. NÃO está registrado em `apps/web/PENDENCIAS.md` nem cabe literalmente no texto da V2-F10-E11 (foco em troca de rota e região anunciante): precisa de registro com dono para não se perder. Conserto provável: `aria-disabled` com guarda contra clique duplo, ou devolver o foco ao painel ou ao Cancelar no `finally`.
2. Anotado: o Toast `role="status"` é montado já com o texto (`Toast.tsx:142`); a própria senha temporária comenta que "a região existe antes do texto, senão o leitor de tela não anuncia a mudança". Se o leitor não anunciar o Toast, o resultado continua visível na tela (Toast fica 6 s, pausa com foco ou ponteiro e tem "Fechar"). Só leitor de tela confirma; dono natural V2-F10-E11 (região anunciante única).
3. Motivo do veredito da rodada 4 (id da própria conta em maiúsculas e troca de senha em voo): não toca acessibilidade. A correção 3 (`f19470f`, `idSchema` em minúsculas) é de API; a tela não regrediu (as sondas e o e2e acima passam no mesmo fluxo).

## Não verificado

- Anúncio real por VoiceOver, NVDA ou TalkBack do Toast, da contagem na pergunta e de "Senha copiada.": só pessoa com leitor de tela.
- Copiar sem permissão de área de transferência no Chromium (a frase de copiar à mão): concedi a permissão; no Firefox a cópia também deu certo, então o ramo de falha não foi exercitado.
- WebKit no teclado (o Tab do WebKit do Playwright no macOS não alcança botões); zoom pela interface do navegador (usei reflow).

## Risco residual

Médio-baixo. Quem usa só teclado no Chromium e recebe um erro ao confirmar fica sem foco dentro da janela e com o Escape mudo até apertar Tab; o erro é anunciado (`role="alert"`) e o Tab devolve o controle. O fluxo de sucesso está correto nos dois motores.

## Motivo do humano

Leitor de tela (VoiceOver no Safari, NVDA no Chrome) para os anúncios do Toast, da contagem e da cópia, e a validação humana da própria etapa (Rafael faz o fluxo no painel e confere a frase da senha única e as confirmações). Limite da seção 4 de `28`.
