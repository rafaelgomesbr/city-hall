---
validador: ux
modelo: claude-opus-5-5
etapa: V2-F00-E09
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Capturas minhas, Chromium do Playwright, painel construído do SHA nos dois modos: API (`VITE_API_URL`, ligado à API real do SHA com PGlite semeado) e local (demonstração, Postgres em WebAssembly). Pasta: `docs/evidencias-v2/G00/V2-F00-E09/validacao/4ce0433/capturas/` (abaixo, `capturas/`), 93 arquivos `ux-*`, em 1280, 768, 390 e 320 px, claro e escuro; olhados diretamente ou por recorte (`recortes/` no scratchpad).

| Critério (DoD e portão visual) | Resultado | Prova |
| --- | --- | --- |
| Botões por linha só quando o posto permite, nunca na própria conta | OK | administradora: 0 botões na própria linha, 2 nas outras; coordenadora: 0 em Rita e Helena, 2 em Jonas e Diego (log `E09 coordenadora vê botões`). `capturas/ux-usuarios-administradora-{1280,768,390,320}-*.png`, `capturas/ux-usuarios-coordenadora-{1280,390}-*.png` |
| `ConfirmarAcao` destrutiva com o nome da pessoa e a contagem | OK | "Diego Nakamura Alves tem 2 sessões abertas, a mais recente iniciada em ..."; botão "Encerrar sessões de Diego Nakamura Alves" quebra em duas linhas a 320 px dentro da janela (painel 24..296, botão 49..271, medido). `capturas/ux-usuarios-confirmar-encerrar-{1280,390,320}-*.png`, `capturas/ux-usuarios-confirmar-redefinir-{1280,390,320}-*.png` |
| Toast ao encerrar, `role=status`, foco devolvido | OK | "Sessões de Diego Nakamura Alves encerradas. 2 sessões caíram." com ícone; foco volta ao botão "Encerrar sessões". `capturas/ux-usuarios-sessoes-encerradas-aviso-{1280,390}-*.png` |
| `SenhaTemporaria`: uma vez, fonte tabular, copiar, frase de que não volta, não fecha por clique fora | OK | "Anote agora. Esta senha não aparece de novo..."; clique fora mantém a janela; "Copiar senha" mostra "Senha copiada."; "Já anotei a senha" fecha e o foco volta a "Redefinir senha". A 320x568 a janela rola por dentro (scrollHeight 704, clientHeight 475, `overflow-y: auto`). `capturas/ux-usuarios-senha-temporaria-{1280,390,320}-*.png`, `capturas/ux-usuarios-senha-copiada-390-*.png` |
| Erro ao redefinir desenhado | OK | 500 interceptado: aviso de perigo dentro da janela. `capturas/ux-usuarios-confirmar-redefinir-erro-{1280,390}-*.png` |
| Minha conta: lista com "Esta sessão" (ícone e texto), confirmação que diz que esta continua aberta | OK | `capturas/ux-minha-conta-sessoes-{1280,768,390,320}-*.png`, `capturas/ux-minha-conta-confirmar-outras-{1280,390,320}-*.png` ("Esta sessão continua aberta, e a senha não muda.") |
| Depois de encerrar: confirmação com foco e à vista | OK | foco em `DIV.aviso aviso--sucesso` "As outras N sessões foram encerradas. Esta continua aberta."; medido o ponto do foco: não coberto pelas barras fixas a 390, 320 e 1280 (`saidas/sonda-foco.txt`). `capturas/ux-minha-conta-foco-na-confirmacao-janela-{390,320,1280}-claro.png`, `capturas/ux-minha-conta-depois-de-encerrar-*.png` |
| Estados vazio (só esta sessão), erro, carregando | OK | `capturas/ux-minha-conta-sessao-unica-*.png`, `capturas/ux-minha-conta-sessoes-erro-*.png` ("Não foi possível carregar as suas sessões." e "Tentar de novo"), `capturas/ux-minha-conta-sessoes-carregando-*.png` |
| Modo local explica em vez de oferecer | OK | Usuários: 0 botões e aviso "Neste painel a entrada é por escolha de perfil..."; Minha conta: frases de explicação nas três seções; console vazio. `capturas/ux-usuarios-modo-demonstracao-*.png`, `capturas/ux-minha-conta-modo-demonstracao-*.png` |
| Nada fora do lugar, sem rolagem horizontal da página | OK com ressalvas | medição em todas as capturas: nenhuma rolagem horizontal da página nem elemento além da janela (`saidas/capturas.log`); ressalvas nos Achados (aviso passageiro sobre a janela, e-mails quebrados no meio) |
| Texto bem escrito | Ressalva | frases da etapa corretas; na MESMA tela (Minha conta, trocar senha) aparece "A senha atual nao confere." (Achado 1) |

Itens do "Motivo do veredito" da rodada 4 que tocam a tela: (1) o id em maiúsculas burlava a recusa sobre a própria conta. O painel nunca manda o id em outra caixa e não oferece os botões na própria linha (verificado, 0 botões); pela API, com o próprio id em MAIÚSCULAS, as três rotas responderam 422 com frases em português correto ("Para trocar a sua própria senha use Minha conta, onde a senha atual é exigida...", "Para encerrar as suas próprias sessões use Minha conta: lá a sessão onde você está agora continua aberta.", "Você não pode desativar a própria conta."). Consertado do ponto de vista que esta dimensão alcança. (2) A corrida da troca em voo não é visível em tela; fica com QA e red-team.

## Evidência

