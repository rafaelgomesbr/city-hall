---
validador: acessibilidade
modelo: claude-opus-5-5
etapa: V2-F00-E10
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---

Pasta de trabalho deste validador (fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L07-acessibilidade/` (abaixo, `saidas/` e `sondas/`). API real (PGlite semeado) na 3777 com `RECUPERACAO_ATIVA=sim` e `NOTIFICADOR_ARQUIVO` apontando para `run/notificacoes.txt`; painel construído na pasta de trabalho e servido na 4777; axe-core 4.10.2 só na pasta de trabalho (WCAG 2.0 e 2.1 A e AA). Os links usados são os que o notificador de teste gravou, não forjados. O painel não mudou desde `bb0f654` (só `busca/pontuador.ts`); a correção 3 da E10 é a migração 051.

## Critérios verificados

O que a etapa entrega na tela (`RecuperarSenha.tsx`): pedido com resposta neutra, link inválido, vencido e já usado ("frase que manda pedir outro"), senhas diferentes, senha curta, sucesso, recuperação desligada; o token sai da barra de endereço. Mais o portão visual da seção 0 de `19`. A etapa não tem linha "Acessibilidade:". Tudo pelo teclado.

| Item WCAG 2.1 AA | Resultado | Prova |
| --- | --- | --- |
| 2.4.3 ordem do Tab no pedido: email, "Enviar link de redefinição", "Voltar para a entrada" | OK | `saidas/15`, `saidas/16` |
| 3.3.1 e 3.3.3 email em branco e torto: foco volta ao campo, `aria-invalid="true"`, erro ligado por `aria-describedby` com a frase do que digitar | OK | `saidas/15` |
| 2.4.3 e 4.1.3 pedido enviado: foco na confirmação (`tabindex=-1`, sem `role`, sem região viva em volta), com anel | OK | `a11y-pedido-enviado-foco-1280-claro.png` e `-escuro.png` |
| 2.4.3 "Pedir de novo" devolve o foco ao campo do email | OK | `saidas/15`, `saidas/16` |
| 3.3.1 senha curta e senhas diferentes: foco no campo certo, `aria-invalid`, erro descrito | OK | `saidas/15` |
| 2.4.3 senha redefinida: foco na confirmação "Senha redefinida. Entre com a nova senha.", uma única ação, sem relógio (3,4 s depois continua na tela) | OK | `a11y-senha-redefinida-foco-1280-claro.png` e `-escuro.png` |
| 2.2.1 tempo ajustável (FAIL da rodada 2) | OK, segue consertado | sem redirecionamento por tempo |
| 4.1.3 e 1.4.1 link que não vale mais (o MESMO link pela segunda vez e um token inventado): aviso `role="alert"` com ícone e a frase "Peça um novo link." | OK | `saidas/15`; `a11y-link-nao-vale-mais-1280-claro.png` e `-escuro.png` |
| 2.4.3 foco quando o link não vale mais | foco cai em `BODY` (Chromium e Firefox); o Tab seguinte é "Pedir um novo link" | ver Achados |
| 1.4.3 contraste nos dois temas | OK | axe sem violação em todos os estados acima, nos dois temas e nos dois motores; o teste de hover do e2e exige razão de contraste >= 4,5 (`saidas/20`, linhas 274 e 275) |
| 1.4.10 reflow e alvo de 44 px | OK | `/recuperar-senha` e `/redefinir-senha` a 320 e 390 px sem rolagem horizontal e sem controle abaixo de 44 px; `a11y-recuperar-senha-320-escuro.png`, `a11y-redefinir-senha-320-escuro.png` |
| recuperação desligada (leitura interceptada) | OK | axe sem violação; `a11y-pedido-desligada-390-escuro.png` |

## Evidência

- `npx vitest run` em `apps/web`: 669 de 669, código 0 (`saidas/01`); `recuperar-senha.test.ts`, `minha-conta-estreita.test.ts` e o restante do recorte de acessibilidade: 209 de 209 (`saidas/02`).
- `node sondas/sonda-e10.mjs`: Chromium 39 aprovadas e 3 falhas (`saidas/15-sonda-e10-chromium.txt`); Firefox 39 aprovadas e 3 falhas (`saidas/16-sonda-e10-firefox.txt`). As falhas são as de foco descritas em Achados (Chromium: as duas do link que não vale mais e a do pedido com rede caída pelo botão; Firefox: as duas do link e um erro de console de CORS que eu mesmo provoquei ao abortar o pedido).
- E2E do repositório contra par recém-semeado: `test/fluxo-api.e2e.mjs` Chromium 288 de 288, zero erro de console, código 0 (`saidas/20`; seções 14 e 27: Tab do email ao botão e ao link, foco na confirmação sem ser região viva, foco de volta no campo ao pedir de novo, 44 px no celular, contraste do hover).
- Capturas desta rodada (`capturas/`): as seis citadas na tabela, mais `a11y-pedido-desligada-390-escuro.png`. Olhadas `a11y-link-nao-vale-mais-1280-escuro.png` (aviso de perigo com ícone, frase inteira, botão "Pedir um novo link" com o anel depois do Tab) e `a11y-senha-redefinida-foco-1280-claro.png` (anel de foco na confirmação, um único botão).

## Cenários positivos

- Pedido real pelo teclado (Enter no campo): confirmação neutra com o foco nela; o notificador de teste recebe o link; o token some da barra de endereço.
- Redefinição pelo link real: erros de campo levam o foco ao campo certo; o sucesso fica na tela com o foco na confirmação e uma ação só.

## Cenários negativos

- O mesmo link usado duas vezes e um token inventado: a mesma frase, em `role="alert"`, com o caminho de pedir outro.
- Rede caída no pedido: aviso `role="alert"` "Sem conexão com o servidor..." (com foco, ver Achados).
- Recuperação desligada: tela de quem administra, axe sem violação nos dois temas.

## Tentativas de reprovar

1. Rodei axe-core em cada estado da etapa, nos dois temas e em dois motores: zero violação WCAG A ou AA.
2. Acionei o envio de duas formas: Enter no campo (foco fica no campo) e Enter no botão (o botão vira `disabled` enquanto envia). A segunda forma reprovou no Chromium com rede caída (abaixo).
3. Reusei o link de verdade, gasto, em vez de simular o 401, para pegar o caminho real do servidor (a migração 051 e `consumir_recuperacao` desta rodada): a tela mostra a mesma frase e o mesmo papel.
4. Esperei 3,4 s depois do sucesso para pegar redirecionamento por tempo (FAIL da rodada 2): não há.
5. Procurei anúncio duplo (foco mais região viva) nas duas confirmações: não há região viva em volta nem dentro.

## Achados

1. **Corrige antes de crescer (WCAG 2.4.3; registrado).** Quando a redefinição cai em "link não vale mais" (usado, vencido, inventado) o formulário some e o foco vai para `BODY`, em Chromium e Firefox. O aviso é `role="alert"` (anunciado) e o Tab seguinte cai em "Pedir um novo link", a ação certa, porque o ponto de partida da navegação sequencial fica onde estava o formulário. Está registrado em `dc360/apps/web/PENDENCIAS.md` seção 12 ("Continua aberto, com dono em outra fase (F10-E11)"). A etapa não tem linha de acessibilidade e o critério dela ("frase que manda pedir outro") está atendido; não reprova. Reprodução: `node sondas/sonda-e10.mjs` (`saidas/15`).
2. **Corrige antes de crescer (WCAG 2.4.3; NÃO registrado).** No pedido, com o foco no botão "Enviar link de redefinição" (Tab até ele e Enter) e a rede caída, o botão vira `disabled` enquanto envia (`RecuperarSenha.tsx:160-161`) e o foco cai em `BODY` no Chromium; o aviso de rede é `role="alert"`. No Firefox o foco fica no botão. Mesma classe do achado 1 da E09 (`ConfirmarAcao`) e do achado da E11. O mesmo vale, por leitura, para `disabled={p.salvando}` na senha nova (`:340-341`) quando a falha é de rede ou servidor (não medi). Precisa de registro com dono.
3. Anotado (registrado em `PENDENCIAS.md` seção 12): telas de recuperação sem landmark `main` (regra `region` do axe é de boa prática, fora das tags WCAG que rodei).
4. Motivo do veredito da rodada 4 (o link perdia para a troca de senha em voo; links pendentes sobreviviam a troca, redefinição e desativação): não toca acessibilidade. A correção 3 (`0bb347b`, migração 051) é de banco; a tela do link que não vale mais é a mesma e foi exercitada com o link real gasto.

## Não verificado

- Anúncio real por VoiceOver, NVDA ou TalkBack: da confirmação focada, do `role="alert"` do link que não vale mais e do aviso de rede.
- Link vencido por relógio (a tela usa a mesma frase do link usado; não esperei `RECUPERACAO_MINUTOS`).
- Foco na falha de rede e de servidor da tela de senha nova com Enter no botão (só leitura do código).
- WebKit no teclado; zoom pela interface do navegador (usei reflow).

## Risco residual

Baixo a médio: os dois casos de foco perdido têm o erro anunciado por `role="alert"` e o Tab seguinte leva a um controle útil; quem usa leitor de tela perde a posição, mas não a informação.

## Motivo do humano

Leitor de tela (VoiceOver no Safari, NVDA no Chrome) para os anúncios da confirmação e do link que não vale mais, e a validação humana da etapa (Rafael faz o fluxo com o notificador de arquivo e confere a produção desligada). Limite da seção 4 de `28`.
