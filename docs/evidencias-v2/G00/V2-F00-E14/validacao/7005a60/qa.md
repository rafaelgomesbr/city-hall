---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E14
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [MOBILE, A11Y]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados
- Os 6 testes verdes: `npm run test:campo` (typecheck, jest, contagem) saiu 0, 127 suítes, 1861 de 1861. CI: job "Aplicativo de campo" 1861 de 1861.
- Frase vigente exigida (`Toque em "Entrar de novo"`, `Nada é apagado`) e recusa de `Sair da conta`: `a-sessao-que-terminou-nao-e-falta-de-sinal.test.tsx` e `perfil-a-sessao-que-terminou-e-o-aviso-que-fecha.test.tsx` (diff lido).
- Dublê de `../dados/banco-local` com `acolherNoAparelho` (`{ apagou: false }`) e `marcarDonoDosDadosLocais`; caso de deriva que lê a fonte de `sessao.tsx`.
- Documentação: `docs/DECISOES-DE-TESTE-DA-FASE-00.md`, seção "campo: sessão encerrada e logout" existe (linha 70).
- A decisão confere com o código: `index.tsx:1222` e `falha-de-atualizacao.ts:144-152` (o botão chama `encerrarSessaoVencida`, não `sair()`).
- Nenhum arquivo de produto alterado por esta etapa: os 3 arquivos do diff da etapa são só teste.

## Evidência
- `npm run build:shared` saiu 0; `npm run test:campo` saiu 0 (saída no scratchpad, `campo.txt`).
- Mutações (aplicadas e desfeitas por script, `git status` limpo no fim):
  - `falha-de-atualizacao.ts`: `Toque em "Entrar de novo"` trocado por `Toque em "Sair da conta"`: MORTA nos dois arquivos de frase (1 falha em cada).
  - `falha-de-atualizacao.ts`: `Nada é apagado: ` trocado: MORTA.
  - `sessao.tsx`: import de um quarto nome (`lerDono`) de `./banco-local`: MORTA (caso de deriva).
  - Dublê sem `acolherNoAparelho`: MORTA (5 de 5 falham).

## Cenários positivos
Os 6 casos e os irmãos (`falha-de-atualizacao.test.ts`, `a-sessao-vencida-nao-apaga-a-vistoria`, `logout-nao-apaga-prova`) passam no jest completo.

## Cenários negativos
`queryByText(/Sair da conta/)` nulo no diálogo; `queryByText(/toque em "Sair da conta"/i)` nulo no Perfil (o botão legítimo permanece); deriva do dublê. Todos provados por mutação.

## Tentativas de reprovar
Procurei teste que trave comportamento errado: os dois de frase travam a instrução correta (não mandar `sair()`), confirmada no código. Tentei enfraquecer o dublê, a frase e o import: tudo detectado. "Nada é apagado" é incondicional, mas vale para a mesma conta; outra pessoa entrando no aparelho faz `acolherNoAparelho` limpar (coberto por `logout-nao-apaga-prova`, não por esta etapa). Não achei trava de comportamento errado.

## Achados
- anotado: o texto "Nada é apagado" não distingue "mesma conta" de "outra conta no mesmo aparelho"; o detalhe completo diz "voltam para você assim que entrar com a sua conta", o que cobre.

## Não verificado
Renderização no aparelho (Expo não renderiza aqui; a prova é teste de componente). Leitura das frases finais pelo Rafael.

## Risco residual
Baixo: só teste mudou.

## Motivo do humano
O bloco pede que o Rafael leia as frases finais da sessão encerrada (texto de produto); só uma pessoa julga clareza.
