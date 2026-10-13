---
validador: ux
modelo: claude-sonnet-5-5
etapa: V2-F00-E11
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [UI, API]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: gatilho visual (texto de produto novo e fluxo de erro crítico de saída de dado)
---
Capturas em `<scratchpad>/g00/capturas-ux/` (prefixo `e11-`), geradas por agente de apoio com API real e painel no SHA 7005a60: download real (ZIP de 242694 bytes, assinatura `PK`, apagado depois). "Gerando" foi fotografado retendo a resposta (interceptação) e uma das duas recusas é injetada com o corpo real que a API devolveu a Helena.

## Critérios verificados

Foco: botão de saída de município e o ZIP.

1. Cartão em repouso: `e11-organizacao-botao-de-saida-janela-390-claro.png`: título "Saída de município", frase "Gera o pacote com toda a base do município... É o arquivo mais sensível do sistema, e baixar não apaga nada", botão "Baixar pacote de saída" com ícone e texto, inteiro na tela. Alerta de sensibilidade e promessa de não apagar: boa correspondência com o mundo real.
2. Estado "Gerando": `e11-saida-durante-o-download-gerando-390-escuro.png`: botão desabilitado com texto "Gerando" e ícone, contraste baixo no desabilitado (intencional), sem indicador de progresso nem estimativa. Aceitável; o pacote de 109 arquivos leva tempo e nada diz quanto.
3. Depois do download: `e11-saida-depois-do-download-390-claro.png`: o botão volta ao normal e NADA confirma que o arquivo foi gerado (sem frase "Pacote baixado" nem nome do arquivo). A pessoa depende da barra do navegador (heurística 1). Corrige antes de crescer.
4. Recusa do servidor (injetada): `e11-saida-recusa-do-servidor-sem-permissao-1280-claro.png`: "Seu perfil não tem permissão para alterar os dados do município." para uma pessoa que quis BAIXAR; verbo errado (heurística 2). Na prática o painel barra antes: `e11-coordenadora-organizacao-sem-permissao-390-claro.png` mostra a tela inteira recusada, "Seu perfil não tem acesso a esta tela. Se você precisa dela para trabalhar, peça a quem administra o município do seu órgão.", então a faixa só aparece com permissão revogada no meio da sessão.
5. Suspenso e rede: não capturados no lote; nas capturas do implementador (`saida-erro-suspenso-1280-escuro.png`, lida em rodada anterior) a frase "O acesso deste município ao sistema foi suspenso pelo fornecedor. Procure quem administra o contrato na sua prefeitura." diz o que houve e o que fazer.
6. Portão visual, item a item:
   - Alinhamento: PASS (cartões de mesma largura, botão alinhado à esquerda).
   - Espaçamento: PASS; aviso de erro e botão não grudam.
   - Nada fora do lugar: PASS; sem rolagem horizontal, botão inteiro em 390.
   - Hierarquia: PASS.
   - Texto: PASS em grafia e sem travessão; ressalva do item 4.
   - Responsivo: 1280 e 390; 320, 768, zoom 200 não capturados.
   - Temas e cor: os dois temas; erro com ícone mais texto; foco e contraste não medidos.
   - Estados: normal, carregando e erro desenhados; sucesso sem mensagem (item 3).
   - Rafael aprova: pendente (E4 da etapa: baixar e abrir o ZIP).

## Evidência

- Capturas lidas: `e11-organizacao-botao-de-saida-janela-390-claro.png`, `e11-saida-durante-o-download-gerando-390-escuro.png`, `e11-saida-depois-do-download-390-claro.png`, `e11-coordenadora-organizacao-sem-permissao-390-claro.png`, `e11-saida-recusa-do-servidor-sem-permissao-1280-claro.png`.
- Simulado: o estado "Gerando" (resposta retida) e a recusa 403 com corpo real, injetados por interceptação de rota.

## Cenários positivos

- Administradora baixa o ZIP; o botão volta ao normal.

## Cenários negativos

- Coordenadora digita `/organizacao`: recusa da tela.
- Recusa do servidor ao botão (injetada): faixa de erro com ícone e texto.

## Tentativas de reprovar

- Procurei confirmação de sucesso depois do download: não existe.
- Procurei frase que não corresponde à ação: achada ("alterar" para baixar).
- Procurei corte e desalinhamento a 390 px: nada.
- Procurei como a pessoa sabe o conteúdo do ZIP: o texto cita ocorrências, vistorias, evidências e cadastro, mas não formato nem tamanho.

## Achados

1. corrige antes de crescer: nenhuma confirmação depois do download.
2. corrige antes de crescer: "alterar os dados do município" onde a ação é baixar.
3. anotado: "Gerando" sem progresso; formato do arquivo não dito.

## Não verificado

- Abertura do ZIP pelo olho humano, suspenso e rede em captura minha, 320 px, 768 px, zoom 200 por cento, leitor de tela.

## Risco residual

Pessoa sem confirmação clica duas vezes e gera dois pacotes sensíveis.

## Motivo do humano

Gatilhos disparados pelo diff: texto de produto novo ("O arquivo não foi baixado") e fluxo de erro crítico (saída de dado). Rafael baixa o pacote e abre o ZIP.
