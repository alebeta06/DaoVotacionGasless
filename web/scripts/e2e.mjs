// E2E del escenario del brief contra el stack real (Anvil + Next.js + /api/relay + /api/cron/execute).
// Teoría y diagrama: docs/04-relayer-y-daemon.md -> "Fase 9 — E2E automatizado".
//
// Uso:  cd web && npm run e2e
// No requiere nada corriendo: levanta y mata Anvil y `next dev` por sí mismo.

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, copyFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Contract, JsonRpcProvider, NonceManager, Wallet, parseEther, formatEther } from "ethers";

const WEB_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const SC_DIR = join(WEB_DIR, "..", "sc");
const ENV_PATH = join(WEB_DIR, ".env.local");
const ENV_BACKUP = join(WEB_DIR, ".env.local.e2e-backup");

const RPC_URL = "http://127.0.0.1:8545";
const WEB_URL = "http://localhost:3000";
const CHAIN_ID = 31337;
const SECURITY_DELAY = 3600; // == DAOVoting.SECURITY_DELAY (1 hours)

const DAO_ABI = JSON.parse(readFileSync(join(WEB_DIR, "lib/abis/DAOVoting.json"), "utf8"));
const FW_ABI = JSON.parse(readFileSync(join(WEB_DIR, "lib/abis/MinimalForwarder.json"), "utf8"));

const children = [];
let envRestored = false;

function log(step, msg) {
    console.log(`\x1b[36m[${step}]\x1b[0m ${msg}`);
}
function ok(msg) {
    console.log(`\x1b[32m  ✓ ${msg}\x1b[0m`);
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
    ok(msg);
}

// --- ciclo de vida de procesos hijos ---------------------------------------

function track(child, name) {
    child.on("exit", (code) => {
        if (code && code !== 0 && !child.__expected) {
            console.error(`\x1b[31m[${name}] salió con código ${code}\x1b[0m`);
        }
    });
    children.push(child);
    return child;
}

function cleanup() {
    for (const c of children) {
        c.__expected = true;
        try {
            process.kill(-c.pid, "SIGKILL");
        } catch {
            try {
                c.kill("SIGKILL");
            } catch {}
        }
    }
    if (!envRestored) {
        if (existsSync(ENV_BACKUP)) {
            copyFileSync(ENV_BACKUP, ENV_PATH);
            rmSync(ENV_BACKUP);
        }
        envRestored = true;
    }
}

process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
});

// --- helpers de stack ------------------------------------------------------

async function startAnvil() {
    log("anvil", "arrancando nodo efímero...");
    const child = track(spawn("anvil", [], { detached: true }), "anvil");
    let buf = "";
    const keys = await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("anvil no arrancó a tiempo")), 20_000);
        child.stdout.on("data", (d) => {
            buf += d.toString();
            if (buf.includes("Listening on")) {
                clearTimeout(t);
                const re = /\((\d+)\)\s+(0x[0-9a-fA-F]{64})/g;
                const found = {};
                let m;
                while ((m = re.exec(buf)) !== null) found[Number(m[1])] = m[2];
                resolve(found);
            }
        });
        child.stderr.on("data", () => {});
    });
    ok(`anvil listo (${Object.keys(keys).length} cuentas)`);
    return keys;
}

function deploy(deployerPk) {
    log("deploy", "forge script Deploy.s.sol --broadcast");
    return new Promise((resolve, reject) => {
        const child = spawn(
            "forge",
            [
                "script",
                "script/Deploy.s.sol",
                "--rpc-url",
                RPC_URL,
                "--private-key",
                deployerPk,
                "--broadcast",
            ],
            { cwd: SC_DIR },
        );
        let out = "";
        child.stdout.on("data", (d) => (out += d.toString()));
        child.stderr.on("data", (d) => (out += d.toString()));
        child.on("exit", (code) => {
            if (code !== 0) return reject(new Error(`forge script falló:\n${out}`));
            const fw = out.match(/MinimalForwarder:\s+(0x[0-9a-fA-F]{40})/);
            const dao = out.match(/DAOVoting\s+:\s+(0x[0-9a-fA-F]{40})/);
            if (!fw || !dao) return reject(new Error(`no pude parsear addresses:\n${out}`));
            ok(`MinimalForwarder ${fw[1]}`);
            ok(`DAOVoting        ${dao[1]}`);
            resolve({ forwarder: fw[1], dao: dao[1] });
        });
    });
}

