---
validador: qa (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E24
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: []
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---

Pasta das saídas (fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/qa-lote2/` (abaixo, `SAIDAS/`).

## Critérios verificados

| Critério | Resultado | Prova |
| --- | --- | --- |
| O que o app faz hoje (base da varredura) | conferido | `apps/campo/src` só cita `/saida-a-campo` num comentário (`src/dados/api.ts:518`) e lê `emCampo` dos colegas; nenhuma chamada a declarar, prorrogar, retorno ou `/minha`. A API registra as seis rotas (`rotas/saida-a-campo.ts`, prefixo em `servidor.ts:788`) |
| CP-02 registrado | PASS | `docs/evidencias-v2/CP-02/decisao.md`: D-25 como premissa, sem data prometida |
| Nenhum documento promete a declaração no app sem ressalva | PASS | varredura de `dc360/README.md`, `dc360/docs`, `docs/` (fora histórico e roadmap), `mockup/` e `relatorio-apresentacao-alyson.html` por "declara a saída", "saída a campo", "confirme o retorno", "prorrog", "retorno não confirmado", "prazo estourado", "quem está em campo", "segurança do agente" (`SAIDAS/e24-grep.txt`, 56 linhas lidas uma a uma): toda frase sobre o agente declarar está sob quadro "Estado atual"/"pela metade", no futuro, ou com "em construção" |
| Nenhum "Pronto" na linha de segurança do agente | PASS | `2026-09-15-para-o-alyson.html:394` com `p-parcial`, texto "O aplicativo do agente ainda não declara a saída" |
| Nenhum passo do cartão manda declarar no app | PASS | `CARTAO-DO-AGENTE.md` passo 2: avisar a coordenação pelo meio combinado, quadro "O aplicativo ainda não registra a sua saída" |
| PDF coerente com o HTML | PASS | texto extraído do PDF por PDFKit (24 páginas, `SAIDAS/e24-pdf-texto-bruto.txt`): linha "Segurança do agente sozinho" com selo "Parcial" e a ressalva, "em construção" 2 vezes, "V2-F14-E01" 2 vezes, 0 travessão; HTML e PDF mudaram juntos no mesmo commit (`3ed4fb6`) e o HTML não mudou depois |
| Verificador de ressalvas da correção 2 | PASS e morde | `node docs/evidencias-v2/G00/V2-F00-E24/correcao-2/verificar-ressalvas.mjs`: 9 ocorrências, 0 sem ressalva, código 0 (`e24-01`); com a ressalva da linha "Operador / plantonista" removida do HTML: código 1, a linha apontada (`e24-02`); desfeito |
| As provas da API e do painel seguem verdes | PASS | linha de base: `saida-a-campo.test.ts` 27 de 27, `saida-nao-declara-inexistente.test.ts` 11 de 11, `quem-esta-em-campo.test.ts` 4 de 4 |
| `npm test` com `regras-de-conteudo` verde | PASS | shared 170 de 170 (inclui `regras-de-conteudo` 10 de 10) |
| Sem regressão desde a rodada 3 | PASS | `git diff 52952a1..bb0f654` nos documentos da etapa: só mudanças da fila (cartão), do índice (`LEIA-ME`) e da privacidade (console), nenhuma tirando ressalva |
| `INDEX.md` byte a byte | PASS | raiz 46 de 46 |

## Evidência

`SAIDAS/e24-grep.txt`, `SAIDAS/e24-pdf-texto-bruto.txt`, `SAIDAS/e24-01-ressalvas.txt`, `SAIDAS/e24-02-ressalva-removida.txt`, e as saídas da linha de base (`05-teste-api.txt`, `07-teste-web.txt`, `02-teste-shared.txt`). A mutação do HTML foi desfeita com `git restore`.

## Cenários positivos

Todas as frases-alvo com ressalva; PDF com o selo novo.

## Cenários negativos

Ressalva removida de uma linha da apresentação: o verificador reprova. Busca por "Pronto" na linha de segurança e por instrução de declarar no cartão: nada.

## Tentativas de reprovar

1. Busca ampla além das palavras da etapa ("agente declara", "declarou a saída", "em campo agora", "botão de apoio", "retorno do agente") em `.md`, `.html` e `.txt` do repositório, fora de histórico: só a tabela de permissões gerada do README (descreve a permissão, que existe) e frases já ressalvadas.
2. Conferi o PDF pelo texto extraído, e não pela palavra do implementador.
3. Conferi o que o aplicativo mostra hoje sobre "em campo" (ver achado).

## Achados

- Anotado (fora do escopo de documentação da etapa): o Perfil do aplicativo de campo mostra sempre "Ninguém em campo agora" (`apps/campo/src/app/(agente)/perfil.tsx:1137-1142`), porque nenhuma saída é declarada; a tela não diz que o indicador depende de um recurso em construção. A apresentação já avisa que o indicador "hoje não acende", mas o agente que olha o próprio aplicativo vê uma afirmação que parece um fato. Mudar a tela é produto (F14-E01 ou decisão de Rafael), não desta etapa.

## Não verificado

- Leitura da apresentação por Rafael e Alyson antes de qualquer demonstração (humano).
- Confirmação da D-25 (premissa).
- Capturas do portão visual: são da dimensão UX.

## Risco residual

Médio-baixo: a documentação está ressalvada; a decisão D-25 segue premissa e o aplicativo ainda exibe "Ninguém em campo agora".

## Motivo do humano

Decisão de produto e texto de produto: Rafael e Alyson confirmam ou revertem a D-25 (CP-02) e leem a apresentação ajustada antes de demonstrar a município.
