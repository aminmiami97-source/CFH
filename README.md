# DEAD SIGNAL — Zombie Survival

A browser-based 3D first-person wave-survival prototype built with Three.js and PeerJS.

## Run locally

Serve this directory with a static server (HTTPS is recommended for pointer lock):

```bash
python -m http.server 8000
```

Open `http://localhost:8000`.

## Controls

- `WASD`: move; mouse: look.
- Left mouse button: fire; right mouse button: aim through the equipped optic.
- `R`: reload; `Shift`: sprint; `Space`: jump; `Escape`: pause / release pointer.
- `1`, `2`, `3`: switch weapon.
- Touch devices: movement stick, look area, fire, ADS and reload controls.

## Current prototype

- Procedural Three.js quarantine facility with humanoid infected and a larger boss model.
- First-person weapon handling, simulated hitscan shooting, reloads, aim-down-sights, tracers and hit feedback.
- Three original fictional weapons: Ranger AR (reflex 1.5x), Vulture DMR (4x optic), and Breach SMG (holographic 2x).
- Rotating 3D weapon previews in the armory.
- Endless enemy waves. A boss spawns on waves 5, 10, 15, and every fifth wave thereafter.
- Solo play and peer-to-peer rooms for up to four operators.
- In-page zombie-themed field log / changelog.

## Co-op

The room host runs the wave and infected simulation. Guests connect to the host using PeerJS data connections; game state is synchronized by the host. PeerJS's public signaling service exchanges connection details.

- All players need an internet connection.
- The host must keep the game tab open.
- Some firewalls or restrictive networks can prevent peer connections.
- This is a prototype, not a dedicated authoritative server or a cheat-resistant competitive service.

## GitHub Pages

After merging this branch into `main`, open **Settings → Pages** and select **GitHub Actions** as the source. The workflow in `.github/workflows/pages.yml` deploys the static site on pushes to `main`.

Three.js, PeerJS and the fonts are loaded from external CDNs, so browsers need internet access to load the game.

## Version

`0.1.0` — first FPS prototype. Weapons and infected are original procedural 3D game models. Combat feedback is non-graphic.
