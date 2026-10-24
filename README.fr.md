# QR Drop

[English](README.md) · [Русский](README.ru.md) · [中文](README.zh.md) · [العربية](README.ar.md) · **Français**

**Transférez un fichier d’un appareil à un autre grâce à un flux de QR codes.** Un écran diffuse une séquence infinie de codes, l’autre appareil la filme et reconstitue le fichier. Pas de serveur, pas de réseau, pas d’appairage : juste un écran et un objectif.

**En ligne :** https://universe-coder.github.io/qr-drop/

[Licence MIT](LICENSE)

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/home.png" width="200" alt="Écran d’accueil"><br><sub>Accueil</sub></td>
    <td align="center"><img src="docs/screenshots/transmit.png" width="200" alt="L’expéditeur affiche un flux de QR codes"><br><sub>Envoi</sub></td>
    <td align="center"><img src="docs/screenshots/receive.png" width="200" alt="Le récepteur reconstitue le fichier depuis la caméra"><br><sub>Réception</sub></td>
    <td align="center"><img src="docs/screenshots/received.png" width="200" alt="Fichier reçu et vérifié"><br><sub>Terminé</sub></td>
  </tr>
</table>

```
file ──► blocks ──► fountain frames ──► QR ──► screen
                                                 │
                                              camera
                                                 ▼
file ◄── SHA-256 ◄── assembly ◄── frames ◄── jsQR
```

- Fonctionne hors ligne après la première visite (service worker) ; rien n’est jamais envoyé sur un serveur.
- L’envoi fonctionne dans tout navigateur récent. La réception nécessite une caméra et HTTPS.
- Interface en anglais, russe, chinois, arabe (de droite à gauche) et français ; thèmes clair et sombre.
- L’autotest intégré (`#/selftest`) exécute toute la chaîne dans le navigateur, sauf la caméra.

## Pourquoi ça marche sans canal de retour

Le récepteur ne peut pas demander qu’une trame soit répétée : il n’a aucun moyen de le dire. Pendant ce temps, la caméra rate la moitié de ce qui est affiché, voire plus. Des blocs numérotés diffusés en boucle ne conviennent pas : avec un écart constant entre la fréquence de l’écran et celle de la caméra, les mêmes numéros peuvent être ratés indéfiniment.

QR Drop utilise donc un **code fontaine (LT)** : chaque trame est le XOR d’un ensemble aléatoire de blocs source, et le récepteur n’a besoin que de `K·(1+ε)` trames quelconques, peu importe lesquelles. Les deux côtés déduisent l’ensemble des blocs d’une trame à partir de son seul numéro, si bien qu’aucun octet de description des blocs ne transite par le canal.

| phase | trames | contenu |
|---|---|---|
| systématique | `seq mod 5K < K` | exactement un bloc source |
| fontaine | les autres | XOR selon une distribution soliton robuste avec une échelle résiduelle |

Le prologue systématique donne le cas idéal : **avec une réception propre, le fichier est reconstitué en exactement K trames**, sans aucun surcoût. Le prologue se répète toutes les `5K` trames pour ceux qui ont pointé la caméra en retard.

### Surcoût mesuré

Trames de données par bloc source, simulation du décodeur BP, 60 exécutions par point :

| K | 0 % de perte | 30 % | 50 % | 60 % | 75 % |
|---|---|---|---|---|---|
| 137 | 1,00 | 1,23 | 1,28 | 1,33 | 1,39 |
| 1024 | 1,00 | 1,21 | 1,19 | 1,21 | 1,30 |

## Format des trames

Little-endian. 5 octets communs : signature `QD`, version+type, identifiant de session.

**DATA** : 13 octets de surcoût plus la charge utile.

```
0  'Q' 'D'                    2
2  (version << 4) | type      1
3  session                    2
5  frame number               4
9  payload                    blockSize
.. CRC-32C                    4
```

**META** : 59 octets plus le nom et le type MIME : taille du fichier, taille de bloc, nombre de blocs, SHA-256 du fichier, empreinte du calendrier, nom, MIME.

Les emplacements de service sont `0, 4, 8 … 28`, puis un sur 16. Celui qui vise dès le début obtient la description du fichier avec une probabilité d’environ 98 % dans les 32 premiers emplacements, même avec 60 % de perte ; en régime établi, les trames de service occupent 1/16 du flux.

