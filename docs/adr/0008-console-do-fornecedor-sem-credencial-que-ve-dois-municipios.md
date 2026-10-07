# ADR 0008: console do fornecedor sem credencial que enxergue dois municípios

- **Data da decisão:** 09/09/2026
- **Situação:** aceita, em vigor
- **Suplanta:** ADR 0006 no ponto "não existe painel de plataforma"
- **Depende de:** ADR 0001, ADR 0002

## Contexto

A ADR 0006 fechou duas portas de propósito, e nomeou a segunda como consequência
ruim assumida:

> **Não existe painel de plataforma.** Quantos municípios existem, quantos
> usuários ativos, quem está usando: nada disso tem tela, e responder essas
> perguntas hoje é consulta SQL.

Passados dezenove dias, essa consequência deixou de ser teórica. O produto está
de pé com um município real, e três perguntas do dia a dia da operação não têm
resposta sem alguém abrir uma sessão com a `DATABASE_URL` na mão:

1. O município está usando? Quantos chamados entraram esta semana, quantas
   vistorias saíram, quantas ocorrências estão atrasadas agora.
2. Alguém está com problema? Erro repetido, fila de sincronização parada,
   aparelho que não sincroniza há dias.
3. Quantos contratos existem, e quais estão perto de vencer.

Responder isso abrindo `psql` na produção é o pior caminho possível, e não por
comodidade: **é a credencial de dono do banco, que ignora RLS.** Cada consulta
de rotina passa a exigir a mão na chave mais poderosa do sistema. Nesta mesma
operação isso já aconteceu uma vez, para redefinir a senha de um administrador,
e foi o que motivou a rota de redefinição do turno T5. O padrão se repete: toda
lacuna de ferramenta vira um `UPDATE` manual em produção.

A ADR 0006 antecipou a pressão e recusou a saída óbvia:

> A saída comum para o segundo problema é criar um papel de super-administrador
> que enxerga todos os municípios. Essa saída contradiz frontalmente o ADR 0001:
> bastaria um token vazado para alcançar todas as prefeituras de uma vez.

**Essa recusa continua de pé, inteira.** O que esta ADR muda não é a conclusão,
é a pergunta. A 0006 tratou "painel de plataforma" e "credencial que enxerga
todo mundo" como a mesma coisa, e elas não são: só são a mesma coisa quando o
painel lê as tabelas de negócio.

## Decisão

**Existe console do fornecedor. Não existe credencial que leia dado de negócio
de dois municípios.** As duas frases convivem por quatro decisões, e nenhuma
delas é opcional.

### 1. O console é aplicação separada, com banco de dados separado

Não é rota do painel, não é papel novo, não é tela escondida atrás de uma
condição. É outro processo, com outro domínio, outro segredo de token e outra
conexão. Uma falha de autorização no painel do município não alcança o console,
e um vazamento do console não traz consigo uma sessão de município.

### 2. O console lê MÉTRICA, e a métrica é escrita pelo próprio município

Esta é a decisão que resolve a contradição, e é onde uma versão anterior deste
plano estava errada: ela mandava o console "consultar as métricas de cada
município", o que exige exatamente a credencial que não pode existir. O teste
que ela previa ficaria verde e falso.

A direção do dado se inverte. Cada município **escreve** o próprio resumo numa
tabela de métricas, dentro da própria transação, com o mesmo papel de aplicação
de sempre. O console só **lê** essa tabela.

O que a métrica pode conter: contagens, somas, medianas, marcas de tempo,
identificador da organização. O que ela **não pode** conter, e isto é regra
dura: nome, contato, endereço, coordenada, protocolo, relato, descrição de
vulnerabilidade, matrícula, nada que identifique pessoa ou imóvel. Se a resposta
a uma pergunta do console exige um desses campos, a pergunta é do município e se
faz no painel dele, não aqui.

Consequência aceita e escrita: o console nunca responde "o que houve na
ocorrência 000123". Ele responde "entraram 41 chamados, 8 estão atrasados". Para
a primeira pergunta existe telefone com o administrador do município, e é assim
que deve ser.

### 3. O papel de banco do console não tem concessão em tabela de negócio

O console conecta com papel próprio, que tem `SELECT` na tabela de métricas e no
cadastro de organizações, e **nada** em nenhuma outra tabela. Sem `SELECT`,
`INSERT`, `UPDATE`, `DELETE`, sem uso de sequência, sem execução de função que
alcance tabela de negócio, e sem `BYPASSRLS`.

Isso vira **asserção universal em teste**, e não lista de tabelas conferida uma
a uma: nenhum papel além do papel de aplicação e do dono tem privilégio em
tabela de negócio, por concessão direta, por herança de papel, por `PUBLIC`, por
visão, por função com `SECURITY DEFINER`, nem por privilégio de coluna. A lista
a uma vale para as tabelas de hoje; a asserção universal vale para a tabela que
alguém criar amanhã sem lembrar desta ADR.

