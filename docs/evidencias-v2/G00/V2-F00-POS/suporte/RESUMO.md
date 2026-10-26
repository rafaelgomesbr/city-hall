# V2-F00-POS, suporte: restaurar o acesso do administrador de um município (H06 B)

Ramo `trab/f00pos-suporte`, saído de `v2/f00-pos` (`7acab80c`). Decisão do Rafael de
2026-10-26 (H06, escolha B, `docs/roadmap-v2/pendencias-humanas.md`; contexto em
`docs/evidencias-v2/G00/V2-F00-E10/validacao/4b96ea7/qa.md`). Implementado, não
validado: quem valida é o gatekeeper, numa sessão nova. Commit da implementação:
`a0cf354c`; merge de `origin/v2/f00-pos` (`63041922`, ramo da API) em `e43349c3`; renumeração
da migração para 054 em `0e04c560`.

## O problema

Enquanto a recuperação de senha por email estiver desligada em produção
(`RECUPERACAO_ATIVA=nao`, sem domínio de envio), o administrador ÚNICO de um município
que perde a senha não tem saída: quem redefine a senha de outra pessoa no painel é quem
administra, e a rota recusa a própria pessoa. A saída que sobrava era abrir `psql` na
produção com a credencial de dono.

## O que mudou

### Banco: migração 054 (`dc360/db/migrations/054_o_fornecedor_restaura_o_acesso_do_administrador.sql`)

Aditiva: uma tabela nova, uma função nova e a recriação de uma função IMMUTABLE de lista
(`CREATE OR REPLACE`, mesma assinatura) com um nome a mais. Nenhuma coluna, policy ou
função existente muda de comportamento. Nasceu como 055, para não colidir com o ramo
`trab/f00pos-api`; depois do merge de `origin/v2/f00-pos` (que trouxe a 052 e a 053) foi
renumerada para 054 com `git mv`, sem buraco na numeração. Ela não estava aplicada em
lugar nenhum, então renumerar é seguro.

- `console_restaurar_acesso_do_administrador(org, email, hash, motivo)`, SECURITY
  DEFINER, `search_path` fixo, `row_security = off`, EXECUTE só para `dc360_console`.
  Tudo que recusa vem antes de tudo que escreve:
  - quem chama é o DONO ativo do console (`42501` para operador comum e sem operador);
  - motivo com pelo menos 10 caracteres e senha já derivada no formato do produto (`DC361`);
  - município existe e não foi eliminado (`DC364`), não está suspenso (`DC365`), e no
    máximo 3 restaurações por município em 24 horas (`DC365`);
  - a conta é procurada pelo email DENTRO do município indicado
    (`organizacao_id = p_org`), e só serve se o papel for `administrador` e a conta
    estiver ativa. Outro município, conta inexistente, outro papel e conta desativada
    recebem a MESMA mensagem (`DC364`), para o console não virar oráculo de quem existe
    onde; o `DETAIL` diz qual conferência falhou (o console não o repassa).
  - Escreve, numa transação: senha provisória com `senha_provisoria_ate = now() + 72 h`
    (o mesmo prazo de `POST /usuarios/:id/redefinir-senha`), `falhas_login` e
    `bloqueado_ate` zerados; encerra TODAS as sessões da pessoa sob a trava por pessoa da
    049; os links de recuperação pendentes morrem pelo gatilho da 051; linha na
    `trilha_administrativa` do município (`acesso_do_administrador_restaurado_pelo_fornecedor`,
    autor `operador_da_plataforma` com o email do dono do console, `depois` com motivo,
    sessões encerradas, prazo e origem; nunca a senha nem o hash); linha em
    `restauracoes_de_acesso`.
  - Não toca no segundo fator.
  - Ordem das travas: linha do município (`FOR NO KEY UPDATE`), linha da pessoa
    (`FOR NO KEY UPDATE`, que não conflita com o `FOR KEY SHARE` da renovação), trava
    por pessoa, UPDATE de sessões. É a ordem da suspensão e a regra da 049.
