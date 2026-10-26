# ADR 0009: pessoa global com conta e vínculo por município, e token de um município por vez

- **Data da decisão:** 01/10/2026 (decisão D-08 do Rafael; registro escrito em 26/10/2026, V2-F03-E01;
  correção 1 em 26/10/2026, depois da segunda leitura de segurança; correções
  2 a 6 em 26/10/2026, depois da segunda à sexta rodadas dessa revisão)
- **Situação:** PROPOSTA. Aceite pendente do Rafael (H97, junto com a redação
  proposta para o CLAUDE.md) e parecer do encarregado de dados (CP-49). Até o
  aceite, o código da F03 segue esta proposta como premissa
  (`docs/roadmap-v2/retomada/plano-f03.md`, seção 1, E01); nada dela vai para
  produção com a mesma pessoa em mais de um município antes do CP-49.
- **Revoga:** D-02 e A-01 (`docs/roadmap-v2/01-decisoes-e-principios.md`), pela D-08
- **Depende de:** ADR 0001, ADR 0004
- **Complementa:** ADR 0006 (o teto do município continua sendo o administrador,
  e passa a valer só sobre o que é do município) e ADR 0008 (continua não
  existindo credencial que leia dado de negócio de dois municípios)
- **Escopo:** `dc360/` (o produto real). Não se aplica ao protótipo em `mockup/`.

## Contexto

### Como é hoje (árvore `v2/f03` em `ddee3fd`)

Hoje **uma pessoa é uma linha de `usuarios`, e uma linha de `usuarios` é de um
município só.**

- `usuarios` (migração 001) tem `organizacao_id`, nome, matrícula, e-mail, papel
  (CHECK com os quatro papéis), equipe e `ativo`, com `UNIQUE (organizacao_id,
  matricula)` e `UNIQUE (organizacao_id, email)`, sob RLS ativada e forçada.
- A credencial mora na mesma linha: a 002 acrescentou `senha_hash`,
  `falhas_login`, `bloqueado_ate` e `ultimo_acesso`, e a 046 acrescentou
  `senha_provisoria_ate`.
- **O papel de aplicação tem UPDATE na TABELA `usuarios` inteira** (001, linha
  330: `GRANT SELECT, INSERT, UPDATE ON ... usuarios ... TO dc360_app`), e
  nenhuma migração depois disso trocou esse privilégio por privilégio de coluna.
  No Postgres, `REVOKE UPDATE (coluna)` não retira um `UPDATE` concedido na
  tabela: os dois privilégios são independentes.
- A 002 criou `usuarios_email_global_idx`, índice único TOTAL em
  `lower(email)` sobre o sistema inteiro, com o motivo escrito no próprio
  arquivo: "na hora do login ainda não se sabe o município, e dois usuários com
  o mesmo email em prefeituras diferentes tornariam a resposta ambígua". O
  índice não olha `ativo`: conta desativada continua prendendo o e-mail. Por
  causa dele, `POST /usuarios` (`rotas/administracao.ts`) responde 201 para
  e-mail livre e 409 `usuario_repetido` para e-mail que existe em qualquer
  município: quem administra A, comparando com a própria lista, descobre que o
  e-mail tem conta fora de A. É um oráculo que existe desde a F00.
- O administrador troca o e-mail de outra conta pelo `PATCH /usuarios/:id`, e
  `abrir_recuperacao` (005) procura o e-mail em `usuarios` e manda o link para
  ele. Trocar o e-mail e pedir a recuperação é, hoje, um caminho de tomada de
  conta dentro do município (o próprio comentário da rota o descreve).
- `sessoes` (002, com `familia_id` desde a 047) é por município, sob a policy
  `organizacao_id = app_organizacao_atual()`.
- As travas são por CONTA: `travar_sessoes_do_usuario` (049) toma
  `pg_advisory_xact_lock` sobre `usuarios.id`, e o gatilho
  `recuperacoes_morrem_com_a_credencial` (051) dispara em `UPDATE OF senha_hash,
  ativo` de `usuarios` e mata os links daquela conta.
- `segundo_fator` e `segundo_fator_recuperacao` (022) são por
  `(organizacao_id, usuario_id)`: o segundo fator também é de um município. O
  consumo do código TOTP (`auth/segundo-fator.ts`) lê `ultimo_passo` sem trava e
  grava sem condição sobre o valor lido, e desligar o fator pede só a senha.
- O login chama `credenciais_para_login(email)` (SECURITY DEFINER, 002,
  redefinida na 013), que acha a única conta daquele e-mail e, com ela, o
  município. O token sai com esse município fixo. O desafio do segundo fator já
  carrega a impressão da credencial (`cr`, `auth/servico.ts`) e a sessão só
  nasce se a credencial ainda for a conferida.
- O token de acesso (`dc360/apps/api/src/auth/tokens.ts`, `CONTEUDO_ACESSO`) é
  JWT HS256 de 15 minutos com `sub` (o `usuarios.id`), `org`, `papel`, `nome`,
  `sid` e a marca opcional `sp` (senha provisória); emissor `dc360-api`,
  plateia única `dc360`.
- `exigirAutenticacao` (`dc360/apps/api/src/servidor.ts`, por volta da linha
  574 neste SHA) verifica o token e monta a `Identidade` com `usuarioId = sub`,
  `organizacaoId = org`, `papel`, `nome` e `sessaoId = sid`. A ESCRITA (método
  diferente de GET e HEAD, ou rota marcada `comEfeito`) chama `lerVigencia`
  (`auth/vigencia.ts`, uma consulta sob `comTenant(org)`) e `exigirVigencia`;
  a LEITURA PURA confia no papel, no nome e na marca `sp` do token pelos quinze
  minutos dele.
- O portão de isolamento (`dc360/db/test/isolamento.test.ts`) isenta, por nome,
  as tabelas sem `organizacao_id` em `SEM_TENANT` (`schema_migracoes`,
  `organizacoes`, `protocolo_sequencias`, `interesse_municipio`,
  `console_operadores`, `console_codigos_de_recuperacao`) e as sem policy de
  contexto em `SEM_POLICY_DE_TENANT` (só `interesse_municipio`), e limita as
  funções SECURITY DEFINER por um TETO numérico (`<= 27`), não por nome. As duas
  listas são diferentes de propósito: `organizacoes` e `protocolo_sequencias`
  não têm a coluna e TÊM policy de contexto, e continuam conferidas.

A consequência era aceita e estava escrita: um e-mail é uma conta, e uma conta
é um município. A-01 aceitou isso para a V2 ("não redesenhar o login agora") e
a D-02 deixou fora do modelo autenticado quem trabalha em vários municípios.

### Por que muda

Em 01/10/2026 o Rafael decidiu (D-08) que o órgão externo que atende vários
municípios entra na V2, com PESSOA GLOBAL e vínculos: uma conta da pessoa, um
vínculo em cada município e órgão, o token valendo para UM município por vez e
a pessoa escolhendo o município ao entrar. O isolamento entre municípios
continua como hoje.

O caso guia é o engenheiro de uma distribuidora de energia que atende doze
municípios. No modelo de hoje ele precisaria de doze e-mails, doze senhas e
doze segundos fatores, e a prefeitura que desativa a conta dele prende o
e-mail para sempre.

A dificuldade é que a regra número um do CLAUDE.md, lida ao pé da letra,
parece proibir isso: toda tabela de negócio tem `organizacao_id`, e a
organização vem só do token. Uma pessoa global, e um órgão que existe em vários
municípios, parecem violar as duas frases (achados BZ-D:IDN-35 e BZ-D:SEC-48 da
auditoria). Esta ADR mostra em que condições não violam, e transforma essas
condições em regra cobrada por teste.

### O que a segunda leitura de segurança mudou (correção 1)

A primeira redação passou por uma leitura de segurança de outra família de
modelo (Codex, somente leitura), com onze achados, oito deles bloqueando o
aceite. Todos foram conferidos contra o código e as migrações deste SHA e
todos procedem. A tabela achado a achado, com onde cada um foi fechado, está em
`docs/evidencias-v2/G03/V2-F03-E01/correcao-1/RESUMO.md`. Em resumo, esta
redação acrescenta: a relação estritamente um para um entre conta e pessoa até
a liberação da segunda conta (decisão 1); o privilégio de coluna no lugar do
UPDATE de tabela (decisão 1); a autorização por operação e a imutabilidade de
`usuarios.pessoa_id` (decisão 3); os escopos local e global de revogação
(decisão 7, nova); a regra de que nenhuma resposta a um município depende do
que a pessoa tem em outro, que retira o 409 `pessoa_em_varios_municipios` da
primeira redação (decisão 6); a prova nova de autenticação na troca de
município (decisão 2); e os requisitos da E11, da E16 e do catálogo da parte 0B
(decisões 2, 3 e 8).

### O que a segunda rodada da revisão mudou (correção 2)

A redação da correção 1 voltou à mesma revisão (Codex, somente leitura). Sete
achados ficaram fechados como requisito; quatro ficaram parciais (1, 3, 5 e 6)
e apareceram quatro bloqueios novos, todos nas transições que a correção 1
deixou descritas só pelo resultado. A tabela item a item está em
`docs/evidencias-v2/G03/V2-F03-E01/correcao-2/RESUMO.md`. Esta redação
acrescenta:

- **a liberação da segunda conta como procedimento de implantação**, e não
  como "mesmo SHA": as proteções entram numa migração aditiva, a API nova é
  implantada em todas as instâncias, e só então uma migração própria retira o
  `UNIQUE (pessoa_id)`, recusando no banco os caminhos antigos, para que uma API
  anterior contra o banco liberado falhe fechada; com rollback escrito
  (decisão 1, "Como a segunda conta é liberada");
- **a não enumeração estendida ao tempo e aos efeitos** que o município consegue
  observar depois (conta, contagens, estado do convite, trilha, reemissão,
  entrega), com o pedido aceito sem consulta fora do município e sem esperar o
  provedor de e-mail (decisão 3, "Não enumeração");
- **a conta nasce no aceite do convite**: não existe conta pendente em
  `usuarios`, e o gatilho que cria pessoa nova fica só para quem nasce fora do
  convite; mais o registro de qual índice impede qual duplicidade, antes e
  depois da E09 (decisão 1);
- **a ordem completa das travas**, com a linha do município, a trava da pessoa,
  as linhas de conta e de pessoa, os gatilhos, convites, links e sessões, que
  concilia o gatilho `pessoa_acompanha_as_contas` da E09 e a linha de
  `organizacoes` que o login já toma (decisão 7);
- dois esclarecimentos: a imutabilidade de `pessoa_id` vale para DML com o
  gatilho habilitado, e DDL fica fora do alcance da aplicação (decisão 1); a
  escolha e a troca de município exigem o código sempre que o login exigiria,
  inclusive com o fator ligado por vontade da pessoa (decisão 2).

### O que a terceira rodada da revisão mudou (correção 3)

A redação da correção 2 voltou à mesma revisão, que deixou dois pontos
impedindo o aceite e uma observação. O resumo está em
`docs/evidencias-v2/G03/V2-F03-E01/correcao-3/RESUMO.md`. Esta redação
acrescenta:

