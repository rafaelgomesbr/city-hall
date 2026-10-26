---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E13
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
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

Diretório de trabalho: `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L10-red-team/` (abaixo, `$W`). Painel construído do SHA (`vite build` no worktree `$W/wt`, `4ce0433`) e servido por `vite preview` na porta 4391, só durante a sonda (processo parado ao fim).

| Critério | Resultado | Prova |
| --- | --- | --- |
| Negativo da etapa: `rotaInterna` recusa `//outro.exemplo`, `https://outro.exemplo` e `/entrar` | OK | `$W/saidas/e13-sonda-rota-interna.txt` (função real, via `destinoDepoisDeEntrar`): os três recusados, e também `HTTPS://`, `javascript:` em qualquer caixa, `data:`, `\\outro.exemplo`, espaço inicial, tabulação inicial, `/`, `/?x=1`, `/#topo` |
| O teste morde | OK | `$W/saidas/e13-testes-e-mordida.txt`: tirar a recusa de `//` reprova "o caminho de volta só aceita rota interna do painel"; tirar a recusa da raiz reprova "entrar a partir de / leva à tela do papel"; tirar a recusa de `/entrar` reprova o primeiro caso. Sem mutação, 69 de 69 nos quatro arquivos da etapa |
| Entrar a partir de `/` leva à tela do papel | OK | navegador real (`$W/saidas/e13-sonda-acesso-e-saida.txt`): operador, coordenador e administrador em `/` vão a `/painel`, agente a `/meu-trabalho` |
| Autorização: a rota índice sem sessão leva a `/entrar` e não concede nada | OK | sem sessão, `/` vai a `/entrar` com `voltarPara: "/"` no estado, que o filtro descarta depois (tela do papel); nada da estrutura autenticada aparece |
| Autorização: operador digitando `/usuarios` continua sem o formulário (`Exige`) | OK | mesma saída: texto "Seu perfil não tem acesso a esta tela..."; o único campo de formulário na página é a busca do cabeçalho (`type=search`, fora do `main`), não o cadastro |
| Sair de propósito não deixa caminho de volta para a pessoa seguinte | OK | coordenador em `/mapa` clica "Sair": `/entrar` com `voltarPara: null`, sessão apagada; o operador que entra em seguida cai em `/painel` |
| Soma do painel em zero | OK | `npx vitest run` do painel no worktree: 44 arquivos, 669 de 669, código 0 (`$W/saidas/e13-vitest-painel-inteiro.txt`) |

Motivo do veredito da rodada 4 (`bb0f654`): a etapa passou em todas as dimensões; o único pendente era a aprovação humana das seis frases de confirmação. Não havia defeito a consertar na correção 4, e a correção 4 não tocou a E13 (nada no diff `bb0f654..4ce0433` muda `entrar-regras.ts` nem `App.tsx`; conferido pelo resultado igual das sondas acima, não por herança).

## Evidência

- `$W/scripts/sonda-e13-rota-interna.test.ts` (copiado ao worktree só para rodar, apagado depois) e `$W/saidas/e13-sonda-rota-interna.txt`: 41 entradas hostis contra o filtro, com a resolução de cada destino aceito por `new URL(destino, origem)`.
- `$W/scripts/sonda-e13-navegador.mjs`, `$W/saidas/e13-sonda-navegador-chromium.txt` e `$W/saidas/e13-sonda-navegador-firefox.txt`: Chromium e Firefox, 12 links digitados com barra invertida, `%5C`, `%2F%2F`, `%09`, `%0A`, `/ENTRAR`, `https:%2F%2F`, `javascript:` no caminho, barra invertida no fragmento, `//` na consulta; e 6 estados de navegação forjados. Para cada um: URL sem sessão, o `voltarPara` guardado, a URL depois de a sessão existir, pedidos fora da origem e erros de página.
- `$W/scripts/sonda-e13-acesso.mjs`, `$W/scripts/sonda-e13-form.mjs` e `$W/saidas/e13-sonda-acesso-e-saida.txt`: rota índice por papel, `Exige`, saída voluntária.
- `$W/saidas/e13-sonda-quebra-de-linha-codificada.txt`: o que o painel desenha para caminho com `%0A`/`%0D`.
- `$W/saidas/e13-testes-e-mordida.txt`, `$W/saidas/e13-vitest-painel-inteiro.txt`, `$W/saidas/e13-build-painel.txt`.

## Cenários positivos

