# Ensaio da segunda pessoa: roteiro e ficha

- **Versão:** 1, de 2026-10-24 (V2-F01-E16, rascunho).
- **Estado:** NÃO EXECUTADO. Este é o roteiro para o Rafael indicar a pessoa e
  conduzir o ensaio. O ensaio só pode acontecer depois de duas coisas que ainda
  não existem: a decisão do CP-07 (quem é a pessoa e qual alternativa vale) e o
  ambiente de homologação (depende de V2-F01-E11; o caminho de deploy dele já
  existe, V2-F01-E12, mas não foi executado).
- **Para que serve:** provar que alguém que **não escreveu o sistema** implanta,
  reverte, migra e gira um segredo em HML usando **só o texto**, e registrar
  onde o texto falhou. O texto que falha é corrigido; o ensaio é repetido nos
  passos que falharam.

## Regras do ensaio

1. **Só o texto.** A pessoa segue os runbooks. Quem escreveu (ou o Rafael) fica
   ao lado só para registrar, e **não ajuda**: a ajuda esconde exatamente o que
   o ensaio procura. Se a pessoa travar por mais de 10 minutos, anota onde e
   segue para o passo seguinte.
2. **Só HML.** Nenhum passo toca PROD, a não ser as tentativas de recusa do
   passo 6, que existem para serem recusadas.
3. **Nenhum valor de segredo na ficha.** A ficha guarda nomes, comandos e
   resultados. Valor visto por engano vira rotação do segredo.
4. **Comando que não existe é falha do texto.** Se um runbook manda rodar algo
   que não existe na máquina (ou que falha por razão que o texto não explica),
   registre como "comando inexistente ou sem explicação".
5. **Anotar o tempo** de cada passo (início e fim). Servirá de base para as
   metas de tempo do plantão, quando existirem (F21-E06, F27-E02).

## Preparação (feita pelo Rafael, antes)

| Item | Estado hoje |
| --- | --- |
| CP-07 decidido; pessoa indicada; alternativa registrada em `docs/evidencias-v2/CP-07/decisao.md` | PENDENTE (humano) |
| Acesso mínimo concedido conforme `acesso-e-segredos.md` e ficha de concessão preenchida | PENDENTE (depende do CP-07) |
| MFA ligado em todas as contas da pessoa | PENDENTE |
| Ambiente de HML de pé (apps Fly, banco, bucket) | PENDENTE: depende de V2-F01-E11 |
| Deploy de HML pelo `deploy-hml.yml` (merge na `master`) | PENDENTE: o workflow existe (V2-F01-E12), falta o ambiente de HML e o ambiente `homologacao` do GitHub com os tokens (dono) |
| `rollback.md` existe e foi lido pelo Rafael | PENDENTE: depende de V2-F01-E08 |
| Dois commits distintos para implantar e reverter (um "bom", um "defeituoso de propósito", este só em HML) | A preparar |
| Cofre decidido e item de teste dentro dele (sem segredo real de PROD) | PENDENTE (CP-07) |
| Cópia de `dc360/` na máquina da pessoa (`git clone`) e `flyctl` instalado | A conferir |

## Roteiro

Cada passo aponta para o runbook que a pessoa lê. Ela não recebe nenhum outro
texto.

| # | Passo | Runbook | Sucesso quando |
| --- | --- | --- | --- |
| 1 | Conferir o próprio acesso: conta de cada serviço da matriz entra, com MFA, e **só no escopo concedido** | `acesso-e-segredos.md` | A lista de contas que a pessoa consegue abrir é igual à coluna "Segunda pessoa" |
| 2 | **Deploy** do commit bom na API de HML e no console de HML | `deploy.md` | `/saude` de HML devolve `status: ok` e `banco: ok`, uma máquina saudável |
| 3 | **Migração** em HML (aplicar uma migração nova num banco de HML na versão de PROD) | `migracao.md`, passo "Ensaio em HML" | `npm run migrar -- --conferir` diz que o banco está em dia e o `/saude` mostra a `ultimaMigracao` esperada |
| 4 | **Rollback**: implantar o commit defeituoso de propósito e voltar ao release anterior | `rollback.md` (V2-F01-E08) | `/saude` e o login voltam ao comportamento do commit bom, e a pessoa diz qual release voltou |
| 5 | **Rotação** de `JWT_SEGREDO` em HML, os dois passos, com a sessão aberta sobrevivendo ao primeiro | `rotacao-de-segredo.md` | A sessão aberta antes continua válida depois da lista de dois; um login novo funciona; no fim só o novo segredo está na lista |
| 6 | **Tentativas de recusa:** (a) ler um segredo de PROD; (b) implantar em PROD sem a promoção | `acesso-e-segredos.md`, `deploy.md` | As duas são **recusadas** pelo provedor (anotar a mensagem, sem segredo). Se alguma passar, é falha grave do acesso concedido: revogar e parar |
| 7 | **Revogação:** o Rafael revoga um acesso de teste da pessoa e ela comprova a recusa | `acesso-e-segredos.md`, "Revogar" | A pessoa tenta usar o acesso revogado e é recusada |
| 8 | **Declaração por escrito** da pessoa: o que conseguiu sozinha, o que não conseguiu | este documento | Texto curto, na ficha abaixo, assinado com o nome ou a função |

O critério de aprovação da etapa é: os passos 2 a 5 concluídos **usando só o
texto**, o passo 6 recusado, o passo 7 provado, a declaração escrita, e o
Rafael conferindo a ficha. Os runbooks que falharam foram corrigidos e os passos
correspondentes repetidos.

## Ficha de registro (copiar para a evidência, uma por execução)

Arquivo de destino: `docs/evidencias-v2/G01/V2-F01-E16/ensaio-AAAA-MM-DD.md`.
Sem valor de segredo, sem URL com credencial, sem captura que mostre segredo.

```
Ensaio da segunda pessoa
Data (ISO):
Função da pessoa (nome só se o Rafael decidiu registrar):
Alternativa do CP-07:
SHA implantado (bom):            SHA defeituoso:
Ambiente de HML:                 (nome do app, sem segredo)

Passo | Início | Fim | Resultado (ok, falhou, travou) | Onde o texto falhou | Correção feita
2 deploy
3 migração
4 rollback
5 rotação de JWT_SEGREDO
6a leitura de segredo de PROD (esperado: recusada)
6b deploy em PROD sem promoção (esperado: recusado)
7 revogação (esperado: acesso revogado recusado)

Declaração da pessoa (o que conseguiu sozinha; o que não conseguiu):

Conferido pelo Rafael em (data ISO):
```

## Depois do ensaio

1. Corrigir cada runbook nos pontos em que o texto falhou, no mesmo PR da ficha.
2. Repetir os passos que falharam com a mesma pessoa (ou outra), e registrar de
   novo.
3. Marcar a pendência humana do ensaio como cumprida e arquivar a ficha.
4. Só então a versão do rascunho deixa de ser "rascunho" no topo dos runbooks.

## O que acontece se não houver segunda pessoa (alternativa C)

O CP-07 admite a alternativa de **risco aceito por escrito**, como exceção
registrada, com o que fica bloqueado: runbooks completos (esta etapa), plantão
(F21-E06), suporte do piloto (F27-E02) e qualquer SLA (F28-E05). Nesse caso este
ensaio não acontece, os runbooks ficam como rascunho do dono, e o texto de risco
aceito vai para `docs/evidencias-v2/CP-07/decisao.md`.
