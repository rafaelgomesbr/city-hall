# V2-F02-E01: prefixo /v1 com espelho legado sem prefixo e data de remoção

## Fatos

**O que mudou (todo o código em `dc360/apps/api`):**

- `src/servidor.ts`: as rotas de negócio saíram do corpo de `construirServidor` para uma função única, `registrarRotasDeNegocio`, chamada duas vezes: dentro de `{ prefix: "/v1" }` e num plugin ENCAPSULADO (sem `fastify-plugin`) que é o espelho legado, sem prefixo, com um hook `onSend` que acrescenta `Deprecation`, `Sunset` e `Link` (`rel="successor-version"`). Como o hook mora no escopo encapsulado, só as rotas do espelho o recebem. Uma função só, e não duas listas: rota nova nasce nos dois lados ou em lado nenhum. O bloco `if (!espelho)` ao fim da função é o lugar de rota que só existe em `/v1`.
- Ficam sem prefixo, registradas uma vez na raiz: `GET /saude`, `GET` e `PUT /armazenamento/objeto` (URL assinada: a assinatura cobre o caminho) e `GET /publico/oficio/:token` (endereço que vive em e-mail já enviado). `POST /publico/interesse` foi para `/v1` e para o espelho.
- `src/versao-v1.ts` (novo): `PREFIXO_V1`; `ROTAS_FORA_DO_PREFIXO` (as quatro rotas acima, com a razão de cada); `ROTAS_SO_NO_V1` (o mecanismo declarado de "rota só em /v1", hoje vazio, que a paridade aceita); `semPrefixoDeVersao`; `cabecalhosDeDepreciacao` (o `Link` sai sem a query string, que pode levar endereço de imóvel, e com todo caractere fora do conjunto de URL percent-codificado, para nunca fechar o `<...>` antes da hora).
- `src/config.ts`: `ESPELHO_LEGADO_ATE` (data ISO, validada como data de calendário de verdade; `2027-02-31` é recusada), padrão PROVISÓRIO `2027-12-31`. `apps/api/.env.example` e `scripts/ambientes.json` (a matriz de variáveis, que reprovou até a variável entrar) ganharam a entrada.
- `src/limite-por-rota.ts` (novo): armazém do limitador de taxa que dá o MESMO balde à rota em `/v1` e ao espelho dela. Sem isso, o `@fastify/rate-limit` (que cria um armazém novo por rota com limite próprio) dobraria as tentativas de login por endereço só pela escolha do prefixo.
- Senha provisória: `ROTAS_ABERTAS_COM_SENHA_PROVISORIA` ganhou `/v1/auth/trocar-senha` e `/v1/auth/encerrar-sessoes`. Redação de log: `caminhoParaLog` também redige o token do ofício colado sob `/v1` (a rota não existe lá, mas o 404 é registrado). A marca `filaDoCampo` (503) é por rota e vale nos dois.
- Dependência de teste: `construirServidor` aceita `limitePorMinuto` (padrão 300, só o teste muda), porque a prova dinâmica dos códigos de erro passa do teto global com as rotas dobradas.

**Testes:**

