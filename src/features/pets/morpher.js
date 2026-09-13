/** Reusable book item and touch-friendly, four-option menu. No writable-book UI.
 * The only inventory mutation in this module is an explicit /pet:book grant.
 */
import {ItemStack} from '@minecraft/server';
import {ActionFormData,FormCancelationReason} from '@minecraft/server-ui';
import {PETS} from './catalog.generated.js';
import {isPlayer,formLabel,preferredForm} from './core.js';
export const BOOK_ID='pet:morpher_book';
export const BOOK_TITLE='ElleeDog 67 Pet Morpher';
export const MORPHER_COMPONENT='pet:open_morpher';

export function giveMorpher(player) {
  if(!isPlayer(player)) throw new Error('The player is no longer connected.');
  const container=player.getComponent('minecraft:inventory')?.container;
  if(!container) throw new Error('Player inventory is not available.');
  // The book is deliberately unstackable. Never overwrite a slot or drop a failed grant.
  if(container.emptySlotsCount<1) throw new Error('Inventory full. Free one slot, then run /pet:book again.');
  const book=new ItemStack(BOOK_ID,1);
  book.nameTag=BOOK_TITLE;
  book.setLore(['Choose your form.']);
  const remainder=container.addItem(book);
  if(remainder) throw new Error('Could not add the Pet Morpher. Free one inventory slot and try again.');
  return book;
}

export function petBiography(pet) {
  return `Owner: ${pet.owner}\n${pet.description}`;
}
export function morpherChoices() {
  return [{id:'human',label:'Player',icon:'textures/ui/pets/player'},
    ...PETS.map(p=>({id:p.id,label:p.display_name,icon:p.menu_icon,pet:p}))];
}

/** One active book flow per player. Session tickets discard late responses after
 * leaving, changing dimensions, respawning, or choosing a form by another route.
 */
export function createMorpherMenu({select,reportError,wait}) {
  const active=new Map();
  function close(id){active.delete(id);}
  async function open(player) {
    if(!isPlayer(player)||active.has(player.id)) return false;
    const id=player.id,token={player};active.set(id,token);
    const valid=()=>isPlayer(player)&&active.get(id)===token;
    const show=async form=>{
      for(let attempt=0;attempt<3;attempt++) {
        if(!valid()) return null;
        const response=await form.show(player);
        if(!valid()) return null;
        if(response.canceled) {
          if(response.cancelationReason===FormCancelationReason.UserBusy&&attempt<2) {await wait(10);continue;}
          return null;
        }
        return response;
      }
      return null;
    };
    try {
      // Bound total navigation so malformed clients cannot hold an endless server loop.
      for(let page=0;page<32&&valid();page++) {
        const choices=morpherChoices();
        const menu=new ActionFormData().title(BOOK_TITLE)
          .body(`Current form: ${formLabel(preferredForm(player))}`);
        for(const c of choices) menu.button(c.label,c.icon);
        const result=await show(menu);
        if(!result) return false;
        const choice=choices[result.selection];
        if(!choice) return false;
        if(choice.id==='human') {select(player,'human');return true;}
        const detail=new ActionFormData().title(choice.label)
          .body(petBiography(choice.pet))
          .button(`Become ${choice.label}`,choice.icon).button('Back');
        const answer=await show(detail);
        if(!answer) return false;
        if(answer.selection===0) {if(valid())select(player,choice.id);return true;}
        if(answer.selection!==1) return false;
      }
      return false;
    } catch(error) {reportError(player,error);return false;}
    finally {if(active.get(id)===token)active.delete(id);}
  }
  return {open,close,isOpen:id=>active.has(id)};
}
