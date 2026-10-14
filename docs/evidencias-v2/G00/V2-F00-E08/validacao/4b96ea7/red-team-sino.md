---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E08
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [API, AUTHZ, TENANT, LGPD, UI]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Tarefa dirigida: reproduzir ou descartar a anomalia do item 4 de `web/RELATORIO.md` (sino do agente Diego trazendo `vistoria_recebida` de `000473/2026`, da Equipe Bravo, enquanto `GET /ocorrencias/<c3>` dava 404). Pasta das sondas e saídas: `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/sino-e08/` (abaixo, `sino-e08/`).

| Critério | Resultado |
| --- | --- |
| Causa da anomalia identificada com prova | PASS: mutação temporária `seg/m09a` (lista de `GET /avisos` sem o recorte do agente) aplicada por outro validador em `apps/api/src/rotas/avisos.ts` na mesma janela em que `rodar-tudo.sh` reiniciou a API do agente de navegador |
| A mesma assinatura reproduzida de propósito, sem tocar no repositório | PASS: a mutação m09a aplicada só em memória (gancho de carga do Node) reproduz exatamente o sintoma relatado |
| Sino do agente nunca traz aviso de ocorrência fora da equipe dele, na árvore limpa do SHA | PASS: 60 rodadas em 6 APIs novas, 4326 respostas de sino de agente conferidas, 7042 verificações, 0 violação |
| `naoLidos` do agente bate com a lista (e não vira oráculo) | PASS: conferido a cada rodada em repouso para Diego (Alfa), Bruno (Bravo) e Caio (sem equipe) |
| `POST /avisos/lidos` com id de outra equipe | PASS: `marcados: 0` em todas as tentativas |
| Renovação de token nunca devolve papel ou pessoa de outra conta | PASS: toda renovação do Diego devolveu `sub` do Diego, `agente_campo`, Serra Alta |
| A sonda morde | PASS: com m09a em memória, 130 violações em 2 rodadas; com m09b (contagem sem recorte), 28 violações em 2 rodadas |

## Evidência

Linha do tempo (carimbos de arquivo do scratchpad, horário de Brasília, 2026-10-13):

- `seg/m08b-oficios-ficha-sem-permissao.txt` gravado 19:35:22 (fim da mutação anterior, em outro arquivo).
- `seg/m09a-avisos-lista-sem-recorte.txt`: o vitest da mutação começa 19:35:31 ("Start at"); `seg/mut.mjs` grava o arquivo mutado imediatamente antes de chamar o `npx vitest` e só restaura (`git restore`) depois que ele termina (duração 9,38 s); a saída é gravada 19:35:41,44. Janela com a lista sem recorte em `avisos.ts`: cerca de 19:35:29 a 19:35:41.
- `seg/m09b-avisos-contagem-sem-recorte.txt` (contagem sem recorte): começa 19:35:43, gravado 19:35:53. `seg/m09c-avisos-lidos-sem-recorte.txt`: começa 19:35:54, gravado 19:36:05. O arquivo `avisos.ts` ficou mutado, com intervalos de cerca de 1 s, de 19:35:29 a 19:36:05.
- `web/rodar-tudo.sh` criado 19:35:32,55. Ele chama `web/reiniciar-api.sh` (derruba a 3791, `sleep 2`, sobe `npx tsx src/index.ts` sem `watch`) e roda `t1`, `t2`, `t5` e `t6`. A API desse agente não tinha `DATABASE_URL`: PGlite em memória, semeado do zero a cada partida, então não há banco compartilhado a contaminar.
- `avisos.ts` é importado de forma estática por `servidor.ts:24` e lido UMA vez, na partida. Medi a partida (`sino-e08/campanha-20261013-211337/lote-01/`): do `spawn` ao "Server listening" foram 2,1 s. Com o `sleep 2` e o `npx`, a leitura de `avisos.ts` cai por volta de 19:35:36 a 19:35:40, dentro da janela da m09a. O `tsx` sem `watch` não recarrega: a instância ficou com a lista sem recorte até ser derrubada, o que explica as sondas `sonda-sino.mjs` (19:43), `sonda2.mjs` e `sonda3.mjs` (19:44) verem o mesmo defeito depois que a árvore já tinha sido restaurada, e as seis repetições seguintes (APIs novas) não o verem. O cache do `tsx` é por conteúdo, então não há transformação velha servida depois do `git restore`.
- Nenhum outro validador tocou `avisos.ts` ou `recorte-do-agente.ts` nessa janela: `qa-api/14-mut-avisos-sem-marca.txt` é das 19:00 e mexe na marca de vigência, não no recorte; `redteam/` e `qa-api/` não têm arquivo entre 19:25 e 19:50.

