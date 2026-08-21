# Defesa Civil Operacional 360, produto real

Esta pasta (`dc360/`) é o produto de verdade, autorizado em 21/08/2026. Ela não tem nada a
ver com o protótipo em `mockup/`, que continua sendo HTML puro e descartável. As proibições da Fase 0 (nada de framework, nada de npm, nada de
build) valem lá, não aqui.

## O que já está de pé

| Pacote | O que é | Situação |
| --- | --- | --- |
| `packages/shared` | Vocabulário do domínio, máquina de estados e esquemas Zod, compartilhados entre web, aplicativo de campo e API | Pronto |
| `db` | Migração PostgreSQL com multi-tenancy por RLS forçada, e o teste de isolamento CA-06 | Pronto, 14 testes passando |
| `apps/web` | Painel do coordenador em React, Vite e TypeScript, em dois modos: banco na própria aba, ou HTTP contra a API | Pronto, 43 verificações no modo local e 31 contra a API |
| `apps/api` | API HTTP com autenticação própria, isolamento por token e sincronização idempotente | Pronta, 26 testes de integração passando |
| `apps/campo` | Aplicativo de campo em React Native com Expo, coleta offline | Não iniciado |

## Os dois modos do painel

O mesmo painel roda de duas formas, e a escolha é de configuração, não de
código de tela. Nenhuma página sabe qual está ativa: as duas implementações
cumprem a mesma porta em `src/dados/`.

| | Modo local (sem `VITE_API_URL`) | Modo API (com `VITE_API_URL`) |
| --- | --- | --- |
| Banco | Postgres em WebAssembly, na própria aba | Postgres do servidor, via HTTP |
| Entrada | Escolha de perfil, sem senha | Email e senha, com bloqueio por tentativa |
| Para que serve | Demonstrar num notebook de prefeitura sem instalar nada | O caminho de produção |
| Isolamento | RLS, dentro da aba | RLS, no servidor, fora do alcance do navegador |

O modo local não é maquete: são as mesmas migrações, o mesmo RLS e a mesma
semente que a API usa. O que ele não tem é autenticação, e a tela diz isso em
voz alta em vez de fingir que tem.

## A decisão que explica o resto: o banco é real desde o primeiro dia

O painel web não fala com nenhum dado falso em memória. Ele executa
`db/migrations/001_base.sql`, o mesmo arquivo que vai para o servidor, dentro de
um PostgreSQL 16 compilado para WebAssembly (PGlite) que roda na própria aba e
persiste em IndexedDB.

Isso não é um truque de demonstração, é uma escolha de risco. O problema mais
caro deste produto é dado de uma prefeitura aparecer na tela de outra. Se o
isolamento fosse simulado agora e implementado depois, a primeira vez que ele
seria testado de verdade seria em produção. Do jeito que está, toda consulta da
aplicação já passa pelo mesmo contrato que a API vai cumprir:

```
BEGIN;
SET LOCAL ROLE dc360_app;                                  -- não é superusuário, não é dono
SELECT set_config('app.organizacao_atual', $1, true);      -- vem do token, nunca da requisição
...
COMMIT;
```

Se alguém esquecer o `WHERE organizacao_id = ...` numa consulta, o banco
continua devolvendo só o município certo, porque a policy nega. Trocar PGlite
por um Postgres gerenciado é trocar a origem da conexão em `src/dados/banco.ts`,
não as regras: elas já estão no banco.

### Por que tudo passa por `db.transaction()`

`SET LOCAL` pertence à CONEXÃO, não à chamada. Numa versão anterior deste
código, `comoApp` emitia `BEGIN`, `SET LOCAL` e `COMMIT` como comandos soltos.
Como o PGlite tem uma conexão só e solta o mutex entre comandos, duas chamadas
concorrentes (o `Promise.all` do painel, por exemplo) entrelaçavam:

