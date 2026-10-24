# V2-F01-E16: Runbooks mínimos (deploy, rollback, migração, rotação de segredo) e acesso da segunda pessoa

Estado desta entrega: **parte anterior ao CP-07**, em rascunho. Os textos estão
escritos a partir do que o repositório faz hoje. Nada foi executado por uma
segunda pessoa, o HML não existe e o `rollback.md` é de outra etapa.

## Fatos

**Arquivos novos (todos em `dc360/`):**

- `docs/runbooks/README.md`: índice, estado de cada runbook, convenção "depende de
  V2-F01-Enn", quem executa hoje.
- `docs/runbooks/deploy.md`: API (`fly deploy -a defesa-civil`), console
  (`fly deploy -c fly.console.toml --ha=false`), painel (publicação da Vercel na
  entrada da `master`, por isso último passo) e aplicativo (`eas build`/`eas submit`).
  Pré-condições, ponto de volta, verificação por `/saude` e `fly status`.
- `docs/runbooks/migracao.md`: o roteiro da seção 8 de `IMPLANTACAO.md` em forma de
  runbook (conferir, cópia, aplicar, endurecer, reimplantar, apagar a cópia), a
  regra "só aditiva ou compatível", e a volta atrás (corrigir para a frente, voltar a
  imagem, restaurar a cópia).
- `docs/runbooks/rotacao-de-segredo.md`: rotação (dois passos) e revogação de
  `JWT_SEGREDO` por `scripts/rotacionar-segredo.mjs`; `CONSOLE_JWT_SEGREDO`;
  `SEGUNDO_FATOR_CHAVE` e `CONSOLE_SEGUNDO_FATOR_CHAVE` marcados como "não gira sem
  plano"; tabela do que tem e do que não tem runbook.
- `docs/runbooks/acesso-e-segredos.md`: matriz de 15 contas por função (MFA e
  quem revoga), nomes de segredo por lugar, o que precisa de cópia no cofre, recuperação
  de PROD, função/finalidade/prazo, ficha de concessão, revisão trimestral, revogação.
- `docs/runbooks/ensaio-da-segunda-pessoa.md`: roteiro de oito passos e ficha de registro
  (CP-07 e HML pendentes).
- `scripts/runbooks.test.mjs`: 15 casos (11 sobre os runbooks, 4 provas de que o
  conferidor morde). Entra em `npm run test:scripts` sem tocar em `package.json`.

**Arquivos editados:**

- `scripts/baseline.mjs`: linha `V2-F01-E16: 15` nas duas tabelas.
- `docs/PAPEIS_E_RESPONSABILIDADES.md`: seção "Acesso técnico do fornecedor à
  infraestrutura (rascunho do CP-07)" (função, finalidade, acesso padrão e prazo).
- `docs/INDISPONIBILIDADE.md`: parágrafo na seção 6 apontando para os runbooks; as
  quatro linhas de contato continuam vazias, como pede a regra de não inventar.
- `docs/IMPLANTACAO.md`: nota no topo apontando para os runbooks.

**Não tocados, por instrução:** `rollback.md` (nem criado nem editado; os runbooks só o
apontam e marcam "depende de V2-F01-E08"), `verificar.yml`, `config.ts`, `package.json`,
código, STATUS, ESTADO-ATUAL, pendencias-humanas e dividas.

**Testes (ver `saidas/`):**

- `node --test scripts/runbooks.test.mjs`: 15 de 15 (`saidas/01-runbooks-test.txt`).
- `npm run test:scripts`: todos verdes depois de gerado o `INDEX.md` desta pasta (antes dele,
  o conferidor de índices reprovava, como deve) (`saidas/02-test-scripts.txt`).
- `packages/shared/test/regras-de-conteudo.test.ts`: 10 de 10
  (`saidas/03-regras-de-conteudo.txt`). A primeira rodada reprovou porque o teste novo
  trazia o caractere de travessão literal; virou escape (a descrição U+2014, sem o caractere), como o portão pede.
- `npm run conferir:numeros`: "Todos os números da documentação batem"
  (`saidas/04-conferir-numeros.txt`). O total de 5550 não muda: o conferidor não conta
  `scripts/` no total do README.
- `node --test scripts/baseline.test.mjs`: 29 de 29 (`saidas/05-baseline-test.txt`).

Typecheck e `npm test` de app não foram rodados: nenhum código de app foi tocado.

**Prova de que o conferidor morde:** quatro casos plantam script, opção e subcomando
inexistentes, `fly rollback`, `fly secrets reveal`, `eas deploy`, `gh pr merge`, arquivo
inexistente, etapa `V2-F01-E99`, URL de banco com senha, chave PEM e token longo, e todos
reprovam; o texto certo passa. Também foi plantado à mão `fly rollbak` e
`versao.mjs conferr` em `deploy.md` na memória: ambos reprovaram.

