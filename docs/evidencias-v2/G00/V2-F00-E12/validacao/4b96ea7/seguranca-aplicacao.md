---
validador: seguranca-aplicacao
modelo: claude-sonnet-5-5
etapa: V2-F00-E12
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
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

Veredito na primeira linha: **PASS** para a dimensão segurança de aplicação. As duas junções novas de equipe do pacote não carregam nome de equipe de outro município, o banco recusa a vistoria que aponte para equipe alheia, e a diferença da assinatura com arquivo ausente (achado da especificação e do QA, que reprovam a etapa por documentação) não tem efeito de autorização, isolamento nem injeção; seu efeito é de integridade do documento exportado, descrito no achado 1. Base de evidência: `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/seg/` (`seg/`).

| Critério | Resultado | Evidência |
| --- | --- | --- |
| O ZIP do município A não contém nome de equipe do município B (nem o inverso) | PASS | sonda `e12-cruzado.test.ts` (`4x-e12-cruzado.txt`): pacote de A (administrador de A) e de B (administrador criado na sonda), busca de 17 termos (7 de B no pacote de A, 10 de A no pacote de B: nomes de equipe, município, pessoas, e-mails e prefixo de identificador) em todos os arquivos não binários; os únicos acertos são comentários das migrações em `esquema/*.sql` ("Serra Alta", "Vale Fundo"), nenhum dado |
| O banco impede a vistoria de A de apontar para equipe de B | PASS | `4x-e12-fk.txt`: `UPDATE` como dono das tabelas com a equipe de B em `equipe_designada_id` e em `equipe_do_agente_id` é recusado pela chave estrangeira composta `(organizacao_id, equipe_*_id)` da migração 024 |
| As junções leem sob RLS | PASS | a consulta roda dentro do `comTenant` do município do administrador; `LEFT JOIN equipes ed/ea` não tem filtro explícito, e não precisa: `equipes` está sob RLS forçada |
| O aviso de equipe divergente não falta nem é inventado | PASS | `saida-de-municipio.test.ts` 28 de 28 (aviso, equipes iguais, agente sem equipe, `sem_despacho`, coluna nula anterior à 024) |
| O nome impresso é escapado | PASS | `documentos/laudo.ts` usa `escapar` em todo texto de banco; o caminho da assinatura e das fotos passa por `nomeDoArquivo` (`[^a-zA-Z0-9._-]` vira `_`, só o último segmento da chave), sem travessia nem HTML |
| A assinatura com arquivo ausente não abre caminho de ataque | PASS | achado 1 |

## Evidência

- `11-api-e06-e08-e12.txt`: `saida-de-municipio.test.ts` entre os 9 arquivos, 167 de 167.
- Sondas próprias em PGlite com a API real: `e12-cruzado.test.ts` (`4x-e12-cruzado.txt`), `e12-fk.test.ts` (`4x-e12-fk.txt`).
- Prova de que o teste morde: **m13** (`saida/pacote.ts`, as duas colunas de nome de equipe trocadas por `NULL::text`): 3 vermelhos de 28 (o do aviso, "equipes diferentes" e "agente sem equipe"); `git restore`, árvore limpa (`seg/m13-pacote-sem-nomes-de-equipe.txt`). O QA mutou também a coordenada.

## Cenários positivos

- Vistoria F1 (Alfa designada, agente da Bravo): o laudo do pacote traz o mesmo trecho de aviso que o laudo da rota.
- Administrador de A baixa o pacote de A e o de B baixa o de B; cada um traz só dado do próprio município.

## Cenários negativos

- Equipes iguais: sem aviso. Agente sem equipe: frase própria. Coleta sem despacho: nota própria. Colunas nulas (anterior à 024): sem aviso falso.
- Vistoria de A apontada para equipe de B: recusada pelo banco.

## Tentativas de reprovar

1. Procurei nome de equipe, de usuário ou identificador do outro município nos arquivos do pacote: nada em dado; só comentários de migração no diretório `esquema/`.
2. Tentei fazer a junção devolver equipe alheia: o banco recusa a gravação, e a leitura passa por RLS.
3. Procurei injeção por `assinatura_chave` ou por nome de arquivo no `src` do laudo exportado: `nomeDoArquivo` neutraliza qualquer caractere fora de `[A-Za-z0-9._-]` e fica só o último segmento.
4. Procurei efeito de segurança da assinatura ausente: com a chave declarada e o arquivo ausente, a rota imprime "Assinatura não coletada" e o pacote imprime uma imagem quebrada sobre o nome do assinante (QA, `17-assinatura.json`), e a falta aparece em `PENDENCIAS-DA-EXTRACAO.txt`. Nenhum dado de outra pessoa ou município aparece, nenhuma rota nova é exposta, o caminho não é forjável por quem não escreve a chave.
5. Procurei o administrador baixando o pacote de outro município por parâmetro: `?organizacao=` é ignorado (a organização vem do token); coberto por `saida-de-municipio.test.ts`.

## Achados

**ANOTADO**

1. Integridade do documento exportado, não confidencialidade: o laudo do pacote pode mostrar uma imagem quebrada de assinatura sobre o nome do assinante quando o arquivo falta no armazenamento, enquanto o da rota diz "Assinatura não coletada". Quem lê só o papel pode achar que houve assinatura. A falta está declarada no arquivo de pendências do pacote. A documentação (`SAIDA-DE-MUNICIPIO.md`, `PENDENCIAS.md`) afirma o contrário; esse é o motivo do FAIL do QA e da especificação, e a correção é deles. Dono: F09-E02.
2. Sem controle positivo no teste de isolamento do pacote: a semente de B não tem vistoria com a equipe dele (já anotado pelo QA). A garantia real é a chave estrangeira composta e a RLS, que eu provei fora do teste.
3. O diretório `esquema/` do pacote carrega os comentários das migrações, com nomes dos municípios fictícios de teste. Não é dado de município real; vale limpar antes de um pacote de município de verdade.

## Não verificado

- Pacote com re-vistoria real e foto de vistoria anterior.
- Renderização dos dois HTML no navegador.
- Pacote de município real grande (memória e tempo).
- `test:isolamento` por conta própria (confio no gatekeeper: 327 aprovados e 3 pulados).

## Risco residual

- Até a F09-E02 existem dois montadores do documento, e a diferença da assinatura não está travada por teste nem documentada.

## Motivo do humano

Nenhum.
