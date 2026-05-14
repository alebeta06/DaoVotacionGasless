# Plan paso a paso — DAO Votacion Gasless

> Este documento es **el mapa**. Cada fase es un commit (o varios) y deja el proyecto en un estado funcional.
> Lee la teoría asociada en el doc enlazado **antes** de escribir código.

## Vista general

```
Fase 0 ─▶ Fase 1 ─▶ Fase 2 ─▶ Fase 3 ─▶ Fase 4 ─▶ Fase 5 ─▶ Fase 6 ─▶ Fase 7 ─▶ Fase 8 ─▶ Fase 9
setup    teoría    Forward    DAO      deploy    Next       UI       gasless    daemon    E2E
```

Aproximadamente 5 días según el brief del curso. Vamos por capas, **de abajo hacia arriba**: primero los contratos, luego el frontend que los consume.

---

## Fase 0 — Setup del monorepo ✅

**Objetivo:** dejar la estructura base lista y commitear.

- [x] `git init` (rama `main`)
- [x] `CLAUDE.md` con convenciones y arquitectura
- [x] `README.md` con introducción y diagrama
- [x] `.gitignore`
- [x] `docs/` con plan y conceptos
- [ ] Commit inicial

**Resultado esperado:** repositorio con documentación pero sin código todavía.

---

## Fase 1 — Conceptos teóricos

**Objetivo:** entender qué vamos a construir antes de escribir una línea de Solidity.

📖 **Lee:** [`01-conceptos.md`](./01-conceptos.md)

Conceptos clave que cubre el doc:

1. **DAO** — qué es, gobernanza on-chain, propuestas y votación.
2. **Gas** — por qué cada acción on-chain cuesta y por qué eso es una barrera de UX.
3. **Meta-transacciones** — la idea: "yo firmo, tú pagas".
4. **EIP-2771** — el estándar que estandariza el "trusted forwarder pattern".
5. **EIP-712** — firmas estructuradas legibles en la wallet.
6. **ECDSA** — la criptografía bajo la firma.
7. **Nonces y replay protection** — por qué cada firma debe ser única.

---

## Fase 2 — `MinimalForwarder` + tests

**Objetivo:** implementar el relayer on-chain (el que recibe meta-tx).

📖 **Lee:** [`02-smart-contracts.md`](./02-smart-contracts.md) → sección "MinimalForwarder"

```bash
cd sc                          # creado con `forge init sc`
forge install OpenZeppelin/openzeppelin-contracts --no-commit
```

**Archivos a crear:**

- `sc/src/MinimalForwarder.sol`
  - struct `ForwardRequest { from, to, value, gas, nonce, data }`
  - `verify(req, signature) returns (bool)`
  - `execute(req, signature) returns (success, returnData)` — payable
  - `getNonce(from) returns (uint256)`
  - usa `EIP712` + `ECDSA` de OpenZeppelin

- `sc/test/MinimalForwarder.t.sol`
  - test: nonce inicial es 0
  - test: firma válida pasa `verify`
  - test: firma con nonce repetido falla
  - test: firma de otro usuario falla
  - test: `execute` incrementa el nonce
  - test: `execute` propaga revert del target

**Verificación:**

```bash
forge test -vvv --match-contract MinimalForwarder
forge coverage --match-contract MinimalForwarder
```

> 💡 OpenZeppelin trae un `MinimalForwarder.sol` de ejemplo que podemos **estudiar**, pero la consigna pide que lo implementemos nosotros. Vamos a escribirlo a mano siguiendo el estándar.

---

## Fase 3 — `DAOVoting` + tests

**Objetivo:** la DAO en sí, hereda de `ERC2771Context`.

📖 **Lee:** [`02-smart-contracts.md`](./02-smart-contracts.md) → sección "DAOVoting"

**Archivos a crear:**

