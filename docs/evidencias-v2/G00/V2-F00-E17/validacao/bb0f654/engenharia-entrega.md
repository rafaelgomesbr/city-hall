---
validador: engenharia-entrega (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E17
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [LGPD, INFRA]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1 local no macOS, E2]
veredito: BLOCKED
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/engenharia-entrega-E01-E17-E18-E19-E21-E25/` (abaixo, `<V>`).

| Critério | Prova local (Mac) | Prova que depende do CI | Situação |
| --- | --- | --- | --- |
| `npm run test:scripts` com 0 falhas | passo `test-scripts` da linha de base: 288 aprovados, 0 falhas, 0 pulados, código 0 (`<V>/baseline/10-test-scripts.txt`) | passo "Testes dos scripts" do job `produto` (Linux, 4 pulados esperados) | local PASS; Linux BLOCKED |
| Os 4 pulados seguem por ambiente | no Mac os 4 rodam e passam porque `apps/campo/ios/` existe (divergência conhecida); não dá para ver o pulo aqui | artefato `06-test-scripts.txt` do CI | BLOCKED |
| `conferir:numeros` sem divergência | `npm run conferir:numeros` código 0, "Todos os números da documentação batem com a realidade" (`<V>/14-numeros-e-mutantes.txt`) | passo "Os números do README batem com a realidade" | local PASS; CI BLOCKED |
| `conferir:numeros` reprova número alterado | mutante no README (`README.md:14`, 1327 para 1328 testes): código 1, "Afirmações que não batem (1): README.md:14"; mutante no roteiro (29 para 28): código 1 com a diferença | n/a | PASS |
| Workflow roda `test:scripts` e `conferir:numeros` | lido: os dois passos estão no job `produto`, depois do `npm ci` do aplicativo (sem ele os testes de scripts sairiam sem afirmar) | execução | estrutura PASS |
| Portabilidade em duas plataformas | Mac (este run); Windows pela evidência do implementador | Linux pelo CI | BLOCKED |

## Evidência

- `<V>/baseline/10-test-scripts.txt`: `pass 288`, `fail 0`, `skipped 0`.
- `<V>/14-numeros-e-mutantes.txt`, `<V>/14a.txt` a `<V>/14d.txt`: conferência limpa, os dois mutantes e o controle depois de desfazer (código 0, árvore limpa).
- `<V>/baseline/11-conferir-numeros.txt`: código 0 dentro do roteiro.

## Cenários positivos

- `test:scripts` verde no macOS (terceira plataforma, além das duas que a etapa pede).
- `conferir:numeros` 0 divergência, incluindo as oito suítes contadas contra `baseline.mjs`.

## Cenários negativos

- Número de testes da API no README trocado: reprova apontando a linha.
- Esperado do roteiro trocado: reprova com "+1" e o nome da tabela a atualizar.

## Tentativas de reprovar

1. Plantei número errado no README e no roteiro: os dois reprovam; desfeitos com `git restore` (árvore conferida limpa).
2. Conferi se o CI poderia passar sem olhar o aplicativo: o passo de `test:scripts` só roda se o `npm ci` de `apps/campo` deu certo (`steps.instalar_app.outcome == 'success'`).
3. Procurei o pulo indevido no Mac: 0 pulados aqui é efeito de `ios/` existir, não de teste desligado.

## Achados

- Nenhum que quebre critério da etapa.
- Anotado: a contagem de 4 pulados por ambiente só se observa no Linux (CI); no Mac a pasta `ios/` liga os 4 testes.

## Não verificado

- O run do CI (Linux): não lido nesta sessão.
- Windows: não há Windows aqui.

## Risco residual

Baixo. O risco é só a prova Linux, que mora no CI.

## Motivo do humano

Nenhum: falta só a leitura do run do CI pelo gatekeeper.
