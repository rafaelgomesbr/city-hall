import { podeExecutar, type Acao, type Papel } from "@dc360/shared";
import { pontuar } from "./pontuador";

/**
 * O índice LOCAL da busca: páginas e ações do painel.
 *
 * É local porque a interface é conhecida antes de qualquer requisição: não
 * faz sentido perguntar ao servidor onde fica o mapa. E é filtrado pelo MESMO
 * `podeExecutar` do menu, porque a busca não pode ser o lugar onde o operador
 * descobre a tela que o menu escondeu dele. Esconder aqui não é controle de
 * acesso (a rota e o servidor continuam exigindo a permissão); é não
 * construir um beco sem saída de propósito.
 *
 * As páginas vêm de `NAVEGACAO` em `Estrutura.tsx`, sem o JSX do ícone, para
 * que este módulo continue puro e testável sem React. As ações moram aqui.
 */

/** Uma página do menu, como `Estrutura.tsx` a declara, sem o ícone. */
export type PaginaDoMenu = {
  para: string;
  rotulo: string;
  sinonimos?: readonly string[];
  /** Só aparece para quem pode executar esta ação. */
  exige?: Acao;
  /** Só aparece para quem NÃO pode executar esta ação. */
  escondeSePuder?: Acao;
};

/** As ações que não são navegação: o painel as executa na hora. */
export type AcaoDaInterface = "trocar_tema" | "sair";

/** Ícones que as ações pedem, por nome; `BuscaGlobal` traduz para o desenho. */
export type IconeDoIndice =
  | "mais" | "usuarios" | "equipes" | "predio" | "documento" | "lua" | "sol" | "sair" | "escudo";

export type ItemDoIndice = {
  /** Estável entre renderizações: "pagina:/mapa", "acao:sair". */
  id: string;
  rotulo: string;
  /** A linha de baixo do resultado: "Página" ou o que a ação faz. */
  detalhe: string;
  sinonimos: readonly string[];
  destino: { tipo: "rota"; para: string } | { tipo: "acao"; acao: AcaoDaInterface };
  icone?: IconeDoIndice;
  exige?: Acao;
  escondeSePuder?: Acao;
};

type AcaoDeclarada = Omit<ItemDoIndice, "rotulo"> & {
  rotulo: string | ((contexto: ContextoDoIndice) => string);
};

export type ContextoDoIndice = { tema: "claro" | "escuro" };

/**
 * As ações do painel, cada uma só para quem pode.
 *
 * A lista é escrita à mão de propósito: não há como a máquina descobrir
 * sozinha o que é "ação do painel", e escrever aqui obriga quem acrescenta
 * uma a dizer, no mesmo lugar, quem pode executá-la. `test/busca-pontuador`
 * confere que toda ação diz quem pode ou está na lista das que são de todos.
 */
