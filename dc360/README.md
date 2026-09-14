# Defesa Civil Operacional 360, produto real

Esta pasta (`dc360/`) é o produto de verdade, autorizado em 21/08/2026. Ela não tem nada a
ver com o protótipo em `mockup/`, que continua sendo HTML puro e descartável. As proibições da Fase 0 (nada de framework, nada de npm, nada de
build) valem lá, não aqui.

## O que já está de pé

| Pacote | O que é | Situação |
| --- | --- | --- |
| `packages/shared` | Vocabulário do domínio, máquina de estados e esquemas Zod, compartilhados entre web, aplicativo de campo e API | Pronto |
| `db` | Migrações PostgreSQL com RLS forçada, aplicador de migrações e o teste de isolamento CA-06 | Pronto, 159 testes do banco passando |
| `apps/web` | Painel do coordenador em React, Vite e TypeScript, em dois modos: banco na própria aba, ou HTTP contra a API | Pronto, 322 testes de fonte do painel mais 58 verificações no navegador no modo local e 103 contra a API |
| `apps/api` | API HTTP: autenticação com recuperação de senha, isolamento por token, sincronização idempotente, evidência fotográfica e documentos oficiais | Pronta, 736 testes da API passando |
| `packages/campo` | Motor de sincronização offline: fila persistente, espera entre tentativas, idempotência, persistência em SQLite | Pronto, 138 testes de unidade do motor de campo e 10 de integração contra a API |
| `apps/campo` | Aplicativo do agente em React Native com Expo: coleta offline, câmera, GPS, assinatura, fila de envio, configuração das duas lojas | Instalado e usado em iPhone de verdade (compilação nativa, 08/09/2026), com três vistorias reais coletadas. TypeScript limpo, 1167 testes do aplicativo passando, 21 de 21 no `expo-doctor`, `npm audit` em zero. Ver `apps/campo/LEIA-ME.md` e `apps/campo/LOJAS.md` |
| `apps/console` | Console do fornecedor: processo separado, com segundo fator obrigatório, que lê saúde de uso agregada de todos os municípios e não alcança dado de cidadão | Pronto, 39 testes do console do fornecedor passando. Ver "O console do fornecedor", mais abaixo |

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
| Segunda etapa | Código de seis dígitos do aplicativo de autenticação (TOTP), com segredo guardado cifrado, chave fora do banco | O administrador é o teto do município (ADR 0006): a conta dele estava protegida por senha e mais nada. SMS foi recusado (troca de chip, custo por mensagem, e depende da operadora justamente no dia do temporal) |

Redefinir a senha derruba **todas** as sessões. Se a recuperação foi pedida
porque alguém invadiu a conta, deixar as sessões antigas vivas entregaria a
conta de volta ao invasor. E o banco valida o link e grava a senha nova numa
operação só: separar em "confere o token" e depois "grava" abriria uma janela
em que o mesmo link serve duas vezes.

O envio da mensagem passa por uma porta (`Notificador`), e não por um cliente de
email embutido na rota: um teste que precisasse de servidor de email nunca seria
rodado. Em desenvolvimento o link vai para o log.

#### O cliente de email, e o defeito que ele já foi

Esta porta passou por dois estados errados, e o segundo é mais instrutivo que o
primeiro.

No primeiro, não havia implementação nenhuma. `NOTIFICADOR_URL` e
`NOTIFICADOR_CHAVE` existiam na configuração, a partida em produção recusava
subir sem elas com a recuperação ligada, e **nenhuma linha do servidor jamais
falou com provedor nenhum**. O produto conferia o endereço de um provedor com o
qual nunca falava.

No segundo, o cliente existia e montava o pedido com nomes de campo
**inventados**: `de`, `para`, `nome`, `assunto`, `texto`. Provedor de email
nenhum aceita esse formato. Ligar o recurso naquele estado teria produzido cem
por cento de recusa, ou seja, o cliente que existia para o email sair teria
impedido o email de sair. E nada quebraria: a configuração passava, o servidor
subia, e o sintoma apareceria uma mensagem de cada vez, na caixa de entrada que
nunca recebia nada.

Hoje o cliente fala o contrato publicado do **Resend**
(`POST https://api.resend.com/emails`, com `from`, `to`, `subject` e `text`), e
`apps/api/test/notificador-http.test.ts` confere o corpo campo a campo, além de
afirmar que os cinco nomes inventados **não** aparecem nele. Sem SDK, pela mesma
razão que a assinatura S3 é escrita à mão: o `npm audit` deste produto fecha em
zero.

Três decisões que vale registrar:

| Peça | Decisão | Por quê |
| --- | --- | --- |
| Remetente | `EMAIL_REMETENTE` passou a ser OBRIGATÓRIA com `EMAIL_ATIVO=sim` | O provedor trata `from` como obrigatório. Opcional queria dizer "configuração completa, servidor de pé, toda mensagem recusada" |
| Recibo | O identificador que o provedor devolve é guardado em `oficio_envios.provedor_id` (migração 027) | Sem ele, "o provedor aceitou" é palavra contra palavra no dia em que o órgão diz que não recebeu |
| 429 | É o ÚNICO 4xx que o cliente repete sozinho, duas vezes, respeitando o `retry-after` e com a mesma chave de idempotência | É o erro do dia de temporal, e o único que não diz nada sobre a mensagem. E a rota grava a tentativa ANTES de chamar o provedor: devolver o 429 para fora queimaria uma das três tentativas de reenvio do ofício sem nada ter saído |

A chave de idempotência não é enfeite: sem ela, um 429 sobre um pedido que na
verdade tinha passado faria o mesmo ofício sair duas vezes para o órgão, e
ofício duplicado numa interdição é problema jurídico.

O corpo da resposta do provedor passa por `semOsEnderecos` antes de virar
mensagem de erro, e agora leva junto o endereço do destinatário: o erro de
validação ecoa o campo recusado, e esse eco iria para o log do servidor e para a
coluna `detalhe` da tentativa, que o suporte lê.

Ligar isso em produção é procedimento, e está escrito em `docs/LIGAR-O-EMAIL.md`.

#### A segunda etapa, e o desfecho a mais na rota de entrar

`SEGUNDO_FATOR_ATIVO=sim` faz a rota de entrar ter **dois desfechos**: a sessão,
ou "falta o código". O estado intermediário viaja num **token de propósito
único**, com plateia própria (`dc360-desafio`), válido por cinco minutos, que
rota autenticada nenhuma aceita: reusar o token de acesso aqui seria dar acesso
antes da segunda etapa, porque quem tem o token não precisa da tela para nada.
Com o recurso ligado, o **administrador** que ainda não ligou a verificação não
recebe sessão: ele recebe um desafio que abre a ativação e mais nada. Exigência
que deixa entrar com um aviso é exigência de mentira.

| Peça | Decisão | Por quê |
| --- | --- | --- |
| Segredo | Cifrado em AES-256-GCM, amarrado ao município e à pessoa, chave em `SEGUNDO_FATOR_CHAVE` | Banco vazado não devolve segundo fator. A amarração impede copiar o envelope de uma linha para a do administrador |
| Janela | Um passo de tolerância para cada lado, e o passo usado fica queimado | Cada passo a mais triplica os códigos válidos ao mesmo tempo. Sem queimar, quem leu a tela por cima do ombro entra com o mesmo número |
| Teto | Contador próprio, separado do da senha | O da senha zera a cada acerto de senha: com um contador só, adivinhar seis dígitos teria tentativas infinitas |
| Códigos de recuperação | Oito, 80 bits cada, mostrados uma vez, guardados como resumo, cada um vale uma vez | Sem eles, telefone perdido vira SQL na produção com o papel que ignora o isolamento |
| Ativação | Confere um código ANTES de ligar | Relógio de telefone errado ou leitura que não guardou nada trancariam a pessoa do lado de fora |
| Desligar | Exige a senha atual, apaga o segredo e derruba os códigos | O painel esquecido aberto na recepção não desliga a proteção de ninguém |

