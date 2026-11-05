import json,glob,sys,collections
tag=sys.argv[1];by=sys.argv[2] if len(sys.argv)>2 else 'kind'
rows=[json.loads(l) for f in glob.glob(f'results/{tag}_part*.jsonl') for l in open(f) if l.strip()]
print(len(rows),'instances')
keys=sorted({k for r in rows for k in r['res']},key=lambda k:(not k.startswith('net'),k))
g=collections.defaultdict(list)
for r in rows: g[r[by]].append(r); g['ALL'].append(r)
print('%-10s'%by,*['%11s'%k for k in keys])
for k,rs in sorted(g.items(),key=lambda x:str(x[0])):
    print('%-10s'%k,*['%11s'%('%.1f'%(100*sum(r['res'][m]['dens'] for r in rs if r['res'].get(m,{}).get('dens'))/max(1,sum(1 for r in rs if r['res'].get(m,{}).get('dens')))) if any(r['res'].get(m,{}).get('dens') for r in rs) else '-') for m in keys],' n=%d'%len(rs))
bad=[(r['name'],m) for r in rows for m,v in r['res'].items() if not v.get('dens')]
print('invalid:',bad[:10])
