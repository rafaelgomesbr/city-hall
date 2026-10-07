# CP-02: saída a campo, implementar no app ou retirar a promessa

- **Registrado em:** 2026-10-07, pela V2-F00-E24.
- **Origem:** DP:K14, BZ-N:N.6. Bloco completo em `docs/roadmap-v2/18-checkpoints.md`.
- **Situação no STATUS (seção 7):** DECIDIDO, como premissa a confirmar.

## A decisão registrada

Em 2026-10-01 ficou registrada a premissa D-25 (`docs/roadmap-v2/01-decisoes-e-principios.md`,
seção 11): **implementar a saída a campo no aplicativo do agente** (alternativa A),
com a recomendação técnica "A com B imediato": a documentação e a apresentação
deixam de afirmar como pronto o que o aplicativo não faz, já na F00, e a
implementação fica para a V2-F14-E01 (declarar, prorrogar, retorno e `/minha`).

## O que NÃO está confirmado

A D-25 é PREMISSA. Este arquivo não contém a confirmação de Rafael nem a de
Alyson: nenhuma das duas existe por escrito no repositório até 2026-10-07.
Por isso a documentação ajustada pela V2-F00-E24 diz "planejado, sem data
marcada" e não promete prazo a município.

Se a premissa for revertida (alternativa B, retirar a promessa), o texto de
ressalva vira retirada: os mesmos arquivos listados abaixo, sem mexer em API
nem painel.

## Estado do produto que motivou o checkpoint (conferido em 2026-10-07)

| Peça | Estado | Onde |
| --- | --- | --- |
| API | Pronta: declarar, prorrogar, retorno, `/minha`, lista e encerramento pela coordenação | `dc360/apps/api/src/rotas/saida-a-campo.ts`, montada em `dc360/apps/api/src/servidor.ts` |
| Painel | Pronto: tela "Quem está em campo" e encerramento com desfecho | `dc360/apps/web/src/paginas/QuemEstaEmCampo.tsx` |
| Aplicativo de campo | NÃO declara, não prorroga, não confirma retorno, não chama `/minha`. Só lê o booleano `emCampo` dos colegas da equipe | `dc360/apps/campo/src/dados/api.ts` (única menção a `/saida-a-campo` é um comentário) |

## Documentos ajustados (V2-F00-E24)

`dc360/docs/SEGURANCA-DO-AGENTE.md`, `dc360/docs/CARTAO-DO-AGENTE.md`,
`dc360/docs/GUIA-DO-COORDENADOR.md`, `dc360/docs/LEIA-ME.md`, `dc360/README.md`
(seção "O agente que sobe o morro sozinho") e
`dc360/docs/apresentacao/2026-09-15-para-o-alyson.html` com o PDF regenerado.
O diff está em `docs/evidencias-v2/G00/V2-F00-E24/diff-dos-documentos.txt`.

## Pendência humana

- Rafael e Alyson confirmam (ou revertem) a premissa D-25.
- Rafael e Alyson leem a apresentação ajustada antes de qualquer demonstração a
  município que mencione o recurso. Até a V2-F14-E01 entregar a parte do
  aplicativo, a demonstração não pode mostrar a saída a campo como pronta.
