---
validador: acessibilidade (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E13
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [UI, A11Y, AUTH]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
Escopo de acessibilidade da E13: entrar a partir de `/` (rota índice que leva à tela do papel), a página "Esta página não existe", o portão estático de `acessibilidade.test.ts` (marca de exceção no bloco de comentário contíguo) e as confirmações por `Toast` (`role="status"`) em Usuários, Equipes e Órgãos. Foco e título na troca de rota são o ponto pedido nesta rodada. Nenhum arquivo da E13 mudou em `4b96ea7..52952a1`; `comuns.tsx` mudou (prop `foco` do `Aviso`) sem tocar no `Toast`.

## Critérios verificados

1. Entrar a partir de `/`, só teclado (Chromium e WebKit): `/` sem sessão leva a `/entrar` com título "Entrar · Defesa Civil 360"; Tab até o email, digitar, Tab, senha, Enter. A coordenadora cai em `/painel` ("Painel · Defesa Civil 360") e o agente de campo em `/meu-trabalho` ("Meu trabalho · Defesa Civil 360"). Com sessão aberta, digitar `/` leva a `/painel` com o título dela. `e13.log`.
2. Foco na troca de rota (2.4.3): depois de entrar, o foco vai ao conteúdo (`MAIN#conteudo`, `tabindex=-1`), nos dois motores; o primeiro Tab segue para o primeiro controle do conteúdo ("Registrar ocorrência" no Painel). `e13.log`.
3. Página inexistente por navegação interna: título "Esta página não existe · Defesa Civil 360" (2.4.2) e foco em `#conteudo`; "Voltar ao início" é link com nome (`link`, "Voltar ao início"), alcançável pelo Tab; Enter volta ao Painel com o foco no conteúdo. Por carga direta: o mesmo título, foco em `BODY` (primeira renderização, de propósito: não rouba o cursor de quem acabou de abrir). A 320 px sem rolagem lateral (1.4.10). Capturas `a11y-E13-pagina-inexistente-320-{claro,escuro}.png` e as do UX `E13-pagina-inexistente-*`, `E13-raiz-leva-a-entrada-*`, `E13-destino-*`.
4. Portão estático (E1, prova que morde): `test/acessibilidade.test.ts` verde (21 de 21); com um `<div onClick>` sem a marca plantado em `NaoEncontrada.tsx`, o caso "nenhum onClick pendurado em elemento que o teclado não alcança" reprova (`mut1-portao-onclick.log`); restaurado com `git restore`, árvore limpa.
5. Vitest das suítes ligadas: `acessibilidade`, `semente-e-confirmacoes` (os três `Toast`), `sessao-e-entrada` (caso de `voltarPara: "/"`) e outras três: 124 de 124 (`vitest-a11y.log`).
6. Achados das rodadas 1 e 2 reexecutados: o `Toast` continua montando a região `role="status"` já com o texto (medido de novo na E09 desta rodada: `tipo: nasceu`); os furos do portão (comentário na mesma linha de outro elemento, `h1` a `h6` e `svg` com `onClick`, botão sem nome não acusado) continuam, porque o arquivo não mudou. Nenhum é critério desta etapa.

## Evidência

- Painel construído do SHA fora do repositório, API PGlite nas portas 3881 e 4881 (`$SP/val/acessibilidade/subir.sh`), Chromium e WebKit do Playwright 1.62.1; agente de campo fictício criado pela API.
- `node $SP/val/acessibilidade/e13.mjs`: código 0, `e13.log` com 28 OK e 1 FALHA; a FALHA é "Voltar ao início alcançável pelo Tab" no WebKit, explicada pela sonda `e13b.mjs` (`e13b.log`): numa página mínima o WebKit do macOS também não leva o Tab a link (Tab: `INPUT`, `BODY`, `INPUT`), e com Option+Tab, a tecla do macOS para links, o "Voltar ao início" é alcançado. É preferência do sistema, não defeito do painel.
- Árvore de acessibilidade do Chromium (CDP) no foco: `#conteudo` tem papel `main` e nome vazio.

## Cenários positivos

Domínio puro, entrada pelo teclado e chegada à tela do papel com título certo e foco no conteúdo, para coordenação e para agente; página inexistente com título próprio, foco no conteúdo e caminho de volta pelo teclado.

## Cenários negativos

- Sem sessão, `/` não concede nada: vai à entrada.
- Endereço inexistente é dito, não redirecionado em silêncio.
- O portão reprova `onClick` sem exceção plantado.

## Tentativas de reprovar

- Procurei o título da aba preso no anterior depois de navegar para a página inexistente (risco de SPA): muda na hora, nos dois motores.
- Procurei o foco perdido em `BODY` depois de entrar a partir de `/` (o redirecionamento passa por duas rotas): fica no `main`.
- Procurei o link de volta inalcançável: alcançável no Chromium pelo Tab e no WebKit pelo Option+Tab.
- Plantei a violação do portão e vi o vermelho.

## Achados

1. corrige antes de crescer (dono F10-E11, mesmo achado das rodadas 1 e 2): o `Toast` monta a região `role="status"` já com o texto; o anúncio das confirmações de Usuários, Equipes e Órgãos não é garantido (4.1.3).
2. corrige antes de crescer (mesmos achados 1 a 3 da rodada 2, sem mudança): furos do portão de exceção e ausência de portão para controle sem nome.
3. anotado (anterior à fase, `NaoEncontrada.tsx` e `TrocaDeTela.tsx` sem mudança desde `afde25c`): o foco da troca de rota vai a um `main` sem nome acessível, e "Esta página não existe" é um parágrafo (`p.vazio__titulo`), não um título (a página não tem `h1`). O leitor de tela anuncia a região e o conteúdo, mas não um título da tela; 1.3.1 e 2.4.6 ficam frágeis aqui. Conserto: `aria-labelledby` do `main` apontando para o título da tela, ou foco no `h1`.

## Não verificado

- Leitor de tela real na troca de rota (o que é dito ao focar um `main` sem nome) e nos `Toast` (CP-32).
- Firefox (não instalado).
- Zoom de 400 por cento.

## Risco residual

Quem usa leitor de tela chega à tela do papel com o foco no conteúdo e o título da aba certo, mas o anúncio da troca depende de o leitor ler a região focada; na página inexistente não há título marcado como tal.

## Motivo do humano

Leitor de tela real na entrada a partir de `/`, na troca de rota e nos `Toast` (CP-32). Pendência já registrada: Rafael digita só o domínio, entra, confere a tela do papel e aprova as frases das confirmações (nova jornada e texto de produto, seção 10).
