$ cd packages/shared && npx vitest run test/permissoes-no-readme.test.ts
(cwd dc360/, código de saída 1)


 RUN  v3.2.7 /Users/[usuario]/Documents/city-hall/dc360/packages/shared

 ❯ test/permissoes-no-readme.test.ts (10 tests | 4 failed) 10ms
   × Tabela de permissões do README presa ao catálogo do pacote compartilhado > o README traz exatamente a tabela gerada de acoesDoPapel (nem falta, nem sobra ação) 5ms
     → gere a tabela de novo e cole abaixo do marcador: expected [ Array(1) ] to deeply equal []
   ✓ Tabela de permissões do README presa ao catálogo do pacote compartilhado > o catálogo é coerente: todo rótulo é único e não vazio, e toda ação do catálogo é de alguém 1ms
   ✓ Tabela de permissões do README presa ao catálogo do pacote compartilhado > o README lista, no total, todas as ações do catálogo (nenhuma some da tabela inteira) 0ms
   × Tabela de permissões do README presa ao catálogo do pacote compartilhado > mordida > a tabela atual passa (controle) 1ms
     → expected [ Array(1) ] to deeply equal []
   ✓ Tabela de permissões do README presa ao catálogo do pacote compartilhado > mordida > ação que FALTA no README é acusada, com o nome do papel e da ação 0ms
   ✓ Tabela de permissões do README presa ao catálogo do pacote compartilhado > mordida > ação que SOBRA no README é acusada 0ms
   × Tabela de permissões do README presa ao catálogo do pacote compartilhado > mordida > papel sem linha, linha de papel inexistente e ordem trocada são acusados 1ms
     → expected '# Defesa Civil Operacional 360, produ…' not to be '# Defesa Civil Operacional 360, produ…' // Object.is equality
   ✓ Tabela de permissões do README presa ao catálogo do pacote compartilhado > mordida > README sem o marcador falha em voz alta (a tabela não pode perder a amarra) 0ms
   × Tabela de PAPEIS_E_RESPONSABILIDADES.md presa ao catálogo > cada ação do catálogo tem linha, e cada sim ou não bate com podeExecutar 0ms
     → expected [ Array(1) ] to deeply equal []
   ✓ Tabela de PAPEIS_E_RESPONSABILIDADES.md presa ao catálogo > morde: célula trocada, linha removida e linha inventada são acusadas 0ms

 Test Files  1 failed (1)
      Tests  4 failed | 6 passed (10)
   Start at  05:19:04
   Duration  275ms (transform 70ms, setup 0ms, collect 90ms, tests 10ms, environment 0ms, prepare 33ms)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/permissoes-no-readme.test.ts > Tabela de permissões do README presa ao catálogo do pacote compartilhado > o README traz exatamente a tabela gerada de acoesDoPapel (nem falta, nem sobra ação)
AssertionError: gere a tabela de novo e cole abaixo do marcador: expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "operador: nada falta, sobram [consultar os ofícios de encaminhamento]. Linha certa: | Operador de plantão | registrar ocorrência, registrar a resposta de uma providência, acompanhar quem está em campo agora |",
+ ]

 ❯ test/permissoes-no-readme.test.ts:94:82
     92| 
     93|   it("o README traz exatamente a tabela gerada de acoesDoPapel (nem fa…
     94|     expect(diferencas(texto), "gere a tabela de novo e cole abaixo do …
       |                                                                                  ^
     95|   });
     96| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯

 FAIL  test/permissoes-no-readme.test.ts > Tabela de permissões do README presa ao catálogo do pacote compartilhado > mordida > a tabela atual passa (controle)
AssertionError: expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "operador: nada falta, sobram [consultar os ofícios de encaminhamento]. Linha certa: | Operador de plantão | registrar ocorrência, registrar a resposta de uma providência, acompanhar quem está em campo agora |",
+ ]

 ❯ igual test/permissoes-no-readme.test.ts:122:56
    120|   */
    121|   describe("mordida", () => {
    122|     const igual = (t: string) => expect(diferencas(t)).toEqual([]);
       |                                                        ^
    123| 
    124|     it("a tabela atual passa (controle)", () => igual(texto));
 ❯ test/permissoes-no-readme.test.ts:124:49

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯

 FAIL  test/permissoes-no-readme.test.ts > Tabela de permissões do README presa ao catálogo do pacote compartilhado > mordida > papel sem linha, linha de papel inexistente e ordem trocada são acusados
AssertionError: expected '# Defesa Civil Operacional 360, produ…' not to be '# Defesa Civil Operacional 360, produ…' // Object.is equality
 ❯ test/permissoes-no-readme.test.ts:151:27
    149|       const [a, b] = acoesDoPapel("operador").map((x) => ROTULO_ACAO[x…
    150|       const trocada = texto.replace(op, op.replace(`${a}, ${b}`, `${b}…
    151|       expect(trocada).not.toBe(texto);
       |                           ^
    152|       expect(diferencas(trocada).join("\n")).toContain("a ordem difere…
    153|     });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/4]⎯

 FAIL  test/permissoes-no-readme.test.ts > Tabela de PAPEIS_E_RESPONSABILIDADES.md presa ao catálogo > cada ação do catálogo tem linha, e cada sim ou não bate com podeExecutar
AssertionError: expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "consultar_oficio para operador: o documento diz \"sim\" e o código diz não",
+ ]

 ❯ test/permissoes-no-readme.test.ts:217:50
    215| 
    216|   it("cada ação do catálogo tem linha, e cada sim ou não bate com pode…
    217|     expect(diferencasDoDocumentoDePapeis(texto)).toEqual([]);
       |                                                  ^
    218|   });
    219| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯

