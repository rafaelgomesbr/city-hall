---
validador: ux
modelo: claude-opus-5-5
etapa: V2-F00-E13
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, A11Y, AUTH]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Superfícies da etapa: a entrada que parte de `/` (rota índice em `App.tsx`, `rotaInterna` em `entrar-regras.ts`), as confirmações de gravar e de corrigir em Usuários, Equipes e Órgãos (`<Toast>` com `role="status"`), a posição do aviso em relação à barra do rodapé no celular, o fundo do aviso no tema escuro, e o Tab que traz cada item da barra inteiro para a tela. Desde a rodada 5 (`4ce0433`) a correção 4 da E09 mexeu em `Toast.tsx` (o aviso espera enquanto houver janela modal aberta, `modais-abertos.ts`), `Modal.tsx`, `app.css`, `Usuarios.tsx` e `Orgaos.tsx` (`EmailQuebravel`): conferi a regressão disso nas confirmações desta etapa.

| Critério (DoD, cinco campos de teste e portão visual da seção 0 de `19`) | Prova | Resultado |
| --- | --- | --- |
| Entrar a partir de `/` leva à tela do papel | quatro papéis, sem sessão, `/` leva a `/entrar`; depois de entrar: coordenadora, operador e administradora em `/painel` ("Painel operacional"), agente em `/meu-trabalho` ("Meu trabalho"); nenhum "Esta página não existe"; com sessão, `/` de novo leva à mesma tela. Chromium (1280 claro e 390 escuro) e Firefox (1280 escuro) (`saidas/e13-chromium.txt`, `saidas/e13-firefox.txt`; `ux-E13-entrada-pela-raiz-*`, 12 capturas) | PASS |
| `/?x=1` e `/#topo` também caem na tela do papel | operador sem sessão: ambos terminam em `/painel` (`saidas/e13-rotas.txt`) | PASS |
| Operador digitando `/usuarios` continua sem o formulário | depois de entrar volta a `/usuarios` e vê "Seu perfil não tem acesso a esta tela..." sem `#usuario-nome` (`ux-E13-operador-entra-por-usuarios-chromium-390-claro.png`) | PASS |
| Rota inexistente continua dizendo que não existe | `/rota-que-nao-existe`: "Esta página não existe" com "Voltar ao início" (`ux-E13-operador-entra-por-rota-que-nao-existe-chromium-390-claro.png`) | PASS |
| Confirmação de gravar e de corrigir nas três telas, com `role=status` | 6 frases em 12 combinações (Chromium 1280, 768, 390 e 320; Firefox 1280 e 390; claro e escuro): "Usuário cadastrado. Ele já aparece na lista abaixo.", "Cadastro corrigido. A lista abaixo já mostra o que mudou.", "Equipe criada. Ela já aparece na lista abaixo.", "Equipe corrigida. ...", "Órgão cadastrado. Ele já aparece na lista abaixo.", "Órgão corrigido. ..."; `role="status"`, `aria-live="polite"` em todas (`ux-E13-{usuarios,equipes,orgaos}-{confirmacao,correcao}-*`, 72 capturas) | PASS |
| O aviso não cai em cima da barra do rodapé | a 768, 390 e 320 px a folga até a barra é 15 px em todas as medições; dentro da janela em todas (`sobrepoeBarra:false`) | PASS |
| Fundo do aviso opaco no tema escuro | `rgb(23, 30, 36)` no escuro e `rgb(255, 255, 255)` no claro, sem transparência; texto da página não atravessa (`ux-E13-usuarios-correcao-chromium-320-escuro.png`) | PASS |
| "Fechar" do aviso com 44 px | 64x44 em todas as combinações | PASS |
| Tab traz cada item da barra inteiro para a tela | 390 e 320 px, Chromium e Firefox: os onze itens (Painel até Sair) "inteiro"; no Firefox a própria barra rolável recebe um Tab antes, comportamento do navegador (`saidas/e13-chromium.txt`, `saidas/e13-barra-firefox.txt`, `ux-E13-barra-foco-no-mapa-firefox-{320,390}-claro.png`) | PASS |
| Regressão da correção 4 da E09 no aviso desta etapa | Equipes a 390: gravar, abrir a janela "Desativar" por cima: o aviso some enquanto a janela está aberta; 10 s depois (mais que a duração), fechar com Esc: o aviso volta com a frase inteira, Chromium e Firefox (`saidas/e13-janela.txt`, `ux-E13-equipes-confirmacao-com-janela-*`, `ux-E13-equipes-confirmacao-depois-da-janela-*`) | PASS |
| Nada cortado, grudado ou fora do lugar | `geometria()` em todas as telas: sem rolagem horizontal da página, nada fora da janela, sem palavra quebrada no meio; o "cortado" acusado é o rótulo só para leitor de tela da busca (falso positivo) | PASS, com os anotados 2 e 3 |
| Dois temas e quatro larguras | 1280, 768, 390, 320, claro e escuro, Chromium; 1280 e 390, Firefox | PASS |
| Zero erro de console | "nenhum" em todas as combinações de Chromium e Firefox | PASS |
| Rafael aprova as seis frases e entra pelo domínio | pendente | humano |

