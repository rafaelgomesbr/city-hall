---
validador: ux (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---

## Critérios verificados

Pasta das capturas (todas geradas por mim nesta sessão, Chromium do Playwright, painel construído do SHA com `VITE_API_URL` apontando para a API real semeada): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/ux-E05-E08-E09-E10/capturas/` (abaixo, `capturas/`).

Checklist do portão visual (seção 0 de `19-definicao-de-pronto.md`), item a item, para a tela de entrada nos três motivos:

| Item | Resultado | Prova |
| --- | --- | --- |
| Alinhamento | OK: aviso e cartão do formulário com a mesma largura e a mesma borda esquerda em 1280, 390 e 320 | `capturas/E05-entrada-*-1280-*.png`, `*-390-*`, `*-320-*`; folhas `folhas/e05-1280.png`, `folhas/e05-390.png` |
| Espaçamento | OK: respiro igual entre logotipo, aviso, cartão e links; nada grudado | idem |
| Nada fora do lugar | OK: o medidor de geometria (rolagem horizontal, elemento fora da área útil do cartão, texto cortado, alvo de toque abaixo de 44 px em telas até 600 px) deu ZERO achados nas 30 capturas da etapa | `geometria.json` (chaves `E05-*`) |
| Hierarquia | OK: frase principal em negrito dentro do aviso, depois a explicação | `E05-entrada-encerrada-320-escuro.png` (a mais longa, 9 linhas sem estourar) |
| Texto | OK: as três frases em português correto, sem travessão; a de conta desativada diz o que fazer ("procure a coordenação do seu município") e que entrar de novo não resolve | saída `saidas/e05.txt` |
| Responsivo | OK em 1280, 390 e 320 px; 768 não pedido pela etapa | capturas citadas |
| Temas, foco, contraste, cor | OK: claro e escuro completos; expirou e encerrada em tom de alerta, desativada em tom de perigo, sempre com ícone mais texto | `E05-entrada-desativada-390-claro.png`, `E05-entrada-expirou-390-escuro.png` |
| Estados de erro | OK: o próprio estado da etapa é de erro; a recusa da entrada da conta desativada ("Email ou senha inválidos.") aparece no campo com ícone | `E05-entrada-desativada-tenta-entrar-390-claro.png` |

Heurísticas de Nielsen: visibilidade do estado (o motivo da saída é dito na tela, não "falha ao carregar"): OK. Correspondência com o mundo real (frases sem jargão, sem código de erro): OK. Prevenção e recuperação de erro (desativada não manda tentar de novo; encerrada e expirou mandam entrar de novo): OK. Consistência (mesmo componente `Aviso` nos três): OK. Ver "Achados" para a precisão do motivo depois do vencimento do token.

## Evidência

- API real: `npx tsx src/index.ts` em `apps/api` na porta 3791 (banco PGlite semeado, `NOTIFICADOR_ARQUIVO`, `ORIGENS_PERMITIDAS` do painel). Painel: `npx vite build --outDir <scratchpad>/dist` com `VITE_API_URL=http://127.0.0.1:3791` (código 0, `saidas/build.log`) e `vite preview` na 4791. Os dois processos foram derrubados no fim e a pasta `dist` do scratchpad apagada; o `dist` do repositório não foi tocado.
- Roteiro: `capturar.mjs e05` (no scratchpad), saída `saidas/e05.txt`, erros de console em `console-e05.txt` (13 linhas, todas "Failed to load resource" 401 ou 403 provocados de propósito; nenhum `pageerror`).
- Capturas (30): `E05-entrada-expirou-{1280,390,320}-{claro,escuro}.png`, `E05-entrada-encerrada-{1280,390,320}-*`, `E05-entrada-desativada-{1280,390,320}-*`, `E05-entrada-desativada-renovacao-{1280,390}-*`, `E05-entrada-desativada-tenta-entrar-{1280,390}-*`, `E05-entrada-encerrada-token-vencido-{1280,390}-*`. Olhadas uma a uma pelas folhas `folhas/e05-1280.png` e `folhas/e05-390.png` e duas em tamanho real (`E05-entrada-desativada-390-claro.png`, `E05-entrada-encerrada-320-escuro.png`).
- Comparadas com as do implementador (`docs/evidencias-v2/G00/V2-F00-E05/capturas/entrada-desativada-390-claro.png`): mesma frase, mesmo tom; as arquivadas são de código anterior (rodapé "Quero conhecer" na mesma linha), sem diferença na parte da etapa.

## Cenários positivos

1. Expirou: Jonas entra pela tela, o token de acesso e o de renovação são corrompidos no navegador, a próxima tela leva à entrada com "Sua sessão expirou. Entre de novo para continuar de onde estava. Nada do que já tinha sido gravado se perdeu."
2. Encerrada: pessoa criada pela API (operador) abre Minha conta; a administradora encerra as sessões dela pela API; a troca de senha (escrita com token ainda vivo) leva à entrada com "Sua sessão foi encerrada. ..." em tom de alerta.
3. Desativada com token vivo: a administradora desativa (`PATCH /usuarios/:id/situacao`); a escrita seguinte leva à entrada com "Sua conta foi desativada. Entrar de novo não resolve: procure a coordenação do seu município. ..." em tom de perigo.
4. Desativada com token vencido: reativada, entra, é desativada, o token de acesso é vencido no navegador; a renovação recusada leva à MESMA frase de conta desativada (a correção 1 da etapa).

## Cenários negativos

1. A pessoa desativada tenta entrar de novo: recusa genérica "Email ou senha inválidos." no campo, sem dizer que a conta existe ou foi desativada (`E05-entrada-desativada-tenta-entrar-*`).
2. Sessão encerrada por quem administra, mas a pessoa só volta DEPOIS de o token de acesso vencer: a tela mostra "Sua sessão expirou", e não "foi encerrada" (ver Achados).

## Tentativas de reprovar

- Procurei texto cortado ou estourando o aviso na largura mínima (320 px, tema escuro, frase de 9 linhas): nada cortado; medidor de geometria sem achado.
- Procurei rolagem horizontal e alvo de toque menor que 44 px na tela de entrada em 390 e 320: nenhum (o link "Esqueceu a senha?" mede 44 px desde a E10).
- Procurei o estado comunicado só por cor: os três avisos têm ícone de triângulo e frase em negrito; perigo e alerta se distinguem também pelo texto.
- Tentei fazer a frase errada aparecer: (a) renovação recusada por conta desativada (caminho da correção 1): frase certa; (b) sessão encerrada mais token vencido: aparece "expirou" (achado anotado, a ação pedida continua correta).
- Conferi se o aviso de conta desativada é anunciado: `role="alert"` no aviso; o foco fica em `BODY` depois do redirecionamento (medido), o anúncio é pela região de alerta.

## Achados

1. **Anotado (precisão do texto).** Sessão encerrada por quem administra, com a pessoa voltando depois do vencimento do token de acesso (o caso comum: leitura com token vivo não confere vigência, então ela só descobre depois de 15 minutos), mostra "Sua sessão expirou" e não "Sua sessão foi encerrada". Causa: `apps/web/src/dados/http.ts`, `chamar`: o 401 que leva a renovar é `nao_autenticado`; a renovação recusada com 401 `sessao_encerrada` devolve `false`, e o motivo é calculado sobre o 401 original (`expirou`). Reprodução: `capturar.mjs e05`, bloco "encerrada-depois-de-vencer" (`saidas/e05.txt`, linha `encerrada-depois-de-vencer:`; capturas `E05-entrada-encerrada-token-vencido-*`). Não quebra critério: a ação pedida ("entre de novo") é a mesma das duas frases, e o critério da etapa é distinguir renovar, entrar de novo e conta desativada.
2. **Anotado (fora da etapa, já existente).** "Todos os campos são obrigatórios, exceto os marcados como opcional." num formulário de dois campos sem nenhum opcional.

## Não verificado

- 768 px e zoom de 200 por cento (a etapa não pede; zoom não medido).
- Leitor de tela (VoiceOver, NVDA): o anúncio do aviso foi conferido só por atributo (`role="alert"`).
- Firefox e WebKit: só Chromium nesta validação.
- O app de campo (frase própria do aparelho para `conta_desativada`): fora do painel, o app Expo não renderiza aqui.

## Risco residual

Baixo. A frase de "encerrada" quase não aparece na prática (só numa escrita nos primeiros 15 minutos depois do encerramento); a pessoa lê "expirou", que manda a ação certa. O texto das três frases continua dependendo da aprovação do Rafael (conteúdo de produto).

## Motivo do humano

Gatilhos visuais pelo diff (seção 10 de `28`): **texto de produto** (as três frases de `Entrar.tsx` e as mensagens do catálogo em `packages/shared/src/codigos-de-erro.ts`), **fluxo de erro crítico** (mensagem de sessão e de conta desativada) e **tela pública** (a entrada é rota sem login). E4 visual do Rafael: ler e aprovar as três frases nestas capturas: `capturas/E05-entrada-expirou-390-claro.png`, `capturas/E05-entrada-encerrada-390-claro.png`, `capturas/E05-entrada-desativada-390-escuro.png`, `capturas/E05-entrada-desativada-1280-escuro.png`, `capturas/E05-entrada-desativada-tenta-entrar-390-claro.png` e, para decidir se aceita o achado 1, `capturas/E05-entrada-encerrada-token-vencido-390-claro.png`.
