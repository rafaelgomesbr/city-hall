---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E13
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, A11Y, AUTH]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Mutação na árvore principal, desfeita com `git restore`, `git status` conferido. Saídas em `SCRATCH/validadores/red-team`.

| Critério | Resultado | Prova |
| --- | --- | --- |
| Negativo da etapa: `rotaInterna` recusa `//outro.exemplo`, `https://outro.exemplo` e `/entrar` (o filtro de redirecionamento aberto) | OK | `entrar-regras.ts:59-64`; `sessao-e-entrada.test.ts` 31 de 31, com `//exemplo.com`, `https://exemplo.com`, `/entrar`, `/`, `/?x=1`, `/#topo`. |
| O teste morde | OK | Removi `|| valor.startsWith("//")` de `rotaInterna`: 1 caso reprova (`//exemplo.com` vira destino). Restaurado. |
| Entrar a partir de `/` leva à tela do papel, não a "Esta página não existe" | OK | `destinoDepoisDeEntrar({voltarPara:"/"}, ...)` devolve a tela do papel (casos verdes). |
| Sair de propósito não deixa caminho de volta para a pessoa seguinte | OK | `caminhoDeVolta(saidaVoluntaria=true)` devolve `null` (casos verdes). |

## Evidência

- `$W/e13-rotainterna-sondas.txt`: `rotaInterna` contra 11 entradas hostis.
- `$W/e13-...` (transcrito): `sessao-e-entrada.test.ts` 31 de 31 no SHA; com `//` liberado, 1 falha; restaurado.

## Cenários positivos

- Os quatro papéis que entram por `/` caem na tela inicial do papel (função pura, verde).
- Caminho de volta preservado para link profundo e sessão caída sozinha; apagado na saída voluntária.

## Cenários negativos

- `//outro.exemplo`, `https://outro.exemplo`, `javascript:...` e `/entrar` como `voltarPara`: todos descartados, o login cai na tela do papel.

## Tentativas de reprovar

1. `//host` e esquema absoluto (`https:`, `javascript:`): recusados por `rotaInterna` (não começam com uma só barra). Protegidos por teste que morde.
2. Barra invertida `/\evil.com`, `/\\evil.com`: `rotaInterna` DEIXA PASSAR (começa com uma barra e não com `//`). Mas o sink é `react-router` (`<Navigate to>` e `navegar(...)` via History API), que trata a string como caminho interno do SPA: `pushState` fica na mesma origem (um valor que resolva para outra origem lança SecurityError, nunca carrega a página externa) e um caminho sem rota cai em `NaoEncontrada`. Não é redirecionamento aberto explorável.
3. Espaço e porcentagem (`/ /evil`, `/%2f%2fevil`): passam por `rotaInterna`, mesmo raciocínio: caminho interno, sem carga externa.
4. Biting do `//`: removê-lo faz o teste reprovar. A regra segura.

## Achados

- **anotado.** `rotaInterna` é mais estreito do que o comentário "só rota interna" sugere: aceita barra invertida, espaço e sequências porcentadas (`/\evil.com`, `/ /evil`, `/%2f%2fevil`). Não é explorável porque o consumo é por `react-router` (History API, mesma origem, nunca carrega URL externa), mas se um dia esse destino chegar a `window.location.assign/href`, a barra invertida pode virar protocolo-relativo. Conserto barato: recusar barra invertida e caracteres de controle no começo. Não reprova (não há sink vulnerável hoje).

## Não verificado

- Os dois e2e de navegador (Chromium e Firefox): não os reexecutei; o comportamento do `/` e da saída foi provado por função pura e pelos testes de unidade. O raciocínio sobre barra invertida é por análise do sink (react-router), não por render em navegador vivo.
- Run do CI do SHA (ausente, H32).

## Risco residual

Baixo. O filtro de redirecionamento recusa `//` e esquema absoluto, com teste que morde. As formas que ele deixa passar (barra invertida, espaço, porcentagem) não são explotáveis pelo sink atual (navegação SPA na mesma origem). A regra deve ser endurecida antes de qualquer uso do destino em `window.location`.

## Motivo do humano

Não se aplica a esta dimensão. A validação humana (Rafael digita o domínio e confere a tela do papel; aprova as seis frases de confirmação) segue pendente, de UX.
