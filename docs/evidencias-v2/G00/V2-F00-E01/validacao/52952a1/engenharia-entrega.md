---
validador: engenharia-entrega (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E01
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

- **Roteiro reproduzível em máquina limpa (Linux).** Job "Linha de base (baseline.mjs) em Linux" do run 38618369218 (SHA 7585801, diff para 52952a1 só em `STATUS.md`), lido linha a linha e com o artefato `baseline-7585801...` baixado: Node v22.23.3, npm 10.9.9, ubuntu24; o roteiro executa de fato os 19 passos, incluindo os dois `npm ci` (`01-instalar.txt`: "added 193 packages"; `02-instalar-campo.txt`: "added 914 packages"), e termina "Conferem: 19 de 19 ... Divergentes explicadas: 0", "o baseline saiu com código 0". O `INDEX.md` do artefato confere: 21 de 21 SHA-256 batem (recalculados por mim). Atende.
- **Mac (Node 24, `--sem-instalar`).** A linha de base do gatekeeper (`$SP/baseline/RESUMO.md`) deu 15 de 17, código 3, com `teste-api` (1 falha em `openssl-do-teste.test.ts:119`, LibreSSL 3.3.6) e `test-scripts` (0 pulados contra 4, `apps/campo/ios/` presente). `COMO-REPRODUZIR.md` ("O que esperar") e `dc360/README.md:1192-1203` descrevem exatamente essas duas divergências, com a causa de cada uma, a contagem (1309 aprovados, 9 pulados de 1319; 260 de 260) e onde estão as saídas. Resposta à pergunta do gatekeeper: o roteiro, sozinho, NÃO diz o porquê (o `RESUMO.md` gerado traz só "código de saída 1, esperado 0" e "puladas: obtido 0, esperado 4", e marca "divergente (sem explicação, reprova)"); quem lê `COMO-REPRODUZIR.md` inteiro acha a explicação de cada linha e não conclui que quebrou. Numa máquina Mac LIMPA de verdade a pasta `ios/` não existe (`apps/campo/.gitignore:19`), então só `teste-api` divergiria (18 de 19, código 3): a causa está escrita no mesmo parágrafo. Atende ao "reproduzido ou com divergência explicada" da DoD, com achado de clareza abaixo.
- **Defeito da rodada 2 (doc prometia código 1 por V-DEP-4).** Não morde mais: `COMO-REPRODUZIR.md` e `README.md` dizem código 0 na árvore verde com rede, e o CI deu 0.
- **Defeito da rodada 2 (`audit-raiz` e `audit-campo` aceitavam qualquer código não zero).** Não morde mais: com `npm_config_registry=http://127.0.0.1:9`, `--so=auditar,audit-raiz,audit-campo` dá os três "divergente" e código 3 (`$SP/val/engenharia-entrega/e19-04-baseline-sem-registro.txt`); a saída do `npm audit` sem registro não traz `# npm audit report`.
- **Defeitos da rodada 1 (206 contra 213, `auditar` e `expo-doctor` esperando falha, código 1 numa árvore verde; `conferir:numeros` não lia `baseline.mjs`).** Não mordem: CI 19 de 19 com código 0; número velho plantado no roteiro (console 258 contra 259) faz `conferir:numeros` sair 1 com a diferença e o nome do passo (`e01-03-conferir-numero-velho-no-roteiro.txt`), restaurado com `git restore`.
- **Testes positivos.** `node --test scripts/baseline.test.mjs`: 27 de 27 (`e01-01-baseline-test.txt`); `--so-listar` imprime 19 linhas, código 0, sem criar pasta (árvore limpa depois, `e01-02-so-listar.txt`).
- **Testes negativos (redação).** `redigir` do roteiro mascara JWT e URL de banco com usuário e senha embutidos (sonda `e17-01-redigir-baseline.txt`) e a pasta pessoal (`/Users/[usuario]` na saída do `npm audit` sem registro). Resultado diferente do esperado marca "divergente" e sai 3 (o roteiro mudou de 1 para 3 na correção 1, documentado).
- **Zero segredo na evidência.** `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E01 --sha 52952a1`: "sem falha, 0 aviso(s)". Varredura dos artefatos do CI por JWT, `token=`, `scrypt$`, `senhaTemporaria`, `JWT_SEGREDO=`, `ghp_`, chave privada: zero ocorrência; o único e-mail é fictício (`coordenacao@fornecedor.com.br`).
- **CI distingue os códigos.** O passo "Roteiro da linha de base" (`.github/workflows/verificar.yml:781-818`) falha com 3, com 2 ou outro, com arquivo faltando, com número de resultados diferente do de passos e com código 1 acompanhado de passo "divergente". Leitura do script e do log; com 0 o job passou.

## Evidência

- CI: `gh run view 38618369218 --json jobs` (9 de 9 `success`), log do job 116039196113 em `$SP/val/engenharia-entrega/ci-job-116039196113.log`, artefato em `$SP/val/engenharia-entrega/art/baseline/`.
- `node --test scripts/baseline.test.mjs`, código 0, 27 de 27: `$SP/val/engenharia-entrega/e01-01-baseline-test.txt`.
- `node scripts/baseline.mjs --so-listar`, código 0: `e01-02-so-listar.txt`.
- `npm run conferir:numeros` com `total: 258` plantado no passo `teste-console` de `scripts/baseline.mjs`: código 1 (`e01-03-conferir-numero-velho-no-roteiro.txt`); `git restore dc360/scripts/baseline.mjs`; `git status --porcelain` só com as pastas `validacao/52952a1/`.
- `npm_config_registry=http://127.0.0.1:9 npm_config_fetch_retries=0 node scripts/baseline.mjs --sem-instalar --so=auditar,audit-raiz,audit-campo --saida=$SP/val/engenharia-entrega/bl-sem-registro`: código 3 (`e19-04-baseline-sem-registro.txt`).
- Linha de base do gatekeeper no Mac: `$SP/baseline/RESUMO.md` e `$SP/baseline.log`.

## Cenários positivos

- Linux do CI, 19 passos, código 0. Mac do gatekeeper, 15 de 17 com as duas divergências que o documento prevê.

## Cenários negativos

- Registro npm fora do ar: os dois `npm audit` crus e o `auditar` divergem, código 3.
- Número velho no roteiro: `conferir:numeros` reprova.

## Tentativas de reprovar

- Procurei se o job de Linux pula os `npm ci` ou trata 1 como verde sem conferir o `resultados.json`: não; os dois `npm ci` estão no artefato e o passo confere o arquivo.
- Recalculei o SHA-256 de cada arquivo do artefato do baseline contra o `INDEX.md` dele: 21 de 21.
- Li o `COMO-REPRODUZIR.md` como um leitor de Mac com código 3 na mão: a tabela de códigos diz "É defeito ... Não se anexa um resumo assim sem explicar cada linha", e a explicação das duas linhas está na seção seguinte. Não é falso; é pouco direto (achado 1).
- Rodei a sonda de segredos na saída do roteiro: `?token=`, `senhaTemporaria`, hash `scrypt$`, refresh token e `JWT_SEGREDO=` passam sem redação (achado 2). Nenhum deles apareceu nas saídas desta rodada.
- Conferi se o `--so-listar` grava na pasta padrão de evidência: não grava.

## Achados

1. corrige antes de crescer (dono: E01 ou E21). A divergência de máquina no Mac (LibreSSL) não é nomeada no roteiro: ele sai 3, que a própria tabela de `COMO-REPRODUZIR.md` chama de "defeito", e a frase "o RESUMO.md diz qual passo e por quê" é inexata (o `RESUMO.md` diz qual passo e o que divergiu, não o porquê). Remédio: o teste `openssl-do-teste.test.ts:119` deixar de depender do padrão do OpenSSL 3, ou o roteiro declarar a divergência de plataforma como explicada quando detectar LibreSSL. Reprodução: `node scripts/baseline.mjs --sem-instalar --so=teste-api` num Mac com `/usr/bin/openssl` LibreSSL.
2. corrige antes de crescer (dono: F01-E04, varredura de segredo). `redigir` (`dc360/scripts/baseline.mjs:670-687`) não cobre `?token=` de link de redefinição, `"senhaTemporaria"`, hash `scrypt$`, refresh token nem variável terminada em SEGREDO seguida de sinal de igual e valor. Reprodução: `$SP/val/engenharia-entrega/sondas/amostra-segredos.txt` passado a `redigir`, saída em `e17-01-redigir-baseline.txt`. Hoje só aparecem valores de teste efêmeros (PGlite), por isso não reprova a E01, cujo texto lista JWT, Bearer e URL com credencial.
3. anotado. `dc360/README.md:1180` manda rodar `node scripts/baseline.mjs` sem `--saida`, e o padrão grava em `docs/evidencias-v2/G00/V2-F00-E01/saidas/`, por cima da evidência commitada. `COMO-REPRODUZIR.md` usa `--saida` e está certo.

## Não verificado

- `npm ci` das duas árvores nesta máquina (proibido aqui): a prova de instalação do zero é o job de Linux do CI.
- Windows nesta rodada (não há Windows aqui); vale a medição registrada nas rodadas anteriores.
- O `RESUMO.md` de uma segunda pessoa: substituído pela emenda D-30 (CI Linux e leitura a frio), como nas rodadas 1 e 2.

## Risco residual

- O `npm audit` e o `expo-doctor` dependem do registro e do dia: o 19 de 19 vale para 2026-10-14; um patch novo do Expo faz o job divergir (de propósito).
- Mac fica com código 3 até o achado 1 ser tratado.

## Motivo do humano

Não se aplica.
