---
validador: arbitragem (general-purpose, Opus)
modelo: claude-opus-5-5
etapa: V2-F00-E24
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: []
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: texto de produto do painel (QuemEstaEmCampo.tsx:191-194) vai a Rafael como pendência, sem travar a etapa
---

Arbitragem do conflito entre `ux.md` (FAIL) e `qa.md` (PASS) desta pasta. Os dois relatórios não foram alterados. Nível E2 obtido pela execução dos validadores (a captura do painel ligado à API real, feita pelo validador ux, foi aberta e lida por mim); E3a pela inspeção do código e dos documentos no SHA, feita por mim com `git show bb0f654:<caminho>` e `git grep ... bb0f654`, sem checkout.

**Decisão: PASS para a etapa, com o achado 1 do ux rebaixado a "corrige antes de crescer", dono Rafael (texto de produto), a registrar ao lado de H01 e H17.**

## Critérios verificados

Critério que decide (texto exato do bloco da etapa, `docs/roadmap-v2/03-fase-00-estabilizacao.md:710`):

- **"O que NÃO deve ser implementado nesta etapa:** a declaração no app (F14-E01); **mudança em API ou painel**; aceite e devolução, criptografia local e segundo plano (CP-24)."
- **"Definition of Done:** CP-02 registrado; **nenhum documento promete a declaração no app sem ressalva**; apresentação e PDF coerentes; item "K14" do G00 marcado."
- **"Risco de segurança:** promessa falsa de segurança física: alguém sobe o morro contando com um alerta que não existe; a ressalva precisa ser explícita, e **o guia diz que a tela "Quem está em campo" ficará vazia até a F14-E01**."

Leitura: o objetivo ("nada que se mostre ou entregue a município afirma que o agente declara a saída a campo no aplicativo enquanto isso não existir") é operado pela própria etapa por meio de documentos e apresentação, e a etapa previu a tela do painel de forma nominal: a mitigação prescrita para ela é o guia dizer que a tela fica vazia, não mudar a tela, que é proibido. Uma etapa não reprova por não ter feito o que o seu bloco proíbe fazer.

| Item | Resultado | Prova |
| --- | --- | --- |
| O app de campo tem passo de declarar saída? | NÃO. Em `dc360/apps/campo/src` (fora de `ios/` e `android/`) a única menção a `/saida-a-campo` é o comentário de `src/dados/api.ts:518`; o app só lê `emCampo` dos colegas (`api.ts:523`, `:651`; `app/(agente)/perfil.tsx:591`, `:1139-1141`). Nenhuma chamada a declarar, prorrogar, retorno ou `/minha` | `git grep -n -i -E "saida-a-campo\|emCampo\|declarar a sa\|prorrog\|/retorno" bb0f654 -- dc360/apps/campo` |
| O que a API oferece | Seis rotas em `dc360/apps/api/src/rotas/saida-a-campo.ts`: `POST /` (169), `POST /prorrogar` (431), `POST /retorno` (577), `GET /` (687), `POST /encerrar` (737), `GET /minha` (838); `GET /` devolve `limite` com a frase "Esta lista mostra o que os agentes declararam, e nada além" (721) | `git show bb0f654:dc360/apps/api/src/rotas/saida-a-campo.ts` |
| O que a tela do painel diz em cada estado | Sempre: título "Quem está em campo", subtítulo "O que os agentes declararam antes de sair, e o prazo de retorno que eles mesmos informaram" e aviso de limite ("não detecta queda, não sabe onde a pessoa está agora e não aciona ninguém sozinho"). Carregando: "Carregando quem está em campo". Erro: aviso de perigo. Vazio (191-195): "Ninguém declarou saída a campo. Declarar a saída é um passo do aplicativo do agente, feito na base e com sinal. Lista vazia significa que ninguém declarou, e não que ninguém está na rua." Com itens: cartão "N em campo, M com prazo estourado" | `git show bb0f654:dc360/apps/web/src/paginas/QuemEstaEmCampo.tsx` (155-200); captura do ux `e24-painel-quem-esta-em-campo-1280-claro.png`, conferida a olho: o texto renderizado é exatamente esse |
| A frase é anterior à etapa? | SIM. Entrou em `f72c244` (2026-09-14); último toque no arquivo em `bcb02c0` (2026-09-15); a E24 (2026-10-07) e a correção 2 não tocaram o painel | `git log -S"passo do aplicativo do agente" bb0f654 -- dc360/apps/web`; `git log bb0f654 -- .../QuemEstaEmCampo.tsx` |
| Documentos e apresentação tocados pela E24 | Todos ressalvados. Guia seção 9 (`GUIA-DO-COORDENADOR.md:215-222`): "Estado atual: a tela existe, mas fica vazia ... O aplicativo do agente ainda não declara a saída ... a tela fica vazia e o sino não vai avisar de prazo estourado nenhum. Tela vazia, hoje, não quer dizer que ninguém está no morro". `SEGURANCA-DO-AGENTE.md:10-13` com o mesmo quadro; seção 5 (:131) "O aplicativo de hoje não tem esta tela". Apresentação de 15/09, linha 394: selo Parcial, "hoje a tela "Quem está em campo" fica vazia e ninguém é avisado de nada"; linhas 391 e 498 ressalvadas; `apresentacao-produto-alyson.html:333`, `:381`, `:387` com "em construção" | `git show bb0f654:<arquivo>`, `git grep -n -i "quem está em campo" bb0f654 -- ...` |
| Pendência que cubra a frase do painel | Nominalmente, NENHUMA. `dc360/apps/web/PENDENCIAS.md` e `dc360/PENDENCIAS.md` não citam a tela; `docs/evidencias-v2/CP-02/decisao.md:31` descreve o painel como "Pronto" sem citar o texto do estado vazio. Por efeito, H01 cobre a demonstração ("Até lá, nenhuma demonstração a município mostra a saída a campo como pronta") e H17 cobre a leitura das apresentações | `docs/roadmap-v2/pendencias-humanas.md:19`, `:44`; grep nos PENDENCIAS |
| DoD "nenhum documento promete a declaração no app sem ressalva" | PASS (o painel não é documento; os documentos estão ressalvados, como o qa provou por grep e pelo verificador de ressalvas que morde) | `qa.md`; minha conferência acima |
| "o guia diz que a tela ... ficará vazia" | PASS, texto literal no guia seção 9 | `GUIA-DO-COORDENADOR.md:215-222` |
| "mudança em API ou painel" proibida | Respeitada: nenhuma mudança no painel; a correção que o ux pede no painel violaria o bloco | `git log` acima |