- `sc/src/DAOVoting.sol`
  ```solidity
  contract DAOVoting is ERC2771Context {
      enum VoteType { AGAINST, FOR, ABSTAIN }
      struct Proposal {
          uint256 id;
          address proposer;
          address recipient;
          uint256 amount;
          uint256 deadline;
          uint256 forVotes;
          uint256 againstVotes;
          uint256 abstainVotes;
          bool executed;
      }
      // ...
  }
  ```
  Funciones requeridas (consigna):
  - `fundDAO() external payable`
  - `createProposal(address recipient, uint256 amount, uint256 deadline)` — solo si `userBalance >= totalBalance / 10`
  - `vote(uint256 proposalId, VoteType voteType)` — usa `_msgSender()` (¡no `msg.sender`!)
  - `executeProposal(uint256 proposalId)` — valida deadline + delay + mayoría
  - `getProposal`, `getUserBalance`

  Constructor: recibe `address trustedForwarder` y se lo pasa a `ERC2771Context`.

- `sc/test/DAOVoting.t.sol`
  - depósito y balance
  - creación de propuesta con/sin 10%
  - voto a favor / en contra / abstención
  - cambio de voto antes del deadline
  - revert: votar después del deadline
  - revert: votar dos veces (mismo voto) → debe ser idempotente o cambiar
  - ejecución exitosa: dinero llega al beneficiario
  - revert: ejecutar antes del deadline
  - revert: ejecutar sin mayoría a favor
  - revert: ejecutar dos veces

**Punto clave del aprendizaje:** entender por qué `_msgSender()` (de `ERC2771Context`) es distinto de `msg.sender` cuando llega vía forwarder.

---

## Fase 4 — Scripts de deployment ✅ (estamos aquí)

**Objetivo:** desplegar a Anvil de manera reproducible.

📖 **Lee:** [`02-smart-contracts.md`](./02-smart-contracts.md) → sección "Deployment"

- `sc/script/Deploy.s.sol`
  1. Despliega `MinimalForwarder`
  2. Despliega `DAOVoting(address(forwarder))`
  3. Imprime ambas addresses por consola

**Comandos:**

```bash
# Terminal 1
anvil

# Terminal 2
cd sc
forge script script/Deploy.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --broadcast
```

> ⚠️ Esa private key es la cuenta #0 de Anvil **solo para desarrollo local**. Nunca uses esa key en testnet/mainnet.

Al final de esta fase, tomamos las dos addresses y las metemos en `web/.env.local` (más adelante).

---

## Fase 5 — Bootstrap del frontend ✅

**Objetivo:** Next.js andando y MetaMask conectada.

📖 **Lee:** [`03-frontend.md`](./03-frontend.md) → sección "Bootstrap"

```bash
npx create-next-app@latest web --typescript --tailwind --app --src-dir=false --eslint
cd web
npm install ethers
```

- `web/lib/wallet.ts` — getProvider, getSigner
- `web/lib/contracts.ts` — instancias tipadas con ABIs
- `web/lib/abis/` — JSON de ABIs (copiados de `sc/out/.../*.json`)
- `web/components/ConnectWallet.tsx`
- `web/app/page.tsx` — landing con botón conectar

**Verificación:** abrir `http://localhost:3000`, conectar MetaMask con la red local (chainId 31337), ver tu address.

---

## Fase 6 — Panel de fondos + crear propuesta

**Objetivo:** el lado "no-gasless" — funciones que sí cuestan gas porque tocan ETH del usuario.

📖 **Lee:** [`03-frontend.md`](./03-frontend.md) → sección "Operaciones con valor"

- `web/components/FundingPanel.tsx` — input ETH + botón `fundDAO()`
- `web/components/CreateProposal.tsx` — formulario (recipient, amount, deadline) + `createProposal()`
- `web/components/DaoStats.tsx` — total balance, mi balance, mi % del DAO

**Por qué estas SÍ pagan gas:** el usuario está moviendo *su* ETH (depositando) o haciendo una acción sensible que altera el quórum (crear propuesta). Solo la **votación** se hace gasless en este proyecto.

---

## Fase 7 — Votación gasless 🎯

