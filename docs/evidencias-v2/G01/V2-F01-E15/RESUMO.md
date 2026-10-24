# V2-F01-E15: dump antes de migration e roteiros multiplataforma (hoje só macOS)

## Fatos

**O que mudou (tudo em `dc360/`, só `scripts/` e documentação):**

- `scripts/producao.mjs` (reescrito): `lerAmbiente` exige `--ambiente hml|prod` (sem ele, ou com `dev` ou valor
  desconhecido, recusa com código 2 e devolve o restante dos argumentos sem a opção); `perfilDoAmbiente` lê projeto,
  host e porta de `scripts/ambientes.json` (campos novos `bancoHost` e `bancoPorta`; PROD preenchido com os valores de
  sempre, HML nulo) e recusa HML enquanto a identidade do banco for nula, sem cair no de PROD; `obterSenha` lê, nesta
  ordem, a variável do ambiente (`DC360_SENHA_BANCO_PROD` ou `_HML`), o chaveiro do sistema (macOS `security`, Linux
  `secret-tool`; Windows não tem comando embutido) e uma pergunta sem eco; `ajudaDaSenha` ensina, em português e por
  sistema, como guardar; `urlSemSenha` e `linhasDoAlvo` mostram o banco antes de agir; `comandoDoNpm` chama o npm sem
  `shell` (no Windows, `node npm-cli.js`), para um nome com espaço não se partir. Cada ambiente tem o seu cofre
  (`senha-do-banco-dc360` em PROD, como já estava no chaveiro do dono, e `-hml` em HML) e a sua variável: nenhum herda
  a senha do outro.
- `scripts/copiar-producao.mjs`: **`--extension=pg_trgm` no `pg_dump`** (a correção conhecida: sem ela o
  `pg_restore --exit-on-error` para no índice `gin_trgm_ops` desde a migração 041); candidatos de `pg_dump` por sistema
  (`DC360_PG_DUMP`, PATH, Homebrew, PGDG e `/usr/pgsql-NN`, Linuxbrew, `Program Files\PostgreSQL\NN\bin`) e instrução de
  instalação por sistema; **subpasta por ambiente** (`~/dc360-copias/<ambiente>/`), para que cópia de HML nunca libere
  PROD; pasta e arquivo só do usuário (`chmod` 0700/0600; no Windows `icacls /inheritance:r /grant:r`, e se falhar o
  roteiro recusa gravar e apaga o que gravou); mantém as pastas proibidas (repositório, nuvem, Área de Trabalho); a
  senha continua só em `PGPASSWORD` do processo filho.
- `scripts/migrar-producao.mjs` e `scripts/cadastrar-prefeitura.mjs`: recebem `--ambiente`, mostram o banco sem senha
  antes de agir, usam a senha do ambiente, procuram a cópia na pasta do ambiente e chamam o npm sem shell. O
  cadastrar não repassa `--ambiente` ao provisionador.
- `scripts/ambientes.json`: `bancoHost` e `bancoPorta` por ambiente.
- Testes: `scripts/producao.test.mjs` (novo, 19), `copiar-producao.test.mjs` (+12), `migrar-producao.test.mjs` (+4);
  `baseline.mjs` declara `V2-F01-E15` (19) e `V2-F01-E15-acrescimos` (16); `runbooks.test.mjs` deixa de exigir que
  `migracao.md` marque "depende de V2-F01-E15" (a etapa chegou) e passa a exigir a marca da E12.
- Documentação: `IMPLANTACAO.md` (seção 8 e os comandos com `--ambiente`), `COLOCAR-DE-PE.md` (nota na Parte 6),
  `RESTORE-DO-BANCO.md`, `AMBIENTES.md`, `runbooks/migracao.md`, `deploy.md`, `rollback.md`.

**O que NÃO mudou:** `.github/workflows/`, `package.json`, lockfiles, `db/src/cli.ts`, `db/src/migrar.ts`.

## Testes (saídas em `saidas/`)

