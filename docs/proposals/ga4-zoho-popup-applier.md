You're working in the movingwalls.com website codebase (Next.js). Make one small tracking change to the Zoho form pop-up. Change nothing else — no form fields, copy, design or behaviour.

## Background

Our enquiry forms are Zoho Forms loaded in an iframe from `forms.zohopublic.com`, opened by the site's form pop-up (look for `ZohoPopupProvider` and the form settings with `renderMode: "iframe"`, `formUrl`, `displayMode: "modal"` or `"iframe"`). The Zoho form page runs our GA4 tag (`G-LPHVR00DLC`) and fires the lead events (`generate_lead_india`, `generate_lead_malaysia`, …).

Because the iframe is a different domain, GA4 treats it as a new visitor. Every lead is credited to the Zoho form instead of the movingwalls.com page the visitor was on, and each form opened adds an extra session. GA4's cross-domain settings are already done (`movingwalls.com`, `forms.zohopublic.com`, `forms.zoho.com`). GA4 does not decorate iframe URLs on its own, so the site has to.

## The change

Wherever the iframe `src` is set from `formUrl`, add two URL parameters:

1. `_gl` — GA4's cross-domain linker value, so the Zoho page continues the same visitor and session.
2. `referrername` — the full URL of the page the visitor is on, so Zoho records which page the enquiry came from.

Rules:
- **Build the `src` when the pop-up opens, not at page load.** The `_gl` value expires after about two minutes. For forms embedded inline (`displayMode: "iframe"`), build it when the iframe mounts.
- **Never break the form.** If GA4 isn't loaded (ad blocker, consent denied) or anything throws, use the plain `formUrl` plus `referrername`.
- Keep any query parameters `formUrl` already has.

Suggested helper (adapt to the codebase's style and file layout):

```ts
/** Adds GA4's cross-domain linker and the current page to a Zoho form URL. */
export function decorateZohoUrl(formUrl: string): string {
  let url: URL
  try { url = new URL(formUrl) } catch { return formUrl }
  url.searchParams.set('referrername', window.location.href)
  try {
    const bridge = (window as any).google_tag_data?.glBridge
    if (bridge?.generate) {
      const cookies: Record<string, string> = {}
      for (const c of document.cookie.split('; ')) {
        const i = c.indexOf('=')
        const name = c.slice(0, i)
        if (name === '_ga' || name.startsWith('_ga_')) cookies[name] = c.slice(i + 1)
      }
      if (Object.keys(cookies).length) url.searchParams.set('_gl', bridge.generate(cookies))
    }
  } catch { /* tracking must never stop the form */ }
  return url.toString()
}
```

Then use `decorateZohoUrl(form.formUrl)` as the iframe `src`, computed in the open handler or effect, not in a module-level constant or at server render. This runs only in the browser, so guard it if the component can render on the server.

## Check it before publishing

1. Open `/locations/india`, open the enquiry form, inspect the iframe. Its `src` must contain `_gl=` and `referrername=https%3A%2F%2Fwww.movingwalls.com%2Flocations%2Findia`.
2. With an ad blocker on, the form must still open and submit normally (no `_gl`, but `referrername` still there).
3. In GA4 → Admin → DebugView, open the form and submit **one** test enquiry, with "TEST" in the name and company. The lead event should appear in the **same session** as the `/locations/india` page view, with no new `session_start` from `forms.zohopublic.com`. Tell Rif, so the TEST lead is deleted from the CRM.
4. Repeat step 1 on one modal form and one inline form (for example `/locations/australia`).

## Done when

The change is live, steps 1–4 pass, and you've told Rif. About 48 hours later, GA4 → Reports → Landing page should show key events against `/locations/...` pages. Rif checks that.

Don't change anything in GA4, GTM or Zoho. Those settings are already done.
