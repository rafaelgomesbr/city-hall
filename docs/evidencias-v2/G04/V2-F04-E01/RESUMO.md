# V2-F04-E01: ADR 0010, isolamento por órgão dentro do município (proposta)

## Fatos

**Base:** `origin/v2/f03` em `8e29684`, ramo de trabalho `trab/f04-0a-e01-adr` (parte 0A do lote 0 do plano da F04;
o ramo `v2/f04` ainda não existe e nasce do `v2/f03` quando a parte 0D da F03 juntar, P-01). Só documento: nenhum
código, nenhuma migração, nenhum `package.json`. CLAUDE.md, STATUS, ESTADO-ATUAL, dívidas, pendências humanas, a ADR
0009 e o PAPEIS não foram tocados.

**Arquivos:**

- `docs/adr/0010-isolamento-por-orgao.md` (novo), no formato das ADRs 0001 a 0009. Situação: PROPOSTA, aceite do Rafael
  pendente (H116), dependente do aceite da ADR 0009 (H97), com segunda leitura de segurança antes do aceite. Contém:
  - **Contexto** conferido neste SHA: `providencias` sem estado e com `UPDATE` de tabela (001), policies só por
    município (034), gatilhos 017 e 018 rodando como invocador, `oficios` e o documento montado da ocorrência
    (`oficios/documento.ts`, por volta da linha 115), `avisos` presos à ocorrência e o `GET /avisos` que escreve,
    `trilha_eventos.origem` com dois valores, `ACOES` sem encaminhamento, e a regra textual do portão. Mais o que a F03
    entrega (papel `usuario_orgao`, `orgao_vinculos`, contexto do ator, plateia, manifesto, sigilo, catálogo nominal) e
    as cinco lições da ADR 0009 aplicadas.
  - **Decisões 1 a 5** = itens (a) a (e) da etapa (as "cinco decisões" do G04): o órgão nunca consulta `ocorrencias`;
    RLS por órgão só na classe A, com a forma da policy, a tabela ator por comando e a lista positiva de atores;
    RESTRICTIVE nas classes B, C, D, E e "sem alcance", com a amarração do `WITH CHECK` contra o oráculo de chave
    estrangeira e o limite da lista do gestor; `app_orgao_vigente()` pela conta, nunca pela pessoa; documento e
    arquivo do órgão nascem do dossiê.
  - **Decisão 6:** o órgão não é tenant, a pessoa global não o altera, a organização vem só do token, recurso de outro
    órgão ou município responde 404.
  - **Decisão 7:** as seis decisões de desenho da E05 (a: RESTRICTIVE diante da regra textual do portão, P-03; b:
    sigilo contra o dossiê, H123; c: classe "sem alcance"; d: `app_orgao_vigente()` sem o termo, P-14; e: gatilhos 017
    e 018, P-15; f: auxiliar de negação sem `EXECUTE` de `PUBLIC` nem do `dc360_app`).
  - **Decisões 8 a 16:** P-12 e D-24 com a marca `em_nome_do_orgao` derivada do ator e a matriz coluna por ator; a
    máquina de estados com o ator e o papel de cada transição; o dossiê por inclusão (CP-09 alternativa C como
    premissa); nenhum GET escreve (P-13) com lista nominal fechada; D-05 contra o ofício por link (H125); não
    enumeração entre órgãos (status, corpo, cabeçalho, tempo e efeitos); o encaminhamento nos níveis N10 a N12 da
    ordem de travas da ADR 0009; funções privilegiadas diante do ator de órgão; a tabela das exceções declaradas.
  - **Premissas P-01 a P-15** classificadas em norma ou ordem de trabalho.
  - **Consequências:** o que cada etapa E02 a E17 passa a dever, testes obrigatórios por etapa, o que fica proibido
    (condições de reabertura do G04 mais as novas), boas e ruins assumidas.
  - **Alternativas descartadas:** as quatro da etapa (sub-tenant, filtro só na aplicação, ACL por item, visão
    `security_invoker`) e mais dezesseis.
  - **Estado e aceite** e **Onde isto vive**.
- Nesta pasta: `proposta-de-texto-do-papeis.md` (a seção "O órgão dentro do município" para o PAPEIS, que entra na
  consolidação da F04, parte 6B), as saídas dos portões e o `INDEX.md`.

**Portões (saídas nesta pasta):**

- `regras-de-conteudo.txt`: `npx vitest run packages/shared/test/regras-de-conteudo.test.ts`. 9 de 10 verdes; o único
  reprovado é o caso de ambiente Windows conhecido (EPERM ao criar symlink, DV-46). "Nenhum travessão", "nenhuma norma
  citada fora da lista autorizada" e "nenhum número de artigo" verdes com os arquivos novos.
- `npm-test-shared.txt`: `npm test --workspace @dc360/shared` (regressão obrigatória da etapa), 417 de 418, o mesmo
  único caso EPERM.
- `gerar-estado.txt`: `node scripts/roadmap/gerar-estado.mjs --conferir`, saída 0.
- `node dc360/scripts/conferir-indices-de-evidencia.mjs` da raiz: verde com este índice (rodado depois de gravar o
  `INDEX.md`; não arquivado aqui porque a saída depende do próprio índice).