- **CRC-32C, pas CRC-16.** Le décodeur fontaine mélange une trame dans plusieurs blocs à la fois : une seule trame corrompue non détectée ruine silencieusement tout le fichier, et on ne le découvrirait que par le SHA-256, des minutes plus tard.
- **Empreinte du calendrier dans META.** Les deux côtés exécutent le même code, mais un onglet peut tourner sur une ancienne version en cache. L’empreinte transforme « du charabia au bout de trois minutes » en une erreur franche dès le départ.
- **QR en mode octet brut, sans base45/base64.** jsQR renvoie des `binaryData` exacts ; vérifié sur 700 octets contenant des zéros et des octets supérieurs à `0x7F`.

## Profils

| Profil | version QR | correction | modules | octets/trame | trames/s | 100 Ko, réaliste |
|---|---|---|---|---|---|---|
| Fiable | 13 | M | 69×69 | 316 | 8 | ~95 s (1,1 Ko/s) |
| Normal | 19 | L | 93×93 | 776 | 10 | ~38 s (2,7 Ko/s) |
| Rapide | 25 | L | 117×117 | 1260 | 12 | ~25 s (4,0 Ko/s) |

Plus de données par trame, ce sont des modules plus petits et des exigences plus élevées envers la caméra, l’éclairage et la stabilité des mains. L’estimation « réaliste » suppose que la caméra décode 35 à 55 % des trames affichées, plus le surcoût du code fontaine. La taille maximale d’un fichier est de 2 Mo : c’est déjà environ une heure et demie de prise de vue.

## Architecture

```
src/
  protocol/     cœur pur sans DOM, entièrement testable
    crc32.ts        CRC-32C
    prng.ts         splitmix32 + tirage d’indices distincts
    soliton.ts      distribution soliton robuste
    schedule.ts     ★ le seul endroit où encodeur et décodeur doivent concorder
    frames.ts       sérialisation des trames
    encoder.ts      fichier → flux infini de trames
    decoder.ts      décodeur LT incrémental (peeling)
    receiver.ts     session de réception : META, sessions étrangères, intégrité
  qr/
    capacity.ts     table des capacités, choix de la taille de bloc
    encode.ts       octets → matrice de modules
    paint.ts        matrice → canvas
    broadcast.worker.ts  génération des trames hors du thread principal
    scan.worker.ts       reconnaissance et analyse hors du thread principal
  platform/       caméra, maintien de l’écran allumé, enregistrement, vibration
  app/            hooks et état
  ui/             écrans, i18n, petit kit de composants
    locales/        un dictionnaire par langue, tous typés d’après ru.ts
```

- **Envoi.** Les trames sont générées dans un worker, avec 12 d’avance. L’affichage suit un compteur de ticks `requestAnimationFrame`, pas l’horloge : une trame doit durer un nombre entier de rafraîchissements de l’écran, sinon un changement finit par tomber au milieu d’un rafraîchissement et la caméra capture une moitié de l’ancienne trame et une moitié de la nouvelle.
- **Réception.** Seul le carré central sous le viseur est décodé, réduit à 512×512 : trois fois moins coûteux, et les QR codes étrangers sur les bords sont ignorés. L’image suivante n’est demandée qu’une fois la précédente analysée.

## Développement

```bash
npm install
npm run dev       # http://localhost:5173
npm run check     # types + lint + tests
npm run build     # site statique dans dist/
```

La caméra ne fonctionne qu’en HTTPS ou sur `localhost`. Pour tester la réception sur un téléphone, servez la version de développement en HTTPS (par exemple via un tunnel) ou utilisez le site publié.

`npm run check` exécute la suite de tests, dont : des transferts en boucle avec 20/50/70 % de trames perdues, une réception commencée en milieu de flux, un aller-retour binaire à travers de vrais QR codes rastérisés en pixels puis relus par jsQR, et la vérification que la corruption de n’importe quel octet d’une trame est détectée par le CRC.

## Déploiement

Le site est entièrement statique et utilise des chemins relatifs : `dist/` peut donc être servi depuis n’importe quel hébergeur et n’importe quel sous-chemin.

GitHub Pages est configuré dans [`.github/workflows/pages.yml`](.github/workflows/pages.yml) : chaque push sur `main` lance les vérifications, construit et publie le site. Réglage unique : **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Compromis connus

- **jsQR plutôt que zxing-wasm.** zxing-wasm est environ deux fois plus rapide, mais il dépend d’un fichier WASM chargé par défaut depuis un CDN. Pour une application dont tout l’intérêt est de fonctionner hors ligne, c’est un mauvais échange.
- **L’expéditeur ne voit pas la progression du récepteur.** Le canal est à sens unique, et prétendre le contraire serait malhonnête. L’écran d’envoi affiche sa propre durée et le numéro de passage, et indique clairement de suivre la progression sur l’autre appareil.
- **Le `BarcodeDetector` natif n’est pas utilisé.** Il ne renvoie que `rawValue`, une chaîne, pas des octets.