- `test/versao-v1.test.ts` (novo, 31 casos): paridade lida da árvore que o Fastify de fato registrou (a âncora prova que a leitura enxerga os dois lados; exceções existem de verdade e não ganham par; não há lista morta; o mesmo número de rotas de negócio); mesma resposta nos dois prefixos (lista, dossiê, erros de validação e autenticação, token adulterado, escrita pelo legado lida por `/v1`); isolamento (token do município B em `/v1/ocorrencias/<id de A>` responde 404, igual ao legado); `/v1/saude` e `/v1/publico/oficio/x` respondem 404; cabeçalhos de depreciação só no espelho, inclusive em 401, 404 e 422 sem token; `ESPELHO_LEGADO_ATE`; senha provisória (403 `troca_de_senha_obrigatoria` em `/v1/ocorrencias`, e `encerrar-sessoes` passando nos dois); município suspenso (503 nas rotas da fila nos dois prefixos); limitador (balde global único; o limite do login não dobra; rotas diferentes têm baldes diferentes).
- `test/campo-integracao-v1.test.ts` (novo): liga o prefixo `/v1` e importa `campo-integracao.test.ts`, que passa a montar toda URL com a variável `DC360_PREFIXO_DA_API_NO_TESTE`. Os 17 casos da fila do campo contra a API rodam nos dois prefixos (login, pendências, vistoria offline, foto, senha provisória, sessão que cai, município suspenso). A URL assinada de envio de foto não ganha prefixo nos dois.
- Ajustados: `superficie-registrada.ts` (nova `ehSemToken`: a isenção é declarada uma vez, sem prefixo, e vale em `/v1`), `superficie.test.ts`, `get-com-efeito.test.ts` (a lista de GET com efeito é conferida nos DOIS prefixos separadamente), `log.test.ts` (+1 caso), `prova-dinamica-dos-codigos-de-erro.test.ts` (pisos dobrados: 112 para 222 e 48 para 94, e por perfil), `contrato-do-painel.test.ts` (segue verde sem mudança).
- Contagem: `baseline.mjs` ganhou `V2-F02-E01: { total: 49, falhas: 0, puladas: 0 }` (31 + 17 + 1). API: 1903 para 1952 casos. README (1869 para 1918 testes da API, 3921 para 3970 no `npm test`) e `COLOCAR-DE-PE.md` (5918 para 5967) ajustados.
- Documentação: `dc360/README.md` (subseção "A versão no caminho", na seção da API) e `apps/api/PENDENCIAS.md` (seção do espelho).

**O que NÃO foi feito (de propósito):** painel, campo e console continuam no caminho sem prefixo (E02); catálogo de erros (E03); OpenAPI (E04); calendário e política de depreciação (E08); retirada do espelho (F28-E11).

## Justificativa

- **Por que um plugin encapsulado para o espelho:** o `onSend` de depreciação precisa valer só para as rotas do espelho. As rotas de infraestrutura (`/saude`, `/armazenamento`, `/publico/oficio`) ficam na raiz e não devem carregar aviso de depreciação, porque o endereço delas nunca vai mudar.
- **Por que um armazém de limitador próprio:** o desenho da biblioteca é um balde por rota registrada. Com a rota registrada duas vezes, quem adivinha senha ganharia o dobro de tentativas por endereço. O teste de login prova que três tentativas valem no total, e que `/auth/entrar` e `/auth/segundo-fator` continuam com baldes separados.
- **Por que `ROTAS_FORA_DO_PREFIXO` e `ROTAS_SO_NO_V1` são declarações cobradas pelo teste:** a paridade aceita a falta de par só para o que está nas listas, e reprova lista morta. Rota só de um lado, sem declaração, é o defeito que a função única evita.
- **`Deprecation: true`:** é a forma do rascunho que o RFC 9745 trocou por uma data; a data de início é decisão da E08.

## Limites declarados (leia antes de dar PASS)

