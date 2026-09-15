import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { Animated } from "react-native";

/**
 * A TELA DE PERFIL COM VIDA: a foto, os números, as conquistas, a equipe.
 *
 * O reclame, na letra de quem paga: "a tela de perfil totalmente morta, um app
 * totalmente sem vida, não dá vontade de mexer. Tá muito só texto, não tem
 * animações, infos, gráficos."
 *
 * O que estes casos travam, bloco a bloco:
 *
 * 1. **A foto.** Sem foto, as iniciais e o convite para adicionar; com foto, a
 *    imagem e o convite para trocar. Tocar abre a escolha (câmera ou galeria),
 *    escolher envia pelo módulo da foto e a tela troca no mesmo quadro.
 *    Cancelar não muda nada. SEM SINAL, a escolha nem abre a câmera: recusa
 *    com frase, e a razão está em `dados/foto-do-agente.ts`.
 * 2. **Os números** saem do que já desce: concluídas em 7 e em 30 dias (com
 *    "+" quando a lista cortada faz do número um piso), pendentes de hoje do
 *    disco, devolvidas do servidor, e a média do despacho à vistoria.
 * 3. **Os gráficos** existem, com sete dias e seis meses, cada barra falada.
 * 4. **As conquistas** são leitura do total, e o próximo selo diz quanto falta.
 * 5. **A equipe** mostra a foto do colega (ou as iniciais), quem está em campo
 *    agora, e a coordenação primeiro.
 * 6. **A cascata**: os blocos entram um depois do outro, com atrasos diferentes.
 *
 * Todos os casos REPROVAM na versão anterior desta tela.
 */

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true, default: () => "dark",
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "0.1.0" } },
}));

let mockGuardado: { dados: MeuTrabalho; baixadoEm: string } | null = null;
let mockPendencias: Array<{ id: string }> = [];
jest.mock("../dados/pendencias", () => ({
  meuTrabalhoGuardado: jest.fn(async () => mockGuardado),
  atualizarMeuTrabalho: jest.fn(async () => mockGuardado?.dados ?? null),
  pendenciasGuardadas: jest.fn(async () => mockPendencias),
}));

let mockColetas: Array<{ ocorrenciaId: string; situacao: string }> = [];
jest.mock("../dados/coletas", () => ({
  listarColetas: jest.fn(async () => mockColetas),
}));

jest.mock("../dados/sessao", () => ({
  useSessao: () => ({
    identidade: {
      usuarioId: "u1", nome: "Agente de Teste", matricula: "0001", papel: "agente_campo",
      organizacaoId: "org-1", organizacaoNome: "Defesa Civil de Teste", municipio: "Teste", uf: "SC",
    },
    obterToken: async () => "token-de-teste",
    lerIdentidade: () => ({ usuarioId: "u1", nome: "Agente de Teste" }),
    sair: async () => undefined,
  }),
}));

let mockTemSinal = true;
jest.mock("../dados/conectividade", () => ({
  useSinal: () => ({ temSinal: mockTemSinal, tipo: "celular" }),
}));

jest.mock("../dados/api", () => ({
  enderecoDaApi: () => "https://api.exemplo",
  SemSinal: class SemSinal extends Error {
    constructor() { super("Sem sinal agora. O que você já registrou continua guardado no aparelho."); }
  },
  normalizarMeuTrabalho: (bruto: unknown) => bruto,
}));

jest.mock("../dados/fila", () => ({
  obterFila: async () => ({
    resumo: async () => ({ pendentes: 0, enviando: 0, bloqueados: 0, confirmados: 0 }),
  }),
}));

jest.mock("../dados/preferencia-de-tema", () => ({
  PREFERENCIA_PADRAO: "sistema",
  lerPreferenciaDeTema: async () => "sistema",
  guardarPreferenciaDeTema: async () => undefined,
}));

/* O módulo da foto, dublado inteiro: o caminho até o seletor, a redução e o
   envio são provados em `dados/foto-do-agente.test.ts`. Aqui o que se prova é
   o que a TELA faz com cada resposta. */
let mockFotoLocal: string | null = null;
const mockEscolher = jest.fn();
const mockEnviar = jest.fn();
const mockRemover = jest.fn();
jest.mock("../dados/foto-do-agente", () => ({
  fotoLocalDoAgente: () => mockFotoLocal,
  baixarFotoDoAgente: async () => ({ fotoLocal: mockFotoLocal, email: "agente@teste.gov.br" }),
  escolherFoto: (...args: unknown[]) => mockEscolher(...args),
  enviarFoto: (...args: unknown[]) => mockEnviar(...args),
  removerFotoDoAgente: (...args: unknown[]) => mockRemover(...args),
}));

import Perfil from "../app/(agente)/perfil";
import type { MeuTrabalho, VistoriaConcluida } from "../dados/api";
import { ProvedorDeTema } from "../ui/componentes";
import { ContextoDePush, type EstadoDoPush } from "../push/contexto";

const PUSH: EstadoDoPush = {
  permissao: "concedida",
  registro: null,
  pedirPermissao: async () => undefined,
  abrirAjustes: async () => undefined,
};

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

/** Uma concluída há N dias, despachada H horas antes da coleta. */
function concluida(diasAtras: number, horasDoDespacho: number | null = 2, id = `v-${diasAtras}`): VistoriaConcluida {
  const coletada = Date.now() - diasAtras * DIA;
  return {
    id, ocorrencia_id: `o-${id}`, protocolo: `0001${diasAtras}/2026`, tipo: "deslizamento",
    severidade: "alta", status: "vistoriada", endereco: "Rua das Flores, 100",
    coletada_em: new Date(coletada).toISOString(),
    sincronizada_em: new Date(coletada + 10_000).toISOString(),
    gps_precisao_metros: null, assinante_nome: null,
    despachada_em: horasDoDespacho === null ? null : new Date(coletada - horasDoDespacho * HORA).toISOString(),
  };
}

function trabalho(por: Partial<MeuTrabalho> = {}): MeuTrabalho {
  return {
    equipe: { id: "e1", nome: "Equipe Alfa", especialidade: "Geotecnia", ativa: true },
    colegas: [
      { id: "u1", nome: "Agente de Teste", papel: "agente_campo", ativo: true, fotoUrl: null, emCampo: false },
      { id: "u2", nome: "Maria Souza", papel: "agente_campo", ativo: true, fotoUrl: "https://balde/maria?assinatura=x", emCampo: true },
      { id: "u3", nome: "Helena Coutinho", papel: "coordenador", ativo: true, fotoUrl: null, emCampo: false },
    ],
    concluidas: [concluida(0), concluida(1, 4), concluida(3), concluida(12, null), concluida(45)],
    totalConcluidas: 62,
    tetoDeConcluidas: 50,
    devolvidasNoMes: 2,
    ...por,
  };
}

beforeEach(() => {
  mockGuardado = null;
  mockPendencias = [];
  mockColetas = [];
  mockTemSinal = true;
  mockFotoLocal = null;
  mockEscolher.mockReset();
  mockEnviar.mockReset();
  mockRemover.mockReset();
});

async function abrir(dados: MeuTrabalho | null = trabalho()): Promise<void> {
  mockGuardado = dados ? { dados, baixadoEm: new Date().toISOString() } : null;
  await render(
    <ProvedorDeTema>
      <ContextoDePush.Provider value={PUSH}>
        <Perfil />
      </ContextoDePush.Provider>
    </ProvedorDeTema>,
  );
  await act(async () => {});
}

/** As iniciais desenhadas no avatar do topo (e não no da lista de colegas, que também é "AT"). */
function iniciaisDoTopo(): string | null {
  const topo = screen.getByTestId("avatar-do-agente", { includeHiddenElements: true });
  const texto = within(topo).queryByText(/^[A-Z?]{1,2}$/, { includeHiddenElements: true });
  return texto ? String(texto.props.children) : null;
}

async function tocar(elemento: Parameters<typeof fireEvent.press>[0]): Promise<void> {
  await fireEvent.press(elemento);
  await act(async () => {});
}

describe("a foto no topo", () => {
  it("sem foto: as iniciais, e o convite para adicionar", async () => {
    await abrir();

    expect(iniciaisDoTopo()).toBe("AT");
    expect(screen.getByTestId("trocar-foto").props.accessibilityLabel)
      .toBe("Agente de Teste, sem foto de perfil. Adicionar foto");
    expect(screen.getByLabelText("Adicionar uma foto de perfil")).toBeTruthy();
    /* O nome e o cargo continuam ao lado, sem rótulo (o cargo se repete nas
       etiquetas dos colegas, e a primeira é a do cabeçalho). */
    expect(screen.getByText("Agente de Teste")).toBeTruthy();
    expect(screen.getAllByText("Agente de campo")[0]).toBeTruthy();
  });

  it("com a cópia no aparelho: a imagem, e o convite para trocar", async () => {
    mockFotoLocal = "file:///documentos/perfil-foto-u1-abc.jpg";
    await abrir();

    const imagem = screen.getByTestId("avatar-do-agente-foto", { includeHiddenElements: true });
    expect(imagem.props.source).toEqual({ uri: mockFotoLocal });
    expect(screen.getByTestId("trocar-foto").props.accessibilityLabel)
      .toBe("Foto de perfil de Agente de Teste. Trocar a foto");
    expect(screen.getByLabelText("Trocar a foto de perfil")).toBeTruthy();
  });

  it("tocar na foto abre a escolha: câmera, galeria e cancelar", async () => {
    await abrir();
    expect(screen.queryByTestId("foto-camera")).toBeNull();

    await tocar(screen.getByTestId("trocar-foto"));

    expect(screen.getByTestId("foto-camera")).toBeTruthy();
    expect(screen.getByTestId("foto-galeria")).toBeTruthy();
    expect(screen.getByLabelText("Fechar a escolha de foto sem mudar nada")).toBeTruthy();
    /* Sem foto não há o que remover. */
    expect(screen.queryByTestId("remover-foto")).toBeNull();
  });

  it("escolher da galeria envia pelo módulo da foto e troca a tela no mesmo quadro", async () => {
    mockEscolher.mockResolvedValue({
      situacao: "escolhida",
      foto: { uri: "file:///cache/reduzida.jpg", tamanhoBytes: 4321, tipoConteudo: "image/jpeg" },
    });
    mockEnviar.mockResolvedValue({ fotoUrl: "https://balde/nova?assinatura=y", uriLocal: "file:///documentos/perfil-foto-u1-nova.jpg" });
    await abrir();

    await tocar(screen.getByTestId("trocar-foto"));
    await tocar(screen.getByTestId("foto-galeria"));

    expect(mockEscolher).toHaveBeenCalledWith("galeria");
    expect(mockEnviar).toHaveBeenCalledWith(
      "token-de-teste",
      { uri: "file:///cache/reduzida.jpg", tamanhoBytes: 4321, tipoConteudo: "image/jpeg" },
      "u1",
    );
    const imagem = screen.getByTestId("avatar-do-agente-foto", { includeHiddenElements: true });
    expect(imagem.props.source).toEqual({ uri: "file:///documentos/perfil-foto-u1-nova.jpg" });
    expect(screen.getByText("Foto atualizada")).toBeTruthy();
    /* A escolha fecha sozinha depois do envio. */
    expect(screen.queryByTestId("foto-galeria")).toBeNull();
  });

  it("cancelar no seletor não muda nada e não avisa nada", async () => {
    mockEscolher.mockResolvedValue({ situacao: "cancelada" });
    await abrir();

    await tocar(screen.getByTestId("trocar-foto"));
    await tocar(screen.getByTestId("foto-camera"));

    expect(mockEscolher).toHaveBeenCalledWith("camera");
    expect(mockEnviar).not.toHaveBeenCalled();
    expect(screen.queryByText(/Foto atualizada|não foi trocada/)).toBeNull();
    expect(iniciaisDoTopo()).toBe("AT");
  });

  it("sem sinal, recusa com frase antes de abrir câmera ou galeria", async () => {
    mockTemSinal = false;
    await abrir();

    await tocar(screen.getByTestId("trocar-foto"));

    expect(screen.getByText("Trocar a foto precisa de sinal")).toBeTruthy();
    expect(screen.queryByTestId("foto-camera")).toBeNull();
    expect(screen.queryByTestId("foto-galeria")).toBeNull();
    expect(mockEscolher).not.toHaveBeenCalled();
  });

  it("a falha no envio vira frase em português, e a foto de antes continua", async () => {
    mockEscolher.mockResolvedValue({
      situacao: "escolhida",
      foto: { uri: "file:///cache/reduzida.jpg", tamanhoBytes: 4321, tipoConteudo: "image/jpeg" },
    });
    mockEnviar.mockRejectedValue(new Error("O armazenamento não aceitou a foto. Tente de novo em alguns minutos."));
    await abrir();

    await tocar(screen.getByTestId("trocar-foto"));
    await tocar(screen.getByTestId("foto-galeria"));

    expect(screen.getByText("A foto não foi trocada")).toBeTruthy();
    expect(screen.getByText(/não aceitou a foto/)).toBeTruthy();
    expect(iniciaisDoTopo()).toBe("AT");
  });

  it("remover pergunta antes, e depois volta às iniciais", async () => {
    mockFotoLocal = "file:///documentos/perfil-foto-u1-abc.jpg";
    mockRemover.mockResolvedValue(undefined);
    await abrir();

    await tocar(screen.getByTestId("trocar-foto"));
    await tocar(screen.getByTestId("remover-foto"));
    /* Nada foi removido ainda: a pergunta está aberta. */
    expect(mockRemover).not.toHaveBeenCalled();
    expect(screen.getByText("Remover a foto de perfil?")).toBeTruthy();

    await tocar(screen.getByLabelText("Remover a foto"));

    expect(mockRemover).toHaveBeenCalledWith("token-de-teste", "u1");
    expect(screen.queryByTestId("avatar-do-agente-foto", { includeHiddenElements: true })).toBeNull();
    expect(iniciaisDoTopo()).toBe("AT");
    expect(screen.getByText("Foto removida")).toBeTruthy();
  });
});

describe("os números do agente", () => {
  it("conta na semana, no mês, pendentes de hoje, devolvidas e a média até a vistoria", async () => {
    mockPendencias = [{ id: "t1" }, { id: "t2" }, { id: "t3" }];
    mockColetas = [{ ocorrenciaId: "t3", situacao: "coletada" }];
    await abrir();

    /* O rótulo falado do `Dado` é "valor, rótulo" desde o primeiro quadro. */
    expect(screen.getByTestId("numero-semana").props.accessibilityLabel).toBe("3, concluídas em 7 dias");
    expect(screen.getByTestId("numero-mes").props.accessibilityLabel).toBe("4, concluídas em 30 dias");
    expect(screen.getByTestId("numero-pendentes").props.accessibilityLabel).toBe("2, pendentes hoje");
    expect(screen.getByTestId("numero-devolvidas").props.accessibilityLabel).toBe("2, devolvidas em 30 dias");
    /* Quatro com despacho (2h, 4h, 2h, 2h) e uma sem: a média é das quatro, 2,5 horas. */
    expect(screen.getByTestId("numero-tempo").props.accessibilityLabel).toBe("2,5, horas do despacho à vistoria");
  });

  it("com a lista cortada, o número do mês vira piso e ganha o mais", async () => {
    await abrir(trabalho({
      concluidas: Array.from({ length: 50 }, (_, i) => concluida(i * 0.3, 2, `v${i}`)),
      totalConcluidas: 80,
    }));

    expect(screen.getByTestId("numero-mes").props.accessibilityLabel).toBe("50+, concluídas em 30 dias");
    expect(screen.getByText(/pode haver mais no período/)).toBeTruthy();
  });

  it("sem pendência legível, o cartão de pendentes não inventa zero", async () => {
    mockPendencias = [];
    await abrir();
    expect(screen.getByTestId("numero-pendentes").props.accessibilityLabel).toBe("0, pendentes hoje");
  });

  it("sem despacho em nenhuma, não inventa média", async () => {
    await abrir(trabalho({ concluidas: [concluida(0, null)] }));
    expect(screen.queryByTestId("numero-tempo")).toBeNull();
  });

  it("os dois gráficos existem, com sete dias e seis meses, cada barra falada", async () => {
    await abrir();

    const semana = screen.getByTestId("grafico-da-semana");
    expect(semana.props.accessibilityLabel).toBe("Últimos 7 dias, gráfico de barras");
    expect(within(semana).getByLabelText(/^Hoje, .*: 1 vistoria concluída$/)).toBeTruthy();

    const meses = screen.getByTestId("grafico-dos-meses");
    expect(meses.props.accessibilityLabel).toBe("Últimos 6 meses, gráfico de barras");
    expect(within(meses).getAllByLabelText(/vistoria/).length).toBe(6);
  });
});

