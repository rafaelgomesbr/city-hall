---
validador: ux (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E13
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [UI, A11Y, AUTH]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
Capturas em `docs/evidencias-v2/G00/validacao/52952a1/navegador/capturas/` (abaixo, `C/`), geradas por mim nesta rodada (ver `navegador/LEIA-ME.md`). Olhei as que cito. O diff `4b96ea7..52952a1` não toca `App.tsx`, `Toast.tsx`, `Estrutura.tsx`, `Orgaos.tsx`, `Equipes.tsx` nem `Usuarios.tsx`; mexe em `app.css` (classes novas e hover), conferido nas telas desta etapa.

## Critérios verificados

1. Entrar a partir de `/`: em 1280, 390 e 320, `/` leva a `/entrar`; Helena (Enter no formulário) cai em `/painel`, sai, e Diego cai em `/meu-trabalho`. Um observador de DOM instalado antes do primeiro carregamento provou que "Esta página não existe" nunca apareceu nesses caminhos. `C/E13-raiz-leva-a-entrada-*`, `C/E13-destino-helena-painel-*`, `C/E13-destino-diego-meu-trabalho-*` (três larguras, dois temas).
2. "Esta página não existe" só onde deve: um endereço inexistente com sessão mostra a página própria, com explicação e "Voltar ao início", nos dois temas e três larguras. `C/E13-pagina-inexistente-*`.
3. Telas que tinham vermelho (os casos de Toast): Órgãos "Órgão cadastrado. Ele já aparece na lista abaixo.", Equipes "Equipe criada. Ela já aparece na lista abaixo.", Usuários "Usuário cadastrado. Ele já aparece na lista abaixo.", com ícone, "Fechar", fundo opaco e acima da barra de baixo a 320 e 390. `C/E13-orgaos-com-aviso-{1280,390,320}-*`, `C/E13-equipes-com-aviso-{320,1280}-*`, `C/E13-usuarios-com-aviso-{320,1280}-*`. Marca da barra lateral com o raio do token: `C/E13-lateral-marca-1280-claro.png`.
4. VEREDITO da rodada 2: o FAIL de UX (Órgãos a 320, "Mostrar desativados" passando da área útil do cartão e o e-mail partido em várias linhas) foi decidido pela arbitragem em Opus como defeito anterior à fase. Reexecutado neste SHA: AINDA MORDE, igual (medido 174..294 contra a área útil 41..279; `C/E13-orgaos-pagina-320-claro.png`, recorte olhado; e-mail de teste partido em 7 linhas na coluna Contato). Conferi pelo diff da fase (`afde25c..52952a1`): `Orgaos.tsx` só ganhou o Toast, e a regra `.caixa-marcacao` e o cabeçalho do `Cartao` não mudaram. Sigo a arbitragem: achado com dono, não reprova a E13.
5. Defeitos da rodada 1 e 2 que não são desta etapa, reexecutados: "Corrigir a coordenada" com 24 px (persiste, ver E08); barra de baixo a 390 rolando sem indicação (persiste, decisão de produto F10).

Portão visual, item a item (entrada, destino por papel, página inexistente, avisos):
- Alinhamento: PASS (página inexistente centrada no cartão; aviso alinhado às margens a 320).
- Espaçamento: PASS.
- Nada fora do lugar: PASS nas telas da etapa; Órgãos a 320 com o achado anterior (item 4). O texto de ajuda da busca do topo a 320 ("Buscar registro ou funç") é cortado pelo atalho "⌘ K" (anterior, achado 3).
- Hierarquia: PASS (título da página inexistente, explicação discreta, ação).
- Texto: PASS (seis frases de aviso claras, sem travessão; "Esta página não existe" explica as duas causas).
- Responsivo: PASS em 1280, 390 e 320.
- Temas e estado: PASS (aviso com ícone de confirmação e texto).
- Estados: erro desenhado (página inexistente); vazio e carregando não se aplicam.
- Rafael: pendente.

Heurísticas: 1 (aviso diz que o item já aparece na lista), 3 (página inexistente oferece a volta), 4 consistência (o mesmo aviso nas três telas de cadastro).

## Evidência

- `node $SP/val/ux/e13.mjs` e `node $SP/val/ux/e13b.mjs` (códigos 0), saídas `e13.log` e `e13b.log`; 18 verificações, 0 falha, em `$SP/val/ux/resultados.json`.
- Capturas lidas: `E13-raiz-leva-a-entrada-390-claro.png`, `E13-destino-helena-painel-1280-escuro.png`, `E13-destino-diego-meu-trabalho-320-claro.png`, `E13-pagina-inexistente-390-escuro.png`, `E13-orgaos-com-aviso-320-claro.png`, recorte de `E13-orgaos-pagina-320-claro.png`, `E13-usuarios-com-aviso-320-escuro.png`.

## Cenários positivos

- Coordenadora e agente chegam à tela do próprio papel a partir do domínio.

## Cenários negativos

- Agente nunca cai no painel da coordenadora; endereço inexistente mostra a página própria em vez de branco.

## Tentativas de reprovar

- Observador de DOM desde o primeiro byte para pegar "Esta página não existe" piscando entre a entrada e o destino: não piscou nas três larguras.
- Entrei com Enter (teclado), não com clique.
- Procurei o aviso por cima da barra de baixo a 320 e 390: fica acima dela.
- Procurei regressão nas telas da etapa vinda da correção 2 (`app.css`): nenhuma medição nova.

## Achados

1. Corrige antes de crescer (anterior à fase, decidido pela arbitragem da rodada 2): Órgãos a 320 px, "Mostrar desativados" passa 15 px da área útil do cartão e o e-mail da coluna Contato quebra em 7 linhas. Dono F10 ou F08.
2. Corrige antes de crescer (anterior): "Corrigir a coordenada" com 24 px de altura a 390 (tela Ocorrência). Dono F10.
3. Anotado (anterior): a 320 px o texto de ajuda da busca do topo é cortado pelo atalho "⌘ K"; a barra de baixo com mais de quatro itens rola sem indicação.

## Não verificado

- 768 px nesta rodada; Firefox (a etapa pede `MOTOR=firefox` no e2e, que é da QA).
- Toasts de "corrigido" (rodada 2 os fotografou; o componente não mudou).

## Risco residual

Baixo. O componente de aviso e a rota índice não mudaram desde a rodada 2.

## Motivo do humano

Gatilhos da seção 10 disparados pelo diff da etapa: nova jornada (entrar a partir de `/`, rota índice nova em `App.tsx`), texto de produto (seis frases de aviso) e componente compartilhado alterado (`Toast.tsx` reposicionado acima da barra). Rafael digita só o domínio, entra e confere as capturas `E13-*` (pendência já registrada).
