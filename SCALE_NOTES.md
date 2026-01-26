# Working Scale Ratios

## What Works (Low Poly City + Robot)
- **City scale:** 1x (game-ready maps use 1 unit = 1 meter)
- **Character scale:** 1x
- **Camera offset:** (0, 2, 5) - 2 units up, 5 units back
- **Camera look offset:** (0, 1, 0)
- **Move speed:** 5 (walk), 10 (run)
- **Ground level:** 0
- **Spawn height:** 20

## Key Insight
Game-ready/low-poly maps designed for games typically use standard units where 1 unit = 1 meter.
Character models designed for games are usually ~1.8 units tall (human height).
When both are at 1:1 scale, proportions work naturally.

The cyberpunk city model was NOT game-ready - it had weird internal scale.
