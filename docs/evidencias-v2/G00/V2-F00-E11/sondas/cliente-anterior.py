p='apps/web/src/dados/http.ts'
d=open(p,'rb').read().decode('utf8')
a=d.index('export async function baixarPacoteDeSaida')
b=d.index('export async function lerUsoDeArmazenamento')
velho='''export async function baixarPacoteDeSaida(_s: Sessao): Promise<{ url: string; nome: string }> {
  const tokens = lerTokens();
  const resposta = await comRedeTraduzida(() =>
    fetch(`${BASE}/pacote.zip`, {
      method: "POST",
      headers: tokens ? { authorization: `Bearer ${tokens.acesso}` } : {},
    }));
  if (!resposta.ok) {
    throw new ErroDaApi(resposta.status, await resposta.json().catch(() => ({})));
  }
  return {
    url: URL.createObjectURL(await resposta.blob()),
    nome: `dc360-pacote-de-saida-${new Date().toISOString().slice(0, 10)}.zip`,
  };
}

'''.replace('\n','\r\n')
open(p,'wb').write((d[:a]+velho+d[b:]).encode('utf8'))
