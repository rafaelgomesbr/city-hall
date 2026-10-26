---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E13
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [UI, A11Y, AUTH]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

SCRATCH abaixo é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-qa-e09a13`. Árvore em `55209ab` (produto idêntico a `fd17ff4`). O diff `1ed0b71..fd17ff4` toca arquivos desta etapa ou vizinhos dela: `Usuarios.tsx` (as duas janelas passaram a usar `EmailQuebravel`), `estilos/app.css` (`scroll-padding-top` e `scroll-margin-top` no celular, regra da dica da janela), `componentes/foco.ts` (`preventScroll` mais `scrollIntoView`) e `layout-estreito.e2e.mjs`. Procurei regressão nisso.

| Critério (DoD e cinco campos de teste) | Resultado | Prova |
| --- | --- | --- |
| Os 5 casos do painel (3 de Toast, `design-system`, `acessibilidade`) verdes | atende | `semente-e-confirmacoes.test.ts` 5 de 5, `design-system.test.ts` 12 de 12 (o `app.css` novo só usa tokens), `acessibilidade.test.ts` 21 de 21 (`SCRATCH/01-test-web.txt`) |
| Soma do painel em zero | atende | `npm run test --workspace @dc360/web` código 0, 46 arquivos, 699 de 699 |
| Defeito do `/` provado por teste | atende | `sessao-e-entrada.test.ts` 31 de 31, inclui o caso de `voltarPara: "/"` |
| Defeito do `/` provado por e2e; `fluxo.e2e.mjs` passa da seção 2 e o fluxo A segue intacto | atende | `node test/fluxo.e2e.mjs` contra o painel em modo local: Chromium 70 de 70 e Firefox 70 de 70, código 0, zero erro de console (`SCRATCH/70-e2e-local-chromium.txt`, `70-e2e-local-firefox.txt`) |
| Confirmações anunciadas por `role=status` | atende | sonda nos dois motores: equipe criada, órgão cadastrado e usuário cadastrado mostram `.toast[role=status][aria-live=polite]` com a frase; órgão vazio mostra erro de campo e nenhuma confirmação (`SCRATCH/72-sonda-e13-toast-chromium.txt`, `...-firefox.txt`) |
| Negativo: `rotaInterna` recusa `//outro.exemplo`, `https://outro.exemplo` e `/entrar` | atende | casos de `sessao-e-entrada.test.ts` verdes; no navegador (`SCRATCH/71-sonda-e13-redirect-chromium.txt` e `-firefox.txt`, iguais): `/` e `//outro.exemplo/` terminam em `/painel`; `/entrar` sem sessão termina em `/painel`; `/%5Coutro.exemplo`, `/%5C%5C...`, `/%2F%2F...` e `/%09/...` ficam no próprio domínio (tela de página inexistente); zero pedido para fora em todos |
| Negativo: o portão de acessibilidade ainda reprova `onClick` sem exceção escrita | atende | caso sintético de `acessibilidade.test.ts` verde (21 de 21) |
| Autorização: operador digitando `/usuarios` continua sem o formulário; rota índice sem sessão leva a `/entrar` e não concede nada | atende | sonda (`71`): operador em `/usuarios`, `/organizacao`, `/equipes` e `/orgaos` vê "Seu perfil não tem acesso a esta tela", zero campos, zero botão de pacote; `/` sem sessão termina em `/entrar`, zero indicadores, só as chaves de tema e de semente no armazenamento |
| Regressão obrigatória | atende | painel 699 (`01`); `npm run typecheck` código 0 rodado pelo gatekeeper neste SHA; `paridade-dos-modos.test.ts` 10 de 10; `test:e2e` Chromium e Firefox código 0 (`70`) |
| Validação humana (Rafael digita só o domínio e chega à tela do papel) | pendente | fora do alcance do validador |

## Evidência

- `npm run test --workspace @dc360/web`: código 0 (`SCRATCH/01-test-web.txt`).
- Painel em modo local construído com `npx vite build --outDir SCRATCH/dist-web-local` (código 0, `SCRATCH/21-build-web-local.txt`, para não tocar no `dist` da árvore) e servido por `npx vite preview --outDir ... --port 4173`; servidor derrubado no fim.
- `MOTOR=chromium node test/fluxo.e2e.mjs` e `MOTOR=firefox node test/fluxo.e2e.mjs` em `apps/web`: código 0, 70 de 70 cada (`SCRATCH/70-...`).
- Sondas (de outro validador da rodada 6, relidas e reaproveitadas): `SCRATCH/sondas/sonda-e13-redirect.mjs`, `sonda-e13-toast.mjs`; saídas `71-*` e `72-*`, código 0.
- Regressão do foco nas telas desta etapa contra a API real, nos três motores: `SCRATCH/sondas/sonda-foco-e09.mjs`, saídas `40-sonda-foco-chromium.txt`, `41-sonda-foco-firefox.txt`, `41-sonda-foco-webkit.txt` (Usuários e as janelas).

## Cenários positivos

- Entrar a partir de `/` leva à tela do papel (dois motores); caminho de volta interno com busca e âncora preservado.
- Gravar equipe, órgão e usuário anuncia a confirmação por `role=status`.

## Cenários negativos

- Caminhos de volta para fora do domínio, inclusive com barra invertida, barra codificada e tabulação codificada: nenhum sai do domínio.
- Operador em telas de administração: sem formulário.
- `/` sem sessão: `/entrar`, nada concedido.

## Tentativas de reprovar

1. Procurei regressão do diff em `Usuarios.tsx`: na janela "Redefinir senha" a linha continua dizendo matrícula, email inteiro e papel nos três motores (o `<wbr>` do `EmailQuebravel` não altera o texto), e fechar a janela com Escape devolve o foco a um elemento, não a BODY (`40`, `41-*`).
2. O `scroll-padding-top` novo do celular poderia esconder o campo focado em Usuários ou Nova ocorrência: medi a 390x700 nos três motores, campo focado à vista e abaixo do topo fixo.
3. Cadastro de usuário vazio e com email inválido por Enter (o formulário da etapa, com o Toast): foco no primeiro campo inválido nos três motores.
4. Variações de barra e de codificação no caminho de volta além das três do roteiro.

## Achados

1. **anotado.** Mesmo achado registrado na E09, que também aparece aqui porque a entrada é desta etapa: a primeira tela de entrada deixa o foco em BODY depois da senha errada, nos três motores (frase com `role="alert"`, anunciada). Fora do que a E13 pede; dono natural F10-E11.

Nenhum achado que bloqueia.

## Não verificado

- `test:e2e` (modo local) no WebKit: a etapa pede Chromium e Firefox.
- Leitor de tela real ouvindo o Toast: só pelo atributo.
- Mutação para provar que os testes mordem: não refeita (edição da árvore recusada pelo ambiente); a rodada 6 registrou quatro mutações que mordem, e os arquivos da rota índice e do portão não mudaram desde então.
- Os logs do run 39420436042 (exigem token).

## Risco residual

`rotaInterna` continua sendo o único filtro de redirecionamento aberto do painel; caso novo de codificação que o navegador normalize de outro jeito exigiria caso novo em `sessao-e-entrada.test.ts`.

## Motivo do humano

A etapa pede que Rafael digite só o domínio, entre e chegue à tela do papel, e o aceite das frases das confirmações é dele.
