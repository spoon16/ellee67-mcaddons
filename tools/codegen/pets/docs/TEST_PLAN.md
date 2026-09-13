# 0.5.2 armor-restoration acceptance test

Use a copied test world with the matching four-pack bundle. No extra player-definition
test pack. Do not remove/re-equip armor between form selections: that would conceal
whether the transition itself is fixed. The book is the intended user interface.

1. While **Player**, equip a plain iron or diamond helmet, chestplate, leggings and
   boots. Capture the original appearance. Confirm the pieces are in the equipment
   slots, not merely the hotbar.
2. Use the book to choose Carter, then Player. The native armor should line up with
   the current player body without a second command or changing equipment.
3. Repeat with Mochi and Casper. Walk, turn, crouch, and swing after returning to
   Player. Armor should follow the actual head, torso, arms and legs, with no floating
   or seated pet-shaped remnants. Do this unmounted first.
4. Repeat with Rbow armor and a mixed native/Rbow set. Check the original skin/cape
   and first-person hands return, and pets retain their fitted shapes and paw height 2.
5. While Player, run `/pet:armor native` once. The body/form should NOT change and
   already worn armor should stay native. While a pet, that same command keeps the
   pet body and selects the native armor fallback; use the book's Player choice to
   change bodies. A subsequent pet selection should restore fitted armor.
6. Optional inventory check: after finishing equipping, run `/pet:snapshot`, perform
   book-only form switches without using/moving items, then `/pet:compare`. This
   compares exposed item fields, not a complete native serialization.
7. Once local tests pass, have a second viewer watch a Player -> pet -> Player cycle.
   Check their view separately. Also check inventory preview and the current Persona
   outfit. Local observer results are not automatically multiplayer results.

If it fails, send one screenshot **after selecting Player**, `/pet:diagnose` output,
and which material/slot remains misplaced. `/pet:check` should still say READY 17/17.
Debug markers are P52/D52/M52/C52, stamped 0.5.2. This is not a sitting-pose test.

Do not treat putting a piece back into its slot or relogging as a passing transition.
