# Defesa Civil Operacional 360, produto real

Esta pasta (`dc360/`) é o produto de verdade, autorizado em 21/08/2026. Ela não tem nada a
ver com o protótipo em `mockup/`, que continua sendo HTML puro e descartável. As proibições da Fase 0 (nada de framework, nada de npm, nada de
build) valem lá, não aqui.

## O que já está de pé

| Pacote | O que é | Situação |
| --- | --- | --- |
| `packages/shared` | Vocabulário do domínio, máquina de estados e esquemas Zod, compartilhados entre web, aplicativo de campo e API | Pronto |
| `db` | Migrações PostgreSQL com RLS forçada, aplicador de migrações e o teste de isolamento CA-06 | Pronto, 29 testes passando |
| `apps/web` | Painel do coordenador em React, Vite e TypeScript, em dois modos: banco na própria aba, ou HTTP contra a API | Pronto, 43 verificações no modo local e 31 contra a API |
| `apps/api` | API HTTP: autenticação com recuperação de senha, isolamento por token, sincronização idempotente, evidência fotográfica e documentos oficiais | Pronta, 83 testes de integração passando |
| `packages/campo` | Motor de sincronização offline: fila persistente, espera entre tentativas, idempotência | Pronto, 28 testes de unidade e 7 de integração contra a API |
| `apps/campo` | Casca do aplicativo em React Native com Expo | Não iniciada |

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
| Recuperação de senha | Link de uso único, 30 minutos, entregue por um notificador injetável | Esquecer a senha não pode virar chamado para o suporte, nem "manda a senha no WhatsApp" |
| Troca de senha | Exige a senha atual, e derruba as outras sessões | Aparelho esquecido desbloqueado na mesa vira conta sequestrada em dois cliques |

Redefinir a senha derruba **todas** as sessões. Se a recuperação foi pedida
porque alguém invadiu a conta, deixar as sessões antigas vivas entregaria a
conta de volta ao invasor. E o banco valida o link e grava a senha nova numa
operação só: separar em "confere o token" e depois "grava" abriria uma janela
em que o mesmo link serve duas vezes.

O envio da mensagem passa por uma porta (`Notificador`), não por um cliente de
email direto: o provedor ainda não foi escolhido, e um teste que precisasse de
servidor de email nunca seria rodado. Em desenvolvimento o link vai para o log.

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

## O motor de sincronização offline (`packages/campo`)

É a parte difícil do aplicativo de campo, e está pronta e testada antes da
casca em Expo existir, porque é aqui que mora o risco. O agente coleta no
morro sem sinal e o envio acontece depois, muitas vezes já no carro, com a
conexão indo e vindo. Duas coisas não podem acontecer nesse trecho: perder uma
coleta feita no morro, e gravar o mesmo laudo duas vezes.

Decisões que o código toma, e por quê:

| Situação | O que a fila faz | Por quê |
| --- | --- | --- |
| Sem sinal | Guarda e agenda nova tentativa | A coleta já foi feita; refazer significa subir o morro de novo |
| Erro de rede no meio da fila | Para ali, não varre o resto | Rede caída não melhora no item seguinte, e insistir gasta bateria |
| 5xx ou 429 | Tenta de novo, com espera crescente | Servidor reinicia em deploy; insistir resolve |
| 400, 403, 404, 409, 422 | Bloqueia na hora | Repetir não muda o resultado, só enche o log |
| 401 | Bloqueia **também** | Insistir com token morto estoura o limite de tentativas e bloqueia a conta de quem está trabalhando |
| App morre no meio do envio | Reenvia com a MESMA chave | O servidor reconhece e devolve o recibo antigo em vez de gravar outro laudo |
| Dois drenos ao mesmo tempo | O segundo recusa começar | Wi-Fi de prefeitura reconecta sozinho e dispara sincronização em cima de outra |

A espera entre tentativas cresce exponencialmente **com ruído**. Sem o
exponencial, um servidor fora do ar recebe uma tentativa por segundo de cada
aparelho em campo. Sem o ruído, todos os aparelhos que perderam sinal no mesmo
temporal voltam no mesmo instante e derrubam o servidor de novo justo na hora
em que ele está subindo.

