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

# Legacy frame labels

With the same build, proxy and disposable browser setup, run:

```sh
node playerglobal/tests/check-legacy-frame-label.mjs
```

Checks that the loaded AQW timeline retains its own SWF version (9), rather
than inheriting the loader's version (15). For SWF 9 and 10, both navigation
methods must return to frame 1 on an unknown label and execute its stop script.
Known labels and numeric frame strings are also checked. No login is required.
