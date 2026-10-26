# Proposta de redação do CLAUDE.md (V2-F03-E01, ADR 0009)

O CLAUDE.md NÃO foi editado. Este arquivo traz o trecho que o Rafael colaria na
seção "O produto real (`dc360/`)", na lista "Regras que valem lá e não são
negociáveis", se aceitar a ADR 0009 (pendência H97). São duas trocas e dois
acréscimos; o resto da seção fica como está.

## Troca 1: o primeiro item da lista

**Texto de hoje:**

```markdown
- **Isolamento entre municípios é a regra número um.** Banco único, coluna
  `organizacao_id`, RLS ativada E FORÇADA em toda tabela de negócio, papel de
  aplicação que não é superusuário nem dono das tabelas. A organização vem
  sempre do token já verificado, via `SET LOCAL`, nunca de parâmetro de
  requisição. O teste `dc360/db/test/isolamento.test.ts` (critério CA-06) é o
  portão: se ele quebrar, nada entra.
```

**Texto proposto:**

```markdown
- **Isolamento entre municípios é a regra número um.** Banco único, coluna
  `organizacao_id`, RLS ativada E FORÇADA em toda tabela de negócio, papel de
  aplicação que não é superusuário nem dono das tabelas. A organização vem
  sempre do token já verificado, via `SET LOCAL`, nunca de parâmetro de
  requisição. O teste `dc360/db/test/isolamento.test.ts` (critério CA-06) é o
  portão: se ele quebrar, nada entra. Tabela sem `organizacao_id` só existe
  como EXCEÇÃO NOMEADA, com nome e motivo em `EXCECOES_AO_ISOLAMENTO`, e função
  `SECURITY DEFINER` só existe com nome, motivo e conferência do tenant em
  `FUNCOES_PRIVILEGIADAS`, as duas listas conferidas contra o catálogo do banco
  nos dois sentidos.
```

## Troca 2: o item "Na API, a organização vem do token verificado"

**Texto de hoje:**

```markdown
- **Na API, a organização vem do token verificado e de mais lugar nenhum.**
  Nunca de cabeçalho, de parâmetro de rota ou do corpo da requisição. Recurso
  de outro município responde 404, nunca 403: 403 confirmaria que existe.
```

**Texto proposto:**

```markdown
- **Na API, a organização vem do token verificado e de mais lugar nenhum.**
  Nunca de cabeçalho, de parâmetro de rota, do corpo da requisição nem da
  lista de municípios da pessoa. O token vale para UM município por vez. A
  única entrada de organização fora do token é a escolha do município no login
  (`POST /v1/auth/municipio`), que só escolhe entre as contas ativas da própria
  pessoa e não vira contexto antes de virar token assinado. Recurso de outro
  município responde 404, nunca 403: 403 confirmaria que existe. Vale também
  para a pessoa que tem conta nos dois.
```

## Acréscimo 1: logo depois do item anterior

```markdown
- **Pessoa global, conta por município (ADR 0009).** A pessoa (`pessoas`) é
  global e guarda só nome, e-mail, credencial e segundo fator; ela é a exceção
  nomeada ao isolamento: RLS forçada sem policy, nenhum grant ao `dc360_app`,
  acesso só pelas funções da lista nominal. Papel, matrícula, equipe e ativo
  são da CONTA (`usuarios`) em cada município. Papel, nome e vínculo nunca vêm
  do token: vêm do banco a cada requisição. O administrador de um município
  nunca define senha, e-mail nem segundo fator de pessoa com conta em outro
  município, e nenhum município enxerga o que a pessoa tem em outro.
```

## Acréscimo 2: logo depois do acréscimo 1

```markdown
- **Órgão é contexto dentro do município, não é tenant.** Secretaria, autarquia
  e órgão externo (concessionária, órgão estadual, bombeiros) são linhas de
  `orgaos` dentro de cada município; o externo que atende vários municípios tem
  uma linha em cada um. O órgão nunca vem do token: vem da rota e só vale com
  vínculo vigente (`orgao_vinculos`) conferido no banco, senão 404. Usuário de
  órgão tem o papel genérico `usuario_orgao` mais o vínculo, nunca um papel por
  secretaria.
```

## Por que estas palavras

- A troca 1 não afrouxa nada: ela dá nome ao que hoje é feito por teto
  numérico (`<= 27`) e por duas listas soltas (`SEM_TENANT`,
  `SEM_POLICY_DE_TENANT`), e torna a regra verificável por quem lê o CLAUDE.md.
- A troca 2 fecha a leitura que a pessoa global poderia abrir ("se a pessoa
  pertence a A e B, o servidor pode escolher") e nomeia a única exceção, a
  escolha no login, com o limite dela.
- Os acréscimos 1 e 2 são as decisões 1, 3, 4, 5 e 6 da ADR 0009 em uma frase
  cada, para que uma sessão nova que leia só o CLAUDE.md não reconstrua a
  identidade como era antes da D-08.
