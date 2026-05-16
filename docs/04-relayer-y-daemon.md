# 04 — Relayer y daemon

> Cómo funciona el flujo gasless end-to-end y cómo se ejecutan las propuestas automáticamente.

---

## El relayer (`/api/relay`)

### ¿Quién es y qué hace?

El **relayer** es una cuenta Ethereum normal (con ETH para gas) que vive como **API route** en Next.js. Su única función:

1. Recibir un POST con `{ request, signature }`.
2. Validar la firma vía `MinimalForwarder.verify()`.
3. Llamar a `MinimalForwarder.execute(request, signature)` pagando gas con su propia private key.
4. Devolver el `txHash`.

### Por qué API route y no script aparte

- Aprovecha el server de Next.js que ya está corriendo.
- Mantiene la `RELAYER_PRIVATE_KEY` **fuera del cliente** (las API routes corren server-side).
- Misma URL pública que el frontend (`/api/relay`), simple de consumir desde el navegador.

### Seguridad del relayer

⚠️ La private key del relayer debe vivir en `.env.local` o en un secret manager (Vercel env, AWS Secrets, etc.). **Nunca** en un `NEXT_PUBLIC_*` ni commiteada.

**Riesgos prácticos:**

- **DoS por spam:** alguien manda firmas inválidas masivamente. Mitigación: rate-limit por IP, o requerir un captcha leve.
- **DoS por gas:** alguien manda firmas válidas que cuestan mucho gas. Mitigación: validar que `request.to == DAO` y que el calldata empieza por el selector de `vote()` (whitelist de funciones).
- **Drenaje de saldo:** el relayer paga gas hasta agotar fondos. Mitigación: monitorear balance, alertar si baja del umbral.

Para este proyecto educativo, **no** implementamos rate-limit ni captcha — pero documentamos la limitación.

---

## Flujo gasless paso a paso

```
                                          ┌────────────────────────────────────────┐
1. Usuario click "Votar A FAVOR"          │ FRONTEND (componente VoteButtons)      │
   │                                      │                                        │
   ▼                                      │                                        │
2. const calldata = dao.interface.encode  │  encode("vote", [proposalId, FOR])     │
   │                                      │                                        │
   ▼                                      │                                        │
3. const req = await buildForwardRequest( │  pide nonce al Forwarder               │
        signer, DAO, calldata             │                                        │
   )                                      │                                        │
   │                                      │                                        │
   ▼                                      │                                        │
4. const sig = await signer.signTypedData │  ← MetaMask abre popup con datos       │
        (domain, types, req)              │    EIP-712 legibles                    │
   │                                      └────────────────────────────────────────┘
   │
   │   POST { request, signature }
   ▼
                                          ┌────────────────────────────────────────┐
5. /api/relay (server-side)               │ SERVER (api/relay/route.ts)            │
   │                                      │                                        │
   ▼                                      │                                        │
6. await fwd.verify(req, sig)             │  ECDSA recover → from? nonce match?    │
   │                                      │                                        │
   ▼                                      │                                        │
7. await fwd.execute(req, sig)            │  paga gas con RELAYER_PRIVATE_KEY      │
   │                                      └────────────────────────────────────────┘
   │
   │   tx enviada a la blockchain
   ▼
                                          ┌────────────────────────────────────────┐
8. MinimalForwarder.execute()             │ ON-CHAIN                               │
       verify(req, sig)                   │                                        │
       nonces[req.from]++                 │                                        │
       call req.to with                   │                                        │
         abi.encodePacked(                │                                        │
           req.data,                      │                                        │
           req.from   ← append crítico    │                                        │
         )                                │                                        │
   │                                      │                                        │
   ▼                                      │                                        │
9. DAOVoting.vote(proposalId, FOR)        │  msg.sender = forwarder                │
       _msgSender() lee últimos 20 bytes  │  _msgSender() = req.from = usuario     │
       balanceOf[_msgSender()] > 0   ✅    │                                        │
       registra voto                      │                                        │
       emit Voted(...)                    │                                        │
   │                                      └────────────────────────────────────────┘
   │
   ▼   tx hash devuelta al cliente, frontend refresca contadores
```

**Lo que ve el usuario:**

- Un solo popup de MetaMask **firmando** (no enviando tx). No paga gas. La firma es instantánea.
- En el bloque, la transacción aparece con `from = relayer` pero los logs/eventos del DAO muestran al usuario real.

---

## Daemon de ejecución

### Por qué hace falta

El contrato `executeProposal()` no se ejecuta solo. Alguien tiene que **invocarla**. Como queremos que el flujo sea automático para el usuario, montamos un **daemon** que cada cierto tiempo:

1. Recorre las propuestas (`for id in 1..nextProposalId-1`).
2. Para cada una: lee `getProposal(id)`.
3. Si `!executed && now > deadline + SECURITY_DELAY && forVotes > againstVotes` → ejecuta.

### Implementación elegida: API route + cron externo

