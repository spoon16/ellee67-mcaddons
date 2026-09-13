/** Read-only inspection of the properties actually exposed by the current entity.
 * Does not infer active packs, manufacture defaults, repair schemas or change preferences.
 * Missing reads remain explicit nulls with status=missing, never a false Player success.
 */
import {PROPERTY_SCHEMA,PROPERTY_SCHEMA_SHA256} from './property_schema.generated.js';
import {MODEL_BY_WIRE,BUILD} from './catalog.generated.js';
const MODEL='pet:model_id';
export const PROPERTY_KEYS=Object.freeze(Object.keys(PROPERTY_SCHEMA));

function validValue(value,definition) {
  if(!definition)return true;
  if(definition.type==='bool')return typeof value==='boolean';
  if(definition.type==='enum')return typeof value==='string'&&definition.values.includes(value);
  if(definition.type==='int'&&!Number.isInteger(value))return false;
  if(typeof value!=='number'||!Number.isFinite(value))return false;
  return !definition.range||(value>=definition.range[0]&&value<=definition.range[1]);
}
export function observeProperty(player,key) {
  try {
    const value=player.getProperty(key);
    if(value===undefined)return {status:'missing',value:null};
    // Primitive snapshots only: preserve type errors without risking a JSON failure.
    const type=typeof value;
    const primitive=type==='number'&&Number.isFinite(value)||type==='string'||type==='boolean';
    const valid=primitive&&validValue(value,PROPERTY_SCHEMA[key]);
    return {status:valid?'ok':'invalid',value:primitive?value:null,...(valid?{}:{actualType:type})};
  } catch(error) {
    return {status:'read_error',value:null,error:error instanceof Error?error.message:String(error)};
  }
}
export function inspectProperties(player,keys=PROPERTY_KEYS) {
  const properties=Object.fromEntries(keys.map(k=>[k,observeProperty(player,k)]));
  const missing=keys.filter(k=>properties[k].status==='missing');
  const invalid=keys.filter(k=>properties[k].status==='invalid');
  const readErrors=keys.filter(k=>properties[k].status==='read_error');
  const validCount=keys.filter(k=>properties[k].status==='ok').length;
  let status=readErrors.length?'READ_ERROR':invalid.length?'INVALID_VALUES':missing.length===keys.length&&keys.length?'MISSING_DEFINITION':missing.length?'PARTIAL_DEFINITION':'READY';
  const m=properties[MODEL];
  const known=m?.status==='ok'&&(m.value===0||Object.hasOwn(MODEL_BY_WIRE,m.value));
  if(status==='READY'&&m&&!known)status='UNREGISTERED_MODEL';
  return {status,expected:keys.length,validCount,missing,invalid,readErrors,properties,
    model:m?.value??null,modelStatus:m?.status??'not_checked',
    serverForm:known?(m.value===0?'player':MODEL_BY_WIRE[m.value].id):null,
    schema:PROPERTY_SCHEMA_SHA256};
}
export function requireProperties(player,keys=PROPERTY_KEYS) {
  const report=inspectProperties(player,keys);
  if(report.missing.length||report.invalid.length||report.readErrors.length) {
    let message;
    if(report.readErrors.length)message=`Cannot read ${report.readErrors[0]} from this entity (${report.properties[report.readErrors[0]].error}).`;
    else if(report.missing.length)message=`${report.missing[0]} is missing from this player entity (${report.validCount}/${report.expected} required values readable).`;
    else message=`Invalid ${report.invalid[0]} value on this player entity.`;
    message+=' Pack activation alone does not verify the loaded player definition. A conflicting/old definition or a load error can cause this; run /pet:check.';
    const error=new Error(message);error.name='PetPropertyStateError';error.propertyReport=report;throw error;
  }
  return Object.fromEntries(keys.map(k=>[k,report.properties[k].value]));
}
const failures=new Map();
export function rememberFailure(player,error,tick,source='command') {
  if(!player?.id)return;
  // No references to live entity or inventory objects are retained.
  const report=error?.propertyReport??inspectProperties(player);
  failures.set(player.id,{tick,source,message:error instanceof Error?error.message:String(error),
    status:report.status,model:report.model,modelStatus:report.modelStatus,
    missing:[...report.missing],invalid:[...report.invalid],readErrors:[...report.readErrors]});
}
export function lastFailure(player) {return failures.get(player.id)??null;}
export function forgetFailure(id) {failures.delete(id);}
export function checkLines(player,tick) {
  const report=inspectProperties(player),failure=lastFailure(player);
  const model=report.modelStatus==='ok'?String(report.model):report.modelStatus.toUpperCase();
  const lines=[`Pets ${BUILD} | ${report.status} | ${report.validCount}/${report.expected} valid properties`,
    `pet:model_id=${model} | observed form=${report.serverForm??'UNAVAILABLE'} | tick=${tick}`];
  if(report.missing.length)lines.push('Missing: '+report.missing.join(', '));
  if(report.invalid.length)lines.push('Invalid: '+report.invalid.join(', '));
  if(report.readErrors.length)lines.push('Read errors: '+report.readErrors.map(k=>`${k}: ${report.properties[k].error}`).join('; '));
  if(failure)lines.push(`Last failure (${failure.source}, tick ${failure.tick}): ${failure.status}; model=${failure.modelStatus==='ok'?failure.model:failure.modelStatus}.`);
  lines.push('Server property check only. /pet:clientcheck checks the resource-language version.');
  return {report,lines};
}
