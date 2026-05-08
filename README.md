# DAO Votacion Gasless

> Proyecto del curso de **CodeCrypto Academy**.
> Una DAO donde votar **no cuesta gas** — usa meta-transacciones (EIP-2771).

## ¿Qué hace?

Una organización autónoma descentralizada (DAO) donde:

1. Los usuarios **depositan ETH** al fondo común.
2. Los usuarios con **≥10%** del balance del DAO pueden **crear propuestas** (transferir X ETH a una dirección).
3. Cualquier holder con saldo puede **votar** (a favor / en contra / abstención) **sin pagar gas**.
4. Tras el deadline, un **daemon** ejecuta automáticamente las propuestas aprobadas.

## ¿Cómo funciona la votación gasless?

El usuario **firma** un mensaje EIP-712 en su wallet (gratis, off-chain). Un *relayer* recibe esa firma, la envía al `MinimalForwarder` y **paga el gas** en su nombre. El `DAOVoting` hereda de `ERC2771Context`, lo que le permite extraer la dirección original del firmante en vez de quedarse con la del relayer.

```
Usuario      Frontend         /api/relay         MinimalForwarder      DAOVoting
  │  firma      │                  │                     │                  │
  ├─────────────▶                  │                     │                  │
  │             ├──────────────────▶                     │                  │
  │             │                  ├─ execute(req,sig) ──▶                  │
  │             │                  │                     ├── vote(...) ─────▶
  │             │                  │                     │   (msg.sender =  │
  │             │                  │                     │    usuario)      │
  │             ◀── tx hash ───────┤                     │                  │
```

## Estructura

- `sc/` — contratos Solidity (Foundry)
- `web/` — frontend Next.js 15
- `docs/` — teoría y plan paso a paso (**empieza por aquí si estás aprendiendo**)

## Setup rápido

> ⚠️ Aún no estamos listos para correr el proyecto end-to-end. Cada fase del plan
> (`docs/00-plan-paso-a-paso.md`) habilita más comandos.

### Requisitos

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `anvil`, `cast`)
- Node.js 20+ y npm
- MetaMask en tu navegador

### Instalación

```bash
git clone <este repo>
cd DaoVotacionGasless

# Contratos
cd sc
forge install
forge build
forge test

# Frontend
cd ../web
npm install
cp .env.example .env.local   # rellena con tus addresses
npm run dev
```

## Documentación

- **`CLAUDE.md`** — convenciones, stack, comandos.
- **`docs/00-plan-paso-a-paso.md`** — plan de implementación con explicaciones.
- **`docs/01-conceptos.md`** — qué es EIP-2771, EIP-712, ECDSA, etc.
- **`docs/02-smart-contracts.md`** — diseño de los contratos.
- **`docs/03-frontend.md`** — diseño del frontend.
- **`docs/04-relayer-y-daemon.md`** — el relayer y el daemon de ejecución.

## Licencia

MIT (curso educativo).
