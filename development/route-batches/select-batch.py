"""Lock the user's first 100 game/service jobs and bind official geometry inputs."""
from pathlib import Path
import json,re,hashlib
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'development/route-batches/batch-001'
OPS={'JR北海道':'北海道旅客鉄道','JR東日本':'東日本旅客鉄道','JR東海':'東海旅客鉄道','JR西日本':'西日本旅客鉄道','JR四国':'四国旅客鉄道','JR九州':'九州旅客鉄道'}
OVERRIDES={
 2:({'東日本旅客鉄道':['中央線','篠ノ井線','大糸線']},'service','新宿〜松本を本体、白馬方面は運行別の停車駅確認後に追加'),
 3:({'東日本旅客鉄道':['中央線']},'service','新宿〜甲府・竜王。あずさと中央本線の地形・線路を共有'),
 4:({x:['東海道線']for x in ['東日本旅客鉄道','東海旅客鉄道','西日本旅客鉄道']},'corridor','東京〜神戸。会社境界と分岐は個別確認'),
 5:({'東海旅客鉄道':['東海道新幹線']},'corridor','東京〜新大阪。新幹線専用軌道・車両・停止位置'),
 6:({'東日本旅客鉄道':['東海道線','伊東線'],'伊豆急行':['伊豆急行線']},'service','東京〜伊豆急下田。現行運行と伊豆箱根方面の扱いは別確認'),
 9:({'東日本旅客鉄道':['田沢湖線','奥羽線']},'service','秋田新幹線。東北新幹線との接続と新在直通区間を分離'),
 10:({'東日本旅客鉄道':['奥羽線']},'service','山形新幹線。東北新幹線との接続と新在直通区間を分離'),
 18:({'北海道旅客鉄道':['根室線']},'corridor','廃止区間を除く現存区間。花咲線は運行区間として分離'),
 20:({'北海道旅客鉄道':['札沼線']},'corridor','学園都市線の現存鉄道区間'),
 31:({'東日本旅客鉄道':['赤羽線','山手線','東北線']},'service','埼京線系統・赤羽線。大崎〜大宮の使用線を切り出す'),
 36:({'東日本旅客鉄道':['中央線']},'corridor','大月〜塩尻と辰野支線。既存東京〜大月は新規完成数に加算しない'),
 37:({'東日本旅客鉄道':['総武線']},'corridor','千葉〜銚子。既存東京〜千葉は新規完成数に加算しない'),
 39:({'東日本旅客鉄道':['東海道線']},'corridor','品鶴線の品川〜鶴見を切り出す。東海道線全体と区別'),
 42:({'東日本旅客鉄道':['東北線']},'corridor','宇都宮線・東北本線のJR現存区間。第三セクター移管区間は別'),
 54:({'東日本旅客鉄道':['信越線']},'corridor','高崎・長野・新潟の分離した現存区間を橋渡ししない'),
 85:({'東海旅客鉄道':['高山線'],'西日本旅客鉄道':['高山線']},'corridor','会社境界で素材を共有し全区間を扱う'),
 91:({'西日本旅客鉄道':['越美北線']},'corridor','九頭竜線'),
 99:({'西日本旅客鉄道':['桜島線']},'corridor','JRゆめ咲線'),
 100:({'西日本旅客鉄道':['福知山線']},'corridor','JR宝塚線を含む'),
 102:({'西日本旅客鉄道':['片町線']},'corridor','学研都市線'),
 104:({'西日本旅客鉄道':['関西線']},'corridor','亀山〜JR難波。JR東海の名古屋〜亀山とは接続区間を共有')}