Reprodução da assinatura (`sino-e08/sonda-anomalia.mjs`, mesma sequência HTTP do bloco E08 do `t6.mjs` e da `sonda3.mjs`, API nova, espera da margem de 10 s; saídas em `sino-e08/anomalia-20261013-210456/`):

| Árvore | Ocorrências do Diego | Sino do Diego | `naoLidos` Diego x Rita | Diego abre c3 | Falhas no bloco do sino do t6 |
| --- | --- | --- | --- | --- | --- |
| limpa (`saida-limpa.txt`) | 000471, 000474 | só `vistoria_recebida` 000474 | 1 x 2 | 404 | 0 |
| m09a em memória (`saida-m09a-v2.txt`) | 000471, 000474 | `vistoria_recebida` 000473 E 000474 | 1 x 2 | 404 | 1 ("todo aviso do sino do agente é de ocorrência da equipe dele") |
| m09b em memória (`saida-m09b-v2.txt`) | 000471, 000474 | só 000474 | 2 x 2 | 404 | 1 ("não lidos do agente menor que o da administradora") |

A m09a reproduz o que o agente de navegador viu (aviso da 000473 no sino, 404 no dossiê da mesma ocorrência, lista com 000471 e 000474) e a contagem que ele registrou ("22 OK e 1 FALHA" no `t6`). A m09b produz outra assinatura (sem a 000473 na lista).

O gancho de carga (`sino-e08/gancho-registrar.mjs` e `gancho-carga.mjs`) troca, só no código já transformado pelo `tsx` e só no processo da sonda, a chamada `eRecorteDoAgente(quem,"o",paramsDaLista)` (m09a) ou a de `paramsDaContagem` (m09b) por uma string vazia. Nenhum arquivo do repositório foi escrito; o log da API registra "MUTANTE_SINO ... aplicado em memoria". Uma primeira forma (remover só a interpolação `${recorteDaLista}`) deixa um parâmetro sem uso, a consulta é recusada e a rota dá erro (`saida-m09a.txt` e `saida-m09b.txt`, descartadas como emulação); a forma válida é a da chamada inteira, que é também a que faz o teste da `seg/m09a` contar 6 itens na lista e 3 na contagem.

Campanha na árvore limpa (`sino-e08/motor.mjs`, `cenarios.mjs`, `comum.mjs`; saída em `sino-e08/campanha-20261013-211337/`: `motor.log`, `resumo.json`, `lote-0N/arvore-antes.json`, `arvore-depois-de-subir.json`, `arvore-fim.json`, `api-389N.log`):

- 6 lotes, cada um com API nova (PGlite semeado, portas 3895 a 3898), 10 rodadas por lote: 60 rodadas.
- Antes de subir cada API, depois que ela respondeu `/saude` e no fim do lote: `git status --porcelain` sem nada além das pastas `validacao/4b96ea7/`, e `git hash-object` de `rotas/avisos.ts`, `rotas/recorte-do-agente.ts`, `servidor.ts`, `rotas/ocorrencias.ts` e `rotas/autenticacao.ts` igual ao blob de `4b96ea7`: 18 de 18 conferências limpas.
- Resultado: 7042 verificações, 0 violação, 4326 respostas de `GET /avisos` de agente conferidas, 0 erro do motor, 0 resposta 429 que tenha precisado de nova tentativa.
- Ensaios de calibração antes da campanha (`sino-e08/ensaio-20261013-210057/`, `ensaio-20261013-210228/`): o primeiro bateu no limite de 300 pedidos por minuto por usuário (429, não é violação de recorte) e serviu para ajustar o ritmo; o segundo, 5 rodadas, 0 violação.

## Cenários positivos

