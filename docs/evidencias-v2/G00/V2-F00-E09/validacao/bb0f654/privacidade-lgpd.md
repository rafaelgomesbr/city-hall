---
validador: privacidade-lgpd (general-purpose com o papel da dimensão)
modelo: claude-sonnet-5-5
etapa: V2-F00-E09
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD]
nivel_de_prova_exigido: [E1, E2, E3a]
nivel_de_prova_obtido: [E1, E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
Aviso: não sou advogado e isto não é parecer jurídico. Cobre a parte técnica (inventário, fluxo, controles, evidência). Base legal, controlador e operador, DPO e prazo de retenção ficam para pessoa. `$SP` é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/privacidade-lgpd-e09-e10-e11-e15-e17`. Nada foi herdado: tudo abaixo foi executado nesta rodada, no HEAD `0290af5` cujo produto é o de `bb0f654`.

## Critérios verificados

Critérios da etapa que tocam dado pessoal (bloco "Impacto LGPD" e "Risco de segurança" da E09), cada um tratado primeiro como alvo de ataque:

1. A listagem de sessões não mostra IP nem user-agent completo (IDN-29). Inclui: a lista da própria conta (`GET /auth/sessoes`) e a contagem que quem administra vê (`GET /usuarios/:id/sessoes`).
2. Só a própria conta lê a própria lista; quem administra lê só quantidade e datas; conta de outro município responde 404; agente não chama as rotas de administração.
3. A senha temporária aparece uma vez, não é persistida (banco, trilha, log, armazenamento do navegador, DOM depois de fechar) e a resposta não é guardada em cache.
4. Nada de dado pessoal em log nos caminhos novos (lista de sessões, redefinição por quem administra).
5. O `DICIONARIO-DE-DADOS.md` descreve o que o banco tem para as tabelas tocadas (`sessoes`, `usuarios`).
6. Minimização, retenção, acesso e eliminação dos dados de sessão (IP e user-agent guardados), dentro do que a E09 declara fora de escopo (expurgo é F05-E12, CP-10).

## Evidência

Inventário dos dados tocados (extraído do esquema real: migrações 001 a 050 aplicadas em PGlite, `$SP/esquema.txt`):

| Dado | Onde fica | Quem lê | Sai para onde |
| --- | --- | --- | --- |
| `sessoes.ip` (inet), `sessoes.user_agent` (texto inteiro), `token_hash`, `criada_em`, `expira_em`, `revogada_em`, `motivo_revogacao`, `familia_id` | tabela `sessoes`, RLS ativada e forçada | só a API, sob o município do token | NUNCA para a tela: a rota devolve `entrouEm`, `validaAte`, `aparelho` (uma frase), `atual`. Não vai no pacote de saída (`TABELAS_QUE_NAO_SAEM.sessoes`). |
| `usuarios.senha_provisoria_ate` | `usuarios` | API | `usuarios.csv` e `.json` do pacote (data, não segredo) |
| senha temporária em claro | memória do processo, resposta HTTP de `POST /usuarios/:id/redefinir-senha`, estado React da janela | quem administra, uma vez | não vai a banco (só o hash scrypt), trilha, log nem armazenamento do navegador |
| `trilha_administrativa` (`senha_redefinida`, `sessoes_encerradas`) | trilha append-only | administração | `depois` traz só `sessoesEncerradas` e `ativo` |

Fluxo e controles, com arquivo e linha:
- `apps/api/src/auth/aparelho.ts:62-72` (`resumirAparelho`): user-agent vira "Chrome em Windows", "Aplicativo de campo" ou "Aparelho não identificado"; texto livre nunca passa.
- `apps/api/src/auth/servico.ts:1269-1291` (`listarMinhasSessoes`): consulta sob `comTenant`, filtra `usuario_id = identidade.usuarioId`, vivas e não vencidas; mapeia só quatro campos. Não há parâmetro de usuário.
- `apps/api/src/rotas/autenticacao.ts:265-268`: identidade vem do token; `exigirAutenticacao`.
- `apps/api/src/rotas/administracao.ts:~620-655`: `autorizar(..., "gerenciar_usuarios")` antes do banco, `exigirPostoParaGerir`, 404 por RLS, devolve `{id, sessoesAbertas, ultimaEntradaEm, validaAte}`.
- `apps/api/src/rotas/administracao.ts:433-520`: senha temporária por `gerarSenhaTemporaria` (`auth/senha.ts:131`, CSPRNG `randomBytes`), hash derivado antes da transação, trilha sem a senha, `depois` sem hash.
- `apps/api/src/servidor.ts:384-399`: `cache-control: no-store` em toda resposta.
- `apps/web/src/paginas/Usuarios.tsx:680-740` (`SenhaTemporaria`): estado local, janela sem fechar por clique fora, botão que descarta; `apps/web/src/dados/tipos.ts:569`.

Execuções (todas nesta rodada):
- E1: `cd dc360/apps/api && npx vitest run test/sessoes-da-conta.test.ts test/log.test.ts test/recuperacao*.test.ts test/saida-de-municipio.test.ts test/pacote-de-saida-contrato.test.ts`, código 0, 8 arquivos, 130 testes (`$SP/api-1.txt`). `apps/web`: `sessoes-e-senha-temporaria`, `seguranca-da-conta`, `recuperar-senha`, `pacote-de-saida`, `paridade-dos-modos`, código 0, 90 testes (`$SP/web-testes.txt`).
- E2 API (sonda minha, `$SP/sonda-api.mts`, saída `$SP/sonda-api-saida.txt`): PGlite com dois municípios; sessões criadas com IPs 198.51.100.x e um user-agent com texto de matrícula e e-mail plantados. `GET /auth/sessoes` (mesmo com `?usuario=<outro>` e cabeçalho `x-organizacao-id` de outro município) devolveu só as 2 sessões da Rita, chaves exatas `aparelho, atual, entrouEm, validaAte`, sem IP, sem user-agent cru, sem hash nem id. O banco guardava as 6 linhas com IP e user-agent inteiro (confirma que o dado existe e não sai). `GET /usuarios/:id/sessoes`: administradora lê agente do próprio município (200, 4 chaves); agente de outro município 404 (também com cabeçalho de outra organização); coordenador sobre coordenador 403 `posto_insuficiente`; coordenador sobre administrador 403; agente 403 `sem_permissao`; sem token 401.
- E2 senha temporária: resposta 200 com `cache-control: no-store`, 14 caracteres; a senha NÃO está em `trilha_administrativa` (2 linhas lidas por inteiro: `senha_redefinida` e `sessoes_encerradas`, `depois` sem segredo) nem no banco (só o hash); `senha_provisoria_ate` = agora + 72 h.
- E2 log da API: varredura das 55 linhas capturadas pelo coletor do teste e, depois, de 485 linhas do log real de um servidor `tsx src/index.ts` que subi em porta própria (`$SP/nav/api.log`): zero ocorrência de e-mail, senha, senha temporária, user-agent, token, JWT. Aparece só `remoteAddress` por requisição (IP do cliente), que é o comportamento anterior à etapa.
- E2 navegador (Chromium, API e painel meus nas portas 3781 e 4781, painel construído em pasta do scratchpad, `$SP/nav/sonda-nav-saida.txt`): Minha conta não mostra IP nem user-agent cru (mostra "Chrome em macOS", mesmo com user-agent do navegador contendo "DADO-PESSOAL-NO-UA"); a senha temporária aparece uma vez, não está em `localStorage`, `sessionStorage`, título, URL, nem em nenhum pedido de rede, e depois de "Já anotei a senha" não está no DOM, no storage nem no `history.state`; console sem mensagem alguma.
- Esquema x dicionário: `$SP/colunas-faltando-por-tabela.txt` (heurística por coluna entre crases) mais leitura manual das seções `usuarios` e `sessoes` do dicionário.
- Provas de que o teste morde (mutação, desfeita com `git restore`, árvore conferida limpa depois): M1 `listarMinhasSessoes` devolvendo o user-agent inteiro e um campo `ip`: 4 de 27 testes reprovam, entre eles "não entrega IP, user-agent completo nem identificador de sessão" (`$SP/mut-e09-m1.txt`). M2 `exigirPostoParaGerir` removido só da rota `GET /usuarios/:id/sessoes`: reprova "posto igual ou acima: 403 posto_insuficiente" (`$SP/mut-e09-m2.txt`).

## Cenários positivos

- Pessoa vê as próprias sessões vivas com a marca "esta", em ícone mais texto, e só elas (sonda E2 e `sessoes-da-conta.test.ts`).
- Quem administra vê "N sessões abertas" e datas antes de derrubar, sem aparelho nem IP.
- Redefinir a senha de outra pessoa devolve a senha uma vez; entrar com ela exige troca; sessões antigas caem (testes de API e e2e).
- Depois de encerrar as outras sessões a lista reflete o banco (n = 1).

## Cenários negativos

- IP e user-agent plantados no banco não aparecem em nenhuma resposta nem tela (sonda, navegador).
- `?usuario=<id de outra pessoa>` e `x-organizacao-id` de outro município são ignorados em `/auth/sessoes`; o município vem só do token.
- Id de usuário de outro município em `/usuarios/:id/sessoes`: 404 igual ao de id inexistente (nunca 403).
- Papel sem `gerenciar_usuarios` (agente): 403 `sem_permissao`; coordenador contra posto igual ou acima: 403 `posto_insuficiente`.
- Senha temporária fora da trilha, do log e do armazenamento do navegador (acima).

## Tentativas de reprovar

1. IP de terceiro na lista: plantei IP e user-agent distintos por sessão e por pessoa, pedi a lista com parâmetros de outra pessoa; só vieram as da própria conta. Não consegui.
2. Mesma tentativa pela rota de administração: devolve só contagem e datas. Não consegui.
3. Aparelho de outra pessoa no resumo: o resumo vem do user-agent da própria sessão; texto livre do cliente (matrícula, e-mail plantados) vira uma frase de vocabulário fechado. Não consegui extrair dado pelo user-agent.
4. Município cruzado: administrador de A sobre agente de B, com e sem cabeçalho de organização: 404. Não consegui.
5. Senha temporária em log, trilha, banco, storage, URL, título, console e DOM depois de fechar: não encontrei (E2 acima).
6. Cache da resposta com a senha: `no-store` presente.
7. Mutar o conserto (M1, M2): os testes reprovam; o teste morde.
8. Dicionário: procurei coluna de pessoa sem descrição. Achei lacunas (Achados 1 e 2), que não quebram critério da E09.
9. Procurei a senha temporária na evidência arquivada (`docs/evidencias-v2/G00/V2-F00-E09`, fora de `validacao/`): varredura por JWT, `Bearer`, URL com credencial, `AKIA`, chave privada: nada. Os e-mails que aparecem são de `exemplo.gov.br`, sintéticos.

## Achados

1. **corrige antes de crescer (documentação de dado pessoal).** `dc360/docs/PRIVACIDADE.md` seção 2.2 ("Do servidor público que usa o sistema") lista nome, matrícula, e-mail, papel, equipe e trilha, e NÃO diz que o sistema guarda o IP e o user-agent inteiro de cada sessão; a seção 4 (retenção) também não diz por quanto tempo as linhas de `sessoes` ficam (hoje: para sempre, não há DELETE nem expurgo; confirmado em `db/migrations` e `apps/api/src`). A E09 diz "sessão é dado técnico da própria pessoa", e é verdade que a tela não o expõe, mas o inventário público do que se guarda está incompleto. Dono provável: F05-E12 e CP-10 (já citados em `apps/web/PENDENCIAS.md` e no roadmap). Não quebra critério da E09 (o expurgo está explicitamente fora de escopo). Reprodução: `grep -n -i "sess\|endereço de rede" dc360/docs/PRIVACIDADE.md` mostra só as linhas 130, 207 e 349 a 370, nenhuma sobre IP de sessão.
2. **corrige antes de crescer (dicionário).** Na seção `usuarios` do `DICIONARIO-DE-DADOS.md` faltam `senha_provisoria_ate` (a data das 72 h que esta etapa passou a gravar), `ultimo_acesso`, `falhas_login` e `bloqueado_ate` (só descritos para `console_operadores`); `senha_hash` só aparece na seção do console. A linha de `sessoes` foi atualizada pela E09 e é correta; `familia_id` está descrito. Reprodução: `$SP/colunas-faltando-por-tabela.txt` linha `usuarios`, mais `grep -n senha_provisoria dc360/docs/*.md` sem resultado.
3. **anotado.** A senha temporária tem botão "Copiar senha" e fica na área de transferência do aparelho de quem administra; não há limpeza. É coerente com o propósito (ditar por telefone) e está dito na tela; fica para decisão de produto.
4. **anotado.** `remoteAddress` (IP do cliente) vai em toda linha de log de requisição. Anterior à etapa, igual nas rotas novas. A retenção do log é decisão de operação e DPO (CP-10).

## Não verificado

- CI do SHA: `ci_run` ausente; não li o run `39143791434`.
- Leitor de tela e aparelho físico (limite da seção 4 de `28`); a leitura do anúncio da confirmação segue pendente humana da etapa.
- Firefox e WebKit: a sonda de navegador rodou só em Chromium.
- A página de produção na Vercel e o Fly: rodei API e painel locais, não a produção.
- Se o provedor de log da produção (Fly) guarda `remoteAddress` por mais tempo do que a política dirá: depende do ambiente real.
- Base legal para guardar IP e user-agent de sessão: não avaliei (fora do que o agente decide).

## Risco residual

- IP e user-agent de sessão ficam sem prazo até a F05-E12 (CP-10). Não é vazamento hoje (não saem por nenhuma rota nem no pacote de saída), mas é dado pessoal guardado sem política de retenção publicada.
- O inventário público (PRIVACIDADE.md) e o dicionário estão atrás do banco nos pontos dos Achados 1 e 2.

## Motivo do humano

`humano_necessario: sim`, e só para o que a seção 4 de `28` mantém com pessoa: (a) o prazo de retenção e a finalidade/base legal de guardar IP e user-agent de sessão (CP-10, DPO e controlador); (b) a decisão de produto sobre a senha temporária ficar na área de transferência. Nenhuma dessas decisões altera o veredito técnico da E09; as verificações técnicas (inventário, fluxo, acesso, log, minimização na tela) foram feitas por execução e estão acima.
