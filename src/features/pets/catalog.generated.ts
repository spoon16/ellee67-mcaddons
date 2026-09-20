// GENERATED from catalog/pets; edit the catalog, not this module.
export const BUILD = "0.5.2-native-armor-isolation";
export const RELEASE_VERSION = "0.5.2";
export const CATALOG_HASH = "2b3fc3d316754061353295aede681dd6c785834d334b5e678235e5a7e4e65f5e";
export const MAX_WIRE_ID = 4095;
export const DEFAULT_HAND_HEIGHT = 2;
export const PETS = Object.freeze([
  {
    "schema_version": 1,
    "id": "carter",
    "display_name": "Carter",
    "description": "The softest and also laziest pet you ever met.",
    "order": 10,
    "rig": "spaniel_v1",
    "model": "assets/pets/carter/model.geo.json",
    "texture": "assets/pets/carter/coat.png",
    "first_person": {
      "model": "assets/pets/carter/paws.geo.json",
      "texture": "assets/pets/carter/paws.png",
      "default_hand_height": 2
    },
    "equipment": {
      "mainhand": {
        "mode": "mouth",
        "position": [
          0,
          11.4,
          -11.5
        ],
        "rotation": [
          0,
          0,
          90
        ]
      },
      "offhand": {
        "mode": "side",
        "position": [
          4.2,
          8,
          -3.5
        ]
      },
      "armor_fit": "assets/pets/carter/armor_fit.json",
      "helmet_profile": "covered_crown_floppy_ears",
      "mouth_sprite": {
        "position": [
          0,
          11.05,
          -11.65
        ],
        "pixel_scale": 0.65,
        "rotation": [
          0,
          0,
          0
        ],
        "thickness": 0.65,
        "bake_pixel_rotation_z": -45,
        "orientation_note": "Bake the horizontal handle in texel centers. Do not rely on a runtime bind-pose Z rotation; 0.3.1 rendered 90 degrees wrong on the client."
      },
      "shield": {
        "side_position": [
          4.15,
          8.5,
          0.5
        ],
        "front_position": [
          0,
          8.7,
          -13.1
        ],
        "side_rotation": [
          0,
          -90,
          0
        ],
        "front_rotation": [
          0,
          0,
          0
        ],
        "width": 6.8,
        "height": 9.6,
        "depth": 0.42,
        "transition_seconds": 0.16
      },
      "side_carry": {
        "sprite_position": [
          -4.95,
          8.5,
          0.5
        ],
        "cube_position": [
          -6.65,
          8.5,
          0.5
        ],
        "pixel_scale": 0.46,
        "cube_size": 4.2,
        "sprite_thickness": 0.3,
        "mainhand_side": "right",
        "offhand_side": "left"
      },
      "armor_attachable": {
        "scale": 1.0,
        "note": "Pre-scale baked into the armor meshes. 0.9375 (the player render scale) rests armor on the cats; Carter needs 1.0, at 0.9375 his armor drew inside his body."
      }
    },
    "validation": {
      "appearance": "user-confirmed-0.3.0",
      "ground_motion": "user-confirmed-0.3.0",
      "hand_and_grip": "0.3.1 client reports duplicate native tool and 90-degree mouth error; 0.3.2 engine suppression and baked geometry await retest",
      "armor_binding": "User confirmed 0.3.0 fit pipeline; individual material coverage unspecified",
      "shield": "0.3.1 side/front positioning user-confirmed; geometry and pose retained; direct-render routing requires regression test"
    },
    "owner": "ElleeDog",
    "pet_kind": "dog",
    "species": "Cavalier King Charles Spaniel",
    "wire_id": 1,
    "menu_icon": "textures/ui/pets/carter"
  },
  {
    "schema_version": 1,
    "id": "mochi",
    "display_name": "Mochi",
    "description": "A feisty street cat that will cuddle and purr and then bite.",
    "order": 20,
    "rig": "feline_v1",
    "model": "assets/pets/mochi/model.geo.json",
    "texture": "assets/pets/mochi/coat.png",
    "first_person": {
      "model": "assets/pets/mochi/paws.geo.json",
      "texture": "assets/pets/mochi/paws.png",
      "default_hand_height": 2
    },
    "equipment": {
      "mainhand": {
        "mode": "mouth",
        "position": [
          0,
          10.1,
          -10.4
        ],
        "rotation": [
          0,
          0,
          90
        ]
      },
      "offhand": {
        "mode": "side",
        "position": [
          3.1,
          7,
          -3.5
        ]
      },
      "armor_fit": "assets/pets/mochi/armor_fit.json",
      "helmet_profile": "upright_ear_openings",
      "mouth_sprite": {
        "position": [
          0,
          9.65,
          -10.42
        ],
        "pixel_scale": 0.55,
        "rotation": [
          0,
          0,
          0
        ],
        "thickness": 0.65,
        "bake_pixel_rotation_z": -45,
        "orientation_note": "Bake the horizontal handle in texel centers. Do not rely on a runtime bind-pose Z rotation; 0.3.1 rendered 90 degrees wrong on the client."
      },
      "shield": {
        "side_position": [
          3.25,
          7.5,
          0.5
        ],
        "front_position": [
          0,
          7.55,
          -11.9
        ],
        "side_rotation": [
          0,
          -90,
          0
        ],
        "front_rotation": [
          0,
          0,
          0
        ],
        "width": 5.7,
        "height": 8.1,
        "depth": 0.42,
        "transition_seconds": 0.16
      },
      "side_carry": {
        "sprite_position": [
          -3.95,
          7.5,
          0.5
        ],
        "cube_position": [
          -5.4,
          7.5,
          0.5
        ],
        "pixel_scale": 0.38,
        "cube_size": 3.6,
        "sprite_thickness": 0.3,
        "mainhand_side": "right",
        "offhand_side": "left"
      },
      "armor_attachable": {
        "scale": 0.9375,
        "note": "Pre-scale baked into the armor meshes. 0.9375 (the player render scale) rests armor on the cats; Carter needs 1.0, at 0.9375 his armor drew inside his body."
      }
    },
    "validation": {
      "appearance": "user-confirmed-0.3.0",
      "ground_motion": "user-confirmed-0.3.0",
      "hand_and_grip": "0.3.1 client reports duplicate native tool and 90-degree mouth error; 0.3.2 engine suppression and baked geometry await retest",
      "armor_binding": "User confirmed 0.3.0 fit pipeline; individual material coverage unspecified",
      "shield": "0.3.1 side/front positioning user-confirmed; geometry and pose retained; direct-render routing requires regression test"
    },
    "owner": "warspoon17",
    "pet_kind": "cat",
    "species": "Tuxedo cat",
    "wire_id": 2,
    "menu_icon": "textures/ui/pets/mochi"
  },
  {
    "schema_version": 1,
    "id": "casper",
    "display_name": "Casper",
    "description": "Casper is an indoor cat, super cuddly and is always trying to sneak outside.",
    "order": 30,
    "rig": "feline_v1",
    "model": "assets/pets/mochi/model.geo.json",
    "texture": "assets/pets/casper/coat.png",
    "first_person": {
      "model": "assets/pets/mochi/paws.geo.json",
      "texture": "assets/pets/casper/paws.png",
      "default_hand_height": 2
    },
    "equipment": {
      "mainhand": {
        "mode": "mouth",
        "position": [
          0,
          10.1,
          -10.4
        ],
        "rotation": [
          0,
          0,
          90
        ]
      },
      "offhand": {
        "mode": "side",
        "position": [
          3.1,
          7,
          -3.5
        ]
      },
      "armor_fit": "assets/pets/mochi/armor_fit.json",
      "helmet_profile": "upright_ear_openings",
      "mouth_sprite": {
        "position": [
          0,
          9.65,
          -10.42
        ],
        "pixel_scale": 0.55,
        "rotation": [
          0,
          0,
          0
        ],
        "thickness": 0.65,
        "bake_pixel_rotation_z": -45,
        "orientation_note": "Bake the horizontal handle in texel centers. Do not rely on a runtime bind-pose Z rotation; 0.3.1 rendered 90 degrees wrong on the client."
      },
      "shield": {
        "side_position": [
          3.25,
          7.5,
          0.5
        ],
        "front_position": [
          0,
          7.55,
          -11.9
        ],
        "side_rotation": [
          0,
          -90,
          0
        ],
        "front_rotation": [
          0,
          0,
          0
        ],
        "width": 5.7,
        "height": 8.1,
        "depth": 0.42,
        "transition_seconds": 0.16
      },
      "side_carry": {
        "sprite_position": [
          -3.95,
          7.5,
          0.5
        ],
        "cube_position": [
          -5.4,
          7.5,
          0.5
        ],
        "pixel_scale": 0.38,
        "cube_size": 3.6,
        "sprite_thickness": 0.3,
        "mainhand_side": "right",
        "offhand_side": "left"
      },
      "armor_attachable": {
        "scale": 0.9375,
        "note": "Pre-scale baked into the armor meshes. 0.9375 (the player render scale) rests armor on the cats; Carter needs 1.0, at 0.9375 his armor drew inside his body."
      }
    },
    "validation": {
      "appearance": "new-Casper-variant-not-client-tested",
      "ground_motion": "new-Casper-variant-not-client-tested",
      "hand_and_grip": "new-Casper-variant-not-client-tested",
      "armor_binding": "new-Casper-variant-not-client-tested",
      "shield": "new-Casper-variant-not-client-tested"
    },
    "variant_of": "mochi",
    "owner": "Casper201312",
    "pet_kind": "cat",
    "species": "White cat",
    "coat_features": {
      "fur": "all white",
      "eyes": "blue",
      "nose": "pink"
    },
    "wire_id": 3,
    "menu_icon": "textures/ui/pets/casper"
  }
].map(p => Object.freeze(p)));
export const SIDE_CARRY_INDEX = Object.freeze({"minecraft:oak_boat": 1, "minecraft:spruce_boat": 2, "minecraft:birch_boat": 3, "minecraft:jungle_boat": 4, "minecraft:acacia_boat": 5, "minecraft:dark_oak_boat": 6, "minecraft:mangrove_boat": 7, "minecraft:cherry_boat": 8, "minecraft:pale_oak_boat": 9, "minecraft:bamboo_raft": 10, "minecraft:boat": 11, "minecraft:bucket": 12, "minecraft:water_bucket": 13, "minecraft:lava_bucket": 14, "minecraft:milk_bucket": 15, "minecraft:cod_bucket": 16, "minecraft:salmon_bucket": 17, "minecraft:tropical_fish_bucket": 18, "minecraft:pufferfish_bucket": 19, "minecraft:powder_snow_bucket": 20, "minecraft:axolotl_bucket": 21, "minecraft:tadpole_bucket": 22, "minecraft:apple": 23, "minecraft:bread": 24, "minecraft:carrot": 25, "minecraft:potato": 26, "minecraft:beetroot": 27, "minecraft:cookie": 28, "minecraft:chorus_fruit": 29, "minecraft:dried_kelp": 30, "minecraft:mushroom_stew": 31, "minecraft:beetroot_soup": 32, "minecraft:golden_apple": 33, "minecraft:golden_carrot": 34, "minecraft:baked_potato": 35, "minecraft:poisonous_potato": 36, "minecraft:beef": 37, "minecraft:cooked_beef": 38, "minecraft:chicken": 39, "minecraft:cooked_chicken": 40, "minecraft:mutton": 41, "minecraft:cooked_mutton": 42, "minecraft:porkchop": 43, "minecraft:cooked_porkchop": 44, "minecraft:cod": 45, "minecraft:salmon": 46, "minecraft:tropical_fish": 47, "minecraft:pufferfish": 48, "minecraft:cooked_cod": 49, "minecraft:cooked_salmon": 50, "minecraft:melon_slice": 51, "minecraft:glistering_melon_slice": 52, "minecraft:arrow": 53, "minecraft:bone": 54, "minecraft:bowl": 55, "minecraft:brick": 56, "minecraft:coal": 57, "minecraft:charcoal": 58, "minecraft:diamond": 59, "minecraft:emerald": 60, "minecraft:egg": 61, "minecraft:ender_pearl": 62, "minecraft:feather": 63, "minecraft:flint": 64, "minecraft:ghast_tear": 65, "minecraft:glowstone_dust": 66, "minecraft:gold_ingot": 67, "minecraft:gold_nugget": 68, "minecraft:iron_ingot": 69, "minecraft:iron_nugget": 70, "minecraft:gunpowder": 71, "minecraft:leather": 72, "minecraft:magma_cream": 73, "minecraft:name_tag": 74, "minecraft:nether_star": 75, "minecraft:nether_wart": 76, "minecraft:painting": 77, "minecraft:paper": 78, "minecraft:phantom_membrane": 79, "minecraft:blaze_powder": 80, "minecraft:blaze_rod": 81, "minecraft:kelp": 82, "minecraft:clay_ball": 83, "minecraft:book": 84, "minecraft:writable_book": 85, "minecraft:written_book": 86, "minecraft:enchanted_book": 87, "minecraft:ender_eye": 88, "minecraft:fire_charge": 89, "minecraft:firework_rocket": 90, "minecraft:experience_bottle": 91, "minecraft:glass_bottle": 92, "minecraft:minecart": 93, "minecraft:chest_minecart": 94, "minecraft:hopper_minecart": 95, "minecraft:tnt_minecart": 96, "minecraft:heart_of_the_sea": 97, "minecraft:nautilus_shell": 98, "minecraft:netherbrick": 99, "minecraft:stone": 100, "minecraft:cobblestone": 101, "minecraft:mossy_cobblestone": 102, "minecraft:dirt": 103, "minecraft:sand": 104, "minecraft:gravel": 105, "minecraft:netherrack": 106, "minecraft:obsidian": 107, "minecraft:bedrock": 108, "minecraft:brick_block": 109, "minecraft:bricks": 110, "minecraft:nether_brick": 111, "minecraft:nether_bricks": 112, "minecraft:red_nether_brick": 113, "minecraft:red_nether_bricks": 114, "minecraft:stonebrick": 115, "minecraft:stone_bricks": 116, "minecraft:oak_planks": 117, "minecraft:spruce_planks": 118, "minecraft:birch_planks": 119, "minecraft:jungle_planks": 120, "minecraft:acacia_planks": 121, "minecraft:dark_oak_planks": 122, "pet:morpher_book": 123, "minecraft:saddle": 124, "minecraft:red_nether_brick_stairs": 125, "minecraft:nether_brick_stairs": 126, "minecraft:stone_stairs": 127, "minecraft:normal_stone_stairs": 128, "minecraft:stone_brick_stairs": 129, "minecraft:mossy_cobblestone_stairs": 130, "minecraft:brick_stairs": 131, "minecraft:sandstone_stairs": 132, "minecraft:red_sandstone_stairs": 133, "minecraft:quartz_stairs": 134, "minecraft:purpur_stairs": 135, "minecraft:end_brick_stairs": 136, "minecraft:oak_stairs": 137, "minecraft:spruce_stairs": 138, "minecraft:birch_stairs": 139, "minecraft:jungle_stairs": 140, "minecraft:acacia_stairs": 141, "minecraft:dark_oak_stairs": 142, "minecraft:crimson_stairs": 143, "minecraft:warped_stairs": 144, "minecraft:cobbled_deepslate_stairs": 145, "minecraft:polished_deepslate_stairs": 146, "minecraft:deepslate_brick_stairs": 147, "minecraft:deepslate_tile_stairs": 148, "minecraft:blackstone_stairs": 149, "minecraft:polished_blackstone_stairs": 150, "minecraft:polished_blackstone_brick_stairs": 151, "elleedog:raw_rbow_ore": 152, "elleedog:rbow_ingot": 153, "elleedog:rbow_nug": 154, "elleedog:rbow_helmet": 155, "elleedog:rbow_chestplate": 156, "elleedog:rbow_leggings": 157, "elleedog:rbow_boots": 158, "elleedog:rbow_block": 159, "elleedog:rbow_ore": 160, "elleedog:deepslate_rbow_ore": 161});
export const HANDHELD_INDEX = Object.freeze({"minecraft:wooden_sword": 1, "minecraft:wooden_pickaxe": 2, "minecraft:wooden_axe": 3, "minecraft:wooden_shovel": 4, "minecraft:wooden_hoe": 5, "minecraft:stone_sword": 6, "minecraft:stone_pickaxe": 7, "minecraft:stone_axe": 8, "minecraft:stone_shovel": 9, "minecraft:stone_hoe": 10, "minecraft:iron_sword": 11, "minecraft:iron_pickaxe": 12, "minecraft:iron_axe": 13, "minecraft:iron_shovel": 14, "minecraft:iron_hoe": 15, "minecraft:golden_sword": 16, "minecraft:golden_pickaxe": 17, "minecraft:golden_axe": 18, "minecraft:golden_shovel": 19, "minecraft:golden_hoe": 20, "minecraft:diamond_sword": 21, "minecraft:diamond_pickaxe": 22, "minecraft:diamond_axe": 23, "minecraft:diamond_shovel": 24, "minecraft:diamond_hoe": 25, "minecraft:netherite_sword": 26, "minecraft:netherite_pickaxe": 27, "minecraft:netherite_axe": 28, "minecraft:netherite_shovel": 29, "minecraft:netherite_hoe": 30, "minecraft:copper_sword": 31, "minecraft:copper_pickaxe": 32, "minecraft:copper_axe": 33, "minecraft:copper_shovel": 34, "minecraft:copper_hoe": 35, "elleedog:rbow_sword": 36, "elleedog:rbow_pickaxe": 37, "elleedog:rbow_axe": 38, "elleedog:rbow_shovel": 39, "elleedog:rbow_hoe": 40, "elleedog:rbow_spear": 41});
export const MODEL_BY_ID = Object.freeze(Object.fromEntries(PETS.map(p => [p.id,p])));
export const MODEL_BY_WIRE = Object.freeze(Object.fromEntries(PETS.map(p => [p.wire_id,p])));
export const SEAT_KINDS = Object.freeze(["none", "boat", "pig", "stairs", "other", "horse", "strider", "happy_ghast", "cushion"]);
