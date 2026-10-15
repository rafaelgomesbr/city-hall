---
validador: ux (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E09
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
Capturas em `docs/evidencias-v2/G00/validacao/52952a1/navegador/capturas/` (abaixo, `C/`), geradas por mim nesta rodada (ver `navegador/LEIA-ME.md`). Olhei as que cito. Diff da correção 2 lido (`git diff 4b96ea7..52952a1`): `MinhaConta.tsx` (botão com `botao--quebra`, foco na confirmação por `Aviso foco`), `app.css` (`.botao--quebra`, cor do texto no hover de `.botao--primario` e `.botao--secundario`), `componentes/comuns.tsx` (prop `foco` do `Aviso`).

## Critérios verificados

1. FAIL da rodada 2 (portão visual, Minha conta a 320): NÃO morde mais. Com 12 sessões abertas, o botão "Encerrar minhas outras sessões" ocupa a área útil do cartão exatamente (botão 41..279, área útil 41..279, 58 px de altura, rótulo em duas linhas), nos dois temas; medição automática sem achado em 1280, 390 e 320. `C/E09-minha-conta-sessoes-{1280,390,320}-{claro,escuro}.png` (recortei e olhei a parte de baixo das de 320).
2. FAIL de acessibilidade e QA da rodada 2 (foco em `BODY` depois de encerrar): NÃO morde. Fluxo inteiro pelo teclado, em cada largura sem redimensionar: o foco fica no aviso "As outras N sessões foram encerradas. Esta continua aberta." (`DIV aviso aviso--sucesso`, `tabindex=-1`, sem `role`), com anel de foco visível, inteiro na janela e sem a barra fixa por cima em 320, 390, 768 e 1280. `C/E09-minha-conta-confirmacao-com-foco-nativo-{320,390,768,1280}-{claro,escuro}.png`.
3. Janela de confirmação de Minha conta: título, frase "Esta sessão continua aberta, e a senha não muda.", botão com a contagem real ("Encerrar as outras 11 sessões") que quebra em duas linhas dentro da janela, foco inicial em "Cancelar". `C/E09-janela-encerrar-minhas-outras-{390,320,1280}-{claro,escuro}.png`.
4. Estado vazio depois de encerrar: "Esta é a única sessão aberta na sua conta. Quando você entrar em outro navegador ou aparelho, ele passa a aparecer aqui." `C/E09-minha-conta-sessao-unica-jonas-{390,1280}-{claro,escuro}.png`.
5. Estados carregando e erro do cartão de sessões (resposta retida e 500 simulados): "Carregando as suas sessões" do tamanho do cartão; "Não foi possível carregar as suas sessões. Erro interno." mais "Tentar de novo". `C/E09-minha-conta-sessoes-carregando-{390,320}-claro.png`, `C/E09-minha-conta-sessoes-erro-simulado-{390,320}-*.png`.
6. Usuários: "Redefinir senha" e "Encerrar sessões" na linha do Jonas, ausentes na própria linha; janela de encerrar com o nome e a contagem ("Jonas Ferreira tem 1 sessão aberta, a mais recente iniciada em ..."); Toast "Sessões de Jonas Ferreira encerradas. 1 sessão caiu."; janela de redefinir com a frase das 72 horas; janela da senha temporária com "Anote agora", fonte tabular, "Copiar senha", "Já anotei a senha"; clique fora não fecha. `C/E09-usuarios-lista-*`, `C/E09-janela-encerrar-sessoes-*`, `C/E09-usuarios-sessoes-encerradas-aviso-{390,320}-claro.png`, `C/E09-janela-redefinir-pergunta-*`, `C/E09-janela-senha-temporaria-*`.
7. Primeira entrada com a temporária abre "Defina a sua senha" (três campos, "Definir senha e entrar"); senha curta recusada; a nova entra e leva ao painel. `C/E09-definir-a-sua-senha-*`, `C/E09-definir-a-sua-senha-erro-curta-390-claro.png`.
8. Lista sem IP e sem user-agent cru (texto conferido: "Chrome em macOS", "Aparelho não identificado").
9. Defeitos das rodadas anteriores reexecutados: rodada 1 (botão da janela estourando a 390 e "Mapa da cidade" cortado) não morde; rodada 2 achado 1 (botão a 320) não morde; rodada 2 achado 2 (Esc fecha a senha temporária) continua igual por decisão em aberto do Rafael (Esc direto fecha); rodada 1 e 2 (sessões indistinguíveis) e rodada 2 achado 4 (coluna "Ação" atrás da rolagem lateral) persistem, anotados.

Portão visual, item a item (Minha conta e as janelas desta etapa):
- Alinhamento: PASS (botão alinhado às bordas da área útil; itens de sessão com a mesma largura).
- Espaçamento: PASS (nada grudado; confirmação com o mesmo respiro dos itens).
- Nada fora do lugar: PASS em Minha conta e nas janelas; ressalva no achado 1 (Toast sobre a janela da senha temporária).
- Hierarquia: PASS (aparelho em negrito, datas discretas, selo "Esta sessão").
- Texto: PASS (sem travessão; rótulo do botão conta as sessões; frases dizem o efeito).
- Responsivo: PASS em 1280, 390, 320 e, no foco, 768.
- Temas, foco, estado: PASS (anel de foco visível na confirmação nos dois temas; selo "Esta sessão" com ícone e texto).
- Estados: vazio, erro e carregando desenhados.
- Rafael: pendente (gatilhos abaixo).

Heurísticas: 1 visibilidade (contagem real no botão e no Toast), 3 controle (Cancelar com o foco inicial na ação destrutiva), 5 prevenção (clique fora não fecha a senha temporária), 9 recuperação (erro de leitura com "Tentar de novo").

## Evidência

- `node $SP/val/ux/e09.mjs`, `node $SP/val/ux/e09-foco.mjs` e `node $SP/val/ux/e09-esc.mjs` (códigos 0), saídas `e09.log`, `e09-foco.log`; foco, geometria e textos em `$SP/val/ux/resultados.json` (22 verificações, 0 falha).
- Capturas lidas: `E09-minha-conta-sessoes-320-claro.png` e recorte da `-320-escuro`, `E09-minha-conta-confirmacao-com-foco-nativo-320-escuro.png`, `E09-janela-encerrar-minhas-outras-320-escuro.png`, `E09-janela-senha-temporaria-320-claro.png`, `E09-definir-a-sua-senha-320-escuro.png`, `E09-usuarios-lista-390-claro.png`, `E09-janela-encerrar-sessoes-320-claro.png`.

## Cenários positivos

- Encerrar as outras sessões pelo teclado: confirmação com foco, a lista cai para "Esta sessão" e o texto de sessão única.
- Redefinir a senha do Jonas, primeira entrada com troca obrigatória, nova senha entra.

## Cenários negativos

- A própria conta não tem "Redefinir senha" nem "Encerrar sessões".
- Senha curta na troca obrigatória é recusada na tela.
- Clique fora da senha temporária não a fecha.

## Tentativas de reprovar

- Abri Minha conta com 12 sessões (lista longa) a 320 para forçar o botão: cabe.
- Minhas primeiras capturas da confirmação, tiradas redimensionando a mesma página, mostravam o aviso atrás da barra de baixo a 320. Suspeitei de foco encoberto (WCAG 2.4.11) e refiz o fluxo inteiro em cada largura, sem redimensionar: o aviso fica inteiro na janela (320: 420..504 px, barra de baixo a partir de 765). Era artefato da captura; apaguei aquelas imagens e cito só as `-nativo-`.
- Tentei o Esc na senha temporária: direto, fecha (comportamento já registrado, decisão do Rafael). Depois de um clique fora, o foco cai em `BODY` e o Esc deixa de funcionar (achado 2).
- Procurei hover ilegível nos botões tocados pela correção (`.botao--secundario`): o texto mantém a cor.
- Procurei o Toast de "Sessões encerradas" em cima de algo importante: achei (achado 1).

## Achados

1. Corrige antes de crescer (novo, da etapa): a 320 px, o Toast "Sessões de Jonas Ferreira encerradas. 1 sessão caiu." fica por cima da janela "Senha temporária" e cobre o rodapé dela ("Já anotei a senha") quando a pessoa encerra as sessões e logo em seguida redefine a senha da mesma pessoa (o Toast dura de 6 a 15 s e tem z-index acima da janela). `C/E09-janela-senha-temporaria-320-claro.png`. Transitório e com "Fechar", não esconde a senha; por isso não reprova. Dono: E09 ou F10 (Toast fechar ao abrir janela, ou ficar abaixo do véu).
2. Corrige antes de crescer (anterior à fase, `Modal.tsx`): depois de um clique no véu de uma janela que não fecha por clique fora, o foco vai a `BODY` e o Esc deixa de fechar; o Tab recomeça da página. Reprodução: Usuários, Redefinir senha, confirmar, clicar fora, Esc (`resultados.json`, evento "E09 Esc clique-fora-e-esc"). Dono F10-E11.
3. Anotado (persiste): sessões abertas pela API aparecem todas como "Aparelho não identificado" com o mesmo horário; não há como distinguir uma da outra.
4. Anotado (persiste): na lista de Usuários a 390 e 320, as ações da linha ficam atrás da rolagem lateral (com a dica "A tabela continua para os dois lados").
5. Anotado: "Defina a sua senha" mantém o subtítulo "Entre com seu email funcional" acima do cartão; "Repita a senha nova" aqui e "Repita a nova senha" na recuperação (E10): ordem de palavras diferente para o mesmo campo.

## Não verificado

- Firefox e WebKit (o estouro da rodada 2 apareceu também no Firefox); só Chromium aqui.
- Zoom de 200 por cento; leitor de tela (CP-32).
- "Copiar senha" (área de transferência) não foi exercitado nesta rodada.

## Risco residual

Baixo. O conserto é de classe própria (`.botao--quebra`) e só muda o botão de Minha conta; o foco por `Aviso foco` foi provado por medição.

## Motivo do humano

Gatilhos da seção 10 disparados pelo diff da etapa: texto de produto (frases da senha única, das janelas e do Toast), nova jornada (seções novas do e2e), novo padrão visual (classe compartilhada `.botao--quebra` em `app.css` e a prop `foco` do componente compartilhado `Aviso`), mudança de UX em Minha conta e Usuários, e fluxo de erro crítico de sessão. Rafael confere as capturas `E09-*`, a frase da senha temporária e decide o Esc (pendência já registrada) e o achado 1.
