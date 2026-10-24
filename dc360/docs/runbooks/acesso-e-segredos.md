# Runbook: contas, acesso e segredos (só nomes, nunca valores)

- **Versão:** 1, de 2026-10-24 (V2-F01-E16, rascunho).
- **Estado:** a matriz descreve o que existe HOJE e PROPÕE o acesso da segunda
  pessoa. A proposta só vira fato depois do CP-07 (decisão do Rafael: quem é a
  segunda pessoa e qual das três alternativas vale). Até lá, nenhuma célula da
  coluna "Segunda pessoa" foi concedida.
- **Quem executa:** o dono (Rafael) concede, revoga e revisa. A segunda pessoa
  não concede nada a si mesma.
- **Regra de ouro:** este arquivo guarda NOMES. O valor de qualquer segredo vive
  só no cofre decidido no CP-07 e nos lugares onde a plataforma o exige
  (`fly secrets`, ambiente da Vercel). Valor em arquivo versionado, captura de
  tela, mensagem ou histórico de terminal é incidente.

## O problema que isto resolve (fator de ônibus 1)

Hoje os segredos moram em `fly secrets` e no chaveiro de um Mac, e todas as
contas têm uma pessoa só. Se o dono ficar indisponível, ninguém consegue
implantar, reverter, girar um segredo nem recuperar o acesso. Pior: `fly secrets`
**não devolve o valor** de um segredo, então o valor que o Fly guarda só existe
em outro lugar se alguém o guardou. Perder `SEGUNDO_FATOR_CHAVE` deixa ilegíveis
os segredos TOTP (`rotacao-de-segredo.md`).

## As três alternativas do CP-07 (ficha do checkpoint)

| Alternativa | O que é | O que esta matriz entende |
| --- | --- | --- |
| A | Segunda pessoa técnica com acesso completo | Coluna "Segunda pessoa" vale inteira, também em PROD, antes da produção municipal |
| B | Segunda pessoa só com acesso de recuperação (cofre selado) | HML completo; em PROD, só recuperação (ver "Recuperação de PROD") |
| C | Sem segunda pessoa no piloto, com risco aceito por escrito | Nada é concedido. Fica bloqueado: runbooks completos (esta etapa), plantão (F21-E06), suporte do piloto (F27-E02) e qualquer SLA (F28-E05) |

A recomendação técnica registrada no checkpoint é B no mínimo antes de qualquer
SLA, e A antes da produção municipal. O padrão desta matriz é **B**: o acesso
padrão da segunda pessoa é só HML.

## Matriz de contas por função

A "função" abaixo é a do dono (hoje o único) e a da segunda pessoa (proposta). A
coluna "Segunda pessoa" diz o acesso **mínimo** para operar HML e recuperar
PROD. Onde o provedor tem mais de um papel, a escolha é o de menor privilégio
que permita a tarefa; o nome exato do papel é conferido na tela do provedor no
dia da concessão e escrito na ficha de concessão (abaixo).

| Conta | O que guarda | Dono hoje | Segunda pessoa (proposta, B) | MFA | Quem revoga |
| --- | --- | --- | --- | --- | --- |
| GitHub, repositório `rafaelgomesbr/city-hall` | Código, ruleset da `master`, CI, `CODEOWNERS` | Rafael (dono) | Papel com escrita (aprova PR; com o CP-07 o ruleset passa de 0 para 1 aprovação), nunca administrador, nunca contornar o ruleset | Obrigatório na conta | Dono |
| Fly, apps `defesa-civil` e `defesa-civil-console` (PROD) | API e console, `fly secrets` | Rafael | **Nenhum acesso rotineiro.** Recuperação por cofre | Obrigatório | Dono |
| Fly, apps de HML | API e console de teste | (não existem) | Acesso completo aos apps de HML, token de deploy restrito ao app de HML; depende de V2-F01-E11 e V2-F01-E12 | Obrigatório | Dono |
| Supabase, projeto de PROD | Banco e armazenamento de fotos | Rafael | **Nenhum acesso rotineiro.** Recuperação por cofre | Obrigatório | Dono |
| Supabase, projeto de HML | Banco e bucket de teste | (não existe) | Acesso completo ao projeto de HML; depende de V2-F01-E11 | Obrigatório | Dono |
| Vercel, projeto `dc360-painel-web` (PROD) | Painel web | Rafael | Só leitura (ver implantações e logs), sem alterar variável nem promover | Obrigatório | Dono |
| Vercel, painel de HML | Painel de teste | (não existe) | Membro com poder de implantar o painel de HML; depende de V2-F01-E11 e V2-F01-E12 | Obrigatório | Dono |
| Domínio e DNS | Nomes da API e do painel | (domínio próprio ainda não definido, CP-04) | Recuperação por cofre. Nenhuma alteração rotineira | Obrigatório | Dono |
| Monitor externo de `/saude` | Alerta de queda | (não existe; depende de V2-F01-E14 e F21-E06) | Destinatário do alerta, com acesso de leitura | Obrigatório | Dono |
| E-mail transacional (Resend) | Recuperação de senha e ofício por e-mail | Desligado em PROD; ligar é CP-19 | Nenhum até o e-mail ser ligado; depois, leitura do painel de entregas | Obrigatório | Dono |
| Apple Developer | Contas de loja, chave de push APNs, perfis | Rafael | Recuperação por cofre. Nenhum acesso rotineiro | Obrigatório | Dono |
| Google Play Console e Firebase | Loja Android, FCM | Rafael | Recuperação por cofre. Nenhum acesso rotineiro | Obrigatório | Dono |
| Expo (EAS) | Builds e envio às lojas | Rafael | Membro com poder de gerar build de HML; depende de V2-F01-E13 | Obrigatório | Dono |
| Google Cloud (chave de mapa por município) | Faturamento e restrições da chave de navegador | Rafael | Nenhum acesso rotineiro | Obrigatório | Dono |
| Cofre de segredos | Cópia dos valores listados abaixo | (não existe; decisão do CP-07) | Acesso de recuperação, selado, com abertura registrada | Obrigatório | Dono |

