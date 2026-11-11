# Contributing

Use Node.js 22 or later. The runtime has no external dependencies.

Run `npm ci` to install the development formatter. `npm run format` formats source;
`npm run format:check` checks it without changing files.

1. Keep changes focused and add behavioral tests when changing queue, upload, or persistence logic.
2. Run `npm test` and `npm run check`.
3. Update the feature inventory only when a capability is implemented; record acceptance evidence before using `verified`.
4. Do not commit `.relay`, Google client JSON, tokens, signed URLs, screenshots containing private information, or real test account details.
5. Use fake transport responses and isolated temporary directories for automated tests. Real Google tests require a consenting account holder.

The project preserves its original CC0 license. See `LICENSE`.
