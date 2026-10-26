---
validador: acessibilidade
modelo: claude-sonnet-5-5
etapa: V2-F00-E11
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [UI, A11Y, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
Escopo de acessibilidade: o cartão "Saída de município" em `/organizacao` (botão "Baixar pacote de saída", estado "Gerando", faixa de erro) e o anúncio do download do ZIP. Régua: WCAG 2.2 AA. Base: HEAD 665b2be (só STATUS difere de 7005a60). As sondas rodaram contra API real e painel real do SHA (portas 3791 e 4791, Chromium), com a administradora da semente; o ZIP baixado foi apagado e nada ficou no repositório.

## Critérios verificados

1. Testes estáticos: os mesmos 9 arquivos de `apps/web/test` (inclui `acessibilidade.test.ts`, `foco.test.ts`, `modal.test.ts`, `toast.test.ts`): 143 testes, 0 falhas (`scratchpad/acess/vitest.txt`). `fluxo.e2e.mjs`: 70 de 70, zero erro de console (`e2e-local.txt`).
2. Nome acessível e teclado (2.1.1, 4.1.2): o botão é um `<button type="button">` nativo, nome "Baixar pacote de saída" (ícone mais texto), alcançado por Tab entre os controles da página na ordem visual, acionado por Enter, que baixou `dc360-pacote-de-saida-2026-10-13.zip` com 236056 bytes (`sonda-e11.txt`). Sem ARIA sobre HTML já semântico.
3. Foco visível (2.4.7): no botão, anel de duas camadas `box-shadow 2px #f5f7f8 + 2px #6d28d9` no claro (sombra lida 450 ms depois de focar para vencer a transição); captura `foco-pacote-claro.png` na pasta `scratchpad/acess/sonda`. O tema escuro usa `#a78bfa` sobre `#101519` (leitura na entrada, mesmo token).
4. Alvo (2.5.8): o botão mede 216x44 px; a auditoria de DOM da página inteira nos dois temas não achou alvo menor que 24x24 (`sonda-e11.txt`).
5. Contraste AA nos dois temas (1.4.3, 1.4.11): auditoria de DOM de `/organizacao` em claro e escuro, zero texto abaixo do mínimo; também com a faixa de erro aberta nos dois temas, zero (`sonda-e11b.txt`). Estado desabilitado ("Gerando") é isento por 1.4.3.
6. Semântica: `h1` "Organização" e três `h2` sem pulo, landmarks `main`, `nav` e `header` presentes, zero `id` duplicado, zero campo sem rótulo. A 320 px não há rolagem horizontal (1.4.10).
7. Erro anunciado (3.3.1, 4.1.3): recusa 403 interceptada com o corpo real que a API devolve a Helena: a faixa entra como `role=alert` com a frase da API, inserida após o clique (`sonda-e11b.txt`, "viva inserida alert"). Ícone mais texto, sem depender só de cor.
8. Download anunciado: NÃO. Ver achados 1 e 2.

## Evidência
`C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/78869014-3ace-4efd-a059-e24f265aea3c/scratchpad/acess/`: `vitest.txt`, `e2e-local.txt`, `sonda-e11.txt`, `sonda-e11b.txt`, `sonda-foco.txt`; scripts `sonda/s-e11.mjs`, `sonda/s-e11b.mjs`. Capturas reais do outro agente: `scratchpad/g00/capturas-ux/e11-*` (lidas pelo `ux.md`). `@axe-core/playwright` não está em `node_modules`: não usado.

## Cenários positivos
Administradora chega ao botão só com Tab, aciona com Enter, o arquivo baixa com o nome certo; a faixa de erro aparece como `alert` quando o servidor recusa.

## Cenários negativos
Recusa 403 (resposta real reaproveitada por interceptação): a faixa aparece e é anunciável; a página não perde o botão.

## Tentativas de reprovar
- Acionei o botão por teclado e olhei onde o foco foi parar: em `BODY` assim que o botão fica `disabled` ("Gerando"), e continua em `BODY` depois do download e depois da recusa (achado 1). Um segundo Enter não fez nada, porque o foco já não estava no botão.
- Procurei região viva que anuncie "Gerando" ou "pacote baixado": nenhuma é inserida ou alterada no clique (o único `role=status` da página é o do uso de armazenamento, montado antes; `vivas: []` depois do download) (achado 2). Também não há `aria-busy`.
- Procurei alvo pequeno, contraste fraco, rótulo ausente, `id` duplicado, rolagem horizontal a 320 px: nada.
- Procurei ARIA supérfluo: nenhum.

## Achados
1. corrige antes de crescer: perda de foco no fluxo do download. `disabled={baixando}` em `Organizacao.tsx` tira o foco do botão e o foco vai a `BODY`; depois do download ou da recusa ele não volta. Quem usa teclado ou leitor de tela recomeça do topo da página (2.4.3) e não sabe se o pacote foi gerado. Reprodução: `sonda/s-e11.mjs` (linha "durante 'Gerando'": `foco: BODY`; "depois do download": `foco: BODY`). A causa é anterior à E11, mas a etapa reescreveu justamente esta função. Conserto simples: `aria-disabled` em vez de `disabled`, ou devolver o foco ao botão no `finally`.
2. corrige antes de crescer (dono F10-E11, "estados do pacote" estão no escopo dela): nada anuncia "Gerando" nem o fim do download (4.1.3). O texto do botão muda de "Baixar pacote de saída" para "Gerando" e volta, mas sem região viva e com o foco perdido, quem ouve não recebe nada; o navegador pode anunciar o arquivo, não o painel. É o mesmo risco que o `ux.md` registra como "nenhuma confirmação depois do download", visto pelo lado do leitor de tela, e vale para o duplo clique que gera dois pacotes sensíveis.
3. anotado: a frase da faixa de erro ("alterar os dados do município" para quem quis baixar) já está no `ux.md`; o que importa aqui é que, sendo `role=alert`, ela é lida, e portanto a frase errada também.

Nenhum item bloqueia: a E11 não prometia anúncio por leitor de tela, e a regra de acessibilidade dinâmica pertence à F10-E11.

## Não verificado
- Leitor de tela real: nenhum. O que NVDA ou VoiceOver dizem ao ativar o botão desabilitado, e se a faixa `alert` é lida, é tarefa humana.
- Firefox e WebKit nas sondas (o e2e do implementador cobre Firefox para o download; o foco em `BODY` ao desabilitar pode variar por motor).
- Zoom de 200 por cento e 768 px; Alto Contraste do Windows (coberto só pelo teste estático `o foco sobrevive ao Alto Contraste`).
- O estado "Gerando" foi inspecionado com a resposta retida por interceptação de rota, não por pacote lento de verdade.

## Risco residual
Pessoa que usa teclado perde a posição ao baixar o pacote; sem confirmação sonora ou textual, pode acionar duas vezes.

## Motivo do humano
Confirmar com leitor de tela o que é dito ao acionar o botão, durante "Gerando" e depois do download; e abrir o ZIP (item de produto, já pendente no `ux.md`).
