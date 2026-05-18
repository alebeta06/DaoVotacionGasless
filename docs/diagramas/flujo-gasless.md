# Diagramas — Flujo gasless (EIP-2771)

> Diagramas de secuencia del proyecto. GitHub renderiza los bloques ` ```mermaid `
> automáticamente. Teoría asociada: [`../04-relayer-y-daemon.md`](../04-relayer-y-daemon.md).

---

## 1. ⭐ Voto gasless — el flujo estrella

Cómo Alice vota **sin pagar gas**: firma una meta-transacción EIP-712 off-chain; el
relayer la ejecuta on-chain pagando el gas; el contrato atribuye el voto a Alice (no al
relayer) gracias a `ERC2771Context._msgSender()`.

```mermaid
sequenceDiagram
    autonumber
    actor Alice as Alice (wallet)
    participant FE as Frontend<br/>(VoteButtons.tsx)
    participant API as Relayer API<br/>(/api/relay)
    participant FW as MinimalForwarder
    participant DAO as DAOVoting

    Note over Alice,DAO: Alice ya depositó ETH (tiene balanceOf > 0)

    Alice->>FE: Click "A favor" en la propuesta #1
    FE->>FW: getNonce(alice)  (lectura, sin gas)
    FW-->>FE: nonce
    FE->>FE: encode vote(id, FOR) → calldata
    FE->>FE: build ForwardRequest{from,to,value,gas,nonce,data}
    FE->>Alice: signTypedData (EIP-712)  ← MetaMask pide FIRMAR
    Alice-->>FE: signature (NO envía tx, NO paga gas)
    FE->>API: POST {request, signature}

    Note over API: El relayer tiene una hot key con ETH
    API->>FW: verify(request, signature)  (lectura)
    FW-->>API: true
    API->>FW: execute(request, signature)  ← el RELAYER paga el gas
    activate FW
    FW->>FW: recover signer == request.from ?
    FW->>FW: _nonces[from] == request.nonce ?
    FW->>FW: _nonces[from] += 1  (anti-replay)
    FW->>DAO: call vote(id, FOR) + append(from)
    activate DAO
    DAO->>DAO: voter = _msgSender()  → extrae a ALICE<br/>(forwarder de confianza, ERC2771)
    DAO->>DAO: registra/actualiza voto (1 persona = 1 voto)
    DAO-->>FW: ok
    deactivate DAO
    FW-->>API: (success, returnData)
    deactivate FW
    API-->>FE: { txHash }
    FE-->>Alice: ✓ voto registrado (UI actualiza contadores)
```

**Claves del diagrama:**

- Pasos **7–8**: Alice **firma**, no envía transacción → coste de gas para ella = **0**.
- Paso **13**: el `execute` lo manda el **relayer** desde su propia wallet → él paga el gas.
- Paso **17**: `_msgSender()` de `ERC2771Context` devuelve **Alice**, no el relayer ni el
  forwarder, porque el forwarder añade `request.from` al final del calldata y el DAO
  confía en él (se lo pasó en el constructor).
- Pasos **14–16**: verificación de firma + nonce → **anti-replay** (una firma no se
  puede reusar).

---

## 2. Ejecución de una propuesta por el daemon

Esto **no es gasless**: el daemon es un servicio con su propia key que paga el gas
directamente. No requiere firma de ningún usuario (las reglas ya se cumplieron).

```mermaid
sequenceDiagram
    autonumber
    participant Cron as Disparador<br/>(curl / botón UI)
    participant API as Daemon API<br/>(/api/cron/execute)
    participant DAO as DAOVoting
    actor Rec as Beneficiario

    Cron->>API: GET /api/cron/execute
    API->>DAO: nextProposalId() · SECURITY_DELAY()
    DAO-->>API: valores
    loop para cada propuesta id en [1 .. nextId-1]
        API->>DAO: getProposal(id)
        DAO-->>API: {deadline, forVotes, againstVotes, executed, amount}
        alt executed == true
            API->>API: skip ("ya ejecutada")
        else now < deadline + SECURITY_DELAY
            API->>API: skip ("falta delay")
        else forVotes <= againstVotes
            API->>API: skip ("no aprobada")
        else elegible
            API->>DAO: executeProposal(id)  ← el DAEMON paga el gas
            activate DAO
            DAO->>DAO: revalida deadline + delay + mayoría
            DAO->>DAO: solvencia: balance >= amount ?<br/>(si no → InsufficientTreasury)
            DAO->>DAO: executed = true
            DAO->>Rec: transfiere `amount` ETH
            DAO-->>API: ProposalExecuted(id, recipient, amount)
            deactivate DAO
            API->>API: log {id, status: executed, txHash}
        end
    end
    API-->>Cron: { scanned, executed, results[] }
```

**Claves del diagrama:**

- El daemon **filtra** off-chain (skips) pero el contrato **revalida** todo on-chain en
  `executeProposal` — nunca se confía solo en el cliente.
- Check de **solvencia** (modelo A+): si el tesoro real no cubre el `amount`, revierte
  con `InsufficientTreasury` en vez de un fallo opaco del `call`.
- El pago sale del **pozo común** del contrato; `balanceOf`/`totalDeposits` no se tocan
  (siguen siendo peso de gobernanza).

---

## 3. Quién paga gas y quién no (vista global)

```mermaid
flowchart LR
    subgraph paga["Paga gas el USUARIO (tx normal)"]
        F[fundDAO -- depositar ETH]
        C[createProposal -- crear propuesta]
    end
    subgraph relayer["Paga gas el RELAYER (meta-tx EIP-2771)"]
        V[vote -- VOTAR ⭐ gasless]
    end
    subgraph daemon["Paga gas el DAEMON (tx propia)"]
        E[executeProposal -- ejecutar]
    end

    F --> C --> V --> E
    style V fill:#10b981,color:#fff
```

> El brief solo exige que **votar** sea gasless (la acción más frecuente). Depositar y
> crear propuesta son operaciones puntuales que es razonable que pague el usuario.
