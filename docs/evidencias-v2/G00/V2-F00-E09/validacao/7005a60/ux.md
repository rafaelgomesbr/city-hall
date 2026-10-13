---
validador: ux
modelo: claude-sonnet-5-5
etapa: V2-F00-E09
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: gatilho visual (tela nova, texto de produto novo, ação destrutiva, senha única)
---
Capturas em `<scratchpad>/g00/capturas-ux/` (prefixo `e09-`), geradas por agente de apoio com API real e painel no SHA 7005a60 (duas das três sessões de Rita foram abertas por fora: uma pela API, uma por outro navegador). Também li duas capturas do implementador (`docs/evidencias-v2/G00/V2-F00-E09/capturas/usuarios-confirmar-encerrar-390-claro.png`, marcada "impl.").

## Critérios verificados

Foco: telas de sessões e de redefinição de senha.

1. Botões por linha: `e09-usuarios-administradora-botoes-redefinir-e-encerrar-1280-escuro.png`: grade 2x2 (Corrigir/Desativar em cima, Redefinir senha/Encerrar sessões embaixo) alinhada entre as linhas; na linha da própria administradora só aparecem Corrigir e Desativar esmaecido, sem os botões de sessão. Tabela cabe em 1280. A 390 (`...-390-claro.png`) a tabela rola dentro do cartão com "A tabela continua para a direita" e os botões ficam fora da primeira dobra.
2. Confirmação de encerrar sessões: `e09-usuarios-confirmar-encerrar-sessoes-390-claro.png`. Texto bom (diz o efeito, a contagem "1 sessão aberta, a mais recente iniciada em..." e que quem está em campo fica sem sincronizar). DEFEITO: o botão "Encerrar sessões de Marcos Vinicius Teles" é mais largo que a janela, com o fim do texto na borda e a borda direita do botão cortada. Mesmo corte em `e09-usuarios-confirmar-redefinir-senha-390-escuro.png` ("Redefinir a senha de Diego Nakamura Alves") e na captura do implementador `usuarios-confirmar-encerrar-390-claro.png` (impl.), que o RESUMO declara sem corte. Nome longo de pessoa é o caso normal; sem quebra de linha no botão o texto sai do lugar.
3. Senha temporária: `e09-usuarios-senha-temporaria-exibida-390-escuro.png` e `...-1280-claro.png`. PASS: "Anote agora. Esta senha não aparece de novo...", senha em mono com rótulo, "Copiar senha" e "Já anotei a senha", prazo de 72 horas, e o fato "Esta conta não tinha nenhuma sessão aberta". Janela não fecha por clique fora (controle). Em 1280 sobra espaço vazio abaixo dos botões (anotado).
4. Toast: `e09-usuarios-sessoes-encerradas-toast-390-escuro.png`: "Sessões de Marcos Vinicius Teles encerradas. 1 sessão caiu." acima da barra inferior, opaco, com "Fechar". PASS no SHA (a correção de posição veio na E13). A frase repete a contagem que a pergunta já deu (anotado).
5. Troca obrigatória: `e09-troca-obrigatoria-erro-senha-curta-390-claro.png`. PASS: explica por que, erro no campo com ícone, "A senha precisa de pelo menos 12 caracteres", ação "Definir senha e entrar".
6. Minha conta: `e09-minha-conta-sessoes-ativas-1280-claro.png`: lista de seis sessões com "Esta sessão" em ícone mais texto, sendo cinco indistinguíveis ("Chrome em Windows" e "Aparelho não identificado", a hora de entrada igual ao minuto). Reconhecer em vez de lembrar: a pessoa não sabe qual é de qual aparelho. Confirmação `e09-minha-conta-confirmar-encerrar-outras-390-claro.png`: "Encerrar as outras 5 sessões", "Esta sessão continua aberta": clara, botão cabe. Depois: `e09-minha-conta-sessoes-depois-de-encerrar-outras-390-claro.png` com aviso verde "As outras 5 sessões foram encerradas" e estado de uma sessão com "Esta é a única sessão aberta na sua conta...". Estado vazio bem escrito (`e09-minha-conta-sessao-unica-390-escuro.png`).
7. Promessa "continua aqui": falsa com token anterior à renovação (`qa.md` da E07, achado 2): a pessoa seria jogada na entrada logo depois de ouvir que ficaria conectada.
8. Portão visual:
   - Alinhamento: PASS (grade 2x2, cartões).
   - Espaçamento: PASS.
   - Nada fora do lugar: FAIL (botão de confirmação cortado a 390 px, itens 2).
   - Hierarquia: PASS.
   - Texto: PASS, sem travessão, aviso de senha única claro.
   - Responsivo: 1280 e 390; 320, 768 e zoom 200 não capturados. O corte do botão sugere que 320 piora.
   - Temas e cor: os dois temas; ícone mais texto em todos os avisos; foco e contraste não medidos.
   - Estados: vazio (sessão única), erro e carregando existem nas capturas do implementador, não reconferidos por mim.
   - Rafael aprova: pendente.