describe("as conquistas", () => {
  it("com 62 concluídas, três selos e faltam 38 para o de cem", async () => {
    await abrir();

    expect(screen.getByLabelText("Selo Primeira, 1 vistoria, conquistado")).toBeTruthy();
    expect(screen.getByLabelText("Selo Dez, 10 vistorias, conquistado")).toBeTruthy();
    expect(screen.getByLabelText("Selo Cinquenta, 50 vistorias, conquistado")).toBeTruthy();
    expect(screen.getByLabelText("Selo Cem, 100 vistorias, ainda por vir")).toBeTruthy();
    expect(screen.getByLabelText("Selo Quinhentas, 500 vistorias, ainda por vir")).toBeTruthy();

    expect(screen.getByText("Faltam 38 para o selo Cem")).toBeTruthy();
    const barra = screen.getByLabelText("Progresso para o selo Cem");
    expect(barra.props.accessibilityRole).toBe("progressbar");
    expect(barra.props.accessibilityValue.now).toBe(24);
  });

  it("sem nenhuma concluída, o próximo é a primeira", async () => {
    await abrir(trabalho({ concluidas: [], totalConcluidas: 0 }));
    expect(screen.getByText("Falta 1 para o selo Primeira")).toBeTruthy();
  });
});

describe("a equipe com cara de equipe", () => {
  it("o colega com foto ganha a imagem, o sem foto ganha as iniciais", async () => {
    await abrir();

    const maria = screen.getByTestId("colega-u2");
    expect(within(maria).getByText("Maria Souza")).toBeTruthy();
    expect(screen.getByTestId("avatar-u2-foto", { includeHiddenElements: true }).props.source)
      .toEqual({ uri: "https://balde/maria?assinatura=x" });
    expect(screen.queryByTestId("avatar-u3-foto", { includeHiddenElements: true })).toBeNull();
    expect(within(screen.getByTestId("colega-u3")).getByText("HC", { includeHiddenElements: true })).toBeTruthy();
  });

  it("quem está em campo leva o selo, com ícone e palavra, e a contagem fala", async () => {
    await abrir();

    expect(screen.getByLabelText("Maria Souza está em campo agora")).toBeTruthy();
    expect(within(screen.getByTestId("em-campo-agora")).getByText("1 em campo agora")).toBeTruthy();
  });

  it("a coordenação vem primeiro", async () => {
    await abrir();
    /* `getAllByText` devolve na ordem da árvore, que é a ordem da tela. */
    const nomes = screen.getAllByText(/^(Helena Coutinho|Maria Souza|Agente de Teste \(você\))$/)
      .map((t) => (Array.isArray(t.props.children) ? t.props.children.join("") : String(t.props.children)));
    expect(nomes).toEqual(["Helena Coutinho", "Maria Souza", "Agente de Teste (você)"]);
  });
});

describe("a cascata", () => {
  it("os blocos entram com atrasos diferentes, e não todos de uma vez", async () => {
    const timing = jest.spyOn(Animated, "timing");
    await abrir();

    const atrasos = new Set(
      timing.mock.calls
        .map((c) => (c[1] as { delay?: number }).delay)
        .filter((d): d is number => typeof d === "number"),
    );
    expect(atrasos.size).toBeGreaterThan(2);
    timing.mockRestore();
  });
});
