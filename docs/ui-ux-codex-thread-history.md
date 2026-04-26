# UI/UX Codex Thread History

## 2026-04-26 - Mobile WebView Swipe-To-Close Removal

- Surface: `mingle-app/src/components/LivePhoneDemo/LivePhoneDemo.tsx`, `mingle-app/src/components/LivePhoneDemo/LivePhoneDemoLegacy.tsx`
- Issue: The conversation root and right-side menu panel had custom left-to-right swipe-to-close handlers inside the mobile WebView, which overlapped with iOS edge-swipe back behavior and could make horizontal touches inside a conversation feel like accidental navigation.
- User impact: Mobile users could unintentionally leave a conversation or close the menu while performing horizontal touch interactions, especially on iOS where the OS already provides an edge back gesture.
- Resolution: Removed the app-level swipe-to-close pointer sessions, drag thresholds, drag state, and swipe-only touch-action overrides while keeping explicit back/close buttons, backdrop tap close behavior, browser/native history handling, and OS back gestures.

## 2026-04-20 - Blog Felo And Transync Turn Criteria Corrections

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: Felo's messenger-like sentence turns were understated as `Partial`, while Transync's sentence-turn and speaker-diarization cells were overstated as `Partial`.
- User impact: Readers could misread Felo's sentence-level transcript behavior and Transync's live transcript behavior against the table's stricter messenger-turn and diarization criteria.
- Resolution: Updated Felo `Messenger-like sentence turns` to `Yes`, and updated Transync `Messenger-like sentence turns` plus `Realtime speaker diarization` to `No`.

## 2026-04-20 - Blog Transync External Audio Correction

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: Transync was marked as `Partial` for `External app audio capture`, implying some external-app audio capture support.
- User impact: Readers could incorrectly interpret Transync as supporting external app audio capture in the same comparison category.
- Resolution: Updated the Transync `External app audio capture` cell to `No` and clarified that meeting integrations do not make it an external app audio capture layer.

## 2026-04-20 - Blog Felo Price Copy

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: The Felo Translator price cell mixed KRW and USD conversion details, making the table less clean for English readers.
- User impact: Readers saw an unnecessary currency conversion instead of a direct dollar-only price comparison.
- Resolution: Updated the Felo Translator price to a dollar-only public pricing summary, `About $2/hour; public web pricing lists 120 minutes at $3.90.`, and removed the KRW exchange reference from the source notes.

## 2026-04-20 - Blog Comparison Table Row Order

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: Felo Translator and Transync appeared immediately after Mingle, ahead of the broader consumer translator set.
- User impact: The table ordering made newer comparison additions feel over-prioritized instead of supplemental to the core translator set.
- Resolution: Kept Mingle first, moved Google Translate, Apple Translate, Microsoft Translator, Papago, and DeepL directly after it, and placed Felo Translator and Transync as the final two rows.

## 2026-04-20 - Blog Comparison Table AI Performance Column

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: The translator comparison table listed language counts and workflow features but did not summarize perceived AI performance as a scannable criterion.
- User impact: Readers had to infer model quality from adjacent feature descriptions instead of comparing a direct `Good` or `Standard` performance signal.
- Resolution: Added an `AI performance` column immediately after `Supported languages`, marked Mingle, Google Translate, Transync, and DeepL as `Good`, marked Felo Translator, Apple Translate, Microsoft Translator, and Papago as `Standard`, and widened the table to preserve cell spacing.

## 2026-04-20 - Blog Landing Page Reference Button

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: The comparison article ended at source references without a clear path back to the Mingle product landing page.
- User impact: Readers who reached the bottom of the article had to use navigation or manually change URLs to inspect the referenced product page.
- Resolution: Added a centered bottom reference button linking to `https://translator.minglelabs.xyz/landing/`, styled to match the article's restrained button language.

## 2026-04-20 - Blog Comparison Table Felo And Transync Rows

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: The live AI translator comparison table did not include Felo Translator or Transync, two relevant real-time voice translation products.
- User impact: Readers could not compare Mingle against adjacent live translation products with hourly or meeting-oriented pricing.
- Resolution: Added Felo Translator and Transync rows directly after Mingle, including their logos, platform coverage, pricing, language support, live caption behavior, detection behavior, and other existing comparison criteria.

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

## 2026-04-20 - Blog Hero App Screenshot Framing

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: The Mingle app screenshot in the article hero was too zoomed in, and the hero section felt too short for the article framing.
- User impact: The app screen was harder to recognize as a full Mingle interface, and the top of the article did not give enough visual weight to the comparison.
- Resolution: Reduced the hero screenshot background size, centered it more calmly, increased hero vertical spacing, and added a second hero paragraph summarizing that Mingle ranks best overall among mobile apps across the 10 comparison criteria.

## 2026-04-20 - Blog Comparison Table Width And Live Chat Criteria

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: The comparison table cells felt too narrow after multiple feature columns were added, and the table did not yet compare real-time speaker diarization or whether each product can function as its own messenger and voice chat app.
- User impact: Readers had to parse cramped cells and could miss two core differentiators for Mingle as a live social translation product.
- Resolution: Increased the table minimum width, widened table padding and the translator column, added `Realtime speaker diarization` and `Messenger + voice chat app` columns, and updated the hero summary from 10 to 12 criteria.

## 2026-04-20 - Blog Comparison Table Column Balance

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: The `Translator`, `Price`, and `Platforms` columns consumed more horizontal space than needed while feature columns still felt compressed.
- User impact: The most important feature comparison cells were harder to scan, especially after the table gained additional criteria.
- Resolution: Switched the table to fixed layout, narrowed the first three columns, increased the overall table width, and widened the remaining feature columns with larger default cell widths.

## 2026-04-20 - Blog Comparison Table Feature Order

- Surface: `mingle-app/public/legal/blogs/ai-translators-comparison.html`
- Issue: `Continuous note-style translation` and `Live captions + transcript` were placed later in the table, after detection and multilingual routing features.
- User impact: Two core live-output criteria were harder to compare immediately after basic language support.
- Resolution: Moved both columns to immediately follow `Supported languages` across the header and all translator rows, without changing the feature values.
