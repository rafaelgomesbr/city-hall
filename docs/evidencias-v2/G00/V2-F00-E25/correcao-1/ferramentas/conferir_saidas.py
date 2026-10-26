import sys,re
d=sys.argv[1]
def lê(n): return open(f'{d}/{n}.txt',encoding='utf-8').read()
def saida(n): return lê(n).split('--- saida ---\n',1)[1]
ex={
 '00':['initdb (PostgreSQL) 17.6','pg_dump (PostgreSQL) 17.6','psql (PostgreSQL) 17.6'],
 '05':['aplicando 050_','Esquema em dia.','Semeado'],
 '10':['linhas: idêntico','estrutura: idêntico','Esquema em dia.'],
 '11':['"status":"ok"','"banco":"ok"','050_login_e_suspensao_na_mesma_linha.sql'],
 '12':['TODAS AS CONFERENCIAS PASSARAM'],
 '13':['pasta temporária apagada'],
}
falhas=[]
for n,lista in ex.items():
    t=saida(n)
    for x in lista:
        if x not in t: falhas.append((n,x))
t=saida('10')
if t.count('ISOLAMENTO: TODAS AS AFIRMACOES PASSARAM')!=2: falhas.append(('10','ISOLAMENTO x2'))
if 'FALHA' in saida('12'): falhas.append(('12','FALHA'))
for n in [f'{i:02d}' for i in range(14)]:
    if 'bloco terminou: sim' not in lê(n): falhas.append((n,'nao terminou'))
t13=saida('13')
# nada depois de pasta apagada, e find sem saida
resto=re.sub(r'[%\s]','',t13.split('pasta temporária apagada',1)[1].replace('--- bloco terminou: sim ---',''))
if resto: falhas.append(('13','find imprimiu: '+resto[:100]))
print('FALHAS:',falhas if falhas else 'nenhuma')