Heurísticas de Nielsen aplicadas ao que a etapa mudou:

1. Visibilidade do estado: gravar agora diz que gravou, e onde ver ("na lista abaixo").
2. Mundo real: frases curtas, no vocabulário da tela (usuário, equipe, órgão).
3. Controle: o aviso tem "Fechar" de 44 px e não bloqueia o formulário.
4. Consistência: as seis frases seguem o mesmo molde ("X cadastrado. Ele já aparece..." e "X corrigido. A lista abaixo já mostra o que mudou."), mesmo componente da tela de ocorrência.
5. Prevenção de erro: entrar pela raiz não termina mais numa página de erro.
6. Reconhecer em vez de lembrar: quem digita só o domínio cai na tela do próprio papel.
7. Eficiência: um passo a menos depois do login.
8. Estética: o aviso flutua no canto, com elevação, sem cobrir a barra.
9. Recuperação de erro: rota inexistente e tela sem permissão seguem explicando e oferecendo saída.
10. Ajuda: não se aplica além das frases.

## Evidência

- API e painel do SHA nas portas 3795 e 4795 (mesmo arranjo do relatório da E11: `npx tsx src/index.ts` e `vite build` com `VITE_API_URL`, depois `vite preview`), derrubados no fim.
- `node e13.mjs chromium`: código 0, `SCRATCH/validadores/ux-l3/saidas/e13-run-chromium.txt` e `saidas/e13-chromium.txt`.
- `node e13.mjs firefox`: código 0, `saidas/e13-run-firefox.txt` e `saidas/e13-firefox.txt`.
- `node e13-janela.mjs`: código 0, `saidas/e13-janela.txt`.
- `node e13-barra-ff.mjs`: código 0, `saidas/e13-barra-firefox.txt`.
- `node e13-rotas.mjs`: código 0, `saidas/e13-rotas.txt`.
- SCRATCH é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad`.
- Capturas (98) em `docs/evidencias-v2/G00/V2-F00-E13/validacao/1ed0b71/capturas/`, prefixo `ux-E13-`. Olhadas, entre outras: `ux-E13-orgaos-confirmacao-chromium-1280-claro.png`, `ux-E13-equipes-confirmacao-chromium-768-claro.png`, `ux-E13-usuarios-correcao-chromium-320-escuro.png`, `ux-E13-usuarios-encerrar-sessoes-aviso-chromium-390-escuro.png`, `ux-E13-entrada-pela-raiz-agente-chromium-390-escuro.png`, `ux-E13-barra-foco-no-mapa-firefox-320-claro.png`, `ux-E13-operador-entra-por-usuarios-chromium-390-claro.png`, `ux-E13-operador-entra-por-rota-que-nao-existe-chromium-390-claro.png`.

## Cenários positivos

- Os quatro papéis da semente entram partindo de `/` e chegam à tela inicial do papel, nos dois motores.
- As seis confirmações aparecem nas três telas, nas quatro larguras e nos dois temas.
- "Encerrar sessões" (Usuários) mostra o aviso "Sessões de Diego Nakamura Alves encerradas. 2 sessões caíram." ou "... não tinha sessão aberta. Nada foi encerrado." acima da barra (`ux-E13-usuarios-encerrar-sessoes-aviso-*`).

## Cenários negativos

- A rota índice sem sessão leva a `/entrar` e não concede nada: o operador que volta para `/usuarios` vê a recusa, sem formulário.
- `/?x=1` e `/#topo` não viram caminho de volta: caem na tela do papel.
- Rota inexistente continua em "Esta página não existe" depois de entrar.

