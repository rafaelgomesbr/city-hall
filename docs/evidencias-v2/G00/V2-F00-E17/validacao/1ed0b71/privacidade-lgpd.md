---
validador: privacidade-lgpd
modelo: claude-sonnet-5-5
etapa: V2-F00-E17
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [LGPD, INFRA]
nivel_de_prova_exigido: [E1, E3a]
nivel_de_prova_obtido: [E1, E3a]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Critério da etapa ("Impacto LGPD"): "a regra 'dump com dado pessoal não fica no repositório, na nuvem de arquivos nem na Área de Trabalho' é preservada e provada nas duas plataformas". Risco de segurança: "o caso 22 protege onde a cópia de produção (dado de cidadão) pode morar; reescrever sem enfraquecer: os cinco lugares recusados continuam recusados".

Inventário dos dados pessoais tocados: a etapa NÃO toca dado pessoal em si. O único ponto de contato é o roteiro `scripts/copiar-producao.mjs` (dump lógico da produção, que traz dado real de cidadão) e a regra que escolhe onde a cópia pode morar: `PASTA_DE_COPIAS = ~/dc360-copias` (`copiar-producao.mjs:76`), permissão 0700 na pasta e 0600 no arquivo (`:252-274`), janela de 30 minutos para o migrador (`:79`), `razaoParaRecusarAPasta` (`:111`). `copiar-producao.mjs` NÃO foi alterado na fase (`git diff afde25c 1ed0b71 --stat` só lista o teste). `conferir-numeros.mjs` e os outros dois testes não leem dado pessoal.

## Evidência

- `node --test scripts/comando-de-migracao.test.mjs scripts/copiar-producao.test.mjs scripts/entitlements-do-ios.test.mjs`: 22 testes, 22 aprovados, 0 falhas, código 0 (`/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/scripts-e17.txt`).
- `node scripts/conferir-numeros.mjs`: 25 afirmações conferidas, "Todos os números da documentação batem com a realidade", código 0 (`/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/conferir-numeros.txt`).
- Diff do teste que protege a regra (`git diff afde25c 1ed0b71 -- dc360/scripts/copiar-producao.test.mjs`): as MESMAS oito afirmações (repositório 2, nuvem 4 incluindo iCloud, Dropbox, Google Drive e OneDrive, Área de Trabalho 1, pasta limpa aceita 1), só com os caminhos montados por `join` a partir de `parse(resolve(".")).root`; nenhuma afirmação saiu nem foi relaxada.
- Mutações no código real, restauradas com `git restore` e `cmp`: (a) `copiar-producao.mjs` com a recusa da Área de Trabalho desligada: o teste reprova (`/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/mut-e17.txt`); (b) com a recusa de nuvem desligada: o teste reprova (`/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/mut-e17b.txt`).
- Sonda de caminhos reais na macOS (`/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/sonda-copiar.mjs`, saída `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/sonda-copiar.txt`): recusa raiz do repositório, subpasta, caminho com `..`, Desktop e subpasta, iCloud Drive, Dropbox, Google Drive novo (CloudStorage) e OneDrive novo (CloudStorage).

## Cenários positivos

Pasta limpa (`~/dc360-copias`) é aceita; a cópia mora fora do repositório (`a copia mora fora do repositorio` verde).

## Cenários negativos

Os lugares recusados continuam recusados no macOS, nas oito afirmações do teste e nos 9 caminhos reais da sonda.

## Tentativas de reprovar

1. Desliguei, uma de cada vez, a recusa de Área de Trabalho e a de nuvem: o teste reescrito morde nas duas (a prova de que a reescrita não enfraqueceu).
2. Comparei o teste antes e depois linha a linha: a mesma cobertura.
3. Procurei contornos da lista de recusa com a função real: achei quatro que passam (ver Achados), todos anteriores à etapa e fora do que ela muda.

## Achados

- anotado (anterior à etapa, fora do escopo): `razaoParaRecusarAPasta` é uma lista por nome. Passam: `~/desktop/...` em minúsculas (macOS e Windows ignoram caixa no disco), `~/Área de Trabalho/...` (Linux e Windows em português, embora a mensagem fale "Área de Trabalho" e o código só confira `Desktop`), `~/Documents/...` quando a pasta Documentos é sincronizada com iCloud, Box e MEGA, e um atalho simbólico que aponte para a Área de Trabalho. Na prática o risco é pequeno porque a única chamada da regra usa o caminho fixo `~/dc360-copias` (`:220`), sempre aceito; a regra só ganharia força se a pasta virasse configurável. Registrar para quem a tornar configurável.
- anotado: o dump traz dado real de cidadão e o procedimento depende de a pessoa apagá-lo (a mensagem final do script diz isso); não há expurgo automático da cópia.

## Não verificado

- Execução em Windows e em Linux: só rodei em macOS (Node 24, o repositório pede 22). A regra de portabilidade do caso 22 e do caso 19 (`shell: win32`) fica provada pelo desenho, não por execução.
- Dump real contra a produção (`copiar-producao.mjs` sem `--conferir`): não rodei, por exigir credencial de produção e por tocar dado real.
- Efeito do iCloud, da Área de Trabalho e do OneDrive reais na máquina de quem opera.
- Base legal e papel do operador que executa o dump: profissional.

## Risco residual

Cópia de produção com dado de cidadão na máquina de quem opera, sem prazo automático de eliminação; lista de recusa contornável por nome se a pasta passar a ser configurável.

## Motivo do humano

não se aplica.