A persistência é uma porta (`ChaveValor`), não um SQLite direto: no aparelho
será `expo-sqlite`, nos testes é um mapa. A lógica não muda.

## Evidência fotográfica

A foto é a prova de uma vistoria de interdição, e ela mostra a casa e a rua de
uma família em situação de risco. Duas regras vêm daí:

**O arquivo nunca passa pelo servidor.** O aparelho recebe uma URL
pré-assinada de vida curta e envia direto ao armazenamento. Passar dezenas de
fotos por dentro da API significaria pagar banda duas vezes e derrubar o
servidor no dia de temporal, que é quando o sistema precisa funcionar.

**Nunca existe URL pública.** Toda leitura é pré-assinada, curta, gerada só
depois de conferir permissão.

O ciclo tem quatro passos, e o quarto não é burocracia:

1. O aparelho pede autorização dizendo tipo e tamanho.
2. O servidor confere permissão e dono da ocorrência, **decide a chave** e
   devolve a URL. O cliente não escolhe onde grava: aceitar a chave proposta
   permitiria escrever sob o prefixo de outra prefeitura.
3. O aparelho envia os bytes.
4. O aparelho confirma, e o servidor **pergunta ao armazenamento** se o objeto
   existe e com que tamanho. Sem esse passo, um metadado fica apontando para
   arquivo que nunca chegou, e a falta aparece meses depois, numa audiência.

Tipo e tamanho entram na assinatura, então mandar diferente invalida a URL: o
limite deixa de depender da boa vontade do cliente. O banco impõe as mesmas
regras por CHECK, para valerem mesmo se outra ponta gravar direto.

### A assinatura

`src/armazenamento/assinatura.ts` implementa AWS Signature Version 4 sobre
`node:crypto`, sem o SDK da AWS: o SDK traz dezenas de pacotes transitivos
para uma conta que precisa fechar em zero no `npm audit`, e o provedor
escolhido é S3-compatível (Cloudflare R2, por causa do egress), não a AWS.

A correção não é opinião. O teste confere a saída contra o **vetor oficial da
AWS**, e ela bate byte a byte. Uma assinatura de 256 bits não coincide por
acaso.

Sem `S3_ENDPOINT` configurado, a própria API guarda os bytes em memória, com
URL assinada e expirando do mesmo jeito. A configuração recusa essa combinação
em produção: guardar evidência na memória do processo perderia toda foto no
primeiro reinício.

## Documentos oficiais

O servidor público julga o software pelo documento que ele produz, e um laudo
é peça de processo administrativo: ele pode acabar numa audiência. A API gera
`GET /documentos/:id/laudo` e `GET /documentos/:id/termo-de-interdicao` como
HTML pronto para impressão.

**Gerados no servidor, não montados na tela.** O mesmo laudo precisa sair
igual no navegador do coordenador, na impressora da recepção e no PDF anexado
ao processo. Montar em três lugares produziria três documentos com o mesmo
número de protocolo. Quando a geração de PDF entrar, ela renderiza exatamente
estas páginas: o template é um só, versionado com o código.

Duas regras de conteúdo que não são estéticas:

- **As duas marcas de tempo aparecem sempre que diferem.** Coleta e
  sincronização em horários distintos é o normal de uma vistoria feita sem
  sinal. Mostrar só a segunda faria o documento afirmar que a vistoria
  aconteceu na hora em que o sinal voltou. O laudo diz qual é a data de
  referência do ato, e por que há duas.
- **Nenhuma norma além das autorizadas, e nenhum número de artigo.** Artigo
  errado num termo de interdição é motivo para anular o ato. Um teste varre o
  HTML procurando qualquer citação de lei ou decreto e reprova se aparecer
  algo fora da lista de `docs/CONTEXTO.md`; outro reprova se aparecer a
  palavra "artigo" seguida de número.

Os dois saem também em PDF (`/documentos/:id/laudo.pdf`), renderizados do
**mesmo** HTML por Chromium sem interface. Gerados sob demanda e não guardados:
o laudo muda se uma foto for anexada depois, e um PDF em cache seria a versão
errada com cara de definitiva. Sem navegador instalado, a rota responde 503
dizendo para usar a versão para impressão, em vez de derrubar o pedido.

