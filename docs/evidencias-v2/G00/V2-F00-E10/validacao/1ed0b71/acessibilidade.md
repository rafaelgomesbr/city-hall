---
validador: acessibilidade
modelo: claude-opus-5-5
etapa: V2-F00-E10
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Montagem própria (API do SHA em 127.0.0.1:3891, PGlite recém-semeado, `NOTIFICADOR_ARQUIVO` no scratchpad; painel do SHA na 4891; Chromium e Firefox do Playwright). `V` é `SCRATCH/validadores/acessibilidade`. A etapa não tem linha "Acessibilidade:"; verifiquei os estados da tela `RecuperarSenha.tsx` que ela manda cobrir, pelo checklist WCAG.

| Estado da tela | WCAG | Resultado (Chromium e Firefox) | Prova |
| --- | --- | --- | --- |
| Email inválido: erro no campo | 3.3.1, 2.4.3 | foco no `#recuperar-email`, `aria-invalid=true`, `aria-describedby` com o erro, `role=alert`, ícone; contraste 5,46 (claro) e 7,27 (escuro) | `V/saidas/11-sonda-telas.txt` |
| Pedido enviado (resposta neutra) | 2.4.3, 4.1.3 | foco na confirmação (`aviso--sucesso`, sem região viva, não lida duas vezes); contraste 5,53 e 7,48 | idem; `capturas/a11y-E10-pedido-enviado-*` |
| Senha curta e senhas diferentes | 3.3.1, 3.3.3 | foco no campo certo (`#nova-senha`, `#repetir-senha`), `aria-invalid=true`, erro ligado | `11-sonda-telas.txt` |
| Link inventado, vencido ou usado | 3.3.1, 4.1.3, 2.4.3 | aviso `role=alert` com ícone e a frase de pedir outro (contraste 4,75 e 5,96); foco em BODY e o Tab seguinte em "Pedir um novo link" | idem; `capturas/a11y-E10-link-invalido-*` (achado 1) |
| Sucesso com o link real do notificador | 2.4.3 | foco na confirmação "Senha redefinida. Entre com a nova senha."; token removido da barra | idem; `capturas/a11y-E10-sucesso-{chromium,firefox}-390-light.png` |
| Recuperação desligada | 1.3.1, 2.1.1 | aviso `role=status` com ícone, quatro passos em lista ordenada, único focável "Voltar para a entrada", sem rolagem a 320 px | `V/saidas/17-sonda-e10-desligada.txt`; `capturas/a11y-E10-desligada-*` |
| 320 px sem rolagem horizontal, dois temas | 1.4.10 | OK | `11-sonda-telas.txt` ("rolagem false") |
| E2E da etapa (seção 14 de `fluxo-api.e2e.mjs`, foco nas confirmações) | | OK nos dois motores | `V/saidas/05-fluxo-api-{chromium,firefox}.txt` ("depois de enviar o pedido o foco está na confirmação, sem ser região viva", "depois de redefinir o foco está na confirmação") |

## Evidência

- `node V/sondas/telas.mjs` (código 0, `V/saidas/11-sonda-telas.txt`): os estados acima a 390 claro, 320 escuro e 1280 claro, por motor; sucesso de ponta a ponta com o link lido do arquivo do notificador.
- `node V/sondas/desligada.mjs` (código 0, `V/saidas/17-sonda-e10-desligada.txt`): `GET /auth/recuperacao` interceptado com `ativa: false`, 320 claro e 390 escuro, dois motores.
- `node test/fluxo-api.e2e.mjs`: 288 de 288 em Chromium e em Firefox.
- `npm run test --workspace @dc360/web`: 688 de 688 (inclui `recuperar-senha.test.ts`).
- Capturas: `capturas/a11y-E10-pedido-enviado-*`, `a11y-E10-link-invalido-*`, `a11y-E10-sucesso-*`, `a11y-E10-desligada-*` (dois motores, larguras e temas no nome).

## Cenários positivos

Pedido e sucesso levam o foco à confirmação nos dois motores e nas três larguras; a confirmação é lida pelo foco e não é região viva (sem anúncio duplo).

## Cenários negativos

Email incompleto, senha curta, senhas diferentes, link inventado e recuperação desligada: cada um com a frase no lugar certo, ligada ao campo quando é de campo, e com papel de alerta ou status quando não é.

## Tentativas de reprovar

1. Enviei por Enter no campo e por clique no botão, nos dois motores: os erros de campo não sofrem do defeito de quadro da E09 porque o foco é dado de forma síncrona antes de qualquer `await` (`RecuperarSenha.tsx:200` e `:401`).
2. Procurei foco perdido em cada transição de fase: só o "link não vale mais" deixa o foco em BODY (achado 1).
3. Verifiquei se o token fica na barra de endereço depois de ler (afeta quem compartilha a tela): removido nos dois motores.
4. 320 px no tema escuro: sem rolagem, aviso inteiro.

## Achados

1. **corrige antes de crescer (WCAG 2.4.3; já registrado com dono F10-E11 em `dc360/apps/web/PENDENCIAS.md`, seção 12, e nas rodadas anteriores).** Quando a redefinição cai em "link não vale mais", o formulário some e o foco vai a BODY nos dois motores. O aviso é `role=alert` e o Tab seguinte cai em "Pedir um novo link", a ação certa; o critério da etapa ("frase que manda pedir outro") está atendido. Não reprova.
2. **anotado.** O aviso da recuperação desligada é `role=status` inserido junto com a página; leitor de tela não verificado.

## Não verificado

- Leitor de tela (a leitura da confirmação pelo foco e do alerta).
- Link vencido de verdade (o inventado cai no mesmo estado `link-invalido` da tela) e envio com a rede caída.
- WebKit, zoom de 200 por cento a 1280 px.

## Risco residual

Baixo: o único foco perdido é num caminho de falha, com a mensagem anunciada como alerta e a ação seguinte a um Tab.

## Motivo do humano

Só uma pessoa com leitor de tela confere o anúncio da confirmação (por foco) e do alerta; a validação humana da etapa (fluxo com o notificador de arquivo, produção desligada) segue com o Rafael.
