$ cd packages/shared && npx vitest run test/permissoes-no-readme.test.ts
(cwd dc360/, código de saída 1)


 RUN  v3.2.7 /Users/[usuario]/Documents/city-hall/dc360/packages/shared

 ❯ test/permissoes-no-readme.test.ts (8 tests | 3 failed) 8ms
   × Tabela de permissões do README presa ao catálogo do pacote compartilhado > o README traz exatamente a tabela gerada de acoesDoPapel (nem falta, nem sobra ação) 4ms
     → gere a tabela de novo e cole abaixo do marcador: expected [ Array(1) ] to deeply equal []
   ✓ Tabela de permissões do README presa ao catálogo do pacote compartilhado > o catálogo é coerente: todo rótulo é único e não vazio, e toda ação do catálogo é de alguém 1ms
   ✓ Tabela de permissões do README presa ao catálogo do pacote compartilhado > o README lista, no total, todas as ações do catálogo (nenhuma some da tabela inteira) 0ms
   × Tabela de permissões do README presa ao catálogo do pacote compartilhado > mordida > a tabela atual passa (controle) 1ms
     → expected [ Array(1) ] to deeply equal []
   × Tabela de permissões do README presa ao catálogo do pacote compartilhado > mordida > ação que FALTA no README é acusada, com o nome do papel e da ação 0ms
     → expected 0 to be greater than 0
   ✓ Tabela de permissões do README presa ao catálogo do pacote compartilhado > mordida > ação que SOBRA no README é acusada 0ms
   ✓ Tabela de permissões do README presa ao catálogo do pacote compartilhado > mordida > papel sem linha, linha de papel inexistente e ordem trocada são acusados 1ms
   ✓ Tabela de permissões do README presa ao catálogo do pacote compartilhado > mordida > README sem o marcador falha em voz alta (a tabela não pode perder a amarra) 0ms

 Test Files  1 failed (1)
      Tests  3 failed | 5 passed (8)
   Start at  02:49:29
   Duration  251ms (transform 65ms, setup 0ms, collect 84ms, tests 8ms, environment 0ms, prepare 28ms)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/permissoes-no-readme.test.ts > Tabela de permissões do README presa ao catálogo do pacote compartilhado > o README traz exatamente a tabela gerada de acoesDoPapel (nem falta, nem sobra ação)
AssertionError: gere a tabela de novo e cole abaixo do marcador: expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "coordenador: nada falta, sobram [levantar a interdição de um imóvel]. Linha certa: | Coordenador | registrar ocorrência, classificar na triagem, despachar equipe, encaminhar providência, registrar a resposta de uma providência, encerrar ocorrência, emitir laudo ou termo de interdição, consultar os ofícios de encaminhamento, gerenciar equipes, gerenciar usuários, consultar a trilha de auditoria, exportar dados, acompanhar quem está em campo agora |",
+ ]

 ❯ test/permissoes-no-readme.test.ts:93:82
     91| 
     92|   it("o README traz exatamente a tabela gerada de acoesDoPapel (nem fa…
     93|     expect(diferencas(texto), "gere a tabela de novo e cole abaixo do …
       |                                                                                  ^
     94|   });
     95| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  test/permissoes-no-readme.test.ts > Tabela de permissões do README presa ao catálogo do pacote compartilhado > mordida > a tabela atual passa (controle)
AssertionError: expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "coordenador: nada falta, sobram [levantar a interdição de um imóvel]. Linha certa: | Coordenador | registrar ocorrência, classificar na triagem, despachar equipe, encaminhar providência, registrar a resposta de uma providência, encerrar ocorrência, emitir laudo ou termo de interdição, consultar os ofícios de encaminhamento, gerenciar equipes, gerenciar usuários, consultar a trilha de auditoria, exportar dados, acompanhar quem está em campo agora |",
+ ]

 ❯ igual test/permissoes-no-readme.test.ts:121:56
    119|   */
    120|   describe("mordida", () => {
    121|     const igual = (t: string) => expect(diferencas(t)).toEqual([]);
       |                                                        ^
    122| 
    123|     it("a tabela atual passa (controle)", () => igual(texto));
 ❯ test/permissoes-no-readme.test.ts:123:49

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  test/permissoes-no-readme.test.ts > Tabela de permissões do README presa ao catálogo do pacote compartilhado > mordida > ação que FALTA no README é acusada, com o nome do papel e da ação
AssertionError: expected 0 to be greater than 0
 ❯ test/permissoes-no-readme.test.ts:130:24
    128|       expect(mutado).not.toBe(texto);
    129|       const d = diferencas(mutado);
    130|       expect(d.length).toBeGreaterThan(0);
       |                        ^
    131|       expect(d.join("\n")).toContain(`faltam [${rotulo}]`);
    132|     });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯

