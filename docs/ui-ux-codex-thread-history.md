# Mingle Codex Thread-by-Thread UI/UX Audit

## 2026-04-11 Ongoing Dev Validation Notes

- **XR problem slide quotes needed to stay above and below the two-line statement**
  Problem: Centering the quote marks on the left and right edges made the punctuation cleaner, but it broke the intended composition because the statement is visually structured as a two-line quoted block.
  Cause: The previous refinement optimized the quote glyphs themselves, but it changed the reading pattern away from the original top-and-bottom framing the user had set.
  Fix: Kept the improved quotation glyph styling, but moved the marks back into stacked top and bottom positions and tightened their spacing so they sit closer to the text block instead of drifting to the extremes.
  Status: Resolved in-thread.

- **XR problem slide needed real quotation glyphs instead of inline straight quotes**
  Problem: The problem slide's quote marks were rendered as straight ASCII quotes on their own lines, which made them read like two dots and sit awkwardly at the top and bottom edges of the title block.
  Cause: The quotation marks were part of the headline text flow instead of being styled as independent visual punctuation.
  Fix: Rebuilt the problem headline with dedicated open and close quote spans, switched those marks to a serif quotation style, and vertically centered them against the two-line headline block.
  Status: Resolved in-thread.

- **XR reason slide needed paired reference visuals to show why generic translators fail**
  Problem: The "reason" slide was text-only, so the point about UI and usage context differing by scenario was still abstract instead of immediately legible.
  Cause: The deck had strong target-customer examples later, but this earlier bridge slide lacked concrete evidence that existing translation products ship radically different experience shapes.
  Fix: Added a two-image comparison stack on the reason slide with matched heights, placing the chat-translation visual on the left as the front layer and the generic translator promo on the right behind it.
  Status: Resolved in-thread.

- **XR deck needed a clearer narrative bridge before the target-customer slides**
  Problem: The deck was moving from the generic solution statement straight into customer examples, which made the "why existing translators fail" logic feel under-explained.
  Cause: The narrative jump was too abrupt, so the audience could see the vertical examples before fully understanding that the core issue is context-specific product experience rather than raw translation accuracy.
  Fix: Inserted three framing slides between the solution overview and the target-customer sequence: a centered question slide, a left-aligned reason slide, and a centered conclusion slide that reframes the product as tailored translation UX for each scenario.
  Status: Resolved in-thread.

- **XR gaming collage needed another round of relative offset tuning**
  Problem: After the previous pass, the three reference images were still not sitting on the intended diagonals, so the user specified a second round of per-image movements from the current positions.
  Cause: The collage composition was being refined incrementally, and the remaining mismatch was about exact relative offsets rather than size or hierarchy.
  Fix: Moved `JOIN GUILD` 10vw upward, dropped `JotMe` 10vw downward, and nudged `Utell AI` an additional 3vw to the right while keeping the rest of the stack intact.
  Status: Resolved in-thread.

- **XR gaming collage needed per-image position tuning from explicit screen-relative offsets**
  Problem: The collage still needed finer control after several visual passes, because the intended movement for each image was now being specified in exact screen-relative deltas rather than broad compositional feedback.
  Cause: The overall stack was close, but the final polish depended on moving each reference by precise `vw` offsets from its current top-left placement.
  Fix: Shifted `JotMe` and `Utell AI` 5vw to the right, and moved `JOIN GUILD` 5vw to the left plus 10vw downward, preserving size and z-order while matching the requested placement model.
  Status: Resolved in-thread.

- **XR gaming collage needed the guild card to drop lower without drifting farther right**
  Problem: After spreading the collage, the guild image started protruding too far to the right while still not feeling low enough in the overall stack.
  Cause: Widening the collage by moving its container rightward solved overlap, but it also pulled the front-most guild card toward the edge instead of using the extra space to the left.
  Fix: Restored the collage's previous right boundary and lowered the guild card further within the wider container so the group expands leftward while the front image sits lower.
  Status: Resolved in-thread.

- **XR gaming collage needed to use spare horizontal space without squeezing the text block**
  Problem: The collage still felt too tightly stacked even after the hierarchy was improved, because the three images were overlapping more than necessary while visible space remained to the left of the media cluster.
  Cause: The slide was still reserving too much width for the collage as a dense stack and too little of the surrounding whitespace as usable composition space.
  Fix: Relaxed the special text-width constraint for that slide, widened the collage footprint itself, and moved the two rear images further left so the cluster spreads out without shrinking the text column.
  Status: Resolved in-thread.

- **XR gaming collage needed the guild visual to sit lower in the stack**
  Problem: After the guild image was promoted to the top layer and enlarged, it still sat a bit too high and crowded the upper part of the collage.
  Cause: The previous top offset preserved the original stack balance, but the larger guild card shifted too much weight into the top-right corner.
  Fix: Lowered the guild image noticeably while preserving its larger scale and highest z-layer so the collage feels more grounded.
  Status: Resolved in-thread.

- **XR gaming collage needed a clearer visual hierarchy between the three references**
  Problem: The first collage pass placed the three images together, but the tall Utell AI reference was too small to read, while the Discord guild image did not yet dominate the stack as the main ecosystem cue.
  Cause: The initial sizing treated all three references too evenly, which weakened the intended hierarchy between secondary tool examples and the primary Discord-community anchor.
  Fix: Scaled the Utell AI image up substantially, enlarged the guild image as well, and made the guild visual the highest z-layer so the collage reads with a stronger focal order.
  Status: Resolved in-thread.

- **XR second target-customer slide needed a denser visual cue than text alone**
  Problem: Once the deck introduced global gaming Discord communities as a distinct target segment, the slide still read too abstractly because it had only a headline and no concrete visual texture.
  Cause: The gaming-community concept spans creators, Discord growth, and AI voice tools, so a single plain label did not communicate the ecosystem quickly enough at presentation speed.
  Fix: Added a dedicated right-side overlapping collage built from three user-provided reference images, and narrowed the text column on that slide only so the media cluster reads clearly without colliding with the title.
  Status: Resolved in-thread.

- **XR deck needed tighter kicker rhythm and explicit target-customer sequencing**
  Problem: The kicker labels still felt slightly too loose, and the target-customer section needed two more dedicated slides so the audience progression could unfold one segment at a time.
  Cause: The recent Korean kicker labels became longer than the original badge-style metadata, and the deck had only one target-customer page despite the presentation now naming multiple distinct entry markets.
  Fix: Tightened the global kicker tracking one step further and inserted two new target-customer slides for global gaming Discord communities and business owners serving foreign travelers, pushing the remaining deck back in sequence.
  Status: Resolved in-thread.

- **XR kicker tracking was too wide once labels became longer and more sentence-like**
  Problem: As the deck started using longer Korean kicker labels, the existing tracking made them feel too stretched and visually brittle compared with the calmer title/body rhythm.
  Cause: The earlier wider letter spacing worked for short badge-like tags, but it did not scale as well once the kicker text became more descriptive.
  Fix: Reduced the global kicker letter spacing slightly so the labels still read as distinct metadata while feeling tighter and more deliberate.
  Status: Resolved in-thread.

- **XR target slide screenshot still sat too far right and slightly low for the deck rhythm**
  Problem: After switching to the exact user-selected Voiceroom screenshot, the image itself was correct, but its placement still felt too far toward the right edge and slightly lower than the intended presentation balance.
  Cause: The existing side-media offsets were inherited from the earlier placeholder treatment and were not retuned after the screenshot changed to a taller, more visually dominant phone image.
  Fix: Moved the HelloTalk screenshot further left and raised it higher on the page so the phone image sits closer to the deck's visual center without affecting the text block coordinates.
  Status: Resolved in-thread.

- **XR target slide needed the exact user-picked product screenshot instead of a generic preview**
  Problem: Even after simplifying the right side to one Voiceroom image, the slide was still using a generic official visual rather than the specific phone-framed screenshot the user wanted to present.
  Cause: The earlier asset came from a public HelloTalk reference source and matched the product category, but not the exact image treatment the user selected for the deck.
  Fix: Extracted the user-supplied screenshot from the current thread input, saved it as a local PNG asset, and updated the target-customer slide to render that exact image instead of the previous placeholder visual.
  Status: Resolved in-thread.

- **XR target slide felt busier than needed once both the logo and product preview were present**
  Problem: The HelloTalk target-customer slide started showing both a square app logo and a Voiceroom product image, which made the right side feel stacked and more decorative than presentational.
  Cause: The earlier iteration solved recognizability by adding more cues, but the user only needed a single clear Voiceroom reference rather than a brand-plus-product composition.
  Fix: Removed the HelloTalk logo from the slide and left only the official Voiceroom visual on the right, while also simplifying the media styling so it reads like one placed product reference instead of a media stack.
  Status: Resolved in-thread.

- **XR target slide needed a fuller product reference than an icon alone**
  Problem: The HelloTalk target-customer slide gained an app icon, but that still did not communicate what the Voiceroom product actually looks like in use.
  Cause: A single square icon identifies the brand quickly, but it does not convey the live-room experience the slide is specifically discussing.
  Fix: Added an official HelloTalk Voiceroom interface image from the HelloTalk Creator Portal and paired it with the app icon in a dedicated right-side media stack. The slide text width is constrained only on that page so the visuals do not collide with the copy.
  Status: Resolved in-thread.

- **XR target-customer slide needed a recognizable product cue without disturbing text alignment**
  Problem: The HelloTalk target-customer slide described the product in text only, which made the reference feel abstract at presentation speed.
  Cause: The slide had no visual brand anchor, and adding one inside normal flow risked shifting the text coordinates that were already being tuned carefully.
  Fix: Added the current HelloTalk app icon as a local asset and placed it as an absolutely positioned slide-side marker on that page only, so the reference reads instantly without moving the text block.
  Status: Resolved in-thread.

- **XR intro slide needed to return to the deck's left-aligned reading rhythm**
  Problem: Once the second slide reused the intro content, keeping it centered made it feel too much like a second cover instead of the first proper body slide in the sequence.
  Cause: The shared center-alignment variant had been applied to both the cover and the duplicated intro slide, even though they serve different presentation roles.
  Fix: Restored the second slide to the standard left-aligned layout and added a `소개` kicker so it reads as the opening body page rather than another title card.
  Status: Resolved in-thread.

- **XR presentation deck still sat too low even after position anchoring was fixed**
  Problem: After the deck switched to fixed top anchoring, the relative positions stopped drifting, but the whole content block still felt too low on the page. The kicker, title, and body all needed to come up together.
  Cause: The new anchor preserved consistency but kept a conservative top padding and copy offset that still placed the reading block lower than the intended presentation rhythm.
  Fix: Pulled the entire content system upward by reducing the shell's top padding and tightening the copy block's top offset on both desktop and mobile. This keeps the same internal spacing while moving the whole composition higher.
  Status: Resolved in-thread.

- **XR presentation deck needed slide-level alignment control once the cover and inner slides diverged**
  Problem: The deck started needing two different horizontal compositions at once: a centered cover-style treatment for select slides and the existing left-aligned reading layout for the main body slides.
  Cause: Alignment was effectively hardcoded into one shared copy block style, so changing the cover also changed every interior slide.
  Fix: Added an explicit center-alignment modifier for the slide copy block while keeping left alignment as the default. This also enabled slide 1 to become a centered date cover and slide 2 to reuse the original intro content with normal title sizing.
  Status: Resolved in-thread.

- **XR presentation deck let the kicker and title start position drift by slide height**
  Problem: Even after individual kicker spacing was improved, the visible top position of the kicker and the headline still drifted between slides because the whole text block was vertically centered based on its own height.
  Cause: The slide copy container was anchored through content-height-dependent centering, so slides with more or fewer lines shifted upward or downward as a unit.
  Fix: Re-anchored the deck content to a fixed top offset derived from the current page-2 composition. The kicker and headline now start from the same vertical coordinate across slides, while longer titles only grow downward from that shared origin.
  Status: Resolved in-thread.

- **XR presentation deck titles felt cramped once manual line breaks were introduced**
  Problem: As more slide titles started using manual line breaks inside the `h1`, the headline lines sat too tightly on top of each other and looked visually compressed.
  Cause: The deck used an aggressively tight headline line-height that worked for single-line titles but broke down when the presenter intentionally split titles across two lines.
  Fix: Increased the title line-height to a visibly looser setting while keeping it distinctly tighter than body copy. The cover title was adjusted too so multi-line hero headlines follow the same rhythm.
  Status: Resolved in-thread.

- **XR presentation deck always snapped back to slide 1 on refresh**
  Problem: While editing or presenting deeper in the deck, a browser refresh always reopened the file on slide 1. That made iteration clumsy and broke continuity during rehearsal or live deck review.
  Cause: The deck tracked the active slide only in in-memory carousel state, with no URL representation of the current page.
  Fix: Added URL-backed slide persistence using `#<page>` as the primary state and `?page=<n>` as a compatible fallback on load. The deck now rewrites the hash as navigation changes, restores the requested slide on refresh, and responds to manual hash changes without touching slide copy.
  Status: Resolved in-thread.

- **XR presentation deck still placed the kicker too close to the title**
  Problem: Even after title alignment was stabilized, the kicker still sat too close to the headline and felt attached to it instead of reading like a separate higher-level attribute.
  Cause: The reserved kicker slot kept the title stable, but the kicker itself still started too low within that slot.
  Fix: Raised the kicker within its reserved slot and slightly adjusted the copy block offset so the kicker sits visibly higher while the title baseline remains stable across slides.
  Status: Resolved in-thread.

- **XR presentation deck needed a stable title baseline whether a kicker exists or not**
  Problem: Once the optional kicker was introduced, slides with a kicker pushed the title lower than slides without one, and the whole text block also sat a bit too low on the page.
  Cause: The kicker still occupied normal layout space above the title, so title placement changed depending on whether that element existed.
  Fix: Turned the kicker into an absolute positioned overlay within a reserved top slot and nudged the overall copy block slightly upward. Titles now start from nearly the same vertical position whether a kicker is present or not.
  Status: Resolved in-thread.

- **XR cover title became too heavy after the hierarchy split**
  Problem: The larger first-slide title gained enough scale, but its heavier weight made the cover feel denser than intended.
  Cause: The hero title inherited an extra-bold weight in the hierarchy pass instead of only separating itself through size.
  Fix: Kept the enlarged cover title size but restored its weight to the lighter title setting so the first page feels bigger without becoming visually too thick.
  Status: Resolved in-thread.

- **XR presentation deck needed title hierarchy between the cover slide and the rest**
  Problem: Once the main deck content was filled in, the first slide no longer stood apart strongly enough from the interior slides, while the body slides still felt too headline-heavy for sustained reading.
  Cause: A single title size and weight scale was being applied uniformly across the entire deck.
  Fix: Introduced a dedicated hero treatment for slide 1 and reduced the default title size and weight for slides 2 onward, without changing the manually edited copy.
  Status: Resolved in-thread.

- **XR presentation deck needed stronger visual weight for the optional kicker label**
  Problem: After the optional slide label was added, it was still too quiet relative to the title. The semantic cue existed, but it did not read strongly enough as a slide attribute at presentation distance.
  Cause: The kicker used a small subdued text treatment with no structural emphasis beyond spacing.
  Fix: Increased the kicker size and weight and added a Mingle key-color underline so the label reads as an intentional metadata layer without touching the manually edited slide titles or body copy.
  Status: Resolved in-thread.

- **XR presentation deck needed an optional slide attribute label above selected titles**
  Problem: Some slides needed a small semantic marker above the main title, such as labeling slide 2 as `문제`, while most slides should remain untouched. Without that slot, the meaning either had to be buried in the title itself or dropped entirely.
  Cause: The deck grammar only had title and body, with no lightweight presentation layer for selective slide metadata.
  Fix: Added an optional top label style distinct from body text and applied it only to the requested slide. The structure now supports selective labels without forcing them across the whole deck.
  Status: Resolved in-thread.

- **XR presentation deck still felt stepwise when holding navigation keys**
  Problem: Even after the infinite-loop reset was fixed, holding an arrow key still advanced one slide at a time with noticeable pauses. The deck technically worked, but it did not feel like a fast, fluid carousel when the presenter wanted to move quickly through multiple pages.
  Cause: Navigation was still effectively tied to discrete key presses and a long default transition duration, so it inherited OS key-repeat delay and idle gaps between slide completions.
  Fix: Switched the deck to immediate hold-aware navigation. A held direction now persists across transition completions, repeats without waiting for native key-repeat delay, and uses a much shorter animation duration for continuous movement while single taps remain readable.
  Status: Resolved in-thread.

- **XR presentation deck background still read as scattered color spots instead of one calm field**
  Problem: The lightened deck removed the dark card treatment, but the remaining warm color accents still appeared as separate soft spots. That made the backdrop feel a bit patterned rather than like one clean presentation canvas.
  Cause: The page background still relied on multiple localized radial highlights with relatively noticeable opacity.
  Fix: Reworked the background into a mostly white full-field gradient with only very subtle large-scale Mingle key-color washes, so the page reads as one calm surface instead of a white canvas with scattered blobs.
  Status: Resolved in-thread.

- **XR presentation deck could occasionally sweep backward at the loop boundary**
  Problem: Repeatedly advancing in one direction sometimes caused the deck to perform a long reverse-looking slide when wrapping from the cloned edge slide back to the real slide. That broke the illusion of a true infinite carousel.
  Cause: The loop-reset path changed `transition` and `transform` too close together, so the browser could occasionally animate the reposition jump instead of treating it as an invisible reset.
  Fix: Added a dedicated jump helper that disables transition, forces layout commit, repositions to the real slide, and only then restores transform animation. The transition-end listener was also narrowed to the track's own `transform` event.
  Status: Resolved in-thread.

- **XR presentation deck lost slide-number orientation while being simplified**
  Problem: During the cleanup toward a lighter, non-card layout, the slide counter disappeared entirely. That made the deck cleaner, but it also removed the presenter's quick sense of where they were in the sequence.
  Cause: The simplification pass removed the old deck UI wholesale, including the page counter, instead of preserving the one piece of orientation chrome that was still useful.
  Fix: Restored a minimal page counter as plain text only, placed unobtrusively at the bottom-right without reintroducing a card, badge, or boxed control treatment.
  Status: Resolved in-thread.

- **XR presentation deck still felt too dark and card-like after adopting the Mingle palette**
  Problem: Even after the deck picked up Mingle's warm key colors, it still rendered as a dark card floating over a separate outer background. That contradicted the requested direction for a lighter, cleaner relations deck built from white space plus brand color, with dark tones used only for text.
  Cause: The prior pass only swapped palette values and kept the card container, inner panel fill, border, and shadow structure intact.
  Fix: Removed the card treatment entirely, unified the slide surface with the page background, switched the deck to a light color scheme, and kept the visual system to white space plus Mingle key colors while moving dark emphasis into typography only.
  Status: Resolved in-thread.

- **XR presentation deck initially ignored the main Mingle service palette**
  Problem: After the structure was simplified, the shared `mingle-xr/xr.html` deck still used a cool dark-blue palette that did not visually connect to the live `mingle-app` experience. That made the relations deck feel like a separate product instead of an extension of the service.
  Cause: The template styling was reduced for clarity first, but its color system was not yet realigned to the app's established brand tones.
  Fix: Rebased the deck onto the Mingle palette already used in `mingle-app`, especially the warm gradient family around `#FBBC32`, `#F59E0B`, and `#F97316`, while keeping the slide content model minimal with only title and body.
  Status: Resolved in-thread.

- **XR presentation deck initially carried too many decorative content blocks for a format-first draft**
  Problem: The first shared `mingle-xr/xr.html` template included headers, counters, buttons, tag clusters, orbital visuals, and multi-card layouts. For a deck that was still at the format-definition stage, that made each slide feel overdesigned and distracted from the intended core structure.
  Cause: The template was built like a polished showcase deck before the content model had been reduced, so presentation chrome grew faster than the actual slide grammar.
  Fix: Rebuilt the shared XR deck into a minimal structure where each slide contains only two content elements: a title and a body. Navigation logic, horizontal motion, and looping behavior remain, but the visible slide system is now intentionally stripped down.
  Status: Resolved in-thread.

- **XR presentation deck motion originally moved vertically, which conflicted with deck-reading expectations**
  Problem: The first `mingle-xr/xr.html` template advanced slides with an up/down full-page translation. Even though arrow keys worked, the motion language felt closer to section scrolling than to a presentation deck, which made the format read less like a polished keynote-style relations asset.
  Cause: The deck track was implemented as a vertical flex column with `translate3d` based on `window.innerHeight`, so every transition reinforced vertical page movement.
  Fix: Switched the slide track to a horizontal row, changed each slide to a `100vw` panel, updated the transform math to use `window.innerWidth`, and normalized wheel navigation so either dominant scroll axis still drives the same previous/next controls while the animation moves left/right.
  Status: Resolved in-thread.

- **Legacy bottom mic could render in the tiny composer size after hydration**
  Problem: On Android `1.0.11` WebView validation, the legacy translator occasionally rendered the default bottom bar with the composer-sized microphone. This was not a simple viewport scale issue; the actual mic shell was collapsing into the `2.3rem` composer layout while the rest of the bar stayed on the default layout.
  Cause: `LivePhoneDemoLegacy.tsx` and the `1.1.0` room runtime both reused the same Framer Motion `layoutId` values for the composer mic shell and the default bottom-bar mic shell. `isComposerOpen` hydrates from persisted input-mode state after first render, so the shared-layout transition could mix the two subtrees during hydration.
  Fix: Removed the shared `layoutId` bridge between the composer/default mic shell and keyboard toggle in both legacy `1.0.11` and `1.1.0` web runtimes. This keeps the hydration swap discrete instead of animating between incompatible layouts.
  Status: Resolved in-thread.

- **Ngrok interstitial can masquerade as a layout regression on mobile WebView**
  Problem: When device builds pointed at a free ngrok tunnel, the RN WebView could render ngrok's anti-abuse warning page instead of the app. On Android this looked like the 1.0.11 microphone/footer UI had suddenly shrunk or changed, even though the app screen was never reached.
  Fix: Native WebView requests now add `ngrok-skip-browser-warning: true` for `*.ngrok-free.dev` and `*.ngrok-free.app` URLs so local mobile validation reaches the actual app surface.
  Status: Resolved in-thread.

- **Android conversation list could get stuck because RN treated total history length as active back availability**
  Problem: The RN WebView bridge reported `canGoBack` from `window.history.length > 1`, which is not the same as “the current entry has a backward target.” After opening a room and returning to the list with `history.back()`, Android hardware back could still be consumed by the WebView even though web history was already at the first entry, leaving the user stuck on the conversation list.
  Fix: The native navigation bridge now stamps a synthetic per-entry history index into `history.state` and derives `canGoBack` from the current index instead of total history length.
  Status: Resolved in-thread.

- **Conversation-list search initially ignored Android OS back and iOS edge-swipe history**
  Problem: The search UI in the conversation list was only a local `showSearch` state with no dedicated history entry. On Android, pressing OS back while search was open could fall through to app exit instead of closing just the search drawer. On iOS, the same search surface had no real edge-swipe back/forward path and risked reproducing the room-menu replay glitches if a multi-depth history stack was copied over too literally.
  Fix: Search now uses a single dedicated history state (`list <-> search`) instead of a local-only flag. Android native back consumes that entry and closes only the search drawer, while iOS popstate synchronization restores or dismisses search instantly to match native history snapshots without reusing the room menu's deeper stack logic.
  Status: Resolved in-thread.

## Scope

- This pass is organized by session ID, not by merged issue theme.
- It covers 277 unique Codex sessions whose `cwd` matched `mingle`, including archived sessions.
- Source split in this rescan: 29 live sessions and 248 archived sessions.
- Sessions with standalone UI/UX issues: 30.
- Total standalone UI/UX issue atoms documented in this file: 125.
- Sessions with UI/UX feature/polish requests only: 15.
- Sessions where a UI/UX issue was only mentioned or handed off: 8.
- Sessions with no UI/UX issue found: 224.
- `019d4cae-5142-7be2-9c74-30f95bfb5787` is listed first, exactly as requested.
- If a session had no UI/UX issue, the entry says only `No UI/UX issue found.`

## Detailed First Thread

### `019d4cae-5142-7be2-9c74-30f95bfb5787` | UI/UX issues found

- Thread focus: Phase 1 multi-conversation rooms on web/API/DB first, followed by a long chain of multi-room UI/UX fixes.
- High-level verdict: this thread absolutely contained many separate UI/UX issues. It should not have been collapsed into one line item.
- Issue atoms currently listed for this thread: 78.

1. **The conversation-list header box was taller than the intended reference**
   Problem: `nativeTopInsetPx` was being added to the header box itself, so the list header looked larger than the older `bottom-tabs` chrome it was supposed to match.
   Attempted fix: The header was reset to a fixed `56px + safe-area` structure and native banner clearance was moved out of the header box.
   Status: Resolved in-thread.

2. **The `Start Conversation!` CTA had an unwanted orange glow**
   Problem: The CTA shadow read like a pale orange haze behind the button, making the bottom bar look washed out.
   Attempted fix: The orange glow shadow was removed and replaced with a neutral shadow while keeping the gradient.
   Status: Resolved in-thread.

3. **The top gap above the list was over-expanded by fallback spacer math**
   Problem: Even after the header size was corrected, the page was still pushed down because a fallback banner estimate and a header-adjacent spacer were both being applied.
   Attempted fix: The explicit native inset was trusted when present, the guessed `50px` fallback was demoted to old cases only, and the header-front spacer was removed.
   Status: Resolved in-thread.

4. **Android hardware back initially did not return from a room to the list**
   Problem: The web overlay pushed history, but Android OS back was not bridged into the WebView history, so room navigation did not behave like native back.
   Attempted fix: A native back bridge was added on the RN side so hardware back could drive the same room-close history path.
   Status: Resolved in-thread.

5. **iOS swipe-back was initially unavailable**
   Problem: The WebView had back/forward gestures disabled, so iOS users could not use the normal left-edge history gesture.
   Attempted fix: `allowsBackForwardNavigationGestures` was enabled for the iOS path during the 1.1.0 RN work.
   Status: Resolved in-thread.

6. **The bottom launch area was still a button inside a footer instead of a full CTA bar**
   Problem: The requested UX was “the whole bottom area is the CTA,” but the implementation still looked like a white footer containing a smaller button.
   Attempted fix: The footer chrome was removed and the full bottom area was turned into one wide CTA surface.
   Status: Resolved in-thread.

7. **The in-room header was visually too tall and heavy**
   Problem: The room header read denser and larger than the list header, so entering a room felt like switching to a different chrome system.
   Attempted fix: Header height and padding were tightened to match the list chrome more closely.
   Status: Resolved in-thread.

