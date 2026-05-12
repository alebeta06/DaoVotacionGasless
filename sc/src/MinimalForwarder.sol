// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract MinimalForwarder is EIP712 {
    struct ForwardRequest {
        address from;
        address to;
        uint256 value;
        uint256 gas;
        uint256 nonce;
        bytes data;
    }

    bytes32 private constant _TYPEHASH =
        keccak256("ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,bytes data)");

    mapping(address => uint256) private _nonces;

    error InvalidSigner();
    error InvalidNonce();
    error InsufficientGas();

    event Executed(address indexed from, address indexed to, uint256 nonce, bool success);

    constructor() EIP712("MinimalForwarder", "1") { }

    function getNonce(address from) external view returns (uint256) {
        return _nonces[from];
    }

    function verify(ForwardRequest calldata req, bytes calldata signature) public view returns (bool) {
        address signer = _recoverSigner(req, signature);
        return signer == req.from && _nonces[req.from] == req.nonce;
    }

    function execute(ForwardRequest calldata req, bytes calldata signature)
        external
        payable
        returns (bool success, bytes memory returnData)
    {
        address signer = _recoverSigner(req, signature);
        if (signer != req.from) revert InvalidSigner();
        if (_nonces[req.from] != req.nonce) revert InvalidNonce();

        _nonces[req.from] = req.nonce + 1;

        (success, returnData) = req.to.call{ gas: req.gas, value: req.value }(abi.encodePacked(req.data, req.from));

        if (gasleft() <= req.gas / 63) {
            assembly {
                invalid()
            }
        }

        emit Executed(req.from, req.to, req.nonce, success);
    }

    function _recoverSigner(ForwardRequest calldata req, bytes calldata signature) private view returns (address) {
        bytes32 structHash =
            keccak256(abi.encode(_TYPEHASH, req.from, req.to, req.value, req.gas, req.nonce, keccak256(req.data)));
        return ECDSA.recover(_hashTypedDataV4(structHash), signature);
    }
}