def normalize(name):return re.sub(r'（.*?）','',name).split('・')[0].replace('本線','線')
def main():
 plan=json.loads((ROOT/'development/railway-plan.json').read_text());index=json.loads((OUT/'sources/index.json').read_text());catalog={(x['operator'],x['line']):x for x in index['corridors']}
 selected=[x for x in plan['items']if 2<=x['number']<=104 and x['number']not in [71,72,79]];assert len(selected)==100
 previous={j['id']:j for j in json.loads((OUT/'manifest.json').read_text())['jobs']}if (OUT/'manifest.json').exists()else{}
 jobs=[];missing=[]
 for order,item in enumerate(selected,1):
  n=item['number'];operator=OPS.get(item['operator']);target=normalize(item['line'])
  if n in OVERRIDES:bindings,kind,scope=OVERRIDES[n]
  else:
   matches=[k for k in catalog if k[1]==target and (operator is None or k[0]==operator)]
   bindings={}
   for op,line in matches:bindings.setdefault(op,[]).append(line)
   kind='corridor';scope=item['line']
  inputs=[]
  for op,lines in bindings.items():
   for line in lines:
    c=catalog.get((op,line))
    if c:inputs.append(c['id'])
    else:missing.append({'planNumber':n,'operator':op,'line':line})
  if not inputs:missing.append({'planNumber':n,'line':item['line']})
  jobs.append({'id':'b001-'+str(order).zfill(3),'order':order,'planNumber':n,'name':item['line'],'operator':item['operator'],'kind':kind,'scope':scope,'sourceCorridors':inputs,'stage':'reference-imported'if inputs else'reference-blocked','playable':False,'releaseReady':False,'completed':False,'qualityGates':{key:'pending'for key in ['currentOperatorScope','allStationsAndStops','correctTrackAndPlatformGeometry','elevationTunnelAndBridge','vehicleSpecificModel','speedAndSignals','neighbourTraffic','bilingualAnnouncements','manualAutoAndEarlyDeparture','saveAndLoad','softwareRendering','releaseHashes']}})
 for job in jobs:
  versions={k:next(c['sha256']for c in index['corridors']if c['id']==k)for k in job['sourceCorridors']};old=previous.get(job['id'])
  if old and old['sourceCorridors']==job['sourceCorridors'] and old['name']==job['name'] and old['scope']==job['scope']:
   for key in ['stage','workArtifacts','inputArtifact']: 
    if key in old:job[key]=old[key]
   if old.get('sourceInputHashes')==versions:
    for key in ['qualityGates','releaseArtifacts','entryPoint','validationReport','expectedPhysicalStationCodes','releaseReady','completed','playable']:
     if key in old:job[key]=old[key]
  job['sourceInputHashes']=versions
 manifest={'batch':'001','requested':'2026-10-21','goal':100,'status':'in-production','counting':'100 game/service jobs; physical track inputs are shared and counted separately. Named trains are not counted as new physical lines.','existingGamesPreserved':True,'completedGames':sum(bool(j['completed'])for j in jobs),'playableGames':sum(bool(j['playable'])for j in jobs),'uniqueSourceCorridors':len(set(i for x in jobs for i in x['sourceCorridors'])),'jobs':jobs,'deferredCandidates':[{'planNumber':71,'reason':'鉄道区間とBRTの現行範囲を別途確認してから制作'},{'planNumber':72,'reason':'鉄道区間とBRTの現行範囲を別途確認してから制作'},{'planNumber':79,'reason':'蟹田以北の代替交通と鉄道事業廃止予定の区間を別途照合'}],'sourceBindingProblems':missing,'rules':['No new game entry until all mandatory quality gates pass','No fabricated connector between disconnected source components','No elevation, platform edge, signal or speed inferred from this 2D dataset','Preserve the common early-departure rule and neighbour traffic requirement']}
 (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
 text='# 未制作100件：制作台帳\n\n2026-10-21に制作開始。下表は実データの取り込み状況であり、ゲームの完成表ではない。特急等は共用線路を再利用する独立した運転系統として扱う。\n\n|順序|元番号|制作対象|入力データ|ゲーム|\n|---:|---:|---|---:|---|\n'
 text+='\n'.join(f"|{j['order']}|{j['planNumber']}|{j['name']}|{len(j['sourceCorridors'])}系統|未完成|"for j in jobs)+'\n'
 (OUT/'README.md').write_text(text);print(json.dumps({'jobs':len(jobs),'uniqueSourceCorridors':manifest['uniqueSourceCorridors'],'bindingProblems':missing},ensure_ascii=False))
if __name__=='__main__':main()