## Justificativa

A etapa pede que um texto deixe quem não escreveu o sistema operar. O que se pode provar
sem a pessoa e sem HML é que o texto não manda rodar o que não existe e não carrega
segredo; isso virou teste. O que só a pessoa prova (que o texto basta) está no roteiro do
ensaio, não afirmado como feito. Onde o processo depende de etapa não feita, o runbook
diz o que se faz HOJE e marca "depende de V2-F01-Enn": HML (E11), deploy por merge e
promoção (E12), versão e commit no `/saude` e `rollback.md` (E08), matriz de ambiente
(E09), perfil EAS de HML (E13), alerta (E14), scripts multiplataforma e `--ambiente`
(E15), trava de migração concorrente e migração reversível (E18).

## Achados que o Rafael precisa saber (riscos reais vistos ao escrever)

1. **O valor atual de `JWT_SEGREDO` não é legível no Fly.** A rotação sem derrubar ninguém
   exige o valor atual para montar a lista; se ele não estiver guardado fora do Fly, só
   resta a revogação (derruba todos). O cofre do CP-07 resolve isso.
2. **`copiar-producao.mjs` não passa `--extension=pg_trgm`**, e o restore vigente a exige
   desde a migração 041. `IMPLANTACAO.md` 8.2 já diz que isso não tem dono: nenhuma etapa
   escrita (nem a E15) o cita. Registrado em `migracao.md`; falta alguém assumir.
3. **A ordem "API antes do painel" depende da `master`:** a Vercel publica o painel no
   merge. O runbook manda implantar a API do SHA do PR verde antes do merge. Isso muda
   com a E12.
4. **Faltam runbooks de rotação** de senha de `dc360_api` e de `dc360_console_login`, das
   chaves `S3_*`, da APNs e do e-mail. Estão listados como lacuna; escrever sem ensaio
   seria inventar.
5. **Não há conta de verificação em PROD** definida para conferir o painel depois de um
   deploy (só `/saude` e a tela de entrada).

## Para o orquestrador

Linha sugerida do STATUS: `V2-F01-E16 | IMPLEMENTADA (parte anterior ao CP-07, rascunho) | candidato <sha7> (sem push) | 5 runbooks + índice + ensaio em rascunho, matriz de 15 contas, runbooks.test.mjs com 15 casos; ensaio da segunda pessoa e acesso real BLOQUEADOS por CP-07, E11 e E12`.

Linha de baseline: `"V2-F01-E16": 15` em `TESTES_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS` e
`"V2-F01-E16": "runbooks.test.mjs"` em `ARQUIVOS_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS`. O total
esperado de `test-scripts` sobe 15. Nenhum total do README ou do `COLOCAR-DE-PE.md` mudou.

Conflito provável na integração: `scripts/baseline.mjs` (as duas tabelas, no fim, como
nas outras etapas). Quando o `rollback.md` da E08 chegar, `runbooks.test.mjs` não o varre
de propósito; a lista `DOS_RUNBOOKS` pode ganhá-lo depois que a E08 estiver validada.

Pendências humanas (o Rafael faz fora do repositório):

1. **CP-07:** decidir a alternativa (A, B ou C), indicar a segunda pessoa e o cofre, e
   gravar `docs/evidencias-v2/CP-07/decisao.md` (funções e canal; nomes não são
   necessários).
2. Conceder o acesso mínimo de `acesso-e-segredos.md`, com MFA, e preencher a ficha de
   concessão; guardar `SEGUNDO_FATOR_CHAVE`, `CONSOLE_SEGUNDO_FATOR_CHAVE`, o valor
   atual de `JWT_SEGREDO` e a senha do papel de setup no cofre.
3. Depois de E11, E12 e E08: conduzir `ensaio-da-segunda-pessoa.md` e arquivar a ficha
   em `docs/evidencias-v2/G01/V2-F01-E16/ensaio-AAAA-MM-DD.md`.
4. Preencher os contatos da seção 6 de `INDISPONIBILIDADE.md` (hoje vazios, por regra).
5. Ler os cinco runbooks (validação humana da etapa).
6. Decidir quem assume o conserto do `--extension=pg_trgm` no `copiar-producao.mjs`.

O que esta etapa deixa BLOQUEADO até o CP-07: a versão completa dos runbooks, o acesso
real da segunda pessoa, F21-E06, F27-E02 e F28-E05. A etapa só vira completa depois do
ensaio; por isso o estado é IMPLEMENTADA parcial, não fechada.
