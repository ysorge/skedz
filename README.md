# Skedz

Skedz is an offline-first Progressive Web App (PWA) for viewing, filtering and personalizing conference schedules.

It was created during the [39C3 congress](https://events.ccc.de/congress/2025/) as an open source experiment to explore whether a fully client-side, self-managed schedule app can work reliably without any backend server.

Skedz is inspired by [Calendify](https://calendify.com/) schedules, but runs completely locally on the user’s device.

![Skedz screenshot](public/screenshots/home.png)

## Supported Formats

| Format | Extensions | Description |
|--------|------------|-------------|
| **JSON (schedule.json)** | `.json` | JSON format used by Frab, Pretalx, and others |
| **XML (schedule.xml)** | `.xml` | XML format used by Frab, Pretalx, Pentabarf, and others |
| **XCal** | `.xcal`, `.xcs` | XML-based iCalendar format |
| **iCal** | `.ical`, `.ics` | Standard iCalendar format |


## Getting started

### Option A: Use the hosted version

- PWA: https://app.skedz.org
- Project website: https://skedz.org

### Option B: Run locally

If not available yet, install [Node.js](https://nodejs.org/) (LTS version recommended), [npm](https://www.npmjs.com/get-npm), and [git](https://git-scm.com/). 
For example, on Debian/Ubuntu:

```bash
sudo apt update
sudo apt install nodejs npm git
```

Then clone the repository:

```bash
git clone https://github.com/ysorge/skedz.git
cd skedz
npm install
```

### Development mode

Start a local development server with hot reload:

```bash
npm run dev
```

Open the URL shown by Vite (usually http://localhost:5173).

#### Production build (PWA)

Build the production version including service worker support:

```bash
npm run build
npm run preview
```

Then open the preview URL (typically http://localhost:4173).  
You can install the app from the browser menu ("Install app").

Note: Opening the built files directly via `file://` will not work correctly because service workers require HTTP.


## App features

### Core functionality

- Load frab-compatible `schedule.json` endpoints (e.g. congress Fahrplan)
- Platform-independent PWA (mobile & desktop)
- Offline-first: schedules and personal choices are stored locally
- Grouped-by-day session list ordered by time

### Filtering and views

- Filters: track, day, room, type, language, search term
- Timezone handling: view schedule in event timezone or convert to device timezone
- Multiple view modes: compact table, detailed list

### Personal schedule

- Like sessions to build your own schedule
- Session detail screens with full description
- Local notifications for liked sessions (local reminders)
- Export of liked sessions (iCal/JSON/CSV)


## Offline-first behavior

The app shell is cached by the service worker. Schedules are stored in an IndexedDB after loading from URL or importing a file. On next launch (even offline), the cached schedule loads instantly.

### Direct schedule import via URL

You can share a schedule by adding a `?url=` parameter to the app URL. This automatically loads the schedule from the specified endpoint. Example:

```
https://app.skedz.org/?url=https://api.events.ccc.de/congress/2025/schedule.json
```

This is useful for sharing schedules with others or bookmarking schedules.

### Working around CORS restrictions

Some schedule endpoints don't allow browser access due to CORS (Cross-Origin Resource Sharing) restrictions. If loading fails with a CORS error, you have two options:

1. **Download and import manually**: Download the schedule file and import it via "Import file".
2. **Use a CORS proxy**: Deploy the companion [Skedz CORS Proxy](https://github.com/ysorge/skedz-cors-proxy) or use another CORS proxy and use it to access CORS-protected schedules.

Example with CORS proxy (here hosted at `https://cors.skedz.org`):

```
https://app.skedz.org/?url=https://cors.skedz.org/https://fosdem.org/2026/schedule/xml
```

The proxy adds the necessary CORS headers and includes a domain whitelist for security.

## Community projects

Skedz is intentionally hackable. Ports, integrations, and other side projects are welcome. 

### Skedz for Delta Chat (webxdc)

A webxdc port to use Skedz inside chats (Delta Chat). View conference schedules and share liked sessions with everyone in the chat. 

- App on webxdc.org: [https://webxdc.org/apps/#link2xt-skedz](https://webxdc.org/apps/#link2xt-skedz)
- Source code: [https://codeberg.org/link2xt/skedz](https://codeberg.org/link2xt/skedz)
- Delta Chat: [https://delta.chat/](https://delta.chat/)

Community project by link2xt.

## Project status

Skedz is a community-driven, open source side project.
The focus is robustness, offline usability and transparency — not feature parity with native apps.
Contributions, feedback and issues are very welcome.

### Contributing

Pull requests are welcome! Please open an issue first to discuss what you would like to change. 

### License

GNU Affero General Public License v3.0 (AGPL-3.0).
See [LICENSE](LICENSE) for details.

### Author

Skedz was created by Yves Sorge during 39C3.
