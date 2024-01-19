import {planqToEth} from "./bech32-utils.js";
import {ethers} from "./ethers-5.7.esm.min.js";
import { Base64Binary } from "./base64-binary.js";
import "./lib.js";

const evmosjs = window.evmosjs.Evmosjs
const buf = window.buf

const chain = {
    chainId: 7070,
    cosmosChainId: 'planq_7071-1',
}

const memo = "DeltaSwap.io Convert"

const fee = {
    amount: '8000000000000000',
    denom: 'aplanq',
    gas: '800000',
}

let txParams = {
    chain: chain,
    memo: memo,
    fee: fee,
    gasLimit: 8000000,
    sequence: 0,
    accountNumber: 0,
}

let erc20TokensGlobal;
let ibcTokensGlobal;
let currentAddress;
let currentEvmAccount;

window.onload = async () => {
    const response = await fetch("http://127.0.0.1:4000/assets/planq_7071.json")
    const planqJson = await response.json()
    if(window.keplr !== undefined) {
        window.wallet = window.keplr
    } else if (window.leap !== undefined) {
        window.wallet = window.leap
    }
    await window.wallet.experimentalSuggestChain( planqJson )
    await window.wallet.enable(chain.cosmosChainId);

    // prepare the account
    await updateAccount();

    // fetch available token pairs & erc20 / ibc balances
    const pairs = await fetchTokenPairs();
    const erc20Tokens = await fetchErc20Tokens(currentEvmAccount);
    const nativeTokens = await fetchNativeTokens(currentAddress);

    // construct conversion tables
    constructConversionTable(pairs);
    constructErc20Table(erc20Tokens);
    activateTooltips();

    window.addEventListener("leap_keystorechange", () => {
        location.reload()
    })

    window.addEventListener("keplr_keystorechange", () => {
        location.reload()
    })
};

async function updateAccount() {
    const offlineSigner = window.getOfflineSigner(chain.cosmosChainId);
    const accounts = await offlineSigner.getAccounts();
    currentAddress = accounts[0]["address"];
    const pubKey = await window.wallet.getKey(chain.cosmosChainId);
    const account = await fetchAccount(currentAddress, pubKey.pubKey);
    currentEvmAccount = planqToEth(accounts[0]["address"]);
    txParams.sequence = account.sequence;
    txParams.accountNumber = account.accountNumber;
    txParams.sender = account
}

function activateTooltips() {
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
}

var truncate = function (fullStr, strLen, separator) {
    if (fullStr.length <= strLen) return fullStr;

    separator = separator || '...';

    var sepLen = separator.length,
        charsToShow = strLen - sepLen,
        frontChars = Math.ceil(charsToShow/2),
        backChars = Math.floor(charsToShow/2);

    return fullStr.substr(0, frontChars) +
        separator +
        fullStr.substr(fullStr.length - backChars);
};

function constructErc20Table(erc20Tokens) {
    if (erc20Tokens["result"].length < 1) {
        return
    }

    const erc20Table = document.querySelector("#erc20-table");

    console.log(erc20Tokens)
    for (let i = 0; i < erc20Tokens["result"].length; i++) {
        const row = document.createElement("tr");
        const currentErc20Token = erc20Tokens["result"][i];
        console.log(currentErc20Token)
        const erc20Address = currentErc20Token["contractAddress"];
        const decimals = currentErc20Token["decimals"];
        const balance = currentErc20Token["balance"];
        const name = currentErc20Token["name"];
        const erc20Balance = ethers.utils.formatUnits(balance, decimals);

        const cellNameErc20 = document.createElement("td");
        const cellNameTextErc20 = document.createTextNode(name);
        const cellErc20 = document.createElement("td");
        const cellTextErc20 = document.createTextNode(truncate(erc20Address,15));

        const cellBalanceErc20 = document.createElement("td");
        const cellBalanceTextErc20 = document.createTextNode(erc20Balance);
        const cellGov = document.createElement("td");

        cellGov.appendChild(addGovButton(i, currentErc20Token));
        cellErc20.appendChild(cellTextErc20);
        cellNameErc20.appendChild(cellNameTextErc20);
        cellBalanceErc20.appendChild(cellBalanceTextErc20);

        row.appendChild(cellNameErc20);
        row.appendChild(cellErc20);
        row.appendChild(cellBalanceErc20);
        row.appendChild(cellGov);

        erc20Table.children[1].appendChild(row);
    }
}

