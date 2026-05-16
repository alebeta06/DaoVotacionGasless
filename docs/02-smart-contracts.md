# 02 — Smart Contracts

> Documentación de diseño de los dos contratos. Se rellena conforme avanzamos en cada fase.

---

## Visión general

```
┌──────────────────────┐         ┌──────────────────────┐
│  MinimalForwarder    │         │     DAOVoting        │
│  ─────────────────   │         │  ──────────────────  │
│  + verify()          │         │  is ERC2771Context   │
│  + execute() payable │ ──────▶ │                      │
│  + getNonce()        │  call   │  + fundDAO()         │
│                      │         │  + createProposal()  │
│  Verifica firmas     │         │  + vote()  ← gasless │
│  EIP-712 + ECDSA     │         │  + executeProposal() │
│  Nonces por user     │         │                      │
└──────────────────────┘         └──────────────────────┘
        ▲                                  │
        │ msg.sender                       │ _msgSender() lee
        │                                  ▼
        usuario original (los últimos 20 bytes del calldata)
```

---

## MinimalForwarder

### Responsabilidades

1. Definir la estructura `ForwardRequest`.
2. Verificar firmas EIP-712.
3. Mantener nonces por usuario.
4. Ejecutar la llamada al target append-eando la dirección del usuario al calldata (esto es lo que `ERC2771Context` lee después).

### Estructura

```solidity
struct ForwardRequest {
    address from;       // usuario original
    address to;         // contrato destino (DAOVoting)
    uint256 value;      // ETH a enviar (normalmente 0 en una votación)
    uint256 gas;        // gas que el usuario autoriza usar
    uint256 nonce;      // contador anti-replay
    bytes   data;       // calldata para el contrato destino
}
```

### Tipo EIP-712

```solidity
bytes32 private constant TYPEHASH = keccak256(
    "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,bytes data)"
);
```

El **domain separator** se construye con `EIP712("MinimalForwarder", "1")` de OpenZeppelin.

### Pseudocódigo de `verify` y `execute`

```
verify(req, signature):
    digest = _hashTypedDataV4(keccak256(abi.encode(TYPEHASH, ...req)))
    signer = ECDSA.recover(digest, signature)
    return nonces[req.from] == req.nonce && signer == req.from

execute(req, signature):
    require(verify(req, signature))
    nonces[req.from]++
    (success, returnData) = req.to.call{gas: req.gas, value: req.value}(
        abi.encodePacked(req.data, req.from)   // ← el "append": esto es 2771
    )
    require(gasleft() > req.gas / 63, "insufficient gas")
    return (success, returnData)
```

> 💡 El `gasleft()` check evita un ataque donde el relayer manda menos gas del autorizado, haciendo que la llamada falle silenciosamente pero el nonce ya se haya incrementado.

### Tests mínimos (Fase 2)

| # | Test | Qué valida |
|---|------|------------|
| 1 | `test_GetNonce_StartsAtZero` | Nonce inicial 0 |
| 2 | `test_Verify_ValidSignature` | Firma correcta pasa |
| 3 | `testRevert_Execute_WrongNonce` | Nonce repetido falla |
| 4 | `testRevert_Execute_WrongSigner` | Firma de otro usuario falla |
| 5 | `test_Execute_IncrementsNonce` | Tras `execute`, el nonce sube |
| 6 | `test_Execute_AppendsSenderToCalldata` | El target recibe el `from` al final del calldata |
| 7 | `testRevert_Execute_InsufficientGas` | El check de gas funciona |

---

## DAOVoting

### Responsabilidades

1. Recibir y custodiar ETH (`fundDAO`, fallback `receive`).
2. Llevar contabilidad de balances por usuario.
3. Permitir crear propuestas (con quórum mínimo del 10%).
4. Permitir votar (gasless vía forwarder).
5. Ejecutar propuestas aprobadas tras deadline + delay.

### Estructuras

```solidity
enum VoteType { AGAINST, FOR, ABSTAIN }

struct Proposal {
    uint256 id;
    address proposer;
    address recipient;
    uint256 amount;
    uint256 deadline;       // timestamp en el que termina la votación
    uint256 forVotes;
    uint256 againstVotes;
    uint256 abstainVotes;
    bool    executed;
}

mapping(address => uint256) public balanceOf;          // ETH depositado por usuario
mapping(uint256 => Proposal) public proposals;
mapping(uint256 => mapping(address => VoteType)) public votes;     // votedAs
mapping(uint256 => mapping(address => bool))     public hasVoted;
uint256 public nextProposalId = 1;
uint256 public totalDeposits;
uint256 public constant SECURITY_DELAY = 1 hours;      // delay extra antes de ejecutar
```

### Reglas (de la consigna)

- **Crear propuesta:** `balanceOf[_msgSender()] * 10 >= address(this).balance` (el 10% se mide
  sobre el **tesoro real**, no sobre el aporte histórico — ver "Modelo contable A+").
- **Votar:** `balanceOf[_msgSender()] > 0` y `block.timestamp < proposal.deadline`.
- **Cambiar voto:** permitido si `block.timestamp < proposal.deadline`.
- **Ejecutar:** `block.timestamp >= proposal.deadline + SECURITY_DELAY` y `forVotes > againstVotes`
  y `!executed` y `address(this).balance >= amount` (solvencia, error `InsufficientTreasury`).

### Modelo contable A+ — "tesoro real"

