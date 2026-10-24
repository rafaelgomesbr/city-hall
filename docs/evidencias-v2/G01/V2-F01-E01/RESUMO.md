# V2-F01-E01, proteção da master (PR obrigatório, checks obrigatórios, sem push direto, auto-aprovação registrada)

## Fatos

**O que esta etapa entrega no repositório (o que é código e documento):**

- `.github/rulesets/master.json`: o ruleset da `master`, pronto para importar (cópia byte a byte em `ruleset-master.json`, nesta pasta). Regras: `deletion`, `non_fast_forward` (sem force-push), `required_linear_history`, `pull_request` (0 aprovações, `allowed_merge_methods` só `squash`, `require_code_owner_review` falso), `required_status_checks` (branch atualizado, nove checks, cada um preso ao app GitHub Actions por `integration_id` 15368) e `bypass_actors` vazio (sem exceção, administrador incluído). `enforcement` é `active`.
- `.github/pull_request_template.md`: checklist de auto-aprovação (gates locais, escopo, migração aditiva, rollback, evidência, isolamento e autorização, segredos, texto, registro do roadmap) e campo "Auto-aprovado por" com nome e data.
- `.github/CODEOWNERS`: `/dc360/db/migrations/`, `/dc360/apps/api/src/auth/` e `/.github/`, dono `@rafaelgomesbr`.
- `CLAUDE.md`: um item novo na lista do sistema D-30 (a `master` não recebe commit direto; entra por PR com checks verdes, checklist do modelo e squash feito pelo Rafael). Nenhuma outra regra foi tocada.
- `dc360/README.md`: seção "Proteção da `master` (ruleset)" dentro de "Integração contínua".
- `dc360/scripts/ruleset-master.test.mjs` (novo, 10 casos) e a linha `V2-F01-E01: 10` em `dc360/scripts/baseline.mjs` (tabela e mapa de arquivos).

**Leitura do estado atual no GitHub (sem token, `saidas/01-leitura-da-api-publica.txt`, 2026-10-24):** `GET /repos/rafaelgomesbr/city-hall/rulesets` devolve lista vazia, `GET /rules/branches/master` devolve lista vazia, `branches/master` traz `"protected": false` e o repositório é público (`"private": false`). Ou seja: hoje a `master` não tem ruleset nem proteção clássica visível publicamente. `branches/master/protection` exige autenticação (401), então a leitura da proteção clássica por esse caminho NÃO foi possível; o campo `protected: false` é o que a API pública mostra. O ponteiro da `master` no GitHub está em `e82719e` (17/09/2026), bem atrás da `v2/f01`.

**Nomes de check, corrigidos contra os workflows reais.** Os quatro nomes citados no texto da etapa estão velhos ("Testes, tipos e auditoria" não existe mais; o job `produto` se chama `Testes, tipos e scripts`). Os nomes de exibição lidos de `.github/workflows/`:

| Arquivo | Job | Nome de exibição | Roda em PR | No ruleset |
| --- | --- | --- | --- | --- |
| verificar.yml | produto | Testes, tipos e scripts | sim | sim |
| verificar.yml | dependencias | Dependências com vulnerabilidade conhecida (auditar) | sim | sim |
| verificar.yml | roadmap | Ferramentas do roadmap e estado gerado | sim | sim |
| verificar.yml | navegador | Fluxo ponta a ponta no navegador | sim | sim |
| verificar.yml | demonstracao | Pacote da demonstração | sim | sim |
| verificar.yml | aplicativo | Aplicativo de campo | sim | sim |
| verificar.yml | implantavel | A API sobe contra Postgres real | sim | sim |
| segredos.yml | segredos | Varredura de segredos | sim | sim |
| sast.yml | semgrep | SAST (Semgrep) | sim | sim |
| verificar.yml | windows | Windows (auditar, test:scripts e conferir:numeros) | sim | não (decisão do Rafael) |
| verificar.yml | plataformas | Ambiente hostil (CRLF, OPENSSL_CONF, cache do Expo) em windows-latest e em ubuntu-latest | sim | não (decisão do Rafael) |
| verificar.yml | baseline | Linha de base (baseline.mjs) em Linux | não (`if:` só em disparo manual, agenda ou `[ci completo]`) | NÃO pode entrar |
| verificar.yml | restore | Restore do banco, Postgres 17 (CA-08) | não (mesmo `if:`) | NÃO pode entrar |

Os dois últimos não podem ser obrigatórios: em pull request eles nem aparecem, e um check obrigatório que nunca reporta trava o PR para sempre. O `windows` e o `plataformas` rodam em todo PR e custam até 40 e 45 minutos (limite do job); ficaram de fora da proposta por custo, mas entram sem problema se o Rafael quiser (para o `plataformas`, os dois nomes de matriz acima, um por sistema).

**Testes (`saidas/`):**

- `02-ruleset-master-test.txt`: `node --test scripts/ruleset-master.test.mjs`, 10 de 10. Cobre: o leitor de workflows acha os jobs certos; o JSON real não tem problema; cada check obrigatório é o nome de um job que roda em todo PR; `bypass_actors` vazio; só squash, sem force-push nem exclusão; CODEOWNERS com os três caminhos (que existem) e um dono por linha; modelo de PR com os itens do checklist; `CLAUDE.md` com a regra e sem travessão nos arquivos novos. Dois casos são negativos (rulesets sintéticos estragados reprovam por exceção, check inventado, dois métodos de merge, aprovação exigida, sem os checks de segredos e SAST, branch não atualizado, sem `non_fast_forward`, alvo errado, ruleset não ativo).
- `03-ruleset-master-test-COM-JOB-RENOMEADO.txt`: prova de que o teste morde no repositório real. Com o job `Aplicativo de campo` renomeado temporariamente em `verificar.yml` (revertido depois), o teste falha (7 passam, 3 falham, com "o check \"Aplicativo de campo\" não é o nome de nenhum job que roda em pull request"). Foi o `verificar.yml` real, sem commit dessa mudança.
- `04-test-scripts.txt`: `npm run test:scripts`, 462 testes, 458 passam, 0 falham, 4 pulados (os mesmos 4 pulos por ambiente que já existiam; nenhum é desta etapa). Rodado antes de a evidência entrar na pasta e do índice existir (o conferidor de índices reprova pasta de etapa sem `INDEX.md`, então a saída arquivada vem de uma rodada com a pasta ainda sem este arquivo).
- `05-conferir-numeros.txt`: `npm run conferir:numeros` verde (25 afirmações; o total de testes de `test:scripts` não é um número contado pelo conferidor, então README e `COLOCAR-DE-PE.md` não mudaram de totais).
- `06-regras-de-conteudo.txt`: `vitest run --root packages/shared test/regras-de-conteudo.test.ts`, 10 de 10 (inclui "nenhum travessão em texto nenhum").
- `07-baseline-test.txt`: `node --test scripts/baseline.test.mjs`, 29 de 29.

**Ambiente:** foi preciso `npm ci` e `npm run build:shared` em `dc360/` neste worktree, que estava sem `node_modules`; nada disso entra no commit.

**Limitações, ditas abertamente:**

- Nada foi aplicado no GitHub. Os testes de comportamento da etapa (PR de prova mesclado por squash, PR com check vermelho sem mesclar, push direto e `--force` recusados, `GITHUB_TOKEN` e dono sem bypass recusados) só existem depois de o ruleset ser importado: NÃO foram executados e não há saída de recusa para arquivar. Estão listados como pendência humana abaixo.
- O formato do JSON segue o export do GitHub para rulesets de repositório (`source_type`, `source`, `conditions.ref_name`, `rules[].parameters`); não foi possível importá-lo aqui para confirmar que o GitHub o aceita sem ajuste. O campo `allowed_merge_methods` e o `integration_id` 15368 (app GitHub Actions) são os pontos a conferir na importação.
- `require_code_owner_review` ficou falso porque o autor do PR não consegue aprovar o próprio PR: ligá-lo com um só contribuinte travaria a `master`. O CODEOWNERS só pede a revisão por enquanto.

## Justificativa

- **Nomes reais, e a lista maior que quatro.** O ruleset é contrato com os nomes dos jobs (`04-fundacao-engenharia.md`, linha de ordem sugerida). Os quatro do texto da etapa eram de um tempo em que havia cinco jobs; hoje há nove que rodam em todo PR. Deixar fora `dependencias`, `roadmap`, `segredos` e `SAST` seria aceitar PR com dependência vulnerável, segredo ou achado de SAST, que é o que E04, E05 e o `auditar` existem para impedir. Por isso a proposta tem nove. A lista final é do Rafael.
- **`integration_id` 15368.** Sem ele, qualquer app ou integração que publique um status com o mesmo nome satisfaz o check. Preso ao GitHub Actions, só um job de workflow vale. É endurecimento barato e fácil de tirar se a importação reclamar.
- **0 aprovações com checklist.** É o que o texto da etapa manda enquanto houver um só contribuinte: o registro de revisão é o modelo de PR preenchido, que o squash grava na mensagem do commit. Com a E16 e o CP-07 passa a 1 aprovação e `require_code_owner_review` a verdadeiro.
- **`required_linear_history` junto do squash.** Squash já gera histórico linear; a regra existe para fechar a porta de um merge commit que entre por outro caminho, e é o que impede o push direto de um merge.
- **O teste liga o JSON aos workflows.** A única falha silenciosa possível aqui é check obrigatório com nome que não existe (PR esperando para sempre) depois de um job ser renomeado. O teste existe para o CI do próprio PR da E02 (que mexe em `verificar.yml`) pegar isso antes do merge.
- **CLAUDE.md.** A etapa manda trocar commit direto por PR; o item novo vale a partir da escolha de política (mesmo antes de o GitHub impor) e foi escrito junto das regras do D-30, que já dizem que merge e push em master são do Rafael. As regras do protótipo (`mockup/`, checkpoints "CPx") não foram tocadas porque são de outra base de código.

## Para o orquestrador

**Linha do STATUS sugerida:** `V2-F01-E01 | IMPLEMENTADA | candidato <sha7> | ruleset da master em .github/rulesets/master.json (9 checks), modelo de PR e CODEOWNERS prontos; aplicar o ruleset e provar a recusa do push direto são pendências humanas`.

**Pendências humanas (o Rafael faz fora do repositório):**

1. **Decidir a lista final de checks.** Proposta: os nove da tabela. Opcionais: `Windows (auditar, test:scripts e conferir:numeros)` e os dois do `plataformas` (`Ambiente hostil (CRLF, OPENSSL_CONF, cache do Expo) em windows-latest` e `... em ubuntu-latest`). Se mudar a lista, editar `.github/rulesets/master.json`; o teste confere os nomes.
2. **Escolher QUANDO ativar, e isso é uma decisão dele.** O ruleset só pode ser importado DEPOIS do merge da `v2/f00` na `master`. Motivo: com o ruleset ativo, nenhum merge ou push direto na `master` é possível, e o merge da F00 passaria a exigir PR. Duas rotas: (A) mesclar a F00 como hoje (merge ou fast-forward, que preserva os commits e os SHAs de candidato que o STATUS cita) e só então ativar; (B) ativar antes e mesclar a F00 por PR, que só aceita squash (a F00 vira um commit único na `master`). Recomendação desta etapa: A.
3. **Importar o JSON:** GitHub, Settings, Rules, Rulesets, New ruleset, Import a ruleset, arquivo `.github/rulesets/master.json`. Conferir que os nove checks aparecem e que o aviso de "bypass" está vazio.
4. **Provar a recusa (validação humana da etapa):** na `master` limpa, `git push origin master` com um commit qualquer e `git push --force origin master` devem ser recusados com a mensagem de regra do repositório; guardar a saída em `saidas/` desta pasta. Depois, um PR de prova: abrir PR trivial, ver o botão de merge bloqueado até os nove checks ficarem verdes, mesclar por squash e confirmar que só o squash é oferecido; abrir outro PR com um check vermelho e ver que não mescla.
5. **Plano do GitHub:** o repositório é público, então ruleset e checks obrigatórios estão disponíveis sem custo (NÃO CONFIRMADO só para o caso de ele virar privado).

**Riscos para a ordem do lote:**

- **E02 (`verificar.yml`):** o texto da E02 diz que `demonstracao` deixa de rodar quando só o produto muda. Se isso for feito com `if:` no job, o check aparece como "Skipped" e conta como satisfeito; se for feito com filtro `paths:` no workflow, o check nunca reporta e trava todo PR que não toque nesses caminhos. Também: qualquer job renomeado ou removido na E02 precisa acompanhar o JSON (o teste desta etapa reprova).
- **Squash e o job `roadmap`:** `gerar-estado.mjs --conferir` reprova STATUS que cita hash de commit inexistente no histórico. Depois de um merge por squash, os SHAs dos candidatos ficam só no ramo da fase, não na `master`; PR novo a partir da `master` pode passar a reprovar o check obrigatório `Ferramentas do roadmap e estado gerado`. Não foi investigado a fundo nem testado. Quem for dono do `roadmap` ou do STATUS precisa decidir (ex.: o conferidor aceitar hash alcançável por qualquer ramo remoto, ou o merge de fase não ser squash). Não decidi.
- **Contagem de testes:** quem somar a linha de `ruleset-master.test.mjs` com as de E02, E03 e outras em `baseline.mjs` resolve o conflito na tabela `TESTES_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS` e no mapa de arquivos logo abaixo (minhas linhas são as últimas de cada).
