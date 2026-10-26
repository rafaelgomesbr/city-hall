# V2-F03-E01, correção 4: leitura do verificador adiado e `origens_de_conta` na eliminação

**Base:** `origin/trab/f03-0a-e01-adr` em `58fde5a0` (correção 3). Só documento: a ADR 0009 e esta pasta. Nenhum
código, migração, teste ou `package.json`. CLAUDE.md, STATUS, ESTADO-ATUAL, `dividas.md`, `pendencias-humanas.md` e o
`plano-f03.md` não foram tocados. Situação da ADR continua PROPOSTA. A proposta de redação do CLAUDE.md não mudou:
vale a da correção 2.

**Entrada:** quarta rodada da revisão de segurança sobre `58fde5a0` (Codex, somente leitura). Um ponto IMPEDE, uma
DÍVIDA e uma NOTA. Regras 3 e 6 das travas: FECHADO (mantidas sem mudança). Teste de tempo: PARCIAL, aceito como
obrigação da etapa que o traz (mantido sem mudança, decisão 3, "o que o teste de tempo não prova"). A NOTA (nenhum
caminho de forja da marca demonstrado; depende da implementação e dos testes) não pede mudança.

Para conferir a coerência com o que já foi implementado, li `origin/trab/f03-1b-e15-pessoas` em `037ab8ab` (054,
`db/test/catalogo/f03-e15.ts`, `conferir-objetos.ts`, `pessoas.test.ts`, RESUMOs da E15) e
`origin/trab/f03-0g-extensao-do-portao` em `61f15bb7` (RESUMO da 0G e da correção 1, roteiro das sabotagens).

## Os itens

| # | Ponto da rodada 4 | O que mudou | Onde na ADR |
| --- | --- | --- | --- |
| 1 | IMPEDE: o `dc360_app` não tem SELECT em `origens_de_conta`, então a função do adiado precisa ler com privilégio, e o teste da 0B reprovava toda função que citasse a tabela fora do criador e de `aceitar_convite` | Exceção estreita do LEITOR: o verificador adiado pode ler, e só ler, nas quatro condições abaixo. Os escritores continuam a função do gatilho criador e `aceitar_convite` (mais o backfill, que é a migração). O teste da 0B separa escritor de leitor no corpo, e os testes da E15 e da E10 conferem no comportamento que o verificador não escreve | Decisão 1, "Quem pode defini-la (os ESCRITORES)" e "Quem pode LER a marca"; "Na E15" (a 058 não amplia o leitor); decisão 8, catálogo; testes 0B, E15, E10; proibido; alternativas |
| 2 | DÍVIDA: tratamento de `origens_de_conta` na eliminação do município (038) | A marca não tem `organizacao_id` (a ADR alinha com a 1B), é exceção PROTEGIDA, e na eliminação vai com a conta que descreve, e só com ela: removida pelo `usuario_id` da conta apagada, nunca por pessoa nem sem filtro, pelo escritor `criador` num gatilho de `DELETE` de `usuarios`; a trava de permanência recusa DELETE de marca de conta viva para todo papel. Destino `some` no catálogo da 0G | Decisão 1, "Onde a marca mora" e subseção nova "A marca quando a conta some"; inventário (linha da 038); decisão 7 (caminho da eliminação e frase sobre a marca); consequências E15; testes E15 e E18; proibido; ruins (eliminação); alternativas |
| 3 | FECHADO: regras 3 e 6 | Sem mudança | Decisão 7 |
| Obs. | Teste de tempo sem estabilidade demonstrada | Sem mudança: segue como obrigação da etapa (caracterizar o ambiente e demonstrar a estabilidade antes de tornar o teste obrigatório no CI) | Decisão 3, "Como se prova" |

Mais: data no cabeçalho (correções 2, 3 e 4), seção de contexto "O que a quarta rodada da revisão mudou (correção
4)", a quarta rodada em "Estado e aceite" e esta pasta em "Onde isto vive".

### Item 1, os trechos

As quatro condições do leitor, que valem juntas (decisão 1):

> 1. **só leitura:** nenhum INSERT, UPDATE, DELETE, TRUNCATE, MERGE ou COPY sobre `origens_de_conta`, nenhum `EXECUTE`
>    de texto montado e nenhuma chamada a outra função que cite a tabela;
> 2. **só a marca da própria conta:** `usuario_id = NEW.id`; e, na conferência por comando de que nenhuma marca
>    `criador` ficou sem conta (gatilho de comando que a 1B acrescentou), só as marcas gravadas pela própria transação
>    (`transacao = pg_current_xact_id()`). Nunca por `pessoa_id`, por e-mail ou por município;
> 3. **nada volta ao chamador:** é função de gatilho (`RETURNS trigger`), sem EXECUTE de papel do produto nem de
>    `PUBLIC`, disparada só pelos gatilhos declarados de `public.usuarios` e conferindo `TG_RELID` (regras da 0G); o
>    retorno do gatilho `AFTER` é descartado; e a recusa sai com mensagem e detalhe constantes, sem nenhum valor lido
>    da marca (nem pessoa, nem origem, nem transação), igual para marca ausente, de outra transação ou incoerente;
> 4. **declarada no catálogo:** ou o verificador é a MESMA função do gatilho criador (o desenho da 1B: um corpo só,
>    com o ramo escolhido por `TG_WHEN` e `TG_LEVEL`), e então a função é declarada uma vez, como escritora
>    `criador`, e a leitura vem com ela; ou é uma função separada, declarada como LEITORA (no máximo uma), e então o
>    corpo dela inteiro cumpre a condição 1, conferida no texto.

O comportamento, nos dois desenhos: "disparado o adiado dentro da transação (`SET CONSTRAINTS ... IMMEDIATE`) e na
confirmação, o conteúdo de `origens_de_conta`, lido pelo dono, é o mesmo antes e depois do verificador, no caminho que
passa e no que recusa."

O teste da 0B (linha da tabela de testes obrigatórios) passa a ser: "função do banco (privilegiada ou não) que cita
`origens_de_conta` no corpo e não é escritora declarada (função do gatilho criador, `aceitar_convite`) nem a leitora
declarada (o verificador adiado) reprova; leitora declarada com INSERT, UPDATE, DELETE, TRUNCATE, MERGE ou COPY sobre
a tabela, ou `EXECUTE` de texto montado, no corpo reprova; segunda leitora reprova; leitora que não é função de
gatilho, que tem EXECUTE de papel do produto ou que dispara fora dos gatilhos declarados de `usuarios` reprova; marca
`aceite` fora de `aceitar_convite` reprova". "Privilegiada ou não" acompanha o que a 1B já confere
(`conferirQuemCitaOrigensDeConta` olha toda função fora do sistema).

Coerência com a decisão do gatilho: o parágrafo "Na E15" diz agora que a 058 "redefine o gatilho criador e o
verificador (uma função só, no desenho da 1B) para aceitar `aceite`, sem ampliar o que o verificador lê nem dar a ele
escrita". O `BEFORE INSERT` que procura a marca `aceite` é o criador (escritor), não o leitor.

### Item 2, os trechos

> - **a marca vai com a conta que ela descreve, e só com ela.** A marca de cada conta apagada sai no mesmo comando que
>   apaga a conta, escolhida pela própria conta (`usuario_id` igual ao id da conta apagada) e por nenhum outro
>   critério: nunca por `pessoa_id` (a mesma pessoa pode ter conta viva em outro município, e a marca daquela conta é
>   a prova de lá), nunca por transação, nunca sem filtro. Quem remove é o escritor `criador` (a função do gatilho
>   criador, num gatilho de `DELETE` de `public.usuarios`; no desenho da 1B, um ramo próprio da mesma função,
>   separado do ramo que verifica), nunca o verificador, nunca função nova e nunca
>   `ordem_de_apagamento_por_municipio()`: a tabela não tem `organizacao_id`, então fica fora da ordem sem esbarrar no
>   DC366, e a função da ordem não a cita;
> - **a trava de permanência fica mais exata, não mais frouxa:** recusa UPDATE sempre, TRUNCATE sempre e DELETE de
>   marca cuja conta ainda existe, para todo papel, inclusive o dono; a conferência de "a conta ainda existe" enxerga
>   a conta em qualquer município, sem depender do contexto nem do RLS de quem apaga, e na dúvida recusa;

Por que `some` e não `fica` (a forma que a 1B e a 0G adotaram): com `fica` a marca da conta eliminada fica órfã,
apontando para conta apagada; guarda, depois da eliminação, a ligação da pessoa com uma conta do município eliminado,
que é o resíduo que a eliminação existe para tirar; e a chave dela continua ocupando o id da conta, um sinal a mais
que a chave de `usuarios` já não dá. Com `some`, a chave da marca anda junto com `usuarios.id`. Por que não
`organizacao_id` (a forma da correção 3): a 038 exige toda tabela com a coluna na ordem de apagamento (DC366), e a
função da ordem passaria a citar a tabela, fora dos escritores e do leitor. As duas formas descartadas estão na tabela
de alternativas.

A marca não é nível da ordem das travas: só é escrita por quem já segura a linha da conta (INSERT e DELETE da conta,
pelos gatilhos) ou antes de a conta existir (`aceitar_convite`, regra 7). A eliminação continua a única exceção
declarada à regra 1, sem trava nova.

## Divergências com o que já foi implementado (a resolver na junção da 1B)

Nada abaixo está implementado do jeito da ADR corrigida, salvo onde dito.

| # | Assunto | ADR (correção 4) | 1B em `037ab8ab` e 0G em `61f15bb7` | Situação |
| --- | --- | --- | --- | --- |
| D1 | `organizacao_id` em `origens_de_conta` | sem a coluna, exceção protegida | sem a coluna (054, cabeçalho item c) | CONVERGE: a ADR passou a dizer o que a 1B fez |
| D2 | Verificador como leitor | mesma função do criador ou leitora separada, nas quatro condições | o verificador é ramo de `conta_ganha_pessoa`, declarada `gravaOrigemDeConta: "criador"`; recusa com mensagem constante; o ramo de comando lê só marcas da transação | CONVERGE no desenho. FALTA o teste comportamental de que o verificador não escreve (`pessoas.test.ts` não usa `SET CONSTRAINTS` nem compara `origens_de_conta` antes e depois do adiado). O catálogo (`conferirQuemCitaOrigensDeConta`) não tem a noção de leitora separada: não faz falta no desenho da 1B, e só precisa ser estendido se alguém separar o verificador |
| D3 | Destino da marca na eliminação | `some`: a marca sai com a conta apagada, pelo `usuario_id`, e só com ela | `fica`: a 054 recusa todo DELETE da marca (`origens_de_conta_nao_se_reescrevem`, para o dono também) e diz que ela "sobrevive à eliminação junto com a pessoa (H98)"; o RESUMO da E15 diz o mesmo; a 0G sugeriu declarar `ORIGEM_FICA` e provou `fica` na junção dela. A 1B em `037ab8ab` ainda não declara `semMunicipio` em `f03-e15.ts` | DIVERGE. É o que a junção da 1B tem de resolver |
| D4 | Testes de eliminação da marca | E15: marcas do município eliminado somem, nenhuma sem conta, as de outro município iguais valor por valor; DELETE de marca de conta viva recusado também como dono | só o DELETE pelo `dc360_app` com permissão negada e o DELETE pelo dono recusado sempre | DIVERGE (segue de D3) |

## Para o orquestrador

**H97.** O texto atual em `origin/v2/f03` diz que o aceite vale para a ADR corrigida em `4d64a69` (correção 2). Ele
já estava atrasado depois da correção 3, e precisa citar a correção 4. Sugestão de redação para o fim da linha:
"O aceite vale para a ADR corrigida em `<SHA do commit da correção 4>` (correção 4, depois da quarta rodada da
revisão de segurança) e para
`docs/evidencias-v2/G03/V2-F03-E01/correcao-2/proposta-de-redacao-do-claude-md.md`, que continua valendo." A proposta
do CLAUDE.md não muda.

