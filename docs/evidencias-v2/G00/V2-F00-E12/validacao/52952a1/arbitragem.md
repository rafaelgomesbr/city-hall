---
validador: arbitragem (arquiteto-software)
modelo: claude-opus-5-5
etapa: V2-F00-E12
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [API, DOCUMENTO]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Conflito arbitrado (seção 7 de `28`): `especificacao.md` dá FAIL; `qa.md`, `seguranca-aplicacao.md` e `banco-de-dados.md` dão PASS. O QA da E22 (`V2-F00-E22/validacao/52952a1/qa.md`, achado 1) reproduziu o achado da especificação de forma independente.

Perguntas da arbitragem e resposta:

1. **O defeito existe?** Sim, reproduzido por mim (sonda própria, abaixo). Com a assinatura coletada e perdida no aparelho (o estado que a sincronização grava: `assinatura_chave` nula e uma linha em `vistoria_evidencias_perdidas` com `papel = 'assinatura'`, `apps/api/src/rotas/sincronizacao.ts:215-238`, descrito na migração 030), o laudo da rota imprime no bloco "Presente no local" `Assinatura coletada em campo e não recuperada do aparelho`, e o laudo do pacote imprime `Assinatura não coletada`. O termo de interdição tem a mesma diferença no bloco "Responsável pelo imóvel, ciente". O próprio pacote leva `tabelas/vistoria_evidencias_perdidas.csv` com a linha `papel = assinatura`, contradizendo o laudo e o termo que ele mesmo carrega. Causa: `documentos/laudo.ts` (`ausenciaDaAssinatura`) só diz "coletada e não recuperada" quando `evidenciasPerdidas` traz `papel === "assinatura"`, e `saida/pacote.ts` monta `DadosDocumento` sem `evidenciasPerdidas`.
2. **Os PASS contradizem o achado?** Não. O QA declara no próprio relatório que a sonda dele não tem "registro perdido" (Achados, segundo item anotado), então a frase "no texto inteiro só aparecem as diferenças esperadas" vale para os sete estados que ele montou, nenhum deles com perda de assinatura. Segurança e banco não tocam a perda (grep sem ocorrência de "perdid" ou "coletada em campo"). O conflito é de cobertura, não de fato.
3. **É critério da E12?** Sim. O bloco da etapa lista em "Documentação a atualizar" `dc360/docs/SAIDA-DE-MUNICIPIO.md` e `dc360/apps/api/PENDENCIAS.md`; esses textos são entregáveis da etapa. O precedente é direto e já foi julgado duas vezes nesta mesma etapa: a rodada 1 (arbitragem em Opus) reprovou porque a documentação afirmava igualdade que o código desmentia, e a rodada 2 reprovou porque a tabela não listava o caso da assinatura declarada e ausente. O "conserto mínimo" da rodada 2 foi "documentar a diferença da assinatura (ou o pacote consultar o armazenamento como a rota faz)". A correção 2 consertou aquele caso e reescreveu a tabela como inventário fechado ("As diferenças que existem HOJE", `SAIDA:153-165`; "três diferenças continuam ... e uma quarta é deliberada", `SAIDA:95`), e justificou a diferença deliberada com "o pacote não afirma ausência que ninguém conferiu" (`SAIDA:164`, `PENDENCIAS:301`). No caso da assinatura perdida o pacote afirma ausência contra o registro do banco, no bloco da assinatura, que a tabela trata como campo próprio em duas linhas. É a mesma classe de defeito das rodadas 1 e 2, no mesmo bloco que a rodada 2 mandou documentar.
4. **Não é coberto pela linha "Seção Registros capturados ... não existe"?** Não. Aquela linha descreve a ausência de uma seção; o defeito aqui é uma afirmação positiva falsa ("Assinatura não coletada") num campo que a tabela declara conferido, e aparece também no termo de interdição, que a tabela nem menciona. A gravidade em `PENDENCIAS:303-306` ("parece completo sendo incompleto") subestima: o documento afirma o contrário do fato, no papel que o comentário de `laudo.ts:665-671` chama de "motivo para anular o ato".
5. **DoD.** "Teste vermelho verde" e "casos de borda cobertos": cumpridos (32 de 32 no arquivo, mutações das outras dimensões mordem). "Pendência do montador único registrada": registrada, mas com o inventário de diferenças incompleto e uma justificativa desmentida. Item do G00 "saída de município": é do gatekeeper.

Não é regressão da correção 2 (o pacote nunca leu as perdas), e o código do aviso de equipe, que é o objetivo central, está certo. O FAIL é documental, como nas rodadas 1 e 2.

## Evidência

Saídas em `$SP/val/arbitragem/E12/`.

