# V2-F01-E02, correção do CI 2: o job do navegador estourou os 35 minutos

## Fatos

- **Origem:** o CI do ramo `v2/f01` no SHA `ef10aad`, job "Fluxo ponta a ponta no navegador" (`navegador` em `.github/workflows/verificar.yml`). Foi CANCELADO por tempo: começou às 23:23:53 e foi cortado às 23:59:09 (35,3 minutos), no passo do WebKit, que é o último dos passos de teste. O log desse job veio vazio na coleta, então não há tempo por passo.
- **Causa:** o `timeout-minutes: 35` que a E02 pôs vinha do máximo de 28,6 minutos dos 8 últimos runs verdes (`../saidas/00-duracoes-antes.txt`, mediana 12,1) mais folga. Esses runs eram de antes da F01, e o job leva mais de 35 minutos agora. O que a medida de antes não podia mostrar: quanto dos 35 foi cada passo. O que se sabe: o corte aconteceu no WebKit, depois de instalação, build, os dois motores do modo local e os dois do caminho de produção.
- **Conta do novo teto:** 35,3 minutos (observado, sem terminar) mais o resto do passo do WebKit (a suíte de geometria da tela estreita, a mais curta das cinco) dá um piso de uns 36 a 38 minutos para um run completo. Com 40% de folga sobre esse piso, 50 minutos. Fica bem abaixo do teto de 120 que `conferir-workflows.test.mjs` aceita e do padrão de 360 do GitHub. É uma estimativa, e o texto no próprio workflow diz isso: o "depois" medido sai do run seguinte.
- **Mudanças em `.github/workflows/verificar.yml`:**
  1. `navegador`: `timeout-minutes` de 35 para 50, com a conta num comentário acima do campo.
  2. Passo "Caminho de produção, contra a API, no WebKit (geometria e foco)": `timeout-minutes: 12` no passo. Se for ali que algo trava, o run reprova com o passo NOMEADO em vez de queimar o orçamento do job inteiro e terminar como "cancelado" sem dizer onde. Os passos seguintes (registro do servidor, redação de segredo, publicação dos artefatos) rodam por `if: always()` e continuam rodando.
- **O que não mudei, e por quê:** o cache do Playwright já existe (`actions/cache`, chave presa ao lockfile e aos três navegadores) e o passo "Instalar navegadores" já usa só `install-deps` no acerto; no erro faz o `install --with-deps` de sempre. Não há reinstalação sendo refeita à toa no passo do WebKit: o WebKit é instalado junto dos outros dois, uma vez. Reduzir o tempo de verdade exigiria dividir o job em dois (por motor), o que acrescenta job novo ao contrato com `.github/rulesets/master.json` e não cabe numa correção; fica registrado como opção se o run seguinte mostrar o job perto dos 50.
- **Teste:** `scripts/conferir-workflows.test.mjs` não fixa o valor (só exige `timeout-minutes` em 1..120 em todo job), e continua 44 de 44 (`saidas/01-conferir-workflows.txt`). `saidas/02-yaml-valido.txt`: o YAML carrega, `navegador` 50, passo do WebKit 12.

## Limitações

- O tempo real do job só se conhece rodando no GitHub. Se o run seguinte passar de 50, é sinal de que há algo travando, e o passo nomeado vai dizer qual.
- Sem push.
