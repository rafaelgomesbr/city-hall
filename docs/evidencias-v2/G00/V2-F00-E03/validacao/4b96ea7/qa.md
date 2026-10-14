---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E03
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [ARQUIVO]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: decisao de Rafael sobre o item do G00 "zero itens abertos"
---
## Critérios verificados

Saídas em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/qa-infra/` (abreviado `qa-infra/`).

| Critério | Resultado | Prova |
| --- | --- | --- |
| Registro completo e somado contra a E01 | PASS | `classificacao-dos-vermelhos.md` seções 2 e 8.7: 71 linhas, 65 fechadas, 6 abertas (V-DEP-3, V-INS-02 a V-INS-06), 65 + 6 = 71 |
| Cada linha fechada aponta para algo que existe | PASS | `qa-infra/confere-provas.mjs` extrai os 194 testes nomeados em `correcao-1/brutas/prova-*.txt` e procura cada nome no arquivo de teste do SHA: 189 achados direto; os 5 restantes são `it.each` e título com template (`semente-e-confirmacoes.test.ts:77` `"%s anuncia o que gravou com um Toast"` x3; `acessibilidade.test.ts:192` ``tema ${qual}: todo par passa no mínimo exigido`` x2), que existem (`qa-infra/13-confere-provas-e03.txt`) |
| Nenhum vermelho de hoje fora do registro | PASS | Suíte de hoje toda verde na saída do gatekeeper (17 de 17); as instabilidades que vi (ver abaixo) têm linha (V-INS-04) |
| Instabilidades conhecidas registradas | PASS | V-INS-01 a V-INS-06 na seção 8.3 e 8.4 |
| Regra de BZ-N:N.3 decidida por Rafael | PASS | Seção 7 e `correcao-2/RESUMO.md`: Q1 a Q5 respondidas em 2026-10-13 |
| Item do G00 "o registro da E03 tem zero itens abertos" (`03-fase-00-estabilizacao.md:775`, exigido pela DoD da E03) | FAIL | 6 linhas abertas; o próprio registro (8.7) admite que o item não é literalmente verdade |
| Prazos e referências das linhas abertas coerentes com a política vigente | FAIL | Achados 2 e 3 |

## Evidência

`qa-infra/13-confere-provas-e03.txt`; leitura integral da seção 8 (linhas 192 a 309) de `classificacao-dos-vermelhos.md`; `POLITICA-DE-TESTE-VERMELHO.md` regra R6; `docs/DECISOES-DE-TESTE-DA-FASE-00.md:62`; `docs/roadmap-v2/STATUS.md:1138`; suíte do shared rodada 3 vezes e `test:scripts` (`qa-infra/50-shared-full-1..3.txt`, `01-test-scripts.txt`).

## Cenários positivos

As 3 rodadas completas do shared (168 de 168) e o `test:scripts` (243, 0 falhas, 4 pulados por ambiente) fecham verdes; `resolver-link.test.ts` usa `vi.waitFor` com limite (conferido no código: a espera fixa de 20 ms saiu).

## Cenários negativos

- "Linha sem evidência datada": procurei "teste velho" e "mock velho" sem citar commit e data: nenhuma.
- "Vermelho fora do registro": a seção 8 cobre a suíte; não achei falha nova nas execuções que fiz.
- Procurei a decisão da Q4 refletida nas linhas abertas: não está (achado 3).

## Tentativas de reprovar

1. Conferi se os nomes de teste do registro ainda existem no SHA: sim (acima).
2. Procurei prazo de linha aberta compatível com a decisão D2 (5 dias): não é (achado 2).
3. Procurei onde cada "issue" das linhas abertas leva: V-INS-02 a V-INS-05 apontam para `V2-F00-E21` e V-INS-06 para `V2-F00-E18`, etapas já implementadas cujo escopo (`03-fase-00-estabilizacao.md`) não contém esse trabalho; `STATUS.md:1138` guarda só a PROPOSTA de acrescentar o "quarto item" à E21, e o registro diz "ainda sem aceite". A resposta de Rafael à Q4 foi "os outros 10 pontos entram numa etapa futura", etapa que não existe no roadmap (achado 3).
4. Procurei item que saiu do registro sem fechar: D-4 (passo do Firefox fora do roteiro) está em 8.5 como "Parcial... Entra em V-ROT-01", e V-ROT-01 foi marcada FECHADA na correção 2, dizendo que "o passo do Firefox segue fora do roteiro". O pendente ficou sem linha aberta (achado 4).
5. Rodei o shared completo 3 vezes seguidas e o arquivo `regras-de-conteudo` sozinho mais 2 vezes sem mutação: nenhuma falha (V-INS-04 e V-INS-03 não reproduziram).

## Achados

1. **BLOQUEIA o item do G00 (não o produto).** O critério "registro com zero itens abertos" não está satisfeito: 6 linhas abertas (V-DEP-3, V-INS-02 a V-INS-06). V-DEP-3 é tolerância do CP-03 (até 2027-01-05); as cinco V-INS são instabilidades sem causa medida. O registro 8.7 pede ao gatekeeper e a Rafael que decidam se "aberta e nomeada" basta; enquanto isso a DoD (item do G00 marcado) não fecha. Reprodução: contar as linhas "ABERTO" de 8.3 menos as marcadas FECHADA.
2. **Corrige antes de crescer.** Os prazos das linhas abertas contradizem a decisão D2. O cabeçalho da seção 8 (linha 196) ainda diz "dentro do máximo de 30 dias da política (até 2026-11-12)", e a política passou a 5 dias em 2026-10-13. V-INS-02 a V-INS-06 estão com prazo 2026-10-27 (14 dias); a regra R6 manda tratar instabilidade "como qualquer skip", cujo teto é 5 dias mais 1 de folga (até 2026-10-19). Remédio: rever os prazos para o teto novo ou escrever a exceção por linha.
3. **Corrige antes de crescer.** As referências das linhas abertas não levam a lugar nenhum: `V2-F00-E21` e `V2-F00-E18` já foram implementadas sem o trabalho, a proposta do "quarto item" da E21 nunca foi aceita, e a resposta da Q4 (etapa futura) não gerou etapa nem foi copiada para as linhas (que ainda dizem "Depende de Q4" e a tabela 8.6 diz "A E21 ganha o quarto item"). O dono real do trabalho é indefinido. Remédio: uma etapa do roadmap (ou item de backlog com ID) para os 10 pontos de espera fixa e para V-INS-03 a V-INS-06, e trocar a coluna "Issue".
4. **Corrige antes de crescer.** D-4 (passo do Firefox no roteiro) ficou órfão: não há linha aberta para ele depois do fechamento de V-ROT-01.
5. Anotado: a seção 8.2 se intitula "Linhas fechadas (62 de 71)" e a 8.3 lista como "abertas" linhas já marcadas FECHADA; a contagem final (8.7) está certa, a leitura sequencial confunde.

## Não verificado

- Reexecução de API, painel e jest do aplicativo (proibido nesta rodada pela restrição de paralelismo): valem a saída do gatekeeper e o CI.
- Se cada reescrita de teste (13) enfraquece a asserção original: é matéria da E14/E17 e dos outros validadores.
- Que a falta de reprodução das instabilidades signifique conserto (o registro diz que não significa).

## Risco residual

Cinco instabilidades de teste (entre elas o portão de isolamento sob carga, V-INS-05) seguem com causa não medida e sem dono operacional: a falha intermitente vira "roda de novo".

## Motivo do humano

Rafael (ou o gatekeeper) decide se linha aberta, nomeada e com dono basta para o item "zero itens abertos" do G00, ou se o item é emendado; e aceita (ou muda) os prazos e a etapa futura dos achados 2 e 3.