```
A: BEGIN
B: BEGIN                   (aninhado, o Postgres só avisa)
A: set_config(org = A)
B: set_config(org = B)     <- sobrescreve o contexto de A
A: SELECT ...              <- roda com o contexto de B
B: COMMIT                  <- encerra a transação que A achava ser dela
A: SELECT ...              <- fora de transação, de volta ao superusuário
```

Os dois desfechos foram reproduzidos: dado de um município aparecendo para
outro, e o papel voltando de `dc360_app` para `postgres`, que ignora RLS.
`db.transaction()` retém o mutex do início ao fim do bloco, o que torna o par
`SET LOCAL` mais consulta indivisível. Os dois últimos testes de CA-06 cobrem
exatamente esse caso, e reprovam se alguém trocar de volta.

Num servidor com pool, cada requisição tem a sua conexão e o problema não
existe. A regra que fica: **uma conexão nunca é compartilhada entre dois
contextos de tenant ao mesmo tempo.**

## Garantias que o banco impõe, não a tela

- Toda tabela de negócio tem `ENABLE` e `FORCE ROW LEVEL SECURITY`, com policy
  em `organizacao_id = app_organizacao_atual()`.
- `trilha_eventos` tem policy de SELECT e de INSERT, e nenhuma de UPDATE ou
  DELETE. Com RLS forçada, a ausência nega: a trilha é append-only, e nem a
  aplicação reescreve histórico.
- Encerrar ocorrência sem motivo é recusado por CHECK constraint.
- Marcar vulnerabilidade sem descrever é recusado por CHECK constraint.
- Protocolo é único por município e ano, gerado por
  `proximo_protocolo(ano)` dentro da transação, com a linha da sequência
  travada. Dois operadores registrando ao mesmo tempo não recebem o mesmo
  número, e dois municípios podem ter `000001/2026` sem colidir.
- Chave de arquivo no storage precisa começar com `tenant/{organizacao_id}/`,
  por CHECK constraint. É a segunda barreira de isolamento junto do RLS.
- Reenvio da mesma coleta de campo é recusado pela unicidade de
  `(organizacao_id, idempotency_key)`.

## A API (`apps/api`)

Fastify com TypeScript. Ela existe para que o aplicativo de campo tenha com
quem falar, e para que a regra de isolamento passe a valer também do lado do
servidor, não só dentro da aba do navegador.

### De onde vem o município, e de onde nunca vem

O identificador da organização sai do JWT verificado, e vai direto para o
`SET LOCAL`. Nunca de cabeçalho, nunca de parâmetro de rota, nunca do corpo.
Existe um teste que fixa isso: ele cadastra um usuário mandando
`organizacaoId` do OUTRO município no corpo da requisição, e confere no banco
que o registro nasceu no município do token. O campo é simplesmente ignorado,
porque a rota nem o lê.

Consultar ocorrência de outro município devolve **404, não 403**. Um 403
confirmaria que o registro existe, e confirmar existência já é vazamento.

### Autenticação

| Peça | Escolha | Por quê |
| --- | --- | --- |
| Senha | scrypt do `node:crypto`, N=2^16 | Aprovado no ASVS 4.0 (2.4.3), sem dependência nova e sem módulo nativo para compilar |
| Token de acesso | JWT HS256, 15 minutos | Verificado por assinatura, sem ida ao banco. Curto porque não dá para revogar antes de expirar |
| Token de renovação | 32 bytes opacos, guardado só como hash | Revogável, e vazamento do banco não devolve sessão utilizável |
| Rotação | A cada renovação | Reúso de token gasto é sintoma de roubo: derruba todas as sessões do usuário |
| Força bruta | Limite por endereço (10 por 5 min) e bloqueio por conta (5 falhas, 15 min) | Um trata o atacante que vem de um lugar, o outro trata a conta martelada de muitos |
| Enumeração de conta | Resposta idêntica e tempo equivalente para email inexistente | Senão a API vira lista de emails da prefeitura |

