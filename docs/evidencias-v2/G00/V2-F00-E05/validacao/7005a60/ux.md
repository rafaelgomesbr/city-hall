---
validador: ux
modelo: claude-sonnet-5-5
etapa: V2-F00-E05
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: gatilho visual (texto de produto novo e fluxo de erro crítico de sessão)
---
Capturas citadas ficam em `<scratchpad>/g00/capturas-ux/` (prefixo `e05-`, geradas por agente de apoio com API real e painel no SHA 7005a60; ver `indice.md`), salvo as marcadas "impl." (`docs/evidencias-v2/G00/V2-F00-E05/capturas/`). Execução no navegador feita por agente de apoio a meu pedido; as capturas foram lidas por mim.

## Critérios verificados

Heurísticas de Nielsen sobre as três frases da entrada (`Entrar.tsx` 63 a 84) e o caminho que leva a cada uma.

1. Visibilidade do estado: FAIL no caminho comum. A captura prova só a janela dos 15 minutos (token de acesso vivo): `e05-entrada-conta-desativada-390-claro.png`, `e05-entrada-sessao-encerrada-390-claro.png`. A renovação (token vencido), que é o caso do agente sem sinal e da aba parada, não foi capturada, mas o código no SHA confirma o `qa.md` (FAIL): desativar revoga as sessões antes, `sessao_por_token` não devolve a revogada, e `servico.ts` 622 a 624 responde `sessao_encerrada`; o ramo `ContaDesativada` (627 a 636) só é alcançável com sessão não revogada, estado que o produto não produz. Resultado para a pessoa: vê "Sua sessão foi encerrada", entra de novo e recebe "Email ou senha inválidos".
2. Correspondência com o mundo real e clareza: PASS nas três frases. "Entrar de novo não resolve: procure a coordenação do seu município" dá ação concreta (`e05-entrada-conta-desativada-390-escuro.png` mostra a frase mais o erro de credencial em `e05-entrada-conta-desativada-tenta-entrar-de-novo-390-escuro.png`: consistente, a pessoa não é enganada quando a frase aparece).
3. Honestidade da promessa: "Nada do que você já registrou se perdeu" é incondicional. Para agente com fila offline não sincronizada, a E06 só garante pausa, não envio. Rafael decide o texto.
4. Reconhecer e recuperar do erro: a frase de "encerrada" cita "quando o seu cadastro muda" (`e05-entrada-sessao-encerrada-1280-escuro.png`). Depois da E07 mudar papel dá `nao_autenticado` e renova em silêncio, então a causa ficou desatualizada; e a frase não cobre a senha provisória vencida, que também usa `sessao_encerrada`.
5. Prevenção de erro na origem: a confirmação de desativar (`e05-usuarios-confirmar-desativar-conta-390-claro.png`) diz o efeito ("sessões dela caem e o aplicativo de campo para de sincronizar", "reativar devolve o acesso"): boa. Mas o botão "Desativar Marcos Vinicius Teles" encosta na borda direita da janela a 390 px; ver 8.
6. Nunca só por cor: PASS. Ícone de alerta mais texto em negrito nas três (`e05-entrada-sessao-expirou-390-claro.png`, `...-desativada-390-claro.png`, `...-encerrada-1280-escuro.png`); a de desativada em tom de perigo e as outras em alerta.
7. Entrada sem motivo: `e05-entrada-nao-autenticado-link-profundo-390-claro.png` mostra a entrada limpa, sem frase, correto (nenhuma sessão acabou). O ruído "Todos os campos são obrigatórios, exceto os marcados como opcional" aparece sem campo opcional (anotado).
8. Portão visual (seção 0 de `19`), item a item sobre as 12 capturas do lote (li 8 delas: 390 claro e escuro, 1280 claro e escuro):
   - Alinhamento: PASS. Logo, título, aviso e cartão centralizados, largura do aviso igual à do cartão.
   - Espaçamento: PASS. Respiro uniforme entre aviso e cartão; nada grudado.
   - Nada fora do lugar: PASS na entrada (frase de 7 linhas em 390 não estoura; sem rolagem horizontal). Na janela de confirmação de desativar, o botão de nome longo quase encosta na borda; o corte real aparece na E09.
   - Hierarquia: PASS. Negrito na primeira oração do aviso, rótulos fortes, botão principal em destaque.
   - Texto: PASS em português e grafia, sem travessão. Ressalvas dos itens 3 e 4.
   - Responsivo: 1280 e 390 provados; 320 px, 768 px e zoom de 200 por cento NÃO capturados.
   - Temas, foco, contraste: os dois temas completos nas capturas; contraste AA e foco não medidos por mim. `role` do aviso não verificado.
   - Estados: vazio não se aplica; erro desenhado (três motivos). Carregando não se aplica.
   - Rafael aprova: pendente.

