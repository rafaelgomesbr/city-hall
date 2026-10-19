---
validador: ux (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E13
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [UI, A11Y, AUTH]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: texto-de-produto (seis frases de confirmação novas)
---

Pasta das saídas e capturas deste validador (scratchpad, fora do repositório):
`/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/ux-E11-E13-E24/`
(abaixo, `SP/` abrevia esse caminho; `SP/capturas/` tem os PNG citados).

## Critérios verificados

Portão visual (seção 0 de `19`) e heurísticas, sobre o que a etapa toca: a entrada que parte de `/`, as confirmações de gravação de Usuários, Equipes e Órgãos (`<Toast>` com `role="status"`), a posição do aviso sobre a barra do rodapé no celular e o foco na barra. Painel de `bb0f654` ligado à API real (Postgres em WebAssembly com a semente).

| Item | Resultado | Prova |
| --- | --- | --- |
| Alinhamento | OK: o aviso alinha à margem direita do conteúdo a 1280 (x=844, largura 420) e às margens de 16 px a 390 e 320 (x=16) | `SP/saidas/capturas-chromium.txt` (linhas `*-confirmacao`) |
| Espaçamento | OK: o aviso fica acima da barra do rodapé em 768 (fundo 930 contra barra 945), 390 (750 contra 765) e 320 (546 contra 561), sem encostar | idem; `e13-usuarios-confirmacao-390-escuro.png`, `e13-orgaos-confirmacao-320-escuro.png` |
| Nada fora do lugar | OK no que a etapa toca: `sobrepoeBarra=false` e `fora=false` em 24 combinações, sem rolagem horizontal da página; o fundo do aviso é sólido no escuro (o texto da página não atravessa). Anterior à fase, fora do escopo: tabela de Órgãos quebra e-mail no meio da palavra a 1280 com nome longo, e a de Usuários quebra o e-mail em duas linhas; marcador da busca cortado a 320 | `e13-orgaos-confirmacao-1280-escuro.png`, `e13-usuarios-pagina-inteira-1280-claro.png` |
| Hierarquia | OK: ícone de confirmação, frase e "Fechar" na mesma linha a 1280; a 320 a frase quebra em três linhas sem cortar | `e13-orgaos-confirmacao-320-escuro.png` |
| Texto bem escrito | OK: as seis frases ("Usuário cadastrado. Ele já aparece na lista abaixo.", "Cadastro corrigido. A lista abaixo já mostra o que mudou.", "Equipe criada. Ela já aparece na lista abaixo.", "Equipe corrigida. A lista abaixo já mostra o que mudou.", "Órgão cadastrado. Ele já aparece na lista abaixo.", "Órgão corrigido. A lista abaixo já mostra o que mudou.") estão corretas, concordam em gênero e dizem onde ver. Conferi que "abaixo" é verdade: a lista fica abaixo do formulário a 1280 e a 390 (páginas inteiras) | `e13-usuarios-pagina-inteira-{1280,390}-claro.png`, `e13-equipes-pagina-inteira-*`, `e13-orgaos-pagina-inteira-*` |
| Responsivo | OK: 1280, 768, 390, 320 e zoom de 200 por cento (640x450 com escala 2) | `e13-*-{1280,768,390,320}-*.png`, `e13-equipes-confirmacao-zoom200-claro.png` |
| Dois temas, foco, contraste, estado nunca só por cor | OK: confirmações nos dois temas com ícone de visto mais texto; o Tab na barra do rodapé a 390 traz os 11 itens inteiros para a tela (`inteiro: true` em todos) | `SP/saidas/complemento.txt` |
| Vazio e erro desenhados | Não mudaram nesta etapa; a tela de entrada pela raiz e a chegada estão desenhadas nos dois temas | `e13-entrada-a-partir-da-raiz-*`, `e13-chegada-pela-raiz-*` |
| Rafael vê e aprova | PENDENTE (gatilho de texto de produto) | |

Heurísticas: visibilidade do estado (gravar agora confirma, antes limpava em silêncio); correspondência com o mundo real (a frase diz o que aconteceu e onde conferir); controle (botão "Fechar" e pausa com o ponteiro em cima); consistência (as três telas usam o mesmo aviso e a mesma estrutura de frase); prevenção de erro na entrada (quem digita só o domínio não cai em "Esta página não existe").

## Evidência

- Montagem do painel e da API: igual ao relatório ux da E11 desta rodada (`SP/saidas/build-web.txt`, `SP/saidas/api.log`), derrubados no fim.
- `SP/capturar.mjs` (Chromium): código 0, `SP/saidas/capturas-chromium.txt`, zero erro de console e de página.
- `SP/complemento.mjs`: código 0, `SP/saidas/complemento.txt` (Tab na barra a 390, zoom de 200 por cento).
- Capturas: `SP/capturas/e13-entrada-a-partir-da-raiz-{1280,768,390,320}-{claro,escuro}.png`, `e13-chegada-pela-raiz-*` (8 cada), `e13-usuarios-confirmacao-*`, `e13-equipes-confirmacao-*`, `e13-orgaos-confirmacao-*` (8 cada), `e13-{usuarios,equipes,orgaos}-pagina-inteira-{1280,390}-claro.png`, `e13-equipes-confirmacao-zoom200-claro.png`.
- Olhadas uma a uma: `e13-usuarios-confirmacao-390-escuro`, `e13-usuarios-confirmacao-1280-claro`, `e13-orgaos-confirmacao-320-escuro`, `e13-equipes-confirmacao-768-escuro`, `e13-orgaos-confirmacao-1280-escuro`, `e13-usuarios-pagina-inteira-1280-claro`, `e13-entrada-a-partir-da-raiz-390-escuro`, `e13-chegada-pela-raiz-320-claro`, `e13-chegada-pela-raiz-1280-escuro`, `e13-equipes-confirmacao-zoom200-claro`. As demais por medida no log.

## Cenários positivos

- Entrar a partir de `/` sem sessão leva a `/entrar` e, depois de entrar, à tela do papel: coordenadora, administradora e operador em `/painel`; agente de campo em `/meu-trabalho`; "Esta página não existe" ausente nos quatro.
- `/` com sessão leva a `/painel`.
- As três gravações mostram a confirmação em todas as larguras e temas.

## Cenários negativos

- Sem sessão, `/` não concede nada: vai para `/entrar`.
- O aviso não cai sobre a barra do rodapé em nenhuma largura de celular ou tablet medida.

## Tentativas de reprovar

1. Procurei a frase mentindo sobre onde está a lista ("abaixo") no desktop, onde o formulário divide a linha com cartões laterais: a lista fica abaixo nas três telas, em 1280 e em 390.
2. Larguras não pedidas pela etapa (768, 320, zoom de 200 por cento) para achar o aviso sobre a barra ou cortado: não achei.
3. Tab pela barra do rodapé a 390, com espera de 450 ms por passo: nenhum item recebe foco pela metade.
4. Aviso no tema escuro sobre conteúdo (`e13-usuarios-confirmacao-390-escuro.png`): fundo sólido, texto legível.
5. Os quatro papéis da semente entrando pela raiz: nenhum cai em rota inexistente.
6. Procurei travessão e erro de concordância nas seis frases: nenhum.

## Achados

1. **Anotado (anterior à fase):** a tabela de Órgãos a 1280 quebra o e-mail no meio da palavra quando o nome do órgão é longo (`e13-orgaos-confirmacao-1280-escuro.png`), e a de Usuários quebra o e-mail em duas linhas (`e13-usuarios-pagina-inteira-1280-claro.png`). Não é do diff desta etapa; o transbordo de Órgãos já foi arbitrado como anterior à fase na rodada 2.
2. **Anotado (anterior à fase):** marcador da busca do topo cortado a 320 px.
3. **Anotado:** no celular o aviso cobre parte do conteúdo enquanto está aberto (é flutuante por desenho, some sozinho e tem "Fechar"). Não esconde a barra nem o botão de gravar.
4. **Anotado (artefato da captura):** nas capturas escuras a barra diz "Tema escuro" porque o tema foi trocado direto em `data-theme`.

## Não verificado

- Firefox e WebKit não capturados nesta etapa (só Chromium).
- Leitor de tela real anunciando o `role="status"`: dimensão acessibilidade.
- As três frases de correção ("corrigido", "corrigida") não foram disparadas por mim; conferidas só no código (`Usuarios.tsx:135`, `Equipes.tsx:83`, `Orgaos.tsx:120`).
- Rafael digitando o domínio de produção (a etapa pede; fora do meu alcance).

## Risco residual

Baixo. As confirmações dependem de o texto "abaixo" continuar verdade se a F10 mudar o desenho das telas de cadastro.

## Motivo do humano

Gatilho **texto de produto** (seção 10): o diff cria seis frases de confirmação visíveis (`Usuarios.tsx`, `Equipes.tsx`, `Orgaos.tsx`), e a própria etapa deixa a aprovação delas com Rafael (premissa b). Ele precisa olhar, em `SP/capturas/`: `e13-usuarios-confirmacao-1280-claro.png`, `e13-usuarios-confirmacao-390-escuro.png`, `e13-equipes-confirmacao-768-escuro.png`, `e13-orgaos-confirmacao-320-escuro.png`, `e13-entrada-a-partir-da-raiz-390-escuro.png` e `e13-chegada-pela-raiz-1280-escuro.png` (ou as equivalentes do implementador em `docs/evidencias-v2/G00/V2-F00-E13/capturas/`), aprovar as seis frases e fazer a validação humana da etapa (digitar só o domínio, entrar e chegar à tela do papel).