8. **A legacy iOS tap-to-top fallback still sat above the room header**
   Problem: Old top-padding/tap behavior survived in the room view and made the upper chrome feel padded and inconsistent.
   Attempted fix: The fallback tap-to-top behavior and its extra padding path were removed.
   Status: Resolved in-thread.

9. **The in-room bottom control bar was bulkier than the list CTA bar**
   Problem: The room’s bottom control bar had more outer height and spacing than the list’s bottom CTA, so the two screens did not feel part of the same UI system.
   Attempted fix: Padding, min-height, and safe-area handling were repeatedly tightened.
   Status: Resolved in-thread after multiple passes.

10. **The in-room play/mic controls had too much chrome**
   Problem: Shadows and gray hover/background treatments around the main control made the room bar look noisy.
   Attempted fix: Extra shadows and adjacent gray chrome were stripped back.
   Status: Resolved in-thread.

11. **The iOS `/conversations` bottom safe area showed the wrong fill color**
   Problem: The native iOS safe-area fill stayed white under the conversation list instead of letting the web footer gradient continue downward.
   Attempted fix: RN palette handling was changed so `/conversations` does not paint the iOS bottom safe area with the native white fill.
   Status: Resolved in-thread.

12. **The list top banner sat too low below the header**
   Problem: The top ad/banner spacing for the list screen had too much clearance and did not visually lock to the header.
   Attempted fix: The list banner offset was tightened separately from the in-room banner offsets.
   Status: Resolved in-thread.

13. **The in-room top banner sat too far below the room header**
   Problem: The room banner spacing still looked loose after the first banner pass because the list and room were sharing one clearance model.
   Attempted fix: Room top offsets were tuned independently from the list offsets.
   Status: Resolved in-thread.

14. **The in-room bottom banner sat too far above the control bar**
   Problem: The bottom banner clearance in a room did not feel anchored to the actual visible control area.
   Attempted fix: The bottom offset was recalculated against the visible control bar height rather than a looser container estimate.
   Status: Resolved in-thread.

15. **iOS still had a tiny bottom-banner hover gap after the main banner tightening**
   Problem: After the broad banner-offset fix, iOS alone still showed a small floating gap above the bottom controls.
   Attempted fix: An iOS-only bottom nudge was added.
   Status: Resolved in-thread.

16. **Banner transitions lagged during list/room history changes**
   Problem: The old banner could remain visible while the next screen was already animating because the app switched directly between zones without a neutral state.
   Attempted fix: A `hidden` banner zone was introduced so transitions pre-hide before the next zone asserts itself.
   Status: Resolved in-thread.

17. **Room swipe-back on iOS flickered by reopening the room during close**
   Problem: On gesture back, history close and route-sync reopen fought each other, producing a `room -> list -> room` flash.
   Attempted fix: History-driven closes were split into `instant` closes while app-driven closes kept animation.
   Status: Resolved in-thread.

18. **iOS forward-swipe failed to restore the room cleanly**
   Problem: After swiping back to the list, swiping forward could leave the list visible or replay a new room-open instead of restoring the prior room state.
   Attempted fix: Route sync was made to subscribe directly to the `conversation` query and reopen through the history-specific path.
   Status: Resolved in-thread.

19. **The drawer had its own swipe-back flicker on iOS**
   Problem: When swiping back out of the drawer, the drawer could briefly reappear and then disappear again because it replayed an exit animation after the native transition.
   Attempted fix: The drawer was given the same `animate / instant` split that the room overlay received.
   Status: Resolved in-thread.

20. **Room swipe-back felt too edge-dependent**
   Problem: Leaving a room required starting at the far-left edge, which felt too brittle for the new full-screen room UI.
   Attempted fix: A web-side whole-body right-swipe helper was added on top of the native edge gesture, excluding buttons, drawers, dialogs, and inputs.
   Status: Resolved in-thread.

21. **The visible CTA label was hardcoded in English**
   Problem: `Start Conversation!` was rendered as raw English text instead of using the conversations dictionary.
   Attempted fix: The visible CTA label was switched to dictionary-backed copy.
   Status: Resolved in-thread.

22. **Seven shipping locales were missing the new conversations copy**
   Problem: `zh-CN`, `zh-TW`, `ru`, `ar`, `hi`, `th`, and `vi` still fell back to English for the conversation-list experience.
   Attempted fix: All missing locale blocks were added to the `conversations` dictionary.
   Status: Resolved in-thread.

23. **The app did not restore the last viewed room/list state on full reopen**
   Problem: Re-entering `/[locale]/conversations` after a full reopen could dump the user at the generic list rather than the exact room/list view they had been using.
   Attempted fix: The last viewed conversations URL was stored per locale and tracking user, then replayed on the next conversations entry.
   Status: Resolved in-thread.

24. **`Start Conversation!` could create a room but fail to auto-start STT because the flag was consumed too early**
   Problem: The parent cleared the auto-start marker before the room had actually reached `running/connecting`.
   Attempted fix: The auto-start marker was only consumed after real running/connecting confirmation.
   Status: Resolved in-thread.

25. **Auto-start broke again because the start path depended too much on child mount timing**
   Problem: Relying on the child room effect alone meant the room could mount and still miss the auto-start action.
   Attempted fix: The parent was changed to trigger start after the room ref became ready.
   Status: Resolved in-thread.

26. **One auto-start fix introduced a ref-callback update loop**
   Problem: A ref callback wrote state during ref attachment and produced a `Maximum update depth exceeded` loop.
   Attempted fix: The ref-callback state update was removed and replaced with a one-time polling/wait strategy.
   Status: Resolved in-thread.

27. **Conversation rows initially lacked recent-message context**
   Problem: The list showed room labels/status but not the latest spoken content, making the new multi-room list hard to scan.
   Attempted fix: The list summary API was extended to include a recent finalized-message preview.
   Status: Resolved in-thread.

28. **Recent-message previews disappeared after some PATCH calls**
   Problem: Pausing a room or changing room languages could blank the newly added preview line until the next full refetch.
   Attempted fix: Single-row summary responses were changed to carry `latestMessagePreview`, and client replacement logic was tightened.
   Status: Resolved in-thread.

29. **The state model tied `live/paused` too closely to room open/close instead of real STT activity**
   Problem: Simply opening or closing rooms could make status appear live/paused in ways that did not match actual STT ownership.
   Attempted fix: Visible-room state was separated from live-STT ownership and room status was recalculated from STT activity.
   Status: Resolved in-thread.

30. **Closing a live room could kill the live session instead of backgrounding it**
   Problem: Unmounting the visible room also tore down STT, even when the intended UX was “close the room UI but keep STT running.”
   Attempted fix: Live rooms were kept mounted in the background when necessary instead of being immediately destroyed on close.
   Status: Resolved in-thread.

31. **Re-entering the same live room did not reliably restore the same live instance**
   Problem: Returning to a still-live room could fail to restore its red/live button state and current instance cleanly.
   Attempted fix: The hidden background instance was preserved and re-shown instead of creating a fresh visual state.
   Status: Resolved in-thread.

32. **Paused rooms could reopen without finalized history or usage after relaunch**
   Problem: After app relaunch, paused rooms could look empty or lose `usageSec` even though persisted finalized data existed.
   Attempted fix: A room-level GET and server fallback hydration path were added to merge persisted finalized state back into the client.
   Status: Resolved in-thread.

33. **Hidden non-owner rooms kept consuming global native STT events**
   Problem: Background-mounted rooms still listened to the same native STT event stream, so room 2 could ingest room 1 text.
   Attempted fix: Native STT event ownership was forced to a single room and non-owners ignored the events.
   Status: Resolved in-thread.

34. **Restored list rows could keep stale `active` badges**
   Problem: After restore/reopen flows, the list’s displayed room state could stay `active` even when the room was no longer the real live owner.
   Attempted fix: Running-state fallback was seeded from restored summaries and cleaned whenever conversation summaries refreshed.
   Status: Resolved in-thread.

35. **Stop actions could update `paused` state and row ordering too late**
   Problem: Stopping a live room could leave delayed list flicker because the parent list did not hear `paused` early enough.
   Attempted fix: `paused` was pushed to the parent list immediately on stop request.
   Status: Resolved in-thread.

36. **List ordering was using the wrong signal**
   Problem: Rooms could move based on stale status/updated metadata instead of the most recent finalized utterance time, so ordering felt wrong.
   Attempted fix: `latestMessageAt` was added and ordering/time display were moved to the latest finalized message signal.
   Status: Resolved in-thread.

37. **A non-owner room could look live just by being opened**
   Problem: Merely entering room 2 or room 3 while room 1 owned STT could make the newly opened room look like it was running.
   Attempted fix: Running UI was gated by real STT ownership instead of generic connection-ready state.
   Status: Resolved in-thread.

38. **Room-to-room handoff could try to start the new room before native stop ack**
   Problem: `room1 stop -> room2 start` could overlap, so room 2 received the start intent before room 1 had fully gone idle.
   Attempted fix: Handoff was changed to wait for native stop ack or timeout before allowing the next start.
   Status: Resolved in-thread.

39. **The old live room could unmount too early during handoff and lose its stop listener**
   Problem: The parent sometimes marked the first room non-live so early that its listener disappeared before the native stop ack arrived.
   Attempted fix: During handoff only, the previous live room stayed mounted until stop completion.
   Status: Resolved in-thread.

40. **The running button still showed a play icon**
   Problem: While STT was already running, the main red control still showed a play triangle instead of a stop square.
   Attempted fix: The running state icon was switched to a stop square while preserving the loading spinner for connecting.
   Status: Resolved in-thread.

41. **iOS mic-permission denial could trap the room in retry/error UI**
   Problem: Denying mic permission left the room stuck in a retry/error-looking state and the button path could become effectively dead.
   Attempted fix: Permission denial was reset back to `idle`, the control was kept re-clickable, and native cached status stopped restoring denial as persistent error.
   Status: Resolved in-thread.

42. **The first permission-denial recovery was too aggressive about opening Settings**
   Problem: One recovery pass jumped to iOS Settings immediately on denial, which was later judged too aggressive for the intended UX.
   Attempted fix: The flow was adjusted so denial returns to idle first and Settings opens only on the next explicit retry tap.
   Status: Resolved in-thread.

43. **iOS swipe-back regressed again later because gesture enablement became tied to menu-open state**
   Problem: After later merges, swipe-back silently became available only when the native menu overlay was open.
   Attempted fix: `allowsBackForwardNavigationGestures` was restored to unconditional iOS enablement instead of `isNativeMenuOverlayOpen`.
   Status: Resolved in-thread.

44. **A later room-state pass hit an `isLikelyIOSPlatform` runtime error**
   Problem: The thread explicitly called out a runtime `Can't find variable: isLikelyIOSPlatform` during the multi-room state/ordering cleanup phase.
   Attempted fix: The missing runtime reference was repaired alongside the ownership/list-ordering patch set.
   Status: Resolved in-thread.

45. **iOS interactive swipe could still keep the old banner visible during the gesture**
   Problem: Even after pre-hide work, the banner could linger during the active interactive swipe because RN/WebView did not receive the gesture-start timing early enough.
   Attempted fix: The app already pre-hid as early as available and RN tried to infer the target zone from URL changes.
   Status: Not clearly solvable in-thread. Marked as unresolved structural limitation in the captured session.

46. **iOS `/conversations` could enter a “nothing responds” state because WebView touch handling was internally deadlocked**
   Problem: Later in the thread, the room/list surface could stop responding to taps entirely on iPhone. In the worst case, the user could tap conversation rows and other controls and nothing at all would happen. This was eventually traced to an RN-side WKWebView interaction rather than a web button-state issue.
   Attempted fix: The real regression was that `allowsBackForwardNavigationGestures` had been changed to unconditional iOS enablement at the same time that `/conversations` pages were still using `scrollEnabled={false}`. On iOS WKWebView, that combination let the underlying `UIScrollView` pan recognizer steal interaction in a way that made the web content feel untouchable. The thread later corrected this by gating `allowsBackForwardNavigationGestures` behind `!shouldDisableIosScroll` for those routes, while also fixing a cleanup omission in the legacy-import path.
   Status: Resolved in-thread once the RN gesture/scroll conflict was documented and reversed.

47. **Conversation rows could still log a route change without actually showing the room UI**
   Problem: Separate from the full touch-deadlock case, there was also a softer failure mode where tapping a room clearly triggered navigation work — server logs showed `/[locale]/conversations?...&conversation=<id>` requests and room GET calls returning `200` — but the visible screen never changed. The user described this as “touch logs appear but the screen does not move.”
   Attempted fix: Multiple hypotheses were tried in-thread because the failure looked like a presentation-layer regression rather than an API failure. These included: allowing room-open even while room status PATCHes were pending, forcing room entry to `instant`, reverting the move of auto-start logic from `mingle-home` into `LivePhoneDemo`, restoring query-based room open on first render, removing/reverting cold-start last-view restoration, and switching between `document.body` portal rendering and inline overlay rendering for the room surface. None of those attempts was treated as a final, clearly verified root-cause fix in the captured session.
   Status: Not conclusively resolved in-thread. The issue was important enough that the thread explicitly requested it be written down as a separate class of room-open regression, distinct from the pure iOS touch-deadlock above.

48. **iOS permission denial on `Start Conversation!` could still create a room and immediately strand it in `Connecting...`**
   Problem: The desired UX became “create the room, but do not auto-start STT if the initial iOS mic request was denied.” Instead, the room could still enter a visible `Connecting...` state and just sit there until the user manually backed out.
   Attempted fix: The create-room flow was changed so iOS native mic denial short-circuits auto-start, letting the room be created without pretending STT is actively connecting.
   Status: Resolved in-thread after follow-up permission-flow passes.

