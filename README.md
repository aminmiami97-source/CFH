# DEAD SIGNAL — Zombie Survival

A browser-based, 3D first-person wave-survival prototype. Built with Three.js and PeerJS; no build step is required.

## Play locally

Open `index.html` through a static web host, or run a local static server:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

A secure context (HTTPS or localhost) is recommended for browser pointer-lock and input support.

## Controls

- `WASD`: move; mouse: look; left click: fire; right click: aim through optic.
- `R`: reload; `Shift`: sprint; `Space`: jump; `Escape`: release pointer / pause.
- `1`, `2`, `3`: switch prototype weapons.
- Touch devices: on-screen movement stick, look area, fire, aim and reload controls.

## Prototype features

- Procedural Three.js arena, humanoid infected models and detailed 3D weapon assemblies.
- First-person camera, shooting, reloading, sprinting, aiming and weapon-specific optic overlays.
- Three weapon profiles with distinct optic magnification and rotating 3D armory previews.
- Increasing enemy waves; a boss appears every fifth wave.
- Solo mode and peer-to-peer co-op rooms for up to four players.
- In-page field log / changelog.

## Co-op networking

The room host runs the wave and enemy simulation. Guests connect directly to the host using PeerJS data connections. PeerJS's public signaling service is used to exchange connection details; game traffic is peer-to-peer after connection.

- Everyone needs an internet connection for co-op.
- The host must keep the game tab open.
- A restrictive network, browser extension, or firewall may prevent peer connections.
- This prototype is not a dedicated, cheat-resistant authoritative server. Do not treat it as a secure competitive multiplayer service.

## GitHub Pages

After merging this branch into `main`, open **Settings → Pages** and select **GitHub Actions** as the source. The included workflow deploys the static site on pushes to `main`.

Three.js, PeerJS and the Google Fonts used by the interface are loaded from external CDNs. An internet connection is required to load those libraries.

## Project status

`0.1.0` — initial prototype. The environment, characters and weapons are generated from 3D primitives and materials in the browser; this release does not include externally sourced photogrammetry or licensed character assets.
