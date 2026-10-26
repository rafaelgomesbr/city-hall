---
validador: seguranca-aplicacao (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E12
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [API, DOCUMENTO]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito da dimensão: **PASS**. O pacote e o laudo só saem para quem tem direito, o município cruzado recebe 404, todo texto vindo do banco sai escapado no laudo (rota e pacote), o CSV neutraliza fórmula, os nomes de arquivo do ZIP não carregam travessia, e a trilha da emissão e o registro da exportação não se reescrevem pelo papel da aplicação. A correção 2 (`conferirAssinatura`) está certa e o teste dela morde. Um teste que não morde (a conferência de prefixo do município na assinatura) fica como achado anotado, sem caminho de exploração pela API. Nível E2: API real (`npx tsx src/index.ts`) contra Postgres 17.10 real, sondada por HTTP. Saídas em `$SP/val/seguranca-aplicacao/lote2/` (abaixo, `L2/`).

| Critério | Resultado | Prova |
| --- | --- | --- |
| Autorização do pacote (`POST /saida/pacote.zip`): só administradora | PASS | `L2/40-sonda-e12-pg17.txt`: sem token 401; coordenadora, operador, agente de Serra Alta, agente e coordenador de Vale Fundo: 403 `sem_permissao`; administradora 200 `application/zip` |
| A organização vem só do token | PASS | pacote pedido pela administradora de Serra Alta com `x-organizacao: <Vale Fundo>`: ZIP de Serra Alta; nenhum termo de Vale Fundo (nome, email, equipe) fora de `esquema/` (as únicas ocorrências do identificador de Vale Fundo são a chave hostil que EU injetei em `vistorias.assinatura_chave`) |
| Laudo de outro município: 404, nunca 403 por existência | PASS | coordenador de Vale Fundo pede o laudo da F1 de Serra Alta: 404 `nao_encontrada`; agente de Vale Fundo: 403 `sem_permissao` (o papel não emite laudo em município nenhum, a recusa sai antes de qualquer leitura); sem token: 401 |
| Conteúdo hostil no laudo (HTML) | PASS | nomes de equipe renomeados PELA API (`PATCH /equipes/:id`, 200) para `Bravo <script>alert("eqd")</script> "&'` e `Alfa <img src=x onerror=alert(2)>`; solicitante, endereço e descrição da ocorrência com `<script>`, `"><img onerror>` e `<svg onload>`: nos dois laudos (rota e pacote) nenhum `<script>alert`, `<img src=x` nem `<svg onload` cru; o aviso de equipe sai escapado e idêntico nos dois (`&lt;script&gt;alert(&quot;eqd&quot;)...`). Arquivos: `L2/pg/e12/laudo-rota.html`, `L2/pg/e12/laudo-pacote.html` |
| Conteúdo hostil no CSV | PASS | descrição `=HYPERLINK("http://exemplo.invalid/x","clique")`: a célula em `tabelas/ocorrencias.csv` sai `"'=HYPERLINK(""http://...` (apóstrofo de `celulaCsv`, `packages/shared/src/csv.ts:19-35`) |
| Nomes de arquivo no ZIP | PASS | 112 entradas, nenhuma começando com `/`, com `..`, `\` ou `<>:"|?*`; diretório do protocolo `documentos/000473-2026/`; foto e assinatura por `nomeDoArquivo` (só o último segmento, `[^a-zA-Z0-9._-]` vira `_`) |
| Correção 2: o laudo nunca imprime assinatura quebrada | PASS | `saida-de-municipio.test.ts` 32 de 32 (dentro de `L2/01-api-suites-alvo.txt`); mutação M13 (`nao_conferida` vira `presente`): 2 vermelhos de 32 ("armazenamento FORA DO AR" e "DIFERENÇA CONHECIDA") (`L2/mut/M13-*.txt`); na sonda com chave hostil, rota e pacote dizem "Assinatura não coletada" e nenhum `<img class="traco">` |
| Aviso de equipe divergente no pacote | PASS | M14 (as duas colunas de nome de equipe viram `NULL`): 3 vermelhos de 32 (`L2/mut/M14-*.txt`) |
| Imutabilidade do que foi emitido e exportado | PASS | como `dc360_api` com `SET LOCAL ROLE dc360_app` e o município do token: `UPDATE` e `DELETE` em `trilha_eventos` (tipo `documento_emitido`) e em `exportacoes` recusados com `permission denied`; RLS ativada e forçada nas duas, dono `dc360_setup` (`L2/40-*`, `L2/11-*`); o pedido do pacote deixou 1 linha `saida_de_municipio` em `exportacoes` |
| `npm run test:isolamento` verde | PASS | 14 arquivos, 345 aprovados e 3 pulados, código 0 (`L2/60-test-isolamento.txt`) |

Defeitos das rodadas anteriores (dimensão de segurança e motivo do veredito), reexecutados:

- Rodada 2, assinatura declarada e ausente imprimia imagem quebrada no pacote: não morde mais (teste e M13; sonda com chave inexistente: "Assinatura não coletada" nos dois laudos).
- Rodada 2 (segurança, anotado 3): `esquema/` do pacote leva comentários de migração com os nomes dos municípios fictícios: continua (não é dado de município).
- Rodada 1, coordenada: a consulta do pacote seleciona `v.latitude, v.longitude` (teste "campo por campo" verde).

## Evidência

- `L2/01-api-suites-alvo.txt`: `saida-de-municipio`, `pacote-de-saida-contrato`, `saida-nao-declara-inexistente`, `documentos`, `assinatura-ausente-no-documento`, `fotos-do-documento` entre 18 arquivos, 217 de 217, código 0.
- Mutações M12, M13 e M14 em `apps/api/src/saida/pacote.ts` com `L2/mut/rodar.sh` (diff em `L2/mut/<nome>.diff`, `git restore`, SHA-256 do arquivo igual antes e depois).
- Postgres 17.10 descartável na porta 55541, 50 migrações, semente; API real na porta 55542; sonda `L2/pg/e12-pacote.mjs`, saída `L2/40-sonda-e12-pg17.txt`, ZIP e os dois laudos em `L2/pg/e12/`. PG derrubado e pasta apagada (`L2/90-pg-stop.txt`).

## Cenários positivos

- Administradora baixa o pacote (200, ZIP de 112 entradas), o laudo da F1 traz o aviso de equipe divergente igual ao da rota, escapado.

## Cenários negativos

- Cinco papéis e municípios sem direito: 401 ou 403, nenhum byte de ZIP.
- Município cruzado no laudo: 404.
- Cabeçalho com outra organização: ignorado.
- HTML, fórmula de planilha e travessia no nome: neutralizados.
- Reescrever a trilha da emissão ou o registro de exportação pelo papel da aplicação: recusado pelo banco.

## Tentativas de reprovar

1. Nome de equipe com HTML pela própria API (o esquema aceita qualquer caractere até 120): escapado nos dois laudos.
2. `assinatura_chave` com travessia para o prefixo de outro município (`tenant/<SA>/../<VF>/...`, gravada por SQL de superusuário, porque a API remonta a chave pelo token em `rotas/sincronizacao.ts:597-602`): o `CHECK` da migração 009 aceita (começa com `tenant/<SA>/`), a conferência devolve ausente no armazenamento em memória, os dois laudos dizem "Assinatura não coletada" e o arquivo vai para `PENDENCIAS-DA-EXTRACAO.txt`. Ver achado 1.
3. Retirei a conferência de prefixo de `conferirAssinatura` (M12): 44 de 44 continuam verdes em `saida-de-municipio`, `assinatura-ausente-no-documento` e `pacote-de-saida-contrato`. Ver achado 1.
4. Procurei dado de Vale Fundo em todo `.csv`, `.json`, `.html` e `.txt` do ZIP de Serra Alta: só o identificador que eu mesmo injetei.

## Achados

**Anotado (sem caminho de exploração pela API; dono F09-E02 ou quem tocar a cópia de arquivos do pacote)**

1. A conferência de prefixo do município na assinatura do pacote (`saida/pacote.ts:377`) não tem teste que a exija (M12 sobrevive), e a cópia dos bytes da assinatura para o ZIP (`saida/pacote.ts:893-895`) não confere prefixo nenhum; o `CHECK` da migração 009 aceita `..` depois do prefixo. Hoje a chave só nasce de `chaveDeStorage` (último segmento higienizado) na sincronização, então nenhum cliente consegue gravar uma chave de outro município. Se um dia uma chave dessas entrar no banco, o laudo diria "não coletada" e o ZIP poderia levar o arquivo de outro município. Conserto barato: a mesma conferência antes da cópia, e um caso de teste com chave de outro prefixo.
2. Os comentários das migrações em `esquema/` citam os municípios fictícios (rodada 2, segue).

## Não verificado

- Armazenamento S3 real (a conferência e a cópia contra o provedor): só o armazenamento em memória.
- Abertura do HTML do laudo num navegador e do CSV numa planilha real: conferido pelo texto gerado.
- Pacote de município grande (memória e tempo).

## Risco residual

- Dois montadores de documento até a F09-E02 (três diferenças documentadas e travadas); o achado 1 é defesa em profundidade que falta no lado da cópia.

## Motivo do humano

Nenhum.