49. **After an iOS denial, the first explicit `Start` retry did not reliably open Settings**
   Problem: Once the user had denied microphone permission, re-entering the room and pressing `Start` was supposed to jump directly to the iOS Settings screen on the first retry. Instead, one pass left the room flashing or entering `Connecting...` once, and Settings opened only on a later interaction.
   Attempted fix: The thread cached the last native mic-permission outcome and reused it when re-entering rooms, so an already-denied state could trigger the Settings redirect immediately instead of burning the first retry tap.
   Status: Resolved in-thread after native permission caching was added and then refined.

50. **A hidden WebView site-level mic prompt appeared inside the native app**
   Problem: Even though the native app already owned microphone permission, `Start Conversation!` could still trigger a web-origin mic prompt (`Allow "...photo-for-passport.com" to use your microphone?`) from the embedded WebView. This was confusing and wrong for the intended native UX.
   Attempted fix: The room-creation warm-up path stopped calling `getUserMedia()` for native iOS/Android runtimes, so native permission stayed the only source of truth and the site-origin prompt stopped appearing.
   Status: Resolved in-thread.

51. **Web warm-up denial state and native denial state could drift apart**
   Problem: When denial happened through the warm-up path before the room UI was visible, the room-level `Start` logic did not always inherit that denial. This created a split-brain state where the room thought it should connect, while the earlier create-room flow had already learned that mic permission was denied.
   Attempted fix: The denial result from the create-room warm-up path was explicitly written into the same last-known native permission channel consumed by the room STT hook.
   Status: Resolved in-thread.

52. **STT could be truly running while the room UI stayed stuck in `Connecting...`**
   Problem: Later in the thread, the user found that `Connecting...` could remain on-screen even when STT was actually active. Evidence included server-side STT connection logs and, after navigating away and back, a red running button and working transcript ingestion.
   Attempted fix: Multiple state-reconciliation passes were added so the current room could recover native STT ownership on remount, re-read cached native status while connecting, and promote itself out of `connecting` when the native/runtime state proved STT was already alive.
   Status: Resolved in-thread after several iterations.

53. **The first STT server connection could be blocked until an unrelated user gesture**
   Problem: In one particularly confusing version of the bug, the STT server did not log a client connection until the user hit back or otherwise interacted again. This made it look like “the room is stuck,” even though the actual cause was a blocked async step in the front-end start pipeline.
   Attempted fix: The thread found that `primeAudioPlayback()` was being awaited before STT start, and on iOS/WebView that promise could stall waiting for a user gesture. The fix moved TTS priming to the background so the STT websocket start could happen immediately.
   Status: Resolved in-thread.

54. **Leaving a still-running room did not immediately update the list badge to `대화중`**
   Problem: The list badge for the live room sometimes remained stale after backing out of a room. The user could see that STT was active only after re-entering the room, at which point the red running button appeared and only then did the list eventually update to `대화중`.
   Attempted fix: Parent summary updates were made more eager, and the room/list ownership recovery path was expanded so the list could learn about the live owner even if the visible room UI had just unmounted.
   Status: Resolved in-thread after the later state-sync passes.

55. **The `Connecting...` overlay oscillated rapidly even while transcript text was already arriving**
   Problem: One later regression produced especially bad UX: the room would show `Connecting...`, words would begin arriving, and the overlay would flash on and off many times over the first few seconds. The user described it as the overlay appearing and disappearing more than twenty times while speech was already being recognized.
   Attempted fix: The native `running/silenced` statuses were kept in `connecting` only until the first real server-ready or transcript activity, and once the room reached `ready`, later repeated native running statuses were prevented from downgrading it back to `connecting`.
   Status: Resolved in-thread.

56. **The room-rename dialog sat too low and could be covered by the keyboard**
   Problem: Both the in-room rename dialog and the conversation-list rename dialog initially rendered around the vertical center of the screen. On iPhone, opening the keyboard could partially cover the field and action buttons.
   Attempted fix: The dialogs were moved to a safe-area-aware top offset instead of center alignment, and both implementations were normalized to use the same upper placement model.
   Status: Resolved in-thread after multiple follow-up passes.

57. **The first rename-dialog positioning fix was misleading because only one of the two dialogs actually moved**
   Problem: One pass moved the in-room dialog but left the list-side dialog centered, so the user kept reporting “the rename modal is still too low” even though one implementation had changed.
   Attempted fix: The list rename modal and the room rename modal were both audited and then moved together so they shared the same top anchoring behavior.
   Status: Resolved in-thread.

58. **Long-pressing a conversation row selected text instead of cleanly showing the room-actions tooltip**
   Problem: On the conversation list, a long press could trigger iOS-style text selection on the preview/time labels, producing blue text-selection affordances that fought the intended room-action menu.
   Attempted fix: User-select and touch-callout behavior were disabled on the room rows so long press opens the room-actions tooltip without text-selection chrome.
   Status: Resolved in-thread.

59. **Long-pressing a room avatar could open image-preview behavior instead of room actions**
   Problem: The avatar image on a conversation row still behaved like a draggable/previewable image on iOS, so long-pressing it could surface image preview behavior rather than the intended room-action tooltip.
   Attempted fix: Drag/image-preview behavior was disabled on the list avatars so long press remains dedicated to room actions.
   Status: Resolved in-thread.

60. **The room-delete action from the conversation list initially failed with `405 Method Not Allowed`**
   Problem: The UI exposed room deletion from the list, but versioned `/api/ios/.../conversations/:id` and `/api/android/.../conversations/:id` routes were not exporting `DELETE`, so the visible action failed immediately for users.
   Attempted fix: `DELETE` was added to the versioned iOS/Android conversation-detail routes and controllers so room deletion used the same soft-delete API through namespace-specific endpoints.
   Status: Resolved in-thread.

61. **Freshly created rooms could immediately 404 on follow-up GET/PATCH calls**
   Problem: A newly created room could appear to exist for one moment and then fail hydration/status requests because `is_deleted = NULL` rows were being filtered out as if they were deleted. This created visible “room not found” behavior right after room creation.
   Attempted fix: Conversation queries were changed to treat `is_deleted = NULL` the same as `false`, so newly created rooms remain queryable until explicitly soft-deleted.
   Status: Resolved in-thread.

62. **Deleting a live room from the list could revive the room or leave behind an empty shell**
   Problem: When STT was still active or just winding down, room deletion could race against live-state PATCHes and room-summary upserts. The user could see the room disappear and then reappear as a blank/initial-looking room, often accompanied by 404s.
   Attempted fix: Deleting-room IDs were tracked explicitly, running-state PATCHes were suppressed for deleting rooms, and delete success removed the room from all live/list state immediately instead of allowing later upserts to resurrect it.
   Status: Resolved in-thread after several passes.

63. **Pending STT finalization after delete could still write into a deleted room**
   Problem: Even after STT stopped, a pending finalization/translation turn could land after deletion and touch the just-deleted room again. This produced confusing server 404s and visible “why is this room still here?” moments.
   Attempted fix: A dedicated `prepareForDeletion()` path was added so pending turns and in-flight finalization work are discarded before the delete completes.
   Status: Resolved in-thread.

64. **Live-room deletion could surface a failure alert even when the room was already gone**
   Problem: The room visually disappeared, but a late `PATCH 404` or `DELETE 404` could still bubble up as `대화방을 삭제하지 못했습니다`, making the user think the delete had failed even though the room was already removed.
   Attempted fix: Late 404s that happen during or after confirmed deletion were treated as benign and no longer surfaced as a user-facing failure.
   Status: Resolved in-thread.

65. **The room-management menu briefly flashed the feedback screen while opening**
   Problem: The submenu carousel was implemented as `root -> feedback -> room management` on a shared three-panel strip. Jumping from the root menu to room management animated across the middle panel, making the feedback page flash by for a frame.
   Attempted fix: Direct root-to-room-management navigation now uses an instant screen transition instead of visibly sliding through the feedback panel.
   Status: Resolved in-thread.

66. **Global success/error toasts appeared too low and did not match the in-room toast style**
   Problem: Several user-facing messages such as room-delete success/failure and STT failure surfaced through a bottom-edge toast style that sat much lower than the in-room `Connecting...` or `Copied` toasts, making the feedback feel visually inconsistent.
   Attempted fix: The global toast stack was moved into the same visual lane and design language as the in-room toast treatment.
   Status: Resolved in-thread.

67. **Conversation-list action tooltips chose the wrong vertical direction near the top of the screen**
   Problem: Only the very first row opened its tooltip downward. Rows slightly lower in the upper part of the list still opened upward, which felt wrong and cramped near the top header area.
   Attempted fix: The positioning rule was expanded so conversation rows in roughly the top 40% of the list viewport also open their tooltip downward.
   Status: Resolved in-thread.

68. **Android OS back skipped the menu subpage stack and closed the room**
   Problem: When the hamburger menu was on `Feedback` or `Conversation Management`, Android hardware back did not close the submenu first. It fell through to the room-close handler, so the user was dumped back to the conversation list instead of stepping back inside the menu.
   Attempted fix: A higher-priority native back handler was registered inside the room menu so submenu/modals/dropdowns consume Android back before the room overlay does.
   Status: Resolved in-thread.

69. **Opening feedback from Android 1.1.0 hit a 404**
   Problem: The UI exposed the feedback page from the hamburger menu, but `/api/android/v1.1.0/feedback` and `/api/ios/v1.1.0/feedback` were missing, so entering the page could immediately fail with a 404 and an apparently broken empty state.
   Attempted fix: Versioned `feedback` route aliases were added for API `v1.1.0` on both Android and iOS, and the namespace routing contract test was expanded.
   Status: Resolved in-thread.

70. **iOS submenu transitions became unnaturally fast and snap-like**
   Problem: After the menu tree refactor, entering and especially leaving `Feedback`/`Conversation Management` felt too fast, with the close transition appearing half-smooth and then disappearing abruptly.
   Attempted fix: Menu subpage timing and back-direction animation handling were retuned so open/close transitions use the same smoother content transition path.
   Status: Resolved in-thread.

71. **iOS edge-swipe back from a submenu replayed the closed page and flashed it away**
   Problem: Swiping from the left edge did return from `Feedback`/`Conversation Management` to the root menu, but roughly half a second later the just-closed submenu could flash back in and then vanish. The user perceived this as a severe flicker/regression in the back gesture.
   Attempted fix: Natural iOS history-gesture `popstate` is now treated separately from app-requested back steps, so the system swipe no longer replays a second JS-side submenu animation after the native transition already completed.
   Status: Resolved in-thread.

72. **An iOS submenu back-gesture fix accidentally removed menu swipe-dismiss**
   Problem: To stop edge-swipe flicker, the menu’s own swipe-dismiss was briefly disabled on iOS, which regressed the expected ability to dismiss the menu by swiping inside the panel.
   Attempted fix: The gesture model was split by start region: the left-edge gutter is reserved for native iOS history swipe, while swipes starting farther inside the panel still trigger the custom menu dismiss.
   Status: Resolved in-thread.

73. **iOS forward-swipe could preview the menu and then let the room snap back over it**
   Problem: After returning from a menu/subpage to the room via iOS edge-swipe back, using the forward gesture could momentarily show the previous menu state and then abruptly let the room reclaim the screen. The system gesture preview looked correct, but the JS state refused to restore the menu.
   Attempted fix: The menu `popstate` handler was changed to accept forward restoration from depth `0 -> 1/2` instead of bailing out whenever the current menu depth was already zero.
   Status: Resolved in-thread.

74. **iOS forward-swipe still replayed a delayed room/menu double transition**
   Problem: Even after forward restoration was enabled, the system could show the menu correctly and then, about a second later, replay a `menu -> room -> menu` sequence. The UI looked like it had recovered, then the room suddenly covered it, then the menu slid back in.
   Attempted fix: Menu history restoration now reads the latest `window.history.state` instead of trusting a stale `popstate` payload, and it no longer invents fallback depths by decrementing the current depth. This avoids delayed second transitions from stale history snapshots.
   Status: Resolved in-thread.

75. **iOS natural history gestures could still emit one delayed room/menu replay across the room boundary**
   Problem: Even after stale-state handling was tightened, a completed iOS back/forward gesture could still be followed by one late `menu <-> room` reversal. Users saw the correct destination first, then a brief return to the opposite screen, then the intended screen again.
   Attempted fix: A short iOS gesture-settle guard now ignores delayed natural `popstate` replays that would bounce only between room depth `0` and menu depth `1/2`, while still allowing normal in-menu depth changes.
   Status: Resolved in-thread.

76. **iOS menu swipe history required one final stabilization pass before it stopped flickering**
   Problem: The earlier back/forward fixes each removed one layer of the glitch, but the room/menu boundary remained fragile enough that users still saw intermediate regressions while testing real gestures. The practical UX issue was not just one bug but a chain of related history/gesture mismatches that had to be iterated on until the same back/forward flow finally behaved consistently.
   Attempted fix: The thread ultimately converged on a stable combination of native edge-swipe handling, in-panel swipe-dismiss routing, forward restoration, stale-state avoidance, and delayed-replay suppression. Once those pieces were in place together, the user confirmed that the duplicate swipe replay issue appeared to be behaving correctly.
   Status: Resolved in-thread after multiple follow-up passes.

