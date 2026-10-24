# Runbook: migrar o banco de produção

- **Versão:** 1, de 2026-10-24 (V2-F01-E16, rascunho).
- **Quem executa:** hoje, o dono (Rafael), no Mac dele. A segunda pessoa executa
  em HML no ensaio; em PROD, só depois do CP-07. Quem migra usa a credencial de
  **dono do banco** (papel de setup), a que ignora o isolamento entre
  municípios: por isso esta operação nunca entra em CI (ADR 0008).
- **Quando usar:** toda migração nova em `db/migrations/` que precise chegar em
  produção.
- **Fontes deste texto:** `docs/IMPLANTACAO.md` (seção 8), `scripts/migrar-producao.mjs`,
  `scripts/copiar-producao.mjs`, `scripts/producao.mjs`, `docs/RESTORE-DO-BANCO.md`,
  `docs/COLOCAR-DE-PE.md` (Parte 3, item 2).

## Limites de hoje (leia antes)

- **Roda em Windows, Linux e macOS, por ambiente (V2-F01-E15).** Todo roteiro
  `*-producao` exige `--ambiente hml|prod` e recusa sem ele. O projeto, o host e
  a porta de cada ambiente vêm de `scripts/ambientes.json`; a senha vem da
  variável `DC360_SENHA_BANCO_PROD` (ou `_HML`), do chaveiro do sistema (macOS e
  Linux com `secret-tool`) ou de uma pergunta sem eco. Rodar nos três sistemas
  foi testado por parâmetro; a execução de verdade no Windows e no Linux é
  validação humana pendente.
- **HML só tem banco declarado depois da V2-F01-E11.** Até lá `--ambiente hml`
  recusa dizendo isso; o passo "Ensaio em HML" abaixo (`npm run migrar` direto)
  continua sendo o caminho. O dump antes da migração no pipeline de HML depende de
  V2-F01-E12 (ela chama o mesmo `copiar-producao.mjs --ambiente hml`).
- **A trava contra migração concorrente e a regra de migração reversível**
  dependem de V2-F01-E18. Hoje a única proteção é cada arquivo rodar na própria
  transação e o aplicador recusar histórico reescrito (`db/src/migrar.ts`).
- **A cópia leva `--extension=pg_trgm` desde a V2-F01-E15.** Cópias tiradas
  antes disso **não restauram** além da migração 041 (o `pg_restore
  --exit-on-error` para no índice de busca): não confie nelas como ponto de
  volta; tire uma nova.

## Regra que vem antes do comando: só migração aditiva ou compatível

A API que está no ar continua atendendo enquanto a migração roda e por alguns
minutos depois, até o deploy seguinte. Em produção só entra migração **aditiva
ou compatível** com a versão da API que está no ar: coluna nova (nula ou com
padrão), tabela nova, função nova, policy nova, índice novo. Renomear, apagar,
mudar tipo ou apertar restrição que a versão atual ainda escreve se faz em duas
entregas: primeiro o que acrescenta (e a API que passa a escrever nos dois
lugares), depois, com a versão nova no ar, o que tira o velho. Quem decide se
uma migração cabe na regra é a leitura de uma pessoa, na revisão do PR
(`docs/IMPLANTACAO.md`, 8.1): nenhum script sabe o que a API de ontem ainda usa.

## Pré-condições

1. A migração está num PR com o CI verde, incluindo o job que migra do zero e
   o isolamento (`npm run test:isolamento`).
2. A migração foi lida com a pergunta: "a API que está no ar quebra contra o
   banco já migrado?" Se sim, não é uma migração de uma entrega só.
3. **Ordem desta entrega:** esta migração exige que o código novo ou o antigo
   esteja no ar? O padrão é **migrar antes do código**: a API e o console
   recusam subir contra esquema atrasado. A exceção só vale quando a descrição
   da migração diz "ordem indiferente" (como as 048, 050 e 051 em
   `docs/COLOCAR-DE-PE.md`).
