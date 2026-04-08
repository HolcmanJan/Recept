# Recept

Jednoduchá webová aplikace pro zaznamenávání receptů na vaření. Žádný backend, žádné instalace – stačí otevřít `index.html` v prohlížeči.

## Funkce

- Přidávání, úprava a mazání receptů
- U každého receptu: název, kategorie, počet porcí, doba přípravy, suroviny, postup, poznámky
- Vyhledávání podle textu (název, suroviny, postup, poznámky)
- Filtrování podle kategorie
- **Přihlášení přes Google** – recepty se synchronizují mezi všemi zařízeními přes Firebase Firestore
- Bez přihlášení funguje offline s ukládáním do `localStorage`
- Responzivní design pro mobil i desktop

## Spuštění

```bash
# Stačí otevřít soubor v prohlížeči:
xdg-open index.html        # Linux
open index.html            # macOS
start index.html           # Windows
```

Případně lze servírovat přes libovolný statický server:

```bash
python3 -m http.server 8000
# pak http://localhost:8000
```

## Struktura

- `index.html` – struktura stránky
- `styles.css` – styly
- `app.js` – logika (CRUD, vyhledávání, localStorage)
