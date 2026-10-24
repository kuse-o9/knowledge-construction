"""Build routable graphs from source shapes; reject missing paths instead of drawing a bridge."""
import collections,heapq,math

def metres(a,b):return math.hypot((a[0]-b[0])*111320*math.cos(math.radians((a[1]+b[1])/2)),(a[1]-b[1])*111320)
def graph(corridors):
 nodes={};edges=collections.defaultdict(list);sources={}
 def add(a,b,key):
  a,b=tuple(a),tuple(b);sources[key]=[list(a),list(b)];length=metres(a,b)
  edges[a].append((b,length,key,False));edges[b].append((a,length,key,True));nodes[a]=a;nodes[b]=b
 for c in corridors:
  for s in c['sections']:
   for i,(a,b)in enumerate(zip(s['coordinates'],s['coordinates'][1:])):
    if a!=b:add(a,b,(c['operator'],c['line'],s['sourceFeature'],i))
 g={'nodes':nodes,'edges':edges,'sources':sources,'stationNodes':{}}
 # Insert station anchors ON source segments. Never bridge separate tracks.
 for c in corridors:
  for station in c['stations']:
   point=midpoint(station['coordinates']);best=None
   for key,ps in list(sources.items()):
    if key[:2]!=(c['operator'],c['line']):continue
    d,along,i,t=projection(ps,point)
    if best is None or d<best[0]:best=(d,key,ps,t)
   if best is None or best[0]>100:continue
   error,key,ps,t=best;a,b=map(tuple,ps)
   if t<1e-9:n=a
   elif t>1-1e-9:n=b
   else:
    n=(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t)
    edges[a]=[e for e in edges[a]if e[2]!=key];edges[b]=[e for e in edges[b]if e[2]!=key];del sources[key]
    add(a,n,key+('a',station['code']));add(n,b,key+('b',station['code']))
   g['stationNodes'][(c['operator'],c['line'],station['code'])]=(n,error)
 return g
def nearest_node(g,point,maximum=450):
 d,n=min((metres(p,point),p)for p in g['nodes'])
 if d>maximum:raise ValueError(f'駅と入力線路の対応を確認できない: {d:.1f} m')
 return n,d
def path(g,begin,end):
 q=[(0,begin)];distance={begin:0};previous={}
 while q:
  d,a=heapq.heappop(q)
  if d!=distance[a]:continue
  if a==end:break
  for b,length,key,reverse in g['edges'][a]:
   cand=d+length
   if cand<distance.get(b,math.inf):distance[b]=cand;previous[b]=(a,key,reverse);heapq.heappush(q,(cand,b))
 if end not in distance:raise ValueError('入力データ内で線路が接続していません。架空の接続線は生成しません。')
 route=[];b=end
 while b!=begin:
  a,key,reverse=previous[b];route.append((key,reverse));b=a
 route.reverse();points=[]
 for key,reverse in route:
  ps=g['sources'][key];ps=list(reversed(ps))if reverse else ps
  if points and points[-1]!=ps[0]:raise ValueError('Source edge coordinates are disconnected')
  points.extend(ps[1:]if points else ps)
 return points,route,distance[end]
def midpoint(ps):
 lengths=[metres(a,b)for a,b in zip(ps,ps[1:])];target=sum(lengths)/2
 for a,b,length in zip(ps,ps[1:],lengths):
  if target<=length:
   t=target/length if length else 0;return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]
  target-=length
 return ps[-1]
def projection(points,p):
 best=None;along=0
 for i,(a,b)in enumerate(zip(points,points[1:])):
  k=111320*math.cos(math.radians(p[1]));ax=(a[0]-p[0])*k;ay=(a[1]-p[1])*111320;dx=(b[0]-a[0])*k;dy=(b[1]-a[1])*111320;l2=dx*dx+dy*dy;t=max(0,min(1,-(ax*dx+ay*dy)/l2))if l2 else 0;distance=math.hypot(ax+t*dx,ay+t*dy);length=metres(a,b);candidate=(distance,along+t*length,i,t)
  if best is None or candidate[0]<best[0]:best=candidate
  along+=length
 return best