Enquanto o produto está em validação, todo documento sai com marca d'água. Um
laudo de demonstração indistinguível de um real acaba anexado a processo por
engano.

## O ciclo da providência se fecha

Encaminhar uma providência sem nunca registrar o desfecho é o que produz o "a
prefeitura não fez nada" seis meses depois, sem ninguém conseguir provar o
contrário. O órgão responde, e a resposta entra com desfecho de lista fechada
(atendida, atendida parcialmente, recusada), texto e quem respondeu.

- **A resposta não é editável.** Corrigir seria apagar o que o órgão disse. Se
  algo muda, encaminha-se uma providência nova.
- **Providência sem resposta não impede encerrar.** A secretaria às vezes
  nunca responde, e travar o encerramento faria a fila do coordenador crescer
  para sempre. Mas o encerramento devolve quais ficaram em aberto e registra
  isso na trilha, para ser decisão consciente e não esquecimento.

## Prestação de contas

Um órgão público responde três perguntas o tempo todo, e nenhuma cabe na tela
de uma ocorrência isolada: quem alterou este registro, o que a Defesa Civil fez
no semestre, e quantos chamados vieram daquele bairro.

**A trilha não é escrita à parte.** Ela é o subproduto de cada transição,
gravada na mesma transação da mudança. Se um evento falta, é porque a mudança
não aconteceu. A tela de auditoria filtra por autor, tipo de evento e
protocolo, e respeita o município como todo o resto.

**O resumo usa mediana, não média.** Uma ocorrência parada seis meses por causa
de uma obra puxa a média e faz o serviço parecer pior do que é. A mediana
descreve o atendimento típico, que é o que a pergunta quer saber.

### A planilha não pode virar arma contra quem a abre

Célula que começa com `=`, `+`, `-`, `@` ou tabulação é interpretada como
FÓRMULA pelo Excel e pelo LibreOffice. Num sistema onde o relato vem do que um
cidadão dita por telefone, basta alguém ditar um endereço que comece com `=`
para a planilha executar comando na máquina de quem a abriu. A vítima é o
servidor público, e ele nunca vai suspeitar do arquivo que a própria prefeitura
gerou.

`montarCsv` neutraliza isso prefixando a célula com apóstrofo, e um teste
percorre todas as células do arquivo exportado conferindo que nenhuma começa
com caractere executável. O arquivo também sai com marca de ordem de bytes e
ponto e vírgula, senão "Acácias" vira "AcÃ¡cias" e a planilha abre em uma
coluna só no Excel em português.

### Quem exportou fica registrado

Um CSV de ocorrências carrega nome, contato e relato de cidadãos, e sai do
sistema para viver num pen drive ou num email. A Lei 13.709/2018 exige registro
do tratamento de dado pessoal, e exportação é tratamento. A tabela `exportacoes`
guarda quem levou, qual recorte e quantos registros, é append-only como a
trilha, e o registro acontece na mesma transação da leitura.

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

Consultar a trilha e exportar a base ficam com coordenação e administração: são
as ações que alcançam o município inteiro de uma vez.

O operador também registra a resposta de uma providência: é ele quem atende o
telefone quando a secretaria liga de volta. Continua sem decidir o fluxo.

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

## Implantação

### Aplicar migrações

```bash
DATABASE_URL=postgres://... npm run migrar             # aplica o que falta
DATABASE_URL=postgres://... npm run migrar -- --conferir  # só diz o que falta
```

O aplicador garante quatro coisas, e cada uma corresponde a um jeito de o
deploy quebrar:

| Garantia | O que ela evita |
| --- | --- |
| Cada migração roda uma vez | O segundo deploy tentando criar tabela que já existe |
| Sempre na ordem do nome | Uma migração alterando tabela que a seguinte ainda vai criar |
| Uma transação por migração | Esquema meio aplicado, num estado que ninguém sabe descrever |
| Histórico não se reescreve | Banco de produção divergindo em silêncio do repositório |

A última merece detalhe: se o conteúdo de uma migração já aplicada mudar, o
aplicador **para**. Editar uma migração que já rodou em produção significa que
o banco de lá e o daqui divergiram, e seguir em frente esconderia isso até uma
consulta falhar sem explicação. Reindentar não conta: o hash normaliza espaço
em branco, porque clonar o repositório no Windows troca LF por CRLF sozinho e
travar o deploy por isso seria alarme falso diário.

