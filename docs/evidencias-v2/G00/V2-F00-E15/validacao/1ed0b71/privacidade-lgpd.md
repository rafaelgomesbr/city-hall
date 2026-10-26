---
validador: privacidade-lgpd
modelo: claude-sonnet-5-5
etapa: V2-F00-E15
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2, E3a]
nivel_de_prova_obtido: [E1, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: pendência humana registrada (bloqueio de piloto: acolherNoAparelho falha aberto, dono V2-F14-E02, decisão do Rafael)
---
## Critérios verificados

Critério da etapa ("Impacto LGPD"): "reforça o aviso antes de apagar dado de coleta; nenhum dado novo". Risco de segurança: "o apagamento é regra de privacidade para aparelho compartilhado (quem entra depois não vê o dado de quem saiu); a etapa só avisa, não muda a regra". Autorização e isolamento: "outro agente entra no aparelho com o rascunho do primeiro: `acolherNoAparelho` limpa (regra mantida); a mesma pessoa reencontra a vistoria".

Inventário dos dados pessoais no aparelho (campo, onde nasce, onde fica, quem lê, quanto tempo):

| Dado | Nasce | Fica | Quem lê | Prazo |
| --- | --- | --- | --- | --- |
| rascunho de vistoria: checklist, observações, nome do morador que assina, coordenada, precisão do GPS | tela `vistoria/[id].tsx` | SQLite local, tabela `rascunhos` (`dados/rascunho.ts`), em texto claro | o dono do dado local | até concluir, sair da conta ou outra pessoa entrar |
| fotos e assinatura do rascunho | câmera e tela de assinatura | arquivos em `Paths.document` (`foto-*`, `assinatura-*`) | idem | idem |
| coleta pendente (envelope, assinatura, fotos) | conclusão da vistoria | `fila_sincronizacao` e arquivos; carimbo de autor no item | só o autor (o dreno envia só o que é de quem está logado) | até o servidor confirmar; sem prazo máximo hoje (PENDENCIAS, dono F05-E09) |
| credencial (acesso e renovação) e identidade | login | cofre `expo-secure-store` com `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (`dados/sessao.tsx:81-85`) | o aplicativo | até sair ou a sessão vencer |
| marca do dono dos dados locais | `acolherNoAparelho` e `encerrarSessaoVencida` | tabela `marcas` | o aplicativo | junto do dado |
| ficha de push | registro do aparelho | `ficha-do-aparelho` | o aplicativo | esquecida depois de `sair` e de `encerrarSessaoVencida` |

Fluxo e controles com arquivo e linha:
- Entrada: `entrar` (`dados/sessao.tsx:186`) chama `await acolherNoAparelho(usuarioId)` ANTES de guardar a credencial e abrir a identidade; `acolherNoAparelho` (`dados/banco-local.ts:255`) apaga só quando o disco tem dono e o dono é outra pessoa; sem dono, não apaga e carimba.
- Saída explícita: `sair` apaga credencial, identidade e `apagarDadosLocais` (`banco-local.ts:298`: rascunhos, pendências, marcas, coletas, arquivos de prova fora da fila, foto de perfil); NÃO apaga a fila (item carimbado com o autor).
- Sessão vencida: `encerrarSessaoVencida` tira credencial e identidade, carimba o dono e preserva o disco (a mesma pessoa reencontra).
- Aviso: `dados/aviso-da-saida.ts` conta rascunhos, fotos e assinatura sem guardar dado de ninguém (`contarRascunhos`); disco que não responde vira aviso de "não deu para conferir".

## Evidência

- Jest do aplicativo, 7 arquivos, 58 testes, código 0, no SHA: `entrar-de-outra-pessoa-limpa-o-aparelho` (10), `a-sessao-vencida-nao-apaga-a-vistoria`, `vistoria-sessao-vencida-preserva-o-rascunho`, `sair-e-entrar-nao-perde-a-coleta`, `aviso-da-saida`, `dialogo-na-conta-com-vistoria-comecada` (11), `precisao-do-gps`: `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/campo-e15.txt`.
- Os testes usam o `ProvedorDeSessao` e o banco local reais sobre SQLite do Node; só cofre, rede e disco de arquivos são simulados. NÃO há emulador nem aparelho nesta máquina: nada foi rodado em aparelho.
- Mutações que fiz no código de produção e DESFIZ (`git restore` e `cmp`, `git status` sem mudança rastreada):
  1. `sair` sem apagar a credencial do cofre: reprova 1 caso ("'Sair da conta' tira a credencial e a identidade do cofre"), 10 verdes (`/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/mut-e15-cofre.txt`).
  2. `entrar` sem chamar `acolherNoAparelho`: 5 reprovam de 16 (`/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/mut-e15-acolher.txt`).
  3. `apagarDadosLocais` sem `DELETE FROM rascunhos`: 6 reprovam de 16 (`/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/mut-e15-delete.txt`).
- Sonda de falha na limpeza (copiei o harness de `entrar-de-outra-pessoa-limpa-o-aparelho.test.tsx` num arquivo temporário já removido; saída em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/lgpd/campo-sonda-falha-aberta.txt`): ver Tentativas de reprovar, 1.