- `restauracoes_de_acesso`, o registro do console: RLS ativada e forçada, uma única
  policy (`SELECT TO dc360_console USING (console_operador_e_dono())`), só `SELECT`
  concedido ao console, nada ao papel de aplicação. Append-only por ausência de
  INSERT, UPDATE e DELETE: só a função escreve. Tem `organizacao_id` com chave para
  `organizacoes` e entra na camada 0 de `ordem_de_apagamento_por_municipio()`: sai
  junto com o município eliminado (o motivo é texto livre e pode citar a pessoa). Não
  guarda a conta restaurada (essa fica na trilha do município, que o console não lê).

### Console (`dc360/apps/console`)

- `POST /municipios/:id/restaurar-acesso` (`src/servidor.ts`): dono (403), município
  existente (404), corpo válido (400, motivo de 10 caracteres), senha atual de quem
  clica (401 `senha_incorreta`) e código NOVO do aplicativo (401 `codigo_invalido`,
  conta como tentativa), e só então o banco. Recusa do banco: `42501` vira 403, `DC36x`
  vira 409 com a frase. Resposta com `cache-control: no-store` e a senha temporária uma
  vez; o rastro de log leva operador, município, conta, sessões e prazo, nunca a senha
  nem o motivo. Sob o mesmo teto de ações (10 por hora por endereço).
- `GET /municipios/:id/restauracoes`: as últimas 20, só para o dono.
- `src/municipios.ts`: sorteio pela mesma `gerarSenhaTemporaria` do painel, derivação
  `scrypt` antes da transação, chamada da função.
- `src/pagina.ts`: botão "Restaurar acesso" na linha de município ativo; modal com o
  histórico de restaurações, email, senha, código novo e motivo; a senha aparece no
  cartão, Escape não fecha enquanto ela está à vista (só "Já repassei, concluir"), e
  ela sai do documento ao concluir e ao sair do console.

### Demais

- `dc360/apps/api/src/saida/pacote.ts`: `restauracoes_de_acesso` em
  `TABELAS_QUE_NAO_SAEM` (do fornecedor; o município leva o mesmo ato na trilha).
- `dc360/docs/IMPLANTACAO.md`, seção 6.5 (nova): quando usar, a verificação de
  identidade ANTES de usar (ligação de volta ao telefone institucional do contrato e
  confirmação do gestor do contrato, ou videochamada com documento; sinais de golpe),
  o passo a passo no console, como repassar a senha (só pelo canal verificado), o que o
  sistema faz e o que não fica coberto. 6.4 ganhou o item correspondente.
- `dc360/docs/DICIONARIO-DE-DADOS.md`, `dc360/README.md`, `dc360/docs/COLOCAR-DE-PE.md`,
  `dc360/docs/RESTORE-DO-BANCO.md` e `dc360/scripts/baseline.mjs`: contagens e descrição.

## Portões que mudaram, cada um narrado no próprio arquivo

- `db/test/isolamento.test.ts`: teto de funções SECURITY DEFINER de 27 para 28;
  `console_restaurar_acesso_do_administrador()` em `O_CONSOLE_EXECUTA`;
  `restauracoes_de_acesso` em `DO_FORNECEDOR` (sem escrita, guarda
  `console_operador_e_dono` também na leitura), em `O_CONSOLE_ALCANCA` (só SELECT), na
  lista fechada de colunas do que o console lê, e na lista de concessões do console
  (11). Antes da narração, os sete casos reprovaram a migração (saída em
  `saidas/02-test-isolamento.txt` é a de depois; a de antes está descrita aqui:
  policy de leitura cruzada, teto 28 > 27, privilégio fora do permitido nas duas
  varreduras, colunas que cabem dado de pessoa, concessões 11 contra 10, e a semeadura
  da eliminação sem a tabela nova).
