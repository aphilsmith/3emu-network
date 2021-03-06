// Specifically request an abstraction for 3EMUToken
var 3EMUToken = artifacts.require("3EMUToken");

async function mineBlocks(num=1) {
    for (let i=0; i<num; ++i) {
        await new Promise(function(resolve, reject) { web3.currentProvider.sendAsync({ jsonrpc: "2.0", method: "evm_mine", id: i }, function(err, result) { resolve(); }); });
    }
}

function blockNumber() {
    return new Promise(function(resolve, reject) {
        web3.currentProvider.sendAsync({ jsonrpc: "2.0", method: "eth_blockNumber", id: 0x05 }, function(err, result) { resolve(parseInt(result.result)) });
    });
}

function convertInt(val) {
    return val.toNumber();
}

function snapshot() {
    return new Promise(function(resolve, reject) {
        web3.currentProvider.sendAsync({ jsonrpc: "2.0", method: "evm_snapshot", id: 0xabcd }, function(err, result) { resolve(); });
    });
}

function revert() {
    return new Promise(function(resolve, reject) {
        web3.currentProvider.sendAsync({ jsonrpc: "2.0", method: "evm_revert", id: 0xabcd }, function(err, result) { resolve(); });
    });
}

function reset() {
    return new Promise(function(resolve, reject) {
        web3.currentProvider.sendAsync({ jsonrpc: "2.0", method: "evm_reset", id: 0xabce }, function(err, result) { resolve(); });
    });
}

contract('3EMUToken', function(accounts) {

    let fundingStartBlock = 0;
    let exchangeRateChangesBlock = 0;
    let fundingEndBlock = 0;
    let tokenFirstExchangeRate = 0;
    let tokenSecondExchangeRate = 0;
    let ethReceivedCap = 0;
    let ethReceivedMin = 0;
    let tokenCreationCap = 0;
    let ethFundDeposit = '';
    const initialFundBalance = 999580000200000000000; // there is already some gas deducted for the contract
    const standardBid = 10000000000000000000;

    // enum
    const isFundraising = 0;
    const isFinalized = 1;
    const isRedeeming = 2;
    const isPaused = 3;

    before(async function() {
        await reset();
        let net = null;
        return 3EMUToken.deployed().then(instance => {
            net = instance;
            return net.fundingStartBlock.call();
        }).then(result => {
            fundingStartBlock = convertInt(result);
            return net.exchangeRateChangesBlock.call();
        }).then(result => {
            exchangeRateChangesBlock = convertInt(result);
            return net.fundingEndBlock.call();
        }).then(result => {
            fundingEndBlock = convertInt(result);
            return net.TOKEN_FIRST_EXCHANGE_RATE.call();
        }).then(result => {
            tokenFirstExchangeRate = convertInt(result);
            return net.TOKEN_SECOND_EXCHANGE_RATE.call();
        }).then(result => {
            tokenSecondExchangeRate = convertInt(result);
            return net.ETH_RECEIVED_CAP.call();
        }).then(result => {
            ethReceivedCap = convertInt(result);
            return net.ETH_RECEIVED_MIN.call();
        }).then(result => {
            ethReceivedMin = convertInt(result);
            return net.TOKEN_CREATION_CAP.call();
        }).then(result => {
            tokenCreationCap = convertInt(result);
            return net.ethFundDeposit.call();
        }).then(result => {
            ethFundDeposit = result;
        });
    });

    it('should start at block 4', function() {
        return 3EMUToken.deployed().then(instance => {
            return blockNumber();
        }).then(block => {
            assert.equal(block, 4, 'after deploying we should be at block 4, perhaps you should restart testrpc');
        });
    });

    it('should have a fundingStartBlock in the future', function() {
        return blockNumber().then(currentBlock => {
            assert.ok(currentBlock < (fundingStartBlock - 1), 'fundingStartBlock is not in the future');
        });
    });

    it('is not yet finalized/redeeming', function() {
        return 3EMUToken.deployed().then(net => {
            return net.state.call();
        }).then(state => {
            assert.ok(convertInt(state) === isFundraising, 'should not be finalized');
        })
    });

    it('no finalization before the beginning', function() {
        let net = null;
        return 3EMUToken.deployed().then(instance => {
            net = instance;
            return net.finalize({
                from: ethFundDeposit,
                gas: 2099999,
                gasPrice: 20000000000
            });
        }).then(() => {
            assert.fail('should not be possible to finalize');
        }).catch(e => {
            if (e.name == 'Error') {
                assert.ok(true);
            } else {
                assert.fail('should not be possible to finalize');
            }
        });
    });

    it('should not issue tokens before the beginning', function() {
        return 3EMUToken.deployed().then(net => {
            return net.createTokens({
                from: accounts[0],
                value: standardBid,
                gas: 2099999,
                gasPrice: 20000000000
            });
        }).then(() => {
            assert.fail('token creation did not fail');
        }).catch(e => {
            if (e.name == 'Error') {
                assert.ok(true);
            } else {
                assert.fail('token creation did not fail');
            }
        });
    });

    it('should not allow tokens to be traded without having them', function() {
        return 3EMUToken.deployed().then(net => {
            return net.transfer(accounts[1], 10, {
                from: accounts[0],
                gas: 2099999,
                gasPrice: 20000000000
            });
        }).then(() => {
            assert.fail('trading did not fail');
        }).catch(e => {
            if (e.name == 'Error') {
                assert.ok(true);
            } else {
                assert.fail('trading did not fail');
            }
        });
    });

    it('take a snapshot of the blockchain', function() {
        return snapshot();
    });

    it('should issue tokens for the correct price in phase 1', function() {
        let net = null;
        const weis = standardBid;
        return 3EMUToken.deployed().then(instance => {
            net = instance;
            return blockNumber();
        }).then(currentBlock => {
            // mine necessary amount of blocks
            return mineBlocks(fundingStartBlock - currentBlock - 1);
        }).then(() => {
            return net.createTokens({
                from: accounts[0],
                value: weis,
                gas: 2099999,
                gasPrice: 20000000000
            });
        }).then(() => {
            return net.balanceOf.call(accounts[0]);
        }).then(balance => {
            assert.equal(balance, weis * tokenFirstExchangeRate, 'got wrong amount of tokens');
        }).catch(() => {
            assert.fail('token creation did fail');
        });
    });

    it('should not issue tokens that overshoot the token creation cap', function() {
        let net = null;
        const weis = 100000000000000000000000; // definitely too much
        return 3EMUToken.deployed().then(instance => {
            net = instance;
            return net.createTokens({
                from: accounts[0],
                value: weis,
                gas: 2099999,
                gasPrice: 20000000000
            });
        }).then(() => {
            assert.fail('should not allow token creation overshooting cap');
        }).catch(() => {
            assert.ok(true);
        });
    });

    it('no finalization before the end when the cap conditions are not met', function() {
        let net = null;
        return 3EMUToken.deployed().then(instance => {
            net = instance;
            return net.finalize({
                from: ethFundDeposit,
                gas: 2099999,
                gasPrice: 20000000000
            });
        }).then(() => {
            assert.fail('should not be possible to finalize');
        }).catch(e => {
            if (e.name == 'Error') {
                assert.ok(true);
            } else {
                assert.fail('should not be possible to finalize');
            }
        });
    });

    it('should issue tokens exactly matching token cap', function() {
        let net = null;
        const weis = (tokenCreationCap/tokenFirstExchangeRate) - standardBid;

        if (weis > ethReceivedCap) {
            console.log('tokenCreationCap cannot be reached, since it would overshoot the ethReceivedCap');
            return true;
        }

        return 3EMUToken.deployed().then(instance => {
            net = instance;
            return net.createTokens({
                from: accounts[0],
                value: weis,
                gas: 2099999,
                gasPrice: 20000000000
            });
        }).then(() => {
            return net.balanceOf.call(accounts[0]);
        }).then(balance => {
            assert.equal(balance, tokenCreationCap, 'got wrong amount of tokens'); // this account bought all of it
        }).catch(e => {
            console.log(e);
            assert.fail('token creation did fail');
        });
    });

    it('no refunding at this point', function() {
        let net = null;
        return 3EMUToken.deployed().then(instance => {
            net = instance;
            return net.refund({
                from: accounts[0],
                gas: 2099999,
                gasPrice: 20000000000
            });
        }).then(() => {
            assert.fail('should not be possible to refund');
        }).catch(e => {
            if (e.name == 'Error') {
                assert.ok(true);
            } else {
                assert.fail('should not be possible to refund');
            }
        });
    });

    it('no redeeming period here', function() {
        let net = null;
        return 3EMUToken.deployed().then(instance => {
            net = instance;
            return net.startRedeeming({
                from: ethFundDeposit,
                gas: 2099999,
                gasPrice: 20000000000
            });
        }).then(() => {
            assert.fail('should not be possible to start redeeming phase');
        }).catch(e => {
            if (e.name == 'Error') {
                assert.ok(true);
            } else {
                assert.fail('should not be possible to start redeeming phase');
            }
        });
    });

    it('should not issue tokens after reaching the token cap', function() {
        let net = null;
        const weis = 1;
        return 3EMUToken.deployed().then(instance => {
            net = instance;
            return net.createTokens({
                from: accounts[2],
                value: weis,
                gas: 2099999,
                gasPrice: 20000000000
            });
        }).then(() => {
            assert.fail('should not allow token creation overshooting cap');
        }).catch(() => {
            assert.ok(true);
        });
    });

    it('should allow early finalization', function() {
        const weis = (tokenCreationCap/tokenFirstExchangeRate)-standardBid;

        if (weis > ethReceivedCap) {
            console.log('tokenCreationCap cannot be reached, since it would overshoot the ethReceivedCap');
            return true;
        }

        let net = null;
        const gasUsed = 34016; // calculated by running the transaction once
        const gasPrice = 20000000000;
        return 3EMUToken.deployed().then(instance => {
            net = instance;
            return net.finalize({
                from: ethFundDeposit,
                gas: 2099999,
                gasPrice: 20000000000
            });
        }).then(() => {
            return net.state.call();
        }).then(state => {
            assert.ok(convertInt(state) === isFinalized);
            return web3.eth.getBalance(ethFundDeposit);
        }).then(balance => {
            assert.ok(balance >= (initialFundBalance+tokenCreationCap/500-(gasUsed*gasPrice)), 'balance is not correctly updated');
        }).catch(() => {
            assert.fail('could not finalize contract');
        });
    });

    it('should allow tokens to be traded after finalization', function() {
        const weis = (tokenCreationCap/tokenFirstExchangeRate)-standardBid;

        if (weis > ethReceivedCap) {
            console.log('tokenCreationCap cannot be reached, since it would overshoot the ethReceivedCap');
            return true;
        }

        return 3EMUToken.deployed().then(net => {
            return net.transfer(accounts[1], 10, {
                from: accounts[0],
                gas: 2099999,
                gasPrice: 20000000000
            });
        }).then(() => {
            assert.ok(true);
        }).catch(() => {
            assert.fail('could not trade tokens');
        });
    });
});
