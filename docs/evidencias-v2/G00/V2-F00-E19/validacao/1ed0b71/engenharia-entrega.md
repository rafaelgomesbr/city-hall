---
validador: engenharia-entrega
modelo: claude-opus-5-5
etapa: V2-F00-E19
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1 local no macOS, E2]
veredito: FAIL
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

- Evidência mínima de Infra e CI: run do CI do SHA, job a job, com artefato. NÃO EXISTE (run 39366804765 do registro `7644420` recusado pelo GitHub por faturamento, H32; `gh` sem login). Sozinho, isso daria BLOCKED. O veredito é FAIL porque achei, por execução, um defeito que reprova critério da etapa (Achados).
- O workflow cobre a etapa? Por leitura de `.github/workflows/verificar.yml` no SHA: o job `dependencias` (linhas 160 a 220) roda `npm run auditar` como portão, sem `continue-on-error`, e guarda os quatro `npm audit --json` crus como evidência (o `|| true` é só desses). O `expo-doctor` do job `aplicativo` desliga a checagem de versões (`EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1`); o "21 de 21 sem pular a checagem" só é medido em Linux pelo passo `expo-doctor` do job `baseline`, que não define essa variável.
- `npm run auditar` com rede, no Mac: código 0, runtime 0, desenvolvimento 3 aceitas com dono e prazo, aplicativo 55 com as seis exceções nomeadas do CP-03 (`e19-01-auditar-com-rede.txt`).
- `node --test scripts/auditar.test.mjs`: 28 de 28 (`e19-06-auditar-test.txt`).
- Registro fora do ar (`npm_config_registry` numa porta sem servidor): código 2, "o conjunto de runtime da raiz NÃO foi auditado" (`e19-05`). A correção 3 segura para esse caso.
- `expo-doctor` 21 de 21 pelo passo do roteiro, código 0 (`e01-baseline-parcial/08-expo-doctor.txt`).
- Achado de outro validador, conferido de forma independente: REPRODUZIDO nos dois casos (abaixo).

## Evidência

Em `SCRATCH/validadores/engenharia-entrega/`:

- `e19-01-auditar-com-rede.txt`: código 0, relatório completo.
- `e19-02-auditar-offline.txt`: `npm_config_offline=true node scripts/auditar.mjs`, **código 0**, "Runtime 0", "Aplicativo 0", aviso de que as seis exceções "não aparecem mais", e "Runtime limpo, e o aplicativo sem advisory nova". O `npm audit --omit=dev --json` cru no mesmo modo devolve um relatório bem formado com `metadata.vulnerabilities.total: 0` e `vulnerabilities: {}`: o npm não consultou a base de avisos e o relatório passa no `relatorioValido`.
- `e19-03-auditar-registro-vazio.txt` e `e19-03-registro-vazio-log.txt`: um servidor local (`registro-vazio.mjs`, que responde `{}` a tudo) em 127.0.0.1:48731, apontado por `npm_config_registry`. O log mostra as três chamadas `POST /-/npm/v1/security/advisories/bulk` (raiz runtime, raiz completa, aplicativo) respondidas com `{}`. `auditar` sai com **código 0** e "Runtime limpo". Servidor derrubado ao fim.
- `e19-04-auditar-prefer-offline.txt`: com `npm_config_prefer_offline=true` o portão audita de verdade (código 0 com as seis exceções listadas): o furo é só do modo offline e do registro que responde vazio.
- `e19-05-auditar-registro-fora-do-ar.txt`: código 2 (o caso consertado na correção 3).
- `e19-07-baseline-offline-stdout.txt` e `e19-baseline-offline/`: o roteiro de linha de base no modo offline: o passo `auditar` "confere" (código 0), e só os dois `npm audit` crus divergem (sem `# npm audit report`), roteiro código 3.

## Cenários positivos

- Com rede e registro oficial, o portão audita as três árvores e aprova conforme o CP-03.
- `auditar.test.mjs` cobre runtime vulnerável, exceção sem prazo, vencida, com correção disponível, malformada, erro do npm, relatório sem `metadata`, `{}` como saída do npm e texto que não é JSON.

## Cenários negativos

