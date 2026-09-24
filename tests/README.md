# Perspective projection regression

Rebuild the sibling `awayfl-player` production bundle, run the local Hono proxy,
and launch a disposable Chrome instance with remote debugging on port 9234.
Then, from the workspace root:

```sh
node playerglobal/tests/check-perspective-projection.mjs
```

`CDP_URL` overrides the debugging endpoint. The test opens and closes its own tab,
uses the local Pixi experiment harness without enabling its renderer, and never
logs in or connects to a game server. It checks AVM property access, projection
parameters, matrix conversion, assignment and shared Transform state. It also
loads `Awakenedbluecosmicaura.swf` and executes its compiled animation helper,
which previously threw `temp.axGetProperty is not a function` while reading
`root.transform.perspectiveProjection.focalLength`.

This covers the scripting interface. Applying perspective projection parameters
to rendered 3D geometry remains unimplemented.
