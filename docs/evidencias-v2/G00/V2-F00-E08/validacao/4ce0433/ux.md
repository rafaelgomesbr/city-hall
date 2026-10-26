---
validador: ux
modelo: claude-opus-5-5
etapa: V2-F00-E08
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [UI, A11Y, AUTH, AUTHZ, API, LGPD]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Capturas minhas, Chromium do Playwright, painel construído do SHA ligado à API real do SHA (PGlite semeado). Pasta: `docs/evidencias-v2/G00/V2-F00-E08/validacao/4ce0433/capturas/` (abaixo, `capturas/`), 18 arquivos `ux-*`, todos abertos e olhados. Para o operador ter o que ver, emiti pela API (coordenadora) o ofício 000001/2026 da providência da ocorrência 000474/2026 (Equipe Alfa), banco descartável.

| Critério que toca a tela | Resultado | Prova |
| --- | --- | --- |
| O painel esconde "Ofícios" de quem não tem `consultar_oficio`, pela mesma `podeExecutar` | OK | agente Diego no dossiê 000474/2026: cartão "Ofícios de encaminhamento" ausente (contagem 0) e nenhuma faixa de erro (0 avisos de perigo), console sem erro. `capturas/ux-agente-dossie-{1280,390}-{claro,escuro}.png` |
| Coordenação e operação não mudam | OK | operador Jonas no mesmo dossiê: cartão presente com 000001/2026, órgão, emissor, providência e selo "Não enviado por email" (ícone e texto). `capturas/ux-operador-dossie-{1280,390}-{claro,escuro}.png` |
| Sino do agente só com a equipe dele | OK | painel do sino do agente: dois avisos, ambos de 000474/2026 (Alfa); contador "2" igual à lista. `capturas/ux-agente-sino-{1280,390}-{claro,escuro}.png` |
| Tela de recusa por permissão | OK | agente em `/usuarios`: "Seu perfil não tem acesso a esta tela. Se você precisa dela para trabalhar, peça a quem administra o município do seu órgão." em aviso de perigo com ícone. `capturas/ux-agente-tela-sem-permissao-{1280,390,320}-{claro,escuro}.png` |
| Sonda de API, para ancorar o que a tela esconde | OK | `GET /oficios` com o token do agente: 403 `sem_permissao`, "Seu perfil não tem permissão para consultar os ofícios de encaminhamento." (frase em português correto) |
| Portão visual nas telas tocadas | OK | medição por captura sem rolagem horizontal e sem elemento além da janela (`saidas/capturas.log`); alinhamento e espaçamento olhados nos dois temas |

Itens do "Motivo do veredito" da rodada 4 que tocam a tela: o único era o gatilho visual (nova jornada, seção 25 do e2e), que pede E4 do Rafael. A correção 4 não mexeu no painel desta etapa (`git diff bb0f654..4ce0433 -- dc360/apps/web/src` só altera um comentário em `busca/pontuador.ts`); as telas continuam como descritas. O E4 segue pendente.

## Evidência

- Roteiro `e08.mjs` (diretório de trabalho `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L06-ux/`), log em `saidas/capturas.log` (linhas `E08`).
- Console do agente e do operador: vazio (nenhum 403 de ofício disparado pelo dossiê do agente).

## Cenários positivos

- Operador vê o cartão de ofícios com o conteúdo de sempre, nas duas larguras e temas.
- Agente abre o dossiê inteiro sem quebra.

## Cenários negativos

- Agente: sem cartão, sem pedido de ofício, sem faixa de erro; em tela que o papel não alcança, recusa com frase e ícone.
- Agente: o sino não mostra aviso de outra equipe (000473/2026, da Bravo, ausente).

## Tentativas de reprovar

- Procurei se o 403 do ofício vazava como faixa de erro no dossiê do agente (o `Promise.all` derrubaria a página): não vaza, console limpo.
- Procurei o número do ofício por outro caminho visual: a "Linha do tempo auditável" do agente mostra "Ofício de encaminhamento emitido, Órgão: Secretaria de Obras, Número: 000001/2026" (`capturas/ux-agente-dossie-1280-escuro.png`). É ocorrência da própria equipe dele e não traz e-mail do órgão, observações nem IP, que eram o vazamento da etapa. Registro abaixo para a segurança decidir.
- 320 px na tela de recusa: o placeholder da busca do topo aparece cortado ("Buscar registro ou funç"); é a barra global, anterior à etapa.

## Achados

- anotado: a linha do tempo do dossiê mostra ao agente o número e o órgão do ofício emitido (só da ocorrência da equipe dele). Fora do escopo visual; cito para a dimensão de segurança.
- anotado (anterior à etapa): a tela de recusa não tem título nem ação de voltar; o placeholder da busca do topo corta a 320 px; o cartão "Ver também" a 1280 px fica alto e vazio ao lado da coluna esquerda.
- anotado (artefato da captura): a barra lateral diz "Tema escuro" nas capturas escuras porque troquei o tema pelo atributo `data-theme`, sem passar pelo botão; não é defeito do painel.

## Não verificado

- Modo de demonstração (local) do dossiê do agente: não capturado nesta rodada (a entrada local foi aberta e funciona; o teste `oficio-so-para-quem-consulta.test.ts` cobre o modo local).
- 768 px, zoom de 200 por cento, leitor de tela, outros motores.

## Risco residual

Baixo. A tela só deixa de desenhar um cartão e não ganhou texto novo.

## Motivo do humano

O E4 visual da rodada 4 (nova jornada, seção 25 do e2e) e a validação humana da etapa (Rafael vê a sonda do agente antes e depois) continuam pendentes. Capturas para o Rafael: `capturas/ux-agente-dossie-1280-claro.png` contra `capturas/ux-operador-dossie-1280-claro.png` (cartão de ofícios ausente e presente), `capturas/ux-agente-sino-390-escuro.png` e `capturas/ux-agente-tela-sem-permissao-390-claro.png`.