Decisión de diseño (2026-05-16). En este proyecto hay **dos cantidades distintas** que
es fácil confundir:

| | Qué es | Cómo se mueve |
|---|--------|---------------|
| `balanceOf[user]` / `totalDeposits` | **Aporte acumulado** del usuario / total histórico. Es el **peso de gobernanza**: habilita votar (`> 0`) y se usa como numerador del gate del 10%. | Solo sube (en `fundDAO`/`receive`). **Nunca** baja al ejecutar. |
| `address(this).balance` | El **tesoro real**: ETH que el contrato puede gastar de verdad. | Sube al depositar, **baja** cuando una propuesta ejecutada paga al beneficiario. |

Tras ejecutar una propuesta, estas dos divergen a propósito: si Alice aportó 10 ETH y el
DAO pagó 4 a un beneficiario, `balanceOf[alice]` sigue siendo 10 (su *aporte* no cambió;
el dinero salió del **pozo común**, no "de Alice"), pero el tesoro real bajó a 6.

El **modelo A+** consiste en:

1. **Gate del 10% contra el tesoro real:** `balanceOf[proposer] * 10 >= address(this).balance`.
   Así "≥10% del balance del DAO" significa 10% del dinero **realmente disponible**, no del
   histórico inflado por `totalDeposits`.
2. **Check de solvencia al ejecutar:** no se paga si `address(this).balance < amount`
   (error custom `InsufficientTreasury`), evitando un revert opaco del `call`.
3. **Getter `treasury()`** = `address(this).balance`, para que el frontend muestre el
   dinero real disponible y el `%` reflejado en la UI sea consistente con el contrato.

> ⚠️ **Matiz aceptado:** el numerador (`balanceOf`, acumulado) y el denominador
> (`address(this).balance`, que decrece) son de naturaleza distinta. Tras pagos grandes
> el tesoro encoge y el gate del 10% se **vuelve más fácil** de superar (e incluso el
> `%` mostrado puede pasar de 100%). Es una consecuencia consciente de mantener
> `balanceOf` como peso de gobernanza no retirable (no hay `withdraw` en este contrato).
> `totalDeposits` se conserva solo como dato informativo del total históricamente aportado.

### Lógica de cambio de voto

```
si hasVoted[id][user]:
    voteType anterior = votes[id][user]
    decrementar el contador correspondiente
votes[id][user] = nuevoVoto
hasVoted[id][user] = true
incrementar el contador correspondiente
```

### Eventos

```solidity
event Funded(address indexed user, uint256 amount, uint256 newBalance);
event ProposalCreated(uint256 indexed id, address indexed proposer, address recipient, uint256 amount, uint256 deadline);
event Voted(uint256 indexed id, address indexed voter, VoteType voteType);
event ProposalExecuted(uint256 indexed id, address indexed recipient, uint256 amount);
```

### Por qué `_msgSender()` y no `msg.sender`

`vote()` y `createProposal()` deben funcionar tanto si las llama el usuario directamente como si las llama vía forwarder (gasless). Si usamos `msg.sender`:

- llamada directa: `msg.sender = usuario` ✅
- vía forwarder: `msg.sender = forwarder` ❌ (estaríamos contando los votos del forwarder, que siempre será el mismo)

`_msgSender()` (de `ERC2771Context`) devuelve siempre el usuario real.

### Tests mínimos (Fase 3)

| # | Test | Qué valida |
|---|------|------------|
| 1 | `test_FundDAO` | El balance sube |
| 2 | `testRevert_CreateProposal_BelowQuorum` | <10% revierte |
| 3 | `test_CreateProposal_AtQuorum` | Exactamente 10% pasa |
| 4 | `test_Vote_For/Against/Abstain` | Contadores correctos |
| 5 | `test_Vote_Change` | Cambiar voto actualiza contadores |
| 6 | `testRevert_Vote_AfterDeadline` | Votar tarde revierte |
| 7 | `testRevert_Vote_NoBalance` | Sin balance revierte |
| 8 | `test_Vote_Gasless` | Votar vía forwarder atribuye correctamente |
| 9 | `test_Execute_Success` | Recipient recibe ETH |
| 10 | `testRevert_Execute_Early` | Antes de deadline+delay revierte |
| 11 | `testRevert_Execute_NotApproved` | Sin mayoría revierte |
| 12 | `testRevert_Execute_Twice` | Segunda ejecución revierte |

---

## Deployment

### Anvil (local)

```bash
anvil   # en otra terminal — chainId 31337
```

```solidity
// sc/script/Deploy.s.sol
contract Deploy is Script {
    function run() external {
        vm.startBroadcast();
        MinimalForwarder fwd = new MinimalForwarder();
        DAOVoting dao = new DAOVoting(address(fwd));
        vm.stopBroadcast();

        console.log("Forwarder:", address(fwd));
        console.log("DAO:", address(dao));
    }
}
```

```bash
forge script script/Deploy.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --broadcast
```

### Testnet (Sepolia/Holesky)

Mismo script con otra `--rpc-url` y la private key de una cuenta con ETH de testnet. Ojo: nunca commitear esa key.

---

## Checklist final del módulo de contratos

- [ ] `forge build` sin warnings
- [ ] `forge test -vvv` todos los tests verdes
- [ ] `forge coverage` ≥ 80%
- [ ] `forge fmt --check` limpio
- [ ] Deploy funciona en Anvil
- [ ] Las dos addresses se exportan correctamente para el frontend
