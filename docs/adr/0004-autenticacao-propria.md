# ADR 0004: autenticação própria, em vez de provedor externo

- **Data da decisão:** 21/08/2026 (registro escrito em 25/08/2026)
- **Situação:** aceita, em vigor
- **Desvia de:** `docs/referencia/LEVANTAMENTO_TECNICO_JURIDICO_GOVTECH.md`, que
  previa autenticação de BaaS no primeiro ciclo, com Keycloak ou federação
  gov.br depois. Este ADR existe justamente porque a implementação divergiu do
  levantamento, e um desvio não registrado vira discussão do zero em três meses.

## Contexto

O produto precisa de contas por município, papéis, bloqueio de força bruta e
recuperação de senha. Três caminhos estavam sobre a mesa: um provedor gerenciado
(Supabase, Auth0, Cognito), Keycloak hospedado por nós, ou serviço próprio.

Dois fatos pesaram mais que a preferência técnica:

1. **O usuário não é o cidadão.** É servidor municipal, com conta criada pela
   coordenação do próprio município. Não há cadastro público, não há login
   social, não há recuperação em massa. A parte cara de um provedor de
   identidade (cadastro, verificação, federação) é justamente a parte que este
   produto não usa.
2. **A organização do usuário vira contexto de banco.** O identificador do
   município sai do token e vai direto para o `SET LOCAL` que sustenta o ADR
   0001. Depender de um provedor externo para produzir esse campo colocaria a
   regra número um do produto do lado de fora do repositório.

## Decisão

Autenticação própria, dentro de `dc360/apps/api/src/auth/`, com uma dependência
externa só (`jose`, para assinar e verificar JWT). O resto é `node:crypto`.

| Peça | Escolha | Razão |
| --- | --- | --- |
| Senha | scrypt do `node:crypto`, N = 2^16, r = 8, p = 1 | Está na lista aprovada do OWASP ASVS 4.0 (2.4.3), não acrescenta dependência e não exige módulo nativo compilado em cada servidor |
| Token de acesso | JWT HS256, 15 minutos | Verificado por assinatura, sem ida ao banco. Curto porque não há como revogá-lo antes de expirar |
| Token de renovação | 32 bytes opacos, guardado apenas como hash | Revogável, e vazamento do banco não devolve sessão utilizável |
| Rotação | A cada renovação | Reúso de token gasto é sintoma de roubo, e derruba todas as sessões do usuário |
| Força bruta | Limite por origem e bloqueio por conta | Um trata o atacante que vem de um lugar, o outro trata a conta martelada de muitos |
| Enumeração de conta | Resposta idêntica e tempo equivalente para email inexistente | Senão a API vira lista de emails da prefeitura |
| Recuperação | Link de uso único, validade curta, entregue por uma porta `Notificador` | O provedor de email ainda não foi escolhido, e teste que exige servidor de email nunca é rodado |

O conteúdo do JWT é validado com Zod **depois** de verificada a assinatura: a
assinatura garante que o conteúdo não foi adulterado, não que ele tem o formato
esperado, e o campo `org` vira contexto de banco.

## Consequências

Boas:

- Zero custo por usuário ativo, o que importa num produto vendido a prefeitura
  por assinatura mensal.
- Nenhum dado de servidor público sai do país por causa de provedor de
  identidade, o que simplifica a conversa de proteção de dado pessoal.
- O comportamento inteiro é testável sem rede e sem conta em lugar nenhum.

Ruins, e nenhuma delas é pequena:

- **Autenticação própria é superfície de ataque própria.** Cada item da tabela
  acima é uma coisa que um provedor teria feito e revisado por nós.
- **Não existe segundo fator, e não existe SSO.** No dia em que um edital pedir
  entrada por gov.br, isso é trabalho novo, não configuração.
- Rotação de segredo de JWT derruba todo mundo ao mesmo tempo. É o botão de
  emergência, e não há revogação granular de token de acesso.
- Não existe registro de dispositivo, nem detecção de acesso anômalo, nem tela
  de "suas sessões ativas" além do que a API expõe hoje.
- **A recuperação de senha está pronta e não entrega nada**, porque o
  notificador de produção não existe (ver `PENDENCIAS-HUMANAS.md`). Em
  desenvolvimento o link sai no log do servidor.
- Login e renovação obrigaram a abrir funções `SECURITY DEFINER` no banco, que
  são exceções ao RLS e precisam ser contadas e revisadas (ADR 0001).

## Alternativas descartadas

| Alternativa | Por que não |
| --- | --- |
| Autenticação do BaaS (Supabase e semelhantes) | Levaria junto o banco gerenciado do fornecedor, e o `SET LOCAL` com papel próprio deixaria de ser nosso. Custo por usuário ativo num produto vendido por município. |
| Keycloak hospedado por nós | Um Java a mais para operar, atualizar e proteger, para um produto mantido por uma pessoa. O ganho (SSO, federação) é para um cenário que ainda não existe. |
| Federação gov.br desde já | O usuário é servidor municipal em jornada de trabalho, não cidadão se identificando. Entra quando um edital exigir, e aí como provedor adicional. |
| bcrypt ou argon2 | argon2 exige módulo nativo compilado em cada servidor, e bcrypt limita o tamanho da senha em 72 bytes. scrypt resolve os dois e está no `node:crypto`. |

## Onde isto vive

- Implementa: `dc360/apps/api/src/auth/senha.ts`, `tokens.ts`, `servico.ts`,
  `notificador.ts`; rotas em `dc360/apps/api/src/rotas/autenticacao.ts`;
  funções de banco em `dc360/db/migrations/002_autenticacao.sql` e
  `005_recuperacao_de_senha.sql`.
- Defende: `dc360/apps/api/test/api.test.ts`,
  `dc360/apps/api/test/recuperacao.test.ts`,
  `dc360/apps/api/test/superficie.test.ts` (que exige token de toda rota, com
  lista curta de exceções justificadas), e o fluxo de navegador contra a API em
  `dc360/apps/web/test/fluxo-api.e2e.mjs`.

## Nota de revisão de 2026-10-15 (V2-F00-E22)

O texto acima não foi reescrito. Um ponto dele envelheceu: a tabela da decisão
diz scrypt com N = 2^16, e o código usa **N = 2^17** (131072), r = 8, p = 1,
cerca de 128 MB por verificação: `dc360/apps/api/src/auth/senha.ts`, constante
`N` (linha 34) e o comentário acima dela. A mudança entrou no commit `6690fca`
(2026-08-30, "scrypt 2^17"), cinco dias depois do registro desta ADR, porque o
piso recomendado pelo OWASP subiu de 2^16 para 2^17. O formato do hash guarda o
N usado, então senha derivada antes com 2^16 continua valendo; só as novas usam
2^17. O resto da decisão (autenticação própria, scrypt do `node:crypto`, sem
dependência nova) segue em vigor.
