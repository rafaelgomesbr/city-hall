# Procedimento de indisponibilidade

- **Versão:** 2, de 15/09/2026 (a 1 é de 09/09/2026; a 2 corrige a data do restore, põe o push na escala, aponta a cópia antes de migrar e escreve o que falta na página de status e no log)

Um sistema de Defesa Civil cai no pior dia possível, porque o dia de pico de uso
é o dia de temporal, e é nele que a infraestrutura de todo mundo sofre. Este
documento existe para que a resposta não seja improvisada às três da manhã.

**Princípio que governa tudo aqui: o atendimento não pode parar porque o sistema
parou.** O papel e a caneta são o plano de contingência, e o sistema precisa
saber receber depois o que foi feito no papel. Qualquer procedimento que assuma
"o sistema volta em minutos" é ficção.

---

## 1. O que cai, e o que sobra quando cai

| Se cair | O agente em campo | O coordenador | O cidadão |
| --- | --- | --- | --- |
| **A API** (Fly) | **Continua trabalhando.** Vistoria offline é o projeto do aplicativo: a lista já está no aparelho e a fila segura o envio | Para. Painel sem API não lista nada | Ligação continua sendo atendida, no papel |
| **O banco** (Supabase) | Continua. Mesma razão | Para | Idem |
| **O painel** (Vercel) | Não afeta | Para, mas a API continua de pé: o dado do aparelho continua entrando | Idem |
| **Armazenamento de fotos** | Coleta continua; a foto fica na fila | Vistoria aparece; a foto demora | Idem |
| **Notificação (Apple ou Google)** | Continua trabalhando, mas o aviso de despacho e o de prazo não chegam ao bolso: a lista atualiza ao abrir o aplicativo, e o aviso local com o aplicativo aberto continua | Não afeta o painel; o despacho é gravado igual | Idem |
| **A internet da prefeitura** | Continua | Para | Idem |
| **O aparelho do agente** | Para para aquele agente | Não afeta | Idem |

A assimetria é deliberada e é o principal ativo de resiliência do produto: **a
ponta que está no morro é a que menos depende de infraestrutura.**

---

## 2. Escala de gravidade

| Nível | O que é | Aviso ao município | Prazo de primeira resposta |
| --- | --- | --- | --- |
| **1, crítico** | Ninguém entra, ou dado sendo perdido, ou suspeita de vazamento | Imediato, por telefone | 15 minutos |
| **2, alto** | Painel fora, sincronização falhando para todos, ou notificação de push parada para todos (o aviso de despacho e o de prazo deixam de chegar; a varredura registra a falha no log) | Imediato, por mensagem | 1 hora |
| **3, médio** | Função isolada quebrada (foto, documento, mapa), com o resto de pé | No mesmo dia | 4 horas |
| **4, baixo** | Lentidão, defeito cosmético, erro que tem contorno | No relatório seguinte | 2 dias úteis |

Suspeita de vazamento é **sempre nível 1**, mesmo sem confirmação, e dispara
também o relógio de 24 horas da comunicação prevista na política de privacidade.

---

## 3. O que fazer, na ordem

### 3.1 Confirmar que caiu

```bash
curl -sS -o /dev/null -w '%{http_code} %{time_total}s\n' https://defesa-civil.fly.dev/saude
```

`200` significa que a API está de pé e que ela alcança o banco. Qualquer outra
coisa, ou demora acima de poucos segundos, é falha.

Depois:

```bash
fly status -a defesa-civil          # as máquinas estão vivas?
fly logs -a defesa-civil            # o que elas dizem?
```

E o estado dos provedores: página de status da Supabase, da Fly e da Vercel.
**Se o provedor caiu, o procedimento é avisar e esperar**, não mexer.

### 3.2 Avisar antes de consertar

O município precisa saber que caiu **antes** de descobrir sozinho, porque a
descoberta dele acontece com um cidadão na linha. Avisar custa dois minutos e
compra a confiança que o conserto sozinho não compra.

O aviso diz três coisas, e só três: **o que não funciona**, **o que continua
funcionando** (a coluna do agente na tabela da seção 1) e **quando haverá nova
notícia**. Nunca prometer prazo de conserto que não se sabe cumprir.

