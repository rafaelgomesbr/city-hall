---
validador: privacidade-lgpd
modelo: claude-sonnet-5-5
etapa: V2-F00-E11
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [UI, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E3a]
nivel_de_prova_obtido: [E1, E2, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Campo "Impacto LGPD": "em produção o pacote traz dado pessoal; na prova só há dado sintético, e como evidência entram apenas a lista de nomes e o hash".

Inventário: o pacote de saída é o arquivo mais sensível do produto (tabelas do município com nome e contato de cidadão, laudos, fotos, usuários, `ocorrencia_consultas` e `exportacoes`). A etapa toca o cliente (`baixarPacoteDeSaida`, `POST /saida/pacote.zip` por `chamar`), `Organizacao.tsx` (URL de objeto liberada 30 s depois do clique, com limpeza no desmonte) e a prova (e2e, semente sintética de Serra Alta).

Controles verificados:
- Acesso: a rota exige `exportar_dados` e `gerenciar_organizacao`; coordenadora recebe 403 `sem_permissao`; município suspenso, 403 `acesso_suspenso` sem registro de exportação (`apps/api/test/pacote-de-saida-contrato.test.ts`).
- Isolamento no conteúdo: toda linha de toda tabela do ZIP é do município de quem pediu, conferida por `organizacao_id` (mesmo arquivo); a organização vem só do token.
- Minimização: coluna proibida não aparece em cabeçalho de CSV nem em chave de JSON, e o valor sentinela plantado em `aparelhos.ficha` não aparece em arquivo nenhum. `sessoes` e `recuperacoes_senha` (com IP) ficam de fora por serem credencial (`apps/api/src/saida/pacote.ts:150-156`).
- Evidência da etapa: `docs/evidencias-v2/G00/V2-F00-E11/pacote/` tem só lista de nomes e SHA-256; o arquivo baixado é apagado pelo próprio teste.
- A documentação diz a verdade sobre o código? `dc360/docs/SAIDA-DE-MUNICIPIO.md` (mudança da correção 4, perto da linha 206) afirma que abrir o dossiê de uma ocorrência e a busca gravam `ocorrencia_consultas` mesmo sob suspensão. Verifiquei por sonda minha (arquivo temporário, já removido; `sonda1.txt`): com o município suspenso, `GET /ocorrencias/:id` responde 200 e `ocorrencia_consultas` passa de 0 para 1 linha. A frase nova está correta (a antiga, "não criam registro nenhum", era falsa). Confere também `DICIONARIO-DE-DADOS.md` linha 5 e `SAIDA-DE-MUNICIPIO.md:100`: o pacote NÃO leva o dicionário (a lista de nomes do ZIP em `pacote/lista-de-nomes-do-zip-chromium.txt` traz `esquema/*.sql` e `LEIA-ME.txt`, sem `DICIONARIO-DE-DADOS.md`).
- O código da E11 não mudou desde a rodada 4: `git diff bb0f654..4ce0433` em `apps/web/src`, `apps/api/src/saida` e `apps/api/src/rotas/saida.ts` só toca `pontuador.ts` e um teste de sessão, que não são da etapa. Mudou a documentação citada.

## Evidência

- `npx vitest run test/pacote-de-saida-contrato.test.ts test/saida-de-municipio.test.ts` (apps/api): 2 arquivos, 45 testes, código 0 (`e11-api.txt`).
- `npx vitest run test/pacote-de-saida.test.ts` (apps/web): 7 de 7, código 0 (`e11-web.txt`).
- `registro-de-consulta.test.ts` e `acesso-suspenso.test.ts` (dentro dos 120 de `api1.txt`), que cobrem a leitura sob suspensão.
- Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L05-lgpd/`.

## Cenários positivos

A administradora da semente baixa o ZIP (índice, tabelas, laudos), com somas SHA-256 que conferem.

## Cenários negativos

Coordenadora: 403; município suspenso: 403 sem linha de exportação; `/pacote.zip` na raiz: 404; o pacote de A não contém linha de B.

## Tentativas de reprovar

Procurei o valor sentinela de `aparelhos.ficha` e colunas de credencial nas saídas do contrato: não aparecem. Procurei dado pessoal e segredo na evidência arquivada da etapa fora de `validacao/` (`pacote/`, `saidas/`, `sondas/`): só nomes de arquivo, somas e dados de `*.exemplo.gov.br`. Procurei a promessa falsa na documentação alterada (suspensão sem registro): corrigida, e provada por sonda. Procurei no `LEIA-ME.txt` um aviso de guarda e descarte do pacote: não há (ver Achados).

## Achados

- anotado: o `LEIA-ME.txt` gerado (`apps/api/src/saida/pacote.ts:1086-1145`) explica o conteúdo e diz que credencial não sai, mas não avisa que o pacote carrega nome, contato e vulnerabilidade de cidadão em claro nem orienta guarda, transporte e descarte pelo município. O pacote baixado fica na pasta de Downloads de quem clicou, fora do controle do produto. Pode ser incluído quando a saída de município for ligada a um município real.
- anotado: o pacote é montado inteiro em memória do servidor e do navegador (F07-E06), pendência registrada pelo implementador.

## Não verificado

Abrir o ZIP real com dado de produção (validação humana pendente). O e2e da seção 28 em navegador (QA e UX). Acessibilidade do botão (outra dimensão).

## Risco residual

Cópia local do pacote fora do controle do produto; pacote em memória até a F07-E06.

## Motivo do humano

A etapa tem validação humana pendente no STATUS: Rafael baixa o pacote pelo painel com a API local e abre o ZIP. Só uma pessoa confere que o ZIP aberto na máquina traz o que a tela promete e decide se o `LEIA-ME.txt` precisa de aviso de guarda e descarte.

### Itens do "Motivo do veredito" da rodada 4 que tocam privacidade

A rodada 4 deu PASS de LGPD sem condição pendente nesta dimensão; o único FAIL (acessibilidade) foi rebaixado e não toca privacidade. Nada a consertar, e a correção 4 só mexeu na documentação, verificada acima.
