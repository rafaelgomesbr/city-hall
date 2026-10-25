# V2-F01-E20, dívida DV-22: a exceção do Trivy passa a valer por caminho

Conserto no commit `d9ec831` (junto com a DV-15). Evidência desta dívida em `saidas/`.

## Fatos

### O defeito

O `.trivyignore` (uma linha por identificador) valia por CVE na imagem INTEIRA. Os 9 identificadores do npm
embutido na imagem base também calavam a mesma CVE se `brace-expansion`, `picomatch` ou `pacote` aparecesse nas
dependências do app. A defesa que sobrava era o `npm audit` de runtime (CP-03), fora da varredura de imagem.

### O conserto

- `.trivyignore` removido; `.trivyignore.yaml` novo na raiz, formato nativo do Trivy, com as mesmas 9 CVEs e
  `paths: ["usr/local/lib/node_modules/npm/**"]` em cada uma, `statement` com `motivo:` e `dono:` e
  `expired_at: 2026-12-15` (mesmo prazo da exceção anterior).
- `dc360/scripts/varrer-imagem.sh`: o arquivo padrão passou a ser `.trivyignore.yaml`, e o script **recusa**
  (código 2, antes de chamar o Trivy) um arquivo de exceções que não seja `.yaml` ou `.yml`: o formato por linha
  não tem caminho e voltaria ao defeito.
- `dc360/scripts/excecoes-de-seguranca.mjs`: `analisarTrivyignore` (por linha) saiu e entrou
  `analisarTrivyignoreYaml`, um leitor estrito do subconjunto usado. Exige `paths` (sem caminho a exceção
  valeria para a imagem inteira), só aceita caminho que comece por `usr/local/lib/node_modules/npm/`
  (`CAMINHOS_PERMITIDOS`; ampliar é decisão, com política e teste mudados juntos), recusa `..` e barra inicial,
  recusa chaves do Trivy que abririam outra porta (`purls`, `statuses`, outras chaves de topo), e mantém as
  regras de motivo, dono, prazo vigente, no máximo 366 dias, ID repetido e `expired_at` exclusivo.
- `dc360/scripts/excecoes-de-seguranca.test.mjs`: os 7 casos do `.trivyignore` viraram 7 do
  `.trivyignore.yaml` (com o caso novo de caminho ausente ou largo) e entrou 1 caso do script
  (arquivo que não é YAML não roda); o teste do arquivo real exige as 9 entradas, todas restritas ao npm
  embutido, e que o `.trivyignore` antigo não exista.
- `dc360/docs/DEPENDENCIAS.md` e o comentário de `auditoria-semanal.yml` descrevem o formato novo.

### Provas com o Trivy 0.75.0 oficial (`saidas/`)

- `01`: binário do release oficial, SHA-256 conferido contra o `checksums.txt` do release (o do Linux é o
  `TRIVY_SHA256` do script).
- `02`: os 10 achados reais da base `node:22-bookworm-slim@sha256:de170b39...` (Trivy contra o registro, sem
  Docker), cada um com o `PkgPath`: todos em `usr/local/lib/node_modules/npm/node_modules/...`.
- `03` (`trivy convert` com o `--ignorefile`, sobre o relatório real): sem exceção, reprova com 9 CVEs; com o
  `.trivyignore.yaml` novo, **código 0**; acrescentando ao relatório a MESMA CVE-2026-102276 em
  `app/node_modules/brace-expansion`, o formato **antigo (por ID) esconde** (código 0) e o **novo reprova**
  (código 1, só essa CVE); entrada com `expired_at` no passado volta a reprovar (9 CVEs).
- `04`: o `varrer-imagem.sh` REAL (o do CI) com o Trivy oficial na base real: com o `.trivyignore.yaml` sai 0;
  com um arquivo de exceções vazio sai 1; com o formato antigo sai 2 (recusa).
- `05`: 48 de 48; com um `.trivyignore` recriado na raiz, o teste do arquivo real reprova (mordida).

### Limitações

- A imagem do app (com `/app/node_modules`) não foi construída aqui (sem Docker); a prova do "mesmo CVE no app
  continua reprovando" usa o relatório real da base com um achado acrescentado em `app/node_modules/...`, que
  é o que o Trivy produz para um pacote do app. Os runs do CI do `verificar.yml` e da auditoria semanal com o
  `.trivyignore.yaml` só existem depois do push.
- O `verificar.yml` (que outro agente mantém) ainda cita `.trivyignore` num comentário (linha 1172); é só texto,
  sem efeito, e fica para quem estiver com esse arquivo.
- O `paths` foi conferido para o tipo de achado que existe hoje (pacote npm, `PkgPath` preenchido, `03`). Um
  achado de outro tipo (pacote do sistema, por exemplo) que dependa de exceção teria de ter o caminho
  verificado do mesmo jeito, e a política só aceita o prefixo do npm embutido.

## Justificativa

A dívida pedia trocar por `.trivyignore.yaml` com `paths` restritos ao npm embutido, ajustar o script e a
política, e o teste. Está tudo feito, e a prova decisiva é a de execução com o Trivy real: o formato antigo
escondia a CVE no app e o novo não.
