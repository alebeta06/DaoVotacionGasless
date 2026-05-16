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

## Fase 5 — Bootstrap del frontend ✅ Fase 6 ✅ Fase 7 ✅ Fase 8 ✅ (estamos aquí, falta Fase 9)

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

Hay **dos formas** de validar el escenario, complementarias:

- **A. E2E automatizado** — `cd web && npm run e2e`. Levanta Anvil + deploy + `next dev`
  efímeros, simula el escenario completo golpeando `/api/relay` y `/api/cron/execute`
  reales, hace los `assert` y derriba todo. Teoría: `docs/04-relayer-y-daemon.md` →
  "Fase 9 — E2E automatizado".
- **B. Manual en el frontend** — con el stack persistente arriba y MetaMask. Es la que
  el corrector reproduce a mano; la detallamos abajo campo por campo.

📖 **Escenario del brief (resumen):**

1. Alice deposita 10 ETH.
2. Bob deposita 5 ETH.
3. Alice crea propuesta (>10%: tiene 10/15 = 66%).
4. Bob *podría* crear propuesta (5/15 = 33% ≥ 10%); el caso borde real que **debe
   fallar** es alguien con <10% (ej. 1 ETH sobre 35 → 2.8%).
5. Alice vota A FAVOR (gasless).
6. Bob vota EN CONTRA (gasless).
7. Charlie deposita 20 ETH.
8. Charlie vota A FAVOR (gasless).
9. Esperar deadline + delay.
10. Daemon ejecuta. El recipient recibe los ETH.

---

### Guía manual paso a paso en el frontend (`http://localhost:3000`)

**Pre-requisitos** (ver mensaje de arranque del stack):

- Anvil corriendo, contratos desplegados, `next dev` en `:3000`, `.env.local` apuntando
  a las addresses desplegadas.
- En MetaMask: red `Anvil Local` (RPC `http://127.0.0.1:8545`, chainId `31337`) e
  importadas las cuentas de Alice, Bob y Charlie.
- El **relayer** es la cuenta #9 de Anvil — está en `.env.local`, **no se importa a
  MetaMask**, paga el gas de los votos por detrás.

Cuentas (claves privadas estándar de Anvil):

| Rol | Address | Private key |
|-----|---------|-------------|
| Alice | `0x7099...79C8` | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| Bob | `0x3C44...93BC` | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` |
| Charlie | `0x90F7...b906` | `0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6` |
| Beneficiario (recipient) | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` | — (no se importa; solo recibe ETH) |

**Paso 1 — Alice deposita 10 ETH**
- Conecta MetaMask con la cuenta **Alice** y pulsa *Conectar*.
- Panel **"Depositar ETH al DAO"** → campo cantidad: `10` → botón **Depositar**.
- MetaMask pide **enviar transacción** (paga gas — está moviendo *su* ETH). Confirma.
- Verifica en **DaoStats**: balance total `10 ETH`, tu balance `10 ETH`, tu % `100%`.

**Paso 2 — Bob deposita 5 ETH**
- Cambia la cuenta activa de MetaMask a **Bob**, reconecta.
- Panel "Depositar ETH al DAO" → `5` → **Depositar** → confirmar tx.
- DaoStats ahora: total `15 ETH`, balance de Bob `5 ETH`, su % ≈ `33%`.

**Paso 3 — Alice crea la propuesta** (tiene 10/15 = 66% ≥ 10%, puede)
- Vuelve a la cuenta **Alice**.
- Panel **"Crear propuesta"**, rellena los campos así:

| Campo | Qué poner | Por qué |
|-------|-----------|---------|
| **Descripción** | `Financiar la construcción de una escuela` | Obligatorio (revert `EmptyDescription` si vacío). Texto libre, no puede ser solo espacios. |
| **Beneficiario** | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` | Address que recibirá los ETH al ejecutar. Debe ser una address válida (revert `ZeroRecipient` si es `0x0`). |
| **Cantidad (ETH)** | `4` | Monto que se transferirá al beneficiario. Debe ser > 0 (revert `ZeroAmount`). No puede exceder el balance del DAO al ejecutar. |
| **Deadline** | déjala en el valor por defecto (ahora + 1 h) o pon una fecha/hora futura | Cierre de la votación. Debe estar en el futuro (revert `InvalidDeadline`). Tras el deadline **no se puede votar** y empieza a contar el `SECURITY_DELAY` de 1 h antes de poder ejecutar. |

- Pulsa **Crear propuesta** → MetaMask pide **enviar transacción** (paga gas — crear
  propuesta es acción puntual y sensible al quórum). Confirma.
- El botón muestra `✓ Propuesta #1`. Aparece en **ProposalList** con su descripción y
  contadores en 0.

**Paso 3-bis (edge case del brief) — un usuario con <10% NO puede proponer**
- Importa una 4ª cuenta cualquiera, deposita `1 ETH` (queda con 1/16 ≈ 6%).
- Intenta crear propuesta → debe fallar con **"No tienes el 10% requerido para crear
  una propuesta"** (`InsufficientQuorumToPropose`).

**Paso 4 — Alice vota A FAVOR (gasless)** 🎯
- Con la cuenta **Alice**, en la propuesta #1 pulsa el botón verde **"A favor"**.
- MetaMask abre una ventana de **firma de datos tipados (EIP-712)**, *no* de envío de
  transacción. **No te cobra gas.** Firma.
- El voto se manda a `/api/relay`; el relayer paga el gas. `forVotes` pasa a `1`.

**Paso 5 — Bob vota EN CONTRA (gasless)**
- Cambia a **Bob**, pulsa el botón rojo **"En contra"** → firma EIP-712 (sin gas).
- `againstVotes` pasa a `1`. (Conteo 1-a-1: Bob suma 1, no su balance.)

**Paso 6 — Charlie deposita 20 ETH y vota A FAVOR (gasless)**
- Importa/activa **Charlie**, panel "Depositar ETH al DAO" → `20` → **Depositar**
  (confirma tx, paga gas).
- En la propuesta #1 pulsa **"A favor"** → firma EIP-712 (sin gas).
- Estado esperado: `forVotes = 2` (Alice + Charlie), `againstVotes = 1` (Bob),
  `abstainVotes = 0`. **Cada votante cuenta 1**, da igual que Charlie depositara 20.

**Paso 7 — Esperar deadline + `SECURITY_DELAY` (1 h)**
- A mano son ~2 h reales: en local **adelantamos el reloj de Anvil** con `cast`:

  ```bash
  # avanza ~2 h y mina un bloque para que el nuevo timestamp tome efecto
  cast rpc evm_increaseTime 7260 --rpc-url http://127.0.0.1:8545
  cast rpc evm_mine --rpc-url http://127.0.0.1:8545
  ```

**Paso 8 — El daemon ejecuta**
- Panel **"Ejecutar propuestas elegibles"** → botón → llama a `GET /api/cron/execute`.
- El daemon escanea: la #1 cumple `now ≥ deadline + SECURITY_DELAY` y
  `forVotes (2) > againstVotes (1)` → llama `executeProposal(1)`.
- Verifica el resultado: `Escaneadas: 1 · Ejecutadas: 1`.
- El **beneficiario** `0x15d3…6A65` recibe **4 ETH**. Compruébalo:

  ```bash
  cast balance 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 \
    --rpc-url http://127.0.0.1:8545 --ether
  ```
- La propuesta queda marcada como **ejecutada** (no se puede re-ejecutar).

**Edge cases a verificar (manual o vía tests de Foundry ya escritos):**

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
