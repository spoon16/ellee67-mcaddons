# Sources checked for the property diagnostics

- Microsoft Learn, Entity.getProperty and Entity.setProperty:
  https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/entity?view=minecraft-bedrock-stable
  Undefined properties read as undefined. Writes take effect the following tick.
- Microsoft Learn, Introduction to Entity Properties:
  https://learn.microsoft.com/en-us/minecraft/creator/documents/introductiontoentityproperties?view=minecraft-bedrock-stable
  Properties are declared in entity definitions; limits and lifecycle changes documented.
- MDN, JSON.stringify:
  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify
  Object properties with undefined values are omitted by default.
- Locally inspected released 0.4.3 and 0.4.4 installable archives:
  player.json, appearance.js and core.js were identical between those releases;
  pet:model_id is declared in the BP; diagnostic fallback hid missing reads.

These sources explain possible mechanisms, not which packs are active on the user's device.
No Minecraft, iPad or Realm environment was executed during local validation.