4. Máquina com `pg_dump` da **mesma versão maior do servidor ou mais nova**
   (o servidor é 17.x). Confira sem tocar no banco:
   ```bash
   node scripts/copiar-producao.mjs --ambiente prod --conferir
   ```
   Sem `pg_dump`, a saída diz o que instalar no seu sistema (`brew install libpq` no
   macOS; pacote `postgresql-client-17` no Debian e Ubuntu; instalador da EDB no
   Windows). Instalado fora do PATH: `DC360_PG_DUMP` com o caminho completo.
5. A senha do banco de PROD está onde o roteiro a encontra: variável de ambiente
   `DC360_SENHA_BANCO_PROD` na sessão, chaveiro (macOS: conta `dc360`, item
   `senha-do-banco-dc360`) ou, num terminal interativo, a pergunta sem eco. A senha
   nunca passa pela tela; não a cole em comando.
6. Ninguém tem ocorrência crítica em andamento. Avise o plantão do município
   (`docs/INDISPONIBILIDADE.md`, seção 3.2).

## Passos

Tudo a partir de `dc360/`.

### 1. Ensaio em HML (depende de V2-F01-E11)

Antes de PROD, a migração nova roda em HML, que ainda não existe. Quando existir:
com o papel de setup de HML (a URL é lida sem eco, nunca digitada na linha),
```bash
read -rs DATABASE_URL && export DATABASE_URL
npm run migrar -- --conferir     # o que falta
npm run migrar                   # aplica
npm run migrar -- --conferir     # tem que dizer que está em dia
unset DATABASE_URL
```
O ensaio só vale se o banco de HML estiver na versão de produção ANTES da
migração nova. Se HML não existir quando esta migração precisar sair, é um
**risco aceito** que precisa ser registrado por escrito (não vale para os
critérios da seção 7 de `docs/roadmap-v2/28-execucao-e-validacao.md`).

### 2. Conferir o que falta em PROD (não escreve nada)

```bash
node scripts/migrar-producao.mjs --ambiente prod
```

Sai com código 1 quando falta migração: é o esperado, não é erro.

### 3. Tirar a cópia

```bash
node scripts/copiar-producao.mjs --ambiente prod --conferir   # diz o que falta na máquina, sem tocar no banco
node scripts/copiar-producao.mjs --ambiente prod              # tira a cópia
```

Grava em `~/dc360-copias/prod/<data>.dump` (a pasta é por ambiente: cópia de HML
não vale para PROD), legível só por você: 0600 no macOS e no Linux, ACL por
`icacls` no Windows (se a ACL falhar, o roteiro recusa gravar). Leva
`--extension=pg_trgm`. O roteiro **recusa**
gravar dentro do repositório, em pasta sincronizada com nuvem (iCloud, Dropbox,
Google Drive, OneDrive) e na Área de Trabalho: o dump traz dado real de
cidadão e nunca pode virar histórico de git nem ir parar numa nuvem que não é
subprocessador. A cópia vale por **30 minutos** para o próximo passo.

### 4. Aplicar

```bash
node scripts/migrar-producao.mjs --ambiente prod --aplicar
```

Mostra o banco (sem a senha) antes de agir. Recusa sem cópia recente e para antes de ler a senha. A saída de escape
`--sem-copia` existe para o dia em que a máquina não tem `pg_dump` e a migração
não pode esperar; fica registrada na conclusão. Quem pula, pula por decisão, e a
decisão vai para o relatório. Cada migração roda na própria transação: se uma
falhar, nada fica pela metade naquele arquivo.

### 5. Endurecer o provedor, de novo (obrigatório, não roda sozinho)

Toda tabela nova nasce concedida aos papéis do provedor (`anon`,
`authenticated`, `service_role`). O arquivo `db/provedores/supabase-endurecer.sql`
revoga isso, é idempotente e se roda a cada migração:

