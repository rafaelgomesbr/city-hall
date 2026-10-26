# V2-F03: abertura da API da F03 (parte 1C do lote 1)

Ramo `trab/f03-1c-abertura-api`, base `origin/v2/f03` (f3513581, depois rebaseado em d485da25, que só mexe em `.github/workflows/verificar.yml`). Plano: `docs/roadmap-v2/retomada/plano-f03.md`, lote 1, parte 1C (não é etapa). Norma de trabalho: ADR 0009 (PROPOSTA). Risco ALTO: mexe na autenticação sem poder mudar comportamento.

## Fatos

### A autenticação saiu do servidor, sem mudar nada

- `dc360/apps/api/src/auth/autenticacao-da-requisicao.ts` (novo): o corpo de `exigirAutenticacao` foi movido linha por linha (token, suspensão, vigência na escrita, senha provisória), como `criarAutenticacaoDaRequisicao(banco, config)`. Junto foram o tipo `Identidade`, a classe `NaoAutenticado`, a classe `TrocaDeSenhaObrigatoria` e a constante `ROTAS_ABERTAS_COM_SENHA_PROVISORIA`, porque o corpo precisa deles e deixá-los em `servidor.ts` criaria importação circular.
- `servidor.ts` reexporta os quatro nomes (`export { ... } from`), então nenhum dos 17 importadores mudou de caminho, e a identidade das classes é a mesma (`instanceof` do `setErrorHandler` segue valendo). `autorizar` ficou onde estava. A decoração `app.decorate("exigirAutenticacao", ...)` ficou em `servidor.ts` e só chama a fábrica.
- `dc360/apps/api/src/auth/manifesto.ts` (novo): `conferirManifesto(req, identidade)` devolve sempre (passa). É chamada em `criarAutenticacaoDaRequisicao` depois de todas as recusas existentes e ANTES de `req.identidade` ser posto, em toda requisição autenticada (leitura e escrita, `/v1` e espelho).
- `dc360/apps/api/src/limite-persistente.ts` (novo): `lojaDoLimitador(config)` devolve `LimitePorRotaSemVersao`, a loja de memória de hoje; `servidor.ts` passa `store: lojaDoLimitador(config)` ao `rateLimit`. O resto do registro do `rateLimit` é idêntico.
- Três módulos de rota vazios, `rotas/convites.ts`, `rotas/municipio-da-sessao.ts` e `rotas/sigilo.ts`, registrados SÓ em `/v1` (bloco `if (!espelho)` de `registrarRotasDeNegocio`), com prefixo `/` (cada dono escreve o caminho inteiro, como `rotas/administracao.ts`) e recebendo todas as dependências (`DependenciasDasRotas`, agora exportado). Nenhuma rota registrada: o teste de paridade com `ROTAS_SO_NO_V1` segue verde.
- Preservado em `servidor.ts` sem tocar: `lancarSeForaDoCatalogo`/`conferirCodigoDoCatalogo`, o `frameworkErrors` e o CORS, `registrarRotasDeNegocio`, o hook de versão do aplicativo (426), o contador do espelho, o tratador de erros.

### Contrato

- `contrato/rotas.ts` ganhou três grupos vazios (`grupos/convites.ts`, `grupos/municipio-da-sessao.ts`, `grupos/sigilo.ts`, cada um com `rotas: []` e `pendentes: []`).
- `contrato/grupos/administracao.ts`: o `PATCH /v1/usuarios/:id` ganhou `papel_nao_se_converte` em `erros` (o 409 que a 1A emite).
- `openapi/v1.json` regerado por `npm run openapi`. O diff contra a base está em `saidas/04-diff-do-v1-json.txt`: UMA mudança, a linha 409 do PATCH de usuários (descrição e `x-codigos-de-erro`). Os grupos vazios não aparecem no documento (sem rota, sem operação).
- DECISÃO: o `enum` de `papel` nas respostas de login e de conta ficou com `PAPEIS` (não restringi a `PAPEIS_DE_SERVIDOR`). A conta `usuario_orgao` ganha token na 2A quando o portal abrir, e a resposta de login dela terá `papel: usuario_orgao`; restringir agora faria `v1.json` mudar duas vezes e o contrato mentiria depois. Hoje a conta não loga (P-09), então o `enum` largo é inofensivo.

### Chaves de configuração da F03 (`config.ts`, `COLOCAR-DE-PE.md`, `ambientes.json`, `.env.example`)

Todas com padrão fechado e nenhum efeito: nenhum código de negócio lê o valor.

