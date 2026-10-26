---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E13
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [UI, AUTH, A11Y]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
Veredito: PASS, com uma ressalva de qualidade de teste que entra no roadmap (achado 1). Entrar a partir de `/` leva à tela do papel nos três motores, sair e outra pessoa entrar não herda a tela abandonada, o aviso passageiro fica acima da barra a 390 e 320 px, e o painel termina em 649 de 649 sem nenhum teste afrouxado.

Saídas e temporários em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/qa-painel/` (abaixo, `qa-painel/`). API minha na 3991 (banco em memória, semente nova a cada partida) e painel do SHA, construído fora do repositório, na 4991. Mutações só em `apps/web/**`, uma por vez, desfeitas com `git restore`; a árvore terminou limpa.

## Critérios verificados

| # | Critério | Resultado |
| --- | --- | --- |
| 1 | Entrar a partir de `/` leva à tela do papel, nunca "Esta página não existe" | PASS. Para coordenadora, agente, administradora e operador, a 1280 e 390 px, nos três motores: `/` sem sessão vai a `/entrar`, depois do login cai em `/painel` (ou `/meu-trabalho` para o agente) e um observador de DOM instalado antes do primeiro carregamento prova que a frase nunca apareceu; com sessão aberta, `/` desvia para a tela do papel (`qa-painel/e13-chromium.txt`, `e13-firefox.txt`, `e13-webkit.txt`, 46 de 46 cada) |
| 2 | O caminho de volta de link profundo segue valendo | PASS. `/ocorrencias` sem sessão volta para `/ocorrencias` depois de entrar |
| 3 | Sair e outra pessoa entrar não herda a tela abandonada | PASS. Helena abre `/ocorrencias`, sai, Diego entra no mesmo navegador e cai em `/meu-trabalho`; `history.state` depois de sair traz `voltarPara: null`; F5 mantém a sessão e a tela; o botão Voltar do navegador depois de sair não reabre tela protegida (prova fraca: as navegações do painel são `replace`, então o Voltar foi a `about:blank`, a página inicial do contexto; nenhuma tela protegida apareceu) |
| 4 | `rotaInterna` recusa `//outro.exemplo`, `https://outro.exemplo`, `/entrar` | PASS (`qa-painel/rotaInterna.txt`; também `/`, `/?a`, `/#x`, `javascript:` e vazio caem na tela do papel). Ver achado 3 sobre variantes que passam |
| 5 | Autorização: operador digitando `/usuarios` não vê o formulário; a rota índice sem sessão leva a `/entrar` e nada concede | PASS. O operador chega a `/usuarios` sem `#usuario-nome` e sem botões de redefinir; `/` sem sessão vai a `/entrar` |
| 6 | Aviso passageiro acima da barra a 390 px | PASS. Medido em Chromium, Firefox e WebKit a 390 e 320 px: base do aviso em 706 e topo da barra em 721 (folga de 15 px), dentro da janela (16 a 374 px a 390; 16 a 304 a 320), fundo `rgb(255, 255, 255)` opaco, `role="status"`, e dois cadastros seguidos não empilham avisos. Frase: "Equipe criada. Ela já aparece na lista abaixo." |
| 7 | Os vermelhos do painel zerados sem afrouxar teste | PASS. `npx vitest run` no painel: 43 arquivos, 649 testes, código 0 (`qa-painel/web-vitest.txt`; `baseline/07-teste-web.txt` igual). Diff dos testes lido (abaixo) |
| 8 | `fluxo.e2e.mjs` passa da seção 2 em Chromium e Firefox | PASS. Repeti contra o painel em modo local (porta 4173): Chromium 70 de 70 e Firefox 70 de 70, zero erro de console (`qa-painel/e2e-local-chromium.txt`, `e2e-local-firefox.txt`; `baseline/16-e2e.txt`). As duas verificações novas da etapa estão na seção 2 |

### O diff dos testes não afrouxou nada (`git diff afde25c..4b96ea7 -- dc360/apps/web/test`)

- `seguranca-da-conta.test.ts`, `semente-e-confirmacoes.test.ts` e `design-system.test.ts`: nenhuma linha alterada. O vermelho se fechou no código, não no teste.
- `acessibilidade.test.ts`: a janela fixa de quatro linhas virou a leitura do bloco de comentário contíguo (`comentarioAcima`, desenho pedido pela etapa), com casos sintéticos novos (linhas 594 a 615: bloco longo vale, `//` seguidos valem, elemento sem comentário não vale, comentário distante não vale).
- `sessao-e-entrada.test.ts`: saíram duas asserções de texto (`erro: "sessao"` na simulação e `toContain('"expirou"')` no fonte da sessão), trocadas por asserções de comportamento mais fortes (motivo `expirou` e `encerrada` chegam à entrada; o código antigo `sessao` já não derruba a tela). `trilha-detalhe.test.ts`: o travessão literal virou `\u2014` por causa do portão de conteúdo, mesma asserção.
- `fluxo.e2e.mjs`: ganhou um filtro de console estreito (`RUIDO_DE_FONTE_ABORTADA`, só download de fonte abortado, `status=2152398850`, do Firefox). É afrouxamento declarado e restrito; ver achado 2.

## Evidência

- Navegador: `qa-painel/e13-chromium.txt`, `e13-firefox.txt`, `e13-webkit.txt`; capturas `qa-painel/cap/e13-aviso-chromium-390.png`, `e13-aviso-chromium-320.png` (e as dos outros motores).
- Provas de que os testes mordem (cada mutação aplicada, vitest vermelho, restaurada): `<Toast` trocado por `<span` em `Equipes.tsx` e em `Usuarios.tsx` (`qa-painel/mut-e13-toast-equipes.txt`, `mut-e13-toast-usuarios.txt`: 1 falha de 5 cada); linha de `/` removida de `rotaInterna` (`mut-e13-rotainterna-raiz.txt`), `//` aceito (`mut-e13-rotainterna-duasbarras.txt`), `/entrar` aceito (`mut-e13-rotainterna-entrar.txt`): 1 falha de 27 em cada; `borderRadius: "8px"` reposto em `Estrutura.tsx` (`mut-e13-raio-a-mao.txt`: 1 de 12); rota índice removida de `App.tsx` (`mut-e13-sem-rota-indice.txt`: 1 de 649). `<div onClick>` sem exceção plantado em arquivo novo: o portão reprova (`qa-painel/planta-onclick-sem-excecao.txt`, 1 falha de 21), e a mesma tag com a exceção no comentário contíguo acima passa (`planta-excecao-contigua-valida.txt`).
- Testes do painel por arquivo: `design-system` 12, `semente-e-confirmacoes` 5, `sessao-e-entrada` 27, `seguranca-da-conta` 8.

## Cenários positivos

Os quatro papéis entrando de `/`; link profundo; saída e entrada de outra pessoa; os seis avisos (Equipes, Usuários e Órgãos na rodada do agente de navegador, `web/RELATORIO.md` T1: 48 conferências).

## Cenários negativos

`//outro.exemplo`, URL absoluta, `/entrar`, `javascript:`, tipo errado (número, nulo): caem na tela do papel; sem sessão nada é concedido; operador em `/usuarios`; Voltar depois de sair.

## Tentativas de reprovar

1. Tentei herdar a tela: Helena sai de `/ocorrencias` e Diego entra: não herda.
2. Tentei o Voltar do navegador depois de sair: não reabre tela protegida.
3. Tentei desmontar os testes novos por mutação (seis mutações acima): todos mordem.
4. Tentei derrubar o portão de acessibilidade com `<div>` com `onClick` sem exceção: reprova. Com tag aberta sozinha na linha, o portão não vê (achado 1).
5. Tentei o aviso passageiro nos três motores e a 320 px: sempre acima da barra.
6. Conferi se a correção veio por afrouxar teste: três dos cinco arquivos do vermelho não mudaram; o que mudou está acima.

## Achados

Primeiro balde, BLOQUEIA: vazio.

Segundo balde, CORRIGE ANTES DE CRESCER:

1. **O portão `nenhum onClick pendurado em elemento que o teclado não alcança` é cego a tag aberta sozinha na linha quando o arquivo está com fim de linha LF, que é o checkout limpo e o CI.** Dono: E13 (`apps/web/test/acessibilidade.test.ts`, função `elementos`: o filtro `/<[a-z][a-zA-Z0-9]*[\s/>]/` precisa de um caractere depois do nome da tag; com CRLF o `\r` serve de caractere, com LF não). Reprodução: arquivo novo `src/componentes/QaPlanta.tsx` com `<div` sozinho numa linha e `onClick` na seguinte. LF: o portão passa (21 de 21, `qa-painel/planta-tag-sozinha-LF.txt`); CRLF: reprova (`planta-tag-sozinha-CRLF.txt`). Efeito no caso real da etapa: tirei a marca de exceção do fundo de `Modal.tsx:260` (`<div` sozinho) e o portão passou (`qa-painel/mut-modal-sem-excecao-LF.txt`); com o arquivo em CRLF reprovava (`mut-modal-sem-excecao.txt`). Ou seja, o defeito que a etapa conserta (exceção de sete linhas) só era visível numa árvore CRLF do Windows, e no CI Linux a exceção do `Modal` nunca é exigida. O portão cobre a forma de uma linha e deixa passar o JSX quebrado em várias linhas (55 tags abrem sozinhas no `src`, e `BuscaGlobal.tsx` já tem uma com `onClick`). Conserto: casar `/<[a-z][a-zA-Z0-9]*(\s|\/|>|$)/`, mais um caso sintético de tag sozinha na linha, rodado também em LF. O comportamento que a etapa entrega (login a partir de `/`) não depende disso.

Terceiro balde, ANOTADO:

2. `fluxo.e2e.mjs` agora descarta do "zero erro de console" o aborto de download de fonte do Firefox. Filtro estreito (só esse status, só fonte) e justificado no código, mas é afrouxamento do portão de console; vale uma frase no VEREDITO.
3. `rotaInterna` aceita `/\t/outro.exemplo` (tabulação entre as barras, que o navegador lê como `//outro.exemplo`) e `/%2F%2Foutro.exemplo` (`qa-painel/rotaInterna.txt`). Não é explorável: o valor só chega por `history.state`, gravado pelo roteador, e nenhuma rota lê `voltarPara` de URL (conferi com busca no `src`); é defesa em profundidade.
4. O e2e do modo local em WebKit estoura o tempo na seção 4 (registrar ocorrência); é o limite que o README documenta ("O modo local não serve para o Safari", linha 1403) e a etapa só exige Chromium e Firefox.

## Não verificado

- Leitor de tela, zoom de 200 por cento, Safari e iPhone reais, aparelho físico.
- A frase "Sua sessão expirou" em tela (exige esperar o token de 15 minutos); o motivo `expirou` é coberto por teste de unidade.
- Os avisos de Órgãos a 320 px (o agente de navegador achou "Mostrar desativados" 15 px para dentro do respiro em 320; é dele e do UX).
- Rodada completa de `npm run test:e2e` pelo script de raiz (usei o `fluxo.e2e.mjs` direto contra o painel em modo local, como o README manda, e li o passo 16 da linha de base).

## Risco residual

Regressão de acessibilidade em JSX quebrado em várias linhas não é pega no CI Linux (achado 1).

## Motivo do humano

Nenhum. "Rafael digita só o domínio, entra e chega à tela do papel" foi provado por execução nos três motores.