### 3.3 Consertar, e a regra que não se quebra

**Nunca `UPDATE` na produção com a credencial de dono para contornar defeito.**
Essa credencial ignora o isolamento entre municípios, e usá-la sob pressão, de
madrugada, é como este produto ganharia o pior incidente da sua vida. As saídas
legítimas, em ordem de preferência:

1. Reverter a última entrega (`fly deploy` da versão anterior).
2. Reiniciar a máquina (`fly machine restart`).
3. Corrigir o código, com teste, e entregar.

Se a única saída for tocar no banco à mão, isso é **incidente por si só**: fica
registrado, com quem fez, o que rodou e por quê, e vira item de correção para
que a próxima vez tenha ferramenta em vez de improviso. Foi assim que a rota de
redefinição de senha por administrador entrou no produto.

### 3.4 Restaurar de cópia de segurança

Só quando houver perda de dado, e a decisão é do município, porque restaurar
significa perder o que entrou depois do ponto de restauração.

O procedimento de restauração está provado: foi executado em **09/09/2026**
(`COLOCAR-DE-PE.md`, Parte 6, com o comando exato, o tempo medido e os dois
erros que apareceram no caminho) contra uma cópia, com conferência de linhas,
tabelas, políticas de segurança em nível de linha, funções, índices, restrições
e concessões. **Cópia de segurança não testada não é cópia de segurança**, e
por isso o teste se repete a cada `[[periodicidade a definir]]`. Esse campo
está aberto desde a versão 1, e é decisão do dono.

Em 2026-10-07 (V2-F00-E25) o restore foi refeito com o esquema atual, 47
migrações, entre dois clusters PostgreSQL descartáveis no Windows, com a
semente sintética: isolamento conferido no banco restaurado e a API respondendo
contra a cópia. Em 2026-10-15 (correção 1 da E25) o roteiro foi seguido de novo,
a frio, num clone limpo no macOS e nos dois shells (`zsh` e `bash`), com as 50
migrações de hoje; e o CI repete uma versão dele em Postgres 17, num job que hoje só
roda com `[ci completo]` no commit (o disparo manual e a agenda semanal estão
no arquivo, mas só valem quando ele chegar ao ramo padrão). O
roteiro vigente é `RESTORE-DO-BANCO.md`; a Parte 6 de `COLOCAR-DE-PE.md` ficou
como registro histórico. O restore a partir da
produção (Supabase) com o esquema atual continua NÃO provado: o de 09/09/2026,
com 15 migrações, segue sendo o único feito com dado do provedor.

**Cópia antes de migrar.** Desde 15/09/2026 `scripts/migrar-producao.mjs
--aplicar` recusa sem uma cópia feita nos últimos trinta minutos por
`scripts/copiar-producao.mjs` (`IMPLANTACAO.md`, seção 8). É o ponto de volta
de cada migração; não substitui a cópia automática do provedor nem o teste de
restore.

### 3.5 Fechar

Comunicado final ao município com: o que houve, o que foi afetado, o que foi
feito, e **o que muda para não repetir**. Sem a quarta parte, o comunicado é
desculpa, não relatório.

---

## 4. Página de status

**Ainda não existe** (situação em 15/09/2026). Especificação para quando entrar:

- Endereço **fora** da infraestrutura que ela monitora. Página de status
  hospedada no mesmo servidor que caiu não informa ninguém.
- Mostra: API, banco, painel, armazenamento e envio de notificação, cada um com
  estado atual e as últimas 24 horas.
- Traz o histórico dos incidentes, sem apagar os feios. Histórico editado não
  serve para nada.
- Sem dado de município: um estado de serviço, e nada mais.
- Atualizada por sonda automática, e não à mão. Página que depende de alguém
  lembrar de atualizar mostra "tudo bem" durante a queda.

**O que falta, e é decisão do dono, não código:**

