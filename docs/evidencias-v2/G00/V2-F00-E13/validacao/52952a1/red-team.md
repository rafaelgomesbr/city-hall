---
validador: red-team (agente general-purpose com o papel da dimensão)
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
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito: **PASS na dimensão red-team**. Não há redirecionamento aberto depois da entrada, e rota protegida sem sessão não mostra nada. `entrar-regras.ts` e `App.tsx` não mudaram desde a rodada 2: o diff `4b96ea7..52952a1` em `apps/web/src` só toca `MinhaConta.tsx`, `RecuperarSenha.tsx`, `recuperar-regras.ts`, `comuns.tsx` e `app.css`. Mesmo assim, tudo foi reexecutado em navegador real. Saídas em `$SP/val/red-team/` (prefixo `E13-`).

| Critério | Resultado |
| --- | --- |
| `rotaInterna` recusa `//outro.exemplo`, esquema e `/entrar` | PASS. O teste morde: tirar a recusa de `//` reprova "o caminho de volta só aceita rota interna do painel"; tirar o tratamento de `/` reprova "entrar a partir de / leva à tela do papel"; restaurado, 27 de 27 (`E13-04` a `E13-06`) |
| Entrar a partir de `/` leva à tela do papel | PASS em Chromium e WebKit (`//evil.example/x`, `/\evil.example` e `/./\evil.example` também levam a `/painel`) |
| Rota protegida sem sessão leva a `/entrar` e não concede nada | PASS: os 11 caminhos forjados abrem `/entrar`, com 0 elemento protegido (`.indicador`, `.tabela`) antes da entrada |
| Operador ou agente digitando `/usuarios` continua sem o formulário | PASS: o agente em `/usuarios`, `/equipes` e `/orgaos` lê "Seu perfil não tem acesso a esta tela", sem botão de redefinir nem de encerrar sessões (`E13-03`) |
| Rodada 2, achado anotado (caractere de controle) | Ainda presente e ainda inalcançável (anotado 1) |

## Evidência

- Painel construído do SHA (`npm run build --workspace @dc360/web`, código 0, `E13-00`), servido com `vite preview` na porta 55531 e derrubado no fim (`lsof` sem ouvinte em 555xx).
- Navegador real, modo local: `e13-redirect.cjs` (em `$SP/val/red-team/`), 12 caminhos forjados em Chromium (`E13-01-redirect-chromium.json`) e 11 em WebKit (`E13-02-redirect-webkit.json`). Para cada caminho: abrir sem sessão, entrar como coordenadora e medir a URL final e qualquer pedido para fora da origem.
- `e13-papel.cjs`: o agente em rotas de quem administra, e sair seguido de "voltar" do navegador (`E13-03-papel-e-saida.json`).
- `npx vitest run test/sessao-e-entrada.test.ts`: código 0, 27 de 27; duas mutações, cada uma com código 1 e 1 falha; `git restore` e 27 de 27.
- `E13-07-controle.txt`: resolução WHATWG de `/\t/`, `/\n/` e `/\` contra `rotaInterna`.

## Cenários positivos

- `/ocorrencias/1?a=b#c` volta exatamente ao mesmo lugar depois de entrar; `/usuarios` volta a `/usuarios` para a coordenadora.

## Cenários negativos

- `//evil.example/x`, `/\evil.example`, `/./\evil.example` e `/ocorrencias/..//evil.example`: a tela do papel, na mesma origem.
- `/%2F%2Fevil.example`, `/%5Cevil.example`, `/%09/evil.example` e `/javascript:alert(1)`: ficam como caminho codificado na mesma origem (a rota curinga do painel). Nenhum pedido sai para outra origem, e não há erro de página. Não conferi o texto exibido nesses quatro casos.
- Sair e apertar "voltar": continua em `/entrar`, sem conteúdo protegido.

## Tentativas de reprovar

1. Doze variantes de barra dupla, barra invertida, codificação por cento, ponto e ponto-ponto, tabulação e esquema `javascript:`, em dois motores: nenhuma sai da origem.
2. Controlar `voltarPara` por fora: só o próprio painel escreve `location.state`, a partir de `location.pathname`, que o navegador entrega normalizado.
3. Agente forçando rota de administração pela barra de endereço: a tela recusa, e a API recusa de qualquer jeito (ver E09, T2).
4. Voltar no histórico depois de sair: nada protegido reaparece.

## Achados

**ANOTADO**

1. `rotaInterna` aceita `/\t/evil.example`, `/\n/evil.example` e `/\evil.example`, que o analisador WHATWG resolve para outra origem (`E13-07`). Não é alcançável hoje: o navegador entrega `pathname` sem esses caracteres crus e converte `\` em `/` antes, e o `replaceState` de outra origem lança erro em vez de redirecionar. Defesa em profundidade: conferir `new URL(valor, location.origin).origin === location.origin`.
2. Caminho com `%0a` (por exemplo `/%0a/evil.example` ou `/x%0ay`) deixa a página em branco no modo local, sem erro de console e sem pedido externo, em vez de "Esta página não existe". Não é segurança. Dono provável: F10-E10 (estados padrão).

## Não verificado

- Firefox: não está instalado nesta máquina. O Chromium e o WebKit foram rodados.
- Modo contra a API: rodei o modo local. A lógica de `voltarPara` é a mesma (`App.tsx`), e o e2e contra a API do CI (job "Fluxo ponta a ponta no navegador", run 38618369218) cobre a entrada.

## Risco residual

Nenhum explorável.

## Motivo do humano

Nenhum para esta dimensão.
