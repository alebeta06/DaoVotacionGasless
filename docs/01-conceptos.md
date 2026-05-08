# 01 — Conceptos teóricos

> Antes de escribir Solidity, conviene tener claro **qué problema resolvemos** y **con qué piezas**.

---

## 1. ¿Qué es una DAO?

**DAO** = Decentralized Autonomous Organization. Es código que vive en una blockchain y gobierna un fondo común (un "tesoro") según reglas predefinidas. Las decisiones se toman por **votación** entre los miembros, no por un CEO.

En nuestra DAO:

- El **tesoro** son los ETH que los usuarios depositan.
- El **derecho a voto** depende del balance que cada usuario aportó.
- Las **propuestas** son intentos de mover ETH del tesoro a una dirección externa (ej. "pagar 5 ETH a este contratista").
- Si la mayoría vota **A FAVOR** y pasa el deadline, el ETH se transfiere automáticamente.

No hay administradores — todo está en el código.

---

## 2. ¿Qué es el "gas" y por qué importa?

Cada operación que escribe en una blockchain (Ethereum, Polygon, etc.) **cuesta gas**. El gas se paga con el token nativo de la red (ETH en Ethereum). Es la fee que recompensa a los validadores.

**Problema de UX:** un usuario que solo quiere votar tiene que:

1. Conseguir ETH (comprar en exchange, transferir a su wallet).
2. Pagar comisión por cada voto (decenas de céntimos a varios dólares).
3. Confirmar una transacción real en MetaMask.

Esto **bloquea** la adopción. Mucha gente quiere participar en una DAO sin tener que comprar ETH primero.

**Solución:** que **otro pague el gas por ellos**. Eso es lo que hace una **meta-transacción**.

---

## 3. Meta-transacciones — la idea

> "Yo firmo, tú pagas."

Una meta-transacción separa dos roles que normalmente coinciden:

| Rol | Qué hace |
|-----|----------|
| **Signer** (usuario) | Autoriza la acción firmando un mensaje |
| **Sender** (relayer) | Manda la transacción real a la blockchain y paga el gas |

El usuario nunca toca ETH ni paga gas. Solo firma con su wallet — la firma es **gratis** porque ocurre off-chain.

```
        ┌─────────┐                          ┌─────────────────┐
Usuario │ MetaMask│ ── firma EIP-712 ──▶ App │ /api/relay      │
        └─────────┘                          │ (con ETH del    │
                                             │  proyecto)      │
                                             └────────┬────────┘
                                                      │ envía tx
                                                      ▼
                                             ┌─────────────────┐
                                             │ Forwarder.execute│
                                             │ (verifica firma)│
                                             └────────┬────────┘
                                                      │
                                                      ▼
                                             ┌─────────────────┐
                                             │  DAO.vote(...)  │
                                             │  msg.sender =   │
                                             │  Usuario real   │
                                             └─────────────────┘
```

**Pregunta clave:** si el relayer manda la tx, ¿cómo sabe el contrato DAO quién votó realmente? Eso lo resuelve EIP-2771 (siguiente sección).

---

## 4. EIP-2771 — el estándar "Trusted Forwarder"

