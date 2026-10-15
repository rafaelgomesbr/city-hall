---
validador: ux (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E08
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [UI, A11Y, AUTH, AUTHZ, API, LGPD]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
Capturas em `docs/evidencias-v2/G00/validacao/52952a1/navegador/capturas/` (abaixo, `C/`), geradas por mim nesta rodada (ver `navegador/LEIA-ME.md`). Olhei as que cito. O diff `4b96ea7..52952a1` não toca `Ocorrencia.tsx`, `Sino.tsx` nem `sino-regras.ts`; a parte de tela da E08 em todo o lote é `Ocorrencia.tsx` (não pedir `/oficios` nem desenhar o cartão para quem não tem `consultar_oficio`).

## Critérios verificados

1. O agente não vê ofícios: com um ofício emitido de verdade (`POST /oficios`, número 000001/2026) na ocorrência 000474/2026 da Equipe Alfa, Diego (agente da Alfa) abre o dossiê e o cartão "Ofícios de encaminhamento" não existe, a tela não faz nenhum pedido a `/oficios` (rede observada) e não há faixa de erro (`.aviso--perigo` ausente). `C/E08-agente-dossie-sem-oficios-{1280,390}-{claro,escuro}.png`.
2. A coordenação continua vendo: Helena, mesmo dossiê, cartão presente. `C/E08-coordenadora-dossie-com-oficios-{1280,390}-claro.png`.
3. Sino do agente só com a equipe dele: "Avisos, 2 por ler" (prazo vencido e vistoria recebida da 000474, ambos da Alfa); o da coordenadora tem 3. `C/E08-agente-sino-aberto-{1280,390}-{claro,escuro}.png`, `C/E08-coordenadora-sino-aberto-{1280,390}-claro.png`.
4. Estado vazio (agente sem equipe, criado pela API): o sino diz "Avisos, nenhum por ler" e abre com "Nada novo por aqui. Vistoria recebida do campo, prazo de atendimento vencido e resposta de órgão aparecem nesta lista."; Meu trabalho explica "Você ainda não está em nenhuma equipe ... peça para incluírem você numa equipe" e "0 vistorias para fazer". `C/E08-agente-sem-equipe-sino-vazio-{1280,390,320}-{claro,escuro}.png`, `C/E08-agente-sem-equipe-meu-trabalho-*-*.png`.
5. Defeitos das rodadas anteriores (UX):
   - Rodada 1, painel do sino cortado na borda esquerda a 390: NÃO morde (`E08-agente-sino-aberto-390-escuro.png`: o painel ocupa a largura com margem igual dos dois lados).
   - Rodada 2, "Corrigir a coordenada" com 24 px de altura a 390: AINDA MORDE (medido 168 x 24 em `E08-coordenadora-dossie-com-oficios-390-claro.png`), elemento anterior ao lote, dono F10 (`botao-texto`).
   - Rodada 2, anomalia do sino com aviso de outra equipe: não reapareceu (rodada sequencial, sem mutação de outro validador); o agente viu só avisos da 000474, da equipe dele.

Portão visual, item a item (nas telas tocadas: dossiê do agente e sino):
- Alinhamento: PASS (sem o cartão de ofícios, a coluna esquerda do dossiê segue sem buraco; sino com os itens alinhados à esquerda e o botão à direita).
- Espaçamento: PASS (itens do sino com o mesmo respiro; nada grudado).
- Nada fora do lugar: PASS (medição sem achado nas capturas do agente; o painel do sino não sai da janela a 390 e 320).
- Hierarquia: PASS (título do aviso em negrito, protocolo em fonte tabular, data discreta).
- Texto: PASS (sem travessão; estado vazio explica o que aparece ali).
- Responsivo: PASS em 1280, 390 e 320 (320 só no estado vazio).
- Temas e estado: PASS (não lido tem "Marcar como lido" escrito, a faixa colorida é reforço).
- Estados: vazio desenhado (sino e Meu trabalho); erro e carregando não foram provocados.
- Rafael: não obrigatório (sem gatilho, abaixo).

Heurísticas: 1 (selo com o número e rótulo "2 por ler"), 8 estética minimalista (o agente não vê cartão que não pode usar, em vez de ver um cartão com erro), 10 ajuda (estado vazio explica).

## Evidência

- `node $SP/val/ux/e08.mjs` (código 0), saída em `$SP/val/ux/e08.log`; rótulos e conteúdo do sino em `$SP/val/ux/resultados.json` (eventos E08).
- Capturas lidas: `E08-agente-sino-aberto-390-escuro.png`, `E08-agente-sino-aberto-1280-claro.png`, `E08-agente-sem-equipe-sino-vazio-320-claro.png`, `E08-agente-sem-equipe-meu-trabalho-390-escuro.png`.

## Cenários positivos

- Coordenadora vê o cartão de ofícios e o sino com 3 avisos.
- Agente vê o sino da equipe dele e abre o dossiê sem erro.

## Cenários negativos

- Agente: nenhum pedido a `/oficios`, nenhum cartão, nenhum aviso de outra equipe; agente sem equipe com sino vazio e contagem zero.

## Tentativas de reprovar

- Procurei faixa de erro no dossiê do agente (o risco do bloco: o `Promise.all` derrubar a tela): nenhuma, e a rede não teve 403 de ofício.
- Procurei aviso de outra equipe no sino do agente (anomalia da rodada 2): não apareceu.
- Procurei corte do painel do sino a 390 (rodada 1) e a 320: nada.
- Procurei estado vazio "sem texto" (sino aberto em branco): o texto está lá.

## Achados

1. Corrige antes de crescer (rodada 2, persiste): "Corrigir a coordenada" com 24 px de altura a 390 na tela Ocorrência. Dono F10 (`botao-texto`). Não é desta etapa.
2. Anotado (rodadas 1 e 2): "Ver também" com bolsão de espaço quando vazio; tabelas de Meu trabalho a 390 rolam na lateral. Anteriores.

## Não verificado

- Estado de erro do sino (falha de rede) e carregando: não provocados.
- 768 px; Firefox e WebKit.
- O recorte do sino no servidor é das dimensões de segurança e red-team; aqui só o que a tela mostra.

## Risco residual

Baixo para a tela. O que protege o dado é o servidor; a tela só deixa de pedir e de desenhar.

## Motivo do humano

Nenhum gatilho da seção 10 dispara pelo diff da etapa: nenhum texto visível novo, nenhuma tela ou rota nova, nenhuma mensagem nova de sessão ou permissão (a mudança em `Ocorrencia.tsx` é deixar de pedir e de desenhar um cartão). A substituição da validação humana do bloco (Rafael ver a sonda antes e depois) é de API e está nas outras dimensões.
