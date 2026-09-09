# Pendências do banco: o console do fornecedor

A ADR 0008
(`docs/adr/0008-console-do-fornecedor-sem-credencial-que-ve-dois-municipios.md`)
foi escrita antes da implementação, de propósito, porque a decisão que ela
registra é justamente a que impede o console de nascer errado.

O que entrou até aqui é **a restrição, e não a aplicação**: a tabela de
métricas, a função que cada município usa para escrever o próprio resumo, a
visão em que o silêncio aparece, o papel de banco do console e o portão de
privilégio que prova que esse papel está contido. A aplicação do console não
foi construída, e isso é deliberado: o que importava era a restrição existir
antes dela.

Esta lista é o que falta para ela nascer.

## 1. Quem chama `resumir_municipio()`, e quando

Hoje a função existe, é executável pelo papel de aplicação e escreve o resumo
do município do contexto. **Nada a chama.** Sem um chamador, a tabela fica
vazia e o console mostra todo mundo como "sem escrita recente", que é o sinal
certo para o estado errado.

O chamador precisa rodar dentro de uma transação que já tem município no
contexto, porque a função é `SECURITY INVOKER` de propósito (é o que impede um
município de resumir o vizinho). Isso descarta o varredor de relógio da migração
016, que roda sem token e sem município.

Os dois caminhos que sobram, e o custo de cada um:

- **No fim de uma escrita que já acontece** (registro de ocorrência, chegada de
  vistoria). Fica na transação certa, sem agendador novo. O custo é somar
  algumas contagens a um caminho que hoje é rápido, e o resumo passa a ser
  reescrito muitas vezes por dia em município movimentado.
- **Numa rotina diária, iterando os municípios pela linha de comando** com a
  credencial de dono, que já é como o provisionamento funciona (ADR 0006). Não
  pesa em nenhuma requisição. O custo é uma rotina a mais para manter e vigiar.

A escolha não foi feita, e ela é do Rafa. Enquanto não for, o console não tem o
que ler.

Detalhe que atrapalha o primeiro caminho: a camada de dados da API tem uma
implementação em memória (`apps/api/src/banco/memoria.ts`) que os testes usam,
e ela não entende SQL. Chamar a função de dentro de uma rota exige ensinar a
implementação em memória a fingir essa chamada, senão a suíte da API quebra
inteira por um motivo que não tem nada a ver com o que está sendo testado.

## 2. Expurgo por idade da tabela de métricas

`metricas_municipio` cresce uma linha por município por dia, e hoje **ninguém
apaga**: não existe policy de `DELETE`, nem concessão de `DELETE` para o papel
de aplicação. Isso é proposital enquanto o expurgo não existir, porque a
alternativa (dar `DELETE` agora e escrever a cláusula na rota) é a mesma
armadilha que a migração 018 já documentou: no dia em que alguém escrever
`DELETE FROM` sem cláusula, some a série inteira de um município.

Quando o expurgo entrar, ele deve seguir o desenho de `avisos`: a idade dentro
da policy, e não só na cláusula de quem chama.

Não é urgente. A linha é pequena, só números, e a tabela leva anos para
incomodar. Mas é dado novo com regra de retenção própria, e a ADR 0008 já
registrou que ela precisa entrar na política de privacidade junto com o resto.
Isso ainda não foi feito: `docs/PRIVACIDADE.md` não menciona
`metricas_municipio`.

## 3. Papel de login do console, e a segunda tranca

A migração cria `dc360_console` como `NOLOGIN`, pelo mesmo motivo de
`dc360_app`: quem se conecta é um papel de login criado pelo operador, para que
a senha não more numa migração versionada. Falta escrever isso em
`docs/COLOCAR-DE-PE.md`, junto do trecho que já ensina a criar `dc360_api`.

Cuidado que precisa estar escrito lá: o papel de login do console **não pode**
ser o mesmo `dc360_api`, e não pode ser membro de `dc360_app`. As duas coisas
são exatamente o que o portão de privilégio reprova, e ele reprova por herança
de papel, que é o caminho mais silencioso dos seis.

## 4. Segundo fator, que a ADR exige e o console ainda não tem

A decisão 4 da ADR 0008 é explícita: acesso ao console exige segundo fator, sem
exceção e sem "por enquanto não", porque a conta do fornecedor é a única do
sistema cujo comprometimento afeta mais de um município.

A maquinaria existe: a migração 022 trouxe TOTP com código de recuperação. Ela
mora nas tabelas do produto, amarrada a `usuarios`, que é tabela de município. O
console é aplicação separada, com banco separado (decisão 1), então ele **não**
vai reaproveitar aquelas tabelas: vai precisar do próprio cadastro de contas do
fornecedor, com o próprio segundo fator. O que dá para reaproveitar é o código
de `apps/api/src/auth`, não o esquema.

## 5. O provisionamento disparado pelo console

A decisão 4 também muda o provisionamento: o console **dispara** e **não**
carrega a credencial de dono. Ele registra a intenção, e quem tem acesso ao
servidor executa. A linha espelho na trilha passa a ser escrita dentro da função
de provisionamento, na mesma transação, e não por um segundo passo que alguém
pode esquecer de rodar.

Nada disso foi feito. `apps/api/src/provisionar.ts` continua sendo o que a ADR
0006 definiu: linha de comando com a credencial de dono. A tabela de intenções
de provisionamento não existe, e quando existir ela é a única coisa que o
console **escreve**, o que vai exigir rever a frase "o console só lê" com
cuidado: escrever intenção não é escrever dado de município, mas é uma
concessão a mais no papel do console, e ela precisa passar pelo mesmo portão.

## 6. O que o console mostra, e o que ele não pode prometer

A aplicação em si (tela, rota, sessão) não foi desenhada. Quando for, a
consequência ruim já assumida na ADR precisa aparecer na própria tela, e não só
no documento: o console **não** responde "o que houve na ocorrência 000123". Se
a tela tiver um campo de busca que aceite protocolo, alguém vai digitar, não vai
achar, e vai pedir para "arrumar". A resposta certa é telefone com o
administrador do município, e a errada é afrouxar a decisão 2.

## O que já está garantido, para não ser refeito

- Nenhum papel além do papel de aplicação e do dono tem privilégio em tabela de
  negócio, por concessão direta, por privilégio de coluna, por herança de papel,
  por `PUBLIC`, por visão ou por função `SECURITY DEFINER`. A asserção é
  universal: as tabelas vêm do catálogo, então ela vale para a tabela que alguém
  criar amanhã sem lembrar desta regra.
- O papel do console não é superusuário e não tem `BYPASSRLS`, e isso é cobrado
  de todo papel que existir no banco, não só dele.
- Nada que identifique pessoa ou imóvel cabe no que o console lê, e a cobrança
  olha o catálogo: os tipos são numéricos, de data ou booleanos, e o único
  `uuid` permitido é o da organização.
- A ausência de escrita recente é um sinal na visão, e não uma linha faltando.
- O teto de funções `SECURITY DEFINER` não se mexeu: esta entrega não precisou
  de nenhuma função privilegiada nova.
