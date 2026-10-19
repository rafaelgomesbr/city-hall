# Pendências do banco: o console do fornecedor

A ADR 0008
(`docs/adr/0008-console-do-fornecedor-sem-credencial-que-ve-dois-municipios.md`)
foi escrita antes da implementação, de propósito, porque a decisão que ela
registra é justamente a que impede o console de nascer errado.

**Revisão de 2026-10-07 (V2-F00-E22).** Até esta data este arquivo dizia que
a aplicação do console não tinha sido construída e que nada chamava
`resumir_municipio()`. As duas coisas deixaram de ser verdade há semanas: o
console existe (`apps/console`, com tela, rotas, sessão e segundo fator), e a
API chama o resumo por relógio. O que estava escrito como pendência e já foi
feito ficou abaixo, riscado, com o que o fechou; o que continua aberto está
dito como aberto. Cada afirmação foi conferida contra o código nesta data.

**Segunda conferência de 2026-10-13 (correção 1 da V2-F00-E22).** A rodada de
validação não conferiu este arquivo. Refeito contra o código de hoje, afirmação
por afirmação (o relógio do resumo em `apps/api/src/index.ts`, a migração 026, o
console, os códigos de recuperação da 039, os papéis de `COLOCAR-DE-PE.md` e
`IMPLANTACAO.md`, o teto de 27 funções `SECURITY DEFINER` em
o caso "existem, e são poucas o bastante para caberem numa revisão" de
`db/test/isolamento.test.ts`): nada mudou. A migração 048 (V2-F00-E05,
correção 1) recriou `dono_do_token` com uma coluna a mais de saída, sem criar
função privilegiada nova, então o teto continua 27 e o texto "hoje no máximo 27"
vale.

## 1. ~~Quem chama `resumir_municipio()`, e quando~~ (feito)

Feito pela API, por relógio: `agendarResumo` (`apps/api/src/metricas/resumo.ts`,
ligado em `apps/api/src/index.ts`) roda uma transação por município, com o
município no contexto, e chama `resumir_municipio()` lá dentro. Quem diz para
quais municípios chamar é `municipios_a_resumir` (migração 026), função
`SECURITY DEFINER` que devolve só identificadores e deixou de devolver
município eliminado. A escolha entre "no fim de uma escrita" e "rotina
diária pela linha de comando", que esta seção pedia ao Rafa, foi resolvida
por um terceiro caminho: o relógio dentro da API, com o papel de aplicação de
sempre e debaixo do RLS de sempre.

## 2. Expurgo por idade da tabela de métricas (aberto)

`metricas_municipio` cresce uma linha por município por dia, e **ninguém
apaga por idade**: não existe policy de `DELETE`, nem concessão de `DELETE`
para o papel de aplicação. Isso é proposital enquanto o expurgo não existir,
porque a alternativa (dar `DELETE` agora e escrever a cláusula na rota) é a
mesma armadilha que a migração 018 já documentou: no dia em que alguém
escrever `DELETE FROM` sem cláusula, some a série inteira de um município.
(A eliminação de um município apaga as métricas dele junto, pela função do
relógio de eliminação da migração 038; isso não é expurgo por idade.)

Quando o expurgo entrar, ele deve seguir o desenho de `avisos`: a idade dentro
da policy, e não só na cláusula de quem chama.

Não é urgente. A linha é pequena, só números, e a tabela leva anos para
incomodar. Mas é dado novo com regra de retenção própria, e a ADR 0008
registrou que ela precisa entrar na política de privacidade junto com o resto.
Isso continua sem ser feito: o corpo de `docs/PRIVACIDADE.md` não trata
`metricas_municipio` nem o console do fornecedor; o documento só os cita na
lista "Pendências desta política" (item 4), como o que falta escrever.

## 3. Papel de login do console (feito, com um cuidado ainda não escrito)

Feito: `docs/COLOCAR-DE-PE.md` e `docs/IMPLANTACAO.md` (seção 6) ensinam a criar
`dc360_console_login`, membro de `dc360_console` com `SET TRUE`, e dizem por que
`dc360_console` nasceu `NOLOGIN`.

Ainda não escrito lá: o papel de login do console **não pode** ser o mesmo
`dc360_api`, e não pode ser membro de `dc360_app`. As duas coisas são
exatamente o que o portão de privilégio reprova, e ele reprova por herança de
papel, que é o caminho mais silencioso dos seis.

## 4. ~~Segundo fator do console~~ (feito)

O console exige segundo fator de toda conta, cobrado na partida (operador sem
segredo de TOTP derruba o processo) e no login (`apps/console/src/operadores.ts`,
`apps/console/src/servidor.ts`), com o código de TOTP do produto
(`apps/api/src/auth/totp.ts`) e códigos de recuperação próprios (migração 039).
As contas não reaproveitam as tabelas de `usuarios`: moram em
`console_operadores` (migração 038), tabela do fornecedor e não de município.

## 5. ~~O provisionamento disparado pelo console~~ (feito, por outro desenho)

O desenho de "registra a intenção e alguém executa" nunca foi implementado. No
lugar dele, a emenda de 14/09/2026 da ADR 0008 deu ao console `EXECUTE` em
`provisionar_municipio` (migração 036), que cria organização, primeiro
administrador e a linha espelho na trilha numa transação só, e devolve dois
`uuid`. A rota é `POST /prefeituras` do console. A frase "o console só lê"
deixou de valer, e a revisão dela está na nota de 2026-10-07 da ADR 0008.

## 6. ~~O que o console mostra~~ (feito)

A tela existe (`apps/console/src/pagina.ts`) e não tem campo de busca por
protocolo: o comentário do topo do arquivo registra que pergunta sobre nome,
endereço ou protocolo é do município e se faz no painel dele.

## O que está garantido hoje, para não ser refeito

- Nenhum papel além do papel de aplicação e do dono tem privilégio em tabela de
  negócio, por concessão direta, por privilégio de coluna, por herança de papel,
  por `PUBLIC`, por visão ou por função `SECURITY DEFINER`, com EXCEÇÕES
  NOMEADAS para o console (as funções das migrações 036, 038 e 039, e as tabelas
  do fornecedor `console_operadores`, `eliminacoes_de_municipio` e
  `console_codigos_de_recuperacao`). A asserção é universal: as tabelas vêm do
  catálogo, então ela vale para a tabela que alguém criar amanhã sem lembrar
  desta regra, e uma exceção nova reprova até alguém escrever o nome dela em
  `db/test/isolamento.test.ts`.
- O papel do console não é superusuário e não tem `BYPASSRLS`, e isso é cobrado
  de todo papel que existir no banco, não só dele.
- Nada que identifique pessoa ou imóvel cabe no que o console lê, e a cobrança
  olha o catálogo: os tipos são numéricos, de data ou booleanos, e o único
  `uuid` permitido é o da organização.
- A ausência de escrita recente é um sinal na visão, e não uma linha faltando.
- O teto de funções `SECURITY DEFINER` do banco é cobrado por número em
  `db/test/isolamento.test.ts` (hoje no máximo 27), e cada subida tem o motivo
  escrito no próprio teste. O console foi o que mais o subiu (migrações 036,
  038 e 039).
