---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E08
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
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

Ambiente: API real em processo sobre PGlite (`bancoEmMemoria` semeado), `inject` da própria instância. Node v24.15.0.

- `GET /oficios` e `GET /oficios/:id` negam ao agente de campo (403 `sem_permissao`), com a MESMA resposta para ofício que existe, que não existe e de outro município (sem oráculo): `leitura-do-agente-oficios-e-avisos.test.ts` verde, 14 de 14.
- `GET /avisos`: recorte do agente na lista E na contagem de não lidos; agente da Bravo não vê nem conta o aviso da ocorrência da Alfa; agente sem equipe = lista vazia e `naoLidos` 0; coordenação/operador/administração com o município inteiro (verdes).
- Isolamento: coordenador de outro município abrindo ofício = 404, nunca 403 (verde).
- A regra mora no shared (`consultar_oficio` em `permissoes.ts`), não num `if` de papel: a ação é conferida antes de abrir transação e antes de validar o id.

## Evidência

- `leitura-do-agente-oficios-e-avisos.test.ts` e os demais 15 arquivos em Postgres real: código 0, 447 de 447 (`SCRATCH/validadores/red-team/saidas/00-testes-do-repo-no-sha.txt`).
- Prova de que morde: mutação em `rotas/oficios.ts` trocando `autorizar(..., "consultar_oficio")` por `exigirAutenticacao` nos dois GET; o teste reprova 3 de 14, e o corpo mostra o agente recebendo 200 com a lista de ofícios (número, órgão) e o `GET /oficios/:id` 200 onde devia ser 403, e 200 em vez de 404 cruzando município (`saidas/30-e08-mutacao.txt`). Arquivo restaurado (`git diff` vazio).

## Cenários positivos

- Operador, coordenador e administrador listam e abrem ofício (200) com o conteúdo de sempre (e-mail do órgão e IP de quem abriu o link para quem consulta).

## Cenários negativos

- Agente Diego (Equipe Alfa): `GET /oficios` e `GET /oficios/:id` (ofício da equipe dele, de outra equipe, de outro município, id inexistente) todos 403 `sem_permissao` idênticos, sem e-mail, observações nem IP no corpo.
- Agente de outro município: 403 que não muda com o município do ofício.
- `GET /avisos` do agente: nenhum aviso de outra equipe na lista; `naoLidos` igual à lista dele.
- Sem token: 401, e não 403.

## Tentativas de reprovar

- Desliguei a conferência de permissão nas duas rotas de ofício (mutação): o agente passou a receber 200 com os dados do órgão e o IP, confirmando que o teste morde e que a guarda é o que fecha o vazamento (AUT-12, AUT-13).
- Procurei o oráculo na diferença entre id existente e inexistente para o agente: a recusa é idêntica (a permissão é conferida antes da validação do id).

## Achados

- Anotado (da rodada 4, lido e não remedido aqui, fora do escopo): o agente ainda vê número e órgão do ofício pela linha do tempo do dossiê, e `GET /orgaos` expõe e-mails a qualquer papel; `GET /documentos/validar` com o código impresso. Caminhos da F03-E12/F04 (manifesto rota x ação).

## Não verificado

- O jest do app de campo (contrato do app inalterado nesta etapa) e o `test:e2e:api` completo (cai na seção 13, E18).
- Run do CI do SHA: ausente (H32).
- A escrita dentro do `GET /avisos` continua (idempotente, só do município do token), por escopo; fecha na F07-E03/F04-E11.

## Risco residual

Baixo para o critério. As três superfícies da etapa (oficios lista, oficios ficha, avisos/sino) estão fechadas ao agente e provadas por mutação. O risco remanescente são outras rotas de catálogo (`/orgaos`, `/documentos/validar`), fora do escopo e anotadas.

## Motivo do humano

Não se aplica: tudo o que esta dimensão exige foi executado localmente.
