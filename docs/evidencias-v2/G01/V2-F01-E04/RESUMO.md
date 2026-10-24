# V2-F01-E04: Varredura de segredos (gitleaks) no CI e no pre-commit

Executada em 2026-10-24, no macOS (arm64, Node 24.15.0), worktree isolado a partir de `v2/f00` (bc3c535). Implementação sem push.

## Fatos

### O que foi entregue

| Arquivo | O que é |
| --- | --- |
| `.github/workflows/segredos.yml` | Job "Varredura de segredos": `ubuntu-24.04`, `timeout-minutes: 10`, `permissions: contents: read`, nenhum segredo. `actions/checkout` e `actions/upload-artifact` fixadas por SHA completo (v4.2.2 e v4.6.2). Baixa o tarball `gitleaks_8.30.1_linux_x64.tar.gz` do release oficial, confere o SHA-256 (`551f6fc8...470eb`) com `sha256sum --check --strict` e roda `gitleaks git --redact --log-opts="HEAD"` com `fetch-depth: 0`. Sem a ação licenciada `gitleaks-action`. Relatório JSON redigido sobe como artefato mesmo em falha. |
| `.gitleaks.toml` | Regras padrão (`useDefault = true`) mais 12 exceções, cada uma com razão, `targetRules` e arquivo escrito por inteiro (10 por caminho, 2 por conteúdo da linha). |
| `.githooks/pre-commit` | Modo 100755. Varre o que está em stage (`gitleaks git --pre-commit --staged --redact`). Sem gitleaks instalado só avisa e deixa o commit seguir. |
| `dc360/package.json` | Único acréscimo: `"preparar": "git config core.hooksPath .githooks"`. Não é gancho automático do npm (hook é opt-in por máquina). |
| `dc360/scripts/politica-de-segredos.test.mjs` | 19 casos novos (ver abaixo). |
| `dc360/scripts/baseline.mjs` | Linha `V2-F01-E04: 19` e o arquivo na tabela de arquivos por etapa. |
| `dc360/README.md` | Seção "Varredura de segredos (gitleaks)" com a instalação do hook. |

Versão do gitleaks: 8.30.1 (release de 2026-03-21, mais de sete meses de idade). O tarball de `darwin_arm64` usado nas provas locais e o de `linux_x64` do CI foram conferidos contra `gitleaks_8.30.1_checksums.txt` do mesmo release oficial (`saidas/01-binario-e-checksum.txt`, as duas linhas com OK). O binário do CI (linux_x64) foi só baixado e conferido por hash aqui: quem o executa de fato é o runner.

### Varredura do histórico (feita uma vez)

Comando: `gitleaks detect --source . --redact --no-banner --log-opts="--all"` (268 commits, todos os ramos locais, que incluem `master` e `v2/f00`; no remoto só existem esses dois).

- Sem allowlist, só regras padrão: **21 achados em 14 grupos** (`saidas/02-historico-sem-allowlist.txt`, relatório redigido sem dado pessoal em `saidas/08-relatorio-redigido-dos-21-achados.json`).
- Com o `.gitleaks.toml`: **0 achados** (`saidas/03-historico-com-allowlist.txt`).

Nenhum dos 21 é segredo vivo conhecido. Triagem (linha lida com sequências longas mascaradas; nenhum valor foi impresso):

| Grupo | Achados | Natureza | Tratamento |
| --- | --- | --- | --- |
| `generic-api-key` em listas de migrações aplicadas (E07 saída 20, E10 correção 3 saída 42, E25 saída 03) | 5 | O nome `046_senha_provisoria_e_o_dono_do_token_diz_por_que.sql` tem "senha" e "token" e o detector de entropia o lê como chave | Exceção por conteúdo da linha (`regexTarget = "line"`), só na regra `generic-api-key` |
| `generic-api-key` no rótulo de cada rodada da sonda de carga da API (E03 correção 4, saída 01) | 4 | Cabeçalho de rodada com o nome do arquivo da rodada | Exceção por conteúdo, formato exato da linha (descrito na própria exceção do `.gitleaks.toml`) |
| `generic-api-key` em `referencias-a-arquivo.mjs` (E22 correção 3 e 4) | 2 | Lista de pastas `"dc360/apps/api", ...` | Um caminho exato por arquivo |
| `generic-api-key` na sonda `.mts` da E12 | 1 | Nome de coluna de chave de idempotência com um valor de teste | Caminho exato |
| `generic-api-key` no relatório de segurança da E12 | 1 | Frase que cita a API real e nomes de arquivos de sonda | Caminho exato |
| `generic-api-key` em `02-sonda-antes-do-conserto-api.txt` (E10) | 2 | Log de sonda com link `?token=` gerado contra banco de teste em memória, usuários fictícios | Caminho exato. Pendência humana: Rafael confirma na leitura |
| `generic-api-key` no teste do conferidor do relatório visual | 1 | Texto com a palavra token e um valor inventado, escrito de propósito para provar que o conferidor acusa | Caminho exato |
| `jwt` em `conferir-evidencia.test.mjs` | 2 | JWT sintético montado à mão para o teste do conferidor | Caminho exato |
| `jwt` em `dc360/scripts/baseline.test.mjs` | 1 | JWT sintético para o teste do redator | Caminho exato |
| `private-key` em `dc360/apps/api/test/push-segredo.test.ts` | 1 | PEM falso (corpo `MIGHAgEA`) para provar que o erro não vaza a credencial | Caminho exato |
| `gcp-api-key` em `dc360/apps/campo/google-services.json` | 1 | Chave de CLIENTE do Firebase (pública por desenho); a conta de serviço é barrada pelo `.gitignore` | Caminho exato, regras `gcp-api-key` e `generic-api-key` (a segunda é a mesma chave) |

