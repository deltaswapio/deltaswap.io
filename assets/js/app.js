import {planqToEth} from "./bech32-utils.js";
import {ethers} from "./ethers-5.7.esm.min.js";
import {evmosjs} from "./lib.js";


let erc20TokensGlobal;
let ibcTokensGlobal;

window.onload = async () => {
    const chainId = "planq_7070-2";
    const response = await fetch("http://127.0.0.1:4000/assets/planq_7070.json")
    const planqJson = await response.json()

    const respe = await window.keplr.experimentalSuggestChain( planqJson )
    await window.keplr.enable(chainId);

    const offlineSigner = window.getOfflineSigner(chainId);

    // You can get the address/public keys by `getAccounts` method.
    // It can return the array of address/public key.
    // But, currently, Keplr extension manages only one address/public key pair.
    // XXX: This line is needed to set the sender address for SigningCosmosClient.
    const accounts = await offlineSigner.getAccounts();
    const evmAccount = planqToEth(accounts[0]["address"]);
    const pairs = await fetchTokenPairs();
    const erc20Tokens = await fetchErc20Tokens(evmAccount);
    const nativeTokens = await fetchNativeTokens(accounts[0]["address"]);
    console.log(nativeTokens)

    constructConversionTable(pairs);
    constructErc20Table(erc20Tokens);
    activateTooltips();

};

function activateTooltips() {
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl)
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

async function fetchErc20Tokens(address) {
    const url = "https://evm.planq.network/api?module=account&action=tokenlist&address=" + address;
    const resp = await fetch(url);
    const json = await resp.json();
    if (json["result"].length < 1) {
        return
    }
    erc20TokensGlobal = json["result"]
    return json
}

async function fetchNativeTokens(address) {
    const url = "https://rest.planq.network/cosmos/bank/v1beta1/balances/" + address;
    const resp = await fetch(url);
    const json = await resp.json();
    if (json["balances"].length < 1) {
        return
    }
    ibcTokensGlobal = json["balances"]
    return json
}

async function fetchTokenPairs() {
    const url = "https://rest.evmos-testnet.lava.build/evmos/erc20/v1/token_pairs";
    const resp = await fetch(url);
    const json = await resp.json();
    return json
}

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

        const cellErc20 = document.createElement("td");
        const cellTextErc20 = document.createTextNode(erc20Address,15);
        const cellBalanceErc20 = document.createElement("td");
        const cellBalanceTextErc20 = document.createTextNode(erc20Balance);
        const cellGov = document.createElement("td");

        cellGov.appendChild(addGovButton(i, currentErc20Token))
        cellErc20.appendChild(cellTextErc20);
        cellBalanceErc20.appendChild(cellBalanceTextErc20);

        row.appendChild(cellErc20);
        row.appendChild(cellBalanceErc20);
        row.appendChild(cellGov);

        erc20Table.children[0].appendChild(row);
    }
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
        cellBalanceErc20.appendChild(addConvertButton(erc20Address, erc20Balance));

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
        cellBalanceIBC.appendChild(addConvertButton(ibcDenom, ibcBalance));

        row.appendChild(cellErc20);
        row.appendChild(cellBalanceErc20);
        row.appendChild(cellIBC);
        row.appendChild(cellBalanceIBC);


        // add the row to the end of the table body
        convertTable.children[0].appendChild(row);
    }
}

function addGovButton(id, erc20Token) {
    addGovernanceModalErc20(id)
    const govButton = document.createElement("button")
    govButton.className = "btn btn-sm ms-1"
    /*if(balance > 0.0) {
        convertButton.className = "btn btn-sm ms-1"
    } else {
        convertButton.className = "btn btn-sm disabled ms-1"
    }*/
    govButton.dataset.bsToggle = "modal"
    govButton.dataset.bsTarget = "#erc20Modal"+id
    govButton.textContent = "Apply for Conversion";
    return govButton
}

function addConvertButton(address, balance) {
    const convertButton = document.createElement("button")
    if(balance > 0.0) {
        convertButton.className = "btn btn-sm ms-1"
    } else {
        convertButton.className = "btn btn-sm disabled ms-1"
    }
    convertButton.textContent = "Convert";
    return convertButton
}

function fetchErc20Balance(address) {
    return 123.0000001;
}

function fetchIBCBalance(address) {
    "/cosmos/bank/v1beta1/balances/"+address
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

    evmosjs.createMsgRegisterERC20("Register ERC20 ("+name+") for Conversion", "This proposal will register "+name+" which is located at address "+erc20Address+" for IBC/ERC20 conversion", erc20Address);
}

function createGovProposalRegisterIBC(id) {

}