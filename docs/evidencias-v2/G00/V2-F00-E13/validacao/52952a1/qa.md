---
validador: qa (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E13
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [UI, A11Y, AUTH]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
Veredito: PASS. O painel fecha com zero vermelho (665 de 665), entrar a partir de `/` leva à tela do papel para os quatro papéis da semente contra a API real em Chromium e WebKit, o `voltarPara` não abre redirecionamento para fora, e os testes mordem quando a regra da raiz é desfeita. A rodada 3 não tocou nenhum arquivo desta etapa além de `app.css` e `comuns.tsx` (E09 e E10), e a regressão continua verde.

Saídas em `$SP/val/qa/painel/` (abaixo, `painel/`).

## Critérios verificados

| # | Critério | Resultado e prova |
| --- | --- | --- |
| 1 | Os 5 casos (3 de Toast, `design-system`, `acessibilidade`) e a soma do painel em zero | PASS. `painel/01-web-vitest.txt`: 44 arquivos, 665 testes, 0 falha; `semente-e-confirmacoes` 5, `design-system` 12, `acessibilidade` 21, `seguranca-da-conta` 8, `ocorrencia-encerramento` 13 |
| 2 | Entrar a partir de `/` leva à tela do papel | PASS. e2e local Chromium 70 de 70, com "entrar a partir de / leva a tela do papel" e "abrir / com a sessao aberta desvia" (`painel/03-test-e2e-chromium.txt`). Sonda própria contra a API real: coordenadora `/painel`, operador `/painel`, agente `/meu-trabalho`, administradora `/painel`, nenhum "Esta página não existe", e `/` com sessão desvia para a mesma tela, em Chromium e WebKit (`painel/26-e13-sonda-*.txt`, 18 de 18 cada, zero erro de console) |
| 3 | `rotaInterna` recusa `//outro.exemplo`, URL absoluta e `/entrar` | PASS. `sessao-e-entrada.test.ts` 27 de 27; no navegador, partindo de `//outro.exemplo/x`, `/entrar` e `/\outro.exemplo` a pessoa termina em `/painel` da própria origem; `/%2F%2Foutro.exemplo` termina na página "não existe" da própria origem |
| 4 | Autorização: operador em `/usuarios` sem formulário; índice sem sessão leva à entrada | PASS. Operador que entra pedindo `/usuarios` não vê `#usuario-nome`; `/` sem sessão vai a `/entrar` para os quatro |
| 5 | Confirmações por `role=status` | PASS. Gravar uma equipe em Equipes mostra "Equipe criada. Ela já aparece na lista abaixo." numa região `role=status`, nos dois motores |
| 6 | Regressão: typecheck, paridade, e2e local | PASS. `npm run typecheck` código 0 (`painel/07-typecheck.txt`); `paridade-dos-modos.test.ts` 10 de 10; e2e local Chromium 70 de 70. WebKit: 68 de 70 (`painel/03-test-e2e-webkit.txt`), as 2 falhas são o Tab do motor no macOS (não alcança links, já provado em página mínima na correção da E09) |

## Evidência

- `painel/01-web-vitest.txt` (0), `07-typecheck.txt` (0), `03-test-e2e-chromium.txt` (0), `03-test-e2e-webkit.txt` (1, Tab do motor), `26-e13-sonda-chromium.txt` e `-webkit.txt` (0).
- Prova de que o teste morde: `painel/34-mutacao-e13.diff` (em `entrar-regras.ts`, tirei a recusa de `/` e de `//` em `rotaInterna`), `npx vitest run test/sessao-e-entrada.test.ts`: 2 falhas de 27 ("o caminho de volta só aceita rota interna do painel" e "entrar a partir de / leva à tela do papel") (`painel/34-mutacao-e13-vitest.txt`); `git restore`; 27 de 27 de novo; `git status --porcelain` sem mudança fora de `validacao/52952a1/`.

## Cenários positivos

Os quatro papéis entrando a partir de `/` e abrindo `/` já com sessão; confirmação de gravação anunciada.

## Cenários negativos

Índice sem sessão; operador pedindo `/usuarios`; `voltarPara` com `//outro`, `/entrar`, `%2F%2F` e barra invertida.

## Tentativas de reprovar

1. Variantes de redirecionamento aberto pelo caminho protegido, inclusive codificada e com barra invertida: nenhuma sai da origem.
2. Os quatro papéis, não só o coordenador do e2e: todos caem na tela certa.
3. WebKit além de Chromium: igual, menos o Tab do motor.
4. Desfiz a regra da raiz e a do `//`: o teste reprova.

## Achados

- anotado: no e2e local em WebKit aparece `pageerror` "postgres-*.data due to access control checks" / "Load failed" (banco do modo de demonstração no navegador); a suíte passa 68 de 70 e a tela funciona, mas o erro de console existe nesse motor; não visto em Chromium. Dono provável: modo de demonstração (F10).
- anotado (rodadas anteriores, ainda vale por leitura): o portão estático de `onClick` continua enganável por comentário na mesma linha; `rotaInterna` aceita `/\outro`, provado aqui de novo como não explorável (termina em `/painel`).

## Não verificado

- Firefox (a etapa pede `MOTOR=firefox npm run test:e2e`; o Firefox não está instalado nesta máquina, usei WebKit); leitor de tela; o domínio de produção digitado por uma pessoa (validação humana).

## Risco residual

Sem prova em Firefox nesta rodada; o CI (run 38618369218, job "Fluxo ponta a ponta no navegador" verde) roda em Chromium.

## Motivo do humano

A etapa pede que o Rafael digite só o domínio, entre e chegue à tela do papel.
