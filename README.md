# Globby

Talking to people should be easy, free, secure, private, and open. Globby is a free and open-source messaging app that is built on top of Cloudflare Workers environment.

Unlike other message apps, Globby not only allows you to stay anonymous, it actually forces you to do so. There is no authentication, no private information, no data collection.

All messages are end-to-end encrypted and saved only on the recipient's device. The app serves only as a relay between users.

If you don't feel confortable using our hosted version, worry not! You can always self-host it in your own Cloudflare account in just a few minutes.

## Tech stack

The frontend is built with vanilla HTML, CSS and TypeScript, with TailwindCSS for better styling and Vite as build tool.

The backend is 100% TypeScript, with Cloudflare's DO and KV as services.

Unit and integrations tests are written in TypeScript and Vitest.

## License

This project is licensed under the GNU AGPLv3 to ensure that all improvements to the project remain open and benefit the community.

Because this is a web-based project, the AGPL prevents modified versions from being run as closed-source services without sharing the source code.

Our goal is to encourage collaboration while protecting the project from proprietary forks.

See the [LICENSE](./LICENSE) file for more details.
