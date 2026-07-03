---
name: bug-anchor-download-auth
description: Authed file-download routes rendered as <a download> links 401 because anchor navigation carries no Authorization header
metadata:
  type: feedback
---

When a route is protected by `requireTeamAuth` (Bearer-header only) but the frontend
exposes it as a plain `<a href download>` link, the download always 401s: browser
anchor navigation cannot attach an `Authorization: Bearer` header (the token lives in
localStorage and is only injected by the `api()` fetch wrapper).

**Why:** Caught in the NODE ZERO participant portal — stage attachment downloads
(L01/L04/L06/L07/L09, all solve-critical) were unreachable. The organizer side had
already solved this by passing `?key=` in the URL for its download/EventSource links.

**How to apply:** For any authed resource fetched via anchor navigation or EventSource
(not fetch), the credential must ride in the query string. The fix pattern here:
`requireTeamAuth` accepts `?token=` as a fallback to the Bearer header, and the frontend
appends `?token=<session>` to the href. Gating/traversal checks still run afterward, so
this doesn't weaken authz. Related: organizer routes already accept `?key=` for the same
reason (SSE + downloads).
