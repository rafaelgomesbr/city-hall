---
validador: ux (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E09
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
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

Pasta das capturas (geradas por mim, Chromium do Playwright, painel do SHA ligado à API real semeada): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/ux-E05-E08-E09-E10/capturas/` (abaixo, `capturas/`). 128 capturas da etapa, em 1280, 768, 390 e 320 px, claro e escuro.

Checklist do portão visual (seção 0 de `19`), item a item, para Usuários (administradora e coordenadora), as janelas "Encerrar sessões", "Redefinir senha" e "Senha temporária", o aviso passageiro, e Minha conta (lista de sessões, janela de encerrar as outras, depois de encerrar, erro e carregando):

| Item | Resultado | Prova |
| --- | --- | --- |
| Alinhamento | OK: botões da linha em grade 2x2 alinhada entre as linhas; itens da lista de sessões com a mesma largura | `E09-usuarios-administradora-1280-claro.png`, `folhas/e09-conta-320.png` |
| Espaçamento | OK: nada grudado; janelas com respiro dos tokens | `folhas/e09j-a.png`, `folhas/e09j-b.png`, `folhas/e09-768.png` |
| Nada fora do lugar | OK no medidor: ZERO achados de geometria nas 128 capturas (rolagem horizontal, fora da área útil do cartão ou da janela, texto cortado, alvo abaixo de 44 px até 600 px). Ressalvas visuais em "Achados" (e-mail quebrado no meio, já existente; janela da senha a 320x568) | `geometria.json` (chaves `E09-*`, `E09j-*`) |
| Hierarquia | OK: senha temporária em fonte tabular grande, rótulo discreto; título, consequência, contagem e ação na ordem certa | `E09j-senha-temporaria-390-claro.png` |
| Texto | OK no essencial: nome da pessoa no botão destrutivo, consequência clara ("sai de todos os navegadores ... precisa entrar de novo com a própria senha, que não muda"), plural certo ("1 sessão caiu", "2 sessões caíram", "Encerrar a outra sessão", "Encerrar as outras 4 sessões"), "Esta sessão continua aberta, e a senha não muda", sem travessão. Ressalvas em "Achados" (mensagem de erro 500, redundância) | `saidas/e09.txt` |
| Responsivo | OK em 1280, 768, 390 e 320; a 768 e 390 a tabela rola dentro do cartão com o aviso "A tabela continua para a direita" (mecanismo existente) | `folhas/e09-usu-768.png` |
| Temas, foco, contraste, cor | OK: claro e escuro de tudo; foco visível na confirmação depois de encerrar (anel) e foco devolvido ao botão depois de Cancelar e de "Já anotei a senha"; selo "Esta sessão" com ícone e texto | `folhas/e09-conta-depois-390.png`, `saidas/e09.txt` |
| Estados vazio, erro, carregando | OK: só esta sessão (frase), erro com "Tentar de novo", carregando no tamanho do cartão, janela sem contagem quando a leitura falha | `E09-minha-conta-sessoes-erro-*`, `E09-minha-conta-sessoes-carregando-*`, `E09-usuarios-confirmar-encerrar-sem-contagem-*`, `E09-minha-conta-depois-de-encerrar-*` |

Heurísticas: visibilidade do estado (contagem de sessões abertas antes de encerrar; aviso passageiro com quantas caíram), controle e liberdade (Cancelar com foco devolvido; janela da senha não fecha por clique fora, de propósito), prevenção de erro (confirmação destrutiva com o nome da pessoa; botões ausentes na própria conta e em posto igual ou maior), reconhecimento (aparelho resumido "Chrome em Windows"), consistência: OK.

## Evidência

- API real na 3791 (PGlite semeado) e painel construído do SHA (pasta do scratchpad) servido na 4791; derrubados no fim.
- Roteiros `capturar.mjs e09` e `capturar.mjs e09j` (janelas na área visível), saídas `saidas/e09.txt`; console `console-e09.txt` e `console-e09j.txt`: só os 500 provocados por interceptação.
- Sondas: `sonda-email.mjs` (`saidas/sonda-email.txt`), `sonda-modal.mjs` e `sonda-modal2.mjs` (`saidas/sonda-modal.txt` e saída no terminal registrada abaixo).
- Capturas principais: `E09-usuarios-administradora-{1280,768,390,320}-*`, `E09-usuarios-coordenadora-{1280,390}-*`, `E09j-confirmar-encerrar-{1280,768,390,320}-*`, `E09j-confirmar-redefinir-*`, `E09j-senha-temporaria-*`, `E09j-confirmar-encerrar-erro-500-real-{1280,390}-*`, `E09-usuarios-toast-encerradas-*`, `E09-usuarios-senha-copiada-390-*`, `E09-minha-conta-sessoes-{1280,768,390,320}-*`, `E09j-minha-conta-confirmar-outras-*`, `E09-minha-conta-depois-de-encerrar-*`, `E09-minha-conta-sessoes-erro-*`, `E09-minha-conta-sessoes-carregando-*`, `E09-sonda-senha-temporaria-320x568-claro.png`. Olhadas pelas folhas `folhas/e09j-a.png`, `folhas/e09j-b.png`, `folhas/e09-768.png`, `folhas/e09-usu-768.png`, `folhas/e09-conta-320.png`, `folhas/e09-conta-depois-390.png` e em tamanho real a lista de 1280.
- Comparadas com as arquivadas (`docs/evidencias-v2/G00/V2-F00-E09/capturas/usuarios-administradora-1280-claro.png`): mesmo desenho; o mesmo e-mail quebrado no meio já aparece lá.

## Cenários positivos

1. Administradora: botões "Redefinir senha" e "Encerrar sessões" em todas as linhas menos na dela; coordenadora: só em operador e agente.
2. "Encerrar sessões" de pessoa com nome de 42 caracteres e 2 sessões abertas: a janela diz "tem 2 sessões abertas, a mais recente iniciada em ..."; confirmar mostra o aviso "Sessões de ... encerradas. 2 sessões caíram."
3. "Redefinir senha": janela com matrícula, e-mail e papel; confirmar abre "Senha temporária" com a senha no formato ditável, "Copiar senha" (mostra "Senha copiada." com ícone), "Já anotei a senha" devolve o foco ao botão "Redefinir senha".
4. Minha conta com 5 sessões: a atual marcada "Esta sessão"; encerrar as outras 4 pelo teclado leva o foco à confirmação "As outras 4 sessões foram encerradas. Esta continua aberta." e a lista fica só com esta, com a frase de sessão única.

## Cenários negativos

1. Leitura da contagem falhando (500): a janela diz "Não foi possível conferir quantas sessões estão abertas, mas você pode encerrar mesmo assim." e continua utilizável.
2. Encerrar ou redefinir falhando: aviso de perigo dentro da janela, que continua aberta.
3. Lista de sessões falhando: aviso de perigo e "Tentar de novo".
4. Com o corpo REAL do 500 da API (`erro_interno`, "Erro inesperado. Informe o código abaixo ao suporte.", `requisicao`): a janela mostra "Erro inesperado. Informe o código abaixo ao suporte." e nenhum código abaixo (achado 1).

## Tentativas de reprovar

- Nome de 42 a 45 caracteres nos botões destrutivos a 320 px: o rótulo quebra em linhas dentro da janela, sem estourar (medidor sem achado; `folhas/e09j-a.png`).
- Janela da senha temporária em tela baixa (320x568): o painel rola (`overflow-y: auto`, 704 contra 475 px) e "Já anotei a senha" é alcançável e clicável (elemento no ponto é o botão), mas a janela ABRE rolada 229 px porque o foco inicial vai para "Copiar senha", e o título e o aviso "Anote agora" ficam fora da vista (`E09-sonda-senha-temporaria-320x568-claro.png`). A 375x667 abre sem rolar. Achado 2.
- E-mails quebrados no meio da palavra na lista (portão: "quebrado no meio da palavra"): a sonda `sonda-email.mjs` mostra 2 linhas para os três e-mails a 1280 com a grade da E09 (coluna de 205 px) E também removendo os dois botões da E09 e a classe `tabela--justa` (coluna de 231 px). Já existente, não causado pela etapa (achado 3).
- Foco: Cancelar devolve o foco a "Encerrar sessões"; fechar a senha devolve a "Redefinir senha"; depois de encerrar as outras, o foco está no `aviso aviso--sucesso` (medido, com anel visível em `folhas/e09-conta-depois-390.png`).
- Mensagens do servidor em tela: troquei o corpo do 500 pelo real da API (achado 1).

## Achados

1. **Corrige antes de crescer (mensagem de erro que não dá para seguir).** Com o 500 real da API, as janelas "Encerrar sessões" e "Redefinir senha" e o cartão "Minhas sessões" mostram "Erro inesperado. Informe o código abaixo ao suporte." sem código nenhum: `ErroDaApi` (`apps/web/src/dados/http.ts`) guarda só `mensagem`, e o campo `requisicao` que o servidor manda (`apps/api/src/servidor.ts`, handler de erro, `erro_interno`) não é lido em parte alguma de `apps/web/src`. Reprodução: `capturar.mjs e09j` (interceptação com o corpo exato do servidor), `capturas/E09j-confirmar-encerrar-erro-500-real-390-claro.png`. É defeito de todo o painel, anterior à etapa (qualquer tela que mostra `e.message`), e o 500 é caminho inesperado; por isso não reprova a etapa, mas os estados de erro novos da E09 o herdam.
2. **Anotado.** Janela "Senha temporária" a 320x568: abre rolada, escondendo o título e "Anote agora. Esta senha não aparece de novo" (o aviso mais importante da janela). Prova acima.
3. **Anotado (já existente).** Na lista de Usuários, todo e-mail quebra no meio a 1280 px ("diego.alves@serraalta.e / xemplo.gov.br"), e na janela "Redefinir senha" a 320 px o e-mail da linha de matrícula também. Prova: `saidas/sonda-email.txt`.
4. **Anotado (acabamento).** Botões empilhados com larguras diferentes: "Copiar senha" mais estreito que "Já anotei a senha" a 320 e 390 px (`senha-temporaria__acoes`), e a 768 px "Cancelar" estreito debaixo do botão destrutivo largo (`folhas/e09-768.png`), quando o rodapé das janelas até 600 px usa largura total.
5. **Anotado (texto).** Redundância na janela da senha: "Senha temporária" três vezes (título, frase do servidor, rótulo) e "não aparece de novo" dito duas vezes (aviso e frase do servidor). "copie com Ctrl+C" não vale no Mac (Cmd+C).

## Não verificado

- Leitor de tela (anúncio de `role="status"` da contagem e do "Senha copiada", e do foco na confirmação): só por atributo e por `document.activeElement`.
- Zoom de 200 por cento; Firefox e WebKit.
- O modo de demonstração (painel sem servidor): não construí o painel em modo local nesta validação; as capturas do implementador (`usuarios-modo-demonstracao-*`, `minha-conta-modo-demonstracao-*`) não foram reproduzidas.
- O estado "Conferindo quantas sessões estão abertas" (dura milissegundos) não foi capturado.
- Cópia da senha sem permissão de área de transferência (frase "Não foi possível copiar ...") não foi provocada.

## Risco residual

Médio-baixo. A interface da etapa está alinhada e bem escrita no caminho normal e nos erros simulados; o risco que sobra é o da mensagem do 500 real (achado 1), que manda informar um código que não aparece, e o acabamento em telas muito baixas (achado 2).

## Motivo do humano

Gatilhos visuais pelo diff (seção 10 de `28`): **texto de produto** (todas as frases de `sessoes-regras.ts`, `Usuarios.tsx` e `MinhaConta.tsx`), **nova jornada relevante** (seção 26 do e2e), **mudança grande de UX** (estrutura nova em mais de um arquivo de tela: `Usuarios.tsx` e `MinhaConta.tsx`) e **fluxo de erro crítico** (encerrar sessão de outra pessoa). E4 visual do Rafael, nestas capturas: `capturas/E09-usuarios-administradora-1280-claro.png`, `capturas/E09-usuarios-coordenadora-1280-claro.png`, `capturas/E09j-confirmar-encerrar-390-claro.png`, `capturas/E09j-confirmar-redefinir-390-escuro.png`, `capturas/E09j-senha-temporaria-390-claro.png` (a frase da senha única), `capturas/E09-usuarios-toast-encerradas-1280-claro.png`, `capturas/E09-minha-conta-sessoes-1280-claro.png`, `capturas/E09j-minha-conta-confirmar-outras-390-escuro.png`, `capturas/E09-minha-conta-depois-de-encerrar-390-claro.png`, `capturas/E09-minha-conta-sessoes-erro-390-claro.png`; e, para os achados 1 e 2, `capturas/E09j-confirmar-encerrar-erro-500-real-390-claro.png` e `capturas/E09-sonda-senha-temporaria-320x568-claro.png`.