function getIBCID(address) {
    console.log(address)
    for(var i = 0; i < ibcTokensGlobal.length; i++) {
        if(address === ibcTokensGlobal[i]["denom"]) {
            return i;
        }
    }
    return -1;
}

function getErc20ID(address) {
    for(var i = 0; i < erc20TokensGlobal; i++) {
        if(address == erc20TokensGlobal[i]["contractAddress"]) {
            return i;
        }
    }
    return -1;
}

function constructConversionTable(pairs) {
    if (pairs["pagination"].total < 1) {
        return
    }
    const convertTable = document.querySelector("#convert-table");
    for (let i = 0; i < pairs["pagination"].total; i++) {
        // creates a table row
        const row = document.createElement("tr");
        const currentPair = pairs["token_pairs"][i]
        console.log(currentPair)
        const erc20Address = currentPair["erc20_address"];
        const ibcDenom = currentPair["denom"];
        const erc20Balance = fetchErc20Balance(erc20Address)
        const ibcBalance = fetchIBCBalance(ibcDenom)

        const cellErc20 = document.createElement("td");
        const cellTooltipErc20 = document.createElement("a")
        const cellTextErc20 = document.createTextNode(truncate(erc20Address,15));
        const cellBalanceErc20 = document.createElement("td");
        const cellBalanceTextErc20 = document.createTextNode(erc20Balance);


        cellTooltipErc20.href = "https://evm.planq.network/address/" + erc20Address;
        cellTooltipErc20.target = "_blank"
        cellTooltipErc20.dataset.bsToggle = "tooltip";
        cellTooltipErc20.dataset.bsOriginalTitle = erc20Address;

        cellTooltipErc20.appendChild(cellTextErc20);
        cellErc20.appendChild(cellTooltipErc20);
        cellBalanceErc20.appendChild(cellBalanceTextErc20);
        cellBalanceErc20.appendChild(addConvertButton(getErc20ID(erc20Address), erc20Address, erc20Balance));

        const cellIBC = document.createElement("td");
        const cellTextIBC = document.createTextNode(truncate(ibcDenom,15));
        const cellTooltipIBC = document.createElement("a");
        const cellBalanceIBC = document.createElement("td");
        const cellBalanceTextIBC = document.createTextNode(ibcBalance);

        cellTooltipIBC.href = "#";
        cellTooltipIBC.dataset.bsToggle = "tooltip";
        cellTooltipIBC.dataset.bsOriginalTitle = ibcDenom;

        cellTooltipIBC.appendChild(cellTextIBC);
        cellIBC.appendChild(cellTooltipIBC);
        cellBalanceIBC.appendChild(cellBalanceTextIBC);
        cellBalanceIBC.appendChild(addConvertButton(getIBCID(ibcDenom), ibcDenom, ibcBalance));

        row.appendChild(cellErc20);
        row.appendChild(cellBalanceErc20);
        row.appendChild(cellIBC);
        row.appendChild(cellBalanceIBC);


        // add the row to the end of the table body
        convertTable.children[1].appendChild(row);
    }
}

function addGovButton(id, erc20Token) {
    addGovernanceModalErc20(id)
    const govButton = document.createElement("button")
    if(!isGovProposalErc20Running(id)) {
        govButton.className = "btn btn-sm ms-1"
    } else {
        govButton.className = "btn btn-sm disabled ms-1"
    }
    govButton.dataset.bsToggle = "modal"
    govButton.dataset.bsTarget = "#erc20Modal"+id
    govButton.textContent = "Apply for Conversion";
    return govButton
}

function addConvertButton(id, address, balance) {
    const convertButton = document.createElement("button");

    if(balance > 0.0) {
        convertButton.className = "btn btn-sm ms-1"
        convertButton.addEventListener('click', function() {
            if(address.includes("ibc")) {
                convertIBC(id);
            } else {
                convertErc20(id);
            }
        });
    } else {
        convertButton.className = "btn btn-sm disabled ms-1"
    }
    convertButton.textContent = "Convert";
    return convertButton
}

function isGovProposalErc20Running(id) {
    // TODO: IMPLEMENT ME
    return false
}


