/** Reusable book item and touch-friendly, four-option menu. No writable-book UI.
 * The only inventory mutation in this module is an explicit /pet:book grant.
 */
import { type Entity, ItemStack, type Player } from "@minecraft/server";
import { ActionFormData, type ActionFormResponse, FormCancelationReason } from "@minecraft/server-ui";
import { PETS } from "./catalog.generated.ts";
import { formLabel, isPlayer, type Pet, type PlayerLike, preferredForm } from "./core.ts";

export const BOOK_ID = "pet:morpher_book";
export const BOOK_TITLE = "ElleeDog 67 Pet Morpher";
export const MORPHER_COMPONENT = "pet:open_morpher";

export interface PlayerChoice {
  id: "human";
  label: string;
  icon: string;
  pet?: undefined;
}
export interface PetChoice {
  id: string;
  label: string;
  icon: string;
  pet: Pet;
}
export type MorpherChoice = PlayerChoice | PetChoice;

export interface MorpherMenuOptions {
  select(player: Player, form: string): void;
  reportError(player: Player, error: unknown): void;
  wait(ticks: number): Promise<void>;
}
export interface MorpherMenu {
  open(player: Entity | undefined): Promise<boolean>;
  close(id: string): void;
}

export function giveMorpher(player: PlayerLike): ItemStack {
  if (!isPlayer(player)) throw new Error("The player is no longer connected.");
  const container = player.getComponent("minecraft:inventory")?.container;
  if (!container) throw new Error("Player inventory is not available.");
  // The book is deliberately unstackable. Never overwrite a slot or drop a failed grant.
  if (container.emptySlotsCount < 1) throw new Error("Inventory full. Free one slot, then run /pet:book again.");
  const book = new ItemStack(BOOK_ID, 1);
  book.nameTag = BOOK_TITLE;
  book.setLore(["Choose your form."]);
  const remainder = container.addItem(book);
  if (remainder) throw new Error("Could not add the Pet Morpher. Free one inventory slot and try again.");
  return book;
}

export function petBiography(pet: Pick<Pet, "owner" | "description">): string {
  return `Owner: ${pet.owner}\n${pet.description}`;
}
export function morpherChoices(): MorpherChoice[] {
  return [
    { id: "human", label: "Player", icon: "textures/ui/pets/player" },
    ...PETS.map((p) => ({ id: p.id, label: p.display_name, icon: p.menu_icon, pet: p })),
  ];
}
function isPlayerChoice(choice: MorpherChoice): choice is PlayerChoice {
  return choice.id === "human";
}

/** One active book flow per player. Session tickets discard late responses after
 * leaving, changing dimensions, respawning, or choosing a form by another route.
 */
export function createMorpherMenu({ select, reportError, wait }: MorpherMenuOptions): MorpherMenu {
  const active = new Map<string, { player: Player }>();
  function close(id: string): void {
    active.delete(id);
  }
  async function open(player: Entity | undefined): Promise<boolean> {
    if (!isPlayer(player) || active.has(player.id)) return false;
    const id = player.id;
    const token = { player };
    active.set(id, token);
    const valid = () => isPlayer(player) && active.get(id) === token;
    const show = async (form: ActionFormData): Promise<ActionFormResponse | null> => {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (!valid()) return null;
        const response = await form.show(player);
        if (!valid()) return null;
        if (response.canceled) {
          if (response.cancelationReason === FormCancelationReason.UserBusy && attempt < 2) {
            await wait(10);
            continue;
          }
          return null;
        }
        return response;
      }
      return null;
    };
    try {
      // Bound total navigation so malformed clients cannot hold an endless server loop.
      for (let page = 0; page < 32 && valid(); page++) {
        const choices = morpherChoices();
        const menu = new ActionFormData().title(BOOK_TITLE).body(`Current form: ${formLabel(preferredForm(player))}`);
        for (const c of choices) menu.button(c.label, c.icon);
        const result = await show(menu);
        if (!result) return false;
        const choice = result.selection === undefined ? undefined : choices[result.selection];
        if (!choice) return false;
        if (isPlayerChoice(choice)) {
          select(player, "human");
          return true;
        }
        const detail = new ActionFormData()
          .title(choice.label)
          .body(petBiography(choice.pet))
          .button(`Become ${choice.label}`, choice.icon)
          .button("Back");
        const answer = await show(detail);
        if (!answer) return false;
        if (answer.selection === 0) {
          if (valid()) select(player, choice.id);
          return true;
        }
        if (answer.selection !== 1) return false;
      }
      return false;
    } catch (error) {
      reportError(player, error);
      return false;
    } finally {
      if (active.get(id) === token) active.delete(id);
    }
  }
  return { open, close };
}