- **a origem protegida do `pessoa_id`**: o gatilho adiado vê a linha no estado
  final e não distingue sozinho o valor criado pelo gatilho criador do valor
  informado pelo chamador; a origem passa a ser gravada por quem produz o valor
  numa tabela que o `dc360_app` não alcança (decisão 1, "De onde veio o
  `pessoa_id`");
- **o escopo das regras 3 e 6 da ordem das travas**: a regra 3 vale para a
  escrita direta em `pessoas` a partir da E08, com o espelho dos passos 1 e 2
  como exceção explícita; a regra 6 vale só para os caminhos globais, e a
  desativação e a reativação locais seguem dentro da ordem (decisão 7);
- a observação de que o teste de tempo não é prova absoluta (decisão 3).

### O que a quarta rodada da revisão mudou (correção 4)

A redação da correção 3 voltou à mesma revisão, que deu como fechadas as regras
3 e 6 da ordem das travas, manteve o teste de tempo como observação (obrigação
da etapa que o traz) e deixou um ponto impedindo o aceite e uma dívida. O
resumo está em `docs/evidencias-v2/G03/V2-F03-E01/correcao-4/RESUMO.md`. Esta
redação acrescenta:

- **o verificador adiado como único LEITOR da marca de origem**: o `dc360_app`
  não lê `origens_de_conta`, então a função do gatilho adiado precisa ler com
  privilégio, e a correção 3 só deixava os escritores citarem a tabela. A
  exceção é estreita (só leitura, só a marca da própria conta ou da própria
  transação, sem devolver nada), os escritores continuam os mesmos, e o teste
  distingue leitor de escritor no corpo e no comportamento (decisão 1, "Quem
  pode ler a marca");
- **o destino da marca na eliminação do município**: a marca não tem
  `organizacao_id`, é exceção protegida, e sai junto com a conta que ela
  descreve, e só com ela; nunca fica órfã, nunca some com a conta viva, e a
  eliminação de um município não toca marca de conta de outro (decisão 1, "A
  marca quando a conta some").

### O que a quinta rodada da revisão mudou (correção 5)

A redação da correção 4 voltou à mesma revisão, que deu a eliminação como
fechada no desenho e o leitor como parcial, com um ponto impedindo: comparar o
conteúdo da tabela antes e depois não prova que o ramo verificador da função
compartilhada não escreve (ele poderia inserir uma marca temporária para um id
sem conta e apagá-la), e a conferência textual só alcança a leitora separada.
O resumo está em `docs/evidencias-v2/G03/V2-F03-E01/correcao-5/RESUMO.md`.
Esta redação troca a prova: o verificador, nos dois desenhos, é provado sem
escrita pelos CONTADORES de escrita da transação (`pg_stat_xact_user_tables`)
e pelas sequências, com a sabotagem da marca temporária reprovando; se a
contagem não for confiável no ambiente, só a leitora separada é aceita
(decisão 1, "Quem pode ler a marca").

### O que a sexta rodada da revisão mudou (correção 6)

A redação da correção 5 voltou à mesma revisão, que confirmou que os
contadores da transação contam a escrita desfeita, mas deixou dois pontos
impedindo: um ramo verificador pode ter efeito que nenhum contador vê
(`pg_notify`, trava consultiva de sessão, `set_config`), e os observadores são
incompletos (sequência com `is_called` mudado ou valor em cache, catálogo do
sistema fora de `*_user_tables`, tabela criada e apagada entre as leituras).
O resumo está em `docs/evidencias-v2/G03/V2-F03-E01/correcao-6/RESUMO.md`.
Esta redação fecha pela estrutura, sem enumerar efeitos: o verificador passa a
ser OBRIGATORIAMENTE uma função leitora separada, `conferir_origem_da_conta()`,
com `search_path` fixo e o corpo conferido por LISTA PERMITIDA, falhando
fechado; a opção de ramo da função do criador sai; os contadores ficam como
prova adicional; e a medição no `COMMIT` (descarga pela conexão que escreveu,
leitura sem fotografia antiga) fica como obrigação de implementação (decisão
1, "Quem pode ler a marca").

## Decisão

**Existe pessoa global. Não existe token, sessão nem consulta que valha para dois
municípios ao mesmo tempo, nem resposta a um município que dependa do que a
pessoa tem em outro.** As frases convivem pelas decisões abaixo, e nenhuma é
opcional. As decisões 1 a 6 são os itens 1 a 6 da etapa V2-F03-E01
(`docs/roadmap-v2/05-api-identidade-autorizacao.md`); a 7 e a 8 vieram da
segunda leitura de segurança; as alternativas descartadas (item 7 da etapa)
estão no fim.

### 1. Pessoa, conta e vínculo são três coisas

- **`pessoas` é global e guarda o mínimo:** nome, e-mail, a credencial
  (`senha_hash`, falhas, bloqueio, `senha_provisoria_ate`),
  `email_verificado_em`, `ativo` e, a partir da E11, o segundo fator. É a
  recomendação técnica do CP-49: o mínimo na pessoa, o resto no município, para
  que o parecer do encarregado possa restringir mais sem reescrever. Nada de
  município mora na pessoa: nem papel, nem matrícula, nem equipe, nem órgão.
- **`usuarios` passa a ser a CONTA da pessoa num município.** Mesmos ids, mesmas
  chaves estrangeiras compostas `(organizacao_id, id)` (são mais de vinte, e
  nenhuma muda), mais `pessoa_id`, com `UNIQUE (organizacao_id, pessoa_id)`
  (uma conta por pessoa em cada município) e `UNIQUE (organizacao_id, id,
  pessoa_id)` (alvo das chaves compostas que precisam carregar a pessoa).
  Papel, matrícula, equipe e `ativo` continuam na conta, sob a RLS de hoje.
- **`usuarios.pessoa_id` é atribuído uma vez, na criação da conta, e nunca
  muda.** Depois do backfill da E15 a coluna é `NOT NULL`, então não existe
  conta "ainda sem pessoa" que um UPDATE possa ligar depois. Gatilho no banco
  recusa todo UPDATE em que `pessoa_id` mude (`IS DISTINCT FROM`), para todo
  papel, inclusive o dono das funções. O papel de aplicação não tem privilégio
  de INSERT nem de UPDATE nessa coluna (privilégio de coluna, E15). A conta só
  nasce de dois jeitos:
  - **sem pessoa informada**, fora do convite (backfill e sementes da E15,
    `provisionar_municipio`, o `POST /usuarios` de hoje até a E10, o modo
    local): o gatilho `BEFORE INSERT` vê `pessoa_id` nulo, CRIA uma pessoa
    nova para ela e grava a origem `criador`. Ele nunca procura pessoa pelo
    e-mail, então coincidência de e-mail nunca liga conta a pessoa;
  - **com a pessoa já comprovada**, só dentro de `aceitar_convite` (E10): a
    função cria a pessoa nova (quem aceita define a senha) ou usa a pessoa
    existente (quem aceita prova que é ela), grava a origem `aceite` e só então
    insere a conta já com esse `pessoa_id`. Fora disso, o `BEFORE INSERT`
    recusa na hora todo `pessoa_id` informado pelo chamador, e um gatilho de
    restrição adiado (`DEFERRABLE INITIALLY DEFERRED`) confere, no fim da
    transação, que a origem gravada bate com o estado final da linha (abaixo,
    "De onde veio o `pessoa_id`").
- **O alcance do gatilho é DML com o gatilho habilitado, e DDL está fora do
  alcance da aplicação.** Gatilho comum dispara também para SECURITY DEFINER e
  para papel com BYPASSRLS, por isso vale para o dono das funções quando ele
  faz UPDATE. Mas o dono da tabela pode desabilitar o gatilho por DDL (`ALTER
  TABLE ... DISABLE TRIGGER`) e um superusuário pode desligá-lo por
  `session_replication_role`. A garantia, então, é escrita assim: (1) o
  `dc360_app` não é dono, não é superusuário, não tem o privilégio `TRIGGER` em
  `usuarios` nem em `pessoas` e não pode mudar `session_replication_role`; (2)
  nenhuma função de `FUNCOES_PRIVILEGIADAS` contém DDL nem mexe em
  `session_replication_role` (o catálogo da 0B confere o corpo, decisão 8);
  (3) quem pode fazer DDL são as identidades de migração e de operação do
  banco, que a API não usa e que só agem por migração revisada. Uma migração
  que desabilite o gatilho, ainda que por um instante, precisa dizer por quê no
  cabeçalho e religá-lo na mesma transação, e o teste da E15 confere que ele
  está habilitado (`tgenabled`) depois de toda a cadeia de migrações.
- **`sessoes` ganha `pessoa_id` e continua por município.** Cada sessão é de uma
  conta num município, e a vigência confere as três coisas juntas (município,
  conta e pessoa).
- **`orgao_vinculos` é o vínculo temporal da conta com um órgão do MESMO
  município** (E05): papel no órgão (`gestor`, `executor`, `leitor`), início,
  fim, quem concedeu e os motivos; RLS ativada e forçada por município; chave
  composta com a conta e com o órgão, de modo que uma conta de A nunca se liga a
  órgão de B. Vínculo se encerra com motivo, nunca se apaga.

#### De onde veio o `pessoa_id`: a origem gravada numa tabela protegida (correção 3)

O gatilho adiado é um gatilho de restrição, `AFTER ROW`, e vê a linha no estado
final, depois de todos os gatilhos `BEFORE`. Nesse ponto a conta cuja pessoa o
gatilho criador acabou de criar e a conta inserida por quem informou
`pessoa_id` são iguais: as duas têm a coluna preenchida. Testar só
`NEW.pessoa_id` recusaria também o caminho permitido, ou aceitaria os dois. Por
isso a origem do valor é gravada por quem o produz, num lugar que o chamador
não alcança:

- **Onde a marca mora:** na tabela `origens_de_conta` (E15), uma linha por
  conta: `usuario_id` (chave primária), `pessoa_id`, `origem` (`backfill`,
  `criador` ou `aceite`), `convite_id` (só no `aceite`) e `transacao`
  (`pg_current_xact_id()` de quem gravou). **Sem `organizacao_id`** (correção
  4; a correção 3 previa a coluna): o município da marca é o da conta, que já
  está sob o RLS de `usuarios`, e com a coluna a 038 exigiria a tabela na ordem
  de apagamento (DC366), que passaria a citá-la (abaixo, "A marca quando a
  conta some"). Por isso ela é exceção nomeada em `EXCECOES_AO_ISOLAMENTO`
  (decisão 3), da espécie PROTEGIDA: dispensa a coluna e a policy de contexto,
  e mantém RLS ativada e forçada sem policy nenhuma, zero grant a papel do
  produto (o `dc360_app` não tem nem SELECT), nenhuma chave estrangeira sem
  município e nenhum DELETE de papel do produto. Ninguém faz UPDATE; DELETE só
  junto com a conta, no único caminho que apaga conta (a eliminação do
  município). Enquanto a conta existe, a marca é o registro permanente de como
  ela ganhou a sua pessoa.
- **Quem pode defini-la (os ESCRITORES):** só a função do gatilho criador
  (`criador`, quando cria a pessoa nova), `aceitar_convite` (`aceite`, com o
  convite e a pessoa comprovada, gravada ANTES do INSERT da conta, cujo id a
  própria função gera) e o backfill da E15 (`backfill`, uma linha por conta
  existente, gravada pela própria migração, fora de função). Nunca o
  `dc360_app`: ele não tem privilégio na tabela. O catálogo da 0B confere que
  nenhuma função do banco, privilegiada ou não, cita `origens_de_conta` no
  corpo fora desses dois escritores e da função leitora declarada
  (`conferir_origem_da_conta`, abaixo).
- **Quem pode LER a marca, e só ler: a função LEITORA do verificador
  (correções 4 e 6).** O gatilho adiado dispara no fim da transação com o
  papel da sessão, que para o cadastro de hoje é o `dc360_app`, e o
  `dc360_app` não tem SELECT na tabela. Para conferir a marca, a função do
  adiado precisa ler com privilégio (SECURITY DEFINER do dono, que ignora o
  RLS forçado sem policy). É a única leitura fora dos escritores, e a garantia
  é ESTRUTURAL (correção 6): o que a função pode fazer é o que o corpo dela
  consegue dizer, e o corpo só pode dizer o que está numa lista permitida.
  Provar ausência de efeito pelo comportamento exigiria enumerar todos os
  efeitos possíveis (escrita desfeita, sequência, `pg_notify`, trava
  consultiva de sessão, `set_config`, catálogo do sistema, tabela criada e
  apagada no meio), e essa enumeração não fecha. As condições valem juntas:
  1. **função separada, obrigatoriamente:** o verificador é uma função
     própria, `conferir_origem_da_conta()`, que só lê, e NÃO um ramo da função
     do gatilho criador (a opção de ramo, aberta na correção 4, sai na
     correção 6). Ela atende os dois gatilhos de conferência de
     `public.usuarios`: o adiado por linha (`usuarios_origem_da_pessoa`,
     constraint trigger `AFTER INSERT`, `DEFERRABLE INITIALLY DEFERRED`) e o
     de comando que impede marca `criador` sem conta
     (`usuarios_nenhuma_pessoa_sem_conta`, `AFTER INSERT FOR EACH
     STATEMENT`). A função do gatilho criador (`conta_ganha_pessoa`) fica só
     com o que escreve: o `BEFORE INSERT` que cria a pessoa e grava `criador`,
     e o `AFTER DELETE` que tira a marca da conta apagada;
  2. **declarada no catálogo como LEITORA, no máximo uma:** `RETURNS
     trigger`, SECURITY DEFINER, `proconfig` com `search_path` fixo
     exatamente em `pg_catalog, public, pg_temp` (os operadores e as funções
     do sistema resolvem em `pg_catalog` antes de qualquer outro esquema),
     sem EXECUTE de papel do produto nem de `PUBLIC`, disparada só pelos dois
     gatilhos declarados de `public.usuarios` e conferindo `TG_RELID` contra
     `'public.usuarios'::regclass` (regras da 0G);
  3. **corpo conferido por LISTA PERMITIDA, não por lista proibida:** sobre o
     `prosrc` normalizado (comentários fora, espaços colapsados, caixa
     uniforme fora dos literais), o corpo PL/pgSQL só pode ter, e cada
     comando é reconhecido contra esta lista ou reprova:
     - declarações de variável (`DECLARE`), sem valor inicial que chame
       função;
     - `SELECT ... INTO` com tabelas qualificadas pelo esquema, em uma destas
       formas e mais nenhuma: a marca da própria conta (`FROM
       public.origens_de_conta WHERE usuario_id = NEW.id`); a pessoa da linha
       (`FROM public.pessoas WHERE id = NEW.pessoa_id`), só para conferir que
       ela existe; a conta pela própria linha (`FROM public.usuarios WHERE id
       = NEW.id`), se necessário; no gatilho de comando, a marca `criador` da
       própria transação sem conta (`FROM public.origens_de_conta WHERE
       transacao = pg_current_xact_id() AND origem = 'criador' AND NOT EXISTS
       (SELECT 1 FROM public.usuarios WHERE id = usuario_id)`, com
       `LIMIT 1`); e, a partir da E10, o convite da marca (`FROM
       public.convites_de_vinculo WHERE id =` a variável lida da marca), só
       com as colunas que o adiado confere. Nada de `FOR UPDATE`, `FOR
       SHARE`, junção a outra tabela, subconsulta fora da forma acima ou
       função na lista de colunas;
     - `IF`, `ELSIF`, `ELSE` e `END IF` com comparações (`=`, `<>`, `IS
       DISTINCT FROM`, `IS NULL`, `IS NOT NULL`, `NOT`, `AND`, `OR`) entre
       variáveis, campos de `NEW`, `FOUND`, `TG_RELID`, `TG_NAME`, `TG_WHEN`,
       `TG_LEVEL`, `TG_OP`, literais e o literal `'public.usuarios'::regclass`;
     - `RAISE EXCEPTION USING` com `ERRCODE` fixo e `MESSAGE`, `DETAIL`,
       `CONSTRAINT` e `TABLE` só com literais de texto (sem `||`, sem
       `format`, sem variável), igual para marca ausente, de outra transação,
       de outra pessoa ou incoerente;
     - `RETURN NULL` ou `RETURN NEW`;
     - chamada de função: só a lista nominal mínima de funções do sistema
       sem efeito, que hoje é `pg_current_xact_id()` e `coalesce`.

     Fica fora, e reprova se aparecer: `PERFORM`, `EXECUTE`, `NOTIFY` e
     `pg_notify`, `pg_advisory*`, `set_config` e `SET`, `nextval`, `setval`
     e `currval`, qualquer DML (`INSERT`, `UPDATE`, `DELETE`, `MERGE`,
     `TRUNCATE`), DDL, `COPY`, `CALL`, cursor, laço, bloco `EXCEPTION`,
     bloco aninhado, chamada a função do produto ou a qualquer função fora da
     lista. A conferência FALHA FECHADA: construção que ela não reconhece
     reprova, ainda que seja inofensiva; para aceitar uma construção nova, a
     lista permitida muda por revisão, nunca por tolerância do conferidor;
  4. **nada volta ao chamador:** o retorno do gatilho `AFTER` é descartado e a
     recusa é constante (condição 3), sem nenhum valor lido da marca (nem
     pessoa, nem origem, nem transação).

  Os escritores continuam sendo só a função do gatilho criador e
  `aceitar_convite`.

  **Os contadores de escrita ficam como prova ADICIONAL, comportamental
  (correção 5).** Eles não são a garantia (a garantia é a lista permitida),
  mas pegam desvio entre o corpo conferido e o que o banco executa. Nos testes
  da E15 e da E10 e no portão da 0B, nos caminhos que passam e nos que
  recusam (marca ausente, de outra transação, com outra pessoa e, a partir da
  E10, `aceite` com o convite não consumido):
  - **dentro da transação:** imediatamente antes de disparar o adiado com
    `SET CONSTRAINTS usuarios_origem_da_pessoa IMMEDIATE` e logo depois dele
    (no caminho que recusa, depois de voltar ao ponto de salvamento aberto
    antes do disparo), lê, como dono, os contadores `n_tup_ins`, `n_tup_upd`
    e `n_tup_del` de `pg_stat_xact_user_tables` de todas as tabelas de
    usuário e o `last_value` e o `is_called` de toda sequência. Tudo tem de
    ficar igual. O contador da transação conta também a linha desfeita, e por
    isso vê a marca inserida e apagada; o que ele não vê (efeito fora de
    tabela de usuário, valor de sequência já reservado em cache, tabela
    criada e apagada no meio) é o que a lista permitida tira do alcance da
    função;
  - **na confirmação (obrigação de implementação):** em transação própria, o
    adiado dispara só no `COMMIT`. A prova lê os contadores acumulados
    (`pg_stat_user_tables`) antes e depois, e exige que a diferença seja
    exatamente a escrita conhecida dos escritores (por conta criada pelo
    criador: uma inserção em `usuarios`, uma em `pessoas` e uma em
    `origens_de_conta`; nenhuma atualização nem remoção nelas), a mesma no
    caminho que recusa. Como os acumulados não são instantâneos, a etapa que
    implementa garante a descarga pela própria conexão que escreveu (ela
    chama `pg_stat_force_next_flush()` e faz a descarga acontecer antes de a
    leitura começar) e a leitura sem fotografia antiga
    (`pg_stat_clear_snapshot()` na conexão que lê), num banco de prova sem
    outra sessão escrevendo, e mostra, com a sabotagem da marca temporária,
    que a medida enxerga a escrita;
  - **sabotagens obrigatórias** (cada uma é uma leitora declarada com o corpo
    alterado, e todas reprovam no portão da 0B, pela lista permitida; as que
    escrevem em tabela reprovam também nos contadores): com `pg_notify`; com
    `pg_advisory_lock`; com `set_config`; com `nextval`; com chamada a uma
    função auxiliar que escreve; com `INSERT` e `DELETE` de uma marca
    temporária para id sem conta, deixando a tabela igual; e a mesma escrita
    dentro de bloco `EXCEPTION` desfeito.
- **Por que não variável de sessão nem parâmetro:** `set_config` e `SET LOCAL`
  de variável própria (`dc360.*`) estão ao alcance de qualquer papel, inclusive
  o `dc360_app`, então a marca seria definida pelo chamador. Parâmetro de
  função não chega ao gatilho, que não enxerga os argumentos de quem fez o
  INSERT.
- **O `BEFORE INSERT` recusa o `pessoa_id` informado** pelo chamador, a menos
  que exista, na mesma `transacao`, a marca `aceite` para aquele `usuario_id`
  e aquele `pessoa_id`. Com `pessoa_id` nulo, cria a pessoa nova e grava
  `criador`. O `dc360_app` já não chega com o valor preenchido (privilégio de
  coluna); essa recusa cobre função privilegiada que não seja `aceitar_convite`.
- **O adiado confere a coerência no estado final:** toda conta inserida tem a
  sua linha em `origens_de_conta`, da mesma `transacao`, com o mesmo
  `pessoa_id` da linha final (um gatilho `BEFORE` posterior que trocasse o
  valor é pego aqui); se a origem é `aceite`, o convite `convite_id` foi
  consumido nessa transação apontando para essa conta e essa pessoa. Sem
  marca, com marca de outra transação ou com incoerência, a transação inteira
  volta.
- **Na E15** só existem `backfill` e `criador`: sem `aceitar_convite`, todo
  `pessoa_id` informado é recusado no `BEFORE INSERT`, e toda conta criada pelo
  gatilho criador passa no adiado. A E10 (058) redefine a função do gatilho
  criador (o `BEFORE INSERT` passa a aceitar a marca `aceite` da transação) e a
  leitora (passa a aceitar a origem `aceite` e a ler o convite da marca, na
  forma da lista permitida), sem dar à leitora nada fora da lista, e deixa
  fora do privilégio do `dc360_app` as colunas do convite que o adiado confere
  (estado, `usuario_id`, `pessoa_id`, data do aceite), que só
  `aceitar_convite` grava.

#### A marca quando a conta some (correção 4)

Conta não se apaga: se desativa, com motivo. O único caminho que apaga linha de
`usuarios` é a eliminação do município (`executar_eliminacoes_vencidas`, 038,
camada 6, como dono). A regra para a marca nesse caminho:

- **a marca vai com a conta que ela descreve, e só com ela.** A marca de cada
  conta apagada sai no mesmo comando que apaga a conta, escolhida pela própria
  conta (`usuario_id` igual ao id da conta apagada) e por nenhum outro
  critério: nunca por `pessoa_id` (a mesma pessoa pode ter conta viva em outro
  município, e a marca daquela conta é a prova de lá), nunca por transação,
  nunca sem filtro. Quem remove é o escritor `criador` (a função do gatilho
  criador, num gatilho de `DELETE` de `public.usuarios`; depois da correção 6
  essa função já não verifica nada), nunca o
  verificador, nunca função nova e nunca `ordem_de_apagamento_por_municipio()`:
  a tabela não tem `organizacao_id`, então fica fora da ordem sem esbarrar no
  DC366, e a função da ordem não a cita;
- **a trava de permanência fica mais exata, não mais frouxa:** recusa UPDATE
  sempre, TRUNCATE sempre e DELETE de marca cuja conta ainda existe, para todo
  papel, inclusive o dono; a conferência de "a conta ainda existe" enxerga a
  conta em qualquer município, sem depender do contexto nem do RLS de quem
  apaga, e na dúvida recusa;
- **o que isso garante:** nenhuma marca fica órfã apontando para conta
  apagada; nenhuma marca de conta viva, de município nenhum, some ou muda; a
  eliminação de A não toca marca de conta de B, nem da mesma pessoa; e, como a
  chave da marca anda junto com `usuarios.id`, uma inserção futura com o id de
  uma conta eliminada se comporta exatamente como a chave de `usuarios`, sem
  sinal a mais;
- **por que a marca não é oráculo:** nenhum papel do produto a lê; o
  verificador lê só a marca da própria conta ou da própria transação e não
  devolve nada; e depois da eliminação não sobra marca nenhuma do município
  eliminado. A pessoa continua (consequências, "Eliminação de município não
  apaga a pessoa", H98); o que some é a ligação dela com uma conta que não
  existe mais;
- **no catálogo da 0G:** `origens_de_conta` é exceção PROTEGIDA com destino
  `some` na eliminação, provado pela eliminação de verdade, com as marcas do
  outro município semeadas e conferidas valor por valor.

A marca não é nível na ordem das travas (decisão 7): ela só é escrita por quem
já segura a linha da conta (o INSERT e o DELETE da conta, pelos gatilhos) ou
antes de a conta existir (`aceitar_convite`, regra 7), e o verificador só lê.

Os testes positivo e negativo estão na tabela de testes obrigatórios (E15, E10,
E18 e 0B).

#### Uma conta por pessoa até a liberação da segunda conta

Enquanto existirem escritores antigos da credencial em `usuarios` (passos 1 a 3
abaixo) e enquanto as proteções globais das decisões 2, 6, 7 e 8 não estiverem
no código, **a relação entre conta e pessoa é estritamente um para um, garantida
no banco**: além dos dois UNIQUE acima, a E15 cria `UNIQUE (pessoa_id)` TOTAL em
`usuarios` (sem condição sobre `ativo`, então a conta desativada também conta).
Duas contas, em dois municípios, gravando credencial em linhas diferentes de
`usuarios` espelhadas na mesma pessoa seriam duas origens da mesma senha, que é
exatamente o que a regra dos passos proíbe; com o UNIQUE, esse estado não pode
existir em SHA nenhum.

A **liberação da segunda conta** é o passo 4 da tabela abaixo, da E16, depois
da E08 juntada. Ela só acontece quando estão provados no código: os escritores
antigos retirados (passo 3), a revogação com os dois escopos e a ordem das
travas (decisão 7), a autorização por operação (decisão 3), as intervenções
administrativas na credencial na forma final (decisão 6), o segundo fator na
pessoa com consumo atômico (E11, decisão 8) e o login em dois passos com a
escolha e a troca de município da decisão 2. "Provado no código" não basta: a
liberação também exige essas proteções INSTALADAS em toda instância que atende
o banco, e é por isso que ela é um procedimento de implantação, descrito
abaixo. Antes dela, nenhuma etapa cria a mesma pessoa em dois municípios, nem
em teste de API: os testes de "mesma pessoa em A e B" (E18, E10 com pessoa
existente, E17) rodam depois da liberação.

#### Como a segunda conta é liberada (passo 4), e por que a API anterior falha fechada

O risco que o "mesmo SHA" não cobre: o banco é um só e a API roda em várias
instâncias. Se a migração que retira o `UNIQUE (pessoa_id)` for aplicada
enquanto uma instância ainda roda a versão anterior, essa instância continua
oferecendo a redefinição de senha com senha provisória do período um para um
(F00-E09, gravando em `pessoas` desde a E08) a quem administra A, sobre uma
pessoa que, a partir dali, pode ter conta em B. Por isso a liberação tem três
tempos, e o banco, não a API, é quem fecha os caminhos antigos:

1. **Migração das proteções (063, E16), aditiva para a API anterior.** Cria as
   funções novas (login em dois passos, `municipios_da_pessoa`, escolha, troca,
   a forma final da redefinição pelo administrador e do reset do segundo fator
   pelo superior, decisão 6) com nome ou assinatura NOVOS. Nenhuma função que a
   API anterior chama muda de assinatura nem de contrato nesta migração, e o
   `UNIQUE (pessoa_id)` continua de pé. O cabeçalho da 063 lista, por
   assinatura (`regprocedure`), o CAMINHO ANTIGO: toda função cujo contrato
   supõe uma conta por pessoa (no mínimo a redefinição com senha provisória, o
   reset do segundo fator pelo superior do período um para um e o login de um
   passo que devolve "a" conta da pessoa). O catálogo da 0B marca essas
   entradas como "recusada depois da liberação". A API nova usa só as funções
   novas desde a implantação, inclusive a forma final da decisão 6, mesmo
   antes da 064.
2. **Implantação da API nova em TODAS as instâncias**, conferida e arquivada
   antes do passo seguinte: a lista de instâncias que atendem o banco, cada uma
   com a versão que responde, nenhuma abaixo da versão da E16. Esta conferência
   é operacional (pendência humana nova, abaixo) e não é a única barreira: o
   passo 3 vale mesmo se ela errar.
3. **Migração da liberação (064, migração própria, aplicada só depois do
   tempo 2).** Na mesma transação: grava a MARCA DE LIBERAÇÃO numa tabela de
   uma linha só, sem grant ao `dc360_app`; revoga o EXECUTE do `dc360_app`
   sobre cada função do caminho antigo; redefine cada uma delas para conferir a
   marca logo na entrada e recusar com erro quando ela existe (segunda barreira,
   para o caso de um grant esquecido ou herdado); e só então retira o
   `UNIQUE (pessoa_id)`. Uma instância anterior que sobrar, contra o banco
   liberado, recebe erro nesses caminhos: não abre sessão, não muda credencial,
   não muda segundo fator. Falha fechada, com custo de disponibilidade e não de
   segurança.

**Rollback escrito, por fase:**

- antes da 064: voltar a API é o rollback de sempre, porque a 063 é aditiva e a
  API anterior continua funcionando;
- depois da 064 e enquanto nenhuma pessoa tiver mais de uma conta: o
  `desfazer/` da 064 confere essa contagem na própria transação (e recusa se
  ela não for zero), recria o `UNIQUE (pessoa_id)`, devolve os grants e apaga a
  marca; só depois disso a API anterior pode voltar;
- depois da 064 com alguma pessoa em dois municípios: não existe volta para a
  API anterior, e o `desfazer/` se recusa. A correção é para frente, na API
  nova. Se for preciso estancar, a parada de emergência é recusar no banco o
  aceite de convite por pessoa existente (um campo da tabela da marca de
  liberação, mudado só por migração, lido dentro de `aceitar_convite`; a
  `config.ts` está congelada desde a 1C), o que impede novas segundas contas
  sem tocar nas que
  existem; conta existente só se desativa pelo município dela, com motivo, como
  sempre.

**Testes da liberação (E16):** com a 064 aplicada e uma pessoa em A e B, a API
do SHA anterior à E16, construída e ligada ao mesmo banco, tenta o login de um
passo, a redefinição com senha provisória e o reset do superior: as três falham
fechadas (nenhuma sessão nova, `pessoas` sem mudança, nenhuma senha devolvida).
O mesmo teste chama as funções do caminho antigo diretamente, com um grant
devolvido de propósito ao `dc360_app`, e elas recusam pela marca. O `desfazer/`
da 064 é provado nos dois sentidos: passa com zero pessoas em dois municípios
e recusa com uma.

#### A credencial muda de casa em passos, sem duas fontes graváveis ao mesmo tempo (P-04)

A senha não pode ter duas cópias que alguém grave de forma independente: a
troca feita numa seria desfeita pela outra, e o bloqueio por força bruta
contaria em dobro ou não contaria. Por isso a passagem de `usuarios` para
`pessoas` é feita assim, e em nenhum SHA intermediário existe mais de uma fonte
gravável:

| Passo | Etapa e migração | Quem a aplicação e as funções GRAVAM | De onde a API LÊ | Como `pessoas` se mantém | Relação conta e pessoa |
| --- | --- | --- | --- | --- | --- |
| 1 | E15 (054) | `usuarios` | `usuarios` (API não muda) | gatilho espelha cada escrita de credencial e de e-mail de `usuarios` em `pessoas`, de mão única | um para um, no banco |
| 2 | E02 (sem migração) | `usuarios` | `pessoas` (`credenciais_da_pessoa`) | o mesmo espelho | um para um, no banco |
| 3 | E08 (061) | só `pessoas` | `pessoas` | espelho desligado; privilégios de `usuarios` refeitos por coluna (abaixo) | um para um, no banco |
| 4 | E16 (063 aditiva; 064 só depois da API nova em todas as instâncias) | só `pessoas` | `pessoas` | nada a espelhar | liberação da segunda conta pela 064, com as condições e os três tempos acima |

**O passo 3 retira o privilégio de verdade.** Revogar UPDATE das colunas antigas
não basta, porque o `dc360_app` tem UPDATE na tabela (001). A E08:

1. faz `REVOKE INSERT, UPDATE ON usuarios FROM dc360_app` (o privilégio de
   TABELA) e concede de volta, por coluna, só as colunas que a aplicação ainda
   grava, numa lista positiva escrita na migração; as colunas de credencial
   (`senha_hash`, `falhas_login`, `bloqueado_ate`, `senha_provisoria_ate`),
   `email` e `pessoa_id` ficam fora dela. A E15 já faz o mesmo para `pessoa_id`
   no passo 1 (INSERT e UPDATE por coluna, sem `pessoa_id`), então a E08 só
   encolhe a lista;
2. redefine TODOS os escritores privilegiados do inventário (funções SECURITY
   DEFINER, que gravam com o privilégio do dono e não são alcançadas por
   REVOKE nenhum) para gravar só em `pessoas`, e move para `pessoas` os
   gatilhos que acompanham a credencial (`recuperacoes_morrem_com_a_credencial`
   da 051 e `senha_trocada_deixa_de_ser_provisoria` da 046);
3. esvazia as colunas antigas de credencial em `usuarios` (os valores vivem em
   `pessoas`) depois de mover os gatilhos do item 2, e retira o SELECT delas do
   `dc360_app` pelo mesmo caminho (SELECT de tabela trocado por SELECT por
   coluna), de modo que a aplicação deixa de LER cópia velha de hash a partir do
   passo 3. As colunas caem numa migração posterior, que não é da F03.
   `ultimo_acesso` NÃO vai para a pessoa: fica na conta, gravado pelo login e
   pela escolha naquele município, porque na pessoa ele mostraria a A a
   atividade da pessoa em B (decisão 3, "Não enumeração").

**Inventário (a lista completa e conferida é da E15, antes do passo 1).** Ele
cobre tudo o que lê ou grava a credencial, o e-mail que recebe a recuperação, a
ligação entre conta e pessoa, e todo emissor de prova de autenticação, inclusive
o console. Cada item tem etapa dona; o ponto de partida, lido nas migrações e no
código deste SHA:

| Item | O que faz hoje | Etapa dona e o que ela faz |
| --- | --- | --- |
| `credenciais_para_login` (002, 013) | lê credencial e e-mail em `usuarios` | E02 troca a leitura por `credenciais_da_pessoa`; E08 a retira ou a deixa só de leitura em `pessoas` |
| `registrar_tentativa_login` (002) | grava falhas e bloqueio em `usuarios`, pelo id recebido | E08 grava em `pessoas`, conferindo quem pede (decisão 3) |
| `trocar_senha` (005, 049) | grava `senha_hash` pelo id recebido | E08: só a própria pessoa, com a senha atual relida sob a trava (decisão 3), escopo global (decisão 7) |
| `abrir_recuperacao` (005) e `pedirRecuperacao` (`auth/servico.ts`) | procura o e-mail em `usuarios` ativos e cria o link para a conta; a rota espera essa consulta antes do 202 e só prepara envio quando acha | E08 procura em `pessoas` e cria o link para a PESSOA; antes disso, a relação um para um garante que a conta achada é a única da pessoa. A E08 também tira a consulta de dentro do pedido: o 202 só registra o pedido numa fila, e a consulta, o link e o envio saem do trabalhador (decisão 3, "Não enumeração") |
| `consumir_recuperacao` (005, 049, 051) | grava a senha da conta do link | E08 grava em `pessoas`, escopo global (decisão 7) |
| `recuperacoes_senha` (005) | link por `usuario_id` | E08 liga o link à pessoa e à versão da credencial |
| gatilho `recuperacoes_morrem_com_a_credencial` (051) | `AFTER UPDATE OF senha_hash, ativo` de `usuarios` | E08 separa: troca de credencial em `pessoas` mata os links da pessoa (global); `ativo` da conta mata só os links ligados àquela conta (local) |
| gatilho `senha_trocada_deixa_de_ser_provisoria` (046) | `BEFORE UPDATE OF senha_hash` de `usuarios` | E08 move para `pessoas` |
| `dono_do_token` (002, 046, 048) | devolve a conta e o motivo de recusa | E08 devolve também a organização e confere o tenant |
| `revogar_sessoes_do_usuario`, `travar_sessoes_do_usuario` (049) | trava e revoga por conta | E08 mantém por conta (escopo local) e cria o escopo global por pessoa (decisão 7) |
| trava da pessoa (`travar_pessoa`, `travar_pessoa_da_conta`) | não existe hoje | E15 cria as duas (SECURITY INVOKER, como a da 049; a segunda resolve a pessoa pela conta sob o tenant, sem devolver `pessoa_id` à API); todo caminho do nível N2 da decisão 7 as usa |
| gatilho `pessoa_acompanha_as_contas` (nasce na E09) | não existe hoje | E09: dispara em `UPDATE OF ativo` e em `DELETE` de `usuarios`; confere que a transação já tem a trava da pessoa e recusa se não tiver (decisão 7) |
| `executar_eliminacoes_vencidas` e `ordem_de_apagamento_por_municipio` (038) | apagam o município tabela a tabela | E15: a marca de origem de cada conta apagada sai com ela, pelo gatilho de `DELETE` de `usuarios`, e a tabela da marca fica fora da ordem (decisão 1, "A marca quando a conta some"); E09 a faz tomar as travas da decisão 7 antes de apagar contas (o gatilho da E09 dispara no `DELETE`) |
| `abrir_sessao` (002, 047, 049) e `emitirPar` (`auth/servico.ts`) | emitem a sessão e o par de tokens | E08 confere conta, pessoa e município juntos; E16 os chama na escolha e na troca |
| desafio do segundo fator (`cr`, `auth/servico.ts`) | prova intermediária ligada à credencial | E11 e E16 mantêm a ligação à credencial e a estendem à pessoa (decisão 8) |
| `auth/segundo-fator.ts` (`desativar` lê `senha_hash` de `usuarios`) | confere a senha na conta | E02 lê da pessoa; E11 move o fator para a pessoa (decisão 8) |
| `provisionar_municipio` (036) | o console cria o primeiro administrador com senha | E15 cria a pessoa nova junto (nunca liga a pessoa existente); E08 grava a credencial só em `pessoas` |
| `POST /usuarios` (`rotas/administracao.ts`) | cria a conta com a senha digitada por quem cria | E15 (gatilho cria a pessoa nova); E10 troca por convite que NÃO cria conta (a conta nasce no aceite), com senha no corpo respondendo 422 |
| `PATCH /usuarios/:id` (`rotas/administracao.ts`) | o administrador troca o e-mail de outra conta | E09 retira o e-mail do que o PATCH aceita: nenhum município troca o e-mail de uma pessoa (decisão 6) |
| `POST /usuarios/:id/redefinir-senha` (`rotas/administracao.ts`, F00-E09) | o administrador define senha provisória | E08 grava em `pessoas` sob a trava da pessoa; E16 (passo 4) a deixa na forma final da decisão 6 |
| reset do segundo fator pelo superior (nasce na E11) | não existe hoje | E11 o cria só para o período um para um; E16 (passo 4) o deixa na forma final da decisão 6 |
| `aceitar_convite`, `convidar_pessoa` (nascem na E10) | não existem hoje | E10: `convidar_pessoa` só grava o convite no município, sem consultar pessoa nenhuma; `aceitar_convite` é a única que cria conta com `pessoa_id` preenchido (decisão 1, "A conta nasce no aceite") |
| `INSERT INTO usuarios` direto (sementes, modo local, testes) | grava conta e senha | E15 confere que nenhum caminho de produção grava `pessoa_id` fora de `aceitar_convite`; sementes e modo local seguem a regra da pessoa nova |

O backfill da E15 cria uma pessoa por conta (o e-mail já é único no sistema,
então a relação de hoje é um para um), com as contagens antes e depois
arquivadas.

#### A conta nasce no aceite do convite: não existe conta pendente

O roteiro da E10 (`05-api-identidade-autorizacao.md`) fazia a conta nascer
inativa no convite e ser ativada no aceite. Com as regras acima isso não fecha:
a conta pendente passaria pelo gatilho criador e receberia uma pessoa nova
(Pnova), e no aceite por uma pessoa existente (Pexistente) trocar Pnova por
Pexistente seria, corretamente, recusado pela imutabilidade. Abrir uma exceção
("pode trocar enquanto a conta estiver pendente") criaria exatamente a brecha
que a imutabilidade fecha. Por isso a decisão é outra, e não abre exceção
nenhuma:

- **O convite não cria linha em `usuarios`.** `convites_de_vinculo` (RLS
  ativada e forçada por município) guarda o que o município digitou: e-mail,
  nome, matrícula, papel, equipe, quem convidou, o hash do link, o prazo e o
  estado. Não guarda `pessoa_id` nem `usuario_id` enquanto aberto, e
  `convidar_pessoa` não consulta `pessoas` nem conta de outro município.
- **A conta é criada no aceite, já com a pessoa comprovada**, por
  `aceitar_convite`, numa transação:
  - pessoa NOVA: quem tem o link define a senha; a função cria a pessoa com o
    e-mail do convite e cria a conta com esse `pessoa_id`. Se já existe pessoa
    ATIVA com esse e-mail, o índice de e-mail recusa e a resposta, só a quem
    tem o link, é "entre com a sua senha para aceitar";
  - pessoa EXISTENTE: quem tem o link prova que é a pessoa com prova nova (a
    senha conferida naquele momento e, se o fator estiver ligado, o código, a
    mesma régua da troca na decisão 2), e o e-mail dessa pessoa tem de ser o do
    convite. Pessoa com senha provisória vigente não aceita convite até trocá-la
    (a senha provisória é conhecida por quem a definiu). A conta é criada com o
    `pessoa_id` dela;
  - nos dois casos o convite passa a "aceito", com `usuario_id` e `pessoa_id`
    gravados nesse momento, por UPDATE condicional (`WHERE` estado aberto e no
    prazo); se o UPDATE não pegar a linha, a transação volta inteira e a conta
    some junto. O gatilho adiado da decisão 1 confere essa ligação no fim da
    transação, pela marca `aceite` que a função grava antes do INSERT da conta.
- **O gatilho criador fica só para quem nasce fora do convite** (backfill,
  sementes, `provisionar_municipio`, o cadastro de hoje até a E10, modo local).
  Em `aceitar_convite` a conta já chega com `pessoa_id`, e o gatilho não cria
  pessoa: só confere que a marca `aceite` da transação existe para ela.
- **Até a liberação (passo 4)**, o aceite por pessoa que já tem conta esbarra no
  `UNIQUE (pessoa_id)` e é recusado à própria pessoa, com mensagem neutra; o
  convite continua aberto, e o município não vê diferença nenhuma.
- **O que o município vê depois** é igual nos dois casos (pessoa nova ou
  existente): o convite passa a "aceito" e a conta aparece, com o nome, a
  matrícula, o papel e a equipe que ele mesmo digitou. Os campos da pessoa
  (nome global, bloqueio, falhas, fator de papel sem obrigação, verificação do
  e-mail) não aparecem para o município.

#### E-mail: qual índice impede o quê, antes e depois da E09

`UNIQUE (pessoa_id)` impede duas CONTAS da mesma pessoa; ele não impede duas
PESSOAS diferentes com o mesmo e-mail. Quem impede isso é o índice de e-mail, e
ele muda de lugar:

| Período | Índice | O que impede | O que continua possível |
| --- | --- | --- | --- |
| hoje até a E15 | `usuarios_email_global_idx` (002), total, `lower(email)` em `usuarios` | duas contas com o mesmo e-mail em qualquer lugar, ativas ou não | nada além disso: uma conta é uma pessoa |
| E15 até a E09 | o mesmo da 002, mais `pessoas_email_idx` (E15), total, `lower(email)` em `pessoas` | duas contas e duas pessoas com o mesmo e-mail, ativas ou não; como cada conta cria a sua pessoa e o e-mail é espelhado, os dois índices dizem a mesma coisa, e o de `pessoas` deixa a garantia na tabela certa | nada além disso |
| a partir da E09 | `pessoas (lower(email)) WHERE ativo` (parcial); a E09 retira o índice total de `pessoas` e os dois de `usuarios` (002 e `UNIQUE (organizacao_id, email)` da 001) | duas pessoas ATIVAS com o mesmo e-mail | pessoas INATIVAS com o mesmo e-mail de uma ativa (é o desenho: a conta desativada solta o e-mail); conta desativada de Pantiga e conta ativa de Pnova com o mesmo e-mail no mesmo município. `UNIQUE (organizacao_id, pessoa_id)` impede duas contas da mesma pessoa num município, e `UNIQUE (pessoa_id)` (até a 064) duas contas da mesma pessoa no sistema |

Pessoa inativa nunca volta a ser ativa se outra pessoa ativa tem o e-mail (o
índice parcial recusa), e a conta dela nunca se reativa para a outra pessoa
(decisão 6).

### 2. O token vale para um município por vez, e a pessoa escolhe o município ao entrar

- **Conteúdo do token (E02):** `sub` é a PESSOA, `org` é o município ativo, mais
  `sid`, `aud`, `iss`, `iat` e `exp`. Papel, nome e a marca `sp` deixam de ser
  autoridade: vêm do banco a cada requisição. Para não derrubar quem está
  dentro, há uma janela em que `sub` também é aceito como `usuarios.id`, até
  `ACEITA_SUB_DE_CONTA_ATE`; como cumprir os dois deploys é a pendência H95.
- **Vigência em toda requisição (E03), antes do token enxuto (P-01):** conta
  ativa, sessão viva, senha provisória e município ativo são conferidos no banco
  em todo método, leituras inclusive, numa consulta só. Em nenhum SHA o papel
  sai do token sem que a leitura já consulte o banco.
- **Login em dois passos (E16):** a senha é conferida na pessoa; com uma conta
  ativa a resposta é a de hoje; com nenhuma, credenciais inválidas; com várias,
  a resposta traz a escolha (desafio curto e a lista dos municípios). A lista só
  sai DEPOIS da senha, então não é oráculo de e-mail, e mostra à pessoa só onde
  ela mesma tem conta. A escolha exige o mesmo que o login exigiria para a
  conta escolhida: o código do segundo fator sempre que a pessoa o tem ligado
  (seja por obrigação de algum papel, seja por vontade dela, como
  `exigenciaNoLogin` faz hoje em `auth/segundo-fator.ts`), e a ativação do
  fator, sem sessão, quando o papel da conta escolhida o exige e ele não está
  ligado.
- **Troca de município (E16) exige prova nova de autenticação para o destino.**
  A sessão do município de origem, sozinha, NÃO autoriza a troca: quem rouba o
  token ou a sessão de A não pode usá-los para chegar a B. `POST
  /v1/auth/trocar-municipio` exige a senha da pessoa conferida naquele momento
  e um código novo do segundo fator sempre que o login no destino o exigiria:
  quando o fator está ligado, por obrigação de qualquer papel ou por vontade
  da pessoa, o código é pedido, mesmo que o papel no destino não o exija; e
  quando o papel no destino exige o fator e ele não está ligado, a troca não
  abre sessão, só a ativação, como o login. A troca nunca é entrada mais fraca
  que o login normal no mesmo destino. O `mfa_verificado_em` do destino é o
  horário dessa conferência, e nada é herdado da sessão de origem. A troca gera sessão nova e token novo no
  destino. Nunca um token com dois `org`, nunca a lista de municípios dentro do
  token, nunca sessão compartilhada entre municípios. A forma mais leve (herdar
  a verificação do segundo fator por até `MFA_VIGENCIA_MINUTOS`, premissa
  anterior do plano) amplia o alcance de um token roubado a todos os municípios
  da pessoa; ela só pode ser adotada se o Rafael aceitar esse risco por
  escrito, na pergunta 2 do CP-50. Esta ADR não aceita esse risco.
- **Plateia pela conta escolhida (E07):** `dc360` para conta de servidor,
  `dc360-portal` para conta `usuario_orgao`. A mesma pessoa pode ter plateias
  diferentes em A e em B, e o token de uma plateia não vale em rota da outra.

#### A organização continua vindo só do token verificado

A frase do CLAUDE.md fica de pé, inteira: o `org` do token assinado vira o
`SET LOCAL`, e nunca cabeçalho, parâmetro de rota ou corpo. Duas precisões, para
ninguém ler a pessoa global como brecha:

1. **Pertencer a vários municípios não dá acesso a vários municípios.** A
   vigência só aceita `(sub, org, sid)` se `sid` é sessão viva de uma conta
   ativa DA PESSOA `sub` NO município `org`, e a função que confere
   (`vigencia_da_sessao`, E15) exige `org = app_organizacao_atual()`. A lista de
   municípios da pessoa nunca vira contexto de banco.
2. **A escolha e a troca de município são as duas OPERAÇÕES RESTRITAS DE
   AUTENTICAÇÃO, as únicas que recebem organização fora do token, e elas só
   escolhem.** `POST /v1/auth/municipio` (escolha, com o desafio do login) e
   `POST /v1/auth/trocar-municipio` (troca, com a prova nova acima) recebem um
   `organizacaoId` que:
   - é validado NO BANCO contra as contas ativas daquela pessoa
     (`municipios_da_pessoa`, E16), sob o tenant do sistema, antes de qualquer
     outra consulta;
   - nunca vira contexto de banco (`SET LOCAL`) por si: o único contexto que
     sai dali é o `org` do token assinado depois da autorização;
   - não abre leitura de dado de negócio do destino antes de autorizado (a
     única consulta antes da autorização é a da lista de contas e a da
     suspensão do município, `exigirAcessoAtivo`);
   - fora da lista responde 404, o mesmo corpo para município inexistente,
     suspenso ou onde a pessoa não tem conta ativa.

**Recurso de outro município responde 404, nunca 403**, também para a pessoa
que tem conta nos dois: token de B pedindo recurso de A é 404, e
`trocar-municipio` para município onde a pessoa não tem conta é 404. A E18 prova
isso com a mesma pessoa em A e B, rota por rota.

### 3. `pessoas` é a EXCEÇÃO NOMEADA ao isolamento, e o isolamento continua garantido

`pessoas` não tem `organizacao_id`, por definição. Ela entra na lista nominal de
exceções como `interesse_municipio` entrou, com nome e motivo, e o que a prende
não é a coluna, são quatro travas que valem juntas:

1. **RLS ativada E forçada, SEM nenhuma policy.** Mesmo que alguém conceda
   privilégio por engano, o papel de aplicação lê zero linhas.
2. **Nenhum grant ao `dc360_app`:** nem SELECT, nem INSERT, nem UPDATE, nem
   DELETE, nem privilégio de coluna, nem por herança ou `PUBLIC`. O papel de
   aplicação recebe "permissão negada" ao tocar a tabela (teste negativo da E15).
3. **Acesso só por funções SECURITY DEFINER da lista nominal**, com
   `search_path` fixo, e cada uma conferindo QUEM PEDE, para QUÊ, e sobre QUEM
   (abaixo). Pertencer ao município não basta: a função que verifica só "a
   pessoa tem conta ativa em A" deixaria um ator de A alcançar a credencial de
   uma pessoa que também está em B. Os nomes são fixados pela etapa que cria
   cada função (`vigencia_da_sessao` e `credenciais_da_pessoa` na E15,
   `pessoa_acompanha_as_contas` na E09, `convidar_pessoa` e `aceitar_convite` na
   E10, `municipios_da_pessoa` na E16, as de autenticação redefinidas na E08).
4. **A lista é conferida no catálogo do banco, nos dois sentidos** (requisitos
   da parte 0B na decisão 8). O teto `<= 27` vira `FUNCOES_PRIVILEGIADAS` (P-03,
   parte 0B do lote 0, antes de qualquer função nova da F03). Função SECURITY
   DEFINER no banco fora da lista reprova; entrada na lista sem função no banco
   também. Do mesmo jeito, `SEM_TENANT` e `SEM_POLICY_DE_TENANT` viram
   `EXCECOES_AO_ISOLAMENTO`: tabela sem `organizacao_id` fora da lista reprova o
   portão.

Toda outra tabela da pessoa (o segundo fator e os códigos de recuperação da E11,
as cotas da E19) entra na lista **por nome próprio**, com a trava própria
declarada pela etapa que a cria. Não existe isenção por prefixo nem por padrão
de nome.

#### Autorização por operação sobre a pessoa

Toda função que muda a credencial da pessoa, o segundo fator dela ou a ligação
entre conta e pessoa confere NO BANCO a identidade de quem pede (a sessão viva
do solicitante, lida do contexto do ator da E06 ou recebida e conferida pela
função contra `sessoes`), a operação pedida e o alvo, pela tabela abaixo. O
alvo nunca é aceito sozinho como parâmetro: um `usuario_id` ou `pessoa_id`
vindo da API sem o solicitante conferido reprova o teste da etapa.

| Operação | Escopo (decisão 7) | Quem pode | Prova exigida, conferida na mesma transação |
| --- | --- | --- | --- |
| trocar a própria senha | global | só a própria pessoa (solicitante = alvo) | senha atual conferida contra o hash relido sob a trava da pessoa |
| recuperar a senha por link | global | quem tem o link | link de uso único, ligado à pessoa e à versão da credencial |
| ligar, trocar ou desligar o segundo fator | global | só a própria pessoa | senha atual e código do fator atual, ou código de recuperação (decisão 8) |
| redefinir senha por administrador (F00-E09) | global | administrador do município, alvo diferente do solicitante, com posto | só enquanto vale a relação um para um; no passo 4, forma final da decisão 6 |
| redefinir o segundo fator pelo superior (E11) | global | superior do município, com posto | idem |
| criar conta ligada a pessoa (nova ou existente) | não se aplica | só `aceitar_convite`, que cria a conta nesse momento | link do convite e: pessoa existente, prova nova (senha conferida na hora e código se o fator estiver ligado), e-mail dela igual ao do convite e sem senha provisória vigente; pessoa nova, definição da senha |
| desativar, reativar, mudar papel ou equipe da conta | local (a revogação); a desativação e a reativação tomam a trava da pessoa só para serializar (decisão 7) | quem gerencia usuários no município | as regras de posto de hoje |
| encerrar as próprias sessões | local | a própria conta | sessão viva |

#### O que nenhuma função e nenhuma rota pode fazer

- devolver lista de pessoas;
- dizer a um município que a pessoa tem conta, vínculo, papel, convite ou sessão
  em outro, nem a existência deles. Isto vale para o CORPO e para o STATUS da
  resposta: **nenhuma resposta a um município (código, corpo, cabeçalho) pode
  depender de conta, pessoa ou convite fora dele.** Quando o efeito tem de
  depender disso, a resposta é a mesma nos dois casos e o caminho diferente fica
  com a própria pessoa (que sabe onde tem conta) ou com o convite;
- deixar a ação de um município alterar a pessoa no que ela é para outro
  município, fora do que a tabela acima permite no período um para um.

O município enxerga a pessoa só pela conta que tem com ela. Esta última regra é
também a recomendação técnica do CP-49 ("nunca expor a um município o vínculo
da pessoa em outro").

#### Não enumeração: tempo e efeitos, não só a resposta

Responder com o mesmo status, corpo e cabeçalho não basta se o tempo da
resposta, ou o que o município consegue consultar depois, muda conforme a
pessoa tenha algo em outro município. A regra completa:

**Nada que o solicitante observe pode depender de conta, pessoa ou convite fora
do município dele.** "Observar" inclui: status, corpo e cabeçalhos; o TEMPO da
resposta; e todo efeito que ele consiga ler depois pelo produto: a conta (se
aparece, quando, com que dados), as contagens (contas, convites, vagas), o
estado do convite, a trilha do município, o resultado de uma reemissão e
qualquer informação de entrega da mensagem.

Como isso é cumprido, nos pedidos que um município faz sobre um e-mail ou uma
pessoa (convidar e reemitir, E10; a forma final de `redefinir-senha` e do
reset do superior, E16; e, com a exceção declarada no item 1, desativar e
reativar a conta, E09):

1. **O pedido é aceito sem consulta fora do município e sem o provedor de
   e-mail.** O tratamento do pedido faz, em todos os casos, a mesma sequência de
   comandos sobre tabelas do próprio município (grava o pedido e o põe na fila)
   e responde. Não consulta `pessoas`, conta de outro município nem o
   provedor. Trabalho constante por construção, não por espera artificial.
   A desativação e a reativação da conta (E09) são a exceção declarada: o
   gatilho `pessoa_acompanha_as_contas` toca a pessoa dentro do pedido. Ele faz
   o mesmo trabalho em todos os casos (sempre um UPDATE da linha da pessoa,
   recalculando `ativo` pelas contas ativas; na reativação, o conflito com
   outra pessoa ativa do mesmo e-mail é tratado dentro do gatilho e deixa a
   pessoa inativa, sem erro), e os dois pedidos entram no teste de tempo
   abaixo, com e sem conta da pessoa em outro município.
2. **O que depende da pessoa sai de um trabalhador assíncrono**, fora do pedido
   (o relógio da API, sob `comTenantDoSistema`): abrir o link de recuperação da
   pessoa, montar e enviar a mensagem. O convite nem isso precisa: a mensagem é
   a mesma para pessoa nova ou existente ("você foi convidado; abra o link"), e
   quem decide entre definir senha e entrar é a própria pessoa, na página do
   link. O trabalhador do convite não consulta `pessoas`.
3. **Estado do convite** só muda por ação do próprio município (emitir,
   reemitir, revogar), pelo prazo fixo ou pelo aceite. Evento global da pessoa
   (troca de senha, recuperação, segundo fator) NÃO muda o estado de convite
   nenhum: um convite que "vencesse antes do prazo" contaria ao município que
   a pessoa existe e teve um evento. A proteção que a correção 1 buscava com
   essa invalidação vem do aceite com prova nova e da recusa com senha
   provisória vigente (decisão 1).
4. **Contagens e trilha** do município só contam linhas do município: contas,
   convites e os eventos que ele mesmo causou, com o mesmo registro para
   pessoa nova ou existente ("convite emitido", "convite aceito", "conta
   criada", "pedido de redefinição registrado"). Nunca "link enviado",
   "suprimido" ou "pessoa já existente".
5. **Entrega.** Na F03 o município não vê situação de entrega por mensagem. Se
   um dia vir, só poderá ser a do próprio envio, e o envio é idêntico nos
   casos.
6. **Limites, deduplicação e falhas.** O limite de pedidos é por solicitante e
   por município, nunca por e-mail ou pessoa no sistema inteiro. Teto por
   destinatário contra abuso, se existir, vale só no trabalhador, em silêncio,
   e não aparece para o município. A deduplicação só olha convites do próprio
   município. Falha do provedor fica no trabalhador (nova tentativa e log sem
   o link), nunca vira resposta, estado ou contagem para o município. Erro do
   banco no pedido só pode depender do que o pedido toca, que é do município.
7. **Dados da pessoa.** O município não vê `ultimo_acesso` global (ele fica na
   conta), bloqueio e falhas de senha ou do fator, fator ligado em papel sem
   obrigação, nem verificação do e-mail. Para papel com fator obrigatório, vê
   só se a exigência da conta DELE está cumprida.

O pedido público de recuperação (`POST /auth/recuperar`), que não é de
município, segue o mesmo desenho a partir da E08 (itens 1 e 2), fechando a
diferença de caminho que existe hoje em `pedirRecuperacao` (consulta dentro do
pedido, envio só quando acha).

**Como se prova (testes do fluxo completo, não só da resposta):**

- *estrutural, determinístico, a prova principal:* para cada caso (e-mail
  livre; pessoa com conta ativa em outro município; pessoa só com conta
  desativada em outro; pessoa com convite aberto em outro), o pedido executa a
  mesma lista de comandos SQL, com os mesmos textos e as mesmas contagens de
  linhas, capturada pela camada de banco; e, depois do trabalhador rodar, as
  leituras do município (lista de contas, de convites, contagens, trilha,
  reemissão) são iguais byte a byte, a menos dos identificadores e horários
  gerados;
- *de tempo, com margem declarada:* 50 pedidos de aquecimento e 300 por caso,
  intercalados em ordem sorteada, contra o Postgres real; aprovado se, para cada
  caso comparado ao e-mail livre, o intervalo de confiança de 99% da diferença
  das medianas (bootstrap com 2000 reamostragens) ficar inteiro dentro de ±1 ms
  ou ±5% da mediana do e-mail livre, o que for maior. Reprovação não se resolve
  repetindo até passar: investiga-se a causa. O teste de tempo complementa o
  estrutural, não o substitui.
- *o que o teste de tempo não prova:* a prova principal é a estrutural; passar
  no de tempo não é prova absoluta de ausência de canal temporal (em especial
  na E09, que divide N2 e a linha da pessoa com os caminhos globais), e a etapa
  que o traz caracteriza o ambiente e demonstra a estabilidade do critério
  antes de torná-lo obrigatório no CI.

### 4. O órgão é contexto dentro do município, não é tenant

- O tenant continua sendo SÓ o município. O órgão (secretaria, autarquia,
  concessionária, órgão estadual, bombeiros) é uma linha de `orgaos` DENTRO de um
  município; o órgão externo que atende vários municípios tem uma linha em cada
  um (E17), e não existe catálogo global de órgãos.
- O token nunca carrega órgão. O órgão da requisição vem da rota e só vale com
  vínculo vigente da conta naquele órgão, conferido no banco (E06); sem vínculo,
  404.
- O isolamento POR ÓRGÃO dentro do município (RLS fail-closed, dossiê, órgão que
  nunca consulta `ocorrencias`) é da ADR 0010 (V2-F04-E01), não desta.
- A redação que o CLAUDE.md precisa para dizer isso está proposta em
  `docs/evidencias-v2/G03/V2-F03-E01/correcao-2/proposta-de-redacao-do-claude-md.md`
  (as versões da primeira redação, na pasta da etapa, e da correção 1, na pasta
  dela, ficam como histórico). O CLAUDE.md não é alterado antes do aceite do
  Rafael (H97).

### 5. O papel genérico `usuario_orgao`

- É papel da CONTA no município, com posto 1 e NENHUMA permissão de servidor
  (E04). O que a conta pode fazer vem do vínculo (`gestor`, `executor`,
  `leitor`) e das ações do encaminhamento da F04, nunca de um papel por
  secretaria.
- Nasce só por convite (E10). Nunca se converte de ou para papel de servidor:
  409 `papel_nao_se_converte` na API e gatilho no banco.
- O login dessa conta fica FECHADO até o G03: na E04 ele responde credenciais
  inválidas sem chave nenhuma, e depois por `PORTAL_ATIVO`, com padrão `nao`
  (P-09). Segundo fator obrigatório para ela (E11). O recorte de leitura é lista
  positiva: papel fora da lista recebe vazio e 404 (E14).

### 6. O administrador de município nunca define senha, e-mail nem segundo fator de pessoa com conta em outro município, e nunca descobre se ela tem

A ADR 0006 fez do administrador o teto do município. Com a pessoa global, a
pessoa fica acima de qualquer município, e o teto passa a valer só sobre o que é
do município:

- **O município controla a CONTA:** cria por convite, ativa e desativa, muda
  papel e equipe, encerra as sessões da conta NAQUELE município, concede e
  encerra vínculo. Desativar a conta em A não derruba a conta em B, e suspender
  A não suspende B (E18).
- **O município não controla a PESSOA:** senha, e-mail e segundo fator são da
  pessoa. A conta nova nasce por convite de uso único, e ninguém que cria conta
  conhece a senha de ninguém (E10).
- **Nenhum município troca o e-mail de uma pessoa.** A E09 retira o e-mail do
  que o `PATCH /usuarios/:id` aceita. Trocar o próprio e-mail fica para depois
  (`dc360/apps/api/PENDENCIAS.md`): nenhuma etapa da F03 o faz.
- **A resposta ao administrador nunca depende de outro município.** A primeira
  redação desta ADR previa 409 `pessoa_em_varios_municipios` quando o
  administrador de A tentasse redefinir a senha ou o segundo fator de quem tem
  conta em outro município. Esse 409 confirma a A uma conta fora de A, que é o
  que a decisão 3 proíbe, e foi retirado: o código não é resposta a município
  nenhum. Em seu lugar:
  - **Até a liberação da segunda conta (passos 1 a 3):** a relação um para um
    no banco garante que a pessoa da conta de A não tem conta em mais lugar
    nenhum, ativa ou desativada. A redefinição de senha com senha provisória
    (F00-E09) continua, e o reset do segundo fator pelo superior (E11) pode
    existir, porque nesse período eles alcançam só uma pessoa exclusiva do
    município, sem condição nenhuma que precise ser respondida. Os dois tomam a
    trava da pessoa (decisão 7). Eles NÃO mexem em convite nenhum (decisão 3,
    "Não enumeração", item 3): o convite aberto em outro município não está
    ligado a pessoa nenhuma, e a senha provisória que eles definem impede o
    aceite por pessoa existente até ser trocada (decisão 1).
  - **A partir da liberação (passo 4, E16):** nenhuma intervenção de município
    na credencial de pessoa pode ser condicional ao que ela tem fora dele. A
    forma final é a recomendação técnica do CP-50 (alternativa A): o superior só
    suspende e reabilita a CONTA no município dele (e derruba as sessões ali);
    a redefinição da senha e do segundo fator é feita pela própria pessoa (link
    de recuperação, código de recuperação) ou pelo fornecedor no console, com
    verificação e trilha. A rota `redefinir-senha` e o reset do superior passam,
    na API da E16 (antes da 064, pelo procedimento da decisão 1), a responder
    igual para toda pessoa (202, pedido registrado na fila do município, link
    de recuperação enviado pelo trabalhador ao e-mail DA PESSOA quando a
    recuperação por e-mail está ligada), sem senha na resposta, com o tempo e os
    efeitos da decisão 3. As funções antigas são recusadas pelo banco a partir
    da 064.
  - **Se o CP-50 decidir manter alguma intervenção depois da liberação**, ela
    só existe se cumprir as quatro condições juntas: (a) conta como "outra
    conta" QUALQUER conta ligada à pessoa, ativa ou desativada (o convite
    aberto não é ligado a pessoa; o que o protege é o aceite com prova nova e a
    recusa com senha provisória vigente); (b) toma a trava da pessoa e é
    serializada com aceite, ativação, reativação e mudança de credencial, na
    ordem da decisão 7; (c) responde ao administrador o mesmo status, corpo,
    cabeçalhos, tempo e efeitos com ou sem outra conta (decisão 3); (d) nunca
    devolve senha ao administrador. A forma que devolve senha provisória
    na resposta não cumpre (c) e (d) ao mesmo tempo, e por isso não sobrevive à
    liberação.
- **Criar conta também não pode ser oráculo.** Hoje o `POST /usuarios` responde
  201 ou 409 conforme o e-mail exista em outro município. A E09 não fecha isso
  (o corpo igual do 409 não muda o fato de que 201 e 409 se distinguem) e não
  pode ser apresentada como o fechamento. O fechamento é a E10: criar conta vira
  convite, e o 202 é igual para e-mail livre, para pessoa com conta ativa ou
  desativada em outro município e para pessoa com convite aberto em outro
  município, no status, no corpo, nos cabeçalhos, no tempo e nos efeitos que o
  município lê depois (decisão 3, "Não enumeração"): o pedido só grava o
  convite do município e o põe na fila, sem consultar pessoa nenhuma. Até a
  E10, o oráculo de hoje fica registrado como conhecido, desde a F00, e não
  aumenta.
- **Reativar conta também não pode ser oráculo.** A reativação pela E09 responde
  igual com ou sem outra pessoa ativa usando o mesmo e-mail em outro lugar. Se
  a pessoa da conta não pode voltar a ser ativa porque o e-mail passou a outra
  pessoa ativa, a conta volta ativa no município, a pessoa antiga continua
  inativa, e o caminho é um convite novo (que alcança quem hoje tem o e-mail).
  A conta nunca se reativa para outra pessoa, porque `pessoa_id` não muda
  (decisão 1).

### 7. Revogação: escopo local e escopo global, e uma trava por pessoa

Hoje travas, links de recuperação e revogação de sessão são todos por
`usuarios.id`. Deixá-los assim faria a recuperação da senha em A deixar o
invasor renovando uma sessão em B, ou consumindo um link antigo de B.
Convertê-los todos para a pessoa faria a desativação em A derrubar B. Por isso
cada operação tem escopo declarado:

| Escopo | Operações | O que revoga |
| --- | --- | --- |
| LOCAL (a conta, no município dela) | desativar a conta; suspender ou eliminar o município (console); encerrar as próprias sessões | as sessões e famílias daquela conta e os links de recuperação ligados àquela conta, e mais nada. A pessoa e as outras contas dela não são tocadas |
| GLOBAL (a pessoa, em todos os municípios) | trocar a senha; recuperar a senha; redefinição pelo administrador no período um para um; ligar, trocar, desligar ou redefinir o segundo fator | todas as sessões e famílias de TODAS as contas da pessoa, todos os links de recuperação da pessoa e os desafios de login e de escolha emitidos antes (decisão 8). Convite não: ele não é ligado a pessoa enquanto aberto (decisão 1) e o estado dele não muda por evento da pessoa (decisão 3) |

O escopo diz o que é REVOGADO. Quem toma qual TRAVA é outra pergunta: a
desativação é local no que revoga, mas toma a trava da pessoa, porque o gatilho
da E09 mexe na pessoa. As duas coisas são escritas separadas abaixo.

#### A ordem das travas, completa

A correção 1 mandava a operação global tomar a linha de `pessoas` antes das de
`usuarios`, e a operação local não tomar a trava da pessoa. Isso fecha um ciclo
com o gatilho `pessoa_acompanha_as_contas` da E09 (a desativação segura a linha
da conta e o gatilho pede a linha da pessoa, enquanto a operação global segura
a pessoa e pede a conta) e não posicionava a linha de `organizacoes`, que o
login já toma antes da trava das sessões (050 e `emitirPar` em
`auth/servico.ts`). A ordem que vale para todo caminho que toca identidade é
uma só, por NÍVEIS:

| Nível | O que se trava | Como |
| --- | --- | --- |
| N1 | a linha do município em `organizacoes` | `FOR SHARE` no login, na escolha, na troca e no aceite de convite (a 050); UPDATE na suspensão, na reativação e na eliminação do município (console) |
| N2 | a trava da pessoa | `travar_pessoa` ou `travar_pessoa_da_conta` (E15), `pg_advisory_xact_lock` com chave própria, separada da de `travar_sessoes_do_usuario`; várias pessoas, em ordem crescente de `pessoa_id` |
| N3 | linhas de `usuarios` | UPDATE ou INSERT da conta; várias, em ordem crescente de `usuarios.id` |
| N4 | a linha de `pessoas` | UPDATE (credencial, `ativo`, versão da credencial) ou INSERT da pessoa nova |
| N5 | linhas das tabelas da pessoa | segundo fator e códigos de recuperação do fator (E11), cotas (E19) |
| N6 | linhas de `convites_de_vinculo` | UPDATE condicional do estado |
| N7 | links de recuperação | UPDATE dos links, direto ou pelos gatilhos da 051 movidos na E08 |
| N8 | a trava das sessões de cada conta | `travar_sessoes_do_usuario` (049), em ordem crescente de `usuarios.id` |
| N9 | linhas de `sessoes` | INSERT da sessão nova, UPDATE da revogação |

**As regras:**

1. Uma transação pode pular níveis, mas nunca toma um nível MENOR do que um que
   já segura. Dentro do mesmo nível, sempre em ordem crescente de id.
2. Gatilho herda o nível do comando que o dispara e só pode tocar níveis
   MAIORES: o espelho da E15 e o `pessoa_acompanha_as_contas` da E09 vão de N3
   para N4; o gatilho da 051 movido para `pessoas` vai de N4 para N7, e a parte
   de `ativo` de `usuarios` vai de N3 para N7. Por isso a ordem tem N3 antes de
   N4: é o sentido em que os gatilhos já andam.
3. Tomam N2 antes de qualquer linha de N3 a N9 daquela pessoa: quem escreve
   `ativo` de uma conta, desde a E09 (o gatilho dela exige); quem cria conta
   para pessoa existente, o que só `aceitar_convite` faz (E10); e, a partir da
   E08 (passo 3), quem escreve numa linha existente de `pessoas` por comando
   próprio. A exceção explícita é o espelho dos passos 1 e 2: até a E08, os
   escritores de credencial em `usuarios` chegam a `pessoas` só pelo gatilho de
   espelho (N3 para N4, regra 2), sem N2, como diz a tabela abaixo; pular N2
   não viola a regra 1. Pessoa NOVA, criada por INSERT (gatilho criador,
   aceite por pessoa nova), segue a regra 7. O
   gatilho `pessoa_acompanha_as_contas` confere, na própria transação
   (`pg_locks` do processo), que N2 da pessoa está tomada, e recusa se não
   estiver: ele nunca toma N2 por conta própria, porque nesse ponto a linha da
   conta (N3) já está presa.
4. Leitura sem trava é livre. Quem precisa descobrir as chaves antes (o
   convite pelo hash do link, o link de recuperação, a conta pelo id) lê sem
   trava, toma as travas na ordem e RELÊ o que conferiu, recusando se mudou.
5. O consumo atômico do código do segundo fator (N5) é transação própria, que
   confirma antes da transação que abre a sessão (N1, N8, N9), ou acontece nela
   antes de N8.
6. Os caminhos GLOBAIS que escrevem `pessoas` por comando próprio depois da
   E08 (trocar a senha, recuperar, redefinição no período um para um, ligar,
   trocar, desligar ou redefinir o segundo fator, registrar tentativa de login)
   não travam linha de `usuarios`: a lista de contas da pessoa é lida sem
   trava, estável porque toda criação de conta para pessoa existente e toda
   escrita de `ativo` de conta da pessoa toma N2. A regra não alcança a
   desativação e a reativação locais, que seguram N3 (UPDATE de `ativo`) e
   chegam a N4 só pelo gatilho da E09, no sentido da regra 2: elas estão
   dentro da ordem, sem exceção nova.
7. INSERT de linha nova não é trava de nível, porque nenhuma outra transação
   enxerga a linha antes da confirmação. A única espera que ele cria é a de
   índice único (duas transações inserindo o mesmo e-mail ou a mesma conta),
   em que a segunda espera a primeira terminar; nos caminhos da tabela abaixo,
   a primeira não espera nada que a segunda segure.

**Por caminho:**

| Caminho | Sequência |
| --- | --- |
| login, escolha e troca de município | N1 (`FOR SHARE` no município de destino), N8 da conta, releitura da pessoa e da conta (credencial, versão, `ativo`), N9. Sem N2: a mudança global que chega depois espera em N8 e revoga a sessão nova, como na 050 |
| suspensão do município (console) | N1 (UPDATE), N8 de cada conta com sessão de pé (id crescente), N9. Como hoje (049) |
| eliminação do município (`executar_eliminacoes_vencidas`) | N1, N2 de cada pessoa com conta no município (ordem crescente), N8 de cada conta (ordem crescente), e só então o apagamento na ordem das chaves estrangeiras (`ordem_de_apagamento_por_municipio()`), que apaga `sessoes` antes de `usuarios`; o `DELETE` de cada conta (N3) leva junto a marca de origem dela, pelo gatilho (decisão 1). É a ÚNICA exceção declarada à regra 1: com N1, todo N2 e todo N8 do município presos, quem ainda pode segurar uma linha de N3 a N9 dele espera por uma dessas travas antes de tocá-la, menos "mudar papel ou equipe", que segura só N3 e não espera por nada; não há ciclo. A E09 escreve esse argumento no cabeçalho da migração que toca o apagamento |
| desativar e reativar a conta (local) | N2 (`travar_pessoa_da_conta`), N3 (UPDATE de `ativo`; gatilhos: N4 pela E09, N7 pela 051), N8, N9 |
| mudar papel ou equipe | N3 só (não dispara gatilho de pessoa) |
| trocar a senha, recuperar, redefinição no período um para um (passo 3 em diante) | N2, N4 (gatilho para N7), N8 de cada conta da pessoa (id crescente), N9 |
| as mesmas, nos passos 1 e 2 (credencial ainda em `usuarios`) | N3 (gatilhos: espelho para N4, 051 para N7), N8, N9. As funções de hoje não tomam N2 e não precisam: pulam o nível sem violar a ordem (é a exceção do espelho na regra 3) |
| ligar, trocar, desligar ou redefinir o segundo fator | N2, N4, N5, N8 de cada conta, N9 |
| consumo do código do segundo fator | N5, em transação própria (regra 5) |
| registrar tentativa de login (falhas e bloqueio) | N2, N4, em transação própria |
| emitir, reemitir e revogar convite | N6 só (não toca pessoa) |
| aceitar convite | leitura do convite pelo hash, N1 (`FOR SHARE`), N2 da pessoa existente, INSERT da pessoa nova (regra 7), INSERT da conta, releitura da pessoa existente (credencial, versão, senha provisória), N6 (UPDATE condicional), e N8 e N9 se abrir sessão |
| abrir link de recuperação (trabalhador) | N2, N7 |
| liberação (064) | DDL fora da aplicação, numa janela sem a API anterior (decisão 1) |

A E15 escreve essa tabela no cabeçalho da 054, e cada migração que cria ou
redefine um caminho (E09, E08, E10, E11, E16) cita o caminho e o nível de cada
comando no próprio cabeçalho.

- **Sobrevivência de família e de link confere as três coisas juntas.** A
  renovação de sessão e o consumo de link só valem se município, conta e pessoa
  baterem com o que estava gravado, e se a versão da credencial da pessoa ainda
  for a mesma.
- **Testes concorrentes obrigatórios**, cada um com duas conexões e a ordem
  forçada nos DOIS sentidos (cada lado chega primeiro uma vez), sem nenhum
  40P01 e com o estado final conferido:
  - E08: recuperação em A durante renovação em B (B não renova); desativação em
    A durante renovação em B (B renova); troca de senha concorrente com aceite
    de convite (nenhum dos dois perde a escrita); dois consumos do mesmo link
    em municípios diferentes (um só vence); troca de senha (global)
    concorrente com a desativação da última conta ativa da pessoa (gatilho da
    E09): os dois efeitos ficam, a pessoa termina inativa e sem sessão;
  - E09: desativação concorrente com troca de senha e com recuperação da mesma
    pessoa; reativação concorrente com a desativação de outra conta da mesma
    pessoa; o gatilho `pessoa_acompanha_as_contas` disparado sem N2 é recusado;
    eliminação de município concorrente com a troca de senha de uma pessoa que
    tem conta nele;
  - E16: login, escolha e troca concorrentes com a suspensão do município de
    destino (nenhuma sessão de pé depois da suspensão, nos dois sentidos);
    troca concorrente com a desativação da conta de destino; escolha
    concorrente com a recuperação da senha da pessoa (o desafio emitido antes
    não abre sessão depois).

  Os testes que precisam da mesma pessoa em A e B rodam depois da liberação
  (064), na E18; antes dela, os mesmos encontros são provados com uma conta
  só.

### 8. Requisitos que a segunda leitura de segurança fixou para a E11, a E16 e o catálogo da 0B

**E11, segundo fator na pessoa:**

- consumo do código TOTP atômico: `UPDATE ... WHERE ultimo_passo IS NULL OR
  ultimo_passo < passo_novo` com `RETURNING`, ou leitura `FOR UPDATE` sob a
  trava da pessoa; o mesmo código usado em duas entradas concorrentes (no
  mesmo município ou em dois) vale uma vez só, com teste concorrente;
- contadores de falha e bloqueio do segundo fator na pessoa, separados dos
  contadores de senha;
- desligar ou trocar o fator global exige a senha atual E o código do fator
  atual (ou um código de recuperação), e é recusado enquanto alguma conta ativa
  da pessoa estiver num papel com fator obrigatório; a resposta vai à própria
  pessoa, nunca a município, e vale também quando o pedido parte de uma conta
  de papel inferior;
- o reset pelo superior existe só no período um para um (decisão 6), toma a
  trava da pessoa e tem escopo global (decisão 7).

**E16, login em dois passos, escolha e troca:**

- o desafio da escolha tem propósito e plateia próprios (não serve como token de
  acesso, nem como desafio do segundo fator, nem o contrário), é ligado à
  pessoa e à versão da credencial (como o `cr` de hoje) e é revalidado no
  consumo: pessoa ativa, credencial na mesma versão, conta de destino ativa,
  município não suspenso;
- todo evento global da decisão 7 invalida os desafios emitidos antes dele;
- `mfa_verificado_em` é o horário da conferência real do código, gravado pelo
  servidor na sessão; renovação de sessão e troca de município nunca o
  recalculam nem o estendem;
- a troca exige a prova nova da decisão 2, e a escolha e a troca exigem o
  código sempre que o login exigiria (fator ligado por obrigação ou por
  vontade da pessoa), nunca menos que o login;
- a 063 cria as proteções sem mudar o contrato de função nenhuma que a API
  anterior chama, e a liberação (passo 4) é a 064, migração própria, aplicada
  só depois da API nova em todas as instâncias, com a marca de liberação, a
  revogação do caminho antigo e o rollback da decisão 1; a API da E16 já usa
  `redefinir-senha` e o reset do superior na forma final da decisão 6.

**Catálogo da parte 0B (`FUNCOES_PRIVILEGIADAS` e `EXCECOES_AO_ISOLAMENTO`):**

- cada função é identificada por esquema e assinatura completa (`oid::regprocedure`,
  por exemplo `public.trocar_senha(uuid,text,uuid)`), nunca só pelo nome; uma
  sobrecarga com o mesmo nome e outra assinatura é função fora da lista e
  reprova;
- cada entrada traz o motivo, como confere o tenant e quem pede, a lista exata
  de papéis com EXECUTE (conferida contra a ACL do catálogo, sem `PUBLIC`) e o
  teste comportamental que prova a conferência;
- cada exceção de tabela declara, separadamente, QUAIS invariantes do portão ela
  dispensa (entre eles, a coluna `organizacao_id` e a policy de contexto) e
  QUAIS mantém (entre eles, RLS ativada e forçada, os grants efetivos
  conferidos papel por papel, as chaves estrangeiras com a organização onde
  houver e a trilha de auditoria append-only); o teste confere, para cada
  entrada, todo invariante declarado como mantido. Estar na lista nunca é
  dispensa geral: `organizacoes` e `protocolo_sequencias` continuam sendo
  conferidas na policy, como hoje, e `pessoas` mantém RLS forçada e zero grant;
- os testes de hoje sobre grants efetivos, RLS, chaves estrangeiras e auditoria
  continuam valendo sem afrouxamento, inclusive a distinção entre "sem a
  coluna" e "sem policy";
- o corpo de cada função da lista é conferido: nenhuma contém DDL (`ALTER`,
  `DROP`, `CREATE`, `DISABLE TRIGGER`) nem mexe em `session_replication_role`;
  `EXECUTE` de texto montado só é aceito com modelo constante de DML no
  próprio corpo (como o `format('DELETE FROM %I ...')` da 038), e qualquer
  outro reprova; e o `dc360_app` não tem o
  privilégio `TRIGGER` em tabela nenhuma (decisão 1, alcance do gatilho);
- as funções do caminho antigo da liberação (decisão 1) ficam marcadas na lista
  como "recusada depois da liberação", e o teste confere, com a marca presente,
  que nenhuma delas tem EXECUTE do `dc360_app` e que todas recusam pela marca;
- quem cita `origens_de_conta` é conferido em toda função do banco, não só nas
  privilegiadas: os ESCRITORES são a função do gatilho criador (`criador`) e
  `aceitar_convite` (`aceite`), cada marca numa função só; o LEITOR é uma
  função separada, `conferir_origem_da_conta()`, declarada leitora, no máximo
  uma, com `search_path` fixo em `pg_catalog, public, pg_temp`, e o corpo dela
  é conferido por LISTA PERMITIDA, falhando fechado (construção não
  reconhecida reprova); qualquer outra função que cite a tabela reprova; os
  contadores de escrita da transação ficam como prova adicional (decisão 1,
  "Quem pode ler a marca").

### Premissas do plano da F03 que esta ADR fixa como norma

O plano (`docs/roadmap-v2/retomada/plano-f03.md`, seção 1) tem doze premissas.
Algumas são norma de segurança e ficam valendo como esta ADR; as outras são
ordem de trabalho e não são regra de produto. Duas premissas do plano foram
alteradas pela correção 1 (a herança do segundo fator na troca, na E16, e o
409 `pessoa_em_varios_municipios`, na E08 e na E11); a mudança exata do plano
está no RESUMO da correção 1, para o orquestrador. A correção 2 muda a
numeração das migrações (a liberação ganha migração própria, 064, e a E17 e a
E20 andam uma casa), a conta pendente da E10, o gatilho da E09 e os testes
concorrentes de várias partes; a mudança exata está no RESUMO da correção 2.

| Premissa | O que diz | Aqui é |
| --- | --- | --- |
| P-01 | E03 antes da E02 | NORMA: a leitura passa a consultar o banco antes de o papel sair do token (decisão 2) |
| P-02 | E15 em paralelo com a E04 | ordem de trabalho |
| P-03 | lista nominal de funções privilegiadas sobe para o lote 0 | NORMA: nenhuma função privilegiada da F03 nasce sem entrada na lista, por assinatura (decisões 3 e 8) |
| P-04 | credencial em passos | NORMA: nunca duas fontes graváveis, e uma conta por pessoa até o passo 4 (decisão 1) |
| P-05 | E05 entrega o vínculo, E06 liga na vigência | ordem de trabalho; a norma é que vínculo só vale lido pela vigência (decisão 4) |
| P-06 | rotas enumeradas por `superficie-registrada.ts` até o ajudante da F02-E05 | ferramenta de teste |
| P-07 | login e relógios usam `comTenantDoSistema` | NORMA: quem age sem pessoa logada se declara `sistema`, e nenhuma transação nasce sem ator (E06) |
| P-08 | E12 em paralelo com a E06 | ordem de trabalho |
| P-09 | login do `usuario_orgao` fechado no lote 1; `PORTAL_ATIVO` declarado na 1C e ligado na 2A | NORMA: a conta `usuario_orgao` não entra antes do G03 (decisão 5) |
| P-10 | E10 e E18 divididas em banco e API | ordem de trabalho |
| P-11 | pontos de extensão vazios na abertura da API | NORMA só na parte da configuração: toda chave da F03 nasce com padrão fechado e sem efeito |
| P-12 | migrações 053 a 065 | numeração, não norma; pela correção 2 vão a 066, porque a liberação é migração própria (064) e precisa ser aplicada em separado da 063 |

## Consequências

### O que muda em cada etapa da F03

| Etapa | O que esta ADR exige dela |
| --- | --- |
| E02 | token `{ sub, org, sid }`, `sub` é a pessoa; credencial lida da pessoa (passo 2), inclusive em `segundo-fator.ts`; nada em `apps/api/src` lê papel, nome ou `sp` do token |
| E03 | vigência em todo método, leituras inclusive; conta inativa não lê |
| E04 | domínio de papel no banco; `usuario_orgao` sem permissão, sem conversão, login fechado |
| E05 | `orgao_vinculos` por município, chave composta com a conta e o órgão, encerra e não apaga |
| E06 | ator (conta, pessoa, papel, órgão) no contexto do banco; papel e pessoa vêm da vigência, nunca do token; é dele que as funções da decisão 3 leem o solicitante |
| E07 | plateia pela conta escolhida; `dc360-portal` não vale no painel e vice-versa; registra nesta ADR o que provou (lote 7B) |
| E08 | passo 3 inteiro (privilégio de tabela retirado, lista positiva por coluna, escritores privilegiados redefinidos, gatilhos movidos, colunas antigas esvaziadas e sem SELECT); funções de autenticação conferem tenant e solicitante (decisão 3); `abrir_recuperacao` e os links na pessoa; escopos local e global e a ordem das travas por nível, escrita na 061 para os caminhos dela (decisão 7); `redefinir-senha` gravando em `pessoas` sob a trava; o pedido público de recuperação com consulta e envio só no trabalhador (decisão 3); `ultimo_acesso` fica na conta |
| E09 | e-mail único só entre PESSOAS ativas (o índice parcial substitui o total de `pessoas` da E15 e os dois de `usuarios`); o `PATCH /usuarios/:id` deixa de aceitar e-mail; reativação com resposta igual (decisão 6); conta desativada nunca se reativa para outra pessoa; o gatilho `pessoa_acompanha_as_contas` com trabalho igual em todos os casos e recusando sem N2; a desativação, a reativação e a eliminação de município tomando as travas da decisão 7; NÃO se apresenta como fechamento da enumeração no cadastro |
| E10 | o convite NÃO cria conta: `convites_de_vinculo` guarda o que o município digitou, e a conta nasce em `aceitar_convite` já com a pessoa comprovada (decisão 1); `aceitar_convite` grava a marca `aceite` em `origens_de_conta` antes do INSERT da conta, a 058 redefine o gatilho criador e o adiado para aceitá-la (o verificador continua só leitor, decisão 1), e as colunas de estado e de ligação do convite ficam fora do privilégio do `dc360_app`; `convidar_pessoa` sem consulta a `pessoas`; 202 igual nos quatro casos, no tempo e nos efeitos da decisão 3, com o envio por fila; aceite por pessoa existente com prova nova, e-mail igual ao do convite e sem senha provisória vigente; até o passo 4 o aceite por pessoa que já tem conta é recusado à própria pessoa, com mensagem neutra, e o município não vê diferença; convidar não muda a credencial de quem já existe; evento global da pessoa não muda o estado de convite nenhum |
| E11 | segundo fator na pessoa; obrigatório para `usuario_orgao`, coordenador e administrador; os requisitos da decisão 8; reset pelo superior só no período um para um, sem 409 `pessoa_em_varios_municipios` |
| E12 e E13 | rota sem ação declarada é negada; a matriz inclui o `usuario_orgao` |
| E14 | recorte em lista positiva |
| E15 | `pessoas` com as quatro travas da decisão 3; `UNIQUE (pessoa_id)` total em `usuarios`; `pessoa_id` `NOT NULL` depois do backfill, imutável (`IS DISTINCT FROM`) e fora do privilégio da aplicação; gatilho que só cria pessoa nova, para conta que chega sem pessoa, e recusa no `BEFORE INSERT` o `pessoa_id` informado sem a marca `aceite`; `origens_de_conta` com as marcas `backfill` e `criador`, sem `organizacao_id` e sem privilégio do `dc360_app`, exceção protegida com destino `some` na eliminação (a marca sai com a conta apagada, pelo gatilho de `DELETE` de `usuarios`, e só com ela; DELETE de marca de conta viva recusado para todo papel); gatilho adiado que confere a marca de origem contra o estado final da linha, numa função LEITORA separada (`conferir_origem_da_conta()`, que atende os dois gatilhos de conferência; `conta_ganha_pessoa` fica só com o `BEFORE INSERT` e o `AFTER DELETE`), com `search_path` fixo e corpo conferido por lista permitida, mais a prova adicional por contadores (decisão 1, "De onde veio o `pessoa_id`", "Quem pode ler a marca" e "A marca quando a conta some"); `pessoas_email_idx` total; `travar_pessoa` e `travar_pessoa_da_conta`; a tabela de níveis da decisão 7 no cabeçalho da 054; backfill sem perda; espelho da credencial e do e-mail (passo 1); inventário completo da decisão 1 |
| E16 | login em dois passos; escolha e troca como operações restritas, a troca com prova nova e nenhuma das duas mais fraca que o login (decisão 2); requisitos da decisão 8; 063 aditiva, implantação conferida em todas as instâncias e só então a 064 (liberação com marca, revogação do caminho antigo e rollback, decisão 1); forma final das intervenções da decisão 6 na API da E16 |
| E17 | órgão externo como linha em cada município; a mesma pessoa convidada por cada um; roda depois do passo 4 |
| E18 | prova de cruzamento com a mesma pessoa em A e B, banco e API, depois do passo 4; registra nesta ADR o resultado (lote 7B) |
| E19 | `cotas_de_uso` como exceção nomeada própria, chave por HMAC |
| E20 | a trilha da conta não revela evento de outra pessoa nem de outro município, e registra o mesmo evento para pessoa nova ou existente (decisão 3) |
| E21 | o sigilo usa o ator da E06; nada muda nesta ADR |

### Testes obrigatórios que a etapa responsável traz

| Etapa | Teste |
| --- | --- |
| 0B | sobrecarga de função privilegiada com o mesmo nome e outra assinatura reprova; EXECUTE a mais que a ACL declarada reprova; tabela da lista de exceções que deixa de cumprir um invariante declarado como mantido (por exemplo, `pessoas` sem RLS forçada ou com grant ao `dc360_app`) reprova; função da lista com DDL ou `session_replication_role` no corpo reprova; `dc360_app` com privilégio `TRIGGER` reprova; função do banco (privilegiada ou não) que cita `origens_de_conta` no corpo e não é escritora declarada (função do gatilho criador, `aceitar_convite`) nem a leitora declarada (o verificador adiado) reprova; leitora declarada com INSERT, UPDATE, DELETE, TRUNCATE, MERGE ou COPY sobre a tabela, ou `EXECUTE` de texto montado, no corpo reprova; segunda leitora reprova; leitora que não é função de gatilho, que tem EXECUTE de papel do produto ou que dispara fora dos gatilhos declarados de `usuarios` reprova; marca `aceite` fora de `aceitar_convite` reprova; verificador que não seja a função leitora separada (ramo da função do criador) reprova; leitora sem `search_path` fixo em `pg_catalog, public, pg_temp` reprova; corpo da leitora conferido por LISTA PERMITIDA sobre o `prosrc` normalizado, falhando fechado: construção não reconhecida reprova; sabotagens obrigatórias, todas reprovando: leitora com `pg_notify`, com `pg_advisory_lock`, com `set_config`, com `nextval`, com chamada a função auxiliar que escreve, com `INSERT` e `DELETE` de marca temporária para id sem conta (tabela final igual) e com a mesma escrita dentro de bloco `EXCEPTION` desfeito; prova adicional: a leitora disparada com `SET CONSTRAINTS ... IMMEDIATE` não muda contador `n_tup_ins`, `n_tup_upd` ou `n_tup_del` de `pg_stat_xact_user_tables` em tabela de usuário nenhuma, nem `last_value` ou `is_called` de sequência |
| E15 | segunda conta (ativa ou desativada) com o mesmo `pessoa_id` recusada pelo banco; UPDATE de `pessoa_id` recusado, como `dc360_app` e como dono; positivo da origem: conta criada sem `pessoa_id` (cadastro de hoje, `provisionar_municipio` e INSERT do dono) passa no fim da transação, com pessoa nova e marca `criador` da mesma transação e da mesma pessoa, e toda conta do backfill tem a marca `backfill` (contagem igual à de contas); negativo da origem: INSERT com `pessoa_id` informado por função de teste do dono que não é `aceitar_convite` recusado no `BEFORE INSERT`, também com variável `dc360.*` definida por `set_config`; `BEFORE INSERT` de teste que roda depois do criador e troca o `pessoa_id` recusado no fim da transação pelo adiado; o verificador é a função leitora separada `conferir_origem_da_conta()`, ligada aos gatilhos `usuarios_origem_da_pessoa` e `usuarios_nenhuma_pessoa_sem_conta`, e `conta_ganha_pessoa` não atende mais esses gatilhos (conferido no catálogo do banco); o corpo da leitora passa na lista permitida, e as sabotagens da 0B reprovam também contra a cadeia real de migrações; prova adicional por contadores: com o adiado disparado por `SET CONSTRAINTS usuarios_origem_da_pessoa IMMEDIATE`, no caminho que passa e nos que recusam (marca ausente, de outra transação, com outra pessoa), `n_tup_ins`, `n_tup_upd` e `n_tup_del` de `pg_stat_xact_user_tables` de toda tabela de usuário e `last_value` e `is_called` de toda sequência ficam iguais antes e depois dele; com o adiado disparado só no `COMMIT`, a diferença dos contadores acumulados é exatamente a escrita do criador (uma inserção em `usuarios`, em `pessoas` e em `origens_de_conta` por conta, nenhuma atualização nem remoção), com a descarga feita pela conexão que escreveu e a leitura sem fotografia antiga (obrigação de implementação, decisão 1); a recusa traz mensagem e detalhe constantes, sem valor da marca; SELECT, INSERT, UPDATE e DELETE em `origens_de_conta` pelo `dc360_app` com "permissão negada"; UPDATE e TRUNCATE da marca recusados também como dono, e DELETE da marca de conta viva recusado também como dono; eliminação de município: as marcas das contas do município eliminado somem junto com elas, nenhuma fica sem conta, e as marcas das contas de outro município ficam iguais valor por valor (a prova do destino `some` da 0G); INSERT e UPDATE de `pessoa_id` pelo `dc360_app` com "permissão negada"; e-mail de pessoa existente não liga a conta nova a ela; segunda pessoa com o mesmo e-mail recusada por `pessoas_email_idx`; o gatilho de imutabilidade está habilitado depois de toda a cadeia de migrações; toque em `pessoas` pelo `dc360_app` com "permissão negada" |
| E08 | para CADA coluna antiga (`senha_hash`, `falhas_login`, `bloqueado_ate`, `senha_provisoria_ate`, `email`, `pessoa_id`), UPDATE pelo `dc360_app` recebe "permissão negada"; SELECT das colunas de credencial também; cada função do inventário, chamada, não muda as colunas antigas; função chamada com alvo e sem solicitante conferido é recusada; troca de senha de outra pessoa com a própria sessão é recusada; os testes concorrentes da E08 na decisão 7; o pedido público de recuperação com o teste estrutural da decisão 3 (mesma sequência de comandos com e sem a pessoa) |
| E09 | o `PATCH` com e-mail diferente é recusado; reativação com resposta byte a byte igual com e sem outra pessoa ativa usando o e-mail; desativação e reativação no teste de tempo da decisão 3, com e sem conta da pessoa em outro município; os testes concorrentes da E09 na decisão 7 |
| E10 | o convite não cria linha em `usuarios`; o teste estrutural e o de tempo da decisão 3 nos quatro casos (e-mail livre, pessoa com conta ativa em outro município, pessoa só com conta desativada em outro município, pessoa com convite aberto em outro município), cobrindo status, corpo, cabeçalhos, a sequência de comandos e, depois do trabalhador, lista de contas, lista de convites, contagens, trilha e reemissão; troca de senha, recuperação e mudança de fator da pessoa não mudam o estado de convite nenhum; aceite com a sessão de outra pessoa recusado; aceite por pessoa existente sem a senha conferida na hora, com e-mail diferente do convite ou com senha provisória vigente recusado; dois aceites concorrentes do mesmo convite: um vence, o outro volta sem deixar conta; aceite por pessoa que já tem conta recusado até o passo 4; positivo da origem: aceite por pessoa nova e por pessoa existente passa no adiado, com a marca `aceite` ligada ao convite consumido, à conta e à pessoa; negativo da origem: função de teste do dono que grava a marca `aceite` e insere a conta sem consumir o convite recusada no fim da transação; marca `aceite` com pessoa diferente da do convite consumido recusada; marca `aceite` gravada e confirmada numa transação anterior não serve na seguinte; a leitora redefinida pela 058 continua passando na lista permitida (com a forma nova de leitura do convite da marca e nada mais) e nas sabotagens da 0B, e a prova adicional por contadores da E15 vale com a marca `aceite`, contando também `convites_de_vinculo`, inclusive no caminho que recusa o convite não consumido; UPDATE das colunas de estado e de ligação de `convites_de_vinculo` pelo `dc360_app` com "permissão negada" |
| E11 | o mesmo código TOTP em duas entradas concorrentes vale uma vez; desligar com só a senha é recusado; desligar com conta ativa de fator obrigatório é recusado; falhas do fator não mexem nas falhas de senha |
| E16 | desafio de escolha emitido antes de uma recuperação não cria sessão depois dela; desafio de escolha não vale como desafio do segundo fator, nem o contrário; troca com só o token de origem é recusada; troca não estende `mfa_verificado_em`; `organizacaoId` fora da lista responde 404 sem nenhuma consulta de negócio do destino; troca e escolha pedem o código com o fator ligado por vontade da pessoa em papel sem obrigação; `redefinir-senha` e o reset do superior na forma final com o teste estrutural e o de tempo da decisão 3, com e sem outra conta; os testes da liberação da decisão 1 (API anterior contra o banco liberado falha fechada, funções do caminho antigo recusam pela marca, `desfazer/` da 064 nos dois sentidos); os testes concorrentes da E16 na decisão 7 |
| E18 | mesma pessoa em A e B: desativação em A não toca B; recuperação em A revoga B; nenhuma rota de A responde diferente por causa de B; eliminação de A tira a marca de origem da conta de A e deixa igual a da conta de B da mesma pessoa |

### O que fica proibido

São as mesmas condições que reabrem o G03:

- papel, nome, vínculo ou órgão vindos do token como autoridade;
- token, sessão ou contexto de banco que valha para mais de um município;
- organização tirada de cabeçalho, parâmetro de rota, corpo ou da lista de
  municípios da pessoa (a escolha e a troca da E16 só escolhem, decisão 2);
- troca de município autorizada só pelo token ou pela sessão de origem;
- tabela sem `organizacao_id` fora da lista nominal `EXCECOES_AO_ISOLAMENTO`, ou
  exceção que dispense invariante não declarado;
- função SECURITY DEFINER fora de `FUNCOES_PRIVILEGIADAS` (por assinatura), ou de
  autenticação que aja sem conferir o tenant e o solicitante;
- grant ou policy em `pessoas` para o `dc360_app`;
- duas fontes graváveis da credencial no mesmo SHA; UPDATE de tabela em
  `usuarios` para o `dc360_app` depois do passo 3;
- duas contas ligadas à mesma pessoa antes do passo 4; `pessoa_id` que muda
  depois de atribuído; conta ligada a pessoa existente fora de `aceitar_convite`;
  conta pendente em `usuarios` criada pelo convite; marca de origem do
  `pessoa_id` que o `dc360_app` consiga definir (variável de sessão, tabela ou
  coluna com privilégio dele); função que cite `origens_de_conta` fora dos
  dois escritores e da leitora declarada; verificador como ramo da função
  do criador; leitora com construção fora da lista permitida (escrita,
  chamada de função fora da lista mínima, `PERFORM`, `EXECUTE`, `pg_notify`,
  trava consultiva, `set_config`, sequência, bloco `EXCEPTION`), que leia
  marca de outra conta ou de outra transação, ou que devolva o que leu; marca que sobreviva à conta apagada, que suma ou mude com a conta viva,
  ou que a eliminação apague por pessoa ou sem filtro;
- retirar o `UNIQUE (pessoa_id)` na mesma migração que cria as proteções, ou
  antes de a API nova estar em todas as instâncias; função do caminho antigo
  que continue aceitando chamada depois da marca de liberação;
- escolha ou troca de município que peça menos que o login no mesmo destino;
- caminho que tome um nível de trava menor do que um que já segura (decisão 7),
  fora da exceção declarada da eliminação; gatilho que tome a trava da pessoa
  por conta própria;
- 403 onde o recurso é de outro município (é 404);
- resposta a município que dependa de conta, pessoa ou convite em outro, no
  status, no corpo, nos cabeçalhos, no tempo ou nos efeitos que ele lê depois;
  pedido de município que consulte `pessoas` ou espere o provedor de e-mail
  antes de responder (fora da exceção declarada da E09); limite por e-mail ou
  pessoa no sistema inteiro visível ao município; evento global da pessoa que
  mude o estado de um convite;
- município que define senha, e-mail ou segundo fator de pessoa com conta em
  outro município, ou que enxerga a conta, o vínculo ou a sessão dela em outro;
- revogação global feita só por conta, ou revogação local que alcance outra
  conta da pessoa;
- papel por secretaria, ou conversão entre `usuario_orgao` e papel de servidor.

### Boas

- O caso guia funciona: uma pessoa, uma senha, um segundo fator, uma conta e um
  vínculo em cada município que a convidou.
- A ADR 0001 sai intacta: toda tabela de negócio continua com `organizacao_id`,
  RLS ativada e forçada e contexto vindo do token. O que muda é que a exceção
  passa a ter nome, motivo, invariantes declarados e teste, em vez de teto
  numérico.
- Conta desativada deixa de prender o e-mail (E09), e criar conta deixa de
  confirmar que o e-mail existe em outro município (E10, com o 202 igual).
- O UPDATE de tabela em `usuarios`, aberto desde a 001, vira lista positiva por
  coluna (E15 e E08).

### Ruins, e assumidas

- **A pessoa global concentra a credencial.** Uma senha vazada abre todos os
  municípios onde a pessoa tem conta, um de cada vez, mas todos. O segundo fator
  obrigatório nos papéis de mais poder (E11), o convite que não muda a
  credencial (E10) e a prova nova na troca (E16) reduzem, não eliminam. Por isso
  a etapa pediu segunda leitura de segurança antes do aceite.
- **Dado pessoal fora do tenant.** `pessoas` liga dados entre municípios, e a
  base legal, o controlador de cada dado, a retenção da pessoa sem conta e quem
  atende o titular com vários vínculos são do parecer do encarregado (CP-49), sob
  a LGPD. Até ele, a mesma pessoa em mais de um município não vai para produção;
  construção e teste com dado sintético seguem.
- **Eliminação de município não apaga a pessoa.** Na F03 a pessoa sem conta
  ativa fica inativa (E09) e não é apagada; o destino definitivo da linha é a
  pendência H98 (CP-29 com o CP-49). A marca de origem de cada conta eliminada
  sai com a conta (decisão 1), então o que fica da pessoa não aponta para
  conta que não existe.
- **O administrador perde a redefinição de senha na liberação da segunda conta.**
  No piloto, com a recuperação por e-mail desligada (`RECUPERACAO_ATIVA=nao`), a
  redefinição com senha provisória (F00-E09) é o único caminho de "esqueci a
  senha" pelo produto. A partir do passo 4 o caminho é a própria pessoa (link ou
  código de recuperação) ou o console do fornecedor. É a pendência H94, com a
  recomendação nova no RESUMO da correção 1.
- **A troca de município custa uma digitação de senha** (e um código, quando o
  fator está ligado ou o papel no destino o exige). Com uma conta, nada muda.
- **A liberação da segunda conta é um procedimento, não um merge.** Exige duas
  migrações aplicadas em momentos diferentes, com a implantação conferida no
  meio, e depois da primeira segunda conta não há volta para a API anterior.
  Se a conferência falhar, a instância esquecida para de atender os caminhos
  antigos (custo de disponibilidade, não de segurança).
- **O convite fica mais lento de ver acontecer.** O e-mail sai de uma fila, e o
  município não vê se a pessoa já existia nem se a mensagem foi entregue; vê só
  "aberto", "aceito", "vencido" ou "revogado".
- **A desativação e a reativação tocam a pessoa dentro do pedido** (gatilho da
  E09). O trabalho é igual em todos os casos e entra no teste de tempo, mas a
  igualdade é por medida, não por construção, como nos pedidos que só gravam
  na fila.
- **Login mais longo e cliente que precisa ser atualizado:** quem tem várias
  contas passa pela escolha, e cliente abaixo de `VERSAO_ESCOLHA_DE_MUNICIPIO`
  com várias contas recebe 409 (E16). Com uma conta, nada muda.
- **O oráculo de cadastro da F00 dura até a E10.** Ele já existe em produção, não
  aumenta, e fecha com o convite.
- **Uma consulta a mais por leitura** (E03), a medir sob pico na F07-E08 e na
  F24-E02.
- **Mais funções privilegiadas.** Cada uma é exceção ao RLS e precisa de entrada
  por assinatura, motivo e prova; a lista nominal custa manutenção a cada etapa.

## Alternativas descartadas (item 7 da etapa)

| Alternativa | Por que não |
| --- | --- |
| E-mail por município (só `UNIQUE (organizacao_id, email)`, credencial em cada conta) | O login fica ambíguo, que é exatamente o motivo escrito na 002 para o índice global. A pessoa do caso guia teria doze senhas e doze segundos fatores, e a recuperação de senha não saberia qual trocar. |
| Conta sem pessoa (cada `usuarios` com a própria credencial, contas ligadas pelo e-mail) | Duas ou mais fontes da mesma senha, que é o que a decisão 1 proíbe. Trocar a senha em A não a trocaria em B, bloquear em A não bloquearia em B, e coincidência de e-mail não é identidade. |
| Token multimunicípio (lista de `org` no token, ou `org` escolhido por cabeçalho a cada requisição) | Um token vazado alcançaria todos os municípios da pessoa de uma vez, e escolher a organização por cabeçalho é exatamente o que o CLAUDE.md proíbe. A troca de município com token novo e prova nova (decisão 2) dá o mesmo uso sem esse dano. |
| Troca de município autorizada só pela sessão de origem, herdando o segundo fator por `MFA_VIGENCIA_MINUTOS` | Um token roubado em A chegaria a B sem mais nada, o que desfaz o motivo da alternativa acima. Não é aceita aqui; só o Rafael pode adotá-la, aceitando o risco por escrito na pergunta 2 do CP-50. |
| Papel ou credencial acima do município | Recusado por princípio nas ADRs 0006 e 0008, e continua recusado: a pessoa global não tem poder em município nenhum fora da conta que tem nele. |
| Órgão como tenant | Picaria o município em vários tenants e jogaria a regra de 404 entre municípios para dentro de uma mesma prefeitura. O isolamento por órgão é da ADR 0010, dentro do tenant. |
| Manter a D-02 (conta separada por município e ofício por link) | Revogada pela D-08. O ofício por link continua só durante a transição (F04-E12). |
| Provedor de identidade externo para a pessoa global | Os motivos da ADR 0004 continuam: o `org` do token é contexto de banco e não sai do repositório, e o custo e a operação de um provedor não se pagam para servidor municipal. |
| Responder 409 `pessoa_em_varios_municipios` ao administrador (primeira redação) | Confirma ao município A uma conta fora de A. Retirada pela correção 1 (decisão 6). |
| Conflito de cadastro com corpo igual como fechamento da enumeração (E09 da primeira redação) | 201 e 409 continuam distinguíveis: quem administra tenta um e-mail que não está na própria lista e lê a resposta. Só o 202 igual do convite (E10) fecha. |
| Contar só as contas ATIVAS para liberar intervenção do administrador | Com A ativa e B desativada, A redefiniria a credencial global; quando B reativasse, a credencial conhecida por A abriria B. Por isso a relação um para um conta toda conta, e qualquer intervenção que sobreviva à liberação conta toda conta, ativa ou não (decisão 6). |
| Revogar UPDATE só das colunas antigas, mantendo o UPDATE de tabela da 001 | No Postgres não retira nada: o privilégio de tabela continua cobrindo as colunas. O passo 3 retira o de tabela e concede por coluna (decisão 1). |
| Converter todas as travas e revogações de conta para pessoa | A desativação em A derrubaria B. A decisão 7 separa o escopo local do global. |
| Liberar a segunda conta junto do convite (E10) | Ainda haveria escritores antigos da credencial em `usuarios` e as proteções globais não estariam no código. A liberação é o passo 4, na E16. |
| Liberar a segunda conta na mesma migração das proteções, "no mesmo SHA" (correção 1) | O SHA não diz quais instâncias estão rodando. Aplicada a migração com uma instância anterior de pé, ela oferece a redefinição com senha provisória a A sobre pessoa que já pode ter conta em B. Por isso 063 aditiva, implantação conferida e 064 recusando no banco o caminho antigo (decisão 1). |
| Conta pendente em `usuarios` criada no convite e ligada à pessoa no aceite | A conta pendente passaria pelo gatilho criador e ganharia pessoa nova; ligar no aceite exigiria trocar `pessoa_id`, ou uma exceção à imutabilidade "enquanto pendente", que é a brecha que a imutabilidade fecha. Também apareceria na lista e nas contagens do município antes do aceite. A conta nasce no aceite (decisão 1). |
| `convidar_pessoa` que acha a pessoa pelo e-mail na hora do convite (roteiro original da E10) | Põe a consulta global dentro do pedido do município, com caminho e tempo diferentes conforme a pessoa exista, e liga convite a pessoa por coincidência de e-mail. O convite guarda só o que o município digitou e quem decide é a pessoa, no aceite (decisões 1 e 3). |
| Convite aberto invalidado por troca de senha ou recuperação da pessoa (correção 1) | O município veria o convite "vencer" antes do prazo e saberia que a pessoa existe e teve um evento. A proteção vem do aceite com prova nova e da recusa com senha provisória vigente (decisões 1 e 3). |
| Ordem de travas com a pessoa antes da conta, e operação local sem a trava da pessoa (correção 1) | Fecha ciclo com o gatilho `pessoa_acompanha_as_contas` da E09, que anda da conta para a pessoa, e não posicionava a linha do município que o login toma (050). A ordem por níveis da decisão 7 põe a conta antes da pessoa, que é o sentido dos gatilhos, e faz a desativação tomar a trava da pessoa. |
| Gatilho adiado que decide só por `NEW.pessoa_id` (correção 2, lida ao pé da letra), ou marca da origem em variável de sessão | O adiado vê o estado final, em que o valor criado pelo gatilho criador e o informado pelo chamador são iguais; e variável própria (`dc360.*`) qualquer papel define, inclusive o `dc360_app`. A origem fica em `origens_de_conta`, gravada só por quem produz o valor (decisão 1). |
| Só os escritores citam `origens_de_conta`, sem leitor declarado (correção 3, lida ao pé da letra) | O verificador adiado precisa ler a marca com privilégio, porque o `dc360_app` não tem SELECT nela; a regra reprovaria o próprio verificador separado, ou obrigaria a juntá-lo ao criador sem dizer que a leitura não pode escrever. A exceção do leitor é estreita e conferida no corpo e no comportamento (decisão 1). |
| Verificador como ramo da função do criador, provado sem escrita por contadores de escrita (correção 5) | Contador não vê todo efeito: `pg_notify`, trava consultiva de sessão, `set_config`, valor de sequência em cache ou com `is_called` mudado, escrita no catálogo do sistema, tabela criada e apagada entre as leituras. Provar ausência de efeito por enumeração não fecha. A leitora separada com corpo por lista permitida fecha pela estrutura, e os contadores ficam como prova adicional (decisão 1, correção 6). |
| Provar que o verificador não escreve comparando o conteúdo da tabela antes e depois (correção 4) | Um ramo que insere uma marca temporária para id sem conta e a apaga deixa a tabela igual, e a trava de permanência deixa apagar marca de id sem conta. A prova é por contadores de escrita da transação, que contam até a linha desfeita, com essa sabotagem reprovando (decisão 1). |
| Marca que fica na eliminação do município, como registro da pessoa | Ficaria órfã, apontando para conta apagada; guardaria, depois da eliminação, a ligação da pessoa com uma conta do município eliminado; e a chave dela continuaria ocupando o id da conta, um sinal a mais que a chave de `usuarios` já não dá. A marca sai com a conta (decisão 1). |
| Marca com `organizacao_id` na ordem de apagamento (correção 3) | A 038 exige toda tabela com a coluna na ordem (DC366), e a função da ordem passaria a citar a tabela, fora dos escritores e do leitor; apagar por município também dispensaria o laço com a conta. Sem a coluna, a marca sai pela própria conta (decisão 1). |
| Troca e escolha pedindo o código só quando o papel no destino exige o fator | Quem ligou o fator por vontade própria teria, na troca, uma entrada mais fraca que o login normal no mesmo destino. A régua é a do login (decisão 2). |

## Estado e aceite

- **Situação:** PROPOSTA.
- **Aceite do Rafael (H97):** desta ADR e da redação proposta para o CLAUDE.md
  (`docs/evidencias-v2/G03/V2-F03-E01/correcao-2/proposta-de-redacao-do-claude-md.md`).
  Com o aceite, a situação passa a "aceita, em vigor" com a data, e o trecho
  entra no CLAUDE.md pela mão dele.
- **Liberação em produção:** a conferência de que nenhuma instância anterior
  atende o banco antes da 064 é operacional e fica com quem implanta (pendência
  nova, no RESUMO da correção 2); a recusa no banco vale mesmo sem ela.
- **Parecer do encarregado (CP-49):** base legal da identidade global, o que
  fica na pessoa e o que fica na conta, controlador de cada dado, retenção da
  pessoa sem conta e atendimento ao titular com vários vínculos. Bloqueia só a
  mesma pessoa em mais de um município em produção.
- **CP-50 (H96):** (1) quem redefine senha e segundo fator de pessoa com vários
  municípios: até a decisão, vale a decisão 6 (intervenção só no período um
  para um; depois, alternativa A, com resposta igual); (2) se a troca de
  município pede código novo: até a decisão, vale a prova nova da decisão 2. A
  forma mais leve só com o risco aceito por ele, por escrito.
- **H94 (redefinição por administrador):** recomendação refeita pela correção 1
  (RESUMO da correção, seção "Para o orquestrador").
- **Revisão de segurança:** primeira rodada (Codex, somente leitura, onze
  achados, oito bloqueando o aceite), respondida pela correção 1; segunda
  rodada sobre a correção 1 (sete fechados como requisito, quatro parciais,
  quatro bloqueios novos), respondida pela correção 2, com a tabela no RESUMO
  dela; terceira rodada sobre a correção 2 (dois pontos impedindo o aceite: a
  origem do `pessoa_id` no gatilho adiado e o escopo das regras 3 e 6 da ordem
  das travas; mais a observação sobre o teste de tempo), respondida pela
  correção 3; quarta rodada sobre a correção 3 (regras 3 e 6 fechadas, o teste
  de tempo mantido como obrigação da etapa que o traz, um ponto impedindo o
  aceite: o verificador adiado precisa ler a marca e o catálogo só deixava os
  escritores citarem a tabela; uma dívida: o destino da marca na eliminação do
  município), respondida pela correção 4; quinta rodada sobre a correção 4
  (eliminação fechada no desenho; um ponto impedindo: a prova por conteúdo não
  mostra que o ramo verificador não escreve), respondida pela correção 5;
  sexta rodada sobre a correção 5 (os contadores contam a escrita desfeita,
  mas não veem efeito fora deles nem todo observador; dois pontos
  impedindo), respondida pela correção 6, que torna o verificador uma função
  leitora separada com o corpo conferido por lista permitida.
  "Fechado" aqui quer dizer fechado
  como requisito desta ADR: as decisões 1, 3, 7 e 8 que dependem de código
  futuro são cobradas pelos testes da etapa dona, e o que a parte 1B já
  implementou é conferido contra esta redação na junção dela (RESUMO da
  correções 4 a 6, "Para o orquestrador"). Se a revisão fizer uma sétima
  rodada, ela é sobre esta redação.
- **Registros previstos nesta ADR:** o que a E07 (plateia) e a E18 (cruzamento)
  provarem entra como nota no fim, na consolidação da F03 (lote 7B), sem
  reescrever o texto acima.

## Onde isto vive

- Decisão de origem: D-08 em `docs/roadmap-v2/01-decisoes-e-principios.md`
  (seção 11), que revoga D-02 e A-01 (seções 2 e 3).
- Etapas: `docs/roadmap-v2/05-api-identidade-autorizacao.md`, V2-F03-E01 a E21 e
  o G03; plano de execução em `docs/roadmap-v2/retomada/plano-f03.md`.
- Checkpoints: CP-49 e CP-50 em `docs/roadmap-v2/18-checkpoints.md`.
- Portão: `dc360/db/test/isolamento.test.ts` (`EXCECOES_AO_ISOLAMENTO` e
  `FUNCOES_PRIVILEGIADAS`, a partir da parte 0B), mais os testes que as etapas
  criam: `db/test/pessoas.test.ts` (E15),
  `funcoes-de-autenticacao-conferem-o-tenant.test.ts` (E08),
  `email-entre-ativos.test.ts` (E09), `db/test/convite.test.ts` e
  `convite.test.ts` (E10), `escolha-de-municipio.test.ts` (E16),
  `db/test/pessoa-em-dois-municipios.test.ts` e
  `apps/api/test/cruzamento-de-municipios.test.ts` (E18).
- Revisão de segurança e correções: `docs/evidencias-v2/G03/V2-F03-E01/correcao-1/`,
  `docs/evidencias-v2/G03/V2-F03-E01/correcao-2/`,
  `docs/evidencias-v2/G03/V2-F03-E01/correcao-3/`,
  `docs/evidencias-v2/G03/V2-F03-E01/correcao-4/`,
  `docs/evidencias-v2/G03/V2-F03-E01/correcao-5/` e
  `docs/evidencias-v2/G03/V2-F03-E01/correcao-6/`.
- Pessoas e papéis em linguagem de gente: `dc360/docs/PAPEIS_E_RESPONSABILIDADES.md`,
  seção "Pessoa, conta e vínculo".
- Backlog que esta decisão substitui: `dc360/apps/api/PENDENCIAS.md`, seção
  "Uma pessoa, vários municípios".
