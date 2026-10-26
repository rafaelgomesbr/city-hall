# V2-F00-E12, correção 1: a documentação deixa de dizer que o laudo do pacote é igual ao emitido

Base: `021ed45`, ramo `v2/f00`. Motivo: rodada 1 reprovada (arbitragem em Opus FAIL, SHA `7005a60`): `dc360/docs/SAIDA-DE-MUNICIPIO.md` respondia "Sim" a "o laudo do pacote diz o mesmo que o laudo emitido", e `apps/api/PENDENCIAS.md` citava só latitude e longitude, quando a validação de especificação provou quatro campos diferentes entre os dois laudos da mesma vistoria.

## Fatos

**Decisão sobre o código.** Das quatro diferenças, só a coordenada foi consertada: são duas colunas (`v.latitude`, `v.longitude`) que a consulta da rota já lia e a do pacote não, o tipo do laudo já aceita o campo nulo, e o teste novo prova antes e depois. As outras três (fotos de todas as vistorias no pacote, seção das fotos avulsas, seção dos registros perdidos) exigem trazer duas consultas e a regra de "vistoria vigente" para a consulta do pacote: é a unificação dos montadores, que o bloco da F09-E02 já reserva. Foram só documentadas e travadas por teste.

**Tabela de conferência (afirmação, onde, o que o código faz, ação).**

| Afirmação | Onde | O que o código faz | Ação |
| --- | --- | --- | --- |
| "O laudo do pacote diz o mesmo que o laudo emitido: Sim" | `dc360/docs/SAIDA-DE-MUNICIPIO.md`, linha 95 | Aviso de equipe igual (teste `saida-de-municipio.test.ts`, bloco do aviso, e seção 29 do e2e). Coordenada: a rota lê `v.latitude, v.longitude` (`rotas/documentos.ts`, SELECT da vistoria) e o pacote não lia (`saida/pacote.ts`, SELECT de `vistorias`), imprimindo "não registrada". Fotos: a rota filtra `vistoria_id = vigente`, o pacote traz `evidencias` de toda a ocorrência com `enviada_em`. Seções `Fotografias anexadas ao protocolo` e `Registros capturados que não puderam ser recuperados`: a rota monta `avulsas` e `perdidas`, o pacote não | Linha reescrita ("Só em parte"), com as três diferenças que restam e o risco de ler o laudo do pacote como substituto |
| "Agora as duas junções existem nos dois montadores, e o teste compara os dois documentos" | mesmo arquivo, mesma linha | Verdadeiro para as duas junções de equipe; o teste compara o trecho do aviso, não o laudo inteiro | Frase mantida, com o escopo dito ("o trecho do aviso") e o teste novo de campo por campo citado |
| "Um conserto numa delas continua podendo não chegar à outra" e "o teste ... é o que avisa quando isso é esquecido" | `SAIDA-DE-MUNICIPIO.md`, seção "O risco que continua aberto" | O teste antigo só olhava `<p class="nota">`; nada pegava as quatro diferenças | Tabela de diferenças acrescentada ao texto; o teste novo passa a avisar de verdade |
| "A consulta do pacote ainda não lê `v.latitude` nem `v.longitude`... não é o defeito desta etapa" | `dc360/apps/api/PENDENCIAS.md`, seção "Dois montadores de dados do documento" | Diz só duas das quatro diferenças | Parágrafo trocado por tabela com as cinco linhas (aviso, coordenada, fotos, seção das avulsas, seção dos perdidos) mais a assinatura, estado de cada uma e gravidade |
| Linha do resumo do topo: "o do pacote não lê a coordenada da vistoria" | `apps/api/PENDENCIAS.md`, tabela do início | Só a coordenada estava nomeada | Troca: nomeia as três que continuam |

**O que mudou no código.**

- `dc360/apps/api/src/saida/pacote.ts`: a consulta de vistorias do pacote ganhou `v.latitude, v.longitude`, com comentário no estilo do arquivo dizendo as três diferenças que restam e onde elas estão travadas.
- `dc360/apps/api/test/saida-de-municipio.test.ts`: bloco novo "O laudo do pacote e o da rota, campo por campo", 3 casos, depois do bloco do aviso de equipe. Prepara a vistoria F1 com coordenada, uma foto avulsa (`vistoria_id` nulo) e um registro perdido, gera os DOIS laudos (rota e pacote) e compara. (1) A coordenada sai igual nos dois. (2) Diferença conhecida: nenhuma seção do pacote falta na rota, e as seções que a rota tem e o pacote não são exatamente as duas nomeadas. (3) Diferença conhecida: a foto avulsa aparece no "Registro fotográfico" do pacote e na seção própria da rota. Os casos (2) e (3) são de propósito um guarda de documentação: quando a F09-E02 unificar os montadores, eles reprovam e mandam apagar a ressalva dos dois documentos. O `afterAll` devolve o estado.
- `dc360/scripts/baseline.mjs`: `"V2-F00-E12-correcao-1": { total: 3 }` na tabela de contagens da API.

**Mordem (vermelho antes, verde depois).** Com o código-fonte anterior (só o `pacote.ts` sem as duas colunas): `saidas/01`, 28 testes, 1 falha (o caso da coordenada: o laudo do pacote não contém "-22.900000, -43.200000"), 27 passam (os dois casos de diferença conhecida passam por descreverem o estado real). Depois: `saidas/02`, 28 de 28.

**Regressão.** `npm run test:api` (`03`): 1299 de 1299, 99 arquivos (eram 1296; +3). `npm run test:isolamento` (`04`): 327 aprovados e 3 pulados, igual à linha de base. `npm run typecheck` (`05`): código 0. `npm run conferir:numeros` (`06`): 24 afirmações, nenhuma divergência (README e COLOCAR-DE-PE.md atualizados para 1299, 2925 e 4828). Portão de conteúdo (`07`): 8 de 8. `scripts/baseline.test.mjs` (`08`): 16 de 16.

**Limitações.** Não rodei o e2e de navegador (seção 29 de `fluxo-api.e2e.mjs`): a mudança do código são duas colunas a mais numa consulta, e a seção 29 compara só o trecho do aviso. A diferença "fotos de vistorias anteriores no pacote" está provada pelo SQL e pelo caso da foto avulsa, não por um pacote com re-vistoria real. Os casos (2) e (3) do teste novo documentam diferenças; eles passam quando o defeito EXISTE, de propósito.

Arquivos: `dc360/apps/api/src/saida/pacote.ts`, `dc360/apps/api/test/saida-de-municipio.test.ts`, `dc360/scripts/baseline.mjs`, `dc360/docs/SAIDA-DE-MUNICIPIO.md`, `dc360/apps/api/PENDENCIAS.md` (as seções do pacote; o resto desse arquivo está no patch da E22). Patch em `diff-da-correcao.patch`.

## Justificativa

O laudo do pacote é o papel que fica no processo do município depois de o contrato acabar. Afirmar que ele é igual ao emitido quando traz foto atribuída ao agente que ele não fez, e omite a seção que diz que um registro de campo se perdeu, é documentação que promete mais do que o código entrega, exatamente o risco que a etapa existia para fechar. Consertar a coordenada custa duas colunas e é seguro; as outras três são a unificação dos montadores (F09-E02), e fazê-las aqui seria antecipar essa etapa com risco de regressão no laudo que a prefeitura já imprime. Por isso o texto passa a dizer a verdade, e o teste novo impede a verdade de envelhecer: ele reprova tanto se alguém consertar uma diferença sem atualizar a documentação quanto se aparecer uma diferença nova.
