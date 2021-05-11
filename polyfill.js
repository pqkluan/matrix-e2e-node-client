function isFalsy(obj) {
  return typeof obj === "undefined" || obj === null;
}

const LocalStorage = require("node-localstorage").LocalStorage;
localStorage = new LocalStorage("./.scratch");

if (isFalsy(global.crypto)) {
  global.crypto = require("crypto").webcrypto;
}

if (isFalsy(global.TextEncoder) || isFalsy(global.TextDecoder)) {
  const { TextEncoder, TextDecoder } = require("text-encoding");
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

if (isFalsy(global.Olm)) {
  global.Olm = require("olm");
}
