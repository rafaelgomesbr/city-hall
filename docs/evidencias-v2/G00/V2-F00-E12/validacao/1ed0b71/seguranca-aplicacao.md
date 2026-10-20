---
validador: seguranca-aplicacao
modelo: claude-opus-5-5
etapa: V2-F00-E12
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
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

Árvore principal (HEAD `5044e7a`, produto idêntico a `1ed0b71`). `git diff --stat bb0f654..1ed0b71` não mostra mudança em `apps/api/src/saida`, `apps/api/src/documentos`, `apps/api/src/rotas/documentos.ts` nem em `test/saida-de-municipio.test.ts`; o que mudou em volta foi a guarda de códigos de erro (E05), por onde passam as recusas desta rota.

- **Teste vermelho verde e casos de borda** (DoD): `npx vitest run test/saida-de-municipio.test.ts`, 37 de 37, código 0 (aviso igual, equipes iguais sem aviso, agente sem equipe, sem despacho, colunas nulas, assinatura ausente, perdida, sem resposta do armazenamento, re-vistoria). PASS.
- **Autorização da rota (integridade do documento e da base inteira)**: sonda S1 por `app.inject`: sem token 401 `nao_autenticado`; token lixo 401 `nao_autenticado`; coordenadora 403 `sem_permissao` (tem `exportar_dados`, falta `gerenciar_organizacao`); operador 403 `sem_permissao`; coordenador de outro município 403 `sem_permissao`. Sonda S4: administradora desativada com token de acesso ainda vivo: 403 `conta_desativada`, nenhum byte de ZIP. PASS.
- **Isolamento ("o ZIP do município A não contém nome de equipe do município B")**: sonda S3, administrador de Vale Fundo (promovido só durante o caso) pedindo `POST /saida/pacote.zip?organizacao=<Serra Alta>` com cabeçalho `x-organizacao-id` e corpo `organizacaoId` de Serra Alta: 200 com o pacote de Vale Fundo; nos 110 arquivos, fora `esquema/` (as migrações, texto fixo do produto), nenhuma ocorrência de identificador `11111111-1111-4111-8111`, "Equipe Alfa", "Equipe Bravo", "Serra Alta", "serraalta" ou do protocolo `000473-2026`. `npm run test:isolamento` 345 aprovados e 3 pulados, código 0. PASS.
- **"O texto já passa por `escapar`"** (risco de segurança da etapa): sonda S2, nome das equipes Alfa e Bravo trocados por marcação HTML ativa (`<img ... onerror=...>`, `<script>`) e uma legenda de registro perdido com `<svg onload=...>`; o laudo do pacote traz as três formas escapadas (`&lt;img`, `&lt;script&gt;`, `&lt;svg onload`) e nenhum dos sete HTML do pacote contém a forma crua. Fecha, por execução, o achado anotado da rodada 4 ("nenhum teste trava o escape da legenda perdida"); o teste do repositório continua sem esse caso. PASS.

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/seguranca-aplicacao/`:

- `e12-saida.txt`: `saida-de-municipio.test.ts`, 37 de 37, código 0.
- `zz-sonda-seg-e12.test.ts`: a sonda (as primeiras 244 linhas do teste do repositório, para reaproveitar a semente e o leitor de ZIP independente, mais o bloco "SONDA seg E12"), copiada para `apps/api/test/` só durante a execução e apagada depois.
- `e12-sonda.txt`: S1 a S4, 4 de 4, código 0.
- `e12-sonda-s3.txt`: a primeira execução do S3, que acusou "Equipe Bravo" e "Serra Alta" no pacote de Vale Fundo; a localização mostrou que as duas cadeias estão só em comentários das migrações `esquema/008`, `016`, `017`, `020`, `024`, `028`, `030` e `036`, que o pacote leva como esquema. Não é dado de Serra Alta.
- `isolamento.txt`: `npm run test:isolamento`, código 0.
- `test-api.txt`: `npm run test:api` completo em Postgres real, 106 arquivos, 1624 de 1624, código 0.

## Cenários positivos

- Administradora de Serra Alta baixa o pacote (200, `application/zip`) e o laudo do pacote imprime o aviso de equipe divergente (casos do repositório).
- Administrador de Vale Fundo baixa o pacote do próprio município.

## Cenários negativos

- Sem token, token lixo, coordenadora, operador, coordenador de outro município: 401 ou 403 com código do catálogo, nenhum byte de pacote.
- Conta desativada com token vivo: 403 `conta_desativada`.
- Parâmetro de município na URL, no cabeçalho e no corpo: ignorados; vale o município do token.

## Tentativas de reprovar

- Injetar marcação HTML pelo nome de equipe (que o aviso imprime) e pela legenda de registro perdido (que a seção dos perdidos imprime) para executar código no laudo aberto pelo município que recebe o pacote: escapado nos três pontos.
- Pedir o pacote de outro município trocando a organização por parâmetro, cabeçalho e corpo: ignorado.
- Procurar dado de Serra Alta no pacote de Vale Fundo por identificador, nome de equipe, nome do município e protocolo: só texto fixo das migrações.
- Baixar com a conta desativada ainda com token de acesso válido: recusado antes de montar.

## Achados

1. **anotado.** O pacote leva os comentários das migrações em `esquema/`, que citam "Serra Alta", "Vale Fundo" e "Equipe Bravo" como exemplos. São nomes fictícios do produto, não dado de outro município, mas o município que recebe o pacote lê nomes de outras prefeituras de exemplo. Reprodução: `grep "Serra Alta"` no `esquema/008_chaves_coerentes_por_municipio.sql` do pacote de Vale Fundo.
2. **anotado (herdado, ainda aberto no teste).** Nenhum teste do repositório trava o escape do nome de equipe nem da legenda perdida no laudo do pacote; hoje o código escapa (S2).

## Não verificado

- O e2e do painel (seções 28 e 29 de `fluxo-api.e2e.mjs`): outra dimensão.
- O laudo aberto num navegador (a sonda confere o texto do HTML, não a execução).
- CI do SHA: ausente (H32).

## Risco residual

Os dois montadores (rota e pacote) continuam separados até a F09-E02; um campo novo no laudo da rota pode não chegar ao pacote, e o escape de um campo novo no pacote não é travado por teste. A autorização e o isolamento da rota estão provados por execução.

## Motivo do humano

A etapa pede que Rafael compare o laudo emitido pela rota com o do pacote para a vistoria F1 (conteúdo de documento jurídico, juízo de quem assina).