**Junção da 1B (E15).** Para a 054 e o catálogo ficarem com a ADR, sem afrouxar nada do que a 1B e a 0G já provam:

1. Declarar em `f03-e15.ts`, na exceção `origens_de_conta`, `semMunicipio: { especie: "protegida", naEliminacao: {
   destino: "some", ... } }`, com `semearOutroMunicipio` (exigência da correção 1 da 0G), e não o `ORIGEM_FICA` do
   roteiro da 0G. Precisa ser já na E15: a 0G (correção 1) preserva o regime na redefinição, então uma etapa
   posterior não consegue trocar `fica` por `some`.
2. Na 054, acrescentar a `conta_ganha_pessoa` um gatilho `AFTER DELETE ... FOR EACH ROW` de `public.usuarios` (o
   quarto da mesma função, na lista de `TG_NAME`, `TG_WHEN` e `TG_LEVEL` permitidos e com `TG_RELID`), cujo ramo
   apaga só `WHERE usuario_id = OLD.id`; declarar esse gatilho em `gatilhos` e manter `gatilhoEm: ["usuarios"]`.
3. Trocar, só para `origens_de_conta`, a trava `origens_de_conta_nao_se_reescrevem`: UPDATE e TRUNCATE recusados
   sempre; DELETE recusado quando existe linha de `usuarios` com `id = OLD.usuario_id`, conferido com privilégio que
   enxerga todos os municípios e falhando fechado. A `linha_permanente` de `pessoas` não muda.
4. Atualizar o cabeçalho da 054 (item c e "O que entra", item 2) e o `COMMENT ON TABLE origens_de_conta`, que hoje
   dizem que a marca sobrevive à eliminação.
5. Em `pessoas.test.ts`: o teste comportamental de D2 (adiado com `SET CONSTRAINTS ... IMMEDIATE` e na confirmação,
   no caminho que passa e no que recusa, conteúdo da tabela igual antes e depois); a eliminação de um município com
   marcas do outro intactas; DELETE de marca de conta viva recusado como dono. A prova do destino `some` da 0G cobre a
   eliminação de verdade com o outro município.
6. Efeito colateral a conferir: conta inserida e apagada na mesma transação (só o dono apaga conta) passa a não ter
   marca no fim da transação, e o adiado recusa. É falha fechada; se algum teste da cadeia fizer isso, ele precisa
   separar as transações.

**Plano (`docs/roadmap-v2/retomada/plano-f03.md`, NÃO editei).** Na linha 1B do bloco "Tabela protegida
`origens_de_conta`", acrescentar "sem `organizacao_id`; destino `some` na eliminação (a marca sai com a conta, pelo
gatilho de `DELETE` de `usuarios`, e só com ela); o verificador adiado só lê (correção 4)". Na linha 0B e 0D, trocar
"reprovam função privilegiada que cite `origens_de_conta` fora do gatilho criador e de `aceitar_convite`" por
"reprovam função que cite `origens_de_conta` fora dos escritores (gatilho criador e `aceitar_convite`) e do
verificador adiado, leitor só de leitura (correção 4)". Na linha 3C, acrescentar "o verificador redefinido continua
só leitor".

**E18.** Ganha um caso: eliminação de A tira a marca da conta de A e deixa igual a da conta de B da mesma pessoa.

## Portões (saídas nesta pasta)

- `regras-de-conteudo.txt`: `npx vitest run packages/shared/test/regras-de-conteudo.test.ts` em `dc360/` depois de
  `npm ci --ignore-scripts`; o único reprovado admitido é o EPERM de symlink do Windows (DV-46).
- `gerar-estado.txt`: `node scripts/roadmap/gerar-estado.mjs --conferir` da raiz.
- `node dc360/scripts/conferir-indices-de-evidencia.mjs` da raiz, depois da linha nova no `INDEX.md` da etapa.
- `dc360/node_modules` apagado depois dos portões.
