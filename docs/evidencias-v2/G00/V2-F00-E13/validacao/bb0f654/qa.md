---
validador: qa (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E13
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
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

Matriz da Definition of Done e dos cinco campos de teste, cada um provado por execução nesta sessão, no SHA bb0f654 (árvore em 0290af5, que só difere em STATUS e ESTADO-ATUAL; `git status` sem mudança em `dc360/`).

| Critério da etapa | Como foi provado | Resultado |
| --- | --- | --- |
| DoD: os 5 casos do painel desta etapa verdes (3 de Toast em `semente-e-confirmacoes`, `design-system`, `acessibilidade`) | vitest do painel inteiro (saída 02) | 44 arquivos, 665 de 665, código 0; `semente-e-confirmacoes` 5 de 5, `design-system` 12 de 12, `acessibilidade` 21 de 21 |
| DoD: soma do painel em zero (com E09 e E21) | idem | 0 falha em 665 |
| DoD: defeito do `/` provado por teste e por e2e | `sessao-e-entrada.test.ts` (27 de 27), e2e local seção 2 em Chromium e Firefox (saídas 09 e 10), sonda própria no navegador contra a API real (saídas 16 e 17) e no modo local (saída 22) | verde nos dois motores, nos quatro papéis |
| Positivo: entrar partindo de `/` leva à tela do papel | sonda 16 e 17: administradora, coordenadora e operador caem em `/painel`, agente em `/meu-trabalho`; `/` com sessão aberta desvia para a mesma tela | 4 de 4 papéis, Chromium e Firefox |
| Positivo: `fluxo.e2e.mjs` passa da seção 2 | `node test/fluxo.e2e.mjs` e `MOTOR=firefox` (saídas 09 e 10) | 70 de 70 em cada motor, zero erro de console, código 0 |
| Negativo: `rotaInterna` recusa `//outro.exemplo`, `https://outro.exemplo` e `/entrar` | unitário (`sessao-e-entrada.test.ts`) e sonda no navegador forjando `history.state.usr.voltarPara` antes de entrar (sondas 16 e 17) | `//outro.exemplo/x`, `https://outro.exemplo/`, `javascript:alert(1)`, `/entrar` e `/` caem em `/painel` na própria origem; `/ocorrencias` legítimo é respeitado |
| Negativo: o portão de acessibilidade ainda reprova `onClick` sem exceção escrita | caso sintético em `acessibilidade.test.ts` (21 de 21 verdes, incluídos os casos de marca solta e bloco com código no meio) | verde |
| Autorização: operador digitando `/usuarios` continua sem o formulário | sonda 16 e 17 | sem `#usuario-nome`, nos dois motores |
| Autorização: a rota índice sem sessão leva a `/entrar` e não concede nada | sonda 16 e 17, quatro contextos limpos | `/` sem sessão sempre termina em `/entrar` |
| Acessibilidade: confirmações anunciadas por `role=status` | sonda 16 e 17: gravação real em Usuários, Equipes e Órgãos contra a API | `.toast[role=status]` com "Usuário cadastrado. Ele já aparece na lista abaixo.", "Equipe criada. Ela já aparece na lista abaixo.", "Órgão cadastrado. Ele já aparece na lista abaixo.", nos dois motores |
| Regressão: `typecheck`, `paridade-dos-modos`, `npm run test:e2e` | `paridade-dos-modos` 10 de 10 dentro da saída 02; e2e local nas saídas 09 e 10; typecheck medido pelo gatekeeper (código 0), não repetido aqui | verde |
| O teste morde | mutação: retirar de `rotaInterna` a recusa de `/` (saída 20) | 1 falha ("entrar a partir de / leva à tela do papel"), restaurado com `git restore` |

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/qa-E09-E10-E13/`:

- `00-build-shared.txt`: `npm run build:shared`, código 0.
- `02-test-web.txt`: `npm run test --workspace @dc360/web`, 44 arquivos, 665 testes, 0 falha, código 0.
- `03-test-isolamento.txt`: `npm run test:isolamento`, 345 aprovados e 3 pulados, código 0 (preservação do isolamento).
- `04-e2e-api-chromium.txt` e `05-e2e-api-firefox.txt`: `node scripts/e2e-api.mjs chromium|firefox`, suíte principal 288 de 288 e geometria 64 de 64 em cada motor, zero erro de console, código 0 (regressão das telas tocadas pela E13 contra a API).
- `08-build-web-local.txt`: build do painel no modo local, código 0.
- `09-e2e-local-chromium.txt` e `10-e2e-local-firefox.txt`: `node test/fluxo.e2e.mjs` com `vite preview` na 4173, 70 de 70, zero erro de console, código 0 em cada motor.
- `16-sonda-navegador-chromium.txt` e `17-sonda-navegador-firefox.txt`: `sonda-navegador.mjs` (Playwright, painel construído com `VITE_API_URL` para uma API própria da sonda na 3791, PGlite semeado), 53 conferências OK em cada motor, código 0. A primeira execução (`16a-...-primeira.txt`) parou na parte da E10 por um erro da PRÓPRIA sonda (esperava a frase antes de enviar o formulário); corrigida a sonda, a segunda passou inteira.
- `20-mutacao-e13-raiz.txt`: mutação e restauração.
- `22-sonda-modo-local.txt`: modo local, Chromium e Firefox, entrar pela raiz cai em `/painel`, zero erro de console.
- `18-indices-byte-a-byte.txt`: `INDEX.md` da E13, 61 linhas, 61 batem byte a byte no SHA bb0f654 e na árvore; `node scripts/conferir-indices-de-evidencia.mjs` resultado OK.

## Cenários positivos

- Quatro papéis entram a partir de `/` em contexto limpo e caem na tela do papel; `/` com sessão aberta desvia para a mesma tela (Chromium e Firefox, API real; Chromium e Firefox, modo local).
- `voltarPara` legítimo (`/ocorrencias`) continua levando de volta para a tela pedida.
- Gravar em Usuários, Equipes e Órgãos mostra o aviso passageiro com `role=status` e a frase do que aconteceu.
- e2e local inteiro (fluxo A incluído) 70 de 70 nos dois motores.

## Cenários negativos

- `/` sem sessão nunca concede tela: termina em `/entrar` (4 contextos por motor).
- `voltarPara` forjado no estado da navegação: `//outro.exemplo/x`, `https://outro.exemplo/`, `javascript:alert(1)`, `/entrar`, `/` são descartados e a pessoa cai em `/painel` na origem do painel.
- Operador em `/usuarios` não recebe o formulário.
- Portão estático de acessibilidade: marca de exceção solta no código e bloco com código no meio continuam reprovando (casos sintéticos verdes).

## Tentativas de reprovar

1. Forjei `history.state.usr.voltarPara` com sete valores hostis antes de entrar, em Chromium e Firefox. Nenhum saiu da origem. O valor `/\outro.exemplo` passa por `rotaInterna` (não começa com `//`) e leva a `http://localhost:4791/outro.exemplo` (tela "Esta página não existe" do próprio painel): não é redirecionamento aberto, ver Achados.
2. Mutação na recusa de `/` em `rotaInterna`: o teste unitário reprova (prova de mordida, restaurado).
3. Rodei os dois e2e (local e contra a API) nos dois motores, porque a rodada 3 não tinha Firefox no Mac; agora `firefox-1538` está instalado e passou.
4. Procurei regressão do diff `52952a1..bb0f654` (que toca `auth/servico.ts`, `auth/tokens.ts`, `rotas/segundo-fator.ts`, `servidor.ts` e `MeuTrabalho.tsx`) no caminho de entrada: o login passou a abrir a sessão sob `comTenant` com releitura da credencial; os quatro papéis entram e chegam à tela do papel, e a tela "Meu trabalho" do agente abre sem erro de console.
5. Conferi as confirmações fora do e2e (o e2e não grava Equipes nem Órgãos): gravei pela interface real nas três telas.

## Achados

- **Anotado (baixo, não quebra critério):** `rotaInterna` (`apps/web/src/paginas/entrar-regras.ts`) aceita `voltarPara` com barra invertida (`/\outro.exemplo`). Reprodução: em `/entrar`, `history.replaceState({usr:{voltarPara:"/\\outro.exemplo"},key:"x",idx:0},"","/entrar")`, recarregar e entrar: o painel fica em `http://localhost:4791/outro.exemplo`, na própria origem, tela de página inexistente. Como o valor só vem do estado interno da navegação, não há vetor externo; a recusa de `\` deixaria a regra coerente com o comentário ("fecha de vez a porta de um destino externo").
- **Anotado:** os `INDEX.md` de subpasta (`saidas/baseline/INDEX.md`) não constam do `INDEX.md` da etapa; é a convenção do gerador, não divergência.

## Não verificado

- 320 px, 768 px e zoom de 200 por cento nas telas desta etapa (o próprio RESUMO declara; não medi).
- WebKit nesta sessão (rodei Chromium e Firefox).
- Leitor de tela real anunciando o `role=status` (só atributo e presença no DOM).
- Postgres 17: a sonda própria usou PGlite; o e2e também. Prova em 17 é do CI, que não foi lido.
- `npm run typecheck` não foi repetido por mim (o gatekeeper o mediu em código 0 nesta rodada).
- CI do SHA: não lido (ver `ci_run`).

## Risco residual

Baixo. A regra da entrada é pura e testada; a rota índice está dentro do grupo protegido. O que sobra é cosmético (barra invertida em `voltarPara`) e as larguras e o leitor de tela não medidos.

## Motivo do humano

A etapa pede validação humana: Rafael digita só o domínio, entra e confere que chega à tela do papel, e aprova as seis frases de confirmação ("Usuário cadastrado. Ele já aparece na lista abaixo." e as irmãs), que são texto de produto (seção 4 de `28`). O comportamento em si está provado por execução.
