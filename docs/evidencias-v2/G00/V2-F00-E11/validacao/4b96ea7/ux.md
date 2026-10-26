---
validador: ux
modelo: claude-sonnet-5-5
etapa: V2-F00-E11
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [UI, API]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
Capturas do agente independente em `<scratchpad>/web/capturas/` (scratchpad = `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad`), nome `E11-<tela>-<largura>-<tema>.png`. Li as imagens citadas. Sem shell nesta sessão (sem `git diff`); frases conferidas por `Grep` em `Organizacao.tsx` e `permissoes.ts`.

## Critérios verificados

Rodada 1: PASS, com achados (nenhuma confirmação depois do download; frase de recusa com o verbo errado). Reteste e caça a regressão, agora também em 320 px.

1. Cartão em repouso: `E11-organizacao-antes-320-escuro.png`: título "Saída de município", frase "Gera o pacote com toda a base do município: ocorrências, vistorias, evidências e cadastro. É o arquivo mais sensível do sistema, e baixar não apaga nada.", botão "Baixar pacote de saída" com ícone e texto, inteiro a 320 px. PASS.
2. Gerando: `E11-organizacao-gerando-390-escuro.png`: botão desabilitado "Gerando" com ícone, contraste baixo por ser desabilitado (intencional), sem progresso nem estimativa. Aceitável.
3. Concluído: `E11-organizacao-concluido-390-claro.png`: o botão volta a "Baixar pacote de saída" e NADA na tela confirma que o arquivo foi gerado (sem aviso, sem nome do arquivo). Mantém o achado da rodada 1 (`Organizacao.tsx` linhas 243 a 251 só dispara o download, sem Toast). Não reprovo: o portão visual não é violado e a rodada 1 já classificou como "corrige antes de crescer".
4. Recusa: a frase de recusa vem do catálogo (`permissoes.ts` linha 41, "alterar os dados do município", para a ação `gerenciar_organizacao`); quem quer BAIXAR lê um verbo que não é o dele. Achado persistente da rodada 1, não reaberto em captura (a recusa só aparece com permissão revogada no meio da sessão).

Portão visual (seção 0 de `19`), item a item:
- Alinhamento: PASS (cartões de mesma largura, botão alinhado à esquerda, 320, 390).
- Espaçamento: PASS (nada grudado; cartões com respiro igual).
- Nada fora do lugar: PASS (sem texto cortado; sem rolagem horizontal; botão inteiro a 320).
- Hierarquia: PASS.
- Texto: PASS em grafia e sem travessão; ressalva do item 4.
- Responsivo: 320 e 390 vistos; 768 e 1280 capturados pelo outro agente, não abertos. Zoom de 200 por cento não capturado.
- Temas, foco, contraste: claro e escuro vistos; contraste não medido por mim; "Gerando" usa ícone mais texto.
- Estados: normal e carregando vistos; erro (recusa) só nas capturas do implementador; sucesso sem confirmação (item 3).
- Rafael aprova: pendente (baixar e abrir o ZIP).

Heurísticas de Nielsen: 1 (estado: "Gerando" sim, concluído não), 2 (mundo real: a frase de recusa usa "alterar" para baixar, falha), 5 (prevenção de erro: botão desabilitado durante o pedido evita pacote duplo; sem confirmação, quem clica de novo gera outro pacote sensível), 9 (recuperar de erro: a frase de rede "O arquivo não foi baixado" diz o que aconteceu).

## Evidência

Capturas lidas (em `<scratchpad>/web/capturas/`): `E11-organizacao-antes-320-escuro.png`, `E11-organizacao-gerando-390-escuro.png`, `E11-organizacao-concluido-390-claro.png`. Verificação do download (111 entradas no ZIP, SOMAS-SHA256, botão desabilitado enquanto gera, nenhuma faixa de erro): `scratchpad/web/RELATORIO.md`, seção T6, lida, não repetida. Código: `Organizacao.tsx` linhas 240 a 270.

## Cenários positivos

- Administradora baixa o ZIP; o botão passa por "Gerando" e volta ao normal.
- Coordenadora e agente recebem 403 no endpoint e a coordenadora não tem "Organização" no menu (outro agente).

## Cenários negativos

- Pedido retido de propósito: botão desabilitado e foco preservado (outro agente).
- Recusa com permissão revogada no meio da sessão: faixa de erro (rodada 1, não reaberto).

## Tentativas de reprovar

- Procurei confirmação de sucesso depois do download: continua sem.
- Procurei texto cortado e botão grudado a 320 e 390 em três estados: nada.
- Procurei a frase que não corresponde à ação: "alterar" para baixar continua no catálogo.
- Procurei clique duplo durante "Gerando": o botão fica desabilitado (outro agente).
- Procurei travessão e grafia: nada.

## Achados

1. Corrige antes de crescer (rodada 1, persistente): nenhuma confirmação depois do download (sem Toast com o nome do arquivo). Risco: a pessoa clica de novo e gera um segundo pacote sensível.
2. Corrige antes de crescer (rodada 1, persistente): a recusa do servidor usa "alterar os dados do município" onde a ação é baixar.
3. Anotado: "Gerando" sem progresso nem estimativa; o formato do arquivo não é dito na tela.

## Não verificado

- Abertura do ZIP por pessoa, a recusa e o município suspenso em captura minha, 768 e 1280 abertos, zoom de 200 por cento, leitor de tela, contraste medido.
- Li 3 imagens desta etapa, de 938 do lote.

## Risco residual

Dois pacotes sensíveis por falta de confirmação; frase de recusa com verbo errado em caso raro.

## Motivo do humano

Gatilhos da seção 10: texto de produto (frases do botão e da recusa) e fluxo de erro crítico de saída de dado. Rafael baixa o pacote e abre o ZIP, e decide os dois achados de texto.