function writeEnv({ dao, forwarder, relayerPk, relayerAddr }) {
    if (existsSync(ENV_PATH)) copyFileSync(ENV_PATH, ENV_BACKUP);
    const content = [
        `NEXT_PUBLIC_DAO_ADDRESS=${dao}`,
        `NEXT_PUBLIC_FORWARDER_ADDRESS=${forwarder}`,
        `NEXT_PUBLIC_CHAIN_ID=${CHAIN_ID}`,
        `NEXT_PUBLIC_RPC_URL=${RPC_URL}`,
        `RELAYER_PRIVATE_KEY=${relayerPk}`,
        `RELAYER_ADDRESS=${relayerAddr}`,
        `RPC_URL=${RPC_URL}`,
        "",
    ].join("\n");
    writeFileSync(ENV_PATH, content);
    ok("web/.env.local escrito (backup en .env.local.e2e-backup)");
}

async function startNext() {
    log("next", "arrancando `next dev`...");
    const child = track(
        spawn("npx", ["next", "dev"], { cwd: WEB_DIR, detached: true, env: process.env }),
        "next",
    );
    child.stdout.on("data", () => {});
    child.stderr.on("data", () => {});
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
        try {
            const r = await fetch(WEB_URL, { method: "GET" });
            if (r.status > 0) {
                ok("next dev responde en :3000");
                return;
            }
        } catch {}
        await sleep(1000);
    }
    throw new Error("next dev no respondió en 60s");
}

// --- meta-tx (igual que el cliente: firma local, solo manda firma) ---------

const FW_TYPES = {
    ForwardRequest: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "gas", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "data", type: "bytes" },
    ],
};

