# Recept Combat — prototyp středověkého souboje (Godot 4)

Prototyp 3D hry pro PC ve stylu Half Sword. Aréna 20×20 m, hráč proti AI, devět typů zbraní, realistické následky zranění (kritické rány, useknuté končetiny, krvácení).

## Jak to spustit

1. Stáhni si **Godot Engine 4.3+** (standard, ne .NET) — https://godotengine.org/download
   - Je to jeden `.exe` / `.app` soubor, netřeba instalovat.
2. Spusť Godot.
3. V úvodním dialogu klikni **Import** a vyber složku `game/` (obsahuje `project.godot`).
4. Po importu projekt otevři a stiskni **F5** (nebo tlačítko Play vpravo nahoře).
5. Pokud se zeptá na hlavní scénu, vyber `scenes/main.tscn`.

Windows build (volitelné): `Project → Export → Add → Windows Desktop`, potom `Export Project`.

## Ovládání

| Akce | Klávesa / tlačítko |
|---|---|
| Pohyb | `W` `A` `S` `D` (podle směru kamery) |
| Kamera | myš |
| Uvolnit kurzor | `Esc` |
| Sebrat zbraň | `E` (u ležící zbraně) |
| Odhodit zbraň | `Q` |
| Sek / levá pěst | LMB (se zbraní / bez zbraně) |
| Bodnutí | `Alt` + LMB (se zbraní) |
| Pravá pěst | RMB (bez zbraně) |
| Blok | `Ctrl` (drž) |
| Restart | `R` |

## Herní mechaniky

- **Aréna** 20×20 m se zábradlím kolem dokola.
- **Postavy** mají tělo složené z částí: hlava, trup, levá/pravá ruka, levá/pravá noha, levá/pravá dlaň. Každá má vlastní HP.
- **Devět zbraní** se náhodně rozloží po ploše:
  - meč, kopí, palcát, sekera, vidle, kosa, obouruční meč, dýka, halapartna
  - každá zbraň má vlastní hodnoty seku / bodnutí / úderu a délku dosahu
- **Poškození**:
  - hlava + sek (silný) → dekapitace (smrt)
  - hlava + bodnutí (silné) → probodnutí lebky (smrt)
  - hlava + drtivý úder (silný) → rozdrcená lebka (smrt)
  - trup + bodnutí (silné) → probodnutí srdce (smrt)
  - trup/končetina + sek/bodnutí → krvácení (úbytek HP v čase, zpomalení)
  - končetina + sek s dost silnou ostrou zbraní → useknutí (pokud HP končetiny = 0 nebo síla ≥ 40)
  - pravá ruka useknuta → zbraň vypadne
- **Blok** (`Ctrl`) snižuje příchozí poškození na 20 %, ale jen z předního sektoru.
- **Vítězství** — zabít soupeře. **Prohra** — tvoje postava smrtelně zraněna.

## Struktura projektu

```
game/
├── project.godot          # konfigurace projektu
├── icon.svg
├── scenes/
│   └── main.tscn          # jediná scéna; vše ostatní staví game.gd
└── scripts/
    ├── game.gd            # aréna, spawny, propojení hitboxů s damage
    ├── fighter.gd         # základní třída: tělo, HP, útoky, poškození
    ├── player.gd          # vstup + 3. osoba kamera
    ├── enemy.gd           # AI protivník
    ├── weapon.gd          # zbraně (typy, statistiky, hitbox ostří)
    ├── body_part.gd       # hitbox pro jednu část těla
    └── hud.gd             # HP, hlášky, nápověda, konec hry
```

## Poznámky k prototypu

- Žádné textury; postavy a zbraně jsou sestaveny ze základních primitiv (box, kapsle, válec, koule).
- Bez ragdoll fyziky — animace končetin se počítají ručně ve `fighter.gd`.
- Detekce zásahu: každá zbraň má na čepeli `Area3D` aktivní jen během útočné fáze; každá část těla je samostatný `Area3D`.

## Další možné kroky

- Víc typů nepřátel a obtížnost
- Zvuky a particle efekty
- Aktivní ragdoll (fyzikálně řízené tělo) pro realističtější pohyb
- Procedurální řez modelu při useknutí končetiny
- Různé arény
