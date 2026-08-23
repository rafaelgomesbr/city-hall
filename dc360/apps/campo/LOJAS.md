# Publicar nas lojas

Tudo o que depende de código está pronto. O que falta são as contas, e é isso
que este documento cobre: o que fazer no Google Play Console e no App Store
Connect, na ordem, com o motivo de cada escolha.

**Antes de qualquer coisa, leia a seção "A decisão que vem primeiro".** Ela
muda metade dos passos seguintes, e decidir depois custa retrabalho.

---

## A decisão que vem primeiro: loja aberta ou distribuição interna

Este aplicativo **não é para o cidadão**. É a ferramenta de trabalho do agente
de proteção e defesa civil, e presume conta criada pela coordenação do
município. Quem baixar sem conta não consegue fazer nada além de ver a tela de
entrada.

Isso tem consequência direta na revisão das duas lojas. Elas perguntam, com
palavras diferentes, a mesma coisa: por que isto está numa loja pública se o
público não pode usar?

| Caminho | Google | Apple | Quando faz sentido |
| --- | --- | --- | --- |
| **Interno** | Teste interno ou fechado, por lista de email | Apple Business Manager, distribuição privada | Poucos municípios, agentes conhecidos, sem vitrine |
| **Aberto** | Produção, listagem pública | App Store pública | Muitos municípios, quer que a prefeitura encontre sozinha |

**Recomendação, e a razão.** Comece pelo **interno** nas duas. O piloto tem um
município e um punhado de agentes; a loja aberta acrescenta revisão pública,
política de privacidade publicada, e a pergunta "por que exigir login sem
oferecer conta de teste" logo na primeira submissão. Nada disso agrega enquanto
o piloto for de um cliente. Migrar de interno para aberto depois é o caminho
fácil; o contrário não existe.

Se optar pelo caminho aberto, a Apple **exige uma conta de demonstração
funcionando** no formulário de revisão. Sem ela, a recusa é automática. Ver
"Conta de revisão" mais abaixo.

---

## Antes de tocar em qualquer console

### 1. O endereço do servidor

Um binário publicado aponta para um servidor. `eas.json` tem três perfis, e o
de produção está com um endereço de exemplo:

```json
"producao": { "env": { "DC360_API_URL": "https://api.exemplo.gov.br" } }
```

**Troque para o endereço real antes do primeiro build de loja.** Um aplicativo
na Play Store apontando para `exemplo.gov.br` é um aplicativo que não funciona,
e a correção exige nova submissão e nova revisão.

### 2. Os identificadores

Estão em `app.config.ts`:

```
ios.bundleIdentifier  br.gov.dc360.campo
android.package       br.gov.dc360.campo
```

**São definitivos.** Depois de publicar, trocar significa outro aplicativo, sem
herdar instalações nem avaliações. Se o produto for vendido sob a marca de cada
prefeitura, decida isso agora: um aplicativo com marca própria e vários
municípios dentro, ou um aplicativo por município. O código de hoje suporta o
primeiro, porque o município vem do login.

### 3. Conta no Expo e EAS

```bash
npm install --global eas-cli
eas login
eas init          # cria o projeto e devolve o EAS_PROJECT_ID
```

Guarde o `EAS_PROJECT_ID` como variável de ambiente ou cole em `app.config.ts`,
em `extra.eas.projectId`.

---

## Google Play Console

### Passo a passo

1. **Conta de desenvolvedor.** Taxa única de 25 dólares. Se a conta for
   organizacional, a Google pede comprovação de identidade da empresa, e isso
   depende do CNPJ ativo. É o item de maior prazo: reserve dias, não horas.

2. **Criar o aplicativo.** Nome "Defesa Civil 360", idioma padrão português do
   Brasil, tipo aplicativo, gratuito.

3. **Chave de assinatura.** Deixe a Google gerar e guardar (Play App Signing).
   Guardar a própria chave significa que perdê-la impede atualizar o
   aplicativo para sempre, e não existe recuperação.

4. **Primeiro envio.**
   ```bash
   cd dc360/apps/campo
   eas build --platform android --profile producao
   eas submit --platform android --latest
   ```
   O `submit` precisa de uma conta de serviço do Google Cloud com acesso ao
   Play Console, baixada como JSON. O caminho dela está em `eas.json`, em
   `submit.producao.android.serviceAccountKeyPath`, apontando para
   `./segredos/play-console.json`. **Essa pasta está no `.gitignore` e precisa
   continuar assim.**

5. **Formulário de segurança de dados.** É onde a maioria dos aplicativos de
   governo trava. Responda assim, e cada resposta corresponde ao que o código
   faz de verdade:

   | Pergunta | Resposta | Onde isso está no código |
   | --- | --- | --- |
   | Coleta dados? | Sim | |
   | Localização aproximada e precisa | Sim, para funcionalidade do app | `expo-location`, só em primeiro plano, só na vistoria |
   | Fotos | Sim, para funcionalidade do app | `expo-camera`, só a vistoria |
   | Nome e email | Sim, para gerenciamento de conta | login |
   | Dados são criptografados em trânsito? | Sim | `https` obrigatório; `NSAllowsArbitraryLoads: false` |
   | Usuário pode pedir exclusão? | Sim, pela coordenação do município | usuário se desativa, não se apaga, porque assina laudo |
   | Dados são compartilhados com terceiros? | Não | |
   | Há publicidade? | Não | |

6. **Política de privacidade.** Obrigatória, com URL pública, mesmo em teste
   fechado. Precisa dizer quem é o controlador dos dados (o município, não a
   empresa), qual a finalidade e como pedir exclusão.

### O que a Google costuma questionar

- **Permissão de localização.** Se o formulário disser "em segundo plano", ela
  pede vídeo demonstrando o uso. O aplicativo **não** usa em segundo plano, e
  `isAndroidBackgroundLocationEnabled: false` garante isso. Responda "somente
  em primeiro plano".
- **Aplicativo que exige login.** Em teste interno não pedem conta de
  demonstração; em produção, pedem.

---

## App Store Connect

### Passo a passo

1. **Apple Developer Program.** 99 dólares por ano. Para conta de organização,
   a Apple exige um **número D-U-N-S** da empresa, e emitir isso leva de dias a
   semanas. **Comece por aqui**, é o caminho crítico do lado da Apple.

2. **Criar o app no App Store Connect**, com o bundle `br.gov.dc360.campo`.
   Anote o **App ID** (numérico) e o **Team ID**: os dois vão para `eas.json`,
   em `submit.producao.ios`, onde hoje está escrito `PREENCHER`.

3. **Envio.**
   ```bash
   eas build --platform ios --profile producao
   eas submit --platform ios --latest
   ```
   O EAS cuida de certificado e perfil de provisionamento sozinho, se você
   deixar. Deixe.

4. **Textos de permissão.** Já estão em `app.config.ts`, em português, dizendo
   o que o aplicativo faz com cada uma. A Apple recusa texto genérico do tipo
   "para melhorar sua experiência", e recusa binário sem o texto.

5. **Criptografia.** `ITSAppUsesNonExemptEncryption: false` já está declarado.
   É verdade: o aplicativo usa apenas HTTPS, que é isento.

### Conta de revisão

Se for para a App Store pública, o formulário de revisão exige usuário e senha
que funcionem. Prepare:

- um município de demonstração, provisionado pela linha de comando
  (`npm run provisionar`), com dados fictícios;
- um agente de campo nesse município, com pelo menos uma ocorrência
  despachada, senão o revisor abre o aplicativo e vê uma lista vazia;
- a observação, no campo de notas, de que **o aplicativo funciona sem conexão
  por desenho**, e que a lista é baixada com sinal e usada sem ele. Sem essa
  frase, um revisor em modo avião conclui que o aplicativo está quebrado.

### O que a Apple costuma questionar

- **Aplicativo só para empresa numa loja pública** (Guideline 4.2). É a razão
  principal para preferir a distribuição privada.
- **Login sem finalidade visível ao público** (5.1.1). Mitigado pela conta de
  revisão e pela nota explicando que o público-alvo é servidor municipal.

---

## Textos da ficha

Prontos para colar, dentro dos limites das duas lojas.

**Nome:** Defesa Civil 360

**Subtítulo, até 30 caracteres:** Vistoria de campo sem sinal

**Descrição curta, até 80 caracteres:**
Vistoria técnica de defesa civil em campo, funcionando sem conexão.

**Descrição completa:**

```
Ferramenta de trabalho do agente de proteção e defesa civil municipal.

O aplicativo é usado em campo, onde o sinal falha: encosta, área de risco,
zona rural. Por isso tudo funciona sem conexão. O agente baixa as ocorrências
designadas para a equipe dele antes de sair, coleta a vistoria no local sem
depender de rede, e o envio acontece sozinho quando o sinal volta, sem risco
de perder ou duplicar registro.

O que o agente faz no aplicativo:

- Consulta as ocorrências despachadas para a equipe dele, com prazo e
  severidade
- Responde o checklist técnico da vistoria
- Fotografa o local
- Registra a coordenada da vistoria
- Colhe a assinatura de quem estava presente
- Acompanha o envio, item a item

Uso restrito a servidores de órgãos municipais de proteção e defesa civil, com
conta criada pela coordenação do município. Não há cadastro público.

Os dados coletados pertencem ao órgão municipal, que é o controlador para fins
da Lei 13.709/2018.
```

**Palavras-chave, iOS:** defesa civil, vistoria, campo, offline, prefeitura,
protocolo, laudo

**Categoria:** Produtividade, ou Utilitários. Não escolha "Governo": ela é
tratada como aplicativo voltado ao cidadão e atrai perguntas que não se
aplicam.

**Classificação indicativa:** Livre. Sem conteúdo gerado por usuário público,
sem compras, sem publicidade.

---

## Capturas de tela

As duas lojas exigem. Mínimo prático:

| Loja | Tamanho | Quantidade |
| --- | --- | --- |
| Google Play | 1080 x 1920 ou maior | 2 mínimo, 4 recomendado |
| App Store | 1290 x 2796 (iPhone 6,7") | 3 mínimo |

As quatro telas que contam a história, nesta ordem: lista de tarefas com prazo
correndo, vistoria com o checklist respondido, fila de envio com "Sem sinal,
salvando neste aparelho", e a mesma fila com tudo enviado.

**Use dados fictícios.** Captura com endereço e nome de morador real numa
listagem de loja é vazamento, e não tem como recolher.

---

## Antes de cada envio

<!-- numeros: nao sao contagem -->
```bash
cd dc360/apps/campo
npx expo-doctor      # 21 verificações da própria Expo
npm run typecheck
npm audit            # precisa fechar em zero
```

E, na raiz do produto, porque o aplicativo depende dos dois pacotes
compartilhados:

```bash
cd dc360 && npm run verificar
```

---

## O que ainda não foi feito, e não dá para fazer sem aparelho

Isto está aqui para não virar surpresa. Nada abaixo é opinião: é o que separa
código escrito de código comprovado.

<!-- numeros: nao sao contagem -->
- **O aplicativo nunca rodou.** Ele compila, passa nas 21 verificações da Expo
  e o TypeScript não reclama, mas nenhuma tela foi aberta em aparelho nenhum.
- **Câmera, GPS e assinatura nunca foram exercitados.** A lógica que os cerca
  está escrita; o comportamento deles no aparelho, não.
- **A prova que mais importa continua pendente:** matar o aplicativo no meio do
  envio e reabrir, confirmando que nada duplica no servidor. A fila tem 46
  testes cobrindo isso fora do celular, inclusive a retomada foto a foto, mas
  o `expo-sqlite` sob morte de processo real é justamente o que só o aparelho
  responde.
- **Nenhum build foi gerado.** `eas build` precisa de conta.

O caminho para tirar isto da lista, na ordem:

```bash
npx expo start               # aparelho na mesma rede, aplicativo Expo Go
eas build --profile desenvolvimento --platform android   # build instalável
```

Depois, no aparelho, o roteiro que o `LEIA-ME.md` já descreve: entrar, baixar,
subir o morro em modo avião, coletar, voltar, ver a fila esvaziar.
