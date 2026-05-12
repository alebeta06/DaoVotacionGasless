// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { MinimalForwarder } from "../src/MinimalForwarder.sol";

contract TargetMock {
    address public lastRealSender;
    address public lastMsgSender;
    uint256 public lastValue;

    function setValue(uint256 v) external payable {
        lastValue = v;
        lastMsgSender = msg.sender;
        lastRealSender = _msgSenderFromCalldata();
    }

    function doRevert() external pure {
        revert("target reverted");
    }

    function _msgSenderFromCalldata() private view returns (address sender) {
        if (msg.data.length >= 20) {
            assembly {
                sender := shr(96, calldataload(sub(calldatasize(), 20)))
            }
        } else {
            sender = msg.sender;
        }
    }
}

contract MinimalForwarderTest is Test {
    MinimalForwarder internal forwarder;
    TargetMock internal target;

    address internal alice;
    uint256 internal alicePk;
    address internal bob;
    uint256 internal bobPk;

    bytes32 internal constant TYPEHASH =
        keccak256("ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,bytes data)");

    function setUp() public {
        forwarder = new MinimalForwarder();
        target = new TargetMock();
        (alice, alicePk) = makeAddrAndKey("alice");
        (bob, bobPk) = makeAddrAndKey("bob");
    }

    // --- helpers ---

    function _domainSeparator() internal view returns (bytes32) {
        (, string memory name, string memory version, uint256 chainId, address verifying,,) = forwarder.eip712Domain();
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chainId,
                verifying
            )
        );
    }

    function _structHash(MinimalForwarder.ForwardRequest memory req) internal pure returns (bytes32) {
        return keccak256(abi.encode(TYPEHASH, req.from, req.to, req.value, req.gas, req.nonce, keccak256(req.data)));
    }

    function _sign(uint256 pk, MinimalForwarder.ForwardRequest memory req) internal view returns (bytes memory) {
        bytes32 digest = MessageHashUtils.toTypedDataHash(_domainSeparator(), _structHash(req));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _buildSetValueReq(address from, uint256 value, uint256 nonce)
        internal
        view
        returns (MinimalForwarder.ForwardRequest memory)
    {
        return MinimalForwarder.ForwardRequest({
            from: from,
            to: address(target),
            value: 0,
            gas: 200_000,
            nonce: nonce,
            data: abi.encodeCall(TargetMock.setValue, (value))
        });
    }

    // --- tests ---

    function test_GetNonce_StartsAtZero() public view {
        assertEq(forwarder.getNonce(alice), 0);
        assertEq(forwarder.getNonce(bob), 0);
    }

    function test_Verify_ValidSignature() public view {
        MinimalForwarder.ForwardRequest memory req = _buildSetValueReq(alice, 42, 0);
        bytes memory sig = _sign(alicePk, req);
        assertTrue(forwarder.verify(req, sig));
    }

    function testRevert_Execute_WrongNonce() public {
        MinimalForwarder.ForwardRequest memory req = _buildSetValueReq(alice, 42, 5);
        bytes memory sig = _sign(alicePk, req);
        vm.expectRevert(MinimalForwarder.InvalidNonce.selector);
        forwarder.execute(req, sig);
    }

    function testRevert_Execute_WrongSigner() public {
        MinimalForwarder.ForwardRequest memory req = _buildSetValueReq(alice, 42, 0);
        bytes memory sig = _sign(bobPk, req);
        vm.expectRevert(MinimalForwarder.InvalidSigner.selector);
        forwarder.execute(req, sig);
    }

    function test_Execute_IncrementsNonce() public {
        MinimalForwarder.ForwardRequest memory req = _buildSetValueReq(alice, 42, 0);
        bytes memory sig = _sign(alicePk, req);

        (bool ok,) = forwarder.execute(req, sig);
        assertTrue(ok);
        assertEq(forwarder.getNonce(alice), 1);

        MinimalForwarder.ForwardRequest memory req2 = _buildSetValueReq(alice, 99, 1);
        bytes memory sig2 = _sign(alicePk, req2);
        (ok,) = forwarder.execute(req2, sig2);
        assertTrue(ok);
        assertEq(forwarder.getNonce(alice), 2);
    }

    function test_Execute_AppendsSenderToCalldata() public {
        MinimalForwarder.ForwardRequest memory req = _buildSetValueReq(alice, 1337, 0);
        bytes memory sig = _sign(alicePk, req);

        forwarder.execute(req, sig);

        assertEq(target.lastValue(), 1337);
        assertEq(target.lastMsgSender(), address(forwarder));
        assertEq(target.lastRealSender(), alice);
    }

    function test_Execute_ReplayFails() public {
        MinimalForwarder.ForwardRequest memory req = _buildSetValueReq(alice, 1, 0);
        bytes memory sig = _sign(alicePk, req);

        forwarder.execute(req, sig);

        vm.expectRevert(MinimalForwarder.InvalidNonce.selector);
        forwarder.execute(req, sig);
    }

    function test_Execute_PropagatesRevert() public {
        MinimalForwarder.ForwardRequest memory req = MinimalForwarder.ForwardRequest({
            from: alice,
            to: address(target),
            value: 0,
            gas: 200_000,
            nonce: 0,
            data: abi.encodeCall(TargetMock.doRevert, ())
        });
        bytes memory sig = _sign(alicePk, req);

        (bool ok,) = forwarder.execute(req, sig);
        assertFalse(ok);
        assertEq(forwarder.getNonce(alice), 1, "nonce still consumed even on inner revert");
    }

    function testRevert_Execute_InsufficientGas() public {
        MinimalForwarder.ForwardRequest memory req = MinimalForwarder.ForwardRequest({
            from: alice,
            to: address(target),
            value: 0,
            gas: 50_000_000,
            nonce: 0,
            data: abi.encodeCall(TargetMock.setValue, (1))
        });
        bytes memory sig = _sign(alicePk, req);

        (bool ok,) = address(forwarder).call{ gas: 200_000 }(abi.encodeCall(MinimalForwarder.execute, (req, sig)));

        assertFalse(ok, "execute should have reverted due to insufficient forwarded gas");
        assertEq(forwarder.getNonce(alice), 0, "nonce must NOT have advanced");
    }
}
