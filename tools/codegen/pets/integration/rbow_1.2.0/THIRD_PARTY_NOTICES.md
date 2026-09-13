# Third-party notices

## Current release: 1.2.0

Runtime art is preserved from the user-approved 1.1.10 build, including the
previous sleeve repair. No new texture-generation or originality claim is made.
The spear references Minecraft's built-in resources; no native spear model or
animation file is copied into this release's resource pack. The three Rbow block
items use the native `minecraft:sulfur_cube_archetype_bouncy` item tag. Sulfur-cube
behavior/rendering is supplied by Minecraft, not overridden by this add-on.
Normalized sulfur-cube reference excerpts under `docs/sulfur_cube_reference/`
are from Mojang/bedrock-samples v1.26.40.05, subject to Mojang's terms. They are
for offline contract tests only and are not installed in either pack.

The notes below record historical sources and revisions. In particular,
from-scratch-generation statements about 1.1.1 do not describe the later
Art Aligned images adopted by the current release.

## Mojang Bedrock samples

Pinned reference: Mojang/bedrock-samples, tag **v1.26.40.05**.

Repository: https://github.com/Mojang/bedrock-samples/tree/v1.26.40.05  
License: https://github.com/Mojang/bedrock-samples/blob/v1.26.40.05/LICENSE.md

The repository license states:

> (c) Mojang AB. All rights reserved.
>
> By downloading the files in this repository, you agree to the Minecraft End User License Agreement and that these files are subject to its terms.

Minecraft EULA: https://www.minecraft.net/en-us/eula

This source archive contains native reference images under `art/references/`
for the Netherite hoe, spear inventory/entity textures, and both Netherite armor
texture layers. They are retained only as historical shape references. Version 1.1.1 does not read, sample, or recolor those historical references. The new art generator runs successfully with no image inputs.
The spear texture-mesh geometry and armor attachable structure are adapted
from the same sample. The behavior pack includes an adapted vanilla
`minecraft:player` definition and native spear component configuration. These
materials are not relicensed under this project's original-code MIT license.
The included player reference JSON is a normalized transcription of the pinned
sample rather than an assertion of byte-for-byte identity with its original text.

Relevant paths in that tag:

- `resource_pack/textures/items/netherite_hoe.png`
- `resource_pack/textures/items/spear/netherite_spear.png`
- `resource_pack/textures/entity/spear/netherite_spear.png`
- `resource_pack/textures/models/armor/netherite_1.png`
- `resource_pack/textures/models/armor/netherite_2.png`
- `resource_pack/models/entity/spear.geo.json`
- `resource_pack/attachables/netherite_helmet.json` and analogous armor definitions
- `behavior_pack/items/netherite_spear.json`
- `behavior_pack/recipes/iron_spear.json`
- `behavior_pack/entities/player.json`

## Uploaded concept and pack-icon artwork

The pack icon and other item/block concept illustrations were supplied or
approved by the user in this project. Original images remain under
`art/original/`. The mascot pack icon is resized from the supplied artwork. Version 1.1.1 inventory, block-face and worn-armor textures are constructed from new shapes and per-face pixel painting by tools/paint_prism.py. These are not Netherite recolors, inherited masks, or poster crops. Standard armor UV coordinates describe where painted faces belong on a model; they do not supply any pixel colors. Inclusion does not assert ownership
of any third-party marks or provide a blanket commercial redistribution license.

## Bedrock-oriented numerical cross-check

PocketMine-MP's original `ToolTier.php` and `Pickaxe.php` implementations were
consulted for Bedrock tool values, not copied into the runtime. They are an
independent implementation, not a guarantee of parity with Mojang's current
engine. Native comparison remains an acceptance test.

https://github.com/pmmp/PocketMine-MP/blob/stable/src/item/ToolTier.php
https://github.com/pmmp/PocketMine-MP/blob/stable/src/item/Pickaxe.php

Minecraft is a trademark of Mojang/Microsoft. This add-on is unofficial and is
not endorsed by or published through the Minecraft Marketplace.

## v1.1.2 spear pose reference

The spear binding-space offsets and animation variable names are adapted from Mojang's `resource_pack/animations/spear.animation.json`, tag v1.26.40.05 (blob SHA 795ba40d93d701c8dd047e8e64fdef90e9eb0c24). A relevant two-animation reference excerpt is included at `art/references/spear.animation.vanilla.json` for review. Mojang's Bedrock samples are (c) Mojang AB, subject to the Minecraft EULA. These reference data are not relicensed as original ElleeDog artwork. The held Rbow texture remains originally authored; only its orientation was changed.


## Historical version 1.1.3 trim implementation (removed in 1.1.4)

The 36 native trim masks previously under art/references/trims were from Mojang/bedrock-samples v1.26.40.05. The exported Rbow trim layers retain those native pattern masks with new multicolor pixels; they are derivatives subject to the same Mojang terms, not original pattern designs. Armor renderer/attachable configurations and the armor-stand definition are adapted from the same native reference. The trim-comparison preview uses Mojang Netherite armor base textures, not newly authored base pixels. The 1.1.4 exporter uses the already-exported Art Aligned PNG files.


## Version 1.1.4 asset preservation and removed trim feature

The runtime no longer includes custom rainbow trim masks or vanilla armor
attachable overrides. Those 1.1.3 features and their generator are removed.
Standard armor rendering still references Minecraft's built-in assets.

The 23 retained Rbow PNGs are copied byte-for-byte from 1.1.3 Art Aligned. That
revision extracted its inventory sprites from a user-approved preview and used
its then-current worn-armor sheets. Earlier statements about a no-image-input
procedural generator describe older revisions, not the adopted 1.1.3 artwork.
There is no new originality/from-scratch claim for these inherited pixels.
The current exporter copies the authoritative PNG sources and checks hashes.
Historical generated posters in art/concepts are illustrative only.


## Version 1.1.6 spear action-animation candidate

Four native action-animation definitions are adapted from Mojang's samples
at v1.26.40.05 (`player_firstperson.animation.json`, `player.animation.json`,
and `humanoid.animation.json`). The original definitions are retained as
normalized excerpts in `art/references/spear_player_actions.vanilla.json`.
Each changed animation channel conditionally uses a compact Rbow action curve,
otherwise its original expression. These adaptations and reference definitions
remain subject to Mojang's terms, not this project's original-code license.
No Rbow pixels, geometry, attachables, or item definitions change in 1.1.6.
