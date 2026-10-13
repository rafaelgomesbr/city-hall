---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E12
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [API, DOCUMENTO]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados
Base: HEAD 665b2be (só STATUS difere de 7005a60). Árvore limpa fora de `validacao/`.

- Teste vermelho de `saida-de-municipio.test.ts:364` passa: arquivo inteiro 25 de 25, e com o contrato da E11 33 de 33, 0 falhas (`api-saida.txt`).
- Para a vistoria F1 (Alfa designada, agente da Bravo) o trecho do aviso do laudo do pacote é igual ao da rota: caso "equipes diferentes" do bloco novo, e seção 29 do e2e (15 verificações, "o trecho do aviso e IDENTICO nos dois documentos, palavra por palavra") em Chromium e Firefox, 271 de 271 cada, zero erro de console.
- Equipes iguais: sem aviso nos dois. Agente sem equipe: frase própria, sem "lotado na". Colunas nulas (anterior à 024): sem aviso falso. `sem_despacho`: nota própria que substitui a de divergência. Todos os 6 casos do bloco passam.
- Isolamento: caso "o nome de equipe do outro município não entra no pacote" passa e a seção 29 repete ("nenhum arquivo do pacote cita a equipe de Vale Fundo").
- Pendência do montador único registrada em `dc360/apps/api/PENDENCIAS.md` (linhas ~205 a 225).
- CI 37739535524: 9 de 9 verdes no SHA.

## Evidência
- `npx vitest run test/saida-de-municipio.test.ts test/pacote-de-saida-contrato.test.ts --testTimeout=120000`: código 0 (scratchpad `api-saida.txt`).
- `node scripts/e2e-api.mjs chromium` e `firefox`: 271/271, código 0.
- Comparação por mim do laudo INTEIRO (não só do aviso) com divergência montada (teste temporário em cópia, apagado): 337 linhas nos dois; difere só em URLs de imagem (relativas no pacote, assinadas na rota), em "por <nome> (<papel>)" e no identificador de emissão. O parágrafo de aviso é idêntico.

## Cenários positivos
Divergência real montada pela API (despacho à Bravo, coleta de agente da Alfa por `POST /sincronizacao/vistoria`), pacote baixado pelo botão do painel, aviso idêntico à rota.

## Cenários negativos
Equipes iguais, agente sem equipe, colunas nulas, coleta sem despacho, ocorrência despachada à Alfa e coletada pela Alfa (sem aviso nos dois documentos), equipe de Vale Fundo ausente do ZIP de Serra Alta.

## Tentativas de reprovar
- Mutação: substituí os dois nomes de equipe por `NULL::text` em `saida/pacote.ts`. `saida-de-municipio.test.ts`: 3 de 25 reprovam (o caso `:364`, "equipes diferentes" e "agente sem equipe"), como o RESUMO diz. Desfeito com `git restore`.
- Tentei o contrário (aviso inventado): equipes iguais e colunas nulas não geram `Atenção:`.
- Conferi se o `LEFT JOIN` apagaria vistoria antiga: não, o caso de colunas nulas ainda traz o laudo.
- Procurei vazamento entre municípios pela junção nova: `equipes` está sob a transação com organização do token (RLS); o caso de isolamento passa.
- Conferi o achado do implementador (latitude/longitude): REAL e continua registrado. Com `latitude=-22.9, longitude=-43.2` na vistoria F1, o laudo da rota imprime "-22.900000, -43.200000" e o do pacote imprime "não registrada". Está em `apps/api/PENDENCIAS.md`, no STATUS (seção 11) e a F09-E02 já cita "coordenada do ponto" no seu problema (`docs/roadmap-v2/07-documentos.md:45`). Não foi esquecido.

## Achados
1. CORRIGE ANTES DE CRESCER. O laudo do pacote afirma "Coordenada capturada no local: não registrada" quando há coordenada (reprodução acima). É afirmação falsa em documento que o município leva embora. Dono: F09-E02 (já cobre). Fora do escopo da E12 por regra da etapa, e por isso não bloqueia. Sugiro que o critério de aceite da F09-E02 cite explicitamente a coordenada da vistoria, hoje só consta na lista do problema.
2. ANOTADO. Os casos novos da API são de integridade por parágrafo `<p class="nota">`, não do laudo inteiro; a duplicidade dos montadores é defendida só por teste de comparação até a F09-E02.

Nenhum item bloqueia.

## Não verificado
- Validação humana (Rafael compara as folhas da vistoria F1).
- `npm run test:isolamento` e `npm run test:api` completos (rodei só os dois arquivos do pacote; o CI roda tudo).
- Pacote com vistoria de re-vistoria e foto de vistoria anterior (F09-E02).
- Conteúdo visual do HTML renderizado (só texto e estrutura).

## Risco residual
Dois montadores continuam existindo: campo novo no laudo pode divergir de novo (coordenada já divergiu). Defesa: teste que compara os dois e a F09-E02.

## Motivo do humano
A etapa pede comparação humana das duas folhas da F1. Pendência registrada, não bloqueia o veredito de QA.
