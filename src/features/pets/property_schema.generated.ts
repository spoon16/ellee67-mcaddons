// GENERATED diagnostic contract, not property registration.
export const PROPERTY_SCHEMA_SHA256 = "558ac2949cacc7fec46c8fc66c6c374570b49f2c18bce12a91c45f9c5ab48975";
export const PROPERTY_SCHEMA = Object.freeze({
  "pet:debug": {
    "type": "bool",
    "default": false,
    "client_sync": true
  },
  "pet:view": {
    "type": "enum",
    "values": [
      "paws",
      "native"
    ],
    "default": "native",
    "client_sync": true
  },
  "pet:motion": {
    "type": "bool",
    "default": false,
    "client_sync": true
  },
  "pet:hand_height": {
    "type": "int",
    "range": [
      -8,
      12
    ],
    "default": 0,
    "client_sync": true
  },
  "pet:model_id": {
    "type": "int",
    "range": [
      0,
      4095
    ],
    "default": 0,
    "client_sync": true
  },
  "pet:armor_fit": {
    "type": "bool",
    "default": false,
    "client_sync": true
  },
  "pet:gear_fit": {
    "type": "bool",
    "default": false,
    "client_sync": true
  },
  "pet:tool_enchanted": {
    "type": "bool",
    "default": false,
    "client_sync": true
  },
  "pet:tool_enchanted_for": {
    "type": "int",
    "range": [
      0,
      4095
    ],
    "default": 0,
    "client_sync": true
  },
  "pet:carry_main_enchanted": {
    "type": "bool",
    "default": false,
    "client_sync": true
  },
  "pet:carry_main_enchanted_for": {
    "type": "int",
    "range": [
      0,
      4095
    ],
    "default": 0,
    "client_sync": true
  },
  "pet:main_shield_enchanted": {
    "type": "bool",
    "default": false,
    "client_sync": true
  },
  "pet:carry_off_enchanted": {
    "type": "bool",
    "default": false,
    "client_sync": true
  },
  "pet:carry_off_enchanted_for": {
    "type": "int",
    "range": [
      0,
      4095
    ],
    "default": 0,
    "client_sync": true
  },
  "pet:off_shield_enchanted": {
    "type": "bool",
    "default": false,
    "client_sync": true
  },
  "pet:seat_lift": {
    "type": "float",
    "range": [
      -64.0,
      64.0
    ],
    "default": 0.0,
    "client_sync": true
  },
  "pet:seat_kind": {
    "type": "int",
    "range": [
      0,
      9
    ],
    "default": 0,
    "client_sync": true
  },
  "pet:armor_lift": {
    "type": "float",
    "range": [
      -16.0,
      16.0
    ],
    "default": 0.0,
    "client_sync": true
  },
  "pet:armor_scale": {
    "type": "float",
    "range": [
      0.5,
      1.5
    ],
    "default": 1.0,
    "client_sync": true
  },
  "pet:ui_mode": {
    "type": "int",
    "range": [
      0,
      4
    ],
    "default": 0,
    "client_sync": true
  }
});