- `db/test/eliminacao-de-municipio.test.ts`: a semeadura ganhou uma linha na tabela
  nova (o caso "a semeadura cobre toda tabela de negócio" reprovou sem ela) e a
  eliminação a apaga junto.
- `apps/console/test/superficie.test.ts`: a rota nova na lista nomeada de POST.
- `apps/console/test/o-acabamento-da-tela.test.ts`: três diálogos, o de restaurar com
  botão destrutivo, verbo com o nome do alvo, senha e código saem dos campos e a senha
  sai do documento.

## Testes novos

| Arquivo | Casos | O que prova |
| --- | --- | --- |
| `dc360/db/test/restauracao-de-acesso.test.ts` | 11 | Caminho feliz (senha provisória de 72 h, sessões só da pessoa, link pendente morto, trilha e registro sem a senha, login enxerga a provisória); recusa de operador comum, sem operador e do papel de aplicação; motivo vazio, curto, nulo e senha em texto claro; coordenador, operador e agente; administrador de OUTRO município (resposta idêntica à de conta inexistente); administrador desativado; município suspenso e inexistente; teto de 3 em 24 h, que o vizinho não divide; o console não insere, altera nem apaga no registro; operador comum lê zero, papel de aplicação não lê; forma da função no catálogo. Cada recusa tem o caso-irmão que passa com a condição consertada, e confere que nada mudou (senha, prazo, castigo, sessões, trilha, registro) |
| `dc360/apps/console/test/restaurar-acesso.test.ts` | 9 | A rota sobre o Postgres em WebAssembly com as migrações reais: 401 sem sessão; 403 do operador e o BANCO recusando o operador por fora da rota (`42501`); senha errada e código já usado; motivo ausente ou curto; município inexistente; outro município igual a inexistente; coordenador; caminho feliz (a senha mostrada confere com o hash gravado, é provisória, sessões caem, trilha e registro sem a senha, e o log não tem senha nem motivo); histórico só para o dono |
| `dc360/apps/console/test/no-navegador-restaurar.test.ts` | 4 | Chromium com a política de segurança valendo: botão na linha, modal com foco dentro e página atrás inerte, histórico, recado de motivo curto, senha à vista, Escape não fecha, concluir tira a senha do documento, histórico ao reabrir, zero erro de console e de política. Grava as capturas com `CAPTURAS_RESTAURAR` |

## Prova de que os testes mordem (`saidas/03-mutacoes.txt`, sonda em `sondas/mutacoes.py`)

Cada mutação tira UMA conferência da migração 054 ou da rota, roda a suíte e restaura
o arquivo. Linha de base verde (11 de 11 no banco, 9 de 9 na rota); TODAS as 16
mutações deixam a suíte vermelha, no caso que nomeia a conferência:

| Mutação | Caso que reprovou |
| --- | --- |
| M01 sem a conferência do dono | operador comum não restaura |
| M02 sem o município na busca da conta | administrador de OUTRO município |
| M03 sem a conferência do papel | conta de outro papel no mesmo município |
| M04 sem a conferência de conta ativa | administrador desativado |
| M05 sem a conferência do motivo | sem motivo, motivo curto |
| M06 sem encerrar as sessões | caminho feliz |
| M07 validade de 720 h em vez de 72 h | caminho feliz |
| M08 sem a recusa de município suspenso | município suspenso |
| M09 sem o teto | o teto |
| M10 hash na trilha | caminho feliz |
| M11 função executável por PUBLIC | operador comum (papel de aplicação) e forma no catálogo |
| M12 registro legível por qualquer operador | o dono lê, o operador lê zero |
| M13 sem a recusa de senha em texto claro | senha em texto claro |
| R01 rota sem conferir o código novo | código já usado (e os seguintes, em cascata) |
| R02 rota sem conferir a senha | senha errada (e os seguintes, em cascata) |
| R03 senha temporária no log | caminho feliz |

