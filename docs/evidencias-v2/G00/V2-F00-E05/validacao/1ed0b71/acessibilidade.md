---
validador: acessibilidade
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Montagem própria (API do SHA em 127.0.0.1:3891 com PGlite recém-semeado; painel construído do SHA com `VITE_API_URL` e servido na 4891; Chromium e Firefox do Playwright). `V` é `SCRATCH/validadores/acessibilidade`. A dimensão acessibilidade toca a parte "Frontend" da etapa: `conta_desativada` com aviso próprio na tela de entrada e `sessao_encerrada` como sessão morta, mais as mensagens do aplicativo de campo. O console só mudou no servidor (guarda de códigos, `guarda-de-codigos-de-erro.ts` e `servidor.ts`); a página do console não foi tocada pela etapa.

| Critério | WCAG | Resultado | Prova |
| --- | --- | --- | --- |
| Conta desativada: a próxima chamada leva à entrada com a frase própria, como alerta | 4.1.3, 3.3.1 | OK nos dois motores: `role=alert`, ícone, "Sua conta foi desativada..." | `V/saidas/11-sonda-telas.txt`; `capturas/a11y-E05-desativada-*` |
| Sessão encerrada: frase própria como status | 4.1.3 | OK nos dois motores: `role=status`, ícone | `11-sonda-telas.txt`; `capturas/a11y-E05-encerrada-*` |
| Estado não só por cor (ícone mais texto, título em negrito) | 1.4.1 | OK | idem |
| Contraste do texto do aviso, claro e escuro | 1.4.3 | OK: desativada 4,75 (claro) e 6,59 (escuro); encerrada 6,37 e 8,98 | `11-sonda-telas.txt` |
| 320 px sem rolagem horizontal | 1.4.10 | OK nos dois motores | `capturas/a11y-E05-desativada-{chromium,firefox}-320-light.png` |
| Teclado ao chegar à entrada | 2.1.1, 2.4.3 | OK: carga de página, foco em BODY e primeiro Tab no campo de email | `11-sonda-telas.txt` |
| E2E da etapa (seção 23 de `fluxo-api.e2e.mjs`) | | OK nos dois motores | `V/saidas/05-fluxo-api-{chromium,firefox}.txt` |
| App de campo: faixa e diálogo da conta com rótulo para leitor de tela ("procure a coordenação") | 4.1.2 | OK, 109 de 109 | `V/saidas/12-jest-e05-campo.txt` |

## Evidência

- `node V/sondas/telas.mjs` (código 0, `V/saidas/11-sonda-telas.txt`): pessoa nova pela API, entra no navegador, a administradora a desativa (`PATCH /usuarios/:id/situacao`) ou encerra as sessões dela, e a pessoa clica em "Ocorrências" (chamada seguinte, sem recarregar). Cinco combinações por motor (390 claro, 1280 escuro, 1280 claro, 390 escuro, 320 claro).
- `node test/fluxo-api.e2e.mjs` com API nova: Chromium 288 de 288, Firefox 288 de 288, zero erro de console.
- `npx jest` em `apps/campo` sobre `dialogo-na-conta`, `faixa-de-sincronizacao`, `fila-pausada-pela-sessao`, `fila-pausada-nao-promete-sinal`, `falha-de-atualizacao`: 6 suítes, 109 testes, código 0 (`V/saidas/12-jest-e05-campo.txt`).
- `npm run test --workspace @dc360/web`: 688 de 688 (`V/saidas/06-vitest-web.txt`).
- Capturas: `capturas/a11y-E05-desativada-{chromium,firefox}-{390-light,1280-dark,320-light}.png`, `capturas/a11y-E05-encerrada-{chromium,firefox}-{1280-light,390-dark}.png`.

## Cenários positivos

Conta desativada e sessão encerrada, nos dois motores, nas três larguras e nos dois temas: a frase certa, com ícone, papel de alerta ou status, contraste acima de 4,5 e sem rolagem horizontal.

## Cenários negativos

- A frase da conta desativada não aparece quando a sessão é só encerrada (e o contrário): os dois casos foram exercitados separadamente e cada um mostrou só o seu aviso.
- `/auth/entrar` com a conta desativada mantém a recusa genérica (coberto pela seção 23 da `fluxo-api`, verde nos dois motores).

## Tentativas de reprovar

1. Disparei a chamada seguinte por navegação interna (sem recarregar) em vez de usar o gesto do e2e da casa: a tela ainda vai à entrada com a frase certa.
2. Medi o contraste efetivo (texto sobre o fundo composto) no tema escuro forçado por `colorScheme` e pela chave de tema; a primeira tentativa não aplicou o escuro, corrigi a sonda e medi de novo (valores diferentes por tema, prova de que o tema mudou).
3. Procurei foco preso ou perdido na chegada: é carga de página; o primeiro Tab vai ao email, sem armadilha.
4. 320 px nos dois motores: sem rolagem horizontal, aviso inteiro.

## Achados

1. **anotado.** O aviso de "sessão encerrada" é `role=status` e nasce junto com a página de entrada; em leitor de tela, região viva que já nasce com texto pode não ser anunciada (é a mesma ressalva que a E10 registrou). Como é chegada de página nova, o leitor lê o conteúdo de qualquer forma ao percorrer; sem prova em leitor de tela.
2. **anotado.** A mensagem "Sua sessão expirou" (`nao_autenticado` depois de o token vencer) não foi exercitada no navegador (exige esperar o vencimento de 15 minutos); a marcação é a mesma `Aviso tom="alerta"`.

## Não verificado

- Leitor de tela (anúncio real do alerta e do status).
- Aplicativo de campo em aparelho ou emulador (não há nesta máquina): só os testes de componente.
- Página do console: a etapa não mudou a interface dele.
- WebKit, zoom de 200 por cento a 1280 px.

## Risco residual

Baixo para acessibilidade: as frases são alertas ou status com ícone e contraste folgado. O anúncio por leitor de tela fica sem prova.

## Motivo do humano

A etapa pede que Rafael leia e aprove as três frases (conteúdo de produto), e só uma pessoa com leitor de tela confere o anúncio do alerta e do status na tela de entrada.
