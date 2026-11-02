# X: collapse blue-check posts

A [Tampermonkey](https://www.tampermonkey.net/) userscript that collapses (or dims) posts from blue-check accounts you don't follow on X/Twitter.

## Installation

1. Install Tampermonkey in your browser.
2. Open this link and click **Install**:
   **[x-badge-azul-gris.user.js](https://raw.githubusercontent.com/TU_USUARIO/x-badge-azul/main/x-badge-azul-gris.user.js)**

Updates are delivered automatically from this repo.

## What it does

- Posts from blue-check accounts **you don't follow** are replaced by a slim bar: `Post de ✔ @account [Mostrar]`.
- Click **Mostrar** to expand the post; it stays open while you browse.
- Accounts you follow are left alone, and so are posts reposted by someone you follow (or by you).
- Quote posts are handled separately: if an account without a badge quotes a blue-check account you don't follow, only the quote is collapsed.
- Gold (organizations) and gray (government) badges are untouched by default.

## Configuration

Edit the `CONFIG` block at the top of the script from the Tampermonkey editor:

| Option | Default | Description |
|---|---|---|
| `mode` | `'collapse'` | `'collapse'` = slim bar with a button · `'dim'` = grayed-out text |
| `blue` / `gold` / `gray` | `true` / `false` / `false` | Which badge types to affect |
| `collapseQuotes` | `true` | Also collapse quote posts |
| `spareFollowed` | `true` | Don't collapse accounts you follow |
| `spareFollowedReposts` | `true` | Don't collapse posts reposted by accounts you follow |
| `textColor`, `opacity`, `revealOnHover` | — | `dim` mode only |

> Note: if you edit `CONFIG`, a script update may overwrite your changes.

## How it knows who you follow

The script reads the API responses X already loads (it makes no requests of its own) and stores the list of accounts you follow in `localStorage`. On first use it starts empty and learns as you scroll, so some followed accounts may be collapsed at first. If it has no data for an account, it collapses it by default.

## Limitations

It relies on X's internal selectors (`data-testid`), the badge color and the field names in its API responses. If X changes any of these, the script may stop working. Please open an issue.

## License

MIT