`web/app/api/cron/execute/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { JsonRpcProvider, Wallet } from "ethers";
import { getDao } from "@/lib/contracts";

export async function GET() {
    const provider = new JsonRpcProvider(process.env.RPC_URL);
    const relayer = new Wallet(process.env.RELAYER_PRIVATE_KEY!, provider);
    const dao = getDao(relayer);
    const next = await dao.nextProposalId();
    const executed: number[] = [];

    for (let id = 1n; id < next; id++) {
        const p = await dao.getProposal(id);
        if (p.executed) continue;
        const now = BigInt(Math.floor(Date.now() / 1000));
        const securityDelay = await dao.SECURITY_DELAY();
        if (now < p.deadline + securityDelay) continue;
        if (p.forVotes <= p.againstVotes) continue;

        try {
            const tx = await dao.executeProposal(id);
            await tx.wait();
            executed.push(Number(id));
            console.log(`[daemon] executed proposal ${id}: tx ${tx.hash}`);
        } catch (e) {
            console.error(`[daemon] failed to execute ${id}:`, e);
        }
    }
    return NextResponse.json({ executed });
}
```

### Cómo se invoca el daemon

**Opción A — manual / curl:**
```bash
curl http://localhost:3000/api/cron/execute
```

**Opción B — bucle simple en otra terminal:**
```bash
while true; do
    curl -s http://localhost:3000/api/cron/execute
    echo
    sleep 30
done
```

**Opción C — Vercel Cron (producción):** `vercel.json`:
```json
{
  "crons": [{ "path": "/api/cron/execute", "schedule": "*/5 * * * *" }]
}
```

### ¿Por qué `executeProposal` NO es gasless?

Buena pregunta. Podríamos hacerla gasless, pero el daemon **ya es** un servicio que paga gas. Ejecutar directamente desde el daemon es más simple:

- Sin firma del usuario (la ejecución no requiere consentimiento — las reglas ya se cumplieron).
- Sin overhead de meta-tx.
- El daemon tiene su propia key con ETH para gas (puede ser la misma del relayer).

### Logging

El daemon debe registrar:

- propuestas escaneadas
- propuestas ejecutadas (con `txHash`)
- propuestas falladas (con error)

Esto cumple el requisito del brief: *"Logging de ejecuciones"*.

---

## Resumen: ¿qué paga gas y qué no?

| Acción | Quién paga gas | Mecanismo |
|--------|----------------|-----------|
| `fundDAO()` (depositar ETH) | El usuario | Tx normal desde MetaMask |
| `createProposal()` | El usuario | Tx normal — solo se hace una vez por propuesta |
| `vote()` | **El relayer** | Meta-tx EIP-2771 vía `/api/relay` |
| `executeProposal()` | **El daemon** | Tx normal del daemon, no requiere firma |

---

## Fase 9 — E2E automatizado del escenario del brief

Los tests de Foundry (`forge test`) ya validan los contratos y la matemática de la
meta-tx **en aislamiento**: firman el `ForwardRequest` dentro del propio test y llaman
a `forwarder.execute()` directo. Eso prueba el contrato, pero **no prueba el stack**:

- que el endpoint HTTP `/api/relay` arme bien el `ForwardRequest`, valide la firma con
  `forwarder.verify()` y pague el gas con la *hot key* del relayer;
- que el daemon `/api/cron/execute` escanee propuestas y dispare `executeProposal()`.

Por eso la Fase 9 añade un **orquestador E2E** (`web/scripts/e2e.mjs`, vía `npm run e2e`)
que reproduce el escenario del brief contra el sistema **real corriendo**:

```
anvil (efímero)
  └─▶ forge script Deploy           (despliega Forwarder + DAO)
        └─▶ escribe web/.env.local  (addresses + RELAYER_PRIVATE_KEY)
              └─▶ next dev          (lee ese .env.local al arrancar)
                    └─▶ escenario:
                        Alice fundDAO 10 ETH        (tx normal, paga gas)
                        Bob   fundDAO  5 ETH        (tx normal, paga gas)
                        Alice createProposal(4 ETH) (tx normal, paga gas)
                        Alice  vota FOR     ──▶ POST /api/relay   (gasless)
                        Bob    vota AGAINST ──▶ POST /api/relay   (gasless)
                        Charlie fundDAO 20 ETH + vota FOR ──▶ /api/relay
                        evm_increase_time  (pasa deadline + SECURITY_DELAY)
                        GET /api/cron/execute  (el daemon ejecuta)
                        assert: recipient recibió 4 ETH, forVotes=2, againstVotes=1
```

Diferencia clave con la migración a *one-person-one-vote*: el `assert` final espera
**`forVotes == 2`** (Alice + Charlie, un voto cada uno) y **no** una suma ponderada por
el ETH depositado. Si alguien reintrodujera el modelo ponderado, este E2E fallaría
(Charlie depositó 20 ETH y rompería el conteo esperado).

El script firma los votos con la clave de cada votante **localmente** (igual que haría
la wallet del usuario en el navegador) y solo manda al servidor `{ request, signature }`
— nunca la clave privada del votante sale del cliente. La única *hot key* del lado
servidor es la del relayer/daemon, exactamente como en producción.

Al terminar (éxito o fallo) mata `anvil` y `next dev`, así que no deja procesos vivos
ni toca tu `.env.local` real más allá de lo necesario (hace backup y lo restaura).

> El brief solo exige que **votar** sea gasless (la acción más frecuente). Depositar y crear propuesta son operaciones puntuales y razonables que el usuario pague.
