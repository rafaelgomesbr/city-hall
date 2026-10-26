---
validador: privacidade-lgpd
modelo: claude-sonnet-5-5
etapa: V2-F00-E09
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [LGPD, SEGURANCA, API, UI]
nivel_de_prova_exigido: [E1, E3a]
nivel_de_prova_obtido: [E1, E3a]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Inventário dos dados tocados (dimensão técnica; base legal, controlador, operador e DPO ficam para pessoa):

| Dado | Onde | Sai da API? | Retenção |
| --- | --- | --- | --- |
| criada em, expira em, user-agent bruto, IP da sessão | tabela `sessoes` (migração 002) | só `entrouEm`, `validaAte`, `aparelho` (resumo), `atual` | sem expurgo hoje (F05-E12, declarado em "NÃO implementar") |
| contagem de sessões, última entrada, validade | `GET /usuarios/:id/sessoes` | sim, só isso | idem |
| senha temporária | resposta única de `POST /usuarios/:id/redefinir-senha` | uma vez, nunca na trilha | hash com prazo de 72 h (`senha_provisoria_ate`) |
| autor, alvo, contagem de sessões encerradas | `trilha_administrativa` | n/a | append-only |

Critério "a listagem não mostra IP nem user-agent completo" (bloco, Impacto LGPD):
- `apps/api/src/auth/servico.ts:1030-1052` (`listarMinhasSessoes`): o SELECT lê `user_agent`, mas o mapeamento devolve só `entrouEm`, `validaAte`, `aparelho: resumirAparelho(...)`, `atual`. O IP nem é selecionado.
- `apps/api/src/auth/aparelho.ts`: resumo por lista fechada de navegador e sistema; texto livre sem padrão vira "Aparelho não identificado". Um user-agent hostil não consegue fazer o servidor devolver o texto dele.
- `apps/api/src/rotas/administracao.ts:614-655` (`GET /usuarios/:id/sessoes`): agrega `count`, `max(criada_em)`, `max(expira_em)`. Nenhuma coluna de IP ou aparelho. Quem administra não vê o aparelho de terceiros (decisão IDN-29 no comentário da rota).
- Confirmado: o red-team disse que não expõe, e a leitura do código e o teste `sessoes-da-conta.test.ts` ("não entrega IP, user-agent completo nem identificador de sessão"; "a administradora vê a quantidade e as datas, e nada do aparelho") concordam.

O que a trilha grava:
- Redefinir senha (`administracao.ts:497-515`): `acao senha_redefinida`, autor, alvo (id e nome), `depois: { sessoesEncerradas, ativo }`. Sem senha, sem hash, sem IP. Na mesma transação da troca do hash.
- Encerrar sessões de outra pessoa (`:579-592`): `sessoes_encerradas` com contagem.
- Encerrar as próprias outras (`servico.ts:999-1006`): `sessoes_encerradas` com `sessaoAtualPreservada: true`.
- Minimização satisfeita: o necessário para a investigação ("quem redefiniu a senha de quem") sem credencial.

Controle de acesso: `gerenciar_usuarios` antes do banco, `exigirPostoParaGerir`, 404 para outro município (RLS), 422 `autoredefinicao` e `autoencerramento`; testes verdes.

## Evidência
- `npx vitest run test/sessoes-da-conta.test.ts test/recuperacao*.test.ts test/pacote-de-saida-contrato.test.ts test/saida-de-municipio.test.ts --testTimeout=120000` em `dc360/apps/api`: 7 arquivos, 102 testes, saída 0 (`scratchpad/api.txt`).
- `npm run build:shared`: saída 0.

## Cenários positivos
Lista da própria conta marca a atual; renovação não multiplica linhas; encerrar as outras deixa só esta; coordenadora vê contagem de quem está abaixo.

## Cenários negativos
Outro município: 404 igual a id inexistente; posto igual ou acima: 403 `posto_insuficiente`; agente e operador: 403 `sem_permissao` nas três rotas; id não uuid: 422; sem token: 401.

## Tentativas de reprovar
- Procurei IP ou user-agent bruto em qualquer campo de resposta das duas leituras: não há (código e teste).
- Procurei senha ou hash na trilha: `depois` não os leva.
- Procurei caminho para o administrador ver o aparelho de terceiro: não existe rota.

## Achados
1. anotado. IP e user-agent bruto permanecem em `sessoes` sem prazo até a F05-E12 (declarado fora do escopo da etapa no bloco). Não é regressão desta etapa.
2. anotado. A redefinição por link de e-mail (`consumir_recuperacao`) não grava na trilha administrativa (auditoria de recuperação é F03, fora do escopo). Hoje só o ato por administrador deixa rastro.
3. anotado (do red-team, não repetido aqui): clique induzido por iframe; é achado de segurança dele, não de privacidade.

## Não verificado
- Base legal, papel de controlador e operador, aviso de privacidade e DPO: pessoa.
- Modo local (demonstração) no navegador e a tela de senha temporária renderizada: não abri o painel (UX e Rafael).
- Concorrência de duas redefinições do mesmo alvo.

## Risco residual
Baixo. IP e user-agent retidos sem prazo até a F05-E12; a senha temporária é conhecida por quem a sorteou (IDN-18, em `PENDENCIAS.md`).

## Motivo do humano
Base legal e prazo de retenção de IP e user-agent de sessão, e o texto da frase "senha única", são decisão jurídica e de produto, não de código.
