# V2-F00-E19, correção 1: a exceção do CP-03 precisa de motivo, dono e prazo, e o portão reprova sem eles

Base: `39051f7`, ramo `v2/f00`. Motivo: rodada 1 reprovada (QA e Infra e CI FAIL no SHA `7005a60`).

## Fatos

**O defeito provado.** `scripts/auditar.mjs` só olhava o prazo (`ate`) das exceções de `ACEITAS_NO_APLICATIVO` com `ate < hoje`. Com `ate` ausente ou inválido, `undefined < hoje` é falso: a exceção passava com saída 0. Prova do estado anterior (`saidas/01-auditar-test-ANTES.txt`): uma cópia do portão com a exceção de `node-forge` sem `ate` sai 0 imprimindo `aceita: node-forge (dono Rafael, até undefined)`. A exceção VENCIDA já reprovava antes (saída 1, mensagem "o prazo da exceção venceu"); o teste do ANTES falha só porque a mensagem nova é outra (`venceu em AAAA-MM-DD`). Dono ausente e motivo ausente também passavam, e não havia nenhum teste de prazo.

**O conserto.**

- Nova função pura `problemasDasExcecoes(aceitas, hoje)` em `dc360/scripts/auditar-excecoes.mjs` (arquivo novo, onde a lista `ACEITAS_NO_APLICATIVO` passou a morar, porque `auditar.mjs` roda o portão ao ser importado). Reprova, com uma frase por defeito e o nome do pacote: sem motivo ou motivo em branco; sem dono ou dono em branco; sem prazo; prazo que não seja AAAA-MM-DD ou que não exista no calendário (`2027-02-30`, `2027-13-01`, `05/01/2027`, número, `null`); e prazo vencido (`ate < hoje`; vale até o fim do dia escrito). Olha TODAS as entradas da lista, não só as que aparecem no relatório de hoje.
- `auditar.mjs` chama a função ANTES de qualquer auditoria e sai 1 com a lista de defeitos; o bloco antigo de "vencidas" foi absorvido por ela. Nada mais mudou no portão (runtime, advisory nova e aceita com correção seguem iguais).
- Não houve mudança de dependência, de `package.json` nem de lockfile. Não rodei `npm audit fix`.

**Testes** (`dc360/scripts/auditar.test.mjs`, de 7 para 20; 13 novos). Sem prazo, prazo inválido (9 formas), sem dono (4 formas), sem motivo (3 formas), vencida, vence hoje (passa), válida (passa), defeitos acumulados, a lista REAL válida; e 4 de ponta a ponta que rodam uma CÓPIA do portão com a lista adulterada (sem prazo, sem dono, vencida em 2020-01-01, mais um controle sem adulteração que passa), para provar que a validação está ligada ao `exit 1`.

| Saída | Antes | Depois |
| --- | --- | --- |
| `node --test scripts/auditar.test.mjs` (`01` e `02`) | 20 testes, 12 passam e 8 FALHAM (sem prazo, prazo inválido, sem dono, sem motivo, defeitos acumulados e as 3 cópias adulteradas) | 20 de 20 |

O "antes" foi medido com o módulo novo contendo a regra antiga (só `ate < hoje`) e o `auditar.mjs` já separado: é o comportamento anterior reproduzido, não o arquivo do commit `39051f7` literal.

**`npm run auditar` de verdade** (`03`): termina com código 0 no Windows, sem o ENOENT que o STATUS registrava (o `shell: true` no Windows, já no script, resolveu). Runtime 0; desenvolvimento 3 (aviso); aplicativo de campo 55, as seis exceções aceitas. A lista atual foi conferida (`09`): as seis exceções (`decode-uri-component`, `brace-expansion`, `braces`, `node-forge`, `shell-quote`, `sprintf-js`) têm dono Rafael, prazo 2027-01-05 e motivo escrito; `problemasDasExcecoes` devolve lista vazia.

**`expo-doctor`** (`04`): `npx expo-doctor` em `dc360/apps/campo` dá **20 de 21**, código 1. A única verificação que falha é "Check that packages match versions required by installed Expo SDK", por seis pacotes um patch atrás: `expo` 57.0.27 (esperado ~57.0.28), `expo-crypto` 57.0.3 (~57.0.4), `expo-location` 57.0.20 (~57.0.21), `expo-router` 57.0.25 (~57.0.26), `expo-splash-screen` 57.0.9 (~57.0.10), `jest-expo` 57.0.5 (~57.0.6). Deriva externa: o baseline Linux de 2026-10-08 deu 21 de 21. Nenhum pacote foi atualizado. Registrado em `dc360/apps/campo/PENDENCIAS.md`, item 17, com dono Rafael e o comando para fechar. **O critério "expo-doctor 21 de 21" da E19 e do gate G00 fica BLOQUEADO por isso** até alguém subir os seis patches (ou o gatekeeper e o Rafael aceitarem o 20 de 21 como risco registrado; não é decisão do implementador).

**Regressão.**

- `npm run test:scripts` (`05`): 230 testes, 226 passam, 0 falham, 4 pulados por ambiente (eram 217 com 7 em `auditar.test.mjs`; +13). `scripts/baseline.mjs` ganhou `"V2-F00-E19": 20` na tabela de etapas seguintes; `baseline.test.mjs` 16 de 16 (`05b`). O total esperado do passo `test-scripts` passa a 226 e o real é 230: a diferença de 4 vem de testes de outras etapas que também não foram registrados na tabela (anterior a esta correção; não mexi).
- `npm run typecheck` (`06`): código 0. `npm run conferir:numeros` (`07`): 24 afirmações, nenhuma divergência (a contagem de `test:scripts` não é afirmada em documento). Portão de conteúdo (`08`): 8 de 8.
- Não toquei banco, API nem autorização: `test:isolamento` não se aplica.

**Limitações.** O CI (Linux) não foi rodado; `npm run auditar` foi medido só no Windows. O vencimento real por relógio não é testado (a função recebe `hoje`, e o teste ponta a ponta usa prazo no passado). Os arquivos `scripts/auditar.mjs` e `scripts/auditar-excecoes.mjs` estão em CRLF na árvore (o índice normaliza para LF).

Arquivos: `dc360/scripts/auditar.mjs`, `dc360/scripts/auditar-excecoes.mjs` (novo), `dc360/scripts/auditar.test.mjs`, `dc360/scripts/baseline.mjs`, `dc360/apps/campo/PENDENCIAS.md`. Patch em `diff-da-correcao.patch`.

## Justificativa

O CP-03 (Rafael, 2026-10-07) aceita advisory do Expo "com motivo, dono e prazo", e diz que prazo vencido reprova. Uma política que o código só cumpre quando a pessoa lembra de escrever o campo é um comentário, não um portão: bastava apagar `ate` para a exceção virar eterna, e o item 7 da seção 7 de `28` só admite exceção pela política do CP-03. Por isso a validação cobre a lista inteira, roda antes de tudo e tem teste de ponta a ponta (a função pura sozinha poderia existir sem estar ligada). O módulo separado existe só para a função ser testável sem executar o portão; não muda a política.

O `expo-doctor` não foi "consertado" de propósito: subir seis patches do Expo mexe na árvore que o CP-03 mandou não reembaralhar e exige rodar a suíte do aplicativo e o prebuild. Esconder o 20 de 21 (o CI já pula essa checagem, documentado) seria o erro inverso. Fica pendência nomeada, com dono e comando, e a decisão sobre o critério é de quem valida e do Rafael.
