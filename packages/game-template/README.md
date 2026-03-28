# Game Template

Copy this template to create a new game:

```bash
cp -r packages/game-template games/your-game-name
```

Then update:
1. `package.json` — change name to `@game-portal/your-game-name`
2. `index.html` — update title
3. `src/main.ts` — implement your game
4. Add game metadata to `apps/portal/src/stores/games.ts`