O código QR da ativação é desenhado pelo próprio painel
(`apps/web/src/componentes/qr.ts`), sem dependência nova, pela mesma razão do
TOTP no servidor. O segredo aparece em texto ao lado dele: metade dos
computadores de recepção de Defesa Civil não tem câmera.

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

#### Quem coletou não é quem enviou

O aparelho de plantão é compartilhado entre turnos, e isso quebrava a autoria da
vistoria. A agente da manhã coleta no morro sem sinal, lê a minuta em voz alta
COM O NOME DELA e a moradora assina no dedo. Ela sai da conta, e o aplicativo
promete (com razão) que a coleta continua guardada no aparelho. Às 19:00 o agente
da noite entra, a fila drena, e como o envelope não dizia autor nenhum o servidor
tirava o `agente_id` de quem apresentou o token. O laudo e a trilha passavam a
atribuir a vistoria a um servidor que nunca esteve no local, contra a minuta lida
em voz alta, e a trilha é append-only: esse autor nunca seria corrigido, só
comentado.

O aplicativo carimba o autor no item da fila e não envia coleta que não é de quem
está logado. Isso é portão de cliente, e **portão de cliente não é controle de
acesso**: binário adulterado ou defeito naquele filtro reproduz o laudo falso. O
envelope passou a carregar `coletadaPor`, e o servidor compara com o dono do
token verificado. Divergiu, recusa com 409 `autor_divergente`, e a tentativa
entra na trilha: tentar gravar vistoria com autor que não é o do token é
exatamente o que alguém vai querer auditar depois. O registro é escrito em
transação própria, senão o ROLLBACK da recusa o levaria junto.

O campo é **opcional**, e a razão tem data de validade escrita no esquema: há
aparelho em campo com coleta gravada antes dele, e não existe tela para
desbloquear item recusado. Obrigatório agora, essas coletas virariam 422 para
sempre, e uma vistoria de morro seria destruída por uma mudança de esquema. Ele
passa a obrigatório quando não restar coleta antiga em nenhum aparelho.

### Rodar

```bash
npm run dev:api     # sobe em http://127.0.0.1:3333
```

Sem `DATABASE_URL` ela sobe um Postgres em WebAssembly no próprio processo,
efêmero, só para desenvolver. Em produção a configuração recusa essa
combinação e exige `DATABASE_URL` e `JWT_SEGREDO`: um servidor que sobe com
chave padrão é pior que um que não sobe, porque parece funcionar.

Em produção a `DATABASE_URL` também precisa pedir verificação do certificado
do banco, ou seja, terminar em `?sslmode=verify-full`. Sem isso o pool não
monta a âncora de confiança e a conexão sobe cifrada e **não autenticada**,
que é uma combinação com cara de segura: quem estiver entre a API e o banco lê
e reescreve a base de todos os municípios, e o SCRAM não acusa nada, porque o
intermediário só retransmite o desafio e a resposta. O certificado raiz já vem
versionado em `db/provedores/`, então não há mais nada a configurar.

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

## Nada capturado fica invisível

Duas informações eram gravadas e nunca mostradas, o que deixava as duas
funcionalidades pela metade.

**O vínculo de duplicidade** agora aparece nos dois sentidos: o chamado novo
diz de quem é continuação, e o original avisa que há outros sobre o mesmo
evento, com a frase que importa junto (encerrar um não encerra os outros).
Sem isso, o coordenador encerraria o primeiro sem saber que há outro pendurado.

**As providências sem resposta** ganharam cartão próprio no painel e contagem
de vencidas. Elas somem da fila assim que a ocorrência é encerrada, e é
justamente aí que ficam esquecidas, então o cartão as mantém à vista mesmo
depois do encerramento, dizendo por escrito por que continuam ali.

O cartão fica **abaixo** da fila, e não acima: a fila é o que o coordenador
abre o painel para ver.

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

## O console do fornecedor (`apps/console`)

Três perguntas do dia a dia da operação não tinham resposta sem alguém abrir uma
sessão na produção com a `DATABASE_URL` na mão: o município está usando, alguém
está com problema, e há quanto tempo aquele município não dá sinal. Responder
isso com a credencial de dono do banco é o pior caminho possível, e não por
comodidade: **é a credencial que ignora RLS**, e nesta mesma operação ela já foi
usada uma vez para redefinir a senha de um administrador à mão.

A ADR 0006 tinha recusado o "painel de plataforma" por um motivo que continua de
pé: um papel que enxerga todos os municípios contradiz o isolamento, porque
bastaria um token vazado para alcançar todas as prefeituras de uma vez. A ADR
0008 muda a pergunta, não a conclusão: painel de plataforma e credencial que
enxerga todo mundo só são a mesma coisa **quando o painel lê as tabelas de
negócio**.

### A direção do dado é o desenho inteiro

O console não consulta os municípios. **Cada município escreve o próprio
resumo**, numa tabela de métricas, dentro da própria transação, com o mesmo papel
de aplicação de sempre e debaixo do mesmo RLS de sempre. O console só lê essa
tabela.

Quem faz a escrita acontecer é um relógio na API (`apps/api/src/metricas/`), que
sobe sempre, como a minimização por prazo e diferente do push. Ele abre **uma
transação por município** e chama `resumir_municipio()` lá dentro:

```
para cada id de municipios_a_resumir(frescor):     -- só identificadores
  comTenant(id):                                    -- SET LOCAL ROLE dc360_app
    SELECT resumir_municipio()                      -- SECURITY INVOKER, sob RLS
```

`resumir_municipio()` é `SECURITY INVOKER` de propósito: as contagens rodam com
os privilégios e o contexto de quem chama, então cada uma enxerga apenas as
linhas daquele município. Não existe erro de cláusula nessa função capaz de
produzir o número da prefeitura vizinha, porque as linhas da vizinha não estão lá
para serem contadas.

O que a métrica pode conter é contagem, mediana e marca de tempo. O que ela não
pode conter é regra dura: nome, contato, endereço, coordenada, protocolo, relato,
descrição de vulnerabilidade, matrícula. A defesa não é a boa intenção de quem
escrever a próxima migração: as colunas são numéricas, de data ou booleanas, o
único `uuid` permitido é o da organização, e o portão CA-06 varre o **catálogo**
reprovando qualquer coluna de texto, `jsonb` ou segundo `uuid` em relação que o
console consiga ler.

### O papel de banco do console não tem concessão em tabela de negócio

`dc360_console` tem `SELECT` na tabela de métricas, no cadastro de organizações e
na visão que junta as duas. Nada mais, no banco inteiro: sem escrita, sem
sequência, sem função privilegiada, sem `BYPASSRLS`.

Isso não é lista conferida uma a uma, é **asserção universal** em
`db/test/isolamento.test.ts`: nenhum papel além do de aplicação e do dono tem
privilégio em tabela de negócio, por concessão direta, por privilégio de coluna,
por herança de papel, por `PUBLIC`, por visão, por função `SECURITY DEFINER`, e
por fim pelo próprio banco respondendo `has_table_privilege`. A lista a uma vale
para as tabelas de hoje; a asserção vale para a tabela que alguém criar amanhã
sem lembrar disto. O mesmo arquivo prova a outra metade conectando **como** o
console e tentando ler `ocorrencias`, `usuarios`, `evidencias` e `trilha_eventos`:
quem recusa é o Postgres, não uma condição em TypeScript.

