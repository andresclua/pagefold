# pagefold-plugin-example

A starting point for a [Pagefold](https://github.com/andresclua/pagefold) plugin: TypeScript, one test and a build that publishes types.

```sh
npx degit andresclua/pagefold/templates/plugin my-plugin
cd my-plugin
npm install
npm test
```

Then:

1. Rename it in `package.json` and in `src/index.ts`.
2. Write your idea in `mount()`, and undo whatever it adds in `unmount()`.
3. `npm run build`, then `npm publish`.

Name the package `pagefold-plugin-<name>` and add the `pagefold-plugin` keyword so people can find it.

See [Writing a plugin](https://pagefold.js.org/docs/plugin-api) for the hooks, the options pattern and the plugin's life.
