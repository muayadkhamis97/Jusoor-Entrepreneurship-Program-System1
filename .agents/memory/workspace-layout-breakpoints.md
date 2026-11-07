---
name: Workspace content-width breakpoints
description: Responsive layout rules for staff pages that share space with a persistent sidebar.
---

For staff workspace pages with a persistent sidebar, choose responsive breakpoints from the page's available content width, not the browser viewport. Keep important action labels visible and grouped; don't let narrow table columns wrap them into scattered lines.

**Why:** The fixed sidebar leaves significantly less room than the viewport suggests. On Team access, a 1024px-wide browser still had too little space for the data columns and actions, making the redesigned account rows difficult to scan.

**How to apply:** Use a page-level inline-size container query for directory/table layouts. Check the intermediate desktop width where the sidebar is still present, not only a wide desktop and a narrow phone.
