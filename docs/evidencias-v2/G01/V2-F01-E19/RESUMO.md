# V2-F01-E19: SBOM por release e verificação de licenças

## Fatos

**O que passou a existir.**

- `dc360/scripts/licencas.mjs` e `dc360/politica-de-licencas.json`: confere a licença de cada
  componente de PRODUÇÃO (tudo que o npm não marca como `dev`, incluindo `devOptional`, a leitura
  conservadora) dos dois lockfiles (`dc360/package-lock.json`, "plataforma", e
  `dc360/apps/campo/package-lock.json`, "campo") contra a política. Lê só o lockfile, sem `npm ci`.
  Entende expressões SPDX (`OR` escolhe a melhor alternativa, `AND` fica com a pior, `WITH` vale pela
  licença base, `+` e caixa não enganam). Veredito por componente: permitida, proibida (famílias
  `AGPL`, `GPL`, `SSPL`), sem licença, fora das duas listas, ou coberta por exceção nomeada.
- **CP-43 aberto, então a política é uma PROPOSTA** (`decisao.status: "proposta"`): licença proibida,
  sem licença ou fora da lista só AVISA (código 0, anotação `::warning` no CI, lista no artefato
  `produto-<sha>`). Com `decisao.status: "decidida"` (exige `decidida_por` e `decidida_em`) os mesmos
  achados REPROVAM (código 1), e licença fora das duas listas reprova também (nega por padrão). Defeito
  do arquivo de política reprova nos DOIS estados: JSON ilegível, campo faltando, exceção sem motivo
  (mínimo 20 caracteres), dono ou data, prazo acima de 366 dias, exceção vencida (reaproveita
  `problemasDaExcecao` de `excecoes-de-seguranca.mjs`), exceção órfã ou desnecessária, e lockfile sem
  nenhum componente (não passa por verde sem ter lido nada). Exceção é por pacote E versão exata.
- Lista proposta (a do roadmap): permitidas MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD,
  CC0-1.0, OFL-1.1; proibidas AGPL, GPL, SSPL. Uma exceção nomeada: `exit@0.1.2` (declara MIT no formato
  antigo `licenses`, que o lockfile não copia; confirmado no registro do npm), dono Rafael, até 2027-01-05.
- Leitura de 2026-10-24 (`saidas/10-licencas-estado-atual.txt`): plataforma 83 componentes, todos
  permitidos; campo 731 componentes, 708 permitidos, 1 por exceção, 0 proibidos, 0 sem licença, 22 fora
  da lista (BlueOak-1.0.0 x6, MPL-2.0 x12 da família `lightningcss`, Unlicense x2, CC-BY-4.0 x1
  `caniuse-lite`, Python-2.0 x1 `argparse`). `node-forge` é `(BSD-3-Clause OR GPL-2.0)` e passa pela
  alternativa BSD. Esses 22 são exatamente o que o CP-43 precisa decidir.
