# Defesa Civil Operacional 360, produto real

Esta pasta é o produto de verdade, autorizado em 21/08/2026. Ela não tem nada a
ver com o protótipo da raiz do repositório, que continua sendo HTML puro e
descartável. As proibições da Fase 0 (nada de framework, nada de npm, nada de
build) valem lá, não aqui.

## O que já está de pé

| Pacote | O que é | Situação |
| --- | --- | --- |
| `packages/shared` | Vocabulário do domínio, máquina de estados e esquemas Zod, compartilhados entre web, aplicativo de campo e API | Pronto |
| `db` | Migração PostgreSQL com multi-tenancy por RLS forçada, e o teste de isolamento CA-06 | Pronto, 12 testes passando |
| `apps/web` | Painel do coordenador em React, Vite e TypeScript, rodando contra o banco de verdade | Pronto, 36 verificações ponta a ponta passando |
| `apps/campo` | Aplicativo de campo em React Native com Expo, coleta offline | Não iniciado |
| `apps/api` | API HTTP | Não iniciada |

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

## Como rodar

```bash
cd produto
npm install
npm run build --workspace @dc360/shared   # o app web importa o pacote compilado
npm run dev                               # painel web em http://localhost:5173
```

Na primeira abertura o navegador baixa o Postgres em WebAssembly (cerca de
13 MB entre `.wasm` e `.data`) e semeia dois municípios fictícios, Serra Alta e
Vale Fundo. Isso leva alguns segundos. Depois disso o banco fica em IndexedDB e
a abertura é imediata.

Entre como **Helena Vasques Coutinho** (coordenadora de Serra Alta) para ver o
fluxo completo. Entre como **Aurélio Prates Machado** (Vale Fundo) para ver o
isolamento: nenhum protocolo, equipe ou usuário de Serra Alta aparece, e buscar
por um protocolo do outro município não devolve nada.

Para começar do zero, limpe o site nas ferramentas do navegador (isso apaga o
IndexedDB) ou chame `recriarBanco()` de `src/dados/banco.ts`.

## Como testar

```bash
npm run test:isolamento     # portão CA-06: 12 testes de isolamento entre municípios
npm run typecheck           # TypeScript estrito em todos os pacotes
npm audit                   # precisa fechar em zero
```

Fluxo ponta a ponta no navegador (exige o build e o servidor de preview):

```bash
npm run build --workspace @dc360/web
cd apps/web && npx vite preview --port 4173 --strictPort   # deixe rodando
npm run test:e2e --workspace @dc360/web                    # em outro terminal
```

São 36 verificações: entrada, isolamento entre municípios visto dos dois lados,
geração de protocolo em sequência, triagem, despacho, encerramento com motivo
obrigatório, indicadores do painel reagindo às mudanças, cadastro de equipes e
usuários com recusa de duplicata, mapa, restrição de menu por papel, tema
escuro e persistência entre recarregamentos. O teste também falha se aparecer
qualquer erro no console.

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

- **API HTTP e autenticação real.** Hoje a escolha de perfil na entrada faz o
  papel do token. O contrato já está no lugar certo: a organização sai de um
  único ponto e vai para o `SET LOCAL`.
- **Aplicativo de campo.** É onde vive a coleta offline com fila de
  sincronização. O envelope e a chave de idempotência já estão definidos em
  `packages/shared/src/schemas.ts` e a restrição de unicidade já está no banco.
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