**Objetivo:** la pieza estrella del proyecto.

📖 **Lee:** [`04-relayer-y-daemon.md`](./04-relayer-y-daemon.md) → sección "Flujo gasless paso a paso"

**Cliente (web/):**

- `web/lib/metaTx.ts` — funciones `buildForwardRequest()`, `signForwardRequest()` (EIP-712)
- `web/components/ProposalList.tsx` — lista propuestas leídas on-chain
- `web/components/ProposalCard.tsx` — una propuesta con sus contadores
- `web/components/VoteButtons.tsx` — A FAVOR / EN CONTRA / ABSTENCIÓN
  - on click: encode `vote(id, voteType)` calldata, build forward request, firmar EIP-712, POST a `/api/relay`

**Servidor (web/):**

- `web/app/api/relay/route.ts`
  - recibe `{ request, signature }`
  - valida con `forwarder.verify()`
  - llama a `forwarder.execute()` con la **wallet del relayer** (paga gas)
  - devuelve `{ txHash }`

**Verificación end-to-end manual:**

1. Depositas ETH desde MetaMask como Alice (paga gas — depósito).
2. Creas propuesta como Alice (paga gas — creación).
3. Votas como Alice → **MetaMask te pide firmar (no enviar tx)**.
4. La transacción aparece on-chain con el relayer como `tx.from`, pero el contrato registra a Alice como votante.

---

## Fase 8 — Daemon de ejecución

**Objetivo:** ejecutar propuestas aprobadas automáticamente.

📖 **Lee:** [`04-relayer-y-daemon.md`](./04-relayer-y-daemon.md) → sección "Daemon"

Dos enfoques (elegimos según preferencia):

**A. Endpoint cron (recomendado):**
- `web/app/api/cron/execute/route.ts` — escanea propuestas, ejecuta las elegibles
- Lo invocas con `curl http://localhost:3000/api/cron/execute` cada N segundos desde un script o un cron del sistema

**B. Proceso Node aparte:**
- `web/scripts/daemon.ts` — `setInterval` que llama directamente al contrato

**Lógica:**

```
para cada proposalId en [1..nextId-1]:
  si !executed && now > deadline + securityDelay && forVotes > againstVotes:
    forwarder.execute o dao.executeProposal()
```

---

## Fase 9 — Pruebas E2E + documentación final

**Objetivo:** validar el escenario del brief y entregar.

📖 **Escenario del brief:**

1. Alice deposita 10 ETH.
2. Bob deposita 5 ETH.
3. Alice crea propuesta (>10%: tiene 10/15 = 66%).
4. Bob intenta crear propuesta (5/15 = 33% — *espera, eso sí supera 10%*; el caso borde real es alguien con <1.5 ETH).
5. Alice vota A FAVOR (gasless).
6. Bob vota EN CONTRA (gasless).
7. Charlie deposita 20 ETH.
8. Charlie vota A FAVOR (gasless).
9. Esperar deadline + delay.
10. Daemon ejecuta. El recipient recibe los ETH.

**Edge cases a verificar:**

- Votar en propuesta inexistente → revert
- Votar después del deadline → revert
- Ejecutar propuesta no aprobada → revert
- Ejecutar propuesta ya ejecutada → revert
- Cambiar voto antes del deadline → ok, contadores se actualizan
- Crear propuesta sin balance suficiente → revert

**Entregables finales:**

- README con capturas
- `docs/diagramas/` con flowcharts (sequence diagram del flujo gasless)
- Video o gif de demo

---

## Cómo trabajamos en cada fase

1. **Lee la teoría** del doc correspondiente.
2. **Pregúntame** lo que no entiendas — para eso estoy aquí.
3. **Yo escribo el código**, comentando las decisiones en `docs/`.
4. **Probamos juntos** (`forge test`, `npm run dev`).
5. **Commit incremental** con mensaje del estilo `feat(sc): MinimalForwarder + tests` o `docs: explicación EIP-2771`.
6. **Marcamos la fase completa** y pasamos a la siguiente.
