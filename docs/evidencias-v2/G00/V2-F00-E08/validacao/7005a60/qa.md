---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E08
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [UI, A11Y, AUTH, AUTHZ, TENANT, API, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados
- Ação `consultar_oficio` no shared, concedida a operador, coordenador e administrador e não ao agente: `packages/shared/src/permissoes.ts` (linhas 27, 48, 93, 105, 122; o bloco do agente não a tem). `PAPEIS` tem só quatro papéis, nenhum fica de fora. Shared: 168 de 168 (16 arquivos).
- `GET /oficios` e `GET /oficios/:id` dão 403 `sem_permissao` ao agente: sonda própria (abaixo) deu 403 em `/oficios`; teste da etapa 14 de 14.
- `GET /avisos` com recorte da equipe na lista e na contagem; `POST /avisos/lidos` também: lido em `rotas/avisos.ts` (os três pontos de `eRecorteDoAgente`); teste confere contra oráculo do banco.
- Coordenação, operador e administração sem mudança: caso positivo do teste (200, município inteiro) e `sino-de-avisos.test.ts` 19 de 19.
- Pendência da escrita em GET registrada: conferido pelo teste "A escrita dentro do GET /avisos segue como era" (verde) e pela nota no código; o arquivo `PENDENCIAS.md` não foi aberto por mim.
- Painel esconde "Ofícios" sem a ação: `Ocorrencia.tsx:164,179` e `apps/web/test/oficio-so-para-quem-consulta.test.ts` 4 de 4. Não olhei as capturas.

## Evidência
Saídas em `scratchpad/` (nomes abaixo):
- `npm run build:shared`: saída 0.
- Arquivos da etapa (leitura, sino, orgaos-e-oficio, agente-so-ve-a-equipe, superficie): 75 de 75, saída 0 (`api-etapa.txt`).
- `npm run test:api` completo: 97 arquivos, 1267 de 1267, saída 0 (`api-full.txt`).
- `npm run test --workspace @dc360/shared`: 1ª rodada 1 falha por timeout de 5 s em `regras-de-conteudo` (carga, armadilha conhecida do 29); repetido com `--testTimeout=120000`: 168 de 168, saída 0 (`shared.txt`, `shared2.txt`).
- `npm run test:isolamento`: 327 passam, 3 pulados (os mesmos 3 do baseline), saída 0 (`iso.txt`).
- Mutação (antes do conserto): troquei `autorizar(..., "consultar_oficio")` por `exigirAutenticacao` e tirei os três `eRecorteDoAgente` de `avisos.ts`: 9 de 14 casos reprovam, 5 passam, igual ao RESUMO (`mut-e08.txt`). Restaurado com `git checkout`.
- Sonda própria (teste temporário, apagado): token do Diego (Alfa) em 28 GETs, buscando protocolo, id e endereço das 6 ocorrências alheias (`qa-sonda.txt`).

## Cenários positivos
Operador, coordenador, administrador listam e abrem ofício (200); sino do coordenador com a contagem de antes; agente da Alfa e da Bravo recebem só os avisos da equipe, iguais ao oráculo do banco.

## Cenários negativos
Agente 403 em lista (com e sem filtro) e ficha (ofício dele, de outra equipe, de outro município, id inexistente); sem token 401; agente de outro município 403; coordenador de outro município 404 e lista sem o ofício alheio; agente sem equipe com lista vazia e `naoLidos` 0; `POST /avisos/lidos` em aviso alheio devolve `marcados: 0`.

## Tentativas de reprovar
- Procurei OUTRA rota de leitura do papel agente com dado de outra equipe: listei os GETs em `apps/api/src/rotas` e conferi o recorte de cada um. Com o token do agente: `/ocorrencias` (e `/:id` alheio = 404), `/mapa`, `/interditados`, `/providencias/pendentes`, `/indicadores/painel`, `/duplicidades/consulta`, `/evidencias/ocorrencia/:id` (vazio) e `/evidencias/:id/url`, `/busca` (restrita a `em_campo` da equipe), `/sincronizacao/pendencias`, `/avisos`: nenhuma devolveu protocolo, id ou endereço alheio. 403 em `/oficios`, `/usuarios`, `/saida-a-campo`, `/ocorrencias/devolvidas`, `/organizacao/retencao`, `/armazenamento/uso`.
- Único acerto de texto alheio: `/campo/meu-trabalho` devolveu a 000473/2026 (Bravo) na lista `concluidas`. A causa é a semente: o Diego assinou a vistoria dessa ocorrência, e a rota lista as vistorias assinadas por ele. Não é falha da etapa; é anotado.
- Ordem da checagem: confirmei no código que a permissão vem antes da validação do id, então 403 não distingue 422 de existente.
- Não achei como contornar o recorte: a equipe vem do cadastro, e `/avisos` não aceita equipe por parâmetro.

## Achados
- bloqueia: nenhum.
- corrige antes de crescer: `GET /orgaos` (catálogo com e-mail e contagens `providencias` e `abertas` do município inteiro) e `GET /equipes` (`em_atendimento` por equipe) respondem 200 ao agente, só com autenticação. Reprodução: sonda acima, 200 em ambos. Não vaza protocolo nem dado de ocorrência de outra equipe, só e-mail de órgão e contagem agregada. O implementador já declarou e adiou (F04, F03-E12), e o bloco proíbe resolver aqui.
- anotado: `GET /documentos/validar/:codigo` aceita o agente (código de 12 hex, devolve protocolo e autor da emissão do município). Só funciona com o código em mãos. Anotado: `/campo/meu-trabalho` lista vistoria que o agente assinou em ocorrência hoje de outra equipe (semente). Anotado: o agente desativado ainda lê o sino até o token vencer (F03-E03, declarado).

## Não verificado
- E2E da seção 25 (`fluxo-api.e2e.mjs`) e `npm run test:e2e:api`: dependem de navegador e web construído; confiei na saída arquivada `05-e2e-secao-25-depois.txt` e no CI (9 de 9), sem reexecutar.
- Capturas (`capturas/*.png`) e portão visual: não abri; o diff não cria tela nova.
- Rodadas do `baseline` e `restore` (jobs longos): não rodei; confio no CI.
- PostgreSQL 17: só o CI. Aqui foi 18.3 (banco em memória do teste).
- Conferência de `PENDENCIAS.md`, README e `PAPEIS_E_RESPONSABILIDADES.md` por leitura: não feita.
- Jest do app de campo, `apps/console`, web inteiro: não rodei.
- A sonda HTTP do implementador (`sonda-agente-http.mjs`) contra API real com Postgres: não rodei; reproduzi o equivalente por `app.inject` e pelos testes.

## Risco residual
O agente continua disparando a escrita dentro do `GET /avisos` (declarado, F07-E03). O catálogo de órgãos e as contagens de equipe seguem abertos ao agente até a F04. A vigência da conta só vale na escrita (F03-E03).

## Motivo do humano
Não se aplica. A validação humana do Rafael (ver a sonda antes e depois) é item próprio da etapa e não bloqueia o veredito do QA.