Divergência com o roteiro da etapa: o texto da E04 lista `dc360/apps/api/test/` inteira, `supabase-prod-ca-2021.crt` e `db/seeds/desenvolvimento.sql` na allowlist. Com o gitleaks 8.30.1 esses arquivos NÃO são acusados (`assinatura.test.ts`, `config.test.ts` e os demais `push-*.test.ts` também não), então não entraram: allowlist só com o que o scanner de fato acusa, e por arquivo, nunca pela pasta de testes (o teste de política reprova pasta). Se uma versão futura do gitleaks passar a acusá-los, entra uma exceção por arquivo, com razão. Os segredos de teste `JWT_SEGREDO` das sondas da E09 não aparecem nos ramos locais (nenhum achado neles).

### Provas (todas com `--redact`, nenhum segredo impresso)

- Repositório limpo, regras do repositório: código 0 (`saidas/04-prova-positiva-pr-limpo.txt`).
- Token sintético no formato de PAT do GitHub (`ghp_` mais 36 caracteres gerados ao acaso na hora, nunca real, nunca gravado no repositório): código 1, regra `github-pat`, `Secret: REDACTED`, e o token inteiro não aparece no relatório JSON em disco (`saidas/05-prova-negativa-token-sintetico.txt`).
- Escopo da allowlist: cópia do `push-segredo.test.ts` no caminho perdoado passa (código 0); o mesmo conteúdo num arquivo vizinho da mesma pasta reprova (código 1) (`saidas/06-escopo-da-allowlist.txt`). A exceção não vaza para a pasta.
- Hook real com o gitleaks real: commit limpo passa, commit com token sintético em stage é barrado (código 1, nenhum commit criado), e sem gitleaks no PATH só avisa e o commit segue (`saidas/07-hook-de-pre-commit.txt`).

### Testes

- `node --test scripts/politica-de-segredos.test.mjs`: 19 de 19, 0 pulados (`saidas/09-politica-de-segredos-test.txt`). Cobrem: allowlist só com arquivo existente, razão (40 caracteres ou mais), `targetRules` e regex estreita; reprovação de caminho inexistente, pasta, curinga, caminho sem âncora, exceção sem razão, sem regra-alvo, sem critério, regex ampla e config sem `useDefault`; o leitor de TOML que recusa linha que não entende; hook existente, com shebang, 100755 no índice do git, avisando sem gitleaks, barrando com gitleaks que acusa (falso) e passando quando ele não acha; workflow com histórico completo, `--redact`, `--config`, permissão mínima única, timeout e runner em todo job, toda `uses:` com SHA de 40 dígitos e versão em comentário, versão e SHA-256 do binário, nenhum `secrets.` nem `pull_request_target`; `preparar` aponta `core.hooksPath` para `.githooks` e nenhum gancho automático do npm existe. Quatro casos (o bit de execução no disco e os três que executam o hook em bash) estão marcados para pular no Windows; no macOS e no Linux nenhum pula. O teste do modo 100755 no índice do git roda em todo sistema.
- `npm run test:scripts` (`saidas/12-test-scripts.txt`): 372 casos, 0 falhas, 4 pulados por ambiente (os mesmos 4 do roteiro). Antes desta etapa a árvore tinha 353 (372 menos 19).
- `node --test scripts/baseline.test.mjs`: 29 de 29 (`saidas/10-baseline-test.txt`).
- `npm run conferir:numeros`: "Todos os números da documentação batem com a realidade" (`saidas/13-conferir-numeros.txt`). Nenhum total do README ou do `COLOCAR-DE-PE.md` mudou, porque eles contam testes do vitest e do aplicativo, não os de `scripts/`; só o esperado de `baseline.mjs` mudou.
- Portão de conteúdo (`regras-de-conteudo.test.ts`): 10 de 10 (`saidas/11-portao-de-conteudo.txt`).
- O teste do índice de evidência (`conferir-indices-de-evidencia.test.mjs`) fica verde com o `INDEX.md` desta pasta.
- Teste negativo "antes do conserto": não se aplica, a etapa cria controle novo. A prova de que a regra morde é o conjunto de casos negativos acima mais as provas 05 e 06 com o gitleaks real.

### Limitações (ditas abertamente)

