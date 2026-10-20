---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E13
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
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

Árvore em `5044e7a` (produto idêntico a `1ed0b71`; só `STATUS.md` e `ESTADO-ATUAL.md` diferem). Node v24.15.0. SCRATCH abaixo é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/qa`.

| Critério (DoD e cinco campos de teste) | Resultado | Prova |
| --- | --- | --- |
| Os 5 casos do painel (3 de Toast, `design-system`, `acessibilidade`) verdes | PASS | `semente-e-confirmacoes.test.ts` 5 de 5, `design-system.test.ts` 12 de 12, `acessibilidade.test.ts` 21 de 21 (`SCRATCH/r6-web-vitest.txt`) |
| Soma do painel em zero (com E09 e E21) | PASS | `npm run test --workspace @dc360/web` código 0, 45 arquivos, 688 de 688, 0 falhas |
| Defeito do `/` provado por teste | PASS | `sessao-e-entrada.test.ts` 31 de 31, inclui "entrar a partir de / leva à tela do papel"; mutações M3 e M4 mordem |
| Defeito do `/` provado por e2e | PASS | `npm run test:e2e` Chromium 70 de 70 e Firefox 70 de 70, código 0, seção 2 "entrar a partir de / leva a tela do papel" e "abrir / com a sessao aberta desvia" (`SCRATCH/r6-e2e-local-chromium.txt`, `r6-e2e-local-firefox.txt`) |
| `fluxo.e2e.mjs` passa da seção 2 (`.indicador`) e o fluxo A segue intacto | PASS | mesmas saídas, todas as seções OK, zero erro de console |
| Confirmações anunciadas por `role=status` | PASS | sonda no navegador: Equipe, Órgão e Usuário cadastrados mostram `.toast[role=status][aria-live=polite]` com a frase, nos dois motores (`SCRATCH/r6-sonda-e13-toast-chromium.txt`, `...-firefox.txt`) |
| Negativo: `rotaInterna` recusa `//outro.exemplo`, `https://outro.exemplo` e `/entrar` | PASS | casos em `sessao-e-entrada.test.ts:280-283` verdes; no navegador, abrir `//outro.exemplo/` e `/entrar` sem sessão termina em `/painel` depois de entrar (`SCRATCH/r6-sonda-e13-chromium.txt`) |
| Negativo: o portão de acessibilidade ainda reprova `onClick` sem exceção escrita | PASS | caso sintético da suíte verde; mutação de controle (um `<div onClick>` numa linha, sem marca) faz o portão reprovar (`SCRATCH/r6-mutacao-e13-gate-controle.txt`) |
| Autorização: operador digitando `/usuarios` continua sem o formulário | PASS | sonda: operador em `/usuarios`, `/organizacao`, `/equipes` e `/orgaos` vê "Seu perfil não tem acesso a esta tela" e zero campos, nos dois motores |
| Rota índice sem sessão leva a `/entrar` e não concede nada | PASS | sonda: `/` sem sessão termina em `/entrar`, zero indicadores, nenhuma chave de token no armazenamento |
| Regressão obrigatória | PASS | vitest do painel código 0; `npm run typecheck` código 0 (`SCRATCH/r6-typecheck.txt`); `paridade-dos-modos.test.ts` 10 de 10 dentro do vitest; `npm run test:e2e` Chromium e Firefox código 0 |

## Evidência

- `npm run test --workspace @dc360/web`, código 0: `SCRATCH/r6-web-vitest.txt`.
- `npm run typecheck`, código 0: `SCRATCH/r6-typecheck.txt`.
- `npm run build --workspace @dc360/web` (modo local), código 0, e `npx vite preview --port 4173`: `SCRATCH/r6-build-web-local.txt`; servidor derrubado no fim.
- `npm run test:e2e`, código 0, 70 de 70: `SCRATCH/r6-e2e-local-chromium.txt`.
- `MOTOR=firefox npm run test:e2e`, código 0, 70 de 70: `SCRATCH/r6-e2e-local-firefox.txt`.
- Sonda de caminho de volta, rota índice e `Exige`: `SCRATCH/sondas/sonda-e13-redirect.mjs`, saídas `SCRATCH/r6-sonda-e13-chromium.txt` e `r6-sonda-e13-firefox.txt`.
- Sonda das confirmações: `SCRATCH/sondas/sonda-e13-toast.mjs`, saídas `SCRATCH/r6-sonda-e13-toast-chromium.txt` e `...-firefox.txt`.
- Mutações (feitas e desfeitas com `git restore`): `SCRATCH/r6-mutacao-e13-raiz.txt`, `r6-mutacao-e13-indice.txt`, `r6-mutacao-e13-gate-controle.txt`, `r6-mutacao-e13-gate-div-sozinho.txt`.

