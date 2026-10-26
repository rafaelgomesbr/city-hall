---
validador: ux
modelo: claude-opus-5-5
etapa: V2-F00-E08
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
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

Montagem (minha, no scratchpad `val-ux/`): API do SHA na porta 3797 (PGlite semeado), painel construído do SHA com `VITE_API_URL` e servido por `vite preview` na 4797. Playwright 1.62.1, Chromium, Firefox e WebKit. A árvore de `dc360/` em HEAD `55209ab` é idêntica à de `fd17ff4`. Preparação real: a administradora emitiu o ofício da providência pendente da ocorrência 000474/2026 (Equipe Alfa) pela API (201, 000001/2026). Capturas em `capturas/` desta pasta (prefixo `ux-E08-`, motor no nome); saídas em `SCRATCH/val-ux/saidas/`.

Por que não herdada: o diff `1ed0b71..fd17ff4` toca `app.css` e `Ocorrencia.tsx` (a linha "Tentativa N para email" do cartão de ofícios, dentro do dossiê). Procurei a regressão nas telas desta etapa:

| Critério | Resultado | Prova |
| --- | --- | --- |
| O dossiê esconde "Ofícios de encaminhamento" de quem não tem `consultar_oficio` (agente), sem faixa de erro | OK em 24 de 24 (1280, 768, 390, 320; dois temas; três motores): cartão ausente, zero `.aviso--perigo`, zero erro de console e de página | `ux-E08-agente-dossie-*` (24), `saidas/e08-{chromium,firefox,webkit}.txt` |
| "Meu trabalho" do agente sem faixa de erro | OK em 24 de 24: título "Meu trabalho", zero faixa de perigo | `ux-E08-agente-meu-trabalho-*` (24) |
| O operador continua vendo o cartão com o ofício (dado real, sem nada acrescido) | OK: cartão com 000001/2026, "Não enviado por email" e a explicação, a 1280, 390 e 320, dois temas, três motores, sem rolagem horizontal | `ux-E08-operador-cartao-oficios-real-*` (18), `saidas/e08-operador-real.txt` |
| O sino do agente mostra só a equipe dele, contagem igual à lista | OK: 2 itens e selo 2 nas 24 combinações; a administradora tem 3 pela API | `ux-E08-agente-sino-*` (24) |
| A API do agente em ofício | 403 em `GET /oficios` e `GET /oficios/:id` (contexto do que a tela evita pedir) | `saidas/e08-*.txt` |
| Regressão da linha "Tentativa N para email" (mudada nesta rodada) | Com email de pontos, quebra só depois de "@" e "." e fica no cartão; com um pedaço sem ponto mais largo que a coluna, sai do cartão (achado registrado na E09, achado 3) | `ux-E08-operador-oficio-envios-*` (24), `saidas/e08-*.txt` |

Portão visual (seção 0 de `19`), item a item:

| Item | Resultado |
| --- | --- |
| Alinhamento | OK: sem o cartão, a coluna do agente termina sem buraco nem cartão órfão (`ux-E08-agente-dossie-1280-claro-chromium.png`) |
| Espaçamento | OK: mesmo respiro entre cartões nos dois papéis |
| Nada fora do lugar | OK nas telas do agente (72) e no cartão real do operador (18): sem rolagem horizontal, nada fora da janela, nada cortado, nenhuma palavra quebrada no meio. Ver achado 1 para o histórico de envio com email fora do comum |
| Hierarquia | OK |
| Texto | A etapa não cria texto visível; ver anotado 3 (frases do cartão do ofício, anteriores) |
| Responsivo | OK a 1280, 768, 390 e 320; o painel do sino ancorado e inteiro a 390 px (`ux-E08-agente-sino-390-claro-firefox.png`) |
| Temas, contraste, estado não só por cor | OK nos dois temas; prazo vencido com texto além da cor |
| Estados de erro e vazio | O estado de erro que a etapa evita (403 derrubando o dossiê) não aparece em nenhum motor |

Heurísticas: prevenção de erro (o painel não pede o que vai negar), consistência entre papéis, visibilidade (o número do sino é o da lista).