## Tentativas de reprovar

- Largura mínima 320x568, tema escuro, frase mais longa ("Cadastro corrigido. A lista abaixo já mostra o que mudou.", 106 px de altura): cabe, 15 px acima da barra.
- Abrir uma janela modal com o aviso na tela e esperar mais que a duração dele, para ver se o aviso se perde ou fica por cima da janela (o defeito que a correção 4 da E09 tratou): não se perde e não fica por cima.
- Tab na barra rolável a 320 px em Firefox, onde a rolagem automática difere: os onze itens chegam inteiros.
- Procurei o aviso cobrindo controle: a 1280 px o aviso do canto inferior direito cobre parte do botão "Editar" da primeira linha da tabela de Órgãos enquanto está na tela (`ux-E13-orgaos-confirmacao-chromium-1280-claro.png`, anotado 1).
- Procurei texto cortado nas três telas: achei os anotados 2 e 3, ambos anteriores e fora do escopo.

## Achados

1. anotado: a 1280 px o aviso (canto inferior direito, 420x70) fica por cima de parte do botão "Editar" da linha visível da tabela de Órgãos (`ux-E13-orgaos-confirmacao-chromium-1280-claro.png`) até sumir sozinho ou ser fechado. É o comportamento comum de aviso flutuante e o "Fechar" resolve; não é critério da etapa.
2. anotado (anterior à etapa, `57795e9` de 09/09): no formulário de Órgãos a 1280 px o exemplo do campo de email aparece cortado, "protocolo@bombeiros.exemplo.gov.b" (`Orgaos.tsx:229`, mesma captura). Exemplo de campo, não texto de conteúdo; fica para quem revisar o formulário.
3. anotado (anterior, já registrado pela rodada 5): a 320 px o campo de busca do topo mostra "Buscar registro ou funç" (`ux-E13-barra-foco-no-mapa-firefox-320-claro.png`); e as tabelas de Equipes, Órgãos e Usuários rolam dentro do cartão no celular, ficando roladas para a direita depois de uma ação (`ux-E13-usuarios-encerrar-sessoes-aviso-chromium-390-escuro.png`), pendência 6.3 de `apps/web/PENDENCIAS.md`.

## Não verificado

- Leitor de tela real anunciando o aviso (só os atributos `role` e `aria-live` foram conferidos), e o anúncio do aviso que reaparece depois de a janela fechar: é da dimensão de acessibilidade e de uma pessoa.
- Zoom de 200 por cento.
- `npm run test:e2e` em Chromium e Firefox e o vitest do painel (dimensão de QA).
- WebKit.

## Risco residual

Baixo. As confirmações e a entrada pela raiz estão inteiras nas quatro larguras e nos dois temas, e a mudança posterior no aviso (esperar a janela) não estragou nenhuma delas. O que sobra é de layout comum do painel (tabelas que rolam no celular, exemplo cortado num campo, busca do topo a 320 px), anterior à etapa.

## Motivo do humano

A validação humana da etapa: Rafael digita só o domínio, entra e confere que chega à tela do papel; e aprova as seis frases de confirmação (gatilho texto de produto). Só ele decide se o tom e o molde das frases servem ao município. Capturas para ver: `ux-E13-entrada-pela-raiz-coordenadora-chromium-1280-claro.png`, `ux-E13-usuarios-confirmacao-chromium-1280-claro.png`, `ux-E13-equipes-correcao-chromium-390-escuro.png`, `ux-E13-orgaos-confirmacao-chromium-320-claro.png`.
