# ADR 0003: o painel roda em dois modos, local e contra a API

- **Data da decisão:** 21/08/2026 (registro escrito em 25/08/2026)
- **Situação:** aceita, em vigor
- **Depende de:** ADR 0001

## Contexto

O painel do coordenador precisa atender duas situações que não se parecem:

1. **Demonstrar o produto num notebook de prefeitura**, muitas vezes sem
   internet confiável, sem permissão para instalar nada e sem servidor. É assim
   que este produto é vendido, e foi assim que a Fase 0 inteira funcionou.
2. **Rodar em produção**, onde o navegador não pode ter privilégio nenhum sobre
   o banco e o isolamento tem que ser imposto do lado do servidor.

A saída preguiçosa seria a demonstração usar dados falsos em memória e a versão
real usar o banco. Isso tem um custo escondido: o isolamento entre municípios,
que é a regra número um, só seria exercitado de verdade pela primeira vez em
produção.

## Decisão

Existe **uma porta** (`apps/web/src/dados/repositorio.ts`) com duas
implementações que cumprem a mesma assinatura:

| | Modo local (sem `VITE_API_URL`) | Modo API (com `VITE_API_URL`) |
| --- | --- | --- |
| Banco | Postgres 16 em WebAssembly (PGlite), na própria aba, persistindo em IndexedDB | Postgres do servidor, por HTTP |
| Migrações | As mesmas `001` e `002` do diretório `db/` | Todas, aplicadas pelo `npm run migrar` |
| Entrada | Escolha de perfil, sem senha | Email e senha, JWT, sessão revogável |
| Isolamento | RLS forçada, papel `dc360_app`, `SET LOCAL` | O mesmo, no servidor |

A escolha é de configuração, não de código de tela. **Nenhuma página sabe qual
modo está ativo.**

O modo local não é um simulador: ele importa os mesmos arquivos `.sql` que vão
para o servidor, com as mesmas policies e o mesmo papel sem privilégio.

## O que o modo local deliberadamente NÃO faz

Isto é a parte que mais importa deste registro. Cada função abaixo, em
`apps/web/src/dados/local.ts`, **lança um erro dizendo que aquilo exige a API**,
em vez de fingir:

- entrada por senha, recuperação de senha e troca de senha (no modo local a
  entrada é escolha de perfil, e uma verificação de senha fingida daria a
  impressão de que existe autenticação onde não existe);
- laudo e termo de interdição (são gerados no servidor, de propósito: ver o
  README do produto);
- exportação em CSV e o registro de quem exportou;
- auditoria consultável e o resumo do período;
- galeria de evidência, que devolve lista vazia, porque não há foto nenhuma
  gravada no modo local;
- encerrar sessão não revoga nada, porque não há sessão no servidor para
  revogar.

A regra que orienta as ausências: **é melhor recusar dizendo por quê do que
mostrar meia funcionalidade.** Uma tela que responde algo plausível esconde a
limitação até o momento em que ela custa caro.

## Consequências

Boas:

- A demonstração abre sem instalar nada, e o que ela mostra é o comportamento
  real do banco, incluindo o isolamento entre os dois municípios fictícios.
- Um defeito de RLS aparece na demonstração, e não só em produção.
- Trocar PGlite por um Postgres gerenciado é trocar a origem da conexão em
  `src/dados/banco.ts`; as regras já estão no banco.

Ruins:

- **Duas implementações da mesma porta são duas coisas para manter.** Uma
  função nova precisa nascer nas duas, ou nascer na local com a recusa escrita.
- Uma suíte de ponta a ponta para cada modo (`fluxo.e2e.mjs` e
  `fluxo-api.e2e.mjs`), o que dobra o tempo de verificação no navegador.
- **O modo local é inviável no Safari.** Medido: o banco leva cerca de 163
  segundos para abrir no motor do WebKit, contra poucos segundos no Chromium e
  no Firefox. Existe um teto de vinte segundos que cai para banco em memória e
  avisa na tela, mas cada escrita continua lenta a ponto de parecer travada. Em
  Mac e iPad, o caminho é o modo API.
- O primeiro carregamento baixa cerca de 13 MB de WebAssembly, o que é ruim
  justamente na conexão de prefeitura em que a demonstração acontece.
- Quem só conhece o modo local pode achar que o produto tem autenticação e
  documentos quando ainda não os viu funcionando.

## Alternativas descartadas

| Alternativa | Por que não |
| --- | --- |
| Dados falsos em memória para a demonstração | O isolamento entre municípios só seria testado de verdade em produção. É o risco mais caro do produto. |
| Só o modo API, com servidor local na demonstração | Exige instalar Node e subir dois processos no notebook de quem vai assistir, e é o passo em que uma demonstração morre. |
| Duas aplicações separadas, uma de vitrine e uma real | Elas divergem em semanas, e a vitrine passa a mostrar um produto que não existe. |
| Um `if (modo === "local")` dentro de cada página | Espalha a decisão por toda a interface, e a primeira página que esquecer o `if` quebra no modo errado. |

## Onde isto vive

- Implementa: `dc360/apps/web/src/dados/repositorio.ts` (a porta),
  `dc360/apps/web/src/dados/local.ts`, `dc360/apps/web/src/dados/http.ts`,
  `dc360/apps/web/src/dados/banco.ts` (PGlite, teto de espera e prova de
  escrita na abertura).
- Defende: `dc360/apps/web/test/fluxo.e2e.mjs` (modo local) e
  `dc360/apps/web/test/fluxo-api.e2e.mjs` (modo API), que exercitam os dois
  caminhos no navegador de verdade.
