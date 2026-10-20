---
validador: privacidade-lgpd
modelo: claude-sonnet-5-5
etapa: V2-F00-E17
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [LGPD, INFRA]
nivel_de_prova_exigido: [E1, E3a]
nivel_de_prova_obtido: [E1, E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Campo "Impacto LGPD": "a regra 'dump com dado pessoal não fica no repositório, na nuvem de arquivos nem na Área de Trabalho' é preservada e provada nas duas plataformas". Risco declarado: o caso 22 protege onde a cópia de produção (dado de cidadão) pode morar; reescrever sem enfraquecer, os cinco lugares recusados continuam recusados.

Inventário: o dump de produção (`pg_dump` do esquema `public`, com dado real de cidadão) que `scripts/copiar-producao.mjs` grava em `~/dc360-copias` (`PASTA_DE_COPIAS`, fora do repositório, pasta 0700, arquivo 0600, `chmodSync` nas linhas 252-274; a senha vai por `PGPASSWORD`, não pela linha de comando). Os scripts da etapa não tratam dado pessoal; o único dado é o dump.

Controles verificados em `razaoParaRecusarAPasta` (`scripts/copiar-producao.mjs:111-126`): recusa o repositório (raiz e subpasta), qualquer segmento com iCloud, Mobile Documents, Dropbox, Google Drive, GoogleDrive ou OneDrive, e `~/Desktop`; aceita `~/dc360-copias`. O teste reescrito (`scripts/copiar-producao.test.mjs:58-71`) monta os caminhos com `join` e `parse(resolve(".")).root` e cobre os seis casos recusados e o aceito. O código da função não mudou na correção 4 (`git diff bb0f654..4ce0433 -- scripts` só toca `baseline.mjs`).

## Evidência

- `node --test scripts/copiar-producao.test.mjs scripts/comando-de-migracao.test.mjs scripts/entitlements-do-ios.test.mjs`: 22 de 22, código 0 (`e17-scripts.txt`).
- `npm run test:scripts`: 288 testes, 288 aprovados, 0 falha, 0 pulados, código 0 (`e17-all.txt`), no macOS (Node 24.15; o `.nvmrc` pede 22, nada depende disso nestes testes).
- `npm run conferir:numeros`: 25 afirmações, "Todos os números da documentação batem", código 0 (`e17-num.txt`).
- Sonda minha da função com caminhos variados (`sonda-pasta.mjs`): recusa repo, iCloud (Mobile Documents), Dropbox, Google Drive, OneDrive, Desktop; aceita o padrão real (`/Users/rafaelgomes/dc360-copias`) e volume externo.
- Mutações minhas (cada uma restaurada com `cmp`, `git status` limpo): (a) tirei "Mobile Documents" da lista de nuvem: o teste reprova (1 falha, `mut4.txt`); (b) troquei `Desktop` por `Desktopx`: o teste reprova (1 falha, `mut5.txt`). O teste morde nos dois lugares que a regra existe para proteger.
- Segredo na evidência arquivada da etapa (fora de `validacao/`): nenhum literal de senha, token ou URL com credencial.

## Cenários positivos

`~/dc360-copias` fora do repositório é aceita; os quatro lugares de nuvem e a Área de Trabalho são recusados.

## Cenários negativos

Pasta dentro do repositório, em iCloud (`Library/Mobile Documents/...`), Dropbox, Google Drive, OneDrive e `~/Desktop`: todas recusadas, com razão em português.

## Tentativas de reprovar

Tentei burlar a regra com variações: `dropbox` e `desktop` em minúsculas passam (a comparação é sensível à caixa), `~/Documents` passa (em macOS com "Mesa e Documentos no iCloud" ele é sincronizado sem o nome da nuvem no caminho) e um link simbólico para dentro de uma nuvem não é resolvido (`resolve` não segue link). Nenhuma dessas é alcançável hoje porque a pasta de cópias é fixa (`PASTA_DE_COPIAS = ~/dc360-copias`, sem variável nem argumento), então a função só protege contra uma futura configuração. Também tentei achar o dump sendo escrito antes da checagem da pasta: a checagem (`copiar-producao.mjs:220`) roda antes de qualquer leitura do banco.

## Achados

- anotado: `razaoParaRecusarAPasta` é sensível à caixa e não resolve link simbólico; o padrão fixo `~/dc360-copias` evita o problema hoje. Se a pasta virar configurável, normalizar a caixa (`toLowerCase`) e usar `realpathSync`.
- anotado: não há prazo de eliminação do dump; o texto final do script manda "apagar quando a migração tiver sido conferida", mas nada apaga (a cópia vale 30 minutos só para o migrador, não para o disco). Retenção manual de dump com dado real de cidadão na máquina de quem opera, no escopo de F05 (retenção) ou do runbook, não desta etapa.
- anotado (fora desta dimensão, observado de passagem): `test:scripts` hoje roda 0 pulados no Mac, enquanto o bloco da etapa fala em 4 pulados "por ambiente"; é matéria de QA e infra.

## Não verificado

Windows e Linux (a etapa pede as duas plataformas; só rodei no macOS): a portabilidade dos casos 19, 22 e 37 não foi exercitada fora do Mac, e a evidência de Windows é do implementador. Execução do `pg_dump` real e o conteúdo do chaveiro (não toquei na produção). CI do SHA (ausente nesta sessão).

## Risco residual

Dump com dado de cidadão persiste em `~/dc360-copias` até a limpeza manual; regra de pasta frágil se a pasta virar configurável.

## Motivo do humano

Não se aplica a esta dimensão.

### Itens do "Motivo do veredito" da rodada 4 que tocam privacidade

O BLOCKED da rodada 4 foi só de Infra e CI (run do CI não lido); a LGPD deu PASS sem pendência. Nada de privacidade a consertar. O bloqueio de Infra e CI não se remove nesta dimensão.