```bash
CA="$(pwd)/db/provedores/supabase-prod-ca-2021.crt"
psql "postgresql://postgres.<PROJETO>:<SENHA>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=${CA}" \
  -v ON_ERROR_STOP=1 -f db/provedores/supabase-endurecer.sql
```

`<PROJETO>` e `<SENHA>` são o que o chaveiro e `docs/IMPLANTACAO.md` (8.2, passo
4) descrevem; a senha vem do chaveiro no macOS
(`security find-generic-password -a dc360 -s senha-do-banco-dc360 -w`) ou da
variável `DC360_SENHA_BANCO_PROD` e nunca é colada no histórico.

### 6. Reimplantar a API (e o console, se a migração for uma que ele lê)

Siga `deploy.md`, passos 3 a 6. A entrada na `master` (que publica o painel) é o
último passo.

### 7. Apagar a cópia quando a migração estiver conferida no ar

```bash
rm ~/dc360-copias/<data>.dump
```

Cópia velha é dado pessoal sem finalidade.

## Verificação

- `node scripts/migrar-producao.mjs --ambiente prod` responde que o banco está em dia (código 0).
- A consulta do passo 5 volta **vazia**; uma linha que seja é uma porta que o
  produto não projetou:
  ```sql
  SELECT grantee, table_name
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND grantee IN ('anon', 'authenticated', 'service_role');
  ```
- `curl -sS https://defesa-civil.fly.dev/saude` devolve `banco: ok` e
  `ultimaMigracao` igual à migração nova.
- O isolamento entre municípios continua afirmado: `npm run test:isolamento`
  passou no PR (é a prova no esquema de teste, não em PROD).

## Voltar atrás (rollback)

**Não existe "desfazer migração".** O aplicador não tem migração de volta, e a
regra de migração reversível depende de V2-F01-E18 (e, mesmo então, o desfazer
é só fora de PROD). O ponto de volta é a **cópia** do passo 3, e o caminho em
ordem de preferência é:

1. **Corrigir para a frente:** uma migração nova, aditiva, que conserta. Quase
   sempre é o certo, porque a migração anterior era compatível.
2. **Voltar a imagem da API** para o release anterior (`rollback.md`, escrito
   pela V2-F01-E08) quando o problema for o código, não o banco. Funciona
   porque a migração é aditiva.
3. **Restaurar a cópia:** só quando houver perda ou corrupção de dado, e a
   decisão é do município, porque restaurar perde o que entrou depois do ponto
   de cópia (`docs/INDISPONIBILIDADE.md`, 3.4). O roteiro é
   `docs/RESTORE-DO-BANCO.md`. Lembre que cópias anteriores à
   V2-F01-E15 não trazem a extensão `pg_trgm` e não restauram (ver "Limites de hoje"). O restore automatizado depende
   de F22-E03 e F22-E04, que não são desta etapa.

Nunca `UPDATE` ou `DELETE` à mão em produção com a credencial de dono para
"arrumar" dado depois de uma migração: isso é incidente por si só
(`docs/INDISPONIBILIDADE.md`, 3.3).

## Segredo e dado pessoal nesta operação

- A senha do banco mora hoje no chaveiro do Mac do dono (ou na variável da sessão,
  nunca em arquivo). Esse é um ponto único de falha; o cofre decidido no CP-07 passa a guardar uma segunda cópia (ver
  `acesso-e-segredos.md`).
- O dump é dado de cidadão: arquivo só do seu usuário, fora de repositório e de nuvem, apagado
  assim que a migração for conferida.
- A segunda pessoa, até o CP-07, **não** migra PROD.

## O que este runbook ainda não cobre

- HML para ensaiar: depende de V2-F01-E11.
- Dump e migração automáticos no pipeline de HML: depende de V2-F01-E12.
- Trava de migração concorrente e migração reversível: depende de V2-F01-E18.
- Restore testado a cada migração: F22-E03 e F22-E04.