**MFA é obrigatório em toda conta**, a do dono e a da segunda pessoa, e o fator
de recuperação de cada conta (códigos, chave) também vai para o cofre. Conta
sem MFA não recebe a segunda pessoa.

## Nomes de segredo e onde moram

Os nomes vêm de `fly.toml`, `fly.console.toml`, `apps/api/src/config.ts` e
`apps/console/src/config.ts`. Nenhum valor aparece aqui.

| Onde | Nomes |
| --- | --- |
| Fly, app `defesa-civil` (API) | `DATABASE_URL` (papel `dc360_api`), `JWT_SEGREDO`, `URL_PUBLICA`, `URL_PAINEL`, `ORIGENS_PERMITIDAS`, `S3_ENDPOINT`, `S3_BALDE`, `S3_CHAVE_ID`, `S3_CHAVE_SECRETA`, e conforme ligado: `SEGUNDO_FATOR_CHAVE`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_CHAVE`, `FCM_CONTA_SERVICO`, `NOTIFICADOR_URL`, `NOTIFICADOR_CHAVE`, `EMAIL_REMETENTE`, `MAPS_KEY` |
| Fly, app `defesa-civil-console` | `CONSOLE_DATABASE_URL` (papel `dc360_console_login`), `CONSOLE_JWT_SEGREDO`, `CONSOLE_SEGUNDO_FATOR_CHAVE`, `CONSOLE_OPERADORES` (semente do dono, sai depois do primeiro uso) |
| Fly, `[env]` do `fly.toml` (não são segredo, vivem no repositório) | `NODE_ENV`, `HOST`, `PORT`, `RECUPERACAO_ATIVA`, `MARCA_DAGUA`, `S3_REGIAO`, `PROXY_DE_BORDA`, `APNS_AMBIENTE`, `APNS_BUNDLE` |
| Vercel (build, no `vercel.json`) | `VITE_API_URL`, `VITE_GOOGLE_MAPS_CHAVE`: não são segredo |
| EAS | `EAS_PROJECT_ID` (identificador); arquivo local `apps/campo/segredos/play-console.json` (chave de serviço, **fora do git**) |
| Chaveiro do Mac do dono | item `senha-do-banco-dc360` (conta `dc360`): senha do papel de setup do banco |
| Portal da Apple | arquivo `AuthKey_<ID>.p8` da chave APNs (entregue uma vez) |
| Segredos de CI do GitHub Actions | nenhum hoje. Tokens de deploy por ambiente dependem de V2-F01-E12 |

A matriz de variáveis por ambiente (HML x PROD) e o comparador de nomes contra
`fly secrets list` dependem de V2-F01-E09.

### O que precisa ter cópia no cofre (decisão do CP-07)

Todo item cuja perda trava a recuperação:

1. Senha do papel de setup do banco (migrar, endurecer, restaurar).
2. Valor atual de `JWT_SEGREDO` (sem ele não há rotação sem derrubar ninguém).
3. `SEGUNDO_FATOR_CHAVE` e `CONSOLE_SEGUNDO_FATOR_CHAVE` (perder uma deixa
   ilegíveis os segredos TOTP guardados no banco).
4. `CONSOLE_JWT_SEGREDO`.
5. Chaves `S3_*` do armazenamento.
6. O arquivo `.p8` da APNs e a chave de serviço do Google Play.
7. Códigos de recuperação do dono do console (`docs/IMPLANTACAO.md`, 6.3).
8. Os fatores de recuperação de cada conta da matriz.

O cofre em si (qual ferramenta, quem abre, como se sela) **é decisão do
Rafael no CP-07** e não é inventada aqui. O requisito mínimo: segredo cifrado em
repouso, acesso por pessoa com MFA, registro de quem abriu e quando, e a
segunda pessoa sem acesso de leitura rotineira a PROD.

## Recuperação de PROD (alternativa B)

Cenário: o dono está indisponível e algo em PROD precisa de intervenção que não
espera. A segunda pessoa:

1. Abre o cofre e **registra** a abertura (quem, quando, por quê) antes de usar
   qualquer coisa.
2. Executa só o necessário: voltar o release (`rollback.md`, escrito pela
   V2-F01-E08), reiniciar a máquina, ou girar um segredo
   (`rotacao-de-segredo.md`).
3. Nunca toca no banco de PROD com a credencial de dono para "arrumar" dado
   (`docs/INDISPONIBILIDADE.md`, 3.3).
4. Ao terminar, o dono **gira os segredos que foram abertos** e reavalia o acesso.

## Dado pessoal: função, finalidade e prazo

A segunda pessoa, com qualquer acesso a PROD (banco, armazenamento, logs),
alcança dado de cidadão. Por isso:

- **Função:** operador técnico reserva do fornecedor.
- **Finalidade:** manter o serviço no ar e recuperá-lo; nunca consultar dado de
  município por curiosidade ou suporte (para isso há a trilha e o telefone
  com o administrador do município).
- **Prazo:** o acesso vale pelo período registrado na ficha de concessão e é
  revisto a cada trimestre; expira se não for renovado.
- **Padrão:** só HML (dado sintético). O acesso a PROD é a exceção da
  recuperação, com registro.

O registro formal desta função entra em `PAPEIS_E_RESPONSABILIDADES.md`
(seção "Acesso técnico do fornecedor à infraestrutura", rascunho do CP-07).

## Ficha de concessão (uma por pessoa, sem segredo)

Preencher no dia da concessão e guardar em `docs/evidencias-v2/CP-07/` (sem
valor de segredo; nome da pessoa só se o Rafael decidir registrá-lo):

| Campo | Valor |
| --- | --- |
| Função | (operador técnico reserva) |
| Alternativa do CP-07 | A, B ou C |
| Conta | (uma linha por conta da matriz) |
| Papel concedido (nome exato na tela do provedor) | |
| MFA ligado e verificado | sim ou não |
| Concedido por, em | (data ISO) |
| Vale até | (data ISO) |
| Quem revoga | Dono |
| Próxima revisão | (concessão mais três meses) |

## Revisão trimestral

A cada três meses, e sempre que alguém sair do papel:

1. Para cada conta da matriz: a lista de quem tem acesso confere com a coluna
   "Segunda pessoa" e com o dono. Quem não está na matriz sai.
2. Para cada acesso concedido: a ficha ainda vale, ou expira.
3. Os segredos abertos no período pela recuperação foram girados.
4. A data da próxima revisão é escrita na ficha. A rotina recorrente (calendário,
   dono, evidência) é da V2-F28-E16.

## Revogar

Para tirar a segunda pessoa, ou um acesso de teste:

1. Remover o acesso em cada conta da matriz (ordem: cofre, Fly, Supabase,
   Vercel, GitHub, demais).
2. Revogar os tokens que ela criou (token de deploy, convite, chave pessoal).
3. Girar o segredo de qualquer valor que ela tenha aberto
   (`rotacao-de-segredo.md`).
4. Provar a revogação por uma tentativa recusada e registrá-la
   (`ensaio-da-segunda-pessoa.md`, passo de revogação).

## O que este runbook ainda não cobre

- Quem é a segunda pessoa, a alternativa escolhida e o cofre: CP-07.
- HML (contas e acesso de teste): depende de V2-F01-E11.
- Token de deploy por ambiente e a promoção para PROD: depende de V2-F01-E12.
- Destino de erro e canal de alerta: depende de V2-F01-E14 e do CP-06; plantão
  e canal: F21-E06.
- Domínio e DNS da produção: CP-04.
