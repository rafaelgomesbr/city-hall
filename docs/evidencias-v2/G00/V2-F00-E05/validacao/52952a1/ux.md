---
validador: ux (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
Capturas em `docs/evidencias-v2/G00/validacao/52952a1/navegador/capturas/` (abaixo, `C/`), geradas por mim nesta rodada contra API e painel do SHA (ver o `LEIA-ME.md` da pasta `navegador/`). Olhei com a ferramenta de imagem todas as que cito. O diff `4b96ea7..52952a1` não toca `Entrar.tsx`, `entrar-regras.ts`, `http.ts` nem `sessao.tsx`: as telas desta etapa são as mesmas da rodada 2, e o que mudou ao redor (`Aviso` com a prop `foco`, `app.css`) foi conferido para não ter regredido nelas.

## Critérios verificados

DoD e cinco campos de teste que tocam UX:

1. Três frases distintas na tela de entrada, uma por motivo, provocadas pelo caminho real (verificações em `$SP/val/ux/resultados.json`, 25 de 26 OK; a única "falha" é uma conferência minha que não era critério, ver Tentativas):
   - Expirou (acesso vencido e renovação recusada): "Sua sessão expirou. Entre de novo para continuar de onde estava. Nada do que já tinha sido gravado se perdeu.", tom de alerta, sem "encerrada" nem "desativada". `C/E05-entrada-sessao-expirou-{1280,390,320}-{claro,escuro}.png`.
   - Encerrada (coordenação encerra pela rota `POST /usuarios/:id/encerrar-sessoes`): frase completa de sessão encerrada, tom de alerta, sem "expirou" nem "desativada". `C/E05-entrada-sessao-encerrada-*-*.png`.
   - Desativada pelo botão "Desativar" do painel, com token vivo e também pelo caminho da renovação (o FAIL da rodada 1): "Sua conta foi desativada. Entrar de novo não resolve: procure a coordenação do seu município. Nada do que você já registrou se perdeu.", tom de perigo. `C/E05-entrada-conta-desativada-*-*.png` e `C/E05-entrada-conta-desativada-renovacao-{1280,390}-*.png`.
2. Onde aparecem: só na tela de entrada (`/entrar`), acima do cartão do formulário, depois de qualquer gravação ou leitura que receba a recusa. Não aparecem quando a própria pessoa clica em "Sair" (`C/E05-entrada-depois-de-sair-390-claro.png`, sem aviso). Ao entrar de novo o aviso some (o painel abre na tela do papel).
3. `/auth/entrar` com conta desativada: recusa genérica "Email ou senha inválidos.", idêntica à de e-mail inexistente (comparado texto a texto). `C/E05-entrada-recusa-generica-conta-desativada-{1280,390,320}-claro.png`, `-390-escuro.png`.
4. Janela "Desativar usuário" (porta de entrada do fluxo): consequência escrita, nome no botão, cabe a 390 e 320 nos dois temas. `C/E05-janela-desativar-usuario-{390,320}-{claro,escuro}.png`.
5. Defeitos das rodadas anteriores, reexecutados:
   - Rodada 1, FAIL de UX (desativado via renovação via "sessão encerrada"): NÃO morde mais; a renovação de conta desativada leva à frase de desativada (`-renovacao-` acima).
   - Rodada 1 e 2, "quando o seu cadastro muda" desatualizada: AINDA MORDE (texto igual em `Entrar.tsx`), anotado abaixo.
   - Rodada 1, foco em `BODY` ao cair na entrada: AINDA MORDE (medido: `document.activeElement` = `BODY` nos quatro casos), dono F10-E11, fora do escopo.

Portão visual (seção 0 de `19`), item a item:
- Alinhamento: PASS. Logo, título, aviso e cartão centralizados; o aviso tem a largura do cartão em 1280, 390 e 320.
- Espaçamento: PASS. Respiro igual entre aviso e cartão; nada grudado.
- Nada fora do lugar: PASS. A frase mais longa (encerrada) quebra em 9 linhas a 320 dentro da caixa (`E05-entrada-sessao-encerrada-320-claro.png`); medição automática sem achado em todas as capturas E05; sem rolagem horizontal.
- Hierarquia: PASS. Primeira oração em negrito, resto em peso normal.
- Texto: PASS em grafia, sem travessão, cada frase diz o que fazer ("Entre de novo", "procure a coordenação"). Ressalva de conteúdo no achado 1.
- Responsivo: PASS em 1280, 390 e 320. 768 e zoom de 200 por cento não capturados.
- Temas e estado: PASS. Claro e escuro completos; estado nunca só por cor (ícone de alerta mais texto em negrito; desativada usa o tom de perigo, as outras o de alerta).
- Estados: erro desenhado nos três motivos; vazio e carregando não se aplicam.
- Rafael aprova: pendente (gatilhos abaixo).

Heurísticas de Nielsen: 1 visibilidade (diz por que caiu), 2 mundo real ("coordenação do seu município"), 5 prevenção (janela de desativar diz o efeito), 9 recuperar de erros (cada frase diz o próximo passo), 6 reconhecer em vez de lembrar.

## Evidência

- `node $SP/val/ux/e05.mjs` (código 0), saída em `$SP/val/ux/e05.log`; verificações e foco em `$SP/val/ux/resultados.json`.
- Capturas lidas: `E05-entrada-sessao-encerrada-320-claro.png`, `E05-entrada-conta-desativada-1280-escuro.png`, `E05-entrada-sessao-expirou-390-escuro.png`, `E05-entrada-recusa-generica-conta-desativada-390-claro.png`, `E05-janela-desativar-usuario-320-escuro.png`.

## Cenários positivos

- Desativar pelo painel e a próxima gravação leva à entrada com a frase de desativada (token vivo e token vencido).
- Encerrar sessões pela coordenação leva à frase de encerrada; entrar de novo resolve.
- Sessão expirada leva à frase de expirou; entrar de novo resolve.

## Cenários negativos

- Entrar com a conta desativada: recusa genérica igual à do e-mail inexistente, sem confirmar a conta.
- Sair por vontade própria: nenhuma das três frases aparece.
- Cada frase foi conferida contra as palavras das outras duas (nenhuma contaminação).

## Tentativas de reprovar

- Procurei a frase errada para cada motivo (a falha da rodada 1): não aconteceu em nenhum dos quatro caminhos.
- Procurei texto cortado ou caixa estourando a 320 nos dois temas: nada.
- Tentei deixar a frase "presa": recarregar `/entrar` mantém o aviso (o motivo vem no estado da navegação, que o navegador guarda ao recarregar); entrar de novo e sair o tira. Registrei como verificação "falha" no `resultados.json` porque eu esperava que sumisse, mas não é defeito: é o mesmo aviso, verdadeiro, e some na próxima entrada.
- Procurei aviso de desativada sobreposto à recusa genérica: os dois convivem (aviso no topo, erro no campo), sem contradição e sem sobreposição visual.
- Procurei travessão e erro de grafia nas três frases: nada.

## Achados

1. Corrige antes de crescer (rodadas 1 e 2, persiste): a frase de sessão encerrada cita "quando o seu cadastro muda" (`apps/web/src/paginas/Entrar.tsx`), mas a mudança de papel (E07) renova em silêncio e não leva a esta tela. Texto de produto: decisão do Rafael. Dono: E05 e E07.
2. Anotado (persiste): foco em `BODY` ao cair na entrada; o aviso de alerta é `role=status` montado já com o texto. Dono F10-E11 (acessibilidade dinâmica).
3. Anotado: "Nada do que você já registrou se perdeu" é incondicional; para agente com fila offline a E06 garante pausa, não envio. Frase aprovada em D7.

## Não verificado

- 768 px e zoom de 200 por cento; contraste medido (é da acessibilidade); leitor de tela (CP-32).
- O lado do app de campo (frase própria da fila): não é tela do painel.
- Firefox e WebKit: só Chromium nesta rodada.

## Risco residual

Baixo. As três telas não mudaram desde a rodada 2 e o componente compartilhado alterado (`Aviso`) mantém `role` quando não recebe `foco`, como aqui.

## Motivo do humano

Gatilhos da seção 10 de `28` disparados pelo diff da etapa: texto de produto (três frases novas ou alteradas em `Entrar.tsx` e mensagens do catálogo), fluxo de erro crítico de sessão e tela pública (a entrada). Rafael confere as capturas `E05-entrada-*` e decide o achado 1. Leitor de tela real segue com CP-32.
