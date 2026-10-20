---
validador: seguranca-aplicacao
modelo: claude-opus-5-5
etapa: V2-F00-E08
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, MOBILE, OFFLINE, A11Y, AUTH, AUTHZ, TENANT, RLS, DB, MIGRATION, API, LGPD, DOCUMENTO, ARQUIVO, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Produto de `1ed0b71` na árvore principal (HEAD `5044e7a`, só `STATUS.md` e `ESTADO-ATUAL.md` diferem). Postgres 17.6 real, cluster descartável meu em 127.0.0.1:55931, derrubado e apagado no fim; a API usa `SET LOCAL ROLE dc360_app` com RLS forçada. Saídas em `SCRATCH/validadores/seguranca-aplicacao/`.

1. Ação `consultar_oficio` no pacote compartilhado, para operador, coordenador e administrador e não para o agente: `npm run test --workspace @dc360/shared` 223 de 223 (23).
2. `GET /oficios` e `GET /oficios/:id` passam por `exigirPermissao` antes de abrir transação e antes de validar o id: agente recebe 403 `sem_permissao` com corpo IDÊNTICO para a lista, a ficha existente, a ficha aleatória e o id inválido; sem e-mail do órgão no corpo (sonda 08).
3. Recurso de outro município: coordenador de B na ficha de A responde 404 `nao_encontrado`, idêntico ao id aleatório; a lista de B não traz o ofício de A (08).
4. Sino do agente: o aviso de outra equipe (Bravo) não chega ao agente da Alfa, nem na lista nem na contagem; `POST /avisos/lidos` com o id de outra equipe devolve `marcados: 0` e não grava em `avisos_lidos` (08); `leitura-do-agente-oficios-e-avisos.test.ts` e `sino-de-avisos.test.ts` verdes (19).
5. Operador continua listando ofício (200) (08).
6. Escrita dentro do `GET /avisos` continua só no município do token e passa pela vigência (`ROTA_GET_COM_EFEITO`; sessão encerrada recebe 401, sonda 08 da E04).
7. Regressão: `npm run test:api` 1624 de 1624 (20), `npm run test:isolamento` 345 e 3 pulados (21), `superficie.test.ts` verde (19).

## Evidência

- `08-sonda-negativas-pg17.txt`: sonda própria (`zz-sonda-negativas-r6.test.ts`, cópia em SCRATCH), caso "E08", com cada pedido e resposta.
- `11-MUTACAO-E08-ficha-sem-acao-e-contagem-sem-recorte.txt`: em `rotas/oficios.ts`, a ficha com `exigirAutenticacao` no lugar de `autorizar(..., "consultar_oficio")`; em `rotas/avisos.ts`, a contagem de não lidos sem `eRecorteDoAgente`. 5 vermelhos de 17 (dois da ficha, dois da contagem, e a minha sonda). Restaurado com `git restore`.
- `19-guarda-codigos-e-autz.txt`, `20`, `21`, `23`.

## Cenários positivos

- Operador Jonas lista ofícios do município: 200 com o ofício (08).
- Coordenação e administração com o município inteiro no sino (testes do repositório, 19).

## Cenários negativos

- Agente Diego: `GET /oficios`, `/oficios/<existente>`, `/oficios/<aleatório>`, `/oficios/nao-e-uuid`: 403 `sem_permissao`, os quatro corpos idênticos (08).
- Agente de B na ficha de A: 403 (a negação da ação vem antes de qualquer leitura).
- Coordenador de B na ficha de A e na ficha aleatória: 404, corpos idênticos; nunca 403.
- Agente da Alfa e aviso da Bravo: fora da lista e da contagem; marcar como lido devolve 0 e nada é gravado.

## Tentativas de reprovar

- Mutei a ficha para só autenticar e a contagem para ignorar o recorte (11): os testes do repositório e a minha sonda reprovam; a proteção é presa por teste.
- Tentei distinguir existência de ofício pelo agente (existente, inexistente, inválido, de outro município): resposta única.
- Tentei distinguir existência pelo coordenador de outro município: 404 idêntico ao aleatório.
- Conferi que o diff `bb0f654..1ed0b71` não tocou `rotas/oficios.ts`, `rotas/avisos.ts`, `rotas/recorte-do-agente.ts` nem `permissoes.ts`; a única mudança que atravessa essas rotas é a guarda de códigos de erro, que preserva 403 `sem_permissao` e 404.

## Achados

- Anotado (continua da rodada 4): `GET /orgaos` entrega o e-mail dos órgãos a qualquer papel e `/documentos/validar` mostra dados básicos de ofício a quem tem o código impresso; fora do escopo (F03-E12 e F04).
- Anotado (continua): o agente desativado ou rebaixado ainda LÊ por até 15 minutos (vigência só na escrita, F03-E03).
- Nenhum achado bloqueia.

## Não verificado

- O painel escondendo "Ofícios" do agente não foi conferido por mim em navegador (é da UX); a API recusa de todo modo.
- `npm run test:e2e:api` (seção 25) não rodado.
- CI do SHA ausente (H32).

## Risco residual

Leitura com token vivo de papel antigo por até 15 minutos e os dois vazamentos anotados (catálogo de órgãos, validação por código), todos registrados para fases seguintes.

## Motivo do humano

não se aplica
