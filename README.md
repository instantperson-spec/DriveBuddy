# Drive Buddy — katalog archiwum wideo

Masz **kilka dysków z projektami wideo**? Zamiast otwierać każdy dysk ręcznie:

1. **Skanuj archiwum** (raz, gdy coś się zmieni na dyskach).
2. **Szukaj** po nazwie projektu, klienta lub pliku.
3. Od razu widzisz **na którym dysku** leży folder i możesz **skopiować ścieżkę**.

Indeks zapisuje się lokalnie w `data/catalog.json`. **Po skanie możesz odłączyć dyski** — wyszukiwarka i lista projektów działają z zapamiętanej kopii. Ponowny skan (aktualizacja) wymaga podłączenia wybranego dysku; skan **nie kasuje** indeksu innych, odłączonych dysków.

## Uruchomienie

```bash
npm install
npm run dev
```

[http://localhost:5173](http://localhost:5173)

## Jak używać

1. Po lewej zaznacz dyski do skanu (domyślnie wolumeny z `/Volumes`).
2. Kliknij **Skanuj archiwum** — może potrwać na dużych dyskach.
3. W polu wyszukiwania wpisz np. fragment nazwy wesela, klienta, `.mp4`.
4. **Kopiuj** pełną ścieżkę i wklej w Finderze (Cmd+Shift+G).

### Duplikaty między dyskami

Zakładka **Duplikaty** → **Skanuj duplikaty** (te same zaznaczone dyski po lewej). Opcja **Tylko pliki wideo** (domyślnie włączona) — szybszy skan archiwum. Bez niej indeksowane są wszystkie pliki ≥1 KB. Grupowanie po rozmiarze i szybkim odcisku (próbka pliku). Przy grupie: **Pełny hash** — czyta całe pliki (SHA-256), wynik zapisywany w indeksie; wymaga podłączonych dysków. Domyślnie widać tylko duplikaty **między różnymi dyskami**. Zapis w `data/duplicates.json` — działa offline po odłączeniu dysków.

## Co trafia do indeksu

Każdy **folder, w którym (w podfolderach) jest co najmniej jeden plik wideo** — m.in. `.mp4`, `.mov`, `.mxf`, `.r3d`, `.braw`, `.mkv`.

## API (skrót)

- `GET /api/catalog?q=…&drive=…` — wyszukiwanie
- `GET /api/catalog/meta` — statystyki i data ostatniego skanu
- `POST /api/catalog/scan` — `{ "drivePaths": ["/Volumes/ENV"] }`
- `GET /api/catalog/scan/status` — postęp skanu
- `GET /api/duplicates?crossDrive=1&q=…` — grupy duplikatów
- `POST /api/duplicates/scan` — `{ "drivePaths": [], "videoOnly": true }`
- `POST /api/duplicates/verify` — `{ "key": "…" }` pełny hash grupy

## Stack

React + Vite, Express, zapis JSON w `data/`.
