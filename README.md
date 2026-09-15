# ElleeDog 67

Your Minecraft add-on. Six features. Each one is its own pack.
Turn a pack **on** in your world to get the feature. Turn it **off** to remove it.

Claude Code does the coding. You tell it what to build, then you test it in the game.

## The six packs

| | Pack | What it does | Turns on with it |
|---|---|---|---|
| 🐾 | **ElleeDog 67 Pets** | Become Carter, Mochi or Casper. Use the Pet Morpher book. | ElleeDog 67 Pets Resources |
| 🌈 | **ElleeDog 67 Rbow Ore** | Rainbow ore underground. Smelt it. Make tools, armor and a spear. | ElleeDog 67 Rbow Ore Resources |
| 👁️ | **ElleeDog 67 Ender Mod** | Endermen cannot steal blocks from your builds. | nothing else |
| 📕 | **ElleeDog 67 Redstone Guide** | Craft a book that teaches redstone. | ElleeDog 67 Redstone Guide Resources |
| 🪑 | **ElleeDog 67 Stair Sitting** | Sit on any stair. | ElleeDog 67 Stair Sitting Resources |
| 💥 | **ElleeDog 67 Creeper Mod** | Creeper blasts hurt players only. Blocks and animals are safe. | nothing else |

A "Resources" pack holds the pictures and models. It turns on by itself. You never pick it.

## Put it in a world

Do this on the iPad. Use a **copy** of your world, not the real one.

1. **Back up first.** Settings → Game → **Export** the world.
2. Get the file **ElleeDog67_x.x.x.mcaddon** from the newest GitHub Release.
3. **Tap the file.** Minecraft opens and says **Import Complete**.
4. Open the world's settings. Tap **Behavior Packs**. Turn on all six ElleeDog 67 packs.
   **Any order is fine.** Their order never matters.
5. Tap **Resource Packs**. Four ElleeDog 67 packs turned on by themselves. **One rule:**
   **Pets Resources must be above Rbow Ore Resources.** Drag it up if it is not.

   A good list, top to bottom:
   1. 🐾 ElleeDog 67 Pets Resources
   2. 🪑 ElleeDog 67 Stair Sitting Resources
   3. 📕 ElleeDog 67 Redstone Guide Resources
   4. 🌈 ElleeDog 67 Rbow Ore Resources

   Why: Pets and Rbow Ore both draw the Rbow armor. The higher pack wins. Pets must win, or a pet
   wears armor wrong.
6. Turn **off** any other pack that changes the player or Endermen. Two packs cannot both do that.
7. **Play** the world. Leave and come back once if a pack seems missing.

You do not need cheats. Any packs can be on at the same time. You can skip any you do not want.

## Commands

Type these in chat. Start with `/`.

### 🐾 Pets

| Type this | What happens |
|---|---|
| `/pet:book` | You get the **Pet Morpher** book. Hold it and use it to pick a pet. |
| `/pet:form carter` | Become Carter. Also `mochi`, `casper`, or `player` to be you again. |
| `/pet:menu` | Open the pet menu without the book. |
| `/pet:armor fitted` | Armor fits your pet. `native` shows normal armor. `auto` goes back to normal. |
| `/pet:gear fitted` | Tools go in your pet's mouth. `native` holds them the normal way. |
| `/pet:view paws` | See paws in first person. `native` shows hands. |

Your pet comes back when you rejoin. No command needed.

### 🪑 Stair Sitting

| Type this | What happens |
|---|---|
| `/sit:down` | Sit on the stair you are looking at. |
| `/sit:stand` | Stand up. |
| `/sit:help` | Shows all the sitting controls. |

You can also sit with **empty hands**: look at a stair and press **Sit**.
Or crouch, then stop crouching, while looking at the stair.

### 👁️ Ender Mod

You must be an **operator** for these.

| Type this | What happens |
|---|---|
| `/elleedog:ender_protect pos1` | Marks corner 1. Stand at one corner of your build. |
| `/elleedog:ender_protect pos2` | Marks corner 2. Stand at the far corner. |
| `/elleedog:ender_protect name "My House"` | Saves the area. Endermen cannot take blocks inside it. |
| `/elleedog:ender_protect list` | Shows your saved areas. |
| `/elleedog:ender_protect remove "My House"` | Deletes an area. |

Blocks you place are protected too, even outside a named area.

### 🌈 Rbow Ore, 📕 Redstone Guide, 💥 Creeper Mod

No commands. They just work.

- **Rbow Ore**: dig down in **new** chunks. Smelt the ore. Craft with the ingots.
- **Redstone Guide**: craft it with **1 redstone + 1 leather**. Use it to read.
- **Creeper Mod**: creepers still go bang, but only players get hurt.

## Change the add-on

Claude Code writes the code for you. Here is how to work with it.

1. Go to **claude.ai/code**. Open the repo **spoon16/ellee67-mcaddons**.
2. Start a new session. It sets itself up. Wait for it to say it is ready.
3. **Say what you want.** Be specific. Good examples:
   - "Add a `/sit:wave` command that makes the player wave."
   - "Make Mochi's paws bigger."
   - "The creeper blast is too strong. Make it half as strong."
4. Ask it to **check its work**. Say: **"Run the full check and the engine tests."**
   That runs the tests and starts a real Minecraft server to try the packs.
5. When it says everything passed, say: **"Merge to main."**
6. Ask for a release: **"Make release 0.3.0."** It bumps the version and makes the file.
   A new file only replaces the old one in your world if the number is **higher**.
7. Download the new **.mcaddon** from GitHub Releases. Import it. Play.

If something looks wrong in the game:

- Turn on the **Content Log** (Settings → Creator).
- Take a screenshot of the red lines.
- Show Claude the screenshot and say what you did.

## If you get stuck

- **A pack is missing in the game**: leave the world and open it again.
- **Two packs fight**: turn off other player or Enderman packs.
- **A pet command does nothing**: the Pets pack is off. Turn it on.
- **Nothing helps**: ask Claude and paste the Content Log.

## More reading

- What each pack does in detail: [docs/FEATURES.md](docs/FEATURES.md)
- Install, update and move old worlds: [docs/RELEASING.md](docs/RELEASING.md)
- For coders and for Claude: [docs/DEVELOPING.md](docs/DEVELOPING.md) and [CLAUDE.md](CLAUDE.md)

## License

Original code is MIT licensed (see [LICENSE](LICENSE)). Adapted Mojang sample definitions and the
supplied artwork keep their own terms; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
Not an official Minecraft product.
