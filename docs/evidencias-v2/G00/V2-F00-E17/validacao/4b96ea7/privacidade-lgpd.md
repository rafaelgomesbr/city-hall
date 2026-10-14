---
validador: privacidade-lgpd
modelo: claude-sonnet-5-5
etapa: V2-F00-E17
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [LGPD, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
Aviso: não sou advogado e isto não é parecer jurídico. Cobre a parte técnica.

## Critérios verificados

Inventário: `dc360/scripts/copiar-producao.mjs` faz `pg_dump` da produção (dado real de cidadão) para `~/dc360-copias` (`PASTA_DE_COPIAS`, fixa, sem flag nem variável que a troque). `conferir-numeros.mjs` só conta e imprime números. `baseline.mjs` roda comandos e arquiva saída.

1. "Os cinco lugares recusados continuam recusados" (bloco, testes negativos): o teste reescrito (`scripts/copiar-producao.test.mjs`, linhas ~50-70) monta os caminhos com `join` a partir de `parse(resolve(".")).root` e recusa repositório, `Mobile Documents`, `Dropbox`, `Google Drive`, `OneDrive` e `Desktop`, e aceita `dc360-copias`. `copiar-producao.mjs` não mudou desde `5ecdf4c` (`git diff 7005a60..4b96ea7` não o lista), então a proteção não foi enfraquecida.
2. `conferir-numeros.mjs` (mudança desde a rodada 1: `contarCasosDeScripts` roda `node --test scripts/*.test.mjs` em processo filho com saída capturada): só lê o total do TAP (`extrairContagem`), não repassa a saída; imprime apenas contagens e a lista de afirmações que não batem. Em `scratchpad/baseline/11-conferir-numeros.txt` e `10-test-scripts.txt` não há nome de usuário do Windows, e-mail, token nem caminho pessoal (grep).
3. Saídas da linha de base inteira (`scratchpad/baseline/*.txt`): sem JWT, sem `token=`, sem `scrypt$`, sem CPF; o único e-mail encontrado é `coordenacao@fornecedor.com.br`, fixture do console de teste, impresso no log de `06-teste-console.txt` (log de teste do console do fornecedor, fora do escopo da E17).

## Evidência

- Sonda de caixa, reexecutada no SHA (`scratchpad/lgpd/pasta.mjs`, Windows, `raizDoRepo` e `casa` construídos com `resolve`): `C:/Projetos/city-hall/dc360/x` RECUSA; `c:/projetos/city-hall/dc360/x` ACEITA; `C:/Users/Rfasg/OneDrive/x` RECUSA; `.../onedrive/x` ACEITA; `.../Desktop/x` RECUSA; `.../desktop/x` ACEITA; `.../dc360-copias` ACEITA. (Uma primeira sonda minha deu tudo ACEITA por erro meu de barras no shell; refeita e conferida.)
- `scratchpad/baseline/10-test-scripts.txt` e `11-conferir-numeros.txt` (0 falha; 24 afirmações, 0 divergência), `resultados.json` 17 de 17 confere.
- Amostras na função `redigir` (`scratchpad/lgpd/red.mjs`): ver achado 2.

## Cenários positivos

Pasta fora dos lugares proibidos é aceita; `conferir:numeros` fecha sem divergência.

## Cenários negativos

Os cinco lugares na caixa canônica são recusados nas duas plataformas pelo teste; número alterado de propósito reprova (sonda arquivada pelo implementador em `saidas/05`, alegação).

## Tentativas de reprovar

- Variantes de caixa de repositório, OneDrive e Desktop: ACEITAS indevidamente em Windows (tabela acima). Sem exploração hoje, porque a pasta é fixa e derivada de `homedir()` com a caixa devolvida pelo sistema, mas a função é exportada e testada como defesa.
- Procurei argumento, variável de ambiente ou flag que escolha a pasta: não há.
- Procurei dado pessoal ou segredo nas saídas dos dois comandos: não há.
- Procurei regressão: o teste não foi afrouxado (recusas mantidas, aceitação de `dc360-copias` mantida).

## Achados

1. corrige antes de crescer (herdado da rodada 1, não corrigido nesta rodada). `razaoParaRecusarAPasta` (`copiar-producao.mjs:111-126`) compara sem ignorar caixa (`startsWith`, `includes`, `===`); no Windows e no macOS, repositório, nuvem e Desktop escritos em outra caixa passam. Corrigir antes de qualquer opção de pasta personalizada. Não bloqueia: nenhuma rota alcançável.
2. corrige antes de crescer (transversal). `redigir` (`baseline.mjs:599-616`) e `PADROES_DE_SEGREDO` (`scripts/roadmap/conferir-evidencia.mjs:77-84`) não mascaram `?token=`, `senhaTemporaria`, token de renovação, `scrypt$`, e-mail nem CPF. Saída de falha do e2e pode levar essas coisas ao arquivo de evidência. Hoje as saídas conferidas estão limpas, mas já existe um link de recuperação num log de teste arquivado (`V2-F00-E10/saidas/02-sonda-antes-do-conserto-api.txt:60`, token de banco descartável) que o portão não pegou.
3. anotado. O script é pensado para Mac (chaveiro, Homebrew); a portabilidade da E17 foi só do teste.

## Não verificado

- `pg_dump` real, restore e permissão 0600 (sem banco de produção).
- Execução em Linux (só o CI, run 38445527075, 9 de 9).
- Se a pasta pessoal de quem opera está redirecionada para nuvem (depende da máquina).

## Risco residual

Baixo. Nenhum vazamento alcançável com a pasta fixa.

## Motivo do humano

Não preciso de pessoa para o veredito. O prazo para apagar a cópia depois da migração é procedimento humano.
