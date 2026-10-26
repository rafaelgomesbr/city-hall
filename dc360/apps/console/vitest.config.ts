import { defineConfig } from "vitest/config";

/**
 * A configuração de teste do console, e ela tem UMA linha de conteúdo.
 *
 * Até a recuperação de senha o console não tinha este arquivo: cada caso
 * declara o próprio prazo, e o paralelismo nunca precisou de teto aqui (a
 * suíte é menor que a da API). O que passou a precisar existir é o dublê da
 * migração 039 (ver `test/apoio/duble-da-migracao-039.ts`): enquanto nenhuma
 * migração de `db/migrations` definir a tabela e as três funções da
 * recuperação, a lista que `carregarMigracoes` devolve ganha essa migração no
 * fim, e o Postgres em WebAssembly da suíte sobe com o contrato combinado.
 * Some sozinho no dia em que a migração de verdade a trouxer.
 *
 * É `setupFiles`, e não um `import` dentro do apoio, porque há suíte que monta
 * o banco sem passar pelo apoio (`subir-em-producao.test.ts` chama
 * `consoleEmMemoria()` direto para medir o portão de esquema), e um dublê que
 * só valesse para quem o importa deixaria justamente esse portão sem a 039.
 */
export default defineConfig({
  test: {
    /*
      E o "falha alto" da guarda das respostas de acesso (V2-F00-E05, correção
      3): caso que passou por uma resposta 401 ou 403 fora do contrato reprova.
    */
    setupFiles: ["./test/apoio/duble-da-migracao-039.ts", "./test/apoio/guarda-falha-alto.ts"],
  },
});