| Chave | Tipo e padrão | Regra de partida |
| --- | --- | --- |
| `PORTAL_ATIVO` | `sim`/`nao`, `nao` | `sim` sem `SEGUNDO_FATOR_ATIVO=sim` recusa a partida, em qualquer ambiente |
| `ACEITA_SUB_DE_CONTA_ATE` | `AAAA-MM-DD`, vazia (fechada) | data inexistente recusa |
| `VERSAO_DO_LOGIN_EM_DOIS_PASSOS` | `maior.menor.correção`, vazia | fora do formato recusa |
| `MFA_VIGENCIA_MINUTOS` | inteiro 0 a 1440, `0` | RESERVADA e sem efeito: a ADR 0009 corrigida diz que a troca de município pede prova nova e nada é herdado; só teria efeito se o Rafael aceitar o risco (CP-50 pergunta 2, H107) |
| `COTAS_PERSISTENTES` | `sim`/`nao`, `nao` | em produção `sim` sem `COTAS_SEGREDO` recusa |
| `COTAS_SEGREDO` | segredo, mínimo 32 caracteres, vazio é ausente | exigido em produção quando as cotas estão ligadas; na matriz é `onde: segredo` |

`scripts/ambientes.json` ganhou as seis (nenhuma com `valores` fixos, para a 2A poder pôr `PORTAL_ATIVO=sim` no `fly.hml.toml` sem editar a matriz); `conferir-ambiente.mjs` confere o repositório. Não declarei chave de fila de envio: a 1C não precisou de nenhuma (convite e recuperação usam as chaves de e-mail e notificador que já existem).

### Nome da chave da versão do login

O plano e a ADR 0009 chamam a chave `VERSAO_ESCOLHA_DE_MUNICIPIO`, mas dois guardas de isolamento (`apps/api/test/contrato-de-ambiente.test.ts` e `scripts/conferir-ambiente.test.mjs`) reprovam variável de configuração com `MUNICIPIO`, `ORGANIZACAO` ou `TENANT` no nome. Por ordem do orquestrador, a chave foi RENOMEADA para `VERSAO_DO_LOGIN_EM_DOIS_PASSOS` e os dois guardas ficaram exatamente como eram (nenhuma exceção aberta). O significado não mudou: a versão mínima do aplicativo que sabe escolher o município no login.

## Testes novos

- `apps/api/test/chaves-da-f03.test.ts` (18 casos): padrão fechado das seis chaves, produção válida sobe sem elas, vazio vale como ausente, valores declarados chegam, `PORTAL_ATIVO=sim` recusa sem segundo fator (dev e produção) e sobe com ele, `COTAS_SEGREDO` exigido em produção só com as cotas ligadas, formatos recusados, e ligar `COTAS_PERSISTENTES` não troca a loja do limitador.
- `apps/api/test/manifesto-em-toda-requisicao.test.ts` (9 casos): `conferirManifesto` é chamada em leitura e escrita, em `/v1` e no espelho, com a identidade do token; não é chamada sem token, com token inválido nem em rota pública; recusa do manifesto vira a resposta da recusa e a rota não roda; o isolamento entre municípios segue 404.
- `scripts/baseline.mjs`: UMA chave, `V2-F03-abertura-1C` (27 casos). README e `COLOCAR-DE-PE.md`: só os totais (2285 para 2312 da API, 4827 para 4854, 6850 para 6877).

## Portões (a partir de `dc360/`)

| Portão | Resultado |
| --- | --- |
| `npm run typecheck` | verde nos oito pacotes (`saidas/01-typecheck.txt`) |
| `npm run test:api`, base f3513581 | 2319 casos: 2283 passam, 34 puladas, 2 falham (`semear-homologacao`, ambiente aceito). 132 arquivos (`saidas/03-teste-da-api-base-f3513581.txt`) |
| `npm run test:api`, com a 1C | 2346 casos: 2310 passam, 34 puladas, 2 falham (as mesmas duas). 134 arquivos (`saidas/02-teste-da-api-final.txt`) |
| Mesmos números | 2310 menos 2283 = 27 passam a mais, 2346 menos 2319 = 27 casos a mais: exatamente os 18 e 9 novos. As duas falhas e as 34 puladas são as mesmas; nenhum caso existente mudou de resultado |
| `npm test` completo (primeira passada, `saidas/06-npm-test-completo-resumo.txt`) | campo 283, shared 435 (1 falha, `regras-de-conteudo`, EPERM em symlink, DV-46), console 379, web 824 e db 613 passam; db com 8 falhas de ambiente aceitas (`desfazer-migracao` 5, `guarda-da-semente` 3); api com as 2 aceitas e 1 que era minha (o guarda `contrato-de-ambiente`, corrigido como acima e provado na rodada final do api) |
| `npm run test:isolamento` (CA-06 e `catalogo-nominal`) | dentro do `npm test` do pacote db da primeira passada: sem falha fora das 8 aceitas; nenhum arquivo de `db/**` foi tocado |
| `CI=true npm run test:scripts` | 831 casos, 808 passam, 23 pulados, 0 falham (`saidas/07-test-scripts-resumo.txt`; inclui a conferência dos `INDEX.md`) |
| `npm run lint`, `lint:teto` (431), `formato:conferir` | verdes (`saidas/08-...`) |
| `npm run conferir:numeros` | verde (`saidas/05-conferir-numeros.txt`) |
| `node scripts/conferir-ambiente.mjs` | o repositório bate com a matriz |
| `npx vitest run packages/shared/test/regras-de-conteudo.test.ts` | 1 falha de ambiente aceita (EPERM em symlink, DV-46) |
| `node scripts/auditar.mjs` | exit 0 |

