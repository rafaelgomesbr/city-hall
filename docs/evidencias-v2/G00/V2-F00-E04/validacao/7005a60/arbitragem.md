---
arbitro: arquiteto-software
modelo: claude-opus-5-5
etapa: V2-F00-E04
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
conflito: [red-team, qa, seguranca-aplicacao, banco-de-dados]
decisao: FAIL
confianca: alta
---

## Conflito

Três validadores (qa, seguranca-aplicacao, banco-de-dados) deram PASS; o red-team deu FAIL. O ponto em disputa é um só: `GET` e `HEAD /documentos/:id/termo-de-interdicao`, com conta desativada, papel rebaixado ou sessão encerrada, interditam o imóvel e gravam `documento_emitido` na trilha. A questão é se isso é ESCRITA, coberta pela DoD da E04 ("sonda de conta desativada não escreve") e pelo "Reabre se" do G00 ("qualquer rota de escrita aceitar conta desativada"), ou se é uma "leitura que escreve", que o bloco empurrou para a F03-E03.

Por que os três PASS não cobrem o ponto: os três varreram métodos de escrita. O relatório de segurança fez a varredura de GETs contando linhas e concluiu que "nenhum outro GET escreve" além de `/avisos` e do CSV, mas a contagem não alcançou o termo, porque o termo só tem efeito sobre uma ocorrência com vistoria que indica interdição e já despachada. Não houve contraprova. O PASS dos três é ausência de teste, não prova em contrário.

## Prova reproduzida

Limitação declarada: esta sessão de arbitragem não tinha shell, então não reexecutei a sonda. Reproduzi a cadeia causal pela leitura do código no SHA (HEAD `665b2be` difere de `7005a60` só em `docs/roadmap-v2/STATUS.md`, então a árvore de código lida é a do SHA validado) e conferi as saídas brutas do red-team no scratchpad da sessão.

Cadeia no código:

1. `dc360/apps/api/src/servidor.ts:478`: `const escrita = req.method !== "GET" && req.method !== "HEAD";`. Só com `escrita` verdadeiro se chamam `lerVigencia` e `exigirVigencia` (linhas 480 a 486). O comentário das linhas 470 e 471 afirma "`HEAD` conta como leitura porque é o que ele é".
2. `dc360/apps/api/src/rotas/documentos.ts:734-737`: `app.get("/:id/termo-de-interdicao")` chama `responder`, e `responder` chama `efetivarEmissao` (linha 725). O `.pdf` (linhas 848 e 849) passa pela mesma `efetivarEmissao` via `responderPdf` (linha 831).
3. `documentos.ts:675-680`: `efetivarEmissao` chama `registrarEmissao` e, quando é o ato, `marcarInterditada`.
4. `dc360/apps/api/src/trilha.ts:81-85`: `INSERT INTO trilha_eventos ... 'documento_emitido'` com `autor_papel = quem.papel`, e esse papel vem do TOKEN. `trilha.ts:146-153`: `UPDATE ocorrencias SET interditada_em = now(), interditada_por = $1`. `trilha.ts:117-120` registra que essa é, por decisão de desenho, a ÚNICA forma de interditar.

Saída do red-team, conferida em `scratchpad/rt/saida1.txt`:
- Sonda A (conta desativada): POST 403, `GET termo` 200; `interditada` passa de false para true, `emitidos` de 0 para 1, autor "Helena Vasques Coutinho/coordenador".
- Sonda B (papel rebaixado a operador, que não tem `emitir_documento`): `HEAD termo` 200, imóvel interditado e trilha com papel coordenador.
- Sonda C (sessões encerradas): `GET termo` 200, imóvel interditado.

Na contraprova, `scratchpad/rt/saida2-com-correcao-provisoria.txt`, a rota passa a ser tratada como escrita. As três sondas respondem então 403, 401 e 401, e o estado fica `interditada false, emitidos 0`. Isso mostra que a sonda morde e que a correção fecha o defeito. A leitura do código explica as duas saídas sem lacuna.

## Decisão e fundamento

**1. É ESCRITA.** A F03-E03 recebeu "vigência em LEITURAS" e "leituras que escrevem (`GET /avisos`)". O termo de interdição não é leitura que deixa rastro: é o ato administrativo de interditar, com três consequências. Muda estado de negócio (`ocorrencias.interditada_em`, `interditada_por`). Grava, na trilha append-only, um ato atribuído a uma pessoa e a um papel. Esse registro não se corrige, e no caso do rebaixamento o papel gravado é falso. O que define escrita é o efeito sobre o estado, não o verbo HTTP. O objetivo da etapa ("deixam de escrever") e o "Reabre se" do G00 ("qualquer rota de escrita") falam de rota, não de método. O bloco cita `/avisos` como exemplo de fato derivado sem autor, e não dá para estender essa exceção ao único caminho que interdita imóvel. Ler a exclusão de modo a abranger o termo esvaziaria o objetivo da etapa no seu caso mais grave.

