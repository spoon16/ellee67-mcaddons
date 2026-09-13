# Artwork acceptance — 1.1.5

No style redesign: all 19 retained runtime PNGs are identical to 1.1.4. The
three captured block thumbnails are removed; actual native block item rendering
is configured instead. The unused held-spear PNG and its custom mesh are removed.

The remaining 13 inventory sprites now all pass the connected-silhouette check
(boots have two pieces); the former deepslate-thumbnail XFAIL is not carried
forward or hidden. Both worn armor atlases are unchanged. No claim is made that
historical generated posters are exact representations of the worn textures.

The review atlas has 16 tiles: 13 actual sprites, plus software projections of
the three actual block textures. Block projections are not game screenshots.
A full rebuild re-exports locked PNGs; it does not repaint artwork.

In-client first/third-person spear, opaque block icons and worn rendering are
NOT RUN. See README.md for the acceptance sequence.
