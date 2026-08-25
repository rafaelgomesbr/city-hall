# ADR 0005: SigV4 escrito à mão, em vez do SDK da AWS

- **Data da decisão:** 21/08/2026 (registro escrito em 25/08/2026)
- **Situação:** aceita, em vigor

## Contexto

A foto de vistoria é a prova de uma interdição, e ela mostra a casa e a rua de
uma família em situação de risco. Duas regras vieram daí, e elas definem o
problema técnico:

- **O arquivo nunca passa pelo servidor.** O aparelho recebe uma URL
  pré-assinada de vida curta e envia direto ao armazenamento. Passar dezenas de
  fotos por dentro da API significaria pagar banda duas vezes e derrubar o
  servidor justamente no dia de temporal.
- **Nunca existe URL pública.** Toda leitura é pré-assinada, curta e gerada
  depois de conferir permissão.

Assinar URL é o protocolo AWS Signature Version 4. O caminho óbvio é o SDK da
AWS (`@aws-sdk/client-s3` mais `@aws-sdk/s3-request-presigner`).

Dois fatos empurraram para o outro lado:

1. **O provedor escolhido não é a AWS.** O levantamento técnico aponta
   Cloudflare R2 por causa do egress: o S3 na região de São Paulo cobra por
   gigabyte que sai, e um sistema cujo conteúdo principal é foto paga essa conta
   todo mês, para sempre. R2 é S3-compatível: o que importa é o protocolo.
2. **A régua de segurança do projeto exige `npm audit` fechando em zero**, e
   dependência com vulnerabilidade conhecida em runtime é bug, não pendência. O
   SDK da AWS traz dezenas de pacotes transitivos, e cada um deles é um aviso
   futuro que vai chegar num dia em que ninguém tem tempo.

## Decisão

`dc360/apps/api/src/armazenamento/assinatura.ts` implementa SigV4 sobre
`node:crypto`, sem SDK. São duas funções de hash e uma montagem de string
canônica, e cabem num arquivo.

Detalhes que o código resolve e que costumam ser esquecidos:

- **Codificação RFC 3986 própria.** `encodeURIComponent` deixa passar `!`, `'`,
  `(`, `)` e `*`, que a AWS exige codificados. Um desses caracteres num nome de
  arquivo faria a assinatura bater no cliente e falhar no armazenamento, com
  erro genérico.
- **Tipo e tamanho entram na assinatura.** Assinar um cabeçalho o torna
  obrigatório e imutável: o armazenamento recusa o envio se ele vier diferente.
  É assim que o limite de tamanho deixa de depender da boa vontade do cliente.
- **O instante da assinatura é recebido de fora**, para o teste ser
  determinístico.

A implementação é conferida contra o **vetor de teste oficial publicado pela
AWS**, e bate byte a byte. Uma assinatura de 256 bits não coincide por acaso: ou
o algoritmo está certo, ou o teste falha.

## Consequências

Boas:

- A árvore de dependências da API continua pequena, e o `npm audit` fecha em
  zero sem depender do ciclo de lançamento de terceiro.
- Trocar de provedor S3-compatível é trocar endpoint e região.
- O comportamento inteiro é testável sem credencial e sem rede.

Ruins:

- **Criptografia escrita à mão é responsabilidade nossa.** O vetor oficial cobre
  o caso principal; ele não cobre variantes que o SDK trataria sozinho (upload
  em várias partes, credencial temporária com STS renovada, redirecionamento de
  região, novas versões do protocolo).
- **Nunca falou com um R2 ou um S3 de verdade.** O código está testado contra o
  vetor e contra um armazenamento em memória; o primeiro contato com um bucket
  real ainda vai acontecer, e ele é o tipo de coisa que revela detalhe de
  cabeçalho. Isso está em `PENDENCIAS-HUMANAS.md`.
- Se o provedor mudar algum detalhe de assinatura, quem descobre somos nós, e
  quem conserta também.
- Não há retentativa nem tratamento de erro de rede sofisticado: existe o
  suficiente para o ciclo de quatro passos (autorizar, enviar, confirmar,
  conferir no armazenamento).

## Alternativas descartadas

| Alternativa | Por que não |
| --- | --- |
| `@aws-sdk/client-s3` com `s3-request-presigner` | Dezenas de pacotes transitivos contra uma régua que exige `npm audit` em zero, para usar uma função de um protocolo que cabe num arquivo. |
| Cliente S3 minimalista de terceiro | Troca o problema de tamanho pelo problema de manutenção alheia: pacote pequeno é pacote abandonado com mais frequência. |
| Subir a foto pela API e ela repassar ao armazenamento | Paga banda duas vezes e concentra no servidor exatamente o pico do dia de temporal. |
| URL pública com nome imprevisível | Segurança por obscuridade sobre foto de residência de família em risco. Um link vazado vale para sempre. |

## Onde isto vive

- Implementa: `dc360/apps/api/src/armazenamento/assinatura.ts` (SigV4),
  `s3.ts` (armazenamento S3-compatível), `memoria.ts` (o de desenvolvimento),
  `tipos.ts` (a porta).
- Defende: `dc360/apps/api/test/assinatura.test.ts`, que reproduz o vetor
  oficial da AWS, e `dc360/apps/api/test/evidencias.test.ts`, que cobre o ciclo
  de quatro passos, inclusive a recusa de chave fora do prefixo do município.
- O banco impõe a mesma regra por CHECK: a chave precisa começar com
  `tenant/{organizacao_id}/` (`dc360/db/migrations/001_base.sql`, tabela
  `evidencias`, e `009_assinatura_data_e_emissao.sql` para a assinatura).
