const base = process.env.SUPOS_BOOTSTRAP_API || 'http://backend:8080';
const models = [
  ['J2_ERP_OrderLine', [['businessKey','STRING'],['orderLineRef','STRING'],['requiredQty','DOUBLE'],['dueAt','DATETIME'],['sourceTime','DATETIME']]],
  ['J2_MES_Production', [['businessKey','STRING'],['productionOrderRef','STRING'],['orderLineRef','STRING'],['productionLotRef','STRING'],['completedQty','DOUBLE'],['state','STRING'],['sourceTime','DATETIME']]],
  ['J2_QMS_Quality', [['businessKey','STRING'],['qualityLotRef','STRING'],['productionLotRef','STRING'],['releasedQty','DOUBLE'],['sourceTime','DATETIME']]],
  ['J2_WMS_Shipment', [['businessKey','STRING'],['shipmentLineRef','STRING'],['sourceOrderLineRef','STRING'],['executionCommittedQty','DOUBLE'],['sourceTime','DATETIME']]],
  ['J2_SourceProgress', [['businessKey','STRING'],['sourceSystem','STRING'],['eventType','STRING'],['sourceProgressAt','DATETIME'],['sourceTime','DATETIME']]],
];
async function create(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {'content-type':'application/json', ...(process.env.SUPOS_API_KEY ? {'apikey':process.env.SUPOS_API_KEY} : {})},
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || ![0,200].includes(data.code)) throw new Error(`${path}: HTTP ${response.status}, code ${data.code}, ${data.msg}`);
  return data;
}
const folder = await fetch(`${base}/open-api/uns/folder/supos`).then(r=>r.json());
if (folder.code !== 200 || folder.data?.path !== '/supos/') {
  await create('/open-api/uns/folder', {name:'supos',alias:'supos',displayName:'supos'});
}
console.log('Ready /supos folder');
for (const [name, fields] of models) {
  await create('/open-api/uns/file', {
    name, alias:name, displayName:name, parentAlias:'supos', dataType:1,
    persistence:false, addFlow:false, dashBoard:false,
    definition:fields.map(([name,type])=>({name,type})),
  });
  console.log(`Created /supos/${name}`);
}

