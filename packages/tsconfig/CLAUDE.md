# @matocard/tsconfig

Shared TypeScript configs: `base.json` (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`,
bundler resolution, Bun types), `library.json` for packages and `app.json` for DOM/JSX code.

`apps/app` and `apps/landing` do not extend these: they keep the `tsconfig.json` Next generates,
with the `next` plugin and their own `@/*` path alias.