## Evidência

- Capturas lidas: `e05-entrada-conta-desativada-390-claro.png`, `e05-entrada-conta-desativada-390-escuro` (via "tenta-entrar-de-novo-390-escuro"), `e05-entrada-sessao-encerrada-1280-escuro.png`, `e05-entrada-sessao-expirou-390-claro.png`, `e05-usuarios-confirmar-desativar-conta-390-claro.png`, `e05-entrada-nao-autenticado-link-profundo-390-claro.png`.
- Código: `Entrar.tsx` 50 a 100, `servico.ts` 610 a 641. `qa.md` da E05 (FAIL, com reprodução E2 própria).
- Simulado: sessão expirada por troca de token no navegador (resto real); desativada e encerrada pelo painel real.

## Cenários positivos

- Coordenação encerra sessões, a pessoa tenta a primeira escrita e cai na entrada com a frase de encerrada.
- Coordenação desativa com o token vivo: frase de desativada, recusa genérica ao tentar entrar de novo.

## Cenários negativos

- Conta desativada com token de acesso vencido: não capturado; reprovado por código e pelo `qa.md`.
- Link profundo sem sessão: entrada sem frase (correto).

## Tentativas de reprovar

- Procurei o caminho que o e2e e a captura não cobrem (desativar e esperar o token vencer): o código manda a `sessao_encerrada`. Reprovou.
- Procurei a frase de desativada aparecendo para quem foi encerrado: não.
- Procurei texto cortado a 390 px nas entradas: nada.
- Procurei travessão e erro de grafia: nada.

## Achados

1. bloqueia: quem foi desativado e volta depois de 15 minutos não é informado; vê "sessão encerrada" e, ao entrar, "Email ou senha inválidos". Reprodução: desativar por `PATCH /usuarios/:id/situacao`, esperar o token vencer, usar o painel (`qa.md`). Dono: E05. A solução (devolver `conta_desativada` a quem apresenta renovação revogada) precisa de decisão de segurança sobre vazamento de estado.
2. corrige antes de crescer: "quando o seu cadastro muda" desatualizada pela E07.
3. anotado: promessa incondicional de que nada se perdeu (fila offline).
4. anotado: erro de console `GET /ocorrencias/devolvidas` 403 a cada carga do painel do operador (aparece nos eventos de `e05-entrada-sessao-expirou`). Fora desta etapa; ver `V2-F00-E08/.../ux.md`.

## Não verificado

- Fluxo real de desativada com renovação (por isso o FAIL repousa em código e QA, não em captura).
- 320 px, 768 px, zoom 200 por cento, leitor de tela, `role` do aviso, contraste medido, app de campo.
- Li 6 das 12 imagens distintas do lote (as demais são o mesmo estado em outra largura ou tema).

## Risco residual

Pessoa desativada sem explicação, e agente de campo sem saber por que não sincroniza.

## Motivo do humano

Gatilhos disparados pelo diff: texto de produto novo (três frases) e fluxo de erro crítico de sessão. Rafael aprova as frases (E4).
