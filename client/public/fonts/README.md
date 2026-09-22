# Ploni

Ploni is a licensed Hebrew face from Fontef. Drop the licensed files here as:

    ploni-light.woff2      (weight 300)
    ploni-regular.woff2    (weight 400)

and `src/index.css` picks them up automatically.

Until then the stack falls through to **Assistant** (Google Fonts, already
loaded in `index.html`), which is metrically close enough that the swap does
not reflow the page.

`vite build` prints a warning that these two paths did not resolve. That is
expected and harmless — the `@font-face` simply has no file to load and the
fallback applies. Shipping a `@font-face` that 404s on every request is worse
than shipping the fallback, which is why the rule stays in.
