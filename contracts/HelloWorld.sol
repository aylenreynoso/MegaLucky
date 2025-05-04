// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

contract HelloWorld {
    string private greeting;
    address public owner;

    modifier OnlyOwner() {
        require(msg.sender == owner, "Not the contract owner");
        _;
        
    }

    constructor() {
        greeting = "Hello, World!";
        owner = msg.sender;
    }

    function setGreeting(string calldata _greeting) public OnlyOwner{
        greeting = _greeting;
    }

    function getGreeting() public view returns (string memory) {
        return greeting;
    }

    function newOwner(address _newOwner) public OnlyOwner {
        owner = _newOwner;
    }
}