- Fim de linha: os arquivos novos foram normalizados para LF e conferidos com `git ls-files --eol` antes do commit.
- `dc360/node_modules` apagado depois dos portões.

## Justificativa

A etapa pede a decisão escrita antes do código, e o plano da F04 pede que seis escolhas da E05 fiquem fixadas antes
dela, porque a E05 é a parte de maior risco da fase. A ADR foi escrita contra as lições da ADR 0009, que precisou de
três rodadas de revisão de segurança, e por isso nasce com quatro pontos que o roteiro da etapa não trazia e que a
leitura do código mostrou necessários:

1. **Oráculo de chave estrangeira.** A verificação de chave estrangeira não passa pela RLS: um INSERT do ator de órgão
   em `trilha_eventos` ou `avisos` com um `ocorrencia_id` qualquer distinguiria "não existe" de "existe em outro
   órgão". O `WITH CHECK` amarra a chave a um encaminhamento do órgão (decisão 3) e as chaves do domínio são triplas
   (decisão 13).
2. **Privilégio de coluna é do papel de banco, não do ator.** A E14 diz "sem GRANT ao ator de órgão", o que o Postgres
   não consegue expressar: o órgão e o servidor são o mesmo `dc360_app`. A separação vira gatilho de matriz coluna por
   ator (decisão 8).
3. **A RESTRICTIVE `TO dc360_app` não alcança o dono das funções.** Toda função SECURITY DEFINER executável pelo
   `dc360_app` contorna as classes; cada uma passa a declarar o que faz diante do ator de órgão (decisão 15).
4. **Recursão de RLS em `orgao_vinculos`** e o limite da lista do gestor para atribuir (decisão 3), e o canal de tempo
   do subselect avaliado só quando uma linha filtrada aparece (decisão 13, item 6).

Nenhuma norma ou lei foi citada por número; a LGPD aparece só pelo nome. Os números H116 a H126 são os do plano da F04
e ainda não estão em `pendencias-humanas.md`, que esta parte não edita.

## Para o orquestrador

- **Linha do STATUS sugerida:** `V2-F04-E01 | IMPLEMENTADA | candidato em trab/f04-0a-e01-adr | ADR 0010 (proposta):
  isolamento por órgão, órgão como contexto, classes A a E e sem alcance, app_orgao_vigente pela conta, não enumeração
  entre órgãos, encaminhamento em N10 a N12; texto do PAPEIS na evidência`.
- **Pendências humanas a registrar (numeração do plano):** H116 (aceite da ADR 0010, depois da segunda leitura de
  segurança, dependente do H97); H117 (CP-09); H118 (CP-53); H119 (P-12 e D-24); H120 (redação da E09 e da E11);
  H121 (a E11 absorve o sino por relógio); H123 (sigilo contra o dossiê); H125 (D-05 contra o link do ofício).
- **Perguntas novas que a ADR deixa ao Rafael**, para entrar no texto das pendências acima ou em número novo:
  1. a forma da regra "nenhum GET escreve": a ADR fixa uma lista nominal fechada de GETs que só registram o próprio
     acesso (documentos, CSV, link do ofício); a redação literal da E11 ("nenhum GET muda linha") reprovaria rotas de
     documento e CSV que existem desde a F00 e exigiria uma etapa fora da F04 para torná-las POST (decisão 11; liga
     com H121);
  2. a exceção declarada da numeração sequencial do município, que revela volume ao órgão (decisão 16);
  3. o aviso de escalonamento a órgão de nível acima como exceção declarada (decisão 16; liga com H118).
- **Ajustes de escopo que a ADR pede ao plano da F04** (sem custo de lote novo):
  - 2B (E07): o gatilho da matriz coluna por ator em `providencias` e a regra de `campos_sensiveis` em
    `encaminhamento_dossies` (decisão 8);
  - 3A (E05): o `WITH CHECK` que amarra a chave em `trilha_eventos` e `avisos`; a RESTRICTIVE de sigilo nas duas
    tabelas novas sem `ocorrencia_id`; a forma da lista do gestor sem recursão; a medida do canal de tempo (decisões
    3, 7 b e 13);
  - 3B (E06): a declaração de cada função privilegiada diante do ator de órgão no catálogo do órgão (decisão 15);
  - 4C (E11): a lista nominal fechada do `get-nao-escreve.test.ts` (decisão 11);
  - 5A (E13): a prova estrutural da mesma sequência de comandos e o teste de tempo com margem (decisão 13);
  - 0D (E03 parte shared): o papel na tabela de transições (coordenador e administrador nas da Defesa Civil;
    `responder_providencia` nas duas do órgão em nome dele; leitor nunca), além do ator.
- **Arquivar o plano da F04** em `docs/roadmap-v2/retomada/plano-f04.md`, como o da F03: a ADR cita "plano de
  execução da F04, seção 1" e as premissas P-01 a P-15.
- **Segunda leitura de segurança** (Codex, somente leitura, como na ADR 0009) sobre este SHA antes do aceite.
- **Definição de pronto da etapa:** "ADR aceita" depende do H116 (e do H97); até lá a etapa fica IMPLEMENTADA com a ADR
  em PROPOSTA, e o código da F04 a segue como premissa.
