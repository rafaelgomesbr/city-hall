# Proposta de redação do CLAUDE.md (V2-F03-E01, ADR 0009, correção 1)

Esta versão SUBSTITUI a proposta da primeira redação
(`docs/evidencias-v2/G03/V2-F03-E01/proposta-de-redacao-do-claude-md.md`, que
fica como histórico e não muda, porque o hash dela está no INDEX da etapa). O
que mudou depois da segunda leitura de segurança: a troca 1 diz que a exceção
nomeada não dispensa as outras travas e que função se identifica por
assinatura; a troca 2 nomeia a ESCOLHA e a TROCA de município como as duas
operações restritas de autenticação, com a prova nova na troca; o acréscimo 1
diz que nenhuma resposta a um município depende do que a pessoa tem em outro e
que a conta não troca de pessoa.

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
  como EXCEÇÃO NOMEADA em `EXCECOES_AO_ISOLAMENTO`, com motivo e com a lista do
  que ela dispensa e do que ela mantém (estar na lista nunca dispensa as outras
  travas). Função `SECURITY DEFINER` só existe em `FUNCOES_PRIVILEGIADAS`,
  identificada por esquema e assinatura, com motivo, quem pode executar e como
  confere o tenant e quem pede. As duas listas são conferidas contra o
  catálogo do banco nos dois sentidos.
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
  lista de municípios da pessoa. O token vale para UM município por vez. As
  únicas entradas de organização fora do token são as duas OPERAÇÕES RESTRITAS
  DE AUTENTICAÇÃO: a escolha do município no login (`POST /v1/auth/municipio`)
  e a troca de município (`POST /v1/auth/trocar-municipio`). As duas validam o
  destino no banco entre as contas ativas da própria pessoa, não leem dado de
  negócio do destino antes de autorizá-lo e só viram contexto como token
  assinado. A troca exige prova nova de autenticação (senha, e o segundo fator
  quando o destino o exige): o token do município de origem sozinho nunca
  autoriza outro município. Recurso de outro município responde 404, nunca
  403: 403 confirmaria que existe. Vale também para a pessoa que tem conta nos
  dois.
```

## Acréscimo 1: logo depois do item anterior

```markdown
- **Pessoa global, conta por município (ADR 0009).** A pessoa (`pessoas`) é
  global e guarda só nome, e-mail, credencial e segundo fator; ela é a exceção
  nomeada ao isolamento: RLS forçada sem policy, nenhum grant ao `dc360_app`,
  acesso só pelas funções da lista nominal, que conferem quem pede e para quê.
  Papel, matrícula, equipe e ativo são da CONTA (`usuarios`) em cada município,
  e a conta nunca troca de pessoa: ligar conta a pessoa existente só pelo
  convite aceito pela própria pessoa. Papel, nome e vínculo nunca vêm do token:
  vêm do banco a cada requisição. O administrador de um município nunca define
  senha, e-mail nem segundo fator de pessoa com conta em outro município, e
  nenhuma resposta a um município (status, corpo ou cabeçalho) muda por causa
  do que a pessoa tem em outro.
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
  O "estar na lista nunca dispensa as outras travas" e a "assinatura" fecham a
  leitura de que uma entrada na lista é dispensa geral, ou de que uma
  sobrecarga com o mesmo nome passa (achado 11 da segunda leitura).
- A troca 2 fecha a leitura que a pessoa global poderia abrir ("se a pessoa
  pertence a A e B, o servidor pode escolher") e nomeia as duas exceções, com o
  limite delas. A primeira redação nomeava só a escolha no login e deixava a
  troca sem contrato equivalente (achado 8).
- O acréscimo 1 traz as decisões 1, 3 e 6 da ADR 0009 em uma frase cada, com a
  regra de resposta uniforme (achado 3) e a da conta que não troca de pessoa
  (achado 5), para que uma sessão nova que leia só o CLAUDE.md não reconstrua a
  identidade como era antes da D-08.
- As regras da trilha append-only e da desativação no lugar da exclusão, que já
  estão no CLAUDE.md, não mudam.