77. **Forward history after custom menu swipe-dismiss could restore a partially dragged menu snapshot**
   Problem: If the user closed the hamburger menu with the custom in-panel swipe-dismiss gesture instead of native edge-swipe back, a later iOS forward-swipe could restore an in-between frame rather than a clean full menu. The left side of the room stayed visible because iOS appeared to snapshot the menu at the exact drag offset where the finger was released, then React finished a second internal slide into the real destination.
   Attempted fix: The thread narrowed the cause to the custom swipe-dismiss path firing history navigation while the panel still visually reflected a partial drag offset. The likely remediation identified in-thread was to force the menu back to a clean fully-open frame before navigating history, but that final code fix had not been landed yet at the time of documentation.
   Status: Still open at thread end.

78. **Android create-room auto-start could misread cached mic denial as an iOS Settings recovery**
   Problem: On Android 1.1.0, denying microphone permission and then pressing `Start Conversation!` again could jump straight to app settings instead of showing the normal in-app permission prompt. Manual `Start` inside the room still behaved correctly, so the regression was isolated to the auto-start path used by newly created rooms.
   Attempted fix: The thread found that cached native mic-permission state was always being rehydrated as if it belonged to iOS, which converted any cached `denied` value into the `open_ios_settings` recovery path. The fix resolved the cached recovery action against the current API namespace platform so Android denial stays on the in-app retry path while iOS denial still routes to Settings.
   Status: Resolved in-thread.

## Other Issue Sessions

### `019c5304-b4b1-7bf0-b768-81ea87605468` | UI/UX issues found

1. **The app shell exceeded the intended 480px maximum width**
   Problem: The mobile-web shell had drifted beyond the intended 480px cap, so the centered service area looked too wide and lost the phone-frame feel the user expected.
   Attempted fix: The max width was reset from the larger rem-based cap back to a 480px-equivalent constraint.
   Status: Resolved in-thread.

### `019c5c43-c3ae-76f1-bfbf-a3be7fd105f3` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: intermittent favicon load crash on first activation/refresh.
   Attempted fix: serve favicon as a static public asset.
   Status: resolved.

### `019c6f40-5ed2-7933-9acd-9302b505584e` | UI/UX issues found

1. **Initial and refresh entry could settle at the wrong scroll position**
   Problem: When the conversation view hydrated, the newest content was not reliably anchored at the bottom, so users could land mid-history instead of on the live edge.
   Attempted fix: The bottom-anchor timing was reworked so the list waits for the right hydration point before doing its one-time bottom snap.
   Status: Resolved in-thread.

2. **Top pagination could trigger before bottom anchoring finished**
   Problem: The top-edge loading logic could wake up too early, fighting the intended bottom-follow behavior and making the initial scroll position feel unstable.
   Attempted fix: The top-pagination trigger was tightened so it no longer races the first bottom-settle pass.
   Status: Resolved in-thread.

3. **Translation bubble confirmation UI was tied to STT final instead of translation final**
   Problem: The translation bubble visually looked finalized as soon as STT finalized, even when the translation itself was still pending, which made the UI state misleading.
   Attempted fix: The translation bubble styling was split so the emphasized/final state only appears after translation finalization.
   Status: Resolved in-thread.

4. **Stopping STT during TTS playback could leave playback state stuck**
   Problem: If STT was stopped while TTS audio was already playing, playback could stop mid-stream, the playing effect could remain on screen, and later TTS playback could stop working until app restart.
   Attempted fix: This thread reached root-cause analysis and identified a stuck TTS state / missing completion path, but the captured session ended at investigation.
   Status: Unresolved in this session.

### `019c756e-8522-7eb0-ab7a-f3032bcd29ee` | UI/UX issues found

1. **The overlay disappeared too early during inertial scrolling**
   Problem: On mobile inertial scroll, the app dropped out of its user-scrolling state too early, so the overlay vanished while the screen was still visibly moving.
   Attempted fix: The scroll-state logic was changed to keep the overlay visible until scrolling had actually stopped.
   Status: Resolved in-thread.

### `019c95e8-00df-7180-8366-54a76bd59ccc` | UI/UX issues found

1. **Hamburger menu surfaces used the wrong background color**
   Problem: The hamburger panel and then the hamburger button itself did not match the navbar surface, so the top-right chrome looked visually inconsistent.
   Attempted fix: The menu panel and trigger button were restyled to use the same surface treatment as the navbar.
   Status: Resolved in-thread after multiple passes.

2. **Menu and login copy were not fully internationalized**
   Problem: Menu items and login-related text still leaked hardcoded English instead of following the 15-locale i18n system.
   Attempted fix: Missing translation keys and locale coverage were added for the menu and login flows.
   Status: Resolved in-thread.

3. **UI locale sources disagreed with each other**
   Problem: `Sign in`/`Sign out` could stay English while the language selector showed Korean, because page locale and selector locale were being derived from different sources.
   Attempted fix: The selector locale was unified with the page locale so the visible UI no longer split between two locale sources.
   Status: Resolved in-thread.

4. **Borders and depth around the hamburger menu were still wrong after the first styling pass**
   Problem: Even after the color fix, the menu still showed leftover borders or the wrong amount of chrome, so it did not match the requested flatter look.
   Attempted fix: The trigger and panel styling were iterated again, removing the extra border/depth where inappropriate and preserving only the container border that the user wanted.
   Status: Resolved in-thread after several corrections.

5. **Dropdown positioning regressed during the flattening passes**
   Problem: At one point the menu overlapped the navbar and even obscured the hamburger trigger, which was a direct positioning bug introduced during the flattening iteration.
   Attempted fix: The panel was moved back below the navbar and its border restored.
   Status: Resolved in-thread.

### `019c992c-911f-7b23-8a18-3a0e4d5007df` | UI/UX issues found

1. **Live message rows flickered as text updated**
   Problem: During diarization work, each incremental transcript update caused the whole visible message UI to flash, including the translation rows, which made the conversation feel unstable.
   Attempted fix: The partial-key / rerender path was tightened so existing bubbles no longer unnecessarily re-animate on every transcript update.
   Status: Resolved in-thread.

2. **Multi-speaker overlap still failed to finalize per speaker**
   Problem: A second overlapping utterance could appear, but the first speaker's utterance could stay stuck without finalizing because activity/finalize logic was not truly separated per speaker.
   Attempted fix: Speaker-specific idle/finalize handling was added end-to-end so each speaker can finalize independently.
   Status: Resolved in-thread.

### `019ca08b-fcff-7ba3-b22f-d4a11d6203a8` | UI/UX issues found

1. **Login screen safe areas showed ugly white bands**
   Problem: The RN iOS login screen rendered white safe-area strips above and below the content instead of extending the intended top and bottom colors, which made the shell look unfinished.
   Attempted fix: The iOS shell safe-area fill was reworked so login routes extend their intended colors into the top and bottom safe areas.
   Status: Resolved in-thread.

2. **The login flow initially lacked the requested swipe-to-terms step**
   Problem: The requested UX was social-login button -> slide to terms acceptance -> continue, but that intermediary terms panel did not exist at first.
   Attempted fix: The login UI was restructured to slide into a terms-consent step before continuing into provider auth.
   Status: Resolved in-thread.

3. **Apple and Google auth flows did not match the requested native UX**
   Problem: Apple needed a native Face ID-backed flow, and Google needed the system confirmation sheet plus bottom-sheet browser auth flow, but the earlier implementation did not provide that experience.
   Attempted fix: A native iOS auth module was introduced so Apple and Google could follow the requested native/auth-session flows.
   Status: Resolved in-thread.

4. **The login flow could stall on `Checking your session` and fail when `.env.local` expectations drifted**
   Problem: Users saw a long spinner before Google sign-in and sometimes hit `Try signing in with a different account`, exposing a fragile dependency on runtime env plumbing.
   Attempted fix: The branch was rebased with the mainline auth/env changes and devbox was rerun so the login flow used the newer env handling.
   Status: Resolved in-thread.

5. **Menu background and i18n regressions resurfaced after rebasing the login branch**
   Problem: After merging main and rerunning devbox, the hamburger surface and localized copy still looked unchanged, so the earlier menu/i18n fixes had effectively regressed from the user's perspective.
   Attempted fix: The menu surface, locale resolution, and auth/menu copy were patched again on top of the rebased branch.
   Status: Resolved in-thread.

6. **Visible locale cues disagreed across the same login UI**
   Problem: `Sign in`/`Sign out` stayed English while the language dropdown looked Korean, meaning the auth copy and selector were not reading the same locale state.
   Attempted fix: Locale resolution was unified so both the page UI and the selector derive from the same locale source.
   Status: Resolved in-thread.

7. **Hamburger flattening passes repeatedly regressed border and placement behavior**
   Problem: The menu went through several incorrect intermediate states: leftover borders, panel covering the trigger, and then loss of the container border the user still wanted.
   Attempted fix: The panel was iterated until it sat below the navbar with the requested flat treatment and restored outer border.
   Status: Resolved in-thread after multiple passes.

### `019d0514-065c-7493-9eb9-ce8c137a0a98` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: users did not recognize the top-right language control as a dropdown.
   Attempted fix: add a minimal visual cue.
   Status: likely resolved; this captured session later focused on cleanup.

### `019d09c4-4bbb-7712-bfff-af784ff51f88` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: translation bubble meta rows made bubbles too thick.
   Attempted fix: move flags/time outside the bubble.
   Status: likely resolved earlier; this captured session later focused on cleanup.

### `019d10e1-9693-7a92-bb87-c25a4907c539` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: splash logo yellow did not match the splash background.
   Attempted fix: replace the launch image asset so its background color matches the runtime splash color.
   Status: resolved.

### `019d162b-4b15-7763-88f2-7571532d1ed6` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: animal avatar SVGs had too much whitespace and one asset looked bad.
   Attempted fix: asset-trim/polish request.
   Status: likely resolved on its feature branch; this entry is design-polish rather than a runtime bug.

### `019d18f0-c3d8-71c3-b1cb-f3b6a8c94e21` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: iOS resume showed a brief white flash.
   Attempted fix: investigation only in this thread.
   Status: unresolved in this session.

### `019d18f2-8f47-7c43-b52f-b08ce0ae78b8` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: auto-scroll triggered too often and fought manual scrolling.
   Attempted fix: throttle/recheck bottom-follow logic.
   Status: resolved.

### `019d19a3-df70-7a42-bd7b-ff6ac157d4a3` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: Android background translations did not visibly update until foreground.
   Attempted fix: investigation only.
   Status: unresolved in this session.

### `019d29d5-7bbe-7660-a135-078eb1403e45` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: the onboarding overlay showed a ghost play icon that misled users into tapping the wrong target.
   Attempted fix: remove the misleading icon and rely on copy/arrow guidance.
   Status: resolved.

### `019d2a13-5d6c-7892-9f2b-9143113463b0` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: initial room landing with existing history did not snap to bottom.
   Attempted fix: wait for hydration readiness before the one-time bottom anchor.
   Status: resolved.

### `019d2a3f-2705-7810-a0e0-a2281881a606` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: relaunch auto-scroll happened only once instead of on every fresh open.
   Attempted fix: several approaches explored.
   Status: no clearly landed final fix in this thread.

### `019d2f95-6e34-7013-8961-35857fe8f51d` | UI/UX issues found

1. **Opening the redesigned drawer could shake the main screen underneath**
   Problem: After the drawer redesign work and parent-branch merge, opening the panel caused the main screen to jolt instead of feeling like a stable overlay.
   Attempted fix: Focus transfer and panel transition behavior were adjusted so the drawer slides in without disturbing the underlying screen.
   Status: Resolved in-thread.

2. **The flattening pass briefly put the menu in the wrong place and removed the wrong border**
   Problem: In follow-up adjustments, the dropdown/panel styling regressed into overlapping the navbar or losing the container border the user expected to keep.
   Attempted fix: The panel placement was reset below the navbar and only the intended outer border was restored.
   Status: Resolved in-thread.

3. **The drawer thread mixed a large UX redesign with follow-up visual corrections**
   Problem: What started as a feature thread became a real UI bug-fix thread once the first redesign introduced open-state and chrome regressions.
   Attempted fix: The redesign stayed in place, but the visible regressions were corrected in subsequent passes.
   Status: Resolved in-thread.

### `019d43a0-d5ec-7fd1-94b1-884dcea6de65` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: iOS banner/runtime debugging expanded into a hydration mismatch around render-time Date/Intl formatting.
   Attempted fix: banner/runtime work landed, but the hydration mismatch itself was only diagnosed.
   Status: mixed.

### `019d43a3-c1e7-7600-858d-64964413a683` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: tab/body chrome tuning also exposed My Page scroll-chain bugs and spacing issues.
   Attempted fix: confine scrolling to internal content and contain overscroll.
   Status: resolved.

### `019d43ae-bb58-7202-80ff-dfaa9ef50e68` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: branch-level bottom-tabs work continued banner/layout/ad polish.
   Attempted fix: this session is mostly a meta/summary handoff, not a standalone fix thread.
   Status: no independent verdict beyond the linked implementation threads.

### `019d4caf-4787-77f2-9e97-a7695630b6d2` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: mic-permission denial recovery felt bad and could strand users in a failed state.
   Attempted fix: reset back toward retryable/idle behavior.
   Status: later resolved across follow-up permission-retry threads.

### `019d4d16-3c07-7c91-b787-66f177fbfc1f` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: banner/ad placement and scene transitions broke across room/list/drawer/menu states.
   Attempted fix: explicit banner zones and runtime-param preservation.
   Status: resolved.

### `019d4eba-14af-7523-ad3c-0f5a5b3a810b` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: forced WebView reload/flicker could leave STT still running while room metadata/status looked reset or stale.
   Attempted fix: native/WebView state-reconcile work.
   Status: issue clearly existed; exact final closure is spread across follow-up reconcile threads.

