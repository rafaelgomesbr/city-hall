---
validador: ux
modelo: claude-opus-5-5
etapa: V2-F00-E11
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [UI, A11Y, LGPD]
nivel_de_prova_exigido: [E2, E3b]
nivel_de_prova_obtido: [E2, E3b]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Superfície que a etapa toca: o cartão "Saída de município" da tela Organização (`apps/web/src/paginas/Organizacao.tsx`, `CartaoDeSaida`) e a frase de rede de `SemConexao` na forma `"arquivo"` (`apps/web/src/dados/http.ts`). Entre `bb0f654` e `4ce0433` nada mudou em `apps/web/src` além de um comentário em `busca/pontuador.ts` (`git diff bb0f654..4ce0433 -- dc360/apps/web`), mas as capturas abaixo são todas novas, tiradas por mim no SHA.

DoD e campos de teste que tocam UX:

| Critério | Prova | Resultado |
| --- | --- | --- |
| Botão baixa o ZIP de fato, contra a API real, em dois navegadores | download real pelo clique em Chromium (8 combinações de largura e tema), Firefox e WebKit (claro e escuro): nome `dc360-pacote-de-saida-2026-10-19.zip`, assinatura `PK`, `failure()` nulo; Firefox 250208 e 250359 bytes, WebKit 250508 e 250645 bytes (`e11-saida.txt`) | PASS |
| Carregando: "Gerando" e desabilitado | pedido real segurado por `route`: botão "Gerando", `disabled: true`, 44 px, em 1280, 768, 390 e 320, claro e escuro; depois do download volta a "Baixar pacote de saída" | PASS |
| Recusa mostra a frase da API | 403 `sem_permissao` com o corpo REAL tirado da API para a coordenadora ("Seu perfil não tem permissão para alterar os dados do município."); `acesso_suspenso` com a frase do catálogo; rede caída: "Sem conexão com o servidor. O arquivo não foi baixado. Verifique o sinal e tente de novo." | PASS (ver Achados 1 sobre o verbo "alterar") |
| A recusa não derruba a sessão e o botão volta a funcionar | depois de cada erro o botão fica habilitado; nova tentativa após a queda de rede baixa e o aviso some (`aviso: null`) | PASS |
| `/pacote.zip` na raiz é 404 | `curl -X POST /pacote.zip` com token: 404 | PASS |
| Coordenador (sem `gerenciar_organizacao`) | pela API: 403 `sem_permissao`; pela tela, digitando `/organizacao`: "Seu perfil não tem acesso a esta tela. Se você precisa dela para trabalhar, peça a quem administra o município do seu órgão." e o cartão não aparece | PASS |

Portão visual (seção 0 de `19`), item a item, sobre as capturas `ux-saida-*`:

- Alinhamento: PASS. Parágrafo, aviso e botão alinhados à mesma margem esquerda do cartão; o aviso ocupa a largura útil do cartão; nada sai do cartão (`transbordos: []` em todas as 40 medições).
- Espaçamento: PASS. Parágrafo para botão 14 px; parágrafo para aviso 14 px e aviso para botão 16 px, iguais em todas as larguras e temas; nada grudado.
- Nada fora do lugar: PASS no cartão. Sem rolagem horizontal da página (`rolagemPagina: 0` em 1280, 768, 390 e 320); rolando até o fim, a base do cartão fica 16 px acima da barra do rodapé (320: 545 contra 561; 390: 749 contra 765), captura `ux-saida-erro-suspenso-fim-da-pagina-320-claro.png`. A frase mais longa (suspenso) quebra em seis linhas a 320 px sem cortar palavra.
- Hierarquia: PASS. Título do cartão, texto auxiliar em `--ds-text-muted`, aviso de perigo com ícone, botão secundário com ícone.
- Texto bem escrito: PASS para o que a etapa escreveu ("O arquivo não foi baixado. Verifique o sinal e tente de novo.", que diz o que fazer); sem travessão; acentos corretos. A frase de 403 é da API (Achados 1).
- Responsivo: PASS em 1280, 768, 390 e 320 px. Zoom de 200 por cento não medido (Não verificado).
- Dois temas, foco, estado nunca só por cor: PASS. Claro e escuro completos; erro com ícone de alerta mais texto; carregando por texto ("Gerando") e não só pelo cinza.
- Estados vazio e de erro desenhados: o cartão não tem estado vazio (sempre há o que baixar); os três erros têm a mesma qualidade do normal.
- Rafael vê e aprova: pendente (Motivo do humano).

Heurísticas de Nielsen aplicadas ao cartão: visibilidade do estado (botão muda para "Gerando" e trava; o download aparece na barra do navegador; não há confirmação própria na tela, o que é aceitável porque o navegador mostra o arquivo); correspondência com o mundo real ("pacote de saída", "baixar não apaga nada"); controle e liberdade (erro não prende, nova tentativa funciona); prevenção de erro (segundo clique bloqueado durante a geração); reconhecer e recuperar de erros (rede: diz o que houve e o que fazer; suspenso: diz a quem procurar; sem permissão: diz o que houve, não o que fazer, ver Achados 1).

## Evidência

Ambiente: worktree esparso de `4ce0433` em `.../scratchpad/val/L08-ux/wt` (node_modules por link simbólico), API `npx tsx src/index.ts` na porta 3791 com banco em memória semeado (Serra Alta e Vale Fundo), painel construído com `VITE_API_URL=http://127.0.0.1:3791` (código 0) e servido por `vite preview` na 4791.

- `node e11.mjs <capturas> e11-saida.txt`: código 0. Saída: `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L08-ux/e11-saida.txt`.
- `node e11b.mjs` (fim da página a 320 e 390): `.../L08-ux/e11b-saida.txt`.
- `node wk.mjs` (erros de página do WebKit): `.../L08-ux/wk-saida.txt`.
- Capturas (todas abertas, individualmente ou em folha de contato `.../L08-ux/folhas/e11-*.png`), em `docs/evidencias-v2/G00/V2-F00-E11/validacao/4ce0433/capturas/`:
  - `ux-saida-{normal,carregando,erro-sem-permissao,erro-suspenso,erro-rede}-{1280,768,390,320}-{claro,escuro}.png` (40)
  - `ux-saida-coordenadora-sem-acesso-{1280,390}-{claro,escuro}.png` (4)
  - `ux-saida-depois-do-download-{firefox,webkit}-1280-{claro,escuro}.png` (4)
  - `ux-saida-erro-suspenso-fim-da-pagina-{320,390}-claro.png` (2)

## Cenários positivos

- Administradora baixa o pacote pelo botão em Chromium, Firefox e WebKit, nos dois temas; nome e assinatura conferem.
- "Gerando" aparece e o botão trava enquanto o pedido real está segurado; volta ao normal depois.
- Nova tentativa depois de erro de rede baixa e limpa o aviso.

## Cenários negativos

- Coordenadora: 403 real da API; na tela, `/organizacao` mostra a recusa de tela, sem o cartão.
- Município suspenso: frase de contrato no cartão, sem derrubar a sessão.
- Rede caída: frase de arquivo, e não de formulário.
- `/pacote.zip` na raiz: 404.

## Tentativas de reprovar

- Larguras que a etapa não pede (768 e 320) para achar corte ou aviso saindo do cartão: nada; medido por retângulo de todo descendente do cartão.
- Frase mais longa (suspenso) a 320 px: quebra limpa em seis linhas, sem palavra partida.
- Rolar até o fim a 320 e 390 px para ver se a barra do rodapé esconde o botão: 16 px de folga.
- Terceiro motor (WebKit) para o download: baixou.
- Clicar de novo depois do erro: funciona, o aviso some.
- Entrar como coordenadora e digitar a rota: recusa de tela correta.
- Procurar erro de console: só os 403 e o `ERR_FAILED` que eu mesmo provoquei, e erros de página no WebKit (Achados 3), fora do cartão.

## Achados

1. corrige antes de crescer (fora do escopo, já registrado): a frase de 403 que o cartão mostra é "Seu perfil não tem permissão para alterar os dados do município." O verbo fala em "alterar" onde a pessoa quis baixar, e a frase não diz a quem pedir. Reprodução: `POST /saida/pacote.zip` com o token da coordenadora (`e11-saida.txt`, primeira linha) e captura `ux-saida-erro-sem-permissao-390-claro.png`. Não reprova a etapa porque a frase é emitida por `exigirPermissao` na API, que a etapa manda só ler (`apps/api/src/rotas/saida.ts` "só para leitura"), e a etapa pede justamente mostrar a frase da API; está em `dc360/apps/web/PENDENCIAS.md` 8.3 com dono F03. Só aparece se o papel mudar com a tela aberta.
2. anotado (fora do escopo): a 320 px o campo de busca do topo mostra "Buscar registro ou funç" cortado pelo atalho (captura `ux-saida-normal-320-claro.png`). É `BuscaGlobal`, que a etapa não toca.
3. anotado (fora do escopo): no WebKit, recarregar uma tela do painel com pedidos em voo gera 6 erros de página "due to access control checks" (`wk-saida.txt`); não acontece antes da navegação e não afeta o cartão. É o carregamento do painel, não da E11.

## Não verificado

- Zoom de 200 por cento.
- Município suspenso de verdade (o e2e também não suspende): a frase veio por interceptação, com o texto do catálogo.
- 401 que renova: é critério de QA e foi provado pela seção 28 do e2e na rodada anterior; não repeti.
- Abrir o ZIP num descompactador de sistema (é a validação humana).

## Risco residual

Baixo para a interface. O cartão é pequeno e estável em todas as larguras; o único texto discutível é o da API (Achados 1), já com dono.

## Motivo do humano

A validação humana da etapa: Rafael baixa o pacote pelo painel com a API local e abre o ZIP. Gatilhos visuais pelo diff da etapa: "fluxo de erro crítico" (recusas de permissão e de rede no cartão) e "texto de produto" ("O arquivo não foi baixado"). Capturas que Rafael precisa ver: `ux-saida-carregando-390-claro.png`, `ux-saida-erro-sem-permissao-390-claro.png`, `ux-saida-erro-suspenso-320-escuro.png`, `ux-saida-erro-rede-1280-claro.png`, e decidir se a frase do Achado 1 pode esperar a F03.
