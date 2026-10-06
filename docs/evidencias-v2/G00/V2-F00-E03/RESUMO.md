# V2-F00-E03: Classificar os vermelhos por causa e registrar

Situação: FEITA EM DOCUMENTAÇÃO em 2026-10-05; FALTA A DECISÃO DE RAFAEL (ver o fim). Por isso a etapa está EM ANDAMENTO no STATUS e o item "vermelhos classificados" do G00 não foi marcado.

## O que foi entregue

- `classificacao-dos-vermelhos.md` (esta pasta): uma linha por vermelho do baseline da E01, com o teste, a mensagem na saída arquivada, a causa confirmada no código (arquivo e linha), a classe, a regra aplicada, a etapa que o fecha e o dono; a soma contra o baseline; as alegações da etapa conferidas; as divergências; o instável da E02; a decisão pedida a Rafael.
- `dc360/docs/POLITICA-DE-TESTE-VERMELHO.md`: nova seção "Quando o teste e o código discordam" (regras R1 a R6, o que o registro de uma reescrita precisa ter, quem tem a última palavra).
- `docs/DECISOES-DE-TESTE-DA-FASE-00.md`: a regra geral e oito seções de registro, cada uma com teste, antes, decisão que o torna velho, depois previsto, evidência e etapa.
- STATUS: seção 1, linha da E03, premissas (seção 9), diário (seção 10) e achados novos (seção 11).
- Nenhum código, teste ou script foi alterado.

## Resultado

| Item | Resultado |
| --- | --- |
| Vermelhos do baseline da E01 sem linha no registro | 0 |
| Linhas do registro sem vermelho no baseline | 0 |
| Soma | shared 1, painel 14 (8 + 5 + 1), API 2, suíte `banco-tls` 13, vigência 5 pulados, campo 20 (2 + 4 + 14, e 14 = 7 + 7), `test:scripts` 3, `conferir:numeros` 13, e2e 3, typecheck do campo 1 passo, dependências 4 passos |
| Linhas de classe B ("teste velho" ou "mock velho") sem evidência datada | 0 (8 linhas B: V-CAM-01 a V-CAM-06, V-SCR-3 e V-WEB-01, todas com data e commit) |
| Alegações da etapa conferidas contra o código | 26 conferidas: 21 confirmadas, 4 ajustadas, 1 divergente (seção 4 da classificação) |

## Divergências com o roadmap (seção 5 da classificação)

1. D-1: os números de `npm audit` da E19 estão velhos. Raiz tem 4 (3 moderadas e 1 alta, o `fastify` de execução); campo tem 54 (3 moderadas e 51 altas), não 4. Os lockfiles não mudaram desde 2026-09-17: mudou a base de avisos.
2. D-2: o teste irmão da decisão de `index.tsx:1222` é `a-sessao-vencida-nao-apaga-a-vistoria.test.tsx`, não `falha-de-atualizacao.test.ts`.
3. D-3: `Linking.openSettings` está em `src/push/PortaExpo.ts`, não em `perfil.tsx`.
4. D-4: só 2 dos 3 e2e foram medidos na E01 (o Firefox não roda no roteiro).
5. D-5: a causa de `banco-tls` não aparece na saída da E01 (o teste esconde a saída do `openssl`); a prova é a de 2026-09-30 mais a variável hoje definida.
6. D-6: o "teste velho" do campo não é uniforme; a reescrita não pode enfraquecer.
7. D-7: cinco etapas reescrevem teste sem listar o registro de decisões.

## O instável da E02

`resolver-link.test.ts` ("conecta no endereço conferido..."): classe F. Falhou 1 vez em 3 rodadas completas da API, passou isolado 3 de 3. Causa provável: espera fixa de 20 ms pelo `close` do servidor local sob a carga da suíte inteira. Nenhuma etapa existente o cobre; proposto como quarto item da E21 (STATUS, seção 11).

## Conferências feitas

- `npx vitest run packages/shared/test/regras-de-conteudo.test.ts` (em `dc360`), rodado depois de todos os arquivos prontos: 5 testes, 4 ok e 1 falha, a pré-existente do travessão, com só as 5 linhas de sempre (`trilha-detalhe.test.ts:181`, `AUDITORIA-2026-09-30.md:313` e `docs/auditoria-v2/raw/teste-shared.txt:23,33,41`). Nenhum arquivo desta etapa aparece nelas.
- Zero travessão (U+2014) nos arquivos novos e editados; CRLF puro em todos eles.
- Não foi rodado `test:isolamento` nem a regressão: a etapa não altera código (campos "Regressão obrigatória" e "Testes de autorização" da etapa dizem "Não se aplica").

## Limitações (ditas abertamente)

- A classificação é baseada nas saídas arquivadas da E01 (uma máquina, Windows) e em leitura do código. Nenhum teste foi reexecutado nesta etapa. As causas "ambiente" de V-WEB-03, V-TC-1, V-SCR-1 e V-SCR-2 estão provadas por leitura, por experimento arquivado em 2026-09-30 ou pela variável hoje definida, e não por reexecução.
- O defeito do `/` (V-E2E-1 e V-E2E-2) está confirmado só por leitura do código, sem captura de tela; a E13 o prova por teste e por e2e.
- A causa do instável é hipótese: o teste não imprime o tempo e a falha só foi vista uma vez.
- Os campos "Depois" do registro de decisões são previstos; só a etapa que reescreve o teste completa o diff real.

## O que falta para fechar a etapa (validação humana)

1. Rafael decide a regra de BZ-N:N.3 e confirma os 14 defeitos do campo (seção 7 da classificação). Hoje é premissa (STATUS, seção 9).
2. Rafael aprova as reescritas previstas das classes B e C com mudança de teste.
3. Depois disso o item "vermelhos classificados" do G00 pode ser marcado e o commit `V2-F00-E03: classificação dos vermelhos` pode ser feito (com a aprovação dele).
