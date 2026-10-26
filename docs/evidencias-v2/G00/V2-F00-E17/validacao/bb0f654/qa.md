---
validador: qa (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E17
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [LGPD, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---

Pasta das saídas (fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/qa-lote2/` (abaixo, `SAIDAS/`). Mac, Node v24.15.0.

## Critérios verificados

| Critério | Resultado | Prova |
| --- | --- | --- |
| `test:scripts` com 0 falhas | PASS (Mac) | passo `test-scripts` da linha de base: 288 testes, 288 aprovados, 0 falhas (0 pulados porque `apps/campo/ios/` existe nesta máquina) (`SAIDAS/baseline-completo/10-test-scripts.txt`) |
| Os três casos (migração com `npm`, cópia de produção, `aps-environment`) | PASS | `node --test scripts/copiar-producao.test.mjs scripts/comando-de-migracao.test.mjs scripts/entitlements-do-ios.test.mjs`: 22 de 22 (`SAIDAS/e17-05-tres-casos-limpo.txt`) |
| `conferir:numeros` sem divergência | PASS | passo `conferir-numeros`: código 0, 25 afirmações, oito suítes do roteiro conferidas (`SAIDAS/baseline-completo/11-conferir-numeros.txt`) |
| `conferir:numeros` reprova número alterado de propósito | PASS | `README.md` com "1326 testes da API" (real 1327): código 1, a afirmação aparece com o valor real (`e17-01`); `COLOCAR-DE-PE.md` com "4917 testes somando o aplicativo" (real 4916): código 1 (`e17-02`); os dois desfeitos com `git restore` |
| Pulos de `describe.skip` declarados na saída | PASS | a saída imprime "0 ponto(s) de pulo incondicional com marca T42 nos pacotes do vitest" e os pulos por ambiente |
| LGPD: os lugares proibidos para o dump continuam recusados | PASS | mutação: tirar "Dropbox" da lista de `scripts/copiar-producao.mjs` faz `copiar-producao.test.mjs` reprovar (13 casos, 1 falha, código 1) (`e17-06`); desfeita com `git restore` |
| Portabilidade em duas plataformas | PASS em Mac (por mim) e Windows (evidência arquivada `saidas/03`); Linux não lido | ver "Não verificado" |
| `INDEX.md` byte a byte | PASS | raiz 24 de 24, `saidas/baseline-depois/INDEX.md` 7 de 7, `saidas/baseline-depois-2/INDEX.md` 4 de 4 (`SAIDAS/index-conferencia.txt`) |

## Evidência

- Linha de base completa `node scripts/baseline.mjs --sem-instalar` (código 3 só pelas duas divergências de máquina; `conferir-numeros` confere, `test-scripts` diverge só em "pulados 0 contra 4").
- `npm run conferir:numeros` com quatro adulterações (`SAIDAS/e17-01` a `e17-04`), cada uma desfeita, `git status` limpo.
- `node --test` dos três testes, e a mutação do Dropbox.

## Cenários positivos

- Árvore atual: `test:scripts` 0 falhas, `conferir:numeros` 0 divergências.

## Cenários negativos

- Número da API e total com o aplicativo alterados em 1: reprovam.
- Lista de nuvens sem Dropbox: o teste da cópia de produção reprova.

## Tentativas de reprovar

1. Procurei número errado que o conferidor aceita. Achei dois: "258 testes da API" em `README.md:1356` (258 é o total de verificações de navegador contra a API) passa com código 0 (`SAIDAS/e17-03-api-com-numero-de-outra-grandeza.txt`), e "1927 testes somando o aplicativo" em `docs/COLOCAR-DE-PE.md:41` (1927 é só o aplicativo; o total é 4916) passa com código 0 (`e17-04`). A mensagem do próprio conferidor mostra a causa: "a frase fala de uma grandeza cujo valor real é 1327 ou 258". Os dois plantios foram desfeitos.
2. Conferi se os três consertos continuam vivos fora do Windows: os três passam no Mac.
3. Conferi a regra LGPD por mutação, e não só pela leitura.

## Achados

- Corrige antes de crescer: o `conferir:numeros` aceita um número que é o valor real de OUTRA grandeza que a frase também pode descrever ("testes da API" casa com a contagem da API e com a de verificações no navegador contra a API; "somando o aplicativo" casa com o total e com o aplicativo sozinho). Reprodução: trocar `1327 testes da API` por `258 testes da API` em `dc360/README.md:1356`, ou `4916 testes somando o aplicativo` por `1927 testes somando o aplicativo` em `dc360/docs/COLOCAR-DE-PE.md:41`, e rodar `npm run conferir:numeros`: código 0. Um número errado só passa se coincidir com o de outra grandeza, então não quebra o critério "reprova número alterado de propósito" (alterado em 1, reprova), mas o portão é mais frouxo do que a etapa promete ("os números deixam de apodrecer em silêncio").

## Não verificado

- Linux: o run do CI não foi lido nesta sessão; a portabilidade em Linux fica com a dimensão Infra e CI.
- A rodada Windows não foi refeita por mim (não há Windows aqui); vale a saída arquivada.

## Risco residual

Baixo. Os três testes são portáveis em Mac e Windows; o conferidor pega a deriva comum (mais ou menos alguns casos), e falha só no caso de coincidência entre grandezas.

## Motivo do humano

Nenhum.
