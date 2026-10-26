---
validador: qa (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E08
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [UI, A11Y, AUTH, AUTHZ, API, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Pasta das saídas: `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/qa-E04-E05-E08/` (abreviada como `$O`). Árvore em `0290af5`, que só difere de `bb0f654` em `STATUS.md` e `ESTADO-ATUAL.md`.

| Item (DoD e cinco campos de teste) | Resultado | Prova |
| --- | --- | --- |
| DoD: sondas do agente fechadas | PASS | sonda própria `$O/31-sonda-qa.txt`: agente 403 `sem_permissao` em `GET /oficios` (sem filtro, filtro válido, filtro malformado), `GET /oficios/:id` (existente, inexistente, malformado), `GET /oficios/:id/documento` e `HEAD /oficios`; as seis recusas de leitura com corpo idêntico, sem `orgao_email`, `observacoes`, `aberturas` nem IP |
| DoD: ação nova testada no shared e na API | PASS | `permissoes.test.ts` 16 de 16 (`$O/03`); `leitura-do-agente-oficios-e-avisos.test.ts` 14 de 14 (`$O/01`); mutação dando `consultar_oficio` ao agente reprova 2 casos do shared (`$O/18`); mutação tirando `exigirPermissao` das duas rotas reprova 3 casos da API (`$O/12`) |
| DoD: pendência da escrita em GET registrada | PASS | `apps/api/PENDENCIAS.md` linha 26 e seção "`GET /avisos` ESCREVE" (F07-E03, F04-E11); README seção "Autorização por papel"; teste "a escrita dentro do GET /avisos segue como era" verde |
| DoD: item do G00 marcado | não é desta dimensão | marca do gate |
| Positivo: operador, coordenador e administrador listam e abrem ofício (200) | PASS | sonda: os três listam com o ofício e abrem a ficha com `orgao_email` e `aberturas` |
| Positivo: o sino do coordenador não muda; o agente lista os avisos da equipe | PASS | sonda: o agente recebe exatamente os avisos da Alfa que o município tem (2 de 3; o terceiro é da Bravo), e o município continua com os 3 |
| Negativo: agente 403 `sem_permissao` nas duas rotas | PASS | sonda e testes acima |
| Negativo: agente sem equipe, lista vazia e `naoLidos` 0 | PASS | caso do teste da etapa, verde, e que reprova sob a mutação da contagem (`$O/13`) e da lista (`$O/14`) |
| Isolamento: agente da Bravo não vê nem conta o aviso da Alfa; coordenador de B abre ofício de A, 404 | PASS | sonda: nenhum aviso fora da Alfa chega ao agente da Alfa, `naoLidos` igual aos não lidos da lista dele; agente de Vale Fundo nunca recebe aviso de Serra Alta; coordenador de Vale Fundo abre o ofício de Serra Alta e recebe 404 com corpo igual ao de id inexistente, e a lista dele não traz o ofício |
| Regressão: `test:api`, shared, `test:isolamento`, `superficie.test.ts`, `test:e2e:api` | PASS (com a falha de ambiente conhecida) | `$O/01` 1326 aprovados, 1 falha de LibreSSL, 20 pulados da E07; `$O/03` 170 de 170; `$O/02` 345 e 3 pulados; `$O/05` 9 de 9; `$O/06` 288 OK, 0 falha |
| E2E: token do agente, `GET /oficios` 403 e sino só da equipe | PASS | `$O/06`, seção 25 no roteiro completo (não numa cópia aparada): 14 OK, inclusive "o cartao de oficios nem aparece para ele" e "o operador abre o mesmo dossie e continua vendo o cartao" |
| Frontend: o painel esconde "Ofícios" de quem não tem a ação, por `podeExecutar` | PASS | `oficio-so-para-quem-consulta.test.ts` 4 de 4 (`$O/04`); mutação `podeConsultarOficio = true` reprova (`$O/17`); seção 25 do e2e |
| LGPD (minimização): IP e observações não chegam ao agente | PASS | sonda: nenhum corpo devolvido ao agente contém `orgao_email`, `observacoes`, `aberturas` ou `ip`; quem consulta continua recebendo |
| Índice da evidência bate | PASS | `$O/20`: 33 de 33 linhas batem com os blobs de `bb0f654`; sub-índice `saidas/baseline-depois` 7 de 7; `conferir-indices-de-evidencia.mjs` OK (`$O/21`). O motivo do BLOCKED da rodada 3 está removido |

## Evidência

- `npm run build:shared`, `npm run test:api` (`$O/00`, `$O/01`): `leitura-do-agente-oficios-e-avisos.test.ts` 14, `orgaos-e-oficio.test.ts` 24, `sino-de-avisos.test.ts` 19, `agente-so-ve-a-equipe.test.ts` 9, `superficie.test.ts` 9, todos verdes; total 1326 aprovados, 1 falha (`openssl-do-teste.test.ts`, LibreSSL do macOS), 20 pulados (E07).
- `npm run test --workspace @dc360/shared` (`$O/03`, código 0), `npm run test --workspace @dc360/web` (`$O/04`, código 0, 665 de 665), `npm run test:isolamento` (`$O/02`, código 0), `npm run test:e2e:api` (`$O/06`, código 0), `npm run conferir:numeros` (`$O/09`, código 0), `npm run test --workspace @dc360/campo` (`$O/08`, 223 de 223) e `npm run test:campo` (`$O/07`, 1927 de 1927), estes dois porque a resposta do sino é lida pelo aplicativo.
- Sonda HTTP própria (`$O/scripts/sonda-qa.mjs`, saída `$O/31-sonda-qa.txt`, 85 OK, 0 falha) contra a API real recém-semeada na porta 3791. A sonda emite um ofício pela administradora (a semente não tem), espera a margem de 10 segundos do sino para os avisos materializados aparecerem, e compara o sino do agente com o recorte calculado pela lista de ocorrências da administradora. API derrubada no fim.
- Prova de que morde (risco alto), cada mutação restaurada com `git restore` e árvore limpa ao fim:
  - `$O/12`: `autorizar(app, req, "consultar_oficio")` trocado por `app.exigirAutenticacao(req)` nas duas leituras: 3 reprovam.
  - `$O/13`: o recorte da CONTAGEM de não lidos neutralizado com SQL válido (a condição sempre verdadeira, o parâmetro mantido, para não confundir com erro 500): 3 reprovam com asserção de número ("expected 6 to be 3").
  - `$O/14`: o recorte da LISTA neutralizado do mesmo jeito: 5 reprovam.
  - `$O/15`: o recorte de `POST /avisos/lidos` neutralizado: 1 reprova ("expected 5 to be 0", o oráculo).
  - `$O/17`: painel sem `podeExecutar`: 1 reprova. `$O/18`: shared com a ação dada ao agente: 2 reprovam.

## Cenários positivos

- Operador, coordenadora e administradora: 200 na lista e na ficha, com o conteúdo de sempre (sonda).
- Agente da Alfa: recebe os 2 avisos da Alfa, marca um como lido (`marcados: 1`) e o `naoLidos` dele cai 1 (sonda).
- O operador abre o dossiê e continua vendo o cartão de ofícios com o número emitido (e2e, seção 25).

## Cenários negativos

- Agente: 403 idêntico para ofício existente, inexistente, id malformado, lista com e sem filtro, filtro malformado (sem 422: a permissão vem antes da validação) e HEAD (sonda).
- Agente de outro município: o mesmo 403 com o mesmo corpo (sonda).
- Coordenador de outro município: 404 igual ao de id inexistente (sonda).
- Agente marcando aviso de outra equipe: `marcados: 0`, resposta igual à de um id inexistente (sonda).
- Agente de outro município: nenhum aviso de Serra Alta (sonda).

## Tentativas de reprovar

1. Neutralizei cada uma das quatro travas (permissão das duas leituras, recorte da lista, da contagem e do marcar como lido) com mutação de SQL válido: todas reprovam por asserção, não por erro 500. Na primeira tentativa, apagar o `${recorte}` gerava 500 por parâmetro sobrando; refiz para a prova ser semântica.
2. Procurei outra rota que entregue ofício ao agente: `grep` de `oficio` em `src/rotas`: só `documentos.ts` (`GET /documentos/validar/:codigo`, ver Achados) e as rotas públicas do link do ofício. O dossiê e `GET /providencias/pendentes` passam pelo recorte do agente.
3. Testei o papel rebaixado: operador rebaixado a agente continua lendo `GET /oficios` com o token antigo (200) até renovar; com o token renovado, 403. É a vigência de leitura da F03-E03, declarada nas limitações da etapa.
4. Testei se o 403 do agente varia com a forma do pedido (filtro, id malformado, HEAD): não varia.
5. Conferi a seção "Autorização por papel" do README, `docs/PAPEIS_E_RESPONSABILIDADES.md` (linhas 39, 41, 82, 83 e 89 a 94: operador consulta ofício, agente não consulta nem vê aviso de outra equipe, 403) e `PENDENCIAS.md` (linhas 25, 26 e a de `GET /orgaos`) contra o código e a sonda: batem.
6. Conferi o `INDEX.md` byte a byte contra os blobs do commit, independente do script do repositório: bate.

## Achados

- nenhum que quebre critério da etapa.
- Anotado (declarado pelo implementador, fora do escopo): `GET /orgaos` exige só autenticação e devolve o e-mail de cada órgão ao agente (F03-E12 ou F04).
- Anotado (provado pela sonda, declarado, F03-E03): quem foi rebaixado a agente continua lendo ofício com o token antigo por até 15 minutos.
- Anotado (fora do escopo): `GET /documentos/validar/:codigo` devolve número do ofício, protocolo e id da ocorrência de qualquer equipe a qualquer papel autenticado que tenha o código de 12 dígitos hexadecimais impresso no documento. Exige ter o documento (48 bits, não se adivinha); sem e-mail, observações nem IP. Registro para a F03-E12 (manifesto rota x ação).

## Não verificado

- O run do CI (39143791434) não foi lido.
- PostgreSQL 17: a API rodou com o banco em memória da semente; `test:isolamento` no 18.3 local.
- Aplicativo de campo em aparelho: a prova é só a de contrato (as suítes do campo, verdes); o aparelho não usa ofício.
- Teto do sino (`TETO_DE_AVISOS`) com o recorte do agente sob volume grande: não gerei avisos acima do teto; o caso "contagem igual à lista" só foi provado sem truncar.
- Capturas e checklist visual das telas: são da dimensão UX.

## Risco residual

- A escrita dentro do `GET /avisos` continua, também disparada pelo token do agente (declarada, F07-E03 e F04-E11).
- Leitura com papel antigo por até 15 minutos (F03-E03).
- `GET /orgaos` ainda entrega e-mail de órgão ao agente.

## Motivo do humano

Nenhum. A "validação humana" da etapa (Rafael ver a sonda antes e depois) é provada por E1 (mutações que reprovam e código restaurado que passa) e por E2 (sonda HTTP própria contra a API real); pela seção 8 de `28`, não se pede E4 quando E1 ou E2 provam.
