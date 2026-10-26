---
validador: seguranca-aplicacao
modelo: claude-opus-5-5
etapa: V2-F00-E12
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
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

Produto de `fd17ff4` (árvore em `55209ab`). Sondas numa CÓPIA do SHA em `SCRATCH/val-seguranca/copia/` (SCRATCH = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad`); saídas em `SCRATCH/val-seguranca/saidas/`. Não herdado: o diff `1ed0b71..fd17ff4` toca a guarda pela qual passam os 403 da rota do pacote (não toca `saida/` nem `rotas/saida.ts`).

| Critério | Prova | Resultado |
| --- | --- | --- |
| O ZIP do município A não contém nome de equipe (nem pessoa, município ou identificador) de B | HTTP real: `POST /saida/pacote.zip` como administradora de A, ZIP aberto com `test/ler-zip.ts`, 114 arquivos varridos | PASS |
| Só quem administra baixa | HTTP real: coordenadora de A `403 sem_permissao`; coordenador de B `403` | PASS |
| As equipes da vistoria são do mesmo município por construção | chaves compostas `vistorias_equipe_designada_do_mesmo_municipio` e `vistorias_equipe_do_agente_do_mesmo_municipio`; `UPDATE` como dono das tabelas apontando para equipe de B recusado nas duas colunas | PASS |
| A consulta do pacote roda sob o município do token | `saida/pacote.ts:475` `banco.comTenant(organizacaoId, ...)`, com `organizacaoId` de `quem` (token verificado) | PASS (leitura) |
| Suíte da etapa verde | `saida-de-municipio.test.ts` dentro de `30-base-verde.txt` | PASS |

## Evidência

- `20-sonda-http.txt` / `20-sonda-http-vitest.txt`: sonda própria `zz-seg7-http.test.ts`, 13 de 13, código 0. Pacote de A: `200`, cerca de 254 kB, 114 arquivos; termos de B procurados: "Equipe Única", "Vale Fundo", "Aurélio", "Simone Vieira", "Tarcísio", o id da organização B, o id de uma ocorrência de B e "valefundo"; nenhum nos arquivos de dados.
- A primeira execução achou "Vale Fundo" em `esquema/*.sql` dentro do ZIP (008, 016, 017, 020, 024, 028, 030): são os comentários das migrações, que citam os municípios de exemplo, e não dado de B. A varredura final exclui `esquema/` e o registro diz isso; os trechos foram vistos numa execução anterior, cuja saída a execução final sobrescreveu no mesmo arquivo; a sonda continua imprimindo o trecho de qualquer termo encontrado.
- `60-sonda-banco.txt`: as duas chaves compostas e as duas recusas de `UPDATE`.
- `30-base-verde.txt`: 463 de 463, código 0.
- CI: run 39420436042, 9 de 9 `success` (`05-ci-jobs.txt`).

## Cenários positivos

- Administradora de A baixa o pacote; ele contém "Equipe Alfa" (equipe de A).

## Cenários negativos

- Coordenadora de A e coordenador de B: `403 sem_permissao` antes de qualquer consulta.
- Vistoria de A apontando para equipe de B: recusada pelo banco mesmo como dono das tabelas.
- Nenhum termo de B nos dados do ZIP de A.

## Tentativas de reprovar

1. Procurei no ZIP inteiro qualquer rastro de B (nome de equipe, pessoas, município, identificadores): só os comentários das migrações citam "Vale Fundo".
2. Tentei plantar a divergência entre municípios por baixo (como dono das tabelas): as chaves compostas recusam.
3. Pedi o pacote com perfis que não administram (A e B): `403`.
4. Conferi que o diff da guarda deixa esse 403 do catálogo sair intacto.

## Achados

1. **anotado.** O pacote leva os `.sql` das migrações em `esquema/`, com comentários que nomeiam os municípios de exemplo ("Serra Alta", "Vale Fundo"). Não é dado de outro município; vale lembrar quando houver municípios reais com esses nomes, porque o leitor do pacote pode achar que é.

## Não verificado

- O pacote com volume real (a montagem lê tudo em memória, pendência registrada no código): não é desta etapa.
- Postgres real para a rota do pacote (rodei com PGlite e `SET LOCAL ROLE dc360_app`).
- Node 22 do `.nvmrc` (rodei em 24.15.0).

## Risco residual

Os dois montadores (rota e pacote) continuam existindo até a F09-E02, como a etapa registra; uma divergência futura entre eles é risco de integridade de documento, não de isolamento.

## Motivo do humano

Nada nesta dimensão depende de pessoa.