- `npm run build:shared` (em `dc360/`): código 0 (`00-build-shared.txt`).
- Sonda própria `sonda-arb.mts` (só o leitor de ZIP copiado da sonda da especificação; o resto escrito para a arbitragem): `bancoEmMemoria({ semear: true })`, `armazenamentoEmMemoria`, `construirServidor`, requisições por `app.inject` a `POST /auth/entrar`, `GET /documentos/<C3>/laudo`, `GET /documentos/<C3>/termo-de-interdicao` (coordenadora de Serra Alta) e `POST /saida/pacote.zip` (administradora). Estado montado: `UPDATE vistorias SET assinatura_chave = NULL` na F1 e um `INSERT INTO vistoria_evidencias_perdidas (..., papel) VALUES (..., 'assinatura')`. Execução `npx tsx sonda-arb.mts` a partir de `dc360/apps/api`: código 0 (`01-sonda.txt`; HTML em `rota-laudo.html`, `pacote-laudo.html`, `rota-termo.html`, `pacote-termo.html`). Saída literal:

```
ROTA   laudo  'Presente no local':  <div class="traco-ausente">Assinatura coletada em campo e não recuperada do aparelho</div> ... Cleuza Ramos de Andrade
PACOTE laudo  'Presente no local':  <div class="traco-ausente">Assinatura não coletada</div> ... Cleuza Ramos de Andrade
ROTA   termo  'Responsável pelo imóvel, ciente':  ... Assinatura coletada em campo e não recuperada do aparelho ...
PACOTE termo  'Responsável pelo imóvel, ciente':  ... Assinatura não coletada ...
CSV do próprio pacote, linhas com papel assinatura: 1
```

- Nenhum arquivo do repositório foi tocado; a sonda roda do scratchpad e não abre porta.

## Cenários positivos

- Leitura dos relatórios PASS: os cenários positivos deles (aviso igual, coordenada igual, assinatura declarada e ausente igual, assinatura presente com bytes no ZIP) não estão em disputa e não foram refeitos.

## Cenários negativos

- Assinatura coletada e perdida: o pacote imprime a afirmação contrária à da rota, no laudo e no termo (reproduzido).

## Tentativas de reprovar

- Tentei derrubar o FAIL da especificação: procurei se o cenário era artificial. Não é: `sincronizacao.ts` grava `vistoria_evidencias_perdidas` com o `papel` vindo do aparelho e a migração 030 descreve exatamente a assinatura que chega com `assinatura_chave` nula.
- Procurei se a tabela o cobria por outra linha: a linha da seção de registros perdidos não cobre a afirmação no bloco da assinatura nem o termo de interdição.
- Procurei decisão registrada (seção 9, D1 a D8, e seção 11) que aceitasse a diferença: nenhuma; a premissa (b) da E12 trata só da coordenada, já consertada.
- Conferi se o PASS do QA tinha prova contrária: não tem, a sonda dele não montou perda.

## Achados

1. **bloqueia.** Tabela de diferenças e justificativas de `dc360/docs/SAIDA-DE-MUNICIPIO.md` (`:95`, `:153-165`) e `dc360/apps/api/PENDENCIAS.md` (`:281-310`) desmentidas pelo código no caso da assinatura coletada e perdida. Reprodução acima.

Conserto mínimo (não implementado): opção A, só documentação: uma linha nas duas tabelas ("Assinatura coletada e perdida no aparelho: rota imprime 'Assinatura coletada em campo e não recuperada do aparelho'; pacote imprime 'Assinatura não coletada', no laudo e no termo de interdição; Diferente até a F09-E02"), a contagem de `SAIDA:95` refeita, a frase "o pacote não afirma ausência que ninguém conferiu" restrita ao caso do armazenamento sem resposta, a gravidade de `PENDENCIAS:303-306` corrigida, e um caso no bloco "campo por campo" de `test/saida-de-municipio.test.ts` que trave essa diferença. Opção B, código: o pacote ler `vistoria_evidencias_perdidas` da vistoria vigente e passar `evidenciasPerdidas` ao montador, o que conserta também a seção dos registros perdidos e obriga a atualizar a linha correspondente da tabela e o teste que a trava. Qualquer das duas fecha o FAIL; a B é a que tira o papel falso das mãos do município.

## Não verificado

- Não rodei `test:api`, `test:isolamento` nem e2e: não estão em disputa (todos os validadores os rodaram ou leram do CI, verdes).
- Não gerei o cenário de perda com uma sincronização de ponta a ponta pelo aparelho; montei o estado por SQL igual ao que a rota de sincronização grava.

## Risco residual

Até o conserto, o município que leva o pacote recebe laudo e termo de interdição que afirmam "Assinatura não coletada" quando a assinatura foi coletada e se perdeu, e a documentação diz o contrário.

## Motivo do humano

Nenhum: o defeito e o critério são verificáveis por execução e leitura.
