---
validador: qa (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Árvore no HEAD `95f09f6` (produto igual a `52952a1`). Saídas em `$SP/val/qa/`; sonda própria `$SP/val/qa/sondas/qa-vigencia.test.ts`.

| Critério | Prova | Resultado |
| --- | --- | --- |
| Catálogo no shared, com os seis códigos | `qa-vigencia`, bloco E05 (`30-sonda-vigencia.txt`): `nao_autenticado:401 sessao_encerrada:401 conta_desativada:403 acesso_suspenso:403 troca_de_senha_obrigatoria:403 sem_permissao:403`; `ehCodigoDeErroDeAcesso("sessao")` e de código inventado: `false` | PASS |
| Token vencido responde 401 `nao_autenticado` | token autêntico com `exp` no passado: escrita e leitura 401 `nao_autenticado`; adulterado e ausente também | PASS |
| Sessão encerrada por administrador responde 401 `sessao_encerrada` | caso E04 2 e cadeia/administrador da E07 | PASS |
| Conta desativada responde 403 `conta_desativada` | escrita com token vivo 403; renovação depois de desativar PELO ENDPOINT (`PATCH /usuarios/:id/situacao`, que revoga as sessões) 403 `conta_desativada`, e repetida 403 de novo | PASS |
| Defeito da rodada 1 (renovar depois de desativar pelo endpoint dava 401 `sessao_encerrada`) | reexecutado: 403 `conta_desativada` | não morde mais |
| Negativo: `/auth/entrar` com conta desativada igual à senha errada | corpo e status idênticos (401 `credenciais`, "Email ou senha inválidos.") para conta desativada com a senha certa, senha errada e e-mail inexistente | PASS |
| Negativo: código fora do catálogo reprova | `ehCodigoDeErroDeAcesso` recusa; `packages/shared` 168 de 168 (`05-test-shared.txt`), com o teste do catálogo | PASS |
| Nenhuma ocorrência do texto `sessao` como código | `grep` em `apps/*/src` e `packages/*/src`: só o discriminante `tipo: "sessao"` do resultado de login no painel e comentários históricos; nenhum `erro: "sessao"` nem `FalhaAutenticacao("sessao"` | PASS |
| Autorização e isolamento: conta desativada de A escrevendo em ocorrência de B | 403 `conta_desativada` (nada sobre B); controle: a mesma conta reativada em B dá 404 | PASS |
| Frontend: painel trata `sessao_encerrada` e `conta_desativada`, frase na entrada | `npm run test --workspace @dc360/web` 665 de 665 (`04-test-web.txt`); e2e seção 23 (19 verificações, abaixo) | PASS |
| E2E: desativar e a próxima chamada leva à entrada com a frase certa | `07-test-e2e-api.txt`, seção 23: "sessao encerrada leva a tela de entrada ... sem dizer que expirou", "conta desativada leva a tela de entrada", "e manda procurar a coordenacao, e nao entrar de novo", "com aviso de perigo", "token vencido + conta desativada leva a tela de entrada", "a entrada continua com a recusa generica"; 288 de 288, zero erro de console | PASS |
| Regressão: `test:api`, `test:isolamento`, web, `test:campo`, `superficie` | `01` 1309 aprovados e 1 falha de ambiente (`openssl-do-teste`); `02` 345 e 3 pulados, código 0; `04` 665/665; `06-test-campo.txt` 134 suítes, 1927 de 1927, código 0 | PASS |
| Documentação: tabela de códigos no README, guia do coordenador | `dc360/README.md:152-154` e `docs/GUIA-DO-COORDENADOR.md:158-170` lidos: conferem com o comportamento medido | PASS |

## Evidência

- `$SP/val/qa/30-sonda-vigencia.txt` (18 de 18), `01-test-api.txt`, `02-test-isolamento.txt`, `04-test-web.txt`, `05-test-shared.txt`, `06-test-campo.txt`, `07-test-e2e-api.txt`
- CI run 38618369218, 9 de 9 `success`

## Cenários positivos

Catálogo com status certos; token vencido sinaliza "renove"; conta reativada volta a escrever (controle do isolamento).

## Cenários negativos

Conta desativada na escrita, na renovação (duas vezes), na entrada (recusa genérica); conta desativada de A em ocorrência de B; agente despachando: 403 `sem_permissao`, código do catálogo.

## Tentativas de reprovar

- Tentei de novo o caminho que reprovou a rodada 1 (desativar pelo endpoint real, que revoga as sessões, e renovar depois): 403 `conta_desativada`, inclusive na segunda tentativa.
- Tentei enumeração de conta pela entrada: os três corpos (desativada com senha certa, senha errada, e-mail inexistente) são byte a byte iguais.
- Procurei o código legado `sessao` sobrevivendo como valor de erro em qualquer ponta: não há.

## Achados

- ANOTADO (já registrado em rodadas anteriores): a mensagem do 401 `sessao_encerrada` de `/auth/renovar` ("Sessão expirada. Entre novamente.") difere da mensagem do catálogo.
- ANOTADO: o validador de banco desta rodada relata que a renovação que perde a trava da 049 para uma desativação simultânea responde 401 `sessao_encerrada` e não 403 `conta_desativada` (janela estreita; reapresentar o token dá 403). Não reproduzi; dono provável E07.

## Não verificado

- O caminho de corrida do achado acima (renovação simultânea à desativação): não executado por mim.
- Aplicativo de campo em aparelho ou Simulador: provado só por jest (`test:campo`), sem tela.
- Leitor de tela ouvindo a frase (pendência humana já registrada).

## Risco residual

A frase da tela de entrada é conteúdo de produto e o anúncio por leitor de tela não foi ouvido por pessoa.

## Motivo do humano

Mantidas as pendências já registradas no VEREDITO: Rafael conferir as capturas das três frases (texto de produto) e uma pessoa com NVDA ou VoiceOver ouvir a frase ao cair na entrada. Não bloqueiam a etapa.
