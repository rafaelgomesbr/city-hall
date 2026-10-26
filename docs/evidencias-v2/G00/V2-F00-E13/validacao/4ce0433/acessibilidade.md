---
validador: acessibilidade
modelo: claude-opus-5-5
etapa: V2-F00-E13
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [UI, A11Y, AUTH]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---

Pasta de trabalho deste validador (fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L07-acessibilidade/` (abaixo, `saidas/` e `sondas/`). API real (PGlite semeado) na 3777 e painel construído na pasta de trabalho, servido na 4777; para o e2e do modo local, outro build na pasta de trabalho servido na 4173 (porta fixa do roteiro), derrubado e apagado logo depois. axe-core 4.10.2 só na pasta de trabalho (WCAG 2.0 e 2.1 A e AA). O painel não mudou desde `bb0f654` (só `busca/pontuador.ts`).

## Critérios verificados

Linha "Acessibilidade" da etapa: "confirmações anunciadas por `role=status`". Mais o que a etapa entrega no painel: `<Toast>` nas gravações de `Usuarios.tsx`, `Equipes.tsx` e `Orgaos.tsx`; rota índice e entrada a partir de `/` levando à tela do papel; o raio da marca por token; o portão `acessibilidade.test.ts` lendo o comentário inteiro; e o que ela declara ter consertado (o Tab traz o item da barra do rodapé inteiro para a tela; o aviso passageiro não cai em cima da barra no celular). Tudo pelo teclado.

| Item WCAG 2.1 AA | Resultado | Prova |
| --- | --- | --- |
| 4.1.3 confirmação de gravação em `role="status"` `aria-live="polite"` com ícone e frase: Equipes, Órgãos, Usuários | OK | "Equipe criada. Ela já aparece na lista abaixo.", "Órgão cadastrado...", "Usuário cadastrado..." (`saidas/18b`) |
| 1.4.3 contraste do Toast, claro e escuro | OK | axe sem violação no Toast e nas páginas Equipes e Órgãos nos dois temas (`saidas/18b`); o Toast ganhou `--ds-surface` como fundo |
| 1.4.10 e 2.5.5 (alvo) no celular: o Toast fica acima da barra do rodapé; "Fechar" do Toast com 64 x 44 px | OK | `{"toastBaixo":750,"barraTopo":765}` a 390 px (`saidas/18b`); `a11y-equipes-toast-390-claro.png` e `-escuro.png` |
| 2.4.3 entrar a partir de `/` pelo teclado chega à tela do papel, com o foco no `main` e o primeiro Tab em "Pular para o conteúdo" | OK nos quatro papéis | administradora, coordenadora e operador em `/painel`, agente em `/meu-trabalho`, Chromium e Firefox (`saidas/18b`) |
| 2.4.7 e 2.4.3 barra do rodapé a 390 px: os 11 itens alcançados pelo Tab ficam inteiros na tela, com 84 x 62 px e anel de foco | OK | Chromium `saidas/18b`; Firefox ordem e posições em `saidas/19` (todos dentro de 0 a 390); `a11y-barra-foco-ultimo-item-390-escuro.png` |
| ladrilho da tela atual à vista ao abrir Equipes, Órgãos e Usuários a 390 px | OK | `saidas/24`; `a11y-usuarios-ladrilho-atual-390-escuro.png` |
| 2.1.1 portão estático de `onClick` sem teclado (com a exceção lida pelo comentário inteiro) | OK | `acessibilidade.test.ts` dentro de `saidas/02` |
| 2.4.3 foco depois de gravar com Enter no botão "Cadastrar órgão" | foco cai em `BODY` | ver Achados |

## Evidência

- `npx vitest run` em `apps/web`: 44 arquivos, 669 de 669, código 0 (`saidas/01`): a soma do painel em zero que a DoD pede (com E09 e E21). Recorte verbose de 11 arquivos com `acessibilidade.test.ts`, `semente-e-confirmacoes.test.ts`, `design-system.test.ts`, `toast.test.ts`, `sessao-e-entrada.test.ts`: 209 de 209 (`saidas/02`).
- `node sondas/sonda-e13.mjs` em instância limpa: Chromium 30 aprovadas e 1 falha (`saidas/18b-sonda-e13-chromium-instancia-limpa.txt`); Firefox 29 aprovadas e 2 falhas (`saidas/18b-sonda-e13-firefox-instancia-limpa.txt`). A falha comum é o foco de Órgãos (Achados); a segunda do Firefox é do meu laço da barra, que não registrou itens: refeita com roteiro próprio, a ordem e as posições estão em `saidas/19` e todos os itens estão inteiros. A primeira rodada (`saidas/18-...`) teve 4 falhas a mais de entrada por `/` porque as sondas da E09 e da E10 tinham trocado a senha de Jonas e Diego; refeita na instância limpa, passou.
- E2E do modo local, `node test/fluxo.e2e.mjs`: Chromium 70 de 70 e Firefox 70 de 70, zero erro de console, código 0 (`saidas/22-fluxo-local-e2e-chromium.txt`, `saidas/22-fluxo-local-e2e-firefox.txt`).
- E2E contra a API, `test/fluxo-api.e2e.mjs` Chromium 288 de 288 e `test/layout-estreito.e2e.mjs` 64 de 64 (com "o primeiro Tab da página cai em Pular para o conteúdo, mesmo com a barra rolada") (`saidas/20`, `saidas/21`).
- Capturas desta rodada (`capturas/`): `a11y-equipes-toast-1280-escuro.png`, `a11y-equipes-toast-390-claro.png`, `a11y-equipes-toast-390-escuro.png` (olhada: aviso com ícone e "Fechar" acima da barra, sem sobrepor; nessa captura a barra mostra o ladrilho "Equipes" na borda porque a sonda reduziu a janela DEPOIS de abrir a tela, e a barra só rola até a tela atual na troca de rota; abrindo já a 390 px ele fica inteiro, `a11y-usuarios-ladrilho-atual-390-escuro.png`), `a11y-barra-foco-ultimo-item-390-escuro.png`.

## Cenários positivos

- Gravar uma equipe, um órgão e um usuário pelo teclado: o Toast `role="status"` diz o que aconteceu e onde ver, com ícone, nos dois temas.
- Entrar digitando só o domínio: quatro papéis, quatro telas certas, foco no conteúdo.

## Cenários negativos

- A 390 px o Toast não cobre a barra do rodapé; o "Fechar" tem 44 px de altura.
- Nenhum item da barra recebe foco pela metade (o defeito que a etapa consertou).

## Tentativas de reprovar

1. Rodei axe-core em Equipes e Órgãos, com e sem o Toast, nos dois temas: zero violação.
2. Gravei de duas formas: Enter no campo (o foco fica no campo) e Enter no botão (o botão de Órgãos vira `disabled` enquanto grava). A segunda reprovou (abaixo).
3. Testei os quatro papéis a partir de `/`, não só a administradora, e conferi o primeiro Tab.
4. Percorri a barra item a item com espera depois de cada Tab (para não medir o quadro anterior), nos dois motores.

## Achados

1. **Corrige antes de crescer (WCAG 2.4.3; não decide a etapa).** Em Órgãos, com Tab até "Cadastrar órgão" e Enter, o foco cai em `BODY` depois de gravar (Chromium e Firefox na instância limpa), porque o botão vira `disabled={gravando}` (`apps/web/src/paginas/Orgaos.tsx:241`, linha de `57795e96`, 2026-09-09, anterior à fase). A confirmação é anunciada (`role="status"`), que é o que a etapa pede; Equipes e Usuários não desabilitam o botão e o foco fica onde estava. Mesma classe do achado da E11 (`Organizacao.tsx:269`), da E09 (`ConfirmarAcao.tsx`) e da E10 (`RecuperarSenha.tsx`); sem registro com dono.
2. Anotado: o Toast `role="status"` é montado já com o texto (`Toast.tsx:142`); leitores de tela nem sempre anunciam região viva inserida com conteúdo. A frase continua na tela (6 s, pausa com foco ou ponteiro, botão "Fechar") e a lista mostra o resultado. Só leitor de tela confirma; dono natural V2-F10-E11 (região anunciante única em `Estrutura.tsx`).
3. Motivo do veredito da rodada 4 para a E13: todas as dimensões em PASS, nada a consertar. O que esta dimensão mediu naquela rodada (Toast anunciado, barra, entrada por `/`) segue igual em `4ce0433`.

## Não verificado

- Anúncio real do Toast por VoiceOver, NVDA ou TalkBack.
- Zoom de 200% pela interface do navegador (usei larguras CSS de 390 e 320 px nas outras etapas; nesta, 390 e 1280).
- WebKit no teclado.

## Risco residual

Baixo. A confirmação existe, tem papel de status e não cobre a navegação; o único desvio medido (foco em Órgãos ao gravar pelo botão) não perde informação.

## Motivo do humano

Leitor de tela para o anúncio do Toast; validação humana da etapa (Rafael digita só o domínio, entra e chega à tela do papel) e aprovação das seis frases de confirmação. Limite da seção 4 de `28`.
