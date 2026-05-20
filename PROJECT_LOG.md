# Project Log

## 2026-05-20
- Improved fallback clustering and label refinement to avoid generic bubble text and keep labels domain-relevant.
- Added resilient idea-generation retry and local fallback to prevent "failed to generate" dead ends.
- Sharpened bubble label rendering with multi-line layout and high-contrast text styling.
- Centered multi-line bubble labels vertically so text stays inside circles.
- Switched bubble label layout to pixel-based positioning and clamped count text to stay within circle bounds.
- Split two-word labels into two lines for small bubbles and reduced font size to avoid ellipsis.
- Added click-outside dismissal for the idea panel.
- Tightened fallback label heuristics and domain pain defaults to avoid off-topic idea copy.
- Targeted Reddit fetching with domain subreddits, stronger pain queries, and better post text composition.
