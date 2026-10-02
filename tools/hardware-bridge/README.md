# OmniKès Local Hardware Bridge

Bridge local pour imprimantes ESC/POS sous Windows.

## Démarrage

Depuis la racine OmniKès :

```powershell
npm run hardware:bridge
```

Par défaut :
- écoute sur `127.0.0.1:8765`
- accepte uniquement l'origine `http://localhost:3000`
- utilise le spouleur Windows et le datatype RAW
- aucune donnée n'est envoyée vers le cloud

## API

- `GET /health`
- `GET /v1/printers`
- `POST /v1/printers/print`

Le POST attend :

```json
{
  "encoding": "base64",
  "data": "...",
  "printerId": "Nom exact de l'imprimante Windows"
}
```

L'imprimante doit être installée dans Windows et accepter l'impression RAW/ESC-POS.

## Test

```powershell
Invoke-RestMethod http://127.0.0.1:8765/health
Invoke-RestMethod http://127.0.0.1:8765/v1/printers
```

Puis OmniKès peut utiliser `LocalBridgeEscPosTransport`.

Le bridge ne prétend pas détecter directement un périphérique USB brut : il utilise le spooler Windows. C'est compatible avec une imprimante USB ou Bluetooth lorsqu'elle est correctement installée comme imprimante Windows.
