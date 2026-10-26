---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E13
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
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

Comandos rodados por mim no SHA `4ce0433` (árvore principal em `3ce67c7`) ou num worktree meu destacado em `4ce0433`. Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L13-qa/saidas/` (abaixo, `saidas/`). A correção 4 não tocou os arquivos da etapa (`git diff bb0f654..4ce0433` vazio em `App.tsx`, `entrar-regras.ts`, `Usuarios.tsx`, `Equipes.tsx`, `Orgaos.tsx`, `componentes/`, `estilos/`, `estado/`).

| Critério | Resultado | Prova |
| --- | --- | --- |
| Positivo: os 5 casos de painel da etapa (3 de Toast, `design-system`, `acessibilidade`) passam | PASS | `npm run test --workspace @dc360/web`: 44 arquivos, 669 de 669, código 0 (`saidas/reg-02-test-web.txt`) |
| Positivo: entrar partindo de `/` leva à tela do papel | PASS | `sessao-e-entrada.test.ts` verde; e2e local seção 2 "entrar a partir de / leva a tela do papel" e "abrir / com a sessao aberta desvia para a tela do papel" |
| Positivo: `fluxo.e2e.mjs` passa da seção 2 (`.indicador`) | PASS | `npm run test:e2e` (Chromium) e `MOTOR=firefox npm run test:e2e`: "Passou: 70 Falhou: 0", zero erro de console, código 0 nos dois (`saidas/e2e-04-local-chromium.txt`, `saidas/e2e-05-local-firefox.txt`) |
| Negativo: `rotaInterna` recusa `//outro.exemplo`, `https://outro.exemplo` e `/entrar` | PASS | casos de `sessao-e-entrada.test.ts`; mutações E13-M2 e E13-M3 reprovam |
| Negativo: o portão de acessibilidade ainda reprova um `onClick` sem exceção escrita (caso sintético) | PASS com achado | o caso sintético existe e passa; mas o portão não enxerga a tag de abertura sozinha na linha em checkout LF (achado A1) |
| Autorização e isolamento: operador digitando `/usuarios` continua sem o formulário (`Exige`); rota índice sem sessão leva a `/entrar` e não concede nada | PASS | sonda Playwright minha no build local, Chromium e Firefox: "/ sem sessão -> /entrar; indicadores visíveis: 0"; "operador em /usuarios -> aviso: 1", e o único formulário na página é a busca global do topo (`saidas/e13-01-sonda-autorizacao-rota-indice.txt`) |
| Regressão: `npm run typecheck` | PASS | código 0 (`saidas/reg-04-typecheck.txt`) |
| Regressão: `apps/web/test/paridade-dos-modos.test.ts` | PASS | 10 de 10 |
| Regressão: `npm run test:e2e` em Chromium e Firefox, fluxo A intacto | PASS | 70 de 70 nos dois motores (seções 4 e 5: registrar ocorrência, protocolo pelo banco, triagem, despacho, encerramento) |
| DoD: defeito do `/` provado por teste e por e2e | PASS | sem a rota índice e sem a recusa de `/` em `rotaInterna`, o mesmo e2e cai em "waiting for locator('.indicador') to be visible", código 1 (`saidas/e2e-06-local-chromium-SEM-o-conserto-da-raiz.txt`); a mutação só de `rotaInterna` ou só da rota índice reprova `sessao-e-entrada.test.ts` |
| DoD: soma do painel em zero (com E09 e E21) | PASS | 669 de 669, 0 falhas |

## Evidência

- `npm run test --workspace @dc360/web`: código 0.
- `npm run typecheck`: código 0.
- Build local do painel no worktree (`npm run build` sem `VITE_API_URL`), `npx vite preview --port 4173`, `npm run test:e2e` e `MOTOR=firefox npm run test:e2e`: código 0 nos dois. Preview derrubado ao fim.
- Mutações no worktree (`mutacoes/generico.mjs`), cada uma restaurada, saídas em `saidas/e11-e13-mutacoes/`.

## Cenários positivos

- Os quatro papéis caem na tela inicial a partir de `/` (rota índice com `telaInicial`).
- Confirmação de gravação por `<Toast tom="sucesso">` em Usuários, Equipes e Órgãos.
- Raio da marca por token em `.lateral__marca img`.
- Sair de propósito não deixa caminho de volta para a pessoa seguinte.

## Cenários negativos

