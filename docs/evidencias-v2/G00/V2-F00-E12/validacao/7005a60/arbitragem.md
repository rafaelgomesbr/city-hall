---
arbitro: arquiteto-software
modelo: claude-opus-5-5
etapa: V2-F00-E12
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
conflito: [especificacao, qa]
decisao: FAIL
confianca: media
---
## Conflito

`especificacao.md` deu PASS e, no achado 2 ("corrige antes de crescer"), registrou que `dc360/docs/SAIDA-DE-MUNICIPIO.md:95` responde "Sim" à linha "O laudo do pacote diz o mesmo que o laudo emitido", quando quatro campos diferem entre os dois laudos (coordenada, fotos de outras vistorias, fotos avulsas, registros perdidos). Pergunta: é FAIL da E12, documentação falsa que pertence à E22 (já FAIL por outros motivos), ou anotação?

## Prova reproduzida

Reprodução por leitura do código no SHA (HEAD 665b2be difere só no STATUS). Esta sessão não tinha ferramenta de execução de comando; a comparação executada dos dois HTML é a de `especificacao.md` (scratchpad `pacote.html` e `rota.html`), e a leitura abaixo confirma cada diferença.

1. Coordenada: `apps/api/src/rotas/documentos.ts:105` seleciona `v.latitude, v.longitude`; a consulta de vistorias do pacote (`apps/api/src/saida/pacote.ts:479-498`) não seleciona (o `latitude` de `:459` é o da OCORRÊNCIA). O laudo do pacote imprime "não registrada" onde o da rota imprime a coordenada.
2. Fotos de outra vistoria e avulsas: a rota filtra `vistoria_id = $2` (`documentos.ts:160`) e monta `fotosAvulsas` à parte (`:269`); o pacote lê `FROM evidencias WHERE enviada_em IS NOT NULL` por ocorrência (`pacote.ts:553-555`), sem filtro de vistoria, e não monta avulsas. Foto avulsa sai no pacote como foto da vistoria, atribuída ao agente.
3. Registros perdidos: a rota consulta `vistoria_evidencias_perdidas` (`documentos.ts:230-231`) e imprime a seção; o pacote não consulta (só exporta a tabela, `pacote.ts:67`). O laudo do pacote parece completo sendo incompleto.
4. O texto da E12: `SAIDA-DE-MUNICIPIO.md:95`, linha datada de 2026-10-06 (a própria E12), responde "**Sim, e isso passou a ser provado**" à equivalência dos laudos, e a prova citada só compara o trecho do aviso.
5. A pendência da E12: `apps/api/PENDENCIAS.md:21` e `:221-224` ("O que a consulta do pacote ainda não lê") listam SÓ latitude e longitude. `:215-217` diz que "a defesa é o teste que compara os dois documentos ENTRE SI", mas o teste compara só `<p class="nota">` (`especificacao.md`, achado 3).

## Decisão e fundamento

FAIL da E12, não da E22, e não anotação.

- De quem é o texto: o bloco da E12 manda atualizar `dc360/docs/SAIDA-DE-MUNICIPIO.md` e `apps/api/PENDENCIAS.md`, e a linha 95 foi escrita pela E12 em 2026-10-06. Entregável falso é defeito da etapa que o entregou. A E22 cobre, nesse arquivo, o item 5 (capítulo 2 contra capítulo 5), que o QA da E22 deu como PASS; a E22 faz a varredura final, mas não herda o defeito de quem o escreveu. Empurrar para a E22 deixaria a E12 PASS com entregável falso.
- DoD da E12: "pendência do montador único registrada". Está registrada de forma que afirma o falso: diz que a coordenada é o que a consulta ainda não lê, omitindo três diferenças mais graves (2 e 3 acima). O critério não está cumprido como escrito.
- Risco de segurança do bloco: "integridade de documento jurídico". A linha 95 é lida por quem administra o município e por um auditor como garantia de equivalência do laudo que fica no processo depois do contrato; a garantia não existe.
- "Reabre se" do G00: "a documentação ... voltar a afirmar o que o código não faz", item 9 da seção 7 de `28`, sem risco aceito. Não cabe anotação sob PASS.
- O código da E12 está certo e no escopo: o aviso de equipe é idêntico (provado por `especificacao.md` e pelos testes `saida-de-municipio.test.ts`), e as quatro diferenças são da F09-E02 (montador único), que o bloco exclui. O FAIL é só da documentação da etapa, e o conserto não toca código.
- Confiança média, não alta: a especificação leu "o mesmo" como "o mesmo aviso", leitura defensável pelo Objetivo do bloco. Decide a leitura de quem não conhece o código: a linha diz "o laudo", e o leitor do documento é o município, não o desenvolvedor.
- Não é BLOCKED: não há decisão de produto; é estreitar uma afirmação e completar uma pendência.

## Conserto mínimo no escopo

Só documentação, nos dois arquivos que o bloco manda atualizar:

1. `dc360/docs/SAIDA-DE-MUNICIPIO.md:95`: o rótulo vira "O aviso de equipe do laudo do pacote é o mesmo do laudo emitido" (Sim, com a prova atual) e uma linha nova, "O laudo do pacote é igual ao laudo emitido", responde **Não, ainda**: sem a coordenada da vistoria, com fotos de outras vistorias e avulsas misturadas às da vistoria, e sem a seção de registros que não puderam ser recuperados; o documento que vale é o emitido pela rota; unificação na V2-F09-E02.
2. `dc360/apps/api/PENDENCIAS.md:21` e `:221-224`: listar as quatro diferenças (coordenada, filtro de vistoria nas fotos, fotos avulsas, registros perdidos) e corrigir `:215-217` para dizer que o teste compara o trecho do aviso, não o documento inteiro.
3. Prova: `npm run conferir:numeros` e `npm test` (`regras-de-conteudo`) verdes depois da edição.
