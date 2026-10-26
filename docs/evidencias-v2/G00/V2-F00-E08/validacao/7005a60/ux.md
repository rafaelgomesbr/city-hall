---
validador: ux
modelo: claude-sonnet-5-5
etapa: V2-F00-E08
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [UI, AUTH, API]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
Capturas em `<scratchpad>/g00/capturas-ux/` (prefixo `e08-`), geradas por agente de apoio com API real e painel no SHA 7005a60; o ofício foi emitido por chamada direta à API (preparo). Li as capturas.

## Critérios verificados

Foco: o que o agente deixa de ver e se a tela dele ficou vazia sem explicação.

1. Dossiê do agente: PASS. `e08-agente-dossie-da-equipe-sem-cartao-de-oficios-1280-claro.png`: o cartão "Ofícios de encaminhamento" não existe, sem faixa de erro, sem buraco; a coluna esquerda fecha em "Providências encaminhadas". Contraste direto com `e08-operador-dossie-com-cartao-de-oficios-1280-claro.png`, onde Jonas vê o cartão com "000001/2026", "Não enviado por email" e a explicação "o ofício está emitido e pode ser impresso". Ausência é a resposta certa para quem nunca consulta ofício (prevenção de erro, minimalismo).
2. Rota por URL: `e08-agente-orgaos-por-url-sem-acesso-390-escuro.png`: "Seu perfil não tem acesso a esta tela. Se você precisa dela para trabalhar, peça a quem administra o município do seu órgão." Diz o que houve e o que fazer, com ícone mais texto. A frase "o município do seu órgão" é desajeitada (anotado).
3. Tela inicial do agente: `e08-agente-meu-trabalho-390-claro.png` não ficou vazia; mostra "1 vistoria para fazer", o aviso "Este painel precisa de conexão" e as tabelas. O texto longo do aviso é claro. Nesta largura as tabelas "Vistorias designadas" e "Vistorias que eu concluí" cortam colunas (rolagem horizontal) e quebram o endereço em uma palavra por linha ("Rua / Doutor / Peixoto,"): legibilidade ruim, componente de tabela anterior à etapa.
4. Sino: o agente vê 2 avisos e o selo mostra 2; o operador vê 3 e o selo mostra 3 (`e08-agente-sino-de-avisos-aberto-390-claro.png`, `e08-operador-sino-de-avisos-aberto-390-escuro.png`): contagem e lista coerentes. Defeito visual: a 390 px o painel do sino extrapola a borda esquerda da tela, e os textos aparecem cortados ("os", "zo de atendimento", "ridade média"). Esse arranjo se repete no claro e no escuro. O diff da etapa não toca o desenho do sino (só o recorte dos dados), então o dono é anterior; mas é "texto cortado" no portão visual do gate.
5. Erro de console: `GET /ocorrencias/devolvidas` responde 403 em toda carga do painel do operador (aparece em `e08-operador-dossie-com-cartao-de-oficios`, `e05-entrada-sessao-expirou`). A rota exige `despachar_equipe`; `Painel.tsx` 128 engole o erro com `.catch(() => null)` e, com `devolvidas === null`, linhas 308 a 314 desenham "A consulta das ocorrências devolvidas do campo não respondeu agora... Atualize a página para tentar de novo": para o operador isso é uma frase de erro que nunca se resolve. Não capturei o Painel do operador, então a frase é inferida do código. Dono: anterior à Fase 00 (nenhuma das etapas E05 a E13 toca `Painel.tsx` nem a rota). Severidade: corrige antes de crescer. Deve ser decidido na E08 do gate ou numa etapa de papel do painel (o operador não deveria chamar a rota).
7. Portão visual, item a item:
   - Alinhamento: PASS no dossiê (cartões e colunas alinhados em 1280).
   - Espaçamento: PASS. "Ver também" ocupa altura muito maior que o conteúdo (estado vazio com bolsão de espaço; anotado).
   - Nada fora do lugar: FAIL no sino a 390 (item 4, anterior à etapa); tabelas cortadas a 390 (anterior).
   - Hierarquia: PASS.
   - Texto: PASS, sem travessão; sem texto novo na etapa.
   - Responsivo: 1280 e 390; 320, 768, zoom 200 não capturados.
   - Temas e cor: os dois temas capturados; ícone mais texto.
   - Estados: vazio ("Nada relacionado", "Nenhuma fotografia"), erro (acesso negado) desenhados.
   - Rafael aprova: não exigido (sem gatilho).

## Evidência

- Capturas lidas: `e08-agente-meu-trabalho-390-claro.png`, `e08-agente-dossie-da-equipe-sem-cartao-de-oficios-1280-claro.png`, `e08-agente-sino-de-avisos-aberto-390-claro.png`, `e08-agente-orgaos-por-url-sem-acesso-390-escuro.png`, `e08-operador-dossie-com-cartao-de-oficios-1280-claro.png`, `e08-operador-sino-de-avisos-aberto-390-escuro.png`.
- Código: `Painel.tsx` 120 a 135 e 300 a 315, `ocorrencias.ts` 266 a 267.

## Cenários positivos

- Agente abre o dossiê da própria equipe sem erro e sem o cartão de ofícios; operador vê o cartão.
- Sino do agente com avisos só da equipe e selo igual à lista.

## Cenários negativos

- Agente digita `/orgaos`: recusa em português, sem formulário.

## Tentativas de reprovar

- Procurei faixa de erro, cartão vazio ou rastro do ofício no dossiê do agente: nada.
- Procurei diferença entre selo e lista do sino: nenhuma.
- Procurei texto cortado a 390 px: achei no sino e nas tabelas (anteriores).
- Procurei a frase de erro de devolvidas no painel do operador: não capturada, inferida do código.

## Achados

1. corrige antes de crescer, bloqueia o portão visual do gate: o painel do sino fica cortado na borda esquerda a 390 px (claro e escuro). Dono anterior à E08 (componente do sino fora do diff).
2. corrige antes de crescer: `GET /ocorrencias/devolvidas` 403 em toda visita do operador ao Painel, mais a frase de falha permanente que a tela desenha. Anterior à Fase 00; severidade média por ruído e por mentir ao operador.
3. anotado: tabelas do agente a 390 px cortam colunas e quebram endereço por palavra.
4. anotado: "Ver também" vazio com bolsão de espaço; "município do seu órgão".

## Não verificado

- Painel do operador (frase de falha de devolvidas), tela de ofício individual por URL do agente, 320 px, 768 px, zoom 200 por cento, leitor de tela.

## Risco residual

Baixo para a etapa, que só remove um cartão. Os defeitos de 390 px são do componente anterior.

## Motivo do humano

Não aplicável: o diff não cria tela, rota, componente, texto nem fluxo de erro crítico (o 403 do ofício não chega à tela).