- Roteiros `e09.mjs`, `sonda-toast.mjs`, `sonda-foco.mjs` no diretório de trabalho `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L06-ux/`; saídas `saidas/e09.txt` (código 0 na segunda execução; a primeira caiu por seletor meu, sem relação com o painel), `saidas/sonda-toast.txt`, `saidas/sonda-foco.txt`, `saidas/capturas.log`.
- Console: modo local vazio; modo API só os 401 do caso da senha atual errada e os 500 provocados por interceptação.

## Cenários positivos

- Fluxo completo da administradora: encerrar com contagem, aviso, redefinir, senha temporária, copiar, fechar com foco devolvido.
- Minha conta com nove sessões abertas: lista, confirmação, foco na confirmação, estado de sessão única.

## Cenários negativos

- Coordenadora não vê botões em administradora nem em coordenadora (posto igual ou maior), nem na própria linha.
- Leitura da contagem recusada (403 por posto) e redefinição com erro 500: a janela mostra a frase e continua utilizável.
- Senha atual errada na troca: a sessão não cai, aparece um aviso (texto com defeito, Achado 1).

## Tentativas de reprovar

- Aviso passageiro ("Sessões ... encerradas") seguido de "Redefinir senha" na mesma pessoa em menos de 6 s (sequência natural do "perdi o celular"): o aviso fica POR CIMA da janela da senha temporária, e por estar dentro da página `inert` o botão "Fechar" dele não responde. A 320x568 ele cobre "Copiar senha" e "Já anotei a senha" até sumir (cerca de 6 s; sumiu nos três ensaios, também com o ponteiro em cima). `capturas/ux-sonda-toast-sobre-senha-temporaria-320-claro.png`, `capturas/ux-sonda-toast-sobre-senha-temporaria-390-claro.png`, `capturas/ux-sonda-toast-sobre-senha-temporaria-390-claro-hover.png`, e os `-depois-de-9s` (aviso já fora). Achado 2.
- Quebra de texto na lista: a 1280 px os e-mails da coluna Pessoa quebram no meio ("diego.alves@serraalta.ex / emplo.gov.br"). Para saber se é da etapa, comparei com o modo local, onde a linha só tem dois botões (o desenho anterior à E09): também quebra ("diego.alves@serraalta.exemplo.g / ov.br"). É anterior; a E09 só deslocou o ponto. Achado 3.
- 768 px: a tabela rola dentro do cartão com o aviso "A tabela continua para a direita"; "Redefinir se..." aparece cortado na borda da área que rola (mecanismo existente, registrado em `apps/web/PENDENCIAS.md`).
- Foco depois de encerrar coberto pelas barras fixas: não (medido).

## Achados

1. corrige antes de crescer: "A senha atual nao confere." (sem acento) aparece em Minha conta ao errar a senha atual na troca (`capturas/ux-minha-conta-senha-atual-errada-390-claro.png`, `-1280-*`). Origem: `dc360/apps/api/src/auth/servico.ts:1094` e `:1178` (esta segunda linha nasceu na correção 4 da E07, commit `b6afdb0`, dentro deste candidato) e `auth/segundo-fator.ts:341`. A E09 declarou ter corrigido os acentos das mensagens de `/auth/trocar-senha` e não pegou esta. Reprodução: Minha conta, "Senha que você usa hoje" errada, nova e repetida iguais com 12 ou mais caracteres, "Trocar senha". Conserto: "A senha atual não confere." nos três pontos.
2. corrige antes de crescer: o `Toast` de sessões encerradas (`componentes/Toast.tsx`, `z-index` `--ds-z-toast`) é desenhado acima da janela modal da senha temporária e fica inerte; a 320 px cobre os dois botões da janela por até 6 s. Reprodução: `sonda-toast.mjs` (encerrar sessões, em seguida Redefinir senha da mesma pessoa). Conserto mínimo: fechar o aviso ao abrir uma janela, ou desenhá-lo abaixo do fundo do modal.
3. anotado (anterior à etapa): e-mails quebrados no meio da palavra na coluna Pessoa a 1280, 768, 390 e 320 px (`capturas/ux-usuarios-administradora-1280-claro.png`, `capturas/ux-usuarios-modo-demonstracao-1280-escuro.png`). O portão visual da DoD proíbe "quebrado no meio da palavra"; quebrar no "@" ou no "." resolveria.
4. anotado: frases 422 da própria conta poderiam ter vírgula ("Para trocar a sua própria senha, use Minha conta"); só aparecem por API.

## Não verificado

- Zoom de 200 por cento, leitor de tela (anúncio do `role=status` e do foco na confirmação), Firefox e WebKit.
- Estado "Conferindo quantas sessões estão abertas" (dura milissegundos) não capturado.
- Login com a senha temporária e a troca obrigatória da pessoa redefinida não foram fotografados nesta rodada (o fluxo funcional é do QA).

## Risco residual

Médio-baixo. A etapa entrega o que promete e as telas novas estão alinhadas e escritas; ficam um texto sem acento na mesma tela e um aviso passageiro que tampa a janela mais sensível da etapa por alguns segundos.

## Motivo do humano

Validação humana da etapa (Rafael faz o fluxo e confere a frase da senha única e as confirmações) e gatilho de texto de produto. Capturas para o Rafael: `capturas/ux-usuarios-senha-temporaria-390-claro.png`, `capturas/ux-usuarios-confirmar-encerrar-320-claro.png`, `capturas/ux-minha-conta-confirmar-outras-390-escuro.png`, `capturas/ux-minha-conta-foco-na-confirmacao-janela-320-claro.png`, `capturas/ux-minha-conta-senha-atual-errada-390-claro.png` (Achado 1) e `capturas/ux-sonda-toast-sobre-senha-temporaria-320-claro.png` (Achado 2), para ele decidir se os dois achados entram antes do gate.