export const ACOES_DA_INTERFACE: readonly AcaoDeclarada[] = [
  {
    id: "registrar_ocorrencia", rotulo: "Registrar ocorrência",
    detalhe: "Abrir um chamado novo e gerar o protocolo",
    sinonimos: ["nova ocorrência", "abrir chamado", "novo chamado", "novo protocolo", "registrar", "cadastrar ocorrência"],
    destino: { tipo: "rota", para: "/ocorrencias/nova" }, icone: "mais", exige: "abrir_ocorrencia",
  },
  {
    id: "novo_usuario", rotulo: "Novo usuário",
    detalhe: "Cadastrar uma pessoa no município",
    sinonimos: ["cadastrar usuário", "nova conta", "nova pessoa", "criar usuário", "adicionar usuário"],
    destino: { tipo: "rota", para: "/usuarios" }, icone: "usuarios", exige: "gerenciar_usuarios",
  },
  {
    id: "nova_equipe", rotulo: "Nova equipe",
    detalhe: "Cadastrar uma equipe de campo",
    sinonimos: ["cadastrar equipe", "novo time", "criar equipe", "adicionar equipe"],
    destino: { tipo: "rota", para: "/equipes" }, icone: "equipes", exige: "gerenciar_equipes",
  },
  {
    id: "novo_orgao", rotulo: "Novo órgão",
    detalhe: "Cadastrar um órgão de destino para providências",
    sinonimos: ["cadastrar órgão", "novo destino", "criar órgão", "adicionar órgão", "secretaria"],
    destino: { tipo: "rota", para: "/orgaos" }, icone: "predio", exige: "gerenciar_equipes",
  },
  {
    id: "exportar", rotulo: "Exportar a base",
    detalhe: "Baixar as ocorrências em CSV, na prestação de contas",
    sinonimos: ["exportar", "csv", "planilha", "baixar dados", "exportar dados", "excel"],
    destino: { tipo: "rota", para: "/auditoria" }, icone: "documento", exige: "exportar_dados",
  },
  {
    id: "trocar_tema",
    // O rótulo diz para onde vai, como o botão do menu: no claro, "Tema escuro".
    rotulo: (c) => (c.tema === "claro" ? "Tema escuro" : "Tema claro"),
    detalhe: "Trocar entre o modo claro e o escuro",
    sinonimos: ["trocar tema", "tema", "escuro", "claro", "modo", "modo escuro", "modo claro", "aparência", "noturno"],
    destino: { tipo: "acao", acao: "trocar_tema" }, icone: "lua",
  },
  {
    id: "minha_conta", rotulo: "Minha conta",
    detalhe: "Sua senha e a verificação em duas etapas",
    sinonimos: ["conta", "senha", "trocar senha", "perfil", "duas etapas", "segundo fator", "minhas sessões"],
    destino: { tipo: "rota", para: "/minha-conta" }, icone: "escudo",
  },
  {
    id: "sair", rotulo: "Sair",
    detalhe: "Encerrar a sessão neste computador",
    sinonimos: ["sair da conta", "encerrar sessão", "logout", "deslogar", "desconectar"],
    destino: { tipo: "acao", acao: "sair" }, icone: "sair",
  },
];

function visivelPara(papel: Papel, item: { exige?: Acao; escondeSePuder?: Acao }): boolean {
  return (!item.exige || podeExecutar(papel, item.exige))
    && (!item.escondeSePuder || !podeExecutar(papel, item.escondeSePuder));
}

/**
 * O índice de um papel: as páginas que o menu dele mostra, mais as ações que
 * ele pode executar.
 */
export function indiceDaInterface(
  papel: Papel,
  paginas: readonly PaginaDoMenu[],
  contexto: ContextoDoIndice,
): ItemDoIndice[] {
  const doMenu: ItemDoIndice[] = paginas
    .filter((p) => visivelPara(papel, p))
    .map((p) => ({
      id: `pagina:${p.para}`,
      rotulo: p.rotulo,
      detalhe: "Página",
      sinonimos: p.sinonimos ?? [],
      destino: { tipo: "rota", para: p.para },
      ...(p.exige ? { exige: p.exige } : {}),
      ...(p.escondeSePuder ? { escondeSePuder: p.escondeSePuder } : {}),
    }));

  const acoes: ItemDoIndice[] = ACOES_DA_INTERFACE
    .filter((a) => visivelPara(papel, a))
    .map((a) => ({
      ...a,
      id: `acao:${a.id}`,
      rotulo: typeof a.rotulo === "function" ? a.rotulo(contexto) : a.rotulo,
    }));

  return [...doMenu, ...acoes];
}

export type ResultadoLocal = { item: ItemDoIndice; pontuacao: number };

/**
 * Os itens do índice que casam com a consulta, do melhor para o pior. Empate
 * é desfeito pelo rótulo, para a ordem não depender da ordem de declaração.
 */
export function buscarNaInterface(
  consulta: string,
  indice: readonly ItemDoIndice[],
  teto = 6,
): ResultadoLocal[] {
  return indice
    .map((item) => ({ item, pontuacao: pontuar(consulta, item) }))
    .filter((r) => r.pontuacao > 0)
    .sort((a, b) => b.pontuacao - a.pontuacao || a.item.rotulo.localeCompare(b.item.rotulo, "pt-BR"))
    .slice(0, teto);
}