- Registro fora do ar: código 2 (certo).
- Modo offline: código 0 sem ter auditado (errado).
- Registro que responde `{}` à consulta de avisos: código 0 sem ter auditado (errado).

## Tentativas de reprovar

- Reproduzi as duas condições do achado alheio, cada uma isolada, e conferi pelo log do servidor falso que a consulta de avisos foi feita e respondida vazia.
- Separei o modo offline do `prefer-offline` (configuração comum de CI para acelerar `npm ci`): o segundo audita direito, então o furo não aparece por acaso num CI com cache.
- Conferi se o CI pega o caso por outro caminho: o job `dependencias` não (só roda o `auditar`); o job `baseline` sim, indiretamente, porque os passos `audit-raiz` e `audit-campo` exigem o cabeçalho do relatório (o passo `auditar` do roteiro confere mesmo offline).
- Conferi o teste "JSON vazio `{}`" do `auditar.test.mjs`: ele simula o npm devolvendo `{}`; o que acontece com registro vazio é o npm devolver um relatório completo com contagem zero, que o teste não cobre.

## Achados

- **Bloqueia.** `dc360/scripts/auditar.mjs` aprova sem ter auditado em duas condições reproduzíveis: `npm_config_offline=true` e um registro que responde `{}` à consulta `POST /-/npm/v1/security/advisories/bulk` (o que um espelho de registro que não implemente a consulta poderia fazer; não testei espelho real). Nos dois casos o npm devolve um relatório bem formado com `metadata.vulnerabilities.total: 0`, `relatorioValido` (linhas 63 a 75) aceita, e o portão imprime "Runtime limpo, e o aplicativo sem advisory nova" com código 0. Reprodução: em `dc360/`, `npm_config_offline=true node scripts/auditar.mjs; echo $?` dá 0.
  - Viola `dc360/README.md:1536-1538` ("O portão nunca aprova sem ter auditado"), frase escrita pela correção 3 para fechar justamente o FAIL da rodada 2; o texto só enumera registro fora do ar, erro e relatório sem contagem, mas a promessa geral é falsa.
  - Viola o critério da etapa: a DoD é "`auditar` verde nas duas árvores conforme o CP-03; zero runtime vulnerável" e o teste negativo é "vulnerabilidade de runtime reprova". Nessas duas condições uma vulnerabilidade de runtime conhecida não reprova.
  - Toca o item 7 da seção 7 de `28` (dependência de execução vulnerável só passa por exceção do CP-03, nunca por aceite avulso): um verde sem auditoria equivale a aceitar o que não foi olhado, fora da lista nomeada.
  - O próprio portão já tem o sinal e o ignora: as seis exceções do aplicativo somem todas de uma vez e ele só avisa ("não aparece(m) mais") e sai 0.
  - Impacto no CI de hoje: baixo (o runner usa o registro oficial e não liga o modo offline), e o job `baseline` pegaria o caso pelos `npm audit` crus. Por isso a confiança é média. Conserto mínimo sugerido: recusar com código 2 quando `npm config get offline` for verdadeiro, e tratar como "não auditou" a lista de exceções do aplicativo inteira sumindo (ou um relatório com `vulnerabilities` vazio quando a árvore tem dependência conhecida como vulnerável), com teste que monte o registro vazio.
- Corrige antes de crescer (da rodada 4, continua): `auditar.mjs` aceita a exceção do aplicativo pelo NOME do pacote (`naoAceitas`, por volta da linha 198), não pela advisory: uma advisory nova num pacote já aceito passa sem aviso.

## Não verificado

- O job `dependencias` e o `baseline` em Linux (o run do SHA não existe, H32).
- `auditar` no Windows.
- O binário nativo com os pacotes do Expo atualizados (pendência humana, fora desta dimensão).

## Risco residual

Enquanto o portão aceitar relatório de contagem zero sem prova de que a base de avisos foi consultada, um ambiente mal configurado (modo offline, espelho sem auditoria) dá verde com runtime vulnerável. O CI atual não está nessa condição, mas a regra do projeto ("npm audit precisa fechar em zero", "nunca aprova sem ter auditado") é absoluta.

## Motivo do humano

O run do CI do SHA só existe depois de o Rafael resolver o faturamento do GitHub (H32). A leitura da lista de exceções (dono, motivo, prazo) é a validação humana da etapa.
