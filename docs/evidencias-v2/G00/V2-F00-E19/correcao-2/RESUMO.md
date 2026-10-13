# V2-F00-E19, correção 2: os seis pacotes do Expo atualizados, `expo-doctor` volta a 21 de 21

## Fatos

- **Decisão:** o Rafael escolheu atualizar (D1 do roteiro de aprovação, `docs/relatorios-v2/aprovacao/ROTEIRO-G00.md`), em vez de aceitar a exceção.
- **Antes (`saidas/01-doctor-antes.txt`):** `npx expo-doctor` em `apps/campo` dava 20 de 21. A verificação que falhava era a de versões: `expo` 57.0.27 (esperado ~57.0.28), `expo-crypto` 57.0.3 (~57.0.4), `expo-location` 57.0.20 (~57.0.21), `expo-router` 57.0.25 (~57.0.26), `expo-splash-screen` 57.0.9 (~57.0.10) e `jest-expo` 57.0.5 (~57.0.6).
- **O que mudou:** `npx expo install --fix` em `apps/campo` (`saidas/02-install-fix.txt`). `apps/campo/package.json` ganhou os seis números novos, e `apps/campo/package-lock.json` foi regravado pelo npm com as versões transitivas que os seis pedem. Nenhum outro pacote do projeto foi tocado, e o SDK continua o 57.
- **Depois:**
  - `npx expo-doctor`: 21 de 21 (`saidas/04-doctor-depois.txt`).
  - `npm run typecheck`: código 0 (`saidas/05-typecheck.txt`).
  - `npm run test:campo`: 129 suítes e 1903 testes, todos passando (`saidas/06-test-campo.txt`).
  - Testes do pacote `@dc360/campo`: 223 de 223 (`saidas/07-test-pacote-campo.txt`).
  - `npm run auditar`: código 0; runtime em zero e nenhuma advisory nova no aplicativo (as seis exceções nomeadas do CP-03 seguem as mesmas) (`saidas/03-auditar.txt`).
  - `npm run conferir:numeros`: todos os números batem (`saidas/08-numeros.txt`).
- **Roteiro de linha de base:** `dc360/scripts/baseline.mjs` perdeu a divergência explicada V-DEP-4 do passo `expo-doctor` (o passo espera 21 de 21 e agora confere). O mecanismo de divergência explicada continua coberto por um passo sintético em `baseline.test.mjs` (26 casos, todos passando).
- **Documentos acertados:** pendência 17 de `apps/campo/PENDENCIAS.md` (agora RESOLVIDO, com o registro da deriva preservado), `apps/campo/LEIA-ME.md`, `README.md`, comentários de `.github/workflows/verificar.yml` e a classificação dos vermelhos da E03 (V-DEP-4 fechada: abertos 8, fechados 63 de 71).
- **Não verificado aqui:** o CI em Linux desta correção (será o do commit de registro do candidato), o aplicativo num aparelho físico com os pacotes novos (pendência humana T7 a T10 do roteiro) e se o próximo binário nativo compila (mudar pacote nativo exige recompilar o aparelho; isso não foi feito).
- **Limitação:** a deriva volta a cada patch novo do Expo. Quando voltar, é item novo.

## Justificativa

O critério "`expo-doctor` 21 de 21" do gate G00 estava BLOQUEADO por deriva externa. A atualização é de patch dentro do mesmo SDK, e a suíte do aplicativo (1903 testes) mais a do pacote de campo (223) passam, então o risco de regressão é baixo e o critério fecha sem pedir exceção. Aceitar o 20 de 21 como risco seria possível (o critério não está na lista de critérios sem aceite), mas a deriva é barata de fechar agora e reabriria como aviso a cada patch.
