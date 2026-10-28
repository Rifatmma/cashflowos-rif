# Reclaim lost backlinks with six redirects (planner step `nb-mentions`)

Checked 28 Oct 2026, read-only, in Semrush Backlink Analytics → Indexed Pages (movingwalls.com), then each URL tested live. Nothing was sent to anyone.

**Finding:** every old `/market/...` address from before the March site move correctly 301-redirects to its `/locations/...` page, so those links still count. But six addresses that other sites link to now return **404 Not Found**, so their links pass nothing. A 301 redirect to the current page gets them back, with no outreach.

| Old address (404 today) | Backlinks | Linking domains | Redirect to |
|---|---:|---:|---|
| /moving-walls-plan-buy-and-measure-outcome-based-outdoor-advertising | 17 | 10 | /platform |
| /outernet | 12 | 9 | /ebooks/unlocking-the-power-of-the-outernet-2023 |
| /outernet-dooh-impression-multiplier-ebook | 9 | 5 | /ebooks/unlocking-the-power-of-the-outernet-2023 |
| /outernet/members | 6 | 4 | /ebooks/unlocking-the-power-of-the-outernet-2023 |
| /outernet/case-studies | 4 | 3 | /case-studies |
| /video-outside-playbook | 5 | 3 | /ebooks/msap-mw-video-outside-playbook |

**About 53 backlinks from about 34 domains.** Moving Walls has 1.2K referring domains, and 80% of them have an Authority Score of 10 or less, so links from real sites are worth recovering.

**Also seen, no action needed:** `/market/australia/canberra/` and `/market/australia/melbourne/` redirect to `/locations/australia` because there are no Australian city pages. That's fine.

**Unlinked brand mentions:** Semrush's Backlink Analytics doesn't list unlinked mentions. That needs the separate Brand Monitoring app, which isn't set up on this account. The redirect fix above is the cheaper and surer win, so it comes first.

## Applier prompt (for Dinesh)

Add these six permanent (301) redirects to the website, then check each old address opens the new page:

1. `/moving-walls-plan-buy-and-measure-outcome-based-outdoor-advertising` → `/platform`
2. `/outernet` → `/ebooks/unlocking-the-power-of-the-outernet-2023`
3. `/outernet-dooh-impression-multiplier-ebook` → `/ebooks/unlocking-the-power-of-the-outernet-2023`
4. `/outernet/members` → `/ebooks/unlocking-the-power-of-the-outernet-2023`
5. `/outernet/case-studies` → `/case-studies`
6. `/video-outside-playbook` → `/ebooks/msap-mw-video-outside-playbook`

If redirects live in code (`next.config` / middleware in prince-mw/sanity), make the change on a branch off `staging` and open a pull request to `staging`. If they are a Sanity redirect document, create them there as drafts and publish.
