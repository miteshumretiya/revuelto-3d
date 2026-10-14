# Revuelto 3D

An interactive 3D showcase of the Lamborghini Revuelto, built with [three.js](https://threejs.org).

**Unofficial fan project.** Not affiliated with or endorsed by Automobili Lamborghini S.p.A.

## What's in it

| View | What you can do |
| --- | --- |
| **Tour** | Scroll through eight chapters. The camera flies around the car, the doors, engine cover and lights open as you go. |
| **Configure** | Paint (9 colours, gloss or matte), wheels, brake calipers, interior. Open doors, bonnet and engine cover, switch the lights on. *Copy spec link* shares the exact build. |
| **Explore** | Seven hotspots with info cards, a camera that flies to each one, *Sit inside* for a driver's-seat view, and an *X-ray* mode. |
| **Drive** | Arcade driving on an open lot with a slalom and skid pad. WASD / arrow keys, Space to brake, C camera, L lights, R reset. On-screen pedals on phones. |

## Project layout

```
index.html          page structure
css/style.css       styles
js/main.js          scene, materials, camera, all four views
models/revuelto.glb optimised model (5.3 MB, meshopt + WebP)
vendor/three/       three.js r169 (MIT) and the addons used
fonts/              Archivo variable font (OFL)
vercel.json         caching headers
```

No build step. It's a static site: open it with any static server, e.g. `npx serve .`

## Model optimisation

The source `.glb` was 46 MB. It was cut to 5.3 MB without removing any geometry:
unused UV and colour channels stripped, meshes merged per moving part
(`DOOR_L`, `DOOR_R`, `HOOD`, `ENGINE_COVER`, `BODY`, `INTERIOR`, `ENGINE`, wheels),
textures converted to WebP (max 1024 px), then quantised and compressed with meshopt.

## Deploying

The repo is connected to Vercel, so every push to `main` redeploys the site.