A visão que ele lê é `security_invoker`, e isso não é detalhe: sem a opção, ela
rodaria com os privilégios do dono das tabelas e bastaria alguém acrescentar uma
junção com `ocorrencias` ali para o console passar a ler dado de cidadão de todas
as prefeituras, sem tocar em concessão nenhuma. Há um teste que cria duas visões
idênticas, uma com a opção e outra sem, e mostra a sem entregando o endereço.

### O silêncio é um sinal, e não uma linha faltando

Métrica escrita pelo município pode faltar se o município estiver quebrado, e aí
o console mostraria silêncio, que é indistinguível de "ninguém usou hoje". Uma
consulta direta à tabela de métricas produziria exatamente esse engano: o
município quebrado simplesmente não aparece na lista, e ninguém sente falta do
que não está lá.

Por isso o console lê uma **visão que parte de `organizacoes`**. Todo município
aparece sempre, e quem não escreveu aparece com `sem_escrita_recente` verdadeiro,
no topo da tabela, com a palavra "calado" junto do marcador, nunca só por cor.

### Aplicação separada, de verdade

Processo próprio, porta própria, conexão própria, segredo próprio, e **plateia
própria no token**. A separação não repousa no segredo: um teste emite os dois
tokens com a **mesma chave** e o mesmo conteúdo, trocando só a plateia, e mostra
cada lado recusando o do outro. Uma rota nova do produto nasce recusando token de
console, e uma rota nova do console nasce recusando token de município.

O console não tem rota de escrita, não tem CORS (a página é servida pelo próprio
processo), não carrega a `DATABASE_URL` do produto, não tem credencial de
armazenamento, de push nem de email, e não provisiona município: isso continua
sendo linha de comando com a credencial de dono, como a ADR 0006 fixou.

### O segundo fator não é opcional

No município o segundo fator é uma exigência que se liga, e existe um estado
legítimo de "conta ainda sem ele". No console esse estado não existe: a conta do
fornecedor é a única do sistema cujo comprometimento afeta mais de um município.

A exigência é cobrada na **partida**, e não no login: operador sem segredo de TOTP
derruba o processo, porque exigência que só aparece quando alguém tenta entrar
fica desligada nos meses em que ninguém entra. E a primeira etapa do login nunca
devolve sessão, só um desafio de plateia própria que rota de leitura nenhuma
aceita.

O TOTP é o do produto, literalmente: `apps/api/src/auth/totp.ts`, com o mesmo
passo queimado depois de usado e o mesmo `scrypt` para a senha. O console não tem
implementação própria de criptografia.

### Onde moram as contas, e por que não no banco

Na configuração do processo, e isso é consequência do papel de banco ser pobre:
uma tabela de operadores exigiria dar escrita ao console, e escrita é o que separa
"um vazamento entrega números agregados" de "um vazamento entrega uma porta de
escrita no banco de todos os municípios".

O que se perde, dito em voz alta: criar operador é mudança de configuração, e o
passo de TOTP já usado e o contador de tentativas vivem na memória do processo,
não no banco. Reiniciar o processo esquece os dois, e a janela que isso abre é a
de um passo de trinta segundos.

```bash
# 1. Criar o operador. Nada disto vai para o banco: o comando imprime.
CONSOLE_SEGUNDO_FATOR_CHAVE=... npm run provisionar --workspace @dc360/console \
  -- --email coordenacao@fornecedor.com.br

# 2. Subir. Ver apps/console/.env.example para as variáveis e o porquê de cada uma.
npm run dev:console      # http://127.0.0.1:3344
```


## As regras de conteúdo também

`CLAUDE.md` fixa duas que não são estilo e sim risco: nenhum travessão em texto
nenhum, e nenhuma norma além das que `docs/CONTEXTO.md` autoriza. Um número de
lei errado num termo de interdição é motivo para anular o ato, e um artigo
inventado num documento oficial é pior que nenhuma citação.

`packages/shared/test/regras-de-conteudo.test.ts` varre o código do sistema, o
protótipo e a documentação viva. Há uma isenção, e a razão dela importa:
`docs/referencia/` são documentos de **pesquisa**, e o trabalho deles é
justamente levantar normas. Várias que eles citam não estão na lista
autorizada, porque a lista governa o que o produto AFIRMA e não o que a
pesquisa investigou. Apagar citação de pesquisa para satisfazer um teste seria
destruir a evidência que sustentou a decisão.

Sobre artigo, a varredura é mais estreita e mais dura: nos geradores de
documento oficial, nenhum número de artigo passa. Comentário de código pode
falar de artigo; papel com o brasão do município, não.

## O design system é verificado por máquina

`CLAUDE.md` diz que cor, sombra ou duração escritos direto no componente são
bug. Até agora isso dependia de um revisor humano olhar cada mudança, e revisor
humano não olha o diff das duas da manhã.

A razão da regra não é gosto: **cor literal não troca com o tema.** Ela fica
igual no claro e no escuro, e o resultado é texto ilegível num dos dois. Sombra
literal também não acompanha, e sombra clara sobre fundo escuro simplesmente
some. E cada valor solto é um lugar a mais para consertar quando a identidade
mudar, como já mudou uma vez aqui (laranja para violeta).

`apps/web/test/design-system.test.ts` varre o CSS e os estilos escritos dentro
dos componentes. Exceção deliberada é possível, escrevendo um comentário com o
marcador e a razão na linha de cima: assim ela é uma decisão registrada, e não
um valor que ninguém percebeu. O teste tem dois casos que provam as expressões
funcionando e não produzindo falso positivo, para não depender de o código
estar errado para descobrir que a varredura quebrou.

## Acessibilidade também deixou de depender de lembrança

`CLAUDE.md` exige contraste AA, navegação por teclado nos fluxos principais e
estado nunca comunicado só por cor. As três dependiam de um revisor humano
olhar cada tela, e o contraste em particular estava escrito como comentário
dentro de `tokens.css` ("8.98:1 sobre branco"). **Comentário não recalcula.**
Quem escurece um neutro seis meses depois não abre o comentário, e o texto
some sem nada reclamar.

`apps/web/test/acessibilidade.test.ts` calcula. Ele lê `tokens.css`, resolve as
cadeias de `var()`, achata a transparência dos selos sobre a superfície de
baixo (senão o número do tema escuro seria ficção, porque o selo tem 12% de
opacidade) e aplica a fórmula de luminância da WCAG a dezessete pares de
frente e fundo, **nos dois temas**. Onde o alvo não é texto, o mínimo cai para
3:1, e a razão está escrita ao lado do par.

O resto da varredura pega o que dá para pegar na fonte: `onClick` pendurado em
elemento que o teclado não alcança (funciona com mouse, some no Tab), imagem
sem `alt`, `outline: none` sem devolver o anel de foco, e a ausência do atalho
de pular para o conteúdo. Exceção é possível com marcador e razão escrita, como
no portão do design system.

O que a varredura encontrou na primeira execução, e foi corrigido:

- **Não havia atalho para pular a navegação.** Quem usa teclado atravessava os
  onze itens da lateral a cada troca de tela. Agora o primeiro Tab cai num
  atalho que aparece ao receber foco.