- Link profundo legítimo (`/mapa`, `/ocorrencias/123?aba=x#y`) volta ao lugar depois de entrar.
- Os quatro papéis entram por `/` e chegam à tela do papel.
- Barra invertida no fragmento e `//` na consulta ficam dentro da origem (`/mapa#\\outro.exemplo`, `/mapa?x=//outro.exemplo`).

## Cenários negativos

- Nenhum dos 12 links digitados, em Chromium e Firefox, levou a pedido ou navegação fora da origem (`pedidos fora da origem: []` em todos). O navegador normaliza o caminho antes de o painel lê-lo: `/\outro.exemplo` vira `//outro.exemplo`, que o filtro recusa (cai em `/painel`); `%5C`, `%2F` e `%09` continuam codificados e resolvem dentro da origem.
- Estado forjado com `//outro.exemplo` e `https://outro.exemplo`: recusado, vai a `/painel`.
- Operador em `/usuarios`: recusa com texto, sem o formulário.
- Sem sessão em `/`: nada concedido, só a tela de entrada.

## Tentativas de reprovar

1. Barra invertida, maiúsculas, codificação por cento, espaço, tabulação, quebra de linha, `javascript:`, `data:`, caracteres que imitam barra (U+2215, U+FF0F), `..`, `@` e `:` contra a função (lista completa na saída). Recusados os que a etapa exige; aceitos alguns que resolvem fora da origem (Achado 1).
2. Levar esses aceitos a uma navegação real: por link não dá (o navegador os normaliza ou mantém codificados). Só com `history.state` forjado, o que exige script da mesma origem. Mesmo assim, no SHA, a navegação usa `replace` e o navegador lança `SecurityError` em vez de sair da origem (Chromium e Firefox).
3. `/ENTRAR` e `/entrar/` como caminho de volta (aceitos pelo filtro): o roteador casa sem distinguir caixa e cai em `/entrar` com sessão, que desvia para a tela do papel. Sem laço, sem fuga.
4. Pessoa seguinte no mesmo navegador depois de "Sair": cai na própria tela, não na anterior.
5. Retirar cada uma das três recusas do filtro: o teste reprova em cada caso.

## Achados

1. **corrige antes de crescer**. `rotaInterna` (`apps/web/src/paginas/entrar-regras.ts:59`) aceita `"/\\outro.exemplo"`, `"/\\/outro.exemplo"`, `"/\t/outro.exemplo"`, `"/\n/outro.exemplo"` e `"/\r/outro.exemplo"`, que o analisador de URL do navegador resolve para `https://outro.exemplo/` (barra invertida vira barra; tabulação e quebra de linha são removidas). Hoje não é explorável: o valor só chega ao filtro por `history.state`, que site de fora não escreve, e a navegação é `replace`, que o navegador recusa com `SecurityError` (`$W/saidas/e13-sonda-navegador-chromium.txt`, casos "estado forjado"). Mas o histórico do React Router 7.18.2 (`node_modules/react-router/dist/development/chunk-62JRHF6Z.mjs:310-316`) cai em `window.location.assign(url)` quando `pushState` falha: uma navegação futura com esse destino sem `replace` vira redirecionamento aberto real. Conserto barato: recusar `\` e caracteres de controle (ou conferir `new URL(valor, location.origin).origin === location.origin`) e acrescentar esses casos ao teste.
2. **anotado** (fora do escopo: casamento do roteador, não a rota índice nem o filtro). Caminho com quebra de linha codificada (`/%0A/x`, `/mapa%0A`, `/%0D/x`) desenha página em branco, com ou sem sessão, em vez de "Esta página não existe" ou da tela de entrada. Não concede nada (sem sessão, corpo vazio) e não sai da origem.

## Não verificado

- Rafael digitar só o domínio num navegador e aparelho dele (validação humana da etapa; não é desta dimensão).
- Webkit: as sondas rodaram em Chromium e Firefox.
- O fluxo de entrada pelo formulário com a API real (a sonda usou a sessão gravada em `sessionStorage` e o modo local do painel); a regra de destino é a mesma função nos dois caminhos (`Entrar.tsx:135` e `:428`, `App.tsx:99`), ambos com `replace`.
- Run do CI do SHA (ausente nesta sessão).

## Risco residual

Baixo hoje. O filtro protege contra o que um link consegue produzir, e o `replace` impede a fuga com estado forjado. O risco cresce se alguém trocar uma dessas navegações por `push`, ou passar a alimentar `voltarPara` com texto decodificado ou vindo da consulta da URL: aí os valores do Achado 1 viram redirecionamento aberto.

## Motivo do humano

Não se aplica a esta dimensão. A validação humana da etapa (entrar a partir do domínio e aprovar as seis frases) continua com Rafael.
