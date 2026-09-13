import * as server from '@minecraft/server';
import {ActionFormData, FormCancelationReason} from '@minecraft/server-ui';
import {
  BUILD, FORM_PROPERTY, DEBUG_PROPERTY, SNAPSHOT, LEGACY_SNAPSHOT,
  preferredForm, needsPreferenceMigration, isPlayer, safeMessage, applyForm,
  captureInventory, compareInventory, createSessionGuard
} from './core.js';
import {spawnProbes, cleanupProbes} from './probes.js';
import {VIEW_PROPERTY,MOTION_PROPERTY,preferredView,preferredMotion,applyView,applyMotion,restoreSettings,HAND_HEIGHT_PROPERTY,preferredHandHeight,applyHandHeight} from './settings.js';
const {world, system, EquipmentSlot, CustomCommandParamType, CustomCommandStatus} = server;
const Permission = server.CommandPermissionLevel ?? server.CustomCommandPermissionLevel;
const sessions = createSessionGuard();
const menus = new Set();
const slots = {head: EquipmentSlot.Head, chest: EquipmentSlot.Chest, legs: EquipmentSlot.Legs, feet: EquipmentSlot.Feet, offhand: EquipmentSlot.Offhand};
const log = text => console.warn(`[ElleeDog 67 Pets ${BUILD}] ${text}`);
function fail(player, error) {const text = error instanceof Error ? error.message : String(error); log(text); if (player) safeMessage(player, `ERROR: ${text}`);}

function clientcheck(player) {
  // Do not hardcode the expected translated text here: the resource pack must supply it.
  player.sendMessage({translate:'pet.diag.rp_021'});
  safeMessage(player, 'The line above is a client resource-language check, NOT proof that the player model loaded. Include it in your screenshot.');
}
function select(player, form) {
  applyForm(player, form);
  system.runTimeout(() => {
    if (!isPlayer(player)) return;
    try {
      const actual = player.getProperty(FORM_PROPERTY);
      if (actual !== form) throw new Error(`Property did not apply: requested ${form}, got ${String(actual)}.`);
      safeMessage(player, `Server pet:form=${actual}. Expected client marker: ${form === 'carter' ? 'D7' : 'P7'}, with 0.2.1 below it. Movement and mouth-tool test. Markers are hidden unless /pet:debug on. First-person view: /pet:view paws or native.`);
      if (form === 'human') safeMessage(player, 'Your full original human skin should return. Leave the old FORCE STATIC test pack deactivated.');
    } catch (error) {fail(player,error);}
  }, 2);
}
function diagnose(player) {
  const equipment = captureInventory(player, slots).equipment;
  const report = {
    build:BUILD, saved:preferredForm(player), serverForm:player.getProperty(FORM_PROPERTY),
    handHeight:player.getProperty(HAND_HEIGHT_PROPERTY),view:player.getProperty(VIEW_PROPERTY),motion:player.getProperty(MOTION_PROPERTY),debug:player.getProperty(DEBUG_PROPERTY),
    dimension:player.dimension.id,
    movement:Object.fromEntries(['isOnGround','isFlying','isSprinting','isSneaking','isSwimming','isInWater'].map(k=>[k,typeof player[k]==='boolean'?player[k]:null])),
    velocity:typeof player.getVelocity==='function' ? player.getVelocity() : null,
    equipment:Object.fromEntries(Object.entries(equipment).map(([k,v])=>[k,v?.type ?? 'empty'])),
    mainhand:player.getComponent('minecraft:equippable')?.getEquipment(EquipmentSlot.Mainhand)?.typeId ?? 'empty'
  };
  safeMessage(player,JSON.stringify(report));
  clientcheck(player);
  safeMessage(player,'Client facts to report: stationary empty-hand visibility in paws/native view, mouth tool position, and Human restoration. /pet:debug on shows D7/P7 0.2.1, anatomical mouth marker and cyan hand-grip marker. The script cannot read those visuals.');
  log(JSON.stringify(report));
}
async function menu(player) {
  if (!isPlayer(player) || menus.has(player.id)) return;
  const id=player.id; menus.add(id);
  try {
    for (let attempt=0;attempt<3;attempt++) {
      if (!isPlayer(player)) return;
      const response = await new ActionFormData()
        .title(`ElleeDog 67 Pets ${BUILD}`)
        .body('0.2.1 hand-rig and mouth-grip patch. Movement unchanged. Check an empty hand in paws/native view, then a pickaxe in third person. No fitted armor yet. /pet:handheight 0 resets empty-hand calibration; 4 raises it.')
        .button('Client resources: C7 / 0.2.1', 'textures/ui/pet_diag_021')
        .button('Carter - Cavalier King Charles Spaniel')
        .button('Human')
        .button('Print server diagnostics')
        .button(`First person: ${preferredView(player)} (toggle)`)
        .button(`Movement: ${preferredMotion(player) ? 'on' : 'off'} (toggle)`)
        .show(player);
      if (response.canceled) {
        if (response.cancelationReason === FormCancelationReason.UserBusy && attempt<2) {await new Promise(r=>system.runTimeout(r,10));continue;}
        return;
      }
      if (response.selection===0) clientcheck(player);
      else if (response.selection===1) select(player,'carter');
      else if (response.selection===2) select(player,'human');
      else if (response.selection===3) diagnose(player);
      else if (response.selection===4) view(player,preferredView(player)==='paws'?'native':'paws');
      else if (response.selection===5) motion(player,preferredMotion(player)?'off':'on');
      return;
    }
  } catch(error) {fail(player,error);} finally {menus.delete(id);}
}

