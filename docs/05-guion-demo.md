# 05 — Guión del video de demostración

> Guión para grabar la pantalla usando la app. Pensado para un video de **~5–6 min**.
> Cada escena tiene: **🎬 Acción** (qué hacer en pantalla), **🎙️ Narración** (qué decir,
> texto listo para leer) y **✅ En pantalla** (qué debe verse / resultado esperado).
>
> Objetivo: que el video cubra la rúbrica (40% contratos · 30% frontend · 20% meta-tx ·
> 10% docs). La **pieza estrella es el voto gasless** — dale aire.

---

## 0. Pre-vuelo (antes de pulsar REC)

Entorno limpio para que la demo no tenga sorpresas:

```bash
# 1. Anvil fresco (resetea reloj y nonces; addresses deterministas)
pkill -x anvil; anvil

# 2. Redeploy (otra terminal, desde sc/)
forge script script/Deploy.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --broadcast

# 3. Frontend (desde web/)
npm run dev
```

- En **MetaMask**: red `Anvil Local` (RPC `http://127.0.0.1:8545`, chainId `31337`).
  En cada cuenta que uses → *Configuración → Avanzado → Borrar datos de actividad*
  (Anvil reinició, los nonces vuelven a 0).
- Cuentas importadas: **Alice** (#1), **Bob** (#2), **Charlie** (#3). El
  **beneficiario** es `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` (no se importa).
- El **relayer** (#9) ya está en `.env.local` — **no se importa a MetaMask**.

**Checklist de grabación:**

- [ ] Zoom del navegador a ~110–125 % (que se lea en video).
- [ ] Ventana de MetaMask visible al lado o se abre encima — ensaya el encuadre.
- [ ] **Nunca** muestres las claves privadas en pantalla (ni el `.env.local`, ni la
      terminal con la `--private-key`). Si grabas terminal, ten esa parte ya hecha.
- [ ] Una terminal pequeña visible solo para el `cast balance` final (opcional pero
      vistoso).
- [ ] Cierra pestañas/notificaciones que distraigan.

---

## 1. Intro — qué es el proyecto (~30 s)

**🎬 Acción:** pantalla del proyecto abierta en `http://localhost:3000`, sin conectar.

**🎙️ Narración:**
> "Esto es una DAO de votación **sin gas**. Los usuarios depositan ETH, crean
> propuestas y votan, pero **votar no les cuesta gas**: firman la votación fuera de
> la cadena y un *relayer* paga el gas por ellos, usando meta-transacciones del
> estándar EIP-2771. Voy a recorrer el flujo completo del brief."

**✅ En pantalla:** landing con el botón de conectar wallet.

---

## 2. Conectar wallet — Alice (~20 s)

**🎬 Acción:** MetaMask en la cuenta **Alice**. Pulsa *Conectar*.

**🎙️ Narración:**
> "Me conecto como Alice. La app detecta la red local de Anvil, chainId 31337."

**✅ En pantalla:** address de Alice visible; panel de **stats del DAO** con
`Tesoro DAO: 0.0 ETH`, `Tu aporte: 0.0 ETH`, `Tu % del tesoro: 0.00%` con el aviso
*"Necesitas ≥ 10% del tesoro para proponer"*.

---

## 3. Alice deposita 10 ETH — esto SÍ paga gas (~40 s)

**🎬 Acción:** panel **"Depositar ETH al DAO"** → escribe `10` → botón **Depositar**.
MetaMask abre una ventana de **confirmar transacción**. Confírmala.

**🎙️ Narración:**
> "Alice deposita 10 ETH. Fíjate: MetaMask me pide **enviar una transacción** y
> pagar gas. Esto es correcto — está moviendo *su* dinero al tesoro de la DAO; solo
> la **votación** será gasless, no el depósito."

**✅ En pantalla:** tras confirmar, las stats actualizan a `Tesoro DAO: 10.0 ETH`,
`Tu aporte: 10.0 ETH`, `Tu % del tesoro: 100.00%`, aviso *"✓ Puedes proponer"*.

---

## 4. Bob deposita 5 ETH (~30 s)

**🎬 Acción:** cambia la cuenta activa de MetaMask a **Bob**, reconecta. Panel
"Depositar ETH al DAO" → `5` → **Depositar** → confirmar.

**🎙️ Narración:**
> "Cambio a Bob y deposita 5 ETH. El tesoro de la DAO sube a 15. El aporte de cada
> uno es su **peso de gobernanza**."

**✅ En pantalla:** `Tesoro DAO: 15.0 ETH`, el aporte de Bob `5.0 ETH`, su % ≈ `33%`.

---

## 5. Alice crea la propuesta (~60 s) — campo por campo

**🎬 Acción:** vuelve a **Alice**. Panel **"Crear propuesta"**. Rellena despacio,
nombrando cada campo en voz alta:

| Campo | Valor a escribir |
|-------|------------------|
| **Descripción** | `Financiar la construcción de una escuela` |
| **Beneficiario** | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` |
| **Cantidad (ETH)** | `4` |
| **Deadline** | déjala en el valor por defecto (o una fecha futura) |

Pulsa **Crear propuesta** → MetaMask pide **confirmar transacción** → confirma.

**🎙️ Narración:**
> "Alice crea una propuesta: una **descripción obligatoria** —el contrato rechaza
> propuestas sin texto—, el beneficiario que recibirá el dinero, la cantidad de 4
> ETH y la fecha de cierre. Solo puede proponer porque tiene al menos el **10 % del
> tesoro real** de la DAO. Esto también paga gas: crear propuesta es una acción
> puntual y sensible al quórum."

**✅ En pantalla:** el botón muestra `✓ Propuesta #1`. Aparece la tarjeta de la
propuesta con badge **activa**, su descripción, beneficiario, cantidad `4.0 ETH`,
y contadores **A favor / En contra / Abstención** a 0.

> 💡 *Opcional (10 s, refuerza el 40% de contratos):* con una 4ª cuenta que deposite
> poco (p. ej. 1 ETH), intenta crear propuesta → error
> *"No tienes el 10% requerido para crear una propuesta"*. Demuestra el gate.

---

## 6. ⭐ El voto gasless — Alice A FAVOR (~60 s, la pieza estrella)

**🎬 Acción:** con **Alice**, en la propuesta #1 pulsa el botón verde **"A favor"**.
MetaMask abre una ventana de **firma de datos** (EIP-712), **no** de transacción.
Detente aquí 2–3 segundos para que se vea. Firma.

**🎙️ Narración (lo más importante del video — dilo claro):**
> "Aquí está la pieza clave. Alice vota *a favor*. MetaMask **no le pide enviar una
> transacción ni pagar gas**: le pide **firmar** unos datos estructurados — la
> firma EIP-712 del *ForwardRequest*. Esa firma viaja a nuestro endpoint
> `/api/relay`; el **relayer** verifica la firma en el contrato `MinimalForwarder`
> y ejecuta el voto **pagando el gas por Alice**. Para Alice, votar fue **gratis**."

**✅ En pantalla:** el botón pasa por *Firmando… → Enviando… → ✓*. El contador
**A favor** sube a **1 voto**.

---

## 7. Voto 1-persona-1-voto — Bob y Charlie (~60 s)

**🎬 Acción:**
1. Cambia a **Bob** → botón rojo **"En contra"** → firma EIP-712 (sin gas).
2. Cambia a **Charlie** → panel depósito → `20` → **Depositar** (confirma tx, paga gas).
3. Con **Charlie**, en la propuesta #1 → **"A favor"** → firma EIP-712 (sin gas).

**🎙️ Narración:**
> "Bob vota en contra, también gasless. Ahora Charlie deposita 20 ETH —mucho más que
> los demás— y vota a favor. Pero fíjate en los contadores: **cada persona suma
> exactamente un voto**. La votación es *una persona, un voto*; no pondera por el
> ETH depositado. Charlie con 20 ETH pesa lo mismo que Bob con 5."

**✅ En pantalla:** **A favor: 2 votos (66.7%)**, **En contra: 1 voto (33.3%)**,
**Abstención: 0**.

---

## 8. Cierre de votación + ejecución por el daemon (~50 s)

**🎬 Acción:** en una terminal pequeña (sin claves a la vista), adelanta el reloj de
Anvil para pasar el `deadline` + el delay de seguridad de 1 h:

```bash
cast rpc evm_increaseTime 7260 --rpc-url http://127.0.0.1:8545
cast rpc evm_mine          --rpc-url http://127.0.0.1:8545
```

Vuelve a la app. Panel **"Ejecutar propuestas elegibles"** → pulsa el botón.

**🎙️ Narración:**
> "La votación tiene una fecha de cierre y, además, un retardo de seguridad de una
> hora antes de poder ejecutarse. En local adelanto el reloj de Anvil para no
> esperar. Ahora disparo el **daemon**: escanea las propuestas y ejecuta las que
> cumplen —cerradas, con más votos a favor que en contra, y con tesoro suficiente."

**✅ En pantalla:** el panel muestra `Escaneadas: 1 · Ejecutadas: 1`. La tarjeta de
la propuesta cambia a badge **ejecutada**.

---

## 9. La prueba del modelo A+: el tesoro baja, el aporte no (~40 s)

**🎬 Acción:** muestra las stats del DAO (siguen en pantalla) y, opcionalmente, el
`cast balance` del beneficiario en la terminal:

```bash
cast balance 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 \
  --rpc-url http://127.0.0.1:8545 --ether
```

**🎙️ Narración:**
> "Resultado: el beneficiario recibió los 4 ETH. Y mira el panel: el **Tesoro DAO**
> bajó de 35 a 31 ETH —el dinero salió del pozo común—, pero el **aporte** de cada
> usuario no cambia: es su peso de gobernanza, no un saldo retirable. El gate del
> 10% se mide siempre contra el tesoro **real** disponible."

**✅ En pantalla:** `Tesoro DAO: 31.0 ETH`; `cast balance` del beneficiario ≈
`10004` ETH (tenía 10000 + 4).

---

## 10. Cierre — arquitectura (~30 s)

**🎬 Acción:** muestra el diagrama del flujo gasless (README o
`docs/04-relayer-y-daemon.md`).

**🎙️ Narración:**
> "Recapitulando: depositar y crear propuesta pagan gas porque mueven valor del
> usuario; **votar es gasless** vía meta-transacción EIP-2771 con un relayer; y un
> daemon ejecuta las propuestas aprobadas. Contratos en Foundry con cobertura sobre
> el 90 %, frontend en Next.js con ethers v6. Eso es la DAO de votación gasless."

**✅ En pantalla:** diagrama + (opcional) `forge test` en verde unos segundos.

---

## Resumen de tiempos

| Escena | Duración aprox. |
|--------|-----------------|
| 1. Intro | 0:30 |
| 2. Conectar | 0:20 |
| 3. Depósito Alice (paga gas) | 0:40 |
| 4. Depósito Bob | 0:30 |
| 5. Crear propuesta (campos) | 1:00 |
| 6. ⭐ Voto gasless Alice | 1:00 |
| 7. 1-persona-1-voto (Bob/Charlie) | 1:00 |
| 8. Daemon ejecuta | 0:50 |
| 9. Prueba modelo A+ | 0:40 |
| 10. Cierre | 0:30 |
| **Total** | **~6:40** |

> Si necesitas que dure menos, recorta la escena 7 (un solo voto extra) y la opción
> del gate en la escena 5. El núcleo intocable son las escenas **6** (voto gasless)
> y **9** (modelo A+).

---

## Frases clave que NO pueden faltar (para el corrector)

- "MetaMask me pide **firmar**, no enviar transacción → votar es **gratis**."
- "El **relayer paga el gas** por el votante (EIP-2771 / meta-transacción)."
- "**Una persona, un voto** — no pondera por ETH depositado."
- "**Descripción obligatoria** en la propuesta."
- "El gate del **10 %** y el tesoro se miden sobre el **balance real** del contrato."
