#!/usr/bin/env python3
"""Small reproducible, CPU-only escape-potential ensemble. No external weights."""
from pathlib import Path
import gzip, json, hashlib, time
import numpy as np
from threadpoolctl import threadpool_limits

ROOT=Path(__file__).resolve().parents[1]
def write(path, value):
    tmp=path.with_suffix(path.suffix+'.tmp');tmp.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n');tmp.replace(path)
def features(boards):
    b=np.asarray(boards,dtype=np.float64)
    r=np.zeros_like(b);np.log2(b,out=r,where=b>0);mx=r.max(axis=1,keepdims=True)
    x=[r/15,np.where(r>0,(mx-r)/15,0),(r>0).astype(float)]
    grid=r.reshape(-1,4,4)
    x.extend([(grid>0).mean(axis=2),(grid>0).mean(axis=1)])
    for axis in [2,1]:
        d=np.diff(grid,axis=axis)
        x.append(np.minimum(np.maximum(d,0).sum(axis=axis),np.maximum(-d,0).sum(axis=axis))/45)
    return np.concatenate(x,axis=1)
def sigmoid(x):
    return 1/(1+np.exp(-np.clip(x,-40,40)))
def forward(x,p):
    h=np.maximum(0,x@p[0]+p[1]);return h,sigmoid(h@p[2]+p[3])
def auc(y,p):
    # Fixed, tie-aware rank statistic; report both heads on seed-held-out data.
    order=np.argsort(p,kind='stable');ranks=np.empty(len(p),float);i=0
    while i<len(p):
        j=i+1
        while j<len(p) and p[order[j]]==p[order[i]]:j+=1
        ranks[order[i:j]]=(i+1+j)/2;i=j
    n=int(y.sum());m=len(y)-n
    return float((ranks[y==1].sum()-n*(n+1)/2)/(n*m)) if n and m else None
def metrics(y,p):
    return [{'horizon':h,'brier':float(np.mean((y[:,k]-p[:,k])**2)),
      'auc':auc(y[:,k],p[:,k]),'positiveRate':float(y[:,k].mean()),
      'predictedMean':float(p[:,k].mean()),'accuracy':float(np.mean((p[:,k]>=.5)==y[:,k]))}
      for k,h in enumerate([256,1024,4096])]

