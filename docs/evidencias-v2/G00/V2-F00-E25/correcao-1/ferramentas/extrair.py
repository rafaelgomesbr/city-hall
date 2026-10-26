import re,sys,os
doc,out,pgbin,tmp=sys.argv[1:5]
s=open(doc,encoding='utf-8').read()
a=s.index('## Passo 0'); b=s.index('## Fora do Windows')
sec=s[a:b]
blocos=re.findall(r'```bash\n(.*?)```',sec,re.S)
os.makedirs(out,exist_ok=True)
for i,b_ in enumerate(blocos):
    orig=b_
    sub=b_.replace('/caminho/da/pasta/bin/do/postgresql-17',pgbin).replace('/caminho/fora/do/repositorio',tmp)
    sub=sub.replace('PORTA_ORIGEM=55451','PORTA_ORIGEM=55601').replace('PORTA_DESTINO=55452','PORTA_DESTINO=55602').replace('PORTA_API=3355','PORTA_API=55603')
    open(f'{out}/{i:02d}.orig','w',encoding='utf-8').write(orig)
    open(f'{out}/{i:02d}.sh','w',encoding='utf-8').write(sub)
print(len(blocos))
