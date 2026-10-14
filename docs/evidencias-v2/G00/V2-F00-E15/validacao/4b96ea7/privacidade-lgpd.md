---
validador: privacidade-lgpd
modelo: claude-sonnet-5-5
etapa: V2-F00-E15
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E3a]
nivel_de_prova_obtido: [E1, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
Aviso: não sou advogado e isto não é parecer jurídico. Cobre a parte técnica. Base legal, papéis e prazo de guarda do dado de coleta ficam para pessoa.

## Critérios verificados

Impacto LGPD declarado: "reforça o aviso antes de apagar dado de coleta; nenhum dado novo". A etapa não muda a regra de apagar.

Inventário do que fica no aparelho compartilhado (leitura de `banco-local.ts`, `sessao.tsx`, `aviso-da-saida.ts`):

| Dado | Onde | Saída explícita ("Sair da conta") | Sessão vencida ("Entrar de novo") | Outra pessoa entra |
| --- | --- | --- | --- | --- |
| rascunho, tarefas, lápides, marca de dono | SQLite `rascunhos`, `pendencias`, `coletas`, `marcas` | apagados (`banco-local.ts:298`, DELETE) | ficam (dono marcado) | apagados em `acolherNoAparelho` (`:255`) antes de a sessão abrir |
| foto e assinatura de rascunho | `Paths.document` (`foto-*.jpg`, `assinatura-*.png`) | apagadas se nenhum item da fila as usa | ficam | apagadas se nenhum item da fila as usa |
| fila de envio (envelope, coordenada, autor) e arquivos dela | `fila_sincronizacao` e disco | ficam, por decisão documentada | ficam | ficam; só sobem com a conta do autor (carimbo em `packages/campo/src/fila.ts`); a tela da fila mostra a outro autor só protocolo, estado, contagem de arquivos e data |
| token e identidade | SecureStore | apagados | apagados | substituídos |
| original da câmera no cache | cache do sistema | não alcançado | idem | idem |

O que a rodada 1 achou segue aberto e continua registrado em `apps/campo/PENDENCIAS.md` com dono (F05-E09, F05-E10, F14-E02, F14-E04, F14-E15): fila e arquivos sem prazo de guarda, JPEG e PNG de coleta enviada só saem no logout, original da câmera no cache nunca é apagado, coordenada com 6 casas, resíduo de WAL. Não são regressão desta etapa.

Controles verificados no SHA:

1. Defeito da correção 1 (a faixa da vistoria chamava `sair()`): `vistoria/[id].tsx:1419` `entrarDeNovo` chama `encerrarSessaoVencida` (`sessao.tsx`, que marca o dono, esquece a credencial e a ficha, e NÃO apaga o disco). Em `src/`, o único `sair()` restante é o do diálogo do Perfil; os demais chamadores de `apagarDadosLocais` são `sair` e `acolherNoAparelho`.
2. O aviso não mente: `aviso-da-saida.ts` diz que sair apaga as vistorias começadas, com fotos e assinatura, "sem volta", e que a fila fica guardada e só sobe com a conta do autor; sem rascunho nem fila volta à frase curta.
3. Troca de pessoa: `acolherNoAparelho` roda em `entrar` antes de guardar credenciais e antes de a sessão abrir, e a restauração de sessão marca o dono (`sessao.tsx` ~linha 155). Mesma pessoa reencontra; outra pessoa limpa.
4. GPS: `dados/precisao-do-gps.ts` usa `Math.max(1, Math.round(p))` e devolve nulo para ausente, zero ou negativo. Só arredonda a precisão que já era gravada, não cria dado.
5. Nenhuma linha de `console.*` com conteúdo nos arquivos da etapa; os `console.warn` de `banco-local.ts` registram mensagem fixa e o objeto de erro.

## Evidência

- Não rodei o jest do app (o QA do campo o usa agora). Uso a linha de base no SHA: `scratchpad/baseline/08-teste-campo-app.txt`, 129 suítes e 1903 testes verdes, entre elas `dialogo-na-conta-com-vistoria-comecada.test.tsx`, `vistoria-sessao-vencida-preserva-o-rascunho.test.tsx`, `vistoria-ainda-nao-baixada.test.tsx`, `sair-e-entrar-nao-perde-a-coleta.test.ts`, `precisao-do-gps.test.ts`, `aviso-da-saida.test.ts`; `04-teste-campo-pacote.txt` e `09-test-campo.txt` verdes.
- Leitura dos testes: `sair-e-entrar-nao-perde-a-coleta.test.ts` prova a mesma pessoa reencontrando (com foto e assinatura), o rascunho de Ana limpo quando Bruno entra, a fila dela intacta, e a saída explícita apagando só o rascunho; `vistoria-sessao-vencida-preserva-o-rascunho.test.tsx` usa sessão, `banco-local` e `rascunho` reais sobre o SQLite do Node, com controle (saída explícita ainda apaga) e a ausência do rótulo antigo.

## Cenários positivos

A mesma pessoa que entra de novo depois de sessão vencida reencontra checklist, observações, assinatura e foto; o diálogo conta as vistorias começadas no singular e no plural; precisão 0,3 vira 1.

## Cenários negativos

Outra pessoa não recebe o rascunho, a foto nem a assinatura da anterior (apagados antes de a sessão abrir); a saída explícita apaga; a fila de uma pessoa não sobe com a credencial de outra; precisão ausente grava nulo; o esquema recusa 0 e negativo.

## Tentativas de reprovar

- Procurei outro caminho de login que pulasse `acolherNoAparelho`: `entrarNaApi` só é chamado em `sessao.tsx`; a restauração de sessão só marca o dono.
- Procurei caminho de saída que apague sem avisar: o único `sair()` está atrás do diálogo; a faixa da vistoria, a lista e a fila usam `encerrarSessaoVencida`.
- Procurei dado de outra pessoa visível na fila: só protocolo, estado, número de arquivos e data; sem imagem nem envelope.
- Procurei falha aberta: `apagarDadosLocais` engole o erro com `console.warn` (`banco-local.ts:347,380`) e `acolherNoAparelho` segue e marca o NOVO dono mesmo se o DELETE falhou, e `donoDosDadosLocais` devolve nulo se o banco não abre. Então, se o SQLite falhar na hora da troca, a segunda pessoa herda o rascunho da primeira e a marca passa a ser dela, sem novo apagamento. Reprodução por leitura, sem execução (precisaria de falha injetada). Ver achado 1.
- Procurei item da fila sem autor que qualquer pessoa pudesse assumir: `podeAssumir = autoria === "sem_autor"` (`fila.tsx:1354`); só item legado, atribuição e não vazamento de imagem.
- Mordida independente dos testes (desfazer o conserto e ver vermelho) NÃO foi refeita: a rodada proíbe modificar o repositório e o jest do campo está ocupado. As saídas ANTES/DEPOIS arquivadas pelo implementador (`correcao-1/saidas/01` e `03`) são alegação, não prova minha.

## Achados

1. corrige antes de crescer (F14-E02). A limpeza da troca de pessoa falha aberta: erro de SQLite em `apagarDadosLocais` é só registrado e o novo dono é marcado do mesmo jeito. Sugestão: `acolherNoAparelho` só marcar o novo dono se o apagamento terminou, e recusar a entrada (ou repetir) se não terminou.
2. corrige antes de crescer (F05-E09, F05-E10, F14-E04). Os achados 1 a 5 da rodada 1 (fila e arquivos sem prazo, JPEG e PNG de coleta enviada só saem no logout, original da câmera no cache, coordenada com 6 casas, WAL) continuam abertos. A decisão "Entrar de novo não apaga" aumenta o tempo em que rascunho, foto e assinatura ficam em claro num aparelho sem sessão (perdido ou largado); sem criptografia local (F14-E04), é risco aceito pelo desenho, a decidir no CP-24.
3. anotado. O registro de quem entra depois ser outra pessoa só vale para aparelho que já tinha a marca de dono; aparelho atualizado de versão sem marca não apaga por precaução (janela de atualização documentada).

## Não verificado

- Aparelho ou emulador: não subi build nem emulador; a prova é de componente com SQLite real do Node e arquivos simulados (nomes em conjunto), executada pela linha de base. O comportamento real de cache, WAL e `VACUUM` no Android não foi medido. O QA do campo ocupa o jest nesta rodada e fica com a prova no emulador.
- Falha injetada no SQLite durante a troca de pessoa (achado 1).
- Envelope exato da fila (campos do morador) e tela da fila renderizada para o segundo agente (lida, não renderizada).
- Aviso de privacidade, DPIA, contratos e transferência internacional (push, mapas): fora da dimensão técnica.

## Risco residual

Médio, herdado: dado de moradores (identificação, imagem do imóvel, assinatura, coordenada) em claro e sem prazo de guarda no aparelho compartilhado. A etapa informa o agente do que sai e do que fica e não piora o quadro.

## Motivo do humano

Base legal, papéis de controlador e operador, prazo de guarda do dado de coleta (inclusive item de outro autor) e redação do aviso de privacidade são decisão jurídica e de gestão. Rafael faz os dois fluxos num aparelho disponível (campo "Validação humana" do bloco), agora incluindo tocar em "Entrar de novo" na faixa da vistoria com rascunho no disco.
