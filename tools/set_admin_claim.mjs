import process from "node:process";

import { initializeApp, applicationDefault, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;

    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }

    args[key] = next;
    i += 1;
  }

  return args;
}

function coerceBoolean(value, defaultValue = true) {
  if (value == null) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

function initAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    return initializeApp({
      credential: cert(JSON.parse(serviceAccountJson))
    });
  }

  return initializeApp({
    credential: applicationDefault()
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = String(args.email || "").trim();
  const adminValue = coerceBoolean(args.admin, true);

  if (!email) {
    throw new Error("Usage: npm run set-admin-claim -- --email <user@example.com> [--admin true|false]");
  }

  initAdminApp();

  const auth = getAuth();
  const user = await auth.getUserByEmail(email);
  const currentClaims = user.customClaims || {};
  const nextClaims = { ...currentClaims };

  if (adminValue) {
    nextClaims.admin = true;
  } else {
    delete nextClaims.admin;
  }

  await auth.setCustomUserClaims(user.uid, nextClaims);

  console.log(`Updated custom claims for ${email}`);
  console.log(`uid: ${user.uid}`);
  console.log(`admin: ${adminValue}`);
  console.log("The user must sign out and sign back in before new claims appear in the client.");
}

main().catch(err => {
  console.error(err.message || err);
  process.exitCode = 1;
});