function verifySetting(player,key,value,message){
  system.runTimeout(()=>{if(!isPlayer(player))return;try{
    if(player.getProperty(key)!==value)throw new Error(`Property did not apply: ${key}`);
    safeMessage(player,message);
  }catch(error){fail(player,error);}},2);
}
function view(player,value){
  applyView(player,value);
  verifySetting(player,VIEW_PROPERTY,value,`First-person presentation: ${value}. Camera height and targeting unchanged. This confirms server state, not client pixels.`);
}
function handheight(player,value){
  applyHandHeight(player,value);
  verifySetting(player,HAND_HEIGHT_PROPERTY,value,`Empty first-person hand height: ${value} model units. Positive raises it, 0 resets it. Applies only to empty-handed Carter in paws/native view; not a camera change.`);
}
function motion(player,value){
  const enabled=value==='on';applyMotion(player,enabled);
  verifySetting(player,MOTION_PROPERTY,enabled,`Locomotion/idle motion ${value}. Tool grip and use animations remain active. Player movement physics are unchanged.`);
}

function restore(player,attempt=0,generation=undefined) {
  if (!isPlayer(player)) return;
  const id=player.id,gen=generation??sessions.next(id);
  if (!sessions.current(id,gen)) return;
  try {
    const migrating = needsPreferenceMigration(player);
    applyForm(player, preferredForm(player), migrating);
    restoreSettings(player);
    if (migrating) safeMessage(player, 'Saved form carried over to ElleeDog 67 Pets. Use /pet:form carter or /pet:form human.');
  }
  catch(error) {if(attempt<3)system.runTimeout(()=>restore(player,attempt+1,gen),10);else fail(player,error);}
}
function snapshot(player) {
  const text=JSON.stringify(captureInventory(player,slots));
  if(text.length>12000)throw new Error('Test inventory is too large for this snapshot.');
  player.setDynamicProperty(SNAPSHOT,text);safeMessage(player,'Snapshot saved; change form, then use /pet:compare without moving or using items.');
}
function compare(player) {
  const raw=player.getDynamicProperty(SNAPSHOT) ?? player.getDynamicProperty(LEGACY_SNAPSHOT);
  if(typeof raw!=='string')throw new Error('Run /pet:snapshot first.');
  const changes=compareInventory(JSON.parse(raw),captureInventory(player,slots));
  safeMessage(player,changes.length?`Changed captured fields: ${changes.join(', ')}`:'PASS: captured inventory/equipment fields unchanged. This is not a complete native item serialization.');
}
function cleanup(player) {
  const r=cleanupProbes(world,player.id);
  safeMessage(player,`Removed ${r.removed} of your currently loaded probe entities.`);
  if(r.errors.length)throw new Error(r.errors.join('; '));
}
function selfCommand(handler,delay=1) {
  return (origin,...args) => {
    const player=origin.sourceEntity;
    if(!isPlayer(player))return {status:CustomCommandStatus.Failure,message:'Run directly as a player.'};
    system.runTimeout(()=>{if(isPlayer(player)){try{handler(player,...args);}catch(error){fail(player,error);}}},delay);
    return {status:CustomCommandStatus.Success};
  };
}
system.beforeEvents.startup.subscribe(event=>{
  try {
    const registry=event.customCommandRegistry;
    registry.registerEnum('pet:form_choice',['human','carter']);
    registry.registerEnum('pet:debug_choice',['on','off']);
    registry.registerEnum('pet:view_choice',['paws','native']);
    const register=(name,description,handler,params=[],delay=1)=>registry.registerCommand({
      name:`pet:${name}`,description,permissionLevel:Permission.Any,cheatsRequired:false,mandatoryParameters:params
    },selfCommand(handler,delay));
    register('form','Set your saved Human/Carter player form',select,[{name:'pet:form_choice',type:CustomCommandParamType.Enum}]);
    register('view','Choose paw or native first-person presentation',view,[{name:'pet:view_choice',type:CustomCommandParamType.Enum}]);
    register('handheight','Adjust empty Carter hand height (-8..12; 0 resets)',handheight,[{name:'height',type:CustomCommandParamType.Integer}]);
    register('motion','Enable or pause visual locomotion for testing',motion,[{name:'pet:debug_choice',type:CustomCommandParamType.Enum}]);
    register('menu','Open form menu and C7 texture check',menu,[],5);
    register('diagnose','Print server state and request a client resource translation',diagnose);
    register('clientcheck','Display a resource-pack-supplied diagnostic phrase',clientcheck);
    register('probe','Create your two temporary stationary render-test props',p=>{
      const result=spawnProbes(world,p);
      safeMessage(p,`Server spawned ${result.length} test props ahead. Look for an R7 cube and a static Carter. A spawn success does NOT verify rendering.`);
      safeMessage(p,'These are test props, not a player transformation. /pet:cleanup removes your loaded props; each also expires after 120 seconds of loaded simulation.');
      log(`probe ${JSON.stringify(result)}`);
    });
    register('cleanup','Remove only your own currently loaded test props',cleanup);
    register('snapshot','Save a read-only test inventory summary',snapshot);
    register('compare','Compare captured inventory fields',compare);
    register('debug','Toggle version and mouth-alignment markers',(p,value)=>{p.setProperty(DEBUG_PROPERTY,value==='on');},[{name:'pet:debug_choice',type:CustomCommandParamType.Enum}]);
    register('reset','Restore human selection and remove your loaded test props',p=>{
      select(p,'human');applyView(p,'paws');applyMotion(p,true);applyHandHeight(p,0);p.setProperty(DEBUG_PROPERTY,false);p.setDynamicProperty(SNAPSHOT,undefined);p.setDynamicProperty(LEGACY_SNAPSHOT,undefined);cleanup(p);
    });
    log('ElleeDog 67 Pets 0.2.1 registered 13 commands. Client rendering has NOT been verified by registration.');
  } catch(error) {fail(undefined,error);}
  try {event.itemComponentRegistry.registerCustomComponent('pet:open_form_menu',{onUse(e){system.run(()=>menu(e.source));}});}
  catch(error){fail(undefined,error);}
});
world.afterEvents.playerSpawn.subscribe(event=>system.run(()=>{
  restore(event.player);
  if(event.initialSpawn)safeMessage(event.player,'ElleeDog 67 Pets 0.2.1 PAW + GRIP FIX active. /pet:form carter; /pet:view paws; /pet:debug on for D7/P7 markers. Test without armor. Old FORCE STATIC RP must be off.');
}));
world.afterEvents.playerLeave.subscribe(event=>{sessions.remove(event.playerId);menus.delete(event.playerId);});
system.runTimeout(()=>{try{for(const player of world.getAllPlayers())restore(player);}catch(error){fail(undefined,error);}},20);
