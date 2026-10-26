---
validador: arbitragem
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
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Arbitragem (seção 7 de `docs/roadmap-v2/28-execucao-e-validacao.md`) entre `ux.md` (PASS, `escalar: guarda-da-etapa-vermelho-no-sha`) e `qa.md` (FAIL), nesta pasta. Fato comum: o guarda da etapa sai com código 1 no SHA por `dc360/docs/PAPEIS_E_RESPONSABILIDADES.md:209`. A disputa: a linha cabe na exceção aceita para a tabela de permissões do README, ou viola o critério da E24?

Reproduzi num worktree meu destacado em `4ce0433` (`$A/wt`, onde `$A` é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/A03-arbitragem`).

| Item | Resultado | Prova |
| --- | --- | --- |
| `node docs/evidencias-v2/G00/V2-F00-E24/correcao-2/verificar-ressalvas.mjs` (raiz do worktree) | código 1: "11 ocorrência(s) conferida(s), 1 sem a ressalva", `PAPEIS_E_RESPONSABILIDADES.md (paragrafo 43)`, a tabela "A tabela, de uma vez" | `$A/saidas/e24-1-guarda-no-SHA.txt` |
| Origem da linha 209 | `git log bb0f654..4ce0433 -- dc360/docs/PAPEIS_E_RESPONSABILIDADES.md`: só `4ce0433` (correção 4 da E22) | comando no worktree |
| Conserto mínimo: "sim (em construção)" nas três células da linha 209 | `packages/shared/test/permissoes-no-readme.test.ts` 10 de 10 antes e depois; guarda "11, 0 sem", código 0; arquivo restaurado | `$A/saidas/e24-2-conserto-minimo.txt` |

Critério da etapa: Definition of Done "nenhum documento promete a declaração no app sem ressalva", com o teste positivo "Grep final sem nenhuma frase que afirme que o aplicativo declara a saída, sem a ressalva". A rodada 2 reprovou a etapa exatamente porque textos diziam que o operador "acompanha quem está em campo" sem ressalva; a correção 2 consertou e criou `verificar-ressalvas.mjs` como o teste negativo que morde, com uma regra explícita para `PAPEIS_E_RESPONSABILIDADES.md` (padrão "acompanhar quem está em campo", unidade parágrafo). É o critério da etapa tal como ela mesma o fixou.

## Evidência

- `$A/saidas/e24-1-guarda-no-SHA.txt`: guarda no SHA, código 1.
- `$A/saidas/e24-2-conserto-minimo.txt`: teste da tabela de papéis e guarda com o conserto mínimo aplicado no worktree (e desfeito).
- Texto lido: `PAPEIS_E_RESPONSABILIDADES.md:45` ("(em construção, ver abaixo)"), `:132` ("(em construção, como no operador)"), `:209` (sem ressalva); `dc360/README.md:1082-1085` (tabela gerada de permissões); `packages/shared/test/permissoes-no-readme.test.ts:163-234` (a tabela de PAPEIS é escrita à mão e o teste só lê se a célula começa por "não").

## Cenários positivos

- Os demais textos que a etapa cobre seguem com a ressalva no SHA (os dois validadores concordam: SEGURANCA, CARTAO, GUIA seção 9, LEIA-ME, README, PRIVACIDADE, as duas apresentações e o PDF). Não reexecutei a leitura documento a documento: não está em disputa.
- As outras dez ocorrências que o guarda confere têm a ressalva.

## Cenários negativos

- Linha 209 sem ressalva: o guarda reprova (é o negativo da etapa funcionando).
- Selo "Pronto" e passo do cartão mandando declarar no aplicativo: ausentes (QA e UX concordam).

## Tentativas de reprovar

1. Tentei sustentar o PASS do UX pela exceção da tabela do README. Não se sustenta, por três razões do próprio texto da etapa: (a) a exceção da correção 2 foi dada à tabela do README por ser GERADA de `permissoes.ts` com teste que reprova edição manual; a tabela de PAPEIS é escrita à mão, e a ressalva cabe nela sem quebrar o teste que a prende (provado); (b) o guarda da etapa exclui a tabela do README pelo desenho (só casa `**acompanha quem está em campo**` em negrito no README), mas inclui `PAPEIS_E_RESPONSABILIDADES.md` inteiro: a etapa decidiu que toda menção nesse documento leva a ressalva; (c) o próprio documento ressalva a mesma ação nas linhas 45 e 132, e a matriz equivalente da apresentação do Alyson diz "Acompanhar quem está em campo (em construção)". Uma tabela final de papéis, que é o que se lê primeiro, dizendo "sim" sem ressalva é a mesma afirmação que reprovou a rodada 2.
2. Tentei atribuir o defeito só à E22, fora desta etapa. A linha entrou pela correção 4 da E22, mas o critério da E24 é conferido no SHA validado, e no SHA ele não vale. Quem conserta pode ser a E22; a E24 não passa até o conserto.
3. Tentei achar outra ocorrência sem ressalva que o guarda não pegue: não procurei além do que QA e UX já varreram (os dois acharam só esta).

## Achados

**Decisão: FAIL.** O QA está certo; o UX descreveu o mesmo fato e devolveu a decisão, e a exceção que ele pondera não cobre esta linha.

Por quê: no SHA, o teste negativo que a própria etapa criou para o seu critério ("nenhum documento promete ... sem ressalva", na leitura fixada pela rodada 2 e pela correção 2) sai com código 1, por uma afirmação da mesma classe da que reprovou a rodada 2, num documento que o guarda cobre de propósito.

Conserto mínimo: em `dc360/docs/PAPEIS_E_RESPONSABILIDADES.md:209`, `| Acompanhar quem está em campo agora | sim (em construção) | não | sim (em construção) | sim (em construção) |` (provado: `permissoes-no-readme.test.ts` 10 de 10 e guarda código 0). Nota abaixo da tabela não basta: o guarda lê por parágrafo, e a nota seria outro parágrafo; mudar o guarda para aceitar a tabela seria enfraquecer o teste negativo.

Corrige antes de crescer (QA A2, confirmado pela causa): o guarda vive só na pasta da evidência e não roda em suíte nenhuma, e por isso a correção 4 da E22 o deixou vermelho sem ninguém ver. Levar a regra para `packages/shared/test/regras-de-conteudo.test.ts` ou para um teste que o `npm test` rode.

Anotado, sem mudança: o estado vazio de "Quem está em campo" no painel (`apps/web/src/paginas/QuemEstaEmCampo.tsx:191-193`) continua prometendo um passo do aplicativo que não existe; rebaixado pela arbitragem da rodada 4 (a etapa proíbe mexer no painel), agora registrado como H30 em `docs/roadmap-v2/pendencias-humanas.md`.

Item do "Motivo do veredito" da rodada 4: a frase do estado vazio não foi consertada nem precisava ser pela correção 4; o FAIL desta rodada é a regressão nova da linha 209.

## Não verificado

- Releitura completa dos documentos e das apresentações, PDF e capturas: feitas por QA e UX, concordes, fora da disputa.
- `npm test` completo: não reexecutado (QA rodou por workspace, código 0).
- CI do SHA: ausente nesta sessão.

## Risco residual

O documento de papéis é material de implantação; a tabela final diz que operador, coordenador e administrador acompanham quem está em campo agora, quando a tela fica vazia porque nenhum agente declara a saída. É a promessa de segurança física que a etapa existe para retirar.

## Motivo do humano

Rafael e Alyson confirmam a D-25 (CP-02) e leem a apresentação ajustada antes de qualquer demonstração a município; Rafael decide a H30 (frase do estado vazio do painel). Decisões de produto e de demonstração.