## Evidência

- Capturas lidas (do lote): `e09-usuarios-administradora-botoes-redefinir-e-encerrar-390-claro.png` e `...-1280-escuro.png`, `e09-usuarios-confirmar-encerrar-sessoes-390-claro.png`, `e09-usuarios-sessoes-encerradas-toast-390-escuro.png`, `e09-usuarios-confirmar-redefinir-senha-390-escuro.png`, `e09-usuarios-senha-temporaria-exibida-390-escuro.png` e `...-1280-claro.png`, `e09-troca-obrigatoria-erro-senha-curta-390-claro.png`, `e09-minha-conta-confirmar-encerrar-outras-390-claro.png`, `e09-minha-conta-sessoes-depois-de-encerrar-outras-390-claro.png`, `e09-minha-conta-sessoes-ativas-1280-claro.png`, `e09-minha-conta-sessao-unica-390-escuro.png`.
- Simulado: nada além do preparo de sessões extras.

## Cenários positivos

- Administradora redefine a senha de Diego, a senha aparece uma vez, Diego entra com ela e é obrigado a definir a nova.
- "Encerrar minhas outras sessões" deixa só a atual.

## Cenários negativos

- Senha nova curta na troca obrigatória: erro no campo.
- Administradora não vê os botões de sessão na própria linha.

## Tentativas de reprovar

- Procurei nome longo em botão de confirmação a 390 px: o botão estoura a janela (achado 1).
- Procurei como distinguir as sessões duplicadas: não há.
- Procurei fechar a senha única sem anotar: não pode por clique fora (pelo RESUMO; não tentei no navegador).
- Procurei travessão e grafia: nada.

## Achados

1. bloqueia: botões de confirmação com o nome da pessoa estouram e perdem a borda a 390 px (`e09-usuarios-confirmar-encerrar-sessoes-390-claro.png`, `e09-usuarios-confirmar-redefinir-senha-390-escuro.png`). Reprodução: Usuários, 390 px, "Encerrar sessões" ou "Redefinir senha" de nome com mais de 25 caracteres. Dono: E09 (ConfirmarAcao com nome no botão).
2. corrige antes de crescer: sessões indistinguíveis na lista (sem aparelho, local ou última atividade).
3. corrige antes de crescer: "Esta sessão continua aberta" pode ser falsa (E07 achado 2).
4. anotado: Toast duplica a contagem; espaço vazio na janela de 1280.

## Não verificado

- 320 px, 768 px, zoom 200 por cento, leitor de tela, foco do teclado nas janelas, "Senha copiada" (não capturado), estados carregando e erro do implementador (não reabertos), 1280 claro da lista de sessões em outras combinações.

## Risco residual

Botão de ação destrutiva com rótulo ilegível a 390 px, onde a pessoa mais precisa de clareza.

## Motivo do humano

Gatilhos disparados pelo diff: tela nova, texto de produto novo, ação destrutiva e senha única. Rafael lê a frase da senha única e as confirmações (E4).
