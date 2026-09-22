# Standalone previews

Three self-contained HTML files. Open any of them directly in a browser — no
build step, no server, no dependencies beyond Three.js and Google Fonts over
CDN.

They are **demos, not the app**. Data is mocked inline so the interactions can
be judged without a database; the real components live in `../client/src`.

| File | What it shows |
|---|---|
| `01-homepage-interactions.html` | The WebGL barber pole reacting to scroll and cursor, the drag-to-reveal before/after slider, and the 15-minute offer countdown with its colour break under 60s |
| `02-admin-and-booking.html` | The mobile admin timeline where gaps are rows, the flash-slot two-step, the gallery uploader, and the client booking sheet with its waitlist branch |
| `03-pin-menu-schedule.html` | The PIN keypad with the real lockout ladder (**PIN: 492137**), services CRUD with the live "fits in your week" figure, and the precise block/open range picker |
