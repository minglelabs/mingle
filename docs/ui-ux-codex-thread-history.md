# UI/UX Codex Thread History

## 2026-04-20 - Blog Translator Comparison Table Logo

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: The Mingle row in the translator comparison table used `/assets/logo-mingle.png`, which rendered as a text-like white tile and did not match the branded icon in the blog navigation.
- User impact: The first row of the comparison table looked visually inconsistent with the navbar brand and weaker than the other translator logo cells.
- Resolution: Updated the Mingle table row to use the same navbar asset, `/assets/mingle-icon.png`, while leaving the surrounding table layout and other translator rows unchanged.

## 2026-04-20 - Blog Translator Comparison Platform Coverage

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: The comparison table listed price and feature coverage but did not show platform availability, making it harder to compare whether each translator supports iOS, Android, Web, or desktop surfaces.
- User impact: Readers could not quickly distinguish mobile-only translators from products that also work on the web or desktop.
- Resolution: Added a `Platforms` column, updated the Mingle pricing copy to `Free consumer app.`, and expanded the source notes to include platform references.
