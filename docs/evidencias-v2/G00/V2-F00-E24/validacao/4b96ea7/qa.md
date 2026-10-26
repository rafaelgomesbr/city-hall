---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E24
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [DOCUMENTO]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: media
humano_necessario: sim
escalar: nenhum
---
Veredito: FAIL, de confiança média. Os seis documentos que a etapa listou foram ajustados com cuidado (estado real dito no topo, cartão sem passo de declarar, apresentação com "Parcial" e PDF regenerado). Mas a varredura pelo objetivo da etapa ("nada que se mostre ou entregue a município afirma que o agente declara a saída a campo") achou quatro frases que prometem o acompanhamento ou a declaração sem ressalva: uma no próprio HTML e PDF que a etapa corrigiu, duas na apresentação de produto e uma na política de privacidade. Se o gatekeeper ler o critério só pela letra ("o agente declara no aplicativo"), o achado 1 cai para o segundo balde e a etapa passa com ressalvas; deixo a decisão com ele e com o Rafael porque é texto de produto.

Saídas e temporários em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/qa-painel/` (abaixo, `qa-painel/`). Nada foi commitado e a árvore ficou limpa.

## Critérios verificados

| # | Critério | Resultado |
| --- | --- | --- |
| 1 | O fato por trás da ressalva: o aplicativo não declara, não prorroga, não confirma retorno nem chama `/minha` | PASS. Busca em `apps/campo/src` e `packages/campo/src` por `saida-a-campo`, `/minha`, declarar e prorrogar: a única ocorrência é um comentário em `apps/campo/src/dados/api.ts:518`; o app só lê o booleano `emCampo` dos colegas |
| 2 | `SEGURANCA-DO-AGENTE.md` | PASS. Caixa de estado no topo ("recurso em construção, ainda não disponível", "nenhum prazo estourado aparece, mesmo com um agente sozinho no morro", "Não conte com este recurso para a segurança de ninguém"); a seção 5 marca o aplicativo como "planejado, ainda não existe" |
| 3 | `CARTAO-DO-AGENTE.md`: nenhum passo manda declarar a saída no aplicativo | PASS. O passo 2 manda avisar a coordenação por rádio ou telefone e diz "O aplicativo ainda não registra a sua saída ... não avisa ninguém se você não voltar no prazo"; "AO VOLTAR" manda avisar a coordenação e diz que o aplicativo ainda não registra o retorno |
| 4 | `GUIA-DO-COORDENADOR.md` seção 9 | PASS. "A tela existe, mas fica vazia", "o sino não vai avisar de prazo estourado nenhum", "Tela vazia, hoje, não quer dizer que ninguém está no morro", "Acompanhe as saídas pelo procedimento que o município já usa (rádio, telefone)" |
| 5 | `README.md`, seção "O agente que sobe o morro sozinho" | PASS. Abre com "pela metade, e a metade que falta é a do agente" e diz que o aplicativo não chama declarar, prorrogar, retorno nem `/minha` (confere com o critério 1) |
| 6 | `docs/LEIA-ME.md` | PASS. A linha da tabela diz "Em construção: o servidor e a tela da coordenação estão prontos, o aplicativo do agente ainda não declara a saída" |
| 7 | Apresentação: selo "Pronto" trocado por "Parcial" na linha de segurança, no HTML e no PDF | PASS. `2026-09-15-para-o-alyson.html:394` é `p-parcial` "Parcial" com a ressalva e a nota "Corrigido em 07/10/2026: a versão anterior desta tabela dizia 'Pronto'"; o PDF (mesma data e hora do HTML, 24 páginas) traz a linha corrigida (`pdftotext`, `qa-painel/apresentacao-utf8.txt`); a linha 391 (perfil) também diz que o indicador "hoje não acende". Nenhum "Pronto" fica em linha de segurança do agente |
| 8 | `relatorio-apresentacao-alyson.html` e o PDF, na raiz | PASS. Busca por "em campo", "sozinho", "segurança do agente", "saída a campo", "retorno" no HTML e no texto do PDF (`qa-painel/relatorio-raiz.txt`): só "Coletas reais de agentes em campo durante 2 semanas" (plano de piloto, não promessa do recurso) |
| 9 | As 27 provas da API e do painel seguem verdes, nada removido | PASS. `apps/api/test/saida-a-campo.test.ts`: 27 de 27; `apps/web/test/quem-esta-em-campo.test.ts`: 4 de 4; `git diff afde25c..4b96ea7 --stat` das duas fontes e do teste da API: vazio (nenhuma linha mudou) |
| 10 | `regras-de-conteudo` verde | PASS. 8 de 8 (`qa-painel/shared-test.txt`); zero travessão nos documentos tocados |
| 11 | CP-02 registrado | PASS no registro (`docs/evidencias-v2/CP-02/decisao.md`: "DECIDIDO, como premissa a confirmar"; diz com todas as letras que a confirmação de Rafael e Alyson não existe por escrito) |
| 12 | Nenhum documento promete a declaração no app sem ressalva | FAIL (achados 1 e 2) |

## Evidência

Leitura dos documentos com número de linha; `qa-painel/apresentacao-utf8.txt` e `relatorio-raiz.txt` (texto extraído dos dois PDFs com `pdftotext`); `qa-painel/shared-test.txt`; execução dos testes de saída a campo citados acima; busca em `apps/campo`. O gerador de PDF informou 24 páginas e zero erro de console (`docs/evidencias-v2/G00/V2-F00-E24/gerar-pdf.txt`); não o rodei de novo porque ele escreve no PDF versionado, e comparei o texto do PDF com o do HTML.

## Cenários positivos

Os critérios 2 a 8: cada documento diz o estado real.

## Cenários negativos

Procurei, em todos os `.md` e `.html` fora de `docs/evidencias-v2`, `docs/auditoria-v2` e `docs/roadmap-v2`, as frases "saída a campo", "declara a saída", "quem está em campo", "prazo estourado", "confirma o retorno", "saida-a-campo": o resultado passa de 80 arquivos (o limite da ferramenta cortou a lista), quase todos código, teste e evidência. Li as ocorrências em todo documento entregável que a lista mostrou: `dc360/docs/*.md`, `dc360/README.md`, as duas apresentações, o relatório da raiz e o `PAPEIS_E_RESPONSABILIDADES.md`. Quatro frases passaram sem ressalva (achados 1 a 3).

## Tentativas de reprovar

1. Procurei "Pronto" em linha de segurança do agente em HTML e PDF: nenhum.
2. Procurei passo do cartão que mande declarar no aplicativo: nenhum.
3. Procurei promessa de que o aplicativo avisa o agente ou a coordenação: nenhuma.
4. Procurei nos demais documentos entregáveis o "acompanha quem está em campo" e o "declarado pelo agente" sem a ressalva da tela vazia: achei quatro frases (achados 1 e 2).
5. Procurei o app dizer ao agente que a saída é registrada: as telas do aplicativo não dizem; o único texto sobre o assunto é código-comentário e o indicador de colega "em campo agora", que nunca acende.
6. Conferi se o PDF refletia o HTML: o texto da linha de segurança confere, e a linha 391 também.

## Achados

Primeiro balde, BLOQUEIA (2 itens). Dono: E24.

1. **A mesma apresentação que a etapa corrigiu ainda diz, sem ressalva, que o operador "acompanha quem está em campo".** `dc360/docs/apresentacao/2026-09-15-para-o-alyson.html:498`: "Operador / plantonista, Parcial: Registra chamado com a pessoa na linha, vê a duplicidade, registra resposta de providência e acompanha quem está em campo"; a frase está também no PDF (`qa-painel/apresentacao-utf8.txt`, linha 319). O "Parcial" daquela linha é pelo sistema de postos, não por isto. Mesma promessa, sem a ressalva, em `docs/apresentacao-produto-alyson.html` (apresentação de produto "pronta para virar PDF", entregável a município): linha 333, "O operador ... acompanha quem está em campo, inclusive de madrugada", e linha 381, tabela "Acompanhar quem está em campo: Sim" para operador, coordenador e administrador, sem a ressalva. A tela existe, mas fica vazia porque nenhuma saída é declarada (critério 1; GUIA, seção 9). É a promessa que o risco da etapa descreve ("alguém sobe o morro contando com um alerta que não existe"), e o GUIA diz ao coordenador o contrário do que esta apresentação diz ao município. Esperado: ressalva de uma frase, como a da linha 394, ou a retirada da frase; o PDF regenerado com `docs/apresentacao/gerar-pdf.mjs`. A busca da etapa por "saída a campo", "declara" e "Segurança do agente" não acha isto porque a frase usa outras palavras.
2. **`dc360/docs/PRIVACIDADE.md:95-99` afirma que o agente declara, sem ressalva.** "Desde 14/09/2026 há mais uma categoria ...: a saída a campo declarada pelo agente, com o protocolo para onde ele foi, o tempo que ele previu, se ele foi sozinho, e o prazo de retorno. É dado sobre o servidor, ele mesmo declara"; a linha 176 (tabela de retenção) repete "Saída a campo declarada" no presente. Hoje nenhum agente consegue declarar, então o texto descreve uma coleta que não acontece. A etapa dizia que a `PRIVACIDADE.md` "segue verdadeira" por descrever o que a API guarda; a frase, porém, é a mesma que o negativo da etapa manda não deixar (frase que afirma que o aplicativo declara a saída, sem ressalva). O que o município lê sobre o dado do servidor público fica incompleto: ele não sabe que hoje o dado não nasce. Ressalva de uma frase ("a API guarda; o aplicativo ainda não envia, V2-F14-E01").

Segundo balde, CORRIGE ANTES DE CRESCER:

3. `dc360/docs/PAPEIS_E_RESPONSABILIDADES.md:40` e `:47` dizem "Acompanhar quem está em campo, e encerrar uma saída" como permissão do operador. É verdade como permissão, e a frase não diz que o dado não chega; acrescentar a remissão ao estado do recurso.
4. A etapa decidiu, e o CP-02 registra, que a D-25 é só premissa: nenhuma confirmação de Rafael ou Alyson está por escrito. Toda a ressalva "planejado, sem data" depende disso; se a premissa for revertida (alternativa B), os mesmos documentos precisam passar de "planejado" para "retirado".

Terceiro balde, ANOTADO:

5. `apps/campo/src/app/(agente)/perfil.tsx` mostra o indicador "quem está em campo agora" dos colegas, que nunca acende; a apresentação já diz isso (linha 391). Sem texto na tela do app avisando.
6. O gerador de PDF não foi repetido por mim (ver Evidência).

## Não verificado

- A leitura da apresentação ajustada por Rafael e Alyson antes de qualquer demonstração (validação humana da etapa) e a confirmação do CP-02.
- Se o PDF tem alguma frase do HTML que o `pdftotext` não extrai (imagem); comparei o texto.
- Documentos que ficam fora do repositório (e-mails, propostas, slides enviados).
- `docs/DECLARACAO-NAS-LOJAS.md` e `apps/campo/LOJAS.md` só por busca de palavras (nenhuma promessa de saída a campo).

## Risco residual

Município que receba `docs/apresentacao-produto-alyson.html` ou o PDF da apresentação de 15/09 lê que o operador acompanha, de madrugada, quem está em campo, e não vê a ressalva que o GUIA do coordenador traz.

## Motivo do humano

Texto de produto: Rafael e Alyson decidem se "acompanha quem está em campo" fica com ressalva ou sai, e confirmam o CP-02.
