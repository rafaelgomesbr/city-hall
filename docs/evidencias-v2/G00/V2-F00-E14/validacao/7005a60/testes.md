---
validador: testes
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
- Os 6 testes verdes, sem arquivo de produto alterado: os 3 arquivos do diff (`a-sessao-que-terminou-nao-e-falta-de-sinal.test.tsx`, `perfil-a-sessao-que-terminou-e-o-aviso-que-fecha.test.tsx`, `push/logout-cala-o-aparelho.test.tsx`) rodam 18 de 18 no jest do app.
- Os testes irmãos seguem verdes: `logout-nao-apaga-prova.test.ts`, `a-sessao-vencida-nao-apaga-a-vistoria.test.tsx`, `falha-de-atualizacao.test.ts` (22 de 22).
- Registro da decisão: `docs/DECISOES-DE-TESTE-DA-FASE-00.md`, seção "campo: sessão encerrada e logout (E14)", com antes, depois, sondas e evidência datada (`index.tsx:1222`, commit 5ecdf4c). A política é cumprida. O irmão citado no registro é o correto (`a-sessao-vencida-nao-apaga-a-vistoria`), com a divergência explicada.
- Qualidade: os dois de frase asserem texto que a tela desenha (comportamento observável pelo usuário), com negativo. Os 4 do logout não mudaram nenhuma asserção, só o dublê. Não há snapshot, `waitFor`, espera fixa nem relógio no que a etapa tocou (o `Date.now()` de `NO_PRAZO` é anterior e relativo).
- O dublê do banco local é de módulo do próprio app (cláusula "nunca mock do que você é dono"), mas é anterior à etapa e o disco real tem prova própria (`logout-nao-apaga-prova.test.ts`, banco de verdade); a etapa o completou e criou o caso de deriva.

## Evidência
- 3 rodadas dos 5 arquivos da E14 e E16 juntos: 48 de 48, 0 falhas nas três (5,6 s cada). Mais 1 rodada de cada arquivo com `--randomize`: tudo verde. Sem instabilidade.
- Mutações (script no scratchpad, arquivo restaurado a cada uma):
  - M1 `falha-de-atualizacao.ts`: acrescentar `Ou use "Sair da conta".` ao detalhe: MORTA no diálogo da lista (1 falha), SOBREVIVE no Perfil (5 de 5 verdes).
  - M2 `Nada é apagado:` para `Quase nada é apagado:`: MORTA (2 falhas).
  - M3 `sessao.tsx` com um SEGUNDO `import { lerDono } from "./banco-local"`: SOBREVIVE (o caso de deriva lê só o primeiro import).
  - M4 `sessao.tsx` com `type ResultadoQualquer` dentro do import: MORTA, mas por falso positivo (trata o tipo como nome faltando no dublê).
- `git status --porcelain` ao fim: só pastas `validacao/`.

## Cenários positivos
Frase vigente, "Nada é apagado", logout com ficha, esquecimento da ficha, município guardado (4 casos), irmãos verdes.

## Cenários negativos
Diálogo sem "Sair da conta" (mordeu em M1); Perfil sem a instrução antiga; deriva do dublê (mordeu na sonda do QA e em M4).

## Tentativas de reprovar
Procurei teste que trave comportamento errado: a instrução "Entrar de novo" é a que o código manda e o botão chama `encerrarSessaoVencida`, não `sair()`. Procurei asserção que nunca falha: o `getByText` positivo falha se o texto some (M2). Procurei negativo estreito demais: achei o do Perfil (M1). Procurei caso de deriva que passe por acaso: achei o buraco de múltiplos imports (M3).

## Achados
- anotado: o negativo do Perfil (`/toque em "Sair da conta"/i`) só recusa a frase antiga exata. Uma instrução reescrita ("Ou use Sair da conta") passa no Perfil; o diálogo da lista (negativo largo) pega o mesmo texto de origem, então o risco real é baixo.
- anotado: o caso de deriva só enxerga a primeira declaração `import { ... } from "./banco-local"` e acusa `type X` inline como nome faltando. Falha ruidosa no segundo, silenciosa no primeiro.
- anotado: o dublê continua mock de módulo interno, aceito pelo registro.

## Não verificado
Leitura humana das frases (texto de produto); renderização no aparelho (Expo não renderiza aqui, a prova é teste de componente).

## Risco residual
Baixo: só teste mudou e as mutações centrais mordem.

## Motivo do humano
O bloco pede que o Rafael leia as frases finais da sessão encerrada: clareza de texto só uma pessoa julga.