[EIP-2771](https://eips.ethereum.org/EIPS/eip-2771) define cómo un contrato puede **confiar** en un forwarder (relayer on-chain) para que le diga quién es el usuario original.

**Mecánica:**

1. El contrato DAO declara: *"confío en el forwarder en la dirección 0xABC..."*.
2. Cuando llega una llamada, si `msg.sender == 0xABC` (el forwarder), el contrato lee la **dirección del usuario real** desde los **últimos 20 bytes del calldata**.
3. Si `msg.sender` es otra cosa (un usuario llamando directamente), usa `msg.sender` como siempre.

OpenZeppelin nos da la base: `ERC2771Context`. Esa clase implementa `_msgSender()`:

```solidity
function _msgSender() internal view virtual override returns (address sender) {
    if (isTrustedForwarder(msg.sender) && msg.data.length >= 20) {
        // últimos 20 bytes del calldata
        assembly {
            sender := shr(96, calldataload(sub(calldatasize(), 20)))
        }
    } else {
        sender = msg.sender;
    }
}
```

**Regla de oro:** dentro del contrato DAO, **nunca uses `msg.sender`**. Usa siempre `_msgSender()`. Si te olvidas en una sola función, esa función no será gasless.

---

## 5. EIP-712 — firmas estructuradas

Si firmas un mensaje crudo con MetaMask, ves esto:

```
0x1d8e6a... (hex incomprensible)
```

Inseguro y poco amigable. **EIP-712** define cómo firmar **datos estructurados** que MetaMask muestra de forma legible:

```
ForwardRequest:
  from:    0xAlice...
  to:      0xDAO...
  value:   0
  gas:     100000
  nonce:   3
  data:    0xa9059cbb...   (esto es vote(1, FOR))
```

Bajo el capó, EIP-712 hace un hash determinista de:

1. Un **domain separator** — identifica la app (nombre, versión, chainId, contrato verificador). Esto evita que una firma para *tu* DAO se reutilice en *otra* DAO.
2. Un **type hash** — describe la estructura del mensaje.
3. Los valores del mensaje.

El resultado es un hash único de 32 bytes que la wallet firma con ECDSA.

---

## 6. ECDSA — la criptografía

**Elliptic Curve Digital Signature Algorithm**. La wallet del usuario tiene una clave privada. Al firmar un hash, produce tres valores: `(v, r, s)` (65 bytes en total).

Cualquiera puede tomar la firma `(v, r, s)`, el hash original, y **recuperar la dirección del firmante**:

```solidity
address signer = ecrecover(hash, v, r, s);
```

Si `signer == request.from`, la firma es válida.

OpenZeppelin envuelve esto con `ECDSA.recover(hash, signature)` — más limpio.

---

## 7. Nonces y replay protection

**Problema:** si Alice firma "voto A FAVOR de la propuesta 1", **el mismo mensaje y firma sirven para siempre**. Un atacante podría capturarlos y reenviarlos 100 veces — aunque el voto está restringido a 1 por usuario, en otro tipo de meta-tx (ej. transferencias) sería catastrófico.

**Solución:** un **nonce** (número incremental) por usuario:

```
Nonce de Alice empieza en 0.
Alice firma { ..., nonce: 0 } → forwarder ejecuta → nonce de Alice pasa a 1.
Si alguien reenvía la misma firma (nonce 0), el forwarder revierte.
```

`MinimalForwarder` mantiene `mapping(address => uint256) nonces` y los incrementa en cada `execute()`.

---

## 8. ¿Por qué confiar en el relayer?

**No tienes que.** El relayer **no puede falsificar firmas**. Si el relayer intenta cambiar el `data` de la firma (ej. votar EN CONTRA en vez de A FAVOR), `verify()` rechaza porque el hash ya no coincide.

Lo único que el relayer **puede** hacer es:

- **Censurar:** decidir no enviar la tx (no la firma — la *transacción*). Mitigación: que existan varios relayers.
- **Retrasar:** demorar la ejecución. Mitigación: el usuario podría pagar gas él mismo si tiene urgencia.

**No puede:** modificar el voto, votar por otro, ni gastar más allá de lo que el usuario firmó.

---

## 9. Resumen visual

```
                         ┌─────────────────┐
                         │   Concepto      │
                         └─────────────────┘

  ¿qué se firma?     →   ForwardRequest (EIP-712)
  ¿con qué se firma? →   Clave privada del usuario (ECDSA)
  ¿quién verifica?   →   MinimalForwarder.verify()
  ¿quién ejecuta?    →   MinimalForwarder.execute() ← paga gas el relayer
  ¿quién recibe?     →   DAOVoting (lee usuario real con _msgSender de ERC2771Context)
  ¿qué evita replay? →   Nonce incremental por usuario en el Forwarder
  ¿qué evita cross-app? →  Domain separator EIP-712 (nombre + chainId + addr Forwarder)
```

---

## Lecturas oficiales

- EIP-2771: https://eips.ethereum.org/EIPS/eip-2771
- EIP-712: https://eips.ethereum.org/EIPS/eip-712
- OpenZeppelin `ERC2771Context`: https://docs.openzeppelin.com/contracts/5.x/api/metatx
- OpenZeppelin `MinimalForwarder` (referencia, deprecated en v5 a favor de `ERC2771Forwarder`): https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v4.9/contracts/metatx/MinimalForwarder.sol

> ⚠️ **Nota sobre versiones:** OpenZeppelin v5 reemplazó `MinimalForwarder` por `ERC2771Forwarder` (más robusto). El brief del curso pide específicamente `MinimalForwarder`, así que lo implementaremos a mano siguiendo el patrón v4.9. Esto es también un buen ejercicio didáctico.