1. Escolher onde ela mora (um serviço de página de status de terceiro, ou uma
   página estática num provedor que não seja a Vercel, o Fly nem a Supabase).
   Se for terceiro, ele entra em `SUBPROCESSADORES.md` **antes** de ser ligado,
   mesmo sem tocar dado de município: a regra da seção 4 daquele documento
   vale para qualquer dependência, e o endereço que a sonda chama é o da API.
2. O que a sonda chama, e o que cada resposta significa. Hoje existe
   `GET /saude` na API (responde 503 com banco fora ou esquema atrasado) e
   `GET /saude` no console (responde só que o processo está de pé, ver
   `IMPLANTACAO.md`, 6.4). Não existe sonda de armazenamento nem de push: para
   o push, o que existe é a varredura registrando falha no log da API.
3. Quem escreve o histórico de incidente, e em quanto tempo depois do fechamento
   (seção 3.5). Sem dono, o histórico fica vazio e a página vira enfeite.

### 4.1 Log com retenção

**Não está definido** (situação em 15/09/2026), e é isto que falta:

- **Onde o log fica hoje.** A API e o console escrevem na saída padrão, que o
  Fly guarda por pouco tempo e não exporta sozinho. Não há destino de longa
  duração, então "o que aconteceu às 3h de terça" só tem resposta enquanto o
  Fly ainda tiver a linha.
- **O que o log contém, e por isso ele precisa de prazo.** A lista de
  `redact` de `apps/api/src/servidor.ts` tira senha, token, ficha de push e o
  detalhe de erro do banco, e a barra de endereço não entra crua. O que fica é
  email de servidor municipal (na linha de entrada), identificador de
  ocorrência e endereço IP de origem. É dado pessoal, e dado pessoal sem prazo
  é o que a política de privacidade promete não guardar.
- **O que o dono decide:** o destino (o próprio Fly com exportação, ou um
  coletor de log, que entra em `SUBPROCESSADORES.md` antes de ser ligado, e
  fora do país é transferência internacional); o prazo de retenção, com um
  número, escrito na seção 4 de `PRIVACIDADE.md`; e quem tem acesso ao log,
  que hoje é quem tem a conta do Fly.
- **O que não muda com essa decisão:** a trilha de auditoria continua no
  banco, append-only, e é ela, não o log, que responde "quem fez o quê" para o
  município.

---

## 5. Contingência no papel, e como o sistema recebe depois

O município mantém formulário impresso para chamado e para vistoria. É o que já
existia antes do sistema, e continua sendo o plano B.

Ao voltar, o registro do papel entra no sistema com a **data real do
atendimento**, e não a data de digitação. Isso importa: o laudo já distingue
"vistoria em campo" de "recebida pelo sistema", exatamente para não afirmar que
a vistoria aconteceu na hora em que o sinal voltou. A mesma distinção vale para
o que foi feito no papel.

**Pendência conhecida:** hoje o registro retroativo depende de digitar a data à
mão, e nada impede errar. Um campo declarado de "atendimento feito fora do
sistema", com a data e o motivo, tornaria isso auditável. Não está feito.

---

## 6. Contatos

| Papel | Quem | Como |
| --- | --- | --- |
| Plantão técnico do fornecedor | `[[nome]]` | `[[telefone]]` |
| Encarregado de dados do fornecedor | `[[nome]]` | `[[email]]` |
| Administrador do município | `[[nome]]` | `[[telefone]]` |
| Coordenador de plantão do município | `[[nome]]` | `[[telefone]]` |

As quatro linhas estão vazias desde a versão 1 (09/09/2026) e continuam vazias
em 15/09/2026. São decisão do dono e do município, e não podem ser inventadas:
um procedimento de indisponibilidade sem telefone é um procedimento que, na
madrugada do temporal, começa por descobrir para quem ligar. Os dois nomes do
fornecedor são a primeira coisa a preencher; os dois do município entram na
reunião da seção 1 de `IMPLANTACAO.md`, que já pede o administrador.

Sem plantão de 24 horas contratado, o compromisso é **melhor esforço**, e isso
precisa estar escrito no contrato. Prometer 24 por 7 sem escala de plantão é
prometer o que não se cumpre, e o dia da cobrança será o dia do temporal.