- **A foto ampliada era uma armadilha de teclado.** Abria sem levar o foco
  junto, não fechava com Escape, e ao fechar o foco voltava para o início da
  página em vez da miniatura. Os três estão corrigidos e verificados no
  navegador.

Seis mutações confirmaram que o portão morde: clarear um neutro, trocar o
violeta do tema escuro pelo do claro, remover um `alt`, remover o anel de foco,
remover o atalho e pendurar `onClick` numa `div`. As seis reprovaram.

O que ele **não** faz: não substitui teste com leitor de tela nem com pessoa
real. Ele calcula contraste sobre tokens, não sobre pixels renderizados, então
não vê texto sobre imagem nem sobreposição acidental. Substitui a lembrança de
um revisor, que era o que sustentava as regras antes.

## O aplicativo de campo passou a ter os mesmos portões

Os dois portões acima varriam `apps/web/src` e mais nada. O aplicativo não
tinha nenhum, e a diferença não era teórica: a tela de vistoria apagava
fotografia por um botão de 32 pontos, vinte abaixo da régua de 52 que o próprio
`apps/campo/src/ui/tokens.ts` declara, e a barra de abas escrevia `#000000` e
`#FFFFFF` à mão. As mesmas linhas, no painel, reprovariam.

Pior que isso, `tokens.ts` prometia por escrito um portão que ninguém tinha
escrito: dizia que os valores eram cópia de `apps/web/src/estilos/tokens.css` e
que "um teste reprova se divergirem". Promessa de portão é mais perigosa que
portão nenhum, porque quem lê para de conferir à mão.

Os três portões moram em `scripts/`, ao lado de
`entitlements-do-ios.test.mjs`, e não dentro de `apps/campo`. A razão é de
ambiente: o pacote do aplicativo roda em `jest-expo`, que não tem os tipos de
Node, então varredura de arquivo lá dentro significaria empurrar `node:fs` e
`__dirname` para um pacote que não os tem. `npm run test:scripts` já os roda,
e ele está dentro de `npm run verificar`.

| Portão | O que ele cobra |
| --- | --- |
| `portao-design-do-aplicativo` | Cor, raio, duração, peso de fonte e sombra fora de token reprovam, e `Alert.alert` também, com escape nomeado que declara quantas linhas dispensa |
| `portao-acessibilidade-do-aplicativo` | Contraste AA calculado par a par nos dois temas, alvo de toque abaixo de 52 e tocável que o leitor de tela não sabe anunciar |
| `paridade-de-tokens-do-aplicativo` | A paridade prometida: primitiva é igualdade nos dois sentidos, semântico é igualdade por par mapeado, e onde as escalas divergem a divergência é declarada com razão |

Duas coisas valem registro, porque são o que separa portão de decoração.

A primeira é que a varredura apaga COMENTÁRIO antes de medir, e procura o
marcador de exceção na fonte com comentário. Metade dos arquivos do aplicativo
tem parágrafos contando o defeito que a linha abaixo conserta, e vários citam
`Alert.alert` e cores em hexadecimal pelo nome. Portão que pune quem explica
ensina a apagar a explicação.

A segunda é que toda exceção e toda pendência **sabem morrer**. A dispensa de
peso de fonte valia enquanto não existisse token de peso, e um caso reprova no
dia em que ele passar a existir. A pendência de contraste da borda de controle
(1.30:1 no claro e 1.33:1 no escuro, contra os 3:1 da WCAG 1.4.11) aparece na
saída da execução e some obrigatoriamente quando o número passar. Exceção
temporária que ninguém poda é exceção permanente.

A rodada de mutação reintroduziu cada defeito e viu cada portão morder com
mensagem precisa: alvo de 32, rótulo removido, os sete literais de design de
uma vez, primitiva fora por um dígito, primitiva que só existe de um lado,
neutro do tema escuro escurecido, e as duas declarações de dívida consertadas
por baixo.

## Quem manda em quem

`CLAUDE.md` divide o trabalho por papel, e a tabela de permissões diz o que
cada um FAZ. Faltava dizer quem manda em quem, e a ausência tinha uma
consequência concreta: **as listas de `coordenador` e `administrador` eram
idênticas item por item.** Eram dois nomes para a mesma coisa, ninguém era o
teto do município, e qualquer um desfazia o que o outro fez.

O posto resolve isso em `packages/shared/src/permissoes.ts`. Número maior manda
mais, e dele decorre uma regra só: **ninguém administra conta de posto acima do
seu, nem concede papel de posto acima do seu.**

| Papel | Posto | O que isso significa |
| --- | --- | --- |
| Agente de campo | 1 | Registra vistoria. Não administra ninguém. |
| Operador de plantão | 1 | Registra chamado e responde providência. Não administra ninguém. |
| Coordenador | 2 | Manda no fluxo operacional inteiro e administra equipes e usuários **abaixo dele**. |
| Administrador | 3 | Teto do município. Tudo o que o coordenador faz, mais alterar os dados do órgão, e é o único que administra outro administrador. |

O que a regra impede, imposto pelo servidor e não pela tela:

- o coordenador não cria administrador;
- o coordenador não desativa administrador;
- o coordenador não se promove a administrador pela edição;
- **o município não fica sem administrador ativo**, nem por desativação nem por
  rebaixamento.

A última merece explicação, porque parecia coberta e não estava. Existia a
regra de não desativar a própria conta, e ela dava a impressão de garantir o
resto. Não dava: nada impedia o penúltimo administrador de desativar o último.
O município ficaria sem ninguém capaz de criar usuário, e a única saída seria
SQL na mão no banco de produção.

### Acima do administrador não existe papel

Um usuário que enxergasse todos os municípios contradiria o isolamento, que é a
regra número um daqui: bastaria um token vazado para alcançar todas as
prefeituras de uma vez. Por isso **provisionar município é ato de operador da
plataforma**, feito pela linha de comando com a credencial de dono do banco, a
mesma que aplica migração:

```bash
DATABASE_URL=postgres://... npm run provisionar --   --municipio "Serra Alta" --uf MG   --nome "Rita Lopes" --matricula SA-1 --email rita@serraalta.mg.gov.br   --operador "Seu nome, operação da plataforma"
```

Ele cria a organização e o primeiro administrador, sorteia a senha inicial e a
imprime uma única vez. Recusa provisionar o mesmo município duas vezes, porque
o segundo enxergaria zero dados do primeiro e o sintoma seria "o sistema perdeu
tudo", com tudo intacto do lado errado da parede.

Antes disso não havia porta nenhuma: `organizacoes` só era populada pela
semente de desenvolvimento ou por INSERT manual. Na prática o poder máximo do
produto era quem tinha a `DATABASE_URL`, e isso não estava escrito em lugar
nenhum.

## O agente de campo tem a tela dele

O agente entrava no sistema e caía no painel do coordenador: a fila do
município inteiro, o mapa da cidade, a tabela de todas as ocorrências. **Nenhuma
ação disponível**, porque o papel dele não tria, não despacha, não encaminha e
não encerra. Ele via tudo o que não é da conta dele e nada do que é.

`/meu-trabalho` responde as três perguntas que ele faz, na ordem em que faz:

1. **O que é meu agora?** As ocorrências despachadas para a equipe dele, prazo
   correndo, mais urgente primeiro.
2. **O que eu já terminei?** As vistorias que ele assinou, com as duas marcas de
   tempo, que é onde aparece o que foi coletado sem sinal.
3. **Quem é a minha equipe?** Nome, especialidade e colegas.

