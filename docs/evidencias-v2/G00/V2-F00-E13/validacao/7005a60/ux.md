---
validador: ux
modelo: claude-sonnet-5-5
etapa: V2-F00-E13
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [UI, A11Y]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: gatilho visual (rota índice, texto de produto novo, Toast reposicionado)
---
Capturas em `<scratchpad>/g00/capturas-ux/` (prefixo `e13-`), geradas por agente de apoio com API real e painel no SHA 7005a60; o Toast de Equipes e de Órgãos não foi gerado, usei as do implementador em `docs/evidencias-v2/G00/V2-F00-E13/capturas/` (marcadas "impl.").

## Critérios verificados

Foco: login a partir de `/` e portão de acessibilidade.

1. Entrar a partir de `/`: PASS. Navegador novo sem sessão abre `/` e chega à entrada (`e13-entrada-a-partir-da-raiz-sem-sessao-390-claro.png`); Helena entra e chega a `/painel`, não a "Esta página não existe" (`e13-painel-depois-de-entrar-pela-raiz-1280-claro.png`, `...-390-escuro.png`). Fluxo real sem simulação.
2. Toast: `e13-toast-usuarios-cadastro-1280-claro.png` ("Usuário cadastrado. Ele já aparece na lista abaixo.", canto inferior direito, opaco, com "Fechar") e `e13-toast-confirmacao-usuarios-390-claro.png` ("Cadastro corrigido. A lista abaixo já mostra o que mudou."), acima da barra de navegação sem sobrepor os rótulos. Impl.: `equipes-confirmacao-390-claro.png` ("Equipe criada. Ela já aparece na lista abaixo.") e `orgaos-confirmacao-390-claro.png` ("Órgão cadastrado. Ele já aparece na lista abaixo."): os três cadastros cobertos. Ressalva: a 390 px o aviso cobre a base do formulário e o cabeçalho da lista; é flutuante e fecha, aceitável. Toast de cadastro existe só em 1280 claro (o cadastro ocorre uma vez), o resto é a correção.
3. Barra do rodapé a 390: os itens continuam cortados na borda ("Mapa da cida...", `e13-painel-depois-de-entrar-pela-raiz-390-escuro.png`) por rolagem horizontal deliberada; nada indica que a barra rola (anotado, F10). Foco por teclado vindo do conserto não reconferido por mim.
4. Portão de acessibilidade: o implementador fez o teste ler o comentário inteiro da exceção, o que o torna mais permissivo; avaliado por leitura, não por execução. Anotado.
5. Painel que abre depois do login: a 1280 (`e13-painel-depois-de-entrar-pela-raiz-1280-claro.png`) a coluna Equipe da fila quebra "Não despachada" no meio da palavra ("Não / despach / ada") nas linhas 000472 e 000475. Quebra de palavra é item do portão visual. O diff da E13 não toca a tabela do Painel, então o dono é anterior; severidade corrige antes de crescer. Os cartões de indicador formam um grupo de 4 mais 2, deixando o segundo grupo desigual (anotado). A 390 a fila e as tabelas cortam colunas (rolagem horizontal declarada). O erro de console `GET /ocorrencias/devolvidas` 403 (operador) não ocorre aqui (coordenadora), ver `V2-F00-E08/.../ux.md`.
6. Portão visual, item a item:
   - Alinhamento: PASS nas telas do fluxo (entrada, usuários).
   - Espaçamento: PASS.
   - Nada fora do lugar: PASS no que a etapa mudou (Toast, rota); FAIL anterior no Painel (palavra quebrada, item 5).
   - Hierarquia: PASS.
   - Texto: PASS, seis frases claras, sem travessão; Rafael aprova.
   - Responsivo: 1280 e 390; 320, 768, zoom 200 não capturados.
   - Temas e foco: claro e escuro; foco e contraste não medidos.
   - Estados: Toast (sucesso), vazio (`orgaos-vazio-*` do implementador) e erro (`usuarios-erro-de-campo-*`) não reabertos.
   - Rafael aprova: pendente.

## Evidência

- Capturas lidas: `e13-entrada-a-partir-da-raiz-sem-sessao-390-claro.png`, `e13-painel-depois-de-entrar-pela-raiz-1280-claro.png` e `...-390-escuro.png`, `e13-toast-usuarios-cadastro-1280-claro.png`, `e13-toast-confirmacao-usuarios-390-claro.png`; impl.: `equipes-confirmacao-390-claro.png`, `orgaos-confirmacao-390-claro.png`.

## Cenários positivos

- Entrada por `/`, login e chegada à tela do papel.
- Cadastrar e corrigir mostram confirmação.

## Cenários negativos

- Sem sessão em `/`: vai à entrada sem frase e sem caminho de volta inútil.

## Tentativas de reprovar

- Procurei a página "Esta página não existe" depois do login por `/`: não aparece.
- Procurei sobreposição do Toast com a barra: não há.
- Procurei texto cortado no Painel: palavra quebrada na coluna Equipe a 1280 (anterior à etapa).
- Não repeti "sair e entrar outro perfil" (pelo RESUMO, `voltarPara` fica nulo).

## Achados

1. corrige antes de crescer: "Não despachada" quebra no meio da palavra no Painel a 1280 (dono anterior; fora do diff).
2. anotado: barra do rodapé a 390 sem indicação de que rola; portão de acessibilidade mais permissivo.
3. anotado: indicadores em 4 e 2 deixam o grupo desigual.

## Não verificado

- Sair e entrar com outro perfil no mesmo navegador, foco do teclado na barra, execução dos testes de acessibilidade, 320 px, 768 px, zoom 200 por cento, leitor de tela.

## Risco residual

Baixo para a etapa; os defeitos visuais do Painel são anteriores.

## Motivo do humano

Gatilhos disparados pelo diff: rota índice nova, texto de produto novo (seis frases), Toast compartilhado reposicionado. Rafael digita só o domínio, entra e confere a tela do papel, e aprova as frases.
