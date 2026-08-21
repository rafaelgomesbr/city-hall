/// <reference types="vite/client" />

declare module "*.sql?raw" {
  const conteudo: string;
  export default conteudo;
}
