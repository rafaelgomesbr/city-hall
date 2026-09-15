import { z } from "zod";
import type { EscritaDoConsole } from "./banco.js";
import { derivarSenha, gerarSenhaTemporaria } from "../../api/src/auth/senha.js";

/**
 * A ÚNICA escrita do console, inteira, num arquivo só.
 *
 * `consultas.ts` existe para alguém abrir um arquivo e ver toda a superfície de
 * LEITURA que o console alcança no banco de todas as prefeituras. Este é o
 * mesmo arquivo para a ESCRITA, pela mesma razão, e a superfície aqui é ainda
 * mais curta: uma chamada de função, sem um `INSERT` sequer.
 *
 * O QUE O BANCO GARANTE, E ESTE ARQUIVO NÃO PRECISA REPETIR. A função
 * `provisionar_municipio` (migração 036) roda como dona das tabelas e faz, numa
 * transação só: recusa município duplicado antes de escrever, cria a
 * organização, cria o primeiro administrador como `administrador`, e grava a
 * linha de nascimento na trilha daquele município com o nome de quem cadastrou.
 * Ela devolve dois identificadores e nada mais.
 *
 * A validação daqui NÃO substitui a de lá: a regra de negócio mora no banco, e
 * o que este arquivo faz é apontar o erro no campo certo antes de gastar uma
 * ida ao servidor e uma derivação de senha de 128 MB. Se a validação só
 * existisse aqui, ela não existiria.
 *
 * A SENHA INICIAL É SORTEADA AQUI E NUNCA É GRAVADA.
 *
 * Ela sai desta função uma vez, viaja até a tela do operador, e acabou. Não vai
 * para o log (ver `servidor.ts`), não vai para o banco (o que vai é o hash
 * `scrypt`, e a função do banco RECUSA o que não tiver esse formato) e não vai
 * para a trilha (a migração 010 já escreveu essa regra, e a trilha é
 * append-only: uma senha que entrasse lá não sairia mais).
 */

/**
 * O formulário, com a mesma régua do cadastro de usuário do produto.
 *
 * Os limites de tamanho são os de `cadastroUsuarioSchema` em `@dc360/shared`,
 * repetidos aqui porque o console não depende daquele pacote (decisão 1 da ADR
 * 0008: quanto menos este processo carrega, menos um vazamento dele entrega).
 * Repetir número de coluna é barato; o que NÃO pode ser repetido é regra de
 * negócio, e nenhuma está aqui: quem recusa duplicata, quem exige o papel de
 * administrador e quem exige o nome do operador é o banco.
 */
export const cadastroDePrefeituraSchema = z.object({
  municipio: z.string().trim().min(1, "Informe o município").max(200),
  uf: z.string().trim().length(2, "A UF tem duas letras")
    .regex(/^[A-Za-z]{2}$/, "A UF tem duas letras"),
  /**
   * O nome do órgão, e não do município.
   *
   * Opcional na tela: quando ninguém digita, vale a forma que a Defesa Civil
   * municipal usa em documento oficial, que é a mesma que o comando de linha já
   * montava. Exigir a digitação produziria vinte grafias diferentes da mesma
   * coisa, e esse nome sai impresso no laudo.
   */
  orgao: z.string().trim().max(300).optional(),
  nome: z.string().trim().min(1, "Informe o nome do administrador").max(200),
  matricula: z.string().trim().min(1, "Informe a matrícula").max(40),
  email: z.string().trim().toLowerCase().min(1, "Informe o email")
    .email("Informe um email válido").max(320),
  /**
   * Quem, do lado do fornecedor, está cadastrando.
   *
   * Obrigatório e sem valor padrão, pela mesma razão escrita em
   * `apps/api/src/provisionar.ts`: uma frase genérica como "operação da
   * plataforma" responderia à pergunta da auditoria sem identificar ninguém, e
   * daria a aparência de registro sem o conteúdo dele.
   *
   * Vem do formulário e não da sessão de propósito. O email do operador diz
   * qual conta executou; este campo diz o nome da pessoa, escrito para um
   * servidor municipal ler na trilha dele daqui a três anos.
   */
  operador: z.string().trim().min(1, "Informe quem está cadastrando").max(200),
});

