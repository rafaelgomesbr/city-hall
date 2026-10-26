import re,sys,os
# Uso: extrair.py DOC SAIDA PGBIN PASTA_NAO_USADA PORTA_BASE   (desde a versao 3 revisada do documento a pasta da rodada nasce de mktemp -d, nao se troca)
# Extrai os blocos bash de "## Passo 0" a "## Fora do Windows" e troca SO os valores que o
# documento manda trocar (PGBIN e as tres portas). As aspas do documento ficam.
doc,out,pgbin,pasta,porta=sys.argv[1:6]
porta=int(porta)
s=open(doc,encoding='utf-8').read()
a=s.index('## Passo 0'); b=s.index('## Fora do Windows')
blocos=re.findall(r'```bash\n(.*?)```',s[a:b],re.S)
os.makedirs(out,exist_ok=True)
for i,b_ in enumerate(blocos):
    sub=b_.replace('/caminho/da/pasta/bin/do/postgresql-17',pgbin).replace('/caminho/fora/do/repositorio',pasta)
    sub=sub.replace('PORTA_ORIGEM=55451',f'PORTA_ORIGEM={porta}').replace('PORTA_DESTINO=55452',f'PORTA_DESTINO={porta+1}').replace('PORTA_API=3355',f'PORTA_API={porta+2}')
    open(f'{out}/{i:02d}.orig','w',encoding='utf-8').write(b_)
    open(f'{out}/{i:02d}.sh','w',encoding='utf-8').write(sub)
print(len(blocos))
