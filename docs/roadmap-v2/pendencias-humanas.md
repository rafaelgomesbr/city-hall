# Roadmap de pendências humanas da V2

**Para quem:** Rafael (e Alyson, nos itens dela).
**Por que existe:** regra do Rafael de 2026-10-13: "se depender de mim pra ir pra próxima etapa vamos ter uma limitação de tempo e o sistema fica ocioso muito tempo [...] se precisar estritamente de algo humano, salva em um roadmap pendencias-humanas, mas continue desenvolvendo". Tudo o que manda parar e esperar uma pessoa vem para cá e o trabalho segue; o que era "aparelho físico" passa a ser tentado no emulador Android e só fica aqui o que o emulador não prova. A prova automatizada (testes, e2e, capturas, conferência de que o teste morde) não sai daqui nem vira pendência: continua obrigatória.
**Como usar:** cada item diz o que fazer, onde ler, o que deve acontecer e quem decide. Quando resolver, diga no chat o código do item e o resultado ("H03 feito", "H07 reprovo, porque ..."); quem registra sou eu. Item resolvido muda de seção, nunca some.
**Fonte do estado:** `docs/roadmap-v2/STATUS.md` e os `VEREDITO.md` de cada etapa. Se este arquivo e o STATUS divergirem, vale o STATUS.
**Atualizado em:** 2026-10-19, depois da rodada 4 da validação (`bb0f654`) e durante a correção 4 da F00.

## Situação da F00 em uma linha

Rodada 4 (2026-10-19, sobre `bb0f654`): 8 REPROVADAS (E03, E05, E07, E09, E10, E15, E22, E25), 5 BLOQUEADAS só porque a sessão de validação não conseguiu ler o CI (E01, E17, E18, E19, E21; ver H28), 5 VALIDADAS e 7 VALIDADAS COM PENDÊNCIA HUMANA. A correção 4 está em curso; a rodada 5 roda numa sessão nova. Antes: Rodada 3 (2026-10-15, sobre `52952a1`): 6 REPROVADAS (E03, E07, E12, E21, E22, E25), 6 BLOQUEADAS só porque o `INDEX.md` da evidência não batia num checkout novo (E02, E05, E08, E11, E14, E15), 6 VALIDADAS e 7 VALIDADAS COM PENDÊNCIA HUMANA. A correção 3 está em curso (E07, E25, E12 e E21 já commitadas; E03 e E22 em andamento) e vai para a rodada 4 numa sessão nova. Nada desta lista trava a correção nem a rodada 4.

Antes: Correção 2 concluída em 2026-10-14: as 12 etapas reprovadas na rodada 2 (E01, E03, E04, E06, E07, E09, E10, E12, E16, E19, E22, E24) estão IMPLEMENTADAS no candidato `7c97881`, à espera do CI completo e da rodada 3 de validação numa sessão nova; 8 validadas (E02, E08, E17, E18, E20, E21, E23, E25) e 5 validadas faltando só o que é humano (E05, E11, E13, E14, E15). Nada desta lista trava a rodada 3.

## A. Decisões que só uma pessoa toma (não travam a correção)

