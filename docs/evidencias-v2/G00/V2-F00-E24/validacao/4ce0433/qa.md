---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E24
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: []
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Comandos rodados por mim no SHA `4ce0433` (árvore principal em `3ce67c7`, que só difere em `STATUS.md` e `ESTADO-ATUAL.md`). Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L13-qa/saidas/` (abaixo, `saidas/`).

| Critério | Resultado | Prova |
| --- | --- | --- |
| Teste negativo da própria etapa (`correcao-2/verificar-ressalvas.mjs`): nenhuma frase de acompanhar quem está em campo sem "em construção" | FAIL | `node docs/evidencias-v2/G00/V2-F00-E24/correcao-2/verificar-ressalvas.mjs` na raiz: "11 ocorrência(s) conferida(s), 1 sem a ressalva", código 1; a ocorrência é `dc360/docs/PAPEIS_E_RESPONSABILIDADES.md:209`, "\| Acompanhar quem está em campo agora \| sim \| não \| sim \| sim \|" (`saidas/e24-01-verificar-ressalvas.txt`). A evidência da etapa registrou 9 ocorrências, 0 sem ressalva, código 0 |
| DoD: nenhum documento promete a declaração no app sem ressalva | FAIL pelo padrão da própria etapa | a linha nova da matriz de papéis, acrescentada pela correção 4 da E22 (`4ce0433`), afirma que o operador "acompanha quem está em campo agora" sem a ressalva que a correção 2 desta etapa exigiu e pôs na linha equivalente da matriz da apresentação do Alyson ("Acompanhar quem está em campo (em construção)") |
| Positivo: Grep final sem frase que afirme que o aplicativo declara a saída sem a ressalva | PASS (fora a linha acima) | grep por "quem está em campo", "saída a campo", "saída declarada", "declarar a saída", "retorno não confirmado", "prazo estourado", "sobe o morro" em `dc360/README.md`, `dc360/docs/*.md`, apresentações e `relatorio-apresentacao-alyson.html`: todas as demais ocorrências estão sob quadro "Estado atual" ou "Estado em 07/10/2026", no futuro, ou com "em construção" |
| Positivo: `regras-de-conteudo` verde | PASS | `packages/shared` 185 de 185, `regras-de-conteudo.test.ts` 10 de 10 (`saidas/reg-03-shared.txt`) |
| Positivo: PDF regenerado com o selo novo | PASS | texto extraído do PDF versionado (pypdf): 24 páginas, "Segurança do agente sozinho Parcial ... O aplicativo do agente ainda não declara a saída", a linha do operador com "(em construção: ... V2-F14-E01)", 0 travessão (`saidas/e24-02-pdf-conferencia.txt`); HTML e PDF no mesmo commit (`3ed4fb6`) |
| Negativo: nenhum "Pronto" na linha de segurança do agente | PASS | `2026-09-15-para-o-alyson.html:394` com `p-parcial`; PDF idem |
| Negativo: nenhum passo do cartão manda declarar a saída no aplicativo | PASS | `CARTAO-DO-AGENTE.md` passos 2 e "Ao voltar": "AVISE A COORDENAÇÃO", "O aplicativo ainda não registra a sua saída"; a correção 4 da E22 só mudou a linha "A tarefa sumiu da lista" |
| Negativo: as 27 provas da API e do painel seguem verdes | PASS | `saida-a-campo.test.ts` 27 de 27, `saida-nao-declara-inexistente.test.ts` 11 de 11, `quem-esta-em-campo.test.ts` 4 de 4 |
| Regressão: `npm test` | PASS | rodado por workspace: shared 185, campo 231, API 1451 (34 pulados, Postgres real), console 259, painel 669, banco 345 (3 pulados), todos código 0 |
| Regressão: `npm run test:api` (`saida-a-campo.test.ts`) | PASS | acima |
| Estado real conferido no código | PASS | `apps/campo/src` só cita `/saida-a-campo` num comentário (`dados/api.ts:518`); a API mantém `POST /`, `/prorrogar`, `/retorno`, `GET /`, `/minha` |
| CP-02 registrado | PASS | `docs/evidencias-v2/CP-02/decisao.md` presente (D-25 como premissa) |

## Evidência

- `node docs/evidencias-v2/G00/V2-F00-E24/correcao-2/verificar-ressalvas.mjs` no SHA: código 1 (`saidas/e24-01-verificar-ressalvas.txt`).
- O mesmo guarda sobre os cinco documentos tirados de `bb0f654` (rodada 4): "9 ocorrência(s) conferida(s), 0 sem", código 0; sobre os de `4ce0433`: "11, 1 sem", código 1 (`saidas/e24-03-guarda-em-bb0f654.txt`, `saidas/e24-03-guarda-em-4ce0433.txt`). A regressão nasce entre a rodada 4 e esta, no commit `4ce0433` (único commit no intervalo que toca `PAPEIS_E_RESPONSABILIDADES.md`).
- Conserto possível sem quebrar a trava da tabela: com as células do operador, coordenador e administrador como "sim (em construção)", `packages/shared/test/permissoes-no-readme.test.ts` fica 10 de 10 (o teste só lê se a célula começa com "não") e o guarda da E24 volta a "11, 0 sem", código 0 (`saidas/e24-04-conserto-possivel-teste-da-tabela.txt`; feito no meu worktree e desfeito).
- Extração do PDF: `saidas/e24-02-pdf-texto.txt` e `saidas/e24-02-pdf-conferencia.txt`.
- Suítes: `saidas/reg-01-test-api.txt`, `saidas/reg-02-test-web.txt`, `saidas/reg-03-*.txt`.

## Cenários positivos

- `SEGURANCA-DO-AGENTE.md` (quadro "Estado atual: recurso em construção"), `GUIA-DO-COORDENADOR.md` seção 9 (quadro "a tela existe, mas fica vazia"), `LEIA-ME.md`, README "O agente que sobe o morro sozinho" (quadro "pela metade") e o parágrafo do operador no README ("Esse acompanhamento está em construção"), `PRIVACIDADE.md` 2.2, a apresentação de 15/09 e a do Alyson: todos com a ressalva, conferidos depois das mudanças da correção 4 da E22 (que mexeu em `SEGURANCA-DO-AGENTE.md`, `GUIA-DO-COORDENADOR.md`, `PRIVACIDADE.md`, `CARTAO-DO-AGENTE.md`, `LEIA-ME.md`, `PAPEIS_E_RESPONSABILIDADES.md` e no README sem tirar nenhum quadro de estado).
- A lista do coordenador em `PAPEIS_E_RESPONSABILIDADES.md:132`, acrescentada pela mesma correção, diz "Acompanhar quem está em campo agora (em construção, como no operador)": a ressalva foi lembrada na lista, mas não na tabela.

## Cenários negativos

- Guarda da etapa no SHA: vermelho (acima).
- Selo "Pronto" na linha de segurança: ausente (HTML e PDF).
- Passo do cartão mandando declarar no aplicativo: ausente.
- Testes da API e do painel da saída a campo: nenhum removido, todos verdes.

## Tentativas de reprovar

1. Rodei o guarda que a correção 2 criou como "teste negativo que morde": reprova no SHA. Rodei de novo sobre os documentos da rodada 4 para isolar a causa: lá passa. A causa é a linha 209 da tabela "A tabela, de uma vez", que a correção 4 da E22 acrescentou para prender a tabela ao código.
2. Conferi se a linha poderia ser uma exceção legítima, como a tabela gerada do README que a correção 2 deixou sem ressalva por descrever a permissão: o próprio guarda inclui `PAPEIS_E_RESPONSABILIDADES.md` com o padrão "acompanhar quem está em campo", ou seja, a etapa decidiu que toda menção nesse documento leva a ressalva; e a correção 2 pôs "(em construção)" na linha equivalente da matriz de papéis do Alyson. A tabela de `PAPEIS` é lida por gente (é o documento de papéis entregue com o produto), e a ressalva cabe na célula sem quebrar o teste que a prende (prova acima). Não é exceção.
3. Procurei outras afirmações que a correção 4 da E22 possa ter deixado sem ressalva nos documentos que a etapa cobre (grep acima): nenhuma além da linha 209.
4. Conferi se o PDF ficou atrás do HTML: os dois foram commitados juntos em `3ed4fb6` e o texto extraído do PDF traz as duas ressalvas da correção 2.
5. Observei que o guarda mora só na pasta da evidência e não roda em nenhuma suíte (`npm test`, `regras-de-conteudo`, CI): é por isso que a correção 4 da E22 o deixou vermelho sem ninguém ver.

## Achados

- A1 (bloqueia): o teste negativo da etapa está vermelho no SHA. Reprodução: na raiz do repositório, `node docs/evidencias-v2/G00/V2-F00-E24/correcao-2/verificar-ressalvas.mjs` sai com código 1 e aponta `dc360/docs/PAPEIS_E_RESPONSABILIDADES.md` (parágrafo 43, linha 209: "Acompanhar quem está em campo agora | sim | não | sim | sim"). A linha afirma, sem ressalva, que operador, coordenador e administrador acompanham quem está em campo, o mesmo defeito que reprovou a rodada 2 desta etapa. Conserto mínimo: "sim (em construção)" nas três células, compatível com `permissoes-no-readme.test.ts`. O defeito entrou pela correção 4 da E22 (`4ce0433`), mas é critério desta etapa e o guarda é dela.
- A2 (corrige antes de crescer): o guarda da E24 não está ligado a nenhuma suíte; enquanto viver só na evidência, qualquer etapa pode reintroduzir a promessa sem ressalva. Sugestão: levar a regra para `packages/shared/test/regras-de-conteudo.test.ts` ou para um teste próprio que o `npm test` rode.
- A3 (anotado, já registrado pela arbitragem da rodada 4, dono Rafael): o estado vazio de "Quem está em campo" no painel diz "Declarar a saída é um passo do aplicativo do agente, feito na base e com sinal" (`apps/web/src/paginas/QuemEstaEmCampo.tsx:192`); continua igual e continua fora de `apps/web/PENDENCIAS.md`. Fora do escopo da etapa (a etapa não muda painel).

Motivo do veredito da rodada 4: PASS (QA), com o FAIL de UX rebaixado pela arbitragem para "corrige antes de crescer" (frase do estado vazio, A3), dono Rafael. Esse item não foi consertado nem precisava ser pela correção 4. O que mudou desde então foi a regressão A1, introduzida pela correção 4 da E22 nos documentos que esta etapa cobre.

## Não verificado

- Capturas do portão visual das apresentações: a etapa não tem tag de UI e o portão visual não se aplica; a correção 4 da E22 não tocou os dois HTML de apresentação nem o PDF (diff `bb0f654..4ce0433` vazio neles).
- `npm test` como um comando só: rodei cada workspace separado (mesmos pacotes que o `npm test` percorre), com o `build:shared` feito pelo `npm run typecheck`, código 0.
- CI do SHA: ausente nesta sessão.

## Risco residual

O documento de papéis é material de implantação: quem o lê na tabela final conclui que o operador acompanha, hoje, quem está em campo, quando a tela fica vazia porque nenhum agente declara a saída. É a promessa de segurança física que a etapa existe para retirar, numa linha só, mas em tabela que costuma ser o que se lê primeiro.

## Motivo do humano

Rafael e Alyson decidem o CP-02 (a D-25 segue premissa) e leem a apresentação ajustada antes de qualquer demonstração a município; Rafael decide também a frase do estado vazio de "Quem está em campo" (A3). São decisões de produto e de demonstração.
