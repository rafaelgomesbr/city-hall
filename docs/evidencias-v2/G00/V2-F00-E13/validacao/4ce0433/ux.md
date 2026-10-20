---
validador: ux
modelo: claude-opus-5-5
etapa: V2-F00-E13
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [UI, A11Y, AUTH]
nivel_de_prova_exigido: [E2, E3b]
nivel_de_prova_obtido: [E2, E3b]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Superfícies que a etapa toca: a entrada que parte de `/` (rota índice e `rotaInterna`), o aviso passageiro (`<Toast>`, `.toast` em `estilos/app.css`) nas gravações de Usuários, Equipes e Órgãos, o raio do ícone da marca (`.lateral__marca img`), o foco por teclado na barra do rodapé (`onFocus` em `Estrutura.tsx`) e o fim do caminho de volta depois de "Sair". Entre `bb0f654` e `4ce0433` nada mudou em `apps/web/src` além de um comentário (`busca/pontuador.ts`); as capturas abaixo são todas novas, contra a API real no SHA.

| Critério (DoD e campos de teste que tocam UX) | Prova | Resultado |
| --- | --- | --- |
| Entrar partindo de `/` leva à tela do papel, e não a "Esta página não existe" | `/` sem sessão vai a `/entrar`; depois de entrar: administradora, coordenadora e operador em `/painel`, agente em `/meu-trabalho`; "Esta página não existe" 0 vezes; igual em Chromium e Firefox (`e13-saida.txt`, `e13-saida-firefox.txt`) | PASS |
| `/` com sessão leva à tela do papel | `raiz com sessão -> /painel` em todas as 12 combinações | PASS |
| Rota índice sem sessão não concede nada; link profundo preservado | `/equipes` sem sessão vai a `/entrar` e, depois de entrar, volta a `/equipes` | PASS |
| Operador digitando `/usuarios` continua sem o formulário | `#usuario-nome` 0; a tela diz "Seu perfil não tem acesso a esta tela..." (`ux-operador-em-usuarios-chromium-1280-claro.png`) | PASS |
| Sair de propósito não deixa caminho de volta para a pessoa seguinte | depois de "Sair", `history.state` = `{"motivo":null,"voltarPara":null}` para os quatro papéis, nos dois motores | PASS |
| Confirmação de gravação anunciada por `role=status` | `.toast` com `role="status"` e `aria-live="polite"` nas seis frases medidas (cadastro em Usuários, Equipes e Órgãos; correção em Equipes) | PASS |
| O aviso não cai em cima da barra do rodapé | barra embaixo (768, 390, 320): `sobrepoeBarra: false`, folga de 15 px até a barra em todas as larguras e temas, Chromium e Firefox; em 1280 o aviso fica no canto direito, dentro da janela | PASS |
| Fundo opaco do aviso no escuro | `backgroundColor` `rgb(23, 30, 36)` no escuro e branco no claro; nenhuma frase da página atravessa o aviso nas capturas | PASS |
| Tab alcança cada item da barra inteiro | 768, 390 e 320, claro e escuro, Chromium e Firefox: os 11 itens (nove destinos, Tema, Sair) com `inteiro: true` | PASS |
| As frases dizem a verdade | "Ele já aparece na lista abaixo": a lista está abaixo do formulário em todas as larguras (1280: formulário em 203 px, lista em 901 px; 390: 259 contra 1679) e o usuário novo está nela (contagem 1) | PASS |

Portão visual (seção 0 de `19`), item a item:

- Alinhamento: PASS. O aviso alinha à margem direita do conteúdo em 1280 e ocupa a largura útil (16 px de cada lado) no celular; cartões do mesmo grupo com a mesma largura.
- Espaçamento: PASS. Folga constante de 15 px entre aviso e barra; nada grudado.
- Nada fora do lugar: PASS no que a etapa criou. Sem rolagem horizontal da página (`rolagemPagina: 0`); o aviso não tem texto cortado (`transb: 0`) nem a 320 px, onde a frase de correção quebra em quatro linhas sem partir palavra. O aviso cobre o conteúdo que está atrás dele, como todo aviso flutuante, e tem botão Fechar.
- Hierarquia: PASS. Ícone de confirmação, frase, ação "Fechar".
- Texto bem escrito: PASS. As seis frases ("Usuário cadastrado. Ele já aparece na lista abaixo.", "Cadastro corrigido. A lista abaixo já mostra o que mudou.", "Equipe criada. Ela já aparece na lista abaixo.", "Equipe corrigida. ...", "Órgão cadastrado. ...", "Órgão corrigido. ...") estão corretas, sem travessão, e conferem com a tela.
- Responsivo: PASS em 1280, 768, 390 e 320 px. Zoom de 200 por cento não medido.
- Dois temas, foco, estado nunca só por cor: PASS. Confirmação com ícone e texto; anel de foco visível e inteiro no último item da barra (`ux-barra-foco-no-ultimo-item-390-claro.png`).
- Estados vazio e de erro: PASS. Órgãos vazio ("Nenhum órgão cadastrado. Cadastre o primeiro órgão para encaminhar providência sem digitar o destino à mão."), erro de campo em Usuários (uma frase por campo, com ícone).
- Rafael vê e aprova: pendente (Motivo do humano).