### A API recusa subir com esquema atrasado

Um processo servindo requisição contra um banco sem a coluna que o código
espera falha de um jeito difícil de diagnosticar: erro de SQL no meio de uma
rota, em produção, com o usuário na frente. O boot confere e sai com erro.
`GET /saude` reporta a última migração aplicada, para o balanceador saber se o
processo está pronto.

Migrar é passo **separado** do deploy, de propósito: dois contêineres subindo
juntos não podem migrar em paralelo.

### Contêiner

`Dockerfile` e `compose.yaml` estão no repositório. **Nenhum dos dois foi
construído ou executado**: o ambiente onde foram escritos não tem Docker. São
proposta revisável, não receita comprovada, e o primeiro deploy tem que
começar por subir os dois uma vez.

## Como testar

```bash
npm test                    # 187 testes em quatro pacotes
npm run test:isolamento     # portão CA-06 sozinho: 14 testes
npm run test:api            # 110 testes da API
npm run test --workspace @dc360/campo   # 28 testes do motor de sincronização
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

São 63 verificações que só existem neste caminho: entrada por senha, senha
errada recusada, token guardado sem a senha nem o hash, isolamento imposto
pelo servidor (inclusive abrindo a URL de outro município na mão), fluxo
gravando de verdade, dado criado numa sessão aparecendo em outro navegador,
papel recusado **mesmo chamando a API direto pelo console**, sair revogando a
sessão no servidor, cadastro com senha inicial seguido de entrada, e o laudo
oficial abrindo numa aba com protocolo, checklist e autoria corretos, e a foto
enviada pelo agente aparecendo na galeria do coordenador, e a recuperação de
senha do pedido até entrar com a senha nova, a trilha de auditoria filtrada, e
o CSV baixado e conferido célula a célula contra injeção de fórmula.

Duas correções vieram dessa suíte, e nenhuma apareceria em teste de servidor:
o CORS da API não permitia `PUT`, então o envio de bytes nem saía do
navegador; e o `Cross-Origin-Resource-Policy` do helmet bloqueava a imagem
quando painel e API ficam em origens diferentes, que é o arranjo de produção.

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

- **Casca do aplicativo de campo em Expo.** A API já está pronta e o motor de
  sincronização também, com a integração entre os dois coberta por teste. O
  que falta é a interface: câmera, assinatura em tela, GPS e o vínculo com
  `expo-sqlite`. Nada disso é verificável fora de um aparelho ou emulador.
- **Conta no provedor de armazenamento.** O código está pronto e testado
  contra o vetor oficial da AWS, mas nunca falou com um R2 ou S3 de verdade:
  isso só se comprova com credencial em mão.
- **Provedor de email.** A recuperação de senha está pronta e testada, mas o
  link sai pelo notificador de log: falta escolher o provedor e implementar a
  porta `Notificador`. Sem isso, em produção a rota responderia "enviamos o
  link" sem enviar nada.
- **Mapa cartográfico.** MapLibre GL JS depende de um provedor de tiles, que é
  custo recorrente por carregamento. Entra junto com a decisão de provedor. O
  que já existe plota as coordenadas reais gravadas.
- **Armazenamento de evidência.** A regra de chave por tenant já está no banco;
  falta o bucket. O levantamento aponta Cloudflare R2 por causa do egress.
- **PostGIS.** A migração ainda não cria a extensão porque nada hoje faz
  consulta espacial. Entra quando entrar busca por raio ou por setor de risco.
- **PDF em job assíncrono.** Hoje o PDF é gerado na própria requisição, o que
  serve para um laudo por vez. Quando alguém exportar a fila inteira, isso
  precisa virar fila com download por link, como o levantamento prevê. A porta
  `GeradorDePdf` já está no lugar para a troca.

## Onde estão as decisões

- Stack, multi-tenancy, protocolo offline e régua de segurança:
  `../docs/referencia/LEVANTAMENTO_TECNICO_JURIDICO_GOVTECH.md`
- Regras de trabalho e o que vale na raiz contra o que vale aqui:
  `../CLAUDE.md`
