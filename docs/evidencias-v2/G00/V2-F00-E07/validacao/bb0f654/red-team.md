---
validador: red-team (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E07
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [AUTH, DB, MIGRATION, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: nao
escalar: arbitragem em Opus só se o gatekeeper entender que o achado 1 (troca de senha concorrente com a reação) está fora do critério "sessão revogada" da E07; a reprodução em si não depende de interpretação
---
## Critérios verificados

Ambiente: Postgres 17.6 real e descartável (binários x86_64 já presentes no scratchpad de outra sessão, usados sem copiar nem alterar; cluster novo em `$SP/validadores/red-team-E07/pgdata`, porta 55977, só em 127.0.0.1, autenticação local por confiança, sem senha). A API do SHA roda em processo (`construirServidor` de `dc360/apps/api/src`, a mesma usada pelos testes), com `bancoPostgres` real (pool de 16 conexões, `SET LOCAL ROLE dc360_app`), migrações 001 a 050 e semente aplicadas pelo próprio `aplicarMigracoes`. As sondas ficam em `$SP/validadores/red-team-E07/sonda/` (`$SP` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad`). O servidor foi desligado no fim (porta livre conferida) e os bancos de sonda apagados.

| Critério | Resultado | Prova |
| --- | --- | --- |
| Defeito da rodada 3: login com a senha antiga concorrente com troca, redefinição ou desativação deixa sessão viva | CONSERTADO | `01`: bloco de Postgres real do repositório em 17.6, 81 de 81 nos quatro arquivos, nenhum pulado; `13`: 90 disputas sem grampo, só relógio (30 por reação), login 200 em 31 delas, **0** sessão viva sobrando, 0 renova ou escreve; mutações M1 e M7 mordem |
| Cadeia rotacionada só vale enquanto a família vive | PASS | `14` item 4 (quem administra, sair com token vivo: token anterior à renovação 401 `sessao_encerrada`, token novo 401, renovação 401); `13` (c): reúso do token rotacionado derruba tudo; M4 morde (16 vermelhos) |
| Papel alterado: 401 `nao_autenticado`, renovação traz o papel novo, papel novo não despacha, B continua 404 | PASS | `14` itens 1c a 1l; M5 morde (5 vermelhos) |
| Senha provisória vencida nem escreve, nem troca, nem renova | PASS | `14` itens 3c a 3g (401 `sessao_encerrada` na troca, na renovação e na escrita, `senha_provisoria_vencida` na entrada, hash intacto); M3 morde (1 vermelho, o caso pelo serviço) |
| Segundo fator: desafio emitido antes da troca não abre sessão | PASS (por teste e mutação) | `01` (segundo-fator em 17.6 verde); M2 morde (3 vermelhos) |
| Renovação concorrente com encerramento (FAIL da rodada 2) | PASS | `01` casos 1 a 8 em 17.6; `13` (b): 30 renovações duplas com o mesmo token, nunca dois pares, nunca duas sessões vivas; M6 morde (6 vermelhos, inclusive as 60 disputas sem grampo) |
| Escalada por papel menor e por outro município | PASS | `14` itens 2a a 2g (403 `sem_permissao` para operador; 404 para coordenador de B, inclusive com cabeçalho de organização A forjado) |
| Isolamento com a migração | PASS | `30`: `npm run test:isolamento` 345 aprovados e 3 pulados de 348, código 0 |
| Item "sessão revogada" do G00 (item 2 da seção 7 de `28`): a reação de quem desconfia de vazamento encerra o acesso de quem tinha a senha antiga | **FAIL** | achado 1: a troca de senha do atacante, autenticada com a senha antiga e em voo durante a reação, confirma depois dela e sobrescreve a credencial da reação. Determinístico com grampo (4 de 4 reações, `10`) e sem grampo nenhum (redefinição 20 de 30 nas duas ordens, troca pela própria pessoa 30 de 30, `11` e `12`) |

## Evidência

Todas as saídas em `$SP/validadores/red-team-E07/`:

- `01-correcao-pg17.txt`: `DC360_POSTGRES_DE_PROVA` apontando para o 17.6 local, `npx vitest run --root apps/api test/renovacao-contra-encerramento.test.ts test/segundo-fator.test.ts test/senha-provisoria.test.ts test/familia-da-sessao.test.ts`: 4 arquivos, 81 de 81, código 0, nenhum pulado.
- `10-s1-troca-segurada.txt` (sonda `s1-troca-segurada.ts`, código 0): a troca de senha do atacante é segurada logo antes do comando `trocar_senha`, a reação termina inteira, e o atacante é solto.
- `11-s2-troca-sem-grampo.txt` e `12-s2-troca-sem-grampo-reacao-primeiro.txt` (sonda `s2-troca-sem-grampo.ts`, código 0): a mesma disputa sem grampo, só com atraso de 0 a 340 ms entre os dois pedidos, 30 rodadas por reação e por ordem. Scrypt medido: 225 ms por derivação.
- `13-s3-login-e-renovacao.txt` (sonda `s3-login-e-renovacao-sem-grampo.ts`, código 0): regressão do FAIL da rodada 3 e do da rodada 2 sem grampo.
- `14-s4-funcional.txt` (sonda `s4-funcional.ts`, código 0): papel, escalada, outro município, provisória, cadeia, troca com token anterior à renovação, corpo malformado, enumeração.
- `20-mutacao-M1.txt` a `20-mutacao-M7.txt` e `20-mutacoes-resumo.txt` (script `mutar.mjs`): cada mutação aplicada na árvore, os seis arquivos de teste da E07 rodados com Postgres 17.6 real, e `git restore` logo depois; `git status` limpo depois de cada uma.
- `30-test-isolamento.txt`: `npm run test:isolamento`, 345 aprovados, 3 pulados, código 0.
- `pg.log`: log do servidor; nenhuma linha "deadlock detected"; os únicos ERROR são 8 recusas DC367 de município suspenso, dos casos 8, 9 e 20 do teste do repositório.

## Cenários positivos

- Renovação normal não expulsa: casos 5 do bloco de PGlite e do bloco de Postgres real verdes em 17.6 (`01`).
- Rebaixada renova e recebe `operador`; token renovado lê o próprio município (`14` 1h).
- Provisória no prazo: a troca segue a regra de força da senha (422 com senha fraca) e o resto fica em 403 `troca_de_senha_obrigatoria` (`14` 3a, 3b).
- Login comum, renovação comum e troca de senha sem disputa: 200 (`13`, `14`).

## Cenários negativos

- Token anterior à renovação depois de a cadeia ser encerrada por quem administra e por sair com o token vivo: 401 `sessao_encerrada` na escrita; token novo também; renovação 401 (`14` item 4).
- Reúso do token rotacionado: 401, e o token novo da cadeia e os dois tokens de acesso caem (`13` c).
- Token com papel adulterado sem reassinar: 401 (`14` 1l).
- Rebaixada com o token velho: despacho e escrita 401 `nao_autenticado`, escrita em B 401, leitura de B 404 (`14` 1c a 1f).
- Operador se promovendo, mudando papel alheio ou redefinindo senha alheia: 403 (`14` 2a a 2c). Coordenador de B encerrando sessões, redefinindo senha, desativando ou editando Helena de A (também com cabeçalho de organização A): 404, nunca 403 (`14` 2d a 2g).
- Provisória vencida: troca 401 `sessao_encerrada` com hash intacto, renovação 401, entrada 401 `senha_provisoria_vencida`, escrita 401 (`14` 3c a 3g).
- Corpo vazio e JSON torto em `/auth/renovar`: 400 `corpo_invalido`; tipo errado e token de 200 mil caracteres: 422; `/auth/sair` com lista: 422 (`14` item 6).
- Enumeração: e-mail inexistente, senha errada e conta desativada com a senha certa devolvem o mesmo corpo, 401 `credenciais`, em 226, 228 e 227 ms; token de renovação desconhecido 401 `sessao_encerrada` (`14` item 6).

## Tentativas de reprovar

1. **Senha antiga contra a reação, pelo login (FAIL da rodada 3).** Repeti em 17.6 sem grampo, disparando o login com a senha antiga de meio scrypt antes até um scrypt e meio depois da reação: 0 sobra em 90 rodadas (`13`). Rodei o bloco de Postgres real do repositório (`01`) e provei que ele morde: M1 (sem a releitura em `emitirPar`) deixa 10 vermelhos, inclusive os casos 6 a 8, 10 a 12 e 17; M7 (sem a trava no login) deixa 8 vermelhos, inclusive 10 e 14 a 20. Não sobreviveu.
2. **Senha antiga contra a reação, pela TROCA DE SENHA (sobreviveu, achado 1).** Atacante (a): tem a senha antiga e entrou com ela. A vítima ou quem administra reage. O pedido `/auth/trocar-senha` do atacante passa pela vigência antes da reação confirmar; `trocarSenha` (`dc360/apps/api/src/auth/servico.ts`, linhas 1065 a 1131) lê o hash numa transação, confere o scrypt fora do banco, deriva a senha nova e só então chama `trocar_senha` em OUTRA transação; `trocar_senha` (`db/migrations/049_renovacao_e_encerramento_na_mesma_trava.sql`, linhas 130 a 151) grava o hash sem conferir que ele ainda é o que foi conferido, sem conferir `ativo` e sem conferir que a sessão preservada está de pé. Resultado medido:
   - com grampo (`10`), as quatro reações respondem 200 e mesmo assim, solto o atacante: troca do atacante 200; login com a senha do ATACANTE 200; escrita com a sessão nova dele 200; login com a senha da reação 401; `senha_provisoria_ate` NULL. Vale para redefinição por quem administra, troca pela própria pessoa (e a vítima ainda perde a sessão dela: escrita 401 `sessao_encerrada`), link de recuperação, e desativação seguida de reativação (o atacante entra com a senha dele).
   - sem grampo nenhum (`11`, `12`): redefinição por quem administra, 20 de 30 rodadas com a senha do atacante valendo no fim, nas duas ordens (atacante primeiro e reação primeiro), sempre que os dois pedidos saem a menos de um scrypt (cerca de 225 ms) um do outro; troca pela própria pessoa com a reação saindo primeiro e o atacante até 340 ms depois, 30 de 30. Com o atacante saindo primeiro a troca pela própria pessoa chega por último e vence (0 de 30), o que só confirma que vence quem grava por último, sem nenhuma conferência.
   - nenhum teste do repositório cobre isso: os 81 casos de `01` e os 345 de `30` passam com o comportamento acima.
3. **Token de renovação roubado e já rotacionado, e renovação dupla com o mesmo token.** 30 disputas (`13` b): nunca dois pares, nunca duas sessões vivas; reúso derruba a cadeia inteira (`13` c). Não sobreviveu.
4. **Rebaixamento em voo.** Token velho não despacha nem escreve (401), não lê B (404), assinatura adulterada recusada; mutação M5 morde. A leitura de `/usuarios` com o token velho continua 200 por até 15 minutos (`14` 1g): limitação declarada (vigência em leitura é F03-E03), anotada abaixo.
5. **Provisória vencida pela rota e pelo serviço.** Tudo recusado; M3 morde no caso pelo serviço.
6. **Troca de senha com o token de acesso anterior à renovação** (`14` item 5): responde 200 "As outras sessões foram encerradas", mas `trocar_senha` preserva só a linha (o `sid` já rotacionado) e encerra a sessão viva da própria cadeia de quem trocou: o token devolvido leva 401 `sessao_encerrada` e a renovação 401. É o mesmo defeito que a correção 1 consertou em `encerrarSessoes` (preservar pela família), que ficou sem conserto em `trocar_senha`. Anotado (achado 2).
7. **`/auth/sair` com o token já rotacionado** (`14` item 4, terceira linha): 204 e nada encerrado; a cadeia segue escrevendo e renovando. Já anotado nas rodadas anteriores (achado 3).
8. **Corpo malformado, repetição, enumeração.** Ver cenários negativos; nada sobreviveu.
9. **Prova de mordida das demais defesas**: M2 (impressão da credencial no desafio sempre aceita) 3 vermelhos em `segundo-fator`; M4 (família trocada por OR) 16 vermelhos; M6 (sem trava na renovação) 6 vermelhos em Postgres real. Todas restauradas com `git restore`, árvore limpa conferida depois de cada uma.

## Achados

1. **FAIL (bloqueia; item 2 da seção 7 de `28`, autenticação e sessão revogada, origem BZ-F:P0-SEG; não admite risco aceito): a troca de senha de quem tem a senha antiga, em voo durante a reação, anula a reação.** Mesma classe do FAIL da rodada 3 (pedido autenticado pela senha antiga que confirma depois da troca), agora pelo caminho `/auth/trocar-senha`, que a correção 3 não alcançou.
   - Reprodução mínima: Helena (coordenadora) entra com a senha da semente; o atacante, com a mesma senha, entra em outro aparelho. O atacante envia `POST /auth/trocar-senha` com a senha antiga como atual e uma senha dele como nova; em até cerca de 225 ms (um scrypt) antes ou depois, Rita (administradora) envia `POST /usuarios/<Helena>/redefinir-senha`. As duas respondem 200. No fim, a senha provisória que Rita recebeu não entra (401), a senha do atacante entra (200), não é provisória, e a sessão nova dele escreve (200). Contagem: 20 de 30 sem grampo; 1 de 1 por reação com grampo, nas quatro reações. Troca pela própria pessoa com o atacante logo depois: 30 de 30, e a vítima ainda perde a sessão.
   - Mecanismo: `trocarSenha` confere a senha atual numa transação e grava em outra; `trocar_senha` não é condicional (não compara o hash conferido, não relê `ativo`, não confere a sessão preservada, e a trava por pessoa vem depois do UPDATE de `usuarios`, então não serializa nada contra a reação que já confirmou).
   - Conserto mínimo (o validador não implementa): gravar a senha nova só se o hash ainda for o que o scrypt conferiu, a conta ainda estiver ativa e a sessão de quem pede ainda estiver de pé, na mesma transação e depois da trava (o desenho de `emitirPar`), recusando com a resposta genérica caso contrário; caso de Postgres real com a disputa segurada para redefinição, troca pela própria pessoa, link e desativação. Dono: E07.
2. **Corrige antes de crescer (mesmo dono): `trocar_senha` preserva a sessão por `id`, e não pela família.** Com o token de acesso anterior à renovação, a pessoa troca a senha, lê "as outras sessões foram encerradas" e perde a própria cadeia (`14` item 5). Mesmo defeito que a correção 1 consertou em `encerrarSessoes`.
3. **Anotado (desenho anterior, já registrado em rodadas anteriores): `/auth/sair` com o token já rotacionado responde 204 e não encerra nada nem trata como reúso.**
4. **Anotado (limitação declarada, F03-E03): o token de quem foi rebaixado continua LENDO o que o papel antigo lia por até 15 minutos** (`GET /usuarios` 200 com o token velho de coordenadora rebaixada a operadora, `14` 1g).

## Não verificado

- O run do CI do SHA (39143791434) não foi lido; a prova em Postgres é local, em 17.6 x86_64 sob Rosetta. Postgres 16 (o serviço do job `implantavel`) não foi rodado por mim.
- Segundo fator ligado (`SEGUNDO_FATOR_ATIVO=sim`) contra a API em execução: verifiquei só pelos testes do repositório em 17.6 e pela mutação M2; não montei sonda própria de disputa entre o desafio e a troca de senha.
- O achado 1 pelo caminho do segundo fator e pela ativação (`/segundo-fator/confirmar` com token de acesso): não sondado; o mecanismo de `trocarSenha` não passa por lá.
- Pooler em modo transação e mais de uma instância da API: não testados; o contador de e-mails inexistentes e o teto de recuperação são por processo (desenho declarado).
- Painel (E2E do navegador da seção 24): fora da minha dimensão nesta rodada; não rodei.
- Mutações nas migrações 047, 049 e 050: não refeitas por mim (as da API foram).

## Risco residual

Com o achado 1 aberto, a troca de senha e a redefinição, que são o remédio de quem desconfia de vazamento, podem ser anuladas por quem tem a senha antiga e uma sessão aberta, numa janela de um scrypt (cerca de 225 ms), sem nenhum sinal para quem reagiu: a resposta da reação é 200, a vítima descobre só quando a senha nova não entra. O limite por endereço não estreita a janela (são dois pedidos legítimos). Fechados os achados, sobra a leitura com token vivo por até 15 minutos (F03-E03).

## Motivo do humano

Não se aplica: tudo nesta dimensão foi verificável por execução.