## Cenários positivos

- Abrir só o domínio, entrar como coordenadora: cai em `/painel` ("Painel operacional"), nos dois motores.
- Abrir `/` já com sessão: desvia para `/painel`.
- Link profundo sem sessão (`/ocorrencias?busca=000471`, `/mapa#x`): depois de entrar, volta exatamente para o endereço pedido, com busca e âncora.
- Gravar equipe, órgão e usuário: cada um mostra a frase de confirmação num `role=status`, sem erro de console.

## Cenários negativos

- Caminho de volta `//outro.exemplo/`: recusado, cai em `/painel`.
- Caminho de volta `/entrar`: recusado (sem laço), cai em `/painel`.
- Tentativas de redirecionamento aberto por codificação, que o teste de unidade não cobre: `/%5Coutro.exemplo`, `/%5C%5Coutro.exemplo`, `/%2F%2Foutro.exemplo` e `/%09/outro.exemplo`. O `pathname` chega codificado ao `voltarPara`, a navegação fica na mesma origem (`http://localhost:4173/%5Coutro.exemplo` etc.) e nenhum pedido sai para outro host, nos dois motores.
- Operador em `/usuarios`, `/organizacao`, `/equipes`, `/orgaos`: aviso de perfil sem acesso, zero campos, sem botão do pacote.
- `/` sem sessão: `/entrar`, nenhum dado do painel.
- Órgão com nome vazio: erro de campo, sem confirmação de sucesso nova.

## Tentativas de reprovar

- M3: tirei a recusa de `/`, `/?` e `/#` em `apps/web/src/paginas/entrar-regras.ts:62`. `sessao-e-entrada.test.ts` reprova 1 de 31. Restaurado.
- M4: tirei a rota índice `<Route index ...>` de `apps/web/src/App.tsx`. O mesmo caso reprova. Restaurado.
- Controle do portão de acessibilidade: um `<div onClick={...}>` numa linha, sem a marca, acrescentado dentro de um comentário em `componentes/EmailQuebravel.tsx`: o portão reprova. Restaurado.
- Mesmo elemento com `<div` sozinho na linha (fim de linha LF) e o `onClick` na linha seguinte: o portão PASSA (achado 1). Restaurado.
- Regressão pelo diff `bb0f654..1ed0b71`: o `Toast` agora não é desenhado enquanto há janela modal aberta (`componentes/Toast.tsx`, `modais-abertos.ts`) e `Usuarios.tsx` e `Orgaos.tsx` ganharam `EmailQuebravel`. Conferi que as confirmações de Equipes, Órgãos e Usuários continuam aparecendo com `role=status` no fluxo de gravação (nenhuma delas é disparada com janela aberta) e que o `toast.test.ts` (17 de 17) prende a nova lista de dependências.

## Achados

1. Corrige antes de crescer (herdado da rodada 4, continua): o portão de `acessibilidade.test.ts` não enxerga um elemento cuja tag fica sozinha na linha com fim de linha LF (`elementos()` exige um caractere depois do nome da tag: `/<[a-z][a-zA-Z0-9]*[\s/>]/`). Reprodução: `SCRATCH/r6-mutacao-e13-gate-div-sozinho.txt` (21 de 21 verdes com um `onClick` sem exceção). Não viola o critério da etapa (a leitura do bloco de comentário contíguo e o caso sintético estão certos), mas deixa um buraco no portão.
2. Anotado: rotas desconhecidas codificadas (`/%5C...`) terminam na tela "Esta página não existe" depois de entrar, o que é o comportamento declarado do curinga.

## Não verificado

- Leitor de tela real anunciando as confirmações (conferi o atributo `role=status` e `aria-live=polite`, não a fala).
- WebKit.
- O e2e contra a API não é regressão desta etapa; rodei mesmo assim (Chromium código 0), ver relatório da E11.
- CI do SHA: ausente (H32). Node 22 do `.nvmrc`: rodado em Node 24.15.0.

## Risco residual

Baixo. O filtro de caminho de volta resistiu às variações codificadas que testei; o buraco do portão de acessibilidade com tag sozinha na linha continua e pode deixar passar um `onClick` novo sem teclado.

## Motivo do humano

A etapa pede que Rafael digite só o domínio, entre e chegue à tela do papel, e a aprovação das seis frases de confirmação é dele (texto de produto). Nenhuma das duas coisas é julgamento que eu possa dar no lugar dele.