async function gaslessVote(voterWallet, forwarder, daoAddr, daoIface, proposalId, voteType) {
    const data = daoIface.encodeFunctionData("vote", [proposalId, voteType]);
    const nonce = await forwarder.getNonce(voterWallet.address);
    const request = {
        from: voterWallet.address,
        to: daoAddr,
        value: 0n,
        gas: 300_000n,
        nonce,
        data,
    };
    const domain = {
        name: "MinimalForwarder",
        version: "1",
        chainId: CHAIN_ID,
        verifyingContract: await forwarder.getAddress(),
    };
    const signature = await voterWallet.signTypedData(domain, FW_TYPES, request);

    const res = await fetch(`${WEB_URL}/api/relay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            request: {
                from: request.from,
                to: request.to,
                value: request.value.toString(),
                gas: request.gas.toString(),
                nonce: request.nonce.toString(),
                data: request.data,
            },
            signature,
        }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`/api/relay -> ${res.status}: ${json.error ?? "?"}`);
    return json.txHash;
}

// --- escenario del brief ---------------------------------------------------

async function run() {
    const keys = await startAnvil();
    const provider = new JsonRpcProvider(RPC_URL);

    const deployer = keys[0];
    const alice = new Wallet(keys[1], provider);
    const bob = new Wallet(keys[2], provider);
    const charlie = new Wallet(keys[3], provider);
    const recipient = new Wallet(keys[4]).address;
    const relayer = new Wallet(keys[9]);

    const { dao: daoAddr, forwarder: fwAddr } = await deploy(deployer);
    writeEnv({ dao: daoAddr, forwarder: fwAddr, relayerPk: keys[9], relayerAddr: relayer.address });
    await startNext();

    // NonceManager para las tx reales (ethers v6 + RPC local reusa nonces sin él;
    // mismo motivo por el que el daemon lo usa, ver commit 0778578).
    // Los wallets planos (alice/bob/charlie) se quedan para firmar la meta-tx EIP-712.
    const daoAlice = new Contract(daoAddr, DAO_ABI, new NonceManager(alice));
    const daoBob = new Contract(daoAddr, DAO_ABI, new NonceManager(bob));
    const daoCharlie = new Contract(daoAddr, DAO_ABI, new NonceManager(charlie));
    const daoRead = new Contract(daoAddr, DAO_ABI, provider);
    const forwarder = new Contract(fwAddr, FW_ABI, provider);
    const daoIface = daoAlice.interface;

    log("escenario", "1) Alice deposita 10 ETH (tx normal, paga gas)");
    await (await daoAlice.fundDAO({ value: parseEther("10") })).wait();

    log("escenario", "2) Bob deposita 5 ETH");
    await (await daoBob.fundDAO({ value: parseEther("5") })).wait();

    log("escenario", "3) Alice crea propuesta (10/15 = 66% >= 10%)");
    const block = await provider.getBlock("latest");
    const deadline = block.timestamp + SECURITY_DELAY;
    await (
        await daoAlice.createProposal(recipient, parseEther("4"), deadline, "E2E: financiar escuela")
    ).wait();
    const id = 1n;

    log("escenario", "5) Alice vota A FAVOR (gasless -> /api/relay)");
    ok(`relayed tx ${await gaslessVote(alice, forwarder, daoAddr, daoIface, id, 1)}`);

    log("escenario", "6) Bob vota EN CONTRA (gasless -> /api/relay)");
    ok(`relayed tx ${await gaslessVote(bob, forwarder, daoAddr, daoIface, id, 0)}`);

    log("escenario", "7) Charlie deposita 20 ETH");
    await (await daoCharlie.fundDAO({ value: parseEther("20") })).wait();

    log("escenario", "8) Charlie vota A FAVOR (gasless -> /api/relay)");
    ok(`relayed tx ${await gaslessVote(charlie, forwarder, daoAddr, daoIface, id, 1)}`);

    log("escenario", "9) Avanzar tiempo: deadline + SECURITY_DELAY");
    await provider.send("evm_increaseTime", [SECURITY_DELAY * 2 + 60]);
    await provider.send("evm_mine", []);

    const recipientBefore = await provider.getBalance(recipient);

    log("escenario", "10) Daemon ejecuta (GET /api/cron/execute)");
    const cronRes = await fetch(`${WEB_URL}/api/cron/execute`);
    const cron = await cronRes.json();
    if (!cronRes.ok) throw new Error(`/api/cron/execute -> ${cronRes.status}: ${cron.error}`);
    console.log("  daemon:", JSON.stringify(cron));

    // --- verificación ---
    log("assert", "verificando estado on-chain");
    const p = await daoRead.getProposal(id);
    const recipientAfter = await provider.getBalance(recipient);
    const delta = recipientAfter - recipientBefore;

    assert(p.executed === true, "propuesta marcada como ejecutada");
    assert(delta === parseEther("4"), `recipient recibió 4 ETH (recibió ${formatEther(delta)})`);
    assert(p.forVotes === 2n, `forVotes == 2 (Alice + Charlie, 1 voto c/u) — fue ${p.forVotes}`);
    assert(p.againstVotes === 1n, `againstVotes == 1 (Bob) — fue ${p.againstVotes}`);
    assert(p.abstainVotes === 0n, `abstainVotes == 0 — fue ${p.abstainVotes}`);
    assert(cron.executed === 1, "el daemon reporta 1 propuesta ejecutada");
}

run()
    .then(() => {
        console.log("\n\x1b[32m✓ E2E PASÓ — escenario del brief verificado contra el stack real\x1b[0m\n");
        cleanup();
        process.exit(0);
    })
    .catch((err) => {
        console.error(`\n\x1b[31m✗ E2E FALLÓ: ${err.message}\x1b[0m\n`);
        cleanup();
        process.exit(1);
    });