| Código | Etapa | O que decidir | Onde ler | Quem |
| --- | --- | --- | --- | --- |
| H01 | E24 (CP-02) | Confirmar ou reverter a premissa D-25 (implementar a saída a campo no aplicativo). Até lá, nenhuma demonstração a município mostra a saída a campo como pronta. | `docs/evidencias-v2/CP-02/decisao.md` | Rafael e Alyson |
| H02 | E10 (CP-19) | Provedor de e-mail, domínio, residência do dado e contrato, para ligar a recuperação de senha em produção. Adiado por você para a fase 2 (D6); até lá a produção fica com `RECUPERACAO_ATIVA=nao`. | `STATUS.md`, seção 7, linha CP-19 | Rafael (e jurídico no contrato) |
| H03 | E03 | **Pode deixar de existir:** a correção 4 da E03 (2026-10-15 a 18) fechou de fato as seis linhas abertas (V-INS-02 a V-INS-06 e V-ROT-02), e o registro ficou com 0 abertas e 1 tolerada por decisão (V-DEP-3, CP-03). Se a rodada 4 confirmar, esta pergunta sai da lista sem decisão sua. Pergunta original: O item "zero itens abertos" do G00 aceita linha de vermelho aberta, nomeada, com dono e prazo, ou o item fica como está? (Hoje são 6 linhas abertas; a correção 2 da E03 vai fechá-las ou trazê-las para dentro do teto de 5 dias da sua D2, então esta decisão só importa se sobrar alguma.) | `docs/evidencias-v2/G00/V2-F00-E03/VEREDITO.md`, rodada 2 | Rafael |
| H04 | E06 | Um agente de uma equipe pode anexar foto avulsa ao dossiê de uma ocorrência de outra equipe? E o teto de reservas de envio por pessoa: hoje um token de agente reserva o teto inteiro do município em segundos e trava o envio de foto dos colegas por até 30 dias (sem perda de dado, mas para a operação). A correção entra antes do piloto; a regra é sua. | `docs/evidencias-v2/G00/V2-F00-E06/VEREDITO.md`, achados | Rafael |
| H05 | E09 | A tecla Esc deve fechar a janela da senha temporária? (Hoje clicar fora não fecha, mas Esc fecha; quem fecha sem copiar perde a senha.) | `docs/evidencias-v2/G00/V2-F00-E09/VEREDITO.md` | Rafael |
| H06 | E10 | O administrador único do município não tem como recuperar a senha enquanto a recuperação está desligada em produção. Aceita assim até o CP-19 ou quer um caminho de suporte? | `docs/evidencias-v2/G00/V2-F00-E10/validacao/4b96ea7/qa.md` | Rafael |
| H07 | E11 | Município com acesso suspenso não consegue baixar o próprio pacote de saída (toda escrita confere a suspensão). É justamente o município em litígio que mais quer sair. Mantém? | `STATUS.md`, seção 11, "Achado novo da E11, município suspenso" | Rafael com jurídico |
| H08 | E13 | A barra de navegação de onze itens no celular continua rolando na horizontal. Menu "mais", abas, ou fica para a F10? | `docs/evidencias-v2/G00/V2-F00-E13/VEREDITO.md`, achados | Rafael |
| H09 | G00 | Aprovar o gate G00 e fazer o merge em master (commit de merge, nunca squash), quando o gatekeeper recomendar. Hoje NÃO está recomendado. | `docs/relatorios-v2/aprovacao/ROTEIRO-G00.md`, parte 3 | Rafael |
| H24 | E19 | Confirmar ou reverter a subida de cinco pacotes do Expo de 2026-10-14 (`expo` ~57.0.29, `expo-linking`, `expo-notifications`, `expo-router` e `expo-constants` pela árvore), feita por PREMISSA com o mesmo tratamento da sua D1 de 2026-10-13, porque o `expo-doctor` tinha voltado a 20 de 21. Reverter é `git revert 0e00875`. Em 2026-10-18 a deriva voltou (`expo` e `expo-router`, mais um patch) e a correção 5 da E19 subiu esses dois pelo mesmo tratamento, também por premissa (`docs/evidencias-v2/G00/V2-F00-E19/correcao-5/RESUMO.md`). Vale decidir também se esta deriva, que volta a cada patch do Expo, passa a ser tratada sempre assim. | `docs/evidencias-v2/G00/V2-F00-E19/correcao-4/RESUMO.md` | Rafael |
| H26 | E09 | A 320 px, o aviso "Sessões encerradas" cobre por cerca de 6 s o botão "Já anotei a senha" da janela da senha temporária, e tocar no texto do aviso aciona o botão escondido e fecha a janela (a senha temporária se perde). Dois validadores trataram como "corrige antes de crescer". Corrige já ou fica para a F10? | `docs/evidencias-v2/G00/V2-F00-E09/VEREDITO.md`, rodada 3, e `validacao/52952a1/acessibilidade.md` | Rafael |
| H28 | E01, E17, E18, E19, E21 | A sessão nova que valida não conseguiu ler o CI: o `gh` está sem login e o modo de permissão negou tirar o token da credencial do git (o caminho da H25 só funciona nesta sessão). Sem isso, a dimensão Infra e CI fica BLOQUEADA nessas cinco etapas em toda rodada. Rodar `~/.local/bin/gh auth login` no Mac (uma vez) resolve. | `docs/evidencias-v2/G00/V2-F00-E01/VEREDITO.md`, rodada 4 | Rafael |
| H29 | E04 | Uma escrita que já estava em andamento conclui até cerca de 223 ms depois de a conta ser desativada (8 de 8 no validador). Não quebra o critério escrito da E04, mas é a mesma família de defeito da E07. O conserto entra agora ou na F03-E03? | `docs/evidencias-v2/G00/V2-F00-E04/VEREDITO.md`, rodada 4 | Rafael |
| H30 | E24 | A frase do painel "Declarar a saída é um passo do aplicativo do agente" promete algo que o aplicativo ainda não faz; depende da sua decisão sobre a D-25 (H01). | `docs/evidencias-v2/G00/V2-F00-E24/VEREDITO.md`, rodada 4 | Rafael (e Alyson) |