async function fetchErc20Tokens(address) {
    const url = "https://evm.planq.network/api?module=account&action=tokenlist&address=" + address;
    const resp = await fetch(url);
    let json = await resp.json();
    json["result"][0]["contractAddress"] = "0xfF484c332B12c1212805e821fBbA65673b67fF02";
    json["result"][0]["decimals"] = "18";
    json["result"][0]["balance"] = "10000";
    json["result"][0]["name"] = "Test";
    if (json["result"].length < 1) {
        return
    }
    erc20TokensGlobal = json["result"]
    return json
}

async function fetchNativeTokens(address) {
    const url = "http://192.168.178.32:1317/cosmos/bank/v1beta1/balances/" + address;
    const resp = await fetch(url);
    const json = await resp.json();
    if (json["balances"].length < 1) {
        return
    }
    else {
        for(var i = 0; i < json["balances"].length; i++) {
            if(json["balances"][i]["denom"] == "aplanq") {
                continue
            }
            json["balances"][i]["base_denom"] = await fetchBaseDenom(json["balances"][i]["denom"]);
        }
    }
    ibcTokensGlobal = json["balances"]
    return json
}

async function fetchTokenPairs() {
    const url = "http://192.168.178.32:1317/evmos/erc20/v1/token_pairs";
    const resp = await fetch(url);
    const json = await resp.json();
    return json
}

async function fetchAccount(address, pubKey) {
    const url = "http://192.168.178.32:1317/cosmos/auth/v1beta1/accounts/" + address;
    const resp = await fetch(url);
    const json = await resp.json();
    if (json["account"].length < 1) {
        return
    }
    const sender = {
        accountAddress: address,
        sequence: json.account.base_account.sequence,
        accountNumber: json.account.base_account.account_number,
        pubkey: json.account.base_account.pub_key?.key || pubKey,
    }
    return sender
}

async function fetchBaseDenom(address) {
    address = address.replace("ibc/", "")
    if(address.includes("erc20")) {
        return ""
    }
    const url = "http://192.168.178.32:1317/ibc/apps/transfer/v1/denom_traces/"+address
    const resp = await fetch(url);
    const json = await resp.json();
    if(json["denom_trace".length < 1]) {
        return ""
    }
    return json
}

function fetchErc20Balance(address) {
    for (var i = 0; i < erc20TokensGlobal.length; i++) {
        if (erc20TokensGlobal[i]["contractAddress"] == address) {
            return erc20TokensGlobal[i]["balance"]
        }
    }
    return 0;
}

function fetchIBCBalance(address) {
    for (var i = 0; i < ibcTokensGlobal.length; i++) {
        if (ibcTokensGlobal[i]["denom"] == address) {
            return ibcTokensGlobal[i]["amount"]
        }
    }
    return 0;
}

function addGovernanceModalErc20(id) {
    const currentErc20Token = erc20TokensGlobal[id];
    const erc20Address = currentErc20Token["contractAddress"];
    const decimals = currentErc20Token["decimals"];
    const balance = currentErc20Token["balance"];
    const name = currentErc20Token["name"];

    window.document.body.insertAdjacentHTML('beforeend','<div class="modal fade" id="erc20Modal'+id+'" tabindex="-1" aria-labelledby="erc20ModalLabel" aria-hidden="true">\n' +
        '  <div class="modal-dialog">\n' +
        '    <div class="modal-content">\n' +
        '      <div class="modal-header">\n' +
        '        <h5 class="modal-title" id="erc20ModalLabel">Create ERC20 Conversion Proposal</h5>\n' +
        '        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>\n' +
        '      </div>\n' +
        '      <div class="modal-body">\n' +
        '        <p>This will create a conversion proposal for '+name+'</p>\n' +
        '        <p>The address is '+erc20Address+'</p>\n' +
        '        <p>To continue click create.</p>\n' +
        '      </div>\n' +
        '      <div class="modal-footer">\n' +
        '        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>\n' +
        '        <button type="button" id="erc20CreateGovProposal'+id+'" class="btn btn-primary">Create</button>\n' +
        '      </div>\n' +
        '    </div>\n' +
        '  </div>\n' +
        '</div>')

    const erc20CreateGovProposalButton = document.getElementById("erc20CreateGovProposal" + id)
    erc20CreateGovProposalButton.addEventListener('click', function() {
        createGovProposalRegisterErc20(id);
    });
}

