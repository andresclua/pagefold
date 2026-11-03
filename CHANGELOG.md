# Changelog

## 0.1.0 (2026-11-03)


### Features

* 🚀 Add a Demos section with seven live examples ([6de261e](https://github.com/andresclua/pagefold/commit/6de261e266113bcf5893ae3817b7452e0c896bdb))
* 🚀 Add a plugin template to copy with degit ([db1e1c1](https://github.com/andresclua/pagefold/commit/db1e1c1d42f875557438ca93d8cbd826b23140c3))
* 🚀 Add a11y and scroll plugins ([f0b3961](https://github.com/andresclua/pagefold/commit/f0b396199ea95cbbec12b12b903cabec3a1e8be7))
* 🚀 Add analytics plugin and the fade and slide themes ([de7dbd5](https://github.com/andresclua/pagefold/commit/de7dbd5a577143e0726cf77a95c73fb2a35cea6b))
* 🚀 Add body-class, debug, route-name, progress, forms and fragment plugins ([25d0a4d](https://github.com/andresclua/pagefold/commit/25d0a4d062f18326e64ac0b0d1cca4364da567f5))
* 🚀 Add browser tests with Playwright ([b1aca90](https://github.com/andresclua/pagefold/commit/b1aca90d1d4d3ded6979e68fe752fe6de8a5edd6))
* 🚀 Add head, scripts, js and parallel plugins ([b856ab9](https://github.com/andresclua/pagefold/commit/b856ab934ad734628089001021ea7684b5e9ca39))
* 🚀 Add hooks, visit, plugin base, cache and location ([200b61f](https://github.com/andresclua/pagefold/commit/200b61f679032f40e11e99ae1c5f67d2e7439aa9))
* 🚀 Add inline forms, empty params and fragment if and scroll options ([52f5a27](https://github.com/andresclua/pagefold/commit/52f5a274ad487386bec6f1868f05fe461a013c19))
* 🚀 Add live examples with their source to the docs ([468453a](https://github.com/andresclua/pagefold/commit/468453a6c84e4da614b391f777a691ac37ef1ba5))
* 🚀 Add navigation pipeline and the Pagefold class ([a70d40f](https://github.com/andresclua/pagefold/commit/a70d40f04c4812c8667acdf4b66a9ba3883a0ade))
* 🚀 Add pagefold.mount to set components up and clean them up with the page ([4e6ec93](https://github.com/andresclua/pagefold/commit/4e6ec9339dfe106643bc685516a6e7ee4138d36e))
* 🚀 Add preload plugin ([ec16ee7](https://github.com/andresclua/pagefold/commit/ec16ee7c70231960d95297fda2830ac8b0321794))
* 🚀 Add route-name paths and unknown routes, body attributes, debug global and cache.all ([487cfc5](https://github.com/andresclua/pagefold/commit/487cfc5135fbe638fd7bab63e339e3ef065302c4))
* 🚀 Add scroll containers, restoring, target marking and scroll hooks ([f3dc19e](https://github.com/andresclua/pagefold/commit/f3dc19e4e3acc07afb3ee302b8b1272ae400137d))
* 🚀 Add the queue option to choose what happens when a visit starts while another is running ([666f538](https://github.com/andresclua/pagefold/commit/666f538856d4f2dc67e0ef391e58bbf8a7a2ba38))
* 🚀 Add translations, per-visit control, hooks and autofocus to the a11y plugin ([629d74f](https://github.com/andresclua/pagefold/commit/629d74f735967d7f7c7b7df1a3dffd51e003528e))
* 🚀 Add UMD builds for script tags and CommonJS types ([9de626a](https://github.com/andresclua/pagefold/commit/9de626aded6f5f36d2c5059a26747876e670c0c6))
* 🚀 Animate the diagrams of the docs with GSAP and ScrollTrigger ([f6c0454](https://github.com/andresclua/pagefold/commit/f6c045410edea1c17bd73e2aa8edb661772d0b3f))
* 🚀 Announce assertively and focus the body by default in the a11y plugin, with politeness and contentSelector to change both ([afdc330](https://github.com/andresclua/pagefold/commit/afdc3301f7941d2d1cc1cb0998ea46f41166cca8))
* 🚀 Expose the view transition and its types to hooks and CSS ([cc32ce3](https://github.com/andresclua/pagefold/commit/cc32ce3acc9aad25884d5cf4d4d005e9d718c2fe))
* 🚀 Keep persisted head tags first, wait for the DOM on enable and skip before loading ([8f22acb](https://github.com/andresclua/pagefold/commit/8f22acb9dfeadb05f0c331224e1d08fa8d5cc4b9))
* 🚀 Make the overlap demo a portfolio and scrub the diagrams of the docs ([8717384](https://github.com/andresclua/pagefold/commit/8717384c07b126d4b725a7240c765d3c6bf3e26a))


### Bug fixes

* 🐛 Add sharp so showcase images can be built ([f4ae378](https://github.com/andresclua/pagefold/commit/f4ae3782a35b4c7f3c139bec18b185655e51274a))
* 🐛 Cancel the request when the signal given to navigate() aborts ([1094919](https://github.com/andresclua/pagefold/commit/1094919694c751d2902760c6f0ce46c925646a1d))
* 🐛 Fade the new content in instead of showing it at once ([43d2380](https://github.com/andresclua/pagefold/commit/43d238026c9dd4bacda3b54b5fa8048f06c48583))
* 🐛 Keep ignore() made before the visit starts ([8b58007](https://github.com/andresclua/pagefold/commit/8b58007664fbb732f75caab9835554d108365802))
* 🐛 Leave mailto, tel and javascript links to the browser ([9ec0030](https://github.com/andresclua/pagefold/commit/9ec0030752b46658117448d4132e939820e93c15))
* 🐛 Make the overlap demo show two pages and document the transition class ([8a3d00e](https://github.com/andresclua/pagefold/commit/8a3d00e247d6a32fa665646e4055f9e4b7bbaf07))
* 🐛 Make the types work with Node-style module resolution ([98060c4](https://github.com/andresclua/pagefold/commit/98060c48f2728642dfb7cd7d577e659d80ad512b))
* 🐛 Render tables in the docs and turn off code ligatures ([8bbfcaa](https://github.com/andresclua/pagefold/commit/8bbfcaaf662717fb3ffe00d5a376b0268d18e5f8))
* 🐛 Skip pattern exports in the size check ([f45be40](https://github.com/andresclua/pagefold/commit/f45be400fc90a297ea1c05405d82851ff785d4e8))
* 🐛 Stop the docs overflowing on phones and soften the links ([fbbe455](https://github.com/andresclua/pagefold/commit/fbbe455e208875054d39f3ba253455123237651e))


### Refactors

* 🔄 Rename parallel plugin to overlap ([8a18904](https://github.com/andresclua/pagefold/commit/8a1890482bc21119fb3270c62e4204b94e7cc5b4))


### Documentation

* 📚 Add a cleanup switch to the components demo and style every text link ([1c79017](https://github.com/andresclua/pagefold/commit/1c79017b920ab05a7b3eb2f2fca4727525a1df9c))
* 📚 Add diagrams and expand the short pages ([4bbd388](https://github.com/andresclua/pagefold/commit/4bbd38872c16ef69ac52912c3527b5ff2ada7169))
* 📚 Add diagrams to most pages ([919ea73](https://github.com/andresclua/pagefold/commit/919ea73cd95ad396080e568669eeca511dee92ea))
* 📚 Add server and recipes guides, common problems and softer link colors ([2af046c](https://github.com/andresclua/pagefold/commit/2af046c1022558a256c2fea5d7598e18e2bc48f9))
* 📚 Add the Gia guide and the Astro islands section ([b14b0da](https://github.com/andresclua/pagefold/commit/b14b0da9ad4aeb47ba9012d0b52c0a48af00aef1))
* 📚 Correct fragment fallback, progress delay and visit states ([0095705](https://github.com/andresclua/pagefold/commit/00957052916529f53a3458adabd3340c3e181eed))
* 📚 Explain cache limits and the cache methods, soften links ([52fcbbf](https://github.com/andresclua/pagefold/commit/52fcbbf8898f826552ddf8e3d7168eb7ee900d77))
* 📚 Explain custom hooks with a full example ([4a5e209](https://github.com/andresclua/pagefold/commit/4a5e20940845399a7f6fb4829c874eb28f9e4ef6))
* 📚 Explain exactly what a showcase entry needs ([6934253](https://github.com/andresclua/pagefold/commit/6934253f03cc47d92de3ff89e88f4efa8f503510))
* 📚 Explain how speculation rules meet the preload plugin ([ca9918f](https://github.com/andresclua/pagefold/commit/ca9918f268262756fdb1efe7e23395be0f378dbe))
* 📚 Give the links in the text a style of their own ([ba9a38e](https://github.com/andresclua/pagefold/commit/ba9a38e01e288cad892952869c1709bd7fb51e6c))
* 📚 Give the site a fold transition ([4da5d09](https://github.com/andresclua/pagefold/commit/4da5d09bd7024af022901368a96163f1893fc637))
* 📚 Link every module in the README to its docs and source ([78facb3](https://github.com/andresclua/pagefold/commit/78facb39c5327c9fa329200e201aae9cdca88f05))
* 📚 Make the live examples taller and animate the fragment panel ([5024ee3](https://github.com/andresclua/pagefold/commit/5024ee315a2dae6fbf8cd4f8c96ea6f04dd03889))
* 📚 Make the site wider and the page transition slower ([8856bdb](https://github.com/andresclua/pagefold/commit/8856bdbb3fa24234438079c372340a14028d7ca1))
* 📚 Rebuild the fragment demo as a master-detail that shows what is replaced ([6051476](https://github.com/andresclua/pagefold/commit/6051476da6f14b3081024ab5f875256447cd4ab7))
* 📚 Redesign the home page and give the site a logo ([2024b5c](https://github.com/andresclua/pagefold/commit/2024b5c34e8730b23ee3805a9f30891512141724))
* 📚 Refresh the module sizes and document cache.all ([b7fcc69](https://github.com/andresclua/pagefold/commit/b7fcc69089c5ce43ce42d62b655b9da645a6fa7c))
* 📚 Show the modules as cards ([d7b4f22](https://github.com/andresclua/pagefold/commit/d7b4f22d79c53543e4b9c9a7375e2cb93be85e84))
* 📚 Show the visit as a timeline ([791836a](https://github.com/andresclua/pagefold/commit/791836a7bceeb6ae1e7ff59140882ce826f1b198))
* 📚 Style the links of the live examples like the rest of the site ([9fb3865](https://github.com/andresclua/pagefold/commit/9fb38653f52dc3defa050f58064f2a53c1e8749b))
* 📚 Use Pagefold on the docs site and add analytics, themes, Astro and Alpine guides ([7986df7](https://github.com/andresclua/pagefold/commit/7986df72f791d8105e84b95ad2891225617888a5))
* 📚 Write the documentation ([dd4c89c](https://github.com/andresclua/pagefold/commit/dd4c89c62a09083ed648953c9a5d5b7f062f8363))