started=time.monotonic();source=ROOT/'models/v118-learning-data.jsonl.gz'
rows=[json.loads(x) for x in gzip.open(source,'rt')]
assert rows and all(r['seed']<18001 for r in rows)
x=features([r['board'] for r in rows]);y=np.asarray([[r['remaining']>=256,r['remaining']>=1024,r['remaining']>=4096] for r in rows],dtype=float)
groups=np.asarray([r['seed'] for r in rows]);held=(groups%5)==0
assert held.any() and (~held).any();train_indices=np.flatnonzero(~held);test_indices=np.flatnonzero(held)
train_groups=np.unique(groups[~held]);members=[];reports=[]
with threadpool_limits(limits=1):
    for seed in [11801,11802,11803]:
        random=np.random.default_rng(seed);draws=random.choice(train_groups,size=len(train_groups),replace=True)
        selected=np.concatenate([np.flatnonzero(groups==g) for g in draws])
        p=[random.normal(0,np.sqrt(2/64),(64,32)),np.zeros(32),random.normal(0,.05,(32,3)),np.zeros(3)]
        moments=[np.zeros_like(v) for v in p];variances=[np.zeros_like(v) for v in p];step=0;epochs=[]
        for epoch in range(30):
            perm=random.permutation(selected)
            for start in range(0,len(perm),256):
                ids=perm[start:start+256];batch=x[ids];target=y[ids];hidden,pred=forward(batch,p);mask=np.column_stack([np.ones(len(ids)),target[:,0],target[:,1]])
                grad=(pred-target)*mask/max(1,mask.sum());g2=hidden.T@grad+1e-5*p[2];b2=grad.sum(axis=0)
                back=(grad@p[2].T)*(hidden>0);g1=batch.T@back+1e-5*p[0];b1=back.sum(axis=0)
                step+=1
                for i,g in enumerate([g1,b1,g2,b2]):
                    moments[i]=.9*moments[i]+.1*g;variances[i]=.999*variances[i]+.001*g*g
                    p[i]-=.002*(moments[i]/(1-.9**step))/(np.sqrt(variances[i]/(1-.999**step))+1e-8)
            _,pred=forward(x[test_indices],p);target=y[test_indices];mask=np.column_stack([np.ones(len(target)),target[:,0],target[:,1]]);loss=-np.sum(mask*(target*np.log(pred+1e-12)+(1-target)*np.log(1-pred+1e-12)))/mask.sum()
            epochs.append({'epoch':epoch+1,'heldOutCrossEntropy':float(loss)})
        # Fixed epoch count: no model or epoch picked using final validation.
        _,held_pred=forward(x[test_indices],p)
        member={k:np.round(v.reshape(-1),9).tolist() for k,v in zip(['w1','b1','w2','b2'],p)}
        members.append(member);reports.append({'seed':seed,'bootstrapGroups':draws.tolist(),'epochs':epochs,'heldOut':metrics(y[test_indices],np.cumprod(held_pred,axis=1))})
    predictions=np.mean([np.cumprod(forward(x[test_indices],[np.asarray(m['w1']).reshape(64,32),np.asarray(m['b1']),np.asarray(m['w2']).reshape(32,3),np.asarray(m['b2'])])[1],axis=1) for m in members],axis=0)
data_hash=hashlib.sha256(source.read_bytes()).hexdigest();identity=hashlib.sha256(json.dumps(members,sort_keys=True).encode()).hexdigest()
model={'version':1,'id':'v118-escape-'+identity[:16],'inputSize':64,'hiddenSize':32,'heads':[256,1024,4096],'dataSHA256':data_hash,'members':members}
write(ROOT/'models/v118-survival.json',model)
golden=[]
for i in list(test_indices[:10]):
    outputs=[]
    for m in members:
        p=[np.asarray(m['w1']).reshape(64,32),np.asarray(m['b1']),np.asarray(m['w2']).reshape(32,3),np.asarray(m['b2'])]
        outputs.append(np.cumprod(forward(x[i:i+1],p)[1],axis=1)[0].tolist())
    golden.append({'board':rows[i]['board'],'features':x[i].tolist(),'predictions':outputs})
write(ROOT/'tests/fixtures/v118-learned-golden.json',golden)
write(ROOT/'docs/V11_8_LEARNING_REPORT.json',{'date':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'modelId':model['id'],'modelSHA256':hashlib.sha256((ROOT/'models/v118-survival.json').read_bytes()).hexdigest(),
 'dataSHA256':data_hash,'examples':len(rows),'trainExamples':len(train_indices),'heldOutExamples':len(test_indices),'trainSeedClusters':train_groups.tolist(),'heldOutSeedClusters':np.unique(groups[held]).tolist(),
 'recipe':{'epochs':30,'batch':256,'hiddenUnits':32,'ensemble':3,'bootstrap':'whole seed clusters','optimizer':'Adam','learningRate':.002,'conditionalHeads':[256,1024,4096],'threads':1,'epochSelection':'fixed final epoch'},
 'members':reports,'ensembleHeldOut':metrics(y[test_indices],predictions),'wallSeconds':time.monotonic()-started,
 'limits':'Held-out historical seed clusters assess prediction only; both teachers and duplicate-max labels introduce optimistic selection. These are learned escape scores, not calibrated real survival probabilities or V11.8 terminal strength evidence.'})
print(json.dumps({'trained':model['id'],'examples':len(rows),'heldOut':metrics(y[test_indices],predictions),'seconds':time.monotonic()-started}),flush=True)
