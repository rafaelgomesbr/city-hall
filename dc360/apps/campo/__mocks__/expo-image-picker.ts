/**
 * O DUBLÊ DE `expo-image-picker`, COMPARTILHADO POR TODO O PACOTE.
 *
 * Módulo nativo: no jest não existe seletor de foto nem câmera, e o pacote de
 * verdade registra o módulo nativo no `import`. Mora aqui, ao lado de
 * `node_modules`, pelo mesmo motivo do dublê do mapa: o jest o usa sozinho em
 * toda suíte que importar o pacote, direta ou indiretamente, e "indiretamente"
 * é o caso comum (a limpeza do logout em `dados/banco-local.ts` apaga a cópia
 * local da foto, e para isso importa `dados/foto-do-agente.ts`, que importa o
 * seletor).
 *
 * O que ele faz: NADA que pareça uma escolha. Toda chamada devolve
 * "cancelou", e permissão devolve "concedida". Quem precisa de outra resposta
 * (a suíte da própria foto) escreve `jest.mock` por cima, e é lá que o
 * comportamento é provado.
 */
export const CameraType = { front: "front", back: "back" } as const;

export async function requestCameraPermissionsAsync(): Promise<{ granted: boolean }> {
  return { granted: true };
}

export async function requestMediaLibraryPermissionsAsync(): Promise<{ granted: boolean }> {
  return { granted: true };
}

export async function launchCameraAsync(): Promise<{ canceled: true; assets: null }> {
  return { canceled: true, assets: null };
}

export async function launchImageLibraryAsync(): Promise<{ canceled: true; assets: null }> {
  return { canceled: true, assets: null };
}