## Evidência

- `MOTOR=<motor> node SCRATCH/val-ux/e08.mjs`, código 0 em Chromium, Firefox e WebKit (40 capturas por motor; `saidas/e08-{chromium,firefox,webkit}.txt`). Zero erro de console e de página nos três.
- `node SCRATCH/val-ux/e08-operador-real.mjs`, código 0 (18 capturas; `saidas/e08-operador-real.txt`): o cartão do operador com o dado real.
- Para ver o histórico de envio (o envio real exige provedor de email), o roteiro acrescentou duas tentativas à resposta do detalhe do ofício e `envios: 2` à lista, com o email `protocolo.encaminhamentos@secretariamunicipaldeobraseservicospublicos.serraalta.mg.gov.br`; a tela, o markup e o CSS são os do SHA.

## Cenários positivos

1. Operador abre o dossiê e vê o cartão de ofícios com o número, o órgão e o estado do envio.
2. Agente abre o sino e vê os 2 avisos da equipe dele, com a contagem certa.

## Cenários negativos

1. Agente abre o dossiê de ocorrência da equipe dele: o cartão de ofícios não aparece e nada vermelho aparece no lugar, nos três motores.
2. Agente pede a API de ofícios direto: 403.

## Tentativas de reprovar

- WebKit e 768 px (não rodados na rodada 6) em todas as telas da etapa.
- Tema escuro a 320 px no dossiê, no "Meu trabalho" e no sino.
- Expandi o histórico de envio do ofício (a linha mudada nesta rodada) com email longo: com o domínio de 44 letras sem ponto, a linha sai do cartão a 390 px e a página rola na horizontal a 320 px, nos três motores; com email comum de pontos, fica certa (sonda própria na E09).
- Conferi o cartão real do operador nos três motores para separar o dado acrescido do dado real: sem rolagem nem corte.

## Achados

1. **anotado (bloqueia na E09).** A linha "Tentativa N para email" do histórico de envio, mudada nesta rodada pela correção 5 da E09, transborda com email cujo pedaço sem ponto é mais largo que a coluna (`ux-E08-operador-oficio-envios-320-claro-chromium.png`). Não é desta etapa e o transbordamento com pedaço longo já existia antes (o texto era item flex solto); está registrado como achado 3 da E09.
2. **corrige antes de crescer.** No dossiê, a 390 e 320 px, o botão de texto "Corrigir a coordenada" tem 168x24 px, abaixo dos 44 px de toque da régua (`saidas/e08-operador-real.txt`, também na rodada 6). Anterior, fora do escopo.
3. **anotado.** No cartão do ofício, com duas tentativas recusadas: "As 2 tentativas ficou registrada e o provedor de email não aceitou a mensagem" (`oficio-regras.ts:58`, concordância) e o botão "Ver as 1 tentativa" com uma (`Ocorrencia.tsx`). Anteriores, fora do escopo; texto mal escrito pelo portão.
4. **anotado.** Em "Meu trabalho" a 320 px a coluna de endereço da tabela "Vistorias que eu concluí" quebra uma palavra por linha ("Rua / Doutor / Peixoto, / 909,") (`ux-E08-agente-meu-trabalho-320-escuro-webkit.png`); legível, sem corte; anterior.

## Não verificado

- O envio real de ofício por email (exige provedor): o histórico de envio foi medido com a resposta acrescida.
- Leitor de tela e aparelho real.
- Zoom de 200 por cento nestas telas.

## Risco residual

Baixo para o que a etapa entrega: o agente não vê nem pede o que não pode, e o painel não cai por isso nos três motores. O resíduo é de outras peças da mesma tela (histórico de envio do ofício, toque do botão de coordenada, concordância de duas frases).

## Motivo do humano

A validação humana da etapa é do Rafael (a sonda do agente antes e depois). Capturas para ele: `ux-E08-agente-dossie-390-claro-chromium.png`, `ux-E08-agente-sino-390-claro-firefox.png`, `ux-E08-operador-cartao-oficios-real-390-claro-webkit.png`.
