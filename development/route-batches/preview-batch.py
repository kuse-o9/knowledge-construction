"""Read-only candidate preview. Never marks routes complete or generates railway assets."""
import argparse,json,re
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--count',type=int,default=100);args=p.parse_args()
if not 1<=args.count<=100: p.error('count must be 1..100')
plan=json.loads((Path(__file__).parents[1]/'railway-plan.json').read_text())
seen=set();items=[];excluded=[]
for item in plan['items']:
 name=item['line'];status=item.get('status','')
 if '未着手' not in status:continue
 if re.search('モノレール|ゆりかもめ|AGT|新交通|舎人|ポートライナー|六甲ライナー|アストラム|リニモ|ケーブル|ロープウェイ|BRT|廃止',name):excluded.append(item['number']);continue
 # Train names need service mapping before counting as a separate physical corridor.
 if name.startswith('特急'):continue
 normalized=re.sub(r'（.*?）','',name)
 if normalized in seen:continue
 seen.add(normalized);items.append({k:item[k]for k in ['number','operator','region','line']})
print(json.dumps({'mode':'planning-only','requested':args.count,'availableCandidates':len(items),'selection':'provisional; verify physical corridor and current official sources before production','candidates':items[:args.count],'excludedSpecialOrUnverifiedNumbers':excluded},ensure_ascii=False,indent=2))