## Justificativa das escolhas

- **Mover o corpo inteiro, inclusive as classes e a constante**: o corpo usa `NaoAutenticado`, `TrocaDeSenhaObrigatoria` e `ROTAS_ABERTAS_COM_SENHA_PROVISORIA`; deixá-los em `servidor.ts` e importar de lá seria um ciclo. A reexportação mantém todos os caminhos.
- **`conferirManifesto` depois das recusas e antes de `req.identidade`**: a E12 vê só requisição que já passou por token, suspensão, vigência e senha provisória, e uma recusa dela impede a rota de ver identidade nenhuma.
- **Módulos de rota com prefixo `/` e todas as dependências**: a `servidor.ts` e a `config.ts` congelam na F03 depois desta parte, então os donos (E10, E16, E21) não podem pedir prefixo ou dependência nova a ela.
- **`lojaDoLimitador(config)` devolve a classe da biblioteca (`FastifyRateLimitStoreCtor`)**: a E17 troca o corpo da função, sem mexer no servidor.
- **`MFA_VIGENCIA_MINUTOS` sem efeito e com padrão 0**: a ADR corrigida manda prova nova na troca de município; a chave existe só para a forma leve, se o Rafael a adotar.

## Limitações

- O que se provou é "nada mudou" pela suíte inteira e pelo `v1.json`; não há prova nova de comportamento além dos 27 casos, porque não há comportamento novo.
- `PORTAL_ATIVO=sim` não liga nada ainda (o login do `usuario_orgao` segue fechado, P-09); só a regra de partida existe.
- `test:e2e:api` não foi rodado (o CI cobre).

## Para o orquestrador

- **Linha do STATUS sugerida:** `V2-F03-abertura-1C | IMPLEMENTADA (não é etapa) | candidato no ramo trab/f03-1c-abertura-api | autenticação em auth/autenticacao-da-requisicao.ts, ponto conferirManifesto, limite-persistente, três módulos de rota e três grupos de contrato vazios, seis chaves da F03 | falta validação`.
- **A PARTIR DAQUI `servidor.ts` e `config.ts` ficam CONGELADOS na F03** (só correção de junção). Quem precisar de mais uma chave de configuração ou de mais um módulo de rota depois da 1C precisa de um pedido de reabertura. `auth/autenticacao-da-requisicao.ts` é da 1D, da 2A e da 3A, `auth/manifesto.ts` da 3B, `rotas/convites.ts` da 4B e da 5C.
- **Dívidas pagas:** nenhuma. **Pendências humanas novas:** nenhuma.
- **Mudança de plano / premissas:** (1) o plano não previa mover `NaoAutenticado`, `TrocaDeSenhaObrigatoria` e `ROTAS_ABERTAS_COM_SENHA_PROVISORIA`; moveram junto, reexportados. (2) **O nome da chave DIVERGE do plano e da ADR 0009**: `VERSAO_ESCOLHA_DE_MUNICIPIO` virou `VERSAO_DO_LOGIN_EM_DOIS_PASSOS`, para não afrouxar os dois guardas de isolamento ("organização não é configuração"), que ficaram intocados. O orquestrador atualiza o plano; a ADR 0009 e o comentário de `packages/shared/src/erros.ts` (código `escolha_de_municipio_obrigatoria`) ainda citam o nome antigo e ficam para quem for dono deles. (3) `DependenciasDasRotas` passou a ser exportado. (4) O `enum` de `papel` do contrato NÃO foi restrito (ver acima); a 2A não precisa mexer em `contrato/**` por causa dele. (5) Nenhuma divergência entre o plano e a ADR 0009 apareceu nesta parte.
- **Conflitos prováveis na junção:** com a 1D em `auth/autenticacao-da-requisicao.ts` (a 1D parte deste arquivo); com qualquer parte que mexa em `scripts/baseline.mjs` (uma linha no fim da tabela da API), nos totais do README e do `COLOCAR-DE-PE.md` (somar os casos novos de cada parte) e em `scripts/ambientes.json`.