### 4. Segundo fator obrigatório, e trilha nos dois lados

Acesso ao console exige segundo fator, sem exceção e sem "por enquanto não".
A conta do fornecedor é a única do sistema cujo comprometimento afeta mais de um
município, ainda que só em métrica agregada.

Provisionar município continua sendo o que a ADR 0006 definiu: linha de comando
com a credencial de dono. O console **dispara** o provisionamento e **não**
carrega a credencial: ele registra a intenção, e quem tem acesso ao servidor
executa. O que muda é que a linha espelho na trilha passa a ser escrita **dentro
da função de provisionamento**, na mesma transação, e não por um segundo passo
que alguém pode esquecer de rodar.

#### Emenda de 14/09/2026: o console cadastra a prefeitura, e continua sem a credencial

O desenho de "registra a intenção e alguém executa" nunca foi implementado, e o
que existiu no lugar dele foi o comando de linha rodado com a `DATABASE_URL` de
dono na mão. É o mesmo padrão que esta ADR nomeia como o problema: a ausência de
ferramenta não elimina a operação, ela empurra a operação para o caminho mais
perigoso. Cadastrar o primeiro cliente de um contrato é o ato mais previsível da
operação, e ele estava exigindo a chave mais poderosa do sistema.

O console passa a ter tela para cadastrar prefeitura e o primeiro administrador
dela, e a senha inicial é mostrada uma vez para quem cadastrou entregar à
pessoa. **A frase "não existe credencial que leia dado de negócio de dois
municípios" sai intacta**, e a decisão 3 também: o papel `dc360_console`
continua sem um privilégio sequer em tabela de negócio.

O que ele ganhou foi `EXECUTE` em UMA função `SECURITY DEFINER` (migração 036),
dona = dono das tabelas, que cria organização, primeiro administrador e a linha
espelho na trilha numa transação só, e devolve dois `uuid`. A diferença entre
isso e a credencial que esta ADR recusa é a forma da função, e ela é cobrada em
teste, caso a caso:

- a saída são dois identificadores recém-criados, e não há como devolver linha
  de tabela nenhuma;
- nenhum parâmetro é filtro: todos são valor a ser gravado, e não há SQL montado
  em texto;
- o corpo não nomeia tabela de negócio nenhuma além das três que escreve;
- depois de usá-la, o console continua recebendo "permissão negada" ao tentar
  ler o administrador que acabou de criar.

A asserção universal da decisão 3 passa a ter uma exceção **nomeada**: além do
`SELECT` do console nas duas tabelas e na visão, o `EXECUTE` dele nessa função.
A exceção é por nome, então uma segunda função concedida ao console reprova o
teste até alguém escrever o nome dela na lista, o que aparece na revisão.

A senha inicial não fica em texto claro em lugar nenhum: ela é sorteada no
processo do console, derivada com o `scrypt` do produto, e o que chega ao banco
é o hash (a função **recusa** o que não tiver esse formato, para o dia em que
alguém trocar os dois). Ela não vai para o log e não vai para a trilha.

## Consequências

Boas:

- Continua não existindo credencial de aplicação que leia dado de negócio de
  mais de um município. A ADR 0001 sai intacta, e o teste de isolamento continua
  sendo o portão.
- As perguntas de operação saem do `psql` em produção. A credencial de dono
  volta a ser usada para o que ela é: migração e provisionamento.
- Um vazamento do console entrega números agregados, não pessoas. O dano tem
  teto, e o teto está escrito.

Ruins, e assumidas:

- **O console é limitado de propósito, e vai frustrar.** A primeira vez que um
  município ligar dizendo "sumiu uma ocorrência", o console não vai ajudar. A
  resposta certa é atendimento com o administrador do município, e a errada é
  afrouxar a regra 2. Quem afrouxar reabre a contradição com a ADR 0001.
- **Cadastrar prefeitura é, agora, o único ato de escrita do console**, e ele é
  irreversível na prática: município não se apaga, se encerra com motivo, e a
  linha de nascimento na trilha é append-only. Por isso a rota tem teto próprio
  e baixo por endereço, e por isso ela fica atrás da sessão com segundo fator
  como qualquer outra. Uma sessão do fornecedor comprometida cria prefeituras
  fantasma que alguém vai ter que encerrar à mão; ela continua não lendo dado de
  cidadão nenhum, que é o teto de dano que esta ADR estabelece.
- **Métrica escrita pelo município pode mentir se o município estiver quebrado.**
  Se a escrita da métrica falhar, o console mostra silêncio, e silêncio é
  indistinguível de "ninguém usou hoje". Por isso a métrica carrega marca de
  tempo da última escrita, e ausência de escrita recente é ela própria um sinal
  na tela, e não uma linha vazia.
- **Mais uma aplicação para manter, implantar e proteger**, com o segundo fator
  que o resto do produto ainda não tem.
- A tabela de métricas é dado novo com regra de retenção própria, que precisa
  entrar na política de privacidade junto com o resto.

## Alternativas descartadas