export type CadastroDePrefeitura = z.infer<typeof cadastroDePrefeituraSchema>;

export type PrefeituraCadastrada = {
  organizacaoId: string;
  usuarioId: string;
  /** Mostrada UMA vez ao operador. Não fica guardada em lugar nenhum. */
  senhaInicial: string;
};

/**
 * O SQL, por extenso e num lugar só.
 *
 * Todo valor viaja como parâmetro do driver. Interpolar qualquer um deles numa
 * string seria injeção de SQL num processo que fala com o banco de todas as
 * prefeituras, e o fato de o papel dele ser pobre não é consolo: pobre é o
 * papel, e o dano de uma injeção não se mede pelo que a rota pretendia fazer.
 */
const CHAMADA =
  "SELECT organizacao_id, usuario_id FROM provisionar_municipio($1,$2,$3,$4,$5,$6,$7,$8)";

/**
 * Códigos que a função do banco levanta, para a rota traduzir em resposta.
 *
 * Falta um da lista de propósito: `DC362`, que a função levanta quando o dono
 * das tabelas é barrado ao gravar a linha de nascimento na trilha. Ele NÃO tem
 * tradução de tela porque não é erro de quem está cadastrando: é defeito de
 * implantação, e o caminho certo dele é cair no tratador geral, virar 500 e
 * aparecer no log com a mensagem inteira, que diz o que fazer.
 */
export const MUNICIPIO_DUPLICADO = "DC360";
export const PEDIDO_INVALIDO = "DC361";
/**
 * Email de login já usado por alguém, em qualquer município.
 *
 * O email é a identidade de login e vale para o produto inteiro (ver a migração
 * 002): na hora de entrar ainda não se sabe o município, e dois usuários com o
 * mesmo email em prefeituras diferentes tornariam a resposta ambígua.
 */
export const EMAIL_EM_USO = "DC363";

export async function cadastrarPrefeitura(
  escrita: EscritaDoConsole,
  pedido: CadastroDePrefeitura,
): Promise<PrefeituraCadastrada> {
  /*
    SORTEADA PELO SERVIDOR, e no formato que se dita por telefone.

    É a mesma `gerarSenhaTemporaria` que a redefinição de senha do produto usa,
    e não uma cópia: alfabeto sem os pares que se confundem lidos em voz alta
    (`l` e `1`, `o` e `0`), doze símbolos em três grupos, sessenta bits. Quem
    cadastra vai ditar isto para a pessoa do outro lado da linha, e uma senha
    que ela não consegue digitar volta como chamado para o mesmo suporte.

    Senha DIGITADA por quem cadastra seria pior de duas formas, e as duas estão
    escritas em `apps/api/src/auth/senha.ts`: quem digita repete a mesma senha
    para todo mundo, e quem digita escolhe uma senha que também usa em outro
    lugar.
  */
  const senhaInicial = gerarSenhaTemporaria();

  const orgao = pedido.orgao?.trim()
    || `Coordenadoria Municipal de Proteção e Defesa Civil de ${pedido.municipio}`;

  const linhas = await escrita.executar<{ organizacao_id: string; usuario_id: string }>(
    CHAMADA,
    [
      orgao,
      pedido.municipio,
      pedido.uf.toUpperCase(),
      pedido.nome,
      pedido.matricula,
      pedido.email,
      /*
        O HASH, e nunca a senha. A derivação é a do produto (`scrypt`, N = 2^17),
        importada de `apps/api/src/auth/senha.ts` e não copiada para cá: duas
        cópias envelhecem em ritmos diferentes, e a que envelhece aqui cria um
        administrador que não consegue entrar no painel.
      */
      await derivarSenha(senhaInicial),
      pedido.operador,
    ],
  );

  const criado = linhas[0];
  if (!criado) {
    // Não deve acontecer: a função devolve uma linha ou levanta erro. Se
    // acontecer, é defeito, e um defeito que devolvesse "criado" sem
    // identificador mandaria o operador entregar uma senha de um município que
    // não existe.
    throw new Error("O banco não devolveu o município criado.");
  }

  return {
    organizacaoId: criado.organizacao_id,
    usuarioId: criado.usuario_id,
    senhaInicial,
  };
}