**2. Veredito consolidado: FAIL.** Não é BLOCKED, porque a prova existe, é reproduzível e não tem ambiguidade de fato. Também não há decisão de produto pendente: os critérios estão escritos. Pela seção 7 de `28`, os itens 2 (vigência, conta desativada, sessão revogada), 4 (trilha append-only) e 9 ("Reabre se") não admitem RISCO ACEITO, então não há caminho de PASS sem conserto. Também falha a DoD "comentários batem com o código" (ver Outros achados).

## Conserto mínimo no escopo

Sem tocar em `comTenant` e sem conferir vigência em leitura comum, ou seja, sem antecipar a F03-E03:

1. **Critério de escrita por efeito.** Em `servidor.ts:478`, escrita passa a ser "método diferente de GET e HEAD OU rota marcada com efeito". A marca vai na configuração da rota (`config: { comEfeito: true }`, lida por `req.routeOptions.config`, no mesmo padrão das marcas de rota já existentes). Assim HEAD herda a marca do GET de graça.
2. **Rotas obrigatoriamente marcadas:** todas as que chamam `efetivarEmissao`, isto é, `laudo`, `termo-de-interdicao` e `termo-de-desinterdicao`, em HTML e em `.pdf`. Todas gravam `documento_emitido` (ato) em `trilha_eventos`, e o termo de interdição muda estado. Marcar só o termo de interdição deixaria laudo e desinterdição gravando ato na trilha append-only com papel do token, o mesmo defeito do item 4 da seção 7.
3. **Testes que mordem**, em `apps/api/test/vigencia-na-escrita.test.ts` ou em arquivo irmão:
   - As sondas A, B e C do red-team viram teste do repositório: GET e HEAD do termo, nos três estados fora da vigência, sem 2xx, com `interditada_em` NULL e zero `documento_emitido`.
   - Uma varredura sobre `app.printRoutes` ou a tabela de rotas: toda rota não GET e não HEAD, e toda rota marcada, com token de conta desativada, não pode responder 2xx. Isso fecha também a lacuna de PATCH, PUT e DELETE.
   - Uma guarda estática que falha se surgir GET cujo handler alcance `efetivarEmissao`, `registrarEmissao` ou `marcarInterditada` sem a marca.
4. **Comentários e documentação:** `servidor.ts:464-471` (inclusive "HEAD conta como leitura"), `auth/vigencia.ts:47-50` e `apps/api/PENDENCIAS.md:78-83`. Os três passam a dizer o critério "verbo de escrita ou rota com efeito" e a listar as leituras que ainda deixam rastro e ficam para a F03-E03: `GET /ocorrencias/:id` e `GET /busca` (`ocorrencia_consultas`), `GET /avisos` e, se não for marcado, o CSV.

O novo candidato precisa de nova rodada de validação sobre o novo SHA, com o red-team incluído.

## Outros achados

- **CSV `GET /relatorios/ocorrencias.csv` com conta desativada** (`rotas/prestacao-de-contas.ts:310`, com `INSERT INTO exportacoes` na linha 413 e `registrarAtoAdministrativo` na linha 446). Severidade alta, "corrige antes de implantar". NÃO é causa deste FAIL: a exposição do dado é leitura, e a vigência em leitura está planejada para a F03-E03 (`PENDENCIAS.md:16`). O registro gravado descreve com verdade o que aconteceu. Ainda assim, a rota grava um ato atribuído à pessoa na trilha administrativa append-only, então cumpre o mesmo critério do item 1 do conserto. Recomendo marcá-la no mesmo commit, a custo zero. Se ficar de fora, entra em `PENDENCIAS.md` como condição de implantação com dono F03-E03. Em nenhuma hipótese vira RISCO ACEITO: a seção 7, itens 2 e 3, impede, e por isso a sugestão nesse sentido do relatório de segurança fica rejeitada.
- **Falta teste de PATCH, PUT e DELETE.** Hoje o código está certo, pois a varredura de 51 rotas do relatório de segurança o confirma. Mas a mutação "só POST" passa na suíte, ou seja, nenhum teste guarda o predicado. Como o conserto muda exatamente esse predicado, o teste deixa de ser "corrige antes de crescer" e passa a fazer parte do conserto obrigatório (item 3 acima).
- **Comentários que não batem** (`vigencia.ts:47-50`, `servidor.ts:464-471`, `PENDENCIAS.md:78-83`). Bloqueiam pela DoD da E04 e pelo "Reabre se" do G00 ("documentação voltar a afirmar o que o código não faz"). São corrigidos junto, pelo item 4.
- **Anotados, sem efeito no veredito:** sessão com `expira_em` vencido e não revogada escreve (sonda E, 201), com janela limitada ao token de 15 minutos. A corrida entre desativar e escrever, em transações separadas, só fecha na F03-E03. A validação humana do bloco (Rafael vê a sonda antes e depois) continua pendente.
