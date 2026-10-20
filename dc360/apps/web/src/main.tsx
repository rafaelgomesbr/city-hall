import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { ProvedorSessao } from "./estado/sessao";
import "./estilos/tokens.css";
import "./estilos/app.css";

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Elemento #root não encontrado");

createRoot(raiz).render(
  <StrictMode>
    <ProvedorSessao>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ProvedorSessao>
  </StrictMode>,
);
