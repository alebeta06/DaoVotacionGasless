# CLAUDE.md — DAO Votacion Gasless

> Instrucciones para Claude (y para el estudiante) sobre este repositorio.
> Si vienes nuevo a este proyecto, **lee esto primero**.

---

## Contexto

Proyecto **capstone** del curso de **CodeCrypto Academy**. El estudiante (alebeta) está aprendiendo Web3, así que el modo de trabajo es **didáctico**:

- Cada concepto nuevo se explica **antes** de usarlo.
- Se comenta el **porqué** de cada decisión de diseño en `docs/`.
- El código en sí va **limpio** (sin comentarios obvios) — la teoría vive en `docs/`.
- Idioma por defecto: **español**.

## Objetivo del proyecto

Construir una DAO donde los usuarios voten propuestas **sin pagar gas**, usando **meta-transacciones EIP-2771**. Un *relayer* (servidor backend) paga el gas en nombre del votante.

```
Usuario firma off-chain  ──▶  /api/relay  ──▶  MinimalForwarder.execute()  ──▶  DAO.vote()
   (gratis, sin gas)         (paga gas)         (verifica firma)              (registra voto)
```

## Estructura del repositorio

```
DaoVotacionGasless/
├── CLAUDE.md              ← este archivo
├── README.md              ← guía rápida para usuarios
├── docs/                  ← teoría + plan paso a paso (en español)
│   ├── 00-plan-paso-a-paso.md
│   ├── 01-conceptos.md
│   ├── 02-smart-contracts.md
│   ├── 03-frontend.md
│   └── 04-relayer-y-daemon.md
├── sc/                    ← Foundry: contratos Solidity
│   ├── src/
│   │   ├── MinimalForwarder.sol
│   │   └── DAOVoting.sol
│   ├── test/
│   ├── script/
│   └── foundry.toml
└── web/                   ← Next.js 15 + TypeScript + Tailwind
    ├── app/
    │   ├── api/relay/route.ts
    │   └── api/cron/execute/route.ts
    ├── components/
    ├── lib/
    └── package.json
```

## Stack

| Capa | Tecnología | Versión objetivo |
|------|-----------|------------------|
| Smart contracts | Solidity | ^0.8.24 |
| Build / test | Foundry (forge, anvil, cast) | latest |
| Librerías SC | OpenZeppelin Contracts | ^5.x |
| Frontend | Next.js (App Router) | 15.x |
| Lenguaje frontend | TypeScript | strict |
| Estilos | Tailwind CSS | v4 |
| Web3 lib | ethers.js | v6 |
| Red de desarrollo | Anvil (chainId 31337) | — |

## Convenciones

### Solidity (`sc/`)
- Pragma fijo: `pragma solidity 0.8.24;`
- Errores custom (`error Unauthorized();`) en vez de `require` con strings — más barato en gas.
- Eventos para todo lo importante: `ProposalCreated`, `Voted`, `ProposalExecuted`.
- Tests en Foundry usando `forge-std/Test.sol`. Naming: `test_<Funcion>_<Escenario>()`, `testRevert_<Funcion>_<Razon>()`.
- Coverage objetivo: **>80%** (`forge coverage`).

### TypeScript (`web/`)
- `strict: true` en `tsconfig.json`.
- Componentes en PascalCase, hooks en camelCase con prefijo `use`.
- Variables de entorno públicas: `NEXT_PUBLIC_*`. Privadas (relayer key, RPC con auth): nunca `NEXT_PUBLIC_`.
- Tipos de contratos generados desde ABIs en `web/lib/abis/`.

### Git
- Branch principal: `main`.
- Commits incrementales por **paso del plan** (ej. `feat(sc): MinimalForwarder + tests`).
- **Nunca** commitear `.env*`, `node_modules/`, `cache/`, `out/`, `broadcast/`.

## Variables de entorno (web/.env.local)

```bash
NEXT_PUBLIC_DAO_ADDRESS=0x...
NEXT_PUBLIC_FORWARDER_ADDRESS=0x...
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545

# privadas — nunca prefijo NEXT_PUBLIC_
RELAYER_PRIVATE_KEY=0x...
RELAYER_ADDRESS=0x...
RPC_URL=http://127.0.0.1:8545
```

## Comandos frecuentes

### Smart contracts (desde `sc/`)
```bash
forge build                                    # compilar
forge test -vvv                                # tests con traces
forge coverage                                 # cobertura
forge fmt                                      # formatear
anvil                                          # nodo local (otra terminal)
forge script script/Deploy.s.sol --broadcast \
  --rpc-url http://127.0.0.1:8545 \
  --private-key <ANVIL_KEY_0>                  # deploy local
```

### Frontend (desde `web/`)
```bash
npm run dev                                    # http://localhost:3000
npm run build && npm start                     # producción
npm run lint
```

## Plan de trabajo

Lee `docs/00-plan-paso-a-paso.md` para el plan completo. Resumen:

1. **Fase 0** — Setup del monorepo (este momento).
2. **Fase 1** — Conceptos: meta-tx, EIP-2771, EIP-712, ECDSA.
3. **Fase 2** — `sc/`: MinimalForwarder + tests.
4. **Fase 3** — `sc/`: DAOVoting (hereda ERC2771Context) + tests.
5. **Fase 4** — `sc/`: scripts de deploy (Anvil + testnet).
6. **Fase 5** — `web/`: bootstrap Next.js + conexión MetaMask.
7. **Fase 6** — `web/`: panel de fondos + creación de propuestas.
8. **Fase 7** — `web/`: votación gasless (firma EIP-712 + `/api/relay`).
9. **Fase 8** — `web/`: daemon de ejecución (`/api/cron/execute`).
10. **Fase 9** — Pruebas end-to-end + documentación final.

## Notas para Claude (futuras sesiones)

- **No saltes la teoría.** Antes de escribir el código de cada fase, asegúrate de que el documento correspondiente en `docs/` exista o se actualice.
- **Una fase a la vez.** No mezcles contratos y frontend en un mismo paso — el estudiante necesita ver claramente la separación de capas.
- **Verifica antes de afirmar.** Cada vez que cambies un contrato, corre `forge test`. Cada vez que cambies frontend, verifica que `npm run build` pasa.
- **Commits explícitos por paso** — facilita que el estudiante navegue el historial.
