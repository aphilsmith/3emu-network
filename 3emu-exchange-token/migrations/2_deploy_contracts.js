var 3EMUToken = artifacts.require("./3EMUToken.sol");

module.exports = function(deployer) {
  var ethfund = "0x2Aacac1412062cAaf70b5a6eB6752Ba6E8E5117f";
  var start = 10;
  var middle = 15;
  var end = 20;
 deployer.deploy(3EMUToken, ethfund, start, end, middle);
};
