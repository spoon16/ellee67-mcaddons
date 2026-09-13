# Coordinated form state

`src/appearance.js` is the shared public transition path for commands, book, menu and lifecycle restoration. Its input is a requested form, not a read of the engine's not-yet-updated model property. All relevant property writes are queued in one writable callback.

The service preflights the model, view, motion, armor, gear, height and glint properties before writing any state. Explicit selection resets saved view/motion/armor/gear overrides. Player gets model 0, native view, pet motion off, pet armor/gear off, and height 0. Pets get their own stable ID, paws, motion on, fitted armor/gear and saved hand calibration (profile default 2). Unrelated preferences and actual inventory/equipment never change.

Minecraft applies entity-property writes later; this is not a transactional network commit. A same-tick pending-state cache protects rollback when several form commands are queued before properties become readable. Synchronous property/persistence errors trigger best-effort rollback of the owned values only. Final command confirmation verifies model, view, motion, fitting flags and height two ticks later. A newer selection invalidates older confirmation callbacks and lifecycle retries.

Render controllers additionally gate all pet-only presentation on a recognized subject/wearer model ID. Restoring Player therefore both sets native display properties and takes the native render path. Native skin layers/cape retain their original visibility rules rather than being permanently replaced by transparent resources.

The Morpher menu holds one session ticket per player, bounds busy-UI retries and navigation, discards late responses after lifecycle invalidation, and routes final choices through the same transition service. No form API operation grants an item. `giveMorpher` is isolated: it adds an unstackable book only after an explicit `/pet:book` and checks full-inventory/refusal paths.

`human` remains the internal wire-0/save name for compatibility; public commands accept `player`, and all selection buttons say Player. Casper reserves ID 3, shares Mochi geometry/armor/rig, and supplies separate coat/paw textures and biography. The Morpher is registered for side carry as its own exact item ID, so holding the new book does not intentionally trigger unmapped-item native fallback.

## 0.4.3 renderer and seated alignment corrections

Server flags alone did not restore native armor on the user's client. All player armor
adapters now select native/pet geometry through one render controller with
`rebuild_animation_matrices: true`, using the live wearer's properties. Native bone
identity channels run before (not after) native animations. No equipment stack is
removed/reinserted as a workaround. The engine result still needs visual validation.

`initialSeatProperties` supplies a read-only support/lift calculation for a pet selected
while mounted, independent of the still-deferred model property. Seat lift/kind join the
other queued form properties. Player always queues lift/kind zero; ongoing seat polling
only updates transformed riders and clears the effective state on dismount. Manual
per-category seat trims are separate saved preferences; they never offset Player form.