### `019d4f37-af30-7872-bc3a-4f68be0fabd6` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: Android could show a stopped/orange run button while STT was still actually running.
   Attempted fix: diagnosis of native/WebView state split only.
   Status: unresolved in this thread.

### `019d5714-6710-7343-b2a8-b4faa797c702` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: per-bubble copy buttons made the conversation UI visually noisy.
   Attempted fix: keep only whole-utterance copy and use selection/long-press plus toast for the rest.
   Status: resolved.

### `019d6d6d-cd79-71b0-99e5-c0296b0adeae` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: keyboard-mode composer could grow but not shrink back.
   Attempted fix: immediate remeasurement/shrink synchronization plus tests.
   Status: resolved.

### `019d6d99-14df-7910-827a-26d32cc47d39` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: keyboard mode added too much bottom margin when the banner position was bottom.
   Attempted fix: subtract non-covering clearance and later fix native inset reporting.
   Status: resolved.

### `019d6f86-9cff-73a1-b425-1b407e9f82d5` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: voice-to-keyboard transition stuttered.
   Attempted fix: unify clearance/composer settling so the layout drops in one smooth pass.
   Status: resolved.

### `2026-04-12-android-bottom-banner-safe-area` | UI/UX issues found

1. **Thread-level UI/UX issue**
   Problem: in-room transcript content on Android could still be covered by the bottom native banner even though the same bottom-banner path was correct on iOS and the top-banner path was correct on both platforms.
   Root cause: the banner position itself was acceptable, but Android WebView still reported a smaller bottom inset to the web transcript than the banner effectively covered. RN added Android native bottom safe-area to the physical banner placement, while the web transcript only reserved the banner content height. That mismatch left the transcript under-padded only on Android bottom-banner rooms.
   Attempted fix: keep the native banner placement unchanged, but report `banner height + Android native bottom safe-area` back to web content as the effective bottom inset. iOS continues to report just the banner content height.
   Status: resolved.

## Feature Or Mention-Only Sessions

### `019c52c6-0c6b-7ba0-b8fd-a566d5a6f8b0` | UI/UX feature/polish request only

Focus: initial mingle-app mobile-web shell, four-tab layout, and visual redesign build-out; this was a feature construction thread, not a pre-existing bug thread.

### `019c90fd-30d5-7643-8462-853738eb5975` | UI/UX feature/polish request only

Focus: RN iOS login gate, social sign-in entry screen, hamburger menu, account actions, and locale plumbing. This was a substantial feature build thread, not a pre-existing UI bug thread.

### `019c9f66-dff3-7612-94f5-52ab7df0303c` | UI/UX feature/polish request only

Focus: login-screen redesign planning only. The session was about visual direction and worktree setup, not a pre-existing UI bug fix.

### `019ca44a-10f9-7ba1-a03a-324fec2a8941` | UI/UX feature/polish request only

Focus: add a delete-account confirmation modal with i18n; not a pre-existing UI bug thread.

### `019ca451-b5bf-7101-ac73-32363c8c017c` | UI/UX feature/polish request only

Focus: add a share button to the hamburger menu; not a bug thread.

### `019caad5-6bb0-7d92-bea8-5037f761994d` | UI/UX feature/polish request only

Focus: email-login flow, swipe panels, and bottom-sheet auth UX; not a pre-existing bug thread.

### `019d0a14-c17f-7fd3-af01-e02b23765d6d` | UI/UX feature/polish request only

Focus: add random speaker animal avatars; not a bug thread.

### `019d1faf-7c71-7c53-9025-6f825575d813` | UI/UX feature/polish request only

Focus: revive the hamburger drawer with a right-side full-height panel and swipe/overlay close UX.

### `019d4785-e9ae-7251-901a-522eb61b1b1b` | UI/UX feature/polish request only

Focus: planning how to split the large social-style UIUX branch into a smaller release train.

### `019d482b-5732-7533-b684-9a706ecd36a3` | UI/UX feature/polish request only

Focus: review/planning of the multi-conversation branch structure; no standalone bug fix in this thread.

### `019d56dd-4efc-7131-84f3-fb54707d0fdd` | UI/UX feature/polish request only

Focus: add per-bubble copy buttons and narrower bubbles. This later got reversed by thread 019d5714 because the result felt too noisy.

### `019d6737-7b85-7080-bce8-dccb05377c6e` | UI/UX feature/polish request only

Focus: messenger-style keyboard input bar with animated mode toggle; not a bug thread.

### `019d6d79-cfda-70d2-b96c-19522f7edfbc` | UI/UX feature/polish request only

Focus: translation-model dropdown badges and wider opened menu layout.

### `019d6dc3-9387-7781-af63-4fb1286d9670` | UI/UX feature/polish request only

Focus: add a full-delete action and confirm modal inside the drawer menu.

### `019d7003-dbb6-7801-a8d9-649857671dbc` | UI/UX feature/polish request only

Focus: add a drawer-level full-delete action with confirm modal and localized copy. This was a feature request thread, not a pre-existing UI bug thread.

### `019c7ebf-5768-7991-b324-4587f5a62297` | UI/UX issue mentioned but no standalone fix recorded here

UI/UX issue mentioned, but this thread was planning-only: the existing iOS notch tap-to-top problem was discussed and scoped, with no standalone fix landed here.

### `019d391d-4b31-7ad1-91f2-03a3dcb90001` | UI/UX issue mentioned but no standalone fix recorded here

UI/UX issue mentioned, but this thread is only a shadow summary of another conversation. No standalone fix was performed here.

### `019d3989-cd8b-75d3-b8da-c60918a4ba01` | UI/UX issue mentioned but no standalone fix recorded here

UI/UX issue mentioned, but this thread is only a Telegram summary/handoff. No standalone UI/UX fix was completed in this session.

### `019d4398-a433-7652-a450-2704223b9242` | UI/UX issue mentioned but no standalone fix recorded here

UI/UX issue mentioned only indirectly. The captured action here was mainly auth/config cleanup (disable noisy web Apple OAuth wiring); no standalone UI bug was resolved here.

### `019d6f81-c484-7ca3-8d8e-35eda0d82a5b` | UI/UX issue mentioned but no standalone fix recorded here

UI/UX issue mentioned in the opener, but this captured session ended as worktree cleanup only. No standalone UI/UX fix recorded here.

### `019d6f82-c1a0-7d70-8577-894e00b96f24` | UI/UX issue mentioned but no standalone fix recorded here

UI/UX issue mentioned in the opener, but this captured session ended as worktree cleanup only. No standalone UI/UX fix recorded here.

### `019d6f83-3566-78f1-bfea-c78a915dca28` | UI/UX issue mentioned but no standalone fix recorded here

UI/UX issue mentioned in the opener, but this captured session ended as worktree cleanup only. No standalone UI/UX fix recorded here.

### `019d6f83-810e-7573-ae59-bae9a403a787` | UI/UX issue mentioned but no standalone fix recorded here

UI/UX issue mentioned in planning only: the opener explicitly called out fragmented i18n coverage and missing locales across surfaces, but this captured session stayed at planning/review and did not land a standalone UI/UX fix here.

## Sessions With No UI/UX Issue

