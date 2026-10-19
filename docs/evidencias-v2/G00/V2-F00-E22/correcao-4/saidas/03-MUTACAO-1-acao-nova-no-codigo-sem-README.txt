$ cd packages/shared && npx vitest run test/permissoes-no-readme.test.ts
(cwd dc360/, código de saída 1)


 RUN  v3.2.7 /Users/[usuario]/Documents/city-hall/dc360/packages/shared

 ❯ test/permissoes-no-readme.test.ts (8 tests | 3 failed) 8ms
   × Tabela de permissões do README presa ao catálogo do pacote compartilhado > o README traz exatamente a tabela gerada de acoesDoPapel (nem falta, nem sobra ação) 4ms
     → gere a tabela de novo e cole abaixo do marcador: expected [ Array(1) ] to deeply equal []
   ✓ Tabela de permissões do README presa ao catálogo do pacote compartilhado > o catálogo é coerente: todo rótulo é único e não vazio, e toda ação do catálogo é de alguém 1ms
   ✓ Tabela de permissões do README presa ao catálogo do pacote compartilhado > o README lista, no total, todas as ações do catálogo (nenhuma some da tabela inteira) 0ms
   × Tabela de permissões do README presa ao catálogo do pacote compartilhado > mordida > a tabela atual passa (controle) 0ms
     → expected [ Array(1) ] to deeply equal []
   ✓ Tabela de permissões do README presa ao catálogo do pacote compartilhado > mordida > ação que FALTA no README é acusada, com o nome do papel e da ação 0ms
   ✓ Tabela de permissões do README presa ao catálogo do pacote compartilhado > mordida > ação que SOBRA no README é acusada 0ms
   × Tabela de permissões do README presa ao catálogo do pacote compartilhado > mordida > papel sem linha, linha de papel inexistente e ordem trocada são acusados 1ms
     → expected '# Defesa Civil Operacional 360, produ…' not to be '# Defesa Civil Operacional 360, produ…' // Object.is equality
   ✓ Tabela de permissões do README presa ao catálogo do pacote compartilhado > mordida > README sem o marcador falha em voz alta (a tabela não pode perder a amarra) 0ms

 Test Files  1 failed (1)
      Tests  3 failed | 5 passed (8)
   Start at  02:49:28
   Duration  251ms (transform 64ms, setup 0ms, collect 83ms, tests 8ms, environment 0ms, prepare 34ms)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/permissoes-no-readme.test.ts > Tabela de permissões do README presa ao catálogo do pacote compartilhado > o README traz exatamente a tabela gerada de acoesDoPapel (nem falta, nem sobra ação)
AssertionError: gere a tabela de novo e cole abaixo do marcador: expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "operador: faltam [exportar dados], nada sobra. Linha certa: | Operador de plantão | registrar ocorrência, registrar a resposta de uma providência, consultar os ofícios de encaminhamento, acompanhar quem está em campo agora, exportar dados |",
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
+   "operador: faltam [exportar dados], nada sobra. Linha certa: | Operador de plantão | registrar ocorrência, registrar a resposta de uma providência, consultar os ofícios de encaminhamento, acompanhar quem está em campo agora, exportar dados |",
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

 FAIL  test/permissoes-no-readme.test.ts > Tabela de permissões do README presa ao catálogo do pacote compartilhado > mordida > papel sem linha, linha de papel inexistente e ordem trocada são acusados
AssertionError: expected '# Defesa Civil Operacional 360, produ…' not to be '# Defesa Civil Operacional 360, produ…' // Object.is equality
 ❯ test/permissoes-no-readme.test.ts:150:27
    148|       const [a, b] = acoesDoPapel("operador").map((x) => ROTULO_ACAO[x…
    149|       const trocada = texto.replace(op, op.replace(`${a}, ${b}`, `${b}…
    150|       expect(trocada).not.toBe(texto);
       |                           ^
    151|       expect(diferencas(trocada).join("\n")).toContain("a ordem difere…
    152|     });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯

