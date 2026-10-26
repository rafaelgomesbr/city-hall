---
validador: privacidade-lgpd (general-purpose com o papel da dimensão)
modelo: claude-sonnet-5-5
etapa: V2-F00-E17
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [LGPD, INFRA]
nivel_de_prova_exigido: [E1, E2, E3a]
nivel_de_prova_obtido: [E1, E3a]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
Aviso: não sou advogado e isto não é parecer jurídico. Cobre a parte técnica (inventário, fluxo, controles, evidência). `$SP` é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/privacidade-lgpd-e09-e10-e11-e15-e17`. Nada foi herdado; tudo foi executado nesta rodada no HEAD `0290af5` (produto de `bb0f654`), no macOS do Rafael. A parte de Infra e CI desta etapa (run do CI, job a job) não é desta dimensão e não foi lida por mim.

## Critérios verificados

A E17 é de ferramenta, sem dado de município nem de cidadão no fluxo ("Testes de autorização e isolamento: Não se aplica"). O critério de LGPD que ela carrega é este, escrito no bloco: "a regra 'dump com dado pessoal não fica no repositório, na nuvem de arquivos nem na Área de Trabalho' é preservada e provada nas duas plataformas". Verifiquei:

1. A conferência de `razaoParaRecusarAPasta` (`scripts/copiar-producao.mjs`) continua recusando repositório, a raiz dele, iCloud (`Mobile Documents`), Dropbox, Google Drive, OneDrive e Área de Trabalho, e aceita pasta fora disso; e o teste reescrito não foi enfraquecido.
2. `copiar-producao.mjs` não mudou (o conserto é só do teste).
3. As três correções de `test:scripts` e de `conferir:numeros` não passam a gravar, ler ou imprimir dado pessoal.
4. A evidência arquivada da etapa não carrega dado pessoal nem segredo.
5. (Foco pedido) O `DICIONARIO-DE-DADOS.md` descreve o que o banco tem: auditoria feita nesta etapa para a fase inteira, porque o dicionário vai junto com o pacote de saída.

## Evidência

Inventário dos dados tocados pela E17: nenhum dado de pessoa é lido, gravado ou transmitido por `comando-de-migracao.test.mjs`, `entitlements-do-ios.test.mjs`, `conferir-numeros.mjs` ou pelos números do README. O único assunto de privacidade é o local da cópia de produção de `copiar-producao.mjs` (o dump traz dado real de cidadão): pasta `~/dc360-copias` por padrão (`PASTA_DE_COPIAS`, modo 0700, arquivo 0600, vale 30 min para o migrador; a senha vai por variável de ambiente, nunca na linha de comando, `copiar-producao.mjs:252-274`), fora do repositório e fora da nuvem e da Área de Trabalho.

Diff da etapa nos arquivos de LGPD: `git diff afde25c..bb0f654 -- dc360/scripts/copiar-producao.mjs` vazio; `copiar-producao.test.mjs` mudou só na construção dos caminhos (`parse(resolve(".")).root` e `join`, em vez de caminho POSIX literal), com as mesmas oito asserções (repositório, a raiz do repositório, iCloud, Dropbox, Google Drive, OneDrive, Área de Trabalho, pasta aceita).

Execuções desta rodada:
- E1: `node --test scripts/copiar-producao.test.mjs scripts/comando-de-migracao.test.mjs scripts/entitlements-do-ios.test.mjs`: 22 de 22, código 0 (`$SP/e17-testes.txt`).
- E1: `npm run test:scripts` inteiro: 288 de 288, 0 falhas, 0 pulados, código 0 (`$SP/e17-test-scripts.txt`); a máquina é Mac, e os 4 testes de iOS que ficam pulados no Linux rodam aqui (divergência conhecida da máquina, não do produto).
- E1: `node scripts/conferir-numeros.mjs`: 25 afirmações conferidas, 0 divergências, código 0 (`$SP/e17-conferir-numeros.txt`).
- Provas de que o teste morde (mutação, desfeita com `git restore`, árvore limpa conferida depois): M10 retirar "Dropbox" da lista de nuvens de `copiar-producao.mjs`: o caso "a pasta de copias recusa o repositorio, a nuvem de arquivos e a Area de Trabalho" reprova (`$SP/mut-e17-m10.txt`); M11 trocar a pasta "Desktop" por "DesktopX": o mesmo caso reprova (`$SP/mut-e17-m11.txt`). O teste portátil continua mordendo.
- Evidência da etapa (fora de `validacao/`) varrida por JWT, `Bearer`, chave de provedor, URL com credencial, CPF e e-mails: nada. A sonda do implementador (rascunho com "1236 testes da API") não toca dado.
- Auditoria do dicionário contra o esquema (`$SP/esquema.mjs` aplica as 50 migrações em PGlite e lista tabelas e colunas, `$SP/esquema.txt`, 36 tabelas; `$SP/colunas-faltando-por-tabela.txt`): todas as tabelas têm entrada, exceto `schema_migracoes` (controle interno de migração, sem dado de pessoa). Há colunas sem descrição por coluna nas seções de `usuarios` (`senha_provisoria_ate`, `ultimo_acesso`, `falhas_login`, `bloqueado_ate`), de `recuperacoes_senha` (`ip`), e a E09 acrescentou o que faltava só para `sessoes`. Isso é de E09, E10 e E11 e está nos relatórios delas; a E17 não toca o dicionário.

## Cenários positivos

- Pasta fora do repositório, da nuvem e da Área de Trabalho é aceita (asserção do teste, e a pasta padrão `~/dc360-copias` é aceita).
- `conferir:numeros` fecha com 0 divergência e lê a API como 1237 listada contra 1237 executada, declarando os pulos por ambiente.

## Cenários negativos

- Os cinco lugares recusados continuam recusados no macOS (provado nas execuções); a portabilidade para Windows e Linux é do CI e do Windows do implementador, que não reproduzi.
- Mutar a lista ou a Área de Trabalho faz o teste reprovar (M10, M11).
- O caso do iOS (`mode` escrito à mão) tem testes próprios com rascunhos estragados e passa (22 de 22 nos três arquivos); não mutei esse caso, que não é de LGPD.

## Tentativas de reprovar

1. Enfraquecer a conferência da cópia de produção sem o teste notar: tentei remover um provedor de nuvem e a pasta Desktop (M10, M11); o teste reprovou nas duas. Não consegui.
2. Procurar dado pessoal ou segredo na saída arquivada da etapa: nada.
3. Procurar caminho em que `copiar-producao` aceitaria `~/Documents` ou `~/Desktop` sincronizado com iCloud sem a palavra "iCloud" ou "Mobile Documents" no caminho: aceitaria, porque a conferência é por NOME de caminho (Achado 1); a pasta padrão não está em nenhum dos dois, então o fluxo normal não cai nisso.
4. Procurar mudança de comportamento de produto escondida no diff da etapa: `git diff afde25c..bb0f654 --stat` em `copiar-producao.mjs` é vazio; `conferir-numeros.mjs` só conta e imprime; nenhum arquivo de `apps/` ou `db/` mudou por causa da E17.
5. Dicionário: procurei tabela sem entrada (só `schema_migracoes`) e coluna de pessoa sem descrição (lista acima, repassada às etapas donas).

## Achados

1. **anotado.** `razaoParaRecusarAPasta` decide por nome de caminho. Em macOS com iCloud "Mesa e Documentos" ligado, `~/Desktop` é recusado (nome), mas `~/Documents/...` seria aceito, e o conteúdo de `~/Documents` é sincronizado com a nuvem sem o nome "iCloud" aparecer no caminho. A pasta padrão (`~/dc360-copias`) não é afetada. Anterior à etapa e fora do que a E17 devia mexer ("reescrever sem enfraquecer: os cinco lugares recusados continuam recusados").
2. **anotado (repasse).** As lacunas do dicionário citadas acima estão atribuídas a E09, E10 e E11, onde as reportei; a E17 não as causou.

## Não verificado

- Windows e Linux: não há Windows aqui, e o Linux só existe no CI; a portabilidade dos três casos ("Fechado nos dois sistemas") é do CI e do Windows do implementador. Provei só o macOS.
- CI do SHA: `ci_run` ausente; o job de testes de scripts no CI pertence à dimensão Infra e CI.
- Executar `copiar-producao.mjs` contra produção: não tenho (nem devo ter) credencial, e a cópia real traria dado de cidadão.
- Se a máquina de quem opera tem `~/Documents` sincronizado com nuvem: depende de cada máquina.

## Risco residual

- A conferência da pasta de cópias é por nome; uma máquina com `Documents` sincronizado por outro caminho passaria (Achado 1). Baixo, porque o padrão é `~/dc360-copias` e a ferramenta é de operação do fornecedor.

## Motivo do humano

`humano_necessario: nao`. A parte de LGPD desta etapa foi verificada por execução (testes, mutação e varredura da evidência). O que a etapa pede a Rafael (rodar os dois comandos na máquina dele) foi substituído por E1 no macOS, e a prova em Windows e Linux é da dimensão Infra e CI.