E a tela diz, em destaque, o que seria desastroso deixar implícito: **este
painel precisa de conexão.** O trabalho sem sinal é o do aplicativo de campo,
que guarda no aparelho e envia sozinho quando o sinal volta. Um agente que
descobrisse isso no barranco perderia a vistoria inteira.

O menu dele também mudou: começa em "Meu trabalho" e não oferece painel nem a
tabela do município, pelo mesmo princípio de menor privilégio do resto do
sistema. E as telas de administração passaram a recusar pela rota, com uma
frase que diz o que fazer, em vez de mostrar o formulário inteiro e negar só no
envio.

## O agente que sobe o morro sozinho

O vocabulário deste produto reconhece, por escrito e desde a migração 028, que o
agente entra em lugar que oferece risco à integridade física dele:
`risco_para_a_equipe` é um dos seis motivos de devolução de tarefa. E não havia
uma única linha de código para o caso de ele ter entrado. Era a maior distância
entre o que o produto SABE e o que ele FAZ.

**A pergunta que decidiu o desenho não é técnica: o que acontece quando ninguém
responde?** Um botão de apoio que aciona alguém que não existe é pior do que
botão nenhum, porque cria expectativa de socorro e a pessoa muda o comportamento
dela contando com uma resposta que não vem.

Então o produto promete só o que cumpre. O agente declara, **antes de subir e com
sinal**, para onde vai, em quanto tempo volta e se vai **sozinho**. O prazo é
carimbado pelo relógio do SERVIDOR. Se o retorno não for confirmado, a saída
aparece como prazo estourado na tela de quem coordena e no sino, e o que a
coordenação fez a respeito entra na trilha, com nome e hora.

E ele diz em voz alta, na tela e em `docs/SEGURANCA-DO-AGENTE.md`, o que não faz:
não é botão de pânico, não detecta queda, não sabe onde a pessoa está agora, não
aciona ninguém sozinho, e não avisa quem não estiver com o painel aberto.

### A assimetria que explica o resto

**O aparelho sem sinal não consegue pedir socorro**, e nenhum software muda isso.
A parte que funciona de verdade é a que acontece ANTES, na base, com sinal. Por
isso declarar a saída **não entra na fila de sincronização**, ao contrário de
tudo o mais que o aplicativo manda: a fila existe para não perder trabalho já
feito, e aqui não há trabalho a perder, há um aviso a entregar. Aviso guardado no
aparelho é aviso que ninguém recebeu, e ele daria ao agente a sensação de estar
coberto exatamente quando ele não está.

Confirmar o retorno exige sinal pela mesma razão, e o efeito parece defeito e é a
definição: **você voltou quando o sistema soube que você voltou.**

### Três decisões que separam isto de um alarme decorativo

| Peça | Decisão | Por quê |
| --- | --- | --- |
| O canal | O sino, e não push | O push sai de um relógio sem ninguém logado, e relógio sem contexto de município precisa de função `SECURITY DEFINER`. O orçamento está em quinze de quinze e o portão CA-06 reprova a décima sexta. O custo (só avisa quem está com o painel aberto) está escrito no guia, não disfarçado |
| Prorrogar | Existe, e é contado | Sem isso, todo serviço que demora mais que o previsto vira alarme falso, e alarme falso repetido é o único jeito conhecido de matar o recurso: a coordenação aprende a ignorar a tela. O novo prazo conta a partir de AGORA, senão uma saída vencida há duas horas continuaria vencida depois de prorrogada |
| "O agente confirmou o retorno" | A coordenação **não** consegue marcar isso | Quem diz "voltei" é quem voltou. Se ela pudesse, a linha afirmaria que o agente confirmou quando outra pessoa decidiu por ele, e é essa a linha que alguém vai ler depois de um acidente |

A palavra da tela é **"prazo estourado"**, nunca "em perigo": o produto sabe que
ninguém teve notícia dele desde o prazo, e não sabe se é um talude cedendo ou uma
bateria acabada. Afirmar perigo numa linha de prova seria afirmar o que ninguém
verificou.

## A superfície da API se defende sozinha

O erro que mais barato custa cometer e mais caro custa descobrir é banal:
alguém adiciona uma rota e esquece `exigirAutenticacao`. Nenhum teste de
funcionalidade pega isso, porque a rota funciona perfeitamente. Ela só funciona
para qualquer um.

`test/superficie.test.ts` lê a árvore de rotas **do servidor montado** e exige
token de todas. As exceções ficam numa lista curta, cada uma com a razão
escrita, e o teste reprova se uma isenção sobrar apontando para rota que já não
existe. É lista de exceções e não de regras de propósito: exceção alguém
revisa, regra alguém esquece.

Verificado adicionando uma rota sem autenticação de propósito: o teste a nomeia
na mensagem de falha.

## Autorização por papel

Quem pode o quê vive em `packages/shared/src/permissoes.ts`, e não numa
condicional de tela. A tela consulta a tabela para decidir o que desenhar; toda
função de escrita do repositório começa por `exigirPermissao`, porque esconder
um botão não impede nada de quem tem o console do navegador aberto. Quando a
API entrar, ela importa a mesma função em vez de redescobrir a regra.

Esta tabela é gerada a partir de `acoesDoPapel`, e um teste reprova se ela
divergir do código. Ela já mentiu antes: dizia que o administrador fazia "o
mesmo que o coordenador", o que deixou de ser verdade no dia em que o sistema
de postos entrou, e ninguém percebeu porque documentação não quebra build.

<!-- permissoes: gerado a partir de packages/shared/src/permissoes.ts -->

| Papel | Pode |
| --- | --- |
| Operador de plantão | registrar ocorrência, registrar a resposta de uma providência, acompanhar quem está em campo agora |
| Agente de campo | registrar vistoria |
| Coordenador | registrar ocorrência, classificar na triagem, despachar equipe, encaminhar providência, registrar a resposta de uma providência, encerrar ocorrência, emitir laudo ou termo de interdição, gerenciar equipes, gerenciar usuários, consultar a trilha de auditoria, exportar dados, acompanhar quem está em campo agora |
| Administrador | alterar os dados do município, registrar ocorrência, classificar na triagem, despachar equipe, encaminhar providência, registrar a resposta de uma providência, encerrar ocorrência, emitir laudo ou termo de interdição, gerenciar equipes, gerenciar usuários, consultar a trilha de auditoria, exportar dados, acompanhar quem está em campo agora |

O administrador NÃO é um coordenador com outro nome. Ele é o único que altera
os dados do município, e o sistema de postos impede que qualquer pessoa
gerencie uma conta de posto acima do seu: coordenador não rebaixa
administrador, e ninguém se promove.

Consultar a trilha e exportar a base ficam com coordenação e administração: são
as ações que alcançam o município inteiro de uma vez. Emitir laudo e termo de
interdição entrou na mesma lista, e por motivo parecido: o documento reúne numa
página só o nome, o contato, o endereço, a vulnerabilidade da família e todas
as fotos da casa. Cada pedaço já circula em algum lugar; a concentração é que
muda a natureza da coisa.

O operador também registra a resposta de uma providência: é ele quem atende o
telefone quando a secretaria liga de volta. Continua sem decidir o fluxo.

E ele **acompanha quem está em campo**, que é a única permissão concedida ao
posto mais baixo por uma razão que não é de fluxo. O valor inteiro daquele
recurso é alguém enxergar o prazo estourado, e quem está na sala às três da manhã
de uma noite de temporal é o operador de plantão. Restringir à coordenação seria
escolher a elegância da tabela contra a finalidade da coisa, e o custo do erro é
um agente no morro sem ninguém olhando.

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

### O primeiro município, do zero

Na ordem, e nenhum passo é opcional:

