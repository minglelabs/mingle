# Operator content reference

What real posts, photos and comments look like on language-exchange apps, as a guide for what the operator-account generators should produce. These are patterns observed by reading feeds; no post text, photo, name or handle from another service is stored here or anywhere in the repo, and generated content must be original.

## Sources and limits

| Source | When | Sample | Notes |
| --- | --- | --- | --- |
| HelloTalk, Moments → 추천 | 2026-10-04 | about 80 feed screens, about 60 posts, 72 comments | Feed of a Korean man learning Chinese, so it is almost entirely Chinese women in their twenties writing in Korean. Other viewers see a different mix. |
| Kfriends, 스토리 → 전체 | 2026-10-04 | first screen only (scrolling did not work through iPhone Mirroring) | Both visible posts were low quality (sexual-chat bait, a throwaway-account notice). Not usable as a reference yet. |
| Threads search (점심, 영어공부) | 2026-10-04 | about 20 posts | General SNS, not language exchange. Useful for native casual Korean only. |

## HelloTalk posts

**Language.** Most posts are written in the language the author is learning, not their own. A Chinese user's post is usually in Korean: polite textbook endings, slightly off particles and word choice, sometimes stiff written style (`~습니다`) mixed with chat style. Some posts are in the author's own language (a Chinese caption or proverb), some are bilingual with the same line in two languages, and a few are one English line.

**What they are about**, roughly by share:

| Kind | Share | Shape |
| --- | --- | --- |
| Self-introduction and looking for friends or a language partner | about half | Who I am, what I am learning, what I can teach, "please message me". Often names a preference (same gender, lives in Korea, likes K-pop). |
| Photo with a short caption | about a quarter | A few words to one line: a mood, a place, "photo dump", a season remark. |
| Request for recommendations or meetups | one in ten | Places to take photos, where to go alone on a holiday, a clinic, "anyone want to meet near DDP tomorrow". Concrete places. |
| Study life | one in ten | An exam result, how hard listening has become, forgetting the language after going home, asking how to study. |
| Daily remark | a few | Bought glasses today, the wind by the river is strong. |

Common details: a list-style introduction (MBTI, birth year, nationality, height, home city on separate lines); a first-post badge; one to three topic tags under the text (언어교환, 한국어연습, 한국유학, 여행기, a city or neighborhood); emoticons and `~~`, `ㅎㅎ`, `ㅠㅠ` even from learners; length mostly one to four lines, with long posts cut after about five lines.

**Photos on posts.** Nearly every post has photos; text-only posts are rare. Counts seen: one photo (about a third), two or three (about a third), a grid of four to nine (about a third). What they show:

- Selfies and portraits of the author: indoors at home or a cafe, mirror selfies with the phone covering part of the face, full-body outfit shots taken by a friend, close-ups with a beauty filter. This is the majority.
- Sets from one outing: the same person in several poses, mixed with scenery from the same place (sea, pool, sunset, city view, flowers).
- Food on a table, a drink, a dessert.
- Objects and pets: a cat, a plush toy, a handwritten study note, a test score sheet.
- An occasional illustration, sticker or screenshot among the photos.

Photos look like phone photos: uneven light, tilted, cropped heads, night shots with noise, black-and-white filters, one blurry frame left in a set.

**Profile pictures.** Small circles, so only the gist reads: a face close-up or a selfie for most; a full-body or far-away shot for some; a pet, a cartoon character, an illustration or an object for a noticeable minority. A flag badge sits on the picture.

**Comments.** Median about 20 characters; nine in ten are under 70. Kinds: a compliment ("pretty", "nice pics", a row of heart emoji), an answer to the post's question (a list of neighborhoods, "bring a cardigan, it is already cold"), an offer ("talk with me!", "let's be friends"), a short joke or teasing, a correction or encouragement of the learner's writing. Comments come in several languages under one post (Korean, Chinese, English, French). Many posts get an encouraging comment from the app's own AI account. Typical counts: 20 to 150 likes and 1 to 7 comments; a few posts reach several hundred likes.

## Native casual Korean (Threads)

Line break after every clause; note-style endings (`~함`, `~음`, `~는 거임`, `~더라`); stories quote what someone said word for word; posts end with a rhetorical question to invite replies rather than a survey question; popular posts run five to ten lines; `ㅋㅋㅋ` and `ㅠㅠ` freely. A fair share of what search returns is promotion and should not be imitated.

## What this means for the generators

1. **Language of the post.** Accounts whose persona is learning a language should write a share of their posts in that language, at a learner's level. Today every post is in the account's first language. Needs the post language stored per reserve post.
2. **Topic mix.** Raise self-introduction and friend-seeking far above the current weight, add the list-style introduction and the meetup or place-recommendation request, and allow one to three topic tags.
3. **Photos on posts.** A text-only feed is itself unusual. Most posts need one to nine phone-style photos that match the caption; photo sets should repeat the same person and place.
4. **Comments.** Short, mostly compliments, answers and offers to chat, in mixed languages.
5. **Profile pictures.** The existing taxonomy (face, partly hidden, from behind, body, object, animal, scenery, several people) covers what was seen; cartoon or illustration avatars are more common than its 1% "other" share.
