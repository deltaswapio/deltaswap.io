import {planqToEth} from "./bech32-utils.js";
import {ethers} from "./ethers-5.7.esm.min.js";
import { Base64Binary } from "./base64-binary.js";
import "./lib.js";

const chain = {
    chainId: 7070,
    cosmosChainId: 'planq_7070-2',
}

const evmosjs = window.evmosjs.Evmosjs
const web3 = new ethers.providers.JsonRpcProvider("https://lb.nodies.app/v1/4c6d466fb4774d22bc7a032335996ab5", {chainId: chain.chainId, name:"Planq"},);

const memo = "DeltaSwap.io Convert"

const fee = {
    amount: '8000000000000000',
    denom: 'aplanq',
    gas: '8000000',
}

const timeout = 5000;

let txParams = {
    chain: chain,
    memo: memo,
    fee: fee,
    gasLimit: 8000000,
    sequence: 0,
    accountNumber: 0,
}

let erc20Tokens = new Map();
let ibcTokensGlobal = new Map();
let ibcChains = new Map();
let currentAddress;
let currentEvmAccount;
let erc20Abi;
let pairs;
let ibcConnections = [];
let currentModal;
let govProposals;

window.onload = async () => {
    let response = await fetch("https://deltaswap.io/assets/planq_7070.json")
    const planqJson = await response.json()
    response = await fetch("https://deltaswap.io/assets/erc20.abi.json")
    erc20Abi = await response.json()

    if(window.leap) {
        window.wallet = window.leap
    } else if (window.keplr) {
        window.wallet = window.keplr
    }
    await window.wallet.experimentalSuggestChain( planqJson )
    await window.wallet.enable(chain.cosmosChainId);

    pairs = await fetchTokenPairs();
    const ibc = await updateIBCConnections();
    await fetchGovProposals();


    // prepare the account
    await updateAccount();
    await updateErc20Tokens(currentEvmAccount);
    await updateIBCTokens(currentAddress);

    // construct conversion tables
    await updateConversionTable();
    updateErc20Table();
    updateIBCTable();

    activateTooltips();

    window.addEventListener("leap_keystorechange", async () => {
        await refetchAccount();
    })

    window.addEventListener("keplr_keystorechange", async () => {
        await refetchAccount();
    })
};

async function refetchAccount() {
    // prepare the account
    await updateAccount();
    await updateErc20Tokens(currentEvmAccount);
    await updateIBCTokens(currentAddress);

    // construct conversion tables
    await updateConversionTable();
    updateErc20Table();
    updateIBCTable();
}

