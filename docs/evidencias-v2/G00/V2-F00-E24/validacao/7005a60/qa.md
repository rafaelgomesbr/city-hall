---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E24
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: []
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

| Critério | Resultado | Prova |
| --- | --- | --- |
| Premissa de fato: o aplicativo não declara a saída | CONFIRMADA | `grep` em `dc360/apps/campo/src` por `saida-a-campo` e `declarar`: só leitura de "tem saída aberta" em `dados/api.ts:518`; nenhuma chamada de declarar, prorrogar, retorno ou `/minha`. |
| API e painel intocados, 27 provas verdes | PASS | `cd dc360/apps/api && npx vitest run test/saida-a-campo.test.ts`: 27 de 27. |
| `SEGURANCA-DO-AGENTE.md` | PASS | Aviso de abertura (linhas 8-21): "ainda não declara a saída ... Não conte com este recurso para a segurança de ninguém"; o resto é declarado como desenho. |
| `CARTAO-DO-AGENTE.md` | PASS | Passo 2 manda avisar a coordenação por rádio ou telefone, com a nota "O aplicativo ainda não registra a sua saída ... não avisa ninguém se você não voltar no prazo"; "Ao voltar" manda avisar pelo mesmo meio. Nenhum passo manda declarar no aplicativo. |
| `GUIA-DO-COORDENADOR.md` seção 9 | PASS | "Estado atual: a tela existe, mas fica vazia ... o sino não vai avisar de prazo estourado nenhum ... Tela vazia, hoje, não quer dizer que ninguém está no morro". Atende o risco de segurança que a etapa nomeia. |
| README "O agente que sobe o morro sozinho" | PASS | Aviso "Estado em 07/10/2026: pela metade, e a metade que falta é a do agente", com referência à V2-F14-E01 e ao CP-02. |
| `docs/LEIA-ME.md` | PASS | Linha 29 marca o documento como "Em construção". |
| Apresentação: selo "Pronto" vira "Parcial" no HTML e no PDF | PASS | `2026-09-15-para-o-alyson.html:394`: `p-parcial` "Parcial", com "O aplicativo do agente ainda não declara a saída ... hoje a tela fica vazia" e "Corrigido em 07/10/2026: a versão anterior desta tabela dizia Pronto". `pdftotext` do PDF (24 páginas) contém "Corrigido em 07/10/2026" (1 ocorrência), ou seja, o PDF foi regenerado. A linha 391 (perfil) também ressalva que o indicador depende da saída declarada. |
| `relatorio-apresentacao-alyson.html` e PDF na raiz | PASS | Sem menção a saída a campo, prazo estourado ou "sozinho". |
| CP-02 registrado | PASS com ressalva | `docs/evidencias-v2/CP-02/decisao.md` existe e diz com todas as letras que a D-25 é PREMISSA, sem confirmação escrita de Rafael nem de Alyson. |
| `regras-de-conteudo` verde | PASS | 8 de 8 (rodado na E20). |

## Evidência

Greps por "declar", "saída a campo", "sozinho", "Quem está em campo", "prazo estourado" em `dc360/docs`, `dc360/README.md`, `dc360/apps/campo/*.md`, `docs/*.md` e HTML da raiz; `pdftotext` do PDF; teste da API.

## Cenários positivos

Todo documento que descreve o recurso traz a ressalva no topo da seção.

## Cenários negativos

Procurei documento que mande o agente declarar no aplicativo ou diga "Pronto" para a segurança do agente: nenhum encontrado. Procurei no código do aplicativo texto de interface que prometa o recurso: nenhum (só comentários de código e o indicador de colega em `perfil.tsx:1132`).

## Tentativas de reprovar

1. Varredura por "declar" em todo `dc360/docs` e no README. Fora dos arquivos corrigidos, só `docs/DICIONARIO-DE-DADOS.md:317` e `docs/PRIVACIDADE.md:97 e :176` descrevem a tabela e o dado "que o agente declarou": descrevem o que a API guarda, como a etapa previu ("segue verdadeiro").
2. Procurei "Pronto" na linha de segurança do agente nas duas versões (HTML, PDF): só "Parcial".
3. Procurei a promessa em `IMPLANTACAO.md`, `COLOCAR-DE-PE.md`, `PAPEIS_E_RESPONSABILIDADES.md` e `LOJAS.md`: sem promessa de que o app declare.

## Achados

1. **Anotado.** `docs/PRIVACIDADE.md:97` ("Desde 14/09/2026 há mais uma categoria ... saída a campo declarada pelo agente ... ele mesmo declara") não diz que, enquanto o aplicativo não declara, essa categoria está vazia. Não induz decisão de segurança, mas quem lê a política pode supor que o dado já existe. Dono: E24 ou F14-E01.
2. **Anotado.** CP-02 é premissa (D-25), sem confirmação de Rafael e Alyson; a documentação honestamente diz "planejado, sem data". Se a decisão virar "retirar a promessa", os mesmos arquivos mudam.

## Não verificado

- Aparência do PDF renderizado (só o texto extraído).
- `docs/apresentacao/README.md` e o gerador `gerar-pdf.mjs` não foram reexecutados.
- Mockup (`mockup/`) e `docs/relatorios-v2/` (relatórios semanais) não varridos: não são material entregue a município.
- Se há outra cópia do PDF ou do HTML enviada fora do repositório.

## Risco residual

Baixo no repositório. Cópia anterior da apresentação já enviada a alguém continua com "Pronto".

## Motivo do humano

A etapa pede que Rafael e Alyson leiam a apresentação ajustada antes de qualquer demonstração a município, e que confirmem o CP-02, hoje só premissa.
