---
validador: privacidade-lgpd
modelo: claude-sonnet-5-5
etapa: V2-F00-E17
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [LGPD, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Inventário: o script `dc360/scripts/copiar-producao.mjs` faz `pg_dump` da produção, que contém dado real de cidadão (endereço, coordenada, nome e contato do solicitante, vulnerabilidade). Fluxo: banco de produção, arquivo `.dump` com permissão 0600 em `~/dc360-copias`, uso antes de migrar, apagar depois. Controles: recusa da pasta quando está no repositório, em nuvem de arquivos ou na Área de Trabalho (`razaoParaRecusarAPasta`, linha 111), janela de 30 minutos para o migrador exigir a cópia.

A recusa existe para impedir que o dump de produção (dado real) caia em pasta versionada, sincronizada com nuvem ou esquecida na Área de Trabalho. Dado de teste não é o alvo.

Critério da etapa, "os cinco lugares recusados continuam recusados" (bloco, Testes negativos): `scripts/copiar-producao.test.mjs` com `join` e `parse(...).root` recusa repositório, `Mobile Documents`, `Dropbox`, `Google Drive`, `OneDrive` e Desktop, e aceita `dc360-copias`. `node --test scripts/copiar-producao.test.mjs`: 13 de 13, saída 0. A E17 só mudou o teste; `copiar-producao.mjs` não foi tocado (último commit: 5ecdf4c), então a etapa não enfraqueceu a proteção.

Falha de caixa, provada executando a função (`scratchpad/sonda-e17.mjs`, nesta máquina Windows, RAIZ `C:\Projetos\city-hall\dc360`):

| Entrada | Resultado |
| --- | --- |
| `C:/Projetos/city-hall/dc360/copias` | RECUSA |
| `c:/projetos/city-hall/dc360/copias` | ACEITA |
| `c:/projetos/CITY-HALL/dc360/copias` | ACEITA |
| `C:/Users/Rfasg/OneDrive/copias` | RECUSA |
| `C:/Users/Rfasg/onedrive/copias` e `ONEDRIVE` | ACEITA |
| `C:/Users/Rfasg/dropbox/x`, `google drive/x` | ACEITA |
| `C:/Users/Rfasg/Desktop/x` | RECUSA |
| `C:/Users/Rfasg/desktop/x`, `c:/users/rfasg/Desktop/x` | ACEITA |

Defeito confirmado: a comparação (`startsWith`, `includes`, `===`) distingue caixa, e o Windows não. Em outra caixa, repositório, nuvem e Desktop passam como válidos.

É vazamento possível hoje? Não pelos caminhos reais do código:
- O único chamador (`:220`) passa `PASTA_DE_COPIAS = join(homedir(), "dc360-copias")` (linha 76), fixa, derivada da pasta do usuário que o sistema operacional devolve. Não há flag, variável de ambiente nem argumento para escolher a pasta: o operador não consegue digitar `onedrive` em outra caixa.
- O dump só cairia em nuvem se a própria pasta do usuário estivesse numa raiz de nuvem escrita em caixa diferente do esperado, ou se um chamador futuro passasse caminho livre. Nesta máquina existe `C:\Users\Rfasg\OneDrive`, mas `~/dc360-copias` está ao lado dele, não dentro.
- A função é exportada e testada, e a defesa deveria ser robusta antes de alguém ligar um argumento de pasta.

Preexistente e fora do bloco ("reescrever sem enfraquecer"); o implementador não enfraqueceu. O validador de entrega já anotou corretamente.

## Evidência
- `node scratchpad/sonda-e17.mjs`: saída 0, tabela acima.
- `node --test scripts/copiar-producao.test.mjs`: 13 de 13.
- CI 37739535524, 9 de 9.

## Cenários positivos
Pasta fora dos cinco lugares é aceita (`dc360-copias`).

## Cenários negativos
Os cinco lugares na caixa canônica são recusados nas duas plataformas (testes).

## Tentativas de reprovar
- Variantes de caixa de repositório, OneDrive, Dropbox, Desktop: todas aceitas indevidamente (acima).
- Procurei entrada de pasta controlada por quem opera: não há.
- Procurei `google drive` com espaço: aceito, mas o nome da lista é `Google Drive`/`GoogleDrive`.

## Achados
1. corrige antes de crescer. `razaoParaRecusarAPasta` deve comparar sem distinguir caixa quando `process.platform` é `win32` ou `darwin`, e incluir "Meu Drive" e "OneDrive - ..." já coberto por `includes`. Sem exploração hoje, porque a pasta é fixa. Corrigir antes de qualquer opção de pasta personalizada.
2. anotado. O script é pensado para Mac (chaveiro, Homebrew); a portabilidade da E17 foi só do teste.

## Não verificado
- Execução do `pg_dump` real, restore e permissão 0600 no Windows (sem banco de produção; não aplicável).
- Se a pasta do usuário de quem opera é redirecionada para nuvem: depende da máquina da pessoa.

## Risco residual
Baixo. Nenhum vazamento alcançável com a pasta fixa; defeito latente de caixa.

## Motivo do humano
Não preciso de pessoa para o veredito. O prazo para apagar a cópia depois da migração é procedimento humano.
