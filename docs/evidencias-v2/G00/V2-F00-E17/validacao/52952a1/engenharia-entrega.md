---
validador: engenharia-entrega (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
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
## Critérios verificados

- **`test:scripts` com 0 falhas em Linux.** Job "Testes, tipos e scripts" do run 38618369218, artefato `produto-7585801.../06-test-scripts.txt`: `# tests 260`, `# pass 256`, `# fail 0`, `# skipped 4`; os 4 pulados são os de `ios/` ("# SKIP sem pasta ios/ nesta máquina", "# SKIP sem projeto iOS gerado"), como a etapa pede. No job de linha de base o passo `test-scripts` também "confere" (19 de 19).
- **`test:scripts` no Mac.** Linha de base do gatekeeper: 260 de 260, 0 falhas, 0 pulados (a pasta `ios/` existe nesta máquina, divergência de ambiente documentada no `README.md:1199`). Portabilidade agora provada em Windows (rodadas anteriores), Linux (CI) e macOS.
- **`conferir:numeros` sem divergência.** CI: "Afirmações conferidas: 25 ... Todos os números da documentação batem com a realidade." (`07-conferir-numeros.txt`). Mac, por mim: código 0 (`$SP/val/engenharia-entrega/e17-03-conferir-numeros-verde.txt`).
- **Negativo: número alterado de propósito reprova.** Troquei `migracoes=50` por `49` em `dc360/docs/RESTORE-DO-BANCO.md:15`: código 1, "afirma: 49 migrações em db/migrations" (`e17-04-conferir-numeros-MUTANTE.txt`); `git restore`. Morde.
- **Caso 22 (copiar-producao) continua recusando os lugares proibidos.** Sonda no Mac (`e17-02-copiar-producao-caixa-no-mac.txt`): `~/Desktop/x` e `~/Dropbox/x` RECUSA; pasta fora (`~/dc360-copias`) ACEITA. A suíte de `scripts/` (com o caso 22) passou no Linux.
- **Defeito anotado na rodada 1 ("casos" escapa do `conferir:numeros`).** Ainda morde: trocar "1319 casos impressos" por "1318" no `README.md:1134` deixa o portão em código 0 (`e17-05-conferir-numeros-palavra-casos.txt`); restaurado. Continua anotado, fora da DoD.
- **Defeito anotado nas rodadas 1 e 2 (comparação de pasta sensível à caixa).** Ainda morde e agora também no Mac, cujo APFS ignora a caixa: `~/desktop/x`, `~/dropbox/x` e `~/onedrive/x` são ACEITOS, e `~/DESKTOP` resolve para `~/Desktop` nesta máquina. Latente: a pasta usada é fixa (`PASTA_DE_COPIAS`, `~/dc360-copias`).
- **Pergunta do gatekeeper sobre `redigir` e `PADROES_DE_SEGREDO`.** Confirmado pela minha sonda: `redigir` de `baseline.mjs` e o `redigir` de `scripts/ci-artefatos.sh` (regra `[A-Z_]*TOKEN[A-Z_]*=`, só maiúsculas) deixam passar `?token=` de link de redefinição, `"senhaTemporaria"`, hash `scrypt$`, e-mail e CPF; `PADROES_DE_SEGREDO` (`scripts/roadmap/conferir-evidencia.mjs:77-84`) idem. O link de `V2-F00-E10/saidas/02-sonda-antes-do-conserto-api.txt:60` é de uma suíte em PGlite com token efêmero e e-mail fictício. Pela minha dimensão (segredo fora do log e do artefato): nos artefatos do run 38618369218 não há nenhum desses padrões (varredura abaixo); o risco é de um log de ambiente real passar pelo portão no futuro. Não é critério da E17 (que é `test:scripts` e `conferir:numeros`): vai como achado.

## Evidência

- CI: logs de todos os jobs e artefatos `produto`, `baseline`, `navegador`, `implantavel`, `restore`, `dependencias` em `$SP/val/engenharia-entrega/art/`.
- `npm run conferir:numeros`: verde código 0; mutante código 1; mutante "casos" código 0 (arquivos `e17-03`, `e17-04`, `e17-05`).
- Sonda de pastas: `e17-02-copiar-producao-caixa-no-mac.txt`.
- Sonda de redação: `$SP/val/engenharia-entrega/sondas/amostra-segredos.txt` e `e17-01-redigir-baseline.txt`.
- Varredura dos artefatos do CI por `token=[A-Za-z0-9_-]{20,}`, `senhaTemporaria`, `scrypt\$[0-9]`, `JWT_SEGREDO=`, `eyJ...`, `ghp_`, chave privada: 0 ocorrência; e-mail `.gov.br`/`.com.br`: só `coordenacao@fornecedor.com.br` (fictício).
- `git status --porcelain` depois de cada mutação: só as pastas `validacao/52952a1/`.

## Cenários positivos

- `test:scripts` e `conferir:numeros` verdes no Linux do CI e no Mac.

## Cenários negativos

- Número de migrações alterado num documento: reprova.
- Pasta na Área de Trabalho e no Dropbox: recusada.

## Tentativas de reprovar

- Procurei pulos sem dono no `test:scripts` do CI: só os 4 de `ios/`, por ambiente.
- Tentei números que o portão não enxerga (palavra "casos"): escapa, como já anotado.
- Tentei pasta com outra caixa e pasta dentro do repositório git fora de `dc360/`: `join(<raiz do git>, "copias")` é ACEITA, porque `RAIZ_DO_REPO` (`copiar-producao.mjs:70`) é a pasta `dc360/` e não a raiz do git, e nenhum `.gitignore` cobre `*.dump` (`git check-ignore copias/x.dump` vazio). Latente pela pasta fixa.
- Tentei achar segredo nos artefatos e logs do CI: nada; a senha do superusuário do job de restore aparece mascarada (`***`).

## Achados

1. corrige antes de crescer (dono: F01-E04, e quem mantém `ci-artefatos.sh`). Redação e varredura de segredo não cobrem link de redefinição com `?token=`, senha temporária, hash `scrypt$`, refresh token, e-mail e CPF; `ci-artefatos.sh` só redige `TOKEN=` em maiúsculas. Reprodução: a sonda acima.
2. corrige antes de crescer (dono: F01-E15, `copiar-producao.mjs` multiplataforma). `razaoParaRecusarAPasta` compara com caixa (Windows e macOS ignoram caixa) e considera "repositório" só `dc360/`, não a raiz do git. Latente: pasta fixa.
3. anotado (herdado da rodada 1). Afirmação com a palavra "casos" escapa do `conferir:numeros`.

## Não verificado

- Windows nesta rodada (não há Windows nesta máquina); vale a prova das rodadas 1 e 2.
- O caso 37 (`entitlements-do-ios.test.mjs`) com o `mode` escrito à mão: não mutei nesta rodada; o arquivo não mudou desde a rodada 2 (`git diff 4b96ea7..52952a1` não o toca) e a suíte passou nos dois sistemas.

## Risco residual

- Um documento novo com número em formato que o portão não reconhece pode envelhecer em silêncio.
- A redação incompleta só vira vazamento real quando alguém arquivar saída de ambiente com dado de verdade.

## Motivo do humano

Não se aplica.
