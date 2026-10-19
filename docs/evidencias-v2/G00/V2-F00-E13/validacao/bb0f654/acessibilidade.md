---
validador: acessibilidade (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E13
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [UI, A11Y, AUTH]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---

Pasta das sondas e saídas deste validador (fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/acessibilidade/` (`saidas/` e `capturas/` relativas a ela). API real e painel construído, portas próprias, derrubados no fim. `@axe-core/playwright` ausente do repositório.

## Critérios verificados

Critério de acessibilidade da etapa ("confirmações anunciadas por `role=status`"), o portão de `acessibilidade.test.ts` e checklist WCAG 2.1 AA:

| Item | Resultado | Prova |
| --- | --- | --- |
| 4.1.3 gravação em Usuários, Equipes e Órgãos anunciada por `role="status"` `aria-live="polite"`, com ícone e texto, fora de subárvore inerte | OK | `saidas/11`, `saidas/12-sonda-e13-firefox.txt` |
| 2.4.3 depois de gravar, o foco fica no formulário (não em `BODY`) | OK | |
| 2.2.1 o aviso pausa com o foco nele (7 s sem sumir) e fecha pelo teclado | OK | |
| 1.4.3 contraste do aviso, claro e escuro | OK | pior 4,93:1 (claro), 5,43:1 (escuro) |
| 1.4.10 a 390 px o aviso não cai sobre a barra de navegação | OK | base do aviso 706, topo da barra 721 |
| 2.4.7 e 2.5.5 a 390 px cada item da barra (10) fica inteiro ao receber foco e tem 44 px | OK | |
| 2.4.2 e 2.4.3 entrar a partir de `/` só por teclado leva a `/painel`, título "Painel · Defesa Civil 360", foco em `main#conteudo` | OK | |
| Portão estático "nenhum onClick pendurado..." | passa, mas é cego em fim de linha LF (achado 1) | `saidas/18` a `saidas/20b` |
| 2.4.3 fechar o aviso pelo botão "Fechar" | foco em `BODY` (achado 2) | |

## Evidência

- `node sonda-e13.mjs`, Chromium 24 de 24 (`saidas/11-sonda-e13-chromium.txt`), Firefox 24 de 24 (`saidas/12-sonda-e13-firefox.txt`).
- Vitest do painel 665 de 665 (`saidas/16`); `acessibilidade.test.ts`, `semente-e-confirmacoes.test.ts`, `design-system.test.ts` e outros 109 de 109 (`saidas/17`).
- Mutação 1 (LF, como está no índice e no Mac): tirei a marca "acessibilidade: excecao" do comentário de `Modal.tsx`, rodei `npx vitest run test/acessibilidade.test.ts`: 21 de 21 PASSAM (`saidas/18-mutacao-modal-sem-excecao.txt`). Restaurado com `git restore` (SHA-1 do arquivo igual antes e depois: 3dcfa537).
- Mutação 2 (mesmo arquivo convertido para CRLF): com a marca, 21 de 21 (`saidas/20a-crlf-com-marca.txt`); sem a marca, 1 falha apontando `componentes/Modal.tsx:260` (`saidas/20b-crlf-sem-marca.txt`). Restaurado com `git restore` (mesmo SHA-1).
- Varredura independente (`varrer-onclick.mjs`): 2 elementos não interativos com `onClick` que o portão não enxerga com LF: `componentes/Modal.tsx:260` e `componentes/BuscaGlobal.tsx:158` (`saidas/19-varredura-onclick-cego.txt`).
- E2E oficial (seção 2, entrar a partir de `/`): Chromium e Firefox 288 de 288 (`saidas/01`, `saidas/23`).
- Capturas olhadas: `capturas/E13-equipes-confirmacao-390-escuro-chromium.png` (aviso acima da barra, sem sobrepor, campo com anel de foco), mais `E13-{equipes,orgaos,usuarios}-confirmacao-1280-{claro,escuro}-chromium.png`.

## Cenários positivos

- Helena digita só o domínio, entra pelo teclado e chega a `/painel`, sem "Esta página não existe".
- Gravar equipe, órgão e usuário pelo teclado mostra "Equipe criada. Ela já aparece na lista abaixo." e as irmãs em `role="status"`.

## Cenários negativos

- A raiz sem sessão leva a `/entrar` e não concede nada.
- A 390 px o aviso não cobre a barra; os 10 itens da barra ficam inteiros ao receber foco.

## Tentativas de reprovar

1. Mordida do portão da etapa: tirar a exceção escrita de `Modal.tsx` NÃO reprova o portão com LF; reprova com CRLF. A etapa provou o vermelho e o verde do caso real numa árvore em CRLF (Windows); no Mac e no CI (Linux, LF) aquele caso não é examinado.
2. Teclado no aviso: levei o foco ao "Fechar" e esperei 7 s (não sumiu); Enter fechou; o foco foi para `BODY`.
3. Sobreposição do aviso com a barra a 390 px, medida por retângulo e olhada na captura: não sobrepõe.

## Achados

1. Corrige antes de crescer (qualidade do portão de acessibilidade da etapa): `elementos()` em `apps/web/test/acessibilidade.test.ts:280` usa `/<[a-z][a-zA-Z0-9]*[\s/>]/`, que não casa uma tag cujo nome termina a linha quando o fim de linha é LF (`<div` sozinho na linha). Com CRLF o `\r` casa com `\s` e o elemento é visto. Resultado: no índice (LF, desde a E21), no Mac e no CI, o portão não examina `Modal.tsx:260` nem `BuscaGlobal.tsx:158`; uma regressão desse formato passaria. Não reprovo a etapa porque os critérios literais (a leitura do bloco de comentário e o caso sintético negativo) estão certos, o comportamento de teclado da janela foi provado em execução (Esc fecha, foco preso e devolvido, ver E09) e a regex é anterior à etapa; mas o "verde" do caso que motivou a etapa é vazio onde o portão roda. Conserto: aceitar fim de linha (`[\s/>]|$`).
2. Corrige antes de crescer (WCAG 2.4.3): fechar o aviso pelo botão "Fechar" leva o foco a `BODY` (o botão some com o aviso), em Usuários, Equipes e Órgãos, Chromium e Firefox. Caminho secundário (é preciso ir ao aviso de propósito); componente `Toast` anterior à etapa.

## Não verificado

- Anúncio real por leitor de tela do `role="status"` montado já com o texto (CP-32).
- axe-core (não instalado). WebKit para teclado (motor). Zoom pela interface do navegador.
- E2E do modo local (`npm run test:e2e`): não rodado por esta dimensão.

## Risco residual

Médio-baixo: o produto em execução cumpre os critérios; o risco é o portão estático deixar passar uma regressão de `onClick` em elemento não interativo escrito com a tag sozinha na linha.

## Motivo do humano

Leitor de tela (VoiceOver, NVDA): confirmar o anúncio das seis frases de confirmação (seção 4 de `28`).
