---
validador: ux (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E11
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [UI, A11Y, LGPD]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: texto-de-produto, fluxo-de-erro-critico, nova-jornada-relevante (seção 28 nova no e2e)
---

Pasta das saídas e capturas deste validador (scratchpad, fora do repositório):
`/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/ux-E11-E13-E24/`
(abaixo, `SP/` abrevia esse caminho; `SP/capturas/` tem os PNG citados).

## Critérios verificados

Checklist do portão visual (seção 0 de `19-definicao-de-pronto.md`) e heurísticas de Nielsen, item a item, sobre o cartão "Saída de município" de `/organizacao` (o que a etapa toca), com o painel construído de `bb0f654` e ligado à API real (Postgres em WebAssembly com a semente, como o roteiro `scripts/e2e-api.mjs` sobe).

| Item | Resultado | Prova |
| --- | --- | --- |
| Alinhamento | OK: botão alinhado à margem interna do cartão (x=321 no cartão x=296 a 1280; x=41 no cartão x=16 em 768, 390 e 320); aviso de erro com a mesma largura do texto do cartão | `SP/saidas/capturas-chromium.txt` (linhas `saida-*`), `SP/capturas/e11-saida-normal-1280-claro.png` |
| Espaçamento | OK: aviso, parágrafo e botão com respiro igual; nada grudado em nenhum dos cinco estados | `e11-saida-erro-suspenso-390-escuro.png`, `e11-saida-erro-sem-permissao-768-claro.png` |
| Nada fora do lugar | OK no cartão: botão sempre dentro do cartão (`botaoDentro: true` em 40 combinações), sem rolagem horizontal da página em 1280, 768, 390, 320 e zoom de 200 por cento. Fora do cartão, anterior à etapa: o marcador do campo de busca do topo aparece cortado a 320 px ("Buscar registro ou funç") | `SP/saidas/capturas-chromium.txt`, `SP/saidas/complemento.txt`, `e11-saida-erro-rede-320-claro.png` |
| Hierarquia | OK: título do cartão, parágrafo em `--ds-fs-body-sm` muted, botão secundário com ícone | `e11-saida-normal-1280-claro.png` |
| Texto bem escrito | OK com uma ressalva anotada: "Gerando", "Baixar pacote de saída", "Sem conexão com o servidor. O arquivo não foi baixado. Verifique o sinal e tente de novo." e a frase de suspensão estão corretas e dizem o que fazer. A frase de quem não administra diz "alterar os dados do município" onde a pessoa quis baixar (texto do catálogo, já registrado para a F03) | `SP/saidas/capturas-chromium.txt` (linhas `aviso`) |
| Responsivo | OK: 1280, 768, 390, 320 e 200 por cento (viewport 640x450 com escala 2) | `e11-saida-*-{1280,768,390,320}-*.png`, `e11-saida-normal-zoom200-claro.png` |
| Dois temas, foco, contraste, estado nunca só por cor | OK: os cinco estados nos dois temas; foco do teclado visível (anel violeta) nos dois temas; erro com ícone de alerta mais texto e `role="alert"`; carregando com texto "Gerando" mais botão desabilitado (não só cor) | `e11-saida-foco-teclado-1280-claro.png`, `e11-saida-foco-teclado-1280-escuro.png`, `e11-saida-carregando-1280-escuro.png` |
| Vazio e erro desenhados | OK: três erros (sem permissão, suspenso, rede) com o mesmo acabamento do estado normal; não há estado vazio neste cartão | `e11-saida-erro-*` |
| Rafael vê e aprova | PENDENTE (gatilhos da seção 10 disparam, ver Motivo do humano) | |

Heurísticas: visibilidade do estado (botão muda para "Gerando" e desabilita, provado `desabilitado=true`); correspondência com o mundo real ("O arquivo não foi baixado", e não a frase de formulário); controle e liberdade (o botão volta a funcionar depois de cada erro); prevenção de erro (o parágrafo avisa que é o arquivo mais sensível e que baixar não apaga nada); reconhecimento (ícone de documento mais rótulo); mensagens de erro que dizem o que fazer (rede e suspensão dizem; a de permissão não diz, anotado).

## Evidência

- Painel: `npx vite build --outDir SP/dist-web` com `VITE_API_URL=http://127.0.0.1:3795` em `dc360/apps/web` (código 0, `SP/saidas/build-web.txt`); servido por `vite preview --port 4795`. API: `npx tsx src/index.ts` em `dc360/apps/api` com as mesmas variáveis do `scripts/e2e-api.mjs` em portas próprias (`SP/saidas/api.log`). Os dois foram derrubados no fim e a pasta `dist-web` apagada; o `dist` do repositório não foi tocado.
- Roteiro de capturas: `SP/capturar.mjs` (Chromium), código 0, saída `SP/saidas/capturas-chromium.txt`, zero erro de console e de página.
- Complemento: `SP/complemento.mjs`, código 0, `SP/saidas/complemento.txt` (zoom 200 por cento; download em WebKit e Firefox).
- Capturas do cartão (cinco estados x 1280, 768, 390, 320 x claro, escuro = 40): `SP/capturas/e11-saida-normal-*`, `e11-saida-carregando-*`, `e11-saida-erro-rede-*`, `e11-saida-erro-sem-permissao-*`, `e11-saida-erro-suspenso-*`; mais `e11-saida-foco-teclado-1280-{claro,escuro}.png`, `e11-saida-normal-zoom200-claro.png`, `e11-saida-depois-do-download-1280-claro-{webkit,firefox}.png`, `e11-organizacao-pagina-inteira-1280-claro.png`.
- Olhei uma a uma: `e11-saida-normal-1280-claro`, `e11-saida-carregando-1280-escuro`, `e11-saida-erro-suspenso-390-escuro`, `e11-saida-erro-rede-320-claro`, `e11-saida-erro-sem-permissao-768-claro`, `e11-saida-erro-sem-permissao-1280-escuro`, `e11-saida-foco-teclado-1280-claro`, `e11-saida-normal-zoom200-claro`, `e11-organizacao-pagina-inteira-1280-claro`. As demais combinações foram conferidas por medida (posição, largura, rolagem, papel e texto do aviso) no log.

## Cenários positivos

- Download real pelo botão, Chromium: `dc360-pacote-de-saida-2026-10-19.zip`, 250472 bytes, assinatura `PK`, sem falha (`SP/saidas/capturas-chromium.txt`). WebKit: 250914 bytes, `PK`. Firefox: 251077 bytes, `PK` (`SP/saidas/complemento.txt`). O arquivo foi apagado logo depois.
- Estado carregando: "Gerando" e `disabled` enquanto a rota está segura.
- Botão de 44 px de altura em todas as larguras.

## Cenários negativos

- Coordenadora pela API real: `403 {"erro":"sem_permissao","mensagem":"Seu perfil não tem permissão para alterar os dados do município."}`; esse corpo real, servido à tela da administradora, aparece no aviso `role="alert"` com ícone.
- `POST /pacote.zip` na raiz: 404.
- Suspensão (interceptação com a frase de contrato): frase inteira na tela, sem corte em 320 px.
- Rede caída (`abort`): "Sem conexão com o servidor. O arquivo não foi baixado. Verifique o sinal e tente de novo.", sem "preencheu".

## Tentativas de reprovar

1. Larguras além das pedidas (768, 320 e zoom de 200 por cento) para achar corte ou botão saindo do cartão: não achei no cartão.
2. Foco por teclado no botão (Shift+Tab, Tab) nos dois temas: o anel aparece; a medida inicial deu `outline: none` porque foi lida durante a transição, e a captura confirma o anel.
3. Download em três motores (Chromium, WebKit, Firefox): os três recebem o ZIP.
4. Procurei texto errado no nome do arquivo: ACHEI que o nome usa a data UTC (`new Date().toISOString().slice(0, 10)`, `apps/web/src/dados/http.ts:1109`): baixado às 21:23 de 18/10/2026 (horário de Brasília), o arquivo saiu com `2026-10-19`. Ver Achados.
5. Captura de página inteira a 1280 mostrou o topo fixo desenhado no meio e o botão escuro com texto escuro: reproduzi em captura de janela sem troca de tema (`e11-saida-normal-1280-claro.png`) e o botão está correto; o defeito era da captura (topo fixo em página inteira, e transição de tema ainda correndo), não do painel.
6. Procurei se a frase de recusa some ou derruba a sessão: a administradora continua em `/organizacao` e o botão volta habilitado.

## Achados

1. **Corrige antes de crescer (anterior à etapa, agora alcançável):** o nome do pacote leva a data em UTC. Entre 21h e 24h no horário de Brasília o arquivo sai datado do dia seguinte (reprodução: 18/10/2026 21:23 -03, nome `dc360-pacote-de-saida-2026-10-19.zip`). A linha nasceu em `b793e82` (2026-09-17); a etapa a tornou alcançável ao consertar o botão. A rota da API faz o mesmo (`apps/api/src/rotas/saida.ts:133`). Não quebra o critério da etapa (o formato `AAAA-MM-DD` está certo), mas é texto errado diante da pessoa e num arquivo que fica no processo do município.
2. **Anotado (já registrado):** a recusa de permissão diz "alterar os dados do município" quando a pessoa quis baixar. Só alcançável se a permissão cair com a tela aberta, porque `/organizacao` já exige `gerenciar_organizacao`. Registrado pelo implementador para a F03.
3. **Anotado (anterior à fase):** marcador do campo de busca do topo cortado a 320 px.
4. **Anotado (artefato da captura):** nas capturas escuras a barra lateral diz "Tema escuro" porque o tema foi trocado direto em `data-theme`, sem o botão do painel.

## Não verificado

- Firefox e WebKit só no download (não capturei os cinco estados nesses motores).
- Leitor de tela real (VoiceOver ou NVDA) anunciando o `role="alert"`: é da dimensão acessibilidade.
- O conteúdo do ZIP (CSV, laudo, somas) não foi aberto por mim: é de QA e LGPD.
- O 401 que renova uma vez não foi refeito por mim (é comportamento, não aparência; coberto pelo e2e e por QA).

## Risco residual

Baixo na aparência. O nome datado em UTC pode confundir quem arquiva o pacote à noite. A frase de permissão com o verbo errado continua até a F03.

## Motivo do humano

Gatilhos da seção 10 disparados pelo diff: **texto de produto** (frase nova "O arquivo não foi baixado" em `SemConexao`, `apps/web/src/dados/http.ts`), **fluxo de erro crítico** (recusa de permissão, suspensão e falha de rede agora chegam à tela neste cartão) e **nova jornada relevante** (seção 28 nova em `apps/web/test/fluxo-api.e2e.mjs`). Rafael precisa olhar, em `SP/capturas/`: `e11-saida-normal-1280-claro.png`, `e11-saida-normal-390-escuro.png`, `e11-saida-carregando-1280-escuro.png`, `e11-saida-erro-rede-390-claro.png`, `e11-saida-erro-sem-permissao-1280-escuro.png`, `e11-saida-erro-suspenso-390-escuro.png` e `e11-saida-erro-rede-320-claro.png` (ou as 20 do implementador em `docs/evidencias-v2/G00/V2-F00-E11/capturas/`), aprovar as três frases de erro, e decidir se o nome do arquivo deve usar a data local (achado 1). A validação humana da própria etapa (baixar pelo painel e abrir o ZIP) continua com ele.
