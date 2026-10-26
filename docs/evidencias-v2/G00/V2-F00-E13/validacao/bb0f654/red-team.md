---
validador: red-team (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E13
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
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

| Critério da etapa | Resultado | Prova |
| --- | --- | --- |
| `rotaInterna` recusa `//outro.exemplo`, `https://outro.exemplo` e `/entrar` (risco de redirecionamento aberto) | PASS | Sonda com 26 valores forjados (saída `03`); navegador com 7 caminhos e estados forjados, nenhum sai da origem (saída `17`). |
| Entrar a partir de `/` leva à tela do papel | PASS | e2e local Chromium 70 de 70, com "entrar a partir de / leva a tela do papel" e "abrir / com a sessao aberta desvia para a tela do papel" (saída `16`); sonda no navegador: `/` termina em `/painel` (saída `17`). |
| A rota índice sem sessão leva a `/entrar` e não concede nada | PASS | `<Route index>` dentro de `<Protegida>` (`App.tsx`); no navegador, `/` sem sessão abre a entrada com `voltarPara: "/"`, que `rotaInterna` descarta. |
| Operador digitando `/usuarios` continua sem o formulário (`Exige`) | PASS | `semente-e-confirmacoes`, `sessao-e-entrada` e o resto do vitest do painel (665 de 665, saída `04`); a recusa real é do servidor (403 `sem_permissao` do operador em rotas de usuários, provado na sonda da E09). |
| Os testes mordem | PASS | Duas mutações em `rotaInterna`, cada uma reprova 1 caso de `sessao-e-entrada.test.ts` (saídas `05` e `06`), desfeitas por `git restore`. |
| Confirmações por `role=status` não revelam dado de outro município | PASS com achado anotado | Os Toasts só repetem o que a própria tela gravou; o único oráculo achado é anterior e do servidor (achado 2). |

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/red-team-E09-E10-E13-E15/`:

- `sonda-entrada.mts` (importa `apps/web/src/paginas/entrar-regras.ts` real): `03-sonda-entrada.txt`, código 0.
- `npm run test --workspace @dc360/web`: `04-vitest-web.txt`, código 0, 665 de 665.
- Mutação 1 (tira a recusa de `/`, `/?` e `/#`): `05-mutacao-raiz.txt`, 1 falha ("entrar a partir de / leva à tela do papel..."). Mutação 2 (tira a recusa de `//`): `06-mutacao-barra-dupla.txt`, 1 falha ("o caminho de volta só aceita rota interna do painel"). Arquivo restaurado e `git status` vazio para ele depois de cada uma.
- Painel construído para uma pasta do scratchpad (`vite build --outDir`, sem `VITE_API_URL`, sem tocar o `dist` do repositório: `15-build-web.txt`), servido por `vite preview` na porta 4173 (processo meu, encerrado no fim); `node test/fluxo.e2e.mjs`: `16-e2e-local-chromium.txt`, código 0, "Passou: 70 Falhou: 0".
- `pw/sonda-voltar.mjs` (Playwright, Chromium): `17-sonda-voltar-navegador.txt`, código 0.
- `sonda-e13.mts` contra a API real e PostgreSQL 17.6 próprio: `07-sonda-cadastro.txt`, código 0.

## Cenários positivos

- `/` sem sessão, entra como coordenadora: termina em `/painel`. `/usuarios` sem sessão, entra: volta a `/usuarios` (link profundo preservado).
- `telaInicial`: coordenador, operador e administrador em `/painel`; agente em `/meu-trabalho`; sem papel em `/entrar`.
- Sair de propósito não deixa caminho de volta (`caminhoDeVolta(true, "/mapa")` é nulo); sessão que caiu sozinha deixa.

## Cenários negativos

- Recusados por `rotaInterna` e trocados pela tela do papel: `//outro.exemplo`, `///outro.exemplo`, `https://outro.exemplo`, `javascript:alert(1)`, ` /painel`, `\t//outro.exemplo`, `/entrar`, `/entrar?x=1`, `/`, `/?x=1`, `/#topo`, vazio, nulo, número e objeto.
- No navegador: `/\outro.exemplo/x` vira caminho `//outro.exemplo/x` (o navegador troca a barra invertida), é recusado, e a entrada termina em `/painel`; `//outro.exemplo/x` idem.

## Tentativas de reprovar

1. **Redirecionamento aberto pelo caminho de volta.** 26 valores na função e 7 no navegador. Achei quatro valores que `rotaInterna` ACEITA e que a regra de URL do navegador resolve para outra origem: `/\outro.exemplo`, `/\/outro.exemplo`, `/<tab>/outro.exemplo` e `/<nova linha>/outro.exemplo` (saída `03`, "SAI DA ORIGEM"). Tentei alcançá-los: pelo endereço não dá, porque o navegador normaliza o caminho antes de o painel lê-lo (barra invertida vira barra, tabulação e quebra de linha somem), e o estado da navegação só é gravável por código da mesma origem. Forçando o estado na mesma origem (o que um atacante de fora não consegue), o painel ficou na origem nos dois casos: a barra invertida terminou em `http://localhost:4173/outro.exemplo`, e a tabulação fez o `replaceState` do React Router lançar erro de segurança (a navegação é sempre `replace`, que não tem o desvio para `location.assign` que o `push` tem). Não reprovou; fica o achado 1.
2. **Entrar no município errado pelo domínio.** Não há escolha de município por host: o painel é um domínio só e a busca por `hostname`, `headers.host` e `x-organizacao` em `apps/web/src` e `apps/api/src` não acha seleção de município (só o filtro de encurtador de mapa). O município vem do token. Não reprovou.
3. **Confirmar existência de órgão ou município pela resposta.** Órgão e equipe são únicos por município (`orgaos_nome_unico_no_municipio`). Usuário não: o e-mail é único no sistema inteiro (`usuarios_email_global_idx`), e o cadastro com o e-mail de uma conta de Vale Fundo feito por Serra Alta responde 409 `usuario_repetido`, contra 201 para e-mail livre (saída `07`). Reprovou como achado 2, fora do que a etapa mudou.
4. **Rota índice concedendo algo sem sessão.** Sem sessão, `/` cai na entrada; nada da estrutura autenticada é desenhado. Não reprovou.
5. **Mutação que o teste não pega.** As duas mutações relevantes de `rotaInterna` foram pegas.

## Achados

1. **Anotado.** `rotaInterna` (`apps/web/src/paginas/entrar-regras.ts`) aceita `/\host`, `/\/host`, `/<tab>/host` e `/<nova linha>/host`, que a regra de URL resolve para outra origem. Hoje inalcançável (caminho normalizado pelo navegador, estado só da mesma origem, navegação por `replace`), por isso não é critério quebrado. Defesa em profundidade sugerida: aceitar só o que `new URL(valor, location.origin).origin === location.origin` confirma, e recusar barra invertida e caractere de controle; um caso de teste com esses quatro.
2. **Anotado (anterior à etapa, servidor).** O cadastro de usuário confirma que um e-mail já tem conta em OUTRO município (409 contra 201), sem dizer qual. Exige `gerenciar_usuarios`. É consequência do e-mail único global (login por e-mail); a mensagem poderia não distinguir, mas a decisão é de desenho de identidade, não desta etapa.

## Não verificado

- Firefox e WebKit: só Chromium nesta dimensão (`MOTOR=firefox npm run test:e2e` não rodado por mim).
- A validação humana "Rafael digita só o domínio" não é desta dimensão.
- Run do CI não lido.

## Risco residual

Baixo. O filtro de redirecionamento cobre o que é alcançável; os quatro valores aceitos dependem de um estado de navegação que só o próprio painel grava.

## Motivo do humano

Nenhum para esta dimensão.
