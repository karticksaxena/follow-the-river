import json,shutil,os
import sys
S=sys.argv[1].rstrip('/')+'/'
cats={
'trees':[f'Pine_{i}' for i in range(1,6)]+[f'CommonTree_{i}' for i in range(1,6)]+['TwistedTree_1','TwistedTree_2']+[f'DeadTree_{i}' for i in range(1,4)],
'plants':['Bush_Common','Bush_Common_Flowers','Fern_1','Plant_1','Plant_7','Flower_3_Group','Flower_4_Group','Mushroom_Common'],
'grass':['Grass_Common_Short','Grass_Common_Tall','Grass_Wispy_Tall'],
'rocks':['Rock_Medium_1','Rock_Medium_2','Rock_Medium_3','Pebble_Round_1','Pebble_Round_2','Pebble_Round_3']}
json.dump(cats,open('cats.json','w'))
os.makedirs('src',exist_ok=True)
for c,ms in cats.items():
  for m in ms:
    d=json.load(open(S+m+'.gltf'))
    for mat in d['materials']:
      if mat['name'].startswith('Bark'):
        mat['alphaMode']='OPAQUE'; mat.pop('alphaCutoff',None)
    json.dump(d,open(f'src/{m}.gltf','w'))
    shutil.copy(S+m+'.bin','src/')
    for i in d['images']: shutil.copy(S+i['uri'],'src/')
  open(f'{c}.list','w').write(' '.join(f'src/{m}.gltf' for m in ms))
