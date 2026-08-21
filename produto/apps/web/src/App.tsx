import { Navigate, Route, Routes } from "react-router-dom";
import { Estrutura } from "./componentes/Estrutura";
import { useSessao } from "./estado/sessao";
import { Entrar } from "./paginas/Entrar";
import { Equipes } from "./paginas/Equipes";
import { Mapa } from "./paginas/Mapa";
import { NovaOcorrencia } from "./paginas/NovaOcorrencia";
import { Ocorrencia } from "./paginas/Ocorrencia";
import { Ocorrencias } from "./paginas/Ocorrencias";
import { Painel } from "./paginas/Painel";
import { Usuarios } from "./paginas/Usuarios";

/**
 * Rotas privadas ficam todas atrás da mesma checagem. Isso é conveniência de
 * navegação, não segurança: a barreira que importa é a policy de RLS no
 * banco, que nega mesmo se a rota for aberta na mão pela URL.
 */
function Protegida({ children }: { children: JSX.Element }) {
  const { sessao } = useSessao();
  return sessao ? children : <Navigate to="/entrar" replace />;
}

export function App() {
  const { sessao } = useSessao();

  return (
    <Routes>
      <Route path="/entrar" element={sessao ? <Navigate to="/painel" replace /> : <Entrar />} />

      <Route element={<Protegida><Estrutura /></Protegida>}>
        <Route path="/painel" element={<Painel />} />
        <Route path="/ocorrencias" element={<Ocorrencias />} />
        <Route path="/ocorrencias/nova" element={<NovaOcorrencia />} />
        <Route path="/ocorrencias/:id" element={<Ocorrencia />} />
        <Route path="/mapa" element={<Mapa />} />
        <Route path="/equipes" element={<Equipes />} />
        <Route path="/usuarios" element={<Usuarios />} />
      </Route>

      <Route path="*" element={<Navigate to={sessao ? "/painel" : "/entrar"} replace />} />
    </Routes>
  );
}
