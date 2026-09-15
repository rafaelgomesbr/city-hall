/**
 * O DUBLÊ DE `expo-image-manipulator`, COMPARTILHADO POR TODO O PACOTE.
 *
 * Ver o cabeçalho de `expo-image-picker.ts` ao lado: mesmo motivo, mesmo
 * lugar. Aqui a redução devolve o próprio arquivo, sem reduzir nada: quem
 * prova o recorte e a redução é `dados/foto-do-agente.test.ts`, com um dublê
 * próprio que registra as ações.
 */
export const SaveFormat = { JPEG: "jpeg", PNG: "png" } as const;

export const ImageManipulator = {
  manipulate(uri: string) {
    const contexto = {
      crop: () => contexto,
      resize: () => contexto,
      renderAsync: async () => ({
        saveAsync: async () => ({ uri, width: 0, height: 0 }),
      }),
    };
    return contexto;
  },
};