Itens do "Motivo do veredito" da rodada 4 que tocam UX: "os quatro papéis entram por `/` e chegam à tela certa" continua verdadeiro no SHA (acima); "o aviso de confirmação não cobre a barra do rodapé" continua verdadeiro, agora medido também a 768 e 320 px e em Firefox. Nada a consertar vinha da rodada 4 para esta dimensão; a aprovação das seis frases segue com Rafael.

## Evidência

Ambiente: worktree esparso de `4ce0433` em `.../scratchpad/val/L08-ux/wt`, API na 3791 com banco em memória semeado, painel construído contra ela (código 0) e servido na 4791.

- `node e13.mjs <capturas> e13-saida.txt chromium`: código 0, zero erro de console e de página. Saída: `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L08-ux/e13-saida.txt`.
- `node e13.mjs <capturas> e13-saida-firefox.txt firefox`: código 0, zero erro. Saída: `.../L08-ux/e13-saida-firefox.txt`.
- `node e13b.mjs <capturas>` (Órgãos vazio rolado até a lista): `.../L08-ux/e13b-saida.txt`.
- Capturas em `docs/evidencias-v2/G00/V2-F00-E13/validacao/4ce0433/capturas/` (todas abertas, em folhas de contato `.../L08-ux/folhas/e13-*.png`):
  - Chromium, `{1280,768,390,320}-{claro,escuro}`: `ux-entrada-a-partir-da-raiz-*`, `ux-tela-do-papel-depois-da-raiz-*`, `ux-usuarios-erro-de-campo-*`, `ux-usuarios-confirmacao-*`, `ux-equipes-confirmacao-*`, `ux-equipes-correcao-*`, `ux-orgaos-confirmacao-*`, `ux-orgaos-vazio-*`, `ux-usuarios-carregando-*`; `ux-barra-foco-no-ultimo-item-{768,390,320}-*`.
  - Firefox, `{1280,390}-{claro,escuro}`: os mesmos estados com prefixo `ux-*-firefox-`.
  - `ux-orgaos-vazio-lista-{390,320}-{claro,escuro}.png`, `ux-agente-depois-da-raiz-{chromium,firefox}-1280-claro.png`, `ux-operador-em-usuarios-{chromium,firefox}-1280-claro.png`.

## Cenários positivos

- Quatro papéis entrando por `/`, nos dois motores: cada um na tela do papel.
- Seis confirmações de gravação aparecem, com `role=status`, e o registro aparece na lista.
- Tab percorre a barra do rodapé inteira com cada item visível por completo.

## Cenários negativos

- `/` sem sessão: vai a `/entrar` e não concede nada.
- Operador em `/usuarios`: sem formulário, com frase de recusa.
- Depois de "Sair", a próxima pessoa não herda a tela anterior (`voltarPara: null`).
- Formulário de usuário vazio: erro por campo, nada gravado.

## Tentativas de reprovar

- Larguras que a etapa não pediu (768 e 320) para achar o aviso em cima da barra: folga de 15 px em todas.
- Frase mais longa ("Equipe corrigida. A lista abaixo já mostra o que mudou.") a 320 px: quebra limpa.
- Segundo motor (Firefox) em tudo: mesmo resultado, zero erro.
- Conferir se "a lista abaixo" é mesmo abaixo em 1280, onde há coluna lateral: é.
- Link profundo sem sessão, para ver se a rota índice engoliu o caminho de volta: preservado.
- Tema escuro com aviso sobre texto da página: sem transparência.

## Achados

1. anotado (fora do escopo): a 390 e 320 px as tabelas de Equipes e Órgãos rolam dentro do cartão, e depois de "Editar" a tabela de Equipes fica rolada para a direita, mostrando "TUAÇÃO" cortado na borda do contêiner (`ux-equipes-correcao-320-claro.png`). É a rolagem de `tabela-envolucro`, anterior à etapa e registrada em `dc360/apps/web/PENDENCIAS.md` (6.3); a etapa só pôs o aviso nessas telas.
2. anotado (fora do escopo): no carregando de Usuários o círculo e a palavra "Carregando" ficam a cerca de 180 px um do outro (`ux-usuarios-carregando-390-claro.png`). É o componente comum de carregamento, cujo padrão é da F10-E10, que a etapa manda não implementar.
3. anotado (fora do escopo): a 320 px o campo de busca do topo mostra "Buscar registro ou funç" cortado (`ux-tela-do-papel-depois-da-raiz-320-claro.png`). É `BuscaGlobal`, que a etapa não toca.

## Não verificado

- Zoom de 200 por cento.
- Leitor de tela de verdade anunciando o aviso (só o atributo `role="status"`/`aria-live` foi conferido; é da dimensão de acessibilidade e de Rafael).
- O raio do ícone da marca foi conferido só a olho nas capturas de 1280 (ícone com cantos arredondados, igual nos dois temas), sem medida.

## Risco residual

Baixo. Os três pontos da etapa visíveis ao usuário (entrada pela raiz, aviso de confirmação, foco na barra) se comportam igual em quatro larguras, dois temas e dois motores.

## Motivo do humano

Validação humana da etapa: Rafael digita só o domínio, entra e chega à tela do papel. Gatilho "texto de produto" pelo diff (as seis frases de confirmação): aprovação dele. Capturas que precisa ver: `ux-usuarios-confirmacao-390-escuro.png`, `ux-equipes-correcao-320-claro.png`, `ux-orgaos-confirmacao-1280-claro.png`, `ux-entrada-a-partir-da-raiz-390-claro.png` e `ux-tela-do-papel-depois-da-raiz-390-claro.png`.