## Cenários positivos

A mesma pessoa que entra de novo depois de sessão vencida reencontra rascunho, foto e assinatura (teste de contraste do arquivo `entrar-de-outra-pessoa...`). Sair apaga o rascunho e mantém a fila e a assinatura dela.

## Cenários negativos

Outra pessoa entra depois de sessão vencida e depois de "Sair da conta": rascunho vazio, foto e assinatura do rascunho fora do disco, item da fila da Ana intacto e `pendente`, dono do disco é o Bruno. A limpeza que demora segura a entrada (ordem provada). Sem dono marcado, quem entra não apaga e vira o dono. Com a marca apagada, a sessão vencida a reescreve e o próximo limpa. Credencial e identidade da Ana não sobram no cofre depois de sair nem de sessão vencida, e o cofre guarda só o Bruno depois que ele entra.

## Tentativas de reprovar

1. FALHA ABERTA, REPRODUZIDA NO SHA. Fiz o `DELETE FROM rascunhos` do SQLite falhar (disco cheio simulado) e o Bruno entrar depois de a sessão da Ana vencer: `RESULTADO_SONDA_FALHA_ABERTA {"identidade":"bruno","rascunhosVisiveis":1,"nomeDaMoradora":"Moradora de exemplo","dono":"bruno"}`. A limpeza engole o erro (`banco-local.ts:348`, `console.warn`), `acolherNoAparelho` devolve `apagou: true`, carimba o Bruno e a tela dele lê o rascunho da Ana, com o nome da moradora que assinou. É o achado "bloqueio de piloto" já registrado (`docs/roadmap-v2/pendencias-humanas.md:73`, dono V2-F14-E02), anterior à F00 e fora do critério da E15 (que mantém a regra). Continua aberto.
2. Fiz o apagamento dos arquivos falhar (`File.delete` lança): o banco é limpo, mas `foto-*.jpg` e `assinatura-*.png` da Ana permanecem no disco do Bruno (`RESULTADO_SONDA_ARQUIVO`). Sem rascunho apontando para eles a tela não os mostra; ficam como resíduo no armazenamento do aplicativo. Anotado.
3. Botão de perigo do diálogo (correção 2 da etapa): não repeti a mutação `destrutiva: false` por ser desenho de interface, fora desta dimensão; o arquivo `dialogo-na-conta-com-vistoria-comecada.test.tsx` (11 casos) rodou verde no SHA.
4. Procurei credencial remanescente no cofre depois de sair e de sessão vencida (mutações 1 e a suíte do cofre): nada sobra, e o teste reprova quando a limpeza é desfeita.
5. Procurei quem lê o cartão do aviso de saída por dado pessoal: o texto só conta vistorias, fotos e assinatura.

## Achados

- corrige antes de crescer, com `escalar`: `acolherNoAparelho` falha aberto (Tentativas de reprovar, 1). Não reprova a E15, mas é bloqueio de piloto sem risco aceito; o bloco da V2-F14-E02 ainda não exige falha fechada nem injeção de falha de disco (`pendencias-humanas.md:73`).
- anotado: a fila e os arquivos de coleta ficam no aparelho sem prazo; JPEG e PNG de coleta já enviada só saem no logout; o original da câmera no cache nunca é apagado; coordenada gravada com 6 casas; resíduo de WAL do SQLite. Todos em `apps/campo/PENDENCIAS.md` (linhas 522 a 535) com dono provável (F05-E09, F05-E10, F14-E02, F14-E04, F14-E15).
- anotado: os dados locais ficam em texto claro (SQLite e arquivos) até a V2-F14-E04 (criptografia local).
- anotado: apagamento de arquivo que falha deixa resíduo de foto e assinatura (Tentativas de reprovar, 2).

## Não verificado

- Comportamento no Android e no iOS reais: `expo-secure-store` (Keychain e Keystore), `expo-sqlite` nativo, `expo-file-system` e o ciclo de vida do aplicativo. Os testes simulam essas camadas; não há emulador nem aparelho aqui. A prova física é V2-F14-E12 e a validação humana (Rafael) da etapa.
- Efeito de um fim de processo do aplicativo no meio da limpeza (queda entre o `DELETE` e a marca de dono).
- Backup do sistema operacional (Android Auto Backup e backup do iOS): se o SQLite e os arquivos entram no backup do usuário.
- Captura de tela do diálogo (aplicativo Expo não renderiza aqui).
- Base legal, papel do município e prazo de guarda do dado de coleta no aparelho: profissional.

## Risco residual

Falha de disco na troca de pessoa expõe o rascunho do colega e o atribui ao seguinte; dado de coleta em texto claro no aparelho; fila sem prazo máximo.

## Motivo do humano

Rafael precisa decidir o dono e o bloco da falha fechada de `acolherNoAparelho` antes de qualquer piloto (pendência humana já registrada) e fazer os dois fluxos num aparelho (sair com vistoria começada; GPS abaixo de meio metro). Um profissional precisa avaliar a política de retenção do dado de coleta no aparelho e a criptografia local.
