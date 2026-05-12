# `sc/` — Smart contracts (Foundry)

Carpeta de los contratos Solidity del proyecto **DAO Votacion Gasless**.

Toda la teoría del diseño vive en [`../docs/02-smart-contracts.md`](../docs/02-smart-contracts.md). Este README solo explica **cómo trabajar con esta carpeta**.

---

## Stack

| Cosa | Versión |
|------|---------|
| Solidity | `0.8.24` |
| Foundry (forge, anvil, cast) | latest (probado en 1.5.x) |
| OpenZeppelin Contracts | `v5.1.0` |

Optimizer activado (`runs = 200`). Remappings configurados en `foundry.toml`:

```
@openzeppelin/contracts/  ->  lib/openzeppelin-contracts/contracts/
forge-std/                ->  lib/forge-std/src/
```

---

## Contratos

### `src/MinimalForwarder.sol`

Relayer on-chain que recibe meta-transacciones firmadas (EIP-712) y las reenvía al contrato destino con la dirección del usuario original *appended* al calldata (patrón EIP-2771).

- `struct ForwardRequest { from, to, value, gas, nonce, data }`
- `getNonce(address) → uint256`
- `verify(req, signature) → bool`
- `execute(req, signature) → (bool, bytes)` *payable*

Detalles importantes:

- Hereda `EIP712("MinimalForwarder", "1")` de OpenZeppelin.
- Nonce por usuario, incrementado **antes** del call externo (checks-effects-interactions).
- Tras el call, aplica el check `gasleft() > req.gas / 63` y revierte con `invalid()` si el relayer escatimó gas (consume todo el gas restante: el relayer tramposo paga).

### `src/DAOVoting.sol` *(Fase 3 — pendiente)*

DAO que hereda `ERC2771Context(forwarder)` para que `_msgSender()` devuelva al votante real cuando la llamada viene vía forwarder.

---

## Comandos

Desde esta carpeta (`sc/`):

```bash
forge build                  # compilar
forge test -vvv              # tests con traces
forge test --match-contract MinimalForwarderTest
forge coverage               # cobertura
forge fmt                    # formatear
forge fmt --check            # CI: fallar si no está formateado
```

### Local dev (Anvil)

```bash
# Terminal 1
anvil                        # chainId 31337, http://127.0.0.1:8545

# Terminal 2 (cuando exista script/Deploy.s.sol — Fase 4)
forge script script/Deploy.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --broadcast
```

> La private key de arriba es la cuenta `#0` de Anvil — **solo para desarrollo local**. Nunca usarla fuera de localhost.

---

## Estado de los tests

| Contrato | Tests | Coverage |
|----------|-------|----------|
| `MinimalForwarder.sol` | 9 verdes | 100% líneas / 100% branches |
| `DAOVoting.sol` | — | — (Fase 3) |

Re-ejecuta con `forge test -vvv` antes de cada commit.

---

## Estructura

```
sc/
├── foundry.toml          ← config + remappings
├── src/
│   ├── MinimalForwarder.sol   ✅ Fase 2
│   └── DAOVoting.sol          ⏳ Fase 3
├── test/
│   └── MinimalForwarder.t.sol ✅ Fase 2
├── script/
│   └── Deploy.s.sol           ⏳ Fase 4
└── lib/                   ← OpenZeppelin + forge-std (no commiteado)
```

`cache/`, `out/`, `broadcast/`, `lib/` están en `.gitignore` (regenerables con `forge install` y `forge build`).
