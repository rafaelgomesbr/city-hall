# Gate G00 (BASE CONFIÁVEL): consolidação da rodada 10

- Gatekeeper: sessão nova (skill `validar-etapa`), consolidação em Claude Opus 5.5 (claude-opus-5-5), no Windows do Rafael, em 2026-10-25.
- SHA do produto: `98879db` (código de produto idêntico ao de `a60be9a`). CI completo do mesmo produto: run 40179451002 sobre `9a1c112`, tentativa 2, 12 de 12 verdes (a tentativa 1 falhou só no caso instável do WebKit do Linux, DV-45, item 2 da seção 20 de `28`). Run do registro `ddff79a`: 40203288208, verde.
- Política: `28-execucao-e-validacao.md` em `98879db` (D-31 e D-32), mapa de impacto `0b32d38`, gatekeeper `e7e1326`.

## Veredito do gate: RECOMENDADO

As 25 etapas da F00 estão fechadas pelo lado dos agentes: 8 VALIDADAS (E02, E03, E04, E07, E12, E17, E20, E23), 16 VALIDADAS COM PENDÊNCIA HUMANA (E01, E05, E06, E08, E10, E11, E13, E14, E15, E16, E18, E19, E21, E22, E24, E25) e a E09 ACEITA por decisão do Rafael (H36, item 3 da seção 20 de `28`), sem validador e sem RISCO ACEITO. Nenhuma está REPROVADA, BLOQUEADA nem com RISCO ACEITO. A E09 fica com o status IMPLEMENTADA no STATUS: VALIDADA exige PASS de validador (o `gerar-estado --conferir` recusa o contrário), a seção 6 de `28` não tem status para "aceita sem validação" e o gatekeeper não escreve PASS que ninguém deu. O critério do gate ligado a ela ("os 8 casos de `seguranca-da-conta.test.ts` verdes e o fluxo no e2e contra a API") está provado pelo CI completo do mesmo produto; o que o aceite cobre é a classe de foco fora da vista, fora desse critério.

Rodada 10, por diferença desde a rodada 9 (`dda7557`):

| Etapa | O que rodou | Resultado | Relatório |
| --- | --- | --- | --- |
| V2-F00-E19 | QA da correção 11 (Infra e CI herdado de `dda7557`, sem impacto) | PASS | `V2-F00-E19/validacao/98879db/qa.md` |
| V2-F00-E16 | QA da documentação da DV-09 (produto herdado de `60cbc2f`) | PASS | `V2-F00-E16/validacao/98879db/qa.md` |
| V2-F00-E22 | QA da documentação da DV-08 | PASS | `V2-F00-E22/validacao/98879db/qa.md` |
| V2-F00-E09 | nenhum validador: aceite do Rafael (H36) registrado | ACEITA | `V2-F00-E09/VEREDITO.md`, rodada 10 |
| demais 21 | herdam a rodada 9 (código delas não mudou) | sem mudança | VEREDITO de cada uma |

Regressão base do gatekeeper no produto do SHA (Windows, Node 22.17.0, PGlite): typecheck 0; `test:isolamento` 345 aprovados e 3 pulados; `conferir:numeros` 0.

## Itens do gate

| Item do G00 | Etapas | Situação para o Rafael |
| --- | --- | --- |
| Baseline reproduzível | E01 | provado por CI Linux e roteiro (emenda D-30); a segunda pessoa humana é a H38 e o CP-07 |
| Política T42 em vigor | E02 | VALIDADA |
| Vermelhos classificados e fechados | E03 | VALIDADA; BZ-N:N.3 decidida (D3, 2026-10-13) |
| Vigência na escrita | E04 | VALIDADA (H29 anotada, não quebra o critério) |
| Códigos de erro | E05 | PASS; falta ver as frases (H10, H21, H34) |
| Fila do campo sem perda | E06 | PASS; falta aparelho (H20) e a decisão H04 |
| Sessão, conta, papel e senha provisória | E07 | VALIDADA |
| Vazamentos P0 de leitura | E08 | PASS com pendência humana |
| Telas de sessões e redefinição de senha | E09 | aceita (H36); falta H11, H35, H39, H81, H82 |
| Recuperação por e-mail | E10 | PASS; CP-19 adiado (H02), produção desligada |
| Saída de município | E11, E12 | PASS; decisão H07 |
| Contrato painel x API | E23 | VALIDADA |
| Painel e campo sem vermelho | E13, E14, E15, E16 | PASS; falta aparelho (H18, H19) e frases (H14, H15, H16) |
| Scripts e números | E17 | VALIDADA |
| E2E de navegador | E18 | PASS; H40 |
| Dependências | E19 | PASS nesta rodada; H37, H79 e binário nativo novo (H80) |
| Portão de conteúdo | E20 | VALIDADA (ver a dívida de Windows abaixo) |
| Ambiente | E21, E01 | PASS no CI (windows-latest e ubuntu-latest); H41. O "último run do Verificar em master verde" só existe depois do merge: hoje o último run em master é de 2026-09-17 e falhou |
| Documentação sem afirmação falsa | E22 | PASS; H42, H43 e a dívida do README abaixo |
| K14 resolvido | E24 | PASS; H01 e H30 (D-25) |
| Restore provado | E25 | PASS no CI Postgres 17; H22 e H27 |
| Checkpoints | CP-01, CP-02, CP-03, CP-19 | decididos; CP-19 adiado com o que fica bloqueado (H02) |
| Nenhuma regressão | todas | kit verde no CI completo; `test:isolamento` verde |
| Evidência arquivada e `GATE.md` | todas | pastas com `INDEX.md` e SHA-256 conferidas; o `GATE.md` se escreve na aprovação |

