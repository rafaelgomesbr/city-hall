---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E01
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

- Roteiro lista os 19 passos sem executar: `node scripts/baseline.mjs --so-listar`, saída 0, 19 comandos na ordem da etapa (npm ci x2, typecheck, 6 suítes, test:campo, test:scripts, conferir:numeros, auditar, npm audit x2, expo-doctor, e2e, e2e-api).
- `node --test scripts/baseline.test.mjs`: 16 de 16 (inclui `--so-listar` sem criar pasta).
- `.nvmrc` com `22`; README (linha 1059 em diante) e `docs/COLOCAR-DE-PE.md:753` trazem a matriz de versões.
- Redação: `redigir` mascara JWT, `Bearer`/`bearer`, URL de banco com usuário e senha (inclusive com senha codificada por percentual) e troca U+2014 por `[travessao]`.
- Varredura da evidência (E01, E02, E03) por JWT, Bearer, URL com senha, pasta de usuário e U+2014: zero ocorrência. SHA-256 de todos os arquivos do `INDEX.md` conferem (22 de 22 em E01).
- Emenda D-30 do G00 (independência de ambiente): job "Linha de base (baseline.mjs) em Linux" do run 37739535524 verde; artefato `baseline-7005a60...` existe, não expirou, foi baixado e lido (ubuntu24, Node 22.23.3, npm 10.9.9, 19 passos com saída arquivada).
- Isolamento preservado: `npm run test:isolamento` local, saída 0, 327 passam, 3 pulados, `isolamento.test.ts` 137 de 137.

## Evidência

Scratchpad da sessão: `ci-baseline.log`, `art/baseline/RESUMO.md` (Linux), `bl1/RESUMO.md` (roteiro local com `--so=test-scripts,conferir-numeros,teste-shared`), `iso.txt`, `test-scripts.txt`, `red.mjs`.
Linux: 16 de 19 passos "confere", 3 "divergente": test-scripts (obtido 213, esperado 206), auditar e expo-doctor (ficaram verdes, esperado falha). A mesma divergência de contagem foi reproduzida no Windows localmente.

## Cenários positivos

Roteiro local `--sem-instalar --so=...`: teste-shared e conferir-numeros "confere". Linux idem em 16 passos.

## Cenários negativos

Contagem fora do esperado marca "divergente" e o roteiro sai com 1 (visto no Linux: "o baseline saiu com código 1"); não esconde. Redação com texto sujo (acima). Passo que esperava falha e ficou verde também marca divergente.

## Tentativas de reprovar

- Redação com variantes: `PGPASSWORD=...`, `password=...`, token `ghp_...`, `sb_secret_...` e `Cookie:` NÃO são mascarados. A etapa só promete JWT, Bearer e URL com credencial, então não reprova; fica anotado.
- Procurei segredo e caminho de usuário nas saídas arquivadas: nenhum.
- Procurei se o contador de `test:scripts` acompanha os testes novos: NÃO acompanha (achado 1).
- Procurei se o texto de reprodução bate com o roteiro atual: não bate (achado 2).
- Não alterei arquivo do repositório.

## Achados

1. **corrige antes de crescer.** `TESTES_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS` em `dc360/scripts/baseline.mjs` não conhece `scripts/auditar.test.mjs` (7 testes, E19). Total real 213, esperado 165+16+17+1+7 = 206. O comentário promete "número esquecido reprova", mas o conferidor só confere os arquivos listados na tabela. Efeito: o roteiro sai com código 1 numa árvore toda verde (Windows e Linux; CI run 37739535524, passo 12). Reprodução: `cd dc360 && node scripts/baseline.mjs --sem-instalar --so=test-scripts --saida=<pasta>`.
2. **corrige antes de crescer.** `COMO-REPRODUZIR.md` ("O que esperar") e o `RESUMO.md` da E01 descrevem a linha vermelha de 2026-09-30 (shared 1 falha, web 14, jest 20, e2e vermelho). No SHA validado só `audit-raiz` e `audit-campo` ainda saem com 1. Quem seguir o texto vê 3 divergências sem explicação escrita no repositório; a emenda D-30 pede "divergência explicada".
3. **anotado.** Os passos `audit-raiz` e `audit-campo` continuam esperando falha ("confere"): no Linux, `npm audit` da raiz tem 3 (1 moderada, 2 críticas em tinypool/vitest, só desenvolvimento) e o campo 57. O roteiro não distingue exceção aceita (E19) de vermelho esquecido.
4. **anotado.** A redação não cobre `password=`, `PGPASSWORD=`, tokens `ghp_` e cookies (fora do contrato da etapa).

## Não verificado

- `npm ci` limpo em máquina nova (proibido nesta máquina por `29`); só o Linux do CI cobre.
- Execução completa dos 19 passos localmente (35 a 50 min); usei 3 passos e o log Linux.
- Leitura a frio por agente em clone limpo, e macOS.

## Risco residual

A sinalização "divergente" perde valor se o contador e a prosa continuarem velhos: o próximo validador não distingue defeito de ruído sem reler tudo.

## Motivo do humano

Não aplicável (a emenda D-30 substitui a segunda pessoa humana; revisão humana independente fica com CP-07 e F22).
