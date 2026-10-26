---
validador: ux
modelo: claude-sonnet-5-5
etapa: V2-F00-E05
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
Capturas do agente independente em `<scratchpad>/web/capturas/` (scratchpad = `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad`), nome `E05-<tela>-<largura>-<tema>.png`. Li as imagens citadas. Sem shell nesta sessão (sem `git diff`); frases conferidas em `apps/web/src/paginas/Entrar.tsx` por `Grep`.

## Critérios verificados

Rodada 1: FAIL porque quem era desativado e voltava depois de 15 minutos via "sessão encerrada" e, ao entrar, "Email ou senha inválidos". A correção 1 devolve `conta_desativada` na renovação. Reteste pelo caminho de renovação (token vencido), que a rodada 1 não conseguiu capturar.

1. Visibilidade do estado (era o FAIL): o outro agente provou no navegador, três motores, que depois de desativar a pessoa cai na entrada com exatamente "Sua conta foi desativada. Entrar de novo não resolve: procure a coordenação do seu município. Nada do que você já registrou se perdeu." (a mesma que vejo nas capturas), em tom de perigo. Vi: `E05-entrada-conta-desativada-320-claro.png` e `E05-entrada-conta-desativada-1280-escuro.png`: aviso vermelho com ícone e texto, na largura do cartão, sem corte nem aperto a 320 px.
2. Sessão encerrada: `E05-entrada-sessao-encerrada-390-escuro.png`: "Sua sessão foi encerrada. Entre de novo para continuar de onde estava. Isso acontece quando o acesso é encerrado em outro aparelho, por quem administra o sistema, ou quando o seu cadastro muda. Nada do que já tinha sido gravado se perdeu." Em tom de alerta (amarelo), com ícone, 7 linhas a 390 sem estourar.
3. Janela de desativar: `E05-janela-desativar-usuario-vista-390-claro.png`: diz o efeito ("a pessoa perde o acesso agora... reativar devolve o acesso"), botão "Desativar Jonas Ferreira" cabe com borda inteira, "Cancelar" abaixo. Tela criada ou mexida por esta etapa: PASS (era quase colada na borda na rodada 1).
4. Recusa genérica ao tentar entrar com conta desativada: "inválidos", sem confirmar que a conta existe (segundo o outro agente, T3; não abri a captura `E05-entrada-recusa-generica-conta-desativada-*`).

Portão visual (seção 0 de `19`), item a item:
- Alinhamento: PASS (logo, título, aviso e cartão centralizados; aviso com a largura do cartão em 320, 390 e 1280).
- Espaçamento: PASS (respiro igual entre aviso e cartão).
- Nada fora do lugar: PASS (frase longa não estoura; sem rolagem horizontal).
- Hierarquia: PASS (primeira oração em negrito).
- Texto: PASS em grafia e sem travessão; ressalvas nos achados.
- Responsivo: 320, 390 e 1280 vistos por mim; 768 capturado pelo outro agente, não aberto. Zoom de 200 por cento não capturado.
- Temas, foco, contraste: claro e escuro vistos; contraste não medido por mim; estado nunca só por cor (ícone de alerta mais texto em negrito).
- Estados: erro desenhado em três motivos; vazio e carregando não se aplicam.
- Rafael aprova: as frases foram aprovadas por instrução de 2026-10-13 (D7); falta só ver as capturas.

Heurísticas de Nielsen: 1 (estado: diz por que caiu na entrada), 2 (mundo real: "procure a coordenação do seu município"), 5 (prevenção: confirmação da desativação diz o efeito), 6 (reconhecer: a pessoa não precisa lembrar o motivo), 9 (recuperar: diz o que fazer em cada um dos três casos).

## Evidência

Capturas lidas: `E05-entrada-conta-desativada-320-claro.png`, `E05-entrada-conta-desativada-1280-escuro.png`, `E05-entrada-sessao-encerrada-390-escuro.png`, `E05-janela-desativar-usuario-vista-390-claro.png` (todas em `<scratchpad>/web/capturas/`). Código: `Entrar.tsx` linhas 63 a 84. Não abri as capturas do implementador em `correcao-1/capturas/` (4 arquivos); a prova independente cobre o mesmo estado.

## Cenários positivos

- Desativar, esperar a renovação, gravar: cai na entrada com a frase de conta desativada.
- Coordenação encerra sessões: cai com a frase de sessão encerrada.

## Cenários negativos

- Entrar com a conta desativada: recusa genérica, sem frase de desativada.
- Conta reativada: "Reativar" não pergunta; a pessoa volta a entrar (outro agente).

## Tentativas de reprovar

- Procurei o caminho da rodada 1 (renovação de conta desativada): a frase de desativada aparece, a de encerrada não.
- Procurei texto cortado a 320 e 390 nas três frases: nada.
- Procurei a frase de desativada para quem foi só encerrado: não aparece.
- Procurei a causa "quando o seu cadastro muda" confrontada com o que a E07 faz: o outro agente provou (T4) que mudar o papel renova em silêncio, sem ir à entrada. Ver achado 1.
- Procurei travessão e erro de grafia: nada.

## Achados

1. Corrige antes de crescer (rodada 1, persistente): a frase de sessão encerrada ainda cita "quando o seu cadastro muda" (`Entrar.tsx` 74, `codigos-de-erro.ts` 73 com "ou o seu cadastro mudou"), mas depois da E07 a mudança de papel renova em silêncio e nunca leva a essa tela; o `GUIA-DO-COORDENADOR.md` (linhas 162 e 163) também lista "troca de papel" como causa. A causa citada está desatualizada. Dono: E05 e E07; texto de produto, quem decide é Rafael.
2. Anotado: "Nada do que você já registrou se perdeu" é incondicional; para agente com fila offline não enviada a E06 só garante pausa, não envio (rodada 1, mantido; frase aprovada em D7).
3. Anotado: a frase "Sua sessão expirou" não foi provocada nesta rodada (exige esperar o token vencer); vale a captura arquivada pelo implementador.

## Não verificado

- "Sua sessão expirou" no navegador.
- 768 px (capturado, não aberto), zoom de 200 por cento, leitor de tela, `role` do aviso, contraste medido.
- App de campo: a leitura da recusa no app não é da minha dimensão.
- Li 4 imagens desta etapa, de 938 do lote.

## Risco residual

Baixo. A promessa "nada se perdeu" é incondicional para quem tem fila local.

## Motivo do humano

Gatilhos da seção 10: texto de produto (três frases) e fluxo de erro crítico de sessão, em tela pública (entrada). O texto está aprovado por D7; resta Rafael ver as capturas e decidir o achado 1.
