# V2-F00-E03, correção 3: seis linhas abertas conferidas, prazos no teto da D2, etapa e dono para cada uma

## Fatos

- **O que a rodada 2 reprovou (`validacao/4b96ea7/qa.md`):** seis linhas abertas; prazos de 2026-10-27 acima do teto de 5 dias da D2 (E02); referências a E21 e E18 que não contêm o trabalho; D-4 (Firefox) sem dono.
- **O que foi conferido hoje contra a suíte (nova seção 8.8 de `classificacao-dos-vermelhos.md`):**
  - `node scripts/auditar.mjs`: código 0, as exceções do aplicativo com dono e prazo (`saidas/01-auditar.txt`).
  - V-INS-02: busca no código: continuam 10 `setTimeout(..., 20)` em 4 arquivos da API e as esperas fixas de 10 a 100 ms (`saidas/02-v-ins-02-busca.txt`).
  - V-INS-03 e V-INS-04: `dominio.test.ts` e `regras-de-conteudo.test.ts`, 2 rodadas, 22 de 22 nas duas (`saidas/03-shared-rodada-1.txt` e `04-shared-rodada-2.txt`); `regras-de-conteudo` sozinho, 8 de 8 (`saidas/05-regras-de-conteudo.txt`). Não reproduziu; sem causa medida, a linha segue aberta (regra R6).
  - V-INS-05 e V-INS-06: NÃO rodados. Usam o banco e as portas da máquina, que outros implementadores usavam ao mesmo tempo; rodar agora mediria a carga deles. Valem as medições da seção 8.4.
- **Nenhuma linha estava resolvida a ponto de fechar com prova nova:** nenhum dos cinco instáveis reproduziu, e a política diz que falta de reprodução não é conserto. O que mudou é a classificação:
  - **V-DEP-3** passa de "aberta" para **tolerada por decisão (CP-03, regra R5)**: não é teste vermelho nem skip, é exceção de dependência com prazo 2027-01-05 decidido pelo Rafael em 2026-10-07, e o portão `auditar` reprova no vencimento (caso "reprova a exceção vencida" em `auditar.test.mjs`). É reclassificação proposta por este registro; fica para o Rafael junto com o H03.
  - **D-4** ganha linha própria, **V-ROT-02**: dono `rafael`, etapa V2-F00-E01 (o texto da E01 pede o e2e em Chromium e Firefox), prazo 2026-10-18; trabalho: o passo `e2e-firefox` em `baseline.mjs`, arquivo compartilhado fora da área desta correção.
  - **V-INS-02 a V-INS-06:** prazo trocado de 2026-10-27 para **2026-10-18** (5 dias a partir de 2026-10-13, o teto da D2 com a folga de UTC). Etapa: V-INS-06 em V2-F00-E18 (objetivo: e2e verde, Firefox incluído), V-INS-04 e V-INS-03 em V2-F00-E20 (objeto: `regras-de-conteudo.test.ts`; o encaixe de V-INS-03 é parcial). **V-INS-02 e V-INS-05 NÃO têm etapa que contenha o trabalho** (uma busca por instável, espera fixa, waitFor e flaky nos arquivos do roadmap não achou nenhuma) e vão para a decisão do Rafael em H03.
  - Contagem de hoje (8.8.4): fechadas 65 de 71; 1 tolerada por decisão; 4 abertas com dono, prazo e etapa; 2 abertas com dono e prazo sem etapa. Abertas ao todo: 6 (V-INS-02, 03, 04, 05, 06 e V-ROT-02).
- **Leituras antigas corrigidas** (8.8.3): o "30 dias" do cabeçalho da seção 8, a Q4 que dizia "a E21 ganha o quarto item" (não ganhou), os títulos de 8.2 e 8.3, a linha D-4 de 8.5, e as colunas de prazo e issue das cinco linhas V-INS em 8.3.
- **Recomendação registrada, sem decidir:** abrir uma etapa curta da F00 (por exemplo `V2-F00-E26`, estabilidade da suíte) para V-INS-02, V-INS-03, V-INS-05 e o passo do Firefox. Acrescentar etapa ao roadmap é do orquestrador, e aceitar linha aberta e nomeada em vez disso é do Rafael.
- **Portão de conteúdo:** `regras-de-conteudo.test.ts` 8 de 8 depois das edições (`saidas/05-regras-de-conteudo.txt`).
- **O item do G00 "zero itens abertos" continua sem fechar à letra.** Esta correção não o fecha: reduz para o que é estritamente verdadeiro e dá a cada linha um dono, um prazo dentro da política e, onde existe, a etapa.
- **Números de teste:** nenhum teste foi acrescentado nem tirado nesta etapa.

## Justificativa

Fechar uma instabilidade só porque ela não repetiu hoje contraria a regra R6 que a própria etapa escreveu. Do lado oposto, deixar prazo de 14 dias e referência a etapa que não contém o trabalho é o que a rodada 2 reprovou. O caminho honesto é o que está aqui: provar o que se pode provar hoje, trazer cada linha para o teto de 5 dias, ligar cada uma à etapa que de fato a contém, e dizer em voz alta as duas que não têm etapa, em vez de inventar uma referência. A reclassificação de V-DEP-3 respeita a regra R5 da política, que manda dependência seguir o CP-03 e não a T42.
