# Proposta: acelerar a V2 sem abrir mão da prova

**Para quem:** Rafael, para decidir antes da próxima semana.
**Situação:** APROVADA por Rafael em 2026-10-20, inteira (P1 a P8). Virou a decisão D-31 e a seção 19 de `28-execucao-e-validacao.md`, que é o texto que vale. Este arquivo fica como registro do motivo.
**Data:** 2026-10-20.

## 1. O diagnóstico, com números

Entre 2026-10-13 e 2026-10-20 a F00 teve sete rodadas de validação, e o G00 continua fechado.

| Rodada | Data | Resultado |
| --- | --- | --- |
| 4 | 19/10 | 8 reprovadas |
| 6 | 20/10 | 3 reprovadas, 5 bloqueadas, 17 aprovadas |
| 7 | 20/10 | 3 reprovadas, 1 bloqueada, 21 aprovadas |

A qualidade subiu a cada rodada. O que não converge é a cauda: são sempre as mesmas três etapas.

- **E05 (guarda de códigos de erro):** reprovada nas rodadas 4, 5, 6 e 7. Cada rodada encontra uma forma nova e mais exótica de escrever um 403 fora do catálogo. A mais recente exige que o próprio código da rota passe um objeto cujo `toString` muda a cada leitura. Os validadores escreveram, nas palavras deles: "não é explorável por cliente externo neste SHA".
- **E19 (auditar):** reprovada nas rodadas 1, 2, 6 e 7. Em cada rodada aparece uma configuração do npm diferente que produz verde falso. Depois da rodada 7 já veio outra (`npm-shrinkwrap.json`).
- **E09 (foco e layout):** cada conserto de foco abre um caso novo de largura, altura ou motor de navegador. Os validadores também passaram a cobrar defeitos anteriores à etapa (concordância, paginação, busca).

Para onde vai o custo de uma rodada:

- A rodada 7 levou cerca de 7 horas, com 12 validadores em Opus, 67 relatórios e 1372 capturas (113 MB).
- Cada correção ganha ainda um revisor independente em Opus e, em geral, uma segunda passada.
- Quase nada é herdado entre rodadas. Toda correção toca arquivos compartilhados (`README.md`, `baseline.mjs`, `verificar.yml`), e o mapa de impacto de quase todas as etapas inclui esses arquivos. Corrigir a E19 tira a herança da UX da E24.

A causa raiz não é falta de cuidado: é falta de um critério de **suficiente**. O validador adversarial tem mandato ilimitado, e um portão de segurança sempre tem uma próxima forma de contornar. Sem dizer onde o modelo de ameaça termina, a rodada N+1 sempre acha alguma coisa.

## 2. O que proponho

### P1. Achado que bloqueia precisa de alcance real

O achado bloqueia a etapa só se cumprir uma de três condições:
1. viola um critério escrito da DoD da etapa;
2. é alcançável por um usuário ou atacante externo no produto daquele SHA;
3. está na lista da seção 7 do `28` (isolamento, auditoria, segredo, etc.).

Defeito latente, que exige código malicioso ou errado dentro do próprio repositório, vira item de dívida com dono e prazo ("corrige antes de crescer"). Ele não reprova a etapa. O validador continua obrigado a registrar o achado.

Defeito anterior à etapa e fora do escopo dela também vira item de dívida, na etapa dona, e não reprova quem o encontrou.

### P2. Modelo de ameaça escrito para os portões de segurança

E05 e E19 ganham um parágrafo "o que este controle cobre e o que não cobre", aprovado por você. O que estiver fora está declarado e não reprova.

- **E05:** a guarda é defesa em profundidade contra erro de programação, e não contra código hostil dentro da rota.
- **E19:** o portão confia no lockfile versionado e na configuração versionada, que o CI já confere (nenhum `.npmrc` versionado, shrinkwrap recusado).

### P3. No máximo duas rodadas pela mesma classe de defeito

Se uma etapa reprovar duas vezes pela mesma classe de defeito, a terceira não é automática. A decisão sobe para você, em uma linha: aceitar com o modelo de ameaça documentado, ou mandar consertar mais uma vez. Isso para a corrida armamentista.

### P4. Validação por diferença, com arquivos compartilhados fora do mapa

- Na rodada N+1, roda só a dimensão que reprovou nas etapas que reprovaram, mais as etapas cujo código de produto mudou.
- Os totais do README e do `baseline.mjs` são números gerados e conferidos por máquina (`conferir:numeros`), então saem do mapa de impacto das dimensões humanas.
- `verificar.yml` só tira a herança da dimensão Infra e CI.
- Com isso, a rodada 8 rodaria umas 3 a 5 etapas, e não 25.

### P5. O CI é a prova padrão

O repositório é público e o CI agora roda em Linux e em Windows. O validador lê o run e os artefatos do SHA e só repete localmente o que o CI não cobre:
- uso humano no navegador;
- aparelho;
- sonda adversarial nova.
Isso tira das rodadas o Postgres baixado, os três motores de navegador e a linha de base completa no Mac.

### P6. Modelo e tamanho da validação

- **Modelos:** Sonnet é o padrão de validador. Opus fica para segurança e red team em etapa com AUTH, TENANT ou RLS, e para a consolidação do gate.
- **Red team com tempo fixo:** 45 minutos e no máximo os 3 achados mais graves.
- **Capturas:**
  - os três motores só nas telas que mudaram, e o resto num motor;
  - com P4, deixa de haver mil capturas por rodada.

### P7. O G00 fecha por etapa, e a F01 começa em paralelo

Etapa VALIDADA fica fechada e não é revalidada sem mudança no código dela. Proponho que a F01 comece num ramo próprio assim que restarem no máximo 3 etapas abertas na F00, todas fora da seção 7. O merge em master continua só depois do G00.

### P8. Orquestração mais barata

- Uma correção por lote, com um revisor por lote e não um por commit.
- O orquestrador não fica esperando em laço. Ele dispara, sai e volta pelo aviso do agente.
- O ensaio de CI num ramo `v2/ensaio-*` antes do candidato se pagou nesta rodada: pegou três defeitos que custariam uma rodada inteira.

## 3. O que NÃO muda

- Nada avança sem prova arquivada.
- O critério escrito da etapa tem de estar provado por teste ou execução.
- Os critérios da seção 7 do `28` não admitem risco aceito.
- Quem implementa não valida.
- O portão visual da seção 0 do `19` continua valendo para o que a etapa mudou.

## 4. Onde a F00 está agora (2026-10-20, noite)

| Etapa | O que já foi feito | O que falta |
| --- | --- | --- |
| E19 | Correções 8 e 9 com revisão aprovada; o CI chama o `auditar` pelo `node`, recusa `.npmrc` versionado e roda em Windows | Nada |
| E21 | Job `plataformas` no CI, com os três casos verdes em Windows e Linux no ensaio | Nada |
| E17 | `test:scripts` e `conferir:numeros` verdes em Windows no ensaio | Nada |
| E05 | Correções 6, 7 e 7b | A revisão achou o caso do `toString` mutável. O agente que ia consertar foi interrompido por um filtro de segurança ao escrever as cargas de injeção. Pela P1 e pela P2, é dívida e não bloqueio; sem a P1, precisa da sua decisão |
| E09 | Correção 6 aprovada com ressalvas | A 6b corre (Tab no WebKit do Linux, paginação a 320 px, teste da tabela que dependia do acaso) |
| E16 | Teste instável do aplicativo corrigido (o defeito era do teste) | Nada |
| E22 | Correção 5 com a documentação alinhada | Nada |

Tudo isso está no ramo `trab/correcao-7`, que ainda não entrou no `v2/f00`. Próximo passo, com tokens: concluir a E09 6b, incorporar, fazer o ensaio do CI e rodar a rodada 8. A rodada 8 já sai nas regras novas, se você aprovar.
