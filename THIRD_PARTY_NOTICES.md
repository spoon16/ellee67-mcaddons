# Third-party notices

ElleeDog 67 is an unofficial add-on. It is not an official Minecraft product and is not
approved by or associated with Mojang or Microsoft. Minecraft is a trademark of
Mojang/Microsoft. This add-on is not published through the Minecraft Marketplace.

## Mojang Bedrock samples

Several files in this add-on are adapted from `Mojang/bedrock-samples`
(https://github.com/Mojang/bedrock-samples). That repository's license states:

> (c) Mojang AB. All rights reserved.
>
> By downloading the files in this repository, you agree to the Minecraft End User License
> Agreement and that these files are subject to its terms.

Minecraft EULA: https://www.minecraft.net/en-us/eula

These adapted materials are not relicensed under this project's MIT license.

| What | Where in this add-on | Upstream pin |
|---|---|---|
| Enderman behavior definition with two block-movement filters and one property added | `behavior_packs/elleedog67/entities/overrides/enderman.json` (generated from `tools/codegen/enderman/upstream/enderman.json`) | tag `v1.26.40.05`, `behavior_pack/entities/enderman.json`, blob `23969bb19aad41238246cc9944adfe6370d0093b`; see `tools/codegen/enderman/PROVENANCE.json` |
| Player behavior definition with Rbow armor sensors and Pets properties merged in | `behavior_packs/elleedog67/entities/overrides/player.json` | tag `v1.26.40.05`, `behavior_pack/entities/player.json` (transcription in `tools/codegen/pets/integration/rbow_1.2.0/art/references/player.vanilla.json`) |
| Player client entity, player/cape/persona render controllers, armor render controllers and armor attachable structure, extended for pet rendering | `resource_packs/elleedog67/entity/overrides/`, `render_controllers/overrides/`, `attachables/overrides/` | commit `736072450c26a7c67f07b1661f29d9a5ebaa14b1`; see `tools/codegen/pets/upstream/PROVENANCE.json` and `tools/codegen/pets/upstream/native_armor_052/PROVENANCE.json` |
| Spear geometry, action-animation channels, `iron_spear` recipe shape and native spear component configuration used by the Rbow spear | `behavior_packs/elleedog67/items/rbow-ore/rbow_spear.json`, `resource_packs/elleedog67/attachables/pets/rbow_spear_native.json` | tag `v1.26.40.05`; `spear.animation.json` blob `795ba40d93d701c8dd047e8e64fdef90e9eb0c24` |
| Reference PNGs used only by offline previews and tests (never shipped in the packs) | `tools/codegen/pets/upstream/**`, `tools/codegen/pets/integration/rbow_1.2.0/art/references/**`, `tools/codegen/pets/integration/rbow_1.2.0/docs/sulfur_cube_reference/**` | as recorded in those folders |

## Artwork

The ElleeDog 67 pack icon, the ElleeDog 67 Book icon (a resized copy of the pack icon), the
Pet Morpher book art, the Redstone Guide book art, and the Rbow item, block and armor
textures were supplied or approved by the user. The Carter, Mochi and Casper pet
geometry, coats and paws are ElleeDog 67 assets. Inclusion does not assert ownership of
any third-party marks or grant a blanket commercial redistribution license for the
artwork. No font files, user screenshots, custom skin packs or Marketplace models or
textures are distributed.

## Other references consulted (not copied)

PocketMine-MP's `ToolTier.php` and `Pickaxe.php` were consulted for Bedrock tool tier
values when the Rbow tools were written. Microsoft Learn creator documentation was
consulted for formats. Neither is copied into the runtime.