async function updateAccount() {
    const offlineSigner = window.wallet.getOfflineSigner(chain.cosmosChainId);
    const accounts = await offlineSigner.getAccounts();
    currentAddress = accounts[0]["address"];
    const pubKey = await window.wallet.getKey(chain.cosmosChainId);
    const account = await fetchAccount(currentAddress, pubKey.pubKey);
    if(account == "error") {
        showAccountErrorNotification();
    }
    currentEvmAccount = planqToEth(accounts[0]["address"]);

    const evmAccount = document.querySelector("#evm-account")
    const cosmosAccount = document.querySelector("#cosmos-account")
    evmAccount.innerHTML = currentEvmAccount
    cosmosAccount.innerHTML = currentAddress
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

function updateErc20Table() {
    if (erc20Tokens.size < 1) {
        return
    }

    const erc20Table = document.querySelector("#erc20-table");

    let rows = [];
    const erc20Iterator = erc20Tokens[Symbol.iterator]();
    for (const [address, erc20Token] of erc20Iterator) {
        if(erc20Token["type"] === "ERC-20-Conversion") {
            continue;
        }
        const row = document.createElement("tr");
        const currentErc20Token = erc20Token;
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

        cellGov.appendChild(addGovButton(erc20Address));
        cellErc20.appendChild(cellTextErc20);
        cellNameErc20.appendChild(cellNameTextErc20);
        cellBalanceErc20.appendChild(cellBalanceTextErc20);

        row.appendChild(cellNameErc20);
        row.appendChild(cellErc20);
        row.appendChild(cellBalanceErc20);
        row.appendChild(cellGov);

        rows[rows.length] = row;
    }
    erc20Table.children[1].replaceChildren(...rows);
}

function updateIBCTable() {
    if (ibcTokensGlobal.size < 1) {
        return
    }

    const ibcTable = document.querySelector("#ibc-table");

    let rows = [];
    const ibcIterator = ibcTokensGlobal[Symbol.iterator]();
    for (const [address, ibcToken] of ibcIterator) {
        const row = document.createElement("tr");
        const currentIBCToken = ibcToken;
        const ibcAddress = currentIBCToken["denom"];
        let decimals = 0;

        if(currentIBCToken["base_denom"] && currentIBCToken["base_denom"] != "") {
            if(currentIBCToken["base_denom"][0] == "a") {
                decimals = 18;
            } else if (currentIBCToken["base_denom"][0] == "u"){
                decimals = 6
            }
        }

        const balance = currentIBCToken["amount"];
        const name = currentIBCToken["base_denom"];

        const ibcBalance = balance;

        const cellNameIBC = document.createElement("td");
        const cellNameTextIBC = document.createTextNode(name);
        const cellIBC = document.createElement("td");

        const cellTextIBC = document.createTextNode(truncate(ibcAddress,15));

        const cellBalanceIBC = document.createElement("td");
        const cellBalanceTextIBC = document.createTextNode(ibcBalance);
        const cellGov = document.createElement("td");
        const cellTooltipIBC = document.createElement("a");

        cellTooltipIBC.href = "#";
        cellTooltipIBC.dataset.bsToggle = "tooltip";
        cellTooltipIBC.dataset.bsOriginalTitle = ibcAddress;

        cellTooltipIBC.appendChild(cellTextIBC);

        cellGov.appendChild(addGovButton(ibcAddress));
        cellIBC.appendChild(cellTooltipIBC);
        cellNameIBC.appendChild(cellNameTextIBC);
        cellBalanceIBC.appendChild(cellBalanceTextIBC);

        row.appendChild(cellNameIBC);
        row.appendChild(cellIBC);
        row.appendChild(cellBalanceIBC);
        row.appendChild(cellGov);

        rows[rows.length] = row;
    }
    ibcTable.children[1].replaceChildren(...rows);
}

async function updateConversionTable() {
    if (pairs["pagination"].total < 1) {
        return
    }
    const convertTable = document.querySelector("#convert-table");
    let rows = [];
    for (let i = 0; i < pairs["pagination"].total; i++) {
        // creates a table row
        const row = document.createElement("tr");
        const currentPair = pairs["token_pairs"][i]
        const erc20Address = currentPair["erc20_address"];
        const ibcDenom = currentPair["denom"];
        const erc20Balance = await getErc20Balance(erc20Address.toLowerCase())
        const erc20Decimals = await getErc20Decimals(erc20Address.toLowerCase())
        const erc20Name = await getErc20Name(erc20Address.toLowerCase())
        const erc20Symbol = await getErc20Symbol(erc20Address.toLowerCase())
        const ibcBalance = await fetchIBCBalance(ibcDenom)

        const cellErc20 = document.createElement("td");
        const cellTooltipErc20 = document.createElement("a")
        const cellTextErc20 = document.createTextNode(erc20Name + " (" + erc20Symbol + ")");
        const cellBalanceErc20 = document.createElement("td");
        const cellBalanceTextErc20 = document.createTextNode(ethers.utils.formatUnits(erc20Balance,erc20Decimals));


        cellTooltipErc20.href = "https://evm.planq.network/address/" + erc20Address;
        cellTooltipErc20.target = "_blank"
        cellTooltipErc20.dataset.bsToggle = "tooltip";
        cellTooltipErc20.dataset.bsOriginalTitle = erc20Address;

        cellTooltipErc20.appendChild(cellTextErc20);
        cellErc20.appendChild(cellTooltipErc20);
        cellBalanceErc20.appendChild(cellBalanceTextErc20);
        cellBalanceErc20.appendChild(addConvertButton(erc20Address, erc20Balance));

        const cellIBC = document.createElement("td");
        const cellTextIBC = document.createTextNode(truncate(ibcDenom,15));
        const cellTooltipIBC = document.createElement("a");
        const cellBalanceIBC = document.createElement("td");
        const cellBalanceTextIBC = document.createTextNode(ethers.utils.formatUnits(ibcBalance,erc20Decimals));

        cellTooltipIBC.href = "#";
        cellTooltipIBC.dataset.bsToggle = "tooltip";
        cellTooltipIBC.dataset.bsOriginalTitle = ibcDenom;

        cellTooltipIBC.appendChild(cellTextIBC);
        cellIBC.appendChild(cellTooltipIBC);
        cellBalanceIBC.appendChild(cellBalanceTextIBC);
        cellBalanceIBC.appendChild(addConvertButton(ibcDenom, ibcBalance));
        cellBalanceIBC.appendChild(addSendButton(ibcDenom, ibcBalance, erc20Decimals));

        row.appendChild(cellErc20);
        row.appendChild(cellBalanceErc20);
        row.appendChild(cellIBC);
        row.appendChild(cellBalanceIBC);

        rows[rows.length] = row;

    }
    // add the row to the end of the table body
    convertTable.children[1].replaceChildren(...rows);
}

function addGovButton(address) {
    let modalTarget = "#erc20Modal"+address
    if(address.includes("ibc") || address.includes("erc20")) {
        addGovernanceModalIBC(address)
        modalTarget = "#ibcModal"+ethers.utils.id(address)
    } else {
        addGovernanceModalErc20(address)
    }

    const govButton = document.createElement("button")
    if(!isGovProposalRunning(address)) {
        govButton.className = "btn btn-sm ms-1"
    } else {
        govButton.className = "btn btn-sm disabled ms-1"
    }
    govButton.dataset.bsToggle = "modal"
    govButton.dataset.bsTarget = modalTarget
    govButton.textContent = "Apply for Conversion";
    return govButton
}

function addConvertButton(address, balance) {
    const convertButton = document.createElement("button");

    if(balance > 0.0) {
        convertButton.className = "btn btn-sm ms-1"
        convertButton.addEventListener('click', function() {
            if(address.includes("ibc") || address.includes("erc20")) {
                convertIBC(address);
            } else {
                convertErc20(address);
            }
        });
    } else {
        convertButton.className = "btn btn-sm disabled ms-1"
    }
    //convertButton.textContent = "Convert";
    convertButton.innerHTML = "<i class=\"bi bi-arrow-left-right\"></i>"
    convertButton.title = "Convert"
    return convertButton
}

function addSendButton(address, balance, decimals) {
    const sendButton = document.createElement("button");
    const modalTarget = "#sendIbcModal"+ethers.utils.id(address)

    if(balance > 0.0) {
        addSendModalIBC(address, balance, decimals);
        sendButton.className = "btn btn-sm ms-1"
    } else {
        sendButton.className = "btn btn-sm disabled ms-1"
    }

    sendButton.dataset.bsToggle = "modal"
    sendButton.dataset.bsTarget = modalTarget;

    sendButton.innerHTML = "<i class=\"bi bi-send\"></i>"
    sendButton.title = "Send"
    return sendButton
}

function isGovProposalRunning(address) {
    if(address == "0x5EBCdf1De1781e8B5D41c016B0574aD53E2F6E1A".toLowerCase()) {
        return true
    }
    for (let i = 0; i < pairs["pagination"].total; i++) {
        const pair = pairs["token_pairs"][i];
        if(pair["erc20_address"].toLowerCase() == address || pair["denom"] == address) {
            return true
        }
    }
    for(let i = 0; i < govProposals["pagination"].total; i++) {
        const prop = govProposals["proposals"][i];
        if(prop["status"] == "PROPOSAL_STATUS_VOTING_PERIOD" || prop["status"] == "PROPOSAL_STATUS_DEPOSIT_PERIOD" ) {

            if(prop["messages"][0]["content"]["@type"] == "/evmos.erc20.v1.RegisterERC20Proposal" && prop["messages"][0]["content"]["erc20address"] && prop["messages"][0]["content"]["erc20address"] == address) {
                return true
            }
            if(prop["messages"][0]["content"]["@type"] == "/evmos.erc20.v1.RegisterCoinProposal" && prop["messages"][0]["content"]["metadata"]["base"] && prop["messages"][0]["content"]["metadata"]["base"] == address) {
                return true
            }
        }
    }
    return false
}


async function updateErc20Tokens(address) {
    erc20Tokens.clear();
    const url = "https://evm.planq.network/api?module=account&action=tokenlist&address=" + address;
    const resp = await fetch(url);
    let json = await resp.json();

    for(var i = 0; i < pairs.pagination.total; i++) {
        const address = pairs["token_pairs"][i]["erc20_address"];
        erc20Tokens.set(address.toLowerCase(),
            {
                balance: await getErc20Balance(address),
                contractAddress: address,
                decimals: await getErc20Decimals(address),
                name: await getErc20Name(address),
                symbol: await getErc20Symbol(address),
                type:"ERC-20-Conversion"
            })
    }

    if (!json["result"] || json["result"].length < 1) {
        return
    }

    for(var i = 0; i < json["result"].length; i++) {
        if(json["result"][i]["decimals"] == "") {
            continue
        }
        erc20Tokens.set(json["result"][i]["contractAddress"], json["result"][i])
    }
}

async function updateIBCTokens(address) {
    ibcTokensGlobal.clear()
    const url = "https://rest.planq.network/cosmos/bank/v1beta1/balances/" + address;
    const resp = await fetch(url);
    const json = await resp.json();
    if (json["balances"].length < 1) {
        return
    }

    for(var i = 0; i < json["balances"].length; i++) {
        if(json["balances"][i]["denom"] === "aplanq") {
            continue
        }
        json["balances"][i]["base_denom"] = await fetchBaseDenom(json["balances"][i]["denom"]);
        ibcTokensGlobal.set(json["balances"][i]["denom"], json["balances"][i])
    }
}

async function updateIBCConnections() {
    const url = "https://registry.ping.pub/_IBC/";
    const resp = await fetch(url);
    const json = await resp.json();
    ibcChains.clear();
    ibcConnections = [];

    for(var i = 0; i < json.length; i++) {
        const entry = json[i];
        if(entry["name"].includes("planq")) {
            let resp = await fetch(url+entry["name"]);
            let json = await resp.json();
            ibcConnections.push(json);

            let destination = entry["name"].replace('planq-', '').replace('-planq', '');
            let keplrDestination = destination;

            switch (keplrDestination) {
                case "kujira.json":
                    keplrDestination = "kaiyo.json"
                    break
                case "gravitybridge.json":
                    keplrDestination = "gravity-bridge.json"
                    break
                case "sei.json":
                    keplrDestination = "pacific.json"
                    break
            }
            resp = await fetch("https://raw.githubusercontent.com/chainapsis/keplr-chain-registry/main/cosmos/"+keplrDestination)
            json = await resp.json();
            ibcChains.set(destination.replace(".json",""), json)
        }
    }

    return json
}

async function fetchTokenPairs() {
    const url = "https://rest.planq.network/evmos/erc20/v1/token_pairs";
    const resp = await fetch(url);
    const json = await resp.json();
    return json
}

async function fetchGovProposals() {
    const url = "https://rest.planq.network/cosmos/gov/v1/proposals";
    const resp = await fetch(url);
    const json = await resp.json();
    govProposals = json
}

async function fetchAccount(address, pubKey) {
    const url = "https://rest.planq.network/cosmos/auth/v1beta1/accounts/" + address;

    const resp = await fetch(url);
    const json = await resp.json();
    if (!json["account"] || json["account"].length < 1) {
        return "error"
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
    const url = "https://rest.planq.network/ibc/apps/transfer/v1/denom_traces/"+address
    const resp = await fetch(url);
    const json = await resp.json();
    if(json["denom_trace".length < 1]) {
        return ""
    }
    return json["denom_trace"]["base_denom"]
}

async function getErc20Symbol(address) {
    const contract = new ethers.Contract(address, erc20Abi, web3)
    return await contract.symbol();
}

async function getErc20Name(address) {
    const contract = new ethers.Contract(address, erc20Abi, web3)
    return await contract.name();
}

async function getErc20Decimals(address) {
    const contract = new ethers.Contract(address, erc20Abi, web3)
    return await contract.decimals();
}

async function getErc20Balance(address) {
    const contract = new ethers.Contract(address, erc20Abi, web3)
    const balance = await contract.balanceOf(currentEvmAccount);
    return balance.toString();
}

async function fetchIBCBalance(address) {
    if (ibcTokensGlobal.get(address)) {
        return ibcTokensGlobal.get(address)["amount"]
    }
    return 0;
}

function addGovernanceModalErc20(erc20Address) {
    const currentErc20Token = erc20Tokens.get(erc20Address);
    const decimals = currentErc20Token["decimals"];
    const balance = currentErc20Token["balance"];
    const name = currentErc20Token["name"];

    window.document.body.insertAdjacentHTML('beforeend','<div class="modal fade" id="erc20Modal'+erc20Address+'" tabindex="-1" aria-labelledby="erc20ModalLabel" aria-hidden="true">\n' +
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
        '        <button type="button" id="erc20CreateGovProposal'+erc20Address+'" data-bs-dismiss="modal" class="btn btn-primary">Create</button>\n' +
        '      </div>\n' +
        '    </div>\n' +
        '  </div>\n' +
        '</div>')

    const currentModal = "#erc20Modal"+erc20Address;

    const erc20CreateGovProposalButton = document.getElementById("erc20CreateGovProposal" + erc20Address)
    erc20CreateGovProposalButton.addEventListener('click', async function() {
        const tx = await createGovProposalRegisterErc20(erc20Address);
        showTxBroadcastNotification(tx);
    });
}

async function createGovProposalRegisterErc20(erc20Address) {
    const currentErc20Token = erc20Tokens.get(erc20Address);
    const name = currentErc20Token["name"];
    const title = "Register ERC20 ("+name+") for Conversion";
    const description = "This proposal will register "+name+" which is located at address "+erc20Address+" for IBC/ERC20 conversion";
    let msg = evmosjs.proto.createMsgRegisterERC20(title, description, [erc20Address.toLowerCase()]);
    msg = evmosjs.proto.createMsgSubmitProposal(evmosjs.proto.createAnyMessage(msg), "aplanq", "500000000000000000000", currentAddress);
    return await signAndBroadcastMsg(msg)
}

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function transformIBCDestination(id) {
    const chain1 = ibcConnections[id]["chain_1"]["chain_name"];
    const chain2 = ibcConnections[id]["chain_2"]["chain_name"];
    return chain1 === "planq" ? chain2 : chain1;
}

function getSourceIBCChannel(id) {
    const chain1 = ibcConnections[id]["chain_1"]["chain_name"];
    const chain2 = ibcConnections[id]["chain_2"]["chain_name"];
    let channel = 0;

    if (chain1 === "planq") {
        channel = ibcConnections[id]["channels"][0]["chain_1"]["channel_id"];
    } else {
        channel = ibcConnections[id]["channels"][0]["chain_2"]["channel_id"];
    }
    return channel;
}

function getDestinationIBCChannel(id) {
    const chain1 = ibcConnections[id]["chain_1"]["chain_name"];
    const chain2 = ibcConnections[id]["chain_2"]["chain_name"];
    let channel = 0;

    if (chain1 !== "planq") {
        channel = ibcConnections[id]["channels"][0]["chain_1"]["channel_id"];
    } else {
        channel = ibcConnections[id]["channels"][0]["chain_2"]["channel_id"];
    }
    return channel;
}

async function getIBCRevision(id) {
    const keplrChain = ibcChains.get(transformIBCDestination(id));
    const rest = keplrChain["rest"];
    const channel = getDestinationIBCChannel(id);
    const url = rest + "ibc/core/channel/v1/channels/" + channel + "/ports/transfer";
    const resp = await fetch(url);
    let json = await resp.json();
    return { revisionHeight: json["proof_height"]["revision_height"], revisionNumber: json["proof_height"]["revision_number"] }
}

function addSendModalIBC(address, balance, decimals) {
    let ibcOptions = "";
    let formattedBalance = ethers.utils.formatUnits(balance, decimals);
    for(var i = 0; i < ibcConnections.length; i++) {
        const destination = transformIBCDestination(i)
        const img = ibcChains.get(destination.toLowerCase())["chainSymbolImageUrl"]
        if(destination === "source") {
            ibcOptions += "<option value=\""+i+"\" selected data-content=\"<img src='"+img+"' width='64' height='64' />\">"+capitalizeFirstLetter(destination)+"</option>";
        } else {
            ibcOptions += "<option value=\""+i+"\" data-content=\"<img src='"+img+"' width='64' height='64' />\">"+capitalizeFirstLetter(destination)+"</option>";
        }
    }

    window.document.body.insertAdjacentHTML('beforeend','<div class="modal fade" id="sendIbcModal'+ethers.utils.id(address)+'" tabindex="-1" aria-labelledby="sendIbcModalLabel" aria-hidden="true">\n' +
        '  <div class="modal-dialog">\n' +
        '    <div class="modal-content">\n' +
        '      <div class="modal-header">\n' +
        '        <h5 class="modal-title" id="sendIbcModalLabel">Send Token via IBC</h5>\n' +
        '        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>\n' +
        '      </div>\n' +
        '      <div class="modal-body">\n' +
        '        <p>Fill out the form and click send to initiate the IBC transfer.</p>\n' +
        '        <form id="sendIbcForm'+ethers.utils.id(address)+'">' +
        '           <div class="mb-3">'+
        '               <label for="baseDenom" class="form-label">Denom</label>\n'+
        '               <input class="form-control" type="text" id="baseDenom" name="baseDenom" value="'+address+'" disabled="" />'+
        '           </div>'+
        '           <div class="mb-3">'+
        '               <label for="baseDenomAmount" class="form-label">Amount</label>\n'+
        '               <input class="form-control" type="text" id="baseDenomAmount" name="baseDenomAmount" value="0" />' +
        '               <a href="#" class="small" id="formattedBalance'+ethers.utils.id(address)+'">Balance '+formattedBalance+'</a>'+
        '           </div>'+
        '           <div class="mb-3">'+
        '               <label for="destinationChain" class="form-label">Destination Chain</label>\n'+
        '               <select class="form-control" id="destinationChain" name="destinationChain">'+ibcOptions+'</select>'+
        '           </div>'+
        '           <div class="mb-3">'+
        '               <label for="destinationAddress" class="form-label">Destination Address</label>\n'+
        '               <div class="input-group">' +
        '                   <input class="form-control" type="text" id="destinationAddress'+ethers.utils.id(address)+'" name="destinationAddress" />' +
    '                       <button id="getDestinationAddressIBC'+ethers.utils.id(address)+'" class="btn btn-info">Get Address</button>' +
        '               </div>'+
        '           </div>'+
        '        </form>\n' +
        '      </div>\n' +
        '      <div class="modal-footer">\n' +
        '        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>\n' +
        '        <button type="button" id="sendIbc'+ethers.utils.id(address)+'" data-bs-dismiss="modal" class="btn btn-primary">Send</button>\n' +
        '      </div>\n' +
        '    </div>\n' +
        '  </div>\n' +
        '</div>')


    const currentModal = "sendIbcModal"+ethers.utils.id(address);
    const getBalanceLink = document.getElementById("formattedBalance"+ethers.utils.id(address));
    getBalanceLink.addEventListener('click', function(event) {
        event.preventDefault();
        const sendForm = document.getElementById("sendIbcForm"+ethers.utils.id(address));
        sendForm["1"].value = ethers.utils.formatUnits(balance, decimals);

    });

    const getDestinationAddressIBCButton = document.getElementById("getDestinationAddressIBC"+ethers.utils.id(address));
    const getDestinationAddressIBCInput = document.getElementById("destinationAddress"+ethers.utils.id(address));

    getDestinationAddressIBCButton.addEventListener('click', async function(event) {
        event.preventDefault();
        const sendForm = document.getElementById("sendIbcForm"+ethers.utils.id(address));
        const selectedIBCConnection = sendForm["2"].value;

        const keplrChain = ibcChains.get(transformIBCDestination(selectedIBCConnection));
        await window.wallet.experimentalSuggestChain(keplrChain);
        const offlineSigner = window.wallet.getOfflineSigner(keplrChain["chainId"]);
        const accounts = await offlineSigner.getAccounts();
        const destinationAddress = accounts[0]["address"];
        getDestinationAddressIBCInput.innerText = destinationAddress
        getDestinationAddressIBCInput.value = destinationAddress
    });

    const ibcSendButton = document.getElementById("sendIbc" + ethers.utils.id(address))
    ibcSendButton.addEventListener('click', async function() {
        const sendForm = document.getElementById("sendIbcForm"+ethers.utils.id(address));
        console.log(sendForm)
        const baseDenom = sendForm[0].value;
        const baseDenomAmount = ethers.utils.parseUnits(sendForm[1].value, decimals).toString();
        const destinationChain = sendForm[2].value;
        const destinationAddress = sendForm[3].value;
        const channel = getSourceIBCChannel(destinationChain);
        const ibcRevision = await getIBCRevision(destinationChain);

        const msg = evmosjs.proto.createIBCMsgTransfer("transfer", channel, baseDenomAmount, baseDenom, currentAddress, destinationAddress, ibcRevision.revisionNumber, ibcRevision.revisionHeight+100, 0)
        const tx = await signAndBroadcastMsg(msg);
        showTxBroadcastNotification(tx);
        setTimeout(await refetchAccount,timeout);
    });
}

function addGovernanceModalIBC(address) {
    const currentIBCToken = ibcTokensGlobal.get(address);
    const ibcAddress = currentIBCToken["denom"];
    const ibcBaseDenom = currentIBCToken["base_denom"];
    const balance = currentIBCToken["amount"];

    window.document.body.insertAdjacentHTML('beforeend','<div class="modal fade" id="ibcModal'+ethers.utils.id(address)+'" tabindex="-1" aria-labelledby="ibcModalLabel" aria-hidden="true">\n' +
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
        '        <form id="ibcCreateGovForm'+ethers.utils.id(address)+'">' +
        '           <div class="mb-3">'+
        '               <label for="baseDenom" class="form-label">Base Denom</label>\n'+
        '               <input class="form-control" type="text" id="baseDenom" name="baseDenom" value="'+ibcBaseDenom+'" disabled="" />'+
        '           </div>'+
        '           <div class="mb-3">'+
        '               <label for="baseDenomUnits" class="form-label">Base Denom Units</label>\n'+
        '               <input class="form-control" type="text" id="baseDenomUnits" name="baseDenomUnits" value="0" disabled="" />'+
        '           </div>'+
        '           <div class="mb-3">'+
        '               <label for="displayDenom" class="form-label">Display Denom</label>\n'+
        '               <input class="form-control" type="text" id="displayDenom" name="displayDenom" placeholder="KUJI" />'+
        '           </div>'+
        '           <div class="mb-3">'+
        '               <label for="displayUnits" class="form-label">Display Denom Units</label>\n'+
        '               <input class="form-control" type="text" id="displayUnits" name="displayUnits" placeholder="6" />'+
        '           </div>'+
        '           <div class="mb-3">'+
        '               <label for="symbol" class="form-label">Symbol</label>\n'+
        '               <input class="form-control" type="text" id="symbol" name="symbol" placeholder="KUJI" />'+
        '           </div>'+
        '           <div class="mb-3">'+
        '               <label for="displayName" class="form-label">Display Name</label>\n'+
        '               <input class="form-control" type="text" id="displayName" name="displayName" placeholder="Kujira" />'+
        '           </div>'+
        '           <div class="mb-3">'+
        '               <label for="description" class="form-label">Description</label>\n'+
        '               <input class="form-control" type="text" id="description" name="description" placeholder="The native staking and governance token of the Kujira chain" />'+
        '           </div>'+
        '        </form>\n' +
        '      </div>\n' +
        '      <div class="modal-footer">\n' +
        '        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>\n' +
        '        <button type="button" id="ibcCreateGovProposal'+ethers.utils.id(address)+'" data-bs-dismiss="modal" class="btn btn-primary">Create</button>\n' +
        '      </div>\n' +
        '    </div>\n' +
        '  </div>\n' +
        '</div>')


    const currentModal = "ibcModal"+ethers.utils.id(address);

    const ibcCreateGovProposalButton = document.getElementById("ibcCreateGovProposal" + ethers.utils.id(address))
    ibcCreateGovProposalButton.addEventListener('click', async function() {
        const govForm = document.getElementById("ibcCreateGovForm"+ethers.utils.id(address));
        const displayDenom = govForm[2].value;
        const displayUnits = govForm[3].value;
        const symbol = govForm[4].value;
        const displayName = govForm[5].value;
        const description = govForm[6].value;
        const denomUnits =
            [
                {
                    "denom": ibcAddress,
                    "exponent": 0,
                    "aliases": [ibcBaseDenom]
                },
                {
                    "denom": displayDenom,
                    "exponent": parseInt(displayUnits)
                }
            ]

        const tx = await createGovProposalRegisterIBC(address, description, displayName, displayDenom, symbol, denomUnits);
        showTxBroadcastNotification(tx);
    });
}

async function createGovProposalRegisterIBC(address, metadataDescription, completeName, displayName, symbol, denomUnits) {
    const currentIBCToken = ibcTokensGlobal.get(address);
    const ibcDenom = currentIBCToken["denom"];
    const title = "Register IBC Token ("+displayName+") for Conversion";
    const description = "This proposal will register "+displayName+" which is located at address "+ibcDenom+" for IBC/ERC20 conversion";
    const uri = ''
    const uriHash = ''
    const metadata = {
        description: metadataDescription,
        denomUnits: denomUnits,
        base: ibcDenom,
        display: displayName,
        name: completeName,
        symbol: symbol,
        uri: uri,
        uriHash: uriHash,
    }
    let msg = evmosjs.proto.createMsgRegisterCoin(title, description, [metadata]);
    msg = evmosjs.proto.createMsgSubmitProposal(evmosjs.proto.createAnyMessage(msg), "aplanq", "500000000000000000000", currentAddress);
    return await signAndBroadcastMsg(msg)
}

async function convertErc20(address) {
    const currentErc20Token = erc20Tokens.get(address.toLowerCase());
    const erc20Address = currentErc20Token["contractAddress"];
    const decimals = currentErc20Token["decimals"];
    const balance = currentErc20Token["balance"];
    const name = currentErc20Token["name"];

    const msg = evmosjs.proto.createMsgConvertERC20(erc20Address, balance, currentAddress, currentEvmAccount)
    const tx = await signAndBroadcastMsg(msg);
    showTxBroadcastNotification(tx);
    setTimeout(await refetchAccount,timeout);
}

async function convertIBC(address) {
    const currentIBCToken = ibcTokensGlobal.get(address);
    const ibcDenom = currentIBCToken["denom"];
    const balance = currentIBCToken["amount"];
    const msg = evmosjs.proto.createMsgConvertCoin(ibcDenom, balance, currentEvmAccount, currentAddress)
    const tx = await signAndBroadcastMsg(msg);
    showTxBroadcastNotification(tx);
    setTimeout(await refetchAccount,timeout);
}

async function signAndBroadcastMsg(msg) {
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
    return await broadcast(rawTx)
}

async function broadcast(signedTx) {

    const broadcastResult = await fetch("https://rest.planq.network/cosmos/tx/v1beta1/txs", {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: evmosjs.provider.generatePostBodyBroadcast(signedTx)
    });
    const jsonResult = await broadcastResult.json()
    return jsonResult;
}

function showTxBroadcastNotification(tx) {
    const txHash = tx["tx_response"]["txhash"];
    const spinner = "<div class=\"spinner-border text-dark\" role=\"status\">\n" +
    "  <span class=\"sr-only\"></span>\n" +
    "</div>"
    let header = "Success";
    let body = '      <a href="https://explorer.planq.network/transactions/'+txHash+'" target="_blank">'+txHash+'</a>.\n';
    let delay = timeout;
    let color = "bg-success"
    if(tx["tx_response"]["raw_log"] != "[]") {
        header = "Error";
        body = tx["tx_response"]["raw_log"];
        delay = 5000;
        color = "bg-danger"
    }


    window.document.body.insertAdjacentHTML('beforeend',
        '<div class="toast-container position-absolute p-3 top-0 end-0" >\n' +
        '  <div class="toast '+color+'" role="alert" aria-live="assertive" aria-atomic="true" id="tx'+txHash+'">\n' +
        '    <div class="toast-header">\n' +
        '      <strong class="me-auto">'+spinner+header+'</strong>\n' +
        '      <small>now</small>\n' +
        '      <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>\n' +
        '    </div>\n' +
        '    <div class="toast-body">\n' +
         body +
        '    </div>\n' +
        '  </div>\n' +
        '</div>')

    const toast = bootstrap.Toast.getOrCreateInstance(document.querySelector("#tx"+txHash), {delay: delay})
    toast.show();
}

function showAccountErrorNotification() {

    window.document.body.insertAdjacentHTML('beforeend',
        '<div class="toast-container position-absolute p-3 top-0 end-0" >\n' +
        '  <div class="toast bg-danger" role="alert" aria-live="assertive" aria-atomic="true" id="accounterror">\n' +
        '    <div class="toast-header">\n' +
        '      <strong class="me-auto">Account Error</strong>\n' +
        '      <small>now</small>\n' +
        '      <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>\n' +
        '    </div>\n' +
        '    <div class="toast-body">\n' +
        '    Please select a different account which previously received PLQ.\n' +
        '    </div>\n' +
        '  </div>\n' +
        '</div>')

    const toast = bootstrap.Toast.getOrCreateInstance(document.querySelector("#accounterror"), {delay: 5000})
    toast.show();
}