Login e renovação acontecem antes de existir contexto de tenant, então
precisam ler tabelas que o RLS protege. Em vez de abrir exceção geral, a
migração 002 cria funções `SECURITY DEFINER` estreitas: cada uma responde uma
pergunta, por igualdade, sem filtro livre, devolvendo só o necessário, com
`search_path` fixo e `EXECUTE` revogado de `PUBLIC`.

### Sincronização do campo

`POST /sincronizacao/vistoria` é a rota que decide se o produto funciona na
chuva. O agente coleta sem sinal e o envio sai quando a rede volta, muitas
vezes já no carro, com a conexão indo e vindo: a mesma coleta chega mais de
uma vez. Um laudo duplicado numa interdição é problema jurídico.

A chave de idempotência vem do aparelho e é única por município no banco.
Reenvio devolve o resultado da primeira vez, com 200 em vez de 201, e não cria
laudo nem evento novo. A chave de storage da foto é remontada no servidor a
partir da organização do token: aceitar a que o aparelho mandou permitiria
gravar evidência sob o prefixo de outra prefeitura.

### Rodar

```bash
npm run dev:api     # sobe em http://127.0.0.1:3333
```

Sem `DATABASE_URL` ela sobe um Postgres em WebAssembly no próprio processo,
efêmero, só para desenvolver. Em produção a configuração recusa essa
combinação e exige `DATABASE_URL` e `JWT_SEGREDO`: um servidor que sobe com
chave padrão é pior que um que não sobe, porque parece funcionar.

## Autorização por papel

Quem pode o quê vive em `packages/shared/src/permissoes.ts`, e não numa
condicional de tela. A tela consulta a tabela para decidir o que desenhar; toda
função de escrita do repositório começa por `exigirPermissao`, porque esconder
um botão não impede nada de quem tem o console do navegador aberto. Quando a
API entrar, ela importa a mesma função em vez de redescobrir a regra.

| Papel | Pode |
| --- | --- |
| Operador de plantão | Registrar ocorrência |
| Agente de campo | Registrar vistoria |
| Coordenador | Triagem, despacho, providência, encerramento, equipes, usuários |
| Administrador | O mesmo que o coordenador |

## Como rodar

Modo local, sem servidor nenhum:

```bash
cd dc360
npm install
npm run build --workspace @dc360/shared   # o app web importa o pacote compilado
npm run dev                               # painel em http://localhost:5173
```

Painel ligado à API, que é o caminho de produção:

```bash
# terminal 1
JWT_SEGREDO="pelo-menos-trinta-e-dois-bytes-aqui" npm run dev:api

# terminal 2
VITE_API_URL=http://127.0.0.1:3333 npm run dev
```

Sem `DATABASE_URL`, a API sobe um Postgres em WebAssembly já semeado. A senha
de todas as contas de desenvolvimento é `defesa-civil-2026`.

Na primeira abertura o navegador baixa o Postgres em WebAssembly (cerca de
13 MB entre `.wasm` e `.data`) e semeia dois municípios fictícios, Serra Alta e
Vale Fundo. Isso leva alguns segundos. Depois disso o banco fica em IndexedDB e
a abertura é imediata.

Entre como **Helena Vasques Coutinho** (coordenadora de Serra Alta) para ver o
fluxo completo. Entre como **Aurélio Prates Machado** (Vale Fundo) para ver o
isolamento: nenhum protocolo, equipe ou usuário de Serra Alta aparece, e buscar
por um protocolo do outro município não devolve nada.

Para começar do zero no modo local, limpe o site nas ferramentas do navegador
(isso apaga o IndexedDB) ou chame `recriarBanco()` de `src/dados/banco.ts`. No
modo API, basta reiniciar o servidor: o banco efêmero nasce semeado de novo.

## Como testar

```bash
npm test                    # 46 testes: isolamento, permissões e API
npm run test:isolamento     # portão CA-06 sozinho: 14 testes
npm run test:api            # 26 testes de integração da API
npm run typecheck           # TypeScript estrito em todos os pacotes
npm audit                   # precisa fechar em zero
```

