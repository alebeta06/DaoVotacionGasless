# 03 — Frontend (Next.js 15)

> Diseño y arquitectura del frontend. Se completa conforme avanzamos en las Fases 5-7.

---

## Stack

- **Next.js 15** con App Router (`app/` directory).
- **TypeScript strict.**
- **Tailwind v4** para estilos.
- **ethers.js v6** para interactuar con contratos.
- **MetaMask** como wallet (vía `window.ethereum`).

> Decidimos `ethers v6` y no `wagmi/viem` porque la consigna pide explícitamente `ethers.js`. En un proyecto real wagmi+viem es más ergonómico, pero seguimos el brief.

---

## Estructura

```
web/
├── app/
│   ├── layout.tsx             ← layout global (Tailwind, providers)
│   ├── page.tsx               ← landing
│   └── api/
│       ├── relay/route.ts     ← relayer gasless
│       └── cron/execute/route.ts  ← daemon
├── components/
│   ├── ConnectWallet.tsx
│   ├── DaoStats.tsx
│   ├── FundingPanel.tsx
│   ├── CreateProposal.tsx
│   ├── ProposalList.tsx
│   ├── ProposalCard.tsx
│   └── VoteButtons.tsx
├── lib/
│   ├── wallet.ts              ← getProvider, getSigner
│   ├── contracts.ts           ← instancias tipadas
│   ├── metaTx.ts              ← buildForwardRequest, signForwardRequest
│   └── abis/
│       ├── DAOVoting.json
│       └── MinimalForwarder.json
├── .env.example
├── next.config.ts
└── package.json
```

---

## Variables de entorno

`web/.env.example`:

```bash
# Públicas — accesibles desde el navegador
NEXT_PUBLIC_DAO_ADDRESS=0x...
NEXT_PUBLIC_FORWARDER_ADDRESS=0x...
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545

# Privadas — solo en server (API routes)
RELAYER_PRIVATE_KEY=0x...
RPC_URL=http://127.0.0.1:8545
```

⚠️ Cualquier `NEXT_PUBLIC_*` queda incrustada en el JS del cliente. **Jamás** pongas la `RELAYER_PRIVATE_KEY` con ese prefijo.

---

## Bootstrap (Fase 5)

```bash
npx create-next-app@latest web --typescript --tailwind --app --eslint --no-src-dir
cd web
npm install ethers
```

### `lib/wallet.ts`

```typescript
import { BrowserProvider, JsonRpcProvider } from "ethers";

export function getReadProvider() {
    return new JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL!);
}

export async function getBrowserProvider() {
    if (typeof window === "undefined" || !window.ethereum) {
        throw new Error("MetaMask no detectada");
    }
    return new BrowserProvider(window.ethereum);
}
```

### `lib/contracts.ts`

```typescript
import { Contract, Signer, Provider } from "ethers";
import daoAbi from "./abis/DAOVoting.json";
import fwdAbi from "./abis/MinimalForwarder.json";

export const DAO_ADDRESS = process.env.NEXT_PUBLIC_DAO_ADDRESS!;
export const FORWARDER_ADDRESS = process.env.NEXT_PUBLIC_FORWARDER_ADDRESS!;

export function getDao(runner: Signer | Provider) {
    return new Contract(DAO_ADDRESS, daoAbi, runner);
}
export function getForwarder(runner: Signer | Provider) {
    return new Contract(FORWARDER_ADDRESS, fwdAbi, runner);
}
```

### `components/ConnectWallet.tsx` (sketch)

- usa `BrowserProvider`
- `eth_requestAccounts` para pedir conexión
- listener `accountsChanged` y `chainChanged`
- guarda address y chainId en un Context global (o en estado local del componente raíz)

---

## Operaciones con valor (Fase 6)

Estas SÍ pagan gas (no son gasless):

### FundingPanel
```typescript
const dao = getDao(signer);
const tx = await dao.fundDAO({ value: parseEther(amount) });
await tx.wait();
```

### CreateProposal

Antes de submit: validar quórum del 10% en cliente para mejor UX (aunque el contrato también revierte):

```typescript
const myBalance = await dao.getUserBalance(address);
const total = await dao.totalDeposits();
if (myBalance * 10n < total) {
    showError("Necesitas al menos 10% del balance del DAO");
    return;
}
```

---

## Flujo gasless (Fase 7)

### `lib/metaTx.ts`

```typescript
export async function buildForwardRequest(
    signer: Signer,
    daoAddress: string,
    callData: string,
): Promise<ForwardRequest> {
    const from = await signer.getAddress();
    const fwd = getForwarder(signer);
    const nonce = await fwd.getNonce(from);
    return {
        from,
        to: daoAddress,
        value: 0n,
        gas: 200_000n,    // estimaremos mejor luego
        nonce: BigInt(nonce),
        data: callData,
    };
}

export async function signForwardRequest(
    signer: Signer,
    request: ForwardRequest,
): Promise<string> {
    const chainId = (await signer.provider!.getNetwork()).chainId;
    const domain = {
        name: "MinimalForwarder",
        version: "1",
        chainId,
        verifyingContract: FORWARDER_ADDRESS,
    };
    const types = {
        ForwardRequest: [
            { name: "from",  type: "address" },
            { name: "to",    type: "address" },
            { name: "value", type: "uint256" },
            { name: "gas",   type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "data",  type: "bytes"   },
        ],
    };
    return signer.signTypedData(domain, types, request);
}
```

### `app/api/relay/route.ts`

```typescript
import { NextResponse } from "next/server";
import { JsonRpcProvider, Wallet } from "ethers";
import { getForwarder } from "@/lib/contracts";

export async function POST(req: Request) {
    const { request, signature } = await req.json();

    const provider = new JsonRpcProvider(process.env.RPC_URL);
    const relayer = new Wallet(process.env.RELAYER_PRIVATE_KEY!, provider);
    const fwd = getForwarder(relayer);

    const ok = await fwd.verify(request, signature);
    if (!ok) return NextResponse.json({ error: "invalid signature" }, { status: 400 });

    const tx = await fwd.execute(request, signature, { gasLimit: request.gas + 50_000n });
    const receipt = await tx.wait();
    return NextResponse.json({ txHash: receipt.hash });
}
```

### `components/VoteButtons.tsx` (flujo)

1. Codificar calldata: `dao.interface.encodeFunctionData("vote", [proposalId, voteType])`
2. `buildForwardRequest(signer, DAO, calldata)`
3. `signForwardRequest(signer, request)` → MetaMask muestra el EIP-712 legible
4. `fetch("/api/relay", { method: "POST", body: JSON.stringify({ request, signature }) })`
5. Esperar respuesta → mostrar tx hash → refrescar contadores

---

## Patrones de UI

- **Estados de tx:** `idle | signing | relaying | confirmed | error`
- **Refresh:** después de cada acción exitosa, refrescar lista de propuestas con `dao.getProposal(id)` para cada id activo.
- **Indicador de voto del usuario:** `dao.hasVoted(id, address)` + `dao.votes(id, address)` para destacar el botón seleccionado.
- **Errores:** parsear revert reasons de ethers (`error.reason` o `error.shortMessage`).

---

## Manejo de errores comunes

| Error | Causa probable | Mensaje al usuario |
|-------|----------------|--------------------|
| `user rejected` | El usuario canceló MetaMask | "Cancelaste la firma" |
| `nonce too low` | Estado stale del cliente | "Refresca y vuelve a intentar" |
| `Below quorum` | <10% del DAO | "Necesitas al menos el 10% del balance" |
| `Voting ended` | Después del deadline | "La votación ya cerró" |
| MetaMask en otra red | chainId distinto a 31337 | "Cambia a la red local" + botón `wallet_switchEthereumChain` |
