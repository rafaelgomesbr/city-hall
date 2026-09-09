/**
 * O SQLite embutido no Node, declarado à mão e só no que os testes usam.
 *
 * Os testes do banco local rodam contra SQLite DE VERDADE, e não contra um mapa
 * fingindo de tabela: chave primária, `ON CONFLICT DO UPDATE` e `WHERE` só
 * existem no SQL, e num banco falso passariam sem nunca terem sido executados.
 * Quem fornece esse SQLite é o próprio Node, por `node:sqlite`.
 *
 * A declaração é feita aqui porque o `tsconfig.json` do aplicativo fixa
 * `types: ["jest"]` e deixa os tipos do Node de fora DE PROPÓSITO: incluí-los
 * trocaria o `setInterval` do React Native (que devolve número) pelo do Node
 * (que devolve `NodeJS.Timeout`), e as telas que guardam o identificador do
 * relógio deixariam de compilar. O custo de escrever cinco assinaturas à mão é
 * muito menor que o de mexer nisso.
 *
 * Se um dia `"node"` entrar em `types`, este arquivo passa a ser declaração
 * duplicada e deve sair junto.
 *
 * Mora na raiz de `src`, e não em `__tests__`, porque o `testMatch` do Jest
 * pega TODO arquivo dentro de `__tests__`: ali este `.d.ts` virava uma suíte
 * sem nenhum teste dentro, e reprovava a rodada inteira.
 */
declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(caminho: string);
    exec(sql: string): void;
    prepare(sql: string): {
      run(...parametros: unknown[]): unknown;
      all(...parametros: unknown[]): unknown[];
      get(...parametros: unknown[]): unknown;
    };
    close(): void;
  }
}
