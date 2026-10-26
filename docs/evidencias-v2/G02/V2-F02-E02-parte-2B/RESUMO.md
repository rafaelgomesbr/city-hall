# V2-F02-E02 e V2-F02-E03 (parte 2B, aplicativo de campo): base /v1 e a fila pela categoria do erro

## Fatos

**Autoria.** O código foi escrito pelo Codex (sem rodar testes nem commitar) e revisado, corrigido, testado e commitado pelo finalizador (Claude Opus). A revisão desfez cinco mudanças de semântica da fila que o Codex introduziu (ver "O que mudou na revisão").

**O que mudou (só `dc360/`):**

- `apps/campo/src/dados/api.ts`: `ORIGEM` (o `extra.apiUrl`, sem barras finais) separada de `BASE = ORIGEM + "/v1"`. `enderecoDaApi()` devolve a base (é ela que vai para `obterFila(...)` e para o `transporteHttp`, e para `rota.ts`, `mapa.ts` e `historico-da-casa.ts`); `enderecoDaApi("origem")` devolve só a origem. Origem vazia continua vazia (sem pedido relativo a `/v1`). O `/v1` é concatenado no código; `eas.json` e `app.config.ts` não mudam. `ErroDaApi` ganha `categoria` (aditivo, pelo código do catálogo com o status como padrão; nenhuma tela decide por ela nesta etapa). Corpo de erro que é JSON mas não objeto (ex.: `null`) vira `{}` em vez de estourar.
- `apps/campo/src/app/entrar.tsx` e `apps/campo/src/app/(agente)/perfil.tsx`: mostram a origem, não a base.
- `packages/campo/src/transporte.ts`: a decisão de 401 e 403 passa a ler a CATEGORIA do catálogo (`categoriaDoErro` de `@dc360/shared`, só pelo `erro`) no lugar da ação de `acaoParaOCodigo`, sempre DENTRO do status. `baseUrl` continua parâmetro (o pacote não acrescenta `/v1`).
- `apps/campo/src/dados/falha-de-atualizacao.ts`: SEM mudança no fim (a versão do Codex foi desfeita).
- `apps/campo/LEIA-ME.md` e `README.md` (parágrafo "O aplicativo de campo em `/v1`"): origem na configuração, `/v1` no código, URL assinada intacta, ordem de implantação (API primeiro) e o comportamento da fila.
- Testes: `packages/campo/test/categorias-do-transporte.test.ts` (novo, 23 casos), `apps/campo/src/dados/api-v1-e-categorias.test.ts` (novo, 12 casos), 1 caso novo em `obter-fila-uma-so.test.ts` (a base do aplicativo chega à fila com `/v1`, sem `//v1`, e a fila pausada mantém o item), e quatro testes existentes só com o caminho esperado trocado para `/v1` (`api-aparelho`, `api-avisos`, `mapa-de-base`, `rota`).
- Contagens: chave `V2-F02-E02-parte-2B` em `MUDANCAS_DO_TESTE_CAMPO_PACOTE_POR_ETAPA` (23) e em `MUDANCAS_DO_TESTE_CAMPO_APP_POR_ETAPA` (13); README (261 do pacote, 2010 do aplicativo, `npm test` 4221), `COLOCAR-DE-PE.md` (6231) e `apps/campo/LEIA-ME.md` (261).

## Tabela final: categoria para ação da fila

A categoria vem do `erro` pelo catálogo (`packages/shared/src/erros.ts`). A `categoria` que o servidor venha a mandar no corpo NÃO governa a fila (teste próprio). A categoria decide dentro do status, nunca por cima dele.

| Status | Categoria do `erro` | Ação da fila |
| --- | --- | --- |
| rede fora, tempo esgotado | (nenhuma) | Temporário: item pendente, adiado, sem teto de tentativas. |
| 5xx, 429 | qualquer (o catálogo hoje põe todos em `aguardar`) | Temporário: item pendente, adiado. |
| 401 | `reentrar` (`sessao_encerrada`, `credenciais`) | Pausa sem gastar a renovação; itens intactos. |
| 401 | `renovar` (`nao_autenticado`), outra categoria, ou código desconhecido ou ausente | Renova UMA vez e repete o mesmo pedido (mesmo corpo, mesma chave de idempotência); token igual ou nova recusa: pausa, itens intactos. |
| 403 | `conta_desativada` (`permanente` no catálogo, lido pelo código) | Pausa: a conta foi recusada, não a coleta. |
| 403 | `reentrar` (`troca_de_senha_obrigatoria`) | Pausa até a pessoa definir a senha. |
| 403 | `aguardar` (`acesso_suspenso`) | Temporário. |
| 403 | `permanente` (`sem_permissao` e afins), `renovar` (`assinatura`) ou desconhecido | Item bloqueado com código; descarte só pela tela. Não renova o token. |
| outro 4xx | qualquer, inclusive `autor_divergente` (`reentrar`), `tarefa_no_prazo` e `envio_pendente` (`aguardar`) | Item bloqueado com código e campos, ou arquivado se a coleta ficou sem destino (`ja_encerrada` e afins). Descarte só pela tela. |
| `PUT` na URL assinada | (status do armazenamento) | Sem mudança: 403 temporário (pede outra URL), 5xx e 429 temporários, outro 4xx permanente; sem `/v1` e sem token. |

Nenhuma linha apaga item. A única diferença de comportamento em relação à base (`257bd42`) é o 401 `credenciais` (também `reentrar`), que não chega às rotas da fila e agora pausa sem gastar a renovação rotativa.

## O que mudou na revisão do código do Codex, e por quê

O Codex fez a categoria decidir POR CIMA do status. Cada mudança de semântica foi conferida contra o catálogo, contra o texto da E03 ("as mensagens ao usuário não mudam"; status e `erro` da API não mudam) e contra os comentários da própria API:

| Mudança do Codex | Decisão | Motivo |
| --- | --- | --- |
| "corrigir em 401 bloqueia o dado" | VOLTOU ao de hoje (401 renova uma vez e pausa) | Um 401 é da sessão, nunca do dado. Bloquear põe "Descartar" ao lado de uma coleta boa, que é exatamente o defeito que a V2-F00-E06 fechou. Nenhum código `corrigir` sai com 401 hoje. |
| "permanente mantém o bloqueio" (em 401) | VOLTOU para o 401; mantido para os outros 4xx | Em 4xx comum o comportamento já era bloquear e continua igual. Mas o 401 `senha_provisoria_vencida` (`permanente`) virava item bloqueado em vez de pausa. |
| "renovar em 403 renova" | VOLTOU (renovação só no 401) | O único `renovar` em 403 é `assinatura`, que pede URL assinada nova, e não token novo; renovar gastaria o token de renovação rotativo contra um servidor que disse que o token vale. |
| "aguardar em 401 é temporário" (e aguardar em 409) | VOLTOU | 401 continua sessão. Os 409 `aguardar` (`tarefa_no_prazo`, `envio_pendente`) foram escolhidos pela API para bloquear o item com saída pela tela; o comentário de `rotas/sincronizacao.ts` diz que "repetir sozinho não adiantaria enquanto o prazo não vence". Repetir sem teto seria laço de bateria. |
| "reentrar em 409 pausa" | VOLTOU (bloqueia só o item) | `autor_divergente` é a coleta de OUTRA pessoa no aparelho (troca de turno). Pausar a fila inteira pararia também as coletas de quem está no aparelho; a API (`rotas/evidencias.ts`, `rotas/sincronizacao.ts`) diz que o 409 existe para cair em `FalhaPermanente` e esperar a conta de quem fez a coleta. |
| 5xx e 429 decididos pela categoria do código | VOLTOU (o status manda) | Com o código do Codex, um 503 com código `permanente` virava coleta recusada. Hoje o catálogo não tem esse caso, mas o teste "5xx com código de outra categoria" reprova o código do Codex. |
| `falha-de-atualizacao.ts` lendo a categoria | VOLTOU inteiro | Mudava a frase mostrada ao agente (401 de categoria não sessão virava "tenta de novo"; 409 `autor_divergente` virava "sessão encerrada"), contra "as mensagens ao usuário não mudam". |
| Base `/v1`, origem nas telas, `ErroDaApi.categoria`, corpo JSON não objeto | MANTIDO | Escopo da E02 e leitura aditiva da E03, sem efeito de comportamento. |
| Testes do Codex | Reescritos onde afirmavam a semântica desfeita | Os casos de não regressão (renovação única, token igual, 401 sem corpo, arquivamento, conta desativada, URL assinada, base com e sem `/v1`) foram mantidos. |

## Prova de mordida

`saidas/12-mordida.txt`: `categorias-do-transporte.test.ts` (23 casos) rodado contra três versões de `transporte.ts`:

- Versão final: 23 de 23.
- Versão do Codex: 6 falham (403 `assinatura` renova, `autor_divergente` pausa a fila, 401 de dado bloqueia, `tarefa_no_prazo` adia, 401 de esperar vira temporário, 503 com código `permanente` vira recusa). São os casos que provam que as mudanças desfeitas eram perigosas.
- Versão da base (`257bd42`): 22 de 23. Falha só "401 credenciais, também reentrar, pausa sem gastar a renovação rotativa", a única mudança intencional. Os outros 22 são de não regressão (passam nas duas).

## Limites declarados (leia antes de dar PASS)

- Não houve aparelho nem simulador: a validação humana da E02 ("abre o app de campo em simulador") fica pendente. Os testes provam o caminho por dublê de `fetch` e pela integração da fila contra a API real (`campo-integracao` nos dois prefixos), não pelo binário.
- `ErroDaApi.categoria` é lida e exposta, mas nenhuma tela decide por ela nesta etapa (decidir mudaria mensagem). A fila decide no transporte.
- O transporte ignora o campo `categoria` do corpo (o servidor ainda não o manda); quando mandar, decidir se a fila passa a respeitá-lo é decisão futura.
- `test:e2e:api` não foi rodado (instrução do orquestrador).
- Falhas de ambiente Windows aceitas: `regras-de-conteudo.test.ts` 1 caso (EPERM em symlink, DV-46), `desfazer-migracao.test.ts` 5, `guarda-da-semente.test.ts` 3, `semear-homologacao.test.ts` 2.
- Uma primeira rodada de `test:campo` falhou uma suíte por EPERM no cache de transformação do jest em `%TEMP%` (concorrência com outros agentes); a segunda rodada, arquivada, passou 2010 de 2010.

## Provas (em `saidas/`)

1. `01-typecheck.txt` (código 0). 2. `02-lint.txt` (OK monorepo e aplicativo de campo). 3. `03-lint-teto.txt` (431, não sobe). 4. `04-formato.txt` (OK). 5. `05-conferir-numeros.txt` (tudo bate). 6. `06-test-scripts.txt` (831 casos, 808 passam, 0 falham, 23 pulados; rodado com o INDEX desta pasta já presente). 7. `07-regras-de-conteudo.txt` (9 de 10; o 1 é o EPERM do Windows, DV-46). 8. `08-auditar.txt` (código 0, runtime limpo). 9. `09-npm-test.txt` (campo pacote 261 de 261, shared 407 de 408, api 1942 de 1979 com 34 pulados, console 377, web 791, db 431 de 445 com 6 pulados; as falhas são as de ambiente listadas, mais `eliminacao-de-municipio.test.ts` "mil e um objetos" por tempo, 40 s com outros agentes rodando, que passou 18 de 18 na reexecução isolada, `15-eliminacao-reexecucao.txt`). 10. `10-test-isolamento.txt` (`isolamento.test.ts` CA-06 137 de 137; as 8 falhas são `desfazer-migracao` e `guarda-da-semente`, de ambiente). 11. `11-test-pacote-campo.txt` (261 de 261). 12. `12-mordida.txt` (acima). 13. `13-test-campo-aplicativo.txt` (`npm run test:campo`: tipos limpos, 2010 de 2010, leitura do código e jest concordam). 14. `14-campo-integracao-dois-prefixos.txt` (a fila real contra a API real: `campo-integracao.test.ts` sem prefixo, 17 de 17, e `campo-integracao-v1.test.ts` com `baseUrl` terminando em `/v1`, 17 de 17).

## Justificativa

A fila offline é o coração do produto, e a regra desta parte era que nenhum item pode sumir, ser descartado, ficar parado sem saída ou repetir em laço num caso que hoje não faz isso. A leitura da categoria entrou onde ela já era a pergunta certa (401 e 403, que antes liam a ação do catálogo de acesso), e o status continua sendo o primeiro filtro. Onde a categoria do catálogo e o desenho da API discordavam (`autor_divergente`, `tarefa_no_prazo`), valeu o desenho que a API documenta e que os testes existentes da fila já protegem.

## Para o orquestrador

- **Linha do STATUS sugerida:** `V2-F02-E02 e E03 (parte 2B, campo) | IMPLEMENTADA (candidato) | app de campo chama a API pela base ORIGEM + /v1 (eas.json só com a origem; telas mostram a origem; URL assinada intacta); a fila lê a categoria do catálogo dentro do status, sem mudar comportamento (só o 401 credenciais deixa de gastar a renovação); 5 mudanças de semântica do Codex desfeitas na revisão. 261 testes do pacote, 2010 do aplicativo.`
- **Dívidas pagas:** nenhuma.
- **Pendências humanas:** abrir o aplicativo de campo em simulador ou aparelho apontado para a API local e conferir (a) a origem na tela de entrada e no perfil, (b) as chamadas indo a `/v1` e (c) uma foto subindo pela URL assinada sem `/v1`; coleta feita sem sinal sobe depois de reabrir.
- **Ao integrar:** os totais de `README.md`, `COLOCAR-DE-PE.md` e `apps/campo/LEIA-ME.md` precisam ser recalculados na junção com as outras partes do lote 2.
