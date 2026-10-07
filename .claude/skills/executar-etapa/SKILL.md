---
name: executar-etapa
description: Executa UMA etapa do Roadmap V2 do Defesa Civil 360 (pedido "Execute V2-Fnn-Enn") como IMPLEMENTADOR, pela política D-30. Reconstrói o contexto pelo repositório, implementa só o escopo, testa, arquiva a evidência e termina em COMMIT CANDIDATO com push no ramo da fase. Nunca marca a etapa como validada nem concluída.
---

# Executar uma etapa da V2 (papel: implementador)

Você executa UMA etapa do Roadmap V2 no repositório `C:/Projetos/city-hall` (produto em `dc360/`). Política completa: `docs/roadmap-v2/28-execucao-e-validacao.md`. Armadilhas do ambiente: `docs/roadmap-v2/29-operacao-do-ambiente.md`.

**Você não lembra o projeto.** Não use conversa anterior, handoff ou memória como fonte de verdade: o repositório é a memória. Se algo que você "lembra" diverge do repositório, vale o repositório e você registra a divergência.

## 1. Reconstruir o contexto

1. Rode `node scripts/roadmap/contexto.mjs V2-Fnn-Enn` (na raiz). Ele mostra o bloco da etapa, o gate anterior, os CPs, as decisões, as tags, os validadores que vão te avaliar e as travas.
2. Leia `docs/roadmap-v2/ESTADO-ATUAL.md` e rode `node scripts/roadmap/gerar-estado.mjs --conferir`. Confira: você está no ramo da fase (`v2/fnn`), sincronizado com o remoto, com `git status` limpo. Se não estiver, PARE e registre o que achou.
3. Travas: gate anterior não aprovado, CP citado aberto ou dependência não concluída deixam a etapa BLOQUEADA (registre no STATUS com o motivo e passe para a próxima etapa desbloqueada). Nunca decida um CP por Rafael. Se o roadmap contradiz o código, registre e escale (gatilho 7 da seção 12 de `28`): não escolha sozinho.
4. Leia só o que o pacote apontar: `CLAUDE.md` (regras do produto), as decisões e ADRs citados, os arquivos de código da etapa. Não leia o STATUS inteiro nem etapas futuras.

## 2. Implementar

1. Rode a regressão seletiva ANTES de mexer (o que já estava vermelho) e guarde a saída. `dc360/scripts/baseline.mjs --so=...` serve quando o passo existe lá.
2. Implemente SÓ "O que deve ser implementado", respeitando "O que NÃO deve ser implementado nesta etapa". Comentários no estilo do repositório (português, explicam o porquê).
3. Escreva os testes dos cinco campos da etapa (positivos, negativos, autorização e isolamento, regressão, E2E). Em etapa de correção, o teste negativo falha antes do conserto e passa depois: arquive as duas saídas (é a prova de que o teste morde, exigida em risco alto e crítico). Rode `npm run test:isolamento` sempre que tocar banco, autorização ou API.
4. Etapa de interface: capturas reais com Playwright (1280 e 390 px, claro e escuro, estados normal, vazio e erro; 320 e 768 px quando a etapa pedir).
5. Nunca declare testado o que não rodou. Se o ambiente impede um teste, diga qual e por quê.
6. Premissa que você precisou assumir vai para a seção 9 do STATUS com o rótulo PREMISSA: é pendência do Rafael, não fato.

## 3. Arquivar

1. Evidência em `docs/evidencias-v2/Gnn/V2-Fnn-Enn/` com `INDEX.md` (SHA-256 por arquivo, `montarIndice` de `dc360/scripts/baseline.mjs`). Saída bruta passa por `redigir`. Sem segredo, sem dado real.
2. `RESUMO.md` em DUAS partes com estes títulos exatos: `## Fatos` (o que mudou, comandos, números, arquivos, limitações) e `## Justificativa` (por que). O validador recebe só os Fatos.
3. Documentação listada na etapa atualizada. `npm run conferir:numeros` e o portão de conteúdo (`cd dc360 && npx vitest run --root packages/shared test/regras-de-conteudo.test.ts`) verdes.

## 4. Commit candidato e parada

Um commit não consegue citar o próprio SHA, por isso são dois commits:

1. **Commit candidato** `V2-Fnn-Enn: candidato, <resumo>` com o código, os testes, a evidência e a documentação (mensagem num arquivo do scratchpad, `git commit -F`). A linha da etapa no STATUS continua `EM ANDAMENTO` neste commit.
2. **Commit de registro do candidato** `V2-Fnn-Enn: registro do candidato <sha7>`, tocando SÓ `docs/roadmap-v2/STATUS.md` e `docs/roadmap-v2/ESTADO-ATUAL.md`: a linha da etapa vira `IMPLEMENTADA` com "candidato `<sha7>`" na observação, seção 1 e diário (seção 10) com data ISO; rode `node scripts/roadmap/gerar-estado.mjs` e depois `--conferir` antes de commitar. Como só toca arquivos da lista permitida, ele não invalida a validação do candidato.
3. Push do ramo da fase. Sem amend, rebase ou force-push.
4. PARE a etapa. Nunca marque VALIDADA nem CONCLUÍDA: isso é do gatekeeper (skill `validar-etapa`, sessão nova) e do Rafael.
5. Encerre a sessão se algum gatilho da seção 13 de `28` disparou (fase nova, risco crítico, contexto compactado, mudança de domínio). Senão, siga para a próxima etapa pela mesma skill.

## Relatório final (no máximo 250 palavras)

Etapa, SHA do candidato, arquivos, testes com números reais (separando o que já era vermelho antes), limitações, premissas, pendências humanas previstas e o que a validação precisa saber. Seja fiel: se algo falhou, diga.
