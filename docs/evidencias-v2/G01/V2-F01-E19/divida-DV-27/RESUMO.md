# V2-F01-E19, dívida DV-27: o gerador de SBOM e as dependências dele vêm de um lockfile

Conserto no commit `9bbfc4a` (junto com a DV-18). Evidência desta dívida em `saidas/`.

## Fatos

### O defeito

O `sbom.yml` rodava `npm exec --package=@cyclonedx/cyclonedx-npm@6.0.1`: a versão do gerador no topo era
exata, mas as dependências dele são faixas (`^10.0.0`, `^14.0.0`, `^2.0.1`...), resolvidas na hora do
`npm exec` (`saidas/01`). O mesmo código-fonte podia gerar SBOM diferente em dias diferentes, e uma
transitiva adulterada entrava no job que produz o inventário de release. A dívida também registrava que o SBOM
do aplicativo (667 componentes) tem menos itens que a conferência de licença (731).

### O conserto

- `dc360/scripts/sbom-gerador/package.json` e `package-lock.json` (lockfile v3, 176 pacotes, **todos com
  `integrity`**, todos do registro do npm; `npm audit` do lockfile: 0 vulnerabilidades, `saidas/02`). Uma
  dependência direta, `@cyclonedx/cyclonedx-npm` em `6.0.1` exata.
- `.github/workflows/sbom.yml` (job `sbom-npm`): passo novo `npm ci --ignore-scripts --omit=optional --no-audit
  --no-fund --prefix dc360/scripts/sbom-gerador`, seguido da conferência da versão instalada contra
  `CYCLONEDX_NPM_VERSAO`; a geração agora chama o binário instalado
  (`.../sbom-gerador/node_modules/.bin/cyclonedx-npm`), com as mesmas opções de antes. `--omit=optional`
  deixa de fora o validador de XML nativo (`libxmljs2`), que a saída JSON não usa.
- Três lugares guardam a versão (`CYCLONEDX_NPM_VERSAO`, o `package.json` e o lockfile) e o teste confere
  que batem.
- `.github/dependabot.yml`: sexta frente, `npm` em `/dc360/scripts/sbom-gerador`, para o lockfile não
  envelhecer sem aviso (cada subida é PR próprio; o teste de versão obriga a mudar os três lugares).
- `dc360/scripts/sbom.test.mjs` ganhou 3 casos: instalação por `npm ci` com lockfile íntegro e versão igual nos
  três lugares; a regra morde (volta o `npm exec`, `npm install` no lugar do `npm ci`, instalação sem
  `--ignore-scripts`, lockfile sem as transitivas, pacote sem `integrity`, pacote de fora do registro, versão
  fora de sincronia no `package.json` ou no workflow); e o **limite que sobra fica escrito**.
- O limite do `devOptional` (667 contra 731): o `--omit dev` do gerador usa `npm ls`, que exclui
  `devOptional`; a conferência de licença conta `devOptional` como produção, a leitura conservadora. Está no
  comentário do `sbom.yml` (testado) e em `dc360/docs/DEPENDENCIAS.md`. Não é perda, é critério diferente.

### Provas (`saidas/`)

- `01`: as dependências diretas do gerador são faixas; o lockfile novo trava 176 pacotes com integridade.
- `02`: `npm ci --ignore-scripts --omit=optional` (o passo do workflow) instala 22 pacotes, código 0, e
  `cyclonedx-npm --version` dá 6.0.1.
- `03`: o SBOM das duas árvores gerado por esse binário, pelo mesmo comando do workflow, em duas rodadas:
  plataforma com 84 componentes e campo com 667 (o mesmo número da E19), com os dois arquivos idênticos byte a
  byte entre as rodadas, e passando no `conferir-sbom.mjs`.
- `04`: `sbom.test.mjs`, todos passam; com o `sbom.yml` antigo, 2 dos 3 casos novos quebram (mordida).

### Limitações

- O `sbom.yml` não rodou no GitHub ainda: o `npm ci` no runner, o job completo e a construção das imagens só
  provam num run (`workflow_dispatch` ou tag), como já era a limitação da E19.
- Este lockfile não está no `npm run auditar` (que cobre a raiz e o aplicativo). A razão: o gerador não roda no
  produto, só na hora do release. O Dependabot cobre; o `npm audit` do lockfile está em `02` como registro de hoje.
- O SBOM gerado agora pode diferir do gerado antes (as transitivas de antes eram as do dia): a comparação
  de SBOM antes e depois é a regra de qualquer subida do gerador, e este PR é a primeira com lockfile.

## Justificativa

A dívida pedia fixar por lockfile próprio ou documentar o limite com teste. Fez as duas coisas: o gerador e
a árvore dele estão travados com integridade e provadamente reprodutíveis, e a diferença de contagem que a
dívida citava ficou documentada e testada.
