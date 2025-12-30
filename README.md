# Congress Schedule PWA

Offline-first PWA to view a congress schedules from a JSON endpoint (e.g. CCC schedule feeds), with:

- Grouped-by-day session list ordered by time
- Filters: track, day, room, type, language, search
- Session details modal with description text
- Offline storage after first load
- Notifications for selected sessions (local reminders)
- Export of selected sessions (ICS/JSON/CSV)
- Optional: import of downloaded schedule JSON files

## Quick start (dev)

```bash
npm install
npm run dev
```

Open the dev URL shown by Vite.

## Build + offline PWA

```bash
npm run build
npm run preview
```

Then open the preview URL (typically http://localhost:4173).  
You can install the app from the browser menu ("Install app").

## Running locally from downloaded sources

**Important:** opening `dist/index.html` via `file://` will *not* enable service-worker PWA features in most browsers.

Use a local web server instead:

### Option A: Vite preview (recommended)
```bash
npm run build
npm run preview
```

### Option B: Python (no Node server needed)
```bash
cd dist
python -m http.server 8080
```
then open http://localhost:8080

## Offline behavior

- The app shell is cached by the service worker.
- Schedules are stored in IndexedDB after loading from URL or importing a file.
- On next launch (even offline), the cached schedule loads instantly.

## Notes

Some schedule endpoints block browsers via CORS. If loading of schedules from URL fails with a network/CORS error, download the JSON file and use **Import file** instead.


## Contributing

Pull requests are welcome! Please open an issue first to discuss what you would like to change. 