| Alternativa | Por que não |
| --- | --- |
| Papel de super-administrador no painel | O mesmo motivo da ADR 0006, que continua valendo: um token vazado alcançaria todas as prefeituras. Recusada por princípio. |
| Console lendo as tabelas de negócio com papel `BYPASSRLS` só de leitura | É a credencial proibida com outro nome. Leitura basta para vazar: o dado sensível deste produto é lido, não escrito. |
| Console consultando cada município com a credencial dele | Exigiria guardar credencial de todos os municípios num lugar só, que é pior que uma credencial única: é N. |
| Continuar sem console, como na ADR 0006 | Foi o que produziu `UPDATE` manual em produção com a credencial de dono. A ausência de ferramenta não elimina a operação, ela empurra a operação para o caminho mais perigoso. |
| Réplica de leitura anonimizada do banco inteiro | Anonimização de endereço e coordenada em dado de Defesa Civil é reversível na prática: o par tipo mais data mais bairro já identifica o imóvel. Anonimizar de verdade produziria exatamente a métrica agregada da decisão 2, com muito mais maquinaria. |

## Onde isto vive

- Suplanta o ponto "não existe painel de plataforma" da
  `docs/adr/0006-administrador-e-o-teto-do-municipio.md`. O resto da 0006
  (postos, teto do município, provisionamento por linha de comando) continua em
  vigor e não foi tocado.
- A asserção universal de privilégio é teste de banco, e ela roda junto do
  critério CA-06, em `dc360/db/test/`.
- A implementação é o turno T10 do plano de execução. Esta ADR é escrita
  **antes**, no primeiro commit do bloco, porque a decisão que ela registra é
  justamente a que impede o console de nascer errado.

## Nota de revisão de 2026-10-07 (V2-F00-E22)

Esta nota não reescreve a decisão acima: ela registra onde o texto deixou de
descrever o código, conferido contra a árvore em 2026-10-07. A decisão nova que
estes fatos pedem não é tomada aqui, e esta nota não abre ADR: a relação entre
fornecedor e prefeitura no console é a ADR 0018 (V2-F20-E01), e a suspensão com
aviso e a eliminação que não suspende na hora são a V2-F20-E04.

1. **"Banco de dados separado" (título da decisão 1) não vale.** O console é
   processo separado, com aplicativo próprio no Fly (`dc360/fly.console.toml`),
   segredo de token próprio e conexão própria (`CONSOLE_DATABASE_URL`), mas a
   conexão é ao MESMO Postgres dos municípios, com o papel `dc360_console`
   (assumido por um papel de login com `SET ROLE`). O que separa é o papel, não
   o banco.
2. **A decisão 3 ("nada em nenhuma outra tabela", "sem execução de função")
   ganhou exceções nomeadas além da emenda de 14/09/2026.** A migração 038 deu
   ao console `EXECUTE` em `console_suspender_municipio`,
   `console_reativar_municipio`, `console_agendar_eliminacao` e
   `console_cancelar_eliminacao` (todas `SECURITY DEFINER`), além das funções
   do próprio login, e escrita nas tabelas do fornecedor `console_operadores` e
   `eliminacoes_de_municipio`; a 039 somou `console_codigos_de_recuperacao` e
   três funções de recuperação. Continua sem privilégio direto em tabela de
   negócio, e a lista de exceções é cobrada por nome em
   `dc360/db/test/isolamento.test.ts`.
3. **"Um vazamento do console entrega números agregados, não pessoas. O dano
   tem teto, e o teto está escrito" (Consequências, boas) e "Cadastrar
   prefeitura é, agora, o único ato de escrita do console" (Consequências,
   ruins) não valem.** A parte de LEITURA continua verdadeira: o console não lê
   dado de cidadão. Mas uma sessão do fornecedor comprometida hoje também
   SUSPENDE o acesso de qualquer município (`POST /municipios/:id/suspender`:
   ninguém entra, a escrita para, a fila do campo espera) e AGENDA A ELIMINAÇÃO
   de qualquer município (`POST /municipios/:id/eliminar`: suspende na hora e,
   se ninguém cancelar em sete dias, o relógio da API apaga o banco e as
   fotografias do município). As duas exigem a sessão com segundo fator e
   papel de dono, e o banco recusa quem não é dono ativo; mesmo assim, o teto
   de dano deixou de ser "números agregados" e passou a incluir interromper o
   serviço e destruir a base de qualquer município, com sete dias de prazo para
   alguém perceber. O prazo, o livro `eliminacoes_de_municipio` e o
   `GET /saude` (`eliminacoes: { agendadas, vencidas }`) são o que permite
   perceber (`dc360/docs/SAIDA-DE-MUNICIPIO.md`, capítulo 5).
4. **As contas do console moram no banco desde a migração 038**
   (`console_operadores`), e não na configuração do processo; a variável
   `CONSOLE_OPERADORES` virou só a semente do primeiro dono
   (`dc360/apps/console/src/operadores.ts`).