## O que esta rodada achou e não reprova (dívidas propostas, registro pelo próximo commit de implementador, porque `dividas.md` está fora da lista permitida)

1. `dc360/README.md:1403` ("rodam em todo push") e `:1633` ("a cada push"): a mesma imprecisão que a DV-09 corrigiu no LEIA-ME; o `verificar.yml` roda em push para `main`, `master` e `v2/**` e em `pull_request`. Dono V2-F00-E22. Duas linhas; recomendo pagar antes do merge, porque o item "Documentação sem afirmação falsa" do G00 e o gatilho de reabertura falam disso.
2. No Windows sem privilégio de link simbólico (sem Modo de Desenvolvedor), 1 de 10 casos de `regras-de-conteudo.test.ts` falha com EPERM em `symlinkSync` (reproduzido pelo gatekeeper nesta máquina). O CI em `windows-latest` passa. Dono V2-F00-E20 com a E21, antes do G01: pular o caso com motivo quando o link simbólico for recusado, ou documentar o pré-requisito. Afeta a H41 (rodar `npm run verificar` numa máquina Windows de cliente).
3. O `INDEX.md` da E09 voltou a listar `VEREDITO.md` na correção 8 (contra a nota da E21); com este registro o SHA-256 não bate. Dono V2-F00-E09: tirar a linha no próximo commit de implementador, antes do merge.
4. Frases do mapa do Zod: campo `z.coerce.number()` ausente diz "Precisa ser um número"; união discriminada sem o discriminador diz "Tipo não reconhecido". Dono V2-F02-E03, antes do G02.

## Desvio de processo para o Rafael decidir

Os commits de checkpoint `a65f733` e `823e380`, feitos sobre o registro do candidato, tocam `docs/roadmap-v2/retomada/**` (10 arquivos de retomada para o Windows), que está fora da lista permitida da seção 6 de `28`. Não é produto, política, mapa, skill nem script, e o CI deles está verde. A conferência mecânica foi refeita numa worktree em `ddff79a`, onde fecha sem falha. O commit deste registro fica sobre `823e380`. Se o Rafael não aceitar o desvio, o caminho é um candidato novo em `823e380` (mesmo produto) e uma rodada só mecânica.

## O que falta para o Rafael aprovar o G00

0. Decidir o status da E09 aceita: ganhar um status próprio na seção 6 de `28` (por exemplo ACEITA POR DECISÃO, que o `gerar-estado` passe a aceitar sem PASS), ou ficar IMPLEMENTADA com o aceite registrado, como está.
1. Decidir o desvio acima (aceitar, ou pedir a rodada mecânica sobre `823e380`).
2. Decidir se paga a dívida 1 (README, duas linhas) antes do merge. Se pagar, é um commit de implementador que muda `dc360/README.md`: a E22 revalida só aquela frase.
3. Resolver ou aceitar como pendência posterior as pendências humanas das 17 etapas (lista em `docs/roadmap-v2/pendencias-humanas.md`, roteiro em `docs/relatorios-v2/aprovacao/ROTEIRO-G00.md`). As que pedem aparelho, leitor de tela e segunda pessoa (H18 a H22, H27, H38, H39, H41) não se fazem por agente.
4. Resolver a H44 antes do merge: o ruleset da master no `v2/f01` aceita só squash, e o G00 exige commit de merge (nunca squash), para os SHAs citados nos VEREDITOs continuarem existindo em master.
5. Fazer o merge de `v2/f00` em master com commit de merge, conferir que o primeiro run do Verificar em master fica verde (item "Ambiente" do gate; hoje o último run em master está vermelho, de 2026-09-17) e escrever o `GATE.md` com o resultado e quem aprovou. Só então o G00 fica APROVADO.