- Passo novo no job `produto` de `.github/workflows/verificar.yml` ("Licenças das dependências de
  produção"), depois de `conferir:numeros`, com `if: !cancelled()` e sem `continue-on-error`. Não mexi
  nos jobs `implantavel` e `imagens`, nem em nome de job, nem em `package.json` ou lockfile.
- `.github/workflows/sbom.yml` (novo): dispara em tag `v*` e `campo-v*` e em `workflow_dispatch`.
  Jobs `sbom-npm` (matriz plataforma e campo; `@cyclonedx/cyclonedx-npm@6.0.1`, publicada em
  2026-08-11, com `--package-lock-only --ignore-npm-errors --omit dev --spec-version 1.6
  --output-reproducible`, rodado por `npm exec --ignore-scripts`), `sbom-imagem` (matriz api e console;
  constrói a imagem como o job `imagens` e gera o CycloneDX com o MESMO Trivy fixo da E20, instalado por
  `varrer-imagem.sh instalar`, sem alterar esse script) e `publicar`, o ÚNICO job com
  `contents: write`, só com `if: github.ref_type == 'tag'`, sem credencial gravada no checkout e com
  checkout esparso de `dc360/scripts`. Topo e demais jobs só leem. Nenhum `secrets.`.
- `dc360/scripts/conferir-sbom.mjs` (CycloneDX com componentes; SBOM vazio reprova) e
  `dc360/scripts/publicar-sbom.sh`: exige os QUATRO arquivos e cada um conferido (mínimos 30, 100, 10,
  10) ou NÃO publica nenhum; grava `SHA256SUMS.txt`; cria o Release como RASCUNHO se não existir (o
  repositório é público e o SBOM lista versões); anexa os cinco arquivos com `--clobber`; recusa tag fora
  de `vX.Y.Z` e `campo-vX.Y.Z`.
- `dc360/scripts/conferir-workflows.test.mjs`: o teste "nenhum workflow declara escrita" passou a
  aceitar exatamente UMA linha de escrita, e só em `sbom.yml` (as travas finas estão em `sbom.test.mjs`).
- `dc360/scripts/baseline.mjs`: duas linhas novas nas duas tabelas (`V2-F01-E19`: 15 e
  `V2-F01-E19-sbom`: 11). `dc360/docs/DEPENDENCIAS.md`: seção "Licenças e inventário (SBOM) por release".

**Testes novos (26).** `scripts/licencas.test.mjs` (15): estado real passa; política versionada;
leitura do lockfile (dev, link, workspace, duplicata, `devOptional`); SPDX; AGPL, sem licença, fora das
listas, exceção vencida, malformada, órfã e desnecessária; política mal formada; lockfile vazio; linha
de comando (saídas 0, 1 e 2); o passo no job `produto`. `scripts/sbom.test.mjs` (11): conferidor de SBOM
e seus códigos de saída; `publicar-sbom.sh` com um `gh` de mentira (cria rascunho, não recria Release
existente, nada publicado se faltar ou estiver vazio um dos quatro, tag inválida); travas do `sbom.yml`.

**Resultados medidos (todos em `saidas/`).**

- `11-testes-novos.txt`: 26 de 26 passam. `12-test-scripts.txt`: `npm run test:scripts` 669 testes, 664
  passam, 4 pulados por ambiente (nenhum dos testes novos, que só pulam em Windows) e 1 falha, que é só o teste dos índices de evidência,
  porque este `INDEX.md` ainda não existia no momento da rodada; depois de gerado, `16` e a conferência
  abaixo ficam verdes. (643 testes antes desta etapa, 669 agora, soma de 26.)
- `13-lint.txt`, `14-lint-teto.txt` (431 supressões, igual ao teto), `15-formato.txt` (765 conferidos, 664 na
  baseline, não subiu): verdes. A baseline do lint e a de formatação NÃO foram tocadas; os arquivos novos
  nasceram formatados (`node scripts/formato-conferir.mjs --formatar`).
- `16-regras-de-conteudo.txt`: 10 de 10. `17-conferir-numeros.txt`: "Todos os números da documentação batem".
  `18-baseline-workflows-dependabot.txt`: 65 de 65.
- Prova de que os testes mordem (mutação no código, teste quebra, arquivo restaurado):
  `01` (família proibida deixa de casar: 2 testes quebram), `02` (exceção vencida passa a valer: 1),
  `03` (sem licença vira permitida: 4), `04` (o `publicar` perde a condição de tag: 1), `05` (`contents:
  write` no job `sbom-npm`: 1).
- SBOM gerado de verdade com o `cyclonedx-npm` fixado, pelo mesmo comando do workflow:
  `sbom-local-npm-plataforma.cdx.json` (CycloneDX 1.6, 102 KB) e `sbom-local-npm-campo.cdx.json`
  (CycloneDX 1.6, 667 componentes, 1,1 MB, inclui `zod` e a família `lightningcss`). Duas execuções do
  aplicativo deram arquivos idênticos byte a byte (reprodutível). Vieram do lockfile público, sem caminho
  da máquina. Os nomes levam `local` porque o rótulo de produção é a tag.

**O que NÃO foi provado (limitações).** (1) O workflow `sbom.yml` não rodou no GitHub: validar a sintaxe,
o `npm exec` no runner, a construção das duas imagens e a geração do SBOM de imagem pelo Trivy real
exige `workflow_dispatch` (docker e Trivy não existem nesta máquina, então os dois SBOM de imagem NÃO
foram gerados aqui). (2) `publicar-sbom.sh` foi testado só com um `gh` de mentira: o comportamento real de
`gh release view/create/upload` com Release em rascunho não foi exercitado. (3) O gerador npm resolve as
dependências transitivas dele no momento do `npm exec` (a versão do topo é exata, as de baixo flutuam).
(4) O SBOM do aplicativo fica com 667 componentes e a conferência de licença com 731: o gerador usa
`npm ls --omit dev`, que exclui `devOptional`; a licença usa a leitura conservadora. (5) O lint do
aplicativo de campo e o `test:scripts` foram rodados com `apps/campo/node_modules` instalado
(`npm ci --ignore-scripts`), que depois foi apagado.

**Premissas.** PREMISSA: nomes de arquivo `sbom-<tag>-{npm-plataforma,npm-campo,imagem-api,imagem-console}.cdx.json`
e mínimos de componentes (30, 100, 10, 10) são sanidade escolhida por mim, não decisão. PREMISSA: o Release
nasce como rascunho porque o repositório é público; o roadmap diz "Release privado".

## Justificativa

O lockfile é o que a imagem e o binário de loja realmente instalam, é igual em qualquer máquina e dispensa
instalar para conferir, por isso a licença é lida dele e não de `node_modules`. A política carrega o estado
da decisão no próprio arquivo para que o CP-43 seja um commit de uma linha com autor e data, e para que a
mesma ferramenta avise hoje e reprove amanhã sem outra mudança de código; o que é defeito de manutenção do
arquivo (exceção vencida, órfã) reprova desde já, para a lista de exceções envelhecer em público como as do
SAST e do Trivy. Negar por padrão a licença fora das duas listas depois da decisão evita que "MPL-2.0" ou
"Unlicense" entrem sem ninguém ler. O job `publicar` é separado e curto porque é o único que escreve: o
que gera só lê, e a prova de que isso não regride é um teste, não um comentário. O script de publicação
existe como arquivo para ser testado com um `gh` de mentira, no mesmo molde do `varrer-imagem.sh`.

## Para o orquestrador

Linha sugerida para o STATUS: `V2-F01-E19 | IMPLEMENTADA | candidato <sha7>. licencas.mjs com política em PROPOSTA (CP-43 aberto: só avisa, 22 componentes do aplicativo fora da lista), sbom.yml (4 SBOM CycloneDX por tag, escrita só no job publicar), passo no job produto. Pendente: rodar sbom.yml por workflow_dispatch (docker e Trivy reais) e CP-43.`

Pendências humanas (fora do repositório):

1. **CP-43**: Rafael, com o jurídico, decide a lista. Os 22 componentes fora da lista estão em
   `saidas/10-licencas-estado-atual.txt`. Decidido, edita `decisao` em `dc360/politica-de-licencas.json`
   (`status: "decidida"`, `decidida_por`, `decidida_em`) e a conferência passa a reprovar.
2. Disparar `sbom.yml` por `workflow_dispatch` depois do merge (o gatilho manual só vale no ramo padrão) e abrir
   os quatro SBOM dos artefatos `sbom-npm-*` e `sbom-imagem-*`: é a validação humana da etapa.
3. Na primeira tag real, conferir que o Release foi criado como rascunho e decidir quando publicar.
4. A exceção `exit@0.1.2` vence em 2027-01-05: renovar ou apagar.
5. Se o fluxo de release (E12) criar o Release antes do SBOM, o `publicar-sbom.sh` só anexa; se criar depois
   da tag de outro modo, rever a ordem.
