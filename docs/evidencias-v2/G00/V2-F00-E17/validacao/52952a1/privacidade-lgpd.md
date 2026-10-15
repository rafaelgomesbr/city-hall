---
validador: privacidade-lgpd (agente general-purpose com o papel da dimensão)
modelo: claude-sonnet-5-5
etapa: V2-F00-E17
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [LGPD, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
Aviso: não sou advogado e isto não é parecer jurídico. Cobre a parte técnica. `$SP` é a pasta de trabalho da sessão do gatekeeper (`.../scratchpad`).

## Critérios verificados

### Inventário e escopo

A etapa mexe em scripts de ferramenta e em contagens de documentação. Os dados pessoais que ela encosta são: (a) a cópia de produção (`dc360/scripts/copiar-producao.mjs`, `pg_dump` com dado real de cidadão) cuja regra de pasta o caso 22 protege; (b) as saídas arquivadas dos comandos (`test:scripts`, `conferir:numeros`, `baseline.mjs`), que podem carregar texto de log; (c) `conferir-numeros.mjs`, que só conta. Nada nas saídas desta etapa grava dado de cidadão.

### Verificação de cada ponto

1. Proteção da pasta de cópias ("os cinco lugares recusados continuam recusados", bloco, testes negativos). `git diff 4b96ea7..52952a1` não toca `scripts/copiar-producao.mjs`, `copiar-producao.test.mjs`, `comando-de-migracao.test.mjs` nem `entitlements-do-ios.test.mjs`: a proteção da rodada 2 é a mesma. Reexecutei a sonda de caixa com a função real (`$SP/val/privacidade-lgpd/pasta.mjs`, `52-pasta.txt`, caminhos POSIX no Mac):

| Pasta | Resultado |
| --- | --- |
| dentro do repositório (`.../city-hall/dc360/copias`) | RECUSA |
| `Library/Mobile Documents/x` (iCloud) | RECUSA |
| `Dropbox/x` | RECUSA |
| `Desktop/x` | RECUSA |
| `dc360-copias` (a pasta de verdade) | ACEITA |
| as mesmas pastas com caixa trocada (`DC360`, `library/mobile documents`, `dropbox`, `desktop`) | ACEITA (ver achado 1) |

2. A pasta é FIXA: `export const PASTA_DE_COPIAS = join(homedir(), "dc360-copias")` (`copiar-producao.mjs:76`), sem flag, argumento nem variável que a troque (`process.argv` só lê `--conferir`; `process.env` só repassa a senha ao `pg_dump`). A pasta é criada com `mkdirSync(..., { mode: 0o700 })` e `chmodSync(..., 0o700)` (`:252-253`). Por isso o achado de caixa não tem caminho de exploração hoje.
3. `conferir-numeros.mjs` só imprime contagens e a lista de afirmações que não batem; `contarCasosDeScripts` lê o resumo do TAP e não repassa a saída. Não há `writeFileSync` nem `appendFileSync` nele nem em `auditar.mjs`.
4. Nenhum script lê `homedir`, `userInfo` ou `hostname` para imprimir (`grep` em `baseline.mjs`, `conferir-numeros.mjs`, `auditar.mjs`, `testar-campo.mjs`: só `copiar-producao.mjs` usa `homedir`, para a pasta).
5. Mudança do diff `4b96ea7..52952a1` que toca scripts: `auditar.mjs` passou a sair com código 2 dizendo que NÃO auditou quando o registro do npm cai (antes aprovava em silêncio). Em termos de dimensão: aumenta a confiança no portão de dependência vulnerável, sem dado pessoal.

## Evidência

- `cd dc360 && npm run test:scripts`: código 0, 260 testes, 260 passaram, 0 falha, 0 pulados (`$SP/val/privacidade-lgpd/60-test-scripts.txt`).
- `npm run conferir:numeros`: código 0, 25 afirmações conferidas, 0 divergência (`61-conferir-numeros.txt`).
- Varredura da pasta de evidências `docs/evidencias-v2/G00` (fora de `validacao/`) atrás de dado pessoal e segredo (`51-varredura-evidencia.txt`): CPF: nenhum; `scrypt$` com valor: nenhum (só a frase "nenhum arquivo traz hash de senha (scrypt$)" dos e2e); `senhaTemporaria` com valor: só a fixture sintética do `diff-da-etapa.patch` da E09; e-mails: todos de domínio de exemplo, fixture de teste ou `coordenacao@fornecedor.com.br` (console de teste). `V2-F00-E17/saidas/` não traz token, hash, CPF nem e-mail de pessoa real.
- Amostras na função `redigir` real e nos `PADROES_DE_SEGREDO` reais (`red.mjs`, `50-redigir.txt`): JWT é mascarado e pego; pasta de usuário do Windows e do Mac é mascarada por `redigir`; link `?token=`, `senhaTemporaria`, token de renovação, `scrypt$`, e-mail e CPF NÃO são mascarados por `redigir` e NÃO são pegos por `PADROES_DE_SEGREDO` (ver achado 2).

## Cenários positivos

Pasta `~/dc360-copias` aceita; `conferir:numeros` fecha sem divergência; `test:scripts` fecha verde.

## Cenários negativos

Repositório, iCloud, Dropbox e Desktop na caixa canônica são recusados; `auditar` com o registro fora do ar agora reprova com código 2 (mudança desta rodada, não é do meu escopo mas corrobora o princípio de não aprovar sem ter visto).

## Tentativas de reprovar

- Variantes de caixa de repositório, iCloud, Dropbox e Desktop: ACEITAS (achado 1). Sem exploração, porque a pasta é fixa e derivada de `homedir()`.
- Procurei argumento, variável de ambiente ou flag que escolha a pasta: não há.
- Procurei dado pessoal ou segredo nas saídas dos dois comandos e em todas as saídas arquivadas da E17: o único dado pessoal NÃO sintético que achei é o nome da máquina do desenvolvedor, impresso pelo logger de teste do console nos arquivos `V2-F00-E17/saidas/06-npm-test-regressao.txt` e `V2-F00-E17/saidas/baseline-depois/03-teste-console.txt` (27 linhas em cada; campo `hostname` do pino). Ver achado 3.
- Procurei regressão do teste do caso 22: o teste não foi afrouxado (as cinco recusas e a aceitação de `dc360-copias` continuam).
- Não consegui expor dado de cidadão por nenhum script desta etapa.

## Achados

1. corrige antes de crescer (herdado das rodadas 1 e 2, NÃO corrigido). `razaoParaRecusarAPasta` (`scripts/copiar-producao.mjs`, linhas 111 a 126) compara sem ignorar caixa; no Windows e no macOS (sistemas de arquivos que não distinguem caixa) repositório, nuvem e Desktop escritos em outra caixa passam. Reprodução: `node $SP/val/privacidade-lgpd/pasta.mjs`. Dono provável: E17 (correção) ou a primeira etapa que permitir pasta personalizada. Sem exploração alcançável.
2. corrige antes de crescer (transversal, E01 e E22). `redigir` (`dc360/scripts/baseline.mjs:683`) e `PADROES_DE_SEGREDO` (`scripts/roadmap/conferir-evidencia.mjs:77`) não cobrem `?token=`, `senhaTemporaria`, token de renovação, `scrypt$`, e-mail nem CPF. Prova de que isso já aconteceu: `V2-F00-E10/saidas/02-sonda-antes-do-conserto-api.txt:60` (arquivo rastreado) traz um link de redefinição com token e o e-mail sintético de uma conta da semente, e o portão de evidência passou. A saída de uma FALHA do e2e imprime o texto cru de erro e pode levar esses valores ao arquivo de evidência.
3. anotado. O logger de teste grava o `hostname` da máquina de quem rodou (nome próprio do desenvolvedor) e ele foi arquivado em evidência versionada (dois arquivos da E17, e outros de outras etapas). Não é dado de cidadão e o risco é baixo, mas é dado de pessoa identificável; `redigir` não o cobre. Sugiro uma regra de redação para o campo `hostname` do pino. Relacionado: relatórios de validação de rodadas anteriores gravam, em `validacao/`, o nome da conta do Windows da pessoa que operou (não repito o valor aqui). É texto dos validadores, não do produto; sugiro o gatekeeper decidir se saneia.
4. anotado. O script de cópia é pensado para Mac (chaveiro, Homebrew); a portabilidade da E17 foi só do teste. O prazo para apagar a cópia depois da migração é procedimento humano.

## Não verificado

- `pg_dump` real, restore e a permissão 0600/0700 na prática (sem banco de produção; não gerei cópia).
- Execução no Windows e no Linux: rodei só no Mac (macOS arm64, Node 24); o Linux está no CI (run 38618369218, "Testes, tipos e scripts" verde), tratado como alegação do gatekeeper.
- A sonda de "número alterado de propósito reprova" (`conferir:numeros`), que pertence à dimensão de QA; não a repeti.
- Se a pasta pessoal de quem opera está redirecionada para nuvem (depende da máquina).

## Risco residual

Baixo. Nenhum vazamento alcançável com a pasta fixa; as saídas arquivadas estão limpas de dado de cidadão, com a ressalva do achado 3 e da lacuna de filtro do achado 2.

## Motivo do humano

Não preciso de pessoa para o veredito.
