---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E06
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, AUTH, AUTHZ]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Ambiente: motor real da fila (`@dc360/campo`) contra a API real em processo (`construirServidor` sobre `bancoEmMemoria` com PGlite, `fetch` de verdade numa porta efêmera). Node v24.15.0.

- Fila diante de 401 e 403 sem perder item: `campo-integracao.test.ts` verde (conta desativada entre enfileirar e drenar = 403 `conta_desativada`, item `pendente`, 0 bloqueado, nada no banco, sobe UMA vez depois da reativação; sessão encerrada = 401 `sessao_encerrada`, idem; senha redefinida = pausa e depois sobe uma vez; token vencido renova UMA vez e sobe; sem renovação possível PAUSA sem laço; 403 `sem_permissao` continua bloqueando).
- Autoria da fila (item de outro autor não sobe com a sessão de quem entrou depois): sonda própria, motor real contra a API real, com a Ana logada no aparelho e um item do Diego: `enviados=0`, nada no banco, item `pendente`; quando o Diego volta, a MESMA coleta sobe. E, forçando o token da Ana no fio para o item do Diego, o servidor recusa com `autor_divergente` e nada grava.

## Evidência

- `campo-integracao.test.ts` e os demais 15 arquivos em Postgres real: código 0, 447 de 447 (inclui `campo-integracao`) (`SCRATCH/validadores/red-team/saidas/00-testes-do-repo-no-sha.txt`).
- Pacote do motor `@dc360/campo`: código 0, 238 de 238 (`saidas/01-pacote-campo.txt`).
- Sonda própria de autoria `zzz-red-team-e06` (criada em `apps/api/test`, rodada e apagada; árvore conferida limpa): código 0, 2 de 2 (`saidas/20-e06-autoria.txt`).

## Cenários positivos

- 401 `nao_autenticado`: renova uma vez e a coleta sobe, sem pausa (verde).
- Diego coleta, Ana entra, Diego volta: a coleta do Diego sobe uma vez com a credencial dele.

## Cenários negativos

- Conta desativada, sessão encerrada, senha provisória: fila para, item `pendente`, `tentativas` 0, 0 bloqueado, nada no banco.
- Item do Diego com a sessão da Ana ativa: o `prontos` do motor filtra por autoria, o envio nem é chamado (`enviados=0`), nada grava.
- Token forjado da Ana para o item do Diego: servidor responde `autor_divergente`, item bloqueado, 0 evidência e 0 evento na trilha.
- Token completamente inválido: pausa `sessao_encerrada`, uma renovação por pedido, nunca em laço.

## Tentativas de reprovar

- Tentei subir o item do Diego com a credencial válida da Ana por dois caminhos (sessão da Ana, e sessão do Diego com token da Ana no fio): o motor barra no primeiro, o servidor barra no segundo; nada chegou ao banco em nenhum.
- Procurei duplicação de laudo no reenvio: `campo-integracao` prova uma vistoria e uma foto por chave de idempotência (verde).

## Achados

- Anotado (declarado pelo implementador): rebaixar o papel do agente com coleta na fila ainda bloqueia (403 `sem_permissao`), decisão registrada; `descartar` aceita item de outro autor, por desenho.

## Não verificado

- Prova em aparelho/emulador: não há emulador nem aparelho nesta máquina; o cenário de ponta a ponta na tela (frase na faixa, item preservado) e a aprovação das frases ficam como pendência humana. O motor e o contrato foram exercitados contra a API real; a tela, por teste de componente do repositório (não reexecutado por mim).
- Run do CI do SHA: ausente (H32).

## Risco residual

Baixo para o critério do motor e da autoria. O risco remanescente é só visual/de tela (frases e layout no aparelho), que exige validação humana e não é desta dimensão.

## Motivo do humano

Não se aplica a esta dimensão. A pendência de aparelho/emulador e de aprovação das frases é de validação humana (UX/produto), registrada acima e no STATUS, e não bloqueia o critério red-team.
