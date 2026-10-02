# OmniKès Local Hardware Bridge

Agent local réel pour l'impression ESC/POS sous Windows.

## Architecture

```
OmniKès
  ↓ HTTP localhost
Local Hardware Bridge
  ↓ Winspool RAW
Pilote Windows
  ↓
USB / Bluetooth / réseau
  ↓
Imprimante ESC/POS
```

Le bridge utilise directement `winspool.drv` et `WritePrinter(..., RAW)`.
Il ne simule pas une impression et ne génère pas de fichier à imprimer.

## Sécurité

- écoute uniquement sur `127.0.0.1`
- aucune connexion cloud
- origine navigateur limitée à localhost
- payload limité à 512 KiB
- nom d'imprimante transmis comme argument, sans shell interpolation
- données temporaires supprimées après l'impression

## Installation

Aucune dépendance npm supplémentaire n'est nécessaire.

Depuis la racine :

```powershell
npm install
```

## Démarrage

```powershell
npm run hardware:bridge
```

Bridge :

`http://127.0.0.1:8765`

## Vérification

```powershell
Invoke-RestMethod http://127.0.0.1:8765/health
Invoke-RestMethod http://127.0.0.1:8765/v1/printers
```

La deuxième commande retourne les imprimantes installées dans Windows avec leur nom exact.

## Impression réelle

Le client OmniKès envoie :

```json
{
  "encoding": "base64",
  "data": "<ESC/POS en base64>",
  "printerId": "Nom exact de l'imprimante Windows"
}
```

Le bridge appelle ensuite le spooler Windows en datatype `RAW`.

## USB / Bluetooth

Une imprimante USB ou Bluetooth doit être installée et visible dans **Paramètres Windows → Imprimantes et scanners**.

Le bridge utilise alors le pilote/port Windows existant et transmet le flux ESC/POS en RAW.

Il n'est donc pas nécessaire de remplacer le pilote Windows par WinUSB pour cette voie.

## Limite actuelle

Cette version cible Windows, qui correspond au poste local OmniKès actuel.
Le transport USB direct libusb/WebUSB reste une voie distincte à ajouter si un modèle d'imprimante exige un accès USB sans spooler.


## Balance électronique — HW-04

Le bridge expose une lecture de balance série Windows :

`GET http://127.0.0.1:8765/v1/scales`

liste les ports série Windows détectés.

`POST http://127.0.0.1:8765/v1/scales/read`

avec par exemple :

```json
{
  "scaleId": "COM3",
  "baudRate": 9600,
  "dataBits": 8,
  "parity": "none",
  "stopBits": 1,
  "readTimeoutMs": 2500,
  "settleMs": 300
}
```

Le bridge ouvre réellement le port COM via `System.IO.Ports.SerialPort`, envoie éventuellement la commande configurée, lit une trame bornée dans le temps et restitue la trame brute à OmniKès.

La normalisation du poids et la validation des unités sont effectuées côté application dans `src/lib/hardware/scale.ts`.

La balance doit fournir une interface série Windows (USB/RS232 via un adaptateur ou port COM virtuel). Le protocole de chaque modèle peut nécessiter une commande et/ou des paramètres série spécifiques.

`--doctor` liste maintenant à la fois les imprimantes et les ports série détectés.
