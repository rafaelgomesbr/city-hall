---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E14
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
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

Notação: `$V` é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-qa-e14-18`. O produto em `dc360/` é idêntico entre `fd17ff4` e o HEAD `55209ab` (`git diff --quiet fd17ff4 HEAD -- dc360`, código 0). O diff da rodada (`1ed0b71..fd17ff4`) não toca `dc360/apps/campo` nem `dc360/packages/campo` (`git diff --quiet`, código 0): a regressão possível desta etapa viria só de dependência compartilhada, e por isso a regressão inteira foi rodada de novo. As regressões rodaram na árvore principal; as mutações rodaram numa CÓPIA de `fd17ff4` (`git archive fd17ff4 dc360 | tar -x -C $V/arv`, `node_modules` por link simbólico para a árvore principal, `dist` copiados), sem `git worktree` e sem tocar o repositório. Cada mutação foi aplicada, testada e desfeita com conferência de SHA-256 pelo roteiro `$V/scripts/mutar.mjs`; no fim, a cópia foi comparada com um `git archive` novo de `fd17ff4` (`diff -rq`, só `dist` e `tsbuildinfo` a mais).

| Critério (bloco da etapa) | Prova | Resultado |
| --- | --- | --- |
| DoD: 6 testes verdes (2 de texto, 4 do logout) | jest dos três arquivos e dos irmãos na cópia: 6 suítes, 52 de 52 (`$V/e14-base.txt`); `npm run test:campo` na árvore: 139 suítes, 1997 de 1997, tipos limpos, "A leitura do código e o jest concordam: 1997 casos", código 0 (`$V/r-test-campo.txt`) | PASS |
| Texto vigente exigido ("Entrar de novo", "Nada é apagado") | mutação E14-M2 (a frase volta a mandar "Sair da conta" e a prometer "continua guardado"): os 2 casos de texto reprovam (`$V/mut-e14/E14-M2.txt`) | PASS |
| Negativo: a frase não instrui "Sair da conta" | mutação E14-M3 (frase certa MAIS "Se não der, toque em \"Sair da conta\"" no fim, o que só a asserção negativa pega): os 2 casos reprovam | PASS |
| Dublê com `acolherNoAparelho` e `marcarDonoDosDadosLocais`; os 4 casos exercitam o `sessao.tsx` real | mutação E14-M1 (dublê sem `acolherNoAparelho`): os 4 casos do logout e o de deriva reprovam (5 de 5) | PASS |
| Caso de deriva reprova se `sessao.tsx` importar nome que o dublê não tem | E14-M1 reprova o caso de deriva; E14-M5 (import de namespace, forma diferente) reprova o caso de deriva em vez de passar vazio; E14-M4 (variante nova): ver Achados | PASS com achado anotado |
| `falha-de-atualizacao.test.ts` segue verde | incluído na rodada base, verde | PASS |
| Isolamento: `logout-nao-apaga-prova.test.ts` verde (mesma pessoa reencontra, outro agente começa limpo) | verde na rodada base; mordida do isolamento provada na E15 (mutações S9b, X1 nesta rodada) | PASS |
| Nenhum arquivo de produto alterado pela etapa | `saidas/08-arquivos-do-campo-alterados.txt` da evidência; nesta rodada o diff não toca o app | PASS |
| Decisão registrada com evidência | `docs/DECISOES-DE-TESTE-DA-FASE-00.md`, linha 55 (tabela) e seção "campo: sessão encerrada e logout (E14)" na linha 72 | PASS |
| Regressão obrigatória | `npm run test:campo` código 0; `npm run test --workspace @dc360/campo` 11 arquivos, 238 de 238, código 0 (`$V/r-test-pkg-campo.txt`) | PASS |
| Validação humana: Rafael lê as frases finais | não é produzível por agente | pendência humana |

## Evidência

- `npm run build:shared` código 0 (`$V/r-build-shared.txt`), antes de tudo.
- `npm run test:campo` código 0 (`$V/r-test-campo.txt`).
- `npm run test --workspace @dc360/campo` código 0 (`$V/r-test-pkg-campo.txt`).
- Rodada base dos arquivos da etapa na cópia (`$V/e14-base.txt`): 52 de 52.
- Mutações: lista `$V/muts-e14.json`, saída de cada uma com o trecho trocado em `$V/mut-e14/<id>.txt`, resumo em `$V/mut-e14/RESUMO.txt`.
- CI do SHA: run 39420436042 (sobre `55209ab`, só registro), job "Aplicativo de campo" (118619736571) `success`, com os passos "TypeScript estrito", "Testes do aplicativo" e "Comando da raiz que mede o aplicativo (test:campo)" em `success` (lido pela API pública, `$V/ci-jobs.json`).

## Cenários positivos

- O ⓘ da sessão encerrada e o aviso do Perfil dizem `Toque em "Entrar de novo"` e "Nada é apagado".
- Os 4 casos do logout passam com o dublê completo e o `sessao.tsx` real.

## Cenários negativos

- Frase que instrui "Sair da conta", mesmo junto da frase certa: reprova (E14-M3).
- Dublê sem `acolherNoAparelho`: o caso de deriva e os 4 do logout reprovam (E14-M1).
- Import de `banco-local` em outra forma (namespace): o caso de deriva reprova em vez de achar zero nomes e passar (E14-M5).

## Tentativas de reprovar

1. Repus o texto antigo no produto (E14-M2): reprova, como a etapa diz.
2. Deixei o texto novo e só acrescentei a instrução proibida (E14-M3), para ver se o negativo é real e não só a ausência da frase positiva: reprova nos dois arquivos.
3. Tirei `acolherNoAparelho` do dublê (E14-M1): 5 de 5 reprovam.
4. Variante que a etapa não listou (E14-M4): `sessao.tsx` ganha uma SEGUNDA linha `import { donoDosDadosLocais } from "./banco-local"` e chama o nome em `entrar`. Os 4 casos do logout reprovam com "is not a function", mas o caso de deriva PASSA, porque a regex usa `.exec` e lê só o primeiro import.
5. Troquei o import por namespace (E14-M5): o caso de deriva reprova (não passa vazio).
6. Procurei regressão do diff da rodada no app: nenhum arquivo de `apps/campo` ou `packages/campo` mudou; a suíte inteira e o motor offline fecham verdes.

## Achados

- anotado (não bloqueia): o caso de deriva de `src/push/logout-cala-o-aparelho.test.tsx` (linhas 181 a 198) lê só a PRIMEIRA linha de import de `./banco-local` (`/import\s*\{([^}]+)\}\s*from\s*["']\.\/banco-local["']/.exec(fonte)`). Reprodução: E14-M4 (`$V/mut-e14/E14-M4.txt`), segunda linha de import com `donoDosDadosLocais` usada em `entrar`: o caso de deriva passa e os 4 casos do logout reprovam com "donoDosDadosLocais is not a function", que é exatamente a mensagem que aponta para o lugar errado e que o caso foi escrito para evitar. A suíte ainda fica vermelha, por isso não esconde defeito; só perde o diagnóstico. Conserto simples: iterar com `matchAll` (e `/g`) sobre todos os imports do módulo.

## Não verificado

- O texto desenhado num aparelho real: não há emulador nem aparelho nesta máquina; a prova é o texto que a tela desenha no teste de componente.
- Leitura das frases pelo Rafael (validação humana da etapa).
- Os logs dos jobs do CI exigem token: li só a conclusão dos passos.

## Risco residual

Baixo. As duas frases e o dublê estão presos por testes que mordem nas variantes tentadas. O único furo achado é de diagnóstico do caso de deriva, não de cobertura.

## Motivo do humano

A etapa pede que o Rafael leia as frases finais da sessão encerrada ("Toque em \"Entrar de novo\"... Nada é apagado..."): aprovar texto de produto é decisão de pessoa.