- O workflow NÃO foi executado: não há push neste worktree, então não existe run do CI e nem o "PR de prova reprovado e fechado sem merge" que o roteiro pede. O YAML foi carregado por um parser (Ruby) e o comando de instalação foi conferido por hash, mas o comportamento no runner `ubuntu-24.04` é pendência até o primeiro run. As provas 05 a 07 usaram o binário darwin arm64 da mesma versão.
- `actionlint` não estava instalado; o YAML não passou por ele.
- `--log-opts="HEAD"` no CI varre tudo o que o commit testado alcança, não todos os ramos remotos (decisão: ramo de prova esquecido não deve deixar vermelha toda PR). Um segredo empurrado só num ramo que nunca chega a `master` não é visto por este job; o secret scanning do GitHub (pendência humana abaixo) cobre esse caso.
- O relatório redigido do CI mostra arquivo, linha, regra e commit, e o autor e o e-mail do commit; só o valor do segredo é escondido. O artefato fica 30 dias.
- Exceções por caminho valem para o arquivo inteiro e para uma regra. Evidência nova com texto parecido num arquivo novo exige exceção nova (ou o texto passar pela exceção de conteúdo, só as duas existentes).
- Evidência que COPIA o texto de um falso positivo vira achado novo: a primeira versão deste RESUMO citava as cadeias literais e a varredura do próprio commit candidato a acusou (4 achados). O RESUMO foi reescrito descrevendo, sem copiar. Regra para quem escrever evidência: descreva o falso positivo, não o cole.
- `core.hooksPath` é configuração do repositório compartilhada com os worktrees; `npm run preparar` NÃO foi rodado aqui para não alterar a configuração do repositório principal.
- `dc360/scripts/baseline.mjs` ainda diz num comentário (linha 47) que a varredura automática "só chega com a F01-E04"; ele não foi editado além da linha da etapa para não conflitar com outros implementadores. Texto a ajustar na integração.

## Justificativa

- **Binário fixado por SHA-256 em vez de ação:** a ação oficial exige licença paga em organização, e uma ação de terceiro fixada só por SHA ainda executa código que o repositório não controla. O tarball com hash conferido contra o `checksums.txt` do release oficial é a menor superfície possível.
- **Exceção estreita, por arquivo e por regra:** uma exceção por pasta absolve o próximo segredo de verdade que cair ali. A regra do roteiro ("nunca um caminho amplo") virou teste, e o teste reprova pasta, curinga, caminho órfão, exceção sem razão e exceção sem regra-alvo. As duas exceções por conteúdo existem porque o mesmo texto inofensivo reaparece em evidência nova de toda etapa (lista de migrações do `migrar`, rótulo de rodada de carga); sem elas, cada evidência nova quebraria o CI por um falso positivo previsível.
- **O que não entrou na allowlist:** os arquivos que o roteiro listava e o scanner não acusa. Exceção para o que não é acusado é só superfície de absolvição.
- **Hook que só avisa sem gitleaks:** o hook é opcional por máquina e o CI é o portão que vale (decisão da própria etapa); barrar o commit de quem não instalou a ferramenta só ensinaria a usar `--no-verify`.
- **`--redact` em todo lugar:** o relatório pode ser lido por mais gente do que quem tem o segredo; achado real é rotacionado, não só apagado.
- **Teste sem depender do gitleaks:** o binário não existe em toda máquina, e um teste que pula quando ele falta daria falso verde. O teste cobre a política e o contrato do hook com um gitleaks falso; a prova do scanner de verdade está arquivada nas saídas 02 a 07.

## Para o orquestrador

Linha do STATUS sugerida: `V2-F01-E04 | IMPLEMENTADA | candidato <sha7> (a preencher) | gitleaks 8.30.1 fixado por SHA-256, histórico varrido (21 achados, todos falsos positivos triados, 0 com allowlist), hook, workflow e 19 testes de política; workflow ainda sem run de CI`

Para a integração: `baseline.mjs` ganhou `"V2-F01-E04": 19` (e a linha na tabela de arquivos); o total de `test:scripts` passa de 353 para 372 só com esta etapa, some com os acréscimos dos outros implementadores. `dc360/package.json` recebeu só o script `preparar`.

Pendências humanas (Rafael, fora do repositório):

1. Ligar secret scanning e push protection no GitHub (Settings, Code security). Se o plano não permitir, registrar como NÃO CONFIRMADO resolvido.
2. Incluir o check obrigatório "Varredura de segredos" (nome do job) no ruleset da E01.
3. Depois do primeiro push, abrir o PR de prova com um token sintético (nunca real), conferir que o job reprova com relatório redigido, e fechar sem merge, apagando o ramo (arquivar o link e a captura na evidência).
4. Ler o relatório do histórico (`saidas/08-relatorio-redigido-dos-21-achados.json` e a tabela acima) e conferir a allowlist, em especial: (a) o log de sonda da E10 com `?token=` (confirmar que era de banco de teste e usuário fictício) e (b) a chave AIza do `google-services.json` (confirmar no console do Google Cloud que ela está restrita ao pacote e ao SHA do aplicativo).
5. Quem quiser o hook local: instalar o gitleaks (8.25 ou mais novo) e rodar `npm run preparar` em `dc360/`.
