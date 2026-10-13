---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E09
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

1. Os 8 casos de `apps/web/test/seguranca-da-conta.test.ts` passam: PASS. Rodado isolado dentro da suíte web: 8 de 8 (`scratchpad/web.txt`). Ressalva de qualidade no achado 2.
2. Administrador redefine a senha de um operador e o login com a temporária exige a troca: PASS. Sonda própria: `POST /usuarios/:id/redefinir-senha` deu 200 com `senhaTemporaria`, `sessoesEncerradas: 2`; senha antiga passou a dar 401; temporária entrou (200); escrita com ela deu `403 troca_de_senha_obrigatoria`; sessão anterior à redefinição deu 401. E2E seção 26: "a agente define a senha e entra" e "a sessão aberta com a temporária pela API caiu na troca".
3. `GET /auth/sessoes` marca a sessão atual: PASS. Sonda: duas sessões, exatamente uma com `"atual":true`, a que fez a chamada.
4. Encerrar "as outras" mantém a de onde se clicou: PASS. Sonda: `POST /auth/encerrar-sessoes` respondeu "1 sessão foi encerrada ... Esta continua aberta", a lista seguinte tinha 1 item, e `POST /auth/renovar` do outro aparelho deu 401. E2E seção 26: "o token de renovacao do segundo navegador morreu" e "o de acesso dele nao escreve mais: 401 sessao_encerrada".
5. Coordenador não vê botões em usuário de posto igual ou maior: PASS. E2E "a coordenadora ve os botoes em operador e agente, e em mais ninguem"; API: coordenador contra administrador deu `403 posto_insuficiente` nas três rotas (sonda).
6. API recusa `autoredefinicao` e `autoencerramento` (422): PASS. Sonda: ambos 422 com o código certo.
7. `GET /usuarios/:id/sessoes` de posto acima: 403 `posto_insuficiente`: PASS (sonda).
8. Município A pedindo redefinir, encerrar ou listar sessões de usuário do município B: 404 nas três: PASS. Corpo idêntico ao de UUID inexistente (`{"erro":"nao_encontrado","mensagem":"Usuário não encontrado."}`).
9. Agente e operador chamando as três rotas: 403 `sem_permissao`: PASS (sonda e E2E).
10. Sem token: 401 em `/auth/sessoes` e `/usuarios/:id/sessoes`: PASS. UUID inválido: 422 `dados_invalidos`, sem 500.
11. LGPD (IDN-29): listagem sem IP e sem user-agent completo: PASS. Sonda mandou `user-agent` com marca única ("SEGREDO-UA-123") e IP; o corpo de `/auth/sessoes` saiu com `entrouEm`, `validaAte`, `aparelho` ("Aparelho não identificado") e `atual`; nenhum IP nem texto do UA. `/usuarios/:id/sessoes` devolve só quantidade e datas.
12. Senha temporária fora da trilha: PASS por leitura de `administracao.ts:508-515` (o `depois` leva só `sessoesEncerradas` e `ativo`) e pelo texto da migração citada. Minha consulta direta à tabela de trilha na sonda não foi conclusiva (nome da tabela não confirmado), então este item é E3a e não E1.
13. Botões e listagem nos dois modos: PASS parcial. Modo API por E2E; modo local por `paridade-dos-modos.test.ts` (10 verdes) e `sessoes-e-senha-temporaria.test.ts` (18 verdes) e capturas `*-modo-demonstracao-*` (não abri).
14. E2E: administradora redefine a senha da agente, a agente entra com a temporária, troca, a sessão antiga cai; "encerrar minhas outras sessões" derruba um segundo navegador: PASS. Seção 26 do e2e completa (51 OK) no run local e no CI.
15. Estados da tela (carregando, vazio, erro, sucesso): capturas existem para `sessoes-carregando`, `sessoes-erro`, `sessao-unica`, `confirmar-*-erro`; li apenas `usuarios-senha-temporaria-1280-claro.png` (janela com aviso "Anote agora", fonte tabular, copiar, toast). Julgamento de UX é de outro validador.

## Evidência