- `019c52c6-d0f5-7c20-bf10-60abd034b1ea` | No UI/UX issue found.
- `019c52c7-dd99-7d41-bf04-c337e06f352a` | No UI/UX issue found.
- `019c52cf-6e60-75b1-a47b-521a4b9c6d25` | No UI/UX issue found.
- `019c5302-fb6b-7393-a71c-ded42accc3a6` | No UI/UX issue found.
- `019c55e2-5f5f-7e11-a066-4bfa55f62e03` | No UI/UX issue found.
- `019c55fb-57da-7a92-aec2-2561a237566d` | No UI/UX issue found.
- `019c55fc-6a14-7b42-b8fe-31425ac7f2e1` | No UI/UX issue found.
- `019c5623-e849-7461-ae84-240a7693ea09` | No UI/UX issue found.
- `019c5662-1c56-75f0-b5d9-cfd633fdfe75` | No UI/UX issue found.
- `019c568d-6ebb-7631-90aa-2f179b5e8abe` | No UI/UX issue found.
- `019c568e-11fc-7750-a632-17c29060bd13` | No UI/UX issue found.
- `019c572c-a147-7c21-8b82-fed87a40a573` | No UI/UX issue found.
- `019c5737-cdbe-7ed0-b00c-acf21b014031` | No UI/UX issue found.
- `019c5768-326e-70e2-a693-5042890aeb5e` | No UI/UX issue found.
- `019c5783-e59a-7181-8850-3c73b88095e0` | No UI/UX issue found.
- `019c57d5-8d82-7093-afaf-a5787fd9be32` | No UI/UX issue found.
- `019c5b3d-17d9-7f30-bbc0-8cba3d9f8745` | No UI/UX issue found.
- `019c5b3f-3262-79f1-ad42-a999b8258497` | No UI/UX issue found.
- `019c5c28-0ec3-76e3-9a0a-9d0fc59fff61` | No UI/UX issue found.
- `019c5c86-e70a-7880-bcbc-55dd30263975` | No UI/UX issue found.
- `019c5c98-b2a2-77a1-9c86-b9bf9fcef5b9` | No UI/UX issue found.
- `019c5ca5-5af0-7c61-9cb7-3ecfa9a8978d` | No UI/UX issue found.
- `019c5d09-8297-7fb1-b30e-170157988bfd` | No UI/UX issue found.
- `019c60f9-f131-7d31-bffc-053015acbe53` | No UI/UX issue found.
- `019c6578-d27f-7400-a22e-8c6c977af21a` | No UI/UX issue found.
- `019c657a-263b-7923-ac29-67502733eae2` | No UI/UX issue found.
- `019c657c-1de3-7663-8644-226a7e33a58c` | No UI/UX issue found.
- `019c6a45-f896-7842-8798-3ec3966d7332` | No UI/UX issue found.
- `019c6f34-f356-78c3-b52b-15d11f5e921f` | No UI/UX issue found.
- `019c7529-aa7d-79d1-a945-0f38ddc9fda8` | No UI/UX issue found.
- `019c757a-4441-77e2-ba5e-fb2a9ed67d8e` | No UI/UX issue found.
- `019c757a-6667-7812-a0b9-81d2678aa85b` | No UI/UX issue found.
- `019c7700-1655-7b40-ad13-618b3fcd7bf6` | No UI/UX issue found.
- `019c7919-4a00-7f21-a8f2-e9d4fffcdcbd` | No UI/UX issue found.
- `019c791e-6c04-7a02-bf32-65b4ca811c76` | No UI/UX issue found.
- `019c79a5-a788-7023-a79f-5fe87fbd0468` | No UI/UX issue found.
- `019c79e1-3ee4-7750-9f73-fb18d19c3625` | No UI/UX issue found.
- `019c7a09-8d4d-70d1-8279-e1b130ec66f5` | No UI/UX issue found.
- `019c7a3a-7e26-7161-aad0-9320e5a0b4a6` | No UI/UX issue found.
- `019c7a43-b17d-7642-8db2-2d38feb7842b` | No UI/UX issue found.
- `019c7a44-5bec-7990-9be8-a1f687c91755` | No UI/UX issue found.
- `019c7a96-9a95-7971-9de5-7bcd9367baec` | No UI/UX issue found.
- `019c7c60-3dd9-7802-b521-09dc6423aa5c` | No UI/UX issue found.
- `019c7c6a-7ab2-7fa0-83f6-935d8d9982e5` | No UI/UX issue found.
- `019c7e94-b141-7803-8479-4bd439bf7b03` | No UI/UX issue found.
- `019c7e96-50ab-7a42-b721-4186e5eb3115` | No UI/UX issue found.
- `019c7e98-4b0b-7a41-ad88-e7cdd8ea64fa` | No UI/UX issue found.
- `019c7ea8-bef7-7a22-943a-0025345790a3` | No UI/UX issue found.
- `019c7ec0-5db0-7db0-892e-b5af65bae018` | No UI/UX issue found.
- `019c7ec4-07bf-70c2-be71-202d71a2a4f4` | No UI/UX issue found.
- `019c7ec7-d1a1-7160-800c-5f3e81d58abf` | No UI/UX issue found.
- `019c7ec9-cc3f-7611-937e-d167cc28b851` | No UI/UX issue found.
- `019c7ed8-cd9c-7b81-ba85-7b645e0c912e` | No UI/UX issue found.
- `019c7eeb-c803-7273-9fd2-4b294d2c29d0` | No UI/UX issue found.
- `019c7f18-f467-7ea2-9f1d-89b20476f8bc` | No UI/UX issue found.
- `019c7f7e-870b-7b40-b8ea-87938538ff87` | No UI/UX issue found.
- `019c7f8f-9d77-7e50-b04e-3983402aae10` | No UI/UX issue found.
- `019c7f98-f1a4-7883-b297-fe343fbd7a9d` | No UI/UX issue found.
- `019c7fb2-1d9e-7cd3-94e3-2738f4068d3f` | No UI/UX issue found.
- `019c7fd6-cd81-7533-8ed8-e6e0def4adbb` | No UI/UX issue found.
- `019c7ffc-8270-7001-bc52-ee09c9f66acb` | No UI/UX issue found.
- `019c800b-967c-75d3-b670-ce1204f56173` | No UI/UX issue found.
- `019c8036-6bd5-7ed1-9666-f62db59d2655` | No UI/UX issue found.
- `019c80c7-1c75-7b30-8dbe-bd2cf6fd11a0` | No UI/UX issue found.
- `019c8820-6004-7181-9ba1-daf7239fa2a1` | No UI/UX issue found.
- `019c8826-2159-7ad1-8366-89589b7e10ce` | No UI/UX issue found.
- `019c897a-5cea-7492-9dcc-edfb13ea8e9c` | No UI/UX issue found.
- `019c897d-69f1-7073-b316-b36d9ca56fc0` | No UI/UX issue found.
- `019c89b3-c13b-7633-95ce-513bcd73fb5e` | No UI/UX issue found.
- `019c8fa7-a546-7940-84aa-bf4e60e5b2db` | No UI/UX issue found.
- `019c8fb0-87a8-7ed1-bae5-403b4dda82da` | No UI/UX issue found.
- `019c8fb5-45db-7303-99b8-1b58a547c4e2` | No UI/UX issue found.
- `019c8ffb-0899-74c0-a937-23eecf933693` | No UI/UX issue found.
- `019c9001-1c9e-7f42-a94b-599f2142fbaa` | No UI/UX issue found.
- `019c9034-32ab-7ce0-8627-15ab63d5945d` | No UI/UX issue found.
- `019c908b-c204-7ec2-8a47-a8616135792d` | No UI/UX issue found.
- `019c90e8-f2e3-7e23-8a4c-2b4ab61f0797` | No UI/UX issue found.
- `019c90ee-2b33-7df2-8b7d-79b5dc37a806` | No UI/UX issue found.
- `019c90f0-0940-7180-8bfa-5fd33c4faa0b` | No UI/UX issue found.
- `019c9464-4a46-7ee0-bb8c-717fced42eeb` | No UI/UX issue found.
- `019c94d3-528e-75e1-a95e-f646bb6096f5` | No UI/UX issue found.
- `019c9515-4c61-7310-acfb-23632cb2fc6a` | No UI/UX issue found.
- `019c9528-172a-7513-a92c-f8febcc5a33f` | No UI/UX issue found.
- `019c9596-73a5-7ea0-9591-ea1af260b6a7` | No UI/UX issue found.
- `019c95be-6f61-7a73-9728-c1f017a1e7ca` | No UI/UX issue found.
- `019c981a-90c3-7ea1-852a-d72ba6d40e40` | No UI/UX issue found.
- `019c9828-433f-7792-895f-939387497143` | No UI/UX issue found.
- `019c9911-aa7c-7f43-8108-348dbbda5e17` | No UI/UX issue found.
- `019c9930-1391-7582-9e8a-35fae3ae2bc1` | No UI/UX issue found.
- `019c9932-22f5-7870-9de6-557e8a16593b` | No UI/UX issue found.
- `019c9987-d5df-7772-b6cf-6995e5f201c7` | No UI/UX issue found.
- `019c99d8-4af9-76d3-a343-09a335801a17` | No UI/UX issue found.
- `019c9a3a-9b1b-7f13-aa0e-6abdc5366692` | No UI/UX issue found.
- `019c9a60-fdce-73d3-8dbc-983cf8aeb628` | No UI/UX issue found.
- `019c9ee2-e8f9-7ed3-8603-0dd4f09895af` | No UI/UX issue found.
- `019ca08e-1177-7141-a848-a157a080e450` | No UI/UX issue found.
- `019ca267-86fd-73d3-b635-7608423be358` | No UI/UX issue found.
- `019ca36e-8c7b-7b61-ac9b-d8a424c5a08d` | No UI/UX issue found.
- `019ca7dd-8216-77e1-bbfe-8e8758e651c6` | No UI/UX issue found.
- `019ca7f0-31e2-7833-8e21-dfea8a20e507` | No UI/UX issue found.
- `019ca859-df7f-73e0-b271-0d9081356b91` | No UI/UX issue found.
- `019ca866-7124-7540-9deb-b4dc2b286116` | No UI/UX issue found.
- `019ca870-b2f5-79a3-9cf5-472c02dc61e3` | No UI/UX issue found.
- `019ca893-cee7-7843-beba-f40d6cb5a1af` | No UI/UX issue found.
- `019ca8b3-62f0-7721-a821-bbda4ea044cb` | No UI/UX issue found.
- `019ca8b5-5308-7ba3-80a8-91abbd61a27c` | No UI/UX issue found.
- `019ca8b5-a45e-7481-88ae-1ec55578bb49` | No UI/UX issue found.
- `019ca986-c3dc-77e3-91cf-b1a9bd2fb2ad` | No UI/UX issue found.
- `019ca9f3-8e33-73d0-b68a-358667f16cea` | No UI/UX issue found.
- `019cad53-394c-74d0-9859-9635b48a03fb` | No UI/UX issue found.
- `019cad54-b14d-7e02-81c9-6b22dc6896e9` | No UI/UX issue found.
- `019cad5b-6537-7b92-8579-e9f00a507532` | No UI/UX issue found.
- `019cad74-8e9d-79c3-ac0e-c3cbbd0f9c8b` | No UI/UX issue found.
- `019cc735-c885-7981-83fc-b6da3b1cb7f8` | No UI/UX issue found.
- `019cd18f-a888-7ba3-836a-d080e8a646ce` | No UI/UX issue found.
- `019cd249-3202-7903-9b35-b39f722ae195` | No UI/UX issue found.
- `019cd739-6b32-7403-8871-4587ae75842c` | No UI/UX issue found.
- `019ce117-7975-7c12-a3c1-c8852e9e67dc` | No UI/UX issue found.
- `019ce214-ca01-72b1-9a79-614345ca09e9` | No UI/UX issue found.
- `019ce243-ae7c-7471-8ed6-ccb088b180b4` | No UI/UX issue found.
- `019ce90c-9c4a-7143-96d5-8fa2764d4572` | No UI/UX issue found.
- `019cf5d5-1394-7680-ab90-b3af3530cb22` | No UI/UX issue found.
- `019cf6d2-0b8a-71d3-b50a-72eb9b168f05` | No UI/UX issue found.
- `019d0511-9a81-7cb0-9eee-67761e98cb2d` | No UI/UX issue found.
- `019d0528-958b-7e20-b478-0a507b194f84` | No UI/UX issue found.
- `019d0532-cea8-7930-8b2b-f4a087d98987` | No UI/UX issue found.
- `019d075f-2b45-7f33-8cf3-267e79c6f503` | No UI/UX issue found.
- `019d09ba-95de-7443-a031-9d2516c5425e` | No UI/UX issue found.
- `019d09bb-8a9d-72c3-b709-b80d4cf6b65f` | No UI/UX issue found.
- `019d0a1a-70aa-7231-bb3b-ff84bd64563e` | No UI/UX issue found.
- `019d0ad8-60e5-7600-a9d7-b9e5ca944554` | No UI/UX issue found.
- `019d0b62-238c-77f3-8695-9cd3309958ef` | No UI/UX issue found.
- `019d0b66-694f-7711-88f9-8455fd11d52a` | No UI/UX issue found.
- `019d0bb0-a3bc-75f3-928a-8622fc6f0b26` | No UI/UX issue found.
- `019d0bb7-75eb-7982-8452-1d3200e49826` | No UI/UX issue found.
- `019d0bc2-8898-7ab0-a919-329337c0d625` | No UI/UX issue found.
- `019d0bca-ff49-7a02-bdfc-000135a4dc2a` | No UI/UX issue found.
- `019d0c72-41cf-7403-9d1e-d8f1fc16d91d` | No UI/UX issue found.
- `019d0c72-803e-7121-883d-94b1bb30d995` | No UI/UX issue found.
- `019d0ef1-ec3b-7d90-98e0-68cee77dfbb3` | No UI/UX issue found.
- `019d0ef3-db87-7240-8167-b281b6e3e60b` | No UI/UX issue found.
- `019d0f14-ee9d-7ba2-a04e-461e6809ebc5` | No UI/UX issue found.
- `019d0f6b-c968-7153-bbac-6a744cf5f962` | No UI/UX issue found.
- `019d0fa6-5807-7530-8a07-bcfbc74882c3` | No UI/UX issue found.
- `019d0fbd-04ca-77d3-b18b-a92be64ccbf9` | No UI/UX issue found.
- `019d100e-3ed5-7852-84e9-40f0556d704d` | No UI/UX issue found.
- `019d100e-aed0-71b1-8cd7-337013892e31` | No UI/UX issue found.
- `019d104f-7e0c-7451-ab81-271aec412518` | No UI/UX issue found.
- `019d1074-7a81-7a13-9d34-ce399753c359` | No UI/UX issue found.
- `019d117a-0b87-7552-b5bb-1277eb9d2fc8` | No UI/UX issue found.
- `019d1447-5bd5-7d43-84cf-ec956c87cb15` | No UI/UX issue found.
- `019d144c-f526-7380-991d-988ef57ed3c6` | No UI/UX issue found.
- `019d1503-a483-73b3-8d98-133e7ed456c8` | No UI/UX issue found.
- `019d16e6-cba0-7db2-8227-56ec4b9b464d` | No UI/UX issue found.
- `019d16e8-8c5b-73f3-8660-e4f72666236b` | No UI/UX issue found.
- `019d18f1-d54f-75f2-b893-1ffb6ef5ccf0` | No UI/UX issue found.
- `019d191f-7488-73d1-a772-f694c9faa9d5` | No UI/UX issue found.
- `019d1998-e85c-75f3-ad64-e67eadf8d75f` | No UI/UX issue found.
- `019d199b-d514-7891-99d1-f261a7feb213` | No UI/UX issue found.
- `019d1a31-81a9-7233-86c4-c0d89045632b` | No UI/UX issue found.
- `019d1a3a-5621-7443-bc5d-5b9da3eaa864` | No UI/UX issue found.
- `019d1a4e-f254-7c42-a901-58d2d8ac9f10` | No UI/UX issue found.
- `019d1ac6-5b92-74d2-9519-53b8df36731d` | No UI/UX issue found.
- `019d1acc-de1c-78d3-bfdc-6682552af25b` | No UI/UX issue found.
- `019d1f5b-6d3c-7393-aecf-fc0fcd3e7951` | No UI/UX issue found.
- `019d1f82-8255-7c20-a4c5-0203ec657330` | No UI/UX issue found.
- `019d1fb4-12fb-7443-ba29-2a156d635e93` | No UI/UX issue found.
- `019d1ff5-41d8-7801-83ec-6f0984eabb56` | No UI/UX issue found.
- `019d2488-db3d-7820-951d-ae9c7bb2676c` | No UI/UX issue found.
- `019d2653-9139-7143-96cf-90dc54e2a88d` | No UI/UX issue found.
- `019d29c8-ffd0-7c40-9200-d7d7501f835c` | No UI/UX issue found.
- `019d29d6-477e-74c1-aa18-d07e4823e3ec` | No UI/UX issue found.
- `019d29e2-1298-7300-8b06-4a5abb0e978d` | No UI/UX issue found.
- `019d29f1-a463-7c70-a3ad-626b04046182` | No UI/UX issue found.
- `019d29fb-3dda-7680-a598-4cfac587cd4c` | No UI/UX issue found.
- `019d2a18-e89c-7402-a092-ea24306a0b30` | No UI/UX issue found.
- `019d2a5e-1106-7c10-8ed8-d24fecd9c0e2` | No UI/UX issue found.
- `019d2a6b-4331-7e60-8d5e-6eb8313f2035` | No UI/UX issue found.
- `019d2a76-7c01-75e2-9512-1c6b1a8481a8` | No UI/UX issue found.
- `019d2a78-0c79-7d23-a260-1d2d2b4d0f7c` | No UI/UX issue found.
- `019d2aa5-4b64-7890-a99a-b7a0e02c4849` | No UI/UX issue found.
- `019d2aa8-b553-75d1-8de2-7272a0eaaea5` | No UI/UX issue found.
- `019d2ab1-9dd3-70a2-8874-9ad4df97e088` | No UI/UX issue found.
- `019d2b2e-91d2-7c70-90b5-09043b6c4ff2` | No UI/UX issue found.
- `019d2ec9-a8b1-7cd3-bb6e-b3fff0775f0b` | No UI/UX issue found.
- `019d2f8d-a163-7082-93a1-fcf44ead13fd` | No UI/UX issue found.
- `019d2ff6-1b7a-7441-9d56-992703b1d40f` | No UI/UX issue found.
- `019d303e-8684-7980-9772-221f9bb459c8` | No UI/UX issue found.
- `019d306f-3d86-7671-90c4-a569ee988857` | No UI/UX issue found.
- `019d3706-7b91-7241-9c9f-bbb6a1fa5b1c` | No UI/UX issue found.
- `019d3709-051d-7301-b2a0-02c38a0e0985` | No UI/UX issue found.
- `019d3726-7648-7163-9172-856e52a90fae` | No UI/UX issue found.
- `019d389c-fdd9-7361-be90-b54449317e69` | No UI/UX issue found.
- `019d3d5d-7670-79a3-98fb-4aa6c0e1367b` | No UI/UX issue found.
- `019d3d66-33ad-7563-b95c-43a4cebb7018` | No UI/UX issue found.
- `019d3d66-a204-7531-8218-7d9f34ba5e6b` | No UI/UX issue found.
- `019d3d67-0539-73d2-8ccc-2830c27de92b` | No UI/UX issue found.
- `019d3e77-4298-7e60-b031-2cb46546bafd` | No UI/UX issue found.
- `019d4364-53e0-7df3-8573-c108b28db591` | No UI/UX issue found.
- `019d4369-1572-77f2-ab69-44b4a7348af1` | No UI/UX issue found.
- `019d4388-488a-78d3-9cc3-046fa784890c` | No UI/UX issue found.
- `019d43a0-9cba-7df0-afc4-91103077efe8` | No UI/UX issue found.
- `019d4868-b7ff-7743-8246-76ea234a0773` | No UI/UX issue found.
- `019d4d1e-bf31-7550-8116-f2654014ec7c` | No UI/UX issue found.
- `019d4dc4-914e-7912-aae5-b8021b4973cf` | No UI/UX issue found.
- `019d4e35-c559-7232-ae76-6b5ab334f0b8` | No UI/UX issue found.
- `019d4eb1-8d6b-7192-8ffb-22deeead662c` | No UI/UX issue found.
- `019d4f51-c903-7e73-a4f0-f1d1d42bcbba` | No UI/UX issue found.
- `019d5430-7b59-78a2-8ced-f6488ba97e7e` | No UI/UX issue found.
- `019d5706-019e-7aa2-af37-3a7c53eb31b1` | No UI/UX issue found.
- `019d636a-628d-7f60-8936-e9e2637a026c` | No UI/UX issue found.
- `019d6713-37ce-7720-9faa-73c92e919e97` | No UI/UX issue found.
- `019d6724-7531-79e1-8f01-d5009d91318f` | No UI/UX issue found.
- `019d6c60-8f36-74e0-9be6-c4af43d77204` | No UI/UX issue found.
- `019d6c8e-0f4b-7742-a086-9fdb21cc62d7` | No UI/UX issue found.
- `019d6d01-77d8-7ed1-b8d3-b512139ecd15` | No UI/UX issue found.
- `019d6d47-cbeb-7a01-9349-8ad7b520919b` | No UI/UX issue found.
- `019d6d6f-b9c2-7343-b4f8-aeaa753c3f1c` | No UI/UX issue found.
- `019d6d85-612d-7622-909b-b22f7a04681b` | No UI/UX issue found.
- `019d6da8-8dde-7f32-be86-7f473baf85ba` | No UI/UX issue found.
- `019d6db1-d0e3-7722-bd33-27c2ec279816` | No UI/UX issue found.
- `019d6dbd-f288-74e1-9afa-f98dbd8c74fa` | No UI/UX issue found.
- `019d6f80-a10d-7b10-ac88-4dd9ad89e780` | No UI/UX issue found.
- `019d7151-fed2-75a1-8efe-69fc947979f4` | No UI/UX issue found.
- 2026-04-13: Restored the HelloTalk single-image layout on XR slide 8 after a page-numbering mix-up briefly replaced that media with the wrong two-panel comparison visual.
- 2026-04-13: Replaced the XR reason-slide comparison visuals with the user-supplied slide7 assets, keeping the front-left / back-right overlap hierarchy while preserving the existing copy layout.
- 2026-04-13: Expanded the XR reason-slide visual from a two-card overlap into a three-card stack by inserting a centered middle reference image while preserving equal-height treatment and the existing left/front emphasis.
- 2026-04-13: Swapped the XR HelloTalk slide imagery to the user-supplied `hellotalk.jpg` asset so the current HelloTalk target sequence stays visually consistent even as slide ordering changes.
- 2026-04-13: Increased the XR HelloTalk target-slide image scale substantially on desktop so the updated `hellotalk.jpg` asset reads as a primary visual instead of a small side reference.
- 2026-04-13: Split the two XR HelloTalk visuals into separate image modifier classes so each slide's HelloTalk asset can be repositioned independently without affecting the other.
- 2026-04-13: Restored the first HelloTalk target slide to the original Voiceroom image and split each HelloTalk media wrapper into dedicated position classes so their top/right coordinates can be adjusted independently.
- 2026-04-13: Added explicit `top`, `right`, and `width` defaults to the two HelloTalk-specific media classes so slide-level positioning can be tuned directly without tracing shared base styles.
- 2026-04-13: Moved the two-card HelloTalk overlap onto the second HelloTalk slide, restoring the first HelloTalk slide to a single Voiceroom image and keeping `hellotalk1.jpg` front-left with `hellotalk2.jpg` back-right on the following page.
- 2026-04-13: Split the newly added XR `gaming.jpg` slide visual onto its own `slide-side-media--gaming` and `slide-preview-image--gaming` classes so that page can be repositioned independently from the HelloTalk slides.
- 2026-04-13: Moved the XR `gaming-stack` visual pair one slide later so the earlier Mingle-positioning slide returns to a single `gaming.jpg` reference while the following dependency proof slide carries the `hellotalk-voiceroom2.png` back-left and `mingle.png` front-right overlap.
- 2026-04-13: Matched the front `mingle.png` width to the back HelloTalk reference on the XR dependency slide and wrapped the Mingle screenshot in a CSS iPhone-style frame so it reads as an actual in-device product view.
- 2026-04-13: Added a dedicated `reddittalk.jpg` visual to the new XR absorption-plan slide with its own wrapper and image classes so that slide's media can be repositioned and resized independently from the other stacked reference slides.
- 2026-04-13: Reassigned the media sequence across the three HelloTalk follow-up slides so the extension-positioning slide and the dependency-proof slide both use the stacked HelloTalk-plus-Mingle visual, while the absorption-plan slide uses the standalone `reddittalk.jpg` reference.
- 2026-04-13: Turned the XR absorption-plan slide into a two-up vertical reference stack using `reddittalk.jpg` on top and `clubhouse.jpg` below, with a dedicated community-stack wrapper so that slide's position and each image size can be tuned independently.
- 2026-04-13: Swapped the media sets between the XR extension-positioning slide and the XR absorption-plan slide so the former now uses the HelloTalk-plus-Mingle overlap and the latter uses the vertical RedditTalk-plus-Clubhouse stack, while leaving the middle dependency-proof slide unchanged.
- 2026-04-13: Updated the XR dependency-proof slide to use the same HelloTalk-plus-Mingle overlap as the extension-positioning slide, leaving the absorption-plan slide as the only page that uses the RedditTalk-plus-Clubhouse vertical stack.
- 2026-04-13: Removed the two side reference images from the XR target-customer-4 slide and restored its copy block to the standard full-width text layout.
- 2026-04-14: Gave the XR table-of-contents slide its own typography treatment so the kicker reads like a large section heading while the numbered list sits below as a lighter, smaller subhead distinct from regular slide titles.
- 2026-04-14: Kept the XR deck's global text anchor at its previous position and raised only the table-of-contents slide by giving `slide-copy--toc` its own tighter top margin.
- 2026-04-14: Refined the XR table-of-contents typography so the kicker keeps the normal kicker styling and underline while only scaling up its size and weight, and the numbered title list keeps the normal title voice with just a modest reduction in size and weight.
- 2026-04-14: Increased the XR table-of-contents kicker size again and tightened the kicker-to-underline gap so the heading reads more assertively without changing the rest of the deck.
- 2026-04-14: Increased the vertical gap between the XR table-of-contents kicker block and the numbered title list so the two layers read as clearly separated elements.
- 2026-04-14: Further increased the XR table-of-contents kicker-to-list spacing so the large kicker block and the numbered agenda read as two clearly separated tiers.
- 2026-04-14: Rebuilt the XR table-of-contents agenda as a two-column layout so the numeric indices align cleanly on the right while the labels begin from a consistent left edge.
- 2026-04-14: Switched the XR table-of-contents numeric column to left alignment as well, so both the `1.` through `6.` markers and the section labels now start from fixed left edges.
- 2026-04-14: Increased the deck-wide XR kicker size to a body-adjacent scale so section labels feel more legible and intentional across the presentation.
- 2026-04-14: Added an explicit top margin to the XR table-of-contents title block because the kicker is absolutely positioned there, restoring visible separation between the large `목차` kicker and the numbered agenda list.
- 2026-04-14: Inserted a new XR customer-framing slide between the `2. 고객` and `3. 경과` divider pages, using a dedicated right-side stacked hurdles module with subtle accent rails so the two core barriers read as structured points without turning into heavy cards.
- 2026-04-14: Duplicated the XR customer-hurdles slide once more before `3. 경과`, then added muted and focused state variants so the top hurdle can read as temporarily inactive while the lower hurdle carries the key-color emphasis.
- 2026-04-14: Added a new XR problem slide before the `3. 경과` divider to explicitly frame existing translation tools as inadequate for socializing contexts, using the standard left-aligned text layout with no side media.
- 2026-04-14: Added a follow-up XR cause slide after the social-translation problem framing, keeping the standard left-aligned text-only layout so the narrative can narrow from the problem statement into the missing social-specific UI/UX explanation without adding extra visual noise.
- 2026-04-14: Added a new XR solution-UI slide after the cause framing, pairing the left-aligned headline with a dedicated right-side stack of seven compact capability modules so the required social-translation UX features read as a structured product checklist rather than body copy.
- 2026-04-14: Tightened the XR customer-hurdles side module by narrowing its overall width, reducing the right inset, enlarging the description copy, and rewriting each description into explicit two-line statements so the two barriers read more clearly at presentation distance.
- 2026-04-14: Moved the XR customer-hurdles side module much further left on both hurdle slides by increasing its right offset substantially, so the stack no longer hugs the viewport edge.
- 2026-04-14: Matched the second XR customer-hurdles slide to the updated compact module styling and dimmed only the `문화적 장벽 존재` line so the focused second hurdle can still show one remaining inactive sub-barrier.
- 2026-04-14: Reworked the XR solution-UI side stack to sit further left with a narrower column, swapped the dot bullets for the same vertical accent-rail language used on the customer hurdle slides, tightened the internal right padding, and added a muted `등등등...` tail to imply more situation-specific UX cases.
- 2026-04-14: Added a floating brand-collage module to the XR social-translation problem slide, scattering five translation-service wordmark chips under a large red X so the page can visually reject the existing tool set without relying on another screenshot grid.
- 2026-04-14: Replaced the XR problem-slide brand chips with user-provided app icons for ChatGPT, Google Translate, Apple Translate, Transync AI, and Felo Translator, switched every label to English, and tightened the collage so the larger logo-led chips sit closer together while still reading as a scattered cluster under the red X.
- 2026-04-14: Added Papago to the XR translation-tool rejection collage so the problem slide now rejects six recognizable translation products instead of omitting the strongest local default.
- 2026-04-14: Repositioned the XR Papago chip into the upper-middle cluster so it now sits beside Apple Translate and below Google Translate instead of reading like a lower-row outlier.
- 2026-04-14: Recovered the XR deck after a stale-editor overwrite by restoring the latest slide styling and reapplying the customer-hurdle stack's corrected `top` clamp so the side module keeps the intended vertical anchor.
- 2026-04-14: Tightened the XR solution-UI stack again by shrinking the overall column to roughly sixty percent of its previous width, enlarging the module labels to kicker-scale, trimming the internal right padding, and centering the `등등등...` tail with a larger gap beneath the list.
- 2026-04-14: Reframed the XR solution-UI slide as a cause slide by renaming the kicker to `원인` and adding a short explanatory body sentence so the deck more clearly states that social translation only works when the full required UI/UX set is satisfied.
- 2026-04-14: Dropped the XR customer-hurdles side stack lower on both slides and updated the focused second-hurdle subline from `문화적 장벽 존재` to the more concrete `대화 소재의 부재`.
- 2026-04-14: Renamed both XR customer-hurdles slide kickers from `고객` to `문제` so those pages frame the barriers explicitly as problem-definition slides instead of audience slides.
- 2026-04-14: Refined the customer-hurdles wording on both XR problem slides by changing `언어 장벽 존재` to `언어 장벽의 존재`, matching the more noun-phrase style used elsewhere in the deck.
- 2026-04-14: Shifted the XR solution-UI side stack much further left by substantially increasing its `right` offset, so the narrow module column no longer sits awkwardly against the viewport edge.
- 2026-04-14: Reduced the XR translation-tool collage footprint by shrinking both the side module width and the corresponding text-width subtraction, so the problem-slide title gets more breathing room and avoids an extra wrap on its second line.
- 2026-04-14: Split the XR solution-UI side stack into two columns so the lower four capabilities (`푸쉬앤톡 번역`, `선택적 음성 출력`, `백그라운드 노트테이킹`, `등등등...`) can rise into a right-hand column instead of extending the single vertical list too far downward.
- 2026-04-14: Added a new XR cause slide after the UI/UX capability stack, using a compact four-item logo list to call out the cost and quality limitations of Felo Translator, Google Translator, Apple Translator, and Papago.
- 2026-04-14: Pulled the two-column XR solution stack back toward the right edge by nearly eliminating its right inset, and converted `등등등...` from a boxed module into plain trailing text beneath the second column.
- 2026-04-14: Rebalanced the two-column XR solution stack by restoring similar left/right and top/bottom breathing room, and centered `등등등...` inside the second column's fourth slot so it reads like a proper trailing placeholder rather than a loose note.
- 2026-04-14: Inserted a new centered XR Mingle positioning slide between the quoted solution slide and the later vision slide, using a simple kicker-plus-three-line title to frame Mingle explicitly as a mobile translation app for socializing.
- 2026-04-14: Dropped the XR solution stack slightly lower again and normalized both column row heights so `등등등...` can sit centered within the second column's fourth row at the same vertical level as `3개국어 동시 스위칭`.
- 2026-04-14: Refined the XR tool-limitation logo list by moving the module further left, narrowing each card column, enlarging both the logo-heading row and description copy, adding more breathing room after the accent rail, and clarifying the Google limitation copy to `대화 번역은 한국어 지원 안함`.