## Evidência

- Comandos (só leitura, no SHA, sem checkout): `git show bb0f654:dc360/apps/web/src/paginas/QuemEstaEmCampo.tsx`; `git show bb0f654:dc360/apps/api/src/rotas/saida-a-campo.ts`; `git grep ... bb0f654 -- dc360/apps/campo/src dc360/apps/campo/app dc360/packages/campo/src`; `git grep ... bb0f654 -- 'dc360/apps/campo/**' ':!**/ios/**' ':!**/android/**'`; `git show bb0f654:dc360/docs/GUIA-DO-COORDENADOR.md`; `git show bb0f654:dc360/docs/SEGURANCA-DO-AGENTE.md`; `git log -S"passo do aplicativo do agente" bb0f654 -- dc360/apps/web`; leitura de `docs/roadmap-v2/pendencias-humanas.md`, `docs/roadmap-v2/STATUS.md` (linhas 148, 276, 615), `docs/evidencias-v2/CP-02/decisao.md`, `docs/roadmap-v2/10-campo-reinspecao.md` (bloco da V2-F14-E01) e `docs/roadmap-v2/28-execucao-e-validacao.md` seções 4, 7, 8 e 15. Todos com código 0 (os de grep com saída), sem arquivo gerado.
- Captura lida: `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/ux-E11-E13-E24/capturas/e24-painel-quem-esta-em-campo-1280-claro.png` (produzida pelo validador ux, painel de `bb0f654` com a API real).
- Relatórios arbitrados: `ux.md` e `qa.md` desta pasta.

## Cenários positivos

- O bloco da V2-F14-E01 (`10-campo-reinspecao.md:380-403`) é o lugar que torna a frase do painel verdadeira: "CRIAR (cliente e telas; API e painel MANTER); D-25 decidiu implementar", com "Documentação: tirar a ressalva da F00-E24". Sob a D-25 vigente (premissa), o painel descreve o fluxo que será entregue e não precisa mudar.
- A própria tela, no mesmo estado vazio, já desfaz o risco físico que a etapa existe para evitar: "Lista vazia significa que ninguém declarou, e não que ninguém está na rua", mais o aviso de limite no topo em todos os estados.
- O documento que acompanha a tela (guia seção 9) diz o estado real com a ressalva explícita que o bloco pede.

## Cenários negativos

- A frase "Declarar a saída é um passo do aplicativo do agente" é falsa no presente para o app de `bb0f654` (provado acima). O achado do ux é real: isso não está em disputa.
- Nenhum registro nominal da frase existe em pendência, CP-02 ou guia (o guia fala da tela vazia, não do texto do estado vazio).
- Se Rafael e Alyson reverterem a D-25 (alternativa B, retirar), a frase do painel passa a prometer algo que nunca virá e tem de mudar; isso é decisão de produto ainda aberta (H01).

## Tentativas de reprovar