## B. Texto de produto e percepção visual (gatilhos da seção 10 de `28`)

As frases foram aprovadas em 2026-10-13 por instrução ("faz tudo recomendado", D7 e D8), sem leitura individual. Ler continua sendo seu, mas não trava nada: se uma frase mudar, entra como correção.

| Código | Etapa | O que ver | Onde | Reprova se |
| --- | --- | --- | --- | --- |
| H10 | E05 | As três frases de sessão na entrada (conta desativada, sessão encerrada, papel alterado) | capturas em `docs/evidencias-v2/G00/validacao/4b96ea7/navegador/` e `V2-F00-E05/capturas/` | a frase não diz o que fazer, ou mistura "desativada" com "expirou" |
| H11 | E09 | A frase da senha única, as janelas de redefinir e encerrar sessões, Minha conta (depois da correção 2) | mesma pasta de capturas | botão fora da janela, frase confusa |
| H12 | E10 | As telas de "Esqueceu a senha?" e de redefinir (depois da correção 2, sem redirecionamento automático) | mesma pasta | frase diferente para e-mail que existe e que não existe |
| H13 | E11 | O botão "Baixar pacote de saída", o "Gerando" e a recusa | `V2-F00-E11/capturas/` e a pasta do navegador | 404, botão sem retorno, frase de erro sem saída |
| H14 | E13 | Digitar só o domínio, entrar e cair na tela do seu papel; as seis frases de confirmação (Toast) | pasta do navegador, capturas `E13-*` | "Esta página não existe" ou aviso por cima da barra |
| H15 | E14 | As frases finais da sessão encerrada no aplicativo ("Toque em Entrar de novo", "Nada é apagado") | `docs/evidencias-v2/G00/V2-F00-E14/` | frase confusa |
| H16 | E06 e E16 | As frases novas da pausa por senha provisória e as 12 frases que trocaram a promessa de segundo plano | `V2-F00-E06/correcao-1/RESUMO.md`, `V2-F00-E16/correcao-1/RESUMO.md` | alguma frase promete envio com o aplicativo fechado |
| H17 | E24 | A apresentação ajustada (depois da correção 2), antes de qualquer demonstração | `docs/apresentacao-produto-alyson.html` e `dc360/docs/apresentacao/2026-09-15-para-o-alyson.html` | promete saída a campo pronta |

## C. Aparelho físico (o que o emulador Android não prova)

O QA rodou o aplicativo no emulador Android (AVD `Medium_Phone_API_36.1`, APK do SHA) e provou ali a pausa da fila e a tarja de permissão; foi o emulador que achou o defeito da foto da E16. Fica aqui só o que depende de iPhone, de câmera real ou de Android físico.

| Código | Etapa | O que fazer no aparelho | Deve acontecer | Reprova se |
| --- | --- | --- | --- | --- |
| H18 | E16 | Depois da correção 2: iPhone e um Android real. Tirar foto na vistoria; abrir o teclado e tocar "Tirar foto" no primeiro toque; negar a câmera e tocar "Abrir os ajustes do aparelho"; ver o obturador acima da barra do sistema. Foto do aparelho para a pasta da etapa. | a foto entra na vistoria; o primeiro toque age; os Ajustes abrem; nada coberto | foto recusada, toque perdido, botão sob a barra |
| H19 | E15 | Começar uma vistoria com foto e assinatura e tocar "Sair da conta" (ler o diálogo); derrubar a sessão pelo painel e tocar "Entrar de novo" dentro da vistoria; concluir com GPS bom e ler "Precisão de 1 metro". | o diálogo conta o que se apaga; "Entrar de novo" preserva tudo | qualquer caminho apaga rascunho sem avisar |
| H20 | E06 | Depois da correção 2: coleta sem sinal, sinal de volta, e pelo painel redefinir a senha do agente antes da fila subir. | a fila pausa com frase clara, a faixa de cima diz que está pausada, a coleta sobe uma vez depois de definir a senha | "Tudo sincronizado" com coleta parada, coleta some ou duplica |

## D. Segunda pessoa, leitor de tela e profissionais externos

