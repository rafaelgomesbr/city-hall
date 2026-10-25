# V2-F01-E05, dívida DV-15: o Semgrep e as dependências dele são instalados por hash

Conserto no commit `d9ec831` (junto com a DV-22). Evidência desta dívida em `saidas/`.

## Fatos

### O defeito

O `sast.yml` instalava `pip install "semgrep==1.136.0" "setuptools<81"`: a versão do Semgrep estava
fixa, mas nem o hash dos arquivos dele nem a árvore de dependências transitivas. Um pacote adulterado no
PyPI com a mesma versão, ou uma transitiva nova, entrava no CI.

### O conserto

- `.semgrep/requirements.in` (as duas entradas de antes) e `.semgrep/requirements.txt`, **gerado** por
  `uv 0.9.5` com `uv pip compile .semgrep/requirements.in --python-version 3.11 --python-platform
  x86_64-manylinux_2_28 --generate-hashes --exclude-newer 2026-10-25T00:00:00Z`. O cabeçalho do arquivo traz
  o comando. Resultado: 46 pacotes (Semgrep, `setuptools` e 44 transitivas), 480 hashes SHA-256, nenhum
  pacote sem hash (`01`).
- Reprodutível: gerar de novo com o mesmo comando dá o mesmo arquivo, byte a byte (`02`). A data de corte
  (`--exclude-newer`) é o que impede uma publicação nova de mudar o resultado.
- `.github/workflows/sast.yml`: o passo de instalação agora é
  `pip install --require-hashes --no-deps --only-binary=:all: -r .semgrep/requirements.txt`, seguido de
  `semgrep --version | grep -Fx "${SEMGREP_VERSION}"`. `--no-deps` porque o arquivo já traz a árvore;
  `--only-binary` porque compilar um sdist rodaria código de build sem hash.
- `dc360/scripts/excecoes-de-seguranca.test.mjs` ganhou 3 casos: o workflow só tem `pip install` com os
  quatro marcadores e sem pacote avulso; o arquivo tem versão exata e hash em todo pacote, cabeçalho de
  geração, Python 3.11, data de corte e a versão do Semgrep igual à do workflow e à do `.in`; e o verificador
  de arquivo com hash morde (sem hash, versão em faixa, hash curto, URL, `git+`).

### Provas (`saidas/`)

- `03`: `pip download --require-hashes --no-deps --only-binary=:all:` para Linux x86_64 e Python 3.11 (o
  runner do CI) baixa e verifica os **46 de 46** arquivos, incluindo o wheel do Semgrep
  (`...manylinux2014_x86_64.whl`). Isso também prova que não há pacote só-sdist na árvore.
- `04`: com um caractere do hash trocado em cada pacote, o pip **recusa** ("THESE PACKAGES DO NOT MATCH THE
  HASHES"), código 1.
- `05`: o Semgrep 1.136.0 instalado do arquivo travado (macOS, na máquina local) roda
  `semgrep --test` nas regras próprias: 4 de 4.
- `06`: os testes novos passam; com o `sast.yml` ANTIGO, 2 testes quebram (mordida).

### Limitações

- O passo de instalação do `sast.yml` não rodou num runner ainda (precisa do push do ramo). A prova de que
  o conjunto instala com `--require-hashes` em Linux e Python 3.11 é o `pip download` da `03`, que usa as
  mesmas verificações; a instalação em si no runner fica para o primeiro run.
- O `pip` do runner (da imagem do `setup-python`) não foi fixado: ele é a ferramenta que confere os hashes e
  vem do runner, fora do arquivo travado.
- Subir o Semgrep passa a pedir regerar o `requirements.txt` (comando no cabeçalho) além de trocar
  `SEMGREP_VERSION`; o teste quebra se um dos dois ficar para trás.

## Justificativa

A dívida pedia as dependências transitivas travadas por um `requirements` com hashes gerado de forma
reproduzível, e um teste de que o workflow usa `--require-hashes`. Os dois estão feitos, com a geração
reproduzida e o `--require-hashes` provado nas duas direções (aceita o conjunto legítimo, recusa o adulterado).