| Mutação (worktree) | Teste | Resultado |
| --- | --- | --- |
| E13-M1 `rotaInterna` volta a aceitar `/` | `sessao-e-entrada.test.ts` | 1 falha, código 1 |
| E13-M2 `rotaInterna` aceita `//` | idem | 1 falha |
| E13-M3 `rotaInterna` aceita `/entrar` | idem | 1 falha |
| E13-M5 sem a rota índice em `App.tsx` | idem | 1 falha |
| E13-M6 saída voluntária volta a guardar o caminho | idem | 1 falha |
| E13-M4 `Usuarios.tsx` sem o `<Toast>` | `semente-e-confirmacoes.test.ts` | 1 falha |
| E13-M8 `borderRadius: "8px"` à mão de volta na marca | `design-system.test.ts` | 1 falha |
| Sem os dois consertos da raiz, build novo | `npm run test:e2e` | para na seção 2 (`.indicador`), código 1 |
| E13-M7 tirar a marca "acessibilidade: excecao" de `Modal.tsx` | `acessibilidade.test.ts` | 21 de 21 VERDE (achado A1) |

## Tentativas de reprovar

1. Tirei a exceção escrita do fundo do `Modal.tsx`, que é exatamente o caso que motivou a mudança do portão: o portão continuou verde (E13-M7). Causa: `elementos()` em `apps/web/test/acessibilidade.test.ts:280` só reconhece a abertura de tag com `/<[a-z][a-zA-Z0-9]*[\s/>]/`, e o fundo do modal abre com `<div` sozinho na linha (`Modal.tsx:260`). Em checkout LF (este Mac, e o Linux do CI) não há caractere depois de `div`, e o elemento nunca é examinado. Em CRLF (Windows, onde a etapa foi feita) o `\r` casa com `\s`: com o mesmo Modal sem a marca em CRLF, o portão reprova (`E13-M11-modal-sem-marca-em-CRLF-portao-original.txt`, 1 falha). Com a expressão corrigida para aceitar fim de linha, o portão vê o Modal e lê o bloco de comentário certo: com a marca passa (E13-M9, 21 de 21; nenhum outro elemento escondido aparece) e sem a marca reprova (E13-M10, "componentes/Modal.tsx:260").
2. Procurei elementos com `onClick` escondidos pela mesma falha: com a expressão corrigida (E13-M9) nenhum outro aparece, então hoje o painel não tem violação escondida.
3. Tentei abrir `//outro.exemplo` no painel: o navegador fica na mesma origem; o `voltarPara` vem do estado da navegação, não da URL, e não é controlado por link.
4. Conferi a rota índice sem sessão e o operador em `/usuarios` em dois motores (sonda acima).

## Achados

- A1 (corrige antes de crescer): o portão "nenhum onClick pendurado em elemento que o teclado não alcança" é cego, em checkout LF, a toda tag não interativa cuja abertura está sozinha na linha (`<div` seguido de quebra). Reprodução: em `apps/web/src/componentes/Modal.tsx:254`, apagar "acessibilidade: excecao" e rodar `npx vitest run test/acessibilidade.test.ts` em `apps/web`: 21 de 21 verde. Conserto: `/<[a-z][a-zA-Z0-9]*([\s/>]|$)/` em `acessibilidade.test.ts:280`, provado verde hoje e vermelho sem a marca. A regex é anterior à etapa e a etapa não a mudou, mas a etapa declarou ter consertado o caso do Modal e o RESUMO diz que o portão "lê o comentário inteiro"; no LF o caso passa porque o elemento nem é lido. Não decide o critério: o caso sintético pedido existe e reprova, e não há violação escondida hoje. Dono sugerido: F10-E11 (acessibilidade dinâmica) ou a própria E13 numa correção pequena.

Motivo do veredito da rodada 4: PASS das quatro dimensões; pendente só a aprovação das seis frases de confirmação pelo Rafael. Nada a consertar pela correção 4; nada regrediu (669 de 669, e2e local 70 de 70 nos dois motores, mutações mordem, exceto o achado A1, que é novo desta rodada).

## Não verificado

- Leitor de tela real anunciando o `role="status"` (a etapa pede o papel no DOM, provado pelo teste; o anúncio é validação humana ou de acessibilidade).
- 320 px, 768 px e zoom de 200% (declarado pela etapa como não capturado).
- CI do SHA: ausente nesta sessão.

## Risco residual

Até o conserto do A1, um `onClick` novo em `<div` multilinha sem teclado entra verde no CI (Linux) e só seria pego numa máquina Windows com CRLF.

## Motivo do humano

A etapa pede que Rafael digite só o domínio, entre e chegue à tela do papel, e que aprove as seis frases de confirmação ("Usuário cadastrado. Ele já aparece na lista abaixo." e as irmãs): texto de produto e uso real, não decidíveis por teste.