| Código | Etapa | O que | Quem | Por que não é de agente |
| --- | --- | --- | --- | --- |
| H21 | E05, E09, E10, E11, E13, E16 | Ouvir com leitor de tela real (NVDA ou VoiceOver no painel; TalkBack e VoiceOver no aplicativo) as frases, janelas, Toast e tarjas | pessoa com leitor de tela, idealmente com deficiência visual (CP-32) | a política não deixa agente substituir leitor de tela (seção 4 de `28`) |
| H22 | E25 | Restore a partir da produção Supabase com o esquema atual (o restore do CI e do banco local já está provado em Postgres 17.11 e 18.3) | Rafael ou segunda pessoa com acesso à produção (CP-07) | exige acesso à produção |
| H23 | E09, E10, E15 | Prazo de retenção de IP e user-agent de sessão, base legal do e-mail de recuperação e do dado de coleta, aviso de privacidade | Rafael com jurídico e DPO (CP-10, CP-11) | responsabilidade jurídica (seção 4 de `28`) |
| H27 | E25 | Uma segunda pessoa seguir o `dc360/docs/RESTORE-DO-BANCO.md` (versão 2, corrigido em 2026-10-15) do zero, em máquina limpa, de preferência com Postgres 17. O roteiro foi seguido à risca por agente em clones limpos no zsh e no bash; falta alguém que não conhece o sistema. | o próprio documento | Rafael ou segunda pessoa |

## E. Correções técnicas que NÃO esperam ninguém (só para você saber)

Não são pendências humanas; estão aqui porque não admitem risco aceito e você precisa saber que existem. Entram por etapa, sem decisão sua.

- `acolherNoAparelho` falha aberto entre pessoas se o SQLite falhar (vazamento entre agentes no mesmo aparelho, item 3). Anterior à F00; dono F14-E02; tem de estar corrigido antes de qualquer piloto. A rodada 3 achou uma forma nova: quando a limpeza falha no meio, a função devolve `apagou: true` com o rascunho ainda no disco, e a pessoa seguinte vê e envia o rascunho como seu (texto do morador exposto, fotos e assinatura apagadas). O bloco da F14-E02 ainda não pede falha fechada nem injeção de falha de disco: precisa ganhar esse critério antes de ser executado.
- `dc360/scripts/copiar-producao.mjs` faz `pg_dump` sem `--extension=pg_trgm`, que o roteiro de restore exige desde a migração 041: uma cópia de produção feita por ele não restaura além da 041. Achado pela varredura da E22 em 2026-10-15 e documentado em `dc360/docs/IMPLANTACAO.md`; nenhuma etapa do roadmap contém o conserto hoje (a F01-E15 não o cita). Entra por etapa, sem decisão sua, mas precisa de dono no roadmap.

## F. Resolvidos

| Código | Data | O que foi | Resultado |
| --- | --- | --- | --- |
| D1 a D8 | 2026-10-13 | Parte 1 do `ROTEIRO-G00.md` (Expo, prazo de teste pulado, perguntas da E03, isenções, D-25, CP-19, frases, tabela de documentação) | decididos por você; registro na seção 10 do STATUS |
| T1 a T6 | 2026-10-13 | Telas no navegador do `ROTEIRO-G00.md` | executados por agente nos três motores (Chromium, Firefox, WebKit) sobre o SHA `4b96ea7`; os defeitos achados viraram correção (E09, E10); prova em `docs/evidencias-v2/G00/validacao/4b96ea7/navegador/` |
| T7 a T9 (parte) | 2026-10-13 | Celular do `ROTEIRO-G00.md` | executados no emulador Android; o que o emulador não prova ficou em H18 a H20 |
| E07, E16, E19 (seção E) | 2026-10-14 | Correções técnicas que não admitem risco aceito | implementadas no candidato `7c97881`: sessão viva na disputa de renovação (E07, `3935c3f`, 0 em 180 disputas em Postgres real), foto recusada pela cópia assíncrona (E16, `48cf0fa`, dublê fiel; falta emulador), `auditar` sem auditar (E19, `2d8f8c1`, sai 2); a rodada 3 de validação é quem confirma |
| H25 | 2026-10-14 | Ler o CI deste Mac | o Rafael instalou o GitHub Desktop; a linha de comando `gh` 2.102.0 (binário oficial, checksum conferido) ficou em `~/.local/bin/gh` e lê o CI com a credencial que o git já usa (`GH_TOKEN` no processo do comando, sem login gravado, porque o token não tem `read:org`). Run 38615003055 lido: 9 de 9 verdes |