- **Ambiente Windows:** nesta máquina 11 casos reprovam por limitação do ambiente, nenhum por esta etapa: `regras-de-conteudo.test.ts` (1, `EPERM` ao criar link simbólico), `desfazer-migracao.test.ts` (5), `guarda-da-semente.test.ts` (3) e `semear-homologacao.test.ts` (2): os quatro últimos chamam `spawnSync` de `node_modules/.bin/tsx` (script de shell, sem `.cmd`), e o status volta nulo. Os arquivos não foram tocados. Em Linux (CI) elas devem passar; a conferência definitiva é o CI do SHA.
- **Contagem local:** a API mostra `1916 passed | 2 failed | 34 skipped (1952)`, as 2 falhas sendo as de `semear-homologacao`. Em Linux são 1918 passando, que é o número do README.
- **`test:e2e:api` NÃO foi rodado aqui:** sobe API, painel e navegador (Playwright), pesado para esta máquina, e o painel não muda nesta etapa. O espelho é coberto pelos 17 casos de `campo-integracao.test.ts` sem prefixo, que são os do aplicativo já instalado. Fica para o CI do SHA.
- A etapa pede "Rafael vê duas chamadas autenticadas, uma por prefixo, e os cabeçalhos do legado": a captura sem token está em `saidas/02`; as duas chamadas AUTENTICADAS são os casos "GET /v1/ocorrencias com token responde o mesmo que o legado" e "o dossiê de uma ocorrência também" em `saidas/01`. Ver as chamadas com um aparelho ou com o painel é validação humana pendente.
- O arquivo `apps/api/test/campo-integracao.test.ts` agora depende da variável de ambiente ao carregar; rodá-lo isolado continua dando o caminho sem prefixo.

## Provas (em `saidas/`)

1. `01-paridade-e-espelho.txt` (`versao-v1`, `campo-integracao-v1` e `campo-integracao`: 65 casos, 0 falhas). 2. `02-cabecalhos-sem-token.txt` (cabeçalhos capturados sem token, legado e `/v1`, mais `/saude` e os 404). 3. `03-diff-servidor-e-config.diff` (diff de `servidor.ts`, `config.ts`, `versao-v1.ts` e `limite-por-rota.ts`). 4. `04-typecheck.txt` (código 0). 5. `05-npm-test.txt` (os números acima; só as 11 falhas de ambiente). 6. `06-lint.txt`, 7. `07-lint-teto.txt` (431, não sobe), 8. `08-formato.txt`, 9. `09-conferir-numeros.txt` (verde). 10. `10-test-scripts.txt` (808 passam com este INDEX, 23 pulados por ambiente). 11. `11-regras-de-conteudo.txt` (9 de 10; a falha é a do link simbólico). 12. `12-auditar.txt` (código 0). 13. `13-baseline-test.txt` (29 de 29).

## Para o orquestrador

- **Linha do STATUS sugerida:** `V2-F02-E01 | IMPLEMENTADA (candidato) | Toda rota de negócio sob /v1 e no espelho sem prefixo por UMA função (registrarRotasDeNegocio); espelho com Deprecation, Sunset (ESPELHO_LEGADO_ATE, padrão provisório 2027-12-31) e Link successor-version; /saude, /armazenamento/objeto e /publico/oficio/:token ficam sem prefixo; limitador com balde único por rota nos dois prefixos; senha provisória, redação de log e fila do campo (503) valem nos dois. +49 testes de API (31 de paridade e espelho, 17 da fila do campo sob /v1, 1 de log). Falta: CI do SHA (11 casos de ambiente Windows e test:e2e:api não rodaram aqui); data real do Sunset na E08.`
- **Dívidas pagas:** nenhuma desta etapa.
- **Pendências humanas:** (1) confirmar ou trocar a data de `ESPELHO_LEGADO_ATE` (provisória, 2027-12-31) na E08; (2) ver duas chamadas autenticadas, uma por prefixo, e os cabeçalhos do legado (validação humana da etapa); nenhuma ação em Fly, Vercel, Supabase ou GitHub foi feita.
- **Para quem integra:** `scripts/ambientes.json` ganhou `ESPELHO_LEGADO_ATE` (a matriz de ambiente reprova variável lida pelo `config.ts` e ausente dela); se outra parte do lote também mexer nessa matriz ou em `MUDANCAS_DO_TESTE_API_POR_ETAPA`, os totais do README (1918, 3970, 5967) precisam ser recalculados na junção. `servidor.ts` e `config.ts` são desta parte.
- **Para a E02:** `registrarRotasDeNegocio` é o lugar de rota nova; painel, campo e console ainda falam sem prefixo.
