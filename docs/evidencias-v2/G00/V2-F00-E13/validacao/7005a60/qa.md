---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E13
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [UI, A11Y, AUTH]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados
Base: HEAD 665b2be (só STATUS difere de 7005a60). Fatos conferidos: o RESUMO tem razão, o título diz 14 mas eram 6 vermelhos no momento da etapa (8 já zerados pela E09); o número não é problema do código.

- Painel com 0 falhas: `npm run build:shared` 0 e `npm run test --workspace @dc360/web`: 43 arquivos, 643 testes, 0 falhas (scratchpad `web.txt`). Inclui os 3 de Toast, `design-system`, `acessibilidade`, o de CRLF (E21) e os 8 de `seguranca-da-conta` (E09). O RESUMO diz 633 testes com 1 falha da E21; a soma atual, com E21 e demais etapas, fecha em zero.
- Entrar a partir de `/` leva à tela do papel: `node test/fluxo.e2e.mjs` em Chromium e Firefox, 70 de 70, zero erro de console, com "entrar a partir de / leva a tela do papel" e "abrir / com a sessao aberta desvia para a tela do papel". Passa da seção 2 (`.indicador`). Sondagem minha (Playwright, scratchpad `probe-e13.mjs`): agente de campo entrando pela raiz cai em `/meu-trabalho`, sem "Esta página não existe", sem erro de console.
- `rotaInterna` recusa `//outro.exemplo`, `https://outro.exemplo`, `/entrar`, `/entrar?x`, `/`, `/?x=1`, `/#t` (sonda via vitest temporário, apagada).
- Portão de acessibilidade ainda reprova `onClick` sem exceção escrita (ver "Tentativas").
- `npm run typecheck` código 0. E2E de API completo, que também cobre o painel real: Chromium e Firefox 271/271. CI 37739535524, 9 de 9 verdes.
- Portão visual: vi `capturas/usuarios-confirmacao-390-escuro.png`: aviso acima da barra do rodapé, sem sobreposição, texto legível.

## Evidência
Scratchpad: `web.txt`, `plantado.txt`, `plantado2.txt`, `e2e-local-chromium.txt`, `e2e-local-firefox.txt`, `e2e-chromium.txt`, `e2e-firefox.txt`, `typecheck.txt`, `probe-e13.mjs`.

## Cenários positivos
Coordenador e agente entram pela raiz e chegam à tela do papel; `/` com sessão desvia pela rota índice; confirmação de gravação aparece em Usuários, Equipes e Órgãos.

## Cenários negativos
- Sem sessão: `/` leva a `/entrar` e nada é concedido; caminho de volta gravado é filtrado na leitura (`estadoDaEntrada`), destino cai em `/painel`.
- Agente de campo digitando `/usuarios`: aviso "Seu perfil não tem acesso a esta tela" (`Exige`), sem formulário de cadastro.
- Sair de propósito não deixa caminho de volta para a pessoa seguinte (caso de teste e e2e).
- Caminho hostil sem sessão (`//outro.exemplo`, `/%5Coutro.exemplo`, `/rota-que-nao-existe`, `/?x=1`): fica na origem, cai em `/entrar`, sem erro.

## Tentativas de reprovar
- Plantei `src/paginas/ZZPlantadoQA.tsx` com `window.setTimeout` sem limpeza e `<div onClick>`. `portoes-de-componente.test.ts` reprovou ("todo setTimeout de componente é cancelado no desmonte", `ZZPlantadoQA.tsx:6`) e `acessibilidade.test.ts` reprovou ("nenhum onClick pendurado...", `:9`). Arquivo apagado; `git status` limpo.
- Segunda planta: marca "acessibilidade: excecao" acima de OUTRO elemento (separado por código) não isenta o `<div onClick>` seguinte (reprovou), e bloco de 4 linhas de comentário contíguo com a marca na primeira isenta (passou), como a etapa pede. O portão não ficou frouxo.
- Filtro de redirecionamento: `//`, esquema, `/entrar` recusados. Variantes `/\outro.exemplo`, `/<TAB>/outro.exemplo`, `/entrar/` e `/entrar#x` PASSAM no filtro (ver achado 2).
- Tentei achar regressão no fluxo A e no modo local: os 70 casos passam nos dois motores.

## Achados
1. CORRIGE ANTES DE CRESCER. `Toast` é montado já com o texto (`{aviso && <Toast role="status">}`). Região viva criada junto com o conteúdo nem sempre é anunciada por leitor de tela; o critério de acessibilidade "confirmações anunciadas por role=status" tem prova só estrutural (atributo presente), não de anúncio. Nenhum leitor de tela foi usado. Dono: F10-E11 (acessibilidade dinâmica, já fora do escopo desta etapa).
2. ANOTADO. `rotaInterna` aceita `/\outro.exemplo` e `/<TAB>/outro.exemplo`, que o navegador leria como `//outro.exemplo`. Não é explorável hoje: `voltarPara` só vem do `location.pathname` interno, que o navegador já normaliza, e o roteador usa `pushState`, que rejeita origem diferente. Vale endurecer o filtro junto com a próxima mexida (ASVS 5.1.5). Sem reprodução de exploração.
3. ANOTADO. O teste "entrar a partir de /" em `sessao-e-entrada.test.ts` lê o fonte (estrutura); o comportamento é provado pelo e2e. Um refactor da rota índice só reprova no e2e.
4. ANOTADO. Limitações declaradas pelo implementador: 320 px, 768 px e zoom 200% não capturados.

Nenhum item bloqueia.

## Não verificado
- Leitor de tela real (NVDA, VoiceOver, TalkBack): nenhum.
- 320 px, 768 px, zoom 200%, WebKit.
- Aprovação humana das seis frases de confirmação e a entrada digitando só o domínio (Rafael).
- `npm run test:e2e` com a API real de produção do fluxo A: o e2e de API completo passou, mas não reli seção por seção.
- Contraste numérico dos dois temas (coberto por teste existente, não re-medido).

## Risco residual
Anúncio de toast por leitor de tela não provado; filtro de redirecionamento aceita barra invertida.

## Motivo do humano
Rafael digita só o domínio, entra e confere a tela do papel; aprova as frases de confirmação. Pendência registrada, não bloqueia o QA.
