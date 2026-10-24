## O que muda e por quê

<!-- Uma ou duas frases. Se for etapa do roadmap, o ID: V2-Fnn-Enn. -->

## Como foi conferido

<!-- Comandos que você rodou e o resultado. Nada de "deve funcionar". -->

## Auto-aprovação (enquanto houver uma só pessoa contribuindo)

Este checklist é a revisão: cada item marcado é uma afirmação que o autor
assume. Item que não se aplica fica marcado com "n/a" e o motivo ao lado. Os
checks obrigatórios do CI só provam o que eles cobrem, o resto está aqui.

- [ ] **Gates locais:** `npm run verificar` (em `dc360/`) passou na minha máquina, ou digo abaixo qual parte não rodou e por quê.
- [ ] **Escopo:** o PR faz só o que o título diz, sem arquivo de outra etapa.
- [ ] **Migração aditiva:** se há migração, ela só acrescenta (tabela, coluna anulável ou com default, índice). Nada de `DROP`, renomear ou apertar coluna em uso.
- [ ] **Rollback:** sei desfazer isto (reverter o PR, desligar a flag, restaurar a cópia) e escrevi como logo abaixo.
- [ ] **Evidência:** a prova está arquivada em `docs/evidencias-v2/` (saída dos testes e, em tela, capturas reais), sem segredo nem dado real.
- [ ] **Isolamento e autorização:** nada aqui lê ou escreve sem `organizacao_id` do token verificado, e toda escrita passa por `exigirPermissao`. Se tocou banco, autorização ou API, rodei `npm run test:isolamento`.
- [ ] **Segredos:** não há chave, token, senha ou dado de pessoa real no diff nem na descrição.
- [ ] **Texto:** português do Brasil, sem travessão, sem norma inventada.
- [ ] **Registro:** se mexi no estado do roadmap, o `STATUS.md` e o `ESTADO-ATUAL.md` batem com o que está no repositório.

### Como desfazer

<!-- Obrigatório quando houver migração, mudança de configuração ou de workflow. -->

### Pendências e riscos conhecidos

<!-- O que ficou de fora, o que depende do Rafael, o que pode quebrar. Se nada, escreva "nenhum". -->

### Auto-aprovado por

<!-- Seu nome e a data (AAAA-MM-DD). Este texto é o registro de revisão do merge. -->
