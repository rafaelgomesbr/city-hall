# ADR 0006: nenhum papel acima do administrador, e o sistema de postos

- **Data da decisão:** 22/08/2026 (registro escrito em 25/08/2026)
- **Situação:** aceita, em vigor, com um ponto suplantado
- **Depende de:** ADR 0001
- **Suplantada em parte pela ADR 0008**, de 09/09/2026, e só no ponto "não existe
  painel de plataforma", listado abaixo como consequência ruim. Passou a existir
  console do fornecedor, sem nenhuma credencial que leia dado de negócio de dois
  municípios: ele lê métrica agregada que cada município escreve. A recusa ao
  super-administrador, que esta ADR fez por princípio, continua valendo inteira,
  e o resto deste documento (postos, teto do município, provisionamento por
  linha de comando) não foi tocado.

## Contexto

Havia dois problemas, e o primeiro escondia o segundo.

**Primeiro: coordenador e administrador eram a mesma coisa.** As listas de
permissão dos dois eram idênticas item por item. Eram dois nomes para o mesmo
poder, ninguém era o teto do município, e qualquer um desfazia o que o outro
fez. Nada impedia um coordenador de desativar o administrador, nem o penúltimo
administrador de desativar o último, e nesse caso o município ficaria sem
ninguém capaz de criar usuário, com a única saída sendo SQL na mão no banco de
produção.

**Segundo: quem provisiona um município?** Não havia porta nenhuma. A tabela
`organizacoes` só era populada pela semente de desenvolvimento ou por INSERT
manual. Na prática, o poder máximo do produto era quem tivesse a
`DATABASE_URL`, e isso não estava escrito em lugar nenhum.

A saída comum para o segundo problema é criar um papel de super-administrador
que enxerga todos os municípios. Essa saída contradiz frontalmente o ADR 0001:
bastaria um token vazado para alcançar todas as prefeituras de uma vez.

## Decisão

**1. Posto numérico por papel.** Número maior manda mais, e dele decorre uma
regra só: ninguém administra conta de posto acima do seu, nem concede papel de
posto acima do seu.

| Papel | Posto | O que significa |
| --- | --- | --- |
| Agente de campo | 1 | Registra vistoria. Não administra ninguém. |
| Operador de plantão | 1 | Registra chamado e responde providência. Não administra ninguém. |
| Coordenador | 2 | Manda no fluxo operacional inteiro e administra equipes e usuários abaixo dele. |
| Administrador | 3 | Teto do município. O que o coordenador faz, mais alterar os dados do órgão, e é o único que administra outro administrador. |

Consequências impostas pelo servidor, não pela tela: o coordenador não cria
administrador, não desativa administrador e não se promove pela edição; e o
município não fica sem administrador ativo, nem por desativação nem por
rebaixamento.

**2. Acima do administrador não existe papel de aplicação.** Provisionar
município é ato de operador da plataforma, feito por linha de comando com a
credencial de dono do banco, a mesma que aplica migração. Ela cria a organização
e o primeiro administrador, sorteia a senha inicial e a imprime uma única vez.
Recusa provisionar o mesmo município duas vezes, porque o segundo enxergaria
zero dados do primeiro e o sintoma seria "o sistema perdeu tudo", com tudo
intacto do lado errado da parede.

**3. Posto e permissão são duas perguntas diferentes.** `exigirPermissao` diz se
a pessoa administra usuários; `exigirPostoParaGerir` diz até onde. As duas vêm
juntas, nunca uma no lugar da outra, e cada uma tem o próprio tipo de erro
(`SemPermissao` e `PostoInsuficiente`), para a mensagem ao usuário dizer o que
de fato aconteceu.

## Consequências

Boas:

- Um token vazado, seja de quem for, alcança um município e só. Não existe
  credencial de aplicação que veja mais de um.
- A hierarquia é um número, e a regra que dela decorre é uma linha. Não há
  matriz de "quem pode mexer em quem" para manter.
- Quem tem o poder máximo do produto passou a estar escrito: é quem tem a
  `DATABASE_URL`, e isso é uma pessoa com acesso ao servidor, não uma conta.

Ruins:

- **Não existe suporte de dentro do produto.** Se o município travar, ninguém do
  nosso lado entra pela tela para consertar: é linha de comando com credencial
  de dono, ou é telefone com o administrador do município. Isso é caro em
  atendimento e vai doer no primeiro piloto.
- **Não existe painel de plataforma.** Quantos municípios existem, quantos
  usuários ativos, quem está usando: nada disso tem tela, e responder essas
  perguntas hoje é consulta SQL.
- Provisionar exige uma pessoa com acesso ao servidor. Não dá para delegar a
  venda sem delegar o banco.
- Posto por número é grosseiro: dois papéis de posto igual (agente e operador)
  não administram um ao outro, e se um dia precisarem, a regra fica apertada.
- A regra do "último administrador" é uma verificação de escrita a mais em cada
  desativação e em cada rebaixamento, e ela existe porque a falta dela já era um
  buraco com consequência conhecida.

## Alternativas descartadas

| Alternativa | Por que não |
| --- | --- |
| Papel de super-administrador com visão de todos os municípios | Contradiz o ADR 0001. Um token vazado alcançaria todas as prefeituras. É a única alternativa que foi recusada por princípio, e não por custo. |
| Deixar coordenador e administrador iguais | É o estado anterior: dois nomes para o mesmo poder, e um desfazendo o outro. |
| Matriz explícita de quem administra quem | Cresce ao quadrado com o número de papéis, e a linha que ninguém preencheu vira o buraco. |
| Provisionar por rota autenticada da API | Exigiria um token que vale para mais de um município, que é exatamente o que não pode existir. |

## Onde isto vive

- Implementa: `dc360/packages/shared/src/permissoes.ts` (`ACOES`, `PERMISSOES`,
  `POSTO`, `exigirPermissao`, `exigirPostoParaGerir`,
  `papeisQuePodeConceder`); `dc360/apps/api/src/rotas/administracao.ts`;
  `dc360/apps/api/src/provisionar.ts` e `dc360/db/src/cli.ts`.
- Defende: `dc360/packages/shared/test/permissoes.test.ts`,
  `dc360/apps/api/test/provisionar.test.ts`,
  `dc360/apps/api/test/api.test.ts`, e no navegador
  `dc360/apps/web/test/fluxo-api.e2e.mjs`, que recusa o papel mesmo chamando a
  API direto pelo console.
- Regra geral que decorre daqui: toda função de escrita começa por
  `exigirPermissao` antes de tocar no banco. Esconder o botão na tela não é
  controle de acesso.