function createGovProposalRegisterErc20(id) {
    const currentErc20Token = erc20TokensGlobal[id];
    const erc20Address = currentErc20Token["contractAddress"];
    const name = currentErc20Token["name"];
    const title = "Register ERC20 ("+name+") for Conversion";
    const titleToggle = "Toggle ERC20 ("+name+") for Conversion";
    const description = "This proposal will register "+name+" which is located at address "+erc20Address+" for IBC/ERC20 conversion";
    const descriptionToggle = "This proposal will enable the conversion toggle for "+name+" which is located at address "+erc20Address;
    const msg = evmosjs.proto.createMsgRegisterERC20(title, description, erc20Address);
    //console.log(msg)
    prepareMsgForBroadcast(msg)


    //const toggleTokenConversionMsg = createMsgToggleTokenConversion(titleToggle, descriptionToggle, erc20Address);
    //console.log(toggleTokenConversionMsg)
    //prepareMsgForBroadcast(toggleTokenConversionMsg)
}

function createMsgToggleTokenConversion(title, description, address) {

    const toggleTokenConversionProto = {
    typeUrl : "/evmos.erc20.v1.ToggleTokenConversionProposal",
    value : {
        title: title,
        description : description,
        address : address
        }
    }
    let ar = [];
    ar[0] = new TextEncoder().encode(title);
    ar[1] = new TextEncoder().encode(description);
    ar[2] = new TextEncoder().encode(address);
    //proto =  proto.fromJsonString(toggleTokenConversionProto)
    console.log(  Uint8Array.from(ar))
    toggleTokenConversionProto.value = new TextEncoder().encode(JSON.stringify(toggleTokenConversionProto.value))
    const msg = evmosjs.proto.createMsgSubmitProposal(toggleTokenConversionProto, "aplanq", 0, currentAddress);
   // const msg = evmosjs.proto.createAnyMessage(prop);

    /*return {
        msg: toggleTokenConversionProto,
        type: evmosjs.proto.ToggleTokenConversionProposal.typeName
    };*/
    return msg;
}

function addGovernanceModalIBC(id) {
    const currentIBCToken = ibcTokensGlobal[id];
    const ibcAddress = currentIBCToken["denom"];
    const ibcBaseDenom = currentIBCToken["base_denom"];
    const balance = currentIBCToken["amount"];

    window.document.body.insertAdjacentHTML('beforeend','<div class="modal fade" id="ibcModal'+id+'" tabindex="-1" aria-labelledby="ibcModalLabel" aria-hidden="true">\n' +
        '  <div class="modal-dialog">\n' +
        '    <div class="modal-content">\n' +
        '      <div class="modal-header">\n' +
        '        <h5 class="modal-title" id="ibcModalLabel">Create IBC Conversion Proposal</h5>\n' +
        '        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>\n' +
        '      </div>\n' +
        '      <div class="modal-body">\n' +
        '        <p>This will create a IBC conversion proposal</p>\n' +
        '        <p>The address is '+ibcAddress+'</p>\n' +
        '        <p>To continue fill out the form and click create.</p>\n' +
        '        <form id="ibcCreateGovForm'+id+'">\n' +
        '           <input type="text" name="baseDenom" value="'+ibcBaseDenom+'" disabled="" />'+
        '           <input type="text" name="baseDenomUnits" value="0" disabled="" />'+
        '           <input type="text" name="displayDenom" placeholder="osmo" />'+
        '           <input type="text" name="displayUnits" placeholder="6" />'+
        '           <input type="text" name="displayName" placeholder="OSMO" />'+
        '           <input type="text" name="symbol" placeholder="OSMO" />'+
        '           <input type="text" name="description" placeholder="The native staking and governance token of the Osmosis chain" />'+
        '        </form>\n' +
        '      </div>\n' +
        '      <div class="modal-footer">\n' +
        '        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>\n' +
        '        <button type="button" id="ibcCreateGovProposal'+id+'" class="btn btn-primary">Create</button>\n' +
        '      </div>\n' +
        '    </div>\n' +
        '  </div>\n' +
        '</div>')

    const ibcCreateGovProposalButton = document.getElementById("ibcCreateGovProposal" + id)
    ibcCreateGovProposalButton.addEventListener('click', function() {
        const govForm = document.getElementById("ibcCreateGovForm"+id);
        const displayName = govForm.getElementsByName("displayName")[0];
        const displayDenom = govForm.getElementsByName("displayDenom")[0];
        const displayUnits = govForm.getElementsByName("displayUnits")[0];
        const symbol = govForm.getElementsByName("symbol")[0];
        const description = govForm.getElementsByName("description")[0];
        const denomUnits =
            [
                {
                    "denom": ibcAddress,
                    "exponent": 0,
                    "aliases": [ibcBaseDenom]
                },
                {
                    "denom": displayDenom,
                    "exponent": displayUnits
                }
            ]
        createGovProposalRegisterIBC(id, description, displayName, symbol, denomUnits);
    });
}

