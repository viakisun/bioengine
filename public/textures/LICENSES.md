# Texture Asset Policy

Phase 1 ships texture slots plus a small set of repo-redistributable runtime
textures. Add only assets whose license allows redistribution in this
repository.

For every external texture, record:

- Source URL
- License name and license URL
- Download date
- Whether the file was modified or resized
- Runtime resolution used by the app
- Normal map convention (`OpenGL` or `DirectX`) and Babylon `invertNormalMapY`
- Roughness/metallic channel packing, if any

Runtime files should be 1K or 2K for repeated plant textures. Keep original 4K
sources outside runtime paths or in a clearly marked source archive only when
the license allows storing them.

Expected phase-1 slots:

- `leaf/leaf_young_albedo.png`
- `leaf/leaf_mature_albedo.png`
- `leaf/leaf_old_albedo.png`
- `leaf/leaf_back_albedo.png`
- `leaf/leaf_stressed_albedo.png`
- `leaf/leaf_normal.png`
- `leaf/leaf_back_normal.png`
- `leaf/leaf_roughness.png`
- `leaf/leaf_alpha.png` (slot only; alpha clipping is deferred)
- `fruit/tomato_micro_normal.png`
- `stem/stem_normal.png`

Included assets:

- `leaf/*`: CGBookcase Tomato Leaf 01 preview/thumbnail PBR maps, CC0.
  - Source: https://www.cgbookcase.com/textures/tomato-leaf-01
  - Runtime source files: `https://cgbookcase.b-cdn.net/textures/thumbnails/TomatoLeaf01_1K/...`
  - Download date: 2026-06-09
  - Runtime resolution: 512 x 1024 PNG
  - Normal convention: DirectX; Babylon uses `invertNormalMapY=true` after the external normal slot loads.
  - Roughness packing: single-channel roughness PNG sampled through the Babylon metallicTexture roughness workflow.
  - Phase 1 runtime usage: retained but disabled on the current cut leaflet surface mesh. These files are whole-leaf alpha atlas maps, so direct UV binding stamps the leaf silhouette and dark background onto each generated leaflet. Use them later with a dedicated alpha-card/atlas mesh path.
  - Modified: young/old/stressed albedo variants are deterministic color-adjusted derivatives of the front base color. Back/base/normal/roughness are unmodified runtime files.
- `fruit/tomato_micro_normal.png`: project-generated procedural normal map.
  - Source: generated locally for this repository.
  - Runtime resolution: 512 x 512 PNG
  - Normal convention: OpenGL.
  - Purpose: low-amplitude placeholder to activate the fruit micro-normal slot until a licensed tomato skin scan is selected.
- `stem/stem_normal.png`: project-generated procedural normal map.
  - Source: generated locally for this repository.
  - Runtime resolution: 512 x 512 PNG
  - Normal convention: OpenGL.
  - Purpose: vertical fiber placeholder to activate the stem normal slot until a licensed stem scan is selected.
