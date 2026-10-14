---
validador: ux
modelo: claude-sonnet-5-5
etapa: V2-F00-E24
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [UI]
nivel_de_prova_exigido: [E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
Etapa de documentação e apresentação, sem tela de produto. A rodada 1 não teve validador de UX nela; olho aqui só o que é visual: a tabela "O aplicativo instalado e usado" da apresentação `dc360/docs/apresentacao/2026-09-15-para-o-alyson.html`, nas quatro capturas do implementador em `docs/evidencias-v2/G00/V2-F00-E24/capturas/` (`seguranca-1280-claro.png`, `seguranca-1280-escuro.png`, `seguranca-390-claro.png`, `seguranca-390-escuro.png`). Li as de 1280 claro, 1280 escuro e 390 escuro. Sem shell nesta sessão (sem `git diff`).

## Critérios verificados

1. Selo "Parcial" na linha "Segurança do agente sozinho": `seguranca-1280-claro.png` e `seguranca-1280-escuro.png`: selo âmbar "Parcial" legível, nos dois temas, com a ressalva escrita ao lado ("Pronto no servidor e na tela da coordenação... O aplicativo do agente ainda não declara a saída, não prorroga e não confirma o retorno: hoje a tela 'Quem está em campo' fica vazia e ninguém é avisado de nada. A parte do aplicativo está planejada, sem data. Não é botão de pânico, e a tela diz isso. Corrigido em 07/10/2026: a versão anterior desta tabela dizia 'Pronto'"). Nenhuma linha de segurança do agente com "Pronto". PASS.
2. Diferenciação dos selos: "Em uso" (verde), "Pronto" (verde claro), "Pronto, desligado" (violeta) e "Parcial" (âmbar) distinguem-se por texto, não só por cor. PASS.
3. Tabela a 390 px (`seguranca-390-escuro.png`): a tabela fica num contêiner que rola na lateral (`.rolavel`, `min-width: 560px`, linhas 173 e 181 do HTML); a captura mostra só as colunas Peça e Estado e a Observação cortada na borda. A ressalva da E24, que é o conteúdo da etapa, está fora da primeira tela no celular, e a página não traz indicação de que a tabela rola (na tela web do painel há a dica "A tabela continua para a direita"; aqui não). Anoto, não reprovo: o contêiner e a rolagem são anteriores à etapa, a apresentação é para tela de notebook e o PDF imprime a tabela inteira (regra de impressão nas linhas 241 e 242).

Portão visual (seção 0 de `19`), no que se aplica a um documento:
- Alinhamento: PASS (colunas alinhadas, selos alinhados à esquerda, linhas de mesma altura útil).
- Espaçamento: PASS (respiro igual entre linhas; nada grudado). O recorte da captura de 1280 cola o texto na borda esquerda da imagem, o que é artefato de recortar só a tabela.
- Nada fora do lugar: PASS em 1280 (texto inteiro, sem palavra partida). A 390 o texto fica cortado pela rolagem do contêiner (item 3).
- Hierarquia: PASS (cabeçalho em caixa alta pequena, primeira coluna em negrito).
- Texto: PASS em grafia, sem travessão nas linhas lidas; "Corrigido em 07/10/2026" é texto de produto (decisão de Rafael e Alyson).
- Responsivo: 1280 e 390 vistos; 320 e 768 não capturados.
- Temas, contraste: claro e escuro; contraste do selo "Parcial" a olho legível, não medido.
- Estados: não se aplica.
- Rafael aprova: pendente (CP-02).

Heurísticas de Nielsen aplicáveis a um documento: 1 (estado do sistema dito com honestidade: "Parcial" mais a ressalva), 2 (mundo real: "ninguém é avisado de nada" é linguagem de quem usa), 5 (prevenção de erro: a ressalva evita alguém subir o morro contando com um alerta que não existe), 8 (minimalismo: a ressalva é longa, mas é exatamente o que precisa ser dito).

## Evidência

As quatro capturas do implementador (três abertas por mim) e o código do HTML (`.rolavel`, linhas 173 a 181 e 241 a 242). A saída do gerador de PDF e os Greps da etapa ficam para a dimensão de QA.

## Cenários positivos

- Linha de segurança do agente com selo "Parcial" e ressalva, claro e escuro, 1280.

## Cenários negativos

- A 390 px a ressalva fica atrás da rolagem lateral, sem sinal de rolagem (achado 1).

## Tentativas de reprovar

- Procurei "Pronto" na linha de segurança do agente nas capturas: não há.
- Procurei texto cortado a 1280: nada; a 390 há corte por rolagem do contêiner, anterior à etapa.
- Procurei selo que dependa só de cor: todos têm texto.
- Procurei travessão nas linhas lidas: nada.

## Achados

1. Corrige antes de crescer: na apresentação, a 390 px a tabela com a ressalva rola na lateral sem nenhuma dica de que rola; a ressalva da E24 só aparece depois de rolar. Dono: HTML da apresentação (anterior). Se a apresentação for aberta no celular de Alyson ou de alguém do município, vale a mesma dica "A tabela continua para a direita" do painel.
2. Anotado: a captura de 390 mostra um recorte da tabela, não a página inteira; não prova a leitura da ressalva em celular.

## Não verificado

- A página inteira da apresentação em 320, 390 e 768; o PDF regenerado em si (só o QA abre).
- Os demais documentos (`SEGURANCA-DO-AGENTE.md`, `CARTAO-DO-AGENTE.md`, guia, README): conferência de texto, da dimensão de QA.
- Zoom de 200 por cento, leitor de tela.
- Li 3 de 4 capturas da etapa.

## Risco residual

Baixo para o visual. O risco da etapa (promessa de segurança física sem entrega) é de conteúdo, não de layout.

## Motivo do humano

Critério E4 explícito na etapa (CP-02, "Rafael e Alyson leem a apresentação ajustada antes de qualquer demonstração a município") e texto de produto alterado (selo e ressalva). Decisão de produto e de domínio.