## Saídas (`saidas/`, no SHA `0e04c560`, depois do merge e da renumeração)

Rodadas uma de cada vez, em sequência, sem cor ANSI e sem caminho pessoal.

| Arquivo | Comando | Resultado |
| --- | --- | --- |
| `01-typecheck.txt` | `npm run typecheck` | código 0 |
| `02-test-isolamento.txt` | `npm run test:isolamento` | 15 arquivos, 356 passaram, 3 pulados por ambiente (os de `busca.test.ts`), código 0. Antes: 345 |
| `03-mutacoes.txt` | `python sondas/mutacoes.py` | 16 de 16 mutações vermelhas, linhas de base verdes |
| `04-test-console.txt` | `npm run test:console` | 19 arquivos, 320 passaram, código 0. Antes: 307 |
| `05-test-api.txt` | `npm run test:api` | 110 arquivos, 1735 passaram, 46 pulados, código 0 (os números do ramo da API, que esta etapa não muda) |
| `06-test-scripts.txt` | `npm run test:scripts` | 362 casos, 355 passaram, 7 pulados, 0 falhas, código 0 (ver a nota abaixo) |
| `07-conferir-numeros.txt` | `npm run conferir:numeros` | 25 afirmações conferidas (entre elas o marcador de 54 migrações de `RESTORE-DO-BANCO.md`), o roteiro da linha de base bate nas oito suítes, código 0 |

Nota sobre `06-test-scripts.txt`: a primeira rodada, com esta pasta ainda fora do
`INDEX.md`, reprovou exatamente um caso, "conferir-indices-de-evidencia: a evidência
real" (arquivo de evidência que o índice não lista), que é o portão funcionando. A
saída arquivada é a da rodada depois de o índice ser atualizado.

Antes do merge, uma rodada de `npm run test:api` com o conferidor de números e o navegador
rodando ao mesmo tempo terminou com 1719 passando e um erro de infraestrutura do
vitest (`Timeout calling "onTaskUpdate"`, máquina sobrecarregada), sem caso
reprovado. A rodada arquivada, sozinha, saiu limpa.

## Capturas (`capturas/`)

Gravadas por `no-navegador-restaurar.test.ts` com `CAPTURAS_RESTAURAR`, no Chromium, a
1280 e a 390 px, claro e escuro: a linha com o botão (01), o modal com o recado de
motivo curto (02 a 05), a senha temporária com o aviso de validade e o segundo fator
(06 a 09) e o histórico ao reabrir (10). Conferidas a olho: nada cortado nem
sobreposto; o modal rola dentro do cartão a 390 px (o mesmo comportamento do modal de
eliminar), e o botão de agir fica abaixo da dobra a 1280x900 com o recado (captura 02).

## Limitações e pendências

- O segundo fator não é tocado. Administrador que perdeu também o aparelho e não tem
  código de recuperação do painel continua sem entrar; não há caminho pelo console.
- A permissão é "ser o dono do console", e não uma permissão delegável: operador comum
  não restaura. Delegar exigiria uma coluna de permissão protegida contra a policy que
  deixa o operador editar a própria linha; fica para quando houver mais de um dono de
  fato.
- A verificação de identidade é procedimento humano (`IMPLANTACAO.md` 6.5). O sistema
  garante o registro e o teto, não que a ligação de volta foi feita.
- O merge de `origin/v2/f00-pos` (`63041922`, com o ramo da API) teve conflito só de
  contagem (`README.md`, `docs/COLOCAR-DE-PE.md`, `docs/RESTORE-DO-BANCO.md`), resolvido
  somando as duas frentes; `baseline.mjs` e o `INDEX.md` desta pasta juntaram sem
  conflito. Nenhuma sobreposição de esquema: a 052 cria `vigencia_de_quem_escreve` (sem
  SECURITY DEFINER) e a 053 um índice.
- Não aplicado em produção, não implantado.
