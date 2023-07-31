import React from "react";
import { getAddress, signTransaction, signMessage, sendBtcTransaction  } from "sats-connect";
import * as btc from '@scure/btc-signer';
import { hex, base64 } from '@scure/base'

class Dashboard extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      paymentAddress: "",
      paymentPublicKey: "",
      ordinalsAddress: "",
      ordinalsPublicKey: "",
    };
  }

  onConnectClick = async () => {
    console.log("onConnectClick")
    const getAddressOptions = {
      payload: {
        purposes: ["ordinals", "payment"],
        message: "Address for receiving Ordinals",
        network: {
          type: "Testnet",
        },
      },
      onFinish: (response) => {
        this.setState({
          ordinalsAddress: response.addresses[0].address,
          paymentAddress: response.addresses[1].address,
          ordinalsPublicKey: response.addresses[0].publicKey,
          paymentPublicKey: response.addresses[1].publicKey,
        });
      },
      onCancel: () => alert("Request canceled"),
    };
    await getAddress(getAddressOptions);
  };

  getUnspent = async (address) => {
    const url = `https://mempool.space/testnet/api/address/${address}/utxo`
    const response = await fetch(url)
    return response.json()
  }

  createPsbt = async (
    paymentPublicKeyString,
    ordinalsPublicKeyString, 
    paymentUnspentOutputs, 
    ordinalsUnspentOutputs,
    recipient1,
    recipient2,
  ) => {
    const bitcoinTestnet = {
      bech32: 'tb',
      pubKeyHash: 0x6f,
      scriptHash: 0xc4,
      wif: 0xef,
    }

    // choose first unspent output
    const paymentOutput = paymentUnspentOutputs[0]
    const ordinalOutput = ordinalsUnspentOutputs[0]

    const paymentPublicKey = hex.decode(paymentPublicKeyString)
    const ordinalPublicKey = hex.decode(ordinalsPublicKeyString)
    
    const tx = new btc.Transaction();

    // create segwit spend
    const p2wpkh = btc.p2wpkh(paymentPublicKey, bitcoinTestnet);
    const p2sh = btc.p2sh(p2wpkh, bitcoinTestnet);

    // create taproot spend
    const p2tr = btc.p2tr(ordinalPublicKey, undefined, bitcoinTestnet);

    // set transfer amount and calculate change
    const fee = 300n // set the miner fee amount
    const recipient1Amount = BigInt(Math.min(paymentOutput.value, 3000)) - fee
    const recipient2Amount = BigInt(Math.min(ordinalOutput.value, 3000))
    const total = recipient1Amount + recipient2Amount
    const changeAmount = BigInt(paymentOutput.value) + BigInt(ordinalOutput.value) - total - fee

    // payment input
    tx.addInput({
      txid: paymentOutput.txid,
      index: paymentOutput.vout,
      witnessUtxo: {
        script: p2sh.script ? p2sh.script : Buffer.alloc(0),
        amount: BigInt(paymentOutput.value),
      },
      redeemScript: p2sh.redeemScript ? p2sh.redeemScript : Buffer.alloc(0),
      witnessScript: p2sh.witnessScript,
      sighashType: btc.SignatureHash.SINGLE|btc.SignatureHash.ANYONECANPAY
    })

    // ordinals input
    tx.addInput({
      txid: ordinalOutput.txid,
      index: ordinalOutput.vout,
      witnessUtxo: {
        script: p2tr.script,
        amount: BigInt(ordinalOutput.value),
      },
      tapInternalKey: ordinalPublicKey,
      sighashType: btc.SignatureHash.SINGLE|btc.SignatureHash.ANYONECANPAY
    })

    tx.addOutputAddress(recipient1, recipient1Amount, bitcoinTestnet)
    tx.addOutputAddress(recipient2, recipient2Amount, bitcoinTestnet)
    tx.addOutputAddress(recipient2, changeAmount, bitcoinTestnet)

    const psbt = tx.toPSBT(0)
    const psbtB64 = base64.encode(psbt)
    return psbtB64
  }

  onSignTransactionClick = async () => {
    const paymentUnspentOutputs = await this.getUnspent(this.state.paymentAddress);
    const ordinalsUnspentOutputs = await this.getUnspent(this.state.ordinalsAddress);

    if (paymentUnspentOutputs.length < 1) {
      alert('No unspent outputs found for payment address')
    }
    
    if (ordinalsUnspentOutputs.length < 1) {
      alert('No unspent outputs found for ordinals address')
    }

    // create psbt sending from payment address to ordinals address
    const outputRecipient1 = this.state.ordinalsAddress;
    const outputRecipient2 = this.state.paymentAddress;

    const psbtBase64 = await this.createPsbt(
      this.state.paymentPublicKey, 
      this.state.ordinalsPublicKey,
      paymentUnspentOutputs, 
      ordinalsUnspentOutputs,
      outputRecipient1,
      outputRecipient2
    )

    const signPsbtOptions = {
      payload: {
        network: {
          type: "Testnet",
        },
        message: "Sign Transaction",
        psbtBase64: psbtBase64,
        broadcast: false,
        inputsToSign: [
          {
            address: this.state.paymentAddress,
            signingIndexes: [0],
            sigHash: btc.SignatureHash.SINGLE|btc.SignatureHash.ANYONECANPAY,
          },
          {
            address: this.state.ordinalsAddress,
            signingIndexes: [1],
            sigHash: btc.SignatureHash.SINGLE|btc.SignatureHash.ANYONECANPAY,
          }
        ],
      },
      onFinish: (response) => {
        alert(response.psbtBase64);
      },
      onCancel: () => alert("Canceled"),
    };
    await signTransaction(signPsbtOptions);
  };

  onSignMessageClick = async () => {
    const signMessageOptions = {
      payload: {
        network: {
          type: "Testnet",
        },
        address: this.state.ordinalsAddress,
        message: "Sign Transaction",
      },
      onFinish: (response) => {
        alert(response);
      },
      onCancel: () => alert("Canceled"),
    };
    await signMessage(signMessageOptions);
  }

  onSendBtcClick = async () => {
    const sendBtcOptions = {
      payload: {
        network: {
          type: "Testnet",
        },
        recipients: [
          {
            address: '2NBC9AJ9ttmn1anzL2HvvVML8NWzCfeXFq4',
            amountSats: 1500,
          },
          {
            address: '2NFhRJfbBW8dhswyupAJWSehMz6hN5LjHzR',
            amountSats: 1500,
          },
        ],
        senderAddress: this.state.paymentAddress,
      },
      onFinish: (response) => {
        alert(response);
      },
      onCancel: () => alert("Canceled"),
    };
    await sendBtcTransaction(sendBtcOptions);
  }

  render() {
    return (
      <div style={{ padding: 30 }}>
        Sats Connect Test App
        <div>
          <br />
          {this.state.paymentAddress && (
            <div>Payment Address: {this.state.paymentAddress}</div>
          )}
          {this.state.ordinalsAddress && (
            <div>Ordinals Address: {this.state.ordinalsAddress}</div>
          )}

          <div style={{ background: "lightgray", padding: 30, margin: 10 }}>
            <button
              style={{ height: 30, width: 180 }}
              onClick={this.onConnectClick}
            >
              Connect
            </button>
          </div>

          <div style={{ background: "lightgray", padding: 30, margin: 10 }}>
            <button
              style={{ height: 30, width: 180 }}
              onClick={this.onSignTransactionClick}
            >
              Sign Transaction
            </button>
          </div>

          <div style={{ background: "lightgray", padding: 30, margin: 10 }}>
            <button
              style={{ height: 30, width: 180 }}
              onClick={this.onSignMessageClick}
            >
              Sign message
            </button>
          </div>

          <div style={{ background: "lightgray", padding: 30, margin: 10 }}>
            <button
              style={{ height: 30, width: 180 }}
              onClick={this.onSendBtcClick}
            >
              Send BTC Transaction
            </button>
          </div>
          <br />
        </div>
      </div>
    );
  }
}

export default Dashboard;