- Quiescente, a cada rodada: o sino do Diego (Alfa) e do Bruno (Bravo, agente criado pela sonda) é EXATAMENTE o conjunto de avisos da administradora cujas ocorrências estão hoje na equipe deles; a lista de ocorrências de cada agente é exatamente a da equipe; `naoLidos` igual aos não lidos da lista (com o Diego marcando metade como lida a cada rodada, para o estado de leitura variar).
- Diego volta a ver os avisos da Alfa depois de ser movido para a Bravo e de volta (12 vezes).
- A administradora vê os avisos de todas as equipes (até 54 avisos fora da Alfa num mesmo município ao fim de um lote).

## Cenários negativos

- Agente sem equipe (Caio, criado pela sonda): lista vazia e `naoLidos` 0 em toda resposta, durante as corridas e em repouso.
- Diego (Alfa) abre a 000473 (Bravo): 404 em toda consulta, inclusive durante as corridas.
- `POST /avisos/lidos` do Diego com todos os ids de avisos que nunca estiveram na equipe dele: `marcados: 0` sempre.
- Sequência exata do `t6` (emissão do ofício, login novo do Diego, lista, sino, sino da administradora): as três asserções do bloco do sino passaram nas 60 rodadas.

## Tentativas de reprovar

1. Corrida "aviso nasce enquanto a ocorrência muda de equipe" (Y): vistoria do Diego em Y (Alfa) disparada ao mesmo tempo que o redespacho de Y para a Bravo, com atraso sorteado. Em 24 rodadas o redespacho venceu (Y foi para a Bravo, a vistoria do Diego entrou depois, marcada como fora da equipe, e o Bruno também vistoriou); em 36 a vistoria venceu (redespacho 409). Em todos os casos o sino do Diego, em repouso, seguiu a equipe ATUAL de Y, e durante a corrida nunca trouxe aviso de ocorrência que não tivesse passado pela Alfa.
2. Corrida tripla (Z), alternando a direção Alfa para Bravo e Bravo para Alfa: vistoria do agente da equipe inicial, redespacho e vistoria do agente da equipe final, ao mesmo tempo, com atrasos sorteados (31 rodadas com redespacho aceito, 29 recusado). Nenhuma violação.
3. Vistoria de agente de outra equipe: o Bruno (Bravo) e o Diego (Alfa) vistoriando X, da Bravo, ao mesmo tempo, 60 vezes. O aviso nasce na ocorrência da Bravo e nunca chegou ao sino do Diego.
4. Reatribuição do agente: a cada 5 rodadas a administradora move o Diego para a Bravo com o sino dele sendo consultado em paralelo, confere que ele passa a abrir a 000473 (200) e não a 000474 (404), e o devolve à Alfa (12 vezes).
5. Token trocado no meio: cadeia de `POST /auth/renovar` do Diego correndo em paralelo com as escritas e com os sinos de outros papéis; toda renovação devolveu o próprio Diego, `agente_campo`, Serra Alta.
6. Cursor do delta (`desde` e `desdeId`) ecoado como o painel faz, em paralelo à consulta completa; nenhuma resposta delta trouxe aviso de fora.
7. Providência respondida nascendo nas duas equipes a cada rodada (000473 da Bravo e 000474 da Alfa): só a da Alfa chega ao Diego, só a da Bravo chega ao Bruno.
8. Contador com cache: não existe cache no código (`avisos.ts:493` refaz a contagem a cada pedido, com o mesmo recorte e o mesmo `JOIN ocorrencias` da lista); a campanha conferiu a igualdade a cada rodada.
9. Prova de que a bateria morde, com a mesma árvore limpa e a mutação só em memória: `sino-e08/controle-m09a-20261013-211220/` (130 violações em 2 rodadas, entre elas o sino do Diego com aviso da Bravo e o do Caio com avisos do município) e `sino-e08/controle-m09b-20261013-211220/` (28 violações: `naoLidos` diferente da lista, Caio com contagem maior que zero).

## Achados

