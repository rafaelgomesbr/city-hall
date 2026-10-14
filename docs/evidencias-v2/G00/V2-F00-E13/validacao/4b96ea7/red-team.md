---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E13
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [UI]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito: **PASS** na dimensão red-team (pista 5, redirecionamento aberto pelo `voltarPara`). Evidência em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/redteam` (`redteam/`).

| Critério | Resultado |
| --- | --- |
| `rotaInterna` recusa barra dupla, esquema e `/entrar`, e devolve a tela do papel para `/`, `/?` e `/#` | PASS |
| Nenhum valor que chega de fato ao `voltarPara` leva a outra origem | PASS (o achado 1 é teórico) |

## Evidência

- `redteam/web/destino.test.ts` importa o `destinoDepoisDeEntrar` real de `apps/web/src/paginas/entrar-regras.ts` e resolve cada destino com o analisador de URL do padrão WHATWG (o mesmo dos navegadores); saída `out-e13.txt`. São 24 vetores: barra dupla, barra seguida de barra invertida, duas barras invertidas, `%2F%2F` com e sem barra inicial, `%5C`, `javascript:`, `https://`, espaço inicial, e os caminhos que o navegador entrega em `location.pathname` quando a vítima abre o painel com caminho forjado (a barra invertida vira barra e o resultado com barra dupla é recusado; `%5C` e `%2F` continuam codificados e ficam na mesma origem).
- Resultado: 22 de 24 na mesma origem. Os 2 restantes são cadeias com tabulação ou quebra de linha crua entre as barras, que o analisador remove, virando barra dupla (achado 1).
- Leitura de `App.tsx` e de `react-router` 7.18.2 (`createBrowserLocation`): o `voltarPara` só nasce de `location.state`, que só o próprio painel escreve, a partir de `location.pathname`, `search` e `hash`, que o navegador entrega sem tabulação nem quebra de linha crua. A navegação usa `replace`, que chama `history.replaceState`; destino de outra origem lança erro de segurança em vez de redirecionar.

## Cenários positivos

- `/ocorrencias/1?a=b#c` volta ao mesmo lugar depois de entrar; `/` leva à tela do papel.

## Cenários negativos

- Barra dupla, `https:`, `javascript:` e `/entrar` caem na tela do papel.

## Tentativas de reprovar

1. Barra invertida e codificação por cento: recusadas ou mantidas na mesma origem.
2. Caminho forjado digitado na barra de endereço sem sessão: a rota curinga está dentro da proteção e guarda o caminho já normalizado pelo navegador.
3. Controle de `location.state` por outra origem: impossível pelo modelo de origem do navegador.

## Achados

**ANOTADO (defesa em profundidade)**

1. `rotaInterna` aceita caracteres de controle: barra, tabulação, barra e domínio resolve para outra origem. Não é alcançável hoje (ver Evidência), mas o filtro ficaria mais robusto conferindo se a origem resolvida contra `location.origin` é a mesma.

## Não verificado

- Navegador real (o validador de navegador ocupa as portas do painel); a resolução foi feita pelo analisador WHATWG do Node.

## Risco residual

Nenhum explorável encontrado.

## Motivo do humano

Nenhum.