function createGovProposalRegisterIBC(id, metadataDescription, completeName, displayName, symbol, denomUnits) {
    const currentIBCToken = ibcTokensGlobal[id];
    const ibcDenom = currentIBCToken["denom"];
    const title = "Register IBC Token ("+displayName+") for Conversion";
    const titleToggle = "Toggle IBC Token ("+displayName+") for Conversion";
    const description = "This proposal will register "+displayName+" which is located at address "+ibcDenom+" for IBC/ERC20 conversion";
    const descriptionToggle = "This proposal will enable the conversion toggle for "+displayName+" which is located at address "+ibcDenom;
    const uri = ''
    const uriHash = ''
    const metadata = new evmosjs.proto.Metadata({
        description: metadataDescription,
        denomUnits: denomUnits,
        base: ibcDenom,
        display: displayName,
        name: completeName,
        symbol: symbol,
        uri,
        uriHash,
    })
    const msg = evmosjs.proto.createMsgRegisterCoin(title, description, [metadata]);
    prepareMsgForBroadcast(msg);

    const toggleTokenConversionMsg = createMsgToggleTokenConversion(titleToggle, descriptionToggle, ibcDenom);
    prepareMsgForBroadcast(toggleTokenConversionMsg)
}

function convertErc20(id) {
    const currentErc20Token = erc20TokensGlobal[0];
    const erc20Address = currentErc20Token["contractAddress"];
    const decimals = currentErc20Token["decimals"];
    const balance = currentErc20Token["balance"];
    const name = currentErc20Token["name"];
    const msg = evmosjs.proto.createMsgConvertERC20(erc20Address, balance, currentAddress, currentEvmAccount)
    prepareMsgForBroadcast(msg);
}

function convertIBC(id) {
    const currentIBCToken = ibcTokensGlobal[id];
    const ibcDenom = currentIBCToken["denom"];
    const balance = currentIBCToken["amount"];
    const msg = evmosjs.proto.createMsgConvertCoin(ibcDenom, balance, currentEvmAccount, currentAddress)
    prepareMsgForBroadcast(msg);
}

async function prepareMsgForBroadcast(msg) {
    await updateAccount();
    const tx = evmosjs.transactions.createTransactionPayload(txParams, msg, msg)

    const signedTx = await window.wallet.signDirect(chain.cosmosChainId, currentAddress,
        {
            bodyBytes: tx.signDirect.body.toBinary(),
            authInfoBytes: tx.signDirect.authInfo.toBinary(),
            chainId: chain.cosmosChainId,
            accountNumber: txParams.accountNumber
        }
    )

    const signature = Base64Binary.decode(signedTx.signature.signature)
    const rawTx = evmosjs.proto.createTxRaw(signedTx.signed.bodyBytes, signedTx.signed.authInfoBytes, [signature]);
    const broadcastTx = await broadcast(rawTx)
    console.log(broadcastTx)
   /* console.log(rawTx)
    const sendTx = await window.wallet.sendTx(chain.cosmosChainId, rawTx, "sync");
    console.log(sendTx)*/
}

async function broadcast(signedTx) {

    const broadcastResult = await fetch("http://192.168.178.32:1317/cosmos/tx/v1beta1/txs", {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: evmosjs.provider.generatePostBodyBroadcast(signedTx)
    });
    const jsonResult = await broadcastResult.json()
    console.log(jsonResult)
    return jsonResult;
}