```bash
# 0. Papeis do banco. Provado contra PostgreSQL 18 real; sem isto a API sobe e
#    o login responde "credenciais invalidas" sem erro no log, e o diagnostico
#    leva horas. Sao TRES competencias, e a aplicacao usa a terceira:
#
#    - QUEM MIGRA E DONO DAS FUNCOES DE AUTENTICACAO: precisa de CREATEROLE (a
#      migracao 001 cria o papel dc360_app) e de BYPASSRLS. O BYPASSRLS nao e
#      luxo: credenciais_para_login e sessao_por_token sao SECURITY DEFINER e
#      rodam como o dono; a autenticacao e cross-tenant por natureza (nao se
#      sabe a organizacao antes de autenticar), e com RLS FORCADA o dono
#      tambem e filtrado pelas policies. Sem BYPASSRLS a funcao de login
#      devolve zero linhas.
#    - QUEM SERVE (a aplicacao): um login proprio, membro de dc360_app COM SET,
#      sem superusuario, sem BYPASSRLS, nao dono. E este que vai na DATABASE_URL
#      da API.
#
#    Em Postgres gerenciado (Neon, Supabase, RDS) o papel administrativo que o
#    provedor entrega ja tem CREATEROLE e BYPASSRLS: use-o como dono/setup.
#
#    CREATE ROLE dc360_setup LOGIN PASSWORD '...' CREATEROLE BYPASSRLS NOSUPERUSER;
#    CREATE ROLE dc360_api   LOGIN PASSWORD '...' NOSUPERUSER;
#    -- como dono do banco/schema:
#    ALTER SCHEMA public OWNER TO dc360_setup;
#    -- depois de migrar (passo 2), o papel dc360_app ja existe:
#    GRANT dc360_app TO dc360_api WITH SET TRUE;

# 1. Ambiente. O modelo lista tudo, diz o que é obrigatório em produção e por quê.
cp apps/api/.env.example apps/api/.env && $EDITOR apps/api/.env

# 2. Esquema, com o papel de SETUP (CREATEROLE + BYPASSRLS).
DATABASE_URL=postgres://dc360_setup:...@host/dc360 npm run migrar

# 3. O município e o primeiro administrador, com o papel de SETUP (o provisionar
#    insere em organizacoes, que so o BYPASSRLS alcanca). Anote a senha que ele
#    imprime: ela não é guardada em texto claro e não aparece de novo.
DATABASE_URL=postgres://dc360_setup:...@host/dc360 npm run provisionar --   --municipio "Serra Alta" --uf MG   --nome "Rita Lopes" --matricula SA-1 --email rita@serraalta.mg.gov.br   --operador "Seu nome, operação da plataforma"

# 4. Suba a API e o painel. A DATABASE_URL da API e a do papel de APLICACAO
#    (dc360_api), nunca a do setup: a API nao pode ter CREATEROLE nem BYPASSRLS.
#    E ela PRECISA terminar em ?sslmode=verify-full: a URL que o painel do
#    provedor oferece nao traz esse parametro, e sem ele a conexao com o banco
#    sobe cifrada e NAO autenticada, com a base de todos os municipios exposta
#    para leitura e escrita a quem estiver no meio do caminho. A ancora de
#    confianca ja vem versionada em db/provedores/, entao nao ha mais nada a
#    configurar, e a partida em producao recusa subir sem o parametro.
#    DATABASE_URL=postgres://dc360_api:...@host/dc360?sslmode=verify-full
```

O que a pessoa faz na primeira entrada, e é o passo que se esquece: abrir
**Minha conta**, pelo nome dela no topo do painel, e trocar a senha ditada por
telefone. A troca derruba as outras sessões e não depende de email, que é o
que ainda não existe.

