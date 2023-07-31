import React, { useState, useEffect } from "react";
import {
  getAddress,
  signTransaction,
  signMessage,
  sendBtcTransaction,
} from "sats-connect";
import * as btc from "@scure/btc-signer";
import { hex, base64 } from "@scure/base";
import { useParams } from "react-router-dom";
import bigInt from "big-integer";

const Dashboard = () => {

      const { value, address   } = useParams();
      console.log("this is the value:  ", value)
      console.log("this is the address:  ", address)
  const [paymentAddress, setPaymentAddress] = useState("");
  const [paymentPublicKey, setPaymentPublicKey] = useState("");
  const [ordinalsAddress, setOrdinalsAddress] = useState("");
  const [ordinalsPublicKey, setOrdinalsPublicKey] = useState("");


  useEffect(() => {
    // ComponentDidMount equivalent
    // Add any initial logic here if needed
  }, []);

  const onConnectClick = async () => {
    const getAddressOptions = {
      payload: {
        purposes: ["ordinals", "payment"],
        message: "Address for receiving Ordinals",
        network: {
          type: "Mainnet",
        },
      },
      onFinish: (response) => {
        setOrdinalsAddress(response.addresses[0].address);
        setPaymentAddress(response.addresses[1].address);
        setOrdinalsPublicKey(response.addresses[0].publicKey);
        setPaymentPublicKey(response.addresses[1].publicKey);
      },
      onCancel: () => alert("Request canceled"),
    };
    await getAddress(getAddressOptions);
  };

  const getUnspent = async (address) => {
    const url = `http://localhost:3002/api/address/${address}/`; // Replace with your proxy server URL
    const response = await fetch(url);
    return response.json();
  };

  const createPsbt = async (
    paymentPublicKeyString,
    ordinalsPublicKeyString,
    paymentUnspentOutputs,
    ordinalsUnspentOutputs,
    recipient1,
    recipient2
  ) => {
    const bitcoinTestnet = {
      bech32: "tb",
      pubKeyHash: 0x6f,
      scriptHash: 0xc4,
      wif: 0xef,
    };

    // choose first unspent output
    const paymentOutput = paymentUnspentOutputs[0];
    const ordinalOutput = ordinalsUnspentOutputs[0];

    const paymentPublicKey = hex.decode(paymentPublicKeyString);
    const ordinalPublicKey = hex.decode(ordinalsPublicKeyString);

    const tx = new btc.Transaction();

    // create segwit spend
    const p2wpkh = btc.p2wpkh(paymentPublicKey, bitcoinTestnet);
    const p2sh = btc.p2sh(p2wpkh, bitcoinTestnet);

    // create taproot spend
    const p2tr = btc.p2tr(ordinalPublicKey, undefined, bitcoinTestnet);

    // set transfer amount and calculate change
    const fee = 300n; // set the miner fee amount
    const recipient1Amount = bigInt(Math.min(paymentOutput.value, 3000)) - fee;
    const recipient2Amount = bigInt(Math.min(ordinalOutput.value, 3000));
    const total = recipient1Amount + recipient2Amount;
    const changeAmount =
      bigInt(paymentOutput.value) + bigInt(ordinalOutput.value) - total - fee;

    // payment input
    tx.addInput({
      txid: paymentOutput.txid,
      index: paymentOutput.vout,
      witnessUtxo: {
        script: p2sh.script ? p2sh.script : Buffer.alloc(0),
        amount: bigInt(paymentOutput.value),
      },
      redeemScript: p2sh.redeemScript ? p2sh.redeemScript : Buffer.alloc(0),
      witnessScript: p2sh.witnessScript,
      sighashType: btc.SignatureHash.SINGLE | btc.SignatureHash.ANYONECANPAY,
    });

    // ordinals input
    tx.addInput({
      txid: ordinalOutput.txid,
      index: ordinalOutput.vout,
      witnessUtxo: {
        script: p2tr.script,
        amount: bigInt(ordinalOutput.value),
      },
      tapInternalKey: ordinalPublicKey,
      sighashType: btc.SignatureHash.SINGLE | btc.SignatureHash.ANYONECANPAY,
    });

    tx.addOutputAddress(recipient1, recipient1Amount, bitcoinTestnet);
    tx.addOutputAddress(recipient2, recipient2Amount, bitcoinTestnet);
    tx.addOutputAddress(recipient2, changeAmount, bitcoinTestnet);

    const psbt = tx.toPSBT(0);
    const psbtB64 = base64.encode(psbt);
    return psbtB64;
  };

  const onSignTransactionClick = async () => {
    const paymentUnspentOutputs = await getUnspent(paymentAddress);
    console.log("this is the unspent outputs", paymentUnspentOutputs);
    const ordinalsUnspentOutputs = await getUnspent(ordinalsAddress);

    if (paymentUnspentOutputs.length < 1) {
      alert("No unspent outputs found for payment address");
    }

    if (ordinalsUnspentOutputs.length < 1) {
      alert("No unspent outputs found for ordinals address");
    }

    // create psbt sending from payment address to ordinals address
    const outputRecipient1 = ordinalsAddress;
    const outputRecipient2 = paymentAddress;

    const psbtBase64 = await createPsbt(
      paymentPublicKey,
      ordinalsPublicKey,
      paymentUnspentOutputs,
      ordinalsUnspentOutputs,
      outputRecipient1,
      outputRecipient2
    );

    const signPsbtOptions = {
      payload: {
        network: {
          type: "Mainnet",
        },
        message: "Sign Transaction",
        psbtBase64: psbtBase64,
        broadcast: false,
        inputsToSign: [
          {
            address: paymentAddress,
            signingIndexes: [0],
            sigHash: btc.SignatureHash.SINGLE | btc.SignatureHash.ANYONECANPAY,
          },
          {
            address: ordinalsAddress,
            signingIndexes: [1],
            sigHash: btc.SignatureHash.SINGLE | btc.SignatureHash.ANYONECANPAY,
          },
        ],
      },
      onFinish: (response) => {
        alert(response.psbtBase64);
      },
      onCancel: () => alert("Canceled"),
    };
    await signTransaction(signPsbtOptions);
  };

  const onSignMessageClick = async () => {
    const signMessageOptions = {
      payload: {
        network: {
          type: "Mainnet",
        },
        address: ordinalsAddress,
        message: "Sign Transaction",
      },
      onFinish: (response) => {
        alert(response);
      },
      onCancel: () => alert("Canceled"),
    };
    await signMessage(signMessageOptions);
  };

  const onSendBtcClick = async () => {
    const sendBtcOptions = {
      payload: {
        network: {
          type: "Mainnet",
        },
        recipients: [
          {
            address: address,
            amountSats: value,
          },
        ],
        senderAddress: paymentAddress,
      },
      onFinish: (response) => {
        alert(response);
      },
      onCancel: () => alert("Canceled"),
    };
    await sendBtcTransaction(sendBtcOptions);
  };

  return (
    <div style={{ padding: 30 }}>
       Test App
      <div>
        <br />
        {paymentAddress && <div>Payment Address: {paymentAddress}</div>}
        {ordinalsAddress && <div>Ordinals Address: {ordinalsAddress}</div>}

        <div style={{ background: "lightgray", padding: 30, margin: 10 }}>
          <button style={{ height: 30, width: 180 }} onClick={onConnectClick}>
            Connect
          </button>
        </div>

        {/* <div style={{ background: "lightgray", padding: 30, margin: 10 }}>
          <button
            style={{ height: 30, width: 180 }}
            onClick={onSignTransactionClick}
          >
            Sign Transaction
          </button>
        </div>

        <div style={{ background: "lightgray", padding: 30, margin: 10 }}>
          <button
            style={{ height: 30, width: 180 }}
            onClick={onSignMessageClick}
          >
            Sign message
          </button>
        </div> */}

        <div
          style={{
            background: "lightgray",
            padding: 30,
            margin: 10,
            display: "flex",
          }}
        >
          <button style={{ height: 30, width: 180 }} onClick={onSendBtcClick}>
            Send BTC Transaction
          </button>
        </div>
        <br />
      </div>
    </div>
  );
};

export default Dashboard;
