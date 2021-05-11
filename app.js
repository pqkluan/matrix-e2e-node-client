require("./polyfill");

const config = require("config");
const sdk = require("matrix-js-sdk");
const { deriveKey } = require("matrix-js-sdk/lib/crypto/key_passphrase");

const userId = config.get("auth.userId");
const passPhrase = config.get("auth.passPhrase");

const client = sdk.createClient({
  baseUrl: config.get("homeserver.url"),
  deviceId: config.get("auth.deviceId"),
  accessToken: config.get("auth.accessToken"),
  userId,

  store: new sdk.MemoryStore({ localStorage: localStorage }),
  sessionStore: new sdk.WebStorageSessionStore(localStorage),
  cryptoStore: new sdk.MemoryCryptoStore(),

  cryptoCallbacks: {
    async getSecretStorageKey({ keys: keyInfos }) {
      // Figure out the storage key id + info
      const tuple = await (async () => {
        const defaultKeyId = await client.getDefaultSecretStorageKeyId();

        if (defaultKeyId && keyInfos[defaultKeyId]) {
          // Use the default SSSS key if set
          return [defaultKeyId, keyInfos[defaultKeyId]];
        }

        // If no default SSSS key is set, fall back to a heuristic of using the only available key, if only one key is set
        const entries = Object.entries(keyInfos);

        if (entries.length > 1) {
          throw new Error("Multiple storage key requests not implemented");
        }

        return entries[0];
      })();

      if (!tuple || !Array.isArray(tuple)) {
        throw new Error("No available key id + info found");
      }

      const [keyId, keyInfo] = tuple;

      const key = await deriveKey(
        passPhrase,
        keyInfo.passphrase.salt,
        keyInfo.passphrase.iterations
      );

      return [keyId, key];
    },
  },
});

function log(...params) {
  console.log("=== NODE_APP ===", ...params);
}

client.once("sync", (state) => {
  if (state !== "PREPARED") return;
  log("Sync completed");

  client.on("Room.timeline", async (event, room) => {
    const eventType = event.getType();

    switch (eventType) {
      case "m.room.message": {
        console.log(
          "(%s) %s: %s",
          room.name,
          event.getSender(),
          event.getContent().body
        );
        break;
      }
      case "m.room.encrypted": {
        const decryptedEvent = await client._crypto.decryptEvent(event);
        console.log(
          "(%s) %s: %s",
          room.name,
          event.getSender(),
          decryptedEvent.clearEvent.content.body
        );
        break;
      }
      case "m.presence":
      case "m.fully_read":
      case "m.receipt":
      case "m.typing": {
        // Do nothing
        break;
      }
      default: {
        console.log(eventType);
      }
    }
  });
});

async function start() {
  await client.initCrypto();
  log("initCrypto completed");

  await client.startClient();
  log("startClient completed");

  // TODO: check for the need of recovery

  try {
    const backupInfo = await client.getKeyBackupVersion();
    log("backupInfo", backupInfo);

    await client.bootstrapSecretStorage();
    log("bootstrapSecretStorage completed");

    client.enableKeyBackup(backupInfo);

    const response = await client.checkKeyBackup();
    log("checkKeyBackup", response);

    const recoverInfo = await client.restoreKeyBackupWithCache(
      undefined,
      undefined,
      response.backupInfo
    );
    log("restoreKeyBackupWithCache", recoverInfo);

    if (recoverInfo.total > recoverInfo.imported) {
      log("Not all sessions recovered");
    } else {
      log("Recovered finished");
    }
  } catch (error) {
    log("Failed to recover");
    console.error(error);
  }
}

start();