**Causa da anomalia (não é defeito de produto):** contaminação do próprio processo de validação. O validador de segurança aplicou m09a, m09b e m09c em `apps/api/src/rotas/avisos.ts` entre 19:35:29 e 19:36:05, e o agente de navegador reiniciou a API dele a partir da mesma árvore logo depois das 19:35:32, carregando a versão mutada da m09a. Os validadores não rodaram em sequência, como o `BRIEF-COMUM.md` prevê. Durante esta minha execução também havia processos de outros agentes vivos (API em 3991 e 3992, `vite preview` iniciados às 21:00, 21:27 e 21:31; nenhum deles é meu), e por isso o motor conferiu a árvore e o blob dos arquivos vigiados antes e depois de cada partida.

**ANOTADO, para o gatekeeper (processo, não etapa):**

1. Mutação de prova ("o teste morde") feita no arquivo da árvore compartilhada contamina qualquer outro processo que suba a API naquele intervalo. Sugestão: mutação em memória (o gancho de `sino-e08/` serve de modelo) ou em cópia de trabalho separada, e todo roteiro que sobe API conferir `git hash-object` dos arquivos de rota contra o SHA antes e depois da partida.
2. A afirmação do item 4 de que o `naoLidos` do Diego era 3, igual ao da administradora, não se sustenta junto com "1 FALHA" no `t6`: se a lista trouxesse a 000473 e a contagem também fosse igual, o `t6` teria registrado 2 falhas. A `sonda3.mjs` imprime só os primeiros 700 caracteres do JSON, e com 3 avisos o campo `naoLidos` (que vem depois da lista) tende a cair fora do corte. Leio esse número como lembrança imprecisa do terminal; nenhuma mutação única e nenhuma rodada limpa produz as duas coisas juntas.

**ANOTADO, comportamento por desenho (fora do escopo da E08):**

3. O recorte do sino é pela equipe ATUAL da ocorrência: aviso de ocorrência que entra na equipe do agente aparece com o histórico dela (inclusive vistoria feita por agente de outra equipe), e o aviso da própria vistoria do agente some do sino dele se a ocorrência for redespachada (é o caso da vistoria semeada do Diego na 000473). É coerente com `recorte-do-agente.ts` e com o dossiê.
4. `POST /sincronizacao/vistoria` aceita vistoria de agente de outra equipe (201 nas 60 tentativas do Diego na X da Bravo) e marca a divergência, por decisão documentada em `sincronizacao.ts` ("aceitar e marcar, em vez de recusar"). Não é leitura e não é desta etapa.

## Não verificado

- O instante exato em que `rodar-tudo.sh` foi executado não ficou registrado (o `api.log` e o `t6-chromium.log` daquela rodada foram sobrescritos). A janela é inferida do carimbo de criação do script (19:35:32,55), do tempo de partida medido (2,1 s) e do `sleep 2` do `reiniciar-api.sh`. Se a execução tivesse começado depois das 19:35:41, a instância teria carregado a m09b ou a m09c, cuja assinatura não é a relatada; por isso a confiança é média e não alta.
- Postgres real (18.3 local ou 17 do CI): a campanha usou o PGlite que a própria API sobe sem `DATABASE_URL`, como o agente de navegador fez. O recorte de equipe é uma condição SQL da rota, não da RLS, e o `test:isolamento` do gatekeeper cobre o Postgres.
- Várias réplicas da API ao mesmo tempo: cada lote teve uma API só.
- Sino no painel (navegador): não abri o painel; o rótulo "Avisos, N por ler" foi conferido pelo agente de navegador nas seis repetições limpas.
- `prazo_vencido` e `retorno_nao_confirmado` nascendo durante a corrida: os de prazo da semente entraram na conta, mas não forcei vencimento novo nem saída a campo sem retorno.
- `saida-m09a.txt` e `saida-m09b.txt` de `anomalia-20261013-210456/` foram regravadas uma vez (a primeira tentativa não subiu a API por erro de sintaxe no gancho); nenhum arquivo de outro validador foi tocado.

## Risco residual

Baixo para o produto: o recorte do sino resistiu a corrida de redespacho, vistoria cruzada, reatribuição do agente, renovação de token, cursor delta e marcação de lidos, com 0 violação em 60 rodadas, e a mesma bateria pega as mutações m09a e m09b. O risco que fica é de processo: enquanto validadores puderem mutar a árvore em paralelo, uma rodada E2E pode reprovar ou, pior, aprovar sobre código que não é o do SHA.

## Motivo do humano

Nenhum. Tudo aqui foi verificável por execução.