Fluxo ponta a ponta no navegador, modo local:

```bash
npm run build --workspace @dc360/web
cd apps/web && npx vite preview --port 4173 --strictPort   # deixe rodando
npm run test:e2e                                            # em outro terminal
```

Fluxo ponta a ponta com a API, que é o caminho de produção:

```bash
# terminal 1: API recém-iniciada (a suíte confere contagens exatas)
cd apps/api && JWT_SEGREDO="pelo-menos-trinta-e-dois-bytes-aqui"   ORIGENS_PERMITIDAS=http://localhost:4173 npx tsx src/index.ts

# terminal 2
cd apps/web && VITE_API_URL=http://127.0.0.1:3333 npx vite build   && npx vite preview --port 4173 --strictPort

# terminal 3
npm run test:e2e:api --workspace @dc360/web
```

São 31 verificações que só existem neste caminho: entrada por senha, senha
errada recusada, token guardado sem a senha nem o hash, isolamento imposto
pelo servidor (inclusive abrindo a URL de outro município na mão), fluxo
gravando de verdade, dado criado numa sessão aparecendo em outro navegador,
papel recusado **mesmo chamando a API direto pelo console**, sair revogando a
sessão no servidor, e cadastro com senha inicial seguido de entrada.

São 43 verificações: entrada, isolamento entre municípios visto dos dois lados,
geração de protocolo em sequência, triagem, despacho, encerramento com motivo
obrigatório, indicadores do painel reagindo às mudanças, cadastro de equipes e
usuários com recusa de duplicata, mapa, restrição de menu por papel, tema
escuro nas duas pontas (inclusive na tela de entrada) e persistência entre
recarregamentos, mais as garantias de acessibilidade: selo com ícone, marcador
de mapa com forma própria por severidade, e erro de campo com `role="alert"` e
`aria-describedby`. O teste também falha se aparecer qualquer erro no console.

Na primeira vez: `npx playwright install chromium`.

## O portão CA-06

`db/test/isolamento.test.ts` é o teste que bloqueia merge. Ele responde uma
pergunta só: com o contexto de um município, é possível ler, alterar ou criar
dado de outro?

Ele roda em PGlite justamente para não depender de Docker. O teste que protege o
isolamento não pode ser o que alguém pula porque a infraestrutura não subiu.

Detalhe que faz o teste valer alguma coisa: o superusuário do Postgres ignora
RLS. Por isso tudo que simula a aplicação roda com `SET LOCAL ROLE dc360_app`, o
mesmo papel sem privilégio que a API usará em produção.

## O que falta, e por quê

- **Aplicativo de campo.** A API que ele consome já está pronta
  (`/sincronizacao/pendencias` e `/sincronizacao/vistoria`), com idempotência
  coberta por teste. Falta o Expo.
- **Upload de evidência.** A rota de sincronização já grava o metadado da foto
  com a chave prefixada por tenant, mas o arquivo em si ainda não sobe: falta
  o bucket e a URL pré-assinada.
- **Recuperação de senha.** Hoje só o administrador do município define senha
  ao cadastrar. Sem isso, esquecer a senha é chamado para o suporte.
- **Mapa cartográfico.** MapLibre GL JS depende de um provedor de tiles, que é
  custo recorrente por carregamento. Entra junto com a decisão de provedor. O
  que já existe plota as coordenadas reais gravadas.
- **Armazenamento de evidência.** A regra de chave por tenant já está no banco;
  falta o bucket. O levantamento aponta Cloudflare R2 por causa do egress.
- **PostGIS.** A migração ainda não cria a extensão porque nada hoje faz
  consulta espacial. Entra quando entrar busca por raio ou por setor de risco.

## Onde estão as decisões

- Stack, multi-tenancy, protocolo offline e régua de segurança:
  `../docs/referencia/LEVANTAMENTO_TECNICO_JURIDICO_GOVTECH.md`
- Regras de trabalho e o que vale na raiz contra o que vale aqui:
  `../CLAUDE.md`
