# Releases

OpenFlow versions live in `package.json` (`version`) and git tags `vMAJOR.MINOR.PATCH`.

```sh
# after bumping package.json version
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

The Docker workflow builds GHCR images on `DEVELOPMENT` and on `v*` tags.

`package.json` stays `"private": true` until a public npm package is intentionally published. The license is still Apache-2.0.