| Verificação | Resultado |
| --- | --- |
| `node --test` dos três arquivos da etapa (`03`) | 55 de 55 |
| Prova de mordida: sem `--extension=pg_trgm` no código, o teste da extensão reprova (`04`) | 24 de 25, 1 falha esperada |
| `regras-de-conteudo.test.ts` (`05`) | 10 de 10 |
| `npm run conferir:numeros` (`06`) | fecha |
| `baseline.test.mjs`, `runbooks.test.mjs`, `conferir-ambiente.test.mjs` (`07`) | 86 de 86 |
| `npm run test:scripts` inteiro, sem o caso que confere o INDEX.md desta própria pasta (`08`; o arquivo de saída não pode estar no índice que ele mesmo precisa conferir) | 639 rodados, 635 passam, 0 falham, 4 pulados (os mesmos de antes). O caso do índice passa com a pasta completa (`node dc360/scripts/conferir-indices-de-evidencia.mjs`: OK) |
| Saída dos comandos sem `--ambiente`, com `dev`, com `hml` e com `prod --conferir` (`01`, `02`) | recusas e mensagens conforme o esperado |

Nunca foi impresso segredo: os casos de `01` e `02` param antes de ler a senha, e há um teste que prova que a
mensagem de falta de credencial não leva o valor de outra variável.

## Limites declarados

- **Restore da cópia não foi provado nesta máquina**: não há `pg_dump`, `postgres` nem Docker aqui. O que a E15 prova é
  que o argumento está no comando (teste e prova de mordida). A prova de que `--extension=pg_trgm` basta é a do
  `RESTORE-DO-BANCO.md` (passo 3 e a tabela de erros), repetida pelo job `implantavel` do CI.
- **Windows e Linux rodaram só por parâmetro** (plataforma simulada). A execução real é validação humana.
- **"A credencial de HML não abre PROD, provado por tentativa"**: provado em unidade (a variável e o cofre de HML não
  respondem para PROD, e vice-versa). A tentativa contra os dois bancos reais depende de HML existir (E11).
- O arquivo de âncora de confiança (`supabase-prod-ca-2021.crt`) é a raiz do provedor e vale para os dois bancos se
  ambos forem Supabase; se o banco de HML for de outro provedor, o `sslrootcert` muda.
- `--ambiente hml` recusa hoje (HML sem banco declarado, V2-F01-E11).
- `dc360/.prettierrc.json` não existe: nada formatado com Prettier.

## Para o orquestrador

**Linha do STATUS sugerida:** `V2-F01-E15 | IMPLEMENTADA | dump com --extension=pg_trgm; roteiros *-producao por --ambiente hml|prod em Windows, Linux e macOS (senha por variável, chaveiro ou pergunta sem eco; ACL no Windows); cópia por ambiente | pendente: rodar nos dois sistemas`

**Pendências humanas (o que o Rafael faz fora do repositório):**

1. Rodar `node scripts/copiar-producao.mjs --ambiente prod` (ou o de HML, depois da E11) **no Windows e no Linux**
   e guardar nomes e tamanhos do dump em `docs/evidencias-v2/G01/V2-F01-E15/` (o roadmap pede essa evidência).
2. Restaurar uma cópia tirada pelo roteiro novo pelo `RESTORE-DO-BANCO.md` para confirmar que a extensão basta contra
   a origem Supabase (a prova do roteiro foi contra Postgres local).
3. Apagar cópias antigas em `~/dc360-copias/*.dump` (sem subpasta): foram tiradas sem `pg_trgm` e já não valem para o
   portão. O item do chaveiro de PROD continua o mesmo; para HML, quando existir, guardar
   `senha-do-banco-dc360-hml` ou usar `DC360_SENHA_BANCO_HML`.
4. `pendencias-humanas.md`, seção E, linha do `--extension=pg_trgm`: pode ser fechada pela E15 depois da validação.
5. Quando a E11 nascer, preencher `identidadeDoBanco`, `bancoHost` e `bancoPorta` de HML em `ambientes.json`.