1. Tentei sustentar o FAIL pelo objetivo: "nada que se mostre ou entregue a município". O painel se mostra, então o objetivo, lido sozinho, alcançaria a frase. Mas o mesmo bloco proíbe "mudança em API ou painel" e define o DoD e os testes positivos e negativos só sobre documentos, Grep, cartão, apresentação e PDF. Nenhum dos cinco campos de teste nem o DoD alcança texto de tela. O objetivo é atingido pelos meios que a etapa autoriza; pedir mais seria reprovar a etapa por não violar o próprio escopo.
2. Tentei reprovar pela ausência de qualquer menção documental: o bloco exige que "o guia diz que a tela "Quem está em campo" ficará vazia até a F14-E01". O guia seção 9 diz isso literalmente e acrescenta que o aplicativo ainda não declara a saída, o que corrige o que a frase da tela afirma para quem lê o guia. A exigência documental sobre a tela está cumprida.
3. Procurei se a E24 introduziu ou piorou a frase: não, a frase é de `f72c244` (14/09), anterior à etapa e à auditoria que a criou; não há regressão.
4. Procurei outra superfície do app que prometesse o passo: o app não tem nenhum texto de declarar, prorrogar ou confirmar retorno (grep acima). O "Ninguém em campo agora" do Perfil, anotado pelo qa, é consequência da mesma lacuna e também é tela, fora do escopo.
5. Conferi se a frase cai em critério que não admite risco aceito (seção 7 de `28`, itens 1 a 11): não cai (não é isolamento, autenticação, vazamento, trilha, fila offline, documento emitido, dependência, nem condição de gate). Ela é texto de produto, que a seção 4 mantém humano.
6. Conferi se o conflito precisa ir a Rafael como BLOCKED (seção 7, "persistindo, BLOCKED para Rafael"): não persiste, porque o veredito da E24 é o mesmo qualquer que seja a decisão de Rafael sobre a frase; a decisão dele muda o painel (outra etapa ou emenda), não os critérios da E24.

## Achados

1. **Corrige antes de crescer (rebaixado do FAIL do ux).** `dc360/apps/web/src/paginas/QuemEstaEmCampo.tsx:191-194`, estado vazio: "Declarar a saída é um passo do aplicativo do agente, feito na base e com sinal." O app de `bb0f654` não tem esse passo. Reprodução: abrir "Quem está em campo" como coordenador com zero saídas (captura do ux citada em Evidência). Por que não reprova a E24: o bloco proíbe "mudança em API ou painel", o DoD é sobre documentos, e a mitigação que o bloco prescreve para esta tela (o guia dizer que ela fica vazia) está feita. Dono: Rafael, por ser texto de produto e depender da decisão de produto H01 (D-25). Opções dele: manter a frase (verdadeira quando a V2-F14-E01 entregar, sob a D-25), emendar uma etapa para trocar a frase até lá, ou trocá-la se a D-25 for revertida. Prazo: antes de qualquer demonstração a município que abra esta tela (já condicionada por H01 e H17), e no mais tardar na V2-F14-E01. Recomendação ao gatekeeper: registrar a frase nominalmente junto de H01 ou H17 em `pendencias-humanas.md`, porque hoje nenhum registro a cita.
2. **Anotado (do qa, mesma classe, fora do escopo):** `dc360/apps/campo/src/app/(agente)/perfil.tsx:1139-1142` mostra sempre "Ninguém em campo agora". Dono: V2-F14-E01 ou Rafael (texto de produto).
3. **Anotado (do ux, anterior à etapa):** divisória do rodapé do cartão "Coordenador" 14 px acima das outras na apresentação do Alyson a 1280 px; não arbitrado aqui, não é objeto do conflito.

## Não verificado

- Não abri o painel nem o aplicativo eu mesmo; o texto renderizado vem da captura do ux, conferida contra o código-fonte no SHA.
- Não reexecutei testes, grep amplo dos documentos nem a extração do PDF: são do qa e não estavam em disputa.
- A confirmação da D-25 por Rafael e Alyson (H01) e a leitura das apresentações (H17).
- CI do SHA não lido (ver `ci_run`).

## Risco residual

Baixo para segurança física: a tela vazia diz que lista vazia não significa ninguém na rua, o aviso de limite fica em todos os estados, e o guia e a apresentação dizem que o aplicativo ainda não declara. Médio para credibilidade em demonstração: quem vir a tela sem ler o guia ouve que o app tem um passo que ainda não tem; contido por H01 (nenhuma demonstração mostra a saída a campo como pronta) até Rafael decidir a frase.

## Motivo do humano

- Texto de produto e decisão de produto (seção 4 de `28`): Rafael decide o destino da frase do estado vazio de "Quem está em campo" (achado 1), que depende de confirmar ou reverter a D-25.
- Já registrado e mantido: H01 (Rafael e Alyson confirmam ou revertem a D-25, CP-02) e H17 (leem as apresentações ajustadas antes de qualquer demonstração).
- Captura que Rafael precisa olhar: `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/ux-E11-E13-E24/capturas/e24-painel-quem-esta-em-campo-1280-claro.png`.