A partir daí o administrador cria o resto do município pela tela de usuários.
Ele é o teto: ninguém acima dele existe como papel, e provisionar outro
município é de novo linha de comando, com a credencial de dono do banco. Ver
"Quem manda em quem".

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
npm test                    # 1508 testes em seis pacotes
npm run test:isolamento     # portão CA-06 e o aplicador de migrações: 159 testes do banco
npm run test:api            # 736 testes da API
npm run test --workspace @dc360/campo   # 138 testes do motor de campo
npm run test:campo          # tipos e os 1167 testes do aplicativo de campo
npm run typecheck           # TypeScript estrito em todos os pacotes
npm audit                   # precisa fechar em zero
```

### O aplicativo de campo precisa de um comando próprio

`apps/campo` fica fora do `workspaces` de propósito (o motivo está em "O que
falta", mais abaixo), e o efeito colateral é que `npm test` na raiz não o
alcança: nada do que os cinco workspaces somam vem do aplicativo. Por isso
existe `npm run test:campo`, que compila os pacotes compartilhados de que o
aplicativo depende, roda o TypeScript estrito dele e executa os testes.

Ele **falha** se `apps/campo/node_modules` não existir, em vez de pular calado.
Pular calado é como portão vira decoração, e a máquina sem as dependências
instaladas é justamente aquela em que o aplicativo nunca foi verificado. Quem
está mexendo só na API e não quer baixar o React Native tem escape, mas
precisa dizê-lo em voz alta:

```bash
npm ci --prefix apps/campo   # o caminho normal
DC360_SEM_APP=1 npm run test:campo   # ou pule, e veja escrito que pulou
```

Os números que este README afirma são conferidos por máquina:

```bash
npm run conferir:numeros
```

Ele pergunta ao vitest quais testes existem (`vitest list`, que enumera sem
executar), conta as verificações de navegador pelas chamadas de `ok(` nas
suítes de ponta a ponta, e exige que **todo número seguido de "teste" ou
"verificação" em qualquer markdown deste diretório** corresponda a uma
contagem real. Fica fora de `npm test` porque chama o vitest, e chamar o
vitest de dentro do vitest pendura o processo.

O aplicativo de campo é contado de outro jeito, e a diferença é honesta: ele
roda no jest, que não tem equivalente de `vitest list` (`--listTests` lista
arquivos, não casos), e o trabalho de integração contínua que confere os
números nem instala as dependências dele. Então o script lê o código e conta
`it(` e `test(` abrindo linha, resolvendo `it.each` pela tabela para não
contar uma linha onde o jest conta duas. Quando não consegue resolver uma
tabela, ele **estoura** em vez de devolver um número menor.

Ler código é aposta, e aposta sem árbitro envelhece. O árbitro é o
`npm run test:campo`: ele pede o relatório JSON ao jest e cruza o número
executado com o número lido, no único comando que sabe que o aplicativo está
instalado. As duas contas divergiram na primeira versão (34 contra 42, três
`it.each` de dois temas cada) e o README teria afirmado um número falso.

Antes de tudo isso, o README não podia afirmar nenhum número conferível sobre
o aplicativo: a única linha que falava dele contava verificação do
`expo-doctor`, que não mede comportamento nenhum.

<!-- numeros: nao sao contagem -->
Ele existe porque a precisão deste documento é a única coisa que o torna útil,
e na primeira execução encontrou cinco números envelhecidos: a tabela do topo
dizia 29 testes de banco (eram 42), 83 da API (eram 123) e 7 de integração do
campo (eram 10); o bloco de comandos dizia 28 do motor de sincronização (eram
46); e o LEIA-ME do aplicativo dizia 34 de unidade (eram 46).

<!-- numeros: nao sao contagem -->
Uma armadilha da primeira versão vale registrar, porque é o tipo de coisa que
faz um portão passar verde sem verificar nada: a lista de isenções casava por
pedaço de texto, e a isenção `"2 testes"` casou dentro de `"242 testes"`,
desligando em silêncio a afirmação mais importante do documento. Isenção agora
é um marcador explícito na linha, nunca um trecho solto.

Fluxo ponta a ponta no navegador, modo local:

```bash
npm run build --workspace @dc360/web
cd apps/web && npx vite preview --port 4173 --strictPort   # deixe rodando
npm run test:e2e                                            # em outro terminal
MOTOR=firefox npm run test:e2e                              # e no Gecko
```

A variável `MOTOR` troca o motor do navegador (`chromium`, `firefox`,
`webkit`). As 58 verificações passam no Chromium, que é o motor do Chrome e do
Edge, e no Firefox. Sobre o WebKit, leia a seção seguinte antes de tentar.

### O modo local não serve para o Safari

Medido, não suposto: no motor do Safari o Postgres em WebAssembly com
persistência em IndexedDB leva **163 segundos** para abrir. Não trava, termina,
quase três minutos depois. No Chromium e no Firefox o mesmo banco abre em
poucos segundos.

Antes disso ser medido, o sintoma era uma tela de entrada parada para sempre em
"Preparando o banco de dados local", sem barra de progresso, sem erro e sem
nada para o usuário procurar. **A pior forma de falhar é a que não se
distingue de estar funcionando.**

O que mudou por causa disso, em `apps/web/src/dados/banco.ts`:

- **Teto de vinte segundos para o banco abrir.** Passou disso, a persistência é
  considerada indisponível e o banco sobe em memória, o que leva pouco mais de
  um segundo. A demonstração fica de pé em torno de vinte e um segundos em vez
  de cento e sessenta e três, ao custo de perder o dado ao fechar a aba.
- **A tela declara a troca.** Um aviso na entrada diz que este navegador não
  guardou o banco entre visitas e que o que for feito ali some. Sem o aviso,
  alguém cadastraria meia hora de dado numa demonstração e descobriria depois.
- **A semeadura ignora a marca do `localStorage` quando o banco é de memória.**
  A marca sobrevive ao recarregamento, o banco não; sem essa distinção a
  segunda visita abriria um banco vazio dizendo que já tinha sido semeado.
- **Prova de escrita na abertura.** Uma transação real, com o papel
  `dc360_app`, o contexto de organização e um INSERT numa tabela com RLS,
  desfeita por `rollback`. Um banco que sobe mas não aceita escrita passa a
  falhar na abertura, não no meio de um cadastro.
- **Nenhum teto por operação, de propósito.** O PGlite roda na thread
  principal: enquanto o WebAssembly trabalha, nenhum `setTimeout` dispara. Um
  teto ali não interromperia nada e, quando disparasse, acusaria de travada uma
  operação que ainda vai terminar. No Safari uma gravação leva mais de vinte
  segundos e conclui.

Mesmo com tudo isso, **o modo local no Safari é lento a ponto de parecer
travado** em cada escrita. Para Mac e iPad, use o painel ligado à API, onde o
banco é o do servidor e o navegador só desenha.

Fluxo ponta a ponta com a API, que é o caminho de produção:

```bash
# terminal 1: API recém-iniciada (a suíte confere contagens exatas)
cd apps/api && JWT_SEGREDO="pelo-menos-trinta-e-dois-bytes-aqui"   ORIGENS_PERMITIDAS=http://localhost:4173 npx tsx src/index.ts

# terminal 2
cd apps/web && VITE_API_URL=http://127.0.0.1:3333 npx vite build   && npx vite preview --port 4173 --strictPort

# terminal 3, com LOG_API apontando para onde o terminal 1 está escrevendo
LOG_API=/caminho/do/log-da-api npm run test:e2e:api --workspace @dc360/web
```

`LOG_API` é necessário porque a recuperação de senha ainda não tem provedor de
email: em desenvolvimento o link sai no log do servidor, e é de lá que a suíte
o lê.

São 103 verificações que só existem neste caminho: entrada por senha, senha
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

São 58 verificações: entrada, isolamento entre municípios visto dos dois lados,
geração de protocolo em sequência, triagem, despacho, encerramento com motivo
obrigatório, indicadores do painel reagindo às mudanças, cadastro de equipes e
usuários com recusa de duplicata, mapa, restrição de menu por papel, tema
escuro nas duas pontas (inclusive na tela de entrada) e persistência entre
recarregamentos, mais as garantias de acessibilidade: selo com ícone, marcador
de mapa com forma própria por severidade, erro de campo com `role="alert"` e
`aria-describedby`, e a navegação por teclado: o primeiro Tab caindo no atalho
de pular para o conteúdo, o atalho aparecendo ao receber foco e levando de fato
ao conteúdo, e todo item da lateral alcançável sem mouse. O teste também falha
se aparecer qualquer erro no console.

Na primeira vez: `npx playwright install chromium`.

## RLS não cobre chave estrangeira

Este é o achado que mais custou a aparecer, e vale registrar por extenso.

Row Level Security governa `SELECT`, `INSERT`, `UPDATE` e `DELETE`. Ela **não**
governa a verificação de chave estrangeira: o Postgres confere a existência da
linha referenciada com privilégio de sistema, por baixo da policy. Na prática,
antes da migração 008 dava para:

- vincular uma ocorrência de Serra Alta a uma de Vale Fundo;
- despachar para uma equipe de outra prefeitura;
- gravar vistoria apontando para ocorrência que o município não enxerga;
- **assinar um evento da trilha com um servidor de outro município** , o pior
  dos casos, porque a trilha é a prova de quem fez o quê.

Nada disso aparecia em teste de leitura, porque a linha continuava invisível.
E o estrago tinha duas naturezas: dado incoerente gravado, e um oráculo de
existência (o insert passa se o identificador existe lá, falha se não existe),
que é exatamente o vazamento que a resposta 404 no lugar de 403 existe para
impedir na API, só que pela porta dos fundos.

**A correção é chave estrangeira composta**, com `organizacao_id` nos dois
lados. O banco passa a exigir que pai e filho sejam do mesmo município, e a
garantia deixa de depender de o desenvolvedor lembrar de consultar antes de
inserir. O custo é uma restrição de unicidade em `(organizacao_id, id)`,
redundante com a chave primária: é o preço da garantia.

Cinco testes do portão CA-06 cobrem isso, e foi verificado que os cinco
reprovam se a migração 008 for removida.

## O portão CA-06

`db/test/isolamento.test.ts` é o teste que bloqueia merge. Ele responde uma
pergunta só: com o contexto de um município, é possível ler, alterar ou criar
dado de outro?

**Ele descobre o que verificar, em vez de conferir uma lista.** A versão
anterior enumerava as tabelas à mão, e o efeito foi silencioso duas vezes:
`sessoes` (migração 002) e `exportacoes` (migração 007) ficaram fora do portão
até alguém lembrar de acrescentá-las. Um portão que depende de memória não é
portão.

Hoje ele pergunta ao banco e exige, de toda tabela que existir:

| Invariante | Por que ela é invariante |
| --- | --- |
| RLS ativada **e forçada** | Sem `FORCE`, o dono da tabela ignora a policy |
| Ao menos uma policy, e toda expressão citando `app_organizacao_atual()` | Uma policy `USING (true)` passaria no teste anterior e não isolaria nada |
| Coluna `organizacao_id` obrigatória | Sem ela não há em que a policy se apoiar |
| Toda referência entre tabelas de negócio inclui `organizacao_id` | Chave estrangeira roda por baixo do RLS; ver a seção acima |

E das funções `SECURITY DEFINER`, que são portas abertas na parede do RLS:

| Invariante | Por que |
| --- | --- |
| Todas fixam `search_path` | Sem isso, quem controla o search_path faz a função chamar código dele com privilégio de dono. É a escalada clássica, e não precisa de bug no SQL |
| Nenhuma executável por `PUBLIC` | O padrão do Postgres é conceder `EXECUTE` a PUBLIC: esquecer o `REVOKE` abre a função para qualquer papel conectado |
| No máximo doze | Se o número disparar, alguém está resolvendo com privilégio o que deveria resolver com contexto |
| `dc360_app` não é superusuário, não ignora RLS e não é dono de tabela | Se fosse, todo o resto viraria enfeite |

Verifiquei o portão contra migrações descuidadas de propósito: uma tabela nova
sem RLS, uma com RLS mas com chave estrangeira simples, e uma função
`SECURITY DEFINER` sem `search_path`. Cada uma reprova no teste que existe para
ela, sem ninguém precisar lembrar de nada.

Ele roda em PGlite justamente para não depender de Docker. O teste que protege o
isolamento não pode ser o que alguém pula porque a infraestrutura não subiu.

Detalhe que faz o teste valer alguma coisa: o superusuário do Postgres ignora
RLS. Por isso tudo que simula a aplicação roda com `SET LOCAL ROLE dc360_app`, o
mesmo papel sem privilégio que a API usará em produção.

## Integração contínua

`.github/workflows/verificar.yml` roda a cada push e a cada pull request, em
cinco trabalhos paralelos:

<!-- numeros: nao sao contagem -->
| Trabalho | O que ele impõe |
| --- | --- |
| Testes, tipos e auditoria | TypeScript estrito, o portão CA-06 sozinho e primeiro, a suíte inteira, `npm audit` em zero e os números do README conferidos |
| Fluxo no navegador | O painel de ponta a ponta, em Chromium e em Firefox |
| Pacote da demonstração | O zip montado, extraído e percorrido pelo roteiro de dez minutos nos dois motores |
| A API sobe contra Postgres real | Migração, idempotência e `/saude` respondendo, com o papel restrito de aplicação |
| Aplicativo de campo | TypeScript, os testes do aplicativo, árvore de dependência coerente, as 21 verificações do `expo-doctor` e auditoria própria |

O CA-06 roda separado e antes de tudo de propósito: isolamento entre
municípios é a regra número um, e se ela quebrar nada mais importa.

Na máquina, o mesmo se pede com `npm run verificar` e
`scripts/conferir-demo.ps1`. O `verificar` inclui `npm run test:campo`: por um
bom tempo ele não incluía, e o aplicativo era medido só no runner. Portão que
existe apenas na integração contínua é portão que se descobre quebrado depois
do push, e a essa altura o conserto custa uma volta inteira.

`npm run test:scripts` fecha o círculo: são os testes dos próprios scripts de
portão, no executor embutido do node. Eles cobrem a regra (quando falhar,
quando pular, como contar) e também a fiação, que é onde o defeito estava: a
regra podia estar impecável e continuar sem ser chamada por comando nenhum.

## O que falta, e por quê

- **Rodar o aplicativo de campo num aparelho.** Ele está inteiro: telas,
  coleta offline, câmera, GPS, assinatura no dedo, fila de envio, ícones e a
<!-- numeros: nao sao contagem -->
  configuração das duas lojas. Compila, passa nas 21 verificações do
  `expo-doctor` e fecha o `npm audit` em zero. O que falta é o que só o
  aparelho responde: como a câmera, o GPS e o traço na tela se comportam de
  verdade, e a prova de que o `expo-sqlite` guarda o que promete quando o

  Essa última já tem 138 testes do motor de campo cobrindo a lógica fora do
  celular, inclusive retomada arquivo a arquivo.
  `apps/campo` fica **fora do `workspaces`** de propósito: o Expo traz quase
  seiscentos pacotes, e deixá-lo fora mantém rápido o `npm install` da raiz e
  desacopla o `npm audit` do produto do ciclo do React Native. Ele tem o
  próprio lockfile e a própria auditoria, que também fecha em zero. O preço
  dessa separação é que nenhum comando da raiz o enxerga de graça: quem o
  alcança é `npm run test:campo`, e ele está dentro de `npm run verificar`.
- **Conta de desenvolvedor nas lojas.** `apps/campo/LOJAS.md` cobre Play
  Console e App Store Connect passo a passo, com os textos da ficha prontos e
  o formulário de segurança de dados respondido linha a linha. Dois itens têm
  prazo longo e independem de código: a verificação de identidade da
  organização na Google e o número D-U-N-S exigido pela Apple.
- **Conta no provedor de armazenamento.** O código está pronto e testado
  contra o vetor oficial da AWS, mas nunca falou com um R2 ou S3 de verdade:
  isso só se comprova com credencial em mão.
- **Conta no provedor de email.** O provedor foi escolhido (Resend) e o cliente
  fala o contrato publicado dele, com teste conferindo o corpo do pedido campo
  a campo. O que falta é a conta: criar, verificar um domínio da prefeitura no
  DNS, gerar a chave de envio e preencher as variáveis. O passo a passo está em
  `docs/LIGAR-O-EMAIL.md`. Até isso acontecer, `EMAIL_ATIVO=nao` e
  `RECUPERACAO_ATIVA=nao`, e quem precisa trocar a senha troca por dentro, em
  "Minha conta", sem depender de email.
- **Captura da assinatura no aparelho.** O caminho de saída está pronto e
  testado: o documento lê a chave, confere se os bytes chegaram, assina uma
  URL de vida curta e desenha o traço acima da linha, no laudo e no termo. O
  que falta é quem produz, que é o dedo na tela do aplicativo de campo.
- **Mapa cartográfico.** MapLibre GL JS depende de um provedor de tiles, que é
  custo recorrente por carregamento. Entra junto com a decisão de provedor. O
  que já existe plota as coordenadas reais gravadas.
- **Armazenamento de evidência.** A regra de chave por tenant já está no banco;
  falta o bucket. O levantamento aponta Cloudflare R2 por causa do egress.
- **PostGIS.** A migração ainda não cria a extensão porque nada hoje faz
  consulta espacial. Entra quando entrar busca por raio ou por setor de risco.
- **Desligar o segundo fator de OUTRA pessoa.** Hoje cada um cuida do próprio:
  quem administra redefine senha de terceiro, mas não desliga a verificação em
  duas etapas de ninguém. Para quem perdeu o telefone, a saída são os códigos
  de recuperação, e ela cobre o caso; para quem perdeu o telefone E os códigos,
  não há caminho pela tela. A rota é pequena (`exigirPermissao` mais
  `exigirPostoParaGerir`, como a redefinição de senha já faz), e ficou de fora
  deste turno de propósito: ela é uma porta para retirar a proteção de uma
  conta alheia, e merece o cuidado inteiro em vez do fim de um turno.
- **PDF em job assíncrono.** Hoje o PDF é gerado na própria requisição, o que
  serve para um laudo por vez. Quando alguém exportar a fila inteira, isso
  precisa virar fila com download por link, como o levantamento prevê. A porta
  `GeradorDePdf` já está no lugar para a troca.

## Onde estão as decisões

- Stack, multi-tenancy, protocolo offline e régua de segurança:
  `../docs/referencia/LEVANTAMENTO_TECNICO_JURIDICO_GOVTECH.md`
- Regras de trabalho e o que vale na raiz contra o que vale aqui:
  `../CLAUDE.md`