- `npm run build:shared`, saída 0.
- API: `sessoes-da-conta`, `senha-e-sessoes`, `familia-da-sessao`, `senha-provisoria`, `codigos-de-erro`, `vigencia-na-escrita`: 100 de 100, saída 0 (`scratchpad/api-e05-e09.txt`). `superficie.test.ts` junto de `recuperacao*` e `config`: 70 de 70, saída 0 (`scratchpad/api-e10.txt`).
- Web: 43 arquivos, 643 de 643, saída 0 (`scratchpad/web.txt`), inclui `seguranca-da-conta` (8), `sessoes-e-senha-temporaria` (18), `paridade-dos-modos` (10).
- `npm run test:e2e:api`: 271 OK, 0 falha, zero erro de console, saída 0 (`scratchpad/e2e-api.txt`), seção 26 inteira.
- `npm run test:campo`: 1861 de 1861, saída 0.
- Sonda própria em arquivo temporário, rodada e apagada (`scratchpad/sonda.txt`).
- CI 37739535524: sucesso, SHA `7005a60`, 9 de 9, inclui "Fluxo ponta a ponta no navegador".
- Diff: `docs/evidencias-v2/G00/V2-F00-E09/diff-da-etapa.patch` (7 arquivos; as rotas e a camada de dados já vieram do commit da fase, não do patch).

## Cenários positivos

Redefinição com troca obrigatória; encerrar sessões de outra pessoa (alvo cai); listar sessões próprias com marca "esta"; encerrar as outras preservando a atual; listagem do administrador sobre agente (quantidade e datas).

## Cenários negativos

Isolamento entre municípios (404 nas três rotas, igual ao de UUID inexistente); papel sem permissão (403 `sem_permissao`); posto insuficiente (403 `posto_insuficiente`); autoalvo (422 duas vezes); sem token (401); UUID inválido (422); senha antiga e sessão antiga mortas após redefinição.

## Tentativas de reprovar

1. Tentei encerrar sessão de outra pessoa de OUTRO município (coordenador de A contra agente de B): 404 nas três rotas.
2. Tentei encerrar a sessão de posto superior (coordenador contra administrador): 403 `posto_insuficiente`, sem efeito.
3. Tentei como operador e agente: 403 `sem_permissao`.
4. Tentei redefinir a própria senha e encerrar as próprias sessões pela rota de administração: 422, e a sessão seguiu de pé.
5. Tentei vazar IP e user-agent pela listagem: não vazou.
6. Tentei usar a sessão e a senha antigas depois da redefinição: ambas morrem.
7. Tentei fazer o 404 de B diferir do de id inexistente: corpos idênticos.
8. Não consegui testar clique duplo em navegador (estado `gravando` e `disabled` presentes na leitura de `BotaoRedefinirSenha`).

## Achados

1. CORRIGE ANTES DE CRESCER. Agente de campo que recebe senha temporária pela tela nova só consegue concluir a troca no painel, e o app de campo trata o 403 `troca_de_senha_obrigatoria` como recusa permanente (`packages/campo/src/transporte.ts:80-83`, `fila.ts` `tratarFalha`): item `bloqueado` com opção de descartar. Reprodução: redefinir a senha de um agente, entrar no app com a temporária, coletar e sincronizar. Dono: E06/E07 (mesmo achado do QA da E05, achado 2).
2. ANOTADO. Sete dos oito casos de `seguranca-da-conta.test.ts` são leitura de texto do fonte (`toContain("<ConfirmarAcao")`, regex sobre `Usuarios.tsx`). Quebram em refatoração que preserva comportamento e não detectam comportamento errado. O comportamento está de fato coberto pelo e2e seção 26 e por `sessoes-e-senha-temporaria.test.ts`, então não bloqueia.
3. ANOTADO. Estado vazio da lista de sessões da própria conta: a conta sempre tem ao menos a sessão atual, então "vazio" é inalcançável; a tela cobre "sessão única". Sem defeito.
4. ANOTADO. A senha temporária é do conhecimento de quem a sorteou (IDN-18, já em `PENDENCIAS.md`).

## Não verificado

- Firefox e WebKit, mobile real, leitor de tela, zoom 200%: sem recurso aqui (A11Y e UX são validadores próprios).
- Modo local (demonstração) por navegador: só testes unitários e de paridade.
- Clique duplo e F5 durante a redefinição em navegador.
- A consulta da trilha para a senha temporária (item 12, E3a).
- Concorrência: duas redefinições simultâneas do mesmo alvo.
- Postgres 17 (CI cobre); `test:isolamento` não rodado porque a etapa não toca banco.
- Doc `GUIA-DO-COORDENADOR.md` e `PENDENCIAS.md`: não li o texto, só a existência pelo RESUMO.

## Risco residual

- A temporária vale 72 horas e é conhecida por quem a sorteou.
- Token de acesso emitido antes de encerrar sessão vale até 15 minutos (limitação documentada em `auth/sessoes.ts`).
- Cobertura de rota nova depende de `superficie.test.ts` (verde).

## Motivo do humano

A etapa lista "Validação humana: Rafael faz o fluxo no painel e confere a frase da senha única e as confirmações". Só uma pessoa julga a clareza dessas frases. Confiança média porque parte da prova de interface é e2e de um navegador só e leitura de capturas por amostra.
